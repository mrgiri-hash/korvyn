/**
 * THE ENTERPRISE FINANCIAL CONTEXT and THE CONTEXT ASSEMBLER (Phase 8A).
 *
 * EnterpriseFinancialContext is what a turn is ABOUT, stated in governed terms: who is asking and what they may do,
 * the period against the fiscal calendar, the scope within the entity hierarchy, the lens, basis and currency, the
 * object in focus, the workflow owner and reviewer, the planning version (actuals — the only one held), and what is
 * active (population, artifact, investigation, PBC request). Every field says where it came from.
 *
 * The ContextAssembler hands the model the RELEVANT NEIGHBOURHOOD of that context, never the graph: the objects the
 * request names or the conversation is on, one hop of their governed relationships, capped (MAX_OBJECTS objects,
 * MAX_RELATIONS relations), from the ACTOR's snapshot — so nothing the actor may not see can reach a prompt. It carries
 * identities and relationships only; figures stay with the governed tools.
 */
import type { Actor } from '../tools.js';
import { periodLabel } from '../financials.js';
import type { Relation, SemanticObject } from './model.js';
import { type FinancialGraph, type Snapshot } from './graph.js';
import { type PeriodResolution, fiscalFrame, resolvePeriods } from './time.js';

export const MAX_OBJECTS = 24;
export const MAX_RELATIONS = 40;

type Src = 'EXPLICIT' | 'INHERITED' | 'DERIVED' | 'DEFAULTED' | 'UNKNOWN';
interface Field<T> { value: T; source: Src }
export interface EnterpriseFinancialContext {
  user: { id: string; name: string; role: string; title: string | null };
  permissions: { capabilities: string[]; entityAccess: 'ALL' | string[] };
  period: Field<{ id: string; label: string; status: string }>;
  fiscal: ReturnType<typeof fiscalFrame>;
  comparison: Field<{ id: string; label: string } | null>;
  scope: Field<{ id: string; label: string; kind: string; path: string[]; consolidationNode: string | null }>;
  lens: { id: string; label: string; basis: string; currency: string };
  object: Field<{ id: string; type: string; label: string } | null>;
  accountOrLine: { id: string; label: string } | null;
  workflow: { owner: string | null; preparer: string | null; reviewer: string | null } | null;
  planning: { version: 'ACTUAL'; scenario: null; note: string };
  active: { populationId: string | null; artifactId: string | null; investigationId: string | null; pbcRequestId: string | null };
}

/** the slice of the orchestrator's session context the assembler reads (kept structural to avoid an import cycle) */
export interface SessionLike {
  period: { value: string; source: string };
  comparisonPeriod: { value: string | null; source: string };
  scope: { value: string; source: string };
  focus: { value: { kind: string; id: string; name: string } | null; source: string };
  populationId: { value: string | null; source: string };
  lastRefs: Record<string, string>;
}

/** a conversation focus → its semantic id */
export function focusToSemantic(f: { kind: string; id: string } | null, period: string): string | null {
  if (!f) return null;
  const k = f.kind, id = f.id.includes(':') && !f.id.startsWith('FLUX-') ? f.id.slice(f.id.indexOf(':') + 1) : f.id;
  const m: Record<string, string> = { account: `account:${id}`, reconciliation: `recon:${id}`, fluxItem: `flux:${id}`, report: `report:${id}`, vendor: `vendor:${id}`, project: `project:${id}`, entity: `entity:${id}`, close: `close:${period}`, pbc: `pbc:${id}`, statement: id.startsWith('FS-') ? `fs:${id}` : `fs:FS-IS` };
  return m[k] ?? null;
}

export class ContextAssembler {
  constructor(private readonly graph: FinancialGraph) {}

