/**
 * SLOANE CORE RUNTIME V2 — PHASE 2.6. DERIVED FINANCIAL INTELLIGENCE.
 *
 * What these pin: a metric does not have to be POSTED to be GOVERNED; Korvyn calculates it and the model never
 * does; the definition's status is stated rather than implied; a component this book does not hold makes the
 * metric UNAVAILABLE rather than estimated; the bridge foots; and a statement comparison ranks the WHOLE
 * statement rather than whichever line happened to carry a fact.
 *
 * The last of those is §10's bug, and the test that would have caught it is the one asserting that a ranked
 * comparison returns the cost sections above revenue when the cost sections moved more.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FinancialDataService } from './financials.js';
import { GovernedLedger } from './governed.js';
import { ControlService } from './controls.js';
import { type ToolEnv, serverActor, toolRegistry, visibleOf } from './tools.js';
import './toolset.js';
import { isValues } from './toolset.js';
import {
  DERIVED_METRICS, STATEMENT_COMPONENTS, bridgeMetric, calculateMetric, measureAsked, metricForConcept, metricById, resolveMetric,
} from './semantic/metrics.js';
import { toolDefinitions } from './v2/tools.js';
import { composedByName } from './v2/compose.js';

const data = new FinancialDataService();
const gl = new GovernedLedger(data);
const controls = new ControlService(gl);
const actor = serverActor();
const env: ToolEnv = { data, gl, controls, actor, visible: visibleOf(actor), objectId: 'T26' };
const run = (id: string, args: Record<string, string>) => toolRegistry.get(id)!.run(args, env).object;
/**
 * The book's own reconciliation tolerance: half a cent, which is what `GovernedLedger` and the statement already
 * use to decide whether a balance is nothing. An absolute CENT is not a tolerance on a figure in the hundreds of
 * thousands — it is a test of IEEE-754, and it failed on a bridge that foots to a ten-billionth of a dollar.
 */
const CENT = 0.005;
const fact = (o: ReturnType<typeof run>, key: string) => o.facts.find((f) => f.key === key);
const num = (o: ReturnType<typeof run>, key: string) => Number(fact(o, key)?.value ?? NaN);

/* ================================================================================================
   §1/§3/§4 — POSTED IS NOT GOVERNED, AND KORVYN DOES THE ARITHMETIC
   ================================================================================================ */

test('P2.6 §1: EBITDA is calculated as a governed figure even though no line posts it', () => {
  const o = run('calculateMetric', { metric: 'EBITDA', period: '2026-06' });
  assert.equal(o.status, 'AVAILABLE');
  assert.equal(o.type, 'DerivedMetric');
  const v = num(o, 'metric');
  assert.ok(Number.isFinite(v) && Math.abs(v) > 0, 'a real figure, not a refusal');
  /* §3 — and it is Korvyn's arithmetic over governed components, checked against the components themselves */
  const c = isValues(env, ['2026-06']);
  assert.ok(Math.abs(v - (c.rev - c.cop - c.opx)) < CENT, 'revenue less cost of operations less operating expenses');
});

test('P2.6 §3: the formula reads canonical statement components, never account codes', () => {
  for (const m of DERIVED_METRICS) {
    for (const ref of m.formula) {
      assert.ok(STATEMENT_COMPONENTS[ref.conceptId], `${m.metricId} names a canonical component, not a code: ${ref.conceptId}`);
      assert.ok(!/^\d/.test(ref.conceptId), 'a formula never names an account code');
    }
  }
});

test('P2.6 §5: EBITDA ties to the statement’s own operating subtotal on this chart', () => {
  /* not a definition of EBITDA — an arithmetic consequence of THIS tenant's structure, and a useful canary:
     if the two ever drift, one of them has stopped reading the governed components. */
  const m = run('calculateMetric', { metric: 'EBITDA', period: '2026-06' });
  const cmp = run('compareStatement', { period: '2026-06', comparisonPeriod: '2026-05' });
  assert.ok(Math.abs(num(m, 'metric') - num(cmp, 'noi.current')) < CENT);
});

/* ================================================================================================
   §6/§7 — TENANT, DEFAULT, CANDIDATE, UNAVAILABLE
   ================================================================================================ */

