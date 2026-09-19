/**
 * PHASE 8B — THE UNIVERSAL INTENT RESOLVER.
 *
 * A short request ("close", "flux", "CIP", "Siemens", "June") is resolved into an IntentDefinition: what kind of
 * financial context the person wants opened, over which governed objects, for which period and scope. Resolution uses
 * the conversation's context, the semantic graph (Phase 8A), the tenant calendar and the actor — never exact command
 * matching alone, and never a figure.
 *
 * The resolver CLAIMS only what it can open as a financial context: a workspace word, a governed object, a period, or
 * a planning concept, in a short request. A question ("why did CIP increase?") or a longer instruction is left to the
 * governed tool path, which already answers it. When a canvas is on screen, a short instruction that refines it
 * ("only BS", "largest first", "show me the GL behind the first one") is resolved as a REFINEMENT of that canvas.
 */
import type { Actor } from '../tools.js';
import type { FinancialGraph } from '../semantic/graph.js';
import type { SemanticObject } from '../semantic/model.js';
import { resolvePeriods, type TimeDeps } from '../semantic/time.js';

export type IntentType = 'OPEN_FINANCIAL_CONTEXT' | 'REVIEW_STATUS' | 'ANALYZE' | 'COMPARE' | 'DRILL' | 'TRACE' | 'BUILD' | 'ACT' | 'SEARCH_OBJECT' | 'GENERAL_CONVERSATION';
/** the financial context a canvas opens on */
export type CanvasKind = 'CLOSE' | 'FLUX' | 'FINANCIALS' | 'RECONCILIATIONS' | 'OBJECT' | 'PERIOD' | 'PLANNING';
export type FieldSource = 'EXPLICIT' | 'INHERITED' | 'DEFAULTED' | 'DERIVED';

/** a change to the canvas on screen — the conversation refines it rather than recreating it */
export type Refinement =
  | { op: 'FILTER'; statement?: 'BS' | 'IS' | null; explanation?: 'UNEXPLAINED' | null; materialOnly?: boolean }
  | { op: 'SORT'; by: 'LARGEST' }
  | { op: 'FOCUS'; rank: number | null; largest: boolean; label: string | null; ref?: string | null }
  | { op: 'RELATED'; target: 'RECONCILIATION' | 'FLUX' | 'GL' | 'DRIVERS' | 'EVIDENCE'; rank: number | null; largest: boolean }
  | { op: 'RESET' };

export interface IntentDefinition {
  intentType: IntentType;
  canvasKind: CanvasKind | null;
  primaryObjectType: string | null;
  /** canonical semantic ids (`account:15000`, `vendor:Siemens Energy`, `project:SV-PH2` …) */
  semanticObjectIds: string[];
  /** the object the canvas is about, when it is about one */
  subject: { id: string; type: string; label: string; key: string } | null;
  period: { value: string; label: string; source: FieldSource };
  scope: { value: string; source: FieldSource };
  reportingLens: string;
  currency: string;
  basis: string;
  /** a view the words asked for ("balance sheet", "unexplained") */
  requestedView: 'BS' | 'IS' | 'UNEXPLAINED' | null;
  requestedComparison: string | null;
  confidence: number;
  clarificationNeeded: { question: string; options: { id: string; label: string; request: string }[] } | null;
  refinement: Refinement | null;
  /** why the resolver read the words this way — for the trace, never shown as prose */
  reason: string;
  notes: string[];
  words: string;
}

export interface IntentDeps {
  graph: FinancialGraph;
  actor: Actor;
  time: TimeDeps;
  /** the conversation's context: its period and scope, and whether they were stated */
  ctx: { period: { value: string; source: string }; scope: { value: string; source: string }; currency: { value: string }; basis: { value: string } };
  /** the canvas on screen, when there is one — a refinement applies to it */
  canvas: { kind: CanvasKind; rows: { label: string; ref: string }[] } | null;
  /** a row the person clicked: its canonical ref (never its label) */
  focusRef?: string | null;
  monthLabel: (p: string) => string;
}

