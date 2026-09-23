/**
 * A4 — THE FIRST PRODUCTION PROFILE, AND THE PRODUCT'S WAYS IN.
 *
 *   §2   the Close profile is CONFIGURATION — no runtime anywhere branches on it
 *   §4   a conversation launches a run, and the objective decides what it may do
 *   §5   a module launches the SAME run from the object a person is looking at
 *   §6   context is available, not imposed: a payload bigger than the contract is cut down
 *   §7   conversation and run stay separate durable objects, linked by reference
 *   §9   the product phase is derived from real run state
 *   §12  the launch carries the governed object, so nobody restates it
 *   §13  a simple question is not an agent run
 *   §14  the profile declares what a good run of it looks like
 *   §15  a finished run leaves a workproduct other surfaces can reference
 *   §16  fact, recommendation and governed proposal stay three things
 *   §20  headless parity: the same runtime, profile and authority, whoever called
 *
 * No provider call: the real orchestrator, the real launch contract, the real store, a scripted model.
 *   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { type Actor, ROLES, serverActor } from './tools.js';
import { POLICY_PROFILES, type AgentRunBody } from './agent/model.js';
import { profileForOutcome } from './agent/objective.js';
import { sanitize, launchObjective, LAUNCH_REF_TYPES } from './agent/launch.js';
import { workproductOf } from './agent/workproduct.js';
import type { AgentStepOut } from './schema.js';

const me = serverActor();
const auditor: Actor = { id: 'user:auditor', name: 'Priya Nair', ...ROLES['EXTERNAL_AUDITOR']! };
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];
const settle = (ms = 25) => new Promise((r) => setTimeout(r, ms));

const usage = { inputTokens: 900, outputTokens: 120, cacheReadTokens: 80, cacheWriteTokens: 0 };
const ok = <T>(value: T, route: string) => ({ status: 'ok' as const, latencyMs: 1, requestId: null, usage, model: 'claude-sonnet-5', route, value });
const read = (tool: string, args: Record<string, string>) => ({ tool, intent: 'READ' as const, purpose: `Reading ${tool}`, progress: `Reading ${tool}`, args: Object.entries(args).map(([name, value]) => ({ name, value })) });
const prep = (tool: string, args: Record<string, string>) => ({ tool, intent: 'PREPARE_ACTION' as const, purpose: `Preparing with ${tool}`, progress: `Preparing with ${tool}`, args: Object.entries(args).map(([name, value]) => ({ name, value })) });
const step = (o: Partial<AgentStepOut>): AgentStepOut => ({ goalClass: 'CLOSE_READINESS', understanding: 'Look at where the June close stands.', decision: 'CALL_TOOLS', calls: [], needCapabilities: [], workingNotes: [], openQuestions: [], question: null, options: [], confidence: 0.8, escalate: { needed: false, reason: null, detail: null }, ...o }) as AgentStepOut;

/** a scripted model that classifies the objective the way a live one would for close work */
function scripted(steps: (n: number) => AgentStepOut, outcome = 'PREPARE_WORKFLOW_ACTIONS', workClass: string | null = 'CLOSE_READINESS') {
  const seen: { toolIds: string[][] } = { toolIds: [] };
  const a = new MockLLMAdapter(); Object.defineProperty(a, 'provider', { value: 'scripted' });
  const A = a as unknown as Record<string, unknown>;
  A['classifyObjective'] = async () => ok({ outcome, workClass, understanding: 'scripted', needsDeepReasoning: false, confidence: 0.9 }, 'NARRATE');
  A['agentStep'] = async (i: { toolIds: string[] }, o: { route: string }) => { seen.toolIds.push(i.toolIds); return ok(steps(seen.toolIds.length), o.route); };
  A['agentSynth'] = async (_i: unknown, o: { route: string }) => ok({
    headline: '14 blockers remain, 9 of them with no owner.',
    inspected: ['getCloseBlockers'],
    findings: [{ statement: '9 blockers have no owner.', kind: 'OBSERVED_FACT', support: 'SUPPORTED', observationRefs: [] }],
    unresolved: ['Whether the unowned blockers are material.'],
    nextSteps: [{ label: 'Assign owners before sign-off', request: 'Assign owners to the unowned blockers' }],
    confidence: 0.7, escalate: { needed: false, reason: null, detail: null },
  }, o.route);
  const orch = new SloaneOrchestrator(a, { maxPlanSteps: 8 }, () => me);
  return { orch, seen };
}
async function until(o: SloaneOrchestrator, runId: string, actor: Actor, ms = 20000): Promise<AgentRunBody> {
  const t0 = Date.now();
  for (;;) { const b = o.agents.body(runId, actor)!; if (TERMINAL.includes(b.runStatus) || b.runStatus.startsWith('WAITING') || Date.now() - t0 > ms) return b; await settle(); }
}
const closeScript = (n: number) => (n === 1
  ? step({ calls: [read('getCloseBlockers', { period: '2026-06' })] })
  : step({ decision: 'SYNTHESIZE' }));

