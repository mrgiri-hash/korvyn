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
  /* PHASE C1 §30 — THE RECORD KEEPS EVERY TURN; only what is SENT to the model is compacted. This assertion
     used to read `body.turns.length === W`, which pinned the defect: the durable transcript was being trimmed
     to the model's context window, so History could only ever have reopened the last four exchanges of any
     conversation. Both halves are asserted here now, because it is the SEPARATION that is the contract. */
  assert.equal(body.turns.length, 9, 'the durable transcript is whole');
  assert.equal(body.turns[0]!.userMessage, 'question 1', 'including its beginning');
  assert.equal(body.summary.length, 0, 'nothing is written to the legacy summary any more');
  const msgs = transcriptMessages(body);
  assert.ok(String(msgs[0]!.content).includes('<earlier_conversation>'));
  assert.ok(String(msgs[0]!.content).includes('question 1'), 'the older turn is quoted to the model, not paraphrased');
  assert.ok(String(msgs[0]!.content).includes('POP-KEEP'), 'a governed reference survives compaction');
  assert.equal(msgs.length, 2 + W * 2, 'the model still sees the compacted head plus the verbatim window');
  assert.equal(msgs.at(-2)!.content, 'question 9', 'and the window is the most recent exchanges');
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
  /* V3 §11 — Korvyn stopping itself is a fact about Korvyn, not about their books: the trace, never the screen */
  assert.ok(r.diagnostics.some((x) => /step limit/.test(x)), 'the trace records that it stopped');
  assert.ok(!r.notes.some((x) => /step limit/.test(x)), 'and the person is not told about it');
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

/**
 * PHASE 2.5 §16 SUPERSEDES THE PHASE 2 CONTRACT THIS TEST USED TO ASSERT.
 *
 * Phase 1.5 could only MEASURE an invented figure: by the time the check ran, the sentence had been written and
 * the honest thing was to publish it and name the figure Korvyn could not point at. Phase 2.5 closes it with the
 * mechanism instead — a turn whose governed reads produced authoritative facts never answers as unstructured
 * prose, because Korvyn composes the answer from those facts itself. So the invented figure does not reach the
 * person at all, which is strictly better than reaching them under a warning.
 */
/* PHASE 3 §39 — the channel changed and the guarantee did not. Prose IS the answer now, so nothing is
   discarded wholesale; what is withheld is the SENTENCE carrying a figure Korvyn can find nowhere. */
test('P3 §39: an invented figure cannot reach the person, and the governed answer still does', async () => {
  const made = '$999.99M';
  const { orch } = v2Orch((round) => round === 0
    ? { tools: [{ name: 'getStatement', input: { view: 'summary', period: '2026-06' } }] }
    : { text: `June revenue was ${made}, and total assets were $124.18M.` });
  const r = await orch.turn({ sessionId: sid(), request: 'how did June look?' }, me);
  assert.equal(r.state, 'ANSWER');
  const said = r.narrative.map((n) => n.text).join(' ');
  assert.ok(!said.includes(made), 'the sentence holding the invented figure is withheld');
  assert.ok(said.length > 0, 'and the person still gets a governed answer');
  const t = orch.v2.recent(1)[0]!;
  assert.ok(t.ungroundedFigures.includes(made), 'the figure is named in the trace rather than passed over');
  /* V3 §11/§13 — the sentence is gone and the person reads an answer, not a report on Korvyn's own validation */
  assert.ok(r.diagnostics.some((n) => n.includes(made)), 'the finding is a diagnostic');
  assert.ok(!r.notes.some((n) => n.includes(made)), 'and never a note');
});

