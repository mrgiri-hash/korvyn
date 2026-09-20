/**
 * PHASE 8C — THE ANALYSIS ENGINE: one governed analysis object, operated conversationally.
 *
 * Applies ops to the AnalysisDefinition (new, reshape, filter, sort, periods, measures, expansion), keeps the active
 * referents (row, cell, population, dimension member) that make "this", "the largest movement" and "the third row"
 * mean something, and answers the questions a grid invites — the GL behind a cell, why it moved, whether Flux explains
 * it, whether it reconciles, whether it is supported — through the same governed services every other surface reads.
 * A drill always goes from a CellContext (re-derived from a canonical cell id) to its population id, and every later
 * question about "it" reads that same population.
 */
import { randomUUID } from 'node:crypto';
import { MAPPING_VERSION } from '../artifacts/tieout.js';
import { money, periodLabel } from '../financials.js';
import type { FinancialObject, ToolArgs } from '../tools.js';
import { type AnalysisOp, type RowTarget } from './edit.js';
import { type AnalysisDefinition, type AnalysisResult, type CellContext, DIMENSIONS, type ExcelHandoff, type GridRow, type VisualizationDefinition } from './model.js';
import { FinancialAnalysisQueryService, type QueryDeps } from './query.js';
import { analysisName } from './context.js';

/**
 * The active referents — what "this", "it", "the largest one", "the second one" and "the other one" point at. Canonical
 * ids only: a row path, a cell id, a population id, a member id — never a label.
 */
export interface Referents {
  activeRowId: string | null; activeCellId: string | null; activePopulationId: string | null;
  /** @deprecated 8C name, kept in step with activeDimensionMemberId */
  activeMember: string | null;
  /** 8C.2 */
  activeAnalysisId?: string | null;
  /** the statement the grid is restricted to (BS / IS), when it is */
  activeStatementId?: string | null;
  activeDimensionMemberId?: string | null;
  /** the rows an ephemeral ranking returned, best first — "the second one" after "which three moved most?" */
  activeRankedResultIds?: string[];
  /** the object a selection or ranking pointed at (a row id, or a member id) */
  activeSelectedObjectId?: string | null;
}
export const emptyReferents = (analysisId: string | null = null): Referents => ({ activeRowId: null, activeCellId: null, activePopulationId: null, activeMember: null, activeAnalysisId: analysisId, activeStatementId: null, activeDimensionMemberId: null, activeRankedResultIds: [], activeSelectedObjectId: null });
export interface AnalysisSession { definition: AnalysisDefinition; referents: Referents; cursor: number; /** prior versions, newest last — what a correction returns to */ history?: AnalysisDefinition[] }
export interface Panel { kind: 'GL' | 'EXPLAIN' | 'FLUX' | 'RECON' | 'SUPPORT' | 'CHART' | 'EXCEL' | 'RANK'; title: string; subtitle: string | null; cell: CellContext | null; objects: FinancialObject[]; gl: { populationId: string; rowCount: number; debit: string; credit: string; net: string; columns: string[]; lines: { id: string; cells: string[] }[]; nextCursor: number | null } | null; notes: string[] }
export interface EngineDeps extends QueryDeps { runTool: (tool: string, args: ToolArgs) => FinancialObject | null;
  /** V2 §19: the governed book the CONVERSATION is on. A new analysis inherits it instead of re-declaring a literal;
   *  absent, the corporate book below is the default, exactly as before. */
  book?: AnalysisDefinition['book'] }
export interface EngineOut { session: AnalysisSession; result: AnalysisResult; panel: Panel | null; notes: string[]; changes: string[]; visualization: VisualizationDefinition | null; excel: ExcelHandoff | null; save: { name: string; definition: AnalysisDefinition } | null; created: boolean; clarify: { question: string; options: string[] } | null;
  /** 8C.2: the definition itself changed (a no-op, a drill or a ranking does not) */
  mutated: boolean;
  /** 8C.2: an ephemeral answer (a ranking) — shown, remembered as referents, never persisted */
  answer: string | null }

