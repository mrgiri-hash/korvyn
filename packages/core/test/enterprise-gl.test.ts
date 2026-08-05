/**
 * The enterprise GL fixture is only "enterprise-grade" if it is checkably so:
 * every generated entry passes the real validator, and every entity's book nets
 * to zero in its own currency. These tests are that proof.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateJournalEntry } from '../dist/index.js';
import {
  buildEnterpriseGL,
  contextFor,
  entityCurrencyResidual,
  trialBalance,
  lineCount,
  serializeEnterpriseGL,
} from '../dist/fixtures/enterprise-gl.js';

test('the book has enterprise shape: 6 entities, 4 currencies, hierarchical chart, 6 periods', () => {
  const gl = buildEnterpriseGL();
  assert.equal(gl.entities.length, 6);
  assert.equal(gl.periods.length, 6);
  assert.ok(gl.accounts.length >= 70, `accounts ${gl.accounts.length}`);
  assert.ok(gl.accounts.some((a) => !a.isPostable), 'has summary/rollup accounts');
  assert.ok(gl.accounts.some((a) => a.isContra), 'has contra accounts');

  const currencies = new Set<string>(gl.entries.flatMap((e) => e.lines.map((l) => l.amount.currency as string)));
  for (const c of ['USD', 'GBP', 'EUR', 'SGD']) assert.ok(currencies.has(c), `missing ${c}`);
});

test('EVERY generated entry passes validateJournalEntry', () => {
  const gl = buildEnterpriseGL();
  const ctx = contextFor(gl);
  let fails = 0;
  const sample: unknown[] = [];
  for (const e of gl.entries) {
    const r = validateJournalEntry(e, ctx);
    if (!r.ok) {
      fails += 1;
      if (sample.length < 5) sample.push({ entryNo: e.entryNo, codes: r.error.map((x) => x.code) });
    }
  }
  assert.equal(fails, 0, `${fails} invalid entries, e.g. ${JSON.stringify(sample)}`);
  assert.ok(lineCount(gl) > 500, `only ${lineCount(gl)} lines`);
});

test('every entity ties out to zero in its own currency — the whole book balances', () => {
  const gl = buildEnterpriseGL();
  for (const [key, residual] of entityCurrencyResidual(gl)) {
    assert.equal(residual, 0n, `${key} does not tie out: residual ${residual}`);
  }
});

test('the trial balance is non-trivial and dimensioned CIP validated (required dimension satisfied)', () => {
  const gl = buildEnterpriseGL();
  const tb = trialBalance(gl);
  assert.ok(tb.length > 30, `only ${tb.length} TB rows`);
  // CIP accounts require a PROJECT dimension; that every entry validated already
  // proves it, but assert the accounts are actually used.
  assert.ok(tb.some((r) => r.accountCode.startsWith('15')), 'CIP is used');
  assert.ok(tb.some((r) => r.accountCode.startsWith('16')), 'PP&E is used');
});

test('intercompany is present on both sides (due-from and due-to)', () => {
  const gl = buildEnterpriseGL();
  const dueFrom = gl.entries.some((e) => e.lines.some((l) => (l.accountId as string) === '13100'));
  const dueTo = gl.entries.some((e) => e.lines.some((l) => (l.accountId as string) === '23100'));
  assert.ok(dueFrom, 'due-from affiliates present');
  assert.ok(dueTo, 'due-to affiliates present');
});

test('generation is deterministic: same seed, byte-identical book', () => {
  assert.equal(serializeEnterpriseGL(buildEnterpriseGL({ seed: 7 })), serializeEnterpriseGL(buildEnterpriseGL({ seed: 7 })));
  assert.notEqual(serializeEnterpriseGL(buildEnterpriseGL({ seed: 1 })), serializeEnterpriseGL(buildEnterpriseGL({ seed: 2 })));
});

test('serialisation renders Money.amountMinor as a string (bigint does not survive JSON)', () => {
  const gl = buildEnterpriseGL({ invoicesPerMonth: 2 });
  const parsed = JSON.parse(serializeEnterpriseGL(gl));
  assert.equal(typeof parsed.entries[0].lines[0].amount.amountMinor, 'string');
  assert.equal(parsed.entities.length, 6);
});
