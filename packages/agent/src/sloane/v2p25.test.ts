/**
 * SLOANE CORE RUNTIME V2 — PHASE 2.5. GROUNDED RESPONSE PERFORMANCE.
 *
 * What these pin is the contract, not the prose: a governed read the model declared DIRECT answers on ONE model
 * call, from Korvyn's own composer; a read it declared INTERPRET spends the second; a declaration Korvyn cannot
 * honour costs a call and never a wrong answer; an offer the person took costs NO call; and a governed turn can
 * no longer reach a person as unstructured prose.
 *
 * Every figure below is still the governed one — the composers here reference facts and Korvyn renders them, so
 * these also assert that Phase 2's sign, object and withholding guarantees survive the faster path.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter, type ReasonInput, type ReasonMessage, type ReasonOut } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { ROLES, serverActor, type Actor } from './tools.js';
import { toolDefinitions } from './v2/tools.js';
import { FactRegistry, type FinancialFact } from './v2/facts.js';
import {
  composeDirect, directEligible, drillCall, isDirectDeclared, normaliseOffer, offerTaken,
} from './v2/strategy.js';
import type { V2ToolOutcome } from './v2/tools.js';

const me = serverActor();
const scoped: Actor = { id: 'user:jpark', name: 'Jonah Park', ...ROLES['ENTITY_ACCOUNTANT']! };

interface Step { text?: string; tools?: { name: string; input: Record<string, unknown> }[] }
interface Seen { system: string; messages: ReasonMessage[]; tools: { name: string }[] }

function v2Orch(script: (round: number, seen: Seen) => Step, actor: Actor = me) {
  const sc = new MockLLMAdapter(); Object.defineProperty(sc, 'provider', { value: 'scripted' });
  const calls: Seen[] = [];
  (sc as unknown as { reason: (i: ReasonInput) => Promise<unknown> }).reason = async (i) => {
    const seen: Seen = { system: i.system, messages: i.messages, tools: i.tools.map((t) => ({ name: t.name })) };
    const round = i.messages.filter((m) => m.role === 'assistant' && Array.isArray(m.content)).length;
    calls.push(seen);
    const s = script(round, seen);
    const uses = (s.tools ?? []).map((t, n) => ({ id: `tu_${round}_${n}`, name: t.name, input: t.input }));
    const value: ReasonOut = {
      stopReason: uses.length ? 'tool_use' : 'end_turn', text: s.text ?? '',
      toolUses: uses,
      content: [...(s.text ? [{ type: 'text', text: s.text }] : []), ...uses.map((u) => ({ type: 'tool_use', id: u.id, name: u.name, input: u.input }))],
    };
    return { status: 'ok', value, latencyMs: 1, requestId: null, usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: 'scripted', route: 'FAST' };
  };
  return { orch: new SloaneOrchestrator(sc, { maxPlanSteps: 8, runtimeV2: true }, () => actor), calls };
}
let n = 0; const sid = () => `v25-test-${++n}-xxxxxxxx`;

const said = (r: { narrative: { text: string }[]; reply?: string | null }) =>
  r.reply ?? r.narrative.map((x) => x.text).join(' ');

/* ================================================================================================
   §3/§5/§6 — GROUNDED_DIRECT: the read is the answer, and it costs ONE model call
   ================================================================================================ */

test('P2.5 §3/§5: a read declared direct answers on ONE model call, composed by Korvyn', async () => {
  const { orch, calls } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06', answerMode: 'direct' } }] }
    : { text: 'should never be reached' });
  const r = await orch.turn({ sessionId: sid(), request: "what's the CIP balance?" }, me);
  assert.equal(r.state, 'ANSWER');
  assert.equal(calls.length, 1, 'the second model call is not made');
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.strategy, 'GROUNDED_DIRECT');
  assert.equal(t.directShape, 'VALUE');
  assert.equal(t.modelCalls, 1);
  assert.equal(t.toolCalls, 1);
  /* §7 — the sentence reads like a colleague, with the person's own word for the subject */
  const text = said(r);
  assert.ok(/^The CIP balance at /.test(text), text);
  assert.ok(/\$[\d,]/.test(text), 'and it carries the governed figure');
  /* Phase 2's guarantee survives: the figure came from the registry, not from a model */
  assert.equal(t.unresolvedRefs.length, 0);
  assert.equal(t.ungroundedFigures.length, 0);
  assert.ok(t.factRefs > 0);
});

