/**
 * PHASE 8D — OPEN-ENDED FINANCIAL INVESTIGATION: the pieces the agent loop is made of.
 *
 * The user states an OBJECTIVE ("something looks off with June", "prepare me for the CFO review"). No handler knows the
 * words. The runtime runs a loop of THINK steps: at each one the model receives a COMPACT, Korvyn-built context — the goal,
 * the resolved financial context, what has been observed so far, its own working notes, open questions and a RELEVANT
 * subset of governed capabilities — and decides the next governed tool call(s), asks, or synthesizes. Korvyn executes each
 * call through the same validation and permission path as every other step, compacts the result into an observation, and
 * the next THINK sees it. The plan is never known up front.
 *
 *   capabilities    the registry of governed READ capabilities (the existing tools) with a capability class, and the
 *                   relevance filter that shows the model only what fits the goal, the state and the referents
 *   observations    a tool result as a compact structured observation — never the rows (populations stay in Korvyn)
 *   context         the ContextCompactor: conclusions, canonical ids, populations, open questions, constraints kept;
 *                   narration, duplicate results and obsolete plans dropped; older observations reduced to digests
 *   grounding       a finding may state a figure only if an observation carried it
 *   budget          explicit per-run budgets (model calls, iterations, tool calls, tokens, estimated cost) and usage
 *   routing         capability classes D0–M4 per STEP, and progressive escalation with a recorded reason
 *
 * The LLM reasons and composes; Korvyn owns facts, calculations, permissions, populations, evidence, workflow and state.
 */
import { toolRegistry, type Actor, type FinancialObject, type SloaneTool } from '../tools.js';
import { periodLabel } from '../financials.js';
import { FLUX_MATERIALITY, TIE_TOLERANCE_USD } from '../controls.js';

/* ================================================================================================
   CAPABILITY CLASSES — per step, never per session
   ================================================================================================ */
/** D0 deterministic (a governed tool) · M1 lightweight · M2 general reasoning · M3 advanced investigation · M4 frontier */
export type CapabilityClass = 'D0' | 'M1' | 'M2' | 'M3' | 'M4';
/** how a class maps onto the configured routes: M2 is ANTHROPIC_DEFAULT_MODEL; M3/M4 are ANTHROPIC_ADVANCED_MODEL */
export const CLASS_ROUTE: Record<Exclude<CapabilityClass, 'D0'>, 'NARRATE' | 'FAST' | 'DEEP'> = { M1: 'NARRATE', M2: 'FAST', M3: 'DEEP', M4: 'DEEP' };

export const GOAL_CLASSES = ['ANOMALY_REVIEW', 'VARIANCE_EXPLANATION', 'CLOSE_READINESS', 'FLUX_REVIEW', 'RECONCILIATION_REVIEW', 'SUBJECT_INVESTIGATION',
  'STATEMENT_REVIEW', 'REVIEW_PREPARATION', 'ANALYSIS_EXTENSION', 'EVIDENCE_REVIEW', 'OTHER'] as const;
export type GoalClass = (typeof GOAL_CLASSES)[number];
export const AGENT_DOMAINS = ['financials', 'tb', 'ledger', 'analysis', 'flux', 'recon', 'close', 'reporting', 'audit', 'evidence', 'trace', 'find', 'semantic'] as const;
export type AgentDomain = (typeof AGENT_DOMAINS)[number];
export const ESCALATION_REASONS = ['MATERIAL_JUDGMENT', 'CONFLICTING_EVIDENCE', 'AMBIGUITY', 'LOW_CONFIDENCE', 'COMPLEX_CROSS_DOMAIN'] as const;
export const SUPPORT = ['SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNRESOLVED', 'CONFLICTING', 'NOT_AVAILABLE'] as const;
export const FINDING_KINDS = ['OBSERVED_FACT', 'EVIDENCE', 'INFERENCE', 'DRAFT_EXPLANATION', 'UNRESOLVED_QUESTION'] as const;
export type Support = (typeof SUPPORT)[number];
export type FindingKind = (typeof FINDING_KINDS)[number];

/* ================================================================================================
   BUDGET — no unbounded loop
   ================================================================================================ */
