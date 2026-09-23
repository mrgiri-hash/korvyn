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
import type { GovernedClaim } from '../v2/claims.js';
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
/**
 * A3 SS3 -- WHAT A GOAL CLASS WANTS TO PREPARE. An action's DOMAIN separates writing on a governed object
 * ('action') from building a deliverable ('build'), and that is the first thing a goal class has an opinion
 * about: a flux review prepares explanations, an analysis extension builds a workbook. 0 means not offered
 * unless the objective asked for that domain by name.
 */
const ACTION_WEIGHT: Record<GoalClass, Partial<Record<ActionDomain, number>>> = {
  ANOMALY_REVIEW: { action: 3, build: 1 },
  VARIANCE_EXPLANATION: { action: 3, build: 1 },
  CLOSE_READINESS: { action: 3, build: 1 },
  FLUX_REVIEW: { action: 3 },
  RECONCILIATION_REVIEW: { action: 3 },
  SUBJECT_INVESTIGATION: { action: 2, build: 2 },
  STATEMENT_REVIEW: { action: 2, build: 2 },
  REVIEW_PREPARATION: { action: 3, build: 2 },
  ANALYSIS_EXTENSION: { action: 2, build: 3 },
  EVIDENCE_REVIEW: { action: 3, build: 2 },
  OTHER: { action: 2, build: 2 },
};
/**
 * THE OBJECTS A GOAL CLASS IS ABOUT. The domain alone cannot separate two dozen 'action' tools, and a run
 * reviewing flux that is offered a reviewer assignment instead of a flux explanation has been given the
 * wrong capability however correct its domain. Every tool already DECLARES the governed objects it acts on
 * (`objectTypes`), so relevance is read from that rather than from its id -- a preparation capability added
 * later is ranked by what it acts on, with nothing here to extend.
 */
const ACTION_OBJECTS: Record<GoalClass, readonly string[]> = {
  ANOMALY_REVIEW: ['GOVERNED_LEDGER', 'FLUX', 'ACCOUNT'],
  VARIANCE_EXPLANATION: ['FLUX', 'ACCOUNT', 'ACCOUNT_GROUP'],
  CLOSE_READINESS: ['CLOSE', 'RECONCILIATION', 'FLUX'],
  FLUX_REVIEW: ['FLUX', 'ACCOUNT', 'ACCOUNT_GROUP'],
  RECONCILIATION_REVIEW: ['RECONCILIATION', 'EVIDENCE'],
  SUBJECT_INVESTIGATION: ['GOVERNED_LEDGER', 'ACCOUNT', 'FLUX'],
  STATEMENT_REVIEW: ['FLUX', 'ACCOUNT_GROUP', 'REPORT'],
  REVIEW_PREPARATION: ['FLUX', 'RECONCILIATION', 'CLOSE', 'REPORT', 'EXCEL_ARTIFACT'],
  ANALYSIS_EXTENSION: ['REPORT', 'EXCEL_ARTIFACT'],
  EVIDENCE_REVIEW: ['EVIDENCE', 'RECONCILIATION', 'SUPPORT_PACKAGE', 'EXCEL_ARTIFACT'],
  OTHER: [],
};
/** the goal class is about one of these objects, so an action on one of them is the relevant one */
const ACTION_OBJECT_BONUS = 25;
/**
 * AND AN ACTION ON AN OBJECT THE RUN ALREADY HOLDS. A workbook cannot be previewed, refined or generated before
 * one exists, so those capabilities are noise on the first step and the obvious next move once a build has run.
 * The referent kinds a run accumulates already say which objects it holds; this reads the same state the
 * argument scoring reads, one step further out.
 */
const REFERENT_OBJECT: Record<string, string> = {
  artifactId: 'EXCEL_ARTIFACT', reportId: 'REPORT', reconciliationId: 'RECONCILIATION', populationId: 'GOVERNED_LEDGER',
  account: 'ACCOUNT', pbcId: 'PBC_REQUEST', auditPopulationId: 'AUDIT_POPULATION', analysisId: 'ANALYSIS',
};
const ACTION_IN_HAND_BONUS = 15;
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
/**
 * A3 §3 — ACTION CAPABILITIES ARE DISCOVERED THE SAME WAY READS ARE, through this one filter. The caller says
 * which ACTION domains this run may prepare in (the profile's, intersected with what the actor may do); passing
 * none keeps the run read-only, which is what every profile at autonomy 1 does.
 *
 * Nothing about exposure is a permission: a tool shown here is still authorized at validation, gated by the
 * profile's `preparableActions`, classified by ActionGovernance and confirmed by a person before it writes.
 */
