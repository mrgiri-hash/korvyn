/**
 * The capital-asset lifecycle: the six-stage spine, the two determination gates,
 * the settlement tie-out and the depreciation derivation.
 *
 * Imports resolve to `dist/`, so the suite exercises the emitted artifact — the
 * same thing a consumer gets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  capitalProjectId,
  assetId,
  entityId,
  journalEntryId,
  currencyCode,
  isoDate,
  money,
  createCapitalProject,
  authorize,
  recordCommitment,
  recordCost,
  approveCapitalization,
  capitalize,
  approvePlacement,
  placeInService,
  committedTotal,
  incurredTotal,
  capitalizedTotal,
  expensedTotal,
  cipBalance,
  authorizationVariance,
  placedAssets,
  monthlyDepreciation,
  accumulatedDepreciationAt,
  netBookValueAt,
  type CapitalProject,
  type Authorization,
  type Commitment,
  type CostEntry,
  type CapitalizationDetermination,
  type PlacedInServiceDetermination,
  type AssetUnit,
  type SourceRef,
} from '../dist/index.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const USD = currencyCode('USD');
const EUR = currencyCode('EUR');
const SRC: SourceRef = { kind: 'IMPORTED', connectorId: 'x', externalId: 'e1' };

const bigintReplacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

function must<T>(r: { ok: boolean; value?: T; error?: unknown }, label: string): T {
  assert.ok(r.ok, `${label} unexpectedly failed: ${JSON.stringify(r.error, bigintReplacer)}`);
  return (r as { value: T }).value;
}

/** Determination error codes, sorted — order is not part of the contract. */
function dcodes(r: { ok: boolean; error?: readonly { code: string }[] }): string[] {
  return r.ok ? [] : [...(r.error ?? [])].map((e) => e.code).sort();
}

/** Stage transitions fail with a single StageError, not a list. */
function scode(r: { ok: boolean; error?: { code: string } }): string[] {
  return r.ok ? [] : [(r.error as { code: string }).code];
}

const auth = (over: Partial<Authorization> = {}): Authorization => ({
  afeNumber: 'AFE-1',
  approvedAmount: money(500_000_000n, USD),
  approvedOn: isoDate('2026-01-01'),
  approvedBy: 'A. Okafor',
  source: SRC,
  ...over,
});

const commitment = (ref: string, minor: bigint): Commitment => ({
  ref,
  description: ref,
  amount: money(minor, USD),
  executedOn: isoDate('2026-02-01'),
  source: SRC,
});

const cost = (ref: string, minor: bigint, over: Partial<CostEntry> = {}): CostEntry => ({
  ref,
  description: ref,
  amount: money(minor, USD),
  incurredOn: isoDate('2026-03-01'),
  nature: 'DIRECT',
  source: SRC,
  ...over,
});

const unit = (id: string, minor: bigint, over: Partial<AssetUnit> = {}): AssetUnit => ({
  id: assetId(id),
  description: id,
  cost: money(minor, USD),
  salvage: money(0n, USD),
  usefulLifeMonths: 120,
  method: 'STRAIGHT_LINE',
  convention: 'FULL_MONTH',
  ...over,
});

const newProject = (): CapitalProject =>
  createCapitalProject({
    id: capitalProjectId('SV-PH2'),
    code: 'SV-PH2',
    name: 'Silicon Valley Phase 2',
    entityId: entityId('MDH'),
    currency: USD,
  });

/** A project incurring three costs (2 capitalizable, 1 period), ready for gate one. */
function incurringProject(): CapitalProject {
  let p = newProject();
  p = must(authorize(p, auth()), 'authorize');
  p = must(recordCommitment(p, commitment('PO-1', 300_000_000n)), 'commit');
  p = must(recordCost(p, cost('INV-1', 200_000_000n)), 'cost INV-1');
  p = must(recordCost(p, cost('INV-2', 10_000_000n, { nature: 'CAPITALIZED_INTEREST' })), 'cost INV-2');
  p = must(recordCost(p, cost('INV-3', 5_000_000n, { nature: 'SOFT' })), 'cost INV-3');
  return p;
}