test('P2.6 §7: a standard definition with no tenant approval is DEFAULTED, and says so in words', () => {
  const r = resolveMetric('EBITDA');
  assert.equal(r.status, 'DEFAULTED');
  assert.match(r.statement, /has not approved a formal EBITDA definition/);
  /* §19 — the status reaches a person as a sentence, never as the bare word */
  const o = run('calculateMetric', { metric: 'EBITDA', period: '2026-06' });
  assert.equal(fact(o, 'status')!.display, r.statement);
  assert.notEqual(fact(o, 'status')!.display, 'DEFAULTED');
});

test('P2.6 §7: the statement’s own subtotal is GOVERNED, not defaulted', () => {
  assert.equal(resolveMetric('EBIT').status, 'GOVERNED');
  assert.equal(resolveMetric('NOI').status, 'GOVERNED');
});

test('P2.6 §7/§27: a metric whose components this book does not hold is UNAVAILABLE, never estimated', () => {
  const r = resolveMetric('WORKING_CAPITAL');
  assert.equal(r.status, 'UNAVAILABLE');
  assert.match(r.statement, /does not classify assets and liabilities as current or non-current/);
  const o = run('calculateMetric', { metric: 'WORKING_CAPITAL', period: '2026-06' });
  assert.equal(o.status, 'UNAVAILABLE');
  /* and it holds NO figure — an unavailable metric that returned a number would be the worst outcome */
  assert.ok(!o.facts.some((f) => typeof f.value === 'number'), 'nothing numeric is returned');
});

test('P2.6 §6: a tenant override would win over the standard definition, and none is recorded', () => {
  for (const m of DERIVED_METRICS) assert.equal(m.tenantOverride, null, `${m.metricId} carries no invented tenant definition`);
  const e = metricById('EBITDA')!;
  const std = calculateMetric(e, isValues(env, ['2026-06']))!;
  const overridden = calculateMetric({ ...e, tenantOverride: { approvedBy: 'T', approvedAt: 'x', formula: [{ conceptId: 'REVENUE', sign: 1 }] } }, isValues(env, ['2026-06']))!;
  assert.notEqual(std.value, overridden.value, 'the override is what is calculated, not the default');
});

/* ================================================================================================
   §15 — THE BRIDGE FOOTS
   ================================================================================================ */

test('P2.6 §15: the component bridge foots to the change in the metric, by construction', () => {
  const e = metricById('EBITDA')!;
  const pri = calculateMetric(e, isValues(env, ['2026-05']))!;
  const cur = calculateMetric(e, isValues(env, ['2026-06']))!;
  const br = bridgeMetric(e, pri, cur);
  const summed = br.steps.reduce((s, x) => s + x.change, 0);
  assert.ok(Math.abs(summed - br.change) < CENT, `steps ${summed} vs change ${br.change}`);
  assert.equal(br.steps.length, e.formula.length, 'every component is a step; none is a plug');
});

test('P2.6 §15: a rising cost lowers the metric — the sign comes from the formula, not from the reader', () => {
  const e = metricById('EBITDA')!;
  const base = isValues(env, ['2026-06']);
  const worse = { ...base, cop: base.cop + 5 };
  const br = bridgeMetric(e, calculateMetric(e, base)!, calculateMetric(e, worse)!);
  const step = br.steps.find((s) => s.conceptId === 'COST_OF_OPERATIONS')!;
  assert.ok(step.change < 0, 'cost of operations up five means EBITDA down five');
  assert.ok(Math.abs(step.change + 5) < CENT);
});

/* ================================================================================================
   §10/§11/§12/§14 — THE DRIVER BUG
   ================================================================================================ */

test('P2.6 §10: every section of the statement is ranked, so "the only mover" can never mean "the only one I can cite"', () => {
  const o = run('compareStatement', { period: '2026-06', comparisonPeriod: '2026-05' });
  const movers = [1, 2, 3, 4, 5, 6].map((i) => ({ label: String(fact(o, `mover${i}.label`)?.value ?? ''), change: num(o, `mover${i}.change`) })).filter((x) => x.label);
  /**
   * THE BUG. `getIncomeStatement` emitted facts for total revenue and net income and NOTHING ELSE — every other
   * line was a table row. Phase 2 forbids the model from stating a figure it has no fact for, so "revenue was the
   * only material mover" was the honest report of the only mover it could CITE.
   *
   * What is asserted is therefore COVERAGE and DETERMINISM, not a particular winner: which section leads is a
   * property of the data and will change next month, and a test that pinned it would be pinning the fixture.
   */
  assert.ok(movers.length >= 4, 'the whole statement is ranked, not one line');
  for (const section of ['Revenue', 'Cost of operations', 'Operating expenses', 'Depreciation & amortisation']) {
    assert.ok(movers.some((m) => m.label === section), `${section} is in the ranking`);
  }
  /* §12 — the ranking is Korvyn's arithmetic: strictly descending by absolute change */
  for (let i = 1; i < movers.length; i++) assert.ok(Math.abs(movers[i - 1]!.change) >= Math.abs(movers[i]!.change), 'ranked by absolute movement');
});

