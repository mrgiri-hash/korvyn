/**
 * A2 §15 — THE NON-CONVERSATIONAL ENTRY POINT.
 *
 * A1 made headless execution possible (the runtime depends on a host port, not on a conversation) and proved it in
 * a test, but nothing could actually start a run except a person typing at Sloane. This is the smallest internal
 * service that closes that: one function a module action, a scheduler, a workflow step or an API handler calls.
 *
 * IT IS NOT A PUBLIC API AND NOT A SECOND RUNTIME PATH. It is the same `AgentRuntime.start`, the same profile
 * selection, the same authorization, the same budget, the same durable record and the same trace — which is the
 * point of having it: proving that "launched from a scheduler" and "typed into Sloane" differ only in who calls,
 * never in what happens afterwards.
 *
 * THE CALLER SUPPLIES THE ACTOR AND CANNOT INVENT ONE. `Actor` comes from an authenticated session or from the
 * server's own configured identity; every capability check downstream is against it. A scheduler running "as"
 * somebody is a governed-service-identity question this prototype does not answer, and it is not answered here
 * by letting a caller pass any id it likes: an out-of-scope request is refused by the same gates as any other.
 */
import type { Actor } from '../tools.js';
import type { AgentRunBody, ObjectRef, OutcomeClass, ProfileId } from './model.js';
import type { AgentRuntime, RunView } from './runtime.js';
import { agentTelemetry, type AgentTelemetry, type KorvynTrace } from '../trace.js';
import { POLICY_PROFILES } from './model.js';

/** where a run came from — recorded so an operator can tell a scheduled run from one a person asked for */
export type RunOrigin = 'CONVERSATION' | 'MODULE' | 'SCHEDULE' | 'WORKFLOW' | 'API';

export interface StartRequest {
  /** the objective, in the caller's own words — kept verbatim, exactly as a typed one is */
  objective: string;
  origin: RunOrigin;
  /**
   * A2 §5 — a caller that KNOWS what kind of work this is may say so, and Korvyn still caps it by the actor's
   * authority. A caller that does not leaves it out and the objective is classified as usual.
   */
  profile?: ProfileId;
  outcome?: OutcomeClass;
  /** A2 §7 — what the run is about, as governed object references */
  refs?: ObjectRef[];
  /** an idempotency-ish handle for a scheduler that may fire twice; a run already started under it is returned */
  externalRef?: string;
}
export type StartResult = { ok: true; runId: string; run: RunView } | { ok: false; reason: string };

export class AgentService {
  private readonly byRef = new Map<string, string>();
  constructor(private readonly runtime: AgentRuntime) {}

  /**
   * Start a run with no conversation. The session id is the RUN's own — a headless run is its own context, and
   * nothing about it reads or writes a conversation's transcript.
   */
  start(actor: Actor, req: StartRequest): StartResult {
    const objective = (req.objective ?? '').trim();
    if (objective.length < 8) return { ok: false, reason: 'An objective needs to say what work to carry through.' };
    if (req.profile && !POLICY_PROFILES[req.profile]) return { ok: false, reason: `No such agent profile: ${req.profile}` };
    if (req.externalRef) {
      const seen = this.byRef.get(`${actor.id}|${req.externalRef}`);
      if (seen) { const v = this.runtime.get(seen, actor); if (v) return { ok: true, runId: seen, run: v }; }
    }
    const out = this.runtime.start(actor, objective.slice(0, 1000), {
      ...(req.profile ? { profile: req.profile } : {}),
      ...(req.outcome ? { outcome: req.outcome } : {}),
      ...(req.refs?.length ? { refs: req.refs.slice(0, 20) } : {}),
    });
    if (!out.ok) return out;
    /* the origin is recorded on the run's own event log, so a trace says where the work came from */
    this.runtime.note(out.run.runId, 'ORIGIN', `Started by ${req.origin}${req.externalRef ? ` (ref ${req.externalRef})` : ''}`);
    if (req.externalRef) this.byRef.set(`${actor.id}|${req.externalRef}`, out.run.runId);
    return { ok: true, runId: out.run.runId, run: this.runtime.view(out.run) };
  }

  /** the same view, trace and telemetry a conversational run has — one contract, whoever started it */
  get(runId: string, actor: Actor): RunView | null { return this.runtime.get(runId, actor); }
  body(runId: string, actor: Actor): AgentRunBody | null { return this.runtime.body(runId, actor); }
  list(actor: Actor) { return this.runtime.list(actor); }
  trace(runId: string, actor: Actor): KorvynTrace | null { return this.runtime.traceOf(runId, actor); }
  telemetry(runId: string, actor: Actor): AgentTelemetry | null {
    const b = this.runtime.body(runId, actor);
    return b ? agentTelemetry(b) : null;
  }
  cancel(runId: string, actor: Actor, reason?: string) { return this.runtime.cancel(runId, actor, reason ?? 'Cancelled by the caller'); }
  /** wait for the run to stop advancing — for a caller that wants the result in-process (a test, a CLI) */
  wait(runId: string, ms: number) { return this.runtime.wait(runId, ms); }
}
