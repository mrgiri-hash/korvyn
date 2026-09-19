/**
 * PHASE 8C — CONVERSATIONAL ANALYSIS EDITS.
 *
 * Words become OPS on the AnalysisDefinition; Korvyn applies and validates them. Two readers produce the same ops:
 * a deterministic parser for the phrasing finance users type every day ("accounts on rows", "only cash and CIP",
 * "expand CIP", "add variance", "largest first"), and the model (`analysisEdit`, structured output) for everything
 * looser ("two months with accounts down the side", "only movements I should care about"). Neither may invent a
 * member: every name is resolved to a canonical id through the actor's permission-filtered view (the semantic graph,
 * the governed chart of accounts and the ledger's own dimension members), so a hidden entity is simply not found.
 */
import type { GovernedLedger } from '../governed.js';
import { periodLabel } from '../financials.js';
import type { FinancialGraph } from '../semantic/graph.js';
import { resolvePeriods } from '../semantic/time.js';
import type { Actor, Visible } from '../tools.js';
import { ACCOUNT_ALIAS } from '../toolset.js';
import { FLUX_MATERIALITY } from '../controls.js';
import type { AnalysisDefinition, AnalysisEdit, AnalysisType, AxisDim, DimensionId, MeasureId, ModelOp, Variant } from './model.js';

export interface Member { dimension: DimensionId; value: string; label: string }
export type RowTarget = { kind: 'member'; memberIds: string[] } | { kind: 'rank'; n: number } | { kind: 'row'; rowId: string } | { kind: 'active' } | { kind: 'largest' };
export type AnalysisOp =
  | { op: 'NEW'; analysisType: AnalysisType; statement: 'BS' | 'IS' | null; periods: string[]; rows: AxisDim[]; columns: AxisDim[]; measures: MeasureId[]; filters: Member[]; name: string }
  | { op: 'SET_ROWS'; dims: AxisDim[] } | { op: 'SET_COLUMNS'; dims: AxisDim[] }
  | { op: 'ADD_ROW_DIM'; dim: AxisDim; after: DimensionId | null } | { op: 'REMOVE_DIM'; dim: DimensionId } | { op: 'MOVE_TO_COLUMNS'; dim: DimensionId }
  | { op: 'FILTER'; members: Member[]; exclude: boolean } | { op: 'CLEAR_FILTERS' }
  | { op: 'STATEMENT'; statement: 'BS' | 'IS' | null }
  | { op: 'THRESHOLD'; minAbs: number | null; on: 'VARIANCE' | 'VALUE' }
  | { op: 'SORT'; by: 'VALUE' | 'VARIANCE' | 'LABEL'; period: string | null } | { op: 'TOP'; n: number | null }
  | { op: 'PERIODS'; periods: string[] } | { op: 'ADD_PERIOD'; period: string } | { op: 'REMOVE_PERIOD'; period: string } | { op: 'PRIMARY'; period: string } | { op: 'ORDER_PERIODS'; periods: string[] }
  | { op: 'COMPARE'; basis: 'PRIOR_PERIOD' | 'PRIOR_YEAR' | 'PERIOD'; period: string | null }
  | { op: 'ADD_MEASURE'; measure: MeasureId } | { op: 'REMOVE_MEASURE'; measure: MeasureId }
  | { op: 'EXPAND'; target: RowTarget } | { op: 'COLLAPSE'; target: RowTarget } | { op: 'EXPAND_ALL' } | { op: 'COLLAPSE_ALL' }
  | { op: 'VARIANT'; dim: DimensionId; variants: Variant[] }
  | { op: 'DRILL'; target: RowTarget } | { op: 'EXPLAIN'; target: RowTarget } | { op: 'FLUX' } | { op: 'RECON' } | { op: 'SUPPORT'; missing: boolean }
  | { op: 'CHART' } | { op: 'EXCEL' } | { op: 'SAVE'; name: string | null } | { op: 'DUPLICATE'; period: string } | { op: 'MORE' }
  | { op: 'NOTE'; text: string };

export interface EditDeps { gl: GovernedLedger; graph: FinancialGraph; actor: Actor; visible: Visible; periods: string[]; workingPeriod: string }

