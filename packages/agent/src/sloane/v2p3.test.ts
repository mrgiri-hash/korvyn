/**
 * PHASE 3 — CONVERSATION-FIRST SLOANE.
 *
 * What these pin is the SHAPE of an answer and the boundary that produced it: Claude owns the words, Korvyn owns
 * the values, and no heading is drawn over either. Every check runs through the real orchestrator with a scripted
 * model, so it measures the runtime rather than a prompt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env['KORVYN_DB_PATH'] ??= ':memory:';

import { FactRegistry, factsFrom } from './v2/facts.js';
import { buildResponse, fromProse, internalVocabulary, renderResponse, withList } from './v2/respond.js';
import { toolDefinitions } from './v2/tools.js';
import { serverActor } from './tools.js';
import { V2_SYSTEM } from './prompts.js';
import type { FinancialObject } from './tools.js';
import './toolset.js';

const CTX = { book: 'CORE-GL', lens: 'Corporate Consolidated' };

/** a governed object exactly as a registered tool returns one — the promotion path's only input */
function objOf(o: Partial<FinancialObject> & Pick<FinancialObject, 'id'>): FinancialObject {
  return {
    type: 'AccountAnalysis', title: 'Construction in progress · Jun 2026', status: 'AVAILABLE',
    scope: { id: 'GROUP', name: 'Corporate Consolidated' }, periods: ['2026-06'], periodLabel: 'Jun 2026',
    currency: 'USD', basis: 'US GAAP', unit: 'USD millions',
    table: { columns: [], rows: [] }, facts: [],
    provenance: { source: 'governed ledger', snapshotId: 'S1', journalLines: 4, fxRateSetId: null, eliminations: null, declaredInputs: [] },
    population: null, refs: {}, focus: null, unavailable: null, governed: true, ...o,
  };
}

const regWith = (display: string, key = 'balance') => {
  const reg = new FactRegistry();
  const [f] = reg.add(factsFrom(objOf({ id: 'FO-1', refs: { account: '15000' }, facts: [{ key, label: 'B', value: 1, display }] }), CTX));
  return { reg, id: f!.factId };
};

/* ================================================================================================
   §4 — NO ANSWER DRAWS A HEADING
   ================================================================================================ */

test('P3 §4: no shape of answer draws a section heading', () => {
  const { reg, id } = regWith('4,210.2');
  const shapes = [
    buildResponse({ message: `CIP is {{FACT:${id}}}.` }, reg, { hasGovernedRead: true, objectIds: [] }),
    buildResponse({ responseType: 'DRIVER_ANALYSIS', headline: 'It moved.', summary: 'Four projects.', keyDrivers: ['A', 'B'], interpretation: ['Looks routine.'], exceptions: ['One is late.'], unresolved: ['Nothing approved yet.'] }, reg, { hasGovernedRead: true, objectIds: [] }),
    fromProse('CIP is steady. Nothing to flag.', reg, { hasGovernedRead: true, objectIds: [] }),
  ];
  for (const def of shapes) assert.deepEqual(renderResponse(def, reg).parts.map((p) => p.label).filter(Boolean), []);
});

/* ================================================================================================
   §4/§14 — PROSE IS THE ANSWER; `show_list` IS THE ONLY PRESENTATION
   ================================================================================================ */

test('P3 §14: the exposed surface answers by writing, and offers exactly one presentation tool', () => {
  const names = toolDefinitions(serverActor()).map((t) => t.name);
  assert.ok(!names.includes('respond'), 'the Phase 2 answer tool is retired from the surface');
  assert.ok(!names.includes('show_list'), 'and so is the list-only presentation tool');
  assert.ok(names.includes('show'), 'one generic presentation declaration replaces both');
  assert.equal(names.filter((n) => ['show', 'open_analysis_grid', 'start_investigation', 'ask_clarification'].includes(n)).length, 4);
  /* §40 — no tool names a screen or a topic; every one is a capability an agent could plan over */
  for (const n of names) assert.ok(!/(screen|panel|page|render|answer_|_question)/i.test(n), `tool "${n}" names a UI action`);
  /* §31 — the tool count did not grow to buy this */
  assert.ok(names.length <= 13, `tools exposed: ${names.length}`);
});

test('P3 §14: a prose answer keeps its paragraphs; rows are marked as rows', () => {
  const { reg, id } = regWith('10.53');
  const plain = renderResponse(fromProse(`AR moved {{FACT:${id}}} in June. Nobody has explained it yet.`, reg, { hasGovernedRead: true, objectIds: [] }), reg);
  assert.equal(plain.parts.length, 1, 'one paragraph stays one paragraph');
  assert.equal(plain.text, 'AR moved 10.53 in June. Nobody has explained it yet.');
  assert.ok(plain.parts.every((p) => !p.row));

  const listed = renderResponse(withList(fromProse('The biggest are these.', reg, { hasGovernedRead: true, objectIds: [] }), null, [`AR — {{FACT:${id}}}`, 'AP — unassigned'], reg), reg);
  assert.equal(listed.parts.filter((p) => p.row).length, 2, 'the rows are marked so they draw as a list');
  assert.equal(listed.parts.filter((p) => !p.row).length, 1, 'and the answer is still the answer');
});

/* ================================================================================================
   §26 — A CAUSAL CLAIM IS STILL CHECKED, AT THE SENTENCE
   ================================================================================================ */

