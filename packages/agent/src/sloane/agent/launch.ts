/**
 * A4 §17 — THE PRODUCT ACTION ENTRY POINT.
 *
 * One contract every Korvyn surface uses to put an agent to work on the governed object a person is looking at.
 * Without it each module writes its own invocation, and the things that must be identical everywhere — what
 * context may travel, who the actor is, which profile may be asked for, how the origin is recorded — become five
 * slightly different answers.
 *
 * IT IS A CONTRACT, NOT A RUNTIME. Every launch goes through `AgentService.start`, which goes through
 * `AgentRuntime.start`: the same classification, the same profile selection, the same authorization, the same
 * budget, the same durable record, the same trace. A module cannot reach past it to the runtime, and there is
 * nothing here a module could set that would change how a run executes.
 *
 * §6 — CONTEXT IS AVAILABLE, NOT IMPOSED. This is the rule the contract exists to keep. A module hands over the
 * GOVERNED REFERENCES the action is about and the finance context they sit in, and nothing else: no selected DOM
 * text, no page-state dump, no UI internals, no unrelated filters. `sanitize()` is where that is enforced rather
 * than asked for — an unknown ref type is dropped, a label is truncated, and a payload that arrived with more
 * than the contract allows is cut down before the runtime ever sees it. The reason is not tidiness: the pre-8A
 * behaviour of injecting page state wholesale into every model call is what made runs expensive, unfocused and
 * impossible to reason about, and a module entry point is exactly where it would come back.
 *
 * §17 — A MODULE MAY NOT CHOOSE A MODEL. There is no provider, model, route or budget field on the request, and
 * adding one would be a product decision, not a convenience. A module may state a PREFERRED PROFILE where product
 * policy determines it (a Close page launching Close work), and that preference is capped by the actor's own
 * authority exactly as a conversational one is.
 */
import type { Actor } from '../tools.js';
import type { ObjectRef, ProfileId } from './model.js';
import { POLICY_PROFILES } from './model.js';
import type { AgentService, RunOrigin, StartResult } from './service.js';

/** the actions a surface may offer. A verb the product shows on a button, not a capability and not a plan. */
export const LAUNCH_ACTIONS = ['INVESTIGATE', 'EXPLAIN', 'PREPARE', 'REVIEW', 'ASK'] as const;
export type LaunchAction = (typeof LAUNCH_ACTIONS)[number];

/**
 * The governed reference types a module may hand over. A closed list, because it is the boundary: anything not
 * named here is not a governed object this contract can carry, and passing it would be passing UI state.
 */
export const LAUNCH_REF_TYPES = [
  'reconciliation', 'flux', 'account', 'financialLine', 'entity', 'project', 'vendor', 'closeTask',
  'population', 'evidence', 'pbcRequest', 'artifact', 'report', 'analysis', 'issue',
] as const;

const MAX_REFS = 8;
const MAX_LABEL = 120;
const MAX_OBJECTIVE = 400;

/** where the person was, and which governed objects they had in front of them */
export interface ModuleContext {
  /** the product surface, for the trace and for nothing else */
  module: string;
  /** the governed objects the action is about — the whole of what travels */
  objectRefs: ObjectRef[];
  period?: string | null;
  periodRange?: { start: string; end: string } | null;
  scope?: string | null;
  book?: string | null;
  basis?: string | null;
  lens?: string | null;
}

export interface LaunchRequest {
  action: LaunchAction;
  /** what to do, in the person's or the product's words. Composed from the action and the object when absent. */
  objective?: string;
  context: ModuleContext;
  /** the conversation this belongs to, when a surface has one — the run and the conversation stay separate objects */
  sessionId?: string;
  /** product policy may prefer a profile; the actor's authority still caps it */
  profile?: ProfileId;
  /** a surface that may fire twice (a double click, a retried request) passes the same handle */
  externalRef?: string;
  origin?: RunOrigin;
}

export interface LaunchResult {
  ok: boolean;
  runId?: string;
  objective?: string;
  reason?: string;
  /** what the contract actually let through, so a caller can see what was dropped rather than guess */
  carried?: { refs: ObjectRef[]; period: string | null; scope: string | null; dropped: string[] };
}

/* ================================================================================================
   SANITIZING — the §6 rule, enforced rather than requested
   ================================================================================================ */
