/**
 * THE SERVER-SIDE SLOANE ORCHESTRATOR — the authoritative execution path.
 *
 *   Browser ─▶ /api/sloane/turn ─▶ SloaneOrchestrator
 *     ─▶ FinancialContextEngine   (session context, provenance, governed catalogues, validation)
 *     ─▶ SloaneLLMAdapter         (interpret; plan when multi-step; narrate)   — provider-neutral
 *     ─▶ ClarificationEngine      (policy decides; the model only recommends)
 *     ─▶ Planner                  (allowlist → plan → validation and repair)
 *     ─▶ Tool registry            (permission · governance · arguments, then execution)
 *     ─▶ FinancialObjects + grounded narrative ─▶ browser
 *
 * The browser sends words, a session id, and — to answer a question Sloane asked — a pending id and an option
 * id. It sends NO context, NO interpretation, NO plan and NO actor: anything it could send there would be
 * something it could forge. Every execution writes a SloaneExecutionTrace, kept server-side.
 */
import { randomUUID } from 'node:crypto';
import type { SloaneLLMAdapter, Usage } from './adapter.js';
import type { SloaneConfig } from './config.js';
import { FinancialDataService, periodLabel } from './financials.js';
import { type Interpretation, validateInterpretation } from './schema.js';
import { type Actor, type FinancialObject, type SloaneTool, type ToolArgs, authorize, serverActor, toolRegistry, WRITE_ACTIONS_ENABLED } from './tools.js';

/* ================================================================================================
   LIMITS
   ================================================================================================ */
export const LIMITS = { maxToolCalls: 8, maxClarificationLoops: 2, wallClockMs: 60_000, tokenBudget: 60_000, minConfidence: 0.55, maxRequestChars: 2000 };

/* ================================================================================================
   FINANCIAL CONTEXT ENGINE
   ================================================================================================ */
export type Source = 'EXPLICIT' | 'INHERITED' | 'DERIVED' | 'DEFAULTED' | 'UNKNOWN';
export interface Field<T> { value: T; source: Source }
export interface SessionContext {
  object: Field<{ type: string | null; name: string | null }>;
  period: Field<string>;
  periodRange: Field<{ start: string; end: string } | null>;
  scope: Field<string>;
  currency: Field<string>;
  basis: Field<string>;
}
export const reliable = (s: Source) => s === 'EXPLICIT' || s === 'INHERITED' || s === 'DERIVED';
const STATEMENTS = ['INCOME_STATEMENT', 'BALANCE_SHEET', 'FINANCIAL_STATEMENT', 'TRIAL_BALANCE'];

export interface Resolved {
  objectType: string | null;
  objectName: string | null;
  named: { object: boolean; period: boolean; range: boolean; scope: boolean };
  period: string | null;
  range: { start: string; end: string } | null;
  scopeId: string | null;
  scopeMatches: string[];
  errors: string[];
  warnings: string[];
}

export class FinancialContextEngine {
  constructor(readonly data: FinancialDataService) {}

  initial(): SessionContext {
    return {
      object: { value: { type: null, name: null }, source: 'UNKNOWN' },
      period: { value: this.data.workingPeriod(), source: 'DEFAULTED' },
      periodRange: { value: null, source: 'DEFAULTED' },
      scope: { value: 'GROUP', source: 'DEFAULTED' },
      currency: { value: 'USD', source: 'DEFAULTED' },
      basis: { value: 'US GAAP', source: 'DEFAULTED' },
    };
  }

  /** What the model is told: values with their provenance, never anything it could mistake for permission. */
  forModel(c: SessionContext) {
    const sc = this.data.scope(c.scope.value);
    return {
      currentObject: c.object, currentPeriod: c.period, periodRange: c.periodRange,
      entityScope: { value: sc?.name ?? c.scope.value, source: c.scope.source },
      currency: c.currency, accountingBasis: c.basis,
    };
  }

  candidates(request: string) {
    const scopes = this.data.scopes().map((s) => ({ id: `scope:${s.id}`, kind: 'scope', name: s.name }));
    const accounts = this.data.accountsMatching(request).map((a) => ({ id: `account:${a.code}`, kind: 'account', name: `${a.code} ${a.name}` }));
    return [...scopes, ...accounts];
  }

