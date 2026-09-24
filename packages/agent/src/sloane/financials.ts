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

/* ================================================================================================
   PHASE 2.6.1 — CONSOLIDATION, DECLARED ONCE
   ================================================================================================ */

/**
 * THE DEFECT THIS EXISTS TO REMOVE.
 *
 * The consolidated income statement eliminated intercompany activity inside `FinancialDataService`, as a local
 * filter over journal entries. `GovernedLedger` — which every analytical service reads — knew nothing about it.
 * So a consolidated revenue figure and the accounts beneath it came from two different economic populations, and
 * Sloane could explain a post-elimination movement with pre-elimination drivers. The figures were each internally
 * right and they did not reconcile, which is the worst shape a financial system can be in.
 *
 * The rule now lives HERE, in the population layer, and the statement consumes it. One consolidation truth.
 *
 * WHAT AN ELIMINATION IS, ON THIS BOOK. Each side of an intercompany transaction is its OWN journal entry in its
 * own entity — the management fee is a charge in MGP-REIT and an expense in MDH — so a line cannot be judged by
 * the entities its entry touches. What pairs them is the RELATIONSHIP, and a relationship eliminates only when
 * EVERY party to it is inside the population: two entities consolidated together net their mutual trading, and
 * the same entities looked at singly do not.
 *
 * §17 — the relationships are DATA. A second one, a third party, a relationship at another level of the
 * hierarchy or a different pattern is an entry in this list, not a change to the engine.
 */
export interface IntercompanyRelationship {
  id: string;
  label: string;
  /** every entity party to the relationship; it eliminates only when all of them are consolidated together */
  parties: string[];
  /** how a journal entry announces that it belongs to this relationship */
  match: RegExp;
  /**
   * The statement sections this relationship is eliminated in. A relationship Korvyn cannot yet eliminate
   * soundly declares an empty list and says why, rather than eliminating it badly.
   */
  sections: readonly string[];
  /** stated when `sections` is empty: what would have to exist first */
  notEliminated?: string;
}
export const IC_RELATIONSHIPS: readonly IntercompanyRelationship[] = [
  { id: 'IC-MGMT-FEE', label: 'Intercompany management fee', parties: ['MGP-REIT', 'MDH'],
    match: /^Intercompany management fee/i, sections: ['INCOME_STATEMENT'] },
  /**
   * PHASE 2.6.1 — DECLARED, AND DELIBERATELY NOT ELIMINATED, BECAUSE ELIMINATING IT BADLY IS WORSE.
   *
   * Intercompany receivable and payable must eliminate in a consolidated balance sheet, and on this book they do
   * not match: $35.64M receivable against $29.46M payable at Jun 2026, a $6.18M unmatched position that Phase 3A
   * recorded as a genuine control finding. Removing both sides makes them net to nothing and pushes the $6.18M
   * into the translation adjustment, which is computed as a residual — so a real reconciliation failure would
   * disappear into a plug and read as FX. Measured, before this list gained a `sections` field.
   *
   * Eliminating a balance-sheet relationship soundly needs intercompany MATCHING, which is its own engine and
   * its own phase. Until then the two lines stay visible, which is what a controller needs to see.
   */
  { id: 'IC-FUNDING', label: 'Intercompany funding', parties: ['MDH', 'MER-UK', 'MER-DE', 'MER-SG'],
    match: /^Intercompany funding/i, sections: [],
    notEliminated: 'intercompany receivable and payable do not match on this book, and netting them would hide the difference in the translation residual; eliminating a balance-sheet relationship needs intercompany matching' },
];

/** the relationship a journal entry belongs to, or null. Reads the entry, never an account or an amount. */
export const icRelationshipOf = (description: string): IntercompanyRelationship | null =>
  IC_RELATIONSHIPS.find((r) => r.match.test(description)) ?? null;

/**
 * §5 — SOURCE AND CONSOLIDATED ARE BOTH VALID VIEWS, AND A READER MUST NEVER CROSS BETWEEN THEM BY ACCIDENT.
 *
 *   CONSOLIDATED       intercompany activity internal to the population is removed. The default, because a
 *                      question asked of a consolidated statement is a question about the consolidated group.
 *   PRE_ELIMINATION    the ledger as posted. Valid, and only when it was ASKED for.
 *   ELIMINATIONS_ONLY  just what was removed — what makes the lineage between the two traceable (§6).
 */
export const ELIMINATION_TREATMENTS = ['CONSOLIDATED', 'PRE_ELIMINATION', 'ELIMINATIONS_ONLY'] as const;
export type EliminationTreatment = (typeof ELIMINATION_TREATMENTS)[number];

/**
 * Does this line eliminate in a population covering `scope`? `null` means the population spans everything the
 * reader can see, so every party is inside it by definition.
 *
 * A relationship whose parties are only PARTLY inside the population does NOT eliminate: the trading is external
 * to that population and removing it would understate it. That is the same rule the statement has always applied,
 * and it is why a single entity's own books still show the fee it charged its parent.
 */
export function eliminatesIn(description: string, scope: ReadonlySet<string> | null, section = 'INCOME_STATEMENT'): boolean {
  const r = icRelationshipOf(description);
  if (!r || !r.sections.includes(section)) return false;
  return scope === null || r.parties.every((e) => scope.has(e));
}

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
  /**
   * PHASE 2.6 §9/§11 — THE CANONICAL STATEMENT COMPONENTS, ONE PER PERIOD, FROM THE ONE PLACE THAT COMPUTES THEM.
   *
   * Every derived metric and every ranked comparison reads these, so a metric, a driver and the statement can
   * never disagree about what revenue was. They could not simply be recomputed elsewhere: `isValues()` sums the
   * same account groups WITHOUT the intercompany elimination this statement applies, so revenue and operating
   * expenses each came out $0.35M higher — offsetting exactly, which is why net income matched and the
   * discrepancy stayed invisible until a comparison put both on one screen.
   */
  components: { rev: number; cop: number; opx: number; dna: number; oth: number; noi: number; ni: number }[];
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
    /* PHASE 2.6.1 §16 — ONE CONSOLIDATION TRUTH. This used to carry its own hard-coded pair, and the ledger
       every analytical service reads carried nothing, so a statement figure and the accounts beneath it came
       from two populations. The rule is `governed.ts`'s now; the statement CONSUMES it. */

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
        if (eliminatesIn(e.description, inScope)) { eliminated[col] += a.type === 'REVENUE' ? presented : 0; continue; }
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
      components: periods.map((_, i) => ({ rev: rev[i]!, cop: cop[i]!, opx: opx[i]!, dna: dna[i]!, oth: oth[i]!, noi: noi[i]!, ni: ni[i]! })),
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
