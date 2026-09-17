/**
 * THE GOVERNED LEDGER ENGINE — one population model every Sloane analysis, flux, reconciliation, audit and
 * evidence tool reads. There is exactly ONE engine here: a flat, indexed view of @korvyn/core's posted journal
 * lines, with a generic dimension accessor. Every "by entity / by project / by vendor / by account" answer is the
 * same aggregate() call with a different dimension key; there is no per-dimension engine.
 *
 * ENTERPRISE-SCALE CONTRACT. Nothing in this file hands a caller the population. A population is a DEFINITION
 * (filters + sort) with a stable id; callers receive a count, totals, aggregates and one bounded page. In a
 * deployment the same contract is a SQL / warehouse query behind the id — the in-memory index here is the
 * prototype executor for a ~1.2k-line book, not the design.
 *
 * DECLARED INPUTS (never derived, always cited on the objects that use them):
 *   FX_RATE_SET          monthly average rates  (flows: activity, income statement)
 *   FX_CLOSING_SET       period-end rates       (balances: balance sheet, reconciliations)
 *   AP_EXTRACT           representative AP subledger extract: vendor, invoice, PO, contract and approval
 *                        references on AP-sourced lines. The core GL carries NO vendor; every object that shows a
 *                        vendor or a document reference says it came from this extract.
 *   SOURCE_HEALTH        connector availability per ERP instance.
 */
import { createHash } from 'node:crypto';
import { FX_RATE_SET, type FinancialDataService, money, periodLabel } from './financials.js';

export const FX_CLOSING_SET = {
  id: 'FXR-2026-CLS-REP-1',
  type: 'period-end closing',
  toUsd: {
    USD: { '2026-01': 1, '2026-02': 1, '2026-03': 1, '2026-04': 1, '2026-05': 1, '2026-06': 1 },
    GBP: { '2026-01': 1.265, '2026-02': 1.268, '2026-03': 1.274, '2026-04': 1.279, '2026-05': 1.283, '2026-06': 1.277 },
    EUR: { '2026-01': 1.084, '2026-02': 1.085, '2026-03': 1.092, '2026-04': 1.096, '2026-05': 1.099, '2026-06': 1.094 },
    SGD: { '2026-01': 0.742, '2026-02': 0.743, '2026-03': 0.747, '2026-04': 0.75, '2026-05': 0.752, '2026-06': 0.748 },
  } as Record<string, Record<string, number>>,
};

export const AP_EXTRACT = {
  id: 'APX-2026-REP-1',
  note: 'Representative AP subledger extract declared for the prototype. The core GL carries no vendor; vendor, invoice, PO, contract and approval references on AP-sourced lines come from this extract. No document is connected.',
};

export type SourceStatus = 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';
export const SOURCE_HEALTH: Record<string, { system: string; instance: string; status: SourceStatus; deepLinks: false; note: string }> = {
  oracle: { system: 'Oracle ERP Cloud', instance: 'ORCL-CORP-01', status: 'AVAILABLE', deepLinks: false, note: 'Synced; no deep link is published by this instance.' },
  sap: { system: 'SAP S/4HANA', instance: 'SAP-EU-US-01', status: 'AVAILABLE', deepLinks: false, note: 'Synced; no deep link is published by this instance.' },
  netsuite: { system: 'NetSuite', instance: 'NS-UK-01', status: 'STALE', deepLinks: false, note: 'Last sync is older than the freshness policy.' },
  jde: { system: 'JD Edwards', instance: 'JDE-APAC-01', status: 'UNAVAILABLE', deepLinks: false, note: 'JD Edwards source is unavailable; references are held from the last extract only.' },
};

