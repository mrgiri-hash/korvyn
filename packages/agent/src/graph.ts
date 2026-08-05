/**
 * Compact TypeScript port of Korvyn's ingested traceability graph — the tool
 * layer the agent reasons over. Mirrors the dashboard fixture (Meridian Global
 * Portfolio). Everything here is deterministic; no LLM touches these numbers.
 * The agent may ONLY answer from these accessors.
 */

export type LinkType = 'stated' | 'derived' | 'inferred';

/** One hop in a provenance chain: a present link (with source + linkType) or a missing one (with owner). */
export interface Hop {
  present: boolean;
  objectType: string;
  label: string;
  korvynId?: string;
  sourceSystem?: string;
  linkType?: LinkType;
  confidence?: number;   // when inferred
  derivedBy?: string;    // when derived
  reason?: string;       // when missing
  owner?: string;        // when missing
}

export interface Exception {
  id: string;
  title: string;
  entity: string;
  account: string;
  source: string;
  amountUsd: number;
  state: string;
  preparer: string;
  detection: boolean;    // false = financial exception, true = linkage detection
  chain: Hop[];
}

/** The consolidated group + the source system each entity feeds from (two are degraded — honest degradation). */
export const ENTITIES = [
  { name: 'Meridian DC Holdco',     source: 'NetSuite',         status: 'ok',          ownership: 1.0, method: 'full',   region: 'Americas' },
  { name: 'Fleet DC OpCo',          source: 'Oracle ERP Cloud', status: 'ok',          ownership: 1.0, method: 'full',   region: 'Americas' },
  { name: 'Meridian Property Co',   source: 'SAP S/4HANA',      status: 'stale',       ownership: 1.0, method: 'full',   region: 'Americas' },
  { name: 'Meridian Management Co', source: 'JD Edwards',       status: 'unreachable', ownership: 1.0, method: 'full',   region: 'Americas' },
] as const;

/** Two financial exceptions, resolving through the real ingested chains. */
const FINANCIAL: Exception[] = [
  {
    id: 'TX-RECON-13500-HOLD',
    title: 'Due from affiliates — reconciliation difference',
    entity: 'Meridian DC Holdco', account: '13500', source: 'NetSuite',
    amountUsd: 2_300_000, state: 'Cleared', preparer: 'M. Giri', detection: false,
    chain: [
      { present: true,  objectType: 'account',            label: '13500 · Due from affiliates',            korvynId: 'kv:account:0003',  sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: true,  objectType: 'journal-entry',      label: 'JE-004610 · Property mgmt fee — Q1 accrual', korvynId: 'kv:je:0005',    sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: true,  objectType: 'entity',             label: 'Meridian Property Co',                   korvynId: 'kv:entity:0002',   sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: true,  objectType: 'intercompany-event', label: 'ICE-2603-0204',                          korvynId: 'kv:icevent:0006',  sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: false, objectType: 'counterparty-confirmation', label: 'Property Co payable (JE-PROP-PAYABLE-2603)',
        reason: 'Meridian Property Co has not booked the counterparty payable; confirmation cannot be attached', owner: 'M. Giri' },
    ],
  },
  {
    id: 'TX-ACCR-21000-HOLD',
    title: 'Accrued capital costs — accrual with document trail',
    entity: 'Meridian DC Holdco', account: '21000', source: 'NetSuite',
    amountUsd: 4_200_000, state: 'Assigned', preparer: 'M. Reyes', detection: false,
    chain: [
      { present: true, objectType: 'journal-entry',    label: 'JE-ACCR-21000-06 · Period-end accrual', korvynId: 'kv:je:0007',      sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: true, objectType: 'invoice',          label: 'INV-9000 · Turner progress billing',    korvynId: 'kv:invoice:0008', sourceSystem: 'NetSuite', linkType: 'inferred', confidence: 0.88 },
      { present: true, objectType: 'purchase-order',   label: 'PO-1000 · Ashburn shell & core',        korvynId: 'kv:po:0009',      sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: true, objectType: 'vendor',           label: 'Turner Construction',                   korvynId: 'kv:vendor:0010',  sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: true, objectType: 'contract',         label: 'Turner — Ashburn master (GMP)',         korvynId: 'kv:contract:derived', sourceSystem: 'derived', linkType: 'derived', derivedBy: 'vendor + project → master contract' },
      { present: true, objectType: 'project',          label: 'Ashburn Hall C (ASH-C)',                korvynId: 'kv:project:0011', sourceSystem: 'NetSuite', linkType: 'stated' },
    ],
  },
];

