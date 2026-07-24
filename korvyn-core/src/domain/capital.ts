import {
  type CapitalProjectId,
  type AssetId,
  type EntityId,
  type JournalEntryId,
  type CurrencyCode,
  type Money,
  type IsoDate,
  type Result,
  money,
  ok,
  err,
} from './primitives.js';

/**
 * The capital-asset lifecycle — the "quote-to-depreciation" spine.
 *
 * ONE object moves through six stages, gaining detail at each:
 *
 *   DRAFT ─authorize→ AUTHORIZED ─commit→ COMMITTED ─spend→ INCURRING
 *         ─capitalize→ IN_CIP ─placeInService→ IN_SERVICE
 *
 * The whole product thesis lives in two of those transitions — capitalize and
 * placeInService — the ASC 360 / 835-20 judgment between a project-cost system
 * and the general ledger. Every other stage is a system of record Korvyn READS;
 * these two are the determination it OWNS and must defend.
 *
 * Three design choices carry that thesis into the type system:
 *
 *  1. The two determinations are BRANDED. A `CapitalProject` can only ever hold
 *     an `ApprovedCapitalization` / `ApprovedPlacement`, and the sole way to mint
 *     one is through the validator. Stamping an un-approved determination onto a
 *     project is a compile error — the same guarantee `ValidatedJournalEntry`
 *     gives a posting.
 *
 *  2. Figures DERIVE, they are not stored. CIP balance, capitalized total,
 *     authorization variance and depreciation are all functions of the costs and
 *     the determinations. Nothing is written twice, so nothing can disagree.
 *
 *  3. Placed-in-service TIES OUT. The cost carried into the fixed-asset register
 *     must equal the CIP balance being settled — checked in `approvePlacement`,
 *     in the same family as the reconciliation tie-outs the rest of Korvyn rests
 *     on. A settlement that does not balance is the defect this gate exists to
 *     stop.
 *
 * Deliberately out of scope (the Acquire-to-Retire tail): impairment (ASC
 * 360-10), useful-life reassessment, and disposal/retirement. Named here as
 * roadmap so the omission is a decision, not an oversight. Depreciation itself
 * is NOT a stored stage — it is a mechanical derivation off an in-service asset.
 */

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

export type CapitalStage =
  | 'DRAFT'        // proposed; no authorization yet
  | 'AUTHORIZED'   // AFE / appropriation approved — the baseline to defend against
  | 'COMMITTED'    // POs / contracts issued against it
  | 'INCURRING'    // cost landing
  | 'IN_CIP'       // capitalization determined; accumulating in construction-in-progress
  | 'IN_SERVICE';  // placed in service; CIP settled to asset(s); depreciating

/** Monotonic ordering. Stage is the furthest milestone reached and never regresses. */
const STAGE_ORDER: Readonly<Record<CapitalStage, number>> = Object.freeze({
  DRAFT: 0,
  AUTHORIZED: 1,
  COMMITTED: 2,
  INCURRING: 3,
  IN_CIP: 4,
  IN_SERVICE: 5,
});

// ---------------------------------------------------------------------------
// Provenance — the thread
//
// Every commitment and cost carries where it came from, WITHOUT importing any
// source system's vocabulary (`externalId` and `connectorId` are opaque, exactly
// as on `JournalSource`). `journalEntryId` is the link to the GL posting when one
// exists — that is the thread that lets a depreciation dollar be traced back to
// the AFE that authorized it.
// ---------------------------------------------------------------------------

export interface SourceRef {
  readonly kind: 'MANUAL' | 'IMPORTED' | 'SYSTEM_GENERATED';
  /** Which connector produced it, when IMPORTED. Opaque identifier. */
  readonly connectorId?: string;
  /** The record's id in that system. Opaque; used for idempotency, never parsed. */
  readonly externalId?: string;
  /** The GL posting this cost/commitment resolves to, when it has reached the ledger. */
  readonly journalEntryId?: JournalEntryId;
  readonly capturedAt?: string;
}

