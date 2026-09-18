/**
 * THE SERVER-SIDE SLOANE ORCHESTRATOR — the authoritative execution path.
 *
 *   Browser ─▶ /api/sloane/turn ─▶ SloaneOrchestrator
 *     ─▶ FinancialContextEngine   (session context, focus, population, provenance, governed catalogues, validation)
 *     ─▶ SloaneLLMAdapter         (interpret; plan; narrate)   — provider-neutral
 *     ─▶ ClarificationEngine      (policy decides; the model only recommends)
 *     ─▶ Planner                  (permission-filtered, request-relevant allowlist → plan → validation and repair)
 *     ─▶ Tool registry            (permission · governance · arguments, re-checked at execution)
 *     ─▶ FinancialObjects + grounded narrative ─▶ browser
 *
 * The browser sends words, a session id, and — to answer a question Sloane asked — a pending id and an option
 * id. It sends NO context, NO interpretation, NO plan and NO actor: anything it could send there would be
 * something it could forge. Every execution writes a SloaneExecutionTrace, kept server-side.
 *
 * READ ONLY. Every registered tool the planner can see is a READ tool; WRITE_ACTIONS_ENABLED is a constant.
 */
import { findSavedReport } from './book.js';
import { randomUUID } from 'node:crypto';
import type { SloaneLLMAdapter, Usage } from './adapter.js';
import type { SloaneConfig } from './config.js';
import { ControlService } from './controls.js';
import { FinancialDataService, periodLabel } from './financials.js';
import { DIMENSION_KEYS, GovernedLedger } from './governed.js';
import { type Interpretation, validateInterpretation } from './schema.js';
import { type Actor, type Domain, type FinancialObject, type SloaneTool, type ToolArgs, type ToolEnv, authorize, serverActor, toolRegistry, visibleOf, WRITE_ACTIONS_ENABLED } from './tools.js';
import { ACCOUNT_ALIAS, findObjects } from './toolset.js';
import './actiontools.js';
import { ActionEngine, type ActionProposal, type DecideInput, type DecideResult } from './actions.js';
import type { ToolSession } from './tools.js';
import { type KorvynDatabase, workDatabase } from './persistence/db.js';
import type { InvestigationBody, Stamped } from './persistence/repositories.js';
import { seedDevelopment } from './persistence/seed.js';
import { bindWork, WORK } from './store.js';
import { AuthorizationService } from './auth.js';

/* ================================================================================================
   LIMITS
   ================================================================================================ */
export const LIMITS = { maxToolCalls: 8, maxClarificationLoops: 2, wallClockMs: 90_000, tokenBudget: 90_000, minConfidence: 0.55, maxRequestChars: 2000, maxToolsExposed: 22, maxFactsPerObject: 30 };

/* ================================================================================================
   FINANCIAL CONTEXT ENGINE
   ================================================================================================ */
export type Source = 'EXPLICIT' | 'INHERITED' | 'DERIVED' | 'DEFAULTED' | 'UNKNOWN';
export interface Field<T> { value: T; source: Source }
export interface Focus { kind: string; id: string; name: string }
export interface SessionContext {
  object: Field<{ type: string | null; name: string | null }>;
  period: Field<string>;
  periodRange: Field<{ start: string; end: string } | null>;
  comparisonPeriod: Field<string | null>;
  scope: Field<string>;
  currency: Field<string>;
  basis: Field<string>;
  /** what the conversation is about now — set by the objects the last answer produced */
  focus: Field<Focus | null>;
  /** the governed population the last answer produced ("these transactions") */
  populationId: Field<string | null>;
  filters: Field<{ dimension: string; value: string }[]>;
  /** machine references from the last answer's objects (largestTransaction, reconciliationId, …) */
  lastRefs: Record<string, string>;
  lastObjects: { id: string; type: string; title: string }[];
}
export const reliable = (s: Source) => s === 'EXPLICIT' || s === 'INHERITED' || s === 'DERIVED';
const STATEMENTS = ['INCOME_STATEMENT', 'BALANCE_SHEET', 'FINANCIAL_STATEMENT', 'TRIAL_BALANCE'];

export interface Resolved {
  objectType: string | null;
  objectName: string | null;
  named: { object: boolean; period: boolean; range: boolean; scope: boolean; comparison: boolean };
  period: string | null;
  range: { start: string; end: string } | null;
  comparisonPeriod: string | null;
  scopeId: string | null;
  scopeMatches: string[];
  filters: { dimension: string; value: string }[];
  errors: string[];
  warnings: string[];
}

export class FinancialContextEngine {
  constructor(readonly data: FinancialDataService, readonly gl: GovernedLedger, readonly controls: ControlService) {}

  initial(actor: Actor): SessionContext {
    const scope = actor.scopeIds === 'ALL' ? 'GROUP' : actor.scopeIds[0]!;
    return {
      object: { value: { type: null, name: null }, source: 'UNKNOWN' },
      period: { value: this.data.workingPeriod(), source: 'DEFAULTED' },
      periodRange: { value: null, source: 'DEFAULTED' },
      comparisonPeriod: { value: null, source: 'DEFAULTED' },
      scope: { value: scope, source: 'DEFAULTED' },
      currency: { value: this.data.scope(scope)?.presentationCurrency ?? 'USD', source: 'DEFAULTED' },
      basis: { value: 'US GAAP', source: 'DEFAULTED' },
      focus: { value: null, source: 'UNKNOWN' },
      populationId: { value: null, source: 'UNKNOWN' },
      filters: { value: [], source: 'DEFAULTED' },
      lastRefs: {}, lastObjects: [],
    };
  }

  /** What the model is told: values with their provenance, never anything it could mistake for permission. */
  forModel(c: SessionContext) {
    const sc = this.data.scope(c.scope.value);
    return {
      currentObject: c.object, currentPeriod: c.period, periodRange: c.periodRange, comparisonPeriod: c.comparisonPeriod,
      entityScope: { value: sc?.name ?? c.scope.value, id: c.scope.value, source: c.scope.source },
      currency: c.currency, accountingBasis: c.basis, focus: c.focus, populationId: c.populationId, filters: c.filters,
      lastResult: { objects: c.lastObjects, refs: c.lastRefs },
      governedPeriods: this.data.governedPeriods(),
    };
  }

  candidates(request: string, actor: Actor) {
    const env = { gl: this.gl, controls: this.controls, visible: visibleOf(actor), actor };
    const scopes = this.data.scopes().filter((s) => actor.scopeIds === 'ALL' || actor.scopeIds.includes(s.id)).map((s) => ({ id: `scope:${s.id}`, kind: 'scope', name: s.name }));
    const hits = findObjects(env, request, 14).map((h) => ({ id: h.ref, kind: h.kind, name: h.name }));
    return [...scopes, ...hits];
  }

  /** Validates an interpretation against governed catalogues. An id that does not resolve is dropped, never trusted. */
  resolve(I: Interpretation, c: SessionContext): Resolved {
    const R: Resolved = { objectType: null, objectName: null, named: { object: false, period: false, range: false, scope: false, comparison: false },
      period: null, range: null, comparisonPeriod: null, scopeId: null, scopeMatches: [], filters: [], errors: [], warnings: [] };
    const governed = this.data.governedPeriods(), gset = new Set(governed), first = governed[0]!, last = governed.at(-1)!;
    const span = `${periodLabel(first)}–${periodLabel(last)}`;

    if (I.requestedObject.type) { R.objectType = I.requestedObject.type; R.objectName = I.requestedObject.name; R.named.object = true; }
    else if (c.object.value.type) { R.objectType = c.object.value.type; R.objectName = c.object.value.name; }

    const building = I.intent === 'BUILD' || I.intent === 'ACT' || I.intent === 'CORRECTION' || I.operation === 'BUILD' || I.operation === 'ACT';
    if (I.periodRange) {
      let { start, end } = I.periodRange;
      if (start > end) R.errors.push('period range starts after it ends');
      else if ((start < first || start > last) && building) R.warnings.push(`${periodLabel(start)}–${periodLabel(end)} is not in the governed ledger (governed ${span}); it is recorded where the draft uses it and has no figures.`);
      else if (start < first || start > last) R.errors.push(`${periodLabel(start)} is not in the governed ledger — governed periods are ${span}`);
      else {
        if (end > last) { R.warnings.push(`${periodLabel(end)} has not been closed into the governed ledger; the range runs through ${periodLabel(last)}.`); end = last; }
        R.range = { start, end }; R.named.range = true;
      }
    } else if (I.period) {
      if (!gset.has(I.period) && building) R.warnings.push(`${periodLabel(I.period)} is not in the governed ledger (governed ${span}).`);
      else if (!gset.has(I.period)) R.errors.push(`${periodLabel(I.period)} is not in the governed ledger — governed periods are ${span}`);
      else { R.period = I.period; R.named.period = true; }
    }

    const basePeriod = R.range?.end ?? R.period ?? c.period.value;
    const baseRange = R.range ?? c.periodRange.value;
    if (I.comparisonPeriod || I.comparisonBasis) {
      const cp = I.comparisonPeriod ?? (I.comparisonBasis === 'PRIOR_YEAR' ? `${Number(basePeriod.slice(0, 4)) - 1}${basePeriod.slice(4)}` : this.gl.priorPeriod(basePeriod));
      const priorYearRange = I.comparisonBasis === 'PRIOR_YEAR' && baseRange ? `${periodLabel(`${Number(baseRange.start.slice(0, 4)) - 1}${baseRange.start.slice(4)}`)}–${periodLabel(`${Number(baseRange.end.slice(0, 4)) - 1}${baseRange.end.slice(4)}`)}` : null;
      if ((!cp || !gset.has(cp)) && (I.intent === 'BUILD' || I.operation === 'BUILD' || I.intent === 'ACT')) R.warnings.push(`${priorYearRange ?? (cp ? periodLabel(cp) : 'The comparison period')} is not in the governed ledger (governed ${span}); the comparison is recorded and its figures are unavailable.`);
      else if (!cp || !gset.has(cp)) R.errors.push(`${priorYearRange ?? (cp ? periodLabel(cp) : 'The comparison period')} is not in the governed ledger — governed periods are ${span}, so there is no prior-year comparison available.`);
      else { R.comparisonPeriod = cp; R.named.comparison = true; }
    }

    if (I.scope) {
      const cid = I.scope.candidateId?.startsWith('scope:') ? I.scope.candidateId.slice(6) : null;
      if (cid && this.data.scope(cid)) { R.scopeId = cid; R.named.scope = true; }
      else {
        if (I.scope.candidateId) R.warnings.push(`scope id ${I.scope.candidateId} did not resolve and was dropped`);
        const n = I.scope.name.toLowerCase();
        const hits = this.data.scopes().filter((s) => s.name.toLowerCase() === n || s.name.toLowerCase().includes(n) || n.includes(s.id.toLowerCase()));
        if (hits.length === 1) { R.scopeId = hits[0]!.id; R.named.scope = true; }
        else if (hits.length > 1) R.scopeMatches = hits.map((h) => h.id);
        else R.errors.push(`no governed scope matches "${I.scope.name}"`);
      }
    }
    for (const f of I.filters) {
      const dim = f.dimension === 'dept' ? 'costCenter' : f.dimension;
      if (dim === 'vendor') { const v = this.gl.vendors().filter((x) => x.toLowerCase().includes(f.value.toLowerCase().replace(/^vendor:/, ''))); if (v.length) R.filters.push({ dimension: 'vendor', value: v[0]! }); else R.errors.push(`No vendor named "${f.value}" is carried in the governed ledger's AP extract.`); }
      else if (dim === 'project') { const v = this.gl.dimensionValues('project').find((x) => x.toLowerCase() === f.value.toLowerCase().replace(/^project:/, '')); if (v) R.filters.push({ dimension: 'project', value: v }); }
      else if (dim !== 'entity') R.filters.push({ dimension: dim, value: f.value });
    }
    return R;
  }