  /** Validates an interpretation against governed catalogues. An id that does not resolve is dropped, never trusted. */
  resolve(I: Interpretation, c: SessionContext): Resolved {
    const R: Resolved = { objectType: null, objectName: null, named: { object: false, period: false, range: false, scope: false },
      period: null, range: null, scopeId: null, scopeMatches: [], errors: [], warnings: [] };
    const governed = new Set(this.data.governedPeriods());

    if (I.requestedObject.type) { R.objectType = I.requestedObject.type; R.objectName = I.requestedObject.name; R.named.object = true; }
    else if (I.continuity === 'CONTINUATION' && c.object.value.type) { R.objectType = c.object.value.type; R.objectName = c.object.value.name; }

    if (I.periodRange) {
      const { start, end } = I.periodRange;
      const bad = [start, end].filter((p) => !governed.has(p));
      if (bad.length) R.errors.push(`period ${bad.map(periodLabel).join(', ')} is not a governed period (available ${[...governed].map(periodLabel).join(', ')})`);
      else if (start > end) R.errors.push('period range starts after it ends');
      else { R.range = { start, end }; R.named.range = true; }
    } else if (I.period) {
      if (!governed.has(I.period)) R.errors.push(`period ${periodLabel(I.period)} is not a governed period`);
      else { R.period = I.period; R.named.period = true; }
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
    return R;
  }

  /** The next context: what the request named becomes EXPLICIT; a new object drops the old object's state. */
  apply(c: SessionContext, R: Resolved): SessionContext {
    const n: SessionContext = JSON.parse(JSON.stringify(c));
    if (R.named.object) n.object = { value: { type: R.objectType, name: R.objectName }, source: 'EXPLICIT' };
    else if (c.object.value.type && R.objectType === c.object.value.type) n.object = { value: c.object.value, source: 'INHERITED' };
    if (R.named.range && R.range) { n.periodRange = { value: R.range, source: 'EXPLICIT' }; n.period = { value: R.range.end, source: 'DERIVED' }; }
    else if (R.named.period && R.period) { n.period = { value: R.period, source: 'EXPLICIT' }; n.periodRange = { value: null, source: 'DERIVED' }; }
    else if (R.named.object && c.object.value.type !== R.objectType) { n.periodRange = { value: null, source: 'DEFAULTED' }; }
    if (R.named.scope && R.scopeId) {
      n.scope = { value: R.scopeId, source: 'EXPLICIT' };
      n.currency = { value: this.data.scope(R.scopeId)!.presentationCurrency, source: 'DERIVED' };
    }
    return n;
  }

  /** After an answer, the defaults it was shown with become the reader's context: they will not be asked again. */
  commitShown(c: SessionContext): SessionContext {
    const n: SessionContext = JSON.parse(JSON.stringify(c));
    for (const k of ['period', 'scope', 'currency', 'basis'] as const) if (n[k].source === 'DEFAULTED') n[k].source = 'INHERITED';
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
    if (type && STATEMENTS.includes(type)) {
      if (!R.range && !R.period && !reliable(ctx.period.source)) policy.push('period');
      const multi = R.range && R.range.start !== R.range.end;
      if (multi && !reliable(ctx.scope.source)) policy.push('scope');
      if (type === 'TRIAL_BALANCE' && this.data.scope(ctx.scope.value)?.kind !== 'ENTITY') policy.push('entity');
    }
    if (R.scopeMatches.length > 1) policy.push('entity');
    const fieldReliable = (f: string) => f === 'period' ? reliable(ctx.period.source) : f === 'scope' ? reliable(ctx.scope.source) : f === 'entity' ? this.data.scope(ctx.scope.value)?.kind === 'ENTITY' : false;
    const recommended = I.needsClarification ? I.clarificationFields.slice() : [];
    const suppressed = recommended.filter((f) => fieldReliable(f) || f === 'object');
    const union = [...new Set([...policy, ...recommended.filter((f) => !suppressed.includes(f))])];
    const capped = loops >= LIMITS.maxClarificationLoops && union.length > 0;
    return { needed: capped ? [] : union.slice(0, 1), policy, recommended, suppressed, capped };
  }

  question(field: string, R: Resolved): { question: string; options: { id: string; label: string }[] } {
    const scopes = this.data.scopes();
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
export interface PlannedStep { tool: string; purpose: string; args: ToolArgs }
export interface ProposedStep { tool: string; purpose: string; args: Record<string, string | null>; missingInputs: string[] }
export interface PlanValidation { steps: PlannedStep[]; repairs: string[]; rejected: { tool: string; why: string }[]; truncated: number }

export class Planner {
  constructor(private readonly data: FinancialDataService) {}

  allowlist(actor: Actor, objectType: string | null): SloaneTool[] {
    return toolRegistry.all().filter((t) => t.risk === 'READ' && (!objectType || t.objectTypes.includes(objectType)) && authorize(actor, t).ok);
  }

  /** The deterministic plan for a single-object request, with the context it still needs named. */
  propose(objectType: string | null, ctx: SessionContext, R: Resolved): ProposedStep[] {
    const scope = reliable(ctx.scope.source) ? ctx.scope.value : null;
    if (objectType === 'INCOME_STATEMENT' || objectType === 'FINANCIAL_STATEMENT') {
      const start = R.range?.start ?? R.period ?? (reliable(ctx.period.source) ? ctx.period.value : null);
      const end = R.range?.end ?? R.period ?? (reliable(ctx.period.source) ? ctx.period.value : null);
      const args = { periodStart: start, periodEnd: end, scope };
      return [{ tool: 'getIncomeStatement', purpose: 'Monthly income statement for the requested months and scope', args, missingInputs: Object.entries(args).filter(([, v]) => !v).map(([k]) => k) }];
    }
    if (objectType === 'TRIAL_BALANCE') {
      const ent = this.data.scope(ctx.scope.value)?.kind === 'ENTITY' ? ctx.scope.value : null;
      const args = { period: R.period ?? ctx.period.value, entity: ent };
      return [{ tool: 'getTrialBalance', purpose: 'Entity trial balance through the period', args, missingInputs: Object.entries(args).filter(([, v]) => !v).map(([k]) => k) }];
    }
    return [];
  }

  /** Every step re-checked: allowlist, registry, governance, permission, dependencies, arguments. Nothing proposed is trusted. */
  validate(steps: { tool: string; purpose: string; dependsOn?: number[]; args: { name: string; value: string | null }[] }[], allow: SloaneTool[], actor: Actor, ctx: SessionContext): PlanValidation {
    const out: PlanValidation = { steps: [], repairs: [], rejected: [], truncated: 0 };
    const ids = new Set(allow.map((t) => t.id));
    const governed = new Set(this.data.governedPeriods());
    steps.forEach((s, i) => {
      const reg = toolRegistry.get(s.tool);
      if (!reg) { out.rejected.push({ tool: s.tool, why: 'no such tool in the registry' }); return; }
      if (!ids.has(s.tool)) {
        const g = authorize(actor, reg);
        out.rejected.push({ tool: s.tool, why: g.ok ? 'not allowlisted for this request' : g.reason });
        return;
      }
      if ((s.dependsOn ?? []).some((d) => d < 0 || d >= i)) { out.rejected.push({ tool: s.tool, why: 'depends on a later or unknown step' }); return; }
      const args: ToolArgs = {};
      let bad = '';
      for (const p of reg.params) {
        const given = s.args.find((a) => a.name === p.name)?.value ?? null;
        let v = given && given.startsWith('$ctx.') ? this.fromCtx(given.slice(5), ctx) : given;
        if (!v) { v = this.fromCtx(p.name, ctx); if (v) out.repairs.push(`${s.tool}.${p.name} ← context (${v})`); }
        if (!v) { if (p.required) bad = `${p.name} is required and not in context`; continue; }
        if (p.kind === 'period' && !governed.has(v)) bad = `${p.name} ${v} is not a governed period`;
        if (p.kind === 'scope' && !this.data.scope(v)) bad = `${p.name} ${v} is not a governed scope`;
        if (p.kind === 'entity' && this.data.scope(v)?.kind !== 'ENTITY') bad = `${p.name} ${v} is not a legal entity`;
        args[p.name] = v;
      }
      if (!bad && args['periodStart'] && args['periodEnd'] && args['periodStart'] > args['periodEnd']) bad = 'periodStart is after periodEnd';
      if (bad) { out.rejected.push({ tool: s.tool, why: bad }); return; }
      const g = authorize(actor, reg, args);
      if (!g.ok) { out.rejected.push({ tool: s.tool, why: g.reason }); return; }
      if (out.steps.length >= LIMITS.maxToolCalls) { out.truncated++; return; }
      out.steps.push({ tool: s.tool, purpose: s.purpose, args });
    });
    return out;
  }

  private fromCtx(name: string, ctx: SessionContext): string | null {
    switch (name) {
      case 'periodStart': return ctx.periodRange.value?.start ?? (reliable(ctx.period.source) ? ctx.period.value : null);
      case 'periodEnd': return ctx.periodRange.value?.end ?? (reliable(ctx.period.source) ? ctx.period.value : null);
      case 'period': case 'currentPeriod': return reliable(ctx.period.source) ? ctx.period.value : null;
      case 'scope': case 'entityScope': return reliable(ctx.scope.source) ? ctx.scope.value : null;
      case 'entity': return this.data.scope(ctx.scope.value)?.kind === 'ENTITY' ? ctx.scope.value : null;
      default: return null;
    }
  }
}

/* ================================================================================================
   GROUNDING — a number in the narrative must be a fact's display value
   ================================================================================================ */
const numTokens = (s: string) => (s.match(/\(?[$£€]?\d[\d,]*(?:\.\d+)?[MKB%]?\)?/g) ?? []).map((t) => t.replace(/[(),$£€]/g, ''));
export function ground(sentences: { text: string; objectIds: string[]; factKeys: string[] }[], objects: FinancialObject[]) {
  const allowed = new Set(objects.flatMap((o) => o.facts.flatMap((f) => numTokens(f.display))));
  const accepted: typeof sentences = [];
  const rejected: { text: string; why: string }[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    const bad = numTokens(s.text).filter((t) => !allowed.has(t));
    if (bad.length) { rejected.push({ text: s.text, why: `ungrounded number ${bad.join(', ')}` }); continue; }
    if (seen.has(s.text)) continue;
    seen.add(s.text); accepted.push(s);
  }
  return { accepted, rejected };
}
function deterministicNarrative(objects: FinancialObject[]) {
  const out: { text: string; objectIds: string[]; factKeys: string[] }[] = [];
  for (const o of objects) {
    const f = (k: string) => o.facts.find((x) => x.key === k);
    if (o.type === 'IncomeStatement' && f('netIncome.range') && f('totalRevenue.range'))
      out.push({ text: `${o.scope.name} earned net income of ${f('netIncome.range')!.display} on total revenue of ${f('totalRevenue.range')!.display} for ${o.periodLabel}.`, objectIds: [o.id], factKeys: [`${o.id}.netIncome.range`, `${o.id}.totalRevenue.range`] });
    if (o.type === 'TrialBalance' && f('difference'))
      out.push({ text: `Debits of ${f('debit')!.display} and credits of ${f('credit')!.display} leave a difference of ${f('difference')!.display}.`, objectIds: [o.id], factKeys: [`${o.id}.debit`, `${o.id}.credit`, `${o.id}.difference`] });
  }
  return out;
}

/* ================================================================================================
   DETERMINISTIC INTERPRETER — used when the adapter declines, fails or is unsure
   ================================================================================================ */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function deterministicInterpret(text: string, data: FinancialDataService, ctx: SessionContext): Interpretation {
  const t = text.toLowerCase();
  const type = /income statement|p\s?&\s?l|profit and loss|p and l|statement of operations/.test(t) ? 'INCOME_STATEMENT'
    : /balance sheet/.test(t) ? 'BALANCE_SHEET' : /trial balance|\btb\b/.test(t) ? 'TRIAL_BALANCE' : /\bfinancials?\b/.test(t) ? 'FINANCIAL_STATEMENT' : null;
  const year = (t.match(/\b(20\d\d)\b/) ?? [])[1] ?? data.workingPeriod().slice(0, 4);
  const ms = [...t.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g)].map((m) => `${year}-${String(MONTHS.indexOf(m[1]!) + 1).padStart(2, '0')}`);
  const range = ms.length >= 2 && /through|thru|\bto\b|until|-|–/.test(t) ? { start: ms[0]!, end: ms[ms.length - 1]! } : null;
  const scopeHit = data.scopes().find((s) => t.includes(s.name.toLowerCase()) || (s.kind === 'GROUP' && /\bconsolidated|\bgroup\b/.test(t)));
  return {
    intent: 'UNDERSTAND', requestedObject: { type: type as Interpretation['requestedObject']['type'], id: null, name: type ? type.replace(/_/g, ' ').toLowerCase() : null },
    operation: 'VIEW', period: !range && ms.length ? ms[0]! : null, periodRange: range, comparisonPeriod: null, comparisonBasis: null,
    scope: scopeHit ? { name: scopeHit.name, candidateId: `scope:${scopeHit.id}` } : null,
    dimensions: [], filters: [], minAbsAmount: null, topN: null, outputPreference: /monthly/.test(t) ? 'MONTHLY_COLUMNS' : null,
    continuity: type && type !== ctx.object.value.type ? 'NEW_OBJECT' : 'CONTINUATION',
    needsClarification: false, clarificationFields: [], multiStep: false, confidence: type ? 0.7 : 0.3,
  };
}

/* ================================================================================================
   EXECUTION TRACE — created and kept server-side
   ================================================================================================ */
export interface SloaneExecutionTrace {
  traceId: string; sessionId: string; startedAt: string; endedAt: string | null; latencyMs: number | null;
  actor: { id: string; role: string }; writeActionsEnabled: boolean; engine: { provider: string; model: string };
  request: string; resumedFromTrace: string | null;
  calls: { stage: string; status: string; code: string | null; detail: string | null; providerRequestId: string | null; latencyMs: number; usage: Usage | null }[];
  contextBefore: unknown; candidatesSupplied: number; governedPeriods: string[];
  interpretation: Interpretation | null; interpretationSource: 'reasoning' | 'deterministic' | 'clarification' | null;
  resolution: Omit<Resolved, 'named'> & { named: Resolved['named'] } | null;
  classification: string | null;
  clarification: (ClarDecision & { asked: string | null; options: string[] }) | null;
  toolsAvailable: string[]; toolsProposed: ProposedStep[];
  plan: { source: 'deterministic' | 'reasoning' | null; validation: PlanValidation | null };
  toolsExecuted: { tool: string; args: ToolArgs; status: 'COMPLETED' | 'FAILED' | 'REFUSED'; objectId: string | null; latencyMs: number; warnings: string[]; error: string | null }[];
  objects: { id: string; type: string; title: string; facts: number }[];
  narrative: { source: 'reasoning' | 'deterministic' | null; accepted: number; rejected: { text: string; why: string }[] };
  contextAfter: unknown; tokens: { input: number; output: number; cacheRead: number };
  limitsReached: string[]; fallbacks: string[]; state: string | null; errors: string[];
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
  context: { object: Field<string | null>; period: Field<string>; scope: Field<string>; currency: Field<string>; basis: Field<string> };
}
interface Pending { id: string; request: string; interpretation: Interpretation; field: string; options: { id: string; label: string }[]; loops: number; traceId: string }
interface Session { ctx: SessionContext; pending: Pending | null; touched: number }

const SID = /^[A-Za-z0-9_-]{8,64}$/;
const redact = (s: string) => s.replace(/sk-ant-[A-Za-z0-9_-]+/g, '<redacted>');

export class SloaneOrchestrator {
  readonly data: FinancialDataService;
  readonly context: FinancialContextEngine;
  readonly clarifier: ClarificationEngine;
  readonly planner: Planner;
  private readonly sessions = new Map<string, Session>();
  private readonly traces: SloaneExecutionTrace[] = [];

  constructor(private readonly adapter: SloaneLLMAdapter, private readonly cfg: Pick<SloaneConfig, 'maxPlanSteps'>, private readonly actorOf: () => Actor = serverActor, data?: FinancialDataService) {
    this.data = data ?? new FinancialDataService();
    this.context = new FinancialContextEngine(this.data);
    this.clarifier = new ClarificationEngine(this.data);
    this.planner = new Planner(this.data);
  }

  get mode(): 'reasoning' | 'deterministic' { return this.adapter.provider === 'mock' ? 'deterministic' : 'reasoning'; }
  trace(id: string): SloaneExecutionTrace | undefined { return this.traces.find((t) => t.traceId === id); }

  async turn(input: TurnInput): Promise<TurnResponse> {
    const t0 = Date.now();
    const sessionId = typeof input.sessionId === 'string' && SID.test(input.sessionId) ? input.sessionId : randomUUID();
    let session = this.sessions.get(sessionId);
    if (!session) { session = { ctx: this.context.initial(), pending: null, touched: t0 }; this.sessions.set(sessionId, session); }
    session.touched = t0;
    const actor = this.actorOf();
    const request = typeof input.request === 'string' ? input.request.trim().slice(0, LIMITS.maxRequestChars) : '';
    const tr: SloaneExecutionTrace = {
      traceId: `STR-${randomUUID().slice(0, 8)}`, sessionId, startedAt: new Date(t0).toISOString(), endedAt: null, latencyMs: null,
      actor: { id: actor.id, role: actor.role }, writeActionsEnabled: WRITE_ACTIONS_ENABLED,
      engine: { provider: this.adapter.provider, model: this.adapter.model }, request, resumedFromTrace: null,
      calls: [], contextBefore: this.context.forModel(session.ctx), candidatesSupplied: 0, governedPeriods: this.data.governedPeriods(),
      interpretation: null, interpretationSource: null, resolution: null, classification: null, clarification: null,
      toolsAvailable: [], toolsProposed: [], plan: { source: null, validation: null }, toolsExecuted: [], objects: [],
      narrative: { source: null, accepted: 0, rejected: [] }, contextAfter: null, tokens: { input: 0, output: 0, cacheRead: 0 },
      limitsReached: [], fallbacks: [], state: null, errors: [],
    };
    const notes: string[] = [];
    const spend = (u: Usage | null) => { if (u) { tr.tokens.input += u.inputTokens; tr.tokens.output += u.outputTokens; tr.tokens.cacheRead += u.cacheReadTokens; } };
    const overBudget = () => { const b = tr.tokens.input + tr.tokens.output > LIMITS.tokenBudget, w = Date.now() - t0 > LIMITS.wallClockMs;
      if (b && !tr.limitsReached.includes('tokenBudget')) tr.limitsReached.push('tokenBudget'); if (w && !tr.limitsReached.includes('wallClock')) tr.limitsReached.push('wallClock'); return b || w; };

    const finish = (state: TurnState, extra: Partial<TurnResponse> = {}): TurnResponse => {
      tr.state = state; tr.endedAt = new Date().toISOString(); tr.latencyMs = Date.now() - t0; tr.contextAfter = this.context.forModel(session!.ctx);
      this.traces.push(tr); if (this.traces.length > 100) this.traces.shift();
      console.log(`[sloane] ${tr.traceId} ${tr.engine.provider}:${tr.engine.model} ${state} ${tr.latencyMs}ms tools=${tr.toolsExecuted.map((x) => x.tool).join(',') || '-'} in=${tr.tokens.input} out=${tr.tokens.output}`);
      const c = session!.ctx;
      return {
        sessionId, traceId: tr.traceId, state, mode: this.mode, latencyMs: tr.latencyMs, notes, clarification: null, objects: [], narrative: [],
        context: { object: { value: c.object.value.type, source: c.object.source }, period: c.period, scope: { value: this.data.scope(c.scope.value)?.name ?? c.scope.value, source: c.scope.source }, currency: c.currency, basis: c.basis },
        ...extra,
      };
    };

    try {
      /* ---- 1. the interpretation: an answer to a pending question, or the model, or the deterministic engine ---- */
      let I: Interpretation;
      let raw = request;
      let loops = 0;
      const answer = this.matchClarification(session, input.clarification, request);
      if (answer) {
        const P = session.pending!;
        I = JSON.parse(JSON.stringify(P.interpretation));
        raw = P.request; loops = P.loops + 1; tr.request = P.request; tr.resumedFromTrace = P.traceId;
        if (answer.startsWith('scope:')) I.scope = { name: this.data.scope(answer.slice(6))!.name, candidateId: answer };
        if (answer.startsWith('period:')) I.period = answer.slice(7);
        I.needsClarification = false; I.clarificationFields = [];
        tr.interpretationSource = 'clarification';
        session.pending = null;
      } else {
        if (input.clarification) return finish('UNAVAILABLE', { notes: ['That question is no longer pending. Ask again and Sloane will re-interpret the request.'] });
        if (!request) return finish('ERROR', { notes: ['request is required'] });
        session.pending = null;
        const cands = this.context.candidates(request);
        tr.candidatesSupplied = cands.length;
        const out = await this.adapter.interpret({ request, context: this.context.forModel(session.ctx), candidates: cands, workingPeriod: this.data.workingPeriod(), availablePeriods: this.data.governedPeriods() });
        this.recordCall(tr, 'interpret', out); spend(out.status === 'ok' ? out.usage : null);
        if (out.status === 'ok' && out.value.confidence >= LIMITS.minConfidence) { I = out.value; tr.interpretationSource = 'reasoning'; }
        else {
          I = deterministicInterpret(request, this.data, session.ctx); tr.interpretationSource = 'deterministic';
          const why = out.status === 'ok' ? `low confidence (${out.value.confidence})` : out.status === 'declined' ? 'the reasoning service declined' : `the reasoning service failed: ${out.code}`;
          tr.fallbacks.push(`interpretation: deterministic — ${why}`);
          if (out.status === 'error') notes.push('Sloane’s reasoning service was unavailable, so this request was interpreted by Korvyn’s deterministic engine.');
        }
      }
      const v = validateInterpretation(I);
      if (!v.ok) { tr.errors.push(...v.errors); return finish('ERROR', { notes: ['The interpretation failed validation.'] }); }
      tr.interpretation = I;

      /* ---- 2. context: validate against governed catalogues, classify, apply ---- */
      const R = this.context.resolve(I, session.ctx);
      tr.resolution = R;
      tr.classification = R.named.object && session.ctx.object.value.type && session.ctx.object.value.type !== R.objectType ? 'NEW_OBJECT' : I.continuity;
      if (R.errors.length) { notes.push(...R.errors); return finish('UNAVAILABLE'); }
      const ctx = this.context.apply(session.ctx, R);
      session.ctx = ctx;

      /* ---- 3. allowlist and proposal, then the clarification decision ---- */
      const allow = this.planner.allowlist(actor, R.objectType);
      tr.toolsAvailable = allow.map((t) => t.id);
      tr.toolsProposed = this.planner.propose(R.objectType, ctx, R);
      const dec = this.clarifier.decide(I, R, ctx, loops);
      if (dec.capped) tr.limitsReached.push('maxClarificationLoops');
      if (dec.needed.length) {
        const field = dec.needed[0]!;
        const q = this.clarifier.question(field, R);
        session.pending = { id: `CLR-${randomUUID().slice(0, 8)}`, request: raw, interpretation: I, field, options: q.options, loops, traceId: tr.traceId };
        tr.clarification = { ...dec, asked: field, options: q.options.map((o) => o.label) };
        return finish('CLARIFICATION_REQUIRED', { clarification: { pendingId: session.pending.id, field, question: q.question, options: q.options } });
      }
      tr.clarification = { ...dec, asked: null, options: [] };

      if (!R.objectType) { notes.push('Sloane could not tell which financial object this request is about.'); return finish('UNAVAILABLE'); }
      if (!allow.length) { notes.push(`Sloane cannot yet produce a ${R.objectType.replace(/_/g, ' ').toLowerCase()} server-side, or you are not permitted to.`); return finish('UNAVAILABLE'); }

      /* ---- 4. plan: the model plans multi-step work; a single object uses the deterministic plan ---- */
      let steps = tr.toolsProposed.map((p) => ({ tool: p.tool, purpose: p.purpose, dependsOn: [] as number[], args: Object.entries(p.args).map(([name, value]) => ({ name, value })) }));
      tr.plan.source = 'deterministic';
      if (I.multiStep && this.mode === 'reasoning' && !overBudget()) {
        const tools = allow.map((t) => ({ id: t.id, description: t.description, requiredInputs: t.params.filter((p) => p.required).map((p) => p.name), optionalInputs: t.params.filter((p) => !p.required).map((p) => p.name), outputs: t.outputs }));
        const out = await this.adapter.plan({ request: raw, interpretation: I, context: this.context.forModel(ctx), tools, maxSteps: Math.min(this.cfg.maxPlanSteps, LIMITS.maxToolCalls) });
        this.recordCall(tr, 'plan', out); spend(out.status === 'ok' ? out.usage : null);
        if (out.status === 'ok') { steps = out.value.steps; tr.plan.source = 'reasoning'; }
        else tr.fallbacks.push(`plan: deterministic — ${out.status === 'error' ? out.code : out.status}`);
      }
      const pv = this.planner.validate(steps, allow, actor, ctx);
      tr.plan.validation = pv;
      if (pv.truncated) tr.limitsReached.push('maxToolCalls');
      if (!pv.steps.length) { notes.push('No executable step remained after validation.', ...pv.rejected.map((r) => `${r.tool}: ${r.why}`)); return finish('UNAVAILABLE'); }

      /* ---- 5. execute, server-side ---- */
      const objects: FinancialObject[] = [];
      for (const [i, s] of pv.steps.entries()) {
        const tool = toolRegistry.get(s.tool)!;
        const g = authorize(actor, tool, s.args);
        const st = Date.now();
        if (!g.ok) { tr.toolsExecuted.push({ tool: s.tool, args: s.args, status: 'REFUSED', objectId: null, latencyMs: 0, warnings: [], error: g.reason }); continue; }
        try {
          const r = tool.run(s.args, { data: this.data, actor, objectId: `FO-${i + 1}` });
          objects.push(r.object); notes.push(...r.warnings.filter((w) => !notes.includes(w)));
          tr.toolsExecuted.push({ tool: s.tool, args: s.args, status: 'COMPLETED', objectId: r.object.id, latencyMs: Date.now() - st, warnings: r.warnings, error: null });
        } catch (e) {
          tr.toolsExecuted.push({ tool: s.tool, args: s.args, status: 'FAILED', objectId: null, latencyMs: Date.now() - st, warnings: [], error: redact((e as Error).message) });
        }
      }
      tr.objects = objects.map((o) => ({ id: o.id, type: o.type, title: o.title, facts: o.facts.length }));
      if (!objects.length) { notes.push('The planned tools did not produce a financial object.'); return finish('ERROR'); }

      /* ---- 6. explain: the model narrates the facts; grounding rejects any number it did not receive ---- */
      let narrative = deterministicNarrative(objects);
      tr.narrative.source = 'deterministic';
      if (this.mode === 'reasoning' && !overBudget()) {
        const payload = objects.map((o) => ({ objectId: o.id, type: o.type, title: o.title, facts: o.facts.map((f) => ({ key: `${o.id}.${f.key}`, label: f.label, display: f.display })) }));
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

      session.ctx = this.context.commitShown(session.ctx);
      if (tr.limitsReached.length) notes.push(`Limit reached: ${tr.limitsReached.join(', ')}.`);
      return finish('ANSWER', { objects, narrative: narrative.map((n) => ({ text: n.text, objectIds: n.objectIds })) });
    } catch (e) {
      tr.errors.push(redact((e as Error).message ?? String(e)));
      return finish('ERROR', { notes: ['Sloane could not complete this request.'] });
    }
  }

  /** A pending question is answered by its option id, or by typing the option's label. */
  private matchClarification(s: Session, c: unknown, request: string): string | null {
    const P = s.pending;
    if (!P) return null;
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      if (o['pendingId'] !== P.id) return null;
      return P.options.find((x) => x.id === o['optionId'])?.id ?? null;
    }
    const t = request.toLowerCase();
    if (!t) return null;
    const hit = P.options.filter((x) => x.label.toLowerCase() === t || (t.length >= 4 && x.label.toLowerCase().includes(t)));
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
