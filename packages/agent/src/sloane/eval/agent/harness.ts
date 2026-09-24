/**
 * A5 — THE HARNESS: run a scenario, score it against what the profile declares, report without averaging.
 *
 *   §15  HARD failures decide the verdict. A soft failure is reported and never fails a run.
 *   §12  a scenario may be repeated; the report is a distribution, because one run of a frontier model is not
 *        evidence of anything.
 *   §13  a routing override is a modified SloaneConfig handed to the SAME gateway (`createAdapter`). No provider
 *        is imported here and none can be: the hook is a config, so adding a provider is a gateway change.
 *   §20  DETERMINISTIC mode needs no provider and costs nothing; LIVE mode spends credits and says so.
 */
import { execSync } from 'node:child_process';
import type { SloaneConfig } from '../../config.js';
import { createAdapter, type SloaneLLMAdapter } from '../../adapter.js';
import { SloaneOrchestrator } from '../../orchestrator.js';
import { DEV_DIRECTORY, actorContext } from '../../auth.js';
import { POLICY_PROFILES, type ProfileId } from '../../agent/model.js';
import { PEOPLE } from '../../actions.js';
import type { KorvynTrace } from '../../trace.js';
import type { Actor } from '../../tools.js';
import type { AgentWorkproduct } from '../../agent/workproduct.js';
import { CHECKS, type CheckInput } from './checks.js';
import { coverageOf } from './match.js';
import type { AgentEvalScenario, CheckResult, EvalEconomics, EvalHistoryEntry, RepeatResult, ScenarioResult } from './model.js';

/* ================================================================================================
   §13 — THE MODEL ROUTING HOOK
   ================================================================================================ */
export interface RoutingOverride { provider?: string; defaultModel?: string; advancedModel?: string }

/**
 * A config the evaluation may hand to the gateway. It is the ONLY way this harness influences which model
 * answers, and it does so by describing configuration rather than by reaching for a provider — so a future
 * champion/challenger run against another approved model is a value here and a gateway that knows that provider,
 * never a second code path in the evaluation.
 */
export function routed(cfg: SloaneConfig, o: RoutingOverride | undefined): SloaneConfig {
  if (!o) return cfg;
  const next: SloaneConfig = { ...cfg, routes: { ...cfg.routes } };
  if (o.provider) next.provider = o.provider as SloaneConfig['provider'];
  if (o.defaultModel) { next.defaultModel = o.defaultModel; next.routes = { ...next.routes, FAST: { ...next.routes.FAST, model: o.defaultModel }, NARRATE: { ...next.routes.NARRATE, model: o.defaultModel } }; }
  if (o.advancedModel) { next.advancedModel = o.advancedModel; next.model = o.advancedModel; next.routes = { ...next.routes, DEEP: { ...next.routes.DEEP, model: o.advancedModel } }; }
  return next;
}

/* ================================================================================================
   RUNNING ONE SCENARIO
   ================================================================================================ */
export interface HarnessOptions {
  mode: 'LIVE' | 'DETERMINISTIC';
  cfg: SloaneConfig;
  routing?: RoutingOverride;
  /** DETERMINISTIC mode supplies its own adapter; LIVE builds one from the (possibly overridden) config */
  adapter?: SloaneLLMAdapter;
  /** how long to let a run settle before scoring what it has */
  waitMs?: number;
}

const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const actorOf = (id: string): Actor => {
  const u = DEV_DIRECTORY.find((x) => x.id === id);
  if (!u) throw new Error(`no such evaluation actor: ${id}`);
  return actorContext(u, null, 'eval');
};

function economicsOf(trace: KorvynTrace): EvalEconomics {
  const e = trace.economy;
  return {
    latencyMs: trace.usage.latencyMs, modelCalls: trace.usage.modelCalls, toolCalls: trace.usage.toolCalls,
    thinkSteps: trace.steps.filter((s) => s.type === 'ANALYZE' && !s.tool).length,
    replans: trace.plan.revisions.length,
    inputTokens: trace.usage.inputTokens, outputTokens: trace.usage.outputTokens, cacheReadTokens: trace.usage.cacheReadTokens,
    estimatedCostUsd: trace.usage.estimatedCostUsd,
    phases: (['planning', 'investigation', 'preparation', 'synthesis'] as const).map((p) => ({
      phase: p, modelCalls: e[p].modelCalls, modelMs: e[p].modelMs, toolCalls: e[p].toolCalls, toolMs: e[p].toolMs, costUsd: e[p].estimatedCostUsd,
    })),
  };
}