const capDraft = (over: Partial<CapitalizationDetermination> = {}): CapitalizationDetermination => ({
  capitalizationStart: isoDate('2026-01-15'),
  standard: 'ASC 360-10 / ASC 835-20',
  classifications: [
    { costRef: 'INV-1', treatment: 'CAPITALIZE', rationale: 'direct construction' },
    { costRef: 'INV-2', treatment: 'CAPITALIZE', rationale: 'interest during construction' },
    { costRef: 'INV-3', treatment: 'EXPENSE', rationale: 'period soft cost' },
  ],
  determinedBy: 'controller',
  determinedOn: isoDate('2026-05-31'),
  source: SRC,
  ...over,
});

/** A project in CIP with a capitalized balance of 210,000,000 minor, ready for gate two. */
function cipProject(): CapitalProject {
  const p = incurringProject();
  const approved = must(approveCapitalization(p, capDraft()), 'approveCapitalization');
  return must(capitalize(p, approved), 'capitalize');
}

const pisDraft = (over: Partial<PlacedInServiceDetermination> = {}): PlacedInServiceDetermination => ({
  inServiceOn: isoDate('2026-06-30'),
  readinessBasis: 'commissioning complete, occupancy permit issued',
  standard: 'ASC 360-10-30',
  units: [
    unit('AST-SHELL', 150_000_000n, { usefulLifeMonths: 480 }),
    unit('AST-EQUIP', 60_000_000n, { usefulLifeMonths: 120 }),
  ],
  determinedBy: 'controller',
  determinedOn: isoDate('2026-07-05'),
  source: SRC,
  ...over,
});

// ---------------------------------------------------------------------------
// The happy path — one object through all six stages
// ---------------------------------------------------------------------------
test('a project walks DRAFT -> AUTHORIZED -> COMMITTED -> INCURRING -> IN_CIP -> IN_SERVICE', () => {
  assert.equal(newProject().stage, 'DRAFT');

  const authP = must(authorize(newProject(), auth()), 'authorize');
  assert.equal(authP.stage, 'AUTHORIZED');

  const commP = must(recordCommitment(authP, commitment('PO-1', 300_000_000n)), 'commit');
  assert.equal(commP.stage, 'COMMITTED');

  const inc = incurringProject();
  assert.equal(inc.stage, 'INCURRING');

  const cip = cipProject();
  assert.equal(cip.stage, 'IN_CIP');

  const approved = must(approvePlacement(cip, pisDraft()), 'approvePlacement');
  const inSvc = must(placeInService(cip, approved), 'placeInService');
  assert.equal(inSvc.stage, 'IN_SERVICE');
});

// ---------------------------------------------------------------------------
// Stage guards
// ---------------------------------------------------------------------------
test('MISSING_AUTHORIZATION: you cannot commit or incur cost before the AFE', () => {
  const p = newProject();
  assert.deepEqual(scode(recordCommitment(p, commitment('PO-1', 1n))), ['MISSING_AUTHORIZATION']);
  assert.deepEqual(scode(recordCost(p, cost('INV-1', 1n))), ['MISSING_AUTHORIZATION']);
});

test('ILLEGAL_STAGE_TRANSITION: capitalize expects an INCURRING project', () => {
  const authP = must(authorize(newProject(), auth()), 'authorize');
  // Approve against a project that has no costs is itself blocked, but even a
  // hand-forged approved value cannot skip the stage guard.
  const forged = capDraft() as never;
  assert.deepEqual(scode(capitalize(authP, forged)), ['ILLEGAL_STAGE_TRANSITION']);
});

test('ILLEGAL_STAGE_TRANSITION: place-in-service expects an IN_CIP project', () => {
  const inc = incurringProject();
  const forged = pisDraft() as never;
  assert.deepEqual(scode(placeInService(inc, forged)), ['ILLEGAL_STAGE_TRANSITION']);
});

