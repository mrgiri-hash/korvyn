/**
 * PHASE 2.6 — DERIVED FINANCIAL INTELLIGENCE (§1–§9, §24–§27).
 *
 * THE GAP THIS CLOSES, AND WHY IT IS SMALL.
 *
 * Live testing found Sloane saying "EBITDA isn't a posted line" — true, and the wrong answer. §1 draws the
 * distinction: a metric does not have to be POSTED to be GOVERNED. If the definition is governed, the components
 * are governed, the inputs are governed, the calculation is deterministic and the lineage is kept, then the result
 * is a governed fact like any other.
 *
 * The surprise on reading the code is how little was missing. `semantic/concepts.ts` ALREADY declares EBITDA, EBIT,
 * gross margin, operating margin and NOI as DERIVED_MEASURE concepts, each carrying a `formula` of component
 * concept ids and signs. What did not exist was anything that EXECUTED one: `accountArg()` returns no members for a
 * DERIVED mapping, so a metric question fell through to "no governed line". This file is the executor.
 *
 *   MODEL          recognises the concept — it knows what EBITDA means, and §25 says let it.
 *   THIS FILE      resolves the governed definition and its status, and CALCULATES deterministically.
 *   THE MODEL      explains the result. It never does the arithmetic (§3).
 *
 * §9 — THE FORMULA IS OVER CANONICAL STATEMENT CONCEPTS, NEVER OVER ACCOUNT CODES. `REVENUE − COST_OF_OPERATIONS −
 * OPERATING_EXPENSE` is a definition; `40000 − 50000 − 60000` is this tenant's current mapping of it. The codes stay
 * behind the concepts, which is what makes a tenant-specific chart a configuration rather than a rewrite.
 *
 * WHAT IS NOT HERE: no KPI router, no per-metric handler, no phrase list. A metric is found the way every other
 * finance term is found — through the one concept matcher — and this file only says what to do once it is found.
 */
import type { GovernedLedger } from '../governed.js';
import { type ConceptMapping, type FinancialConcept, conceptById } from './concepts.js';

/* ================================================================================================
   §9 — THE CANONICAL STATEMENT COMPONENTS
   ================================================================================================ */

/**
 * The concepts a derived metric may be built from on THIS book, and the field of the governed income-statement
 * result each one reads. `isValues()` in `toolset.ts` already computes every one of them from the chart, so a
 * metric and the statement it is derived from can never disagree about a component.
 */
export const STATEMENT_COMPONENTS: Record<string, { field: 'rev' | 'cop' | 'opx' | 'dna' | 'oth' | 'noi' | 'ni'; label: string }> = {
  REVENUE: { field: 'rev', label: 'Revenue' },
  COST_OF_OPERATIONS: { field: 'cop', label: 'Cost of operations' },
  OPERATING_EXPENSE: { field: 'opx', label: 'Operating expenses' },
  DEPRECIATION_AMORTIZATION: { field: 'dna', label: 'Depreciation & amortisation' },
  OTHER_INCOME_EXPENSE: { field: 'oth', label: 'Other income & expense' },
};

/** the shape `isValues()` returns; named here so this file does not import the tool layer */
export interface StatementComponents { rev: number; cop: number; opx: number; dna: number; oth: number; noi: number; ni: number }

/* ================================================================================================
   §2 — THE DEFINITION
   ================================================================================================ */

/**
 * §7 — WHAT KORVYN IS STANDING BEHIND, stated rather than implied.
 *
 *   GOVERNED     the tenant has approved this definition, or the statement itself computes it as a subtotal.
 *   DEFAULTED    one standard professional reading exists and Korvyn used it; the tenant has approved none.
 *   CANDIDATE    several honest readings and no default — Korvyn can calculate one if told which.
 *   AMBIGUOUS    the term reads more than one way and the choice changes the figure materially.
 *   UNAVAILABLE  a component this book does not hold. Never estimated, never substituted.
 */
export type MetricStatus = 'GOVERNED' | 'DEFAULTED' | 'CANDIDATE' | 'AMBIGUOUS' | 'UNAVAILABLE';

export type MeasureType = 'AMOUNT' | 'RATIO';

export interface MetricComponentRef { conceptId: string; sign: 1 | -1 }

