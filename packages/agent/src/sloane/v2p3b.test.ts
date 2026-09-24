/**
 * C1.2 — PRIOR-RESPONSE TRANSFORMS AND RESPONSE ORGANIZATION.
 *
 * What is pinned here is the MECHANISM, never a phrase. There is no test below that asks what happens when
 * somebody types "bullets", because nothing in the runtime asks that either: the model understands the request
 * and Korvyn's job is to make sure the prior answer is still in its hands, that its figures travel as governed
 * references rather than as digits, and that a written shape survives to the screen. Every case is one of those
 * three structural questions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env['KORVYN_DB_PATH'] ??= ':memory:';

import { FactRegistry, factsFrom } from './v2/facts.js';
import { fromProse, renderResponse, sourceText } from './v2/respond.js';
import { transcriptMessages } from './v2/conversation.js';
import type { ConversationBody, V2Turn } from './v2/model.js';
import { V2_SYSTEM } from './prompts.js';
import type { FinancialObject } from './tools.js';
import './toolset.js';

const CTX = { book: 'CORE-GL', lens: 'Corporate Consolidated' };

function objOf(facts: { key: string; label: string; value: number; display: string }[]): FinancialObject {
  return {
    id: 'FO-1', type: 'CloseReadiness', title: 'June close', status: 'AVAILABLE',
    scope: { id: 'GROUP', name: 'Corporate Consolidated' }, periods: ['2026-06'], periodLabel: 'Jun 2026',
    currency: 'USD', basis: 'US GAAP', unit: 'USD millions',
    table: { columns: [], rows: [] }, facts,
    provenance: { source: 'governed ledger', snapshotId: 'S1', journalLines: 0, fxRateSetId: null, eliminations: null, declaredInputs: [] },
    population: null, refs: { account: '15000' }, focus: null, unavailable: null, governed: true,
  };
}

/** a registry holding one governed figure, as a read would have left it on the conversation */
function held(display: string) {
  const reg = new FactRegistry();
  const [f] = reg.add(factsFrom(objOf([{ key: 'readiness', label: 'Close readiness', value: 57, display }]), CTX));
  return { reg, id: f!.factId };
}

const OPT = { hasGovernedRead: true, objectIds: ['FO-1'] };

/* ---- §4/§6 — THE PRIOR ANSWER IS HANDED BACK WITH ITS REFERENCES INTACT ------------------------------ */

test('C1.2 §4: the record keeps both the resolved answer and the same answer with its references', () => {
  const { reg, id } = held('57%');
  const def = fromProse(`Close readiness is {{FACT:${id}}} for June.`, reg, OPT);
  const resolved = renderResponse(def, reg).text;
  const source = sourceText(def);

  /* a person reads the value; the next turn is handed the reference, so it can cite rather than retype */
  assert.match(resolved, /57%/);
  assert.ok(!resolved.includes('{{FACT:'), 'the resolved answer never carries machinery');
  assert.ok(source.includes(`{{FACT:${id}}}`), 'the stored source keeps the reference');
  assert.ok(!/57%/.test(source), 'the stored source does not also carry the digits');
});

test('C1.2 §4: the transcript hands the model the referenced form, and History the resolved one', () => {
  const turn = (t: Partial<V2Turn>): V2Turn => ({
    turnId: 'T1', at: '2026-06-30T00:00:00.000Z', userMessage: 'what is the close status?',
    assistantMessage: 'Close readiness is 57%.', path: 'analytical',
    refs: { toolCalls: [], objectIds: [], populationIds: [], evidenceIds: [], analysisId: null, agentRunId: null }, ...t,
  });
  const body = {
    summary: [],
    turns: [turn({ assistantSource: 'Close readiness is {{FACT:f_x}}.' }), turn({ userMessage: 'and now?', assistantMessage: 'Still 57%.' })],
  } as unknown as ConversationBody;

  const msgs = transcriptMessages(body);
  const assistant = msgs.filter((m) => m.role === 'assistant').map((m) => m.content);
  assert.equal(assistant[0], 'Close readiness is {{FACT:f_x}}.', 'the model gets the referenced form where one was kept');
  assert.equal(assistant[1], 'Still 57%.', 'and the resolved one where it is all there is');
});

