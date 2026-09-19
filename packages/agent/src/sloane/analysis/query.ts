/**
 * PHASE 8C — THE FINANCIAL ANALYSIS QUERY SERVICE.
 *
 * Executes an AnalysisDefinition against the governed ledger, server-side, in one pass over the actor's visible lines:
 * validate → filter → assign each line to its canonical row path and to every column it contributes to → build the
 * hierarchy → apply expansion, value filters, sorts and top-N → page the visible rows. Amounts come from
 * `GovernedLedger.contribution`, the same semantic `balanceUsd` and every statement tool read, so a grid cell and a
 * statement line cannot disagree. Variance is Korvyn's subtraction of two governed amounts; nothing is computed by a
 * model and nothing is aggregated in the browser.
 *
 * Every row id is a canonical member path (`type:ASSET/account:15000/project:SV-PH2`) and every cell id is
 * `rowId§columnId`; `cell()` re-derives a CellContext — including the governed population behind it — from the id
 * alone. At enterprise scale the pass below is the shape of a server-side GROUP BY ROLLUP over the ledger store; the
 * definition, the ids and the paging contract do not change.
 */
import { MAPPING_VERSION } from '../artifacts/tieout.js';
import type { FinancialDataService } from '../financials.js';
import { money, periodLabel } from '../financials.js';
import type { GLine, GovernedLedger, PopulationFilter } from '../governed.js';
import { REGION_OF } from '../semantic/graph.js';
import { fiscalQuarterOf, fiscalQuarterRange, fiscalYearOf, fiscalYearRange } from '../semantic/time.js';
import type { Actor, Visible } from '../tools.js';
import { type AnalysisDefinition, type AnalysisResult, type CellContext, DIMENSIONS, type DimensionId, type GridColumn, type GridRow, MEASURES, type MeasureId } from './model.js';

export interface QueryDeps { gl: GovernedLedger; data: FinancialDataService; actor: Actor; visible: Visible }
const BASE: MeasureId[] = ['ENDING_BALANCE', 'BEGINNING_BALANCE', 'ACTIVITY', 'DEBIT', 'CREDIT', 'YTD_ACTIVITY', 'QTD_ACTIVITY', 'PRIOR_PERIOD', 'PRIOR_YEAR'];
const SEP = '§';
const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const TYPE_LABEL: Record<string, string> = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity', REVENUE: 'Revenue', EXPENSE: 'Expenses' };
const presentedSign = (type: string) => (type === 'LIABILITY' || type === 'EQUITY' || type === 'REVENUE' ? -1 : 1);
const isBS = (l: GLine) => l.section !== 'INCOME_STATEMENT';

interface Node { id: string; memberIds: string[]; label: string; level: number; dimension: string; kind: GridRow['kind']; parent: string | null; children: string[]; order: string; values: number[]; structural: boolean; dimIndex: number; lastOfDim: boolean; hasKids: boolean }
interface Col extends GridColumn { base: boolean; memberFilter: string | null }

export class FinancialAnalysisQueryService {
  constructor(private readonly d: QueryDeps) {}

  private entity(id: string) { return this.d.gl.entities().find((e) => e.id === id) ?? null; }
  private region(entityId: string) { const e = (this.d.data.gl.entities as unknown as { id: string; countryCode?: string }[]).find((x) => x.id === entityId); return REGION_OF[e?.countryCode ?? ''] ?? null; }
  private system(l: GLine) { return l.connector; }

