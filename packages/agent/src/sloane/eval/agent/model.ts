/**
 * A5 — THE AGENT EVALUATION MODEL.
 *
 * The question A5 exists to answer is not "was that a good answer" but: **did the run complete the objective,
 * find what is known to be there, stay grounded and authorized, behave correctly around actions, and cost a
 * reasonable amount doing it** — automatically, repeatably, and against known answers.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE 8D HARNESS (`eval/agent-eval.ts`), which stays and is not superseded:
 * that one asks whether the open investigation loop REASONS well on unseen objectives, and scores it as one
 * quality average. This one asks whether a run of a configured PROFILE did the known work correctly, and it
 * refuses to average: a run that finds every issue and writes one without approval is a governance failure that
 * a 0.9 average would hide.
 *
 * THE PROFILE DECLARES; THE HARNESS SCORES. Every expectation comes from `AgentPolicyProfile.evaluation`
 * (A4 §14 / A5 §1). The harness holds checks, not opinions: it implements named checks a profile may ask for and
 * has no list of its own about what good looks like. A scenario adds the KNOWN ANSWERS for its fixture.
 *
 * THE TRACE IS THE INPUT (§18). Scoring reads `KorvynTrace` and the workproduct, both public projections. Where
 * something needed was missing, the PRODUCER was extended rather than the harness reaching into the runtime —
 * that is why the envelope now carries findings, withheld findings, economy and origin.
 */
import type { EvalDimension } from '../../agent/model.js';

/* ================================================================================================
   THE SCENARIO — §3
   ================================================================================================ */

/**
 * §5 — WHAT A KNOWN FINDING IS, structurally. A scenario states what the run must discover in terms Korvyn can
 * match deterministically: the governed objects it must be about and the amount it must carry. Wording is never
 * matched, because two correct runs will word the same finding differently and a harness that scores prose is
 * scoring the model's style as financial truth (§2).
 */
export interface ExpectedFinding {
  /** stable id, so a regression history can follow one expected finding across runs */
  id: string;
  /** what a person calls it, for the report only */
  label: string;
  /** does missing this fail the run, or is it reported? §7 keeps misses visible either way. */
  severity: 'CRITICAL' | 'MATERIAL' | 'MINOR';
  /**
   * the governed handles that make a finding THIS finding. A finding matches when it carries any of these —
   * a reconciliation id, an account, an entity, a fact id, a population. Several may be given; `anyOf` is the
   * default because a run may reach one issue by more than one governed route.
   */
  refs: { accounts?: string[]; entities?: string[]; reconciliations?: string[]; fluxItems?: string[]; closeTasks?: string[]; factIds?: string[] };
  /** the amount the finding is about, in USD, and how close counts. Omitted when the issue is not an amount. */
  amountUsd?: number;
  amountTolerance?: number;
  /**
   * §5 — the last resort. Words that, TOGETHER, identify the finding when no governed handle can: a source
   * system that is not connected has no account and no fact. Every scenario that uses this says why.
   */
  mustMention?: string[];
  why?: string;
}

/** §4 — a fact the fixture genuinely does NOT have. A run that states one anyway is a false positive, not a find. */
export interface ExpectedAbsence {
  id: string;
  label: string;
  /** the run must not claim this exists; matching is the same structural match an expected finding uses */
  refs?: ExpectedFinding['refs'];
  mustNotMention?: string[];
  why?: string;
}

