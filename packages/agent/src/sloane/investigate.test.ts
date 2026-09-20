/**
 * PHASE 8D — the open-ended financial agent. A scripted model plays the planner and the synthesiser; these tests pin what
 * KORVYN does with its proposals: an objective routes to a durable investigation, each THINK step sees a relevance-ranked
 * READ-only subset, calls are validated like any plan step, a finding carrying a figure no observation held is rejected,
 * budgets stop the loop before it overruns, a material judgment escalates the next step to the deep route, a scoped actor's
 * out-of-scope call is refused without leaking, and steering supersedes calls that have not run yet. No API spend.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { serverActor, toolRegistry, type Actor } from './tools.js';
import { DEV_DIRECTORY, actorContext } from './auth.js';
import type { AgentRunBody } from './agent/model.js';
import type { AgentStepOut, AgentSynthOut } from './schema.js';
import { allowedNumbers, ungrounded } from './agent/investigate.js';

const me = serverActor();
const mdh = actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:mdh')!, null, 'test') as unknown as Actor;
const usage = { inputTokens: 1200, outputTokens: 150, cacheReadTokens: 0, cacheWriteTokens: 0 };
const ok = <T>(value: T, route: string) => ({ status: 'ok' as const, latencyMs: 1, requestId: null, usage, model: route === 'DEEP' ? 'claude-opus-5' : 'claude-sonnet-5', route, value });
const call = (tool: string, args: Record<string, string>, purpose = `Reading ${tool}`) => ({ tool, purpose, progress: purpose, args: Object.entries(args).map(([name, value]) => ({ name, value })) });
const step = (o: Partial<AgentStepOut>): AgentStepOut => ({ goalClass: 'ANOMALY_REVIEW', understanding: 'Look for what is unusual in June.', decision: 'CALL_TOOLS', calls: [], needCapabilities: [], workingNotes: [], openQuestions: [], question: null, options: [], confidence: 0.8, escalate: { needed: false, reason: null, detail: null }, ...o }) as AgentStepOut;
type Ctx = { observations: { ref: string; tool: string; status: string; facts: { key: string; value: string }[] }[]; constraints: { exclude: string[] } };
interface Script { step: (n: number, ctx: Ctx, toolIds: string[], route: string) => AgentStepOut | Promise<AgentStepOut>; synth?: (ctx: Ctx, refs: string[]) => AgentSynthOut }
const synthDefault = (ctx: Ctx, refs: string[]): AgentSynthOut => {
  const fact = ctx.observations.flatMap((o) => o.facts.map((f) => ({ ref: o.ref, f }))).find((x) => /\$/.test(x.f.value));
  return { headline: 'June has open items worth a look.', inspected: ['June close blockers'],
    findings: [...(fact ? [{ statement: `The observation reports ${fact.f.value}.`, kind: 'OBSERVED_FACT' as const, support: 'SUPPORTED' as const, observationRefs: [fact.ref] }] : []),
      { statement: 'Something unexplained moved by $987.65M.', kind: 'INFERENCE' as const, support: 'PARTIALLY_SUPPORTED' as const, observationRefs: refs.slice(0, 1) }],
    unresolved: [], nextSteps: [{ label: 'Close blockers', request: 'What is blocking the June close?' }], confidence: 0.7, escalate: { needed: false, reason: null, detail: null } };
};
/** a model from a script: the front door reads every request as an objective */
function scripted(sc: Script) {
  const log: { routes: string[]; toolIds: string[][]; contexts: Ctx[] } = { routes: [], toolIds: [], contexts: [] };
  const a = new MockLLMAdapter(); Object.defineProperty(a, 'provider', { value: 'scripted' });
  const A = a as unknown as Record<string, unknown>;
  A['converse'] = async () => ok({ conversationIntent: 'INVESTIGATION', requiresTool: true, reply: null, unsupportedOperation: null, confidence: 0.9 }, 'FAST');
  A['agentStep'] = async (i: { context: Ctx; toolIds: string[] }, o: { route: string }) => { log.routes.push(o.route); log.toolIds.push(i.toolIds); log.contexts.push(i.context); return ok(await sc.step(log.routes.length, i.context, i.toolIds, o.route), o.route); };
  A['agentSynth'] = async (i: { context: Ctx; refs: string[] }, o: { route: string }) => ok((sc.synth ?? synthDefault)(i.context, i.refs), o.route);
  return { o: new SloaneOrchestrator(a, { maxPlanSteps: 8 }, () => me), log };
}
let n = 0; const sid = () => `inv-test-${++n}-xxxxxxxx`;
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];
async function settle(o: SloaneOrchestrator, runId: string, actor: Actor, ms = 20000): Promise<AgentRunBody> {
  const t0 = Date.now();
  for (;;) { const b = o.agents.body(runId, actor)!; if (TERMINAL.includes(b.runStatus) || b.runStatus === 'WAITING_FOR_USER' || Date.now() - t0 > ms) return b; await new Promise((r) => setTimeout(r, 50)); }
}
async function start(o: SloaneOrchestrator, actor: Actor, request: string, s = sid()) {
  const r = await o.turn({ sessionId: s, request }, actor);
  const runId = r.objects.find((x) => x.type === 'AgentRun')?.refs['runId'];
  assert.ok(runId, `the objective started a run (got ${r.state} ${o.trace(r.traceId)?.route})`);
  assert.equal(o.trace(r.traceId)?.route, 'AGENT');
  return { runId: runId!, body: await settle(o, runId!, actor), sessionId: s };
}