// ---------------------------------------------------------------------------
// Stage 1 — Authorize
// ---------------------------------------------------------------------------

/**
 * The AFE / capital appropriation. The baseline every later stage is measured
 * against: commitment control, cost overrun and the whole defense of "was this
 * spend within what was approved" reference `approvedAmount`.
 */
export interface Authorization {
  readonly afeNumber: string;
  readonly approvedAmount: Money;
  readonly approvedOn: IsoDate;
  readonly approvedBy: string;
  readonly basis?: string;
  readonly source: SourceRef;
}

// ---------------------------------------------------------------------------
// Stage 2 — Commit
// ---------------------------------------------------------------------------

export interface Commitment {
  /** Natural key within the project, e.g. "PO-114". Unique per project. */
  readonly ref: string;
  readonly description: string;
  /** Committed value of the PO / contract. */
  readonly amount: Money;
  readonly executedOn: IsoDate;
  readonly source: SourceRef;
  /** When this revises an earlier commitment (a change order), the ref it revises. */
  readonly changeOrderOf?: string;
}

// ---------------------------------------------------------------------------
// Stage 3 — Spend / Incur
// ---------------------------------------------------------------------------

/**
 * The nature of an incurred cost. This is INPUT to the capitalization judgment,
 * not the judgment itself — `CAPITALIZED_INTEREST` says the cost is interest
 * under ASC 835-20, not that it has been approved for capitalization. That
 * decision lives in the determination.
 */
export type CostNature =
  | 'DIRECT'                // direct construction / equipment cost
  | 'CAPITALIZED_LABOR'     // internal labor eligible for capitalization (ASC 360)
  | 'CAPITALIZED_INTEREST'  // interest during construction (ASC 835-20)
  | 'INDIRECT'              // allocable indirect cost
  | 'SOFT';                 // soft cost whose treatment is not obvious

export interface CostEntry {
  /** Natural key within the project, e.g. "INV-2291". Unique per project. */
  readonly ref: string;
  readonly description: string;
  readonly amount: Money;
  readonly incurredOn: IsoDate;
  readonly nature: CostNature;
  /** Ties the spend back to the commitment it draws down, when there is one. */
  readonly commitmentRef?: string;
  readonly source: SourceRef;
}

// ---------------------------------------------------------------------------
// Stage 4 — Capitalize (⭐ determination one)
// ---------------------------------------------------------------------------

/**
 * The per-cost call. A DECIDED classification is never PENDING — an undecided
 * cost is simply one with no classification, and `approveCapitalization` refuses
 * to pass a project that still has any.
 */
export interface CostClassification {
  readonly costRef: string;
  readonly treatment: 'CAPITALIZE' | 'EXPENSE';
  readonly rationale: string;
}

export interface CapitalizationDetermination {
  /**
   * ASC 835-20: the date capitalization began (activities in progress,
   * expenditures being made, interest being incurred). The type makes it
   * mandatory — a capitalization with no start date is not defensible.
   */
  readonly capitalizationStart: IsoDate;
  /** The authority relied on, e.g. "ASC 360-10 / ASC 835-20". */
  readonly standard: string;
  readonly classifications: readonly CostClassification[];
  readonly determinedBy: string;
  readonly determinedOn: IsoDate;
  readonly memo?: string;
  readonly source: SourceRef;
}

declare const determined: unique symbol;

/**
 * A `CapitalizationDetermination` that has passed `approveCapitalization`. The
 * brand is not decorative: `capitalize()` demands one, so the only route from a
 * draft judgment to CIP is through the gate.
 */
export type ApprovedCapitalization = CapitalizationDetermination & {
  readonly [determined]: 'CAPITALIZATION';
};

// ---------------------------------------------------------------------------
// Stage 5 — Place in Service (⭐ determination two)
// ---------------------------------------------------------------------------

/**
 * Book straight-line only, plus NONE for land and other non-depreciable units.
 * Declining-balance and units-of-production are real but tax-flavoured and are
 * left to a later pass rather than stubbed in dead.
 */
