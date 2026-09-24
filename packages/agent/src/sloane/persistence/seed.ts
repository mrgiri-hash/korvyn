/**
 * DETERMINISTIC DEVELOPMENT SEED — the server-side records the Korvyn prototype needs, written ONCE per database.
 *
 * It preserves the complex-enterprise demo: the Reconciliations module's 38 governed reconciliation definitions
 * (the same ids the browser module shows, REC-CIP-ELECTRICAL …), the GL-derived reconciliations, their workflow
 * statuses and seeded preparer/reviewer notes, the Flux explanations and their comments, the close checklist, saved
 * report definitions, published reports, reporting packages and PBC requests.
 *
 * WORKFLOW ONLY. No balance is seeded: every amount still derives (the server book from @korvyn/core's GL; the module
 * reconciliations' balances from the browser module's own engine — see the compatibility debt in the root CLAUDE.md).
 * Re-running is a no-op while `seed_meta` records this version.
 */
import type { KorvynDatabase } from './db.js';
import type { WorkRepositories } from './repositories.js';
import { BROWSER_BOOK, closeTaskBodies, reportSeedRecords } from '../book.js';

/* 3D.1 — ONE BOOK: the close checklist, the module reconciliations' review states and the saved reports are the
   workspace's own fixtures (browser-book.json), not a second server-only set. A 3C.1 database is upgraded in place. */
export const SEED_VERSION = '3D.1';
const SYSTEM = 'system:seed';

/** the browser Reconciliations module's governed definitions — ids and names exactly as the module shows them */
export const MODULE_RECONCILIATIONS: [string, string, string][] = [
  ['REC-CASH', 'Cash and Cash Equivalents', 'FS-CASH'], ['REC-RCASH', 'Restricted Cash', 'FS-RCASH'], ['REC-AR', 'Accounts Receivable', 'FS-AR'], ['REC-PREPAID', 'Prepaid Expenses', 'FS-PRE'],
  ['REC-OCA', 'Other Current Assets', 'FS-OCA'], ['REC-LAND', 'Land', 'FS-LAND'], ['REC-CIP-ELECTRICAL', 'Electrical CIP', 'FS-CIP'], ['REC-CIP-MECHANICAL', 'Mechanical CIP', 'FS-CIP'],
  ['REC-CIP-GENERATORS', 'Generators', 'FS-CIP'], ['REC-CIP-OTHER', 'Cooling / Other CIP', 'FS-CIP'], ['REC-BLDG', 'Buildings', 'FS-BLDG'], ['REC-DCI-ELEC', 'Electrical Infrastructure', 'FS-ELEC'],
  ['REC-DCI-MECH', 'Mechanical Infrastructure', 'FS-MECH'], ['REC-DCI-GEN', 'Generators (placed in service)', 'FS-GEN'], ['REC-DCI-COOL', 'Cooling Equipment', 'FS-COOL'], ['REC-DCI-XFMR', 'Transformers', 'FS-XFMR'],
  ['REC-DCI-UPS', 'UPS', 'FS-UPS'], ['REC-DCI-NET', 'Network Infrastructure', 'FS-NET'], ['REC-FF', 'Furniture & Equipment', 'FS-FF'], ['REC-ACCDEP', 'Accumulated Depreciation', 'FS-ACCDEP'],
  ['REC-ROU', 'Right-of-Use Assets', 'FS-ROU'], ['REC-IC-RECV', 'Intercompany Receivable', 'FS-ICR'], ['REC-GW', 'Goodwill', 'FS-GW'], ['REC-INTAN', 'Intangible Assets', 'FS-INTAN'],
  ['REC-OA', 'Other Assets', 'FS-OA'], ['REC-AP', 'Accounts Payable', 'FS-AP'], ['REC-CPAY', 'Construction Payables', 'FS-CPAY'], ['REC-RETAINAGE', 'Retainage', 'FS-RET'],
  ['REC-ACCRUALS', 'Accrued Expenses', 'FS-ACC'], ['REC-DEFREV', 'Deferred Revenue', 'FS-DEF'], ['REC-LEASE', 'Lease Liabilities', 'FS-LEASE'], ['REC-DEBT-CURRENT', 'Current Debt', 'FS-DEBTC'],
  ['REC-DEBT-LT', 'Long-Term Debt', 'FS-DEBTL'], ['REC-IC-PAY', 'Intercompany Payable', 'FS-ICP'], ['REC-OL', 'Other Liabilities', 'FS-OL'], ['REC-CAP', 'Capital', 'FS-CAP'],
  ['REC-OCI', 'OCI / CTA', 'FS-OCI'], ['REC-CTA', 'Currency Translation Adjustment', 'FS-CTA'],
];
/** the module's own seeded review states (index.html RC_SEED; an unseeded definition is approved, as RC_STATE_DEFAULT says) in the server vocabulary */
export function moduleStatus(id: string): string {
  const r = BROWSER_BOOK.reconciliationReview[id];
  if (!r) return 'APPROVED';
  return r.review === 'approved' ? 'APPROVED' : r.review === 'returned' ? 'RETURNED' : r.review === 'inreview' ? 'IN_REVIEW' : r.prep === 'ready' ? 'PREPARED' : r.prep === 'prog' ? 'IN_PREPARATION' : 'NOT_STARTED';
}

