/**
 * A8 — WHICH GOVERNED OBJECT THE PERSON MEANT, AND PROOF THAT IT IS THE ONE THAT WAS READ.
 *
 * WHAT A7 PROVED, AND WHY IT IS THE HARDER PROBLEM. A7 made a statement about a governed object verifiable
 * against that object: a claim that a reconciliation ties is checked against the record that says whether it
 * does. It also proved that this is not enough. Asked for "the MDH intercompany receivable reconciliation",
 * Korvyn read REC-IC-RECV — a GROUP-level reconciliation named "Intercompany Receivable" that genuinely ties,
 * has complete support and was returned by its reviewer — and described it perfectly. Every claim verified.
 * Every figure grounded. The answer was about an object nobody had asked about.
 *
 * A grounded answer to the wrong question is the most dangerous output this product can produce, because every
 * control it passes is a control that reports success.
 *
 * THE CONTRACT. Resolution is not a ranking heuristic with a special case for entities; it is two rules:
 *
 *   HARD CONSTRAINTS FILTER. A governed attribute the person stated — an entity, an id, a period, a book —
 *   is not a scoring bonus that a longer title match can outvote. A candidate contradicting it is not a worse
 *   candidate, it is a DIFFERENT OBJECT, and it is removed. Soft signals (label overlap, recency, salience)
 *   only ever order what survives.
 *
 *   IDENTITY IS VERIFIED AFTER THE READ. Resolution can be wrong. What must not happen is that being wrong
 *   goes unnoticed, so the object a tool RETURNS is checked against the referent that asked for it, on the
 *   governed fields both carry. A returned record that contradicts the intent is not narrated and nothing is
 *   grounded from it.
 *
 * NOTHING HERE INVENTS AN IDENTITY MODEL. Candidates come from `findObjects`, which is already permission- and
 * visibility-filtered (§22: an object the actor may not see never becomes a candidate, so there is nothing to
 * redact later). The constraints are matched against the governed catalogues themselves — entity ids and names
 * from the ledger, periods from the calendar — never against a list of words written here.
 */
import type { ObjectRef } from '../agent/model.js';

/* ================================================================================================
   §3/§4 — WHAT THE PERSON STATED, AS GOVERNED ATTRIBUTES
   ================================================================================================ */

/**
 * A constraint is HARD when the person named a governed thing. The distinction §4 asks for is not a scale of
 * confidence: it is whether contradicting the request would change which OBJECT the answer is about.
 */
export interface ExplicitConstraints {
  /** a governed entity id the request names as a whole word */
  entity: string | null;
  /** a governed object id stated literally — the strongest signal there is */
  objectId: string | null;
  period: string | null;
  scope: string | null;
  book: string | null;
  basis: string | null;
  lens: string | null;
}
export const noConstraints = (): ExplicitConstraints => ({ entity: null, objectId: null, period: null, scope: null, book: null, basis: null, lens: null });

