/**
 * A1 §16 — THE CANONICAL KORVYN TRACE, and the answer to "one trace architecture or three?".
 *
 * THE FINDING. Korvyn had grown three incompatible trace shapes, each correct for its own producer and none
 * readable by a common consumer:
 *
 *   SloaneExecutionTrace (orchestrator.ts)  a conversational TURN — interpretation, clarification, plan, narration.
 *                                           Served at GET /api/sloane/trace/:id.
 *   V2Trace              (v2/model.ts)      a v2 turn — strategy, routes, cache reads, first-useful-answer.
 *   AgentRunTrace        (agent/model.ts)   a RUN — tool calls, model calls, policy decisions, over many steps.
 *
 * THE DECISION. `AgentTrace` is NOT a fourth shape, and the three above are NOT rewritten into one. Korvyn gets a
 * canonical ENVELOPE — `KorvynTrace` — that every producer PROJECTS INTO, and keeps its own internal shape for its
 * own debugging. An envelope is the right unit because the three producers genuinely differ in what they do and
 * agree completely on what an auditor asks: who, under what authority, using which capabilities, deciding what, at
 * what cost, stopping why. A single merged interface would have to carry `interpretation`, `strategy` AND
 * `planRevisions`, two of which are null for any given trace — which is three shapes wearing one name.
 *
 * WHY AN ENVELOPE RATHER THAN PATCHING /api/sloane/trace/:id (the brief's own warning). That endpoint serves the v1
 * turn shape to development tooling; changing it would break those readers to make an agent fit a contract that was
 * never about runs. The agent emits the envelope at its OWN endpoint. The migration is then additive and can be
 * done one producer at a time, with the envelope as the fixed point:
 *
 *   NOW   agent runs emit KorvynTrace            (GET /api/sloane/agent/runs/:id/trace)
 *   NEXT  the v2 turn projects into it           (its raw shape stays for development)
 *   THEN  the v1 endpoint serves the envelope and offers its raw shape behind ?raw=1
 *
 * NOTHING HERE IS A SECOND RECORD. A projection is computed from the producer's own durable state on read; no
 * trace is stored twice, and the envelope can never drift from the run it describes.
 */
import type { AgentRunBody } from './agent/model.js';
import type { ModelCallRecord } from './agent/host.js';

export type TraceKind = 'AGENT_RUN' | 'CONVERSATION_TURN' | 'MODULE_ACTION';

/** an authorization decision, exactly as the gate made it — the run never decides authority itself (§7) */
export interface TraceAuthorization {
  at: string;
  /** what was being authorized: a capability id, a policy profile, an action type */
  subject: string;
  decision: 'ALLOW' | 'DENY' | 'CHECKPOINT';
  reason: string;
}

/** one governed capability invocation */
export interface TraceToolCall {
  at: string | null;
  stepId: string;
  tool: string;
  args: Record<string, string>;
  status: string;
  latencyMs: number;
  /** the governed object it produced, if any — the handle everything else in the trace points at */
  objectId: string | null;
  error: string | null;
  traceId: string;
}

/** a deterministic, auditable state change — never invented by a model (§4) */
export interface TraceTransition { at: string; type: string; label: string }

/** what a run produced that an auditor can follow: governed objects, facts, evidence, populations, artifacts */
export interface TraceReferences {
  objectIds: string[];
  factIds: string[];
  evidenceIds: string[];
  populationIds: string[];
  artifactIds: string[];
  proposalIds: string[];
}