export const GL_RECON_WORKFLOW: Record<string, { status: string; comments: { author: string; at: string; text: string }[] }> = {
  'REC-MDH-13100': { status: 'RETURNED', comments: [{ author: 'L. Chen (reviewer)', at: '2026-07-06', text: 'Due-from MER-DE does not agree to the counterparty payable. Confirm the June funding leg before resubmitting.' }, { author: 'M. Reyes (preparer)', at: '2026-07-06', text: 'Timing on the EUR leg; waiting on Deutschland treasury confirmation.' }] },
  'REC-MDH-15000': { status: 'IN_REVIEW', comments: [{ author: 'M. Reyes (preparer)', at: '2026-07-04', text: 'Project subledger agrees to GL; placed-in-service memo for Q2 settlement attached.' }] },
  'REC-MER-UK-15000': { status: 'IN_PREPARATION', comments: [] },
  'REC-MER-DE-15000': { status: 'IN_PREPARATION', comments: [{ author: 'K. Weber (preparer)', at: '2026-07-05', text: 'Awaiting project roll-forward from Frankfurt construction team.' }] },
  'REC-MER-SG-15000': { status: 'NOT_STARTED', comments: [] },
  'REC-MDH-21200': { status: 'APPROVED', comments: [] },
  'REC-MGP-REIT-13100': { status: 'APPROVED', comments: [] },
};
export const GL_RECON_SUPPORT: Record<string, Record<string, string>> = {
  'REC-MDH-15000': { 'proj-rf': 'WP-2026-06-MDH-CIP-RF v2', 'pis-memo': 'MEMO-2026-Q2-MDH-PIS v1' },
  'REC-MER-UK-15000': { 'proj-rf': 'WP-2026-06-UK-CIP-RF v1' },
  'REC-MDH-21200': { 'debt-sched': 'WP-2026-06-MDH-DEBT v1' },
  'REC-MGP-REIT-13100': { 'ic-conf': 'CONF-2026-06-REIT-MDH v1' },
  'REC-MDH-20100': { 'ap-aging': 'RPT-2026-06-MDH-APAGING v1' },
};
export const FLUX_EXPLANATIONS: Record<string, { id: string; status: string; text: string; author: string; reviewer: string; version: number; comments: { author: string; at: string; text: string }[]; supportRefs: string[] }> = {
  '15000:2026-06': { id: 'EXPL-15000-2026-06', status: 'APPROVED', version: 2, author: 'M. Reyes', reviewer: 'L. Chen', text: 'CIP moved on capital additions across the four operating entities and the quarter-end placed-in-service settlements to PP&E.', comments: [{ author: 'L. Chen', at: '2026-07-05', text: 'Agrees to the project roll-forwards; approved.' }], supportRefs: ['WP-2026-06-MDH-CIP-RF v2', 'MEMO-2026-Q2-MDH-PIS v1'] },
  '16000:2026-06': { id: 'EXPL-16000-2026-06', status: 'SUBMITTED', version: 1, author: 'M. Reyes', reviewer: 'L. Chen', text: 'PP&E increased on quarter-end placed-in-service settlements out of CIP.', comments: [], supportRefs: ['MEMO-2026-Q2-MDH-PIS v1'] },
  '40000:2026-06': { id: 'EXPL-40000-2026-06', status: 'DRAFT', version: 1, author: 'A. Okafor', reviewer: 'L. Chen', text: 'Revenue movement reflects invoice volume and mix across colocation and interconnection.', comments: [{ author: 'A. Okafor', at: '2026-07-06', text: 'Draft — needs property-level detail before submission.' }], supportRefs: [] },
};
export const REPORT_SEED = [
  { id: 'RPT-CFO-MONTHLY', name: 'CFO Monthly Report', owner: 'Controller', kind: 'SAVED', definitionVersion: 3, lines: [{ label: 'Total revenue', accounts: ['40000'] }, { label: 'Cost of operations', accounts: ['50000'] }, { label: 'Operating expenses', accounts: ['60000'] }, { label: 'Construction in progress', accounts: ['15000'] }, { label: 'Property, plant & equipment', accounts: ['16000'] }, { label: 'Cash & cash equivalents', accounts: ['10000'] }, { label: 'Debt', accounts: ['25000'] }] },
  { id: 'RPT-CAPITAL-PROJECTS', name: 'Capital Projects Report', owner: 'M. Reyes', kind: 'SAVED', definitionVersion: 2, lines: [{ label: 'Construction in progress', accounts: ['15000'] }, { label: 'Buildings & improvements', accounts: ['16200'] }, { label: 'Mechanical & electrical', accounts: ['16400'] }] },
  { id: 'RPT-OPEX-CC', name: 'Operating Expense by Cost Center', owner: 'A. Okafor', kind: 'SAVED', definitionVersion: 1, lines: [{ label: 'Cost of operations', accounts: ['50000'] }, { label: 'Operating expenses', accounts: ['60000'] }] },
];
export const PUBLISHED_SEED = [
  { id: 'PUB-CFO-2026-05-V1', reportId: 'RPT-CFO-MONTHLY', name: 'CFO Monthly Report — May 2026', period: '2026-05', version: 1, publishedBy: 'Controller', publishedAt: '2026-06-09', snapshotId: 'CORE-EGL-S42-I12' },
  { id: 'PUB-CAP-2026-Q1-V1', reportId: 'RPT-CAPITAL-PROJECTS', name: 'Capital Projects Report — Q1 2026', period: '2026-03', version: 1, publishedBy: 'M. Reyes', publishedAt: '2026-04-10', snapshotId: 'CORE-EGL-S42-I12' },
];
export const PACKAGE_SEED = [
  { id: 'PKG-CFO-2026-06', name: 'June 2026 CFO Package', period: '2026-06', status: 'DRAFT', owner: 'Controller', contents: ['report:RPT-CFO-MONTHLY', 'report:RPT-CAPITAL-PROJECTS', 'flux:2026-06', 'recon:summary:2026-06'] },
  { id: 'PKG-CFO-2026-05', name: 'May 2026 CFO Package', period: '2026-05', status: 'PUBLISHED', owner: 'Controller', contents: ['published:PUB-CFO-2026-05-V1'] },
];
export const PBC_SEED = [
  { id: 'PBC-2026-001', title: 'CIP additions listing and selections support', populationId: 'AUD-POP-CIP-ADD', owner: 'M. Reyes', requestedBy: 'External auditor', due: '2026-07-20', status: 'OPEN' },
  { id: 'PBC-2026-002', title: 'Intercompany confirmations June 2026', populationId: null, owner: 'M. Reyes', requestedBy: 'External auditor', due: '2026-07-15', status: 'IN_PROGRESS' },
  { id: 'PBC-2026-003', title: 'Revenue invoice listing H1 2026', populationId: 'AUD-POP-REVENUE', owner: 'A. Okafor', requestedBy: 'External auditor', due: '2026-07-25', status: 'NOT_STARTED' },
];

