/**
 * Agent runtime hardening — clarification checkpoints and durable steering. The real orchestrator, runtime, tools and
 * durable store; no provider call.   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { type Actor, ROLES, visibleOf } from './tools.js';
import { WORK } from './store.js';
import { AgentRuntime } from './agent/runtime.js';
import { classifySteering } from './agent/steering.js';
import { setRelativePeriodPolicy, resolveTerms } from './agent/ambiguity.js';

const me: Actor = { id: 'user:mgiri', name: 'Mitra Giri', ...ROLES['FINANCE_REVIEWER']! };
const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => me);
const A = orch.agents;
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const deps = () => ({ gl: orch.gl, data: orch.data, controls: orch.controls, visible: visibleOf(me), periods: orch.data.governedPeriods(), workingPeriod: orch.data.workingPeriod(), pbcRequests: orch.artifacts.pbc!.list().map((r) => ({ id: r.id, pbcNumber: r.pbcNumber, title: r.title, status: String(r.status) })), artifacts: [] });
async function until(id: string, ok: (s: string) => boolean, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms && !ok(A.get(id, me)!.status)) { await A.wait(id, 500); await settle(20); } }
let n = 0; const sid = () => `steer-test-${String(++n).padStart(4, '0')}`;

test('steering classification: every type, and a threshold is never mistaken for an exclusion', () => {
  const d = deps();
  const cases: [string, string][] = [
    ['Only South Valley.', 'SCOPE_CHANGE'], ['Use May instead.', 'PERIOD_CHANGE'], ['Ignore anything under $500K.', 'FILTER_CHANGE'], ['Focus on CIP first.', 'PRIORITY_CHANGE'],
    ["Don't create comments yet.", 'ACTION_CONSTRAINT'], ['Ignore Revenue.', 'EXCLUSION'], ['No package.', 'OUTPUT_CHANGE'], ['Make it CSV.', 'OUTPUT_CHANGE'],
    ['Pause.', 'PAUSE'], ['Resume.', 'RESUME'], ['Stop.', 'CANCEL'], ['Back to all entities.', 'SCOPE_CHANGE'], ['You can create comments now.', 'ACTION_CONSTRAINT'],
  ];
  for (const [t, ty] of cases) assert.equal(classifySteering(t, d)?.type, ty, t);
  assert.equal(classifySteering('Ignore anything under $500K.', d)!.threshold, 0.5);
  assert.deepEqual(classifySteering('Only South Valley.', d)!.scope, { dimension: 'project', value: 'SV-PH2', label: 'South Valley (SV-PH2)' });
  assert.equal(classifySteering('Use May instead.', d)!.period!.period, '2026-05');
  assert.equal(classifySteering('Only DC1.', d)!.ambiguity!.field, 'project', 'an ambiguous value is asked, not guessed');
  assert.equal(classifySteering('Why did CIP move?', d), null, 'a question is not steering');
});

test('§12 ONE run: ask which Siemens → "Siemens Energy." resumes it → scope → threshold → focus → constraint', async () => {
  const s = sid();
  const r1 = await orch.turn({ sessionId: s, request: 'Review Siemens FY26 activity.' }, me);
  assert.equal(r1.objects[0]!.type, 'AgentRun');
  const v1 = r1.objects[0]!.agentRun as { runId: string; status: string; checkpoints: { type: string; status: string; title: string; options: { label: string }[]; candidates: { id: string }[] }[] };
  const runId = v1.runId;
  assert.equal(v1.status, 'WAITING_FOR_USER');
  const q = v1.checkpoints.find((c) => c.type === 'CLARIFICATION' && c.status === 'OPEN')!;
  assert.equal(q.title, 'Which Siemens vendor do you mean?');
  assert.deepEqual(q.options.map((o) => o.label).sort(), ['Siemens AG', 'Siemens Energy', 'Siemens Mobility']);
  assert.ok(q.candidates.every((c) => c.id.startsWith('vendor:')), 'candidates are canonical ids');
  assert.match(r1.narrative[0]!.text, /more than one|3 Siemens vendors/i);
  assert.equal(A.body(runId, me)!.graph.tasks.length, 0, 'nothing runs before the answer');

  const r2 = await orch.turn({ sessionId: s, request: 'Siemens Energy.' }, me);
  assert.equal((r2.objects[0]!.agentRun as { runId: string }).runId, runId, 'the SAME run resumed');
  await until(runId, (x) => x === 'COMPLETED');
  let b = A.body(runId, me)!;
  assert.equal(b.goal.subject.vendor, 'Siemens Energy');
  const cp = b.checkpoints.find((c) => c.type === 'CLARIFICATION')!;
  assert.equal(cp.status, 'RESOLVED'); assert.equal(cp.resolvedValue, 'vendor:Siemens Energy'); assert.equal(cp.response, 'Siemens Energy.');
  assert.ok(b.goal.resolved.some((x) => x.field === 'vendor' && x.label === 'Siemens Energy'));

  const r3 = await orch.turn({ sessionId: s, request: 'Only South Valley.' }, me);
  assert.equal((r3.objects[0]!.agentRun as { runId: string }).runId, runId);
  await until(runId, (x) => x === 'COMPLETED');
  b = A.body(runId, me)!;
  const ev = b.steering.at(-1)!;
  assert.equal(ev.type, 'SCOPE_CHANGE');
  assert.equal(ev.contextBefore.project, null); assert.equal(ev.contextAfter.project, 'SV-PH2');
  assert.equal(ev.contextAfter.vendor, 'Siemens Energy', 'the vendor stays'); assert.deepEqual(ev.contextAfter.periodRange, ev.contextBefore.periodRange, 'the period stays');
  assert.ok(ev.tasksInvalidated.length > 0 && ev.planRevision !== null);
  assert.ok(b.graph.tasks.some((t) => t.taskId === 'by-project' && !t.invalidatedBy && t.status === 'COMPLETED'), 'the unscoped breakdown is kept');
  assert.ok(!b.checkpoints.some((c) => c.type === 'EXTERNAL_DEPENDENCY' && c.status === 'OPEN'), 'a JD Edwards notice for activity now out of scope is superseded');
  assert.ok(b.graph.tasks.filter((t) => !t.invalidatedBy && t.scopeSensitive && t.tool).every((t) => t.args['project'] === 'SV-PH2' || t.refs['populationId']), 'scope-dependent tasks re-ran scoped');

  await orch.turn({ sessionId: s, request: 'Ignore anything under $500K.' }, me);
  await until(runId, (x) => x === 'COMPLETED');
  b = A.body(runId, me)!;
  assert.equal(b.goal.threshold, 0.5);
  assert.ok(b.graph.tasks.some((t) => !t.invalidatedBy && t.tool === 'getGovernedPopulation' && t.args['minAbsAmount'] === '0.5'), 'the population is re-defined with the threshold');
  assert.equal(b.steering.at(-1)!.type, 'FILTER_CHANGE');

  await orch.turn({ sessionId: s, request: 'Focus on CIP first.' }, me);
  await until(runId, (x) => x === 'COMPLETED');
  b = A.body(runId, me)!;
  assert.equal(b.steering.at(-1)!.type, 'PRIORITY_CHANGE');
  const f = b.graph.tasks.find((t) => t.taskId.startsWith('focus-'))!;
  assert.ok(f && f.priority < 10 && f.args['account'] === '15000' && f.args['project'] === 'SV-PH2' && f.args['minAbsChange'] === '0.5', 'the focus step honours the scope and threshold already set');
  assert.equal(f.status, 'COMPLETED'); assert.match(A.get(runId, me)!.result!.headline, /^CIP/, 'the result leads with the focus');

  await orch.turn({ sessionId: s, request: "Don't create comments yet." }, me);
  b = A.body(runId, me)!;
  assert.equal(b.goal.constraints.noComments, true); assert.equal(b.steering.at(-1)!.type, 'ACTION_CONSTRAINT');
  assert.equal(A.list(me).filter((r) => r.runId === runId).length, 1);
  assert.equal(b.steering.length, 4); assert.ok(b.steering.every((e) => e.runId === runId && e.actor.id === me.id && e.at));
  const audit = WORK.repos.audit.list({ investigationId: b.investigationId }).filter((e) => e.action === 'AGENT_RUN_STEERED');
  assert.equal(audit.length, 4, 'every steering event is audited');
  /* the conversation's FinancialContext followed the run */
  const ctx = (orch as unknown as { sessions: Map<string, { ctx: { filters: { value: { dimension: string; value: string }[] } } }> }).sessions.get(s)!.ctx;
  assert.ok(ctx.filters.value.some((x) => x.dimension === 'project' && x.value === 'SV-PH2') && ctx.filters.value.some((x) => x.dimension === 'vendor' && x.value === 'Siemens Energy'));
});

