/**
 * Phase 4B — generalized Artifact Intelligence: package types composed from the section library, NL refinement of
 * packages, reuse, validation, section preview, save / archive, job cancel and the storage interface — through the REAL
 * HTTP routes and Sloane on the deterministic adapter. Every generated workbook is read back with exceljs and checked
 * against the governed service it claims to present.
 * Run: npm run sloane:test
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { handleSloane, orchestrator as orch } from './routes.js';
import { WORK } from './store.js';
import { LocalArtifactStorage } from './artifacts/storage.js';
import { TEMPLATES, completeEntities } from './artifacts/sections.js';
import type { ArtifactType } from './artifacts/model.js';
import { serverActor } from './tools.js';

let server: Server; let base = '';
const started = new Promise<void>((resolve) => { server = createServer((req, res) => { void handleSloane(req, res).then((h) => { if (!h) { res.writeHead(404); res.end(); } }); }); server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; resolve(); }); });
after(() => server.close());

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
class Client {
  cookie = ''; csrf = ''; sid = `pkg-${Math.random().toString(36).slice(2, 12)}`;
  async call(method: string, path: string, body?: unknown): Promise<{ status: number; body: J }> {
    await started;
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}), ...(this.csrf && method !== 'GET' ? { 'X-Korvyn-CSRF': this.csrf } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const sc = r.headers.get('set-cookie') ?? ''; if (sc) this.cookie = sc.split(';')[0]!;
    return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() as J : { bytes: (await r.arrayBuffer()).byteLength } };
  }
  async signIn(userId?: string) { if (userId) await this.call('POST', '/api/auth/dev/switch', { userId }); const me = await this.call('GET', '/api/auth/me'); this.csrf = me.body['csrfToken']; return me.body; }
  key() { return `k-${Math.random().toString(36).slice(2)}`; }
  async ask(q: string) { const r = await this.call('POST', '/api/sloane/turn', { sessionId: this.sid, request: q }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }
  async confirm(turn: J) { const planId = turn['actions']?.planId; assert.ok(planId, `no proposal: ${JSON.stringify(turn['notes'])}`); return (await this.call('POST', '/api/sloane/action', { sessionId: this.sid, planId, decision: 'confirm', requestId: this.key() })).body; }
}
const wbOf = (turn: J): J => { const o = (turn['objects'] as J[]).find((x) => x['type'] === 'ExcelWorkbookPreview'); assert.ok(o, `no workbook: ${JSON.stringify(turn['notes'])}`); return o; };
const actor = serverActor();
async function generate(c: Client) {
  const turn = await c.ask('Download it.');
  const r = await c.confirm(turn);
  const res = r['results'][0];
  assert.equal(res.status, 'COMPLETED', res.message);
  await orch.artifacts.jobPromise(res.result.jobId);
  const g = orch.artifacts.generations(res.result.artifactId).find((x) => x.id === res.result.generationId)!;
  assert.equal(g.status, 'COMPLETED', g.error ?? '');
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(orch.artifacts.store.read(`${g.id}/${g.fileName}`));
  return { g, book, artifactId: res.result.artifactId as string };
}
/** the data rows of a sheet's first table, from its header row down */
function rowsOf(ws: ExcelJS.Worksheet, firstHeader: string) {
  let h = -1; for (let r = 1; r <= 15; r++) if (ws.getRow(r).getCell(1).value === firstHeader) { h = r; break; }
  assert.ok(h > 0, `${ws.name}: no "${firstHeader}" header`);
  const out: unknown[][] = [];
  for (let r = h + 1; r <= ws.rowCount; r++) { const v = (ws.getRow(r).values as unknown[]).slice(1); if (v.every((x) => x === null || x === undefined || x === '')) break; out.push(v); }
  return out;
}
const kvOf = (ws: ExcelJS.Worksheet) => { const m = new Map<string, unknown>(); ws.eachRow((row) => { const k = row.getCell(1).value; if (typeof k === 'string') m.set(k, row.getCell(2).value); }); return m; };