export function seedDevelopment(db: KorvynDatabase, repos: WorkRepositories, workingPeriod: string, glRecDefs: { id: string; name: string; entity: string; accounts: string[]; preparer: string; reviewer: string }[]): { seeded: boolean } {
  const done = db.db.prepare('SELECT version FROM seed_meta WHERE name = ?').get('korvyn-dev') as { version: string } | undefined;
  if (done?.version === SEED_VERSION) return { seeded: false };
  if (done?.version === '3C.1') { upgradeTo3D(db, repos, workingPeriod); return { seeded: true }; }
  db.tx(() => {
    const R = repos.records;
    for (const [id, name, line] of MODULE_RECONCILIATIONS) {
      R.insert('RECON_DEFINITION', { definitionId: id, name, catalog: 'MODULE', financialLineId: line, entity: 'GROUP', accounts: [], preparer: 'M. Reyes', reviewer: 'L. Chen' }, SYSTEM, { id: `RECONDEF-${id}`, target: id, scope: 'GROUP' });
      R.insert('RECON_WORKFLOW', { definitionId: id, status: moduleStatus(id) }, SYSTEM, { id: `RECONWF-${id}`, target: id, status: moduleStatus(id), period: workingPeriod });
    }
    for (const d of glRecDefs) {
      R.insert('RECON_DEFINITION', { definitionId: d.id, name: d.name, catalog: 'GL', financialLineId: null, entity: d.entity, accounts: d.accounts, preparer: d.preparer, reviewer: d.reviewer }, SYSTEM, { id: `RECONDEF-${d.id}`, target: d.id, scope: d.entity });
      const wf = GL_RECON_WORKFLOW[d.id];
      R.insert('RECON_WORKFLOW', { definitionId: d.id, status: wf?.status ?? 'NOT_STARTED' }, SYSTEM, { id: `RECONWF-${d.id}`, target: d.id, status: wf?.status ?? 'NOT_STARTED', period: workingPeriod });
      for (const c of wf?.comments ?? []) repos.comments.add(`recon:${d.id}:${workingPeriod}`, { author: c.author, authorId: 'seed', via: null, source: 'SEED', text: c.text, financialObjectIds: [], populationIds: [], executionId: null }, null, SYSTEM, null);
      for (const [req, ref] of Object.entries(GL_RECON_SUPPORT[d.id] ?? {})) R.insert('SUPPORT_REQUIREMENT_ATTACHMENT', { definitionId: d.id, requirement: req, reference: ref }, SYSTEM, { target: `recon:${d.id}:${workingPeriod}`, status: 'ATTACHED', period: workingPeriod });
    }
    for (const [key, e] of Object.entries(FLUX_EXPLANATIONS)) {
      const [account, period] = key.split(':');
      R.insert('FLUX_EXPLANATION', { account, explanationId: e.id, status: e.status, text: e.text, author: e.author, reviewer: e.reviewer, supportRefs: e.supportRefs }, SYSTEM, { id: e.id, target: `flux:${account}:${period}`, status: e.status, period });
      for (const c of e.comments) repos.comments.add(`flux:${account}:${period}`, { author: c.author, authorId: 'seed', via: null, source: 'SEED', text: c.text, financialObjectIds: [], populationIds: [], executionId: null }, null, SYSTEM, null);
    }
    seedCloseAndReports(repos, workingPeriod);
    for (const r of REPORT_SEED) R.insert('REPORT_DEFINITION', r, SYSTEM, { id: r.id, target: r.id, status: 'SAVED' });
    for (const r of PUBLISHED_SEED) R.insert('PUBLISHED_REPORT', r, SYSTEM, { id: r.id, target: r.reportId, status: 'PUBLISHED', period: r.period });
    for (const r of PACKAGE_SEED) R.insert('REPORTING_PACKAGE', r, SYSTEM, { id: r.id, status: r.status, period: r.period });
    for (const r of PBC_SEED) R.insert('PBC_REQUEST', r, SYSTEM, { id: r.id, status: r.status });
    db.db.prepare('INSERT OR REPLACE INTO seed_meta (name, version, at) VALUES (?, ?, ?)').run('korvyn-dev', SEED_VERSION, new Date().toISOString());
  });
  return { seeded: true };
}

