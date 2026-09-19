/**
 * Phase 8C — the governed analysis: definition, query service, cell identity, conversational editing, drill,
 * permissions. The real orchestrator in deterministic mode (and one scripted model for the analytical path).
 * Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator, type TurnResponse } from './orchestrator.js';
import { type Actor, ROLES, visibleOf } from './tools.js';
import { DEV_DIRECTORY, actorContext } from './auth.js';
import type { AnalysisDefinition, AnalysisResult, CellContext } from './analysis/model.js';
import type { Panel } from './analysis/engine.js';
import { FinancialAnalysisQueryService } from './analysis/query.js';
import { CanvasEngine, type CanvasState } from './canvas/canvas.js';
import { refinementOf } from './canvas/intent.js';
import { financialGraph } from './semantic/graph.js';
import { periodLabel } from './financials.js';

const reviewer: Actor = { id: 'user:mgiri', name: 'Mitra Giri', ...ROLES['FINANCE_REVIEWER']! };
const mdh = actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:mdh')!, null, 'test');
const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => reviewer);
let n = 0;
const sid = () => `an-${++n}-xxxxxxxxxx`;
type A = { definition: AnalysisDefinition; result: AnalysisResult; panel: Panel | null; changes: string[]; referents: { activeCellId: string | null; activePopulationId: string | null; activeRowId: string | null } };
const ask = async (s: string, q: string, actor: Actor = reviewer, focus?: unknown) => { const r = await orch.turn({ sessionId: s, request: q, ...(focus ? { focus } : {}) }, actor); assert.notEqual(r.state, 'ERROR', `${q}: ${JSON.stringify(r.notes)}`); return r; };
const an = (r: TurnResponse): A => { const o = r.objects.find((x) => x.type === 'FinancialAnalysis'); assert.ok(o, `no analysis: ${orch.trace(r.traceId)?.route} ${JSON.stringify(r.notes)}`); return o!.analysis as unknown as A; };
const row = (a: A, id: string) => a.result.rows.find((r) => r.id === id);

test('§35 A: May and June balance sheet → reshape → filter → expand → nest → variance → threshold → GL, one analysis', async () => {
  const s = sid();
  const a1 = an(await ask(s, 'Show me May and June balance sheet'));
  assert.equal(a1.definition.analysisType, 'STATEMENT'); assert.deepEqual(a1.definition.periods, ['2026-05', '2026-06']); assert.equal(a1.definition.statement, 'BS');
  assert.deepEqual(a1.result.columns.map((c) => c.label), ['May 2026', 'Jun 2026']);
  const id = a1.definition.id;
  const a2 = an(await ask(s, 'accounts on rows, months on columns'));
  assert.equal(a2.definition.id, id); assert.deepEqual(a2.definition.rows.map((r) => r.dimension), ['account']);
  const a3 = an(await ask(s, 'only cash and CIP'));
  assert.deepEqual(a3.definition.filters[0]!.values.sort(), ['10000', '15000']);
  assert.ok(a3.result.rows.every((r) => !/account:(1[1-9]|[2-9])\d{3}/.test(r.id.replace(/account:1[05]\d{3}/g, ''))), 'only cash and CIP rows');
  const a4 = an(await ask(s, 'expand CIP'));
  assert.ok(row(a4, 'statement:BS/type:ASSET/account:15000')!.expanded);
  assert.ok(row(a4, 'statement:BS/type:ASSET/account:15000/account:15100'), 'child accounts shown');
  const a5 = an(await ask(s, 'put projects underneath'));
  assert.deepEqual(a5.definition.rows.map((r) => r.dimension), ['account', 'project']);
  assert.ok(a5.result.rows.some((r) => r.id.endsWith('project:SV-PH2')));
  const a6 = an(await ask(s, 'add variance'));
  assert.equal(a6.result.columns.at(-1)!.measure, 'VARIANCE');
  const cip = row(a6, 'statement:BS/type:ASSET/account:15000')!;
  assert.equal(cip.cells[2]!.value!.toFixed(2), (cip.cells[1]!.value! - cip.cells[0]!.value!).toFixed(2), 'variance is Korvyn’s subtraction of the two governed amounts');
  const a7 = an(await ask(s, 'only over $5M'));
  assert.ok(a7.result.rows.filter((r) => r.kind !== 'section').every((r) => a7.result.rows.some((x) => x.id.startsWith(r.id)) && (Math.abs(r.cells[2]!.value ?? 0) >= 5e6 || a7.result.rows.some((x) => x.id !== r.id && x.id.startsWith(`${r.id}/`)))));
  const r8 = await ask(s, 'show me the GL behind the largest movement'), a8 = an(r8);
  assert.equal(a8.definition.id, id, 'one continuously evolving analysis');
  assert.equal(a8.panel!.kind, 'GL'); assert.ok(a8.panel!.gl!.populationId.startsWith('POP-'));
  assert.equal(a8.panel!.cell!.measure, 'VARIANCE');
  assert.equal(a8.referents.activePopulationId, a8.panel!.gl!.populationId);
  assert.ok(a8.definition.version >= 7, 'every change is a new version of the same definition');
});

test('§36 B: June TB by entity → only BS → largest first → expand South Valley (a project, added beneath by its canonical id)', async () => {
  const s = sid();
  const b1 = an(await ask(s, 'Show June TB by entity'));
  assert.equal(b1.definition.analysisType, 'TRIAL_BALANCE'); assert.deepEqual(b1.definition.rows.map((r) => r.dimension), ['entity', 'account']);
  assert.equal(row(b1, 'entity:MDH')!.cells[0]!.value, null, 'an entity total mixing balance and P&L types is not stated');
  const b2 = an(await ask(s, 'only BS accounts'));
  assert.ok(b2.result.rows.every((r) => !/account:[4-7]\d{4}/.test(r.id)));
  const b3 = an(await ask(s, 'sort largest first'));
  const kids = b3.result.rows.filter((r) => r.id.startsWith('entity:MDH/') && r.level === 1).map((r) => Math.abs(r.cells[0]!.value ?? 0));
  assert.deepEqual(kids, [...kids].sort((x, y) => y - x));
  const r4 = await ask(s, 'expand South Valley'), b4 = an(r4);
  assert.ok(b4.definition.rows.some((r) => r.dimension === 'project'));
  assert.ok(b4.result.rows.some((r) => r.id.startsWith('entity:MDH/') && r.id.endsWith('/project:SV-PH2')), 'SV-PH2 opened where it posts, by canonical path');
  assert.match(r4.notes.join(' '), /project, not a row/);
});

test('§37 C: monthly CIP activity by project → top five → vendors underneath, with no prebuilt page', async () => {
  const s = sid();
  const c1 = an(await ask(s, 'Show monthly CIP activity by project Jan-Jun'));
  assert.equal(c1.definition.analysisType, 'ANALYSIS'); assert.deepEqual(c1.definition.measures, ['ACTIVITY']);
  assert.deepEqual(c1.definition.rows.map((r) => r.dimension), ['project']); assert.equal(c1.definition.periods.length, 6);
  assert.deepEqual(c1.definition.filters.map((f) => f.values), [['15000']]);
  /* the grid foots to the governed trend of the same account */
  const trend = orch.gl.lines.filter((l) => l.group === '15000' && l.period === '2026-06').reduce((x, l) => x + l.usd, 0);
  assert.equal(c1.result.totals!.cells[5]!.value!.toFixed(2), trend.toFixed(2));
  const c2 = an(await ask(s, 'top five projects only'));
  assert.ok(c2.result.rows.filter((r) => r.level === 0).length <= 5);
  const c3 = an(await ask(s, 'vendors underneath'));
  assert.deepEqual(c3.definition.rows.map((r) => r.dimension), ['project', 'vendor']);
  assert.ok(c3.result.rows.some((r) => r.id === 'project:LON-DC1/vendor:Siemens Energy'));
});