/**
 * §1/§6 — THE EXPECTATIONS, from the profile the run actually used and from the scenario. The profile's come
 * first because they are the standing contract; the scenario adds what is true of its fixture. A scenario may
 * not weaken a profile's expectation — it can only add — which is why they are concatenated and never merged.
 */
function expectations(sc: AgentEvalScenario, profileId: string | null) {
  const p = profileId ? POLICY_PROFILES[profileId as ProfileId] : null;
  const fromProfile = [
    ...(p?.evaluation?.required ?? []).map((e) => ({ ...e, source: 'PROFILE' as const })),
    ...(p?.evaluation?.prohibited ?? []).map((e) => ({ ...e, source: 'PROFILE' as const })),
  ];
  const fromScenario = [
    ...(sc.requires ?? []).map((e) => ({ ...e, source: 'SCENARIO' as const })),
    ...(sc.prohibits ?? []).map((e) => ({ ...e, source: 'SCENARIO' as const })),
  ];
  return [...fromProfile, ...fromScenario];
}

export interface ScoreInput { scenario: AgentEvalScenario; trace: KorvynTrace | null; workproduct: AgentWorkproduct | null; hiddenEntities: { id: string; name: string }[]; knownPeople: string[];
  /** the governed names of ORGANISATIONS, so a person-shaped check does not accuse a run of inventing an entity */
  knownOrgs?: string[]; notes?: string[]; mode?: 'LIVE' | 'DETERMINISTIC' }

/** Score a finished run. Pure: the same trace always scores the same way, so a result can be recomputed later. */
export function score(i: ScoreInput): ScenarioResult {
  const sc = i.scenario;
  const base: ScenarioResult = {
    scenarioId: sc.id, scenarioVersion: sc.version, title: sc.title, runId: null, status: 'NO_RUN', profile: null,
    verdict: 'PASS', hardFailures: [], softFailures: [], checks: [], dimensions: {}, coverage: null,
    economics: { latencyMs: 0, modelCalls: 0, toolCalls: 0, thinkSteps: 0, replans: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, estimatedCostUsd: 0, phases: [] },
    notes: i.notes ?? [],
  };

  /**
   * §20 — A SCENARIO THAT NEEDS A MODEL IS SKIPPED WITHOUT ONE, and says why. Reporting it as a failure would
   * be reporting the absence of a provider as a defect in the product, which is the kind of red that teaches
   * people to ignore a suite.
   */
  if (sc.requiresModel && i.mode === 'DETERMINISTIC') {
    base.verdict = 'SKIPPED';
    base.notes = [...base.notes, 'needs a reasoning model: deterministic mode cannot classify an objective or run the discovery loop'];
    return base;
  }

  /* §13 — a scenario that must not create a run is scored on exactly that, and on nothing else */
  if (sc.expectNoRun) {
    const created = !!i.trace;
    base.checks = [{ id: 'scenario.norun', label: 'this request must not become an agent run', dimension: 'COMPLETION', severity: 'HARD', check: 'NO_RUN_CREATED', ok: !created, detail: created ? `a run was created (${i.trace!.subjectId})` : 'no run was created', source: 'SCENARIO' }];
    base.verdict = created ? 'FAIL' : 'PASS';
    if (created) base.hardFailures.push('this request must not become an agent run');
    base.dimensions = { COMPLETION: { hard: 1, hardFailed: created ? 1 : 0, soft: 0, softFailed: 0 } };
    return base;
  }

  if (!i.trace) {
    base.verdict = 'ERROR';
    base.hardFailures.push('no run was produced for a scenario that expects one');
    return base;
  }
  const trace = i.trace;
  base.runId = trace.subjectId;
  base.status = trace.status;
  base.profile = trace.policy.profile;
  base.coverage = coverageOf(trace, sc);
  base.economics = economicsOf(trace);

  const input = (args: Record<string, string | number | boolean>): CheckInput => ({
    trace, workproduct: i.workproduct, scenario: sc, coverage: base.coverage, hiddenEntities: i.hiddenEntities,
    args: { knownPeople: i.knownPeople.join('|'), knownOrgs: (i.knownOrgs ?? []).join('|'), ...args },
  });

  /**
   * §7 — A SCENARIO'S KNOWN ANSWERS ARE THE SCENARIO'S OWN CONTRACT. The profile declares what a good run of
   * it looks like in general; a scenario knows what is in ITS fixture, and nothing else can. Without this a run
   * that reached a profile with no evaluation contract would silently miss every known finding and still pass —
   * observed, on the deterministic path, where a scenario reported 0 of 2 found and PASS.
   */
  const declared = [...expectations(sc, profileIdOf(trace))];
  if ((sc.expectedFindings?.length ?? 0) && !declared.some((e) => e.check === 'REQUIRED_FINDINGS_FOUND')) {
    declared.push({ id: `${sc.id}.coverage`, label: 'the known findings for this fixture were found', dimension: 'COVERAGE', severity: 'HARD', check: 'REQUIRED_FINDINGS_FOUND', source: 'SCENARIO' });
  }
  for (const e of declared) {
    const fn = CHECKS[e.check];
    if (!fn) {
      base.checks.push({ id: e.id, label: e.label, dimension: e.dimension, severity: e.severity, check: e.check, ok: false, detail: `no such check: ${e.check}`, source: e.source });
      base.hardFailures.push(`${e.label} — the check it names does not exist`);
      continue;
    }
    const out = fn(input(e.args ?? {}));
    base.checks.push({ id: e.id, label: e.label, dimension: e.dimension, severity: e.severity, check: e.check, ok: out.ok, detail: out.detail, source: e.source });
  }

  /* §2 — per dimension, kept apart. §15 — only HARD decides. */
  for (const c of base.checks) {
    const d = (base.dimensions[c.dimension] ??= { hard: 0, hardFailed: 0, soft: 0, softFailed: 0 });
    if (c.ok === null) continue;
    if (c.severity === 'HARD') { d.hard += 1; if (!c.ok) { d.hardFailed += 1; base.hardFailures.push(`${c.label} — ${c.detail}`); } }
    else { d.soft += 1; if (!c.ok) { d.softFailed += 1; base.softFailures.push(`${c.label} — ${c.detail}`); } }
  }
  base.verdict = base.hardFailures.length ? 'FAIL' : 'PASS';
  return base;
}