/* ================================================================================================
   A — CLOSE REVIEW PACKAGE: build, refine, preview a section, generate
   ================================================================================================ */
test('A: close review package — refinements change the definition; blockers are the governed ranking; the file matches', async () => {
  const c = new Client(); await c.signIn();
  const t0 = wbOf(await c.ask('Build the June close review package'));
  assert.equal(t0.workbook.type, 'CLOSE_REVIEW_PACKAGE');
  assert.deepEqual(t0.workbook.sheets.map((s: J) => s.name), ['Close Summary', 'Material Blockers', 'Reconciliations Not Tied', 'Unexplained Flux', 'Missing Support', 'Pending Review', 'Exceptions']);
  assert.equal(t0.title, 'Jun 2026 Close Review Package — workbook preview');
  const t1 = wbOf(await c.ask('Add GL detail for anything over $10M'));
  assert.ok(t1.workbook.sheets.some((s: J) => s.name === 'GL Over $10M' && s.rowCount > 0), 'a GL section behind the items over $10M');
  const missBefore = t0.workbook.sheets.find((s: J) => s.name === 'Missing Support').rowCount;
  assert.equal(t1.workbook.sheets.find((s: J) => s.name === 'Missing Support').rowCount, missBefore, 'a GL tab does not change what a close package’s Missing Support covers');
  await c.ask('Remove completed entities');
  await c.ask('Remove pending approvals');
  const t4 = wbOf(await c.ask('Put unreconciled accounts first'));
  assert.equal(t4.workbook.sheets[0].name, 'Reconciliations Not Tied');
  assert.ok(!t4.workbook.sheets.some((s: J) => s.name === 'Pending Review'));
  const sec = wbOf(await c.ask('Show me the blockers tab'));
  assert.equal(sec.workbook.focusSheet, 'Material Blockers', 'section-level preview');
  const { book, artifactId } = await generate(c);
  assert.deepEqual(book.worksheets.map((w) => w.name), ['Reconciliations Not Tied', 'Close Summary', 'Material Blockers', 'Unexplained Flux', 'Missing Support', 'Exceptions', 'GL Over $10M']);
  /* the ranking is the governed tool's, less the entities left out as complete */
  const env = orch.artifacts.env(actor);
  const done = completeEntities(env, '2026-06', env.data.scope('GROUP')!.entityIds);
  assert.ok(done.length >= 1, 'at least one entity is complete in the seeded book');
  const expected = orch.artifacts.controls.closeBlockers('2026-06', 'ALL').filter((b) => b.entity === 'GROUP' || !done.includes(b.entity)).map((b) => b.label);
  const got = rowsOf(book.getWorksheet('Material Blockers')!, 'Rank').map((r) => r[3]);
  assert.deepEqual(got, expected);
  const cs = kvOf(book.getWorksheet('Close Summary')!);
  assert.equal(cs.get('Close readiness'), `${orch.artifacts.controls.closeReadiness('2026-06', 'ALL').readinessPct}%`);
  assert.equal(cs.get('Entities left out as complete'), done.join(', '));
  /* every blocker row carries a trace back to its governed object */
  assert.ok(rowsOf(book.getWorksheet('Material Blockers')!, 'Rank').every((r) => typeof r[6] === 'string' && (r[6] as string).length > 0));
  const v = orch.artifacts.view(actor, artifactId)!;
  assert.equal(v.contract.type, 'CLOSE_REVIEW_PACKAGE'); assert.ok(v.contract.sections.length === 7); assert.equal(v.contract.validationStatus, v.validation.status);
});

/* ================================================================================================
   B — RECONCILIATION PACKAGE: server-authoritative values only
   ================================================================================================ */
