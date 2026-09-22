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
export interface AgentPolicyProfile {
  id: ProfileId; label: string;
  /** the highest level the runtime may act at without a person */
  autonomy: AutonomyLevel;
  /** tool domains the profile's tasks may use (READ tools); PROPOSE tools additionally need autonomy >= 2 */
  domains: string[];
  /** LEVEL 3: action types the runtime may execute itself. Empty in every profile — the architecture, not the permission */
  autonomousActionTypes: string[];
  /** action types that may be PREPARED (proposals / drafts); anything else is refused at plan validation */
  preparableActions: string[];
  maxSteps: number; maxRuntimeMs: number; maxRetries: number; maxConsecutiveFailures: number;
  /** 'GROUP' may run across the enterprise; 'ENTITY' only inside the actor's own entity scope */
  maxScope: 'GROUP' | 'ENTITY';
  /** a change smaller than this (USD) is never the subject of a prepared action */
  materialityUsd: number;
  /** evidence a prepared action of a type must be backed by before it may be proposed */
  requireEvidence: Record<string, string[]>;
}
const READS = ['financials', 'tb', 'ledger', 'analysis', 'flux', 'recon', 'close', 'reporting', 'audit', 'evidence', 'trace', 'find'];
const base = { autonomousActionTypes: [] as string[], maxRetries: 1, maxConsecutiveFailures: 3, materialityUsd: 1_000_000,
  requireEvidence: { RECONCILIATION_APPROVAL: ['glBalance', 'difference', 'tieStatus', 'supportStatus', 'reviewStatus', 'sourceFreshness'] } };
export const POLICY_PROFILES: Record<ProfileId, AgentPolicyProfile> = {
  READ_ONLY: { ...base, id: 'READ_ONLY', label: 'Read only', autonomy: 1, domains: READS, preparableActions: [], maxSteps: 16, maxRuntimeMs: 120_000, maxScope: 'GROUP' },
  FINANCE_ANALYST: { ...base, id: 'FINANCE_ANALYST', label: 'Finance analyst', autonomy: 2, domains: [...READS, 'build', 'action'], preparableActions: ['ADD_FLUX_COMMENT', 'ADD_RECON_COMMENT', 'CREATE_ISSUE', 'SAVE_ANALYSIS', 'GENERATE_EXCEL_ARTIFACT', 'SAVE_EXCEL_ARTIFACT'], maxSteps: 20, maxRuntimeMs: 180_000, maxScope: 'GROUP' },
  CLOSE_PREPARER: { ...base, id: 'CLOSE_PREPARER', label: 'Close preparer', autonomy: 2, domains: [...READS, 'build', 'action'], preparableActions: ['ADD_FLUX_COMMENT', 'ADD_RECON_COMMENT', 'CREATE_ISSUE', 'ATTACH_SUPPORT'], maxSteps: 24, maxRuntimeMs: 240_000, maxScope: 'ENTITY' },
  CONTROLLER_REVIEW: { ...base, id: 'CONTROLLER_REVIEW', label: 'Controller review preparation', autonomy: 2, domains: [...READS, 'build', 'action'],
    preparableActions: ['ADD_FLUX_COMMENT', 'ADD_RECON_COMMENT', 'CREATE_ISSUE', 'RECONCILIATION_APPROVAL', 'GENERATE_EXCEL_ARTIFACT', 'SAVE_EXCEL_ARTIFACT'], maxSteps: 30, maxRuntimeMs: 240_000, maxScope: 'GROUP' },
  /* 8D: read, analyse, synthesize (levels 0–1); the findings and next steps are the workproduct — nothing is prepared or written */
  INVESTIGATION: { ...base, id: 'INVESTIGATION', label: 'Financial investigation', autonomy: 1, domains: [...READS, 'semantic'], preparableActions: [], maxSteps: 40, maxRuntimeMs: 300_000, maxScope: 'GROUP' },
  AUDIT_SUPPORT: { ...base, id: 'AUDIT_SUPPORT', label: 'Audit support', autonomy: 2, domains: [...READS, 'build', 'action'], preparableActions: ['GENERATE_EXCEL_ARTIFACT', 'SAVE_EXCEL_ARTIFACT', 'REFRESH_PBC_REQUEST'], maxSteps: 24, maxRuntimeMs: 240_000, maxScope: 'GROUP' },
};
/** the profile is chosen by KORVYN from the goal type — never by the model, never by the request text */
export const PROFILE_FOR: Record<GoalType, ProfileId> = {
  REVIEW_CLOSE: 'READ_ONLY', INVESTIGATE_VENDOR: 'READ_ONLY', PREPARE_CONTROLLER_REVIEW: 'CONTROLLER_REVIEW',
  PREPARE_AUDIT_SUPPORT: 'AUDIT_SUPPORT', BUILD_FINANCIAL_ARTIFACT: 'FINANCE_ANALYST', GENERIC: 'FINANCE_ANALYST', INVESTIGATE: 'INVESTIGATION',
};

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
  subject: { vendor: string | null; project: string | null; entity: string | null; account: string | null; pbcRequestId: string | null; reconciliationId: string | null; artifactId: string | null };
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
  policyDecisions: { at: string; subject: string; decision: 'ALLOW' | 'DENY' | 'CHECKPOINT'; reason: string }[];
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