/* ---- words ------------------------------------------------------------------------------------------------ */
const FILLER = /\b(please|show( me)?|open|go to|take me to|bring up|pull up|view|see|let'?s see|the|my|our|current|latest|this month'?s?|status|overview|workspace|canvas|page|screen|dashboard)\b/g;
const WORKSPACE: [RegExp, CanvasKind, IntentDefinition['requestedView']][] = [
  [/^(month[- ]?end\s+)?(close|closing|close readiness|close review)$/, 'CLOSE', null],
  [/^(flux|flux review|flux analysis|variances?|variance review|variance analysis)$/, 'FLUX', null],
  [/^(bs flux|balance sheet flux)$/, 'FLUX', 'BS'],
  [/^(is flux|income statement flux|p&?l flux)$/, 'FLUX', 'IS'],
  [/^(unexplained flux|unexplained variances?)$/, 'FLUX', 'UNEXPLAINED'],
  [/^(financials?|financial statements?|statements?|results|reporting)$/, 'FINANCIALS', null],
  [/^(income statement|p ?& ?l|pnl|p and l|profit and loss)$/, 'FINANCIALS', 'IS'],
  [/^(balance sheet|bs)$/, 'FINANCIALS', 'BS'],
  [/^(recs?|recons?|reconciliations?|account recs?|account reconciliations?|balance sheet recs?)$/, 'RECONCILIATIONS', null],
];
const PLANNING = /\b(budgets?|forecasts?|plan|planning|scenarios?|outlook)\b/;
const QUESTION = /\?|^(why|how|what|which|who|when|where|is|are|does|do|did|can|could|should|explain|compare|trace|build|create|make|draft|add|remove|attach|approve|post|email|send)\b/;
const OBJECT_TYPES = new Set(['Account', 'FinancialStatementLine', 'Project', 'Vendor', 'LegalEntity', 'Property', 'CostCenter']);

const ordinal = (t: string): number | null => {
  const m = t.match(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|top)\b/);
  if (!m) return null;
  return ({ first: 1, top: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5 } as Record<string, number>)[m[1]!] ?? null;
};

