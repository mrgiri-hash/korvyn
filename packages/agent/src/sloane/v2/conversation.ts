/**
 * SLOANE V2 — THE DURABLE CONVERSATION STORE.
 *
 * §4/§18: the transcript is a record, not process memory. It lives in the same sqlite work store every other governed
 * object uses (kind `SLOANE_CONVERSATION`, id = sessionId), so a browser refresh or a server restart does not destroy
 * the conversation. §17: this file is the ONE writer of conversation state — there is no second store to drift from.
 *
 * §5: the model sees the last `verbatimTurns` exchanges in the person's own words; older turns are compacted
 * DETERMINISTICALLY (no model call) into short lines that keep the governed references alive.
 */
import { randomUUID } from 'node:crypto';
import { WORK } from '../store.js';
import type { Actor } from '../tools.js';
import { type ConversationBody, type TurnRender, type V2Pending, type V2State, type V2Turn, V2_LIMITS } from './model.js';

const KIND = 'SLOANE_CONVERSATION';

export interface StateSeed { period: string; scope: string; currency: string; basis: string; lens: string; bookId: string }

export function initialState(seed: StateSeed): V2State {
  return {
    period: seed.period, periodRange: null, comparisonPeriod: null, scope: seed.scope,
    accountingBookId: seed.bookId, accountingBasis: seed.basis, reportingLens: seed.lens, currency: seed.currency,
    activeObject: null, activeAnalysisId: null, activePopulationId: null, selectedRowId: null, selectedCellId: null,
    currentInvestigationId: null, agentRunId: null, lastRefs: {},
  };
}

/** Load the conversation, or start one. A record owned by someone else is never adopted: a new one is started. */
export function loadConversation(sessionId: string, actor: Actor, seed: StateSeed): ConversationBody {
  /* a Stamped record IS the body with the store's stamp merged in; `updatedAt` is the store's and is authoritative */
  const rec = WORK.repos.records.get<ConversationBody>(KIND, sessionId);
  if (rec && rec.owner === actor.id) return { ...rec, summary: rec.summary ?? [], turns: rec.turns ?? [] };
  const now = new Date().toISOString();
  return { sessionId, owner: actor.id, startedAt: now, updatedAt: now, summary: [], turns: [], state: initialState(seed), pending: null };
}

/** One write per turn: the transcript entry, the governed state, the pending question. §17's single contract. */
export function saveConversation(body: ConversationBody, actor: Actor): void {
  /* §3 — titling happens HERE, at the one write, so no call site has to remember to do it and a conversation
     cannot end up in History unnamed because one path forgot */
  const next: ConversationBody = { ...titled(body), updatedAt: new Date().toISOString() };
  const existing = WORK.repos.records.get<ConversationBody>(KIND, body.sessionId);
  try {
    if (existing) WORK.repos.records.update<ConversationBody>(KIND, body.sessionId, null, actor.id, () => next, { period: next.state.period, scope: next.state.scope });
    else WORK.repos.records.insert<ConversationBody>(KIND, next, actor.id, { id: body.sessionId, period: next.state.period, scope: next.state.scope });
  } catch { /* a conversation started against another process's database stays in memory for this turn */ }
}

/**
 * §5 — compaction, FOR THE MODEL. Deterministic and cheap: an older exchange becomes one line that keeps what a
 * later turn may need to resolve a reference (what was asked, what Sloane said, which governed objects it rested
 * on). No model call, so compaction can never invent or drop a figure — it quotes.
 *
 * PHASE C1 §30 — IT NO LONGER TOUCHES THE RECORD, AND THAT SEPARATION IS THE POINT. This used to REPLACE `turns`
 * with the tail, so the durable transcript was trimmed to the model's own context window: a long conversation
 * reopened from History would have returned its last four exchanges and called that the conversation. A model
 * context window and a person's history are two different things and only one of them may be shortened to save
 * tokens.
 *
 * The summary is DERIVED now, at the moment a transcript is built for a provider. `body.summary` survives as a
 * READ-ONLY legacy field: records written before C1 really did drop their older turns, and those lines are the
 * only trace left of them. Nothing writes it any more.
 */