test('B: reconciliation package cites the versioned balance record; a module reconciliation is marked not server-authoritative', async () => {
  const c = new Client(); await c.signIn();
  const def = orch.artifacts.controls.recDef('REC-MDH-20100')!;
  const bal = orch.artifacts.controls.reconBalance(def, '2026-06');
  assert.ok(bal.available);
  const w = wbOf(await c.ask('Create the June MDH trade payables reconciliation package'));
  assert.equal(w.workbook.type, 'RECONCILIATION_PACKAGE');
  assert.deepEqual(w.workbook.sheets.map((s: J) => s.name), ['Summary', 'Reconciliation', 'Reconciling Items', 'GL Detail', 'Support Index', 'Comments', 'Tie-Out']);
  const { book, artifactId } = await generate(c);
  const r = kvOf(book.getWorksheet('Reconciliation')!);
  assert.equal(r.get('Reconciliation ID'), 'REC-MDH-20100');
  assert.equal(r.get('GL balance (USD)'), bal.glBalanceUsd);
  assert.equal(r.get('Balance record'), `${bal.id} v${bal.version}`);
  const tie = kvOf(book.getWorksheet('Tie-Out')!);
  assert.equal(tie.get('Difference'), bal.differenceUsd);
  const a = orch.artifacts.get(artifactId)!;
  assert.ok(a.pins.sourceObjects.some((s) => s.type === 'RECONCILIATION_BALANCE' && s.id === bal.id && s.version === bal.version), 'the balance record is pinned');
  assert.ok(a.pins.sourceObjects.some((s) => s.type === 'EVIDENCE_RELATIONSHIPS' && s.id === 'recon:REC-MDH-20100:2026-06'), 'the evidence relationships are pinned');
  const gl = orch.artifacts.gl.lines.filter((l) => l.account === '20100' && l.entity === 'MDH' && l.period === '2026-06');
  assert.equal(a.pins.populations[0]!.rowCount, gl.length, 'GL Detail is the reconciliation’s population');

  const c2 = new Client(); await c2.signIn();
  const e = wbOf(await c2.ask('Create the June Electrical CIP reconciliation package'));
  assert.equal(e.workbook.validation.status, 'VALID_WITH_WARNINGS');
  assert.ok(e.workbook.validation.checks.some((x: J) => x.check === 'Reconciliation' && x.status === 'WARN' && /not server-authoritative/.test(x.detail)));
  assert.ok(e.workbook.validation.checks.some((x: J) => x.check === 'Population · GL Detail' && x.status === 'WARN'), 'an empty rule-based GL section is a warning, not a block');
  const eg = await generate(c2);
  const er = kvOf(eg.book.getWorksheet('Reconciliation')!);
  assert.match(String(er.get('Balance')), /^Not server-authoritative/);
  assert.ok(!er.has('GL balance (USD)'), 'no balance is written for a reconciliation the server does not model');
});

/* ================================================================================================
   C — VENDOR SUPPORT PACKAGE: coverage only where the evidence graph supports it
   ================================================================================================ */
test('C: vendor support package — coverage is computed from evidence references; an empty threshold is refused before confirmation', async () => {
  const c = new Client(); await c.signIn();
  const w = wbOf(await c.ask('Compile Siemens FY26 support'));
  assert.equal(w.workbook.type, 'SUPPORT_PACKAGE');
  const vendor = orch.artifacts.gl.vendors().find((v) => /siemens/i.test(v))!;
  assert.equal(w.title, `FY26 ${vendor} Support Package — workbook preview`);
  const { book } = await generate(c);
  const lines = orch.artifacts.gl.lines.filter((l) => l.vendor === vendor && l.account !== '20100' && l.period >= '2026-01' && l.period <= '2026-06');
  const full = lines.filter((l) => l.invoiceRef && (!l.approvalRequired || l.approvalRef) && (!l.project || l.poRef));
  const cov = kvOf(book.getWorksheet('Support Coverage')!);
  assert.equal(cov.get('AP-sourced lines (evidence measurable)'), lines.length);
  const pct = ((full.reduce((t, l) => t + Math.abs(l.usd), 0) / lines.reduce((t, l) => t + Math.abs(l.usd), 0)) * 100);
  assert.equal(cov.get('Support coverage'), `${(Math.round(full.reduce((t, l) => t + Math.abs(l.usd), 0) * 100) / 100 / (Math.round(lines.reduce((t, l) => t + Math.abs(l.usd), 0) * 100) / 100) * 100).toFixed(1)}%`);
  assert.ok(pct >= 0 && pct <= 100);
  assert.match(String(cov.get('Evidence source')), /references only; no document is connected/);
  /* the largest Siemens line is under $1M — a $1M threshold leaves nothing, and generation is refused before any confirm */
  const t = await c.ask('Only include transactions over $1M');
  assert.equal(wbOf(t).workbook.validation.status, 'BLOCKED');
  const d = await c.ask('Download it.');
  const p = (d['objects'] as J[]).find((o) => o['action'])?.['action'];
  assert.ok(p?.validation.errors.some((x: string) => /has no lines/.test(x)), JSON.stringify(p?.validation));
});

