/**
 * CORE RUNTIME V2 — PHASE 2. Structural grounding, traceability and adaptive composition.
 * No provider call; the scripted pieces are Korvyn's own, which is the point — every guarantee below is
 * arithmetic or structure, not a model behaving well.   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { ROLES, toolRegistry, visibleOf, type FinancialObject, type ToolEnv } from './tools.js';
import './toolset.js';
import { conceptById, resolveMeasure } from './semantic/concepts.js';
import { composedByName } from './v2/compose.js';
import { FACT_LIMIT, FactRegistry, type FinancialFact, bareFigures, factsFrom, renderFacts, withoutRefs } from './v2/facts.js';
import { buildResponse, renderResponse } from './v2/respond.js';

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

/* ================================================================================================
   §5 / §41 — THE SIGN IS THE VALUE'S, AND THE DISPLAY IS THE SERVICE'S
   ================================================================================================ */

test('P2 §41: a negative figure keeps its governed display, and its sign is read from the value', () => {
  const reg = new FactRegistry();
  const o = objOf({
    id: 'FO-1',
    refs: { account: '15000', lineId: 'FS-CIP' },
    facts: [
      { key: 'balance', label: 'Balance', value: 4210.2, display: '4,210.2' },
      /* accounting parentheses: nothing in the STRING says negative, which is why the value decides */
      { key: 'change', label: 'Change vs May', value: -16.97, display: '(16.97)' },
    ],
  });
  const [bal, chg] = reg.add(factsFrom(o, CTX));
  assert.equal(bal!.sign, 'POSITIVE');
  assert.equal(chg!.sign, 'NEGATIVE', 'a parenthesised display must not read as positive');
  assert.equal(chg!.measure, 'VARIANCE');
  assert.equal(bal!.measure, 'BALANCE');

  /* the model never holds the number: it writes a reference and Korvyn substitutes the governed string */
  const r = renderFacts(`CIP moved {{FACT:${chg!.factId}}} in June.`, reg);
  assert.equal(r.text, 'CIP moved (16.97) in June.');
  assert.deepEqual(r.unresolved, []);
  assert.deepEqual(bareFigures(withoutRefs(`CIP moved {{FACT:${chg!.factId}}} in June.`)), [],
    'a referenced figure is not a figure the model typed');
});

test('P2: a figure that is not a number is not given a sign it does not have', () => {
  const reg = new FactRegistry();
  const [f] = reg.add(factsFrom(objOf({ id: 'FO-T', facts: [{ key: 'status', label: 'Status', value: 'TIES', display: 'Ties' }] }), CTX));
  assert.equal(f!.sign, 'NOT_NUMERIC');
});

/* ================================================================================================
   §36 — ONE FACT, ONE ID, ACROSS TURNS
   ================================================================================================ */

test('P2 §36: the same governed fact read twice keeps one id, so an old reference still resolves', () => {
  const reg = new FactRegistry();
  const facts = [{ key: 'balance', label: 'Balance', value: 4210.2, display: '4,210.2' }];
  const first = reg.add(factsFrom(objOf({ id: 'FO-1', refs: { account: '15000' }, facts }), CTX));
  /* a later turn re-reads the same figure under a NEW object id — same fact, so the same id */
  const again = reg.add(factsFrom(objOf({ id: 'FO-9', refs: { account: '15000' }, facts }), CTX));
  assert.equal(again[0]!.factId, first[0]!.factId);
  assert.equal(reg.size, 1, 'a conversation must not accumulate an id per turn for one figure');
});

/* ================================================================================================
   §6 / §42 — A FACT CANNOT BE CITED AGAINST ANOTHER OBJECT
   ================================================================================================ */

