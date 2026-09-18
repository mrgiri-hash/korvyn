/**
 * Phase 5A — Audit / PBC intelligence: request intake (natural language, manual, CSV, XLSX, PDF), interpretation,
 * the governed population and its tie-out, selection matching, evidence and support gaps, the PBC package, staleness,
 * permissions and the audit trail — through the REAL HTTP routes and Sloane on the deterministic adapter. Every
 * generated package is read back with exceljs.
 * Run: npm run sloane:test
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { handleSloane, orchestrator as orch } from './routes.js';
import { WORK } from './store.js';
import { parseUpload } from './audit/pbc.js';

let server: Server; let base = '';
const started = new Promise<void>((resolve) => { server = createServer((req, res) => { void handleSloane(req, res).then((h) => { if (!h) { res.writeHead(404); res.end(); } }); }); server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; resolve(); }); });
after(() => server.close());
(orch.artifacts as unknown as { storage: string }).storage = mkdtempSync(join(tmpdir(), 'korvyn-5a-'));

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
class Client {
  cookie = ''; csrf = ''; sid = `pbc-${Math.random().toString(36).slice(2, 12)}`;
  async call(method: string, path: string, body?: unknown): Promise<{ status: number; body: J }> {
    await started;
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}), ...(this.csrf && method !== 'GET' ? { 'X-Korvyn-CSRF': this.csrf } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const sc = r.headers.get('set-cookie') ?? ''; if (sc) this.cookie = sc.split(';')[0]!;
    return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() as J : {} };
  }
  async signIn(userId?: string) { if (userId) await this.call('POST', '/api/auth/dev/switch', { userId }); const me = await this.call('GET', '/api/auth/me'); this.csrf = me.body['csrfToken']; return me.body; }
  key() { return `k-${Math.random().toString(36).slice(2)}`; }
  async ask(q: string) { const r = await this.call('POST', '/api/sloane/turn', { sessionId: this.sid, request: q }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }
  async confirm(turn: J) { const planId = turn['actions']?.planId; assert.ok(planId, `no proposal: ${JSON.stringify(turn['notes'])}`); return (await this.call('POST', '/api/sloane/action', { sessionId: this.sid, planId, decision: 'confirm', requestId: this.key() })).body; }
}
const objOf = (turn: J, type: string): J => { const o = (turn['objects'] as J[]).find((x) => x['type'] === type); assert.ok(o, `no ${type}: ${JSON.stringify((turn['objects'] as J[]).map((x) => x['type']))} ${JSON.stringify(turn['notes'])}`); return o; };
const fact = (o: J, key: string) => (o['facts'] as J[]).find((f) => f['key'] === key);
const toolsOf = async (c: Client, turn: J) => { const t = await c.call('GET', `/api/sloane/trace/${turn['traceId']}`); return (t.body['toolsExecuted'] as J[] ?? []).map((x) => x['tool']); };
const FIXTURE = new URL('./audit/fixtures/pbc27-fixed-asset-additions.csv', import.meta.url);
const CIP_OVER_1M = orch.gl.lines.filter((l) => l.group === '15000' && l.usd > 0 && /Capital expenditure/.test(l.description));

/* ================================================================================================
   A–F — the live flow, deterministically: interpret → population → tie-out → gaps → GL → package → generate
   ================================================================================================ */