const shift = (p: string, n: number) => { const [y, m] = p.split('-').map(Number); const i = y! * 12 + (m! - 1) + n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`; };
const monthsBetween = (a: string, b: string) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb! - ya!) * 12 + (mb! - ma!); };

export class AnalysisEngine {
  readonly q: FinancialAnalysisQueryService;
  constructor(private readonly d: EngineDeps) { this.q = new FinancialAnalysisQueryService(d); }

  newDefinition(op: Extract<AnalysisOp, { op: 'NEW' }>): AnalysisDefinition {
    const now = new Date().toISOString(), periods = [...new Set(op.periods)].sort();
    const byDim = new Map<string, { values: string[]; labels: string[] }>();
    for (const m of op.filters) { const x = byDim.get(m.dimension) ?? { values: [], labels: [] }; x.values.push(m.value); x.labels.push(m.label); byDim.set(m.dimension, x); }
    return {
      id: `AN-${randomUUID().slice(0, 8)}`, version: 1, name: op.name, nameSource: 'DERIVED', analysisType: op.analysisType, periods, primaryPeriod: periods.at(-1)!,
      comparison: periods.length > 1 ? { basis: 'PRIOR_PERIOD', period: null } : null,
      scope: this.d.actor.scopeIds === 'ALL' ? 'GROUP' : this.d.actor.scopeIds[0]!,
      book: this.d.book ?? { accountingBookId: 'CORE-GL', accountingBasis: 'US GAAP', reportingLens: 'Corporate Consolidated', currency: 'USD' },
      rows: op.rows, columns: op.columns, measures: op.measures,
      filters: [...byDim].map(([dimension, x]) => ({ dimension: dimension as never, op: 'IN' as const, ...x })),
      statement: op.statement, valueFilter: null, sorts: [], topN: null,
      hierarchies: [{ dimension: 'account', levels: op.analysisType === 'STATEMENT' ? ['statement', 'type', 'group', 'account'] : ['group', 'account'] }],
      expanded: [], collapsed: [], displayOptions: { units: 'USD_MILLIONS', negatives: 'PARENTHESES', showSubtotals: true },
      sourceObjectIds: [], populationIds: [], dataVersion: this.d.gl.dataVersion(), mappingVersion: MAPPING_VERSION,
      createdBy: this.d.actor.id, updatedBy: this.d.actor.id, createdAt: now, updatedAt: now, derivedFrom: null,
    };
  }

  /** every node, open or not — to find a member the user named that is not yet on screen */
  private allRows(def: AnalysisDefinition): GridRow[] {
    const open: AnalysisDefinition = { ...def, collapsed: [], valueFilter: null, topN: null };
    let rows = this.q.run(open, { limit: 500 }).rows;
    for (let i = 0; i < 4; i++) { const more = rows.filter((r) => r.expandable && !r.expanded).map((r) => r.id); if (!more.length) break; open.expanded = [...open.expanded, ...more]; rows = this.q.run(open, { limit: 500 }).rows; }
    return rows;
  }
  private dataRows(res: AnalysisResult) { return res.rows.filter((r) => r.kind !== 'section'); }
  private primaryCol(res: AnalysisResult, def: AnalysisDefinition, preferVariance: boolean) {
    const v = res.columns.find((c) => c.measure === 'VARIANCE');
    return preferVariance && v ? v : res.columns.find((c) => c.period === def.primaryPeriod && c.measure !== 'VARIANCE' && c.measure !== 'VARIANCE_PCT') ?? res.columns[0]!;
  }
  /** resolve a target to a row (and a cell) of the grid on screen — by canonical id, rank or referent; never by label */
  private resolve(t: RowTarget, s: AnalysisSession, res: AnalysisResult, wantCell: boolean, preferVariance: boolean): { row: GridRow | null; cellId: string | null; why: string | null } {
    const def = s.definition, rows = this.dataRows(res);
    const cellFor = (row: GridRow) => { const c = this.primaryCol(res, def, preferVariance); return `${row.id}§${c.id}`; };
    switch (t.kind) {
      case 'row': { const r = res.rows.find((x) => x.id === t.rowId) ?? null; return { row: r, cellId: r ? cellFor(r) : null, why: r ? null : 'That row is not in the analysis on screen.' }; }
      /* "the third row" counts the rows that carry a figure — a blanked mixed total is structure, not a row to act on */
      case 'rank': {
        /* after an ephemeral ranking, "the second one" is the second RANKED row, not the second row on screen */
        const rk = s.referents.activeRankedResultIds ?? [];
        if (rk.length >= t.n) { const r = res.rows.find((x) => x.id === rk[t.n - 1]) ?? null; if (r) return { row: r, cellId: cellFor(r), why: null }; }
        const ci = res.columns.indexOf(this.primaryCol(res, def, preferVariance)); const r = rows.filter((x) => x.cells[ci]?.value !== null)[t.n - 1] ?? null; return { row: r, cellId: r ? cellFor(r) : null, why: r ? null : `There is no row ${t.n} on screen.` }; }
      case 'largest': case 'smallest': {
        const c = this.primaryCol(res, def, true), ci = res.columns.indexOf(c);
        /* the most specific rows on screen: a row whose children are all hidden (collapsed or filtered) counts as a leaf */
        const leaf = (r: GridRow) => !res.rows.some((x) => x.id.startsWith(`${r.id}/`));
        const cand = rows.filter(leaf).filter((r) => r.cells[ci]?.value !== null);
        const r = [...cand].sort((a, b) => (t.kind === 'smallest' ? -1 : 1) * (Math.abs(b.cells[ci]!.value ?? 0) - Math.abs(a.cells[ci]!.value ?? 0)))[0] ?? null;
        return { row: r, cellId: r ? `${r.id}§${c.id}` : null, why: r ? null : 'Nothing on screen has a value to rank.' };
      }
      case 'active': {
        if (s.referents.activeCellId) { const rid = s.referents.activeCellId.split('§')[0]!; return { row: res.rows.find((x) => x.id === rid) ?? null, cellId: s.referents.activeCellId, why: null }; }
        if (s.referents.activeRowId) { const r = res.rows.find((x) => x.id === s.referents.activeRowId) ?? null; return { row: r, cellId: r ? cellFor(r) : null, why: null }; }
        return { row: null, cellId: null, why: wantCell ? 'Select a cell in the grid (or name a row) and ask again.' : 'Name the row, or select it in the grid.' };
      }
      case 'member': {
        const hit = rows.find((r) => t.memberIds.includes(r.memberIds.at(-1)!)) ?? rows.find((r) => t.memberIds.some((m) => r.memberIds.includes(m))) ?? null;
        return { row: hit, cellId: hit ? cellFor(hit) : null, why: hit ? null : 'That member is not on screen.' };
      }
    }
  }

  apply(sArg: AnalysisSession | null, ops: AnalysisOp[]): EngineOut {
    const notes: string[] = [], changes: string[] = [];
    let s: AnalysisSession | null = sArg ? JSON.parse(JSON.stringify(sArg)) : null;
    let panel: Panel | null = null, visualization: VisualizationDefinition | null = null, excel: ExcelHandoff | null = null, save: EngineOut['save'] = null, created = false, clarify: EngineOut['clarify'] = null, answer: string | null = null;
    let mutated = false; void mutated;
    const before = s ? JSON.parse(JSON.stringify(s.definition)) as AnalysisDefinition : null;
    const gp = this.d.data.governedPeriods();
    for (const op of ops) {
      if (op.op === 'NOTE') { notes.push(op.text); continue; }
      if (op.op === 'CLARIFY') { clarify = { question: op.question, options: op.options }; continue; }
      /* history and "the other X" are the conversation's (analysis/context.ts), resolved before the engine runs */
      if (op.op === 'UNDO' || op.op === 'REDO' || op.op === 'OTHER') continue;
      if (op.op === 'NEW') { const def0 = this.newDefinition(op); def0.name = analysisName(def0); s = { definition: def0, referents: emptyReferents(def0.id), cursor: 0 }; created = true; changes.push(`created ${def0.name}`); continue; }
      if (!s) { notes.push('There is no analysis on screen to change.'); break; }
      const def = s.definition;
      const res = () => this.q.run(def, { limit: 500 });
      switch (op.op) {
        case 'SET_ROWS': def.rows = op.dims.filter((x) => x.dimension !== 'period' || !def.columns.some((c) => c.dimension === 'period')); if (!def.rows.length) def.rows = [{ dimension: 'account' }]; if (op.dims.some((x) => x.dimension === 'period')) def.columns = def.columns.filter((c) => c.dimension !== 'period'); changes.push(`rows: ${def.rows.map((r) => r.dimension).join(' → ')}`); mutated = true; break;
        case 'SET_COLUMNS': def.columns = op.dims.slice(0, 1); def.rows = def.rows.filter((r) => !op.dims.some((x) => x.dimension === r.dimension)); if (!def.rows.length) def.rows = [{ dimension: 'account' }]; changes.push(`columns: ${def.columns.map((c) => c.dimension).join(', ')}`); mutated = true; break;
        case 'ADD_ROW_DIM': {
          if (def.rows.some((r) => r.dimension === op.dim.dimension)) { notes.push(`${op.dim.dimension} is already on the rows.`); break; }
          const i = op.after ? def.rows.findIndex((r) => r.dimension === op.after) : -1;
          def.rows.splice(i >= 0 ? i + 1 : def.rows.length, 0, op.dim); def.columns = def.columns.filter((c) => c.dimension !== op.dim.dimension);
          changes.push(`added ${op.dim.dimension} beneath ${i >= 0 ? op.after : def.rows[def.rows.length - 2]?.dimension ?? 'the rows'}`); mutated = true; break;
        }
        case 'REMOVE_DIM': {
          const before = def.rows.length + def.columns.length;
          def.rows = def.rows.filter((r) => r.dimension !== op.dim); def.columns = def.columns.filter((c) => c.dimension !== op.dim || c.dimension === 'period');
          def.filters = def.filters.filter((f) => f.dimension !== op.dim);
          if (!def.rows.length) def.rows = [{ dimension: 'account' }];
          if (def.rows.length + def.columns.length === before) notes.push(`${op.dim} is not in this analysis.`); else { changes.push(`removed ${op.dim}`); mutated = true; }
          break;
        }
        case 'MOVE_TO_COLUMNS': def.columns = [{ dimension: op.dim }]; def.rows = def.rows.filter((r) => r.dimension !== op.dim); if (!def.rows.length) def.rows = [{ dimension: 'account' }]; changes.push(`${op.dim} across the columns (${periodLabel(def.primaryPeriod)})`); mutated = true; break;
        case 'FILTER': {
          for (const m of op.members) {
            const f = def.filters.find((x) => x.dimension === m.dimension && x.op === (op.exclude ? 'NOT_IN' : 'IN'));
            if (f) { if (!f.values.includes(m.value)) { f.values.push(m.value); f.labels.push(m.label); } }
            else def.filters.push({ dimension: m.dimension, op: op.exclude ? 'NOT_IN' : 'IN', values: [m.value], labels: [m.label] });
          }
          /* a new "only X" replaces an earlier "only Y" on the same dimension: filters narrow what the user now names */
          if (!op.exclude) for (const dim of new Set(op.members.map((m) => m.dimension))) { const f = def.filters.find((x) => x.dimension === dim && x.op === 'IN')!; const keep = op.members.filter((m) => m.dimension === dim); f.values = keep.map((m) => m.value); f.labels = keep.map((m) => m.label); }
          s.referents.activeMember = s.referents.activeDimensionMemberId = `${op.members[0]!.dimension}:${op.members[0]!.value}`;
          changes.push(`${op.exclude ? 'excluding' : 'only'} ${op.members.map((m) => m.label).join(', ')}`); mutated = true; break;
        }
        case 'CLEAR_FILTERS': def.filters = []; def.statement = def.analysisType === 'STATEMENT' ? def.statement : null; def.valueFilter = null; def.topN = null; changes.push('filters cleared'); mutated = true; break;
        case 'ACCOUNT_TYPES': {
          const ts = [...new Set(op.types)].sort().join(',');
          if (ts === 'ASSET,EQUITY,EXPENSE,LIABILITY,REVENUE') { def.accountTypes = null; changes.push('every account type'); mutated = true; break; }
          if (ts === 'ASSET,EQUITY,LIABILITY' || ts === 'EXPENSE,REVENUE') { def.statement = ts === 'EXPENSE,REVENUE' ? 'IS' : 'BS'; def.accountTypes = null; changes.push(`only ${def.statement === 'BS' ? 'balance-sheet' : 'income-statement'} accounts`); mutated = true; break; }
          def.accountTypes = op.types; changes.push(`only ${op.types.map((x) => x.toLowerCase()).join(' and ')} accounts`); mutated = true; break;
        }
        case 'REMOVE_FILTER': {
          const n0 = def.filters.reduce((x, f) => x + f.values.length, 0);
          if (op.members.length) for (const m of op.members) for (const f of def.filters.filter((x) => x.dimension === m.dimension)) { const i = f.values.indexOf(m.value); if (i >= 0) { f.values.splice(i, 1); f.labels.splice(i, 1); } }
          else if (op.dimension) def.filters = def.filters.filter((f) => f.dimension !== op.dimension);
          if (op.dimension === 'account' || op.members.some((m) => m.dimension === 'account')) def.accountTypes = def.accountTypes && op.members.length ? def.accountTypes : null;
          def.filters = def.filters.filter((f) => f.values.length);
          if (def.filters.reduce((x, f) => x + f.values.length, 0) === n0 && !op.dimension) notes.push('That is not a filter on this analysis.'); else { changes.push(`removed the ${op.members.map((m) => m.label).join(', ') || op.dimension} filter`); mutated = true; }
          break;
        }
        case 'STATEMENT': def.statement = op.statement; changes.push(op.statement ? `only ${op.statement === 'BS' ? 'balance-sheet' : 'income-statement'} accounts` : 'both statements'); mutated = true; break;
        case 'THRESHOLD':
          if (op.minPct && !def.measures.includes('VARIANCE')) { if (!def.comparison) def.comparison = { basis: 'PRIOR_PERIOD', period: null }; const cmp = this.q.comparisonPeriod(def); if (cmp && !def.periods.includes(cmp)) def.periods = [...def.periods, cmp].sort(); def.measures = [...def.measures, 'VARIANCE']; }
          def.valueFilter = op.minAbs === null && !op.minPct ? null : { minAbs: op.minAbs ?? 0, on: (op.on === 'VARIANCE' || op.minPct) && def.measures.includes('VARIANCE') ? 'VARIANCE' : 'VALUE', minPct: op.minPct ?? null }; changes.push(op.minAbs === null ? 'threshold removed' : `only ${op.on === 'VARIANCE' && def.measures.includes('VARIANCE') ? 'movements' : 'amounts'} over ${money(op.minAbs * 1e6, 'USD')}`); mutated = true; break;
        case 'SORT': def.sorts = [{ by: op.by, period: op.period, dir: 'DESC' }]; changes.push(op.by === 'LABEL' ? 'sorted by name' : `largest ${op.by === 'VARIANCE' ? 'movements' : op.period ? periodLabel(op.period) : 'amounts'} first`); mutated = true; break;
        case 'TOP': def.topN = op.n; changes.push(op.n ? `top ${op.n}` : 'all rows'); mutated = true; break;
        case 'PERIODS': { const ps = op.periods.filter((p) => gp.includes(p)); if (!ps.length) { notes.push('No governed period in that range.'); break; } def.periods = ps; if (!ps.includes(def.primaryPeriod)) def.primaryPeriod = ps.at(-1)!; changes.push(`periods ${ps.map(periodLabel).join(', ')}`); mutated = true; break; }
        case 'ADD_PERIOD': if (!def.periods.includes(op.period)) { def.periods = [...def.periods, op.period].sort(); changes.push(`added ${periodLabel(op.period)}`); mutated = true; } break;
        case 'REMOVE_PERIOD': if (def.periods.length > 1 && def.periods.includes(op.period)) { def.periods = def.periods.filter((p) => p !== op.period); if (def.primaryPeriod === op.period) def.primaryPeriod = def.periods.at(-1)!; changes.push(`removed ${periodLabel(op.period)}`); mutated = true; } else notes.push(`${periodLabel(op.period)} is ${def.periods.includes(op.period) ? 'the only period' : 'not in the analysis'}.`); break;
        case 'PRIMARY': if (def.periods.includes(op.period)) { def.primaryPeriod = op.period; changes.push(`${periodLabel(op.period)} is the primary month`); mutated = true; } else { def.periods = [...def.periods, op.period].sort(); def.primaryPeriod = op.period; changes.push(`added ${periodLabel(op.period)} as the primary month`); mutated = true; } break;
        case 'ORDER_PERIODS': def.periods = [...op.periods, ...def.periods.filter((p) => !op.periods.includes(p))]; changes.push(`column order ${def.periods.map(periodLabel).join(', ')}`); mutated = true; break;
        case 'COMPARE':
          if (op.basis === 'PRIOR_YEAR') { notes.push('A prior-year comparison is not available: FY2025 is not in the governed ledger. The comparison stays on the prior month.'); break; }
          def.comparison = { basis: op.basis, period: op.period };
          { const cmp = this.q.comparisonPeriod(def); if (cmp && !def.periods.includes(cmp)) { def.periods = [...def.periods, cmp].sort(); changes.push(`added ${periodLabel(cmp)} to compare`); } if (!cmp) notes.push(`${periodLabel(def.primaryPeriod)} has no governed prior period.`); }
          mutated = true; break;
        case 'ADD_MEASURE':
          if (op.measure === 'VARIANCE' || op.measure === 'VARIANCE_PCT') { if (!def.comparison) def.comparison = { basis: 'PRIOR_PERIOD', period: null }; const cmp = this.q.comparisonPeriod(def); if (cmp && !def.periods.includes(cmp)) def.periods = [...def.periods, cmp].sort(); }
          if (!def.measures.includes(op.measure)) { def.measures = [...def.measures, op.measure]; changes.push(`added ${op.measure.toLowerCase().replace(/_/g, ' ')}`); mutated = true; }
          break;
        case 'REMOVE_MEASURE': if (def.measures.includes(op.measure) && def.measures.length > 1) { def.measures = def.measures.filter((m) => m !== op.measure); changes.push(`removed ${op.measure.toLowerCase().replace(/_/g, ' ')}`); mutated = true; } break;
        case 'VARIANT': {
          const i = def.rows.findIndex((r) => r.dimension === op.dim);
          const add = op.variants.map((v) => ({ dimension: op.dim, variant: v }));
          if (i >= 0) def.rows.splice(i, 1, ...add); else def.rows.push(...add);
          changes.push(`${op.variants.map((v) => v.toLowerCase()).join(' and ')} ${op.dim}`); mutated = true;
          if (op.variants.includes('GOVERNED')) notes.push(`No governed ${op.dim} overrides are held on this server, so the governed value is empty and the effective value is the source value.`);
          break;
        }
        case 'EXPAND': case 'COLLAPSE': {
          const r0 = res();
          let hit = this.resolve(op.target, s, r0, false, false);
          if (!hit.row && op.op === 'EXPAND' && op.target.kind === 'member') {
            /* named but not on screen: open the path to it, or — if its dimension is not on the rows — add it beneath */
            const all = this.allRows(def), mids = op.target.memberIds;
            let path = all.find((r) => mids.includes(r.memberIds.at(-1)!));
            if (!path) {
              const dim = mids[0]!.split(':')[0] as never;
              if (DIMENSIONS.some((x) => x.id === dim && x.governed) && !def.rows.some((r) => r.dimension === dim)) {
                def.rows.push({ dimension: dim });
                const all2 = this.allRows(def); path = all2.find((r) => mids.includes(r.memberIds.at(-1)!));
                if (path) notes.push(`${mids[0]!.split(':')[1]} is a ${dim}, not a row of this analysis: added ${dim} beneath and opened the rows where it posts.`);
              }
            }
            if (path) {
              const segs = path.id.split('/');
              for (let k = 1; k < segs.length; k++) { const id = segs.slice(0, k).join('/'); if (!def.expanded.includes(id)) def.expanded.push(id); def.collapsed = def.collapsed.filter((x) => x !== id); }
              for (const r of this.allRows(def).filter((x) => mids.includes(x.memberIds.at(-1)!))) { const sg = r.id.split('/'); for (let k = 1; k < sg.length; k++) { const id = sg.slice(0, k).join('/'); if (!def.expanded.includes(id)) def.expanded.push(id); } if (r.expandable && !def.expanded.includes(r.id)) def.expanded.push(r.id); }
              s.referents.activeRowId = path.id; s.referents.activeMember = mids[0]!; changes.push(`opened ${path.label}`); mutated = true; break;
            }
            notes.push(hit.why ?? 'That member is not in this analysis, or it is outside your access.'); break;
          }
          if (!hit.row) { notes.push(hit.why ?? 'Nothing to open.'); break; }
          if (op.op === 'EXPAND' && !hit.row.expandable) { const i = this.dataRows(r0).indexOf(hit.row); const next = this.dataRows(r0).slice(i).find((x) => x.expandable && !x.expanded); if (op.target.kind === 'rank' && next) hit = { row: next, cellId: null, why: null }; else { notes.push(`${hit.row.label} has nothing beneath it${def.rows.length === 1 ? ' — add a dimension to break it down' : ''}.`); break; } }
          const id = hit.row!.id;
          if (op.op === 'EXPAND') { def.collapsed = def.collapsed.filter((x) => x !== id); if (!def.expanded.includes(id)) def.expanded.push(id); }
          else { def.expanded = def.expanded.filter((x) => x !== id); if (!def.collapsed.includes(id)) def.collapsed.push(id); }
          s.referents.activeRowId = id; changes.push(`${op.op === 'EXPAND' ? 'expanded' : 'collapsed'} ${hit.row!.label}`); mutated = true; break;
        }
        case 'EXPAND_ALL': def.expanded = this.allRows(def).filter((r) => r.expandable).map((r) => r.id); def.collapsed = []; changes.push('expanded every level'); mutated = true; break;
        case 'COLLAPSE_ALL': def.expanded = []; def.collapsed = this.q.run(def, { limit: 500 }).rows.filter((r) => r.expandable && r.kind !== 'section').map((r) => r.id); changes.push('collapsed'); mutated = true; break;
        case 'MORE': s.cursor += 200; break;
        case 'DUPLICATE': {
          const delta = monthsBetween(def.primaryPeriod, op.period);
          const periods = def.periods.map((p) => shift(p, delta)).filter((p) => gp.includes(p));
          if (!periods.includes(op.period)) { notes.push(`${periodLabel(op.period)} is not a governed period.`); break; }
          const now = new Date().toISOString();
          s = { definition: { ...JSON.parse(JSON.stringify(def)), id: `AN-${randomUUID().slice(0, 8)}`, version: 1, periods, primaryPeriod: op.period, name: def.name.replace(/·.*$/, `· ${periods.length > 1 ? `${periodLabel(periods[0]!)}–${periodLabel(periods.at(-1)!)}` : periodLabel(periods[0]!)}`), derivedFrom: `${def.id}@v${def.version}`, createdAt: now, updatedAt: now, populationIds: [], expanded: [], collapsed: [] }, referents: emptyReferents(), cursor: 0 };
          if (periods.length < def.periods.length) notes.push('Periods before the governed ledger were dropped.');
          created = true; changes.push(`a new analysis for ${periodLabel(op.period)}, derived from ${def.name}`); break;
        }
        case 'FORGET': {
          const ids = new Set(op.members.map((m) => `${m.dimension}:${m.value}`));
          const n0 = JSON.stringify(def.filters);
          for (const f of def.filters) for (const m of op.members.filter((x) => x.dimension === f.dimension)) { const i = f.values.indexOf(m.value); if (i >= 0) { f.values.splice(i, 1); f.labels.splice(i, 1); } }
          def.filters = def.filters.filter((f) => f.values.length);
          const R = s.referents, pointed = (x: string | null | undefined) => !!x && [...ids].some((id) => x.split(/[/§]/).includes(id));
          const cleared = pointed(R.activeRowId) || pointed(R.activeCellId) || pointed(R.activeDimensionMemberId ?? R.activeMember);
          if (cleared) { R.activeRowId = R.activeCellId = R.activePopulationId = R.activeSelectedObjectId = null; R.activeMember = R.activeDimensionMemberId = null; R.activeRankedResultIds = []; }
          if (JSON.stringify(def.filters) !== n0) changes.push(`dropped ${op.members.map((m) => m.label).join(', ')}`);
          else if (cleared) changes.push(`no longer looking at ${op.members.map((m) => m.label).join(', ')}`);
          else notes.push(`${op.members.map((m) => m.label).join(', ')} is not part of this analysis, so there is nothing to drop.`);
          break;
        }
        case 'SELECT': {
          const hit = this.resolve(op.target, s, res(), true, op.target.kind === 'largest' || op.target.kind === 'smallest');
          if (!hit.row) { notes.push(hit.why ?? 'Nothing to select.'); break; }
          s.referents.activeRowId = hit.row.id; s.referents.activeCellId = hit.cellId; s.referents.activeSelectedObjectId = hit.row.id; break;
        }
        case 'RANK': { const out = this.rank(op, s); panel = out.panel; answer = out.answer; if (out.note) notes.push(out.note); break; }
        default: {
          const r0 = res();
          const out = this.action(op, s, r0);
          if (out.note) notes.push(out.note);
          panel = out.panel ?? panel; visualization = out.visualization ?? visualization; excel = out.excel ?? excel; save = out.save ?? save;
        }
      }
    }
    if (!s) throw new Error('no analysis');
    /* 8C.2: a change is a change to the DEFINITION — a no-op filter, a drill (which only records lineage) or an ephemeral
       ranking is not one, and does not create a version */
    const shape = (x: AnalysisDefinition) => JSON.stringify({ ...x, version: 0, updatedAt: '', updatedBy: '', name: '', populationIds: [], dataVersion: '' });
    const changed = !created && !!before && shape(before) !== shape(s.definition);
    if (changed) { s.referents.activeRankedResultIds = []; s.definition.version += 1; s.definition.updatedAt = new Date().toISOString(); s.definition.updatedBy = this.d.actor.id; s.cursor = 0; }
    /* the title follows the definition; the referents say which analysis and statement they belong to */
    s.definition.name = analysisName(s.definition);
    s.referents.activeAnalysisId = s.definition.id; s.referents.activeStatementId = s.definition.statement;
    s.definition.dataVersion = this.d.gl.dataVersion();
    const v = this.q.validate(s.definition);
    notes.push(...v.warnings);
    if (v.errors.length) notes.push(...v.errors);
    const result = this.q.run(s.definition, { cursor: s.cursor, limit: 200 });
    notes.push(...result.notes);
    return { session: s, result, panel, notes: [...new Set(notes)], changes: changed || created ? changes : changes.filter((c) => !/^(only|excluding|added|removed|rows|columns|sorted|largest|top|periods|column order|expanded|collapsed|opened)/.test(c)), visualization, excel, save, created, clarify, mutated: changed || created, answer };
  }

  /* ---- the questions a grid invites --------------------------------------------------------------------------- */
  private action(op: AnalysisOp, s: AnalysisSession, res: AnalysisResult): { panel?: Panel; note?: string; visualization?: VisualizationDefinition; excel?: ExcelHandoff; save?: EngineOut['save'] } {
    const def = s.definition;
    const cellOf = (t: RowTarget, preferVariance: boolean): { ctx: CellContext | null; why: string | null } => {
      const r = this.resolve(t, s, res, true, preferVariance);
      if (!r.cellId) return { ctx: null, why: r.why };
      const ctx = this.q.cell(def, r.cellId);
      if (!ctx) return { ctx: null, why: 'That cell is no longer in the analysis.' };
      s.referents.activeCellId = r.cellId; s.referents.activeRowId = r.cellId.split('§')[0]!;
      if (ctx.populationId) { s.referents.activePopulationId = ctx.populationId; if (!def.populationIds.includes(ctx.populationId)) def.populationIds.push(ctx.populationId); }
      return { ctx, why: null };
    };
    /* the account a cell is about: its row's account member, else a single account filter */
    const accountOf = (ctx: CellContext | null) => {
      const a = ctx?.rowMemberIds.map((m) => m.match(/^account:(\d+)$/)?.[1]).filter(Boolean).at(-1) ?? (def.filters.find((f) => f.dimension === 'account' && f.op === 'IN' && f.values.length === 1)?.values[0] ?? null);
      return a ? (this.d.gl.account(a)?.parent ?? a) : null;
    };
    const activeCell = () => (s.referents.activeCellId ? this.q.cell(def, s.referents.activeCellId) : null);
    switch (op.op) {
      case 'DRILL': {
        const { ctx, why } = cellOf(op.target, op.target.kind === 'largest');
        if (!ctx) return { note: why ?? 'Nothing to drill.' };
        if (!ctx.populationId) return { note: `${ctx.display} has no governed lines behind it in that window.`, panel: { kind: 'GL', title: 'GL behind the cell', subtitle: null, cell: ctx, objects: [], gl: null, notes: [] } };
        return { panel: this.glPanel(ctx, 0) };
      }
      case 'EXPLAIN': {
        const { ctx, why } = op.target.kind === 'active' && s.referents.activeCellId ? { ctx: activeCell(), why: null } : cellOf(op.target, true);
        if (!ctx || !ctx.populationId) return { note: why ?? 'Select the number you want explained.' };
        s.referents.activePopulationId = ctx.populationId;
        const pop = this.d.gl.population(ctx.populationId)!, all = this.d.gl.query(pop, this.d.visible, { limit: 1 }).all;
        const objects: FinancialObject[] = [];
        for (const dim of ['project', 'vendor', 'entity', 'account'] as const) {
          const g = this.d.gl.aggregate(all, dim).slice(0, 5);
          if (g.length < 2 && dim !== 'account') continue;
          objects.push(this.table(`By ${dim}`, ['Amount (USD)', 'Lines'], g.map((x) => ({ label: x.label, cells: [money(x.current, 'USD'), String(x.lines)], ref: x.key ? `${dim}:${x.key}` : undefined })), [{ key: `${dim}.top`, label: `Largest ${dim}`, value: g[0]?.label ?? '—', display: g[0]?.label ?? '—' }, { key: `${dim}.topAmount`, label: `Largest ${dim} amount`, value: g[0]?.current ?? 0, display: money(g[0]?.current ?? 0, 'USD') }]));
        }
        const acct = accountOf(ctx);
        const fx = acct ? this.d.runTool('getFluxItem', { account: acct, period: ctx.period ?? def.primaryPeriod }) : null;
        if (fx && fx.status !== 'UNAVAILABLE') objects.push(fx);
        return { panel: { kind: 'EXPLAIN', title: `What drives ${ctx.display}`, subtitle: `${this.describe(ctx)} · ${pop.label}`, cell: ctx, objects, gl: null, notes: ['Drivers group the same governed population the cell reads (activity at the average rate).'] } };
      }
      case 'FLUX': {
        const ctx = activeCell() ?? cellOf({ kind: 'largest' }, true).ctx, acct = accountOf(ctx);
        if (!acct) return { note: 'Flux is kept per account group: select a row with an account on it.' };
        const p = ctx?.period ?? def.primaryPeriod;
        const objs = [this.d.runTool('getFluxItem', { account: acct, period: p }), this.d.runTool('getFluxExplanation', { account: acct, period: p })].filter((x): x is FinancialObject => !!x);
        if (!objs.length) return { note: 'Flux is outside your access.' };
        return { panel: { kind: 'FLUX', title: `Flux · ${this.d.gl.account(acct)?.name ?? acct} · ${periodLabel(p)}`, subtitle: 'the governed Flux item and explanation for this account', cell: ctx, objects: objs, gl: null, notes: [] } };
      }
      case 'RECON': {
        const ctx = activeCell() ?? cellOf({ kind: 'largest' }, false).ctx, acct = accountOf(ctx);
        if (!acct) return { note: 'Select a row with an account on it to find its reconciliation.' };
        const o = this.d.runTool('getReconciliationsForAccount', { account: acct, period: ctx?.period ?? def.primaryPeriod });
        if (!o) return { note: 'Reconciliations are outside your access.' };
        return { panel: { kind: 'RECON', title: `Reconciliations · ${this.d.gl.account(acct)?.name ?? acct}`, subtitle: o.table.rows.length ? null : 'No reconciliation is defined for this account.', cell: ctx, objects: [o], gl: null, notes: [] } };
      }
      case 'SUPPORT': {
        const ctx = activeCell();
        const pid = s.referents.activePopulationId ?? ctx?.populationId ?? null;
        if (!pid) return { note: 'Drill to a number first (or select it) — support is checked on the governed population behind it.' };
        const objs = [this.d.runTool('getSupportCoverage', { populationId: pid }), ...(op.missing ? [this.d.runTool('findMissingEvidence', { populationId: pid })] : [this.d.runTool('findMissingEvidence', { populationId: pid })])].filter((x): x is FinancialObject => !!x);
        if (!objs.length) return { note: 'Evidence is outside your access.' };
        return { panel: { kind: 'SUPPORT', title: `Support · ${pid}`, subtitle: 'checked on the same population the drill opened', cell: ctx, objects: objs, gl: null, notes: ['References only — documents are not connected.'] } };
      }
      case 'CHART': {
        const vz = this.visualization(def, res);
        return { visualization: vz, note: 'The chart definition is prepared from this analysis; drawing it is the next phase (Visualization Intelligence), so no chart is rendered yet.', panel: { kind: 'CHART', title: 'Chart definition', subtitle: `${vz.suggested} · ${vz.series.length} series × ${vz.categories.length} categories`, cell: null, objects: [], gl: null, notes: [] } };
      }
      case 'EXCEL': {
        const x: ExcelHandoff = { analysisDefinition: def, queryId: res.queryId, populationIds: def.populationIds, cellIdentity: 'rowPath§columnId', note: 'The Korvyn Excel add-in is not built; this is the contract it will receive — the governed definition, not a copy of the cells.' };
        return { excel: x, note: x.note, panel: { kind: 'EXCEL', title: 'Excel handoff', subtitle: `${def.name} · v${def.version} · ${res.queryId}`, cell: null, objects: [], gl: null, notes: [] } };
      }
      case 'SAVE': return { save: { name: op.name ?? def.name, definition: def } };
    }
    return {};
  }

  /**
   * 8C.2 — an EPHEMERAL ranking: which rows rank where on the grid as it is (the most specific rows on screen, by the
   * variance when shown — or when asked for, computed on a temporary comparison that is never saved — else by the amount).
   * The ranked rows become referents; the definition is not touched.
   */
  private rank(op: Extract<AnalysisOp, { op: 'RANK' }>, s: AnalysisSession): { panel: Panel; answer: string; note?: string } {
    const def = s.definition;
    const byVar = op.by === 'VARIANCE' || (op.by === null && def.measures.includes('VARIANCE'));
    let view = def, temp = false;
    if (byVar && !def.measures.includes('VARIANCE')) {
      view = JSON.parse(JSON.stringify(def)) as AnalysisDefinition; view.comparison = view.comparison ?? { basis: 'PRIOR_PERIOD', period: null };
      const cmp = this.q.comparisonPeriod(view); if (cmp && !view.periods.includes(cmp)) view.periods = [...view.periods, cmp].sort();
      view.measures = [...view.measures, 'VARIANCE']; temp = true;
    }
    const res = this.q.run({ ...view, topN: null }, { limit: 500 });
    const col = byVar ? res.columns.find((c) => c.measure === 'VARIANCE') ?? null : this.primaryCol(res, view, false);
    if (!col) return { panel: { kind: 'RANK', title: 'Ranking', subtitle: null, cell: null, objects: [], gl: null, notes: [] }, answer: 'There is no comparison period to rank the movement against.', note: `${periodLabel(def.primaryPeriod)} has no governed prior period.` };
    const ci = res.columns.indexOf(col), rows = this.dataRows(res);
    const leaf = (r: GridRow) => !res.rows.some((x) => x.id.startsWith(`${r.id}/`));
    const ranked = rows.filter(leaf).filter((r) => r.cells[ci]?.value !== null && r.cells[ci]?.value !== undefined)
      .sort((a, b) => (op.dir === 'ASC' ? -1 : 1) * (Math.abs(b.cells[ci]!.value!) - Math.abs(a.cells[ci]!.value!))).slice(0, Math.max(1, op.n));
    if (!ranked.length) return { panel: { kind: 'RANK', title: 'Ranking', subtitle: null, cell: null, objects: [], gl: null, notes: [] }, answer: 'Nothing on screen has a value to rank.' };
    s.referents.activeRankedResultIds = ranked.map((r) => r.id);
    s.referents.activeRowId = ranked[0]!.id; s.referents.activeSelectedObjectId = ranked[0]!.id;
    /* the cell is only a referent if it exists on the grid as defined — a temporary variance column does not */
    s.referents.activeCellId = temp ? null : ranked[0]!.cells[ci]!.id;
    const what = byVar ? `moved ${op.dir === 'ASC' ? 'least' : 'most'}` : `is ${op.dir === 'ASC' ? 'smallest' : 'largest'}`;
    const label = `${col.label}${col.sublabel ? ` ${col.sublabel}` : ''}`;
    const answer = ranked.length === 1 ? `${ranked[0]!.label} ${what}: ${ranked[0]!.cells[ci]!.display} (${label}).`
      : `The ${ranked.length} that ${byVar ? `moved ${op.dir === 'ASC' ? 'least' : 'most'}` : op.dir === 'ASC' ? 'are smallest' : 'are largest'}: ${ranked.map((r, i) => `${i + 1}. ${r.label} ${r.cells[ci]!.display}`).join('; ')}.`;
    return { answer, panel: { kind: 'RANK', title: ranked.length === 1 ? `${ranked[0]!.label} ${what}` : `Top ${ranked.length} by ${byVar ? 'movement' : 'amount'}`, subtitle: `${label} · ranked on the grid as it is — its sort, limit and filters are unchanged${temp ? ' · the variance was computed for this answer only' : ''}`,
      cell: null, gl: null, notes: [],
      objects: [this.table('Ranking', [label], ranked.map((r) => ({ label: r.label, cells: [r.cells[ci]!.display], ref: r.id })), [{ key: 'rank.top', label: 'Ranked first', value: ranked[0]!.label, display: ranked[0]!.label }, { key: 'rank.topAmount', label: label, value: ranked[0]!.cells[ci]!.value ?? 0, display: ranked[0]!.cells[ci]!.display }])] } };
  }

  describe(ctx: CellContext): string {
    const m = ctx.measure === 'VARIANCE' ? `Variance ${periodLabel(ctx.period!)} vs ${periodLabel(ctx.comparisonPeriod!)}` : `${ctx.measure.toLowerCase().replace(/_/g, ' ')} ${ctx.period ? periodLabel(ctx.period) : ''}`;
    return `${ctx.rowMemberIds.filter((x) => !/^(statement|type):/.test(x)).join(' · ') || 'Total'} · ${m}`;
  }

  glPanel(ctx: CellContext, cursor: number): Panel {
    const pop = this.d.gl.population(ctx.populationId!)!, q = this.d.gl.query(pop, this.d.visible, { cursor, limit: 25 });
    const notes: string[] = [];
    if (ctx.value !== null && Math.abs(q.netUsd - ctx.value) > 1 && q.all.some((l) => l.currency !== 'USD') && /BALANCE|VARIANCE/.test(ctx.measure)) notes.push(`The cell (${ctx.display}) translates balances at the period-end rate; the lines sum to ${money(q.netUsd, 'USD')} at their monthly average rates — the difference is translation, not a missing line.`);
    else if (ctx.value !== null && Math.abs(q.netUsd - ctx.value) > 1 && ctx.measure === 'ENDING_BALANCE') notes.push(`The cell is shown with its statement sign; the lines are debit-positive.`);
    return {
      kind: 'GL', title: `GL behind ${ctx.display}`, subtitle: `${this.describe(ctx)} · ${periodLabel(ctx.populationWindow!.periodStart)}–${periodLabel(ctx.populationWindow!.periodEnd)}`, cell: ctx, objects: [],
      gl: { populationId: pop.id, rowCount: q.rowCount, debit: money(q.debitUsd, 'USD'), credit: money(q.creditUsd, 'USD'), net: money(q.netUsd, 'USD'),
        columns: ['Posting date', 'Journal line', 'Entity', 'Account', 'Project', 'Vendor', 'Amount (USD)', 'Source'],
        lines: q.page.map((l) => ({ id: `txn:${l.key}`, cells: [l.postingDate, l.key, l.entity, l.account, l.project ?? '—', l.vendor ?? '—', money(l.usd, 'USD'), `${this.d.gl.sourceRef(l).erpSystem} ${l.externalId}`] })), nextCursor: q.nextCursor },
      notes,
    };
  }

  visualization(def: AnalysisDefinition, res: AnalysisResult): VisualizationDefinition {
    const rows = this.dataRows(res).filter((r) => !r.expanded).slice(0, 24);
    const cols = res.columns.filter((c) => c.measure !== 'VARIANCE_PCT');
    return { analysisId: def.id, version: def.version, queryId: res.queryId, suggested: def.periods.length > 2 ? 'line' : cols.some((c) => c.measure === 'VARIANCE') ? 'bar' : 'column',
      categories: rows.map((r) => ({ rowId: r.id, label: r.label })),
      series: cols.map((c) => { const i = res.columns.indexOf(c); return { columnId: c.id, label: `${c.label}${c.sublabel ? ` ${c.sublabel}` : ''}`, measure: c.measure, values: rows.map((r) => r.cells[i]?.value ?? null), cellIds: rows.map((r) => r.cells[i]!.id) }; }),
      unit: 'USD', note: 'Every point is a governed cell id; the chart can drill exactly as the grid does.' };
  }

  private table(title: string, columns: string[], rows: { label: string; cells: string[]; ref?: string }[], facts: FinancialObject['facts']): FinancialObject {
    return { id: `AX-${randomUUID().slice(0, 6)}`, type: 'AnalysisDrivers', title, status: 'AVAILABLE', scope: { id: 'GROUP', name: 'Analysis' }, periods: [], periodLabel: '', currency: 'USD', basis: 'US GAAP', unit: 'USD',
      table: { columns, rows: rows.map((r) => ({ label: r.label, level: 1, kind: 'line' as const, cells: r.cells, ...(r.ref ? { ref: r.ref } : {}) })) }, facts,
      provenance: { source: 'GovernedLedger.aggregate over the cell’s population', snapshotId: this.d.gl.dataVersion(), journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] }, population: null, refs: {}, focus: null, unavailable: null, governed: true };
  }
}
