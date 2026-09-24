/**
 * A1 — THE AGENT HOST PORT: what the universal agent runtime needs from Korvyn, and nothing more.
 *
 * Before this file `AgentRuntime` was constructed with a `SloaneOrchestrator` and typed against that class, so the
 * runtime could only run inside a conversation. §2 of the A1 brief is explicit that an AgentRun may eventually be
 * started from Sloane, a workflow, a scheduled job, a module action or an API — so the runtime must depend on a
 * CONTRACT, not on the surface that happens to host it today.
 *
 * Nothing moved. `SloaneOrchestrator` satisfies this interface structurally and is still the only implementation;
 * what changed is that the runtime can no longer reach anything the port does not name. A scheduler can host a run
 * by supplying these members, and the compiler now says exactly what it would have to supply.
 *
 * WHAT IS DELIBERATELY IN THE PORT:
 *   - the governed FINANCE SERVICES (`gl`, `data`, `controls`, `artifacts`, `actions`). §9 and §24 forbid
 *     agent-only financial calculations, so the runtime reads Korvyn's canonical services rather than its own. The
 *     port is SURFACE-neutral (no conversation, no browser, no renderer), not domain-neutral.
 *   - the MODEL GATEWAY as four capability-shaped calls (`agentPlan`, `agentThink`, `agentSynth`, `agentNarrate`),
 *     each taking a ROUTE, never a provider or a model id. §8: no agent integrates with a provider directly.
 *   - the CAPABILITY / AUTHORIZATION calls (`agentAllowlist`, `agentValidate`, `agentExecute`). Authorization is
 *     the host's, executed server-side at call time; the runtime never decides what an actor may do.
 *
 * WHAT IS DELIBERATELY NOT:
 *   the conversation, its renderer, its transcript, its history, its DOM. `agentSession` and `agentContext` are the
 *   only two members that touch one, they are both OPTIONAL, and a host that has no conversation returns an id of
 *   its own and ignores the context sync.
 */
import type { ActionEngine, DecideInput, DecideResult } from '../actions.js';
import type { AdapterOutcome } from '../adapter.js';
import type { AgentStepInput, AgentSynthInput } from '../adapter.js';
import type { ArtifactEngine } from '../artifacts/engine.js';
import type { Route } from '../config.js';
import type { ControlService } from '../controls.js';
import type { FinancialDataService } from '../financials.js';
import type { GovernedLedger } from '../governed.js';
import type { PlanStep, PlanValidation } from '../orchestrator.js';
import type { AgentStepOut, AgentSynthOut, ObjectiveClass } from '../schema.js';
import type { Actor, FinancialObject, SloaneTool, ToolArgs } from '../tools.js';

/**
 * One model call as the runtime records it. Provider-neutral by construction: a ROUTE and the model that answered
 * it, for the trace and the cost telemetry — never a provider SDK type, and never shown to a user.
 */
export interface ModelCallRecord {
  stage: string;
  route: string | null;
  model: string | null;
  status: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  /** optional: a planning call records no error field, an investigation THINK does */
  error?: string | null;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  /** the capability class that answered (D0–M4), where the caller routes by class */
  cls?: string;
}

/** what one validated step execution returns — the object, what it cost, and what it was refused for */
export interface HostExecution {
  status: 'COMPLETED' | 'FAILED' | 'REFUSED';
  object: FinancialObject | null;
  extra: FinancialObject | null;
  warnings: string[];
  error: string | null;
  proposalIds: string[];
  latencyMs: number;
  traceId: string;
}

/** the financial context a run steers; the host syncs it so a conversation sharing the session stays in step */
export interface HostRunContext {
  period: string;
  periodRange: { start: string; end: string } | null;
  entity: string | null;
  vendor: string | null;
  project: string | null;
  account: string | null;
  threshold: number | null;
}

/**
 * THE PORT. Every member is one the runtime actually calls; adding one is a deliberate widening of what an agent
 * may reach, and is the place to argue about it.
 */
export interface AgentHost {
  /* ---- governed services: Korvyn's canonical finance truth (§9, §24) ---------------------------------------- */
  readonly gl: GovernedLedger;
  readonly data: FinancialDataService;
  readonly controls: ControlService;
  readonly artifacts: ArtifactEngine;
  readonly actions: ActionEngine;

  /* ---- action governance: the ONLY path by which a prepared action is executed, after a person decides -------- */
  decide(input: DecideInput, actor?: Actor): DecideResult;

  /* ---- session / context: optional for a host with no conversation ------------------------------------------- */
  /** @returns the investigation id the run's work is recorded under; a headless host may return any stable id */
  agentSession(sessionId: string, actor: Actor, seed?: { period?: string; periodRange?: { start: string; end: string } | null; scope?: string; objective?: string }, investigationId?: string): string;
  /** tell the host the run's financial context moved (steering); a headless host may do nothing */
  agentContext(sessionId: string, actor: Actor, c: HostRunContext): void;

  /* ---- capability discovery and authorization (§6, §7) ------------------------------------------------------- */
  /** the capabilities THIS actor may use in these domains — filtered before the model ever sees them */
  agentAllowlist(actor: Actor, domains: readonly string[], allowPropose: boolean): SloaneTool[];
  /** structural + permission validation of one proposed step against the allowlist; nothing runs until it passes */
  agentValidate(sessionId: string, actor: Actor, step: { tool: string; purpose: string; args: ToolArgs }, allow: SloaneTool[]): PlanValidation;
  /** execute one validated step. The host re-authorizes at execution time — the allowlist is not a permit. */
  agentExecute(sessionId: string, actor: Actor, step: { tool: string; purpose: string; args: ToolArgs; request: string }, planId: string, objectId: string): HostExecution;

  /* ---- the model gateway, by capability, never by provider (§8) ---------------------------------------------- */
  /**
   * A2 §3 — can this host reason at all? A run with no reasoning available must still do useful governed work, so
   * the runtime plans DETERMINISTICALLY instead of opening a loop that cannot take its first step. Asked once, at
   * planning time; it is a capability question, never a provider one.
   */
  reasoningAvailable?(): boolean;
  /**
   * A2 §3/§4 — classify what KIND of work an objective asks for. ONE call per run, on the cheapest route. Optional:
   * a host with no model falls back to Korvyn's deterministic classification, which never widens authority either.
   */
  classifyObjective?(objective: string, signal?: AbortSignal): Promise<{ out: AdapterOutcome<ObjectiveClass> | null; call: ModelCallRecord | null }>;
  agentPlan(sessionId: string, actor: Actor, goalText: string, allow: SloaneTool[], signal?: AbortSignal): Promise<{ steps: PlanStep[]; source: 'reasoning' | 'deterministic'; calls: ModelCallRecord[] }>;
  agentThink(i: AgentStepInput, route: Route, signal?: AbortSignal): Promise<{ out: AdapterOutcome<AgentStepOut> | null; call: ModelCallRecord | null }>;
  agentSynth(i: AgentSynthInput, route: Route, signal?: AbortSignal): Promise<{ out: AdapterOutcome<AgentSynthOut> | null; call: ModelCallRecord | null }>;
  agentNarrate(request: string, objects: FinancialObject[], signal?: AbortSignal): Promise<{ sentences: string[]; source: 'reasoning' | 'deterministic'; rejected: number; call: ModelCallRecord | null }>;
}
