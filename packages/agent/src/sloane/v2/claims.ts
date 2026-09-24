/**
 * A7 — GOVERNED CLAIMS: A STATUS IS AS MATERIAL AS A FIGURE.
 *
 * WHAT A6 PROVED. Phase 2 inverted the order for numbers — Korvyn provides canonical facts, the model
 * REFERENCES them, Korvyn renders the value — so a figure cannot drift. Asked for the status of the MDH
 * intercompany receivable, Sloane answered:
 *
 *     "ties out and its supporting documentation is complete. However, it has been returned by the reviewer."
 *
 * Every property in that sentence is a real governed property of a real reconciliation. None of them is a
 * property of the ONE reconciliation the question named: MDH does not tie, its support is missing, and only
 * the review status was right. The sentence carries no figure at all, so figure grounding had nothing to
 * check — and a reader of a control product would have taken a broken reconciliation for a clean one.
 *
 * THE RULE THIS FILE ENFORCES. A material claim about a governed object must be traceable to THAT object, in
 * the same period and scope, at its current governed version. Semantic compatibility is not support: that
 * REC-MGP-REIT-13100 ties is no reason at all to say REC-MDH-13100 does.
 *
 * WHY THIS IS NOT A SECOND GROUNDING SUBSYSTEM. A claim is promoted from the SAME `FinancialObject.facts[]` a
 * fact is, keyed by the producing tool's own output field, bound to the governed id the same read returned in
 * its `refs`, and held in the SAME per-conversation registry. What a claim adds over a fact is an identity for
 * the OBJECT (a fact's `sourceObjectIds` is the per-run FinancialObject id, which resolves to nothing) and a
 * canonical VALUE that is an enum rather than a formatted number.
 *
 * AND THE VOCABULARY IS NOT A NEW ONE. `STATUS_WORDS` is where a governed status becomes words for a reader;
 * this file reads that same table backwards. A separate list of phrases would drift from the words on screen,
 * and a verifier checking against the wrong words is worse than no verifier at all.
 */
import { createHash } from 'node:crypto';
import type { FinancialObject } from '../tools.js';
import { STATUS_WORDS } from '../toolset.js';

/* ================================================================================================
   §2 — THE CLAIM TYPES
   ================================================================================================ */

/**
 * The kinds of governed statement a sentence can make about an object. Deliberately generic: a reconciliation
 * is the first module to need this and it is not the last, so nothing here names one.
 */