test('8D loop: an objective routes to an investigation; calls are validated, observed, synthesised; an ungrounded figure is rejected', async () => {
  const { o, log } = scripted({ step: (k) => k === 1
    ? step({ calls: [call('getCloseBlockers', { period: '2026-06' }), call('getIncomeStatement', { periodStart: '2026-05', periodEnd: '2026-06', scope: 'GROUP' })] })
    : step({ decision: 'SYNTHESIZE' }) });
  const { body } = await start(o, me, 'Something seems off with June — dig in.');
  const S = body.investigation!;
  assert.equal(body.runStatus, 'COMPLETED', body.completionReason ?? '');
  assert.equal(body.goal.type, 'INVESTIGATE'); assert.equal(body.goal.objective, 'Something seems off with June — dig in.', 'the objective is kept verbatim');
  assert.deepEqual(S.steps.flatMap((x) => x.calls.map((c) => c.tool)), ['getCloseBlockers', 'getIncomeStatement'], 'the tool sequence the model chose is recorded');
  assert.equal(S.observations.filter((x) => x.status === 'OK').length, 2);
  assert.ok(log.contexts[1]!.observations.length === 2, 'the second THINK step saw both observations');
  assert.ok(S.synthesis!.rejected.some((r) => /987\.65/.test(r.statement)), 'the fabricated figure was rejected');
  assert.ok(!S.synthesis!.findings.some((f) => /987\.65/.test(f.statement)));
  assert.ok(body.result?.investigation?.findings.length, 'the grounded finding survives');
  assert.ok(body.verification?.checks.every((c) => c.ok), JSON.stringify(body.verification?.checks.filter((c) => !c.ok)));
  assert.ok(S.usage.modelCalls >= 3 && S.usage.estimatedCostUsd > 0, 'usage and cost are recorded');
});

test('8D relevance: each THINK step sees at most 20 READ-only tools the actor may use', async () => {
  const { o, log } = scripted({ step: () => step({ decision: 'SYNTHESIZE' }) });
  await start(o, me, 'Scan June for anything that looks wrong.');
  const ids = log.toolIds[0]!;
  assert.ok(ids.length > 0 && ids.length <= 20, `${ids.length} tools shown`);
  for (const id of ids) assert.equal(toolRegistry.get(id)?.risk, 'READ', `${id} is READ`);
});

test('8D budget: the iteration budget stops the loop before the next model call, and the stop is stated', async () => {
  process.env['SLOANE_AGENT_MAX_ITERATIONS'] = '1';
  try {
    const { o, log } = scripted({ step: () => step({ calls: [call('getCloseReadiness', { period: '2026-06' })] }) });
    const { body } = await start(o, me, 'Find what is unusual in June.');
    assert.equal(log.routes.length, 1, 'no second THINK call');
    assert.match(body.investigation!.stopReason ?? '', /iteration budget/);
    assert.equal(body.runStatus, 'COMPLETED');
    assert.ok(body.result!.investigation!.unresolved.some((u) => /stopped early/i.test(u)));
  } finally { delete process.env['SLOANE_AGENT_MAX_ITERATIONS']; }
});

test('8D escalation: a material judgment moves the next step to the deep route, with the reason recorded', async () => {
  const { o, log } = scripted({ step: (k) => k === 1
    ? step({ calls: [call('getCloseBlockers', { period: '2026-06' })], escalate: { needed: true, reason: 'MATERIAL_JUDGMENT', detail: 'a material blocker needs judgment' } })
    : step({ decision: 'SYNTHESIZE' }) });
  const { body } = await start(o, me, 'Tell me whether June is safe to sign off.');
  assert.equal(log.routes[0], 'FAST'); assert.equal(log.routes[1], 'DEEP');
  assert.ok(body.investigation!.escalations.some((e) => e.reason === 'MATERIAL_JUDGMENT'));
});

