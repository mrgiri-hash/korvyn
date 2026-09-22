/**
 * A2 — PROFILE-DRIVEN RUNTIME, CANONICAL TRACE, EXECUTION ECONOMY.
 *
 *   §2   the conversational turn projects into the SAME trace envelope the agent emits
 *   §3   no run's execution is chosen by the request's words; the objective is CLASSIFIED and Korvyn picks the profile
 *   §4   the invocation gate decides only whether a request is work to carry through
 *   §5   the SAME objective under a DIFFERENT profile changes exposure, autonomy, budget, reasoning and completion,
 *        with no change to AgentRuntime
 *   §6   the legacy templates are the deterministic planner, not the architecture
 *   §7   the subject is extensible ObjectRefs, and a run persisted before A2 still reads
 *   §10  a replan that changes no work is recorded as a no-op rather than counted as a plan change
 *   §14  budgets come from the profile and layer over the deployment's own ceilings
 *   §15  a run starts with no conversation, and is the same run
 *
 * No provider call: the real orchestrator, the real tools, a scripted model.   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { type Actor, ROLES, serverActor } from './tools.js';
import { DEV_DIRECTORY, actorContext } from './auth.js';
import { LEGACY_TEMPLATES, POLICY_PROFILES, type AgentGoal, type AgentRunBody, refOf, refsOf, subjectOf } from './agent/model.js';
import { deterministicOutcome, isAgenticObjective, profileForOutcome } from './agent/objective.js';
import { agentTrace, conversationTrace } from './trace.js';
import type { AgentStepOut } from './schema.js';
import type { V2Trace } from './v2/model.js';

const me = serverActor();
const auditor: Actor = { id: 'user:auditor', name: 'Priya Nair', ...ROLES['EXTERNAL_AUDITOR']! };
const mdh = actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:mdh')!, null, 'test') as unknown as Actor;
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];

const usage = { inputTokens: 900, outputTokens: 120, cacheReadTokens: 80, cacheWriteTokens: 0 };
const ok = <T>(value: T, route: string) => ({ status: 'ok' as const, latencyMs: 1, requestId: null, usage, model: route === 'DEEP' ? 'claude-opus-5' : 'claude-sonnet-5', route, value });
const call = (tool: string, args: Record<string, string>) => ({ tool, purpose: `Reading ${tool}`, progress: `Reading ${tool}`, args: Object.entries(args).map(([name, value]) => ({ name, value })) });
const step = (o: Partial<AgentStepOut>): AgentStepOut => ({ goalClass: 'CLOSE_READINESS', understanding: 'Establish where June stands.', decision: 'CALL_TOOLS', calls: [], needCapabilities: [], workingNotes: [], openQuestions: [], question: null, options: [], confidence: 0.8, escalate: { needed: false, reason: null, detail: null }, ...o }) as AgentStepOut;

/** a model that can reason (so the GENERIC loop runs) and classifies objectives as told */
function scripted(opts: { outcome?: string; steps?: (n: number) => AgentStepOut } = {}) {
  const seen: { contexts: unknown[]; toolIds: string[][] } = { contexts: [], toolIds: [] };
  const a = new MockLLMAdapter(); Object.defineProperty(a, 'provider', { value: 'scripted' });
  const A = a as unknown as Record<string, unknown>;
  A['classifyObjective'] = async () => ok({ outcome: opts.outcome ?? 'ANALYZE', understanding: 'scripted', needsDeepReasoning: false, confidence: 0.9 }, 'NARRATE');
  A['agentStep'] = async (i: { context: unknown; toolIds: string[] }, o: { route: string }) => {
    seen.contexts.push(i.context); seen.toolIds.push(i.toolIds);
    return ok((opts.steps ?? ((n: number) => (n === 1 ? step({ calls: [call('getCloseBlockers', { period: '2026-06' })] }) : step({ decision: 'SYNTHESIZE' }))))(seen.contexts.length), o.route);
  };
  A['agentSynth'] = async (_i: unknown, o: { route: string }) => ok({ headline: 'June has open items.', inspected: ['getCloseBlockers'], findings: [], unresolved: [], nextSteps: [], confidence: 0.6, escalate: { needed: false, reason: null, detail: null } }, o.route);
  const orch = new SloaneOrchestrator(a, { maxPlanSteps: 8 }, () => me);
  orch.artifacts.storage = mkdtempSync(join(tmpdir(), 'korvyn-a2-'));
  return { orch, seen };
}
async function until(o: SloaneOrchestrator, runId: string, actor: Actor, ms = 20000): Promise<AgentRunBody> {
  const t0 = Date.now();
  for (;;) { const b = o.agents.body(runId, actor)!; if (TERMINAL.includes(b.runStatus) || b.runStatus.startsWith('WAITING') || Date.now() - t0 > ms) return b; await settle(25); }
}