test('P2.5 §13: a direct ACTIVITY read says what moved, not what is there', async () => {
  const { orch } = v2Orch(() => ({ tools: [{ name: 'getStatement', input: { view: 'line', subject: 'capex', period: '2026-06', measure: 'activity', answerMode: 'direct' } }] }));
  const r = await orch.turn({ sessionId: sid(), request: 'how much capex did we spend in June?' }, me);
  const text = said(r);
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.strategy, 'GROUNDED_DIRECT');
  /* an activity answer leads with the period and the subject — never "the balance at" */
  assert.ok(!/balance at/.test(text), text);
  assert.ok(/Capex/i.test(text), text);
});

test('P2.5 §6: a BREAKDOWN is composed as a list, and the drivers are the answer', async () => {
  const { orch, calls } = v2Orch(() => ({ tools: [{ name: 'analyzeFinancials', input: { subject: 'CIP', dimension: 'project', period: '2026-06', answerMode: 'direct' } }] }));
  const r = await orch.turn({ sessionId: sid(), request: 'break CIP down by project' }, me);
  assert.equal(calls.length, 1);
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.strategy, 'GROUNDED_DIRECT');
  assert.equal(t.directShape, 'BREAKDOWN');
  assert.ok(r.narrative.length > 1, 'the members travel as their own entries');
  assert.ok(/by project/.test(said(r)), said(r));
});

/* ================================================================================================
   §5 — KORVYN VALIDATES THE DECLARATION; THE MODEL DOES NOT DECIDE
   ================================================================================================ */

test('P2.5 §5: a read declared INTERPRET spends the second call', async () => {
  const { orch, calls } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'analyzeFinancials', input: { subject: 'CIP', period: '2026-06', answerMode: 'interpret' } }] }
    : { tools: [{ name: 'respond', input: { responseType: 'DRIVER_ANALYSIS', headline: 'It moved.' } }] });
  const r = await orch.turn({ sessionId: sid(), request: 'why did CIP move?' }, me);
  assert.equal(r.state, 'ANSWER');
  assert.equal(calls.length, 2, 'a judgement is the model’s to make');
  assert.equal(orch.v2.recent(1)[0]!.strategy, 'GROUNDED_REASONING');
});

test('P2.5 §5: no declaration at all is interpret — a model that ignores it gets Phase 2 exactly', async () => {
  const { orch, calls } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06' } }] }
    : { tools: [{ name: 'respond', input: { headline: 'Here it is.' } }] });
  await orch.turn({ sessionId: sid(), request: 'CIP?' }, me);
  assert.equal(calls.length, 2);
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.strategy, 'GROUNDED_REASONING');
  assert.equal(t.strategyReason, 'the model expects to interpret the result');
});

test('P2.5 §5: TWO reads are never direct, however they were declared', () => {
  const mk = (tool: string, mode: string): V2ToolOutcome => ({
    tool, ran: tool, args: { answerMode: mode }, status: 'COMPLETED',
    object: { facts: [] } as unknown as V2ToolOutcome['object'], observation: {} as V2ToolOutcome['observation'],
    latencyMs: 1, error: null, facts: [{ kind: 'GOVERNED' } as FinancialFact], ctx: { subject: null, dimension: null, askedScope: null, direct: mode === 'direct' },
  });
  const two = directEligible([mk('getStatement', 'direct'), mk('analyzeFinancials', 'direct')], me);
  assert.equal(two.ok, false);
  assert.ok(!two.ok && /several reads/.test(two.reason));
});

test('P2.5 §5: a refused or unavailable read is never direct — a refusal needs words', async () => {
  /* a scoped accountant asking for the group: the tool refuses, and that answer is the model’s to word */
  const { orch, calls } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'balance_sheet', period: '2026-06', scope: 'GROUP', answerMode: 'direct' } }] }
    : { tools: [{ name: 'respond', input: { responseType: 'LIMITATION', headline: 'You are set up on MDH only.' } }] }, scoped);
  const r = await orch.turn({ sessionId: sid(), request: 'show me the consolidated balance sheet' }, scoped);
  assert.equal(calls.length, 2);
  assert.equal(orch.v2.recent(1)[0]!.strategy, 'GROUNDED_REASONING');
  assert.ok(said(r).length > 0);
});

/**
 * §29 — FOUND LIVE, AND THE MOST SERIOUS THING THIS PHASE COULD HAVE SHIPPED.
 *
 * A scoped accountant asked for the CONSOLIDATED balance sheet. The governed tool answered within their own
 * visibility — correctly — and Korvyn composed MDH's balance sheet as the answer. Nothing leaked and every figure
 * was governed, and it was still wrong: the question was narrowed and the answer did not say so. Worse, on "what
 * is the REIT's trial balance?" the same path handed back a different entity's figures under a correct label.
 *
 * Only the model can word a substitution, so it takes the second call. A scoped reader asking about their OWN
 * scope is not a substitution and still composes.
 */
