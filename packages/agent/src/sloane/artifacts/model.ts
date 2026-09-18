/**
 * ARTIFACT INTELLIGENCE — THE WORKBOOK DEFINITION MODEL (Phase 4A).
 *
 * An ExcelArtifactDefinition is DATA: which governed objects go on which sheet, in which order, with which columns,
 * filters and sort. It never holds a balance, a transaction, an explanation's words or a reconciliation's figures —
 * it holds the DEFINITIONS and the CITATIONS (ids + versions) that resolve to them. The same definition drives the
 * preview and the generated file (compose.ts); there is no second export path.
 */
import type { PopulationDef, PopulationFilter } from '../governed.js';

/* 4B — a workbook is a sequence of SECTIONS (one worksheet each, partitioned when a GL section exceeds the row limit).
   Every artifact type composes these; there is no per-type engine. The 4A kinds keep their shape. */
export type SheetKind =
  | 'GL' | 'TB' | 'TIEOUT' | 'RECONCILIATIONS' | 'FLUX' | 'SUMMARY'
  | 'CLOSE_SUMMARY' | 'BLOCKERS' | 'RECS_NOT_TIED' | 'UNEXPLAINED_FLUX' | 'MISSING_SUPPORT' | 'PENDING_REVIEW' | 'EXCEPTIONS'
  | 'MATERIAL_MOVEMENTS' | 'ITEMS_OVER' | 'DRIVERS' | 'EXPLANATION' | 'COMMENTS'
  | 'RECONCILIATION' | 'RECONCILING_ITEMS' | 'SUPPORT_INDEX' | 'RECON_PROOF'
  | 'EVIDENCE_INDEX' | 'EVIDENCE_COVERAGE' | 'SOURCE_REFERENCES' | 'AUDIT_TRAIL' | 'POPULATION_METADATA'
  | 'INCOME_STATEMENT' | 'BALANCE_SHEET' | 'VARIANCE' | 'PBC_REQUESTS'
  /* 5A — audit / PBC */
  | 'PBC_SUMMARY' | 'AUDIT_POPULATION' | 'POPULATION_TIEOUT' | 'AUDIT_SELECTIONS' | 'EVIDENCE_MANIFEST' | 'SUPPORT_GAPS';
export type SectionKind = SheetKind;
/** which lines a GL section presents beyond its filter: the items a package calls material, or a reconciliation's accounts */
export type GLRule = { kind: 'MATERIAL_ITEMS'; minUsd: number | null } | { kind: 'RECONCILIATION'; reconciliationId: string } | { kind: 'ACCOUNT_MONTH'; account: string }
  /** 5A: the governed lines an audit request's selections matched to */
  | { kind: 'AUDIT_SELECTIONS'; requestId: string };
export interface GLSheetDef { kind: 'GL'; name: string; filter: PopulationFilter; columns: string[]; sort: PopulationDef['sort']; rule?: GLRule }
export interface TBSheetDef { kind: 'TB'; name: string; byEntity: boolean }
export interface SectionParams { dimension?: string; minUsd?: number; accounts?: 'MATERIAL' | string; related?: 'gl' | 'focus' | 'all' | 'notTied' }
export interface PlainSheetDef { kind: Exclude<SheetKind, 'GL' | 'TB'>; name: string; params?: SectionParams }
export type SheetDef = GLSheetDef | TBSheetDef | PlainSheetDef;

export type ArtifactType = 'EXCEL_WORKBOOK' | 'GL_EXTRACT' | 'FINANCIAL_REPORT_PACKAGE' | 'RECONCILIATION_PACKAGE' | 'FLUX_PACKAGE' | 'CLOSE_REVIEW_PACKAGE'
  | 'SUPPORT_PACKAGE' | 'AUDIT_SUPPORT_PACKAGE' | 'MANAGEMENT_REVIEW_PACKAGE' | 'PBC_PACKAGE';
export type ArtifactTemplate = 'AUDIT_GL_PACKAGE' | 'GL_EXTRACT';
export interface ArtifactDefinition {
  name: string;
  template: ArtifactTemplate;
  /** 4B: what the deliverable is (a starting structure, never a separate engine); absent on a 4A definition = GL_EXTRACT */
  type?: ArtifactType;
  /** the governed object a package is ABOUT — a reconciliation, an account group, a vendor */
  focus?: { reconciliationId?: string; account?: string; vendor?: string; pbcRequestId?: string };
  /** package-level filters: e.g. leave out entities whose close work is complete */
  filters?: { excludeCompleteEntities?: boolean; selections?: 'ALL' | 'COMPLETED' | 'OPEN' };
  /** a definition started from another artifact: where it came from (the source is never changed) */
  derivedFrom?: { artifactId: string; version: number; name: string };
  periodStart: string; periodEnd: string;
  scopeId: string;                 // GROUP or an entity id
  currency: 'USD';
  basis: string;
  sheets: SheetDef[];
  /** notes Korvyn attached while refining (a column the book does not carry, a sheet that was already there …) */
  notes: string[];
  /** AUTO: Korvyn derived the name from the definition and keeps it in step with it; USER: the person named it */
  nameSource?: 'AUTO' | 'USER';
}