export interface DerivedMetricDefinition {
  metricId: string;
  canonicalName: string;
  aliases: string[];
  definition: string;
  semanticCategory: 'PROFITABILITY' | 'MARGIN' | 'LIQUIDITY' | 'CASH' | 'LEVERAGE';
  /** the governed formula, over canonical statement concepts (§9) */
  formula: MetricComponentRef[];
  /** for a RATIO: the concept the amount is expressed as a share of */
  ratioOf?: string;
  measureType: MeasureType;
  /** a period FLOW (an income-statement measure) or a POINT_IN_TIME position */
  periodBehavior: 'PERIOD' | 'POINT_IN_TIME';
  currencyBehavior: 'PRESENTATION' | 'RATIO_UNITLESS';
  /** how the metric behaves across several periods; a margin does not add up */
  aggregationBehavior: 'SUM' | 'RECALCULATE';
  /** what the definition deliberately leaves OUT, in the person's language (§2, §19) */
  exclusions: string[];
  allowedBooks: string[];
  allowedBases: string[];
  allowedLenses: string[];
  /** a tenant-approved override of the formula; none is recorded on this book (§6) */
  tenantOverride: { approvedBy: string; approvedAt: string; formula: MetricComponentRef[] } | null;
  sourceConceptIds: string[];
  validationRules: string[];
  traceRequirements: string[];
  version: string;
  /** the status BEFORE the components are checked; `resolveMetric` may lower it to UNAVAILABLE */
  declaredStatus: MetricStatus;
  /** stated when Korvyn cannot calculate it on this book at all (§27) */
  unsupported?: string;
}

const D = (d: DerivedMetricDefinition): DerivedMetricDefinition => d;
const STD = { allowedBooks: ['CORE-GL'], allowedBases: ['US GAAP'], allowedLenses: ['Corporate Consolidated'], tenantOverride: null, version: '2026.09.1' };
const TRACE = ['component facts', 'statement lines', 'account groups', 'governed population'];

/* ================================================================================================
   §8 — THE CATALOGUE. Small, extensible, and only as governed as the components allow.
   ================================================================================================ */

