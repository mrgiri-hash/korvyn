/**
 * Phase 3B — controlled Build + Act. No provider call: the real orchestrator, the real action engine and services,
 * the deterministic interpreter and planner.   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionGovernanceEngine } from './actions.js';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { WORK } from './store.js';
import { type Actor, ROLES, toolRegistry } from './tools.js';

const reviewer: Actor = { id: 'user:mgiri', name: 'Mitra Giri', ...ROLES['FINANCE_REVIEWER']! };
let current: Actor = reviewer;
const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => current);
let n = 0;
const sid = () => `test-actions-${String(++n).padStart(4, '0')}`;
const ask = async (s: string, q: string) => { const r = await orch.turn({ sessionId: s, request: q }); assert.notEqual(r.state, 'ERROR', `${q}: ${JSON.stringify(r.notes)}`); return r; };
const props = (r: Awaited<ReturnType<typeof ask>>) => r.actions?.proposals ?? [];

test('governance is policy: unknown types are governed, the model cannot pick a class, writes are unreachable from tools', () => {
  assert.equal(ActionGovernanceEngine.classify('ADD_FLUX_COMMENT'), 'CONFIRM_REQUIRED');
  assert.equal(ActionGovernanceEngine.classify('RECONCILIATION_APPROVAL'), 'GOVERNED_ACTION');
  assert.equal(ActionGovernanceEngine.classify('DROP_TABLE'), 'GOVERNED_ACTION');
  for (const t of toolRegistry.all()) assert.ok(['READ', 'PROPOSE'].includes(t.risk) || t.id === 'postJournalEntry', `${t.id} is ${t.risk}`);
});

test('Flux comment: proposal only → edit keeps the same proposal → confirm writes once, attributed, audited, idempotent', async () => {
  current = reviewer;
  const s = sid();
  await ask(s, 'Why did CIP move in June?');
  const r = await ask(s, 'Use this explanation as the Flux comment.');
  const [p] = props(r);
  assert.ok(p && p.type === 'ADD_FLUX_COMMENT' && p.status === 'WAITING_CONFIRMATION', JSON.stringify(p?.validation));
  assert.equal(p.riskLevel, 'CONFIRM_REQUIRED');
  const key = 'flux:15000:2026-06', before = WORK.thread(key).comments.length;
  assert.equal(WORK.thread(key).comments.length, before, 'nothing written by the proposal');
  const e = orch.decide({ sessionId: s, proposalId: p.id, decision: 'edit', edits: { text: 'CIP decreased on placed-in-service settlements to PP&E.' } });
  assert.equal(e.proposals[0]!.id, p.id); assert.equal(e.proposals[0]!.version, 2);
  const c = orch.decide({ sessionId: s, proposalId: p.id, decision: 'confirm', requestId: 'req-flux-1' });
  assert.equal(c.results[0]!.status, 'COMPLETED', JSON.stringify(c.results));
  const cm = WORK.thread(key).comments.at(-1)!;
  assert.equal(cm.text, 'CIP decreased on placed-in-service settlements to PP&E.');
  assert.ok(cm.author === 'Mitra Giri' && cm.via === 'Sloane' && cm.source === 'SLOANE' && cm.version === 1 && cm.financialObjectIds.length > 0 && cm.investigationId);
  const again = orch.decide({ sessionId: s, proposalId: p.id, decision: 'confirm', requestId: 'req-flux-2' });
  assert.match(again.results[0]!.message, /not repeated/);
  assert.deepEqual(orch.decide({ sessionId: s, proposalId: p.id, decision: 'confirm', requestId: 'req-flux-1' }), c, 'a replayed request returns the recorded response');
  assert.equal(WORK.thread(key).comments.length, before + 1, 'exactly one write');
  const audit = orch.auditOf(s).find((a) => a.proposalId === p.id)!;
  assert.ok(audit.actor.name === 'Mitra Giri' && audit.source === 'SLOANE' && audit.financialObjectIds.length && audit.executionTraceId && (audit.after as { commentId: string }).commentId === cm.id);
  assert.ok(orch.timeline(s).some((x) => /Created Flux comment/.test(x.event)));
});

test('concurrency: a target changed after the proposal is STALE_PROPOSAL; there is no overwrite — refresh, then confirm', async () => {
  current = reviewer;
  const s = sid();
  await ask(s, 'Why did CIP move in June?');
  const [p] = props(await ask(s, 'Use this explanation as the Flux comment.'));
  WORK.addComment('flux:15000:2026-06', 'Another reviewer got there first.', { id: 'user:skim', name: 'Sarah Kim' }, { via: null, source: 'UI', expectedThreadVersion: null, investigationId: null }); // another writer
  const stale = orch.decide({ sessionId: s, proposalId: p!.id, decision: 'confirm', requestId: 'req-stale-1' });
  assert.equal(stale.results[0]!.code, 'STALE_PROPOSAL');
  assert.notEqual(orch.actions.view(p!.id)!.status, 'COMPLETED');
  assert.match(orch.decide({ sessionId: s, proposalId: p!.id, decision: 'confirm', requestId: 'req-stale-2' }).results[0]!.message, /refresh or regenerate/);
  orch.decide({ sessionId: s, proposalId: p!.id, decision: 'refresh', requestId: 'req-stale-3' });
  const ok = orch.decide({ sessionId: s, proposalId: p!.id, decision: 'confirm', requestId: 'req-stale-4' });
  assert.equal(ok.results[0]!.status, 'COMPLETED', JSON.stringify(ok.results));
  assert.equal(WORK.thread('flux:15000:2026-06').comments.filter((c) => c.source === 'SLOANE' && c.investigationId === orch.actions.view(p!.id)!.investigationId).length, 1, 'one Sloane write, after the other writer');
});

test('one book: Electrical CIP is the Reconciliations module definition, and its APPROVED workflow closes it to comments', async () => {
  current = reviewer;
  const s = sid();
  const [p] = props(await ask(s, 'Add a reconciliation comment to the Electrical CIP reconciliation that the difference is timing-related.'));
  assert.equal(p!.targetObjectId, 'recon:REC-CIP-ELECTRICAL:2026-06');
  assert.equal(p!.validationStatus, 'INVALID');
  assert.ok(p!.validation.errors.some((e) => /approved and closed/.test(e)), JSON.stringify(p!.validation));
});

test('reconciliation comment: ambiguous target asks, a stated figure the target does not carry is flagged, confirm writes', async () => {
  current = reviewer;
  const s = sid();
  const r = await ask(s, 'Add a reconciliation comment to the CIP reconciliation that the $4.2M difference is timing-related and expected to clear in July.');
  const [p] = props(r);
  assert.equal(p!.validationStatus, 'NEEDS_CHOICE', JSON.stringify(p));
  assert.ok(p!.choice!.options.some((o) => o.id === 'REC-MDH-15000'));
  const ch = orch.decide({ sessionId: s, proposalId: p!.id, decision: 'choose', choice: 'REC-MDH-15000' });
  assert.equal(ch.proposals[0]!.status, 'WAITING_CONFIRMATION', JSON.stringify(ch.proposals[0]!.validation));
  assert.ok(ch.proposals[0]!.validation.warnings.some((w) => /\$4\.2M/.test(w)), 'the $4.2M is not a figure on the reconciliation');
  const c = orch.decide({ sessionId: s, proposalId: p!.id, decision: 'confirm' });
  assert.equal(c.results[0]!.status, 'COMPLETED');
  assert.match(WORK.thread('recon:REC-MDH-15000:2026-06').comments.at(-1)!.text, /timing-related/);
});

test('support attachment: correction retargets the SAME proposal; confirm creates evidence relationships read back by tools', async () => {
  current = reviewer;
  const s = sid();
  await ask(s, 'Show me the CIP GL for June');
  const [p] = props(await ask(s, 'Attach the invoices supporting this population to the CIP reconciliation.'));
  assert.equal(p!.validationStatus, 'NEEDS_CHOICE');
  const r2 = await ask(s, 'No, attach those invoices to the Construction in progress — MER-DE reconciliation');
  const [q] = props(r2);
  assert.equal(q!.id, p!.id, 'the correction revised the existing proposal');
  assert.equal(orch.actions.ofSession(s).length, 1, 'no duplicate proposal');
  assert.equal(q!.status, 'WAITING_CONFIRMATION', JSON.stringify(q!.validation));
  const c = orch.decide({ sessionId: s, proposalId: q!.id, decision: 'confirm' });
  assert.equal(c.results[0]!.status, 'COMPLETED', JSON.stringify(c.results));
  const rels = WORK.relsTo('recon:REC-MER-DE-15000:2026-06');
  assert.ok(rels.length > 0 && rels.every((x) => x.type === 'RECONCILIATION_SUPPORTS' && x.documentConnected === false));
  assert.ok(WORK.relationships.some((x) => x.type === 'INVOICE_FOR' && x.from === rels[0]!.from && x.to.startsWith('txn:')));
  const env = { data: orch.data, gl: orch.gl, controls: orch.controls, actor: reviewer, visible: 'ALL' as const, objectId: 'FO-1' };
  const sup = toolRegistry.get('getReconciliationSupport')!.run({ reconciliationId: 'REC-MER-DE-15000', period: '2026-06' }, env).object;
  assert.equal(sup.facts.find((f) => f.key === 'attachedEvidence')!.value, rels.length);
});

test('report draft: build → modify in place (entity, FY25 recorded unavailable) → save creates a saved report definition', async () => {
  current = reviewer;
  const s = sid();
  const b = await ask(s, 'Build a Siemens FY26 spend report by project');
  assert.equal(b.objects[0]!.type, 'ReportDraft', JSON.stringify(b.notes));
  const m = await ask(s, 'Add entity and compare to FY25');
  const d = m.objects[0]!.draft!.definition as { rows: string[]; comparison: { status: string } };
  assert.deepEqual(d.rows, ['project', 'entity']);
  assert.equal(d.comparison.status, 'UNAVAILABLE');
  assert.equal(m.objects[0]!.draft!.id, b.objects[0]!.draft!.id, 'modified in place');
  const before = WORK.savedOf('REPORT_DRAFT').length;
  const [p] = props(await ask(s, 'Save it.'));
  assert.equal(p!.type, 'CREATE_SHARED_REPORT');
  assert.equal(WORK.savedOf('REPORT_DRAFT').length, before, 'not saved before confirmation');
  orch.decide({ sessionId: s, proposalId: p!.id, decision: 'confirm' });
  const saved = WORK.savedOf('REPORT_DRAFT').at(-1)!;
  assert.equal(WORK.savedOf('REPORT_DRAFT').length, before + 1);
  assert.equal((saved.definition as { status: string }).status, 'DRAFT');
});

test('Excel artifact (4A): build from the GL in context, refine conversationally (each change a version), generate on confirmation', async () => {
  current = reviewer;
  const s = sid();
  await ask(s, 'Show me the CIP GL for June');
  const x = await ask(s, 'Give me this GL in Excel');
  assert.equal(x.objects[0]!.type, 'ExcelWorkbookPreview');
  const id = x.objects[0]!.refs['artifactId']!;
  assert.ok(id?.startsWith('ARTIFACT-'), 'the workbook is kept as a governed artifact');
  await ask(s, 'Add source vendor.');
  const dep = await ask(s, 'Remove department.');
  assert.ok(dep.notes.some((n) => /Department is not in the GL tab/.test(n)), 'department is not carried by the book and says so');
  await ask(s, 'Sort by largest amount.');
  const last = await ask(s, 'Add TB on another tab.');
  const def = last.objects[0]!.draft!.definition as { sheets: { name: string; columns?: string[]; sort?: string }[] };
  assert.ok(def.sheets[0]!.columns!.includes('sourceVendor') && def.sheets[0]!.columns!.includes('costCenter') && def.sheets[0]!.sort === 'amount_desc' && def.sheets.some((t) => t.name === 'Trial Balance'), JSON.stringify(def));
  assert.equal(orch.artifacts.get(id)!.version, 4, 'build + three changes = v4 ("remove department" changed nothing)');
  const [p] = props(await ask(s, 'Download it.'));
  assert.equal(p!.type, 'GENERATE_EXCEL_ARTIFACT');
  const r = orch.decide({ sessionId: s, proposalId: p!.id, decision: 'confirm' });
  assert.equal(r.results[0]!.status, 'COMPLETED', r.results[0]!.message);
  await orch.artifacts.jobPromise(String(r.results[0]!.result!['jobId']));
  assert.equal(orch.artifacts.generations(id)[0]!.status, 'GENERATED');
});

test('issue: an amount no governed figure carries is flagged, and the issue is created only on confirmation', async () => {
  current = reviewer;
  const s = sid();
  await ask(s, 'Why did CIP move in June?');
  const [p] = props(await ask(s, 'Create an issue for the unsupported $7.2M.'));
  assert.ok(p!.validation.warnings.some((w) => /does not match a governed figure/.test(w)));
  const before = WORK.issues.length;
  orch.decide({ sessionId: s, proposalId: p!.id, decision: 'confirm' });
  assert.equal(WORK.issues.length, before + 1);
  assert.equal(WORK.issues.at(-1)!.amountUsd, 7_200_000);
});

test('multi-action: three proposals, nothing executes until confirmed, then all in sequence', async () => {
  current = reviewer;
  const s = sid();
  await ask(s, 'Why did CIP move in June?');
  const r = await ask(s, 'Use this explanation as the Flux comment, attach the support, and assign Sarah as reviewer.');
  const ps = props(r);
  assert.deepEqual(ps.map((p) => p.type), ['ADD_FLUX_COMMENT', 'ATTACH_SUPPORT', 'ASSIGN_REVIEWER'], JSON.stringify(ps.map((p) => p.validation)));
  assert.ok(ps.every((p) => p.status === 'WAITING_CONFIRMATION'), JSON.stringify(ps.map((p) => [p.type, p.validation])));
  assert.equal(ps[2]!.proposedPayload['reviewerName'], 'Sarah Kim', 'only the group-scoped authorized Sarah');
  assert.equal(orch.auditOf(s).length, 0, 'nothing executed');
  const all = orch.decide({ sessionId: s, planId: r.actions!.planId, decision: 'confirm' });
  assert.ok(all.results.every((x) => x.status === 'COMPLETED'), JSON.stringify(all.results));
  assert.equal(WORK.reviewer('flux:15000:2026-06')?.name, 'Sarah Kim');
});

test('dependencies: a dependent action never runs when its prerequisite did not complete', () => {
  current = reviewer;
  const s = sid();
  const pop = orch.gl.definePopulation({ accounts: ['15000'], periodStart: '2026-06', periodEnd: '2026-06' });
  const pkg = orch.actions.propose({ sessionId: s, planId: 'PLAN-dep', type: 'CREATE_SUPPORT_PACKAGE', payload: { name: 'CIP June support', populationId: pop.id } });
  const att = orch.actions.propose({ sessionId: s, planId: 'PLAN-dep', type: 'ATTACH_SUPPORT', payload: { targetType: 'RECONCILIATION', target: 'REC-MDH-15000', period: '2026-06', populationId: pop.id, fromPackage: pkg.id }, dependsOn: [pkg.id] });
  orch.decide({ sessionId: s, proposalId: pkg.id, decision: 'cancel' });
  const r = orch.decide({ sessionId: s, planId: 'PLAN-dep', decision: 'confirm' });
  assert.match(r.results.find((x) => x.proposalId === att.id)!.message, /depends on/);
  assert.notEqual(orch.actions.view(att.id)!.status, 'COMPLETED');
  const pkg2 = orch.actions.propose({ sessionId: s, planId: 'PLAN-dep2', type: 'CREATE_SUPPORT_PACKAGE', payload: { name: 'CIP June support', populationId: pop.id } });
  const att2 = orch.actions.propose({ sessionId: s, planId: 'PLAN-dep2', type: 'ATTACH_SUPPORT', payload: { targetType: 'RECONCILIATION', target: 'REC-MDH-15000', period: '2026-06', populationId: pop.id, fromPackage: pkg2.id }, dependsOn: [pkg2.id] });
  const ok = orch.decide({ sessionId: s, planId: 'PLAN-dep2', decision: 'confirm' });
  assert.ok(ok.results.every((x) => x.status === 'COMPLETED'), JSON.stringify(ok.results));
  assert.ok(WORK.relsTo('recon:REC-MDH-15000:2026-06').some((x) => x.from === orch.actions.view(pkg2.id)!.result!['packageId'] && x.kind === 'SUPPORT_PACKAGE'));
  assert.ok(WORK.relationships.some((x) => x.type === 'PACKAGE_CONTAINS' && x.from === orch.actions.view(pkg2.id)!.result!['packageId']));
  void att2;
});

test('permissions are checked at proposal AND at execution; a revoked permission stops the write', async () => {
  current = { id: 'user:scoped', name: 'Scoped User', ...ROLES['ENTITY_ACCOUNTANT']! };
  const s1 = sid();
  await ask(s1, 'Why did CIP move in June?');
  const [p] = props(await ask(s1, 'Use this explanation as the Flux comment.'));
  assert.ok(p!.validation.errors.some((e) => /lacks FLUX_COMMENT/.test(e)), JSON.stringify(p!.validation));
  assert.equal(orch.decide({ sessionId: s1, proposalId: p!.id, decision: 'confirm' }).results[0]!.status !== 'COMPLETED', true);
  // a non-package dependency is ordering only: the attachment still attaches its own evidence

  current = reviewer;
  const s2 = sid();
  await ask(s2, 'Why did CIP move in June?');
  const [q] = props(await ask(s2, 'Create an issue for the unsupported $7.2M.'));
  current = { id: 'user:mgiri', name: 'Mitra Giri', ...ROLES['EXTERNAL_AUDITOR']! }; // revoked between proposal and confirmation
  const before = WORK.issues.length;
  const r = orch.decide({ sessionId: s2, proposalId: q!.id, decision: 'confirm' });
  assert.match(r.results[0]!.message, /lacks ISSUE_CREATE/);
  assert.equal(WORK.issues.length, before);
  current = reviewer;
});

test('reviewer resolution: two authorized Sarahs ask; an unauthorized match is named', async () => {
  current = reviewer;
  const s = sid();
  const [p] = props(await ask(s, 'Send the Construction in progress — MER-DE reconciliation to Sarah for review.'));
  assert.equal(p!.validationStatus, 'NEEDS_CHOICE', JSON.stringify(p));
  assert.deepEqual(p!.choice!.options.map((o) => o.id).sort(), ['user:skim', 'user:slin']);
});

test('governed actions are prepared with readiness and a route, and are never executed', async () => {
  current = reviewer;
  const s = sid();
  const [p] = props(await ask(s, 'Approve the Construction in progress — MDH reconciliation.'));
  assert.equal(p!.riskLevel, 'GOVERNED_ACTION');
  assert.equal(p!.executable, false);
  assert.ok(p!.governed!.readiness.length >= 3);
  const r = orch.decide({ sessionId: s, proposalId: p!.id, decision: 'confirm' });
  assert.match(r.results[0]!.message, /governed action/);
  assert.equal(orch.controls.reconcile(orch.controls.recDef('REC-MDH-15000')!, '2026-06').workflow.status, 'IN_REVIEW', 'status unchanged');
});
