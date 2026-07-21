import {
  type Result,
  type CurrencyCode,
  type AccountId,
  type EntityId,
  type PeriodId,
  type Money,
  ok,
  err,
  formatMoney,
} from './primitives';
import { type Account, canPostTo, accountAllowsEntity } from './account';
import type { Entity } from './entity';
import { type Period, acceptsPosting, dateWithinPeriod } from './period';
import type { DimensionDefinition } from './dimension';
import type { JournalEntry, ValidatedJournalEntry } from './journal';

/**
 * The invariants. This is the only file that decides whether a posting is legal.
 *
 * Returns ALL failures rather than throwing on the first. A controller fixing a
 * rejected import needs the whole list; discovering problems one round-trip at a
 * time is how a 400-line import takes an afternoon.
 */

export type ValidationCode =
  | 'NO_LINES'
  | 'SINGLE_LINE'
  | 'UNBALANCED'
  | 'ZERO_AMOUNT_LINE'
  | 'PERIOD_NOT_FOUND'
  | 'PERIOD_NOT_ACCEPTING_POSTINGS'
  | 'POSTING_DATE_OUTSIDE_PERIOD'
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_NOT_POSTABLE'
  | 'ACCOUNT_NOT_ALLOWED_FOR_ENTITY'
  | 'ENTITY_NOT_FOUND'
  | 'ENTITY_INACTIVE'
  | 'MISSING_REQUIRED_DIMENSION'
  | 'DIMENSION_NOT_APPLICABLE'
  | 'DUPLICATE_LINE_NO';

export interface ValidationError {
  readonly code: ValidationCode;
  readonly message: string;
  /** Which line raised it, when line-scoped. */
  readonly lineNo?: number;
  /** Machine-readable extras for the caller to render. */
  readonly detail?: Readonly<Record<string, string>>;
}

/**
 * Builds the error object, OMITTING absent optional keys rather than setting
 * them to undefined. `exactOptionalPropertyTypes` is on in tsconfig, under
 * which `{ lineNo: undefined }` is not assignable to `{ lineNo?: number }` —
 * and the distinction is worth keeping, since "no line" and "line unknown"
 * should not serialise identically.
 */
const fail = (
  code: ValidationCode,
  message: string,
  lineNo?: number,
  detail?: Record<string, string>,
): ValidationError => ({
  code,
  message,
  ...(lineNo !== undefined ? { lineNo } : {}),
  ...(detail !== undefined ? { detail } : {}),
});

/**
 * Everything the validator needs to look up, expressed as an interface rather
 * than a repository or a database handle.
 *
 * This keeps the domain free of I/O: the caller decides whether these come from
 * Postgres, a cache or a test fixture. It also makes the rules trivially
 * unit-testable with plain object literals.
 */
export interface ValidationContext {
  account(id: AccountId): Account | undefined;
  entity(id: EntityId): Entity | undefined;
  period(id: PeriodId): Period | undefined;
  dimensionDefinition(code: string): DimensionDefinition | undefined;
}

/**
 * Sums each currency independently and requires every one to net to zero.
 *
 * Balancing the aggregate across currencies would be meaningless — 100 USD
 * debit against 100 EUR credit is not a balanced entry, it is an unrecorded FX
 * position. Multi-currency entries are permitted; each currency must stand on
 * its own.
 */
export function balanceByCurrency(entry: JournalEntry): Map<CurrencyCode, bigint> {
  const sums = new Map<CurrencyCode, bigint>();
  for (const line of entry.lines) {
    const cur = line.amount.currency;
    sums.set(cur, (sums.get(cur) ?? 0n) + line.amount.amountMinor);
  }
  return sums;
}

export const isBalanced = (entry: JournalEntry): boolean => {
  for (const total of balanceByCurrency(entry).values()) {
    if (total !== 0n) return false;
  }
  return true;
};