export const DERIVED_METRICS: readonly DerivedMetricDefinition[] = [
  D({
    metricId: 'EBITDA', canonicalName: 'EBITDA', aliases: [], sourceConceptIds: ['EBITDA'],
    definition: 'Revenue less the cost of operations and operating expenses, before depreciation and amortisation, interest and tax.',
    semanticCategory: 'PROFITABILITY',
    formula: [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }, { conceptId: 'OPERATING_EXPENSE', sign: -1 }],
    measureType: 'AMOUNT', periodBehavior: 'PERIOD', currencyBehavior: 'PRESENTATION', aggregationBehavior: 'SUM',
    exclusions: ['depreciation and amortisation', 'interest', 'tax'],
    validationRules: ['every component must resolve to a governed statement concept'],
    traceRequirements: TRACE,
    /* §7 — one standard professional reading, no tenant-approved definition on this book. On this chart it is
       arithmetically the statement's own Net operating income subtotal, which is a coincidence of THIS tenant's
       structure and not a reason to call the definition governed. */
    declaredStatus: 'DEFAULTED', ...STD,
  }),
  D({
    metricId: 'EBIT', canonicalName: 'EBIT / operating income', aliases: [], sourceConceptIds: ['EBIT'],
    definition: 'EBITDA less depreciation and amortisation — earnings before interest and tax.',
    semanticCategory: 'PROFITABILITY',
    formula: [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }, { conceptId: 'OPERATING_EXPENSE', sign: -1 }, { conceptId: 'DEPRECIATION_AMORTIZATION', sign: -1 }],
    measureType: 'AMOUNT', periodBehavior: 'PERIOD', currencyBehavior: 'PRESENTATION', aggregationBehavior: 'SUM',
    exclusions: ['interest', 'tax'],
    validationRules: [], traceRequirements: TRACE,
    /* the income statement itself subtotals this as Operating income, so the definition IS the book's */
    declaredStatus: 'GOVERNED', ...STD,
  }),
  D({
    metricId: 'GROSS_PROFIT', canonicalName: 'Gross profit', aliases: [], sourceConceptIds: ['GROSS_MARGIN'],
    definition: 'Revenue less the direct cost of delivering it.',
    semanticCategory: 'MARGIN',
    formula: [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }],
    measureType: 'AMOUNT', periodBehavior: 'PERIOD', currencyBehavior: 'PRESENTATION', aggregationBehavior: 'SUM',
    exclusions: ['operating expenses', 'depreciation and amortisation'],
    validationRules: [], traceRequirements: TRACE, declaredStatus: 'DEFAULTED', ...STD,
  }),
  D({
    metricId: 'GROSS_MARGIN', canonicalName: 'Gross margin', aliases: [], sourceConceptIds: ['GROSS_MARGIN'],
    definition: 'Gross profit as a percentage of revenue.',
    semanticCategory: 'MARGIN',
    formula: [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }],
    ratioOf: 'REVENUE',
    measureType: 'RATIO', periodBehavior: 'PERIOD', currencyBehavior: 'RATIO_UNITLESS', aggregationBehavior: 'RECALCULATE',
    exclusions: [], validationRules: ['the denominator must be non-zero'], traceRequirements: TRACE,
    declaredStatus: 'DEFAULTED', ...STD,
  }),
  D({
    metricId: 'OPERATING_MARGIN', canonicalName: 'Operating margin', aliases: [], sourceConceptIds: ['OPERATING_MARGIN'],
    definition: 'Operating income as a percentage of revenue.',
    semanticCategory: 'MARGIN',
    formula: [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }, { conceptId: 'OPERATING_EXPENSE', sign: -1 }, { conceptId: 'DEPRECIATION_AMORTIZATION', sign: -1 }],
    ratioOf: 'REVENUE',
    measureType: 'RATIO', periodBehavior: 'PERIOD', currencyBehavior: 'RATIO_UNITLESS', aggregationBehavior: 'RECALCULATE',
    exclusions: [], validationRules: ['the denominator must be non-zero'], traceRequirements: TRACE,
    declaredStatus: 'GOVERNED', ...STD,
  }),
  D({
    metricId: 'EBITDA_MARGIN', canonicalName: 'EBITDA margin', aliases: [], sourceConceptIds: ['EBITDA', 'OPERATING_MARGIN'],
    definition: 'EBITDA as a percentage of revenue.',
    semanticCategory: 'MARGIN',
    formula: [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }, { conceptId: 'OPERATING_EXPENSE', sign: -1 }],
    ratioOf: 'REVENUE',
    measureType: 'RATIO', periodBehavior: 'PERIOD', currencyBehavior: 'RATIO_UNITLESS', aggregationBehavior: 'RECALCULATE',
    exclusions: ['depreciation and amortisation', 'interest', 'tax'],
    validationRules: [], traceRequirements: TRACE, declaredStatus: 'DEFAULTED', ...STD,
  }),
  D({
    metricId: 'NET_OPERATING_INCOME', canonicalName: 'Net operating income', aliases: [], sourceConceptIds: ['NOI'],
    definition: 'Revenue less cost of operations and operating expenses — the statement’s own operating subtotal.',
    semanticCategory: 'PROFITABILITY',
    formula: [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }, { conceptId: 'OPERATING_EXPENSE', sign: -1 }],
    measureType: 'AMOUNT', periodBehavior: 'PERIOD', currencyBehavior: 'PRESENTATION', aggregationBehavior: 'SUM',
    exclusions: ['depreciation and amortisation', 'other income and expense'],
    validationRules: [], traceRequirements: TRACE, declaredStatus: 'GOVERNED', ...STD,
  }),
  /* §27 — DECLARED AND HONESTLY UNSUPPORTED. The architecture carries them so the day the chart gains a
     current / non-current classification, or a cash flow statement, each becomes calculable by adding its
     components — not by adding a handler. Until then Korvyn says what is missing rather than estimating. */
  D({
    metricId: 'WORKING_CAPITAL', canonicalName: 'Working capital', aliases: [], sourceConceptIds: ['WORKING_CAPITAL'],
    definition: 'Current assets less current liabilities.',
    semanticCategory: 'LIQUIDITY', formula: [],
    measureType: 'AMOUNT', periodBehavior: 'POINT_IN_TIME', currencyBehavior: 'PRESENTATION', aggregationBehavior: 'RECALCULATE',
    exclusions: [], validationRules: [], traceRequirements: TRACE, declaredStatus: 'UNAVAILABLE', ...STD,
    unsupported: 'this chart of accounts does not classify assets and liabilities as current or non-current, so Korvyn cannot say which balances belong in working capital',
  }),
  D({
    metricId: 'FREE_CASH_FLOW', canonicalName: 'Free cash flow', aliases: [], sourceConceptIds: ['CASH_FLOW'],
    definition: 'Cash from operations less capital expenditure.',
    semanticCategory: 'CASH', formula: [],
    measureType: 'AMOUNT', periodBehavior: 'PERIOD', currencyBehavior: 'PRESENTATION', aggregationBehavior: 'SUM',
    exclusions: [], validationRules: [], traceRequirements: TRACE, declaredStatus: 'UNAVAILABLE', ...STD,
    unsupported: 'Korvyn does not hold a cash flow statement on this book, so cash from operations is not a governed figure here',
  }),
];

