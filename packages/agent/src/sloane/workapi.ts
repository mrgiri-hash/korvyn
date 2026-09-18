/**
 * KORVYN DOMAIN API — what the Flux, Reconciliations, Close and Reporting workspaces use to read and change the SAME
 * governed work Sloane reads and changes (book.ts, store.ts). One book: a comment, a support link, a close task status
 * or a saved report written here is the record Sloane's tools read, and the reverse.
 *
 * Domain actions, not CRUD. Every write goes through ONE pipeline (`write`):
 *   session ActorContext  ->  AuthorizationService (capability + entity)  ->  ActionGovernanceEngine (the action type
 *   must be CONFIRM_REQUIRED; a governed type is refused)  ->  idempotency key  ->  ONE transaction: the domain record
 *   (with its expected version), the append-only AuditEvent (source UI), the idempotency record.
 *
 * Every response carries an `outcome` from one contract:
 *   SUCCESS · VALIDATION_ERROR · PERMISSION_DENIED · STALE_VERSION · CONFLICT · NOT_FOUND · UNAVAILABLE
 * No stack trace or internal message is ever returned; routes.ts maps anything unexpected to UNAVAILABLE.
 */
import { AuthorizationService, type ActorContext, type Capability } from './auth.js';
import { ActionGovernanceEngine } from './actions.js';
import { StaleVersionError } from './persistence/repositories.js';
import type { SloaneOrchestrator } from './orchestrator.js';
import { WORK } from './store.js';
import {
  CLOSE_TASK_STATES, type CloseTaskState, FLUX_LINE_ACCOUNTS, browserDefOf, closeTask, closeTaskView, fluxExplanation, fluxLine, fluxLineAccount, fluxLineComments, fluxLineKey,
  savedReport, savedReports, setCloseTaskState, setFluxExplanation, sloaneShapeOf,
} from './book.js';
import { reconStatement, recordReconStatement } from './controls.js';
import { postSource, syncSourceFeed } from './sourcefeed.js';

export type Outcome = 'SUCCESS' | 'VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'STALE_VERSION' | 'CONFLICT' | 'NOT_FOUND' | 'UNAVAILABLE';
export const HTTP_OF: Record<Outcome, number> = { SUCCESS: 200, VALIDATION_ERROR: 400, PERMISSION_DENIED: 403, STALE_VERSION: 409, CONFLICT: 409, NOT_FOUND: 404, UNAVAILABLE: 503 };
export type ApiResult = { status: number; body: { outcome: Outcome } & Record<string, unknown> };
export const ok = (body: Record<string, unknown> = {}, status = 200): ApiResult => ({ status, body: { outcome: 'SUCCESS', ...body } });
export const fail = (outcome: Exclude<Outcome, 'SUCCESS'>, reason: string, extra: Record<string, unknown> = {}): ApiResult => ({ status: HTTP_OF[outcome], body: { outcome, reason, ...extra } });

/** a domain rule refusing a write (not a crash): surfaced as CONFLICT or VALIDATION_ERROR with its reason */
class DomainRefusal extends Error { constructor(readonly outcome: 'CONFLICT' | 'VALIDATION_ERROR' | 'NOT_FOUND', message: string) { super(message); } }

const str = (b: Record<string, unknown>, k: string, max = 2000) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : '');
const num = (b: Record<string, unknown>, k: string) => (typeof b[k] === 'number' && Number.isFinite(b[k]) ? (b[k] as number) : null);

export class WorkApi {
  constructor(private readonly orch: SloaneOrchestrator) {}
  private get period() { return this.orch.data.workingPeriod(); }
  private vis(actor: ActorContext) { return actor.entityAccess === 'ALL' ? 'ALL' as const : new Set(actor.entityAccess); }
  private need(actor: ActorContext, cap: Capability, entity: string | null, kind: string): ApiResult | null {
    const d = AuthorizationService.can(actor, cap, { entity, kind });
    return d.allowed ? null : fail('PERMISSION_DENIED', d.reason, { capability: cap });
  }