/* ================================================================================================
   D — AUDIT SUPPORT PACKAGE: never "audit-ready" unless validation supports it
   ================================================================================================ */
test('D: an audit package is named and labelled by what its tie-out supports', async () => {
  const c = new Client(); await c.signIn();
  const w = wbOf(await c.ask('Create FY26 audit-ready GL extract'));
  assert.equal(w.workbook.type, 'AUDIT_SUPPORT_PACKAGE');
  assert.equal(w.title, 'FY26 Audit GL Extract — workbook preview', 'Korvyn does not name it audit-ready');
  const tie = orch.artifacts.tie.tieOut('GROUP', '2026-06');
  assert.equal(w.workbook.auditReady, tie.status === 'TIED');
  if (tie.status !== 'TIED') assert.ok(w.workbook.validation.checks.some((x: J) => x.check === 'Tie-out' && x.status === 'WARN'));
  const named = wbOf(await c.ask('Call it FY26 audit-ready extract'));
  if (tie.status !== 'TIED') assert.ok(named.workbook.validation.checks.some((x: J) => x.check === 'Audit-ready claim' && x.status === 'WARN'), 'a user name claiming audit-ready is flagged');
  assert.deepEqual(w.workbook.sheets.map((s: J) => s.name), ['Governed GL', 'Trial Balance', 'Tie-Out', 'Population Metadata', 'Source References', 'Evidence Index']);
});

/* ================================================================================================
   E — MONTHLY FINANCIAL PACKAGE: the governed statements, month by month
   ================================================================================================ */
test('E: monthly financials — the income statement is the governed statement for each month', async () => {
  const c = new Client(); await c.signIn();
  const w = wbOf(await c.ask('Create Jan-Jun monthly financials with variance analysis'));
  assert.equal(w.workbook.type, 'FINANCIAL_REPORT_PACKAGE');
  assert.equal(w.title, 'Jan 2026 – Jun 2026 Monthly Financial Package — workbook preview');
  const { book } = await generate(c);
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
  const is = orch.artifacts.data.incomeStatement('GROUP', months);
  const ws = book.getWorksheet('Income Statement')!;
  const niRow = is.rows.find((r) => r.kind === 'total')!;
  let found = false;
  ws.eachRow((row) => { if (String(row.getCell(1).value).trim() === niRow.label) { found = true; for (let i = 0; i < 6; i++) assert.equal(row.getCell(2 + i).value, Math.round(niRow.values[i]! * 100) / 100); } });
  assert.ok(found, `${niRow.label} row present`);
  assert.ok(book.getWorksheet('Balance Sheet') && book.getWorksheet('MoM Analysis'));
});

/* ================================================================================================
   REUSE — a new package, never an overwrite; an unclosed month is refused
   ================================================================================================ */
