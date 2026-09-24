/**
 * PHASE 8C.2 — context control. A scripted model proposes a context relation and ops; these tests pin what KORVYN does
 * with the proposal: a restriction stays on the analysis on screen, a question never persists a sort or a limit, a drill
 * selects the row without re-ordering, "the other X" is resolved against the member in context, a clarification is asked
 * only when context cannot decide, Undo walks across analyses, and the workspace title follows the active analysis.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator, type TurnResponse } from './orchestrator.js';
import { serverActor } from './tools.js';
import { analysisName } from './analysis/context.js';

const me = serverActor();
type A = { definition: Record<string, any>; result: Record<string, any>; panel: { kind: string } | null; referents: Record<string, any>; relation: string; history: Record<string, any> };
const an = (r: TurnResponse) => r.objects.find((x) => x.type === 'FinancialAnalysis')?.analysis as unknown as A | undefined;
const op = (o: Record<string, unknown>) => ({ dimensions: [], values: [], periods: [], measure: null, number: null, percent: null, statement: null, rowRef: null, ...o });
const edit = (o: Record<string, unknown>) => ({ contextRelation: 'MODIFY_CURRENT', targetReferent: { kind: 'NONE', rank: null, rowRef: null, values: [] }, ops: [], ephemeralOperation: { kind: 'NONE', by: null, n: null, dir: null }, persistentMutation: true, requiresClarification: false, confidence: 0.9, unsupported: null, question: null, options: [], ...o });
/** a model that answers from a script — its proposal is exactly what Korvyn must validate */
function scripted(script: (q: string) => Record<string, unknown>) {
  const sc = new MockLLMAdapter(); Object.defineProperty(sc, 'provider', { value: 'scripted' });
  (sc as unknown as { analysisEdit: (i: { request: string }) => Promise<unknown> }).analysisEdit = async (i) => ({ status: 'ok', latencyMs: 1, requestId: null, usage: null, model: 'scripted', value: edit(script(i.request)) });
  return new SloaneOrchestrator(sc, { maxPlanSteps: 8 }, () => me);
}
let n = 0; const sid = () => `ctx-test-${++n}-xxxxxxxx`;

test('8C.2 modify vs new: a restriction proposed as a NEW statement stays on the trial balance; an explicit switch replaces it', async () => {
  const o = scripted((q) => /^june tb/.test(q) ? { contextRelation: 'START_NEW', ops: [op({ op: 'NEW_TRIAL_BALANCE', periods: ['2026-06'] })] }
    : /^bs only/.test(q) ? { contextRelation: 'START_NEW', ops: [op({ op: 'NEW_STATEMENT', statement: 'BS' })] }
    : { contextRelation: 'REPLACE_CURRENT', ops: [op({ op: 'NEW_STATEMENT', statement: 'IS', periods: ['2026-05'] })] });
  const s = sid();
  const a0 = an(await o.turn({ sessionId: s, request: 'june tb' }, me))!;
  const r1 = await o.turn({ sessionId: s, request: 'bs only' }, me), a1 = an(r1)!;
  assert.equal(a1.definition['id'], a0.definition['id'], 'the same analysis — a restriction, not a new one');
  assert.equal(a1.definition['statement'], 'BS'); assert.equal(a1.relation, 'MODIFY_CURRENT');
  assert.ok(o.trace(r1.traceId)!.analysisContext!.adjustments.some((x) => /restricts the analysis on screen/.test(x)), 'the correction of the proposal is traced');
  const a2 = an(await o.turn({ sessionId: s, request: 'show me the may income statement instead' }, me))!;
  assert.notEqual(a2.definition['id'], a0.definition['id'], 'a different statement in a different period replaces it');
});

