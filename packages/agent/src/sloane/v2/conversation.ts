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
import { type ConversationBody, type V2Pending, type V2State, type V2Turn, V2_LIMITS } from './model.js';

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
  const next: ConversationBody = { ...body, updatedAt: new Date().toISOString() };
  const existing = WORK.repos.records.get<ConversationBody>(KIND, body.sessionId);
  try {
    if (existing) WORK.repos.records.update<ConversationBody>(KIND, body.sessionId, null, actor.id, () => next, { period: next.state.period, scope: next.state.scope });
    else WORK.repos.records.insert<ConversationBody>(KIND, next, actor.id, { id: body.sessionId, period: next.state.period, scope: next.state.scope });
  } catch { /* a conversation started against another process's database stays in memory for this turn */ }
}

/**
 * §5 — compaction. Deterministic and cheap: an older exchange becomes one line that keeps what a later turn may need
 * to resolve a reference (what was asked, what Sloane said, which governed objects it rested on). No model call, so
 * compaction can never invent or drop a figure — it quotes.
 */
export function compactIfNeeded(body: ConversationBody): ConversationBody {
  if (body.turns.length <= V2_LIMITS.verbatimTurns) return body;
  const keep = body.turns.slice(-V2_LIMITS.verbatimTurns);
  const older = body.turns.slice(0, body.turns.length - V2_LIMITS.verbatimTurns);
  const lines = older.map((t) => {
    const refs = [...new Set([...t.refs.objectIds, ...t.refs.populationIds, t.refs.analysisId, t.refs.agentRunId].filter(Boolean))].slice(0, 4);
    const said = t.assistantMessage.replace(/\s+/g, ' ').slice(0, 220);
    return `[${t.at.slice(0, 16).replace('T', ' ')}] asked: "${t.userMessage.replace(/\s+/g, ' ').slice(0, 160)}" · Sloane: ${said}${refs.length ? ` · refs: ${refs.join(', ')}` : ''}`;
  });
  const summary = [...body.summary, ...lines].slice(-30);
  return { ...body, summary, turns: keep.slice(-V2_LIMITS.maxTurns) };
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
  if (body.summary.length) {
    out.push({ role: 'user', content: `<earlier_conversation>\n${body.summary.join('\n')}\n</earlier_conversation>` });
    out.push({ role: 'assistant', content: 'Understood — I have the earlier part of this conversation.' });
  }
  for (const t of body.turns.slice(-V2_LIMITS.verbatimTurns)) {
    out.push({ role: 'user', content: t.userMessage });
    out.push({ role: 'assistant', content: t.assistantMessage || '(no reply recorded)' });
  }
  const last = out.at(-1);
  if (last) last.cache = true;
  return out;
}

export function appendTurn(body: ConversationBody, turn: Omit<V2Turn, 'turnId' | 'at'>): ConversationBody {
  const t: V2Turn = { turnId: `TRN-${randomUUID().slice(0, 8)}`, at: new Date().toISOString(), ...turn };
  return compactIfNeeded({ ...body, turns: [...body.turns, t] });
}

export const setPending = (body: ConversationBody, p: V2Pending | null): ConversationBody => ({ ...body, pending: p });

/** what the model is told about the product's current state — identities and governed selections, never a figure */
export function stateForModel(s: V2State) {
  return {
    period: s.period, periodRange: s.periodRange, comparisonPeriod: s.comparisonPeriod, scope: s.scope,
    book: { accountingBookId: s.accountingBookId, accountingBasis: s.accountingBasis, reportingLens: s.reportingLens, currency: s.currency },
    activeObject: s.activeObject, activeAnalysisId: s.activeAnalysisId, activePopulationId: s.activePopulationId,
    selectedRowId: s.selectedRowId, selectedCellId: s.selectedCellId,
    activeInvestigationId: s.currentInvestigationId, activeAgentRunId: s.agentRunId,
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