test('P2 §42: two figures from two objects keep separate ids and separate lineage', () => {
  const reg = new FactRegistry();
  const cip = objOf({ id: 'FO-CIP', refs: { account: '15000', lineId: 'FS-CIP' }, facts: [{ key: 'balance', label: 'Balance', value: 4210.2, display: '4,210.2' }] });
  const opex = objOf({ id: 'FO-OPEX', refs: { account: '50000,60000' }, facts: [{ key: 'balance', label: 'Balance', value: 128.4, display: '128.4' }] });
  const [a] = reg.add(factsFrom(cip, CTX));
  const [b] = reg.add(factsFrom(opex, CTX));

  assert.notEqual(a!.factId, b!.factId, 'the same key on different accounts is not the same fact');
  assert.deepEqual(a!.sourceObjectIds, ['FO-CIP']);
  assert.deepEqual(b!.sourceObjectIds, ['FO-OPEX']);
  assert.deepEqual(a!.trace.accountIds, ['15000']);
  assert.deepEqual(b!.trace.accountIds, ['50000', '60000']);

  /* the sentence's lineage comes from the fact it cited, never from what else the turn happened to read */
  const def = buildResponse(
    { responseType: 'FINANCIAL_SUMMARY', headline: `CIP stands at {{FACT:${a!.factId}}}.` },
    reg, { hasGovernedRead: true, objectIds: ['FO-CIP', 'FO-OPEX'] });
  assert.deepEqual(def.headline!.objectIds, ['FO-CIP']);
  assert.equal(renderResponse(def, reg).text, 'CIP stands at 4,210.2.');
});

/* ================================================================================================
   §18 — A REFERENCE THAT DOES NOT RESOLVE IS A DEFECT, NOT A STYLE NOTE
   ================================================================================================ */

test('P2 §18: an unknown fact reference is recorded and the figure is withheld', () => {
  const reg = new FactRegistry();
  const def = buildResponse({ headline: 'OPEX was {{FACT:f_nothinghere}} in June.' }, reg, { hasGovernedRead: true, objectIds: [] });
  assert.ok(def.violations.some((v) => v.includes('unknown fact reference')), def.violations.join(' / '));
  const r = renderResponse(def, reg);
  assert.deepEqual(r.unresolved, ['f_nothinghere']);
  /* the sentence is WITHHELD, not published with a hole in it — a figure that reads as data and says nothing
     is worse than admitting Korvyn does not have it */
  assert.ok(!r.text.includes('[figure unavailable]'), r.text);
  assert.ok(!/OPEX was/.test(r.text), 'the claim goes with the figure it could not resolve');
  assert.equal(r.parts.length, 1);
  assert.equal(r.parts[0]!.assertion, 'UNRESOLVED');

  /* a sentence whose OWN references resolve is untouched by another one's failure */
  const [good] = reg.add(factsFrom(objOf({ id: 'FO-K', refs: { account: '60000' }, facts: [{ key: 'balance', label: 'B', value: 3.52, display: '3.52' }] }), CTX));
  const mixed = renderResponse(buildResponse(
    { headline: `OPEX is {{FACT:${good!.factId}}}.`, summary: 'And May was {{FACT:f_missing1}}.' },
    reg, { hasGovernedRead: true, objectIds: ['FO-K'] }), reg);
  assert.equal(mixed.parts.length, 1);
  assert.equal(mixed.text, 'OPEX is 3.52.');
});

/* ================================================================================================
   §16 — A COMPANY FIGURE WITH NO GOVERNED READ BEHIND IT
   ================================================================================================ */

test('P2 §16: a figure typed with no governed read is a violation; a referenced one is not', () => {
  const reg = new FactRegistry();
  const bad = buildResponse({ headline: 'June OPEX was $128.4M.' }, reg, { hasGovernedRead: false, objectIds: [] });
  assert.ok(bad.violations.some((v) => v.startsWith('figure stated with no governed read')), bad.violations.join(' / '));
  assert.deepEqual(renderResponse(bad, reg).bare, ['$128.4M']);

  /* §17 — general finance knowledge carries no figure, so it raises nothing */
  const fine = buildResponse({ headline: 'OPEX is the cost of running the business, excluding depreciation.' }, reg, { hasGovernedRead: false, objectIds: [] });
  assert.deepEqual(fine.violations, []);
  assert.deepEqual(renderResponse(fine, reg).bare, []);
});