/** a short instruction that changes the canvas on screen; null when the words are about something else */
export function refinementOf(text: string, canvas: NonNullable<IntentDeps['canvas']>): Refinement | null {
  const t = text.toLowerCase().replace(/[.!]+$/, '').trim();
  if (t.split(/\s+/).length > 12) return null;
  const rank = ordinal(t), largest = /\b(largest|biggest|top)\b/.test(t);
  if (/^(reset|clear( the)? filters?|show (me )?(all|everything)|remove( the)? filters?|start over)$/.test(t)) return { op: 'RESET' };
  if (/\b(gl|general ledger|ledger|transactions?|journal lines?|entries)\b/.test(t) && (rank || largest || /\b(behind|for|of|under)\b/.test(t))) return { op: 'RELATED', target: 'GL', rank, largest };
  if (/\b(related|its|the) (reconciliation|rec|recon)s?\b|\breconciliation (for|behind) (it|that|this)\b/.test(t)) return { op: 'RELATED', target: 'RECONCILIATION', rank, largest };
  if (/\b(drivers?|what drove|break ?down)\b/.test(t) && (rank || largest || /\b(it|that|this|them)\b/.test(t))) return { op: 'RELATED', target: 'DRIVERS', rank, largest };
  if (/\b(support|evidence)\b/.test(t) && /\b(it|that|this|its|the (first|largest))\b/.test(t)) return { op: 'RELATED', target: 'EVIDENCE', rank, largest };
  if (/^(start with|open|begin with|go to|look at|investigate|focus on)\b/.test(t) || /^(the )?(largest|biggest|first|second|third|top)( one| item| blocker)?$/.test(t)) {
    if (rank || largest) return { op: 'FOCUS', rank, largest, label: null };
    const lbl = t.replace(/^(start with|open|begin with|go to|look at|investigate|focus on)\s+(the\s+)?/, '').trim();
    /* typed words may name a row, but only when they name exactly one: duplicate names are never resolved by label */
    const exact = canvas.rows.filter((r) => r.label.toLowerCase() === lbl), near = canvas.rows.filter((r) => lbl.length > 3 && r.label.toLowerCase().includes(lbl));
    const hits = exact.length ? exact : near;
    if (hits.length === 1) return { op: 'FOCUS', rank: null, largest: false, label: null, ref: hits[0]!.ref };
    if (hits.length > 1) return { op: 'FOCUS', rank: null, largest: false, label: lbl, ref: null };
  }
  if (/\b(largest|biggest)\s+(first|on top)\b|\bsort(ed)? by (size|amount|largest|change|materiality)\b|\bby size\b|\blargest to smallest\b/.test(t)) return { op: 'SORT', by: 'LARGEST' };
  const f: Extract<Refinement, { op: 'FILTER' }> = { op: 'FILTER' };
  if (/\b(bs|balance sheet)\b/.test(t) && /\b(only|just|show|view)\b|\bonly$/.test(t)) f.statement = 'BS';
  if (/\b(is|income statement|p ?& ?l|pnl)\b/.test(t) && /\b(only|just|show|view)\b/.test(t) && !/\bwhat is\b/.test(t)) f.statement = 'IS';
  if (/\bunexplained\b|\bnot explained\b|\bno explanation\b/.test(t)) f.explanation = 'UNEXPLAINED';
  if (/\bmaterial( blockers?| items?| only)?\b|\bonly (the )?blocking\b|\bblocking only\b/.test(t) && /\b(only|just|show)\b/.test(t)) f.materialOnly = true;
  if (f.statement || f.explanation || f.materialOnly) return f;
  return null;
}

