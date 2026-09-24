/**
 * THE CONVERSATIONAL RUNTIME (Phase 6) — what makes "By vendor.", "Only over $5M.", "Show the GL.", "May vs June."
 * and "Show the largest one." mean something without the user restating the question.
 *
 *   ConversationState   what the conversation is about now: the governed SUBJECT (account, vendor, project, entity),
 *                       the view (dimension, threshold, comparison), the last analysis Korvyn ran, the ordered items
 *                       it showed (for "the second one"), the last object resolved (for "it"), and the active
 *                       artifact / PBC request / proposal. Server-side and authoritative; the browser holds none of it.
 *   resolveConversational   a deterministic reading of a follow-up against that state. It returns a PLAN — never a
 *                       result: every step still goes through the Planner's validation, permission checks and the
 *                       same execution loop as a model plan. Conversational convenience never skips governance.
 *   capabilityGap / capabilityFallback   the honest "not that — but these" answer instead of a dead end.
 *
 * WHY DETERMINISTIC. A follow-up modifies the analysis already on screen; reading it needs the state, not a model.
 * Answering it without a model call is what makes a follow-up fast (and the same words always do the same thing).
 * A request this module does not recognise with certainty returns null and goes to the model — it never guesses.
 */
import type { Interpretation } from './schema.js';
import type { FinancialObject, ToolArgs } from './tools.js';
import { type FinancialDataService, periodLabel } from './financials.js';
import type { GovernedLedger } from './governed.js';
import type { ControlService } from './controls.js';
import type { PlanStep, SessionContext, Source } from './orchestrator.js';
import { ACCOUNT_ALIAS } from './toolset.js';

/* ================================================================================================
   STATE
   ================================================================================================ */
/** what a turn DID — an answer, a drill into what is shown, a change to the view, work on a deliverable, a proposed
 *  action, a move elsewhere, or a question back */
export type TurnKind = 'ANSWER' | 'DRILL' | 'MODIFY' | 'ARTIFACT' | 'ACTION' | 'NAVIGATION' | 'CLARIFICATION' | 'CONVERSATION' | 'CANVAS' | 'ANALYSIS';
/** how sure Korvyn is of a context value: stated this turn, carried forward recently, carried forward from further
 *  back, derived from policy or another value, or not known. An explicit instruction always wins. */
export type Confidence = 'EXPLICIT_HIGH' | 'INHERITED_HIGH' | 'INHERITED_MEDIUM' | 'DERIVED' | 'UNKNOWN';
export interface ActiveItem { rank: number; label: string; ref: string; amount: number | null; objectType: string }
export interface ResolvedRef { kind: string; id: string; name: string; account: string | null }
export interface Subject { account: string | null; accountName: string | null; vendor: string | null; project: string | null; entity: string | null }
export interface ConvState {
  turn: number;
  objective: string | null;
  lastIntent: string | null;
  lastKind: TurnKind | null;
  subject: Subject;
  dimension: string | null;
  /** a display threshold, USD millions ("only over $5M") — narrows breakdowns and GL populations until changed */
  minAbsAmount: number | null;
  /** a comparison the user asked for, kept even when it is unavailable ("compare it to last year") */
  comparisonBasis: 'PRIOR_PERIOD' | 'PRIOR_YEAR' | null;
  comparisonUnavailable: string | null;
  drill: 'SUMMARY' | 'ANALYSIS' | 'DRIVERS' | 'POPULATION' | 'EVIDENCE' | 'ITEM' | 'LIST' | null;
  /** the primary read the last answer ran — what a follow-up re-runs with a change */
  analysis: { tool: string; args: ToolArgs } | null;
  items: ActiveItem[];
  lastResolved: ResolvedRef | null;
  activeArtifact: string | null; activePBC: string | null; activeProposal: string | null;
  /** the turn each conversational field was last stated explicitly */
  set: Record<string, number>;
}
const emptySubject = (): Subject => ({ account: null, accountName: null, vendor: null, project: null, entity: null });
export const initialConv = (): ConvState => ({ turn: 0, objective: null, lastIntent: null, lastKind: null, subject: emptySubject(), dimension: null, minAbsAmount: null, comparisonBasis: null, comparisonUnavailable: null,
  drill: null, analysis: null, items: [], lastResolved: null, activeArtifact: null, activePBC: null, activeProposal: null, set: {} });
/** the state, created on first use (a context restored from an older snapshot has none) */
export function conv(ctx: SessionContext): ConvState { if (!ctx.conv) ctx.conv = initialConv(); return ctx.conv; }

export function beginTurn(ctx: SessionContext, request: string) { const v = conv(ctx); v.turn += 1; if (!v.objective) v.objective = request.slice(0, 200); }
/** a NEW object drops the old view: its dimension, threshold, comparison and drill no longer apply */
export function onNewObject(ctx: SessionContext) {
  const v = conv(ctx);
  v.dimension = null; v.minAbsAmount = null; v.comparisonBasis = null; v.comparisonUnavailable = null; v.drill = null; v.lastResolved = null;
  delete v.set['dimension']; delete v.set['threshold'];
}

export function confidenceOf(ctx: SessionContext, field: 'object' | 'period' | 'comparison' | 'scope' | 'dimension' | 'threshold' | 'filters'): Confidence {
  const v = conv(ctx);
  const src: Source = field === 'period' ? ctx.period.source : field === 'comparison' ? ctx.comparisonPeriod.source : field === 'scope' ? ctx.scope.source
    : field === 'object' ? (v.subject.account || v.subject.vendor || v.subject.project ? (v.set['object'] !== undefined ? 'EXPLICIT' : 'DERIVED') : ctx.object.source)
    : field === 'dimension' ? (v.dimension ? (v.set['dimension'] !== undefined ? 'EXPLICIT' : 'DERIVED') : 'UNKNOWN')
    : field === 'threshold' ? (v.minAbsAmount ? 'EXPLICIT' : 'UNKNOWN') : ctx.filters.value.length ? ctx.filters.source : 'UNKNOWN';
  if (src === 'UNKNOWN') return 'UNKNOWN';
  if (src === 'DERIVED' || src === 'DEFAULTED') return 'DERIVED';
  const at = v.set[field];
  if (at === v.turn) return 'EXPLICIT_HIGH';
  return at === undefined || v.turn - at <= 3 ? 'INHERITED_HIGH' : 'INHERITED_MEDIUM';
}

