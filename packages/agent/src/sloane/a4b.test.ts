/**
 * A4 §8/§9 — WHAT A PERSON SEES OF A RUNNING AGENT, and what they must never see.
 *
 * The product projection is PHASES and MILESTONES. The model's own reasoning — its reading of the request, its
 * working notes, its confidence — stays on the run's record for the trace and the audit trail, and does not
 * travel into the lines a person reads.
 *
 *   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { serverActor, type Actor } from './tools.js';
import type { AgentRunBody } from './agent/model.js';
import type { AgentStepOut } from './schema.js';

const me = serverActor();
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];
const usage = { inputTokens: 900, outputTokens: 120, cacheReadTokens: 80, cacheWriteTokens: 0 };
const ok = <T>(value: T, route: string) => ({ status: 'ok' as const, latencyMs: 1, requestId: null, usage, model: 'claude-sonnet-5', route, value });
const read = (tool: string, args: Record<string, string>) => ({ tool, intent: 'READ' as const, purpose: `Reading ${tool}`, progress: 'Reviewing close status', args: Object.entries(args).map(([name, value]) => ({ name, value })) });

/** the shapes the live model actually produced: paragraphs of the model talking about the request and to itself */
const UNDERSTANDING = 'The user wants the Electrical CIP (account 15000) reconciliation status for Jun 2026 established: what is unresolved, its materiality, ownership, and supporting evidence';
const NOTE = 'I should check the tie status before reading the support, because an untied reconciliation changes what support would even mean';

const step = (o: Partial<AgentStepOut>): AgentStepOut => ({
  goalClass: 'CLOSE_READINESS', understanding: UNDERSTANDING, decision: 'CALL_TOOLS', calls: [], needCapabilities: [],
  workingNotes: [{ text: NOTE, support: 'SUPPORTED', observationRefs: [] }], openQuestions: [], question: null, options: [], confidence: 0.82,
  escalate: { needed: false, reason: null, detail: null }, ...o,
}) as AgentStepOut;

test('§9 — the model\'s reading of the request never becomes a line a person reads', async () => {
  const a = new MockLLMAdapter(); Object.defineProperty(a, 'provider', { value: 'scripted' });
  const A = a as unknown as Record<string, unknown>;
  A['classifyObjective'] = async () => ok({ outcome: 'ANALYZE', workClass: 'CLOSE_READINESS', understanding: 'scripted', needsDeepReasoning: false, confidence: 0.9 }, 'NARRATE');
  let n = 0;
  A['agentStep'] = async (_i: unknown, o: { route: string }) => {
    n += 1;
    return ok(n === 1 ? step({ calls: [read('getCloseBlockers', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' }), o.route);
  };
  A['agentSynth'] = async (_i: unknown, o: { route: string }) => ok({ headline: 'Nothing material is unresolved.', inspected: [], findings: [], unresolved: [], nextSteps: [], confidence: 0.7, escalate: { needed: false, reason: null, detail: null } }, o.route);

  const orch = new SloaneOrchestrator(a, { maxPlanSteps: 8 }, () => me);
  const r = orch.agents.start(me, 'Review where the June close stands.', { sessionId: 'a4b-progress-1' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const t0 = Date.now();
  let b: AgentRunBody;
  for (;;) { b = orch.agents.body(r.run.runId, me as Actor)!; if (TERMINAL.includes(b.runStatus) || b.runStatus.startsWith('WAITING') || Date.now() - t0 > 20000) break; await new Promise((z) => setTimeout(z, 25)); }

  const lines = orch.agents.view(b).progress.map((p) => p.line);
  assert.ok(lines.length, `there is progress to read (${b.runStatus}: ${b.graph.tasks.map((t) => `${t.taskId}:${t.status}:${t.error ?? ''}`).join(' | ')})`);

  /* §9 — nothing a person reads is the model talking */
  assert.equal(lines.some((l) => l.includes(UNDERSTANDING.slice(0, 40))), false, 'its reading of the request is not a progress line');
  assert.equal(lines.some((l) => l.includes(NOTE.slice(0, 30))), false, 'nor are its working notes');
  assert.equal(lines.some((l) => /\bI should\b|\bthe user wants\b/i.test(l)), false, 'nothing reads as the model talking');
  assert.equal(lines.some((l) => /getCloseBlockers|taskId|planKey|\bM2\b|POLICY_PROFILES/.test(l)), false, 'and no plumbing');
  /* what IS there is the work, in the product's own words */
  assert.ok(lines.some((l) => /Reviewing close status/.test(l)), 'the work is described');

  /* §8 — it is KEPT, on the run's own record, where a trace and an audit read it */
  assert.ok(b.events.some((e) => e.type === 'UNDERSTANDING' && e.label.includes(UNDERSTANDING.slice(0, 40))), 'the understanding is recorded, not discarded');
  assert.equal(b.investigation!.understanding, UNDERSTANDING, 'and it is on the investigation for the trace');
});