/* ---- the line ------------------------------------------------------------------------------------ */
export interface GLine {
  key: string;            // txn id: JE-000123#1
  journalId: string; entryNo: string; lineNo: number;
  period: string; postingDate: string; day: number;
  entity: string; entityName: string; currency: string;
  account: string; accountName: string; accountType: string; section: string; group: string; groupName: string;
  local: number;          // signed, functional currency (debit +)
  usd: number;            // signed, translated at the monthly average rate
  project: string | null; costCenter: string | null; property: string | null;
  description: string; recordType: 'SOURCE_GL';
  connector: string; externalId: string;
  vendor: string | null; invoiceRef: string | null; poRef: string | null; contractRef: string | null; approvalRef: string | null;
  approvalRequired: boolean;
}

export const DIMENSION_KEYS = ['entity', 'account', 'accountGroup', 'project', 'costCenter', 'property', 'vendor', 'currency', 'period', 'description'] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export interface PopulationFilter {
  periodStart?: string; periodEnd?: string;
  entities?: string[]; accounts?: string[];          // account codes; a group code includes its children
  vendor?: string; project?: string; costCenter?: string; property?: string; currency?: string;
  recordType?: string; minAbsUsd?: number; text?: string;
  /** a vendor filter reads the spend leg; set to include the AP liability offset as well */
  includeApLiability?: boolean;
}
export interface PopulationDef { id: string; filter: PopulationFilter; sort: 'amount_desc' | 'amount_asc' | 'date_asc' | 'date_desc'; createdAt: string; label: string }

const hash = (s: string) => createHash('sha1').update(s).digest('hex');
const h32 = (s: string) => parseInt(hash(s).slice(0, 8), 16);
const VENDORS: Record<string, string[]> = {
  CIP: ['Siemens Energy', 'Schneider Electric', 'Vertiv', 'Turner Construction', 'ABB'],
  '50100': ['Dominion Energy', 'National Grid', 'E.ON Energie'], '50200': ['CBRE Facilities', 'JLL'], '50300': ['Lumen Technologies', 'Zayo'],
  '60100': ['HubSpot'], '60200': ['Workday', 'Salesforce'], '60300': ['Deloitte', 'KPMG'], '60400': ['Marsh', 'County Assessor'],
};
const APPROVAL_THRESHOLD_USD = 250_000;

export class GovernedLedger {
  readonly lines: GLine[] = [];
  private readonly pops = new Map<string, PopulationDef>();
  private readonly accts = new Map<string, { code: string; name: string; type: string; section: string; parent: string | null; postable: boolean }>();

