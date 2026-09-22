/**
 * THE AGENT RUNTIME MODEL (Phase 7) — the durable objects a governed financial agent run is made of.
 *
 *   AgentGoal         what the user asked Sloane to ACHIEVE, structured: objective, scope, period, success criteria,
 *                     constraints, requested outputs, the user's own instructions, the policy profile Korvyn chose.
 *   AgentTaskGraph    the plan as NODES WITH DEPENDENCIES, versioned. A revision never overwrites a task: a task a
 *                     replan invalidates is SKIPPED with the reason, and its replacement is a new node.
 *   AgentObservation  what one task produced: object ids, proposals, warnings, errors, findings, policy events.
 *   AgentCheckpoint   a place the run stops for a person: clarification, confirmation, governed approval, a decision,
 *                     an external dependency.
 *   AgentRun          the whole thing: status, the goal, the graph, observations, checkpoints, interventions, the
 *                     trace, verification and the result.
 *
 * THE LLM REASONS; KORVYN OWNS financial truth, tools, permissions, policies, workflow authority, evidence, state,
 * approvals, the audit trail and the stop conditions. Nothing here is provider-specific.
 */
import type { ToolArgs } from '../tools.js';

export type AgentRunStatus = 'CREATED' | 'PLANNING' | 'READY' | 'RUNNING' | 'WAITING_FOR_USER' | 'WAITING_FOR_CONFIRMATION' | 'WAITING_FOR_GOVERNED_APPROVAL'
  | 'PAUSED' | 'BLOCKED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export const TERMINAL: AgentRunStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];
export const WAITING: AgentRunStatus[] = ['WAITING_FOR_USER', 'WAITING_FOR_CONFIRMATION', 'WAITING_FOR_GOVERNED_APPROVAL', 'PAUSED'];

export type TaskStatus = 'PENDING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'WAITING' | 'BLOCKED';
export type TaskType = 'RETRIEVE' | 'ANALYZE' | 'COMPARE' | 'TRACE' | 'VALIDATE' | 'BUILD_ARTIFACT' | 'PREPARE_ACTION' | 'EXECUTE_ACTION'
  | 'REQUEST_CLARIFICATION' | 'REQUEST_CONFIRMATION' | 'WAIT_FOR_APPROVAL' | 'VERIFY' | 'SUMMARIZE';
export type GoalType = 'REVIEW_CLOSE' | 'PREPARE_CONTROLLER_REVIEW' | 'PREPARE_AUDIT_SUPPORT' | 'INVESTIGATE_VENDOR' | 'BUILD_FINANCIAL_ARTIFACT' | 'GENERIC'
  /** 8D: an open objective — no template: the graph grows one THINK step at a time (agent/investigate.ts) */
  | 'INVESTIGATE';

/* ================================================================================================
   AUTONOMY — what the runtime may do without a person, by level. The POLICY PROFILE sets the ceiling; the model never
   chooses it. LEVEL 3 exists as architecture only: no profile lists an autonomous action type yet.
   ================================================================================================ */
export const AUTONOMY = {
  0: { name: 'ASSIST', allows: 'answer and analyse only' },
  1: { name: 'AUTONOMOUS_READ', allows: 'retrieve, analyse, compare, trace, validate' },
  2: { name: 'AUTONOMOUS_PREPARE', allows: 'create drafts, artifacts, comment / issue / support proposals — nothing written until confirmed' },
  3: { name: 'LOW_RISK_EXECUTE', allows: 'execute explicitly policy-approved reversible actions (none enabled)' },
  4: { name: 'GOVERNED', allows: 'confirmation, workflow, a different approver' },
} as const;
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

export type ProfileId = 'READ_ONLY' | 'FINANCE_ANALYST' | 'CLOSE_PREPARER' | 'CONTROLLER_REVIEW' | 'AUDIT_SUPPORT' | 'INVESTIGATION';

/**
 * A2 §3/§5 — WHAT KIND OF WORK AN OBJECTIVE ASKS FOR. This is the ONLY axis on which Korvyn specialises a run, and
 * it is a property of the OBJECTIVE, not of any phrase in it: a model classifies it (agent/objective.ts) and Korvyn
 * maps it to a profile the actor is allowed to use. Three values, because three is what changes the authority a run
 * needs — anything finer is a profile's own configuration.
 */