test('reuse: "Create May using this package" is a new artifact; the source is unchanged; July is refused', async () => {
  const c = new Client(); await c.signIn();
  const jun = wbOf(await c.ask('Build a June Flux package for CIP'));
  const srcId = jun.refs.artifactId as string; const src = orch.artifacts.get(srcId)!;
  const may = wbOf(await c.ask('Create May using this package'));
  assert.notEqual(may.refs.artifactId, srcId);
  const b = orch.artifacts.get(may.refs.artifactId)!;
  assert.equal(b.definition.periodEnd, '2026-05'); assert.deepEqual(b.definition.derivedFrom, { artifactId: srcId, version: src.version, name: src.name });
  assert.equal(b.name, 'May 2026 Construction in progress Flux Package');
  const again = orch.artifacts.get(srcId)!;
  assert.equal(again.version, src.version); assert.equal(again.definition.periodEnd, '2026-06');
  assert.ok(WORK.repos.audit.list().some((e) => e.action === 'ARTIFACT_DERIVED' && e.target.id === b.id));
  /* July has not closed: the request is refused by name, never replaced with another month */
  const jul = await c.ask('Create July using the June package');
  const o = (jul['objects'] as J[]).find((x) => x['type'] === 'ExcelWorkbookPreview');
  const why = o ? o.unavailable?.reason ?? '' : (jul['notes'] as string[]).join(' ');
  assert.ok(!o || o.status === 'UNAVAILABLE'); assert.match(why, /Jul(y)? 2026|not in the governed|not governed|latest/i, why);
  assert.equal(orch.artifacts.list(actor).filter((x) => x.derivedFrom === srcId).length, 1, 'no second derived package was created');
});

/* ================================================================================================
   VALIDATION + EVIDENCE PINS — a relationship attached after definition makes the package STALE
   ================================================================================================ */
test('validation: an evidence relationship added after the package was defined makes it STALE; generation is refused', async () => {
  const eng = orch.artifacts;
  const cr = eng.create(actor, eng.newPackage({ type: 'RECONCILIATION_PACKAGE', focus: { reconciliationId: 'REC-MDH-21200' }, scopeId: 'MDH' }), { via: 'REPORTING' });
  assert.ok(cr.ok);
  const id = cr.artifact.id;
  assert.equal(eng.view(actor, id)!.stale, false);
  WORK.relate({ type: 'RECONCILIATION_SUPPORTS', from: 'WP-TEST-DEBT-SCHED', to: 'recon:REC-MDH-21200:2026-06', kind: 'WORKPAPER', label: 'Debt interest schedule (test)', sourceSystem: 'Korvyn', via: 'UI', executionId: null }, { id: 'user:mgiri', name: 'Mitra Giri' } as never, null);
  const v = eng.view(actor, id)!;
  assert.equal(v.stale, true); assert.equal(v.status, 'STALE');
  assert.ok(v.staleReasons.some((r) => /recon:REC-MDH-21200:2026-06/.test(r)), v.staleReasons.join('; '));
  assert.ok(v.validation.checks.some((x) => x.check === 'Stale' && x.status === 'FAIL'));
  const g = eng.requestGeneration(actor, id, { channel: 'REPORTING' });
  assert.equal(g.ok, false); assert.equal((g as { code: string }).code, 'STALE');
});

/* ================================================================================================
   JOBS — QUEUED → VALIDATING → GENERATING → COMPLETED | FAILED | CANCELLED
   ================================================================================================ */
test('jobs: a cancelled job keeps no file and returns the package to its prior status; a finished job cannot be cancelled', async () => {
  const eng = orch.artifacts;
  const cr = eng.create(actor, eng.newPackage({ type: 'CLOSE_REVIEW_PACKAGE' }), { via: 'REPORTING' }); assert.ok(cr.ok);
  const id = cr.artifact.id;
  const r = eng.requestGeneration(actor, id, { channel: 'REPORTING' }); assert.ok(r.ok);
  assert.equal(r.job.status, 'QUEUED');
  const c = eng.cancel(actor, r.job.id); assert.ok(c.ok);
  await eng.jobPromise(r.job.id);
  assert.equal(eng.job(r.job.id)!.status, 'CANCELLED');
  const g = eng.generations(id).find((x) => x.id === r.generationId)!;
  assert.equal(g.status, 'CANCELLED'); assert.equal(g.downloadUrl, null);
  assert.equal(eng.store.exists(`${g.id}/${g.fileName}`), false, 'no partial file is kept');
  assert.equal(eng.get(id)!.status, 'DRAFT');
  assert.ok(WORK.repos.audit.list().some((e) => e.action === 'ARTIFACT_GENERATION_CANCELLED' && e.target.id === id));
  const r2 = eng.requestGeneration(actor, id, { channel: 'REPORTING' }); assert.ok(r2.ok);
  await eng.jobPromise(r2.job.id);
  assert.equal(eng.job(r2.job.id)!.status, 'COMPLETED');
  assert.equal(eng.store.exists(`${r2.generationId}/${r2.fileName}`), true);
  const late = eng.cancel(actor, r2.job.id); assert.equal(late.ok, false);
});