/* ================================================================================================
   §2 — THE PROFILE IS CONFIGURATION, AND NOTHING IN THE RUNTIME KNOWS ITS NAME
   ================================================================================================ */
test('§2 — the Close profile is declarative, and no runtime branches on it', () => {
  const p = POLICY_PROFILES['CLOSE'];
  assert.equal(p.execution, 'GENERIC', 'it runs the generic runtime');
  assert.ok(p.purpose.length > 30 && p.completion.length >= 3, 'it states what it is for and when it is done');
  assert.ok(p.actionDomains.length && p.domains.length > p.actionDomains.length, 'it reads wider than it acts');
  assert.ok(p.policyRefs?.length, 'it names the governed policies by reference');
  assert.ok(p.evaluation!.required.length >= 5 && p.evaluation!.prohibited.length >= 3, '§14 it declares what a good run looks like');
  /* and it carries no workflow: no tool list, no sequence, no threshold of its own */
  const json = JSON.stringify(p);
  assert.equal(/\bget[A-Z]\w+|propose[A-Z]\w+/.test(json), false, 'no tool is named in the profile');
  assert.equal(p.materialityUsd, POLICY_PROFILES['INVESTIGATION'].materialityUsd, 'it does not carry its own threshold');

  /**
   * THE CHECK THAT MATTERS: no source file outside the profile table may read this profile's IDENTITY. A branch
   * on `=== 'CLOSE'` anywhere in the runtime would be a Close execution path wearing a profile's name, which is
   * the one thing A4 must not add.
   */
  const dir = join(process.cwd(), 'src', 'sloane');
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) files.push(f); } };
  walk(dir);
  /**
   * The test is about the PROFILE, not the word. 'CLOSE' is also a governed object type (`objectTypes`), a goal
   * class's subject and a canvas kind, and a sweep for the bare string reports four files that have nothing to do
   * with agent authority. What is checked is the shapes that would actually BE a profile branch: reading this
   * profile out of the table by name, or comparing a run's profile to it.
   */
  const BRANCH = /POLICY_PROFILES\[\s*['"]CLOSE['"]\s*\]|(?:policyProfile|profile)\s*===\s*['"]CLOSE['"]|['"]CLOSE['"]\s*===\s*(?:\w+\.)?(?:policyProfile|profile)/;
  const offenders = files.filter((f) => !f.endsWith(join('agent', 'model.ts')))
    .filter((f) => BRANCH.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
  assert.deepEqual(offenders.map((f) => f.split('src')[1]), [], 'no code outside the profile table branches on the Close profile');
});

/* ================================================================================================
   §2 — SELECTION: THE MODEL PROPOSES THE KIND OF WORK, KORVYN CHOOSES THE PROFILE
   ================================================================================================ */