export const ACTION_DOMAINS = ['action', 'build'] as const;
export type ActionDomain = (typeof ACTION_DOMAINS)[number];
export function registry(allow: readonly SloaneTool[], actionDomains: readonly string[] = []): SloaneTool[] {
  return allow.filter((t) => {
    if (t.risk === 'READ') return (AGENT_DOMAINS as readonly string[]).includes(t.domain);
    return t.risk === 'PROPOSE' && actionDomains.includes(t.domain);
  });
}
export interface RelevanceState { goalClass: GoalClass | null; requested: string[]; used: string[]; referents: Record<string, boolean> }
/** the relevant subset: goal class, requested domains (tool discovery), the referents already in hand, what was used */
export function relevant(allow: readonly SloaneTool[], s: RelevanceState, max = 20, actionDomains: readonly string[] = []): SloaneTool[] {
  const w = s.goalClass ? WEIGHT[s.goalClass] : FIRST;
  const scored = registry(allow, actionDomains).map((t) => {
    /**
     * A3 §3 — AN ACTION IS RANKED THE SAME WAY A READ IS. Scoring every preparation capability alike left the
     * reserved slots in ALPHABETICAL order, so a run reviewing flux was offered four spreadsheet builders and a
     * report draft and never the flux explanation it existed to write (observed). Three signals decide, all of
     * them already declared on the tool: what the goal class wants to prepare (`ACTION_WEIGHT`), which governed
     * objects it is about (`ACTION_OBJECTS` against the tool's own `objectTypes`), and whether the referents its
     * arguments need are in hand.
     *
     * AND NOTHING IS OFFERED BEFORE THE RUN HAS READ SOMETHING. Preparation is the last thing a run does, not the
     * first: with no observations in hand there is nothing an action could be grounded in. This is relevance and
     * not permission — the gate is `profileGate`, and this only decides what is worth showing.
     */
    if (t.risk === 'PROPOSE') {
      if (!s.used.length) return { t, sc: 0 };
      const g = s.goalClass ?? 'OTHER';
      const sc = scoreRead(t, ACTION_WEIGHT[g], s).sc;
      const about = t.objectTypes.some((o) => ACTION_OBJECTS[g].includes(o));
      const held = Object.keys(s.referents).some((k) => s.referents[k] && t.objectTypes.includes(REFERENT_OBJECT[k] ?? ''));
      return { t, sc: sc + (about ? ACTION_OBJECT_BONUS : 0) + (held ? ACTION_IN_HAND_BONUS : 0) };
    }
    return scoreRead(t, w, s);
  });
  /**
   * A3 §3 — ACTIONS GET RESERVED SLOTS, or they are never offered at all. Reads outscore preparation by design
   * (evidence first), and with a single ranked list of 20 that meant every action fell off the end and the run
   * could only ever read — the capability existed and was structurally unreachable (observed). A small reserve
   * keeps preparation possible without letting it crowd out the reads that would ground it.
   */
  const acts = scored.filter((x) => x.t.risk === 'PROPOSE');
  if (!acts.length) return rank(scored, max);
  /**
   * THE RESERVE IS PER ACTION DOMAIN. One pool ranked together let the domain with more capabilities take every
   * slot: a controller review that must draft comments AND build the review package was shown four comment
   * tools and no builder, so the deliverable half of its own work was unreachable (observed). Writing on a
   * governed object and building a deliverable are different work, and a profile permitted both sees both.
   */
  const held = ACTION_DOMAINS.flatMap((d) => rank(acts.filter((x) => x.t.domain === d), ACTION_SLOTS[d]));
  return [...rank(scored.filter((x) => x.t.risk !== 'PROPOSE'), max - held.length), ...held];
}
/** how many of a step's capability slots are held for preparation in each action domain, once a run may prepare */
const ACTION_SLOTS: Record<ActionDomain, number> = { action: 4, build: 3 };
function scoreRead(t: SloaneTool, w: Partial<Record<string, number>>, s: RelevanceState) {
  {
    let sc = ((w as Record<string, number>)[t.domain] ?? 0) * 10;
    if (s.requested.includes(t.domain)) sc += 25;
    if (ALWAYS.includes(t.id)) sc += 40;
    if (s.used.includes(t.id)) sc += 3;
    for (const p of t.params) {
      if (s.referents[p.kind]) sc += 6;
      if (p.required && NEEDS_REF[p.kind] && !s.referents[p.kind]) sc -= 30;
    }
    return { t, sc };
  }
}
function rank(scored: { t: SloaneTool; sc: number }[], max: number): SloaneTool[] {
  return scored.filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || a.t.id.localeCompare(b.t.id)).slice(0, max).map((x) => x.t);
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
const REF_KEYS = /^(populationId|account|project|vendor|entity|reconciliationId|transactionId|journalId|largestAccount|largestProject|largestVendor|largestTransaction|largestJournal|explanationId|financialLineId|analysisId|auditPopulationId|artifactId|pbcId|reportId)$/;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/**
 * A1 §10 — the canonical FinancialFact ids for this object's facts, in the object's own fact order, or nothing.
 *
 * `CompactObservation.facts[].id` has always been declared and was only ever populated on the v2 conversational
 * path, so an agent's finding carried a figure's KEY and VALUE and no canonical handle: two surfaces reading the
 * same governed figure produced one citable fact and one uncitable one. The ids come from the SAME promotion the
 * conversation uses (`factsFrom`), which is deterministic over the object's identity — so a fact an agent cites and
 * a fact a conversation cites for the same figure are the same fact id. §24 forbids a second FinancialFact
 * implementation, and this is what honouring that looks like.
 */