export interface TraceUsage {
  steps: number;
  modelCalls: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

/**
 * THE ENVELOPE. Reconstructs A1 §16's chain for any producer:
 *   OBJECTIVE → PLAN → MODEL DECISIONS → TOOL CALLS → AUTHORIZATION → OBSERVATIONS → FACTS/EVIDENCE → REPLANS →
 *   APPROVALS → FINAL RESULT.
 *
 * It carries operational DECISION SUMMARIES and never raw chain-of-thought: what was decided, on what, and why, in
 * the words the producer already records for a person. There is no field for hidden model reasoning and one must
 * not be added.
 */
export interface KorvynTrace {
  traceId: string;
  traceKind: TraceKind;
  /** the durable object this trace describes (a run id, a turn id) */
  subjectId: string;
  subjectTitle: string;
  actor: { id: string; role: string; scope: 'ALL' | string[] };
  /** the capability profile / policy in force, and the autonomy ceiling it set */
  policy: { profile: string | null; autonomy: number | null; writeActionsEnabled: boolean };
  objective: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  /** every plan and replan, with what each revision added, invalidated and rejected (§11) */
  plan: { planId: string; version: number; source: string; revisions: { version: number; at: string; source: string; reason: string; added: string[]; invalidated: string[]; rejected: { task: string; why: string }[] }[] };
  /** the ordered steps: what each one was for, what it called, and what came back */
  steps: { stepId: string; type: string; title: string; status: string; tool: string | null; riskLevel: string; origin: string; planVersion: number; dependsOn: string[]; startedAt: string | null; latencyMs: number | null; failureMode: string | null; error: string | null }[];
  modelCalls: ModelCallRecord[];
  toolCalls: TraceToolCall[];
  authorizations: TraceAuthorization[];
  /** a compact record of what each step observed — never the rows, which stay governed in Korvyn (§10) */
  observations: { stepId: string; at: string; status: string; resultType: string | null; objectIds: string[]; warnings: string[]; errors: string[]; findings: number }[];
  transitions: TraceTransition[];
  /** every place the run stopped for a person, and how it was resolved (§15) */
  approvals: { id: string; type: string; status: string; blocking: boolean; title: string; createdAt: string; resolvedAt: string | null; resolution: string | null; resolvedBy: string | null; proposalIds: string[] }[];
  /** instructions a person gave mid-run, and what each one changed (§14) */
  interventions: { at: string; by: string; text: string; kind: string; effect: string }[];
  references: TraceReferences;
  usage: TraceUsage;
  /** the completion criteria the runtime checked before it would say COMPLETED (§12) */
  verification: { at: string; passed: boolean; checks: { check: string; ok: boolean; detail: string }[] } | null;
  /** WHY the run stopped — always recorded, for every terminal state */
  stopReason: string | null;
  result: { headline: string; findings: number; narrative: string[] } | null;
}

/* ================================================================================================
   THE AGENT PROJECTION — computed from the run's own durable state, never stored beside it
   ================================================================================================ */
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

export function agentTrace(run: AgentRunBody, policy: { profile: string; autonomy: number } | null, writeActionsEnabled: boolean): KorvynTrace {
  const inv = run.investigation;
  /* an open investigation's THINK steps are model calls too; the run's own trace already holds them, and the
     investigation's usage is what the budget was enforced against */
  const usage: TraceUsage = {
    steps: run.usage.steps,
    modelCalls: run.trace.modelCalls.length,
    toolCalls: run.trace.toolCalls.length,
    inputTokens: run.usage.inputTokens,
    outputTokens: run.usage.outputTokens,
    cacheReadTokens: run.trace.modelCalls.reduce((n, c) => n + (c.cacheReadTokens ?? 0), 0),
    estimatedCostUsd: run.trace.modelCalls.reduce((n, c) => n + (c.costUsd ?? 0), 0),
    latencyMs: (run.completedAt ? Date.parse(run.completedAt) : Date.now()) - Date.parse(run.startedAt),
  };
  return {
    traceId: `TRACE-${run.runId}`,
    traceKind: 'AGENT_RUN',
    subjectId: run.runId,
    subjectTitle: run.goal.title,
    actor: { id: run.actor.id, role: run.actor.role, scope: run.actor.scope },
    policy: { profile: policy?.profile ?? run.goal.policyProfile, autonomy: policy?.autonomy ?? null, writeActionsEnabled },
    objective: run.goal.objective,
    startedAt: run.startedAt,
    endedAt: run.completedAt,
    status: run.runStatus,
    plan: { planId: run.graph.planId, version: run.graph.version, source: run.planner, revisions: run.graph.revisions },
    steps: run.graph.tasks.map((t) => ({
      stepId: t.taskId, type: t.type, title: t.title, status: t.status, tool: t.tool, riskLevel: t.riskLevel, origin: t.origin,
      planVersion: t.planVersion, dependsOn: t.dependsOn, startedAt: t.startedAt, latencyMs: t.latencyMs, failureMode: t.failureMode, error: t.error,
    })),
    modelCalls: run.trace.modelCalls,
    toolCalls: run.trace.toolCalls.map((c) => {
      const t = run.graph.tasks.find((x) => x.taskId === c.taskId);
      return { at: t?.startedAt ?? null, stepId: c.taskId, tool: c.tool, args: c.args, status: c.status, latencyMs: c.latencyMs, objectId: c.objectId, error: c.error, traceId: c.traceId };
    }),
    authorizations: run.trace.policyDecisions,
    observations: run.observations.map((o) => ({ stepId: o.taskId, at: o.at, status: o.status, resultType: o.resultType, objectIds: o.objectIds, warnings: o.warnings, errors: o.errors, findings: o.findings.length })),
    transitions: run.events,
    approvals: run.checkpoints.map((c) => ({ id: c.id, type: c.type, status: c.status, blocking: c.blocking, title: c.title, createdAt: c.createdAt, resolvedAt: c.resolvedAt, resolution: c.resolution, resolvedBy: c.resolvedBy, proposalIds: c.proposalIds })),
    interventions: run.interventions.map((i) => ({ at: i.at, by: i.by, text: i.text, kind: i.kind, effect: i.effect })),
    references: {
      objectIds: uniq(run.observations.flatMap((o) => o.objectIds)),
      /* every run's observations carry them; an investigation's compact observations hold them per fact as well */
      factIds: uniq([...run.observations.flatMap((o) => o.factIds ?? []), ...(inv?.observations ?? []).flatMap((o) => o.facts.map((f) => f.id))]),
      evidenceIds: uniq(run.observations.flatMap((o) => o.evidence)),
      populationIds: uniq((inv?.observations ?? []).map((o) => o.population?.populationId)),
      artifactIds: uniq(run.artifactIds),
      proposalIds: uniq(run.observations.flatMap((o) => o.proposalIds)),
    },
    usage,
    verification: run.verification,
    stopReason: run.completionReason ?? inv?.stopReason ?? null,
    result: run.result ? { headline: run.result.headline, findings: run.result.findings.length, narrative: run.result.narrative } : null,
  };
}

/* ================================================================================================
   A2 §2 — THE CONVERSATION PROJECTION: the second producer, projected additively
   ================================================================================================ */
/**
 * A conversational TURN in the same envelope. Nothing about `V2Trace` changed and no consumer of it moved: this is
 * a READ-SIDE projection, computed on demand, exactly as the agent's is. That is what "additively" means here —
 * three shapes still exist internally, and a consumer that wants one contract across producers now has one.
 *
 * WHAT A TURN GENUINELY DOES NOT HAVE, and is therefore null rather than faked:
 *   plan revisions        a turn has a strategy, not a plan that survives to be revised
 *   approvals             a proposal a turn prepares is decided on its own endpoint, not inside the turn
 *   verification          a turn is verified by GROUNDING, which is reported in its own field
 *   authorizations        v2 authorizes every tool call and records the OUTCOME (a REFUSED tool), not a decision
 *                         list; the refusals are projected as DENY and nothing is invented for the rest
 *
 * The remaining legacy shape is `SloaneExecutionTrace` (the v1 turn, served at /api/sloane/trace/:id). It is the
 * next producer to project and the last one to deprecate, because development tooling reads it directly.
 */
export function conversationTrace(t: import('./v2/model.js').V2Trace, actor: { id: string; role: string; scope: 'ALL' | string[] }, writeActionsEnabled: boolean): KorvynTrace {
  const at = new Date(Date.now() - t.latencyMs).toISOString();
  return {
    traceId: t.traceId,
    traceKind: 'CONVERSATION_TURN',
    subjectId: t.sessionId,
    subjectTitle: t.request.slice(0, 80),
    actor,
    policy: { profile: t.strategy, autonomy: null, writeActionsEnabled },
    objective: t.request,
    startedAt: at,
    endedAt: new Date().toISOString(),
    status: t.responseType ?? t.path,
    /* a turn's "plan" is the strategy it chose and the path it took; it has no revisions by construction */
    plan: { planId: t.traceId, version: 1, source: t.strategy ?? t.path, revisions: [] },
    steps: t.tools.map((x, i) => ({
      stepId: `t${i + 1}`, type: 'RETRIEVE', title: x.tool, status: x.status, tool: x.tool, riskLevel: 'READ',
      origin: 'MODEL', planVersion: 1, dependsOn: [], startedAt: null, latencyMs: x.latencyMs, failureMode: x.status === 'FAILED' ? 'ERROR' : null, error: x.error,
    })),
    modelCalls: t.calls.map((c) => ({ stage: c.stage, route: null, model: c.model, status: c.status, latencyMs: c.latencyMs, inputTokens: c.inputTokens, outputTokens: c.outputTokens, cacheReadTokens: c.cacheReadTokens, error: c.error })),
    toolCalls: t.tools.map((x, i) => ({ at: null, stepId: `t${i + 1}`, tool: x.tool, args: {}, status: x.status, latencyMs: x.latencyMs, objectId: null, error: x.error, traceId: t.traceId })),
    /* only what was actually decided: a refused call is a recorded DENY; nothing is invented for the rest */
    authorizations: t.tools.filter((x) => x.status === 'REFUSED').map((x) => ({ at, subject: x.tool, decision: 'DENY' as const, reason: x.error ?? 'refused' })),
    observations: t.tools.map((x, i) => ({ stepId: `t${i + 1}`, at, status: x.status, resultType: null, objectIds: [], warnings: [], errors: x.error ? [x.error] : [], findings: 0 })),
    transitions: [{ at, type: 'TURN', label: `${t.path}${t.strategy ? ` · ${t.strategy}` : ''}` }],
    approvals: [],
    interventions: [],
    references: {
      objectIds: Object.values(t.activeStateRefs).filter((v): v is string => !!v),
      factIds: [], evidenceIds: [], populationIds: [], artifactIds: [], proposalIds: [],
    },
    usage: {
      steps: t.tools.length, modelCalls: t.modelCalls, toolCalls: t.toolCalls, inputTokens: t.inputTokens, outputTokens: t.outputTokens,
      cacheReadTokens: t.cacheReadTokens, estimatedCostUsd: 0, latencyMs: t.latencyMs,
    },
    verification: null,
    stopReason: t.responseType ?? null,
    result: null,
  };
}

/* ================================================================================================
   A1 §22 — EVALUATION TELEMETRY
   ================================================================================================ */
/**
 * The machine-readable record the Eval workstream consumes. Every field here is MEASURED by the runtime.
 *
 * Deliberately absent: "objective completion" and "material items missed". Neither can be computed by the runtime —
 * both need an oracle that knows what the right answer was, which is the evaluator's job and not the agent's. What
 * is exposed instead is everything an evaluator needs to decide them: the objective, the stop reason, the
 * verification checks, the findings, and every governed object that was read. A runtime that scored itself on
 * whether it met the objective would be marking its own homework.
 */
export interface AgentTelemetry {
  runId: string;
  objective: string;
  goalType: string;
  profile: string;
  status: string;
  stopReason: string | null;
  /** deterministic completion criteria the runtime checked (§12) — an evaluator's ground truth, not a self-score */
  verificationPassed: boolean | null;
  verificationChecks: { check: string; ok: boolean }[];
  iterations: number;
  steps: number;
  planRevisions: number;
  modelCalls: number;
  toolCalls: number;
  toolsUsed: string[];
  /** a call that was validated and then produced nothing usable: an evaluator's "unnecessary call" signal */
  emptyToolCalls: number;
  refusedToolCalls: number;
  failedToolCalls: number;
  /** capabilities the actor was NOT permitted to use, refused at the gate — a violation would be a non-zero execution */
  authorizationDenials: number;
  authorizationViolations: number;
  factsDiscovered: number;
  findings: number;
  objectsRead: number;
  proposalsPrepared: number;
  proposalsExecuted: number;
  governedActionsPrepared: number;
  governedActionsExecuted: number;
  approvalCheckpoints: number;
  interventions: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  /** §10/§16: statements the grounding check rejected because no observation carried the figure */
  ungroundedRejected: number;
  budgetLimitsReached: string[];
}

export function agentTelemetry(run: AgentRunBody): AgentTelemetry {
  const inv = run.investigation;
  const tools = run.trace.toolCalls;
  const denials = run.trace.policyDecisions.filter((p) => p.decision === 'DENY');
  const prepared = run.result?.prepared ?? [];
  return {
    runId: run.runId,
    objective: run.goal.objective,
    goalType: run.goal.type,
    profile: run.goal.policyProfile,
    status: run.runStatus,
    stopReason: run.completionReason ?? inv?.stopReason ?? null,
    verificationPassed: run.verification?.passed ?? null,
    verificationChecks: (run.verification?.checks ?? []).map((c) => ({ check: c.check, ok: c.ok })),
    iterations: inv?.usage.iterations ?? run.graph.revisions.length,
    steps: run.usage.steps,
    planRevisions: run.graph.revisions.length,
    modelCalls: run.trace.modelCalls.length,
    toolCalls: tools.length,
    toolsUsed: uniq(tools.map((t) => t.tool)),
    emptyToolCalls: tools.filter((t) => t.status === 'COMPLETED' && !t.objectId).length,
    refusedToolCalls: tools.filter((t) => t.status === 'REFUSED').length,
    failedToolCalls: tools.filter((t) => t.status === 'FAILED').length,
    authorizationDenials: denials.length,
    /* a violation is a call that ran WITHOUT an allow — structurally impossible today, and measured so it stays so */
    authorizationViolations: tools.filter((t) => t.status === 'COMPLETED' && denials.some((d) => d.subject === t.tool)).length,
    factsDiscovered: uniq([...run.observations.flatMap((o) => o.factIds ?? []), ...(inv?.observations ?? []).flatMap((o) => o.facts.map((f) => f.id))]).length,
    findings: run.result?.findings.length ?? 0,
    objectsRead: uniq(run.observations.flatMap((o) => o.objectIds)).length,
    proposalsPrepared: prepared.length,
    proposalsExecuted: prepared.filter((p) => p.status === 'COMPLETED').length,
    governedActionsPrepared: prepared.filter((p) => p.riskLevel === 'GOVERNED_ACTION').length,
    /* §15: a governed action is never executed by the runtime. Measured, not asserted. */
    governedActionsExecuted: prepared.filter((p) => p.riskLevel === 'GOVERNED_ACTION' && p.status === 'COMPLETED').length,
    approvalCheckpoints: run.checkpoints.filter((c) => c.type === 'CONFIRMATION' || c.type === 'GOVERNED_APPROVAL').length,
    interventions: run.interventions.length,
    latencyMs: (run.completedAt ? Date.parse(run.completedAt) : Date.now()) - Date.parse(run.startedAt),
    inputTokens: run.usage.inputTokens,
    outputTokens: run.usage.outputTokens,
    cacheReadTokens: run.trace.modelCalls.reduce((n, c) => n + (c.cacheReadTokens ?? 0), 0),
    estimatedCostUsd: run.trace.modelCalls.reduce((n, c) => n + (c.costUsd ?? 0), 0),
    ungroundedRejected: inv?.synthesis?.rejected.length ?? 0,
    budgetLimitsReached: run.warnings.filter((w) => /budget|limit/i.test(w)),
  };
}