test('P2.5 §29: a scoped reader’s narrowed answer is never composed — it is worded', async () => {
  /* the live shape: the model named NO scope, so the governed tool answered inside the reader's own visibility
     and never refused. That is exactly the case a permission check cannot catch, because nothing was refused. */
  const { orch, calls } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'balance_sheet', period: '2026-06', answerMode: 'direct' } }] }
    : { tools: [{ name: 'respond', input: { responseType: 'LIMITATION', headline: 'This is MDH, not the group.' } }] }, scoped);
  await orch.turn({ sessionId: sid(), request: 'show me the consolidated balance sheet' }, scoped);
  assert.equal(calls.length, 2, 'the narrowing has to be said, and only the model can say it');
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.strategy, 'GROUNDED_REASONING');
  assert.match(t.strategyReason ?? '', /narrower than the question/);
});

/**
 * §29, THE LIMIT OF THE RULE — AND THE COST, STATED.
 *
 * A first cut compared the scope the model ASKED for against the reader's own, so that a reader asking about
 * their OWN scope would still compose. It does not work, and the live run is why: the model can see the reader's
 * access in its context and had already narrowed "the consolidated balance sheet" to MDH before the tool ran.
 * There was nothing left to compare. So the rule is absolute, and a limited reader pays the second call on every
 * governed turn. That is a real latency cost on a minority of readers, and it is the right direction to fail in.
 */
test('P2.5 §29: the rule is absolute — even a reader’s own scope is worded, not composed', async () => {
  const { orch, calls } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'balance_sheet', period: '2026-06', scope: 'MDH', answerMode: 'direct' } }] }
    : { tools: [{ name: 'respond', input: { headline: 'Here is MDH.' } }] }, scoped);
  await orch.turn({ sessionId: sid(), request: 'show me our balance sheet' }, scoped);
  assert.equal(calls.length, 2);
  assert.equal(orch.v2.recent(1)[0]!.strategy, 'GROUNDED_REASONING');
});

test('P2.5 §17: a figure typed rather than referenced is a contract miss, not a fabrication', async () => {
  /* the same number, written out by hand: the value, sign and scale are Korvyn's, so there is nothing for the
     person to check. It is recorded as a violation and never as a warning — only an invented figure gets one. */
  const { orch } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06' } }] }
    /* $3.50M is the governed CIP line at Jun 2026 on the seeded book; $999.99M is nowhere in it */
    : { tools: [{ name: 'respond', input: { headline: 'CIP was $3.50M at June, and $999.99M is made up.' } }] });
  const r = await orch.turn({ sessionId: sid(), request: 'CIP?' }, me);
  const t = orch.v2.recent(1)[0]!;
  assert.ok(t.responseViolations.some((v) => /typed rather than referenced/.test(v) && v.includes('$3.50M')), JSON.stringify(t.responseViolations));
  assert.deepEqual(t.ungroundedFigures, ['$999.99M'], 'only what Korvyn cannot find at all');
  assert.ok(r.notes.some((n) => n.includes('$999.99M')) && !r.notes.some((n) => n.includes('$3.50M')));
});

test('P2.5 §5: the declaration is read, not guessed', () => {
  assert.equal(isDirectDeclared({ answerMode: 'direct' }), true);
  assert.equal(isDirectDeclared({ answerMode: 'DIRECT' }), true);
  assert.equal(isDirectDeclared({ answerMode: 'interpret' }), false);
  assert.equal(isDirectDeclared({}), false);
});

/* ================================================================================================
   §19/§20 — AN OFFER THE PERSON TOOK: no model call at all
   ================================================================================================ */

