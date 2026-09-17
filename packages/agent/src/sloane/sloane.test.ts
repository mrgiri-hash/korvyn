/**
 * Unit tests for Sloane's structured-output schemas and the server-side financial tools.
 * Run: npm run sloane:test   (no provider call)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERPRETATION_SCHEMA, NARRATIVE_SCHEMA, planSchema, structuredOutputProblems, validateInterpretation, OBJECT_TYPES,
} from './schema.js';
import { FinancialDataService, FX_RATE_SET } from './financials.js';
import { authorize, toolRegistry } from './tools.js';
import { ground } from './orchestrator.js';
import { GovernedLedger } from './governed.js';
import { ControlService } from './controls.js';



const base = {
  intent: 'UNDERSTAND', requestedObject: { type: 'INCOME_STATEMENT', id: null, name: 'Income statement' }, operation: 'VIEW',
  period: null, periodRange: { start: '2026-01', end: '2026-04' }, comparisonPeriod: null, comparisonBasis: null, scope: null,
  dimensions: [], filters: [], minAbsAmount: null, topN: null, outputPreference: 'MONTHLY_COLUMNS', continuity: 'NEW_OBJECT',
  needsClarification: false, clarificationFields: [], multiStep: false, confidence: 0.9,
};

/* ---- schema ---------------------------------------------------------------------------------- */
test('every output schema is structured-output compatible', () => {
  for (const s of [INTERPRETATION_SCHEMA, NARRATIVE_SCHEMA, planSchema([]), planSchema(['getIncomeStatement', 'getTrialBalance'])])
    assert.deepEqual(structuredOutputProblems(s), []);
});

test('no node anywhere combines a type array with enum', () => {
  const walk = (n: unknown, at: string): string[] => {
    if (!n || typeof n !== 'object') return [];
    const o = n as Record<string, unknown>;
    const here = Array.isArray(o['type']) && 'enum' in o ? [at] : [];
    return here.concat(...Object.entries(o).map(([k, v]) => (Array.isArray(v) ? v.flatMap((x, i) => walk(x, `${at}.${k}[${i}]`)) : walk(v, `${at}.${k}`))));
  };
  assert.deepEqual(walk(INTERPRETATION_SCHEMA, '$'), []);
  assert.deepEqual(walk(planSchema(['x']), '$'), []);
  assert.deepEqual(walk(NARRATIVE_SCHEMA, '$'), []);
});

test('nullable enums keep their full typed vocabulary and add only null', () => {
  const t = (INTERPRETATION_SCHEMA.properties.requestedObject as { properties: Record<string, { anyOf: { type: string; enum?: string[] }[] }> }).properties['type']!;
  assert.equal(t.anyOf.length, 2);
  assert.deepEqual(t.anyOf[0]!.enum, [...OBJECT_TYPES]);
  assert.equal(t.anyOf[0]!.type, 'string');
  assert.deepEqual(t.anyOf[1], { type: 'null' });
});

test('the checker catches the shape the live API rejected, and other incompatibilities', () => {
  const p = structuredOutputProblems({ type: 'object', properties: { a: { type: ['string', 'null'], enum: ['X', null] }, b: { type: 'string', minLength: 2 } }, required: ['a'] });
  assert.ok(p.some((x) => x.includes('type array combined with enum')));
  assert.ok(p.some((x) => x.includes('additionalProperties')));
  assert.ok(p.some((x) => x.includes('"minLength"')));
  assert.ok(p.some((x) => x.includes('.b: not listed in required')));
});

test('validator: typed values, nulls for nullable enums, and rejections', () => {
  assert.ok(validateInterpretation(base).ok);
  assert.ok(validateInterpretation({ ...base, requestedObject: { type: null, id: null, name: null }, outputPreference: null, comparisonBasis: null }).ok);
  assert.ok(!validateInterpretation({ ...base, requestedObject: { type: 'SPREADSHEET', id: null, name: null } }).ok);
  assert.ok(!validateInterpretation({ ...base, periodRange: { start: '2026-04', end: '2026-01' } }).ok);
});

/* ---- financial tools ------------------------------------------------------------------------- */
const data = new FinancialDataService();
const gl = new GovernedLedger(data);
const controls = new ControlService(gl);
const P = ['2026-01', '2026-02', '2026-03', '2026-04'];

test('income statement foots: net income = revenue − costs, per month', () => {
  const r = data.incomeStatement('GROUP', P);
  const row = (l: string) => r.rows.find((x) => x.label === l)!.values;
  P.forEach((_, i) => {
    const ni = row('Total revenue')[i]! - row('Total cost of operations')[i]! - row('Total operating expenses')[i]! - row('Total depreciation & amortization')[i]! - row('Total other income & expense')[i]!;
    assert.ok(Math.abs(ni - r.netIncome[i]!) < 1e-6);
  });
  assert.equal(r.fxRateSetId, FX_RATE_SET.id);
});

test('group net income = sum of entity net incomes translated at the rate set (eliminations net to zero)', () => {
  const g = data.incomeStatement('GROUP', P);
  const ents = data.scopes().filter((s) => s.kind === 'ENTITY');
  P.forEach((p, i) => {
    const sum = ents.reduce((s, e) => s + data.incomeStatement(e.id, [p]).netIncome[0]! * FX_RATE_SET.toUsd[e.presentationCurrency]![p]!, 0);
    assert.ok(Math.abs(sum - g.netIncome[i]!) < 0.01, `${p}: ${sum} vs ${g.netIncome[i]}`);
  });
  assert.ok(g.eliminated.every((v) => v > 0), 'intercompany fees are eliminated in every month');
});

test('entity trial balance balances', () => {
  for (const e of data.scopes().filter((s) => s.kind === 'ENTITY')) assert.ok(Math.abs(data.trialBalance(e.id, '2026-06').difference) < 0.005, e.id);
});

test('governance: the write tool is refused; scope permissions hold', () => {
  const reviewer = { id: 'u', name: 'u', role: 'R', permissions: ['FINANCIALS_VIEW' as const, 'ERP_WRITEBACK' as const], scopeIds: 'ALL' as const };
  const post = authorize(reviewer, toolRegistry.get('postJournalEntry')!);
  assert.ok(!post.ok && post.gate === 'GOVERNANCE');
  const scoped = { ...reviewer, scopeIds: ['MDH'] };
  const g = authorize(scoped, toolRegistry.get('getIncomeStatement')!, { scope: 'GROUP' });
  assert.ok(!g.ok && g.gate === 'SCOPE');
});

test('grounding rejects a number that no fact carries', () => {
  const obj = data.incomeStatement('GROUP', P);
  const fo = toolRegistry.get('getIncomeStatement')!.run({ periodStart: '2026-01', periodEnd: '2026-04', scope: 'GROUP' }, { data, gl, controls, visible: 'ALL', actor: { id: 'u', name: 'u', role: 'R', permissions: [], scopeIds: 'ALL' }, objectId: 'FO-1' }).object;
  const ni = fo.facts.find((f) => f.key === 'netIncome.range')!.display;
  const g = ground([{ text: `Net income was ${ni}.`, objectIds: ['FO-1'], factKeys: [] }, { text: 'Revenue will reach $99.99M.', objectIds: ['FO-1'], factKeys: [] }], [fo]);
  assert.equal(g.accepted.length, 1);
  assert.equal(g.rejected.length, 1);
  assert.ok(obj.rows.length > 0);
});
