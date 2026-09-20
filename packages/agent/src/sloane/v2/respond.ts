/**
 * PHASE 2 — THE RESPONSE DEFINITION (§19–§28).
 *
 * WHY THE STRUCTURE COMES BACK FROM THE REASONING CALL ITSELF.
 *
 * §22 rules out a second model call to format an answer, and it is right to: a formatting pass is a second place
 * a figure can be rewritten, and Phase 1.5 spent real effort removing exactly that. So the model does not write
 * prose and then have it organised — it CALLS `respond` with the organisation already in it, and that tool_use
 * ENDS the turn. A conceptual question is one model call; a governed question is two (read, then answer), which
 * is what Phase 1 already cost. Nothing is added.
 *
 * WHAT THE MODEL SUPPLIES, AND WHAT KORVYN SUPPLIES.
 *   the model  — which response type fits, what the headline says, which facts belong in which section, and
 *                which of its own statements are inference rather than fact.
 *   Korvyn     — every authoritative VALUE (through the fact registry), the rendering, and the judgement about
 *                whether a causal claim has anything behind it.
 *
 * §23/§27 — ADAPTIVE MEANS FEWER SECTIONS, NOT MORE. "What is OPEX?" renders as one paragraph with no headings
 * at all. Sections exist to make a governed analysis scannable, and a section with nothing in it is never drawn.
 */
import { type Drill, type FactRegistry, type FinancialFact, bareFigures, isAuthoritative, populationMismatch, renderFacts, withoutRefs } from './facts.js';
import { type Offer, offersFor } from './strategy.js';

/* ================================================================================================
   §22 — THE RESPONSE TYPES
   ================================================================================================ */

export const RESPONSE_TYPES = [
  /** a conceptual or conversational answer: prose, no headings (§23) */
  'DIRECT',
  /** a governed analytical result, made scannable (§24) */
  'FINANCIAL_SUMMARY',
  /** "why did this move": the main driver, the rest, and what is left over (§25) */
  'DRIVER_ANALYSIS',
  /** "where did that number come from" (§30) */
  'TRACE_RESULT',
  'CLARIFICATION',
  /** Korvyn cannot answer this, and says what it can do instead */
  'LIMITATION',
  'INVESTIGATION_SUMMARY',
] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];

/* ================================================================================================
   §19 — ASSERTION TYPES
   ================================================================================================ */

/**
 * The same sentence can be a governed fact, Korvyn's own arithmetic over governed facts, the model's reading of
 * a situation, or an admission. A reader has to be able to tell them apart, and the type is carried rather than
 * implied by tone.
 */
export const ASSERTIONS = ['FACT', 'DERIVED_CONCLUSION', 'INFERENCE', 'DRAFT_EXPLANATION', 'UNRESOLVED'] as const;
export type AssertionType = (typeof ASSERTIONS)[number];

export interface Assertion {
  type: AssertionType;
  text: string;
  factRefs: string[];
  objectIds: string[];
}

/* ================================================================================================
   §21 — THE DEFINITION
   ================================================================================================ */

export interface ResponseDefinition {
  responseType: ResponseType;
  headline: Assertion | null;
  summary: Assertion | null;
  keyDrivers: Assertion[];
  interpretation: Assertion[];
  exceptions: Assertion[];
  unresolved: Assertion[];
  nextActions: string[];
  supportingAnalysisIds: string[];
  factRefs: string[];
  evidenceRefs: string[];
  /** Korvyn's own findings about the response, for the trace — never shown to the person */
  violations: string[];
}

/** what the model sends through the `respond` tool: flat strings and string arrays, so it is reliable to emit */
export interface RespondInput {
  responseType?: string;
  headline?: string;
  summary?: string;
  keyDrivers?: string[] | string;
  interpretation?: string[] | string;
  exceptions?: string[] | string;
  unresolved?: string[] | string;
  nextActions?: string[] | string;
}