test('§38 D: a visible cell → what is behind it → the SAME population answers "does it have support?"', async () => {
  const s = sid();
  const a = an(await ask(s, 'Show monthly CIP activity by project Jan-Jun'));
  const cell = row(a, 'project:SV-PH2')!.cells[5]!;
  const r1 = await ask(s, "show me what's behind this", reviewer, { analysisId: a.definition.id, cellId: cell.id }), d1 = an(r1);
  const pid = d1.panel!.gl!.populationId;
  assert.equal(d1.panel!.cell!.cellId, cell.id);
  assert.deepEqual(d1.panel!.cell!.rowMemberIds, ['project:SV-PH2']);
  assert.equal(d1.panel!.gl!.net, cell.display, 'the population nets to the cell');
  const r2 = await ask(s, 'does it have support?');
  const call = orch.trace(r2.traceId)!.toolsExecuted.find((x) => x.tool === 'getSupportCoverage')!;
  assert.equal(call.args['populationId'], pid, 'evidence is looked up on the drilled population');
});

test('§11 CellContext is re-derived from the canonical cell id and ties to the statement balance', () => {
  const q = new FinancialAnalysisQueryService({ gl: orch.gl, data: orch.data, actor: reviewer, visible: 'ALL' });
  const def: AnalysisDefinition = { id: 'AN-T', version: 1, name: 't', analysisType: 'TRIAL_BALANCE', periods: ['2026-06'], primaryPeriod: '2026-06', comparison: null, scope: 'GROUP', book: { accountingBookId: 'CORE-GL', accountingBasis: 'US GAAP', reportingLens: 'Corporate Consolidated', currency: 'USD' },
    rows: [{ dimension: 'account' }], columns: [{ dimension: 'period' }], measures: ['ENDING_BALANCE'], filters: [], statement: null, valueFilter: null, sorts: [], topN: null, hierarchies: [{ dimension: 'account', levels: ['group', 'account'] }],
    expanded: [], collapsed: [], displayOptions: { units: 'USD_MILLIONS', negatives: 'PARENTHESES', showSubtotals: true }, sourceObjectIds: [], populationIds: [], dataVersion: '', mappingVersion: '', createdBy: '', updatedBy: '', createdAt: '', updatedAt: '', derivedFrom: null };
  const res = q.run(def);
  for (const code of ['10000', '15000', '20000', '40000']) {
    const r = res.rows.find((x) => x.id === `account:${code}`)!;
    assert.equal(r.cells[0]!.value!.toFixed(2), orch.gl.balanceUsd([code], '2026-06', 'ALL').toFixed(2), `${code}: grid = balanceUsd (one balance semantic)`);
    const ctx = q.cell(def, r.cells[0]!.id) as CellContext;
    assert.deepEqual(ctx.rowMemberIds, [`account:${code}`]); assert.equal(ctx.period, '2026-06'); assert.ok(ctx.populationId?.startsWith('POP-'));
    assert.equal(ctx.dataVersion, orch.gl.dataVersion());
  }
});

