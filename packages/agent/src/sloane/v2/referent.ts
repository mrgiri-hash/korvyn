/**
 * C1.1 — CONVERSATIONAL REFERENT CONTINUITY.
 *
 * THE FAILURE THIS EXISTS FOR. Asked "give me capex add by sub and region" and then "show me consolidated",
 * Sloane answered with a generic financial summary. Nothing was broken in the governed layer: the model called
 * `getStatement` with a scope and no subject, the dispatcher's own default read that as "they want the whole
 * statement", and the summary is what a call with no subject means. The subject was never lost by a tool — it
 * was never CARRIED.
 *
 * WHAT THIS IS NOT. It is not the sticky application state that was correctly removed: nothing here is injected
 * into a model call, nothing reads UI state, no `selectedRow` or `activeObject` is pushed at the model, and
 * there is no phrase route. It is lightweight CONVERSATION metadata — what the last governed answer was about —
 * read in exactly one place: the generic dispatch boundary, when a call is elliptical.
 *
 * THE FOUR DIMENSIONS ARE SEPARATE, AND THAT IS THE WHOLE POINT (§5).
 *   SUBJECT   what they are asking about   — capex, EBITDA, revenue
 *   SCOPE     over which part of the group — consolidated, an entity, a region
 *   MEASURE   what kind of figure          — period activity, balance, movement
 *   PRESENTATION  how to show it           — prose, a breakdown, a grid
 * "Show me consolidated" names a SCOPE. A scope does not replace a subject, so the subject survives it. That is
 * ordinary conversational interpretation and it holds for any noun, not for a list of phrases.
 */
import type { ToolArgs } from '../tools.js';
import type { V2ToolOutcome } from './tools.js';

/**
 * What the last governed answer was about. Every field is a RESOLVED dimension of a read that actually ran —
 * never something the model claimed and never something a screen was showing.
 */
export interface ConversationReferent {
  /** the person's own word for the subject ("capex"), not the codes it resolved to */
  subject: string | null;
  /** the stock-or-flow reading that word was answered with, so a scope change does not silently flip it */
  measure: 'BALANCE' | 'ACTIVITY' | null;
  /** the scope the last read was asked for, as it was asked for */
  scope: string | null;
  /** the period that read resolved, so the conversation's working period is a fact rather than an assumption */
  period: string | null;
  comparisonPeriod: string | null;
  /** how the last answer was cut, kept for the record; deliberately NOT inherited — see `inheritReferent` */
  dimension: string | null;
  /** the governed facts that answer was built from */
  sourceFactIds: string[];
  /** which turn set it, so a stale referent is visible in the trace rather than silent */
  atTurn: number;
}

/**
 * The composed operations that take a SUBJECT. A referent can only ever be inherited into one of these, and
 * only one of these can clear it — asking what is blocking close is not a statement about capex either way.
 */
const SUBJECT_OPS = new Set(['getStatement', 'analyzeFinancials', 'getLedgerDetail']);

/**
 * §8 — THE GENERIC BOUNDARY. Not "if consolidated + CAPEX → capex tool": this asks one structural question of
 * any call to any subject-bearing operation — did the model name a subject? If it did, the model wins,
 * absolutely, and a topic switch works because naming a new subject is how you switch topic. If it did not, and
 * it did not ask for a whole statement either, the call is elliptical and the conversation's subject is what it
 * is about.
 *
 * MEASURE RIDES WITH SUBJECT AND ONLY WITH SUBJECT. Inheriting the word without the reading would answer
 * "show me consolidated" after a capex SPEND question with a capex BALANCE — the measure dimension overwritten
 * by a scope change, which is exactly what §5 forbids. An explicitly stated measure still wins.
 */