  /** §5 — the enterprise financial context of a turn */
  context(actor: Actor, c: SessionLike, extra: { investigationId?: string | null } = {}): EnterpriseFinancialContext {
    const g = this.graph, s = g.snapshot(actor, c.period.value), p = s.period, d = { periods: g.d.gl.periods(), workingPeriod: g.d.data.workingPeriod() };
    const me = s.nodes.get(`person:${actor.id}`);
    const scopeNode = c.scope.value === 'GROUP' ? s.nodes.get('consol:GROUP') : s.nodes.get(`entity:${c.scope.value}`);
    const path: string[] = [];
    for (let cur = scopeNode; cur && path.length < 6; ) { path.unshift(cur.label); const e = (s.out.get(cur.id) ?? []).find((x) => x.rel === 'CHILD_OF'); cur = e ? s.nodes.get(e.to) : undefined; }
    const consol = scopeNode ? (s.out.get(scopeNode.id) ?? []).find((e) => e.rel === 'INCLUDED_IN')?.to ?? (scopeNode.type === 'ConsolidationNode' ? scopeNode.id : null) : null;
    const fid = focusToSemantic(c.focus.value, p), fo = fid ? s.nodes.get(fid) ?? null : null;
    const people = fo ? g.responsible(fo.id, actor, p) : [];
    const pick = (r: string) => people.find((x) => x.relation === r)?.person.label ?? null;
    const acct = fo && (fo.type === 'Account' || fo.type === 'FinancialStatementLine') ? fo : fo ? [...(s.inn.get(fo.id) ?? [])].map((e) => s.nodes.get(e.from)!).find((o) => o.type === 'Account') ?? null : null;
    return {
      user: { id: actor.id, name: me?.label ?? actor.name, role: actor.role, title: (me?.attrs['title'] as string | undefined) ?? null },
      permissions: { capabilities: actor.permissions, entityAccess: actor.scopeIds },
      period: { value: { id: p, label: periodLabel(p), status: fiscalFrame(p, d).status }, source: src(c.period.source) },
      fiscal: fiscalFrame(p, d),
      comparison: { value: c.comparisonPeriod.value ? { id: c.comparisonPeriod.value, label: periodLabel(c.comparisonPeriod.value) } : null, source: src(c.comparisonPeriod.source) },
      scope: { value: { id: c.scope.value, label: scopeNode?.label ?? c.scope.value, kind: scopeNode?.type ?? 'UNKNOWN', path, consolidationNode: consol }, source: src(c.scope.source) },
      lens: { id: 'lens:CORPORATE', label: 'Corporate Consolidated', basis: 'US GAAP', currency: 'USD' },
      object: { value: fo ? { id: fo.id, type: fo.type, label: fo.label } : null, source: fo ? src(c.focus.source) : 'UNKNOWN' },
      accountOrLine: acct ? { id: acct.id, label: acct.label } : null,
      workflow: fo ? { owner: pick('OWNER'), preparer: pick('PREPARER'), reviewer: pick('REVIEWER') } : null,
      planning: { version: 'ACTUAL', scenario: null, note: 'The server book holds actuals only; no budget, forecast or scenario is governed.' },
      active: { populationId: c.populationId.value, artifactId: c.lastRefs['artifactId'] ?? null, investigationId: extra.investigationId ?? null, pbcRequestId: c.lastRefs['pbcRequestId'] ?? null },
    };
  }

  /** §15 — the neighbourhood the model sees for THIS request: named objects, the focus, one hop of each, capped */
  neighborhood(actor: Actor, request: string, c: SessionLike) {
    const g = this.graph, s = g.snapshot(actor, c.period.value), p = s.period;
    const d = { periods: g.d.gl.periods(), workingPeriod: g.d.data.workingPeriod() };
    const mentioned = g.mentions(request, actor, p);
    const seeds: string[] = [];
    const ambiguous: { term: string; candidates: { id: string; type: string; label: string; detail: string }[] }[] = [];
    for (const m of mentioned) {
      if (m.ids.length === 1) seeds.push(m.ids[0]!);
      else ambiguous.push({ term: m.term, candidates: m.ids.map((i) => { const o = s.nodes.get(i)!; return { id: o.id, type: o.type, label: o.label, detail: g.describe(o) }; }) });
    }
    const fid = focusToSemantic(c.focus.value, p);
    if (fid && s.nodes.has(fid) && !seeds.includes(fid)) seeds.push(fid);
    for (const [k, pre] of [['reconciliationId', 'recon:'], ['account', 'account:'], ['pbcRequestId', 'pbc:']] as const) { const v = c.lastRefs[k]; if (v && s.nodes.has(pre + v) && !seeds.includes(pre + v)) seeds.push(pre + v); }
    const objects = new Map<string, SemanticObject>(), relations: [string, Relation, string][] = [];
    seeds.slice(0, 6).forEach((id) => objects.set(id, s.nodes.get(id)!));
    const per = Math.max(4, Math.floor(MAX_RELATIONS / Math.max(1, Math.min(seeds.length, 6))));
    for (const id of seeds.slice(0, 6)) {
      const edges = [...(s.out.get(id) ?? []), ...(s.inn.get(id) ?? [])].sort((a, b) => weight(a.rel, s, a, id) - weight(b.rel, s, b, id)).slice(0, per);
      for (const e of edges) {
        if (relations.length >= MAX_RELATIONS) break;
        const other = e.from === id ? e.to : e.from;
        if (!objects.has(other)) { if (objects.size >= MAX_OBJECTS) continue; objects.set(other, s.nodes.get(other)!); }
        relations.push([e.from, e.rel, e.to]);
      }
    }
    const periods: PeriodResolution[] = resolvePeriods(request, d);
    return {
      period: periodLabel(p),
      objects: [...objects.values()].map(compact),
      relations,
      ambiguous,
      periods: periods.map((r) => ({ term: r.term, label: r.label, kind: r.kind, start: r.start, end: r.end, status: r.status, ...(r.note ? { note: r.note } : {}), ...(r.candidates.length ? { candidates: r.candidates } : {}) })),
      truncated: seeds.length > 6 || relations.length >= MAX_RELATIONS,
    };
  }

