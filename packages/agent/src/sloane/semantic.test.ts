/**
 * Phase 8A — the enterprise financial semantic layer. No provider call: the real orchestrator in deterministic mode,
 * the Financial Graph over the governed services, and the tenant calendar.   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator, type TurnResponse, deterministicInterpret, scopeNamedBy } from './orchestrator.js';
import { type Actor, ROLES, toolRegistry } from './tools.js';
import { DEV_DIRECTORY, actorContext } from './auth.js';
import { financialGraph } from './semantic/graph.js';
import { resolvePeriods } from './semantic/time.js';
import { MAX_OBJECTS, MAX_RELATIONS } from './semantic/context.js';
import { SEMANTIC_TOOLS } from './semantic/tools.js';
import { TENANT_CALENDAR, setRelativePeriodPolicy } from './agent/ambiguity.js';

const reviewer: Actor = { id: 'user:mgiri', name: 'Mitra Giri', ...ROLES['FINANCE_REVIEWER']! };
const mdh = actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:mdh')!, null, 'test');
const auditor = actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:auditor')!, null, 'test');
const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => reviewer);
const g = financialGraph({ data: orch.data, gl: orch.gl, controls: orch.controls, artifacts: orch.artifacts });
const T = { periods: orch.gl.periods(), workingPeriod: orch.data.workingPeriod() };
let n = 0;
const ask = async (q: string, actor: Actor = reviewer, sessionId = `sem-${++n}`) => { const r = await orch.turn({ sessionId, request: q }, actor); assert.notEqual(r.state, 'ERROR', `${q}: ${JSON.stringify(r.notes)}`); return r; };
const tools = (r: TurnResponse) => orch.trace(r.traceId)!.toolsExecuted.map((x) => x.tool);
const fact = (r: TurnResponse, key: string) => r.objects.flatMap((o) => o.facts).find((f) => f.key === key)?.display;

/* ---- §2/§4: the model and the graph ------------------------------------------------------------------ */
test('the graph is built from the owning services, and every object names its source', () => {
  const s = g.snapshot(reviewer);
  for (const t of ['LegalEntity', 'ConsolidationNode', 'Project', 'Vendor', 'Account', 'FinancialStatementLine', 'FluxItem', 'Reconciliation', 'CloseTask', 'CloseBlocker', 'Report', 'AuditRequest', 'User', 'Period', 'Budget'])
    assert.ok([...s.nodes.values()].some((o) => o.type === t), `no ${t} in the graph`);
  for (const o of s.nodes.values()) assert.ok(o.source && !/graph/i.test(o.source.split('(')[0]!), `${o.id} names no owning service`);
  for (const e of s.edges) assert.ok(s.nodes.has(e.from) && s.nodes.has(e.to), `dangling edge ${e.from} ${e.rel} ${e.to}`);
  assert.equal(s.nodes.get('entity:MER-DE')!.attrs['parent'], 'MDH');
  assert.ok(s.edges.some((e) => e.from === 'entity:MER-DE' && e.rel === 'CHILD_OF' && e.to === 'entity:MDH'));
  assert.ok(s.edges.some((e) => e.from === 'fsline:FS-CIP' && e.rel === 'MAPPED_FROM' && e.to === 'account:15000'));
  assert.ok(s.edges.some((e) => e.from === 'account:15000' && e.rel === 'RECONCILED_BY' && e.to === 'recon:REC-MDH-15000'));
});

/* ---- §17: intent — what a word refers to ---------------------------------------------------------------- */
test('§17 close, flux, budget vs actual, South Valley, Siemens, June', () => {
  const r = (q: string) => g.resolve(q, reviewer);
  const close = r('close'); assert.equal(close.status, 'RESOLVED'); assert.equal(close.status === 'RESOLVED' && close.object.type, 'Close');
  const flux = r('flux'); assert.equal(flux.status === 'RESOLVED' && flux.object.id, `fluxanalysis:${T.workingPeriod}`);
  const bva = r('budget vs actual'); assert.equal(bva.status, 'MULTIPLE');
  if (bva.status === 'MULTIPLE') { assert.equal(bva.objects.find((o) => o.type === 'Budget')!.governed, false); assert.equal(bva.objects.find((o) => o.type === 'Actual')!.governed, true); }
  const sv = r('South Valley'); assert.equal(sv.status, 'RESOLVED');
  if (sv.status === 'RESOLVED') { assert.equal(sv.object.id, 'project:SV-PH2'); assert.equal(sv.object.attrs['isLegalEntity'], false); assert.match(g.describe(sv.object), /not a legal entity/); }
  const sie = r('Siemens'); assert.equal(sie.status, 'AMBIGUOUS');
  if (sie.status === 'AMBIGUOUS') { assert.equal(sie.candidates.length, 3); assert.equal(sie.candidates.filter((c) => c.object.attrs['hasActivity']).length, 1); }
  const jun = r('June'); assert.equal(jun.status === 'RESOLVED' && jun.object.id, 'period:2026-06');
  assert.equal(r('Sarah').status, 'AMBIGUOUS');
  const ic = r('intercompany'); assert.equal(ic.status, 'AMBIGUOUS', 'receivable and payable are two lines');
  const cip = r('CIP'); assert.equal(cip.status === 'RESOLVED' && cip.object.id, 'account:15000');
});

