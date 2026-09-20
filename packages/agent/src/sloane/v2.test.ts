/**
 * SLOANE CORE RUNTIME V2 — PHASE 1. A scripted model asks for what it asks for; these tests pin what KORVYN does:
 * one conversation that survives the turn, one primary reasoning call for an ordinary turn, tools re-authorized at
 * the moment of the read, deterministic compaction, a clarification that becomes part of the transcript, and the
 * two handoffs into the surfaces that already exist. v1 is untouched and is asserted to still own UI commands.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter, type ReasonInput, type ReasonMessage, type ReasonOut } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { ROLES, serverActor, visibleOf, type Actor } from './tools.js';
import { coreTools, runTool, toolDefinitions } from './v2/tools.js';
import { appendTurn, initialState, transcriptMessages } from './v2/conversation.js';
import { type ConversationBody, V2_LIMITS } from './v2/model.js';
import { resolveConcept } from './semantic/concepts.js';
import { GovernedLedger } from './governed.js';
import { FinancialDataService } from './financials.js';

const me = serverActor();
const scoped: Actor = { id: 'user:jpark', name: 'Jonah Park', ...ROLES['ENTITY_ACCOUNTANT']! };

interface Step { text?: string; tools?: { name: string; input: Record<string, unknown> }[] }
/** every call the scripted model was given, so a test can assert what the model actually saw */
interface Seen { system: string; messages: ReasonMessage[]; tools: { name: string }[] }

function v2Orch(script: (round: number, seen: Seen) => Step) {
  const sc = new MockLLMAdapter(); Object.defineProperty(sc, 'provider', { value: 'scripted' });
  const calls: Seen[] = [];
  (sc as unknown as { reason: (i: ReasonInput) => Promise<unknown> }).reason = async (i) => {
    const seen: Seen = { system: i.system, messages: i.messages, tools: i.tools.map((t) => ({ name: t.name })) };
    /* a tool round is an assistant turn whose content is blocks, not text */
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
  return { orch: new SloaneOrchestrator(sc, { maxPlanSteps: 8, runtimeV2: true }, () => me), calls };
}
let n = 0; const sid = () => `v2-test-${++n}-xxxxxxxx`;

test('V2 §3: a turn that needs no facts is ONE model call, no narration pass, and the reply is the model’s own words', async () => {
  const { orch, calls } = v2Orch(() => ({ text: 'June is the open period. What would you like to look at?' }));
  const s = sid();
  const r = await orch.turn({ sessionId: s, request: 'hello' }, me);
  assert.equal(r.state, 'ANSWER');
  assert.equal(r.reply, 'June is the open period. What would you like to look at?');
  assert.equal(calls.length, 1, 'exactly one reasoning call');
  assert.equal(r.narrative.length, 0);
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.modelCalls, 1); assert.equal(t.toolCalls, 0); assert.equal(t.contextBuilds, 1);
});

test('V2 §9/§11: a turn that needs facts calls governed tools, and the figures come from the tool, not the model', async () => {
  const { orch, calls } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getFinancialSummary', input: { period: '2026-06' } }] }
    : { text: 'Net income for June is what the summary shows.' });
  const r = await orch.turn({ sessionId: sid(), request: 'how did June close out?' }, me);
  assert.equal(r.state, 'ANSWER');
  assert.equal(calls.length, 2, 'one call to ask for facts, one to answer them — the floor for native tool use');
  assert.equal(r.objects.length, 1);
  assert.equal(r.narrative[0]?.text, 'Net income for June is what the summary shows.');
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.toolCalls, 1);
  assert.equal(t.tools[0]?.status, 'COMPLETED');
  /* the second call carries the observation back as a tool_result — the model never invents the figure */
  const back = calls[1]!.messages.at(-1)!;
  assert.ok(Array.isArray(back.content) && JSON.stringify(back.content).includes('tool_result'));
});

test('V2 §4: the transcript is durable and VERBATIM — the next turn replays what was actually said', async () => {
  const { orch, calls } = v2Orch(() => ({ text: 'Noted.' }));
  const s = sid();
  await orch.turn({ sessionId: s, request: 'Only South Valley, please.' }, me);
  await orch.turn({ sessionId: s, request: 'and by vendor' }, me);
  const second = calls[1]!.messages;
  assert.ok(second.some((m) => m.role === 'user' && m.content === 'Only South Valley, please.'), 'the earlier words, unchanged');
  assert.ok(second.some((m) => m.role === 'assistant' && m.content === 'Noted.'));
  const body = orch.v2.conversation(s, me);
  assert.equal(body.turns.length, 2);
  assert.equal(body.turns[0]!.userMessage, 'Only South Valley, please.', 'stored as language, never as an intent enum');
});