/* ---- members ------------------------------------------------------------------------------------------------ */
const DIM_WORDS: [RegExp, DimensionId][] = [
  [/\b(accounts?|account groups?|gl accounts?)\b/, 'account'], [/\b(financial (statement )?lines?|statement lines?|fs lines?)\b/, 'financialLine'],
  [/\b(entit(y|ies)|legal entit(y|ies)|subsidiar(y|ies)|companies|company)\b/, 'entity'], [/\bregions?\b/, 'region'],
  [/\bprojects?\b/, 'project'], [/\bpropert(y|ies)|sites?\b/, 'property'], [/\bvendors?|suppliers?\b/, 'vendor'],
  [/\bcost cent(er|re)s?\b/, 'costCenter'], [/\bcurrenc(y|ies)\b/, 'currency'], [/\bsource systems?|erps?\b/, 'sourceSystem'],
  [/\brecord types?\b/, 'recordType'], [/\b(months?|periods?)\b/, 'period'], [/\bbooks?\b/, 'book'],
];
const NOT_HELD: [RegExp, string][] = [[/\bdepartments?\b/, 'department'], [/\bcustomers?\b/, 'customer'], [/\bfunds?\b/, 'fund'], [/\bbusiness units?\b/, 'business unit']];
export function dimsIn(t: string): DimensionId[] {
  const out: { d: DimensionId; at: number }[] = [];
  for (const [re, d] of DIM_WORDS) { const m = t.match(re); if (m && !out.some((x) => x.d === d)) out.push({ d, at: m.index! }); }
  return out.sort((a, b) => a.at - b.at).map((x) => x.d);
}

