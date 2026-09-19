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
import { createHash, randomUUID } from 'node:crypto';
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
import { replaySourceFeed } from './sourcefeed.js';
import { ArtifactEngine } from './artifacts/engine.js';
import type { ArtifactDefinition } from './artifacts/model.js';
import { detectType } from './artifacts/sections.js';
import { AuditService } from './audit/pbc.js';
import { PBC_TOOL_IDS, pbcObject } from './audit/pbctools.js';
import './audit/pbcactions.js';
import { bareObjectPlan, semanticPlan } from './semantic/tools.js';
import { ContextAssembler } from './semantic/context.js';
import { financialGraph } from './semantic/graph.js';
import { workbookObject } from './actiontools.js';
import { AgentRuntime } from './agent/runtime.js';
import { ENTITY_WORDS, PROJECT_ALIAS, type ConvDeps, type ConvState, type FastPath, type TurnKind, afterAnswer, beginTurn, capabilityFallback, capabilityGap, contextView, conv, conversationalShortcut, initialConv, interp, investigationTitle, onNewObject, resolveConversational } from './conversation.js';
import type { Conversation } from './schema.js';

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
  /** Phase 6: the conversation — subject, view, last analysis, items shown, active artifact / PBC / proposal */
  conv?: ConvState;
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
      lastRefs: {}, lastObjects: [], conv: initialConv(),
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
  resolve(I: Interpretation, c: SessionContext, request?: string): Resolved {
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
      const cid0 = I.scope.candidateId?.startsWith('scope:') ? I.scope.candidateId.slice(6) : null;
      /* 8A: a scope is accepted only when the words name THAT scope. A project, property or vendor that happens to post
         through an entity ("South Valley" → SV-PH2, on MDH's books) is not the entity: it is a filter, never a scope. */
      /* the USER's words must name it too: a model that reads "project SV-PH2 BELONGS_TO MDH" in the neighbourhood and
         writes MDH's own name has inferred a scope nobody asked for */
      const named = (nm: string) => scopeNamedBy(nm, cid0!, this.data);
      const refused = !!cid0 && cid0 !== c.scope.value && !!this.data.scope(cid0) && (!named(I.scope.name) || (request !== undefined && !named(request)));
      const proj = PROJECT_ALIAS.find(([re]) => re.test((request ?? I.scope!.name).toLowerCase()));
      if (refused) R.warnings.push(proj ? `${this.gl.dimensionValues('project').includes(proj[1]) ? proj[1] : 'That'} is a project, not a legal entity, so the scope stays ${this.data.scope(c.scope.value)?.name ?? c.scope.value}.` : `The scope stays ${this.data.scope(c.scope.value)?.name ?? c.scope.value}: the request does not name ${this.data.scope(cid0!)?.name ?? cid0}.`);
      const cid = refused ? null : cid0;
      if (cid0 && !cid) { /* nothing else to resolve: the named thing is not a scope */ }
      else if (cid && this.data.scope(cid)) { R.scopeId = cid; R.named.scope = true; }
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
    /* the workbook (or report draft) the conversation is building stays in reach across turns that are about something
       else — a proposal, a read — until a new one replaces it */
    const keep = Object.fromEntries(['artifactId', 'excelDraftId', 'artifactVersion', 'reportDraftId', 'pbcRequestId', 'pbcSelectionScope'].filter((k) => c.lastRefs[k]).map((k) => [k, c.lastRefs[k]!]));
    n.lastRefs = Object.assign(keep, ...avail.map((o) => o.refs));
    n.lastObjects = avail.map((o) => ({ id: o.id, type: o.type, title: o.title }));
    return n;
  }
}

/* ================================================================================================
   CLARIFICATION ENGINE — the model recommends, policy decides
   ================================================================================================ */
/** does a name the model gave for a scope actually name that scope (its id, its name, a distinctive word of its name,
 *  or a governed alias)? "South Valley" does not name MDH; "the Holdco", "MDH" and "Meridian DC Holdco" do. */
export function scopeNamedBy(name: string, scopeId: string, data: FinancialDataService): boolean {
  const n = ` ${name.toLowerCase().replace(/[^a-z0-9 -]/g, ' ')} `, sc = data.scope(scopeId);
  if (!sc) return false;
  if (scopeId === 'GROUP') return /\b(group|consolidat\w*|portfolio|all entities|enterprise|global|corporate|everything|total)\b/.test(n) || n.includes(sc.name.toLowerCase());
  if (n.includes(` ${scopeId.toLowerCase()} `) || n.includes(scopeId.toLowerCase().replace('-', ''))) return true;
  if (ENTITY_WORDS.some(([re, id]) => id === scopeId && re.test(n))) return true;
  const generic = new Set(['meridian', 'llc', 'ltd', 'inc', 'gmbh', 'pte', 'the', 'global', 'portfolio']);
  return sc.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !generic.has(w)).some((w) => n.includes(` ${w} `));
}
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
  ['semantic', /\bwho\b|responsib|\bowns?\b|\breviewers?\b|needs? to review|subsidiar|hierarch|ownership|\btrace\b|reports? (that )?(use|using)|supports? (this|the) balance|\bbudget\b|\bforecast\b|\bscenario\b|(tb|trial balance) for|what is|which .*\b(still|open)\b|\bfy ?\d{2}\b|last quarter|\bytd\b/i],
  ['build', /\bbuild\b|report|excel|workbook|spreadsheet|\badd (entity|project|vendor|column|department|dimension|source)|\bremove\b|\bfirst\b|only include|sort by|\btabs?\b|compare .*fy|\bsave it\b|\bdownload\b|\bgenerate\b|\bexport\b|governed gl|gl package|ties? back|tie.?out|look like|\bpreview\b/i],
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
    /* a workbook in the conversation keeps its tools in reach: "put the TB on another tab" is a change to it */
    if (ctx.lastRefs['artifactId'] || ctx.lastRefs['excelDraftId']) { d.add('build'); d.add('action'); }
    if (ctx.lastRefs['pbcRequestId']) { d.add('audit'); d.add('build'); d.add('action'); }
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
        /* amounts are USD millions; a model that passed dollars ("5000000") is repaired, never trusted blindly */
        if ((p.name === 'minAbsAmount' || p.name === 'minAbsChange') && Number(v) >= 1000) { out.repairs.push(`${s.tool}.${p.name} ${v} read as dollars → ${Number(v) / 1e6}M`); v = String(Number(v) / 1e6); }
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
  const pb = pbcPlan(text, ctx);
  if (pb) return pb;
  const art = artifactPlan(text, ctx);
  if (art) return art;
  const sem = semanticPlan(text, ctx);
  if (sem) return sem;
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
  if (readsCtx && /\bexplanation\b/.test(t) && !/reconcil|\brec\b/.test(t) && (acctFromText || ctx.focus.value?.kind === 'account')) return [S('getFluxExplanation', 'The governed Flux explanation', { account: acctFromText ?? '$ctx.account', period: ctx.period.value })];
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
  if (/block|readiness/.test(t) && /close/.test(t)) return [S('getCloseReadiness', 'Measuring close readiness'), S('getCloseBlockers', 'Ranking what blocks the close')];
  /* why an account moved: its movement, what drove it, and the bridge that proves it */
  if (/\bwhy\b|what drove|what caused|\bexplain\b/.test(t) && !/reconcil|flux|close/.test(t) && (acctFromText || ctx.focus.value?.kind === 'account')) {
    const acc = acctFromText ?? '$ctx.account';
    return [S('getAccountAnalysis', 'Measuring the movement', { account: acc }), S('getDriverAnalysis', 'Finding what drove it by project', { dimension: 'project', account: acc }), S('getVarianceBridge', 'Building the proof bridge', { account: acc })];
  }
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
  if (/changed the most|largest (movement|change)|biggest (movement|change)|moved the most/.test(t)) return [S('getLargestFinancialMovements', 'Ranking the largest movements')];
  if (dimKey && (ctx.focus.value?.kind === 'account' || acctFromText)) return [S('getDriverAnalysis', `Drivers by ${dimKey}`, { dimension: dimKey, account: acctFromText ?? '$ctx.account' })];
  if (/proof|prove|bridge/.test(t)) return [S('getVarianceBridge', 'Proof bridge', { account: acctFromText ?? '$ctx.account' })];
  if (/\bgl\b|general ledger|transactions|journal lines/.test(t) && (acctFromText || ctx.focus.value?.kind === 'account' || ctx.lastRefs['largestAccount'])) return [S('getAccountActivity', 'The GL behind it', { account: acctFromText ?? '$ctx.account' })];
  if (/compare|last year|prior year/.test(t) && vendor) return [S('comparePeriods', 'Vendor comparison', { vendor })];
  if (vendor && /spend|activity|cost/.test(t)) return [S('getTrend', `Reading ${vendor} activity by month`, { vendor, periodStart: range?.start ?? ctx.period.value, periodEnd: range?.end ?? ctx.period.value })];
  if (/cash flow/.test(t)) return [S('getCashFlowStatement', 'Cash flow')];
  if (/balance sheet/.test(t)) return [S('getBalanceSheet', 'Balance sheet')];
  if (I.requestedObject.type === 'INCOME_STATEMENT') return [S('getIncomeStatement', 'Income statement', { periodStart: range?.start ?? ctx.period.value, periodEnd: range?.end ?? ctx.period.value, scope: ctx.scope.value })];
  if (I.requestedObject.type === 'TRIAL_BALANCE') return [ctx.scope.value !== 'GROUP' ? S('getTrialBalance', 'Entity trial balance', { entity: ctx.scope.value }) : S('getTrialBalanceByEntity', 'Trial balance by entity')];
  if (/financials?|results/.test(t) || I.requestedObject.type === 'FINANCIAL_STATEMENT') return [S('getFinancialSummary', 'Reading the governed financial summary')];
  if (acctFromText) return [S('getAccountAnalysis', 'Account analysis', { account: acctFromText })];
  return bareObjectPlan(text, ctx) ?? [];
}

/* ================================================================================================
   ARTIFACT ROUTING (4A) — a request for a deliverable, or a change to the workbook in the conversation, goes to the
   Artifact tools. Deterministic, so the same words always build or change the same definition.
   ================================================================================================ */
