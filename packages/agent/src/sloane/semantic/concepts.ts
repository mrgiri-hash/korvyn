/**
 * THE GOVERNED FINANCIAL CONCEPT LAYER.
 *
 * The boundary this file exists to hold (§1):
 *
 *   GENERAL FINANCIAL KNOWLEDGE   the model may understand and reason about it.
 *                                 "OPEX generally means operating expenses" needs no lookup.
 *   ENTERPRISE FINANCIAL TRUTH    Korvyn resolves and proves it.
 *                                 "June OPEX was $128.4M" and "this book excludes D&A from OPEX" do not.
 *
 * So this is NOT a phrase router and must never become one. It answers one question — *which governed members
 * does this concept mean IN THIS BOOK* — and it answers it with candidates, ambiguity and provenance rather than
 * with a guess. It holds no amount: every figure still comes from `GovernedLedger` through a governed tool.
 *
 * §8: a concept's mappings point at the SAME chart every other service reads. `resolve()` validates each member
 * against the live chart and drops what is not there, so this can never drift into a parallel finance universe.
 *
 * §12: relationships are stated, never collapsed. OPEX is not SG&A, CIP is not capex, NOI is not EBITDA. Where the
 * book cannot decide between two honest readings, the resolution says AMBIGUOUS and the caller asks.
 */
import type { GovernedLedger } from '../governed.js';

export type ConceptCategory =
  /** something you can measure on the books (a balance, a cost grouping) */
  | 'MEASURE'
  /** a classification of accounts or activity */
  | 'CLASSIFICATION'
  /** a derived performance measure — arithmetic over governed measures, not a posted line */
  | 'DERIVED_MEASURE'
  /** a close / control activity rather than a figure */
  | 'PROCESS'
  /** an accounting event or adjustment */
  | 'EVENT';

/**
 * How a concept could be read against THIS book. `basis` is the whole point:
 *   GOVERNED  — the tenant (or the chart itself) has ruled; this is what Korvyn reports.
 *   CANDIDATE — an honest reading a controller might mean; Korvyn has not been told which.
 *   NOT_HELD  — Korvyn does not hold this; the note says what it does hold instead.
 */
export interface ConceptMapping {
  mappingId: string;
  label: string;
  kind: 'ACCOUNT_GROUP' | 'ACCOUNTS' | 'DERIVED' | 'DIMENSION' | 'PROCESS' | 'NOT_HELD';
  /** account or account-group codes; a group code includes its children (the ledger expands it) */
  members: string[];
  /** for DERIVED: the governed measures it is built from, as concept ids with a sign */
  formula?: { conceptId: string; sign: 1 | -1 }[];
  basis: 'GOVERNED' | 'CANDIDATE' | 'NOT_HELD';
  /**
   * The reading a finance professional means by default when the tenant has NOT ruled. It is not a governed
   * definition and must never be reported as one — a resolution that uses it comes back DEFAULTED, so the answer
   * says which reading it used and what the alternatives are (§7, §12).
   */
  preferred?: true;
  note: string;
}

/**
 * PHASE 2 §13 — IS THE TERM A STOCK OR A FLOW?
 *
 * The accounts do not settle this and assuming they do is the defect Phase 1.5 shipped. "Capex" resolves to CIP
 * and PP&E, which are balance-sheet accounts, so a question about SPEND came back with a BALANCE — every figure
 * governed, the answer wrong. Capex is a flow whatever its accounts are; CIP is a stock; a reconciliation is
 * neither. A concept that leaves this unset takes its accounts' own nature, which is right for most of them.
 */
export type NaturalMeasure = 'BALANCE' | 'ACTIVITY';

export interface FinancialConcept {
  conceptId: string;
  canonicalName: string;
  category: ConceptCategory;
  /** what this TERM means when the sentence does not say; the sentence's verb still wins (§13) */
  naturalMeasure?: NaturalMeasure;
  /** the GENERAL accounting meaning — what any competent finance professional would say, tenant-independent */
  definition: string;
  aliases: string[];
  broader: string[];
  narrower: string[];
  related: string[];
  /** why this term can mean more than one thing, stated so the caller can ask a real question */
  ambiguityNotes: string[];
  mappings: ConceptMapping[];
}

const M = (
  mappingId: string, label: string, kind: ConceptMapping['kind'], members: string[],
  basis: ConceptMapping['basis'], note: string, formula?: ConceptMapping['formula'],
): ConceptMapping => ({ mappingId, label, kind, members, basis, note, ...(formula ? { formula } : {}) });
/** mark the reading a professional means by default where one honestly exists */
const pref = (m: ConceptMapping): ConceptMapping => ({ ...m, preferred: true });

/* ================================================================================================
   THE CATALOGUE — general meaning, and how it COULD read on a governed book
   ================================================================================================ */