/** the profile id behind a trace's label, so a check can look the profile up */
function profileIdOf(trace: KorvynTrace): string | null {
  const label = trace.policy.profile;
  if (!label) return null;
  const hit = (Object.keys(POLICY_PROFILES) as ProfileId[]).find((id) => POLICY_PROFILES[id].label === label || id === label);
  return hit ?? null;
}

/* ================================================================================================
   THE RUNNER
   ================================================================================================ */
export class AgentEvalHarness {
  readonly orch: SloaneOrchestrator;
  readonly cfg: SloaneConfig;
  constructor(private readonly o: HarnessOptions) {
    this.cfg = routed(o.cfg, o.routing);
    this.orch = new SloaneOrchestrator(o.adapter ?? createAdapter(this.cfg), this.cfg);
  }

  /** the entities this actor may NOT see — from the same ledger the server reads, never a hand-written list */
  private hidden(actor: Actor) {
    if (actor.scopeIds === 'ALL') return [];
    return this.orch.gl.entities().filter((e) => !actor.scopeIds.includes(e.id)).map((e) => ({ id: e.id, name: e.name }));
  }

  /**
   * The people the governed records name — the identity directory and the reviewer roster the Action Engine
   * assigns from. A name outside this set, in a statement the run offered as FACT, was written rather than read.
   * It is read from the same sources the product uses, never a list written here: a roster this harness maintained
   * would go stale the first time somebody was added, and the check would start accusing correct runs.
   */
  private people(): string[] {
    const out = new Set<string>();
    for (const u of DEV_DIRECTORY) out.add(u.name);
    for (const p of PEOPLE) out.add(p.name);
    for (const d of this.orch.controls.allRecDefs()) { if (d.preparer) out.add(d.preparer); if (d.reviewer) out.add(d.reviewer); }
    return [...out];
  }

  /** the governed names of every entity — read from the ledger, so it cannot go stale the way a list would */
  private orgs(): string[] {
    return this.orch.gl.entities().flatMap((e) => [e.name, e.id]);
  }

