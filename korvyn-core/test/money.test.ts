/**
 * Money. The reason this is bigint minor units rather than a float is that a
 * ledger which cannot sum to exactly zero cannot enforce double-entry at all —
 * so that is the first thing tested here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addMoney,
  CurrencyMismatchError,
  currencyCode,
  formatMoney,
  isZero,
  money,
  moneyToJSON,
  negate,
  zeroMoney,
  debitAmount,
  creditAmount,
  isDebit,
  isCredit,
  normalBalanceOf,
} from '../dist/index.js';

import { line, USD, EUR } from './fixtures.ts';

test('the float problem this type exists to avoid', () => {
  // The reason for minor units: 0.1 + 0.2 !== 0.3 in binary floating point.
  assert.notEqual(0.1 + 0.2, 0.3);
  // In minor units it is exact.
  const sum = addMoney(money(10n, USD), money(20n, USD));
  assert.equal(sum.amountMinor, 30n);
});

test('a long chain of additions still nets to exactly zero', () => {
  let acc = zeroMoney(USD);
  for (let i = 0; i < 1000; i++) acc = addMoney(acc, money(1n, USD));
  for (let i = 0; i < 1000; i++) acc = addMoney(acc, money(-1n, USD));
  assert.equal(acc.amountMinor, 0n);
  assert.equal(isZero(acc), true);
});

test('bigint carries REIT-scale amounts past the 2^53 headroom of a float', () => {
  const huge = money(9_007_199_254_740_993n, USD); // 2^53 + 1
  assert.equal(huge.amountMinor.toString(), '9007199254740993');
  assert.notEqual(Number(huge.amountMinor).toString(), '9007199254740993');
});

test('addMoney refuses to combine currencies rather than papering over it', () => {
  assert.throws(() => addMoney(money(1n, USD), money(1n, EUR)), CurrencyMismatchError);
});

test('currency codes are uppercased on construction', () => {
  assert.equal(currencyCode('usd'), 'USD');
});

test('negate flips sign and preserves currency and scale', () => {
  const n = negate(money(-250n, USD, 2));
  assert.equal(n.amountMinor, 250n);
  assert.equal(n.currency, USD);
  assert.equal(n.scale, 2);
});

test('formatMoney renders scale correctly, including negatives and zero-scale currencies', () => {
  assert.equal(formatMoney(money(-123456n, USD)), '-1234.56 USD');
  assert.equal(formatMoney(money(5n, USD)), '0.05 USD');
  assert.equal(formatMoney(money(0n, USD)), '0.00 USD');
  assert.equal(formatMoney(money(1500n, currencyCode('JPY'), 0)), '1500 JPY');
});

test('moneyToJSON survives a round trip through JSON, which bigint alone does not', () => {
  const m = money(-123456n, USD);
  assert.throws(() => JSON.stringify(m)); // the cost of bigint, stated plainly
  const parsed = JSON.parse(JSON.stringify(moneyToJSON(m)));
  assert.equal(parsed.amountMinor, '-123456');
  assert.equal(BigInt(parsed.amountMinor), m.amountMinor);
});

test('debit and credit are a presentation concern derived from one signed amount', () => {
  const dr = line(1, '15000', 1000n);
  const cr = line(2, '20000', -1000n);

  assert.equal(isDebit(dr), true);
  assert.equal(isCredit(dr), false);
  assert.equal(debitAmount(dr), 1000n);
  assert.equal(creditAmount(dr), 0n);

  assert.equal(isCredit(cr), true);
  assert.equal(debitAmount(cr), 0n);
  assert.equal(creditAmount(cr), 1000n);
});

test('normal balance is derived from account type, so the two cannot disagree', () => {
  assert.equal(normalBalanceOf('ASSET'), 'DEBIT');
  assert.equal(normalBalanceOf('EXPENSE'), 'DEBIT');
  assert.equal(normalBalanceOf('LIABILITY'), 'CREDIT');
  assert.equal(normalBalanceOf('EQUITY'), 'CREDIT');
  assert.equal(normalBalanceOf('REVENUE'), 'CREDIT');
});