/** the workspace's close checklist and saved reports, as the one server book */
function seedCloseAndReports(repos: WorkRepositories, workingPeriod: string) {
  const R = repos.records;
  for (const t of closeTaskBodies()) R.insert('CLOSE_TASK', t, SYSTEM, { id: `CLOSETASK-${t.taskId}`, target: t.taskId, status: t.state, period: workingPeriod, scope: t.entity });
  for (const r of reportSeedRecords()) if (!repos.saved.get('REPORT', r.id)) repos.saved.create('REPORT', r.body, SYSTEM, { id: r.id, target: r.id });
}

/** 3C.1 → 3D.1: replace the server-only close checklist and module review states with the workspace's own; add its
 *  saved reports. Comments, support, investigations, proposals and audit are untouched. */
function upgradeTo3D(db: KorvynDatabase, repos: WorkRepositories, workingPeriod: string) {
  db.tx(() => {
    db.db.prepare("DELETE FROM records WHERE kind = 'CLOSE_TASK'").run();
    for (const [id] of MODULE_RECONCILIATIONS) {
      const wf = repos.reconciliations.status(id);
      if (wf && wf.updatedBy === SYSTEM) repos.records.update('RECON_WORKFLOW', wf.id, null, SYSTEM, () => ({ definitionId: id, status: moduleStatus(id) }), { status: moduleStatus(id) });
    }
    seedCloseAndReports(repos, workingPeriod);
    db.db.prepare('INSERT OR REPLACE INTO seed_meta (name, version, at) VALUES (?, ?, ?)').run('korvyn-dev', SEED_VERSION, new Date().toISOString());
  });
}