export const FINANCIAL_CONCEPTS: readonly FinancialConcept[] = [
  {
    conceptId: 'OPERATING_EXPENSE', canonicalName: 'Operating expenses', category: 'CLASSIFICATION',
    definition: 'The costs of running the business in the period, as distinct from capital spend and from financing costs.',
    aliases: ['opex', 'op ex', 'op-ex', 'operating expense', 'operating expenses', 'operating costs', 'operating cost', 'running costs', 'cost base', 'expenses'],
    broader: [], narrower: ['COST_OF_OPERATIONS', 'SGA', 'PROPERTY_OPERATING_EXPENSE'], related: ['CAPITAL_EXPENDITURE', 'DEPRECIATION_AMORTIZATION', 'EBITDA'],
    ambiguityNotes: [
      'This book names one account group "Operating expenses" (60000) that holds only the corporate cost lines — selling, G&A, professional fees, property taxes and insurance. Direct operating cost sits in a separate group, Cost of operations (50000).',
      'Most controllers mean total operating cost — both groups — when they say OPEX, and usually exclude depreciation and amortisation. This tenant has not recorded a definition, so Korvyn does not assume one.',
    ],
    mappings: [
      pref(M('OPEX_TOTAL_EX_DA', 'Total operating cost, excluding D&A', 'ACCOUNTS', ['50000', '60000'], 'CANDIDATE',
        'Cost of operations plus Operating expenses. Excludes depreciation and amortisation, interest and tax.')),
      M('OPEX_GROUP_60000', 'The account group named "Operating expenses" (60000)', 'ACCOUNT_GROUP', ['60000'], 'CANDIDATE',
        'The chart’s own group: selling & marketing, G&A, professional fees, property taxes and insurance. Narrower than most people mean by OPEX.'),
      M('OPEX_TOTAL_INC_DA', 'Total operating cost, including D&A', 'ACCOUNTS', ['50000', '60000', '65000'], 'CANDIDATE',
        'Adds depreciation and amortisation — total cost above operating income.'),
    ],
  },
  {
    conceptId: 'COST_OF_OPERATIONS', canonicalName: 'Cost of operations', category: 'CLASSIFICATION',
    definition: 'The direct cost of delivering the service — for a data-centre operator, power, cooling, site operations and network.',
    aliases: ['cost of operations', 'cost of revenue', 'cost of sales', 'cogs', 'direct costs', 'direct cost', 'site costs', 'property operating expenses', 'property opex'],
    broader: ['OPERATING_EXPENSE'], narrower: [], related: ['GROSS_MARGIN', 'SGA'],
    ambiguityNotes: ['"Property operating expenses" is used loosely; on this book the governed grouping is Cost of operations (50000).'],
    mappings: [M('COO_50000', 'Cost of operations (50000)', 'ACCOUNT_GROUP', ['50000'], 'GOVERNED', 'The chart’s own group: power & cooling, site operations & maintenance, network & bandwidth.')],
  },
  {
    conceptId: 'SGA', canonicalName: 'Selling, general & administrative', category: 'CLASSIFICATION',
    definition: 'Corporate overhead — selling and marketing, general and administrative, professional fees.',
    aliases: ['sg&a', 'sga', 's g and a', 'selling general and administrative', 'overhead', 'corporate overhead', 'admin costs', 'g&a', 'ga'],
    broader: ['OPERATING_EXPENSE'], narrower: [], related: ['COST_OF_OPERATIONS'],
    ambiguityNotes: ['The chart group 60000 also carries property taxes and insurance (60400), which many would call a property cost rather than SG&A.'],
    mappings: [
      pref(M('SGA_CORE', 'Selling, G&A and professional fees', 'ACCOUNTS', ['60100', '60200', '60300'], 'CANDIDATE', 'Excludes property taxes & insurance (60400).')),
      M('SGA_GROUP_60000', 'The whole 60000 group', 'ACCOUNT_GROUP', ['60000'], 'CANDIDATE', 'Includes property taxes & insurance.'),
    ],
  },
  {
    conceptId: 'CAPITAL_EXPENDITURE', canonicalName: 'Capital expenditure', category: 'MEASURE', naturalMeasure: 'ACTIVITY',
    definition: 'Spend capitalised onto the balance sheet rather than expensed — additions to construction in progress and to property, plant and equipment.',
    aliases: ['capex', 'cap ex', 'cap-ex', 'capital expenditure', 'capital spend', 'capital spending', 'development spend', 'development spending', 'growth spend'],
    broader: [], narrower: ['CONSTRUCTION_IN_PROGRESS'], related: ['OPERATING_EXPENSE', 'PPE', 'DEPRECIATION_AMORTIZATION'],
    ambiguityNotes: [
      'Capex is NOT the CIP balance. The balance is what has been capitalised to date; capex is the period’s additions.',
      'Korvyn holds no cash-flow statement, so capex here is the period activity posted to the capitalised accounts, not cash paid.',
    ],
    mappings: [
      pref(M('CAPEX_ACTIVITY', 'Period activity on capitalised accounts', 'ACCOUNTS', ['15000', '16000'], 'CANDIDATE',
        'Construction in progress plus property, plant & equipment. Read as period ACTIVITY, not as a balance.')),
      M('CAPEX_CIP_ONLY', 'Construction in progress activity only', 'ACCOUNT_GROUP', ['15000'], 'CANDIDATE', 'Development spend still in construction, before it is placed in service.'),
    ],
  },
  {
    conceptId: 'CONSTRUCTION_IN_PROGRESS', canonicalName: 'Construction in progress', category: 'MEASURE', naturalMeasure: 'BALANCE',
    definition: 'Capitalised project cost for assets not yet placed in service.',
    aliases: ['cip', 'cwip', 'construction in progress', 'construction-in-progress', 'work in progress', 'construction', 'projects under construction'],
    broader: ['CAPITAL_EXPENDITURE'], narrower: [], related: ['PPE', 'CAPITALIZED_INTEREST'],
    ambiguityNotes: [],
    mappings: [M('CIP_15000', 'Construction in progress (15000)', 'ACCOUNT_GROUP', ['15000'], 'GOVERNED', 'Buildings, equipment, capitalised interest and capitalised labour.')],
  },
  {
    conceptId: 'PPE', canonicalName: 'Property, plant & equipment', category: 'MEASURE',
    definition: 'Long-lived assets in service, carried at cost less accumulated depreciation.',
    aliases: ['pp&e', 'ppe', 'p p and e', 'property plant and equipment', 'fixed assets', 'fixed asset', 'capital assets'],
    broader: [], narrower: [], related: ['CONSTRUCTION_IN_PROGRESS', 'ACCUMULATED_DEPRECIATION'],
    ambiguityNotes: ['Gross PP&E (16000) and net PP&E (16000 less accumulated depreciation 17000) are different figures.'],
    mappings: [
      M('PPE_GROSS', 'Gross PP&E (16000)', 'ACCOUNT_GROUP', ['16000'], 'CANDIDATE', 'At cost, before accumulated depreciation.'),
      pref(M('PPE_NET', 'Net PP&E', 'ACCOUNTS', ['16000', '17000'], 'CANDIDATE', 'Cost plus accumulated depreciation (a credit balance), i.e. net book value.')),
    ],
  },
  {
    conceptId: 'ACCUMULATED_DEPRECIATION', canonicalName: 'Accumulated depreciation', category: 'MEASURE',
    definition: 'The cumulative depreciation charged against assets in service.',
    aliases: ['accumulated depreciation', 'accum depreciation', 'accum deprn', 'a/d'],
    broader: [], narrower: [], related: ['PPE', 'DEPRECIATION_AMORTIZATION'], ambiguityNotes: [],
    mappings: [M('AD_17000', 'Accumulated depreciation (17000)', 'ACCOUNT_GROUP', ['17000'], 'GOVERNED', '')],
  },
  {
    conceptId: 'DEPRECIATION_AMORTIZATION', canonicalName: 'Depreciation & amortisation', category: 'CLASSIFICATION',
    definition: 'The periodic charge that spreads the cost of long-lived assets over their useful lives.',
    aliases: ['d&a', 'da', 'depreciation', 'amortisation', 'amortization', 'depreciation and amortization', 'depreciation expense'],
    broader: ['OPERATING_EXPENSE'], narrower: [], related: ['EBITDA', 'PPE'], ambiguityNotes: [],
    mappings: [M('DA_65000', 'Depreciation & amortisation (65000)', 'ACCOUNT_GROUP', ['65000'], 'GOVERNED', '')],
  },
  {
    conceptId: 'REVENUE', canonicalName: 'Revenue', category: 'MEASURE',
    definition: 'Income earned from customers in the period.',
    aliases: ['revenue', 'sales', 'top line', 'topline', 'turnover', 'income'],
    broader: [], narrower: [], related: ['GROSS_MARGIN'], ambiguityNotes: [],
    mappings: [M('REV_40000', 'Revenue (40000)', 'ACCOUNT_GROUP', ['40000'], 'GOVERNED', 'Colocation, interconnection, power reimbursement and managed services.')],
  },
  {
    conceptId: 'EBITDA', canonicalName: 'EBITDA', category: 'DERIVED_MEASURE',
    definition: 'Earnings before interest, tax, depreciation and amortisation — an operating performance measure that removes financing and non-cash asset charges.',
    aliases: ['ebitda', 'adjusted ebitda', 'ebitdar'],
    broader: [], narrower: [], related: ['EBIT', 'NOI', 'OPERATING_MARGIN', 'DEPRECIATION_AMORTIZATION'],
    ambiguityNotes: [
      'EBITDA is not a line on this book’s statements; it is arithmetic over governed lines.',
      'Adjusted EBITDA depends on a tenant’s stated adjustments, and this tenant has recorded none.',
    ],
    mappings: [M('EBITDA_DERIVED', 'Revenue less cost of operations and operating expenses', 'DERIVED', [], 'CANDIDATE',
      'Excludes D&A (65000), interest (70100) and tax. Korvyn can compute it from governed lines and will state each component.',
      [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }, { conceptId: 'SGA', sign: -1 }])],
  },
  {
    conceptId: 'EBIT', canonicalName: 'EBIT / operating income', category: 'DERIVED_MEASURE',
    definition: 'Earnings before interest and tax — EBITDA less depreciation and amortisation.',
    aliases: ['ebit', 'operating income', 'operating profit', 'income from operations'],
    broader: [], narrower: [], related: ['EBITDA'], ambiguityNotes: ['Not a posted line; derived from governed lines.'],
    mappings: [M('EBIT_DERIVED', 'Revenue less all operating cost including D&A', 'DERIVED', [], 'CANDIDATE', 'Excludes interest and tax.',
      [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }, { conceptId: 'SGA', sign: -1 }, { conceptId: 'DEPRECIATION_AMORTIZATION', sign: -1 }])],
  },
  {
    conceptId: 'GROSS_MARGIN', canonicalName: 'Gross margin', category: 'DERIVED_MEASURE',
    definition: 'Revenue less the direct cost of delivering it, in currency or as a percentage of revenue.',
    aliases: ['gross margin', 'gross profit', 'margin'],
    broader: [], narrower: [], related: ['OPERATING_MARGIN', 'COST_OF_OPERATIONS'],
    ambiguityNotes: ['"Margin" alone may mean gross, operating or net margin.'],
    mappings: [M('GM_DERIVED', 'Revenue less cost of operations', 'DERIVED', [], 'CANDIDATE', '',
      [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }])],
  },
  {
    conceptId: 'OPERATING_MARGIN', canonicalName: 'Operating margin', category: 'DERIVED_MEASURE',
    definition: 'Operating income as a percentage of revenue.',
    aliases: ['operating margin', 'op margin', 'ebit margin'],
    broader: [], narrower: [], related: ['EBIT', 'GROSS_MARGIN'], ambiguityNotes: [],
    mappings: [M('OM_DERIVED', 'Operating income over revenue', 'DERIVED', [], 'CANDIDATE', '', [{ conceptId: 'EBIT', sign: 1 }])],
  },
  {
    conceptId: 'NOI', canonicalName: 'Net operating income', category: 'DERIVED_MEASURE',
    definition: 'A real-estate measure: property revenue less property operating expenses, before corporate overhead, depreciation, interest and tax.',
    aliases: ['noi', 'net operating income', 'property noi'],
    broader: [], narrower: [], related: ['EBITDA'],
    ambiguityNotes: ['NOI and EBITDA are not the same: NOI excludes corporate overhead, EBITDA does not.'],
    mappings: [M('NOI_DERIVED', 'Revenue less cost of operations', 'DERIVED', [], 'CANDIDATE',
      'Korvyn’s financial summary reports an NOI figure on this basis. Corporate overhead (60000) is not deducted.',
      [{ conceptId: 'REVENUE', sign: 1 }, { conceptId: 'COST_OF_OPERATIONS', sign: -1 }])],
  },
  {
    conceptId: 'WORKING_CAPITAL', canonicalName: 'Working capital', category: 'DERIVED_MEASURE',
    definition: 'Current assets less current liabilities — the short-term capital tied up in running the business.',
    aliases: ['working capital', 'nwc', 'net working capital', 'working capital pressure'],
    broader: [], narrower: [], related: ['AR', 'AP', 'PREPAID', 'ACCRUED_LIABILITIES', 'DEFERRED_REVENUE'],
    ambiguityNotes: ['This chart does not mark accounts as current or non-current, so Korvyn cannot compute a governed working-capital subtotal. Its components are held individually.'],
    mappings: [M('WC_NOT_HELD', 'Not held as a governed subtotal', 'NOT_HELD', [], 'NOT_HELD',
      'Korvyn holds the components — receivables (11000), prepaids (12000), payables (20000), accrued liabilities (21000), deferred revenue (24000) — and can show each and their movement.')],
  },
  {
    conceptId: 'AR', canonicalName: 'Accounts receivable', category: 'MEASURE',
    definition: 'Amounts owed by customers for goods or services already delivered.',
    aliases: ['ar', 'a/r', 'accounts receivable', 'receivables', 'trade receivables', 'debtors'],
    broader: ['WORKING_CAPITAL'], narrower: [], related: ['DEFERRED_REVENUE'],
    ambiguityNotes: ['Intercompany receivable (13000) is a separate group and is not part of trade AR.'],
    mappings: [M('AR_11000', 'Accounts receivable (11000)', 'ACCOUNT_GROUP', ['11000'], 'GOVERNED', 'Trade receivables, unbilled revenue and the allowance.')],
  },
  {
    conceptId: 'AP', canonicalName: 'Accounts payable', category: 'MEASURE',
    definition: 'Amounts owed to suppliers for goods or services already received.',
    aliases: ['ap', 'a/p', 'accounts payable', 'payables', 'trade payables', 'creditors'],
    broader: ['WORKING_CAPITAL'], narrower: [], related: ['ACCRUED_LIABILITIES', 'RETAINAGE'],
    ambiguityNotes: ['Intercompany payable (23000) and retainage payable (22000) are separate groups.'],
    mappings: [M('AP_20000', 'Accounts payable (20000)', 'ACCOUNT_GROUP', ['20000'], 'GOVERNED', '')],
  },
  {
    conceptId: 'ACCRUED_LIABILITIES', canonicalName: 'Accrued liabilities', category: 'MEASURE',
    definition: 'Costs incurred but not yet invoiced or paid, recognised so the period bears its own expense.',
    aliases: ['accruals', 'accrued', 'accrued liabilities', 'accrued expenses', 'accrual'],
    broader: ['WORKING_CAPITAL'], narrower: [], related: ['AP', 'TRUE_UP'],
    ambiguityNotes: ['"Accrual" may mean the balance-sheet liability or the act of posting an accrual entry.'],
    mappings: [M('ACCR_21000', 'Accrued liabilities (21000)', 'ACCOUNT_GROUP', ['21000'], 'GOVERNED', 'Accrued expenses, interest and payroll.')],
  },
  {
    conceptId: 'PREPAID', canonicalName: 'Prepaid expenses', category: 'MEASURE',
    definition: 'Costs paid in advance of the period that will bear them.',
    aliases: ['prepaids', 'prepaid', 'prepaid expenses', 'prepayments'],
    broader: ['WORKING_CAPITAL'], narrower: [], related: ['ACCRUED_LIABILITIES'], ambiguityNotes: [],
    mappings: [M('PREPAID_12000', 'Prepaid & other current assets (12000)', 'ACCOUNT_GROUP', ['12000'], 'GOVERNED', 'Prepaid insurance and prepaid property tax.')],
  },
  {
    conceptId: 'DEFERRED_REVENUE', canonicalName: 'Deferred revenue', category: 'MEASURE',
    definition: 'Cash billed or received before the service is delivered — a liability until it is earned.',
    aliases: ['deferred revenue', 'unearned revenue', 'deferred income', 'contract liability'],
    broader: ['WORKING_CAPITAL'], narrower: [], related: ['AR', 'REVENUE'], ambiguityNotes: [],
    mappings: [M('DR_24000', 'Deferred revenue (24000)', 'ACCOUNT_GROUP', ['24000'], 'GOVERNED', '')],
  },
  {
    conceptId: 'RETAINAGE', canonicalName: 'Retainage payable', category: 'MEASURE',
    definition: 'Amounts withheld from construction contractors until the work is accepted.',
    aliases: ['retainage', 'retention', 'retentions payable'],
    broader: [], narrower: [], related: ['AP', 'CONSTRUCTION_IN_PROGRESS'], ambiguityNotes: [],
    mappings: [M('RET_22000', 'Retainage payable (22000)', 'ACCOUNT_GROUP', ['22000'], 'GOVERNED', '')],
  },
  {
    conceptId: 'INTERCOMPANY', canonicalName: 'Intercompany balances', category: 'CLASSIFICATION',
    definition: 'Amounts between entities of the same group, which eliminate on consolidation.',
    aliases: ['intercompany', 'inter-company', 'ic', 'intercompany balances', 'due to and from affiliates', 'affiliates'],
    broader: [], narrower: [], related: ['ELIMINATIONS'],
    ambiguityNotes: ['The receivable (13000) and the payable (23000) are separate groups; "intercompany" may mean either or the net.'],
    mappings: [
      M('IC_BOTH', 'Intercompany receivable and payable', 'ACCOUNTS', ['13000', '23000'], 'CANDIDATE', ''),
      M('IC_RECEIVABLE', 'Intercompany receivable (13000)', 'ACCOUNT_GROUP', ['13000'], 'CANDIDATE', ''),
      M('IC_PAYABLE', 'Intercompany payable (23000)', 'ACCOUNT_GROUP', ['23000'], 'CANDIDATE', ''),
    ],
  },
  {
    conceptId: 'ELIMINATIONS', canonicalName: 'Consolidation eliminations', category: 'PROCESS',
    definition: 'Entries that remove intra-group activity so the consolidated statements show only third-party results.',
    aliases: ['eliminations', 'elims', 'consolidation eliminations', 'intercompany eliminations'],
    broader: [], narrower: [], related: ['INTERCOMPANY'],
    ambiguityNotes: [],
    mappings: [M('ELIM_PROCESS', 'A consolidation step, not an account', 'PROCESS', [], 'GOVERNED',
      'Korvyn applies a declared intercompany-fee elimination when it consolidates; it is stated as a declared input on every consolidated figure, not posted to an account.')],
  },
  {
    conceptId: 'FX_TRANSLATION', canonicalName: 'Foreign currency translation', category: 'CLASSIFICATION',
    definition: 'The effect of restating a foreign entity’s results and balances into the reporting currency.',
    aliases: ['fx', 'f/x', 'foreign exchange', 'currency', 'translation', 'cta', 'currency translation adjustment', 'translation adjustment'],
    broader: [], narrower: [], related: ['FX_GAIN_LOSS'],
    ambiguityNotes: ['Two different things share the word FX: the P&L remeasurement gain or loss (70300) and the equity translation adjustment (30400, CTA). They are not interchangeable.'],
    mappings: [
      M('CTA_30400', 'Cumulative translation adjustment (30400)', 'ACCOUNT_GROUP', ['30400'], 'CANDIDATE', 'The equity account carrying translation of foreign operations.'),
      M('FXPL_70300', 'Foreign-exchange gain/loss (70300)', 'ACCOUNT_GROUP', ['70300'], 'CANDIDATE', 'The income-statement remeasurement result.'),
    ],
  },
  {
    conceptId: 'FX_GAIN_LOSS', canonicalName: 'Foreign-exchange gain or loss', category: 'MEASURE',
    definition: 'The income-statement result of remeasuring foreign-currency balances.',
    aliases: ['fx gain', 'fx loss', 'foreign exchange gain', 'remeasurement'],
    broader: ['FX_TRANSLATION'], narrower: [], related: [], ambiguityNotes: [],
    mappings: [M('FXPL', 'Foreign-exchange gain/loss (70300)', 'ACCOUNT_GROUP', ['70300'], 'GOVERNED', '')],
  },
  {
    conceptId: 'NCI', canonicalName: 'Non-controlling interest', category: 'CLASSIFICATION',
    definition: 'The share of a subsidiary’s equity and results not owned by the parent.',
    aliases: ['nci', 'non-controlling interest', 'noncontrolling interest', 'minority interest'],
    broader: [], narrower: [], related: ['ELIMINATIONS'],
    ambiguityNotes: [],
    mappings: [M('NCI_NOT_HELD', 'Not held on this book', 'NOT_HELD', [], 'NOT_HELD',
      'Every consolidated entity in this group is wholly owned, so Korvyn carries no non-controlling interest.')],
  },
  {
    conceptId: 'RETAINED_EARNINGS', canonicalName: 'Retained earnings', category: 'MEASURE',
    definition: 'Cumulative earnings not distributed to owners.',
    aliases: ['retained earnings', 're', 'accumulated deficit'],
    broader: [], narrower: [], related: [], ambiguityNotes: [],
    mappings: [M('RE_30300', 'Retained earnings (30300)', 'ACCOUNT_GROUP', ['30300'], 'GOVERNED', '')],
  },
  {
    conceptId: 'DEBT', canonicalName: 'Debt', category: 'MEASURE',
    definition: 'Borrowings — drawn facilities, term loans and notes.',
    aliases: ['debt', 'borrowings', 'loans', 'leverage', 'notes payable'],
    broader: [], narrower: [], related: ['INTEREST_EXPENSE', 'DEBT_SERVICE'], ambiguityNotes: [],
    mappings: [M('DEBT_25000', 'Debt (25000)', 'ACCOUNT_GROUP', ['25000'], 'GOVERNED', 'Revolver, term loan and senior notes.')],
  },
  {
    conceptId: 'INTEREST_EXPENSE', canonicalName: 'Interest expense', category: 'MEASURE',
    definition: 'The cost of borrowing charged to the income statement.',
    aliases: ['interest', 'interest expense', 'finance costs', 'interest cost'],
    broader: [], narrower: [], related: ['DEBT', 'CAPITALIZED_INTEREST'],
    ambiguityNotes: ['Interest capitalised into construction (15300) is not expensed and is a separate figure.'],
    mappings: [M('INT_70100', 'Interest expense (70100)', 'ACCOUNT_GROUP', ['70100'], 'GOVERNED', '')],
  },
  {
    conceptId: 'CAPITALIZED_INTEREST', canonicalName: 'Capitalised interest', category: 'MEASURE',
    definition: 'Borrowing cost added to the cost of an asset under construction rather than expensed.',
    aliases: ['capitalized interest', 'capitalised interest', 'cap interest'],
    broader: ['CONSTRUCTION_IN_PROGRESS'], narrower: [], related: ['INTEREST_EXPENSE'], ambiguityNotes: [],
    mappings: [M('CAPINT_15300', 'CIP — capitalised interest (15300)', 'ACCOUNT_GROUP', ['15300'], 'GOVERNED', '')],
  },
  {
    conceptId: 'DEBT_SERVICE', canonicalName: 'Debt service', category: 'DERIVED_MEASURE',
    definition: 'Cash required for borrowings in a period — interest plus scheduled principal repayment.',
    aliases: ['debt service', 'debt servicing', 'principal and interest'],
    broader: [], narrower: [], related: ['DEBT', 'INTEREST_EXPENSE'],
    ambiguityNotes: [],
    mappings: [M('DS_PARTIAL', 'Only the interest component is held', 'NOT_HELD', ['70100'], 'NOT_HELD',
      'Korvyn holds interest expense (70100) and the debt balance (25000). It holds no repayment schedule and no cash-flow statement, so it cannot report debt service as such.')],
  },
  {
    conceptId: 'CASH', canonicalName: 'Cash & cash equivalents', category: 'MEASURE',
    definition: 'Cash on hand, in bank and in short-term liquid investments.',
    aliases: ['cash', 'cash balance', 'liquidity', 'cash and equivalents'],
    broader: [], narrower: [], related: ['CASH_FLOW'], ambiguityNotes: [],
    mappings: [M('CASH_10000', 'Cash & cash equivalents (10000)', 'ACCOUNT_GROUP', ['10000'], 'GOVERNED', 'Operating, restricted and money-market.')],
  },
  {
    conceptId: 'CASH_FLOW', canonicalName: 'Cash flow', category: 'DERIVED_MEASURE',
    definition: 'Cash generated or used in a period — operating, investing and financing.',
    aliases: ['cash flow', 'cashflow', 'operating cash flow', 'ocf', 'free cash flow', 'fcf', 'cash burn', 'burn', 'burn rate', 'cash generation'],
    broader: [], narrower: [], related: ['CASH'],
    ambiguityNotes: ['Cash flow is not the cash balance. A movement in the cash balance is not the same as operating cash flow.'],
    mappings: [M('CF_NOT_HELD', 'No cash-flow statement is modelled', 'NOT_HELD', [], 'NOT_HELD',
      'Korvyn holds no cash-flow statement on this book. It can show the movement in the cash balance (10000) between two periods, which is not the same measure.')],
  },
  {
    conceptId: 'GOODWILL', canonicalName: 'Goodwill', category: 'MEASURE',
    definition: 'The excess of consideration over the fair value of identifiable net assets acquired.',
    aliases: ['goodwill', 'intangibles', 'intangible assets'],
    broader: [], narrower: [], related: [], ambiguityNotes: [],
    mappings: [M('GW_18000', 'Intangibles & goodwill (18000)', 'ACCOUNT_GROUP', ['18000'], 'GOVERNED', 'Goodwill and customer relationships.')],
  },
  {
    conceptId: 'RUN_RATE', canonicalName: 'Run rate', category: 'DERIVED_MEASURE',
    definition: 'A current period’s result extrapolated to a full year, as an indication of the ongoing level.',
    aliases: ['run rate', 'run-rate', 'runrate', 'annualised', 'annualized'],
    broader: [], narrower: [], related: [],
    ambiguityNotes: ['A run rate is a presentation choice, not a governed figure; which months it annualises changes the answer.'],
    mappings: [M('RR_NOT_HELD', 'Not a governed measure', 'NOT_HELD', [], 'NOT_HELD',
      'Korvyn reports governed period amounts and will not annualise them itself. It can show the trend over the months you name.')],
  },
  /* ---- process and event concepts: these resolve to a control surface, never to an amount ---- */
  {
    conceptId: 'CLOSE', canonicalName: 'The close', category: 'PROCESS',
    definition: 'The periodic process of finalising the books — reconciling, reviewing, explaining and certifying.',
    aliases: ['close', 'month end', 'month-end', 'period close', 'closing', 'close status', 'hard close'],
    broader: [], narrower: ['RECONCILIATION', 'FLUX'], related: [], ambiguityNotes: [],
    mappings: [M('CLOSE_PROCESS', 'Close readiness and blockers', 'PROCESS', [], 'GOVERNED', 'Korvyn holds close readiness, tasks, blockers and approvals for the period.')],
  },
  {
    conceptId: 'RECONCILIATION', canonicalName: 'Account reconciliation', category: 'PROCESS',
    definition: 'Proving a general-ledger balance against an independent source or a supporting schedule.',
    aliases: ['reconciliation', 'reconciliations', 'recs', 'rec', 'recons', 'account recs', 'balance sheet recs'],
    broader: ['CLOSE'], narrower: [], related: ['SUPPORT'], ambiguityNotes: [],
    mappings: [M('RECON_PROCESS', 'Reconciliation status and detail', 'PROCESS', [], 'GOVERNED', 'Tie status, difference, support and review state per reconciliation.')],
  },
  {
    conceptId: 'FLUX', canonicalName: 'Flux analysis', category: 'PROCESS',
    definition: 'Explaining period-over-period movements in statement lines above a materiality threshold.',
    aliases: ['flux', 'flux analysis', 'flux review', 'variance analysis', 'variance explanations', 'movement analysis'],
    broader: ['CLOSE'], narrower: [], related: ['MATERIALITY'], ambiguityNotes: [],
    mappings: [M('FLUX_PROCESS', 'Flux items and their explanations', 'PROCESS', [], 'GOVERNED', 'Material movements, explanation status and review state.')],
  },
  {
    conceptId: 'MATERIALITY', canonicalName: 'Materiality', category: 'PROCESS',
    definition: 'The threshold above which a movement or misstatement must be explained or corrected.',
    aliases: ['materiality', 'material', 'threshold', 'material movements'],
    broader: [], narrower: [], related: ['FLUX'], ambiguityNotes: [],
    mappings: [M('MAT_POLICY', 'The governed flux materiality threshold', 'PROCESS', [], 'GOVERNED', 'Korvyn applies a governed threshold when it decides which movements are material.')],
  },
  {
    conceptId: 'SUPPORT', canonicalName: 'Supporting evidence', category: 'PROCESS',
    definition: 'The documents and references that substantiate a balance or a transaction.',
    aliases: ['support', 'supporting evidence', 'evidence', 'backup', 'documentation', 'invoices', 'invoice support'],
    broader: [], narrower: [], related: ['RECONCILIATION'], ambiguityNotes: [],
    mappings: [M('SUPPORT_PROCESS', 'Support coverage and gaps', 'PROCESS', [], 'GOVERNED', 'Korvyn holds references — invoice, PO, contract, approval — not the documents themselves.')],
  },
  {
    conceptId: 'ROLLFORWARD', canonicalName: 'Roll-forward', category: 'PROCESS',
    definition: 'Opening balance plus the period’s movements equals the closing balance, shown as a schedule.',
    aliases: ['rollforward', 'roll-forward', 'roll forward', 'movement schedule', 'continuity schedule'],
    broader: ['RECONCILIATION'], narrower: [], related: [], ambiguityNotes: [],
    mappings: [M('RF_PROCESS', 'A reconciliation roll-forward', 'PROCESS', [], 'GOVERNED', '')],
  },
  {
    conceptId: 'ADJUSTMENT', canonicalName: 'Adjusting entry', category: 'EVENT',
    definition: 'A correcting or classifying entry made during or after the close.',
    aliases: ['true-up', 'true up', 'trueup', 'reclass', 'reclassification', 'topside', 'topside entry', 'topside adjustment', 'adjustment', 'adjusting entry', 'post-close adjustment', 'post close', 'late entries', 'late entry', 'manual journal'],
    broader: [], narrower: [], related: ['CLOSE'],
    ambiguityNotes: ['A topside entry (posted at consolidation) and a reclass within an entity are different things; both are journals.'],
    mappings: [M('ADJ_EVENT', 'Journal activity', 'PROCESS', [], 'GOVERNED', 'Korvyn can show the journals and governed records behind a movement, including postings that arrived after the period.')],
  },
];

