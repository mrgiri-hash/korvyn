import type {
  JournalEntryId,
  AccountId,
  EntityId,
  PeriodId,
  Money,
  IsoDate,
} from './primitives';
import type { DimensionAssignment } from './dimension';

/**
 * Journal entry and lines. The double-entry core.
 *
 * SIGN CONVENTION — the most consequential choice in this file.
 *
 * A line carries one SIGNED amount: positive is a debit, negative is a credit.
 * The alternative is separate `debit` and `credit` fields.
 *
 * Signed wins here because it makes the balance invariant a single sum to zero,
 * and because the two-field form admits illegal states the type system cannot
 * catch: both populated, both zero, both negative. Every one of those has to be
 * validated away at runtime anyway, so the two-field form buys readability at
 * the cost of a wider bug surface.
 *
 * The cost is that `debit`/`credit` presentation becomes a view concern.
 * `debitAmount`/`creditAmount` below exist for exactly that.
 */

export interface JournalLine {
  /** Stable within the entry; used to reference a specific line in errors. */
  readonly lineNo: number;
  readonly accountId: AccountId;

  /**
   * Present on the LINE, not only the entry. Intercompany entries legitimately
   * touch several entities in one document, and forcing one entity per entry
   * makes due-to/due-from postings impossible to represent faithfully.
   */
  readonly entityId: EntityId;

  /** Positive = debit, negative = credit. Never zero (rejected in validation). */
  readonly amount: Money;

  readonly memo?: string;
  readonly dimensions: DimensionAssignment;
}

export type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

/**
 * Provenance. Records WHERE an entry came from without importing any of that
 * system's vocabulary — `externalId` is an opaque string to the domain.
 *
 * This is the only place the core acknowledges that external systems exist, and
 * it does so as inert metadata: no core logic branches on `connectorId`.
 */
export interface JournalSource {
  readonly kind: 'MANUAL' | 'IMPORTED' | 'SYSTEM_GENERATED';
  /** Which connector produced it, when kind is IMPORTED. Opaque identifier. */
  readonly connectorId?: string;
  /** The record's id in that system. Opaque. Used for idempotency, never parsed. */
  readonly externalId?: string;
  readonly importedAt?: string;
}

export interface JournalEntry {
  readonly id: JournalEntryId;
  /** Human-facing document number, e.g. "JE-2026-04412". */
  readonly entryNo: string;
  readonly periodId: PeriodId;

  /** Owning entity of the document. Lines may still hit other entities. */
  readonly entityId: EntityId;

  readonly postingDate: IsoDate;
  readonly description: string;
  readonly lines: readonly JournalLine[];
  readonly status: JournalStatus;
  readonly source: JournalSource;

  /** Set when this entry adjusts a soft-closed period. Drives the permission check. */
  readonly isAdjusting?: boolean;

  /** Points at the entry this one reverses, if any. */
  readonly reversesEntryId?: JournalEntryId;
}

// ---------------------------------------------------------------------------
// Presentation helpers — view concerns, kept out of the storage shape
// ---------------------------------------------------------------------------

export const isDebit = (l: JournalLine): boolean => l.amount.amountMinor > 0n;
export const isCredit = (l: JournalLine): boolean => l.amount.amountMinor < 0n;

export const debitAmount = (l: JournalLine): bigint =>
  l.amount.amountMinor > 0n ? l.amount.amountMinor : 0n;

export const creditAmount = (l: JournalLine): bigint =>
  l.amount.amountMinor < 0n ? -l.amount.amountMinor : 0n;

/**
 * A JournalEntry that has passed `validateJournalEntry`.
 *
 * The brand is not decorative. A function that persists a posting can demand a
 * `ValidatedJournalEntry`, and then it is a compile error to hand it something
 * unchecked. The only way to obtain one is through the validator.
 */
declare const validated: unique symbol;
export type ValidatedJournalEntry = JournalEntry & { readonly [validated]: true };