/* ================================================================================================
   §4 — THE INVOCATION GATE
   ================================================================================================ */
test('§4 gate — an objective is work to carry through; a question, an edit and a one-turn deliverable are not', () => {
  /* the brief's own examples */
  assert.equal(isAgenticObjective('What was June revenue?').agentic, false);
  assert.equal(isAgenticObjective('Show May EBITDA.').agentic, false);
  assert.equal(isAgenticObjective('Put that in bullets.').agentic, false);
  assert.equal(isAgenticObjective('Investigate why June EBITDA declined and tell me what needs attention.').agentic, true);
  assert.equal(isAgenticObjective('Review the June close, investigate the material unresolved issues, and prepare a controller briefing.').agentic, true);
  /* a deliverable the conversation composes in one turn is not agent work */
  assert.equal(isAgenticObjective('Build the June close review package').agentic, false);
  /* the MODEL's reading outranks the deterministic pre-gate, in both directions */
  assert.equal(isAgenticObjective('What was June revenue?', true).agentic, true);
  assert.equal(isAgenticObjective('Investigate why June EBITDA declined.', false).agentic, false);
  /* the gate decides NOTHING about authority: it returns a boolean and a reason, and no profile */
  const g = isAgenticObjective('Investigate the June close.');
  assert.deepEqual(Object.keys(g).sort(), ['agentic', 'reason']);
});

/* ================================================================================================
   §3 — CLASSIFICATION, NOT TEMPLATE SELECTION
   ================================================================================================ */
test('§3 classification — the model states the OUTCOME and Korvyn chooses the profile; authority caps it', () => {
  /* Korvyn maps outcome → profile. The model is never told which profiles exist. */
  assert.equal(profileForOutcome('ANALYZE', me).profile, 'INVESTIGATION');
  assert.equal(profileForOutcome('PREPARE_DELIVERABLE', me).profile, 'FINANCE_ANALYST');
  assert.equal(profileForOutcome('PREPARE_WORKFLOW_ACTIONS', me).profile, 'CONTROLLER_REVIEW');
  /* an actor who may not prepare is CAPPED, whatever the objective asked for, and the run says so */
  const capped = profileForOutcome('PREPARE_WORKFLOW_ACTIONS', auditor);
  assert.equal(capped.profile, 'INVESTIGATION');
  assert.equal(capped.capped, true);
  assert.match(capped.reason, /may not prepare/);
  /* the deterministic fallback under-classifies on purpose: no model, no preparation */
  assert.equal(deterministicOutcome('Review whether June is safe to sign off.').outcome, 'ANALYZE');
  assert.equal(deterministicOutcome('Compile the FY26 audit workbook.').outcome, 'PREPARE_DELIVERABLE');
});

