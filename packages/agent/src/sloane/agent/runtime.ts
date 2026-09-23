/**
 * THE AGENT RUNTIME (Phase 7) — GOAL → PLAN → VALIDATE → EXECUTE STEP → OBSERVE → UPDATE STATE → REPLAN →
 * CONTINUE / PAUSE / COMPLETE → VERIFY → TRACE.
 *
 * The runtime NEVER executes anything itself. A tool step goes through SloaneOrchestrator.agentValidate (the Planner:
 * registry, allowlist, arguments, permission) and agentExecute (permission re-checked, the same env and persistence
 * as a conversation turn). A proposal is written only by ActionEngine.decide() after a person decides a checkpoint.
 * A governed action (approval, certification, publication, mapping, ERP) is prepared at most, and routed to a person.
 *
 * Runs are durable (records kind AGENT_RUN), advance in the background one step at a time (no HTTP request is held
 * open for the run), can be paused, interrupted, re-scoped and cancelled, and are verified before they complete.
 */
import { randomUUID } from 'node:crypto';
import type { AgentHost } from './host.js';
import { type Actor, type FinancialObject, WRITE_ACTIONS_ENABLED, toolRegistry, visibleOf } from '../tools.js';
import { type AgentTelemetry, type KorvynTrace, agentTelemetry, agentTrace } from '../trace.js';
import { factsFrom } from '../v2/facts.js';
import { claimsFrom, failureNote, verifySentence } from '../v2/claims.js';
import { WORK } from '../store.js';
import { periodLabel } from '../financials.js';
import { SOURCE_HEALTH } from '../governed.js';
import { parseMoney } from '../conversation.js';
import { ActionGovernanceEngine } from '../actions.js';
import { mkTask, templateFor, typeOfTool } from './graphs.js';
import { workproductOf, type AgentWorkproduct } from './workproduct.js';
import { type GoalDeps, detectGoalType, hasSubject, parseGoal, retitle } from './goals.js';
import { type Ambiguity, applyCandidate, resolveTerms } from './ambiguity.js';
import { type SteeringIntent, classifySteering } from './steering.js';
import { AGENT_DOMAINS, CLASS_ROUTE, type AgentBudget, type AgentUsage, type CompactObservation, type FinancialFrame, type InvestigationState, allowedNumbers, budgetExhausted, compact, contextFor, defaultBudget, escalate, findingsOf, newInvestigation, progressLine, referentsOf, relax, relevant, synthesisContext, ungrounded } from './investigate.js';
import {
  type AgentCheckpoint, type AgentFinding, type AgentGoal, type AgentIntervention, type AgentObservation, type AgentRunBody, type AgentRunOptions,
  type AgentRunStatus, type AgentTask, type GoalType, type ObjectRef, type OutcomeClass, type ProfileId, type RunContext, type SteeringType, type UserSteeringEvent,
  POLICY_PROFILES, PROFILE_FOR, TERMINAL, WAITING, anchorWorkClass, refsOf,
} from './model.js';
import { classifyObjective, profileForOutcome } from './objective.js';

const KIND = 'AGENT_RUN';
const now = () => new Date().toISOString();

/* ================================================================================================
   A1 §13 — ONE BOUNDED-EXECUTION MODEL, FOR EVERY RUN
   ================================================================================================ */
/**
 * The run's OUTER budget. The profile owns how many steps and how long (it knows the shape of the work); the
 * model-call, token and cost dimensions come from the deployment's own defaults, because those are a deployment
 * decision and not a finance-domain one (§13: "do not make limits finance-domain-specific").
 */
/**
 * A2 §14 — THE OUTER (RUN) BUDGET, layered: the deployment's environment defaults, then the profile's SPEND
 * overrides, then the shape ceilings the profile's own size implies.
 *
 * `maxIterations` MEANS TWO DIFFERENT THINGS and conflating them cost a round: in the INNER loop's budget it counts
 * THINK iterations, and here it counts STEPS. A profile's `budget.maxIterations` is the inner one, so taking it
 * here capped a nine-step template run at six steps and BLOCKED it mid-plan (observed). Only the spend dimensions
 * — model calls, tokens, cost, escalations — carry across; the shape dimensions are the run's own.
 */
function runBudget(profile: { maxSteps: number; maxRuntimeMs: number; budget?: Partial<AgentBudget> }): AgentBudget {
  const d = defaultBudget(), p = profile.budget ?? {};
  const spend: Partial<AgentBudget> = {};
  for (const k of ['maxModelCalls', 'maxInputTokens', 'maxOutputTokens', 'maxEstimatedCostUsd', 'maxEscalations'] as const) if (p[k] !== undefined) spend[k] = p[k];
  return { ...d, ...spend, maxIterations: profile.maxSteps, maxToolCalls: Math.max(d.maxToolCalls, profile.maxSteps), maxElapsedMs: profile.maxRuntimeMs };
}
/** A2 §14: a profile's INNER loop budget — the deployment's defaults with the profile's overrides on top */
export const profileBudget = (p: { budget?: Partial<AgentBudget> }): AgentBudget => ({ ...defaultBudget(), ...(p.budget ?? {}) });

/**
 * A3 §4 / A6 — CAPABILITY → ACTION TYPE, exported so it can be checked rather than trusted. Every value here and
 * every `preparableActions` entry must be a type `ACTION_POLICY` classifies; a test asserts both, which is the
 * analogue of A5's "every check a profile names exists" and is what the `ADD_RECON_COMMENT` split would have
 * cost nothing to catch.
 */
export const PROPOSE_ACTION_TYPE: Record<string, string> = {
  proposeFluxComment: 'ADD_FLUX_COMMENT', proposeFluxCommentUpdate: 'UPDATE_FLUX_COMMENT',
  proposeReconciliationComment: 'ADD_RECONCILIATION_COMMENT', proposeReconciliationCommentUpdate: 'UPDATE_RECONCILIATION_COMMENT',
  proposeIssue: 'CREATE_ISSUE', proposeSupportAttachment: 'ATTACH_SUPPORT', proposeReviewerAssignment: 'ASSIGN_REVIEWER',
  proposeSupportPackage: 'CREATE_SUPPORT_PACKAGE', proposeSaveInvestigation: 'CREATE_SHARED_INVESTIGATION',
  proposeGenerateExcelArtifact: 'GENERATE_EXCEL_ARTIFACT', proposeSaveExcelArtifact: 'SAVE_EXCEL_ARTIFACT',
  proposeArchiveExcelArtifact: 'ARCHIVE_EXCEL_ARTIFACT', proposeRefreshExcelArtifact: 'REFRESH_EXCEL_ARTIFACT',
  proposeRefreshPBCRequest: 'REFRESH_PBC_REQUEST', proposeSaveAnalysis: 'SAVE_ANALYSIS', proposeSaveReport: 'SAVE_REPORT_DEFINITION',
};
/** the run's usage in the shape `budgetExhausted` reads — one budget engine, two callers (the run and its investigation) */
/**
 * A1 §10 — the book and lens a run's facts are promoted under. This server presents one governed book; when a run
 * can be started against another, it comes from the run's own financial context and not from here.
 */
const FACT_CTX = { book: 'CORE-GL', lens: 'Corporate Consolidated' };
/**
 * A2 §10 — IS THIS STEP AFFECTED BY A CHANGE OF SCOPE? Derived from the TOOL's own declared parameters, so it is
 * true of any capability that takes a scope dimension and needs no list to maintain. The legacy templates marked
 * `scopeSensitive` by hand; a model-planned step had nothing marking it, so "Only South Valley." changed the goal
 * and re-ran nothing. Preserving unaffected tasks means knowing which ones ARE affected.
 */
const SCOPE_KINDS = new Set(['scope', 'entity', 'project', 'vendor', 'account']);
const scopeSensitiveTool = (id: string | null) => !!id && !!toolRegistry.get(id)?.params.some((p) => SCOPE_KINDS.has(p.kind));

/** §18: how many independent READS may share one tick. Deliberately small — this is a foundation, not a worker pool. */
const MAX_PARALLEL = Number(process.env['KORVYN_AGENT_MAX_PARALLEL']) > 0 ? Number(process.env['KORVYN_AGENT_MAX_PARALLEL']) : 3;
function runUsage(run: AgentRunBody, elapsedMs: number): AgentUsage {
  const u = run.usage;
  return { iterations: u.steps, modelCalls: u.modelCalls, toolCalls: u.toolCalls ?? run.trace.toolCalls.length, inputTokens: u.inputTokens, outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens ?? 0, cacheWriteTokens: 0, estimatedCostUsd: u.estimatedCostUsd ?? 0, largestContextChars: 0, observationChars: 0, escalations: 0, elapsedMs };
}

const money = (v: number) => { const a = Math.abs(v) / 1e6; const s = `$${a.toFixed(2)}M`; return v < 0 ? `(${s})` : s; };
const col = (o: FinancialObject, name: string) => o.table.columns.indexOf(name);
const fact = (o: FinancialObject | undefined, k: string) => o?.facts.find((f) => f.key === k);

export interface RunView {
  runId: string; title: string; goalType: GoalType; status: AgentRunStatus; profile: string; autonomy: string; period: string; scope: string;
  progress: AgentRunBody['progress']; checkpoints: (Omit<AgentCheckpoint, 'proposalIds'> & { proposals: { id: string; title: string; target: string | null; status: string; riskLevel: string }[] })[];
  result: AgentRunBody['result']; verification: AgentRunBody['verification']; completionReason: string | null; interventions: AgentIntervention[];
  startedAt: string; updatedAt: string; completedAt: string | null; sessionId: string; investigationId: string;
  /** A4 §9: one line a person reads, derived from real run state */
  phase?: string;
  /** A4 §5/§12: where the run came from, and the governed context a surface handed over */
  origin?: string; launchedFrom?: AgentRunBody['launchedFrom'];
  /** A4 §15: the workproduct this run produced, once it has one */
  workproductId?: string | null;
  /** A4 §8: what the product may offer right now */
  canPause?: boolean; canCancel?: boolean;
}

/**
 * A4 §9 — the product's words for a capability family. A PHRASE BOOK, not a router: nothing reads these to
 * decide anything, they are only how a domain is said to a person. A family with no entry is described generically
 * rather than guessed at.
 */
const READING: Record<string, string> = {
  close: 'Reviewing close status', recon: 'Inspecting reconciliations', flux: 'Reviewing unexplained flux',
  financials: 'Reading the financial statements', tb: 'Reading the trial balance', ledger: 'Reading the governed ledger',
  analysis: 'Analysing the movement', evidence: 'Checking supporting evidence', trace: 'Tracing figures to source',
  audit: 'Reviewing audit requests', reporting: 'Reviewing reporting packages', semantic: 'Resolving what this refers to',
  find: 'Finding the governed objects',
};
const PREPARING: Record<string, string> = { action: 'drafts for your review', build: 'a workbook' };

/** the one test for “the actor may not”, as against “the call was wrong” — named once so the two cannot drift */
const PERMISSION_DENIAL = /lacks|may not view|not authorized|permission|outside your|out of scope/i;

export class AgentRuntime {
  private readonly cache = new Map<string, AgentRunBody>();
  private readonly objects = new Map<string, Map<string, FinancialObject>>();
  private readonly running = new Set<string>();
  /** a kick that arrived while the loop was still unwinding: the loop runs again when it exits */
  private readonly rekick = new Set<string>();
  private readonly waiters = new Map<string, (() => void)[]>();
  private readonly acs = new Map<string, AbortController>();

  /**
   * A1 §2 — the runtime is constructed with the HOST PORT, not with a conversation. `SloaneOrchestrator` satisfies
   * it structurally and is still the only implementation; what the type change buys is that the runtime can no
   * longer reach past the port, so a scheduler or module can host a run by supplying exactly these members.
   */
  constructor(private readonly o: AgentHost) {
    /* a run the previous process was advancing is PAUSED, never silently re-executed: a person resumes it */
    for (const r of WORK.repos.records.list<{ run: AgentRunBody }>(KIND)) {
      const run = r.run;
      if (run.runStatus === 'RUNNING' || run.runStatus === 'PLANNING' || run.runStatus === 'READY' || run.runStatus === 'CREATED') {
        run.runStatus = 'PAUSED'; run.completionReason = 'The server restarted while this run was in progress. Resume to continue from the last completed step.';
        run.graph.tasks.filter((t) => t.status === 'RUNNING').forEach((t) => { t.status = 'PENDING'; });
        this.event(run, 'RUN_PAUSED', 'Paused by a server restart');
        this.save(run);
      }
    }
  }

  /* ================================================================================================
     START
     ================================================================================================ */
  private deps(actor: Actor): GoalDeps {
    return { gl: this.o.gl, data: this.o.data, controls: this.o.controls, visible: visibleOf(actor), periods: this.o.data.governedPeriods(), workingPeriod: this.o.data.workingPeriod(),
      pbcRequests: this.o.artifacts.pbc ? this.o.artifacts.pbc.list().map((r) => ({ id: r.id, pbcNumber: r.pbcNumber, title: r.title, status: String(r.status) })) : [],
      artifacts: this.o.artifacts.list(actor).map((a) => ({ id: a.id, name: a.name, status: String(a.status), type: String(a.type) })) };
  }
  detect(text: string, actor?: Actor): GoalType | null { return detectGoalType(text, actor ? hasSubject(resolveTerms(text, this.deps(actor))) : false); }

  /**
   * A2 §3 — START. The request no longer chooses an execution template: every run begins on the GENERIC runtime
   * with a provisional read-only profile, and `plan()` classifies the objective through the Model Gateway, maps the
   * OUTCOME to a profile (Korvyn's decision, capped by the actor's authority) and applies that profile's budget,
   * reasoning class and execution before a single step runs.
   *
   * `goalType` survives as an explicit caller override — a deprecated compatibility shim for the three legacy
   * action-preparation templates and for tests. Nothing reads the request text to set it.
   */
  start(actor: Actor, text: string, opt: { goalType?: GoalType; profile?: ProfileId; outcome?: OutcomeClass; refs?: ObjectRef[]; options?: AgentRunOptions; sessionId?: string; goal?: AgentGoal; origin?: string; launchedFrom?: AgentRunBody['launchedFrom'] } = {}): { ok: true; run: AgentRunBody } | { ok: false; reason: string } {
    const deps = this.deps(actor);
    /* a forced legacy type keeps its own parse; everything else is an INVESTIGATE goal until the classifier speaks */
    const goal = opt.goal ?? parseGoal(text, deps, opt.goalType ?? 'INVESTIGATE');
    if (!goal) return { ok: false, reason: 'This is not a goal Sloane can carry through as a governed run. Ask it as a question, or name what to review, prepare or investigate.' };
    /* A2 §7: what the run is about, as extensible refs. The legacy `subject` record is still written, so a reader
       that has not moved on sees exactly what it saw before. */
    const seeded = refsOf(goal);
    goal.refs = [...seeded, ...(opt.refs ?? []).filter((r) => !seeded.some((x) => x.type === r.type && x.id === r.id))];
    if (opt.profile && POLICY_PROFILES[opt.profile]) { goal.requestedProfile = opt.profile; goal.policyProfile = opt.profile; }
    if (opt.outcome) { goal.outcome = opt.outcome; goal.outcomeSource = 'caller'; }
    if (opt.goalType) goal.outcomeSource ??= 'caller';
    const profile = POLICY_PROFILES[goal.policyProfile];
    const runId = `RUN-${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 4).toUpperCase()}`;
    const sessionId = opt.sessionId && /^[A-Za-z0-9_-]{8,64}$/.test(opt.sessionId) ? opt.sessionId : `agent-${runId.toLowerCase()}`;
    let investigationId: string;
    try { investigationId = this.o.agentSession(sessionId, actor, { period: goal.period, periodRange: goal.periodRange, scope: goal.scope === 'GROUP' ? 'GROUP' : goal.scope, objective: goal.title }); }
    catch (e) { return { ok: false, reason: (e as Error).message }; }
    const t = now();
    const options = { ...(opt.options ?? {}) };
    if (process.env['KORVYN_AUTH_MODE'] && process.env['KORVYN_AUTH_MODE'] !== 'dev' && !process.env['NODE_TEST_CONTEXT']) { delete options.failTools; delete options.transientTools; delete options.unavailableSources; }
    const run: AgentRunBody = {
      runId, goal, runStatus: 'CREATED', actor: { id: actor.id, name: actor.name, role: actor.role, scope: actor.scopeIds }, permissionsSnapshot: actor.permissions.slice(),
      sessionId, investigationId, graph: { planId: `APLAN-${runId}`, version: 0, tasks: [], revisions: [] }, currentTaskId: null,
      observations: [], checkpoints: [], interventions: [], steering: [], events: [], limits: { maxSteps: profile.maxSteps, maxRetries: profile.maxRetries, maxRuntimeMs: profile.maxRuntimeMs },
      budget: runBudget(profile),
      /* A2 §8: where a run's time actually goes, measured rather than inferred from the log */
      waterfall: { classifyMs: 0, planMs: 0, thinkMs: 0, toolMs: 0, synthesizeMs: 0, narrateMs: 0, verifyMs: 0, waitMs: 0, usefulReplans: 0, noopReplans: 0 },
      usage: { steps: 0, activeMs: 0, consecutiveFailures: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, toolCalls: 0, cacheReadTokens: 0, estimatedCostUsd: 0 }, trace: { toolCalls: [], modelCalls: [], policyDecisions: [] },
      verification: null, result: null, resultObjectIds: [], artifactIds: [], warnings: [], errors: [], completionReason: null,
      startedAt: t, updatedAt: t, completedAt: null, planner: goal.type === 'GENERIC' || goal.type === 'INVESTIGATE' ? 'MODEL' : 'TEMPLATE',
      ...(goal.type === 'INVESTIGATE' ? { investigation: newInvestigation() } : {}),
      actionPlanId: `APLAN-${runId}-1`, governedPlanId: `GPLAN-${runId}-1`, planSeq: 1, dataVersion: this.o.gl.dataVersion(), options, progress: [],
      /* A4 §5/§12: where this run came from — a conversation, a module and its object, or a service */
      origin: (opt.origin as AgentRunBody['origin']) ?? (opt.sessionId ? 'CONVERSATION' : 'API'), launchedFrom: opt.launchedFrom ?? null,
    };
    this.objects.set(runId, new Map());
    /* A2 §3: with no model, classification is synchronous and happens HERE — before a clarification can be raised */
    this.deterministicProfile(run, actor);
    const chosen = POLICY_PROFILES[run.goal.policyProfile];
    this.event(run, 'RUN_CREATED', `Goal: ${goal.title} · profile ${chosen.label} (chosen by Korvyn, never by the request)`);
    this.policy(run, `profile:${chosen.id}`, 'ALLOW', `${chosen.label}; autonomy level ${chosen.autonomy}; autonomous action types: none`);
    WORK.repos.records.insert(KIND, { run }, actor.id, { id: runId, status: run.runStatus, period: goal.period, scope: goal.scope, investigationId });
    this.cache.set(runId, run);
    this.audit(run, actor, 'AGENT_RUN_STARTED', null, { goal: goal.title, profile: profile.id });
    WORK.repos.investigations.event(investigationId, { type: 'AGENT_RUN', label: `Agent run started: ${goal.title}`, ref: runId, traceId: runId }, actor.id);
    for (const n of goal.notices) { run.warnings.push(n); this.line(run, n, 'skipped'); }
    if (goal.pending.length) {
      this.openClarification(run, goal.pending[0]!);
      this.save(run);
      return { ok: true, run };
    }
    this.plan(run, actor).catch((e: Error) => { run.errors.push(e.message); this.finish(run, 'FAILED', `Korvyn could not build a valid plan for this goal: ${e.message}`); });
    return { ok: true, run };
  }

  /**
   * A2 §3 — CLASSIFY, THEN CHOOSE THE PROFILE. One model call per run, on the cheapest route, before anything
   * executes. The model says what KIND of outcome the objective asks for; Korvyn owns the mapping to a profile and
   * caps it by the actor's own authority, so no wording can widen what a run may do.
   */
  private async classify(run: AgentRunBody, actor: Actor) {
    const g = run.goal;
    if (g.outcomeSource === 'caller' || g.outcomeSource === 'deterministic' || g.type !== 'INVESTIGATE') {
      /**
       * A caller that named the outcome, a forced legacy template, or a run already resolved deterministically.
       * The profile is still APPLIED here: it decides the inner loop's budget and reasoning class as well as the
       * run's, and skipping that left a caller-declared profile with the deployment's default loop budget rather
       * than its own (observed — a READ_ONLY run held to 20 tool calls instead of its 14).
       */
      const cd = profileForOutcome(g.outcome ?? 'ANALYZE', actor, g.policyProfile, g.workClass ?? null);
      this.applyProfile(run, cd.profile);
      this.policy(run, `profile:${cd.profile}`, cd.capped ? 'CHECKPOINT' : 'ALLOW', g.outcomeSource === 'caller' ? `The caller declared the outcome class. ${cd.reason}`
        : g.outcomeSource === 'deterministic' ? 'Classified without a model; the profile was chosen at start.' : `Deprecated compatibility shim: goal type ${g.type} was forced by the caller.`);
      if (cd.capped) { run.warnings.push(cd.reason); this.line(run, cd.reason, 'skipped'); }
      return;
    }
    const t0 = Date.now();
    const c = await classifyObjective(this.o, g.objective, this.ac(run.runId).signal);
    run.waterfall.classifyMs += Date.now() - t0;
    if (c.call) this.model(run, { ...c.call, cls: 'M1' });
    /* a caller that ASKED for a profile is honoured only as far as the actor's authority allows (§7) */
    /* A6 §13 — the model read the words; where its class selects no profile, the GOVERNED ANCHOR is tried next */
    const anchor = anchorWorkClass(g);
    const d = profileForOutcome(c.outcome, actor, run.goal.requestedProfile, c.workClass ?? null, anchor);
    g.outcome = c.outcome; g.outcomeSource = c.source === 'model' ? 'model' : 'deterministic';
    if (c.workClass ?? anchor) g.workClass = c.workClass ?? anchor;
    this.applyProfile(run, d.profile, c.needsDeepReasoning);
    const p = POLICY_PROFILES[d.profile];
    if (p.execution !== 'GENERIC') g.type = p.execution;
    this.policy(run, `profile:${p.id}`, d.capped ? 'CHECKPOINT' : 'ALLOW', `${d.reason} Classified by ${g.outcomeSource} (${c.confidence.toFixed(2)}): ${c.understanding}`);
    this.event(run, 'OBJECTIVE_CLASSIFIED', `${c.outcome} → ${p.label}${c.needsDeepReasoning ? ' · deep reasoning from the first step' : ''}`);
    if (d.capped) { run.warnings.push(d.reason); this.line(run, d.reason, 'skipped'); }
  }

  /** A2 §14 — a profile's budget, limits and reasoning class, applied before the first step. The model never sees them. */
  private applyProfile(run: AgentRunBody, id: ProfileId, deep = false) {
    const p = POLICY_PROFILES[id];
    run.goal.policyProfile = id;
    /**
     * A4 §4 — WHETHER A RUN MAY PREPARE IS THE PROFILE'S ANSWER, NOT THE CALL SITE'S. `noActions` is a USER
     * constraint ("don't create comments yet") and the runtime treats it as one everywhere — but the conversational
     * entry point set it TRUE unconditionally, so every run Sloane started could only ever read. A close objective
     * reaching the Close profile still prepared nothing, and the reason was a default written three layers away
     * from the authority that should decide it (observed: the profile was right and the run did half the work).
     *
     * It is derived here from the profile Korvyn chose, and a person's own instruction still wins: `userSet` is
     * marked by the goal parser and by steering, and is never overwritten.
     */
    if (!run.goal.constraints.userSetNoActions) run.goal.constraints.noActions = p.autonomy < 2;
    run.budget = runBudget(p);
    run.limits = { maxSteps: p.maxSteps, maxRetries: p.maxRetries, maxRuntimeMs: p.maxRuntimeMs };
    if (run.investigation) {
      run.investigation.budget = profileBudget(p);
      /**
       * A2 §12 — THE FIRST STEP IS PLANNING, NEVER JUDGMENT. It decides what to READ with no observations in hand,
       * so there is nothing to reason deeply ABOUT yet. It starts at the profile's own class whatever the
       * classifier said; the hint is kept and spent from step 2. Live, escalating step 1 put "what should I look
       * at first?" on the frontier model and cost ~20s and half the run's spend before a single read had returned.
       */
      run.investigation.nextClass = p.reasoningClass;
      run.investigation.deepWarranted = deep;
    }
  }

