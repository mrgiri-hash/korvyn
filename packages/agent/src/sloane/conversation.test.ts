/**
 * Phase 6 — the conversational runtime. No provider call: the real orchestrator, the deterministic interpreter for
 * first questions, and the conversation resolver for everything that follows.   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator, type TurnResponse } from './orchestrator.js';
import { conv, dimensionIn, thresholdIn } from './conversation.js';
import { type Actor, ROLES } from './tools.js';

const reviewer: Actor = { id: 'user:mgiri', name: 'Mitra Giri', ...ROLES['FINANCE_REVIEWER']! };
const orch = new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, () => reviewer);
let n = 0;
const sid = () => `test-conv-${String(++n).padStart(4, '0')}`;
const ask = async (s: string, q: string) => { const r = await orch.turn({ sessionId: s, request: q }); assert.notEqual(r.state, 'ERROR', `${q}: ${JSON.stringify(r.notes)}`); return r; };
const tr = (r: TurnResponse) => orch.trace(r.traceId)!;
const tools = (r: TurnResponse) => tr(r).toolsExecuted.map((x) => x.tool);
const args = (r: TurnResponse, i = 0) => tr(r).toolsExecuted[i]!.args;
const ctxOf = (s: string) => (orch as unknown as { sessions: Map<string, { ctx: Parameters<typeof conv>[0] }> }).sessions.get(s)!.ctx;

test('reading follow-up words: dimensions and thresholds', () => {
  assert.equal(dimensionIn('by vendor.'), 'vendor');
  assert.equal(dimensionIn('now projects.'), 'project');
  assert.equal(dimensionIn('by entity'), 'entity');
  assert.equal(dimensionIn('show the gl.'), null);
  assert.equal(thresholdIn('only over $5m.'), 5);
  assert.equal(thresholdIn('only items over $500k'), 0.5);
  assert.equal(thresholdIn('above 2,000,000'), 2);
});

test('§3 follow-ups without restatement: why → by vendor → over $5M → GL → May vs June, no model call after the first', async () => {
  const s = sid();
  const a = await ask(s, 'Why did CIP increase in June?');
  assert.deepEqual(tools(a).slice(0, 2), ['getAccountAnalysis', 'getDriverAnalysis']);
  assert.equal(conv(ctxOf(s)).subject.account, '15000');
  const b = await ask(s, 'By vendor.');
  assert.equal(tr(b).route, 'FOLLOW_UP'); assert.equal(tr(b).calls.filter((c) => c.stage !== 'narrate').length, 0, 'no interpretation or plan call');
  assert.equal(tools(b)[0], 'getDriverAnalysis'); assert.equal(args(b)['dimension'], 'vendor'); assert.equal(args(b)['account'], '15000');
  const c = await ask(s, 'Only over $5M.');
  assert.equal(args(c)['minAbsChange'], '5'); assert.equal(args(c)['dimension'], 'vendor', 'the threshold narrows the view on screen');
  assert.equal(c.kind, 'MODIFY');
  const d = await ask(s, 'Show the GL.');
  assert.equal(tools(d)[0], 'getGovernedPopulation'); assert.equal(args(d)['account'], '15000'); assert.equal(args(d)['minAbsAmount'], '5', 'the threshold carries into the GL');
  assert.equal(d.kind, 'DRILL');
  const e = await ask(s, 'May vs June.');
  assert.equal(args(e)['period'], '2026-06'); assert.equal(args(e)['comparisonPeriod'], '2026-05'); assert.equal(args(e)['account'], '15000');
  assert.ok(tools(e).includes('getDriverAnalysis') && tr(e).toolsExecuted.find((x) => x.tool === 'getDriverAnalysis')!.args['dimension'] === 'vendor', 'the dimension in context stays');
  const line = e.contextLine ?? "";
  assert.ok(/15000 Construction in progress/.test(line) && /vs May 2026/.test(line), line);
});

test('§34 basic chain: financials → largest mover → by entity → projects → over $5M → GL → missing support', async () => {
  const s = sid();
  await ask(s, 'Show me June financials.');
  const m = await ask(s, 'What moved the most?');
  assert.equal(tools(m)[0], 'getLargestFinancialMovements');
  const acct = conv(ctxOf(s)).subject.account;
  assert.ok(acct, 'the largest mover becomes the subject');
  const e = await ask(s, 'By entity.');
  assert.equal(args(e)['dimension'], 'entity'); assert.equal(args(e)['account'], acct);
  const p = await ask(s, 'Now projects.');
  assert.equal(args(p)['dimension'], 'project'); assert.equal(args(p)['account'], acct);
  const o = await ask(s, 'Only over $5M.');
  assert.equal(args(o)['minAbsChange'], '5'); assert.equal(args(o)['dimension'], 'project');
  const g = await ask(s, 'Show the GL.');
  assert.equal(g.state, 'ANSWER'); assert.equal(args(g)['account'], acct); assert.equal(args(g)['minAbsAmount'], '5');
  /* the largest mover's movement is several lines each under $5M: an empty population says what IS there */
  if (!g.objects[0]!.population!.rowCount) assert.ok(g.notes.some((x) => /No single GL line exceeds \$5\.00M/.test(x)) && g.objects[0]!.facts.some((f) => f.key === 'largestBelow'), JSON.stringify(g.notes));
  const ms = await ask(s, 'Which of these are missing support?');
  assert.deepEqual(tools(ms), ['findMissingEvidence', 'getSupportCoverage']);
  /* "these" is the population on screen — or, when the threshold left it empty, the lines behind the movement, said so */
  if (g.objects[0]!.population!.rowCount) assert.equal(args(ms)['populationId'], g.objects[0]!.population!.populationId);
  else { assert.notEqual(args(ms)['populationId'], g.objects[0]!.population!.populationId); assert.ok(ms.notes.some((x) => /checked the \d+ lines behind the movement/.test(x)), JSON.stringify(ms.notes)); }
});

