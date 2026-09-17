/**
 * Phase 3C — durable work store, server source of truth, authorization foundation. No provider call.
 * Uses a real FILE database (a temp path) so a "restart" is a new process-level database handle and a new orchestrator.
 * Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MockLLMAdapter } from './adapter.js';
import { actorContext, AuthorizationService, DEV_DIRECTORY, SessionService, SoDPolicyService } from './auth.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { KorvynDatabase } from './persistence/db.js';
import { WORK } from './store.js';
import { toolRegistry } from './tools.js';
import { WorkApi } from './workapi.js';

const dir = mkdtempSync(join(tmpdir(), 'korvyn-3c-'));
const path = join(dir, 'work.db');
const user = (id: string) => actorContext(DEV_DIRECTORY.find((u) => u.id === id)!, null, 'test');
const mgiri = user('user:mgiri'), skim = user('user:skim'), auditor = user('user:auditor'), mdh = user('user:mdh');
let current = mgiri;
let db = new KorvynDatabase(path);
let orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => current, undefined, db);
let api = new WorkApi(orch);
/** a restart: close the database, open the same file, build a new orchestrator over it */
const restart = () => { db.close(); db = new KorvynDatabase(path); orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => current, undefined, db); api = new WorkApi(orch); };
let n = 0;
const sid = () => `test-3c-${String(++n).padStart(4, '0')}`;
const env = (a = mgiri) => ({ data: orch.data, gl: orch.gl, controls: orch.controls, actor: a, visible: a.entityAccess === 'ALL' ? 'ALL' as const : new Set(a.entityAccess), objectId: 'FO-1' });
const commentsTool = (recId: string, a = mgiri) => toolRegistry.get('getReconciliationComments')!.run({ reconciliationId: recId, period: '2026-06' }, env(a)).object;

test.after(() => { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true }); });

test('stable Korvyn ids and the seed: 38 module reconciliations plus the GL catalog, seeded once', () => {
  const defs = WORK.repos.reconciliations.definitions();
  assert.equal(defs.filter((d) => d.catalog === 'MODULE').length, 38);
  assert.ok(defs.every((d) => d.id.startsWith('RECONDEF-')));
  assert.equal(WORK.repos.reconciliations.status('REC-CIP-ELECTRICAL')?.status, 'APPROVED');
  const before = WORK.repos.records.list('RECON_DEFINITION').length;
  restart();
  assert.equal(WORK.repos.records.list('RECON_DEFINITION').length, before, 'the seed is idempotent across restarts');
});

test('durability: an investigation, its steps, proposals, executed comment and audit survive a restart and restore', async () => {
  current = mgiri;
  const s = sid();
  await orch.turn({ sessionId: s, request: 'Why did CIP move in June?' }, mgiri);
  const r = await orch.turn({ sessionId: s, request: 'Use this explanation as the Flux comment.' }, mgiri);
  const p = r.actions!.proposals[0]!;
  assert.match(p.id, /^ACTION-/);
  const done = orch.decide({ sessionId: s, proposalId: p.id, decision: 'confirm', requestId: 'dur-1' }, mgiri);
  assert.equal(done.results[0]!.status, 'COMPLETED', JSON.stringify(done.results));
  const inv = orch.listInvestigations(mgiri).at(-1)!;
  assert.match(inv.id, /^INVESTIGATION-/);

  restart();
  const list = orch.listInvestigations(mgiri);
  assert.ok(list.some((x) => x.id === inv.id && x.steps >= 2), 'the investigation is listed after restart');
  const view = orch.investigationView(inv.id, mgiri)!;
  assert.ok(view.steps[0]!.objects.length > 0, 'READ objects are re-derived from their recorded tool calls');
  assert.ok(view.proposals.some((x) => x.id === p.id && x.status === 'COMPLETED'), 'the proposal lifecycle is durable');
  assert.ok(view.audit.some((a) => a.proposalId === p.id && a.outcome === 'COMPLETED'));
  assert.ok(view.timeline.length > 0);
  assert.ok(WORK.thread('flux:15000:2026-06').comments.some((c) => c.investigationId === inv.id && c.source === 'SLOANE'), 'the executed comment is durable');
  /* a replayed decision after restart returns the recorded result and writes nothing */
  const again = orch.decide({ sessionId: s, proposalId: p.id, decision: 'confirm', requestId: 'dur-1' }, mgiri);
  assert.deepEqual(again.results, done.results);
  /* resume: a new conversation continues the investigation from the durable record */
  const s2 = sid();
  assert.ok(orch.resumeInvestigation(inv.id, s2, mgiri));
  const cont = await orch.turn({ sessionId: s2, request: 'Show me the GL behind it.' }, mgiri);
  assert.notEqual(cont.state, 'ERROR');
  assert.equal(orch.listInvestigations(mgiri).filter((x) => x.id === inv.id).length, 1, 'resume continues, never duplicates');
});