  /** The next context: what the request named becomes EXPLICIT; a new object drops the old object's state. */
  apply(c: SessionContext, R: Resolved, I: Interpretation): SessionContext {
    const n: SessionContext = JSON.parse(JSON.stringify(c));
    const newObject = R.named.object && c.object.value.type !== R.objectType && I.continuity === 'NEW_OBJECT';
    if (R.named.object) n.object = { value: { type: R.objectType, name: R.objectName }, source: 'EXPLICIT' };
    else if (c.object.value.type) n.object = { value: c.object.value, source: 'INHERITED' };
    /* an ACTION names its TARGET; the population in context is what it acts on ("attach the invoices to X"), so it stays */
    const acting = I.intent === 'ACT' || I.intent === 'BUILD';
    if (newObject) { n.focus = { value: null, source: 'UNKNOWN' }; if (!acting) n.populationId = { value: null, source: 'UNKNOWN' }; n.filters = { value: [], source: 'DEFAULTED' }; n.comparisonPeriod = { value: null, source: 'DEFAULTED' }; }
    if (R.named.range && R.range) { n.periodRange = { value: R.range, source: 'EXPLICIT' }; n.period = { value: R.range.end, source: 'DERIVED' }; }
    else if (R.named.period && R.period) { n.period = { value: R.period, source: 'EXPLICIT' }; n.periodRange = { value: null, source: 'DERIVED' }; }
    else if (newObject) { n.periodRange = { value: null, source: 'DEFAULTED' }; }
    if (R.named.comparison) n.comparisonPeriod = { value: R.comparisonPeriod, source: 'EXPLICIT' };
    if (R.named.scope && R.scopeId) {
      n.scope = { value: R.scopeId, source: 'EXPLICIT' };
      n.currency = { value: this.data.scope(R.scopeId)!.presentationCurrency, source: 'DERIVED' };
    }
    if (R.filters.length) n.filters = { value: R.filters, source: 'EXPLICIT' };
    return n;
  }

  /** After an answer: shown defaults become the reader's context, and the answer's objects become the focus. */
  commitShown(c: SessionContext, objects: FinancialObject[]): SessionContext {
    const n: SessionContext = JSON.parse(JSON.stringify(c));
    for (const k of ['period', 'scope', 'currency', 'basis'] as const) if (n[k].source === 'DEFAULTED') n[k].source = 'INHERITED';
    const avail = objects.filter((o) => o.status !== 'UNAVAILABLE');
    if (!avail.length) return n;
    const focused = [...avail].reverse().find((o) => o.focus && o.focus.kind !== 'population') ?? [...avail].reverse().find((o) => o.focus);
    if (focused?.focus) n.focus = { value: focused.focus, source: 'DERIVED' };
    const pop = [...avail].reverse().find((o) => o.population || o.refs['populationId']);
    if (pop) n.populationId = { value: pop.population?.populationId ?? pop.refs['populationId']!, source: 'DERIVED' };
    n.lastRefs = Object.assign({}, ...avail.map((o) => o.refs));
    n.lastObjects = avail.map((o) => ({ id: o.id, type: o.type, title: o.title }));
    return n;
  }
}

/* ================================================================================================
   CLARIFICATION ENGINE — the model recommends, policy decides
   ================================================================================================ */
export interface ClarDecision { needed: string[]; policy: string[]; recommended: string[]; suppressed: string[]; capped: boolean }
export class ClarificationEngine {
  constructor(private readonly data: FinancialDataService) {}

  decide(I: Interpretation, R: Resolved, ctx: SessionContext, loops: number): ClarDecision {
    const policy: string[] = [];
    const type = R.objectType;
    if (type && STATEMENTS.includes(type) && R.named.object) {
      if (!R.range && !R.period && !reliable(ctx.period.source)) policy.push('period');
      const multi = R.range && R.range.start !== R.range.end;
      if (multi && !reliable(ctx.scope.source)) policy.push('scope');
    }
    if (R.scopeMatches.length > 1) policy.push('entity');
    const fieldReliable = (f: string) => f === 'period' ? reliable(ctx.period.source) : f === 'scope' ? reliable(ctx.scope.source) : f === 'entity' ? this.data.scope(ctx.scope.value)?.kind === 'ENTITY' : false;
    const recommended = I.needsClarification ? I.clarificationFields.slice() : [];
    /* the model may recommend; a recommendation for a field the context supplies (even by default), or for an entity
       when nothing ambiguous was named, is suppressed — policy decides what is genuinely missing */
    const suppressed = recommended.filter((f) => fieldReliable(f) || f === 'object' || (f === 'entity' && R.scopeMatches.length < 2) || (f === 'period' && !!ctx.period.value && !STATEMENTS.includes(type ?? '')));
    const union = [...new Set([...policy, ...recommended.filter((f) => !suppressed.includes(f))])];
    const capped = loops >= LIMITS.maxClarificationLoops && union.length > 0;
    return { needed: capped ? [] : union.slice(0, 1), policy, recommended, suppressed, capped };
  }

  question(field: string, R: Resolved, actor: Actor): { question: string; options: { id: string; label: string }[] } {
    const scopes = this.data.scopes().filter((s) => actor.scopeIds === 'ALL' || actor.scopeIds.includes(s.id));
    if (field === 'scope') return { question: 'Which scope should I use?', options: scopes.map((s) => ({ id: `scope:${s.id}`, label: s.name })) };
    if (field === 'entity') {
      const pool = R.scopeMatches.length ? scopes.filter((s) => R.scopeMatches.includes(s.id)) : scopes.filter((s) => s.kind === 'ENTITY');
      return { question: 'Which legal entity?', options: pool.map((s) => ({ id: `scope:${s.id}`, label: s.name })) };
    }
    const ps = this.data.governedPeriods().slice().reverse();
    return { question: 'Which period should I use?', options: ps.map((p) => ({ id: `period:${p}`, label: periodLabel(p) })) };
  }
}

/* ================================================================================================
   PLANNER
   ================================================================================================ */
export interface PlanStep { tool: string; purpose: string; dependsOn: number[]; args: { name: string; value: string | null }[] }
export interface PlannedStep { tool: string; purpose: string; dependsOn: number[]; args: ToolArgs; refs: Record<string, string> }
export interface PlanValidation { steps: PlannedStep[]; repairs: string[]; rejected: { tool: string; why: string }[]; truncated: number }

const DOMAIN_WORDS: [Domain, RegExp][] = [
  ['financials', /financial|results|statement|p\s?&\s?l|income|balance sheet|cash flow|revenue|net income|noi|changed the most|biggest|largest movement|movement|ytd|quarter/i],
  ['tb', /trial balance|\btb\b|debits?|credits?|currency|functional/i],
  ['ledger', /\bgl\b|general ledger|ledger|transaction|journal|je-|activity|population|lines|spend|vendor|project|siemens|invoice|largest/i],
  ['analysis', /why|driver|break.*down|by (entity|project|vendor|cost|account|currency|property)|compare|trend|increase|decrease|move|change|outlier|unusual|anomal|spend|last year|prior/i],
  ['flux', /flux|variance|unexplained|explanation|comment|material/i],
  ['recon', /reconcil|\brecs?\b|tie\b|ties\b|don.?t tie|reconciling|support/i],
  ['close', /close|block|behind|attention|approval|task|readiness|signal|exception/i],
  ['reporting', /report|package|cfo|board|published|lineage/i],
  ['audit', /audit|pbc|selection|sample|population tie|auditor/i],
  ['evidence', /support|evidence|invoice|\bpo\b|purchase order|contract|approval|proof|document|missing/i],
  ['trace', /trace|proof|prove|source|erp|where.*come from|behind this number/i],
  ['action', /comment|attach|issue|assign|reviewer|for review|\bsave\b|\bshare\b|support package|compile|approve|publish|certify|mapping|write.?back|post to|\bno,|instead|actually/i],
  ['build', /\bbuild\b|report|excel|workbook|spreadsheet|\badd (entity|project|vendor|column|department|dimension|source)|\bremove\b|\bfirst\b|only include|sort by|\btab\b|compare .*fy|\bsave it\b/i],
];
const TYPE_DOMAINS: Record<string, Domain[]> = {
  FINANCIAL_STATEMENT: ['financials', 'analysis'], INCOME_STATEMENT: ['financials'], BALANCE_SHEET: ['financials'], TRIAL_BALANCE: ['tb'],
  ACCOUNT: ['ledger', 'analysis', 'financials'], ACCOUNT_GROUP: ['ledger', 'analysis', 'financials'], GOVERNED_LEDGER: ['ledger', 'evidence'], JOURNAL: ['ledger', 'trace', 'evidence'],
  VENDOR: ['ledger', 'analysis', 'evidence'], PROJECT: ['ledger', 'analysis'], ENTITY: ['ledger', 'analysis', 'close'], DEPARTMENT: ['analysis'], COST_CENTER: ['analysis'],
  RECONCILIATION: ['recon', 'evidence'], FLUX: ['flux', 'financials'], CLOSE: ['close', 'recon', 'flux'], REPORT: ['reporting', 'build'], AUDIT_POPULATION: ['audit', 'evidence'],
  EVIDENCE: ['evidence', 'trace'], INVOICE: ['evidence', 'ledger'], SUPPORT_PACKAGE: ['evidence', 'action'], EXCEL_ARTIFACT: ['build', 'action'],
};
const OP_DOMAINS: Partial<Record<string, Domain[]>> = { EXPLAIN: ['analysis', 'ledger'], BREAKDOWN: ['analysis'], COMPARE_PERIODS: ['analysis', 'financials'], DRILL: ['ledger'], PROVE: ['analysis', 'evidence', 'trace'], FIND: ['find'], BUILD: ['build', 'action'], ACT: ['action'] };
const FOCUS_DOMAINS: Record<string, Domain[]> = { account: ['analysis', 'ledger'], population: ['ledger', 'evidence'], reconciliation: ['recon'], fluxItem: ['flux'], report: ['reporting'], transaction: ['evidence', 'trace', 'ledger'], journal: ['ledger', 'trace'], vendor: ['analysis', 'ledger', 'evidence'], project: ['analysis', 'ledger'], close: ['close'], statement: ['financials', 'analysis'], pbc: ['audit'] };

export class Planner {
  constructor(private readonly data: FinancialDataService, private readonly gl: GovernedLedger, private readonly controls: ControlService) {}

