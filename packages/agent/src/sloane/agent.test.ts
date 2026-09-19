/**
 * Phase 7 — the governed agent runtime. No provider call: the real orchestrator, the real tools, the real Action Engine.
 *   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { type Actor, ROLES } from './tools.js';
import { WORK } from './store.js';
import { AgentRuntime, type RunView } from './agent/runtime.js';
import { detectGoalType } from './agent/goals.js';

const reviewer: Actor = { id: 'user:mgiri', name: 'Mitra Giri', ...ROLES['FINANCE_REVIEWER']! };
const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => reviewer);
orch.artifacts.storage = mkdtempSync(join(tmpdir(), 'korvyn-agent-'));
const A = orch.agents;
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
async function run(text: string, opts: Parameters<AgentRuntime['start']>[2] = {}, who: Actor = reviewer) {
  const r = A.start(who, text, opts);
  assert.ok(r.ok, r.ok ? '' : r.reason);
  await A.wait(r.run.runId, 30000); await settle();
  return r.run.runId;
}
const view = (id: string, who: Actor = reviewer) => A.get(id, who)!;
const cpOf = (v: RunView, type: string) => v.checkpoints.find((c) => c.type === type && c.status === 'OPEN');
async function decide(id: string, cp: string, d: string) { const o = await A.decide(id, reviewer, cp, d); assert.ok(o.ok, o.reason ?? ''); await A.wait(id, 30000); await settle(60); }

test('goal detection is conservative: questions stay questions; packages are deliverables', () => {
  assert.equal(detectGoalType('Review the June close.'), 'REVIEW_CLOSE');
  assert.equal(detectGoalType('Prepare the controller review for June'), 'PREPARE_CONTROLLER_REVIEW');
  assert.equal(detectGoalType('Investigate Siemens Energy for FY26'), 'INVESTIGATE_VENDOR');
  assert.equal(detectGoalType('Prepare the audit support package for CIP'), 'PREPARE_AUDIT_SUPPORT');
  assert.equal(detectGoalType('Prepare a close review package for June'), 'BUILD_FINANCIAL_ARTIFACT');
  assert.equal(detectGoalType('Why did CIP increase in June?'), null);
  assert.equal(detectGoalType('What is blocking June close?'), null);
  assert.equal(detectGoalType('Build me the FY26 GL'), null);
});

test('§39 A — close review is read-only, verified, and discloses what limits it', async () => {
  const id = await run('Review the June close.');
  const v = view(id);
  assert.equal(v.status, 'COMPLETED', v.completionReason ?? '');
  assert.equal(v.profile, 'Read only');
  assert.ok(v.verification!.passed);
  assert.ok(v.verification!.checks.some((c) => c.check === 'Read-only goal wrote nothing' && c.ok));
  assert.equal(A.body(id, reviewer)!.graph.tasks.flatMap((t) => t.proposalIds).length, 0, 'no proposal was created');
  assert.match(v.result!.headline, /Jun 2026 close is \d+% ready with \d+ blockers/);
  assert.ok(v.result!.external.some((x) => /bank statement source is not connected/.test(x)));
  assert.ok(v.progress.every((p) => !/\{|RUN-|FO-|\$task/.test(p.line)), 'progress never shows ids or JSON');
  const body = A.body(id, reviewer)!;
  assert.ok(body.trace.toolCalls.length >= 6 && body.trace.policyDecisions.some((p) => p.subject === 'profile:READ_ONLY'));
  assert.ok(WORK.repos.audit.list({ investigationId: v.investigationId }).some((e) => e.action === 'AGENT_RUN_STARTED'));
});

test('§40 B — controller review: drafts prepared, confirmation requested, nothing written until confirmed', async () => {
  const id = await run('Prepare the controller review for June.');
  let v = view(id);
  assert.equal(v.status, 'WAITING_FOR_CONFIRMATION');
  const cp = cpOf(v, 'CONFIRMATION')!;
  assert.ok(cp.proposals.length >= 3 && cp.proposals.every((p) => p.status === 'WAITING_CONFIRMATION'));
  const before = cp.proposals.map((p) => orch.actions.view(p.id)!.result);
  assert.ok(before.every((r) => !r), 'nothing executed before confirmation');
  await decide(id, cp.id, 'confirm');
  v = view(id);
  assert.equal(v.status, 'COMPLETED', v.completionReason ?? '');
  assert.ok(v.verification!.checks.find((c) => c.check === 'Confirmed comments are in Korvyn')!.ok);
  assert.ok(v.verification!.checks.find((c) => c.check === 'Nothing written without confirmation')!.ok);
  const written = orch.actions.ofSession(v.sessionId).filter((p) => p.status === 'COMPLETED');
  assert.equal(written.length, cp.proposals.length);
  assert.ok(written.every((p) => WORK.comment(String(p.result!['commentId']))));
});

test('§41 C — "Only South Valley." mid-run: scope updated, invalidated steps re-run, valid work retained, revision recorded', async () => {
  const r = A.start(reviewer, 'Investigate ABB spend for FY26', { options: { pace: 120 } });
  assert.ok(r.ok);
  await settle(200);
  const iv = A.intervene(r.run.runId, reviewer, 'Only South Valley.');
  assert.ok(iv.recognised && /Scope changed to South Valley/.test(iv.effect), iv.effect);
  await A.wait(r.run.runId, 30000); for (let i = 0; i < 60 && view(r.run.runId).status !== 'COMPLETED'; i++) await settle(100);
  const v = view(r.run.runId), b = A.body(r.run.runId, reviewer)!;
  assert.equal(v.status, 'COMPLETED', v.completionReason ?? '');
  assert.equal(b.goal.subject.project, 'SV-PH2');
  const rev = b.graph.revisions.find((x) => x.source === 'REPLAN')!;
  assert.ok(rev && rev.invalidated.length >= 1 && rev.added.length >= rev.invalidated.length);
  assert.ok(b.graph.tasks.filter((t) => t.invalidatedBy).every((t) => t.status === 'SKIPPED' || t.status === 'COMPLETED'), 'old tasks kept, never overwritten');
  const live = b.graph.tasks.filter((t) => !t.invalidatedBy && t.tool && t.scopeSensitive);
  assert.ok(live.every((t) => t.args['project'] === 'SV-PH2' || t.refs['populationId']), 'replacements are scoped');
  assert.ok(b.graph.tasks.some((t) => t.taskId === 'by-project' && !t.invalidatedBy && t.status === 'COMPLETED'), 'the unaffected step is retained');
  assert.ok(v.verification!.passed && /South Valley/.test(v.result!.headline));
  assert.equal(b.interventions[0]!.kind, 'SCOPE_CHANGE');
});

test('§42 D — JD Edwards unavailable: the run continues, the blocked portion is stated, no JDE finding is invented', async () => {
  const id = await run('Investigate Siemens Energy for FY26');
  const v = view(id);
  assert.equal(v.status, 'COMPLETED');
  const ext = cpOf(v, 'EXTERNAL_DEPENDENCY')!;
  assert.ok(ext && !ext.blocking && /JD Edwards/.test(ext.title));
  assert.ok(v.result!.external.some((x) => /\$1\.37M .* JD Edwards, which is unavailable/.test(x)));
  assert.ok(!v.result!.findings.some((f) => f.kind !== 'EXTERNAL_DEPENDENCY' && /JD Edwards/.test(f.text) && !/stale/.test(f.text)));
});

test('§43 E — approving a reconciliation: evidence-checked, prepared, routed to a governed approver, never executed', async () => {
  const id = await run('Prepare the controller review for June and approve the reconciliations that are ready');
  let v = view(id);
  const conf = cpOf(v, 'CONFIRMATION')!;
  await decide(id, conf.id, 'cancel');
  v = view(id);
  assert.equal(v.status, 'WAITING_FOR_GOVERNED_APPROVAL');
  const g = cpOf(v, 'GOVERNED_APPROVAL')!;
  assert.equal(g.proposals.length, 1);
  assert.equal(g.proposals[0]!.riskLevel, 'GOVERNED_ACTION');
  assert.ok(v.progress.some((p) => /Intercompany receivable .* not ready for approval: tie status is not tied/.test(p.line)), 'the untied reconciliation is not prepared');
  await decide(id, g.id, 'route');
  v = view(id);
  assert.equal(v.status, 'COMPLETED', v.completionReason ?? '');
  assert.ok(v.verification!.checks.find((c) => c.check === 'No governed action executed')!.ok);
  assert.notEqual(orch.actions.view(g.proposals[0]!.id)!.status, 'COMPLETED');
});

test('§44 F — audit support: generated only after confirmation, verified (tabs, population pin, tie-out) before COMPLETED', async () => {
  const id = await run('Prepare the audit support package for CIP');
  let v = view(id);
  assert.equal(v.status, 'WAITING_FOR_CONFIRMATION');
  await decide(id, cpOf(v, 'CONFIRMATION')!.id, 'confirm');
  for (let i = 0; i < 100 && view(id).status === 'RUNNING'; i++) await settle(100);
  v = view(id);
  assert.equal(v.status, 'COMPLETED', v.completionReason ?? '');
  const ck = Object.fromEntries(v.verification!.checks.map((c) => [c.check, c]));
  for (const k of ['Workbook generated', 'File exists in storage', 'Expected tabs present', 'Population pinned (id and version)', 'Tie-out status recorded', 'Not stale at completion']) assert.ok(ck[k]?.ok, `${k}: ${ck[k]?.detail}`);
  assert.match(ck['Tie-out status recorded']!.detail, /PARTIALLY VALIDATED .* not labelled audit-ready/);
});

test('policy profiles: chosen by Korvyn, not by the words; a read-only profile cannot prepare anything', async () => {
  const id = await run('Review the June close as a controller and approve everything');
  const b = A.body(id, reviewer)!;
  assert.equal(b.goal.policyProfile, 'READ_ONLY');
  assert.equal(orch.actions.ofSession(b.sessionId).length, 0);
});

test('stop, retry and failure: a transient read retries once; a permanent failure is stated; STOP cancels and reverses nothing', async () => {
  const id = await run('Review the June close.', { options: { transientTools: ['getCloseBlockers'], failTools: ['getReconciliationsMissingSupport'] } });
  const b = A.body(id, reviewer)!;
  assert.ok(b.events.some((e) => e.type === 'TASK_RETRY'));
  assert.equal(b.graph.tasks.find((t) => t.taskId === 'blockers')!.status, 'COMPLETED');
  assert.equal(b.graph.tasks.find((t) => t.taskId === 'recSupport')!.status, 'FAILED');
  assert.ok(view(id).progress.some((p) => p.state === 'blocked' && /Support gaps — could not complete/.test(p.line)));
  const s = A.start(reviewer, 'Prepare the controller review for June.', { options: { pace: 200 } });
  assert.ok(s.ok); await settle(250);
  const c = A.intervene(s.run.runId, reviewer, 'Stop.');
  assert.equal(view(s.run.runId).status, 'CANCELLED', c.effect);
  assert.ok(A.body(s.run.runId, reviewer)!.graph.tasks.some((t) => t.status === 'COMPLETED'), 'completed work kept');
  assert.equal(orch.actions.ofSession(s.run.runId).filter((p) => p.status === 'COMPLETED').length, 0);
});

test('"Don\'t create comments yet." withdraws drafts; "Ignore …" excludes', async () => {
  const id = await run('Prepare the controller review for June.');
  const iv = A.intervene(id, reviewer, "Don't create comments yet.");
  assert.ok(iv.recognised && /withdrawn/.test(iv.effect));
  assert.ok(orch.actions.ofSession(view(id).sessionId).filter((p) => /COMMENT/.test(p.type)).every((p) => p.status === 'CANCELLED'));
  const id2 = await run('Review the June close.');
  const ex = A.intervene(id2, reviewer, 'Ignore the Accounts receivable issue.');
  assert.ok(ex.recognised);
  for (let i = 0; i < 60 && view(id2).status !== 'COMPLETED'; i++) await settle(100);
  assert.ok(!view(id2).result!.findings.some((f) => /Accounts receivable/.test(f.text)));
});

test('ownership and permissions: another user cannot read or steer a run; permissions are re-checked per step', async () => {
  const id = await run('Review the June close.');
  const other: Actor = { id: 'user:skim', name: 'Sarah Kim', ...ROLES['FINANCE_REVIEWER']! };
  assert.equal(A.get(id, other), null);
  assert.equal(A.intervene(id, other, 'Stop.').ok, false);
  const aud: Actor = { id: 'user:auditor', name: 'Priya Nair', ...ROLES['EXTERNAL_AUDITOR']! };
  const r = A.start(aud, 'Prepare the controller review for June.');
  assert.ok(r.ok);
  await A.wait(r.run.runId, 30000); await settle();
  assert.equal(orch.actions.ofSession(r.run.sessionId).filter((p) => p.status === 'COMPLETED').length, 0);
});

test('durable: a run in progress when the process stops is PAUSED on restart, never silently re-executed', async () => {
  const s = A.start(reviewer, 'Review the June close.', { options: { pace: 5000 } });
  assert.ok(s.ok); await settle(100);
  const again = new AgentRuntime(orch);
  const b = again.body(s.run.runId, reviewer)!;
  assert.equal(b.runStatus, 'PAUSED');
  assert.match(b.completionReason ?? '', /server restarted/);
  A.cancel(s.run.runId, reviewer);
});

test('a goal typed into Sloane starts a run; a short instruction steers it', async () => {
  const r = await orch.turn({ sessionId: 'agentturn-0001', request: 'Investigate ABB spend for FY26' }, reviewer);
  assert.equal(r.objects[0]!.type, 'AgentRun');
  assert.equal(orch.trace(r.traceId)!.route, 'AGENT');
  const q = await orch.turn({ sessionId: 'agentturn-0001', request: 'Only South Valley.' }, reviewer);
  assert.equal(q.objects[0]!.type, 'AgentRun');
  assert.ok(q.notes.some((n) => /Scope changed to South Valley/.test(n)));
  const n = await orch.turn({ sessionId: 'agentturn-0001', request: 'Why did CIP increase in June?' }, reviewer);
  assert.notEqual(n.objects[0]?.type, 'AgentRun', 'a question is an ordinary turn');
});

test('a run judges only its own proposals: earlier writes in the same conversation do not fail its verification', async () => {
  const b = await run('Prepare the controller review for June.');
  await decide(b, cpOf(view(b), 'CONFIRMATION')!.id, 'confirm');
  const sid = view(b).sessionId;
  assert.ok(orch.actions.ofSession(sid).some((p) => p.status === 'COMPLETED'), 'the conversation already holds confirmed writes');
  const a = await run('Review the June close.', { sessionId: sid });
  const v = view(a);
  assert.equal(v.status, 'COMPLETED', v.completionReason ?? '');
  assert.ok(v.verification!.passed, JSON.stringify(v.verification!.checks.filter((c) => !c.ok)));
});