export interface AgentBudget { maxIterations: number; maxModelCalls: number; maxToolCalls: number; maxInputTokens: number; maxOutputTokens: number; maxEstimatedCostUsd: number; maxEscalations: number; maxElapsedMs: number }
export interface AgentUsage { iterations: number; modelCalls: number; toolCalls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; estimatedCostUsd: number; largestContextChars: number; observationChars: number; escalations: number; elapsedMs: number }
const envNum = (k: string, d: number) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : d; };
export function defaultBudget(): AgentBudget {
  return {
    maxIterations: envNum('SLOANE_AGENT_MAX_ITERATIONS', 8), maxModelCalls: envNum('SLOANE_AGENT_MAX_MODEL_CALLS', 12), maxToolCalls: envNum('SLOANE_AGENT_MAX_TOOL_CALLS', 20),
    maxInputTokens: envNum('SLOANE_AGENT_MAX_INPUT_TOKENS', 160_000), maxOutputTokens: envNum('SLOANE_AGENT_MAX_OUTPUT_TOKENS', 24_000),
    maxEstimatedCostUsd: envNum('SLOANE_AGENT_MAX_COST_USD', 1.0), maxEscalations: envNum('SLOANE_AGENT_MAX_ESCALATIONS', 2), maxElapsedMs: envNum('SLOANE_AGENT_MAX_ELAPSED_MS', 240_000),
  };
}
export const emptyUsage = (): AgentUsage => ({ iterations: 0, modelCalls: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0, largestContextChars: 0, observationChars: 0, escalations: 0, elapsedMs: 0 });
/** the first budget a THINK step would break, or null — checked BEFORE the call, so the loop never overruns */
export function budgetExhausted(b: AgentBudget, u: AgentUsage): string | null {
  if (u.iterations >= b.maxIterations) return `iteration budget (${b.maxIterations}) reached`;
  if (u.modelCalls >= b.maxModelCalls - 1) return `model-call budget (${b.maxModelCalls}) reached — one call is kept for the synthesis`;
  if (u.toolCalls >= b.maxToolCalls) return `tool-call budget (${b.maxToolCalls}) reached`;
  if (u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens >= b.maxInputTokens) return `input-token budget (${b.maxInputTokens}) reached`;
  if (u.outputTokens >= b.maxOutputTokens) return `output-token budget (${b.maxOutputTokens}) reached`;
  if (u.estimatedCostUsd >= b.maxEstimatedCostUsd * 0.9) return `estimated-cost budget ($${b.maxEstimatedCostUsd.toFixed(2)}) nearly reached`;
  if (u.elapsedMs >= b.maxElapsedMs) return `time budget (${Math.round(b.maxElapsedMs / 1000)}s) reached`;
  return null;
}

/* ---- estimated cost: list prices (USD per 1M tokens), overridable with SLOANE_MODEL_PRICES as JSON ---------------- */
interface Price { input: number; output: number; cacheWrite: number; cacheRead: number }
/* Anthropic first-party list prices as published for these models (claude-api reference, cached 2026-06-24); cache
   writes bill at ~1.25× input and reads at ~0.1×. An ESTIMATE: the invoice is authoritative. */
const LIST: Record<string, Price> = {
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};
function prices(): Record<string, Price> { try { return { ...LIST, ...(process.env['SLOANE_MODEL_PRICES'] ? JSON.parse(process.env['SLOANE_MODEL_PRICES']) as Record<string, Price> : {}) }; } catch { return LIST; } }
export function estimateCost(model: string | null, u: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }): number {
  const p = model ? prices()[model] : undefined;
  if (!p) return 0;
  return (u.inputTokens * p.input + u.outputTokens * p.output + (u.cacheReadTokens ?? 0) * p.cacheRead + (u.cacheWriteTokens ?? 0) * p.cacheWrite) / 1e6;
}

/* ================================================================================================
   THE CAPABILITY REGISTRY and its RELEVANCE FILTER
   ================================================================================================ */