export function sanitize(c: ModuleContext): { context: ModuleContext; dropped: string[] } {
  const dropped: string[] = [];
  const seen = new Set<string>();
  const refs: ObjectRef[] = [];
  for (const r of Array.isArray(c.objectRefs) ? c.objectRefs : []) {
    if (!r || typeof r.type !== 'string' || typeof r.id !== 'string' || !r.id.trim()) { dropped.push('a reference with no governed id'); continue; }
    if (!(LAUNCH_REF_TYPES as readonly string[]).includes(r.type)) { dropped.push(`${r.type} is not a governed reference type`); continue; }
    const k = `${r.type}:${r.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (refs.length >= MAX_REFS) { dropped.push(`more than ${MAX_REFS} references`); break; }
    refs.push({ type: r.type, id: r.id.slice(0, MAX_LABEL), ...(r.label ? { label: String(r.label).replace(/\s+/g, ' ').slice(0, MAX_LABEL) } : {}) });
  }
  const period = typeof c.period === 'string' && /^\d{4}-\d{2}$/.test(c.period) ? c.period : null;
  if (c.period && !period) dropped.push('a period that is not a governed month');
  const range = c.periodRange && /^\d{4}-\d{2}$/.test(c.periodRange.start ?? '') && /^\d{4}-\d{2}$/.test(c.periodRange.end ?? '')
    ? { start: c.periodRange.start, end: c.periodRange.end } : null;
  const str = (v: unknown, what: string) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string' || v.length > MAX_LABEL) { dropped.push(`${what} was not a short governed value`); return null; }
    return v;
  };
  return {
    context: {
      module: String(c.module ?? 'unknown').replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 40) || 'unknown',
      objectRefs: refs, period, periodRange: range,
      scope: str(c.scope, 'scope'), book: str(c.book, 'book'), basis: str(c.basis, 'basis'), lens: str(c.lens, 'lens'),
    },
    dropped,
  };
}

/* ================================================================================================
   THE OBJECTIVE — composed from the object, so nobody restates what they are already looking at
   ================================================================================================ */
const VERB: Record<LaunchAction, string> = {
  INVESTIGATE: 'Investigate', EXPLAIN: 'Explain', PREPARE: 'Prepare what is needed for', REVIEW: 'Review', ASK: 'Look at',
};
const NOUN: Record<string, string> = {
  reconciliation: 'reconciliation', flux: 'flux line', account: 'account', financialLine: 'financial statement line',
  entity: 'entity', project: 'project', vendor: 'vendor', closeTask: 'close task', population: 'population',
  evidence: 'evidence item', pbcRequest: 'PBC request', artifact: 'workbook', report: 'report', analysis: 'analysis', issue: 'issue',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1] ?? p.slice(5, 7)} ${p.slice(0, 4)}`;

/**
 * §12 — THE PERSON DOES NOT RESTATE WHAT THEY ARE LOOKING AT. A module knows the object's governed label and its
 * period; the objective is written from those, so "Investigate" on a selected reconciliation becomes an objective
 * that names it. The label comes from the governed record, never from the screen.
 */
export function launchObjective(req: LaunchRequest): string {
  if (req.objective?.trim()) return req.objective.trim().slice(0, MAX_OBJECTIVE);
  const { context } = sanitize(req.context);
  const r = context.objectRefs[0];
  const what = r ? `the ${r.label ?? r.id} ${NOUN[r.type] ?? r.type}` : 'this';
  const others = context.objectRefs.length > 1 ? ` and ${context.objectRefs.length - 1} related item${context.objectRefs.length > 2 ? 's' : ''}` : '';
  const when = context.period ? ` for ${month(context.period)}`
    : context.periodRange ? ` for ${month(context.periodRange.start)} to ${month(context.periodRange.end)}` : '';
  return `${VERB[req.action]} ${what}${others}${when}.`.replace(/\s+/g, ' ').slice(0, MAX_OBJECTIVE);
}

/* ================================================================================================
   THE LAUNCHER
   ================================================================================================ */
export class AgentLaunch {
  constructor(private readonly service: AgentService) {}

  /**
   * Start a run from a product surface. The actor comes from the authenticated session and never from the
   * request: a module asking on someone's behalf is a governed-service-identity question this prototype does not
   * answer, and it is not answered here by trusting a caller.
   */
  launch(actor: Actor, req: LaunchRequest): LaunchResult {
    if (!(LAUNCH_ACTIONS as readonly string[]).includes(req.action)) return { ok: false, reason: `${String(req.action)} is not an action a surface may launch.` };
    if (req.profile && !POLICY_PROFILES[req.profile]) return { ok: false, reason: `No such agent profile: ${req.profile}` };
    const { context, dropped } = sanitize(req.context);
    const objective = launchObjective({ ...req, context });
    if (objective.length < 8) return { ok: false, reason: 'A launch needs an objective or a governed object to act on.' };

    const out: StartResult = this.service.start(actor, {
      objective,
      origin: req.origin ?? 'MODULE',
      ...(context.objectRefs.length ? { refs: context.objectRefs } : {}),
      ...(req.profile ? { profile: req.profile } : {}),
      ...(req.sessionId ? { sessionId: req.sessionId } : {}),
      ...(req.externalRef ? { externalRef: req.externalRef } : {}),
      launchedFrom: {
        module: context.module, action: req.action,
        object: context.objectRefs[0] ? `${context.objectRefs[0].type}:${context.objectRefs[0].id}` : null,
        period: context.period ?? null, scope: context.scope ?? null, lens: context.lens ?? null, basis: context.basis ?? null,
      },
    });
    if (!out.ok) return { ok: false, reason: out.reason };
    return { ok: true, runId: out.runId, objective, carried: { refs: context.objectRefs, period: context.period ?? null, scope: context.scope ?? null, dropped } };
  }
}