/** what a version pins, so a later change is DETECTED (STALE), not silently absorbed */
export interface ArtifactPins {
  dataVersion: string; sourceDataVersion: string; mappingVersion: string; fxRateSets: string[];
  populations: { sheet: string; populationId: string; populationVersion: string; rowCount: number; debitUsd: number; creditUsd: number; netUsd: number; contentHash: string }[];
  tieOut: { status: string; differenceUsd: number } | null;
  /** the governed objects a version cites: reconciliation balances, flux explanations (id + version) */
  sourceObjects: { type: string; id: string; version: number | null }[];
  sourceSystems: string[];
  fingerprint: string;
  pinnedAt: string;
}

export type ArtifactStatus = 'DRAFT' | 'SAVED' | 'VALIDATING' | 'READY' | 'GENERATING' | 'GENERATED' | 'FAILED' | 'STALE' | 'ARCHIVED';

/* ================================================================================================
   THE GL COLUMN CATALOG — the one place a GL column is named, typed and read
   ================================================================================================ */
export type ColFormat = 'date' | 'text' | 'money' | 'int' | 'period' | 'pct';
export interface GLColumn { key: string; header: string; width: number; format: ColFormat; group: string; available: boolean; note?: string }
export const GL_COLUMNS: GLColumn[] = [
  { key: 'postingDate', header: 'Posting Date', width: 12, format: 'date', group: 'Source', available: true },
  { key: 'period', header: 'Period', width: 10, format: 'period', group: 'Source', available: true },
  { key: 'journal', header: 'Journal', width: 12, format: 'text', group: 'Source', available: true },
  { key: 'journalLine', header: 'Journal Line', width: 8, format: 'int', group: 'Source', available: true },
  { key: 'entryNo', header: 'Entry Number', width: 16, format: 'text', group: 'Source', available: true },
  { key: 'accountNumber', header: 'Account Number', width: 11, format: 'text', group: 'Accounting', available: true },
  { key: 'accountDescription', header: 'Account Description', width: 30, format: 'text', group: 'Accounting', available: true },
  { key: 'accountGroup', header: 'Account Group', width: 28, format: 'text', group: 'Mapping', available: true },
  { key: 'entity', header: 'Entity', width: 10, format: 'text', group: 'Organization', available: true },
  { key: 'entityName', header: 'Entity Name', width: 30, format: 'text', group: 'Organization', available: true },
  { key: 'vendor', header: 'Vendor', width: 22, format: 'text', group: 'Counterparty', available: true },
  { key: 'sourceVendor', header: 'Source Vendor', width: 22, format: 'text', group: 'Counterparty', available: true },
  { key: 'governedVendor', header: 'Governed Vendor', width: 22, format: 'text', group: 'Counterparty', available: true },
  { key: 'department', header: 'Department', width: 18, format: 'text', group: 'Organization', available: false, note: 'The governed ledger carries no department; the source systems do not supply one. Cost center is the organisational dimension it carries.' },
  { key: 'costCenter', header: 'Cost Center', width: 12, format: 'text', group: 'Organization', available: true },
  { key: 'project', header: 'Project', width: 12, format: 'text', group: 'Project', available: true },
  { key: 'property', header: 'Property', width: 12, format: 'text', group: 'Project', available: true },
  { key: 'description', header: 'Description', width: 36, format: 'text', group: 'Source', available: true },
  { key: 'debit', header: 'Debit', width: 16, format: 'money', group: 'Amounts', available: true },
  { key: 'credit', header: 'Credit', width: 16, format: 'money', group: 'Amounts', available: true },
  { key: 'netAmount', header: 'Net Amount', width: 16, format: 'money', group: 'Amounts', available: true },
  { key: 'currency', header: 'Currency', width: 9, format: 'text', group: 'Amounts', available: true },
  { key: 'localAmount', header: 'Local Amount', width: 16, format: 'money', group: 'Amounts', available: true },
  { key: 'localCurrency', header: 'Local Currency', width: 9, format: 'text', group: 'Amounts', available: true },
  { key: 'erp', header: 'ERP', width: 16, format: 'text', group: 'Lineage', available: true },
  { key: 'erpReference', header: 'ERP Reference', width: 14, format: 'text', group: 'Lineage', available: true },
  { key: 'recordType', header: 'Record Type', width: 11, format: 'text', group: 'Lineage', available: true },
  { key: 'invoiceRef', header: 'Invoice Reference', width: 18, format: 'text', group: 'Evidence', available: true },
  { key: 'poRef', header: 'PO Reference', width: 16, format: 'text', group: 'Evidence', available: true },
  { key: 'approvalRef', header: 'Approval Reference', width: 16, format: 'text', group: 'Evidence', available: true },
];
export const GL_COLUMN = (k: string) => GL_COLUMNS.find((c) => c.key === k) ?? null;
/** twenty columns: identity, accounting, the effective governed dimensions, amounts, lineage */
export const DEFAULT_GL_COLUMNS = ['postingDate', 'period', 'journal', 'journalLine', 'accountNumber', 'accountDescription', 'entity', 'vendor', 'costCenter', 'project', 'property',
  'debit', 'credit', 'netAmount', 'currency', 'localAmount', 'localCurrency', 'erp', 'erpReference', 'recordType'];