/** the model may send a list or one pipe-separated string; both mean the same thing */
function lines(v: string[] | string | undefined): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split('|');
  return arr.map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
}

const REF = /\{\{FACT:([A-Za-z0-9_-]{3,40})\}\}/g;
const refsIn = (s: string): string[] => [...s.matchAll(REF)].map((m) => m[1]!);

/* ================================================================================================
   §20 — CAUSAL CLAIM SAFETY
   ================================================================================================ */

/**
 * "Because", "driven by", "due to" and "caused by" assert a REASON, and a reason is not established by the
 * absence of a wrong number. Phase 1.5's check would have passed "OPEX rose because the datacentre team hired
 * three engineers" without comment — every figure in it is fine, and the claim is invented.
 *
 * A causal sentence earns FACT only if it points at something: a governed fact, or an approved explanation. If
 * it points at nothing it is still said — it is often the most useful sentence in the answer — but it is said
 * as INFERENCE, so the reader knows which part Korvyn can stand behind.
 */
const CAUSAL = /\b(because|driven by|due to|caused by|owing to|on account of|as a result of|stems from|reflects)\b/i;

/**
 * A GOVERNED DECOMPOSITION IS EVIDENCE OF WHAT MADE A MOVEMENT UP, and in accounting that is what "driven by"
 * ordinarily claims. So a causal sentence is supported by an approved explanation, by attached evidence, or by
 * facts that came from a read whose whole job is to decompose the movement — never by a figure that merely
 * happens to be in the same answer.
 *
 * The test is Korvyn's OWN object type and measure (`toolset.ts` declares both), not a word in the sentence:
 * a rule that read the prose would be the phrase handler this phase is written to avoid.
 *
 * PHASE 2.5 §18 — ATTRIBUTION IS PER FACT, NOT PER OBJECT, and the distinction is real. `getAccountAnalysis`
 * returns BOTH the whole movement (`activity.change`) and its top contributors (`topDriver.vendor.change`) in
 * one object. "Activity rose because of X" pointed at the first is a claim the read does not support — a whole
 * does not explain itself — and pointed at the second it is exactly what the read established. Reading support
 * off the OBJECT type would have passed both, which is why the marker moved onto the fact.
 */
const DECOMPOSITION = /^(DriverAnalysis|DimensionAnalysis|LargestMovements|PopulationAggregate)\b/;

function supportedCausal(a: Assertion, reg: FactRegistry): boolean {
  if (a.factRefs.length === 0) return false;
  return a.factRefs.some((id) => {
    const f = reg.get(id);
    if (!f) return false;
    if (f.kind === 'APPROVED' || f.trace.fluxExplanationId || f.trace.evidenceIds?.length) return true;
    if (f.attribution) return true;
    return DECOMPOSITION.test(f.semanticType) || f.measure === 'CONTRIBUTION';
  });
}

/* ================================================================================================
   BUILD — the model's input, validated against the registry
   ================================================================================================ */

function assertion(type: AssertionType, text: string, reg: FactRegistry): Assertion {
  const factRefs = refsIn(text);
  const objectIds = [...new Set(factRefs.flatMap((id) => reg.get(id)?.sourceObjectIds ?? []))];
  return { type, text, factRefs, objectIds };
}

export interface BuildOptions {
  /** governed reads actually ran this turn; without one, no company-specific figure may be presented (§16) */
  hasGovernedRead: boolean;
  objectIds: string[];
}

/**
 * §16 — THE STRUCTURAL GUARANTEE.
 *
 * A model that answered a company-specific question from its own head has, by construction, no fact references
 * to cite — so the check is not "did it write a suspicious number", it is "did it cite anything Korvyn produced".
 * An assertion carrying an authoritative figure with no governed read behind it does not get published.
 */