test('§10 canonical-ID drill: a canvas row opens by its ref; duplicate labels are never resolved by label', () => {
  const graph = financialGraph({ data: orch.data, gl: orch.gl, controls: orch.controls, artifacts: orch.artifacts });
  const eng = new CanvasEngine({ data: orch.data, gl: orch.gl, controls: orch.controls, graph, actor: reviewer, monthLabel: periodLabel });
  const rows = [{ label: 'Construction in progress', ref: 'recon:REC-MDH-15000', amount: 1 }, { label: 'Construction in progress', ref: 'recon:REC-MER-UK-15000', amount: 2 }];
  const st = { id: 'x', version: 1, kind: 'RECONCILIATIONS', rows, focus: null, drill: null, filters: { statement: null, explanation: null, materialOnly: false, sort: null } } as unknown as CanvasState;
  const byRef = eng.refine(st, { op: 'FOCUS', rank: null, largest: false, label: null, ref: 'recon:REC-MER-UK-15000' });
  assert.equal(byRef.state.focus!.ref, 'recon:REC-MER-UK-15000', 'the clicked row, not the first with that name');
  const typed = refinementOf('open construction in progress', { kind: 'RECONCILIATIONS', rows });
  assert.equal(typed!.op, 'FOCUS');
  const out = eng.refine(st, typed!);
  assert.equal(out.state.focus, null, 'an ambiguous name is refused'); assert.match(out.note!, /2 rows/);
});

