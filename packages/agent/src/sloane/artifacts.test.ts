/**
 * Phase 4A — the two gates (server-authoritative Flux explanations and reconciliation balances) and Artifact
 * Intelligence (real .xlsx generation), through the REAL HTTP routes and Sloane on the deterministic adapter.
 * Every workbook is read back with exceljs and checked against the governed store it claims to present.
 * Run: npm run sloane:test
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { handleSloane, orchestrator as orch } from './routes.js';
import { WORK } from './store.js';
import { postSource, syncSourceFeed } from './sourcefeed.js';

let server: Server; let base = '';
const started = new Promise<void>((resolve) => { server = createServer((req, res) => { void handleSloane(req, res).then((h) => { if (!h) { res.writeHead(404); res.end(); } }); }); server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; resolve(); }); });
after(() => server.close());

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
class Client {
  cookie = ''; csrf = ''; sid = `art-${Math.random().toString(36).slice(2, 12)}`;
  async call(method: string, path: string, body?: unknown): Promise<{ status: number; body: J }> {
    await started;
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}), ...(this.csrf && method !== 'GET' ? { 'X-Korvyn-CSRF': this.csrf } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const sc = r.headers.get('set-cookie') ?? ''; if (sc) this.cookie = sc.split(';')[0]!;
    return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() as J : { bytes: (await r.arrayBuffer()).byteLength, disposition: r.headers.get('content-disposition') } };
  }
  async signIn(userId?: string) { if (userId) await this.call('POST', '/api/auth/dev/switch', { userId }); const me = await this.call('GET', '/api/auth/me'); this.csrf = me.body['csrfToken']; return me.body; }
  key() { return `k-${Math.random().toString(36).slice(2)}`; }
  async ask(q: string) { const r = await this.call('POST', '/api/sloane/turn', { sessionId: this.sid, request: q }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }
  async confirm(turn: J) { const planId = turn['actions']?.planId; assert.ok(planId, `no proposal: ${JSON.stringify(turn['notes'])}`); return (await this.call('POST', '/api/sloane/action', { sessionId: this.sid, planId, decision: 'confirm', requestId: this.key() })).body; }
}
const fact = (turn: J, key: string) => (turn['objects'] as J[]).flatMap((o) => o['facts'] as J[]).find((f) => f['key'] === key)?.['value'];
const wb = (turn: J): J => { const o = (turn['objects'] as J[]).find((x) => x['type'] === 'ExcelWorkbookPreview'); assert.ok(o, `no workbook: ${JSON.stringify(turn['notes'])}`); return o; };
async function generated(c: Client, turn: J) {
  const r = await c.confirm(turn);
  const res = r['results'][0];
  assert.equal(res.status, 'COMPLETED', res.message);
  await orch.artifacts.jobPromise(res.result.jobId);
  const g = orch.artifacts.generations(res.result.artifactId).find((x) => x.id === res.result.generationId)!;
  assert.equal(g.status, 'GENERATED', g.error ?? '');
  const path = join(orch.artifacts.storage, g.id, g.fileName);
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(path);
  return { g, book, path, artifactId: res.result.artifactId as string };
}
const headerRow = (ws: ExcelJS.Worksheet) => { for (let r = 1; r <= 12; r++) { const v = ws.getRow(r).getCell(1).value; if (typeof v === 'string' && /^(Posting Date|Account Number|Reconciliation|Account \/ Group|Entity)$/.test(v)) return r; } return -1; };
const cells = (ws: ExcelJS.Worksheet, r: number) => (ws.getRow(r).values as unknown[]).slice(1);

/* ================================================================================================
   GATE 1 — ONE Flux explanation record: the workspace, Sloane and the Artifact Engine read the same value and version
   ================================================================================================ */
