/**
 * Phase 3A — governed tool coverage. No provider call.   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { ControlService } from './controls.js';
import { FinancialDataService } from './financials.js';
import { GovernedLedger } from './governed.js';
import { deterministicInterpret, SloaneOrchestrator } from './orchestrator.js';
import { authorize, ROLES, toolRegistry } from './tools.js';
import './toolset.js';

/* the orchestrator binds and seeds the (in-memory, under the test runner) work store the control services read */
const base = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 });
const data: FinancialDataService = base.data;
const gl: GovernedLedger = base.gl;
const controls: ControlService = base.controls;
const FIXTURE: Record<string, string> = {
  period: '2026-06', comparisonPeriod: '2026-05', periodStart: '2026-01', periodEnd: '2026-06', scope: 'GROUP', entity: 'MDH', account: '15000',
  dimension: 'project', vendor: 'Siemens Energy', project: 'SV-PH2', reconciliationId: 'REC-MDH-13100', reportId: 'RPT-CFO-MONTHLY',
  auditPopulationId: 'AUD-POP-CIP-ADD', pbcId: 'PBC-2026-001', text: 'CIP',
};
const reviewer = { id: 'u', name: 'u', ...ROLES['FINANCE_REVIEWER']! };
const reviewerEnv = { data, gl, controls, visible: 'ALL' as const, actor: reviewer, objectId: 'FO-1' };

test('every READ tool runs on governed inputs and returns a well-formed FinancialObject', () => {
  const pop = gl.definePopulation({ accounts: ['15000'], periodStart: '2026-06', periodEnd: '2026-06' });
  const line = gl.lines.find((l) => l.vendor && l.account !== '20100')!;
  const read = toolRegistry.all().filter((t) => t.risk === 'READ');
  assert.ok(read.length >= 75, `expected ≥ 75 read tools, have ${read.length}`);
  for (const t of read) {
    const args: Record<string, string> = {};
    for (const p of t.params) {
      if (p.name === 'populationId') args[p.name] = pop.id;
      else if (p.name === 'transactionId') args[p.name] = line.key;
      else if (p.name === 'journalId') args[p.name] = line.journalId;
      else if (p.name === 'objectRef') { if (!t.params.some((x) => x.name === 'populationId')) args[p.name] = `txn:${line.key}`; }
      else if (p.required || p.name === 'period' || p.name === 'scope') { const v = FIXTURE[p.name]; if (v) args[p.name] = v; }
    }
    const o = t.run(args, reviewerEnv).object;
    assert.ok(o.id && o.type && o.title && Array.isArray(o.facts) && o.governed, t.id);
    assert.ok(['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'].includes(o.status), t.id);
    if (o.status === 'UNAVAILABLE') assert.ok(o.unavailable?.reason, `${t.id} states why`);
    assert.ok(o.table.rows.length <= 60, `${t.id} returned ${o.table.rows.length} rows to the browser`);
    for (const f of o.facts) assert.ok(typeof f.display === 'string' && f.display.length > 0, `${t.id}.${f.key} display`);
  }
});

test('populations are definitions with ids: counts and totals server-side, one bounded page out', () => {
  const def = gl.definePopulation({ periodStart: '2026-01', periodEnd: '2026-06' });
  const q = gl.query(def, 'ALL', { limit: 500 });
  assert.ok(q.rowCount > 1000 && q.page.length === 50 && q.nextCursor === 50, `${q.rowCount} rows, page ${q.page.length}`);
  assert.equal(gl.definePopulation({ periodEnd: '2026-06', periodStart: '2026-01' }).id, def.id, 'same definition, same id');
  assert.ok(Math.abs(q.debitUsd - q.creditUsd - q.netUsd) < 1e-6);
  const r = toolRegistry.get('getGovernedPopulation')!.run({ periodStart: '2026-01', periodEnd: '2026-06' }, reviewerEnv);
  assert.ok(r.object.population && r.object.population.rowCount === q.rowCount && r.object.table.rows.length <= 15);
});

test('one aggregation engine: every dimension foots to the same population total', () => {
  const rows = gl.lines.filter((l) => l.period === '2026-06' && gl.expandAccounts(['15000']).includes(l.account));
  const tot = rows.reduce((s, l) => s + l.usd, 0);
  for (const d of ['entity', 'project', 'vendor', 'account', 'currency', 'costCenter'] as const) {
    const s = gl.aggregate(rows, d).reduce((x, g) => x + g.current, 0);
    assert.ok(Math.abs(s - tot) < 0.01, `${d}: ${s} vs ${tot}`);
  }
});