/** resolve names to canonical members through the actor's permitted view; never a member the actor cannot see */
export function resolveMembers(text: string, d: EditDeps): Member[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9&\- ]+/g, ' ')} `;
  const out: Member[] = [];
  const add = (m: Member) => { if (!out.some((x) => x.dimension === m.dimension && x.value === m.value)) out.push(m); };
  /* accounts: code, alias, or the governed account name (group level preferred: "cash" is 10000, not 10100) */
  const accts = d.gl.accounts();
  const vis = (code: string) => d.gl.lines.some((l) => (l.account === code || l.group === code) && (d.visible === 'ALL' || d.visible.has(l.entity)));
  for (const [alias, name] of Object.entries(ACCOUNT_ALIAS)) if (new RegExp(`\\b${alias.replace(/[&]/g, '\\&')}\\b`).test(t)) {
    const a = accts.find((x) => !x.parent && x.name.toLowerCase().startsWith(name)); if (a && vis(a.code)) add({ dimension: 'account', value: a.code, label: `${a.code} ${a.name}` });
  }
  for (const a of accts) {
    const nm = a.name.toLowerCase(), short = nm.split(/\s*&\s*|,\s*/)[0]!.trim();
    const hit = t.includes(` ${a.code} `) || t.includes(` ${nm} `) || (!a.parent && short.length >= 4 && new RegExp(`\\b${short.replace(/[-]/g, '\\-')}\\b`).test(t));
    if (hit && vis(a.code) && !(a.parent && out.some((x) => x.value === a.parent))) add({ dimension: 'account', value: a.code, label: `${a.code} ${a.name}` });
  }
  /* projects, vendors, entities, properties: the permission-filtered semantic graph */
  const PFX: Record<string, DimensionId> = { project: 'project', vendor: 'vendor', entity: 'entity', property: 'property', costcenter: 'costCenter' };
  for (const m of d.graph.mentions(text, d.actor)) {
    const ids = m.ids.filter((id) => PFX[id.split(':')[0]!]);
    const active = ids.filter((id) => !id.startsWith('vendor:') || d.gl.vendors().includes(id.slice(7)));
    for (const id of (active.length ? active : ids).slice(0, active.length ? active.length : 1)) {
      const dim = PFX[id.split(':')[0]!]!, v = id.slice(id.indexOf(':') + 1);
      if (dim === 'entity' && d.visible !== 'ALL' && !d.visible.has(v)) continue;
      const node = d.graph.node(id, d.actor);
      if (!node) continue;
      if (dim === 'property') { const p = String(node.attrs['code'] ?? v); add({ dimension: 'property', value: p, label: node.label }); continue; }
      add({ dimension: dim, value: v, label: node.label });
    }
  }
  /* raw dimension members the ledger holds (cost centres, currencies, property codes) */
  for (const dim of ['costCenter', 'currency', 'property', 'project'] as const) for (const v of d.gl.dimensionValues(dim)) if (v.length >= 3 && t.includes(` ${v.toLowerCase()} `)) add({ dimension: dim, value: v, label: v });
  return out;
}

/* ---- periods ------------------------------------------------------------------------------------------------ */
function periodsIn(text: string, d: EditDeps): { periods: string[]; range: boolean; notes: string[] } {
  const rs = resolvePeriods(text, { periods: d.periods, workingPeriod: d.workingPeriod }).filter((r) => r.kind !== 'PLANNING');
  const notes = rs.filter((r) => r.status === 'NOT_GOVERNED').map((r) => r.note || `${r.label} is not governed.`);
  const months = rs.filter((r) => r.governedMonths.length).flatMap((r) => (r.kind === 'MONTH' ? [r.end!] : r.governedMonths));
  const range = /\b(through|thru|to|until)\b|\s[-–]\s?|\w[-–]\w/.test(text) && rs.filter((r) => r.kind === 'MONTH').length === 2;
  if (range) { const [a, b] = [...months].sort(); return { periods: d.periods.filter((p) => p >= a! && p <= b!), range, notes }; }
  return { periods: [...new Set(months)], range, notes };
}

/* the model is consulted to CREATE an analysis only when the words describe a grid's shape — a statement or TB by a
   dimension, or rows and columns — never for a review, a question or a movement mentioned in passing */
const ANALYTIC = /\b((balance sheet|bs|income statement|p ?& ?l|trial balance|tb|activity)\b.*\bby (entity|entities|project|vendor|account|month|region|cost cent(er|re)|property)|(rows?|columns?|down the side|across the top|side by side)\b)/;
const DELIVERABLE = /^\s*(please\s+)?(create|build|make|generate|prepare|draft|compile|email|send|export)\b/;

/** does this look like a request to CREATE an analysis (not a question, not a deliverable)? */
export function looksAnalytical(t: string) { return ANALYTIC.test(t.toLowerCase()) && !DELIVERABLE.test(t.toLowerCase()) && !/\?\s*$|^(why|how|what|who|which)\b/i.test(t.trim()); }

/**
 * The deterministic reader. Returns ops, or null when the words are not about the analysis (they fall through to the
 * rest of Sloane) — `active` is the analysis on screen, when there is one.
 */
export function parseAnalysis(text: string, active: AnalysisDefinition | null, d: EditDeps): AnalysisOp[] | null {
  const t = text.toLowerCase().replace(/[.!]+$/, '').trim();
  if (!t || t.length > 220 || DELIVERABLE.test(t)) return null;
  /* a question is answered by the governed tools; an analysis is asked for as an instruction */
  if (!active && (/\?\s*$/.test(t) || /^(what|why|how|which|who|when|where|did|does|is|are)\b/.test(t))) return null;
  const ops: AnalysisOp[] = [];
  const pr = periodsIn(t, d);

  /* ---- a new analysis ---- */
  const bsWord = /\b(balance sheets?|\bbs\b)/.test(t), isWord = /\b(income statements?|p ?& ?l|profit and loss)\b/.test(t), tbWord = /\b(trial balance|\btb\b)/.test(t);
  const actWord = /\bactivity\b/.test(t) && /\bby\b|\bmonthly\b/.test(t);
  const startNew = !active || /^(show|give|get|pull|open|let'?s see|i want|can you show)\b/.test(t) && (bsWord || isWord || tbWord || actWord) && !/^(show|give)( me)? (the )?(gl|general ledger|support|reconciliation)\b/.test(t);
  /* a bare "balance sheet" or "only BS" is the canvas's or the conversation's; a new analysis is asked for explicitly */
  const asked = /^(show|give|get|pull|open|let'?s see|i want|can you show|display|run)\b/.test(t) || pr.periods.length > 0 || /\bby\b/.test(t);
  if (startNew && asked && !/^(add|put|only|just|remove|include|exclude)\b/.test(t) && (bsWord || isWord || tbWord || actWord) && !/\bfor (south valley|mdh|[a-z]+ project)\b/.test(t) && !(tbWord && /\bfor\b/.test(t) && !/\bby\b/.test(t) && pr.periods.length < 2) && !/\btie[- ]?out|tab\b|workbook|package/.test(t)) {
    /* a named scope the actor may not view is refused — never silently narrowed to the scope they do have */
    if (/\b(consolidated|group|enterprise|company[- ]wide|all entities)\b/.test(t) && d.actor.scopeIds !== 'ALL') return [{ op: 'NOTE', text: `Not permitted: ${d.actor.role} may not view scope GROUP.` }];
    const periods = pr.periods.length ? pr.periods : [d.workingPeriod];
    const members = resolveMembers(t, d);
    const by = t.match(/\bby ([a-z ,&]+)/)?.[1] ?? '';
    const byDims = dimsIn(by).filter((x) => x !== 'period' && x !== 'account');
    const monthly = /\bmonthly\b|\bby month\b|months? (on|across)/.test(t) || periods.length > 1;
    let type: AnalysisType, rows: AxisDim[], measures: MeasureId[], statement: 'BS' | 'IS' | null = null, name: string;
    if (actWord && !bsWord && !isWord && !tbWord) {
      type = 'ANALYSIS'; measures = ['ACTIVITY'];
      rows = byDims.length ? byDims.map((x) => ({ dimension: x })) : [{ dimension: 'account' }];
      const subject = members.filter((m) => m.dimension === 'account').map((m) => m.label.replace(/^\d+\s/, '')).join(', ') || 'GL';
      name = `${subject} activity${byDims.length ? ` by ${byDims.join(' and ')}` : ''}`;
    } else if (tbWord) {
      type = 'TRIAL_BALANCE'; measures = ['ENDING_BALANCE'];
      rows = [...byDims.map((x) => ({ dimension: x })), { dimension: 'account' as const }];
      name = `Trial balance${byDims.length ? ` by ${byDims.join(', ')}` : ''}`;
    } else {
      type = 'STATEMENT'; measures = ['ENDING_BALANCE']; statement = bsWord && !isWord ? 'BS' : isWord && !bsWord ? 'IS' : null;
      rows = [...byDims.map((x) => ({ dimension: x })), { dimension: 'account' as const }];
      name = statement === 'IS' ? 'Income statement' : statement === 'BS' ? 'Balance sheet' : 'Financial statements';
    }
    name = `${name} · ${periods.length > 1 ? `${periodLabel(periods[0]!)}–${periodLabel(periods.at(-1)!)}` : periodLabel(periods[0]!)}`;
    ops.push({ op: 'NEW', analysisType: type, statement, periods, rows, columns: [{ dimension: 'period' }], measures, filters: members.filter((m) => !(type === 'STATEMENT' && m.dimension === 'account' && false)), name });
    void monthly;
    pr.notes.forEach((n) => ops.push({ op: 'NOTE', text: n }));
    return ops;
  }
  if (!active) return null;

  /* ---- actions on the active analysis ---- */
  const rank = (() => { const m = t.match(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|top)\b(?: (?:one|row|item|line))?/); return m ? ({ first: 1, top: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5 } as Record<string, number>)[m[1]!]! : null; })();
  const pointer = /\b(this|that|it|these|here|this number|this cell|this one)\b/.test(t);
  const target = (): RowTarget => (/\blargest|biggest\b/.test(t) ? { kind: 'largest' } : rank ? { kind: 'rank', n: rank } : pointer ? { kind: 'active' } : ((): RowTarget => { const ms = resolveMembers(t, d); return ms.length ? { kind: 'member', memberIds: ms.map((m) => `${m.dimension}:${m.value}`) } : { kind: 'active' }; })());
  if (/\b(gl|general ledger|ledger|transactions|journal lines|entries|population)\b/.test(t) && /\b(show|drill|behind|open|see|view|what'?s)\b/.test(t) || /\bwhat'?s behind\b|\bdrill\b/.test(t)) return [{ op: 'DRILL', target: target() }];
  if (/\bwhy did\b|\bwhat (caused|drove|explains)\b|\bexplain (this|it|that|the)\b|\bwhy is (this|it)\b/.test(t)) return [{ op: 'EXPLAIN', target: target() }];
  if (/\bflux\b/.test(t) && /\b(explain|explanation|status|does)\b/.test(t)) return [{ op: 'FLUX' }];
  if (/\breconcil/.test(t) && /\b(does|show|is|related)\b/.test(t)) return [{ op: 'RECON' }];
  if (/\b(support|evidence|invoices?)\b/.test(t) && /\b(does|has|have|show|missing|any)\b/.test(t)) return [{ op: 'SUPPORT', missing: /\bmissing\b/.test(t) }];
  if (/\bchart\b|\bgraph\b|\bplot\b|\bvisuali[sz]e\b/.test(t)) return [{ op: 'CHART' }];
  if (/\b(open|send|put) (this|it) in excel\b|\bin excel\b/.test(t)) return [{ op: 'EXCEL' }];
  if (/^save (this|the)( analysis| view| grid)?\b|^save as\b/.test(t)) return [{ op: 'SAVE', name: text.match(/\b(?:as|called|named)\s+["“]?(.+?)["”]?$/i)?.[1] ?? null }];
  if (/\buse this (analysis|view|layout)? ?for\b|\bsame (analysis|view) for\b|\brun this for\b/.test(t) && pr.periods.length) return [{ op: 'DUPLICATE', period: pr.periods.at(-1)! }];
  if (/^(more|more rows|next page|show more|load more)$/.test(t)) return [{ op: 'MORE' }];

  /* ---- layout ---- */
  const dims = dimsIn(t);
  for (const [re, nm] of NOT_HELD) if (re.test(t) && /\b(add|by|under|put|show|on rows|columns)\b/.test(t)) return [{ op: 'NOTE', text: `A ${nm} dimension is not held on this server, so it cannot be added.` }];
  const variant = /\bsource\b/.test(t) ? 'SOURCE' : /\bgoverned\b/.test(t) ? 'GOVERNED' : /\beffective\b/.test(t) ? 'EFFECTIVE' : null;
  if (variant && dims.some((x) => x === 'vendor' || x === 'project' || x === 'account')) {
    const dim = dims.find((x) => x === 'vendor' || x === 'project' || x === 'account')!;
    const vs: Variant[] = /side by side|and effective|and governed|and source/.test(t) ? (['SOURCE', 'GOVERNED', 'EFFECTIVE'] as Variant[]).filter((v) => t.includes(v.toLowerCase())) : [variant as Variant];
    return [{ op: 'VARIANT', dim, variants: vs.length ? vs : [variant as Variant] }];
  }
  if (/\bon (the )?rows?\b|\bdown the side\b|\bas rows\b/.test(t) || /\bon (the )?columns?\b|\bacross the top\b|\bacross\b/.test(t)) {
    const rowPart = t.split(/\bon (?:the )?rows?\b|\bdown the side\b|\bas rows\b/)[0] ?? '';
    const colMatch = t.match(/(?:[,;]|\band\b)?\s*([a-z ]+?)\s+(?:on (?:the )?columns?|across(?: the top)?)/)?.[1] ?? (/\bput ([a-z ]+?) across\b/.exec(t)?.[1] ?? '');
    const rd = /\bon (the )?rows?\b|\bdown the side\b|\bas rows\b/.test(t) ? dimsIn(rowPart.replace(colMatch, '')).filter((x) => x !== 'period') : [];
    const cd = colMatch ? dimsIn(colMatch) : [];
    if (rd.length) ops.push({ op: 'SET_ROWS', dims: rd.map((x) => ({ dimension: x })) });
    if (cd.length) ops.push({ op: 'SET_COLUMNS', dims: cd.map((x) => ({ dimension: x })) });
    if (ops.length) return ops;
  }
  const firstThen = t.match(/^([a-z ]+?) first,? then ([a-z ]+)$/);
  if (firstThen) { const a = dimsIn(firstThen[1]!), b = dimsIn(firstThen[2]!); if (a.length && b.length) return [{ op: 'SET_ROWS', dims: [...a, ...b].map((x) => ({ dimension: x })) }]; }
  if (/\b(under|underneath|beneath|below|nested)\b|\bbreak (it |them |this )?down by\b|^by [a-z ]+$|\bthen by\b/.test(t) && dims.length) {
    const nd = dims.find((x) => !active.rows.some((r) => r.dimension === x) && x !== 'period');
    const anchor = t.match(/\b(?:under|underneath|beneath|below)\s+(?:the |each )?([a-z ]+)/)?.[1];
    const after = anchor ? dimsIn(anchor)[0] ?? null : null;
    if (nd) return [{ op: 'ADD_ROW_DIM', dim: { dimension: nd }, after }];
  }
  if (/^(add|include|show) (a |the )?[a-z ]+$/.test(t) && dims.length && !/\b(variance|ytd|qtd|debit|credit|beginning|activity|may|june|april|march|february|january)\b/.test(t)) {
    const nd = dims.find((x) => !active.rows.some((r) => r.dimension === x) && x !== 'period');
    if (nd) return [{ op: 'ADD_ROW_DIM', dim: { dimension: nd }, after: null }];
  }
  if (/\bmove ([a-z ]+) to (the )?columns?\b/.test(t) && dims.length) return [{ op: 'MOVE_TO_COLUMNS', dim: dims[0]! }];
  if (/^(remove|drop|take out|hide|without) /.test(t) && dims.length && !pr.periods.length) return [{ op: 'REMOVE_DIM', dim: dims[0]! }];

  /* ---- periods ---- */
  if (/\bcompare to (the )?prior year\b|\bvs\.? (last|prior) year\b|\byear over year\b|\byoy\b/.test(t)) return [{ op: 'COMPARE', basis: 'PRIOR_YEAR', period: null }];
  if (pr.periods.length) {
    if (/^add\b/.test(t)) return pr.periods.map((p) => ({ op: 'ADD_PERIOD', period: p }) as AnalysisOp);
    if (/^(remove|drop)\b/.test(t)) return pr.periods.map((p) => ({ op: 'REMOVE_PERIOD', period: p }) as AnalysisOp);
    if (/\bprimary\b|\bmain month\b|\bfocus on\b/.test(t)) return [{ op: 'PRIMARY', period: pr.periods[0]! }];
    if (/\bbefore\b|\bafter\b|\border\b/.test(t) && pr.periods.length === 2) { const [a, b] = pr.periods; return [{ op: 'ORDER_PERIODS', periods: /\bafter\b/.test(t) ? [b!, a!] : [a!, b!] }]; }
    if (/\bcompare\b|\bvs\.?\b|\bversus\b/.test(t) && pr.periods.length === 2) return [{ op: 'PERIODS', periods: [...pr.periods].sort() }, { op: 'COMPARE', basis: 'PERIOD', period: [...pr.periods].sort()[0]! }, { op: 'ADD_MEASURE', measure: 'VARIANCE' }];
    if (/^(show|give|make it|use)\b/.test(t) || pr.range) return [{ op: 'PERIODS', periods: pr.periods }];
  }
  if (/\bcompare (to|with) (the )?prior (month|period)\b|\bvs\.? (last|prior) month\b|\bmonth over month\b|\bmom\b/.test(t)) return [{ op: 'COMPARE', basis: 'PRIOR_PERIOD', period: null }, { op: 'ADD_MEASURE', measure: 'VARIANCE' }];

  /* ---- measures ---- */
  if (/\b(add|show|include)\b.*\bvariance ?%|\bpercent(age)? (change|variance)\b/.test(t)) return [{ op: 'COMPARE', basis: 'PRIOR_PERIOD', period: null }, { op: 'ADD_MEASURE', measure: 'VARIANCE' }, { op: 'ADD_MEASURE', measure: 'VARIANCE_PCT' }];
  if (/\b(add|show|include)\b.*\b(variance|change|movement)s?\b/.test(t) && !/\bonly\b/.test(t)) return [{ op: 'COMPARE', basis: 'PRIOR_PERIOD', period: null }, { op: 'ADD_MEASURE', measure: 'VARIANCE' }];
  const measureWords: [RegExp, MeasureId][] = [[/\bdebits?\b/, 'DEBIT'], [/\bcredits?\b/, 'CREDIT'], [/\bytd\b|\byear to date\b/, 'YTD_ACTIVITY'], [/\bqtd\b|\bquarter to date\b/, 'QTD_ACTIVITY'], [/\bbeginning balance|opening balance\b/, 'BEGINNING_BALANCE'], [/\bactivity\b/, 'ACTIVITY'], [/\bending balance|\bbalances?\b/, 'ENDING_BALANCE']];
  const mw = measureWords.filter(([re]) => re.test(t)).map(([, m]) => m);
  if (mw.length && /^(add|show|include)\b/.test(t)) return mw.map((m) => ({ op: 'ADD_MEASURE', measure: m }) as AnalysisOp);
  if (mw.length && /^(remove|drop|hide)\b/.test(t)) return mw.map((m) => ({ op: 'REMOVE_MEASURE', measure: m }) as AnalysisOp);
  if (/^(remove|drop|hide) (the )?variance/.test(t)) return [{ op: 'REMOVE_MEASURE', measure: 'VARIANCE' }, { op: 'REMOVE_MEASURE', measure: 'VARIANCE_PCT' }];

  /* ---- filters, thresholds, sorts ---- */
  const money = t.match(/\$?\s?(\d+(?:\.\d+)?)\s?(m|mm|million|k|thousand|b|bn|billion)?\b/);
  const amt = money && /\b(over|above|more than|greater than|at least|>|exceeding|bigger than)\b/.test(t) ? Number(money[1]) * (({ k: 1e-3, thousand: 1e-3, b: 1e3, bn: 1e3, billion: 1e3 } as Record<string, number>)[money[2] ?? 'm'] ?? 1) : null;
  if (amt !== null) return [{ op: 'THRESHOLD', minAbs: amt, on: /\b(movements?|changes?|variances?|moved)\b/.test(t) || active.measures.includes('VARIANCE') ? 'VARIANCE' : 'VALUE' }];
  if (/\b(material|matter|should care about|significant|important)\b/.test(t) && /\b(only|just|show)\b/.test(t)) return [{ op: 'THRESHOLD', minAbs: FLUX_MATERIALITY.absUsd / 1e6, on: active.measures.includes('VARIANCE') || /\bmovements?|changes?\b/.test(t) ? 'VARIANCE' : 'VALUE' }, { op: 'NOTE', text: `“Material” reads the governed flux materiality threshold (${FLUX_MATERIALITY.absUsd / 1e6 >= 1 ? `$${FLUX_MATERIALITY.absUsd / 1e6}M` : `$${FLUX_MATERIALITY.absUsd / 1e3}K`}).` }];
  if (/\b(only|just)\b.*\b(bs|balance sheet)\b( accounts)?/.test(t)) return [{ op: 'STATEMENT', statement: 'BS' }];
  if (/\b(only|just)\b.*\b(is|income statement|p ?& ?l)\b( accounts)?/.test(t) && !/\bwhat is\b/.test(t)) return [{ op: 'STATEMENT', statement: 'IS' }];
  if (/\bexclude (the )?eliminations?\b|\bwithout eliminations\b/.test(t)) return [{ op: 'NOTE', text: 'Eliminations are not held on this server; every line is source GL, so nothing is excluded.' }];
  if (/\bonly source gl\b|\bsource gl only\b/.test(t)) return [{ op: 'FILTER', members: [{ dimension: 'recordType', value: 'SOURCE_GL', label: 'Source GL' }], exclude: false }];
  if (/\bexclude (the )?fx\b|\bwithout fx\b|\bex[- ]?fx\b/.test(t)) return [{ op: 'FILTER', members: [{ dimension: 'account', value: '70300', label: '70300 Foreign-exchange gain/loss' }], exclude: true }, { op: 'NOTE', text: 'Excluded the governed FX gain/loss account. Translation of non-USD balances is part of every reported USD amount and cannot be removed from them.' }];
  const topN = t.match(/\btop (\d+|five|ten|three|twenty)\b/);
  if (topN) { const n = Number(topN[1]) || ({ three: 3, five: 5, ten: 10, twenty: 20 } as Record<string, number>)[topN[1]!]!; return [{ op: 'TOP', n }, ...(/\bonly\b|\bprojects?|vendors?|accounts?\b/.test(t) ? [{ op: 'SORT', by: active.measures.includes('VARIANCE') ? 'VARIANCE' : 'VALUE', period: null } as AnalysisOp] : [])]; }
  if (/\blargest first\b|\bbiggest first\b|\bsort (it |them )?(by )?(size|amount|largest|value)\b|\blargest to smallest\b|\bsort largest\b/.test(t)) return [{ op: 'SORT', by: active.measures.includes('VARIANCE') && /\bvarian|movement/.test(t) ? 'VARIANCE' : 'VALUE', period: null }];
  if (/\bbiggest (variances|movements|changes)\b|\bsort by (variance|movement|change)\b/.test(t)) return [...(active.measures.includes('VARIANCE') ? [] : [{ op: 'COMPARE', basis: 'PRIOR_PERIOD', period: null } as AnalysisOp, { op: 'ADD_MEASURE', measure: 'VARIANCE' } as AnalysisOp]), { op: 'SORT', by: 'VARIANCE', period: null }];
  const sortPeriod = t.match(/\bsort by ([a-z]+)\b/)?.[1]; if (sortPeriod) { const p = periodsIn(sortPeriod, d).periods[0]; if (p) return [{ op: 'SORT', by: 'VALUE', period: p }]; if (/name|label|alpha/.test(sortPeriod)) return [{ op: 'SORT', by: 'LABEL', period: null }]; }

  /* ---- expansion ---- */
  if (/^(expand|open up|drill into|break open)\b/.test(t)) return [/\ball\b/.test(t) ? { op: 'EXPAND_ALL' } : { op: 'EXPAND', target: target() }];
  if (/^(collapse|close)\b/.test(t)) return [/\ball\b/.test(t) ? { op: 'COLLAPSE_ALL' } : { op: 'COLLAPSE', target: target() }];

  /* ---- member filters ("only cash and CIP", "only South Valley", "show Siemens", "exclude MDH") ---- */
  if (/^(only|just|filter( to)?|show( me)?( only)?|exclude|without|except|excluding|limit to|keep)\b/.test(t) || /\bonly$/.test(t)) {
    const ms = resolveMembers(t, d);
    if (ms.length) return [{ op: 'FILTER', members: ms, exclude: /^(exclude|without|except|excluding)\b/.test(t) }];
    /* a name the actor cannot see reads exactly like a name that does not exist — nothing about a hidden member leaks */
    const named = t.replace(/^(only|just|filter( to)?|show( me)?( only)?|exclude|without|except|excluding|limit to|keep)\s+/, '').replace(/\s+only$/, '').trim();
    if (named && !/\b(clear|remove|all|everything)\b/.test(named) && !dimsIn(named).length) return [{ op: 'NOTE', text: `Nothing named “${named}” is among the members you can see, so the analysis is unchanged.` }];
    if (/\b(clear|remove) (the )?filters?\b|\bshow (me )?(all|everything)\b/.test(t)) return [{ op: 'CLEAR_FILTERS' }];
  }
  if (/^(clear|remove|reset) (the )?filters?$|^show (me )?(all|everything)$/.test(t)) return [{ op: 'CLEAR_FILTERS' }];
  return null;
}

/* ---- the model's contract: the same ops, as structured output ---------------------------------------------------- */

/** translate the model's ops into governed ops — every name re-resolved, every dimension and period re-checked */
export function fromModel(e: AnalysisEdit, active: AnalysisDefinition | null, d: EditDeps): { ops: AnalysisOp[]; rejected: string[] } {
  const ops: AnalysisOp[] = [], rejected: string[] = [];
  const dimOf = (s: string) => dimsIn(s.toLowerCase())[0] ?? null;
  const per = (xs: string[]) => xs.filter((p) => d.periods.includes(p));
  const tgt = (o: ModelOp): RowTarget => (o.rowRef ? { kind: 'row', rowId: o.rowRef } : o.values.length ? { kind: 'member', memberIds: resolveMembers(o.values.join(' '), d).map((m) => `${m.dimension}:${m.value}`) } : { kind: 'active' });
  for (const o of e.ops) {
    switch (o.op) {
      case 'NEW_STATEMENT': case 'NEW_TRIAL_BALANCE': case 'NEW_ACTIVITY': {
        const periods = per(o.periods).length ? per(o.periods) : [d.workingPeriod];
        const dims = o.dimensions.map(dimOf).filter((x): x is DimensionId => !!x && x !== 'period');
        const type: AnalysisType = o.op === 'NEW_STATEMENT' ? 'STATEMENT' : o.op === 'NEW_TRIAL_BALANCE' ? 'TRIAL_BALANCE' : 'ANALYSIS';
        const rows: AxisDim[] = type === 'ANALYSIS' ? (dims.length ? dims : ['account' as DimensionId]).map((x) => ({ dimension: x })) : [...dims.filter((x) => x !== 'account'), 'account' as DimensionId].map((x) => ({ dimension: x }));
        ops.push({ op: 'NEW', analysisType: type, statement: o.statement === 'BS' || o.statement === 'IS' ? o.statement : null, periods, rows, columns: [{ dimension: 'period' }], measures: [type === 'ANALYSIS' ? 'ACTIVITY' : 'ENDING_BALANCE'], filters: resolveMembers(o.values.join(' '), d), name: `${type === 'STATEMENT' ? (o.statement === 'IS' ? 'Income statement' : 'Balance sheet') : type === 'TRIAL_BALANCE' ? 'Trial balance' : 'Activity'} · ${periods.map(periodLabel).join(', ')}` });
        break;
      }
      case 'SET_ROWS': case 'SET_COLUMNS': { const dims = o.dimensions.map(dimOf).filter((x): x is DimensionId => !!x); if (dims.length) ops.push({ op: o.op, dims: dims.map((x) => ({ dimension: x })) }); else rejected.push(`${o.op}: no governed dimension in ${o.dimensions.join(', ')}`); break; }
      case 'ADD_ROW_DIMENSION': { const x = dimOf(o.dimensions[0] ?? ''); if (x) ops.push({ op: 'ADD_ROW_DIM', dim: { dimension: x }, after: dimOf(o.dimensions[1] ?? '') }); else rejected.push(`not a governed dimension: ${o.dimensions[0]}`); break; }
      case 'REMOVE_DIMENSION': { const x = dimOf(o.dimensions[0] ?? ''); if (x) ops.push({ op: 'REMOVE_DIM', dim: x }); break; }
      case 'FILTER': case 'EXCLUDE': { const ms = resolveMembers(o.values.join(' '), d); if (ms.length) ops.push({ op: 'FILTER', members: ms, exclude: o.op === 'EXCLUDE' }); else rejected.push(`no governed member named ${o.values.join(', ')}`); break; }
      case 'ONLY_STATEMENT': ops.push({ op: 'STATEMENT', statement: o.statement === 'IS' ? 'IS' : o.statement === 'BS' ? 'BS' : null }); break;
      case 'THRESHOLD': ops.push({ op: 'THRESHOLD', minAbs: o.number ?? FLUX_MATERIALITY.absUsd / 1e6, on: active?.measures.includes('VARIANCE') ? 'VARIANCE' : 'VALUE' }); break;
      case 'SORT': ops.push({ op: 'SORT', by: /varian|move|change/i.test(o.measure ?? '') ? 'VARIANCE' : /label|name/i.test(o.measure ?? '') ? 'LABEL' : 'VALUE', period: per(o.periods)[0] ?? null }); break;
      case 'TOP': ops.push({ op: 'TOP', n: o.number ? Math.max(1, Math.min(100, Math.round(o.number))) : null }); break;
      case 'SET_PERIODS': { const p = per(o.periods); if (p.length) ops.push({ op: 'PERIODS', periods: p }); else rejected.push('no governed period'); break; }
      case 'ADD_PERIOD': per(o.periods).forEach((p) => ops.push({ op: 'ADD_PERIOD', period: p })); break;
      case 'REMOVE_PERIOD': per(o.periods).forEach((p) => ops.push({ op: 'REMOVE_PERIOD', period: p })); break;
      case 'PRIMARY_PERIOD': { const p = per(o.periods)[0]; if (p) ops.push({ op: 'PRIMARY', period: p }); break; }
      case 'COMPARE_PRIOR_PERIOD': ops.push({ op: 'COMPARE', basis: 'PRIOR_PERIOD', period: null }, { op: 'ADD_MEASURE', measure: 'VARIANCE' }); break;
      case 'COMPARE_PRIOR_YEAR': ops.push({ op: 'COMPARE', basis: 'PRIOR_YEAR', period: null }); break;
      case 'ADD_MEASURE': case 'REMOVE_MEASURE': { const m = (o.measure ?? '').toUpperCase().replace(/[^A-Z_%]/g, '_').replace('%', '_PCT') as MeasureId; if (['ENDING_BALANCE', 'BEGINNING_BALANCE', 'ACTIVITY', 'DEBIT', 'CREDIT', 'YTD_ACTIVITY', 'QTD_ACTIVITY', 'PRIOR_PERIOD', 'PRIOR_YEAR', 'VARIANCE', 'VARIANCE_PCT'].includes(m)) ops.push({ op: o.op === 'ADD_MEASURE' ? 'ADD_MEASURE' : 'REMOVE_MEASURE', measure: m }); else rejected.push(`unknown measure ${o.measure}`); break; }
      case 'EXPAND': ops.push({ op: 'EXPAND', target: tgt(o) }); break;
      case 'COLLAPSE': ops.push({ op: 'COLLAPSE', target: tgt(o) }); break;
      case 'DRILL': ops.push({ op: 'DRILL', target: tgt(o) }); break;
      case 'EXPLAIN': ops.push({ op: 'EXPLAIN', target: tgt(o) }); break;
      case 'FLUX': ops.push({ op: 'FLUX' }); break;
      case 'RECONCILIATION': ops.push({ op: 'RECON' }); break;
      case 'SUPPORT': ops.push({ op: 'SUPPORT', missing: false }); break;
      case 'CHART': ops.push({ op: 'CHART' }); break;
      case 'SAVE': ops.push({ op: 'SAVE', name: o.values[0] ?? null }); break;
    }
  }
  return { ops, rejected };
}
