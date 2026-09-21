/**
 * PHASE C1 — THE CONVERSATION EXPERIENCE.
 *
 * What is pinned here is the SERVER half of the contract: a conversation is a first-class durable object, it
 * has a name, it keeps its whole transcript, it remembers what each turn showed, and it is readable only by
 * the person whose conversation it is. The browser half — acknowledgement latency, the sticky composer,
 * scroll and expand/collapse continuity — is verified in the browser, because it is behaviour a unit test
 * cannot observe.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTitle, listConversations, readConversation, saveConversation, appendTurn, capLog, initialState, titled, transcriptMessages, withRender } from './v2/conversation.js';
import { type ConversationBody, V2_LIMITS } from './v2/model.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLLMAdapter } from './adapter.js';
import { DEV_DIRECTORY, actorContext } from './auth.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { KorvynDatabase } from './persistence/db.js';

/* the store is bound by building an orchestrator over a real database file, exactly as the persistence
   suite does — a conversation is a governed record and is written through the same store as everything else */
const db = new KorvynDatabase(join(mkdtempSync(join(tmpdir(), 'korvyn-c1-')), 'work.db'));
const user = (id: string) => actorContext(DEV_DIRECTORY.find((u) => u.id === id)!, null, 'test');
const me = user('user:mgiri'), other = user('user:skim');
new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => me, undefined, db);

const blank = (sessionId: string, owner = me.id): ConversationBody => ({
  sessionId, owner, startedAt: '2026-09-21T09:00:00.000Z', updatedAt: '2026-09-21T09:00:00.000Z', summary: [], turns: [],
  state: initialState({ period: '2026-06', scope: 'GROUP', currency: 'USD', basis: 'US GAAP', lens: 'Corporate Consolidated', bookId: 'CORE-GL' }),
  pending: null,
});
const ask = (b: ConversationBody, q: string, a = 'answer') => appendTurn(b, {
  userMessage: q, assistantMessage: a, path: 'conversation',
  refs: { toolCalls: [], objectIds: [], populationIds: [], evidenceIds: [], analysisId: null, agentRunId: null },
});

test('C1 §30: the durable transcript is not the model context window', () => {
  let b = blank('c1-long');
  for (let i = 1; i <= 30; i++) b = ask(b, `question ${i}`, `answer ${i}`);
  assert.equal(b.turns.length, 30, 'every turn is on the record');
  assert.equal(b.turns[0]!.userMessage, 'question 1');
  /* the model still sees only its window, plus the rest compacted — that is what makes keeping the log free */
  const msgs = transcriptMessages(b);
  assert.equal(msgs.length, 2 + V2_LIMITS.verbatimTurns * 2);
  assert.ok(String(msgs[0]!.content).includes('question 1'));
});

test('C1 §30: the log is capped only against unbounded growth, far above the model window', () => {
  assert.ok(V2_LIMITS.logTurns >= 100, 'a person’s history is not trimmed to a handful of turns');
  let b = blank('c1-cap');
  for (let i = 0; i < V2_LIMITS.logTurns + 5; i++) b = ask(b, `q${i}`);
  assert.equal(capLog(b).turns.length, V2_LIMITS.logTurns);
});

test('C1 §3: a conversation is named from what it is about, and a greeting is not a subject', () => {
  assert.equal(deriveTitle(ask(blank('t1'), 'Give me a high-level June CAPEX overview'))?.title, 'June CAPEX overview');
  assert.equal(deriveTitle(ask(blank('t2'), 'What happened to EBITDA?'))?.title, 'What happened to EBITDA',
    'an interrogative is part of the subject — stripping it produced "Happened EBITDA"');
  assert.equal(deriveTitle(ask(blank('t3'), 'Can you show me the June trial balance'))?.title, 'June trial balance');
  /* a greeting alone names nothing; the conversation is named by the first turn that has something to say */
  assert.equal(deriveTitle(ask(blank('t4'), 'Hi Sloane')), null);
  const later = ask(ask(blank('t5'), 'hey'), 'Why did CIP move in June?');
  assert.equal(deriveTitle(later)?.title, 'Why did CIP move in June');
  assert.equal(deriveTitle(later)?.fromTurn, 1);
});

test('C1 §3: the title is set once and then left alone, so the list a person scans stays stable', () => {
  let b = titled(ask(blank('t6'), 'Why did CIP move in June?'));
  const first = b.title;
  b = titled(ask(b, 'What about revenue?'));
  assert.equal(b.title, first, 'a follow-up does not rename the thread');
  /* the one refinement: a thread that opened casually and then became about something */
  let c = titled(ask(blank('t7'), 'hello'));
  assert.equal(c.title ?? null, null);
  c = titled(ask(c, 'Show me the June close blockers'));
  assert.equal(c.title, 'June close blockers');
});

test('C1 §31: a turn remembers what it showed, and an oversized payload degrades to prose honestly', () => {
  const b = withRender(ask(blank('c1-r'), 'q'), { objects: [{ id: 'FO-1' }], narrative: [{ text: 'hi' }], presentation: null, suggestions: ['View the accounts'], notes: [], workspace: null });
  assert.equal(b.turns.at(-1)!.render!.objects.length, 1);
  assert.deepEqual(b.turns.at(-1)!.render!.suggestions, ['View the accounts']);
  const huge = withRender(ask(blank('c1-h'), 'q'), { objects: [{ blob: 'x'.repeat(60_000) }], narrative: [], presentation: null, suggestions: [], notes: [], workspace: null });
  assert.equal(huge.turns.at(-1)!.render!.trimmed, true, 'stated, not silently half-restored');
  assert.equal(huge.turns.at(-1)!.render!.objects.length, 0);
});

test('C1 §2/§26/§47: conversations list and reopen for their owner, and do not exist for anyone else', () => {
  const id = `c1-own-${Date.now()}`;
  saveConversation(ask(ask(blank(id), 'Give me a high-level June CAPEX overview'), 'Which projects changed the most?'), me);

  const mine = listConversations(me);
  const row = mine.find((c) => c.sessionId === id);
  assert.ok(row, 'it is in the owner’s list');
  assert.equal(row!.title, 'June CAPEX overview');
  assert.equal(row!.turns, 2);

  const full = readConversation(id, me);
  assert.equal(full!.turns.length, 2, 'reopening returns the whole thread, not a summary');
  assert.deepEqual(full!.turns.map((t) => t.userMessage), ['Give me a high-level June CAPEX overview', 'Which projects changed the most?']);

  /* §47 — someone else's conversation reads exactly like one that does not exist */
  assert.equal(readConversation(id, other), null);
  assert.equal(listConversations(other).some((c) => c.sessionId === id), false);
});

test('C1 §24: an ordinary conversation creates no investigation', () => {
  const id = `c1-inv-${Date.now()}`;
  saveConversation(ask(blank(id), 'What was June revenue?'), me);
  assert.equal(readConversation(id, me)!.investigationId, null);
});