  /** THE write pipeline. Nothing in the workspaces reaches a repository any other way. */
  private write(actor: ActorContext, body: Record<string, unknown>, spec: {
    action: string; capability: Capability; entity: string | null; kind: string;
    target: { id: string; type: string; label: string };
    run: () => { before: unknown; after: unknown; afterRef: string | null; result: Record<string, unknown> };
  }): ApiResult {
    const denied = this.need(actor, spec.capability, spec.entity, spec.kind); if (denied) return denied;
    if (ActionGovernanceEngine.classify(spec.action) !== 'CONFIRM_REQUIRED') return fail('PERMISSION_DENIED', `${spec.action} is a governed action and is not available in this phase.`);
    const idem = str(body, 'idempotencyKey', 80);
    if (!idem) return fail('VALIDATION_ERROR', 'idempotencyKey is required for a write');
    const repKey = `UI:${actor.id}:${idem}`;
    const prior = WORK.repos.idempotency.get<ApiResult>(repKey);
    if (prior) return prior;
    try {
      return WORK.repos.database.tx(() => {
        const r = spec.run();
        const ev = WORK.repos.audit.append({ actor: { id: actor.id, name: actor.name, role: actor.role }, source: 'UI', action: spec.action, target: spec.target, beforeRef: spec.target.id, afterRef: r.afterRef,
          before: r.before, after: r.after, investigationId: null, executionTraceId: null, proposalId: null,
          confirmation: { confirmedBy: actor.name, at: new Date().toISOString(), requestId: idem }, financialObjectIds: [], populationIds: [], evidenceIds: [], outcome: 'COMPLETED', error: null });
        const res = ok({ ...r.result, auditEventId: ev.eventId }, 201);
        WORK.repos.idempotency.put(repKey, 'UI_WRITE', actor.id, res);
        return res;
      });
    } catch (e) {
      if (e instanceof StaleVersionError) return fail('STALE_VERSION', 'The record changed since you read it. Reload it and try again.', { currentVersion: e.current });
      if (e instanceof DomainRefusal) return fail(e.outcome, e.message);
      throw e;
    }
  }

  /* ================================================================================================
     RECONCILIATIONS
     ================================================================================================ */
  reconciliationWorkflow(actor: ActorContext, defId: string, period = this.period): ApiResult {
    const def = this.orch.controls.recDef(defId);
    if (!def) return fail('NOT_FOUND', `No reconciliation ${defId}`);
    const denied = this.need(actor, 'RECON_VIEW', def.entity, 'reconciliation'); if (denied) return denied;
    const r = this.orch.controls.reconcile(def, period);
    return ok({
      definition: { id: def.id, name: def.name, entity: def.entity, catalog: def.method === 'MODULE' ? 'MODULE' : 'GL', financialLineId: def.financialLineId ?? null },
      period, status: r.workflow.status, preparer: r.workflow.preparer, reviewer: r.workflow.reviewer, threadVersion: r.workflow.threadVersion, supportVersion: WORK.relationshipVersion(`recon:${def.id}:${period}`),
      comments: r.workflow.comments, support: r.support, attachedEvidence: r.attachedEvidence,
      balances: r.balanceInModule ? { computedIn: 'RECONCILIATIONS_MODULE' } : { glBalanceUsd: r.glBalanceUsd, differenceUsd: r.differenceUsd, tieStatus: r.tieStatus, reconcilingItems: r.items },
      /* 4A: the server-authoritative, versioned balance — what Sloane and the Artifact Engine cite */
      balance: this.orch.controls.reconBalance(def, period), statement: r.statement ?? null,
      canRecordStatement: def.method === 'BANK' && AuthorizationService.can(actor, 'SUPPORT_ATTACH', { entity: def.entity }).allowed && r.workflow.status !== 'APPROVED',
      canComment: AuthorizationService.can(actor, 'RECON_COMMENT', { entity: def.entity }).allowed && r.workflow.status !== 'APPROVED',
      canAttach: AuthorizationService.can(actor, 'SUPPORT_ATTACH', { entity: def.entity }).allowed && r.workflow.status !== 'APPROVED',
    });
  }
  addReconciliationComment(actor: ActorContext, defId: string, body: Record<string, unknown>): ApiResult {
    const def = this.orch.controls.recDef(defId);
    if (!def) return fail('NOT_FOUND', `No reconciliation ${defId}`);
    const period = str(body, 'period', 7) || this.period, key = `recon:${def.id}:${period}`;
    return this.comment(actor, body, { key, label: `Reconciliation · ${def.name}`, type: 'RECONCILIATION', action: 'ADD_RECONCILIATION_COMMENT', capability: 'RECON_COMMENT', entity: def.entity,
      guard: () => { if (this.orch.controls.reconcile(def, period).workflow.status === 'APPROVED') throw new DomainRefusal('CONFLICT', 'Target closed: the reconciliation is approved and closed to comments.'); } });
  }
  /** attach a support REFERENCE (a workpaper, schedule or document id) to a reconciliation — the same evidence
   *  relationship Sloane's ATTACH_SUPPORT action writes; documents are referenced, never copied */
  attachReconciliationSupport(actor: ActorContext, defId: string, body: Record<string, unknown>): ApiResult {
    const def = this.orch.controls.recDef(defId);
    if (!def) return fail('NOT_FOUND', `No reconciliation ${defId}`);
    const denied = this.need(actor, 'SUPPORT_ATTACH', def.entity, 'reconciliation'); if (denied) return denied;
    const period = str(body, 'period', 7) || this.period, key = `recon:${def.id}:${period}`;
    const reference = str(body, 'reference', 120), label = str(body, 'label', 200) || reference, kind = (str(body, 'kind', 40) || 'WORKPAPER').toUpperCase().replace(/[^A-Z_]/g, '');
    if (!reference) return fail('VALIDATION_ERROR', 'reference is required');
    const expected = num(body, 'expectedSupportVersion');
    return this.write(actor, body, { action: 'ATTACH_SUPPORT', capability: 'SUPPORT_ATTACH', entity: def.entity, kind: 'reconciliation', target: { id: key, type: 'RECONCILIATION', label: `Reconciliation · ${def.name}` },
      run: () => {
        if (this.orch.controls.reconcile(def, period).workflow.status === 'APPROVED') throw new DomainRefusal('CONFLICT', 'Target closed: the reconciliation is approved; support changes reopen review and are governed.');
        const before = WORK.relationshipVersion(key);
        if (expected !== null && expected !== before) throw new StaleVersionError('EVIDENCE_RELATIONSHIP', key, expected, before);
        if (WORK.relsTo(key).some((r) => r.from === reference)) throw new DomainRefusal('CONFLICT', `${reference} is already attached to this reconciliation.`);
        const rel = WORK.relate({ type: 'RECONCILIATION_SUPPORTS', from: reference, to: key, kind, label, sourceSystem: 'Korvyn workpaper reference', via: 'UI', executionId: null }, { id: actor.id, name: actor.name }, null);
        WORK.attachSupport(key, reference, [rel.id], { id: actor.id, name: actor.name }, null, null);
        return { before: { supportLinks: before }, after: { relationshipId: rel.id, reference, kind, label }, afterRef: rel.id, result: { relationship: rel, supportVersion: WORK.relationshipVersion(key) } };
      } });
  }