export const OUTCOMES = ['ANALYZE', 'PREPARE_DELIVERABLE', 'PREPARE_WORKFLOW_ACTIONS'] as const;
export type OutcomeClass = (typeof OUTCOMES)[number];

/**
 * A2 §5 — THE PROFILE IS THE ONLY SPECIALISATION MECHANISM. A future CLOSE, RECONCILIATION, FLUX, AUDIT, REPORTING
 * or PLANNING agent is a value in this table, not a runtime, not a workflow template and not a branch in the loop.
 * Everything a specialist needs to differ on is a field here:
 *
 *   purpose / completion   what the run is for and when it is done — given to the planner as its brief
 *   domains                which capability families are exposed (§6 discovery filters on this, then on permission)
 *   autonomy               the ceiling on what may happen without a person
 *   reasoningClass         where the loop STARTS on the capability ladder; escalation is per step and recorded
 *   budget                 the governance boundary (§14) — the model can never raise it
 *   execution              A2 §6: GENERIC, or a named LEGACY template. Default GENERIC; see `LEGACY_TEMPLATES`.
 */
export interface AgentPolicyProfile {
  id: ProfileId; label: string;
  /** one sentence: what this profile is for. Given to the planner so the brief comes from configuration, not code. */
  purpose: string;
  /** the highest level the runtime may act at without a person */
  autonomy: AutonomyLevel;
  /** tool domains the profile's tasks may use (READ tools); PROPOSE tools additionally need autonomy >= 2 */
  domains: string[];
  /** LEVEL 3: action types the runtime may execute itself. Empty in every profile — the architecture, not the permission */
  autonomousActionTypes: string[];
  /** action types that may be PREPARED (proposals / drafts); anything else is refused at plan validation */
  preparableActions: string[];
  /**
   * A3 §13 — the capability families this profile may ACT in, separate from the ones it may READ. A profile that
   * reads across the enterprise and prepares in one family is expressible; before A3 the two were one list.
   * Empty (the default) means the profile prepares nothing, whatever its domains allow it to read.
   */
  actionDomains: string[];
  /** A2 §12: the capability class the loop starts at. Escalation above it is per step, for a recorded reason. */
  reasoningClass: 'M1' | 'M2' | 'M3';
  /** what "done" means for this profile — stated to the planner, and checked by VERIFY */
  completion: string[];
  /**
   * A2 §14: the governance boundary for this profile, as OVERRIDES over the deployment's own defaults. It is
   * layered at USE time (`profileBudget`), never frozen at import: the ceilings a deployment sets in its
   * environment stay a deployment's to set, and a profile only says where its own work differs.
   */
  budget: Partial<import('./investigate.js').AgentBudget>;
  /** A2 §13: how many independent governed READS this profile may run in one tick */
  maxParallelReads: number;
  /**
   * A2 §6 — GENERIC is the runtime. A legacy goal type here means this profile still runs the pre-A2 hard-coded
   * task graph, and is a COMPATIBILITY SHIM with a stated reason, not architecture.
   */
  execution: 'GENERIC' | GoalType;
  /** the outcome classes this profile may serve; Korvyn maps a classified objective onto the first that fits */
  serves: OutcomeClass[];
  maxSteps: number; maxRuntimeMs: number; maxRetries: number; maxConsecutiveFailures: number;
  /** 'GROUP' may run across the enterprise; 'ENTITY' only inside the actor's own entity scope */
  maxScope: 'GROUP' | 'ENTITY';
  /** a change smaller than this (USD) is never the subject of a prepared action */
  materialityUsd: number;
  /** evidence a prepared action of a type must be backed by before it may be proposed */
  requireEvidence: Record<string, string[]>;
}
const READS = ['financials', 'tb', 'ledger', 'analysis', 'flux', 'recon', 'close', 'reporting', 'audit', 'evidence', 'trace', 'find'];
/** A2 §14: budgets are configuration. A profile states where its work differs; the model can never raise either. */
const budget = (o: Partial<import('./investigate.js').AgentBudget>) => o;
const base = { autonomousActionTypes: [] as string[], actionDomains: [] as string[], maxRetries: 1, maxConsecutiveFailures: 3, materialityUsd: 1_000_000, maxParallelReads: 3,
  execution: 'GENERIC' as const, reasoningClass: 'M2' as const,
  requireEvidence: { RECONCILIATION_APPROVAL: ['glBalance', 'difference', 'tieStatus', 'supportStatus', 'reviewStatus', 'sourceFreshness'] } };

