/**
 * An enterprise-grade, multinational GL fixture — expressed entirely in the
 * canonical model, and PROVABLY valid: every entry it generates passes
 * `validateJournalEntry`, and every entity's book nets to zero per currency.
 *
 * This is sample data, not part of the shipped model, so it lives under
 * `fixtures/` and is not re-exported from the domain barrel. It depends on the
 * domain (a consumer, like an adapter); the domain never depends on it.
 *
 * "Enterprise-grade" here means something checkable, not just large:
 *   - 6 legal entities across 4 functional currencies (USD/GBP/EUR/SGD)
 *   - a hierarchical chart of ~90 accounts, contra accounts, entity scoping
 *   - intercompany due-to/due-from, modelled as a balanced entry in EACH
 *     entity's own currency (the FX between them is a group-level concern, not
 *     an unbalanced single entry)
 *   - dimensioned postings (project on CIP, cost centre on opex, property on
 *     revenue), honouring the account's required-dimension rules
 *   - deterministic: a seed in, the same book out, so it is reproducible and
 *     testable
 *
 * Periods are modelled OPEN because these are postable entries — a historical
 * entry in a since-closed period would fail the pre-posting gate, which is a
 * statement about WHEN it may post, not about whether it is well-formed.
 */
import {
  type Account,
  type Entity,
  type Period,
  type JournalEntry,
  type JournalLine,
  type JournalSource,
  type DimensionDefinition,
  type DimensionValue,
  type DimensionAssignment,
  type AccountType,
  type StatementSection,
  type CurrencyCode,
  type DimensionCode,
  type DimensionValueId,
  type ValidationContext,
  accountId,
  entityId,
  periodId,
  journalEntryId,
  dimensionCode,
  dimensionValueId,
  currencyCode,
  isoDate,
  money,
} from '../domain/index.js';

// ---------------------------------------------------------------------------
// Deterministic RNG — mulberry32. Same seed, same book.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: () => number, arr: readonly T[]): T => {
  const x = arr[Math.floor(rng() * arr.length)];
  if (x === undefined) throw new Error('pick from empty array');
  return x;
};

/** A whole-dollar-ish amount in minor units, in [minMajor, maxMajor]. */
const amt = (rng: () => number, minMajor: number, maxMajor: number): bigint => {
  const major = minMajor + rng() * (maxMajor - minMajor);
  return BigInt(Math.round(major * 100));
};

// ---------------------------------------------------------------------------
// Currencies & entities
// ---------------------------------------------------------------------------
const USD = currencyCode('USD');
const GBP = currencyCode('GBP');
const EUR = currencyCode('EUR');
const SGD = currencyCode('SGD');

const REIT = entityId('MGP-REIT');
const TRS = entityId('MGP-TRS');
const MDH = entityId('MDH');
const UK = entityId('MER-UK');
const DE = entityId('MER-DE');
const SG = entityId('MER-SG');

const ENTITIES: readonly Entity[] = [
  { id: REIT, code: 'MGP-REIT', name: 'Meridian Global Portfolio REIT', kind: 'REIT', functionalCurrency: USD, consolidationMethod: 'FULL', countryCode: 'US', isActive: true },
  { id: TRS, code: 'MGP-TRS', name: 'Meridian TRS Inc.', kind: 'TRS', functionalCurrency: USD, parentId: REIT, ownershipPct: 1, consolidationMethod: 'FULL', countryCode: 'US', isActive: true },
  { id: MDH, code: 'MDH', name: 'Meridian DC Holdco LLC', kind: 'HOLDING', functionalCurrency: USD, parentId: REIT, ownershipPct: 1, consolidationMethod: 'FULL', countryCode: 'US', isActive: true },
  { id: UK, code: 'MER-UK', name: 'Meridian UK OpCo Ltd', kind: 'OPERATING', functionalCurrency: GBP, parentId: MDH, ownershipPct: 1, consolidationMethod: 'FULL', countryCode: 'GB', isActive: true },
  { id: DE, code: 'MER-DE', name: 'Meridian Deutschland GmbH', kind: 'OPERATING', functionalCurrency: EUR, parentId: MDH, ownershipPct: 1, consolidationMethod: 'FULL', countryCode: 'DE', isActive: true },
  { id: SG, code: 'MER-SG', name: 'Meridian APAC Pte Ltd', kind: 'OPERATING', functionalCurrency: SGD, parentId: MDH, ownershipPct: 1, consolidationMethod: 'FULL', countryCode: 'SG', isActive: true },
];

