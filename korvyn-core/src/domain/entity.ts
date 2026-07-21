import type { EntityId, CurrencyCode } from './primitives';

/**
 * Legal / reporting entity. The unit of consolidation.
 *
 * Deliberately models the *structure*, not the consolidation engine. Ownership
 * percentage and method are recorded here because they are attributes of the
 * entity relationship; actually performing elimination and minority-interest
 * allocation is downstream work and is out of scope for this scaffold.
 */

export type EntityKind =
  | 'OPERATING'      // OpCo
  | 'HOLDING'        // HoldCo
  | 'FUND'
  | 'REIT'
  | 'TRS'            // Taxable REIT Subsidiary
  | 'JOINT_VENTURE'
  | 'ELIMINATION';   // pseudo-entity carrying consolidation eliminations

export type ConsolidationMethod =
  | 'FULL'
  | 'EQUITY'
  | 'PROPORTIONATE'
  | 'NONE';

export interface Entity {
  readonly id: EntityId;
  /** Natural key, e.g. "MDH" or "FLEET-OPCO". */
  readonly code: string;
  readonly name: string;
  readonly kind: EntityKind;

  /**
   * Functional currency under ASC 830. Reporting currency is a property of the
   * consolidation, not of the entity, so it is not stored here.
   */
  readonly functionalCurrency: CurrencyCode;

  /** Immediate parent in the ownership tree. Absent for the top of the group. */
  readonly parentId?: EntityId;

  /** Ownership held by the parent, 0..1. Absent implies wholly owned (1). */
  readonly ownershipPct?: number;

  readonly consolidationMethod: ConsolidationMethod;

  /** Jurisdiction of incorporation, ISO-3166 alpha-2. Drives statutory reporting. */
  readonly countryCode?: string;

  readonly isActive: boolean;
}

export const isConsolidated = (e: Entity): boolean => e.consolidationMethod !== 'NONE';
