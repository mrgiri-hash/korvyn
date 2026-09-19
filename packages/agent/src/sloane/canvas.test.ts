/**
 * Phase 8B — the Universal Intent Resolver and the Dynamic Financial Canvas. No provider call: the real orchestrator
 * in deterministic mode over the governed services.   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator, type TurnResponse } from './orchestrator.js';
import { type Actor, ROLES } from './tools.js';
import { DEV_DIRECTORY, actorContext } from './auth.js';
import type { DynamicCanvasDefinition } from './canvas/canvas.js';
import { WORK } from './store.js';

const reviewer: Actor = { id: 'user:mgiri', name: 'Mitra Giri', ...ROLES['FINANCE_REVIEWER']! };
const as = (id: string) => actorContext(DEV_DIRECTORY.find((u) => u.id === id)!, null, 'test');
const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => reviewer);
let n = 0;
const sid = () => `canvas-${++n}-xxxxxxxx`;
const ask = async (s: string, q: string, actor: Actor = reviewer) => { const r = await orch.turn({ sessionId: s, request: q }, actor); assert.notEqual(r.state, 'ERROR', `${q}: ${JSON.stringify(r.notes)}`); return r; };
const cv = (r: TurnResponse) => { const o = r.objects.find((x) => x.type === 'DynamicFinancialCanvas'); assert.ok(o, `no canvas: ${r.route} ${JSON.stringify(r.notes)}`); return o!.canvas as unknown as DynamicCanvasDefinition; };
const types = (d: DynamicCanvasDefinition) => d.sections.map((s) => s.sectionType);
const sec = (d: DynamicCanvasDefinition, t: string) => d.sections.find((s) => s.sectionType === t);

test('§3 short intents resolve to the right financial context, never to a search list', async () => {
  const cases: [string, string][] = [['close', 'CLOSE'], ['flux', 'FLUX'], ['financials', 'FINANCIALS'], ['recs', 'RECONCILIATIONS'], ['reconciliations', 'RECONCILIATIONS'], ['CIP', 'OBJECT'], ['South Valley', 'OBJECT'], ['Siemens', 'OBJECT'], ['June', 'PERIOD'], ['budget vs actual', 'PLANNING']];
  for (const [q, kind] of cases) {
    const r = await ask(sid(), q), d = cv(r);
    assert.equal(d.kind, kind, q);
    assert.equal(orch.trace(r.traceId)!.route, 'CANVAS', q);
    assert.ok(d.sections.length >= 1 && d.title, `${q}: sections`);
    assert.ok(!/results? matching/i.test(JSON.stringify(d)), `${q}: never a search-results page`);
  }
  const cip = cv(await ask(sid(), 'CIP')); assert.equal(cip.intent.subject!.id, 'account:15000');
  const sv = cv(await ask(sid(), 'South Valley')); assert.equal(sv.intent.subject!.id, 'project:SV-PH2');
  assert.ok(!types(sv).includes('FINANCIAL_TABLE'), 'a project has no trial balance or statement of its own');
  const sie = cv(await ask(sid(), 'Siemens')); assert.equal(sie.intent.subject!.id, 'vendor:Siemens Energy');
  assert.match(sie.notes.join(' '), /Siemens AG and Siemens Mobility/, 'the other readings are named, not dropped');
  /* questions and longer instructions still go to the governed tools */
  for (const q of ['Why did CIP increase in June?', 'Show me June financials', 'Compile Siemens FY26 support', 'hello']) assert.notEqual(orch.trace((await ask(sid(), q)).traceId)!.route, 'CANVAS', q);
});

test('§7 the close canvas prioritises what matters, and every section is a governed object with a trace', async () => {
  const d = cv(await ask(sid(), 'close'));
  assert.equal(d.period, orch.data.workingPeriod(), 'the close the book is working in');
  assert.equal(d.sections[0]!.sectionType, 'STATUS');
  assert.equal(d.sections[1]!.sectionType, 'EXCEPTIONS', 'a controller sees material blockers first');
  assert.ok(d.headline && /%$/.test(d.headline.value));
  const readiness = orch.trace((await ask(sid(), 'close')).traceId)!.toolsExecuted.find((x) => x.tool === 'getCloseReadiness');
  assert.ok(readiness, 'readiness comes from the governed close tool');
  for (const s of d.sections.filter((x) => x.object)) {
    assert.ok(s.trace.tools.length, `${s.title}: traced to its tool`);
    assert.equal(s.trace.dataVersion, orch.gl.dataVersion());
    assert.ok(s.trace.mappingVersion && s.trace.period && s.trace.scope, `${s.title}: period, scope and versions`);
  }
  assert.ok(types(d).includes('RECONCILIATIONS') && types(d).includes('FLUX') && types(d).includes('TREND'));
});

