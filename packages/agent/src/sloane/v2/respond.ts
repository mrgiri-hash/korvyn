/**
 * THE RESPONSE CONTRACT — PHASE 3 (§4, §14, §46).
 *
 * PHASE 3 ANSWERS §46's QUESTION: this file KEEPS its job and LOSES its authorship. Phase 2 made the model call
 * `respond` with an organisation already in it — a response type, a headline, a summary, key drivers, exceptions,
 * an interpretation and an unresolved list — and `renderResponse` drew a label above each. That produced the
 * report shape §4 rules out: SUMMARY / KEY DRIVERS / WHAT THIS SUGGESTS over two sentences of answer.
 *
 * So the boundary moved, and it moved in one direction only:
 *
 *   CLAUDE owns the message   — the words, the length, how much to say, what order to say it in. An answer is
 *                               prose, written on the same call that would have written it anyway.
 *   KORVYN owns the values    — every authoritative figure (through the fact registry), the rendering, the
 *                               withholding of anything it cannot resolve, and the judgement about whether a
 *                               causal claim has anything behind it.
 *
 * `ResponseDefinition` survives because everything downstream reads it — the offers, the trace, the violations,
 * the sign-safe rendering, `composeDirect`'s one-call answers. What it no longer does is DECIDE THE SHAPE:
 * `renderResponse` draws NO section labels at all, and the only structure a model can ask for is one compact
 * list through `show_list` (§14/§15), which it uses when rows read better than a sentence.
 *
 * §5/§39 — NOTHING ABOUT GROUNDING MOVED. A company figure is still a {{FACT:id}} reference that Korvyn
 * resolves, a sentence whose reference cannot be resolved is still withheld, and a causal claim with nothing
 * behind it is still demoted to inference rather than published as fact.
 */
import { type Drill, type FactRegistry, type FinancialFact, bareFigures, isAuthoritative, populationMismatch, renderFacts, withoutRefs } from './facts.js';
import { type ClaimFailure, type ClaimObject, type GovernedClaim, failureNote, verifySentence } from './claims.js';
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

/* ================================================================================================
   §14 — THE SUPPORTING PRESENTATION, WHICH IS NOT THE ANSWER
   ================================================================================================ */

/**
 * §14/§20 — RETRIEVAL IS NOT PRESENTATION. A governed read returns fifteen blockers, fifteen owners and fifteen
 * statuses; four of them may be what the question needed. What reaches the screen is the MESSAGE, and a
 * presentation only when rows genuinely read better than a sentence.
 *
 * NONE is the default and by design the common case. COMPACT_LIST is a handful of short rows under a lead-in —
 * the shape "the three largest are …" wants. Anything bigger is a grid, and a grid is `open_analysis_grid`,
 * which is a surface that already exists rather than a thing this file draws.
 */
export const PRESENTATIONS = ['NONE', 'COMPACT_LIST'] as const;
export type PresentationKind = (typeof PRESENTATIONS)[number];

export interface Presentation {
  kind: PresentationKind;
  /** the model's own one-line lead-in, if it wrote one; never a manufactured heading */
  lead: string | null;
  rows: Assertion[];
}

export interface ResponseDefinition {
  responseType: ResponseType;
  /** §14 — the conversational answer. Paragraphs, in reading order, in the model's own words. */
  headline: Assertion | null;
  summary: Assertion | null;
  /** §14 — the optional supporting rows. `NONE` on an ordinary turn, which is most turns. */
  presentation: Presentation;
  keyDrivers: Assertion[];
  interpretation: Assertion[];
  exceptions: Assertion[];
  unresolved: Assertion[];
  nextActions: string[];
  supportingAnalysisIds: string[];
  factRefs: string[];
  evidenceRefs: string[];
  /**
   * §39 — figures the model typed that Korvyn could find NOWHERE, whose sentences were therefore withheld.
   * Distinct from `violations`, which is diagnosis: this is what the person has to be TOLD, because a sentence
   * they can no longer see was removed from an answer about their money.
   */
  withheldFigures: string[];
  /**
   * A7 §17 — the governed status claims this answer made, and what happened to them. `claimsVerified` is
   * what the answer is entitled to say; `claimFailures` is why a sentence went. Telemetry, for the trace and
   * the eval harness — `withheldClaims` is the one line a PERSON is told, because a sentence about the state
   * of their controls was removed.
   */
  claimsVerified: GovernedClaim[];
  claimFailures: ClaimFailure[];
  withheldClaims: string[];
  /** A7 §14 — governed entities whose identity was suppressed from synthesised prose */
  suppressedEntities: string[];
  /** Korvyn's own findings about the response, for the trace — never shown to the person */
  violations: string[];
}