  /* ================================================================================================
     FLUX — the workspace's statement lines, one thread each, joined to the account groups Sloane reads
     ================================================================================================ */
  fluxWorkflow(actor: ActorContext, account: string, period = this.period): ApiResult {
    const denied = this.need(actor, 'FLUX_VIEW', null, 'flux'); if (denied) return denied;
    const item = this.orch.controls.fluxItems(period, this.vis(actor)).find((i) => i.account === account);
    if (!item) return fail('NOT_FOUND', `No flux line ${account} in ${period}`);
    return ok({ item: { id: item.id, account: item.account, name: item.name, period, material: item.material, status: item.status, changeUsd: item.changeUsd, explanation: item.explanation }, reviewer: item.reviewer, threadVersion: item.threadVersion, comments: item.comments, attachedEvidence: item.attachedEvidence, canComment: AuthorizationService.can(actor, 'FLUX_COMMENT').allowed });
  }
  fluxLineComments(actor: ActorContext, lineId: string, period = this.period): ApiResult {
    const denied = this.need(actor, 'FLUX_VIEW', null, 'flux'); if (denied) return denied;
    const line = fluxLine(lineId);
    if (!line) return fail('NOT_FOUND', `No Flux line ${lineId}`);
    const t = fluxLineComments(lineId, period);
    const acct = fluxLineAccount(lineId);
    return ok({ lineId, label: line.label, statement: line.stmt, period, accounts: t.accounts, threadKey: t.key, threadVersion: t.threadVersion, comments: t.comments,
      explanation: acct ? fluxExplanation(acct, period) : null, canEditExplanation: !!acct && AuthorizationService.can(actor, 'FLUX_COMMENT').allowed,
      attachedEvidence: [t.key, ...t.accounts.map((a) => `flux:${a}:${period}`)].flatMap((k) => WORK.relsTo(k)), canComment: AuthorizationService.can(actor, 'FLUX_COMMENT').allowed });
  }
  addFluxLineComment(actor: ActorContext, lineId: string, body: Record<string, unknown>): ApiResult {
    const line = fluxLine(lineId);
    if (!line) return fail('NOT_FOUND', `No Flux line ${lineId}`);
    const period = str(body, 'period', 7) || this.period;
    return this.comment(actor, body, { key: fluxLineKey(lineId, period), label: `Flux review · ${line.label}`, type: 'FLUX_ITEM', action: 'ADD_FLUX_COMMENT', capability: 'FLUX_COMMENT', entity: null });
  }
  addFluxComment(actor: ActorContext, account: string, body: Record<string, unknown>): ApiResult {
    const period = str(body, 'period', 7) || this.period;
    if (!this.orch.controls.fluxItems(period, 'ALL').some((i) => i.account === account)) return fail('NOT_FOUND', `No flux line ${account} in ${period}`);
    return this.comment(actor, body, { key: `flux:${account}:${period}`, label: `Flux review · ${account}`, type: 'FLUX_ITEM', action: 'ADD_FLUX_COMMENT', capability: 'FLUX_COMMENT', entity: null });
  }
  /** edit a comment: only its human author, only with the version they read */
  editComment(actor: ActorContext, commentId: string, body: Record<string, unknown>): ApiResult {
    const c = WORK.comment(commentId), raw = WORK.repos.comments.get(commentId);
    if (!c || !raw) return fail('NOT_FOUND', `No comment ${commentId}`);
    const denied = this.need(actor, raw.threadKey.startsWith('flux') ? 'FLUX_COMMENT' : 'RECON_COMMENT', null, 'comment'); if (denied) return denied;
    const text = str(body, 'text'), expected = num(body, 'expectedVersion');
    if (!text) return fail('VALIDATION_ERROR', 'text is required');
    if (expected === null) return fail('VALIDATION_ERROR', 'expectedVersion is required to edit a comment');
    if (c.authorId !== actor.id) return fail('PERMISSION_DENIED', 'Only the author of a comment may edit it.');
    const flux = raw.threadKey.startsWith('flux');
    return this.write(actor, body, { action: flux ? 'UPDATE_FLUX_COMMENT' : 'UPDATE_RECONCILIATION_COMMENT', capability: flux ? 'FLUX_COMMENT' : 'RECON_COMMENT', entity: null, kind: 'comment',
      target: { id: raw.threadKey, type: flux ? 'FLUX_ITEM' : 'RECONCILIATION', label: raw.threadKey },
      run: () => { const u = WORK.updateComment(commentId, text, expected, { id: actor.id, name: actor.name }, null); return { before: { version: c.version, text: c.text }, after: { version: u.version, text: u.text }, afterRef: u.id, result: { comment: u } }; } });
  }