export const metricById = (id: string): DerivedMetricDefinition | null => DERIVED_METRICS.find((m) => m.metricId === id) ?? null;

/**
 * §25 — THE MODEL FINDS THE CONCEPT; KORVYN FINDS THE METRIC.
 *
 * A metric is reached through the concept a term already resolves to, so there is no second matcher, no alias list
 * to keep in step and no `if (text.includes('ebitda'))` anywhere. A concept with no metric behind it simply is not
 * a derived metric, which is the correct answer for "cash" or "accounts payable".
 */
export const metricForConcept = (conceptId: string, prefer?: MeasureType | null): DerivedMetricDefinition | null => {
  const all = DERIVED_METRICS.filter((m) => m.sourceConceptIds.includes(conceptId));
  if (!all.length) return null;
  /* the measure the SENTENCE asked for wins where the concept carries both */
  if (prefer) { const m = all.find((x) => x.measureType === prefer); if (m) return m; }
  /* otherwise the metric named after the concept itself — GROSS_MARGIN means the margin, not gross profit */
  return all.find((x) => x.metricId === conceptId) ?? all[0]!;
};

/**
 * §8 — AMOUNT OR RATIO, WHEN ONE CONCEPT CARRIES BOTH.
 *
 * "Gross margin" and "gross profit" are the same governed calculation expressed two ways, and the concept
 * catalogue holds them under one id. Which one a person meant is in the noun they used, exactly as §13's
 * stock-or-flow is in the verb — and this reads the same kind of generic measure word, never a metric name.
 * There is no "ebitda" and no "margin of X" here: "margin" and "percent" mean a ratio whatever they qualify.
 */
const RATIO_WORD = /\b(margin|percent|percentage|as a (?:share|proportion)|%)\b/i;
const AMOUNT_WORD = /\b(profit|amount|dollars|in (?:usd|dollars)|absolute)\b/i;
export function measureAsked(text: string): MeasureType | null {
  if (RATIO_WORD.test(text)) return 'RATIO';
  if (AMOUNT_WORD.test(text)) return 'AMOUNT';
  return null;
}

/* ================================================================================================
   §7 — RESOLUTION: the definition, its status, and why
   ================================================================================================ */

export interface MetricResolution {
  metric: DerivedMetricDefinition | null;
  status: MetricStatus;
  /** one sentence a person can read — never a status word on its own (§19) */
  statement: string;
  /** components that could not be resolved on this book */
  missing: string[];
  concept: FinancialConcept | null;
}

/**
 * A metric is only as governed as its components. The declared status is the ceiling; a component this book does
 * not hold takes it straight to UNAVAILABLE, whatever the definition says.
 */