test('action constraint: analysis continues, comments are never proposed while it stands, and it survives a replan', async () => {
  const s = sid();
  const r = A.start(me, 'Get June close ready for controller review.', { sessionId: s, options: { pace: 60 } });
  assert.ok(r.ok); await settle(30);
  A.steer(r.run.runId, me, "Don't create comments yet.");
  await until(r.run.runId, (x) => x === 'COMPLETED' || x.startsWith('WAITING'));
  let b = A.body(r.run.runId, me)!;
  const comments = () => orch.actions.ofSession(b.sessionId).filter((p) => /COMMENT/.test(p.type) && b.graph.tasks.some((t) => t.proposalIds.includes(p.id)));
  assert.equal(comments().filter((p) => p.status !== 'CANCELLED').length, 0, 'no live comment proposal');
  assert.ok(b.graph.tasks.some((t) => t.tool === 'getUnexplainedFluxItems' && t.status === 'COMPLETED'), 'analysis continued');
  /* a replan (period change) must honour the standing constraint */
  A.steer(r.run.runId, me, 'Use May instead.');
  await until(r.run.runId, (x) => x === 'COMPLETED' || x.startsWith('WAITING'));
  b = A.body(r.run.runId, me)!;
  assert.equal(b.goal.period, '2026-05'); assert.equal(b.goal.constraints.noComments, true);
  assert.equal(comments().filter((p) => p.status !== 'CANCELLED').length, 0, 'still no comment proposal after the replan');
  assert.ok(b.graph.tasks.filter((t) => !t.invalidatedBy && t.tool === 'getCloseReadiness').every((t) => t.args['period'] === '2026-05'), 'the explicit May replaced the inherited June');
  assert.equal(b.steering.at(-1)!.contextBefore.period, '2026-06'); assert.equal(b.steering.at(-1)!.contextAfter.period, '2026-05');
  /* lifting it lets the drafts be prepared again — still only after confirmation */
  A.steer(r.run.runId, me, 'You can create comments now.');
  await until(r.run.runId, (x) => x.startsWith('WAITING') || x === 'COMPLETED');
  b = A.body(r.run.runId, me)!;
  assert.equal(b.goal.constraints.noComments, false);
  assert.ok(comments().some((p) => p.status === 'WAITING_CONFIRMATION'), 'drafts prepared again, awaiting confirmation');
});

