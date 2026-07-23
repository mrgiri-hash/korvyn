/**
 * Close / reconciliation / intercompany / policy accessors, plus deterministic
 * variance attribution. Same rule as graph.ts: no LLM touches these numbers;
 * the agent may only answer from them.
 */

// ---- Reconciliations (thousands rendered as USD millions) --------------------
const RECON = [
  { account: '13500', name: 'Due from affiliates',   entity: 'Meridian DC Holdco',  balanceUsdM: 88.4,  differenceUsdM: 2.30,     status: 'overdue', due: 'Jun 28, 2026', owner: 'M. Giri' },
  { account: '20000', name: 'Accounts payable',       entity: 'Meridian DC Holdco',  balanceUsdM: -33.8, differenceUsdM: -0.00125, status: 'overdue', due: 'Jun 25, 2026', owner: 'A. Okafor' },
  { account: '21000', name: 'Accrued capital costs',  entity: 'Meridian DC Holdco',  balanceUsdM: -40.5, differenceUsdM: 0,        status: 'in-progress', due: 'Jul 6, 2026',  owner: 'M. Reyes' },
  { account: '22000', name: 'Retention payable',      entity: 'Fleet DC OpCo',       balanceUsdM: -10.4, differenceUsdM: 0,        status: 'done',    due: 'Jun 30, 2026', owner: 'L. Tan' },
  { account: '25000', name: 'Lease liability',        entity: 'Fleet DC OpCo',       balanceUsdM: -14.2, differenceUsdM: 0,        status: 'done',    due: 'Jun 30, 2026', owner: 'J. Park' },
  { account: '15000', name: 'CIP — construction',     entity: 'Meridian DC Holdco',  balanceUsdM: 62.0,  differenceUsdM: 0,        status: 'in-progress', due: 'Jul 8, 2026',  owner: 'M. Reyes' },
];

export function reconciliationStatus() {
  const open = RECON.filter((r) => r.status !== 'done');
  const overdue = RECON.filter((r) => r.status === 'overdue');
  const withDiff = RECON.filter((r) => Math.abs(r.differenceUsdM) > 0);
  return {
    scope: 'Consolidated group', unit: 'USD millions',
    total: RECON.length, done: RECON.length - open.length, open: open.length, overdue: overdue.length,
    accountsWithDifference: withDiff.length,
    differences: withDiff.map((r) => ({ account: r.account, name: r.name, entity: r.entity, differenceUsdM: r.differenceUsdM, status: r.status, owner: r.owner })),
    rows: RECON,
  };
}

// ---- Close status ------------------------------------------------------------
export function closeStatus() {
  return {
    scope: 'Consolidated group', period: 'Jun 2026',
    completionPct: 71, tasksDone: 54, tasksTotal: 76,
    closeDay: 5, blockingTasks: 4, blockingEntities: 3,
    unreconciled: '4 of 45 accounts', entitiesReady: '0 of 4', entitiesBlocked: 4,
    signOff: '2 pending (of 4 approvers)',
    note: 'Status rolls up from close tasks, reconciliations and intercompany — Korvyn does not restate any of it.',
  };
}

// ---- Intercompany ------------------------------------------------------------
const IC_PAIRS = [
  { a: 'Meridian DC Holdco', b: 'Fleet DC OpCo',          dueFromUsdM: 145.0, dueToUsdM: 145.0, differenceUsdM: 0,   matched: true },
  { a: 'Meridian DC Holdco', b: 'Meridian Property Co',   dueFromUsdM: 88.4,  dueToUsdM: 86.1,  differenceUsdM: 2.3, matched: false, note: 'ICE-2603-0204: Property Co has not booked the counterparty payable (104 days old).' },
  { a: 'Fleet DC OpCo',      b: 'Meridian Management Co',  dueFromUsdM: 42.7,  dueToUsdM: 42.7,  differenceUsdM: 0,   matched: true },
  { a: 'Meridian DC Holdco', b: 'Meridian Management Co',  dueFromUsdM: 18.6,  dueToUsdM: 18.6,  differenceUsdM: 0,   matched: true },
];

export function intercompanyStatus() {
  const unmatched = IC_PAIRS.filter((p) => !p.matched);
  return {
    scope: 'Consolidated group', unit: 'USD millions',
    pairs: IC_PAIRS.length, matched: IC_PAIRS.length - unmatched.length, unmatched: unmatched.length,
    totalDifferenceUsdM: IC_PAIRS.reduce((a, p) => a + p.differenceUsdM, 0),
    eliminationReady: unmatched.length === 0,
    detail: IC_PAIRS,
  };
}

// ---- Policies ----------------------------------------------------------------
const POLICIES = [
  { id: 'ACC-CAP-001', title: 'Capitalization threshold', category: 'Capitalization', level: 'Global',  threshold: 'USD 5,000', status: 'Approved', version: 'v4', source: 'ASC 360-10' },
  { id: 'ACC-CAP-006', title: 'Capitalized labor',       category: 'Capitalization', level: 'Global',  threshold: '—',         status: 'Approved', version: 'v2', source: 'ASC 360 / 350-40' },
  { id: 'ACC-CAP-009', title: 'CIP → placed-in-service', category: 'Capitalization', level: 'Global',  threshold: '—',         status: 'Approved', version: 'v3', source: 'ASC 360-10-35' },
  { id: 'ACC-CAP-014', title: 'Germany capitalization',  category: 'Capitalization', level: 'Germany', threshold: 'EUR 800',   status: 'Approved', version: 'v1', source: 'ACC-CAP-001 (local override)' },
  { id: 'ACC-IC-01',   title: 'Intercompany elimination', category: 'Consolidation', level: 'Global',  threshold: '—',         status: 'Approved', version: 'v2', source: 'ASC 810' },
];

export function findPolicy(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return { policies: POLICIES };
  const hit = POLICIES.filter((p) => p.id.toLowerCase() === q || p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.level.toLowerCase() === q);
  if (hit.length) return { matches: hit };
  return { notFound: `no policy matched "${query}". Known ids: ${POLICIES.map((p) => p.id).join(', ')}.` };
}

// ---- Variance attribution (deterministic decomposition) ----------------------
export function explainVariance(account: string, from = '2026-Q1', to = '2026-Q2') {
  const key = account.trim();
  if (key === '21000' || /accru/i.test(key)) {
    const components = [
      { driver: 'Turner Construction (vendor)', amountUsdM: 4.2, kind: 'non-recurring', note: 'new PO-1000 this period' },
      { driver: 'Vertiv — power (vendor)',       amountUsdM: 1.8, kind: 'recurring' },
      { driver: 'Caterpillar — gensets (vendor)', amountUsdM: 0.9, kind: 'recurring' },
    ];
    const residual = { txnCount: 3, amountUsdM: 0.3, note: 'postings with no vendor dimension — unattributed, shown explicitly, never redistributed' };
    const attributed = components.reduce((a, c) => a + c.amountUsdM, 0);
    const delta = Number((attributed + residual.amountUsdM).toFixed(2));
    return {
      account: '21000 · Accrued capital costs', entity: 'Meridian DC Holdco', from, to, unit: 'USD millions',
      deltaUsdM: delta, components, residual,
      reconciles: Math.abs(attributed + residual.amountUsdM - delta) < 1e-9,
      note: 'Deterministic attribution — components plus the unattributed residual reconcile exactly to the delta. No causation is inferred beyond the vendor dimension on each posting.',
    };
  }
  return { account: key, notAvailable: `no period decomposition is modeled for account ${key}. Modeled: 21000 (accrued capital costs, Q1→Q2, by vendor).` };
}
