/**
 * DOMAIN REPOSITORIES over the durable work store. Business logic uses these; nothing above this layer writes SQL.
 *
 * Every durable object carries a stable Korvyn id, `version`, `createdAt/createdBy`, `updatedAt/updatedBy`, and where
 * it applies `status`, `scope`, `period`, `target` and `investigationId`. Updates are OPTIMISTIC: a caller states the
 * version it read, and a different stored version raises StaleVersionError — nothing is ever silently overwritten.
 */
import { randomBytes } from 'node:crypto';
import { type KorvynDatabase, korvynId } from './db.js';

export interface Stamp { id: string; version: number; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string }
export interface Meta { status?: string | null; scope?: string | null; period?: string | null; target?: string | null; investigationId?: string | null }
export type Stamped<T> = T & Stamp & Meta;

export class StaleVersionError extends Error {
  readonly code = 'STALE_PROPOSAL';
  constructor(readonly kind: string, readonly id: string, readonly expected: number, readonly current: number) {
    super(`${kind} ${id} changed since it was read (version ${expected} → ${current})`);
  }
}

const now = () => new Date().toISOString();
type Row = { id: string; kind: string; version: number; created_at: string; created_by: string; updated_at: string; updated_by: string; status: string | null; scope: string | null; period: string | null; target: string | null; investigation_id: string | null; data: string };
const hydrate = <T>(r: Row): Stamped<T> => ({ ...(JSON.parse(r.data) as T), id: r.id, version: r.version, createdAt: r.created_at, createdBy: r.created_by, updatedAt: r.updated_at, updatedBy: r.updated_by, status: r.status, scope: r.scope, period: r.period, target: r.target, investigationId: r.investigation_id });
const strip = (o: object): Record<string, unknown> => { const src = o as Record<string, unknown>; return strip0(src); };
const strip0 = (o: Record<string, unknown>) => { const c = { ...o }; for (const k of ['id', 'version', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'status', 'scope', 'period', 'target', 'investigationId']) delete c[k]; return c; };