  /** the canonical member a line carries for a dimension (null member → `dim:∅`) */
  member(l: GLine, dim: DimensionId, variant?: string): { id: string; label: string } {
    const gl = this.d.gl;
    const v = (x: string | null, lbl?: string) => ({ id: `${dim}${variant && variant !== 'EFFECTIVE' ? `.${variant.toLowerCase()}` : ''}:${x ?? '∅'}`, label: x === null ? (dim === 'vendor' ? (variant === 'GOVERNED' ? 'No governed vendor' : 'No vendor') : `No ${dim === 'costCenter' ? 'cost center' : dim}`) : lbl ?? x });
    switch (dim) {
      case 'account': return v(l.account, `${l.account} ${l.accountName}`);
      case 'financialLine': return { id: `fsline:${l.group}`, label: `${l.group} ${l.groupName}` };
      case 'entity': return v(l.entity, l.entityName);
      case 'region': { const r = this.region(l.entity); return v(r?.id ?? null, r?.name); }
      /* the server holds no governed override for these attributes: GOVERNED is empty and EFFECTIVE is the source value */
      case 'project': return variant === 'GOVERNED' ? v(null) : v(l.project);
      case 'vendor': return variant === 'GOVERNED' ? v(null) : v(l.vendor);
      case 'property': return v(l.property);
      case 'costCenter': return v(l.costCenter);
      case 'currency': return v(l.currency);
      case 'recordType': return v(l.recordType, 'Source GL');
      case 'sourceSystem': { const s = this.system(l); return v(s, gl.sourceRef(l).erpSystem); }
      case 'period': return v(l.period, periodLabel(l.period));
      case 'book': return v('CORE-GL', 'Core GL · US GAAP');
    }
  }

  validate(def: AnalysisDefinition): { errors: string[]; warnings: string[] } {
    const errors: string[] = [], warnings: string[] = [];
    const gp = this.d.data.governedPeriods();
    for (const a of [...def.rows, ...def.columns]) { const s = DIMENSIONS.find((x) => x.id === a.dimension); if (!s) errors.push(`Unknown dimension ${a.dimension}.`); else if (!s.governed) errors.push(`${s.label} is not available: ${s.note}.`); }
    for (const p of def.periods) if (!gp.includes(p)) errors.push(`${periodLabel(p)} is not a governed period.`);
    if (!def.periods.length) errors.push('An analysis needs at least one period.');
    if (!def.periods.includes(def.primaryPeriod)) errors.push('The primary period must be one of the analysis periods.');
    for (const m of def.measures) if (!MEASURES.some((x) => x.id === m)) errors.push(`Unknown measure ${m}.`);
    if (!def.measures.some((m) => BASE.includes(m))) errors.push('An analysis needs a base measure (balance or activity).');
    if (def.measures.includes('PRIOR_YEAR')) warnings.push('Prior year is not in the governed ledger (FY2025 is not held), so that column is blank.');
    if (def.comparison?.basis === 'PRIOR_YEAR') warnings.push('A prior-year comparison is not available: FY2025 is not in the governed ledger.');
    if (def.book.accountingBookId !== 'CORE-GL') errors.push(`Book ${def.book.accountingBookId} is not held on this server.`);
    if (def.scope !== 'GROUP' && this.d.visible !== 'ALL' && !this.d.visible.has(def.scope)) errors.push('That scope is outside your access.');
    return { errors, warnings };
  }

  /** the lines the definition reads: the actor's visible entities, the scope, the statement and the member filters */
  private lines(def: AnalysisDefinition): GLine[] {
    const vis = this.d.visible, scopeEnts = def.scope === 'GROUP' ? null : new Set(this.d.data.scope(def.scope)?.entityIds ?? [def.scope]);
    const f = def.filters.map((x) => ({ ...x, set: new Set(x.values) }));
    return this.d.gl.lines.filter((l) => {
      if (vis !== 'ALL' && !vis.has(l.entity)) return false;
      if (scopeEnts && !scopeEnts.has(l.entity)) return false;
      if (def.statement === 'BS' && !isBS(l)) return false;
      if (def.statement === 'IS' && isBS(l)) return false;
      if (def.accountTypes?.length && !def.accountTypes.includes(l.accountType)) return false;
      for (const x of f) {
        const hit = x.dimension === 'account' ? x.set.has(l.account) || x.set.has(l.group) : x.set.has(this.member(l, x.dimension).id.slice(x.dimension.length + 1));
        if (x.op === 'IN' ? !hit : hit) return false;
      }
      return true;
    });
  }

