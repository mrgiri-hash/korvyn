import type { DimensionCode, DimensionValueId, AccountId } from './primitives.js';
import type { AccountType } from './account.js';

/**
 * Flexible segments. One mechanism serves cost code, project/job, department,
 * property/asset and anything added later.
 *
 * Tradeoff: a generic dimension registry rather than named fields on the line
 * (`projectId`, `costCodeId`, ...). Named fields typecheck more precisely, but
 * every new segment then becomes a schema migration plus a change to every
 * consumer — and this domain grows segments constantly. The registry keeps that
 * cost as configuration. Validation recovers most of the lost safety by
 * enforcing `requiredDimensions` per account.
 */

/** Well-known codes. Not exhaustive — the registry is open by design. */
export const STANDARD_DIMENSIONS = Object.freeze({
  COST_CODE: 'COST_CODE' as DimensionCode,
  PROJECT: 'PROJECT' as DimensionCode,
  DEPARTMENT: 'DEPARTMENT' as DimensionCode,
  PROPERTY: 'PROPERTY' as DimensionCode,
  ASSET: 'ASSET' as DimensionCode,
});

export interface DimensionDefinition {
  readonly code: DimensionCode;
  readonly name: string;

  /** Required on every posting, regardless of account. Rare; prefer per-account. */
  readonly requiredGlobally: boolean;

  /**
   * If present, only postings to these account types may carry this dimension.
   * Stops a project code being attached to an equity posting, which corrupts
   * project-level P&L reporting in ways that are painful to unwind.
   */
  readonly appliesToAccountTypes?: readonly AccountType[];

  /** If present, values form a hierarchy (e.g. property -> building -> hall). */
  readonly isHierarchical?: boolean;

  readonly isActive: boolean;
}

export interface DimensionValue {
  readonly id: DimensionValueId;
  readonly dimensionCode: DimensionCode;
  /** Natural key within the dimension, e.g. "SV-PH2". */
  readonly code: string;
  readonly name: string;
  readonly parentId?: DimensionValueId;
  readonly isActive: boolean;
}

/**
 * What a journal line actually carries: a sparse map of dimension -> value.
 * Absent key means "not dimensioned on that axis", which is legitimate for
 * most balance-sheet postings.
 */
export type DimensionAssignment = Readonly<Partial<Record<DimensionCode, DimensionValueId>>>;

export const dimensionsOn = (d: DimensionAssignment): DimensionCode[] =>
  Object.keys(d) as DimensionCode[];

export const hasDimension = (d: DimensionAssignment, c: DimensionCode): boolean =>
  d[c] !== undefined;

/** Convenience for the common per-account rule. */
export interface AccountDimensionRule {
  readonly accountId: AccountId;
  readonly required: readonly DimensionCode[];
}
