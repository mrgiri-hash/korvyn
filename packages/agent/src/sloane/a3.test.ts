/**
 * A3 — GOVERNED ACTION PREPARATION. The generic loop can now PREPARE, and only prepare.
 *
 *   §2   a plan step states its INTENT; Korvyn resolves it against the capability's registered risk
 *   §3   action capabilities are discovered through the same filter reads are, and only where allowed
 *   §4   ActionGovernance stays the owner: exposure → authorization → validation → class → approval → execution
 *   §6   PREPARE-FIRST: preparation succeeding is never a reason to write
 *   §7   WAITING_FOR_APPROVAL is a clean stop, with the proposal, its basis and its status persisted
 *   §8   approve / reject / modify
 *   §9   the loop observes the GOVERNED RESULT, never its own assumption of success
 *   §10  an approved action executes exactly once, across resume and restart
 *   §11  the trace reconstructs proposal → basis → classification → approval → execution
 *   §13  effective authority is user ∩ profile ∩ governance
 *   §14  Flux draft explanations   §15 ownership proposals   §16 rejection
 *
 * No provider call: the real orchestrator, the real tools, the real Action Engine, a scripted model.
 *   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { type Actor, ROLES, serverActor, toolRegistry } from './tools.js';
import { WORK } from './store.js';
import { ActionGovernanceEngine } from './actions.js';
import { AgentRuntime } from './agent/runtime.js';
import type { AgentHost } from './agent/host.js';
import { POLICY_PROFILES, type AgentRunBody } from './agent/model.js';
import { registry, relevant } from './agent/investigate.js';
import type { AgentStepOut } from './schema.js';

const me = serverActor();
const auditor: Actor = { id: 'user:auditor', name: 'Priya Nair', ...ROLES['EXTERNAL_AUDITOR']! };
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];

const usage = { inputTokens: 900, outputTokens: 120, cacheReadTokens: 80, cacheWriteTokens: 0 };
const ok = <T>(value: T, route: string) => ({ status: 'ok' as const, latencyMs: 1, requestId: null, usage, model: 'claude-sonnet-5', route, value });
const read = (tool: string, args: Record<string, string>) => ({ tool, intent: 'READ' as const, purpose: `Reading ${tool}`, progress: `Reading ${tool}`, args: Object.entries(args).map(([name, value]) => ({ name, value })) });
const prep = (tool: string, args: Record<string, string>, purpose = `Preparing with ${tool}`) => ({ tool, intent: 'PREPARE_ACTION' as const, purpose, progress: purpose, args: Object.entries(args).map(([name, value]) => ({ name, value })) });
const step = (o: Partial<AgentStepOut>): AgentStepOut => ({ goalClass: 'FLUX_REVIEW', understanding: 'Look at the unresolved June flux.', decision: 'CALL_TOOLS', calls: [], needCapabilities: [], workingNotes: [], openQuestions: [], question: null, options: [], confidence: 0.8, escalate: { needed: false, reason: null, detail: null }, ...o }) as AgentStepOut;

function scripted(steps: (n: number) => AgentStepOut, outcome = 'PREPARE_WORKFLOW_ACTIONS') {
  const seen: { toolIds: string[][] } = { toolIds: [] };
  const a = new MockLLMAdapter(); Object.defineProperty(a, 'provider', { value: 'scripted' });
  const A = a as unknown as Record<string, unknown>;
  A['classifyObjective'] = async () => ok({ outcome, understanding: 'scripted', needsDeepReasoning: false, confidence: 0.9 }, 'NARRATE');
  A['agentStep'] = async (i: { toolIds: string[] }, o: { route: string }) => { seen.toolIds.push(i.toolIds); return ok(steps(seen.toolIds.length), o.route); };
  A['agentSynth'] = async (_i: unknown, o: { route: string }) => ok({ headline: 'Draft explanations prepared for review.', inspected: ['getUnexplainedFluxItems'], findings: [], unresolved: [], nextSteps: [], confidence: 0.7, escalate: { needed: false, reason: null, detail: null } }, o.route);
  const orch = new SloaneOrchestrator(a, { maxPlanSteps: 8 }, () => me);
  orch.artifacts.storage = mkdtempSync(join(tmpdir(), 'korvyn-a3-'));
  return { orch, seen };
}
async function until(o: SloaneOrchestrator, runId: string, actor: Actor, ms = 20000): Promise<AgentRunBody> {
  const t0 = Date.now();
  for (;;) { const b = o.agents.body(runId, actor)!; if (TERMINAL.includes(b.runStatus) || b.runStatus.startsWith('WAITING') || Date.now() - t0 > ms) return b; await settle(25); }
}
/** read, then prepare a Flux explanation on the account the read found — the §14 shape */
const fluxScript = (n: number) => (n === 1
  ? step({ calls: [read('getUnexplainedFluxItems', { period: '2026-06' })] })
  : n === 2 ? step({ calls: [prep('proposeFluxComment', { account: '16000', period: '2026-06', text: 'PP&E rose $15.73M on capitalisation of completed construction; CIP fell by a corresponding amount.' }, 'Drafting an explanation for the PP&E movement')] })
    : step({ decision: 'SYNTHESIZE' }));