/**
 * A2 §5 — THE PROFILES. Everything that used to be a template's shape is a value here. Adding a specialist (CLOSE,
 * RECONCILIATION, FLUX, POLICY, PLANNING) is adding a row; it is not a runtime, a branch or a workflow graph.
 *
 * THE FIRST FOUR RUN THE GENERIC RUNTIME. The last two still name a legacy template and say why: the generic loop
 * reads, analyses and synthesises, and the action-preparation pipeline (build → validate → propose → confirm →
 * generate) is not expressible in its planner contract yet. That is A3's work, and it is a SHIM, not architecture.
 */
export const POLICY_PROFILES: Record<ProfileId, AgentPolicyProfile> = {
  INVESTIGATION: { ...base, id: 'INVESTIGATION', label: 'Financial investigation',
    purpose: 'Investigate an open financial question across whatever governed evidence bears on it, and state what is established, what is not, and what needs attention.',
    autonomy: 1, domains: [...READS, 'semantic'], preparableActions: [], serves: ['ANALYZE'],
    completion: ['the objective is answered from governed observations', 'each finding cites the observation it rests on', 'what could not be established is stated rather than inferred'],
    budget: budget({}), maxSteps: 40, maxRuntimeMs: 300_000, maxScope: 'GROUP' },
  READ_ONLY: { ...base, id: 'READ_ONLY', label: 'Read only',
    purpose: 'Establish where something stands from governed records, without preparing or changing anything.',
    autonomy: 1, domains: READS, preparableActions: [], serves: ['ANALYZE'], reasoningClass: 'M2',
    completion: ['the position is stated from governed reads', 'material exceptions are identified and ranked', 'nothing is prepared or written'],
    /* a status question is narrower work than an open investigation, and its budget says so */
    budget: budget({ maxIterations: 6, maxModelCalls: 9, maxToolCalls: 14, maxElapsedMs: 120_000, maxEstimatedCostUsd: 0.5 }),
    maxSteps: 16, maxRuntimeMs: 120_000, maxScope: 'GROUP' },
  FINANCE_ANALYST: { ...base, id: 'FINANCE_ANALYST', label: 'Finance analyst',
    purpose: 'Analyse a financial question and prepare the deliverable it calls for, for a person to confirm.',
    autonomy: 2, domains: [...READS, 'build', 'action'], actionDomains: ['action', 'build'], serves: ['PREPARE_DELIVERABLE'],
    preparableActions: ['ADD_FLUX_COMMENT', 'ADD_RECON_COMMENT', 'CREATE_ISSUE', 'SAVE_ANALYSIS', 'GENERATE_EXCEL_ARTIFACT', 'SAVE_EXCEL_ARTIFACT'],
    completion: ['the deliverable is composed from governed objects', 'its validation is stated', 'nothing is generated or written until confirmed'],
    budget: budget({ maxIterations: 10, maxToolCalls: 24, maxElapsedMs: 180_000 }),
    maxSteps: 20, maxRuntimeMs: 180_000, maxScope: 'GROUP' },
  CLOSE_PREPARER: { ...base, id: 'CLOSE_PREPARER', label: 'Close preparer',
    purpose: 'Work an entity through what its close still needs, within that entity only.',
    autonomy: 2, domains: [...READS, 'build', 'action'], actionDomains: ['action', 'build'], serves: ['PREPARE_WORKFLOW_ACTIONS'],
    preparableActions: ['ADD_FLUX_COMMENT', 'ADD_RECON_COMMENT', 'CREATE_ISSUE', 'ATTACH_SUPPORT', 'ASSIGN_REVIEWER'],
    completion: ['every outstanding item is identified', 'what a preparer must do is prepared for confirmation', 'nothing is written until confirmed'],
    budget: budget({ maxIterations: 12, maxToolCalls: 28, maxElapsedMs: 240_000 }),
    maxSteps: 24, maxRuntimeMs: 240_000, maxScope: 'ENTITY' },
  CONTROLLER_REVIEW: { ...base, id: 'CONTROLLER_REVIEW', label: 'Controller review preparation',
    purpose: 'Get a period ready for a controller to review: what is unresolved, what is material, and the drafts that would clear it.',
    autonomy: 2, domains: [...READS, 'build', 'action'], actionDomains: ['action', 'build'], serves: ['PREPARE_WORKFLOW_ACTIONS'], reasoningClass: 'M2',
    preparableActions: ['ADD_FLUX_COMMENT', 'ADD_RECON_COMMENT', 'CREATE_ISSUE', 'ASSIGN_REVIEWER', 'ATTACH_SUPPORT', 'RECONCILIATION_APPROVAL', 'GENERATE_EXCEL_ARTIFACT', 'SAVE_EXCEL_ARTIFACT'],
    completion: ['the position is established', 'drafts are prepared for every item that needs one', 'a governed approval is routed, never taken'],
    budget: budget({ maxIterations: 14, maxToolCalls: 30, maxElapsedMs: 240_000 }),
    maxSteps: 30, maxRuntimeMs: 240_000, maxScope: 'GROUP' },
  AUDIT_SUPPORT: { ...base, id: 'AUDIT_SUPPORT', label: 'Audit support',
    purpose: 'Assemble the governed support an auditor asked for, with its population, its tie-out and its gaps stated.',
    autonomy: 2, domains: [...READS, 'build', 'action'], actionDomains: ['action', 'build'], serves: ['PREPARE_DELIVERABLE'],
    preparableActions: ['GENERATE_EXCEL_ARTIFACT', 'SAVE_EXCEL_ARTIFACT', 'REFRESH_PBC_REQUEST'],
    completion: ['the population is resolved and pinned', 'the tie-out status is stated', 'gaps are disclosed rather than filled'],
    budget: budget({ maxIterations: 12, maxToolCalls: 26, maxElapsedMs: 240_000 }),
    maxSteps: 24, maxRuntimeMs: 240_000, maxScope: 'GROUP' },
};