/* ================================================================================================
   §20 / §43 — A CAUSAL CLAIM WITH NOTHING BEHIND IT IS DEMOTED, NOT DELETED
   ================================================================================================ */

test('P2 §43: an unsupported "because" is said as inference and recorded', () => {
  const reg = new FactRegistry();
  const [f] = reg.add(factsFrom(objOf({ id: 'FO-1', refs: { account: '60000' }, facts: [{ key: 'change', label: 'Change', value: 2.1, display: '2.1' }] }), CTX));
  const def = buildResponse(
    { responseType: 'DRIVER_ANALYSIS', headline: `OPEX rose {{FACT:${f!.factId}}} because the datacentre team hired three engineers.` },
    reg, { hasGovernedRead: true, objectIds: ['FO-1'] });

  assert.equal(def.headline!.type, 'INFERENCE', 'a reason is not established by the absence of a wrong number');
  assert.ok(def.violations.some((v) => v.startsWith('causal claim without support')), def.violations.join(' / '));
  /* it is still SAID — demoted, never deleted */
  assert.ok(renderResponse(def, reg).text.includes('hired three engineers'));
});

test('P2 §43: a causal claim pointing at an approved explanation stays a fact', () => {
  const reg = new FactRegistry();
  const [f] = reg.add(factsFrom(objOf({
    id: 'FO-2',
    refs: { account: '60000', explanationId: 'EXPL-60000-2026-06', explanationStatus: 'APPROVED' },
    facts: [{ key: 'change', label: 'Change', value: 2.1, display: '2.1' }],
  }), CTX));
  assert.equal(f!.trace.fluxExplanationId, 'EXPL-60000-2026-06');

  const def = buildResponse(
    { responseType: 'DRIVER_ANALYSIS', headline: `OPEX rose {{FACT:${f!.factId}}} driven by the approved reclassification.` },
    reg, { hasGovernedRead: true, objectIds: ['FO-2'] });
  assert.equal(def.headline!.type, 'FACT');
  assert.deepEqual(def.violations, []);
});

/* ================================================================================================
   §23 / §24 / §27 / §44 — THE SHAPE FOLLOWS THE ANSWER
   ================================================================================================ */

test('P2 §44: a direct answer draws no headings at all', () => {
  const reg = new FactRegistry();
  const def = buildResponse({ responseType: 'DIRECT', headline: 'OPEX is the cost of running the business.' }, reg, { hasGovernedRead: false, objectIds: [] });
  const r = renderResponse(def, reg);
  assert.equal(r.parts.length, 1);
  assert.equal(r.parts[0]!.label, null);
  assert.ok(!r.text.includes('Summary'));
});

test('P2 §44: a thin governed answer stays a sentence; a driver analysis gets its sections', () => {
  const reg = new FactRegistry();
  const [f] = reg.add(factsFrom(objOf({ id: 'FO-1', refs: { account: '15000' }, facts: [{ key: 'balance', label: 'Balance', value: 4210.2, display: '4,210.2' }] }), CTX));

  /* nothing to scan: headings would be chrome around two sentences */
  const thin = renderResponse(buildResponse(
    { responseType: 'FINANCIAL_SUMMARY', headline: `CIP is {{FACT:${f!.factId}}}.`, summary: 'It has not moved since May.' },
    reg, { hasGovernedRead: true, objectIds: ['FO-1'] }), reg);
  assert.deepEqual(thin.parts.map((p) => p.label), [null, null]);

  const full = renderResponse(buildResponse({
    responseType: 'DRIVER_ANALYSIS',
    headline: `CIP is {{FACT:${f!.factId}}}.`,
    summary: 'Four projects moved into service.',
    keyDrivers: ['South Valley Phase 2 placed in service.', 'Dublin DUB-01 capitalised.'],
    interpretation: ['The transfer looks routine for a June close.'],
    unresolved: ['No approved explanation is on the line yet.'],
    nextActions: ['Open the Flux line'],
  }, reg, { hasGovernedRead: true, objectIds: ['FO-1'] }), reg);

  const labels = full.parts.map((p) => p.label).filter(Boolean);
  assert.deepEqual(labels, ['Summary', 'What drove it', 'What this suggests', 'Not yet established']);
  assert.equal(full.parts.filter((p) => p.assertion === 'DERIVED_CONCLUSION').length, 2);
  assert.equal(full.parts.find((p) => p.label === 'What this suggests')!.assertion, 'INFERENCE');
  assert.deepEqual(full.nextActions, ['Open the Flux line']);
});

