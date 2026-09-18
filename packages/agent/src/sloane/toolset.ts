/**
 * THE GOVERNED READ TOOLS, by Korvyn domain. Every tool:
 *   - runs server-side and reads only the actor's visible entities (env.visible);
 *   - declares typed inputs the Planner validates before execution;
 *   - returns ONE FinancialObject: a table, facts (the only numbers the narrative may use), provenance, and — for
 *     large result sets — a population id with a bounded page instead of rows;
 *   - returns an UNAVAILABLE object, with the specific reason, when the capability or source does not exist.
 *     No tool fabricates content to satisfy a request.
 * Descriptions are written for the planner: what it does, when to use it, what it returns. Keep them short.
 */
import { type ControlService, SEEDED } from './controls.js';
import { findSavedReport, savedReports } from './book.js';
import { DEV_DIRECTORY } from './auth.js';
import { BASIS, FX_RATE_SET, SNAPSHOT_ID, money, periodLabel } from './financials.js';
import { AP_EXTRACT, DIMENSION_KEYS, type DimensionKey, FX_CLOSING_SET, type GLine, type GovernedLedger, type PopulationFilter, SOURCE_HEALTH, pct } from './governed.js';
import { type Fact, type FinancialObject, type ParamSpec, type SloaneTool, type TableRow, type ToolArgs, type ToolEnv, type ToolResult, registerTools } from './tools.js';

/* ---- helpers --------------------------------------------------------------------------------------- */
const $ = (v: number | null | undefined) => (v === null || v === undefined ? '—' : money(v, 'USD'));
const n = (v: number) => String(v);
const P = (name: string, required = true, description = 'month, YYYY-MM'): ParamSpec => ({ name, kind: 'period', required, description });
const scopeP: ParamSpec = { name: 'scope', kind: 'scope', required: false, description: 'governed scope id (GROUP or an entity id); defaults to context' };
const acctP = (required = true): ParamSpec => ({ name: 'account', kind: 'account', required, description: 'account or account-group code, e.g. 15000' });
const GL_SRC = '@korvyn/core validated enterprise GL — posted journal lines';

function base(env: ToolEnv, o: Partial<FinancialObject> & Pick<FinancialObject, 'type' | 'title'>): FinancialObject {
  return {
    id: env.objectId, status: 'AVAILABLE', scope: scopeOf(env, undefined), periods: [], periodLabel: '', currency: 'USD', basis: BASIS, unit: 'USD millions',
    table: { columns: [], rows: [] }, facts: [],
    provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] },
    population: null, refs: {}, focus: null, unavailable: null, governed: true, ...o,
  };
}
function scopeOf(env: ToolEnv, id: string | undefined) {
  const sid = id ?? (env.visible === 'ALL' ? 'GROUP' : [...env.visible][0]!);
  const s = env.data.scope(sid);
  return { id: sid, name: s?.name ?? sid };
}
/** entities a scope argument selects, intersected with what the actor may see */
function entitiesOf(env: ToolEnv, scope: string | undefined): string[] | undefined {
  if (!scope || scope === 'GROUP') return env.visible === 'ALL' ? undefined : [...env.visible];
  return [scope];
}
const vis = (env: ToolEnv, scope?: string) => { const e = entitiesOf(env, scope); return e ? new Set(e) : ('ALL' as const); };
function unavailable(env: ToolEnv, type: string, title: string, capability: string, reason: string): ToolResult {
  return { warnings: [reason], object: base(env, { type, title, status: 'UNAVAILABLE', unavailable: { capability, reason }, facts: [{ key: 'unavailable', label: capability, value: reason, display: reason }] }) };
}
const priorOr = (env: ToolEnv, p: string, c?: string) => c ?? env.gl.priorPeriod(p);
const row = (label: string, cells: string[], level = 1, kind: TableRow['kind'] = 'line', ref?: string): TableRow => ({ label, level, kind, cells, ...(ref ? { ref } : {}) });
const acctName = (env: ToolEnv, code: string) => `${code} ${env.gl.account(code)?.name ?? ''}`.trim();
const vendorOf = (env: ToolEnv, v: string | undefined) => (v ? env.gl.vendors().find((x) => x.toLowerCase() === v.toLowerCase()) ?? v : undefined);
function filterFrom(env: ToolEnv, a: ToolArgs): PopulationFilter {
  const f: PopulationFilter = {};
  if (a['period']) { f.periodStart = a['period']; f.periodEnd = a['period']; }
  if (a['periodStart']) f.periodStart = a['periodStart'];
  if (a['periodEnd']) f.periodEnd = a['periodEnd'];
  const ents = entitiesOf(env, a['entity'] ?? a['scope']); if (ents) f.entities = ents;
  if (a['account']) f.accounts = [a['account']];
  if (a['vendor']) f.vendor = vendorOf(env, a['vendor']);
  if (a['project']) f.project = a['project'];
  if (a['costCenter']) f.costCenter = a['costCenter'];
  if (a['currency']) f.currency = a['currency'].toUpperCase();
  if (a['recordType']) f.recordType = a['recordType'];
  if (a['minAbsAmount']) f.minAbsUsd = Number(a['minAbsAmount']) * 1_000_000;
  return f;
}
/** a population object: count, totals, ONE page of rows, the id to act on it */
function populationObject(env: ToolEnv, type: string, title: string, f: PopulationFilter, a: ToolArgs, focusName?: string): ToolResult {
  const def = env.gl.definePopulation(f, (a['sort'] as never) ?? 'amount_desc', title);
  const q = env.gl.query(def, env.visible, { cursor: Number(a['cursor'] ?? 0), limit: Number(a['limit'] ?? 15) });
  const top = q.all[0];
  const ps = q.periods;
  const o = base(env, {
    type, title, periods: ps, periodLabel: ps.length > 1 ? `${periodLabel(ps[0]!)}–${periodLabel(ps.at(-1)!)}` : ps[0] ? periodLabel(ps[0]) : '',
    table: { columns: ['Posting date', 'Entity', 'Account', 'Vendor', 'Project', 'Currency', 'Amount (USD)', 'Source'],
      rows: q.page.map((l) => row(l.key, [l.postingDate, l.entity, l.account, l.vendor ?? '', l.project ?? '', l.currency, $(l.usd), `${SOURCE_HEALTH[l.connector]?.system ?? l.connector} ${l.externalId}`], 1, 'line', `txn:${l.key}`)) },
    facts: [
      { key: 'lineCount', label: 'Lines in population', value: q.rowCount, display: n(q.rowCount) },
      { key: 'debit', label: 'Debits (USD)', value: q.debitUsd, display: $(q.debitUsd) },
      { key: 'credit', label: 'Credits (USD)', value: q.creditUsd, display: $(q.creditUsd) },
      { key: 'net', label: 'Net (USD)', value: q.netUsd, display: $(q.netUsd) },
      { key: 'entities', label: 'Entities', value: q.entities.length, display: n(q.entities.length) },
      ...(top ? [{ key: 'largest', label: `Largest line ${top.key}`, value: top.usd, display: $(top.usd) }] : []),
    ],
    provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: q.rowCount, fxRateSetId: FX_RATE_SET.id, eliminations: null, declaredInputs: [FX_RATE_SET.id, ...(f.vendor || q.page.some((l) => l.vendor) ? [AP_EXTRACT.id] : [])] },
    population: { populationId: def.id, rowCount: q.rowCount, returned: q.page.length, cursor: q.cursor, nextCursor: q.nextCursor, sort: def.sort, exportHook: q.exportHook },
    refs: { populationId: def.id, ...(top ? { largestTransaction: top.key, largestJournal: top.journalId } : {}) },
    focus: { kind: 'population', id: def.id, name: focusName ?? title },
  });
  const w = [`Showing ${q.page.length} of ${q.rowCount} lines; the full population stays server-side as ${def.id}.`];
  if (f.vendor) w.push(AP_EXTRACT.note);
  if (!q.rowCount) w.push('No governed lines match these filters.');
  return { object: o, warnings: w };
}

/* ================================================================================================
   FINANCIALS
   ================================================================================================ */
const IS_GROUPS = [['40000', 'Total revenue'], ['50000', 'Cost of operations'], ['60000', 'Operating expenses'], ['65000', 'Depreciation & amortization'], ['70000', 'Other income & expense']] as const;
const BS_ASSETS = ['10000', '11000', '12000', '13000', '15000', '16000', '17000', '18000', '19000'];
const BS_LIAB = ['20000', '21000', '22000', '23000', '24000', '25000', '26000'];

function windowOf(p: string, w: string | undefined) {
  const m = Number(p.slice(5, 7)), y = p.slice(0, 4);
  const start = w === 'YTD' ? `${y}-01` : w === 'QTD' ? `${y}-${String(m - ((m - 1) % 3)).padStart(2, '0')}` : p;
  return { start, end: p, label: w === 'YTD' ? `YTD ${periodLabel(p)}` : w === 'QTD' ? `Q${Math.ceil(m / 3)} ${y} to date` : periodLabel(p) };
}
export function isValues(env: ToolEnv, periods: string[], scope?: string) {
  const v = vis(env, scope);
  const g = (code: string) => periods.reduce((s, p) => s + env.gl.presented(code, env.gl.balanceUsd([code], p, v)), 0);
  const rev = g('40000'), cop = g('50000'), opx = g('60000'), dna = g('65000'), oth = g('70000');
  return { rev, cop, opx, noi: rev - cop - opx, dna, oth, ni: rev - cop - opx - dna - oth };
}
export function bsValues(env: ToolEnv, p: string, scope?: string) {
  const v = vis(env, scope);
  const a = BS_ASSETS.map((c) => [c, env.gl.balanceUsd([c], p, v)] as const);
  const l = BS_LIAB.map((c) => [c, -env.gl.balanceUsd([c], p, v)] as const);
  const eq = -env.gl.balanceUsd(['30000'], p, v);
  const ta = a.reduce((s, [, x]) => s + x, 0), tl = l.reduce((s, [, x]) => s + x, 0);
  /* retained earnings to date are the cumulative income-statement activity (not yet closed to equity); translation is the residual */
  const re = env.gl.periods().filter((x) => x <= p).reduce((s, x) => s + isValues(env, [x], scope).ni, 0);
  const cta = ta - tl - eq - re;
  return { a, l, eq, re, cta, ta, tl, te: eq + re + cta };
}

const FINANCIALS: SloaneTool[] = [
  {
    id: 'getFinancialSummary', domain: 'financials', permission: 'FINANCIALS_VIEW', risk: 'READ', objectTypes: ['FINANCIAL_STATEMENT', 'INCOME_STATEMENT', 'BALANCE_SHEET'],
    description: 'Headline financials for a month (or QTD/YTD window): revenue, NOI, net income, total assets, liabilities, equity, cash, CIP, each against the prior period. Use for "show me June financials" or "results".',
    params: [P('period'), scopeP, { name: 'window', kind: 'text', required: false, description: 'MONTH | QTD | YTD (default MONTH)' }],
    outputs: 'FinancialSummary; facts revenue, noi, netIncome, totalAssets, totalLiabilities, totalEquity, cash, cip with .prior and .change',
    run(a, env) {
      const p = a['period']!, w = windowOf(p, a['window']), prior = env.gl.priorPeriod(p);
      const months = env.gl.periods().filter((x) => x >= w.start && x <= w.end);
      const cur = isValues(env, months, a['scope']), pri = prior && a['window'] !== 'YTD' ? isValues(env, [prior], a['scope']) : null;
      const bs = bsValues(env, p, a['scope']), bsp = prior ? bsValues(env, prior, a['scope']) : null;
      const cash = (b: typeof bs) => b.a.find(([c]) => c === '10000')![1], cip = (b: typeof bs) => b.a.find(([c]) => c === '15000')![1];
      const lines: [string, string, number, number | null, string][] = [
        ['revenue', 'Total revenue', cur.rev, pri?.rev ?? null, '40000'], ['noi', 'Net operating income', cur.noi, pri?.noi ?? null, ''], ['netIncome', 'Net income', cur.ni, pri?.ni ?? null, ''],
        ['totalAssets', 'Total assets', bs.ta, bsp?.ta ?? null, ''], ['totalLiabilities', 'Total liabilities', bs.tl, bsp?.tl ?? null, ''], ['totalEquity', 'Total equity', bs.te, bsp?.te ?? null, ''],
        ['cash', 'Cash & cash equivalents', cash(bs), bsp ? cash(bsp) : null, '10000'], ['cip', 'Construction in progress', cip(bs), bsp ? cip(bsp) : null, '15000'],
      ];
      const facts = lines.flatMap(([k, l, c, pr]) => [{ key: k, label: l, value: c, display: $(c) }, ...(pr !== null ? [{ key: `${k}.prior`, label: `${l} · prior`, value: pr, display: $(pr) }, { key: `${k}.change`, label: `${l} · change`, value: c - pr, display: $(c - pr) }] : [])]);
      return {
        warnings: [`Non-USD entities: flows at ${FX_RATE_SET.id}, balances at ${FX_CLOSING_SET.id} (representative rate sets).`],
        object: base(env, {
          type: 'FinancialSummary', title: `Financial summary · ${w.label}`, scope: scopeOf(env, a['scope']), periods: months, periodLabel: w.label,
          table: { columns: [w.label, prior ? periodLabel(prior) : 'Prior', 'Change'], rows: lines.map(([, l, c, pr, code]) => row(l, [$(c), $(pr), pr === null ? '—' : $(c - pr)], 1, 'line', code ? `account:${code}` : undefined)) },
          facts, refs: { period: p, ...(prior ? { comparisonPeriod: prior } : {}) }, focus: { kind: 'statement', id: `financials:${p}`, name: `Financials ${w.label}` },
          provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: FX_RATE_SET.id, eliminations: null, declaredInputs: [FX_RATE_SET.id, FX_CLOSING_SET.id] },
        }),
      };
    },
  },
  {
    id: 'getIncomeStatement', domain: 'financials', permission: 'FINANCIALS_VIEW', risk: 'READ', objectTypes: ['INCOME_STATEMENT', 'FINANCIAL_STATEMENT'],
    description: 'Monthly income statement (one column per month) for a scope and inclusive month range; group consolidated in USD with intercompany fees eliminated.',
    params: [P('periodStart'), P('periodEnd'), { name: 'scope', kind: 'scope', required: true, description: 'governed scope id' }],
    outputs: 'IncomeStatement; facts totalRevenue.<period>, netIncome.<period>, totalRevenue.range, netIncome.range',
    run(a, env) {
      const periods = env.gl.periods().filter((p) => p >= a['periodStart']! && p <= a['periodEnd']!);
      const r = env.data.incomeStatement(a['scope']!, periods), ccy = r.currency;
      const sum = (v: number[]) => v.reduce((x, y) => x + y, 0);
      const rangeLabel = periods.length > 1 ? `${periodLabel(periods[0]!)}–${periodLabel(periods.at(-1)!)}` : periodLabel(periods[0]!);
      const facts: Fact[] = periods.flatMap((p, i) => [
        { key: `totalRevenue.${p}`, label: `Total revenue · ${periodLabel(p)}`, value: r.totalRevenue[i]!, display: money(r.totalRevenue[i]!, ccy) },
        { key: `netIncome.${p}`, label: `Net income · ${periodLabel(p)}`, value: r.netIncome[i]!, display: money(r.netIncome[i]!, ccy) }]);
      facts.push({ key: 'totalRevenue.range', label: `Total revenue · ${rangeLabel}`, value: sum(r.totalRevenue), display: money(sum(r.totalRevenue), ccy) },
        { key: 'netIncome.range', label: `Net income · ${rangeLabel}`, value: sum(r.netIncome), display: money(sum(r.netIncome), ccy) },
        { key: 'scope', label: 'Scope', value: r.scope.name, display: r.scope.name }, { key: 'periods', label: 'Periods', value: rangeLabel, display: rangeLabel });
      return {
        warnings: r.translated ? [`Non-USD entities are presented in USD at ${FX_RATE_SET.id} (${FX_RATE_SET.type}, representative).`] : [],
        object: base(env, {
          type: 'IncomeStatement', title: `Income statement · ${rangeLabel}`, scope: { id: r.scope.id, name: r.scope.name }, periods, periodLabel: rangeLabel, currency: ccy, unit: `${ccy} millions`,
          table: { columns: periods.map(periodLabel), rows: r.rows.map((x) => row(x.label, x.displays, x.level, x.kind, x.code ? `account:${x.code}` : undefined)) }, facts,
          provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: r.journalLines, fxRateSetId: r.fxRateSetId, declaredInputs: r.fxRateSetId ? [r.fxRateSetId] : [],
            eliminations: r.eliminated.some((v) => v !== 0) ? `Intercompany management fees eliminated (${r.eliminated.map((v) => money(v, ccy)).join(' · ')})` : null },
          focus: { kind: 'statement', id: `is:${periods[0]}:${periods.at(-1)}`, name: `Income statement ${rangeLabel}` }, refs: { period: periods.at(-1)! },
        }),
      };
    },
  },
  {
    id: 'getBalanceSheet', domain: 'financials', permission: 'FINANCIALS_VIEW', risk: 'READ', objectTypes: ['BALANCE_SHEET', 'FINANCIAL_STATEMENT'],
    description: 'Balance sheet at a month end, USD at the closing rate set, with retained earnings to date and a derived translation adjustment so it balances.',
    params: [P('period'), scopeP], outputs: 'BalanceSheet; facts totalAssets, totalLiabilities, totalEquity, translationAdjustment',
    run(a, env) {
      const p = a['period']!, b = bsValues(env, p, a['scope']);
      const rows = [row('Assets', [''], 0), ...b.a.map(([c, v]) => row(acctName(env, c), [$(v)], 1, 'line', `account:${c}`)), row('Total assets', [$(b.ta)], 0, 'subtotal'),
        row('Liabilities', [''], 0), ...b.l.map(([c, v]) => row(acctName(env, c), [$(v)], 1, 'line', `account:${c}`)), row('Total liabilities', [$(b.tl)], 0, 'subtotal'),
        row('Equity', [''], 0), row('Contributed and other equity', [$(b.eq)]), row('Retained earnings — current year to date', [$(b.re)]), row('Cumulative translation adjustment (derived)', [$(b.cta)]),
        row('Total equity', [$(b.te)], 0, 'subtotal'), row('Total liabilities and equity', [$(b.tl + b.te)], 0, 'total')];
      return {
        warnings: ['Intercompany balances are presented unelimininated: they do not agree between counterparties (see the intercompany reconciliation).', `Translation adjustment is derived as the balancing residual at ${FX_CLOSING_SET.id}.`],
        object: base(env, {
          type: 'BalanceSheet', title: `Balance sheet · ${periodLabel(p)}`, scope: scopeOf(env, a['scope']), periods: [p], periodLabel: periodLabel(p), table: { columns: [periodLabel(p)], rows },
          facts: [{ key: 'totalAssets', label: 'Total assets', value: b.ta, display: $(b.ta) }, { key: 'totalLiabilities', label: 'Total liabilities', value: b.tl, display: $(b.tl) }, { key: 'totalEquity', label: 'Total equity', value: b.te, display: $(b.te) }, { key: 'translationAdjustment', label: 'Translation adjustment (derived)', value: b.cta, display: $(b.cta) }],
          provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: FX_CLOSING_SET.id, eliminations: 'none — intercompany balances presented gross', declaredInputs: [FX_CLOSING_SET.id, FX_RATE_SET.id] },
          focus: { kind: 'statement', id: `bs:${p}`, name: `Balance sheet ${periodLabel(p)}` }, refs: { period: p },
        }),
      };
    },
  },
  {
    id: 'getCashFlowStatement', domain: 'financials', permission: 'FINANCIALS_VIEW', risk: 'READ', objectTypes: ['FINANCIAL_STATEMENT'],
    description: 'Cash flow statement. Not modelled server-side; returns the unavailable state.', params: [P('period', false)], outputs: 'Unavailable',
    run: (_a, env) => unavailable(env, 'CashFlowStatement', 'Cash flow statement', 'Cash flow statement', 'A cash flow statement is not modelled in the server-side governed ledger (no cash-flow classification of accounts exists yet).'),
  },
  {
    id: 'getFinancialStatementLine', domain: 'financials', permission: 'FINANCIALS_VIEW', risk: 'READ', objectTypes: ['ACCOUNT', 'ACCOUNT_GROUP', 'FINANCIAL_STATEMENT'],
    description: 'One statement line (account group such as 15000 CIP): its value this period and prior, change, and its component accounts.',
    params: [acctP(), P('period'), scopeP], outputs: 'StatementLine; facts value, prior, change, changePct',
    run(a, env) {
      const p = a['period']!, code = a['account']!, prior = env.gl.priorPeriod(p), v = vis(env, a['scope']);
      const val = (c: string, x: string) => env.gl.presented(code, env.gl.balanceUsd([c], x, v));
      const cur = val(code, p), pri = prior ? val(code, prior) : null;
      const kids = env.gl.childrenOf(code);
      return {
        warnings: [], object: base(env, {
          type: 'StatementLine', title: `${acctName(env, code)} · ${periodLabel(p)}`, scope: scopeOf(env, a['scope']), periods: [p], periodLabel: periodLabel(p),
          table: { columns: [periodLabel(p), prior ? periodLabel(prior) : 'Prior', 'Change'], rows: (kids.length ? kids : [code]).map((c) => { const x = val(c, p), y = prior ? val(c, prior) : null; return row(acctName(env, c), [$(x), $(y), y === null ? '—' : $(x - y)], 1, 'line', `account:${c}`); }) },
          facts: [{ key: 'value', label: acctName(env, code), value: cur, display: $(cur) }, ...(pri !== null ? [{ key: 'prior', label: 'Prior period', value: pri, display: $(pri) }, { key: 'change', label: 'Change', value: cur - pri, display: $(cur - pri) }, { key: 'changePct', label: 'Change %', value: pct(cur, pri), display: pct(cur, pri) }] : [])],
          focus: { kind: 'account', id: code, name: acctName(env, code) }, refs: { account: code, period: p }, provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: FX_CLOSING_SET.id, eliminations: null, declaredInputs: [FX_CLOSING_SET.id, FX_RATE_SET.id] },
        }),
      };
    },
  },
  {
    id: 'compareFinancialPeriods', domain: 'financials', permission: 'FINANCIALS_VIEW', risk: 'READ', objectTypes: ['FINANCIAL_STATEMENT', 'INCOME_STATEMENT', 'BALANCE_SHEET'],
    description: 'Every statement line group for two months side by side with change and change %. Use for "May vs June" at statement level.',
    params: [P('period'), P('comparisonPeriod', false, 'month to compare against; default the prior month'), scopeP], outputs: 'PeriodComparison; facts per line <code>.change',
    run(a, env) {
      const p = a['period']!, c = priorOr(env, p, a['comparisonPeriod']);
      if (!c) return unavailable(env, 'PeriodComparison', 'Period comparison', 'Prior period', `${periodLabel(p)} is the first governed period; there is nothing earlier to compare.`);
      const items = env.controls.fluxItems(p, vis(env, a['scope']), c);
      return {
        warnings: [], object: base(env, {
          type: 'PeriodComparison', title: `${periodLabel(p)} vs ${periodLabel(c)}`, scope: scopeOf(env, a['scope']), periods: [c, p], periodLabel: `${periodLabel(p)} vs ${periodLabel(c)}`,
          table: { columns: [periodLabel(c), periodLabel(p), 'Change', 'Change %'], rows: items.map((i) => row(i.name, [$(i.priorUsd), $(i.currentUsd), $(i.changeUsd), i.changePct], 1, 'line', `account:${i.account}`)) },
          facts: items.slice(0, 12).map((i) => ({ key: `${i.account}.change`, label: `${i.name} change`, value: i.changeUsd, display: $(i.changeUsd) })),
          refs: { period: p, comparisonPeriod: c }, provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: FX_CLOSING_SET.id, eliminations: null, declaredInputs: [FX_CLOSING_SET.id, FX_RATE_SET.id] },
        }),
      };
    },
  },
  {
    id: 'getLargestFinancialMovements', domain: 'financials', permission: 'FINANCIALS_VIEW', risk: 'READ', objectTypes: ['FINANCIAL_STATEMENT', 'INCOME_STATEMENT', 'BALANCE_SHEET', 'FLUX'],
    description: 'Statement lines ranked by absolute movement against a comparison month. Use for "what changed the most?". Makes the largest mover the conversation focus.',
    params: [P('period'), P('comparisonPeriod', false, 'default prior month'), scopeP, { name: 'topN', kind: 'number', required: false, description: 'default 5' }],
    outputs: 'LargestMovements; refs largestAccount; facts rank1.change … rankN.change',
    run(a, env) {
      const p = a['period']!, c = priorOr(env, p, a['comparisonPeriod']);
      if (!c) return unavailable(env, 'LargestMovements', 'Largest movements', 'Prior period', `${periodLabel(p)} is the first governed period.`);
      const top = env.controls.fluxItems(p, vis(env, a['scope']), c).slice(0, Math.min(Number(a['topN'] ?? 5), 15));
      const L = top[0];
      return {
        warnings: [], object: base(env, {
          type: 'LargestMovements', title: `Largest movements · ${periodLabel(p)} vs ${periodLabel(c)}`, scope: scopeOf(env, a['scope']), periods: [c, p], periodLabel: `${periodLabel(p)} vs ${periodLabel(c)}`,
          table: { columns: [periodLabel(c), periodLabel(p), 'Change', 'Change %'], rows: top.map((i) => row(i.name, [$(i.priorUsd), $(i.currentUsd), $(i.changeUsd), i.changePct], 1, 'line', `account:${i.account}`)) },
          facts: top.flatMap((i, k) => [{ key: `rank${k + 1}.name`, label: `Rank ${k + 1}`, value: i.name, display: i.name }, { key: `rank${k + 1}.change`, label: `${i.name} change`, value: i.changeUsd, display: $(i.changeUsd) }, { key: `rank${k + 1}.changePct`, label: `${i.name} change %`, value: i.changePct, display: i.changePct }]),
          refs: L ? { largestAccount: L.account, period: p, comparisonPeriod: c } : { period: p, comparisonPeriod: c }, focus: L ? { kind: 'account', id: L.account, name: L.name } : null,
          provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: FX_CLOSING_SET.id, eliminations: null, declaredInputs: [FX_CLOSING_SET.id, FX_RATE_SET.id] },
        }),
      };
    },
  },
];

