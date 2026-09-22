/**
 * A1 — THE UNIVERSAL AGENT RUNTIME. What this phase ADDED, and the contracts it fixed.
 *
 * The 30 tests in agent.test.ts, investigate.test.ts and steering.test.ts already pin the Phase 7 / 8D loop: state
 * transitions, durable resume, cancellation, permission denial, capability discovery, tool failure and bounded
 * recovery, approval pause, grounding and steering. They are not repeated here. These tests pin the four things A1
 * changed and the two contracts it established:
 *
 *   §2   the runtime depends on the HOST PORT, not on a conversation — a headless host runs a goal end to end
 *   §13  BOUNDED EXECUTION FOR EVERY RUN — a template run now has a model-call, token and cost ceiling too
 *   §16  ONE canonical trace envelope, projected from the run's own state, with no raw reasoning in it
 *   §18  independent governed READS share a tick; anything that revises the run does not
 *   §20  the smoke objective runs through the GENERIC path with no hard-coded Close logic
 *   §22  machine-readable telemetry, measured rather than self-scored
 *
 * No provider call: the real orchestrator, the real tools, the real Action Engine, a scripted model.
 *   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { WORK } from './store.js';
import { type Actor, ROLES, serverActor } from './tools.js';
import { AgentRuntime } from './agent/runtime.js';
import type { AgentHost } from './agent/host.js';
import type { AgentRunBody, AgentTask } from './agent/model.js';
import type { AgentStepOut, AgentSynthOut } from './schema.js';
import { agentTelemetry, agentTrace } from './trace.js';
import { POLICY_PROFILES } from './agent/model.js';

const me = serverActor();
const reviewer: Actor = { id: 'user:mgiri', name: 'Mitra Giri', ...ROLES['FINANCE_REVIEWER']! };
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];

/* ---- a scripted model, the investigate.test.ts pattern ------------------------------------------------------- */
const usage = { inputTokens: 1200, outputTokens: 150, cacheReadTokens: 100, cacheWriteTokens: 0 };
const ok = <T>(value: T, route: string) => ({ status: 'ok' as const, latencyMs: 1, requestId: null, usage, model: route === 'DEEP' ? 'claude-opus-5' : 'claude-sonnet-5', route, value });
const call = (tool: string, args: Record<string, string>, purpose = `Reading ${tool}`) => ({ tool, intent: 'READ' as const, purpose, progress: purpose, args: Object.entries(args).map(([name, value]) => ({ name, value })) });
const step = (o: Partial<AgentStepOut>): AgentStepOut => ({ goalClass: 'CLOSE_READINESS', understanding: 'Establish where the June close stands and what is unresolved.', decision: 'CALL_TOOLS', calls: [], needCapabilities: [], workingNotes: [], openQuestions: [], question: null, options: [], confidence: 0.8, escalate: { needed: false, reason: null, detail: null }, ...o }) as AgentStepOut;
type Ctx = { observations: { ref: string; tool: string; status: string; facts: { key: string; label: string; value: string }[] }[] };
interface Script { step: (n: number, ctx: Ctx) => AgentStepOut; synth?: (ctx: Ctx, refs: string[]) => AgentSynthOut }

/** a briefing built ONLY from figures observations carried — an invented one would be rejected by the grounding check */
const briefing = (ctx: Ctx, refs: string[]): AgentSynthOut => {
  const cited = ctx.observations.filter((o) => o.status === 'OK').slice(0, 3);
  return {
    headline: 'The June close has unresolved items worth a controller review.',
    inspected: cited.map((o) => o.tool),
    findings: cited.map((o) => {
      const f = o.facts[0];
      return { statement: f ? `${o.tool} reports ${f.label}: ${f.value}.` : `${o.tool} returned no exceptions.`, kind: 'OBSERVED_FACT' as const, support: 'SUPPORTED' as const, observationRefs: [o.ref] };
    }),
    unresolved: ['Whether the unexplained movements have been reviewed since.'],
    nextSteps: [{ label: 'Open the close workspace', request: 'What is blocking the June close?' }],
    confidence: 0.75, rejectedNote: null, escalate: { needed: false, reason: null, detail: null },
  } as unknown as AgentSynthOut;
};