  private columns(def: AnalysisDefinition, lines: GLine[]): Col[] {
    const base = def.measures.filter((m) => BASE.includes(m));
    const cols: Col[] = [];
    const colDim = def.columns.find((c) => c.dimension !== 'period');
    if (colDim) {
      const ms = new Map<string, string>();
      for (const l of lines) { const m = this.member(l, colDim.dimension, colDim.variant); ms.set(m.id, m.label); }
      for (const [id, label] of [...ms].sort((a, b) => a[1].localeCompare(b[1]))) for (const m of base)
        cols.push({ id: `M:${id}:${m}:${def.primaryPeriod}`, label, sublabel: base.length > 1 ? MEASURES.find((x) => x.id === m)!.label : periodLabel(def.primaryPeriod), measure: m, period: def.primaryPeriod, memberIds: [id], base: true, memberFilter: id });
      return cols;
    }
    const periodsOnCols = def.columns.some((c) => c.dimension === 'period') || !def.rows.some((r) => r.dimension === 'period');
    const ps = periodsOnCols ? def.periods : [def.primaryPeriod];
    for (const p of ps) for (const m of base) cols.push({ id: `P:${p}:${m}`, label: periodLabel(p), sublabel: base.length > 1 ? MEASURES.find((x) => x.id === m)!.label : null, measure: m, period: p, memberIds: [`period:${p}`], base: true, memberFilter: null });
    const cmp = this.comparisonPeriod(def);
    if (cmp && periodsOnCols && def.periods.includes(cmp)) {
      const m = base[0]!;
      if (def.measures.includes('VARIANCE')) cols.push({ id: `V:VARIANCE:${def.primaryPeriod}:${cmp}:${m}`, label: 'Variance', sublabel: `${periodLabel(def.primaryPeriod)} vs ${periodLabel(cmp)}`, measure: 'VARIANCE', period: def.primaryPeriod, memberIds: [`period:${def.primaryPeriod}`, `period:${cmp}`], base: false, memberFilter: null });
      if (def.measures.includes('VARIANCE_PCT')) cols.push({ id: `V:VARIANCE_PCT:${def.primaryPeriod}:${cmp}:${m}`, label: 'Variance %', sublabel: null, measure: 'VARIANCE_PCT', period: def.primaryPeriod, memberIds: [`period:${def.primaryPeriod}`, `period:${cmp}`], base: false, memberFilter: null });
    }
    return cols;
  }
  comparisonPeriod(def: AnalysisDefinition): string | null {
    if (!def.comparison) return null;
    if (def.comparison.basis === 'PERIOD') return def.comparison.period;
    if (def.comparison.basis === 'PRIOR_YEAR') return null;
    return this.d.gl.priorPeriod(def.primaryPeriod);
  }

  /** one line's contribution to a base measure at a period */
  private amount(l: GLine, m: MeasureId, p: string): number {
    const gl = this.d.gl, gp = this.d.data.governedPeriods();
    switch (m) {
      case 'ENDING_BALANCE': return gl.contribution(l, p, 'ENDING');
      case 'ACTIVITY': return gl.contribution(l, p, 'ACTIVITY');
      case 'DEBIT': { const a = gl.contribution(l, p, 'ACTIVITY'); return a > 0 ? a : 0; }
      case 'CREDIT': { const a = gl.contribution(l, p, 'ACTIVITY'); return a < 0 ? -a : 0; }
      case 'BEGINNING_BALANCE': case 'PRIOR_PERIOD': { const q = gl.priorPeriod(p); return q ? gl.contribution(l, q, 'ENDING') : NaN; }
      case 'YTD_ACTIVITY': { const r = fiscalYearRange(fiscalYearOf(p)); return l.period >= r.start && l.period <= p && gp.includes(l.period) ? l.usd : 0; }
      case 'QTD_ACTIVITY': { const q = fiscalQuarterOf(p), r = fiscalQuarterRange(q.fy, q.q); return l.period >= r.start && l.period <= p ? l.usd : 0; }
      case 'PRIOR_YEAR': return NaN;
      default: return 0;
    }
  }