/* ================================================================================================
   §8 — ONLY THE DRILLS THE FACT CAN ACTUALLY SUPPORT
   ================================================================================================ */

test('P2 §8: a drill that would refuse is never offered', () => {
  const bare = factsFrom(objOf({ id: 'FO-B', refs: { lineId: 'FS-CIP' }, facts: [{ key: 'balance', label: 'B', value: 1, display: '1.0' }] }), CTX)[0]!;
  assert.deepEqual(bare.availableDrills, ['STATEMENT_LINE']);

  const deep = factsFrom(objOf({
    id: 'FO-D',
    refs: { account: '15010', lineId: 'FS-CIP', journalId: 'JE-1', sourceRef: 'NS-1' },
    population: { populationId: 'POP-1', rowCount: 4, returned: 4, cursor: 0, nextCursor: null, sort: 'amount', exportHook: null },
    facts: [{ key: 'activity', label: 'Activity', value: 2, display: '2.0' }],
  }), CTX)[0]!;
  assert.deepEqual(deep.availableDrills, ['STATEMENT_LINE', 'ACCOUNT', 'TB_POPULATION', 'GL_POPULATION', 'JOURNAL', 'SOURCE_REFERENCE']);
  assert.equal(deep.measure, 'ACTIVITY');

  /* an account GROUP code drills to the group, not to one account */
  const grp = factsFrom(objOf({ id: 'FO-G', refs: { account: '60000' }, facts: [{ key: 'balance', label: 'B', value: 1, display: '1.0' }] }), CTX)[0]!;
  assert.ok(grp.availableDrills.includes('ACCOUNT_GROUP'));

  /* an object Korvyn could not answer holds no authoritative figure, so it offers nothing */
  const gone = factsFrom(objOf({
    id: 'FO-U', status: 'UNAVAILABLE', refs: { account: '15000' },
    unavailable: { capability: 'cashFlow', reason: 'not modelled' },
    facts: [{ key: 'balance', label: 'B', value: 0, display: '—' }],
  }), CTX)[0]!;
  assert.equal(gone.kind, 'UNKNOWN');
  assert.deepEqual(gone.availableDrills, []);
});

/* ================================================================================================
   §35 — THE REGISTRY KEEPS WHAT IS BEING USED
   ================================================================================================ */

test('P2 §35: eviction drops the least recently REFERENCED, not the oldest', () => {
  const reg = new FactRegistry();
  const mk = (n: number): FinancialFact => ({
    factId: `f_seed${n}`, kind: 'GOVERNED', semanticType: 'T', measure: 'AMOUNT', label: `L${n}`,
    rawValue: n, displayValue: String(n), sign: 'POSITIVE', unit: 'USD millions', currency: 'USD',
    period: 'Jun 2026', scope: 'Corporate Consolidated', book: CTX.book, basis: 'US GAAP', lens: CTX.lens,
    sourceObjectIds: ['FO-X'], trace: {}, availableDrills: [], provenance: 'test', tieStatus: 'NOT_TESTED',
    createdAt: new Date().toISOString(),
  });
  for (let i = 0; i < FACT_LIMIT; i++) reg.add([mk(i)]);
  assert.equal(reg.size, FACT_LIMIT);

  /* the person keeps drilling the very first figure, and then two more reads arrive */
  assert.ok(reg.get('f_seed0'));
  reg.add([mk(1000)]);
  reg.add([mk(1001)]);

  assert.equal(reg.size, FACT_LIMIT);
  assert.ok(reg.get('f_seed0'), 'a fact still being referenced must survive');
  assert.equal(reg.get('f_seed1'), null, 'the least recently referenced is what goes');
});