test('§13 period: "last quarter" asks only when the tenant calendar leaves it open', async () => {
  setRelativePeriodPolicy('ASK_WHEN_OPEN');
  const a = A.start(me, 'Review last quarter.');
  assert.ok(a.ok);
  assert.equal(a.run.runStatus, 'WAITING_FOR_USER');
  const q = A.openQuestion(a.run)!;
  assert.equal(q.field, 'period'); assert.deepEqual(q.options.map((o) => o.label), ['Q1 2026', 'Q2 2026']);
  await A.decide(a.run.runId, me, q.id, 'quarter:2026-Q1');
  await until(a.run.runId, (x) => x === 'COMPLETED');
  const b = A.body(a.run.runId, me)!;
  assert.equal(b.goal.period, '2026-03'); assert.deepEqual(b.goal.periodRange, { start: '2026-01', end: '2026-03' });
  assert.ok(b.graph.tasks.filter((t) => t.tool).every((t) => t.args['period'] === '2026-03'));
  setRelativePeriodPolicy('LAST_COMPLETED');
  const c = A.start(me, 'Review last quarter.');
  assert.ok(c.ok); assert.notEqual(c.run.runStatus, 'WAITING_FOR_USER', 'a deterministic calendar does not ask');
  assert.equal(c.run.goal.period, '2026-03');
  setRelativePeriodPolicy('ASK_WHEN_OPEN');
});