test('§17 through Sloane: a bare name is resolved, never asked to be rephrased', async () => {
  /* Phase 8B: a bare name now OPENS its financial context as a canvas (the resolution is the same semantic object) */
  const canvasOf = (r: TurnResponse) => r.objects[0]!.canvas as { kind: string; intent: { subject: { id: string } | null; notes: string[] }; notes: string[] };
  const sv = await ask('South Valley'); assert.equal(canvasOf(sv).kind, 'OBJECT'); assert.equal(canvasOf(sv).intent.subject!.id, 'project:SV-PH2');
  const sie = await ask('Siemens'); assert.equal(canvasOf(sie).intent.subject!.id, 'vendor:Siemens Energy'); assert.match(canvasOf(sie).notes.join(' '), /Siemens AG and Siemens Mobility/);
  const bva = await ask('budget vs actual'); assert.equal(bva.state, 'UNAVAILABLE'); assert.match(canvasOf(bva).notes.join(' '), /no governed planning version/i);
  const q = await ask('What is South Valley?'); assert.deepEqual(tools(q), ['resolveFinancialObject'], 'a question still goes to the semantic tool');
});

/* ---- §8: time intelligence --------------------------------------------------------------------------- */
test('§8 periods resolve against the tenant calendar and say how much is governed', () => {
  const one = (q: string) => resolvePeriods(q, T)[0]!;
  assert.equal(one('June').start, '2026-06');
  assert.equal(one('Jun-26').start, '2026-06');
  assert.equal(one('June 30, 2026').start, '2026-06', 'a day is not a year');
  assert.equal(one('current month').start, T.workingPeriod);
  assert.equal(one('last month').start, '2026-05');
  assert.deepEqual([one('YTD').start, one('YTD').end], ['2026-01', '2026-06']);
  assert.equal(one('FY26').status, 'PARTIAL'); assert.equal(one('FY26').end, '2026-12');
  assert.equal(one('FY27').status, 'NOT_GOVERNED');
  assert.equal(one('prior year').status, 'NOT_GOVERNED');
  assert.equal(one('prior forecast').kind, 'PLANNING');
  assert.equal(one('close period').start, T.workingPeriod);
  assert.deepEqual([one('quarter').start, one('quarter').end], ['2026-04', '2026-06']);
  assert.equal(resolvePeriods('decide the market for junior staff', T).length, 0);
  const was = TENANT_CALENDAR.relativePeriods;
  try {
    setRelativePeriodPolicy('ASK_WHEN_OPEN'); assert.equal(one('last quarter').status, 'AMBIGUOUS', 'June is open and closes Q2');
    setRelativePeriodPolicy('LAST_COMPLETED'); assert.equal(one('last quarter').start, '2026-01');
  } finally { setRelativePeriodPolicy(was); }
});