export const CLAIM_TYPES = [
  'TIE_STATUS', 'RECONCILIATION_STATUS', 'REVIEW_STATUS', 'SUPPORT_STATUS', 'APPROVAL_STATUS',
  'CERTIFICATION_STATUS', 'OWNER', 'ASSIGNEE', 'DUE_STATUS', 'SOURCE_AVAILABILITY',
  'PERIOD_STATUS', 'CLOSE_STATUS', 'EXCEPTION_STATUS', 'EVIDENCE_STATUS',
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

/* ================================================================================================
   §3 — CLAIM IDENTITY
   ================================================================================================ */

/** the governed object a claim is ABOUT — an id that resolves outside this run, never a per-run handle */
export interface ClaimObject { type: string; id: string; label: string | null }

export interface GovernedClaim {
  claimId: string;
  claimType: ClaimType;
  object: ClaimObject;
  /** the canonical governed value — the enum the record holds, never the words */
  value: string;
  /** the words a reader sees for that value, from the one vocabulary that produces them */
  display: string;
  period: string;
  scope: string;
  /**
   * §15 — WHEN THIS WAS TRUE. A status changes: a reconciliation certified in v1 and reopened in v2 has two
   * true answers and only one current one. A claim read from a prior version may never be presented as the
   * position now, so the version travels with the claim rather than being assumed from context.
   */
  version: string | null;
  asOf: string;
  /** what it was read from: the canonical fact id where one exists, and the producing read */
  sourceFactId: string | null;
  recordRef: string | null;
  provenance: string;
}

/* the separator is a printable character on purpose: a control byte written into a source file is a defect
   this codebase has shipped once already, and '|' cannot appear in a governed id, a period or a scope name */
const claimIdOf = (parts: (string | null)[]) => `c_${createHash('sha1').update(parts.map((p) => p ?? '').join('|')).digest('hex').slice(0, 12)}`;

/* ================================================================================================
   §7 — STRUCTURED PROPAGATION: CLAIMS COME FROM TOOL RESULTS, NOT FROM PARSING PROSE
   ================================================================================================ */

/**
 * The producing tool's own output field name → what kind of governed statement it is. These are Korvyn's
 * field names, declared in `toolset.ts` and stable; nothing here reads a person's words. A key that is not
 * here produces no claim, which is the right way round: an unmapped status is unverified and therefore
 * unsayable, rather than silently trusted.
 */
const CLAIM_KEY: Record<string, ClaimType> = {
  tieStatus: 'TIE_STATUS',
  reviewStatus: 'REVIEW_STATUS',
  reconciliationStatus: 'REVIEW_STATUS',
  workflowStatus: 'REVIEW_STATUS',
  supportComplete: 'SUPPORT_STATUS',
  missingSupport: 'SUPPORT_STATUS',
  support: 'SUPPORT_STATUS',
  explanationStatus: 'APPROVAL_STATUS',
  approvalStatus: 'APPROVAL_STATUS',
  certified: 'CERTIFICATION_STATUS',
  certificationStatus: 'CERTIFICATION_STATUS',
  owner: 'OWNER',
  preparer: 'OWNER',
  reviewer: 'ASSIGNEE',
  assignee: 'ASSIGNEE',
  due: 'DUE_STATUS',
  dueStatus: 'DUE_STATUS',
  overdue: 'DUE_STATUS',
  sourceStatus: 'SOURCE_AVAILABILITY',
  sourceAvailability: 'SOURCE_AVAILABILITY',
  periodStatus: 'PERIOD_STATUS',
  closeStatus: 'CLOSE_STATUS',
  exceptionStatus: 'EXCEPTION_STATUS',
  evidenceStatus: 'EVIDENCE_STATUS',
};

/**
 * WHICH GOVERNED OBJECT THE READ WAS ABOUT, from the refs the read itself returned. Order is specificity: a
 * reconciliation read that also names its account is about the reconciliation. A read that names no governed
 * object produces no claims at all — there is nothing for a claim to be bound TO, and an unbound claim is the
 * defect this file exists to prevent.
 */
const OBJECT_REF: [string, string][] = [
  ['reconciliationId', 'reconciliation'],
  ['fluxItemId', 'flux'],
  ['explanationId', 'fluxExplanation'],
  ['pbcId', 'pbcRequest'],
  ['artifactId', 'artifact'],
  ['closeTaskId', 'closeTask'],
  ['financialLineId', 'financialLine'],
  ['lineId', 'financialLine'],
];

export function claimObjectOf(refs: Record<string, string>): ClaimObject | null {
  for (const [key, type] of OBJECT_REF) if (refs[key]) return { type, id: refs[key]!, label: null };
  return null;
}

export interface ClaimContext { period: string; scope: string }

/**
 * Promote a governed read's statuses into claims. Two sources, and both are the read's own:
 *
 *   REFS  carry the canonical ENUM (`tieStatus: 'NOT_TIED'`) — the record's own value, which is what a claim
 *         must be verified against.
 *   FACTS carry the same status as a reader sees it (`display: 'does not tie'`), and sometimes carry one the
 *         refs do not.
 *
 * Where both exist the ref wins, because an enum cannot be ambiguous and words can.
 */
export function claimsFrom(o: FinancialObject, ctx: ClaimContext = { period: '', scope: '' }): GovernedClaim[] {
  const refs = o.refs ?? {};
  const object = claimObjectOf(refs);
  if (!object) return [];
  if (o.status === 'UNAVAILABLE') return [];
  const out = new Map<string, GovernedClaim>();
  const period = o.periodLabel || ctx.period;
  const scope = o.scope?.name || ctx.scope;
  const version = refs['reconBalanceVersion'] ?? refs['version'] ?? null;
  const add = (type: ClaimType, value: string, display: string, factId: string | null) => {
    if (!value) return;
    const key = `${type}:${object.id}:${period}`;
    if (out.has(key)) return;
    out.set(key, {
      claimId: claimIdOf([type, object.type, object.id, String(value), period, scope, version]),
      claimType: type, object, value: String(value), display: display || words(String(value)),
      period, scope, version, asOf: new Date().toISOString(),
      sourceFactId: factId, recordRef: refs['reconBalanceId'] ?? null, provenance: o.provenance?.source ?? 'governed read',
    });
  };
  /* the refs first — the record's own enum */
  for (const [key, type] of Object.entries(CLAIM_KEY)) {
    const v = refs[key];
    if (v) add(type, v, words(v), null);
  }
  /* then the facts, for statuses a read states but does not ref */
  for (const f of o.facts ?? []) {
    const type = CLAIM_KEY[f.key];
    if (!type) continue;
    const canonical = typeof f.value === 'string' && f.value ? f.value : canonicalOf(f.display);
    if (canonical) add(type, canonical, f.display, null);
  }
  return [...out.values()];
}

/* ================================================================================================
   §5/§7 — THE VOCABULARY, READ BACKWARDS OUT OF THE ONE TABLE THAT PRODUCES IT
   ================================================================================================ */

const words = (v: string) => STATUS_WORDS[v] ?? v.toLowerCase().replace(/_/g, ' ');

/** the canonical enum for a set of words, where the display vocabulary states one */
function canonicalOf(display: string): string | null {
  const d = display.trim().toLowerCase();
  for (const [k, v] of Object.entries(STATUS_WORDS)) if (v.toLowerCase() === d) return k;
  return null;
}

/**
 * §5 — THE PHRASES THAT ASSERT A GOVERNED STATUS.
 *
 * Every entry is either a value from `STATUS_WORDS` or a form A6 actually observed a model using for it. It is
 * deliberately small: this is not an attempt to understand English, it is the set of statements that, if made
 * about a governed object, are material enough that being wrong about them misleads a controller. A sentence
 * using words that are not here makes no claim this layer checks, and says so in the trace rather than being
 * quietly trusted.
 *
 * A phrase needs its SUBJECT where the same word serves several controls: "complete" alone is a review state,
 * a support state and a close state, and guessing between them is how a verifier invents a failure.
 */
interface Phrase { type: ClaimType; value: string; re: RegExp }
const PHRASES: Phrase[] = [
  /* tie — the control conclusion itself */
  { type: 'TIE_STATUS', value: 'NOT_TIED', re: /\b(?:does not tie|doesn't tie|do not tie|did not tie|is out of balance|out of balance|is out by|not reconciled)\b/i },
  { type: 'TIE_STATUS', value: 'TIED', re: /\b(?:ties out|ties|tied|balances|in balance|reconciles|is reconciled|within tolerance)\b/i },
  { type: 'TIE_STATUS', value: 'SOURCE_NOT_CONNECTED', re: /\b(?:cannot be (?:proved|proven|tested)|source not connected)\b/i },

  /* support / evidence */
  { type: 'SUPPORT_STATUS', value: 'MISSING', re: /\bsupport(?:ing)?(?:\s+\w+){0,2}\s+(?:is |are |remains )?(?:missing|incomplete|outstanding|not (?:complete|attached|provided))\b|\b(?:missing|incomplete) support\b/i },
  { type: 'SUPPORT_STATUS', value: 'COMPLETE', re: /\bsupport(?:ing)?(?:\s+\w+){0,2}\s+(?:is |are )?(?:complete|in place|attached|provided)\b|\bsupport(?:ing)? (?:documentation|evidence) is complete\b/i },

  /* review workflow */
  { type: 'REVIEW_STATUS', value: 'RETURNED', re: /\b(?:returned by the reviewer|returned by a reviewer|has been returned|was returned|is returned)\b/i },
  { type: 'REVIEW_STATUS', value: 'APPROVED', re: /\b(?:review (?:is )?complete|has been approved|is approved|was approved|signed off)\b/i },
  { type: 'REVIEW_STATUS', value: 'SUBMITTED', re: /\b(?:submitted for review|is submitted|awaiting (?:reviewer )?(?:sign-?off|approval)|review (?:is )?pending|approval (?:is )?pending)\b/i },
  { type: 'REVIEW_STATUS', value: 'NOT_STARTED', re: /\breview (?:has )?not (?:been )?started\b|\breview status is not started\b/i },

  /* source availability */
  { type: 'SOURCE_AVAILABILITY', value: 'UNAVAILABLE', re: /\b(?:source (?:is |was )?(?:unavailable|not connected|disconnected)|bank (?:source|feed) (?:is )?(?:unavailable|not connected))\b/i },
  { type: 'SOURCE_AVAILABILITY', value: 'STALE', re: /\b(?:source (?:is |was )?stale|feed is stale|stale (?:source|feed))\b/i },

  /* certification / period */
  { type: 'CERTIFICATION_STATUS', value: 'CERTIFIED', re: /\bis certified\b|\bhas been certified\b/i },
  { type: 'CERTIFICATION_STATUS', value: 'UNCERTIFIED', re: /\b(?:is not certified|uncertified|not yet certified)\b/i },
  { type: 'PERIOD_STATUS', value: 'CLOSED', re: /\bperiod is closed\b|\bthe period has closed\b/i },
  { type: 'PERIOD_STATUS', value: 'OPEN', re: /\bperiod is open\b|\bthe period remains open\b/i },
];

/** what governed statements a sentence makes. Order matters only in that the most specific tie phrase is first. */
export function claimsIn(sentence: string): { type: ClaimType; value: string }[] {
  const out: { type: ClaimType; value: string }[] = [];
  const claimed = new Set<ClaimType>();
  for (const p of PHRASES) {
    if (claimed.has(p.type) || !p.re.test(sentence)) continue;
    claimed.add(p.type);
    out.push({ type: p.type, value: p.value });
  }
  return out;
}

/* ================================================================================================
   §4/§8/§12 — THE VERIFIER
   ================================================================================================ */

export type ClaimFailure =
  | { reason: 'UNSUPPORTED'; type: ClaimType; said: string }
  | { reason: 'VALUE_MISMATCH'; type: ClaimType; said: string; governed: string; object: string }
  | { reason: 'OBJECT_MISMATCH'; type: ClaimType; said: string; object: string; against: string }
  | { reason: 'STALE_VERSION'; type: ClaimType; object: string; version: string };

export interface ClaimVerdict {
  /** the governed claims this sentence is entitled to make */
  verified: GovernedClaim[];
  failures: ClaimFailure[];
  /** the object every verified claim resolved to, where they agree */
  object: ClaimObject | null;
}

/** does this sentence name the object, by governed id or by its label? */
export function namesObject(sentence: string, o: ClaimObject): boolean {
  const s = sentence.toLowerCase();
  if (s.includes(o.id.toLowerCase())) return true;
  const label = (o.label ?? '').toLowerCase().replace(/\s*[—–-]\s*.*$/, '').trim();
  return label.length > 3 && s.includes(label);
}

/**
 * VERIFY EVERY CLAIM IN A SENTENCE, INDEPENDENTLY AND AGAINST ONE OBJECT (§12).
 *
 * The subject is resolved before any claim is checked, because "which object is this about" is the question
 * the A6 defect got wrong. In order: an object the sentence NAMES; the object the caller says is in focus; and
 * — only when exactly one governed object is in play at all — that one. Where the subject cannot be settled
 * and the claims disagree about it, the sentence is rejected rather than attributed to a guess.
 *
 * PARTIAL SUPPORT DOES NOT MAKE A SENTENCE VALID. Three claims, one of them about another reconciliation, is a
 * false statement however true the other two are.
 */
export function verifySentence(sentence: string, held: readonly GovernedClaim[], focus: ClaimObject | null = null): ClaimVerdict {
  const said = claimsIn(sentence);
  if (!said.length) return { verified: [], failures: [], object: null };

  const objects = [...new Map(held.map((c) => [c.object.id, c.object])).values()];
  const named = objects.find((o) => namesObject(sentence, o)) ?? null;
  const subject = named ?? focus ?? (objects.length === 1 ? objects[0]! : null);

  const verified: GovernedClaim[] = [];
  const failures: ClaimFailure[] = [];
  for (const s of said) {
    const forType = held.filter((c) => c.claimType === s.type);
    if (!forType.length) { failures.push({ reason: 'UNSUPPORTED', type: s.type, said: s.value }); continue; }
    const onSubject = subject ? forType.filter((c) => c.object.id === subject.id) : forType;
    if (!onSubject.length) {
      /* the value is real and it belongs to something else — the A6 defect, exactly */
      const other = forType.find((c) => c.value === s.value) ?? forType[0]!;
      failures.push({ reason: 'OBJECT_MISMATCH', type: s.type, said: s.value, object: subject?.id ?? 'unresolved', against: other.object.id });
      continue;
    }
    const hit = onSubject.find((c) => c.value === s.value);
    if (!hit) { failures.push({ reason: 'VALUE_MISMATCH', type: s.type, said: s.value, governed: onSubject[0]!.value, object: onSubject[0]!.object.id }); continue; }
    verified.push(hit);
  }
  /* §12 — every claim in the sentence must resolve to ONE object */
  const ids = [...new Set(verified.map((c) => c.object.id))];
  if (ids.length > 1) {
    for (const c of verified.slice(1)) failures.push({ reason: 'OBJECT_MISMATCH', type: c.claimType, said: c.value, object: ids[0]!, against: c.object.id });
    return { verified: [], failures, object: null };
  }
  return { verified, failures, object: verified[0]?.object ?? subject };
}

/* ================================================================================================
   §17 — WHAT THE VERIFIER SAW, FOR TELEMETRY AND EVAL
   ================================================================================================ */

export interface ClaimTelemetry {
  proposed: number;
  verified: number;
  withheld: number;
  objectMismatch: number;
  valueMismatch: number;
  unsupported: number;
  staleVersion: number;
  permission: number;
}
export const emptyClaimTelemetry = (): ClaimTelemetry => ({ proposed: 0, verified: 0, withheld: 0, objectMismatch: 0, valueMismatch: 0, unsupported: 0, staleVersion: 0, permission: 0 });

export function countFailures(t: ClaimTelemetry, f: readonly ClaimFailure[]): void {
  for (const x of f) {
    if (x.reason === 'OBJECT_MISMATCH') t.objectMismatch += 1;
    else if (x.reason === 'VALUE_MISMATCH') t.valueMismatch += 1;
    else if (x.reason === 'STALE_VERSION') t.staleVersion += 1;
    else t.unsupported += 1;
  }
}

/** one line a person can read, for a sentence that had to go */
export function failureNote(f: readonly ClaimFailure[]): string {
  const m = f.find((x) => x.reason === 'OBJECT_MISMATCH');
  if (m) return `A statement mixed the status of ${m.against} into an answer about ${m.object}, so it was withheld.`;
  const v = f.find((x) => x.reason === 'VALUE_MISMATCH');
  if (v) return `A status statement did not match the governed record and was withheld.`;
  return 'A status statement Korvyn could not verify was withheld.';
}