test('§3 — a conversational run is classified, not template-matched; the words choose nothing', async () => {
  const { orch } = scripted({ outcome: 'ANALYZE' });
  /* the old regex read "Review the June close." as the REVIEW_CLOSE template. With a model it is classified. */
  const r = orch.agents.start(me, 'Review the June close and tell me what is unresolved.');
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const b = await until(orch, r.run.runId, me);
  assert.equal(b.goal.type, 'INVESTIGATE', 'the generic runtime, not a template');
  assert.equal(b.goal.outcomeSource, 'model');
  assert.equal(b.goal.outcome, 'ANALYZE');
  assert.equal(b.goal.policyProfile, 'INVESTIGATION');
  assert.equal(b.planner, 'MODEL');
  assert.ok(b.events.some((e) => e.type === 'OBJECTIVE_CLASSIFIED'));
  /* the classification is ONE cheap call, once per run — never per turn */
  assert.equal(b.trace.modelCalls.filter((c) => c.stage === 'classify').length, 1);
  assert.equal(b.trace.modelCalls.find((c) => c.stage === 'classify')!.route, 'NARRATE');
});

/* ================================================================================================
   §5 — PROFILES ARE THE ONLY SPECIALISATION MECHANISM
   ================================================================================================ */
test('§5 — the SAME objective under a DIFFERENT profile changes exposure, autonomy, budget and completion, with no runtime change', async () => {
  const objective = 'Review the June close and tell me what is unresolved.';
  const a = scripted(); const ra = a.orch.agents.start(me, objective, { profile: 'INVESTIGATION', outcome: 'ANALYZE' });
  const b = scripted(); const rb = b.orch.agents.start(me, objective, { profile: 'READ_ONLY', outcome: 'ANALYZE' });
  assert.ok(ra.ok && rb.ok);
  const A = await until(a.orch, ra.run.runId, me), B = await until(b.orch, rb.run.runId, me);

  /* CAPABILITY EXPOSURE — the profile's domains decide what the planner is shown */
  const domA = new Set(POLICY_PROFILES['INVESTIGATION'].domains), domB = new Set(POLICY_PROFILES['READ_ONLY'].domains);
  assert.ok(domA.has('semantic') && !domB.has('semantic'), 'the two profiles expose different capability families');
  assert.ok(a.seen.toolIds[0]!.length > 0 && b.seen.toolIds[0]!.length > 0);

  /* BUDGET — from configuration, per profile */
  assert.notEqual(A.budget!.maxElapsedMs, B.budget!.maxElapsedMs);
  assert.equal(B.budget!.maxElapsedMs, POLICY_PROFILES['READ_ONLY'].maxRuntimeMs);
  assert.equal(B.investigation!.budget.maxIterations, POLICY_PROFILES['READ_ONLY'].budget.maxIterations);

  /* COMPLETION EXPECTATIONS and PURPOSE reach the planner as its brief — configuration, not code */
  const brief = (x: { brief?: { role: string; doneWhen: string[]; mayPrepare: boolean } }) => x.brief!;
  const bA = brief(a.seen.contexts[0] as never), bB = brief(b.seen.contexts[0] as never);
  assert.equal(bA.role, POLICY_PROFILES['INVESTIGATION'].label);
  assert.equal(bB.role, POLICY_PROFILES['READ_ONLY'].label);
  assert.notDeepEqual(bA.doneWhen, bB.doneWhen, 'each profile states its own completion criteria');

  /* AUTONOMY — and neither may prepare anything */
  assert.equal(bA.mayPrepare, false); assert.equal(bB.mayPrepare, false);
  assert.equal(A.goal.type, B.goal.type, 'the same generic runtime ran both');
});

test('§5 — reasoning class comes from the profile, and the model cannot raise its own budget', async () => {
  const { orch } = scripted();
  const r = orch.agents.start(me, 'Review the June close and tell me what is unresolved.', { profile: 'READ_ONLY', outcome: 'ANALYZE' });
  assert.ok(r.ok);
  const b = await until(orch, r.run.runId, me);
  assert.equal(b.investigation!.nextClass, POLICY_PROFILES['READ_ONLY'].reasoningClass);
  /* the budget the loop was held to is the profile's, not anything the model asked for */
  assert.equal(b.investigation!.budget.maxToolCalls, POLICY_PROFILES['READ_ONLY'].budget.maxToolCalls);
});

/* ================================================================================================
   §6 — THE TEMPLATES ARE THE DETERMINISTIC PLANNER
   ================================================================================================ */