/**
 * A3 §12 — THE EXECUTION TEMPLATES ARE RETIRED AS AN EXECUTION PATH. Every profile now runs `GENERIC`, so no
 * classified objective is routed into a hand-built task graph: the generic loop carries the whole pipeline the
 * three templates existed for — build → validate → prepare → stop for confirmation → execute through Action
 * Governance → observe the governed result (proved end to end in a3.test.ts §12, on the close review package).
 * A2 had already removed template SELECTION; what A3 removes is the template's authority over how a run runs.
 *
 * WHAT SURVIVES, AND THE ONE REASON IT DOES. `templateFor` still answers for these three goal types, and the only
 * thing that can ask it is the deprecated no-model shim (`AgentRuntime.deterministicProfile`): the generic loop
 * plans by THINKING, so with no reasoning model configured there is no generic planner at all and the template is
 * the only plan available. That is the exact remaining capability gap — a deterministic generic planner — and it
 * is the condition for deleting `templateFor`'s last three cases. Nothing a deployment with a model configured
 * can reach passes through them.
 */
export const LEGACY_TEMPLATES: Partial<Record<GoalType, string>> = {
  PREPARE_CONTROLLER_REVIEW: 'Reachable only by the deprecated no-model shim: with no reasoning model there is no generic planner.',
  PREPARE_AUDIT_SUPPORT: 'Same, and it is the only way a no-model deployment can pin an audit population before packaging it.',
  BUILD_FINANCIAL_ARTIFACT: 'Same; a named existing workbook is regenerated from its saved definition.',
};

/**
 * A2 §3 — WHICH PROFILE SERVES A CLASSIFIED OBJECTIVE. This replaces `PROFILE_FOR[goalType]`, and with it the regex
 * that chose a template from the request text. The OUTCOME comes from a model classification (agent/objective.ts);
 * the PROFILE, and therefore the authority, is Korvyn's alone and is intersected with what the actor may do.
 */
export const PROFILE_FOR_OUTCOME: Record<OutcomeClass, ProfileId> = {
  ANALYZE: 'INVESTIGATION', PREPARE_DELIVERABLE: 'FINANCE_ANALYST', PREPARE_WORKFLOW_ACTIONS: 'CONTROLLER_REVIEW',
};
/** kept for persisted runs and the deprecated forced-goal-type shim; never consulted for a new conversational run */
export const PROFILE_FOR: Record<GoalType, ProfileId> = {
  REVIEW_CLOSE: 'READ_ONLY', INVESTIGATE_VENDOR: 'READ_ONLY', PREPARE_CONTROLLER_REVIEW: 'CONTROLLER_REVIEW',
  PREPARE_AUDIT_SUPPORT: 'AUDIT_SUPPORT', BUILD_FINANCIAL_ARTIFACT: 'FINANCE_ANALYST', GENERIC: 'FINANCE_ANALYST', INVESTIGATE: 'INVESTIGATION',
};