export function inheritReferent(
  op: string, args: ToolArgs, ref: ConversationReferent | null,
): { args: ToolArgs; inherited: string[] } {
  if (!ref || !ref.subject || !SUBJECT_OPS.has(op)) return { args, inherited: [] };
  if (args['subject']) return { args, inherited: [] };
  /* the model asked for a WHOLE statement by name — a summary, an income statement, a comparison. That is not
     an elliptical call, it is a request with no subject in it, and it must not acquire one. */
  if (op === 'getStatement') {
    const view = (args['view'] ?? '').trim().toLowerCase();
    if (view && !view.startsWith('line')) return { args, inherited: [] };
  }
  const out: ToolArgs = { ...args, subject: ref.subject };
  const inherited = ['subject'];
  if (!out['measure'] && ref.measure) { out['measure'] = ref.measure.toLowerCase(); inherited.push('measure'); }
  return { args: out, inherited };
}

const MONTH = /^\d{4}-\d{2}$/;
const monthOf = (v: string | undefined): string | null => (v && MONTH.test(v) ? v : null);

/**
 * What the turn that just ran was about.
 *
 * THE CLEARING RULE IS THE HALF THAT KEEPS TOPIC SWITCHING HONEST, and it is narrower than "a subject-bearing
 * op ran with no subject". Asking for a WHOLE STATEMENT, or for what moved across one, genuinely moves the
 * conversation off a line, so the referent goes and the next elliptical call inherits nothing. A LEDGER read
 * never clears: a drill into a journal or one transaction is always about something, and wiping the topic
 * because somebody opened a journal by id would be the referent working against the conversation.
 *
 * Anything else — close blockers, a reconciliation, a trace, a workflow read — says nothing either way and
 * leaves it alone. Naming a new subject is how you switch topic, and "go back to CAPEX" names one.
 */
const clears = (o: V2ToolOutcome) => (o.tool === 'getStatement' || o.tool === 'analyzeFinancials') && !o.ctx.subject;

export function nextReferent(
  prev: ConversationReferent | null, outcomes: readonly V2ToolOutcome[], turn: number,
): ConversationReferent | null {
  const ran = outcomes.filter((o) => SUBJECT_OPS.has(o.tool) && o.status === 'COMPLETED');
  const periods = resolvedPeriods(outcomes);
  const withSubject = ran.filter((o) => o.ctx.subject);
  const last = withSubject.at(-1);
  if (!last) {
    if (ran.some(clears)) return null;
    /* the working period still moves — a question about May's close is a conversation about May */
    return prev && periods.period ? { ...prev, ...periods } : prev;
  }
  return {
    subject: last.ctx.subject,
    measure: last.ctx.measure ?? null,
    scope: last.ctx.askedScope ?? prev?.scope ?? null,
    dimension: last.ctx.dimension ?? null,
    sourceFactIds: last.facts.map((f) => f.factId).slice(0, 8),
    period: periods.period ?? prev?.period ?? null,
    comparisonPeriod: periods.comparisonPeriod ?? null,
    atTurn: turn,
  };
}

/**
 * THE OTHER HALF OF THE SAME FAILURE, AND THE MORE SERIOUS ONE.
 *
 * `V2State.period` is seeded from the book's open period and was never written again, so a conversation entirely
 * about May was told "period: 2026-06" on every single turn — the one fact the model is given about the book,
 * actively contradicting the conversation it was in. It passed 2026-06 back, correctly, because that is what it
 * was told. The field always meant "the period this conversation is working in"; it was simply never maintained.
 *
 * Read off the arguments the registered tools were actually GIVEN, so it is what the governed layer resolved
 * rather than what anybody intended. Only a month is accepted — a range or a label is not a working period.
 */
export function resolvedPeriods(outcomes: readonly V2ToolOutcome[]): { period: string | null; comparisonPeriod: string | null } {
  const done = outcomes.filter((o) => o.status === 'COMPLETED');
  const period = done.map((o) => monthOf(o.args['period']) ?? monthOf(o.args['periodEnd'])).filter(Boolean).at(-1) ?? null;
  const comparisonPeriod = done.map((o) => monthOf(o.args['comparisonPeriod'])).filter(Boolean).at(-1) ?? null;
  return { period, comparisonPeriod };
}