export type DepreciationMethod = 'STRAIGHT_LINE' | 'NONE';

/**
 * FULL_MONTH: the in-service month is a whole month of depreciation.
 * MID_MONTH:  half a month in the in-service month (ASC-neutral book convention).
 */
export type DepreciationConvention = 'FULL_MONTH' | 'MID_MONTH';

/**
 * One asset the project unitizes into at placed-in-service. A CIP balance rarely
 * becomes a single asset — a data hall is componentized into shell, mechanical,
 * electrical and IT, each with its own life. Each unit's `cost` is the slice of
 * the CIP balance assigned to it, and those slices must sum to the whole.
 */
export interface AssetUnit {
  readonly id: AssetId;
  readonly description: string;
  readonly cost: Money;
  readonly salvage: Money;
  /** Months of useful life. Must be 0 when method is NONE, positive otherwise. */
  readonly usefulLifeMonths: number;
  readonly method: DepreciationMethod;
  readonly convention: DepreciationConvention;
}

export interface PlacedInServiceDetermination {
  /** ASC 360: the date the asset was ready for its intended use. */
  readonly inServiceOn: IsoDate;
  readonly readinessBasis: string;
  readonly standard: string;
  readonly units: readonly AssetUnit[];
  readonly determinedBy: string;
  readonly determinedOn: IsoDate;
  readonly memo?: string;
  readonly source: SourceRef;
}

export type ApprovedPlacement = PlacedInServiceDetermination & {
  readonly [determined]: 'PLACED_IN_SERVICE';
};

// ---------------------------------------------------------------------------
// The object
// ---------------------------------------------------------------------------

export interface CapitalProject {
  readonly id: CapitalProjectId;
  /** Natural key, e.g. "SV-PH2". */
  readonly code: string;
  readonly name: string;
  readonly entityId: EntityId;
  /** The single currency the project accumulates in. Enforced at the gate. */
  readonly currency: CurrencyCode;
  readonly stage: CapitalStage;

  readonly authorization?: Authorization;            // stamped at stage 1
  readonly commitments: readonly Commitment[];       // stamped at stage 2
  readonly costs: readonly CostEntry[];              // stamped at stage 3
  readonly capitalization?: ApprovedCapitalization;  // stamped at stage 4 (approved only)
  readonly placement?: ApprovedPlacement;            // stamped at stage 5 (approved only)
}

export interface CreateProjectInput {
  readonly id: CapitalProjectId;
  readonly code: string;
  readonly name: string;
  readonly entityId: EntityId;
  readonly currency: CurrencyCode;
}

export const createCapitalProject = (input: CreateProjectInput): CapitalProject => ({
  id: input.id,
  code: input.code,
  name: input.name,
  entityId: input.entityId,
  currency: input.currency,
  stage: 'DRAFT',
  commitments: [],
  costs: [],
});

// ---------------------------------------------------------------------------
// Derivations — everything below is a function of the data above
// ---------------------------------------------------------------------------

const sumMinor = (items: readonly { readonly amount: Money }[]): bigint =>
  items.reduce((s, it) => s + it.amount.amountMinor, 0n);

/** The approved amount, if the project has been authorized. */
export const authorizedAmount = (p: CapitalProject): Money | undefined =>
  p.authorization?.approvedAmount;

/** Total committed value across live commitments. */
export const committedTotal = (p: CapitalProject): Money =>
  money(sumMinor(p.commitments), p.currency);

/** Total cost incurred, capitalizable or not. */
export const incurredTotal = (p: CapitalProject): Money =>
  money(sumMinor(p.costs), p.currency);

const capitalizedRefs = (p: CapitalProject): ReadonlySet<string> =>
  new Set(
    (p.capitalization?.classifications ?? [])
      .filter((c) => c.treatment === 'CAPITALIZE')
      .map((c) => c.costRef),
  );