/* ================================================================================================
   SAVE / ARCHIVE — confirmed lifecycle actions through Sloane
   ================================================================================================ */
test('save / archive through Sloane are confirmed actions; an archived package cannot be generated until restored', async () => {
  const c = new Client(); await c.signIn();
  const w = wbOf(await c.ask('Create Jan-Jun monthly financials with variance analysis'));
  const id = w.refs.artifactId as string;
  const s = await c.ask('Save it.');
  assert.equal(orch.artifacts.get(id)!.status, 'DRAFT', 'nothing is written before confirmation');
  const r = await c.confirm(s); assert.equal(r['results'][0].status, 'COMPLETED', r['results'][0].message);
  assert.equal(orch.artifacts.get(id)!.status, 'SAVED');
  const a = await c.confirm(await c.ask('Archive it.')); assert.equal(a['results'][0].status, 'COMPLETED');
  assert.equal(orch.artifacts.get(id)!.status, 'ARCHIVED');
  const g = orch.artifacts.requestGeneration(actor, id, { channel: 'REPORTING' });
  assert.equal(g.ok, false); assert.match((g as { reason: string }).reason, /archived/);
  const d = await c.ask('Download it.');
  assert.ok((d['objects'] as J[]).find((o) => o['action'])?.['action'].validation.errors.some((x: string) => /archived/.test(x)));
  const back = await c.confirm(await c.ask('Restore it from archive')); assert.equal(back['results'][0].status, 'COMPLETED');
  assert.equal(orch.artifacts.get(id)!.status, 'SAVED');
  for (const x of ['ARTIFACT_SAVED', 'ARTIFACT_ARCHIVED']) assert.ok(WORK.repos.audit.list().some((e) => e.action === x && e.target.id === id), x);
});

/* ================================================================================================
   STORAGE — files addressed by key through one interface
   ================================================================================================ */
test('storage: a key never escapes the root; the engine reads files only through the storage interface', () => {
  const st = new LocalArtifactStorage(mkdtempSync(join(tmpdir(), 'korvyn-st-')));
  assert.throws(() => st.locate('../outside.xlsx'), /escapes the root/);
  const p = st.locate('GEN-1/file.xlsx'); assert.ok(p.startsWith(st.root));
  assert.equal(orch.artifacts.store.kind, 'LOCAL');
});

/* ================================================================================================
   EVERY TEMPLATE composes; every traced row carries a trace
   ================================================================================================ */
test('every package type composes from the section library, and every traced row carries a governed reference', () => {
  const eng = orch.artifacts;
  const focus: Partial<Record<ArtifactType, J>> = { RECONCILIATION_PACKAGE: { reconciliationId: 'REC-MDH-20100' }, FLUX_PACKAGE: { account: '15000' }, SUPPORT_PACKAGE: { vendor: eng.gl.vendors()[0] } };
  for (const type of Object.keys(TEMPLATES) as ArtifactType[]) {
    const d = eng.newPackage({ type, focus: focus[type] ?? {}, scopeId: type === 'RECONCILIATION_PACKAGE' ? 'MDH' : 'GROUP' });
    const m = eng.compose(actor, d);
    assert.equal(m.sheets.length >= d.sheets.length, true, type);
    for (const s of m.sheets) for (const b of s.blocks) {
      const t = b.columns.findIndex((col) => col.key === 'trace');
      if (t < 0) continue;
      for (const ch of b.chunks()) for (const r of ch) if (r.style !== 'total') assert.ok(typeof r.cells[t] === 'string' && (r.cells[t] as string).length > 0, `${type} · ${s.name}: a row without a trace`);
    }
  }
});

