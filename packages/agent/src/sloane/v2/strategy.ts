/**
 * PHASE 2.5 — THE THREE RESPONSE STRATEGIES (§2–§8, §18, §19).
 *
 * THE PRINCIPLE, AND WHY THIS FILE IS SMALL.
 *
 * Phase 2 made every governed answer cost two model calls: one to read, one to say what was read. For a question
 * whose answer IS the figure that came back — "what is June OPEX?" — the second call adds a sentence and nothing
 * else. It is the model verbalizing a fact Korvyn already understands, at ~2s and ~$0.03 a turn.
 *
 *   MODEL REASONS  →  KORVYN READS  →  KORVYN ANSWERS          (GROUNDED_DIRECT, one model call)
 *   MODEL REASONS  →  KORVYN READS  →  MODEL INTERPRETS        (GROUNDED_REASONING, two)
 *
 * WHAT THIS IS NOT. It is not a router, and §4 rules one out for good reason: a DirectAnswerRouter reading the
 * person's words would be the pre-v2 architecture returning under a new name, and it would have to be extended
 * for every question nobody has thought of yet. THERE IS NO PHRASE MATCHING ANYWHERE IN THIS FILE.
 *
 * WHAT DECIDES, THEN. Three things, in order, and each is structural:
 *
 *   1. THE REQUESTED OPERATION — the model declares `answerMode` on the read it asks for. It is the only party
 *      that knows whether the question wants a figure or a judgement, because that is a property of the QUESTION,
 *      and it already has the question. It is one optional argument, described once.
 *   2. THE RETURNED FACT SHAPE — Korvyn decides whether the result can honestly answer on its own: it COMPLETED,
 *      it is governed, it produced authoritative facts, and those facts fall into a shape there is a composer for.
 *   3. THE COMPOSER — if no composer fits, the turn is NOT direct. Failure is toward Phase 2's behaviour, always.
 *
 * The model PROPOSES and Korvyn VALIDATES, which is the same contract `analysis/context.ts` holds for a grid edit
 * and `agent/` holds for a plan step. A declaration Korvyn cannot honour costs one extra call, never a wrong answer.
 */
import type { Actor, FinancialObject } from '../tools.js';
import { type Drill, type FactRegistry, type FinancialFact, isAuthoritative } from './facts.js';
import type { Assertion, ResponseDefinition, ResponseType } from './respond.js';
import type { V2ToolOutcome } from './tools.js';

/* ================================================================================================
   §3 — THE STRATEGIES
   ================================================================================================ */

/**
 * NOT user-facing, and never named to the person. A strategy is how Korvyn spends model calls on a turn; the
 * person sees an answer, and the answer reads the same either way.
 */
export const STRATEGIES = ['GROUNDED_DIRECT', 'GROUNDED_REASONING', 'AGENTIC_INVESTIGATION'] as const;
export type ResponseStrategy = (typeof STRATEGIES)[number];

/**
 * What the model declares on a governed read; anything else, including nothing, means interpret.
 *
 * The declaration is read from the DISPATCHER'S input, which is where it was written. It is deliberately not
 * forwarded to the registered tool — a governed query has no business knowing why it was asked — so the outcome's
 * `args` (the resolved arguments) never carry it, and `PlanContext` does.
 */
export const ANSWER_MODE_PARAM = 'answerMode';
export const isDirectDeclared = (args: Record<string, string>): boolean =>
  (args[ANSWER_MODE_PARAM] ?? '').trim().toLowerCase().startsWith('direct');

/* ================================================================================================
   §5 — ELIGIBILITY
   ================================================================================================ */

/**
 * A governed result answers ON ITS OWN when all of these hold. Each is a fact about the RESULT or about what the
 * model asked for — none is a fact about the wording of the question.
 *
 * ONE READ, DELIBERATELY. Two reads in a turn mean the answer is a comparison or a synthesis across them, and
 * composing that without the model would be Korvyn deciding what the relationship between two governed objects
 * is. That is interpretation, and it belongs to the second call. The cost of the limit is that "cash and AR at
 * June" pays two calls; the cost of removing it is an answer nobody reasoned about.
 */