/* ================================================================================================
   TRIAL BALANCE
   ================================================================================================ */
const entP: ParamSpec = { name: 'entity', kind: 'entity', required: true, description: 'legal entity id' };
function tbRows(env: ToolEnv, entity: string, p: string) { return env.data.trialBalance(entity, p); }
const TB: SloaneTool[] = [
  {
    id: 'getTrialBalance', domain: 'tb', permission: 'TB_VIEW', risk: 'READ', objectTypes: ['TRIAL_BALANCE'],
    description: 'Cumulative trial balance for ONE legal entity through a month, functional currency, first page of accounts with totals. A consolidated TB: use getTrialBalanceByEntity.',
    params: [P('period'), entP], outputs: 'TrialBalance; facts debit, credit, difference',
    run(a, env) {
      const r = tbRows(env, a['entity']!, a['period']!), c = r.currency;
      return { warnings: [], object: base(env, {
        type: 'TrialBalance', title: `Trial balance · ${r.entity.name} · ${periodLabel(r.through)}`, scope: { id: r.entity.id, name: r.entity.name }, periods: [r.through], periodLabel: periodLabel(r.through), currency: c, unit: `${c} millions`,
        table: { columns: ['Debit', 'Credit'], rows: r.rows.map((x) => row(`${x.code} ${x.name}`, [x.debit ? money(x.debit, c) : '', x.credit ? money(x.credit, c) : ''], 1, 'line', `account:${x.code}`)) },
        facts: [{ key: 'debit', label: 'Total debits', value: r.debit, display: money(r.debit, c) }, { key: 'credit', label: 'Total credits', value: r.credit, display: money(r.credit, c) }, { key: 'difference', label: 'Difference', value: r.difference, display: money(r.difference, c) }, { key: 'accounts', label: 'Accounts with balances', value: r.rows.length, display: n(r.rows.length) }],
        provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: r.journalLines, fxRateSetId: null, eliminations: null, declaredInputs: [] }, focus: { kind: 'tb', id: `tb:${r.entity.id}:${r.through}`, name: `Trial balance ${r.entity.name}` }, refs: { entity: r.entity.id, period: r.through },
      }) };
    },
  },
  {
    id: 'getTrialBalanceAccount', domain: 'tb', permission: 'TB_VIEW', risk: 'READ', objectTypes: ['TRIAL_BALANCE', 'ACCOUNT'],
    description: 'One account on the trial balance through a month, by entity in functional currency and in USD at the closing rate.',
    params: [acctP(), P('period'), scopeP], outputs: 'TrialBalanceAccount; facts totalUsd, entities',
    run(a, env) {
      const code = a['account']!, p = a['period']!, ents = env.gl.entities().filter((e) => (entitiesOf(env, a['scope']) ?? env.gl.entities().map((x) => x.id)).includes(e.id));
      const accts = new Set(env.gl.expandAccounts([code]));
      const rows = ents.map((e) => { const loc = env.gl.lines.filter((l) => l.entity === e.id && accts.has(l.account) && l.period <= p).reduce((s, l) => s + l.local, 0); return { e, loc, usd: loc * FX_CLOSING_SET.toUsd[e.currency]![p]! }; }).filter((r) => Math.abs(r.loc) >= 0.005);
      const tot = rows.reduce((s, r) => s + r.usd, 0);
      return { warnings: [], object: base(env, {
        type: 'TrialBalanceAccount', title: `${acctName(env, code)} on the trial balance · ${periodLabel(p)}`, scope: scopeOf(env, a['scope']), periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Functional currency', 'Balance (functional)', 'Balance (USD)'], rows: rows.map((r) => row(r.e.name, [r.e.currency, money(r.loc, r.e.currency), $(r.usd)], 1, 'line', `entity:${r.e.id}`)) },
        facts: [{ key: 'totalUsd', label: 'Total (USD, debit positive)', value: tot, display: $(tot) }, { key: 'entities', label: 'Entities with a balance', value: rows.length, display: n(rows.length) }],
        focus: { kind: 'account', id: code, name: acctName(env, code) }, refs: { account: code, period: p }, provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: FX_CLOSING_SET.id, eliminations: null, declaredInputs: [FX_CLOSING_SET.id] },
      }) };
    },
  },
  {
    id: 'compareTrialBalancePeriods', domain: 'tb', permission: 'TB_VIEW', risk: 'READ', objectTypes: ['TRIAL_BALANCE'],
    description: 'An entity trial balance at two month ends with the movement per account.',
    params: [entP, P('period'), P('comparisonPeriod', false, 'default prior month')], outputs: 'TrialBalanceComparison; facts accountsMoved, largestMovement',
    run(a, env) {
      const e = a['entity']!, p = a['period']!, c = priorOr(env, p, a['comparisonPeriod']);
      if (!c) return unavailable(env, 'TrialBalanceComparison', 'Trial balance comparison', 'Prior period', `${periodLabel(p)} is the first governed period.`);
      const A = tbRows(env, e, p), B = tbRows(env, e, c), ccy = A.currency;
      const net = (r: typeof A) => new Map(r.rows.map((x) => [x.code, { name: x.name, v: x.debit - x.credit }]));
      const ma = net(A), mb = net(B);
      const codes = [...new Set([...ma.keys(), ...mb.keys()])].map((k) => ({ k, name: ma.get(k)?.name ?? mb.get(k)!.name, a: ma.get(k)?.v ?? 0, b: mb.get(k)?.v ?? 0 })).map((x) => ({ ...x, d: x.a - x.b })).filter((x) => Math.abs(x.d) >= 0.005).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
      return { warnings: [], object: base(env, {
        type: 'TrialBalanceComparison', title: `Trial balance movement · ${A.entity.name} · ${periodLabel(c)} → ${periodLabel(p)}`, scope: { id: e, name: A.entity.name }, periods: [c, p], periodLabel: `${periodLabel(p)} vs ${periodLabel(c)}`, currency: ccy, unit: `${ccy} millions`,
        table: { columns: [periodLabel(c), periodLabel(p), 'Movement'], rows: codes.slice(0, 25).map((x) => row(`${x.k} ${x.name}`, [money(x.b, ccy), money(x.a, ccy), money(x.d, ccy)], 1, 'line', `account:${x.k}`)) },
        facts: [{ key: 'accountsMoved', label: 'Accounts that moved', value: codes.length, display: n(codes.length) }, ...(codes[0] ? [{ key: 'largestMovement', label: `Largest movement ${codes[0].k} ${codes[0].name}`, value: codes[0].d, display: money(codes[0].d, ccy) }] : [])],
        refs: { entity: e, period: p, comparisonPeriod: c, ...(codes[0] ? { largestAccount: codes[0].k } : {}) },
      }) };
    },
  },
  {
    id: 'getTrialBalanceByEntity', domain: 'tb', permission: 'TB_VIEW', risk: 'READ', objectTypes: ['TRIAL_BALANCE'],
    description: 'Trial balance totals for every visible entity at a month end (debits, credits, difference, in functional currency). Use for a group-wide TB view.',
    params: [P('period')], outputs: 'TrialBalanceByEntity; facts entities, outOfBalance',
    run(a, env) {
      const p = a['period']!, ents = env.gl.entities().filter((e) => env.visible === 'ALL' || env.visible.has(e.id)), rs = ents.map((e) => tbRows(env, e.id, p));
      const oob = rs.filter((r) => Math.abs(r.difference) >= 0.005).length;
      return { warnings: [], object: base(env, {
        type: 'TrialBalanceByEntity', title: `Trial balance by entity · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p), unit: 'functional currency millions',
        table: { columns: ['Currency', 'Debits', 'Credits', 'Difference', 'Accounts'], rows: rs.map((r) => row(r.entity.name, [r.currency, money(r.debit, r.currency), money(r.credit, r.currency), money(r.difference, r.currency), n(r.rows.length)], 1, 'line', `entity:${r.entity.id}`)) },
        facts: [{ key: 'entities', label: 'Entities', value: rs.length, display: n(rs.length) }, { key: 'outOfBalance', label: 'Entities out of balance', value: oob, display: n(oob) }], refs: { period: p },
      }) };
    },
  },
  {
    id: 'getTrialBalanceByCurrency', domain: 'tb', permission: 'TB_VIEW', risk: 'READ', objectTypes: ['TRIAL_BALANCE'],
    description: 'Cumulative debits and credits per transaction currency at a month end; each currency must net to zero.',
    params: [P('period')], outputs: 'TrialBalanceByCurrency; facts currencies, unbalancedCurrencies',
    run(a, env) {
      const p = a['period']!, m = new Map<string, { d: number; c: number; lines: number }>();
      env.gl.lines.filter((l) => l.period <= p && (env.visible === 'ALL' || env.visible.has(l.entity))).forEach((l) => { const g = m.get(l.currency) ?? { d: 0, c: 0, lines: 0 }; if (l.local > 0) g.d += l.local; else g.c -= l.local; g.lines++; m.set(l.currency, g); });
      const rs = [...m.entries()].sort(), bad = rs.filter(([, g]) => Math.abs(g.d - g.c) >= 0.005).length;
      return { warnings: [], object: base(env, {
        type: 'TrialBalanceByCurrency', title: `Trial balance by currency · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p), unit: 'transaction currency millions',
        table: { columns: ['Debits', 'Credits', 'Difference', 'Lines'], rows: rs.map(([k, g]) => row(k, [money(g.d, k), money(g.c, k), money(g.d - g.c, k), n(g.lines)])) },
        facts: [{ key: 'currencies', label: 'Currencies', value: rs.length, display: n(rs.length) }, { key: 'unbalancedCurrencies', label: 'Currencies that do not net to zero', value: bad, display: n(bad) }], refs: { period: p },
      }) };
    },
  },
  {
    id: 'getTrialBalanceTieOut', domain: 'tb', permission: 'TB_VIEW', risk: 'READ', objectTypes: ['TRIAL_BALANCE'],
    description: 'Tie-out of the governed trial balance: TB derived from journal lines vs each entity’s source ERP extract status. States what can and cannot be proven.',
    params: [P('period')], outputs: 'TrialBalanceTieOut; facts governedBalanced, sourcesAvailable, sourcesUnavailable',
    run(a, env) {
      const p = a['period']!, ents = env.gl.entities().filter((e) => env.visible === 'ALL' || env.visible.has(e.id));
      const rs = ents.map((e) => ({ e, tb: tbRows(env, e.id, p), h: SOURCE_HEALTH[e.connector]! }));
      const bal = rs.filter((r) => Math.abs(r.tb.difference) < 0.005).length, avail = rs.filter((r) => r.h.status === 'AVAILABLE').length;
      return { warnings: ['Source ERP trial-balance extracts are not connected server-side; the tie-out proves the governed TB balances and reports source availability, it does not compare against an independent ERP TB.'], object: base(env, {
        type: 'TrialBalanceTieOut', title: `Trial balance tie-out · ${periodLabel(p)}`, status: 'PARTIAL', periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Governed TB difference', 'Journal lines', 'Source system', 'Source status', 'ERP TB extract'], rows: rs.map((r) => row(r.e.name, [money(r.tb.difference, r.tb.currency), n(r.tb.journalLines), `${r.h.system} ${r.h.instance}`, r.h.status, 'Not connected'], 1, 'line', `entity:${r.e.id}`)) },
        facts: [{ key: 'governedBalanced', label: 'Entities whose governed TB balances', value: bal, display: `${bal} of ${rs.length}` }, { key: 'sourcesAvailable', label: 'Sources available', value: avail, display: n(avail) }, { key: 'sourcesUnavailable', label: 'Sources stale or unavailable', value: rs.length - avail, display: n(rs.length - avail) }], refs: { period: p },
      }) };
    },
  },
];

/* ================================================================================================
   GOVERNED LEDGER / ACCOUNT ACTIVITY
   ================================================================================================ */