export function resolveMetric(conceptId: string, asked?: string): MetricResolution {
  const metric = metricForConcept(conceptId, asked ? measureAsked(asked) : null);
  const concept = conceptById(conceptId);
  if (!metric) return { metric: null, status: 'UNAVAILABLE', statement: '', missing: [], concept };
  if (metric.unsupported) {
    return { metric, status: 'UNAVAILABLE', concept, missing: [],
      statement: `Korvyn understands ${metric.canonicalName.toLowerCase()} — ${metric.definition} — but ${metric.unsupported}.` };
  }
  const formula = metric.tenantOverride?.formula ?? metric.formula;
  const missing = formula.map((c) => c.conceptId).filter((c) => !STATEMENT_COMPONENTS[c]);
  if (missing.length) {
    return { metric, status: 'UNAVAILABLE', concept, missing,
      statement: `Korvyn cannot calculate ${metric.canonicalName.toLowerCase()} on this book: ${missing.join(' and ')} is not a governed statement component here.` };
  }
  if (metric.tenantOverride) {
    return { metric, status: 'GOVERNED', concept, missing: [],
      statement: `Calculated on this tenant's approved ${metric.canonicalName.toLowerCase()} definition (approved by ${metric.tenantOverride.approvedBy}).` };
  }
  if (metric.declaredStatus === 'GOVERNED') {
    return { metric, status: 'GOVERNED', concept, missing: [], statement: `${metric.definition} This is the statement's own subtotal.` };
  }
  /* §7 — the distinction that matters: Korvyn CAN calculate it, and the tenant has not ruled on the definition */
  return { metric, status: 'DEFAULTED', concept, missing: [],
    statement: `${metric.definition} This tenant has not approved a formal ${metric.canonicalName} definition, so Korvyn used the standard operating one.` };
}

/* ================================================================================================
   §3 — THE CALCULATION. Deterministic, in Korvyn, never in the model.
   ================================================================================================ */

export interface MetricComponentValue { conceptId: string; label: string; sign: 1 | -1; value: number }
export interface MetricValue {
  metricId: string;
  value: number;
  measureType: MeasureType;
  components: MetricComponentValue[];
  /** for a RATIO: the denominator that was used, so the drill can reach it */
  denominator?: MetricComponentValue;
}

/**
 * Every input is a governed statement component and every step is arithmetic over those inputs. There is no path
 * by which a model-supplied number could enter: the caller hands in the components the governed income statement
 * computed, and this returns the metric and the parts it was made of.
 */
export function calculateMetric(metric: DerivedMetricDefinition, c: StatementComponents): MetricValue | null {
  const formula = metric.tenantOverride?.formula ?? metric.formula;
  if (!formula.length) return null;
  const components: MetricComponentValue[] = [];
  for (const ref of formula) {
    const comp = STATEMENT_COMPONENTS[ref.conceptId];
    if (!comp) return null;
    components.push({ conceptId: ref.conceptId, label: comp.label, sign: ref.sign, value: c[comp.field] });
  }
  const amount = components.reduce((s, x) => s + x.sign * x.value, 0);
  if (metric.measureType === 'AMOUNT') return { metricId: metric.metricId, value: amount, measureType: 'AMOUNT', components };
  const den = metric.ratioOf ? STATEMENT_COMPONENTS[metric.ratioOf] : undefined;
  if (!den) return null;
  const d = c[den.field];
  /* a ratio of nothing is not a ratio; the caller reports it as not meaningful rather than printing infinity */
  if (Math.abs(d) < 0.005) return null;
  return {
    metricId: metric.metricId, value: (amount / d) * 100, measureType: 'RATIO', components,
    denominator: { conceptId: metric.ratioOf!, label: den.label, sign: 1, value: d },
  };
}

/* ================================================================================================
   §15 — THE COMPONENT BRIDGE
   ================================================================================================ */

export interface MetricBridgeStep { conceptId: string; label: string; prior: number; current: number; change: number }
export interface MetricBridge {
  metricId: string;
  prior: MetricValue;
  current: MetricValue;
  change: number;
  /** each component's contribution to the MOVEMENT, signed as it affects the metric */
  steps: MetricBridgeStep[];
}

/**
 * §15 — the bridge FOOTS by construction: each step is the component's own movement multiplied by the sign the
 * formula gives it, so the steps add to the change in the metric. Nothing here is estimated and nothing is
 * plugged; if a step were dropped the total would stop tying, which is the point of building it this way.
 *
 * A RATIO has no additive bridge — a margin is not the sum of its components' margins — so a ratio metric returns
 * its two endpoints and the component movements BEHIND them, and says so rather than implying arithmetic.
 */
export function bridgeMetric(metric: DerivedMetricDefinition, prior: MetricValue, current: MetricValue): MetricBridge {
  const steps: MetricBridgeStep[] = current.components.map((cc, i) => {
    const pc = prior.components[i]!;
    return { conceptId: cc.conceptId, label: cc.label, prior: pc.value, current: cc.value, change: cc.sign * (cc.value - pc.value) };
  });
  return { metricId: metric.metricId, prior, current, change: current.value - prior.value, steps };
}
