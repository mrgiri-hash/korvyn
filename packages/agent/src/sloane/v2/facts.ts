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
import type { EliminationTreatment } from '../financials.js';
import type { FinancialObject } from '../tools.js';
import type { GovernedClaim } from './claims.js';

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
  /**
   * PHASE 2.5 — the producing tool's OWN output field name (`balance`, `activity.change`, `driver1.label`).
   * It is declared in `toolset.ts` and stable, and it is what lets Korvyn compose an answer from a governed
   * result without asking the model which figure answered the question (§6). It is Korvyn's vocabulary, not
   * a finance phrase: nothing here reads the person's words.
   */
  sourceKey: string;
  /**
   * PHASE 2.5 §18 — this figure is a PART OF a whole the same read decomposed: one driver of a movement, one
   * group of a breakdown, the top contributor. Attribution is what a causal claim ordinarily rests on in
   * accounting, so `respond` treats it as support; a bare change figure is not attribution and does not.
   */
  attribution: boolean;
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
  /**
   * PHASE 2.6.1 §13 — WHICH POPULATION PRODUCED THIS FIGURE.
   *
   * Consolidated and pre-elimination are both valid views of the same book, and a reader must never cross between
   * them without knowing. It travels on the FACT so a comparison, a bridge or a drill can CHECK compatibility
   * (§12) rather than assume it, and so "does this include eliminations?" has a governed answer (§14). It is
   * internal vocabulary: it is stated in words, never as the bare enum.
   */
  eliminationTreatment: EliminationTreatment;
  /** §6 — the governed objects this figure belongs to. A fact cannot be cited against another object */
  sourceObjectIds: string[];
  /**
   * PHASE 2.6 §4/§5 — for a DERIVED metric: the governed definition it was calculated from, and the component
   * facts it was calculated OUT OF. "How did you calculate that?" is answered by walking these, and each one
   * drills exactly like any other governed fact because each one IS one.
   */
  metricId?: string;
  definitionVersion?: string;
  componentFactIds?: string[];
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
 * PHASE 2.5 §18 — A DECOMPOSITION MEMBER, READ FROM THE TOOL'S OWN FIELD NAME.
 *
 * `getDriverAnalysis` emits `driver1.label` / `driver1.change`, `analyzeByDimension` emits `group1.amount`,
 * `getTopMovements` emits `mover1.*`, and `getAccountAnalysis` emits `topDriver.<dim>.change`. Every one of
 * those is a PART of the total the same read returned, which is what "driven by" claims. `activity.change`
 * is not: it is the whole movement, and a whole does not explain itself.
 */
const ATTRIBUTION_KEY = /^(driver|group|mover|contributor)\d+\.|^topDriver\./;

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
  const h = createHash('sha256').update(parts.map((p) => p ?? '').join(' ')).digest('base64url');
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
  /**
    * PHASE 2.6 §1/§4 — POSTED IS NOT THE SAME AS GOVERNED, AND DERIVED IS NOT THE SAME AS UNGOVERNED.
    *
    * A metric Korvyn calculated from governed components under a governed definition is authoritative — it is
    * `DERIVED`, which `isAuthoritative` already admits, and it renders and drills like any other fact. What the
    * kind carries is HOW it came to be, so a reader (and the trace) can tell a figure that was posted from one
    * that was computed. Neither is less true than the other; they answer different questions about provenance.
    */
  const derived = o.type === 'DerivedMetric';
  const kind: FactKind = o.status === 'UNAVAILABLE' ? 'UNKNOWN' : !o.governed ? 'MODEL_INFERENCE' : derived ? 'DERIVED' : 'GOVERNED';
  const tie: TieStatus = (refs['tieStatus'] as TieStatus | undefined) ?? 'NOT_TESTED';

  return o.facts.map((f) => {
    const measure = measureOf(f.key, f.display, f.value);
    const trace = baseTrace;
    return {
      factId: factIdOf(['v2', o.type, f.key, measure, o.periodLabel, o.scope.id, ctx.book, ctx.lens, o.basis, (accountIds ?? []).join('+')]),
      kind,
      semanticType: o.focus?.kind ? `${o.type}:${o.focus.kind}` : o.type,
      sourceKey: f.key,
      attribution: ATTRIBUTION_KEY.test(f.key),
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
      /* §13 — the producing read declares it; absent, a governed amount is the CONSOLIDATED view, which is what
         every statement, metric and account drill in this runtime now resolves. */
      eliminationTreatment: (refs['eliminations'] as EliminationTreatment | undefined) ?? 'CONSOLIDATED',
      sourceObjectIds: [o.id],
      ...(refs['metricId'] ? { metricId: refs['metricId'] } : {}),
      trace,
      availableDrills: drillsOf(trace, kind),
      provenance: o.provenance.source,
      tieStatus: tie,
      createdAt: new Date().toISOString(),
    };
  });
}