/* ================================================================================================
   §13 / §14 / §40 — A STOCK IS NOT A FLOW, AND THE SENTENCE SAYS WHICH
   ================================================================================================ */

test('P2 §40: the measure comes from the verb, then the term, then nothing', () => {
  const capex = conceptById('CAPITAL_EXPENDITURE');
  const cip = conceptById('CONSTRUCTION_IN_PROGRESS');
  assert.ok(capex && cip);

  /* the term itself is a flow, whatever its accounts are */
  assert.equal(resolveMeasure('capex', capex), 'ACTIVITY');
  assert.equal(resolveMeasure('how much capex did we spend in June', capex), 'ACTIVITY');
  /* the term itself is a stock */
  assert.equal(resolveMeasure("what's our CIP balance", cip), 'BALANCE');
  assert.equal(resolveMeasure('CIP', cip), 'BALANCE');
  /* the VERB outranks the term's own default, in both directions */
  assert.equal(resolveMeasure('how much did we spend on CIP during June', cip), 'ACTIVITY');
  assert.equal(resolveMeasure('what capex is sitting on the balance sheet as at June', capex), 'BALANCE');
  /* an explicit argument outranks everything */
  assert.equal(resolveMeasure('how much did we spend', capex, 'balance'), 'BALANCE');
  /* a sentence that says neither, and a term with no nature, states nothing */
  assert.equal(resolveMeasure('15000', null), null);
});

test('P2 §13: the dispatcher sends a flow to the activity read and a stock to the statement line', () => {
  const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 });
  const env: ToolEnv = {
    data: orch.data, gl: orch.gl, controls: orch.controls, visible: 'ALL',
    actor: { id: 'u', name: 'u', ...ROLES['FINANCE_REVIEWER']! }, objectId: 'FO-1',
  };
  const stmt = composedByName('getStatement')!;

  /* THE PHASE 1.5 DEFECT: capex resolves to balance-sheet accounts, so a question about SPEND came back as a
     BALANCE — every figure governed, the answer wrong. */
  const spend = stmt.plan({ subject: 'capex', period: '2026-06', view: 'line' }, env);
  assert.equal(spend.kind, 'RUN');
  assert.equal(spend.kind === 'RUN' && spend.tool, 'getAccountAnalysis');

  const balance = stmt.plan({ subject: '15000', period: '2026-06', view: 'line' }, env);
  assert.equal(balance.kind === 'RUN' && balance.tool, 'getFinancialStatementLine');

  /* an explicit measure is honoured on a bare code, where no term states a nature */
  const forced = stmt.plan({ subject: '15000', period: '2026-06', view: 'line', measure: 'activity' }, env);
  assert.equal(forced.kind === 'RUN' && forced.tool, 'getAccountAnalysis');
});

/* ================================================================================================
   §28 — THE TITLE IS READ BY A PERSON, AND THE PERSON SAID THE WORD
   ================================================================================================ */

test('P2 §28: a governed read is titled in the language of the question, not the argument list', () => {
  const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 });
  const env: ToolEnv = {
    data: orch.data, gl: orch.gl, controls: orch.controls, visible: 'ALL',
    actor: { id: 'u', name: 'u', ...ROLES['FINANCE_REVIEWER']! }, objectId: 'FO-1',
  };
  const p = composedByName('analyzeFinancials')!.plan(
    { subject: 'opex', period: '2026-06', comparisonPeriod: '2026-05', dimension: 'vendor', scope: 'MDH' }, env);
  assert.equal(p.kind, 'RUN');
  const title = p.kind === 'RUN' ? p.title ?? '' : '';
  assert.ok(/^Opex by vendor — MDH · 2026-06 vs 2026-05$/.test(title), title);
  /* the codes are not lost — they stay on the arguments, and so on the object's refs and trace */
  assert.equal(p.kind === 'RUN' && p.args['account'], '50000,60000');
});