export interface Capability { id: string; domain: string; cls: 'D0'; description: string; args: string[] }
/** how much each goal class wants each domain (0 = not offered unless asked for) */
const WEIGHT: Record<GoalClass, Partial<Record<AgentDomain, number>>> = {
  ANOMALY_REVIEW: { financials: 3, analysis: 3, ledger: 2, flux: 2, trace: 1, semantic: 1, evidence: 1 },
  VARIANCE_EXPLANATION: { financials: 3, analysis: 3, ledger: 2, flux: 3, tb: 1, trace: 1, semantic: 1 },
  CLOSE_READINESS: { close: 3, recon: 3, flux: 2, evidence: 1, semantic: 1 },
  FLUX_REVIEW: { flux: 3, analysis: 2, financials: 2, close: 1, ledger: 1, evidence: 1 },
  RECONCILIATION_REVIEW: { recon: 3, evidence: 2, close: 1, ledger: 1, semantic: 1 },
  SUBJECT_INVESTIGATION: { analysis: 3, ledger: 3, semantic: 2, financials: 1, evidence: 1, flux: 1, trace: 1 },
  STATEMENT_REVIEW: { financials: 3, analysis: 2, flux: 2, tb: 1, recon: 1 },
  REVIEW_PREPARATION: { financials: 2, close: 2, flux: 2, recon: 2, analysis: 2, semantic: 1 },
  ANALYSIS_EXTENSION: { analysis: 3, ledger: 2, financials: 1, flux: 1, trace: 1, semantic: 1 },
  EVIDENCE_REVIEW: { evidence: 3, ledger: 2, recon: 1, trace: 2 },
  OTHER: { financials: 2, analysis: 2, close: 1, flux: 1, recon: 1, semantic: 2 },
};
/** before the goal class is known: a broad, capped first view */
const FIRST: Partial<Record<AgentDomain, number>> = { financials: 3, analysis: 2, flux: 2, close: 2, recon: 1, ledger: 1, semantic: 2 };
/** always offered: resolving what the words name is the start of every investigation */
const ALWAYS = ['resolveFinancialObject', 'resolveFinancialPeriod', 'findGovernedObjects'];
/** a required argument of these kinds can only be filled from an earlier result — the tool is premature without one */
const NEEDS_REF: Record<string, string> = { populationId: 'populationId', reconciliationId: 'reconciliationId', transactionId: 'transactionId', journalId: 'journalId', auditPopulationId: 'auditPopulationId', pbcId: 'pbcId', reportId: 'reportId' };

export function capabilityOf(t: SloaneTool): Capability {
  const d = t.description.split(/(?<=\.)\s/)[0]!.slice(0, 150);
  return { id: t.id, domain: t.domain, cls: 'D0', description: d, args: t.params.map((p) => `${p.name}:${p.kind}${p.required ? '*' : ''}`) };
}
/** every governed READ capability this actor may use, in the investigation domains — the registry the filter chooses from */
export function registry(allow: readonly SloaneTool[]): SloaneTool[] {
  return allow.filter((t) => t.risk === 'READ' && (AGENT_DOMAINS as readonly string[]).includes(t.domain));
}
export interface RelevanceState { goalClass: GoalClass | null; requested: string[]; used: string[]; referents: Record<string, boolean> }
/** the relevant subset: goal class, requested domains (tool discovery), the referents already in hand, what was used */
export function relevant(allow: readonly SloaneTool[], s: RelevanceState, max = 20): SloaneTool[] {
  const w = s.goalClass ? WEIGHT[s.goalClass] : FIRST;
  const scored = registry(allow).map((t) => {
    let sc = ((w as Record<string, number>)[t.domain] ?? 0) * 10;
    if (s.requested.includes(t.domain)) sc += 25;
    if (ALWAYS.includes(t.id)) sc += 40;
    if (s.used.includes(t.id)) sc += 3;
    for (const p of t.params) {
      if (s.referents[p.kind]) sc += 6;
      if (p.required && NEEDS_REF[p.kind] && !s.referents[p.kind]) sc -= 30;
    }
    return { t, sc };
  }).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || a.t.id.localeCompare(b.t.id));
  return scored.slice(0, max).map((x) => x.t);
}

/* ================================================================================================
   OBSERVATIONS — compact, structured; the rows stay in Korvyn
   ================================================================================================ */
export interface CompactObservation {
  ref: string; step: number; tool: string; purpose: string; status: 'OK' | 'UNAVAILABLE' | 'FAILED' | 'REFUSED';
  objectId: string | null; type: string | null; title: string; period: string; scope: string;
  /** `id` is the Phase 2 canonical factId, present when a fact registry promoted the object's facts */
  facts: { key: string; label: string; value: string; id?: string }[];
  columns: string[];
  rows: { label: string; values: string[]; ref?: string }[];
  rowCount: number;
  population: { populationId: string; rowCount: number } | null;
  refs: Record<string, string>;
  note: string | null;
  chars: number;
}
/**
 * The refs a NEXT STEP can act on. Phase 2 §10: a drill continues by naming the object it is drilling into, so
 * the population's own largest line and that line's journal belong here — without them "where did that line come
 * from?" has nothing to point at and the chain stops at the population. Same for the explanation and statement
 * records a governed figure already knows about.
 */