/** the generic record table; domain repositories are thin, typed views of it */
export class RecordStore {
  constructor(readonly database: KorvynDatabase) {}
  get<T>(kind: string, id: string): Stamped<T> | null {
    const r = this.database.db.prepare('SELECT * FROM records WHERE id = ? AND kind = ?').get(id, kind) as Row | undefined;
    return r ? hydrate<T>(r) : null;
  }
  list<T>(kind: string, where: Partial<Record<'target' | 'investigation_id' | 'created_by' | 'status' | 'period', string>> = {}): Stamped<T>[] {
    const keys = Object.keys(where) as (keyof typeof where)[];
    const sql = `SELECT * FROM records WHERE kind = ?${keys.map((k) => ` AND ${k} = ?`).join('')} ORDER BY created_at, id`;
    return (this.database.db.prepare(sql).all(kind, ...keys.map((k) => where[k]! as string)) as unknown as Row[]).map((r) => hydrate<T>(r));
  }
  insert<T extends object>(kind: string, obj: T, by: string, meta: Meta & { id?: string; prefix?: string } = {}): Stamped<T> {
    const id = meta.id ?? korvynId(meta.prefix ?? kind);
    const t = now();
    this.database.db.prepare('INSERT INTO records (id, kind, version, created_at, created_by, updated_at, updated_by, status, scope, period, target, investigation_id, data) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, kind, t, by, t, by, meta.status ?? null, meta.scope ?? null, meta.period ?? null, meta.target ?? null, meta.investigationId ?? null, JSON.stringify(strip(obj)));
    return this.get<T>(kind, id)!;
  }
  /** optimistic update: expectedVersion null means "whatever is current" and is reserved for system-owned fields */
  update<T extends object>(kind: string, id: string, expectedVersion: number | null, by: string, mutate: (o: Stamped<T>) => T, meta: Meta = {}): Stamped<T> {
    const cur = this.get<T>(kind, id);
    if (!cur) throw new Error(`${kind} ${id} does not exist`);
    if (expectedVersion !== null && cur.version !== expectedVersion) throw new StaleVersionError(kind, id, expectedVersion, cur.version);
    const next = mutate(cur);
    const res = this.database.db.prepare('UPDATE records SET version = version + 1, updated_at = ?, updated_by = ?, status = ?, scope = ?, period = ?, target = ?, investigation_id = ?, data = ? WHERE id = ? AND kind = ? AND version = ?')
      .run(now(), by, (meta.status !== undefined ? meta.status : cur.status) ?? null, (meta.scope !== undefined ? meta.scope : cur.scope) ?? null, (meta.period !== undefined ? meta.period : cur.period) ?? null, (meta.target !== undefined ? meta.target : cur.target) ?? null, (meta.investigationId !== undefined ? meta.investigationId : cur.investigationId) ?? null, JSON.stringify(strip(next)), id, kind, cur.version);
    if (Number(res.changes) !== 1) { const c = this.get<T>(kind, id)!; throw new StaleVersionError(kind, id, cur.version, c.version); }
    return this.get<T>(kind, id)!;
  }
}

/* ================================================================================================
   DOMAIN SHAPES
   ================================================================================================ */
export interface CommentBody { threadKey: string; author: string; authorId: string; via: 'Sloane' | null; source: 'SLOANE' | 'UI' | 'SEED'; text: string; financialObjectIds: string[]; populationIds: string[]; executionId: string | null; history: { version: number; text: string; at: string; by: string }[] }
export interface ThreadBody { key: string; domain: 'FLUX' | 'RECON' }
export interface EvidenceReferenceBody { externalRef: string; kind: string; label: string; sourceSystem: string; documentConnected: false }
export interface RelationshipBody { type: string; from: string; to: string; kind: string; label: string; sourceSystem: string; createdVia: 'Sloane' | 'UI' | 'SYSTEM'; executionId: string | null }
export interface SupportAttachmentBody { targetKey: string; evidenceRef: string; relationshipIds: string[]; executionId: string | null }
export interface IssueBody { title: string; description: string; amountUsd: number | null; links: { ref: string; label: string }[]; owner: string | null; createdVia: 'Sloane' | 'UI'; executionId: string | null }
export interface AssignmentBody { targetKey: string; targetLabel: string; reviewerId: string; reviewerName: string; previousReviewer: string | null; executionId: string | null }
export interface SavedBody { name: string; definition: Record<string, unknown>; sharedWith: string[]; createdVia: 'Sloane' | 'UI'; executionId: string | null }
export interface InvestigationBody {
  title: string; objective: string; owner: string; ownerName: string; currency: string; basis: string;
  context: Record<string, unknown>;
  objectRefs: { ref: string; type: string; title: string; traceId: string }[];
  populationRefs: string[]; findings: string[]; evidenceRefs: string[]; actionIds: string[]; artifactIds: string[];
  steps: { at: string; request: string; traceId: string; toolCalls: { tool: string; args: Record<string, string> }[]; objectRefs: string[]; narrative: string[]; proposalIds: string[] }[];
  sessionIds: string[];
}
export interface InvestigationEventBody { type: string; label: string; ref: string | null; traceId: string | null }
export interface ContextSnapshotBody { investigationId: string; traceId: string; context: unknown }
export interface ExecutionBody { proposalId: string; actionType: string; outcome: 'COMPLETED' | 'FAILED' | 'STALE_PROPOSAL'; result: Record<string, unknown> | null; error: string | null; auditEventId: string | null; requestId: string | null }
export interface ReconDefinitionBody { definitionId: string; name: string; catalog: 'MODULE' | 'GL'; financialLineId: string | null; entity: string; accounts: string[]; preparer: string; reviewer: string }
export interface ReconWorkflowBody { definitionId: string; status: string }
export interface FluxExplanationBody { account: string; explanationId: string; status: string; text: string; author: string; reviewer: string; supportRefs: string[] }
export interface CloseTaskBody { taskId: string; name: string; workstream: string; entity: string; entityName?: string; owner: string; approver: string; due: string; state: string; blockedBy: string | null; dependency?: string | null }

export interface AuditEvent {
  eventId: string; at: string;
  actor: { id: string; name: string; role: string };
  source: 'SLOANE' | 'UI' | 'SYSTEM';
  action: string;
  target: { id: string | null; type: string | null; label: string | null };
  beforeRef: string | null; afterRef: string | null; before: unknown; after: unknown;
  investigationId: string | null; executionTraceId: string | null; proposalId: string | null;
  confirmation: { confirmedBy: string; at: string; requestId: string | null } | null;
  financialObjectIds: string[]; populationIds: string[]; evidenceIds: string[];
  outcome: 'COMPLETED' | 'FAILED' | 'STALE_PROPOSAL';
  error: string | null;
}

/* ================================================================================================
   REPOSITORIES
   ================================================================================================ */
export class CommentRepository {
  constructor(private readonly s: RecordStore) {}
  private threadRec(key: string) {
    const id = `THREAD-${key}`;
    return this.s.get<ThreadBody>('COMMENT_THREAD', id) ?? this.s.insert<ThreadBody>('COMMENT_THREAD', { key, domain: key.startsWith('flux') ? 'FLUX' : 'RECON' }, 'system', { id, target: key });
  }
  thread(key: string) {
    const t = this.threadRec(key);
    const kind = key.startsWith('flux') ? 'FLUX_COMMENT' : 'RECON_COMMENT';
    return { key, version: t.version, comments: this.s.list<CommentBody>(kind, { target: key }) };
  }
  /** appends a comment; the thread version guards against a comment landing on a thread that moved since it was read */
  add(key: string, body: Omit<CommentBody, 'threadKey' | 'history'>, expectedThreadVersion: number | null, by: string, investigationId: string | null) {
    const t = this.threadRec(key);
    const kind = key.startsWith('flux') ? 'FLUX_COMMENT' : 'RECON_COMMENT';
    this.s.update<ThreadBody>('COMMENT_THREAD', t.id, expectedThreadVersion, by, (o) => ({ key: o.key, domain: o.domain }));
    return this.s.insert<CommentBody>(kind, { ...body, threadKey: key, history: [] }, by, { prefix: key.startsWith('flux') ? 'FLUXCOMMENT' : 'RECONCOMMENT', target: key, investigationId });
  }
  update(commentId: string, text: string, expectedVersion: number, by: string, via: 'Sloane' | null) {
    const kind = commentId.startsWith('FLUXCOMMENT') ? 'FLUX_COMMENT' : 'RECON_COMMENT';
    const c = this.s.get<CommentBody>(kind, commentId);
    if (!c) throw new Error(`comment ${commentId} does not exist`);
    const t = this.threadRec(c.threadKey);
    this.s.update<ThreadBody>('COMMENT_THREAD', t.id, null, by, (o) => ({ key: o.key, domain: o.domain }));
    return this.s.update<CommentBody>(kind, commentId, expectedVersion, by, (o) => ({ ...strip(o) as unknown as CommentBody, text, via, history: [...o.history, { version: o.version, text: o.text, at: o.updatedAt, by: o.updatedBy }] }));
  }
  get(commentId: string) { return this.s.get<CommentBody>(commentId.startsWith('FLUXCOMMENT') ? 'FLUX_COMMENT' : 'RECON_COMMENT', commentId); }
  /** a system-level touch: another writer changed the thread (used by tests and imports) */
  touch(key: string, by: string) { const t = this.threadRec(key); this.s.update<ThreadBody>('COMMENT_THREAD', t.id, null, by, (o) => ({ key: o.key, domain: o.domain })); }
}

export class EvidenceRepository {
  constructor(private readonly s: RecordStore) {}
  reference(externalRef: string, kind: string, label: string, sourceSystem: string, by: string) {
    const existing = this.s.list<EvidenceReferenceBody>('EVIDENCE_REFERENCE', { target: externalRef })[0];
    return existing ?? this.s.insert<EvidenceReferenceBody>('EVIDENCE_REFERENCE', { externalRef, kind, label, sourceSystem, documentConnected: false }, by, { prefix: 'EVIDENCE', target: externalRef });
  }
  relate(body: RelationshipBody, by: string, investigationId: string | null) {
    const dup = this.s.list<RelationshipBody>('EVIDENCE_RELATIONSHIP', { target: body.to }).find((r) => r.from === body.from && r.type === body.type);
    return dup ?? this.s.insert<RelationshipBody>('EVIDENCE_RELATIONSHIP', body, by, { prefix: 'EVREL', target: body.to, status: 'ACTIVE', investigationId });
  }
  attach(body: SupportAttachmentBody, by: string, investigationId: string | null) {
    return this.s.insert<SupportAttachmentBody>('SUPPORT_ATTACHMENT', body, by, { prefix: 'SUPPORT', target: body.targetKey, status: 'ATTACHED', investigationId });
  }
  relsTo(target: string) { return this.s.list<RelationshipBody>('EVIDENCE_RELATIONSHIP', { target }); }
  relsFrom(from: string) { return this.s.list<RelationshipBody>('EVIDENCE_RELATIONSHIP').filter((r) => r.from === from); }
  all() { return this.s.list<RelationshipBody>('EVIDENCE_RELATIONSHIP'); }
  attachmentsTo(targetKey: string) { return this.s.list<SupportAttachmentBody>('SUPPORT_ATTACHMENT', { target: targetKey }); }
  relationshipCount(targetKey: string) { return this.relsTo(targetKey).length; }
}

export class IssueRepository {
  constructor(private readonly s: RecordStore) {}
  create(body: IssueBody, by: string, period: string | null, investigationId: string | null) { return this.s.insert<IssueBody>('ISSUE', body, by, { prefix: 'ISSUE', status: 'OPEN', period, investigationId }); }
  list() { return this.s.list<IssueBody>('ISSUE'); }
}

export class ReviewerAssignmentRepository {
  constructor(private readonly s: RecordStore) {}
  current(targetKey: string) { return this.s.list<AssignmentBody>('REVIEWER_ASSIGNMENT', { target: targetKey, status: 'CURRENT' }).at(-1) ?? null; }
  assign(body: AssignmentBody, by: string, expectedCurrentVersion: number | null, investigationId: string | null) {
    const cur = this.current(body.targetKey);
    if (cur) this.s.update<AssignmentBody>('REVIEWER_ASSIGNMENT', cur.id, expectedCurrentVersion, by, (o) => strip(o) as unknown as AssignmentBody, { status: 'SUPERSEDED' });
    else if (expectedCurrentVersion !== null && expectedCurrentVersion !== 0) throw new StaleVersionError('REVIEWER_ASSIGNMENT', body.targetKey, expectedCurrentVersion, 0);
    return this.s.insert<AssignmentBody>('REVIEWER_ASSIGNMENT', body, by, { prefix: 'ASSIGNMENT', target: body.targetKey, status: 'CURRENT', investigationId });
  }
  list() { return this.s.list<AssignmentBody>('REVIEWER_ASSIGNMENT'); }
}

/** analyses, report definitions, Excel artifact definitions, support package drafts, governed-workflow requests */
export class SavedObjectRepository {
  static readonly KINDS = { ANALYSIS: ['SAVED_ANALYSIS', 'ANALYSIS'], REPORT: ['SAVED_REPORT', 'REPORT'], EXCEL: ['EXCEL_ARTIFACT_DEFINITION', 'ARTIFACT'], PACKAGE: ['SUPPORT_PACKAGE_DRAFT', 'PACKAGE'], INVESTIGATION_SHARE: ['SHARED_INVESTIGATION', 'INVESTIGATION'], APPROVAL_REQUEST: ['GOVERNED_REQUEST', 'REQUEST'] } as const;
  constructor(private readonly s: RecordStore) {}
  create(k: keyof typeof SavedObjectRepository.KINDS, body: SavedBody, by: string, meta: Meta & { id?: string } = {}) { const [kind, prefix] = SavedObjectRepository.KINDS[k]; return this.s.insert<SavedBody>(kind, body, by, { prefix, status: k === 'REPORT' ? String(body.definition['status'] ?? 'DRAFT') : 'ACTIVE', ...meta }); }
  list(k: keyof typeof SavedObjectRepository.KINDS) { return this.s.list<SavedBody>(SavedObjectRepository.KINDS[k][0]); }
  get(k: keyof typeof SavedObjectRepository.KINDS, id: string) { return this.s.get<SavedBody>(SavedObjectRepository.KINDS[k][0], id); }
  /** a versioned change to a saved definition; a stale expectedVersion raises STALE_PROPOSAL */
  update(k: keyof typeof SavedObjectRepository.KINDS, id: string, expectedVersion: number | null, by: string, mutate: (o: Stamped<SavedBody>) => SavedBody, meta: Meta = {}) { return this.s.update<SavedBody>(SavedObjectRepository.KINDS[k][0], id, expectedVersion, by, mutate, meta); }
}

export class InvestigationRepository {
  constructor(private readonly s: RecordStore) {}
  create(body: InvestigationBody, by: string, period: string, scope: string) { return this.s.insert<InvestigationBody>('INVESTIGATION', body, by, { prefix: 'INVESTIGATION', status: 'OPEN', period, scope }); }
  get(id: string) { return this.s.get<InvestigationBody>('INVESTIGATION', id); }
  listFor(ownerId: string) { return this.s.list<InvestigationBody>('INVESTIGATION', { created_by: ownerId }).reverse(); }
  update(id: string, by: string, mutate: (o: Stamped<InvestigationBody>) => InvestigationBody, meta: Meta = {}) { return this.s.update<InvestigationBody>('INVESTIGATION', id, null, by, mutate, meta); }
  event(investigationId: string, body: InvestigationEventBody, by: string) { return this.s.insert<InvestigationEventBody>('INVESTIGATION_EVENT', body, by, { prefix: 'INVEVENT', investigationId }); }
  events(investigationId: string) { return this.s.list<InvestigationEventBody>('INVESTIGATION_EVENT', { investigation_id: investigationId }); }
  snapshot(body: ContextSnapshotBody, by: string) { return this.s.insert<ContextSnapshotBody>('FINANCIAL_CONTEXT_SNAPSHOT', body, by, { prefix: 'CTXSNAP', investigationId: body.investigationId }); }
  latestSnapshot(investigationId: string) { return this.s.list<ContextSnapshotBody>('FINANCIAL_CONTEXT_SNAPSHOT', { investigation_id: investigationId }).at(-1) ?? null; }
}

export class ActionRepository {
  constructor(private readonly s: RecordStore) {}
  /* a proposal carries its OWN status, version and timestamps, which are also the record's stamp fields, so the proposal
     is stored whole under `proposal`; the record's status column mirrors it for queries */
  saveProposal<T extends { id: string; status: string; sessionId: string; investigationId: string | null; targetObjectId: string | null }>(p: T, by: string): void {
    const cur = this.s.get<{ proposal: T }>('ACTION_PROPOSAL', p.id);
    if (!cur) this.s.insert('ACTION_PROPOSAL', { proposal: p }, by, { id: p.id, status: p.status, target: p.targetObjectId, investigationId: p.investigationId, scope: p.sessionId });
    else this.s.update('ACTION_PROPOSAL', p.id, null, by, () => ({ proposal: p }), { status: p.status, target: p.targetObjectId, investigationId: p.investigationId });
  }
  proposal<T>(id: string): T | null { const r = this.s.get<{ proposal: T }>('ACTION_PROPOSAL', id); return r ? r.proposal : null; }
  proposalsForSession<T>(sessionId: string) { return this.s.list<{ proposal: T }>('ACTION_PROPOSAL').filter((r) => r.scope === sessionId).map((r) => r.proposal); }
  proposalsForInvestigation<T>(investigationId: string) { return this.s.list<{ proposal: T }>('ACTION_PROPOSAL', { investigation_id: investigationId }).map((r) => r.proposal); }
  execution(body: ExecutionBody, by: string, investigationId: string | null) { return this.s.insert<ExecutionBody>('ACTION_EXECUTION', body, by, { prefix: 'EXECUTION', status: body.outcome, target: body.proposalId, investigationId }); }
  executionsOf(proposalId: string) { return this.s.list<ExecutionBody>('ACTION_EXECUTION', { target: proposalId }); }
}

export class ReconciliationRepository {
  constructor(private readonly s: RecordStore) {}
  definitions() { return this.s.list<ReconDefinitionBody>('RECON_DEFINITION'); }
  definition(id: string) { return this.s.list<ReconDefinitionBody>('RECON_DEFINITION', { target: id })[0] ?? null; }
  status(id: string) { return this.s.list<ReconWorkflowBody>('RECON_WORKFLOW', { target: id })[0] ?? null; }
}
export class FluxRepository {
  constructor(private readonly s: RecordStore) {}
  explanation(account: string, period: string) { return this.s.list<FluxExplanationBody>('FLUX_EXPLANATION', { target: `flux:${account}:${period}` })[0] ?? null; }
}
export class CloseRepository {
  constructor(private readonly s: RecordStore) {}
  tasks(period: string) { return this.s.list<CloseTaskBody>('CLOSE_TASK', { period }); }
}
export class ReportRepository {
  constructor(private readonly s: RecordStore) {}
  definitions() { return this.s.list<{ name: string; owner: string; kind: string; definitionVersion: number; lines: { label: string; accounts: string[] }[] }>('REPORT_DEFINITION'); }
  published() { return this.s.list<Record<string, unknown>>('PUBLISHED_REPORT'); }
  packages() { return this.s.list<Record<string, unknown>>('REPORTING_PACKAGE'); }
}

export class AuditRepository {
  constructor(private readonly database: KorvynDatabase) {}
  append(e: Omit<AuditEvent, 'eventId' | 'at'>): AuditEvent {
    const ev: AuditEvent = { ...e, eventId: korvynId('AUDIT'), at: new Date().toISOString() };
    this.database.db.prepare('INSERT INTO audit_events (event_id, at, actor_id, source, action, target, investigation_id, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(ev.eventId, ev.at, ev.actor.id, ev.source, ev.action, ev.target?.id ?? null, ev.investigationId ?? null, JSON.stringify(ev));
    return ev;
  }
  list(where: { investigationId?: string; target?: string; proposalId?: string } = {}): AuditEvent[] {
    const rows = this.database.db.prepare('SELECT data FROM audit_events ORDER BY seq').all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as AuditEvent).filter((e) => (!where.investigationId || e.investigationId === where.investigationId) && (!where.target || e.target.id === where.target) && (!where.proposalId || e.proposalId === where.proposalId));
  }
}

export class IdempotencyRepository {
  constructor(private readonly database: KorvynDatabase) {}
  get<T>(key: string): T | null { const r = this.database.db.prepare('SELECT result FROM idempotency WHERE key = ?').get(key) as { result: string } | undefined; return r ? (JSON.parse(r.result) as T) : null; }
  put(key: string, scope: string, actorId: string, result: unknown) { this.database.db.prepare('INSERT OR IGNORE INTO idempotency (key, scope, actor_id, at, result) VALUES (?, ?, ?, ?, ?)').run(key, scope, actorId, new Date().toISOString(), JSON.stringify(result)); }
}

export interface SessionRecord { id: string; userId: string; csrfToken: string; createdAt: string; expiresAt: string }
export class SessionRepository {
  constructor(private readonly database: KorvynDatabase) {}
  /** an opaque session id and its synchronizer CSRF token, both random; the browser holds the id only in an HttpOnly cookie */
  create(userId: string, ttlHours = 12): SessionRecord {
    const id = `SESSION-${randomBytes(24).toString('base64url')}`, csrfToken = randomBytes(24).toString('base64url'), t = new Date();
    const expiresAt = new Date(t.getTime() + ttlHours * 3600_000).toISOString();
    this.database.db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, csrf_token) VALUES (?, ?, ?, ?, ?)').run(id, userId, t.toISOString(), expiresAt, csrfToken);
    return { id, userId, csrfToken, createdAt: t.toISOString(), expiresAt };
  }
  /** a live session: not revoked and not expired */
  resolve(id: string): SessionRecord | null {
    const r = this.database.db.prepare('SELECT id, user_id, created_at, expires_at, revoked, csrf_token FROM sessions WHERE id = ?').get(id) as { id: string; user_id: string; created_at: string; expires_at: string; revoked: number; csrf_token: string | null } | undefined;
    return r && !r.revoked && r.expires_at > new Date().toISOString() && r.csrf_token ? { id: r.id, userId: r.user_id, csrfToken: r.csrf_token, createdAt: r.created_at, expiresAt: r.expires_at } : null;
  }
  revoke(id: string) { this.database.db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(id); }
}