/* ================================================================================================
   §31–§34 — THE RELATIONSHIPS TRAVEL WITH THE FIGURE, FROM THE REAL GOVERNED TOOLS
   ================================================================================================ */

test('P2 §32/§33/§34: a governed read carries its flux, reconciliation and source lineage onto the fact', () => {
  const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 });
  const env: ToolEnv = {
    data: orch.data, gl: orch.gl, controls: orch.controls, visible: 'ALL',
    actor: { id: 'u', name: 'u', ...ROLES['FINANCE_REVIEWER']! }, objectId: 'FO-1',
  };
  const run = (id: string, args: Record<string, string>) => factsFrom(toolRegistry.get(id)!.run(args as never, env).object, CTX)[0]!;

  /* §33 — a flux figure knows its item, its explanation record AND what state that explanation is in.
     A draft explanation is not support, and only the status can say so. */
  const item = orch.controls.fluxItems('2026-06', 'ALL')[0]!;
  const flux = run('getFluxExplanation', { account: item.account, period: '2026-06' });
  assert.equal(flux.trace.fluxItemId, `FLUX-${item.account}-2026-06`);
  assert.ok(flux.trace.fluxExplanationId, 'the explanation record travels');
  assert.ok(flux.trace.explanationStatus, 'and so does its state');

  /* §31/§32 — a reconciliation figure knows whether it has been proved and who holds it */
  const rec = run('getReconciliation', { reconciliationId: 'REC-MDH-13100', period: '2026-06' });
  assert.equal(rec.trace.reconciliationId, 'REC-MDH-13100');
  assert.ok(rec.trace.reconciliationStatus, 'the review state travels');
  assert.notEqual(rec.tieStatus, 'NOT_TESTED', 'the tie status is the governed one, not the default');

  /* §34 — the reference the source system publishes, and the drill it actually supports */
  const line = orch.gl.lines.find((l) => l.vendor && l.account !== '20100')!;
  const txn = run('getTransaction', { transactionId: line.key });
  assert.equal(txn.trace.transactionId, line.key);
  assert.equal(txn.trace.journalId, line.journalId);
  assert.ok(txn.trace.sourceRef?.includes(line.entity) === false || !!txn.trace.sourceRef, 'a published reference, never a fabricated link');
  assert.ok(txn.availableDrills.includes('SOURCE_REFERENCE'));
  assert.ok(txn.availableDrills.includes('JOURNAL'));
});

/* ================================================================================================
   §30 — A TRACE ANSWER OFFERS THE DRILLS THE FIGURE ACTUALLY SUPPORTS
   ================================================================================================ */

test('P2 §30: the offers are read from the cited facts, and a drill that would refuse is never offered', () => {
  const reg = new FactRegistry();
  const [thin] = reg.add(factsFrom(objOf({ id: 'FO-1', refs: { account: '15000' }, facts: [{ key: 'balance', label: 'B', value: 1, display: '1.0' }] }), CTX));
  const shallow = renderResponse(buildResponse({ responseType: 'TRACE_RESULT', headline: `CIP is {{FACT:${thin!.factId}}}.` }, reg, { hasGovernedRead: true, objectIds: ['FO-1'] }), reg);
  assert.deepEqual(shallow.nextActions, ['View the accounts', 'View the trial balance'], 'no population, no journal, so neither is offered');

  const [deep] = reg.add(factsFrom(objOf({
    id: 'FO-2',
    refs: { account: '15010', financialLineId: 'FS-CIP', journalId: 'JE-1', sourceRef: 'NS AP_BILL 1' },
    population: { populationId: 'POP-1', rowCount: 4, returned: 4, cursor: 0, nextCursor: null, sort: 'amount', exportHook: null },
    facts: [{ key: 'activity', label: 'A', value: 2, display: '2.0' }],
  }), CTX));
  const full = renderResponse(buildResponse({ responseType: 'TRACE_RESULT', headline: `It posted {{FACT:${deep!.factId}}}.` }, reg, { hasGovernedRead: true, objectIds: ['FO-2'] }), reg);
  assert.deepEqual(full.nextActions, ['View the statement line', 'View the account', 'View the trial balance', 'View the GL lines behind it'],
    'the chain is walked in order and capped');

  /* the model's own next steps outrank the derived ones */
  const asked = renderResponse(buildResponse({ responseType: 'TRACE_RESULT', headline: `It posted {{FACT:${deep!.factId}}}.`, nextActions: ['Open the reconciliation'] }, reg, { hasGovernedRead: true, objectIds: ['FO-2'] }), reg);
  assert.deepEqual(asked.nextActions, ['Open the reconciliation']);

  /* a conceptual answer has nowhere to go, and says so by offering nothing */
  const none = renderResponse(buildResponse({ responseType: 'DIRECT', headline: 'OPEX excludes depreciation.' }, reg, { hasGovernedRead: false, objectIds: [] }), reg);
  assert.deepEqual(none.nextActions, []);
});

