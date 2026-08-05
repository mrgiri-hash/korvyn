/**
 * Canonical primitives. Depends on NOTHING — not on adapters, not on any
 * external system, not even on the rest of the domain.
 */

// ---------------------------------------------------------------------------
// Branded identifiers
//
// Tradeoff: these are compile-time-only brands. They cost nothing at runtime
// (an AccountId *is* a string) but stop you passing an EntityId where an
// AccountId belongs — a mistake that is otherwise invisible until it corrupts
// a posting. The cast helpers are the single sanctioned way to mint one.
// ---------------------------------------------------------------------------
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type AccountId = Brand<string, 'AccountId'>;
export type EntityId = Brand<string, 'EntityId'>;
export type PeriodId = Brand<string, 'PeriodId'>;
export type JournalEntryId = Brand<string, 'JournalEntryId'>;
export type DimensionCode = Brand<string, 'DimensionCode'>;
export type DimensionValueId = Brand<string, 'DimensionValueId'>;
export type CurrencyCode = Brand<string, 'CurrencyCode'>;

// The capital-project spine: the project accumulates cost, then becomes one or
// more assets at placed-in-service. Both are first-class identities, so both are
// branded — an AssetId is not a CapitalProjectId even though both are strings.
export type CapitalProjectId = Brand<string, 'CapitalProjectId'>;
export type AssetId = Brand<string, 'AssetId'>;

export const accountId = (v: string): AccountId => v as AccountId;
export const entityId = (v: string): EntityId => v as EntityId;
export const periodId = (v: string): PeriodId => v as PeriodId;
export const journalEntryId = (v: string): JournalEntryId => v as JournalEntryId;
export const dimensionCode = (v: string): DimensionCode => v as DimensionCode;
export const dimensionValueId = (v: string): DimensionValueId => v as DimensionValueId;
export const capitalProjectId = (v: string): CapitalProjectId => v as CapitalProjectId;
export const assetId = (v: string): AssetId => v as AssetId;

/** ISO-4217, e.g. "USD". Uppercased on construction; not otherwise validated here. */
export const currencyCode = (v: string): CurrencyCode => v.toUpperCase() as CurrencyCode;

// ---------------------------------------------------------------------------
// Money
//
// Stored as an integer count of MINOR UNITS (cents) in a bigint, never a float.
//
// Two deliberate choices:
//  1. Never `number`. 0.1 + 0.2 !== 0.3 in binary floating point, and an
//     accounting ledger that cannot sum to exactly zero cannot enforce
//     double-entry at all.
//  2. `bigint` rather than a safe-integer `number`. A multi-billion-dollar
//     REIT consolidation in minor units passes 2^53 sooner than people expect
//     (~$90 trillion in cents is fine, but intermediate FX math and
//     sub-cent-scale currencies erode the headroom). bigint removes the
//     question entirely.
//
// Cost: bigint does not survive JSON.stringify. Serialize via `moneyToJSON`.
// ---------------------------------------------------------------------------
export interface Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
  /** Minor units per major unit exponent: 2 for USD (cents), 0 for JPY. */
  readonly scale: number;
}

export const money = (amountMinor: bigint, currency: CurrencyCode, scale = 2): Money => ({
  amountMinor,
  currency,
  scale,
});

export const zeroMoney = (currency: CurrencyCode, scale = 2): Money =>
  money(0n, currency, scale);

export const isZero = (m: Money): boolean => m.amountMinor === 0n;
export const negate = (m: Money): Money => money(-m.amountMinor, m.currency, m.scale);

export class CurrencyMismatchError extends Error {
  constructor(readonly left: CurrencyCode, readonly right: CurrencyCode) {
    super(`Cannot combine ${left} and ${right} without an explicit FX translation`);
    this.name = 'CurrencyMismatchError';
  }
}

/**
 * Adds two amounts of the SAME currency. Cross-currency addition is a domain
 * error, not something to paper over: translating requires a rate, a rate type
 * (spot/average/historical) and a date, all of which belong to an explicit FX
 * step rather than an implicit one buried in an operator.
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return money(a.amountMinor + b.amountMinor, a.currency, Math.max(a.scale, b.scale));
}

/** Human-readable, for logs and errors. Not a formatting/localisation layer. */
export function formatMoney(m: Money): string {
  const neg = m.amountMinor < 0n;
  const abs = neg ? -m.amountMinor : m.amountMinor;
  const s = abs.toString().padStart(m.scale + 1, '0');
  const major = s.slice(0, s.length - m.scale) || '0';
  const minor = m.scale > 0 ? '.' + s.slice(s.length - m.scale) : '';
  return `${neg ? '-' : ''}${major}${minor} ${m.currency}`;
}

export const moneyToJSON = (m: Money) => ({
  amountMinor: m.amountMinor.toString(),
  currency: m.currency as string,
  scale: m.scale,
});

// ---------------------------------------------------------------------------
// Result
//
// Validation returns Result rather than throwing, because a posting can fail
// several invariants at once and a controller needs to see all of them, not
// just whichever threw first.
// ---------------------------------------------------------------------------
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;

/** ISO-8601 calendar date, no time, no zone: "2026-06-30". */
export type IsoDate = Brand<string, 'IsoDate'>;
export const isoDate = (v: string): IsoDate => v as IsoDate;