export const ARTIFACT_TOOLS = new Set(['buildExcelArtifact', 'modifyExcelArtifact', 'previewExcelArtifact', 'proposeGenerateExcelArtifact', 'proposeRefreshExcelArtifact', 'deriveExcelArtifact', 'proposeSaveExcelArtifact', 'proposeArchiveExcelArtifact']);
/** artifact routes the engine decides even over a model plan that chose another artifact tool */
const ARTIFACT_FORCED = new Set(['deriveExcelArtifact', 'proposeSaveExcelArtifact', 'proposeArchiveExcelArtifact']);
export function artifactPlan(text: string, ctx: SessionContext): PlanStep[] | null {
  const t = text.toLowerCase();
  const S = (tool: string, purpose: string, args: Record<string, string | undefined> = {}): PlanStep => ({ tool, purpose, dependsOn: [], args: Object.entries(args).filter(([, v]) => v !== undefined).map(([name, value]) => ({ name, value: value! })) });
  const has = !!(ctx.lastRefs['artifactId'] || (ctx.lastRefs['excelDraftId'] && ctx.lastRefs['excelDraftId'] !== 'DRAFT'));
  const verb = /\b(give me|build|create|pull|get me|prepare|compile|assemble|make|generate|put together)\b/.test(t);
  /* 4B: a named package type is a deliverable request when it is asked for, not when it is merely mentioned */
  const pkg = detectType(t);
  const build = /\bgoverned gl\b|\bgl package\b|\baudit gl\b|\b(excel|xlsx|workbook|spreadsheet)\b/.test(t) || (verb && /\b(gl|general ledger|transactions|ledger)\b/.test(t) && /\bfy\s?'?\d{2}|\btabs?\b|\bsheets?\b|\bexcel\b|\bworkbook\b|\bpackage\b/.test(t))
    || (!!pkg && (verb || /\bpackage\b/.test(t)));
  /* 4B: reuse — "create July using the June package", "duplicate this for MER-DE", "do the same for Vertiv" */
  const derive = /\b(using|based on|from|like)\b.{0,30}\b(package|workbook)\b|\bduplicate\b|\bsame (package|thing|workbook) for\b|\bdo the same for\b|\breuse\b/.test(t) && !/\bfrom (the )?(gl|ledger)\b/.test(t);
  if (derive && (has || /\b(package|workbook)\b/.test(t))) return [S('deriveExcelArtifact', 'A new package from an existing one')];
  const fresh = build && /\b(give me|build|create|pull|get me|prepare|compile|assemble|new)\b/.test(t) && !/\b(it|this|the workbook|the package)\b.*\b(add|remove|put)\b/.test(t);
  if (has && !fresh) {
    if (/\b(download|generate|export)\b|\bgive me the (file|excel|xlsx|csv)\b|\bin (excel|csv)\b.*\bnow\b/.test(t)) return [S('proposeGenerateExcelArtifact', 'Generate the file', { format: /\bcsv\b/.test(t) ? 'csv' : undefined })];
    if (/\brefresh\b/.test(t)) return [S('proposeRefreshExcelArtifact', 'Refresh the workbook')];
    /* every change is already a kept version; "save it" marks the package SAVED (a confirmed lifecycle action) */
    if (/\bsave (it|the workbook|the excel|this|the package|the draft|as (a )?draft)\b|\bsave draft\b|\brestore (it|the package|from archive)\b/.test(t)) return [S('proposeSaveExcelArtifact', 'Save the package')];
    if (/\barchive (it|the workbook|the package|this)\b/.test(t)) return [S('proposeArchiveExcelArtifact', 'Archive the package')];
    const sec = t.match(/\bshow (?:me )?(?:the )?(.+?) (?:tab|sheet|section)\b/);
    if (sec && !/\b(add|remove|put)\b/.test(t)) return [S('previewExcelArtifact', 'Preview one section', { section: sec[1] })];
    if (/\bwhat it (will )?look|\bpreview\b|\bshow me (the )?(workbook|it|what|package)\b|\blook like\b/.test(t)) return [S('previewExcelArtifact', 'Preview the workbook')];
    if (/\b(add|remove|drop|put|move|sort|only|include|exclude|tie|ties|tied|tab|tabs|rename|call it|delete|hide|largest|smallest|over \$|change|switch|leave out|first|last)\b/.test(t)) return [S('modifyExcelArtifact', 'Refine the workbook', { instruction: text })];
  }
  if (build) return [S('buildExcelArtifact', 'Build the workbook')];
  return null;
}

/* ================================================================================================
   5A — PBC ROUTING. Deterministic: an audit request, a question about its gaps or GL, a population change, a
   generation of its completed selections, refresh and delivery. Package tabs / columns fall through to artifactPlan.
   ================================================================================================ */
/** does the request NAME an existing PBC request ("PBC #27", "PBC-5A-001")? Bound by the orchestrator to the audit service */
let pbcNamed: (t: string) => boolean = () => false;
const S0 = (tool: string, purpose: string): PlanStep => ({ tool, purpose, dependsOn: [], args: [] });
export const bindPbcLookup = (f: (t: string) => boolean) => { pbcNamed = f; };
export function pbcPlan(text: string, ctx: SessionContext): PlanStep[] | null {
  const t = ` ${text.toLowerCase()} `;
  /* a request the words name by its number is opened — never rebuilt as a new request */
  if (pbcNamed(text) && !/\b(refresh|deliver|generate|download|export|waive|link)\b/.test(t)) return [S0('getPBCRequest', 'The PBC workspace for the request named')];
  const S = (tool: string, purpose: string, args: Record<string, string | undefined> = {}, dependsOn: number[] = []): PlanStep => ({ tool, purpose, dependsOn, args: Object.entries(args).filter(([, v]) => v !== undefined).map(([name, value]) => ({ name, value: value! })) });
  const has = !!ctx.lastRefs['pbcRequestId'];
  const ev = /\binvoices?\b|\bpos\b|\bpurchase orders?\b|\bapprovals?\b|\bcontracts?\b|\breceipts?\b|\bchange orders?\b/.test(t);
  const support = ev || /\bsupport\b|\bevidence\b|\bbacking\b|\bdocumentation\b/.test(t);
  const verb = /\b(give me|build|create|pull|get me|prepare|compile|assemble|provide|need|want|send me|gather)\b/.test(t);
  const pbcWord = /\bpbc\b|\bauditors?\b|\baudit request\b|\bprepared[- ]by[- ]client\b/.test(t);
  /* "are we audit-ready for CIP?" — a readiness question, not the 4B audit-ready GL extract */
  if (/\baudit[- ]ready\b|\baudit readiness\b/.test(t) && !/\b(extract|gl|package|workbook|excel|general ledger)\b/.test(t)) return [S('getAuditReadiness', 'Audit readiness')];
  if (has) {
    const pkg = /\b(tab|tabs|sheet|column|columns|source vendor|governed vendor|tie[- ]?out|trial balance|\btb\b|reconciliations? (tab|sheet)|flux explanations?|include the related|add the flux|remove completed|completed selections)\b/.test(t) && !/\b(generate|download|export)\b/.test(t);
    if (/\b(generate|download|export)\b/.test(t)) {
      if (/\b(completed|fully supported|complete|open|all) selections?\b|\bselections? (that are )?(completed|complete|fully supported)\b/.test(t)) return [S('modifyExcelArtifact', 'Choose the selections the package carries', { instruction: text }), S('proposeGenerateExcelArtifact', 'Generate the package', { format: /\bcsv\b/.test(t) ? 'csv' : undefined }, [0])];
      return null;
    }
    if (/\brefresh\b/.test(t) && /\b(pbc|request|population|selections?)\b/.test(t)) return [S('proposeRefreshPBCRequest', 'Refresh the PBC request')];
    if (/\bmark (it|this|the (package|request|pbc)) (as )?delivered\b|\bdeliver (it|the package|this)\b|\b(sent|delivered) (it |this |the package )?to the auditors?\b/.test(t)) return [S('proposeDeliverPBCPackage', 'Mark the package delivered')];
    const selNo = (t.match(/\bselection\s*#?\s*(\d+)\b/) ?? [])[1];
    if (/\bwaive\b/.test(t) && selNo) return [S('proposeResolveSupportGap', 'Waive a support gap', { selection: selNo, mode: 'WAIVE', note: text })];
    const ref = (text.match(/\b((?:INV|PO|APR|CTR|CO)-[A-Z0-9-]+)\b/i) ?? [])[1];
    if (/\blink\b|\battach\b/.test(t) && selNo && ref) return [S('proposeResolveSupportGap', 'Link a reference to a support gap', { selection: selNo, reference: ref, mode: 'LINK' })];
    const key = (text.match(/\b(JE-\d+[:#-]?\d*)\b/i) ?? [])[1];
    if (selNo && key && /\b(is|to|match|use)\b/.test(t)) return [S('proposeResolveAuditSelection', 'Match the selection', { selection: selNo, transaction: key, note: text })];
    if (!pkg && (/\bmissing\b|\bwhat'?s missing\b|\bgaps?\b|\bunsupported\b|\bwithout (support|evidence|an? invoices?|approvals?)\b|\bnot supported\b/.test(t)) && !/\b(add|include)\b/.test(t)) return [S('getPBCSupportGaps', 'What is missing')];
    if (/\b(gl|general ledger|ledger|journal lines|transactions)\b/.test(t) && /\bselections?\b|\bthose\b|\bthese\b|\bthem\b/.test(t) && !/\b(add|include|tab)\b/.test(t)) return [S('getPBCSelectionGL', 'The GL behind the selections')];
    if (!pkg && /\bonly include\b|\bonly (items|lines|transactions)\b|\bexclude (items|lines|transactions|anything)\b|\b(items|lines) (under|below|over|above)\b|\bonly (for )?(mdh|mer-[a-z]{2}|reit|south valley|sv-ph2)\b|\bchange (it|the period|the window) to\b|\balso require\b/.test(t)) return [S('modifyPBCRequest', 'Change the request’s population', { instruction: text })];
    if (/\b(this|the|that) (pbc|request)\b/.test(t) && (support || /\b(show|open|where|status|pull)\b/.test(t)) && !pkg) return [S('getPBCRequest', 'The PBC workspace')];
  }
  /* a new request: "give me FY26 CIP additions over $1M with invoices, POs, approvals and reconciliation support" */
  if (verb && support && (/\b(additions|disposals|settlements|capex|capital (additions|spend))\b/.test(t) || pbcWord) && !/\b(package|workbook|excel|gl extract)\b/.test(t)) return [S('buildPBCRequest', 'Interpret the request and build its governed population')];
  if (pbcWord && /\b(show|list|open|what|where|which)\b/.test(t) && /\bpbc|requests?\b/.test(t)) return [S('getPBCRequest', 'PBC requests')];
  return null;
}
export const PBC_ROUTED = PBC_TOOL_IDS;

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
    else if (o.type === 'ExcelWorkbookPreview' && f('workbook')) {
      const ch = o.facts.find((x) => /^change\d/.test(x.key)), ver = f('artifactVersion')?.display.match(/ v(\d+)/)?.[1];
      out.push({ text: `${ch ? `${ch.display.replace(/\.$/, '')}. ` : ''}${f('workbook')!.display}${ver ? ` (v${ver})` : ''} has ${f('sheets') ? `tabs ${f('sheets')!.display}` : 'its tabs'}${f('glRows') ? ` over ${f('glRows')!.display} GL lines` : ''}.`, objectIds: [o.id], factKeys: ['workbook', 'sheets', 'glRows'].map((k) => `${o.id}.${k}`) });
    } else if ((o.type === 'PBCRequest' || o.type === 'PBCSupportGaps') && f('pbcNumber')) {
      const gaps = o.facts.filter((x) => /^gap\d/.test(x.key)).slice(0, 3).map((x) => x.display);
      out.push({ text: o.type === 'PBCSupportGaps'
        ? `${f('openGaps')?.display ?? 'No'} open gaps${gaps.length ? `: ${gaps.join(', ')}` : ''}.`
        : `${f('populationRows')?.display ?? '0'} selections totalling ${f('populationTotal')?.display ?? '—'}; support coverage ${f('coverage')?.display ?? '—'}${f('openGaps') ? `; ${f('openGaps')!.display} open gaps` : ''}.`, objectIds: [o.id], factKeys: ['populationRows', 'populationTotal', 'coverage', 'openGaps'].map((k) => `${o.id}.${k}`) });
    }
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
  calls: { stage: string; status: string; code: string | null; detail: string | null; providerRequestId: string | null; latencyMs: number; usage: Usage | null; route: string | null; model: string | null }[];
  contextBefore: unknown; candidatesSupplied: number; governedPeriods: string[];
  interpretation: Interpretation | null; interpretationSource: 'reasoning' | 'deterministic' | 'clarification' | 'conversation' | null;
  resolution: Resolved | null;
  classification: string | null;
  clarification: (ClarDecision & { asked: string | null; options: string[] }) | null;
  toolsExposed: { domains: string[]; tools: string[] };
  plan: { source: 'deterministic' | 'reasoning' | 'conversation' | null; proposed: PlanStep[]; validation: PlanValidation | null };
  toolsExecuted: { tool: string; args: ToolArgs; status: 'COMPLETED' | 'FAILED' | 'REFUSED' | 'SKIPPED'; objectId: string | null; latencyMs: number; warnings: string[]; error: string | null; result: { type: string; status: string; facts: number; populationId: string | null; rows: number } | null }[];
  objects: { id: string; type: string; title: string; status: string; facts: number }[];
  narrative: { source: 'reasoning' | 'deterministic' | null; accepted: number; rejected: { text: string; why: string }[] };
  contextAfter: unknown; tokens: { input: number; output: number; cacheRead: number };
  limitsReached: string[]; fallbacks: string[]; warnings: string[]; state: string | null; errors: string[];
  proposals: { id: string; type: string; riskLevel: string; status: string; validationStatus: string; target: string | null; errors: string[]; warnings: string[]; dependsOn: string[] }[];
  /** Phase 6: which path answered — a capability SHORTCUT, the conversation (FOLLOW_UP), a DELIVERABLE route, the FAST
   *  model with Korvyn's planner, or the DEEP planner — the rule that decided it, what kind of turn it was, and where the time went */
  route: 'SHORTCUT' | 'FOLLOW_UP' | 'DELIVERABLE' | 'FAST' | 'DEEP' | 'CLARIFICATION' | 'AGENT' | 'CONVERSATION' | 'CAPABILITY_GAP' | null;
  /** the conversational front door's decision (development observability) */
  conversation: { input: string; conversationIntent: string | null; requiresTool: boolean | null; selectedRoute: string; selectedModel: string | null; selectedTool: string | null; fallbackReason: string | null } | null; shortcut: string | null; kind: TurnKind | null;
  timings: { firstStatusMs: number | null; interpretMs: number; planMs: number; toolsMs: number; firstObjectMs: number | null; narrateMs: number };
}

/* ================================================================================================
   THE ORCHESTRATOR
   ================================================================================================ */
export type TurnState = 'ANSWER' | 'CLARIFICATION_REQUIRED' | 'UNAVAILABLE' | 'ERROR' | 'CANCELLED';
/** streaming (Phase 6): status lines, the structured objects as soon as they exist, then the final response */
export interface TurnEvent { type: 'status' | 'object'; text?: string; response?: Record<string, unknown> }
export interface TurnHooks { emit?: (e: TurnEvent) => void; signal?: AbortSignal }
/** objects that ARE their own answer (a workbook preview, a PBC workspace): no narrative call is spent on them */
const STRUCTURAL = new Set(['ExcelWorkbookPreview', 'PBCRequest', 'PBCSupportGaps', 'AgentRun']);
export interface TurnInput { sessionId?: unknown; request?: unknown; clarification?: unknown; /** the page the browser has open — display context only, never a financial fact */ view?: unknown }
export interface TurnResponse {
  sessionId: string; traceId: string; state: TurnState; mode: 'reasoning' | 'deterministic'; latencyMs: number;
  notes: string[];
  clarification: { pendingId: string; field: string; question: string; options: { id: string; label: string }[] } | null;
  objects: FinancialObject[];
  narrative: { text: string; objectIds: string[] }[];
  context: { object: Field<string | null>; period: Field<string>; scope: Field<string>; currency: Field<string>; basis: Field<string>; focus: Field<string | null>; populationId: Field<string | null> };
  /** proposals prepared this turn — nothing in them has been executed */
  actions?: { planId: string; proposals: ActionProposal[] } | null;
  /** Phase 6 */
  kind?: TurnKind | null; route?: string | null; suggestions?: string[]; contextLine?: string; contextFields?: { field: string; label: string; value: string; confidence: string }[]; title?: string;
  /** a conversational answer that needed no governed tool — conversation is a valid output */
  reply?: string;
}
interface Pending { id: string; request: string; interpretation: Interpretation; field: string; options: { id: string; label: string }[]; loops: number; traceId: string; requests?: Record<string, string> }
interface Session {
  ctx: SessionContext; pending: Pending | null; touched: number;
  /** the authenticated user this conversation belongs to; another user never inherits it */
  ownerId: string;
  drafts: ToolSession['drafts'];
  /** the last ANALYSIS answer (proposal turns never overwrite it: "use this explanation" means the analysis) */
  lastNarrative: string[]; lastObjects: FinancialObject[]; lastToolCalls: { tool: string; args: ToolArgs }[];
  investigation: { id: string; objective: string; findings: string[]; objects: { id: string; type: string; title: string }[]; populationIds: string[] };
  /** the turn still running (a newer one supersedes it) and the context it started from */
  inflight: { ac: AbortController; ctxBefore: SessionContext } | null;
  titled: boolean;
  /** Phase 7: the agent run the last answer was about — a short instruction ("Only South Valley.") steers it */
  lastRunId?: string | null;
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
  readonly artifacts: ArtifactEngine;
  /** §18 safe caching: an interpretation is reused only for the same words, the same context, the same actor and the same
   *  data version; a narrative only for the identical governed facts. Neither ever holds a figure of its own. */
  private readonly interpCache = new Map<string, Interpretation>();
  private readonly narrCache = new Map<string, { text: string; objectIds: string[]; factKeys: string[] }[]>();

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
    /* every ERP posting that has synced is part of the governed population again (the data version moves with it) */
    replaySourceFeed(this.gl);
    this.artifacts = new ArtifactEngine(this.data, this.gl, this.controls);
    /* 5A: the audit / PBC service over the same ledger, controls and tie-out — a PBC package's sections read it */
    this.artifacts.pbc = new AuditService(this.data, this.gl, this.controls, this.artifacts.tie);
    { const A = this.artifacts.pbc; bindPbcLookup((t) => { const m = t.toLowerCase().match(/\bpbc[\s#-]*(?:no\.?\s*)?([a-z0-9-]*\d[a-z0-9-]*)\b/); if (!m) return false; const w = m[1]!.toUpperCase(); return A.list().some((r) => r.id.toUpperCase() === w || r.pbcNumber.toUpperCase() === w || r.pbcNumber.toUpperCase().endsWith(`-${w}`) || r.pbcNumber.replace(/\D/g, '') === w.replace(/\D/g, '')); }); }
    /* the actor is resolved at every proposal AND every execution from the request's authenticated context */
    this.actions = new ActionEngine((a) => ({ gl: this.gl, controls: this.controls, actor: a ?? this.actorOf(), artifacts: this.artifacts, pbc: this.artifacts.pbc ?? undefined }));
    /* Phase 8A: the Financial Graph over these services, and the assembler that hands the model its neighbourhood */
    this.semantic = new ContextAssembler(financialGraph({ data: this.data, gl: this.gl, controls: this.controls, artifacts: this.artifacts }));
    /* Phase 7: the agent runtime — every step it takes comes back through agentValidate / agentExecute / decide */
    this.agents = new AgentRuntime(this);
  }
  readonly semantic: ContextAssembler;
  /** the model's context: the session's governed values plus the request's permitted semantic neighbourhood */
  modelContext(ctx: SessionContext, actor: Actor, request: string) {
    let semantic: unknown = null;
    try { semantic = this.semantic.forModel(actor, request, ctx); } catch { semantic = null; }
    return { ...this.context.forModel(ctx), semantic };
  }
  readonly agents: AgentRuntime;

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
      investigation: { id, objective: inv.objective, findings: inv.findings.slice(), objects: inv.objectRefs.map((o) => ({ id: o.ref, type: o.type, title: o.title })), populationIds: inv.populationRefs.slice() }, inflight: null, titled: true });
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

  async turn(inputArg: TurnInput, actorArg?: Actor, hooks: TurnHooks = {}): Promise<TurnResponse> {
    const t0 = Date.now();
    const actor = actorArg ?? this.actorOf();
    const sessionId = typeof inputArg.sessionId === 'string' && SID.test(inputArg.sessionId) ? inputArg.sessionId : randomUUID();
    let session = this.sessions.get(sessionId);
    if (session && session.ownerId !== actor.id) { session = undefined; }
    if (!session) { session = { ctx: this.context.initial(actor), pending: null, touched: t0, ownerId: actor.id, drafts: { report: null, excel: null }, lastNarrative: [], lastObjects: [], lastToolCalls: [], investigation: { id: '', objective: '', findings: [], objects: [], populationIds: [] }, inflight: null, titled: false }; this.sessions.set(sessionId, session); }
    /* a conversational question ("Which one?") answers with a REQUEST: the chosen option is asked as if typed */
    let input = inputArg;
    if (session.pending?.requests && inputArg.clarification) {
      const opt = this.matchClarification(session, inputArg.clarification, '');
      if (opt && session.pending.requests[opt]) { input = { sessionId, request: session.pending.requests[opt] }; session.pending = null; }
    }
    if (!session.investigation.objective && typeof input.request === 'string') session.investigation.objective = input.request.trim().slice(0, 300);
    session.touched = t0;
    /* §32: a newer request supersedes one still running in this conversation — the older one commits nothing */
    if (session.inflight) { session.inflight.ac.abort(); session.ctx = session.inflight.ctxBefore; }
    const ac = new AbortController();
    if (hooks.signal?.aborted) ac.abort(); else hooks.signal?.addEventListener('abort', () => ac.abort(), { once: true });
    const inflight = { ac, ctxBefore: JSON.parse(JSON.stringify(session.ctx)) as SessionContext };
    session.inflight = inflight;
    const cancelled = () => ac.signal.aborted;
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
      route: null, shortcut: null, kind: null, conversation: null, timings: { firstStatusMs: null, interpretMs: 0, planMs: 0, toolsMs: 0, firstObjectMs: null, narrateMs: 0 },
    };
    const notes: string[] = [];
    const note = (s: string) => { if (s && !notes.includes(s)) notes.push(s); };
    const spend = (u: Usage | null) => { if (u) { tr.tokens.input += u.inputTokens; tr.tokens.output += u.outputTokens; tr.tokens.cacheRead += u.cacheReadTokens; } };
    const overBudget = () => { const b = tr.tokens.input + tr.tokens.output > LIMITS.tokenBudget, w = Date.now() - t0 > LIMITS.wallClockMs;
      if (b && !tr.limitsReached.includes('tokenBudget')) tr.limitsReached.push('tokenBudget'); if (w && !tr.limitsReached.includes('wallClock')) tr.limitsReached.push('wallClock'); return b || w; };
    /* §13/§29: real, plan-driven status — what Korvyn is doing now, never a canned spinner line */
    const status = (text: string) => { if (tr.timings.firstStatusMs === null) tr.timings.firstStatusMs = Date.now() - t0; hooks.emit?.({ type: 'status', text }); };
    let suggestions: string[] = [];
    let kind: TurnKind | null = null;

    const finish = (state: TurnState, extra: Partial<TurnResponse> = {}): TurnResponse => {
      if (session!.inflight === inflight) session!.inflight = null;
      tr.state = state; tr.endedAt = new Date().toISOString(); tr.latencyMs = Date.now() - t0; tr.contextAfter = this.context.forModel(session!.ctx); tr.kind = kind;
      this.traces.push(tr); if (this.traces.length > 200) this.traces.shift();
      if (tr.conversation) console.log(`[sloane:route] input=${JSON.stringify(tr.conversation.input.slice(0, 60))} intent=${tr.conversation.conversationIntent ?? '-'} requiresTool=${tr.conversation.requiresTool} route=${tr.conversation.selectedRoute} model=${tr.conversation.selectedModel ?? '-'} tool=${tr.conversation.selectedTool ?? '-'} fallback=${tr.conversation.fallbackReason ?? 'none'}`);
      console.log(`[sloane] ${tr.traceId} ${tr.route ?? '-'} ${state} ${tr.latencyMs}ms calls=${tr.calls.map((c) => `${c.stage}@${c.route ?? '?'}:${c.latencyMs}`).join(',') || '-'} tools=${tr.toolsExecuted.map((x) => `${x.tool}:${x.status}`).join(',') || '-'} in=${tr.tokens.input} out=${tr.tokens.output}`);
      const c = session!.ctx, cv = contextView(c, this.data);
      return {
        sessionId, traceId: tr.traceId, state, mode: this.mode, latencyMs: tr.latencyMs, notes, clarification: null, objects: [], narrative: [],
        context: { object: { value: c.object.value.type, source: c.object.source }, period: c.period, scope: { value: this.data.scope(c.scope.value)?.name ?? c.scope.value, source: c.scope.source }, currency: c.currency, basis: c.basis,
          focus: { value: c.focus.value?.name ?? null, source: c.focus.source }, populationId: c.populationId },
        kind, route: tr.route, suggestions, contextLine: cv.line, contextFields: cv.fields,
        ...extra,
      };
    };
    const cancel = (): TurnResponse => { tr.fallbacks.push('cancelled — superseded by a newer request'); if (session!.inflight === inflight) session!.ctx = inflight.ctxBefore; return finish('CANCELLED', { notes: ['Superseded by a newer request.'] }); };

    try {
      /* ---- 1. interpretation: an answer to a pending question, the conversation, a deliverable, or the model ---- */
      let I: Interpretation;
      let raw = request;
      let loops = 0;
      let fast: FastPath | null = null;
      let deliverable: PlanStep[] | null = null;
      const answer = this.matchClarification(session, input.clarification, request);
      if (answer) {
        const Pd = session.pending!;
        I = JSON.parse(JSON.stringify(Pd.interpretation));
        raw = Pd.request; loops = Pd.loops + 1; tr.request = Pd.request; tr.resumedFromTrace = Pd.traceId;
        if (answer.startsWith('scope:')) I.scope = { name: this.data.scope(answer.slice(6))!.name, candidateId: answer };
        if (answer.startsWith('period:')) I.period = answer.slice(7);
        I.needsClarification = false; I.clarificationFields = [];
        tr.interpretationSource = 'clarification'; tr.route = 'CLARIFICATION';
        session.pending = null;
        status('Resuming with your answer');
      } else {
        if (input.clarification) return finish('UNAVAILABLE', { notes: ['That question is no longer pending. Ask again and Sloane will re-interpret the request.'] });
        if (!request) return finish('ERROR', { notes: ['request is required'] });
        session.pending = null;
        /* Phase 7: a goal starts a governed agent run; a short instruction steers the run the conversation is on */
        const ag = await this.agentTurn(session, sessionId, actor, request, status, ac.signal);
        if (ag) {
          tr.route = 'AGENT'; tr.shortcut = ag.shortcut; kind = 'ANSWER';
          ag.notes.forEach(note);
          return finish('ANSWER', { objects: [ag.object], narrative: ag.narrative.map((t) => ({ text: t, objectIds: [ag.object.id] })), ...(ag.title ? { title: ag.title } : {}) });
        }
        session.lastRunId = null;
        beginTurn(session.ctx, request);
        const deps: ConvDeps = { gl: this.gl, data: this.data, controls: this.controls, visible: visibleOf(actor) };
        const lower = request.toLowerCase();
        const deliver = () => pbcPlan(request, session!.ctx) ?? artifactPlan(request, session!.ctx);
        /* a deliverable in the conversation owns words about itself ("add TB", "put project before vendor"); otherwise a
           follow-up modifies the analysis on screen first */
        const aboutDeliverable = conv(session.ctx).lastKind === 'ARTIFACT' || /\b(workbook|tabs?|sheets?|columns?|package|excel|xlsx|csv|pbc|selections?|download|generate)\b/.test(lower);
        /* a request ABOUT the workbook that asks for something no artifact tool does (formatting a header, emailing it)
           is understood from its words; it must not be routed to a workbook edit that would silently do something else */
        if (aboutDeliverable) {
          const dg = capabilityGap(request, session.ctx);
          if (dg) {
            tr.route = 'CAPABILITY_GAP'; tr.shortcut = `capability gap: ${dg.reason}`; kind = 'ANSWER'; suggestions = dg.suggestions; note(dg.message);
            tr.conversation = { input: request, conversationIntent: 'ACTION_REQUEST', requiresTool: true, selectedRoute: 'CAPABILITY_GAP', selectedModel: null, selectedTool: null, fallbackReason: `no registered capability: ${dg.reason}` };
            return finish('UNAVAILABLE');
          }
        }
        deliverable = aboutDeliverable ? deliver() : null;
        const cr = deliverable ? null : resolveConversational(request, session.ctx, deps);
        if (!deliverable && !cr) deliverable = deliver();
        if (cr && 'gap' in cr) {
          cr.gap.mutate?.(session.ctx);
          tr.route = 'FOLLOW_UP'; tr.shortcut = `conversation: ${cr.gap.reason}`; kind = 'ANSWER'; suggestions = cr.gap.suggestions; note(cr.gap.message);
          return finish('UNAVAILABLE');
        }
        if (cr && 'clarify' in cr) {
          const opts = cr.clarify.options.map((o) => ({ id: o.id, label: o.label }));
          session.pending = { id: `CLR-${randomUUID().slice(0, 8)}`, request, interpretation: interp(), field: 'object', options: opts, loops: 0, traceId: tr.traceId, requests: Object.fromEntries(cr.clarify.options.map((o) => [o.id, o.request])) };
          tr.route = 'FOLLOW_UP'; tr.shortcut = `conversation: ${cr.clarify.reason}`; kind = 'CLARIFICATION';
          return finish('CLARIFICATION_REQUIRED', { clarification: { pendingId: session.pending.id, field: 'object', question: cr.clarify.question, options: opts } });
        }
        if (cr && 'fast' in cr) {
          fast = cr.fast; I = fast.interpretation; tr.interpretationSource = 'conversation'; tr.route = 'FOLLOW_UP'; tr.shortcut = `conversation: ${fast.reason}`;
          status(fast.steps[0]!.purpose);
        } else if (deliverable) {
          I = deterministicInterpret(request, this.data, session.ctx, this.controls.allRecDefs().map((d) => ({ id: d.id, name: d.name })));
          tr.interpretationSource = 'deterministic'; tr.route = 'DELIVERABLE'; tr.shortcut = `deliverable: ${deliverable.map((x) => x.tool).join(', ')}`;
          status(deliverable[0]!.purpose);
        } else {
          /* ---- THE CONVERSATIONAL FRONT DOOR ----------------------------------------------------------------
             Every free-text turn that is not an explicit follow-up or deliverable command is first UNDERSTOOD: the
             conversational model classifies it and decides whether a governed tool is needed. No tool is a valid
             outcome — conversation is answered as conversation. Interpretation for tools runs in parallel, so a
             financial question pays no extra latency. A capability gap is said only when the operation is understood,
             needs execution, and nothing registered can perform it. */
          const view = typeof input.view === 'string' ? input.view.slice(0, 160) : null;
          const cctx = this.conversationContext(session, actor, view, request);
          const say = (reply: string, intent: string, model: string | null, why: string | null) => {
            tr.route = 'CONVERSATION'; kind = 'CONVERSATION';
            tr.conversation = { input: request, conversationIntent: intent, requiresTool: false, selectedRoute: 'CONVERSATIONAL_RESPONSE', selectedModel: model, selectedTool: null, fallbackReason: why };
            return finish('ANSWER', { reply });
          };
          const gapOut = (intent: string, model: string | null, op: string | null) => {
            const g = capabilityGap(request, session!.ctx);
            tr.route = 'CAPABILITY_GAP'; kind = 'ANSWER';
            tr.conversation = { input: request, conversationIntent: intent, requiresTool: true, selectedRoute: 'CAPABILITY_GAP', selectedModel: model, selectedTool: null, fallbackReason: g ? `no registered capability: ${g.reason}` : `no registered capability: ${op}` };
            if (g) { suggestions = g.suggestions; note(g.message); }
            else note(`Sloane can’t ${op ?? 'do that'} from Korvyn. It can prepare the governed work for you to send or act on yourself.`);
            return finish('UNAVAILABLE');
          };
          let conversation: Conversation | null = null, convModel: string | null = null, convWhy: string | null = null;
          const iac = new AbortController(); ac.signal.addEventListener('abort', () => iac.abort(), { once: true });
          const convP = this.mode === 'reasoning' ? this.adapter.converse({ request, context: cctx }, { route: 'FAST', signal: ac.signal }) : null;
          status('Reading the request');
          const cands = this.context.candidates(request, actor);
          tr.candidatesSupplied = cands.length;
          const forModel = this.context.forModel(session.ctx);
          const ckey = createHash('sha1').update(JSON.stringify([request.toLowerCase(), forModel, actor.id, this.gl.dataVersion()])).digest('hex');
          const hit = this.interpCache.get(ckey);
          if (hit && !conversationalShortcut(request, this.convInfo(session, actor, view)) && !capabilityGap(request, session.ctx)) { I = JSON.parse(JSON.stringify(hit)); tr.interpretationSource = 'reasoning'; tr.fallbacks.push('interpretation: cached (same request, same context, same data version)'); tr.conversation = { input: request, conversationIntent: 'FINANCIAL_QUESTION', requiresTool: true, selectedRoute: 'GOVERNED_TOOLS', selectedModel: null, selectedTool: null, fallbackReason: 'cached interpretation of the same request' }; }
          else {
            const ti = Date.now();
            const interpP = this.adapter.interpret({ request, context: this.modelContext(session.ctx, actor, request), candidates: cands, workingPeriod: this.data.workingPeriod(), availablePeriods: this.data.governedPeriods() }, { route: 'FAST', signal: iac.signal });
            if (convP) {
              const co = await convP;
              if (cancelled()) return cancel();
              this.recordCall(tr, 'converse', co); spend(co.status === 'ok' ? co.usage : null);
              convModel = co.model ?? null;
              if (co.status === 'ok') {
                conversation = co.value;
                /* a reply may repeat a figure only if the context it was given states it — otherwise the turn needs a tool */
                const ctxText = JSON.stringify(cctx).replace(/[,$()]/g, '');
                const unknownFig = conversation.reply ? numTokens(conversation.reply).filter((x) => x.replace(/[MKB%]$/, '').length > 0).find((x) => !ctxText.includes(x.replace(/[MKB%]$/, ''))) : undefined;
                if (!conversation.requiresTool && conversation.reply && !unknownFig) { iac.abort(); return say(conversation.reply, conversation.conversationIntent, convModel, null); }
                if (!conversation.requiresTool && unknownFig) convWhy = `reply cited ${unknownFig}, which is not in the context — routed to governed tools`;
                if (conversation.requiresTool && (conversation.conversationIntent === 'UNSUPPORTED_OPERATION' || (conversation.conversationIntent === 'ACTION_REQUEST' && capabilityGap(request, session.ctx)))) { iac.abort(); return gapOut(conversation.conversationIntent, convModel, conversation.unsupportedOperation); }
              } else convWhy = `conversational model ${co.status === 'error' ? `failed: ${co.code}` : 'declined'}`;
            }
            if (!conversation) {
              const sc = conversationalShortcut(request, this.convInfo(session, actor, view));
              if (sc) { iac.abort(); return say(sc.reply, sc.intent, null, `deterministic conversational shortcut${convWhy ? ` (${convWhy})` : ' (no conversational model in this mode)'}`); }
              if (capabilityGap(request, session.ctx)) { iac.abort(); return gapOut('ACTION_REQUEST', null, null); }
            }
            tr.conversation = { input: request, conversationIntent: conversation?.conversationIntent ?? null, requiresTool: true, selectedRoute: 'GOVERNED_TOOLS', selectedModel: convModel, selectedTool: null, fallbackReason: convWhy };
            const out = await interpP;
            tr.timings.interpretMs = Date.now() - ti;
            if (cancelled()) return cancel();
            this.recordCall(tr, 'interpret', out); spend(out.status === 'ok' ? out.usage : null);
            if (out.status === 'ok' && out.value.confidence >= LIMITS.minConfidence) {
              I = out.value; tr.interpretationSource = 'reasoning';
              this.interpCache.set(ckey, JSON.parse(JSON.stringify(out.value))); if (this.interpCache.size > 300) this.interpCache.delete(this.interpCache.keys().next().value!);
            } else {
              I = deterministicInterpret(request, this.data, session.ctx, this.controls.allRecDefs().map((d) => ({ id: d.id, name: d.name }))); tr.interpretationSource = 'deterministic';
              const why = out.status === 'ok' ? `low confidence (${out.value.confidence})` : out.status === 'declined' ? 'the reasoning service declined' : `the reasoning service failed: ${out.code}`;
              tr.fallbacks.push(`interpretation: deterministic — ${why}`);
              if (out.status === 'error') note('Sloane’s reasoning service was unavailable, so this request was interpreted by Korvyn’s deterministic engine.');
            }
          }
          if (tr.interpretationSource === 'reasoning') {
            /* the engine overrules the model when the request names a reconciliation in full: it is about THAT one */
            const named = deterministicInterpret(request, this.data, session.ctx, this.controls.allRecDefs().map((d) => ({ id: d.id, name: d.name }))).requestedObject.id;
            if (named?.startsWith('recon:') && I.requestedObject.id !== named && I.intent !== 'ACT' && I.intent !== 'BUILD' && I.intent !== 'CORRECTION') { I = { ...I, requestedObject: { ...I.requestedObject, type: 'RECONCILIATION', id: named } }; tr.fallbacks.push(`interpretation: named reconciliation ${named} overrides the model's object`); }
          }
          tr.route = 'FAST';
        }
      }
      const v = validateInterpretation(I);
      if (!v.ok) { tr.errors.push(...v.errors); return finish('ERROR', { notes: ['The interpretation failed validation.'] }); }
      tr.interpretation = I;

      /* ---- 2. context: validate against governed catalogues, classify, apply ---- */
      const R = this.context.resolve(I, session.ctx, raw);
      tr.resolution = R;
      tr.classification = R.named.object && session.ctx.object.value.type && session.ctx.object.value.type !== R.objectType ? 'NEW_OBJECT' : I.continuity;
      R.warnings.forEach(note);
      if (R.errors.length) {
        R.errors.forEach(note); kind = 'ANSWER';
        const fb = capabilityFallback(session.ctx); suggestions = fb.suggestions;
        return finish('UNAVAILABLE');
      }
      const ctx = this.context.apply(session.ctx, R, I);
      if (fast) fast.mutate(ctx);
      else {
        if (tr.classification === 'NEW_OBJECT' || (I.continuity === 'NEW_OBJECT' && R.named.object)) onNewObject(ctx);
        /* an explicit threshold or dimension in a first question is the conversation's view from now on */
        const cv = conv(ctx);
        if (I.minAbsAmount) { cv.minAbsAmount = I.minAbsAmount; cv.set['threshold'] = cv.turn; }
        if (I.dimensions[0] && I.operation === 'BREAKDOWN') { cv.dimension = I.dimensions[0]; cv.set['dimension'] = cv.turn; }
        if (R.named.object) cv.set['object'] = cv.turn;
        if (R.named.period || R.named.range) cv.set['period'] = cv.turn;
        if (R.named.comparison) cv.set['comparison'] = cv.turn;
        if (R.named.scope) cv.set['scope'] = cv.turn;
        cv.lastIntent = I.intent;
      }
      /* a reconciliation the request names is the focus BEFORE planning, so `$ctx.reconciliationId` resolves to it */
      const namedRec = I.requestedObject.id?.startsWith('recon:') && I.intent !== 'ACT' && I.intent !== 'BUILD' && I.intent !== 'CORRECTION' ? this.controls.recDef(I.requestedObject.id.slice(6)) : null;
      if (namedRec) { ctx.lastRefs['reconciliationId'] = namedRec.id; ctx.focus = { value: { kind: 'reconciliation', id: namedRec.id, name: namedRec.name }, source: 'EXPLICIT' }; }
      session.ctx = ctx;

      /* ---- 3. clarification decision (the conversation and a deliverable state their defaults instead of asking) ---- */
      const dec = this.clarifier.decide(I, R, ctx, loops);
      if (dec.capped) tr.limitsReached.push('maxClarificationLoops');
      if (dec.needed.length && (fast || deliverable || artifactPlan(request, ctx) || pbcPlan(request, ctx))) { tr.fallbacks.push(`clarification: ${dec.needed.join(', ')} not asked — ${fast ? 'the conversation supplies it' : 'a deliverable states its defaults on the preview'}`); dec.needed = []; }
      /* 8A: a question about WHAT something is ("the TB for South Valley" — a project has no TB) is answered first; the
         semantic tools state the period they read, so a period asked for here could be a question about nothing */
      if (dec.needed.length && dec.needed.every((f) => f === 'period' || f === 'scope') && semanticPlan(request, ctx)) { tr.fallbacks.push(`clarification: ${dec.needed.join(', ')} not asked — the semantic route resolves the subject first and states its period`); dec.needed = []; }
      if (dec.needed.length) {
        const field = dec.needed[0]!;
        const q = this.clarifier.question(field, R, actor);
        session.pending = { id: `CLR-${randomUUID().slice(0, 8)}`, request: raw, interpretation: I, field, options: q.options, loops, traceId: tr.traceId };
        tr.clarification = { ...dec, asked: field, options: q.options.map((o) => o.label) };
        kind = 'CLARIFICATION';
        return finish('CLARIFICATION_REQUIRED', { clarification: { pendingId: session.pending.id, field, question: q.question, options: q.options } });
      }
      tr.clarification = { ...dec, asked: null, options: [] };

      /* ---- 4. plan. The conversation and a deliverable bring their own plan; a single-object read uses Korvyn's
                deterministic planner; only a broad, multi-part or action request is planned by the DEEP model ---- */
      const detAllow = toolRegistry.all().filter((t) => (t.risk === 'READ' || t.risk === 'PROPOSE') && authorize(actor, t).ok);
      const { tools: allow, domains } = this.planner.allowlist(actor, I, raw, ctx);
      tr.toolsExposed = { domains, tools: allow.map((t) => t.id) };
      /* a domain the request names but the actor may not read is said, never silently answered around */
      for (const [dom, re] of DOMAIN_WORDS) {
        if (!re.test(raw)) continue;
        const inDomain = toolRegistry.all().filter((t) => t.domain === dom && t.risk === 'READ');
        const denied = inDomain.filter((t) => !authorize(actor, t).ok);
        if (inDomain.length && denied.length === inDomain.length) { const perm = [...new Set(denied.map((t) => t.permission))].join(', '); note(`You are not permitted to view ${dom === 'recon' ? 'reconciliation' : dom} data (${perm}); Sloane answered only from what your role can see.`); tr.warnings.push(`domain ${dom} denied: ${perm}`); }
      }
      const tp = Date.now();
      let steps: PlanStep[] = [];
      let pv: PlanValidation = { steps: [], repairs: [], rejected: [], truncated: 0 };
      const own = fast?.steps ?? deliverable;
      if (own) {
        steps = own; pv = this.planner.validate(own, detAllow, actor, ctx); tr.plan.source = fast ? 'conversation' : 'deterministic';
      } else {
        /* a request with several clauses ("why did CIP move AND does the reconciliation support it") is planned by the DEEP
           model; a single question — even one needing several reads — is Korvyn's deterministic planner's */
        const multi = /\band\b|;|\balso\b|\?.+\?|\beverything\b|\ball the\b/i.test(raw);
        const simple = !['ACT', 'BUILD', 'CORRECTION'].includes(I.intent) && !((I.multiStep || I.intent === 'REVIEW') && multi);
        const det = simple ? deterministicPlan(raw, I, R, ctx, this.gl) : [];
        const dv = det.length ? this.planner.validate(det, detAllow, actor, ctx) : null;
        if (dv && dv.steps.length && !dv.rejected.length) { steps = det; pv = dv; tr.plan.source = 'deterministic'; }
        else {
          if (this.mode === 'reasoning' && !overBudget()) {
            status('Planning the analysis');
            const tools = allow.map((t) => ({ id: t.id, description: t.description, requiredInputs: t.params.filter((p) => p.required).map((p) => `${p.name} (${p.kind})`), optionalInputs: t.params.filter((p) => !p.required).map((p) => `${p.name} (${p.kind})`), outputs: t.outputs }));
            const out = await this.adapter.plan({ request: raw, interpretation: I, context: this.modelContext(ctx, actor, raw), tools, maxSteps: Math.min(this.cfg.maxPlanSteps, LIMITS.maxToolCalls) }, { route: 'DEEP', signal: ac.signal });
            if (cancelled()) return cancel();
            this.recordCall(tr, 'plan', out); spend(out.status === 'ok' ? out.usage : null);
            if (out.status === 'ok') { steps = out.value.steps; tr.plan.source = 'reasoning'; tr.route = 'DEEP'; }
            else tr.fallbacks.push(`plan: deterministic — ${out.status === 'error' ? out.code : out.status}`);
          }
          pv = this.planner.validate(steps, allow, actor, ctx);
          /* 4A / 5A: a deliverable or an audit request is acted on by its own tools even when the model planned a read */
          const pb = pbcPlan(raw, ctx);
          if (pb && !(pb.every((x) => pv.steps.some((y) => y.tool === x.tool)))) {
            const bv = this.planner.validate(pb, detAllow, actor, ctx);
            if (bv.steps.length) { if (steps.length) tr.fallbacks.push('plan: PBC routing — the model plan did not act on the request'); steps = pb; pv = { ...bv, rejected: [...pv.rejected, ...bv.rejected] }; tr.plan.source = 'deterministic'; }
          }
          const art = pb ? null : artifactPlan(raw, ctx);
          if (art && (!pv.steps.some((s) => ARTIFACT_TOOLS.has(s.tool)) || (ARTIFACT_FORCED.has(art[0]!.tool) && !pv.steps.some((s) => s.tool === art[0]!.tool)))) {
            const av = this.planner.validate(art, detAllow, actor, ctx);
            if (av.steps.length) { if (steps.length) tr.fallbacks.push('plan: artifact routing — the model plan did not act on the workbook'); steps = art; pv = { ...av, rejected: [...pv.rejected, ...av.rejected] }; tr.plan.source = 'deterministic'; }
          }
          if (!pv.steps.length && det.length && dv?.steps.length) { steps = det; pv = dv; tr.plan.source = 'deterministic'; }
          if (!pv.steps.length) {
            const det2 = det.length ? det : deterministicPlan(raw, I, R, ctx, this.gl);
            if (steps.length) tr.fallbacks.push('plan: deterministic — no model step survived validation');
            const dv2 = this.planner.validate(det2, detAllow, actor, ctx);
            if (dv2.steps.length) { steps = det2; pv = { ...dv2, rejected: [...pv.rejected, ...dv2.rejected], repairs: [...pv.repairs, ...dv2.repairs] }; tr.plan.source = 'deterministic'; }
            else pv = { ...pv, rejected: [...pv.rejected, ...dv2.rejected] };
          }
        }
      }
      tr.timings.planMs = Date.now() - tp;
      tr.plan.proposed = steps; tr.plan.validation = pv;
      if (pv.truncated) tr.limitsReached.push('maxToolCalls');
      if (!pv.steps.length) {
        /* §8: never a dead end — say what could not be done, and offer what can be, from the context */
        const permittedAll = toolRegistry.all().filter((t) => t.risk === 'READ');
        const denied = permittedAll.filter((t) => allow.length === 0 && !authorize(actor, t).ok);
        const fb = capabilityFallback(ctx);
        const need = pv.rejected.map((r) => r.why).find((w) => /required and not in context|is required/.test(w));
        /* a permission refusal is always said as one — it is never softened into "no capability" */
        const refused = pv.rejected.map((r) => r.why).filter((w) => /\bmay not\b|not permitted|permission|disabled/i.test(w));
        if (refused.length) note(`Not permitted: ${[...new Set(refused)].join('; ')}.`);
        else if (need) note(`Sloane needs a subject for that — ${need.replace(/ is required and not in context/, ' is not in context yet')}. Name an account, vendor or project, or pick one below.`);
        else {
          /* unknown intent is not an unsupported capability: ask what the person wants to do */
          if (tr.conversation) { tr.conversation.selectedRoute = 'CONVERSATIONAL_RESPONSE'; tr.conversation.fallbackReason = 'no governed plan for this request — asked what the person wants'; }
          kind = 'CONVERSATION'; tr.route = 'CONVERSATION';
          return finish('ANSWER', { reply: 'Can you tell me a little more about what you want to do?' });
        }
        suggestions = fb.suggestions; kind = 'ANSWER';
        if (denied.length) note(`You are not permitted to use: ${denied.map((t) => t.id).join(', ')}.`);
        return finish('UNAVAILABLE');
      }

      /* ---- 5. execute, server-side; references resolve against earlier outputs; permission re-checked per call ---- */
      const tx = Date.now();
      const results: (FinancialObject | null)[] = [];
      const objects: FinancialObject[] = [];
      const planId = `PLAN-${randomUUID().slice(0, 8)}`;
      this.ensureInvestigation(session, actor, raw);
      const toolSession: ToolSession = {
        id: sessionId, planId, traceId: tr.traceId, period: ctx.period.value, scope: ctx.scope.value, focus: ctx.focus.value, populationId: ctx.populationId.value,
        lastNarrative: session.lastNarrative, lastObjects: session.lastObjects, lastRefs: ctx.lastRefs, investigationId: session.investigation.id, request: raw,
        investigation: { ...session.investigation, timeline: this.timeline(sessionId) }, lastToolCalls: session.lastToolCalls, proposalsThisTurn: [], drafts: session.drafts, engine: this.actions,
      };
      const env: Omit<ToolEnv, 'objectId'> = { data: this.data, gl: this.gl, controls: this.controls, actor, visible: visibleOf(actor), session: toolSession, artifacts: this.artifacts, ...(this.artifacts.pbc ? { pbc: this.artifacts.pbc } : {}) };
      for (const [i, s] of pv.steps.entries()) {
        const tool = toolRegistry.get(s.tool)!;
        const args: ToolArgs = { ...s.args };
        let skip = '';
        if (i > 0 && s.purpose && s.purpose !== pv.steps[i - 1]!.purpose) status(s.purpose);
        for (const [name, path] of Object.entries(s.refs)) {
          const val = refValue(path, results);
          if (!val) { skip = `${name} (${path}) did not resolve from an earlier result`; break; }
          const kindP = tool.params.find((p) => p.name === name)!.kind;
          const chk = this.planner.check(kindP, val);
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
          /* 5A: a PBC request the tool prepared is kept now (a new request, or a new version) and the answer is its workspace */
          const kept = this.persistPBC(session, actor, tr.traceId, sessionId, { ...env, objectId: r.object.id });
          if (kept) { r.object = kept.object; r.warnings.push(...kept.warnings); }
          r.object.facts = r.object.facts.slice(0, LIMITS.maxFactsPerObject);
          results.push(r.object); objects.push(r.object);
          if (kept?.extra) objects.push(kept.extra);
          /* a changed workbook definition becomes a new artifact VERSION before the next step runs (so a generate step
             in the same plan sees it); this is the conversation's work being kept, like the investigation record */
          const persisted = this.persistDraft(session, actor, tr.traceId, sessionId, r.object);
          if (persisted) note(persisted);
          if (r.object.type === 'ExcelWorkbookPreview') ((r.object.workbook?.['notes'] as string[] | undefined) ?? []).forEach(note);
          r.warnings.forEach((w) => { if (!tr.warnings.includes(w)) tr.warnings.push(w); });
          if (r.object.status === 'UNAVAILABLE') note(r.object.unavailable!.reason);
          tr.toolsExecuted.push({ tool: s.tool, args, status: 'COMPLETED', objectId: r.object.id, latencyMs: Date.now() - st, warnings: r.warnings, error: null,
            result: { type: r.object.type, status: r.object.status, facts: r.object.facts.length, populationId: r.object.population?.populationId ?? null, rows: r.object.table.rows.length } });
        } catch (e) {
          results.push(null);
          tr.toolsExecuted.push({ tool: s.tool, args, status: 'FAILED', objectId: null, latencyMs: Date.now() - st, warnings: [], error: redact((e as Error).message), result: null });
        }
      }
      tr.timings.toolsMs = Date.now() - tx;
      tr.objects = objects.map((o) => ({ id: o.id, type: o.type, title: o.title, status: o.status, facts: o.facts.length }));
      /* §31: a partial failure answers with what did run and says which part did not */
      const failed = tr.toolsExecuted.filter((x) => x.status === 'FAILED' || x.status === 'SKIPPED');
      if (failed.length && objects.length) note(`Part of this answer could not be produced (${failed.map((x) => x.tool).join(', ')}); the rest is governed and shown.`);
      if (!objects.length) {
        const fb = capabilityFallback(ctx); suggestions = fb.suggestions; kind = 'ANSWER';
        note('The governed tools Korvyn ran did not produce an answer for this request.');
        return finish('UNAVAILABLE');
      }
      /* the warnings a reader needs (declared inputs, partial evidence) travel as notes, once each */
      tr.warnings.filter((w) => /not connected|unavailable|representative|not modelled|not in the governed|Showing|No single GL line|No governed (lines|activity)|checked the/i.test(w)).slice(0, 4).forEach(note);
      (fast?.notes ?? []).forEach(note);

      const proposals = objects.filter((o) => o.action).map((o) => o.action!);
      const analysisObjects = objects.filter((o) => !o.action);
      kind = fast?.kind ?? (proposals.length ? 'ACTION' : deliverable || analysisObjects.some((o) => STRUCTURAL.has(o.type)) ? 'ARTIFACT' : 'ANSWER');
      /* §14/§15: the structured objects go to the reader NOW; the narrative follows */
      tr.timings.firstObjectMs = Date.now() - t0;
      hooks.emit?.({ type: 'object', response: { sessionId, traceId: tr.traceId, state: 'ANSWER', kind, objects, notes: notes.slice(), narrativePending: this.mode === 'reasoning' && !proposals.length && analysisObjects.some((o) => !STRUCTURAL.has(o.type)), contextLine: contextView(ctx, this.data).line, actions: proposals.length ? { planId, proposals } : null } });

      /* ---- 6. explain: the model narrates the facts; grounding rejects any number it did not receive ---- */
      let narrative = deterministicNarrative(objects);
      tr.narrative.source = 'deterministic';
      tr.proposals = proposals.map((p) => ({ id: p.id, type: p.type, riskLevel: p.riskLevel, status: p.status, validationStatus: p.validationStatus, target: p.targetLabel, errors: p.validation.errors, warnings: p.validation.warnings, dependsOn: p.dependsOn }));
      if (proposals.length) {
        const ready = proposals.filter((p) => p.status === 'WAITING_CONFIRMATION').length, gov = proposals.filter((p) => p.riskLevel === 'GOVERNED_ACTION').length;
        narrative = [{ text: `Prepared ${proposals.length} action${proposals.length > 1 ? 's' : ''}${ready ? `, ${ready} ready to confirm` : ''}${gov ? `, ${gov} governed (prepare only)` : ''}. Nothing has been written.`, objectIds: proposals.map((p) => p.id), factKeys: [] }, ...narrative.filter((n) => analysisObjects.some((o) => n.objectIds.includes(o.id)))];
      }
      /* a workbook or PBC workspace IS the answer: its preview states itself, so no narrative call is spent on it */
      const narrated = analysisObjects.filter((o) => !STRUCTURAL.has(o.type));
      if (this.mode === 'reasoning' && !overBudget() && narrated.length && !proposals.length) {
        const payload = objects.map((o) => ({ objectId: o.id, type: o.type, title: o.title, status: o.status, facts: o.facts.map((f) => ({ key: `${o.id}.${f.key}`, label: f.label, display: f.display })) }));
        const nkey = createHash('sha1').update(JSON.stringify([raw.toLowerCase(), payload.map((p) => ({ ...p, objectId: '' }))])).digest('hex');
        const cachedN = this.narrCache.get(nkey);
        if (cachedN) { narrative = cachedN.map((s) => ({ ...s, objectIds: s.objectIds })); tr.narrative.source = 'reasoning'; tr.fallbacks.push('narrative: cached (identical facts)'); }
        else {
          status('Writing the summary');
          const tn = Date.now();
          const out = await this.adapter.narrate({ request: raw, objects: payload }, { route: I.intent === 'REVIEW' ? 'FAST' : 'NARRATE', signal: ac.signal });
          tr.timings.narrateMs = Date.now() - tn;
          if (cancelled()) return cancel();
          this.recordCall(tr, 'narrate', out); spend(out.status === 'ok' ? out.usage : null);
          if (out.status === 'ok') {
            const g = ground(out.value.sentences, objects);
            tr.narrative.rejected = g.rejected;
            if (g.accepted.length) {
              narrative = g.accepted; tr.narrative.source = 'reasoning';
              /* keyed by the facts, not the object ids: the same governed facts always narrate the same way */
              const ids = new Map(objects.map((o, i) => [o.id, i]));
              this.narrCache.set(nkey, g.accepted); if (this.narrCache.size > 300) this.narrCache.delete(this.narrCache.keys().next().value!);
              void ids;
            } else tr.fallbacks.push('narrative: deterministic — no grounded sentence');
          } else tr.fallbacks.push(`narrative: deterministic — ${out.status === 'error' ? out.code : out.status}`);
        }
      }
      tr.narrative.accepted = narrative.length;
      if (cancelled()) return cancel();

      session.ctx = this.context.commitShown(session.ctx, objects);
      afterAnswer(session.ctx, tr.toolsExecuted.filter((x) => x.status === 'COMPLETED').map((x) => ({ tool: x.tool, args: x.args })), objects, kind, this.gl);
      if (analysisObjects.length && !proposals.length) {
        session.lastNarrative = narrative.map((n) => n.text); session.lastObjects = analysisObjects;
        session.lastToolCalls = tr.toolsExecuted.filter((x) => x.status === 'COMPLETED').map((x) => ({ tool: x.tool, args: x.args }));
        session.investigation.findings.push(...narrative.map((n) => n.text).slice(0, 3));
        session.investigation.objects.push(...analysisObjects.map((o) => ({ id: `${tr.traceId}:${o.id}`, type: o.type, title: o.title })));
        for (const o of analysisObjects) { const pid = o.population?.populationId ?? o.refs['populationId']; if (pid && !session.investigation.populationIds.includes(pid)) session.investigation.populationIds.push(pid); }
      }
      /* §28: the investigation is named for what was investigated, once there is something to name it by */
      let title: string | null = null;
      if (!session.titled) { title = investigationTitle(objects, session.ctx, raw); if (title) session.titled = true; }
      /* the investigation is durable: the step (with the READ tool calls that re-derive its objects), findings, references, a context snapshot, and a timeline event */
      {
        const invId = session.investigation.id, completed = tr.toolsExecuted.filter((x) => x.status === 'COMPLETED');
        WORK.repos.investigations.update(invId, actor.id, (o) => ({ ...(o as InvestigationBody), ...(title ? { title } : {}),
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
      if (!avail.length) suggestions = capabilityFallback(session.ctx).suggestions;
      return finish(avail.length ? 'ANSWER' : 'UNAVAILABLE', { objects, narrative: narrative.map((n) => ({ text: n.text, objectIds: n.objectIds })), actions: proposals.length ? { planId, proposals } : null, ...(title ? { title } : {}) });
    } catch (e) {
      tr.errors.push(redact((e as Error).message ?? String(e)));
      return finish('ERROR', { notes: ['Sloane could not complete this request.'] });
    }
  }

  /* ================================================================================================
     PHASE 7 — the governed step executor the AGENT RUNTIME uses. The runtime never executes anything itself: every task
     that touches a tool comes through here, where it is validated by the Planner (registry, allowlist, arguments,
     permission), re-authorised at execution, and run with the same env, persistence and context rules as a turn.
     ================================================================================================ */
  /** a server session for an agent run (the run's own conversation; another user never inherits it) */
  agentSession(sessionId: string, actor: Actor, seed?: { period?: string; periodRange?: { start: string; end: string } | null; scope?: string; objective?: string }, investigationId?: string): string {
    let s = this.sessions.get(sessionId);
    /* a run outlives the in-memory conversation (refresh, restart): its session is re-attached to the run's investigation */
    if (s && investigationId && !s.investigation.id) s.investigation.id = investigationId;
    if (s && s.ownerId !== actor.id) throw new Error('This run belongs to another user.');
    if (!s) {
      s = { ctx: this.context.initial(actor), pending: null, touched: Date.now(), ownerId: actor.id, drafts: { report: null, excel: null }, lastNarrative: [], lastObjects: [], lastToolCalls: [], investigation: { id: '', objective: seed?.objective ?? '', findings: [], objects: [], populationIds: [] }, inflight: null, titled: true };
      this.sessions.set(sessionId, s);
      if (investigationId) s.investigation.id = investigationId;
    }
    if (seed?.period) s.ctx.period = { value: seed.period, source: 'EXPLICIT' };
    if (seed?.periodRange !== undefined) s.ctx.periodRange = { value: seed.periodRange, source: seed.periodRange ? 'EXPLICIT' : 'DEFAULTED' };
    if (seed?.scope) s.ctx.scope = { value: seed.scope, source: 'EXPLICIT' };
    return this.ensureInvestigation(s, actor, seed?.objective ?? 'Agent run');
  }
  /** the conversation's FinancialContext follows the run it is steering: an explicit instruction ("Use May", "Only South
   *  Valley", "Siemens Energy") replaces what was inherited — June is not silently kept when the person said May */
  agentContext(sessionId: string, actor: Actor, c: { period: string; periodRange: { start: string; end: string } | null; entity: string | null; vendor: string | null; project: string | null; account: string | null; threshold: number | null }) {
    const s = this.sessions.get(sessionId);
    if (!s || s.ownerId !== actor.id) return;
    s.ctx.period = { value: c.period, source: 'EXPLICIT' };
    s.ctx.periodRange = { value: c.periodRange, source: c.periodRange ? 'EXPLICIT' : 'DEFAULTED' };
    s.ctx.scope = { value: c.entity ?? 'GROUP', source: 'EXPLICIT' };
    s.ctx.filters = { value: [...(c.vendor ? [{ dimension: 'vendor', value: c.vendor }] : []), ...(c.project ? [{ dimension: 'project', value: c.project }] : [])], source: 'EXPLICIT' };
    const v = conv(s.ctx);
    v.subject = { ...v.subject, vendor: c.vendor, project: c.project, entity: c.entity, account: c.account ?? v.subject.account, accountName: c.account ? this.gl.account(c.account)?.name ?? null : v.subject.accountName };
    v.minAbsAmount = c.threshold;
  }
  /** the tools a policy profile may use, permission-filtered for this actor BEFORE anything is proposed */
  agentAllowlist(actor: Actor, domains: readonly string[], allowPropose: boolean): SloaneTool[] {
    return toolRegistry.all().filter((t) => (t.risk === 'READ' || (allowPropose && t.risk === 'PROPOSE')) && domains.includes(t.domain) && authorize(actor, t).ok);
  }
  /** validate ONE step exactly as a plan step is validated (the model's proposals and the templates alike) */
  agentValidate(sessionId: string, actor: Actor, step: { tool: string; purpose: string; args: ToolArgs }, allow: SloaneTool[]): PlanValidation {
    const s = this.sessions.get(sessionId);
    if (!s || s.ownerId !== actor.id) return { steps: [], repairs: [], rejected: [{ tool: step.tool, why: 'no session for this run' }], truncated: 0 };
    return this.planner.validate([{ tool: step.tool, purpose: step.purpose, dependsOn: [], args: Object.entries(step.args).map(([name, value]) => ({ name, value })) }], allow, actor, s.ctx);
  }
  /** execute ONE validated step: permission re-checked, drafts / PBC requests kept, context and investigation updated */
  agentExecute(sessionId: string, actor: Actor, step: { tool: string; purpose: string; args: ToolArgs; request: string }, planId: string, objectId: string): { status: 'COMPLETED' | 'FAILED' | 'REFUSED'; object: FinancialObject | null; extra: FinancialObject | null; warnings: string[]; error: string | null; proposalIds: string[]; latencyMs: number; traceId: string } {
    const t0 = Date.now(), s = this.sessions.get(sessionId);
    const traceId = `ATR-${randomUUID().slice(0, 8)}`;
    const tool = toolRegistry.get(step.tool);
    const out = (status: 'COMPLETED' | 'FAILED' | 'REFUSED', error: string | null) => ({ status, object: null, extra: null, warnings: [], error, proposalIds: [], latencyMs: Date.now() - t0, traceId });
    if (!s || s.ownerId !== actor.id) return out('REFUSED', 'no session for this run');
    if (!tool) return out('REFUSED', `${step.tool} is not a registered tool`);
    const g = authorize(actor, tool, step.args);
    if (!g.ok) return out('REFUSED', g.reason);
    const ctx = s.ctx;
    const toolSession: ToolSession = {
      id: sessionId, planId, traceId, period: ctx.period.value, scope: ctx.scope.value, focus: ctx.focus.value, populationId: ctx.populationId.value,
      lastNarrative: s.lastNarrative, lastObjects: s.lastObjects, lastRefs: ctx.lastRefs, investigationId: s.investigation.id, request: step.request,
      investigation: { ...s.investigation, timeline: this.timeline(sessionId) }, lastToolCalls: s.lastToolCalls, proposalsThisTurn: [], drafts: s.drafts, engine: this.actions,
    };
    const env: Omit<ToolEnv, 'objectId'> = { data: this.data, gl: this.gl, controls: this.controls, actor, visible: visibleOf(actor), session: toolSession, artifacts: this.artifacts, ...(this.artifacts.pbc ? { pbc: this.artifacts.pbc } : {}) };
    try {
      const r = tool.run(step.args, { ...env, objectId });
      const kept = this.persistPBC(s, actor, traceId, sessionId, { ...env, objectId: r.object.id });
      if (kept) { r.object = kept.object; r.warnings.push(...kept.warnings); }
      const persisted = this.persistDraft(s, actor, traceId, sessionId, r.object);
      if (persisted) r.warnings.push(persisted);
      r.object.facts = r.object.facts.slice(0, LIMITS.maxFactsPerObject);
      const objs = [r.object, ...(kept?.extra ? [kept.extra] : [])];
      s.ctx = this.context.commitShown(s.ctx, objs);
      if (!r.object.action && r.object.status !== 'UNAVAILABLE') {
        s.lastObjects = [r.object]; s.lastToolCalls = [{ tool: step.tool, args: step.args }];
        const pid = r.object.population?.populationId ?? r.object.refs['populationId'];
        if (pid && !s.investigation.populationIds.includes(pid)) s.investigation.populationIds.push(pid);
      }
      const invId = s.investigation.id;
      WORK.repos.investigations.update(invId, actor.id, (o) => ({ ...(o as InvestigationBody),
        steps: [...o.steps, { at: new Date().toISOString(), request: `[agent] ${step.purpose}`, traceId, toolCalls: r.object.action ? [] : [{ tool: step.tool, args: step.args }], objectRefs: [`${traceId}:${r.object.id}`], narrative: [], proposalIds: toolSession.proposalsThisTurn.slice() }],
        objectRefs: r.object.action ? o.objectRefs : [...o.objectRefs, { ref: `${traceId}:${r.object.id}`, type: r.object.type, title: r.object.title, traceId }],
        populationRefs: [...new Set([...o.populationRefs, ...objs.map((x) => x.population?.populationId ?? x.refs['populationId']).filter((x): x is string => !!x)])],
        actionIds: [...o.actionIds, ...toolSession.proposalsThisTurn], sessionIds: [...new Set([...o.sessionIds, sessionId])] }), { period: s.ctx.period.value, scope: s.ctx.scope.value });
      return { status: 'COMPLETED', object: r.object, extra: kept?.extra ?? null, warnings: r.warnings, error: null, proposalIds: toolSession.proposalsThisTurn.slice(), latencyMs: Date.now() - t0, traceId };
    } catch (e) { return out('FAILED', redact((e as Error).message)); }
  }
  /** the model plans a GENERIC goal from the profile's allowlist; Korvyn's deterministic planner answers when it declines */
  async agentPlan(sessionId: string, actor: Actor, goalText: string, allow: SloaneTool[], signal?: AbortSignal): Promise<{ steps: PlanStep[]; source: 'reasoning' | 'deterministic'; calls: { stage: string; route: string | null; model: string | null; status: string; latencyMs: number; inputTokens: number; outputTokens: number }[] }> {
    const s = this.sessions.get(sessionId)!, calls: { stage: string; route: string | null; model: string | null; status: string; latencyMs: number; inputTokens: number; outputTokens: number }[] = [];
    const rec = (stage: string, o: { status: string; latencyMs: number; route?: string; model?: string; usage?: Usage }) => calls.push({ stage, route: o.route ?? null, model: o.model ?? null, status: o.status, latencyMs: o.latencyMs, inputTokens: o.usage?.inputTokens ?? 0, outputTokens: o.usage?.outputTokens ?? 0 });
    let I = deterministicInterpret(goalText, this.data, s.ctx, this.controls.recDefs());
    if (this.mode === 'reasoning') {
      const oi = await this.adapter.interpret({ request: goalText, context: this.modelContext(s.ctx, actor, goalText), candidates: this.context.candidates(goalText, actor), workingPeriod: this.data.workingPeriod(), availablePeriods: this.data.governedPeriods() }, { route: 'FAST', ...(signal ? { signal } : {}) });
      rec('interpret', oi as never);
      if (oi.status === 'ok') { const v = validateInterpretation(oi.value); if (v.ok) I = v.value; }
      const tools = allow.map((t) => ({ id: t.id, description: t.description, requiredInputs: t.params.filter((p) => p.required).map((p) => `${p.name} (${p.kind})`), optionalInputs: t.params.filter((p) => !p.required).map((p) => `${p.name} (${p.kind})`), outputs: t.outputs }));
      const op = await this.adapter.plan({ request: goalText, interpretation: I, context: this.modelContext(s.ctx, actor, goalText), tools, maxSteps: Math.min(this.cfg.maxPlanSteps, LIMITS.maxToolCalls) }, { route: 'DEEP', ...(signal ? { signal } : {}) });
      rec('plan', op as never);
      if (op.status === 'ok' && op.value.steps.length) return { steps: op.value.steps, source: 'reasoning', calls };
    }
    const R = this.context.resolve(I, s.ctx, goalText);
    return { steps: deterministicPlan(goalText, I, R, s.ctx, this.gl), source: 'deterministic', calls };
  }
  /** a grounded summary of a run's milestone objects: the model writes sentences, grounding rejects any figure it did not receive */
  async agentNarrate(request: string, objects: FinancialObject[], signal?: AbortSignal): Promise<{ sentences: string[]; source: 'reasoning' | 'deterministic'; rejected: number; call: { stage: string; route: string | null; model: string | null; status: string; latencyMs: number; inputTokens: number; outputTokens: number } | null }> {
    const det = deterministicNarrative(objects).map((n) => n.text);
    const narrated = objects.filter((o) => !STRUCTURAL.has(o.type) && !o.action && o.status !== 'UNAVAILABLE');
    if (this.mode !== 'reasoning' || !narrated.length) return { sentences: det, source: 'deterministic', rejected: 0, call: null };
    const payload = narrated.map((o) => ({ objectId: o.id, type: o.type, title: o.title, status: o.status, facts: o.facts.map((f) => ({ key: `${o.id}.${f.key}`, label: f.label, display: f.display })) }));
    const out = await this.adapter.narrate({ request, objects: payload }, { route: 'FAST', ...(signal ? { signal } : {}) });
    const call = { stage: 'narrate', route: out.route ?? null, model: out.model ?? null, status: out.status, latencyMs: out.latencyMs, inputTokens: out.status === 'ok' ? out.usage?.inputTokens ?? 0 : 0, outputTokens: out.status === 'ok' ? out.usage?.outputTokens ?? 0 : 0 };
    if (out.status !== 'ok') return { sentences: det, source: 'deterministic', rejected: 0, call };
    const g = ground(out.value.sentences, narrated);
    return g.accepted.length ? { sentences: g.accepted.map((x) => x.text), source: 'reasoning', rejected: g.rejected.length, call } : { sentences: det, source: 'deterministic', rejected: g.rejected.length, call };
  }
  /** a goal → a run (answered with the run card once it reaches a checkpoint, finishes, or ~12s pass — it keeps running
   *  in the background); an instruction to the run on screen → an intervention. null = an ordinary turn. */
  private async agentTurn(session: Session, sessionId: string, actor: Actor, request: string, status: (t: string) => void, signal: AbortSignal): Promise<{ object: FinancialObject; narrative: string[]; notes: string[]; title: string | null; shortcut: string } | null> {
    const A = this.agents;
    const card = (runId: string, notes: string[], shortcut: string) => {
      const v = A.get(runId, actor)!;
      session.lastRunId = runId;
      const object: FinancialObject = { id: 'FO-1', type: 'AgentRun', title: v.title, status: 'AVAILABLE', scope: { id: 'GROUP', name: v.scope }, periods: [], periodLabel: v.period, currency: 'USD', basis: '', unit: '',
        table: { columns: [], rows: [] }, facts: [], provenance: { source: 'Korvyn agent runtime — every step a governed tool, every write confirmed by you', snapshotId: runId, journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] },
        population: null, refs: { runId }, focus: null, unavailable: null, governed: true, agentRun: v };
      const q = v.checkpoints.find((c) => c.type === 'CLARIFICATION' && c.status === 'OPEN');
      const narrative = q ? [q.reason ?? q.title] : v.result ? [v.result.headline] : [];
      return { object, narrative, notes, title: v.title, shortcut };
    };
    /* the run this conversation is on: the one the last answer was about, else a live or waiting run of this session in
       the durable store (a refresh, a navigation or a restart does not lose it) */
    const last = (session.lastRunId ? A.body(session.lastRunId, actor) : null) ?? A.activeFor(sessionId, actor);
    if (last && !['CANCELLED', 'FAILED'].includes(last.runStatus)) {
      /* 1. an answer to the run's open question resumes the SAME run */
      if (A.openQuestion(last)) {
        const ans = await A.answer(last.runId, actor, request);
        if (ans?.ok) { await A.wait(last.runId, 10000); return card(last.runId, [], `clarified:${last.runId}`); }
      }
      /* 2. a short instruction steers the run durably — unless the words are a NEW goal ("Review last quarter." is a close
         review of its own, not a period change to the vendor review on screen) */
      if (request.split(/\s+/).length <= 16 && !A.detect(request, actor)) {
        const r = A.steer(last.runId, actor, request);
        if (r.recognised) { await A.wait(last.runId, 10000); return card(last.runId, [r.effect], `steer:${r.type}:${last.runId}`); }
      }
    }
    const type = A.detect(request, actor);
    if (!type) return null;
    const out = A.start(actor, request, { sessionId });
    if (!out.ok) return null;
    const runId = out.run.runId, seen = new Set<string>();
    status(`Starting: ${out.run.goal.title}`);
    const t0 = Date.now();
    while (Date.now() - t0 < 12000 && !signal.aborted) {
      const b = A.body(runId, actor)!;
      for (const p of b.progress) if (p.state === 'done' && !seen.has(p.line)) { seen.add(p.line); status(`✓ ${p.line}`); }
      if (!['RUNNING', 'PLANNING', 'READY', 'CREATED'].includes(b.runStatus)) break;
      await new Promise((res) => setTimeout(res, 150));
    }
    return card(runId, [], `goal:${type}`);
  }
  /** what the conversational front door may know: the page (reported by the browser, unverified), the governed context,
   *  the last answer's titles and stated figures, the investigation and the run in this conversation — never more */
  private convInfo(session: Session, actor: Actor, view: string | null) {
    const run = session.lastRunId ? this.agents.get(session.lastRunId, actor) : null;
    const o = session.lastObjects[0];
    return { investigation: session.investigation.id ? session.investigation.objective || null : null, lastTitle: o ? o.title : null, lastSummary: session.lastNarrative.slice(0, 2).join(' ') || null,
      run: run ? { title: run.title, status: run.status, headline: run.result?.headline ?? null } : null, page: view };
  }
  private conversationContext(session: Session, actor: Actor, view: string | null, request = '') {
    const c = session.ctx, i = this.convInfo(session, actor, view);
    return {
      page: view ? `${view} (reported by the browser)` : null,
      period: periodLabel(c.period.value), scope: this.data.scope(c.scope.value)?.name ?? c.scope.value, focus: c.focus.value?.name ?? null,
      investigation: i.investigation, activeRun: i.run,
      lastAnswer: session.lastObjects.slice(0, 3).map((o) => ({ title: o.title, figures: o.facts.slice(0, 8).map((f) => `${f.label}: ${f.display}`) })),
      lastAnswerSummary: session.lastNarrative.slice(0, 3),
      /* Phase 8A: who the user is and what the words name, from their permitted graph — names and relationships, no figures */
      semantic: (() => { try { const m = this.semantic.forModel(actor, request, c); return { user: m.user, fiscal: m.fiscal, focus: m.focus, named: m.neighborhood.objects.slice(0, 8).map((o) => `${o.label} (${o.type})`), ambiguous: m.neighborhood.ambiguous.map((a) => a.term) }; } catch { return null; } })(),
    };
  }
  /** the objects the conversation last produced for a session (the agent's result is rendered from its own record) */
  sessionActor(sessionId: string) { return this.sessions.get(sessionId)?.ownerId ?? null; }

  /** 4A: keep the workbook the conversation is building — a new artifact on the first build, a new version on each
   *  refinement. Returns a note when it could not (e.g. the definition names a scope the reader may not see). */
  private persistDraft(session: Session, actor: Actor, traceId: string, sessionId: string, obj: FinancialObject): string | null {
    const d = session.drafts.excel as ({ id: string; definition: Record<string, unknown>; change?: string; dirty?: boolean; version?: number } | null);
    if (!d?.dirty) return null;
    const def = d.definition as unknown as ArtifactDefinition;
    const r = d.id ? this.artifacts.modify(actor, d.id, def, d.change ?? 'Refined', { via: 'SLOANE', traceId, investigationId: session.investigation.id })
      : this.artifacts.create(actor, def, { via: 'SLOANE', investigationId: session.investigation.id, sessionId, traceId });
    d.dirty = false;
    if (!r.ok) return `The workbook was not saved: ${r.reason}`;
    d.id = r.artifact.id; d.version = r.artifact.version;
    if (obj.type === 'ExcelWorkbookPreview') {
      obj.refs = { ...obj.refs, artifactId: d.id, excelDraftId: d.id, artifactVersion: String(d.version) };
      if (obj.workbook) Object.assign(obj.workbook, { artifactId: d.id, version: d.version, status: 'DRAFT' });
      if (obj.draft) obj.draft.id = d.id;
      obj.facts = obj.facts.filter((f) => f.key !== 'saved');
      obj.facts.push({ key: 'artifactVersion', label: 'Saved as', value: `${d.id} v${d.version}`, display: `${d.id} v${d.version} — every change is a new version` });
    }
    const inv = session.investigation.id;
    if (inv) WORK.repos.investigations.update(inv, actor.id, (o) => ({ ...(o as InvestigationBody), artifactIds: [...new Set([...o.artifactIds, d.id])] }));
    return null;
  }

  /** 5A: keep the PBC request the conversation prepared — a NEW request (and its package draft) on the first build, a
   *  NEW VERSION on each population change (the package over it is refreshed so it pins the new version). Like the
   *  workbook draft and the investigation record, this is the conversation's own work being kept; nothing is delivered. */
  private persistPBC(session: Session, actor: Actor, traceId: string, sessionId: string, env: ToolEnv): { object: FinancialObject; extra: FinancialObject | null; warnings: string[] } | null {
    const d = session.drafts.pbc, A = this.artifacts.pbc;
    if (!d?.dirty || !A) return null;
    d.dirty = false;
    const invId = session.investigation.id || null;
    if (d.op === 'create' && d.interpretation) {
      /* the auditor's own number, when the words carry one ("PBC #30: …") */
      const no = d.raw.match(/\bpbc\s*#\s*(\d+)\b/i)?.[1];
      const rec = A.create(actor, { interpretation: d.interpretation, source: 'NL', raw: d.raw, pbcNumber: no ? `PBC #${no}` : null, channel: 'SLOANE', traceId, investigationId: invId });
      d.id = rec.id;
      const q = d.interpretation.requirement;
      const def = this.artifacts.newPackage({ type: 'PBC_PACKAGE', focus: { pbcRequestId: rec.id }, periodStart: q.periodStart, periodEnd: q.periodEnd, scopeId: q.scopeId });
      session.drafts.excel = { id: '', definition: def as unknown as Record<string, unknown>, change: 'Created', dirty: true, version: 1 } as never;
      const note = this.persistDraft(session, actor, traceId, sessionId, { type: 'PBCRequest' } as FinancialObject);
      const xd = session.drafts.excel as unknown as { id: string; definition: Record<string, unknown>; version?: number };
      if (xd?.id) A.linkPackage(actor, rec.id, xd.id);
      const w = pbcObject(env, rec.id, { notes: d.interpretation.notes });
      const wb = xd?.id ? workbookObject({ ...env, objectId: `${env.objectId}-PKG` }, xd as never).object : null;
      return { object: w.object, extra: wb, warnings: [...w.warnings, ...(note ? [note] : [])] };
    }
    if (d.op === 'modify' && d.id && d.requirement) {
      const u = A.modify(actor, d.id, d.requirement, d.change, 'SLOANE', traceId);
      if (u.packageArtifactId && this.artifacts.get(u.packageArtifactId)) {
        const rr = this.artifacts.refresh(actor, u.packageArtifactId, null, 'SLOANE');
        if (rr.ok) session.drafts.excel = { id: rr.artifact.id, definition: rr.artifact.definition as unknown as Record<string, unknown>, version: rr.artifact.version } as never;
      }
      const w = pbcObject(env, d.id, { changes: d.change.split('; ') });
      return { object: w.object, extra: null, warnings: w.warnings };
    }
    return null;
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

  private recordCall(tr: SloaneExecutionTrace, stage: string, o: Awaited<ReturnType<SloaneLLMAdapter['interpret']>> | Awaited<ReturnType<SloaneLLMAdapter['plan']>> | Awaited<ReturnType<SloaneLLMAdapter['narrate']>> | Awaited<ReturnType<SloaneLLMAdapter['converse']>>) {
    tr.calls.push({
      stage, status: o.status, code: o.status === 'error' ? o.code : null,
      detail: o.status === 'error' ? redact(o.detail) : o.status === 'declined' ? o.reason : null,
      providerRequestId: o.status === 'declined' ? null : o.requestId, latencyMs: o.latencyMs, usage: o.status === 'ok' ? o.usage : null,
      route: o.route ?? null, model: o.model ?? null,
    });
  }
}