const REF_KEYS = /^(populationId|account|project|vendor|entity|reconciliationId|transactionId|journalId|largestAccount|largestProject|largestVendor|largestTransaction|largestJournal|explanationId|financialLineId|analysisId|auditPopulationId)$/;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export function compact(step: number, tool: string, purpose: string, o: FinancialObject | null, error: string | null, refused = false): CompactObservation {
  const ref = `O${step}`;
  if (!o) {
    const x: CompactObservation = { ref, step, tool, purpose, status: refused ? 'REFUSED' : 'FAILED', objectId: null, type: null, title: purpose, period: '', scope: '', facts: [], columns: [], rows: [], rowCount: 0, population: null, refs: {}, note: cut(error ?? 'failed', 200), chars: 0 };
    x.chars = JSON.stringify(x).length; return x;
  }
  const cols = o.table.columns.slice(0, 5);
  const x: CompactObservation = {
    ref, step, tool, purpose: cut(purpose, 100), status: o.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'OK', objectId: o.id, type: o.type, title: cut(o.title, 110),
    period: o.periodLabel, scope: o.scope.name,
    facts: o.facts.slice(0, 10).map((f) => ({ key: f.key, label: cut(f.label, 60), value: cut(f.display, 60) })),
    columns: cols, rows: o.table.rows.slice(0, 6).map((r) => ({ label: cut(r.label, 70), values: r.cells.slice(0, 5).map((c) => cut(c, 40)), ...(r.ref ? { ref: r.ref } : {}) })),
    rowCount: o.table.rows.length,
    population: o.population ? { populationId: o.population.populationId, rowCount: o.population.rowCount } : null,
    refs: Object.fromEntries(Object.entries(o.refs).filter(([k]) => REF_KEYS.test(k)).slice(0, 8)),
    note: o.unavailable ? cut(o.unavailable.reason, 200) : null, chars: 0,
  };
  x.chars = JSON.stringify(x).length;
  return x;
}
/** an older observation, reduced to what a later step can still act on: the ref, the result, the ids, three facts */
export function digest(o: CompactObservation): string {
  const f = o.facts.slice(0, 3).map((x) => `${x.label}: ${x.value}`).join('; ');
  const ids = [o.population ? `pop ${o.population.populationId} (${o.population.rowCount} rows)` : null, ...Object.entries(o.refs).slice(0, 3).map(([k, v]) => `${k}=${v}`)].filter(Boolean).join(', ');
  return cut(`${o.ref} ${o.tool} [${o.status}] ${o.title}${f ? ` — ${f}` : ''}${ids ? ` · ${ids}` : ''}${o.note ? ` · ${o.note}` : ''}`, 320);
}
/** the referent kinds already in hand — what makes a follow-up tool possible */
export function referentsOf(obs: CompactObservation[], seed: Record<string, string | null>): Record<string, boolean> {
  const r: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(seed)) if (v) r[k] = true;
  for (const o of obs) {
    if (o.population) r['populationId'] = true;
    for (const k of Object.keys(o.refs)) r[k === 'largestAccount' ? 'account' : k === 'largestProject' ? 'project' : k === 'largestVendor' ? 'vendor' : k] = true;
    for (const row of o.rows) if (row.ref) { const kind = row.ref.split(':')[0]!; r[kind === 'recon' ? 'reconciliationId' : kind === 'txn' ? 'transactionId' : kind] = true; }
  }
  return r;
}

/* ================================================================================================
   THE CONTEXT COMPACTOR
   ================================================================================================ */