const filterParams: ParamSpec[] = [
  P('period', false, 'single month YYYY-MM'), P('periodStart', false, 'first month of a range'), P('periodEnd', false, 'last month of a range'), scopeP,
  { name: 'entity', kind: 'entity', required: false, description: 'legal entity id' }, acctP(false),
  { name: 'vendor', kind: 'vendor', required: false, description: 'vendor name (AP extract)' }, { name: 'project', kind: 'project', required: false, description: 'project code' },
  { name: 'costCenter', kind: 'text', required: false, description: 'cost center code, e.g. CC-OPS' }, { name: 'currency', kind: 'text', required: false, description: 'ISO currency' },
  { name: 'minAbsAmount', kind: 'number', required: false, description: 'minimum absolute USD amount in millions' },
  { name: 'sort', kind: 'text', required: false, description: 'amount_desc | amount_asc | date_asc | date_desc' }, { name: 'cursor', kind: 'number', required: false, description: 'page cursor' },
];
function drivers(env: ToolEnv, rows: GLine[], dim: DimensionKey, p: string, c: string | null) {
  return env.gl.aggregate(rows, dim, c ? { current: (l) => l.period === p, prior: (l) => l.period === c } : undefined);
}
const LEDGER: SloaneTool[] = [
  {
    id: 'getAccountAnalysis', domain: 'ledger', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['ACCOUNT', 'ACCOUNT_GROUP', 'GOVERNED_LEDGER'],
    description: 'Analysis of one account or account group for a month: period activity vs prior, balance, top project, entity and vendor drivers of the activity, and the largest lines. Use to answer "why did X move".',
    params: [acctP(), P('period'), P('comparisonPeriod', false, 'default prior month'), scopeP], outputs: 'AccountAnalysis; facts activity, activity.prior, activity.change, balance, topDriver.<dim>; refs populationId',
    run(a, env) {
      const code = a['account']!, p = a['period']!, c = priorOr(env, p, a['comparisonPeriod']);
      const ents = entitiesOf(env, a['scope']);
      const rows = env.gl.lines.filter(env.gl.match({ accounts: [code], periodStart: c ?? p, periodEnd: p, ...(ents ? { entities: ents } : {}) }, env.visible)).filter((l) => l.period === p || l.period === c);
      const cur = rows.filter((l) => l.period === p).reduce((s, l) => s + l.usd, 0), pri = rows.filter((l) => l.period === c).reduce((s, l) => s + l.usd, 0);
      const bal = env.gl.balanceUsd([code], p, vis(env, a['scope']));
      const dims: DimensionKey[] = ['project', 'entity', 'vendor', 'description'];
      const tops = dims.map((d) => [d, drivers(env, rows, d, p, c)[0]] as const);
      const def = env.gl.definePopulation({ accounts: [code], periodStart: p, periodEnd: p, ...(ents ? { entities: ents } : {}) }, 'amount_desc', `${acctName(env, code)} ${periodLabel(p)}`);
      const facts = [{ key: 'activity', label: `Activity ${periodLabel(p)} (debit positive)`, value: cur, display: $(cur) }, ...(c ? [{ key: 'activity.prior', label: `Activity ${periodLabel(c)}`, value: pri, display: $(pri) }, { key: 'activity.change', label: 'Change in activity', value: cur - pri, display: $(cur - pri) }] : []),
        { key: 'balance', label: `Balance at ${periodLabel(p)}`, value: bal, display: $(bal) }, { key: 'lines', label: 'Lines this period', value: rows.filter((l) => l.period === p).length, display: n(rows.filter((l) => l.period === p).length) },
        ...tops.filter(([, t]) => t).flatMap(([d, t]) => [{ key: `topDriver.${d}`, label: `Top ${d} driver`, value: t!.label, display: t!.label }, { key: `topDriver.${d}.change`, label: `Top ${d} driver change`, value: t!.change, display: $(t!.change) }])];
      return { warnings: rows.some((l) => l.vendor) ? [AP_EXTRACT.note] : [], object: base(env, {
        type: 'AccountAnalysis', title: `${acctName(env, code)} · ${periodLabel(p)}${c ? ` vs ${periodLabel(c)}` : ''}`, scope: scopeOf(env, a['scope']), periods: c ? [c, p] : [p], periodLabel: periodLabel(p),
        table: { columns: ['Driver', c ? periodLabel(c) : 'Prior', periodLabel(p), 'Change'], rows: tops.flatMap(([d]) => drivers(env, rows, d, p, c).slice(0, 4).map((g) => row(`${d}: ${g.label}`, [d, $(g.prior), $(g.current), $(g.change)]))) },
        facts, refs: { account: code, period: p, populationId: def.id, ...(c ? { comparisonPeriod: c } : {}) }, focus: { kind: 'account', id: code, name: acctName(env, code) },
        provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: rows.length, fxRateSetId: FX_RATE_SET.id, eliminations: null, declaredInputs: [FX_RATE_SET.id, FX_CLOSING_SET.id, AP_EXTRACT.id] },
      }) };
    },
  },
  {
    id: 'getAccountActivity', domain: 'ledger', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER', 'ACCOUNT', 'JOURNAL'],
    description: 'The GL lines posted to an account (or group) in a period: population id, count, totals and the first page. Use for "show me the GL" on an account.',
    params: [acctP(), P('period'), scopeP, { name: 'cursor', kind: 'number', required: false, description: 'page cursor' }], outputs: 'GovernedPopulation; refs populationId, largestTransaction',
    run: (a, env) => populationObject(env, 'GovernedPopulation', `GL · ${acctName(env, a['account']!)} · ${periodLabel(a['period']!)}`, filterFrom(env, a), a),
  },
  {
    id: 'getGovernedPopulation', domain: 'ledger', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER', 'VENDOR', 'PROJECT', 'ENTITY', 'JOURNAL', 'INVOICE'],
    description: 'Define a governed GL population by filters (period or range, entity, account, vendor, project, cost center, currency, amount threshold) and return its id, count, totals and first page. Use for vendor/project transaction lists.',
    params: filterParams, outputs: 'GovernedPopulation; refs populationId, largestTransaction',
    run(a, env) {
      const f = filterFrom(env, a);
      const bits = [f.vendor, f.project, a['account'] ? acctName(env, a['account']) : null, a['entity'], f.periodStart && f.periodEnd ? (f.periodStart === f.periodEnd ? periodLabel(f.periodStart) : `${periodLabel(f.periodStart)}–${periodLabel(f.periodEnd)}`) : null].filter(Boolean);
      return populationObject(env, 'GovernedPopulation', `GL population · ${bits.join(' · ') || 'all lines'}`, f, a);
    },
  },
  {
    id: 'filterGovernedPopulation', domain: 'ledger', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER'],
    description: 'Narrow an existing population (by id) with additional filters; returns a new population id. Use for "only over $1M", "only Siemens" on the population in context.',
    params: [{ name: 'populationId', kind: 'populationId', required: true, description: 'population to narrow' }, ...filterParams.filter((p) => !['period', 'periodStart', 'periodEnd'].includes(p.name))],
    outputs: 'GovernedPopulation; refs populationId',
    run(a, env) {
      const src = env.gl.population(a['populationId']!)!;
      const f = { ...src.filter, ...Object.fromEntries(Object.entries(filterFrom(env, a)).filter(([, v]) => v !== undefined)) } as PopulationFilter;
      return populationObject(env, 'GovernedPopulation', `${src.label} · filtered`, f, a);
    },
  },
  {
    id: 'aggregateGovernedPopulation', domain: 'ledger', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER'],
    description: 'Aggregate a population (by id) by one dimension server-side: entity, account, accountGroup, project, costCenter, property, vendor, currency, period.',
    params: [{ name: 'populationId', kind: 'populationId', required: true, description: 'population id' }, { name: 'dimension', kind: 'dimension', required: true, description: 'dimension key' }],
    outputs: 'PopulationAggregate; facts groups, top.label, top.amount',
    run(a, env) {
      const def = env.gl.population(a['populationId']!)!, dim = a['dimension'] as DimensionKey, q = env.gl.query(def, env.visible), gs = env.gl.aggregate(q.all, dim);
      return { warnings: [], object: base(env, {
        type: 'PopulationAggregate', title: `${def.label} by ${dim}`, periods: q.periods, periodLabel: q.periods.map(periodLabel).join(', '),
        table: { columns: ['Amount (USD)', 'Lines'], rows: gs.slice(0, 25).map((g) => row(g.label, [$(g.current), n(g.lines)], 1, 'line', g.key ? `${dim}:${g.key}` : undefined)) },
        facts: [{ key: 'groups', label: `${dim} values`, value: gs.length, display: n(gs.length) }, ...gs.slice(0, 5).flatMap((g, i) => [{ key: `group${i + 1}.label`, label: `${dim} ${i + 1}`, value: g.label, display: g.label }, { key: `group${i + 1}.amount`, label: `${g.label} amount`, value: g.current, display: $(g.current) }])],
        refs: { populationId: def.id }, population: { populationId: def.id, rowCount: q.rowCount, returned: 0, cursor: 0, nextCursor: null, sort: def.sort, exportHook: q.exportHook },
      }) };
    },
  },
  {
    id: 'getPopulationSummary', domain: 'ledger', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER'],
    description: 'Summary of a population by id: its filter definition, count, debits, credits, net, entities, periods and export hook. No rows.',
    params: [{ name: 'populationId', kind: 'populationId', required: true, description: 'population id' }], outputs: 'PopulationSummary; facts lineCount, net',
    run(a, env) {
      const def = env.gl.population(a['populationId']!)!, q = env.gl.query(def, env.visible, { limit: 1 });
      return { warnings: [], object: base(env, {
        type: 'PopulationSummary', title: `Population ${def.id}`, periods: q.periods, periodLabel: q.periods.map(periodLabel).join(', '),
        table: { columns: ['Value'], rows: [row('Filters', [JSON.stringify(def.filter)]), row('Sort', [def.sort]), row('Entities', [q.entities.join(', ')]), row('Export', ['ASYNC_EXPORT · csv, xlsx, parquet · not started'])] },
        facts: [{ key: 'lineCount', label: 'Lines', value: q.rowCount, display: n(q.rowCount) }, { key: 'debit', label: 'Debits', value: q.debitUsd, display: $(q.debitUsd) }, { key: 'credit', label: 'Credits', value: q.creditUsd, display: $(q.creditUsd) }, { key: 'net', label: 'Net', value: q.netUsd, display: $(q.netUsd) }],
        population: { populationId: def.id, rowCount: q.rowCount, returned: 0, cursor: 0, nextCursor: null, sort: def.sort, exportHook: q.exportHook }, refs: { populationId: def.id },
      }) };
    },
  },
  {
    id: 'getTransaction', domain: 'ledger', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['JOURNAL', 'GOVERNED_LEDGER', 'INVOICE'],
    description: 'One GL line by transaction id (JE-000123#1): source facts, dimensions, AP extract references and its ERP source reference.',
    params: [{ name: 'transactionId', kind: 'transactionId', required: true, description: 'line key JE-xxxxxx#n' }], outputs: 'Transaction; facts amount, vendor, invoiceRef',
    run(a, env) {
      const l = env.gl.lines.find((x) => x.key === a['transactionId'])!, s = env.gl.sourceRef(l);
      const fields: [string, string][] = [['Journal', `${l.journalId} (${l.entryNo}) line ${l.lineNo}`], ['Posting date', l.postingDate], ['Entity', l.entityName], ['Account', `${l.account} ${l.accountName}`], ['Description', l.description], ['Amount (functional)', money(l.local, l.currency)], ['Amount (USD, average rate)', $(l.usd)], ['Project', l.project ?? '—'], ['Cost center', l.costCenter ?? '—'], ['Property', l.property ?? '—'], ['Vendor (AP extract)', l.vendor ?? '—'], ['Invoice reference', l.invoiceRef ?? (l.vendor ? 'MISSING' : '—')], ['PO reference', l.poRef ?? '—'], ['Approval reference', l.approvalRequired ? (l.approvalRef ?? 'MISSING') : 'not required'], ['ERP', `${s.erpSystem} ${s.instance} · ${s.transactionType} ${s.transactionId}`], ['Source availability', s.availability]];
      return { warnings: [], object: base(env, {
        type: 'Transaction', title: `Transaction ${l.key}`, scope: { id: l.entity, name: l.entityName }, periods: [l.period], periodLabel: periodLabel(l.period),
        table: { columns: ['Value'], rows: fields.map(([k, v]) => row(k, [v])) },
        facts: [{ key: 'amount', label: 'Amount (USD)', value: l.usd, display: $(l.usd) }, { key: 'vendor', label: 'Vendor', value: l.vendor ?? 'none', display: l.vendor ?? 'none' }, { key: 'invoiceRef', label: 'Invoice reference', value: l.invoiceRef ?? 'missing', display: l.invoiceRef ?? 'missing' }, { key: 'sourceAvailability', label: `ERP connector availability (${s.erpSystem})`, value: s.availability, display: s.availability }, { key: 'documentsConnected', label: 'Invoice documents connected', value: 'No', display: 'No' }],
        refs: { transactionId: l.key, journalId: l.journalId, account: l.account }, focus: { kind: 'transaction', id: l.key, name: `Transaction ${l.key}` }, provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: 1, fxRateSetId: FX_RATE_SET.id, eliminations: null, declaredInputs: [FX_RATE_SET.id, AP_EXTRACT.id] },
      }) };
    },
  },
  {
    id: 'getJournal', domain: 'ledger', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['JOURNAL'],
    description: 'A whole journal entry by id (JE-000123): every line, debits and credits, source.', params: [{ name: 'journalId', kind: 'journalId', required: true, description: 'JE-xxxxxx' }],
    outputs: 'Journal; facts lines, debit, credit',
    run(a, env) {
      const ls = env.gl.lines.filter((l) => l.journalId === a['journalId'] && (env.visible === 'ALL' || env.visible.has(l.entity))), f = ls[0]!, ccy = f.currency;
      const d = ls.reduce((s, l) => s + Math.max(l.local, 0), 0), c = ls.reduce((s, l) => s + Math.max(-l.local, 0), 0);
      return { warnings: [], object: base(env, {
        type: 'Journal', title: `Journal ${f.journalId} · ${f.description}`, scope: { id: f.entity, name: f.entityName }, periods: [f.period], periodLabel: periodLabel(f.period), currency: ccy, unit: `${ccy} millions`,
        table: { columns: ['Account', 'Debit', 'Credit', 'Project', 'Vendor'], rows: ls.map((l) => row(l.key, [`${l.account} ${l.accountName}`, l.local > 0 ? money(l.local, ccy) : '', l.local < 0 ? money(-l.local, ccy) : '', l.project ?? '', l.vendor ?? ''], 1, 'line', `txn:${l.key}`)) },
        facts: [{ key: 'lines', label: 'Lines', value: ls.length, display: n(ls.length) }, { key: 'debit', label: 'Debits', value: d, display: money(d, ccy) }, { key: 'credit', label: 'Credits', value: c, display: money(c, ccy) }],
        refs: { journalId: f.journalId, transactionId: f.key }, focus: { kind: 'journal', id: f.journalId, name: `Journal ${f.journalId}` }, provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: ls.length, fxRateSetId: null, eliminations: null, declaredInputs: [] },
      }) };
    },
  },
];

/* ================================================================================================
   ANALYSIS — one aggregation engine, any dimension
   ================================================================================================ */
