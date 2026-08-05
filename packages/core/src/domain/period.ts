import type { PeriodId, EntityId, IsoDate } from './primitives.js';

/**
 * Accounting period and its open/closed state.
 *
 * Three states rather than two, because "closed" means different things at
 * different points in a close and collapsing them loses a real control:
 *
 *   OPEN        - normal posting allowed
 *   SOFT_CLOSED - operational posting barred; adjusting entries still allowed
 *                 by users holding the right to make them. This is the state a
 *                 period sits in during review, and it is where most late
 *                 audit adjustments legitimately land.
 *   CLOSED      - hard close. Nothing posts. Reopening is an audited act.
 *
 * This scaffold enforces OPEN-only for ordinary postings and exposes the
 * adjusting-entry path as an explicit flag, so the permission question is
 * visible rather than implied.
 */

export type PeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'CLOSED';

export interface Period {
  readonly id: PeriodId;
  readonly fiscalYear: number;
  /** 1..12 for monthly, 1..4 for quarterly books. */
  readonly periodNumber: number;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly status: PeriodStatus;

  /**
   * Periods can close per entity — a shared-services entity often closes days
   * before an operating one. Absent means the period status applies group-wide.
   */
  readonly entityId?: EntityId;

  /** Set when status moved to CLOSED. Audit trail lives elsewhere. */
  readonly closedAt?: string;
  readonly closedBy?: string;
}

export const isOpen = (p: Period): boolean => p.status === 'OPEN';

export const acceptsPosting = (p: Period, isAdjusting = false): boolean =>
  p.status === 'OPEN' || (p.status === 'SOFT_CLOSED' && isAdjusting);

/** Inclusive on both ends. Dates are ISO calendar strings, so lexical compare is correct. */
export const dateWithinPeriod = (p: Period, d: IsoDate): boolean =>
  d >= p.startDate && d <= p.endDate;
