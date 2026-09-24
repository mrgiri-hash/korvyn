/**
 * Phase 3D — ONE BOOK + server-authoritative state + session hardening, tested through the REAL HTTP routes the
 * browser uses (cookies, CSRF, origin checks, the outcome contract), with Sloane on the deterministic adapter.
 * Run: npm run sloane:test
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleSloane } from './routes.js';
import { WORK } from './store.js';

let server: Server; let base = '';
const started = new Promise<void>((resolve) => { server = createServer((req, res) => { void handleSloane(req, res).then((h) => { if (!h) { res.writeHead(404); res.end(); } }); }); server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; resolve(); }); });
after(() => server.close());

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** a browser: a cookie jar, the CSRF token read from /api/auth/me, and a session id for Sloane */
class Client {
  cookie = ''; csrf = ''; sid = `onebook-${Math.random().toString(36).slice(2, 12)}`; lastSetCookie = '';
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: J; setCookie: string }> {
    await started;
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}), ...(this.csrf && method !== 'GET' ? { 'X-Korvyn-CSRF': this.csrf } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const sc = r.headers.get('set-cookie') ?? '';
    if (sc) { this.lastSetCookie = sc; this.cookie = sc.split(';')[0]!; }
    return { status: r.status, body: await r.json() as J, setCookie: sc };
  }
  async signIn(userId?: string) {
    if (userId) { const s = await this.call('POST', '/api/auth/dev/switch', { userId }); assert.equal(s.status, 200, JSON.stringify(s.body)); }
    const me = await this.call('GET', '/api/auth/me'); this.csrf = me.body['csrfToken']; return me.body;
  }
  key() { return `k-${Math.random().toString(36).slice(2)}`; }
  async ask(q: string) { const r = await this.call('POST', '/api/sloane/turn', { sessionId: this.sid, request: q }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }
  async confirmAll(turn: J) { const planId = turn['actions']?.planId; assert.ok(planId, `no proposals: ${JSON.stringify(turn['notes'])}`); const r = await this.call('POST', '/api/sloane/action', { sessionId: this.sid, planId, decision: 'confirm', requestId: this.key() }); return r; }
}
const fact = (turn: J, key: string) => (turn['objects'] as J[]).flatMap((o) => o['facts'] as J[]).find((f) => f['key'] === key)?.['value'];