  /** one comment write, shared by every workspace thread */
  private comment(actor: ActorContext, body: Record<string, unknown>, o: { key: string; label: string; type: string; action: string; capability: Capability; entity: string | null; guard?: () => void }): ApiResult {
    const denied = this.need(actor, o.capability, o.entity, 'comment'); if (denied) return denied;
    const text = str(body, 'text', 4000);
    if (!text) return fail('VALIDATION_ERROR', 'text is required');
    if (text.length > 2000) return fail('VALIDATION_ERROR', 'text is longer than 2,000 characters');
    const expected = num(body, 'expectedThreadVersion');
    return this.write(actor, body, { action: o.action, capability: o.capability, entity: o.entity, kind: 'comment', target: { id: o.key, type: o.type, label: o.label },
      run: () => {
        o.guard?.();
        const before = WORK.thread(o.key);
        const c = WORK.addComment(o.key, text, { id: actor.id, name: actor.name }, { via: null, source: 'UI', expectedThreadVersion: expected, investigationId: null });
        return { before: { threadVersion: before.version, comments: before.comments.length }, after: { commentId: c.id, version: c.version, text }, afterRef: c.id, result: { comment: c, threadVersion: WORK.thread(o.key).version } };
      } });
  }

  /* ---- 4A: the ONE authoritative Flux explanation (by the workspace's statement line) ------------- */
  fluxLineExplanation(actor: ActorContext, lineId: string, period = this.period): ApiResult {
    const denied = this.need(actor, 'FLUX_VIEW', null, 'flux'); if (denied) return denied;
    const line = fluxLine(lineId), account = fluxLineAccount(lineId);
    if (!line || !account) return fail('NOT_FOUND', `No Flux line ${lineId} on the server book`);
    return ok({ lineId, label: line.label, account, period, explanation: fluxExplanation(account, period), canEdit: AuthorizationService.can(actor, 'FLUX_COMMENT').allowed });
  }
  /** record or edit the explanation: a new version of the one record Sloane and the Artifact Engine also read */
  setFluxLineExplanation(actor: ActorContext, lineId: string, body: Record<string, unknown>): ApiResult {
    const line = fluxLine(lineId), account = fluxLineAccount(lineId);
    if (!line || !account) return fail('NOT_FOUND', `No Flux line ${lineId} on the server book`);
    const denied = this.need(actor, 'FLUX_COMMENT', null, 'flux explanation'); if (denied) return denied;
    const period = str(body, 'period', 7) || this.period, text = str(body, 'text', 4000), expected = num(body, 'expectedVersion');
    if (!text) return fail('VALIDATION_ERROR', 'An explanation needs words.');
    if (text.length > 3000) return fail('VALIDATION_ERROR', 'The explanation is longer than 3,000 characters.');
    const before = fluxExplanation(account, period);
    if (before && expected === null) return fail('VALIDATION_ERROR', 'expectedVersion is required to change an existing explanation');
    return this.write(actor, body, { action: 'UPDATE_FLUX_EXPLANATION', capability: 'FLUX_COMMENT', entity: null, kind: 'flux explanation', target: { id: `flux:${account}:${period}`, type: 'FLUX_EXPLANATION', label: `Flux explanation · ${line.label}` },
      run: () => {
        const e = setFluxExplanation(account, period, text, expected, { id: actor.id, name: actor.name });
        return { before: before ? { explanationId: before.explanationId, version: before.version, status: before.status, text: before.text } : null, after: { explanationId: e.explanationId, version: e.version, status: e.status, text: e.text }, afterRef: e.explanationId, result: { explanation: e } };
      } });
  }