const fx: Readonly<Record<string, CurrencyCode>> = {
  'MGP-REIT': USD, 'MGP-TRS': USD, 'MDH': USD, 'MER-UK': GBP, 'MER-DE': EUR, 'MER-SG': SGD,
};

/** Entities that run data-centre operations (revenue, opex, capital, depreciation). */
const OPERATING: readonly EntityId[] = [MDH, UK, DE, SG];
type EntityId = typeof REIT;

/** Provenance: which ERP each entity's data arrives from. Illustrative, opaque downstream. */
const ERP: Readonly<Record<string, string>> = {
  'MGP-REIT': 'oracle', 'MGP-TRS': 'oracle', 'MDH': 'sap', 'MER-UK': 'netsuite', 'MER-DE': 'sap', 'MER-SG': 'jde',
};

// ---------------------------------------------------------------------------
// Chart of accounts — one shared, hierarchical group chart
// ---------------------------------------------------------------------------
interface CoaRow {
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly post: boolean;
  readonly parent?: string;
  readonly contra?: boolean;
  readonly reqProject?: boolean;
  readonly reitOnly?: boolean;
}

const A: AccountType = 'ASSET';
const L: AccountType = 'LIABILITY';
const EQ: AccountType = 'EQUITY';
const R: AccountType = 'REVENUE';
const EX: AccountType = 'EXPENSE';