/** Cost the approved determination classified as capitalizable. Zero before the gate. */
export const capitalizedTotal = (p: CapitalProject): Money => {
  const refs = capitalizedRefs(p);
  return money(sumMinor(p.costs.filter((c) => refs.has(c.ref))), p.currency);
};

/** Cost the approved determination classified as period expense. */
export const expensedTotal = (p: CapitalProject): Money => {
  const refs = new Set(
    (p.capitalization?.classifications ?? [])
      .filter((c) => c.treatment === 'EXPENSE')
      .map((c) => c.costRef),
  );
  return money(sumMinor(p.costs.filter((c) => refs.has(c.ref))), p.currency);
};

/**
 * Construction-in-progress balance. Equal to the capitalized total while in CIP;
 * zero once placed in service, because settlement moves the whole balance to the
 * fixed-asset register. This is the figure `approvePlacement` ties the asset cost
 * back to.
 */
export const cipBalance = (p: CapitalProject): Money =>
  p.stage === 'IN_SERVICE' ? money(0n, p.currency) : capitalizedTotal(p);

/**
 * Cost incurred beyond what was authorized — a CONTROL, and it is meant to be
 * able to fail. Positive is an overrun. Undefined when there is no authorization
 * to measure against, rather than a false zero.
 */
export const authorizationVariance = (p: CapitalProject): Money | undefined => {
  const auth = p.authorization;
  if (!auth) return undefined;
  return money(incurredTotal(p).amountMinor - auth.approvedAmount.amountMinor, p.currency);
};

// ---------------------------------------------------------------------------
// Depreciation — a derivation off an in-service asset, never a stored stage
// ---------------------------------------------------------------------------

export interface PlacedAsset {
  readonly unit: AssetUnit;
  readonly inServiceOn: IsoDate;
}

/** The asset units this project became, empty until it is in service. */
export const placedAssets = (p: CapitalProject): readonly PlacedAsset[] => {
  const pl = p.placement;
  if (!pl) return [];
  return pl.units.map((unit) => ({ unit, inServiceOn: pl.inServiceOn }));
};

const monthIndex = (d: IsoDate): number => {
  const s = d as string;
  return Number(s.slice(0, 4)) * 12 + (Number(s.slice(5, 7)) - 1);
};

const depreciableBaseMinor = (u: AssetUnit): bigint => {
  const base = u.cost.amountMinor - u.salvage.amountMinor;
  return base > 0n ? base : 0n;
};

/** Straight-line charge per whole month. Zero for a non-depreciable unit. */
export const monthlyDepreciation = (a: PlacedAsset): Money => {
  const u = a.unit;
  if (u.method === 'NONE' || u.usefulLifeMonths <= 0) return money(0n, u.cost.currency);
  return money(depreciableBaseMinor(u) / BigInt(u.usefulLifeMonths), u.cost.currency);
};

/**
 * Accumulated depreciation from the in-service date through `asOf`, inclusive.
 *
 * Counted in half-months so MID_MONTH is exact; interim months use floor
 * division of the base, and the terminal balance is pinned to the full
 * depreciable base once the life has fully elapsed, so an asset never ends a
 * fraction short of fully depreciated.
 */
export const accumulatedDepreciationAt = (a: PlacedAsset, asOf: IsoDate): Money => {
  const u = a.unit;
  const base = depreciableBaseMinor(u);
  if (u.method === 'NONE' || u.usefulLifeMonths <= 0 || base === 0n) {
    return money(0n, u.cost.currency);
  }
  const monthsBetween = monthIndex(asOf) - monthIndex(a.inServiceOn);
  if (monthsBetween < 0) return money(0n, u.cost.currency);

  const halfMonths = u.convention === 'MID_MONTH' ? monthsBetween * 2 + 1 : (monthsBetween + 1) * 2;
  const lifeHalves = u.usefulLifeMonths * 2;
  if (halfMonths >= lifeHalves) return money(base, u.cost.currency); // fully depreciated, exact

  const monthlyMinor = base / BigInt(u.usefulLifeMonths);
  const accum = (monthlyMinor * BigInt(halfMonths)) / 2n;
  return money(accum > base ? base : accum, u.cost.currency);
};