test('A–F: an NL request becomes a governed population, selections, gaps and a PBC package; completed selections generate', async () => {
  const c = new Client(); await c.signIn();
  const tA = await c.ask('Give me FY26 CIP additions over $1M with invoices, POs, approvals and reconciliation support.');
  assert.deepEqual(await toolsOf(c, tA), ['buildPBCRequest']);
  const w = objOf(tA, 'PBCRequest'), p = w['pbc'];
  /* interpretation: the user's words, resolved against the governed catalogues */
  assert.equal(p.requirement.object, 'Construction in progress (15000)');
  assert.equal(p.requirement.threshold, 'over $1.00M');
  assert.equal(p.requirement.window, 'Jan 2026 – Jun 2026');
  for (const e of ['Invoice', 'Purchase order', 'Approval', 'Reconciliation', 'ERP source transaction']) assert.ok(p.requirement.evidence.includes(e), e);
  /* population: exactly the governed CIP additions over $1M, from the one ledger */
  const over = CIP_OVER_1M.filter((l) => l.usd >= 1_000_000);
  assert.equal(p.population.rows, over.length);
  assert.equal(p.population.rows, 15);
  /* tie-out: population + below the threshold = gross additions, to the cent; source bridge honest about JDE / NetSuite */
  const v = orch.artifacts.pbc!.evaluate(p.id, 'ALL')!;
  assert.ok(Math.abs(v.tie!.populationUsd + v.tie!.belowThresholdUsd - v.tie!.grossAdditionsUsd) < 0.01);
  assert.ok(Math.abs(v.tie!.populationUsd - over.reduce((t, l) => t + l.usd, 0)) < 0.01);
  assert.equal(v.tie!.status, 'PARTIALLY_VALIDATED');
  /* matching and gaps: every selection matched; the real missing invoices / approvals / ambiguous POs are stated */
  assert.equal(v.matching.MATCHED, 15);
  const gapOn = (j: string, req: string) => v.gaps.some((g) => g.transactionId?.startsWith(j) && g.requirement === req && g.status === 'OPEN');
  for (const j of ['JE-000332', 'JE-000408', 'JE-000504']) assert.ok(gapOn(j, 'INVOICE'), `${j} invoice`);
  for (const j of ['JE-000233', 'JE-000567']) assert.ok(gapOn(j, 'APPROVAL'), `${j} approval`);
  assert.ok(v.gaps.some((g) => g.kind === 'Ambiguous PO'));
  assert.ok(v.gaps.some((g) => g.kind === 'Source extract stale' && g.transactionId?.startsWith('JE-000428')), 'NetSuite stale → partial source');
  assert.ok(v.gaps.some((g) => g.requirement === 'SOURCE_TRANSACTION' && /unavailable/i.test(g.kind)), 'JDE unavailable');
  /* reconciliation support is ACCOUNT-level: one gap per reconciliation, never one per selection */
  const recGaps = v.gaps.filter((g) => g.requirement === 'RECONCILIATION');
  assert.ok(recGaps.length >= 1 && recGaps.length <= 4, `${recGaps.length} reconciliation gaps`);
  assert.ok(recGaps.every((g) => /affects selection/.test(g.note ?? '')));
  assert.equal(v.coverage.full, 3);
  /* the package draft exists over the request */
  const pkg = objOf(tA, 'ExcelWorkbookPreview');
  assert.equal(pkg.workbook.type, 'PBC_PACKAGE');
  assert.deepEqual(pkg.workbook.sheets.map((s: J) => s.name), ['PBC Summary', 'Population', 'Selections', 'GL Detail', 'Evidence Manifest', 'Exceptions']);
  assert.equal(orch.artifacts.pbc!.get(p.id)!.packageArtifactId, pkg.refs.artifactId);

  const tB = await c.ask('Which selections are missing evidence?');
  assert.deepEqual(await toolsOf(c, tB), ['getPBCSupportGaps']);
  const g = objOf(tB, 'PBCSupportGaps');
  assert.equal(g.pbc.selectionCount, 12, 'the 12 selections with their own gaps');

  const tC = await c.ask('Show me the underlying GL for those selections.');
  assert.deepEqual(await toolsOf(c, tC), ['getPBCSelectionGL']);
  const gl = objOf(tC, 'GovernedPopulation');
  assert.equal(fact(gl, 'lineCount')!.value, 12);

  const tD = await c.ask('Add the TB tie-out.');
  assert.ok(objOf(tD, 'ExcelWorkbookPreview').workbook.sheets.some((s: J) => s.name === 'TB Tie-Out'));
  const tE = await c.ask('Include the related reconciliations and Flux explanations.');
  const names = objOf(tE, 'ExcelWorkbookPreview').workbook.sheets.map((s: J) => s.name);
  assert.ok(names.includes('Reconciliations') && names.includes('Flux Explanations'), names.join(', '));

  const tF = await c.ask('Generate the completed selections as an Excel package.');
  assert.deepEqual(await toolsOf(c, tF), ['modifyExcelArtifact', 'proposeGenerateExcelArtifact']);
  const r = await c.confirm(tF);
  const res = r['results'][0];
  assert.equal(res.status, 'COMPLETED', res.message);
  await orch.artifacts.jobPromise(res.result.jobId);
  const gen = orch.artifacts.generations(res.result.artifactId).find((x) => x.id === res.result.generationId)!;
  assert.equal(gen.status, 'COMPLETED', gen.error ?? '');
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(orch.artifacts.store.read(`${gen.id}/${gen.fileName}`));
  assert.deepEqual(book.worksheets.map((x) => x.name), ['PBC Summary', 'Population', 'Selections', 'GL Detail', 'Evidence Manifest', 'Exceptions', 'TB Tie-Out', 'Reconciliations', 'Flux Explanations']);
  /* only the fully supported selections — and the GL detail is exactly their lines */
  const selWs = book.getWorksheet('Selections')!;
  let hdr = 0; selWs.eachRow((row, i) => { if (!hdr && row.getCell(1).value === 'Sel #') hdr = i; });
  const sels: number[] = []; for (let i = hdr + 1; i <= selWs.rowCount; i++) { const n = selWs.getRow(i).getCell(1).value; if (typeof n === 'number') sels.push(n); }
  assert.equal(sels.length, 3);
  const full = v.selections.filter((x) => x.coverage === 'FULL').map((x) => x.no).sort((a, b) => a - b);
  assert.deepEqual(sels.sort((a, b) => a - b), full);
  /* the request records its package generation (without a new request version) */
  const after = orch.artifacts.pbc!.get(p.id)!;
  assert.equal(after.lifecycle, 'GENERATED');
  assert.equal(after.version, v.version, 'generation is an operational state, not a new request version');
  /* audit trail */
  const acts = WORK.repos.audit.list({ target: p.id }).map((e) => e.action);
  for (const a of ['PBC_REQUEST_CREATED', 'PBC_POPULATION_GENERATED', 'PBC_SELECTIONS_MATCHED', 'PBC_PACKAGE_GENERATED']) assert.ok(acts.includes(a), a);
});