test('GATE 1: a Flux explanation edited in the Flux UI is the value/version Sloane and the Artifact Engine read', async () => {
  const c = new Client(); await c.signIn();
  const before = await c.call('GET', '/api/work/flux/line/FS-CIP/explanation');
  assert.equal(before.status, 200); const e0 = before.body['explanation'];
  assert.equal(e0.explanationId, 'EXPL-15000-2026-06'); assert.equal(e0.status, 'APPROVED');
  const text = 'CIP rose on June capital additions at Ashburn and Frankfurt, net of the Q2 placed-in-service settlement to PP&E. Updated in the Flux workspace.';
  const w = await c.call('POST', '/api/work/flux/line/FS-CIP/explanation', { text, expectedVersion: e0.version, idempotencyKey: c.key() });
  assert.equal(w.body['outcome'], 'SUCCESS', JSON.stringify(w.body));
  const e1 = w.body['explanation'];
  assert.equal(e1.version, e0.version + 1); assert.equal(e1.status, 'DRAFT', 'an edit to an approved explanation returns it to draft');
  assert.equal(e1.history.at(-1).text, e0.text, 'the prior wording is kept');
  /* a stale screen cannot overwrite */
  const stale = await c.call('POST', '/api/work/flux/line/FS-CIP/explanation', { text: 'overwrite', expectedVersion: e0.version, idempotencyKey: c.key() });
  assert.equal(stale.body['outcome'], 'STALE_VERSION');
  /* the Flux UI's line read carries it */
  const line = await c.call('GET', '/api/work/flux/line/FS-CIP');
  assert.equal(line.body['explanation'].version, e1.version); assert.equal(line.body['explanation'].text, text);
  /* Sloane */
  const s = await c.ask('Show me the explanation on CIP for June');
  assert.equal(fact(s, 'explanationId'), 'EXPL-15000-2026-06'); assert.equal(fact(s, 'version'), e1.version); assert.equal(fact(s, 'text'), text);
  /* the Artifact Engine: the Flux tab cites (id, version) and reads the words from the record */
  const eng = orch.artifacts, actor = (await import('./tools.js')).serverActor();
  const d = eng.newDefinition({ sheets: ['FLUX'], accounts: ['15000'] });
  const m = eng.compose(actor, d);
  const cite = m.citations.find((x) => x.type === 'FLUX_EXPLANATION' && x.id === 'EXPL-15000-2026-06');
  assert.equal(cite?.version, e1.version);
  const row = [...m.sheets.find((x) => x.kind === 'FLUX')!.blocks[0]!.chunks()].flat().find((r) => String(r.cells[10]).startsWith('EXPL-15000-2026-06'))!;
  assert.equal(row.cells[7], text); assert.equal(row.cells[10], `EXPL-15000-2026-06 v${e1.version}`);
  /* the definition holds the citation, never the words */
  assert.ok(!JSON.stringify(d).includes('Ashburn and Frankfurt'));
});

/* ================================================================================================
   GATE 2 — ONE reconciliation balance: the Reconciliations UI, Sloane and the Artifact Engine read the same record
   ================================================================================================ */