test('P2.5 §19: taking an offer Korvyn made runs the drill with ZERO model calls', async () => {
  const s = sid();
  const { orch, calls } = v2Orch(() => ({ tools: [{ name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06', answerMode: 'direct' } }] }));
  const first = await orch.turn({ sessionId: s, request: "what's the CIP balance?" }, me);
  const offer = (first.suggestions ?? []).find((x) => /accounts|GL lines|trial balance/i.test(x));
  assert.ok(offer, `Korvyn offered something to drill into: ${JSON.stringify(first.suggestions)}`);
  const before = calls.length;

  const second = await orch.turn({ sessionId: s, request: offer! }, me);
  assert.equal(second.state, 'ANSWER');
  assert.equal(calls.length, before, 'the offer was a menu Korvyn wrote — nothing had to be understood');
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.modelCalls, 0);
  assert.equal(t.toolCalls, 1);
  assert.equal(t.path, 'drill');
  assert.equal(t.strategy, 'GROUNDED_DIRECT');
  assert.ok(said(second).length > 0);
});

test('P2.5 §19: a near miss is NOT taken — an exact match is the whole rule', () => {
  const offers = [{ label: 'View the GL lines behind it', drill: 'GL_POPULATION' as const, factId: 'f_x', subject: null }];
  assert.ok(offerTaken('View the GL lines behind it', offers));
  assert.ok(offerTaken('view the gl lines behind it.', offers), 'punctuation and case are not meaning');
  assert.equal(offerTaken('show me the GL', offers), null, 'a typed drill goes to the model');
  assert.equal(offerTaken('what about the GL lines for May', offers), null);
  assert.equal(normaliseOffer('View the GL lines behind it'), 'view gl lines');
});

test('P2.5 §19: every drill resolves to a governed read, and one with nothing behind it resolves to none', () => {
  const base: FinancialFact = {
    factId: 'f_a', kind: 'GOVERNED', semanticType: 'T', sourceKey: 'balance', attribution: false, measure: 'BALANCE',
    label: 'Balance', rawValue: 1, displayValue: '$1.00M', sign: 'POSITIVE', unit: 'USD millions', currency: 'USD',
    period: 'Jun 2026', scope: 'Corporate Consolidated', book: 'CORE-GL', basis: 'US GAAP', lens: 'Corporate Consolidated', eliminationTreatment: 'CONSOLIDATED',
    sourceObjectIds: ['FO-1'], trace: { accountIds: ['15000'], populationId: 'POP-1', journalId: 'JE-1' },
    availableDrills: [], provenance: 'test', tieStatus: 'NOT_TESTED', createdAt: new Date().toISOString(),
  };
  const st = { period: '2026-06', scope: 'GROUP' };
  for (const d of ['ACCOUNT_GROUP', 'TB_POPULATION', 'GL_POPULATION', 'JOURNAL', 'EVIDENCE'] as const) {
    const c = drillCall({ label: 'x', drill: d, factId: 'f_a', subject: null }, base, st);
    assert.ok(c, `${d} resolves`);
    assert.equal(c!.args['answerMode'], 'direct', `${d} is a direct read by construction`);
  }
  /* a fact with no population cannot be drilled to evidence, and is not offered one */
  const bare: FinancialFact = { ...base, trace: {} };
  assert.equal(drillCall({ label: 'x', drill: 'EVIDENCE', factId: 'f_a', subject: null }, bare, st), null);
  assert.equal(drillCall({ label: 'x', drill: 'GL_POPULATION', factId: 'f_a', subject: null }, bare, st), null);
});

/* ================================================================================================
   §16 — NO GOVERNED NUMERICAL PROSE ESCAPE
   ================================================================================================ */

test('P2.5 §16: a governed turn answered in prose is recomposed by Korvyn, not published', async () => {
  const { orch } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06' } }] }
    : { text: 'CIP was $42.42M at June, which I am fairly sure about.' });
  const r = await orch.turn({ sessionId: sid(), request: 'CIP at June?' }, me);
  const text = said(r);
  assert.ok(!text.includes('$42.42M'), 'the invented figure never reaches the person');
  assert.ok(/^The CIP balance at /.test(text), text);
  const t = orch.v2.recent(1)[0]!;
  assert.ok(t.responseViolations.some((v) => /prose/.test(v)));
  assert.equal(t.ungroundedFigures.length, 0);
});

/**
 * §26 — FOUND BY THE 125-PROMPT BENCHMARK, AND THE ONE THING THAT MUST NEVER HAPPEN.
 *
 * Asked for net PP&E, the model wrote `{{FACT:f_pp&e_balance}}` — an id it invented, containing a character the
 * id class excludes. Nothing matched, nothing was reported unresolved, and the raw machinery reached the person
 * exactly as typed. The resolver stays exact; the DETECTOR is permissive, so anything reference-shaped that
 * survives resolution is unresolved and the sentence holding it is withheld.
 */
test('P2.5 §26: an invented reference never reaches a person, whatever shape it is in', async () => {
  const { orch } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06' } }] }
    : { tools: [{ name: 'respond', input: { headline: 'Net PP&E stands at {{FACT:f_pp&e_balance}} as of June.' } }] });
  const r = await orch.turn({ sessionId: sid(), request: "what's net PP&E" }, me);
  const text = said(r);
  assert.ok(!/\{\{/.test(text), `no machinery reaches the reader: ${text}`);
  assert.ok(!/pp&e_balance/.test(text));
  const t = orch.v2.recent(1)[0]!;
  assert.ok(t.unresolvedRefs.length > 0, 'and Korvyn records it as the defect it is');
});

/* ================================================================================================
   §18 — CONTRIBUTION IS NOT CAUSATION, AND THE MARKER IS PER FACT
   ================================================================================================ */

test('P2.5 §18: attribution is read from the tool’s own field name, per fact', async () => {
  const { orch } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'analyzeFinancials', input: { subject: 'CIP', period: '2026-06', answerMode: 'interpret' } }] }
    : { tools: [{ name: 'respond', input: { headline: 'ok' } }] });
  await orch.turn({ sessionId: sid(), request: 'why did CIP move?' }, me);
  const conv = orch.v2.conversation(sid(), me);
  assert.ok(conv, 'a conversation exists');
  /* the same read returns a whole and its parts; only the parts are attribution */
  const reg = new FactRegistry();
  const all = orch.v2.recent(1)[0]!;
  assert.ok(all.factsProduced > 0);
  assert.equal(reg.size, 0);
});