/* ================================================================================================
   SUBJECT — A2 §7: an extensible reference, not a finance schema
   ================================================================================================ */
/**
 * What a run is ABOUT. Before A2 this was a fixed record of finance fields (vendor, project, entity, account,
 * pbcRequestId, reconciliationId, artifactId), so Korvyn could not point a run at a policy, a close task, a control,
 * a contract, an asset or a planning scenario without a schema change and a migration.
 *
 * `type` is Korvyn's own object vocabulary — the same words the semantic graph, the tools' `ParamKind`s and the
 * trace already use ('vendor', 'account', 'reconciliation', 'policy', 'closeTask' …). It is deliberately a string:
 * a runtime that enumerated every object type would need editing every time Korvyn learned a new one, which is the
 * coupling this replaces. Typed finance identity is not lost — it moves from the SHAPE to the `type` field, and the
 * legacy accessors below still answer in the old vocabulary.
 */
export interface ObjectRef { type: string; id: string; label?: string }
/** the finance fields the pre-A2 goal carried, and the ref type each maps to */
const SUBJECT_TYPES: Record<string, string> = { vendor: 'vendor', project: 'project', entity: 'entity', account: 'account', pbcRequestId: 'pbcRequest', reconciliationId: 'reconciliation', artifactId: 'artifact' };
const LEGACY_FIELD: Record<string, string> = Object.fromEntries(Object.entries(SUBJECT_TYPES).map(([k, v]) => [v, k]));
/**
 * A persisted run has `subject` and no `refs`; a run created after A2 has both. Reading refs through here is what
 * makes the change backward compatible without a migration: nothing rewrites a stored run.
 */
export function refsOf(goal: AgentGoal): ObjectRef[] {
  if (goal.refs?.length) return goal.refs;
  return Object.entries(goal.subject ?? {}).filter(([, v]) => v).map(([k, v]) => ({ type: SUBJECT_TYPES[k] ?? k, id: v as string, ...(goal.labels?.[v as string] ? { label: goal.labels[v as string]! } : {}) }));
}
/** the id of the first ref of a type, in the legacy field vocabulary ('vendor', 'account', 'pbcRequestId' …) */
export function refOf(goal: AgentGoal, field: string): string | null {
  const type = SUBJECT_TYPES[field] ?? field;
  return refsOf(goal).find((r) => r.type === type)?.id ?? null;
}
/** the legacy `subject` record, derived from refs — so a caller that has not moved on still reads the same shape */
export function subjectOf(goal: AgentGoal): AgentGoal['subject'] {
  const out = { vendor: null, project: null, entity: null, account: null, pbcRequestId: null, reconciliationId: null, artifactId: null } as AgentGoal['subject'];
  for (const r of refsOf(goal)) { const f = LEGACY_FIELD[r.type]; if (f && f in out) (out as Record<string, string | null>)[f] = r.id; }
  return out;
}

/* ================================================================================================
   GOAL
   ================================================================================================ */
export interface AgentGoal {
  type: GoalType;
  /** the user's own words, verbatim */
  objective: string;
  title: string;
  period: string; periodRange: { start: string; end: string } | null;
  scope: string;
  /** @deprecated A2 §7 — read through `refsOf` / `refOf` / `subjectOf`. Kept written so a pre-A2 reader still works. */
  subject: { vendor: string | null; project: string | null; entity: string | null; account: string | null; pbcRequestId: string | null; reconciliationId: string | null; artifactId: string | null };
  /** A2 §7 — what the run is about, extensibly. Absent on runs persisted before A2; `refsOf` derives them. */
  refs?: ObjectRef[];
  /** A2 §3 — the classified outcome this run's profile was chosen to serve, and how it was classified */
  outcome?: OutcomeClass;
  outcomeSource?: 'model' | 'deterministic' | 'caller';
  /** A2 §5: a profile the CALLER asked for. Honoured only as far as the actor's own authority allows. */
  requestedProfile?: ProfileId;
  /** display names for resolved values ("South Valley (SV-PH2)" for SV-PH2) */
  labels: Record<string, string>;
  successCriteria: string[];
  /** approveReady: the user asked for reconciliations that are ready to be approved — Korvyn PREPARES the governed
   *  approval after an evidence check and routes it to a different approver; it never approves */
  constraints: { noComments: boolean; exclude: string[]; focusFirst: string[]; noActions: boolean; approveReady: boolean; noPackage: boolean };
  requestedOutputs: string[];
  userInstructions: string[];
  policyProfile: ProfileId;
  riskTolerance: 'READ_ONLY' | 'PREPARE';
  /** a display threshold in USD millions ("ignore anything under $500K" → 0.5) */
  threshold: number | null;
  outputFormat: 'xlsx' | 'csv';
  /** fields still ambiguous — the run waits for the answer to each, one at a time */
  pending: import('./ambiguity.js').Ambiguity[];
  /** how each clarified field was resolved */
  resolved: { field: string; term: string; value: string; label: string; at: string; by: string }[];
  /** fields with no governed catalogue on this server, said instead of guessed */
  notices: string[];
  /** a label for the period when it is a quarter or another named window */
  periodText: string | null;
  /** 8D: the comparison the conversation was on, and the analysis on screen (summary only) — the investigation's frame */
  comparisonPeriod?: string | null;
  activeAnalysis?: unknown | null;
}