/** a governed name is matched as a WHOLE WORD, so "MDH" does not match inside another token */
export function namesWord(text: string, token: string): boolean {
  if (!token || token.length < 2) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`, 'i').test(text);
}

export interface Catalogues {
  entities: readonly { id: string; name: string }[];
  /** every governed object id the actor could name, so a literal id in the request is recognised as one */
  objectIds?: readonly string[];
  periods?: readonly string[];
}

/**
 * Read the governed attributes a request states. Everything here is matched against a CATALOGUE — the entity
 * list the ledger holds, the periods the calendar governs — so a constraint exists only where the person named
 * something Korvyn actually has. There is no vocabulary of finance words in this file.
 */
export function explicitConstraints(request: string, cat: Catalogues): ExplicitConstraints {
  const c = noConstraints();
  for (const e of cat.entities) {
    if (namesWord(request, e.id) || namesWord(request, e.name)) { c.entity = e.id; break; }
  }
  for (const id of cat.objectIds ?? []) {
    if (namesWord(request, id)) { c.objectId = id; break; }
  }
  for (const p of cat.periods ?? []) {
    if (namesWord(request, p)) { c.period = p; break; }
  }
  return c;
}

/* ================================================================================================
   §2 — THE RESOLUTION RESULT
   ================================================================================================ */

export const RESOLUTION_BASES = [
  /** a module handed Korvyn the object the person had selected (§5) */
  'MODULE_ANCHOR',
  /** the request stated a governed id literally */
  'EXPLICIT_ID',
  /** the request named the object, and it satisfies every explicit constraint */
  'EXPLICIT_NAME',
  /** nothing was named; the conversation is already on an object (§6) */
  'CONVERSATION_REFERENT',
  /** several candidates survived the constraints and one ranked highest on soft signals */
  'RANKED_CANDIDATE',
  /** several materially different candidates survived, and choosing between them is the person's (§9) */
  'AMBIGUOUS',
  /** the constraints are satisfied by nothing the actor may see (§11) */
  'NOT_FOUND',
  /** the request is not about a governed object at all */
  'NONE',
] as const;
export type ResolutionBasis = (typeof RESOLUTION_BASES)[number];

export interface ReferentCandidate {
  ref: string;
  kind: string;
  name: string;
  /** the governed attributes the candidate itself carries, for constraint checking */
  entity?: string | undefined;
  basis?: string | undefined;
  book?: string | undefined;
  lens?: string | undefined;
  /** the soft score `findObjects` produced; only ever used to ORDER what survives the hard filter */
  s?: number;
}

export interface ResolutionTelemetry {
  considered: number;
  /** candidates removed by a hard constraint, and which one removed them */
  rejected: { ref: string; why: string }[];
  survivors: string[];
  basis: ResolutionBasis;
  anchorUsed: boolean;
  inheritedUsed: boolean;
  verified: boolean | null;
  verificationFailures: string[];
}

export interface ResolvedReferent {
  objectRef: ObjectRef | null;
  resolutionBasis: ResolutionBasis;
  explicitConstraints: ExplicitConstraints;
  inheritedConstraints: Partial<ExplicitConstraints>;
  period: string | null;
  scope: string | null;
  book: string | null;
  basis: string | null;
  lens: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** §9 — the materially different candidates a person would have to choose between */
  ambiguous: { ref: string; label: string }[];
  /** §11 — the broader object that WOULD have matched without the constraint, offered and never substituted */
  broaderAlternative: { ref: string; label: string } | null;
  telemetry: ResolutionTelemetry;
}

const emptyTelemetry = (): ResolutionTelemetry => ({ considered: 0, rejected: [], survivors: [], basis: 'NONE', anchorUsed: false, inheritedUsed: false, verified: null, verificationFailures: [] });

export interface ResolveInput {
  request: string;
  /** ALREADY authorized and visibility-filtered (§22) */
  candidates: readonly ReferentCandidate[];
  catalogues: Catalogues;
  /** §5/§7 — the object a module or an investigation anchored this on */
  anchor?: ObjectRef | null;
  /** §6 — the governed object the conversation is already on */
  conversationObject?: ObjectRef | null;
  /** the financial context in force, inherited where the request states nothing */
  context?: { period?: string | null; scope?: string | null; book?: string | null; basis?: string | null; lens?: string | null };
}

const refId = (ref: string) => (ref.includes(':') ? ref.slice(ref.indexOf(':') + 1) : ref);
const refType = (ref: string) => (ref.includes(':') ? ref.slice(0, ref.indexOf(':')) : 'object');
const label = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim();

/**
 * §3/§4 — DOES THIS CANDIDATE CONTRADICT SOMETHING THE PERSON STATED?
 *
 * Only a field the candidate actually CARRIES is compared (§8's "do not compare fields that do not apply"):
 * an account has no entity, and rejecting it for not having one would be inventing a constraint. A candidate
 * that carries the attribute and disagrees is a different object, whatever its label says.
 */
function contradicts(c: ReferentCandidate, k: ExplicitConstraints): string | null {
  if (k.entity && c.entity && c.entity !== k.entity && c.entity !== 'GROUP') return `entity ${c.entity} ≠ ${k.entity}`;
  if (k.basis && c.basis && c.basis !== k.basis) return `basis ${c.basis} ≠ ${k.basis}`;
  if (k.book && c.book && c.book !== k.book) return `book ${c.book} ≠ ${k.book}`;
  if (k.lens && c.lens && c.lens !== k.lens) return `lens ${c.lens} ≠ ${k.lens}`;
  return null;
}

/**
 * §3 — AND A GROUP-LEVEL OBJECT IS NOT A MATCH FOR AN ENTITY-QUALIFIED REQUEST.
 *
 * `contradicts` deliberately lets GROUP through, because a group object is often the right answer to a question
 * that merely mentions an entity in passing. It is NOT the right answer when an entity-specific object of the
 * same kind exists: that is the A7 defect exactly. So a GROUP candidate is demoted rather than removed — it
 * survives to be offered as the broader alternative (§11), and it can still win when nothing else fits.
 */
const isGroup = (c: ReferentCandidate) => c.entity === 'GROUP';

/**
 * The words a request is FRAMED with rather than the words that name what it is about. They are ordinary
 * English — the verbs and function words every request carries — and deliberately not a vocabulary of
 * governed objects: a list of finance terms here would decide what a person may ask about.
 */
const FRAMING = new Set([
  'show', 'tell', 'give', 'find', 'open', 'list', 'view', 'look', 'need', 'want', 'make', 'walk', 'take',
  'what', 'whats', 'which', 'when', 'where', 'this', 'that', 'these', 'those', 'there', 'here', 'they', 'them',
  'with', 'from', 'about', 'into', 'over', 'have', 'does', 'have', 'been', 'will', 'would', 'could', 'should',
  'please', 'again', 'just', 'also', 'only', 'more', 'most', 'much', 'some', 'anything', 'something',
]);

export function resolveReferent(input: ResolveInput): ResolvedReferent {
  const { request, candidates, catalogues } = input;
  const ctx = input.context ?? {};
  const k = explicitConstraints(request, catalogues);
  const tel = emptyTelemetry();
  tel.considered = candidates.length;

  const out = (basis: ResolutionBasis, objectRef: ObjectRef | null, confidence: ResolvedReferent['confidence'], extra: Partial<ResolvedReferent> = {}): ResolvedReferent => {
    tel.basis = basis;
    return {
      objectRef, resolutionBasis: basis, explicitConstraints: k,
      inheritedConstraints: { entity: k.entity ? null : (ctx.scope ?? null), period: k.period ? null : (ctx.period ?? null) },
      period: k.period ?? ctx.period ?? null, scope: ctx.scope ?? null,
      book: k.book ?? ctx.book ?? null, basis: k.basis ?? ctx.basis ?? null, lens: k.lens ?? ctx.lens ?? null,
      confidence, ambiguous: [], broaderAlternative: null, telemetry: tel, ...extra,
    };
  };

  /* ---- 1. a governed id stated literally beats everything, including an anchor -------------------- */
  if (k.objectId) {
    const hit = candidates.find((c) => refId(c.ref) === k.objectId);
    if (hit) return out('EXPLICIT_ID', { type: hit.kind, id: refId(hit.ref), label: label(hit.name) }, 'HIGH');
    /* the person named an id and the actor cannot see it, or it does not exist: never quietly answer another */
    return out('NOT_FOUND', null, 'HIGH');
  }

  /* ---- 2. HARD CONSTRAINTS FILTER; soft signals only order what survives -------------------------- */
  let kept: ReferentCandidate[] = [];
  for (const c of candidates) {
    const why = contradicts(c, k);
    if (why) { tel.rejected.push({ ref: c.ref, why }); continue; }
    kept.push(c);
  }
  tel.survivors = kept.map((c) => c.ref);

  /**
   * §15 — LABELS DISCOVER; IDENTITY DECIDES. A candidate is NAMED when the request contains its label, or the
   * core of its label — the part before the entity qualifier a governed name commonly carries. That distinction
   * is what separates "the MDH intercompany receivable" (which names the core of the MDH object) from an entity
   * that merely appears in a request about something else.
   */
  const req = request.toLowerCase();
  const core = (n: string) => label(n).split(/\s+[\u2014\u2013-]\s+/)[0]!.trim().toLowerCase();
  const nameMatched = (c: ReferentCandidate) => {
    const l = label(c.name).toLowerCase(), cr = core(c.name);
    return (l.length > 3 && req.includes(l)) || (cr.length > 3 && req.includes(cr));
  };
  const byScore = (a: ReferentCandidate, b: ReferentCandidate) => (b.s ?? 0) - (a.s ?? 0);

  /**
   * §10 — A CANDIDATE THE REQUEST ACTUALLY NAMES SOMETHING OF. Weaker than a name match — "cash" is not
   * "Cash and cash equivalents — MER-UK" — and that is exactly the distinction that matters: a word of the
   * request carried by the candidate's own name is what makes a set of objects genuine ALTERNATIVES for what
   * was asked, rather than the incidental keyword hits a search returns for any sentence.
   */
  const words = req.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !FRAMING.has(w));
  const conceptMatched = (c: ReferentCandidate) => {
    const n = label(c.name).toLowerCase();
    return words.some((w) => n.includes(w));
  };

  /**
   * §3 — THE KIND OF OBJECT IS ITSELF A GOVERNED CONSTRAINT, and its vocabulary is the kind's OWN NAME rather
   * than a synonym list somebody has to keep in step with the catalogues — a kind added to the search brings
   * its word with it. "Show me the cash reconciliation" says the subject is a reconciliation, so the statement
   * line that carries the same word is not an alternative to it: it is a different kind of thing, and offering
   * it as one is how a request for a reconciliation gets answered with a balance.
   */
  const kindWords = (kind: string) => {
    const parts = kind.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(' ');
    return [parts.join(' '), parts[parts.length - 1]!];
  };
  const namedKinds = new Set([...new Set(kept.map((c) => c.kind))]
    .filter((k) => kindWords(k).some((w) => namesWord(req, w) || namesWord(req, `${w}s`))));
  if (namedKinds.size) {
    const asked = [...namedKinds].join(' or ');
    for (const c of kept) if (!namedKinds.has(c.kind)) tel.rejected.push({ ref: c.ref, why: `the request asks for a ${asked}; this is a ${c.kind}` });
    kept = kept.filter((c) => namedKinds.has(c.kind));
    tel.survivors = kept.map((c) => c.ref);
  }

  /**
   * §3/§11 — AN ENTITY NARROWS TO OBJECTS OF THAT ENTITY *THAT THE REQUEST ALSO NAMES*.
   *
   * Filtering on the entity alone is not enough and the first cut proved it: "the MER-SG accounts payable
   * reconciliation" kept every MER-SG object — cash, CIP, accruals — because each carries the entity, and then
   * confidently answered with one of them. An entity is half an identity. Where the entity is named and NOTHING
   * of that entity answers to the name, the honest result is that it was not found (§11), never the nearest
   * thing wearing the right entity.
   */
  let searched: ResolvedReferent;
  if (k.entity) {
    const specific = kept.filter((c) => c.entity === k.entity && nameMatched(c)).sort(byScore);
    const broader = kept.filter((c) => isGroup(c) && nameMatched(c)).sort(byScore)[0] ?? null;
    if (specific.length) {
      const best = specific[0]!;
      searched = out('EXPLICIT_NAME', { type: best.kind, id: refId(best.ref), label: label(best.name) }, 'HIGH',
        broader ? { broaderAlternative: { ref: broader.ref, label: label(broader.name) } } : {});
    } else {
      searched = out('NOT_FOUND', null, 'HIGH', broader ? { broaderAlternative: { ref: broader.ref, label: label(broader.name) } } : {});
    }
  } else {
    /**
     * §10/§12 — A CHOICE IS ONLY A CHOICE WHEN THE PERSON NAMED SOMETHING SEVERAL OBJECTS ANSWER TO.
     *
     * "Show me the cash reconciliation" over six authorized cash reconciliations is a real question to put to
     * a person. "Show me the history" is not: it names no governed object at all, and the handful of
     * candidates a keyword search returns for it share nothing but an incidental token. Asking there would
     * make A8 the clarification-heavy experience §10 rules out, and worse, it would break §12's stay-in-
     * context default — a request that names nothing is about the object already in hand. So rivals are drawn
     * from the candidates whose own name the request uses, never from everything the search returned.
     */
    const pool = [...kept].sort(byScore).filter(conceptMatched);
    if (!pool.length) {
      searched = out('NONE', null, 'LOW');
    } else {
      const best = pool[0]!;
      /* §9/§10 — MATERIALLY different means another governed object of the same kind that scores as well. A
         candidate the person's own words already settled is not a rival, and a cosmetic difference never is. */
      const rivals = pool.filter((c) => c !== best && c.kind === best.kind && (c.s ?? 0) >= (best.s ?? 0));
      if (rivals.length && !nameMatched(best)) {
        searched = out('AMBIGUOUS', null, 'LOW', { ambiguous: [best, ...rivals].slice(0, 4).map((c) => ({ ref: c.ref, label: label(c.name) })) });
      } else {
        const named = nameMatched(best);
        searched = out(named ? 'EXPLICIT_NAME' : 'RANKED_CANDIDATE', { type: best.kind, id: refId(best.ref), label: label(best.name) }, named ? 'HIGH' : 'MEDIUM');
      }
    }
  }

  /**
   * ---- 3. §5/§6 — THE ANCHOR HOLDS UNLESS THE REQUEST CLEARLY NAMES ANOTHER OBJECT -----------------
   *
   * "Clearly" is the search resolving to a different object with HIGH confidence — it named it, or stated its
   * id. Anything less is a generic follow-up ("why is this off?", "show me support", "for the last six
   * months"), which is about the thing on screen however many other objects share a word with it. Matching the
   * anchor's label against the request was the first cut and it could not tell those apart.
   */
  if (input.anchor) {
    const changed = searched.objectRef && searched.confidence === 'HIGH' && searched.objectRef.id !== input.anchor.id
      && (searched.resolutionBasis === 'EXPLICIT_NAME' || searched.resolutionBasis === 'EXPLICIT_ID');
    if (!changed) {
      tel.anchorUsed = true;
      return out('MODULE_ANCHOR', input.anchor, 'HIGH');
    }
  }
  return searched;
}

/**
 * §6 — NOTHING WAS NAMED AND THE CONVERSATION IS ALREADY ON SOMETHING. Kept separate from `resolveReferent`
 * because it is a different question: that one asks what the words resolve to, this asks whether they resolve
 * to anything at all. A request naming no candidate does not drop the subject — and one that names a new
 * object replaces it, which is how a topic change works.
 */
export function inheritObject(resolved: ResolvedReferent, conversationObject: ObjectRef | null): ResolvedReferent {
  if (!conversationObject) return resolved;
  /* a choice the person has to make, or a constraint nothing satisfies, is not silently answered with the
     object in hand — the referent is context, never a way to have an answer for everything */
  if (resolved.resolutionBasis === 'AMBIGUOUS' || resolved.resolutionBasis === 'NOT_FOUND') return resolved;
  /**
   * §12 — STAY IN CONTEXT BY DEFAULT. "Show me the history" while a reconciliation is open is about THAT
   * reconciliation; a global search that turns up a weakly-matching object because it shares a word is not a
   * subject change and must not behave like one. Only a request that NAMED an object — or stated its id —
   * displaces what the conversation is on.
   */
  if (resolved.objectRef && (resolved.resolutionBasis === 'EXPLICIT_NAME' || resolved.resolutionBasis === 'EXPLICIT_ID')) return resolved;
  if (resolved.objectRef && resolved.objectRef.id === conversationObject.id) return resolved;
  resolved.telemetry.inheritedUsed = true;
  resolved.telemetry.basis = 'CONVERSATION_REFERENT';
  return { ...resolved, objectRef: conversationObject, resolutionBasis: 'CONVERSATION_REFERENT', confidence: 'MEDIUM' };
}

/* ================================================================================================
   §8 — POST-RETRIEVAL REFERENT VERIFICATION: THE CONTROL THIS PHASE IS FOR
   ================================================================================================ */

export interface ReturnedIdentity {
  /** the governed refs the read came back with */
  refs: Record<string, string>;
  /** the object's own period label and scope, where it states them */
  period?: string | null;
  scope?: string | null;
  type?: string | null;
}

/** the ref key that carries a governed object's own id, by object type */
const ID_REF: Record<string, string> = {
  reconciliation: 'reconciliationId',
  flux: 'fluxItemId',
  fluxExplanation: 'explanationId',
  financialLine: 'financialLineId',
  account: 'account',
  pbcRequest: 'pbcId',
  artifact: 'artifactId',
  closeTask: 'closeTaskId',
};

export interface VerificationResult {
  ok: boolean;
  /** what disagreed, in the words a trace should carry */
  mismatches: string[];
  /** true when the read carried nothing that could be compared — honest, and not a pass */
  unverifiable: boolean;
}

/**
 * DID THE READ COME BACK WITH THE OBJECT THAT WAS ASKED FOR?
 *
 * Only fields BOTH sides carry are compared (§8). A read that states no identity at all cannot be verified and
 * says so rather than reporting success: `unverifiable` is not `ok`, and a caller decides what an unverifiable
 * read is worth. The comparison is on governed IDENTITY, never on labels (§15) — two objects with similar
 * display names are not interchangeable, and that is the whole point.
 */
export function verifyReturned(referent: ResolvedReferent, returned: ReturnedIdentity): VerificationResult {
  const mismatches: string[] = [];
  const want = referent.objectRef;
  const refs = returned.refs ?? {};
  let compared = 0;

  if (want) {
    const key = ID_REF[want.type];
    const got = key ? refs[key] : undefined;
    if (got) {
      compared += 1;
      if (got !== want.id) mismatches.push(`read ${want.type} ${got}, the request resolved ${want.id}`);
    }
  }
  /* an entity the person STATED, against the entity the record carries */
  const wantEntity = referent.explicitConstraints.entity;
  if (wantEntity && refs['entity']) {
    compared += 1;
    if (refs['entity'] !== wantEntity && refs['entity'] !== 'GROUP') mismatches.push(`read entity ${refs['entity']}, the request named ${wantEntity}`);
  }
  /* a period the person stated, against the period the object reports */
  const wantPeriod = referent.explicitConstraints.period;
  if (wantPeriod && refs['period']) {
    compared += 1;
    if (refs['period'] !== wantPeriod) mismatches.push(`read period ${refs['period']}, the request named ${wantPeriod}`);
  }

  referent.telemetry.verified = compared ? mismatches.length === 0 : null;
  referent.telemetry.verificationFailures = mismatches;
  return { ok: mismatches.length === 0, mismatches, unverifiable: compared === 0 };
}

/** §9 — the one sentence a person is asked, built from the governed labels themselves */
export function clarificationFor(r: ResolvedReferent): string | null {
  if (r.resolutionBasis !== 'AMBIGUOUS' || r.ambiguous.length < 2) return null;
  const names = r.ambiguous.slice(0, 4).map((a) => a.label);
  const last = names.pop()!;
  return `I found ${r.ambiguous.length} that match: ${names.join(', ')} and ${last}. Which one do you mean?`;
}

/** §11 — what a person is told when their own constraint is what left nothing */
export function notFoundNote(r: ResolvedReferent): string | null {
  if (r.resolutionBasis !== 'NOT_FOUND') return null;
  const e = r.explicitConstraints.entity;
  const alt = r.broaderAlternative;
  const asked = r.explicitConstraints.objectId ? `${r.explicitConstraints.objectId}` : e ? `one for ${e}` : 'that object';
  return `I could not find ${asked} in what you have access to.${alt ? ` There is a ${alt.label}, which covers more than ${e ?? 'that'} — say so if you want that instead.` : ''}`;
}