test('§14 entity: one canonical match proceeds; several are asked', () => {
  const one = A.start(me, 'Review South Valley.');
  assert.ok(one.ok); assert.equal(A.openQuestion(one.run), null); assert.equal(one.run.goal.subject.project, 'SV-PH2');
  const many = A.start(me, 'Review Meridian.');
  assert.ok(many.ok); assert.equal(many.run.runStatus, 'WAITING_FOR_USER');
  const q = A.openQuestion(many.run)!;
  assert.equal(q.field, 'entity'); assert.ok(q.options.length >= 6);
  assert.ok(resolveTerms('review intercompany activity', deps()).ambiguities.some((x) => x.field === 'account'), 'a shared account word is ambiguous');
});

test('a vendor the master holds but never paid is resolved and stated, not searched with a filter that cannot match', async () => {
  const r = A.start(me, 'Review Siemens FY26 activity.');
  assert.ok(r.ok);
  await A.decide(r.run.runId, me, A.openQuestion(r.run)!.id, 'vendor:Siemens AG');
  await until(r.run.runId, (x) => x === 'COMPLETED');
  const v = A.get(r.run.runId, me)!;
  assert.match(v.result!.headline, /Siemens AG is in the vendor master but has no governed activity/);
  assert.equal(A.body(r.run.runId, me)!.trace.toolCalls.length, 0);
});

test('persistence: an unresolved question and the steering history survive a restart and a lost session', async () => {
  const s = sid();
  const r1 = await orch.turn({ sessionId: s, request: 'Review Siemens FY26 activity.' }, me);
  const runId = (r1.objects[0]!.agentRun as { runId: string }).runId;
  /* a restarted runtime reads the run from the durable store: still waiting, still the same question */
  const again = new AgentRuntime(orch);
  const b = again.body(runId, me)!;
  assert.equal(b.runStatus, 'WAITING_FOR_USER');
  assert.equal(again.openQuestion(b)!.title, 'Which Siemens vendor do you mean?');
  /* the conversation's in-memory session is gone (refresh / restart): the answer still reaches the SAME run */
  (orch as unknown as { sessions: Map<string, unknown> }).sessions.delete(s);
  const r2 = await orch.turn({ sessionId: s, request: 'Siemens Energy.' }, me);
  assert.equal((r2.objects[0]!.agentRun as { runId: string }).runId, runId);
  await until(runId, (x) => x === 'COMPLETED');
  await orch.turn({ sessionId: s, request: 'Only South Valley.' }, me);
  const stored = WORK.repos.records.get<{ run: { steering: { type: string }[]; goal: { subject: { project: string } } } }>('AGENT_RUN', runId)!;
  assert.equal(stored.run.steering.at(-1)!.type, 'SCOPE_CHANGE'); assert.equal(stored.run.goal.subject.project, 'SV-PH2');
});

test('a new goal typed while a run is on screen starts a new run; a short instruction steers the old one', async () => {
  const s = sid();
  const r1 = await orch.turn({ sessionId: s, request: 'Investigate ABB spend for FY26' }, me);
  const first = (r1.objects[0]!.agentRun as { runId: string }).runId;
  await until(first, (x) => x === 'COMPLETED');
  const r2 = await orch.turn({ sessionId: s, request: 'Review last quarter.' }, me);
  const second = (r2.objects[0]!.agentRun as { runId: string; goalType: string }).runId;
  assert.notEqual(second, first, 'a new goal is a new run');
  assert.equal((r2.objects[0]!.agentRun as { goalType: string }).goalType, 'REVIEW_CLOSE');
  assert.equal(A.body(first, me)!.steering.length, 0, 'the vendor review was not steered');
});