test('8C.2 rank vs sort vs drill: a question ranks without persisting; an instruction sorts; a drill selects the largest without re-sorting', async () => {
  const o = scripted((q) => /^bs/.test(q) ? { contextRelation: 'START_NEW', ops: [op({ op: 'NEW_STATEMENT', statement: 'BS', periods: ['2026-05', '2026-06'] }), op({ op: 'COMPARE_PRIOR_PERIOD' })] }
    /* the model answers an instruction as a ranking, and a question as a persistent TOP 1 — both wrong, both corrected */
    : /first$/.test(q) ? { contextRelation: 'EXPLAIN_CURRENT', persistentMutation: false, ephemeralOperation: { kind: 'RANK', by: 'VARIANCE', n: 1, dir: 'DESC' } }
    : /most\?$/.test(q) ? { contextRelation: 'MODIFY_CURRENT', persistentMutation: false, ops: [op({ op: 'SORT', measure: 'VARIANCE' }), op({ op: 'TOP', number: 1 })] }
    : { contextRelation: 'DRILL_CURRENT', targetReferent: { kind: 'SELECTED', rank: null, rowRef: null, values: [] }, ops: [op({ op: 'SORT', measure: 'VARIANCE' }), op({ op: 'DRILL' })] });
  const s = sid();
  await o.turn({ sessionId: s, request: 'bs may june' }, me);
  const a1 = an(await o.turn({ sessionId: s, request: 'largest movements first' }, me))!;
  assert.equal(a1.definition['sorts'][0]?.['by'], 'VARIANCE', 'an instruction about order persists as a sort');
  const r2 = await o.turn({ sessionId: s, request: 'which one moved the most?' }, me), a2 = an(r2)!;
  assert.equal(a2.panel?.kind, 'RANK'); assert.equal(a2.definition['topN'], null, 'no persistent top-1 limit');
  assert.equal(a2.definition['version'], a1.definition['version'], 'an ephemeral answer creates no version');
  assert.ok(a2.referents['activeRankedResultIds'].length === 1, 'the ranked row is remembered as a referent');
  const a3 = an(await o.turn({ sessionId: s, request: 'what is behind the biggest change' }, me))!;
  assert.equal(a3.panel?.kind, 'GL');
  assert.deepEqual(a3.definition['sorts'], a1.definition['sorts'], 'the drill did not re-sort');
  const leaf = (r: any) => !a1.result['rows'].some((x: any) => x.id.startsWith(`${r.id}/`));
  const vi = a1.result['columns'].findIndex((c: any) => c.measure === 'VARIANCE');
  const want = a1.result['rows'].filter((r: any) => r.kind !== 'section').filter(leaf).sort((x: any, y: any) => Math.abs(y.cells[vi].value) - Math.abs(x.cells[vi].value))[0].id;
  assert.equal(a3.referents['activeRowId'], want, 'a superlative points at the largest movement, not at the selection');
});

test('8C.2 "the other X": two other candidates ask; the chosen option is applied as chosen; a later restriction keeps the correction', async () => {
  const o = scripted((q) => /^siemens/.test(q) ? { contextRelation: 'START_NEW', ops: [op({ op: 'NEW_ACTIVITY', dimensions: ['project'], values: ['Siemens'], periods: ['2026-06'] })] }
    : /other/.test(q) ? { contextRelation: 'CLARIFY_REFERENT', requiresClarification: true, question: 'Which one?', options: ['Siemens Energy', 'Siemens AG'] }
    : { ops: [op({ op: 'FILTER', values: ['South Valley'] })] });
  const s = sid();
  const a0 = an(await o.turn({ sessionId: s, request: 'siemens activity by project' }, me))!;
  assert.deepEqual(a0.definition['filters'][0]['values'], ['Siemens Energy']);
  const r1 = await o.turn({ sessionId: s, request: 'I meant the other Siemens' }, me);
  assert.equal(r1.state, 'CLARIFICATION_REQUIRED', 'Siemens AG and Siemens Mobility: more than one other candidate');
  assert.deepEqual(r1.clarification!.options.map((x) => x.label.split(' — ')[0]).sort(), ['Siemens AG', 'Siemens Mobility'], 'the member in context is not offered back');
  const a2 = an(await o.turn({ sessionId: s, clarification: { pendingId: r1.clarification!.pendingId, optionId: r1.clarification!.options.find((x) => /AG/.test(x.label))!.id } }, me))!;
  assert.equal(a2.definition['id'], a0.definition['id']); assert.deepEqual(a2.definition['filters'].find((f: any) => f.dimension === 'vendor').values, ['Siemens AG']);
  const a3 = an(await o.turn({ sessionId: s, request: 'south valley only' }, me))!;
  assert.deepEqual(a3.definition['filters'].map((f: any) => `${f.dimension}:${f.values}`).sort(), ['project:SV-PH2', 'vendor:Siemens AG']);
});