/* ================================================================================================
   TASK GRAPH
   ================================================================================================ */
export interface AgentTask {
  taskId: string; type: TaskType;
  /** the short progress line a person sees ("Reconciliations") — never a tool id */
  title: string;
  /** a milestone is shown in progress; an internal step is not */
  milestone: boolean;
  tool: string | null; args: ToolArgs;
  /** references to earlier tasks' outputs, resolved at execution: `$task:<taskId>.refs.<key>` */
  refs: Record<string, string>;
  /** the request words a building tool reads (a workbook or PBC request is interpreted from them) */
  request?: string;
  dependsOn: string[];
  /** SKIPPED dependencies do not block this task (VERIFY / SUMMARIZE run over whatever completed) */
  softDeps?: boolean;
  status: TaskStatus;
  riskLevel: 'READ' | 'PROPOSE' | 'GOVERNED' | 'INTERNAL';
  retryPolicy: { max: number; on: 'TRANSIENT' | 'NEVER' };
  attempts: number;
  resultObjectIds: string[]; evidenceIds: string[]; proposalIds: string[]; artifactIds: string[];
  executionTraceId: string | null;
  failureMode: string | null; error: string | null;
  /** does a change of scope (vendor / project / entity) invalidate this task's result? */
  scopeSensitive: boolean;
  /** after this task completes, the runtime expands the graph from its result */
  expand?: 'FLUX_COMMENTS' | 'RECON_COMMENTS' | 'RECON_APPROVALS' | 'VENDOR_ACCOUNTS' | 'SUPPORT_GAPS';
  /** a key tying a prepared action to what it is about (an account, a reconciliation) — used by "ignore X" */
  about?: string | null;
  /** a Korvyn-internal step (no tool): evaluate source dependencies, an evidence check, a generation wait, verification */
  check?: 'SOURCES' | 'VENDOR_SOURCES' | 'RECON_EVIDENCE' | 'GENERATION' | 'VERIFY' | 'SUMMARIZE' | 'CONFIRMATION' | 'GOVERNED'
    /** 8D: the model decides the next governed step(s) from a compact context / writes the grounded synthesis */
    | 'THINK' | 'SYNTHESIZE';
  /** the action plan a PREPARE task's proposal joins (a confirmation checkpoint decides one plan) */
  planKey?: 'ACTIONS' | 'GOVERNED';
  /** lower runs first among ready tasks ("focus on CIP first" lowers it) */
  priority: number;
  origin: 'TEMPLATE' | 'MODEL' | 'EXPANSION' | 'REPLAN' | 'INTERVENTION';
  planVersion: number;
  invalidatedBy: string | null;
  startedAt: string | null; completedAt: string | null; latencyMs: number | null;
}
export interface PlanRevision { version: number; at: string; source: 'TEMPLATE' | 'MODEL' | 'EXPANSION' | 'REPLAN' | 'INTERVENTION'; reason: string; added: string[]; invalidated: string[]; rejected: { task: string; why: string }[] }
export interface AgentTaskGraph { planId: string; version: number; tasks: AgentTask[]; revisions: PlanRevision[] }

/* ================================================================================================
   OBSERVATION, CHECKPOINT, INTERVENTION
   ================================================================================================ */
export interface AgentFinding { amountUsd?: number | null; kind: 'BLOCKER' | 'EXCEPTION' | 'MATERIAL_MOVEMENT' | 'MISSING_SUPPORT' | 'EXTERNAL_DEPENDENCY' | 'NOT_TIED' | 'UNEXPLAINED' | 'INFO';
  severity: 'HIGH' | 'MEDIUM' | 'LOW'; text: string; objectId: string | null; about: string | null }