export type FactIds = string[] | null;
export function compact(step: number, tool: string, purpose: string, o: FinancialObject | null, error: string | null, refused = false, factIds: FactIds = null): CompactObservation {
  const ref = `O${step}`;
  if (!o) {
    const x: CompactObservation = { ref, step, tool, purpose, status: refused ? 'REFUSED' : 'FAILED', objectId: null, type: null, title: purpose, period: '', scope: '', facts: [], columns: [], rows: [], rowCount: 0, population: null, refs: {}, note: cut(error ?? 'failed', 200), chars: 0 };
    x.chars = JSON.stringify(x).length; return x;
  }
  const cols = o.table.columns.slice(0, 5);
  const x: CompactObservation = {
    ref, step, tool, purpose: cut(purpose, 100), status: o.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'OK', objectId: o.id, type: o.type, title: cut(o.title, 110),
    period: o.periodLabel, scope: o.scope.name,
    /* PHASE 2.6 §12/§14 — TEN FACTS WAS THE DRIVER BUG'S ACCOMPLICE. A ranked statement comparison returns six
       movers (a label and a change each), the statement totals and its completeness metadata; at ten the model saw
       the first five movers and nothing about coverage, and could not tell a complete population from a truncated
       one. Twenty costs ~140 tokens on the few objects that carry that many and buys the whole ranking. */
    /* TWENTY WAS STILL SHORT, and the live smoke showed exactly what a missing fact costs. A ranked comparison
       carries five sections (a label and a change each), the statement totals, the account rows beneath them and
       its coverage; at twenty the ACCOUNT rows fell off the end, and the model — having no id for a figure it
       could see in the table — typed two of them and got both signs backwards, presenting increases as
       decreases. A figure with no fact id is a figure that gets typed. The ceiling costs ~200 tokens on the one
       or two objects that reach it and removes the incentive entirely. */
    facts: o.facts.slice(0, 28).map((f, i) => ({ key: f.key, label: cut(f.label, 60), value: cut(f.display, 60), ...(factIds?.[i] ? { id: factIds[i]! } : {}) })),
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
  /** A2 §9: capability ids whose DESCRIPTION the planner has already been sent in this run */
  described?: string[];
  /**
   * A2 §12: the objective was classified as turning on a JUDGMENT, so deeper reasoning is warranted — but not
   * yet. The first step decides what to READ, with no observations in hand; there is nothing to judge until
   * something has come back. Recorded here and spent from step 2 onward.
   */
  deepWarranted?: boolean;
  invalidStreak: number; rejectStreak: number;
  stopReason: string | null;
  synthesis: Synthesis | null;
  /**
   * A7 §6 — THE GOVERNED STATUSES THIS INVESTIGATION HAS READ. The agent path gets the same protection the
   * conversational one does and from the same verifier: a finding asserting that a reconciliation ties is
   * checked against the record that says whether it does. Accumulated as observations arrive, because that is
   * when the governed read happened and when its object identity is still attached.
   */
  claims: GovernedClaim[];
  startedAt: number;
}
export interface Synthesis {
  headline: string; inspected: string[];
  findings: { statement: string; kind: FindingKind; support: Support; observationRefs: string[] }[];
  unresolved: string[]; nextSteps: { label: string; request: string }[]; confidence: number;
  rejected: { statement: string; why: string }[];
  cls: CapabilityClass; model: string | null;
}
/**
 * A6 — THE FINDINGS A RUN HAS ESTABLISHED, WITH THEIR GOVERNED HANDLES, projected from the investigation itself
 * rather than from the finished result. Two things were wrong before this existed, and they were the same thing:
 *
 *   A RUN WAITING FOR A PERSON HAS ALREADY FOUND WHAT IT FOUND. `run.result` is materialised at SUMMARIZE, so a
 *   run stopped at a confirmation checkpoint — which is every prepare-first run, by design — projected NO findings
 *   at all. Measured live: a RECONCILIATION run held 8 findings in its synthesis and its trace reported zero, so
 *   the reviewer being asked to confirm an action saw prepared work with no analysis behind it, and the harness
 *   scored it as having established nothing.
 *
 *   A HANDLE MUST NAME SOMETHING GOVERNED. `objectId` is `RUN-…-x21-1`: unique to one run and resolvable to
 *   nothing. The observation already carries the refs the read returned — reconciliation, account, entity,
 *   population — filtered to identities, never a status.
 *
 * The runtime's own result and the trace both read THIS, so the two can no longer say different things.
 */
export function findingsOf(S: InvestigationState | null | undefined) {
  const handles = (ref: string): string[] => {
    const o = S?.observations.find((x) => x.ref === ref);
    return o ? [o.objectId, ...Object.values(o.refs ?? {})].filter((x): x is string => !!x) : [];
  };
  return (S?.synthesis?.findings ?? []).map((f) => ({ statement: f.statement, kind: f.kind as string, support: f.support as string, observationRefs: f.observationRefs, objectIds: [...new Set(f.observationRefs.flatMap(handles))] }));
}
export function newInvestigation(): InvestigationState {
  return { goalClass: null, understanding: null, budget: defaultBudget(), usage: emptyUsage(), notes: [], openQuestions: [], observations: [], rejected: [], requested: [], steps: [], escalations: [], nextClass: 'M2', invalidStreak: 0, rejectStreak: 0, stopReason: null, synthesis: null, claims: [], described: [], startedAt: Date.now() };
}
export interface FinancialFrame { objective: string; period: string; comparisonPeriod: string | null; governedPeriods: string[]; workingPeriod: string; scope: string; subject: Record<string, string | null>; constraints: { exclude: string[]; focusFirst: string[]; instructions: string[] }; activeAnalysis: unknown | null; actorRole: string }
const FULL_KEEP = 4;
/** what the model sees at a THINK step: the goal and frame, the working notes, the last few observations in full and the
 *  rest as digests, open questions, what was refused, and the relevant capabilities — never the conversation or raw rows */
/**
 * A2 §5/§9 — the planner's BRIEF comes from the profile, so a specialist differs by configuration and not by code,
 * and the CAPABILITY CATALOGUE is sent once. The tool descriptions are ~750 tokens a step and do not change between
 * steps of a run; after the first step only the ids are repeated, with the descriptions of any capability newly
 * exposed. "Context is available, not imposed" applied to the one block that was fully redundant every time.
 */
export interface ProfileBrief { label: string; purpose: string; completion: string[]; autonomy: number }
export function contextFor(s: InvestigationState, f: FinancialFrame, caps: readonly SloaneTool[], allDomains: string[], brief?: ProfileBrief, describedAlready: ReadonlySet<string> = new Set()) {
  const obs = s.observations;
  const full = obs.slice(-FULL_KEEP), older = obs.slice(0, Math.max(0, obs.length - FULL_KEEP));
  const shownDomains = [...new Set(caps.map((t) => t.domain))];
  const fresh = caps.filter((t) => !describedAlready.has(t.id));
  return {
    objective: f.objective,
    ...(brief ? { brief: { role: brief.label, purpose: brief.purpose, doneWhen: brief.completion, mayPrepare: brief.autonomy >= 2 } } : {}),
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
    /* every capability available now, by id (the tool enum is what the model may name); the DESCRIPTIONS only for
       the ones it has not been shown before in this run */
    capabilities: fresh.map(capabilityOf),
    ...(fresh.length < caps.length ? { capabilitiesAlsoAvailable: caps.filter((t) => describedAlready.has(t.id)).map((t) => t.id) } : {}),
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