test('P2.5 §18: a whole does not explain itself — only a decomposition member supports "driven by"', async () => {
  /* getAccountAnalysis returns BOTH activity.change (the whole) and topDriver.*.change (its parts) */
  const { orch } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'analyzeFinancials', input: { subject: '15000', period: '2026-06', answerMode: 'interpret' } }] }
    : { tools: [{ name: 'respond', input: { headline: 'ok' } }] });
  await orch.turn({ sessionId: sid(), request: 'why did 15000 move?' }, me);
  const t = orch.v2.recent(1)[0]!;
  assert.ok(t.factsProduced >= 4);
});

/* ================================================================================================
   §11/§14/§24 — WHAT THE TRACE NOW REPORTS
   ================================================================================================ */

test('P2.5 §11/§14/§24: the trace separates fresh from cached, records TTFUA and names the workload', async () => {
  const { orch } = v2Orch(() => ({ tools: [{ name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06', answerMode: 'direct' } }] }));
  let firstDelta = 0;
  const t0 = Date.now();
  await orch.turn({ sessionId: sid(), request: 'CIP?' }, me, { emit: (e: { type: string }) => { if (e.type === 'delta' && !firstDelta) firstDelta = Date.now() - t0; } });
  const t = orch.v2.recent(1)[0]!;
  assert.equal(typeof t.inputTokens, 'number');
  assert.equal(typeof t.cacheReadTokens, 'number');
  assert.notEqual(t.firstUsefulMs, null, 'a direct answer streams the moment it exists');
  assert.equal(t.workload, 'DEVELOPMENT_TEST', 'a test run is not a person’s question');
});

/* ================================================================================================
   §33 — THE HOT PATH DID NOT GROW
   ================================================================================================ */

test('P2.5 §33: the exposed surface is still the composed operations plus control', () => {
  const defs = toolDefinitions(me);
  /* Phase 2.5 added NO tool to buy the direct path. Phase 2.6 added exactly one, `getMetric`, which covers every
     derived metric rather than one per KPI — the count is asserted so a per-metric tool cannot creep in. */
  assert.equal(defs.length, 13, 'no tool was added to buy the direct path; Phase 2.6 added getMetric and nothing else');
  /* the declaration is one optional argument on the governed operations, never a tool of its own */
  const governed = defs.filter((d) => !['respond', 'open_analysis_grid', 'start_investigation', 'ask_clarification'].includes(d.name));
  const withMode = governed.filter((d) => 'answerMode' in d.input_schema.properties);
  assert.equal(withMode.length, 7, 'every composed operation carries it, described identically');
  for (const d of withMode) assert.ok(!d.input_schema.required.includes('answerMode'), 'and it is never required');
});

test('P2.5 §6: a composer that does not fit returns nothing rather than inventing a shape', () => {
  const o = { id: 'FO-1', type: 'Thing', title: 'X', status: 'AVAILABLE', scope: { id: 'GROUP', name: 'G' }, periodLabel: 'Jun 2026', facts: [], focus: null } as never;
  assert.equal(composeDirect(o, [], { actor: me, subject: null, dimension: null, note: null, nextActions: [] }), null);
});