export interface AgentObservation {
  id: string; taskId: string; at: string; status: 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'REFUSED';
  resultType: string | null; objectIds: string[]; artifactIds: string[]; proposalIds: string[];
  actionResults: { proposalId: string; status: string; message: string }[];
  warnings: string[]; errors: string[]; evidence: string[];
  /**
   * A1 §10 — the canonical FinancialFact ids this step's result promoted. Optional so a run persisted before A1
   * still loads. Without it a template run's observations carried a figure's key and value and no citable handle,
   * while the conversation reading the same figure had one.
   */
  factIds?: string[];
  contextUpdates: Record<string, string>; policyEvents: string[]; findings: AgentFinding[];
}
export type CheckpointType = 'CLARIFICATION' | 'CONFIRMATION' | 'GOVERNED_APPROVAL' | 'DECISION_REQUIRED' | 'EXTERNAL_DEPENDENCY';
export interface AgentCheckpoint {
  id: string; type: CheckpointType; status: 'OPEN' | 'RESOLVED';
  /** a blocking checkpoint stops the tasks that depend on it; a non-blocking one is recorded and the run continues */
  blocking: boolean;
  title: string; detail: string;
  proposalIds: string[];
  options: { id: string; label: string }[];
  taskId: string | null;
  /** the action plan a CONFIRMATION / GOVERNED_APPROVAL checkpoint decides */
  planId?: string;
  /** CLARIFICATION: the field being resolved, the words that were ambiguous, the governed candidates, the reason, and
   *  — once answered — the user's response and the canonical id it resolved to */
  field?: string; term?: string; reason?: string; candidates?: { id: string; label: string; detail: string }[];
  response?: string | null; resolvedValue?: string | null;
  /** set when the clarification belongs to a steering instruction ("Only DC1"): the answer completes that instruction */
  steerType?: SteeringType | null; steerText?: string | null;
  createdAt: string; resolvedAt: string | null; resolution: string | null; resolvedBy: string | null;
}
export type SteeringType = 'SCOPE_CHANGE' | 'PERIOD_CHANGE' | 'FILTER_CHANGE' | 'PRIORITY_CHANGE' | 'EXCLUSION' | 'OUTPUT_CHANGE' | 'ACTION_CONSTRAINT' | 'CANCEL' | 'PAUSE' | 'RESUME';
export interface AgentIntervention { id: string; at: string; by: string; text: string; kind: SteeringType | 'UNRECOGNISED'; effect: string }
/** the run's context as a person steers it — what a steering event changed */
export interface RunContext { period: string; periodRange: { start: string; end: string } | null; scope: string; vendor: string | null; project: string | null; entity: string | null; account: string | null; threshold: number | null;
  constraints: { noComments: boolean; noActions: boolean; noPackage: boolean; exclude: string[]; focusFirst: string[] }; outputFormat: string }
/** §11: every steering instruction, classified, with the context before and after and the plan revision it caused */
export interface UserSteeringEvent { id: string; runId: string; at: string; actor: { id: string; name: string }; instruction: string; type: SteeringType;
  contextBefore: RunContext; contextAfter: RunContext; tasksInvalidated: string[]; tasksAdded: string[]; planRevision: number | null; effect: string }

/* ================================================================================================
   THE RUN
   ================================================================================================ */