/* ================================================================================================
   TENANT VOCABULARY (§11) — business language, governed as DATA, never as code branches
   ================================================================================================ */

export interface TenantTerm {
  term: string;
  conceptId: string;
  /** the mapping this tenant means by the term, when it has decided */
  mappingId?: string;
  note: string;
}

/**
 * Seeded for this tenant. An administrator surface would edit these; there is no such surface yet, and that is
 * stated rather than implied. A term here resolves as GOVERNED — the tenant HAS ruled.
 */
export const TENANT_VOCABULARY: readonly TenantTerm[] = [
  { term: 'power costs', conceptId: 'COST_OF_OPERATIONS', mappingId: 'COO_50000', note: 'Power & cooling (50100) is the largest component.' },
  { term: 'site costs', conceptId: 'COST_OF_OPERATIONS', mappingId: 'COO_50000', note: 'This tenant uses "site costs" for direct data-centre operating cost.' },
  { term: 'property opex', conceptId: 'COST_OF_OPERATIONS', mappingId: 'COO_50000', note: '' },
  { term: 'property operating expenses', conceptId: 'COST_OF_OPERATIONS', mappingId: 'COO_50000', note: '' },
  { term: 'corporate overhead', conceptId: 'SGA', mappingId: 'SGA_GROUP_60000', note: 'This tenant reads corporate overhead as the whole 60000 group.' },
  { term: 'development spend', conceptId: 'CAPITAL_EXPENDITURE', mappingId: 'CAPEX_CIP_ONLY', note: 'Spend on assets still in construction.' },
  { term: 'soft costs', conceptId: 'CONSTRUCTION_IN_PROGRESS', note: 'Non-construction project cost capitalised into CIP; Korvyn holds no separate soft-cost grouping on this chart.' },
  { term: 'owner costs', conceptId: 'CONSTRUCTION_IN_PROGRESS', note: 'Owner-furnished cost capitalised into CIP; not separately grouped on this chart.' },
];

