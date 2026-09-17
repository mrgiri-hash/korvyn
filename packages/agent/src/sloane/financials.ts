/**
 * THE GOVERNED FINANCIAL DATA SERVICE the server-side Sloane tools read.
 *
 * Source: @korvyn/core's validated enterprise GL — every entry passes `validateJournalEntry` and every entity's
 * book nets to zero per currency (proven by core's test suite). The seed and volume are the ones the build-time
 * bridge embeds into index.html's GL view, so this is the same book, read server-side.
 *
 * Nothing here is authored as a figure. Every amount is a sum of posted journal lines. Two inputs are declared
 * rather than derived, and both travel with every object that uses them:
 *   - the FX rate set used to present non-USD entities in USD (core models no rates, and translating without
 *     one is an error, not something to paper over);
 *   - the intercompany elimination rule (entries core describes as "Intercompany …" are eliminated when both
 *     parties are inside the scope).
 */
import { buildEnterpriseGL, type EnterpriseGL } from '../../../core/dist/fixtures/enterprise-gl.js';

export const GL_SEED = 42;
export const GL_INVOICES_PER_MONTH = 12;
export const SNAPSHOT_ID = `CORE-EGL-S${GL_SEED}-I${GL_INVOICES_PER_MONTH}`;
export const BASIS = 'US GAAP';

/** Representative monthly average rates to USD. Versioned and cited on every translated object. */
export const FX_RATE_SET = {
  id: 'FXR-2026-AVG-REP-1',
  type: 'monthly average',
  note: 'Representative rate set declared for the prototype; @korvyn/core models no FX rates.',
  toUsd: {
    USD: { '2026-01': 1, '2026-02': 1, '2026-03': 1, '2026-04': 1, '2026-05': 1, '2026-06': 1 },
    GBP: { '2026-01': 1.268, '2026-02': 1.262, '2026-03': 1.271, '2026-04': 1.276, '2026-05': 1.281, '2026-06': 1.279 },
    EUR: { '2026-01': 1.087, '2026-02': 1.081, '2026-03': 1.089, '2026-04': 1.094, '2026-05': 1.098, '2026-06': 1.096 },
    SGD: { '2026-01': 0.744, '2026-02': 0.741, '2026-03': 0.746, '2026-04': 0.748, '2026-05': 0.751, '2026-06': 0.749 },
  } as Record<string, Record<string, number>>,
};