  constructor(readonly fin: FinancialDataService) {
    const gl = fin.gl;
    for (const a of gl.accounts) this.accts.set(a.code, { code: a.code, name: a.name, type: a.type, section: a.section, parent: (a.parentId as string | undefined) ?? null, postable: a.isPostable });
    const entName = new Map(gl.entities.map((e) => [e.id as string, e.name]));
    for (const e of gl.entries) {
      const period = e.periodId as string;
      const src = e.source as { connectorId?: string; externalId?: string };
      const apBill = /^Vendor bill|^Capital expenditure/.test(e.description);
      for (const l of e.lines) {
        const a = this.accts.get(l.accountId as string)!;
        const ccy = l.amount.currency as string;
        const local = Number(l.amount.amountMinor) / 10 ** l.amount.scale;
        const rate = FX_RATE_SET.toUsd[ccy]?.[period];
        if (rate === undefined) throw new Error(`no ${FX_RATE_SET.id} rate for ${ccy} ${period}`);
        const dims = l.dimensions as unknown as Record<string, string>;
        const grp = a.parent ?? a.code;
        const key = `${e.id as string}#${l.lineNo}`;
        /* AP extract attribution: one vendor per bill, on both legs of the bill */
        let vendor: string | null = null, invoiceRef: string | null = null, poRef: string | null = null, contractRef: string | null = null, approvalRef: string | null = null;
        const usdAbs = Math.abs(local * rate);
        if (apBill) {
          const expLine = e.lines.find((x) => (x.accountId as string) !== '20100');
          const expAcct = expLine ? this.accts.get(expLine.accountId as string)! : a;
          const pool = VENDORS[expAcct.parent === '15000' ? 'CIP' : expAcct.code] ?? ['Unclassified vendor'];
          const hv = h32(e.id as string);
          vendor = pool[hv % pool.length]!;
          invoiceRef = hv % 8 === 0 ? null : `INV-${(src.connectorId ?? 'erp').toUpperCase()}-${(src.externalId ?? '').split('-').pop()}`;
          const proj = expLine ? ((expLine.dimensions as unknown as Record<string, string>)['PROJECT'] ?? null) : null;
          if (proj) { poRef = `PO-${proj}-${String((hv % 3) + 1).padStart(2, '0')}`; contractRef = `CTR-${vendor.replace(/[^A-Z]/g, '')}-${proj}`; }
        }
        const approvalRequired = apBill && usdAbs >= APPROVAL_THRESHOLD_USD && (this.accts.get(l.accountId as string)!.code !== '20100');
        if (approvalRequired && h32(`${e.id as string}:apr`) % 5 !== 0) approvalRef = `APR-${(e.id as string).slice(3)}`;
        this.lines.push({
          key, journalId: e.id as string, entryNo: e.entryNo, lineNo: l.lineNo, period, postingDate: e.postingDate as string, day: Number((e.postingDate as string).slice(8, 10)),
          entity: l.entityId as string, entityName: entName.get(l.entityId as string) ?? (l.entityId as string), currency: ccy,
          account: a.code, accountName: a.name, accountType: a.type, section: a.section, group: grp, groupName: this.accts.get(grp)?.name ?? a.name,
          local, usd: local * rate, project: dims['PROJECT'] ?? null, costCenter: dims['COST_CENTER'] ?? null, property: dims['PROPERTY'] ?? null,
          description: e.description, recordType: 'SOURCE_GL', connector: src.connectorId ?? 'unknown', externalId: src.externalId ?? '',
          vendor, invoiceRef, poRef, contractRef, approvalRef, approvalRequired,
        });
      }
    }
  }

  /* ---- catalogues -------------------------------------------------------------------------------- */
  periods() { return this.fin.governedPeriods(); }
  account(code: string) { return this.accts.get(code) ?? null; }
  accounts() { return [...this.accts.values()]; }
  childrenOf(code: string) { return this.accounts().filter((a) => a.parent === code).map((a) => a.code); }
  expandAccounts(codes: string[]) { return [...new Set(codes.flatMap((c) => { const k = this.childrenOf(c); return k.length ? k : [c]; }))]; }
  entities() { return this.fin.gl.entities.map((e) => ({ id: e.id as string, name: e.name, currency: e.functionalCurrency as string, connector: this.lines.find((l) => l.entity === (e.id as string))?.connector ?? 'unknown' })); }
  dimensionValues(dim: DimensionKey): string[] { return [...new Set(this.lines.map((l) => this.dimOf(l, dim)).filter((v): v is string => !!v))].sort(); }
  vendors() { return this.dimensionValues('vendor'); }
  priorPeriod(p: string) { const ps = this.periods(); const i = ps.indexOf(p); return i > 0 ? ps[i - 1]! : null; }

  dimOf(l: GLine, dim: DimensionKey): string | null {
    switch (dim) {
      case 'entity': return l.entity; case 'account': return l.account; case 'accountGroup': return l.group; case 'project': return l.project;
      case 'costCenter': return l.costCenter; case 'property': return l.property; case 'vendor': return l.vendor; case 'currency': return l.currency;
      case 'period': return l.period; case 'description': return l.description;
    }
  }
  dimLabel(dim: DimensionKey, v: string | null): string {
    if (v === null) return dim === 'vendor' ? 'No vendor (not an AP line)' : `No ${dim}`;
    if (dim === 'entity') return this.entities().find((e) => e.id === v)?.name ?? v;
    if (dim === 'account' || dim === 'accountGroup') return `${v} ${this.account(v)?.name ?? ''}`.trim();
    if (dim === 'period') return periodLabel(v);
    return v;
  }

