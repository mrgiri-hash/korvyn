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
export type RowTarget = { kind: 'member'; memberIds: string[] } | { kind: 'rank'; n: number } | { kind: 'row'; rowId: string } | { kind: 'active' } | { kind: 'largest' } | { kind: 'smallest' };
export type AnalysisOp =
  | { op: 'NEW'; analysisType: AnalysisType; statement: 'BS' | 'IS' | null; periods: string[]; rows: AxisDim[]; columns: AxisDim[]; measures: MeasureId[]; filters: Member[]; name: string; /** 8C.2: the words named the periods (else they default to the working period) */ explicitPeriods?: boolean }
  | { op: 'SET_ROWS'; dims: AxisDim[] } | { op: 'SET_COLUMNS'; dims: AxisDim[] }
  | { op: 'ADD_ROW_DIM'; dim: AxisDim; after: DimensionId | null } | { op: 'REMOVE_DIM'; dim: DimensionId } | { op: 'MOVE_TO_COLUMNS'; dim: DimensionId }
  | { op: 'FILTER'; members: Member[]; exclude: boolean } | { op: 'CLEAR_FILTERS' }
  | { op: 'STATEMENT'; statement: 'BS' | 'IS' | null }
  | { op: 'THRESHOLD'; minAbs: number | null; on: 'VARIANCE' | 'VALUE'; minPct?: number | null }
  | { op: 'ACCOUNT_TYPES'; types: string[] } | { op: 'REMOVE_FILTER'; members: Member[]; dimension: DimensionId | null } | { op: 'UNDO' } | { op: 'REDO' }
  /* 8C.2: EPHEMERAL — answers which item ranks where and remembers the ranked rows as referents; the definition is untouched */
  | { op: 'RANK'; by: 'VALUE' | 'VARIANCE' | null; n: number; dir: 'DESC' | 'ASC' }
  /* 8C.2: "the other X" — resolved against the member(s) in context; one candidate replaces, several ask */
  | { op: 'OTHER'; term: string }
  /* 8C.2: point at a row without changing the grid (the first half of "open the biggest one") */
  | { op: 'SELECT'; target: RowTarget }
  /* 8C.2: "forget X" — drop X from the analysis and from the referents, whichever it is in */
  | { op: 'FORGET'; members: Member[] }
  | { op: 'CLARIFY'; question: string; options: string[] }
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
  /* entities by their canonical id or legal name — only those the actor may see */
  for (const e of d.gl.entities()) if ((d.visible === 'ALL' || d.visible.has(e.id)) && (t.includes(` ${e.id.toLowerCase()} `) || t.includes(` ${e.name.toLowerCase().replace(/[^a-z0-9&\- ]+/g, ' ')} `))) add({ dimension: 'entity', value: e.id, label: e.name });
  /* raw dimension members the ledger holds (cost centres, currencies, property codes) */
  for (const dim of ['costCenter', 'currency', 'property', 'project'] as const) for (const v of d.gl.dimensionValues(dim)) if (v.length >= 3 && t.includes(` ${v.toLowerCase()} `)) add({ dimension: dim, value: v, label: v });
  return out;
}

/**
 * 8C.2 — every governed member a NAME could mean, activity or not (a vendor-master record with no postings is still a
 * Siemens). Used by "the other X": the candidates are what the name could mean, less what is already in context.
 */
export function memberCandidates(term: string, d: EditDeps): Member[] {
  const PFX: Record<string, DimensionId> = { project: 'project', vendor: 'vendor', entity: 'entity', property: 'property', costcenter: 'costCenter' };
  const out: Member[] = [];
  for (const m of d.graph.mentions(term, d.actor)) for (const id of m.ids) {
    const dim = PFX[id.split(':')[0]!]; if (!dim) continue;
    const v = id.slice(id.indexOf(':') + 1);
    if (dim === 'entity' && d.visible !== 'ALL' && !d.visible.has(v)) continue;
    const node = d.graph.node(id, d.actor); if (!node) continue;
    const value = dim === 'property' ? String(node.attrs['code'] ?? v) : v;
    if (!out.some((x) => x.dimension === dim && x.value === value)) out.push({ dimension: dim, value, label: node.label });
  }
  if (!out.length) for (const x of resolveMembers(term, d)) out.push(x);
  return out;
}