export interface Scope { id: string; name: string; kind: 'GROUP' | 'ENTITY'; entityIds: string[]; presentationCurrency: string }
export interface StatementRow { code: string | null; label: string; level: number; kind: 'line' | 'subtotal' | 'total'; values: number[]; displays: string[] }
export interface IncomeStatementResult {
  scope: Scope; periods: string[]; currency: string; unit: 'millions'; rows: StatementRow[];
  netIncome: number[]; totalRevenue: number[]; eliminated: number[]; journalLines: number;
  fxRateSetId: string | null; translated: boolean; entitiesIncluded: string[];
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const periodLabel = (p: string) => `${MONTH[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
export const money = (v: number, ccy: string) => {
  const sym = ccy === 'USD' ? '$' : ccy === 'GBP' ? '£' : ccy === 'EUR' ? '€' : `${ccy} `;
  /* nothing is a dash, never "$0.00M"; a real amount below the display precision says so rather than reading as zero */
  if (Math.abs(v) < 0.005) return '—';
  const m = Math.abs(v) / 1e6;
  const s = m < 0.005 ? `<${sym}0.01M` : `${sym}${m.toFixed(2)}M`;
  return v < 0 ? `(${s})` : s;
};

export class FinancialDataService {
  readonly gl: EnterpriseGL;
  private readonly accounts: Map<string, { code: string; name: string; type: string; section: string; parent: string | null }>;

  constructor() {
    this.gl = buildEnterpriseGL({ seed: GL_SEED, invoicesPerMonth: GL_INVOICES_PER_MONTH });
    this.accounts = new Map(this.gl.accounts.map((a) => [a.id as string, {
      code: a.code, name: a.name, type: a.type, section: a.section, parent: (a.parentId as string | undefined) ?? null,
    }]));
  }

  governedPeriods(): string[] { return this.gl.periods.map((p) => p.id as string).sort(); }
  workingPeriod(): string { const p = this.governedPeriods(); return p[p.length - 1]!; }

  scopes(): Scope[] {
    const group: Scope = { id: 'GROUP', name: 'Meridian Global Portfolio (consolidated)', kind: 'GROUP', entityIds: this.gl.entities.map((e) => e.id as string), presentationCurrency: 'USD' };
    return [group, ...this.gl.entities.map((e): Scope => ({ id: e.id as string, name: e.name, kind: 'ENTITY', entityIds: [e.id as string], presentationCurrency: e.functionalCurrency as string }))];
  }
  scope(id: string): Scope | null { return this.scopes().find((s) => s.id === id) ?? null; }

  accountsMatching(text: string, limit = 8) {
    const t = text.toLowerCase();
    return [...this.accounts.values()].filter((a) => t.includes(a.code) || (a.name.length > 5 && t.includes(a.name.toLowerCase()))).slice(0, limit);
  }

  /** Monthly income statement for a scope, one column per period. Revenue positive, costs positive, net income = revenue − costs. */
  incomeStatement(scopeId: string, periods: string[]): IncomeStatementResult {
    const scope = this.scope(scopeId);
    if (!scope) throw new Error(`unknown scope ${scopeId}`);
    const inScope = new Set(scope.entityIds);
    const idx = new Map(periods.map((p, i) => [p, i]));
    const translate = scope.kind === 'GROUP';
    const n = periods.length;
    const byAcct = new Map<string, number[]>();
    const eliminated = new Array<number>(n).fill(0);
    let journalLines = 0;
    const icParties = new Set(['MGP-REIT', 'MDH']);
    const eliminateIc = [...icParties].every((e) => inScope.has(e));

    for (const e of this.gl.entries) {
      const col = idx.get(e.periodId as string);
      if (col === undefined) continue;
      for (const l of e.lines) {
        if (!inScope.has(l.entityId as string)) continue;
        const a = this.accounts.get(l.accountId as string);
        if (!a || a.section !== 'INCOME_STATEMENT') continue;
        journalLines++;
        const ccy = l.amount.currency as string;
        const rate = translate ? FX_RATE_SET.toUsd[ccy]?.[e.periodId as string] : 1;
        if (rate === undefined) throw new Error(`no ${FX_RATE_SET.id} rate for ${ccy} in ${e.periodId as string}`);
        const signed = (Number(l.amount.amountMinor) / 10 ** l.amount.scale) * rate;
        /* presentation: revenue as a positive figure (credits), expenses as positive costs (debits) */
        const presented = a.type === 'REVENUE' ? -signed : signed;
        if (eliminateIc && /^Intercompany/i.test(e.description)) { eliminated[col] += a.type === 'REVENUE' ? presented : 0; continue; }
        const arr = byAcct.get(a.code) ?? new Array<number>(n).fill(0);
        arr[col] += presented;
        byAcct.set(a.code, arr);
      }
    }

    const ccy = scope.presentationCurrency;
    const fmt = (vs: number[]) => vs.map((v) => money(v, ccy));
    const rows: StatementRow[] = [];
    const sum = (codes: string[]) => { const t = new Array<number>(n).fill(0); for (const c of codes) (byAcct.get(c) ?? []).forEach((v, i) => (t[i] += v)); return t; };
    const childCodes = (parent: string) => [...this.accounts.values()].filter((a) => a.parent === parent).map((a) => a.code);
    const section = (parent: string, label: string, total: string) => {
      const kids = childCodes(parent).filter((c) => byAcct.has(c));
      rows.push({ code: parent, label, level: 0, kind: 'line', values: new Array<number>(n).fill(0), displays: new Array<string>(n).fill('') });
      for (const c of kids) { const v = byAcct.get(c)!; rows.push({ code: c, label: this.accounts.get(c)!.name, level: 1, kind: 'line', values: v, displays: fmt(v) }); }
      const t = sum(kids); rows.push({ code: null, label: total, level: 0, kind: 'subtotal', values: t, displays: fmt(t) });
      return t;
    };
    const rev = section('40000', 'Revenue', 'Total revenue');
    const cop = section('50000', 'Cost of operations', 'Total cost of operations');
    const opx = section('60000', 'Operating expenses', 'Total operating expenses');
    const noi = rev.map((v, i) => v - cop[i]! - opx[i]!);
    rows.push({ code: null, label: 'Net operating income', level: 0, kind: 'subtotal', values: noi, displays: fmt(noi) });
    const dna = section('65000', 'Depreciation & amortization', 'Total depreciation & amortization');
    const oi = noi.map((v, i) => v - dna[i]!);
    rows.push({ code: null, label: 'Operating income', level: 0, kind: 'subtotal', values: oi, displays: fmt(oi) });
    const oth = section('70000', 'Other income & expense', 'Total other income & expense');
    const ni = oi.map((v, i) => v - oth[i]!);
    rows.push({ code: null, label: 'Net income', level: 0, kind: 'total', values: ni, displays: fmt(ni) });
    /* header rows carry no figures; drop their empty display cells so nothing reads as a zero */
    for (const r of rows) if (r.level === 0 && r.kind === 'line') r.displays = new Array<string>(n).fill('');

    return {
      scope, periods, currency: ccy, unit: 'millions', rows, netIncome: ni, totalRevenue: rev, eliminated, journalLines,
      fxRateSetId: translate ? FX_RATE_SET.id : null, translated: translate && scope.entityIds.some((id) => this.gl.entities.find((e) => (e.id as string) === id)?.functionalCurrency !== 'USD'),
      entitiesIncluded: scope.entityIds,
    };
  }

  /** Cumulative trial balance for ONE entity through a period, in its functional currency. */
  trialBalance(entityId: string, through: string) {
    const ent = this.gl.entities.find((e) => (e.id as string) === entityId);
    if (!ent) throw new Error(`unknown entity ${entityId}`);
    const bal = new Map<string, number>();
    let lines = 0;
    for (const e of this.gl.entries) {
      if ((e.periodId as string) > through) continue;
      for (const l of e.lines) {
        if ((l.entityId as string) !== entityId) continue;
        lines++;
        bal.set(l.accountId as string, (bal.get(l.accountId as string) ?? 0) + Number(l.amount.amountMinor) / 10 ** l.amount.scale);
      }
    }
    const rows = [...bal.entries()].filter(([, v]) => Math.abs(v) >= 0.005).sort(([a], [b]) => a.localeCompare(b)).map(([id, v]) => {
      const a = this.accounts.get(id)!;
      return { code: a.code, name: a.name, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 };
    });
    const debit = rows.reduce((s, r) => s + r.debit, 0), credit = rows.reduce((s, r) => s + r.credit, 0);
    return { entity: { id: entityId, name: ent.name }, through, currency: ent.functionalCurrency as string, rows, debit, credit, difference: debit - credit, journalLines: lines };
  }
}