  /* ---- populations: definitions with ids, never arrays handed out ---------------------------------- */
  match(f: PopulationFilter, visible: Set<string> | 'ALL'): (l: GLine) => boolean {
    const accts = f.accounts?.length ? new Set(this.expandAccounts(f.accounts)) : null;
    const t = f.text?.toLowerCase();
    return (l) => (visible === 'ALL' || visible.has(l.entity))
      && (!f.periodStart || l.period >= f.periodStart) && (!f.periodEnd || l.period <= f.periodEnd)
      && (!f.entities?.length || f.entities.includes(l.entity)) && (!accts || accts.has(l.account))
      && (!f.vendor || ((l.vendor ?? '').toLowerCase() === f.vendor.toLowerCase() && (f.includeApLiability || l.account !== '20100')))
      && (!f.project || l.project === f.project) && (!f.costCenter || l.costCenter === f.costCenter) && (!f.property || l.property === f.property)
      && (!f.currency || l.currency === f.currency) && (!f.recordType || l.recordType === f.recordType)
      && (f.minAbsUsd === undefined || Math.abs(l.usd) >= f.minAbsUsd)
      && (!t || l.description.toLowerCase().includes(t) || l.key.toLowerCase().includes(t));
  }
  definePopulation(filter: PopulationFilter, sort: PopulationDef['sort'] = 'amount_desc', label = 'Governed population'): PopulationDef {
    /* canonical: key order and array order never change a definition's identity */
    const raw = JSON.parse(JSON.stringify(filter)) as Record<string, unknown>;
    const clean = Object.fromEntries(Object.keys(raw).sort().filter((k) => raw[k] !== '' && raw[k] !== null).map((k) => [k, Array.isArray(raw[k]) ? [...(raw[k] as string[])].sort() : raw[k]])) as PopulationFilter;
    const id = `POP-${hash(JSON.stringify({ clean, sort, snap: this.fin.gl.entries.length })).slice(0, 10).toUpperCase()}`;
    const def = this.pops.get(id) ?? { id, filter: clean, sort, createdAt: new Date().toISOString(), label };
    this.pops.set(id, def);
    return def;
  }
  population(id: string) { return this.pops.get(id) ?? null; }

  /** Count, totals and ONE bounded page. The only way rows leave this class. */
  query(def: PopulationDef, visible: Set<string> | 'ALL', page: { cursor?: number; limit?: number } = {}) {
    const m = this.match(def.filter, visible);
    const rows = this.lines.filter(m);
    const sorters: Record<PopulationDef['sort'], (a: GLine, b: GLine) => number> = {
      amount_desc: (a, b) => Math.abs(b.usd) - Math.abs(a.usd), amount_asc: (a, b) => Math.abs(a.usd) - Math.abs(b.usd),
      date_asc: (a, b) => a.postingDate.localeCompare(b.postingDate) || a.key.localeCompare(b.key), date_desc: (a, b) => b.postingDate.localeCompare(a.postingDate) || a.key.localeCompare(b.key),
    };
    rows.sort(sorters[def.sort]);
    const limit = Math.min(Math.max(page.limit ?? 15, 1), 50), cursor = Math.max(page.cursor ?? 0, 0);
    const debit = rows.reduce((s, r) => s + (r.usd > 0 ? r.usd : 0), 0), credit = rows.reduce((s, r) => s + (r.usd < 0 ? -r.usd : 0), 0);
    return {
      populationId: def.id, rowCount: rows.length, debitUsd: debit, creditUsd: credit, netUsd: debit - credit,
      entities: [...new Set(rows.map((r) => r.entity))], periods: [...new Set(rows.map((r) => r.period))].sort(),
      page: rows.slice(cursor, cursor + limit), cursor, limit, nextCursor: cursor + limit < rows.length ? cursor + limit : null,
      exportHook: { jobType: 'ASYNC_EXPORT' as const, populationId: def.id, formats: ['csv', 'xlsx', 'parquet'], status: 'NOT_STARTED' as const, note: 'Export runs server-side against the population definition; no rows are sent to the browser.' },
      /** internal: aggregations and evidence checks run here, server-side; never serialised to a FinancialObject */
      all: rows,
    };
  }

