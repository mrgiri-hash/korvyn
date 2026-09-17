/**
 * KORVYN DOMAIN API — what the Reconciliations, Flux and Close modules (and any other client) use to read and change
 * the SAME governed work Sloane reads and changes. One book: a comment written here is the comment Sloane reads, and a
 * comment Sloane writes is the comment these endpoints return.
 *
 * Domain actions, not CRUD. There is no generic "update record" route. Every write:
 *   - takes its actor from the authenticated session (never from the body),
 *   - checks a capability and the resource's entity through AuthorizationService,
 *   - is idempotent on a client idempotency key (a retry returns the recorded result),
 *   - checks the expected version when the client sends one (STALE_PROPOSAL on a mismatch),
 *   - writes the domain record, the append-only AuditEvent (source UI) and the idempotency key in one transaction.
 */
import { AuthorizationService, type ActorContext, type Capability } from './auth.js';
import { StaleVersionError } from './persistence/repositories.js';
import type { SloaneOrchestrator } from './orchestrator.js';
import { WORK } from './store.js';

export type ApiResult = { status: number; body: unknown };
const forbid = (reason: string): ApiResult => ({ status: 403, body: { error: 'FORBIDDEN', reason } });
const bad = (reason: string): ApiResult => ({ status: 400, body: { error: 'BAD_REQUEST', reason } });

/** the browser Flux statement lines that roll up the server book's account groups (a navigation crosswalk, not a mapping) */
export const FLUX_LINE_ACCOUNTS: Record<string, string[]> = {
  cash: ['10000'], ar: ['11000'], otherca: ['12000'], recost: ['15000', '16000'], accumdep: ['17000'], intang: ['18000'], othera: ['13000', '19000'],
  ap: ['20000'], accrued: ['21000'], reten: ['22000'], defrev: ['24000'], debt: ['25000'], otherl: ['23000', '26000'],
};

export class WorkApi {
  constructor(private readonly orch: SloaneOrchestrator) {}
  private get period() { return this.orch.data.workingPeriod(); }
  private need(actor: ActorContext, cap: Capability, entity: string | null, kind: string): ApiResult | null {
    const d = AuthorizationService.can(actor, cap, { entity, kind });
    return d.allowed ? null : forbid(d.reason);
  }

  /* ---- reconciliations -------------------------------------------------------------------------- */
  reconciliationWorkflow(actor: ActorContext, defId: string, period = this.period): ApiResult {
    const def = this.orch.controls.recDef(defId);
    if (!def) return { status: 404, body: { error: 'NOT_FOUND', reason: `No reconciliation ${defId}` } };
    const denied = this.need(actor, 'RECON_VIEW', def.entity, 'reconciliation'); if (denied) return denied;
    const r = this.orch.controls.reconcile(def, period);
    return { status: 200, body: {
      definition: { id: def.id, name: def.name, entity: def.entity, catalog: def.method === 'MODULE' ? 'MODULE' : 'GL', financialLineId: def.financialLineId ?? null },
      period, status: r.workflow.status, preparer: r.workflow.preparer, reviewer: r.workflow.reviewer, threadVersion: r.workflow.threadVersion,
      comments: r.workflow.comments, support: r.support, attachedEvidence: r.attachedEvidence,
      balances: r.balanceInModule ? { computedIn: 'RECONCILIATIONS_MODULE' } : { glBalanceUsd: r.glBalanceUsd, differenceUsd: r.differenceUsd, tieStatus: r.tieStatus, reconcilingItems: r.items },
      canComment: AuthorizationService.can(actor, 'RECON_COMMENT', { entity: def.entity }).allowed && r.workflow.status !== 'APPROVED',
    } };
  }
  addReconciliationComment(actor: ActorContext, defId: string, body: Record<string, unknown>): ApiResult {
    const def = this.orch.controls.recDef(defId);
    if (!def) return { status: 404, body: { error: 'NOT_FOUND', reason: `No reconciliation ${defId}` } };
    const period = typeof body['period'] === 'string' ? body['period'] : this.period;
    const denied = this.need(actor, 'RECON_COMMENT', def.entity, 'reconciliation'); if (denied) return denied;
    if (this.orch.controls.reconcile(def, period).workflow.status === 'APPROVED') return forbid('Target closed: the reconciliation is approved and closed to comments.');
    return this.comment(actor, `recon:${def.id}:${period}`, `Reconciliation · ${def.name}`, 'ADD_RECONCILIATION_COMMENT', body);
  }