test('investigations are private to their owner', () => {
  const inv = orch.listInvestigations(mgiri).at(-1)!;
  assert.equal(orch.investigationView(inv.id, skim), null);
  assert.ok(!orch.listInvestigations(skim).some((x) => x.id === inv.id));
  assert.equal(orch.resumeInvestigation(inv.id, sid(), skim), null);
});

test('one book: a comment written in the Reconciliations UI is the comment Sloane reads, and Sloane’s comment is the one the UI reads', async () => {
  const w = api.addReconciliationComment(skim, 'REC-CIP-MECHANICAL', { text: 'Returned: tie the June accrual to the schedule.', idempotencyKey: 'ui-onebook-1' });
  assert.equal(w.status, 201, JSON.stringify(w.body));
  const tool = commentsTool('REC-CIP-MECHANICAL');
  assert.ok(tool.table!.rows.some((row) => row.cells.some((v) => v.includes('tie the June accrual'))), 'Sloane’s tool reads the UI comment');
  assert.equal(tool.facts.find((f) => f.key === 'latest')!.value, 'Returned: tie the June accrual to the schedule.');

  current = mgiri;
  const s = sid();
  const r = await orch.turn({ sessionId: s, request: 'Add a reconciliation comment to the Mechanical CIP reconciliation that the accrual schedule is now attached.' }, mgiri);
  const p = r.actions!.proposals[0]!;
  assert.equal(p.targetObjectId, 'recon:REC-CIP-MECHANICAL:2026-06', JSON.stringify(p.validation));
  const c = orch.decide({ sessionId: s, proposalId: p.id, decision: 'confirm', requestId: 'onebook-2' }, mgiri);
  assert.equal(c.results[0]!.status, 'COMPLETED', JSON.stringify(c.results));
  const ui = api.reconciliationWorkflow(skim, 'REC-CIP-MECHANICAL').body as { comments: { text: string; via: string | null; source: string }[]; status: string };
  assert.ok(ui.comments.some((x) => x.source === 'SLOANE' && x.via === 'Sloane'), 'the UI reads Sloane’s comment');
  assert.ok(ui.comments.some((x) => x.source === 'UI'));
  assert.equal(ui.status, 'RETURNED', 'workflow status is the module’s seeded state, server-authoritative');
});

test('one book: a flux comment from the UI is on the server line and on the browser line crosswalk', () => {
  const w = api.addFluxComment(skim, '15000', { text: 'Placed-in-service settlements explain the decrease.', idempotencyKey: 'ui-flux-1' });
  assert.equal(w.status, 201, JSON.stringify(w.body));
  const line = api.fluxLineComments(mgiri, 'recost').body as { comments: { text: string }[] };
  assert.ok(line.comments.some((c) => c.text.startsWith('Placed-in-service')));
  const tool = toolRegistry.get('getFluxComments')!.run({ account: '15000', period: '2026-06' }, env()).object;
  assert.ok(JSON.stringify(tool.table).includes('Placed-in-service settlements'));
});

test('permissions: the auditor reads but cannot comment; an entity-scoped user cannot read group work; capabilities are server-side', () => {
  assert.equal(api.addReconciliationComment(auditor, 'REC-CIP-MECHANICAL', { text: 'Auditor note', idempotencyKey: 'aud-1' }).status, 403);
  assert.equal(api.addFluxComment(auditor, '15000', { text: 'Auditor note', idempotencyKey: 'aud-2' }).status, 403);
  assert.equal(api.reconciliationWorkflow(auditor, 'REC-CIP-MECHANICAL').status, 200, 'the auditor holds RECON_VIEW');
  assert.equal(api.reconciliationWorkflow(mdh, 'REC-CIP-MECHANICAL').status, 403, 'a GROUP reconciliation is outside MDH');
  const mdhRec = orch.controls.recDefs().find((d) => d.entity === 'MDH')!;
  assert.equal(api.reconciliationWorkflow(mdh, mdhRec.id).status, 200);
  for (const future of ['RECON_APPROVE', 'CLOSE_CERTIFY', 'REPORT_PUBLISH', 'MAPPING_CHANGE', 'ERP_WRITEBACK'] as const) {
    for (const a of [mgiri, auditor, mdh]) assert.equal(AuthorizationService.can(a, future).allowed, false, `${future} is not enabled`);
  }
  const sod = SoDPolicyService.evaluate('RECONCILIATION_APPROVAL', { actorId: 'user:mgiri', preparerId: 'user:mgiri' });
  assert.ok(sod.some((x) => x.policyId === 'SOD-PREPARER-NOT-APPROVER' && !x.ok));
});

test('permissions at execution: an auditor confirming another user’s proposal is refused and nothing is written', async () => {
  current = mgiri;
  const s = sid();
  await orch.turn({ sessionId: s, request: 'Why did CIP move in June?' }, mgiri);
  const p = (await orch.turn({ sessionId: s, request: 'Use this explanation as the Flux comment.' }, mgiri)).actions!.proposals[0]!;
  const before = WORK.thread('flux:15000:2026-06').comments.length;
  const r = orch.decide({ sessionId: s, proposalId: p.id, decision: 'confirm', requestId: 'perm-exec-1' }, auditor);
  assert.notEqual(r.results[0]!.status, 'COMPLETED');
  assert.equal(r.results[0]!.code, 'FORBIDDEN');
  assert.equal(WORK.thread('flux:15000:2026-06').comments.length, before);
});