export interface WorkingNote { text: string; support: Support; observationRefs: string[]; iteration: number }
export interface InvestigationState {
  goalClass: GoalClass | null;
  understanding: string | null;
  budget: AgentBudget; usage: AgentUsage;
  notes: WorkingNote[];
  openQuestions: string[];
  observations: CompactObservation[];
  /** calls Korvyn refused or could not validate — the model sees them, so it does not repeat them */
  rejected: { iteration: number; tool: string; why: string }[];
  /** domains the model asked to see (tool discovery) */
  requested: string[];
  /** per THINK step: what the model was shown and what it chose — the development trace */
  steps: { iteration: number; cls: CapabilityClass; model: string | null; decision: string; calls: { tool: string; args: Record<string, string>; purpose: string }[]; capabilitiesShown: number; contextChars: number; confidence: number | null; escalated: string | null; latencyMs: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; error?: string | null }[];
  escalations: { at: string; iteration: number; from: CapabilityClass; to: CapabilityClass; reason: string; detail: string }[];
  nextClass: CapabilityClass;
  invalidStreak: number; rejectStreak: number;
  stopReason: string | null;
  synthesis: Synthesis | null;
  startedAt: number;
}
export interface Synthesis {
  headline: string; inspected: string[];
  findings: { statement: string; kind: FindingKind; support: Support; observationRefs: string[] }[];
  unresolved: string[]; nextSteps: { label: string; request: string }[]; confidence: number;
  rejected: { statement: string; why: string }[];
  cls: CapabilityClass; model: string | null;
}
export function newInvestigation(): InvestigationState {
  return { goalClass: null, understanding: null, budget: defaultBudget(), usage: emptyUsage(), notes: [], openQuestions: [], observations: [], rejected: [], requested: [], steps: [], escalations: [], nextClass: 'M2', invalidStreak: 0, rejectStreak: 0, stopReason: null, synthesis: null, startedAt: Date.now() };
}
export interface FinancialFrame { objective: string; period: string; comparisonPeriod: string | null; governedPeriods: string[]; workingPeriod: string; scope: string; subject: Record<string, string | null>; constraints: { exclude: string[]; focusFirst: string[]; instructions: string[] }; activeAnalysis: unknown | null; actorRole: string }
const FULL_KEEP = 4;
/** what the model sees at a THINK step: the goal and frame, the working notes, the last few observations in full and the
 *  rest as digests, open questions, what was refused, and the relevant capabilities — never the conversation or raw rows */
export function contextFor(s: InvestigationState, f: FinancialFrame, caps: readonly SloaneTool[], allDomains: string[]) {
  const obs = s.observations;
  const full = obs.slice(-FULL_KEEP), older = obs.slice(0, Math.max(0, obs.length - FULL_KEEP));
  const shownDomains = [...new Set(caps.map((t) => t.domain))];
  return {
    objective: f.objective,
    goalClass: s.goalClass, understanding: s.understanding,
    financialContext: {
      period: `${f.period} (${periodLabel(f.period)})`, comparisonPeriod: f.comparisonPeriod, workingPeriod: f.workingPeriod, governedPeriods: f.governedPeriods,
      scope: f.scope, book: 'CORE-GL', basis: 'US GAAP', lens: 'Corporate Consolidated', currency: 'USD', subject: Object.fromEntries(Object.entries(f.subject).filter(([, v]) => v)),
      materiality: { fluxMaterialUsd: FLUX_MATERIALITY.absUsd, fluxMinimumUsd: FLUX_MATERIALITY.minUsd, fluxPct: FLUX_MATERIALITY.pct, reconTieToleranceUsd: TIE_TOLERANCE_USD, source: 'the governed flux materiality policy and reconciliation tie tolerance' },
      activeAnalysis: f.activeAnalysis, actorRole: f.actorRole,
    },
    constraints: f.constraints,
    iteration: s.usage.iterations + 1,
    budget: { iterationsLeft: s.budget.maxIterations - s.usage.iterations, toolCallsLeft: s.budget.maxToolCalls - s.usage.toolCalls },
    workingNotes: s.notes.slice(-12).map((n) => ({ text: n.text, support: n.support, refs: n.observationRefs })),
    openQuestions: s.openQuestions.slice(-6),
    observations: full,
    earlierObservations: older.map(digest),
    refusedCalls: s.rejected.slice(-6),
    capabilities: caps.map(capabilityOf),
    otherDomains: allDomains.filter((d) => !(shownDomains as string[]).includes(d)),
  };
}
/** the synthesis sees every observation (digests for the older ones, the recent in full) and the notes */
export function synthesisContext(s: InvestigationState, f: FinancialFrame) {
  const obs = s.observations;
  return {
    objective: f.objective, goalClass: s.goalClass, understanding: s.understanding,
    financialContext: { period: `${f.period} (${periodLabel(f.period)})`, scope: f.scope, subject: Object.fromEntries(Object.entries(f.subject).filter(([, v]) => v)), currency: 'USD', basis: 'US GAAP', materiality: { fluxMaterialUsd: FLUX_MATERIALITY.absUsd, reconTieToleranceUsd: TIE_TOLERANCE_USD } },
    constraints: f.constraints,
    workingNotes: s.notes.slice(-16).map((n) => ({ text: n.text, support: n.support, refs: n.observationRefs })),
    openQuestions: s.openQuestions.slice(-8),
    observations: obs.slice(-8),
    earlierObservations: obs.slice(0, Math.max(0, obs.length - 8)).map(digest),
    stopReason: s.stopReason,
  };
}