function summaryLine(t: V2Turn): string {
  const refs = [...new Set([...t.refs.objectIds, ...t.refs.populationIds, t.refs.analysisId, t.refs.agentRunId].filter(Boolean))].slice(0, 4);
  const said = t.assistantMessage.replace(/\s+/g, ' ').slice(0, 220);
  return `[${t.at.slice(0, 16).replace('T', ' ')}] asked: "${t.userMessage.replace(/\s+/g, ' ').slice(0, 160)}" · Sloane: ${said}${refs.length ? ` · refs: ${refs.join(', ')}` : ''}`;
}

/** the durable log is capped only so one record cannot grow without bound — see `V2_LIMITS.logTurns` */
export function capLog(body: ConversationBody): ConversationBody {
  return body.turns.length <= V2_LIMITS.logTurns ? body : { ...body, turns: body.turns.slice(-V2_LIMITS.logTurns) };
}

/**
 * The transcript as provider messages: the compacted history first, then the verbatim exchanges.
 *
 * PHASE 1.5 — the LAST message carries `cache: true`. Turn N's request ends its cacheable prefix here, and turn
 * N+1's transcript begins with exactly that prefix, so a conversation is read from the cache instead of being
 * re-priced in full every turn. It is also what makes the second round of a tool-using turn nearly free.
 */
export function transcriptMessages(body: ConversationBody): { role: 'user' | 'assistant'; content: string; cache?: true }[] {
  const out: { role: 'user' | 'assistant'; content: string; cache?: true }[] = [];
  /* the head of the transcript, compacted for the model: legacy summary lines first — they stand for turns a
     pre-C1 record no longer holds — then one line per turn that IS on the record but sits outside the window */
  const older = body.turns.slice(0, Math.max(0, body.turns.length - V2_LIMITS.verbatimTurns));
  const compacted = [...body.summary, ...older.map(summaryLine)].slice(-30);
  if (compacted.length) {
    out.push({ role: 'user', content: `<earlier_conversation>\n${compacted.join('\n')}\n</earlier_conversation>` });
    out.push({ role: 'assistant', content: 'Understood — I have the earlier part of this conversation.' });
  }
  for (const t of body.turns.slice(-V2_LIMITS.verbatimTurns)) {
    out.push({ role: 'user', content: t.userMessage });
    /* C1.2 §4 — the model gets the answer with its `{{FACT:id}}` references intact where they were kept, so a
       request to reorganise what was just said can move a governed figure without re-reading the ledger. The
       person's copy (`assistantMessage`) is the resolved one and is what History restores. */
    out.push({ role: 'assistant', content: t.assistantSource || t.assistantMessage || '(no reply recorded)' });
  }
  const last = out.at(-1);
  if (last) last.cache = true;
  return out;
}

export function appendTurn(body: ConversationBody, turn: Omit<V2Turn, 'turnId' | 'at'>): ConversationBody {
  const t: V2Turn = { turnId: `TRN-${randomUUID().slice(0, 8)}`, at: new Date().toISOString(), ...turn };
  return capLog({ ...body, turns: [...body.turns, t] });
}

/* ==== PHASE C1 — THE CONVERSATION IS A FIRST-CLASS DURABLE OBJECT ==================================
 *
 * §1/§2 — the audit's finding in one sentence: every turn of every conversation has been persisted here since
 * Phase 1, and nothing could read it back. History listed INVESTIGATIONS, so an ordinary exchange — the thing a
 * person actually has with Sloane — appeared nowhere, while 204 single-step investigations created by the v1
 * tool path filled the list it should have been in.
 *
 * Nothing new is stored to fix that. What was missing is a NAME and a READ PATH.
 */

/**
 * §3 — the conversation's own title, derived and free.
 *
 * Deterministic on purpose. A model call per turn to name a thread is a cost paid on every turn for something a
 * person reads once, and it would make a title non-reproducible. The material is already better than the words:
 * a governed answer names the object it resolved, so the FIRST turn that produced one supplies the title.
 *
 * A casual opener is not a subject. "hello" leaves the conversation unnamed rather than creating a list of
 * threads called "Hello", and the title is taken from the first turn that has something to say instead.
 */