test('concurrency: a UI write with a stale thread version is STALE_PROPOSAL and writes nothing', () => {
  const key = 'recon:REC-CIP-MECHANICAL:2026-06';
  const v = WORK.thread(key).version;
  assert.equal(api.addReconciliationComment(mgiri, 'REC-CIP-MECHANICAL', { text: 'First', idempotencyKey: 'cc-1', expectedThreadVersion: v }).status, 201);
  const count = WORK.thread(key).comments.length, audits = WORK.repos.audit.list({ target: key }).length;
  const stale = api.addReconciliationComment(skim, 'REC-CIP-MECHANICAL', { text: 'Second, from a stale screen', idempotencyKey: 'cc-2', expectedThreadVersion: v });
  assert.equal(stale.status, 409);
  assert.equal((stale.body as { error: string }).error, 'STALE_PROPOSAL');
  assert.equal(WORK.thread(key).comments.length, count);
  assert.equal(WORK.repos.audit.list({ target: key }).length, audits, 'a refused write is not audited as completed');
});

test('idempotency: a retried UI write returns the recorded result — one comment, one audit event', () => {
  const key = 'recon:REC-AR:2026-06';
  const body = { text: 'AR aging tied to the subledger.', idempotencyKey: 'idem-ar-1' };
  const a = api.addReconciliationComment(mgiri, 'REC-AR', body), b = api.addReconciliationComment(mgiri, 'REC-AR', body);
  assert.equal(a.status, 201);
  assert.deepEqual(b, a);
  assert.equal(WORK.thread(key).comments.filter((c) => c.text === body.text).length, 1);
  assert.equal(WORK.repos.audit.list({ target: key }).filter((e) => e.action === 'ADD_RECONCILIATION_COMMENT').length, 1);
  assert.equal(api.addReconciliationComment(mgiri, 'REC-AR', { text: 'no key' }).status, 400, 'a write without an idempotency key is refused');
});

test('audit: every field is recorded and the table is append-only (UPDATE and DELETE are refused by the database)', () => {
  const ev = WORK.repos.audit.list({ target: 'recon:REC-AR:2026-06' }).at(-1)!;
  for (const k of ['eventId', 'at', 'actor', 'source', 'action', 'target', 'beforeRef', 'afterRef', 'before', 'after', 'investigationId', 'executionTraceId', 'proposalId', 'confirmation', 'financialObjectIds', 'populationIds', 'evidenceIds', 'outcome', 'error']) assert.ok(k in ev, `audit field ${k}`);
  assert.equal(ev.source, 'UI');
  assert.equal(ev.actor.id, 'user:mgiri');
  assert.throws(() => db.db.prepare('UPDATE audit_events SET action = ? WHERE event_id = ?').run('TAMPERED', ev.eventId));
  assert.throws(() => db.db.prepare('DELETE FROM audit_events WHERE event_id = ?').run(ev.eventId));
  assert.equal(WORK.repos.audit.list({ target: 'recon:REC-AR:2026-06' }).at(-1)!.action, 'ADD_RECONCILIATION_COMMENT');
});

test('sessions: the actor comes from the session cookie, never from the browser; strict mode refuses an unknown session', () => {
  const fakeReq = (cookie?: string, body?: Record<string, string>) => ({ headers: { ...(cookie ? { cookie } : {}), 'x-actor-id': 'user:auditor' }, body } as unknown as IncomingMessage);
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => { headers[k] = v; } } as unknown as ServerResponse;
  const strict = new SessionService(WORK.repos, undefined, { KORVYN_AUTH_MODE: 'strict' });
  assert.equal(strict.resolve(fakeReq(), res), null, 'no session, no actor');
  assert.equal(strict.resolve(fakeReq('korvyn_session=SESSION-FORGED'), res), null, 'a forged session id is not a session');
  const dev = new SessionService(WORK.repos, undefined, { KORVYN_AUTH_MODE: 'dev', KORVYN_DEV_USER: 'user:skim' });
  const a = dev.resolve(fakeReq(undefined), res)!;
  assert.equal(a.id, 'user:skim', 'dev auto sign-in uses the configured dev user, not a header');
  assert.match(headers['Set-Cookie']!, /HttpOnly; SameSite=Strict/);
  const cookie = headers['Set-Cookie']!.split(';')[0]!;
  assert.equal(strict.resolve(fakeReq(cookie), res)!.id, 'user:skim', 'the issued session resolves in any mode');
  WORK.repos.sessions.revoke(cookie.split('=')[1]!);
  assert.equal(strict.resolve(fakeReq(cookie), res), null, 'a revoked session is refused');
});