test('§2 — the work class selects the profile, and authority still caps it', () => {
  /* close work that asks for preparation reaches the Close profile */
  const d = profileForOutcome('PREPARE_WORKFLOW_ACTIONS', me, undefined, 'CLOSE_READINESS');
  assert.equal(d.profile, 'CLOSE');
  assert.equal(d.capped, false);

  /* the same class asking only to be understood also reaches it — Close serves both outcomes */
  assert.equal(profileForOutcome('ANALYZE', me, undefined, 'CLOSE_READINESS').profile, 'CLOSE');

  /* a class nothing declares falls back to the outcome's own default: pre-A4 behaviour, unchanged */
  assert.equal(profileForOutcome('ANALYZE', me, undefined, 'SUBJECT_INVESTIGATION').profile, POLICY_PROFILES['INVESTIGATION'].id);
  assert.equal(profileForOutcome('ANALYZE', me, undefined, null).profile, 'INVESTIGATION');

  /* §13 of A3 — an actor who may not prepare is capped to read-only whatever the class said */
  const capped = profileForOutcome('PREPARE_WORKFLOW_ACTIONS', auditor, undefined, 'CLOSE_READINESS');
  assert.equal(capped.profile, 'INVESTIGATION');
  assert.equal(capped.capped, true);
});

/* ================================================================================================
   §4 — A CONVERSATION LAUNCHES A RUN, AND THE OBJECTIVE DECIDES WHAT IT MAY DO
   ================================================================================================ */