/**
 * What a model-authored answer carries.
 *
 * PHASE 3: `message` and `list` are the whole live contract — the answer, and optionally some rows. The five
 * fields beneath them are Phase 2's and are still READ, because `composeDirect` builds a definition directly
 * and because a stored answer from an earlier session must keep rendering. None of them is in the tool schema
 * and none of them is in the prompt, so nothing new arrives shaped that way.
 */
export interface RespondInput {
  /** §14 — the answer itself, in the model's own words */
  message?: string;
  /** §14 — optional rows, when a list reads better than a sentence */
  list?: string[] | string;
  /** the one-line lead-in above those rows, if the model wrote one */
  lead?: string;
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
  /**
   * A7 §4/§8 — the governed statuses this conversation holds, and the object in focus. A sentence making a
   * material status claim is checked against these; a sentence making none is untouched, which is most of them.
   */
  claims?: readonly GovernedClaim[];
  focus?: ClaimObject | null;
  /** A7 §14 — the disclosure policy for SYNTHESISED text, supplied by the caller that knows the actor */
  disclose?: (text: string) => { text: string; suppressed: string[] };
}

/**
 * §16 — THE STRUCTURAL GUARANTEE.
 *
 * A model that answered a company-specific question from its own head has, by construction, no fact references
 * to cite — so the check is not "did it write a suspicious number", it is "did it cite anything Korvyn produced".
 * An assertion carrying an authoritative figure with no governed read behind it does not get published.
 */
/* ================================================================================================
   A7 §4/§8/§12 — GOVERNED CLAIM VALIDATION, THE ONE PLACE BOTH PATHS USE
   ================================================================================================ */

/**
 * WHAT WITHHOLDS AND WHAT IS ONLY RECORDED, and the line is drawn where certainty is.
 *
 *   OBJECT_MISMATCH  Korvyn holds this status for a DIFFERENT object. The A6 defect exactly, and a certain
 *                    error: a sentence about REC-MDH-13100 supported by REC-MGP-REIT-13100's tie status is
 *                    false however true that tie status is. The sentence goes.
 *   VALUE_MISMATCH   Korvyn holds this status for THIS object and it says something else. Also certain. It goes.
 *   UNSUPPORTED      Korvyn holds no governed status of that kind at all, so it cannot say the sentence is
 *                    wrong — only that it cannot vouch for it. Recorded, never withheld. Withholding here would
 *                    delete correct answers about every control this layer has no structured mapping for yet,
 *                    which is the false-failure trade A5 and A6 both paid for and neither wants again.
 */
function claimCheck(text: string, opt: BuildOptions): { ok: boolean; verified: GovernedClaim[]; failures: ClaimFailure[] } {
  const held = opt.claims ?? [];
  if (!held.length) return { ok: true, verified: [], failures: [] };
  const v = verifySentence(text, held, opt.focus ?? null);
  const certain = v.failures.filter((f) => f.reason === 'OBJECT_MISMATCH' || f.reason === 'VALUE_MISMATCH' || f.reason === 'STALE_VERSION');
  return { ok: !certain.length, verified: v.verified, failures: v.failures };
}

/**
 * A7 §14 — THE DISCLOSURE POLICY, APPLIED TO SYNTHESISED PROSE.
 *
 * Applied LAST, over the assertions that survived verification, because it is about what Korvyn writes rather
 * than about what is true. The policy itself lives in the governed layer and knows about entities and
 * visibility; this function knows only that some text came back rewritten and that the reader must be told an
 * identity was withheld rather than left to think nothing was there.
 */
function applyDisclosure(def: ResponseDefinition, opt: BuildOptions): ResponseDefinition {
  if (!opt.disclose) return def;
  const suppressed: string[] = [];
  const rewrite = (a: Assertion | null): Assertion | null => {
    if (!a) return a;
    const r = opt.disclose!(a.text);
    for (const e of r.suppressed) if (!suppressed.includes(e)) suppressed.push(e);
    return r.text === a.text ? a : { ...a, text: r.text };
  };
  const list = (xs: Assertion[]) => xs.map((a) => rewrite(a)!).filter(Boolean);
  const out: ResponseDefinition = {
    ...def,
    headline: rewrite(def.headline), summary: rewrite(def.summary),
    keyDrivers: list(def.keyDrivers), interpretation: list(def.interpretation),
    exceptions: list(def.exceptions), unresolved: list(def.unresolved),
    suppressedEntities: suppressed,
  };
  out.presentation = out.keyDrivers.length
    ? { kind: 'COMPACT_LIST', lead: def.presentation.lead, rows: out.keyDrivers }
    : def.presentation.kind === 'COMPACT_LIST' ? { kind: 'NONE', lead: null, rows: [] } : def.presentation;
  if (suppressed.length) out.violations = [...def.violations, `derived disclosure suppressed ${suppressed.length} out-of-scope entity identit${suppressed.length > 1 ? 'ies' : 'y'}`];
  return out;
}