test('an in-service project rejects further commitments and costs', () => {
  const cip = cipProject();
  const inSvc = must(placeInService(cip, must(approvePlacement(cip, pisDraft()), 'pis')), 'placeInService');
  assert.deepEqual(scode(recordCommitment(inSvc, commitment('PO-9', 1n))), ['ILLEGAL_STAGE_TRANSITION']);
  assert.deepEqual(scode(recordCost(inSvc, cost('INV-9', 1n))), ['ILLEGAL_STAGE_TRANSITION']);
});

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------
test('the roll-ups derive from the costs and the determination, never stored twice', () => {
  const p = cipProject();
  assert.equal(committedTotal(p).amountMinor, 300_000_000n);
  assert.equal(incurredTotal(p).amountMinor, 215_000_000n);
  assert.equal(capitalizedTotal(p).amountMinor, 210_000_000n); // INV-1 + INV-2
  assert.equal(expensedTotal(p).amountMinor, 5_000_000n); // INV-3
  assert.equal(cipBalance(p).amountMinor, 210_000_000n);
});

test('authorizationVariance is a control that can fail, and is undefined without an AFE', () => {
  assert.equal(authorizationVariance(newProject()), undefined);
  // incurred 215,000,000 vs authorized 500,000,000 -> 285,000,000 under budget
  assert.equal(authorizationVariance(cipProject())?.amountMinor, -285_000_000n);
});

test('CIP settles to zero once placed in service', () => {
  const cip = cipProject();
  const inSvc = must(placeInService(cip, must(approvePlacement(cip, pisDraft()), 'pis')), 'placeInService');
  assert.equal(cipBalance(inSvc).amountMinor, 0n);
});

// ---------------------------------------------------------------------------
// Gate one — approveCapitalization
// ---------------------------------------------------------------------------
test('NO_AUTHORIZATION and NO_COSTS_TO_CLASSIFY: an empty project cannot be capitalized', () => {
  const codes = dcodes(approveCapitalization(newProject(), capDraft({ classifications: [] })));
  assert.ok(codes.includes('NO_AUTHORIZATION'));
  assert.ok(codes.includes('NO_COSTS_TO_CLASSIFY'));
});

test('UNCLASSIFIED_COST: every cost must be decided before the gate passes', () => {
  const draft = capDraft({
    classifications: [{ costRef: 'INV-1', treatment: 'CAPITALIZE', rationale: 'x' }],
  });
  const codes = dcodes(approveCapitalization(incurringProject(), draft));
  // INV-2 and INV-3 are undecided
  assert.deepEqual(codes, ['UNCLASSIFIED_COST', 'UNCLASSIFIED_COST']);
});

test('CLASSIFIES_UNKNOWN_COST and DUPLICATE_CLASSIFICATION are caught', () => {
  const draft = capDraft({
    classifications: [
      { costRef: 'INV-1', treatment: 'CAPITALIZE', rationale: 'x' },
      { costRef: 'INV-1', treatment: 'EXPENSE', rationale: 'dup' },
      { costRef: 'INV-2', treatment: 'CAPITALIZE', rationale: 'x' },
      { costRef: 'INV-3', treatment: 'EXPENSE', rationale: 'x' },
      { costRef: 'GHOST', treatment: 'CAPITALIZE', rationale: 'x' },
    ],
  });
  const codes = dcodes(approveCapitalization(incurringProject(), draft));
  assert.ok(codes.includes('DUPLICATE_CLASSIFICATION'));
  assert.ok(codes.includes('CLASSIFIES_UNKNOWN_COST'));
});

test('NO_CAPITALIZABLE_COST: an all-expense project is not a CIP project', () => {
  const draft = capDraft({
    classifications: [
      { costRef: 'INV-1', treatment: 'EXPENSE', rationale: 'x' },
      { costRef: 'INV-2', treatment: 'EXPENSE', rationale: 'x' },
      { costRef: 'INV-3', treatment: 'EXPENSE', rationale: 'x' },
    ],
  });
  assert.ok(dcodes(approveCapitalization(incurringProject(), draft)).includes('NO_CAPITALIZABLE_COST'));
});