export function buildResponse(input: RespondInput, reg: FactRegistry, opt: BuildOptions): ResponseDefinition {
  const violations: string[] = [];
  const rt = (String(input.responseType ?? 'DIRECT').toUpperCase() as ResponseType);
  const responseType: ResponseType = (RESPONSE_TYPES as readonly string[]).includes(rt) ? rt : 'DIRECT';

  let headline = input.headline?.trim() ? assertion('FACT', input.headline.trim(), reg) : null;
  let summary = input.summary?.trim() ? assertion('FACT', input.summary.trim(), reg) : null;
  const keyDrivers = lines(input.keyDrivers).map((t) => assertion('DERIVED_CONCLUSION', t, reg));
  const interpretation = lines(input.interpretation).map((t) => assertion('INFERENCE', t, reg));
  const exceptions = lines(input.exceptions).map((t) => assertion('FACT', t, reg));
  const unresolved = lines(input.unresolved).map((t) => assertion('UNRESOLVED', t, reg));

  /* §20 — a causal claim with nothing behind it is demoted, not deleted */
  const demote = (a: Assertion | null): Assertion | null => {
    if (!a || a.type !== 'FACT' || !CAUSAL.test(withoutRefs(a.text))) return a;
    if (supportedCausal(a, reg)) return a;
    violations.push(`causal claim without support demoted to inference: "${a.text.slice(0, 60)}"`);
    return { ...a, type: 'INFERENCE' };
  };
  headline = demote(headline);
  summary = demote(summary);

  const all = [headline, summary, ...keyDrivers, ...interpretation, ...exceptions, ...unresolved].filter((a): a is Assertion => !!a);
  const factRefs = [...new Set(all.flatMap((a) => a.factRefs))];

  /**
   * PHASE 2.6.1 §10/§12/§15 — A SENTENCE THAT PUTS TWO FIGURES TOGETHER IS ASSERTING THEY BELONG TOGETHER.
   *
   * Consolidated and pre-elimination amounts are both governed and both right, and subtracting one from the
   * other produces a movement that never happened. The check is per SENTENCE rather than per answer, because an
   * answer may legitimately state a consolidated total and then a pre-elimination lineage line beside it —
   * what it may not do is compare them inside one claim. A mismatch is SAID, not silently dropped: the figures
   * are governed, and the reader is the one who decides what to do about two views that do not line up.
   */
  const crossed: string[] = [];
  for (const a of all) {
    const bad = populationMismatch(a.factRefs.map((id) => reg.get(id)).filter((f): f is FinancialFact => !!f));
    if (!bad.length) continue;
    const said = bad.map((m) => `${m.dimension} (${m.values.join(' against ')})`).join(', ');
    violations.push(`figures from different populations compared in one claim: ${said}`);
    if (!crossed.includes(said)) crossed.push(said);
  }
  for (const said of crossed) {
    unresolved.push(assertion('UNRESOLVED',
      `These figures do not come from the same population — they differ on ${said} — so the difference between them is not a movement. Read them separately.`, reg));
  }

  /* a reference the registry cannot resolve is a defect, and the sentence holding it is withheld */
  for (const id of factRefs) if (!reg.get(id)) violations.push(`unknown fact reference ${id}`);

  /* §16 — company-specific figures with no governed read behind them */
  if (!opt.hasGovernedRead) {
    for (const a of all) {
      const bare = bareFigures(withoutRefs(a.text));
      if (bare.length) violations.push(`figure stated with no governed read: ${bare.join(', ')}`);
    }
  }

  return {
    responseType, headline, summary, keyDrivers, interpretation, exceptions, unresolved,
    nextActions: lines(input.nextActions),
    supportingAnalysisIds: opt.objectIds,
    factRefs,
    evidenceRefs: [...new Set(factRefs.flatMap((id) => reg.get(id)?.trace.evidenceIds ?? []))],
    violations,
  };
}

/* ================================================================================================
   RENDER — deterministic, adaptive, and the only place a governed value becomes text
   ================================================================================================ */