/** 5A — the AUDIT-READY GL: source facts, the source / governed / effective vendor, record type, lineage and the
 *  evidence references. Ordinary extracts keep the cleaner default; an audit package asks for this. */
export const AUDIT_GL_COLUMNS = ['postingDate', 'period', 'journal', 'journalLine', 'entryNo', 'accountNumber', 'accountDescription', 'accountGroup', 'entity', 'entityName',
  'sourceVendor', 'governedVendor', 'vendor', 'project', 'costCenter', 'property', 'description', 'debit', 'credit', 'netAmount', 'currency', 'localAmount', 'localCurrency',
  'erp', 'erpReference', 'recordType', 'invoiceRef', 'poRef', 'approvalRef'];
/** words a person uses → a catalog key. Deliberately small; "vendor" alone means the EFFECTIVE vendor. */
export const COLUMN_WORDS: [RegExp, string][] = [
  [/\bsource vendors?\b/, 'sourceVendor'], [/\bgoverned vendors?\b/, 'governedVendor'], [/\beffective vendors?\b|\bvendors?\b/, 'vendor'],
  [/\bdepartments?\b|\bdept\b/, 'department'], [/\bcost cent(er|re)s?\b/, 'costCenter'], [/\bprojects?\b/, 'project'], [/\bpropert(y|ies)\b/, 'property'],
  [/\bentity names?\b/, 'entityName'], [/\bentit(y|ies)\b/, 'entity'], [/\baccount groups?\b/, 'accountGroup'], [/\baccount (descriptions?|names?)\b/, 'accountDescription'], [/\baccount (numbers?|codes?)?\b|\baccounts\b/, 'accountNumber'],
  [/\bposting dates?\b|\bdates?\b/, 'postingDate'], [/\bperiods?\b/, 'period'], [/\bjournal lines?\b|\bline numbers?\b/, 'journalLine'], [/\bentry numbers?\b/, 'entryNo'], [/\bjournals?\b/, 'journal'],
  [/\blocal amounts?\b|\bfunctional amounts?\b/, 'localAmount'], [/\blocal currenc(y|ies)\b|\bfunctional currenc(y|ies)\b/, 'localCurrency'],
  [/\bdescriptions?\b|\bmemos?\b/, 'description'], [/\bdebits?\b/, 'debit'], [/\bcredits?\b/, 'credit'], [/\bnet amounts?\b|\bamounts?\b/, 'netAmount'], [/\bcurrenc(y|ies)\b/, 'currency'],
  [/\berp references?\b|\bsource references?\b/, 'erpReference'], [/\berps?\b|\bsource systems?\b/, 'erp'], [/\brecord types?\b/, 'recordType'],
  [/\binvoices?( references?)?\b/, 'invoiceRef'], [/\bpo( references?)?\b|\bpurchase orders?\b/, 'poRef'], [/\bapprovals?( references?)?\b/, 'approvalRef'],
];
export function columnFor(words: string): string | null {
  const t = ` ${words.toLowerCase()} `;
  /* order matters: the specific phrase (source vendor, local amount, account group) is listed before the general word */
  for (const [re, k] of COLUMN_WORDS) if (re.test(t)) return k;
  return null;
}

