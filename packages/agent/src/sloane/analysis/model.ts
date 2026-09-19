/**
 * PHASE 8C — THE GOVERNED ANALYSIS DEFINITION.
 *
 * An analysis is a DEFINITION, never a set of browser cells: what is on the rows and columns, which measures, periods,
 * filters, sorts and hierarchy state, and the book it is read in. The FinancialAnalysisQueryService executes it against
 * the governed ledger; Sloane edits it; the browser renders what the service returns. Every cell is identified by its
 * canonical row path and column id, so what it represents, how it was calculated and where it came from can always be
 * re-derived (`CellContext`) — a label is never used to find a number.
 */

export type AnalysisType = 'STATEMENT' | 'TRIAL_BALANCE' | 'ANALYSIS';
/** dimensions with governed data on this server; the rest are declared and refused with the reason */
export type DimensionId = 'account' | 'financialLine' | 'entity' | 'region' | 'project' | 'property' | 'vendor' | 'costCenter' | 'currency' | 'recordType' | 'sourceSystem' | 'period' | 'book';
export type MeasureId = 'ENDING_BALANCE' | 'BEGINNING_BALANCE' | 'ACTIVITY' | 'DEBIT' | 'CREDIT' | 'YTD_ACTIVITY' | 'QTD_ACTIVITY' | 'PRIOR_PERIOD' | 'PRIOR_YEAR' | 'VARIANCE' | 'VARIANCE_PCT';
/** source / governed / effective reading of an attribute ("show source vendor", "add governed vendor") */
export type Variant = 'SOURCE' | 'GOVERNED' | 'EFFECTIVE';

export interface DimensionSpec { id: string; label: string; governed: boolean; hierarchical?: boolean; variants?: boolean; note: string }
export const DIMENSIONS: DimensionSpec[] = [
  { id: 'account', label: 'Account', governed: true, hierarchical: true, note: 'governed chart of accounts: statement → type → account group → account' },
  { id: 'financialLine', label: 'Financial statement line', governed: true, note: 'the account group a statement line is mapped from' },
  { id: 'entity', label: 'Entity', governed: true, note: 'legal entities in the actor’s scope' },
  { id: 'region', label: 'Region', governed: true, note: 'derived from the entity’s country (as in the Financial Graph)' },
  { id: 'project', label: 'Project', governed: true, variants: true, note: 'the GL line’s project dimension' },
  { id: 'property', label: 'Property', governed: true, note: 'the GL line’s property dimension' },
  { id: 'vendor', label: 'Vendor', governed: true, variants: true, note: 'AP subledger extract (representative); governed overrides are not held on this server' },
  { id: 'costCenter', label: 'Cost center', governed: true, note: 'the GL line’s cost-centre dimension' },
  { id: 'currency', label: 'Currency', governed: true, note: 'the line’s transaction currency' },
  { id: 'recordType', label: 'Record type', governed: true, note: 'every server line is SOURCE_GL; no reporting overlay is held' },
  { id: 'sourceSystem', label: 'Source system', governed: true, note: 'the ERP connector the line came from' },
  { id: 'period', label: 'Period', governed: true, note: 'tenant fiscal calendar, governed months only' },
  { id: 'book', label: 'Book', governed: true, note: 'one effective book on this server (CORE-GL, US GAAP)' },
  { id: 'fund', label: 'Fund', governed: false, note: 'no fund dimension is held' },
  { id: 'customer', label: 'Customer', governed: false, note: 'no customer dimension is held' },
  { id: 'department', label: 'Department', governed: false, note: 'no department dimension is held; cost center is' },
  { id: 'businessUnit', label: 'Business unit', governed: false, note: 'no business-unit dimension is held' },
  { id: 'consolidationNode', label: 'Consolidation node', governed: false, note: 'the consolidation tree is read through Entity; eliminations are not held on this server' },
];
export interface MeasureSpec { id: MeasureId; label: string; note: string; derived?: boolean }
export const MEASURES: MeasureSpec[] = [
  { id: 'ENDING_BALANCE', label: 'Balance', note: 'balance-sheet balance at the closing rate, or income-statement amount for the period (GovernedLedger.contribution)' },
  { id: 'BEGINNING_BALANCE', label: 'Beginning', note: 'the ending balance of the prior governed period' },
  { id: 'ACTIVITY', label: 'Activity', note: 'the period’s GL lines at the average rate' },
  { id: 'DEBIT', label: 'Debit', note: 'the period’s debit lines' },
  { id: 'CREDIT', label: 'Credit', note: 'the period’s credit lines' },
  { id: 'YTD_ACTIVITY', label: 'YTD', note: 'fiscal year to the period, governed months only' },
  { id: 'QTD_ACTIVITY', label: 'QTD', note: 'fiscal quarter to the period' },
  { id: 'PRIOR_PERIOD', label: 'Prior period', note: 'the base measure one governed period earlier' },
  { id: 'PRIOR_YEAR', label: 'Prior year', note: 'not in the governed ledger (FY2025 is not held)' },
  { id: 'VARIANCE', label: 'Variance', note: 'primary period less the comparison period, computed by Korvyn', derived: true },
  { id: 'VARIANCE_PCT', label: 'Variance %', note: 'variance over the comparison amount; blank where the base is nil', derived: true },
];