/** a greeting or an acknowledgement, with or without a name after it — "hi", "hey Sloane", "thanks!", "are you there" */
const FILLER = /^(hi|hey|hello|yo|thanks|thank you|ta|ok|okay|yes|no|nope|sure|cool|got it|nice|great|morning|good morning|good afternoon|afternoon|evening|are you there|you there|test|testing)\b[\s!.?,]*(sloane|there|korvyn)?[\s!.?,]*$/i;
/**
 * Request scaffolding, stripped only from the FRONT of the sentence.
 *
 * A first cut filtered these words wherever they appeared in the first six, which produced "Happened EBITDA"
 * from "What happened to EBITDA?" and "Was June revenue" from "What was June revenue?" — it was removing the
 * grammar that made the remainder a phrase. What is actually worth dropping is the polite framing a request
 * opens with; an interrogative is part of the subject and stays.
 */
const LEADING = /^(please|kindly|can|could|would|you|give|show|tell|let|me|us|i|want|need|like|to|see|get|pull|up|a|an|the|high-level|high|level|quick|brief|of|for)$/i;

export function deriveTitle(body: ConversationBody): { title: string; fromTurn: number } | null {
  for (let i = 0; i < body.turns.length; i++) {
    const t = body.turns[i]!;
    const q = t.userMessage.trim();
    if (!q || FILLER.test(q)) continue;
    const words = q.replace(/[?!.]+$/, '').split(/\s+/);
    let k = 0;
    while (k < words.length - 1 && k < 6 && LEADING.test(words[k]!)) k++;
    const kept = words.slice(k);
    const use = (kept.length ? kept : words).slice(0, 7).join(' ');
    const title = use.charAt(0).toUpperCase() + use.slice(1);
    return { title: title.length > 58 ? `${title.slice(0, 55)}…` : title, fromTurn: i };
  }
  return null;
}

/**
 * Set or refine the title. It is set once from the first substantive turn and then left alone — a title that
 * moved every turn would make a conversation unfindable in the list a person is scanning. The one refinement is
 * the case the derivation deliberately skipped: a thread that opened casually and became about something.
 */
export function titled(body: ConversationBody): ConversationBody {
  if (body.title && (body.titleFromTurn ?? 0) === 0) return body;
  const d = deriveTitle(body);
  if (!d) return body;
  if (body.title && d.fromTurn >= (body.titleFromTurn ?? 0)) return body;
  return { ...body, title: d.title, titleFromTurn: d.fromTurn };
}

/**
 * §31 — attach what the person saw to the turn that produced it, so History can restore the tables and the
 * offers and not only the prose. Capped: a payload that does not fit keeps its prose and says so, which is an
 * honest partial rather than a thread that silently restores half of itself.
 */
const RENDER_CAP = 48_000;

export function withRender(body: ConversationBody, render: TurnRender): ConversationBody {
  if (!body.turns.length) return body;
  let keep: TurnRender = render;
  try {
    if (JSON.stringify(render).length > RENDER_CAP) keep = { objects: [], narrative: [], presentation: null, suggestions: [], notes: [], workspace: null, trimmed: true };
  } catch { keep = { objects: [], narrative: [], presentation: null, suggestions: [], notes: [], workspace: null, trimmed: true }; }
  const turns = body.turns.slice();
  turns[turns.length - 1] = { ...turns[turns.length - 1]!, render: keep };
  return { ...body, turns };
}

/** what a list of conversations shows: enough to recognise a thread, never enough to be a second transcript */
export interface ConversationSummary {
  sessionId: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  turns: number;
  lastMessage: string;
  period: string;
  scope: string;
  /** §23 — the work objects this conversation produced. Zero or more; never what the conversation IS. */
  investigationId: string | null;
  agentRunId: string | null;
}

/**
 * §24 — LEGACY RECORDS ARE NAMED ON READ, NOT MIGRATED.
 *
 * Eighty conversations were written before a conversation had a title. A migration pass would rewrite eighty
 * governed records to add a field that is DERIVED from what they already contain, which is a write nobody
 * needs and an `updatedAt` on every one of them — reordering the list it exists to make readable. The
 * derivation is deterministic, so computing it at read time gives the same answer at no cost.
 */
const summaryOf = (b: ConversationBody): ConversationSummary => ({
  sessionId: b.sessionId,
  title: b.title || deriveTitle(b)?.title || 'New conversation',
  startedAt: b.startedAt,
  updatedAt: b.updatedAt,
  turns: b.turns.length,
  lastMessage: (b.turns.at(-1)?.assistantMessage || b.turns.at(-1)?.userMessage || '').replace(/\s+/g, ' ').slice(0, 180),
  period: b.state.period,
  scope: b.state.scope,
  investigationId: b.state.currentInvestigationId ?? null,
  agentRunId: b.state.agentRunId ?? null,
});