test('GATE 2: a reconciliation balance recorded in the Reconciliations UI is the balance Sloane and the Artifact Engine cite', async () => {
  const c = new Client(); await c.signIn();
  const r0 = await c.call('GET', '/api/work/reconciliations/REC-MDH-10100');
  const b0 = r0.body['balance'];
  assert.ok(b0.available, JSON.stringify(b0)); assert.equal(b0.tieStatus, 'SOURCE_NOT_CONNECTED'); assert.equal(r0.body['canRecordStatement'], true);
  const stmt = Math.round((b0.glBalanceUsd - 1234.56) * 100) / 100;
  const w = await c.call('POST', '/api/work/reconciliations/REC-MDH-10100/statement', { amountUsd: stmt, reference: 'BANK-STMT-2026-06-MDH v1', expectedVersion: 0, idempotencyKey: c.key() });
  assert.equal(w.body['outcome'], 'SUCCESS', JSON.stringify(w.body));
  const b1 = w.body['balance'];
  assert.equal(b1.id, b0.id); assert.equal(b1.version, b0.version + 1, 'a moved value is a new balance version');
  assert.equal(b1.supportingBalanceUsd, stmt); assert.equal(b1.differenceUsd, 1234.56); assert.equal(b1.tieStatus, 'NOT_TIED');
  /* the UI read */
  const r1 = await c.call('GET', '/api/work/reconciliations/REC-MDH-10100');
  assert.deepEqual([r1.body['balance'].version, r1.body['balance'].differenceUsd, r1.body['balance'].supportingBalanceUsd], [b1.version, 1234.56, stmt]);
  /* Sloane */
  const s = await c.ask('Show me the Operating cash — MDH reconciliation');
  assert.equal(fact(s, 'balanceVersion'), `${b1.id} v${b1.version}`); assert.equal(fact(s, 'supportingBalance'), stmt); assert.equal(fact(s, 'tieStatus'), 'NOT_TIED');
  /* the Artifact Engine */
  const actor = (await import('./tools.js')).serverActor();
  const m = orch.artifacts.compose(actor, orch.artifacts.newDefinition({ sheets: ['RECONCILIATIONS'] }));
  const cite = m.citations.find((x) => x.type === 'RECONCILIATION_BALANCE' && x.id === b1.id);
  assert.equal(cite?.version, b1.version);
  const row = [...m.sheets.find((x) => x.kind === 'RECONCILIATIONS')!.blocks[0]!.chunks()].flat().find((r) => r.cells[1] === 'REC-MDH-10100')!;
  assert.deepEqual([row.cells[5], row.cells[6], row.cells[8], row.cells[13]], [b1.glBalanceUsd, stmt, 1234.56, `${b1.id} v${b1.version}`]);
  /* a line the server does not model is never estimated: it is excluded, with the reason */
  assert.ok(m.excluded.some((x) => x.label.includes('REC-CIP-ELECTRICAL')), 'the module-only CIP groups are not cited');
  assert.equal((await c.call('GET', '/api/work/reconciliations/REC-CIP-ELECTRICAL')).body['balance'].available, false);
});

/* ================================================================================================
   TEST A — FY26 Governed GL + TB + Tie-Out through Sloane, generated, read back
   ================================================================================================ */