/** the book an analysis is read in — kept as four separate facts so a second book, basis or lens needs no redesign */
export interface BookContext { accountingBookId: string; accountingBasis: string; reportingLens: string; currency: string }
export interface AxisDim { dimension: DimensionId; variant?: Variant }
export interface MemberFilter { dimension: DimensionId; op: 'IN' | 'NOT_IN'; values: string[]; labels: string[] }

export interface AnalysisDefinition {
  id: string; version: number; name: string;
  analysisType: AnalysisType;
  /** columns read these, in this order; the first governed one is not necessarily primary */
  periods: string[];
  primaryPeriod: string;
  comparison: { basis: 'PRIOR_PERIOD' | 'PRIOR_YEAR' | 'PERIOD'; period: string | null } | null;
  scope: string;
  book: BookContext;
  rows: AxisDim[];
  columns: AxisDim[];
  measures: MeasureId[];
  filters: MemberFilter[];
  /** statement filter from the governed account type ("only BS accounts") — never from names */
  statement: 'BS' | 'IS' | null;
  /** governed account types (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE) — from the chart, never from names */
  accountTypes?: string[] | null;
  /** a threshold on the shown value (variance when shown, else the primary amount), USD millions */
  valueFilter: { minAbs: number; on: 'VARIANCE' | 'VALUE'; /** and a variance % floor (0.2 = 20%) */ minPct?: number | null } | null;
  sorts: { by: 'VALUE' | 'VARIANCE' | 'LABEL'; period: string | null; dir: 'DESC' | 'ASC' }[];
  topN: number | null;
  hierarchies: { dimension: 'account'; levels: ('statement' | 'type' | 'group' | 'account')[] }[];
  /** canonical row ids (`account:15000`, `account:15000/project:SV-PH2`) opened or closed against the default */
  expanded: string[];
  collapsed: string[];
  displayOptions: { units: 'USD_MILLIONS'; negatives: 'PARENTHESES'; showSubtotals: boolean };
  sourceObjectIds: string[];
  populationIds: string[];
  dataVersion: string; mappingVersion: string;
  createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
  derivedFrom: string | null;
}