/* ================================================================================================
   GROUNDING — a finding states a figure only if an observation carried it
   ================================================================================================ */
const NUM = /\(?[$£€]?\d[\d,]*(?:\.\d+)?[MKB%]?\)?/g;
const norm = (t: string) => t.replace(/[(),$£€\s]/g, '').replace(/^-/, '');
export function allowedNumbers(obs: CompactObservation[]): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => { for (const t of s.match(NUM) ?? []) { const n = norm(t); out.add(n); out.add(n.replace(/[MKB%]$/, '')); } };
  /* the governed policy figures the frame gives the model (materiality, tie tolerance) are facts too — citing them is not
     computing a number */
  for (const v of [FLUX_MATERIALITY.absUsd, FLUX_MATERIALITY.minUsd, TIE_TOLERANCE_USD]) add(`${v} $${v.toLocaleString('en-US')} ${v / 1e6}M ${v / 1e3}K`);
  add(`${FLUX_MATERIALITY.pct * (FLUX_MATERIALITY.pct < 1 ? 100 : 1)}%`);
  for (const o of obs) { add(o.title); add(o.period); for (const f of o.facts) { add(f.value); add(f.label); } for (const r of o.rows) { add(r.label); r.values.forEach(add); } if (o.population) out.add(String(o.population.rowCount)); out.add(String(o.rowCount)); }
  return out;
}
/** @returns the numbers in a statement that no observation carried (years, small ordinals and period codes are allowed) */
export function ungrounded(text: string, allowed: Set<string>): string[] {
  return (text.match(NUM) ?? []).map(norm).filter((n) => n && !allowed.has(n) && !allowed.has(n.replace(/[MKB%]$/, '')) && !/^(19|20)\d\d$/.test(n) && !/^\d$/.test(n) && !/^(1[0-2])$/.test(n) && !/^20\d\d-\d\d$/.test(n));
}

/* ================================================================================================
   ESCALATION — attempt at the lowest proven class; escalate for a stated reason
   ================================================================================================ */
export function escalate(s: InvestigationState, reason: string, detail: string): boolean {
  if (s.usage.escalations >= s.budget.maxEscalations || s.nextClass === 'M3') return false;
  s.escalations.push({ at: new Date().toISOString(), iteration: s.usage.iterations, from: s.nextClass, to: 'M3', reason, detail: detail.slice(0, 200) });
  s.nextClass = 'M3'; s.usage.escalations += 1;
  return true;
}
/** after an escalated step the next step returns to the default class unless the reason still holds */
export function relax(s: InvestigationState) { if (s.nextClass === 'M3') s.nextClass = 'M2'; }

/** the progress line a person sees — the model's words, bounded, never a figure it has not observed and never a tool id */
export function progressLine(text: string, tool: string): string {
  const t = (text || '').replace(/\s+/g, ' ').trim().replace(/[.…]+$/, '');
  if (!t || /[{}<>]/.test(t) || t.includes(tool)) return `Checking ${toolRegistry.get(tool)?.domain ?? 'the ledger'}`;
  return cut(t.charAt(0).toUpperCase() + t.slice(1), 70);
}
/** the actor's permitted referent seed for a goal — only canonical ids the resolver produced */
export const seedReferents = (subject: Record<string, string | null>) => Object.fromEntries(Object.entries(subject).map(([k, v]) => [k, v])) as Record<string, string | null>;
export type { Actor };