test('§35 correction: vendor FY26 → prior year unavailable (offered alternatives) → "No, South Valley only" keeps the vendor', async () => {
  const s = sid();
  const a = await ask(s, 'Show Siemens FY26 activity.');
  assert.equal(tools(a)[0], 'getTrend'); assert.equal(args(a)['vendor'], 'Siemens Energy');
  const b = await ask(s, 'Compare it to last year.');
  assert.equal(b.state, 'UNAVAILABLE'); assert.ok(b.notes.some((x) => /not in the governed ledger/.test(x)));
  assert.ok((b.suggestions ?? []).length >= 2, 'never a dead end');
  const c = await ask(s, 'No, South Valley only.');
  assert.equal(c.state, 'ANSWER'); assert.equal(tools(c)[0], 'getTrend');
  assert.equal(args(c)['vendor'], 'Siemens Energy', 'the vendor stays'); assert.equal(args(c)['project'], 'SV-PH2', 'the scope changes');
  assert.ok(c.notes.some((x) => /comparison you asked for earlier is still unavailable/.test(x)), 'the comparison intent stays, stated');
});

test('§4 deictic: blockers → "the largest one" → "the GL for it"', async () => {
  const s = sid();
  const a = await ask(s, 'What is blocking June close?');
  assert.ok(tools(a).includes('getCloseBlockers'));
  const items = conv(ctxOf(s)).items;
  assert.ok(items.length > 1, 'the blockers shown are the items "one" can refer to');
  const b = await ask(s, 'Show the largest one.');
  assert.equal(tr(b).route, 'FOLLOW_UP');
  const largest = items.filter((x) => x.amount !== null).sort((x, y) => Math.abs(y.amount!) - Math.abs(x.amount!))[0]!;
  assert.ok(tr(b).shortcut!.includes(largest.label), `${tr(b).shortcut} vs ${largest.label}`);
  const c = await ask(s, 'Show the GL for it.');
  assert.equal(c.state, 'ANSWER');
  assert.ok(['getAccountActivity', 'getReconciliationPopulation', 'getGovernedPopulation'].includes(tools(c)[0]!), tools(c).join());
});

test('§38 capability gaps are answered with alternatives, never mis-routed to another action', async () => {
  const s = sid();
  const a = await ask(s, 'Email this to the auditors.');
  assert.equal(a.state, 'UNAVAILABLE'); assert.equal(tools(a).length, 0, 'no proposal is invented');
  assert.ok((a.suggestions ?? []).length >= 2);
  await ask(s, 'Give me FY26 GL.');
  const b = await ask(s, 'Add May 2026 to the header of the workbook.');
  assert.equal(b.state, 'UNAVAILABLE'); assert.equal(tools(b).length, 0);
  assert.ok((b.suggestions ?? []).some((x) => /May/.test(x)));
});

test('§36 artifact control: build → add TB → add source vendor → reorder → preview, all deterministic', async () => {
  const s = sid();
  const a = await ask(s, 'Give me FY26 GL.');
  assert.equal(tr(a).route, 'DELIVERABLE'); assert.equal(a.kind, 'ARTIFACT');
  for (const q of ['Add TB.', 'Add source vendor.', 'Put project before vendor.']) {
    const r = await ask(s, q);
    assert.equal(tools(r)[0], 'modifyExcelArtifact', q); assert.equal(tr(r).route, 'DELIVERABLE', q);
  }
  const p = await ask(s, 'Preview it.');
  assert.equal(tools(p)[0], 'previewExcelArtifact');
  const wb = p.objects.find((o) => o.type === 'ExcelWorkbookPreview')!.workbook as { sheets: { kind: string }[] };
  assert.ok(wb.sheets.some((x) => x.kind === 'TB'), 'the TB tab was kept across turns');
});