test('§6 — no profile names a read template; the three that remain are the action pipeline, each with a stated reason', () => {
  const named = Object.values(POLICY_PROFILES).map((p) => p.execution).filter((x) => x !== 'GENERIC');
  assert.ok(!named.includes('REVIEW_CLOSE'), 'the close template is no longer named by any profile');
  assert.ok(!named.includes('INVESTIGATE_VENDOR'), 'nor the vendor template');
  for (const t of named) assert.ok(LEGACY_TEMPLATES[t], `${t} is reachable and states why it survives`);
  /* four of the six profiles run the generic runtime outright */
  assert.equal(Object.values(POLICY_PROFILES).filter((p) => p.execution === 'GENERIC').length, 3);
});

test('§6 — with no model, Korvyn plans deterministically and authority is unchanged', async () => {
  /* the MockLLMAdapter cannot reason: the run still does governed work rather than stalling on a call it cannot make */
  const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => me);
  const r = orch.agents.start(me, 'Review the June close.');
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const b = await until(orch, r.run.runId, me);
  assert.equal(b.runStatus, 'COMPLETED', b.completionReason ?? '');
  assert.ok(b.trace.toolCalls.length > 0, 'governed reads still ran');
  assert.equal(b.goal.outcomeSource, 'deterministic');
  assert.ok(b.events.some((e) => e.type === 'PLANNER' && /deterministically/.test(e.label)));
  /* and the profile still came from Korvyn, capped by the actor — never from the template alone */
  assert.ok(b.trace.policyDecisions.some((p) => p.subject.startsWith('profile:')));
});

/* ================================================================================================
   §7 — THE EXTENSIBLE SUBJECT
   ================================================================================================ */
test('§7 — the subject is ObjectRefs; a caller may point a run at any governed object type', async () => {
  const { orch } = scripted();
  const r = orch.agents.start(me, 'Review whether this control is operating.', { refs: [{ type: 'policy', id: 'POL-REV-01', label: 'Revenue cut-off' }, { type: 'closeTask', id: 'CT-88' }] });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const refs = refsOf(r.run.goal);
  assert.ok(refs.some((x) => x.type === 'policy' && x.id === 'POL-REV-01'), 'a type the runtime has no field for');
  assert.ok(refs.some((x) => x.type === 'closeTask'), 'and another');
  assert.equal(refOf(r.run.goal, 'vendor'), null);
});

test('§7 — a run persisted BEFORE A2 still reads: refs are derived from the legacy subject record', () => {
  /* exactly the shape a pre-A2 run holds: `subject` populated, no `refs` at all */
  const legacy = { subject: { vendor: 'Siemens Energy', project: 'SV-PH2', entity: null, account: '15000', pbcRequestId: null, reconciliationId: null, artifactId: null }, labels: { 'SV-PH2': 'South Valley' } } as unknown as AgentGoal;
  const refs = refsOf(legacy);
  assert.equal(refs.length, 3);
  assert.deepEqual(refs.find((r) => r.type === 'project'), { type: 'project', id: 'SV-PH2', label: 'South Valley' });
  assert.equal(refOf(legacy, 'account'), '15000');
  assert.equal(refOf(legacy, 'vendor'), 'Siemens Energy');
  /* and the legacy record round-trips, so a reader that has not moved on sees what it always saw */
  assert.deepEqual(subjectOf(legacy), legacy.subject);
});

/* ================================================================================================
   §2 — ONE TRACE ENVELOPE, TWO PRODUCERS
   ================================================================================================ */