test('TEST A: “Give me the FY26 governed GL” → TB tab → ties back to ERP → preview → download: a real, formatted, reconciling .xlsx', async () => {
  const c = new Client(); await c.signIn();
  const t1 = await c.ask('Give me the FY26 governed GL.');
  const w1 = wb(t1); assert.ok(w1, JSON.stringify(t1['notes']));
  assert.deepEqual(w1['workbook'].sheets.map((s: J) => s.name), ['Governed GL']);
  assert.equal(w1['workbook'].sheets[0].columns.length, 20);
  const t2 = await c.ask('Put the TB on another tab.');
  assert.deepEqual(wb(t2)['workbook'].sheets.map((s: J) => s.name), ['Governed GL', 'Trial Balance']);
  const t3 = await c.ask('Make sure it ties back to ERP.');
  const w3 = wb(t3)['workbook'];
  assert.deepEqual(w3.sheets.map((s: J) => s.name), ['Governed GL', 'Trial Balance', 'Tie-Out']);
  assert.equal(w3.tieOut.status, 'PARTIALLY_VALIDATED', 'NetSuite is stale and JD Edwards unavailable: never labelled TIED');
  assert.equal(w3.tieOut.differenceUsd, 0);
  assert.equal(w3.auditReady, false);
  const t4 = await c.ask('Show me what it will look like.');
  const w4 = wb(t4)['workbook'];
  assert.ok(w4.sheets[0].rows.length >= 10 && w4.sheets[0].rows.length <= 25, 'representative rows, not the population');
  const t5 = await c.ask('Download it.');
  const { book, g, artifactId } = await generated(c, t5);
  assert.equal(g.fileName, 'Korvyn_FY26_Governed_GL_Corporate_Consolidated.xlsx');
  assert.deepEqual(book.worksheets.map((s) => s.name), ['Governed GL', 'Trial Balance', 'Tie-Out']);
  const gl = book.getWorksheet('Governed GL')!, h = headerRow(gl);
  assert.equal(h, 6, 'compact title block: title · context · provenance · status · blank · header');
  assert.equal(String(gl.getRow(4).getCell(1).value), 'STATUS: PARTIALLY VALIDATED — NetSuite, JD Edwards could not be validated against a live source. Not audit-ready — see Tie-Out.');
  assert.equal((gl.views[0] as { state: string; ySplit: number }).state, 'frozen'); assert.equal((gl.views[0] as { ySplit: number }).ySplit, 6);
  assert.ok(gl.autoFilter, 'autofilter on the header');
  const pop = orch.artifacts.get(artifactId)!.pins.populations[0]!;
  const dataRows = gl.rowCount - h - 1; // minus the totals row
  assert.equal(dataRows, pop.rowCount, 'exactly the pinned population');
  const hdr = cells(gl, h) as string[];
  const net = hdr.indexOf('Net Amount') + 1, dr = hdr.indexOf('Debit') + 1, cr = hdr.indexOf('Credit') + 1;
  let s = 0, sd = 0, sc = 0; for (let r = h + 1; r < gl.rowCount; r++) { s += Number(gl.getRow(r).getCell(net).value ?? 0); sd += Number(gl.getRow(r).getCell(dr).value ?? 0); sc += Number(gl.getRow(r).getCell(cr).value ?? 0); }
  assert.ok(Math.abs(s - pop.netUsd) < 0.05 && Math.abs(sd - pop.debitUsd) < 0.05 && Math.abs(sc - pop.creditUsd) < 0.05, `rows foot to the pinned totals (${s} vs ${pop.netUsd})`);
  const tot = gl.getRow(gl.rowCount);
  assert.match(String(tot.getCell(1).value), /^Total — /); assert.ok(Math.abs(Number(tot.getCell(net).value) - pop.netUsd) < 0.01);
  assert.equal(gl.getRow(h + 1).getCell(net).numFmt, '#,##0.00_);(#,##0.00);"–"_);@_)', 'accounting format, negatives in parentheses, zero as a dash');
  assert.equal(gl.getRow(h + 1).getCell(1).numFmt, 'dd-mmm-yyyy'); assert.ok(gl.getRow(h + 1).getCell(1).value instanceof Date);
  assert.ok(tot.getCell(net).font?.bold, 'totals emphasised');
  const cf = (gl as unknown as { conditionalFormattings: { ref: string; rules: { formulae: string[]; style: { fill: { bgColor: { argb: string } } } }[] }[] }).conditionalFormattings;
  assert.ok(cf.length === 1 && /MOD\(ROW\(\)/.test(cf[0]!.rules[0]!.formulae[0]!) && cf[0]!.rules[0]!.style.fill.bgColor.argb === 'FFEEF4FB', 'light blue / white stripes, one rule');
  /* TB: foots, and agrees with the tie-out's governed TB */
  const tb = book.getWorksheet('Trial Balance')!, tt = tb.getRow(tb.rowCount);
  assert.ok(Math.abs(Number(tt.getCell(3).value) - Number(tt.getCell(4).value)) < 0.05, 'TB debits = credits');
  const to = book.getWorksheet('Tie-Out')!;
  const all = Array.from({ length: to.rowCount }, (_, i) => cells(to, i + 1).map(String).join(' | '));
  assert.ok(all.some((l) => /^Difference \(final governed vs Korvyn governed TB\) \| 0 \| Agrees/.test(l)), 'tie-out difference zero');
  assert.ok(all.some((l) => l.startsWith('Oracle ERP Cloud')) && all.some((l) => l.startsWith('SAP S/4HANA')) && all.some((l) => l.startsWith('NetSuite')) && all.some((l) => l.startsWith('JD Edwards')), 'one section per source ERP');
  assert.ok(all.some((l) => /^Governed data version \| CORE-EGL/.test(l)) && all.some((l) => /^Mapping version \| CORE-COA-1/.test(l)));
  /* download: permission re-checked, audited */
  const dl = await c.call('GET', `/api/work/artifacts/${artifactId}/generations/${g.id}/download`);
  assert.equal(dl.status, 200); assert.match(String(dl.body['disposition']), /Korvyn_FY26_Governed_GL_Corporate_Consolidated\.xlsx/);
  const acts = WORK.repos.audit.list({ target: artifactId }).map((e) => e.action);
  for (const a of ['ARTIFACT_CREATED', 'ARTIFACT_MODIFIED', 'ARTIFACT_GENERATED', 'ARTIFACT_DOWNLOADED']) assert.ok(acts.includes(a), `${a} audited (${acts.join(',')})`);
  assert.equal(orch.artifacts.get(artifactId)!.version, 3, 'three definition versions: GL, +TB, +Tie-Out');
});

/* ================================================================================================
   TEST B — refinement through Sloane; the workbook matches the definition
   ================================================================================================ */
test('TEST B: add source vendor, move project before vendor, sort largest first → the generated file matches the definition', async () => {
  const c = new Client(); await c.signIn();
  await c.ask('Give me the FY26 governed GL.');
  await c.ask('Add source vendor.');
  await c.ask('Move project before vendor.');
  const t = await c.ask('Sort largest first.');
  const def = wb(t)['draft'].definition;
  const cols = def.sheets[0].columns as string[];
  assert.ok(cols.indexOf('sourceVendor') >= 0 && cols.indexOf('project') < cols.indexOf('vendor'), cols.join(','));
  assert.equal(def.sheets[0].sort, 'amount_desc');
  const { book } = await generated(c, await c.ask('Generate the Excel.'));
  const gl = book.getWorksheet('Governed GL')!, h = headerRow(gl), hdr = cells(gl, h) as string[];
  assert.deepEqual(hdr, cols.map((k) => (k === 'vendor' ? 'Effective Vendor' : ({ postingDate: 'Posting Date', period: 'Period', journal: 'Journal', journalLine: 'Journal Line', accountNumber: 'Account Number', accountDescription: 'Account Description', entity: 'Entity', sourceVendor: 'Source Vendor', costCenter: 'Cost Center', project: 'Project', property: 'Property', debit: 'Debit', credit: 'Credit', netAmount: 'Net Amount', currency: 'Currency', localAmount: 'Local Amount', localCurrency: 'Local Currency', erp: 'ERP', erpReference: 'ERP Reference', recordType: 'Record Type' } as Record<string, string>)[k]!)), 'header = definition, and “Vendor” reads “Effective Vendor” beside its source form');
  const net = hdr.indexOf('Net Amount') + 1;
  const a = Math.abs(Number(gl.getRow(h + 1).getCell(net).value)), b = Math.abs(Number(gl.getRow(h + 2).getCell(net).value)), z = Math.abs(Number(gl.getRow(gl.rowCount - 1).getCell(net).value));
  assert.ok(a >= b && b >= z, 'largest first');
});

/* ================================================================================================
   TEST C — Siemens > $1M + Reconciliations + Flux: every tab server-authoritative
   ================================================================================================ */
test('TEST C: all Siemens FY26 transactions over $1M, with the related reconciliations and Flux explanations on separate tabs', async () => {
  const c = new Client(); await c.signIn();
  const t = await c.ask('Give me all Siemens FY26 transactions over $1M. Put the related reconciliations and Flux explanations on separate tabs.');
  const w = wb(t)['workbook'];
  assert.deepEqual(w.sheets.map((s: J) => s.name), ['Siemens GL', 'Reconciliations', 'Flux']);
  /* this book's largest Siemens line is under $1M: the preview says so and generation refuses an empty population */
  assert.equal(w.sheets[0].rowCount, 0);
  assert.deepEqual([w.sheets[1].rowCount, w.sheets[2].rowCount], [0, 0], 'an empty GL population relates to no reconciliation and no Flux line — never to all of them');
  const ask = await c.ask('Download it.');
  assert.match((ask['actions'].proposals[0].validation.errors as string[]).join(' '), /Siemens GL has no lines/, 'refused before confirmation');
  const empty = await c.confirm(ask);
  assert.notEqual(empty['results'][0].status, 'COMPLETED'); assert.match(empty['results'][0].message, /no lines/);
  const t2 = await c.ask('Only include transactions over $500K.');
  assert.equal(wb(t2)['workbook'].name, 'FY26 Siemens Energy GL over $500K', 'a derived name follows the definition');
  assert.equal(wb(t2)['workbook'].fileName, 'Korvyn_FY26_Siemens_Energy_GL_over_500K_Corporate_Consolidated.xlsx');
  const { book, artifactId } = await generated(c, await c.ask('Download it.'));
  const gl = book.getWorksheet('Siemens GL')!, h = headerRow(gl), hdr = cells(gl, h) as string[];
  const v = hdr.indexOf('Vendor') + 1, net = hdr.indexOf('Net Amount') + 1;
  assert.ok(gl.rowCount - h - 1 > 0);
  for (let r = h + 1; r < gl.rowCount; r++) { assert.equal(gl.getRow(r).getCell(v).value, 'Siemens Energy'); assert.ok(Math.abs(Number(gl.getRow(r).getCell(net).value)) >= 500_000); }
  /* reconciliations: each row is a cited server balance record, value for value */
  const rc = book.getWorksheet('Reconciliations')!, rh = headerRow(rc);
  let n = 0;
  for (let r = rh + 1; r <= rc.rowCount; r++) {
    const row = cells(rc, r); if (!row[1] || typeof row[13] !== 'string' || !String(row[13]).startsWith('RECONBAL-')) continue;
    const [id, ver] = String(row[13]).split(' v');
    const rec = WORK.repos.records.get<{ glBalanceUsd: number; differenceUsd: number | null }>('RECON_BALANCE', id!)!;
    assert.equal(rec.version, Number(ver)); assert.equal(Number(row[5]), rec.glBalanceUsd); n++;
  }
  assert.ok(n > 0, 'related reconciliations are cited');
  /* flux: each explanation is the governed record's words at the cited version */
  const fx = book.getWorksheet('Flux')!, fh = headerRow(fx);
  for (let r = fh + 1; r <= fx.rowCount; r++) {
    const row = cells(fx, r); if (!row[10]) continue;
    const [id, ver] = String(row[10]).split(' v');
    const rec = WORK.repos.records.get<{ text: string }>('FLUX_EXPLANATION', id!)!;
    assert.equal(rec.version, Number(ver)); assert.equal(row[7], rec.text);
  }
  assert.ok(orch.artifacts.get(artifactId)!.pins.sourceObjects.length > 0);
});

/* ================================================================================================
   TEST D — change the source data: the artifact is STALE, generation is refused, Refresh makes a new version,
   and the earlier file is untouched
   ================================================================================================ */
test('TEST D: a source change makes the artifact STALE; generation is refused; refresh is a new version; history is reproducible', async () => {
  const c = new Client(); await c.signIn();
  const actor = (await import('./tools.js')).serverActor(), eng = orch.artifacts;
  /* MDH only (SAP, available): the tie-out can be TIED */
  const cr = eng.create(actor, eng.newDefinition({ template: 'AUDIT_GL_PACKAGE', scopeId: 'MDH' }), { via: 'REPORTING' });
  assert.ok(cr.ok);
  const id = cr.ok ? cr.artifact.id : '';
  assert.equal(eng.view(actor, id)!.pins.tieOut?.status, 'TIED');
  const g1 = await c.call('POST', `/api/work/artifacts/${id}/generate`, { format: 'xlsx', idempotencyKey: c.key() });
  assert.equal(g1.body['outcome'], 'SUCCESS', JSON.stringify(g1.body));
  await eng.jobPromise(g1.body['job'].id);
  const first = eng.generations(id).find((x) => x.id === g1.body['generationId'])!;
  const firstPath = join(eng.storage, first.id, first.fileName), firstSha = createHash('sha256').update(readFileSync(firstPath)).digest('hex');
  assert.equal(firstSha, first.sha256);
  const b1 = new ExcelJS.Workbook(); await b1.xlsx.readFile(firstPath);
  assert.match(String(b1.getWorksheet('Governed GL')!.getRow(4).getCell(1).value), /^STATUS: TIED/);
  /* a late ERP posting to MDH that syncs */
  postSource(orch.gl, { entity: 'MDH', period: '2026-06', description: 'Late accrual — test', lines: [{ account: '60300', local: 42_000 }, { account: '21100', local: -42_000 }], synced: true }, 'user:test');
  const v = eng.view(actor, id)!;
  assert.equal(v.status, 'STALE'); assert.ok(v.staleReasons.some((r) => /Governed GL/.test(r)), v.staleReasons.join('; '));
  const g2 = await c.call('POST', `/api/work/artifacts/${id}/generate`, { format: 'xlsx', idempotencyKey: c.key() });
  assert.equal(g2.body['outcome'], 'STALE_VERSION'); assert.equal(g2.body['code'], 'STALE');
  const rf = await c.call('POST', `/api/work/artifacts/${id}/refresh`, { expectedVersion: 1, idempotencyKey: c.key() });
  assert.equal(rf.body['artifact'].version, 2); assert.equal(rf.body['artifact'].status, 'DRAFT');
  const g3 = await c.call('POST', `/api/work/artifacts/${id}/generate`, { format: 'xlsx', idempotencyKey: c.key() });
  assert.equal(g3.body['outcome'], 'SUCCESS'); await eng.jobPromise(g3.body['job'].id);
  assert.equal(createHash('sha256').update(readFileSync(firstPath)).digest('hex'), firstSha, 'the v1 file is untouched');
  assert.deepEqual(eng.generations(id).map((x) => x.artifactVersion).sort(), [1, 2]);
  /* a posting that is in the ERP but has NOT synced: the tie-out is NOT TIED, stated with the difference */
  postSource(orch.gl, { entity: 'MDH', period: '2026-06', description: 'Unsynced ERP posting — test', lines: [{ account: '60300', local: 5_000 }, { account: '21100', local: -5_000 }], synced: false }, 'user:test');
  const t = eng.tie.tieOut('MDH', '2026-06');
  assert.equal(t.status, 'NOT_TIED'); assert.ok(Math.abs(t.differenceUsd - 10_000) < 0.01, `difference ${t.differenceUsd}`);
  const v2 = eng.view(actor, id)!;
  assert.equal(v2.status, 'STALE', 'the tie-out moved');
  const g4 = eng.requestGeneration(actor, id, { channel: 'REPORTING', expectedVersion: 2 });
  assert.ok(!g4.ok && g4.code === 'STALE');
  syncSourceFeed(orch.gl, 'user:test');
  assert.equal(eng.tie.tieOut('MDH', '2026-06').status, 'TIED');
});

test('refinement: the user’s words win over a model’s structured reading (“add source vendor” is never “vendor”)', async () => {
  const eng = orch.artifacts;
  const d = eng.newDefinition({});
  const r = eng.refine(d, 'Add source vendor and project.', { addColumns: ['vendor'] });
  const cols = (r.definition.sheets[0] as { columns: string[] }).columns;
  assert.ok(cols.includes('sourceVendor') && cols.filter((c) => c === 'vendor').length === 1, cols.join(','));
  assert.ok(r.notes.some((n) => /Project is already in the GL tab/.test(n)));
  const r2 = eng.refine(d, 'Only include transactions over $500K. Remove the tie-out tab.', {});
  assert.equal((r2.definition.sheets[0] as { filter: { minAbsUsd?: number } }).filter.minAbsUsd, 500_000);
  assert.ok(r2.notes.some((n) => /Tie-Out is not a tab/.test(n)));
});

/* ================================================================================================
   SCALE, SECURITY, FAILURE
   ================================================================================================ */
test('scale: a GL population over the sheet row limit is partitioned into “Governed GL”, “Governed GL (2)”, … and every line is written once', async () => {
  const actor = (await import('./tools.js')).serverActor(), eng = orch.artifacts, keep = eng.maxRowsPerSheet;
  eng.maxRowsPerSheet = 400;
  try {
    const cr = eng.create(actor, eng.newDefinition({}), { via: 'REPORTING' }); assert.ok(cr.ok);
    const id = cr.ok ? cr.artifact.id : '';
    const g = eng.requestGeneration(actor, id, { channel: 'REPORTING', acknowledge: true }); assert.ok(g.ok);
    if (!g.ok) return;
    await g.job.done;
    const gen = eng.generations(id)[0]!, book = new ExcelJS.Workbook(); await book.xlsx.readFile(join(eng.storage, gen.id, gen.fileName));
    const names = book.worksheets.map((s) => s.name);
    assert.ok(names.length >= 3 && names[0] === 'Governed GL' && names[1] === 'Governed GL (2)', names.join(', '));
    const rows = book.worksheets.reduce((s, ws) => s + (ws.rowCount - 6 - (ws.name === names.at(-1) ? 1 : 0)), 0);
    assert.equal(rows, eng.get(id)!.pins.populations[0]!.rowCount);
  } finally { eng.maxRowsPerSheet = keep; }
});

test('security: an MDH-only accountant cannot build a group workbook; an auditor cannot generate; nobody downloads another user’s file', async () => {
  const mdh = new Client(); await mdh.signIn('user:mdh');
  /* an MDH accountant's "FY26 GL" is the MDH GL: their scope, never the group's */
  const own = wb(await mdh.ask('Give me the FY26 governed GL.'));
  assert.equal(own['scope'].id, 'MDH');
  const eng = orch.artifacts, mdhActor = (await import('./auth.js')).actorContext((await import('./auth.js')).DEV_DIRECTORY.find((u) => u.id === 'user:mdh')!, null, 'test');
  const denied = eng.create(mdhActor, eng.newDefinition({ scopeId: 'GROUP' }), { via: 'SLOANE' });
  assert.ok(!denied.ok && denied.code === 'PERMISSION_DENIED' && /outside your entity access/.test(denied.reason), JSON.stringify(denied));
  const aud = new Client(); await aud.signIn('user:auditor');
  const a = await aud.ask('Give me the FY26 governed GL.');
  assert.ok((a['objects'] ?? []).every((o: J) => o['type'] !== 'ExcelWorkbookPreview' || o['status'] === 'UNAVAILABLE'), 'no workbook for an auditor');
  const owner = new Client(); await owner.signIn();
  const { g, artifactId } = await generated(owner, await (async () => { await owner.ask('Give me the FY26 governed GL.'); return owner.ask('Download it.'); })());
  const other = new Client(); await other.signIn('user:skim');
  assert.equal((await other.call('GET', `/api/work/artifacts/${artifactId}/generations/${g.id}/download`)).status, 404);
  assert.equal((await other.call('GET', `/api/work/artifacts/${artifactId}`)).status, 404);
});

test('failure: a generation that cannot be written is FAILED with its reason; the definition is kept and generates again', async () => {
  const actor = (await import('./tools.js')).serverActor(), eng = orch.artifacts;
  const cr = eng.create(actor, eng.newDefinition({ scopeId: 'MDH' }), { via: 'REPORTING' }); assert.ok(cr.ok);
  const id = cr.ok ? cr.artifact.id : '';
  const keep = (eng as unknown as { storage: string }).storage;
  (eng as unknown as { storage: string }).storage = join(keep, 'x' + String.fromCharCode(0) + 'bad');
  const g = eng.requestGeneration(actor, id, { channel: 'REPORTING' }); assert.ok(g.ok);
  if (g.ok) await g.job.done;
  (eng as unknown as { storage: string }).storage = keep;
  const v = eng.view(actor, id)!;
  assert.equal(v.generations[0]!.status, 'FAILED'); assert.ok(v.generations[0]!.error);
  assert.equal(v.status, 'FAILED'); assert.ok(v.lastError); assert.equal(v.version, 1, 'a failure is not a new definition version');
  const g2 = eng.requestGeneration(actor, id, { channel: 'REPORTING' }); assert.ok(g2.ok);
  if (g2.ok) await g2.job.done;
  assert.equal(eng.generations(id)[0]!.status, 'GENERATED');
  assert.ok(existsSync(join(eng.storage, eng.generations(id)[0]!.id, eng.generations(id)[0]!.fileName)));
});