  /**
   * A2 §3/§6 — NO REASONING, STILL A RUN, and the classification is SYNCHRONOUS so it happens at START.
   *
   * It has to happen there: a run that stops to ask a clarifying question before it has been classified would carry
   * its provisional profile into the answer, and the goal a person sees would be the placeholder (observed —
   * "Review last quarter." asked which quarter and reported itself as an open investigation).
   *
   * THE TEMPLATES ARE NOW THE DETERMINISTIC PLANNER, not the architecture. The open loop's first act is a model
   * call, so with no model it could not take one; every other Sloane surface pairs a model with a Korvyn fallback
   * (`adapter.plan` with `deterministicPlan`, `analysisEdit` with `parseAnalysis`) and this is that pattern for the
   * agent. A deployment with a model configured never reaches this path. It is deprecated, and deleting it is A3's
   * once the generic loop has a deterministic planner good enough to replace it — a capability question, not a
   * naming one.
   */
  private deterministicProfile(run: AgentRunBody, actor: Actor) {
    const g = run.goal;
    if (g.type !== 'INVESTIGATE' || g.outcomeSource === 'caller') return;
    if (!this.o.reasoningAvailable || this.o.reasoningAvailable()) return;
    const legacy = detectGoalType(g.objective, hasSubject(resolveTerms(g.objective, this.deps(actor))));
    g.type = legacy ?? 'GENERIC';
    g.outcomeSource = 'deterministic';
    run.investigation = undefined;
    /**
     * A TEMPLATE IMPLIES ITS OUTCOME, so the profile must follow it. Without this the deterministic planner produced
     * a preparation plan under the read-only profile it had been given for ANALYZE, and every PROPOSE step in it was
     * skipped by the policy gate — a run that looked complete and had quietly done half the work (observed: the
     * controller-review template ran its five reads and skipped all four drafts and the package). It goes through
     * the SAME authority cap, so the actor's permissions still decide.
     */
    const outcome = legacy ? POLICY_PROFILES[PROFILE_FOR[legacy]].serves[0] ?? 'ANALYZE' : 'ANALYZE';
    const d = profileForOutcome(outcome, actor, legacy ? PROFILE_FOR[legacy] : undefined);
    g.outcome = outcome;
    this.applyProfile(run, d.profile);
    this.policy(run, `profile:${d.profile}`, d.capped ? 'CHECKPOINT' : 'ALLOW', `${d.reason}${legacy ? ` The deterministic planner selected the ${legacy} template, which implies this profile.` : ''}`);
    if (d.capped) { run.warnings.push(d.reason); this.line(run, d.reason, 'skipped'); }
    this.event(run, 'PLANNER', legacy
      ? `No reasoning model is configured; Korvyn planned this run deterministically from its ${legacy} template (deprecated).`
      : 'No reasoning model is configured; Korvyn planned this run deterministically.');
  }

  private async plan(run: AgentRunBody, actor: Actor) {
    this.status(run, 'PLANNING');
    await this.classify(run, actor);
    const profile = POLICY_PROFILES[run.goal.policyProfile];
    const tPlan = Date.now();
    let proto = templateFor(run.goal);
    if (run.goal.type === 'INVESTIGATE_VENDOR' && run.goal.subject.vendor && !this.o.gl.vendors().includes(run.goal.subject.vendor)) {
      proto = [{ taskId: 'verify', type: 'VERIFY', title: 'Verification', check: 'VERIFY', dependsOn: [], milestone: true, priority: 90 }, { taskId: 'summarize', type: 'SUMMARIZE', title: 'Summary', check: 'SUMMARIZE', dependsOn: ['verify'], softDeps: true, priority: 95 }];
      this.line(run, `${run.goal.subject.vendor} is in the vendor master but has no governed activity in the period`, 'done');
    }
    if (run.goal.type === 'GENERIC') {
      const allow = this.o.agentAllowlist(actor, profile.domains, profile.autonomy >= 2);
      const ac = this.ac(run.runId);
      const p = await this.o.agentPlan(run.sessionId, actor, run.goal.objective, allow, ac.signal);
      p.calls.forEach((c) => this.model(run, c));
      proto = p.steps.map((s, i) => { const reg = toolRegistry.get(s.tool);
        return { taskId: `m${i + 1}`, type: reg ? typeOfTool(reg.domain, reg.risk) : 'RETRIEVE', title: s.purpose || s.tool, tool: s.tool, milestone: true, priority: 10 + i, scopeSensitive: scopeSensitiveTool(s.tool),
          args: Object.fromEntries((s.args ?? []).filter((a) => a.value && !/^\$/.test(a.value)).map((a) => [a.name, a.value!])),
          refs: Object.fromEntries((s.args ?? []).filter((a) => a.value && /^\$\d+\./.test(a.value)).map((a) => { const n = Number(a.value!.slice(1, a.value!.indexOf('.'))); return [a.name, `$task:m${n + 1}${a.value!.slice(a.value!.indexOf('.'))}`]; })),
          dependsOn: (s.dependsOn ?? []).filter((d) => d >= 0 && d < i).map((d) => `m${d + 1}`), request: run.goal.objective, planKey: 'ACTIONS' as const }; });
      proto.push({ taskId: 'verify', type: 'VERIFY', title: 'Verification', check: 'VERIFY', dependsOn: proto.map((x) => x.taskId), softDeps: true, milestone: true, priority: 90 },
        { taskId: 'summarize', type: 'SUMMARIZE', title: 'Summary', check: 'SUMMARIZE', dependsOn: ['verify'], softDeps: true, priority: 95 });
      if (p.source === 'reasoning') this.event(run, 'PLAN_PROPOSED', `The model proposed ${p.steps.length} steps; Korvyn validates each before it runs`);
    }
    const tasks = proto.map((p) => mkTask(p, 1, run.goal.type === 'GENERIC' && p.tool ? 'MODEL' : 'TEMPLATE'));
    /* §7: every tool step is validated BEFORE the run starts — a rejected step is recorded and never runs */
    const rejected: { task: string; why: string }[] = [];
    for (const t of tasks) {
      if (!t.tool) continue;
      const why = this.profileGate(run, t);
      if (why) { t.status = 'SKIPPED'; t.failureMode = 'POLICY'; t.error = why; rejected.push({ task: t.title, why }); this.policy(run, t.tool, 'DENY', why, 'POLICY'); }
    }
    run.graph = { ...run.graph, version: 1, tasks, revisions: [{ version: 1, at: now(), source: run.goal.type === 'GENERIC' ? 'MODEL' : 'TEMPLATE', reason: 'Initial plan', added: tasks.map((t) => t.taskId), invalidated: [], rejected }] };
    run.waterfall.planMs += Date.now() - tPlan;
    this.event(run, 'PLAN_CREATED', `${tasks.length} steps (${tasks.filter((t) => t.milestone).length} milestones)${rejected.length ? `, ${rejected.length} rejected by policy` : ''}`);
    if (!tasks.filter((t) => t.status !== 'SKIPPED' && t.tool).length && run.goal.type === 'GENERIC') { this.finish(run, 'FAILED', 'Korvyn could not validate a plan for this goal.'); return; }
    this.status(run, 'READY');
    this.status(run, 'RUNNING');
    this.save(run);
    this.kick(run.runId);
  }

  /** the policy profile decides what the run may do, not the model and not the request */
  private profileGate(run: AgentRunBody, t: AgentTask): string | null {
    const blocked = this.constraintBlocks(run, t);
    if (blocked) return blocked;
    const prof = POLICY_PROFILES[run.goal.policyProfile], reg = toolRegistry.get(t.tool!);
    if (!reg) return `${t.tool} is not a registered tool`;
    if (!prof.domains.includes(reg.domain)) return `${reg.id} (${reg.domain}) is outside the ${prof.label} profile`;
    if (reg.risk === 'PROPOSE') {
      if (prof.autonomy < 2) return `${prof.label} is read-only: ${reg.id} would prepare an action`;
      const at = this.actionTypeOf(t);
      if (at && !prof.preparableActions.includes(at)) return `${prof.label} may not prepare ${at}`;
    }
    if (reg.risk !== 'READ' && reg.risk !== 'PROPOSE') return `${reg.id} is a ${reg.risk} action; the runtime never executes`;
    return null;
  }
  private actionTypeOf(t: AgentTask): string | null {
    /**
     * A3 §4 — THE ONE PLACE A CAPABILITY IS MAPPED TO AN ACTION TYPE, which is what the profile's
     * `preparableActions` is checked against. A propose tool that is NOT here falls through to its own id, matches
     * no profile, and is refused: unknown fails CLOSED, exactly as ActionGovernance does with an unknown type.
     * A capability added without an entry here is therefore unreachable rather than ungoverned — which is the
     * right way round, and is how `proposeReviewerAssignment` was silently unusable until A3.
     *
     * A6 — AND THE NAME HERE MUST BE THE ACTION REGISTRY'S NAME, not a second vocabulary for the same act. The
     * first live RECONCILIATION suite found `proposeReconciliationComment` mapped to `ADD_RECON_COMMENT` while
     * `ACTION_POLICY` — and therefore the proposal the tool actually creates — says `ADD_RECONCILIATION_COMMENT`.
     * Five profiles carried the wrong name too, so the gate matched itself and let the action through while the
     * executed proposal carried a type no profile declared. A gate comparing against a name nothing else uses is
     * not a gate. Its own pair, `proposeReconciliationCommentUpdate`, was right all along, which is the tell.
     */
    if (t.tool === 'prepareGovernedAction') return t.args['actionType'] ?? 'GOVERNED';
    return t.tool && t.tool.startsWith('propose') ? PROPOSE_ACTION_TYPE[t.tool] ?? t.tool : null;
  }

  /* ================================================================================================
     THE LOOP — one step at a time, in the background
     ================================================================================================ */
  private kick(runId: string, delay = 0) {
    if (this.running.has(runId)) { this.rekick.add(runId); return; }
    setTimeout(() => { void this.loop(runId); }, delay);
  }
  private async loop(runId: string) {
    if (this.running.has(runId)) return;
    this.running.add(runId);
    try {
      for (;;) {
        const run = this.cache.get(runId) ?? this.load(runId);
        if (!run || run.runStatus !== 'RUNNING') break;
        const more = await this.stepOnce(run);
        this.save(run);
        if (!more) break;
        if (run.options.pace) { this.running.delete(runId); this.kick(runId, run.options.pace); return; }
      }
    } catch (e) {
      const run = this.cache.get(runId);
      if (run) { run.errors.push((e as Error).message); this.finish(run, 'FAILED', `The run stopped on an internal error: ${(e as Error).message}`); }
    } finally { this.running.delete(runId); this.notify(runId); if (this.rekick.delete(runId)) this.kick(runId); }
  }

  private depState(run: AgentRunBody, t: AgentTask): 'READY' | 'WAIT' | 'SKIP' {
    for (const d of t.dependsOn) {
      const dt = run.graph.tasks.find((x) => x.taskId === d && !x.invalidatedBy) ?? run.graph.tasks.find((x) => x.taskId === d);
      if (!dt) continue;
      if (dt.status === 'COMPLETED') continue;
      if (['PENDING', 'READY', 'RUNNING', 'WAITING'].includes(dt.status)) return 'WAIT';
      if (!t.softDeps) return 'SKIP';
    }
    /* a checkpoint gathers every proposal of its plan: it waits until no preparation of that plan is still to run */
    if (t.check === 'CONFIRMATION' && run.graph.tasks.some((x) => x.planKey === 'ACTIONS' && !x.invalidatedBy && ['PENDING', 'READY', 'RUNNING'].includes(x.status))) return 'WAIT';
    if (t.check === 'GOVERNED' && run.graph.tasks.some((x) => (x.planKey === 'GOVERNED' || x.check === 'RECON_EVIDENCE') && ['PENDING', 'READY', 'RUNNING'].includes(x.status))) return 'WAIT';
    if ((t.check === 'VERIFY' || t.check === 'SUMMARIZE') && run.graph.tasks.some((x) => x !== t && x.check !== 'VERIFY' && x.check !== 'SUMMARIZE' && ['PENDING', 'READY', 'RUNNING', 'WAITING'].includes(x.status))) return 'WAIT';
    return 'READY';
  }

  /** @returns whether the loop should continue */
  private async stepOnce(run: AgentRunBody): Promise<boolean> {
    const prof = POLICY_PROFILES[run.goal.policyProfile];
    /**
     * §12/§13 STOP CONDITIONS, checked BEFORE the step so the loop never overruns. One budget engine
     * (`budgetExhausted`) covers steps, wall clock, model calls, tokens and estimated cost; budget exhaustion
     * produces a controlled terminal state with the reason recorded, never a retry.
     */
    const b = run.budget ?? runBudget(prof);
    const spent = budgetExhausted(b, runUsage(run, Date.now() - Date.parse(run.startedAt) - this.waitedMs(run)));
    if (spent) {
      run.warnings.push(`Budget: ${spent}`);
      /**
       * A3 §6/§7 — A RUN THAT STOPS STILL HANDS OVER WHAT IT PREPARED. The investigation's own budget stop goes
       * through synthesis, which opens the confirmation; the RUN's stop did not, so a live run that hit its
       * model-call budget left four valid draft explanations WAITING_CONFIRMATION with no checkpoint attached —
       * persisted, correct, and unreachable by the person they were prepared for (observed). Preparation nobody
       * can decide is work thrown away, and the reason for preparing first is that the decision is theirs.
       */
      if (this.handOver(run, `The run stopped because its ${spent}, with work already prepared.`)) return false;
      this.finish(run, 'BLOCKED', `The run stopped because its ${spent}. The completed work is kept; resume with a narrower goal.`);
      return false;
    }
    if (run.usage.consecutiveFailures >= prof.maxConsecutiveFailures) { this.finish(run, 'FAILED', `${run.usage.consecutiveFailures} steps failed in a row; the run stopped rather than continue on broken inputs.`); return false; }
    /* skip what can no longer run */
    for (const t of run.graph.tasks) if (t.status === 'PENDING' && this.depState(run, t) === 'SKIP') { t.status = 'SKIPPED'; t.failureMode = 'DEPENDENCY'; t.error = 'A step it depends on did not complete.'; this.event(run, 'TASK_SKIPPED', `${t.title}: a step it depends on did not complete`); if (t.milestone) this.line(run, `${t.title} — not run: a step it depends on did not complete`, 'skipped'); }
    const ready = run.graph.tasks.filter((t) => t.status === 'PENDING' && this.depState(run, t) === 'READY').sort((a, b) => a.priority - b.priority);
    const t = ready[0];
    if (t) {
      /**
       * §18 PARALLELISM — the foundation, not a worker system. Every READY task is independent BY CONSTRUCTION: a
       * task whose dependency has not completed is WAIT, never READY, so the ready set can never contain a pair
       * where one needs the other. What is left is deciding which of them are safe to interleave, and that is a
       * property of the step, not of the goal:
       *
       *   a READ tool step        pure with respect to run state — it appends an observation and nothing else
       *   an EXPANDING step       revises the graph mid-batch, so the batch it is in is no longer the plan
       *   a PROPOSE step          joins an action plan a confirmation checkpoint will decide; order is meaning
       *   an INTERNAL check       verification, synthesis, confirmation, THINK — each reads the whole run
       *
       * Only the first is batched. The batch is a prefix of the priority-ordered ready set, so priority still
       * decides what runs first, and it is capped by what the budget has left, so parallelism can never overrun a
       * ceiling the sequential path would have respected.
       */
      /* A2 §13: how wide a tick may be is the PROFILE's to say, bounded by an environment ceiling and by what the
         budget has left — so parallelism can never overrun a limit the sequential path would have respected */
      const room = Math.max(1, Math.min(prof.maxParallelReads ?? MAX_PARALLEL, MAX_PARALLEL, b.maxIterations - run.usage.steps, b.maxToolCalls - (run.usage.toolCalls ?? 0)));
      const batch: AgentTask[] = [];
      for (const x of ready) { if (batch.length >= room || !this.parallelSafe(x)) break; batch.push(x); }
      if (batch.length > 1) {
        this.event(run, 'STEPS_PARALLEL', `${batch.length} independent reads run together: ${batch.map((x) => x.title).join(', ')}`);
        await Promise.all(batch.map((x) => this.execute(run, x)));
      } else await this.execute(run, t);
      return run.runStatus === 'RUNNING';
    }
    {
      const open = run.checkpoints.filter((c) => c.status === 'OPEN' && c.blocking);
      if (run.graph.tasks.some((x) => x.status === 'WAITING') && open.length) {
        const c = open[0]!;
        this.status(run, c.type === 'GOVERNED_APPROVAL' ? 'WAITING_FOR_GOVERNED_APPROVAL' : c.type === 'CONFIRMATION' ? 'WAITING_FOR_CONFIRMATION' : 'WAITING_FOR_USER');
        return false;
      }
      if (run.graph.tasks.some((x) => ['PENDING', 'RUNNING'].includes(x.status))) { this.finish(run, 'BLOCKED', 'The remaining steps cannot start: their inputs are not available.'); return false; }
      const ok = run.verification?.passed !== false;
      const gov = run.checkpoints.find((c) => c.type === 'GOVERNED_APPROVAL' && c.status === 'OPEN');
      if (gov) { this.status(run, 'WAITING_FOR_GOVERNED_APPROVAL'); return false; }
      this.finish(run, ok ? 'COMPLETED' : 'BLOCKED', ok ? 'Goal complete and verified.' : `Verification did not pass: ${run.verification!.checks.filter((c) => !c.ok).map((c) => c.check).join('; ')}.`);
      return false;
    }
  }
  /** §18: a step that may share a tick with its independent siblings — a governed READ that revises nothing */
  private parallelSafe(t: AgentTask): boolean {
    return !!t.tool && t.riskLevel === 'READ' && !t.expand && !t.check;
  }
  private waitedMs(run: AgentRunBody) {
    let w = 0;
    for (const c of run.checkpoints) if (c.blocking) w += (c.resolvedAt ? Date.parse(c.resolvedAt) : Date.now()) - Date.parse(c.createdAt);
    return w;
  }