test('§2 — a conversational turn projects into the SAME envelope as an agent run', async () => {
  const { orch } = scripted();
  const r = orch.agents.start(me, 'Review the June close and tell me what is unresolved.');
  assert.ok(r.ok);
  const run = await until(orch, r.run.runId, me);
  const A = agentTrace(run, null, false);

  const v2: V2Trace = {
    runtime: 'v2', traceId: 'STR-abc', sessionId: 'sess-1', path: 'analytical', request: 'What was June revenue?', model: 'claude-sonnet-5',
    escalationReason: null, modelCalls: 2, toolCalls: 1, contextBuilds: 1, toolsExposed: 11, transcriptTurns: 3, latencyMs: 4200,
    firstTokenMs: 1200, firstUsefulMs: 1800, strategy: 'GROUNDED_DIRECT', strategyReason: null, directShape: 'VALUE', workload: 'SLOANE_RUNTIME',
    inputTokens: 3100, outputTokens: 210, cacheReadTokens: 17000, cacheWriteTokens: 0,
    calls: [{ stage: 'reason', model: 'claude-sonnet-5', status: 'ok', latencyMs: 2600, inputTokens: 3100, outputTokens: 210, cacheReadTokens: 17000, stopReason: 'tool_use', error: null }],
    tools: [{ tool: 'getFinancialStatementLine', status: 'COMPLETED', latencyMs: 12, error: null }, { tool: 'postJournalEntry', status: 'REFUSED', latencyMs: 0, error: 'governed action' }],
    activeStateRefs: { analysisId: 'AN-1', agentRunId: null }, ungroundedFigures: [], factsProduced: 6, factRefs: 4, unresolvedRefs: [],
    responseType: 'DIRECT', responseViolations: [], notes: [], diagnostics: [],
  };
  const C = conversationTrace(v2, { id: me.id, role: me.role, scope: me.scopeIds }, false);

  /* ONE contract: the same keys, whichever producer filled them */
  assert.deepEqual(Object.keys(A).sort(), Object.keys(C).sort());
  assert.equal(C.traceKind, 'CONVERSATION_TURN');
  assert.equal(A.traceKind, 'AGENT_RUN');
  /* and the fields an auditor asks for are populated on both */
  for (const t of [A, C]) {
    assert.ok(t.traceId && t.objective && t.actor.id);
    assert.ok(t.modelCalls.length > 0 && t.toolCalls.length > 0);
    assert.equal(typeof t.usage.latencyMs, 'number');
    assert.ok(!/"thinking"|"chainOfThought"/.test(JSON.stringify(t)), 'no raw reasoning in either');
  }
  /* a REFUSED tool is a recorded authorization decision; nothing is invented for the rest */
  assert.equal(C.authorizations.length, 1);
  assert.equal(C.authorizations[0]!.decision, 'DENY');
  /* what a turn genuinely does not have is empty, not faked */
  assert.equal(C.plan.revisions.length, 0);
  assert.equal(C.verification, null);
  assert.equal(C.approvals.length, 0);
});

/* ================================================================================================
   §10 — PLAN ECONOMY
   ================================================================================================ */
test('§10 — a revision that changes no work is recorded as a no-op, not counted as a replan', async () => {
  const { orch } = scripted({
    steps: (n) => (n === 1 ? step({ calls: [call('getCloseBlockers', { period: '2026-06' })] })
      : n === 2 ? step({ calls: [call('getCloseBlockers', { period: '2026-06' })] })  /* a duplicate: refused, so nothing is added */
        : step({ decision: 'SYNTHESIZE' })),
  });
  const r = orch.agents.start(me, 'Review the June close and tell me what is unresolved.');
  assert.ok(r.ok);
  const b = await until(orch, r.run.runId, me);
  assert.ok(b.waterfall.usefulReplans >= 1, 'the first step added real governed work');
  assert.ok(b.waterfall.noopReplans >= 1, 'the duplicate added none, and is recorded as churn');
  /* the duplicate was refused by Korvyn and the planner was told why */
  assert.ok(b.investigation!.rejected.some((x) => /already called/.test(x.why)));
});

/* ================================================================================================
   §8 — THE EXECUTION WATERFALL
   ================================================================================================ */
test('§8 — a run measures where its own time went', async () => {
  const { orch } = scripted();
  const r = orch.agents.start(me, 'Review the June close and tell me what is unresolved.');
  assert.ok(r.ok);
  const b = await until(orch, r.run.runId, me);
  const w = b.waterfall;
  for (const k of ['classifyMs', 'planMs', 'thinkMs', 'toolMs', 'synthesizeMs', 'verifyMs'] as const) assert.equal(typeof w[k], 'number', k);
  assert.ok(w.thinkMs >= 0 && w.toolMs > 0, 'tool time is measured at the call site');
});