test('§33/§39 E: a restricted accountant sees only their entity — in members, totals, drill and search', async () => {
  const s = sid();
  const e1 = an(await ask(s, 'Show June TB by entity', mdh));
  assert.deepEqual([...new Set(e1.result.rows.map((r) => r.id.split('/')[0]))], ['entity:MDH']);
  const mdhOnly = orch.gl.lines.filter((l) => l.entity === 'MDH' && l.group === '15000' && l.period <= '2026-06');
  const cipRow = row(e1, 'entity:MDH/account:15000')!;
  const q = new FinancialAnalysisQueryService({ gl: orch.gl, data: orch.data, actor: mdh, visible: visibleOf(mdh) });
  assert.equal(cipRow.cells[0]!.value!.toFixed(2), orch.gl.balanceUsd(['15000'], '2026-06', new Set(['MDH'])).toFixed(2)); void mdhOnly; void q;
  const hidden = await ask(s, 'only MER-UK', mdh);
  assert.equal(hidden.state, 'UNAVAILABLE'); assert.doesNotMatch(JSON.stringify(hidden), /Meridian UK|MER-UK OpCo/);
  const d = an(await ask(s, 'show me the GL behind the first one', mdh));
  const pop = orch.gl.population(d.panel!.gl!.populationId)!;
  assert.ok(orch.gl.query(pop, 'ALL', { limit: 1 }).all.every((l) => l.entity === 'MDH'), 'the drilled population holds only visible lines');
  const grp = await ask(sid(), 'Show the consolidated balance sheet for June', mdh);
  assert.equal(grp.state, 'UNAVAILABLE'); assert.match(grp.notes.join(' '), /may not view scope GROUP/, 'a named scope outside access is refused, not narrowed');
  const g = an(await ask(sid(), 'Show June balance sheet by entity', mdh));
  assert.ok(g.result.rows.every((r) => !/entity:(MER|MGP)/.test(r.id)));
});

test('§31/§32/§29/§30 save is a proposal; duplicate keeps the structure; chart and Excel are contracts over the same ids', async () => {
  const s = sid();
  const a = an(await ask(s, 'Show monthly CIP activity by project Jan-Jun'));
  const sv = await ask(s, 'save this analysis');
  assert.equal(sv.actions!.proposals[0]!.type, 'SAVE_ANALYSIS');
  assert.equal((sv.actions!.proposals[0]!.proposedPayload['definition'] as AnalysisDefinition).id, a.definition.id, 'the definition is saved, not rendered cells');
  const ch = an(await ask(s, 'chart this'));
  const vz = (ch as unknown as { visualization: { series: { cellIds: string[] }[]; analysisId: string } }).visualization;
  assert.equal(vz.analysisId, a.definition.id); assert.ok(vz.series[0]!.cellIds[0]!.includes('§'));
  const dup = an(await ask(s, 'use this analysis for May'));
  assert.notEqual(dup.definition.id, a.definition.id); assert.equal(dup.definition.primaryPeriod, '2026-05');
  assert.deepEqual(dup.definition.rows, a.definition.rows); assert.match(dup.definition.derivedFrom!, new RegExp(a.definition.id));
  assert.deepEqual(dup.definition.book, { accountingBookId: 'CORE-GL', accountingBasis: 'US GAAP', reportingLens: 'Corporate Consolidated', currency: 'USD' }, 'book, basis, lens and currency are separate facts');
});