export function validateJournalEntry(
  entry: JournalEntry,
  ctx: ValidationContext,
): Result<ValidatedJournalEntry, ValidationError[]> {
  const errors: ValidationError[] = [];

  // --- structural ---------------------------------------------------------
  if (entry.lines.length === 0) {
    errors.push(fail('NO_LINES', 'A journal entry must have at least one line'));
  } else if (entry.lines.length === 1) {
    errors.push(fail('SINGLE_LINE', 'Double-entry requires at least two lines'));
  }

  const seenLineNos = new Set<number>();
  for (const line of entry.lines) {
    if (seenLineNos.has(line.lineNo)) {
      errors.push(fail('DUPLICATE_LINE_NO', `Duplicate line number ${line.lineNo}`, line.lineNo));
    }
    seenLineNos.add(line.lineNo);
  }

  // --- balance ------------------------------------------------------------
  // Checked even when other errors exist: an unbalanced entry is the single
  // most important thing to report, and suppressing it behind a lookup failure
  // hides the real problem.
  for (const [currency, total] of balanceByCurrency(entry)) {
    if (total !== 0n) {
      const residual: Money = { amountMinor: total, currency, scale: 2 };
      errors.push(
        fail(
          'UNBALANCED',
          `Entry does not balance in ${currency}: residual ${formatMoney(residual)}`,
          undefined,
          { currency: currency as string, residualMinor: total.toString() },
        ),
      );
    }
  }

  // --- period -------------------------------------------------------------
  const period = ctx.period(entry.periodId);
  if (!period) {
    errors.push(
      fail('PERIOD_NOT_FOUND', `Period ${entry.periodId} does not exist`, undefined, {
        periodId: entry.periodId as string,
      }),
    );
  } else {
    if (!acceptsPosting(period, entry.isAdjusting === true)) {
      errors.push(
        fail(
          'PERIOD_NOT_ACCEPTING_POSTINGS',
          period.status === 'SOFT_CLOSED'
            ? `Period ${period.fiscalYear}-${period.periodNumber} is soft closed; only adjusting entries may post`
            : `Period ${period.fiscalYear}-${period.periodNumber} is closed`,
          undefined,
          { status: period.status },
        ),
      );
    }
    if (!dateWithinPeriod(period, entry.postingDate)) {
      errors.push(
        fail(
          'POSTING_DATE_OUTSIDE_PERIOD',
          `Posting date ${entry.postingDate} is outside ${period.startDate}..${period.endDate}`,
        ),
      );
    }
  }

  // --- per line -----------------------------------------------------------
  for (const line of entry.lines) {
    if (line.amount.amountMinor === 0n) {
      errors.push(fail('ZERO_AMOUNT_LINE', 'Line amount must not be zero', line.lineNo));
    }

    const account = ctx.account(line.accountId);
    if (!account) {
      errors.push(
        fail('ACCOUNT_NOT_FOUND', `Account ${line.accountId} does not exist`, line.lineNo, {
          accountId: line.accountId as string,
        }),
      );
    } else {
      if (!canPostTo(account)) {
        errors.push(
          fail(
            'ACCOUNT_NOT_POSTABLE',
            account.isActive
              ? `Account ${account.code} is a summary account and cannot be posted to`
              : `Account ${account.code} is inactive`,
            line.lineNo,
          ),
        );
      }
      if (!accountAllowsEntity(account, line.entityId)) {
        errors.push(
          fail(
            'ACCOUNT_NOT_ALLOWED_FOR_ENTITY',
            `Account ${account.code} is not in scope for entity ${line.entityId}`,
            line.lineNo,
          ),
        );
      }
      for (const required of account.requiredDimensions ?? []) {
        if (line.dimensions[required] === undefined) {
          errors.push(
            fail(
              'MISSING_REQUIRED_DIMENSION',
              `Account ${account.code} requires dimension ${required}`,
              line.lineNo,
              { dimension: required as string },
            ),
          );
        }
      }
      // A dimension carried on a line must be applicable to the account's type.
      for (const code of Object.keys(line.dimensions)) {
        const def = ctx.dimensionDefinition(code);
        if (def?.appliesToAccountTypes && !def.appliesToAccountTypes.includes(account.type)) {
          errors.push(
            fail(
              'DIMENSION_NOT_APPLICABLE',
              `Dimension ${code} does not apply to ${account.type} accounts`,
              line.lineNo,
              { dimension: code },
            ),
          );
        }
      }
    }

    const lineEntity = ctx.entity(line.entityId);
    if (!lineEntity) {
      errors.push(
        fail('ENTITY_NOT_FOUND', `Entity ${line.entityId} does not exist`, line.lineNo, {
          entityId: line.entityId as string,
        }),
      );
    } else if (!lineEntity.isActive) {
      errors.push(fail('ENTITY_INACTIVE', `Entity ${lineEntity.code} is inactive`, line.lineNo));
    }
  }

  // --- header entity ------------------------------------------------------
  const headerEntity = ctx.entity(entry.entityId);
  if (!headerEntity) {
    errors.push(
      fail('ENTITY_NOT_FOUND', `Owning entity ${entry.entityId} does not exist`, undefined, {
        entityId: entry.entityId as string,
      }),
    );
  }

  if (errors.length > 0) return err(errors);
  return ok(entry as ValidatedJournalEntry);
}