/* ================================================================================================
   UPLOAD — the PBC #27 fixture: every match status, stated honestly; XLSX reads the same; PDF needs review
   ================================================================================================ */
test('upload: PBC #27 — journal, invoice, ambiguous amount, missing, partial and source-unavailable selections', async () => {
  const c = new Client(); await c.signIn();
  const content = readFileSync(FIXTURE).toString('base64');
  const up = await c.call('POST', '/api/work/pbc/upload', { fileName: 'pbc27-fixed-asset-additions.csv', content, idempotencyKey: c.key() });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(up.body['pbcNumber'], 'PBC #27'); assert.equal(up.body['intake'], 'PARSED'); assert.equal(up.body['rows'], 8);
  const id = up.body['id'] as string;
  const w = (await c.call('GET', `/api/work/pbc/${id}`)).body['pbc'];
  assert.equal(w.title, 'Fixed asset additions testing');
  assert.equal(w.requirement.object, 'Construction in progress (15000)');
  const by = new Map<number, J>(w.selections.map((s: J) => [s.no, s]));
  assert.equal(by.get(1)!.status, 'MATCHED'); assert.equal(by.get(1)!.key, 'JE-000156#1');
  assert.equal(by.get(2)!.status, 'MATCHED'); assert.equal(by.get(2)!.key, 'JE-000116#1');
  assert.equal(by.get(3)!.status, 'MULTIPLE_MATCHES'); assert.ok(by.get(3)!.candidates.length >= 2, 'candidates shown, none chosen');
  assert.equal(by.get(4)!.status, 'NOT_FOUND');
  assert.equal(by.get(5)!.status, 'PARTIAL_MATCH'); assert.match(by.get(5)!.reason, /amount differs/);
  assert.equal(by.get(6)!.status, 'SOURCE_UNAVAILABLE'); assert.match(by.get(6)!.reason, /JD Edwards/);
  assert.match(by.get(7)!.missing, /Missing invoice/);
  assert.match(by.get(8)!.missing, /Missing approval/);
  assert.equal(w.status, 'MATCHING');

  /* a person resolves the ambiguous selection: a new version; Korvyn never chose */
  const before = w.version, cand = by.get(3)!.candidates[0].key;
  const rs = await c.call('POST', `/api/work/pbc/${id}/selections/${by.get(3)!.id}/resolve`, { transaction: cand, note: 'Agreed to the client schedule', expectedVersion: before, idempotencyKey: c.key() });
  assert.equal(rs.status, 201, JSON.stringify(rs.body));
  const w2 = (await c.call('GET', `/api/work/pbc/${id}`)).body['pbc'];
  assert.ok(w2.version > before);
  assert.equal(w2.selections.find((s: J) => s.no === 3).status, 'MATCHED');
  /* a stale expected version is refused */
  const stale = await c.call('POST', `/api/work/pbc/${id}/refresh`, { expectedVersion: before, idempotencyKey: c.key() });
  assert.equal(stale.status, 409); assert.equal(stale.body['outcome'], 'STALE_VERSION');

  /* link an invoice reference to the missing-invoice gap on selection 7: the gap closes BY THE EVIDENCE */
  const gap = w2.gaps.find((g: J) => g.selection === 7 && g.requirement === 'INVOICE');
  assert.ok(gap, 'selection 7 invoice gap');
  const ln = await c.call('POST', `/api/work/pbc/${id}/gaps/${gap.id}/link-evidence`, { reference: 'INV-SAP-900504', idempotencyKey: c.key() });
  assert.equal(ln.status, 201, JSON.stringify(ln.body));
  const w3 = (await c.call('GET', `/api/work/pbc/${id}`)).body['pbc'];
  assert.ok(!w3.gaps.some((g: J) => g.selection === 7 && g.requirement === 'INVOICE'), 'invoice gap resolved');
  assert.ok(w3.selections.find((s: J) => s.no === 7).evidence.some((e: J) => e.type === 'Invoice' && e.status === 'AVAILABLE' && e.reference === 'INV-SAP-900504'));
  /* waive requires a reason */
  const g8 = w3.gaps.find((g: J) => g.selection === 8 && g.requirement === 'APPROVAL');
  assert.equal((await c.call('POST', `/api/work/pbc/${id}/gaps/${g8.id}/resolve`, { status: 'WAIVED', note: '', idempotencyKey: c.key() })).status, 400);
  assert.equal((await c.call('POST', `/api/work/pbc/${id}/gaps/${g8.id}/resolve`, { status: 'WAIVED', note: 'Approved in the March board minutes', idempotencyKey: c.key() })).status, 201);
  const acts = WORK.repos.audit.list({ target: id }).map((e) => e.action);
  for (const a of ['PBC_REQUEST_CREATED', 'PBC_SELECTION_MATCHED', 'PBC_EVIDENCE_LINKED', 'PBC_GAP_RESOLVED']) assert.ok(acts.includes(a), a);

  /* Sloane opens the uploaded request by its number — it never rebuilds it as a new one */
  const ts = await c.ask('Pull the support for PBC #27.');
  assert.deepEqual(await toolsOf(c, ts), ['getPBCRequest']);
  assert.equal(objOf(ts, 'PBCRequest')['pbc'].id, id);
  /* selection 3 was matched to a candidate another selection already is: stated, never silently merged */
  const dup = orch.gl.lines.find((l) => l.key === cand)!, twin = w.selections.find((s: J) => s.key === dup.key);
  if (twin) assert.ok(objOf(ts, 'PBCRequest')['pbc'].duplicates.some((d: string) => d.includes(`Selections ${Math.min(twin.no, 3)} and ${Math.max(twin.no, 3)}`)), JSON.stringify(objOf(ts, 'PBCRequest')['pbc'].duplicates));
  else assert.deepEqual(objOf(ts, 'PBCRequest')['pbc'].duplicates, []);
  /* the same request as XLSX parses the same selections */
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('PBC 27');
  readFileSync(FIXTURE, 'utf8').split(/\r?\n/).forEach((line) => ws.addRow(line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.filter((x) => x !== '').map((x) => x.replace(/,$/, '').replace(/^"|"$/g, ''))));
  const xl = await parseUpload('pbc27.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(xl.intake, 'PARSED'); assert.equal(xl.rows.length, 8); assert.equal(xl.pbcNumber, 'PBC #27');
  assert.equal(xl.rows[0]!.identifiers.journalId, 'JE-000156');
  /* a PDF is kept and flagged — never guessed at */
  const pdf = await c.call('POST', '/api/work/pbc/upload', { fileName: 'pbc-28.pdf', content: Buffer.from('%PDF-1.4 fake').toString('base64'), idempotencyKey: c.key() });
  assert.equal(pdf.status, 201); assert.equal(pdf.body['intake'], 'REQUIRES_REVIEW');
  const wp = (await c.call('GET', `/api/work/pbc/${pdf.body['id']}`)).body['pbc'];
  assert.equal(wp.status, 'DRAFT');
});

/* ================================================================================================
   FAILURE TESTS — untied TB, population changed after preview, stale ERP, restricted document, recon incomplete
   ================================================================================================ */
test('failures: an unsynced posting unties the population; syncing it makes the request and its package stale; refresh is a new version', async () => {
  const c = new Client(); await c.signIn();
  const t = await c.ask('Give me FY26 CIP additions over $1M at MDH with invoices and approvals.');
  const p = objOf(t, 'PBCRequest')['pbc'];
  const A = orch.artifacts.pbc!;
  { const x = A.evaluate(p.id, 'ALL')!; assert.equal(x.stale, false, x.staleReasons.join('; ')); }
  /* recon incomplete is stated at the account, not per selection */
  const t2 = await c.ask('Give me FY26 CIP additions over $1M at MDH with invoices, approvals and reconciliation support.');
  const v2 = A.evaluate(objOf(t2, 'PBCRequest')['pbc'].id, 'ALL')!;
  assert.ok(v2.gaps.some((g) => g.requirement === 'RECONCILIATION' && g.kind === 'Reconciliation incomplete'));
  /* an ERP posting NOT yet synced: the governed population has not moved, the ERP has → NOT TIED */
  const post = await c.call('POST', '/api/work/dev/source-posting', { entity: 'MDH', period: '2026-06', debitAccount: '15400', creditAccount: '20100', amount: 1_500_000, description: 'Late CIP accrual', synced: false });
  assert.equal(post.status, 201, JSON.stringify(post.body));
  const v = A.evaluate(p.id, 'ALL')!;
  assert.equal(v.tie!.status, 'NOT_TIED');
  assert.ok(Math.abs(v.tie!.bridge.differenceUsd) > 1, 'the difference is stated');
  /* the connector syncs it: the population changed after the preview → STALE, never silently rewritten */
  const pinnedRows = A.get(p.id)!.pins!.rowCount;
  await c.call('POST', '/api/work/dev/source-sync', {});
  const s = A.evaluate(p.id, 'ALL')!;
  assert.equal(s.status, 'STALE');
  assert.ok(s.staleReasons.some((x) => /population|governed data/.test(x)), s.staleReasons.join('; '));
  const pkg = orch.artifacts.view(orch['actorOf'](), A.get(p.id)!.packageArtifactId!);
  assert.ok(pkg);
  /* refresh through Sloane: a proposal, confirmed → a new request version and a refreshed package */
  const tr = await c.ask(`Refresh ${p.pbcNumber}.`);
  const done = await c.confirm(tr);
  assert.equal(done['results'][0].status, 'COMPLETED', done['results'][0].message);
  const r = A.evaluate(p.id, 'ALL')!;
  assert.equal(r.stale, false, r.staleReasons.join('; '));
  assert.ok(r.version > s.version);
  assert.equal(A.get(p.id)!.pins!.rowCount, pinnedRows + 1, 'the synced $1.5M addition is in the new version’s pinned population');
});

test('failures: restricted document, permissions — the MDH accountant cannot read audit work; the auditor cannot create', async () => {
  const A = orch.artifacts.pbc!;
  const line = orch.gl.lines.find((l) => l.key === 'JE-000156#1')!;
  const ev = A.evidence(line, ['INVOICE', 'APPROVAL'], { vis: new Set(['MDH']), poVendors: new Map() });
  assert.ok(ev.every((e) => e.document === 'ACCESS_DENIED'), 'an out-of-scope transaction’s documents are access-denied');
  const any = A.list().find((r) => r.interpretation)!;
  const mdh = new Client(); await mdh.signIn('user:mdh');
  assert.equal((await mdh.call('GET', `/api/work/pbc/${any.id}`)).status, 403);
  assert.equal((await mdh.call('GET', '/api/work/pbc')).status, 403);
  const aud = new Client(); await aud.signIn('user:auditor');
  assert.equal((await aud.call('GET', `/api/work/pbc/${any.id}`)).status, 200);
  assert.equal((await aud.call('POST', '/api/work/pbc', { text: 'CIP additions over $1M with invoices', idempotencyKey: aud.key() })).status, 403);
  /* a scoped reader sees only its entity's selections as matched */
  const scoped = A.evaluate(any.id, new Set(['MDH']))!;
  assert.ok(scoped.selections.filter((x) => x.line).every((x) => x.line!.entity === 'MDH'));
});

test('readiness: "are we audit-ready for CIP?" is deterministic conditions, never a score', async () => {
  const c = new Client(); await c.signIn();
  const t = await c.ask('Are we audit-ready for CIP?');
  assert.deepEqual(await toolsOf(c, t), ['getAuditReadiness']);
  const o = objOf(t, 'AuditReadiness');
  assert.ok(o.table.rows.length >= 6);
  assert.ok(!JSON.stringify(o).match(/score/i) || /not a score/.test(JSON.stringify(t['notes'])));
  assert.match(fact(o, 'findings')!.display, /of \d+ checks/);
});

test('refinements: population words change the REQUEST (a new version); package words change the PACKAGE', async () => {
  const c = new Client(); await c.signIn();
  const t = await c.ask('Give me FY26 CIP additions over $1M with invoices, POs and approvals.');
  const p = objOf(t, 'PBCRequest')['pbc'];
  const t1 = await c.ask('Exclude items under $2M.');
  assert.deepEqual(await toolsOf(c, t1), ['modifyPBCRequest']);
  const w1 = objOf(t1, 'PBCRequest')['pbc'];
  assert.equal(w1.requirement.threshold, 'over $2.00M');
  assert.ok(w1.population.rows < p.population.rows);
  const t2 = await c.ask('Only include South Valley.');
  const w2 = objOf(t2, 'PBCRequest')['pbc'];
  assert.equal(w2.requirement.project, 'SV-PH2');
  assert.ok(w2.selections.every((s: J) => !s.key || orch.gl.lines.find((l) => l.key === s.key)!.project === 'SV-PH2'));
  const t3 = await c.ask('Show the missing invoices.');
  const g = objOf(t3, 'PBCSupportGaps')['pbc'];
  assert.ok(g.gaps.every((x: J) => x.requirement === 'INVOICE'));
  const t4 = await c.ask('Add source vendor.');
  assert.deepEqual(await toolsOf(c, t4), ['modifyExcelArtifact']);
  /* the package over the request pins the NEW request version, so it is not stale */
  const a = orch.artifacts.view(orch['actorOf'](), orch.artifacts.pbc!.get(p.id)!.packageArtifactId!)!;
  assert.equal(a.stale, false, a.staleReasons.join('; '));
});