/** everything a cell is: identity, calculation and lineage — re-derived from the cell id on demand */
export interface CellContext {
  cellId: string; analysisId: string; analysisVersion: number;
  rowMemberIds: string[]; columnMemberIds: string[];
  measure: MeasureId; period: string | null; comparisonPeriod: string | null;
  scope: string; book: BookContext;
  filters: MemberFilter[];
  /** the governed population behind the cell — the same id the ledger, evidence and export services read */
  populationId: string | null; populationWindow: { periodStart: string; periodEnd: string } | null;
  value: number | null; display: string;
  calculation: string;
  dataVersion: string; mappingVersion: string;
}

export interface GridColumn { id: string; label: string; sublabel: string | null; measure: MeasureId; period: string | null; memberIds: string[] }
export interface GridCell { id: string; value: number | null; display: string; drillable: boolean }
export interface GridRow {
  /** canonical path id — `type:ASSET/account:15000/project:SV-PH2` — never a label */
  id: string; memberIds: string[]; label: string; level: number; dimension: string;
  kind: 'section' | 'group' | 'leaf' | 'total';
  expandable: boolean; expanded: boolean; cells: GridCell[];
}
export interface AnalysisResult {
  analysisId: string; version: number; queryId: string;
  columns: GridColumn[]; rows: GridRow[];
  rowCount: number; returned: number; cursor: number; nextCursor: number | null;
  totals: GridRow | null;
  notes: string[];
  lineCount: number; periodsRead: string[]; dataVersion: string; mappingVersion: string;
}

/** the handoff to Visualization Intelligence (next phase): enough to chart without re-querying or re-deciding */
export interface VisualizationDefinition { analysisId: string; version: number; queryId: string; suggested: 'column' | 'line' | 'bar' | 'table'; categories: { rowId: string; label: string }[]; series: { columnId: string; label: string; measure: MeasureId; values: (number | null)[]; cellIds: string[] }[]; unit: string; note: string }
/** the handoff to the Korvyn Excel add-in (not built): the same governed analysis, not a copy of its cells */
export interface ExcelHandoff { analysisDefinition: AnalysisDefinition; queryId: string; populationIds: string[]; cellIdentity: 'rowPath§columnId'; note: string }

/* the model's contract for an analysis edit — the same ops as the deterministic reader, named in words */
export const MODEL_OPS = ['NEW_STATEMENT', 'NEW_TRIAL_BALANCE', 'NEW_ACTIVITY', 'SET_ROWS', 'SET_COLUMNS', 'ADD_ROW_DIMENSION', 'REMOVE_DIMENSION', 'FILTER', 'EXCLUDE', 'ONLY_STATEMENT', 'THRESHOLD', 'SORT', 'TOP', 'SET_PERIODS', 'ADD_PERIOD', 'REMOVE_PERIOD', 'PRIMARY_PERIOD', 'COMPARE_PRIOR_PERIOD', 'COMPARE_PRIOR_YEAR', 'ADD_MEASURE', 'REMOVE_MEASURE', 'EXPAND', 'COLLAPSE', 'DRILL', 'EXPLAIN', 'FLUX', 'RECONCILIATION', 'SUPPORT', 'CHART', 'SAVE',
  'ACCOUNT_TYPE', 'REMOVE_FILTER', 'CLEAR_FILTERS', 'UNDO', 'SET_STATEMENT_BOTH', 'EXPAND_ALL', 'COLLAPSE_ALL'] as const;
/** how the words relate to the analysis on screen — the model states it, Korvyn acts on it */
export const EDIT_RELATIONS = ['NEW_ANALYSIS', 'MODIFY', 'ASK_ABOUT_ANALYSIS', 'CORRECTION', 'NOT_ANALYSIS', 'NEEDS_CLARIFICATION'] as const;
export interface ModelOp { op: (typeof MODEL_OPS)[number]; dimensions: string[]; values: string[]; periods: string[]; measure: string | null; number: number | null; percent: number | null; statement: string | null; rowRef: string | null }
export interface AnalysisEdit { relation: (typeof EDIT_RELATIONS)[number]; ops: ModelOp[]; confidence: number; unsupported: string | null; question: string | null; options: string[] }