/* ================================================================================================
   RESOLUTION — general meaning always, enterprise meaning where the book can decide
   ================================================================================================ */

export type ConceptStatus =
  /** exactly one governed reading, or the tenant has ruled */
  | 'RESOLVED'
  /** the book supports several readings and one is the common professional meaning — say which was used */
  | 'DEFAULTED'
  /** the concept is understood and the book offers more than one honest reading */
  | 'AMBIGUOUS'
  /** understood, and Korvyn holds nothing that answers it on this book */
  | 'NOT_HELD'
  /** not a finance term this catalogue knows — the model still understands the words */
  | 'UNKNOWN';

export interface ConceptResolution {
  status: ConceptStatus;
  term: string;
  concept: FinancialConcept | null;
  /** the readings this book supports, chart-validated */
  mappings: ConceptMapping[];
  /** the single reading Korvyn will use, when there is one */
  chosen: ConceptMapping | null;
  tenantTerm: TenantTerm | null;
  requiresClarification: boolean;
  /** what Korvyn could do next with this concept, in the person's language */
  analysisPaths: string[];
  notes: string[];
}

/**
 * `&` becomes the word it IS, so "SG&A", "sg and a" and "s g and a" are one term rather than three
 * aliases somebody has to remember to write down. Everything else here is punctuation removal.
 */
