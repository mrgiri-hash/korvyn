/**
 * Offline verification of the Sloane reasoning service — NO provider call, NO credits.
 *
 * A local HTTP server stands in for the provider's Messages endpoint, so the REAL
 * AnthropicSloaneAdapter (request shape, structured-output parsing, refusal, truncation, auth,
 * validation) is exercised end to end. Run: npx tsx src/sloane/dryrun.ts
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AnthropicSloaneAdapter, MockLLMAdapter } from './adapter.js';
import { loadSloaneConfig } from './config.js';
import { validateInterpretation, validatePlan, validateNarrative, structuredOutputProblems, INTERPRETATION_SCHEMA, NARRATIVE_SCHEMA, planSchema } from './schema.js';
import { SloaneOrchestrator } from './orchestrator.js';

type Scenario = { status?: number; stop?: string; text?: string };
let scenario: Scenario = {};
/** a queue of responses for a multi-call orchestrator turn; empty → scenario */
const queue: Scenario[] = [];
let converseReply: Record<string, unknown> = { conversationIntent: 'FINANCIAL_QUESTION', requiresTool: true, reply: null, unsupportedOperation: null, confidence: 0.9 };
let lastBody: Record<string, unknown> | null = null;

const fake = createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    lastBody = JSON.parse(b || '{}');
    /* the fake is as strict as the live API about the output schema: the defect that reached the live API was a
       schema this endpoint used to accept without looking */
    const sch = ((lastBody?.['output_config'] as Record<string, unknown> | undefined)?.['format'] as Record<string, unknown> | undefined)?.['schema'];
    const probs = sch ? structuredOutputProblems(sch) : [];
    if (probs.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format.schema: Invalid schema: ' + probs[0] } }));
      return;
    }
    /* the conversational front door is answered here, off the queue: by default every turn needs a tool */
    const isConv = JSON.stringify(sch ?? {}).includes('conversationIntent');
    const cur = isConv ? { text: JSON.stringify(converseReply) } : queue.length ? queue.shift()! : scenario;
    if (cur.status && cur.status !== 200) {
      res.writeHead(cur.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'x' } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'request-id': 'req_fake_1' });
    res.end(JSON.stringify({
      id: 'msg_fake', type: 'message', role: 'assistant', model: 'fake', stop_reason: cur.stop ?? 'end_turn', stop_sequence: null, stop_details: null,
      content: [{ type: 'text', text: cur.text ?? '' }],
      usage: { input_tokens: 812, output_tokens: 140, cache_read_input_tokens: 700, cache_creation_input_tokens: 0 },
    }));
  });
});

const INTERP = {
  intent: 'UNDERSTAND', requestedObject: { type: 'INCOME_STATEMENT', id: null, name: 'Income statement' }, operation: 'VIEW',
  period: null, periodRange: { start: '2026-01', end: '2026-04' }, comparisonPeriod: null, comparisonBasis: null, scope: null,
  dimensions: [], filters: [], minAbsAmount: null, topN: null, outputPreference: 'MONTHLY_COLUMNS', continuity: 'NEW_OBJECT',
  needsClarification: true, clarificationFields: ['scope'], multiStep: false, confidence: 0.94,
};

const results: { name: string; pass: boolean; got: string }[] = [];
const check = (name: string, pass: boolean, got: unknown) => results.push({ name, pass, got: typeof got === 'string' ? got : JSON.stringify(got) });