test('P2 §20/§43: a governed decomposition supports "driven by"; a bare balance does not', () => {
  const reg = new FactRegistry();
  const plain = reg.add(factsFrom(objOf({ id: 'FO-P', type: 'FinancialStatementLine', refs: { account: '60000' }, facts: [{ key: 'change', label: 'Change', value: 0.61, display: '0.61' }] }), CTX))[0]!;
  const drv = reg.add(factsFrom(objOf({ id: 'FO-D', type: 'DriverAnalysis', refs: { account: '60000', dimension: 'vendor' }, facts: [{ key: 'group1.amount', label: 'HubSpot', value: 0.5, display: '0.50' }] }), CTX))[0]!;

  /* what made a movement up IS what "driven by" ordinarily claims in accounting */
  const good = buildResponse({ headline: `OPEX rose driven by {{FACT:${drv.factId}}}.` }, reg, { hasGovernedRead: true, objectIds: ['FO-D'] });
  assert.equal(good.headline!.type, 'FACT');
  assert.deepEqual(good.violations, []);

  /* a figure that merely sits in the same answer is not a reason */
  const bad = buildResponse({ headline: `OPEX rose {{FACT:${plain.factId}}} because the team hired engineers.` }, reg, { hasGovernedRead: true, objectIds: ['FO-P'] });
  assert.equal(bad.headline!.type, 'INFERENCE');
});

/* ================================================================================================
   §37/§38 — A FACT CANNOT CARRY LINEAGE ITS READER IS NOT ALLOWED
   ================================================================================================ */

test('P2 §37/§38: a scoped reader’s facts carry only their own scope, and a refusal produces no fact', () => {
  const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 });
  const scoped = { id: 'user:jpark', name: 'Jonah Park', ...ROLES['ENTITY_ACCOUNTANT']! };
  const env: ToolEnv = { data: orch.data, gl: orch.gl, controls: orch.controls, visible: visibleOf(scoped), actor: scoped, objectId: 'FO-1' };

  const o = toolRegistry.get('getTrialBalance')!.run({ period: '2026-06', entity: 'MDH' } as never, env).object;
  const fs = factsFrom(o, CTX);
  assert.ok(fs.length, 'the read they are allowed returns figures');
  assert.ok(fs.every((f) => f.scope === o.scope.name), 'every fact is stamped with the scope it was read at');
  assert.ok(fs.every((f) => !/REIT/i.test(JSON.stringify(f))), 'nothing in the lineage names an entity they cannot see');

  /* §38 — an object Korvyn could not answer is not a figure with a caveat: it carries no authority at all */
  const out = factsFrom({ ...o, status: 'UNAVAILABLE', unavailable: { capability: 'x', reason: 'outside scope' } }, CTX);
  assert.ok(out.every((f) => f.kind === 'UNKNOWN' && f.availableDrills.length === 0));
});
