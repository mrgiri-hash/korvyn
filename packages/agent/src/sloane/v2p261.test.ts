/**
 * SLOANE CORE RUNTIME V2 — PHASE 2.6.1. CONSOLIDATION-CONSISTENT ANALYTICAL POPULATIONS.
 *
 * WHAT THESE PIN, AND WHY THEY ARE THE TESTS THAT WERE MISSING.
 *
 * Phase 2.6 shipped a consolidated income statement and an account-level analytical layer that read the ledger
 * WITHOUT the elimination the statement applied. Both were governed, both were right about their own population,
 * and nothing in the runtime ever compared them — so Sloane could explain a consolidated movement using drivers
 * from a different economic population, and the only reason it went unseen for a phase is that no test asked the
 * two to agree.
 *
 * So the first two tests here (A, B) are that question: does a statement section equal the accounts beneath it,
 * read the way an analytical drill reads them. Everything after that guards the ways the fix could be undone —
 * a second elimination engine, a silently lost pre-elimination view, a metric whose components came from two
 * populations, a comparison across incompatible views, a permission that stopped applying.
 *
 * NOTHING HERE ASSERTS A HARD-CODED AMOUNT WHERE A RELATIONSHIP WILL DO. A test that pins $13.0116M passes for a
 * book and fails for a fixture; a test that pins "the statement equals its own detail" is true of every book, and
 * is the property the phase is actually about.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ELIMINATION_TREATMENTS, FinancialDataService, IC_RELATIONSHIPS, eliminatesIn, icRelationshipOf,
} from './financials.js';
import { GovernedLedger } from './governed.js';
import { ControlService } from './controls.js';
import { type Actor, type ToolEnv, ROLES, serverActor, toolRegistry, visibleOf } from './tools.js';
import './toolset.js';
import { isValues } from './toolset.js';
import { FactRegistry, factsFrom, populationMismatch } from './v2/facts.js';

const data = new FinancialDataService();
const gl = new GovernedLedger(data);
const controls = new ControlService(gl);
const actor = serverActor();
const env: ToolEnv = { data, gl, controls, actor, visible: visibleOf(actor), objectId: 'T261' };
const run = (id: string, args: Record<string, string>, e: ToolEnv = env) => toolRegistry.get(id)!.run(args, e).object;
const fact = (o: ReturnType<typeof run>, key: string) => o.facts.find((f) => f.key === key);

/** the book's own tolerance for "nothing": half a cent, which is what the statement and the ledger both use */
const CENT = 0.005;
const P = '2026-06', PRIOR = '2026-05';
/** the three income-statement sections whose account groups this chart maps; the map is `toolset.ts`'s SECTION_CODES */
const SECTIONS: [string, keyof ReturnType<typeof isValues>][] = [['40000', 'rev'], ['50000', 'cop'], ['60000', 'opx'], ['65000', 'dna']];

const FACT_CTX = { book: 'CORE-GL', basis: 'US GAAP', lens: 'Corporate Consolidated', turn: 1 };
const factsOf = (o: ReturnType<typeof run>) => factsFrom(o, FACT_CTX);

/* ================================================================================================
   A / B — THE STATEMENT AND ITS OWN DETAIL (§7, §8)
   ================================================================================================ */

test('P2.6.1 A: every consolidated statement section equals its account GROUP read from the ledger', () => {
  for (const p of [PRIOR, P]) {
    const c = isValues(env, [p]);
    for (const [code, field] of SECTIONS) {
      const group = gl.presented(code, gl.balanceUsd([code], p, 'ALL'));
      assert.ok(Math.abs(group - c[field]) < CENT,
        `${code} at ${p}: the statement says ${c[field]} and the account group reads ${group}`);
    }
  }
});

test('P2.6.1 B: and it equals the sum of the individual ACCOUNTS beneath it', () => {
  for (const p of [PRIOR, P]) {
    const c = isValues(env, [p]);
    for (const [code, field] of SECTIONS) {
      const kids = gl.expandAccounts([code]);
      assert.ok(kids.length > 0, `${code} has accounts beneath it`);
      const sum = kids.reduce((t, x) => t + gl.presented(x, gl.balanceUsd([x], p, 'ALL')), 0);
      assert.ok(Math.abs(sum - c[field]) < CENT,
        `${code} at ${p}: statement ${c[field]} against ${kids.length} accounts totalling ${sum}`);
    }
  }
});