test('8C.2 context decides: a clarification the analysis already answers is not asked; the model’s member must be one the words name', async () => {
  const o = scripted((q) => /^cip/.test(q) ? { contextRelation: 'START_NEW', ops: [op({ op: 'NEW_ACTIVITY', dimensions: ['project'], values: ['15000'], periods: ['2026-06'] }), op({ op: 'FILTER', values: ['South Valley'] })] }
    : /^show south valley/.test(q) ? { contextRelation: 'CLARIFY_REFERENT', requiresClarification: true, question: 'Project or property?', options: ['South Valley project', 'Silicon Valley property'] }
    : { ops: [op({ op: 'FILTER', values: ['SILICON-VALLEY'] })] });
  const s = sid();
  const a0 = an(await o.turn({ sessionId: s, request: 'cip by project in south valley' }, me))!;
  const r1 = await o.turn({ sessionId: s, request: 'show south valley' }, me);
  assert.notEqual(r1.state, 'CLARIFICATION_REQUIRED', 'South Valley is already the project in context');
  assert.equal(an(r1)!.definition['id'], a0.definition['id']);
  /* the model filters on a property the words do not name; the words name the project */
  const o2 = scripted((q) => /^june tb/.test(q) ? { contextRelation: 'START_NEW', ops: [op({ op: 'NEW_TRIAL_BALANCE', periods: ['2026-06'] })] } : { ops: [op({ op: 'FILTER', values: ['SILICON-VALLEY'] })] });
  const s2 = sid();
  await o2.turn({ sessionId: s2, request: 'june tb' }, me);
  const f = an(await o2.turn({ sessionId: s2, request: 'just south valley' }, me))!.definition['filters'];
  assert.deepEqual(f.map((x: any) => `${x.dimension}:${x.values}`), ['project:SV-PH2'], 'the words name the project; the model’s property is replaced');
});

test('8C.2 history: Undo and Redo step across distinct analyses and restore each state exactly; versions are never reused', async () => {
  const o = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => me);
  const s = sid(), t = async (q: string) => o.turn({ sessionId: s, request: q }, me);
  const bs = an(await t('show June BS'))!, tb = an(await t('show June TB'))!, tbBs = an(await t('BS only'))!, cip = an(await t('show CIP activity by project'))!;
  assert.equal(tbBs.definition['id'], tb.definition['id']); assert.notEqual(cip.definition['id'], tb.definition['id']);
  const u1 = an(await t('undo'))!; assert.equal(u1.definition['id'], tb.definition['id']); assert.equal(u1.definition['statement'], 'BS');
  const u2 = an(await t('undo'))!; assert.equal(u2.definition['version'], 1); assert.equal(u2.definition['statement'], null);
  const u3 = an(await t('undo'))!; assert.equal(u3.definition['id'], bs.definition['id']);
  const r1 = an(await t('redo'))!; assert.equal(r1.definition['id'], tb.definition['id']); assert.equal(r1.definition['version'], 1);
  const m = an(await t('only cash'))!;
  assert.equal(m.definition['version'], 3, 'v2 is in the history (undone), so the next change is v3');
  assert.equal(m.history['canRedo'], false, 'a new change after an undo discards the redo branch');
  /* undo still works when the canvas, not an analysis, is on screen */
  await t('close');
  const back = an(await t('undo'))!; assert.equal(back.definition['id'], tb.definition['id']);
});

test('8C.2 the workspace title follows the active analysis; the investigation keeps its own title', async () => {
  const o = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => me);
  const s = sid(), t = async (q: string) => o.turn({ sessionId: s, request: q }, me);
  const r0 = await t('show June TB'); const inv = r0.title;
  assert.equal(r0.workspace!.title, an(r0)!.definition['name']);
  const r1 = await t('BS only'); assert.equal(r1.workspace!.title, an(r1)!.definition['name']); assert.notEqual(r1.workspace!.title, r0.workspace!.title);
  assert.match(r1.workspace!.title, /balance-sheet accounts/);
  const r2 = await t('show CIP activity by project'); assert.equal(r2.workspace!.title, an(r2)!.definition['name']);
  assert.equal(r2.title, undefined, 'the investigation is named once — the workspace title is what changes');
  assert.ok(inv);
  const r3 = await t('undo'); assert.equal(r3.workspace!.title, an(r3)!.definition['name']);
  assert.equal(analysisName({ ...an(r3)!.definition, nameSource: 'USER', name: 'My TB' } as never), 'My TB', 'a name the user gave stays');
});