/** the governed members the model may name, filtered to what the actor can see — the semantic context for an edit */
export function vocabulary(d: EditDeps) {
  const lines = d.gl.lines.filter((l) => d.visible === 'ALL' || d.visible.has(l.entity));
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  const groups = uniq(lines.map((l) => l.group)).sort();
  return {
    accountGroups: groups.map((g) => ({ code: g, name: d.gl.account(g)?.name ?? g, type: d.gl.account(g)?.type ?? null, children: d.gl.childrenOf(g).filter((c) => lines.some((l) => l.account === c)).map((c) => `${c} ${d.gl.account(c)?.name ?? ''}`.trim()) })),
    accountTypes: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
    entities: uniq(lines.map((l) => l.entity)).map((e) => ({ id: e, name: lines.find((l) => l.entity === e)!.entityName })),
    projects: uniq(lines.map((l) => l.project).filter((x): x is string => !!x)),
    properties: uniq(lines.map((l) => l.property).filter((x): x is string => !!x)),
    vendors: uniq(lines.map((l) => l.vendor).filter((x): x is string => !!x)),
    costCenters: uniq(lines.map((l) => l.costCenter).filter((x): x is string => !!x)),
    notHeld: ['department', 'customer', 'fund', 'business unit', 'eliminations', 'budget', 'forecast', 'prior year (FY2025)'],
  };
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
/* A VOCABULARY gate, not a phrase list: the request names a governed grid object (a statement, a trial balance, GL
   activity, rows / columns) or asks for a split by a governed dimension. It only decides whether the analysis editor is
   ASKED first; the model decides what the words mean, and anything it misses still reaches the front door, whose
   ANALYSIS_REQUEST intent routes back here. */
const GRID_NOUN = /\b(balance ?sheets?|b\/?s|bs|income statements?|p ?& ?l|pnl|profit (and|&) loss|statements? of (financial position|operations)|trial balances?|t\/?b|tb|roll ?-?forwards?|gl activity|activity|grid|pivot|matrix|columns?|rows?)\b/;
const SPLIT = /\b(by|per|split|broken|break|across|under|grouped|group)\b/;
const DIM_NOUN = /\b(entit(y|ies)|subsidiar(y|ies)|compan(y|ies)|subs?|legal entit|projects?|vendors?|suppliers?|accounts?|regions?|cost ?cent(er|re)s?|propert(y|ies)|currenc(y|ies)|months?|periods?|quarters?)\b/;
/* a question ("why did the balance sheet move?") is answered by the governed tools, not built as a grid: syntax, not phrasing */
const QUESTION = /\?\s*$|^(why|how|what|who|which|when|where|did|does|do|is|are|was|were|can|could)\b/;
export function wantsAnalysisEditor(t: string) { const s = t.toLowerCase().trim(); return !DELIVERABLE.test(s) && !QUESTION.test(s) && (GRID_NOUN.test(s) || (SPLIT.test(s) && DIM_NOUN.test(s)) || (s.match(new RegExp(DIM_NOUN.source, 'g')) ?? []).length >= 2); }

/** a structured UI command from the grid (a chevron, a Drill button) — unambiguous by construction, so no model */
export type UiCommand = 'EXPAND' | 'COLLAPSE' | 'DRILL' | 'EXPLAIN' | 'RECON' | 'FLUX' | 'SUPPORT' | 'MORE' | 'EXPAND_ALL' | 'COLLAPSE_ALL';
export const UI_COMMANDS: readonly UiCommand[] = ['EXPAND', 'COLLAPSE', 'DRILL', 'EXPLAIN', 'RECON', 'FLUX', 'SUPPORT', 'MORE', 'EXPAND_ALL', 'COLLAPSE_ALL'];
export function uiCommandOps(c: UiCommand): AnalysisOp[] {
  const target: RowTarget = { kind: 'active' };
  switch (c) {
    case 'EXPAND': return [{ op: 'EXPAND', target }];
    case 'COLLAPSE': return [{ op: 'COLLAPSE', target }];
    case 'DRILL': return [{ op: 'DRILL', target }];
    case 'EXPLAIN': return [{ op: 'EXPLAIN', target }];
    case 'RECON': return [{ op: 'RECON' }];
    case 'FLUX': return [{ op: 'FLUX' }];
    case 'SUPPORT': return [{ op: 'SUPPORT', missing: false }];
    case 'MORE': return [{ op: 'MORE' }];
    case 'EXPAND_ALL': return [{ op: 'EXPAND_ALL' }];
    case 'COLLAPSE_ALL': return [{ op: 'COLLAPSE_ALL' }];
  }
}

export function looksAnalytical(t: string) { return ANALYTIC.test(t.toLowerCase()) && !DELIVERABLE.test(t.toLowerCase()) && !/\?\s*$|^(why|how|what|who|which)\b/i.test(t.trim()); }

/* 8C.2 — grammar, not phrases: a history command; a correction marker; a restrictive particle; a wh-question about rank */
export function historyCommand(t: string): 'UNDO' | 'REDO' | null {
  const s = t.toLowerCase().replace(/[.!]+$/, '').trim();
  if (/^(redo|re-?do|re-?apply|put (it|that) back)( (that|it|the (last )?(change|step)))?$/.test(s)) return 'REDO';
  if (/^(undo|revert|reverse|roll ?back|take back)( (that|this|it|the last|my last))?( (change|step|edit|one))?$/.test(s)) return 'UNDO';
  if (/^((go|take me|bring me|step|jump) back)( (one|a) step)?( to (the )?(previous|last|prior|earlier) (analysis|view|version|one|state|grid|table))?$/.test(s)) return 'UNDO';
  if (/^(back to )?(the )?(previous|prior|earlier|last) (analysis|view|version|state|grid|table)( please)?$/.test(s)) return 'UNDO';
  return null;
}
/** a rejection that says the last reading was wrong without saying what was meant */
export const REJECTION = /^(that'?s|that is|this is|this'?s) (not|wrong|incorrect)\b|^(wrong|not what i (asked|meant|wanted)|that'?s not it|no,? that'?s wrong)\b/;
/** discourse markers that open a request and carry no meaning of their own */
const DISCOURSE = /^(now|ok|okay|and|then|so|right|alright|next|also|hmm+|um+)\b[,\s]+/;
export const CORRECTION_LEAD = /^(no|nope|not that|actually|sorry|rather|wait|i meant|i mean|i said)\b[,:;\s]*(i meant\b[,\s]*)?/;
const RESTRICT = /\b(only|just|exclusively|solely|restrict(ed)? to|limit(ed)? to)\b/;
const WH_RANK = /^(which|what|who)\b|^(tell me|show me) which\b/;
const SUPERLATIVE = /\b(most|largest|biggest|highest|greatest|smallest|least|lowest|top|worst|best)\b/;

/**
 * The deterministic reader. Returns ops, or null when the words are not about the analysis (they fall through to the
 * rest of Sloane) — `active` is the analysis on screen, when there is one.
 */
export function parseAnalysis(text: string, active: AnalysisDefinition | null, d: EditDeps): AnalysisOp[] | null {
  let t = text.toLowerCase().replace(/[.!]+$/, '').trim();
  if (!t || t.length > 220 || DELIVERABLE.test(t)) return null;
  /* 8C.2: history commands act on the conversation's analysis history, whichever analysis is on screen */
  const hc = historyCommand(t); if (hc) return [{ op: hc }];
  while (DISCOURSE.test(t)) t = t.replace(DISCOURSE, '');
  /* a rejection with no content: the last reading was wrong — go back and ask what was meant */
  if (active && REJECTION.test(t) && !/\b(other|another|different|meant)\b/.test(t)) return [{ op: 'CLARIFY', question: 'That was not what you asked — what should it show instead?', options: [] }];
  /* a correction marker says the rest REPLACES a stale value; the rest is read like any other edit */
  const corr = active ? CORRECTION_LEAD.exec(t) : null;
  if (corr && t.length > corr[0].length) t = t.slice(corr[0].length).trim();
  /* a question is answered by the governed tools; an analysis is asked for as an instruction */
  if (!active && (/\?\s*$/.test(t) || /^(what|why|how|which|who|when|where|did|does|is|are)\b/.test(t))) return null;
  const ops: AnalysisOp[] = [];
  const pr = periodsIn(t, d);

  /* ---- a new analysis ---- */
  const bsWord = /\b(balance sheets?|\bbs\b)/.test(t), isWord = /\b(income statements?|p ?& ?l|profit and loss)\b/.test(t), tbWord = /\b(trial balance|\btb\b)/.test(t);
  /* GL activity: asked for by name, or an account broken down by a governed dimension with no statement named */
  const acctSplit = !/\b(balance sheets?|bs|income statements?|p ?& ?l|trial balance|tb)\b/.test(t) && /\bby (projects?|vendors?|entit(y|ies)|cost cent(er|re)s?|propert(y|ies)|regions?|months?)\b/.test(t) && resolveMembers(t, d).some((m) => m.dimension === 'account');
  const actWord = (/\bactivity\b/.test(t) && /\bby\b|\bmonthly\b/.test(t)) || acctSplit;
  const startNew = !active || (/^(show|give|get|pull|open|let'?s see|i want|can you show)\b/.test(t) || /\binstead\b/.test(t)) && (bsWord || isWord || tbWord || actWord) && !/^(show|give)( me)? (the )?(gl|general ledger|support|reconciliation)\b/.test(t);
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
    ops.push({ op: 'NEW', analysisType: type, statement, periods, rows, columns: [{ dimension: 'period' }], measures, filters: members.filter((m) => !(type === 'STATEMENT' && m.dimension === 'account' && false)), name, explicitPeriods: pr.periods.length > 0 });
    void monthly;
    pr.notes.forEach((n) => ops.push({ op: 'NOTE', text: n }));
    return ops;
  }
  if (!active) return null;

  /* ---- actions on the active analysis ---- */
  /* a correction that names only a period replaces the period that was wrong (the primary one, when there are several) */
  if (corr && pr.periods.length && !resolveMembers(t, d).length && !/\b(bs|balance sheet|income statement|p ?& ?l|trial balance|tb)\b/.test(t))
    return active.periods.length === 1 || pr.periods.length > 1 ? [{ op: 'PERIODS', periods: pr.periods }] : [{ op: 'PRIMARY', period: pr.periods[0]! }];
  /* "forget X": X leaves the analysis and the referents */
  if (/^(forget|never ?mind|drop|ignore|leave out|stop looking at)\b/.test(t)) { const ms = resolveMembers(t, d); if (ms.length) return [{ op: 'FORGET', members: ms }]; }
  /* an explicit limit — asked to SEE only that many — persists: it is not a question about rank */
  if (RESTRICT.test(t) && /\b(largest|biggest|top|smallest|highest|lowest)\b/.test(t) && !resolveMembers(t, d).length) {
    const nWord = t.match(/\b(two|three|four|five|ten|\d+)\b/)?.[1];
    const n = nWord ? Number(nWord) || ({ two: 2, three: 3, four: 4, five: 5, ten: 10 } as Record<string, number>)[nWord]! : 1;
    return [{ op: 'SORT', by: active.measures.includes('VARIANCE') ? 'VARIANCE' : 'VALUE', period: null }, { op: 'TOP', n }];
  }
  const rank = (() => { const m = t.match(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|top)\b(?: (?:one|row|item|line))?/); return m ? ({ first: 1, top: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5 } as Record<string, number>)[m[1]!]! : null; })();
  const pointer = /\b(this|that|it|these|here|this number|this cell|this one)\b/.test(t);
  const target = (): RowTarget => (/\blargest|biggest\b/.test(t) ? { kind: 'largest' } : rank ? { kind: 'rank', n: rank } : pointer ? { kind: 'active' } : ((): RowTarget => { const ms = resolveMembers(t, d); return ms.length ? { kind: 'member', memberIds: ms.map((m) => `${m.dimension}:${m.value}`) } : { kind: 'active' }; })());
  /* 8C.2 — "the other X": a member described relative to the one in context */
  const other = t.match(/\b(?:the |an? )?(?:other|another|different)\b\s*(?:one\b)?\s*(.*)$/);
  if (other && !/\bother (than|periods?|months?|accounts?|entities|dimensions?)\b/.test(t)) return [{ op: 'OTHER', term: other[1]!.replace(/\b(one|please|instead)\b/g, '').trim() }];
  /* composition vs identification: a question about what is BEHIND a row drills; a question about WHICH row ranks is ephemeral */
  if (/\b(gl|general ledger|ledger|transactions|journal lines|entries|population)\b/.test(t) && /\b(show|drill|behind|open|see|view|what'?s)\b/.test(t) || /\bwhat'?s behind\b|\bdrill\b|\b(behind|driving|made up of|makes up|composed of|comprises)\b/.test(t) || /^open (the |that |this )?(biggest|largest|smallest|first|second|third|top|one|it|this|that)\b/.test(t)) return [{ op: 'DRILL', target: target() }];
  if (WH_RANK.test(t) && SUPERLATIVE.test(t)) {
    const small = /\b(smallest|least|lowest|fewest|minimum)\b/.test(t), nWord = t.match(/\b(two|three|four|five|ten|\d+)\b/)?.[1];
    const n = nWord ? Number(nWord) || ({ two: 2, three: 3, four: 4, five: 5, ten: 10 } as Record<string, number>)[nWord]! : 1;
    const valueWords = /\b(balance|amount|size)\b/.test(t);
    return [{ op: 'RANK', by: active.measures.includes('VARIANCE') && !valueWords ? 'VARIANCE' : 'VALUE', n, dir: small ? 'ASC' : 'DESC' }];
  }
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
  /* a restrictive particle with a statement name restricts the grid on screen, in either word order */
  if (RESTRICT.test(t) && /\b(bs|b\/s|balance sheets?)\b/.test(t) && !/\b(income statements?|p ?& ?l)\b/.test(t)) return [{ op: 'STATEMENT', statement: 'BS' }];
  if (RESTRICT.test(t) && (/\b(income statements?|p ?& ?l|pnl)\b/.test(t) || /^(only |just )?is( only| accounts)?$/.test(t)) && !/\bwhat is\b/.test(t)) return [{ op: 'STATEMENT', statement: 'IS' }];
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

  /* a correction that names only a member replaces the stale member on its dimension */
  if (corr) { const ms = resolveMembers(t, d); if (ms.length) return /\b(remove|drop|clear|off|without|lose)\b/.test(t) ? [{ op: 'REMOVE_FILTER', members: ms, dimension: null }] : [{ op: 'FILTER', members: ms, exclude: false }]; }
  /* ---- member filters ("only cash and CIP", "only South Valley", "show Siemens", "exclude MDH") ---- */
  if (/^(only|just|filter( to)?|show( me)?( only)?|exclude|without|except|excluding|limit to|keep)\b/.test(t) || /\b(only|just)$/.test(t)) {
    const ms = resolveMembers(t, d);
    if (ms.length) return [{ op: 'FILTER', members: ms, exclude: /^(exclude|without|except|excluding)\b/.test(t) }];
    /* a name the actor cannot see reads exactly like a name that does not exist — nothing about a hidden member leaks */
    const named = t.replace(/^(only|just|filter( to)?|show( me)?( only)?|exclude|without|except|excluding|limit to|keep)\s+/, '').replace(/\s+(only|just)$/, '').trim();
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
  /* "the other X" is Korvyn's to resolve against the member in context — the model does not get to ask instead */
  if (e.targetReferent?.kind === 'OTHER_CANDIDATE') return { ops: [{ op: 'OTHER', term: e.targetReferent.values.join(' ') }], rejected };
  /* a clarification is the model's to recommend and Korvyn's to ask (context.ts decides whether it is warranted); it carries no edit */
  if ((e.requiresClarification || e.contextRelation === 'CLARIFY_REFERENT') && e.question) return { ops: [{ op: 'CLARIFY', question: e.question, options: e.options.slice(0, 5) }], rejected };
  const dimOf = (s: string) => dimsIn(s.toLowerCase())[0] ?? null;
  const per = (xs: string[]) => xs.filter((p) => d.periods.includes(p));
  /* the op's own pointer wins; otherwise the turn's stated targetReferent says which row */
  const R = e.targetReferent;
  const fromReferent = (): RowTarget | null => {
    if (!R) return null;
    switch (R.kind) {
      case 'LARGEST': return { kind: 'largest' };
      case 'SMALLEST': return { kind: 'smallest' };
      case 'RANK': return R.rank && R.rank > 0 ? { kind: 'rank', n: Math.round(R.rank) } : null;
      case 'ROW': return R.rowRef ? { kind: 'row', rowId: R.rowRef } : null;
      case 'SELECTED': return { kind: 'active' };
      case 'MEMBER': { const ms = resolveMembers(R.values.join(' '), d); return ms.length ? { kind: 'member', memberIds: ms.map((m) => `${m.dimension}:${m.value}`) } : null; }
      default: return null;
    }
  };
  const tgt = (o: ModelOp): RowTarget => {
    if (o.rowRef) return { kind: 'row', rowId: o.rowRef };
    if (!o.values.length) { const r = fromReferent(); if (r) return r; }
    /* the prompt's contract: values ["largest"] means the largest row; no values means the selected cell */
    if (o.values.length === 1 && o.values[0]!.toLowerCase() === 'largest') return { kind: 'largest' };
    const ms = o.values.length ? resolveMembers(o.values.join(' '), d) : [];
    return ms.length ? { kind: 'member', memberIds: ms.map((m) => `${m.dimension}:${m.value}`) } : { kind: 'active' };
  };
  for (const o of e.ops) {
    switch (o.op) {
      case 'NEW_STATEMENT': case 'NEW_TRIAL_BALANCE': case 'NEW_ACTIVITY': {
        const periods = per(o.periods).length ? per(o.periods) : [d.workingPeriod];
        const dims = o.dimensions.map(dimOf).filter((x): x is DimensionId => !!x && x !== 'period');
        const type: AnalysisType = o.op === 'NEW_STATEMENT' ? 'STATEMENT' : o.op === 'NEW_TRIAL_BALANCE' ? 'TRIAL_BALANCE' : 'ANALYSIS';
        const rows: AxisDim[] = type === 'ANALYSIS' ? (dims.length ? dims : ['account' as DimensionId]).map((x) => ({ dimension: x })) : [...dims.filter((x) => x !== 'account'), 'account' as DimensionId].map((x) => ({ dimension: x }));
        ops.push({ op: 'NEW', analysisType: type, statement: o.statement === 'BS' || o.statement === 'IS' ? o.statement : null, periods, rows, columns: [{ dimension: 'period' }], measures: [type === 'ANALYSIS' ? 'ACTIVITY' : 'ENDING_BALANCE'], filters: resolveMembers(o.values.join(' '), d), name: `${type === 'STATEMENT' ? (o.statement === 'IS' ? 'Income statement' : 'Balance sheet') : type === 'TRIAL_BALANCE' ? 'Trial balance' : 'Activity'} · ${periods.map(periodLabel).join(', ')}`, explicitPeriods: per(o.periods).length > 0 });
        break;
      }
      case 'SET_ROWS': case 'SET_COLUMNS': { const dims = o.dimensions.map(dimOf).filter((x): x is DimensionId => !!x); if (dims.length) ops.push({ op: o.op, dims: dims.map((x) => ({ dimension: x })) }); else rejected.push(`${o.op}: no governed dimension in ${o.dimensions.join(', ')}`); break; }
      case 'ADD_ROW_DIMENSION': { const x = dimOf(o.dimensions[0] ?? ''); if (x) ops.push({ op: 'ADD_ROW_DIM', dim: { dimension: x }, after: dimOf(o.dimensions[1] ?? '') }); else rejected.push(`not a governed dimension: ${o.dimensions[0]}`); break; }
      case 'REMOVE_DIMENSION': { const x = dimOf(o.dimensions[0] ?? ''); if (x) ops.push({ op: 'REMOVE_DIM', dim: x }); break; }
      case 'FILTER': case 'EXCLUDE': { const ms = resolveMembers(o.values.join(' '), d); if (ms.length) ops.push({ op: 'FILTER', members: ms, exclude: o.op === 'EXCLUDE' }); else rejected.push(`no governed member named ${o.values.join(', ')}`); break; }
      case 'ONLY_STATEMENT': ops.push({ op: 'STATEMENT', statement: o.statement === 'IS' ? 'IS' : o.statement === 'BS' ? 'BS' : null }); break;
      case 'THRESHOLD': { const pct = o.percent === null ? null : o.percent > 1 ? o.percent / 100 : o.percent;
        ops.push({ op: 'THRESHOLD', minAbs: o.number ?? (pct !== null ? 0 : FLUX_MATERIALITY.absUsd / 1e6), on: (active?.measures.includes('VARIANCE') || pct !== null) ? 'VARIANCE' : 'VALUE', minPct: pct }); break; }
      case 'ACCOUNT_TYPE': { const ts = o.values.map((v) => v.toUpperCase().replace(/S$/, '').replace('LIABILITIE', 'LIABILITY').replace('EXPENSE', 'EXPENSE')).filter((v) => ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(v));
        if (ts.length) ops.push({ op: 'ACCOUNT_TYPES', types: ts }); else rejected.push(`not a governed account type: ${o.values.join(', ')}`); break; }
      case 'REMOVE_FILTER': { const ms = o.values.length ? resolveMembers(o.values.join(' '), d) : []; ops.push({ op: 'REMOVE_FILTER', members: ms, dimension: dimOf(o.dimensions[0] ?? '') }); break; }
      case 'CLEAR_FILTERS': ops.push({ op: 'CLEAR_FILTERS' }); break;
      case 'UNDO': ops.push({ op: 'UNDO' }); break;
      case 'REDO': ops.push({ op: 'REDO' }); break;
      case 'SET_STATEMENT_BOTH': ops.push({ op: 'STATEMENT', statement: null }); break;
      case 'EXPAND_ALL': ops.push({ op: 'EXPAND_ALL' }); break;
      case 'COLLAPSE_ALL': ops.push({ op: 'COLLAPSE_ALL' }); break;
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
  /* 8C.2 — the parts of the contract that are not ops: an ephemeral ranking, and "the other X" */
  const E = e.ephemeralOperation;
  if (E && E.kind === 'RANK') ops.push({ op: 'RANK', by: E.by, n: E.n && E.n > 0 ? Math.min(20, Math.round(E.n)) : 1, dir: E.dir ?? 'DESC' });
  if (R && R.kind === 'OTHER_CANDIDATE') ops.push({ op: 'OTHER', term: R.values.join(' ') });
  /* a drill or an explanation the relation states but no op carries: the referent says which row */
  if ((e.contextRelation === 'DRILL_CURRENT' || e.contextRelation === 'EXPLAIN_CURRENT') && !ops.some((o) => ['DRILL', 'EXPLAIN', 'EXPAND', 'FLUX', 'RECON', 'SUPPORT', 'RANK', 'CHART', 'SAVE'].includes(o.op))) {
    const t = fromReferent(); if (t) ops.push({ op: e.contextRelation === 'DRILL_CURRENT' ? 'DRILL' : 'EXPLAIN', target: t });
  }
  return { ops, rejected };
}