/* PHASE 3 §4 — the answer the model wrote is the answer the person reads, with the references resolved. */
test('P3 §4: a governed prose answer is published, not recomposed', async () => {
  const { orch } = v2Orch((round, seen) => {
    if (round === 0) return { tools: [{ name: 'analyzeFinancials', input: { subject: 'CIP', period: '2026-06' } }] };
    const f = factIdsSeen(seen)[0]!;
    return { text: `CIP sits at {{FACT:${f.id}}}, and the movement looks like a routine transfer into service.` };
  });
  const r = await orch.turn({ sessionId: sid(), request: 'how is CIP looking?' }, me);
  const text = r.narrative.map((n) => n.text).join(' ');
  assert.ok(/routine transfer into service/.test(text), `the model's own words survive: ${text}`);
  assert.ok(!/\{\{FACT:/.test(text), 'and the reference was resolved to a governed value');
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.ungroundedFigures.length, 0);
  assert.ok(!t.responseViolations.some((v) => /prose/.test(v)), 'prose is not a defect');
  assert.deepEqual(r.narrative.map((n) => n.label ?? null).filter(Boolean), [], 'and no heading is drawn');
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

/* ================================================================================================
   PHASE 2 — THE FACT-REFERENCE CONTRACT, END TO END THROUGH THE RUNTIME
   ================================================================================================ */

/** the fact ids Korvyn put on the last tool result — what a real model reads before it writes a reference */
function factIdsSeen(seen: Seen): { id: string; value: string; key: string }[] {
  const out: { id: string; value: string; key: string }[] = [];
  for (const m of seen.messages) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const b of m.content as { type: string; content?: string }[]) {
      if (b.type !== 'tool_result' || !b.content) continue;
      const o = JSON.parse(b.content) as { facts?: { key: string; value: string; id?: string }[] };
      for (const f of o.facts ?? []) if (f.id) out.push({ id: f.id, value: f.value, key: f.key });
    }
  }
  return out;
}

test('V2 P2 §9/§18: the model references a fact and KORVYN writes the figure', async () => {
  const cited: { v: { id: string; value: string } | null } = { v: null };
  const { orch, calls } = v2Orch((round, seen) => {
    if (round === 0) return { tools: [{ name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06' } }] };
    cited.v = factIdsSeen(seen)[0]!;
    return { tools: [{ name: 'respond', input: { responseType: 'FINANCIAL_SUMMARY', headline: `CIP stands at {{FACT:${cited.v.id}}}.` } }] };
  });
  const r = await orch.turn({ sessionId: sid(), request: 'what is CIP at June?' }, me);

  assert.equal(r.state, 'ANSWER');
  assert.equal(calls.length, 2, 'a governed answer is still one read and one answer — §22 adds no call');
  assert.ok(cited.v, 'Korvyn put a fact id on the tool result');
  const said = r.narrative.map((n) => n.text).join(' ');
  assert.ok(said.includes(cited.v.value), `the governed display value is what reached the person: ${said}`);
  assert.ok(!said.includes('{{FACT'), 'the reference is machinery and never appears');

  const t = orch.v2.recent(1)[0]!;
  assert.ok(t.factsProduced > 0, 'the governed read promoted facts');
  assert.equal(t.factRefs, 1);
  assert.deepEqual(t.unresolvedRefs, []);
  assert.deepEqual(t.ungroundedFigures, [], 'a referenced figure is not a figure the model typed');
  assert.deepEqual(t.responseViolations, []);
  assert.equal(t.responseType, 'FINANCIAL_SUMMARY');
  assert.equal(r.narrative[0]!.assertion, 'FACT');
});

test('V2 P2 §23: a conceptual answer is ONE model call and draws no headings', async () => {
  const { orch, calls } = v2Orch(() => ({
    tools: [{ name: 'respond', input: { responseType: 'DIRECT', headline: 'OPEX is the cost of running the business, excluding depreciation.' } }],
  }));
  const r = await orch.turn({ sessionId: sid(), request: 'what is OPEX?' }, me);
  assert.equal(calls.length, 1, 'no governed read, no second call');
  assert.equal(r.reply, 'OPEX is the cost of running the business, excluding depreciation.');
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.toolCalls, 0);
  assert.equal(t.responseType, 'DIRECT');
  assert.deepEqual(t.responseViolations, []);
});

test('V2 P2 §16: a company figure asserted with no governed read is named, and the answer is not rewritten', async () => {
  const { orch } = v2Orch(() => ({
    tools: [{ name: 'respond', input: { responseType: 'FINANCIAL_SUMMARY', headline: 'June OPEX was $128.4M.' } }],
  }));
  const r = await orch.turn({ sessionId: sid(), request: 'what was our June OPEX?' }, me);
  assert.ok(r.reply!.includes('$128.4M'), 'what Sloane said is what it said');
  /* V3 §11 — the answer is not rewritten and the finding is not narrated: it goes to the diagnostics. */
  assert.ok(r.diagnostics.some((n) => n.includes('$128.4M')), r.diagnostics.join(' / '));
  assert.ok(!r.notes.some((n) => n.includes('$128.4M')), 'the person is not told about Korvyn checking itself');
  const t = orch.v2.recent(1)[0]!;
  assert.deepEqual(t.ungroundedFigures, ['$128.4M']);
  assert.ok(t.responseViolations.some((v) => v.startsWith('figure stated with no governed read')), t.responseViolations.join(' / '));
});

/* PHASE 3 §4 — the sections are gone. A retired `respond` still renders (a stale session may emit one), and
   what it renders is PARAGRAPHS: the content survives, the headings do not. */
test('P3 §4: a retired respond still renders, and draws no headings', async () => {
  const { orch } = v2Orch((round, seen) => {
    if (round === 0) return { tools: [{ name: 'analyzeFinancials', input: { subject: 'CIP', period: '2026-06' } }] };
    const f = factIdsSeen(seen)[0]!;
    return { tools: [{ name: 'respond', input: {
      responseType: 'DRIVER_ANALYSIS',
      headline: `CIP moved {{FACT:${f.id}}} in June.`,
      summary: 'Four projects moved into service.',
      keyDrivers: ['South Valley Phase 2 was placed in service.', 'Dublin DUB-01 was capitalised.'],
      unresolved: ['No approved explanation is on the line yet.'],
      nextActions: ['Open the Flux line'],
    } }] };
  });
  const r = await orch.turn({ sessionId: sid(), request: 'why did CIP move in June?' }, me);
  assert.deepEqual(r.narrative.map((n) => n.label ?? null).filter(Boolean), [], 'no heading anywhere');
  /* V3 §14 — the message and the rows are two channels; between them nothing is lost */
  const text = [...r.narrative.map((n) => n.text), ...(r.presentation?.rows ?? [])].join(' ');
  assert.ok(/Four projects moved into service/.test(text), 'the content is still said');
  assert.ok(/South Valley Phase 2/.test(text) && /No approved explanation/.test(text));
  assert.ok(!text.includes('{{FACT'), 'and no machinery reaches the person');
  assert.deepEqual(r.suggestions, ['Open the Flux line']);
  assert.ok(r.narrative.every((n) => n.objectIds.length), 'every part carries the object it came from');
});

/* ================================================================================================
   RUNTIME V3 §5 — RETRIEVAL IS NOT PRESENTATION
   ================================================================================================ */

test('V3 §5: a governed object is read without being shown', async () => {
  const { orch } = v2Orch((round, seen) => {
    if (round === 0) return { tools: [{ name: 'getStatement', input: { view: 'summary', period: '2026-06' } }] };
    const f = factIdsSeen(seen)[0]!;
    return { text: `June looks steady — net income is {{FACT:${f.id}}}.` };
  });
  const r = await orch.turn({ sessionId: sid(), request: 'how did June look?' }, me);
  assert.ok(r.objects.length, 'the object is on the response for the trace and for an agent');
  assert.equal(r.presentation, null, 'and nothing is shown, because nothing asked to show it');
  assert.ok(r.narrative.length, 'the answer is the words');
});

test('V3 §7: a table can only be of something this turn actually read', async () => {
  const { orch } = v2Orch((round) => {
    if (round === 0) return { tools: [{ name: 'getControlStatus', input: { area: 'close', period: '2026-06', detail: 'blockers' } }] };
    return { text: 'Here they are.', tools: [{ name: 'show', input: { kind: 'table', of: 'FO-DOES-NOT-EXIST' } }] };
  });
  const r = await orch.turn({ sessionId: sid(), request: 'show me all the blockers' }, me);
  /* one object was read, so the single-object fallback resolves it; what must never happen is a table of
     something that was not read */
  if (r.presentation) assert.ok(r.objects.some((o) => o.id === r.presentation!.objectId), 'the table names a read object');
  assert.ok(r.narrative.length || r.reply, 'and the turn still says something');
});

test('V2 P2 §35/§45: a fact referenced in a LATER turn still resolves from the durable registry', async () => {
  const s = sid();
  let first: { id: string; value: string } | null = null;
  const { orch } = v2Orch((round, seen) => {
    if (round === 0 && !first) return { tools: [{ name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06' } }] };
    if (!first) { first = factIdsSeen(seen)[0]!; return { tools: [{ name: 'respond', input: { headline: `CIP is {{FACT:${first.id}}}.` } }] }; }
    /* the second turn reads NOTHING and still quotes the figure by reference */
    return { tools: [{ name: 'respond', input: { headline: `As I said, CIP is {{FACT:${first.id}}}.` } }] };
  });
  await orch.turn({ sessionId: s, request: 'what is CIP at June?' }, me);
  const again = await orch.turn({ sessionId: s, request: 'remind me' }, me);

  const said = again.reply ?? again.narrative.map((n) => n.text).join(' ');
  assert.ok(said.includes(first!.value), `the figure survived the turn boundary: ${said}`);
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.toolCalls, 0, 'nothing was re-read');
  assert.deepEqual(t.unresolvedRefs, []);
  assert.deepEqual(t.ungroundedFigures, []);
});

test('V2 P2 §10/§45: a twelve-turn drill chain, where the amount is never restated', async () => {
  const s = sid();
  /* the ids Korvyn handed back, kept the way a real model keeps them: by reading its own tool results */
  const held: { june?: string; cip?: string; driver?: string; txn?: string; journal?: string } = {};
  const firstFact = (seen: Seen) => factIdsSeen(seen)[0];
  const refOf = (seen: Seen, key: string): string | undefined => {
    for (const m of [...seen.messages].reverse()) {
      if (m.role !== 'user' || !Array.isArray(m.content)) continue;
      for (const b of m.content as { type: string; content?: string }[]) {
        if (b.type !== 'tool_result' || !b.content) continue;
        const o = JSON.parse(b.content) as { refs?: Record<string, string> };
        if (o.refs?.[key]) return o.refs[key];
      }
    }
    return undefined;
  };

  /* every turn: a governed read where one is needed, then `respond` citing facts BY REFERENCE — including
     facts read many turns earlier, which is the whole point of §45. */
  const script = (turn: number) => (round: number, seen: Seen): Step => {
    if (round === 0) {
      switch (turn) {
        case 1: return { tools: [{ name: 'getStatement', input: { view: 'summary', period: '2026-06' } }] };
        case 2: return { tools: [{ name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06' } }] };
        case 3: return { tools: [{ name: 'analyzeFinancials', input: { subject: 'CIP', period: '2026-06', dimension: 'project' } }] };
        case 4: return { tools: [{ name: 'analyzeFinancials', input: { subject: 'CIP', period: '2026-06', dimension: 'account' } }] };
        case 5: return { tools: [{ name: 'getLedgerDetail', input: { subject: 'CIP', period: '2026-06' } }] };
        case 6: return { tools: [{ name: 'getLedgerDetail', input: { subject: 'CIP', period: '2026-06', minAmount: '1' } }] };
        case 7: return { tools: [{ name: 'getLedgerDetail', input: { transactionId: held.txn! } }] };
        case 8: return { tools: [{ name: 'getLedgerDetail', input: { journalId: held.journal! } }] };
        case 9: return { tools: [{ name: 'traceFinancialObject', input: { subject: 'CIP', period: '2026-06' } }] };
        case 10: return { tools: [{ name: 'getControlStatus', input: { area: 'flux', subject: 'CIP', period: '2026-06' } }] };
        /* 11 and 12 read NOTHING: the figures are quoted from the registry alone */
        default: break;
      }
    }
    /* the population names its largest line and that line's journal — which is how a drill continues without
       anybody quoting an amount back at Korvyn */
    if (turn >= 5) held.txn = refOf(seen, 'largestTransaction') ?? held.txn;
    if (turn >= 5) held.journal = refOf(seen, 'largestJournal') ?? refOf(seen, 'journalId') ?? held.journal;
    const f = firstFact(seen);
    if (turn === 1 && f) held.june = f.id;
    if (turn === 2 && f) held.cip = f.id;
    if (turn === 3 && f) held.driver = f.id;

    if (turn === 11) return { tools: [{ name: 'respond', input: { headline: `CIP was {{FACT:${held.cip}}} at June, against the statement total of {{FACT:${held.june}}}.` } }] };
    if (turn === 12) return { tools: [{ name: 'respond', input: { responseType: 'DRIVER_ANALYSIS', headline: `The largest project contribution was {{FACT:${held.driver}}}.`, summary: `CIP itself stands at {{FACT:${held.cip}}}.` } }] };
    return { tools: [{ name: 'respond', input: { responseType: 'FINANCIAL_SUMMARY', headline: f ? `That reads {{FACT:${f.id}}}.` : 'Korvyn read the object but it carries no figure.' } }] };
  };

  const asked = [
    'how did June look?', 'what about CIP?', "what's behind that?", 'show me the accounts',
    'show me the GL', 'just the big ones', 'where did that line come from?', 'and its journal?',
    'trace it to the source', 'is any of it unexplained?', 'remind me what CIP was', 'and the biggest driver?',
  ];
  for (let i = 0; i < asked.length; i++) {
    const { orch } = v2Orch(script(i + 1));
    const r = await orch.turn({ sessionId: s, request: asked[i]! }, me);
    assert.equal(r.state, 'ANSWER', `turn ${i + 1}: ${asked[i]}`);
    const t = orch.v2.recent(1)[0]!;
    assert.deepEqual(t.unresolvedRefs, [], `turn ${i + 1} resolved every reference it made`);
    assert.deepEqual(t.ungroundedFigures, [], `turn ${i + 1} typed no figure of its own`);
    assert.deepEqual(t.responseViolations, [], `turn ${i + 1}: ${t.responseViolations.join(' / ')}`);
    if (i + 1 >= 11) assert.equal(t.toolCalls, 0, `turn ${i + 1} needed no read: the registry still holds the figure`);
  }

  /* the person never restated an amount, and the facts from turn 1 are still resolvable at turn 12 */
  assert.ok(held.june && held.cip && held.driver);
  assert.ok(held.txn, 'the drill reached a transaction through the population, not through a restated number');
});

test('V2 P2 §22: reading and answering in one step runs the reads and defers the answer', async () => {
  const { orch, calls } = v2Orch((round, seen) => {
    if (round === 0) {
      /* the failure this guards: references written before the facts they point at exist */
      return { tools: [
        { name: 'getStatement', input: { view: 'line', subject: 'CIP', period: '2026-06' } },
        { name: 'respond', input: { headline: 'CIP is {{FACT:f_guessed0001}}.' } },
      ] };
    }
    const f = factIdsSeen(seen)[0]!;
    return { tools: [{ name: 'respond', input: { headline: `CIP is {{FACT:${f.id}}}.` } }] };
  });
  const r = await orch.turn({ sessionId: sid(), request: 'what is CIP at June?' }, me);
  assert.equal(r.state, 'ANSWER');
  assert.equal(calls.length, 2, 'the deferred answer costs the call the turn was always going to spend');
  const t = orch.v2.recent(1)[0]!;
  assert.equal(t.toolCalls, 1, 'the control tool is handed back unrun, not executed');
  assert.deepEqual(t.unresolvedRefs, [], 'the guessed reference never reached a response');
  assert.deepEqual(t.responseViolations, []);
});