test('C1.2 §6: a reference reused with no governed read this turn still resolves to the governed value', () => {
  const { reg, id } = held('57%');
  /* the transform turn calls no tool, so nothing is promoted — the registry is the CONVERSATION's */
  const def = fromProse(`- Close readiness: {{FACT:${id}}}\n- Blockers: 15`, reg, { hasGovernedRead: false, objectIds: [] });
  const r = renderResponse(def, reg);
  assert.deepEqual(r.unresolved, [], 'a fact read three turns ago is still in hand');
  assert.match(r.text, /Close readiness: 57%/);
});

/* ---- §15 — A WRITTEN SHAPE SURVIVES TO THE SCREEN ---------------------------------------------------- */

test('C1.2 §15: a block with lines in it keeps them, and is one assertion rather than many', () => {
  const { reg } = held('57%');
  const def = fromProse('**June close blockers**\n\n- AR unexplained\n- AP unexplained\n  - both unassigned', reg, OPT);
  const parts = renderResponse(def, reg).parts.filter((p) => !p.row);
  const list = parts.find((p) => p.text.includes('- AR'));
  assert.ok(list, 'the list survives');
  assert.ok(list!.text.includes('\n- AP'), 'and it is ONE block, so its lines are still adjacent');
  assert.ok(list!.text.includes('  - both unassigned'), 'including the indentation a nested item is drawn from');
});

test('C1.2 §15: withholding inside a block is per LINE, so one bad figure does not delete the list', () => {
  const { reg, id } = held('57%');
  const def = fromProse(`- Readiness: {{FACT:${id}}}\n- Invented: $999.99M`, reg, OPT);
  const text = renderResponse(def, reg).text;
  assert.match(text, /Readiness: 57%/, 'the governed line is published');
  assert.ok(!text.includes('999.99'), 'the line with no governed reference is not');
  assert.ok(def.withheldFigures.some((f) => f.includes('999.99')), 'and it is named rather than silently dropped');
});

/* ---- §7 — TWO KINDS OF ACTION, AND ONLY ONE OF THEM IS KORVYN'S ------------------------------------- */

test('C1.2 §7: the prompt separates a workflow fact from a recommended next step', () => {
  /* the rule has to be in front of the model at the moment it writes action items, so it is pinned here
     rather than left to a live run to notice */
  const p = String(V2_SYSTEM);
  assert.match(p, /WHEN THEY ASK FOR ACTION ITEMS/i);
  assert.match(p, /recommend/i);
});

/* ---- §16/§17 — WHAT A TRANSFORM MUST NOT DO ---------------------------------------------------------- */

test('C1.2 §17: reformatting never re-rounds, re-signs or renames a governed figure', () => {
  const reg = new FactRegistry();
  const [f] = reg.add(factsFrom(objOf([{ key: 'movement', label: 'CIP movement', value: -10.83, display: '($10.83M)' }]), CTX));
  const id = f!.factId;
  /* the same reference rendered in two differently shaped answers is byte-identical both times */
  const a = renderResponse(fromProse(`CIP moved {{FACT:${id}}} in June.`, reg, OPT), reg).text;
  const b = renderResponse(fromProse(`- **CIP**: {{FACT:${id}}}`, reg, OPT), reg).text;
  assert.ok(a.includes('($10.83M)') && b.includes('($10.83M)'), 'one value, one rendering, whatever shape it sits in');
});

/**
 * §3 — NO PHRASE ROUTES, AND THE GUARANTEE IS ABOUT THE CODE, NOT THE PROMPT.
 *
 * The prompt names "put that in bullets" and "rewrite it for the CFO" on purpose: it is the model's own reading
 * material and those examples teach it the CATEGORY. What must not exist is a branch in the runtime that reads
 * the words and decides for it. So the check strips the comments — which discuss those examples at length — and
 * asserts that not one format word survives into anything executable.
 */
test('C1.2 §3: no format word appears in the runtime, only in what it says about itself', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const f of ['runtime', 'respond', 'compose', 'conversation', 'strategy', 'referent', 'facts', 'model']) {
    const src = strip(readFileSync(new URL(`./v2/${f}.ts`, import.meta.url), 'utf8'));
    for (const w of ['bullet', 'concise', 'executive', 'plain english', 'shorter', 'one-line']) {
      assert.ok(!src.toLowerCase().includes(w), `v2/${f}.ts must not branch on "${w}"`);
    }
  }
});