export interface AgentEvalScenario {
  id: string;
  title: string;
  /** what is typed or launched. Kept verbatim; the harness never rewrites it. */
  objective: string;
  /** the profile this scenario is about. Korvyn still chooses the run's profile — this is what the run SHOULD reach. */
  profile: string;
  /** which seeded identity runs it — a real directory user, resolved through the ordinary auth path */
  actor: string;
  /** §3 — a module launch instead of a conversational one, with the governed context a surface would hand over */
  launch?: { action: string; module: string; objectRefs: { type: string; id: string; label?: string }[]; period?: string; scope?: string };
  /** turns to run before the objective, for a scenario that needs context on screen */
  setup?: string[];
  /** §4 — what the fixture is known to contain */
  expectedFindings?: ExpectedFinding[];
  /** §4 — what it is known NOT to contain */
  expectedAbsences?: ExpectedAbsence[];
  /** §6 — expectations beyond the profile's own, by check id. Scenario-specific, never a second quality model. */
  requires?: { id: string; label: string; dimension: EvalDimension; severity: 'HARD' | 'SOFT'; check: string; args?: Record<string, string | number | boolean> }[];
  prohibits?: { id: string; label: string; dimension: EvalDimension; severity: 'HARD' | 'SOFT'; check: string; args?: Record<string, string | number | boolean> }[];
  /** §3 — how many MATERIAL findings may be missed before COVERAGE fails. CRITICAL misses always fail. */
  maxMisses?: number;
  /** §7 — how many unsupported claims may be raised before the run fails */
  maxFalsePositives?: number;
  /** §13 — this scenario must NOT produce a run at all */
  expectNoRun?: boolean;
  /**
   * §20 — THIS SCENARIO NEEDS A MODEL TO MEAN ANYTHING. Deterministic mode has no reasoning, so it cannot
   * classify an objective (and therefore cannot reach a configured profile) and cannot run the open loop that
   * DISCOVERS anything. A discovery scenario run without a model would report a red failure that says nothing
   * about the product, so it is SKIPPED with the reason instead — and the governance and action-safety
   * scenarios, which the deterministic planner exercises perfectly well, stay in the free gate.
   */
  requiresModel?: boolean;
  /** §16 — the approval path this scenario exercises */
  approval?: 'NONE' | 'CONFIRM' | 'REJECT' | 'RESUME';
  /** §11 — a ceiling only where the scenario genuinely defines one. Absent means performance is reported, not gated. */
  ceilings?: { latencyMs?: number; costUsd?: number; toolCalls?: number; modelCalls?: number };
  /** §14 — which fixture this scenario's known answers were written against */
  dataset: string;
  /** bumped when the known answers change, so a history entry says which version it scored */
  version: number;
}

export interface ScenarioSuite {
  suite: string;
  /** §14: the fixture identity the whole suite is written against */
  dataset: string;
  version: number;
  scenarios: AgentEvalScenario[];
}

/* ================================================================================================
   THE RESULT — §2, and it does not average
   ================================================================================================ */

export interface CheckResult {
  id: string;
  label: string;
  dimension: EvalDimension;
  severity: 'HARD' | 'SOFT';
  check: string;
  /** null when the check does not apply to this run — never counted as a pass or a failure */
  ok: boolean | null;
  detail: string;
  /** where this expectation came from: the profile's own contract, or the scenario's */
  source: 'PROFILE' | 'SCENARIO';
}

/** §7 — misses are their own output, never folded into a score */
export interface CoverageResult {
  known: { id: string; label: string; severity: string }[];
  found: { id: string; matchedBy: string; statement: string }[];
  missed: { id: string; label: string; severity: string }[];
  /** §8 — what the run raised that the fixture does not support */
  falsePositives: { statement: string; kind: string; why: string }[];
  criticalMissed: number;
  materialMissed: number;
}

export interface EvalEconomics {
  latencyMs: number; modelCalls: number; toolCalls: number; thinkSteps: number; replans: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; estimatedCostUsd: number;
  phases: { phase: string; modelCalls: number; modelMs: number; toolCalls: number; toolMs: number; costUsd: number }[];
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioVersion: number;
  title: string;
  runId: string | null;
  status: string;
  profile: string | null;
  /** §15 — the verdict. HARD failures decide it; soft findings never do. */
  verdict: 'PASS' | 'FAIL' | 'ERROR' | 'SKIPPED';
  /** the HARD checks that failed, named. A reader should not have to hunt for why a run failed. */
  hardFailures: string[];
  softFailures: string[];
  checks: CheckResult[];
  /** §2 — per dimension, and deliberately not summed */
  dimensions: Record<string, { hard: number; hardFailed: number; soft: number; softFailed: number }>;
  coverage: CoverageResult | null;
  economics: EvalEconomics;
  notes: string[];
}

/** §12 — several runs of one scenario, reported as a distribution rather than a number */
export interface RepeatResult {
  scenarioId: string;
  runs: number;
  passed: number;
  /** how often each known finding was discovered, across the repeats */
  findingConsistency: { id: string; label: string; foundIn: number; of: number }[];
  missFrequency: { id: string; label: string; missedIn: number; of: number }[];
  falsePositiveRate: number;
  latencyMs: { min: number; median: number; max: number };
  costUsd: { min: number; median: number; max: number };
  toolCalls: { min: number; median: number; max: number };
  results: ScenarioResult[];
}

/* ================================================================================================
   §14 — THE REGRESSION RECORD. Appended, never overwritten.
   ================================================================================================ */
export interface EvalHistoryEntry {
  at: string;
  /** what was being evaluated */
  suite: string;
  scenarioId: string;
  scenarioVersion: number;
  dataset: string;
  profile: string | null;
  profileVersion: string;
  /** what it ran against */
  provider: string;
  defaultModel: string;
  advancedModel: string;
  /** which build */
  commit: string | null;
  mode: 'LIVE' | 'DETERMINISTIC';
  /** the outcome */
  verdict: string;
  hardFailures: string[];
  missed: string[];
  falsePositives: number;
  economics: EvalEconomics;
}