/** everything the product needs, over one database */
export class WorkRepositories {
  readonly records: RecordStore;
  readonly comments: CommentRepository; readonly evidence: EvidenceRepository; readonly issues: IssueRepository; readonly assignments: ReviewerAssignmentRepository;
  readonly saved: SavedObjectRepository; readonly investigations: InvestigationRepository; readonly actions: ActionRepository;
  readonly reconciliations: ReconciliationRepository; readonly flux: FluxRepository; readonly close: CloseRepository; readonly reports: ReportRepository;
  readonly audit: AuditRepository; readonly idempotency: IdempotencyRepository; readonly sessions: SessionRepository;
  constructor(readonly database: KorvynDatabase) {
    this.records = new RecordStore(database);
    this.comments = new CommentRepository(this.records); this.evidence = new EvidenceRepository(this.records); this.issues = new IssueRepository(this.records);
    this.assignments = new ReviewerAssignmentRepository(this.records); this.saved = new SavedObjectRepository(this.records); this.investigations = new InvestigationRepository(this.records);
    this.actions = new ActionRepository(this.records); this.reconciliations = new ReconciliationRepository(this.records); this.flux = new FluxRepository(this.records);
    this.close = new CloseRepository(this.records); this.reports = new ReportRepository(this.records);
    this.audit = new AuditRepository(database); this.idempotency = new IdempotencyRepository(database); this.sessions = new SessionRepository(database);
  }
}