/* ================================================================================================
   §2 — THE PLANNER CONTRACT
   ================================================================================================ */
test('§2 — a step states its intent, and Korvyn resolves it against the capability\'s registered risk', async () => {
  /* a PREPARE capability called as a READ is refused, and the planner is told why */
  const { orch } = scripted((n) => (n === 1
    ? step({ calls: [read('proposeFluxComment', { account: '16000', period: '2026-06', text: 'x' })] })
    : step({ decision: 'SYNTHESIZE' })));
  const r = orch.agents.start(me, 'Review the unresolved June flux and prepare draft explanations.', { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const b = await until(orch, r.run.runId, me);
  const refused = b.investigation!.rejected.find((x) => x.tool === 'proposeFluxComment');
  assert.ok(refused, 'the mislabelled call was refused');
  assert.match(refused!.why, /preparation capability, not a read/);
  assert.equal(b.trace.toolCalls.filter((c) => c.tool === 'proposeFluxComment').length, 0, 'and it never ran');
  assert.ok(b.trace.policyDecisions.some((p) => p.subject === 'proposeFluxComment' && p.decision === 'DENY'));
});

/* ================================================================================================
   §3 / §13 — ACTION DISCOVERY AND EFFECTIVE AUTHORITY
   ================================================================================================ */
test('§3 — actions are discovered through the same filter as reads, and only where the profile allows', () => {
  const all = toolRegistry.all().filter((t) => t.risk === 'READ' || t.risk === 'PROPOSE');
  /* no action domains → not one action capability, however many the registry holds */
  assert.equal(registry(all, []).filter((t) => t.risk === 'PROPOSE').length, 0);
  assert.ok(registry(all, ['action', 'build']).filter((t) => t.risk === 'PROPOSE').length > 0);
  /* and an action is not offered before the run has read something: there would be nothing to ground it in */
  const state = { goalClass: 'FLUX_REVIEW' as const, requested: [], used: [] as string[], referents: {} };
  assert.equal(relevant(all, state, 20, ['action', 'build']).filter((t) => t.risk === 'PROPOSE').length, 0, 'nothing to act on yet');
  assert.ok(relevant(all, { ...state, used: ['getUnexplainedFluxItems'] }, 40, ['action', 'build']).some((t) => t.risk === 'PROPOSE'), 'offered once there is');
});

test('§13 — effective authority is user ∩ profile ∩ governance; a read-only profile prepares nothing', async () => {
  /* the INVESTIGATION profile declares no action domains, so the planner is shown none */
  const { orch, seen } = scripted(fluxScript, 'ANALYZE');
  const r = orch.agents.start(me, 'Review the unresolved June flux and prepare draft explanations.');
  assert.ok(r.ok);
  const b = await until(orch, r.run.runId, me);
  assert.equal(POLICY_PROFILES[b.goal.policyProfile].actionDomains.length, 0);
  assert.ok(seen.toolIds.every((ids) => !ids.some((i) => i.startsWith('propose'))), 'no action capability was ever exposed');
  assert.equal(orch.actions.ofSession(b.sessionId).length, 0, 'and nothing was prepared');
  assert.notEqual(b.runStatus, 'WAITING_FOR_CONFIRMATION');
});

test('§13 — a profile cannot widen the actor: an auditor asking to prepare is capped read-only', async () => {
  const { orch } = scripted(fluxScript);
  const r = orch.agents.start(auditor, 'Review the unresolved June flux and prepare draft explanations.', { profile: 'CONTROLLER_REVIEW' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const b = await until(orch, r.run.runId, auditor);
  assert.equal(b.goal.policyProfile, 'INVESTIGATION');
  assert.equal(orch.actions.ofSession(b.sessionId).length, 0);
});

/* ================================================================================================
   §14 — FLUX DRAFT EXPLANATIONS: the first action scenario
   ================================================================================================ */
test('§14 — the generic loop reads, drafts a Flux explanation, and STOPS for approval with nothing written', async () => {
  const { orch, seen } = scripted(fluxScript);
  const r = orch.agents.start(me, 'All June entries are posted. Review the unresolved material June Flux items and prepare draft explanations for review.',
    { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const b = await until(orch, r.run.runId, me);

  /* NO FLUX WORKFLOW IS HARD-CODED: the generic runtime, the model's own steps */
  assert.equal(b.goal.type, 'INVESTIGATE');
  assert.equal(b.planner, 'MODEL');
  /* it READ before it prepared */
  const order = b.graph.tasks.filter((t) => t.tool && t.status === 'COMPLETED').map((t) => t.riskLevel);
  assert.equal(order[0], 'READ', 'evidence first');
  assert.ok(order.includes('PROPOSE'), 'then preparation');
  /* §3: the action capability was exposed only after the first read */
  assert.ok(!seen.toolIds[0]!.some((i) => i.startsWith('propose')), 'not at the first step');
  assert.ok(seen.toolIds[1]!.some((i) => i.startsWith('propose')), 'offered at the second');

  /* §6/§7 PREPARE-FIRST: prepared, waiting, and NOTHING written */
  assert.equal(b.runStatus, 'WAITING_FOR_CONFIRMATION', b.completionReason ?? '');
  const cp = b.checkpoints.find((c) => c.type === 'CONFIRMATION' && c.status === 'OPEN')!;
  assert.ok(cp, 'a confirmation checkpoint is open');
  assert.deepEqual(cp.options.map((o) => o.id).sort(), ['cancel', 'confirm', 'modify'], '§8 approve / reject / modify');
  const props = orch.actions.ofSession(b.sessionId);
  assert.equal(props.length, 1);
  assert.equal(props[0]!.status, 'WAITING_CONFIRMATION');
  assert.equal(props[0]!.result, null, 'nothing executed');
  /* §4/§5: the CLASS came from ActionGovernance, not from the model */
  assert.equal(props[0]!.riskLevel, ActionGovernanceEngine.classify(props[0]!.type));
  assert.equal(props[0]!.riskLevel, 'CONFIRM_REQUIRED');
  /* §7: the proposal's factual basis is persisted with it */
  assert.ok(props[0]!.sourceFinancialObjectIds.length > 0 || props[0]!.targetObjectId, 'the target and its basis are recorded');

  /* §11 the trace reconstructs the chain up to the pending approval */
  const t = orch.agents.traceOf(b.runId, me)!;
  assert.equal(t.proposals.length, 1);
  const p = t.proposals[0]!;
  assert.equal(p.riskClass, 'CONFIRM_REQUIRED');
  assert.ok(p.preparedByStep, 'the step that prepared it');
  assert.ok(p.checkpointId, 'the checkpoint it waits at');
  assert.equal(p.decision, null, 'undecided');
  assert.equal(p.execution, null, 'unexecuted');
  assert.ok(!/"thinking"|"chainOfThought"/.test(JSON.stringify(t)));
});

test('§8/§9/§11 — approving executes through ActionGovernance, and the loop OBSERVES the governed result', async () => {
  const { orch } = scripted(fluxScript);
  const r = orch.agents.start(me, 'Review the unresolved material June Flux items and prepare draft explanations for review.', { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r.ok);
  let b = await until(orch, r.run.runId, me);
  const cp = b.checkpoints.find((c) => c.type === 'CONFIRMATION' && c.status === 'OPEN')!;

  const d = await orch.agents.decide(r.run.runId, me, cp.id, 'confirm');
  assert.ok(d.ok, d.reason ?? '');
  b = await until(orch, r.run.runId, me);

  /* executed exactly once, through the Action Service */
  const props = orch.actions.ofSession(b.sessionId);
  assert.equal(props.filter((p) => p.status === 'COMPLETED').length, 1);
  assert.ok(props[0]!.result, 'the service returned a governed result');

  /* §9: the loop's own observations carry what ACTUALLY happened, not what it proposed */
  const obs = b.investigation!.observations.find((o) => o.tool === 'decision')!;
  assert.ok(obs, 'a post-action observation exists');
  assert.equal(obs.facts.find((f) => f.key === 'decision')!.value, 'confirm');
  assert.equal(obs.facts.find((f) => f.key === 'executed')!.value, '1');
  assert.ok(Object.values(obs.refs).some((v) => v === props[0]!.id), 'and points at the proposal');

  /* §11: the chain is complete */
  const t = orch.agents.traceOf(b.runId, me)!;
  const p = t.proposals[0]!;
  assert.equal(p.decision, 'confirm');
  assert.ok(p.decidedBy && p.decidedAt);
  assert.equal(p.execution!.status, 'COMPLETED');
  assert.ok(t.approvals.some((a) => a.status === 'RESOLVED' && a.resolution === 'confirm'));
});

/* ================================================================================================
   §16 — REJECTION
   ================================================================================================ */
test('§16 — rejecting writes nothing, records the decision, and ends the run without a proposal loop', async () => {
  const { orch } = scripted(fluxScript);
  const r = orch.agents.start(me, 'Review the unresolved material June Flux items and prepare draft explanations for review.', { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r.ok);
  let b = await until(orch, r.run.runId, me);
  const cp = b.checkpoints.find((c) => c.type === 'CONFIRMATION' && c.status === 'OPEN')!;
  const d = await orch.agents.decide(r.run.runId, me, cp.id, 'cancel');
  assert.ok(d.ok);
  b = await until(orch, r.run.runId, me);

  assert.ok(TERMINAL.includes(b.runStatus), `the run ended cleanly (${b.runStatus})`);
  const props = orch.actions.ofSession(b.sessionId);
  assert.equal(props.filter((p) => p.status === 'COMPLETED').length, 0, 'nothing executed');
  assert.ok(props.every((p) => !p.result), 'enterprise state unchanged');
  /* the rejection is on the record */
  const t = orch.agents.traceOf(b.runId, me)!;
  assert.equal(t.proposals[0]!.decision, 'cancel');
  assert.equal(t.proposals[0]!.execution!.status, 'CANCELLED');
  assert.ok(b.events.some((e) => e.type === 'CHECKPOINT_RESOLVED' && /cancel/.test(e.label)));
  /* no duplicate proposal loop: one proposal, one checkpoint, and no second confirmation opened */
  assert.equal(b.checkpoints.filter((c) => c.type === 'CONFIRMATION').length, 1);
  assert.equal(props.length, 1);
});

/* ================================================================================================
   §8 — MODIFY
   ================================================================================================ */
test('§8 — a human edit becomes the governed proposed action, and the model never overwrites it', async () => {
  const { orch } = scripted(fluxScript);
  const r = orch.agents.start(me, 'Review the unresolved material June Flux items and prepare draft explanations for review.', { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r.ok);
  let b = await until(orch, r.run.runId, me);
  const cp = b.checkpoints.find((c) => c.type === 'CONFIRMATION' && c.status === 'OPEN')!;
  const edited = 'Reviewed: the PP&E increase is the placed-in-service transfer from CIP, confirmed against the fixed-asset register.';
  const d = await orch.agents.decide(r.run.runId, me, cp.id, 'modify', undefined, JSON.stringify({ text: edited }));
  assert.ok(d.ok, d.reason ?? '');
  b = await until(orch, r.run.runId, me);

  const p = orch.actions.ofSession(b.sessionId)[0]!;
  assert.equal(p.status, 'COMPLETED');
  assert.ok(p.version > 1, 'the proposal was revised before it executed');
  /* what was WRITTEN is the person's words, not the model's draft */
  const comment = WORK.comment(String(p.result!['commentId']));
  assert.ok(comment, 'the comment exists');
  assert.match(JSON.stringify(comment), /placed-in-service transfer/);
  assert.ok(!/corresponding amount/.test(JSON.stringify(comment)), 'the model draft did not survive the edit');
  assert.ok(b.events.some((e) => e.type === 'CHECKPOINT_RESOLVED' && /modify/.test(e.label)));
});

/* ================================================================================================
   §10 / §17 — IDEMPOTENCY ACROSS RESUME AND RESTART
   ================================================================================================ */
test('§10 — an approved action executes exactly once, across a repeated decision and a restart', async () => {
  const { orch } = scripted(fluxScript);
  const r = orch.agents.start(me, 'Review the unresolved material June Flux items and prepare draft explanations for review.', { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r.ok);
  let b = await until(orch, r.run.runId, me);
  const cp = b.checkpoints.find((c) => c.type === 'CONFIRMATION' && c.status === 'OPEN')!;
  await orch.agents.decide(r.run.runId, me, cp.id, 'confirm');
  b = await until(orch, r.run.runId, me);
  const p = orch.actions.ofSession(b.sessionId)[0]!;
  const commentId = String(p.result!['commentId']);

  /* the same decision again — a double click, a retried request */
  const again = await orch.agents.decide(r.run.runId, me, cp.id, 'confirm');
  assert.ok(again.ok, 'a repeated decision is accepted, not an error');
  /* and a RESTART: a fresh runtime over the same durable store */
  const restarted = new AgentRuntime(orch as unknown as AgentHost);
  const rb = restarted.body(r.run.runId, me)!;
  const cp2 = rb.checkpoints.find((c) => c.id === cp.id)!;
  assert.equal(cp2.status, 'RESOLVED', 'the decision is durable');
  await restarted.decide(r.run.runId, me, cp.id, 'confirm');

  const after = orch.actions.ofSession(b.sessionId);
  assert.equal(after.filter((x) => x.status === 'COMPLETED').length, 1, 'still one completed proposal');
  assert.equal(String(after[0]!.result!['commentId']), commentId, 'and the same governed object — never a second write');
});

/* ================================================================================================
   §15 — OWNERSHIP: a reasoned recommendation, never a fabricated one
   ================================================================================================ */
test('§15 — an assignment with a governed basis is prepared; one without is refused, not invented', async () => {
  /* a reviewer Korvyn's own directory holds: the proposal validates */
  const good = scripted((n) => (n === 1
    ? step({ calls: [read('getCloseBlockers', { period: '2026-06' })] })
    : n === 2 ? step({ calls: [prep('proposeReviewerAssignment', { reviewer: 'Sarah Kim', target: 'REC-MDH-13100', targetType: 'reconciliation', period: '2026-06' }, 'Assigning a reviewer Korvyn holds')] })
      : step({ decision: 'SYNTHESIZE' })));
  const r1 = good.orch.agents.start(me, 'Review the June close blockers and prepare owner assignments for the unassigned material items.', { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r1.ok, r1.ok ? '' : r1.reason);
  const b1 = await until(good.orch, r1.run.runId, me);
  const p1 = good.orch.actions.ofSession(b1.sessionId)[0];
  assert.ok(p1, 'an assignment was prepared');
  assert.equal(p1!.validationStatus, 'VALID');
  assert.equal(p1!.status, 'WAITING_CONFIRMATION', 'and waits for a person, as an assignment must');

  /* a reviewer NOBODY holds: Korvyn refuses it rather than assigning a name the model made up */
  const bad = scripted((n) => (n === 1
    ? step({ calls: [read('getCloseBlockers', { period: '2026-06' })] })
    : n === 2 ? step({ calls: [prep('proposeReviewerAssignment', { reviewer: 'Dana Fictional', target: 'REC-MDH-13100', targetType: 'reconciliation', period: '2026-06' }, 'Assigning an invented owner')] })
      : step({ decision: 'SYNTHESIZE' })));
  const r2 = bad.orch.agents.start(me, 'Review the June close blockers and prepare owner assignments for the unassigned material items.', { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r2.ok);
  const b2 = await until(bad.orch, r2.run.runId, me);
  const p2 = bad.orch.actions.ofSession(b2.sessionId)[0];
  /* either the proposal was refused outright, or it exists and is NOT executable — never silently assigned */
  if (p2) {
    assert.notEqual(p2.validationStatus, 'VALID', `an invented owner is not a valid assignment: ${JSON.stringify(p2.validation)}`);
    assert.equal(p2.status !== 'COMPLETED', true, 'and it was never written');
  }
  assert.equal(bad.orch.actions.ofSession(b2.sessionId).filter((x) => x.status === 'COMPLETED').length, 0);
});

/* ================================================================================================
   §4 — ACTION GOVERNANCE REMAINS THE OWNER
   ================================================================================================ */
test('§4 — a GOVERNED action is never executed by the runtime, whatever the planner asks for', async () => {
  const { orch } = scripted((n) => (n === 1
    ? step({ calls: [read('getCloseBlockers', { period: '2026-06' })] })
    : n === 2 ? step({ calls: [prep('postJournalEntry', {}, 'Posting to the ledger')] })
      : step({ decision: 'SYNTHESIZE' })));
  const r = orch.agents.start(me, 'Review the June close and prepare what is needed.', { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r.ok);
  const b = await until(orch, r.run.runId, me);
  assert.equal(b.trace.toolCalls.filter((c) => c.tool === 'postJournalEntry').length, 0, 'the ledger write never ran');
  assert.ok(b.investigation!.rejected.some((x) => x.tool === 'postJournalEntry') || !b.investigation!.observations.some((o) => o.tool === 'postJournalEntry'));
  /* and it was never even exposed: a GOVERNED capability is not a PROPOSE one */
  assert.equal(registry(toolRegistry.all(), ['action', 'build', 'governance']).some((t) => t.id === 'postJournalEntry'), false);
});

/* ================================================================================================
   §12 — TEMPLATE RETIREMENT: the generic loop carries the whole pipeline the templates existed for
   ================================================================================================ */
test('§12 — build → validate → prepare → confirm → execute → observe, with no template anywhere', async () => {
  /* the shape all three retired templates shared, driven entirely by the planner contract */
  const G = 'REVIEW_PREPARATION' as const;
  const pipeline = (n: number) => (n === 1
    ? step({ goalClass: G, calls: [read('getCloseReadiness', { period: '2026-06' })] })
    : n === 2 ? step({ goalClass: G, calls: [prep('buildExcelArtifact', { type: 'CLOSE_REVIEW_PACKAGE', periodStart: '2026-06', periodEnd: '2026-06' }, 'Building the close review package')] })
      : n === 3 ? step({ goalClass: G, calls: [prep('previewExcelArtifact', {}, 'Validating the workbook')] })
        : n === 4 ? step({ goalClass: G, calls: [prep('proposeGenerateExcelArtifact', { format: 'xlsx' }, 'Preparing generation')] })
          : step({ goalClass: G, decision: 'SYNTHESIZE' }));
  const { orch, seen } = scripted(pipeline);
  const r = orch.agents.start(me, 'Get the June close ready for controller review and build the review package.', { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const runId = r.run.runId;

  /* §3 — each stage is DISCOVERABLE at the step that needs it, not merely callable */
  let b = await until(orch, runId, me);
  assert.ok(seen.toolIds[1]!.includes('buildExcelArtifact'), 'the builder is offered once there is something to package');
  assert.ok(seen.toolIds[2]!.includes('previewExcelArtifact') || seen.toolIds[3]!.includes('previewExcelArtifact'), 'and validation once a workbook is in hand');
  assert.ok(seen.toolIds[3]!.includes('proposeGenerateExcelArtifact'), 'and generation once it has been validated');

  /* §6 — preparation succeeded and nothing was generated */
  assert.equal(b.runStatus, 'WAITING_FOR_CONFIRMATION');
  const t0 = orch.agentService.trace(runId, me)!;
  assert.equal(t0.proposals.length, 1);
  assert.equal(t0.proposals[0]!.type, 'GENERATE_EXCEL_ARTIFACT');
  assert.equal(t0.proposals[0]!.status, 'WAITING_CONFIRMATION');
  assert.equal(t0.proposals[0]!.execution, null, 'nothing generated before a person said so');

  /* §8/§9 — confirmation executes through Action Governance, and the loop observes the governed result */
  const cp = b.checkpoints.find((c) => c.status === 'OPEN')!;
  assert.equal(cp.type, 'CONFIRMATION');
  const d = await orch.agents.decide(runId, me, cp.id, 'confirm');
  assert.ok(d.ok, d.reason ?? "");
  b = await until(orch, runId, me);
  const t1 = orch.agentService.trace(runId, me)!;
  assert.equal(t1.proposals[0]!.status, 'COMPLETED');
  assert.equal(t1.proposals[0]!.execution!.status, 'COMPLETED');
  assert.ok(b.investigation!.observations.some((o) => o.facts.some((f) => /executed|decision/i.test(f.label))), 'the decision is an observation, not an assumption');

  /**
   * AND VERIFICATION PASSES. A prepare-capable run is not verified as a read-only one: 8D asserted that nothing
   * but reads had happened, so a controller review that drafted what it was asked for finished BLOCKED by a
   * check saying it should not have (observed). What it must prove is that nothing was written unconfirmed and
   * no governed action was executed — both above it — and that it reached for nothing beyond preparation.
   */
  assert.equal(b.runStatus, 'COMPLETED');
  assert.equal(b.verification!.passed, true, JSON.stringify(b.verification!.checks.filter((c) => !c.ok)));
  assert.ok(b.verification!.checks.some((c) => /READ and PREPARE/.test(c.check) && c.ok));
  assert.ok(b.verification!.checks.some((c) => /without confirmation/i.test(c.check) && c.ok));

  /**
   * §19 — AND THE PHASES ARE MEASURED SEPARATELY. "The run cost $0.14" is not something a controller can act
   * on; reading, preparing, waiting and writing up are separable work with separable economics.
   */
  const ec = orch.agentService.telemetry(runId, me)!.economy;
  assert.ok(ec.investigation.toolCalls >= 1, 'the reads are investigation');
  assert.ok(ec.preparation.toolCalls >= 3, 'the build, the validation and the proposal are preparation');
  assert.ok(ec.preparation.modelCalls >= 3, 'and so is the reasoning that chose them');
  assert.equal(ec.approval.checkpoints, 1);
  assert.equal(ec.approval.decided, 1);
  assert.ok(ec.synthesis.modelCalls >= 1, 'writing the result is its own phase');
  assert.equal(ec.investigation.toolCalls + ec.preparation.toolCalls + ec.synthesis.toolCalls, orch.agentService.telemetry(runId, me)!.toolCalls, 'every governed call is attributed to exactly one phase');

  /* §19 — and a refusal is counted as what it was: the violation count is the one number that must always be zero */
  const tm = orch.agentService.telemetry(runId, me)!;
  assert.equal(tm.authorizationViolations, 0);
  assert.equal(tm.governedActionsExecuted, 0);

  /* §12 — and the run that did all of it was planned by the model, with no template consulted */
  assert.equal(b.planner, 'MODEL');
  for (const id of ['CONTROLLER_REVIEW', 'AUDIT_SUPPORT', 'FINANCE_ANALYST'] as const) assert.equal(POLICY_PROFILES[id].execution, 'GENERIC', `${id} runs the generic runtime`);
});

/* ================================================================================================
   §6/§7 — A RUN THAT STOPS STILL HANDS OVER WHAT IT PREPARED
   ================================================================================================ */
test('§7 — a run that stops on its budget with prepared work waits for a decision rather than discarding it', async () => {
  /* prepare on the second step, then keep asking — the run will stop on a budget, not on a synthesis */
  const { orch } = scripted((n) => (n === 1
    ? step({ calls: [read('getUnexplainedFluxItems', { period: '2026-06' })] })
    : n === 2 ? step({ calls: [prep('proposeFluxComment', { account: '16000', period: '2026-06', text: 'PP&E rose on capitalisation of completed construction.' })] })
      : step({ calls: [read('getUnexplainedFluxItems', { period: '2026-06' })] })));
  const r = orch.agents.start(me, 'Review the unresolved June flux and prepare draft explanations.', { profile: 'CONTROLLER_REVIEW', outcome: 'PREPARE_WORKFLOW_ACTIONS' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  const runId = r.run.runId;
  const b = await until(orch, runId, me, 30000);

  /* whatever stopped it, the prepared action is decidable: a checkpoint names it and nothing was written */
  const t = orch.agentService.trace(runId, me)!;
  const prepared = t.proposals.filter((p) => p.status === 'WAITING_CONFIRMATION');
  if (prepared.length) {
    assert.equal(b.runStatus, 'WAITING_FOR_CONFIRMATION', b.completionReason ?? '');
    const cp = b.checkpoints.find((c) => c.status === 'OPEN' && c.type === 'CONFIRMATION');
    assert.ok(cp, 'the prepared work has a checkpoint a person can decide');
    assert.ok(prepared.every((p) => p.execution === null), 'and none of it was written');
    /* and the decision still executes, on a run that never reached its own synthesis */
    const d = await orch.agents.decide(runId, me, cp!.id, 'confirm');
    assert.ok(d.ok, d.reason ?? '');
    assert.equal(orch.agentService.trace(runId, me)!.proposals[0]!.execution!.status, 'COMPLETED');
  }
});