test('§22 flux → only BS → show unexplained → largest first → the GL behind the first one: one continuous canvas', async () => {
  const s = sid();
  const a = cv(await ask(s, 'flux'));
  const b = cv(await ask(s, 'only BS'));
  assert.equal(b.id, a.id, 'refined, not recreated'); assert.equal(b.filters.statement, 'BS');
  assert.ok(sec(b, 'FLUX')!.object!.table.rows.every((r) => /^flux:[123]/.test(r.ref ?? '')), 'balance-sheet movements only');
  const c = cv(await ask(s, 'show unexplained'));
  assert.equal(c.id, a.id); assert.equal(c.filters.explanation, 'UNEXPLAINED'); assert.equal(c.filters.statement, 'BS', 'earlier filters stay');
  const dd = cv(await ask(s, 'largest first'));
  const amts = sec(dd, 'FLUX')!.object!.table.rows.map((r) => Math.abs(Number((r.cells[2] ?? '').replace(/[^0-9.]/g, ''))));
  assert.deepEqual(amts, [...amts].sort((x, y) => y - x), 'largest first');
  const r = await ask(s, 'show me the GL behind the first one'), e = cv(r);
  assert.equal(e.id, a.id);
  const focus = e.sections[0]!;
  assert.equal(focus.sectionType, 'FOCUS'); assert.equal(focus.object!.type, 'GovernedPopulation');
  const first = sec(dd, 'FLUX')!.object!.table.rows[0]!;
  assert.match(focus.title, new RegExp(first.label.replace(/[()&]/g, '.')));
  assert.equal(orch.trace(r.traceId)!.toolsExecuted.find((x) => x.tool === 'getGovernedPopulation')!.args['account'], first.ref!.split(':')[1]);
  assert.ok(focus.sourcePopulationIds.length, 'the population is traceable');
});

test('§16 close → only material blockers → start with the largest → the related reconciliation', async () => {
  const s = sid();
  const a = cv(await ask(s, 'close'));
  const b = cv(await ask(s, 'show only material blockers'));
  assert.ok(sec(b, 'EXCEPTIONS')!.object!.table.rows.every((r) => r.cells[0] === 'BLOCKING'));
  const c = cv(await ask(s, 'start with the largest one'));
  assert.equal(c.id, a.id); assert.equal(c.sections[0]!.sectionType, 'FOCUS'); assert.ok(c.focus);
  const d = cv(await ask(s, 'show the related reconciliation'));
  assert.match(d.sections[0]!.title, /^Reconciliation · /);
  assert.equal(d.focus!.ref, c.focus!.ref, 'the same object stays in focus');
});

test('§14 role-aware: the same intent composes differently, and permissions hold', async () => {
  const ctl = cv(await ask(sid(), 'close'));
  const prep = cv(await ask(sid(), 'close', as('user:mdh')));
  assert.equal(prep.context.persona, 'PREPARER'); assert.equal(ctl.context.persona, 'CONTROLLER');
  assert.equal(prep.sections[1]!.title, 'Preparation tasks still open', 'a preparer sees their preparation work first');
  assert.equal(prep.scope.id, 'MDH');
  assert.ok(!JSON.stringify(prep).includes('MER-UK'), 'nothing outside the actor’s scope is on the canvas');
  const cfo = cv(await ask(sid(), 'close', as('user:cfo')));
  assert.equal(cfo.context.persona, 'EXECUTIVE'); assert.ok(types(cfo).includes('VARIANCE'), 'an executive sees financial impact');
  const aud = await ask(sid(), 'flux', as('user:auditor'));
  assert.equal(aud.state, 'UNAVAILABLE'); assert.match(cv(aud).notes.join(' '), /outside your access/);
  assert.ok(!cv(aud).sections.some((x) => x.object), 'no flux object reaches an actor without FLUX_VIEW');
  const reit = await ask(sid(), 'REIT', as('user:mdh'));
  assert.ok(!JSON.stringify(reit).includes('MGP-REIT'), 'a hidden entity is not discovered');
});

test('§20 budget / forecast are recognised and never fabricated', async () => {
  for (const q of ['budget vs actual', 'forecast', 'budget']) {
    const r = await ask(sid(), q), d = cv(r);
    assert.equal(r.state, 'UNAVAILABLE', q); assert.equal(d.kind, 'PLANNING');
    assert.match(d.notes.join(' '), /no governed planning version is available/);
    assert.ok(!d.sections.some((s) => s.object?.table.rows.some((row) => row.cells.some((c) => /\$\d/.test(c)))), `${q}: no planning figure`);
  }
});

test('§17 canvas state is kept on the conversation and in the investigation', async () => {
  const s = sid();
  await ask(s, 'flux'); const r = await ask(s, 'only BS');
  const inv = WORK.repos.investigations.listFor(reviewer.id).find((i) => i.steps.some((x) => x.traceId === r.traceId))!;
  const ctx = inv.context as { canvas?: { filters: { statement: string } } };
  assert.equal(ctx.canvas!.filters.statement, 'BS');
  assert.equal(inv.steps.filter((x) => x.request === 'only BS').length, 1);
});