/** Five linkage detections — broken/missing links opened as first-class exceptions (materiality-ranked). */
const DETECTIONS: Exception[] = [
  {
    id: 'TX-DET-NOTXN', title: 'JE without source transaction — Source transaction',
    entity: 'Meridian DC Holdco', account: '21000', source: 'NetSuite',
    amountUsd: 4_200_000, state: 'New', preparer: 'M. Giri', detection: true,
    chain: [
      { present: true,  objectType: 'journal-entry',     label: 'JE-ACCR-21000-06', korvynId: 'kv:je:0007', sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: false, objectType: 'source-transaction', label: 'Source transaction', reason: 'JE JE-ACCR-21000-06 carries no source transaction id', owner: 'M. Giri' },
    ],
  },
  {
    id: 'TX-DET-ICNM', title: 'Intercompany balance with no counterparty match — Counterparty posting',
    entity: 'Meridian DC Holdco', account: '13500', source: 'NetSuite',
    amountUsd: 2_300_000, state: 'New', preparer: 'M. Giri', detection: true,
    chain: [
      { present: true,  objectType: 'intercompany-event',   label: 'ICE-2603-0204', korvynId: 'kv:icevent:0006', sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: true,  objectType: 'entity',               label: 'Meridian Property Co', korvynId: 'kv:entity:0002', sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: false, objectType: 'counterparty-posting', label: 'Counterparty posting', reason: 'Meridian Property Co has not booked the counterparty side of ICE-2603-0204', owner: 'M. Giri' },
    ],
  },
  {
    id: 'TX-DET-DANGLE', title: 'Transaction references a parent that does not exist — Parent JE-PROP-PAYABLE-2603',
    entity: 'Meridian DC Holdco', account: '13500', source: 'NetSuite',
    amountUsd: 2_300_000, state: 'New', preparer: 'M. Giri', detection: true,
    chain: [
      { present: true,  objectType: 'journal-entry',        label: 'JE-004610', korvynId: 'kv:je:0005', sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: false, objectType: 'parent-journal-entry', label: 'Parent JE-PROP-PAYABLE-2603', reason: 'JE JE-004610 references JE-PROP-PAYABLE-2603 which is not present in source', owner: 'M. Giri' },
    ],
  },
  {
    id: 'TX-DET-NOPO', title: 'Invoice without PO reference — PO reference',
    entity: 'Meridian DC Holdco', account: '—', source: 'NetSuite',
    amountUsd: 1_240_000, state: 'New', preparer: 'S. Weber', detection: true,
    chain: [
      { present: true,  objectType: 'invoice',        label: 'INV-9100 · Non-PO manual invoice', korvynId: 'kv:invoice:0012', sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: false, objectType: 'purchase-order', label: 'PO reference', reason: 'Invoice INV-9100 carries no PO reference — cannot 3-way match', owner: 'S. Weber' },
    ],
  },
  {
    id: 'TX-DET-DUP', title: 'Duplicate flagged, identity not confirmed — Confirmed unique identity',
    entity: '—', account: '—', source: 'NetSuite',
    amountUsd: 0, state: 'New', preparer: 'S. Weber', detection: true,
    chain: [
      { present: true,  objectType: 'vendor',            label: 'Caterpillar (V-CATER)',  korvynId: 'kv:vendor:0013', sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: true,  objectType: 'vendor',            label: 'Caterpillar (VEND-CAT)', korvynId: 'kv:vendor:0014', sourceSystem: 'NetSuite', linkType: 'stated' },
      { present: false, objectType: 'canonical-identity', label: 'Confirmed unique identity', reason: '2 records share the name "Caterpillar" but identity cannot be confirmed (no tax id); not merged', owner: 'S. Weber' },
    ],
  },
];

const ALL_EXC: Exception[] = [...FINANCIAL, ...DETECTIONS];

function chainResult(e: Exception) {
  const resolved = e.chain.filter((h) => h.present).length;
  return {
    id: e.id, title: e.title, entity: e.entity, account: e.account, source: e.source,
    amountUsd: e.amountUsd, state: e.state, kind: e.detection ? 'detection' : 'financial',
    resolvedLinks: resolved, missingLinks: e.chain.length - resolved, chain: e.chain,
  };
}

/** Resolve a subject (account no / exception id / figure name) to its chain, or an explicit not-traceable reason. */
export function traceSubject(subject: string) {
  const raw = subject.trim();
  const s = raw.toLowerCase();
  const byId = ALL_EXC.find((e) => e.id.toLowerCase() === s);
  if (byId) return chainResult(byId);

  let acct: string | null = null;
  if (/^\d{4,5}$/.test(raw)) acct = raw;
  else if (/due from|affiliat/.test(s)) acct = '13500';
  else if (/accru/.test(s)) acct = '21000';

  if (acct) {
    const e = ALL_EXC.find((x) => x.account === acct && !x.detection) ?? ALL_EXC.find((x) => x.account === acct);
    if (e) return chainResult(e);
    return {
      subject: raw,
      notTraceable:
        `account ${acct} is not in the ingested graph. Ingested (NetSuite · Meridian DC Holdco): ` +
        `13500 Due from affiliates, 21000 Accrued capital costs, and their journal entries, invoice, PO, vendor and project.`,
    };
  }
  return {
    subject: raw,
    notTraceable:
      `could not resolve "${raw}" to an account, exception id, or known figure. ` +
      `Try an account number (13500, 21000), an exception id (e.g. TX-RECON-13500-HOLD), or a figure name like "due from affiliates".`,
  };
}