test('P2.6.1 §8: and the comparison SAYS so, rather than leaving a reader to check', () => {
  const o = run('compareStatement', { period: P, comparisonPeriod: PRIOR });
  const f = fact(o, 'detailReconciles');
  assert.ok(f, 'the comparison states whether its own detail reconciles');
  assert.equal(f!.value, 'YES');
  /* §15 — and the failure path says what to do about it, rather than reporting a number */
  assert.ok(!/do not attribute/i.test(f!.display), 'a reconciling comparison carries no warning');
});

/* ================================================================================================
   C — THE PRE-ELIMINATION VIEW IS STILL REACHABLE, AND STILL DIFFERENT (§5, §6)
   ================================================================================================ */

test('P2.6.1 C: the pre-elimination view is available, and source = consolidated + eliminations', () => {
  let seen = 0;
  for (const [code] of SECTIONS) {
    const con = gl.presented(code, gl.balanceUsd([code], P, 'ALL', undefined, 'CONSOLIDATED'));
    const pre = gl.presented(code, gl.balanceUsd([code], P, 'ALL', undefined, 'PRE_ELIMINATION'));
    const only = gl.presented(code, gl.balanceUsd([code], P, 'ALL', undefined, 'ELIMINATIONS_ONLY'));
    /* §6 — the lineage holds on every line, whether or not anything was eliminated on it */
    assert.ok(Math.abs(pre - con - only) < CENT, `${code}: pre ${pre} − eliminated ${only} ≠ consolidated ${con}`);
    if (Math.abs(only) >= CENT) seen++;
  }
  assert.ok(seen > 0, 'at least one section genuinely eliminates, or this test proves nothing');
});

test('P2.6.1 §5: an entity reading ALONE still sees its own intercompany activity', () => {
  /* the relationship is only internal to a population that covers BOTH parties; MDH by itself is not that
     population, and a figure that vanished here would be an entity being told its own books are empty */
  const rel = IC_RELATIONSHIPS.find((r) => r.sections.includes('INCOME_STATEMENT'))!;
  const one = new Set([rel.parties[0]!]);
  const con = gl.balanceUsd(['60000'], P, one, [rel.parties[0]!], 'CONSOLIDATED');
  const pre = gl.balanceUsd(['60000'], P, one, [rel.parties[0]!], 'PRE_ELIMINATION');
  assert.ok(Math.abs(con - pre) < CENT, 'a single party eliminates nothing, because nothing is internal to it');
});

test('P2.6.1 §16: there is ONE elimination rule, and the ledger and the statement both read it', () => {
  /* the guard against a second engine: the predicate is declared once and is the only thing that decides */
  assert.deepEqual([...ELIMINATION_TREATMENTS], ['CONSOLIDATED', 'PRE_ELIMINATION', 'ELIMINATIONS_ONLY']);
  for (const r of IC_RELATIONSHIPS) {
    assert.ok(r.parties.length >= 2, `${r.id} names the parties it is between`);
    /* §17 — a relationship Korvyn cannot eliminate soundly says WHY, rather than being quietly absent */
    if (!r.sections.length) assert.ok(r.notEliminated, `${r.id} declares why it is not eliminated`);
  }
  const fee = IC_RELATIONSHIPS.find((r) => r.sections.includes('INCOME_STATEMENT'))!;
  const line = gl.lines.find((l) => l.intercompany && icRelationshipOf(l.description)?.id === fee.id);
  assert.ok(line, 'the book carries the relationship the rule describes');
  assert.equal(eliminatesIn(line!.description, null, 'INCOME_STATEMENT'), true);
  /* the SAME description in a section the relationship does not eliminate in does not eliminate */
  assert.equal(eliminatesIn(line!.description, null, 'BALANCE_SHEET'), false);
});

/* ================================================================================================
   D — A DERIVED METRIC'S COMPONENTS SHARE ONE ELIMINATION CONTEXT (§9)
   ================================================================================================ */