test('8D permissions: a scoped actor’s call on another entity is refused, and nothing about it reaches the result', async () => {
  const { o } = scripted({ step: (k) => k === 1 ? step({ calls: [call('getTrialBalance', { period: '2026-06', entity: 'REIT' }), call('getCloseReadiness', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' }) });
  const { body } = await start(o, mdh, 'Look across June for anything unusual.');
  const S = body.investigation!;
  const refused = S.rejected.some((r) => r.tool === 'getTrialBalance') || S.observations.some((x) => x.tool === 'getTrialBalance' && x.status !== 'OK');
  assert.ok(refused, 'the out-of-scope call did not run');
  assert.ok(!S.observations.some((x) => x.status === 'OK' && /REIT/.test(JSON.stringify(x))), 'no observation carries the hidden entity');
});

test('8D permissions: a scoped actor sees their own intercompany reconciliation in aggregate — no counterparty is named', async () => {
  const { o } = scripted({ step: (k) => k === 1 ? step({ calls: [call('getReconciliation', { reconciliationId: 'REC-MDH-13100', period: '2026-06' }), call('getCloseExceptions', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' }) });
  const { body } = await start(o, mdh, 'Look into why the MDH intercompany position looks off in June.');
  const obs = body.investigation!.observations.filter((x) => x.status === 'OK');
  assert.equal(obs.length, 2, JSON.stringify(body.investigation!.rejected));
  const text = JSON.stringify(obs);
  assert.ok(!/MER-(UK|DE|SG)|NS-UK|JDE-APAC/.test(text), 'no hidden entity or its source system is named');
  assert.ok(/outside your access/.test(text), 'the withheld detail is stated, not silently dropped');
});

test('8D steering: an instruction supersedes calls that have not run, and the next step replans with it', async () => {
  let o!: SloaneOrchestrator; let runRef: AgentRunBody | null = null; const s = sid();
  const sc = scripted({ step: (k) => {
    if (k === 1) { runRef = o.agents.activeFor(s, me); if (runRef) runRef.options = { ...runRef.options, pace: 400 }; return step({ calls: [call('getCloseBlockers', { period: '2026-06' }), call('getIncomeStatement', { periodStart: '2026-05', periodEnd: '2026-06', scope: 'GROUP' })] }); }
    return step({ decision: 'SYNTHESIZE' });
  } });
  o = sc.o;
  const turn = o.turn({ sessionId: s, request: 'Walk me through what stands out in June.' }, me);
  const t0 = Date.now();
  while (!runRef && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 20));
  const runId = (runRef as AgentRunBody | null)?.runId; assert.ok(runId);
  while (!o.agents.body(runId!, me)!.graph.tasks.some((t) => /^x1-/.test(t.taskId)) && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 20));
  const st = o.agents.steer(runId!, me, 'Ignore the income statement.');
  assert.ok(st.recognised, st.effect);
  const b1 = o.agents.body(runId!, me)!; b1.options = { ...b1.options, pace: 0 };
  const body = await settle(o, runId!, me); await turn;
  const superseded = body.graph.tasks.filter((t) => /^x1-/.test(t.taskId) && t.failureMode === 'SUPERSEDED');
  assert.ok(superseded.length >= 1, 'at least one pending call was superseded');
  assert.ok(body.graph.tasks.some((t) => /~s1$/.test(t.taskId)), 'a replanning step was added');
  assert.equal(body.steering.length, 1);
  assert.ok(sc.log.contexts.at(-1)!.constraints.exclude.length >= 1, 'the replanning step saw the exclusion');
  assert.equal(body.runStatus, 'COMPLETED');
});

test('8D grounding: a governed policy figure may be cited; a sum the model computed may not', () => {
  const allowed = allowedNumbers([{ ref: 'O1', step: 1, tool: 't', purpose: '', status: 'OK', objectId: 'x', type: 'T', title: 'AR', period: '2026-06', scope: 'GROUP', facts: [{ key: 'a', label: 'AR', value: '$10.53M' }, { key: 'b', label: 'AP', value: '$5.93M' }], columns: [], rows: [], rowCount: 0, population: null, refs: {}, note: null, chars: 0 }]);
  assert.deepEqual(ungrounded('well above the $1,000 tie tolerance and the $1M materiality', allowed), []);
  assert.deepEqual(ungrounded('together $16.46M of unexplained movement', allowed), ['16.46M']);
});