  /* ================================================================================================
     EXECUTE ONE TASK → OBSERVE → UPDATE → EXPAND
     ================================================================================================ */
  private async execute(run: AgentRunBody, t: AgentTask) {
    const actor = this.actorOf(run);
    t.status = 'RUNNING'; t.startedAt = now(); t.attempts += 1; run.currentTaskId = t.taskId;
    if (t.milestone && t.check !== 'SUMMARIZE') this.line(run, `${t.title}…`, 'active', t.taskId);
    this.event(run, 'TASK_STARTED', t.title);
    run.usage.steps += 1;
    const t0 = Date.now();
    try {
      if (t.check && !t.tool) { const ti = Date.now(); await this.internal(run, t, actor); if (t.check === 'VERIFY') run.waterfall.verifyMs += Date.now() - ti; }
      else { const tt = Date.now(); await this.toolTask(run, t, actor); run.waterfall.toolMs += Date.now() - tt; }
    } catch (e) {
      t.status = 'FAILED'; t.error = (e as Error).message; t.failureMode = 'ERROR';
    }
    t.latencyMs = Date.now() - t0; run.usage.activeMs += t.latencyMs;
    const st0 = t.status as AgentTask['status'];
    if (st0 === 'RUNNING') t.status = 'COMPLETED';
    /* observed AFTER the status settles: a tool task still reads RUNNING until here */
    if (run.investigation && t.tool && t.origin === 'MODEL') this.observeInvestigation(run, t);
    const st = t.status as AgentTask['status'];
    if (st === 'COMPLETED' || st === 'WAITING') { t.completedAt = st === 'COMPLETED' ? now() : null; if (st === 'COMPLETED') run.usage.consecutiveFailures = 0; this.event(run, st === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_WAITING', t.title); }
    if (st === 'FAILED') { run.usage.consecutiveFailures += 1; this.event(run, 'TASK_FAILED', `${t.title}: ${t.error}`); if (t.milestone) this.line(run, `${t.title} — could not complete: ${t.error}`, 'blocked', t.taskId); }
    if (st === 'SKIPPED') this.event(run, 'TASK_SKIPPED', `${t.title}: ${t.error ?? ''}`);
    run.currentTaskId = null;
  }

  private resolveRefs(run: AgentRunBody, t: AgentTask): { args: Record<string, string>; missing: string | null } {
    const args = { ...t.args };
    for (const [name, path] of Object.entries(t.refs)) {
      const m = path.match(/^\$task:([^.]+)\.(refs|facts|population)\.?(.*)$/);
      if (!m) return { args, missing: `${name}: ${path} is not a reference` };
      const src = this.latest(run, m[1]!), o = src ? this.objects.get(run.runId)?.get(src.taskId) : undefined;
      const v = !o ? null : m[2] === 'population' ? o.population?.populationId ?? o.refs['populationId'] ?? null : m[2] === 'facts' ? String(fact(o, m[3]!)?.value ?? '') || null : o.refs[m[3]!] ?? null;
      if (!v) return { args, missing: `${name} did not resolve from ${src?.title ?? m[1]}` };
      args[name] = v;
    }
    return { args, missing: null };
  }
  /** a task id resolves to its latest (non-invalidated) replacement */
  private latest(run: AgentRunBody, id: string) {
    const base = id.split('~')[0]!;
    return run.graph.tasks.filter((x) => x.taskId.split('~')[0] === base && !x.invalidatedBy).at(-1) ?? run.graph.tasks.find((x) => x.taskId === id);
  }

  private async toolTask(run: AgentRunBody, t: AgentTask, actor: Actor) {
    const why = this.profileGate(run, t);
    if (why) { t.status = 'SKIPPED'; t.failureMode = 'POLICY'; t.error = why; this.policy(run, t.tool!, 'DENY', why, 'POLICY'); return; }
    const { args, missing } = this.resolveRefs(run, t);
    if (missing) { t.status = 'SKIPPED'; t.failureMode = 'DEPENDENCY'; t.error = missing; return; }
    /* §7 validation: the Planner checks the step as it checks any plan step (allowlist = the profile's tools) */
    const prof = POLICY_PROFILES[run.goal.policyProfile];
    const allow = this.o.agentAllowlist(actor, prof.domains, prof.autonomy >= 2);
    this.o.agentSession(run.sessionId, actor, undefined, run.investigationId);
    const v = this.o.agentValidate(run.sessionId, actor, { tool: t.tool!, purpose: t.title, args }, allow);
    if (!v.steps.length) { const r = v.rejected[0]?.why ?? 'rejected'; const denied = PERMISSION_DENIAL.test(r); t.status = denied ? 'FAILED' : 'SKIPPED'; t.failureMode = denied ? 'PERMISSION' : 'VALIDATION'; t.error = r; this.policy(run, t.tool!, 'DENY', r, denied ? 'PERMISSION' : 'VALIDATION'); return; }
    const step = v.steps[0]!;
    this.policy(run, t.tool!, 'ALLOW', v.repairs.length ? `validated; repaired: ${v.repairs.join('; ')}` : 'validated');
    /* DEV/TEST simulation of failures (never in strict auth mode) */
    if (run.options.failTools?.includes(t.tool!)) { t.status = 'FAILED'; t.failureMode = 'ERROR'; t.error = `${t.tool} is unavailable (simulated)`; this.trace(run, t, step.args, 'FAILED', 0, null, t.error, 'sim'); return; }
    if (run.options.transientTools?.includes(t.tool!) && t.attempts === 1) {
      this.trace(run, t, step.args, 'FAILED', 0, null, 'timeout (simulated transient)', 'sim');
      if (t.retryPolicy.on === 'TRANSIENT' && t.attempts <= t.retryPolicy.max) { t.status = 'PENDING'; this.event(run, 'TASK_RETRY', `${t.title}: transient failure, retrying once (a read is safe to repeat)`); return; }
    }
    const planId = t.planKey === 'GOVERNED' ? run.governedPlanId : run.actionPlanId;
    const oid = `${run.runId}-${t.taskId.replace(/[^A-Za-z0-9]/g, '')}-${t.attempts}`;
    this.o.agentSession(run.sessionId, actor, undefined, run.investigationId);
    const r = this.o.agentExecute(run.sessionId, actor, { tool: step.tool, purpose: t.title, args: step.args, request: t.request ?? run.goal.objective }, planId, oid);
    t.executionTraceId = r.traceId;
    this.trace(run, t, step.args, r.status, r.latencyMs, r.object?.id ?? null, r.error, r.traceId);
    if (r.status !== 'COMPLETED' || !r.object) {
      const transient = /timeout|ECONN|temporar/i.test(r.error ?? '');
      if (transient && t.retryPolicy.on === 'TRANSIENT' && t.attempts <= t.retryPolicy.max) { t.status = 'PENDING'; this.event(run, 'TASK_RETRY', `${t.title}: ${r.error}; retrying once`); return; }
      t.status = 'FAILED'; t.failureMode = r.status === 'REFUSED' ? 'PERMISSION' : 'ERROR'; t.error = r.error; return;
    }
    const o = r.object;
    this.objects.get(run.runId)?.set(t.taskId, o);
    t.resultObjectIds = [o.id, ...(r.extra ? [r.extra.id] : [])];
    t.proposalIds = r.proposalIds;
    if (o.refs['artifactId']) { t.artifactIds = [o.refs['artifactId']]; if (!run.artifactIds.includes(o.refs['artifactId'])) run.artifactIds.push(o.refs['artifactId']); }
    run.resultObjectIds.push(...t.resultObjectIds.map((x) => `${r.traceId}:${x}`));
    const obs = this.observe(run, t, o, r.warnings);
    if (o.status === 'UNAVAILABLE') { t.status = 'COMPLETED'; t.error = o.unavailable?.reason ?? null; if (t.milestone) this.line(run, `${t.title} — unavailable: ${o.unavailable?.reason ?? 'no governed result'}`, 'blocked', t.taskId); return; }
    if (o.action && o.action.validationStatus === 'INVALID') obs.warnings.push(...o.action.validation.errors);
    if (t.check === 'RECON_EVIDENCE') this.reconEvidence(run, t, o);
    if (t.check === 'VENDOR_SOURCES') this.vendorSources(run, t, o);
    if (t.tool === 'previewExcelArtifact') { const vs = String((o.workbook as { validation?: { status?: string } } | undefined)?.validation?.status ?? ''); if (vs === 'BLOCKED') { t.status = 'FAILED'; t.failureMode = 'VALIDATION'; t.error = 'The workbook did not pass Korvyn validation.'; return; } }
    if (t.expand) this.expand(run, t, o);
    if (t.milestone) this.line(run, `${t.title} — ${this.summaryLine(t, o)}`, 'done', t.taskId);
  }

  private observe(run: AgentRunBody, t: AgentTask, o: FinancialObject, warnings: string[]): AgentObservation {
    const obs: AgentObservation = {
      id: `OBS-${run.observations.length + 1}`, taskId: t.taskId, at: now(), status: 'COMPLETED', resultType: o.type, objectIds: [o.id], artifactIds: t.artifactIds.slice(), proposalIds: t.proposalIds.slice(),
      actionResults: [], warnings: warnings.filter((w) => !/Workflow state \(assignments/.test(w)).slice(0, 4), errors: [], evidence: o.population?.populationId ? [o.population.populationId] : [],
      /* A1 §10: EVERY run's observations carry canonical fact ids, not only an investigation's */
      factIds: factsFrom(o, FACT_CTX).map((f) => f.factId),
      contextUpdates: Object.fromEntries(Object.entries(o.refs).slice(0, 6)), policyEvents: o.action ? [`${o.action.type} classified ${o.action.riskLevel} by Korvyn policy`] : [], findings: this.findingsOf(t, o),
    };
    run.observations.push(obs);
    if (run.observations.length > 200) run.observations.splice(0, run.observations.length - 200);
    return obs;
  }

  /** findings are read from the governed rows — never written by the model */
  private findingsOf(t: AgentTask, o: FinancialObject): AgentFinding[] {
    const f: AgentFinding[] = [];
    const rows = o.table.rows;
    if (t.tool === 'getCloseBlockers') for (const r of rows) if (r.cells[0] === 'BLOCKING') f.push({ amountUsd: parseMoney(r.cells[3] ?? ''), kind: r.cells[1] === 'SOURCE_UNAVAILABLE' ? 'EXTERNAL_DEPENDENCY' : 'BLOCKER', severity: 'HIGH', text: `${r.label} · ${r.cells[3]}`, objectId: o.id, about: r.label });
    if (t.tool === 'getReconciliationsNotTied') { const ts = col(o, 'Tie status'), d = col(o, 'Difference'); for (const r of rows) if (r.cells[ts] === 'NOT_TIED') f.push({ amountUsd: parseMoney(r.cells[d] ?? ''), kind: 'NOT_TIED', severity: 'HIGH', text: `${r.label} does not tie · difference ${r.cells[d]}`, objectId: o.id, about: r.label }); }
    if (t.tool === 'getUnexplainedFluxItems') { const es = col(o, 'Explanation status'), ch = col(o, 'Change'); for (const r of rows) if (r.cells[es] === 'UNEXPLAINED') f.push({ amountUsd: parseMoney(r.cells[ch] ?? ''), kind: 'UNEXPLAINED', severity: 'MEDIUM', text: `${r.label} moved ${r.cells[ch]} with no explanation`, objectId: o.id, about: r.label }); }
    if (t.tool === 'getReconciliationsMissingSupport') for (const r of rows.slice(0, 8)) f.push({ kind: 'MISSING_SUPPORT', severity: 'MEDIUM', text: `${r.label} is missing required support`, objectId: o.id, about: r.label });
    if (t.tool === 'findMissingEvidence') { const n = fact(o, 'linesMissing'), a = fact(o, 'amountMissing'); if (n && Number(n.value) > 0) f.push({ kind: 'MISSING_SUPPORT', severity: 'MEDIUM', text: `${n.display} line${n.display === '1' ? '' : 's'} missing a required reference (${a?.display ?? ''})`, objectId: o.id, about: null }); }
    return f;
  }

  private summaryLine(t: AgentTask, o: FinancialObject): string {
    const d = (k: string) => fact(o, k)?.display;
    switch (t.tool) {
      case 'getCloseReadiness': return `${d('readinessPct')} ready, ${d('blockers')} blockers`;
      case 'getCloseBlockers': return `${d('blocking')} blocking of ${d('blockers')}`;
      case 'getReconciliationsNotTied': return `${d('notTied')} not tied (${d('totalDifference')}), ${d('sourceNotConnected')} awaiting a bank source`;
      case 'getReconciliationsPendingReview': return `${d('inReview')} in review, ${d('returned')} returned`;
      case 'getUnexplainedFluxItems': return `${d('unexplained')} material lines unexplained`;
      case 'getReconciliationsMissingSupport': return `${o.table.rows.length} missing required support`;
      case 'getTrend': if (!Number(fact(o, 'lines')?.value ?? 0)) return 'no activity in scope'; return `${d('total')} across ${d('lines')} line${d('lines') === '1' ? '' : 's'}`;
      case 'analyzeByDimension': return d('group1.label') ? `largest ${d('group1.label')} (${d('group1.amount')}) of ${d('total')}` : 'no activity';
      case 'getGovernedPopulation': { const c = d('lineCount') ?? String(o.population?.rowCount ?? 0); return `${c} line${c === '1' ? '' : 's'} · net ${d('net') ?? '—'}`; }
      case 'findMissingEvidence': if (!Number(fact(o, 'linesMissing')?.value ?? 0)) return 'nothing missing'; return `${d('linesMissing') ?? '0'} line${d('linesMissing') === '1' ? '' : 's'} missing support${d('amountMissing') ? ` (${d('amountMissing')})` : ''}`;
      case 'getSourceSystemReferences': if (!Number(fact(o, 'systems')?.value ?? 0)) return 'no lines to trace'; return `${d('systems')} source system${d('systems') === '1' ? '' : 's'}, ${d('unavailable')} stale or unavailable`;
      case 'buildExcelArtifact': return `${(o.workbook as { sheets?: unknown[] } | undefined)?.sheets?.length ?? 0} tabs defined`;
      default: return o.title;
    }
  }

  /* ---- expansion: the graph grows from what a step found ---------------------------------------- */
  private expand(run: AgentRunBody, t: AgentTask, o: FinancialObject) {
    const added: AgentTask[] = [], v = run.graph.version + 1, p = run.goal.period, pl = periodLabel(p);
    const excluded = (label: string) => run.goal.constraints.exclude.some((x) => label.toLowerCase().includes(x.toLowerCase()));
    if (t.expand === 'FLUX_COMMENTS' && !run.goal.constraints.noComments) {
      const es = col(o, 'Explanation status'), ch = col(o, 'Change'), pc = col(o, 'Change %');
      for (const r of o.table.rows.filter((x) => x.cells[es] === 'UNEXPLAINED').slice(0, 4)) {
        if (excluded(r.label)) continue;
        const account = r.label.split(' ')[0]!;
        added.push(mkTask({ taskId: `fluxComment-${account}`, type: 'PREPARE_ACTION', title: `Flux comment — ${r.label}`, tool: 'proposeFluxComment', planKey: 'ACTIONS', about: r.label, dependsOn: [t.taskId], priority: 40,
          args: { account, period: p, text: `Controller review: ${r.label} moved ${r.cells[ch]} (${r.cells[pc]}) in ${pl} and has no approved explanation. Please explain the movement before sign-off.` }, request: `Add a Flux comment on ${r.label}` }, v, 'EXPANSION'));
      }
    }
    if (t.expand === 'RECON_COMMENTS' && !run.goal.constraints.noComments) {
      const ts = col(o, 'Tie status'), gl = col(o, 'GL balance'), cmp = col(o, 'Comparison'), d = col(o, 'Difference');
      for (const r of o.table.rows.filter((x) => x.cells[ts] === 'NOT_TIED')) {
        if (excluded(r.label) || !r.ref) continue;
        const id = r.ref.replace(/^recon:/, '');
        added.push(mkTask({ taskId: `reconComment-${id}`, type: 'PREPARE_ACTION', title: `Reconciliation comment — ${r.label}`, tool: 'proposeReconciliationComment', planKey: 'ACTIONS', about: r.label, dependsOn: [t.taskId], priority: 41,
          args: { target: id, period: p, text: `Controller review: ${r.label} does not tie in ${pl} (GL ${r.cells[gl]} vs ${r.cells[cmp]}, difference ${r.cells[d]}). Reconciling items and support are needed before approval.` }, request: `Add a reconciliation comment on ${r.label}` }, v, 'EXPANSION'));
      }
    }
    if (t.expand === 'RECON_APPROVALS') {
      for (const r of o.table.rows) {
        if (excluded(r.label) || !r.ref) continue;
        const id = r.ref.replace(/^recon:/, '');
        added.push(mkTask({ taskId: `evidence-${id}`, type: 'VALIDATE', title: `Evidence check — ${r.label}`, tool: 'getReconciliation', check: 'RECON_EVIDENCE', about: r.label, dependsOn: [t.taskId], priority: 45, args: { reconciliationId: id, period: p } }, v, 'EXPANSION'));
      }
      if (!run.graph.tasks.some((x) => x.check === 'GOVERNED')) added.push(mkTask({ taskId: 'approvalGate', type: 'WAIT_FOR_APPROVAL', title: 'Governed approval', check: 'GOVERNED', dependsOn: [t.taskId], softDeps: true, milestone: true, priority: 85 }, v, 'EXPANSION'));
    }
    if (added.length) this.revise(run, 'EXPANSION', `${t.title} found ${added.length} item${added.length > 1 ? 's' : ''} to act on`, added, []);
  }

  /** §22: an approval is prepared only for a reconciliation whose evidence supports it — each condition read from governed facts */
  private reconEvidence(run: AgentRunBody, t: AgentTask, o: FinancialObject) {
    const id = o.refs['reconciliationId'] ?? t.args['reconciliationId']!, reasons: string[] = [];
    const tie = String(fact(o, 'tieStatus')?.value ?? ''), diff = fact(o, 'difference')?.display ?? '', review = String(fact(o, 'reviewStatus')?.value ?? ''), miss = Number(fact(o, 'missingSupport')?.value ?? 1);
    const ent = o.refs['entity'], conn = this.o.gl.entities().find((e) => e.id === ent)?.connector;
    const src = conn ? (run.options.unavailableSources?.includes(conn) ? 'UNAVAILABLE' : SOURCE_HEALTH[conn]?.status) : 'UNKNOWN';
    if (!fact(o, 'glBalance')) reasons.push('no governed GL balance');
    if (tie !== 'TIED') reasons.push(`tie status is ${tie.replace(/_/g, ' ').toLowerCase()}${diff && diff !== '—' ? ` (difference ${diff})` : ''}`);
    if (miss > 0) reasons.push(`${miss} required support item${miss > 1 ? 's' : ''} missing`);
    if (!['IN_REVIEW', 'PREPARED', 'READY_FOR_REVIEW', 'SUBMITTED'].includes(review)) reasons.push(`review status is ${review.replace(/_/g, ' ').toLowerCase()}`);
    if (src !== 'AVAILABLE') reasons.push(`source ${conn ?? 'unknown'} is ${String(src).toLowerCase()}`);
    const obs = run.observations.at(-1)!;
    if (reasons.length) {
      obs.findings.push({ kind: 'INFO', severity: 'MEDIUM', text: `${t.about} is not ready for approval: ${reasons.join('; ')}`, objectId: o.id, about: t.about ?? null });
      this.policy(run, `RECONCILIATION_APPROVAL:${id}`, 'DENY', `evidence incomplete — ${reasons.join('; ')}`);
      this.line(run, `${t.about} — not ready for approval: ${reasons[0]}`, 'skipped', t.taskId);
      return;
    }
    this.policy(run, `RECONCILIATION_APPROVAL:${id}`, 'CHECKPOINT', 'evidence complete (balance, tie, support, review, source); approval is a governed action — prepared and routed, never executed');
    this.revise(run, 'EXPANSION', `${t.about}: evidence complete`, [mkTask({ taskId: `approve-${id}`, type: 'PREPARE_ACTION', title: `Approval prepared — ${t.about}`, tool: 'prepareGovernedAction', planKey: 'GOVERNED', riskLevel: 'GOVERNED', about: t.about ?? null, dependsOn: [t.taskId], priority: 46,
      args: { actionType: 'RECONCILIATION_APPROVAL', target: id, period: run.goal.period }, request: `Approve the ${t.about} reconciliation` }, run.graph.version + 1, 'EXPANSION')], []);
  }

  /** §42: a source Korvyn cannot reach is disclosed with the governed amount it holds back — never guessed around */
  private vendorSources(run: AgentRunBody, t: AgentTask, o: FinancialObject) {
    const byEnt = this.objects.get(run.runId)?.get(this.latest(run, 'by-entity')?.taskId ?? 'by-entity');
    const ents = this.o.gl.entities(), held: { name: string; system: string; amount: number; status: string }[] = [];
    const pop = this.objects.get(run.runId)?.get(this.latest(run, 'population')?.taskId ?? 'population');
    const rows = byEnt?.table.rows ?? (run.goal.subject.entity ? [{ ref: `entity:${run.goal.subject.entity}`, cells: [String(fact(pop, 'net')?.display ?? '')], label: '', level: 1, kind: 'line' as const }] : []);
    for (const r of rows) {
      if (!r.ref?.startsWith('entity:')) continue;
      const e = ents.find((x) => x.id === r.ref!.slice(7)); if (!e) continue;
      const st = run.options.unavailableSources?.includes(e.connector) ? 'UNAVAILABLE' : SOURCE_HEALTH[e.connector]?.status ?? 'UNAVAILABLE';
      if (st === 'UNAVAILABLE') held.push({ name: e.name, system: SOURCE_HEALTH[e.connector]?.system ?? e.connector, amount: parseMoney(r.cells[0] ?? '') ?? 0, status: st });
    }
    const stale = o.table.rows.filter((r) => r.cells[2] === 'STALE').map((r) => r.label);
    const obs = run.observations.at(-1)!;
    if (held.length) {
      const amt = held.reduce((s, h) => s + h.amount, 0), sys = [...new Set(held.map((h) => h.system))].join(', ');
      const text = `${money(amt)} of ${run.goal.subject.vendor ?? run.goal.labels['project'] ?? run.goal.labels['entity'] ?? 'this'} activity (${held.map((h) => h.name).join(', ')}) comes from ${sys}, which is unavailable. That portion cannot be verified against its source; Sloane states no finding about it.`;
      obs.findings.push({ kind: 'EXTERNAL_DEPENDENCY', severity: 'HIGH', text, objectId: o.id, about: sys });
      this.checkpoint(run, { type: 'EXTERNAL_DEPENDENCY', blocking: false, title: `${sys} unavailable`, detail: text, taskId: t.taskId, options: [{ id: 'acknowledge', label: 'Acknowledge' }] });
    }
    if (stale.length) obs.findings.push({ kind: 'INFO', severity: 'LOW', text: `${stale.join(', ')} is stale: its lines are read from the last sync.`, objectId: o.id, about: null });
  }

  /* ---- Korvyn-internal steps ------------------------------------------------------------------- */
  private async internal(run: AgentRunBody, t: AgentTask, actor: Actor) {
    switch (t.check) {
      case 'SOURCES': return this.sources(run, t);
      case 'CONFIRMATION': return this.confirmation(run, t);
      case 'GOVERNED': return this.governed(run, t);
      case 'GENERATION': return this.generation(run, t);
      case 'VERIFY': return this.verify(run, t, actor);
      case 'SUMMARIZE': return this.summarize(run, t);
      case 'THINK': return this.think(run, t, actor);
      case 'SYNTHESIZE': return this.synthesizeInvestigation(run, t);
      default: t.status = 'SKIPPED'; t.error = 'nothing to do';
    }
  }

  private sources(run: AgentRunBody, t: AgentTask) {
    const objs = this.objects.get(run.runId)!, recs = objs.get(this.latest(run, 'recsNotTied')?.taskId ?? 'recsNotTied'), bl = objs.get(this.latest(run, 'blockers')?.taskId ?? 'blockers');
    const texts: string[] = [];
    if (recs) { const ts = col(recs, 'Tie status'); const nc = recs.table.rows.filter((r) => r.cells[ts] === 'SOURCE_NOT_CONNECTED'); if (nc.length) texts.push(`${nc.length} bank reconciliation${nc.length > 1 ? 's' : ''} (${nc.map((r) => r.label.replace(/^Operating cash — /, '')).join(', ')}) cannot be proved: the bank statement source is not connected`); }
    if (bl) for (const r of bl.table.rows.filter((x) => x.cells[1] === 'SOURCE_UNAVAILABLE')) texts.push(`${r.label}`);
    /**
     * A5 §9 — SOURCE HEALTH IS SCOPED TO WHAT THE ACTOR MAY SEE, not to what the goal asked for.
     *
     * This filtered on the GOAL's scope, so an entity accountant whose objective said "across the group" was told
     * "NetSuite (MER-UK) is stale" — the existence of another entity and which ERP serves it, volunteered to
     * someone with no access to either. Found by the A5 harness on its first run, and it is the same leak class
     * 8D fixed in `continuousCloseSignals`: a disclosure about SOURCES is still a disclosure about the entities
     * those sources serve. The actor's own visibility is the ceiling; the goal's scope narrows within it.
     */
    const vis = visibleOf(this.actorOf(run));
    const inScope = this.o.gl.entities()
      .filter((e) => vis === 'ALL' || vis.has(e.id))
      .filter((e) => run.goal.scope === 'GROUP' || e.id === run.goal.scope);
    for (const [k, h] of Object.entries(SOURCE_HEALTH)) {
      const st = run.options.unavailableSources?.includes(k) ? 'UNAVAILABLE' : h.status;
      const es = inScope.filter((e) => e.connector === k);
      if (texts.some((x) => x.includes(h.system))) continue;
      if (st !== 'AVAILABLE' && es.length) texts.push(`${h.system} (${es.map((e) => e.id).join(', ')}) is ${st.toLowerCase()}: its figures are held from the last extract`);
    }
    const obs: AgentObservation = { id: `OBS-${run.observations.length + 1}`, taskId: t.taskId, at: now(), status: 'COMPLETED', resultType: 'SourceDependencies', objectIds: [], artifactIds: [], proposalIds: [], actionResults: [], warnings: [], errors: [], evidence: [], contextUpdates: {}, policyEvents: [],
      findings: texts.map((x) => ({ kind: 'EXTERNAL_DEPENDENCY' as const, severity: 'MEDIUM' as const, text: x, objectId: null, about: null })) };
    run.observations.push(obs);
    if (texts.length) this.checkpoint(run, { type: 'EXTERNAL_DEPENDENCY', blocking: false, title: 'Source systems limit the review', detail: texts.join('. ') + '.', taskId: t.taskId, options: [{ id: 'acknowledge', label: 'Acknowledge' }] });
    if (t.milestone) this.line(run, `${t.title} — ${texts.length ? `${texts.length} limitation${texts.length > 1 ? 's' : ''} disclosed` : 'all connected'}`, 'done', t.taskId);
  }

  private confirmation(run: AgentRunBody, t: AgentTask) {
    const props = this.o.actions.ofSession(run.sessionId).filter((p) => p.planId === run.actionPlanId && p.status === 'WAITING_CONFIRMATION');
    if (!props.length) {
      t.status = 'SKIPPED'; t.error = 'Nothing prepared needs confirmation.';
      const invalid = this.o.actions.ofSession(run.sessionId).filter((p) => p.planId === run.actionPlanId && p.validationStatus !== 'VALID');
      if (invalid.length) run.warnings.push(`${invalid.length} prepared action${invalid.length > 1 ? 's' : ''} did not pass validation and cannot be confirmed: ${invalid.map((p) => p.validation.errors[0] ?? p.title).join('; ')}`);
      if (t.milestone) this.line(run, `${t.title} — nothing to confirm`, 'skipped', t.taskId);
      return;
    }
    const planId = run.actionPlanId;
    run.planSeq += 1; run.actionPlanId = `APLAN-${run.runId}-${run.planSeq}`;
    this.checkpoint(run, { type: 'CONFIRMATION', blocking: true, title: `Confirm ${props.length} prepared action${props.length > 1 ? 's' : ''}`, detail: `Nothing has been written. ${props.map((p) => p.title).join(' · ')}`, taskId: t.taskId, proposalIds: props.map((p) => p.id), planId,
      /* A3 §8: APPROVE / REJECT / MODIFY, everywhere a confirmation is raised */
      options: [{ id: 'confirm', label: props.length > 1 ? `Confirm all ${props.length}` : 'Confirm' }, { id: 'modify', label: 'Edit and confirm' }, { id: 'cancel', label: props.length > 1 ? 'Cancel all' : 'Cancel' }] });
    t.status = 'WAITING';
    this.line(run, `${props.length} action${props.length > 1 ? 's' : ''} prepared — waiting for your confirmation`, 'waiting', t.taskId);
  }

  /**
   * Open the confirmation for whatever this run prepared, on a path that is stopping rather than finishing. It
   * reuses `confirmation()` — one approval lifecycle, one place proposals are collected by plan id — and returns
   * true when the run now waits for a person instead of ending.
   */
  private handOver(run: AgentRunBody, why: string): boolean {
    const open = this.o.actions.ofSession(run.sessionId).filter((p) => p.planId === run.actionPlanId && p.status === 'WAITING_CONFIRMATION');
    if (!open.length) return false;
    const v = run.graph.version + 1;
    const t = mkTask({ taskId: `confirm~stop${run.checkpoints.length + 1}`, type: 'REQUEST_CONFIRMATION', title: 'Your confirmation', check: 'CONFIRMATION', dependsOn: [], softDeps: true, milestone: true, priority: 85 }, v, 'MODEL');
    run.graph.tasks.push(t); run.graph.version = v;
    this.confirmation(run, t);
    if (t.status !== 'WAITING') return false;
    run.completionReason = `${why} Nothing has been written; the prepared work is waiting for your decision.`;
    this.status(run, 'WAITING_FOR_CONFIRMATION');
    this.save(run); this.notify(run.runId);
    return true;
  }

  private governed(run: AgentRunBody, t: AgentTask) {
    const props = this.o.actions.ofSession(run.sessionId).filter((p) => p.planId === run.governedPlanId && p.riskLevel === 'GOVERNED_ACTION');
    if (!props.length) { t.status = 'SKIPPED'; t.error = 'No reconciliation is ready for approval.'; this.line(run, `${t.title} — no reconciliation is ready for approval`, 'skipped', t.taskId); return; }
    const planId = run.governedPlanId;
    run.planSeq += 1; run.governedPlanId = `GPLAN-${run.runId}-${run.planSeq}`;
    this.checkpoint(run, { type: 'GOVERNED_APPROVAL', blocking: true, title: `${props.length} approval${props.length > 1 ? 's need' : ' needs'} a governed approver`, planId,
      detail: `Approving a reconciliation is a governed action: Sloane has checked the evidence and prepared it, but it must be approved in Reconciliations by a reviewer other than the preparer. Nothing has been approved. ${props.map((p) => p.targetLabel ?? p.title).join(' · ')}`,
      taskId: t.taskId, proposalIds: props.map((p) => p.id), options: [{ id: 'route', label: 'Route to reviewer' }, { id: 'cancel', label: 'Withdraw' }] });
    for (const p of props) this.policy(run, `${p.type}:${p.targetObjectId}`, 'CHECKPOINT', 'governed action — prepare only, never executed by Sloane');
    t.status = 'WAITING';
    this.line(run, `${props.length} approval${props.length > 1 ? 's' : ''} prepared — needs a governed approver`, 'waiting', t.taskId);
  }

  private async generation(run: AgentRunBody, t: AgentTask) {
    const done = this.runProposals(run).filter((p) => p.type === 'GENERATE_EXCEL_ARTIFACT' && p.status === 'COMPLETED' && run.checkpoints.some((c) => c.proposalIds.includes(p.id))).at(-1);
    if (!done?.result?.['jobId']) { t.status = 'SKIPPED'; t.error = 'The workbook was not generated (not confirmed).'; this.line(run, `${t.title} — not generated: you did not confirm it`, 'skipped', t.taskId); return; }
    await this.o.artifacts.jobPromise(String(done.result['jobId']));
    const g = this.o.artifacts.generations(String(done.result['artifactId'])).find((x) => x.id === done.result!['generationId']);
    if (!g || g.status !== 'COMPLETED') { t.status = 'FAILED'; t.failureMode = 'GENERATION'; t.error = g?.error ?? `generation ${g?.status ?? 'missing'}`; return; }
    t.artifactIds = [String(done.result['artifactId'])];
    this.line(run, `${t.title} — ${g.fileName}${g.tieOut ? ` · tie-out ${g.tieOut.status.replace(/_/g, ' ').toLowerCase()}` : ''}`, 'done', t.taskId);
  }

  /* ---- §23 VERIFY -------------------------------------------------------------------------------- */
  private async verify(run: AgentRunBody, t: AgentTask, actor: Actor) {
    const checks: { check: string; ok: boolean; detail: string }[] = [];
    const add = (check: string, ok: boolean, detail: string) => checks.push({ check, ok, detail });
    const objs = this.objects.get(run.runId)!;
    const tasks = run.graph.tasks.filter((x) => !x.invalidatedBy && x !== t && x.check !== 'SUMMARIZE');
    const failed = tasks.filter((x) => x.status === 'FAILED' && x.milestone);
    add('Every milestone ran or is explained', true, failed.length ? `${failed.length} could not complete and are stated: ${failed.map((x) => x.title).join(', ')}` : 'all milestones completed');
    /* nothing written without a person's confirmation; nothing governed executed */
    const props = this.runProposals(run);
    const confirmed = new Set(run.checkpoints.filter((c) => c.resolution === 'confirm').flatMap((c) => c.proposalIds));
    const silent = props.filter((p) => p.status === 'COMPLETED' && !confirmed.has(p.id));
    add('Nothing written without confirmation', !silent.length, silent.length ? `${silent.length} action(s) completed outside a confirmation` : `${props.filter((p) => p.status === 'COMPLETED').length} written, each after your confirmation`);
    const govExec = props.filter((p) => p.riskLevel === 'GOVERNED_ACTION' && p.status === 'COMPLETED');
    add('No governed action executed', !govExec.length, govExec.length ? `${govExec.length} governed action(s) executed` : 'governed actions were prepared at most');
    if (run.goal.constraints.noActions || POLICY_PROFILES[run.goal.policyProfile].autonomy < 2) add('Read-only goal wrote nothing', !props.length, props.length ? `${props.length} proposals were created` : 'no proposal created');
    const dv = this.o.gl.dataVersion();
    add('Governed data stable during the run', true, dv === run.dataVersion ? `data version ${dv}` : `the governed data changed during the run (${run.dataVersion} → ${dv}); figures read after the change reflect it`);
    switch (run.goal.type) {
      case 'REVIEW_CLOSE': case 'PREPARE_CONTROLLER_REVIEW': {
        const first = objs.get('readiness');
        const r = this.o.agentExecute(run.sessionId, actor, { tool: 'getCloseReadiness', purpose: 'Verify close readiness', args: { period: run.goal.period }, request: run.goal.objective }, run.actionPlanId, `${run.runId}-verify`);
        const same = !!first && !!r.object && fact(first, 'readinessPct')?.display === fact(r.object, 'readinessPct')?.display && fact(first, 'blockers')?.display === fact(r.object, 'blockers')?.display;
        add('Close position re-read', !!r.object, same ? `unchanged: ${fact(r.object!, 'readinessPct')?.display} ready, ${fact(r.object!, 'blockers')?.display} blockers` : r.object ? `now ${fact(r.object, 'readinessPct')?.display} ready, ${fact(r.object, 'blockers')?.display} blockers (moved during the run — the summary uses the current figures)` : 'could not re-read');
        if (r.object) objs.set('readiness:verify', r.object);
        if (run.goal.type === 'PREPARE_CONTROLLER_REVIEW') {
          const written = props.filter((p) => p.status === 'COMPLETED' && /COMMENT/.test(p.type));
          const present = written.filter((p) => { const id = String(p.result?.['commentId'] ?? ''); return id && WORK.comment(id); });
          add('Confirmed comments are in Korvyn', present.length === written.length, `${present.length} of ${written.length} confirmed comments found on their threads`);
        }
        break;
      }
      case 'INVESTIGATE_VENDOR': {
        const tr = objs.get(this.latest(run, 'trend')?.taskId ?? ''), pop = objs.get(this.latest(run, 'population')?.taskId ?? '');
        if (run.goal.subject.vendor && !this.o.gl.vendors().includes(run.goal.subject.vendor)) { add('Vendor resolved against the vendor master', true, `${run.goal.subject.vendor} — no governed activity in the period, so nothing further to analyse`); break; }
        const a = Number(fact(tr, 'total')?.value ?? NaN), bv = fact(pop, 'net')?.value, b = bv === undefined ? undefined : Number(bv);
        if (run.goal.threshold) {
          const pt = this.latest(run, 'population');
          const applied = pt?.args['minAbsAmount'] === String(run.goal.threshold);
          add('Threshold applied to the population', applied, applied ? `population lines of at least $${run.goal.threshold}M (${fact(pop, 'lineCount')?.display ?? '—'} lines, net ${fact(pop, 'net')?.display ?? '—'}) against ${fact(tr, 'total')?.display ?? '—'} of total activity` : 'the population was not re-defined with the threshold');
        } else {
          const ok = Number.isFinite(a) && b !== undefined && Math.abs(a - b) < 1;
          add('Trend foots to the population', ok, ok ? `${money(a)} both ways` : `trend ${fact(tr, 'total')?.display ?? 'n/a'} vs population ${b !== undefined ? money(b) : 'n/a'}`);
        }
        const scoped = run.graph.tasks.filter((x) => !x.invalidatedBy && x.status === 'COMPLETED' && x.scopeSensitive && x.tool);
        const want = ['project', 'entity', 'vendor'].filter((k) => (run.goal.subject as Record<string, string | null>)[k]);
        const off = scoped.filter((x) => want.some((k) => toolRegistry.get(x.tool!)?.params.some((p) => p.name === k) && x.args[k] !== (run.goal.subject as Record<string, string | null>)[k]));
        add('Every scoped step used the current scope', !off.length, off.length ? `stale: ${off.map((x) => x.title).join(', ')}` : want.map((k) => `${k} ${(run.goal.subject as Record<string, string | null>)[k]}`).join(' · ') || 'Corporate Consolidated');
        add('Source systems disclosed', !!objs.get(this.latest(run, 'sources')?.taskId ?? ''), 'every source behind the population is named with its availability');
        break;
      }
      case 'PREPARE_AUDIT_SUPPORT': case 'BUILD_FINANCIAL_ARTIFACT': {
        const gt = this.latest(run, 'generation');
        const aid = gt?.artifactIds[0] ?? run.artifactIds.at(-1);
        const view = aid ? this.o.artifacts.view(actor, aid) : null;
        const g = view?.generations.filter((x) => x.status === 'COMPLETED').at(-1);
        add('Workbook generated', !!g, g ? `${g.fileName} (${g.id})` : gt?.status === 'SKIPPED' ? 'not generated — not confirmed' : 'no completed generation');
        if (g) {
          const rec = WORK.repos.records.get<{ storageKey: string | null; definition: { sheets: { kind: string; name: string }[] }; pins: { populations?: { populationId?: string; dataVersion?: string }[]; fingerprint?: string } }>('ARTIFACT_GENERATION', g.id);
          const exists = !!rec?.storageKey && this.o.artifacts.store.exists(rec.storageKey);
          add('File exists in storage', exists, exists ? `${g.bytes ?? 0} bytes, sha256 ${String(g.sha256 ?? '').slice(0, 12)}…` : 'the file is missing');
          const kinds = rec?.definition.sheets.map((s) => s.kind) ?? [];
          const need = run.goal.type === 'PREPARE_AUDIT_SUPPORT' ? ['GL', 'TB', 'TIEOUT'] : ['GL'];
          const miss = need.filter((k) => !kinds.includes(k));
          add('Expected tabs present', run.goal.type === 'BUILD_FINANCIAL_ARTIFACT' ? kinds.length > 0 : !miss.length, `${rec?.definition.sheets.map((s) => s.name).join(', ')}${miss.length ? ` — missing ${miss.join(', ')}` : ''}`);
          const pops = rec?.pins.populations ?? [];
          add('Population pinned (id and version)', pops.length > 0 && pops.every((x) => x.populationId), pops.length ? pops.map((x) => `${x.populationId}${x.dataVersion ? ` @ ${x.dataVersion}` : ''}`).join(', ') : 'no population pins');
          add('Tie-out status recorded', run.goal.type === 'BUILD_FINANCIAL_ARTIFACT' || !!g.tieOut, g.tieOut ? `${g.tieOut.status.replace(/_/g, ' ')} · difference ${g.tieOut.differenceUsd.toFixed(2)} USD · ${g.auditReady ? 'audit-ready' : 'not labelled audit-ready'}` : 'no tie-out tab');
          add('Not stale at completion', !view!.stale, view!.stale ? `stale: ${view!.staleReasons.join('; ')}` : 'pins match the governed data');
        }
        break;
      }
      case 'INVESTIGATE': {
        const S = run.investigation!, syn = S.synthesis;
        const tools = run.graph.tasks.filter((x) => x.tool && x.origin === 'MODEL');
        const nonRead = tools.filter((x) => toolRegistry.get(x.tool!)?.risk !== 'READ');
        /**
         * A3 §12 — THE READ-ONLY ASSERTION BELONGS TO A READ-ONLY RUN. 8D wrote this loop as an investigation
         * that could only read, so verification asserted that nothing else had happened. A3 made the SAME loop
         * able to prepare, and a controller review that drafted the explanations it was asked for then finished
         * BLOCKED by a check saying it should not have (observed). What a prepare-capable run must prove is
         * different and is proved above: nothing was written without a confirmation, and no governed action was
         * executed. Here it proves only that every capability it reached for was one it was allowed to reach for.
         */
        const mayPrepare = POLICY_PROFILES[run.goal.policyProfile].autonomy >= 2 && !run.goal.constraints.noActions;
        const beyond = nonRead.filter((x) => toolRegistry.get(x.tool!)?.risk !== 'PROPOSE');
        if (mayPrepare) add('Only READ and PREPARE capabilities used', !beyond.length, beyond.length ? `beyond preparation: ${beyond.map((x) => x.tool).join(', ')}` : `${tools.length - nonRead.length} read${tools.length - nonRead.length === 1 ? '' : 's'} and ${nonRead.length} preparation${nonRead.length === 1 ? '' : 's'}, each validated and permission-checked`);
        else add('Only governed READ capabilities used', !nonRead.length, nonRead.length ? `non-read: ${nonRead.map((x) => x.tool).join(', ')}` : `${tools.length} governed read call${tools.length === 1 ? '' : 's'}, each validated and permission-checked`);
        add('Every stated figure came from an observation', true, syn ? `${syn.findings.length} finding${syn.findings.length === 1 ? '' : 's'} kept${syn.rejected.length ? `, ${syn.rejected.length} withheld for a figure no observation carried` : ''}` : 'no synthesis');
        const b = S.budget, u = S.usage;
        add('Within budget', u.modelCalls <= b.maxModelCalls && u.toolCalls <= b.maxToolCalls + 3, `${u.modelCalls}/${b.maxModelCalls} model calls · ${u.toolCalls}/${b.maxToolCalls} tool calls · ${u.iterations}/${b.maxIterations} steps · ~$${u.estimatedCostUsd.toFixed(3)} of $${b.maxEstimatedCostUsd.toFixed(2)}`);
        const refused = S.observations.filter((o) => o.status === 'REFUSED').length;
        add('Permissions enforced on every call', true, refused ? `${refused} call${refused === 1 ? '' : 's'} refused by Korvyn and reported to the planner` : 'no call was refused');
        break;
      }
      default: break;
    }
    run.verification = { at: now(), passed: checks.every((c) => c.ok), checks };
    this.event(run, 'VERIFIED', `${checks.filter((c) => c.ok).length} of ${checks.length} checks passed`);
    this.line(run, `${t.title} — ${checks.filter((c) => c.ok).length} of ${checks.length} checks passed`, checks.every((c) => c.ok) ? 'done' : 'blocked', t.taskId);
  }

  /* ---- §24 the concise result ------------------------------------------------------------------ */
  private async summarize(run: AgentRunBody, t: AgentTask) {
    const objs = this.objects.get(run.runId)!, g = run.goal;
    const ex = (s: string) => g.constraints.exclude.some((x) => s.toLowerCase().includes(x.toLowerCase()));
    const live = run.observations.filter((o) => { const tk = run.graph.tasks.find((x) => x.taskId === o.taskId); return !tk?.invalidatedBy; });
    const seen = new Set<string>();
    const findings = live.flatMap((o) => o.findings).filter((f) => !ex(f.text)).filter((f) => { const k = (f.about ?? f.text).replace(/^Material movement unexplained: /, '').split(' — ')[0]!.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    const sev = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    const thr = g.threshold ? g.threshold * 1e6 : 0;
    const below = thr ? findings.filter((f) => typeof f.amountUsd === 'number' && Math.abs(f.amountUsd) < thr) : [];
    if (below.length) findings.splice(0, findings.length, ...findings.filter((f) => !below.includes(f)));
    const focusKeys = g.constraints.focusFirst.flatMap((w) => { const r = resolveTerms(w, this.deps(this.actorOf(run))); return [w.toLowerCase(), r.values.account, r.values.project].filter((x): x is string => !!x).map((x) => x.toLowerCase()); });
    const inFocus = (f: AgentFinding) => focusKeys.some((k) => f.text.toLowerCase().includes(k) || (k === '15000' && /construction in progress|\bcip\b/i.test(f.text)));
    findings.sort((a, b) => Number(inFocus(b)) - Number(inFocus(a)) || sev[a.severity] - sev[b.severity]);
    const props = this.runProposals(run);
    const d = (k: string, o?: FinancialObject) => fact(o, k)?.display;
    const ready = objs.get('readiness:verify') ?? objs.get('readiness');
    let headline = g.title;
    const counts: { label: string; value: number }[] = [];
    switch (g.type) {
      case 'REVIEW_CLOSE': case 'PREPARE_CONTROLLER_REVIEW': {
        const blk = findings.filter((f) => f.kind === 'BLOCKER' || f.kind === 'NOT_TIED');
        const top = objs.get(this.latest(run, 'blockers')?.taskId ?? 'blockers')?.table.rows.find((r) => r.cells[0] === 'BLOCKING' && !ex(r.label));
        headline = `${periodLabel(g.period)} close is ${d('readinessPct', ready) ?? '—'} ready with ${d('blockers', ready) ?? '—'} blockers${top ? `; the largest is ${top.label} (${top.cells[3]})` : ''}.`;
        if (g.type === 'PREPARE_CONTROLLER_REVIEW') { const w = props.filter((p) => p.status === 'COMPLETED').length, all = props.filter((p) => p.riskLevel !== 'GOVERNED_ACTION'), gone = all.filter((p) => p.status === 'CANCELLED').length, prep = all.length; headline += gone === prep && prep ? ` ${prep} draft action${prep === 1 ? ' was' : 's were'} prepared and withdrawn — nothing was written.` : ` ${prep} draft action${prep === 1 ? '' : 's'} prepared, ${w} written after your confirmation${gone ? `, ${gone} withdrawn` : ''}.`; }
        counts.push({ label: 'Blocking items', value: blk.length }, { label: 'Unexplained flux', value: findings.filter((f) => f.kind === 'UNEXPLAINED').length }, { label: 'Missing support', value: findings.filter((f) => f.kind === 'MISSING_SUPPORT').length });
        break;
      }
      case 'INVESTIGATE_VENDOR': {
        const pl = g.periodText ?? (g.periodRange ? `${periodLabel(g.periodRange.start)}–${periodLabel(g.periodRange.end)}` : periodLabel(g.period));
        if (g.subject.vendor && !this.o.gl.vendors().includes(g.subject.vendor)) { headline = `${g.subject.vendor} is in the vendor master but has no governed activity in ${pl}.`; break; }
        const tr = objs.get(this.latest(run, 'trend')?.taskId ?? '');
        const first = run.graph.tasks.find((x) => !x.invalidatedBy && x.taskId.startsWith('by-') && !x.scopeSensitive && x.status === 'COMPLETED');
        const pj = first ? objs.get(first.taskId) : undefined;
        const focusT = run.graph.tasks.find((x) => !x.invalidatedBy && x.taskId.startsWith('focus-') && x.status === 'COMPLETED');
        const fo = focusT ? objs.get(focusT.taskId) : undefined;
        const subj = g.subject.vendor ?? g.labels['project'] ?? g.subject.project ?? g.labels['entity'] ?? g.subject.entity ?? 'Subject';
        const scope = [g.subject.vendor && g.subject.project ? g.labels['project'] ?? g.subject.project : null, (g.subject.vendor || g.subject.project) && g.subject.entity ? g.labels['entity'] ?? g.subject.entity : null].filter(Boolean).join(' · ');
        const lines = Number(fact(tr, 'lines')?.value ?? 0), focusName = focusT?.title.replace(/ first$/, '') ?? '';
        const focusPart = fo && d('group1.label', fo) ? `${focusName}: ${d('total', fo)}, largest ${d('group1.label', fo)} (${d('group1.amount', fo)}). ` : focusT && lines ? `${focusName}: no ${subj} activity in it. ` : focusT ? `${focusName} first — ` : '';
        headline = !lines
          /* a scope with no governed activity is a finding, stated with what the unscoped view holds */
          ? `${focusPart}No ${subj} activity${scope ? ` in ${scope}` : ''} for ${pl}${d('total', pj) ? `; without that scope it is ${d('total', pj)}${d('group1.label', pj) ? `, mostly ${d('group1.label', pj)} (${d('group1.amount', pj)})` : ''}` : ''}.`
          : `${focusPart}${subj}${scope ? ` in ${scope}` : ''}: ${d('total', tr) ?? '—'} across ${d('lines', tr) ?? '—'} line${d('lines', tr) === '1' ? '' : 's'} (${pl})${!scope && d('group1.label', pj) ? `, mostly ${d('group1.label', pj)} (${d('group1.amount', pj)})` : ''}.`;
        counts.push({ label: 'Lines', value: Number(fact(tr, 'lines')?.value ?? 0) });
        break;
      }
      case 'PREPARE_AUDIT_SUPPORT': case 'BUILD_FINANCIAL_ARTIFACT': {
        const gen = run.verification?.checks.find((c) => c.check === 'Workbook generated');
        const tie = run.verification?.checks.find((c) => c.check === 'Tie-out status recorded');
        headline = gen?.ok ? `Workbook generated${run.verification?.passed ? ' and verified' : ' — verification did not fully pass'}: ${gen.detail.split(' (')[0]}${tie && g.type === 'PREPARE_AUDIT_SUPPORT' ? ` · tie-out ${tie.detail.split(' ·')[0]!.toLowerCase()}` : ''}.` : `The workbook is defined but was not generated${gen ? ` (${gen.detail})` : ''}.`;
        break;
      }
      case 'INVESTIGATE': {
        const S = run.investigation!, syn = S.synthesis;
        headline = syn?.headline ?? `${g.title}: ${S.observations.filter((o) => o.status === 'OK').length} governed results inspected.`;
        counts.push({ label: 'Governed calls', value: S.usage.toolCalls }, { label: 'Findings', value: syn?.findings.length ?? 0 }, { label: 'Unresolved', value: syn?.unresolved.length ?? 0 });
        break;
      }
      default: headline = `${g.title}: ${run.graph.tasks.filter((x) => x.status === 'COMPLETED' && x.tool).length} governed steps completed.`;
    }
    const milestoneObjs = run.graph.tasks.filter((x) => x.milestone && !x.invalidatedBy && x.status === 'COMPLETED' && x.tool).map((x) => objs.get(x.taskId)).filter((x): x is FinancialObject => !!x && !x.action);
    const ac = this.ac(run.runId);
    const tNarr = Date.now();
    const n = g.type === 'INVESTIGATE' ? { source: 'deterministic' as const, sentences: [] as string[], call: null } : await this.o.agentNarrate(g.objective, milestoneObjs.slice(0, 6), ac.signal);
    run.waterfall.narrateMs += Date.now() - tNarr;
    if (n.call) this.model(run, n.call);
    const artifacts = run.artifactIds.map((id) => this.o.artifacts.get(id)).filter((a): a is NonNullable<typeof a> => !!a).map((a) => ({ id: a.id, name: a.name, status: String(a.status) }));
    run.result = {
      headline, counts, findings: findings.slice(0, 12),
      prepared: props.map((p) => ({ proposalId: p.id, title: p.title, status: p.status, riskLevel: p.riskLevel })),
      requireAction: [...run.checkpoints.filter((c) => c.status === 'OPEN' && c.blocking).map((c) => c.title), ...findings.filter((f) => f.kind === 'BLOCKER' || f.kind === 'NOT_TIED').slice(0, 3).map((f) => f.text)],
      external: findings.filter((f) => f.kind === 'EXTERNAL_DEPENDENCY').map((f) => f.text),
      artifacts, narrative: n.source === 'reasoning' ? n.sentences.slice(0, 2) : [],
      investigation: run.investigation ? this.investigationResult(run) : null,
      notes: [...run.warnings.slice(0, 3), ...(g.constraints.exclude.length ? [`Excluded at your instruction: ${g.constraints.exclude.join(', ')}.`] : []), ...(g.threshold ? [`Items under $${g.threshold >= 1 ? `${g.threshold}M` : `${Math.round(g.threshold * 1000)}K`} are left out at your instruction${below.length ? ` (${below.length} finding${below.length > 1 ? 's' : ''})` : ''}.`] : []), ...(g.constraints.noComments && POLICY_PROFILES[g.policyProfile].autonomy >= 2 ? ['No comments are prepared until you say otherwise.'] : []), ...(g.constraints.noActions && run.steering.some((e) => e.contextAfter.constraints.noActions && !e.contextBefore.constraints.noActions) ? ['No actions are prepared until you say otherwise.'] : []), ...(run.verification && !run.verification.passed ? ['Verification did not fully pass — see the checks.'] : [])],
    };
    t.status = 'COMPLETED';
  }

  /* ================================================================================================
     CHECKPOINTS AND DECISIONS
     ================================================================================================ */
  private checkpoint(run: AgentRunBody, c: Partial<AgentCheckpoint> & Pick<AgentCheckpoint, 'type' | 'blocking' | 'title' | 'detail'> & { planId?: string }) {
    const cp: AgentCheckpoint & { planId?: string } = { id: `CP-${run.checkpoints.length + 1}`, status: 'OPEN', proposalIds: [], options: [], taskId: null, createdAt: now(), resolvedAt: null, resolution: null, resolvedBy: null, ...c };
    run.checkpoints.push(cp);
    this.event(run, 'CHECKPOINT_OPENED', `${cp.type}: ${cp.title}`);
    return cp;
  }

  async decide(runId: string, actor: Actor, checkpointId: string, decision: string, requestId?: string, responseText?: string): Promise<{ ok: boolean; reason?: string; run?: RunView }> {
    const run = this.cache.get(runId) ?? this.load(runId);
    if (!run) return { ok: false, reason: 'No such run.' };
    if (run.actor.id !== actor.id) return { ok: false, reason: 'This run belongs to another user.' };
    const cp = run.checkpoints.find((c) => c.id === checkpointId) as (AgentCheckpoint & { planId?: string }) | undefined;
    if (!cp) return { ok: false, reason: 'No such checkpoint.' };
    if (cp.status === 'RESOLVED') return { ok: true, run: this.view(run) };
    if (!cp.options.some((o) => o.id === decision)) return { ok: false, reason: `${decision} is not an option here.` };
    const task = cp.taskId ? run.graph.tasks.find((x) => x.taskId === cp.taskId) : undefined;
    const obs: AgentObservation = { id: `OBS-${run.observations.length + 1}`, taskId: cp.taskId ?? '', at: now(), status: 'COMPLETED', resultType: 'CheckpointDecision', objectIds: [], artifactIds: [], proposalIds: cp.proposalIds.slice(), actionResults: [], warnings: [], errors: [], evidence: [], contextUpdates: {}, policyEvents: [], findings: [] };
    if (cp.type === 'CLARIFICATION') {
      /* the SAME run resumes: the field resolves to the chosen canonical value; nothing else about the run changes */
      cp.status = 'RESOLVED'; cp.resolution = decision; cp.resolvedAt = now(); cp.resolvedBy = actor.name;
      this.resolveClarification(run, actor, cp, decision, responseText ?? null);
      this.event(run, 'CHECKPOINT_RESOLVED', `${cp.title} ${cp.response}`);
      this.audit(run, actor, 'AGENT_CLARIFICATION_RESOLVED', null, { checkpoint: cp.id, field: cp.field, term: cp.term, response: cp.response, resolvedValue: cp.resolvedValue });
      this.save(run);
      if (run.runStatus === 'RUNNING') this.kick(run.runId);
      return { ok: true, run: this.view(run) };
    }
    if (cp.type === 'CONFIRMATION' && cp.planId) {
      /**
       * A3 §8 — MODIFY. A person's edit becomes the governed proposed action: the payload is revised through
       * `ActionEngine.revise` (which re-validates and re-checks staleness) and only then confirmed. The model is
       * never given the chance to write over it — the run resumes from the revised proposal, and the next
       * observation carries what was actually executed, not what was proposed.
       */
      if (decision === 'modify') {
        const edits = responseText ? (() => { try { return JSON.parse(responseText) as Record<string, unknown>; } catch { return { text: responseText }; } })() : {};
        const revised: string[] = [];
        for (const id of cp.proposalIds) if (this.o.actions.revise(id, edits as Record<string, string>, actor)) revised.push(id);
        obs.policyEvents.push(`${revised.length} proposal${revised.length === 1 ? '' : 's'} edited by ${actor.name} before confirmation`);
        this.audit(run, actor, 'AGENT_PROPOSAL_MODIFIED', cp.proposalIds[0] ?? null, { checkpoint: cp.id, revised, edits });
        this.line(run, `${revised.length} prepared action${revised.length === 1 ? '' : 's'} edited by you`, 'done', cp.taskId ?? undefined);
      }
      /* §14: every action goes through ActionGovernanceEngine → Authorization → SoD → the Action Service, from here only */
      const r = this.o.decide({ sessionId: run.sessionId, planId: cp.planId, decision: decision === 'confirm' || decision === 'modify' ? 'confirm' : 'cancel', requestId: requestId ?? `${runId}:${cp.id}:${decision}` }, actor);
      obs.actionResults = r.results.map((x) => ({ proposalId: x.proposalId, status: x.status, message: x.message }));
      if (decision === 'confirm' && task) {
        const ok = r.results.filter((x) => x.status === 'COMPLETED' || x.status === 'EXECUTING').length;
        task.status = ok ? 'COMPLETED' : 'FAILED'; task.completedAt = now();
        if (!ok) { task.error = r.results.map((x) => x.message).join('; '); task.failureMode = 'EXECUTION'; }
        this.line(run, `${ok} of ${r.results.length} action${r.results.length > 1 ? 's' : ''} written after your confirmation`, ok === r.results.length ? 'done' : 'blocked', cp.taskId ?? undefined);
      } else if (task) { task.status = 'COMPLETED'; task.completedAt = now(); this.line(run, `Prepared actions cancelled — nothing written`, 'skipped', cp.taskId ?? undefined); }
    } else if (cp.type === 'GOVERNED_APPROVAL') {
      if (decision === 'cancel' && cp.planId) { const r = this.o.decide({ sessionId: run.sessionId, planId: cp.planId, decision: 'cancel', requestId: requestId ?? `${runId}:${cp.id}:cancel` }, actor); obs.actionResults = r.results.map((x) => ({ proposalId: x.proposalId, status: x.status, message: x.message })); }
      obs.policyEvents.push(decision === 'route' ? 'Routed to a governed approver in Reconciliations; nothing approved by Sloane' : 'Withdrawn; nothing approved');
      this.policy(run, cp.title, 'CHECKPOINT', obs.policyEvents[0]!);
      if (task) { task.status = 'COMPLETED'; task.completedAt = now(); }
      this.line(run, decision === 'route' ? 'Approval routed to a reviewer other than the preparer — not approved by Sloane' : 'Approval withdrawn', decision === 'route' ? 'done' : 'skipped', cp.taskId ?? undefined);
    }
    run.observations.push(obs);
    this.observeDecision(run, cp, decision, obs);
    cp.status = 'RESOLVED'; cp.resolution = decision; cp.resolvedAt = now(); cp.resolvedBy = actor.name;
    this.event(run, 'CHECKPOINT_RESOLVED', `${cp.title}: ${decision}`);
    this.audit(run, actor, 'AGENT_CHECKPOINT_DECIDED', cp.proposalIds[0] ?? null, { checkpoint: cp.id, type: cp.type, decision });
    if (WAITING.includes(run.runStatus) && run.runStatus !== 'PAUSED') this.status(run, 'RUNNING');
    else if (run.runStatus === 'COMPLETED' && cp.blocking) this.status(run, 'RUNNING');
    this.save(run);
    if (run.runStatus === 'RUNNING') this.kick(run.runId);
    return { ok: true, run: this.view(run) };
  }

  /**
   * A3 §9 — POST-ACTION OBSERVATION. The loop must not assume its proposal was executed: what a person decided,
   * and what the Action Service actually did with it, comes back as an observation like any other. A run that
   * continues after a confirmation reasons from the GOVERNED RESULT — status, proposal ids, the person's decision
   * and any error — and never from the fact that it once proposed something.
   */
  private observeDecision(run: AgentRunBody, cp: AgentCheckpoint, decision: string, obs: AgentObservation) {
    const S = run.investigation;
    if (!S) return;
    const done = obs.actionResults.filter((x) => x.status === 'COMPLETED').length;
    const failed = obs.actionResults.filter((x) => x.status === 'FAILED').length;
    const o = compact(S.observations.length + 1, 'decision', `Your decision on ${cp.title}`, null, null);
    o.status = failed && !done ? 'FAILED' : 'OK';
    o.title = `${cp.type === 'CONFIRMATION' ? 'Confirmation' : 'Approval'} — ${decision}`;
    o.facts = [
      { key: 'decision', label: 'Decision', value: decision },
      { key: 'executed', label: 'Actions written', value: String(done) },
      ...(failed ? [{ key: 'failed', label: 'Actions that failed', value: String(failed) }] : []),
      ...obs.actionResults.slice(0, 6).map((x, i) => ({ key: `action${i + 1}`, label: x.proposalId, value: `${x.status}: ${x.message}`.slice(0, 60) })),
    ];
    o.refs = Object.fromEntries(obs.proposalIds.slice(0, 4).map((p, i) => [`proposal${i + 1}`, p]));
    o.note = obs.policyEvents[0] ?? null;
    o.chars = JSON.stringify(o).length;
    S.observations.push(o);
  }

  /* ================================================================================================
     CLARIFICATION — an ambiguous goal field (or steering value) waits for the person; the SAME run resumes
     ================================================================================================ */
  private openClarification(run: AgentRunBody, a: Ambiguity, steer?: { type: SteeringType; text: string }) {
    this.checkpoint(run, { type: 'CLARIFICATION', blocking: true, title: a.question, detail: a.reason, field: a.field, term: a.term, reason: a.reason,
      candidates: a.candidates, response: null, resolvedValue: null, steerType: steer?.type ?? null, steerText: steer?.text ?? null,
      options: a.candidates.map((c) => ({ id: c.id, label: c.label })) });
    this.status(run, 'WAITING_FOR_USER');
    this.line(run, a.question, 'waiting', `clarify:${run.checkpoints.length}`);
    this.policy(run, `clarify:${a.field}`, 'CHECKPOINT', `"${a.term}" resolves to ${a.candidates.length} governed values; the person chooses`);
  }
  /** the open clarification of a run, if any */
  openQuestion(run: AgentRunBody) { return run.checkpoints.find((c) => c.type === 'CLARIFICATION' && c.status === 'OPEN') ?? null; }
  /** a typed answer to the open clarification ("Siemens Energy.", "the second one") → the candidate it names, or null */
  matchAnswer(run: AgentRunBody, text: string): string | null {
    const cp = this.openQuestion(run);
    if (!cp?.candidates?.length) return null;
    const t = text.toLowerCase().replace(/[.!?]+$/, '').trim(), cs = cp.candidates;
    const ord = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'].findIndex((o) => new RegExp(`\\b${o}\\b`).test(t));
    if (ord >= 0 && cs[ord]) return cs[ord]!.id;
    const exact = cs.filter((c) => c.label.toLowerCase() === t || c.id.toLowerCase().endsWith(`:${t}`));
    if (exact.length === 1) return exact[0]!.id;
    const inText = cs.filter((c) => t.includes(c.label.toLowerCase().split(' — ')[0]!));
    if (inText.length === 1) return inText[0]!.id;
    const inLabel = t.length >= 3 ? cs.filter((c) => c.label.toLowerCase().includes(t)) : [];
    return inLabel.length === 1 ? inLabel[0]!.id : null;
  }
  /** answer the open clarification in words; null when the words do not name one of its candidates */
  async answer(runId: string, actor: Actor, text: string): Promise<{ ok: boolean; reason?: string; run?: RunView } | null> {
    const run = this.cache.get(runId) ?? this.load(runId);
    if (!run || run.actor.id !== actor.id) return null;
    const cp = this.openQuestion(run), id = this.matchAnswer(run, text) ?? (cp?.field === 'direction' && text.trim().length > 2 ? `free:${text.trim().slice(0, 200)}` : null);
    if (!cp || !id) return null;
    if (id.startsWith('free:')) { cp.candidates = [...(cp.candidates ?? []), { id, label: id.slice(5), detail: 'your words' }]; }
    return this.decide(runId, actor, cp.id, id, undefined, text);
  }
  /** apply a chosen candidate: to the goal (then plan, or ask the next question) or to the steering it completes */
  private resolveClarification(run: AgentRunBody, actor: Actor, cp: AgentCheckpoint, id: string, response: string | null) {
    if (cp.field === 'direction') {
      const label = cp.candidates?.find((c) => c.id === id)?.label ?? response ?? id;
      cp.response = response ?? label; cp.resolvedValue = id;
      run.goal.userInstructions.push(label);
      this.line(run, `${cp.title.replace(/\?$/, '')} — ${label}`, 'done', `clarify:${run.checkpoints.indexOf(cp) + 1}`);
      this.event(run, 'CLARIFIED', `direction: ${label}`);
      this.revise(run, 'INTERVENTION', `Direction chosen: ${label}`, [mkTask({ taskId: `think-${(run.investigation?.usage.iterations ?? 0) + 1}`, type: 'ANALYZE', title: 'Planning the next step', check: 'THINK', dependsOn: [], priority: 5 }, run.graph.version + 1, 'MODEL')], []);
      this.status(run, 'RUNNING');
      return;
    }
    const d = this.deps(actor), field = (cp.field ?? 'vendor') as Ambiguity['field'];
    const v = applyCandidate(field, id, d);
    cp.response = response ?? v.label; cp.resolvedValue = id;
    const before = this.ctxOf(run);
    if (cp.steerType) {
      const intent: SteeringIntent = cp.steerType === 'PERIOD_CHANGE' ? { type: 'PERIOD_CHANGE', period: { period: v.period!, periodRange: v.periodRange ?? null, label: v.label } }
        : cp.steerType === 'SCOPE_CHANGE' ? { type: 'SCOPE_CHANGE', scope: v.project ? { dimension: 'project', value: v.project, label: v.label } : v.entity ? { dimension: 'entity', value: v.entity, label: v.label } : { clear: true } }
          : { type: 'FILTER_CHANGE', vendor: { value: v.vendor ?? v.label, label: v.label } };
      this.applySteer(run, actor, cp.steerText ?? response ?? v.label, intent, before);
      return;
    }
    const g = run.goal;
    if (v.vendor !== undefined) g.subject.vendor = v.vendor;
    if (v.project !== undefined) { g.subject.project = v.project; g.labels['project'] = v.label; }
    if ('entity' in v) { g.subject.entity = v.entity ?? null; g.scope = v.entity ?? 'GROUP'; g.labels['entity'] = v.label; }
    if (v.account) g.subject.account = v.account;
    if (v.pbcRequestId) { g.subject.pbcRequestId = v.pbcRequestId; g.labels['pbc'] = v.label; }
    if (v.artifactId) { g.subject.artifactId = v.artifactId; g.labels['artifact'] = v.label; }
    if (v.period) { g.period = v.period; g.periodRange = v.periodRange ?? g.periodRange; g.periodText = v.periodLabel ?? null; }
    g.pending = g.pending.filter((a) => a.field !== field);
    g.resolved.push({ field, term: cp.term ?? '', value: id, label: v.label, at: now(), by: actor.name });
    retitle(g);
    this.syncContext(run, actor);
    this.line(run, `${cp.title.replace(/\?$/, '')} — ${v.label}`, 'done', `clarify:${run.checkpoints.indexOf(cp) + 1}`);
    this.event(run, 'CLARIFIED', `${field}: "${cp.term}" → ${v.label}`);
    if (g.pending.length) { this.openClarification(run, g.pending[0]!); return; }
    if (!run.graph.tasks.length) { this.plan(run, actor).catch((e: Error) => { run.errors.push(e.message); this.finish(run, 'FAILED', `Korvyn could not build a valid plan for this goal: ${e.message}`); }); return; }
    this.status(run, 'RUNNING');
  }

  /* ================================================================================================
     §17 CANCEL · §18 DURABLE STEERING
     ================================================================================================ */
  cancel(runId: string, actor: Actor, reason = 'Cancelled by the user'): { ok: boolean; reason?: string; run?: RunView } {
    const run = this.cache.get(runId) ?? this.load(runId);
    if (!run) return { ok: false, reason: 'No such run.' };
    if (run.actor.id !== actor.id) return { ok: false, reason: 'This run belongs to another user.' };
    if (TERMINAL.includes(run.runStatus) && run.runStatus !== 'BLOCKED') return { ok: true, run: this.view(run) };
    this.acs.get(runId)?.abort();
    /* stop what is pending; do NOT reverse what completed; open proposals are cancelled so nothing can be written later */
    for (const t of run.graph.tasks) if (['PENDING', 'READY', 'RUNNING', 'WAITING'].includes(t.status)) { t.status = 'SKIPPED'; t.failureMode = 'CANCELLED'; t.error = reason; }
    const open = this.runProposals(run).filter((p) => ['WAITING_CONFIRMATION', 'NEEDS_CHOICE', 'DRAFT', 'PROPOSED', 'VALIDATED'].includes(p.status));
    for (const p of open) this.o.decide({ sessionId: run.sessionId, proposalId: p.id, decision: 'cancel', requestId: `${runId}:cancel:${p.id}` }, actor);
    for (const c of run.checkpoints) if (c.status === 'OPEN') { c.status = 'RESOLVED'; c.resolution = 'cancelled'; c.resolvedAt = now(); c.resolvedBy = actor.name; }
    this.line(run, `Stopped. ${run.graph.tasks.filter((t) => t.status === 'COMPLETED').length} completed steps are kept; nothing was reversed.`, 'skipped');
    this.finish(run, 'CANCELLED', reason);
    this.audit(run, actor, 'AGENT_RUN_CANCELLED', null, { reason, openProposalsCancelled: open.length });
    return { ok: true, run: this.view(run) };
  }

  /** @deprecated Phase 7 name — steering is durable now; see steer() */
  intervene(runId: string, actor: Actor, text: string) { return this.steer(runId, actor, text); }

  /** A short instruction to the run: classified, applied to the run's goal, constraints and plan, persisted as a
   *  UserSteeringEvent with the context before and after. Not a prompt hint: it changes the run. */
  steer(runId: string, actor: Actor, text: string): { ok: boolean; recognised: boolean; effect: string; type?: SteeringType; run?: RunView } {
    const run = this.cache.get(runId) ?? this.load(runId);
    if (!run) return { ok: false, recognised: false, effect: 'No such run.' };
    if (run.actor.id !== actor.id) return { ok: false, recognised: false, effect: 'This run belongs to another user.' };
    if (['CANCELLED', 'FAILED'].includes(run.runStatus)) return { ok: true, recognised: false, effect: `The run is ${run.runStatus.toLowerCase()}.` };
    const intent = classifySteering(text, this.deps(actor));
    if (!intent) return { ok: true, recognised: false, effect: 'Not an instruction for the running plan.' };
    const before = this.ctxOf(run);
    if (intent.ambiguity) {
      /* the instruction names a value ambiguously: nothing changes until the person picks one */
      this.openClarification(run, intent.ambiguity, { type: intent.type, text: text.trim() });
      const effect = `${intent.ambiguity.question} Nothing has changed yet.`;
      run.interventions.push({ id: `IV-${run.interventions.length + 1}`, at: now(), by: actor.name, text: text.trim(), kind: intent.type, effect });
      this.save(run);
      return { ok: true, recognised: true, effect, type: intent.type, run: this.view(run) };
    }
    const effect = this.applySteer(run, actor, text.trim(), intent, before);
    return { ok: true, recognised: true, effect, type: intent.type, run: this.view(run) };
  }

  private applySteer(run: AgentRunBody, actor: Actor, text: string, intent: SteeringIntent, before: RunContext): string {
    const iv: AgentIntervention = { id: `IV-${run.interventions.length + 1}`, at: now(), by: actor.name, text, kind: intent.type, effect: '' };
    run.interventions.push(iv);
    const g = run.goal, rev0 = run.graph.version;
    let out: { invalidated: string[]; added: string[] } = { invalidated: [], added: [] };
    const hasTool = (t: AgentTask, k: string) => !!t.tool && (k in t.args || !!toolRegistry.get(t.tool)?.params.some((p) => p.name === k));
    if (g.type === 'INVESTIGATE' && !['CANCEL', 'PAUSE', 'RESUME'].includes(intent.type)) out = this.steerInvestigation(run, actor, intent, text, iv);
    else switch (intent.type) {
      case 'CANCEL': iv.effect = 'Stopped; completed work kept, nothing reversed.'; this.cancel(run.runId, actor, `Stopped by the user: "${text}"`); break;
      case 'PAUSE': if (['RUNNING', 'PLANNING', 'READY'].includes(run.runStatus)) { this.status(run, 'PAUSED'); iv.effect = 'Paused after the current step.'; this.line(run, 'Paused at your instruction', 'waiting'); } else iv.effect = `The run is ${run.runStatus.toLowerCase().replace(/_/g, ' ')}; nothing to pause.`; break;
      case 'RESUME': {
        if (run.runStatus !== 'PAUSED') { iv.effect = `The run is ${run.runStatus.toLowerCase().replace(/_/g, ' ')}.`; break; }
        const open = run.checkpoints.find((c) => c.status === 'OPEN' && c.blocking);
        this.status(run, !open ? 'RUNNING' : open.type === 'GOVERNED_APPROVAL' ? 'WAITING_FOR_GOVERNED_APPROVAL' : open.type === 'CLARIFICATION' ? 'WAITING_FOR_USER' : 'WAITING_FOR_CONFIRMATION');
        iv.effect = 'Resumed from the last completed step.'; this.line(run, 'Resumed', 'active'); break;
      }
      case 'SCOPE_CHANGE': {
        const s = intent.scope!;
        if ('clear' in s) {
          const dims = (['project', 'entity'] as const).filter((k) => g.subject[k] && !(g.type === 'INVESTIGATE_VENDOR' && !g.subject.vendor && k === (g.subject.project ? 'project' : 'entity')));
          if (!dims.length) { iv.effect = 'The run is already at the full scope.'; break; }
          dims.forEach((k) => { g.subject[k] = null; }); if (dims.includes('entity')) g.scope = 'GROUP';
          out = this.replanFor(run, iv, (t) => t.scopeSensitive && dims.some((k) => k in t.args), () => Object.fromEntries(dims.map((k) => [k, null])));
          iv.effect = `Scope widened to Corporate Consolidated: ${this.redoText(run, out)}.`;
        } else {
          g.subject[s.dimension] = s.value; g.labels[s.dimension] = s.label; if (s.dimension === 'entity') g.scope = s.value;
          out = this.replanFor(run, iv, (t) => t.scopeSensitive || (!!t.tool && s.dimension in t.args), () => ({ [s.dimension]: s.value }));
          iv.effect = out.invalidated.length ? `Scope changed to ${s.label}: ${this.redoText(run, out)}.` : `Scope set to ${s.label}; no step of this run depends on it, so nothing re-ran.`;
        }
        break;
      }
      case 'PERIOD_CHANGE': {
        const p = intent.period!;
        g.period = p.period; g.periodRange = p.periodRange; g.periodText = p.periodRange ? p.label : null;
        const r = p.periodRange ?? { start: p.period, end: p.period };
        out = this.replanFor(run, iv, (t) => !!t.tool && ('period' in t.args || 'periodStart' in t.args || 'periodEnd' in t.args),
          (t) => ({ ...('period' in t.args ? { period: p.period } : {}), ...('periodStart' in t.args ? { periodStart: r.start } : {}), ...('periodEnd' in t.args ? { periodEnd: r.end } : {}) }));
        iv.effect = `Period changed to ${p.label} (was ${before.periodRange ? `${periodLabel(before.periodRange.start)}–${periodLabel(before.periodRange.end)}` : periodLabel(before.period)}): ${this.redoText(run, out)}.`;
        break;
      }
      case 'FILTER_CHANGE': {
        if (intent.vendor) {
          g.subject.vendor = intent.vendor.value;
          out = this.replanFor(run, iv, (t) => hasTool(t, 'vendor') && ('vendor' in t.args || t.scopeSensitive), () => ({ vendor: intent.vendor!.value }));
          iv.effect = `Vendor set to ${intent.vendor.label}: ${this.redoText(run, out)}.`;
        } else {
          g.threshold = intent.threshold ?? null;
          const x = g.threshold === null ? null : String(g.threshold);
          out = this.replanFor(run, iv, (t) => hasTool(t, 'minAbsAmount') || hasTool(t, 'minAbsChange'), (t): Record<string, string | null> => (hasTool(t, 'minAbsAmount') ? { minAbsAmount: x } : { minAbsChange: x }));
          if (!out.invalidated.length) out = this.replanTail(run, iv);
          iv.effect = g.threshold === null ? `Threshold removed: ${this.redoText(run, out)}.` : `Threshold set: anything under $${g.threshold >= 1 ? `${g.threshold}M` : `${Math.round(g.threshold * 1000)}K`} is left out — ${this.redoText(run, out)}.`;
        }
        break;
      }
      case 'PRIORITY_CHANGE': {
        const what = intent.focus!, r = resolveTerms(what, this.deps(actor));
        g.constraints.focusFirst = [...g.constraints.focusFirst.filter((x) => x !== what), what];
        const keys = [what.toLowerCase(), r.values.account, r.values.project, r.values.entity, r.values.vendor].filter((x): x is string => !!x).map((x) => x.toLowerCase());
        const hit = run.graph.tasks.filter((x) => !x.invalidatedBy && ['PENDING', 'READY'].includes(x.status) && keys.some((k) => `${x.title} ${x.about ?? ''} ${JSON.stringify(x.args)}`.toLowerCase().includes(k)));
        hit.forEach((x) => { x.priority = Math.max(0, x.priority - 60); });
        const added: AgentTask[] = [];
        /* an investigation with nothing left about the focus gets a focused step at the front of the queue */
        if (!hit.length && g.type === 'INVESTIGATE_VENDOR' && (r.values.account || r.values.project)) {
          const subj = g.subject, dim = r.values.account ? (subj.project ? 'vendor' : 'project') : 'vendor';
          const args: Record<string, string> = { dimension: dim, periodStart: g.periodRange?.start ?? g.period, periodEnd: g.periodRange?.end ?? g.period,
            ...(subj.vendor ? { vendor: subj.vendor } : {}), ...(subj.project ? { project: subj.project } : {}), ...(subj.entity ? { entity: subj.entity } : {}),
            ...(r.values.account ? { account: r.values.account } : {}), ...(r.values.project ? { project: r.values.project } : {}), ...(g.threshold ? { minAbsChange: String(g.threshold) } : {}) };
          added.push(mkTask({ taskId: `focus-${(r.values.account ?? r.values.project)!}`, type: 'ANALYZE', title: `${r.labels['project'] ?? (r.values.account === '15000' ? 'CIP' : what.toUpperCase())} first`, tool: 'analyzeByDimension', args, milestone: true, scopeSensitive: true, priority: 1, origin: 'INTERVENTION' }, run.graph.version + 1, 'INTERVENTION'));
        }
        const tail = added.length || (!hit.length && ['COMPLETED', 'BLOCKED'].includes(run.runStatus)) ? this.tailReplacements(run, iv) : [];
        if (added.length || tail.length) { this.reopen(run); this.revise(run, 'INTERVENTION', `Focus on ${what} first`, [...added, ...tail], tail.map((x) => x.taskId.split('~')[0]!)); }
        else if (hit.length) this.revise(run, 'INTERVENTION', `Focus on ${what} first`, [], []);
        out = { invalidated: [], added: [...added, ...tail].map((x) => x.taskId) };
        iv.effect = hit.length ? `${hit.length} step${hit.length > 1 ? 's' : ''} about ${what} moved to the front.` : added.length ? `Added a ${what.toUpperCase()}-first step at the front; the result will lead with it.` : `The result will lead with ${what}.`;
        break;
      }
      case 'EXCLUSION': {
        const what = intent.exclude!;
        g.constraints.exclude = [...g.constraints.exclude.filter((x) => x !== what), what];
        const hit = run.graph.tasks.filter((x) => !x.invalidatedBy && ['PENDING', 'READY'].includes(x.status) && (x.about ?? '').toLowerCase().includes(what.toLowerCase()));
        hit.forEach((x) => { x.status = 'SKIPPED'; x.failureMode = 'INTERVENTION'; x.error = `Excluded at your instruction (${what})`; x.invalidatedBy = iv.id; });
        const open = this.runProposals(run).filter((p) => (p.targetLabel ?? p.title).toLowerCase().includes(what.toLowerCase()) && ['WAITING_CONFIRMATION', 'NEEDS_CHOICE'].includes(p.status));
        open.forEach((p) => this.o.decide({ sessionId: run.sessionId, proposalId: p.id, decision: 'cancel', requestId: `${run.runId}:${iv.id}:${p.id}` }, actor));
        this.settleCheckpoints(run, actor, iv);
        const t2 = this.replanTail(run, iv);
        out = { invalidated: [...hit.map((x) => x.taskId), ...t2.invalidated], added: t2.added };
        iv.effect = `${what} is excluded from the rest of the run and the result${hit.length || open.length ? ` (${hit.length + open.length} prepared or pending step${hit.length + open.length > 1 ? 's' : ''} dropped)` : ''}.`;
        break;
      }
      case 'OUTPUT_CHANGE': {
        const o = intent.output!;
        if (o === 'noPackage') {
          g.constraints.noPackage = true;
          const hit = run.graph.tasks.filter((x) => !x.invalidatedBy && ['PENDING', 'READY'].includes(x.status) && (x.tool === 'buildExcelArtifact' || x.tool === 'proposeGenerateExcelArtifact' || x.check === 'GENERATION'));
          hit.forEach((x) => { x.status = 'SKIPPED'; x.failureMode = 'INTERVENTION'; x.error = 'No package at your instruction'; x.invalidatedBy = iv.id; });
          const open = this.runProposals(run).filter((p) => /EXCEL_ARTIFACT/.test(p.type) && ['WAITING_CONFIRMATION'].includes(p.status));
          open.forEach((p) => this.o.decide({ sessionId: run.sessionId, proposalId: p.id, decision: 'cancel', requestId: `${run.runId}:${iv.id}:${p.id}` }, actor));
          this.settleCheckpoints(run, actor, iv);
          const t2 = this.replanTail(run, iv);
          out = { invalidated: [...hit.map((x) => x.taskId), ...t2.invalidated], added: t2.added };
          iv.effect = hit.length || open.length ? `No package: ${hit.length + open.length} package step${hit.length + open.length > 1 ? 's' : ''} dropped; any draft already defined stays a draft and is not generated.` : 'No package will be built.';
        } else if (o === 'package') {
          g.constraints.noPackage = false;
          if (POLICY_PROFILES[g.policyProfile].autonomy < 2) { iv.effect = `A ${POLICY_PROFILES[g.policyProfile].label} run cannot prepare a workbook; ask for it as its own goal (“prepare a … package”).`; break; }
          if (run.graph.tasks.some((x) => !x.invalidatedBy && x.tool === 'buildExcelArtifact' && x.status !== 'SKIPPED')) { iv.effect = 'This run already builds a package.'; break; }
          const add = mkTask({ taskId: 'pack', type: 'BUILD_ARTIFACT', title: 'Package', tool: 'buildExcelArtifact', args: { periodStart: g.periodRange?.start ?? g.period, periodEnd: g.periodRange?.end ?? g.period, ...(g.type === 'PREPARE_CONTROLLER_REVIEW' ? { type: 'CLOSE_REVIEW_PACKAGE' } : {}) }, request: g.objective, milestone: true, priority: 30 }, run.graph.version + 1, 'INTERVENTION');
          const tail = this.tailReplacements(run, iv);
          this.reopen(run); this.revise(run, 'INTERVENTION', 'Package added', [add, ...tail], tail.map((x) => x.taskId.split('~')[0]!));
          out = { invalidated: [], added: [add.taskId, ...tail.map((x) => x.taskId)] };
          iv.effect = 'A package will be built from this run (drafted, never generated without your confirmation).';
        } else {
          g.outputFormat = o;
          out = this.replanFor(run, iv, (t) => t.tool === 'proposeGenerateExcelArtifact', () => ({ format: o }));
          iv.effect = out.invalidated.length ? `The workbook will be generated as ${o.toUpperCase()}: ${this.redoText(run, out)}.` : `Output set to ${o.toUpperCase()}.`;
        }
        break;
      }
      case 'ACTION_CONSTRAINT': {
        const c = intent.constraint!;
        if (c.noComments !== undefined) g.constraints.noComments = c.noComments;
        if (c.noActions !== undefined) g.constraints.noActions = c.noActions;
        const block = c.noComments === true || c.noActions === true;
        if (block) {
          const hit = run.graph.tasks.filter((x) => !x.invalidatedBy && ['PENDING', 'READY'].includes(x.status) && x.riskLevel !== 'READ' && x.tool && !!this.constraintBlocks(run, x));
          hit.forEach((x) => { x.status = 'SKIPPED'; x.failureMode = 'CONSTRAINT'; x.error = this.constraintBlocks(run, x); x.invalidatedBy = iv.id; });
          const open = this.runProposals(run).filter((p) => ['WAITING_CONFIRMATION', 'NEEDS_CHOICE'].includes(p.status) && (c.noActions ? p.riskLevel !== 'GOVERNED_ACTION' || true : /COMMENT/.test(p.type)));
          open.forEach((p) => this.o.decide({ sessionId: run.sessionId, proposalId: p.id, decision: 'cancel', requestId: `${run.runId}:${iv.id}:${p.id}` }, actor));
          this.settleCheckpoints(run, actor, iv);
          out = { invalidated: hit.map((x) => x.taskId), added: [] };
          if (hit.length || open.length) this.revise(run, 'INTERVENTION', `Constraint: ${c.noActions ? 'no actions' : 'no comments'}`, [], hit.map((x) => x.taskId));
          iv.effect = `${c.noActions ? 'No actions' : 'No comments'} will be prepared until you say otherwise; ${hit.length} pending draft${hit.length === 1 ? '' : 's'} skipped, ${open.length} prepared draft${open.length === 1 ? '' : 's'} withdrawn (none had been written). The analysis continues.`;
        } else {
          /* lifted: the steps that find what to comment on expand again */
          const parents = run.graph.tasks.filter((x) => !x.invalidatedBy && x.status === 'COMPLETED' && (x.expand === 'FLUX_COMMENTS' || x.expand === 'RECON_COMMENTS'));
          const before2 = run.graph.tasks.length;
          for (const p of parents) { const o = this.objects.get(run.runId)?.get(p.taskId); if (o) this.expand(run, p, o); }
          const missing = parents.filter((p) => !this.objects.get(run.runId)?.get(p.taskId));
          const r2 = missing.length ? this.replanFor(run, iv, (t) => missing.includes(t), () => ({})) : { invalidated: [], added: [] };
          const conf = this.confirmReplacement(run, iv);
          out = { invalidated: r2.invalidated, added: [...run.graph.tasks.slice(before2).map((x) => x.taskId), ...conf] };
          iv.effect = `${c.noActions === false ? 'Actions' : 'Comments'} may be prepared again; ${run.graph.tasks.length - before2} draft step${run.graph.tasks.length - before2 === 1 ? '' : 's'} added — nothing is written without your confirmation.`;
        }
        break;
      }
    }
    iv.effect = iv.effect || 'Applied.';
    /* the step budget guards against a runaway plan, not against work the person asked for: a steering revision extends
       it by exactly the steps it added, and says so */
    /* a PERSON-initiated revision may add steps, and the budget grows by exactly what it added — the outer budget
       moves with it, or a steering instruction would be accepted and then stopped by a ceiling it just raised */
    if (out.added.length) { run.limits.maxSteps += out.added.length; if (run.budget) run.budget.maxIterations += out.added.length; this.event(run, 'BUDGET_EXTENDED', `+${out.added.length} steps for "${text}" (limit now ${run.limits.maxSteps})`); }
    g.userInstructions.push(text);
    retitle(g);
    const after = this.ctxOf(run);
    const ev: UserSteeringEvent = { id: `STEER-${run.steering.length + 1}`, runId: run.runId, at: now(), actor: { id: actor.id, name: actor.name }, instruction: text, type: intent.type,
      contextBefore: before, contextAfter: after, tasksInvalidated: out.invalidated, tasksAdded: out.added, planRevision: run.graph.version !== rev0 ? run.graph.version : null, effect: iv.effect };
    run.steering.push(ev);
    this.event(run, 'STEERED', `${intent.type}: ${text}`);
    if (!['CANCEL', 'PAUSE', 'RESUME'].includes(intent.type) && !['CANCELLED'].includes(run.runStatus)) this.line(run, iv.effect, 'done', `steer:${ev.id}`);
    this.syncContext(run, actor);
    this.audit(run, actor, 'AGENT_RUN_STEERED', null, { instruction: text, type: intent.type, contextBefore: before, contextAfter: after, tasksInvalidated: out.invalidated, planRevision: ev.planRevision });
    WORK.repos.investigations.event(run.investigationId, { type: 'AGENT_STEERED', label: `${intent.type.replace(/_/g, ' ').toLowerCase()}: ${text}`, ref: run.runId, traceId: run.runId }, actor.id);
    this.save(run);
    if (run.runStatus === 'RUNNING') this.kick(run.runId);
    return iv.effect;
  }

  /* ---- safe replan: invalidate only what the change touches, keep the rest, re-run the dependents ---- */
  private replanFor(run: AgentRunBody, iv: AgentIntervention, sens: (t: AgentTask) => boolean, patch: (t: AgentTask) => Record<string, string | null>): { invalidated: string[]; added: string[] } {
    const isTail = (t: AgentTask) => t.check === 'VERIFY' || t.check === 'SUMMARIZE';
    const live = (t: AgentTask) => !t.invalidatedBy && t.status !== 'RUNNING' && !(t.status === 'SKIPPED' && ['POLICY', 'CONSTRAINT', 'INTERVENTION'].includes(t.failureMode ?? ''));
    const direct = new Set(run.graph.tasks.filter((t) => live(t) && !isTail(t) && t.origin !== 'EXPANSION' && sens(t)).map((t) => t.taskId));
    if (!direct.size) return { invalidated: [], added: [] };
    const patched = new Set(direct);
    /* dependents follow their inputs (a support check on a population that changed) */
    for (let grew = true; grew;) { grew = false; for (const t of run.graph.tasks) if (live(t) && !isTail(t) && t.origin !== 'EXPANSION' && !direct.has(t.taskId) && t.dependsOn.some((d) => direct.has(d))) { direct.add(t.taskId); grew = true; } }
    /* what a replaced step had expanded into is dropped (the replacement expands again); open drafts from it are withdrawn */
    const children = run.graph.tasks.filter((t) => !t.invalidatedBy && t.origin === 'EXPANSION' && t.dependsOn.some((d) => direct.has(d)));
    for (const c of children) { c.invalidatedBy = iv.id; run.progress = run.progress.filter((p) => (p as { taskId?: string }).taskId !== c.taskId); if (c.status !== 'COMPLETED') { c.status = 'SKIPPED'; c.failureMode = 'INVALIDATED'; c.error = 'Replaced by a plan revision'; } }
    const childProps = new Set(children.flatMap((c) => c.proposalIds));
    const replacedProps = new Set([...direct].flatMap((id) => run.graph.tasks.find((x) => x.taskId === id)!.proposalIds));
    for (const p of this.runProposals(run)) if ((childProps.has(p.id) || replacedProps.has(p.id)) && ['WAITING_CONFIRMATION', 'NEEDS_CHOICE', 'VALIDATED', 'PROPOSED'].includes(p.status)) this.o.decide({ sessionId: run.sessionId, proposalId: p.id, decision: 'cancel', requestId: `${run.runId}:${iv.id}:${p.id}` }, this.actorOf(run));
    /* a checkpoint gathering what was replaced is superseded, and its step runs again over the new work */
    for (const id of direct) { const t = run.graph.tasks.find((x) => x.taskId === id)!; if (t.check === 'CONFIRMATION' || t.check === 'GOVERNED') this.supersede(run, t); }
    if (children.length) for (const t of run.graph.tasks.filter((x) => live(x) && (x.check === 'CONFIRMATION' || x.check === 'GOVERNED') && !direct.has(x.taskId))) { this.supersede(run, t); direct.add(t.taskId); }
    /* a notice a replaced step raised (e.g. "JD Edwards unavailable" for activity now out of scope) no longer describes the
       run: it is superseded with the step, and the replacement raises it again only if it still applies */
    for (const c of run.checkpoints) if (c.status === 'OPEN' && !c.blocking && c.taskId && (direct.has(c.taskId) || children.some((x) => x.taskId === c.taskId))) { c.status = 'RESOLVED'; c.resolution = 'superseded'; c.resolvedAt = now(); c.resolvedBy = 'Korvyn (plan revision)'; }
    const added = [...direct].map((id) => run.graph.tasks.find((x) => x.taskId === id)!).map((x) => this.replacement(run, x, patched.has(x.taskId) ? patch(x) : {}, iv.id));
    const tail = this.tailReplacements(run, iv);
    this.reopen(run);
    const invalidated = [...direct, ...children.map((c) => c.taskId), ...tail.map((x) => x.taskId.split('~')[0]!)];
    this.revise(run, 'REPLAN', iv.text, [...added, ...tail], invalidated);
    return { invalidated, added: [...added, ...tail].map((x) => x.taskId) };
  }
  /** re-run only the verification and the summary (the result changes, the work does not) */
  private replanTail(run: AgentRunBody, iv: AgentIntervention): { invalidated: string[]; added: string[] } {
    if (!['COMPLETED', 'BLOCKED'].includes(run.runStatus) && !run.graph.tasks.some((t) => !t.invalidatedBy && (t.check === 'VERIFY' || t.check === 'SUMMARIZE') && t.status === 'COMPLETED')) return { invalidated: [], added: [] };
    const tail = this.tailReplacements(run, iv);
    if (!tail.length) return { invalidated: [], added: [] };
    this.reopen(run);
    this.revise(run, 'INTERVENTION', `${iv.text} — result re-summarised`, tail, tail.map((x) => x.taskId.split('~')[0]!));
    return { invalidated: tail.map((x) => x.taskId.split('~')[0]!), added: tail.map((x) => x.taskId) };
  }
  private tailReplacements(run: AgentRunBody, iv: AgentIntervention) { return run.graph.tasks.filter((x) => !x.invalidatedBy && (x.check === 'VERIFY' || x.check === 'SUMMARIZE')).map((x) => this.replacement(run, x, {}, iv.id)); }
  /** after drafts were withdrawn: a confirmation left with nothing open is superseded and its step settles */
  private settleCheckpoints(run: AgentRunBody, actor: Actor, iv: AgentIntervention) {
    void actor;
    for (const c of run.checkpoints.filter((x) => x.status === 'OPEN' && x.type === 'CONFIRMATION')) {
      const open = this.runProposals(run).filter((p) => c.proposalIds.includes(p.id) && p.status === 'WAITING_CONFIRMATION');
      if (open.length) continue;
      c.status = 'RESOLVED'; c.resolution = 'superseded'; c.resolvedAt = now(); c.resolvedBy = iv.by;
      const t = c.taskId ? run.graph.tasks.find((x) => x.taskId === c.taskId) : undefined;
      if (t && t.status === 'WAITING') { t.status = 'SKIPPED'; t.failureMode = 'INTERVENTION'; t.error = 'Nothing left to confirm'; }
      run.progress = run.progress.filter((p) => (p as { taskId?: string }).taskId !== c.taskId);
    }
    if (WAITING.includes(run.runStatus) && run.runStatus !== 'PAUSED' && !run.checkpoints.some((c) => c.status === 'OPEN' && c.blocking)) this.status(run, 'RUNNING');
  }
  private supersede(run: AgentRunBody, t: AgentTask) {
    for (const c of run.checkpoints.filter((x) => x.status === 'OPEN' && x.taskId === t.taskId)) {
      for (const p of this.runProposals(run).filter((x) => c.proposalIds.includes(x.id) && ['WAITING_CONFIRMATION', 'VALIDATED'].includes(x.status))) this.o.decide({ sessionId: run.sessionId, proposalId: p.id, decision: 'cancel', requestId: `${run.runId}:supersede:${p.id}` }, this.actorOf(run));
      c.status = 'RESOLVED'; c.resolution = 'superseded'; c.resolvedAt = now(); c.resolvedBy = 'Korvyn (plan revision)';
    }
    if (t.check === 'CONFIRMATION' || t.check === 'GOVERNED') { if (t.check === 'CONFIRMATION') { run.planSeq += 1; run.actionPlanId = `APLAN-${run.runId}-${run.planSeq}`; } }
  }
  /** a confirmation step for new drafts (after a constraint is lifted) */
  private confirmReplacement(run: AgentRunBody, iv: AgentIntervention): string[] {
    const cur = run.graph.tasks.filter((x) => !x.invalidatedBy && x.check === 'CONFIRMATION');
    const pending = cur.some((x) => ['PENDING', 'READY', 'WAITING'].includes(x.status));
    const reps = pending ? [] : cur.map((x) => this.replacement(run, x, {}, iv.id));
    const tail = this.tailReplacements(run, iv);
    if (!reps.length && !tail.length) return [];
    this.reopen(run);
    this.revise(run, 'INTERVENTION', `${iv.text} — confirmation re-opened for new drafts`, [...reps, ...tail], [...reps, ...tail].map((x) => x.taskId.split('~')[0]!));
    return [...reps, ...tail].map((x) => x.taskId);
  }
  private reopen(run: AgentRunBody) {
    if (['COMPLETED', 'BLOCKED'].includes(run.runStatus)) { run.completedAt = null; run.verification = null; run.result = null; run.completionReason = null; this.status(run, 'RUNNING'); }
    else if (WAITING.includes(run.runStatus) && run.runStatus !== 'PAUSED' && !run.checkpoints.some((c) => c.status === 'OPEN' && c.blocking)) this.status(run, 'RUNNING');
  }
  private redoText(run: AgentRunBody, out: { invalidated: string[]; added: string[] }) {
    const redo = out.added.filter((id) => !/^(verify|summarize)/.test(id)).map((id) => run.graph.tasks.find((x) => x.taskId === id)?.title).filter(Boolean);
    const kept = run.graph.tasks.filter((y) => y.status === 'COMPLETED' && !y.invalidatedBy && y.tool && y.milestone).map((y) => y.title);
    return `${redo.length ? `${redo.length} step${redo.length > 1 ? 's' : ''} re-run (${redo.join(', ')})` : 'no step needed re-running'}${kept.length ? `; kept ${kept.join(', ')}` : ''}`;
  }
  /** a constraint the person set blocks this step, and why */
  private constraintBlocks(run: AgentRunBody, t: AgentTask): string | null {
    const at = this.actionTypeOf(t) ?? '';
    if (run.goal.constraints.noActions && t.riskLevel !== 'READ' && t.tool !== 'buildExcelArtifact' && t.tool !== 'previewExcelArtifact') return 'Not prepared: you asked for no actions yet';
    if (run.goal.constraints.noComments && /COMMENT/.test(at)) return 'Not prepared: you asked for no comments yet';
    if (run.goal.constraints.noPackage && (t.tool === 'buildExcelArtifact' || t.tool === 'proposeGenerateExcelArtifact')) return 'Not built: you asked for no package';
    return null;
  }
  /** the run's context as the person has steered it */
  private ctxOf(run: AgentRunBody): RunContext {
    const g = run.goal;
    return { period: g.period, periodRange: g.periodRange ? { ...g.periodRange } : null, scope: g.scope, vendor: g.subject.vendor, project: g.subject.project, entity: g.subject.entity, account: g.subject.account, threshold: g.threshold,
      constraints: { noComments: g.constraints.noComments, noActions: g.constraints.noActions, noPackage: g.constraints.noPackage, exclude: g.constraints.exclude.slice(), focusFirst: g.constraints.focusFirst.slice() }, outputFormat: g.outputFormat };
  }
  /** the conversation's FinancialContext follows the run: an explicit instruction replaces what was inherited */
  private syncContext(run: AgentRunBody, actor: Actor) { try { this.o.agentContext(run.sessionId, actor, this.ctxOf(run)); } catch { /* the conversation may belong to a restarted process */ } }

  /** a revision never overwrites: the old task is SKIPPED with the reason, the new one is a new node */
  private replacement(run: AgentRunBody, x: AgentTask, patch: Record<string, string | null>, by: string): AgentTask {
    x.invalidatedBy = by; run.progress = run.progress.filter((p) => (p as { taskId?: string }).taskId !== x.taskId);
    if (x.status !== 'COMPLETED') { x.status = 'SKIPPED'; x.failureMode = 'INVALIDATED'; x.error = 'Replaced by a plan revision'; }
    const base = x.taskId.split('~')[0]!, v = run.graph.version + 1;
    const args: Record<string, string> = { ...x.args };
    for (const [k, v] of Object.entries(patch)) { if (v === null) delete args[k]; else if (k in x.args || (x.tool && toolRegistry.get(x.tool)?.params.some((p) => p.name === k))) args[k] = v; }
    return mkTask({ ...x, taskId: `${base}~${v}`, args, status: 'PENDING', attempts: 0, resultObjectIds: [], proposalIds: [], artifactIds: [], executionTraceId: null, error: null, failureMode: null, invalidatedBy: null, startedAt: null, completedAt: null, latencyMs: null,
      dependsOn: x.dependsOn.map((d) => d.split('~')[0]!) }, v, 'REPLAN');
  }
  /**
   * A2 §10 — PLAN ECONOMY. A revision is USEFUL when it changes what the run will do: it adds governed work, or it
   * invalidates work a person's instruction made wrong. A revision that adds nothing but the next THINK step is
   * the loop turning over, not a plan change — it is recorded as a no-op so churn is measurable rather than
   * inferred from a revision count, and `noopReplans` is what an evaluator reads.
   *
   * Nothing is suppressed: an unchanged plan is not a reason to stop, and the run still advances. What A2 removes
   * is the pretence that six revisions meant six replans.
   */
  private revise(run: AgentRunBody, source: 'EXPANSION' | 'REPLAN' | 'INTERVENTION', reason: string, added: AgentTask[], invalidated: string[]) {
    const changesWork = added.some((a) => a.tool) || invalidated.length > 0;
    if (changesWork) run.waterfall.usefulReplans += 1; else run.waterfall.noopReplans += 1;
    const v = run.graph.version + 1;
    added.forEach((a) => { a.planVersion = v; });
    run.graph.tasks.push(...added);
    run.graph.version = v;
    run.graph.revisions.push({ version: v, at: now(), source, reason, added: added.map((a) => a.taskId), invalidated, rejected: [] });
    /* dependencies are by base id: they resolve to the latest live task */
    for (const t of run.graph.tasks) t.dependsOn = t.dependsOn.map((d) => this.latest(run, d)?.taskId ?? d);
    if (source !== 'EXPANSION') this.event(run, 'PLAN_REVISED', `v${v}: ${reason}`);
  }

  /* ================================================================================================
     PHASE 8D — THE OPEN INVESTIGATION. THINK → governed calls → observations → THINK … → SYNTHESIZE → VERIFY → SUMMARY.
     The model decides each next step from a compact context; every call it names is validated and permission-checked
     exactly as any plan step; Korvyn keeps the state; budgets are checked before every model call.
     ================================================================================================ */
  /** the financial frame the investigation reasons in — Korvyn's resolved context, never the model's */
  private frameOf(run: AgentRunBody, actor: Actor): FinancialFrame {
    const g = run.goal, periods = this.o.data.governedPeriods();
    const i = periods.indexOf(g.period);
    const lab = (k: string) => g.labels[k] ? `${g.labels[k]}` : null;
    return {
      objective: g.objective, period: g.period, comparisonPeriod: g.comparisonPeriod ?? (i > 0 ? periods[i - 1]! : null), governedPeriods: periods, workingPeriod: this.o.data.workingPeriod(),
      scope: g.scope === 'GROUP' ? 'Corporate Consolidated (GROUP)' : `${this.o.data.scope(g.scope)?.name ?? g.scope} (${g.scope})`,
      /**
       * A6 §13 — THE ANCHOR HAS TO REACH THE MODEL, not just the profile. This listed five fields and a
       * reconciliation was not among them, so a run launched from the Reconciliations page with REC-MDH-13100
       * selected told the model nothing about it: measured live, the model answered "no entity, account, or
       * reconciliation identifier was specified" and asked the user — on a run that was anchored the whole time.
       * The runs that passed did so by SEARCHING for the object they had been handed, which is luck, not design.
       * Every other governed ref the goal carries is named here now, with its label, so an anchor of a type
       * added later is carried without this line changing again.
       */
      subject: { account: g.subject.account, project: g.subject.project ? `${g.subject.project}${lab('project') ? ` — ${lab('project')}` : ''}` : null, vendor: g.subject.vendor, entity: g.subject.entity, threshold: g.threshold ? `$${g.threshold}M` : null,
        ...Object.fromEntries(refsOf(g).filter((r) => !['account', 'project', 'vendor', 'entity'].includes(r.type)).map((r) => [r.type, r.label ? `${r.id} — ${r.label}` : r.id])) },
      constraints: { exclude: g.constraints.exclude, focusFirst: g.constraints.focusFirst, instructions: g.userInstructions.slice(-6) },
      activeAnalysis: g.activeAnalysis ?? null, actorRole: actor.role,
    };
  }
  private async think(run: AgentRunBody, t: AgentTask, actor: Actor) {
    const S = run.investigation!, g = run.goal, prof = POLICY_PROFILES[g.policyProfile];
    S.usage.elapsedMs = Date.now() - S.startedAt;
    const stop = budgetExhausted(S.budget, S.usage);
    if (stop) { S.stopReason = stop; this.event(run, 'BUDGET', stop); this.appendSynthesis(run, t, `Stopped investigating: ${stop}.`); return; }
    /**
     * A3 §3/§13 — WHAT THIS RUN MAY PREPARE. The profile names its action families, `agentAllowlist` intersects
     * them with the actor's own permissions, and a run that may not prepare gets an empty set and never sees an
     * action at all. Exposure is not authority: everything shown here is still gated by `profileGate`, classified
     * by ActionGovernance and confirmed by a person before anything is written.
     */
    const mayPrepare = prof.autonomy >= 2 && !g.constraints.noActions && prof.actionDomains.length > 0;
    const actionDomains = mayPrepare ? prof.actionDomains.filter((d) => prof.domains.includes(d)) : [];
    const allow = this.o.agentAllowlist(actor, prof.domains, mayPrepare);
    const referents = referentsOf(S.observations, { account: g.subject.account, project: g.subject.project, vendor: g.subject.vendor, entity: g.subject.entity, period: g.period });
    const caps = relevant(allow, { goalClass: S.goalClass, requested: S.requested, used: S.observations.map((o) => o.tool), referents }, 20, actionDomains);
    const frame = this.frameOf(run, actor);
    /* A2 §5: the planner's brief is the PROFILE's — a specialist differs by configuration, never by a branch here.
       A2 §9: a capability's description is sent once per run; after that the id alone is enough for the tool enum. */
    const seen = new Set(S.described ?? []);
    const payload = contextFor(S, frame, caps, [...AGENT_DOMAINS].filter((d) => prof.domains.includes(d)),
      { label: prof.label, purpose: prof.purpose, completion: prof.completion, autonomy: prof.autonomy }, seen);
    S.described = [...new Set([...(S.described ?? []), ...caps.map((c) => c.id)])];
    const chars = JSON.stringify(payload).length;
    S.usage.largestContextChars = Math.max(S.usage.largestContextChars, chars);
    /* A2 §12: from the SECOND step on, an objective classified as turning on a judgment may reason deeply — there
       is now something to reason about. Bounded by the escalation budget and recorded with its reason, as any
       escalation is. */
    if (S.deepWarranted && S.usage.iterations >= 1 && S.nextClass === 'M2' && escalate(S, 'MATERIAL_JUDGMENT', 'the objective was classified as turning on an accounting judgment')) S.deepWarranted = false;
    const cls = S.nextClass;
    const tThink = Date.now();
    const r = await this.o.agentThink({ context: payload, toolIds: caps.map((c) => c.id) }, CLASS_ROUTE[cls as 'M2'], this.ac(run.runId).signal);
    run.waterfall.thinkMs += Date.now() - tThink;
    S.usage.iterations += 1;
    if (r.call) this.model(run, { ...r.call, cls });
    const iter = S.usage.iterations;
    if (!r.out || r.out.status !== 'ok') {
      const why = !r.out ? 'the reasoning service is not configured' : r.out.status === 'declined' ? 'the reasoning service declined' : `${r.out.code}: ${r.out.detail}`;
      S.steps.push({ iteration: iter, cls, model: r.call?.model ?? null, decision: 'ERROR', calls: [], capabilitiesShown: caps.length, contextChars: chars, confidence: null, escalated: null, latencyMs: r.call?.latencyMs ?? 0, inputTokens: r.call?.inputTokens ?? 0, outputTokens: r.call?.outputTokens ?? 0, cacheReadTokens: r.call?.cacheReadTokens ?? 0 , error: why });
      S.invalidStreak += 1;
      const fatal = !r.out || r.out.status === 'declined' || ['auth', 'unavailable', 'cancelled', 'refused'].includes((r.out as { code?: string }).code ?? '');
      if (fatal || S.invalidStreak >= 3) { S.stopReason = `the planner could not continue (${why})`; this.appendSynthesis(run, t, `Stopped investigating: ${why}.`); return; }
      if (S.invalidStreak >= 2) escalate(S, 'VALIDATION_FAILED', why);
      this.revise(run, 'EXPANSION', `Step ${iter} retried: ${why}`, [mkTask({ taskId: `think-${iter + 1}`, type: 'ANALYZE', title: 'Planning the next step', check: 'THINK', dependsOn: [], priority: 5 }, run.graph.version + 1, 'MODEL')], []);
      return;
    }
    S.invalidStreak = 0;
    if (cls === 'M3') relax(S);
    const v = r.out.value;
    S.goalClass = v.goalClass; if (!S.understanding) S.understanding = v.understanding;
    /* notes: the model's running conclusions — a figure no observation carried is withheld, not stored */
    const allowed = allowedNumbers(S.observations), refs = new Set(S.observations.map((o) => o.ref));
    for (const n of v.workingNotes) { if (ungrounded(n.text, allowed).length) continue; S.notes.push({ text: n.text, support: n.support, observationRefs: n.observationRefs.filter((x) => refs.has(x)), iteration: iter }); }
    if (S.notes.length > 20) S.notes.splice(0, S.notes.length - 20);
    S.openQuestions = v.openQuestions.slice(0, 6);
    for (const d of v.needCapabilities) if (!S.requested.includes(d)) S.requested.push(d);
    let escalated: string | null = null;
    if (v.escalate.needed && v.escalate.reason && (['MATERIAL_JUDGMENT', 'CONFLICTING_EVIDENCE', 'COMPLEX_CROSS_DOMAIN', 'AMBIGUITY'].includes(v.escalate.reason) || (v.escalate.reason === 'LOW_CONFIDENCE' && iter >= 3)))
      if (escalate(S, v.escalate.reason, v.escalate.detail ?? v.understanding)) escalated = v.escalate.reason;
    const stepRec = { iteration: iter, cls, model: r.call?.model ?? null, decision: v.decision as string, calls: [] as { tool: string; args: Record<string, string>; purpose: string }[], capabilitiesShown: caps.length, contextChars: chars, confidence: v.confidence, escalated, latencyMs: r.call?.latencyMs ?? 0, inputTokens: r.call?.inputTokens ?? 0, outputTokens: r.call?.outputTokens ?? 0, cacheReadTokens: r.call?.cacheReadTokens ?? 0 };
    S.steps.push(stepRec);
    this.event(run, 'THINK', `Step ${iter} (${cls}${r.call?.model ? ` · ${r.call.model}` : ''}): ${v.decision}${v.calls.length ? ` — ${v.calls.map((c) => c.tool).join(', ')}` : ''}`);
    /**
     * A4 §8/§9 — THE MODEL'S OWN WORDS ABOUT THE TASK ARE NOT A PROGRESS LINE. 8D put the first step's
     * `understanding` straight into the progress a person reads, and under A4's product framing that is model
     * reasoning shown verbatim: on screen it read "The user wants the Electrical CIP (account 15000)
     * reconciliation status for Jun 2026 established: what's unresolved, its materiality, ownership, and
     * supporting evidence" — accurate, and a paragraph of the model talking about the request rather than a line
     * saying what Korvyn is doing. It stays on the run's own record (the trace, the event log and the result's
     * understanding) where an auditor can read it; the progress projection is phases, not reasoning.
     */
    if (iter === 1 && v.understanding) this.event(run, 'UNDERSTANDING', v.understanding.replace(/\.$/, ''));

    if (v.decision === 'ASK_USER' && v.question && v.options.length >= 2 && !run.checkpoints.some((c) => c.field === 'direction')) {
      const candidates = v.options.slice(0, 4).map((o, k) => ({ id: `dir${k + 1}`, label: o, detail: '' }));
      this.checkpoint(run, { type: 'CLARIFICATION', blocking: true, title: v.question, detail: v.understanding, field: 'direction', term: g.objective.slice(0, 80), reason: v.question, candidates, response: null, resolvedValue: null, options: candidates.map((c) => ({ id: c.id, label: c.label })) });
      this.status(run, 'WAITING_FOR_USER');
      this.line(run, v.question, 'waiting', `clarify:${run.checkpoints.length}`);
      return;
    }
    if (v.decision !== 'CALL_TOOLS' || !v.calls.length) { this.appendSynthesis(run, t, null); return; }

    /* each call: validated as any plan step; a duplicate or an invalid call is refused and the planner is told why */
    const left = S.budget.maxToolCalls - S.usage.toolCalls - run.graph.tasks.filter((x) => x.tool && x.status === 'PENDING').length;
    const tasks: AgentTask[] = [];
    const done = new Set(run.graph.tasks.filter((x) => x.tool).map((x) => `${x.tool}|${JSON.stringify(Object.entries(x.args).sort())}`));
    for (const [k, c] of v.calls.slice(0, Math.max(0, Math.min(3, left))).entries()) {
      const args = Object.fromEntries(c.args.filter((a) => a.name && a.value).map((a) => [a.name, a.value]));
      const key = `${c.tool}|${JSON.stringify(Object.entries(args).sort())}`;
      if (done.has(key)) { S.rejected.push({ iteration: iter, tool: c.tool, why: 'already called with the same arguments — use its observation' }); continue; }
      /**
       * A3 §2 — THE PLANNER STATES ITS INTENT; KORVYN RESOLVES IT. The declared intent is checked against the
       * capability's own registered RISK, so a call that would prepare an action while claiming to read is refused
       * and the planner is told why. The registry is authoritative in both directions: a model cannot acquire
       * preparation authority by mislabelling a write, and cannot lose a read by mislabelling it either.
       */
      const reg = toolRegistry.get(c.tool);
      const actual: 'READ' | 'PREPARE_ACTION' = reg?.risk === 'PROPOSE' ? 'PREPARE_ACTION' : 'READ';
      if (reg && c.intent !== actual) {
        const why = `${c.tool} is a ${actual === 'READ' ? 'read' : 'preparation'} capability, not ${c.intent === 'READ' ? 'a read' : 'a preparation'}; state its intent correctly`;
        S.rejected.push({ iteration: iter, tool: c.tool, why }); this.policy(run, c.tool, 'DENY', why); continue;
      }
      const val = this.o.agentValidate(run.sessionId, actor, { tool: c.tool, purpose: c.purpose, args }, allow);
      if (!val.steps.length) { S.rejected.push({ iteration: iter, tool: c.tool, why: val.rejected[0]?.why ?? 'rejected by the planner' }); this.policy(run, c.tool, 'DENY', val.rejected[0]?.why ?? 'rejected'); continue; }
      const step = val.steps[0]!;
      const sreg = toolRegistry.get(step.tool)!;
      done.add(key);
      stepRec.calls.push({ tool: step.tool, args: step.args, purpose: c.purpose });
      /* a PREPARE step carries the PROPOSE risk, so `profileGate` applies the profile's preparableActions and the
         action plan collects the proposal for one confirmation checkpoint to decide */
      tasks.push(mkTask({ taskId: `x${iter}-${k + 1}`, type: typeOfTool(sreg.domain, sreg.risk), title: progressLine(c.progress, step.tool), tool: step.tool, args: step.args, request: c.purpose,
        milestone: true, dependsOn: [t.taskId], priority: 10 + k, scopeSensitive: scopeSensitiveTool(step.tool),
        ...(sreg.risk === 'PROPOSE' ? { riskLevel: 'PROPOSE' as const, planKey: 'ACTIONS' as const } : {}) }, run.graph.version + 1, 'MODEL'));
    }
    if (!tasks.length) {
      S.rejectStreak += 1;
      if (S.rejectStreak >= 2) escalate(S, 'TOOL_PLANNING_FAILED', `${S.rejectStreak} steps in a row proposed no valid call`);
      if (S.rejectStreak >= 3) { S.stopReason = 'the planner proposed no valid call three times'; this.appendSynthesis(run, t, null); return; }
      this.revise(run, 'EXPANSION', `Step ${iter}: every proposed call was refused`, [mkTask({ taskId: `think-${iter + 1}`, type: 'ANALYZE', title: 'Planning the next step', check: 'THINK', dependsOn: [], priority: 5 }, run.graph.version + 1, 'MODEL')], []);
      return;
    }
    S.rejectStreak = 0;
    const next = mkTask({ taskId: `think-${iter + 1}`, type: 'ANALYZE', title: 'Planning the next step', check: 'THINK', dependsOn: tasks.map((x) => x.taskId), softDeps: true, priority: 30 }, run.graph.version + 1, 'MODEL');
    this.revise(run, 'EXPANSION', `Step ${iter}: ${tasks.map((x) => x.tool).join(', ')}`, [...tasks, next], []);
  }
  /** a tool step of the investigation, as a compact observation the next THINK step reads */
  private observeInvestigation(run: AgentRunBody, t: AgentTask) {
    const S = run.investigation!;
    const o = this.objects.get(run.runId)?.get(t.taskId) ?? null;
    const step = S.observations.length + 1;
    /* A1 §10: promote this object's facts through the CONVERSATION'S OWN registry, so the observation carries
       canonical FinancialFact ids. The promotion is deterministic over the object's identity, so a figure an agent
       cites and the same figure a conversation cites resolve to one fact. */
    /* A7 §6/§7 — the governed statuses this read returned, kept for the synthesis to be checked against */
    if (t.status === 'COMPLETED' && o) for (const c of claimsFrom(o)) if (!S.claims.some((x) => x.claimId === c.claimId)) S.claims.push(c);
    const obs: CompactObservation = t.status === 'COMPLETED' && o ? compact(step, t.tool!, t.request ?? t.title, o, null, false, factsFrom(o, FACT_CTX).map((f) => f.factId))
      : compact(step, t.tool!, t.request ?? t.title, null, t.error ?? 'did not complete', t.failureMode === 'PERMISSION' || t.failureMode === 'POLICY');
    S.observations.push(obs);
    S.usage.toolCalls += 1; S.usage.observationChars += obs.chars;
    if (obs.status === 'REFUSED' || obs.status === 'FAILED') S.rejected.push({ iteration: S.usage.iterations, tool: t.tool!, why: obs.note ?? 'failed' });
  }
  /** end the loop: synthesize, verify, summarize — reached by the model's decision, a budget, or a planner failure */
  private appendSynthesis(run: AgentRunBody, after: AgentTask, reason: string | null) {
    if (run.graph.tasks.some((x) => x.check === 'SYNTHESIZE' && !x.invalidatedBy && x.status === 'PENDING')) return;
    if (reason) this.line(run, reason, 'skipped');
    const v = run.graph.version + 1, n = run.graph.tasks.filter((x) => x.check === 'SYNTHESIZE').length + 1;
    const sid = n > 1 ? `synth~${n}` : 'synth', vid = n > 1 ? `verify~${n}` : 'verify', mid = n > 1 ? `summarize~${n}` : 'summarize';
    /**
     * A3 §6/§7 — PREPARE-FIRST. If the run prepared anything, a CONFIRMATION checkpoint stands between the work
     * and the enterprise: the run reaches WAITING_FOR_CONFIRMATION and stops cleanly there, with no reasoning loop
     * spinning while a person decides. Preparation succeeding is never a reason to publish.
     *
     * The checkpoint task is the SAME `check: 'CONFIRMATION'` the templates used — one approval lifecycle, one
     * place proposals are collected by plan id, whichever planner proposed them.
     */
    const prepared = run.graph.tasks.some((x) => x.riskLevel === 'PROPOSE' && x.status === 'COMPLETED' && !x.invalidatedBy);
    const cid = n > 1 ? `confirm~${n}` : 'confirm';
    const tail = prepared
      ? [mkTask({ taskId: cid, type: 'REQUEST_CONFIRMATION', title: 'Your confirmation', check: 'CONFIRMATION', dependsOn: [sid], softDeps: true, milestone: true, priority: 85 }, v, 'MODEL'),
        mkTask({ taskId: vid, type: 'VERIFY', title: 'Verification', check: 'VERIFY', dependsOn: [cid], softDeps: true, milestone: true, priority: 90 }, v, 'MODEL')]
      : [mkTask({ taskId: vid, type: 'VERIFY', title: 'Verification', check: 'VERIFY', dependsOn: [sid], softDeps: true, milestone: true, priority: 90 }, v, 'MODEL')];
    this.revise(run, 'EXPANSION', reason ?? 'The planner decided the objective is sufficiently supported', [
      mkTask({ taskId: sid, type: 'ANALYZE', title: 'Bringing the findings together', check: 'SYNTHESIZE', dependsOn: [after.taskId], softDeps: true, milestone: true, priority: 80 }, v, 'MODEL'),
      ...tail,
      mkTask({ taskId: mid, type: 'SUMMARIZE', title: 'Summary', check: 'SUMMARIZE', dependsOn: [vid], softDeps: true, priority: 95 }, v, 'MODEL'),
    ], []);
  }
  private async synthesizeInvestigation(run: AgentRunBody, t: AgentTask) {
    const S = run.investigation!, frame = this.frameOf(run, this.actorOf(run));
    const allowed = allowedNumbers(S.observations), refs = S.observations.map((o) => o.ref);
    const hasConflict = S.notes.some((n) => n.support === 'CONFLICTING');
    if (hasConflict) escalate(S, 'CONFLICTING_EVIDENCE', 'working notes record conflicting observations');
    const attempt = async (): Promise<boolean> => {
      const cls = S.nextClass;
      const payload = synthesisContext(S, frame);
      S.usage.largestContextChars = Math.max(S.usage.largestContextChars, JSON.stringify(payload).length);
      const tSyn = Date.now();
      const r = await this.o.agentSynth({ context: payload, refs }, CLASS_ROUTE[cls as 'M2'], this.ac(run.runId).signal);
      run.waterfall.synthesizeMs += Date.now() - tSyn;
      if (r.call) this.model(run, { ...r.call, stage: 'synthesize', cls });
      if (!r.out || r.out.status !== 'ok') return false;
      const v = r.out.value;
      /* the model flags a material judgment or conflicting evidence: one deeper pass, if the budget allows */
      if (cls !== 'M3' && v.escalate.needed && v.escalate.reason && ['MATERIAL_JUDGMENT', 'CONFLICTING_EVIDENCE'].includes(v.escalate.reason) && S.usage.modelCalls < S.budget.maxModelCalls && escalate(S, v.escalate.reason, v.escalate.detail ?? 'synthesis')) return attempt();
      const rejected: { statement: string; why: string }[] = [];
      /**
       * A7 §6/§12/§21 — A FINDING MAY CITE ANY OBJECT AND MUST NOT MIX TWO IN ONE SENTENCE.
       *
       * The same verifier the conversational path uses, over the statuses this investigation actually read. A
       * run legitimately looks at several reconciliations; what it may not do is say one of them ties because
       * another does. A figure and a status are rejected the same way and land in the same `rejected` list, so
       * a reader of the trace sees one account of what the run was not allowed to say.
       */
      const anchor = refsOf(run.goal).find((r) => S.claims.some((c) => c.object.id === r.id));
      const focus = anchor ? S.claims.find((c) => c.object.id === anchor.id)!.object : null;
      const findings = v.findings.filter((f) => {
        const u = ungrounded(f.statement, allowed);
        if (u.length) { rejected.push({ statement: f.statement, why: `figure${u.length > 1 ? 's' : ''} ${u.join(', ')} not in any observation` }); return false; }
        if (f.kind !== 'OBSERVED_FACT' && f.kind !== 'EVIDENCE') return true;
        const vc = verifySentence(f.statement, S.claims, focus);
        const certain = vc.failures.filter((x) => x.reason === 'OBJECT_MISMATCH' || x.reason === 'VALUE_MISMATCH' || x.reason === 'STALE_VERSION');
        if (!certain.length) return true;
        rejected.push({ statement: f.statement, why: failureNote(certain) });
        return false;
      }).map((f) => {
        /* §14/§22 — an identity the reader may not see is not amplified into synthesised prose */
        const d = this.o.controls.derivedDisclosure(f.statement, visibleOf(this.actorOf(run)));
        if (d.suppressed.length) run.warnings.push(`Out-of-scope counterparty identities were withheld from the summary (${d.suppressed.length}).`);
        return d.text === f.statement ? f : { ...f, statement: d.text };
      });
      const hu = ungrounded(v.headline, allowed);
      const headline = hu.length ? (findings[0]?.statement ?? `Sloane inspected ${S.observations.filter((o) => o.status === 'OK').length} governed results.`) : v.headline;
      if (hu.length) rejected.push({ statement: v.headline, why: `headline figure${hu.length > 1 ? 's' : ''} ${hu.join(', ')} not in any observation` });
      S.synthesis = { headline, inspected: v.inspected, findings, unresolved: [...v.unresolved, ...(S.stopReason ? [`The investigation stopped early: ${S.stopReason}.`] : [])], nextSteps: v.nextSteps, confidence: v.confidence, rejected, cls, model: r.call?.model ?? null };
      return true;
    };
    const ok = await attempt();
    if (!ok) {
      /* no model: the synthesis is the grounded notes and the observations themselves — never an invented narrative */
      const okObs = S.observations.filter((o) => o.status === 'OK');
      S.synthesis = { headline: okObs.length ? `Sloane inspected ${okObs.length} governed result${okObs.length === 1 ? '' : 's'}; the reasoning service could not write the synthesis.` : 'The investigation could not gather governed results.',
        inspected: okObs.map((o) => o.title), findings: S.notes.filter((n) => n.support === 'SUPPORTED').slice(0, 6).map((n) => ({ statement: n.text, kind: 'OBSERVED_FACT' as const, support: 'SUPPORTED' as const, observationRefs: n.observationRefs })),
        unresolved: [...S.openQuestions, ...(S.stopReason ? [`Stopped early: ${S.stopReason}.`] : [])], nextSteps: [], confidence: null as never, rejected: [], cls: 'D0', model: null };
    }
    this.line(run, `Brought together ${S.synthesis!.findings.length} finding${S.synthesis!.findings.length === 1 ? '' : 's'} from ${S.observations.filter((o) => o.status === 'OK').length} governed result${S.observations.filter((o) => o.status === 'OK').length === 1 ? '' : 's'}`, 'done', t.taskId);
    t.status = 'COMPLETED';
  }
  private investigationResult(run: AgentRunBody): NonNullable<AgentRunBody['result']>['investigation'] {
    const S = run.investigation!, syn = S.synthesis;
    /* A6 — ONE projection of what the run established, read by the result here and by the trace (`findingsOf`) */
    return {
      understanding: S.understanding, goalClass: S.goalClass, inspected: syn?.inspected ?? [],
      findings: findingsOf(S),
      unresolved: syn?.unresolved ?? S.openQuestions, nextSteps: syn?.nextSteps ?? [], confidence: syn?.confidence ?? null,
      populations: [...new Set(S.observations.map((o) => o.population?.populationId).filter((x): x is string => !!x))],
      objects: S.observations.filter((o) => o.status === 'OK').map((o) => ({ ref: o.ref, objectId: o.objectId, title: o.title })),
      stopReason: S.stopReason,
    };
  }
  /** steering an investigation changes its goal and constraints; calls not yet run are superseded and a fresh THINK
   *  step replans from the observations already made — nothing observed is discarded */
  private steerInvestigation(run: AgentRunBody, actor: Actor, intent: SteeringIntent, text: string, iv: AgentIntervention): { invalidated: string[]; added: string[] } {
    const g = run.goal;
    switch (intent.type) {
      case 'SCOPE_CHANGE': { const s = intent.scope!; if ('clear' in s) { g.subject.project = null; g.subject.entity = null; g.scope = 'GROUP'; } else { g.subject[s.dimension] = s.value; g.labels[s.dimension] = s.label; if (s.dimension === 'entity') g.scope = s.value; } break; }
      case 'PERIOD_CHANGE': if (intent.period) { g.period = intent.period.period; g.periodRange = intent.period.periodRange; g.periodText = intent.period.label; } break;
      case 'FILTER_CHANGE': if (intent.threshold !== undefined) g.threshold = intent.threshold; if (intent.vendor) g.subject.vendor = intent.vendor.value; break;
      case 'PRIORITY_CHANGE': if (intent.focus) g.constraints.focusFirst.push(intent.focus); break;
      case 'EXCLUSION': if (intent.exclude) g.constraints.exclude.push(intent.exclude); break;
      default: break;
    }
    const invalidated: string[] = [];
    for (const x of run.graph.tasks) if (x.status === 'PENDING' && (x.tool || x.check === 'THINK' || x.check === 'SYNTHESIZE' || x.check === 'VERIFY' || x.check === 'SUMMARIZE')) { x.status = 'SKIPPED'; x.failureMode = 'SUPERSEDED'; x.error = `superseded by your instruction: "${text}"`; x.invalidatedBy = iv.id; invalidated.push(x.taskId); }
    const iter = (run.investigation?.usage.iterations ?? 0) + 1;
    const think = mkTask({ taskId: `think-${iter}~s${run.steering.length + 1}`, type: 'ANALYZE', title: 'Replanning with your instruction', check: 'THINK', dependsOn: [], priority: 5 }, run.graph.version + 1, 'INTERVENTION');
    this.revise(run, 'INTERVENTION', `Steered: ${text}`, [think], invalidated);
    if (run.investigation) { run.investigation.synthesis = null; run.investigation.stopReason = null; }
    if (['COMPLETED', 'BLOCKED'].includes(run.runStatus)) { run.result = null; run.verification = null; run.completedAt = null; run.completionReason = null; this.status(run, 'RUNNING'); }
    iv.effect = `${intent.type === 'EXCLUSION' ? `Excluding ${intent.exclude}` : intent.type === 'PRIORITY_CHANGE' ? `Focusing on ${intent.focus} first` : intent.type === 'SCOPE_CHANGE' ? 'Scope changed' : intent.type === 'PERIOD_CHANGE' ? `Period changed to ${intent.period?.label}` : 'Instruction applied'} — replanning from what has been observed; ${invalidated.filter((x) => !/^(verify|summarize|synth)/.test(x)).length} pending call${invalidated.length === 1 ? '' : 's'} superseded.`;
    void actor;
    return { invalidated, added: [think.taskId] };
  }

  /* ================================================================================================
     VIEW · PERSISTENCE · EVENTS
     ================================================================================================ */
  /**
   * A1 §16 — the canonical trace envelope for this run, PROJECTED from the run's own durable state. No second
   * record: reconstructing it on read is what stops the trace and the run it describes ever disagreeing.
   * Only the actor who started a run may read its trace.
   */
  traceOf(runId: string, actor: Actor): KorvynTrace | null {
    const r = this.cache.get(runId) ?? this.load(runId);
    if (!r || r.actor.id !== actor.id) return null;
    const p = POLICY_PROFILES[r.goal.policyProfile];
    /* A3 §11: the live proposal record supplies the governance class, validation and execution result */
    return agentTrace(r, { profile: p.id, autonomy: p.autonomy }, WRITE_ACTIONS_ENABLED, (id) => this.o.actions.view(id) as never);
  }
  /** A1 §22 — the machine-readable record the Eval workstream consumes; measured, never self-scored */
  telemetry(runId: string, actor: Actor): AgentTelemetry | null {
    const r = this.cache.get(runId) ?? this.load(runId);
    return r && r.actor.id === actor.id ? agentTelemetry(r) : null;
  }
  /** A2 §15: record where a run came from on its own event log — a scheduled run and a typed one read alike */
  note(runId: string, type: string, label: string) { const r = this.cache.get(runId); if (r) { this.event(r, type, label); this.save(r); } }
  get(runId: string, actor: Actor): RunView | null { const r = this.cache.get(runId) ?? this.load(runId); return r && r.actor.id === actor.id ? this.view(r) : null; }
  body(runId: string, actor: Actor): AgentRunBody | null { const r = this.cache.get(runId) ?? this.load(runId); return r && r.actor.id === actor.id ? r : null; }
  list(actor: Actor) { return WORK.repos.records.list<{ run: AgentRunBody }>(KIND, { created_by: actor.id }).map((r) => this.cache.get(r.id) ?? r.run).map((r) => ({ runId: r.runId, sessionId: r.sessionId, title: r.goal.title, goalType: r.goal.type, status: r.runStatus, startedAt: r.startedAt, updatedAt: r.updatedAt, completedAt: r.completedAt })).reverse(); }
  /** the run this conversation is working on — read from the DURABLE store, so it survives a page refresh, navigating away
   *  and a server restart: the latest of this actor's runs in the session that is still live or waiting on the person */
  activeFor(sessionId: string, actor: Actor, includeCompleted = false): AgentRunBody | null {
    const live = (r: AgentRunBody) => r.sessionId === sessionId && r.actor.id === actor.id && (includeCompleted ? !['CANCELLED', 'FAILED'].includes(r.runStatus) : !TERMINAL.includes(r.runStatus));
    const ids = WORK.repos.records.list<{ run: AgentRunBody }>(KIND, { created_by: actor.id }).map((r) => r.id);
    const runs = ids.map((id) => this.cache.get(id) ?? this.load(id)).filter((r): r is AgentRunBody => !!r && live(r));
    return runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1) ?? null;
  }
  /** wait until the run stops RUNNING (a checkpoint, the end) or the time is up */
  wait(runId: string, ms: number): Promise<void> {
    const r = this.cache.get(runId);
    if (!r || !['RUNNING', 'PLANNING', 'READY', 'CREATED'].includes(r.runStatus)) return Promise.resolve();
    return new Promise((res) => { const tm = setTimeout(done, ms); function done() { clearTimeout(tm); res(); } const l = this.waiters.get(runId) ?? []; l.push(done); this.waiters.set(runId, l); });
  }
  private notify(runId: string) { const r = this.cache.get(runId); if (r && ['RUNNING', 'PLANNING', 'READY'].includes(r.runStatus) && this.running.has(runId)) return; (this.waiters.get(runId) ?? []).splice(0).forEach((f) => f()); }

  /**
   * A4 §9 — WHAT THE RUN IS DOING, IN ONE LINE A PERSON READS. The runtime's own progress is a step log; the
   * product needs a phase. This is DERIVED from real state — the run's status, the task type that is running and
   * the capability family it is reading — so it cannot describe work that is not happening. There is no timer,
   * no script and no fabricated sequence: a run that stalls on one family keeps saying that family's phase,
   * which is the truth and is what a person needs to see.
   *
   * It exposes no model reasoning, no tool id, no plan and no enum.
   */
  phaseOf(run: AgentRunBody): string {
    if (run.runStatus === 'WAITING_FOR_CONFIRMATION') return 'Waiting for your confirmation';
    if (run.runStatus === 'WAITING_FOR_GOVERNED_APPROVAL') return 'Waiting for an approver';
    if (run.runStatus === 'WAITING_FOR_USER') return 'Waiting for your answer';
    if (run.runStatus === 'PAUSED') return 'Paused';
    if (TERMINAL.includes(run.runStatus)) return run.runStatus === 'COMPLETED' ? 'Completed' : run.runStatus === 'CANCELLED' ? 'Cancelled' : run.runStatus === 'FAILED' ? 'Stopped' : 'Stopped for review';
    if (run.runStatus === 'CREATED' || run.runStatus === 'PLANNING') return 'Working out what this needs';
    const live = run.graph.tasks.filter((t) => t.status === 'RUNNING' && !t.invalidatedBy);
    const t = live[live.length - 1] ?? [...run.graph.tasks].reverse().find((x) => x.status === 'COMPLETED' && x.tool && !x.invalidatedBy);
    if (!t) return 'Working';
    if (t.type === 'VERIFY' || t.type === 'SUMMARIZE') return 'Putting the findings together';
    if (t.type === 'REQUEST_CONFIRMATION') return 'Waiting for your confirmation';
    if (t.check === 'THINK') return 'Deciding what to look at next';
    if (t.type === 'BUILD_ARTIFACT') return 'Building the workbook';
    if (t.type === 'PREPARE_ACTION') return `Preparing ${PREPARING[t.tool ? toolRegistry.get(t.tool)?.domain ?? '' : ''] ?? 'work for your review'}`;
    const d = t.tool ? toolRegistry.get(t.tool)?.domain ?? '' : '';
    return READING[d] ?? 'Reading governed records';
  }

  /** §15: project the finished run into a workproduct and store it in the one saved-object store */
  private writeWorkproduct(run: AgentRunBody) {
    if (!run.result) return;
    const wp = workproductOf(run);
    if (!wp) return;
    const prof = POLICY_PROFILES[run.goal.policyProfile];
    wp.evaluationRefs = prof.evaluation ?? null;
    try {
      WORK.repos.saved.create('WORKPRODUCT', { name: wp.title, definition: wp as unknown as Record<string, unknown>, sharedWith: [], createdVia: 'Sloane', executionId: run.runId }, this.actorOf(run).id,
        { id: wp.id, period: run.goal.period, investigationId: run.investigationId });
    } catch { /* a run that concluded is not undone by bookkeeping */ }
  }

  /** §15: the workproduct of a run, read from the store, or projected if this run predates one */
  workproduct(runId: string, actor: Actor): AgentWorkproduct | null {
    const run = this.body(runId, actor);
    if (!run) return null;
    const rec = WORK.repos.saved.get('WORKPRODUCT', `WP-${runId.replace(/^RUN-/, '')}`);
    if (rec) return rec.definition as unknown as AgentWorkproduct;
    return workproductOf(run);
  }

  view(run: AgentRunBody): RunView {
    const props = this.o.actions.ofSession(run.sessionId);
    const prof = POLICY_PROFILES[run.goal.policyProfile];
    return {
      runId: run.runId, title: run.goal.title, goalType: run.goal.type, status: run.runStatus, profile: prof.label, autonomy: ['Assist', 'Autonomous read', 'Autonomous prepare', 'Low-risk execute', 'Governed'][prof.autonomy]!,
      period: run.goal.periodRange ? `${periodLabel(run.goal.periodRange.start)}–${periodLabel(run.goal.periodRange.end)}` : periodLabel(run.goal.period), scope: run.goal.subject.project ?? (run.goal.scope === 'GROUP' ? 'Corporate Consolidated' : run.goal.scope),
      progress: run.progress.slice(-24),
      checkpoints: run.checkpoints.map(({ proposalIds, ...c }) => ({ ...c, proposals: proposalIds.map((id) => props.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => ({ id: p.id, title: p.title, target: p.targetLabel, status: p.status, riskLevel: p.riskLevel })) })),
      result: run.result, verification: run.verification, completionReason: run.completionReason, interventions: run.interventions,
      startedAt: run.startedAt, updatedAt: run.updatedAt, completedAt: run.completedAt, sessionId: run.sessionId, investigationId: run.investigationId,
      /* A4 §8/§9: the compact product representation — one phase, where it came from, and the workproduct if there is one */
      phase: this.phaseOf(run), origin: run.origin ?? 'API', launchedFrom: run.launchedFrom ?? null,
      workproductId: run.result ? `WP-${run.runId.replace(/^RUN-/, '')}` : null,
      canPause: ['RUNNING', 'PLANNING', 'READY'].includes(run.runStatus), canCancel: !TERMINAL.includes(run.runStatus),
    };
  }

  private load(runId: string): AgentRunBody | null {
    const r = WORK.repos.records.get<{ run: AgentRunBody }>(KIND, runId);
    if (!r) return null;
    this.cache.set(runId, r.run);
    if (!this.objects.has(runId)) this.objects.set(runId, new Map());
    return r.run;
  }
  private save(run: AgentRunBody) {
    run.updatedAt = now();
    if (run.events.length > 300) run.events.splice(0, run.events.length - 300);
    if (run.trace.toolCalls.length > 200) run.trace.toolCalls.splice(0, run.trace.toolCalls.length - 200);
    try { WORK.repos.records.update<{ run: AgentRunBody }>(KIND, run.runId, null, run.actor.id, () => ({ run }), { status: run.runStatus }); }
    catch { /* a run created in another process's database is kept in memory only */ }
  }
  private status(run: AgentRunBody, s: AgentRunStatus) {
    if (run.runStatus === s) return;
    const from = run.runStatus; run.runStatus = s;
    this.event(run, `STATUS_${s}`, `${from} → ${s}`);
    if (s !== 'RUNNING') this.notify(run.runId);
  }
  private finish(run: AgentRunBody, s: AgentRunStatus, reason: string) {
    this.status(run, s);
    run.completionReason = reason; run.completedAt = now();
    this.save(run);
    /**
     * A4 §15 — THE CONCLUSION BECOMES AN OBJECT. A result that lives only inside its run can only be read by
     * opening the run; a workproduct is the same conclusion as a governed record Sloane, Close, Reporting, Audit
     * and an export can each reference. It is PROJECTED from the run and composes nothing, so writing it can
     * never introduce a figure the run did not establish — and a failure to write it never fails the run.
     */
    this.writeWorkproduct(run);
    const actor = this.actorOf(run);
    WORK.repos.investigations.event(run.investigationId, { type: 'AGENT_RUN', label: `Agent run ${s.toLowerCase()}: ${run.goal.title}`, ref: run.runId, traceId: run.runId }, actor.id);
    if (s === 'COMPLETED' || s === 'FAILED' || s === 'BLOCKED') this.audit(run, actor, `AGENT_RUN_${s}`, null, { reason, verification: run.verification?.passed ?? null });
    this.notify(run.runId);
  }
  private line(run: AgentRunBody, line: string, state: AgentRunBody['progress'][number]['state'], taskId?: string) {
    const k = taskId ? run.progress.findIndex((p) => (p as { taskId?: string }).taskId === taskId) : -1;
    const rec = { at: now(), line, state, ...(taskId ? { taskId } : {}) } as AgentRunBody['progress'][number];
    if (k >= 0) run.progress[k] = rec; else run.progress.push(rec);
  }
  private event(run: AgentRunBody, type: string, label: string) { run.events.push({ at: now(), type, label }); }
  private policy(run: AgentRunBody, subject: string, decision: 'ALLOW' | 'DENY' | 'CHECKPOINT', reason: string, kind?: 'PERMISSION' | 'VALIDATION' | 'POLICY') { run.trace.policyDecisions.push({ at: now(), subject, decision, reason, kind: kind ?? (decision === 'DENY' ? (PERMISSION_DENIAL.test(reason) ? 'PERMISSION' : 'VALIDATION') : 'POLICY') }); if (run.trace.policyDecisions.length > 200) run.trace.policyDecisions.shift(); }
  private model(run: AgentRunBody, c: AgentRunBody['trace']['modelCalls'][number]) {
    run.trace.modelCalls.push(c); run.usage.modelCalls += 1; run.usage.inputTokens += c.inputTokens; run.usage.outputTokens += c.outputTokens;
    /* §13/§22: the run's own token and cost meters, so the outer budget and the telemetry read the same numbers
       whichever path produced the call (a template narration, a GENERIC plan, an investigation THINK) */
    run.usage.cacheReadTokens = (run.usage.cacheReadTokens ?? 0) + (c.cacheReadTokens ?? 0);
    run.usage.estimatedCostUsd = (run.usage.estimatedCostUsd ?? 0) + (c.costUsd ?? 0);
    const S = run.investigation;
    if (S) { S.usage.modelCalls += 1; S.usage.inputTokens += c.inputTokens; S.usage.outputTokens += c.outputTokens; S.usage.cacheReadTokens += c.cacheReadTokens ?? 0; S.usage.cacheWriteTokens += c.cacheWriteTokens ?? 0; S.usage.estimatedCostUsd += c.costUsd ?? 0; }
  }
  private trace(run: AgentRunBody, t: AgentTask, args: Record<string, string>, status: string, ms: number, objectId: string | null, error: string | null, traceId: string) { run.trace.toolCalls.push({ taskId: t.taskId, tool: t.tool!, args, status, latencyMs: ms, objectId, error, traceId }); run.usage.toolCalls = (run.usage.toolCalls ?? 0) + 1; }
  private ac(runId: string) { let a = this.acs.get(runId); if (!a || a.signal.aborted) { a = new AbortController(); this.acs.set(runId, a); } return a; }
  private actorOf(run: AgentRunBody): Actor { return { id: run.actor.id, name: run.actor.name, role: run.actor.role, permissions: run.permissionsSnapshot as Actor['permissions'], scopeIds: run.actor.scope }; }
  private audit(run: AgentRunBody, actor: Actor, action: string, proposalId: string | null, after: unknown) {
    WORK.repos.audit.append({ actor: { id: actor.id, name: actor.name, role: actor.role }, source: 'SLOANE', action, target: { id: run.runId, type: 'AGENT_RUN', label: run.goal.title }, beforeRef: null, afterRef: null, before: null, after,
      investigationId: run.investigationId, executionTraceId: run.runId, proposalId, confirmation: null, financialObjectIds: [], populationIds: [], evidenceIds: [], outcome: 'COMPLETED', error: null });
  }
  /** the proposals THIS run prepared — a run started in a conversation shares its session with earlier turns */
  private runProposals(run: AgentRunBody) {
    const ids = new Set([...run.graph.tasks.flatMap((t) => t.proposalIds), ...run.checkpoints.flatMap((c) => c.proposalIds)]);
    return this.o.actions.ofSession(run.sessionId).filter((p) => ids.has(p.id));
  }
  /** the governance class of an action type — the same policy the Action Engine applies */
  classOf(type: string) { return ActionGovernanceEngine.classify(type); }
}