test('reconciliations: intercompany does not tie, subledger CIP ties, bank cannot be proven', () => {
  const rs = controls.reconciliations('2026-06', 'ALL');
  assert.equal(rs.find((r) => r.id === 'REC-MDH-13100')!.tieStatus, 'NOT_TIED');
  assert.equal(rs.find((r) => r.id === 'REC-MGP-REIT-13100')!.tieStatus, 'TIED');
  assert.ok(rs.filter((r) => r.method === 'SUBLEDGER').every((r) => r.tieStatus === 'TIED'));
  assert.ok(rs.filter((r) => r.method === 'BANK').every((r) => r.tieStatus === 'SOURCE_NOT_CONNECTED'));
});

test('permissions: exposure is filtered by permission, and rows by entity scope', () => {
  const actor = { id: 'u', name: 'u', ...ROLES['ENTITY_ACCOUNTANT']! };
  const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => actor);
  const ex = orch.planner.allowlist(actor, null, 'audit population selections pbc', orch.context.initial(actor));
  assert.ok(!ex.tools.some((t) => t.domain === 'audit'), 'no audit tool is exposed to an entity accountant');
  const r = toolRegistry.get('getGovernedPopulation')!.run({ periodStart: '2026-06', periodEnd: '2026-06' }, { ...reviewerEnv, actor, visible: new Set(['MDH']) });
  assert.ok(r.object.population!.rowCount > 0 && r.object.table.rows.every((x) => x.cells[1] === 'MDH'));
  const auditor = { id: 'a', name: 'a', ...ROLES['EXTERNAL_AUDITOR']! };
  assert.ok(!authorize(auditor, toolRegistry.get('getFluxComments')!).ok, 'an auditor does not read flux workflow comments');
});

test('unavailable capabilities say so: cash flow, prior year, write tools', async () => {
  assert.equal(toolRegistry.get('getCashFlowStatement')!.run({}, reviewerEnv).object.status, 'UNAVAILABLE');
  const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 });
  const a = await orch.turn({ sessionId: 'test-fy25-0001', request: 'Show Siemens spend for FY26' });
  assert.equal(a.state, 'ANSWER', JSON.stringify(a.notes));
  const b = await orch.turn({ sessionId: 'test-fy25-0001', request: 'Compare that to last year' });
  assert.equal(b.state, 'UNAVAILABLE');
  assert.ok(b.notes.some((n) => /not in the governed ledger/.test(n)), JSON.stringify(b.notes));
  assert.ok(toolRegistry.all().filter((t) => t.risk !== 'READ' && t.risk !== 'PROPOSE').every((t) => t.id === 'postJournalEntry'), 'the only non-read, non-propose tool is the refused posting tool');
});

test('context chain (deterministic engine): financials → largest → by project → GL → missing support', async () => {
  const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 });
  const sid = 'test-chain-0001';
  const expect = [['Show me June financials', 'getFinancialSummary'], ['what changed the most?', 'getLargestFinancialMovements'], ['break that down by project', 'getDriverAnalysis'], ['show me the GL', 'getAccountActivity'], ['which of these transactions have missing support?', 'findMissingEvidence']];
  let focus = '';
  for (const [q, tool] of expect) {
    const r = await orch.turn({ sessionId: sid, request: q! });
    const tr = orch.trace(r.traceId)!;
    assert.equal(r.state, 'ANSWER', `${q}: ${JSON.stringify(r.notes)} ${JSON.stringify(tr.plan)}`);
    assert.equal(tr.toolsExecuted[0]?.tool, tool, q);
    if (tool === 'getLargestFinancialMovements') focus = r.objects[0]!.refs['largestAccount']!;
    if (tool === 'getDriverAnalysis' || tool === 'getAccountActivity') assert.equal(tr.toolsExecuted[0]!.args['account'], focus, `${q} stays on the largest mover`);
    if (tool === 'findMissingEvidence') assert.ok(tr.toolsExecuted[0]!.args['populationId']?.startsWith('POP-'), 'uses the population in context');
  }
  assert.equal(deterministicInterpret('Show Siemens spend for FY26', data, orch.context.initial(reviewer)).periodRange?.end, '2026-12');
});