test('FOREIGN_CURRENCY_COST: a foreign cost cannot hide in a CIP balance', () => {
  let p = newProject();
  p = must(authorize(p, auth()), 'authorize');
  p = must(recordCost(p, cost('INV-1', 200_000_000n)), 'c1');
  p = must(recordCost(p, { ...cost('INV-2', 10_000_000n), amount: money(10_000_000n, EUR) }), 'c2');
  const draft = capDraft({
    classifications: [
      { costRef: 'INV-1', treatment: 'CAPITALIZE', rationale: 'x' },
      { costRef: 'INV-2', treatment: 'CAPITALIZE', rationale: 'x' },
    ],
  });
  const codes = dcodes(approveCapitalization(p, draft));
  assert.ok(codes.includes('FOREIGN_CURRENCY_COST'));
});

test('the happy determination brands, and reports all failures in one pass otherwise', () => {
  assert.equal(approveCapitalization(incurringProject(), capDraft()).ok, true);
});

// ---------------------------------------------------------------------------
// Gate two — approvePlacement, and the tie-out
// ---------------------------------------------------------------------------
test('SETTLEMENT_OUT_OF_BALANCE: asset cost must equal the CIP balance settled', () => {
  const cip = cipProject(); // CIP = 210,000,000
  const draft = pisDraft({
    units: [unit('AST-SHELL', 150_000_000n, { usefulLifeMonths: 480 }), unit('AST-EQUIP', 59_999_999n)],
  });
  const r = approvePlacement(cip, draft);
  assert.equal(r.ok, false);
  if (!r.ok) {
    const e = r.error.find((x) => x.code === 'SETTLEMENT_OUT_OF_BALANCE');
    assert.ok(e);
    assert.equal(e?.detail?.residualMinor, '-1');
    assert.equal(e?.detail?.cipBalanceMinor, '210000000');
  }
});

test('a placement that ties out is approved', () => {
  assert.equal(approvePlacement(cipProject(), pisDraft()).ok, true);
});

test('NO_ASSET_UNITS: placed-in-service requires at least one unit', () => {
  assert.ok(dcodes(approvePlacement(cipProject(), pisDraft({ units: [] }))).includes('NO_ASSET_UNITS'));
});

test('ASSET_MISSING_LIFE and DUPLICATE_ASSET_ID are caught per unit', () => {
  const draft = pisDraft({
    units: [
      unit('AST-SHELL', 150_000_000n, { usefulLifeMonths: 0 }), // depreciable but no life
      unit('AST-SHELL', 60_000_000n), // duplicate id
    ],
  });
  const codes = dcodes(approvePlacement(cipProject(), draft));
  assert.ok(codes.includes('ASSET_MISSING_LIFE'));
  assert.ok(codes.includes('DUPLICATE_ASSET_ID'));
});

test('ASSET_LIFE_ON_NON_DEPRECIABLE: land (method NONE) must carry life 0', () => {
  const draft = pisDraft({
    units: [
      unit('AST-LAND', 150_000_000n, { method: 'NONE', usefulLifeMonths: 12 }),
      unit('AST-EQUIP', 60_000_000n),
    ],
  });
  assert.ok(dcodes(approvePlacement(cipProject(), draft)).includes('ASSET_LIFE_ON_NON_DEPRECIABLE'));
});

test('SALVAGE_EXCEEDS_COST is rejected', () => {
  const draft = pisDraft({
    units: [
      unit('AST-SHELL', 150_000_000n, { usefulLifeMonths: 480, salvage: money(200_000_000n, USD) }),
      unit('AST-EQUIP', 60_000_000n),
    ],
  });
  assert.ok(dcodes(approvePlacement(cipProject(), draft)).includes('SALVAGE_EXCEEDS_COST'));
});

test('IN_SERVICE_BEFORE_CAPITALIZATION_START is rejected', () => {
  // capitalizationStart is 2026-01-15; place in service before it
  const draft = pisDraft({ inServiceOn: isoDate('2026-01-01') });
  assert.ok(
    dcodes(approvePlacement(cipProject(), draft)).includes('IN_SERVICE_BEFORE_CAPITALIZATION_START'),
  );
});

