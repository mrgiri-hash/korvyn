/**
 * THE ENTERPRISE FINANCIAL SEMANTIC MODEL (Phase 8A) — what every governed thing inside Korvyn IS, and how it relates.
 *
 * A semantic object is a canonical id, a type, a label and the attributes Korvyn already holds for it. It is NOT a copy
 * of financial truth: every object is read from the service that owns it (the governed ledger, the control service,
 * the work store, the artifact engine, the audit service, the identity directory) and names that service in `source`.
 * Figures are never computed here; an object points at the governed tool that states them.
 *
 * Canonical ids reuse the references Korvyn already speaks (`account:15000`, `entity:MDH`, `recon:REC-MDH-15000`,
 * `txn:JE-000176#1`, `population:POP-…`), so a semantic answer can be handed straight to a governed tool.
 */

export const SEMANTIC_TYPES = [
  /* people and responsibility */
  'User', 'Role', 'Team', 'Reviewer', 'Preparer', 'Approver',
  /* enterprise structure */
  'LegalEntity', 'ParentEntity', 'ConsolidationNode', 'EliminationEntity', 'Fund', 'Project', 'Property', 'Region', 'BusinessUnit', 'Department', 'CostCenter', 'Vendor', 'Customer',
  /* time */
  'FiscalYear', 'Quarter', 'Period', 'ClosePeriod', 'ComparisonPeriod',
  /* financial structure */
  'Account', 'ChartOfAccounts', 'TrialBalance', 'GovernedLedgerPopulation', 'GovernedLedgerEntry', 'FinancialStatement', 'FinancialStatementLine', 'ReportingLens', 'Currency', 'AccountingBasis',
  /* review work */
  'FluxAnalysis', 'FluxItem', 'FluxExplanation', 'Reconciliation', 'ReconcilingItem', 'Close', 'CloseTask', 'CloseBlocker',
  /* planning (scaffold: the concepts exist, the server book holds actuals only) */
  'Actual', 'Budget', 'Forecast', 'Scenario', 'PlanningVersion', 'Variance', 'Driver', 'Assumption',
  /* reporting and audit */
  'Report', 'ReportingPackage', 'Artifact', 'Evidence', 'SupportDocument', 'Policy', 'Control', 'AuditRequest', 'AuditSelection', 'AuditPopulation', 'PBCPackage',
  /* sources */
  'SourceSystem', 'SourceTransaction',
] as const;
export type SemanticType = (typeof SEMANTIC_TYPES)[number];

/** the id prefix each type uses — the same references governed tools already accept where one exists */
export const PREFIX: Record<SemanticType, string> = {
  User: 'person', Role: 'role', Team: 'team', Reviewer: 'role', Preparer: 'role', Approver: 'role',
  LegalEntity: 'entity', ParentEntity: 'entity', ConsolidationNode: 'consol', EliminationEntity: 'elim', Fund: 'fund', Project: 'project', Property: 'property', Region: 'region',
  BusinessUnit: 'bu', Department: 'department', CostCenter: 'costcenter', Vendor: 'vendor', Customer: 'customer',
  FiscalYear: 'fy', Quarter: 'quarter', Period: 'period', ClosePeriod: 'closeperiod', ComparisonPeriod: 'period',
  Account: 'account', ChartOfAccounts: 'coa', TrialBalance: 'tb', GovernedLedgerPopulation: 'population', GovernedLedgerEntry: 'txn', FinancialStatement: 'fs', FinancialStatementLine: 'fsline',
  ReportingLens: 'lens', Currency: 'currency', AccountingBasis: 'basis',
  FluxAnalysis: 'fluxanalysis', FluxItem: 'flux', FluxExplanation: 'explanation', Reconciliation: 'recon', ReconcilingItem: 'reconitem', Close: 'close', CloseTask: 'closetask', CloseBlocker: 'blocker',
  Actual: 'planning', Budget: 'planning', Forecast: 'planning', Scenario: 'planning', PlanningVersion: 'planning', Variance: 'variance', Driver: 'driver', Assumption: 'assumption',
  Report: 'report', ReportingPackage: 'package', Artifact: 'artifact', Evidence: 'evidence', SupportDocument: 'document', Policy: 'policy', Control: 'control',
  AuditRequest: 'pbc', AuditSelection: 'selection', AuditPopulation: 'auditpop', PBCPackage: 'artifact',
  SourceSystem: 'source', SourceTransaction: 'sourcetxn',
};
export const sid = (type: SemanticType, key: string) => `${PREFIX[type]}:${key}`;

export interface SemanticObject {
  id: string;
  type: SemanticType;
  /** further types the same object plays ("MDH" is a LegalEntity and a ParentEntity) */
  roles?: SemanticType[];
  label: string;
  /** aliases a person might use ("South Valley" for SV-PH2, "L. Chen" for Lin Chen) */
  aliases?: string[];
  attrs: Record<string, unknown>;
  period?: string | null;
  /** the legal entity (or GROUP) the object belongs to — what visibility is checked against. A list means the object
   *  spans several entities and is visible where ANY of them is (a project, a vendor, a cost centre). */
  scope?: string | string[] | null;
  /** the Korvyn service that owns the object — never "the graph" */
  source: string;
  /** the governed tool (and arguments) that states this object's figures */
  tool?: { id: string; args: Record<string, string> } | null;
  /** false: the concept is known but the server book holds no governed instance (planning, funds …) */
  governed?: boolean;
}

export const RELATIONS = [
  'HAS_ROLE', 'MEMBER_OF', 'PREPARES', 'REVIEWS', 'APPROVES', 'OWNS', 'REQUESTED',
  'CHILD_OF', 'INCLUDED_IN', 'ELIMINATED_IN', 'IN_REGION', 'FUNCTIONAL_CURRENCY', 'ACTIVE_IN', 'SOURCED_FROM',
  'PART_OF', 'IN_PERIOD', 'COMPARED_TO', 'CLOSES',
  'IN_CHART', 'MAPPED_FROM', 'PRESENTED_IN', 'HAS_ACTIVITY', 'BELONGS_TO', 'RELATES_TO',
  'HAS_FLUX', 'HAS_EXPLANATION', 'RECONCILED_BY', 'HAS_RECONCILING_ITEM', 'SUPPORTED_BY', 'SUPPORTS',
  'HAS_TASK', 'OWNED_BY', 'REVIEWED_BY', 'PREPARED_BY', 'APPROVED_BY', 'HAS_BLOCKER', 'BLOCKED_BY',
  'USES', 'CONTAINS', 'MATCHES', 'SELECTED_FROM', 'GOVERNED_BY', 'COMPARES', 'MEASURED_AGAINST',
] as const;
export type Relation = (typeof RELATIONS)[number];
export interface Edge { from: string; rel: Relation; to: string; attrs?: Record<string, unknown> }

/** one step of a trace: statement → line → account → population → transaction → source / evidence */
export interface TraceStep { level: 'FinancialStatement' | 'FinancialStatementLine' | 'Account' | 'GovernedLedgerPopulation' | 'GovernedLedgerEntry' | 'SourceTransaction' | 'SourceSystem' | 'Evidence'; id: string; label: string; detail: string }