/* ---- §18: cross-domain questions --------------------------------------------------------------------- */
test('§18 which subsidiaries still have open reconciliations', async () => {
  const r = await ask('Which subsidiaries still have open reconciliations?');
  assert.deepEqual(tools(r), ['getOpenReconciliationsByEntity']);
  assert.equal(fact(r, 'subsidiaries'), '5');
  assert.match(fact(r, 'groupOpen') ?? '', /^\d+$/);
});
test('§18 who needs to review June Flux', async () => {
  const r = await ask('Who needs to review June Flux?');
  assert.deepEqual(tools(r), ['getPendingReviews']);
  const q = g.pendingReviews(reviewer, 'flux', '2026-06');
  assert.ok(q.items.every((x) => x.item.type === 'FluxItem' && x.item.attrs['material'] && x.item.attrs['status'] !== 'APPROVED'));
  assert.equal(fact(r, 'items'), String(q.items.length));
});
test('§18 the TB for South Valley: a project has no trial balance, so Korvyn says so', async () => {
  const r = await ask('Show the TB for South Valley.');
  assert.deepEqual(tools(r), ['getSubjectTrialBalance']);
  assert.equal(r.objects[0]!.type, 'SubjectBalances');
  assert.match(r.objects[0]!.title, /not a trial balance/);
  assert.match(fact(r, 'notTb') ?? '', /only a legal entity/);
  const ent = await ask('Show the TB for MDH');
  assert.match(ent.objects[0]!.title, /legal entity — use its governed trial balance/);
});
test('§18 material flux without support, reports using a line, the reconciliation behind a balance', async () => {
  const f = await ask('Which material Flux items have no support?');
  assert.deepEqual(tools(f), ['getMaterialFluxWithoutSupport']);
  assert.ok(Number(fact(f, 'count')) >= 1);
  const rep = await ask('What reports use Construction in progress?');
  assert.deepEqual(tools(rep), ['getReportsUsingObject']);
  assert.equal(fact(rep, 'reports'), '2');
  const s = `sem-chain-${++n}`;
  await ask('Who prepares the MER-DE CIP reconciliation?', reviewer, s);
  const rec = await ask('Which reconciliation supports this balance?', reviewer, s);
  assert.deepEqual(tools(rec), ['getReconciliationForBalance']);
  assert.ok(rec.objects[0]!.table.rows.some((x) => x.ref === 'recon:REC-MER-DE-15000'));
});
test('§18/§6 who owns the largest unresolved close issue, who owns a report, who prepares a reconciliation', async () => {
  const r = await ask('Who owns the largest unresolved close issue?');
  assert.deepEqual(tools(r), ['getLargestUnresolvedCloseIssue']);
  assert.equal(fact(r, 'severity'), 'BLOCKING');
  assert.match(fact(r, 'ranking') ?? '', /blocking issues first/);
  const rep = await ask('Who owns the CFO Monthly Report?');
  assert.match(rep.objects[0]!.facts.map((x) => x.display).join(' '), /Controller role \(held by Mitra Giri\)/);
  const rec = await ask('Who reviews the intercompany receivable reconciliation for MDH?');
  assert.equal(rec.objects[0]!.title, 'Who is responsible · Intercompany receivable — MDH vs foreign OpCos');
  const de = await ask('Who prepares the MER-DE CIP reconciliation?');
  assert.match(de.objects[0]!.facts.map((x) => x.display).join(' '), /K\. Weber is not in the directory/);
  const work = await ask('What open work does Lin Chen have?');
  assert.deepEqual(tools(work), ['getOpenWorkForPerson']);
});

/* ---- §19: traceability ------------------------------------------------------------------------------- */
test('§19 statement → line → account → population → transaction → source → evidence', () => {
  const { steps } = g.trace('fsline:FS-CIP', reviewer);
  assert.deepEqual(steps.map((s) => s.level), ['FinancialStatement', 'FinancialStatementLine', 'Account', 'GovernedLedgerPopulation', 'GovernedLedgerEntry', 'SourceTransaction', 'SourceSystem', 'Evidence']);
  const txn = steps.find((s) => s.level === 'GovernedLedgerEntry')!.id;
  const up = g.trace(txn, reviewer);
  assert.equal(up.steps[0]!.level, 'FinancialStatement');
  assert.equal(up.steps.find((s) => s.level === 'GovernedLedgerEntry')!.id, txn);
  const noGl = g.trace('fsline:FS-CIP', { ...reviewer, permissions: reviewer.permissions.filter((p) => p !== 'GL_VIEW') });
  assert.equal(noGl.steps.at(-1)!.level, 'Account');
});