  async run(sc: AgentEvalScenario): Promise<ScenarioResult> {
    /* skipped before anything is spent, not after */
    if (sc.requiresModel && this.o.mode === 'DETERMINISTIC') return score({ scenario: sc, trace: null, workproduct: null, hiddenEntities: [], knownPeople: [], mode: 'DETERMINISTIC' });
    const actor = actorOf(sc.actor);
    const sessionId = `eval-${sc.id}-${Date.now().toString(36)}`;
    const notes: string[] = [];
    let runId: string | null = null;
    try {
      for (const s of sc.setup ?? []) await this.orch.turn({ sessionId, request: s }, actor);

      if (sc.launch) {
        const out = this.orch.agentLaunch.launch(actor, {
          action: sc.launch.action as 'INVESTIGATE', sessionId,
          context: { module: sc.launch.module, objectRefs: sc.launch.objectRefs, period: sc.launch.period ?? null, scope: sc.launch.scope ?? null },
          ...(sc.objective ? { objective: sc.objective } : {}),
        });
        if (!out.ok) { notes.push(`launch refused: ${out.reason}`); }
        runId = out.runId ?? null;
      } else {
        const r = await this.orch.turn({ sessionId, request: sc.objective }, actor);
        runId = r.objects?.find((o) => o.type === 'AgentRun')?.refs['runId'] ?? null;
        if (!runId) notes.push(`answered without a run: ${(r.reply ?? r.narrative?.[0]?.text ?? '').slice(0, 140)}`);
      }

      if (runId) await this.settle(runId, actor, sc);
    } catch (e) {
      notes.push(`the scenario raised: ${(e as Error).message}`);
    }

    const trace = runId ? this.orch.agentService.trace(runId, actor) : null;
    const workproduct = runId ? this.orch.agents.workproduct(runId, actor) : null;
    return score({ scenario: sc, trace, workproduct, hiddenEntities: this.hidden(actor), knownPeople: this.people(), knownOrgs: this.orgs(), notes, mode: this.o.mode });
  }

  /** let the run reach a resting state, answering a clarification and taking the scenario's approval path */
  private async settle(runId: string, actor: Actor, sc: AgentEvalScenario) {
    const deadline = Date.now() + (this.o.waitMs ?? 240_000);
    let decided = false;
    while (Date.now() < deadline) {
      const b = this.orch.agents.body(runId, actor);
      if (!b) return;
      if (TERMINAL.includes(b.runStatus)) return;
      if (b.runStatus === 'WAITING_FOR_USER') {
        const q = this.orch.agents.openQuestion(b);
        if (q?.options?.length) { await this.orch.agents.decide(runId, actor, q.id, q.options[0]!.id); continue; }
        return;
      }
      if (b.runStatus === 'WAITING_FOR_CONFIRMATION') {
        const cp = b.checkpoints.find((c) => c.status === 'OPEN' && c.type === 'CONFIRMATION');
        if (!cp || decided || !sc.approval || sc.approval === 'NONE') return;
        decided = true;
        const choice = sc.approval === 'REJECT' ? 'cancel' : 'confirm';
        await this.orch.agents.decide(runId, actor, cp.id, choice);
        continue;
      }
      if (b.runStatus === 'WAITING_FOR_GOVERNED_APPROVAL' || b.runStatus === 'PAUSED') return;
      await sleep(this.o.mode === 'LIVE' ? 750 : 25);
    }
  }

  /** §12 — the same scenario N times, reported as a distribution */
  async repeat(sc: AgentEvalScenario, times: number): Promise<RepeatResult> {
    const results: ScenarioResult[] = [];
    for (let k = 0; k < times; k++) results.push(await this.run(sc));
    const q = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return { min: s[0] ?? 0, median: s[Math.floor(s.length / 2)] ?? 0, max: s[s.length - 1] ?? 0 }; };
    const known = sc.expectedFindings ?? [];
    return {
      scenarioId: sc.id, runs: results.length, passed: results.filter((r) => r.verdict === 'PASS').length,
      findingConsistency: known.map((e) => ({ id: e.id, label: e.label, foundIn: results.filter((r) => r.coverage?.found.some((f) => f.id === e.id)).length, of: results.length })),
      missFrequency: known.map((e) => ({ id: e.id, label: e.label, missedIn: results.filter((r) => r.coverage?.missed.some((m) => m.id === e.id)).length, of: results.length })),
      falsePositiveRate: results.length ? results.reduce((n, r) => n + (r.coverage?.falsePositives.length ?? 0), 0) / results.length : 0,
      latencyMs: q(results.map((r) => r.economics.latencyMs)),
      costUsd: q(results.map((r) => r.economics.estimatedCostUsd)),
      toolCalls: q(results.map((r) => r.economics.toolCalls)),
      results,
    };
  }
}

/**
 * A6 §3 — VARIANCE ACROSS REPEATS, AND WHAT IT MAY NOT HIDE.
 *
 * A frontier model is nondeterministic, so a scenario run three times is three samples of one behaviour, and the
 * honest report is a distribution. But a distribution is also how a serious failure disappears: "passed 2 of 3"
 * reads as mostly fine, and if the one failure was an unapproved write it is not mostly fine at all.
 *
 * So HARD failures are listed individually, every run that produced one, and they are never expressed as a rate.
 * A rate is for the things that genuinely vary — which finding a run happened to reach, what it cost, how long
 * it took. Whether it wrote something nobody approved does not vary; it either happened or it did not.
 */