  /** what the model is told: the context and the neighbourhood, both from the actor's snapshot */
  forModel(actor: Actor, request: string, c: SessionLike, extra: { investigationId?: string | null } = {}) {
    const ctx = this.context(actor, c, extra), nb = this.neighborhood(actor, request, c);
    return {
      user: { name: ctx.user.name, role: ctx.user.role, title: ctx.user.title, entityAccess: ctx.permissions.entityAccess },
      fiscal: { period: ctx.fiscal.label, status: ctx.fiscal.status, fiscalYear: ctx.fiscal.fiscalYear, quarter: ctx.fiscal.quarter, closePeriod: periodLabel(ctx.fiscal.closePeriod), fiscalYearStartMonth: ctx.fiscal.calendar.fiscalYearStartMonth },
      scope: ctx.scope.value, lens: ctx.lens, focus: ctx.object.value, workflow: ctx.workflow, planning: ctx.planning.version,
      neighborhood: nb,
    };
  }
}

const src = (s: string): Src => (['EXPLICIT', 'INHERITED', 'DERIVED', 'DEFAULTED', 'UNKNOWN'].includes(s) ? s as Src : 'DERIVED');
/** identities and non-figure attributes only; a figure stays with the tool that states it */
function compact(o: SemanticObject) {
  const keep = ['status', 'tieStatus', 'material', 'entity', 'entities', 'method', 'catalog', 'title', 'canReview', 'severity', 'kind', 'parent', 'functionalCurrency', 'isLegalEntity', 'supportComplete', 'balanceAuthoritative', 'note'];
  const attrs = Object.fromEntries(Object.entries(o.attrs).filter(([k, v]) => keep.includes(k) && v !== null && v !== undefined));
  return { id: o.id, type: o.type, label: o.label, ...(Object.keys(attrs).length ? { attrs } : {}), ...(o.governed === false ? { governed: false } : {}), ...(o.tool ? { tool: o.tool.id } : {}) };
}
/** people and workflow first, then structure, then the rest; a figure-bearing child list (tasks, flux items) last */
function weight(rel: Relation, s: Snapshot, e: { from: string; to: string }, id: string) {
  const other = s.nodes.get(e.from === id ? e.to : e.from);
  const base: Partial<Record<Relation, number>> = { PREPARED_BY: 0, REVIEWED_BY: 0, OWNED_BY: 0, APPROVED_BY: 0, HAS_EXPLANATION: 1, RECONCILED_BY: 1, SUPPORTED_BY: 1, CHILD_OF: 2, INCLUDED_IN: 2, BELONGS_TO: 2, MAPPED_FROM: 2, PART_OF: 2, RELATES_TO: 2, HAS_FLUX: 3, HAS_BLOCKER: 3, USES: 3, GOVERNED_BY: 4 };
  return (base[rel] ?? 5) + (other?.type === 'CloseTask' || other?.type === 'Account' ? 2 : 0);
}