/* ---- §20: permissions --------------------------------------------------------------------------------- */
test('§20 a scoped actor cannot discover an entity, reviewer scope or object outside their access', async () => {
  const s = g.snapshot(mdh);
  for (const id of ['entity:MGP-REIT', 'entity:MER-UK', 'consol:GROUP', 'elim:GROUP', 'recon:REC-MER-DE-15000']) assert.ok(!s.nodes.has(id), `${id} leaked`);
  assert.ok(![...s.nodes.values()].some((o) => o.type === 'FluxItem'), 'the group Flux review is group-level');
  for (const e of s.edges) assert.ok(s.nodes.has(e.from) && s.nodes.has(e.to));
  assert.ok(!s.nodes.has('person:user:slin'), 'a reviewer who works only on hidden entities is not discoverable');
  /* not found reads the same for "exists but hidden" and "does not exist" */
  const hidden = g.resolve('REIT', mdh), none = g.resolve('Atlantis', mdh);
  assert.equal(hidden.status, 'NOT_FOUND'); assert.equal(none.status, 'NOT_FOUND');
  assert.equal(hidden.status === 'NOT_FOUND' && hidden.note.replace('REIT', 'X'), none.status === 'NOT_FOUND' && none.note.replace('Atlantis', 'X'));
  const r = await ask('Which subsidiaries still have open reconciliations?', mdh);
  assert.equal(fact(r, 'subsidiaries'), '1');
  const fx = await ask('Who needs to review June Flux?', mdh);
  assert.equal(fx.objects[0]!.status, 'UNAVAILABLE', 'a scoped user is told the Flux review is outside their access, never "no one"');
  const ctx = orch.modelContext(orch.context.initial(mdh), mdh, 'What is the REIT and who reviews MER-DE?');
  assert.ok(!/MGP-REIT|MER-DE|Lindqvist/.test(JSON.stringify(ctx.semantic)), 'the prompt carries nothing outside the actor’s access');
  const a = g.snapshot(auditor);
  assert.ok(![...a.nodes.values()].some((o) => ['FluxItem', 'CloseTask', 'CloseBlocker'].includes(o.type)), 'the auditor has no flux or close access');
  const aw = await ask('What open work does Lin Chen have?', auditor);
  assert.ok(!tools(aw).includes('getOpenWorkForPerson'));
});

/* ---- §15: the assembler hands the model a neighbourhood, never the graph ---------------------------------- */
test('§15 the neighbourhood is capped, figure-free and permission-filtered', () => {
  const ctx = orch.context.initial(reviewer);
  for (const q of ['Who needs to review June Flux?', 'Why did Construction in progress move and who reviews its reconciliations, the MDH TB and the CFO report?', 'Show Siemens spend for South Valley YTD']) {
    const m = orch.semantic.forModel(reviewer, q, ctx);
    assert.ok(m.neighborhood.objects.length <= MAX_OBJECTS && m.neighborhood.relations.length <= MAX_RELATIONS);
    assert.ok(!/Usd"|"amount|readinessPct/.test(JSON.stringify(m)), 'no figures in the neighbourhood');
  }
  const sie = orch.semantic.forModel(reviewer, 'Show Siemens spend for South Valley YTD', ctx);
  assert.equal(sie.neighborhood.ambiguous[0]!.term, 'siemens');
  assert.equal(sie.neighborhood.periods[0]!.label, 'YTD Jun 2026');
  assert.ok(g.snapshot(reviewer).nodes.size > sie.neighborhood.objects.length * 10, 'the graph is never sent whole');
});

/* ---- §16: governance --------------------------------------------------------------------------------- */
test('§16 semantic tools are governed reads', () => {
  for (const t of SEMANTIC_TOOLS) { assert.equal(t.risk, 'READ'); assert.equal(toolRegistry.get(t.id), t); }
});

/* ---- §7: a project is never a scope --------------------------------------------------------------------- */
test('§7 a scope is accepted only when the words name it', () => {
  assert.equal(scopeNamedBy('South Valley', 'MDH', orch.data), false, 'a project on MDH’s books is not MDH');
  for (const n of ['MDH', 'Meridian DC Holdco LLC', 'the Holdco']) assert.equal(scopeNamedBy(n, 'MDH', orch.data), true, n);
  assert.equal(scopeNamedBy('Germany', 'MER-DE', orch.data), true);
  assert.equal(scopeNamedBy('consolidated', 'GROUP', orch.data), true);
  assert.equal(scopeNamedBy('Siemens Energy', 'MDH', orch.data), false);
  /* the live failure: the model read "SV-PH2 BELONGS_TO MDH" and returned MDH, correctly named, as the scope */
  const ctx = orch.context.initial(reviewer), q = 'Show the TB for South Valley.';
  const I = { ...deterministicInterpret(q, orch.data, ctx, orch.controls.recDefs()), scope: { candidateId: 'scope:MDH', name: 'Meridian DC Holdco LLC' } };
  const R = orch.context.resolve(I, ctx, q);
  assert.equal(R.scopeId, null); assert.match(R.warnings.join(' '), /SV-PH2 is a project, not a legal entity, so the scope stays Meridian Global Portfolio/);
  assert.equal(orch.context.resolve({ ...I, scope: { candidateId: 'scope:MDH', name: 'MDH' } }, orch.context.initial(mdh), 'Who needs to review June Flux?').warnings.length, 0, 'the scoped user’s own scope is not a change');
  assert.equal(orch.context.resolve(I, ctx, 'Show the TB for MDH').scopeId, 'MDH');
});