test('P2.6 §11: the comparison, the metric and the statement read ONE set of components', () => {
  /* They did not. `isValues()` sums the same account groups WITHOUT the intercompany elimination the statement
     applies, so revenue and operating expenses each came out $0.35M higher — offsetting exactly, which is why net
     income matched and nothing caught it until a comparison put both on one screen. */
  const o = run('compareStatement', { period: '2026-06', comparisonPeriod: '2026-05' });
  const st = data.incomeStatement('GROUP', ['2026-05', '2026-06']);
  const rev = [1, 2, 3, 4, 5].map((i) => ({ l: String(fact(o, `mover${i}.label`)?.value ?? ''), c: num(o, `mover${i}.change`) })).find((x) => x.l === 'Revenue')!;
  assert.ok(Math.abs(rev.c - (st.components[1]!.rev - st.components[0]!.rev)) < CENT, 'the mover is the statement\u2019s own movement');
  const m = run('calculateMetric', { metric: 'EBITDA', period: '2026-06' });
  assert.ok(Math.abs(num(m, 'component1.value') - st.components[1]!.rev) < CENT, 'and so is the metric\u2019s component');
});

test('P2.6: a consolidated comparison discloses the elimination it applied', () => {
  /**
   * THIS ASSERTION USED TO PIN THE DEFECT, AND CHANGING IT IS THE POINT OF PHASE 2.6.1.
   *
   * It required the sentence to end "account-level reads are before this elimination" — a true and careful
   * disclosure that the statement eliminated and the ledger did not, which is exactly the two-population split
   * Phase 2.6.1 removed. Both views resolve one population now, so a test demanding the old warning would be a
   * test demanding the bug back. What is asserted instead is the property that replaced it: the elimination is
   * still stated, and what it says is that the detail is on the same side of it.
   */
  const o = run('compareStatement', { period: '2026-06', comparisonPeriod: '2026-05' });
  const e = fact(o, 'eliminations');
  assert.ok(e, 'the elimination is stated');
  assert.match(String(e!.display), /eliminated from revenue and from operating expenses/);
  assert.match(String(e!.display), /every account beneath it, is after that elimination/);
  assert.ok(!/account-level reads are before/.test(String(e!.display)), 'the two populations no longer differ');
});

test('P2.6 §14: the comparison states that it covered the whole statement', () => {
  const o = run('compareStatement', { period: '2026-06', comparisonPeriod: '2026-05' });
  assert.equal(fact(o, 'coverage')!.value, 'COMPLETE');
  assert.match(String(fact(o, 'coverage')!.display), /every section of the income statement/);
  assert.ok(num(o, 'linesCompared') >= 5 && num(o, 'accountsCompared') > num(o, 'linesCompared'));
});

test('P2.6 §13: nothing is called material, because no income-statement threshold is governed', () => {
  const o = run('compareStatement', { period: '2026-06', comparisonPeriod: '2026-05' });
  const said = [o.title, ...o.facts.map((f) => `${f.label} ${f.display}`), ...o.table.columns].join(' ');
  assert.ok(!/material/i.test(said), `a ranking is "largest", not "material": ${said.slice(0, 120)}`);
});

test('P2.6 §12: a result is not a driver — net income never ranks as what drove net income', () => {
  const o = run('compareStatement', { period: '2026-06', comparisonPeriod: '2026-05' });
  const labels = [1, 2, 3, 4, 5, 6].map((i) => String(fact(o, `mover${i}.label`)?.value ?? ''));
  for (const bad of ['Net income', 'Operating income', 'Net operating income']) {
    assert.ok(!labels.includes(bad), `${bad} is a result, not a mover`);
  }
});

/* ================================================================================================
   §24/§25/§37 — NO KPI ROUTING
   ================================================================================================ */