test('§34 analytical language the rules do not know goes to the model; Korvyn re-resolves every op', async () => {
  const scripted = new MockLLMAdapter();
  Object.defineProperty(scripted, 'provider', { value: 'scripted' });
  (scripted as unknown as { analysisEdit: () => Promise<unknown> }).analysisEdit = async () => ({ status: 'ok', latencyMs: 1, requestId: null, usage: null, model: 'scripted',
    value: { relation: 'NEW_ANALYSIS', confidence: 0.9, unsupported: null, question: null, options: [], ops: [{ op: 'NEW_STATEMENT', dimensions: ['account'], values: [], periods: ['2026-05', '2026-06'], measure: null, number: null, percent: null, statement: 'BS', rowRef: null }, { op: 'FILTER', dimensions: [], values: ['Atlantis Holdings'], periods: [], measure: null, number: null, percent: null, statement: null, rowRef: null }] } });
  /* no grid noun in these words: the conversational front door recognises the grid request and routes it back */
  (scripted as unknown as { converse: () => Promise<unknown> }).converse = async () => ({ status: 'ok', latencyMs: 1, requestId: null, usage: null, model: 'scripted', value: { conversationIntent: 'ANALYSIS_REQUEST', requiresTool: true, reply: null, unsupportedOperation: null, confidence: 0.9 } });
  const o2 = new SloaneOrchestrator(scripted, { maxPlanSteps: 8 }, () => reviewer);
  const r = await o2.turn({ sessionId: 'an-model-0001', request: 'show me two months with accounts down the side' }, reviewer);
  const a = r.objects.find((x) => x.type === 'FinancialAnalysis')!.analysis as unknown as A & { source: string };
  assert.equal(a.source, 'reasoning'); assert.deepEqual(a.definition.periods, ['2026-05', '2026-06']);
  assert.equal(a.definition.filters.length, 0, 'an invented member is rejected, never applied');
  assert.ok(o2.trace(r.traceId)!.fallbacks.some((f) => /no governed member named Atlantis/.test(f)));
});


/* ---- 8C.1 — model-first routing and the new edit ops --------------------------------------------------------------- */
const op = (o: Record<string, unknown>) => ({ dimensions: [], values: [], periods: [], measure: null, number: null, percent: null, statement: null, rowRef: null, ...o });
const scriptedOrch = (script: (req: string) => Record<string, unknown>) => {
  const sc = new MockLLMAdapter();
  Object.defineProperty(sc, 'provider', { value: 'scripted' });
  (sc as unknown as { analysisEdit: (i: { request: string; vocabulary?: unknown }) => Promise<unknown> }).analysisEdit = async (i) => {
    assert.ok(i.vocabulary, 'the governed vocabulary travels with every edit request');
    return { status: 'ok', latencyMs: 1, requestId: null, usage: null, model: 'scripted', value: { relation: 'MODIFY', confidence: 0.9, unsupported: null, question: null, options: [], ops: [], ...script(i.request) } };
  };
  return new SloaneOrchestrator(sc, { maxPlanSteps: 8 }, () => reviewer);
};

test('8C.1 model-first: account type, % floor, remove filter and undo are applied by the engine', async () => {
  const o = scriptedOrch((q) => /^tb/.test(q) ? { relation: 'NEW_ANALYSIS', ops: [op({ op: 'NEW_TRIAL_BALANCE', dimensions: ['account'], periods: ['2026-06'] })] }
    : /asset/.test(q) ? { ops: [op({ op: 'ACCOUNT_TYPE', values: ['assets'] })] }
    : /cash/.test(q) ? { ops: [op({ op: 'FILTER', values: ['10000'] })] }
    : /drop/.test(q) ? { ops: [op({ op: 'REMOVE_FILTER', values: ['10000'] })] }
    : /moved/.test(q) ? { ops: [op({ op: 'THRESHOLD', percent: 20 })] }
    : { relation: 'CORRECTION', ops: [op({ op: 'UNDO' })] });
  const s = 'an-8c1-a-xxxxxxxx', t = async (q: string) => { const r = await o.turn({ sessionId: s, request: q }, reviewer); return r.objects.find((x) => x.type === 'FinancialAnalysis')!.analysis as unknown as A & { source: string }; };
  const a1 = await t('tb june'); assert.equal(a1.source, 'reasoning'); assert.equal(a1.definition.analysisType, 'TRIAL_BALANCE');
  const a2 = await t('assets only'); assert.deepEqual(a2.definition.accountTypes, ['ASSET']);
  assert.ok(a2.result.notes.some((x) => /only asset accounts/i.test(x)));
  const a3 = await t('cash'); assert.deepEqual(a3.definition.filters[0]!.values, ['10000']);
  const a4 = await t('drop that'); assert.equal(a4.definition.filters.length, 0, 'REMOVE_FILTER drops exactly that member');
  const a5 = await t('what moved 20%'); assert.equal(a5.definition.valueFilter?.minPct, 0.2); assert.ok(a5.definition.measures.includes('VARIANCE'), 'a % floor brings its variance');
  const a6 = await t('take it back'); assert.equal(a6.definition.valueFilter, null, 'UNDO returns to the version before the threshold');
  assert.equal(a6.definition.id, a1.definition.id);
});