test('V2 §5: compaction is deterministic — the verbatim window is kept, older turns quoted with their refs', () => {
  let body: ConversationBody = { sessionId: 'x', owner: me.id, startedAt: '', updatedAt: '', summary: [], turns: [], state: initialState({ period: '2026-06', scope: 'GROUP', currency: 'USD', basis: 'US GAAP', lens: 'Corporate Consolidated', bookId: 'CORE-GL' }), pending: null };
  for (let i = 1; i <= 9; i++) {
    body = appendTurn(body, { userMessage: `question ${i}`, assistantMessage: `answer ${i}`, path: 'conversation',
      refs: { toolCalls: [], objectIds: [`FO-${i}`], populationIds: i === 1 ? ['POP-KEEP'] : [], evidenceIds: [], analysisId: null, agentRunId: null } });
  }
  const W = V2_LIMITS.verbatimTurns;
  assert.equal(body.turns.length, W);
  assert.equal(body.turns[0]!.userMessage, `question ${9 - W + 1}`);
  assert.equal(body.summary.length, 9 - W);
  assert.ok(body.summary[0]!.includes('question 1'), 'the older turn is quoted, not paraphrased');
  assert.ok(body.summary[0]!.includes('POP-KEEP'), 'a governed reference survives compaction');
  const msgs = transcriptMessages(body);
  assert.ok(String(msgs[0]!.content).includes('<earlier_conversation>'));
  assert.equal(msgs.length, 2 + W * 2);
});

test('V2 §14: a clarification becomes part of the conversation, and the answer resumes it verbatim', async () => {
  /* the question is already in the transcript on the second turn, which is how the script knows it was answered */
  const { orch, calls } = v2Orch((_round, seen) => (seen.messages.some((m) => m.role === 'assistant' && m.content === 'Which Siemens?')
    ? { text: 'Siemens Energy spend is in the result.' }
    : { tools: [{ name: 'ask_clarification', input: { question: 'Which Siemens?', options: 'Siemens Energy | Siemens AG' } }] }));
  const s = sid();
  const q = await orch.turn({ sessionId: s, request: 'how much did Siemens cost us?' }, me);
  assert.equal(q.state, 'CLARIFICATION_REQUIRED');
  assert.equal(q.clarification?.question, 'Which Siemens?');
  assert.equal(q.clarification?.options.length, 2);
  /* the shape the browser actually sends */
  const a = await orch.turn({ sessionId: s, request: '', clarification: { pendingId: q.clarification!.pendingId, optionId: q.clarification!.options[0]!.id } }, me);
  assert.equal(a.state, 'ANSWER');
  const body = orch.v2.conversation(s, me);
  assert.equal(body.pending, null, 'the question is answered, not left open');
  assert.equal(body.turns[1]!.userMessage, 'Siemens Energy', 'the choice is what the person said');
  assert.ok(calls[1]!.messages.some((m) => m.role === 'assistant' && m.content === 'Which Siemens?'));
});

test('V2 §20: “a table I can reshape” hands off to the governed analysis grid, and the grid inherits the conversation’s book', async () => {
  const { orch } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'open_analysis_grid', input: { request: 'June trial balance by entity' } }] }
    : { text: '' });
  const r = await orch.turn({ sessionId: sid(), request: 'show me June TB by entity' }, me);
  const an = r.objects.find((o) => o.type === 'FinancialAnalysis');
  assert.ok(an, 'the 8C grid answered, not a v2 re-implementation');
  const def = (an!.analysis as { definition: { book: Record<string, string>; periods: string[] } }).definition;
  assert.equal(def.book.accountingBasis, 'US GAAP');
  assert.equal(def.book.currency, 'USD');
  assert.equal(orch.v2.recent(1)[0]!.path, 'analysis-handoff');
});

test('V2 §16/§37: a structured grid command never reaches v2 — v1 answers it with no model call', async () => {
  const { orch, calls } = v2Orch(() => ({ text: 'should not be reached' }));
  const s = sid();
  const r = await orch.turn({ sessionId: s, request: 'expand', focus: { command: 'EXPAND_ALL' } }, me);
  assert.notEqual(r.route, 'V2');
  assert.equal(calls.length, 0, 'no reasoning call is spent on a deterministic UI command');
});

test('V2 §11/§35: every tool is re-authorized at the read, and a refusal leaks nothing', () => {
  const env = { data: (globalThis as never), gl: (globalThis as never), controls: (globalThis as never), actor: scoped, visible: visibleOf(scoped) } as never;
  const o = runTool('getTrialBalance', { period: '2026-06', scope: 'GROUP' }, env, 1, 1);
  assert.equal(o.status, 'REFUSED');
  assert.equal(o.object, null);
  assert.ok(/may not view scope GROUP/.test(o.error ?? ''));
  assert.equal(o.observation.status, 'REFUSED');
  assert.equal(o.observation.facts.length, 0, 'a refusal carries no governed figure');
});

