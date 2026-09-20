/**
 * PHASE 2 — CANONICAL FINANCIAL FACTS (§1–§9, §31, §35, §36).
 *
 * THE TRUST PRINCIPLE, AND WHY THIS FILE EXISTS.
 *
 * Phase 1.5 proved a figure the only way it could: after the model had written a sentence, a regular expression
 * looked for that number somewhere in the tool results. It measured honestly — 8% of answers stated a figure
 * Korvyn could not point at — and it could never do better than measure, because by the time it ran the number
 * was already a string in a sentence. A string cannot carry a sign convention, an object, a period or a scope.
 * "$1.20M" read against a tool result holding "($1.20M)" is a match, and it is the opposite number.
 *
 * So the order is inverted:
 *
 *   MODEL REASONS → KORVYN PROVIDES CANONICAL FACTS → MODEL REFERENCES FACTS → KORVYN RENDERS THE VALUE
 *
 * The model never writes an authoritative figure. It writes `{{FACT:f_3k9…}}`, and Korvyn substitutes the governed
 * `displayValue` at render time. Sign safety (§5) and object safety (§6) then hold by CONSTRUCTION rather than by
 * inspection: there is no step at which a number can drift, because the model never held one.
 *
 * WHAT THIS FILE DOES NOT DO. It computes nothing. Every value here was already produced by a governed service and
 * arrives on a `FinancialObject.facts[]`; this layer gives that value an identity, a measure, a lineage and a set
 * of drills. A second accounting engine would be the one thing that could make the figures wrong again.
 */
import { createHash } from 'node:crypto';
import type { FinancialObject } from '../tools.js';

/* ================================================================================================
   §3 — THE FACT KINDS
   ================================================================================================ */

/**
 * What KIND of claim a value is. The distinction that matters most is the last one: a model's reading of a
 * situation is not a governed figure, and the taxonomy exists so it can never be presented as one.
 */