export interface VarianceReport {
  scenarioId: string;
  runs: number;
  passed: number;
  findingConsistency: { id: string; label: string; severity: string; foundIn: number; of: number }[];
  missFrequency: { id: string; label: string; severity: string; missedIn: number; of: number }[];
  falsePositives: { total: number; perRun: number };
  /** §3 — every hard failure, every run it happened in. Never a rate. */
  hardFailures: { run: number; failure: string }[];
  latencyMs: { min: number; median: number; max: number };
  costUsd: { min: number; median: number; max: number };
  modelCalls: { min: number; median: number; max: number };
  toolCalls: { min: number; median: number; max: number };
}

const spread = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { min: s[0] ?? 0, median: s[Math.floor(s.length / 2)] ?? 0, max: s[s.length - 1] ?? 0 };
};

export function variance(sc: AgentEvalScenario, runs: ScenarioResult[]): VarianceReport {
  const known = sc.expectedFindings ?? [];
  return {
    scenarioId: sc.id, runs: runs.length, passed: runs.filter((r) => r.verdict === 'PASS').length,
    findingConsistency: known.map((e) => ({ id: e.id, label: e.label, severity: e.severity, foundIn: runs.filter((r) => r.coverage?.found.some((f) => f.id === e.id)).length, of: runs.length })),
    missFrequency: known.map((e) => ({ id: e.id, label: e.label, severity: e.severity, missedIn: runs.filter((r) => r.coverage?.missed.some((m) => m.id === e.id)).length, of: runs.length })),
    falsePositives: { total: runs.reduce((n, r) => n + (r.coverage?.falsePositives.length ?? 0), 0), perRun: runs.length ? runs.reduce((n, r) => n + (r.coverage?.falsePositives.length ?? 0), 0) / runs.length : 0 },
    hardFailures: runs.flatMap((r, k) => r.hardFailures.map((f) => ({ run: k + 1, failure: f }))),
    latencyMs: spread(runs.map((r) => r.economics.latencyMs)),
    costUsd: spread(runs.map((r) => r.economics.estimatedCostUsd)),
    modelCalls: spread(runs.map((r) => r.economics.modelCalls)),
    toolCalls: spread(runs.map((r) => r.economics.toolCalls)),
  };
}

/* ================================================================================================
   §14 — THE REGRESSION RECORD
   ================================================================================================ */
export function historyEntry(r: ScenarioResult, sc: AgentEvalScenario, cfg: SloaneConfig, mode: 'LIVE' | 'DETERMINISTIC', suite: string, baseline?: string): EvalHistoryEntry {
  let commit: string | null = null;
  try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { /* a build outside a checkout still records a result */ }
  /**
   * A6 §1 — MATCH ON THE ID AS WELL AS THE LABEL. The trace carries the profile's ID (`RECONCILIATION`) and this
   * looked only for its LABEL (`Reconciliation`), so `profileVersion` recorded 'none' on every entry ever written
   * — the one field §1 asks for that says whether a profile's CONTRACT changed between two baselines. Found by
   * reading the recorded history rather than the code that writes it.
   */
  const p = r.profile ? (Object.keys(POLICY_PROFILES) as ProfileId[]).find((id) => id === r.profile || POLICY_PROFILES[id].label === r.profile) : null;
  const prof = p ? POLICY_PROFILES[p] : null;
  /* the profile's VERSION is the shape of its contract: change an expectation and the history says so */
  const profileVersion = prof ? `${prof.id}/${(prof.evaluation?.required.length ?? 0) + (prof.evaluation?.prohibited.length ?? 0)}` : 'none';
  return {
    at: new Date().toISOString(), suite, scenarioId: sc.id, scenarioVersion: sc.version, dataset: sc.dataset,
    profile: r.profile, profileVersion,
    provider: cfg.provider, defaultModel: cfg.defaultModel, advancedModel: cfg.advancedModel, commit, mode,
    ...(baseline ? { baseline } : {}),
    verdict: r.verdict, hardFailures: r.hardFailures, missed: (r.coverage?.missed ?? []).map((m) => m.id),
    falsePositives: r.coverage?.falsePositives.length ?? 0, economics: r.economics,
  };
}