test('P2.6.1 D: EBITDA and every component fact carry the same elimination treatment', () => {
  const o = run('calculateMetric', { metric: 'EBITDA', period: P, comparisonPeriod: PRIOR });
  assert.equal(o.status, 'AVAILABLE');
  const fs = factsOf(o).filter((f) => typeof f.rawValue === 'number');
  assert.ok(fs.length >= 3, 'the metric and its components are all facts');
  const treatments = [...new Set(fs.map((f) => f.eliminationTreatment))];
  assert.deepEqual(treatments, ['CONSOLIDATED'], 'one population, by construction');
  /* §12 — and the check agrees, which is what a bridge would ask before subtracting them */
  assert.deepEqual(populationMismatch(fs), []);
});

test('P2.6.1 §9: the metric is arithmetic over the SAME statement the sections come from', () => {
  const o = run('calculateMetric', { metric: 'EBITDA', period: P });
  const v = Number(fact(o, 'metric')!.value);
  const c = isValues(env, [P]);
  assert.ok(Math.abs(v - (c.rev - c.cop - c.opx)) < CENT, 'no second consolidation ran underneath the metric');
});

/* ================================================================================================
   E / F — COMPARISONS AND DRIVER RANKING STAY INSIDE ONE POPULATION (§10, §11)
   ================================================================================================ */

test('P2.6.1 E: a May/June comparison compares compatible populations', () => {
  const o = run('compareStatement', { period: P, comparisonPeriod: PRIOR });
  const fs = factsOf(o).filter((f) => typeof f.rawValue === 'number');
  assert.ok(fs.length > 0);
  /* period is the one dimension a comparison is ALLOWED to vary; everything else must hold */
  assert.deepEqual(populationMismatch(fs), []);
  assert.ok(new Set(fs.map((f) => f.period)).size >= 1);
});

test('P2.6.1 F: the ranked movers are the movement they explain, not a different view of it', () => {
  const o = run('compareStatement', { period: P, comparisonPeriod: PRIOR });
  const cur = isValues(env, [P]), pri = isValues(env, [PRIOR]);
  const byLabel = new Map<string, number>();
  for (let i = 1; i <= 6; i++) {
    const l = fact(o, `mover${i}.label`), ch = fact(o, `mover${i}.change`);
    if (l && ch) byLabel.set(String(l.value), Number(ch.value));
  }
  assert.ok(byLabel.size > 0, 'something moved');
  const EXPECTED: Record<string, keyof typeof cur> = {
    Revenue: 'rev', 'Cost of operations': 'cop', 'Operating expenses': 'opx',
    'Depreciation & amortisation': 'dna', 'Other income & expense': 'oth',
  };
  for (const [label, change] of byLabel) {
    const field = EXPECTED[label];
    assert.ok(field, `a ranked mover is a canonical statement component: ${label}`);
    assert.ok(Math.abs(change - (cur[field!] - pri[field!])) < CENT,
      `${label}: the ranking says ${change} and the consolidated statement says ${cur[field!] - pri[field!]}`);
  }
  /* §11 — the ranking is Korvyn's, in absolute movement, and never crosses into another view to find a bigger one */
  const vals = [...byLabel.values()].map(Math.abs);
  assert.deepEqual(vals, [...vals].sort((x, y) => y - x), 'ranked by absolute movement');
});

test('P2.6.1 §12: two figures from different populations are REFUSED as a comparison', () => {
  /* the check has to catch the exact case this phase removed, or it is decoration: one consolidated figure and
     one pre-elimination figure, both governed, whose difference is not a movement */
  const o = run('compareStatement', { period: P, comparisonPeriod: PRIOR });
  const [a] = factsOf(o).filter((f) => typeof f.rawValue === 'number');
  assert.ok(a);
  const crossed = { ...a!, factId: 'f_pre', eliminationTreatment: 'PRE_ELIMINATION' as const };
  const bad = populationMismatch([a!, crossed]);
  assert.equal(bad.length, 1);
  assert.equal(bad[0]!.dimension, 'consolidation');
  /* and a difference of SCOPE is caught by the same check, with no rule of its own */
  assert.ok(populationMismatch([a!, { ...a!, factId: 'f_s', scope: 'MDH' }]).some((m) => m.dimension === 'scope'));
});