  /* ---- 4A: a recorded bank statement balance — the supporting balance a BANK reconciliation is proven against */
  recordReconciliationStatement(actor: ActorContext, defId: string, body: Record<string, unknown>): ApiResult {
    const def = this.orch.controls.recDef(defId);
    if (!def) return fail('NOT_FOUND', `No reconciliation ${defId}`);
    const denied = this.need(actor, 'SUPPORT_ATTACH', def.entity, 'reconciliation'); if (denied) return denied;
    if (def.method !== 'BANK') return fail('VALIDATION_ERROR', `${def.name} is not reconciled to a bank statement; its supporting balance is derived (${def.method.toLowerCase()}).`);
    const period = str(body, 'period', 7) || this.period, reference = str(body, 'reference', 120), amount = num(body, 'amountUsd'), expected = num(body, 'expectedVersion');
    if (amount === null) return fail('VALIDATION_ERROR', 'amountUsd is required (the statement balance in USD).');
    if (!reference) return fail('VALIDATION_ERROR', 'reference is required (the statement it was read from).');
    const key = `recon:${def.id}:${period}`;
    return this.write(actor, body, { action: 'RECORD_RECONCILIATION_STATEMENT', capability: 'SUPPORT_ATTACH', entity: def.entity, kind: 'reconciliation', target: { id: key, type: 'RECONCILIATION', label: `Reconciliation · ${def.name}` },
      run: () => {
        if (this.orch.controls.reconcile(def, period).workflow.status === 'APPROVED') throw new DomainRefusal('CONFLICT', 'Target closed: the reconciliation is approved; changing its supporting balance reopens review and is governed.');
        const before = reconStatement(def.id, period);
        const s = recordReconStatement(def.id, period, { amountUsd: amount, reference, statementDate: str(body, 'statementDate', 10) || `${period}-30` }, expected, { id: actor.id, name: actor.name });
        const bal = this.orch.controls.reconBalance(def, period);
        return { before: before ? { amountUsd: before.amountUsd, reference: before.reference, version: before.version } : null, after: { amountUsd: amount, reference, version: s.version }, afterRef: s.id, result: { statement: reconStatement(def.id, period), balance: bal } };
      } });
  }

