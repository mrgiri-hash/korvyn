/**
 * Test fixtures. Plain object literals — no mocks, no database, no framework.
 *
 * That is possible because `ValidationContext` is an interface rather than a
 * repository, which is the whole reason it was written that way.
 *
 * Imports resolve to `dist/`, so the suite exercises the EMITTED artifact and
 * its `.d.ts` — the same thing a consumer gets. It therefore also proves the
 * ESM module graph resolves at runtime, which is exactly what the explicit
 * `.js` extensions exist to guarantee.
 */
import {
  accountId,
  entityId,
  periodId,
  journalEntryId,
  currencyCode,
  isoDate,
  money,
  type Account,
  type AccountType,
  type Entity,
  type Period,
  type PeriodStatus,
  type DimensionDefinition,
  type DimensionAssignment,
  type JournalEntry,
  type JournalLine,
  type ValidationContext,
  type DimensionCode,
} from '../dist/index.js';

export const USD = currencyCode('USD');
export const EUR = currencyCode('EUR');

export const ENTITY = entityId('MDH');
export const OTHER_ENTITY = entityId('FLEET');
export const PERIOD = periodId('2026-06');

export function account(
  code: string,
  type: AccountType,
  over: Partial<Account> = {},
): Account {
  return {
    id: accountId(code),
    code,
    name: `Account ${code}`,
    type,
    section: type === 'REVENUE' || type === 'EXPENSE' ? 'INCOME_STATEMENT' : 'BALANCE_SHEET',
    isPostable: true,
    isActive: true,
    ...over,
  };
}

export function entity(code: string, over: Partial<Entity> = {}): Entity {
  return {
    id: entityId(code),
    code,
    name: `Entity ${code}`,
    kind: 'OPERATING',
    functionalCurrency: USD,
    consolidationMethod: 'FULL',
    isActive: true,
    ...over,
  };
}

export function period(status: PeriodStatus = 'OPEN', over: Partial<Period> = {}): Period {
  return {
    id: PERIOD,
    fiscalYear: 2026,
    periodNumber: 6,
    startDate: isoDate('2026-06-01'),
    endDate: isoDate('2026-06-30'),
    status,
    ...over,
  };
}

/** Builds a context from the accounts/entities/periods a given test cares about. */
export function context(opts: {
  accounts?: readonly Account[];
  entities?: readonly Entity[];
  periods?: readonly Period[];
  dimensions?: readonly DimensionDefinition[];
} = {}): ValidationContext {
  const accounts = opts.accounts ?? [account('15000', 'ASSET'), account('20000', 'LIABILITY')];
  const entities = opts.entities ?? [entity('MDH'), entity('FLEET')];
  const periods = opts.periods ?? [period()];
  const dimensions = opts.dimensions ?? [];

  return {
    account: (id) => accounts.find((a) => a.id === id),
    entity: (id) => entities.find((e) => e.id === id),
    period: (id) => periods.find((p) => p.id === id),
    dimensionDefinition: (code) => dimensions.find((d) => (d.code as string) === code),
  };
}

export function line(
  lineNo: number,
  code: string,
  amountMinor: bigint,
  over: { entityId?: typeof ENTITY; currency?: typeof USD; dimensions?: DimensionAssignment } = {},
): JournalLine {
  return {
    lineNo,
    accountId: accountId(code),
    entityId: over.entityId ?? ENTITY,
    amount: money(amountMinor, over.currency ?? USD),
    dimensions: over.dimensions ?? {},
  };
}

export function entry(lines: readonly JournalLine[], over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: journalEntryId('JE-1'),
    entryNo: 'JE-2026-00001',
    periodId: PERIOD,
    entityId: ENTITY,
    postingDate: isoDate('2026-06-15'),
    description: 'Test entry',
    lines,
    status: 'DRAFT',
    source: { kind: 'MANUAL' },
    ...over,
  };
}

export const dim = (code: string, over: Partial<DimensionDefinition> = {}): DimensionDefinition => ({
  code: code as DimensionCode,
  name: code,
  requiredGlobally: false,
  isActive: true,
  ...over,
});

/** The codes raised by a validation result, sorted — order is not part of the contract. */
export function codesOf(r: { ok: boolean; error?: readonly { code: string }[] }): string[] {
  return r.ok ? [] : [...(r.error ?? [])].map((e) => e.code).sort();
}