/* ================================================================================================
   G — PERMISSIONS (§20)
   ================================================================================================ */

test('P2.6.1 G: a scoped reader still sees only its own entity, and eliminates nothing', () => {
  const scoped: Actor = { id: 'user:mdh', name: 'MDH', ...ROLES['ENTITY_ACCOUNTANT']! };
  assert.notEqual(scoped.scopeIds, 'ALL');
  const only = scoped.scopeIds as string[];
  const senv: ToolEnv = { ...env, actor: scoped, visible: visibleOf(scoped), objectId: 'T261S' };
  const vis = visibleOf(scoped);
  assert.notEqual(vis, 'ALL');
  /* the consolidation predicate reads the population the READER covers, so a reader who cannot see both
     parties to a relationship cannot have it eliminated out from under them */
  const con = gl.balanceUsd(['60000'], P, vis, only, 'CONSOLIDATED');
  const pre = gl.balanceUsd(['60000'], P, vis, only, 'PRE_ELIMINATION');
  assert.ok(Math.abs(con - pre) < CENT, 'nothing is internal to a single-entity population');
  /* and the scoped read is genuinely narrower than the group's */
  const group = gl.balanceUsd(['60000'], P, 'ALL');
  assert.ok(Math.abs(group) > Math.abs(con) + CENT, 'the scoped figure is not the group figure');
  const o = run('getIncomeStatement', { periodStart: P, periodEnd: P, scope: only[0]! }, senv);
  assert.equal(o.status, 'AVAILABLE');
});

/* ================================================================================================
   H — THE DRILL CHAIN CARRIES THE POPULATION (§13, §14)
   ================================================================================================ */

test('P2.6.1 H: a fact carries its population, and a drill from it stays in the same one', () => {
  const stmt = factsOf(run('getIncomeStatement', { periodStart: P, periodEnd: P, scope: 'GROUP' }));
  const acct = factsOf(run('getAccountAnalysis', { account: '60000', period: P }));
  for (const f of [...stmt, ...acct]) assert.ok(ELIMINATION_TREATMENTS.includes(f.eliminationTreatment));
  const nums = [...stmt, ...acct].filter((f) => typeof f.rawValue === 'number');
  assert.ok(nums.length >= 2);
  /* the whole point: a statement figure and the account drill beneath it may now be cited in one sentence */
  assert.deepEqual(populationMismatch(nums).filter((m) => m.dimension === 'consolidation'), []);
});

test('P2.6.1 §14: "does this include eliminations?" is a governed fact, stated in words', () => {
  const is = run('getIncomeStatement', { periodStart: P, periodEnd: P, scope: 'GROUP' });
  const bs = run('getBalanceSheet', { period: P });
  const fi = fact(is, 'consolidationBasis'), fb = fact(bs, 'consolidationBasis');
  assert.ok(fi && fb, 'both statements answer it');
  assert.match(fi!.display, /^Yes/, 'the income statement eliminates, and says so');
  assert.match(fb!.display, /not eliminated/i, 'the balance sheet does not, and says why');
  /* §13 — the internal vocabulary never reaches the sentence a person reads */
  for (const f of [fi!, fb!]) for (const w of ['PRE_ELIMINATION', 'ELIMINATIONS_ONLY', 'CONSOLIDATED']) {
    assert.ok(!f.display.includes(w), `the enum ${w} is not shown to a reader`);
  }
  /* and the reason the balance sheet does not eliminate is the declared one, not a sentence written twice */
  const off = IC_RELATIONSHIPS.find((r) => !r.sections.includes('BALANCE_SHEET') && r.notEliminated);
  if (off) assert.ok(fb!.display.includes(off.notEliminated!), 'read from the relationship, not restated');
});

test('P2.6.1 §15: a registry of facts from one read is internally comparable', () => {
  const reg = new FactRegistry();
  reg.add(factsOf(run('compareStatement', { period: P, comparisonPeriod: PRIOR })));
  const all = reg.snapshot().filter((f) => typeof f.rawValue === 'number');
  assert.ok(all.length > 0);
  assert.deepEqual(populationMismatch(all), []);
});