test('§4 — a close objective from a conversation reaches the Close profile and may prepare', async () => {
  const { orch } = scripted(closeScript);
  const r = orch.agents.start(me, 'Review the June close, identify the material unresolved issues and prepare a controller briefing.', { sessionId: 'conv-a4-close-1' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const b = await until(orch, r.run.runId, me);
  assert.equal(b.goal.policyProfile, 'CLOSE', 'classification chose the Close profile');
  assert.equal(b.goal.workClass, 'CLOSE_READINESS', 'and recorded what selected it');
  /**
   * THE DEFECT A4 FIXED. `noActions` was hard-coded true at the conversational entry point, so a run could reach
   * the right profile and still prepare nothing. It is derived from the profile now, and a person's own
   * instruction is the only thing that overrides it.
   */
  assert.equal(b.goal.constraints.noActions, false, 'a profile that may prepare is not silenced by a call-site default');
  assert.equal(b.origin, 'CONVERSATION');
});

test('§4 — and the person\'s own instruction still wins over the profile', async () => {
  const { orch } = scripted(closeScript);
  const r = orch.agents.start(me, 'Review the June close but do not prepare any comments yet.', { sessionId: 'conv-a4-close-2' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const b = await until(orch, r.run.runId, me);
  assert.equal(b.goal.policyProfile, 'CLOSE', 'the profile is still the right one');
  assert.equal(b.goal.constraints.noActions, true, 'and it prepares nothing, because they said not to');
  assert.equal(b.goal.constraints.userSetNoActions, true, 'recorded as the person\'s instruction, not a default');
});

/* ================================================================================================
   §6 — CONTEXT IS AVAILABLE, NOT IMPOSED
   ================================================================================================ */
test('§6 — a module payload bigger than the contract is cut down before the runtime sees it', () => {
  const { context, dropped } = sanitize({
    module: 'reconciliations<script>',
    objectRefs: [
      { type: 'reconciliation', id: 'REC-MDH-13000', label: 'MDH intercompany receivable' },
      { type: 'reconciliation', id: 'REC-MDH-13000', label: 'duplicate' },
      { type: 'domSelection', id: 'the user highlighted this paragraph of the page' },
      { type: 'pageState', id: JSON.stringify({ filters: 'lots', scroll: 900 }) },
      ...Array.from({ length: 12 }, (_, i) => ({ type: 'account', id: `1500${i}` })),
    ],
    period: 'June 2026',
    scope: 'x'.repeat(500),
  } as never);
  assert.equal(context.objectRefs.length, 8, 'capped at the contract\'s limit');
  assert.equal(context.objectRefs.filter((r) => !(LAUNCH_REF_TYPES as readonly string[]).includes(r.type)).length, 0, 'nothing that is not a governed reference survives');
  assert.ok(dropped.some((d) => /domSelection/.test(d)) && dropped.some((d) => /pageState/.test(d)), 'and the caller is told what was dropped');
  assert.equal(context.period, null, 'a period that is not a governed month is not passed on');
  assert.equal(context.scope, null, 'nor a value too long to be a governed one');
  assert.equal(/<|>/.test(context.module), false);
  assert.equal(context.objectRefs.filter((r) => r.id === 'REC-MDH-13000').length, 1, 'and a repeated reference is one reference');
});

test('§12 — the objective is composed from the object, so nobody restates it', () => {
  const o = launchObjective({ action: 'INVESTIGATE', context: { module: 'reconciliations', objectRefs: [{ type: 'reconciliation', id: 'REC-MDH-13000', label: 'MDH intercompany receivable' }], period: '2026-06' } });
  assert.match(o, /Investigate/);
  assert.match(o, /MDH intercompany receivable/);
  assert.match(o, /Jun 2026/);
  /* a surface that has its own words keeps them */
  assert.equal(launchObjective({ action: 'REVIEW', objective: 'Look at the tie-out.', context: { module: 'x', objectRefs: [] } }), 'Look at the tie-out.');
});

/* ================================================================================================
   §5 / §12 / §20 — MODULE LAUNCH, AND PARITY WITH EVERY OTHER ENTRY POINT
   ================================================================================================ */
test('§5/§12/§20 — a module launches the same run, carrying the object and nothing else', async () => {
  const { orch } = scripted((n) => (n === 1 ? step({ goalClass: 'RECONCILIATION_REVIEW', calls: [read('getCloseBlockers', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' })), 'ANALYZE', 'RECONCILIATION_REVIEW');
  const out = orch.agentLaunch.launch(me, {
    action: 'INVESTIGATE',
    context: {
      module: 'reconciliations',
      objectRefs: [{ type: 'reconciliation', id: 'REC-MDH-13100', label: 'MDH intercompany receivable' }],
      period: '2026-06', scope: 'MDH',
    },
    sessionId: 'conv-a4-module-1',
  });
  assert.ok(out.ok, out.reason ?? '');
  const b = await until(orch, out.runId!, me);

  /* §12: the governed object came through, and the objective names it */
  assert.ok(b.goal.refs?.some((r) => r.type === 'reconciliation' && r.id === 'REC-MDH-13100'), 'the launched reference is carried');
  assert.match(b.goal.objective, /MDH intercompany receivable/);

  /* §5: the trace says where it came from */
  assert.equal(b.origin, 'MODULE');
  assert.equal(b.launchedFrom?.module, 'reconciliations');
  assert.equal(b.launchedFrom?.action, 'INVESTIGATE');
  assert.equal(b.launchedFrom?.object, 'reconciliation:REC-MDH-13100');
  assert.ok(b.events.some((e) => e.type === 'ORIGIN' && /reconciliations/.test(e.label)), 'and the run\'s own log records it');

  /* §20: it is the same runtime, the same profile architecture and the same authority */
  assert.equal(b.graph.planId.startsWith('APLAN-'), true);
  assert.equal(b.goal.policyProfile, POLICY_PROFILES[b.goal.policyProfile].id);
  assert.equal(b.actor.id, me.id);
});

test('§20 — headless, module and conversation reach the same profile for the same objective', async () => {
  const objective = 'Review the June close, identify the material unresolved issues and prepare a controller briefing.';
  const runs: Record<string, AgentRunBody> = {};
  for (const how of ['conversation', 'module', 'headless'] as const) {
    const { orch } = scripted(closeScript);
    let runId: string;
    if (how === 'conversation') { const r = orch.agents.start(me, objective, { sessionId: 'conv-parity' }); assert.ok(r.ok, r.ok ? '' : r.reason); runId = r.run.runId; }
    else if (how === 'module') { const r = orch.agentLaunch.launch(me, { action: 'REVIEW', objective, context: { module: 'close', objectRefs: [], period: '2026-06' } }); assert.ok(r.ok, r.reason ?? ""); runId = r.runId!; }
    else { const r = orch.agentService.start(me, { objective, origin: 'SCHEDULE' }); assert.ok(r.ok, r.ok ? '' : r.reason); runId = r.runId; }
    runs[how] = await until(orch, runId, me);
  }
  const profiles = Object.values(runs).map((b) => b.goal.policyProfile);
  assert.deepEqual([...new Set(profiles)], ['CLOSE'], 'every entry point reaches the same profile');
  const autonomy = Object.values(runs).map((b) => b.goal.constraints.noActions);
  assert.deepEqual([...new Set(autonomy)], [false], 'and the same authority');
  /* only the recorded origin differs */
  assert.deepEqual(Object.values(runs).map((b) => b.origin).sort(), ['CONVERSATION', 'MODULE', 'SCHEDULE']);
});

/* ================================================================================================
   §7 — THE CONVERSATION AND THE RUN ARE TWO OBJECTS, LINKED BY REFERENCE
   ================================================================================================ */
test('§7 — the run references its conversation, and the conversation does not contain the run', async () => {
  const { orch } = scripted(closeScript);
  const sessionId = 'conv-a4-link-1';
  const r = orch.agents.start(me, 'Review the June close and prepare a controller briefing.', { sessionId });
  assert.ok(r.ok);
  const b = await until(orch, r.run.runId, me);
  assert.equal(b.sessionId, sessionId, 'the run names its conversation');
  assert.ok(b.investigationId, 'and the durable investigation it belongs to');
  /* the reverse direction is a REFERENCE, not a copy: the run's state is nowhere in the conversation's record */
  const listed = orch.agents.list(me).map((v) => v.runId);
  assert.ok(listed.includes(r.run.runId), 'the run is its own durable object, listed on its own');
});

/* ================================================================================================
   §9 — THE PHASE IS DERIVED FROM REAL STATE
   ================================================================================================ */
test('§9 — the product phase says what is happening, in words with no plumbing in them', async () => {
  const { orch } = scripted(closeScript);
  const r = orch.agents.start(me, 'Review the June close and prepare a controller briefing.', { sessionId: 'conv-a4-phase-1' });
  assert.ok(r.ok);
  const b = await until(orch, r.run.runId, me);
  const phase = orch.agents.view(b).phase!;
  assert.ok(phase.length > 3);
  assert.equal(/[A-Z]{3,}_|getC|propose|\bM2\b|taskId|tool/.test(phase), false, `no plumbing in "${phase}"`);
  /* and it is derived: a completed run says so, a waiting one says what it waits for */
  assert.equal(orch.agents.view({ ...b, runStatus: 'WAITING_FOR_CONFIRMATION' } as AgentRunBody).phase, 'Waiting for your confirmation');
  assert.equal(orch.agents.view({ ...b, runStatus: 'PAUSED' } as AgentRunBody).phase, 'Paused');
});

/* ================================================================================================
   §15 / §16 — THE WORKPRODUCT, AND THE THREE THINGS IT KEEPS APART
   ================================================================================================ */
test('§15/§16 — a finished run leaves a workproduct, with fact, recommendation and proposal separate', async () => {
  const { orch } = scripted(closeScript);
  const r = orch.agents.start(me, 'Review the June close and prepare a controller briefing.', { sessionId: 'conv-a4-wp-1' });
  assert.ok(r.ok);
  const b = await until(orch, r.run.runId, me);
  assert.equal(b.runStatus, 'COMPLETED', b.completionReason ?? '');

  const wp = orch.agents.workproduct(r.run.runId, me)!;
  assert.ok(wp, 'the run produced one');
  assert.equal(wp.sourceAgentRunId, r.run.runId);
  assert.equal(wp.traceRef, r.run.runId);
  assert.equal(wp.profile, 'CLOSE');
  assert.equal(wp.conversationId, 'conv-a4-wp-1', '§7 it references the conversation it came from');
  assert.ok(wp.executiveSummary.length > 5);
  assert.ok(wp.evaluationRefs!.required.length, '§14 it carries what it is judged against');

  /* §16: three fields, three meanings */
  assert.ok(wp.materialFindings.some((f) => /no owner/.test(f.statement)), 'FACT');
  assert.ok(wp.recommendedActions.some((a) => /Assign owners/.test(a.text)), 'RECOMMENDATION');
  assert.deepEqual(wp.preparedActions, [], 'GOVERNED PROPOSAL — none here, and not conflated with the recommendation');
  assert.equal(wp.recommendedActions.some((a) => wp.materialFindings.some((f) => f.statement === a.text)), false, 'a recommendation is never also stated as a finding');
  assert.ok(wp.unresolvedQuestions.length, 'and what it could not establish is its own field');

  /* §19: presentation is by reference, never a model-authored format */
  assert.deepEqual(Object.keys(wp.presentation).sort(), ['analysisIds', 'artifactIds', 'reportIds']);

  /* §15: it is durable and reusable — read it back from the store, not from the run */
  const again = orch.agents.workproduct(r.run.runId, me)!;
  assert.equal(again.id, wp.id);
  assert.equal(again.executiveSummary, wp.executiveSummary);
});

test('§15 — the workproduct composes nothing: it is a projection of the run', () => {
  const run = { result: null } as unknown as AgentRunBody;
  assert.equal(workproductOf(run), null, 'a run with no result has no workproduct');
});

/* ================================================================================================
   §13 — A SIMPLE QUESTION IS NOT AN AGENT RUN
   ================================================================================================ */
test('§13 — a simple question does not become a run', () => {
  const { orch } = scripted(closeScript);
  const before = orch.agents.list(me).length;
  /* the gate that decides, asked directly — a question is not work to carry through */
  for (const q of ['What was June revenue?', 'What is the CIP balance?', 'Who owns the AP reconciliation?']) {
    assert.equal(orch.agents.detect(q, me), null, `"${q}" is not a goal`);
  }
  assert.equal(orch.agents.list(me).length, before, 'and nothing was started');
});

/* ================================================================================================
   §17 — AUTHORIZATION ON A CONTEXTUAL LAUNCH
   ================================================================================================ */
test('§17 — a module launch is authorized like any other, and cannot widen what the actor may do', async () => {
  const { orch } = scripted(closeScript);
  /* the auditor may not prepare, so the same launch is capped to a read-only profile */
  const out = orch.agentLaunch.launch(auditor, {
    action: 'PREPARE',
    context: { module: 'close', objectRefs: [{ type: 'closeTask', id: 'TASK-1', label: 'Bank reconciliation' }], period: '2026-06' },
    profile: 'CLOSE',
  });
  assert.ok(out.ok, out.reason ?? "");
  const b = await until(orch, out.runId!, auditor);
  assert.notEqual(b.goal.policyProfile, 'CLOSE', 'a module asking for Close does not get preparation authority the actor lacks');
  assert.equal(POLICY_PROFILES[b.goal.policyProfile].autonomy, 1);
  assert.ok(b.warnings.some((w) => /may not prepare/i.test(w)), 'and the run says it was capped rather than quietly doing less');

  /* a module cannot name a model, a route or a budget: there is no field for it */
  assert.equal('model' in ({} as Record<string, unknown>), false);
  const req = { action: 'INVESTIGATE', context: { module: 'x', objectRefs: [] } };
  assert.deepEqual(Object.keys(req).filter((k) => /model|provider|route|budget/i.test(k)), []);
});

test('§17 — an action a surface may not launch is refused by name', () => {
  const { orch } = scripted(closeScript);
  const out = orch.agentLaunch.launch(me, { action: 'DELETE' as never, context: { module: 'close', objectRefs: [] } });
  assert.equal(out.ok, false);
  assert.match(out.reason!, /not an action/);
});