  /* ---- flux --------------------------------------------------------------------------------------- */
  fluxWorkflow(actor: ActorContext, account: string, period = this.period): ApiResult {
    const denied = this.need(actor, 'FLUX_VIEW', null, 'flux'); if (denied) return denied;
    const item = this.orch.controls.fluxItems(period, actor.entityAccess === 'ALL' ? 'ALL' : new Set(actor.entityAccess)).find((i) => i.account === account);
    if (!item) return { status: 404, body: { error: 'NOT_FOUND', reason: `No flux line ${account} in ${period}` } };
    return { status: 200, body: { item: { id: item.id, account: item.account, name: item.name, period, material: item.material, status: item.status, changeUsd: item.changeUsd, explanation: item.explanation }, reviewer: item.reviewer, threadVersion: item.threadVersion, comments: item.comments, attachedEvidence: item.attachedEvidence, canComment: AuthorizationService.can(actor, 'FLUX_COMMENT').allowed } };
  }
  /** the comments on the server flux lines a browser Flux statement line rolls up */
  fluxLineComments(actor: ActorContext, lineId: string, period = this.period): ApiResult {
    const denied = this.need(actor, 'FLUX_VIEW', null, 'flux'); if (denied) return denied;
    const accounts = FLUX_LINE_ACCOUNTS[lineId] ?? [];
    const items = this.orch.controls.fluxItems(period, actor.entityAccess === 'ALL' ? 'ALL' : new Set(actor.entityAccess)).filter((i) => accounts.includes(i.account));
    return { status: 200, body: { lineId, period, accounts, comments: items.flatMap((i) => i.comments.map((c) => ({ ...c, account: i.account, accountName: i.name }))).sort((a, b) => a.at.localeCompare(b.at)), attachedEvidence: items.flatMap((i) => i.attachedEvidence), canComment: AuthorizationService.can(actor, 'FLUX_COMMENT').allowed } };
  }
  addFluxComment(actor: ActorContext, account: string, body: Record<string, unknown>): ApiResult {
    const period = typeof body['period'] === 'string' ? body['period'] : this.period;
    const denied = this.need(actor, 'FLUX_COMMENT', null, 'flux'); if (denied) return denied;
    if (!this.orch.controls.fluxItems(period, 'ALL').some((i) => i.account === account)) return { status: 404, body: { error: 'NOT_FOUND', reason: `No flux line ${account} in ${period}` } };
    return this.comment(actor, `flux:${account}:${period}`, `Flux review · ${account}`, 'ADD_FLUX_COMMENT', body);
  }

  /** one UI comment write: idempotent, version-checked, audited, in one transaction */
  private comment(actor: ActorContext, key: string, label: string, action: string, body: Record<string, unknown>): ApiResult {
    const text = typeof body['text'] === 'string' ? body['text'].trim() : '';
    const idem = typeof body['idempotencyKey'] === 'string' ? body['idempotencyKey'].slice(0, 80) : '';
    if (!text) return bad('text is required');
    if (text.length > 2000) return bad('text is longer than 2,000 characters');
    if (!idem) return bad('idempotencyKey is required for a write');
    const repKey = `UI:${actor.id}:${idem}`;
    const prior = WORK.repos.idempotency.get<ApiResult>(repKey);
    if (prior) return prior;
    const expected = typeof body['expectedThreadVersion'] === 'number' ? body['expectedThreadVersion'] : null;
    try {
      const out = WORK.repos.database.tx(() => {
        const before = WORK.thread(key);
        const c = WORK.addComment(key, text, { id: actor.id, name: actor.name }, { via: null, source: 'UI', expectedThreadVersion: expected, investigationId: null });
        const ev = WORK.repos.audit.append({ actor: { id: actor.id, name: actor.name, role: actor.role }, source: 'UI', action, target: { id: key, type: key.startsWith('flux:') ? 'FLUX_ITEM' : 'RECONCILIATION', label }, beforeRef: key, afterRef: c.id,
          before: { threadVersion: before.version, comments: before.comments.length }, after: { commentId: c.id, version: c.version, text }, investigationId: null, executionTraceId: null, proposalId: null,
          confirmation: { confirmedBy: actor.name, at: new Date().toISOString(), requestId: idem }, financialObjectIds: [], populationIds: [], evidenceIds: [], outcome: 'COMPLETED', error: null });
        const res: ApiResult = { status: 201, body: { comment: c, threadVersion: WORK.thread(key).version, auditEventId: ev.eventId } };
        WORK.repos.idempotency.put(repKey, 'UI_WRITE', actor.id, res);
        return res;
      });
      return out;
    } catch (e) {
      if (e instanceof StaleVersionError) return { status: 409, body: { error: 'STALE_PROPOSAL', reason: e.message, currentVersion: e.current } };
      throw e;
    }
  }

  /* ---- close, evidence, work objects (read) ------------------------------------------------------ */
  close(actor: ActorContext, period = this.period): ApiResult {
    const denied = this.need(actor, 'CLOSE_VIEW', null, 'close'); if (denied) return denied;
    const vis = actor.entityAccess === 'ALL' ? 'ALL' : new Set(actor.entityAccess);
    const r = this.orch.controls.closeReadiness(period, vis);
    return { status: 200, body: { period, readinessPct: r.readinessPct, parts: r.parts, blockers: r.blockers, tasks: this.orch.controls.closeTasks(period, vis), approvals: this.orch.controls.pendingApprovals(period, vis), exceptions: this.orch.controls.continuousCloseSignals(period, vis) } };
  }
  evidence(actor: ActorContext, target: string): ApiResult {
    const denied = this.need(actor, 'EVIDENCE_VIEW', null, 'evidence'); if (denied) return denied;
    return { status: 200, body: { target, relationships: WORK.relsTo(target), attachments: WORK.repos.evidence.attachmentsTo(target) } };
  }
  savedObjects(actor: ActorContext, kind: string): ApiResult {
    const map: Record<string, ['ANALYSIS' | 'REPORT' | 'EXCEL' | 'PACKAGE', Capability]> = { analyses: ['ANALYSIS', 'GL_VIEW'], reports: ['REPORT', 'REPORT_VIEW'], artifacts: ['EXCEL', 'GL_VIEW'], packages: ['PACKAGE', 'EVIDENCE_VIEW'] };
    const m = map[kind]; if (!m) return { status: 404, body: { error: 'NOT_FOUND' } };
    const denied = this.need(actor, m[1], null, kind); if (denied) return denied;
    return { status: 200, body: { kind, items: WORK.repos.saved.list(m[0]).filter((x) => x.createdBy === actor.id || x.sharedWith.includes(actor.id)) } };
  }
  issues(actor: ActorContext): ApiResult {
    const denied = this.need(actor, 'GL_VIEW', null, 'issues'); if (denied) return denied;
    return { status: 200, body: { items: WORK.repos.issues.list() } };
  }
}