export const FACT_KINDS = [
  /** a direct authoritative result from a Korvyn finance service */
  'GOVERNED',
  /** a deterministic calculation over governed facts — Korvyn's arithmetic, never the model's */
  'DERIVED',
  /** a system-generated analytical signal (a concentration, an anomaly score) — real, and not a balance */
  'HEURISTIC',
  /** the model's interpretation. Never authoritative, never rendered as a governed value */
  'MODEL_INFERENCE',
  /** work product not yet approved — a drafted explanation */
  'DRAFT',
  /** a human-approved governed narrative or conclusion */
  'APPROVED',
  /** Korvyn cannot currently support the assertion at all */
  'UNKNOWN',
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

/** the kinds a renderer may present as this company's financial truth */
const AUTHORITATIVE: ReadonlySet<FactKind> = new Set<FactKind>(['GOVERNED', 'DERIVED', 'APPROVED']);
export const isAuthoritative = (k: FactKind) => AUTHORITATIVE.has(k);

/* ================================================================================================
   §13 — MEASURE SEMANTICS: A STOCK IS NOT A FLOW
   ================================================================================================ */

/**
 * Phase 1.5 left a real defect: "capex" resolved to CIP and PP&E accounts, and a question about SPEND came back
 * with a BALANCE. The accounts were right and the measure was wrong, which is the harder kind of wrong — every
 * number on screen is a real governed figure and the answer is still false.
 *
 * A measure is what a figure IS, independent of which accounts produced it. It is carried on the fact so a
 * renderer, a drill and a later turn all read the same thing.
 */
export const MEASURES = [
  'BALANCE',          // a position at a point in time
  'ACTIVITY',         // what posted in a window
  'PERIOD_MOVEMENT',  // the change in a balance across a window
  'YTD_ACTIVITY',
  'RUN_RATE',
  'RATIO',
  'COUNT',
  'VARIANCE',         // one figure less another
  'PERCENT_CHANGE',
  'CONTRIBUTION',     // a part's share of a whole
  /** a governed amount whose measure the producing service did not state; honest, and not a guess */
  'AMOUNT',
] as const;
export type Measure = (typeof MEASURES)[number];

/** measures that answer "as at", against those that answer "over" — the distinction §13 is about */
export const isStock = (m: Measure) => m === 'BALANCE';
export const isFlow = (m: Measure) => m === 'ACTIVITY' || m === 'PERIOD_MOVEMENT' || m === 'YTD_ACTIVITY' || m === 'RUN_RATE';

/* ================================================================================================
   §8 — DRILLS
   ================================================================================================ */

export const DRILLS = [
  'STATEMENT_LINE', 'ACCOUNT_GROUP', 'ACCOUNT', 'TB_POPULATION', 'GL_POPULATION',
  'JOURNAL', 'SOURCE_REFERENCE', 'EVIDENCE',
] as const;
export type Drill = (typeof DRILLS)[number];

/* ================================================================================================
   §2 — THE CONTRACT
   ================================================================================================ */

/** §31 — whether the amount has been tested against a governed tie-out. Never invented. */
export type TieStatus = 'TIES' | 'PARTIALLY_TIES' | 'DOES_NOT_TIE' | 'NOT_TESTED';

/** §7/§32/§33/§34 — where the figure came from and what already speaks to it */
export interface FactTrace {
  /** the population Korvyn can page, export and drill */
  populationId?: string;
  /** governed account or account-group codes behind the figure */
  accountIds?: string[];
  statementLineIds?: string[];
  journalId?: string;
  transactionId?: string;
  /** an ERP reference where the source system publishes one; never fabricated */
  sourceRef?: string;
  fluxItemId?: string;
  fluxExplanationId?: string;
  explanationStatus?: string;
  reconciliationId?: string;
  reconciliationStatus?: string;
  evidenceIds?: string[];
}

export interface FinancialFact {
  factId: string;
  kind: FactKind;
  /** what the figure is ABOUT: the concept or object type, in Korvyn's own vocabulary */
  semanticType: string;
  measure: Measure;
  label: string;
  rawValue: number | string;
  /** §4 — the ONE string a renderer may present. Produced by the governed service, never reformatted */
  displayValue: string;
  /** §5 — carried explicitly so no downstream step has to read it back out of a formatted string */
  sign: 'POSITIVE' | 'NEGATIVE' | 'ZERO' | 'NOT_NUMERIC';
  unit: string;
  currency: string | null;
  period: string;
  scope: string;
  book: string;
  basis: string;
  lens: string;
  /** §6 — the governed objects this figure belongs to. A fact cannot be cited against another object */
  sourceObjectIds: string[];
  trace: FactTrace;
  availableDrills: Drill[];
  provenance: string;
  tieStatus: TieStatus;
  createdAt: string;
}

/* ================================================================================================
   PROMOTION — a governed object's facts become canonical facts
   ================================================================================================ */

/**
 * The producing tool already stated the label and the display value; what it did not state is the MEASURE, and
 * the measure is what §13 turns on. It is read from the fact's own key, which is the tool's output schema and
 * not a finance phrase: `activity`, `balance`, `…​.change` and `…​.pct` are Korvyn's own field names, declared
 * in `toolset.ts` and stable. Where a key says nothing, the value's shape decides, and AMOUNT is the honest
 * answer for a governed figure whose measure nobody stated.
 */
function measureOf(key: string, display: string, value: number | string): Measure {
  const k = key.toLowerCase();
  const leaf = k.split('.').pop() ?? k;
  if (leaf === 'change') return 'VARIANCE';
  if (leaf === 'pct' || leaf === 'percent' || /%$/.test(display.trim())) return 'PERCENT_CHANGE';
  if (leaf === 'share' || leaf === 'contribution') return 'CONTRIBUTION';
  if (k.startsWith('balance')) return 'BALANCE';
  if (k.startsWith('ytd')) return 'YTD_ACTIVITY';
  if (k.startsWith('activity') || k.startsWith('movement')) return 'ACTIVITY';
  if (leaf === 'count' || leaf === 'lines' || leaf === 'rows' || (typeof value === 'number' && !/[$€£%]/.test(display))) return 'COUNT';
  return 'AMOUNT';
}

/**
 * §5 — the sign is read from the governed VALUE, never from the formatted string. A display string carries its
 * sign in a convention (accounting parentheses, a leading minus, a bare magnitude for a credit) and reading it
 * back out is exactly the mistake this phase exists to remove.
 */
function signOf(value: number | string): FinancialFact['sign'] {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'NOT_NUMERIC';
  return value > 0 ? 'POSITIVE' : value < 0 ? 'NEGATIVE' : 'ZERO';
}

/** §8 — only the drills the fact can actually support. A drill that would refuse is not offered. */
function drillsOf(t: FactTrace, kind: FactKind): Drill[] {
  if (!isAuthoritative(kind)) return [];
  const d: Drill[] = [];
  if (t.statementLineIds?.length) d.push('STATEMENT_LINE');
  if (t.accountIds?.length) d.push(t.accountIds.some((a) => /000$/.test(a)) ? 'ACCOUNT_GROUP' : 'ACCOUNT', 'TB_POPULATION');
  if (t.populationId) d.push('GL_POPULATION');
  if (t.journalId || t.transactionId) d.push('JOURNAL');
  if (t.sourceRef) d.push('SOURCE_REFERENCE');
  if (t.evidenceIds?.length) d.push('EVIDENCE');
  return [...new Set(d)];
}

/**
 * §36 — THE IDENTITY IS WHAT THE FIGURE IS, NOT WHEN IT WAS READ.
 *
 * Two reads of June OPEX at the same scope, book and lens are the same fact and must carry the same id, or a
 * conversation accumulates a new id for every turn and a reference from three turns ago stops resolving. The
 * VALUE is deliberately not in the hash: if a source posting moved the figure, that is the same fact with a new
 * value, and the registry's own update path is what should notice.
 */
function factIdOf(parts: (string | undefined)[]): string {
  const h = createHash('sha256').update(parts.map((p) => p ?? '').join(' ')).digest('base64url');
  return `f_${h.slice(0, 12)}`;
}

export interface FactContext { book: string; lens: string }

/**
 * Promote one governed object's stated facts into canonical facts. The object's own identity, period, scope,
 * currency, basis and refs become every fact's lineage, so a figure cannot be separated from what produced it.
 */
export function factsFrom(o: FinancialObject, ctx: FactContext): FinancialFact[] {
  const refs = o.refs ?? {};
  const accountIds = refs['account'] ? refs['account'].split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const baseTrace: FactTrace = {
    ...(o.population?.populationId ? { populationId: o.population.populationId } : {}),
    ...(accountIds?.length ? { accountIds } : {}),
    /* the registered tools name this `financialLineId`; `lineId` is the shorter form a composed read uses.
       Reading only one of the two is how a drill that exists comes to be silently unavailable. */
    ...(refs['lineId'] || refs['financialLineId'] ? { statementLineIds: [(refs['lineId'] ?? refs['financialLineId'])!] } : {}),
    ...(refs['journalId'] ? { journalId: refs['journalId'] } : {}),
    ...(refs['transactionId'] ? { transactionId: refs['transactionId'] } : {}),
    ...(refs['sourceRef'] ? { sourceRef: refs['sourceRef'] } : {}),
    ...(refs['fluxItemId'] ? { fluxItemId: refs['fluxItemId'] } : {}),
    ...(refs['explanationId'] ? { fluxExplanationId: refs['explanationId'] } : {}),
    ...(refs['explanationStatus'] ? { explanationStatus: refs['explanationStatus'] } : {}),
    ...(refs['reconciliationId'] ? { reconciliationId: refs['reconciliationId'] } : {}),
    ...(refs['reconciliationStatus'] ? { reconciliationStatus: refs['reconciliationStatus'] } : {}),
  };
  /* an object Korvyn could not answer holds no authoritative figure, whatever its facts say */
  const kind: FactKind = o.status === 'UNAVAILABLE' ? 'UNKNOWN' : o.governed ? 'GOVERNED' : 'MODEL_INFERENCE';
  const tie: TieStatus = (refs['tieStatus'] as TieStatus | undefined) ?? 'NOT_TESTED';

  return o.facts.map((f) => {
    const measure = measureOf(f.key, f.display, f.value);
    const trace = baseTrace;
    return {
      factId: factIdOf(['v2', o.type, f.key, measure, o.periodLabel, o.scope.id, ctx.book, ctx.lens, o.basis, (accountIds ?? []).join('+')]),
      kind,
      semanticType: o.focus?.kind ? `${o.type}:${o.focus.kind}` : o.type,
      measure,
      label: f.label,
      rawValue: f.value,
      displayValue: f.display,
      sign: signOf(f.value),
      unit: o.unit,
      currency: o.currency || null,
      period: o.periodLabel,
      scope: o.scope.name,
      book: ctx.book,
      basis: o.basis,
      lens: ctx.lens,
      sourceObjectIds: [o.id],
      trace,
      availableDrills: drillsOf(trace, kind),
      provenance: o.provenance.source,
      tieStatus: tie,
      createdAt: new Date().toISOString(),
    };
  });
}

/* ================================================================================================
   §35 — THE REGISTRY: LIFETIME AND EVICTION
   ================================================================================================ */

/**
 * A fact referenced eight turns later must still resolve, and a conversation must not accumulate facts without
 * limit. The registry is per conversation, bounded, and evicts the LEAST RECENTLY REFERENCED rather than the
 * oldest — a fact the person keeps drilling is the one worth keeping, however early it was read.
 */
export const FACT_LIMIT = 400;

export class FactRegistry {
  private readonly map = new Map<string, FinancialFact>();
  private readonly touched = new Map<string, number>();
  private seq = 0;

  /** add or refresh; a repeat of the same governed fact reuses its id and updates the value (§36) */
  add(facts: FinancialFact[]): FinancialFact[] {
    for (const f of facts) {
      this.map.set(f.factId, f);
      this.touched.set(f.factId, ++this.seq);
    }
    this.evict();
    return facts;
  }

  get(id: string): FinancialFact | null {
    const f = this.map.get(id);
    if (f) this.touched.set(id, ++this.seq);
    return f ?? null;
  }

  /** the facts a given object produced, for a drill that starts from an object rather than a figure */
  forObject(objectId: string): FinancialFact[] {
    return [...this.map.values()].filter((f) => f.sourceObjectIds.includes(objectId));
  }

  get size(): number { return this.map.size; }

  /** serialised for the durable conversation record; the registry is state, not a store of governed truth */
  snapshot(): FinancialFact[] { return [...this.map.values()]; }
  restore(facts: FinancialFact[]): void { for (const f of facts) { this.map.set(f.factId, f); this.touched.set(f.factId, ++this.seq); } }

  private evict(): void {
    if (this.map.size <= FACT_LIMIT) return;
    const order = [...this.touched.entries()].sort((a, b) => a[1] - b[1]);
    for (const [id] of order.slice(0, this.map.size - FACT_LIMIT)) { this.map.delete(id); this.touched.delete(id); }
  }
}

/* ================================================================================================
   §18 — REFERENCES, AND WHAT A BARE FIGURE MEANS
   ================================================================================================ */

/** the model writes this; a person never sees it (§26) */
export const FACT_REF = /\{\{FACT:([A-Za-z0-9_-]{3,40})\}\}/g;

export interface RenderOut {
  text: string;
  /** ids the model cited that the registry could not resolve — a structural failure, not a style note */
  unresolved: string[];
  /** ids it cited that resolved, in the order they appear */
  used: string[];
}

/**
 * §4 — resolve every reference to its GOVERNED display value. This is the only place an authoritative figure
 * becomes text, which is what makes the sign and the object safe: the model chose WHICH fact, and Korvyn chose
 * what that fact reads as.
 */
export function renderFacts(text: string, reg: FactRegistry): RenderOut {
  const unresolved: string[] = [];
  const used: string[] = [];
  const out = text.replace(FACT_REF, (_m, id: string) => {
    const f = reg.get(id);
    if (!f) { unresolved.push(id); return '[figure unavailable]'; }
    used.push(id);
    return f.displayValue;
  });
  return { text: out, unresolved, used };
}

/**
 * A FIGURE THE MODEL TYPED ITSELF, rather than referenced. Run AFTER the references have been stripped, so what
 * is left is exactly what the model wrote on its own authority.
 *
 * This is deliberately narrow. It looks for MONEY and PERCENTAGES — the shapes a company-specific financial
 * assertion takes — and not for bare integers, because a year, an account code, a count of reconciliations and
 * "two of the three" are not figures anyone would trace, and flagging them would bury the one that matters.
 */
const FIGURE = /\(?-?[$€£]\s?[\d,]+(?:\.\d+)?\s?[MKB]?\)?|-?\d[\d,]*(?:\.\d+)?\s?%/g;
export const bareFigures = (textWithRefsRemoved: string): string[] =>
  [...new Set((textWithRefsRemoved.match(FIGURE) ?? []).map((s) => s.trim()))];

/** strip the references (not their values) so what remains is the model's own prose */
export const withoutRefs = (text: string): string => text.replace(FACT_REF, ' ');