test('§32 a newer request supersedes one still running; the older commits nothing', async () => {
  const s = sid();
  await ask(s, 'Why did CIP increase in June?');
  const before = JSON.stringify(conv(ctxOf(s)).subject);
  const ac = new AbortController(); ac.abort();
  const r = await orch.turn({ sessionId: s, request: 'By entity.' }, undefined, { signal: ac.signal });
  assert.equal(r.state, 'CANCELLED');
  assert.equal(JSON.stringify(conv(ctxOf(s)).subject), before, 'the cancelled turn left the conversation as it was');
});

test('§6 confidence: explicit this turn, inherited after', async () => {
  const s = sid();
  const a = await ask(s, 'Why did CIP increase in June?');
  assert.equal(a.contextFields!.find((f) => f.field === 'period')!.confidence, 'EXPLICIT_HIGH');
  const b = await ask(s, 'By vendor.');
  assert.equal(b.contextFields!.find((f) => f.field === 'period')!.confidence, 'INHERITED_HIGH');
  assert.equal(b.contextFields!.find((f) => f.field === 'dimension')!.confidence, 'EXPLICIT_HIGH');
});

test('§28 investigations are titled for what was investigated', async () => {
  const s = sid();
  const a = await ask(s, 'Why did CIP increase in June?');
  assert.match(a.title ?? '', /Construction in progress (increase|movement) — Jun 2026/);
});

test('conversation front door: ordinary conversation is answered, never gated through a tool match', async () => {
  const s = sid();
  for (const [q, re] of [['hello', /^Hi\. What can I help you with\?$/], ['need your help', /^Of course\. What are you working on\?$/], ['thanks', /welcome/], ['what can you do?', /explain your financials/]] as const) {
    const r = await ask(s, q);
    assert.equal(r.state, 'ANSWER', q); assert.match(r.reply ?? '', re, q);
    assert.equal(r.objects.length, 0, `${q}: conversation creates no financial object`);
    assert.equal(tools(r).length, 0, `${q}: no tool ran`);
    assert.ok(!(r.notes ?? []).some((n) => /governed Korvyn capability/.test(n)), q);
    assert.equal(tr(r).route, 'CONVERSATION'); assert.equal(tr(r).conversation!.requiresTool, false);
  }
  const u = await ask(s, 'blorp zzz');
  assert.ok(!/governed Korvyn capability/.test([u.reply ?? '', ...u.notes].join(' ')), 'unknown intent is never "no capability"');
  const f = await ask(s, 'Show me June financials');
  assert.ok(tools(f).length > 0 && f.objects.length > 0, 'a financial request still runs governed tools');
  assert.equal(tr(f).conversation!.selectedRoute, 'GOVERNED_TOOLS');
  const e = await ask(s, 'Email this package to the auditor');
  assert.equal(e.state, 'UNAVAILABLE'); assert.equal(tr(e).route, 'CAPABILITY_GAP'); assert.ok(e.notes.some((n) => /email|send/i.test(n)));
  const n = await ask(s, 'need your help');
  assert.match(n.reply ?? '', /in this investigation/, 'with an investigation open, help is about it');
});

test('conversation front door: a model reply that cites a figure not in its context is routed to governed tools', async () => {
  const { AnthropicSloaneAdapter } = await import('./adapter.js');
  void AnthropicSloaneAdapter;
  const scripted = new MockLLMAdapter() as MockLLMAdapter & { provider: string };
  Object.defineProperty(scripted, 'provider', { value: 'scripted' });
  (scripted as unknown as { converse: () => Promise<unknown> }).converse = async () => ({ status: 'ok', value: { conversationIntent: 'CONTEXTUAL_CONVERSATION', requiresTool: false, reply: 'Revenue was $99.99M.', unsupportedOperation: null, confidence: 0.9 }, usage: null, latencyMs: 1, requestId: null, model: 'scripted' });
  const o2 = new SloaneOrchestrator(scripted, { maxPlanSteps: 8 }, () => reviewer);
  const r = await o2.turn({ sessionId: 'conv-grounding-01', request: 'Show me June financials' }, reviewer);
  assert.notEqual(r.reply, 'Revenue was $99.99M.');
  assert.match(o2.trace(r.traceId)!.conversation!.fallbackReason ?? '', /not in the context/);
});