export interface RenderedResponse {
  /** section label + text, in reading order; the browser draws the label quietly above the text */
  parts: { label: string | null; text: string; assertion: AssertionType; objectIds: string[] }[];
  /** the whole answer as plain text, for the transcript and for a caller with no renderer */
  text: string;
  unresolved: string[];
  /** §17: figures the model typed that match NO governed value — the ones that can be wrong */
  bare: string[];
  /** §17: figures it typed that are byte-identical to a governed value — a contract miss, not a fabrication */
  typed: string[];
  nextActions: string[];
}

/* ================================================================================================
   §8 / §30 — WHERE THE ANSWER CAN BE TAKEN NEXT
   ================================================================================================ */

/**
 * The model is not asked where a figure can be drilled, because it does not know: whether a population exists,
 * whether the source system published a reference, whether anything has been attached are facts about the
 * OBJECT, and the fact already carries them (§8). So the offers are read from the cited facts' own drills, in
 * the order the chain is walked — statement line, accounts, trial balance, GL, journal, source, support.
 *
 * A drill that would refuse is never offered, which is why this reads the union of what the facts SUPPORT and
 * not a fixed menu. An answer that cited nothing offers nothing.
 */
const DRILL_LABEL: Record<Drill, string> = {
  STATEMENT_LINE: 'View the statement line',
  ACCOUNT_GROUP: 'View the accounts',
  ACCOUNT: 'View the account',
  TB_POPULATION: 'View the trial balance',
  GL_POPULATION: 'View the GL lines behind it',
  JOURNAL: 'View the journal',
  SOURCE_REFERENCE: 'Trace it to the source system',
  EVIDENCE: 'View the support',
};
const DRILL_ORDER: Drill[] = ['STATEMENT_LINE', 'ACCOUNT_GROUP', 'ACCOUNT', 'TB_POPULATION', 'GL_POPULATION', 'JOURNAL', 'SOURCE_REFERENCE', 'EVIDENCE'];

/**
 * PHASE 2.5 §19 — an offer carries the FACT it would drill from, not only its label. That is what lets the
 * next turn run the drill with no model call when the person takes the offer: they picked from a menu Korvyn
 * wrote, so nothing about their message has to be understood.
 */
export function drillOffers(def: ResponseDefinition, reg: FactRegistry, subject: string | null = null): Offer[] {
  return offersFor(def.factRefs, reg, (d) => DRILL_LABEL[d], DRILL_ORDER, subject);
}
export const drillActions = (def: ResponseDefinition, reg: FactRegistry): string[] => drillOffers(def, reg).map((o) => o.label);

/**
 * §23/§24/§27 — the shape follows the answer. DIRECT draws no labels at all; everything else draws only the
 * sections that have content, and a single-fact answer stays a single sentence.
 */