export function directEligible(outcomes: V2ToolOutcome[], actor: Actor): { ok: false; reason: string } | { ok: true; outcome: V2ToolOutcome } {
  const ran = outcomes.filter((o) => o.tool !== 'respond');
  if (!ran.length) return { ok: false, reason: 'no governed read ran' };
  if (ran.length > 1) return { ok: false, reason: 'several reads — the answer is a synthesis across them' };
  const o = ran[0]!;
  if (o.status !== 'COMPLETED') return { ok: false, reason: `the read ${o.status.toLowerCase()}` };
  if (!o.object) return { ok: false, reason: 'the read produced no governed object' };
  if (o.object.status === 'UNAVAILABLE') return { ok: false, reason: 'Korvyn could not answer it; that needs words' };
  if (!o.ctx.direct) return { ok: false, reason: 'the model expects to interpret the result' };
  if (!o.facts.some((f) => isAuthoritative(f.kind))) return { ok: false, reason: 'the read produced no authoritative figure' };
  /**
   * §29 — A LIMITED READER'S ANSWER IS ALWAYS WORDED, NEVER COMPOSED.
   *
   * This was found live and it is the most serious thing this phase could have shipped. A scoped accountant asked
   * for the CONSOLIDATED balance sheet; Korvyn published MDH's balance sheet, correctly labelled "for Meridian DC
   * Holdco LLC", with every figure governed and nothing leaked — and the question had been narrowed without
   * anyone saying so. On "what is the REIT's trial balance?" the same path returned a different entity's figures
   * under a correct label, which a careless reader takes as the REIT's.
   *
   * THE FIRST FIX WAS TOO CLEVER AND DID NOT WORK. It compared the scope the model ASKED for against the reader's
   * own, on the theory that a substitution shows up as a mismatch. It does not: the model, which can see the
   * reader's access in its context, had already narrowed the request to MDH before the tool ran. There was
   * nothing left to compare.
   *
   * So the rule is absolute. Whether an answer is narrower than the QUESTION is a fact about the question, and
   * only the model holds that. A reader with limited visibility spends the second call on every governed turn,
   * which is a real latency cost on a minority of readers, and it is the right direction to fail in.
   */
  if (actor.scopeIds !== 'ALL') return { ok: false, reason: 'the reader’s visibility is limited, so the answer may be narrower than the question and has to be worded' };
  return { ok: true, outcome: o };
}

/* ================================================================================================
   §6 — THE COMPOSERS
   ================================================================================================ */

/**
 * The shape a governed result takes, read from the producing tool's OWN output field names. `balance`,
 * `activity`, `driver1.change`, `group2.amount` are declared in `toolset.ts` and stable; none of them is a
 * finance phrase and none of them came from the person.
 */
export type DirectShape = 'VALUE' | 'BREAKDOWN' | 'STATUS';

/**
 * "5 entitys" reached the screen in the brief's own close conversation. A dimension name is Korvyn's word for a
 * cut of the ledger — entity, property, vendor, cost centre — and English pluralises the y-ending ones by rule.
 * Three rules cover every dimension this book carries and every one it is likely to gain; a name that does not
 * match takes the plain -s it already took.
 */