const dimP: ParamSpec = { name: 'dimension', kind: 'dimension', required: true, description: `one of ${DIMENSION_KEYS.join(', ')}` };
function analysisRows(env: ToolEnv, a: ToolArgs, p: string, c: string | null) {
  const f = filterFrom(env, { ...a, period: '', periodStart: c && c < p ? c : p, periodEnd: p });
  if (a['vendor']) f.accounts = f.accounts ?? []; // vendor analysis reads the spend leg, never the AP credit leg
  return env.gl.lines.filter(env.gl.match(f, env.visible)).filter((l) => (l.period === p || l.period === c) && (!a['vendor'] || l.account !== '20100'));
}
const optFilters = filterParams.filter((x) => ['scope', 'entity', 'account', 'vendor', 'project', 'costCenter'].includes(x.name));
const ANALYSIS: SloaneTool[] = [
  {
    id: 'comparePeriods', domain: 'analysis', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['ACCOUNT', 'ACCOUNT_GROUP', 'VENDOR', 'PROJECT', 'ENTITY', 'GOVERNED_LEDGER'],
    description: 'Period ACTIVITY (not balances) for a filtered subject (account, vendor, project, entity) in two months, with change and change %. For balance movement use getFinancialStatementLine.',
    params: [P('period'), P('comparisonPeriod', false, 'default prior month'), ...optFilters], outputs: 'PeriodCompare; facts current, prior, change, changePct',
    run(a, env) {
      const p = a['period']!, c = priorOr(env, p, a['comparisonPeriod']);
      if (!c) return unavailable(env, 'PeriodCompare', 'Period comparison', 'Prior period', `${periodLabel(p)} is the first governed period.`);
      const rows = analysisRows(env, a, p, c), cur = rows.filter((l) => l.period === p).reduce((s, l) => s + l.usd, 0), pri = rows.filter((l) => l.period === c).reduce((s, l) => s + l.usd, 0);
      const subj = [a['account'] ? acctName(env, a['account']) : '', vendorOf(env, a['vendor']) ?? '', a['project'] ?? '', a['entity'] ?? ''].filter(Boolean).join(' · ') || 'All activity';
      return { warnings: [], object: base(env, {
        type: 'PeriodCompare', title: `${subj} · ${periodLabel(p)} vs ${periodLabel(c)}`, periods: [c, p], periodLabel: `${periodLabel(p)} vs ${periodLabel(c)}`,
        table: { columns: [periodLabel(c), periodLabel(p), 'Change', 'Change %'], rows: [row(subj, [$(pri), $(cur), $(cur - pri), pct(cur, pri)])] },
        facts: [{ key: 'current', label: `Period activity (not balance) ${periodLabel(p)}`, value: cur, display: $(cur) }, { key: 'prior', label: `Period activity (not balance) ${periodLabel(c)}`, value: pri, display: $(pri) }, { key: 'change', label: 'Change in period activity', value: cur - pri, display: $(cur - pri) }, { key: 'changePct', label: 'Change in period activity %', value: pct(cur, pri), display: pct(cur, pri) }],
        refs: { period: p, comparisonPeriod: c },
      }) };
    },
  },
  {
    id: 'getDriverAnalysis', domain: 'analysis', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['ACCOUNT', 'ACCOUNT_GROUP', 'VENDOR', 'PROJECT', 'GOVERNED_LEDGER'],
    description: 'What drove the change in a filtered subject between two months, broken down by one dimension (ranked by change). Use for "break that down by entity/project/vendor".',
    params: [dimP, P('period'), P('comparisonPeriod', false, 'default prior month'), ...optFilters], outputs: 'DriverAnalysis; facts driver1.label, driver1.change, …, total.change',
    run(a, env) {
      const p = a['period']!, c = priorOr(env, p, a['comparisonPeriod']), dim = a['dimension'] as DimensionKey;
      const rows = analysisRows(env, a, p, c), gs = drivers(env, rows, dim, p, c), tot = gs.reduce((s, g) => s + g.change, 0);
      const def = env.gl.definePopulation({ ...filterFrom(env, a), periodStart: p, periodEnd: p }, 'amount_desc', `Driver population ${periodLabel(p)}`);
      return { warnings: rows.some((l) => l.vendor) && dim === 'vendor' ? [AP_EXTRACT.note] : [], object: base(env, {
        type: 'DriverAnalysis', title: `Drivers by ${dim} · ${a['account'] ? acctName(env, a['account']) : vendorOf(env, a['vendor']) ?? a['project'] ?? 'activity'} · ${periodLabel(p)}${c ? ` vs ${periodLabel(c)}` : ''}`, periods: c ? [c, p] : [p], periodLabel: periodLabel(p),
        table: { columns: [c ? periodLabel(c) : 'Prior', periodLabel(p), 'Change'], rows: [...gs.slice(0, 20).map((g) => row(g.label, [$(g.prior), $(g.current), $(g.change)], 1, 'line', g.key ? `${dim}:${g.key}` : undefined)), row('Total', [$(gs.reduce((s, g) => s + g.prior, 0)), $(gs.reduce((s, g) => s + g.current, 0)), $(tot)], 0, 'total')] },
        facts: [...gs.slice(0, 6).flatMap((g, i) => [{ key: `driver${i + 1}.label`, label: `Driver ${i + 1}`, value: g.label, display: g.label }, { key: `driver${i + 1}.change`, label: `${g.label} change`, value: g.change, display: $(g.change) }]), { key: 'total.change', label: 'Total change', value: tot, display: $(tot) }],
        refs: { populationId: def.id, ...(gs[0]?.key ? { topDriver: gs[0].key } : {}), dimension: dim, period: p, ...(a['account'] ? { account: a['account'] } : {}) }, focus: a['account'] ? { kind: 'account', id: a['account'], name: acctName(env, a['account']) } : null,
        provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: rows.length, fxRateSetId: FX_RATE_SET.id, eliminations: null, declaredInputs: [FX_RATE_SET.id, ...(dim === 'vendor' ? [AP_EXTRACT.id] : [])] },
      }) };
    },
  },
  {
    id: 'analyzeByDimension', domain: 'analysis', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER', 'VENDOR', 'PROJECT', 'ENTITY', 'ACCOUNT'],
    description: 'Activity in a month or month range grouped by one dimension, optionally filtered (e.g. CIP by project, spend by vendor for FY26).',
    params: [dimP, P('periodStart'), P('periodEnd'), ...optFilters], outputs: 'DimensionAnalysis; facts group1.label, group1.amount, …, total',
    run(a, env) {
      const dim = a['dimension'] as DimensionKey, f = filterFrom(env, a);
      const rows = env.gl.lines.filter(env.gl.match(f, env.visible)).filter((l) => !a['vendor'] || l.account !== '20100'), gs = env.gl.aggregate(rows, dim), tot = gs.reduce((s, g) => s + g.current, 0);
      const pl = a['periodStart'] === a['periodEnd'] ? periodLabel(a['periodStart']!) : `${periodLabel(a['periodStart']!)}–${periodLabel(a['periodEnd']!)}`;
      return { warnings: dim === 'vendor' || a['vendor'] ? [AP_EXTRACT.note] : [], object: base(env, {
        type: 'DimensionAnalysis', title: `By ${dim} · ${pl}`, periods: [a['periodStart']!, a['periodEnd']!], periodLabel: pl,
        table: { columns: ['Amount (USD)', 'Lines'], rows: [...gs.slice(0, 25).map((g) => row(g.label, [$(g.current), n(g.lines)], 1, 'line', g.key ? `${dim}:${g.key}` : undefined)), row('Total', [$(tot), n(rows.length)], 0, 'total')] },
        facts: [...gs.slice(0, 6).flatMap((g, i) => [{ key: `group${i + 1}.label`, label: `${dim} ${i + 1}`, value: g.label, display: g.label }, { key: `group${i + 1}.amount`, label: `${g.label}`, value: g.current, display: $(g.current) }]), { key: 'total', label: 'Total', value: tot, display: $(tot) }],
        refs: { dimension: dim }, provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: rows.length, fxRateSetId: FX_RATE_SET.id, eliminations: null, declaredInputs: [FX_RATE_SET.id] },
      }) };
    },
  },
  {
    id: 'getTopMovements', domain: 'analysis', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER', 'VENDOR', 'PROJECT', 'ENTITY'],
    description: 'Largest movers between two months within one dimension across all activity (e.g. which vendors or projects moved most).',
    params: [dimP, P('period'), P('comparisonPeriod', false, 'default prior month'), ...optFilters, { name: 'topN', kind: 'number', required: false, description: 'default 10' }],
    outputs: 'TopMovements; facts mover1.label, mover1.change',
    run(a, env) {
      const r = ANALYSIS.find((t) => t.id === 'getDriverAnalysis')!.run(a, env);
      const k = Number(a['topN'] ?? 10);
      r.object.type = 'TopMovements'; r.object.title = r.object.title.replace('Drivers', 'Top movements');
      r.object.table.rows = r.object.table.rows.filter((x) => x.kind === 'line').slice(0, k);
      r.object.facts = r.object.facts.map((f) => ({ ...f, key: f.key.replace('driver', 'mover') }));
      return r;
    },
  },
  {
    id: 'getTrend', domain: 'analysis', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['ACCOUNT', 'ACCOUNT_GROUP', 'VENDOR', 'PROJECT', 'ENTITY', 'GOVERNED_LEDGER'],
    description: 'Monthly activity trend for a filtered subject across a month range (account, vendor, project, entity). Use for "Siemens spend for FY26" by month.',
    params: [P('periodStart'), P('periodEnd'), ...optFilters], outputs: 'Trend; facts total, <period>, average',
    run(a, env) {
      const f = filterFrom(env, a), ps = env.gl.periods().filter((p) => p >= a['periodStart']! && p <= a['periodEnd']!);
      const rows = env.gl.lines.filter(env.gl.match(f, env.visible)).filter((l) => !a['vendor'] || l.account !== '20100');
      const by = ps.map((p) => ({ p, v: rows.filter((l) => l.period === p).reduce((s, l) => s + l.usd, 0), k: rows.filter((l) => l.period === p).length }));
      const tot = by.reduce((s, x) => s + x.v, 0), subj = [a['account'] ? acctName(env, a['account']) : '', vendorOf(env, a['vendor']) ?? '', a['project'] ?? '', a['entity'] ?? ''].filter(Boolean).join(' · ') || 'All activity';
      const pl = `${periodLabel(ps[0]!)}–${periodLabel(ps.at(-1)!)}`;
      const def = env.gl.definePopulation(f, 'amount_desc', `${subj} ${pl}`);
      const top = env.gl.query(def, env.visible, { limit: 1 }).all.filter((l) => !a['vendor'] || l.account !== '20100')[0];
      return { warnings: a['vendor'] ? [AP_EXTRACT.note] : [], object: base(env, {
        type: 'Trend', title: `${subj} · ${pl}`, periods: ps, periodLabel: pl,
        table: { columns: ['Amount (USD)', 'Lines'], rows: [...by.map((x) => row(periodLabel(x.p), [$(x.v), n(x.k)])), row('Total', [$(tot), n(rows.length)], 0, 'total')] },
        facts: [...by.map((x) => ({ key: x.p, label: periodLabel(x.p), value: x.v, display: $(x.v) })), { key: 'total', label: `Total ${pl}`, value: tot, display: $(tot) }, { key: 'average', label: 'Monthly average', value: tot / ps.length, display: $(tot / ps.length) }, { key: 'lines', label: 'Lines', value: rows.length, display: n(rows.length) }],
        refs: { populationId: def.id, ...(top ? { largestTransaction: top.key } : {}) }, focus: a['vendor'] ? { kind: 'vendor', id: vendorOf(env, a['vendor'])!, name: vendorOf(env, a['vendor'])! } : a['project'] ? { kind: 'project', id: a['project'], name: a['project'] } : a['account'] ? { kind: 'account', id: a['account'], name: acctName(env, a['account']) } : { kind: 'population', id: def.id, name: subj },
        population: { populationId: def.id, rowCount: rows.length, returned: 0, cursor: 0, nextCursor: null, sort: def.sort, exportHook: null },
        provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: rows.length, fxRateSetId: FX_RATE_SET.id, eliminations: null, declaredInputs: [FX_RATE_SET.id, ...(a['vendor'] ? [AP_EXTRACT.id] : [])] },
      }) };
    },
  },
  {
    id: 'getVarianceBridge', domain: 'analysis', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['ACCOUNT', 'ACCOUNT_GROUP', 'FLUX'],
    description: 'Proof bridge for a balance-sheet account or group: opening balance + activity by transaction type + translation effect = closing balance. Use for "show me the proof behind this number".',
    params: [acctP(), P('period'), scopeP], outputs: 'VarianceBridge; facts opening, closing, translation, <type>, difference',
    run(a, env) {
      const code = a['account']!, p = a['period']!, prior = env.gl.priorPeriod(p), v = vis(env, a['scope']);
      if (env.gl.account(code)?.section === 'INCOME_STATEMENT') return unavailable(env, 'VarianceBridge', 'Variance bridge', 'Balance bridge', 'An income-statement line has no opening balance to bridge; use getDriverAnalysis for its movement.');
      const open = prior ? env.gl.balanceUsd([code], prior, v) : 0, close = env.gl.balanceUsd([code], p, v);
      const rows = env.gl.lines.filter(env.gl.match({ accounts: [code], periodStart: p, periodEnd: p, ...(entitiesOf(env, a['scope']) ? { entities: entitiesOf(env, a['scope'])! } : {}) }, env.visible));
      const atClose = (l: GLine) => l.local * FX_CLOSING_SET.toUsd[l.currency]![p]!;
      const byType = env.gl.aggregate(rows, 'description').map((g) => ({ ...g, closing: rows.filter((l) => l.description === g.key).reduce((s, l) => s + atClose(l), 0) }));
      const act = byType.reduce((s, g) => s + g.closing, 0), trans = close - open - act;
      const def = env.gl.definePopulation({ accounts: [code], periodStart: p, periodEnd: p }, 'amount_desc', `${acctName(env, code)} ${periodLabel(p)}`);
      return { warnings: [`Activity is translated at ${FX_CLOSING_SET.id}; the translation effect is the remeasurement of the opening balance to this period's closing rates.`], object: base(env, {
        type: 'VarianceBridge', title: `Proof · ${acctName(env, code)} · ${prior ? periodLabel(prior) : 'opening'} → ${periodLabel(p)}`, scope: scopeOf(env, a['scope']), periods: prior ? [prior, p] : [p], periodLabel: periodLabel(p),
        table: { columns: ['Amount (USD)', 'Lines'], rows: [row(`Opening balance ${prior ? periodLabel(prior) : ''}`, [$(open), ''], 0, 'subtotal'), ...byType.map((g) => row(`+ ${g.key}`, [$(g.closing), n(g.lines)])), row('+ Translation effect on opening balance', [$(trans), '']), row(`= Closing balance ${periodLabel(p)}`, [$(close), n(rows.length)], 0, 'total')] },
        facts: [{ key: 'opening', label: 'Opening balance', value: open, display: $(open) }, { key: 'activity', label: 'Period activity', value: act, display: $(act) }, { key: 'translation', label: 'Translation effect', value: trans, display: $(trans) }, { key: 'closing', label: 'Closing balance', value: close, display: $(close) }, { key: 'lines', label: 'GL lines in the bridge', value: rows.length, display: n(rows.length) }, { key: 'difference', label: 'Unexplained difference', value: 0, display: 'none' }],
        refs: { account: code, period: p, populationId: def.id }, focus: { kind: 'account', id: code, name: acctName(env, code) },
        population: { populationId: def.id, rowCount: rows.length, returned: 0, cursor: 0, nextCursor: null, sort: def.sort, exportHook: null },
        provenance: { source: GL_SRC, snapshotId: SNAPSHOT_ID, journalLines: rows.length, fxRateSetId: FX_CLOSING_SET.id, eliminations: null, declaredInputs: [FX_CLOSING_SET.id] },
      }) };
    },
  },
  {
    id: 'getOutliers', domain: 'analysis', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER', 'ACCOUNT'],
    description: 'Statistical outliers in a month: lines more than 2.5 standard deviations from their account’s mean amount.',
    params: [P('period'), acctP(false), scopeP], outputs: 'Outliers; facts outliers, largest',
    run(a, env) {
      const p = a['period']!, rows = env.gl.lines.filter(env.gl.match(filterFrom(env, a), env.visible));
      const byAcct = new Map<string, GLine[]>(); rows.forEach((l) => byAcct.set(l.account, [...(byAcct.get(l.account) ?? []), l]));
      const out: { l: GLine; z: number }[] = [];
      byAcct.forEach((ls) => { if (ls.length < 6) return; const xs = ls.map((l) => Math.abs(l.usd)), m = xs.reduce((s, x) => s + x, 0) / xs.length, sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); if (sd > 0) ls.forEach((l) => { const z = (Math.abs(l.usd) - m) / sd; if (z >= 2.5) out.push({ l, z }); }); });
      out.sort((x, y) => y.z - x.z);
      return { warnings: [], object: base(env, {
        type: 'Outliers', title: `Outliers · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Account', 'Amount (USD)', 'z-score', 'Description'], rows: out.slice(0, 20).map((o) => row(o.l.key, [o.l.account, $(o.l.usd), o.z.toFixed(1), o.l.description], 1, 'line', `txn:${o.l.key}`)) },
        facts: [{ key: 'outliers', label: 'Outlier lines', value: out.length, display: n(out.length) }, ...(out[0] ? [{ key: 'largest', label: `Largest outlier ${out[0].l.key}`, value: out[0].l.usd, display: $(out[0].l.usd) }] : [])],
        refs: out[0] ? { largestTransaction: out[0].l.key } : {},
      }) };
    },
  },
  {
    id: 'getUnusualActivity', domain: 'analysis', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER'],
    description: 'Rule-based unusual activity in a month: lines ≥ $2M, AP lines missing a required approval reference, capital postings in the last days of the period, lines from unavailable sources.',
    params: [P('period'), scopeP], outputs: 'UnusualActivity; facts flagged, large, missingApproval, lateCapital, unavailableSource',
    run(a, env) {
      const p = a['period']!, rows = env.gl.lines.filter(env.gl.match(filterFrom(env, a), env.visible));
      const rules: [string, (l: GLine) => boolean][] = [['large', (l) => Math.abs(l.usd) >= 2_000_000 && l.account !== '20100'], ['missingApproval', (l) => l.approvalRequired && !l.approvalRef], ['lateCapital', (l) => l.day >= 27 && /Capital|Placed in service/.test(l.description) && l.local > 0], ['unavailableSource', (l) => SOURCE_HEALTH[l.connector]?.status === 'UNAVAILABLE' && Math.abs(l.usd) >= 500_000]];
      const hits = rules.map(([k, fn]) => [k, rows.filter(fn)] as const), flagged = new Set(hits.flatMap(([, ls]) => ls.map((l) => l.key)));
      return { warnings: [AP_EXTRACT.note], object: base(env, {
        type: 'UnusualActivity', title: `Unusual activity · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Rule', 'Account', 'Amount (USD)', 'Description'], rows: hits.flatMap(([k, ls]) => ls.slice(0, 6).map((l) => row(l.key, [k, l.account, $(l.usd), l.description], 1, 'line', `txn:${l.key}`))) },
        facts: [{ key: 'flagged', label: 'Lines flagged', value: flagged.size, display: n(flagged.size) }, ...hits.map(([k, ls]) => ({ key: k, label: k, value: ls.length, display: n(ls.length) }))],
        refs: hits.find(([, ls]) => ls.length)?.[1][0] ? { largestTransaction: hits.find(([, ls]) => ls.length)![1][0]!.key } : {},
      }) };
    },
  },
];

/* ================================================================================================
   FLUX — read only
   ================================================================================================ */
const fluxAcct: ParamSpec = { name: 'account', kind: 'account', required: true, description: 'statement line group code, e.g. 15000' };
function fluxItem(env: ToolEnv, code: string, p: string) { return env.controls.fluxItems(p, env.visible).find((i) => i.account === code) ?? null; }
function fluxList(env: ToolEnv, type: string, title: string, items: ReturnType<ControlService['fluxItems']>, p: string, extra: { key: string; label: string; value: number; display: string }[]): ToolResult {
  return { warnings: [SEEDED], object: base(env, {
    type, title, periods: [p], periodLabel: periodLabel(p),
    table: { columns: ['Prior', 'Current', 'Change', 'Change %', 'Material', 'Explanation status'], rows: items.map((i) => row(i.name, [$(i.priorUsd), $(i.currentUsd), $(i.changeUsd), i.changePct, i.material ? 'Yes' : 'No', i.status], 1, 'line', `flux:${i.account}:${p}`)) },
    facts: [...extra, ...items.slice(0, 8).flatMap((i, k) => [{ key: `item${k + 1}.name`, label: `Item ${k + 1}`, value: i.name, display: i.name }, { key: `item${k + 1}.change`, label: `${i.name} change`, value: i.changeUsd, display: $(i.changeUsd) }])],
    refs: { period: p, ...(items[0] ? { largestAccount: items[0].account } : {}) }, provenance: { source: `${GL_SRC}; explanations: seeded workflow store`, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: FX_CLOSING_SET.id, eliminations: null, declaredInputs: [FX_CLOSING_SET.id, FX_RATE_SET.id] },
  }) };
}
const MATERIALITY = 'material = |change| ≥ $1.0M, or ≥ $0.25M and ≥ 10%';
const FLUX: SloaneTool[] = [
  {
    id: 'getFluxSummary', domain: 'flux', permission: 'FLUX_VIEW', risk: 'READ', objectTypes: ['FLUX'],
    description: `Flux review for a month vs prior: every line with change, materiality (${MATERIALITY}) and explanation status, with counts.`,
    params: [P('period')], outputs: 'FluxSummary; facts lines, material, unexplained, approved, submitted, draft',
    run(a, env) {
      const p = a['period']!, it = env.controls.fluxItems(p, env.visible), m = it.filter((i) => i.material), c = (s: string) => m.filter((i) => i.status === s).length;
      return fluxList(env, 'FluxSummary', `Flux review · ${periodLabel(p)}`, it, p, [{ key: 'lines', label: 'Lines', value: it.length, display: n(it.length) }, { key: 'material', label: 'Material items', value: m.length, display: n(m.length) }, ...['UNEXPLAINED', 'DRAFT', 'SUBMITTED', 'APPROVED'].map((s) => ({ key: s.toLowerCase(), label: `Material · ${s.toLowerCase()}`, value: c(s), display: n(c(s)) }))]);
    },
  },
  { id: 'getMaterialFluxItems', domain: 'flux', permission: 'FLUX_VIEW', risk: 'READ', objectTypes: ['FLUX'], description: `Only the material flux items for a month (${MATERIALITY}).`, params: [P('period')], outputs: 'FluxItems; facts material',
    run(a, env) { const p = a['period']!, m = env.controls.fluxItems(p, env.visible).filter((i) => i.material); return fluxList(env, 'FluxItems', `Material flux items · ${periodLabel(p)}`, m, p, [{ key: 'material', label: 'Material items', value: m.length, display: n(m.length) }]); } },
  { id: 'getUnexplainedFluxItems', domain: 'flux', permission: 'FLUX_VIEW', risk: 'READ', objectTypes: ['FLUX'], description: 'Material flux items for a month with no explanation, or an explanation not yet approved. Use for "which flux items are unexplained?".', params: [P('period')], outputs: 'FluxItems; facts unexplained, notApproved',
    run(a, env) { const p = a['period']!, m = env.controls.fluxItems(p, env.visible).filter((i) => i.material && i.status !== 'APPROVED'), u = m.filter((i) => i.status === 'UNEXPLAINED').length; return fluxList(env, 'FluxItems', `Unexplained flux items · ${periodLabel(p)}`, m, p, [{ key: 'unexplained', label: 'No explanation', value: u, display: n(u) }, { key: 'notApproved', label: 'Explanation not approved', value: m.length - u, display: n(m.length - u) }]); } },
  { id: 'getFluxStatus', domain: 'flux', permission: 'FLUX_VIEW', risk: 'READ', objectTypes: ['FLUX'], description: 'Flux review completion status for a month: material items by explanation status.', params: [P('period')], outputs: 'FluxStatus; facts material, approved, pctApproved',
    run(a, env) { const p = a['period']!, m = env.controls.fluxItems(p, env.visible).filter((i) => i.material), ok = m.filter((i) => i.status === 'APPROVED').length, pc = m.length ? `${Math.round((ok / m.length) * 100)}%` : '100%';
      const r = fluxList(env, 'FluxStatus', `Flux status · ${periodLabel(p)}`, m, p, [{ key: 'material', label: 'Material items', value: m.length, display: n(m.length) }, { key: 'approved', label: 'Approved', value: ok, display: n(ok) }, { key: 'pctApproved', label: 'Share approved', value: pc, display: pc } as never]); return r; } },
  { id: 'getFluxItem', domain: 'flux', permission: 'FLUX_VIEW', risk: 'READ', objectTypes: ['FLUX', 'ACCOUNT_GROUP'], description: 'One flux line (account group) for a month: values, change, materiality, explanation status.', params: [fluxAcct, P('period')], outputs: 'FluxItem; facts current, prior, change, status',
    run(a, env) { const p = a['period']!, i = fluxItem(env, a['account']!, p); if (!i) return unavailable(env, 'FluxItem', 'Flux item', 'Flux item', `${a['account']} is not a flux line in ${periodLabel(p)}.`);
      const r = fluxList(env, 'FluxItem', `Flux · ${i.name} · ${periodLabel(p)}`, [i], p, [{ key: 'current', label: 'Current', value: i.currentUsd, display: $(i.currentUsd) }, { key: 'prior', label: 'Prior', value: i.priorUsd, display: $(i.priorUsd) }, { key: 'change', label: 'Change', value: i.changeUsd, display: $(i.changeUsd) }, { key: 'status', label: 'Explanation status', value: i.status, display: i.status } as never]);
      r.object.focus = { kind: 'fluxItem', id: i.id, name: i.name }; r.object.refs = { ...r.object.refs, account: i.account }; return r; } },
  { id: 'getFluxExplanation', domain: 'flux', permission: 'FLUX_VIEW', risk: 'READ', objectTypes: ['FLUX'], description: 'The explanation recorded on a flux line: text, author, reviewer, version, status.', params: [fluxAcct, P('period')], outputs: 'FluxExplanation; facts status, author, reviewer, text',
    run(a, env) { const p = a['period']!, i = fluxItem(env, a['account']!, p);
      if (!i?.explanation) return unavailable(env, 'FluxExplanation', 'Flux explanation', 'Explanation', `No explanation has been recorded for ${i?.name ?? a['account']} in ${periodLabel(p)}${i?.material ? ' although the movement is material' : ''}.`);
      const e = i.explanation;
      return { warnings: [SEEDED], object: base(env, { type: 'FluxExplanation', title: `Explanation · ${i.name} · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Value'], rows: [row('Status', [e.status]), row('Version', [`v${e.version}`]), row('Author', [e.author]), row('Reviewer', [e.reviewer]), row('Explanation', [e.text]), row('Movement', [$(i.changeUsd)])] },
        facts: [{ key: 'status', label: 'Status', value: e.status, display: e.status }, { key: 'author', label: 'Author', value: e.author, display: e.author }, { key: 'reviewer', label: 'Reviewer', value: e.reviewer, display: e.reviewer }, { key: 'text', label: 'Explanation text', value: e.text, display: e.text }, { key: 'change', label: 'Change', value: i.changeUsd, display: $(i.changeUsd) },
          { key: 'explanationId', label: 'Explanation record', value: e.id, display: e.id }, { key: 'version', label: 'Explanation version', value: e.version, display: `v${e.version}` }, { key: 'updatedBy', label: 'Last changed by', value: e.updatedBy ?? e.author, display: `${e.updatedBy ?? e.author}${e.updatedAt ? ` · ${e.updatedAt.slice(0, 16).replace('T', ' ')}` : ''}` }],
        refs: { account: i.account, explanationId: e.id, explanationVersion: String(e.version) }, focus: { kind: 'fluxItem', id: i.id, name: i.name } }) }; } },
  { id: 'getFluxComments', domain: 'flux', permission: 'FLUX_VIEW', risk: 'READ', objectTypes: ['FLUX'], description: 'Comments on a flux line’s explanation (read only).', params: [fluxAcct, P('period')], outputs: 'FluxComments; facts comments, latest',
    run(a, env) { const p = a['period']!, i = fluxItem(env, a['account']!, p), cs = i?.comments ?? [];
      return { warnings: [SEEDED], object: base(env, { type: 'FluxComments', title: `Comments · ${i?.name ?? a['account']} · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Date', 'Comment', 'Version'], rows: cs.map((c) => row(`${c.author}${c.via ? ` via ${c.via}` : ''}`, [c.at, c.text, `v${c.version}`], 1, 'line', `comment:${c.id}`)) },
        facts: [{ key: 'comments', label: 'Comments', value: cs.length, display: n(cs.length) }, ...(cs.at(-1) ? [{ key: 'latest', label: `Latest comment by ${cs.at(-1)!.author}`, value: cs.at(-1)!.text, display: cs.at(-1)!.text }] : [])], refs: { account: a['account']!, ...(cs.at(-1) ? { commentId: cs.at(-1)!.id } : {}) } }) }; } },
  { id: 'getFluxSupport', domain: 'flux', permission: 'FLUX_VIEW', risk: 'READ', objectTypes: ['FLUX', 'EVIDENCE'], description: 'Support references linked to a flux explanation (workpaper/memo references; documents are not connected).', params: [fluxAcct, P('period')], outputs: 'FluxSupport; facts references',
    run(a, env) { const p = a['period']!, i = fluxItem(env, a['account']!, p), rs = i?.explanation?.supportRefs ?? [];
      return { warnings: ['Documents are not connected; Korvyn holds references only.'], object: base(env, { type: 'FluxSupport', title: `Support · ${i?.name ?? a['account']} · ${periodLabel(p)}`, status: rs.length ? 'PARTIAL' : 'AVAILABLE', periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Kind', 'Status'], rows: rs.map((r) => row(r, [r.startsWith('MEMO') ? 'Memo' : 'Workpaper', 'Reference only — document not connected'])) },
        facts: [{ key: 'references', label: 'Support references', value: rs.length, display: n(rs.length) }], refs: { account: a['account']! } }) }; } },
];

