/**
 * The invariants. One test per row of the table in the README, plus the two
 * properties the design actually rests on: all-failures-not-the-first, and
 * per-currency balance.
 *
 * Run with `npm test` (Node's built-in runner — no framework dependency).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateJournalEntry,
  isBalanced,
  balanceByCurrency,
  accountId,
  entityId,
  isoDate,
  periodId,
} from '../dist/index.js';

import {
  account,
  codesOf,
  context,
  dim,
  entity,
  entry,
  line,
  period,
  ENTITY,
  EUR,
  OTHER_ENTITY,
  USD,
} from './fixtures.ts';

const balanced = () => entry([line(1, '15000', 100_000n), line(2, '20000', -100_000n)]);

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------
test('a balanced two-line entry validates', () => {
  const r = validateJournalEntry(balanced(), context());
  assert.equal(r.ok, true);
});

test('the validated entry is the same document, not a copy', () => {
  const e = balanced();
  const r = validateJournalEntry(e, context());
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.entryNo, e.entryNo);
});

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------
test('NO_LINES: an entry with no lines is rejected', () => {
  const r = validateJournalEntry(entry([]), context());
  assert.ok(codesOf(r).includes('NO_LINES'));
});

test('SINGLE_LINE: double-entry needs at least two lines', () => {
  const r = validateJournalEntry(entry([line(1, '15000', 100n)]), context());
  assert.ok(codesOf(r).includes('SINGLE_LINE'));
});

test('DUPLICATE_LINE_NO: line numbers must be unique within an entry', () => {
  const r = validateJournalEntry(
    entry([line(1, '15000', 100n), line(1, '20000', -100n)]),
    context(),
  );
  assert.ok(codesOf(r).includes('DUPLICATE_LINE_NO'));
});

test('ZERO_AMOUNT_LINE: a zero line carries no information and is rejected', () => {
  const r = validateJournalEntry(
    entry([line(1, '15000', 0n), line(2, '20000', 0n)]),
    context(),
  );
  // One per offending line — the validator does not stop at the first.
  assert.deepEqual(codesOf(r), ['ZERO_AMOUNT_LINE', 'ZERO_AMOUNT_LINE']);
});

// ---------------------------------------------------------------------------
// Balance — the invariant the whole sign convention exists to make cheap
// ---------------------------------------------------------------------------
test('UNBALANCED: debits must equal credits', () => {
  const r = validateJournalEntry(
    entry([line(1, '15000', 100_000n), line(2, '20000', -99_999n)]),
    context(),
  );
  assert.ok(codesOf(r).includes('UNBALANCED'));
});

test('UNBALANCED reports the residual, so the caller can show the difference', () => {
  const r = validateJournalEntry(
    entry([line(1, '15000', 100_000n), line(2, '20000', -99_999n)]),
    context(),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    const e = r.error.find((x) => x.code === 'UNBALANCED');
    assert.equal(e?.detail?.residualMinor, '1');
    assert.equal(e?.detail?.currency, 'USD');
  }
});

test('balance is per currency: USD debit against EUR credit is an FX position, not balance', () => {
  const e = entry([
    line(1, '15000', 100_000n),
    line(2, '20000', -100_000n, { currency: EUR }),
  ]);
  assert.equal(isBalanced(e), false);
  // Both currencies are reported, not just the first.
  assert.deepEqual(codesOf(validateJournalEntry(e, context())), ['UNBALANCED', 'UNBALANCED']);
});

test('a multi-currency entry balanced within each currency is legal', () => {
  const e = entry([
    line(1, '15000', 100_000n),
    line(2, '20000', -100_000n),
    line(3, '15000', 50_000n, { currency: EUR }),
    line(4, '20000', -50_000n, { currency: EUR }),
  ]);
  assert.equal(isBalanced(e), true);
  assert.equal(validateJournalEntry(e, context()).ok, true);
});

test('balanceByCurrency sums each currency independently', () => {
  const sums = balanceByCurrency(
    entry([
      line(1, '15000', 300n),
      line(2, '20000', -100n),
      line(3, '20000', -100n, { currency: EUR }),
    ]),
  );
  assert.equal(sums.get(USD), 200n);
  assert.equal(sums.get(EUR), -100n);
});

// ---------------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------------
test('PERIOD_NOT_FOUND: an unknown period is rejected', () => {
  const r = validateJournalEntry(balanced(), context({ periods: [] }));
  assert.ok(codesOf(r).includes('PERIOD_NOT_FOUND'));
});

test('a CLOSED period rejects everything, adjusting or not', () => {
  const ctx = context({ periods: [period('CLOSED')] });
  assert.ok(codesOf(validateJournalEntry(balanced(), ctx)).includes('PERIOD_NOT_ACCEPTING_POSTINGS'));
  const adj = entry([line(1, '15000', 100n), line(2, '20000', -100n)], { isAdjusting: true });
  assert.ok(codesOf(validateJournalEntry(adj, ctx)).includes('PERIOD_NOT_ACCEPTING_POSTINGS'));
});

test('SOFT_CLOSED is the point of having three states: it takes adjusting entries only', () => {
  const ctx = context({ periods: [period('SOFT_CLOSED')] });

  const ordinary = validateJournalEntry(balanced(), ctx);
  assert.ok(codesOf(ordinary).includes('PERIOD_NOT_ACCEPTING_POSTINGS'));

  const adjusting = entry([line(1, '15000', 100n), line(2, '20000', -100n)], { isAdjusting: true });
  assert.equal(validateJournalEntry(adjusting, ctx).ok, true);
});

test('POSTING_DATE_OUTSIDE_PERIOD: the date must fall inside the period', () => {
  const r = validateJournalEntry(
    entry([line(1, '15000', 100n), line(2, '20000', -100n)], {
      postingDate: isoDate('2026-07-01'),
    }),
    context(),
  );
  assert.ok(codesOf(r).includes('POSTING_DATE_OUTSIDE_PERIOD'));
});

test('period boundaries are inclusive on both ends', () => {
  for (const d of ['2026-06-01', '2026-06-30']) {
    const r = validateJournalEntry(
      entry([line(1, '15000', 100n), line(2, '20000', -100n)], { postingDate: isoDate(d) }),
      context(),
    );
    assert.equal(r.ok, true, `${d} should be inside the period`);
  }
});

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
test('ACCOUNT_NOT_FOUND: every line must hit a real account', () => {
  const r = validateJournalEntry(
    entry([line(1, '99999', 100n), line(2, '20000', -100n)]),
    context(),
  );
  assert.ok(codesOf(r).includes('ACCOUNT_NOT_FOUND'));
});

test('ACCOUNT_NOT_POSTABLE: summary accounts exist for rollup and reject postings', () => {
  const ctx = context({
    accounts: [account('15000', 'ASSET', { isPostable: false }), account('20000', 'LIABILITY')],
  });
  const r = validateJournalEntry(balanced(), ctx);
  assert.ok(codesOf(r).includes('ACCOUNT_NOT_POSTABLE'));
});

test('ACCOUNT_NOT_POSTABLE also covers inactive accounts, with a different message', () => {
  const ctx = context({
    accounts: [account('15000', 'ASSET', { isActive: false }), account('20000', 'LIABILITY')],
  });
  const r = validateJournalEntry(balanced(), ctx);
  assert.equal(r.ok, false);
  if (!r.ok) {
    const e = r.error.find((x) => x.code === 'ACCOUNT_NOT_POSTABLE');
    assert.match(e?.message ?? '', /inactive/);
  }
});

test('ACCOUNT_NOT_ALLOWED_FOR_ENTITY: entity scope is enforced', () => {
  const ctx = context({
    accounts: [
      account('15000', 'ASSET', { entityScope: [OTHER_ENTITY] }),
      account('20000', 'LIABILITY'),
    ],
  });
  const r = validateJournalEntry(balanced(), ctx);
  assert.ok(codesOf(r).includes('ACCOUNT_NOT_ALLOWED_FOR_ENTITY'));
});

test('an empty entityScope means all entities, not none', () => {
  const ctx = context({
    accounts: [account('15000', 'ASSET', { entityScope: [] }), account('20000', 'LIABILITY')],
  });
  assert.equal(validateJournalEntry(balanced(), ctx).ok, true);
});

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------
test('ENTITY_NOT_FOUND: a line pointed at an unknown entity is rejected', () => {
  const r = validateJournalEntry(
    entry([line(1, '15000', 100n, { entityId: entityId('GHOST') }), line(2, '20000', -100n)]),
    context(),
  );
  assert.ok(codesOf(r).includes('ENTITY_NOT_FOUND'));
});

test('ENTITY_INACTIVE: an inactive entity rejects new postings', () => {
  const ctx = context({ entities: [entity('MDH', { isActive: false }), entity('FLEET')] });
  const r = validateJournalEntry(balanced(), ctx);
  assert.ok(codesOf(r).includes('ENTITY_INACTIVE'));
});

test('lines may hit a different entity than the header — this is how due-to/due-from works', () => {
  const e = entry([
    line(1, '15000', 100_000n),
    line(2, '20000', -100_000n, { entityId: OTHER_ENTITY }),
  ]);
  assert.equal(validateJournalEntry(e, context()).ok, true);
});

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------
test('MISSING_REQUIRED_DIMENSION: "every CIP posting needs a project" is a real control', () => {
  const ctx = context({
    accounts: [
      account('15000', 'ASSET', { requiredDimensions: [dim('PROJECT').code] }),
      account('20000', 'LIABILITY'),
    ],
    dimensions: [dim('PROJECT')],
  });
  const r = validateJournalEntry(balanced(), ctx);
  assert.ok(codesOf(r).includes('MISSING_REQUIRED_DIMENSION'));
});

test('supplying the required dimension satisfies the rule', () => {
  const PROJECT = dim('PROJECT');
  const ctx = context({
    accounts: [
      account('15000', 'ASSET', { requiredDimensions: [PROJECT.code] }),
      account('20000', 'LIABILITY'),
    ],
    dimensions: [PROJECT],
  });
  const e = entry([
    line(1, '15000', 100_000n, { dimensions: { PROJECT: 'SV-PH2' } as never }),
    line(2, '20000', -100_000n),
  ]);
  assert.equal(validateJournalEntry(e, ctx).ok, true);
});

test('DIMENSION_NOT_APPLICABLE: a project code must not ride on an equity posting', () => {
  const PROJECT = dim('PROJECT', { appliesToAccountTypes: ['ASSET', 'EXPENSE'] });
  const ctx = context({
    accounts: [account('15000', 'ASSET'), account('30000', 'EQUITY')],
    dimensions: [PROJECT],
  });
  const e = entry([
    line(1, '15000', 100_000n),
    line(2, '30000', -100_000n, { dimensions: { PROJECT: 'SV-PH2' } as never }),
  ]);
  assert.ok(codesOf(validateJournalEntry(e, ctx)).includes('DIMENSION_NOT_APPLICABLE'));
});

// ---------------------------------------------------------------------------
// The property that matters most when fixing a rejected import
// ---------------------------------------------------------------------------
test('every independent failure is reported in one pass, not one per round trip', () => {
  const ctx = context({ periods: [period('CLOSED')] });
  const e = entry(
    [
      line(1, '99999', 100n), // unknown account
      line(2, '20000', -99n), // ...and the entry does not balance
    ],
    { postingDate: isoDate('2026-07-15') }, // ...and the date is outside the period
  );
  const codes = codesOf(validateJournalEntry(e, ctx));

  for (const expected of [
    'ACCOUNT_NOT_FOUND',
    'UNBALANCED',
    'PERIOD_NOT_ACCEPTING_POSTINGS',
    'POSTING_DATE_OUTSIDE_PERIOD',
  ]) {
    assert.ok(codes.includes(expected), `expected ${expected} in ${codes.join(',')}`);
  }
});

test('an unbalanced entry still reports UNBALANCED even when a lookup also failed', () => {
  // Suppressing the balance error behind a lookup failure would hide the real problem.
  const r = validateJournalEntry(
    entry([line(1, '99999', 100n), line(2, '20000', -50n)]),
    context({ periods: [] }),
  );
  const codes = codesOf(r);
  assert.ok(codes.includes('UNBALANCED'));
  assert.ok(codes.includes('PERIOD_NOT_FOUND'));
});

test('errors are line-scoped where a line caused them', () => {
  const r = validateJournalEntry(
    entry([line(1, '15000', 100n), line(7, '99999', -100n)]),
    context(),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    const e = r.error.find((x) => x.code === 'ACCOUNT_NOT_FOUND');
    assert.equal(e?.lineNo, 7);
    assert.equal(e?.detail?.accountId, accountId('99999'));
  }
});

test('a header-scoped error carries no lineNo at all, rather than an undefined one', () => {
  // exactOptionalPropertyTypes is on: "no line" and "line unknown" must not
  // serialise identically.
  const r = validateJournalEntry(balanced(), context({ periods: [periodMissing()] }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    const e = r.error.find((x) => x.code === 'PERIOD_NOT_FOUND');
    assert.ok(e);
    assert.equal('lineNo' in e, false);
  }
});

function periodMissing() {
  return period('OPEN', { id: periodId('some-other-period') });
}

test('the owning entity on the header is validated too, not just the lines', () => {
  const r = validateJournalEntry(
    entry([line(1, '15000', 100n), line(2, '20000', -100n)], { entityId: entityId('GHOST') }),
    context(),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.error.some((x) => x.code === 'ENTITY_NOT_FOUND' && x.lineNo === undefined));
  }
});

test('ENTITY constant is wired to the fixture entity', () => {
  assert.equal(ENTITY, entityId('MDH'));
});