  /** the canonical row path of a line: hierarchy levels of the account dimension, then one member per other dimension */
  private path(l: GLine, def: AnalysisDefinition, rowPeriod: string | null): { id: string; label: string; dimension: string; structural: boolean; order: string; dimIndex: number; lastOfDim: boolean }[] {
    const out: ReturnType<FinancialAnalysisQueryService['path']> = [];
    def.rows.forEach((r, i) => {
      if (r.dimension === 'account') {
        const levels = def.hierarchies.find((h) => h.dimension === 'account')?.levels ?? ['group', 'account'];
        const acct = this.d.gl.account(l.account)!;
        const segs: [string, string, boolean, string][] = [];
        if (levels.includes('statement')) segs.push([`statement:${isBS(l) ? 'BS' : 'IS'}`, isBS(l) ? 'Balance sheet' : 'Income statement', true, isBS(l) ? '1' : '2']);
        if (levels.includes('type')) segs.push([`type:${acct.type}`, TYPE_LABEL[acct.type] ?? acct.type, true, String(TYPE_ORDER.indexOf(acct.type))]);
        if (levels.includes('group')) segs.push([`account:${l.group}`, `${l.group} ${l.groupName}`, false, l.group]);
        if (levels.includes('account') && l.account !== l.group) segs.push([`account:${l.account}`, `${l.account} ${l.accountName}`, false, l.account]);
        segs.forEach(([id, label, st, ord], k) => out.push({ id, label, dimension: 'account', structural: st, order: ord, dimIndex: i, lastOfDim: k === segs.length - 1 }));
      } else if (r.dimension === 'period') {
        out.push({ id: `period:${rowPeriod}`, label: periodLabel(rowPeriod!), dimension: 'period', structural: false, order: rowPeriod!, dimIndex: i, lastOfDim: true });
      } else {
        const m = this.member(l, r.dimension, r.variant);
        out.push({ id: m.id, label: m.label, dimension: r.dimension, structural: false, order: m.label, dimIndex: i, lastOfDim: true });
      }
    });
    return out;
  }