test('V2 §10: the exposed tool set is permission-filtered BEFORE exposure and is stable for a given actor', () => {
  const a = toolDefinitions(me).map((t) => t.name);
  const b = toolDefinitions(me).map((t) => t.name);
  assert.deepEqual(a, b, 'byte-identical from turn to turn — the cached prefix depends on it');
  assert.ok(a.includes('open_analysis_grid') && a.includes('start_investigation') && a.includes('ask_clarification'));
  const auditor: Actor = { id: 'user:auditor', name: 'Priya Nair', ...ROLES['EXTERNAL_AUDITOR']! };
  const forAuditor = coreTools(auditor).map((t) => t.id);
  assert.ok(forAuditor.length < coreTools(me).length, 'an auditor is shown fewer capabilities, not refused later');
  assert.ok(!forAuditor.includes('getFluxSummary'), 'a capability they lack is never named to them');
});

test('V2 §11: a tool the model invents, and a write it asks for, are both refused without reaching a service', () => {
  const env = { data: (globalThis as never), gl: (globalThis as never), controls: (globalThis as never), actor: me, visible: visibleOf(me) } as never;
  const made = runTool('getEverything', {}, env, 1, 1);
  assert.equal(made.status, 'REFUSED');
  assert.ok(/not a Korvyn capability/.test(made.error ?? ''));
  const write = runTool('postJournalEntry', {}, env, 1, 1);
  assert.equal(write.status, 'REFUSED');
  assert.ok(/governed reads only/.test(write.error ?? ''));
});

test('V2 §14: the tool loop is bounded — every tool_use is answered and the turn still ends with what was read', async () => {
  const { orch, calls } = v2Orch(() => ({ tools: [{ name: 'getFinancialSummary', input: { period: '2026-06' } }] }));
  const r = await orch.turn({ sessionId: sid(), request: 'keep going' }, me);
  assert.equal(r.state, 'ANSWER');
  assert.ok(calls.length <= 4, 'the rounds are capped');
  assert.ok(r.objects.length >= 1, 'the governed figures that were read are still shown');
  assert.ok(r.notes.some((x) => /step limit/.test(x)), 'and Korvyn says it stopped');
});

/* ---- §2/§4: the concept matcher tolerates real finance language, structurally ------------------ */

test('§2: inflection, ampersands and one slipped key resolve the same concept — no per-phrase rule', () => {
  const gl = new GovernedLedger(new FinancialDataService());
  const at = (text: string) => resolveConcept({ text, gl }).concept?.conceptId ?? null;

  /* plurals and participles of one alias, not forty aliases */
  assert.equal(at('did anyone post topsides this period'), 'ADJUSTMENT');
  assert.equal(at('show me the receivables aging'), 'AR');
  /* an ampersand IS the word "and", however it is typed */
  for (const w of ['sg&a', 'sg and a', 's g and a']) assert.equal(at(`${w} trend`), 'SGA', w);
  /* one slip, including a swapped pair, on a word long enough that it cannot become another term */
  assert.equal(at('recievables aging'), 'AR');
  assert.equal(at('intercompny balances'), 'INTERCOMPANY');
  assert.equal(at('accrued liabilties at june'), 'ACCRUED_LIABILITIES');

  /* SPECIFICITY OUTRANKS EXACTNESS: an exact one-word hit must not claim the concept before a
     two-word inflected one is tried */
  assert.equal(at('how much capitalising interest is in there'), 'CAPITALIZED_INTEREST');

  /* and tolerance must not invent: a short word one edit from an alias is still not that alias */
  assert.equal(at('what is a cap'), null);
  assert.equal(at('blah blah blah'), null);
});

test('V2 §1: a figure in the answer that no governed read produced is named, and the answer is not rewritten', async () => {
  const made = '$999.99M';
  const { orch } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'summary', period: '2026-06' } }] }
    : { text: `June revenue was ${made}, and total assets were $124.18M.` });
  const r = await orch.turn({ sessionId: sid(), request: 'how did June look?' }, me);
  assert.equal(r.state, 'ANSWER');
  const said = r.narrative.map((n) => n.text).join(' ');
  assert.ok(said.includes(made), 'the answer is what Sloane said — nothing rewrites it');
  assert.ok(r.notes.some((n) => n.includes(made)), 'and the figure it could not point at is named');
  /* a figure the governed read DID return is not flagged, or the check is noise */
  assert.ok(!r.notes.some((n) => n.includes('$124.18M')));
});

test('V2 §1: a figure carried forward from an earlier turn is grounded, not flagged', async () => {
  const s = sid();
  const { orch } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'summary', period: '2026-06' } }] }
    : { text: 'Total assets were $124.18M.' });
  await orch.turn({ sessionId: s, request: 'how did June look?' }, me);
  const { orch: o2 } = v2Orch(() => ({ text: 'As I said, total assets were $124.18M.' }));
  void o2;
  const again = await orch.turn({ sessionId: s, request: 'remind me of assets' }, me);
  assert.ok(!again.notes.some((n) => /could not match/.test(n)), 'continuity is not fabrication');
});
