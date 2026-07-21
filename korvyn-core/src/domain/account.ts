import type { AccountId, EntityId, DimensionCode } from './primitives';

/**
 * Chart of accounts.
 *
 * Vocabulary here is GAAP's, not any vendor's. NetSuite calls these
 * "AcctType", Intacct calls them "account groups", Yardi has its own scheme —
 * none of that appears in this file. Translation is an adapter's job.
 */

export type AccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE';

export type NormalBalance = 'DEBIT' | 'CREDIT';

/**
 * Normal balance is a FUNCTION of account type under double-entry, so it is
 * derived rather than stored. Storing it invites the two to disagree, and a
 * liability account with a debit normal balance is not a configuration option,
 * it is a data-entry bug.
 */
export const NORMAL_BALANCE: Readonly<Record<AccountType, NormalBalance>> = Object.freeze({
  ASSET: 'DEBIT',
  EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
});

export const normalBalanceOf = (t: AccountType): NormalBalance => NORMAL_BALANCE[t];

/**
 * Where an account sits on the face of the statements. Kept separate from
 * AccountType because presentation regularly diverges from classification —
 * contra-asset accounts are ASSET type but present as a deduction, and REIT
 * reporting subtotals rarely match the raw type ordering.
 */
export type StatementSection =
  | 'BALANCE_SHEET'
  | 'INCOME_STATEMENT'
  | 'EQUITY'
  | 'CASH_FLOW_SUPPLEMENTAL';

export interface Account {
  readonly id: AccountId;
  /** Natural key within the chart, e.g. "15000". Unique per chart, not globally. */
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly section: StatementSection;

  /**
   * Summary/header accounts exist for rollup and must never receive a posting.
   * Enforced in validation — a real chart has far more non-postable nodes than
   * people expect, and posting to one silently breaks every rollup above it.
   */
  readonly isPostable: boolean;

  /** Inactive accounts remain for history but reject new postings. */
  readonly isActive: boolean;

  /** Parent in the rollup tree. Absent for roots. */
  readonly parentId?: AccountId;

  /**
   * If present, only these entities may post to this account. Empty/absent
   * means all entities. Multi-entity charts routinely share a spine while
   * restricting, say, REIT-level equity accounts to the REIT.
   */
  readonly entityScope?: readonly EntityId[];

  /**
   * Dimensions a line MUST carry when hitting this account. This is where
   * "every CIP posting needs a project" is expressed — a real control in
   * data-center and real-estate accounting, not a UI nicety.
   */
  readonly requiredDimensions?: readonly DimensionCode[];

  /** True for contra accounts (accumulated depreciation, allowance for doubtful accounts). */
  readonly isContra?: boolean;
}

export const canPostTo = (a: Account): boolean => a.isActive && a.isPostable;

export const accountAllowsEntity = (a: Account, e: EntityId): boolean =>
  !a.entityScope || a.entityScope.length === 0 || a.entityScope.includes(e);