  /** The one aggregation engine: group a population's lines by any dimension, with an optional comparison window. */
  aggregate(rows: GLine[], dim: DimensionKey, split?: { current: (l: GLine) => boolean; prior: (l: GLine) => boolean }) {
    const m = new Map<string, { key: string | null; label: string; current: number; prior: number; lines: number }>();
    for (const l of rows) {
      const k = this.dimOf(l, dim);
      const id = k ?? '∅';
      const g = m.get(id) ?? { key: k, label: this.dimLabel(dim, k), current: 0, prior: 0, lines: 0 };
      if (!split || split.current(l)) g.current += l.usd; else if (split.prior(l)) g.prior += l.usd;
      g.lines++; m.set(id, g);
    }
    return [...m.values()].map((g) => ({ ...g, change: g.current - g.prior })).sort((a, b) => Math.abs(split ? b.change : b.current) - Math.abs(split ? a.change : a.current));
  }

  /* ---- balances ------------------------------------------------------------------------------------ */
  /** Cumulative balance through a period (balance sheet), or activity in a period (income statement), USD. Balances translate at the closing set, activity at the average set. */
  balanceUsd(accountCodes: string[], period: string, visible: Set<string> | 'ALL', entities?: string[]): number {
    const accts = new Set(this.expandAccounts(accountCodes));
    let v = 0;
    for (const l of this.lines) {
      if (!accts.has(l.account) || (visible !== 'ALL' && !visible.has(l.entity)) || (entities?.length && !entities.includes(l.entity))) continue;
      if (l.section === 'INCOME_STATEMENT') { if (l.period === period) v += l.usd; }
      else if (l.period <= period) v += l.local * (FX_CLOSING_SET.toUsd[l.currency]?.[period] ?? NaN);
    }
    return v;
  }
  /** Presented sign: assets/expenses debit-positive, liabilities/equity/revenue credit-positive. */
  presented(code: string, v: number) { const t = this.account(code)?.type; return t === 'LIABILITY' || t === 'EQUITY' || t === 'REVENUE' ? -v : v; }

  /** Account groups a movement ranking works at: every non-postable parent plus parentless postable accounts. */
  statementGroups() { return this.accounts().filter((a) => !a.parent).map((a) => a.code); }

  /* ---- source references --------------------------------------------------------------------------- */
  sourceRef(l: GLine) {
    const h = SOURCE_HEALTH[l.connector] ?? { system: l.connector, instance: 'unknown', status: 'UNAVAILABLE' as const, deepLinks: false, note: 'Unknown connector.' };
    return {
      erpSystem: h.system, instance: h.instance, transactionType: /Vendor bill|Capital expenditure/.test(l.description) ? 'AP_BILL' : /Customer invoice|Taxable services/.test(l.description) ? 'AR_INVOICE' : /disbursement|receipts/.test(l.description) ? 'PAYMENT' : 'JOURNAL',
      transactionId: l.externalId, journalId: l.journalId, lineId: String(l.lineNo), sourceDocumentReference: l.invoiceRef,
      availability: h.status, deepLink: null as null, note: h.note,
    };
  }

  /* ---- governed find index ------------------------------------------------------------------------- */
  static fmt = money;
}

export const signedMoney = (v: number) => money(v, 'USD');
export const pct = (a: number, b: number) => (Math.abs(b) < 0.5 ? 'n/m' : `${(((a - b) / Math.abs(b)) * 100).toFixed(1)}%`);