  /** Tools the model may see for THIS request: permitted for this actor (filtered before exposure), READ only, and
   *  relevant to the request's domains. The find tool is always offered. */
  allowlist(actor: Actor, I: Interpretation | null, request: string, ctx: SessionContext): { tools: SloaneTool[]; domains: Domain[] } {
    const d = new Set<Domain>(['find']);
    if (I?.requestedObject.type) (TYPE_DOMAINS[I.requestedObject.type] ?? []).forEach((x) => d.add(x));
    if (I) (OP_DOMAINS[I.operation] ?? []).forEach((x) => d.add(x));
    DOMAIN_WORDS.forEach(([k, re]) => { if (re.test(request)) d.add(k); });
    if (ctx.focus.value && (I?.continuity !== 'NEW_OBJECT' || !I.requestedObject.type)) (FOCUS_DOMAINS[ctx.focus.value.kind] ?? []).forEach((x) => d.add(x));
    if (d.size === 1) ['financials', 'ledger', 'analysis'].forEach((x) => d.add(x as Domain));
    if (I && (I.intent === 'ACT' || I.intent === 'BUILD' || I.intent === 'CORRECTION')) { d.add('action'); d.add('build'); }
    const permitted = toolRegistry.all().filter((t) => (t.risk === 'READ' || t.risk === 'PROPOSE') && authorize(actor, t).ok);
    const worded = new Set(DOMAIN_WORDS.filter(([, re]) => re.test(request)).map(([k]) => k));
    const typed = new Set(I?.requestedObject.type ? TYPE_DOMAINS[I.requestedObject.type] ?? [] : []);
    const words = new Set(request.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4));
    /* score = how directly the request names the tool's domain, plus words the request shares with the tool's description */
    const score = (t: SloaneTool) => (worded.has(t.domain) ? 6 : 0) + (typed.has(t.domain) ? 4 : 0) + (d.has(t.domain) ? 2 : 0)
      + [...words].filter((w) => t.description.toLowerCase().includes(w) || t.id.toLowerCase().includes(w)).length * 1.5;
    const tools = permitted.filter((t) => d.has(t.domain)).map((t) => ({ t, s: score(t) })).sort((a, b) => b.s - a.s).slice(0, LIMITS.maxToolsExposed).map((x) => x.t);
    return { tools, domains: [...d] };
  }

  /** Every step re-checked: allowlist, registry, governance, permission, dependencies, arguments. Nothing proposed is trusted. */
  validate(steps: PlanStep[], allow: SloaneTool[], actor: Actor, ctx: SessionContext): PlanValidation {
    const out: PlanValidation = { steps: [], repairs: [], rejected: [], truncated: 0 };
    const ids = new Set(allow.map((t) => t.id));
    const kept = new Map<number, number>(); // proposed index → validated index
    steps.forEach((s, i) => {
      const reg = toolRegistry.get(s.tool);
      if (!reg) { out.rejected.push({ tool: s.tool, why: 'no such tool in the registry' }); return; }
      if (!ids.has(s.tool)) { const g = authorize(actor, reg); out.rejected.push({ tool: s.tool, why: g.ok ? 'not allowlisted for this request' : g.reason }); return; }
      if ((s.dependsOn ?? []).some((d) => d < 0 || d >= i || !kept.has(d))) { out.rejected.push({ tool: s.tool, why: 'depends on a later, unknown or rejected step' }); return; }
      const args: ToolArgs = {}, refs: Record<string, string> = {};
      let bad = '';
      for (const p of reg.params) {
        const given = s.args.find((a) => a.name === p.name)?.value ?? null;
        if (given && /^\$\d+\./.test(given)) {
          const src = Number(given.slice(1, given.indexOf('.')));
          if (!kept.has(src)) { bad = `${p.name} references step ${src}, which was not kept`; break; }
          refs[p.name] = `$${kept.get(src)}${given.slice(given.indexOf('.'))}`; continue;
        }
        let v = given && given.startsWith('$ctx.') ? this.fromCtx(given.slice(5), ctx) : given;
        if (given && given.startsWith('$ctx.') && !v) out.repairs.push(`${s.tool}.${p.name}: ${given} is empty in context`);
        if (!v && p.required) { v = this.fromCtx(p.name, ctx); if (v) out.repairs.push(`${s.tool}.${p.name} ← context (${v})`); }
        if (!v) { if (p.required) bad = `${p.name} is required and not in context`; continue; }
        const norm = this.check(p.kind, v);
        if (norm.error) { bad = `${p.name}: ${norm.error}`; break; }
        if (norm.value !== v) out.repairs.push(`${s.tool}.${p.name} "${v}" → "${norm.value}"`);
        args[p.name] = norm.value!;
      }
      /* an evidence/trace target: neither a population nor an object named → the one in context */
      if (!bad && reg.params.some((p) => p.name === 'populationId') && reg.params.some((p) => p.name === 'objectRef') && !args['populationId'] && !args['objectRef'] && !refs['populationId'] && !refs['objectRef']) {
        const fr = this.fromCtx('objectRef', ctx), fp = this.fromCtx('populationId', ctx);
        if (fr && fr.startsWith('txn:')) { args['objectRef'] = fr; out.repairs.push(`${s.tool}.objectRef ← context focus (${fr})`); }
        else if (fp) { args['populationId'] = fp; out.repairs.push(`${s.tool}.populationId ← context (${fp})`); }
        else if (fr) { args['objectRef'] = fr; out.repairs.push(`${s.tool}.objectRef ← context focus (${fr})`); }
        if (args['objectRef'] && !args['period'] && /^(recon|account):/.test(args['objectRef'])) args['period'] = ctx.period.value;
      }
      if (!bad && args['periodStart'] && args['periodEnd'] && args['periodStart'] > args['periodEnd']) bad = 'periodStart is after periodEnd';
      if (!bad) for (const pn of ['periodStart', 'periodEnd']) if (reg.params.some((p) => p.name === pn && p.required) && !args[pn] && !refs[pn]) bad = `${pn} is required`;
      if (bad) { out.rejected.push({ tool: s.tool, why: bad }); return; }
      const g = authorize(actor, reg, args);
      if (!g.ok) { out.rejected.push({ tool: s.tool, why: g.reason }); return; }
      if (out.steps.length >= LIMITS.maxToolCalls) { out.truncated++; return; }
      kept.set(i, out.steps.length);
      out.steps.push({ tool: s.tool, purpose: s.purpose, dependsOn: (s.dependsOn ?? []).map((d) => kept.get(d)!), args, refs });
    });
    return out;
  }

  /** a value of a declared kind, resolved to its governed form, or an error */
  check(kind: string, v: string): { value?: string; error?: string } {
    const gl = this.gl;
    switch (kind) {
      case 'period': return this.data.governedPeriods().includes(v) ? { value: v } : { error: `${v} is not a governed period` };
      case 'scope': case 'entity': {
        const s = v.replace(/^(scope|entity):/, ''), byName = this.data.scopes().filter((x) => x.name.toLowerCase() === s.toLowerCase() || x.name.toLowerCase().includes(s.toLowerCase()));
        const hit = this.data.scope(s) ?? (byName.length === 1 ? byName[0]! : null);
        if (!hit) return { error: byName.length ? `"${v}" matches ${byName.length} scopes` : `${v} is not a governed ${kind}` };
        return kind === 'entity' && hit.kind !== 'ENTITY' ? { error: `${v} is not a legal entity` } : { value: hit.id };
      }
      case 'account': {
        const c = v.replace(/^account:/, '').split(/\s/)[0]!;
        if (gl.account(c)) return { value: c };
        const nm = (ACCOUNT_ALIAS[v.toLowerCase().trim()] ?? v).toLowerCase(), hits = gl.accounts().filter((a) => a.name.toLowerCase() === nm || a.name.toLowerCase().includes(nm));
        const grp = hits.filter((a) => !a.parent);
        return hits.length === 1 ? { value: hits[0]!.code } : grp.length === 1 ? { value: grp[0]!.code } : { error: hits.length ? `"${v}" matches ${hits.length} accounts` : `${v} is not an account in the chart` };
      }
      case 'dimension': { const d = v === 'dept' || v === 'department' ? 'costCenter' : v; return (DIMENSION_KEYS as readonly string[]).includes(d) ? { value: d } : { error: `${v} is not a governed dimension` }; }
      case 'number': return Number.isFinite(Number(v)) ? { value: String(Number(v)) } : { error: `${v} is not a number` };
      case 'vendor': { const s = v.replace(/^vendor:/, '').toLowerCase(), m = gl.vendors().filter((x) => x.toLowerCase() === s || x.toLowerCase().includes(s)); return m.length === 1 || m.some((x) => x.toLowerCase() === s) ? { value: m.find((x) => x.toLowerCase() === s) ?? m[0]! } : { error: m.length ? `"${v}" matches ${m.length} vendors` : `no vendor "${v}" in the AP extract` }; }
      case 'project': { const s = v.replace(/^project:/, ''); return gl.dimensionValues('project').includes(s) ? { value: s } : { error: `${v} is not a governed project` }; }
      case 'populationId': return gl.population(v) ? { value: v } : { error: `${v} is not a population defined in this session` };
      case 'transactionId': { const s = v.replace(/^txn:/, ''); return gl.lines.some((l) => l.key === s) ? { value: s } : { error: `${v} is not a governed GL line` }; }
      case 'journalId': { const s = v.replace(/^journal:/, ''); return gl.lines.some((l) => l.journalId === s) ? { value: s } : { error: `${v} is not a journal` }; }
      case 'reconciliationId': { const s = v.replace(/^recon:/, ''); return this.controls.recDef(s) ? { value: s } : { error: `${v} is not a reconciliation` }; }
      case 'reportId': { const s = v.replace(/^report:/, ''); return this.controls.report(s) ? { value: s } : { error: `${v} is not a saved report` }; }
      case 'auditPopulationId': { const s = v.replace(/^auditPopulation:/, ''); return this.controls.auditPopulation(s) ? { value: s } : { error: `${v} is not an audit population` }; }
      case 'pbcId': { const s = v.replace(/^pbc:/, ''); return this.controls.pbc().some((r) => r.id === s) ? { value: s } : { error: `${v} is not a PBC request` }; }
      case 'objectRef': return /^(txn|journal|recon|account):/.test(v) ? { value: v } : { error: `${v} is not a supported object reference` };
      default: return { value: v };
    }
  }

  fromCtx(name: string, ctx: SessionContext): string | null {
    const f = ctx.focus.value, r = ctx.lastRefs;
    switch (name) {
      case 'periodStart': return ctx.periodRange.value?.start ?? ctx.period.value;
      case 'periodEnd': return ctx.periodRange.value?.end ?? ctx.period.value;
      case 'period': case 'currentPeriod': return ctx.period.value;
      case 'comparisonPeriod': return ctx.comparisonPeriod.value ?? this.gl.priorPeriod(ctx.period.value);
      case 'scope': case 'entityScope': return ctx.scope.value;
      case 'entity': return this.data.scope(ctx.scope.value)?.kind === 'ENTITY' ? ctx.scope.value : null;
      case 'account': case 'focus.account': return f?.kind === 'account' ? f.id : r['account'] ?? r['largestAccount'] ?? null;
      case 'populationId': return ctx.populationId.value;
      case 'reconciliationId': return f?.kind === 'reconciliation' ? f.id : r['reconciliationId'] ?? null;
      case 'reportId': return f?.kind === 'report' ? f.id : r['reportId'] ?? null;
      case 'transactionId': return f?.kind === 'transaction' ? f.id : r['transactionId'] ?? r['largestTransaction'] ?? null;
      case 'journalId': return f?.kind === 'journal' ? f.id : r['journalId'] ?? r['largestJournal'] ?? null;
      case 'auditPopulationId': return r['auditPopulationId'] ?? null;
      case 'pbcId': return f?.kind === 'pbc' ? f.id : r['pbcId'] ?? null;
      case 'vendor': return ctx.filters.value.find((x) => x.dimension === 'vendor')?.value ?? (f?.kind === 'vendor' ? f.id : null);
      case 'project': return ctx.filters.value.find((x) => x.dimension === 'project')?.value ?? (f?.kind === 'project' ? f.id : null);
      case 'focus.id': return f?.id ?? null;
      case 'objectRef': case 'focus.ref':
        if (!f) return r['largestTransaction'] ? `txn:${r['largestTransaction']}` : null;
        return f.kind === 'transaction' ? `txn:${f.id}` : f.kind === 'journal' ? `journal:${f.id}` : f.kind === 'reconciliation' ? `recon:${f.id}` : f.kind === 'account' ? `account:${f.id}` : null;
      default: return null;
    }
  }
}

/* ================================================================================================
   DETERMINISTIC PLANNER — the fallback when the model does not plan (mock mode, provider failure)
   ================================================================================================ */