  /* ================================================================================================
     ARTIFACTS — governed deliverables (the same engine Sloane builds with)
     ================================================================================================ */
  artifacts(actor: ActorContext): ApiResult { const d = this.need(actor, 'GL_VIEW', null, 'artifact'); if (d) return d; return ok({ artifacts: this.orch.artifacts.list(actor) }); }
  artifact(actor: ActorContext, id: string, sample = 15): ApiResult {
    const d = this.need(actor, 'GL_VIEW', null, 'artifact'); if (d) return d;
    const v = this.orch.artifacts.view(actor, id);
    if (!v) return fail('NOT_FOUND', `No artifact ${id}`);
    const m = this.orch.artifacts.compose(actor, v.definition, v.version, v.id);
    return ok({ artifact: v, preview: this.orch.artifacts.previewOf(m, { id: v.id, version: v.version, status: v.status, name: v.name }, sample) });
  }
  /** generate: validated and recorded synchronously, rendered by a job; the caller awaits a small file, polls a large one */
  async generateArtifact(actor: ActorContext, id: string, body: Record<string, unknown>): Promise<ApiResult> {
    const idem = str(body, 'idempotencyKey', 80);
    if (!idem) return fail('VALIDATION_ERROR', 'idempotencyKey is required for a write');
    const repKey = `UI:${actor.id}:${idem}`, prior = WORK.repos.idempotency.get<ApiResult>(repKey);
    if (prior) return prior;
    const format = str(body, 'format', 4) === 'csv' ? 'csv' : 'xlsx';
    const channel = str(body, 'channel', 12) === 'SLOANE' ? 'SLOANE' : 'REPORTING';
    const r = this.orch.artifacts.requestGeneration(actor, id, { format, expectedVersion: num(body, 'expectedVersion'), acknowledge: body['acknowledge'] === true, channel });
    if (!r.ok) return fail(r.code === 'STALE' || r.code === 'STALE_VERSION' ? 'STALE_VERSION' : r.code === 'TIE_OUT_WARNING' || r.code === 'CONFLICT' ? 'CONFLICT' : r.code, r.reason, { code: r.code, ...(r.detail ?? {}) });
    await Promise.race([r.job.done, new Promise((res) => setTimeout(res, 8_000))]);
    const res = ok({ generationId: r.generationId, job: this.orch.artifacts.job(r.job.id), fileName: r.fileName, warnings: r.warnings, generation: this.orch.artifacts.generations(id).find((g) => g.id === r.generationId) ?? null }, 202);
    WORK.repos.idempotency.put(repKey, 'ARTIFACT_GENERATION', actor.id, res);
    return res;
  }
  artifactJob(actor: ActorContext, jobId: string): ApiResult {
    const j = this.orch.artifacts.job(jobId);
    if (!j) return fail('NOT_FOUND', `No job ${jobId}`);
    const v = this.orch.artifacts.view(actor, j.artifactId);
    if (!v) return fail('NOT_FOUND', `No job ${jobId}`);
    return ok({ job: j, generation: v.generations.find((g) => g.id === j.generationId) ?? null });
  }
  refreshArtifact(actor: ActorContext, id: string, body: Record<string, unknown>): ApiResult {
    const denied = this.need(actor, 'ARTIFACT_CREATE', null, 'artifact'); if (denied) return denied;
    const r = this.orch.artifacts.refresh(actor, id, num(body, 'expectedVersion'), str(body, 'channel', 12) === 'SLOANE' ? 'SLOANE' : 'REPORTING');
    if (!r.ok) return fail(r.code === 'STALE_VERSION' ? 'STALE_VERSION' : r.code === 'PERMISSION_DENIED' ? 'PERMISSION_DENIED' : 'NOT_FOUND', r.reason);
    return this.artifact(actor, id);
  }
  artifactDownload(actor: ActorContext, id: string, genId: string) { return this.orch.artifacts.download(actor, id, genId, 'REPORTING'); }

  /* ---- development only: the source feed (a late ERP posting, and a connector sync) ----------------- */
  devSourcePosting(actor: ActorContext, body: Record<string, unknown>): ApiResult {
    const entity = str(body, 'entity', 20), period = str(body, 'period', 7) || this.period, dr = str(body, 'debitAccount', 10), cr = str(body, 'creditAccount', 10), amount = num(body, 'amount');
    if (!entity || !dr || !cr || amount === null || amount <= 0) return fail('VALIDATION_ERROR', 'entity, debitAccount, creditAccount and a positive amount (local currency) are required');
    try {
      const p = postSource(this.orch.gl, { entity, period, description: str(body, 'description', 200) || 'Late ERP posting', lines: [{ account: dr, local: amount, project: str(body, 'project', 20) || null }, { account: cr, local: -amount }], synced: body['synced'] !== false }, actor.id);
      return ok({ posting: p, dataVersion: this.orch.gl.dataVersion() }, 201);
    } catch (e) { return fail('VALIDATION_ERROR', (e as Error).message); }
  }
  devSourceSync(actor: ActorContext): ApiResult { const n = syncSourceFeed(this.orch.gl, actor.id); return ok({ synced: n, dataVersion: this.orch.gl.dataVersion() }); }