test('P3 §26: an unsupported cause is demoted to inference; the facts around it stay facts', () => {
  const { reg, id } = regWith('2.1', 'change');
  const def = fromProse(`OPEX rose {{FACT:${id}}} in June. It rose because the team hired three engineers. That is the whole movement.`, reg, { hasGovernedRead: true, objectIds: [] });
  const r = renderResponse(def, reg);
  const inference = r.parts.find((p) => p.assertion === 'INFERENCE');
  assert.ok(inference, 'the causal sentence is typed as the model’s reading');
  assert.match(inference!.text, /hired three engineers/);
  assert.ok(r.parts.some((p) => p.assertion === 'FACT' && /OPEX rose 2\.1/.test(p.text)), 'and the governed sentence is untouched');
  assert.ok(def.violations.some((v) => v.startsWith('causal claim without support')));
});

test('P3 §26: general knowledge is not a claim about their book', () => {
  const reg = new FactRegistry();
  const def = fromProse('EBITDA reflects operating profitability because it strips out financing and tax.', reg, { hasGovernedRead: false, objectIds: [] });
  assert.deepEqual(def.violations, [], 'a definition is not an unsupported causal claim');
  assert.equal(renderResponse(def, reg).parts[0]!.assertion, 'FACT');
});

/* ================================================================================================
   §39 — GROUNDING DID NOT MOVE WITH THE CHANNEL
   ================================================================================================ */

test('P3 §39: an invented figure is withheld at the sentence and named', () => {
  const { reg, id } = regWith('10.53');
  const def = fromProse(`AR moved {{FACT:${id}}} in June. Revenue was $999.99M.`, reg, { hasGovernedRead: true, objectIds: [] });
  assert.deepEqual(def.withheldFigures, ['$999.99M']);
  const r = renderResponse(def, reg);
  assert.ok(!r.text.includes('$999.99M'), 'the sentence holding it never reaches the person');
  assert.match(r.text, /AR moved 10\.53 in June\./, 'and the rest of the answer survives');
});

test('P3 §16: a figure carried forward from an earlier turn is grounded, not flagged', () => {
  const { reg } = regWith('($0.39M)', 'change');
  /* the registry outlives the turn, so restating what was read two turns ago needs no read at all */
  const def = fromProse('The decline was ($0.39M), mostly softer revenue.', reg, { hasGovernedRead: false, objectIds: [] });
  assert.deepEqual(def.violations.filter((v) => v.startsWith('figure stated with no governed read')), []);
  assert.deepEqual(def.withheldFigures, []);
});

test('P3 §39: a reference Korvyn cannot resolve takes its sentence and nothing more', () => {
  const { reg, id } = regWith('4,210.2');
  const r = renderResponse(fromProse(`CIP is {{FACT:${id}}}. May was {{FACT:f_missing}}.`, reg, { hasGovernedRead: true, objectIds: [] }), reg);
  assert.equal(r.text, 'CIP is 4,210.2.');
  assert.deepEqual(r.unresolved, ['f_missing']);
});

/* ================================================================================================
   §17 — INTERNAL METADATA STAYS INTERNAL
   ================================================================================================ */

test('P3 §17: a Korvyn constant reaching the answer is recorded as a defect', () => {
  assert.deepEqual(internalVocabulary('Six items are FLUX_UNEXPLAINED and one is TASK_BLOCKED.'), ['FLUX_UNEXPLAINED', 'TASK_BLOCKED']);
  assert.deepEqual(internalVocabulary('Six movements are unexplained and one task is blocked.'), []);
  /* §17, the other half — narrating the plumbing rather than the book */
  assert.ok(internalVocabulary('That read came back at the group level.').length, 'a read is never the subject of a sentence');
  assert.ok(internalVocabulary("I don't have an ownership field on the blockers.").length, 'a missing field is said as the book being silent');
  assert.deepEqual(internalVocabulary('Germany is not broken out separately; the position is group-wide.'), []);
  /* a reference is machinery and is stripped before the text is read */
  assert.deepEqual(internalVocabulary('AR moved {{FACT:f_abc123}} in June.'), []);
  const { reg } = regWith('1.0');
  const def = fromProse('Six are FLUX_UNEXPLAINED.', reg, { hasGovernedRead: true, objectIds: [] });
  assert.ok(def.violations.some((v) => v.startsWith('internal vocabulary reached the answer')));
});

/* ================================================================================================
   §4/§48 — THE PROMPT NO LONGER ASKS FOR A REPORT
   ================================================================================================ */

test('P3 §4: the system prompt names no section and requires no answering tool', () => {
  for (const gone of ['End every turn by calling respond', 'FINANCIAL_SUMMARY', 'DRIVER_ANALYSIS —', 'keyDrivers', 'responseType']) {
    assert.ok(!V2_SYSTEM.includes(gone), `the prompt still asks for "${gone}"`);
  }
  assert.ok(/ANSWER THE QUESTION; DO NOT PRODUCE A REPORT/.test(V2_SYSTEM));
  assert.ok(/NOTHING IS SHOWN UNLESS YOU SHOW IT/.test(V2_SYSTEM));
  assert.ok(/THE TEST IS WHAT THEY ASKED FOR, NOT WHAT YOU READ/.test(V2_SYSTEM), 'presentation turns on the request, not on what came back');
  assert.ok(/WHAT YOU ARE TALKING ABOUT IS WHAT THEY JUST ASKED ABOUT/.test(V2_SYSTEM));
});
