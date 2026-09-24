/**
 * KORVYN WORK STATE — the service facade over the durable repositories (persistence/). Read tools, the action services
 * and the domain APIs for the Reconciliations and Flux modules all go through this ONE facade, so Sloane and the
 * modules read and write the same comments, support relationships, reviewers, issues and saved objects.
 *
 * Reads return plain view objects. Every mutation is a named method with an expected version (optimistic
 * concurrency) and an actor: there is no generic setter, no query language, and no path from a model output to a
 * write. `WORK` is a live ES-module binding re-pointed by `bindWork()` when the server opens its database.
 */
import { KorvynDatabase } from './persistence/db.js';
import { WorkRepositories } from './persistence/repositories.js';

export interface Comment {
  id: string; author: string; authorId: string; via: 'Sloane' | null; at: string; text: string; source: 'SLOANE' | 'UI' | 'SEED';
  version: number; investigationId: string | null; financialObjectIds: string[]; populationIds: string[];
  history: { version: number; text: string; at: string; by: string }[];
}
export interface Thread { key: string; version: number; comments: Comment[] }
export type RelationshipType = 'RECONCILIATION_SUPPORTS' | 'FLUX_SUPPORTS' | 'INVOICE_FOR' | 'PACKAGE_CONTAINS' | 'PO_FOR' | 'CONTRACT_FOR' | 'APPROVAL_FOR';
export interface EvidenceRelationship { id: string; type: RelationshipType; from: string; to: string; kind: string; label: string; createdBy: string; via: 'Sloane' | 'UI' | 'SYSTEM'; at: string; proposalId: string | null; documentConnected: false; sourceSystem: string }
export interface WorkActor { id: string; name: string }

export class WorkStore {
  constructor(readonly repos: WorkRepositories) {}

  /* ---- comment threads ---------------------------------------------------------------------------- */
  thread(key: string): Thread {
    const t = this.repos.comments.thread(key);
    return { key, version: t.version, comments: t.comments.map((c) => ({ id: c.id, author: c.author, authorId: c.authorId, via: c.via, at: c.createdAt, text: c.text, source: c.source, version: c.version, investigationId: c.investigationId ?? null, financialObjectIds: c.financialObjectIds, populationIds: c.populationIds, history: c.history })) };
  }
  addComment(key: string, text: string, actor: WorkActor, o: { via: 'Sloane' | null; source: 'SLOANE' | 'UI'; expectedThreadVersion: number | null; investigationId: string | null; financialObjectIds?: string[]; populationIds?: string[]; executionId?: string | null }): Comment {
    const c = this.repos.comments.add(key, { author: actor.name, authorId: actor.id, via: o.via, source: o.source, text, financialObjectIds: o.financialObjectIds ?? [], populationIds: o.populationIds ?? [], executionId: o.executionId ?? null }, o.expectedThreadVersion, actor.id, o.investigationId);
    return this.thread(key).comments.find((x) => x.id === c.id)!;
  }
  updateComment(id: string, text: string, expectedVersion: number, actor: WorkActor, via: 'Sloane' | null): Comment {
    const c = this.repos.comments.update(id, text, expectedVersion, actor.id, via);
    return this.thread(c.threadKey).comments.find((x) => x.id === id)!;
  }
  comment(id: string) { const c = this.repos.comments.get(id); return c ? this.thread(c.threadKey).comments.find((x) => x.id === id) ?? null : null; }

  /* ---- evidence graph ----------------------------------------------------------------------------- */
  private rel(r: ReturnType<WorkRepositories['evidence']['relsTo']>[number]): EvidenceRelationship {
    return { id: r.id, type: r.type as RelationshipType, from: r.from, to: r.to, kind: r.kind, label: r.label, createdBy: r.createdBy, via: r.createdVia, at: r.createdAt, proposalId: r.executionId, documentConnected: false, sourceSystem: r.sourceSystem };
  }
  relsTo(target: string) { return this.repos.evidence.relsTo(target).map((r) => this.rel(r)); }
  relsFrom(from: string) { return this.repos.evidence.relsFrom(from).map((r) => this.rel(r)); }
  get relationships() { return this.repos.evidence.all().map((r) => this.rel(r)); }
  relationshipVersion(target: string) { return this.repos.evidence.relationshipCount(target); }
  relate(r: { type: RelationshipType; from: string; to: string; kind: string; label: string; sourceSystem: string; via: 'Sloane' | 'UI' | 'SYSTEM'; executionId: string | null }, actor: WorkActor, investigationId: string | null) {
    this.repos.evidence.reference(r.from, r.kind, r.label, r.sourceSystem, actor.id);
    return this.rel(this.repos.evidence.relate({ type: r.type, from: r.from, to: r.to, kind: r.kind, label: r.label, sourceSystem: r.sourceSystem, createdVia: r.via, executionId: r.executionId }, actor.id, investigationId));
  }
  attachSupport(targetKey: string, evidenceRef: string, relationshipIds: string[], actor: WorkActor, executionId: string | null, investigationId: string | null) {
    return this.repos.evidence.attach({ targetKey, evidenceRef, relationshipIds, executionId }, actor.id, investigationId);
  }

  /* ---- issues, reviewers, saved objects ----------------------------------------------------------- */
  get issues() { return this.repos.issues.list(); }
  reviewer(key: string) { const c = this.repos.assignments.current(key); return c ? { name: c.reviewerName, id: c.reviewerId, version: c.version } : null; }
  savedOf(kind: 'ANALYSIS' | 'INVESTIGATION' | 'REPORT_DRAFT' | 'EXCEL_ARTIFACT' | 'SUPPORT_PACKAGE' | 'APPROVAL_REQUEST') {
    const k = ({ ANALYSIS: 'ANALYSIS', INVESTIGATION: 'INVESTIGATION_SHARE', REPORT_DRAFT: 'REPORT', EXCEL_ARTIFACT: 'EXCEL', SUPPORT_PACKAGE: 'PACKAGE', APPROVAL_REQUEST: 'APPROVAL_REQUEST' } as const)[kind];
    return this.repos.saved.list(k);
  }
}

let currentDb: KorvynDatabase | null = null;
/** the live binding every module reads; re-pointed when the server (or a test) opens its database */
export let WORK: WorkStore = null as unknown as WorkStore;
export function bindWork(db: KorvynDatabase): WorkStore {
  if (currentDb !== db) { currentDb = db; WORK = new WorkStore(new WorkRepositories(db)); }
  return WORK;
}