/** Net book value = cost − accumulated depreciation, at `asOf`. */
export const netBookValueAt = (a: PlacedAsset, asOf: IsoDate): Money =>
  money(a.unit.cost.amountMinor - accumulatedDepreciationAt(a, asOf).amountMinor, a.unit.cost.currency);

// ---------------------------------------------------------------------------
// Gate one — approve the capitalization determination
// ---------------------------------------------------------------------------

export type DeterminationCode =
  // capitalization
  | 'NO_AUTHORIZATION'
  | 'NO_COSTS_TO_CLASSIFY'
  | 'UNCLASSIFIED_COST'
  | 'CLASSIFIES_UNKNOWN_COST'
  | 'DUPLICATE_CLASSIFICATION'
  | 'NO_CAPITALIZABLE_COST'
  | 'FOREIGN_CURRENCY_COST'
  // placement
  | 'NOT_IN_CIP'
  | 'NO_ASSET_UNITS'
  | 'DUPLICATE_ASSET_ID'
  | 'ASSET_MISSING_LIFE'
  | 'ASSET_LIFE_ON_NON_DEPRECIABLE'
  | 'SALVAGE_EXCEEDS_COST'
  | 'FOREIGN_CURRENCY_UNIT'
  | 'SETTLEMENT_OUT_OF_BALANCE'
  | 'IN_SERVICE_BEFORE_CAPITALIZATION_START';

export interface DeterminationError {
  readonly code: DeterminationCode;
  readonly message: string;
  /** The cost / unit ref the error concerns, when ref-scoped. */
  readonly ref?: string;
  readonly detail?: Readonly<Record<string, string>>;
}

const derr = (
  code: DeterminationCode,
  message: string,
  ref?: string,
  detail?: Record<string, string>,
): DeterminationError => ({
  code,
  message,
  ...(ref !== undefined ? { ref } : {}),
  ...(detail !== undefined ? { detail } : {}),
});

/**
 * Validates a capitalization judgment against the project it classifies, and on
 * success brands it. Reports ALL failures, not the first — a controller fixing a
 * rejected determination needs the whole list, exactly as with a journal entry.
 *
 * Must be called with the same project later handed to `capitalize`, since the
 * classifications are checked against that project's costs.
 */
export function approveCapitalization(
  p: CapitalProject,
  draft: CapitalizationDetermination,
): Result<ApprovedCapitalization, DeterminationError[]> {
  const errors: DeterminationError[] = [];

  if (!p.authorization) {
    errors.push(derr('NO_AUTHORIZATION', 'Cannot capitalize a project with no authorization'));
  }
  if (p.costs.length === 0) {
    errors.push(derr('NO_COSTS_TO_CLASSIFY', 'There are no costs to classify'));
  }

  const costRefs = new Set(p.costs.map((c) => c.ref));
  const seen = new Set<string>();
  for (const c of draft.classifications) {
    if (!costRefs.has(c.costRef)) {
      errors.push(
        derr('CLASSIFIES_UNKNOWN_COST', `Classification references unknown cost ${c.costRef}`, c.costRef),
      );
    }
    if (seen.has(c.costRef)) {
      errors.push(derr('DUPLICATE_CLASSIFICATION', `Cost ${c.costRef} is classified twice`, c.costRef));
    }
    seen.add(c.costRef);
  }

  // Every cost must be decided, and every cost must be in the project currency —
  // a foreign-currency cost hiding in a CIP balance corrupts the settlement.
  for (const cost of p.costs) {
    if (!seen.has(cost.ref)) {
      errors.push(derr('UNCLASSIFIED_COST', `Cost ${cost.ref} has no classification`, cost.ref));
    }
    if (cost.amount.currency !== p.currency) {
      errors.push(
        derr('FOREIGN_CURRENCY_COST', `Cost ${cost.ref} is not in ${p.currency}`, cost.ref, {
          currency: cost.amount.currency as string,
        }),
      );
    }
  }

  const anyCapitalized = draft.classifications.some((c) => c.treatment === 'CAPITALIZE');
  if (!anyCapitalized) {
    errors.push(
      derr('NO_CAPITALIZABLE_COST', 'Nothing is capitalizable — this is not a CIP project'),
    );
  }

  if (errors.length > 0) return err(errors);
  return ok(draft as ApprovedCapitalization);
}