async function main(): Promise<void> {
  await new Promise<void>((r) => fake.listen(0, r));
  const port = (fake.address() as AddressInfo).port;
  process.env['ANTHROPIC_BASE_URL'] = `http://127.0.0.1:${port}`;
  process.env['ANTHROPIC_API_KEY'] = 'dryrun-not-a-real-key';

  /* config */
  check('config: no credentials and no provider → mock', loadSloaneConfig({}).provider === 'mock', loadSloaneConfig({}).provider);
  check('config: credentials present → anthropic, claude-opus-5', loadSloaneConfig({ ANTHROPIC_API_KEY: 'x' }).model === 'claude-opus-5', loadSloaneConfig({ ANTHROPIC_API_KEY: 'x' }));
  check('config: SLOANE_LLM_PROVIDER=mock wins over a key', loadSloaneConfig({ ANTHROPIC_API_KEY: 'x', SLOANE_LLM_PROVIDER: 'mock' }).provider === 'mock', 'mock');

  /* validators */
  check('schema: the example interpretation validates', validateInterpretation(INTERP).ok, validateInterpretation(INTERP));
  const bad = validateInterpretation({ ...INTERP, period: 'June', extra: 1, confidence: 4 });
  check('schema: bad period, unexpected field and out-of-range confidence are all rejected', !bad.ok && bad.errors.length >= 3, bad);
  const inv = validatePlan({ rationale: 'r', steps: [{ tool: 'deleteLedger', purpose: 'p', dependsOn: [], args: [] }] }, ['getAccountAnalysis'], 8);
  check('schema: a plan naming a tool outside the allowlist is rejected', !inv.ok, inv);
  const fwd = validatePlan({ rationale: 'r', steps: [{ tool: 'getAccountAnalysis', purpose: 'p', dependsOn: [1], args: [] }] }, ['getAccountAnalysis'], 8);
  check('schema: a step depending on a later step is rejected', !fwd.ok, fwd);
  const nar = validateNarrative({ sentences: [{ text: 'x', objectIds: ['FO-9'], factKeys: ['invented'] }] }, ['FO-1'], ['movement']);
  check('schema: a narrative citing an unknown object or fact is rejected', !nar.ok, nar);
  const probs = [structuredOutputProblems(INTERPRETATION_SCHEMA), structuredOutputProblems(planSchema(['getIncomeStatement'])), structuredOutputProblems(NARRATIVE_SCHEMA)];
  check('schema: all three output schemas are structured-output compatible', probs.every((p) => !p.length), probs);
  const legacy = structuredOutputProblems({ type: 'object', additionalProperties: false, required: ['t'], properties: { t: { type: ['string', 'null'], enum: ['A', null] } } });
  check('schema: the checker rejects the type-array + enum shape the live API refused', legacy.some((p) => p.includes('type array combined with enum')), legacy);

  /* the real adapter against the fake endpoint */
  const cfg = { ...loadSloaneConfig({ ANTHROPIC_API_KEY: 'x' }), timeoutMs: 5000 };
  const a = new AnthropicSloaneAdapter(cfg);
  const input = { request: 'Show monthly income statement Jan-Apr', context: {}, candidates: [], workingPeriod: '2026-06', availablePeriods: ['2026-01'] };

  scenario = { text: JSON.stringify(INTERP) };
  const ok = await a.interpret(input);
  check('adapter: valid structured output → ok with usage', ok.status === 'ok' && !!ok.usage && ok.usage.cacheReadTokens === 700, ok);
  const body = lastBody as Record<string, unknown> | null;
  const oc = body?.['output_config'] as Record<string, unknown> | undefined;
  check('adapter: request uses structured output, adaptive thinking, cached system prompt and default fallbacks',
    !!body && (oc?.['format'] as Record<string, unknown>)?.['type'] === 'json_schema' && (body['thinking'] as Record<string, unknown>)?.['type'] === 'adaptive'
    && body['fallbacks'] === 'default' && JSON.stringify(body['system']).includes('ephemeral') && body['model'] === 'claude-opus-5', { model: body?.['model'], fallbacks: body?.['fallbacks'] });
  check('adapter: the request data is wrapped as enterprise data', JSON.stringify(body?.['messages']).includes('<enterprise_data>'), 'wrapped');
  const sent = (oc?.['format'] as Record<string, unknown> | undefined)?.['schema'];
  check('adapter: the schema actually sent is structured-output compatible', !!sent && structuredOutputProblems(sent).length === 0, sent ? structuredOutputProblems(sent) : 'no schema');

  scenario = { text: '{"intent":"UNDERSTAND"}' };
  const partial = await a.interpret(input);
  check('adapter: schema-invalid output → invalid_output, never passed through', partial.status === 'error' && partial.code === 'invalid_output', partial);

  scenario = { text: 'Sure! Here is the income statement…' };
  const prose = await a.interpret(input);
  check('adapter: prose instead of JSON → invalid_output', prose.status === 'error' && prose.code === 'invalid_output', prose);

  scenario = { stop: 'refusal', text: '' };
  const ref = await a.interpret(input);
  check('adapter: refusal stop reason → refused, content not read', ref.status === 'error' && ref.code === 'refused', ref);

  scenario = { status: 401 };
  const auth = await a.interpret(input);
  check('adapter: 401 → auth error with no credential detail', auth.status === 'error' && auth.code === 'auth' && !JSON.stringify(auth).includes('dryrun-not-a-real-key'), auth);

  scenario = { text: JSON.stringify({ rationale: 'r', steps: [{ tool: 'runSql', purpose: 'p', dependsOn: [], args: [] }] }) };
  const plan = await a.plan({ request: 'x', interpretation: INTERP as never, context: {}, tools: [{ id: 'getAccountAnalysis', description: 'd', requiredInputs: [], optionalInputs: [] }], maxSteps: 8 });
  check('adapter: a model plan inventing a tool is rejected at the service', plan.status === 'error' && plan.code === 'invalid_output', plan);

  const planSent = ((lastBody?.['output_config'] as Record<string, unknown>)?.['format'] as Record<string, unknown>)?.['schema'];
  check('adapter: the plan schema enumerates exactly the allowlisted tools', JSON.stringify(planSent).includes('"enum":["getAccountAnalysis"]'), 'tool enum');

  /* the server-side orchestrator, through the real adapter, against the strict fake endpoint */
  const orch = new SloaneOrchestrator(a, cfg);
  const Q = 'What did the monthly income statement look like from January through April?';
  queue.push({ text: JSON.stringify({ ...INTERP, confidence: 0.93 }) });
  const t1 = await orch.turn({ sessionId: 'dryrun-session-1', request: Q, context: { scope: 'forged' } } as never);
  const tr1 = orch.trace(t1.traceId)!;
  check('orchestrator: a range with no reliable scope → CLARIFICATION_REQUIRED, no tool executed', t1.state === 'CLARIFICATION_REQUIRED' && t1.clarification?.field === 'scope' && tr1.toolsExecuted.length === 0, t1);
  check('orchestrator: a browser-supplied context is ignored', tr1.resolution?.scopeId === null, 'ignored');
  /* Phase 6: a single statement read is planned by Korvyn's deterministic planner — no DEEP plan call is spent on it */
  queue.push({ text: JSON.stringify({ sentences: [
    { text: 'The income statement covers the four months.', objectIds: ['FO-1'], factKeys: ['FO-1.periods'] },
    { text: 'Management expects a further $412.0M next month.', objectIds: ['FO-1'], factKeys: [] } ] }) });
  const t2 = await orch.turn({ sessionId: 'dryrun-session-1', clarification: { pendingId: t1.clarification!.pendingId, optionId: 'scope:GROUP' } });
  const tr2 = orch.trace(t2.traceId)!;
  check('orchestrator: answering the question executes getIncomeStatement server-side', t2.state === 'ANSWER' && tr2.toolsExecuted[0]?.tool === 'getIncomeStatement' && tr2.toolsExecuted[0]?.status === 'COMPLETED' && t2.objects[0]?.type === 'IncomeStatement', { state: t2.state, tools: tr2.toolsExecuted, notes: t2.notes });
  check('orchestrator: Jan–Apr resolves to four governed monthly columns', t2.objects[0]?.table.columns.join('|') === 'Jan 2026|Feb 2026|Mar 2026|Apr 2026', t2.objects[0]?.table.columns);
  check('orchestrator: an invented figure in the narrative is rejected by grounding', tr2.narrative.rejected.some((r) => r.text.includes('412.0')) && !t2.narrative.some((n) => n.text.includes('412.0')), tr2.narrative);
  const reviewer = { id: 'u', name: 'u', role: 'FINANCE_REVIEWER', permissions: ['FINANCIALS_VIEW' as const], scopeIds: 'ALL' as const };
  const v = orch.planner.validate([{ tool: 'postJournalEntry', purpose: 'p', dependsOn: [], args: [] }, { tool: 'deleteLedger', purpose: 'p', dependsOn: [], args: [] }], orch.planner.allowlist(reviewer, null, 'income statement', orch.context.initial(reviewer)).tools, reviewer, orch.context.initial(reviewer));
  check('orchestrator: a GOVERNED write tool and an invented tool are both rejected', v.steps.length === 0 && v.rejected.length === 2 && v.rejected[0]!.why.includes('write actions are disabled'), v.rejected);
  check('orchestrator: a single statement read → deterministic plan, no plan call, answered scope GROUP', tr2.plan.source === 'deterministic' && !tr2.calls.some((c) => c.stage === 'plan') && tr2.toolsExecuted[0]?.args['scope'] === 'GROUP', { plan: tr2.plan.source, calls: tr2.calls.map((c) => c.stage) });
  check('orchestrator: interpretation goes to the FAST route, narration to NARRATE', tr2.calls.filter((c) => c.stage === 'narrate').every((c) => c.route === 'NARRATE') && orch.trace(t1.traceId)!.calls.every((c) => c.route === 'FAST'), [...tr1.calls, ...tr2.calls].map((c) => `${c.stage}@${c.route}`));
  /* a broad, multi-part request is planned by the DEEP model; its $ctx references resolve server-side */
  queue.push({ text: JSON.stringify({ ...INTERP, intent: 'REVIEW', multiStep: true, requestedObject: { type: 'INCOME_STATEMENT', id: null, name: 'income statement' }, confidence: 0.9 }) });
  queue.push({ text: JSON.stringify({ rationale: 'review', steps: [{ tool: 'getIncomeStatement', purpose: 'Income statement', dependsOn: [], args: [
    { name: 'periodStart', value: '$ctx.periodStart', valueType: 'ref' }, { name: 'periodEnd', value: '$ctx.periodEnd', valueType: 'ref' }, { name: 'scope', value: '$ctx.scope', valueType: 'ref' }] }] }) });
  queue.push({ text: JSON.stringify({ sentences: [{ text: 'The review covers the four months.', objectIds: ['FO-1'], factKeys: [] }] }) });
  const t2b = await orch.turn({ sessionId: 'dryrun-session-1', request: 'Review that income statement and tell me everything that needs attention.' });
  const tr2b = orch.trace(t2b.traceId)!;
  check('orchestrator: a multi-part review → DEEP plan; $ctx references resolved; scope GROUP', tr2b.plan.source === 'reasoning' && tr2b.route === 'DEEP' && tr2b.calls.find((c) => c.stage === 'plan')?.route === 'DEEP' && tr2b.toolsExecuted[0]?.args['scope'] === 'GROUP', { plan: tr2b.plan.source, route: tr2b.route, calls: tr2b.calls.map((c) => `${c.stage}@${c.route}`), tools: tr2b.toolsExecuted });
  converseReply = { conversationIntent: 'GENERAL_CONVERSATION', requiresTool: false, reply: 'Hi. What can I help you with?', unsupportedOperation: null, confidence: 0.95 };
  const th = await orch.turn({ sessionId: 'dryrun-session-9', request: 'hello' });
  const trh = orch.trace(th.traceId)!;
  check('orchestrator: "hello" reaches the conversational model and is answered with no tool', th.reply === 'Hi. What can I help you with?' && trh.route === 'CONVERSATION' && trh.calls.some((c) => c.stage === 'converse' && c.status === 'ok') && trh.toolsExecuted.length === 0 && !trh.calls.some((c) => c.stage === 'plan'), { reply: th.reply, route: trh.route, calls: trh.calls.map((c) => c.stage) });
  converseReply = { conversationIntent: 'FINANCIAL_QUESTION', requiresTool: true, reply: null, unsupportedOperation: null, confidence: 0.9 };
  const scoped = new SloaneOrchestrator(new MockLLMAdapter(), cfg, () => ({ id: 'u2', name: 'u2', role: 'ENTITY_ACCOUNTANT', permissions: ['FINANCIALS_VIEW'], scopeIds: ['MDH'] }));
  const t3 = await scoped.turn({ sessionId: 'dryrun-session-2', request: 'Show the consolidated group income statement for March' });
  check('orchestrator: permissions are enforced server-side (entity-scoped actor refused the group)', t3.state === 'UNAVAILABLE' && t3.objects.length === 0 && t3.notes.some((n) => n.includes('may not view scope GROUP')), { state: t3.state, notes: t3.notes });
  const t4 = await scoped.turn({ sessionId: 'dryrun-session-3', request: 'Show the Meridian DC Holdco LLC income statement for March' });
  check('orchestrator: mock adapter → deterministic interpretation, tools still run server-side', t4.state === 'ANSWER' && t4.mode === 'deterministic' && t4.objects[0]?.scope.id === 'MDH', { state: t4.state, notes: t4.notes });

  const mock = new MockLLMAdapter();
  const m = await mock.interpret();
  check('mock adapter declines, so Korvyn answers deterministically', m.status === 'declined', m);

  fake.close();
  const pass = results.filter((r) => r.pass).length;
  console.log(`Sloane reasoning service dry run: ${pass}/${results.length} pass`);
  for (const r of results) console.log(`${r.pass ? '  PASS  ' : '  FAIL  '}${r.name}${r.pass ? '' : '\n         got: ' + r.got.slice(0, 300)}`);
  process.exitCode = pass === results.length ? 0 : 1;
}

void main();