export function renderResponse(def: ResponseDefinition, reg: FactRegistry): RenderedResponse {
  const parts: RenderedResponse['parts'] = [];
  const unresolved: string[] = [];
  const bare: string[] = [];
  const typed: string[] = [];

  const push = (label: string | null, a: Assertion | null) => {
    if (!a) return;
    const r = renderFacts(a.text, reg);
    unresolved.push(...r.unresolved);
    /* the model's own prose, with the governed values taken back out, is what it wrote on its own authority.
       §17 splits it: a figure the registry already holds was Korvyn's number written the long way round; a
       figure it does not hold is the one worth a warning. */
    for (const b of bareFigures(withoutRefs(a.text))) (reg.holdsDisplay(b) ? typed : bare).push(b);
    /* §18 — A SENTENCE HOLDING A REFERENCE KORVYN CANNOT RESOLVE IS WITHHELD, NOT PUBLISHED WITH A HOLE IN IT.
       Measured on the 125-prompt holdout: ten answers reached the person reading "[figure unavailable]" where a
       figure should be — a sentence that names an account and a period and then states nothing is worse than
       saying plainly that Korvyn does not have it, because it still reads as data. */
    if (r.unresolved.length) return;
    parts.push({ label, text: r.text, assertion: a.type, objectIds: a.objectIds });
  };

  const plain = def.responseType === 'DIRECT' || def.responseType === 'CLARIFICATION';
  /* a short answer stays short: with no drivers, exceptions or unresolved items there is nothing to scan, so
     headings would be five words of chrome around two sentences */
  const thin = def.keyDrivers.length === 0 && def.exceptions.length === 0 && def.unresolved.length === 0;

  push(null, def.headline);
  push(plain || thin ? null : 'Summary', def.summary);

  if (def.keyDrivers.length) {
    def.keyDrivers.forEach((a, i) => push(i === 0 ? (def.responseType === 'DRIVER_ANALYSIS' ? 'What drove it' : 'Key drivers') : null, a));
  }
  if (def.interpretation.length) def.interpretation.forEach((a, i) => push(i === 0 ? 'What this suggests' : null, a));
  if (def.exceptions.length) def.exceptions.forEach((a, i) => push(i === 0 ? 'Worth a look' : null, a));
  if (def.unresolved.length) def.unresolved.forEach((a, i) => push(i === 0 ? 'Not yet established' : null, a));

  /* every sentence was withheld: say so once, rather than returning an empty answer */
  if (!parts.length && unresolved.length) {
    parts.push({ label: null, assertion: 'UNRESOLVED', objectIds: [],
      text: 'Korvyn could not resolve the figures behind that, so it is not showing them. Ask again and Sloane will read the governed objects fresh.' });
  }
  const text = parts.map((p) => (p.label ? `${p.label}\n${p.text}` : p.text)).join('\n\n');
  /* §30 — what the model asked for, else what the figures themselves can support. A conceptual answer with no
     governed figure behind it offers nothing, which is correct: there is nowhere to go. */
  const nextActions = def.nextActions.length ? def.nextActions : drillActions(def, reg);
  return { parts, text, unresolved: [...new Set(unresolved)], bare: [...new Set(bare)], typed: [...new Set(typed)], nextActions };
}

/* ================================================================================================
   THE TOOL THE MODEL CALLS
   ================================================================================================ */

/** §26 — every word of this description is what a finance colleague would understand; no schema vocabulary */
export const RESPOND_TOOL: import('./tools.js').V2ToolDef = {
  name: 'respond',
  description:
    'Give your answer. Call this exactly once, as the LAST thing you do in a turn — after any governed reads you needed. '
    + 'EVERY figure about this company must be written as a fact reference, {{FACT:id}}, taken from a tool result you read this turn. '
    + 'Never type a company figure yourself: Korvyn renders the governed value, so a reference is how the number reaches the person correctly signed. '
    + 'General finance knowledge needs no reference and no reads. '
    + 'Use only the fields the answer needs — a simple question is a headline and nothing else.',
  input_schema: {
    type: 'object' as const,
    properties: {
      responseType: { type: 'string' as const, description: 'DIRECT for a conceptual or conversational answer (no sections) | FINANCIAL_SUMMARY for a governed result | DRIVER_ANALYSIS for why something moved | TRACE_RESULT for where a number came from | CLARIFICATION | LIMITATION when Korvyn cannot answer' },
      headline: { type: 'string' as const, description: 'The answer, in one or two sentences. For DIRECT this is the whole reply and may be a short paragraph.' },
      summary: { type: 'string' as const, description: 'Optional. One further sentence of context, only when the headline cannot carry it.' },
      keyDrivers: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional. What made up the movement, largest first, each with its fact reference.' },
      interpretation: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional. Your reading of what the figures suggest. This is shown as your interpretation, not as Korvyn fact — put anything you cannot prove here.' },
      exceptions: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional. Anything that looks wrong or needs review.' },
      unresolved: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional. What Korvyn cannot yet establish, stated plainly.' },
      nextActions: { type: 'array' as const, items: { type: 'string' as const }, description: 'Optional. Short offers of what you could look at next, in the person’s words.' },
    },
    required: ['headline'],
    additionalProperties: false as const,
  },
};