// ---------------------------------------------------------------------------
// Gate two — approve the placed-in-service determination
// ---------------------------------------------------------------------------

/**
 * Validates a placed-in-service judgment and brands it. The load-bearing check
 * is SETTLEMENT_OUT_OF_BALANCE: the cost carried into the asset register must
 * equal the CIP balance being settled. A placement that does not tie out is the
 * defect this gate exists to stop — the fixed-asset equivalent of an unbalanced
 * journal entry.
 *
 * Requires the project to be IN_CIP, so `cipBalance` is the capitalized total.
 */
export function approvePlacement(
  p: CapitalProject,
  draft: PlacedInServiceDetermination,
): Result<ApprovedPlacement, DeterminationError[]> {
  const errors: DeterminationError[] = [];

  if (p.stage !== 'IN_CIP') {
    errors.push(
      derr('NOT_IN_CIP', `Only an IN_CIP project can be placed in service (stage is ${p.stage})`),
    );
  }
  if (draft.units.length === 0) {
    errors.push(derr('NO_ASSET_UNITS', 'Placed-in-service requires at least one asset unit'));
  }

  const seenIds = new Set<string>();
  for (const u of draft.units) {
    const ref = u.id as string;
    if (seenIds.has(ref)) {
      errors.push(derr('DUPLICATE_ASSET_ID', `Asset unit ${ref} appears twice`, ref));
    }
    seenIds.add(ref);

    if (u.method === 'STRAIGHT_LINE' && u.usefulLifeMonths <= 0) {
      errors.push(derr('ASSET_MISSING_LIFE', `Depreciable unit ${ref} needs a positive life`, ref));
    }
    if (u.method === 'NONE' && u.usefulLifeMonths !== 0) {
      errors.push(
        derr('ASSET_LIFE_ON_NON_DEPRECIABLE', `Non-depreciable unit ${ref} must have life 0`, ref),
      );
    }
    if (u.salvage.amountMinor > u.cost.amountMinor) {
      errors.push(derr('SALVAGE_EXCEEDS_COST', `Salvage exceeds cost on unit ${ref}`, ref));
    }
    if (u.cost.currency !== p.currency || u.salvage.currency !== p.currency) {
      errors.push(derr('FOREIGN_CURRENCY_UNIT', `Unit ${ref} is not in ${p.currency}`, ref));
    }
  }

  // The tie-out. Only meaningful once currencies agree, so it is computed in
  // minor units directly rather than through addMoney (which would throw on a
  // mismatch already reported above).
  const unitCostMinor = draft.units.reduce((s, u) => s + u.cost.amountMinor, 0n);
  const cip = cipBalance(p).amountMinor;
  if (unitCostMinor !== cip) {
    errors.push(
      derr(
        'SETTLEMENT_OUT_OF_BALANCE',
        'Asset cost placed in service does not equal the CIP balance settled',
        undefined,
        {
          assetCostMinor: unitCostMinor.toString(),
          cipBalanceMinor: cip.toString(),
          residualMinor: (unitCostMinor - cip).toString(),
        },
      ),
    );
  }

  const capStart = p.capitalization?.capitalizationStart;
  if (capStart && (draft.inServiceOn as string) < (capStart as string)) {
    errors.push(
      derr(
        'IN_SERVICE_BEFORE_CAPITALIZATION_START',
        `In-service date ${draft.inServiceOn} precedes capitalization start ${capStart}`,
      ),
    );
  }

  if (errors.length > 0) return err(errors);
  return ok(draft as ApprovedPlacement);
}