/* ================================================================================================
   PHASE 2.6.1 §12 — POPULATION COMPATIBILITY
   ================================================================================================ */

/**
 * TWO FIGURES MAY ONLY BE COMPARED, BRIDGED OR SUBTRACTED WHEN THEY DESCRIBE THE SAME ECONOMIC POPULATION.
 *
 * This is the check the runtime did not have, and its absence is the whole of the defect this phase removes: a
 * consolidated statement line and a pre-elimination account total are both correct, both governed, and their
 * difference is meaningless. It is deliberately LIGHTWEIGHT — a comparison of the dimensions a fact already
 * carries, with no read, no model call and no new object (§18).
 *
 * PERIOD IS THE ONE DIMENSION ALLOWED TO DIFFER, because varying it is what a comparison IS. Everything else
 * — scope, elimination treatment, book, basis, lens, currency — has to hold, or the two figures answer
 * different questions and the difference between them is not a movement.
 */
export interface PopulationMismatch { dimension: string; values: string[] }

const COMPAT: { dimension: string; of: (f: FinancialFact) => string }[] = [
  { dimension: 'scope', of: (f) => f.scope },
  { dimension: 'consolidation', of: (f) => f.eliminationTreatment },
  { dimension: 'book', of: (f) => f.book },
  { dimension: 'basis', of: (f) => f.basis },
  { dimension: 'lens', of: (f) => f.lens },
  { dimension: 'currency', of: (f) => f.currency ?? '' },
];

/** the dimensions on which a set of facts disagree; empty means they may be compared */
export function populationMismatch(facts: FinancialFact[]): PopulationMismatch[] {
  const num = facts.filter((f) => typeof f.rawValue === 'number');
  if (num.length < 2) return [];
  const out: PopulationMismatch[] = [];
  for (const d of COMPAT) {
    const vs = [...new Set(num.map(d.of).filter((v) => v !== ''))];
    if (vs.length > 1) out.push({ dimension: d.dimension, values: vs });
  }
  return out;
}

/**
 * §13/§14 — the treatment said in a sentence a person reads, never as the enum. "Does this include
 * eliminations?" is answered from the fact rather than from a caveat somebody remembered to write.
 */