export class UniversalIntentResolver {
  resolve(text: string, d: IntentDeps): IntentDefinition | null {
    const raw = text.trim().replace(/[.!]+$/, '');
    const lower = raw.toLowerCase();
    if (!raw) return null;
    const base = (): IntentDefinition => ({
      intentType: 'OPEN_FINANCIAL_CONTEXT', canvasKind: null, primaryObjectType: null, semanticObjectIds: [], subject: null,
      period: { value: d.ctx.period.value, label: d.monthLabel(d.ctx.period.value), source: d.ctx.period.source === 'EXPLICIT' ? 'INHERITED' : 'DEFAULTED' },
      scope: { value: d.ctx.scope.value, source: d.actor.scopeIds === 'ALL' ? (d.ctx.scope.source === 'EXPLICIT' ? 'INHERITED' : 'DEFAULTED') : 'DERIVED' },
      reportingLens: 'Corporate Consolidated', currency: d.ctx.currency.value, basis: d.ctx.basis.value,
      requestedView: null, requestedComparison: null, confidence: 0.9, clarificationNeeded: null, refinement: null, reason: '', notes: [], words: raw,
    });

    /* 1. a canvas is on screen: a clicked row opens by its canonical ref; a short instruction refines it */
    if (d.canvas) {
      const r = d.focusRef && d.canvas.rows.some((x) => x.ref === d.focusRef) ? { op: 'FOCUS' as const, rank: null, largest: false, label: null, ref: d.focusRef } : refinementOf(raw, d.canvas);
      if (r) {
        const I = base();
        I.canvasKind = d.canvas.kind; I.refinement = r;
        I.intentType = r.op === 'FOCUS' ? 'DRILL' : r.op === 'RELATED' ? (r.target === 'GL' ? 'TRACE' : 'DRILL') : 'ANALYZE';
        I.reason = `refines the ${d.canvas.kind.toLowerCase()} canvas: ${r.op}`;
        return I;
      }
    }

    /* 2. only a short request opens a context; a question goes to the governed tools that answer it */
    /* "show me June financials" is a request the governed tools already answer; a bare phrase or "open …" opens a context */
    if (QUESTION.test(lower) || /^(show|view|list|give|get|find|pull|compile|prepare|generate|include|exclude|only|just)\b/.test(lower)) return null;
    const words = lower.split(/\s+/);
    if (words.length > 6) return null;

    /* period words are the calendar's, never text search */
    const periods = resolvePeriods(lower, d.time).filter((p) => p.kind !== 'PLANNING');
    const period = periods[0] ?? null;
    let rest = lower;
    for (const p of periods) rest = rest.replace(new RegExp(`\\b${p.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), ' ');
    rest = rest.replace(/[’']s\b/g, '').replace(FILLER, ' ').replace(/[^a-z0-9&\- ]+/g, ' ').replace(/\s+/g, ' ').trim();

    const I = base();
    const applyPeriod = () => {
      if (!period) return;
      if (period.kind === 'MONTH' && period.status === 'GOVERNED' && period.end) I.period = { value: period.end, label: d.monthLabel(period.end), source: 'EXPLICIT' };
      else if ((period.status === 'GOVERNED' || period.status === 'PARTIAL') && period.end) { I.period = { value: period.end, label: period.label, source: 'EXPLICIT' }; I.notes.push(`${period.label} is shown through ${d.monthLabel(period.end)}, the latest governed month in it.`); }
      else I.notes.push(period.note || `${period.label} is not a governed period on this server; showing ${I.period.label}.`);
    };

    /* 3. planning concepts are recognised and never fabricated */
    if (PLANNING.test(rest) && words.length <= 6) {
      I.canvasKind = 'PLANNING'; I.intentType = /\b(vs|versus|variance|against|to actual|actuals?)\b/.test(rest) ? 'COMPARE' : 'OPEN_FINANCIAL_CONTEXT';
      I.primaryObjectType = /forecast|outlook/.test(rest) ? 'Forecast' : /scenario/.test(rest) ? 'Scenario' : 'Budget';
      I.semanticObjectIds = [`planning:${I.primaryObjectType.toUpperCase()}`, ...(I.intentType === 'COMPARE' ? ['planning:ACTUAL'] : [])];
      I.requestedComparison = I.intentType === 'COMPARE' ? `${I.primaryObjectType} vs actual` : null;
      I.reason = 'a planning concept — no governed planning version exists'; applyPeriod();
      return I;
    }

    /* 4. a workspace word */
    for (const [re, kind, view] of WORKSPACE) if (re.test(rest)) {
      I.canvasKind = kind; I.requestedView = view; I.primaryObjectType = kind === 'CLOSE' ? 'Close' : kind === 'FLUX' ? 'FluxAnalysis' : kind === 'FINANCIALS' ? 'FinancialStatement' : 'Reconciliation';
      I.intentType = kind === 'CLOSE' || kind === 'RECONCILIATIONS' ? 'REVIEW_STATUS' : 'OPEN_FINANCIAL_CONTEXT';
      I.semanticObjectIds = [`period:${I.period.value}`];
      I.reason = `workspace word "${rest}"`; applyPeriod();
      if (I.period.source === 'EXPLICIT') I.semanticObjectIds = [`period:${I.period.value}`];
      return I;
    }

    /* 5. only a period ("June", "Q2") — the period itself is the context */
    if (!rest && period) {
      I.canvasKind = 'PERIOD'; I.primaryObjectType = 'Period'; applyPeriod();
      I.semanticObjectIds = [`period:${I.period.value}`]; I.reason = `a period: ${period.label}`;
      if (period.status === 'AMBIGUOUS') I.clarificationNeeded = { question: `Which period do you mean by “${period.term}”?`, options: period.candidates.map((c) => ({ id: c.id, label: c.label, request: c.label })) };
      return I;
    }
    if (!rest || rest.length < 2) return null;

    /* 6. a governed object, through the semantic graph (permission-filtered: a hidden object is simply not found) */
    const res = d.graph.resolve(rest, d.actor, { period: I.period.value });
    /* the words must BE the object: a name inside a longer instruction ("compile Siemens support") is not a context to open */
    const ms = d.graph.mentions(rest, d.actor, I.period.value);
    let bare = ` ${rest} `;
    for (const m of ms) bare = bare.replace(` ${m.term.toLowerCase()} `, ' ');
    if (!ms.length && res.status === 'RESOLVED' && ![res.object.label, ...(res.object.aliases ?? [])].some((x) => x.toLowerCase() === rest)) bare = rest;
    const leftover = bare.replace(/\b(activity|spend|spending|account|vendor|project|entity|balance|details?|summary|analysis|overview)\b/g, ' ').trim();
    if (res.status !== 'NOT_FOUND' && res.status !== 'MULTIPLE' && leftover) return null;
    const open = (o: SemanticObject) => {
      applyPeriod();
      const key = o.id.slice(o.id.indexOf(':') + 1);
      if (o.type === 'Close' || o.type === 'CloseTask' || o.type === 'CloseBlocker') { I.canvasKind = 'CLOSE'; I.primaryObjectType = 'Close'; I.intentType = 'REVIEW_STATUS'; }
      else if (o.type === 'FluxAnalysis') { I.canvasKind = 'FLUX'; I.primaryObjectType = 'FluxAnalysis'; }
      else if (o.type === 'Period') { I.canvasKind = 'PERIOD'; I.primaryObjectType = 'Period'; if (I.period.source !== 'EXPLICIT' && /^\d{4}-\d{2}$/.test(key)) I.period = { value: key, label: d.monthLabel(key), source: 'EXPLICIT' }; }
      else if (o.type === 'Budget' || o.type === 'Forecast' || o.type === 'Scenario' || o.governed === false) { I.canvasKind = 'PLANNING'; I.primaryObjectType = o.type; }
      else if (OBJECT_TYPES.has(o.type)) { I.canvasKind = 'OBJECT'; I.primaryObjectType = o.type; I.subject = { id: o.id, type: o.type, label: o.label, key }; I.intentType = 'SEARCH_OBJECT'; }
      else return false;
      I.semanticObjectIds = [o.id]; I.reason = `semantic object ${o.id} (${o.type})`;
      return true;
    };
    if (res.status === 'RESOLVED') return open(res.object) ? I : null;
    if (res.status === 'MULTIPLE') {
      const plan = res.objects.find((o) => o.governed === false || /^planning:/.test(o.id));
      if (plan) { I.canvasKind = 'PLANNING'; I.intentType = 'COMPARE'; I.primaryObjectType = plan.type; I.semanticObjectIds = res.objects.map((o) => o.id); I.requestedComparison = res.term; I.reason = 'planning versus actual'; applyPeriod(); return I; }
      return null;
    }
    if (res.status === 'AMBIGUOUS') {
      const cands = res.candidates.filter((c) => OBJECT_TYPES.has(c.object.type));
      if (!cands.length) return null;
      /* only one candidate carries governed activity: that is the useful reading, and the others are named */
      const active = cands.filter((c) => !/no governed activity|master record only/i.test(c.detail));
      if (active.length === 1) {
        open(active[0]!.object); I.confidence = 0.8;
        I.notes.push(`“${raw}” also names ${cands.filter((c) => c !== active[0]).map((c) => c.object.label).join(' and ')} — ${cands.length === 2 ? 'a record' : 'records'} with no governed activity.`);
        return I;
      }
      I.canvasKind = 'OBJECT'; I.confidence = 0.4; I.reason = `ambiguous: ${res.term}`;
      I.clarificationNeeded = { question: res.question, options: cands.slice(0, 5).map((c) => ({ id: c.object.id, label: `${c.object.label} — ${c.detail}`, request: c.object.label })) };
      return I;
    }
    return null;
  }
}