/** Financial exceptions + linkage detections in one list, ranked by materiality. */
export function listExceptions() {
  return [...ALL_EXC]
    .sort((a, b) => b.amountUsd - a.amountUsd)
    .map((e) => ({
      id: e.id, title: e.title, entity: e.entity, account: e.account,
      kind: e.detection ? 'detection' : 'financial',
      materialityUsd: e.amountUsd, state: e.state, preparer: e.preparer,
      missingLinks: e.chain.filter((h) => !h.present).length,
    }));
}

/** Just the linkage detections. */
export function listDetections() {
  return listExceptions().filter((e) => e.kind === 'detection');
}

export function listEntities() {
  return {
    scope: 'Consolidated group',
    note: 'Two feeds are degraded: SAP S/4HANA (Meridian Property Co) is stale; JD Edwards (Meridian Management Co) is unreachable. Figures they feed are marked accordingly.',
    entities: ENTITIES.map((e) => ({ ...e })),
  };
}

// ---- Financial statements (consolidated group; illustrative but internally consistent — assets tie to L+E) ----
type Line = { line: string; amountUsdM: number; subtotal?: boolean };
const STATEMENTS: Record<string, { title: string; lines: Line[]; total: Line }> = {
  balance_sheet: {
    title: 'Balance sheet',
    lines: [
      { line: 'Property, plant & equipment (gross)', amountUsdM: 512.0 },
      { line: 'Accumulated depreciation',            amountUsdM: -48.0 },
      { line: 'Net PP&E',                            amountUsdM: 464.0, subtotal: true },
      { line: 'Total assets',                        amountUsdM: 464.0, subtotal: true },
      { line: 'Accounts payable',                    amountUsdM: 33.8 },
      { line: 'Accrued capital costs',               amountUsdM: 40.5 },
      { line: 'Retention payable',                   amountUsdM: 10.4 },
      { line: 'Lease liability',                     amountUsdM: 14.2 },
      { line: 'Loan / debt',                         amountUsdM: 180.0 },
      { line: 'Total liabilities',                   amountUsdM: 278.9, subtotal: true },
      { line: 'Intercompany contribution',           amountUsdM: 60.0 },
      { line: 'LP equity',                           amountUsdM: 100.0 },
      { line: 'Retained earnings (net income to date)', amountUsdM: 25.1 },
      { line: 'Total equity',                        amountUsdM: 185.1, subtotal: true },
    ],
    total: { line: 'Total liabilities & equity', amountUsdM: 464.0, subtotal: true },
  },
  income_statement: {
    title: 'Income statement',
    lines: [
      { line: 'Rental revenue',                amountUsdM: 88.0 },
      { line: 'Recoveries',                    amountUsdM: 12.0 },
      { line: 'Total revenue',                 amountUsdM: 100.0, subtotal: true },
      { line: 'Property operating expenses',   amountUsdM: -28.0 },
      { line: 'Net operating income',          amountUsdM: 72.0, subtotal: true },
      { line: 'General & administrative',      amountUsdM: -9.0 },
      { line: 'EBITDA',                        amountUsdM: 63.0, subtotal: true },
      { line: 'Depreciation',                  amountUsdM: -18.0 },
      { line: 'EBIT',                          amountUsdM: 45.0, subtotal: true },
      { line: 'Interest expense',              amountUsdM: -12.0 },
      { line: 'Gain on sale',                  amountUsdM: 4.0 },
    ],
    total: { line: 'Net income', amountUsdM: 37.0, subtotal: true },
  },
  cash_flow: {
    title: 'Cash flow statement',
    lines: [
      { line: 'Cash from operations', amountUsdM: 55.0, subtotal: true },
      { line: 'Cash from investing',  amountUsdM: -92.0, subtotal: true },
      { line: 'Cash from financing',  amountUsdM: 48.0, subtotal: true },
    ],
    total: { line: 'Net change in cash', amountUsdM: 11.0, subtotal: true },
  },
};

export function getStatement(kind: string) {
  const key = kind.toLowerCase().replace(/[\s-]+/g, '_')
    .replace('p&l', 'income_statement').replace('profit_and_loss', 'income_statement')
    .replace('statement_of_operations', 'income_statement').replace('cashflow', 'cash_flow');
  const st = STATEMENTS[key] ?? STATEMENTS['balance_sheet']!;
  return {
    statement: st.title, scope: 'Consolidated group', unit: 'USD millions',
    lines: [...st.lines, st.total],
    note: key === 'balance_sheet' ? 'Assets tie to liabilities plus equity.' : 'Derived from the trial balance (COA + supplemental inputs).',
  };
}