  run(def: AnalysisDefinition, page: { cursor?: number; limit?: number } = {}): AnalysisResult {
    const lines = this.lines(def), cols = this.columns(def, lines);
    const nodes = new Map<string, Node>(), roots: string[] = [];
    const statementMode = def.analysisType === 'STATEMENT';
    const rowPeriods = def.rows.some((r) => r.dimension === 'period') ? def.periods : [null];
    const baseCols = cols.map((c, i) => [c, i] as const).filter(([c]) => c.base);
    const colDim = def.columns.find((c) => c.dimension !== 'period');
    for (const l of lines) {
      const sign = statementMode ? presentedSign(l.accountType) : 1;
      const cm = colDim ? this.member(l, colDim.dimension, colDim.variant).id : null;
      for (const rp of rowPeriods) {
        const segs = this.path(l, def, rp);
        let parent: string | null = null, pathId = '';
        const memberIds: string[] = [];
        for (const [k, s] of segs.entries()) {
          pathId = pathId ? `${pathId}/${s.id}` : s.id; memberIds.push(s.id);
          let n = nodes.get(pathId);
          if (!n) {
            n = { id: pathId, memberIds: [...memberIds], label: s.label, level: k, dimension: s.dimension, kind: s.structural ? 'section' : 'leaf', parent, children: [], order: s.order, values: cols.map(() => 0), structural: s.structural, dimIndex: s.dimIndex, lastOfDim: s.lastOfDim, hasKids: false };
            nodes.set(pathId, n);
            if (parent) nodes.get(parent)!.children.push(pathId); else roots.push(pathId);
          }
          for (const [c, i] of baseCols) {
            if (c.memberFilter && c.memberFilter !== cm) continue;
            const p = rp ?? c.period!;
            n.values[i] += sign * this.amount(l, c.measure, p);
          }
          parent = pathId;
        }
      }
    }
    /* derived columns: variance of the base measure between the primary and the comparison period */
    const cmp = this.comparisonPeriod(def);
    cols.forEach((c, i) => {
      if (c.base) return;
      const baseM = c.id.split(':').at(-1) as MeasureId;
      const a = cols.findIndex((x) => x.base && x.period === def.primaryPeriod && x.measure === baseM), b = cols.findIndex((x) => x.base && x.period === cmp && x.measure === baseM);
      for (const n of nodes.values()) {
        const va = n.values[a]!, vb = n.values[b]!;
        n.values[i] = c.measure === 'VARIANCE' ? va - vb : Math.abs(vb) > 500 ? (va - vb) / Math.abs(vb) : NaN;
      }
    });
    for (const n of nodes.values()) { n.hasKids = n.children.length > 0; if (!n.structural && n.hasKids && !n.lastOfDim) n.kind = 'group'; else if (!n.structural && n.hasKids) n.kind = 'group'; }

    /* expansion: structure open; account groups closed; the last level of a dimension opens onto the next dimension */
    const open = (n: Node) => {
      if (def.collapsed.includes(n.id)) return false;
      if (def.expanded.includes(n.id)) return true;
      if (n.structural) return true;
      if (!n.lastOfDim) return false;
      return n.dimIndex < def.rows.length - 1;
    };
    const vIdx = cols.findIndex((c) => c.measure === 'VARIANCE');
    const pIdx = Math.max(0, cols.findIndex((c) => c.base && c.period === def.primaryPeriod));
    const metric = (n: Node) => (def.valueFilter?.on === 'VARIANCE' && vIdx >= 0 ? n.values[vIdx]! : n.values[pIdx]!);
    const passes = new Map<string, boolean>();
    const pass = (id: string): boolean => {
      if (passes.has(id)) return passes.get(id)!;
      const n = nodes.get(id)!;
      const pctIdx = cols.findIndex((c) => c.measure === 'VARIANCE');
      const pctOk = () => { const mp = def.valueFilter?.minPct; if (!mp || pctIdx < 0) return true; const a = cols.findIndex((c) => c.base && c.period === def.primaryPeriod), b = cols.findIndex((c) => c.base && c.period === this.comparisonPeriod(def)); const base = b >= 0 ? Math.abs(n.values[b]!) : 0; return base > 500 && Math.abs(n.values[pctIdx]!) / base >= mp; };
      const self = !def.valueFilter || (!n.structural && Math.abs(metric(n)) >= def.valueFilter.minAbs * 1e6 && pctOk());
      const r = self || n.children.some(pass);
      passes.set(id, r); return r;
    };
    const sortOf = (ids: string[], dimIndex: number) => {
      const s = def.sorts[0];
      const arr = ids.map((x) => nodes.get(x)!);
      if (!s || arr.some((n) => n.structural)) return arr.sort((a, b) => a.order.localeCompare(b.order, undefined, { numeric: true }));
      const ci = s.by === 'VARIANCE' && vIdx >= 0 ? vIdx : s.period ? Math.max(0, cols.findIndex((c) => c.base && c.period === s.period)) : pIdx;
      const val = (n: Node) => (s.by === 'LABEL' ? 0 : Math.abs(n.values[ci] ?? 0));
      arr.sort((a, b) => (s.by === 'LABEL' ? a.label.localeCompare(b.label) : val(b) - val(a)) * (s.dir === 'ASC' ? -1 : 1));
      void dimIndex; return arr;
    };
    const out: Node[] = [];
    const walk = (ids: string[]) => {
      let list = sortOf(ids.filter(pass), 0);
      if (def.topN && list.length && !list[0]!.structural && list[0]!.dimIndex === 0) list = list.slice(0, def.topN);
      for (const n of list) { out.push(n); if (n.hasKids && open(n)) walk(n.children); }
    };
    walk(roots);

    const fmt = (c: Col, v: number) => (!Number.isFinite(v) ? '—' : c.measure === 'VARIANCE_PCT' ? `${v < 0 ? '(' : ''}${Math.abs(v * 100).toFixed(1)}%${v < 0 ? ')' : ''}` : money(v, 'USD'));
    /* a node ABOVE the account dimension in a statement or trial balance adds balances of different types (and, in a
       trial balance, balance-sheet balances with one month of P&L): that sum is not a figure anyone should tie to */
    const ai = def.rows.findIndex((r) => r.dimension === 'account');
    const mixed = (n: Node) => def.analysisType !== 'ANALYSIS' && ai > 0 && n.dimIndex < ai && !def.filters.some((f) => f.dimension === 'account' && f.op === 'IN' && f.values.length === 1);
    const toRow = (n: Node): GridRow => ({
      id: n.id, memberIds: n.memberIds, label: n.label, level: n.level, dimension: n.dimension, kind: n.kind,
      expandable: n.hasKids, expanded: n.hasKids && open(n),
      /* a statement section mixes signs and totals nothing a reader should tie to: its amounts are left blank */
      cells: cols.map((c, i) => { const blank = statementMode && n.id.split('/').length === 1 && n.id.startsWith('statement:');
        const v = blank || mixed(n) ? NaN : n.values[i]!; return { id: `${n.id}${SEP}${c.id}`, value: Number.isFinite(v) ? v : null, display: fmt(c, v), drillable: !blank && Number.isFinite(v) && c.measure !== 'VARIANCE_PCT' }; }),
    });
    const limit = Math.min(Math.max(page.limit ?? 200, 1), 500), cursor = Math.max(page.cursor ?? 0, 0);
    const rows = out.slice(cursor, cursor + limit).map(toRow);
    /* a total only where adding the rows means something: an activity analysis without the statement's mixed signs */
    let totals: GridRow | null = null;
    if (def.analysisType === 'ANALYSIS' && def.rows[0]?.dimension !== 'account' && roots.length) {
      const vals = cols.map((_, i) => roots.filter(pass).reduce((s, id) => s + nodes.get(id)!.values[i]!, 0));
      cols.forEach((c, i) => { if (c.measure === 'VARIANCE_PCT') { const a = cols.findIndex((x) => x.base && x.period === def.primaryPeriod), b = cols.findIndex((x) => x.base && x.period === cmp); vals[i] = Math.abs(vals[b]!) > 500 ? (vals[a]! - vals[b]!) / Math.abs(vals[b]!) : NaN; } });
      totals = { id: 'total', memberIds: [], label: 'Total', level: 0, dimension: 'total', kind: 'total', expandable: false, expanded: false, cells: cols.map((c, i) => ({ id: `total${SEP}${c.id}`, value: Number.isFinite(vals[i]!) ? vals[i]! : null, display: fmt(c, vals[i]!), drillable: false })) };
    }
    const notes: string[] = [];
    if (def.valueFilter) notes.push(`Rows below ${def.valueFilter.minAbs ? money(def.valueFilter.minAbs * 1e6, 'USD') : ''}${def.valueFilter.minAbs && def.valueFilter.minPct ? ' and ' : ''}${def.valueFilter.minPct ? `${Math.round(def.valueFilter.minPct * 100)}%` : ''} ${def.valueFilter.on === 'VARIANCE' && vIdx >= 0 ? 'of variance' : ''} are hidden; parent totals still include them.`.replace(/\s+/g, ' '));
    if (def.accountTypes?.length) notes.push(`Only ${def.accountTypes.map((x) => x.toLowerCase()).join(' and ')} accounts (the governed account type).`);
    if (def.topN) notes.push(`Top ${def.topN} shown.`);
    if (lines.some((l) => l.currency !== 'USD') && def.measures.includes('ENDING_BALANCE')) notes.push('Balances translate at the period-end rate and activity at the monthly average (FX-CLS / FX-AVG rate sets).');
    const queryId = `AQ-${def.id}-v${def.version}`;
    return { analysisId: def.id, version: def.version, queryId, columns: cols.map(({ base, memberFilter, ...c }) => { void base; void memberFilter; return c; }), rows, rowCount: out.length, returned: rows.length, cursor, nextCursor: cursor + limit < out.length ? cursor + limit : null,
      totals, notes, lineCount: lines.length, periodsRead: def.periods, dataVersion: this.d.gl.dataVersion(), mappingVersion: MAPPING_VERSION };
  }