const $m = (m: number) => `$${m >= 1 ? (Number.isInteger(m) ? m : m.toFixed(1)) + 'M' : Math.round(m * 1000) + 'K'}`;
/** the context an answer used, in one line and as fields with their confidence — shown under the answer */
export function contextView(ctx: SessionContext, data: FinancialDataService) {
  const v = conv(ctx), s = v.subject, fields: { field: string; label: string; value: string; confidence: Confidence }[] = [];
  const subj = [s.accountName ?? s.account, s.vendor, s.project, s.entity].filter(Boolean).join(' · ');
  if (subj) fields.push({ field: 'object', label: 'Object', value: subj, confidence: confidenceOf(ctx, 'object') });
  const r = ctx.periodRange.value;
  fields.push({ field: 'period', label: 'Period', value: r && r.start !== r.end ? `${periodLabel(r.start)}–${periodLabel(r.end)}` : periodLabel(ctx.period.value), confidence: confidenceOf(ctx, 'period') });
  if (ctx.comparisonPeriod.value) fields.push({ field: 'comparison', label: 'Compared with', value: periodLabel(ctx.comparisonPeriod.value), confidence: confidenceOf(ctx, 'comparison') });
  fields.push({ field: 'scope', label: 'Scope', value: data.scope(ctx.scope.value)?.name ?? ctx.scope.value, confidence: confidenceOf(ctx, 'scope') });
  if (v.dimension) fields.push({ field: 'dimension', label: 'By', value: v.dimension, confidence: confidenceOf(ctx, 'dimension') });
  if (v.minAbsAmount) fields.push({ field: 'threshold', label: 'Threshold', value: `over ${$m(v.minAbsAmount)}`, confidence: confidenceOf(ctx, 'threshold') });
  const line = fields.filter((f) => f.field !== 'scope' || f.confidence === 'EXPLICIT_HIGH').map((f) => (f.field === 'dimension' ? `by ${f.value}` : f.field === 'comparison' ? `vs ${f.value}` : f.value)).join(' · ');
  return { fields, line };
}

/* ================================================================================================
   READING THE WORDS
   ================================================================================================ */
export interface ConvDeps { gl: GovernedLedger; data: FinancialDataService; controls: ControlService; visible: 'ALL' | Set<string> }
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DIM_WORDS: [RegExp, string][] = [
  [/\bentit(?:y|ies)\b|\blegal entit/, 'entity'], [/\bprojects?\b|\bprogrammes?\b/, 'project'], [/\bvendors?\b|\bsuppliers?\b/, 'vendor'],
  [/\bdepartments?\b|\bdepts?\b|\bcost cent(?:er|re)s?\b/, 'costCenter'], [/\baccounts?\b/, 'account'], [/\bpropert(?:y|ies)\b|\bsites?\b|\bdata cent(?:er|re)s?\b/, 'property'],
  [/\bcurrenc(?:y|ies)\b/, 'currency'], [/\bmonths?\b|\bmonthly\b|\bby period\b/, 'period'],
];
/** "by vendor", "now projects", "across entities", "break it down by department", "Projects?" */
export function dimensionIn(t: string): string | null {
  const m = t.match(/\b(?:by|per|across|for each|split by|broken down by|grouped by|group by|down by)\s+([a-z ]{3,24})/);
  const bare = /^\s*(?:and |ok |okay |then |now |so |show |and now |what about |how about )*(?:the |by )?([a-z ]{3,24}?)\s*[.?!]*\s*$/.exec(t);
  const cand = m ? m[1]! : bare ? bare[1]! : null;
  if (!cand) return null;
  for (const [re, d] of DIM_WORDS) if (re.test(cand)) return d;
  return null;
}
/** "over $5M", "above 500K", "greater than 1.5 million" → USD millions */
export function thresholdIn(t: string): number | null {
  const m = t.match(/\b(?:over|above|greater than|more than|exceeding|at least|bigger than|larger than)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|mn|million|b|bn|billion)?\b/) ?? t.match(/(?:>=?|≥)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|mn|million|b|bn|billion)?\b/);
  if (!m) return null;
  const v = Number(m[1]!.replace(/,/g, '')), u = (m[2] ?? '').toLowerCase();
  const mil = u.startsWith('k') || u === 'thousand' ? v / 1000 : u.startsWith('b') ? v * 1000 : u ? v : v >= 1000 ? v / 1e6 : v;
  return mil > 0 ? +mil.toFixed(6) : null;
}
function monthsIn(t: string, year: string): string[] {
  return [...t.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:[a-z]*)\b(?:\s+(20\d\d))?/g)].map((m) => `${m[2] ?? year}-${String(MONTHS.indexOf(m[1]!) + 1).padStart(2, '0')}`);
}
export const PROJECT_ALIAS: [RegExp, string][] = [[/\bsouth valley\b|\bsilicon valley\b|\bsv[- ]?ph2\b/, 'SV-PH2'], [/\bashburn\b|\bash[- ]?dc4\b/, 'ASH-DC4'], [/\bfrankfurt\b|\bfra[- ]?dc1\b/, 'FRA-DC1'],
  [/\blondon\b|\blon[- ]?dc1\b/, 'LON-DC1'], [/\bsingapore\b|\bsg[- ]?dc1\b/, 'SG-DC1']];
export const ENTITY_WORDS: [RegExp, string][] = [[/\bmdh\b|\bholdco\b/, 'MDH'], [/\bmer-?uk\b|\buk opco\b|\bthe uk\b|\bunited kingdom\b/, 'MER-UK'], [/\bmer-?de\b|\bgermany\b|\bdeutschland\b|\bgerman\b/, 'MER-DE'],
  [/\breit\b/, 'MGP-REIT'], [/\btrs\b/, 'MGP-TRS']];