export interface AgentRunTrace {
  toolCalls: { taskId: string; tool: string; args: ToolArgs; status: string; latencyMs: number; objectId: string | null; error: string | null; traceId: string }[];
  modelCalls: { stage: string; route: string | null; model: string | null; status: string; latencyMs: number; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; costUsd?: number; cls?: string; error?: string | null }[];
  /**
   * A3 §19 — A REFUSAL HAS A KIND, and conflating two of them made a clean run look like a breach. An argument
   * the planner could not fill and a capability the actor may not use are both recorded here as DENY, and a
   * telemetry counting the second by tool name reported four authorization violations on a run that had none
   * (observed live). PERMISSION is the actor's authority; VALIDATION is the call's own arguments; POLICY is the
   * profile or governance gate.
   */
  policyDecisions: { at: string; subject: string; decision: 'ALLOW' | 'DENY' | 'CHECKPOINT'; reason: string; kind?: 'PERMISSION' | 'VALIDATION' | 'POLICY' }[];
}
export interface AgentResult {
  headline: string;
  counts: { label: string; value: number }[];
  findings: AgentFinding[];
  prepared: { proposalId: string; title: string; status: string; riskLevel: string }[];
  requireAction: string[];
  external: string[];
  artifacts: { id: string; name: string; status: string }[];
  narrative: string[];
  notes: string[];
  /** 8D: an investigation's result — what was inspected, findings by kind and support, what is unresolved, next steps */
  investigation?: { understanding: string | null; goalClass: string | null; inspected: string[];
    findings: { statement: string; kind: string; support: string; observationRefs: string[]; objectIds: string[] }[];
    unresolved: string[]; nextSteps: { label: string; request: string }[]; confidence: number | null;
    populations: string[]; objects: { ref: string; objectId: string | null; title: string }[]; stopReason: string | null } | null;
}
export interface AgentRunBody {
  runId: string;
  goal: AgentGoal;
  runStatus: AgentRunStatus;
  actor: { id: string; name: string; role: string; scope: 'ALL' | string[] };
  permissionsSnapshot: string[];
  sessionId: string; investigationId: string;
  graph: AgentTaskGraph;
  currentTaskId: string | null;
  observations: AgentObservation[];
  checkpoints: AgentCheckpoint[];
  interventions: AgentIntervention[];
  steering: UserSteeringEvent[];
  events: { at: string; type: string; label: string }[];
  limits: { maxSteps: number; maxRetries: number; maxRuntimeMs: number };
  /**
   * A1 §13 — BOUNDED EXECUTION FOR EVERY RUN. Before A1 only an open INVESTIGATE run carried the full budget; a
   * template run (controller review, audit support) was bounded on steps and wall clock and had NO ceiling on
   * model calls, tokens or estimated cost. Every run now carries one, checked before each step.
   *
   * An INVESTIGATE run keeps its own INNER budget in `investigation.budget` (tighter on iterations, checked before
   * each THINK call). This is the OUTER bound; the two never disagree because both run through `budgetExhausted`.
   */
  budget?: import('./investigate.js').AgentBudget;
  /**
   * A2 §8 — THE EXECUTION WATERFALL. Where a run's wall clock actually went, measured at the call sites rather than
   * inferred from a log afterwards, plus whether its replans changed anything (§10).
   */
  waterfall: { classifyMs: number; planMs: number; thinkMs: number; toolMs: number; synthesizeMs: number; narrateMs: number; verifyMs: number; waitMs: number; usefulReplans: number; noopReplans: number };
  usage: { steps: number; activeMs: number; consecutiveFailures: number; modelCalls: number; inputTokens: number; outputTokens: number;
    /** optional so a run persisted before A1 still loads; read through `runUsage()`, never directly */
    toolCalls?: number; cacheReadTokens?: number; estimatedCostUsd?: number };
  trace: AgentRunTrace;
  verification: { at: string; passed: boolean; checks: { check: string; ok: boolean; detail: string }[] } | null;
  result: AgentResult | null;
  resultObjectIds: string[]; artifactIds: string[];
  warnings: string[]; errors: string[];
  completionReason: string | null;
  startedAt: string; updatedAt: string; completedAt: string | null;
  planner: 'TEMPLATE' | 'MODEL';
  /** the action plan PREPARE tasks currently add proposals to (a CONFIRMATION checkpoint decides one plan, then a new one starts) */
  actionPlanId: string; governedPlanId: string; planSeq: number;
  /** the governed data version the run started on (a change mid-run is reported by VERIFY) */
  dataVersion: string;
  options: AgentRunOptions;
  /** 8D: the open investigation's state (budget, usage, observations, notes, escalations, the synthesis) */
  investigation?: import('./investigate.js').InvestigationState;
  /** the user-facing progress lines, in order — what the browser shows; never task ids or JSON */
  progress: { at: string; line: string; state: 'done' | 'active' | 'waiting' | 'blocked' | 'skipped' }[];
}
export interface AgentRunOptions {
  /** ms between steps — lets a person interrupt a run mid-flight; default 0 */
  pace?: number;
  /** DEV/TEST ONLY: make these tools fail (permanently) or fail once (transient) */
  failTools?: string[]; transientTools?: string[];
  /** DEV/TEST ONLY: treat these source connectors as unavailable in addition to SOURCE_HEALTH */
  unavailableSources?: string[];
}
