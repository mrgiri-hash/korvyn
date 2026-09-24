/**
 * C1.1 — CONVERSATIONAL REFERENT CONTINUITY.
 *
 * What is pinned here is the RULE, not a phrase. Every case below is a structural question — did the call name
 * a subject, did it ask for a whole statement, did a subject-bearing read resolve one — and none of them
 * mentions "consolidated", "by region" or "what about June", which the brief is explicit are acceptance
 * examples rather than routes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolArgs } from '../tools.js';
import { type ConversationReferent, inheritReferent, nextReferent, resolvedPeriods } from './referent.js';
import type { V2ToolOutcome } from './tools.js';

const ref = (o: Partial<ConversationReferent> = {}): ConversationReferent => ({
  subject: 'capex', measure: 'ACTIVITY', scope: 'GROUP', period: '2026-05',
  comparisonPeriod: null, dimension: 'entity', sourceFactIds: ['f_1'], atTurn: 1, ...o,
});

const out = (tool: string, args: ToolArgs, ctx: Partial<V2ToolOutcome['ctx']> = {}): V2ToolOutcome => ({
  tool, ran: tool, args, status: 'COMPLETED', object: null,
  observation: { step: 1, tool, title: tool, facts: [] } as unknown as V2ToolOutcome['observation'],
  latencyMs: 1, error: null, facts: [],
  ctx: { subject: null, dimension: null, askedScope: null, direct: false, ...ctx },
});

test('C1.1 §3/§8: a call that names only a SCOPE keeps the conversation’s subject', () => {
  /* the live failure: getStatement with a scope, no subject — the dispatcher defaulted that to the whole
     statement summary and the capex subject was gone */
  const r = inheritReferent('getStatement', { scope: 'GROUP', period: '2026-05' }, ref());
  assert.equal(r.args['subject'], 'capex');
  assert.deepEqual(r.inherited, ['subject', 'measure']);
});

test('C1.1 §5: MEASURE travels with the subject, so a scope change cannot flip stock and flow', () => {
  assert.equal(inheritReferent('getStatement', { period: '2026-05' }, ref({ measure: 'ACTIVITY' })).args['measure'], 'activity');
  /* an explicitly stated measure still wins — the model asked for it */
  assert.equal(inheritReferent('getStatement', { period: '2026-05', measure: 'balance' }, ref()).args['measure'], 'balance');
});

test('C1.1 §13: a named subject is the model’s to decide, so a topic switch always works', () => {
  const r = inheritReferent('analyzeFinancials', { subject: 'EBITDA', period: '2026-05' }, ref());
  assert.equal(r.args['subject'], 'EBITDA');
  assert.deepEqual(r.inherited, []);
});

test('C1.1 §8: asking for a WHOLE statement is a request with no subject in it, and must not acquire one', () => {
  for (const view of ['summary', 'income_statement', 'balance_sheet', 'trial_balance', 'comparison']) {
    assert.deepEqual(inheritReferent('getStatement', { view, period: '2026-05' }, ref()).inherited, [], view);
  }
  /* view=line is the elliptical shape: the model wants ONE line and did not say which */
  assert.equal(inheritReferent('getStatement', { view: 'line', period: '2026-05' }, ref()).args['subject'], 'capex');
});

test('C1.1: only a subject-bearing operation can inherit, and nothing inherits without a referent', () => {
  assert.deepEqual(inheritReferent('getControlStatus', { area: 'close' }, ref()).inherited, []);
  assert.deepEqual(inheritReferent('getMetric', { metric: 'EBITDA', period: '2026-05' }, ref()).inherited, []);
  assert.deepEqual(inheritReferent('getStatement', { period: '2026-05' }, null).inherited, []);
});

test('C1.1 §13: a whole-statement read CLEARS the subject; a drill and an unrelated read do not', () => {
  const p = ref();
  assert.equal(nextReferent(p, [out('getStatement', { period: '2026-05' })], 2), null, 'the statement is no longer about a line');
  assert.equal(nextReferent(p, [out('analyzeFinancials', { period: '2026-05' })], 2), null, 'what moved across the statement is not about a line');
  /* a journal opened by id is always ABOUT something — clearing the topic there would work against the reader */
  assert.equal(nextReferent(p, [out('getLedgerDetail', { journalId: 'JE-1' })], 2)?.subject, 'capex');
  /* close blockers say nothing either way */
  assert.equal(nextReferent(p, [out('getControlStatus', { area: 'close' })], 2)?.subject, 'capex');
});

test('C1.1: the referent is what a read RESOLVED, and the last read wins', () => {
  const r = nextReferent(null, [
    out('analyzeFinancials', { account: '15000', period: '2026-05' }, { subject: 'capex', dimension: 'entity' }),
    out('analyzeFinancials', { account: '15000', period: '2026-05' }, { subject: 'capex', dimension: 'region', measure: 'ACTIVITY' }),
  ], 1);
  assert.equal(r?.subject, 'capex');
  assert.equal(r?.dimension, 'region');
  assert.equal(r?.measure, 'ACTIVITY');
  assert.equal(r?.period, '2026-05');
});

test('C1.1: the working period is what the governed reads resolved, not the book’s open period', () => {
  assert.equal(resolvedPeriods([out('getStatement', { period: '2026-05' })]).period, '2026-05');
  /* a range read states its end month; a label is not a working period */
  assert.equal(resolvedPeriods([out('getStatement', { periodStart: '2026-01', periodEnd: '2026-04' })]).period, '2026-04');
  assert.equal(resolvedPeriods([out('getStatement', { period: 'FY26' })]).period, null);
  assert.equal(resolvedPeriods([out('getStatement', { period: '2026-05', comparisonPeriod: '2026-04' })]).comparisonPeriod, '2026-04');
  /* a refused or failed read moved nothing */
  assert.equal(resolvedPeriods([{ ...out('getStatement', { period: '2026-05' }), status: 'REFUSED' }]).period, null);
});

test('C1.1: a turn that changes only the period keeps the subject it is about', () => {
  const r = nextReferent(ref(), [out('getControlStatus', { period: '2026-06' })], 3);
  assert.equal(r?.subject, 'capex');
});