function plural(word: string, n: number): string {
  if (n === 1) return word;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/**
 * The field names a governed service uses for the ONE figure a single-subject read is about.
 * PHASE 2.6 — `metric` joins them: a calculated EBITDA is the answer to "what is June EBITDA?" in exactly the
 * way a balance is the answer to "what is the CIP balance?", and it composes through the same path.
 */
const PRIMARY = ['metric', 'value', 'balance', 'activity', 'amount', 'reported', 'total'];
/**
 * A decomposition member: `driver1.label` + `driver1.change`, `group1.label` + `group1.amount`, `mover1.…`.
 * PHASE 2.6 adds `bridge` (a derived metric's component bridge, §15) and `detail` (the account rows beneath a
 * ranked statement comparison). Both are decompositions of a whole the same read returned, which is what this
 * pattern has always meant — no composer needed teaching what EBITDA is.
 */
const MEMBER = /^(driver|group|mover|contributor|bridge|detail)(\d+)\.(label|change|amount|value)$/;

const byKey = (facts: FinancialFact[]) => new Map(facts.map((f) => [f.sourceKey, f]));

/**
 * PHASE 2.5 §7 — A GOVERNED SERVICE PRINTS AN EM DASH FOR "NOTHING HERE", AND A SENTENCE CANNOT SAY IT.
 *
 * Found by the 125-prompt benchmark: *"The 12000 Prepaid & other current assets balance at Jun 2026 was —,
 * unchanged from —."* Every part of that is technically true and it reads as data, which is the worst shape an
 * empty result can take. A composed answer states a figure only when there IS one; otherwise the turn falls to
 * the model, which can say what Korvyn does hold and why.
 */
const hasFigure = (f: FinancialFact | undefined): boolean => !!f && /\d/.test(f.displayValue);
const ref = (f: FinancialFact | undefined) => (f ? `{{FACT:${f.factId}}}` : '');

/**
 * §7 — THE ANSWER MUST SOUND LIKE A COLLEAGUE, NOT LIKE A RESULT SET.
 *
 * "FinancialFact result: $3.52M" is what this file exists to avoid. The subject is the person's OWN word, carried
 * from the read they asked for (`compose.ts` keeps it for the same reason it writes business titles, §21); the
 * measure decides the shape of the sentence, because a balance and a period's spend are different claims.
 */
function subjectWord(subject: string | null, o: FinancialObject): string {
  /* AN ACCOUNT CODE IS NOT A WORD. A follow-up ("by project") often arrives with the code the model resolved
     earlier rather than the term the person used, and "Jun 2026 15000 by project" is a result set talking. The
     governed object knows what 15000 is called, so that name wins over a bare number. */
  const given = subject && /^[\d,\s]+$/.test(subject) ? null : subject;
  const raw = (given ?? o.focus?.name ?? subject ?? o.title.split('·')[0] ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'That';
  /* an acronym stays an acronym — OPEX, CIP, AR, PP&E. A longer word is sentence-cased and otherwise untouched,
     so "tenant improvements" is not retitled into something the person did not say. */
  if (raw.length <= 5 && !/\s/.test(raw)) return raw.toUpperCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** §29 — a narrowed scope is DISCLOSED, deterministically, without spending a model call to word it */
const scopeClause = (o: FinancialObject, actor: Actor): string => {
  if (o.scope.id === 'GROUP' || !o.scope.name) return '';
  /* naming the scope is the disclosure whether the person asked for it or Korvyn narrowed to what they can see */
  return ` for ${o.scope.name}`;
};

/** the second half of a value sentence: what it was before, and by how much it moved */
function movementClause(m: Map<string, FinancialFact>, primaryKey: string): string {
  const prior0 = m.get(`${primaryKey}.prior`) ?? m.get('prior');
  const change0 = m.get(`${primaryKey}.change`) ?? m.get('change');
  const prior = hasFigure(prior0) ? prior0 : undefined;
  const change = hasFigure(change0) ? change0 : undefined;
  const pct = m.get(`${primaryKey}.change.pct`) ?? m.get('changePct') ?? m.get(`${primaryKey}.changePct`);
  if (!change || change.sign === 'ZERO' || change.sign === 'NOT_NUMERIC') return prior ? `, unchanged from ${ref(prior)}` : '';
  /* §5 — the direction is read from the governed VALUE's sign, never from the formatted string */
  const dir = change.sign === 'POSITIVE' ? 'up' : 'down';
  if (!prior) return `, ${dir} ${ref(change)}`;
  return `, ${dir} from ${ref(prior)}${pct ? ` (${ref(pct)})` : ''}`;
}

/** a VALUE answer: one governed figure, and where it came from */
function composeValue(o: FinancialObject, facts: FinancialFact[], subject: string | null, actor: Actor, stated: 'BALANCE' | 'ACTIVITY' | undefined): Assertion['text'] | null {
  const m = byKey(facts);
  const key = PRIMARY.find((k) => m.get(k) && isAuthoritative(m.get(k)!.kind));
  if (!key) return null;
  const f = m.get(key)!;
  if (f.sign === 'NOT_NUMERIC' || !hasFigure(f)) return null;
  const word = subjectWord(subject, o);
  const scope = scopeClause(o, actor);
  const move = movementClause(m, key);
  /* §13 — a stock and a flow are different claims and read differently. "The CIP balance at Jun 2026" answers
     "what is there"; "Jun 2026 capex" answers "what moved", which is what the person asked when they said spend.
     The DISPATCHER's reading wins where it stated one, because it is the layer that resolved the question; the
     fact's own measure is the fallback, and AMOUNT — a service that did not say — reads neutrally on purpose. */
  const measure = stated ?? f.measure;
  if (measure === 'BALANCE') {
    const named = /balance$/i.test(word) ? word : `The ${word} balance`;
    return `${named} at ${o.periodLabel}${scope} was ${ref(f)}${move}.`;
  }
  if (measure === 'ACTIVITY' || measure === 'YTD_ACTIVITY' || measure === 'PERIOD_MOVEMENT') {
    return `${o.periodLabel} ${word}${scope} was ${ref(f)}${move}.`;
  }
  return `${word}${scope} for ${o.periodLabel} was ${ref(f)}${move}.`;
}

/** one decomposition member, as the facts hold it */
interface Member { n: number; label: FinancialFact; amount: FinancialFact }

function membersOf(facts: FinancialFact[]): Member[] {
  const byN = new Map<number, Partial<Member>>();
  for (const f of facts) {
    const m = MEMBER.exec(f.sourceKey);
    if (!m) continue;
    const n = Number(m[2]);
    const slot = byN.get(n) ?? { n };
    if (m[3] === 'label') slot.label = f; else slot.amount = f;
    byN.set(n, slot);
  }
  return [...byN.values()].filter((x): x is Member => !!x.label && hasFigure(x.amount)).sort((a, b) => a.n - b.n);
}

/**
 * A BREAKDOWN answer: what the movement is made of. The list is the answer, so it is stated as a list rather
 * than summarised into a claim.
 *
 * "THE LARGEST" IS CHECKED, NOT ASSUMED. The producing tools rank their groups, but the word "largest" is a
 * claim about the data and it is cheap to verify: the member amounts are on the facts, so Korvyn compares them
 * and only says it when it holds. A tool that ever changed its ordering could not make this sentence wrong.
 */
function composeBreakdown(o: FinancialObject, facts: FinancialFact[], subject: string | null, actor: Actor, dimension: string | null):
{ headline: string; drivers: string[] } | null {
  const ms = membersOf(facts);
  if (ms.length < 2) return null;
  const m = byKey(facts);
  const total0 = m.get('total') ?? m.get('total.change');
  const total = hasFigure(total0) ? total0 : undefined;
  const word = subjectWord(subject, o);
  const dim = dimension ? ` by ${dimension}` : '';
  const scope = scopeClause(o, actor);
  const amt = (x: Member) => (typeof x.amount.rawValue === 'number' ? Math.abs(x.amount.rawValue) : 0);
  const ranked = ms.every((x, i) => i === 0 || amt(ms[i - 1]!) >= amt(x));
  const lead = ranked ? `, the largest being ${ref(ms[0]!.label)} at ${ref(ms[0]!.amount)}` : '';
  /**
   * PHASE 2.6.1 §7 — A DECOMPOSITION SAYS WHICH FIGURE IT DECOMPOSES.
   *
   * The parts read as a total when the sentence says "comes to", and these parts are frequently a MOVEMENT:
   * a revenue line of $13.01M whose accounts decompose a change of ($0.21M) reads, in that wording, as a
   * statement that revenue was $0.21M. The parts still foot to their parent — which is the property §7 is
   * about — and what was missing is the parent being NAMED. It is read off the total fact's own key, so the
   * sentence cannot disagree with the figure it is built from.
   */
  const isChange = !!total && /\.change$/.test(total.sourceKey);
  const headline = total
    ? isChange
      ? `${o.periodLabel} ${word}${dim}${scope} moved by ${ref(total)}, made up of ${ms.length} ${plural(dimension ?? 'group', ms.length)}${lead}.`
      : `${o.periodLabel} ${word}${dim}${scope} comes to ${ref(total)} across ${ms.length} ${plural(dimension ?? 'group', ms.length)}${lead}.`
    : `${o.periodLabel} ${word}${dim}${scope} breaks down across ${ms.length} ${plural(dimension ?? 'group', ms.length)}${lead}.`;
  const drivers = ms.slice(ranked ? 1 : 0, 6).map((x) => `${ref(x.label)} — ${ref(x.amount)}`);
  return { headline, drivers };
}

/**
 * A STATUS answer: a governed position made of a few named figures — close readiness, a reconciliation summary,
 * a support coverage. There is no single primary figure, so the leading facts ARE the answer.
 */
function composeStatus(o: FinancialObject, facts: FinancialFact[], actor: Actor): { headline: string; rest: string[] } | null {
  /* A QUALIFIER IS NOT A MEASURE. `revenue`, `revenue.prior` and `revenue.change` are one line stated three ways,
     and counting them as three figures made a six-line statement summary look like eighteen and fall past the
     cap below. The primaries are what a person reads; the prior and the change belong to the one they qualify. */
  const primary = facts.filter((f) => !/\.(prior|change|pct|changePct)$/.test(f.sourceKey) && !/\.change\./.test(f.sourceKey));
  /* a governed service prints an em dash for "nothing here", and "Difference — —" is not a sentence */
  const usable = primary.filter((f) => isAuthoritative(f.kind) && /[A-Za-z0-9]/.test(f.displayValue));
  if (!usable.length || usable.length > 8) return null;
  const scope = scopeClause(o, actor);
  const lead = usable.slice(0, 2).map((f) => `${f.label.toLowerCase()} ${ref(f)}`).join(', ');
  return {
    headline: `${o.title.split('·')[0]!.trim() || o.type} at ${o.periodLabel}${scope}: ${lead}.`,
    rest: usable.slice(2, 6).map((f) => `${f.label} — ${ref(f)}`),
  };
}

/* ================================================================================================
   §6 — THE DETERMINISTIC RESPONSE DEFINITION
   ================================================================================================ */

export interface DirectContext {
  actor: Actor;
  /** the person's own word for what they asked about, carried from the composed dispatcher (§7) */
  subject: string | null;
  /** the dimension a breakdown was taken by, for the sentence */
  dimension: string | null;
  /** §13: the stock-or-flow reading the dispatcher resolved, where it stated one */
  measure?: 'BALANCE' | 'ACTIVITY' | undefined;
  /** what Korvyn has to say about how it read the request — a DEFAULTED concept reading, a substitution (§7) */
  note: string | null;
  /** the offers the cited facts can support, resolved by the caller from the registry */
  nextActions: string[];
}

/**
 * Build the answer from the governed result alone. REUSES `ResponseDefinition` — §6 is explicit that there must
 * not be a second formatter, and there is not: what comes back here goes through the same `renderResponse` the
 * model's own `respond` goes through, so the sign safety, the withholding rule and the adaptive shape are one
 * implementation with two callers.
 */
export function composeDirect(o: FinancialObject, facts: FinancialFact[], ctx: DirectContext): { def: ResponseDefinition; shape: DirectShape } | null {
  const A = (text: string, type: Assertion['type'] = 'FACT'): Assertion => {
    const factRefs = [...text.matchAll(/\{\{FACT:([A-Za-z0-9_-]{3,40})\}\}/g)].map((m) => m[1]!);
    return { type, text, factRefs, objectIds: [o.id] };
  };
  const shell = (responseType: ResponseType, headline: Assertion, keyDrivers: Assertion[]): ResponseDefinition => {
    const all = [headline, ...keyDrivers, ...(ctx.note ? [A(ctx.note)] : [])];
    return {
      responseType, headline,
      summary: ctx.note ? A(ctx.note) : null,
      /* §14 — a breakdown's members ARE a compact list; a single figure has no presentation at all */
      presentation: keyDrivers.length
        ? { kind: 'COMPACT_LIST' as const, lead: null, rows: keyDrivers }
        : { kind: 'NONE' as const, lead: null, rows: [] },
      keyDrivers, interpretation: [], exceptions: [], unresolved: [],
      nextActions: ctx.nextActions,
      supportingAnalysisIds: [o.id],
      factRefs: [...new Set(all.flatMap((a) => a.factRefs))],
      evidenceRefs: [],
      withheldFigures: [],
      /* A7 — a COMPOSED answer is built from the governed claims themselves, so it asserts nothing it was not
         given; the fields are present and empty rather than absent, so every reader of a definition is uniform */
      claimsVerified: [], claimFailures: [], withheldClaims: [], suppressedEntities: [],
      violations: [],
    };
  };

  /* A DECOMPOSITION IS ASKED FOR AS A DECOMPOSITION, so it is tried FIRST. `analyzeByDimension` returns both its
     members and a `total`, and `total` is a primary key — so with VALUE first, "show the accounts" came back
     "OPEX for Jun 2026 was $3.52M" over a table of seven accounts. Observed in the browser. */
  const br = composeBreakdown(o, facts, ctx.subject, ctx.actor, ctx.dimension);
  if (br) return { def: shell('FINANCIAL_SUMMARY', A(br.headline), br.drivers.map((d) => A(d, 'DERIVED_CONCLUSION'))), shape: 'BREAKDOWN' };

  const value = composeValue(o, facts, ctx.subject, ctx.actor, ctx.measure);
  if (value) return { def: shell('FINANCIAL_SUMMARY', A(value), []), shape: 'VALUE' };

  const st = composeStatus(o, facts, ctx.actor);
  if (st) return { def: shell('FINANCIAL_SUMMARY', A(st.headline), st.rest.map((d) => A(d, 'DERIVED_CONCLUSION'))), shape: 'STATUS' };

  return null;
}

/* ================================================================================================
   §19/§20 — THE OFFER A PERSON TOOK
   ================================================================================================ */

/**
 * WHERE THE DRILL VOCABULARY COMES FROM, AND WHY THIS IS NOT A PHRASE HANDLER.
 *
 * Korvyn OFFERS next steps at the end of an answer — "View the GL lines behind it", "View the accounts" — read
 * from the cited facts' own drills (§30, Phase 2). The browser renders each as a chip that sends its label back
 * as the person's next message. So when a request is EXACTLY one of the offers Korvyn itself made last turn,
 * nothing has to be understood: the person picked from a menu Korvyn wrote, and the drill behind that menu row
 * is already decided.
 *
 * The match is exact on the normalised label. It is deliberately not fuzzy: a near-match rule would be a phrase
 * handler wearing a different hat, and it would start answering questions nobody clicked. A TYPED drill — "show
 * me the GL" — goes to the model like anything else and costs one call, which is what §20 asks for.
 */
export interface Offer {
  label: string;
  drill: Drill;
  factId: string;
  /**
   * PHASE 2.5 §7 — THE PERSON'S OWN WORD, CARRIED FORWARD INTO THE DRILL.
   *
   * A drill resolves by CODE, because that is what the fact's trace holds and codes are exact. So the read
   * behind "View the accounts" goes out as `subject: '50000,60000'`, and the answer came back "50000,60000 for
   * Jun 2026 was $3.52M" — a result set talking, one turn after the same figure had been called OPEX. Observed
   * in the browser. The word the answer used when it MADE the offer travels with the offer.
   */
  subject: string | null;
}

export const normaliseOffer = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|a|an|it|its|behind|please)\b/g, ' ').replace(/\s+/g, ' ').trim();

export const offerTaken = (request: string, offers: Offer[] | undefined): Offer | null => {
  if (!offers?.length) return null;
  const q = normaliseOffer(request);
  if (!q) return null;
  return offers.find((o) => normaliseOffer(o.label) === q) ?? null;
};

/**
 * A drill is a GOVERNED READ like any other: it goes through the same composed dispatcher, which re-authorizes,
 * runs the registered tool and returns a governed object. What is deterministic here is only which read answers
 * which drill — a table of eight, keyed on Korvyn's own drill enum, with no words in it.
 */
export function drillCall(offer: Offer, fact: FinancialFact, state: { period: string; scope: string }):
{ tool: string; args: Record<string, string> } | null {
  const t = fact.trace;
  const period = state.period;
  const accounts = t.accountIds?.join(',');
  /**
   * Every drill is a DIRECT read by construction — it was offered precisely because the fact could support it,
   * so the answer is the result. The scope travels with it, and an argument with nothing in it is dropped
   * rather than sent empty, exactly as `A()` does for the dispatchers.
   */
  const call = (tool: string, args: Record<string, string | undefined>): { tool: string; args: Record<string, string> } => ({
    tool,
    args: Object.fromEntries(
      Object.entries({
        ...args,
        scope: state.scope && state.scope !== 'GROUP' ? state.scope : undefined,
        [ANSWER_MODE_PARAM]: 'direct',
      }).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== ''),
    ),
  });
  /**
   * §10/§11 — A DRILL INHERITS ITS PARENT'S SEMANTICS. THIS IS A CORRECTNESS FIX, NOT A WORDING ONE.
   *
   * The account drill used to send bare account CODES with no measure, so `resolveMeasure` had neither a verb
   * nor a concept to read and fell back to the natural measure of the accounts themselves. For capex those are
   * CIP and PP&E — balance-sheet accounts — so a parent fact read as ACTIVITY was drilled as a BALANCE, and
   * "June capex was $5.01M" came back with "15100 CIP — buildings ($15.80M)" beneath it: a period flow and a
   * point-in-time movement presented as one decomposition. Both figures governed, the pairing meaningless.
   *
   * The fact already carries its measure and the offer already carries the person's own word. Both are passed:
   * the SUBJECT is the word where there is one ("capex"), because that is what carries the concept and its
   * natural measure, and the MEASURE is stated explicitly so nothing has to be re-derived from codes.
   *
   * Generic by construction — it reads `fact.measure`, so a BALANCE parent drills as a balance and an ACTIVITY
   * parent drills as activity, for any concept. Nothing here knows what capex is. A user who explicitly asks
   * for a different measure is asking a new question and goes to the model, not through this path.
   */
  const measure = fact.measure === 'BALANCE' ? 'balance'
    : (fact.measure === 'ACTIVITY' || fact.measure === 'PERIOD_MOVEMENT' || fact.measure === 'YTD_ACTIVITY') ? 'activity'
      : undefined;
  /* the word beats the codes: it resolves to the same governed members AND carries the concept with it */
  const subjectWord = offer.subject ?? accounts;
  switch (offer.drill) {
    case 'STATEMENT_LINE':
      return call('getStatement', { view: 'line', subject: t.statementLineIds?.[0] ?? accounts, period });
    case 'ACCOUNT_GROUP':
    case 'ACCOUNT':
      return accounts ? call('analyzeFinancials', { dimension: 'account', subject: subjectWord, period, comparisonPeriod: 'none', ...(measure ? { measure } : {}) }) : null;
    case 'TB_POPULATION':
      return call('getStatement', { view: 'trial_balance', period });
    case 'GL_POPULATION':
      return accounts ? call('getLedgerDetail', { subject: subjectWord, period }) : null;
    case 'JOURNAL':
      return t.journalId ? call('getLedgerDetail', { journalId: t.journalId })
        : t.transactionId ? call('getLedgerDetail', { transactionId: t.transactionId }) : null;
    case 'SOURCE_REFERENCE':
      return accounts ? call('traceFinancialObject', { subject: accounts, period }) : null;
    case 'EVIDENCE':
      return t.populationId ? call('getControlStatus', { area: 'evidence', period, populationId: t.populationId }) : null;
    default:
      return null;
  }
}

/** the drills a definition's cited facts can support, with the fact each one would drill FROM (§30) */
export function offersFor(factRefs: string[], reg: FactRegistry, labelOf: (d: Drill) => string, order: readonly Drill[], subject: string | null = null): Offer[] {
  const first = new Map<Drill, string>();
  for (const id of factRefs) {
    const f = reg.get(id);
    if (!f) continue;
    for (const d of f.availableDrills) if (!first.has(d)) first.set(d, id);
  }
  /* ACCOUNT and ACCOUNT_GROUP answer the same question at two grains; offering both is one offer too many */
  if (first.has('ACCOUNT_GROUP')) first.delete('ACCOUNT');
  return order.filter((d) => first.has(d)).map((d) => ({ label: labelOf(d), drill: d, factId: first.get(d)!, subject })).slice(0, 4);
}