const norm = (s: string | undefined | null) =>
  String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[.,;:!?()'"]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * §2/§4 — REAL FINANCE LANGUAGE IS INFLECTED, AND THE CATALOGUE IS NOT.
 *
 * "did anyone post topsides", "how much interest did we capitalise", "receivables aging" are the
 * same terms as `topside`, `capitalised interest` and `receivable`; matching them exactly would mean
 * writing every plural and participle of every alias by hand, which is the static-dictionary trap
 * §35 rules out. A light stem applied to BOTH sides instead fixes the whole family at once — plurals,
 * -ing/-ed participles and the -ise/-ize split — and adds no term to the catalogue.
 *
 * It is deliberately crude. Consistency between the query and the alias is what matters, not
 * linguistic correctness: both sides go through the same function, so an over-eager stem still
 * matches itself and only ever costs precision at the margin.
 */
function stem(w: string): string {
  let s = w;
  if (s.length > 4 && !/(ss|us|is)$/.test(s)) {
    if (/ies$/.test(s)) s = `${s.slice(0, -3)}y`;
    else if (/(ches|shes|xes|zes|ses)$/.test(s)) s = s.slice(0, -2);
    else if (/s$/.test(s)) s = s.slice(0, -1);
  }
  if (s.length > 5) {
    if (/ing$/.test(s)) s = s.slice(0, -3);
    else if (/ed$/.test(s)) s = s.slice(0, -2);
  }
  /* British and American spellings of the same act are the same word, whatever the stem left behind */
  return s.replace(/i[sz]ation$/, 'ization').replace(/i[sz]e?$/, 'iz');
}
const stems = (s: string): string[] => norm(s).split(' ').filter(Boolean).map(stem);

/**
 * distance ≤ `max`, counting a SWAPPED PAIR as one edit — "recievables" is one slip away from
 * "receivables" to the person typing it, and plain Levenshtein calls it two. Transposition is the
 * most common typo in a hurried ledger note, so a check that cannot see it is not worth having.
 * It stops as soon as it cannot pass; this is a bounded check, not a general metric.
 */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  let two: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(row[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, two[j - 2]! + 1);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return false;
    two = prev;
    prev = row;
  }
  return prev[b.length]! <= max;
}