/* ================================================================================================
   HTTP — the Reporting surface uses the same engine: status, restore, derive, cancel, section preview
   ================================================================================================ */
test('HTTP: save / archive / restore / derive / cancel / section preview through /api/work/artifacts', async () => {
  const c = new Client(); await c.signIn();
  const eng = orch.artifacts;
  const cr = eng.create(actor, eng.newPackage({ type: 'CLOSE_REVIEW_PACKAGE', periodEnd: '2026-06' }), { via: 'REPORTING' }); assert.ok(cr.ok);
  const id = cr.artifact.id;
  const sec = await c.call('GET', `/api/work/artifacts/${id}?section=blockers`);
  assert.equal(sec.body['outcome'], 'SUCCESS'); assert.equal(sec.body['preview'].focusSheet, 'Material Blockers'); assert.equal(sec.body['preview'].type, 'CLOSE_REVIEW_PACKAGE');
  const noKey = await c.call('POST', `/api/work/artifacts/${id}/status`, { status: 'SAVED' });
  assert.equal(noKey.body['outcome'], 'VALIDATION_ERROR');
  const k = c.key();
  const s1 = await c.call('POST', `/api/work/artifacts/${id}/status`, { status: 'SAVED', idempotencyKey: k });
  assert.equal(s1.body['outcome'], 'SUCCESS'); assert.equal(s1.body['artifact'].status, 'SAVED');
  const replay = await c.call('POST', `/api/work/artifacts/${id}/status`, { status: 'SAVED', idempotencyKey: k });
  assert.equal(replay.body['artifact'].status, 'SAVED');
  assert.equal(WORK.repos.audit.list().filter((e) => e.action === 'ARTIFACT_SAVED' && e.target.id === id).length, 1, 'an idempotent replay writes once');
  const dv = await c.call('POST', `/api/work/artifacts/${id}/derive`, { periodEnd: '2026-05', idempotencyKey: c.key() });
  assert.equal(dv.body['outcome'], 'SUCCESS', JSON.stringify(dv.body)); assert.equal(dv.body['artifact'].definition.periodEnd, '2026-05'); assert.equal(dv.body['artifact'].derivedFrom.artifactId, id);
  const bad = await c.call('POST', `/api/work/artifacts/${id}/derive`, { periodEnd: '2026-08', idempotencyKey: c.key() });
  assert.equal(bad.body['outcome'], 'VALIDATION_ERROR'); assert.match(bad.body['reason'] ?? bad.body['message'] ?? JSON.stringify(bad.body), /not in the governed ledger/);
  /* a refined version, then the first definition restored as v3 */
  const next = eng.refine(cr.artifact.definition, 'Remove pending approvals').definition;
  const m2 = eng.modify(actor, id, next, 'Removed Pending Review', { via: 'REPORTING' }); assert.ok(m2.ok);
  const rs = await c.call('POST', `/api/work/artifacts/${id}/restore`, { version: 1, idempotencyKey: c.key() });
  assert.equal(rs.body['outcome'], 'SUCCESS'); assert.equal(rs.body['artifact'].version, 3);
  assert.ok(rs.body['artifact'].definition.sheets.some((x: J) => x.kind === 'PENDING_REVIEW'), 'v1’s sections are back');
  const gen = eng.requestGeneration(actor, id, { channel: 'REPORTING' }); assert.ok(gen.ok);
  const cc = await c.call('POST', `/api/work/artifacts/jobs/${gen.job.id}/cancel`, {});
  assert.equal(cc.body['outcome'], 'SUCCESS');
  await eng.jobPromise(gen.job.id);
  const j = await c.call('GET', `/api/work/artifacts/jobs/${gen.job.id}`);
  assert.equal(j.body['job'].status, 'CANCELLED');
  const auditor = new Client(); await auditor.signIn('user:auditor');
  const denied = await auditor.call('POST', `/api/work/artifacts/${id}/status`, { status: 'ARCHIVED', idempotencyKey: auditor.key() });
  assert.equal(denied.body['outcome'], 'PERMISSION_DENIED');
});