test('8C.1 NOT_ANALYSIS returns the turn to the rest of Sloane; NEEDS_CLARIFICATION asks and resumes', async () => {
  const o = scriptedOrch((q) => /^bs/.test(q) ? { relation: 'NEW_ANALYSIS', ops: [op({ op: 'NEW_STATEMENT', statement: 'BS', periods: ['2026-06'] })] }
    : /close/.test(q) ? { relation: 'NOT_ANALYSIS' }
    : /wrong/.test(q) ? { relation: 'NEEDS_CLARIFICATION', question: 'Which part should change?', options: ['switch to May', 'remove the entity split'] }
    : { ops: [op({ op: 'SET_PERIODS', periods: ['2026-05'] })] });
  const s = 'an-8c1-b-xxxxxxxx';
  const r1 = await o.turn({ sessionId: s, request: 'bs june' }, reviewer); assert.equal(o.trace(r1.traceId)!.route, 'ANALYSIS');
  const r2 = await o.turn({ sessionId: s, request: 'what is blocking the close' }, reviewer);
  assert.notEqual(o.trace(r2.traceId)!.route, 'ANALYSIS', 'the model said NOT_ANALYSIS; the analysis editor stood aside');
  await o.turn({ sessionId: s, request: 'bs june' }, reviewer);
  const r3 = await o.turn({ sessionId: s, request: 'that is wrong' }, reviewer);
  assert.equal(r3.state, 'CLARIFICATION_REQUIRED'); assert.equal(r3.clarification!.options.length, 2);
  const r4 = await o.turn({ sessionId: s, clarification: { pendingId: r3.clarification!.pendingId, optionId: r3.clarification!.options[0]!.id } }, reviewer);
  const a = r4.objects.find((x) => x.type === 'FinancialAnalysis')!.analysis as unknown as A;
  assert.deepEqual(a.definition.periods, ['2026-05'], 'the chosen option resumes as the request');
});

test('8C.1 a structured UI command from the grid needs no model', async () => {
  let calls = 0;
  const sc = new MockLLMAdapter(); Object.defineProperty(sc, 'provider', { value: 'scripted' });
  (sc as unknown as { analysisEdit: () => Promise<unknown> }).analysisEdit = async () => { calls++; return { status: 'ok', latencyMs: 1, requestId: null, usage: null, model: 'scripted', value: { relation: 'NEW_ANALYSIS', confidence: 0.9, unsupported: null, question: null, options: [], ops: [op({ op: 'NEW_STATEMENT', statement: 'BS', periods: ['2026-06'] })] } }; };
  const o = new SloaneOrchestrator(sc, { maxPlanSteps: 8 }, () => reviewer);
  const s = 'an-8c1-c-xxxxxxxx';
  const r1 = await o.turn({ sessionId: s, request: 'bs june' }, reviewer);
  const a1 = r1.objects.find((x) => x.type === 'FinancialAnalysis')!.analysis as unknown as A;
  const g = a1.result.rows.find((r) => r.kind === 'group')!;
  const before = calls;
  const r2 = await o.turn({ sessionId: s, request: `expand ${g.label}`, focus: { analysisId: a1.definition.id, rowId: g.id, command: 'EXPAND' } }, reviewer);
  assert.equal(calls, before, 'no model call for a chevron');
  assert.equal(o.trace(r2.traceId)!.route, 'ANALYSIS');
});