/* ================================================================================================
   §15 — THE NON-CONVERSATIONAL ENTRY POINT
   ================================================================================================ */
test('§15 headless — a scheduler starts the same run, with the same authorization and the same trace', async () => {
  const { orch } = scripted();
  const svc = orch.agentService;
  const out = svc.start(me, { objective: 'Review the June close and tell me what is unresolved.', origin: 'SCHEDULE', externalRef: 'nightly-close-review' });
  assert.ok(out.ok, out.ok ? '' : out.reason);
  const b = await until(orch, out.runId, me);

  assert.equal(b.runStatus, 'COMPLETED', b.completionReason ?? '');
  assert.equal(b.goal.type, 'INVESTIGATE', 'the same generic runtime');
  assert.ok(b.events.some((e) => e.type === 'ORIGIN' && /SCHEDULE/.test(e.label)), 'where the run came from is recorded');
  assert.ok(b.trace.toolCalls.length > 0);
  /* the SAME trace and telemetry contract as a conversational run */
  const t = svc.trace(out.runId, me)!;
  assert.equal(t.traceKind, 'AGENT_RUN');
  assert.ok(t.authorizations.length > 0 && t.modelCalls.length > 0);
  assert.equal(svc.telemetry(out.runId, me)!.runId, out.runId);
  /* a scheduler that fires twice under the same handle gets the same run, not a second one */
  const again = svc.start(me, { objective: 'Review the June close and tell me what is unresolved.', origin: 'SCHEDULE', externalRef: 'nightly-close-review' });
  assert.ok(again.ok && again.runId === out.runId);
  /* and it is nobody else's run to read */
  assert.equal(svc.get(out.runId, mdh), null);
});

test('§15 headless — authority is the actor\'s, and a caller cannot ask for a profile the actor may not use', async () => {
  const { orch } = scripted();
  const out = orch.agentService.start(auditor, { objective: 'Prepare the drafts that would clear the June close.', origin: 'API', profile: 'CONTROLLER_REVIEW' });
  assert.ok(out.ok, out.ok ? '' : out.reason);
  const b = await until(orch, out.runId, auditor);
  assert.equal(b.goal.policyProfile, 'INVESTIGATION', 'capped to read-only: the auditor may not prepare work');
  assert.ok(b.warnings.some((w) => /may not prepare/.test(w)), 'and the run says so rather than doing less quietly');
  assert.equal(POLICY_PROFILES[b.goal.policyProfile].autonomy, 1);
  assert.equal(orch.agentService.start(me, { objective: 'June', origin: 'API' }).ok, false, 'an objective has to say what work to carry through');
});

/* ================================================================================================
   §14 — BUDGET POLICY
   ================================================================================================ */
test('§14 — a profile budget layers over the deployment ceiling, and the two meanings of an iteration stay apart', async () => {
  process.env['SLOANE_AGENT_MAX_TOOL_CALLS'] = '5';
  try {
    const { orch } = scripted();
    const r = orch.agents.start(me, 'Review the June close and tell me what is unresolved.', { profile: 'INVESTIGATION', outcome: 'ANALYZE' });
    assert.ok(r.ok);
    const b = await until(orch, r.run.runId, me);
    /* INVESTIGATION overrides no tool-call ceiling, so the deployment's own value still governs the inner loop */
    assert.equal(b.investigation!.budget.maxToolCalls, 5, 'an environment ceiling still bites');
    /* the OUTER budget counts STEPS, and takes its iteration ceiling from the profile's step limit, never from
       the inner loop's iteration budget */
    assert.equal(b.budget!.maxIterations, POLICY_PROFILES['INVESTIGATION'].maxSteps);
  } finally { delete process.env['SLOANE_AGENT_MAX_TOOL_CALLS']; }
});