/* ================================================================================================
   RECONCILIATIONS — read only
   ================================================================================================ */
type Rec = ReturnType<ControlService['reconcile']>;
const recP: ParamSpec = { name: 'reconciliationId', kind: 'reconciliationId', required: true, description: 'reconciliation id, e.g. REC-MDH-15000' };
const recRow = (r: Rec) => row(r.name, [r.entity, r.method, $(r.glBalanceUsd), r.comparisonUsd === null ? 'not connected' : $(r.comparisonUsd), r.tieStatus === 'SOURCE_NOT_CONNECTED' ? '—' : $(r.differenceUsd ?? 0), r.tieStatus, r.supportComplete ? 'Complete' : 'Missing', r.workflow.status], 1, 'line', `recon:${r.id}`);
function recList(env: ToolEnv, type: string, title: string, rs: Rec[], p: string, extra: { key: string; label: string; value: number; display: string }[], warn: string[] = []): ToolResult {
  return { warnings: [SEEDED, ...warn], object: base(env, {
    type, title, periods: [p], periodLabel: periodLabel(p),
    table: { columns: ['Entity', 'Method', 'GL balance', 'Comparison', 'Difference', 'Tie status', 'Support', 'Review'], rows: rs.map(recRow) },
    facts: [...extra, ...rs.slice(0, 8).flatMap((r, i) => [{ key: `rec${i + 1}.name`, label: `Reconciliation ${i + 1}`, value: r.name, display: r.name }, { key: `rec${i + 1}.status`, label: `${r.name} tie status`, value: r.tieStatus, display: r.tieStatus } as never])],
    refs: { period: p, ...(rs[0] ? { reconciliationId: rs[0].id } : {}) }, focus: rs.length === 1 ? { kind: 'reconciliation', id: rs[0]!.id, name: rs[0]!.name } : null,
    provenance: { source: `${GL_SRC}; workflow: seeded store`, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: FX_CLOSING_SET.id, eliminations: null, declaredInputs: [FX_CLOSING_SET.id] },
  }) };
}
function oneRec(env: ToolEnv, a: ToolArgs): Rec { return env.controls.reconcile(env.controls.recDef(a['reconciliationId']!)!, a['period']!); }
const RECON: SloaneTool[] = [
  { id: 'getReconciliationSummary', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION'], description: 'Every reconciliation for a month with tie, support and review status, plus counts.', params: [P('period')],
    outputs: 'ReconciliationSummary; facts total, tied, notTied, sourceNotConnected, missingSupport, inReview, approved',
    run(a, env) { const p = a['period']!, rs = env.controls.reconciliations(p, env.visible), c = (f: (r: Rec) => boolean) => rs.filter(f).length;
      return recList(env, 'ReconciliationSummary', `Reconciliations · ${periodLabel(p)}`, rs, p, [['total', 'Reconciliations', rs.length], ['tied', 'Tied', c((r) => r.tieStatus === 'TIED')], ['notTied', 'Not tied', c((r) => r.tieStatus === 'NOT_TIED')], ['sourceNotConnected', 'Cannot be proven — source not connected', c((r) => r.tieStatus === 'SOURCE_NOT_CONNECTED')], ['missingSupport', 'Missing support', c((r) => !r.supportComplete)], ['inReview', 'In review', c((r) => r.workflow.status === 'IN_REVIEW')], ['approved', 'Approved', c((r) => r.workflow.status === 'APPROVED')]].map(([k, l, v]) => ({ key: k as string, label: l as string, value: v as number, display: n(v as number) }))); } },
  { id: 'getReconciliationsNotTied', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION'], description: 'Reconciliations for a month that do not tie (difference beyond tolerance), and separately those that cannot be proven because a source is not connected. Use for "which recs don\'t tie?".', params: [P('period')],
    outputs: 'ReconciliationList; facts notTied, sourceNotConnected, totalDifference',
    run(a, env) { const p = a['period']!, all = env.controls.reconciliations(p, env.visible), nt = all.filter((r) => r.tieStatus === 'NOT_TIED'), sc = all.filter((r) => r.tieStatus === 'SOURCE_NOT_CONNECTED'), d = nt.reduce((s, r) => s + r.items.reduce((x, i) => x + Math.abs(i.amountUsd), 0), 0);
      return recList(env, 'ReconciliationList', `Reconciliations not tied · ${periodLabel(p)}`, [...nt, ...sc], p, [{ key: 'notTied', label: 'Do not tie', value: nt.length, display: n(nt.length) }, { key: 'sourceNotConnected', label: 'Cannot be proven (source not connected)', value: sc.length, display: n(sc.length) }, { key: 'totalDifference', label: 'Gross unreconciled difference', value: d, display: $(d) }]); } },
  { id: 'getReconciliationsMissingSupport', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION', 'EVIDENCE'], description: 'Reconciliations for a month with a required support item missing, naming the missing item.', params: [P('period')], outputs: 'ReconciliationList; facts missingSupport, missingItems',
    run(a, env) { const p = a['period']!, rs = env.controls.reconciliations(p, env.visible).filter((r) => !r.supportComplete), items = rs.reduce((s, r) => s + r.support.filter((x) => x.status === 'MISSING').length, 0);
      const r = recList(env, 'ReconciliationList', `Reconciliations missing support · ${periodLabel(p)}`, rs, p, [{ key: 'missingSupport', label: 'Reconciliations missing support', value: rs.length, display: n(rs.length) }, { key: 'missingItems', label: 'Missing support items', value: items, display: n(items) }]);
      r.object.table.columns = [...r.object.table.columns, 'Missing'];
      r.object.table.rows.forEach((row, i) => row.cells.push(rs[i]!.support.filter((x) => x.status === 'MISSING').map((x) => x.requirement).join('; ')));
      return r; } },
  { id: 'getReconciliationsPendingReview', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION'], description: 'Reconciliations for a month submitted and awaiting reviewer sign-off, or returned by the reviewer.', params: [P('period')], outputs: 'ReconciliationList; facts inReview, returned',
    run(a, env) { const p = a['period']!, rs = env.controls.reconciliations(p, env.visible).filter((r) => r.workflow.status === 'IN_REVIEW' || r.workflow.status === 'RETURNED');
      return recList(env, 'ReconciliationList', `Reconciliations pending review · ${periodLabel(p)}`, rs, p, [{ key: 'inReview', label: 'In review', value: rs.filter((r) => r.workflow.status === 'IN_REVIEW').length, display: n(rs.filter((r) => r.workflow.status === 'IN_REVIEW').length) }, { key: 'returned', label: 'Returned', value: rs.filter((r) => r.workflow.status === 'RETURNED').length, display: n(rs.filter((r) => r.workflow.status === 'RETURNED').length) }]); } },
  { id: 'getReconciliationsForAccount', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION', 'ACCOUNT', 'ACCOUNT_GROUP'], description: 'The reconciliations of one account or account group (e.g. CIP 15000) across every entity, with GL balance, reconciled balance, difference, tie status, support and review status. Use for "does the reconciliation support it".', params: [acctP(), P('period')],
    outputs: 'ReconciliationList; facts reconciliations, tied, notTied, missingSupport, reconciledGlBalance; refs reconciliationId',
    run(a, env) { const p = a['period']!, code = a['account']!, acc = new Set(env.gl.expandAccounts([code]).concat(code));
      const rs = env.controls.reconciliations(p, env.visible).filter((r) => r.accounts.some((x) => acc.has(x) || env.gl.expandAccounts([x]).some((y) => acc.has(y))));
      if (!rs.length) return unavailable(env, 'ReconciliationList', `Reconciliations of ${acctName(env, code)}`, 'Reconciliation definition', `No reconciliation is defined for ${acctName(env, code)}.`);
      const bal = rs.reduce((s, r) => s + r.glBalanceUsd, 0), c = (f: (r: Rec) => boolean) => rs.filter(f).length;
      const r = recList(env, 'ReconciliationList', `Reconciliations of ${acctName(env, code)} · ${periodLabel(p)}`, rs, p, [{ key: 'reconciliations', label: 'Reconciliations', value: rs.length, display: n(rs.length) }, { key: 'tied', label: 'Tied', value: c((x) => x.tieStatus === 'TIED'), display: n(c((x) => x.tieStatus === 'TIED')) }, { key: 'notTied', label: 'Not tied', value: c((x) => x.tieStatus !== 'TIED'), display: n(c((x) => x.tieStatus !== 'TIED')) }, { key: 'approved', label: 'Review approved', value: c((x) => x.workflow.status === 'APPROVED'), display: n(c((x) => x.workflow.status === 'APPROVED')) }, { key: 'missingSupport', label: 'Missing required support', value: c((x) => !x.supportComplete), display: n(c((x) => !x.supportComplete)) }, { key: 'reconciledGlBalance', label: 'GL balance covered by these reconciliations', value: bal, display: $(bal) }]);
      r.object.refs.account = code; r.object.focus = { kind: 'account', id: code, name: acctName(env, code) }; return r; } },
  { id: 'getReconciliation', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION'], description: 'One reconciliation for a month: method, opening, GL balance, comparison balance, difference, reconciling items, workflow and support.', params: [recP, P('period')],
    outputs: 'Reconciliation; facts glBalance, comparison, difference, tieStatus, reviewStatus, missingSupport',
    run(a, env) { const r = oneRec(env, a), p = a['period']!;
      /* the versioned server balance — the same record the Reconciliations workspace and the Artifact Engine cite */
      const bal = env.controls.reconBalance(env.controls.recDef(a['reconciliationId']!)!, p);
      const balFacts = bal.available ? [{ key: 'balanceVersion', label: 'Balance record', value: `${bal.id} v${bal.version}`, display: `${bal.id} v${bal.version}` }, ...(bal.supportingBalanceUsd !== null ? [{ key: 'supportingBalance', label: bal.supportingLabel, value: bal.supportingBalanceUsd, display: $(bal.supportingBalanceUsd) }] : [])] : [{ key: 'balanceAvailability', label: 'Server balance', value: 'not modelled', display: bal.reason }];
      return { warnings: [SEEDED, ...r.sourceIssues], object: base(env, { type: 'Reconciliation', title: `${r.name} · ${periodLabel(p)}`, scope: scopeOf(env, r.entity), periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Value'], rows: [row('Method', [r.method]), row('Opening balance', [$(r.openingUsd)]), row('GL balance', [$(r.glBalanceUsd)]), row(r.comparisonLabel, [r.comparisonUsd === null ? 'not connected' : $(r.comparisonUsd)]), ...r.items.map((i) => row(`Reconciling item · ${i.label}`, [$(i.amountUsd)])), row('Difference', [r.tieStatus === 'SOURCE_NOT_CONNECTED' ? 'cannot be computed' : $(r.differenceUsd ?? 0)], 0, 'total'), row('Tie status', [r.tieStatus]), row('Review', [`${r.workflow.status} · preparer ${r.workflow.preparer} · reviewer ${r.workflow.reviewer}`]), ...r.support.map((s) => row(`Support · ${s.requirement}`, [s.reference ?? 'MISSING']))] },
        facts: [{ key: 'glBalance', label: 'GL balance', value: r.glBalanceUsd, display: $(r.glBalanceUsd) }, ...(r.comparisonUsd !== null ? [{ key: 'comparison', label: r.comparisonLabel, value: r.comparisonUsd, display: $(r.comparisonUsd) }] : []), { key: 'difference', label: 'Difference', value: r.differenceUsd ?? 0, display: r.tieStatus === 'SOURCE_NOT_CONNECTED' ? 'cannot be computed' : $(r.differenceUsd ?? 0) }, { key: 'tieStatus', label: 'Tie status', value: r.tieStatus, display: r.tieStatus }, { key: 'reviewStatus', label: 'Review status', value: r.workflow.status, display: r.workflow.status }, { key: 'missingSupport', label: 'Missing support items', value: r.support.filter((s) => s.status === 'MISSING').length, display: n(r.support.filter((s) => s.status === 'MISSING').length) }, { key: 'reconcilingItems', label: 'Reconciling items', value: r.items.length, display: n(r.items.length) }, ...balFacts],
        refs: { reconciliationId: r.id, ...(bal.available ? { reconBalanceId: bal.id, reconBalanceVersion: String(bal.version) } : {}), ...(r.accounts[0] ? { account: r.accounts[0] } : {}), ...(r.financialLineId ? { financialLineId: r.financialLineId } : {}), entity: r.entity }, focus: { kind: 'reconciliation', id: r.id, name: r.name },
        provenance: { source: `${r.balanceInModule ? 'Reconciliations module (balances)' : GL_SRC}; workflow: Korvyn work store`, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: FX_CLOSING_SET.id, eliminations: null, declaredInputs: [FX_CLOSING_SET.id] } }) }; } },
  { id: 'getReconciliationStatus', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION'], description: 'Tie, support and review status of one reconciliation.', params: [recP, P('period')], outputs: 'ReconciliationStatus; facts tieStatus, reviewStatus, supportComplete',
    run(a, env) { const r = oneRec(env, a); return recList(env, 'ReconciliationStatus', `Status · ${r.name}`, [r], a['period']!, [{ key: 'tieStatus', label: 'Tie status', value: 0, display: r.tieStatus }, { key: 'reviewStatus', label: 'Review status', value: 0, display: r.workflow.status }, { key: 'supportComplete', label: 'Support', value: 0, display: r.supportComplete ? 'complete' : 'missing' }], r.sourceIssues); } },
  { id: 'getReconcilingItems', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION'], description: 'The reconciling items on one reconciliation (e.g. intercompany differences by counterparty). Use for "show me the reconciling items".', params: [recP, P('period')], outputs: 'ReconcilingItems; facts items, gross',
    run(a, env) { const r = oneRec(env, a), p = a['period']!, g = r.items.reduce((s, i) => s + Math.abs(i.amountUsd), 0);
      return { warnings: r.sourceIssues, object: base(env, { type: 'ReconcilingItems', title: `Reconciling items · ${r.name} · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Kind', 'Amount (USD)'], rows: r.items.map((i) => row(i.label, [i.kind, $(i.amountUsd)], 1, 'line', `reconItem:${i.id}`)) },
        facts: [{ key: 'items', label: 'Reconciling items', value: r.items.length, display: n(r.items.length) }, { key: 'gross', label: 'Gross amount', value: g, display: $(g) }, ...r.items.slice(0, 5).map((i, k) => ({ key: `item${k + 1}`, label: i.label, value: i.amountUsd, display: $(i.amountUsd) }))],
        refs: { reconciliationId: r.id }, focus: { kind: 'reconciliation', id: r.id, name: r.name } }) }; } },
  { id: 'getReconciliationComments', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION'], description: 'Preparer and reviewer comments on one reconciliation (read only).', params: [recP, P('period')], outputs: 'ReconciliationComments; facts comments, latest',
    run(a, env) { const r = oneRec(env, a), cs = r.workflow.comments;
      return { warnings: [SEEDED], object: base(env, { type: 'ReconciliationComments', title: `Comments · ${r.name}`, periods: [a['period']!], periodLabel: periodLabel(a['period']!), table: { columns: ['Date', 'Comment', 'Version'], rows: cs.map((c) => row(`${c.author}${c.via ? ` via ${c.via}` : ''}`, [c.at, c.text, `v${c.version}`], 1, 'line', `comment:${c.id}`)) },
        facts: [{ key: 'comments', label: 'Comments', value: cs.length, display: n(cs.length) }, ...(cs.at(-1) ? [{ key: 'latest', label: `Latest by ${cs.at(-1)!.author}`, value: cs.at(-1)!.text, display: cs.at(-1)!.text }] : [])], refs: { reconciliationId: r.id, ...(cs.at(-1) ? { commentId: cs.at(-1)!.id } : {}) }, focus: { kind: 'reconciliation', id: r.id, name: r.name } }) }; } },
  { id: 'getReconciliationSupport', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION', 'EVIDENCE'], description: 'Required support for one reconciliation and what is attached (references only) or missing.', params: [recP, P('period')], outputs: 'ReconciliationSupport; facts required, attached, missing',
    run(a, env) { const r = oneRec(env, a), at = r.support.filter((s) => s.status !== 'MISSING').length;
      return { warnings: ['Documents are not connected; attached support is a workpaper reference with metadata only.'], object: base(env, { type: 'ReconciliationSupport', title: `Support · ${r.name}`, periods: [a['period']!], periodLabel: periodLabel(a['period']!),
        table: { columns: ['Kind', 'Reference', 'Status'], rows: [...r.support.map((s) => row(s.requirement, [s.kind, s.reference ?? '—', s.status])), ...r.attachedEvidence.map((e) => row(`Attached · ${e.label}`, [e.kind, e.from, `${e.type} · ${e.createdBy} via ${e.via}`]))] },
        facts: [{ key: 'required', label: 'Required support items', value: r.support.length, display: n(r.support.length) }, { key: 'attached', label: 'Attached (reference)', value: at, display: n(at) }, { key: 'missing', label: 'Missing', value: r.support.length - at, display: n(r.support.length - at) }, { key: 'attachedEvidence', label: 'Additional evidence attached', value: r.attachedEvidence.length, display: n(r.attachedEvidence.length) }, ...r.support.filter((s) => s.status === 'MISSING').map((s, k) => ({ key: `missing${k + 1}`, label: 'Missing item', value: s.requirement, display: s.requirement }))],
        refs: { reconciliationId: r.id }, focus: { kind: 'reconciliation', id: r.id, name: r.name } }) }; } },
  { id: 'getReconciliationPopulation', domain: 'recon', permission: 'RECON_VIEW', risk: 'READ', objectTypes: ['RECONCILIATION', 'GOVERNED_LEDGER'], description: 'The governed GL population behind one reconciliation’s account for the month (population id and first page).', params: [recP, P('period')], outputs: 'GovernedPopulation; refs populationId',
    run(a, env) { const d = env.controls.recDef(a['reconciliationId']!)!;
      if (d.method === 'MODULE') return unavailable(env, 'GovernedPopulation', `GL behind ${d.name}`, 'Reconciliations module population', `${d.name}'s population is resolved by the Reconciliations module over ${d.financialLineId ?? 'its statement line'}; the server book does not model that line.`);
      const r = populationObject(env, 'GovernedPopulation', `GL behind ${d.name} · ${periodLabel(a['period']!)}`, { accounts: d.accounts, entities: [d.entity], periodStart: a['period']!, periodEnd: a['period']! }, a); r.object.refs.reconciliationId = d.id; return r; } },
];

/* ================================================================================================
   CLOSE
   ================================================================================================ */
const CLOSE: SloaneTool[] = [
  { id: 'getCloseReadiness', domain: 'close', permission: 'CLOSE_VIEW', risk: 'READ', objectTypes: ['CLOSE'], description: 'Close readiness for a month: % ready from tasks, reconciliations and material flux, with blocker count.', params: [P('period')], outputs: 'CloseReadiness; facts readinessPct, blockers, tasks, reconciliations, flux',
    run(a, env) { const p = a['period']!, r = env.controls.closeReadiness(p, env.visible);
      return { warnings: [SEEDED], object: base(env, { type: 'CloseReadiness', title: `Close readiness · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Complete', 'Total'], rows: r.parts.map((x) => row(x.l, [n(x.n), n(x.d)])) },
        facts: [{ key: 'readinessPct', label: 'Readiness', value: `${r.readinessPct}%`, display: `${r.readinessPct}%` }, { key: 'blockers', label: 'Blockers', value: r.blockers.length, display: n(r.blockers.length) }, ...r.parts.map((x, i) => ({ key: ['tasks', 'reconciliations', 'flux'][i]!, label: x.l, value: `${x.n} of ${x.d}`, display: `${x.n} of ${x.d}` }))],
        refs: { period: p }, focus: { kind: 'close', id: `close:${p}`, name: `${periodLabel(p)} close` } }) }; } },
  { id: 'getCloseBlockers', domain: 'close', permission: 'CLOSE_VIEW', risk: 'READ', objectTypes: ['CLOSE'], description: 'Everything blocking a month’s close, ranked: reconciliations not tied, unexplained material flux, blocked tasks, unavailable sources, returned reviews. Use for "what is blocking close?".', params: [P('period')], outputs: 'CloseBlockers; facts blockers, blocking, blocker1 …',
    run(a, env) { const p = a['period']!, b = env.controls.closeBlockers(p, env.visible);
      return { warnings: [SEEDED], object: base(env, { type: 'CloseBlockers', title: `What is blocking the ${periodLabel(p)} close`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Severity', 'Kind', 'Entity', 'Amount (USD)'], rows: b.map((x) => row(x.label, [x.severity, x.kind, x.entity, x.amountUsd === null ? '—' : $(x.amountUsd)], 1, 'line', x.ref)) },
        facts: [{ key: 'blockers', label: 'Blockers', value: b.length, display: n(b.length) }, { key: 'blocking', label: 'Blocking severity', value: b.filter((x) => x.severity === 'BLOCKING').length, display: n(b.filter((x) => x.severity === 'BLOCKING').length) }, ...b.slice(0, 6).map((x, i) => ({ key: `blocker${i + 1}`, label: x.kind, value: x.label, display: x.label })), ...b.slice(0, 6).filter((x) => x.amountUsd !== null).map((x) => ({ key: `amount.${x.ref}`, label: `${x.label} amount`, value: x.amountUsd!, display: $(x.amountUsd!) }))],
        refs: { period: p }, focus: { kind: 'close', id: `close:${p}`, name: `${periodLabel(p)} close` } }) }; } },
  { id: 'getCloseTasks', domain: 'close', permission: 'CLOSE_VIEW', risk: 'READ', objectTypes: ['CLOSE'], description: 'Close checklist tasks for a month, optionally filtered by status (COMPLETE, IN_PROGRESS, NOT_STARTED, BLOCKED, AWAITING_APPROVAL), entity or workstream.', params: [P('period'), { name: 'status', kind: 'text', required: false, description: 'task status' }, { name: 'entity', kind: 'entity', required: false, description: 'entity id' }, { name: 'workstream', kind: 'text', required: false, description: 'workstream name' }], outputs: 'CloseTasks; facts tasks, complete, blocked',
    run(a, env) { const p = a['period']!, ts = env.controls.closeTasks(p, env.visible).filter((t) => (!a['status'] || t.status === a['status']) && (!a['entity'] || t.entity === a['entity']) && (!a['workstream'] || t.workstream.toLowerCase().includes(a['workstream'].toLowerCase())));
      /* open work first; the checklist is bounded to 50 rows on screen, with the full count in the facts */
      const rank: Record<string, number> = { BLOCKED: 0, IN_PROGRESS: 1, NOT_STARTED: 2, AWAITING_APPROVAL: 3, COMPLETE: 4 };
      const shown = ts.slice().sort((x, y) => (rank[x.status] ?? 5) - (rank[y.status] ?? 5)).slice(0, 50);
      return { warnings: [SEEDED, ...(ts.length > shown.length ? [`Showing ${shown.length} of ${ts.length} tasks, open work first.`] : [])], object: base(env, { type: 'CloseTasks', title: `Close tasks · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Workstream', 'Entity', 'Owner', 'Due', 'Status'], rows: shown.map((t) => row(t.name, [t.workstream, (t as { entityName?: string }).entityName ?? t.entity, t.owner, t.due, t.status + (t.blockedBy ? ` — ${t.blockedBy}` : '')], 1, 'line', `task:${t.id}`)) },
        facts: [{ key: 'tasks', label: 'Tasks', value: ts.length, display: n(ts.length) }, { key: 'complete', label: 'Complete', value: ts.filter((t) => t.status === 'COMPLETE').length, display: n(ts.filter((t) => t.status === 'COMPLETE').length) }, { key: 'blocked', label: 'Blocked', value: ts.filter((t) => t.status === 'BLOCKED').length, display: n(ts.filter((t) => t.status === 'BLOCKED').length) }], refs: { period: p } }) }; } },
  { id: 'getCloseExceptions', domain: 'close', permission: 'CLOSE_VIEW', risk: 'READ', objectTypes: ['CLOSE'], description: 'Close exceptions for a month: intercompany mismatches, AP approvals missing, late capital postings, stale or unavailable sources.', params: [P('period')], outputs: 'CloseExceptions; facts exceptions',
    run(a, env) { const p = a['period']!, s = env.controls.continuousCloseSignals(p, env.visible);
      return { warnings: [AP_EXTRACT.note], object: base(env, { type: 'CloseExceptions', title: `Close exceptions · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Reference', 'Detail', 'Amount (USD)'], rows: s.map((x) => row(x.signal, [x.ref, x.detail, x.amountUsd === null ? '—' : $(x.amountUsd)])) },
        facts: [{ key: 'exceptions', label: 'Exceptions', value: s.length, display: n(s.length) }, ...s.slice(0, 6).map((x, i) => ({ key: `exception${i + 1}`, label: x.signal, value: x.detail, display: x.detail }))], refs: { period: p } }) }; } },
  { id: 'getPendingApprovals', domain: 'close', permission: 'CLOSE_VIEW', risk: 'READ', objectTypes: ['CLOSE'], description: 'Items awaiting an approver for a month: reconciliations in review, submitted flux explanations, tasks awaiting approval. Use for "what needs my attention".', params: [P('period')], outputs: 'PendingApprovals; facts pending',
    run(a, env) { const p = a['period']!, x = env.controls.pendingApprovals(p, env.visible);
      return { warnings: [SEEDED], object: base(env, { type: 'PendingApprovals', title: `Pending approvals · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Kind', 'Approver', 'Entity'], rows: x.map((i) => row(i.label, [i.kind, i.approver, i.entity], 1, 'line', i.ref)) },
        facts: [{ key: 'pending', label: 'Pending approvals', value: x.length, display: n(x.length) }, ...x.slice(0, 6).map((i, k) => ({ key: `pending${k + 1}`, label: i.kind, value: i.label, display: i.label }))], refs: { period: p } }) }; } },
  { id: 'getCloseByEntity', domain: 'close', permission: 'CLOSE_VIEW', risk: 'READ', objectTypes: ['CLOSE', 'ENTITY'], description: 'Close progress per entity for a month: tasks complete, reconciliations tied and approved, blockers. Use for "which entities are behind?".', params: [P('period')], outputs: 'CloseByEntity; facts behind, entity rows',
    run(a, env) { const p = a['period']!, ts = env.controls.closeTasks(p, env.visible), rs = env.controls.reconciliations(p, env.visible), bs = env.controls.closeBlockers(p, env.visible);
      const ents = env.gl.entities().filter((e) => env.visible === 'ALL' || env.visible.has(e.id));
      const rows = ents.map((e) => { const t = ts.filter((x) => x.entity === e.id), r = rs.filter((x) => x.entity === e.id), b = bs.filter((x) => x.entity === e.id); const done = t.filter((x) => x.status === 'COMPLETE').length + r.filter((x) => x.tieStatus === 'TIED' && x.workflow.status === 'APPROVED').length, tot = t.length + r.length; return { e, done, tot, b: b.length, pc: tot ? Math.round((done / tot) * 100) : 100 }; }).sort((x, y) => x.pc - y.pc);
      const behind = rows.filter((r) => r.b > 0 || r.pc < 50);
      return { warnings: [SEEDED], object: base(env, { type: 'CloseByEntity', title: `Close by entity · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Complete', 'Items', '% complete', 'Blockers'], rows: rows.map((r) => row(r.e.name, [n(r.done), n(r.tot), `${r.pc}%`, n(r.b)], 1, 'line', `entity:${r.e.id}`)) },
        facts: [{ key: 'behind', label: 'Entities behind', value: behind.length, display: n(behind.length) }, ...rows.slice(0, 6).map((r) => ({ key: `entity.${r.e.id}`, label: `${r.e.name} complete`, value: `${r.pc}%`, display: `${r.pc}%` }))], refs: { period: p } }) }; } },
  { id: 'getCloseByWorkstream', domain: 'close', permission: 'CLOSE_VIEW', risk: 'READ', objectTypes: ['CLOSE'], description: 'Close checklist progress per workstream for a month.', params: [P('period')], outputs: 'CloseByWorkstream; facts workstreams',
    run(a, env) { const p = a['period']!, ts = env.controls.closeTasks(p, env.visible), ws = [...new Set(ts.map((t) => t.workstream))];
      const rows = ws.map((w) => { const t = ts.filter((x) => x.workstream === w); return { w, done: t.filter((x) => x.status === 'COMPLETE').length, tot: t.length, blocked: t.filter((x) => x.status === 'BLOCKED').length }; });
      return { warnings: [SEEDED], object: base(env, { type: 'CloseByWorkstream', title: `Close by workstream · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Complete', 'Tasks', 'Blocked'], rows: rows.map((r) => row(r.w, [n(r.done), n(r.tot), n(r.blocked)])) },
        facts: [{ key: 'workstreams', label: 'Workstreams', value: rows.length, display: n(rows.length) }, ...rows.map((r) => ({ key: `ws.${r.w}`, label: `${r.w} complete`, value: `${r.done} of ${r.tot}`, display: `${r.done} of ${r.tot}` }))], refs: { period: p } }) }; } },
  { id: 'getContinuousCloseSignals', domain: 'close', permission: 'CLOSE_VIEW', risk: 'READ', objectTypes: ['CLOSE'], description: 'Continuous close signals detected in the ledger during the month (intercompany mismatch, missing approvals, late capital postings, source health).', params: [P('period')], outputs: 'ContinuousCloseSignals; facts signals',
    run(a, env) { const r = CLOSE.find((t) => t.id === 'getCloseExceptions')!.run(a, env); r.object.type = 'ContinuousCloseSignals'; r.object.title = r.object.title.replace('Close exceptions', 'Continuous close signals'); r.object.facts = r.object.facts.map((f) => ({ ...f, key: f.key.replace('exception', 'signal') })); return r; } },
];

/* ================================================================================================
   REPORTING
   ================================================================================================ */
const repP: ParamSpec = { name: 'reportId', kind: 'reportId', required: true, description: 'saved report id, e.g. RPT-CFO-MONTHLY' };
function textInReport(env: ToolEnv, r: { name: string; lines: { label: string; accounts: string[] }[] }, text: string) {
  const t = (ACCOUNT_ALIAS[text.toLowerCase().trim()] ?? text).toLowerCase();
  return r.name.toLowerCase().includes(t) || r.lines.some((l) => l.label.toLowerCase().includes(t) || env.gl.expandAccounts(l.accounts).concat(l.accounts).some((x) => acctName(env, x).toLowerCase().includes(t)));
}
const REPORTING: SloaneTool[] = [
  { id: 'getSavedReports', domain: 'reporting', permission: 'REPORT_VIEW', risk: 'READ', objectTypes: ['REPORT'], description: 'Saved report definitions, optionally only those that include an account or account group (e.g. which reports include CIP / 15000).', params: [acctP(false), { name: 'text', kind: 'text', required: false, description: 'name contains' }], outputs: 'SavedReports; facts reports, report1 …',
    run(a, env) { const code = a['account'], acc = code ? new Set(env.gl.expandAccounts([code]).concat(code)) : null;
      const rs = env.controls.reports().filter((r) => (!acc || r.lines.some((l) => l.accounts.some((x) => acc.has(x) || env.gl.expandAccounts([x]).some((y) => acc.has(y))))) && (!a['text'] || textInReport(env, r, a['text'])));
      return { warnings: [], object: base(env, { type: 'SavedReports', title: code ? `Saved reports that include ${acctName(env, code)}` : 'Saved reports',
        table: { columns: ['Owner', 'Version', 'Lines', 'Includes'], rows: rs.map((r) => row(r.name, [r.owner, `v${r.definitionVersion}`, n(r.lines.length), code ? r.lines.filter((l) => l.accounts.some((x) => acc!.has(x) || env.gl.expandAccounts([x]).some((y) => acc!.has(y)))).map((l) => l.label).join('; ') : ''], 1, 'line', `report:${r.id}`)) },
        facts: [{ key: 'reports', label: 'Reports', value: rs.length, display: n(rs.length) }, ...rs.map((r, i) => ({ key: `report${i + 1}`, label: 'Report', value: r.name, display: r.name }))],
        refs: { ...(rs[0] ? { reportId: rs[0].id } : {}), ...(code ? { account: code } : {}) }, focus: code ? { kind: 'account', id: code, name: acctName(env, code) } : null, provenance: { source: 'Saved report definitions (seeded; definitions only, no amounts)', snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] } }) }; } },
  { id: 'getSavedReport', domain: 'reporting', permission: 'REPORT_VIEW', risk: 'READ', objectTypes: ['REPORT'],
    description: 'One report from Saved Reports — the SAME store the Reporting workspace edits and Sloane saves into: name, current version, rows, filters, period, and who last changed it. Use for "show me the Siemens FY26 spend report" or "what does the Capital Spend by Vendor report include".',
    params: [{ name: 'text', kind: 'text', required: true, description: 'the report name, or words from it' }], outputs: 'SavedReport; facts version, rows, filters, period, updatedBy',
    run(a, env) {
      const r = findSavedReport(a['text'] ?? '');
      const visible = r && (r.createdBy === env.actor.id || r.createdBy.startsWith('system:') || r.sharedWith.includes(env.actor.id) || r.sharedWith.some((w) => w.toLowerCase() === env.actor.name.toLowerCase()));
      if (!r || !visible) return unavailable(env, 'SavedReport', `Saved report · ${a['text'] ?? ''}`, 'Saved report', `No saved report you may view matches “${a['text'] ?? ''}”.`);
      const d = r.definition as { rows?: string[]; filters?: Record<string, string>; periodStart?: string; periodEnd?: string; period?: { kind: string } };
      const per = d.periodStart && d.periodEnd ? `${periodLabel(d.periodStart)} – ${periodLabel(d.periodEnd)}` : d.period?.kind === 'ytd' ? 'Year to date' : d.period?.kind ?? '—';
      const who = (id: string) => DEV_DIRECTORY.find((u) => u.id === id)?.name ?? (id.startsWith('system:') ? 'Korvyn seed' : id);
      const rows = (d.rows ?? []).join(' → ') || '—', filters = Object.entries(d.filters ?? {}).map(([k, v]) => `${k} = ${v}`).join('; ') || 'none';
      return { warnings: [], object: base(env, { type: 'SavedReport', title: `${r.name} · v${r.version}`,
        table: { columns: ['Definition'], rows: [row('Rows', [rows]), row('Filters', [filters]), row('Period', [per]), row('Version', [`v${r.version}`]), row('Last changed by', [`${who(r.updatedBy)} · ${r.updatedAt}`]), row('Created via', [r.createdVia === 'Sloane' ? 'Sloane' : 'Reporting workspace']), row('Status', [r.status])] },
        facts: [{ key: 'name', label: 'Report', value: r.name, display: r.name }, { key: 'version', label: 'Version', value: r.version, display: `v${r.version}` }, { key: 'rows', label: 'Rows', value: rows, display: rows },
          { key: 'filters', label: 'Filters', value: filters, display: filters }, { key: 'period', label: 'Period', value: per, display: per }, { key: 'updatedBy', label: 'Last changed by', value: who(r.updatedBy), display: who(r.updatedBy) }],
        refs: { savedReportId: r.id }, focus: { kind: 'report', id: r.id, name: r.name },
        provenance: { source: 'Saved Reports (Korvyn work store; shared by the Reporting workspace and Sloane)', snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] } }) };
    } },
  { id: 'getReportDefinition', domain: 'reporting', permission: 'REPORT_VIEW', risk: 'READ', objectTypes: ['REPORT'], description: 'A saved report’s definition: lines and the accounts each line reads.', params: [repP], outputs: 'ReportDefinition; facts lines, version',
    run(a, env) { const r = env.controls.report(a['reportId']!)!;
      return { warnings: [], object: base(env, { type: 'ReportDefinition', title: `${r.name} · definition v${r.definitionVersion}`, table: { columns: ['Accounts'], rows: r.lines.map((l) => row(l.label, [l.accounts.map((x) => acctName(env, x)).join(', ')])) },
        facts: [{ key: 'lines', label: 'Lines', value: r.lines.length, display: n(r.lines.length) }, { key: 'version', label: 'Definition version', value: r.definitionVersion, display: `v${r.definitionVersion}` }], refs: { reportId: r.id }, focus: { kind: 'report', id: r.id, name: r.name } }) }; } },
  { id: 'getReportData', domain: 'reporting', permission: 'REPORT_VIEW', risk: 'READ', objectTypes: ['REPORT'], description: 'Run a saved report definition for a month against the governed ledger (current vs prior). Use for "show me the June CFO report".', params: [repP, P('period')], outputs: 'ReportData; facts <line>.current, <line>.prior',
    run(a, env) { const r = env.controls.report(a['reportId']!)!, p = a['period']!, prior = env.gl.priorPeriod(p), d = env.controls.reportData(r.id, p, env.visible);
      return { warnings: [`Balances at ${FX_CLOSING_SET.id}, flows at ${FX_RATE_SET.id}.`], object: base(env, { type: 'ReportData', title: `${r.name} · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: [periodLabel(p), prior ? periodLabel(prior) : 'Prior', 'Change'], rows: d.map((l) => row(l.label, [$(l.currentUsd), $(l.priorUsd), l.priorUsd === null ? '—' : $(l.currentUsd - l.priorUsd)], 1, 'line', `account:${l.accounts[0]}`)) },
        facts: d.flatMap((l, i) => [{ key: `line${i + 1}.current`, label: `${l.label} · ${periodLabel(p)}`, value: l.currentUsd, display: $(l.currentUsd) }, ...(l.priorUsd !== null ? [{ key: `line${i + 1}.change`, label: `${l.label} · change`, value: l.currentUsd - l.priorUsd, display: $(l.currentUsd - l.priorUsd) }] : [])]),
        refs: { reportId: r.id, period: p }, focus: { kind: 'report', id: r.id, name: r.name }, provenance: { source: `${GL_SRC}; definition ${r.id} v${r.definitionVersion}`, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: FX_CLOSING_SET.id, eliminations: null, declaredInputs: [FX_CLOSING_SET.id, FX_RATE_SET.id] } }) }; } },
  { id: 'getPublishedReports', domain: 'reporting', permission: 'REPORT_VIEW', risk: 'READ', objectTypes: ['REPORT'], description: 'Published report snapshots (immutable) with period, version, publisher and snapshot id.', params: [], outputs: 'PublishedReports; facts published',
    run: (_a, env) => ({ warnings: [], object: base(env, { type: 'PublishedReports', title: 'Published reports', table: { columns: ['Period', 'Version', 'Published by', 'Published', 'Snapshot'], rows: env.controls.published().map((r) => row(r.name, [periodLabel(r.period), `v${r.version}`, r.publishedBy, r.publishedAt, r.snapshotId], 1, 'line', `published:${r.id}`)) }, facts: [{ key: 'published', label: 'Published reports', value: env.controls.published().length, display: n(env.controls.published().length) }], provenance: { source: 'Published report register (seeded)', snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] } }) }) },
  { id: 'getReportingPackages', domain: 'reporting', permission: 'REPORT_VIEW', risk: 'READ', objectTypes: ['REPORT'], description: 'Management reporting packages (e.g. June 2026 CFO Package) with status and referenced contents.', params: [], outputs: 'ReportingPackages; facts packages',
    run: (_a, env) => ({ warnings: [], object: base(env, { type: 'ReportingPackages', title: 'Reporting packages', table: { columns: ['Period', 'Status', 'Owner', 'Contents'], rows: env.controls.packages().map((p) => row(p.name, [periodLabel(p.period), p.status, p.owner, p.contents.join(', ')], 1, 'line', `package:${p.id}`)) }, facts: [{ key: 'packages', label: 'Packages', value: env.controls.packages().length, display: n(env.controls.packages().length) }, ...env.controls.packages().map((p, i) => ({ key: `package${i + 1}`, label: `${p.name} status`, value: p.status, display: p.status }))], refs: { reportId: 'RPT-CFO-MONTHLY' }, provenance: { source: 'Reporting package register (seeded; references only)', snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] } }) }) },
  { id: 'getReportLineage', domain: 'reporting', permission: 'REPORT_VIEW', risk: 'READ', objectTypes: ['REPORT', 'GOVERNED_LEDGER'], description: 'Lineage of a report line: definition → accounts → governed GL population (id and count) for a month. Use for "show me the underlying GL for this report line".', params: [repP, P('period'), { name: 'line', kind: 'text', required: false, description: 'report line label; default the first line' }], outputs: 'ReportLineage; refs populationId',
    run(a, env) { const r = env.controls.report(a['reportId']!)!, p = a['period']!, ln = r.lines.find((l) => a['line'] && l.label.toLowerCase().includes(a['line'].toLowerCase())) ?? r.lines[0]!;
      const def = env.gl.definePopulation({ accounts: ln.accounts, periodStart: p, periodEnd: p }, 'amount_desc', `${r.name} · ${ln.label}`), q = env.gl.query(def, env.visible, { limit: 1 });
      return { warnings: [], object: base(env, { type: 'ReportLineage', title: `Lineage · ${r.name} · ${ln.label} · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Value'], rows: [row('Report', [`${r.id} v${r.definitionVersion}`]), row('Line', [ln.label]), row('Accounts', [env.gl.expandAccounts(ln.accounts).map((x) => acctName(env, x)).join(', ')]), row('Governed population', [`${def.id} · ${q.rowCount} lines · net ${$(q.netUsd)}`]), row('Source', [GL_SRC])] },
        facts: [{ key: 'populationLines', label: 'Lines in population', value: q.rowCount, display: n(q.rowCount) }, { key: 'populationNet', label: 'Population net activity', value: q.netUsd, display: $(q.netUsd) }],
        refs: { reportId: r.id, populationId: def.id, account: ln.accounts[0]! }, focus: { kind: 'population', id: def.id, name: `${r.name} · ${ln.label}` } }) }; } },
];

/* ================================================================================================
   AUDIT
   ================================================================================================ */
const audP: ParamSpec = { name: 'auditPopulationId', kind: 'auditPopulationId', required: true, description: 'AUD-POP-CIP-ADD | AUD-POP-AP-OPEX | AUD-POP-REVENUE' };
function auditRows(env: ToolEnv, id: string, a: ToolArgs) {
  const ap = env.controls.auditPopulation(id)!, ps = env.gl.periods();
  const f: PopulationFilter = { accounts: ap.accounts, periodStart: a['periodStart'] ?? ps[0]!, periodEnd: a['periodEnd'] ?? ps.at(-1)!, text: ap.description };
  const def = env.gl.definePopulation(f, 'amount_desc', ap.name), q = env.gl.query(def, env.visible, { limit: 10 });
  const rows = q.all.filter((l) => (ap.sign === 'debit' ? l.local > 0 : l.local < 0));
  return { ap, def, q, rows };
}
const AUDIT: SloaneTool[] = [
  { id: 'getAuditPopulation', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION'], description: 'An audit population (governed query over H1 2026 by default): id, definition, count, total and first page.', params: [audP, P('periodStart', false), P('periodEnd', false)], outputs: 'AuditPopulation; facts lineCount, total; refs populationId',
    run(a, env) { const { ap, def, rows } = auditRows(env, a['auditPopulationId']!, a); const tot = rows.reduce((s, l) => s + Math.abs(l.usd), 0);
      const r = populationObject(env, 'AuditPopulation', `Audit population · ${ap.name}`, def.filter, a); r.object.facts.push({ key: 'total', label: 'Population total (absolute, USD)', value: tot, display: $(tot) }, { key: 'items', label: 'Items', value: rows.length, display: n(rows.length) }); r.object.refs.auditPopulationId = ap.id; return r; } },
  { id: 'getPopulationTieOut', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION'], description: 'Tie-out of an audit population total to the governed ledger (the same accounts’ activity of that type).', params: [audP], outputs: 'PopulationTieOut; facts populationTotal, ledgerTotal, difference',
    run(a, env) { const { ap, rows, def } = auditRows(env, a['auditPopulationId']!, a); const pop = rows.reduce((s, l) => s + Math.abs(l.usd), 0);
      const acc = new Set(env.gl.expandAccounts(ap.accounts)), led = env.gl.lines.filter((l) => acc.has(l.account) && l.description === ap.description && (env.visible === 'ALL' || env.visible.has(l.entity)) && (ap.sign === 'debit' ? l.local > 0 : l.local < 0)).reduce((s, l) => s + Math.abs(l.usd), 0);
      return { warnings: ['The tie-out compares the population to the governed ledger it is drawn from; it is not an independent comparison to an ERP extract.'], object: base(env, { type: 'PopulationTieOut', title: `Tie-out · ${ap.name}`, table: { columns: ['USD'], rows: [row('Population total', [$(pop)]), row(ap.tieOutTo, [$(led)]), row('Difference', [$(pop - led)], 0, 'total')] },
        facts: [{ key: 'populationTotal', label: 'Population total', value: pop, display: $(pop) }, { key: 'ledgerTotal', label: 'Ledger total', value: led, display: $(led) }, { key: 'difference', label: 'Difference', value: pop - led, display: Math.abs(pop - led) < 0.5 ? 'none' : $(pop - led) }], refs: { auditPopulationId: ap.id, populationId: def.id } }) }; } },
  { id: 'getAuditSelections', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION'], description: 'Deterministic audit selections from a population: key items (top by amount) plus a systematic sample, with each selection’s support references.', params: [audP, { name: 'sampleSize', kind: 'number', required: false, description: 'default 10' }], outputs: 'AuditSelections; facts selections, missingSupport',
    run(a, env) { const { ap, rows } = auditRows(env, a['auditPopulationId']!, a), k = Math.min(Number(a['sampleSize'] ?? 10), 25), key = rows.slice(0, Math.ceil(k / 2)), rest = rows.slice(key.length), step = Math.max(1, Math.floor(rest.length / Math.max(1, k - key.length)));
      const sel = [...key.map((l) => ({ l, how: 'key item' })), ...rest.filter((_, i) => i % step === 0).slice(0, k - key.length).map((l) => ({ l, how: `systematic 1-in-${step}` }))];
      const ev = env.controls.evidenceForLines(sel.map((s) => s.l)), miss = new Set(ev.missing.map((m) => m.line.key));
      return { warnings: ['Selections are deterministic from the population definition; documents are not connected.'], object: base(env, { type: 'AuditSelections', title: `Audit selections · ${ap.name}`,
        table: { columns: ['Method', 'Amount (USD)', 'Vendor', 'Invoice ref', 'Support'], rows: sel.map((s) => row(s.l.key, [s.how, $(s.l.usd), s.l.vendor ?? '—', s.l.invoiceRef ?? '—', miss.has(s.l.key) ? 'gap' : 'references present'], 1, 'line', `txn:${s.l.key}`)) },
        facts: [{ key: 'selections', label: 'Selections', value: sel.length, display: n(sel.length) }, { key: 'missingSupport', label: 'Selections with support gaps', value: miss.size, display: n(miss.size) }], refs: { auditPopulationId: ap.id, ...(sel[0] ? { transactionId: sel[0].l.key } : {}) } }) }; } },
  { id: 'getPBCRequest', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION'], description: 'Auditor PBC (prepared-by-client) requests, optionally by status (OPEN, IN_PROGRESS, NOT_STARTED).', params: [{ name: 'status', kind: 'text', required: false, description: 'status' }], outputs: 'PBCRequests; facts requests, open',
    run(a, env) { const rs = env.controls.pbc().filter((r) => !a['status'] || r.status === a['status']);
      return { warnings: [SEEDED], object: base(env, { type: 'PBCRequests', title: 'PBC requests', table: { columns: ['Owner', 'Due', 'Status', 'Population'], rows: rs.map((r) => row(`${r.id} · ${r.title}`, [r.owner, r.due, r.status, r.populationId ?? '—'], 1, 'line', `pbc:${r.id}`)) },
        facts: [{ key: 'requests', label: 'Requests', value: rs.length, display: n(rs.length) }, { key: 'open', label: 'Not yet delivered', value: rs.length, display: n(rs.length) }], refs: rs[0] ? { pbcId: rs[0].id } : {} }) }; } },
  { id: 'getAuditRequest', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION'], description: 'One PBC / audit request by id with its linked population.', params: [{ name: 'pbcId', kind: 'pbcId', required: true, description: 'PBC-2026-001' }], outputs: 'AuditRequest; facts status, owner',
    run(a, env) { const r = env.controls.pbc().find((x) => x.id === a['pbcId'])!;
      return { warnings: [SEEDED], object: base(env, { type: 'AuditRequest', title: `${r.id} · ${r.title}`, table: { columns: ['Value'], rows: [row('Requested by', [r.requestedBy]), row('Owner', [r.owner]), row('Due', [r.due]), row('Status', [r.status]), row('Population', [r.populationId ?? 'none linked'])] },
        facts: [{ key: 'status', label: 'Status', value: r.status, display: r.status }, { key: 'owner', label: 'Owner', value: r.owner, display: r.owner }, { key: 'due', label: 'Due', value: r.due, display: r.due }], refs: { pbcId: r.id, ...(r.populationId ? { auditPopulationId: r.populationId } : {}) }, focus: { kind: 'pbc', id: r.id, name: r.title } }) }; } },
  { id: 'getEvidenceSet', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION', 'EVIDENCE'], description: 'The evidence set for an audit population: coverage of invoice, PO, contract and approval references across its items.', params: [audP], outputs: 'EvidenceSet; facts items, invoiceRefs, poRefs, approvalRefs, gaps',
    run(a, env) { const { ap, rows } = auditRows(env, a['auditPopulationId']!, a), e = env.controls.evidenceForLines(rows);
      return { warnings: ['References only — no document is connected.', AP_EXTRACT.note], object: base(env, { type: 'EvidenceSet', title: `Evidence set · ${ap.name}`, status: 'PARTIAL', table: { columns: ['Count'], rows: [row('Items', [n(rows.length)]), row('Invoice references', [n(e.invoiceRefs)]), row('PO references', [n(e.poRefs)]), row('Contract references', [n(e.contractRefs)]), row('Approvals required / referenced', [`${e.approvalsRequired} / ${e.approvalRefs}`]), row('Items with gaps', [n(e.missing.length)]), row('Documents connected', ['No'])] },
        facts: [{ key: 'items', label: 'Items', value: rows.length, display: n(rows.length) }, { key: 'invoiceRefs', label: 'Invoice references', value: e.invoiceRefs, display: n(e.invoiceRefs) }, { key: 'poRefs', label: 'PO references', value: e.poRefs, display: n(e.poRefs) }, { key: 'approvalRefs', label: 'Approval references', value: e.approvalRefs, display: n(e.approvalRefs) }, { key: 'gaps', label: 'Items with gaps', value: e.missing.length, display: n(e.missing.length) }], refs: { auditPopulationId: ap.id } }) }; } },
  { id: 'getAuditPackage', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION'], description: 'The audit package for a period: its populations, tie-outs, PBC status and exceptions. Package generation is not available.', params: [P('period', false)], outputs: 'AuditPackage; facts populations, tiedOut, openRequests',
    run(_a, env) { const pops = env.controls.auditPopulations();
      return { warnings: ['Final PBC / audit package generation is not enabled; this is a read-only assembly view.', SEEDED], object: base(env, { type: 'AuditPackage', title: 'Audit package · H1 2026 interim', status: 'PARTIAL', table: { columns: ['Kind', 'Status'], rows: [...pops.map((p) => row(p.name, ['Population', 'Defined · tie-out available'], 1, 'line', `auditPopulation:${p.id}`)), ...env.controls.pbc().map((r) => row(r.title, ['PBC request', r.status], 1, 'line', `pbc:${r.id}`))] },
        facts: [{ key: 'populations', label: 'Populations', value: pops.length, display: n(pops.length) }, { key: 'openRequests', label: 'PBC requests not delivered', value: env.controls.pbc().length, display: n(env.controls.pbc().length) }] }) }; } },
  { id: 'getAuditExceptions', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION'], description: 'Audit exceptions across populations: items with missing invoice or approval references.', params: [], outputs: 'AuditExceptions; facts exceptions',
    run(a, env) { const all = env.controls.auditPopulations().flatMap((p) => { const { rows } = auditRows(env, p.id, a); return env.controls.evidenceForLines(rows).missing.map((m) => ({ p, m })); }).sort((x, y) => Math.abs(y.m.line.usd) - Math.abs(x.m.line.usd));
      return { warnings: [AP_EXTRACT.note], object: base(env, { type: 'AuditExceptions', title: 'Audit exceptions', table: { columns: ['Population', 'Amount (USD)', 'Gaps'], rows: all.slice(0, 20).map((x) => row(x.m.line.key, [x.p.name, $(x.m.line.usd), x.m.gaps.join(', ')], 1, 'line', `txn:${x.m.line.key}`)) },
        facts: [{ key: 'exceptions', label: 'Items with gaps', value: all.length, display: n(all.length) }], refs: all[0] ? { transactionId: all[0].m.line.key } : {} }) }; } },
];

/* ================================================================================================
   EVIDENCE — references and status, never documents
   ================================================================================================ */
const targetP: ParamSpec[] = [{ name: 'objectRef', kind: 'objectRef', required: false, description: 'txn:JE-…#n | journal:JE-… | recon:REC-… | account:15000 (with period)' }, { name: 'populationId', kind: 'populationId', required: false, description: 'population id' }, P('period', false)];
function linesFor(env: ToolEnv, a: ToolArgs): { lines: GLine[]; label: string } | null {
  if (a['populationId']) { const d = env.gl.population(a['populationId'])!; return { lines: env.gl.query(d, env.visible).all, label: d.label }; }
  const ref = a['objectRef'] ?? '';
  const [kind, ...rest] = ref.split(':'), id = rest.join(':');
  if (kind === 'txn') return { lines: env.gl.lines.filter((l) => l.key === id), label: `Transaction ${id}` };
  if (kind === 'journal') return { lines: env.gl.lines.filter((l) => l.journalId === id), label: `Journal ${id}` };
  if (kind === 'recon') { const d = env.controls.recDef(id); if (!d || !a['period']) return null; return { lines: env.gl.lines.filter(env.gl.match({ accounts: d.accounts, entities: [d.entity], periodStart: a['period'], periodEnd: a['period'] }, env.visible)), label: d.name }; }
  if (kind === 'account' && a['period']) return { lines: env.gl.lines.filter(env.gl.match({ accounts: [id], periodStart: a['period'], periodEnd: a['period'] }, env.visible)), label: acctName(env, id) };
  return null;
}
function refTool(id: string, kind: 'invoiceRef' | 'poRef' | 'contractRef' | 'approvalRef', label: string): SloaneTool {
  return { id, domain: 'evidence', permission: 'EVIDENCE_VIEW', risk: 'READ', objectTypes: ['EVIDENCE', 'INVOICE'], description: `${label} on a transaction, journal or population (from the AP extract; reference and status only — documents are not connected).`, params: targetP, outputs: `References; facts references, missing`,
    run(a, env) { const t = linesFor(env, a); if (!t) return unavailable(env, 'References', label, label, 'Name a transaction, journal, reconciliation (with period) or population.');
      const ap = t.lines.filter((l) => l.vendor && l.account !== '20100'), has = ap.filter((l) => (kind === 'approvalRef' ? l.approvalRequired : true) && l[kind]), req = kind === 'approvalRef' ? ap.filter((l) => l.approvalRequired) : kind === 'poRef' || kind === 'contractRef' ? ap.filter((l) => l.project) : ap;
      return { warnings: ['References only — documents are not connected.', AP_EXTRACT.note], object: base(env, { type: 'References', title: `${label} · ${t.label}`, status: 'PARTIAL',
        table: { columns: ['Reference', 'Vendor', 'Amount (USD)', 'Document'], rows: req.slice(0, 20).map((l) => row(l.key, [l[kind] ?? 'MISSING', l.vendor ?? '—', $(l.usd), l[kind] ? 'not connected' : '—'], 1, 'line', `txn:${l.key}`)) },
        facts: [{ key: 'references', label: `${label} present`, value: has.length, display: n(has.length) }, { key: 'missing', label: `${label} missing`, value: req.length - has.length, display: n(req.length - has.length) }, { key: 'applicable', label: 'Lines where required', value: req.length, display: n(req.length) }, ...(t.lines.length && !ap.length ? [{ key: 'notAp', label: 'Not AP-sourced', value: 'no vendor document applies', display: 'no vendor document applies' }] : [])] }) }; } };
}
const EVIDENCE: SloaneTool[] = [
  { id: 'getEvidenceForObject', domain: 'evidence', permission: 'EVIDENCE_VIEW', risk: 'READ', objectTypes: ['EVIDENCE', 'JOURNAL', 'INVOICE', 'RECONCILIATION'], description: 'All evidence references for a transaction, journal, reconciliation or population: invoice, PO, contract, approval and ERP source, each with status. Use for "show me the support behind X".', params: targetP, outputs: 'EvidenceSet; facts invoiceRefs, poRefs, contractRefs, approvalRefs, gaps, documentsConnected',
    run(a, env) { const t = linesFor(env, a); if (!t) return unavailable(env, 'EvidenceSet', 'Evidence', 'Evidence target', 'Name a transaction, journal, reconciliation (with period) or population.');
      if (a['objectRef']?.startsWith('recon:')) { const r = env.controls.reconcile(env.controls.recDef(a['objectRef'].slice(6))!, a['period']!); t.label += ` · required support ${r.support.filter((s) => s.status !== 'MISSING').length} of ${r.support.length}`; }
      const e = env.controls.evidenceForLines(t.lines), first = t.lines.find((l) => l.vendor && l.account !== '20100') ?? t.lines[0], src = first ? env.gl.sourceRef(first) : null;
      return { warnings: ['References only — no invoice, PO, contract or approval document is connected.', AP_EXTRACT.note], object: base(env, { type: 'EvidenceSet', title: `Evidence · ${t.label}`, status: 'PARTIAL',
        table: { columns: ['Present', 'Status'], rows: [row('Invoice references', [n(e.invoiceRefs), 'reference only']), row('PO references', [n(e.poRefs), 'reference only']), row('Contract references', [n(e.contractRefs), 'reference only']), row('Approval references (required)', [`${e.approvalRefs} of ${e.approvalsRequired}`, 'reference only']), row('Lines with support gaps', [n(e.missing.length), e.missing.length ? 'gap' : 'none']), ...(src ? [row('ERP source', [`${src.erpSystem} ${src.instance} · ${src.transactionId}`, src.availability])] : []), ...e.missing.slice(0, 10).map((m) => row(`Gap · ${m.line.key}`, [m.gaps.join(', '), $(m.line.usd)], 1, 'line', `txn:${m.line.key}`))] },
        facts: [{ key: 'lines', label: 'Lines examined', value: t.lines.length, display: n(t.lines.length) }, { key: 'invoiceRefs', label: 'Invoice references', value: e.invoiceRefs, display: n(e.invoiceRefs) }, { key: 'poRefs', label: 'PO references', value: e.poRefs, display: n(e.poRefs) }, { key: 'contractRefs', label: 'Contract references', value: e.contractRefs, display: n(e.contractRefs) }, { key: 'approvalRefs', label: 'Approval references', value: e.approvalRefs, display: n(e.approvalRefs) }, { key: 'approvalsRequired', label: 'Approvals required', value: e.approvalsRequired, display: n(e.approvalsRequired) }, { key: 'gaps', label: 'Lines with gaps', value: e.missing.length, display: n(e.missing.length) }, { key: 'documentsConnected', label: 'Documents connected', value: 'No', display: 'No' }, ...(first?.invoiceRef ? [{ key: 'invoiceRef', label: 'Invoice reference', value: first.invoiceRef, display: first.invoiceRef }] : []), ...(src ? [{ key: 'sourceAvailability', label: `${src.erpSystem} availability`, value: src.availability, display: src.availability }] : [])],
        refs: { ...(a['objectRef'] ? { objectRef: a['objectRef'] } : {}), ...(a['populationId'] ? { populationId: a['populationId'] } : {}) } }) }; } },
  { id: 'getSupportCoverage', domain: 'evidence', permission: 'EVIDENCE_VIEW', risk: 'READ', objectTypes: ['EVIDENCE'], description: 'Support coverage % over a population or object: AP lines with invoice references, approvals referenced vs required.', params: targetP, outputs: 'SupportCoverage; facts invoiceCoverage, approvalCoverage',
    run(a, env) { const t = linesFor(env, a); if (!t) return unavailable(env, 'SupportCoverage', 'Support coverage', 'Coverage target', 'Name a population or object.'); const e = env.controls.evidenceForLines(t.lines);
      const ic = e.apLines ? `${Math.round((e.invoiceRefs / e.apLines) * 100)}%` : 'n/a', ac = e.approvalsRequired ? `${Math.round((e.approvalRefs / e.approvalsRequired) * 100)}%` : 'n/a';
      return { warnings: ['References only — documents are not connected.'], object: base(env, { type: 'SupportCoverage', title: `Support coverage · ${t.label}`, status: 'PARTIAL', table: { columns: ['Coverage'], rows: [row('AP lines with an invoice reference', [ic]), row('Required approvals referenced', [ac]), row('Non-AP lines (no vendor document applies)', [n(e.nonApLines)])] },
        facts: [{ key: 'invoiceCoverage', label: 'Invoice reference coverage', value: ic, display: ic }, { key: 'approvalCoverage', label: 'Approval coverage', value: ac, display: ac }, { key: 'apLines', label: 'AP lines', value: e.apLines, display: n(e.apLines) }] }) }; } },
  { id: 'findMissingEvidence', domain: 'evidence', permission: 'EVIDENCE_VIEW', risk: 'READ', objectTypes: ['EVIDENCE', 'GOVERNED_LEDGER'], description: 'Lines in a population or object missing a required invoice, PO or approval reference. Use for "which of these transactions have missing support?".', params: targetP, outputs: 'MissingEvidence; facts linesMissing, amountMissing',
    run(a, env) { const t = linesFor(env, a); if (!t) return unavailable(env, 'MissingEvidence', 'Missing evidence', 'Target', 'Name a population or object — for example the population in context.'); const e = env.controls.evidenceForLines(t.lines), amt = e.missing.reduce((s, m) => s + Math.abs(m.line.usd), 0);
      return { warnings: ['References only — documents are not connected.', AP_EXTRACT.note], object: base(env, { type: 'MissingEvidence', title: `Missing support · ${t.label}`, table: { columns: ['Missing', 'Vendor', 'Amount (USD)'], rows: e.missing.slice(0, 25).map((m) => row(m.line.key, [m.gaps.join(', '), m.line.vendor ?? '—', $(m.line.usd)], 1, 'line', `txn:${m.line.key}`)) },
        facts: [{ key: 'linesExamined', label: 'Lines examined', value: t.lines.length, display: n(t.lines.length) }, { key: 'apLines', label: 'AP lines (support applies)', value: e.apLines, display: n(e.apLines) }, { key: 'linesMissing', label: 'Lines missing support', value: e.missing.length, display: n(e.missing.length) }, { key: 'amountMissing', label: 'Amount on lines missing support', value: amt, display: $(amt) }],
        refs: e.missing[0] ? { transactionId: e.missing[0].line.key } : {} }) }; } },
  { id: 'getRelatedEvidence', domain: 'evidence', permission: 'EVIDENCE_VIEW', risk: 'READ', objectTypes: ['EVIDENCE'], description: 'Evidence related through the same vendor and project (contract and PO siblings) for a transaction.', params: [{ name: 'objectRef', kind: 'objectRef', required: true, description: 'txn:JE-…#n' }],
    outputs: 'RelatedEvidence; facts relatedLines, contracts',
    run(a, env) { const t = linesFor(env, a); const l = t?.lines[0]; if (!l || !l.vendor) return unavailable(env, 'RelatedEvidence', 'Related evidence', 'Related evidence', 'Only AP-sourced transactions carry vendor and project evidence relationships.');
      const rel = env.gl.lines.filter((x) => x.vendor === l.vendor && x.project === l.project && x.account !== '20100' && x.key !== l.key && (env.visible === 'ALL' || env.visible.has(x.entity)));
      return { warnings: ['References only — documents are not connected.'], object: base(env, { type: 'RelatedEvidence', title: `Related evidence · ${l.vendor}${l.project ? ` · ${l.project}` : ''}`, table: { columns: ['Period', 'Contract', 'PO', 'Invoice', 'Amount (USD)'], rows: rel.slice(0, 20).map((x) => row(x.key, [x.period, x.contractRef ?? '—', x.poRef ?? '—', x.invoiceRef ?? 'MISSING', $(x.usd)], 1, 'line', `txn:${x.key}`)) },
        facts: [{ key: 'relatedLines', label: 'Related lines', value: rel.length, display: n(rel.length) }, { key: 'contracts', label: 'Contracts', value: new Set(rel.map((x) => x.contractRef).filter(Boolean)).size, display: n(new Set(rel.map((x) => x.contractRef).filter(Boolean)).size) }] }) }; } },
  refTool('getInvoiceReferences', 'invoiceRef', 'Invoice references'),
  refTool('getPOReferences', 'poRef', 'PO references'),
  refTool('getContractReferences', 'contractRef', 'Contract references'),
  refTool('getApprovalReferences', 'approvalRef', 'Approval references'),
  { id: 'getSourceSystemReferences', domain: 'evidence', permission: 'EVIDENCE_VIEW', risk: 'READ', objectTypes: ['EVIDENCE'], description: 'ERP source systems behind an object or population, with availability. No deep link is fabricated.', params: targetP, outputs: 'SourceSystems; facts systems, unavailable',
    run(a, env) { const t = linesFor(env, a); if (!t) return unavailable(env, 'SourceSystems', 'Source systems', 'Target', 'Name a population or object.');
      const by = new Map<string, number>(); t.lines.forEach((l) => by.set(l.connector, (by.get(l.connector) ?? 0) + 1));
      const rs = [...by.entries()].map(([k, c]) => ({ h: SOURCE_HEALTH[k]!, c }));
      return { warnings: [], object: base(env, { type: 'SourceSystems', title: `Source systems · ${t.label}`, table: { columns: ['Instance', 'Lines', 'Availability', 'Deep link'], rows: rs.map((r) => row(r.h.system, [r.h.instance, n(r.c), r.h.status, 'not published'])) },
        facts: [{ key: 'systems', label: 'Source systems', value: rs.length, display: n(rs.length) }, { key: 'unavailable', label: 'Stale or unavailable', value: rs.filter((r) => r.h.status !== 'AVAILABLE').length, display: n(rs.filter((r) => r.h.status !== 'AVAILABLE').length) }] }) }; } },
];

/* ================================================================================================
   TRACE TO ERP
   ================================================================================================ */
const txnP: ParamSpec = { name: 'transactionId', kind: 'transactionId', required: true, description: 'JE-xxxxxx#n' };
function traceObj(env: ToolEnv, title: string, steps: [string, string][], ls: GLine[]): ToolResult {
  const sys = [...new Set(ls.map((l) => l.connector))].map((k) => SOURCE_HEALTH[k]!);
  return { warnings: sys.filter((s) => s.status !== 'AVAILABLE').map((s) => `${s.system}: ${s.note}`), object: base(env, { type: 'Trace', title,
    table: { columns: ['Detail'], rows: [...steps.map(([k, v]) => row(k, [v])), ...sys.map((s) => row(`ERP · ${s.system}`, [`${s.instance} · ${s.status} · no deep link published`]))] },
    facts: [{ key: 'lines', label: 'GL lines', value: ls.length, display: n(ls.length) }, { key: 'sourceSystems', label: 'Source systems', value: sys.length, display: n(sys.length) }, { key: 'unavailableSources', label: 'Unavailable or stale sources', value: sys.filter((s) => s.status !== 'AVAILABLE').length, display: n(sys.filter((s) => s.status !== 'AVAILABLE').length) }],
    refs: ls[0] ? { transactionId: ls[0].key } : {} }) };
}
const TRACE: SloaneTool[] = [
  { id: 'traceFinancialObject', domain: 'trace', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['ACCOUNT', 'ACCOUNT_GROUP', 'FINANCIAL_STATEMENT', 'RECONCILIATION', 'REPORT'], description: 'Trace a statement line / account for a month to its source: line → accounts → governed population → journals → ERP systems. Use for "trace this number".', params: [acctP(), P('period'), scopeP], outputs: 'Trace; facts lines, sourceSystems; refs populationId',
    run(a, env) { const code = a['account']!, p = a['period']!, ents = entitiesOf(env, a['scope']);
      const def = env.gl.definePopulation({ accounts: [code], periodStart: p, periodEnd: p, ...(ents ? { entities: ents } : {}) }, 'amount_desc', `${acctName(env, code)} ${periodLabel(p)}`), q = env.gl.query(def, env.visible, { limit: 1 });
      const r = traceObj(env, `Trace · ${acctName(env, code)} · ${periodLabel(p)}`, [['Statement line', acctName(env, code)], ['Accounts', env.gl.expandAccounts([code]).map((x) => acctName(env, x)).join(', ')], ['Governed population', `${def.id} · ${q.rowCount} lines · net ${$(q.netUsd)}`], ['Journals', n(new Set(q.all.map((l) => l.journalId)).size)], ['Rate sets', `${FX_RATE_SET.id} (flows), ${FX_CLOSING_SET.id} (balances)`]], q.all);
      r.object.refs = { ...r.object.refs, populationId: def.id, account: code }; r.object.focus = { kind: 'account', id: code, name: acctName(env, code) }; return r; } },
  { id: 'tracePopulation', domain: 'trace', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER'], description: 'Trace a population by id to its journals, entities and ERP source systems.', params: [{ name: 'populationId', kind: 'populationId', required: true, description: 'population id' }], outputs: 'Trace; facts lines, sourceSystems',
    run(a, env) { const d = env.gl.population(a['populationId']!)!, q = env.gl.query(d, env.visible, { limit: 1 });
      return traceObj(env, `Trace · ${d.label}`, [['Population', `${d.id} · ${JSON.stringify(d.filter)}`], ['Lines', n(q.rowCount)], ['Journals', n(new Set(q.all.map((l) => l.journalId)).size)], ['Entities', q.entities.join(', ')]], q.all); } },
  { id: 'traceTransaction', domain: 'trace', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['JOURNAL'], description: 'Trace one GL line to its journal, source transaction and ERP system with availability.', params: [txnP], outputs: 'Trace; facts sourceAvailability',
    run(a, env) { const l = env.gl.lines.find((x) => x.key === a['transactionId'])!, s = env.gl.sourceRef(l);
      const r = traceObj(env, `Trace · ${l.key}`, [['GL line', `${l.key} · ${l.account} ${l.accountName} · ${$(l.usd)}`], ['Journal', `${l.journalId} (${l.entryNo})`], ['Source transaction', `${s.transactionType} ${s.transactionId} line ${s.lineId}`], ['Source document', s.sourceDocumentReference ?? 'none referenced'], ['Deep link', 'not published by this instance']], [l]);
      r.object.facts.push({ key: 'sourceAvailability', label: 'Source availability', value: s.availability, display: s.availability }); return r; } },
  { id: 'getSourceSystemReference', domain: 'trace', permission: 'GL_VIEW', risk: 'READ', objectTypes: ['JOURNAL', 'EVIDENCE'], description: 'The ERP source reference for a GL line: system, instance, transaction type, transaction id, line id, source document reference, availability. Never a fabricated link.', params: [txnP], outputs: 'SourceReference; facts erpSystem, transactionId, availability',
    run(a, env) { const l = env.gl.lines.find((x) => x.key === a['transactionId'])!, s = env.gl.sourceRef(l);
      return { warnings: s.availability !== 'AVAILABLE' ? [s.note] : [], object: base(env, { type: 'SourceReference', title: `ERP source · ${l.key}`, table: { columns: ['Value'], rows: Object.entries(s).map(([k, v]) => row(k, [v === null ? 'none' : String(v)])) },
        facts: [{ key: 'erpSystem', label: 'ERP system', value: s.erpSystem, display: s.erpSystem }, { key: 'transactionId', label: 'Source transaction', value: s.transactionId, display: s.transactionId }, { key: 'availability', label: 'Availability', value: s.availability, display: s.availability }], refs: { transactionId: l.key } }) }; } },
];

/* ================================================================================================
   UNIVERSAL FIND — canonical objects, permission-filtered
   ================================================================================================ */
const FIND: SloaneTool[] = [
  { id: 'findGovernedObjects', domain: 'find', permission: 'GL_VIEW', risk: 'READ', objectTypes: [], description: 'Find governed objects by name or id: accounts, journals, vendors, projects, entities, reconciliations, reports, close tasks, audit requests, statement lines. Use when the user names something to locate.', params: [{ name: 'text', kind: 'text', required: true, description: 'what to find' }], outputs: 'FindResults; facts results, result1 …',
    run(a, env) { const hits = findObjects(env, a['text']!, 15);
      return { warnings: [], object: base(env, { type: 'FindResults', title: `Found · “${a['text']}”`, table: { columns: ['Kind', 'Reference'], rows: hits.map((h) => row(h.name, [h.kind, h.ref], 1, 'line', h.ref)) },
        facts: [{ key: 'results', label: 'Results', value: hits.length, display: n(hits.length) }, ...hits.slice(0, 5).map((h, i) => ({ key: `result${i + 1}`, label: h.kind, value: h.name, display: h.name }))], refs: hits[0] ? { first: hits[0].ref } : {} }) }; } },
];
/** finance shorthand → the governed account-group name it means */
export const ACCOUNT_ALIAS: Record<string, string> = { cip: 'construction in progress', 'pp&e': 'property, plant', ppe: 'property, plant', ar: 'accounts receivable', ap: 'accounts payable', ic: 'intercompany', 'd&a': 'depreciation', capex: 'construction in progress' };
export function findObjects(env: Pick<ToolEnv, 'gl' | 'controls' | 'visible' | 'actor'>, text: string, limit = 12) {
  const t = text.toLowerCase().trim(), words = t.split(/\s+/).filter((w) => w.length >= 3);
  const can = (p: string) => env.actor.permissions.includes(p as never);
  const cands: { kind: string; ref: string; name: string }[] = [];
  const vis = (e: string) => env.visible === 'ALL' || env.visible.has(e);
  if (can('GL_VIEW') || can('FINANCIALS_VIEW')) env.gl.accounts().forEach((x) => cands.push({ kind: x.parent ? 'account' : 'statementLine', ref: `account:${x.code}`, name: `${x.code} ${x.name}` }));
  if (can('GL_VIEW')) {
    env.gl.vendors().forEach((v) => cands.push({ kind: 'vendor', ref: `vendor:${v}`, name: v }));
    env.gl.dimensionValues('project').forEach((v) => cands.push({ kind: 'project', ref: `project:${v}`, name: v }));
    const je = t.match(/je-\d{6}(#\d+)?/i); if (je) env.gl.lines.filter((l) => vis(l.entity) && (je[1] ? l.key.toLowerCase() === je[0] : l.journalId.toLowerCase() === je[0])).slice(0, 1).forEach((l) => cands.push({ kind: je[1] ? 'transaction' : 'journal', ref: je[1] ? `txn:${l.key}` : `journal:${l.journalId}`, name: je[1] ? l.key : `${l.journalId} ${l.description}` }));
  }
  env.gl.entities().filter((e) => vis(e.id)).forEach((e) => cands.push({ kind: 'entity', ref: `entity:${e.id}`, name: `${e.name} (${e.id})` }));
  if (can('RECON_VIEW')) env.controls.allRecDefs().filter((d) => vis(d.entity)).forEach((d) => cands.push({ kind: 'reconciliation', ref: `recon:${d.id}`, name: `${d.name} (${d.id})` }));
  if (can('REPORT_VIEW')) savedReports().forEach((r) => cands.push({ kind: 'savedReport', ref: `savedReport:${r.id}`, name: r.name }));
  if (can('REPORT_VIEW')) { env.controls.reports().forEach((r) => cands.push({ kind: 'report', ref: `report:${r.id}`, name: r.name })); env.controls.packages().forEach((p) => cands.push({ kind: 'reportingPackage', ref: `package:${p.id}`, name: p.name })); }
  if (can('CLOSE_VIEW')) env.controls.closeTasks(env.gl.periods().at(-1)!, env.visible).forEach((c) => cands.push({ kind: 'closeTask', ref: `task:${c.id}`, name: `${c.name} · ${c.entity}` }));
  if (can('AUDIT_VIEW')) { env.controls.pbc().forEach((r) => cands.push({ kind: 'auditRequest', ref: `pbc:${r.id}`, name: `${r.id} ${r.title}` })); env.controls.auditPopulations().forEach((p) => cands.push({ kind: 'auditPopulation', ref: `auditPopulation:${p.id}`, name: p.name })); }
  const ALIAS = ACCOUNT_ALIAS;
  const expanded = t.split(/\s+/).map((w) => ALIAS[w] ?? w).join(' ');
  /* a word scores once: literally, or through its alias. A reconciliation NAMED in full outranks every partial hit, so
     "Mechanical CIP reconciliation" is never crowded out by the CIP account group's own reconciliations. */
  const named = (c: { kind: string; name: string }) => c.kind === 'reconciliation' && /reconcil|\brecs?\b/.test(t) && t.includes(c.name.replace(/ \([^)]*\)$/, '').toLowerCase());
  const score = (c: { kind: string; name: string; ref: string }) => { const nm = c.name.toLowerCase(); if (nm === t || c.ref.toLowerCase().endsWith(`:${t}`)) return 100; if (named(c)) return 90; if (nm.includes(expanded) || expanded.includes(nm)) return 60; return words.reduce((s, w) => s + (nm.includes(w) ? 10 : ALIAS[w] && nm.includes(ALIAS[w]) ? (/^\d{2}000 /.test(nm) ? 40 : 10) : 0), 0); };
  return cands.map((c) => ({ ...c, s: score(c) })).filter((c) => c.s > 0).sort((x, y) => y.s - x.s).slice(0, limit);
}

/* ENTITY SCOPE ON A NAMED RECONCILIATION (3D). `authorize` checks scope and entity ARGUMENTS; a reconciliation id
   carries its entity inside the definition, so a scoped actor could name a group-level reconciliation and read it.
   Every tool that takes a reconciliationId resolves the definition's entity against the actor's visibility first. */
const guardReconciliation = (t: SloaneTool): SloaneTool => (!t.params.some((p) => p.name === 'reconciliationId') ? t : { ...t, run(a, env) {
  const d = a['reconciliationId'] ? env.controls.recDef(a['reconciliationId']) : null;
  if (d && env.visible !== 'ALL' && !env.visible.has(d.entity)) return unavailable(env, 'Reconciliation', d.name, 'Reconciliation', `${env.actor.role} may not view ${d.entity === 'GROUP' ? 'group-level' : d.entity} reconciliations.`);
  return t.run(a, env);
} });
registerTools([...FINANCIALS, ...TB, ...LEDGER, ...ANALYSIS, ...FLUX, ...RECON, ...CLOSE, ...REPORTING, ...AUDIT, ...EVIDENCE, ...TRACE, ...FIND].map(guardReconciliation));
export const TOOLSET_LOADED = true;