export function buildResponse(input: RespondInput, reg: FactRegistry, opt: BuildOptions): ResponseDefinition {
  const violations: string[] = [];
  const rt = (String(input.responseType ?? 'DIRECT').toUpperCase() as ResponseType);
  const responseType: ResponseType = (RESPONSE_TYPES as readonly string[]).includes(rt) ? rt : 'DIRECT';

  /* §14 — `message` is the answer; `headline` is Phase 2's name for the same slot and still resolves */
  const said = (input.message ?? input.headline ?? '').trim();
  let headline = said ? assertion('FACT', said, reg) : null;
  let summary = input.summary?.trim() ? assertion('FACT', input.summary.trim(), reg) : null;
  const rows = lines(input.list ?? input.keyDrivers);
  const keyDrivers = rows.map((t) => assertion('DERIVED_CONCLUSION', t, reg));
  const interpretation = lines(input.interpretation).map((t) => assertion('INFERENCE', t, reg));
  const exceptions = lines(input.exceptions).map((t) => assertion('FACT', t, reg));
  const unresolved = lines(input.unresolved).map((t) => assertion('UNRESOLVED', t, reg));

  /* §20 — a causal claim with nothing behind it is demoted, not deleted.
     PHASE 3: it is only a CLAIM ABOUT THIS COMPANY when a governed read is in play. "EBITDA reflects operating
     profitability before financing structure" is a definition, and Phase 2 recorded it as an unsupported causal
     claim on every conceptual answer — noise in the trace, and it would have been noise on the screen. */
  const demote = (a: Assertion | null): Assertion | null => {
    if (!a || a.type !== 'FACT' || !opt.hasGovernedRead || !CAUSAL.test(withoutRefs(a.text))) return a;
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

  /**
   * A7 §4/§6 — THE SAME CLAIM CHECK, ON THE OTHER BUILDER. `composeDirect` and a stored Phase 2 answer both
   * arrive here rather than through `fromProse`, and a governed status is no less material for having been
   * composed by Korvyn than for having been written by the model. A composed answer will normally pass by
   * construction — it is built FROM the claims — which is exactly why running it costs nothing and proves it.
   */
  const claimsVerified: GovernedClaim[] = [];
  const claimFailures: ClaimFailure[] = [];
  const withheldClaims: string[] = [];
  for (const a of all) {
    const c = claimCheck(a.text, opt);
    claimsVerified.push(...c.verified); claimFailures.push(...c.failures);
    if (c.ok) continue;
    const note = failureNote(c.failures);
    if (!withheldClaims.includes(note)) withheldClaims.push(note);
    violations.push(`status claim unverified: ${c.failures.map((f) => f.reason).join(', ')}`);
  }

  /* a reference the registry cannot resolve is a defect, and the sentence holding it is withheld */
  for (const id of factRefs) if (!reg.get(id)) violations.push(`unknown fact reference ${id}`);

  /* §16 — company-specific figures Korvyn cannot point at anywhere in this conversation */
  /**
   * §16 — A FIGURE CARRIED FORWARD FROM AN EARLIER TURN IS GROUNDED, NOT INVENTED.
   *
   * The registry is the CONVERSATION's, so "what drove it?" restating the two components stated one turn ago is
   * exactly what §12 asks for and costs no read at all. Testing only whether a tool ran THIS turn reported that
   * as three figures with nothing behind them — observed live on the brief's own financial conversation. The
   * question is whether Korvyn can point at the figure, and only the registry knows that.
   */
  if (!opt.hasGovernedRead) {
    for (const a of all) {
      const bare = bareFigures(withoutRefs(a.text)).filter((b) => !reg.holdsDisplay(b) && !reg.holdsMagnitude(b));
      if (bare.length) violations.push(`figure stated with no governed read: ${bare.join(', ')}`);
    }
  }

  return applyDisclosure({
    responseType, headline, summary, keyDrivers, interpretation, exceptions, unresolved,
    presentation: keyDrivers.length
      ? { kind: 'COMPACT_LIST', lead: input.lead?.trim() || null, rows: keyDrivers }
      : { kind: 'NONE', lead: null, rows: [] },
    nextActions: lines(input.nextActions),
    supportingAnalysisIds: opt.objectIds,
    factRefs,
    evidenceRefs: [...new Set(factRefs.flatMap((id) => reg.get(id)?.trace.evidenceIds ?? []))],
    withheldFigures: [],
    claimsVerified, claimFailures, withheldClaims,
    suppressedEntities: [],
    violations,
  }, opt);
}

/* ================================================================================================
   RENDER — deterministic, adaptive, and the only place a governed value becomes text
   ================================================================================================ */

export interface RenderedResponse {
  /**
   * The answer in reading order. `label` survives as a field and is ALWAYS null (§4 — no headings); `row` marks
   * a line that belongs to the supporting list, so the renderer can draw rows tightly instead of spacing six
   * one-line paragraphs down the panel.
   */
  parts: { label: string | null; text: string; assertion: AssertionType; objectIds: string[]; row?: boolean }[];
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
/**
 * §4/§7 — THE SHAPE FOLLOWS THE ANSWER, AND THERE IS NO SHAPE TO FOLLOW.
 *
 * Phase 2 drew a quiet label above each section — Summary, Key drivers, What this suggests, Worth a look, Not
 * yet established. Measured on the brief's own close conversation, that turned a two-sentence answer into a
 * 207-word report with three headings, which is what §4 rules out. NO LABEL IS EVER DRAWN NOW. What survives is
 * the assertion TYPE on each part, which the browser carries on the element rather than spelling out in prose,
 * so a fact and an inference are still distinguishable without a heading saying so.
 *
 * §18 — A SENTENCE HOLDING A REFERENCE KORVYN CANNOT RESOLVE IS WITHHELD, and now at the SENTENCE, not the
 * paragraph. With the answer as prose one dangling reference would otherwise take the whole reply with it.
 */
/**
 * C1.2 §4/§6 — THE ANSWER AS THE MODEL WROTE IT, references and all.
 *
 * Exactly the parts `renderResponse` publishes, in the same order, with `{{FACT:id}}` left alone. This is what
 * the transcript hands back on the next turn: a reformat can then carry a governed figure across by CITING it,
 * which is the only way a figure survives reformatting without being retyped.
 *
 * It mirrors the renderer deliberately rather than sharing a traversal with it — the renderer withholds, drops
 * and rewrites, and none of that belongs in a record of what was said.
 */
export function sourceText(def: ResponseDefinition): string {
  const out: string[] = [];
  const add = (a: Assertion | null) => { if (a?.text.trim()) out.push(a.text.trim()); };
  add(def.headline);
  add(def.summary);
  if (def.presentation.kind === 'NONE') def.keyDrivers.forEach(add);
  else {
    if (def.presentation.lead) out.push(def.presentation.lead.trim());
    def.presentation.rows.forEach(add);
  }
  def.interpretation.forEach(add);
  def.exceptions.forEach(add);
  def.unresolved.forEach(add);
  return out.join('\n\n');
}

export function renderResponse(def: ResponseDefinition, reg: FactRegistry): RenderedResponse {
  const parts: RenderedResponse['parts'] = [];
  const unresolved: string[] = [];
  const bare: string[] = [];
  const typed: string[] = [];

  const push = (a: Assertion | null, row = false) => {
    if (!a) return;
    const r = renderFacts(a.text, reg);
    unresolved.push(...r.unresolved);
    /* the model's own prose, with the governed values taken back out, is what it wrote on its own authority.
       §17 splits it: a figure the registry already holds was Korvyn's number written the long way round; a
       figure it does not hold is the one worth a warning. */
    for (const b of bareFigures(withoutRefs(a.text))) ((reg.holdsDisplay(b) || reg.holdsMagnitude(b)) ? typed : bare).push(b);
    if (!r.unresolved.length) { parts.push({ label: null, text: r.text, assertion: a.type, objectIds: a.objectIds, ...(row ? { row: true } : {}) }); return; }
    /* §18 — keep every sentence Korvyn CAN stand behind and drop only the one with the hole in it. A sentence
       that names an account and a period and then states nothing still reads as data, which is why it goes;
       taking the paragraph with it would throw away what was answered. */
    const kept = r.text.split(/(?<=[.!?])\s+/).filter((sn) => !sn.includes('[figure unavailable]')).join(' ').trim();
    if (kept) parts.push({ label: null, text: kept, assertion: a.type, objectIds: a.objectIds, ...(row ? { row: true } : {}) });
  };

  push(def.headline);
  push(def.summary);
  /* a prose answer's further paragraphs are MESSAGE, not rows: they were written as sentences and they read
     as sentences. Only a definition that declares a presentation draws one. */
  if (def.presentation.kind === 'NONE') def.keyDrivers.forEach((a) => push(a));

  /* §14 — the supporting rows, under the answer, with the model's own lead-in if it wrote one and nothing
     manufactured if it did not. `keyDrivers` is Phase 2's name for the same rows and still renders. */
  const pres = def.presentation;
  if (pres.kind === 'COMPACT_LIST' && pres.rows.length) {
    if (pres.lead) push({ type: 'FACT', text: pres.lead, factRefs: [], objectIds: [] });
    pres.rows.forEach((a) => push(a, true));
  }

  /* §25/§26 — the model's reading and what Korvyn cannot establish are still typed, and still said. They are
     sentences in the answer now rather than sections under a heading. */
  def.interpretation.forEach((a) => push(a));
  def.exceptions.forEach((a) => push(a));
  def.unresolved.forEach((a) => push(a));

  /* every sentence was withheld: say so once, rather than returning an empty answer */
  if (!parts.length && unresolved.length) {
    parts.push({ label: null, assertion: 'UNRESOLVED', objectIds: [],
      text: 'Korvyn could not resolve the figures behind that, so it is not showing them. Ask again and Sloane will read the governed objects fresh.' });
  }
  const text = parts.map((p) => p.text).join('\n\n');
  /* §30 — what the model asked for, else what the figures themselves can support. A conceptual answer with no
     governed figure behind it offers nothing, which is correct: there is nowhere to go. */
  /**
   * §6 — FACT METADATA ENABLES DRILLABILITY; IT DOES NOT PROPOSE IT.
   *
   * This used to fall back to `drillActions(def, reg)`, which read every cited fact's `availableDrills` and
   * turned each into a button. So "View the accounts" and "View the trial balance" appeared under every
   * revenue-shaped answer — identical every time, because they were a property of the DATA SHAPE rather than of
   * the conversation. That is why they read as machinery.
   *
   * Only what the model actually asked for is offered now. `drillOffers` is still exported and still used to
   * make a taken offer runnable without a model call; what is gone is Korvyn volunteering them.
   */
  const nextActions = def.nextActions;
  return { parts, text, unresolved: [...new Set(unresolved)], bare: [...new Set(bare)], typed: [...new Set(typed)], nextActions };
}

/* ================================================================================================
   §4/§14 — PROSE IS THE ANSWER CHANNEL
   ================================================================================================ */

/**
 * PHASE 3 — THE MODEL WRITES, AND THAT IS THE ANSWER.
 *
 * Phase 2 treated prose as an escape hatch and Phase 2.5 closed it by DISCARDING the model's words and composing
 * a sentence from the governed result instead. Measured on the brief's close conversation, that replaced a
 * reviewer's walkthrough of the largest blocker with "…moved by $0.26M, made up of 5 entitys, the largest being
 * …" — a correct figure answering a question nobody asked. The escape hatch was the road.
 *
 * So prose becomes a first-class `ResponseDefinition`: the references resolve, the withholding rule applies, the
 * offers are computed from the cited facts, the trace records the same violations. ONE path, two authors.
 *
 * §26 — A CAUSAL CLAIM IS STILL CHECKED, and at the sentence. A paragraph is kept whole unless it contains a
 * causal sentence nothing supports, in which case that sentence is split out and typed INFERENCE — so the
 * reader can tell which part Korvyn stands behind without the paragraph as a whole being demoted.
 */
/**
 * §17 — INTERNAL METADATA MUST STAY INTERNAL.
 *
 * FLUX_UNEXPLAINED, RECONCILIATION_NOT_TIED, TASK_BLOCKED, GROUPED_BY, DERIVED, CANDIDATE: these are Korvyn's
 * own constants and a reader of a finance product should never meet one. The prompt asks for the finance words;
 * this MEASURES whether it got them, so the trace says when it did not.
 *
 * It is a FINDING, not a rewrite. Translating a constant into prose here would mean guessing what the model
 * meant by it, and a guess inside an answer about money is worse than a recorded defect. The test is shape, not
 * a dictionary: two or more UPPER_SNAKE words, or a bare id prefix, in text meant to be read.
 */
const INTERNAL = /\b([A-Z][A-Z0-9]{2,}_[A-Z0-9_]{2,})\b/g;

/**
 * §17, the other half — NARRATING THE PLUMBING. A constant is the obvious leak; the commoner one is a sentence
 * about Korvyn's own machinery rather than about the book: "that read came back at the group level", "this read
 * only tells me", "I don't have an ownership field". Measured on §40's twenty-five questions, it was the ONLY
 * thing that made Sloane read worse than the bare model, on two of them.
 *
 * Shape, not a dictionary: a read/tool/query as the SUBJECT of a sentence, or a missing field/column named as a
 * field. It is a finding, never a rewrite — guessing what the model meant and saying it differently is worse in
 * an answer about money than a recorded defect.
 */
const PLUMBING: readonly RegExp[] = [
  /\b(?:this|that|the|my|a)\s+(?:read|lookup|query)\b/i,
  /\btool\s+(?:call|result|output)s?\b/i,
  /\b(?:the\s+)?(?:tool|query|read)\s+(?:returned|came back|gives me|shows me)\b/i,
  /\bI\s+(?:don'?t|do not)\s+have\s+(?:an?|the)\s+\w+\s+(?:field|column|attribute)\b/i,
  /\b(?:population|populations|schema|payload|endpoint)\b/i,
];

export function internalVocabulary(text: string): string[] {
  const clean = withoutRefs(text);
  const constants = [...clean.matchAll(INTERNAL)].map((m) => m[1]!);
  const plumbing = PLUMBING.flatMap((re) => { const m = re.exec(clean); return m ? [m[0]!.trim()] : []; });
  return [...new Set([...constants, ...plumbing])];
}

export function fromProse(text: string, reg: FactRegistry, opt: BuildOptions): ResponseDefinition {
  const violations: string[] = [];
  const withheldFigures: string[] = [];
  const claimsVerified: GovernedClaim[] = [];
  const claimFailures: ClaimFailure[] = [];
  const withheldClaims: string[] = [];
  /**
   * §39 — AN INVENTED FIGURE NEVER REACHES THE PERSON, AND THAT DID NOT CHANGE WITH THE CHANNEL.
   *
   * A reference Korvyn cannot resolve leaves a hole and its sentence is withheld. A figure the model TYPED and
   * Korvyn can find nowhere is the same defect arriving the other way round, and it gets the same treatment —
   * the sentence goes, the rest of the answer stands, and the person is told. A magnitude the registry holds is
   * Korvyn's own number written the long way round and stays: the digits are governed and the direction is in
   * the verb ("EBITDA fell $0.39M" against a stored "($0.39M)").
   *
   * Only on a GOVERNED turn. With no read behind the answer this is general knowledge — "margins typically run
   * 20–30%" is not a claim about their book, and dropping it would be dropping the answer.
   */
  const invented = (sn: string): string[] =>
    (opt.hasGovernedRead
      ? bareFigures(withoutRefs(sn)).filter((b) => !reg.holdsDisplay(b) && !reg.holdsMagnitude(b))
      : []);
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: Assertion[] = [];
  for (const p of paras) {
    /**
     * C1.2 §15 — A BLOCK THAT HAS LINES KEEPS THEM.
     *
     * Sentence splitting rejoins with a space, so a bulleted answer arrived as one long run-on: the structure
     * the person had explicitly asked for was removed between the model writing it and the browser drawing it.
     * A paragraph carrying its own line breaks is one unit and is not re-flowed.
     *
     * The withholding rule (§39) still applies, at LINE granularity rather than sentence granularity — a
     * bullet with an invented figure is dropped and the rest of the list stands. Same guarantee, measured on
     * the unit the text is actually written in.
     */
    if (p.includes('\n')) {
      const kept = p.split('\n').filter((ln) => {
        const bad = invented(ln);
        if (bad.length) {
          bad.forEach((b) => { if (!withheldFigures.includes(b)) withheldFigures.push(b); });
          violations.push(`figure with no governed reference withheld: ${bad.join(', ')}`);
          return false;
        }
        /* A7 — a row asserting a governed status is checked exactly as a sentence is */
        const c = claimCheck(ln, opt);
        claimsVerified.push(...c.verified); claimFailures.push(...c.failures);
        if (c.ok) return true;
        const note = failureNote(c.failures);
        if (!withheldClaims.includes(note)) withheldClaims.push(note);
        violations.push(`status claim withheld: ${c.failures.map((f) => f.reason).join(', ')}`);
        return false;
      }).join('\n').trim();
      if (!kept) continue;
      const a = assertion('FACT', kept, reg);
      const demote = opt.hasGovernedRead && CAUSAL.test(withoutRefs(kept)) && !supportedCausal(a, reg);
      if (demote) violations.push(`causal claim without support demoted to inference: "${kept.slice(0, 60)}"`);
      out.push(demote ? { ...a, type: 'INFERENCE' as const } : a);
      continue;
    }
    const sentences = p.split(/(?<=[.!?])\s+/).filter((x) => x.trim() && !(() => {
      const bad = invented(x);
      if (bad.length) {
        bad.forEach((b) => { if (!withheldFigures.includes(b)) withheldFigures.push(b); });
        violations.push(`figure with no governed reference withheld: ${bad.join(', ')}`);
        return true;
      }
      /**
       * A7 §4/§12 — THE SENTENCE IS THE UNIT, because a sentence is what asserts that its claims belong
       * together. "It ties, support is complete, and the reviewer returned it" is three claims about one object,
       * and partial support does not make it true — A6's defect was exactly a sentence whose three claims were
       * individually real and collectively about nothing.
       */
      const c = claimCheck(x, opt);
      claimsVerified.push(...c.verified); claimFailures.push(...c.failures);
      if (c.ok) return false;
      const note = failureNote(c.failures);
      if (!withheldClaims.includes(note)) withheldClaims.push(note);
      violations.push(`status claim withheld: ${c.failures.map((f) => f.reason).join(', ')}`);
      return true;
    })());
    if (!sentences.length) continue;
    const typedSentences = sentences.map((sn) => {
      const a = assertion('FACT', sn.trim(), reg);
      /* the same rule as `buildResponse`: with no governed read this is a definition, not a claim about them */
      if (!opt.hasGovernedRead || !CAUSAL.test(withoutRefs(sn)) || supportedCausal(a, reg)) return a;
      violations.push(`causal claim without support demoted to inference: "${sn.trim().slice(0, 60)}"`);
      return { ...a, type: 'INFERENCE' as const };
    });
    /* a paragraph with nothing demoted stays ONE paragraph — the common case, and the one that reads right.
       It is rebuilt from the SURVIVING sentences, never from `p`, or a withheld one would walk back in. */
    if (typedSentences.every((a) => a.type === 'FACT')) { out.push(assertion('FACT', sentences.map((x) => x.trim()).join(' '), reg)); continue; }
    /* consecutive sentences of the same type rejoin, so a demotion costs one split and not one per sentence */
    for (const a of typedSentences) {
      const prev = out.at(-1);
      if (prev && prev.type === a.type) { out[out.length - 1] = assertion(a.type, `${prev.text} ${a.text}`, reg); continue; }
      out.push(a);
    }
  }
  const factRefs = [...new Set(out.flatMap((a) => a.factRefs))];
  for (const id of factRefs) if (!reg.get(id)) violations.push(`unknown fact reference ${id}`);
  const leaked = internalVocabulary(text);
  if (leaked.length) violations.push(`internal vocabulary reached the answer: ${leaked.join(', ')}`);
  /* the same rule as `buildResponse`: the registry decides, because it outlives the turn */
  if (!opt.hasGovernedRead) {
    for (const a of out) {
      const b = bareFigures(withoutRefs(a.text)).filter((x) => !reg.holdsDisplay(x) && !reg.holdsMagnitude(x));
      if (b.length) violations.push(`figure stated with no governed read: ${b.join(', ')}`);
    }
  }
  /* §12 (Phase 2.6.1) — two populations compared inside one claim is still said, whoever wrote the claim */
  const extra: Assertion[] = [];
  const crossed: string[] = [];
  for (const a of out) {
    const bad = populationMismatch(a.factRefs.map((id) => reg.get(id)).filter((f): f is FinancialFact => !!f));
    if (!bad.length) continue;
    const said = bad.map((m) => `${m.dimension} (${m.values.join(' against ')})`).join(', ');
    violations.push(`figures from different populations compared in one claim: ${said}`);
    if (!crossed.includes(said)) crossed.push(said);
  }
  for (const said of crossed) {
    extra.push(assertion('UNRESOLVED',
      `These figures do not come from the same population — they differ on ${said} — so the difference between them is not a movement. Read them separately.`, reg));
  }
  const head = out[0] ?? null;
  return applyDisclosure({
    responseType: 'DIRECT',
    headline: head,
    summary: null,
    presentation: { kind: 'NONE', lead: null, rows: [] },
    keyDrivers: out.slice(1),
    interpretation: [],
    exceptions: [],
    unresolved: extra,
    nextActions: [],
    supportingAnalysisIds: opt.objectIds,
    factRefs,
    evidenceRefs: [...new Set(factRefs.flatMap((id) => reg.get(id)?.trace.evidenceIds ?? []))],
    withheldFigures,
    claimsVerified, claimFailures, withheldClaims,
    suppressedEntities: [],
    violations,
  }, opt);
}

/**
 * §14 — attach a compact list to an answer the model has already written in prose.
 */
export function withList(def: ResponseDefinition, lead: string | null, rows: string[], reg: FactRegistry): ResponseDefinition {
  const asserted = rows.slice(0, 6).map((t) => assertion('DERIVED_CONCLUSION', t.trim(), reg)).filter((a) => a.text);
  if (!asserted.length) return def;
  const refs = [...new Set([...def.factRefs, ...asserted.flatMap((a) => a.factRefs)])];
  const violations = [...def.violations];
  for (const id of refs) if (!reg.get(id) && !def.violations.some((v) => v.includes(id))) violations.push(`unknown fact reference ${id}`);
  return {
    ...def,
    presentation: { kind: 'COMPACT_LIST', lead: lead?.trim() || null, rows: asserted },
    keyDrivers: asserted,
    factRefs: refs,
    violations,
  };
}

/* ================================================================================================
   THE TOOL THE MODEL CALLS
   ================================================================================================ */

/** §26 — every word of this description is what a finance colleague would understand; no schema vocabulary */
/**
 * §14/§15 — THE ONE PRESENTATION THE MODEL MAY ASK FOR.
 *
 * Phase 2's `respond` is gone from the surface. The model answers by WRITING — the natural output of a model,
 * on the call it was going to spend anyway — so no tool is required to give an answer and nothing forces a shape
 * onto a sentence. What is left is this: when a handful of rows genuinely read better than a sentence, the model
 * says so, and the rows go under the answer with no manufactured heading above them.
 *
 * §20 — it is a SUPPORTING presentation, not the population. A governed read may have returned fifty rows; what
 * belongs here is the few the answer is about, and the rest stays one drill away.
 */
/**
 * §7/§15/§40 — THE ONE PRESENTATION DECLARATION.
 *
 * It is NOT a UI action and it is not topic-specific: §40 rules out `open_close_screen` and `render_ebitda_panel`
 * and is right to — those are screens, and a tool that names a screen cannot be planned over. This names a SHAPE.
 * Claude decides whether rows or a table would help; Korvyn decides whether it can honour that and renders it.
 *
 * NOT CALLING IT IS THE DEFAULT AND THE COMMON CASE. Before this existed, every governed object a tool returned
 * was drawn as a table with its own heading — so a capex question could put an income statement on screen
 * because a statement object had been read on the way. Retrieval is not presentation, and this field is the
 * only way anything becomes visible.
 *
 * An AGENT never calls it. It is inert outside a conversation, which is why presentation could not have been a
 * property of the tool results themselves.
 */
export const SHOW_TOOL: import('./tools.js').V2ToolDef = {
  name: 'show',
  description:
    'Put something on the person’s screen, ALONGSIDE your written answer — never instead of it. '
    + 'ONE TEST, and it is about what THEY asked for, not about what you read: '
    + 'did they ask to SEE something, or did they ask a QUESTION? '
    + '"Show me all of them", "list every vendor", "give me the full breakdown", "what are the rest?", "all 15" are asking to see — call this. '
    + '"What is blocking close?", "how did June look?", "what happened to capex?", "who owns them?" are questions — answer them, call nothing. '
    + 'A question does not become a request to see because the answer is long or because a tool returned rows; say the few that matter and offer the rest. '
    + 'kind=table shows a governed result you read this turn: pass its objectId from the tool result. kind=list shows rows you write yourself, '
    + 'and is for when they asked to see a handful of things you are naming.',
  input_schema: {
    type: 'object' as const,
    properties: {
      kind: { type: 'string' as const, description: 'list | table' },
      rows: { type: 'array' as const, items: { type: 'string' as const }, description: 'For kind=list: up to six short rows, most important first, each company figure written as its {{FACT:id}} reference.' },
      lead: { type: 'string' as const, description: 'Optional. One short line introducing what is shown, in your own words.' },
      of: { type: 'string' as const, description: 'For kind=table: the id of the governed result to show, exactly as it appeared in a tool result this turn.' },
    },
    required: ['kind'],
    additionalProperties: false as const,
  },
};