export const SHEET_NAMES: Record<SheetKind, string> = {
  GL: 'Governed GL', TB: 'Trial Balance', TIEOUT: 'Tie-Out', RECONCILIATIONS: 'Reconciliations', FLUX: 'Flux', SUMMARY: 'Summary',
  CLOSE_SUMMARY: 'Close Summary', BLOCKERS: 'Material Blockers', RECS_NOT_TIED: 'Reconciliations Not Tied', UNEXPLAINED_FLUX: 'Unexplained Flux', MISSING_SUPPORT: 'Missing Support',
  PENDING_REVIEW: 'Pending Review', EXCEPTIONS: 'Exceptions', MATERIAL_MOVEMENTS: 'Material Movements', ITEMS_OVER: 'Items Over Threshold', DRIVERS: 'Driver Analysis', EXPLANATION: 'Explanation',
  COMMENTS: 'Comments', RECONCILIATION: 'Reconciliation', RECONCILING_ITEMS: 'Reconciling Items', SUPPORT_INDEX: 'Support Index', RECON_PROOF: 'Tie-Out',
  EVIDENCE_INDEX: 'Evidence Index', EVIDENCE_COVERAGE: 'Support Coverage', SOURCE_REFERENCES: 'Source References', AUDIT_TRAIL: 'Audit Trail', POPULATION_METADATA: 'Population Metadata',
  INCOME_STATEMENT: 'Income Statement', BALANCE_SHEET: 'Balance Sheet', VARIANCE: 'MoM Variance', PBC_REQUESTS: 'PBC Requests',
  PBC_SUMMARY: 'PBC Summary', AUDIT_POPULATION: 'Population', POPULATION_TIEOUT: 'TB Tie-Out', AUDIT_SELECTIONS: 'Selections', EVIDENCE_MANIFEST: 'Evidence Manifest', SUPPORT_GAPS: 'Exceptions',
};
export const ARTIFACT_TYPE_LABEL: Record<ArtifactType, string> = {
  EXCEL_WORKBOOK: 'Workbook', GL_EXTRACT: 'GL extract', FINANCIAL_REPORT_PACKAGE: 'Financial report package', RECONCILIATION_PACKAGE: 'Reconciliation package', FLUX_PACKAGE: 'Flux package',
  CLOSE_REVIEW_PACKAGE: 'Close review package', SUPPORT_PACKAGE: 'Support package', AUDIT_SUPPORT_PACKAGE: 'Audit support package', MANAGEMENT_REVIEW_PACKAGE: 'Management review package', PBC_PACKAGE: 'PBC package',
};
/** Excel's hard limits: 1,048,576 rows a sheet, 31-character sheet names */
export const EXCEL_MAX_ROWS = 1_048_576;
export const SHEET_NAME_MAX = 31;

/* ---- names ---------------------------------------------------------------------------------------- */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monLabel = (p: string) => `${MON[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
export const rangeLabel = (a: string, b: string) => (a === b ? monLabel(a) : `${monLabel(a)} – ${monLabel(b)}`);
/** FY26 when the range starts at the fiscal year (calendar year in this book); otherwise the months */
export const periodToken = (a: string, b: string) => (a.slice(5) === '01' && a.slice(0, 4) === b.slice(0, 4) ? `FY${a.slice(2, 4)}` : a === b ? `${MON[Number(a.slice(5, 7)) - 1]}${a.slice(0, 4)}` : `${MON[Number(a.slice(5, 7)) - 1]}-${MON[Number(b.slice(5, 7)) - 1]}${b.slice(0, 4)}`);
export const scopeLabel = (scopeId: string, scopeName: string) => (scopeId === 'GROUP' ? 'Corporate Consolidated' : scopeName);
/** Korvyn_FY26_Governed_GL_Corporate_Consolidated.xlsx — deterministic, no ids, no timestamps */
export function fileNameOf(d: ArtifactDefinition, scopeName: string, ext: 'xlsx' | 'csv') {
  const clean = (s: string) => s.replace(/[’']/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const tok = periodToken(d.periodStart, d.periodEnd);
  /* the period is the file's second token: never repeat it from the name ("Jun 2026 Close …", "Jan 2026 – Jun 2026 …") */
  const lead = [rangeLabel(d.periodStart, d.periodEnd), monLabel(d.periodEnd), tok].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const nm = clean(d.name.replace(new RegExp(`^(${lead.join('|')})\\s*`, 'i'), '').replace(/\bKorvyn\b/i, ''));
  return `Korvyn_${tok}_${nm}_${clean(scopeLabel(d.scopeId, scopeName))}.${ext}`;
}