// ---------------------------------------------------------------------------
// Transitions — pure, immutable, each returns a new project or a stage error
// ---------------------------------------------------------------------------

export type StageErrorCode = 'MISSING_AUTHORIZATION' | 'ILLEGAL_STAGE_TRANSITION';

export interface StageError {
  readonly code: StageErrorCode;
  readonly message: string;
}

const stageErr = (code: StageErrorCode, message: string): Result<never, StageError> =>
  err({ code, message });

const advance = (current: CapitalStage, to: CapitalStage): CapitalStage =>
  STAGE_ORDER[to] > STAGE_ORDER[current] ? to : current;

/** Stage 1. Records the AFE. Re-authorization (a change order) is allowed until in service. */
export function authorize(
  p: CapitalProject,
  authorization: Authorization,
): Result<CapitalProject, StageError> {
  if (p.stage === 'IN_SERVICE') {
    return stageErr('ILLEGAL_STAGE_TRANSITION', 'Cannot re-authorize an in-service project');
  }
  return ok({ ...p, authorization, stage: advance(p.stage, 'AUTHORIZED') });
}

/** Stage 2. Adds a commitment. Requires authorization; barred once in service. */
export function recordCommitment(
  p: CapitalProject,
  commitment: Commitment,
): Result<CapitalProject, StageError> {
  if (!p.authorization) {
    return stageErr('MISSING_AUTHORIZATION', 'Commit requires an authorized project');
  }
  if (p.stage === 'IN_SERVICE') {
    return stageErr('ILLEGAL_STAGE_TRANSITION', 'Cannot commit against an in-service project');
  }
  return ok({ ...p, commitments: [...p.commitments, commitment], stage: advance(p.stage, 'COMMITTED') });
}

/**
 * Stage 3. Records an incurred cost. Requires authorization; barred once in
 * service. A cost recorded after the capitalization determination stays
 * unclassified (and so out of CIP) until a superseding determination — the model
 * does not silently capitalize what no one has judged.
 */
export function recordCost(
  p: CapitalProject,
  cost: CostEntry,
): Result<CapitalProject, StageError> {
  if (!p.authorization) {
    return stageErr('MISSING_AUTHORIZATION', 'Cost requires an authorized project');
  }
  if (p.stage === 'IN_SERVICE') {
    return stageErr('ILLEGAL_STAGE_TRANSITION', 'Cannot record cost against an in-service project');
  }
  return ok({ ...p, costs: [...p.costs, cost], stage: advance(p.stage, 'INCURRING') });
}

/**
 * Stage 4. Moves the project into CIP. Takes an ALREADY-APPROVED determination —
 * the branded type is the guarantee that the gate was passed. Only a project
 * that has begun incurring cost can be capitalized.
 */
export function capitalize(
  p: CapitalProject,
  approved: ApprovedCapitalization,
): Result<CapitalProject, StageError> {
  if (p.stage !== 'INCURRING') {
    return stageErr(
      'ILLEGAL_STAGE_TRANSITION',
      `Capitalize expects an INCURRING project (stage is ${p.stage})`,
    );
  }
  return ok({ ...p, capitalization: approved, stage: 'IN_CIP' });
}

/**
 * Stage 5. Settles CIP to the fixed-asset register and starts depreciation.
 * Takes an ALREADY-APPROVED placement, which is where the settlement tie-out was
 * enforced. Only an IN_CIP project can be placed in service.
 */
export function placeInService(
  p: CapitalProject,
  approved: ApprovedPlacement,
): Result<CapitalProject, StageError> {
  if (p.stage !== 'IN_CIP') {
    return stageErr(
      'ILLEGAL_STAGE_TRANSITION',
      `Place-in-service expects an IN_CIP project (stage is ${p.stage})`,
    );
  }
  return ok({ ...p, placement: approved, stage: 'IN_SERVICE' });
}