/** most words first, then longest, so "operating expenses" wins over "expenses" */
const ALIAS_INDEX: { alias: string; stems: string[]; conceptId: string }[] = FINANCIAL_CONCEPTS
  .flatMap((c) => [c.canonicalName, ...c.aliases].map((a) => ({ alias: norm(a), stems: stems(a), conceptId: c.conceptId })))
  .sort((a, b) => b.stems.length - a.stems.length || b.alias.length - a.alias.length);

export const conceptById = (id: string): FinancialConcept | null => FINANCIAL_CONCEPTS.find((c) => c.conceptId === id) ?? null;

/** a contiguous run of query tokens equal to the alias's tokens */
const runIn = (q: string[], a: string[]): boolean =>
  a.length > 0 && q.some((_, i) => i + a.length <= q.length && a.every((w, k) => q[i + k] === w));

/**
 * every concept whose alias appears in the text, most specific match first, each concept once.
 *
 * Three passes, and the ORDER is the control: an exact reading of the words always outranks a
 * tolerant one, so tolerance can only ever add a term nothing else claimed. The typo pass is last,
 * single-token, and floored at seven characters — long enough that one edit cannot turn one finance
 * term into a different one.
 */
export function conceptsIn(text: string): FinancialConcept[] {
  const q = stems(text);
  const seen = new Set<string>();
  const out: FinancialConcept[] = [];
  const take = (conceptId: string) => {
    if (seen.has(conceptId)) return;
    seen.add(conceptId);
    const c = conceptById(conceptId);
    if (c) out.push(c);
  };
  const exact = ` ${norm(text)} `;
  /* SPECIFICITY OUTRANKS EXACTNESS. Run exact and stemmed matching in ONE pass over the index, which
     is already ordered most-specific-first — otherwise a one-word exact hit claims the concept before
     a two-word inflected one is ever tried, and "how much interest did we capitalise" resolves to
     interest expense rather than capitalised interest. (It did.) */
  for (const a of ALIAS_INDEX) if (exact.includes(` ${a.alias} `) || runIn(q, a.stems)) take(a.conceptId);
  for (const a of ALIAS_INDEX) {
    if (a.stems.length !== 1 || a.stems[0]!.length < 7) continue;
    if (q.some((w) => w.length >= 7 && within(w, a.stems[0]!, 1))) take(a.conceptId);
  }
  return out;
}