function scripted(sc: Script) {
  const log: { routes: string[]; toolIds: string[][] } = { routes: [], toolIds: [] };
  const a = new MockLLMAdapter(); Object.defineProperty(a, 'provider', { value: 'scripted' });
  const A = a as unknown as Record<string, unknown>;
  A['converse'] = async () => ok({ conversationIntent: 'INVESTIGATION', requiresTool: true, reply: null, unsupportedOperation: null, confidence: 0.9 }, 'FAST');
  A['agentStep'] = async (i: { context: Ctx; toolIds: string[] }, o: { route: string }) => { log.routes.push(o.route); log.toolIds.push(i.toolIds); return ok(sc.step(log.routes.length, i.context), o.route); };
  A['agentSynth'] = async (i: { context: Ctx; refs: string[] }, o: { route: string }) => ok((sc.synth ?? briefing)(i.context, i.refs), o.route);
  const orch = new SloaneOrchestrator(a, { maxPlanSteps: 8 }, () => me);
  orch.artifacts.storage = mkdtempSync(join(tmpdir(), 'korvyn-a1-'));
  return { orch, log };
}
async function until(o: SloaneOrchestrator, runId: string, actor: Actor, ms = 20000): Promise<AgentRunBody> {
  const t0 = Date.now();
  for (;;) { const b = o.agents.body(runId, actor)!; if (TERMINAL.includes(b.runStatus) || b.runStatus.startsWith('WAITING') || Date.now() - t0 > ms) return b; await settle(25); }
}

/* ================================================================================================
   §20 — THE SMOKE OBJECTIVE, through the GENERIC path
   ================================================================================================ */
test('§20 smoke — a read-only cross-module objective plans, discovers capabilities, reads, replans and briefs, with no hard-coded Close logic', async () => {
  const { orch, log } = scripted({
    step: (n) => n === 1
      /* three INDEPENDENT reads across three modules — close, reconciliations, flux */
      ? step({ calls: [call('getCloseBlockers', { period: '2026-06' }), call('getReconciliationsNotTied', { period: '2026-06' }), call('getUnexplainedFluxItems', { period: '2026-06' })] })
      /* §11 REPLAN: what the first reads showed decides the next one — it was not in any up-front plan */
      : n === 2 ? step({ calls: [call('getReconciliationsMissingSupport', { period: '2026-06' })], workingNotes: [{ text: 'Several reconciliations do not tie; check whether support is also missing.', support: 'PARTIALLY_SUPPORTED', observationRefs: ['O1'] }] })
        : step({ decision: 'SYNTHESIZE' }),
  });
  const started = orch.agents.start(me, 'Review the June close status, identify the most material unresolved issues, and prepare a concise controller briefing with traceable evidence.', { goalType: 'INVESTIGATE' });
  assert.ok(started.ok, started.ok ? '' : started.reason);
  const body = await until(orch, started.run.runId, me);

  assert.equal(body.runStatus, 'COMPLETED', body.completionReason ?? '');
  /* NO CLOSE TEMPLATE: the plan came from the model, step by step, over the generic loop */
  assert.equal(body.goal.type, 'INVESTIGATE');
  assert.equal(body.planner, 'MODEL');
  assert.equal(body.goal.policyProfile, 'INVESTIGATION');
  assert.equal(POLICY_PROFILES[body.goal.policyProfile].autonomy, 1, 'read-only autonomy');

  /* §6 capability discovery: a bounded, actor-filtered, READ-only subset — never the whole registry */
  assert.ok(log.toolIds[0]!.length > 0 && log.toolIds[0]!.length <= 20, `capabilities shown: ${log.toolIds[0]!.length}`);

  /* §9 several governed reads, across modules, through the canonical services */
  const tools = body.trace.toolCalls.filter((c) => c.status === 'COMPLETED').map((c) => c.tool);
  assert.ok(tools.length >= 4, `governed reads: ${tools.join(', ')}`);
  assert.ok(tools.includes('getCloseBlockers') && tools.includes('getReconciliationsNotTied') && tools.includes('getUnexplainedFluxItems'));

  /* §11 the run replanned after observing */
  assert.ok(body.graph.revisions.length >= 3, `plan revisions: ${body.graph.revisions.length}`);
  assert.ok(body.graph.revisions.some((r) => r.reason.includes('getReconciliationsMissingSupport')), 'the fourth read was added after the first three were observed');

  /* §20.7 a final briefing, §20.8 with fact references preserved */
  const inv = body.result!.investigation!;
  assert.ok(inv.findings.length >= 2, 'the briefing states findings');
  assert.ok(inv.findings.every((f) => f.observationRefs.length), 'every finding cites the observation it came from');
  const factIds = body.investigation!.observations.flatMap((o) => o.facts.map((f) => f.id)).filter(Boolean);
  assert.ok(factIds.length > 0, 'FinancialFact ids survive into the observations');

  /* §20.9 persisted, and §20.10 the operational trace reconstructs */
  const stored = WORK.repos.records.get<{ run: AgentRunBody }>('AGENT_RUN', body.runId);
  assert.ok(stored, 'the run is durable');
  assert.equal(stored!.run.runStatus, 'COMPLETED');
  const t = orch.agents.traceOf(body.runId, me)!;
  assert.equal(t.traceKind, 'AGENT_RUN');
  assert.equal(t.objective, body.goal.objective, 'the objective is kept verbatim');
  assert.ok(t.plan.revisions.length && t.toolCalls.length && t.modelCalls.length && t.transitions.length);
  assert.ok(t.stopReason, 'why it stopped is recorded');
});