  /* ================================================================================================
     CLOSE
     ================================================================================================ */
  close(actor: ActorContext, period = this.period): ApiResult {
    const denied = this.need(actor, 'CLOSE_VIEW', null, 'close'); if (denied) return denied;
    const vis = this.vis(actor);
    const r = this.orch.controls.closeReadiness(period, vis);
    return ok({ period, readinessPct: r.readinessPct, parts: r.parts, blockers: r.blockers, tasks: this.orch.controls.closeTasks(period, vis), approvals: this.orch.controls.pendingApprovals(period, vis), exceptions: this.orch.controls.continuousCloseSignals(period, vis) });
  }
  closeTasks(actor: ActorContext, period = this.period): ApiResult {
    const denied = this.need(actor, 'CLOSE_VIEW', null, 'close'); if (denied) return denied;
    const vis = this.vis(actor);
    return ok({ period, tasks: WORK.repos.close.tasks(period).map(closeTaskView).filter((t) => vis === 'ALL' || vis.has(t.entity)), canUpdate: actor.permissions.includes('CLOSE_TASK_UPDATE') });
  }
  setCloseTaskStatus(actor: ActorContext, taskId: string, body: Record<string, unknown>): ApiResult {
    const period = str(body, 'period', 7) || this.period;
    const t = closeTask(period, taskId);
    if (!t) return fail('NOT_FOUND', `No close task ${taskId} in ${period}`);
    const denied = this.need(actor, 'CLOSE_TASK_UPDATE', t.entity, 'close task'); if (denied) return denied;
    const to = str(body, 'to', 20) as CloseTaskState;
    if (!CLOSE_TASK_STATES.includes(to)) return fail('VALIDATION_ERROR', `to must be one of ${CLOSE_TASK_STATES.join(', ')}`);
    const reason = str(body, 'blockedBy', 300) || null, expected = num(body, 'expectedVersion');
    if (expected === null) return fail('VALIDATION_ERROR', 'expectedVersion is required to change a close task');
    if (to === 'BLOCKED' && !reason && !t.dependency && !t.blockedBy) return fail('VALIDATION_ERROR', 'Say what is blocking the task.');
    return this.write(actor, body, { action: 'UPDATE_CLOSE_TASK_STATUS', capability: 'CLOSE_TASK_UPDATE', entity: t.entity, kind: 'close task', target: { id: `close:${taskId}:${period}`, type: 'CLOSE_TASK', label: `${t.name} · ${t.entityName ?? t.entity}` },
      run: () => {
        const u = setCloseTaskState(period, taskId, to, reason, expected, actor.id)!;
        return { before: { state: t.state, blockedBy: t.blockedBy, version: t.version }, after: { state: u.state, blockedBy: u.blockedBy, version: u.version }, afterRef: u.id, result: { task: closeTaskView(u) } };
      } });
  }