export function deterministicPlan(text: string, I: Interpretation, R: Resolved, ctx: SessionContext, gl: GovernedLedger): PlanStep[] {
  const t = text.toLowerCase();
  const a = (o: Record<string, string | null | undefined>) => Object.entries(o).filter(([, v]) => v !== undefined).map(([name, value]) => ({ name, value: value ?? null }));
  const S = (tool: string, purpose: string, args: Record<string, string | null | undefined> = {}, dependsOn: number[] = []): PlanStep => ({ tool, purpose, dependsOn, args: a(args) });
  const acctFromText = I.requestedObject.id?.startsWith('account:') ? I.requestedObject.id.slice(8) : /\bcip\b|construction in progress/.test(t) ? '15000' : /\bpp&?e\b|property, plant/.test(t) ? '16000' : /\bcash\b/.test(t) ? '10000' : /revenue/.test(t) ? '40000' : null;
  const dim = (t.match(/\bby (entity|project|vendor|cost cent(?:er|re)|account|currency|property|department)\b/) ?? [])[1];
  const dimKey = dim ? (dim.startsWith('cost') || dim === 'department' ? 'costCenter' : dim) : null;
  const vendor = R.filters.find((f) => f.dimension === 'vendor')?.value ?? gl.vendors().find((v) => t.includes(v.toLowerCase().split(' ')[0]!));
  const range = ctx.periodRange.value;
  const quote = (re: RegExp) => (text.match(re) ?? [])[1]?.trim().replace(/[.”"]+$/, '') ?? null;
  const person = quote(/(?:send (?:it|this|them)? ?to|assign|to) ([A-Z][a-z]+(?: [A-Z][a-z]+)?)(?: as| for)? (?:the )?review/) ?? quote(/assign ([A-Z][a-z]+(?: [A-Z][a-z]+)?) as reviewer/);
  const recName = quote(/to the (.+?) reconciliation/i) ?? quote(/the (.+?) reconciliation/i);
  /* a READ about a named reconciliation (either catalog) reads that reconciliation */
  const recId = I.requestedObject.id?.startsWith('recon:') ? I.requestedObject.id.slice('recon:'.length) : null;
  /* READS about the item already in context — "show me the comment on this Flux item", "the latest reconciliation
     comment", "what support is attached to this reconciliation" — read it; they never propose a write */
  const readsCtx = /^\s*(show|what|which|list|get|display|who)\b/.test(t) && !/\b(add|attach (these|the|those)|create|post|write|use this)\b/.test(t);
  if (recId && (readsCtx || (I.intent !== 'ACT' && I.intent !== 'BUILD' && I.intent !== 'CORRECTION'))) {
    const rs: PlanStep[] = [];
    if (/support|evidence|attached/.test(t)) rs.push(S('getReconciliationSupport', 'Support attached to the reconciliation', { reconciliationId: recId, period: ctx.period.value }));
    if (/comment/.test(t)) rs.push(S('getReconciliationComments', 'Comments on the reconciliation', { reconciliationId: recId, period: ctx.period.value }));
    if (!rs.length) rs.push(S(/status|tie/.test(t) ? 'getReconciliationStatus' : 'getReconciliation', 'The reconciliation', { reconciliationId: recId, period: ctx.period.value }));
    return rs;
  }
  const recCtx = ctx.focus.value?.kind === 'reconciliation' ? ctx.focus.value.id : ctx.lastRefs['reconciliationId'] ?? null;
  if (readsCtx && /reconcil|\brec\b/.test(t) && recCtx && !recId) {
    if (/support|attached|evidence/.test(t)) return [S('getReconciliationSupport', 'Support attached to the reconciliation', { reconciliationId: recCtx, period: ctx.period.value })];
    if (/comment/.test(t)) return [S('getReconciliationComments', 'Comments on the reconciliation', { reconciliationId: recCtx, period: ctx.period.value })];
  }
  if (readsCtx && /comment/.test(t) && !/reconcil|\brec\b/.test(t) && (acctFromText || ctx.focus.value?.kind === 'account')) return [S('getFluxComments', 'Comments on the Flux item', { account: acctFromText ?? '$ctx.account', period: ctx.period.value })];
  if (/^\s*(no|actually)\b|\binstead\b/i.test(t) && ctx.lastRefs['proposalId']) return [S('reviseActionProposal', 'Apply the correction to the open proposal', { target: recName ?? undefined })];
  if (/approve|certify|publish|mapping change|write.?back|post (it )?to (the )?erp/.test(t)) return [S('prepareGovernedAction', 'Governed — prepare only', { actionType: /approve/.test(t) ? 'RECONCILIATION_APPROVAL' : /certify/.test(t) ? 'CLOSE_CERTIFICATION' : /publish/.test(t) ? 'REPORT_PUBLICATION' : /mapping/.test(t) ? 'MAPPING_CHANGE' : 'ERP_WRITE_BACK', target: recName ?? undefined })];
  if (/flux comment/.test(t) && /attach/.test(t)) { const steps = [S('proposeFluxComment', 'Flux comment from the explanation', { useLastExplanation: 'true' }), S('proposeSupportAttachment', 'Attach the support to the Flux line', { targetType: 'FLUX', kinds: 'INVOICE,PURCHASE_ORDER,CONTRACT,APPROVAL' })]; if (person) steps.push(S('proposeReviewerAssignment', 'Reviewer', { reviewer: person, targetType: 'FLUX' })); return steps; }
  if (/flux comment/.test(t)) return [S('proposeFluxComment', 'Flux comment from the explanation', { useLastExplanation: /this|that|explanation/.test(t) ? 'true' : undefined, text: quote(/comment (?:that|saying) (.+)$/i) ?? undefined })];
  if (/comment/.test(t) && /reconcil|\brec\b/.test(t) && !readsCtx) return [S('proposeReconciliationComment', 'Reconciliation comment', { text: quote(/comment (?:that|saying|:) ?(.+)$/i) ?? text, target: recName ?? undefined })];
  if (/\battach\b/.test(t)) return [S('proposeSupportAttachment', 'Attach support', { target: recName ?? undefined, kinds: /invoice/.test(t) ? 'INVOICE' : 'INVOICE,PURCHASE_ORDER,CONTRACT,APPROVAL' })];
  if (/(create|raise|open) an? issue/.test(t)) return [S('proposeIssue', 'Issue', { amount: quote(/\$\s?([\d.]+)\s?m/i) ?? undefined })];
  if (person) return [S('proposeReviewerAssignment', 'Reviewer assignment', { reviewer: person, target: recName ?? undefined, targetType: recName ? 'RECONCILIATION' : undefined })];
  if (/compile .*support|support package/.test(t)) return [S('proposeSupportPackage', 'Support package draft')];
  if (/save (it|the report)/.test(t) && ctx.lastRefs['reportDraftId']) return [S('proposeSaveReport', 'Save the report draft')];
  if (/save (it|the workbook|the excel)/.test(t) && ctx.lastRefs['excelDraftId']) return [S('proposeSaveExcelArtifact', 'Save the Excel artifact')];
  if (/save .*investigation|share .*investigation/.test(t)) return [S('proposeSaveInvestigation', 'Save investigation', { shareWith: quote(/with (.+)$/i) ?? undefined })];
  if (/save .*analysis/.test(t)) return [S('proposeSaveAnalysis', 'Save analysis')];
  if (/\bin excel\b/.test(t)) return [S('buildExcelArtifact', 'Excel artifact definition')];
  if (ctx.lastRefs['excelDraftId'] && /add|remove|sort|tab/.test(t)) return [S('modifyExcelArtifact', 'Modify the workbook', { addColumn: /\btab\b/.test(t) ? undefined : quote(/add ([a-z ]+?)(?:\.|$| and| on)/i) ?? undefined, removeColumn: quote(/remove ([a-z ]+?)(?:\.|$| and)/i) ?? undefined, sort: /sort/.test(t) ? 'amount_desc' : undefined, addSheet: /\btb\b|trial balance/.test(t) ? 'TB' : undefined })];
  if (/build .*report/.test(t)) return [S('buildReportDraft', 'Report draft', { rows: quote(/by ([a-z ,]+?)(?: for| from|\.|$)/i) ?? 'project', vendor: gl.vendors().find((v) => t.includes(v.toLowerCase().split(' ')[0]!)) ?? undefined, periodStart: range?.start ?? undefined, periodEnd: range?.end ?? undefined, spend: /spend/.test(t) ? 'true' : undefined })];
  if (ctx.lastRefs['reportDraftId'] && /add|remove|first|only include|compare/.test(t)) return [S('modifyReportDraft', 'Modify the report', { addDimension: quote(/add (entity|project|vendor|account|department|cost center)/i) ?? undefined, removeDimension: quote(/remove (entity|project|vendor|account|department|cost center)/i) ?? undefined, moveFirst: quote(/put (\w+) first/i) ?? undefined, minAbsAmount: quote(/over \$\s?([\d.]+)\s?m/i) ?? undefined, comparison: quote(/compare (?:it |that )?to (fy\s?\d{2,4}|last year)/i) ?? undefined })];
  if (/(why|what drove).*(and|&).*(reconcil|\brec\b)/.test(t)) return [S('getAccountAnalysis', 'Why it moved', { account: acctFromText ?? '$ctx.account' }), S('getDriverAnalysis', 'Drivers by project', { dimension: 'project', account: acctFromText ?? '$ctx.account' }), S('getReconciliationsForAccount', 'The account\'s reconciliations', { account: acctFromText ?? '$ctx.account' }), S('getEvidenceForObject', 'Support behind the movement', { populationId: '$0.refs.populationId' }, [0])];
  if (/block|readiness/.test(t) && /close/.test(t)) return [S('getCloseReadiness', 'Close readiness'), S('getCloseBlockers', 'What blocks the close')];
  if (/entit(y|ies)[^.]*behind/.test(t)) return [S('getCloseByEntity', 'Close by entity')];
  if (/need.*(my )?attention|pending approval/.test(t)) return [S('getPendingApprovals', 'Awaiting approval'), S('getCloseBlockers', 'Blockers')];
  if (/(don.?t|do not|doesn.?t|not) tie|untied/.test(t)) return [S('getReconciliationsNotTied', 'Reconciliations that do not tie')];
  if (/reconciling items/.test(t)) return [S('getReconcilingItems', 'Reconciling items', { reconciliationId: '$ctx.reconciliationId' })];
  if (/(recs?|reconciliations?).*missing support|missing support.*(recs?|reconciliations?)/.test(t)) return [S('getReconciliationsMissingSupport', 'Reconciliations missing support')];
  if (/pending review/.test(t)) return [S('getReconciliationsPendingReview', 'Pending review')];
  if (/missing (support|evidence)|have missing/.test(t) && ctx.populationId.value) return [S('findMissingEvidence', 'Lines missing support', { populationId: ctx.populationId.value })];
  if (/support behind the largest/.test(t) && vendor) return [S('getGovernedPopulation', 'Vendor transactions', { vendor, periodStart: range?.start ?? ctx.period.value, periodEnd: range?.end ?? ctx.period.value }), S('getEvidenceForObject', 'Support for the largest', { objectRef: null }, [0])].map((s, i) => (i === 1 ? { ...s, args: [{ name: 'objectRef', value: '$0.refs.largestTransactionRef' }] } : s));
  if (/unexplained/.test(t) && /flux/.test(t)) return [S('getUnexplainedFluxItems', 'Unexplained flux items')];
  if (/comment/.test(t) && acctFromText) return [S('getFluxComments', 'Flux comments', { account: acctFromText })];
  if (/flux/.test(t)) return [S('getFluxSummary', 'Flux summary')];
  if (/reports?.*(include|contain|with)/.test(t)) return [S('getSavedReports', 'Reports that include the line', { account: acctFromText })];
  /* a report named from Saved Reports (the store the Reporting workspace edits) is read from there */
  if (/\breport\b/.test(t) && /^\s*(show|open|get|display|find|what)/.test(t) && !/\b(build|create|save|add|remove|compare)\b/.test(t) && findSavedReport(text)) return [S('getSavedReport', 'The saved report', { text })];
  if (/cfo report/.test(t)) return [S('getReportData', 'CFO report', { reportId: 'RPT-CFO-MONTHLY' })];
  if (/changed the most|largest (movement|change)|biggest (movement|change)|moved the most/.test(t)) return [S('getLargestFinancialMovements', 'Largest movements')];
  if (dimKey && (ctx.focus.value?.kind === 'account' || acctFromText)) return [S('getDriverAnalysis', `Drivers by ${dimKey}`, { dimension: dimKey, account: acctFromText ?? '$ctx.account' })];
  if (/proof|prove|bridge/.test(t)) return [S('getVarianceBridge', 'Proof bridge', { account: acctFromText ?? '$ctx.account' })];
  if (/\bgl\b|general ledger|transactions|journal lines/.test(t) && (acctFromText || ctx.focus.value?.kind === 'account' || ctx.lastRefs['largestAccount'])) return [S('getAccountActivity', 'The GL behind it', { account: acctFromText ?? '$ctx.account' })];
  if (/compare|last year|prior year/.test(t) && vendor) return [S('comparePeriods', 'Vendor comparison', { vendor })];
  if (vendor && /spend|activity|cost/.test(t)) return [S('getTrend', 'Vendor spend by month', { vendor, periodStart: range?.start ?? ctx.period.value, periodEnd: range?.end ?? ctx.period.value })];
  if (/cash flow/.test(t)) return [S('getCashFlowStatement', 'Cash flow')];
  if (/balance sheet/.test(t)) return [S('getBalanceSheet', 'Balance sheet')];
  if (I.requestedObject.type === 'INCOME_STATEMENT') return [S('getIncomeStatement', 'Income statement', { periodStart: range?.start ?? ctx.period.value, periodEnd: range?.end ?? ctx.period.value, scope: ctx.scope.value })];
  if (I.requestedObject.type === 'TRIAL_BALANCE') return [ctx.scope.value !== 'GROUP' ? S('getTrialBalance', 'Entity trial balance', { entity: ctx.scope.value }) : S('getTrialBalanceByEntity', 'Trial balance by entity')];
  if (/financials?|results/.test(t) || I.requestedObject.type === 'FINANCIAL_STATEMENT') return [S('getFinancialSummary', 'Financial summary')];
  if (acctFromText) return [S('getAccountAnalysis', 'Account analysis', { account: acctFromText })];
  return [];
}

/* ================================================================================================
   GROUNDING — a number in the narrative must be a fact's display value
   ================================================================================================ */
const numTokens = (s: string) => (s.match(/\(?[$£€]?\d[\d,]*(?:\.\d+)?[MKB%]?\)?/g) ?? []).map((t) => t.replace(/[(),$£€]/g, ''));
export function ground(sentences: { text: string; objectIds: string[]; factKeys: string[] }[], objects: FinancialObject[]) {
  const allowed = new Set(objects.flatMap((o) => o.facts.flatMap((f) => numTokens(f.display))));
  /* identifiers (journal, account, project codes) are names, not figures */
  const idTokens = new Set(objects.flatMap((o) => [o.title, ...o.facts.map((f) => f.label), ...o.table.rows.map((r) => r.label)]).flatMap(numTokens));
  const accepted: typeof sentences = [];
  const rejected: { text: string; why: string }[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    const bad = numTokens(s.text.replace(/\b(?:JE|REC|FLUX|RPT|PBC|POP|AUD|INV|PO|CTR|APR|WP|MEMO)-[A-Z0-9#-]+/gi, '').replace(/\b20\d\d(-\d\d)?\b/g, '')).filter((t) => !allowed.has(t) && !idTokens.has(t));
    if (bad.length) { rejected.push({ text: s.text, why: `ungrounded number ${bad.join(', ')}` }); continue; }
    if (seen.has(s.text)) continue;
    seen.add(s.text); accepted.push(s);
  }
  return { accepted, rejected };
}
function deterministicNarrative(objects: FinancialObject[]) {
  const out: { text: string; objectIds: string[]; factKeys: string[] }[] = [];
  for (const o of objects) {
    if (o.status === 'UNAVAILABLE') { out.push({ text: o.unavailable!.reason, objectIds: [o.id], factKeys: [`${o.id}.unavailable`] }); continue; }
    const f = (k: string) => o.facts.find((x) => x.key === k);
    if (o.type === 'IncomeStatement' && f('netIncome.range') && f('totalRevenue.range'))
      out.push({ text: `${o.scope.name} earned net income of ${f('netIncome.range')!.display} on total revenue of ${f('totalRevenue.range')!.display} for ${o.periodLabel}.`, objectIds: [o.id], factKeys: [`${o.id}.netIncome.range`, `${o.id}.totalRevenue.range`] });
    else if (o.type === 'TrialBalance' && f('difference'))
      out.push({ text: `Debits of ${f('debit')!.display} and credits of ${f('credit')!.display} leave a difference of ${f('difference')!.display}.`, objectIds: [o.id], factKeys: [`${o.id}.debit`, `${o.id}.credit`, `${o.id}.difference`] });
    else if (o.facts[0]) out.push({ text: `${o.title}: ${o.facts.slice(0, 3).map((x) => `${x.label} ${x.display}`).join('; ')}.`, objectIds: [o.id], factKeys: o.facts.slice(0, 3).map((x) => `${o.id}.${x.key}`) });
  }
  return out;
}

/* ================================================================================================
   DETERMINISTIC INTERPRETER — used when the adapter declines, fails or is unsure
   ================================================================================================ */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function deterministicInterpret(text: string, data: FinancialDataService, ctx: SessionContext, recs: { id: string; name: string }[] = []): Interpretation {
  const t = text.toLowerCase();
  /* a request that names a reconciliation (either catalog) is about THAT reconciliation, not the account its name contains */
  const recHit = /reconcil|\brecs?\b/.test(t) ? recs.filter((r) => t.includes(r.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0] ?? null : null;
  /* "show me the comments" reads comments; "add a comment" proposes one */
  const reads = /^\s*(show|list|view|read|display|what|which|who|get)\b/.test(t) && !/\b(add|attach|create|assign|post|write)\b/.test(t);
  const type = /income statement|p\s?&\s?l|profit and loss|p and l|statement of operations/.test(t) ? 'INCOME_STATEMENT'
    : /balance sheet/.test(t) ? 'BALANCE_SHEET' : /trial balance|\btb\b/.test(t) ? 'TRIAL_BALANCE' : /\bfinancials?\b/.test(t) ? 'FINANCIAL_STATEMENT'
    : /reconcil|\brecs?\b/.test(t) ? 'RECONCILIATION' : /\bclose\b/.test(t) ? 'CLOSE' : /flux/.test(t) ? 'FLUX' : /report/.test(t) ? 'REPORT' : null;
  const fy = t.match(/\bfy\s?'?(\d{2,4})\b/);
  const year = fy ? (fy[1]!.length === 2 ? `20${fy[1]}` : fy[1]!) : (t.match(/\b(20\d\d)\b/) ?? [])[1] ?? data.workingPeriod().slice(0, 4);
  const ms = [...t.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g)].map((m) => `${year}-${String(MONTHS.indexOf(m[1]!) + 1).padStart(2, '0')}`);
  const range = fy ? { start: `${year}-01`, end: `${year}-12` } : ms.length >= 2 && /through|thru|\bto\b|until|-|–/.test(t) ? { start: ms[0]!, end: ms[ms.length - 1]! } : null;
  const scopeHit = data.scopes().find((s) => t.includes(s.name.toLowerCase()) || (s.kind === 'GROUP' && /\bconsolidated|\bgroup\b/.test(t)));
  const followUp = /\b(that|this|these|it|them)\b/.test(t) && !type;
  return {
    intent: /^\s*(no|actually)\b|\binstead\b/.test(t) ? 'CORRECTION' : /\b(build|excel|save|add|remove|put|sort|only include)\b/.test(t) ? 'BUILD' : !reads && /\b(comment|attach|issue|assign|review|approve|certify|publish|compile|share)\b/.test(t) ? 'ACT' : 'UNDERSTAND',
    requestedObject: { type: (!reads && /\b(build|excel|save|add|remove|comment|attach|issue|assign|approve|compile)\b/.test(t) ? null : type) as Interpretation['requestedObject']['type'], id: recHit ? `recon:${recHit.id}` : /\bcip\b/.test(t) ? 'account:15000' : null, name: type ? type.replace(/_/g, ' ').toLowerCase() : null },
    operation: /why|drove/.test(t) ? 'EXPLAIN' : /break.*down|\bby \w+/.test(t) ? 'BREAKDOWN' : /\bgl\b|transactions/.test(t) ? 'DRILL' : /proof|support/.test(t) ? 'PROVE' : /compare|last year/.test(t) ? 'COMPARE_PERIODS' : 'VIEW',
    period: !range && ms.length ? ms[0]! : null, periodRange: range, comparisonPeriod: null, comparisonBasis: /last year|prior year/.test(t) ? 'PRIOR_YEAR' : null,
    scope: scopeHit ? { name: scopeHit.name, candidateId: `scope:${scopeHit.id}` } : null,
    dimensions: [], filters: [], minAbsAmount: null, topN: null, outputPreference: /monthly/.test(t) ? 'MONTHLY_COLUMNS' : null,
    /* a pointer ("this Flux item", "that reconciliation") refers to what is in context, whatever type word it carries */
    continuity: followUp || !type || /\b(this|that|these|those|it)\b/.test(t) ? 'CONTINUATION' : type !== ctx.object.value.type ? 'NEW_OBJECT' : 'CONTINUATION',
    needsClarification: false, clarificationFields: [], multiStep: /\band\b.*\?|and does/.test(t), confidence: 0.7,
  };
}

/* ================================================================================================
   EXECUTION TRACE — created and kept server-side
   ================================================================================================ */
export interface SloaneExecutionTrace {
  traceId: string; sessionId: string; startedAt: string; endedAt: string | null; latencyMs: number | null;
  actor: { id: string; role: string; scope: 'ALL' | string[] }; writeActionsEnabled: boolean; engine: { provider: string; model: string };
  request: string; resumedFromTrace: string | null;
  calls: { stage: string; status: string; code: string | null; detail: string | null; providerRequestId: string | null; latencyMs: number; usage: Usage | null }[];
  contextBefore: unknown; candidatesSupplied: number; governedPeriods: string[];
  interpretation: Interpretation | null; interpretationSource: 'reasoning' | 'deterministic' | 'clarification' | null;
  resolution: Resolved | null;
  classification: string | null;
  clarification: (ClarDecision & { asked: string | null; options: string[] }) | null;
  toolsExposed: { domains: string[]; tools: string[] };
  plan: { source: 'deterministic' | 'reasoning' | null; proposed: PlanStep[]; validation: PlanValidation | null };
  toolsExecuted: { tool: string; args: ToolArgs; status: 'COMPLETED' | 'FAILED' | 'REFUSED' | 'SKIPPED'; objectId: string | null; latencyMs: number; warnings: string[]; error: string | null; result: { type: string; status: string; facts: number; populationId: string | null; rows: number } | null }[];
  objects: { id: string; type: string; title: string; status: string; facts: number }[];
  narrative: { source: 'reasoning' | 'deterministic' | null; accepted: number; rejected: { text: string; why: string }[] };
  contextAfter: unknown; tokens: { input: number; output: number; cacheRead: number };
  limitsReached: string[]; fallbacks: string[]; warnings: string[]; state: string | null; errors: string[];
  proposals: { id: string; type: string; riskLevel: string; status: string; validationStatus: string; target: string | null; errors: string[]; warnings: string[]; dependsOn: string[] }[];
}

/* ================================================================================================
   THE ORCHESTRATOR
   ================================================================================================ */
export type TurnState = 'ANSWER' | 'CLARIFICATION_REQUIRED' | 'UNAVAILABLE' | 'ERROR';
export interface TurnInput { sessionId?: unknown; request?: unknown; clarification?: unknown }
export interface TurnResponse {
  sessionId: string; traceId: string; state: TurnState; mode: 'reasoning' | 'deterministic'; latencyMs: number;
  notes: string[];
  clarification: { pendingId: string; field: string; question: string; options: { id: string; label: string }[] } | null;
  objects: FinancialObject[];
  narrative: { text: string; objectIds: string[] }[];
  context: { object: Field<string | null>; period: Field<string>; scope: Field<string>; currency: Field<string>; basis: Field<string>; focus: Field<string | null>; populationId: Field<string | null> };
  /** proposals prepared this turn — nothing in them has been executed */
  actions?: { planId: string; proposals: ActionProposal[] } | null;
}
interface Pending { id: string; request: string; interpretation: Interpretation; field: string; options: { id: string; label: string }[]; loops: number; traceId: string }
interface Session {
  ctx: SessionContext; pending: Pending | null; touched: number;
  /** the authenticated user this conversation belongs to; another user never inherits it */
  ownerId: string;
  drafts: ToolSession['drafts'];
  /** the last ANALYSIS answer (proposal turns never overwrite it: "use this explanation" means the analysis) */
  lastNarrative: string[]; lastObjects: FinancialObject[]; lastToolCalls: { tool: string; args: ToolArgs }[];
  investigation: { id: string; objective: string; findings: string[]; objects: { id: string; type: string; title: string }[]; populationIds: string[] };
}

const SID = /^[A-Za-z0-9_-]{8,64}$/;
const redact = (s: string) => s.replace(/sk-ant-[A-Za-z0-9_-]+/g, '<redacted>');
/** resolve `$N.refs.key` / `$N.facts.key` against earlier outputs (a transactionRef variant yields `txn:<id>`) */
function refValue(path: string, results: (FinancialObject | null)[]): string | null {
  const m = path.match(/^\$(\d+)\.(refs|facts|population)\.?(.*)$/);
  if (!m) return null;
  const o = results[Number(m[1])];
  if (!o || o.status === 'UNAVAILABLE') return null;
  if (m[2] === 'population') return o.population?.populationId ?? o.refs['populationId'] ?? null;
  if (m[2] === 'facts') return String(o.facts.find((f) => f.key === m[3])?.value ?? '') || null;
  const key = m[3]!;
  if (key.endsWith('Ref') && o.refs[key.slice(0, -3)]) return `txn:${o.refs[key.slice(0, -3)]}`;
  return o.refs[key] ?? null;
}

export class SloaneOrchestrator {
  readonly data: FinancialDataService;
  readonly gl: GovernedLedger;
  readonly controls: ControlService;
  readonly context: FinancialContextEngine;
  readonly clarifier: ClarificationEngine;
  readonly planner: Planner;
  private readonly sessions = new Map<string, Session>();
  private readonly traces: SloaneExecutionTrace[] = [];
  readonly actions: ActionEngine;

  readonly db: KorvynDatabase;
  constructor(private readonly adapter: SloaneLLMAdapter, private readonly cfg: Pick<SloaneConfig, 'maxPlanSteps'>, private readonly actorOf: () => Actor = serverActor, data?: FinancialDataService, db?: KorvynDatabase) {
    this.data = data ?? new FinancialDataService();
    this.gl = new GovernedLedger(this.data);
    this.controls = new ControlService(this.gl);
    this.context = new FinancialContextEngine(this.data, this.gl, this.controls);
    this.clarifier = new ClarificationEngine(this.data);
    this.planner = new Planner(this.data, this.gl, this.controls);
    /* the durable work store: the process database (KORVYN_DB_PATH), or an in-memory database under the test runner */
    this.db = db ?? workDatabase(process.env['NODE_TEST_CONTEXT'] ? ':memory:' : undefined);
    bindWork(this.db);
    seedDevelopment(this.db, WORK.repos, this.data.workingPeriod(), this.controls.recDefs());
    /* the actor is resolved at every proposal AND every execution from the request's authenticated context */
    this.actions = new ActionEngine((a) => ({ gl: this.gl, controls: this.controls, actor: a ?? this.actorOf() }));
  }

  /** The user's decision on a proposal or plan. The browser collects it; everything else happens here. */
  decide(input: DecideInput, actor?: Actor): DecideResult {
    const r = this.actions.decide(input, actor);
    const s = this.sessions.get(input.sessionId);
    if (s && r.results.some((x) => x.status === 'COMPLETED')) {
      s.ctx.lastRefs = { ...s.ctx.lastRefs, ...Object.assign({}, ...r.proposals.map((p) => (p.result ? Object.fromEntries(Object.entries(p.result).filter(([, v]) => typeof v === 'string')) : {}))) };
      const rec = r.proposals.filter((p) => p.status === 'COMPLETED' && p.targetObjectType === 'RECONCILIATION').at(-1);
      if (rec?.targetObjectId) { const id = rec.targetObjectId.split(':')[1]!; s.ctx.lastRefs['reconciliationId'] = id; s.ctx.focus = { value: { kind: 'reconciliation', id, name: rec.targetLabel ?? id }, source: 'DERIVED' }; }
    }
    return r;
  }
  private investigationIdsOf(sessionId: string) {
    const s = this.sessions.get(sessionId);
    return [...new Set([...(s?.investigation.id ? [s.investigation.id] : []), ...this.actions.ofSession(sessionId).map((p) => p.investigationId).filter((x): x is string => !!x)])];
  }
  /** who owns a live conversation (null when the server holds none): a session is never read or acted on by another user */
  sessionOwner(sessionId: string): string | null { return this.sessions.get(sessionId)?.ownerId ?? null; }
  timeline(sessionId: string) { return this.actions.timeline(this.investigationIdsOf(sessionId)); }
  auditOf(sessionId: string) { return this.investigationIdsOf(sessionId).flatMap((id) => WORK.repos.audit.list({ investigationId: id })); }

  /* ---- durable investigations ------------------------------------------------------------------ */
  private canSee(inv: Stamped<InvestigationBody>, actor: Actor) { return inv.owner === actor.id || WORK.repos.saved.list('INVESTIGATION_SHARE').some((x) => x.definition['investigationId'] === inv.id && x.sharedWith.some((w) => w === actor.id || w.toLowerCase() === actor.name.toLowerCase() || actor.name.toLowerCase().startsWith(w.toLowerCase()))); }
  listInvestigations(actor: Actor) {
    return WORK.repos.investigations.listFor(actor.id).map((i) => ({ id: i.id, title: i.title, objective: i.objective, period: i.period, scope: i.scope, steps: i.steps.length, findings: i.findings.length, actions: i.actionIds.length, updatedAt: i.updatedAt, createdAt: i.createdAt }));
  }
  /** the restorable investigation: context, findings, objects re-derived from their recorded READ tool calls, evidence, actions, artifacts, timeline */
  investigationView(id: string, actor: Actor) {
    const inv = WORK.repos.investigations.get(id);
    if (!inv || !this.canSee(inv, actor)) return null;
    const env = { data: this.data, gl: this.gl, controls: this.controls, actor, visible: visibleOf(actor) };
    const steps = inv.steps.map((st, si) => {
      const objects: FinancialObject[] = [];
      st.toolCalls.forEach((call, ci) => { const t = toolRegistry.get(call.tool); if (!t || t.risk !== 'READ' || !authorize(actor, t, call.args).ok) return; try { const r = t.run(call.args, { ...env, objectId: `R${si + 1}-FO-${ci + 1}` }); objects.push(r.object); } catch { /* a call that no longer resolves is reported by its absence */ } });
      return { at: st.at, request: st.request, traceId: st.traceId, narrative: st.narrative, objects, proposalIds: st.proposalIds };
    });
    const artifacts = (['ANALYSIS', 'REPORT', 'EXCEL', 'PACKAGE'] as const).flatMap((k) => WORK.repos.saved.list(k).filter((x) => x.investigationId === id).map((x) => ({ id: x.id, kind: k, name: x.name, createdAt: x.createdAt })));
    const proposals = this.actions.ofInvestigation(id);
    return { investigation: { id: inv.id, title: inv.title, objective: inv.objective, owner: inv.ownerName, period: inv.period, scope: inv.scope, currency: inv.currency, basis: inv.basis, version: inv.version, createdAt: inv.createdAt, updatedAt: inv.updatedAt },
      context: WORK.repos.investigations.latestSnapshot(id)?.context ?? inv.context, findings: inv.findings, objectRefs: inv.objectRefs, populationRefs: inv.populationRefs,
      evidenceRefs: [...new Set(proposals.flatMap((p) => p.evidenceIds))], proposals, artifacts, steps, timeline: this.actions.timeline([id]), audit: WORK.repos.audit.list({ investigationId: id }) };
  }
  /** continue an investigation in a conversation: the server session is rebuilt from the durable record */
  resumeInvestigation(id: string, sessionId: string, actor: Actor) {
    const view = this.investigationView(id, actor);
    if (!view || !SID.test(sessionId)) return null;
    const snap = WORK.repos.investigations.latestSnapshot(id)?.context as SessionContext | undefined;
    const last = view.steps.filter((x) => x.objects.length).at(-1);
    const inv = WORK.repos.investigations.get(id)!;
    this.sessions.set(sessionId, { ctx: snap ?? this.context.initial(actor), pending: null, touched: Date.now(), ownerId: actor.id, drafts: { report: null, excel: null },
      lastNarrative: last?.narrative ?? [], lastObjects: last?.objects ?? [], lastToolCalls: inv.steps.filter((x) => x.toolCalls.length).at(-1)?.toolCalls ?? [],
      investigation: { id, objective: inv.objective, findings: inv.findings.slice(), objects: inv.objectRefs.map((o) => ({ id: o.ref, type: o.type, title: o.title })), populationIds: inv.populationRefs.slice() } });
    WORK.repos.investigations.update(id, actor.id, (o) => ({ ...(o as InvestigationBody), sessionIds: [...new Set([...o.sessionIds, sessionId])] }));
    return view;
  }
  private ensureInvestigation(session: Session, actor: Actor, request: string) {
    if (session.investigation.id) return session.investigation.id;
    const ctx = session.ctx;
    const rec = WORK.repos.investigations.create({ title: request.slice(0, 80), objective: request.slice(0, 300), owner: actor.id, ownerName: actor.name, currency: ctx.currency.value, basis: ctx.basis.value,
      context: this.context.forModel(ctx) as Record<string, unknown>, objectRefs: [], populationRefs: [], findings: [], evidenceRefs: [], actionIds: [], artifactIds: [], steps: [], sessionIds: [] }, actor.id, ctx.period.value, ctx.scope.value);
    session.investigation.id = rec.id;
    return rec.id;
  }

  get mode(): 'reasoning' | 'deterministic' { return this.adapter.provider === 'mock' ? 'deterministic' : 'reasoning'; }
  trace(id: string): SloaneExecutionTrace | undefined { return this.traces.find((t) => t.traceId === id); }

  async turn(input: TurnInput, actorArg?: Actor): Promise<TurnResponse> {
    const t0 = Date.now();
    const actor = actorArg ?? this.actorOf();
    const sessionId = typeof input.sessionId === 'string' && SID.test(input.sessionId) ? input.sessionId : randomUUID();
    let session = this.sessions.get(sessionId);
    if (session && session.ownerId !== actor.id) { session = undefined; }
    if (!session) { session = { ctx: this.context.initial(actor), pending: null, touched: t0, ownerId: actor.id, drafts: { report: null, excel: null }, lastNarrative: [], lastObjects: [], lastToolCalls: [], investigation: { id: '', objective: '', findings: [], objects: [], populationIds: [] } }; this.sessions.set(sessionId, session); }
    if (!session.investigation.objective && typeof input.request === 'string') session.investigation.objective = input.request.trim().slice(0, 300);
    session.touched = t0;
    const request = typeof input.request === 'string' ? input.request.trim().slice(0, LIMITS.maxRequestChars) : '';
    const tr: SloaneExecutionTrace = {
      traceId: `STR-${randomUUID().slice(0, 8)}`, sessionId, startedAt: new Date(t0).toISOString(), endedAt: null, latencyMs: null,
      actor: { id: actor.id, role: actor.role, scope: actor.scopeIds }, writeActionsEnabled: WRITE_ACTIONS_ENABLED,
      engine: { provider: this.adapter.provider, model: this.adapter.model }, request, resumedFromTrace: null,
      calls: [], contextBefore: this.context.forModel(session.ctx), candidatesSupplied: 0, governedPeriods: this.data.governedPeriods(),
      interpretation: null, interpretationSource: null, resolution: null, classification: null, clarification: null,
      toolsExposed: { domains: [], tools: [] }, plan: { source: null, proposed: [], validation: null }, toolsExecuted: [], objects: [],
      narrative: { source: null, accepted: 0, rejected: [] }, contextAfter: null, tokens: { input: 0, output: 0, cacheRead: 0 },
      limitsReached: [], fallbacks: [], warnings: [], state: null, errors: [], proposals: [],
    };
    const notes: string[] = [];
    const note = (s: string) => { if (s && !notes.includes(s)) notes.push(s); };
    const spend = (u: Usage | null) => { if (u) { tr.tokens.input += u.inputTokens; tr.tokens.output += u.outputTokens; tr.tokens.cacheRead += u.cacheReadTokens; } };
    const overBudget = () => { const b = tr.tokens.input + tr.tokens.output > LIMITS.tokenBudget, w = Date.now() - t0 > LIMITS.wallClockMs;
      if (b && !tr.limitsReached.includes('tokenBudget')) tr.limitsReached.push('tokenBudget'); if (w && !tr.limitsReached.includes('wallClock')) tr.limitsReached.push('wallClock'); return b || w; };

    const finish = (state: TurnState, extra: Partial<TurnResponse> = {}): TurnResponse => {
      tr.state = state; tr.endedAt = new Date().toISOString(); tr.latencyMs = Date.now() - t0; tr.contextAfter = this.context.forModel(session!.ctx);
      this.traces.push(tr); if (this.traces.length > 200) this.traces.shift();
      console.log(`[sloane] ${tr.traceId} ${tr.engine.provider}:${tr.engine.model} ${state} ${tr.latencyMs}ms tools=${tr.toolsExecuted.map((x) => `${x.tool}:${x.status}`).join(',') || '-'} in=${tr.tokens.input} out=${tr.tokens.output}`);
      const c = session!.ctx;
      return {
        sessionId, traceId: tr.traceId, state, mode: this.mode, latencyMs: tr.latencyMs, notes, clarification: null, objects: [], narrative: [],
        context: { object: { value: c.object.value.type, source: c.object.source }, period: c.period, scope: { value: this.data.scope(c.scope.value)?.name ?? c.scope.value, source: c.scope.source }, currency: c.currency, basis: c.basis,
          focus: { value: c.focus.value?.name ?? null, source: c.focus.source }, populationId: c.populationId },
        ...extra,
      };
    };

    try {
      /* ---- 1. interpretation: an answer to a pending question, or the model, or the deterministic engine ---- */
      let I: Interpretation;
      let raw = request;
      let loops = 0;
      const answer = this.matchClarification(session, input.clarification, request);
      if (answer) {
        const Pd = session.pending!;
        I = JSON.parse(JSON.stringify(Pd.interpretation));
        raw = Pd.request; loops = Pd.loops + 1; tr.request = Pd.request; tr.resumedFromTrace = Pd.traceId;
        if (answer.startsWith('scope:')) I.scope = { name: this.data.scope(answer.slice(6))!.name, candidateId: answer };
        if (answer.startsWith('period:')) I.period = answer.slice(7);
        I.needsClarification = false; I.clarificationFields = [];
        tr.interpretationSource = 'clarification';
        session.pending = null;
      } else {
        if (input.clarification) return finish('UNAVAILABLE', { notes: ['That question is no longer pending. Ask again and Sloane will re-interpret the request.'] });
        if (!request) return finish('ERROR', { notes: ['request is required'] });
        session.pending = null;
        const cands = this.context.candidates(request, actor);
        tr.candidatesSupplied = cands.length;
        const out = await this.adapter.interpret({ request, context: this.context.forModel(session.ctx), candidates: cands, workingPeriod: this.data.workingPeriod(), availablePeriods: this.data.governedPeriods() });
        this.recordCall(tr, 'interpret', out); spend(out.status === 'ok' ? out.usage : null);
        if (out.status === 'ok' && out.value.confidence >= LIMITS.minConfidence) {
          I = out.value; tr.interpretationSource = 'reasoning';
          /* the engine overrules the model when the request names a reconciliation in full: it is about THAT one */
          const named = deterministicInterpret(request, this.data, session.ctx, this.controls.allRecDefs().map((d) => ({ id: d.id, name: d.name }))).requestedObject.id;
          /* reads only: an ACT names its target in the proposal, and must keep the population in context that it acts on */
          if (named?.startsWith('recon:') && I.requestedObject.id !== named && I.intent !== 'ACT' && I.intent !== 'BUILD' && I.intent !== 'CORRECTION') { I = { ...I, requestedObject: { ...I.requestedObject, type: 'RECONCILIATION', id: named } }; tr.fallbacks.push(`interpretation: named reconciliation ${named} overrides the model's object`); }
        }
        else {
          I = deterministicInterpret(request, this.data, session.ctx, this.controls.allRecDefs().map((d) => ({ id: d.id, name: d.name }))); tr.interpretationSource = 'deterministic';
          const why = out.status === 'ok' ? `low confidence (${out.value.confidence})` : out.status === 'declined' ? 'the reasoning service declined' : `the reasoning service failed: ${out.code}`;
          tr.fallbacks.push(`interpretation: deterministic — ${why}`);
          if (out.status === 'error') note('Sloane’s reasoning service was unavailable, so this request was interpreted by Korvyn’s deterministic engine.');
        }
      }
      const v = validateInterpretation(I);
      if (!v.ok) { tr.errors.push(...v.errors); return finish('ERROR', { notes: ['The interpretation failed validation.'] }); }
      tr.interpretation = I;

      /* ---- 2. context: validate against governed catalogues, classify, apply ---- */
      const R = this.context.resolve(I, session.ctx);
      tr.resolution = R;
      tr.classification = R.named.object && session.ctx.object.value.type && session.ctx.object.value.type !== R.objectType ? 'NEW_OBJECT' : I.continuity;
      R.warnings.forEach(note);
      if (R.errors.length) { R.errors.forEach(note); return finish('UNAVAILABLE'); }
      const ctx = this.context.apply(session.ctx, R, I);
      /* a reconciliation the request names is the focus BEFORE planning, so `$ctx.reconciliationId` resolves to it */
      const namedRec = I.requestedObject.id?.startsWith('recon:') && I.intent !== 'ACT' && I.intent !== 'BUILD' && I.intent !== 'CORRECTION' ? this.controls.recDef(I.requestedObject.id.slice(6)) : null;
      if (namedRec) { ctx.lastRefs['reconciliationId'] = namedRec.id; ctx.focus = { value: { kind: 'reconciliation', id: namedRec.id, name: namedRec.name }, source: 'EXPLICIT' }; }
      session.ctx = ctx;

      /* ---- 3. clarification decision ---- */
      const dec = this.clarifier.decide(I, R, ctx, loops);
      if (dec.capped) tr.limitsReached.push('maxClarificationLoops');
      if (dec.needed.length) {
        const field = dec.needed[0]!;
        const q = this.clarifier.question(field, R, actor);
        session.pending = { id: `CLR-${randomUUID().slice(0, 8)}`, request: raw, interpretation: I, field, options: q.options, loops, traceId: tr.traceId };
        tr.clarification = { ...dec, asked: field, options: q.options.map((o) => o.label) };
        return finish('CLARIFICATION_REQUIRED', { clarification: { pendingId: session.pending.id, field, question: q.question, options: q.options } });
      }
      tr.clarification = { ...dec, asked: null, options: [] };

      /* ---- 4. plan: exposure is permission-filtered and request-relevant; the model plans, Korvyn validates ---- */
      const { tools: allow, domains } = this.planner.allowlist(actor, I, raw, ctx);
      tr.toolsExposed = { domains, tools: allow.map((t) => t.id) };
      /* a domain the request names but the actor may not read is said, never silently answered around */
      for (const [dom, re] of DOMAIN_WORDS) {
        if (!re.test(raw)) continue;
        const inDomain = toolRegistry.all().filter((t) => t.domain === dom && t.risk === 'READ');
        const denied = inDomain.filter((t) => !authorize(actor, t).ok);
        if (inDomain.length && denied.length === inDomain.length) { const perm = [...new Set(denied.map((t) => t.permission))].join(', '); note(`You are not permitted to view ${dom === 'recon' ? 'reconciliation' : dom} data (${perm}); Sloane answered only from what your role can see.`); tr.warnings.push(`domain ${dom} denied: ${perm}`); }
      }
      let steps: PlanStep[] = [];
      if (this.mode === 'reasoning' && !overBudget()) {
        const tools = allow.map((t) => ({ id: t.id, description: t.description, requiredInputs: t.params.filter((p) => p.required).map((p) => `${p.name} (${p.kind})`), optionalInputs: t.params.filter((p) => !p.required).map((p) => `${p.name} (${p.kind})`), outputs: t.outputs }));
        const out = await this.adapter.plan({ request: raw, interpretation: I, context: this.context.forModel(ctx), tools, maxSteps: Math.min(this.cfg.maxPlanSteps, LIMITS.maxToolCalls) });
        this.recordCall(tr, 'plan', out); spend(out.status === 'ok' ? out.usage : null);
        if (out.status === 'ok') { steps = out.value.steps; tr.plan.source = 'reasoning'; }
        else tr.fallbacks.push(`plan: deterministic — ${out.status === 'error' ? out.code : out.status}`);
      }
      let pv = this.planner.validate(steps, allow, actor, ctx);
      if (!pv.steps.length) {
        const det = deterministicPlan(raw, I, R, ctx, this.gl);
        if (steps.length) tr.fallbacks.push('plan: deterministic — no model step survived validation');
        const detAllow = toolRegistry.all().filter((t) => (t.risk === 'READ' || t.risk === 'PROPOSE') && authorize(actor, t).ok);
        const dv = this.planner.validate(det, detAllow, actor, ctx);
        if (dv.steps.length) { steps = det; pv = { ...dv, rejected: [...pv.rejected, ...dv.rejected], repairs: [...pv.repairs, ...dv.repairs] }; tr.plan.source = 'deterministic'; }
        else pv = { ...pv, rejected: [...pv.rejected, ...dv.rejected] };
      }
      tr.plan.proposed = steps; tr.plan.validation = pv;
      if (pv.truncated) tr.limitsReached.push('maxToolCalls');
      if (!pv.steps.length) {
        const permittedAll = toolRegistry.all().filter((t) => t.risk === 'READ');
        const denied = permittedAll.filter((t) => allow.length === 0 && !authorize(actor, t).ok);
        note(pv.rejected.length ? `Sloane could not form a governed plan for this request: ${pv.rejected.map((r) => `${r.tool} — ${r.why}`).join('; ')}.` : 'Sloane does not have a governed Korvyn capability that answers this request yet.');
        if (denied.length) note(`You are not permitted to use: ${denied.map((t) => t.id).join(', ')}.`);
        return finish('UNAVAILABLE');
      }

      /* ---- 5. execute, server-side; references resolve against earlier outputs; permission re-checked per call ---- */
      const results: (FinancialObject | null)[] = [];
      const objects: FinancialObject[] = [];
      const planId = `PLAN-${randomUUID().slice(0, 8)}`;
      this.ensureInvestigation(session, actor, raw);
      const toolSession: ToolSession = {
        id: sessionId, planId, traceId: tr.traceId, period: ctx.period.value, scope: ctx.scope.value, focus: ctx.focus.value, populationId: ctx.populationId.value,
        lastNarrative: session.lastNarrative, lastObjects: session.lastObjects, lastRefs: ctx.lastRefs, investigationId: session.investigation.id, request: raw,
        investigation: { ...session.investigation, timeline: this.timeline(sessionId) }, lastToolCalls: session.lastToolCalls, proposalsThisTurn: [], drafts: session.drafts, engine: this.actions,
      };
      const env: Omit<ToolEnv, 'objectId'> = { data: this.data, gl: this.gl, controls: this.controls, actor, visible: visibleOf(actor), session: toolSession };
      for (const [i, s] of pv.steps.entries()) {
        const tool = toolRegistry.get(s.tool)!;
        const args: ToolArgs = { ...s.args };
        let skip = '';
        for (const [name, path] of Object.entries(s.refs)) {
          const val = refValue(path, results);
          if (!val) { skip = `${name} (${path}) did not resolve from an earlier result`; break; }
          const kind = tool.params.find((p) => p.name === name)!.kind;
          const chk = this.planner.check(kind, val);
          if (chk.error) { skip = `${name}: ${chk.error}`; break; }
          args[name] = chk.value!;
        }
        if (!skip && tool.params.some((p) => p.name === 'objectRef') && args['objectRef'] && !args['period'] && /^(recon|account):/.test(args['objectRef'])) args['period'] = ctx.period.value;
        for (const p of tool.params) if (!skip && p.required && !args[p.name]) skip = `${p.name} is missing`;
        if (!skip && s.dependsOn.some((d) => !results[d] || results[d]!.status === 'UNAVAILABLE')) skip = 'a step it depends on did not produce a result';
        const st = Date.now();
        if (skip) { results.push(null); tr.toolsExecuted.push({ tool: s.tool, args, status: 'SKIPPED', objectId: null, latencyMs: 0, warnings: [], error: skip, result: null }); continue; }
        const g = authorize(actor, tool, args);
        if (!g.ok) { results.push(null); tr.toolsExecuted.push({ tool: s.tool, args, status: 'REFUSED', objectId: null, latencyMs: 0, warnings: [], error: g.reason, result: null }); note(`Not permitted: ${g.reason}.`); continue; }
        try {
          const r = tool.run(args, { ...env, objectId: `FO-${objects.length + 1}` });
          r.object.facts = r.object.facts.slice(0, LIMITS.maxFactsPerObject);
          results.push(r.object); objects.push(r.object);
          r.warnings.forEach((w) => { if (!tr.warnings.includes(w)) tr.warnings.push(w); });
          if (r.object.status === 'UNAVAILABLE') note(r.object.unavailable!.reason);
          tr.toolsExecuted.push({ tool: s.tool, args, status: 'COMPLETED', objectId: r.object.id, latencyMs: Date.now() - st, warnings: r.warnings, error: null,
            result: { type: r.object.type, status: r.object.status, facts: r.object.facts.length, populationId: r.object.population?.populationId ?? null, rows: r.object.table.rows.length } });
        } catch (e) {
          results.push(null);
          tr.toolsExecuted.push({ tool: s.tool, args, status: 'FAILED', objectId: null, latencyMs: Date.now() - st, warnings: [], error: redact((e as Error).message), result: null });
        }
      }
      tr.objects = objects.map((o) => ({ id: o.id, type: o.type, title: o.title, status: o.status, facts: o.facts.length }));
      if (!objects.length) { note('The planned tools did not produce a financial object.'); return finish('ERROR'); }
      /* the warnings a reader needs (declared inputs, partial evidence) travel as notes, once each */
      tr.warnings.filter((w) => /not connected|unavailable|representative|not modelled|not in the governed|Showing/i.test(w)).slice(0, 4).forEach(note);

      /* ---- 6. explain: the model narrates the facts; grounding rejects any number it did not receive ---- */
      let narrative = deterministicNarrative(objects);
      tr.narrative.source = 'deterministic';
      const proposals = objects.filter((o) => o.action).map((o) => o.action!);
      tr.proposals = proposals.map((p) => ({ id: p.id, type: p.type, riskLevel: p.riskLevel, status: p.status, validationStatus: p.validationStatus, target: p.targetLabel, errors: p.validation.errors, warnings: p.validation.warnings, dependsOn: p.dependsOn }));
      const analysisObjects = objects.filter((o) => !o.action);
      if (proposals.length) {
        const ready = proposals.filter((p) => p.status === 'WAITING_CONFIRMATION').length, gov = proposals.filter((p) => p.riskLevel === 'GOVERNED_ACTION').length;
        narrative = [{ text: `Prepared ${proposals.length} action${proposals.length > 1 ? 's' : ''}${ready ? `, ${ready} ready to confirm` : ''}${gov ? `, ${gov} governed (prepare only)` : ''}. Nothing has been written.`, objectIds: proposals.map((p) => p.id), factKeys: [] }, ...narrative.filter((n) => analysisObjects.some((o) => n.objectIds.includes(o.id)))];
      }
      if (this.mode === 'reasoning' && !overBudget() && analysisObjects.length && !proposals.length) {
        const payload = objects.map((o) => ({ objectId: o.id, type: o.type, title: o.title, status: o.status, facts: o.facts.map((f) => ({ key: `${o.id}.${f.key}`, label: f.label, display: f.display })) }));
        const out = await this.adapter.narrate({ request: raw, objects: payload });
        this.recordCall(tr, 'narrate', out); spend(out.status === 'ok' ? out.usage : null);
        if (out.status === 'ok') {
          const g = ground(out.value.sentences, objects);
          tr.narrative.rejected = g.rejected;
          if (g.accepted.length) { narrative = g.accepted; tr.narrative.source = 'reasoning'; }
          else tr.fallbacks.push('narrative: deterministic — no grounded sentence');
        } else tr.fallbacks.push(`narrative: deterministic — ${out.status === 'error' ? out.code : out.status}`);
      }
      tr.narrative.accepted = narrative.length;

      session.ctx = this.context.commitShown(session.ctx, objects);
      if (analysisObjects.length && !proposals.length) {
        session.lastNarrative = narrative.map((n) => n.text); session.lastObjects = analysisObjects;
        session.lastToolCalls = tr.toolsExecuted.filter((x) => x.status === 'COMPLETED').map((x) => ({ tool: x.tool, args: x.args }));
        session.investigation.findings.push(...narrative.map((n) => n.text).slice(0, 3));
        session.investigation.objects.push(...analysisObjects.map((o) => ({ id: `${tr.traceId}:${o.id}`, type: o.type, title: o.title })));
        for (const o of analysisObjects) { const pid = o.population?.populationId ?? o.refs['populationId']; if (pid && !session.investigation.populationIds.includes(pid)) session.investigation.populationIds.push(pid); }
      }
      /* the investigation is durable: the step (with the READ tool calls that re-derive its objects), findings, references, a context snapshot, and a timeline event */
      {
        const invId = session.investigation.id, completed = tr.toolsExecuted.filter((x) => x.status === 'COMPLETED');
        WORK.repos.investigations.update(invId, actor.id, (o) => ({ ...(o as InvestigationBody),
          steps: [...o.steps, { at: new Date().toISOString(), request: raw, traceId: tr.traceId, toolCalls: completed.map((x) => ({ tool: x.tool, args: x.args })), objectRefs: objects.map((x) => `${tr.traceId}:${x.id}`), narrative: narrative.map((n) => n.text), proposalIds: proposals.map((p) => p.id) }],
          findings: analysisObjects.length && !proposals.length ? [...o.findings, ...narrative.map((n) => n.text).slice(0, 3)] : o.findings,
          objectRefs: [...o.objectRefs, ...analysisObjects.map((x) => ({ ref: `${tr.traceId}:${x.id}`, type: x.type, title: x.title, traceId: tr.traceId }))],
          populationRefs: [...new Set([...o.populationRefs, ...analysisObjects.map((x) => x.population?.populationId ?? x.refs['populationId']).filter((x): x is string => !!x)])],
          actionIds: [...o.actionIds, ...proposals.map((p) => p.id)], context: this.context.forModel(session!.ctx) as Record<string, unknown>,
          sessionIds: [...new Set([...o.sessionIds, sessionId])] }), { period: session.ctx.period.value, scope: session.ctx.scope.value });
        WORK.repos.investigations.snapshot({ investigationId: invId, traceId: tr.traceId, context: session.ctx }, actor.id);
        if (analysisObjects.length) WORK.repos.investigations.event(invId, { type: 'ANALYSIS', label: `Analysed: ${analysisObjects.map((x) => x.title).slice(0, 3).join(' · ')}`, ref: analysisObjects[0]!.id, traceId: tr.traceId }, actor.id);
        if (proposals.length) WORK.repos.investigations.event(invId, { type: 'ACTIONS_PROPOSED', label: `Proposed ${proposals.map((p) => p.title.toLowerCase()).join(', ')}`, ref: proposals[0]!.id, traceId: tr.traceId }, actor.id);
      }
      if (tr.limitsReached.length) note(`Limit reached: ${tr.limitsReached.join(', ')}.`);
      const avail = objects.filter((o) => o.status !== 'UNAVAILABLE');
      return finish(avail.length ? 'ANSWER' : 'UNAVAILABLE', { objects, narrative: narrative.map((n) => ({ text: n.text, objectIds: n.objectIds })), actions: proposals.length ? { planId, proposals } : null });
    } catch (e) {
      tr.errors.push(redact((e as Error).message ?? String(e)));
      return finish('ERROR', { notes: ['Sloane could not complete this request.'] });
    }
  }

  /** A pending question is answered by its option id, or by typing the option's label. */
  private matchClarification(s: Session, c: unknown, request: string): string | null {
    const Pd = s.pending;
    if (!Pd) return null;
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      if (o['pendingId'] !== Pd.id) return null;
      return Pd.options.find((x) => x.id === o['optionId'])?.id ?? null;
    }
    const t = request.toLowerCase();
    if (!t) return null;
    const hit = Pd.options.filter((x) => x.label.toLowerCase() === t || (t.length >= 4 && x.label.toLowerCase().includes(t)));
    return hit.length === 1 ? hit[0]!.id : null;
  }

  private recordCall(tr: SloaneExecutionTrace, stage: string, o: Awaited<ReturnType<SloaneLLMAdapter['interpret']>> | Awaited<ReturnType<SloaneLLMAdapter['plan']>> | Awaited<ReturnType<SloaneLLMAdapter['narrate']>>) {
    tr.calls.push({
      stage, status: o.status, code: o.status === 'error' ? o.code : null,
      detail: o.status === 'error' ? redact(o.detail) : o.status === 'declined' ? o.reason : null,
      providerRequestId: o.status === 'declined' ? null : o.requestId, latencyMs: o.latencyMs, usage: o.status === 'ok' ? o.usage : null,
    });
  }
}