const VENDOR_STOP = new Set(['county', 'national', 'dominion']);
/** governed values the words name: a project (or its programme alias), a vendor in the AP extract, a legal entity */
export function valuesIn(t: string, d: ConvDeps): { dimension: 'project' | 'vendor' | 'entity'; value: string; name: string }[] {
  const out: { dimension: 'project' | 'vendor' | 'entity'; value: string; name: string }[] = [];
  const projects = d.gl.dimensionValues('project');
  for (const [re, code] of PROJECT_ALIAS) if (re.test(t) && projects.includes(code)) out.push({ dimension: 'project', value: code, name: code === 'SV-PH2' ? 'South Valley (SV-PH2)' : code });
  for (const v of d.gl.vendors()) {
    const lv = v.toLowerCase(), first = lv.split(/\s+/)[0]!, esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${esc(lv)}\\b`).test(t) || (first.length >= 4 && !VENDOR_STOP.has(first) && new RegExp(`\\b${esc(first)}\\b`).test(t))) out.push({ dimension: 'vendor', value: v, name: v });
  }
  const ents = new Set(d.data.scopes().filter((s) => s.kind === 'ENTITY').map((s) => s.id));
  for (const [re, id] of ENTITY_WORDS) if (re.test(t) && ents.has(id)) out.push({ dimension: 'entity', value: id, name: d.data.scope(id)?.name ?? id });
  return out;
}
const DOMAIN_OBJECT = /\b(financials?|balance sheet|income statement|p\s?&\s?l|profit and loss|trial balance|\btb\b|cash flow|reconciliations?|\brecs?\b|close|flux|reports?|workbook|excel|spreadsheet|pbc|audit|package|approvals?|tasks?|blockers?|exceptions?|revenue|expenses?|opex|noi|net income|ebitda)\b/;
/** does the request name a NEW object — an account, a statement, another domain — rather than modify the one in context? */
function namesNewObject(t: string, d: ConvDeps): string | null {
  if (/\b\d{5}\b/.test(t)) return 'an account number';
  for (const k of Object.keys(ACCOUNT_ALIAS)) if (new RegExp(`(^|[^a-z&])${k.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}([^a-z&]|$)`).test(t)) return `account alias ${k}`;
  for (const a of d.gl.accounts()) { const nm = a.name.toLowerCase(); if (nm.length >= 6 && t.includes(nm)) return `account ${a.code}`; }
  const dm = t.match(DOMAIN_OBJECT);
  if (dm) return dm[1]!;
  return null;
}
const POINTER = /\b(it|this|that|these|those|them|the same|there|its)\b/;
const CORRECTION = /^\s*(no|nope|actually|not that|i meant|i mean|rather|sorry|wait)\b[,.! ]*/;
const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, top: 1 };

/* ================================================================================================
   RESOLUTION
   ================================================================================================ */
export interface FastPath { route: 'FOLLOW_UP'; kind: TurnKind; reason: string; steps: PlanStep[]; interpretation: Interpretation; mutate: (ctx: SessionContext) => void; notes: string[] }
export interface ConvClarify { reason: string; question: string; options: { id: string; label: string; request: string }[] }
export interface ConvGap { reason: string; message: string; suggestions: string[]; mutate?: (ctx: SessionContext) => void }
export type ConvResult = { fast: FastPath } | { clarify: ConvClarify } | { gap: ConvGap } | null;

const A = (o: Record<string, string | number | null | undefined>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([name, value]) => ({ name, value: String(value) }));
const step = (tool: string, purpose: string, args: Record<string, string | number | null | undefined> = {}, dependsOn: number[] = []): PlanStep => ({ tool, purpose, dependsOn, args: A(args) });
export function interp(p: Partial<Interpretation> = {}): Interpretation {
  return { intent: 'UNDERSTAND', requestedObject: { type: null, id: null, name: null }, operation: 'VIEW', period: null, periodRange: null, comparisonPeriod: null, comparisonBasis: null, scope: null,
    dimensions: [], filters: [], minAbsAmount: null, topN: null, outputPreference: null, continuity: 'CONTINUATION', needsClarification: false, clarificationFields: [], multiStep: false, confidence: 1, ...p };
}
const subjName = (s: Subject) => [s.accountName ?? s.account, s.vendor, s.project, s.entity].filter(Boolean).join(' · ') || 'the activity';
const hasSubject = (s: Subject) => !!(s.account || s.vendor || s.project);
const subjArgs = (s: Subject) => ({ account: s.account, vendor: s.vendor, project: s.project, entity: s.entity });

export function resolveConversational(text: string, ctx: SessionContext, d: ConvDeps): ConvResult {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()} `;
  const words = t.trim().split(' ').length;
  if (words > 14) return null;
  /* an ACTION — or a correction to one — is the action engine's, never a change to the analysis on screen */
  if (/\b(attach|comment|assign|reviewer|approve|certify|publish|issue|share|save|send|post|link|waive|mark|deliver|refresh|generate|download|export|create|build)\b/.test(t)) return null;
  const v = conv(ctx), s: Subject = { ...v.subject };
  const P = ctx.period.value, R = ctx.periodRange.value && ctx.periodRange.value.start !== ctx.periodRange.value.end ? ctx.periodRange.value : null, C = ctx.comparisonPeriod.value;
  const year = P.slice(0, 4);
  const correction = CORRECTION.test(t);
  const only = /\b(only|just|exclusively)\b/.test(t);
  const values = valuesIn(t, d);
  const newObj = namesNewObject(t, d);
  const pointer = POINTER.test(t);

  /* ---- deictic: "the largest one", "the second item", "that vendor" -------------------------------- */
  const ord = t.match(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\b(?: (?:one|item|line|row|blocker|driver|mover|entry))?|\b(?:item|number|#)\s*(\d)\b/);
  const sup = t.match(/\bthe (largest|biggest|highest|top|smallest|lowest)\b(?: (one|item|blocker|driver|line|mover|movement|variance|vendor|project|entity|account|reconciliation))?/);
  const thatKind = t.match(/\b(?:that|this) (vendor|project|entity|account|reconciliation|blocker|driver|line|one|item)\b/);
  const glWord = /\b(gl|general ledger|ledger|transactions?|journal lines|journals?|entries|line items|the lines|detail)\b/.test(t) && !/\bsupport|evidence|invoice/.test(t);
  if ((ord || sup || (thatKind && thatKind[1] !== 'account')) && v.items.length && !newObj) {
    let item: ActiveItem | null = null;
    if (ord) item = v.items[(ORDINALS[ord[1] ?? ''] ?? Number(ord[2])) - 1] ?? null;
    else if (sup) {
      const kind = sup[2] && !['one', 'item', 'line', 'mover', 'movement', 'variance', 'blocker', 'driver'].includes(sup[2]) ? sup[2] : null;
      const pool = v.items.filter((x) => !kind || x.ref.startsWith(`${kind}:`) || (kind === 'reconciliation' && d.controls.recDef(x.ref)));
      const withAmt = pool.filter((x) => x.amount !== null);
      const small = /smallest|lowest/.test(sup[1]!);
      item = withAmt.length ? withAmt.slice().sort((a, b) => (small ? Math.abs(a.amount!) - Math.abs(b.amount!) : Math.abs(b.amount!) - Math.abs(a.amount!)))[0]! : pool[0] ?? null;
    } else if (thatKind) {
      const k = thatKind[1]!;
      if (v.lastResolved && (k === 'one' || k === 'item' || v.lastResolved.kind === k)) item = v.items.find((x) => x.ref === `${v.lastResolved!.kind}:${v.lastResolved!.id}` || x.ref === v.lastResolved!.id) ?? null;
      const pool = v.items.filter((x) => k === 'one' || k === 'item' || k === 'line' || k === 'blocker' || k === 'driver' || x.ref.startsWith(`${k}:`));
      if (!item && pool.length === 1) item = pool[0]!;
      if (!item && pool.length > 1) return { clarify: { reason: `"that ${k}" matches ${pool.length} items`, question: `Which ${k === 'one' || k === 'item' ? 'one' : k}?`, options: pool.slice(0, 4).map((x, i) => ({ id: `item:${i}`, label: x.label, request: `Show the ${['first', 'second', 'third', 'fourth'][x.rank - 1] ?? `number ${x.rank}`} one` })) } };
    }
    if (!item) return null;
    const fp = itemPath(item, glWord ? 'gl' : 'show', ctx, d, s);
    return fp ? { fast: fp } : null;
  }
  /* "show the GL for it" / "prove it" after an item was resolved: the pronoun is the last resolved object */
  if (pointer && glWord && v.lastResolved && !newObj && !values.length && v.lastKind === 'DRILL') {
    const fp = itemPath({ rank: 0, label: v.lastResolved.name, ref: v.lastResolved.kind === 'reconciliation' || v.lastResolved.kind === 'flux' || v.lastResolved.kind === 'task' ? v.lastResolved.id : `${v.lastResolved.kind}:${v.lastResolved.id}`, amount: null, objectType: '' }, 'gl', ctx, d, s);
    if (fp) return { fast: fp };
  }

  /* ---- modifiers of the analysis in context ------------------------------------------------------ */
  if (!hasSubject(s)) return null;
  /* a value named as a FILTER ("South Valley only", "no, Siemens", "just MDH") changes the subject; any other new
     object is a new question for the model */
  const filterVal = (correction || only || /\binstead\b/.test(t)) && values.length === 1 ? values[0]! : null;
  if (newObj) return null;
  if (values.length && !filterVal) return null;
  const dim = dimensionIn(t);
  const thr = thresholdIn(t);
  const why = /^\s*(and |so )?(why|what drove|what caused|how come|explain)\b/.test(t);
  const proof = /\b(proof|prove|bridge|how does (it|this) tie)\b/.test(t);
  const support = /\b(missing support|support|evidence|backing|invoices?|documentation|supported)\b/.test(t);
  const prior = /\b(last year|prior year|previous year|year over year|yoy|same period last year)\b/.test(t);
  const months = monthsIn(t, year);
  const cmpMonths = months.length >= 2 && /\bvs\.?\b|\bversus\b|\bto\b|\bagainst\b|\bcompare|\band\b/.test(t) ? months.slice(0, 2) : months.length === 1 && /\b(compare|vs\.?|versus|against)\b/.test(t) ? [P, months[0]!] : null;
  const priorMonth = /\b(last month|prior month|previous month|month over month|mom)\b/.test(t) && /\b(compare|vs|versus|against|over)\b|^\s*(vs|versus)/.test(t);
  if (!(dim || thr || why || proof || support || glWord || prior || cmpMonths || priorMonth || filterVal)) return null;
  const notes: string[] = [];
  const muts: ((c: SessionContext) => void)[] = [];
  const setConv = (f: (c: ConvState) => void) => muts.push((c) => f(conv(c)));
  let T = v.minAbsAmount;
  if (thr) { T = thr; setConv((c) => { c.minAbsAmount = thr; c.set['threshold'] = c.turn; }); }
  let D = v.dimension;
  if (dim) { D = dim; setConv((c) => { c.dimension = dim; c.set['dimension'] = c.turn; }); }
  if (filterVal) {
    (s as unknown as Record<string, string | null>)[filterVal.dimension] = filterVal.value;
    setConv((c) => { (c.subject as unknown as Record<string, string | null>)[filterVal.dimension] = filterVal.value; c.set['object'] = c.turn; c.set['filters'] = c.turn; });
    muts.push((c) => { c.filters = { value: [...c.filters.value.filter((f) => f.dimension !== filterVal.dimension), { dimension: filterVal.dimension, value: filterVal.value }], source: 'EXPLICIT' }; });
    if (v.comparisonUnavailable) notes.push(`The comparison you asked for earlier is still unavailable: ${v.comparisonUnavailable}`);
  }

  /* comparisons */
  let Pn = P, Cn = C, Rn = R;
  if (prior) {
    const shift = (p: string) => `${Number(p.slice(0, 4)) - 1}${p.slice(4)}`;
    const want = R ? `${periodLabel(shift(R.start))}–${periodLabel(shift(R.end))}` : periodLabel(shift(P));
    const governed = d.data.governedPeriods();
    if (!governed.includes(R ? shift(R.start) : shift(P))) {
      const msg = `${want} is not in the governed ledger — Korvyn holds ${periodLabel(governed[0]!)}–${periodLabel(governed.at(-1)!)}, so there is no prior-year comparison.`;
      const lastQ = governed.at(-1)!;
      return { gap: { reason: 'prior-year comparison unavailable', message: msg,
        suggestions: [`Compare ${periodLabel(lastQ).split(' ')[0]} to ${periodLabel(d.gl.priorPeriod(lastQ) ?? lastQ).split(' ')[0]}`, 'Show it by month', R ? 'Compare Q2 to Q1' : 'Show the trend by month'],
        mutate: (c) => { const cv = conv(c); cv.comparisonBasis = 'PRIOR_YEAR'; cv.comparisonUnavailable = msg; cv.set['comparison'] = cv.turn; } } };
    }
    Cn = shift(P);
  } else if (cmpMonths) {
    const [a, b] = cmpMonths.slice().sort();
    for (const m of [a!, b!]) if (!d.data.governedPeriods().includes(m)) return { gap: { reason: 'comparison month not governed', message: `${periodLabel(m)} is not in the governed ledger — governed periods are ${periodLabel(d.data.governedPeriods()[0]!)}–${periodLabel(d.data.governedPeriods().at(-1)!)}.`, suggestions: [`Compare ${periodLabel(P).split(' ')[0]} to ${periodLabel(d.gl.priorPeriod(P) ?? P).split(' ')[0]}`] } };
    Pn = b!; Cn = a!; Rn = null;
  } else if (priorMonth) { Cn = d.gl.priorPeriod(P); Rn = null; }
  if (prior || cmpMonths || priorMonth) {
    const [pp, cc] = [Pn, Cn];
    muts.push((c) => { c.period = { value: pp, source: 'EXPLICIT' }; c.periodRange = { value: null, source: 'DERIVED' }; c.comparisonPeriod = { value: cc, source: 'EXPLICIT' }; const cv = conv(c); cv.comparisonBasis = prior ? 'PRIOR_YEAR' : 'PRIOR_PERIOD'; cv.comparisonUnavailable = null; cv.set['period'] = cv.set['comparison'] = cv.turn; });
  }

  const name = subjName(s);
  const gl = (sub: Subject, thrM: number | null): PlanStep => !sub.vendor && !sub.project && !sub.entity && !thrM && !Rn && sub.account
    ? step('getAccountActivity', `Reading the governed GL for ${name} · ${periodLabel(Pn)}`, { account: sub.account, period: Pn })
    : step('getGovernedPopulation', `Reading the governed GL for ${subjName(sub)}${thrM ? ` over ${$m(thrM)}` : ''}`, { ...subjArgs(sub), minAbsAmount: thrM, ...(Rn ? { periodStart: Rn.start, periodEnd: Rn.end } : { period: Pn }) });
  const drivers = (dm: string, sub: Subject, thrM: number | null): PlanStep => dm === 'period'
    ? step('getTrend', `Reading ${subjName(sub)} month by month`, { ...subjArgs(sub), periodStart: Rn?.start ?? d.data.governedPeriods()[0]!, periodEnd: Rn?.end ?? Pn })
    : Rn && !(prior || cmpMonths || priorMonth)
      ? step('analyzeByDimension', `Grouping ${subjName(sub)} by ${dm}`, { dimension: dm, periodStart: Rn.start, periodEnd: Rn.end, ...subjArgs(sub), minAbsChange: thrM })
      : step('getDriverAnalysis', `Breaking ${subjName(sub)} down by ${dm}${Cn ? ` · ${periodLabel(Pn)} vs ${periodLabel(Cn)}` : ''}`, { dimension: dm, period: Pn, comparisonPeriod: Cn, ...subjArgs(sub), minAbsChange: thrM });

  let steps: PlanStep[] = [], kind: TurnKind = 'MODIFY', reason = '';
  if (support) {
    let pid = ctx.populationId.value;
    const def = pid ? d.gl.population(pid) : null;
    if (def && def.filter.minAbsUsd && !d.gl.query(def, d.visible, { limit: 1 }).rowCount) {
      const { minAbsUsd, ...rest } = def.filter;
      const base = d.gl.definePopulation(rest, 'amount_desc', def.label.replace(/ · filtered$/, ''));
      const cnt = d.gl.query(base, d.visible, { limit: 1 }).rowCount;
      if (cnt) { pid = base.id; notes.push(`No single line exceeds ${$m(minAbsUsd / 1e6)}, so Sloane checked the ${cnt} lines behind the movement.`); }
    }
    reason = 'support for the population in context';
    steps = pid ? [step('findMissingEvidence', `Checking support behind ${name}`, { populationId: pid }), step('getSupportCoverage', 'Measuring support coverage', { populationId: pid })]
      : [gl(s, T), step('findMissingEvidence', `Checking support behind ${name}`, { populationId: '$0.refs.populationId' }, [0]), step('getSupportCoverage', 'Measuring support coverage', { populationId: '$0.refs.populationId' }, [0])];
    kind = 'DRILL';
  } else if (glWord) { reason = 'the governed GL for the subject'; steps = [gl(s, T)]; kind = 'DRILL'; }
  else if (proof) { reason = 'the proof bridge'; steps = s.account ? [step('getVarianceBridge', `Building the proof bridge for ${name}`, { account: s.account, period: Pn })] : [gl(s, T)]; kind = 'DRILL'; }
  else if (why) {
    reason = 'why the subject moved'; kind = 'ANSWER';
    steps = s.account ? [step('getAccountAnalysis', `Measuring the movement in ${name}`, { account: s.account, period: Pn, comparisonPeriod: Cn, scope: s.entity }), drivers(D ?? 'project', s, T)]
      : [drivers(D ?? (s.vendor ? 'project' : 'vendor'), s, T)];
  } else if (prior || cmpMonths || priorMonth) {
    reason = 'a period comparison';
    steps = s.account && !s.vendor && !s.project ? [step('getAccountAnalysis', `Comparing ${name} · ${periodLabel(Pn)} vs ${periodLabel(Cn!)}`, { account: s.account, period: Pn, comparisonPeriod: Cn, scope: s.entity }), ...(D ? [drivers(D, s, T)] : [])]
      : [step('comparePeriods', `Comparing ${name} · ${periodLabel(Pn)} vs ${periodLabel(Cn!)}`, { period: Pn, comparisonPeriod: Cn, ...subjArgs(s) }), drivers(D ?? (s.vendor ? 'project' : 'vendor'), s, T)];
  } else if (dim) { reason = `a breakdown by ${dim}`; steps = [drivers(dim, s, T)]; }
  else if (filterVal || thr) {
    /* re-run the analysis on screen with the new filter or threshold */
    reason = filterVal ? `the analysis narrowed to ${filterVal.name}` : `the analysis over ${$m(thr!)}`;
    const a = v.analysis;
    if (a && ['getDriverAnalysis', 'analyzeByDimension', 'getTopMovements'].includes(a.tool)) {
      const args: Record<string, string | null> = { ...a.args, ...(thr ? { minAbsChange: String(thr) } : {}), ...(filterVal ? { [filterVal.dimension]: filterVal.value } : {}) };
      steps = [step(a.tool, a.tool === 'analyzeByDimension' ? `Grouping ${subjName(s)} by ${args['dimension']}` : `Breaking ${subjName(s)} down by ${args['dimension']}${thr ? ` · changes over ${$m(thr)}` : ''}`, args)];
    } else if (a && a.tool === 'getTrend') {
      steps = [step('getTrend', `Reading ${subjName(s)} month by month`, { ...a.args, ...(filterVal ? { [filterVal.dimension]: filterVal.value } : {}) }), ...(thr ? [gl(s, thr)] : [])];
    } else if (a && ['getAccountActivity', 'getGovernedPopulation', 'filterGovernedPopulation'].includes(a.tool)) steps = [gl(s, T)];
    else if (a && a.tool === 'comparePeriods') steps = [step('comparePeriods', `Comparing ${subjName(s)}`, { ...a.args, ...(filterVal ? { [filterVal.dimension]: filterVal.value } : {}) })];
    else if (s.account) steps = [drivers(D ?? 'project', s, T)];
    else steps = [gl(s, T)];
    if (correction) kind = 'MODIFY';
  }
  if (!steps.length) return null;
  const muts2 = muts;
  return { fast: { route: 'FOLLOW_UP', kind, reason, steps, notes, mutate: (c) => muts2.forEach((f) => f(c)),
    interpretation: interp({ intent: correction ? 'CORRECTION' : 'UNDERSTAND', operation: support || proof ? 'PROVE' : glWord ? 'DRILL' : why ? 'EXPLAIN' : dim ? 'BREAKDOWN' : prior || cmpMonths || priorMonth ? 'COMPARE_PERIODS' : 'VIEW',
      continuity: correction ? 'CORRECTION' : 'CONTINUATION', minAbsAmount: T, dimensions: D ? [D as never] : [] }) } };
}

/** what "show" / "the GL for" an item means, by what the item is */
function itemPath(item: ActiveItem, action: 'show' | 'gl', ctx: SessionContext, d: ConvDeps, s: Subject): FastPath | null {
  const P = ctx.period.value, ref = item.ref;
  const mk = (steps: PlanStep[], resolved: ResolvedRef, kind: TurnKind = 'DRILL'): FastPath => ({ route: 'FOLLOW_UP', kind, reason: `${action === 'gl' ? 'the GL for' : 'the item'} ${item.label}`, steps, notes: [],
    interpretation: interp({ operation: action === 'gl' ? 'DRILL' : 'VIEW' }),
    mutate: (c) => { const cv = conv(c); cv.lastResolved = resolved; cv.set['object'] = cv.turn; if (resolved.account) { cv.subject = { ...emptySubject(), account: resolved.account, accountName: d.gl.account(resolved.account) ? `${resolved.account} ${d.gl.account(resolved.account)!.name}` : resolved.account }; } } });
  const dm = ref.match(/^(entity|project|vendor|costCenter|property|currency):(.+)$/);
  if (dm) {
    const sub: Subject = { ...s, [dm[1]!]: dm[2]! } as Subject;
    const args = { ...subjArgs(sub), period: P };
    return mk([step('getGovernedPopulation', `Reading the governed GL for ${subjName(sub)} · ${periodLabel(P)}`, args)], { kind: dm[1]!, id: dm[2]!, name: item.label, account: s.account });
  }
  const acct = ref.match(/^account:(\d+)$/)?.[1] ?? ref.match(/^FLUX-(\d+)-/)?.[1] ?? null;
  if (acct) {
    const name = d.gl.account(acct) ? `${acct} ${d.gl.account(acct)!.name}` : acct;
    if (action === 'gl') return mk([step('getAccountActivity', `Reading the governed GL for ${name} · ${periodLabel(P)}`, { account: acct, period: P })], { kind: 'account', id: acct, name, account: acct });
    return ref.startsWith('FLUX-')
      ? mk([step('getFluxItem', `Opening the Flux line ${name}`, { account: acct, period: P }), step('getFluxExplanation', 'Reading its explanation', { account: acct, period: P })], { kind: 'flux', id: ref, name, account: acct })
      : mk([step('getAccountAnalysis', `Measuring the movement in ${name}`, { account: acct, period: P })], { kind: 'account', id: acct, name, account: acct });
  }
  const rec = d.controls.recDef(ref);
  if (rec) {
    if (action === 'gl') return mk([step('getReconciliationPopulation', `Reading the GL behind ${rec.name}`, { reconciliationId: rec.id, period: P })], { kind: 'reconciliation', id: rec.id, name: rec.name, account: rec.accounts[0] ?? null });
    return mk([step('getReconciliation', `Opening ${rec.name}`, { reconciliationId: rec.id, period: P })], { kind: 'reconciliation', id: rec.id, name: rec.name, account: rec.accounts[0] ?? null });
  }
  const txn = ref.match(/^txn:(.+)$/)?.[1];
  if (txn) return mk([step('getTransaction', `Opening ${txn}`, { transactionId: txn })], { kind: 'transaction', id: txn, name: txn, account: null });
  if (/^task:|^TASK-|^CT-/i.test(ref)) return mk([step('getCloseTasks', 'Reading the blocked close tasks', { period: P, status: 'BLOCKED' })], { kind: 'task', id: ref, name: item.label, account: null });
  return null;
}

/* ================================================================================================
   AFTER AN ANSWER — the state follows what was shown
   ================================================================================================ */
const ANALYSIS_PRIORITY = ['getDriverAnalysis', 'analyzeByDimension', 'getTopMovements', 'getTrend', 'getGovernedPopulation', 'filterGovernedPopulation', 'getAccountActivity', 'comparePeriods', 'getAccountAnalysis',
  'getVarianceBridge', 'getFinancialStatementLine', 'getFluxItem', 'getReconciliation', 'getReconciliationPopulation', 'getLargestFinancialMovements', 'getCloseBlockers', 'getFinancialSummary', 'getIncomeStatement', 'getBalanceSheet'];
const DRILL_OF: Record<string, ConvState['drill']> = { getDriverAnalysis: 'DRIVERS', analyzeByDimension: 'DRIVERS', getTopMovements: 'DRIVERS', getTrend: 'ANALYSIS', getGovernedPopulation: 'POPULATION', filterGovernedPopulation: 'POPULATION',
  getAccountActivity: 'POPULATION', getReconciliationPopulation: 'POPULATION', comparePeriods: 'ANALYSIS', getAccountAnalysis: 'ANALYSIS', getVarianceBridge: 'EVIDENCE', getFinancialStatementLine: 'ANALYSIS', getFluxItem: 'ITEM',
  getReconciliation: 'ITEM', getLargestFinancialMovements: 'LIST', getCloseBlockers: 'LIST', getFinancialSummary: 'SUMMARY', getIncomeStatement: 'SUMMARY', getBalanceSheet: 'SUMMARY' };
const LIST_TYPES = ['CloseBlockers', 'DriverAnalysis', 'DimensionAnalysis', 'TopMovements', 'LargestMovements', 'ReconciliationList', 'FluxList', 'PopulationAggregate', 'GovernedPopulation', 'MissingEvidence'];
/** "$15.80M", "($10.83M)", "<$0.01M", "—" → dollars */
export function parseMoney(s: string): number | null {
  const m = s.replace(/[<,]/g, '').match(/^\(?[$£€]?(-?\d+(?:\.\d+)?)([MKB])?\)?$/);
  if (!m) return null;
  const v = Number(m[1]) * (m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : m[2] === 'B' ? 1e9 : 1);
  return s.trim().startsWith('(') ? -v : v;
}
export function afterAnswer(ctx: SessionContext, calls: { tool: string; args: ToolArgs }[], objects: FinancialObject[], kind: TurnKind, gl: GovernedLedger) {
  const v = conv(ctx), avail = objects.filter((o) => o.status !== 'UNAVAILABLE' && !o.action);
  v.lastKind = kind;
  const refs = Object.assign({}, ...avail.map((o) => o.refs)) as Record<string, string>;
  if (refs['artifactId'] || refs['excelDraftId']) v.activeArtifact = refs['artifactId'] ?? refs['excelDraftId'] ?? v.activeArtifact;
  if (refs['pbcRequestId']) v.activePBC = refs['pbcRequestId'];
  const prop = objects.find((o) => o.action)?.action;
  if (prop) v.activeProposal = prop.id;
  if (!avail.length || kind === 'ARTIFACT' || kind === 'ACTION') return;
  const primary = ANALYSIS_PRIORITY.map((id) => calls.find((c) => c.tool === id)).find(Boolean) ?? null;
  if (primary) { v.analysis = { tool: primary.tool, args: { ...primary.args } }; v.drill = DRILL_OF[primary.tool] ?? v.drill; }
  /* the subject: what the primary read was about; an account can also come from the answer's focus or its largest mover */
  const focusAcct = avail.map((o) => o.focus).find((f) => f?.kind === 'account')?.id ?? null;
  const acct = primary?.args['account'] ?? focusAcct ?? refs['largestAccount'] ?? null;
  if (primary && !['getCloseBlockers', 'getFinancialSummary', 'getIncomeStatement', 'getBalanceSheet'].includes(primary.tool)) {
    v.subject = { account: acct, accountName: acct && gl.account(acct) ? `${acct} ${gl.account(acct)!.name}` : acct, vendor: primary.args['vendor'] ?? null, project: primary.args['project'] ?? null, entity: primary.args['entity'] ?? null };
  } else if (primary) v.subject = emptySubject();
  if (primary?.args['dimension'] && primary.args['dimension'] !== v.dimension) v.dimension = primary.args['dimension']!;
  /* the ordered items the answer SHOWED — "the second one" means the second row the reader saw */
  const listy = avail.filter((o) => LIST_TYPES.includes(o.type));
  const src = (listy.length ? listy : avail).map((o) => ({ o, rows: o.table.rows.filter((r) => r.kind === 'line' && r.ref) })).sort((a, b) => b.rows.length - a.rows.length)[0];
  if (src && src.rows.length) {
    v.items = src.rows.slice(0, 25).map((r, i) => ({ rank: i + 1, label: r.label, ref: r.ref!, objectType: src.o.type, amount: [...r.cells].reverse().map(parseMoney).find((x) => x !== null) ?? null }));
  }
  const single = avail.length === 1 ? avail[0]!.focus : null;
  if (single && ['account', 'reconciliation', 'fluxItem', 'vendor', 'project', 'transaction', 'journal'].includes(single.kind)) v.lastResolved = { kind: single.kind === 'fluxItem' ? 'flux' : single.kind, id: single.id, name: single.name, account: single.kind === 'account' ? single.id : v.subject.account };
}

/* ================================================================================================
   CAPABILITY-AWARE FALLBACK — never a dead end
   ================================================================================================ */
export function capabilityGap(text: string, ctx: SessionContext): ConvGap | null {
  const t = text.toLowerCase(), v = conv(ctx);
  const artifact = !!(v.activeArtifact || ctx.lastRefs['artifactId'] || ctx.lastRefs['excelDraftId']), pbc = !!(v.activePBC || ctx.lastRefs['pbcRequestId']);
  if (/\be-?mail\b|\bslack\b|\bms teams\b|\bteams message\b|\btext (it|this) to\b|\bsend (it|this|them|the \w+) to (the )?(auditors?|cfo|ceo|board|client|bank|lender)\b/.test(t) && !/\breview(er)?\b/.test(t))
    return { reason: 'external delivery', message: 'Sloane can’t send email or messages. It prepares the deliverable; you send it.',
      suggestions: pbc ? ['Mark the package delivered to the auditors', 'Generate the package', 'Show what’s missing'] : artifact ? ['Generate the Excel file', 'Save the workbook', 'Preview it'] : ['Save this investigation', 'Share this investigation with Sarah Kim'] };
  if (/\b(header|footer|logo|font|colou?rs?|bold|italic|merge (the )?cells|column widths?|freeze panes|cell format|borders?|landscape|page setup)\b/.test(t) && (artifact || /\b(workbook|excel|sheet|tab|file|report)\b/.test(t))) {
    const m = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+(20\d\d))?/);
    return { reason: 'workbook formatting', message: 'Korvyn’s governed workbook has a fixed title block — name, period, scope and basis — so headers, fonts and layout can’t be edited here.',
      suggestions: artifact ? ['Preview it', 'Rename the workbook', ...(m ? [`Change the period to ${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)}${m[2] ? ' ' + m[2] : ''}`] : [])] : ['Give me the FY26 governed GL', 'Give me the June close review package'] };
  }
  if (/\b(forecast|budget|predict(ion)?|projection|plan vs actual|next (month|quarter|year)'?s?)\b/.test(t))
    return { reason: 'no budget or forecast', message: 'Korvyn holds governed actuals only — there is no budget or forecast in the governed ledger.', suggestions: ['Compare June to May', 'Show the trend by month', 'What moved the most?'] };
  if (/\b(delete|erase|wipe|reverse)\b.*\b(journal|entry|entries|transaction|ledger|gl)\b/.test(t))
    return { reason: 'ledger change', message: 'Korvyn never changes the ledger — the ERP is the system of record. Sloane can show the entry and its support.', suggestions: ['Show the GL', 'Show the largest transaction'] };
  return null;
}
export function capabilityFallback(ctx: SessionContext): { message: string; suggestions: string[] } {
  const v = conv(ctx), s = v.subject;
  if (hasSubject(s)) {
    const nm = s.accountName?.replace(/^\d+ /, '') ?? s.vendor ?? s.project ?? 'it';
    return { message: 'Sloane doesn’t have a governed Korvyn capability for that yet.', suggestions: [`Why did ${nm} move?`, `Break it down by ${v.dimension === 'vendor' ? 'project' : 'vendor'}`, 'Show the GL'] };
  }
  return { message: 'Sloane doesn’t have a governed Korvyn capability for that yet.', suggestions: ['Show me June financials', 'What is blocking June close?', 'What moved the most?'] };
}

/* ================================================================================================
   INVESTIGATION TITLES — named for what was investigated, not for the first words typed
   ================================================================================================ */
export function investigationTitle(objects: FinancialObject[], ctx: SessionContext, request: string): string | null {
  const o = objects.find((x) => x.status !== 'UNAVAILABLE' && !x.action) ?? objects.find((x) => x.action);
  if (!o) return null;
  const v = conv(ctx), when = o.periodLabel || periodLabel(ctx.period.value);
  const acct = v.subject.accountName?.replace(/^\d+ /, '');
  if (o.action) return o.action.title;
  switch (o.type) {
    case 'CloseBlockers': case 'CloseReadiness': return `${when.replace(/\s.*$/, '')} close readiness`.replace(/^(\w)/, (m) => m.toUpperCase());
    case 'FinancialSummary': case 'IncomeStatement': case 'BalanceSheet': return `${when} financial review`;
    case 'LargestMovements': return `Largest movements — ${when}`;
    case 'ExcelWorkbookPreview': return (o.workbook?.['name'] as string | undefined) ?? o.title.replace(/ — workbook preview$/, '');
    case 'PBCRequest': case 'PBCSupportGaps': return o.title.replace(/ · what’s missing$/, '');
    case 'Trend': case 'DimensionAnalysis': if (v.subject.vendor) return `${v.subject.vendor} activity — ${when}`; break;
  }
  if (acct) {
    const up = /\bincrease|\bup\b|\bgrow/.test(request.toLowerCase()), down = /\bdecrease|\bdown\b|\bfell|\bdrop/.test(request.toLowerCase());
    return `${acct} ${up ? 'increase' : down ? 'decrease' : 'movement'} — ${when}`;
  }
  if (v.subject.vendor) return `${v.subject.vendor} — ${when}`;
  return o.title.length <= 70 ? o.title : null;
}

/* ================================================================================================
   CONVERSATION WITHOUT A TOOL — the deterministic stand-in for the conversational front door, used ONLY when the model is
   unavailable (mock mode, a provider outage). It recognises ordinary conversation and answers it; everything else goes on
   to interpretation. It never rejects a request and never says "no capability".
   ================================================================================================ */
export interface ConvInfo { investigation: string | null; lastTitle: string | null; lastSummary: string | null; run: { title: string; status: string; headline: string | null } | null; page: string | null }
export function conversationalShortcut(text: string, c: ConvInfo): { intent: 'GENERAL_CONVERSATION' | 'CONTEXTUAL_CONVERSATION' | 'UNCLEAR'; reply: string } | null {
  const t = text.toLowerCase().replace(/[!.?,]+/g, ' ').replace(/\s+/g, ' ').trim();
  const active = c.run?.title ?? c.investigation ?? c.lastTitle;
  if (/^(hi|hello|hey|hiya|good (morning|afternoon|evening)|yo)( sloane| there)?$/.test(t)) return { intent: 'GENERAL_CONVERSATION', reply: 'Hi. What can I help you with?' };
  if (/^(thanks|thank you|thx|cheers|great thanks|ok thanks|perfect|got it|great)( sloane| very much| so much)?$/.test(t)) return { intent: 'GENERAL_CONVERSATION', reply: 'You’re welcome. Anything else?' };
  if (/^(i )?(need|want) (your |some )?help$|^(can|could) you help( me)?$|^help( me)?$/.test(t)) return { intent: 'GENERAL_CONVERSATION', reply: active ? 'Of course. What do you need help with in this investigation?' : 'Of course. What are you working on?' };
  if (/^what (can|do) you do$|^what are you able to do$|^how can you help( me)?$/.test(t))
    return { intent: 'GENERAL_CONVERSATION', reply: 'I can explain your financials and what moved, break a movement down by project, vendor or entity, drill to the GL and trace it to the ERP, check support and reconciliations, and see what is blocking the close. I can also prepare comments, Excel workbooks and audit packages for you to confirm, or carry a goal like “review the June close” through end to end.' };
  if (/^what am i looking at$|^what is this$|^what('s| is) on (the )?screen$/.test(t)) {
    if (c.run) return { intent: 'CONTEXTUAL_CONVERSATION', reply: `This is the governed run “${c.run.title}” (${c.run.status.toLowerCase().replace(/_/g, ' ')}).${c.run.headline ? ` ${c.run.headline}` : ''}` };
    if (c.lastTitle) return { intent: 'CONTEXTUAL_CONVERSATION', reply: `This is ${c.lastTitle}.${c.lastSummary ? ` ${c.lastSummary}` : ''}` };
    if (c.page) return { intent: 'CONTEXTUAL_CONVERSATION', reply: `You’re on ${c.page}. Ask me about anything on it.` };
    return { intent: 'CONTEXTUAL_CONVERSATION', reply: 'Nothing is open with me yet. Tell me what you’d like to look at.' };
  }
  if (/^(i )?(don'?t|do not) (understand|get it)$|^tell me more$|^explain( that| this)?$|^what does (this|that) mean$/.test(t)) {
    if (c.lastSummary) return { intent: 'CONTEXTUAL_CONVERSATION', reply: c.lastSummary };
    return { intent: 'UNCLEAR', reply: 'Can you tell me a little more about what you want to do?' };
  }
  if (/^what should i (review|look at|do) next$/.test(t) && c.run?.headline) return { intent: 'CONTEXTUAL_CONVERSATION', reply: c.run.headline };
  return null;
}