test('P2.6 §24: ONE operation covers every derived metric', () => {
  const defs = toolDefinitions(actor);
  const metricTools = defs.filter((d) => /ebitda|margin|noi|gross|working.?capital/i.test(d.name));
  assert.equal(metricTools.length, 0, 'no tool is named after a metric');
  assert.ok(defs.some((d) => d.name === 'getMetric'), 'one composed operation covers them all');
});

test('P2.6 §25: a metric is reached through the ONE concept matcher, with no metric phrase list', () => {
  /* the dispatcher never names a metric; it resolves the concept and hands the id to Korvyn */
  const m = composedByName('getMetric')!;
  const src = m.plan.toString();
  for (const word of ['ebitda', 'margin', 'gross', 'noi']) {
    assert.ok(!src.toLowerCase().includes(`'${word}`), `the dispatcher does not match on "${word}"`);
  }
  /* Every metric hangs off a concept that already exists, so there is no second alias list — and every one is
     REACHABLE: by its concept alone, or, where a concept carries both an amount and a ratio, by the concept plus
     the measure word the person used. */
  for (const d of DERIVED_METRICS) {
    assert.ok(d.sourceConceptIds.length > 0, `${d.metricId} is reached through a concept`);
    const reachable = d.sourceConceptIds.some((c) => metricForConcept(c)?.metricId === d.metricId
      || metricForConcept(c, d.measureType)?.metricId === d.metricId);
    assert.ok(reachable, `${d.metricId} is reachable through ${d.sourceConceptIds.join('/')}`);
  }
});

test('P2.6 §8: one concept carrying both an amount and a ratio is settled by the measure word, not a metric name', () => {
  /* "gross profit" and "gross margin" are the same governed calculation expressed two ways. The noun decides,
     exactly as §13's verb decides stock from flow — and GROSS_MARGIN is the default because that is what the
     concept is called, so neither reading depends on which metric happens to be declared first. */
  assert.equal(measureAsked('what was our gross margin'), 'RATIO');
  assert.equal(measureAsked('what was our gross profit'), 'AMOUNT');
  assert.equal(measureAsked('how about EBITDA'), null);
  assert.equal(resolveMetric('GROSS_MARGIN', 'gross profit in June').metric!.metricId, 'GROSS_PROFIT');
  assert.equal(resolveMetric('GROSS_MARGIN', 'gross margin in June').metric!.metricId, 'GROSS_MARGIN');
  assert.equal(resolveMetric('GROSS_MARGIN').metric!.metricId, 'GROSS_MARGIN', 'the concept’s own name is the default');
  /* and the same rule reaches EBITDA margin without any rule that knows the word EBITDA */
  assert.equal(resolveMetric('EBITDA', 'EBITDA margin').metric!.metricId, 'EBITDA_MARGIN');
  assert.equal(resolveMetric('EBITDA', 'how about EBITDA').metric!.metricId, 'EBITDA');
});

test('P2.6 §34: a metric Korvyn holds no definition for is not invented', () => {
  const o = run('calculateMetric', { metric: 'ADJUSTED_EBITDA_WITH_RESTRUCTURING', period: '2026-06' });
  assert.equal(o.status, 'UNAVAILABLE');
  assert.ok(!o.facts.some((f) => typeof f.value === 'number' && Number.isFinite(f.value)));
});

/* ================================================================================================
   §17/§36 — LINEAGE
   ================================================================================================ */

test('P2.6 §36: a derived metric carries the accounts behind its components, so it drills like any fact', () => {
  const o = run('calculateMetric', { metric: 'EBITDA', period: '2026-06' });
  assert.ok(o.refs['account'], 'the component accounts travel on the object');
  const codes = o.refs['account']!.split(',');
  assert.ok(codes.includes('40000') && codes.includes('50000'), `revenue and cost of operations are reachable: ${codes.join(',')}`);
  assert.equal(o.refs['metricId'], 'EBITDA');
  assert.match(o.provenance.declaredInputs.join(' '), /metric definition EBITDA/);
});

test('P2.6 §33: a ratio is not calculated against nothing', () => {
  const gm = metricById('GROSS_MARGIN')!;
  assert.equal(calculateMetric(gm, { rev: 0, cop: 1, opx: 0, dna: 0, oth: 0, noi: -1, ni: -1 }), null);
  const ok = run('calculateMetric', { metric: 'OPERATING_MARGIN', period: '2026-06' });
  assert.match(fact(ok, 'metric')!.display, /%$/, 'a margin reads as a percentage');
});