/**
 * §47 — a conversation is the actor's own or it does not exist to them. The store is filtered on `owner`
 * rather than the caller being trusted to ask for their own; there is no parameter through which another
 * person's thread could be named.
 */
export function listConversations(actor: Actor, limit = 80): ConversationSummary[] {
  return WORK.repos.records.list<ConversationBody>(KIND)
    .filter((b) => b.owner === actor.id && (b.turns ?? []).length > 0)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, limit)
    .map(summaryOf);
}

/** the whole thread, for reopening it: every turn, each with what it showed */
export function readConversation(sessionId: string, actor: Actor) {
  const b = WORK.repos.records.get<ConversationBody>(KIND, sessionId);
  if (!b || b.owner !== actor.id) return null;
  const body = { ...b, turns: b.turns ?? [], summary: b.summary ?? [] };
  return {
    ...summaryOf(body),
    /* §30: the WHOLE human-visible thread, never the model's window. `truncatedHead` is true only for a
       pre-C1 record that dropped its own beginning — it is stated rather than hidden. */
    truncatedHead: (body.summary ?? []).length > 0,
    state: body.state,
    turns: body.turns.map((t) => ({ turnId: t.turnId, at: t.at, userMessage: t.userMessage, assistantMessage: t.assistantMessage, render: t.render ?? null })),
  };
}

export const setPending = (body: ConversationBody, p: V2Pending | null): ConversationBody => ({ ...body, pending: p });

/** what the model is told about the product's current state — identities and governed selections, never a figure */
/**
 * SURGICAL SIMPLIFICATION §2/§4 — THE MINIMUM A MODEL NEEDS TO CALL A TOOL CORRECTLY, AND NOTHING ELSE.
 *
 * This used to carry the active object, every reference in hand, the comparison period, the analysis and
 * population ids, the investigation and agent-run ids, and the SELECTED ROW AND CELL. It was prepended to every
 * user message, including "hello", and the forensic audit isolated it as the cause: with the same system prompt
 * and the same transcript, removing this block turned "Hi — still here on June revenue" into "Hi there — happy
 * to help." The model was not being sticky; it was being told what it was looking at.
 *
 * WHAT SURVIVES IS WHAT A TOOL CALL CANNOT BE CORRECT WITHOUT. A model that does not know the working period
 * cannot fill a period argument, and a model that does not know the scope and basis cannot tell whether an
 * answer is the group's. Four facts about the BOOK, none about the conversation.
 *
 * Everything else is still MAINTAINED on `V2State` and is one `getCurrentContext` call away (§3). UI state —
 * `selectedRowId`, `selectedCellId` — is not reachable at all: it is the browser's, it means nothing to a model,
 * and a future agent step must never inherit it (§4, §15).
 */
export function stateForModel(s: V2State) {
  return {
    period: s.period, scope: s.scope,
    basis: s.accountingBasis, currency: s.currency,
  };
}

/**
 * §3 — THE SAME STATE, ON DEMAND. What `stateForModel` stopped injecting is returned here when the model asks
 * for it, which is what "maintained but not automatically injected" means. A drill or a referent that genuinely
 * needs the active object costs one cheap call; an ordinary turn costs nothing.
 */
export function contextOnDemand(s: V2State) {
  return {
    period: s.period, periodRange: s.periodRange, comparisonPeriod: s.comparisonPeriod, scope: s.scope,
    book: { accountingBookId: s.accountingBookId, accountingBasis: s.accountingBasis, reportingLens: s.reportingLens, currency: s.currency },
    activeObject: s.activeObject, activePopulationId: s.activePopulationId,
    referencesInHand: s.lastRefs,
  };
}

/** the SessionLike shape the 8A ContextAssembler reads — built from v2 state, so the neighbourhood is the right one */
export function sessionLike(s: V2State) {
  return {
    period: { value: s.period, source: 'EXPLICIT' },
    comparisonPeriod: { value: s.comparisonPeriod, source: 'EXPLICIT' },
    scope: { value: s.scope, source: 'EXPLICIT' },
    focus: { value: s.activeObject, source: 'EXPLICIT' },
    populationId: { value: s.activePopulationId, source: 'EXPLICIT' },
    lastRefs: s.lastRefs,
  };
}