const COA_ROWS: readonly CoaRow[] = [
  // assets
  { code: '10000', name: 'Cash & cash equivalents', type: A, post: false },
  { code: '10100', name: 'Operating cash', type: A, post: true, parent: '10000' },
  { code: '10200', name: 'Restricted cash', type: A, post: true, parent: '10000' },
  { code: '10300', name: 'Money-market investments', type: A, post: true, parent: '10000' },
  { code: '11000', name: 'Accounts receivable', type: A, post: false },
  { code: '11100', name: 'Trade receivables', type: A, post: true, parent: '11000' },
  { code: '11200', name: 'Unbilled revenue', type: A, post: true, parent: '11000' },
  { code: '11900', name: 'Allowance for doubtful accounts', type: A, post: true, parent: '11000', contra: true },
  { code: '12000', name: 'Prepaid & other current assets', type: A, post: false },
  { code: '12100', name: 'Prepaid insurance', type: A, post: true, parent: '12000' },
  { code: '12200', name: 'Prepaid property tax', type: A, post: true, parent: '12000' },
  { code: '13000', name: 'Intercompany receivable', type: A, post: false },
  { code: '13100', name: 'Due from affiliates', type: A, post: true, parent: '13000' },
  { code: '15000', name: 'Construction in progress', type: A, post: false },
  { code: '15100', name: 'CIP — buildings', type: A, post: true, parent: '15000', reqProject: true },
  { code: '15200', name: 'CIP — equipment', type: A, post: true, parent: '15000', reqProject: true },
  { code: '15300', name: 'CIP — capitalized interest', type: A, post: true, parent: '15000', reqProject: true },
  { code: '15400', name: 'CIP — capitalized labor', type: A, post: true, parent: '15000', reqProject: true },
  { code: '16000', name: 'Property, plant & equipment', type: A, post: false },
  { code: '16100', name: 'Land', type: A, post: true, parent: '16000' },
  { code: '16200', name: 'Buildings & improvements', type: A, post: true, parent: '16000' },
  { code: '16300', name: 'Data-center equipment', type: A, post: true, parent: '16000' },
  { code: '16400', name: 'Mechanical & electrical', type: A, post: true, parent: '16000' },
  { code: '16500', name: 'IT infrastructure', type: A, post: true, parent: '16000' },
  { code: '17000', name: 'Accumulated depreciation', type: A, post: false },
  { code: '17200', name: 'Accum. deprn — buildings', type: A, post: true, parent: '17000', contra: true },
  { code: '17300', name: 'Accum. deprn — equipment', type: A, post: true, parent: '17000', contra: true },
  { code: '17400', name: 'Accum. deprn — M&E', type: A, post: true, parent: '17000', contra: true },
  { code: '17500', name: 'Accum. deprn — IT', type: A, post: true, parent: '17000', contra: true },
  { code: '18000', name: 'Intangibles & goodwill', type: A, post: false },
  { code: '18100', name: 'Goodwill', type: A, post: true, parent: '18000' },
  { code: '18200', name: 'Customer relationships', type: A, post: true, parent: '18000' },
  { code: '19000', name: 'Investments', type: A, post: false },
  { code: '19100', name: 'Equity-method investments', type: A, post: true, parent: '19000' },
  // liabilities
  { code: '20000', name: 'Accounts payable', type: L, post: false },
  { code: '20100', name: 'Trade payables', type: L, post: true, parent: '20000' },
  { code: '21000', name: 'Accrued liabilities', type: L, post: false },
  { code: '21100', name: 'Accrued expenses', type: L, post: true, parent: '21000' },
  { code: '21200', name: 'Accrued interest', type: L, post: true, parent: '21000' },
  { code: '21300', name: 'Accrued payroll', type: L, post: true, parent: '21000' },
  { code: '22000', name: 'Retainage payable', type: L, post: true },
  { code: '23000', name: 'Intercompany payable', type: L, post: false },
  { code: '23100', name: 'Due to affiliates', type: L, post: true, parent: '23000' },
  { code: '24000', name: 'Deferred revenue', type: L, post: true },
  { code: '25000', name: 'Debt', type: L, post: false },
  { code: '25100', name: 'Revolving credit facility', type: L, post: true, parent: '25000' },
  { code: '25200', name: 'Term loan', type: L, post: true, parent: '25000' },
  { code: '25300', name: 'Senior notes', type: L, post: true, parent: '25000' },
  { code: '26000', name: 'Deferred tax liability', type: L, post: true },
  // equity
  { code: '30000', name: 'Equity', type: EQ, post: false },
  { code: '30100', name: 'Common stock', type: EQ, post: true, parent: '30000', reitOnly: true },
  { code: '30200', name: 'Additional paid-in capital', type: EQ, post: true, parent: '30000' },
  { code: '30300', name: 'Retained earnings', type: EQ, post: true, parent: '30000' },
  { code: '30400', name: 'Cumulative translation adjustment', type: EQ, post: true, parent: '30000' },
  // revenue
  { code: '40000', name: 'Revenue', type: R, post: false },
  { code: '40100', name: 'Colocation revenue', type: R, post: true, parent: '40000' },
  { code: '40200', name: 'Interconnection revenue', type: R, post: true, parent: '40000' },
  { code: '40300', name: 'Power reimbursement revenue', type: R, post: true, parent: '40000' },
  { code: '40400', name: 'Managed-services revenue', type: R, post: true, parent: '40000' },
  // cost of operations
  { code: '50000', name: 'Cost of operations', type: EX, post: false },
  { code: '50100', name: 'Power & cooling', type: EX, post: true, parent: '50000' },
  { code: '50200', name: 'Site operations & maintenance', type: EX, post: true, parent: '50000' },
  { code: '50300', name: 'Network & bandwidth', type: EX, post: true, parent: '50000' },
  // operating expenses
  { code: '60000', name: 'Operating expenses', type: EX, post: false },
  { code: '60100', name: 'Selling & marketing', type: EX, post: true, parent: '60000' },
  { code: '60200', name: 'General & administrative', type: EX, post: true, parent: '60000' },
  { code: '60300', name: 'Professional fees', type: EX, post: true, parent: '60000' },
  { code: '60400', name: 'Property taxes & insurance', type: EX, post: true, parent: '60000' },
  // d&a and other
  { code: '65000', name: 'Depreciation & amortization', type: EX, post: false },
  { code: '65100', name: 'Depreciation expense', type: EX, post: true, parent: '65000' },
  { code: '70000', name: 'Other income & expense', type: EX, post: false },
  { code: '70100', name: 'Interest expense', type: EX, post: true, parent: '70000' },
  { code: '70300', name: 'Foreign-exchange gain/loss', type: EX, post: true, parent: '70000' },
];