export function consolidationSentence(t: EliminationTreatment): string {
  return t === 'PRE_ELIMINATION'
    ? 'before intercompany eliminations — intercompany activity between the entities in scope is still in this figure'
    : t === 'ELIMINATIONS_ONLY'
      ? 'the intercompany activity eliminated on consolidation, and nothing else'
      : 'after intercompany eliminations — activity between the entities in scope has been removed';
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

  /**
   * PHASE 2.5 §17 — DOES THE REGISTRY ALREADY HOLD THIS EXACT FIGURE?
   *
   * A figure the model TYPED that is byte-identical to a governed display value is a different defect from one
   * it invented, and Phase 1.5's check could not tell them apart. "$3.52M" written out rather than referenced
   * is a contract miss: the value is Korvyn's, the sign convention is Korvyn's, and what was lost is the
   * guarantee that it stays attached to the right object. "$999.99M" is a fabrication.
   *
   * Both are recorded. Only the second is worth a warning to the person, because only the second can be wrong.
   */
  holdsDisplay(s: string): boolean {
    const want = s.replace(/\s+/g, '');
    for (const f of this.map.values()) if (f.displayValue.replace(/\s+/g, '') === want) return true;
    return false;
  }

  /**
   * PHASE 2.6 — THE SAME MAGNITUDE, WITH THE SIGN CARRIED BY A WORD RATHER THAN BY THE CONVENTION.
   *
   * "EBITDA fell $0.39M" is a correct English sentence about a figure the registry holds as "($0.39M)": the
   * digits and the scale are governed and the direction is in the verb. The strict check reads it as a
   * fabrication, and the sentence-dropping rule then deleted the only sentence in the answer — observed live,
   * an empty reply. A magnitude match is therefore its own, milder finding: recorded, never warned about, and
   * never a reason to withhold. Only a figure whose MAGNITUDE matches nothing can be wrong.
   */
  holdsMagnitude(s: string): boolean {
    const digits = (x: string) => x.replace(/[()$€£%,\s-]/g, '').replace(/^0+(?=\d)/, '');
    const want = digits(s);
    if (!/\d/.test(want)) return false;
    for (const f of this.map.values()) if (digits(f.displayValue) === want) return true;
    return false;
  }

  /** the facts a given object produced, for a drill that starts from an object rather than a figure */
  forObject(objectId: string): FinancialFact[] {
    return [...this.map.values()].filter((f) => f.sourceObjectIds.includes(objectId));
  }

  get size(): number { return this.map.size; }

  /**
   * A7 §2/§3 — GOVERNED CLAIMS LIVE HERE TOO, not in a registry of their own.
   *
   * A status is promoted from the same governed read a figure is and is verified against the same conversation.
   * A second store would need its own eviction, its own snapshot and its own restore, and the two would be one
   * refactor away from disagreeing about what this conversation has seen.
   *
   * A claim is keyed by (type, object, period), so a later read of the SAME status on the same object in the
   * same period REPLACES it — which is §15: what a conversation holds is the current governed position, and a
   * value read before a reopen must never still be citable as the position now.
   */
  private readonly claims = new Map<string, GovernedClaim>();

  addClaims(cs: readonly GovernedClaim[]): GovernedClaim[] {
    for (const c of cs) this.claims.set(`${c.claimType}:${c.object.id}:${c.period}`, c);
    return [...cs];
  }
  /** every claim this conversation has been given, newest value per (type, object, period) */
  heldClaims(): GovernedClaim[] { return [...this.claims.values()]; }
  claimsForObject(objectId: string): GovernedClaim[] { return this.heldClaims().filter((c) => c.object.id === objectId); }
  get claimCount(): number { return this.claims.size; }

  /** serialised for the durable conversation record; the registry is state, not a store of governed truth */
  snapshot(): FinancialFact[] { return [...this.map.values()]; }
  restore(facts: FinancialFact[]): void { for (const f of facts) { this.map.set(f.factId, f); this.touched.set(f.factId, ++this.seq); } }
  snapshotClaims(): GovernedClaim[] { return this.heldClaims(); }
  restoreClaims(cs: readonly GovernedClaim[]): void { this.addClaims(cs); }

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

/**
 * PHASE 2.5 §26 — THE DETECTOR IS PERMISSIVE EVEN THOUGH THE RESOLVER IS EXACT, AND THE BENCHMARK IS WHY.
 *
 * A real fact id is `f_` plus base64url, so the pattern above is the right shape to LOOK UP. It is the wrong
 * shape to DETECT: asked for net PP&E, the model wrote `{{FACT:f_pp&e_balance}}` — an id it invented, containing
 * a character the class excludes — so nothing matched, nothing was reported unresolved, and the raw machinery
 * went to the person exactly as typed. A reference a person can read is the one thing §26 forbids outright.
 *
 * So anything reference-SHAPED that survives resolution is an invented reference. It is counted as unresolved,
 * which makes §18's withholding rule fire on the sentence holding it.
 */
const FACT_REF_ANY = /\{\{\s*FACT\s*:[^}]{0,80}\}\}/gi;

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
  let out = text.replace(FACT_REF, (_m, id: string) => {
    const f = reg.get(id);
    if (!f) { unresolved.push(id); return '[figure unavailable]'; }
    used.push(id);
    return f.displayValue;
  });
  /* §26 — anything still reference-shaped is an id the model invented in a form the lookup cannot even try.
     It is unresolved, and it never reaches a reader as itself. */
  out = out.replace(FACT_REF_ANY, (m) => { unresolved.push(m.slice(0, 40)); return '[figure unavailable]'; });
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
/**
 * PHASE 2.6.1 — A CLOSING PARENTHESIS IS PART OF THE FIGURE ONLY WHEN AN OPENING ONE WAS.
 *
 * Accounting writes a credit as "($0.39M)", and prose writes an aside as "(May: $13.22M)". The old pattern
 * took the trailing `)` in both, so a governed figure inside an aside came out as `$13.22M)` — a string that
 * matches no stored display value and no magnitude, and is therefore reported as a figure Korvyn cannot find
 * when it is looking straight at it. The two alternatives are now separate: parenthesised, or not.
 */
const FIGURE = /\(-?[$€£]\s?[\d,]+(?:\.\d+)?\s?[MKB]?\)|-?[$€£]\s?[\d,]+(?:\.\d+)?\s?[MKB]?|-?\d[\d,]*(?:\.\d+)?\s?%/g;
export const bareFigures = (textWithRefsRemoved: string): string[] =>
  [...new Set((textWithRefsRemoved.match(FIGURE) ?? []).map((s) => s.trim()))];

/** strip the references (not their values) so what remains is the model's own prose */
export const withoutRefs = (text: string): string => text.replace(FACT_REF, ' ');