const tenantTermIn = (text: string): TenantTerm | null => {
  const q = stems(text);
  const exact = ` ${norm(text)} `;
  const ranked = [...TENANT_VOCABULARY].sort((a, b) => b.term.length - a.term.length);
  return ranked.find((v) => exact.includes(` ${norm(v.term)} `)) ?? ranked.find((v) => runIn(q, stems(v.term))) ?? null;
};

/**
 * §8 — a mapping survives only if the chart still carries its members. A concept whose accounts were never
 * modelled (or were renamed away) must not offer a reading that resolves to nothing.
 */
function chartValid(gl: GovernedLedger, m: ConceptMapping): boolean {
  if (m.kind === 'DERIVED' || m.kind === 'PROCESS' || m.kind === 'NOT_HELD') return true;
  return m.members.length > 0 && m.members.every((code) => !!gl.account(code));
}

/* ================================================================================================
   §13/§14 — MEASURE INTENT: READ THE VERB, NOT THE NOUN
   ================================================================================================ */

/**
 * These are ASPECT cues, not finance phrases, and the difference matters for §35: "sitting in", "as at" and
 * "how much is there" are stative — they ask about a state at a moment. "Spent", "during June", "how much did we"
 * and "movement" are perfective or durative — they ask about something that happened over an interval. That
 * distinction is ordinary English grammar and it holds for any noun, which is why it can decide capex, CIP, cash
 * and a term nobody has thought of yet without a rule per term.
 */