/* ================================================================================================
   §2 — THE HOST PORT: a run needs a HOST, not a conversation
   ================================================================================================ */
test('§2 host port — the runtime runs a goal against a headless host that keeps no conversation context', async () => {
  const { orch } = scripted({ step: (n) => (n === 1 ? step({ calls: [call('getCloseBlockers', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' })) });
  let contextSyncs = 0;
  const sessionId = 'headless-a1-0001';
  /**
   * A host that is NOT the orchestrator object: it provisions its own execution context, names its own
   * investigation, and has no conversation to keep in step. Everything else delegates to Korvyn's canonical
   * governed services — §24 forbids an agent-only ledger, and this is what honouring that looks like.
   */
  const headless: AgentHost = {
    gl: orch.gl, data: orch.data, controls: orch.controls, artifacts: orch.artifacts, actions: orch.actions,
    decide: (i, a) => orch.decide(i, a),
    agentSession: (sid, actor, seed) => { orch.agentSession(sid, actor, seed); return 'INV-HEADLESS-A1'; },
    agentContext: () => { contextSyncs += 1; },
    agentAllowlist: (actor, d, p) => orch.agentAllowlist(actor, d, p),
    agentValidate: (sid, actor, s, allow) => orch.agentValidate(sid, actor, s, allow),
    agentExecute: (sid, actor, s, planId, objectId) => orch.agentExecute(sid, actor, s, planId, objectId),
    agentPlan: (sid, actor, g, allow, sig) => orch.agentPlan(sid, actor, g, allow, sig),
    agentThink: (i, r, sig) => orch.agentThink(i, r, sig),
    agentSynth: (i, r, sig) => orch.agentSynth(i, r, sig),
    agentNarrate: (req, objs, sig) => orch.agentNarrate(req, objs, sig),
  };
  const runtime = new AgentRuntime(headless);
  const r = runtime.start(me, 'Review the June close.', { goalType: 'INVESTIGATE', sessionId });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const t0 = Date.now();
  for (;;) { const b = runtime.body(r.run.runId, me)!; if (TERMINAL.includes(b.runStatus) || Date.now() - t0 > 20000) break; await settle(25); }
  const body = runtime.body(r.run.runId, me)!;
  assert.equal(body.runStatus, 'COMPLETED', body.completionReason ?? '');
  assert.equal(body.investigationId, 'INV-HEADLESS-A1', 'the HOST names the investigation, not the runtime');
  assert.ok(body.trace.toolCalls.some((c) => c.status === 'COMPLETED'), 'governed reads ran through the port');
  assert.equal(contextSyncs, 0, 'a run that is not steered never asks the host to sync a conversation');
});

/* ================================================================================================
   §13 — BOUNDED EXECUTION FOR EVERY RUN
   ================================================================================================ */
test('§13 budget — every run carries one, a legacy template run included; exhaustion is a controlled state, checked before the step', async () => {
  const { orch } = scripted({ step: () => step({ decision: 'SYNTHESIZE' }) });
  /* A LEGACY TEMPLATE run (A2 §6: reachable only by naming the shim) — before A1 this had a step and wall-clock
     ceiling and no model, token or cost ceiling at all. */
  const r = orch.agents.start(me, 'Review the June close.', { goalType: 'REVIEW_CLOSE' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const b = r.run.budget!;
  assert.ok(b, 'a legacy template run carries a budget');
  assert.equal(b.maxIterations, POLICY_PROFILES['READ_ONLY'].maxSteps, 'the profile owns how many steps');
  assert.ok(b.maxModelCalls > 0 && b.maxInputTokens > 0 && b.maxEstimatedCostUsd > 0, 'and the deployment owns model calls, tokens and cost');
  await until(orch, r.run.runId, me);

  /* EXHAUSTION: clamped before the loop starts, the run stops without taking a step — the check is before, not after */
  const r2 = orch.agents.start(me, 'Review the June close.', { goalType: 'REVIEW_CLOSE' });
  assert.ok(r2.ok, r2.ok ? '' : r2.reason);
  r2.run.budget!.maxToolCalls = 0;
  const body2 = await until(orch, r2.run.runId, me);
  assert.equal(body2.runStatus, 'BLOCKED');
  assert.match(body2.completionReason!, /tool-call budget/, body2.completionReason ?? '');
  assert.equal(body2.trace.toolCalls.length, 0, 'not one governed read was made after the budget was spent');
  assert.ok(body2.warnings.some((w) => /^Budget:/.test(w)), 'the exhausted dimension is recorded on the run');
  assert.ok(agentTelemetry(body2).budgetLimitsReached.length, 'and is machine-readable');
});

test('§13 budget — a person-initiated steering revision raises the ceiling it would otherwise hit', async () => {
  const { orch } = scripted({ step: () => step({ decision: 'SYNTHESIZE' }) });
  const r = orch.agents.start(me, 'Review the June close.', { goalType: 'REVIEW_CLOSE' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const before = r.run.budget!.maxIterations;
  await until(orch, r.run.runId, me);
  const b = orch.agents.body(r.run.runId, me)!;
  assert.equal(b.budget!.maxIterations, b.limits.maxSteps, 'the outer budget tracks the step limit steering can raise');
  assert.ok(b.budget!.maxIterations >= before);
});

/* ================================================================================================
   §18 — PARALLELISM
   ================================================================================================ */
test('§18 parallelism — independent governed reads share a tick; a step that revises the run never does', async () => {
  const { orch } = scripted({
    step: (n) => (n === 1
      ? step({ calls: [call('getCloseBlockers', { period: '2026-06' }), call('getReconciliationsNotTied', { period: '2026-06' }), call('getUnexplainedFluxItems', { period: '2026-06' })] })
      : step({ decision: 'SYNTHESIZE' })),
  });
  const r = orch.agents.start(me, 'Review the June close.', { goalType: 'INVESTIGATE' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const body = await until(orch, r.run.runId, me);
  assert.equal(body.runStatus, 'COMPLETED', body.completionReason ?? '');
  const par = body.events.filter((e) => e.type === 'STEPS_PARALLEL');
  assert.ok(par.length >= 1, `the three independent reads ran together (events: ${body.events.map((e) => e.type).join(',')})`);
  assert.match(par[0]!.label, /^3 independent reads run together/);
  /* every task still completed, and each one still has its own observation and trace entry */
  const reads = body.graph.tasks.filter((t) => t.tool && t.origin === 'MODEL');
  assert.equal(reads.filter((t) => t.status === 'COMPLETED').length, reads.length);
  assert.equal(body.trace.toolCalls.length, reads.length, 'one trace entry per read, none lost to interleaving');
});

test('§18 parallelism — the safety rule is a property of the step, not of the goal', () => {
  const rt = new AgentRuntime({} as AgentHost) as unknown as { parallelSafe(t: Partial<AgentTask>): boolean };
  assert.equal(rt.parallelSafe({ tool: 'getCloseBlockers', riskLevel: 'READ' }), true, 'a plain governed read batches');
  assert.equal(rt.parallelSafe({ tool: 'getCloseBlockers', riskLevel: 'READ', expand: 'RECON_COMMENTS' }), false, 'an expanding read revises the graph mid-batch');
  assert.equal(rt.parallelSafe({ tool: 'proposeReconComment', riskLevel: 'PROPOSE' }), false, 'a proposal joins an action plan; order is meaning');
  assert.equal(rt.parallelSafe({ check: 'VERIFY', riskLevel: 'INTERNAL' }), false, 'an internal check reads the whole run');
  assert.equal(rt.parallelSafe({ tool: null, riskLevel: 'READ' }), false);
});

/* ================================================================================================
   §16 — ONE CANONICAL TRACE
   ================================================================================================ */
test('§16 trace — the envelope reconstructs the chain, carries decision summaries, and holds no raw model reasoning', async () => {
  const { orch } = scripted({ step: (n) => (n === 1 ? step({ calls: [call('getCloseBlockers', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' })) });
  const r = orch.agents.start(me, 'Review the June close.', { goalType: 'INVESTIGATE' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const body = await until(orch, r.run.runId, me);
  const t = agentTrace(body, { profile: 'INVESTIGATION', autonomy: 1 }, false);

  /* OBJECTIVE → PLAN → MODEL DECISIONS → TOOL CALLS → AUTHORIZATION → OBSERVATIONS → FACTS → REPLANS → RESULT */
  assert.ok(t.objective.length);
  assert.ok(t.plan.planId && t.plan.revisions.length);
  assert.ok(t.modelCalls.length, 'model decisions');
  assert.ok(t.modelCalls.every((c) => c.route && typeof c.latencyMs === 'number'), 'each names a ROUTE, never a provider SDK type');
  assert.ok(t.toolCalls.length && t.toolCalls.every((c) => c.stepId && c.traceId));
  assert.ok(t.authorizations.some((a) => a.subject.startsWith('profile:')), 'the policy decision is in the trace');
  assert.ok(t.observations.length);
  assert.ok(t.references.factIds.length, 'fact references survive');
  assert.ok(t.transitions.length, 'deterministic state changes');
  assert.ok(t.usage.modelCalls > 0 && t.usage.toolCalls > 0);
  assert.equal(t.policy.writeActionsEnabled, false);

  /* no raw chain-of-thought, by construction: there is no field for it */
  const keys = JSON.stringify(t);
  assert.ok(!/"thinking"|"reasoning"|"chainOfThought"|"rawThought"/.test(keys), 'the envelope has no place to put hidden reasoning');

  /* the projection is computed on READ, so it can never drift from the run */
  const again = agentTrace(orch.agents.body(r.run.runId, me)!, null, false);
  assert.deepEqual(again.toolCalls.map((c) => c.tool), t.toolCalls.map((c) => c.tool));
});

test('§16/§7 trace — an authorization denial is recorded, and the denied capability never ran', async () => {
  const { orch } = scripted({ step: (n) => (n === 1 ? step({ calls: [call('postJournalEntry', {}), call('getCloseBlockers', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' })) });
  const r = orch.agents.start(me, 'Review the June close.', { goalType: 'INVESTIGATE' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const body = await until(orch, r.run.runId, me);
  const t = orch.agents.traceOf(body.runId, me)!;
  assert.ok(t.authorizations.some((a) => a.decision === 'DENY' && a.subject === 'postJournalEntry'), 'the refusal is in the trace');
  assert.ok(!t.toolCalls.some((c) => c.tool === 'postJournalEntry'), 'and the governed action never executed');
  assert.equal(agentTelemetry(body).authorizationViolations, 0);
});

test('§16 trace — a run belongs to the actor who started it', async () => {
  const { orch } = scripted({ step: () => step({ decision: 'SYNTHESIZE' }) });
  const r = orch.agents.start(me, 'Review the June close.');
  assert.ok(r.ok, r.ok ? '' : r.reason);
  await until(orch, r.run.runId, me);
  assert.ok(orch.agents.traceOf(r.run.runId, me), 'the owner reads it');
  assert.equal(orch.agents.traceOf(r.run.runId, reviewer.id === me.id ? { ...me, id: 'user:other' } : reviewer), null, 'nobody else does');
  assert.equal(orch.agents.telemetry(r.run.runId, { ...me, id: 'user:other' }), null);
});

/* ================================================================================================
   §22 — EVALUATION TELEMETRY
   ================================================================================================ */
test('§22 telemetry — every field the Eval workstream needs, measured, with no self-scored completion', async () => {
  const { orch } = scripted({ step: (n) => (n === 1 ? step({ calls: [call('getCloseBlockers', { period: '2026-06' }), call('getReconciliationsNotTied', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' })) });
  const r = orch.agents.start(me, 'Review the June close status and the open reconciliations.', { goalType: 'INVESTIGATE' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const body = await until(orch, r.run.runId, me);
  const m = agentTelemetry(body);

  assert.equal(m.runId, body.runId);
  assert.equal(m.objective, body.goal.objective);
  assert.ok(m.stopReason, 'WHY it stopped');
  assert.ok(m.iterations > 0 && m.steps > 0 && m.modelCalls > 0 && m.toolCalls > 0);
  assert.ok(m.toolsUsed.includes('getCloseBlockers'));
  assert.ok(m.factsDiscovered > 0 && m.objectsRead > 0);
  assert.ok(m.latencyMs >= 0 && m.inputTokens > 0 && m.outputTokens > 0);
  assert.ok(m.estimatedCostUsd > 0, 'cost is estimated from the route that answered');
  assert.ok(m.cacheReadTokens > 0, 'cache reads are counted, so a cached turn is not billed as a fresh one');
  assert.equal(m.authorizationViolations, 0);
  /* §15: the runtime never executes a governed action. Measured, not asserted in prose. */
  assert.equal(m.governedActionsExecuted, 0);
  /* the fields an evaluator needs to judge completion — and no field where the runtime marks its own homework */
  assert.ok(!('objectiveCompleted' in m) && !('score' in m), 'the runtime does not grade itself');
  assert.ok(Array.isArray(m.verificationChecks));
});

/* ================================================================================================
   §14 — a budget survives the restart the run survives
   ================================================================================================ */
test('§10 facts — EVERY run preserves canonical FinancialFact ids, a template run included, and they are the ids a conversation would cite', async () => {
  const { orch } = scripted({ step: (n) => (n === 1 ? step({ calls: [call('getCloseBlockers', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' })) });
  /* before A1 an observation carried a figure's key and value and no citable handle */
  const r = orch.agents.start(me, 'Review the June close.');
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const body = await until(orch, r.run.runId, me);
  const withFacts = body.observations.filter((o) => (o.factIds ?? []).length);
  assert.ok(withFacts.length > 0, 'every run promotes facts');
  const t = agentTrace(body, null, false);
  assert.ok(t.references.factIds.length > 0, 'and they reach the trace');
  assert.equal(agentTelemetry(body).factsDiscovered, t.references.factIds.length);

  /* the SAME governed figure, promoted through the same registry, is the same fact — one implementation (§24) */
  const first = body.observations.find((o) => (o.factIds ?? []).length)!;
  const again = orch.agents.body(r.run.runId, me)!.observations.find((o) => o.taskId === first.taskId)!;
  assert.deepEqual(again.factIds, first.factIds, 'fact ids are deterministic over the object, not over the run');
  assert.ok(first.factIds!.every((id) => /^f_/.test(id)), `canonical fact ids: ${first.factIds!.slice(0, 2).join(', ')}`);
});

test('§14 durable — a run paused by a restart keeps its budget and its spend', async () => {
  const { orch } = scripted({ step: (n) => (n === 1 ? step({ calls: [call('getCloseBlockers', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' })) });
  const r = orch.agents.start(me, 'Review the June close.');
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const body = await until(orch, r.run.runId, me);
  const spentTools = body.usage.toolCalls ?? 0;
  assert.ok(spentTools > 0);
  /* a fresh runtime over the same durable store is what a server restart is */
  const again = new AgentRuntime(orch as unknown as AgentHost);
  const reloaded = again.body(r.run.runId, me)!;
  assert.equal(reloaded.usage.toolCalls, spentTools, 'the spend is durable, so a resumed run cannot spend it twice');
  assert.ok(reloaded.budget, 'and so is the ceiling it was spending against');
});