  /* ================================================================================================
     SAVED REPORTS — the Reporting workspace and Sloane share this store
     ================================================================================================ */
  private canSeeReport(actor: ActorContext, r: { createdBy: string; sharedWith: string[] }) {
    return r.createdBy === actor.id || r.createdBy.startsWith('system:') || r.sharedWith.includes(actor.id) || r.sharedWith.some((w) => w.toLowerCase() === actor.name.toLowerCase());
  }
  reports(actor: ActorContext): ApiResult {
    const denied = this.need(actor, 'REPORT_VIEW', null, 'report'); if (denied) return denied;
    return ok({ reports: savedReports().filter((r) => this.canSeeReport(actor, r)), canCreate: actor.permissions.includes('REPORT_CREATE') });
  }
  report(actor: ActorContext, id: string): ApiResult {
    const denied = this.need(actor, 'REPORT_VIEW', null, 'report'); if (denied) return denied;
    const r = savedReport(id);
    return r && this.canSeeReport(actor, r) ? ok({ report: r }) : fail('NOT_FOUND', `No saved report ${id}`);
  }
  createReport(actor: ActorContext, body: Record<string, unknown>): ApiResult {
    const denied = this.need(actor, 'REPORT_CREATE', null, 'report'); if (denied) return denied;
    const name = str(body, 'name', 160), browser = body['definition'];
    if (!name) return fail('VALIDATION_ERROR', 'name is required');
    if (!browser || typeof browser !== 'object' || Array.isArray(browser)) return fail('VALIDATION_ERROR', 'definition is required');
    let def: Record<string, unknown>;
    try { def = sanitizeDefinition(browser as Record<string, unknown>, name); } catch (e) { if (e instanceof DomainRefusal) return fail(e.outcome, e.message); throw e; }
    return this.write(actor, body, { action: 'SAVE_REPORT_DEFINITION', capability: 'REPORT_CREATE', entity: null, kind: 'report', target: { id: 'REPORT:new', type: 'REPORT', label: name },
      run: () => {
        const s = WORK.repos.saved.create('REPORT', { name, definition: { ...sloaneShapeOf(def), owner: actor.name, status: 'SAVED', browser: def }, sharedWith: [], createdVia: 'UI', executionId: null }, actor.id);
        return { before: null, after: { id: s.id, name, version: s.version }, afterRef: s.id, result: { report: savedReport(s.id) } };
      } });
  }
  /** change a saved report: its definition, name, sharing, or archive flag — one versioned write */
  updateReport(actor: ActorContext, id: string, body: Record<string, unknown>): ApiResult {
    const r = savedReport(id);
    if (!r || !this.canSeeReport(actor, r)) return fail('NOT_FOUND', `No saved report ${id}`);
    const denied = this.need(actor, 'REPORT_CREATE', null, 'report'); if (denied) return denied;
    const expected = num(body, 'expectedVersion');
    if (expected === null) return fail('VALIDATION_ERROR', 'expectedVersion is required to change a saved report');
    const name = str(body, 'name', 160) || r.name;
    let nextDef: Record<string, unknown>;
    try { nextDef = body['definition'] && typeof body['definition'] === 'object' ? sanitizeDefinition(body['definition'] as Record<string, unknown>, name) : { ...r.browser, name }; }
    catch (e) { if (e instanceof DomainRefusal) return fail(e.outcome, e.message); throw e; }
    const archived = typeof body['archived'] === 'boolean' ? body['archived'] as boolean : r.archived;
    const deleted = body['deleted'] === true;
    const sharedWith = Array.isArray(body['sharedWith']) ? (body['sharedWith'] as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 50) : r.sharedWith;
    const action = deleted ? 'DELETE_REPORT_DEFINITION' : archived !== r.archived ? 'ARCHIVE_REPORT_DEFINITION' : 'UPDATE_REPORT_DEFINITION';
    return this.write(actor, body, { action, capability: 'REPORT_CREATE', entity: null, kind: 'report', target: { id, type: 'REPORT', label: r.name },
      run: () => {
        const u = WORK.repos.saved.update('REPORT', id, expected, actor.id, (o) => ({ name, definition: { ...o.definition, ...sloaneShapeOf(nextDef), browser: nextDef, what: str(body, 'what', 160) || undefined }, sharedWith, createdVia: o.createdVia, executionId: o.executionId }),
          { status: deleted ? 'DELETED' : archived ? 'ARCHIVED' : 'SAVED' });
        return { before: { version: r.version, name: r.name, archived: r.archived }, after: { version: u.version, name, archived, deleted }, afterRef: id, result: { report: deleted ? null : savedReport(id), version: u.version } };
      } });
  }

  /* ---- evidence, work objects (read) ------------------------------------------------------------- */
  evidence(actor: ActorContext, target: string): ApiResult {
    const denied = this.need(actor, 'EVIDENCE_VIEW', null, 'evidence'); if (denied) return denied;
    return ok({ target, relationships: WORK.relsTo(target), attachments: WORK.repos.evidence.attachmentsTo(target) });
  }
  savedObjects(actor: ActorContext, kind: string): ApiResult {
    const map: Record<string, ['ANALYSIS' | 'REPORT' | 'EXCEL' | 'PACKAGE', Capability]> = { analyses: ['ANALYSIS', 'GL_VIEW'], reports: ['REPORT', 'REPORT_VIEW'], artifacts: ['EXCEL', 'GL_VIEW'], packages: ['PACKAGE', 'EVIDENCE_VIEW'] };
    const m = map[kind]; if (!m) return fail('NOT_FOUND', `No saved object kind ${kind}`);
    const denied = this.need(actor, m[1], null, kind); if (denied) return denied;
    return ok({ kind, items: WORK.repos.saved.list(m[0]).filter((x) => x.createdBy === actor.id || x.sharedWith.includes(actor.id)) });
  }
  issues(actor: ActorContext): ApiResult {
    const denied = this.need(actor, 'GL_VIEW', null, 'issues'); if (denied) return denied;
    return ok({ items: WORK.repos.issues.list() });
  }
}

/** a report definition from the browser is data, never code: plain JSON, bounded size, no functions, known shape */
function sanitizeDefinition(d: Record<string, unknown>, name: string): Record<string, unknown> {
  const json = JSON.stringify(d);
  if (json.length > 20_000) throw new DomainRefusal('VALIDATION_ERROR', 'The report definition is too large.');
  const clean = JSON.parse(json) as Record<string, unknown>;
  for (const k of ['id', 'version', 'history', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'sharedWith', 'archived', 'owner']) delete clean[k];
  return { ...clean, name };
}

export { FLUX_LINE_ACCOUNTS, browserDefOf };