test('session: HttpOnly SameSite=Strict Max-Age cookie; Secure behind HTTPS; logout revokes', async () => {
  const c = new Client();
  const me = await c.call('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.match(me.setCookie, /HttpOnly/); assert.match(me.setCookie, /SameSite=Strict/); assert.match(me.setCookie, /Max-Age=43200/); assert.doesNotMatch(me.setCookie, /Secure/);
  assert.ok(me.body['csrfToken'] && me.body['actor'].id === 'user:mgiri' && me.body['provider'] === 'dev-session');
  const https = await new Client().call('GET', '/api/auth/me', undefined, { 'x-forwarded-proto': 'https' });
  assert.match(https.setCookie, /; Secure/);
  c.csrf = me.body['csrfToken'];
  const out = await c.call('POST', '/api/auth/logout', {});
  assert.equal(out.body['outcome'], 'SUCCESS');
  assert.match(out.setCookie, /Max-Age=0/);
});

test('CSRF and origin: a mutation without the token, with a wrong token, or from a foreign origin is refused and writes nothing', async () => {
  const c = new Client(); await c.signIn();
  const key = 'recon:REC-AR:2026-06', before = WORK.thread(key).comments.length;
  const body = { text: 'CSRF probe', idempotencyKey: c.key() };
  const noToken = await c.call('POST', '/api/work/reconciliations/REC-AR/comments', body, { 'X-Korvyn-CSRF': '' });
  assert.equal(noToken.status, 403); assert.equal(noToken.body['code'], 'CSRF_REJECTED'); assert.equal(noToken.body['outcome'], 'PERMISSION_DENIED');
  const wrong = await c.call('POST', '/api/work/reconciliations/REC-AR/comments', body, { 'X-Korvyn-CSRF': 'forged-token-value-000000000000' });
  assert.equal(wrong.body['code'], 'CSRF_REJECTED');
  const foreign = await c.call('POST', '/api/work/reconciliations/REC-AR/comments', body, { Origin: 'https://evil.example' });
  assert.equal(foreign.body['code'], 'ORIGIN_REJECTED');
  const cookieOnly = new Client(); cookieOnly.cookie = c.cookie; // a cross-site request can carry the cookie, never the token
  assert.equal((await cookieOnly.call('POST', '/api/sloane/turn', { request: 'hi' })).body['code'], 'CSRF_REJECTED');
  assert.equal(WORK.thread(key).comments.length, before, 'nothing was written');
  const good = await c.call('POST', '/api/work/reconciliations/REC-AR/comments', body);
  assert.equal(good.status, 201); assert.equal(good.body['outcome'], 'SUCCESS');
  assert.equal((await c.call('GET', '/api/work/reconciliations/REC-AR')).status, 200, 'reads need no token');
});

test('ONE BOOK · Flux: Sloane’s confirmed comment is on the workspace line; the workspace’s comment is what Sloane reads', async () => {
  const c = new Client(); await c.signIn();
  await c.ask('Why did CIP move in June?');
  const p = await c.ask('Use this explanation as the Flux comment.');
  const done = await c.confirmAll(p);
  assert.equal(done.body['outcome'], 'SUCCESS', JSON.stringify(done.body['results']));
  const line = await c.call('GET', '/api/work/flux/line/FS-CIP?period=2026-06');
  assert.ok((line.body['comments'] as J[]).some((x) => x['source'] === 'SLOANE' && x['via'] === 'Sloane'), 'the Flux workspace line shows Sloane’s comment');
  const ui = await c.call('POST', '/api/work/flux/line/FS-CIP/comments', { text: 'Workspace: Q2 settlements moved to PP&E; see PIS memo.', period: '2026-06', idempotencyKey: c.key(), expectedThreadVersion: line.body['threadVersion'] });
  assert.equal(ui.status, 201, JSON.stringify(ui.body));
  const read = await c.ask('Show me the comment on this Flux item.');
  assert.equal(fact(read, 'latest'), 'Workspace: Q2 settlements moved to PP&E; see PIS memo.');
  /* edit in the workspace; Sloane reads the edited text */
  const edit = await c.call('POST', `/api/work/comments/${ui.body['comment'].id}/edit`, { text: 'Workspace (edited): Q2 settlements moved to PP&E.', expectedVersion: 1, idempotencyKey: c.key() });
  assert.equal(edit.body['outcome'], 'SUCCESS', JSON.stringify(edit.body));
  assert.equal(fact(await c.ask('Show me the latest comment on this Flux item.'), 'latest'), 'Workspace (edited): Q2 settlements moved to PP&E.');
  const stale = await c.call('POST', `/api/work/comments/${ui.body['comment'].id}/edit`, { text: 'again', expectedVersion: 1, idempotencyKey: c.key() });
  assert.equal(stale.body['outcome'], 'STALE_VERSION');
});

test('ONE BOOK · Reconciliations: Sloane’s support is in the workspace; the workspace’s support and comment are what Sloane reads', async () => {
  const c = new Client(); await c.signIn();
  await c.ask('Show me the CIP GL for June');
  const p = await c.ask('Attach the invoices supporting this population to the Mechanical CIP reconciliation.');
  const done = await c.confirmAll(p);
  assert.equal(done.body['outcome'], 'SUCCESS', JSON.stringify(done.body['results']));
  const rec = await c.call('GET', '/api/work/reconciliations/REC-CIP-MECHANICAL');
  const sloaneLinks = (rec.body['attachedEvidence'] as J[]).filter((x) => x['via'] === 'Sloane');
  assert.ok(sloaneLinks.length > 0, 'the Reconciliation workspace shows Sloane’s support links');
  const ui = await c.call('POST', '/api/work/reconciliations/REC-CIP-MECHANICAL/support', { reference: 'WP-2026-06-MECH-TRANSFERS v1', label: 'Transfers to Buildings schedule', kind: 'WORKPAPER', idempotencyKey: c.key(), expectedSupportVersion: rec.body['supportVersion'] });
  assert.equal(ui.status, 201, JSON.stringify(ui.body));
  const dup = await c.call('POST', '/api/work/reconciliations/REC-CIP-MECHANICAL/support', { reference: 'WP-2026-06-MECH-TRANSFERS v1', idempotencyKey: c.key() });
  assert.equal(dup.body['outcome'], 'CONFLICT');
  const sup = await c.ask('What support is attached to this reconciliation?');
  const table = JSON.stringify(sup['objects']);
  assert.match(table, /Transfers to Buildings schedule/, 'Sloane sees the workspace-attached support');
  assert.equal(fact(sup, 'attachedEvidence'), sloaneLinks.length + 1);
  const cm = await c.call('POST', '/api/work/reconciliations/REC-CIP-MECHANICAL/comments', { text: 'Workspace: transfers schedule attached; resubmitting.', idempotencyKey: c.key() });
  assert.equal(cm.status, 201);
  assert.equal(fact(await c.ask('Show the latest reconciliation comment.'), 'latest'), 'Workspace: transfers schedule attached; resubmitting.');
  /* the approved Electrical CIP reconciliation refuses new support from either channel */
  const closed = await c.call('POST', '/api/work/reconciliations/REC-CIP-ELECTRICAL/support', { reference: 'WP-X', idempotencyKey: c.key() });
  assert.equal(closed.body['outcome'], 'CONFLICT');
});

test('ONE BOOK · Close: a task blocked in the Close workspace is what Sloane reports as blocking June close', async () => {
  const c = new Client(); await c.signIn();
  const list = await c.call('GET', '/api/work/close/tasks');
  const t = (list.body['tasks'] as J[]).find((x) => x['id'] === 'CT-001')!;
  assert.equal(t['state'], 'COMPLETE');
  assert.equal(list.body['tasks'].length, 76, 'the workspace’s own 76-task checklist');
  const before = await c.ask('What is blocking June close?');
  assert.doesNotMatch(JSON.stringify(before['objects']), /Bank statement import — Bank feed for June not received/);
  const set = await c.call('POST', '/api/work/close/tasks/CT-001/status', { to: 'BLOCKED', blockedBy: 'Bank feed for June not received', expectedVersion: t['version'], idempotencyKey: c.key() });
  assert.equal(set.body['outcome'], 'SUCCESS', JSON.stringify(set.body));
  const stale = await c.call('POST', '/api/work/close/tasks/CT-001/status', { to: 'COMPLETE', expectedVersion: t['version'], idempotencyKey: c.key() });
  assert.equal(stale.body['outcome'], 'STALE_VERSION');
  const after = await c.ask('What is blocking June close?');
  assert.match(JSON.stringify(after['objects']), /Bank statement import — Bank feed for June not received/);
  const back = await c.call('POST', '/api/work/close/tasks/CT-001/status', { to: 'COMPLETE', expectedVersion: set.body['task'].version, idempotencyKey: c.key() });
  assert.equal(back.body['outcome'], 'SUCCESS');
});

test('ONE BOOK · Reporting: Sloane saves a report into Saved Reports; the workspace’s edit is the version Sloane shows', async () => {
  const c = new Client(); await c.signIn();
  await c.ask('Build a Siemens FY26 spend report by project.');
  const saved = await c.confirmAll(await c.ask('Save it.'));
  assert.equal(saved.body['outcome'], 'SUCCESS', JSON.stringify(saved.body['results']));
  const list = await c.call('GET', '/api/work/reports');
  const r = (list.body['reports'] as J[]).find((x) => /siemens/i.test(x['name']))!;
  assert.ok(r, 'the Sloane report is in Saved Reports');
  assert.equal(r['createdVia'], 'Sloane');
  assert.deepEqual(r['browser']['rows'], ['project'], 'the workspace definition is translated, not invented');
  assert.ok((list.body['reports'] as J[]).some((x) => x['id'] === 'RPT-0004'), 'the workspace’s seeded reports are the same store');
  const next = { ...r['browser'], rows: ['project', 'entity'] };
  const upd = await c.call('POST', `/api/work/reports/${r['id']}`, { definition: next, expectedVersion: r['version'], what: 'Added entity', idempotencyKey: c.key() });
  assert.equal(upd.body['outcome'], 'SUCCESS', JSON.stringify(upd.body));
  const show = await c.ask('Show me the Siemens FY26 spend report.');
  assert.equal(fact(show, 'version'), r['version'] + 1);
  assert.equal(fact(show, 'rows'), 'project → entity');
  const stale = await c.call('POST', `/api/work/reports/${r['id']}`, { definition: next, expectedVersion: r['version'], idempotencyKey: c.key() });
  assert.equal(stale.body['outcome'], 'STALE_VERSION');
});

test('authorization: the auditor reads and cannot write; the MDH accountant cannot read group work through the API or Sloane', async () => {
  const aud = new Client(); await aud.signIn('user:auditor');
  assert.equal((await aud.call('GET', '/api/work/reconciliations/REC-CIP-MECHANICAL')).status, 200);
  const w1 = await aud.call('POST', '/api/work/reconciliations/REC-CIP-MECHANICAL/support', { reference: 'WP-AUD', idempotencyKey: aud.key() });
  assert.equal(w1.body['outcome'], 'PERMISSION_DENIED');
  assert.equal((await aud.call('POST', '/api/work/close/tasks/CT-002/status', { to: 'BLOCKED', blockedBy: 'x', expectedVersion: 1, idempotencyKey: aud.key() })).body['outcome'], 'PERMISSION_DENIED');
  assert.equal((await aud.call('POST', '/api/work/reports', { name: 'Auditor report', definition: { rows: ['vendor'] }, idempotencyKey: aud.key() })).body['outcome'], 'PERMISSION_DENIED');
  const mdh = new Client(); await mdh.signIn('user:mdh');
  assert.equal((await mdh.call('GET', '/api/work/reconciliations/REC-CIP-MECHANICAL')).body['outcome'], 'PERMISSION_DENIED');
  const tasks = (await mdh.call('GET', '/api/work/close/tasks')).body['tasks'] as J[];
  assert.ok(tasks.length > 0 && tasks.every((t) => t['entity'] === 'MDH'), 'only the MDH entity’s close tasks');
  const s = await mdh.ask('Show me the comments on the Mechanical CIP reconciliation');
  assert.doesNotMatch(JSON.stringify(s['objects']), /transfers schedule attached/, 'Sloane does not hand group reconciliation comments to an MDH-scoped user');
});

test('audit: workspace and Sloane writes land in the same append-only log with channel, actor, target and before/after', () => {
  const events = WORK.repos.audit.list();
  const ui = events.filter((e) => e.source === 'UI'), sloane = events.filter((e) => e.source === 'SLOANE');
  assert.ok(ui.length > 0 && sloane.length > 0);
  for (const e of [...ui, ...sloane]) assert.ok(e.actor.id && e.action && e.target && e.at && 'before' in e && 'after' in e);
  const mech = events.filter((e) => e.target.id === 'recon:REC-CIP-MECHANICAL:2026-06');
  assert.ok(mech.some((e) => e.source === 'UI') && mech.some((e) => e.source === 'SLOANE'), 'both channels on one target');
  assert.ok(events.some((e) => e.action === 'UPDATE_CLOSE_TASK_STATUS') && events.some((e) => e.action === 'UPDATE_REPORT_DEFINITION'));
});

test('errors: an unknown route and a malformed body answer with the contract, never a stack', async () => {
  const c = new Client(); await c.signIn();
  const nf = await c.call('GET', '/api/work/nothing');
  assert.equal(nf.body['outcome'], 'NOT_FOUND');
  const bad = await c.call('POST', '/api/work/close/tasks/CT-001/status', { to: 'CERTIFIED', expectedVersion: 1, idempotencyKey: c.key() });
  assert.equal(bad.body['outcome'], 'VALIDATION_ERROR');
  assert.doesNotMatch(JSON.stringify(bad.body), /at \w+ \(|node:internal|\.ts:\d+/);
});