function buildAccounts(): Account[] {
  return COA_ROWS.map((r): Account => {
    const base = {
      id: accountId(r.code),
      code: r.code,
      name: r.name,
      type: r.type,
      section: (r.type === 'REVENUE' || r.type === 'EXPENSE'
        ? 'INCOME_STATEMENT'
        : r.type === 'EQUITY'
          ? 'EQUITY'
          : 'BALANCE_SHEET') as StatementSection,
      isPostable: r.post,
      isActive: true,
    };
    return {
      ...base,
      ...(r.parent ? { parentId: accountId(r.parent) } : {}),
      ...(r.contra ? { isContra: true } : {}),
      ...(r.reqProject ? { requiredDimensions: [dimensionCode('PROJECT')] } : {}),
      ...(r.reitOnly ? { entityScope: [REIT] } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------
const DIM_PROJECT = dimensionCode('PROJECT');
const DIM_CC = dimensionCode('COST_CENTER');
const DIM_PROPERTY = dimensionCode('PROPERTY');

const DIMENSIONS: readonly DimensionDefinition[] = [
  { code: DIM_PROJECT, name: 'Project', requiredGlobally: false, appliesToAccountTypes: ['ASSET', 'EXPENSE'], isActive: true },
  { code: DIM_CC, name: 'Cost centre', requiredGlobally: false, appliesToAccountTypes: ['EXPENSE', 'REVENUE'], isActive: true },
  { code: DIM_PROPERTY, name: 'Property', requiredGlobally: false, appliesToAccountTypes: ['ASSET', 'REVENUE', 'EXPENSE'], isActive: true },
];

const PROJECTS: Readonly<Record<string, readonly string[]>> = {
  MDH: ['SV-PH2', 'ASH-DC4'],
  'MER-UK': ['LON-DC1'],
  'MER-DE': ['FRA-DC1'],
  'MER-SG': ['SG-DC1'],
};
const PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  MDH: ['SILICON-VALLEY', 'ASHBURN'],
  'MER-UK': ['LONDON-SLOUGH'],
  'MER-DE': ['FRANKFURT'],
  'MER-SG': ['SINGAPORE-JW'],
};
const COST_CENTERS: readonly string[] = ['CC-OPS', 'CC-FAC', 'CC-CORP', 'CC-SALES'];

function buildDimensionValues(): DimensionValue[] {
  const out: DimensionValue[] = [];
  for (const list of Object.values(PROJECTS)) {
    for (const code of list) out.push({ id: dimensionValueId(code), dimensionCode: DIM_PROJECT, code, name: code, isActive: true });
  }
  for (const list of Object.values(PROPERTIES)) {
    for (const code of list) out.push({ id: dimensionValueId(code), dimensionCode: DIM_PROPERTY, code, name: code, isActive: true });
  }
  for (const code of COST_CENTERS) out.push({ id: dimensionValueId(code), dimensionCode: DIM_CC, code, name: code, isActive: true });
  return out;
}

// ---------------------------------------------------------------------------
// Periods — FY2026, six months, all OPEN (see header note)
// ---------------------------------------------------------------------------
const MONTHS: readonly { readonly n: number; readonly id: string; readonly start: string; readonly end: string }[] = [
  { n: 1, id: '2026-01', start: '2026-01-01', end: '2026-01-31' },
  { n: 2, id: '2026-02', start: '2026-02-01', end: '2026-02-28' },
  { n: 3, id: '2026-03', start: '2026-03-01', end: '2026-03-31' },
  { n: 4, id: '2026-04', start: '2026-04-01', end: '2026-04-30' },
  { n: 5, id: '2026-05', start: '2026-05-01', end: '2026-05-31' },
  { n: 6, id: '2026-06', start: '2026-06-01', end: '2026-06-30' },
];

function buildPeriods(): Period[] {
  return MONTHS.map((m) => ({
    id: periodId(m.id),
    fiscalYear: 2026,
    periodNumber: m.n,
    startDate: isoDate(m.start),
    endDate: isoDate(m.end),
    status: 'OPEN' as const,
  }));
}

// ---------------------------------------------------------------------------
// The generated book
// ---------------------------------------------------------------------------
export interface EnterpriseGL {
  readonly entities: readonly Entity[];
  readonly accounts: readonly Account[];
  readonly periods: readonly Period[];
  readonly dimensions: readonly DimensionDefinition[];
  readonly dimensionValues: readonly DimensionValue[];
  readonly entries: readonly JournalEntry[];
}

export interface BuildOptions {
  readonly seed?: number;
  /** Individual revenue transactions per operating entity per month. */
  readonly invoicesPerMonth?: number;
}

export function buildEnterpriseGL(opts: BuildOptions = {}): EnterpriseGL {
  const rng = mulberry32(opts.seed ?? 42);
  const invoicesPerMonth = opts.invoicesPerMonth ?? 10;

  const entries: JournalEntry[] = [];
  let seq = 0;

  const src = (ent: EntityId): JournalSource => ({
    kind: 'IMPORTED',
    connectorId: ERP[ent as string] ?? 'unknown',
    externalId: `${ERP[ent as string]}-${(seq + 1).toString().padStart(6, '0')}`,
  });

  const post = (
    ent: EntityId,
    m: (typeof MONTHS)[number],
    day: number,
    description: string,
    rows: readonly { readonly acct: string; readonly minor: bigint; readonly dims?: DimensionAssignment }[],
  ): void => {
    seq += 1;
    const cur = fx[ent as string] ?? USD;
    const lines: JournalLine[] = rows.map((row, i) => ({
      lineNo: i + 1,
      accountId: accountId(row.acct),
      entityId: ent,
      amount: money(row.minor, cur),
      dimensions: row.dims ?? {},
    }));
    const dd = String(Math.min(day, 28)).padStart(2, '0');
    entries.push({
      id: journalEntryId(`JE-${seq.toString().padStart(6, '0')}`),
      entryNo: `${m.id}-${seq.toString().padStart(6, '0')}`,
      periodId: periodId(m.id),
      entityId: ent,
      postingDate: isoDate(`${m.id}-${dd}`),
      description,
      lines,
      status: 'POSTED',
      source: src(ent),
    });
  };

  const dimAssign = (code: DimensionCode, value: string): DimensionAssignment => {
    const out: Record<string, DimensionValueId> = { [code as string]: dimensionValueId(value) };
    return out as unknown as DimensionAssignment;
  };
  const proj = (ent: EntityId): DimensionAssignment => dimAssign(DIM_PROJECT, pick(rng, PROJECTS[ent as string] ?? ['SV-PH2']));
  const prop = (ent: EntityId): DimensionAssignment => dimAssign(DIM_PROPERTY, pick(rng, PROPERTIES[ent as string] ?? ['SILICON-VALLEY']));
  const cc = (): DimensionAssignment => dimAssign(DIM_CC, pick(rng, COST_CENTERS));

  const REV = ['40100', '40200', '40300', '40400'];
  const OPEX = ['50100', '50200', '50300', '60100', '60200', '60300', '60400'];

  for (const m of MONTHS) {
    for (const ent of OPERATING) {
      // revenue — individual customer invoices, dimensioned by property
      for (let i = 0; i < invoicesPerMonth; i++) {
        const v = amt(rng, 40_000, 480_000);
        post(ent, m, 3 + i, 'Customer invoice — recurring services', [
          { acct: '11100', minor: v },
          { acct: pick(rng, REV), minor: -v, dims: prop(ent) },
        ]);
      }
      // cash collection against receivables
      const coll = amt(rng, 300_000, 900_000);
      post(ent, m, 20, 'Cash receipts — customer collections', [
        { acct: '10100', minor: coll },
        { acct: '11100', minor: -coll },
      ]);
      // operating expenses on account
      for (let i = 0; i < 4; i++) {
        const e = amt(rng, 25_000, 220_000);
        post(ent, m, 8 + i, 'Vendor bill — operating expense', [
          { acct: pick(rng, OPEX), minor: e, dims: cc() },
          { acct: '20100', minor: -e },
        ]);
      }
      // vendor payment run
      const pay = amt(rng, 200_000, 700_000);
      post(ent, m, 25, 'Accounts-payable disbursement', [
        { acct: '20100', minor: pay },
        { acct: '10100', minor: -pay },
      ]);
      // monthly depreciation
      const dep = amt(rng, 120_000, 600_000);
      post(ent, m, 28, 'Monthly depreciation', [
        { acct: '65100', minor: dep },
        { acct: pick(rng, ['17200', '17300', '17400', '17500']), minor: -dep },
      ]);
      // capital additions into CIP (requires a project)
      const cap = amt(rng, 300_000, 2_500_000);
      post(ent, m, 12, 'Capital expenditure — CIP addition', [
        { acct: pick(rng, ['15100', '15200', '15400']), minor: cap, dims: proj(ent) },
        { acct: '20100', minor: -cap },
      ]);
      // periodic CIP settlement to PP&E (about every third month)
      if (m.n % 3 === 0) {
        const settle = amt(rng, 1_000_000, 6_000_000);
        post(ent, m, 27, 'Placed in service — CIP settled to PP&E', [
          { acct: pick(rng, ['16200', '16300', '16400', '16500']), minor: settle },
          { acct: pick(rng, ['15100', '15200']), minor: -settle, dims: proj(ent) },
        ]);
      }
    }

    // corporate activity at the REIT and TRS, so every entity has a live book
    for (const corp of [REIT, TRS]) {
      const ga = amt(rng, 80_000, 300_000);
      post(corp, m, 10, 'Corporate general & administrative', [
        { acct: '60200', minor: ga, dims: cc() },
        { acct: '20100', minor: -ga },
      ]);
    }
    // the TRS earns taxable service revenue and accrues income tax
    const svc = amt(rng, 150_000, 500_000);
    post(TRS, m, 14, 'Taxable services revenue', [
      { acct: '11100', minor: svc },
      { acct: '40400', minor: -svc, dims: cc() },
    ]);
    const tax = amt(rng, 30_000, 120_000);
    post(TRS, m, 28, 'Income-tax accrual', [
      { acct: '60200', minor: tax, dims: cc() },
      { acct: '26000', minor: -tax },
    ]);

    // interest accrual on group debt (held at MDH)
    const int = amt(rng, 400_000, 900_000);
    post(MDH, m, 28, 'Interest accrual — group debt', [
      { acct: '70100', minor: int },
      { acct: '21200', minor: -int },
    ]);

    // ---- intercompany: MDH funds each foreign OpCo -------------------------
    // Recorded as a balanced entry in EACH entity's own currency.
    for (const foreign of [UK, DE, SG]) {
      const usdLeg = amt(rng, 500_000, 3_000_000);
      post(MDH, m, 15, `Intercompany funding to ${foreign as string}`, [
        { acct: '13100', minor: usdLeg },
        { acct: '10100', minor: -usdLeg },
      ]);
      const localLeg = amt(rng, 400_000, 2_600_000);
      post(foreign, m, 15, 'Intercompany funding from parent', [
        { acct: '10100', minor: localLeg },
        { acct: '23100', minor: -localLeg },
      ]);
    }

    // ---- intercompany: REIT charges MDH a management fee -------------------
    const feeUp = amt(rng, 250_000, 700_000);
    post(REIT, m, 26, 'Intercompany management fee — charge', [
      { acct: '13100', minor: feeUp },
      { acct: '40400', minor: -feeUp, dims: cc() },
    ]);
    post(MDH, m, 26, 'Intercompany management fee — expense', [
      { acct: '60300', minor: feeUp, dims: cc() },
      { acct: '23100', minor: -feeUp },
    ]);

    // ---- period-end FX gain/loss on the foreign OpCos ----------------------
    for (const foreign of [UK, DE, SG]) {
      const g = amt(rng, 10_000, 90_000);
      post(foreign, m, 28, 'Unrealised FX on monetary balances', [
        { acct: '10200', minor: g },
        { acct: '70300', minor: -g },
      ]);
    }
  }

  return {
    entities: ENTITIES,
    accounts: buildAccounts(),
    periods: buildPeriods(),
    dimensions: DIMENSIONS,
    dimensionValues: buildDimensionValues(),
    entries,
  };
}

// ---------------------------------------------------------------------------
// A validation context over the fixture — plain lookups, no I/O
// ---------------------------------------------------------------------------
export function contextFor(gl: EnterpriseGL): ValidationContext {
  const accounts = new Map(gl.accounts.map((a) => [a.id as string, a]));
  const entities = new Map(gl.entities.map((e) => [e.id as string, e]));
  const periods = new Map(gl.periods.map((p) => [p.id as string, p]));
  const dims = new Map(gl.dimensions.map((d) => [d.code as string, d]));
  return {
    account: (id) => accounts.get(id as string),
    entity: (id) => entities.get(id as string),
    period: (id) => periods.get(id as string),
    dimensionDefinition: (code) => dims.get(code),
  };
}

// ---------------------------------------------------------------------------
// Derivations for consumers — a trial balance, and the tie-out proof
// ---------------------------------------------------------------------------
export interface TrialBalanceRow {
  readonly entityId: string;
  readonly accountCode: string;
  readonly currency: string;
  readonly balanceMinor: bigint;
}

/** Signed balance (debit positive) per entity × account × currency, non-zero only. */
export function trialBalance(gl: EnterpriseGL): TrialBalanceRow[] {
  const acc = new Map<string, bigint>();
  for (const e of gl.entries) {
    for (const l of e.lines) {
      const key = `${l.entityId}|${l.accountId}|${l.amount.currency}`;
      acc.set(key, (acc.get(key) ?? 0n) + l.amount.amountMinor);
    }
  }
  const out: TrialBalanceRow[] = [];
  for (const [key, balanceMinor] of acc) {
    if (balanceMinor === 0n) continue;
    const [entityId2, accountId2, currency] = key.split('|') as [string, string, string];
    out.push({ entityId: entityId2, accountCode: accountId2, currency, balanceMinor });
  }
  return out;
}

/** Net movement per entity × currency. Every value must be zero — the book ties out. */
export function entityCurrencyResidual(gl: EnterpriseGL): Map<string, bigint> {
  const res = new Map<string, bigint>();
  for (const e of gl.entries) {
    for (const l of e.lines) {
      const key = `${l.entityId}|${l.amount.currency}`;
      res.set(key, (res.get(key) ?? 0n) + l.amount.amountMinor);
    }
  }
  return res;
}

/** Total posted lines, for a quick sense of scale. */
export const lineCount = (gl: EnterpriseGL): number =>
  gl.entries.reduce((n, e) => n + e.lines.length, 0);

// ---------------------------------------------------------------------------
// Serialisation — bigint does not survive JSON, so Money.amountMinor becomes a
// string. This is the build-time bridge to the single-file dashboard.
// ---------------------------------------------------------------------------
export function serializeEnterpriseGL(gl: EnterpriseGL): string {
  return JSON.stringify(gl, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}