  /** the CellContext behind a cell id — re-derived from the id, never looked up by label */
  cell(def: AnalysisDefinition, cellId: string): CellContext | null {
    const [rowId, colId] = cellId.split(SEP);
    if (!rowId || !colId) return null;
    const lines = this.lines(def), cols = this.columns(def, lines), col = cols.find((c) => c.id === colId);
    if (!col) return null;
    const rowMembers = rowId === 'total' ? [] : rowId.split('/');
    const res = this.run(def, { limit: 500 });
    const row = rowId === 'total' ? res.totals : res.rows.find((r) => r.id === rowId);
    const cellValue = row?.cells.find((c) => c.id === cellId) ?? null;
    if (!row || !cellValue) return null;
    /* the lines behind the cell: the analysis lines whose path carries every row member, in the cell's window */
    const cmp = this.comparisonPeriod(def), p = col.period ?? def.primaryPeriod;
    const colMember = col.memberIds.find((m) => !m.startsWith('period:')) ?? null;
    const rowPeriod = rowMembers.find((m) => m.startsWith('period:'))?.slice(7) ?? null;
    const P = rowPeriod ?? p;
    const window = ((): { periodStart: string; periodEnd: string } => {
      const gp = this.d.data.governedPeriods();
      /* the governed account type decides balance vs activity semantics — the row's account, else the statement filter */
      const acct = rowMembers.map((m) => m.match(/^account:(\d+)$/)?.[1]).filter(Boolean).at(-1);
      const bs = acct ? this.d.gl.account(acct)?.section !== 'INCOME_STATEMENT' : rowMembers.includes('statement:BS') || def.statement === 'BS' || (def.statement !== 'IS' && def.analysisType !== 'ANALYSIS');
      if (col.measure === 'VARIANCE' && cmp) return bs ? { periodStart: gp[gp.indexOf(cmp) + 1] ?? P, periodEnd: P } : { periodStart: cmp, periodEnd: P };
      if (col.measure === 'ENDING_BALANCE' && (bs || def.analysisType !== 'ANALYSIS')) return { periodStart: bs ? gp[0]! : P, periodEnd: P };
      if (col.measure === 'YTD_ACTIVITY') return { periodStart: fiscalYearRange(fiscalYearOf(P)).start, periodEnd: P };
      if (col.measure === 'BEGINNING_BALANCE' || col.measure === 'PRIOR_PERIOD') { const q = this.d.gl.priorPeriod(P) ?? P; return { periodStart: bs ? gp[0]! : q, periodEnd: q }; }
      return { periodStart: P, periodEnd: P };
    })();
    const keys: string[] = [];
    for (const l of lines) {
      if (l.period < window.periodStart || l.period > window.periodEnd) continue;
      if (colMember && this.member(l, def.columns.find((c) => c.dimension !== 'period')!.dimension, def.columns.find((c) => c.dimension !== 'period')!.variant).id !== colMember) continue;
      /* balance-sheet ENDING cells read only balance-sheet lines through the window; an IS line never sits in a BS path */
      const ids = new Set(this.path(l, def, rowPeriod).map((s) => s.id));
      if (rowMembers.every((m) => ids.has(m))) keys.push(l.key);
    }
    const pop = keys.length ? this.d.gl.definePopulation({ keys, periodStart: window.periodStart, periodEnd: window.periodEnd } as PopulationFilter, 'amount_desc', `${row.label} · ${col.label}${col.sublabel ? ` ${col.sublabel}` : ''}`) : null;
    const m = MEASURES.find((x) => x.id === col.measure)!;
    return {
      cellId, analysisId: def.id, analysisVersion: def.version, rowMemberIds: rowMembers, columnMemberIds: col.memberIds, measure: col.measure,
      period: P, comparisonPeriod: col.measure.startsWith('VARIANCE') ? cmp : null, scope: def.scope, book: def.book, filters: def.filters,
      populationId: pop?.id ?? null, populationWindow: pop ? window : null, value: cellValue.value, display: cellValue.display,
      calculation: `${m.label}: ${m.note}${def.analysisType === 'STATEMENT' ? '; presented sign (liabilities, equity and revenue credit-positive)' : ''}`,
      dataVersion: this.d.gl.dataVersion(), mappingVersion: MAPPING_VERSION,
    };
  }
}