// ---------------------------------------------------------------------------
// Depreciation — a derivation off the in-service asset
// ---------------------------------------------------------------------------
function inServiceProject(): CapitalProject {
  const cip = cipProject();
  return must(placeInService(cip, must(approvePlacement(cip, pisDraft()), 'pis')), 'placeInService');
}

test('placedAssets is empty until in service, then carries the units', () => {
  assert.equal(placedAssets(cipProject()).length, 0);
  assert.equal(placedAssets(inServiceProject()).length, 2);
});

test('straight-line monthly = (cost - salvage) / life', () => {
  const equip = placedAssets(inServiceProject()).find((a) => (a.unit.id as string) === 'AST-EQUIP');
  assert.ok(equip);
  // 60,000,000 / 120 = 500,000 minor = $5,000.00 / month
  assert.equal(monthlyDepreciation(equip!).amountMinor, 500_000n);
});

test('FULL_MONTH counts the in-service month, and accumulates monthly thereafter', () => {
  const equip = placedAssets(inServiceProject()).find((a) => (a.unit.id as string) === 'AST-EQUIP')!;
  // in-service 2026-06-30: at 2026-06-30 one full month has been taken
  assert.equal(accumulatedDepreciationAt(equip, isoDate('2026-06-30')).amountMinor, 500_000n);
  // twelve months later -> 13 months under FULL_MONTH
  assert.equal(accumulatedDepreciationAt(equip, isoDate('2027-06-30')).amountMinor, 6_500_000n);
  assert.equal(netBookValueAt(equip, isoDate('2027-06-30')).amountMinor, 53_500_000n);
});

test('MID_MONTH takes half a month in the in-service month', () => {
  const cip = cipProject();
  const draft = pisDraft({
    units: [
      unit('AST-SHELL', 150_000_000n, { usefulLifeMonths: 480 }),
      unit('AST-EQUIP', 60_000_000n, { convention: 'MID_MONTH' }),
    ],
  });
  const inSvc = must(placeInService(cip, must(approvePlacement(cip, draft), 'pis')), 'placeInService');
  const equip = placedAssets(inSvc).find((a) => (a.unit.id as string) === 'AST-EQUIP')!;
  // half of 500,000 = 250,000 in the in-service month
  assert.equal(accumulatedDepreciationAt(equip, isoDate('2026-06-30')).amountMinor, 250_000n);
});

test('a fully-elapsed life is exactly fully depreciated, no rounding tail', () => {
  const equip = placedAssets(inServiceProject()).find((a) => (a.unit.id as string) === 'AST-EQUIP')!;
  // life is 120 months; far in the future accumulated == base, NBV == 0
  assert.equal(accumulatedDepreciationAt(equip, isoDate('2050-01-01')).amountMinor, 60_000_000n);
  assert.equal(netBookValueAt(equip, isoDate('2050-01-01')).amountMinor, 0n);
});

test('land (method NONE) never depreciates', () => {
  const cip = cipProject();
  const draft = pisDraft({
    units: [
      unit('AST-LAND', 150_000_000n, { method: 'NONE', usefulLifeMonths: 0 }),
      unit('AST-EQUIP', 60_000_000n),
    ],
  });
  const inSvc = must(placeInService(cip, must(approvePlacement(cip, draft), 'pis')), 'placeInService');
  const land = placedAssets(inSvc).find((a) => (a.unit.id as string) === 'AST-LAND')!;
  assert.equal(monthlyDepreciation(land).amountMinor, 0n);
  assert.equal(accumulatedDepreciationAt(land, isoDate('2050-01-01')).amountMinor, 0n);
  assert.equal(netBookValueAt(land, isoDate('2050-01-01')).amountMinor, 150_000_000n);
});

test('journalEntryId threads a cost back to its GL posting', () => {
  // The provenance thread: a cost can name the posting it resolves to.
  const c = { ...cost('INV-1', 1n), source: { kind: 'IMPORTED', journalEntryId: journalEntryId('JE-9') } as SourceRef };
  assert.equal(c.source.journalEntryId, journalEntryId('JE-9'));
});