const FLOW_CUE = /\b(spen[dt]|spending|incur(?:red)?|activity|additions?|movement|moved|posted|during|burn(?:ing|ed)?|outflow|inflow|run.?rate|per month|this month|in the month|over the (?:month|period|quarter|year))\b/i;
const STOCK_CUE = /\b(balance|sitting|stands?|standing|as (?:at|of)|on hand|carrying|held|outstanding|position|how much is (?:in|there)|what(?:'s| is) (?:in|our) )\b/i;

/**
 * What quantity the question is asking for. Returns null when the sentence does not say — the concept's own
 * nature then decides, which is the honest order: an explicit verb beats a term's default, and a term's default
 * beats a guess from the account type.
 */
export function measureIntent(text: string): NaturalMeasure | null {
  const t = norm(text);
  const flow = FLOW_CUE.test(t), stock = STOCK_CUE.test(t);
  if (flow === stock) return null;
  return flow ? 'ACTIVITY' : 'BALANCE';
}

/** the resolved measure for a subject: what was asked, else what the term means, else nothing stated */
export function resolveMeasure(text: string, concept: FinancialConcept | null, explicit?: string | null): NaturalMeasure | null {
  const e = (explicit ?? '').trim().toUpperCase();
  if (e === 'BALANCE' || e === 'ACTIVITY') return e;
  return measureIntent(text) ?? concept?.naturalMeasure ?? null;
}

export interface ConceptResolveInput {
  text: string;
  gl: GovernedLedger;
  /** a mapping the conversation has already settled on, so a follow-up does not ask twice */
  settled?: Record<string, string>;
}

export function resolveConcept(i: ConceptResolveInput): ConceptResolution {
  const { gl } = i;
  /* a caller may pass nothing; that is an UNKNOWN concept, never a crash */
  const text = String(i.text ?? '');
  const tenant = tenantTermIn(text);
  const byTenant = tenant ? conceptById(tenant.conceptId) : null;
  const concept = byTenant ?? conceptsIn(text)[0] ?? null;

  if (!concept) {
    return {
      status: 'UNKNOWN', term: text.trim(), concept: null, mappings: [], chosen: null, tenantTerm: null,
      requiresClarification: false, analysisPaths: [],
      notes: ['Korvyn holds no governed concept under that name. Say what it should mean in accounting terms and Korvyn will look for the governed equivalent.'],
    };
  }

  const mappings = concept.mappings.filter((m) => chartValid(gl, m));
  const notHeld = mappings.length > 0 && mappings.every((m) => m.basis === 'NOT_HELD');
  const governed = mappings.filter((m) => m.basis === 'GOVERNED');

  /* the tenant has ruled, or the conversation already settled it, or the chart leaves exactly one reading */
  const settledId = i.settled?.[concept.conceptId];
  const ruled =
    (tenant?.mappingId ? mappings.find((m) => m.mappingId === tenant.mappingId) : null)
    ?? (settledId ? mappings.find((m) => m.mappingId === settledId) : null)
    ?? (governed.length === 1 ? governed[0]! : null)
    ?? (mappings.length === 1 ? mappings[0]! : null)
    ?? null;
  /* nobody has ruled, but one reading is what a finance professional means by the word: use it AND say so */
  const byDefault = ruled ? null : mappings.find((m) => m.preferred) ?? null;
  const chosen = ruled ?? byDefault;

  const status: ConceptStatus = notHeld ? 'NOT_HELD' : ruled ? 'RESOLVED' : byDefault ? 'DEFAULTED' : 'AMBIGUOUS';
  const notes: string[] = [...concept.ambiguityNotes];
  if (byDefault) {
    const others = mappings.filter((m) => m.mappingId !== byDefault.mappingId).map((m) => m.label);
    notes.unshift(`This tenant has not recorded a definition of ${concept.canonicalName}. Korvyn used the usual professional reading — ${byDefault.label}${byDefault.members.length ? ` (${byDefault.members.join(', ')})` : ''}. Say which reading was used${others.length ? `; the alternatives on this book are ${others.join(' and ')}` : ''}.`);
  }
  if (tenant) notes.unshift(`This tenant uses "${tenant.term}" for ${concept.canonicalName}.${tenant.note ? ` ${tenant.note}` : ''}`);

  return {
    status, term: text.trim(), concept, mappings, chosen, tenantTerm: tenant,
    requiresClarification: status === 'AMBIGUOUS',
    analysisPaths: pathsFor(concept, status),
    notes,
  };
}

function pathsFor(c: FinancialConcept, status: ConceptStatus): string[] {
  if (status === 'NOT_HELD') return c.mappings.filter((m) => m.basis === 'NOT_HELD').map((m) => m.note).filter(Boolean);
  switch (c.category) {
    case 'PROCESS': return ['its status for the period', 'what is outstanding'];
    case 'EVENT': return ['the journals behind a movement', 'postings that arrived after the period'];
    case 'DERIVED_MEASURE': return ['the components, each as a governed figure', 'the movement between two periods'];
    default: return ['the balance or period amount', 'the movement against the prior period', 'a breakdown by entity, project or vendor', 'the governed ledger lines behind it'];
  }
}

/** the compact shape a tool result carries — meaning and members, never an amount */
export function resolutionFacts(r: ConceptResolution) {
  return {
    term: r.term,
    concept: r.concept ? { id: r.concept.conceptId, name: r.concept.canonicalName, category: r.concept.category, definition: r.concept.definition } : null,
    status: r.status,
    korvynReads: r.chosen ? { mappingId: r.chosen.mappingId, as: r.chosen.label, accounts: r.chosen.members, basis: r.status === 'DEFAULTED' ? 'PROFESSIONAL_DEFAULT' : r.chosen.basis, note: r.chosen.note } : null,
    candidates: (r.chosen && r.status !== 'DEFAULTED' ? [] : r.mappings.filter((m) => m.mappingId !== r.chosen?.mappingId))
      .map((m) => ({ mappingId: m.mappingId, as: m.label, accounts: m.members, basis: m.basis, note: m.note })),
    relatedConcepts: r.concept ? [...r.concept.broader, ...r.concept.narrower, ...r.concept.related] : [],
    notes: r.notes,
    canShow: r.analysisPaths,
  };
}
