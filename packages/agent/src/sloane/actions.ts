/**
 * CONTROLLED ACTIONS — the only path by which Sloane changes Korvyn work.
 *
 *   LLM understands and proposes → Korvyn validates → user confirms when required → Korvyn executes → traced.
 *
 * ActionGovernanceEngine   the authoritative class of every action type. It is the server port of the browser's
 *                          SI_ACTION_POLICY (same type names, same three classes). The model never supplies a class;
 *                          an unknown type is GOVERNED_ACTION (fail closed).
 * ActionProposal           a structured, versioned, editable proposal. Creating one writes nothing.
 * ActionService            one registered service per executable type: permission, validate, targetVersion, execute.
 *                          execute() is reachable ONLY from ActionEngine.decide(), which is reachable only from the
 *                          /api/sloane/action route after an explicit user confirmation. No tool, plan step or model
 *                          output can call it.
 * GOVERNED_ACTION          prepared with readiness and a route to the governed workflow; never executed here.
 *
 * DURABLE (Phase 3C). Proposals, executions, audit events and idempotency keys live in the work store (persistence/).
 * An execution runs inside ONE database transaction: the domain write, the ACTION_EXECUTION record, the append-only
 * AuditEvent, the investigation event, the idempotency key and the proposal's COMPLETED status commit together or not
 * at all. A proposal executes at most once — its execution key `EXECUTE:<proposalId>` is recorded in the same
 * transaction — and a replayed requestId returns the recorded response.
 * Concurrency: every proposal records the target's version when it was prepared. A changed target makes the proposal
 * STALE (code STALE_PROPOSAL). The user may refresh (re-read the target and confirm again), regenerate (supersede it
 * with a new proposal) or cancel. There is no overwrite.
 */
import { randomUUID } from 'node:crypto';
import type { ControlService } from './controls.js';
import { money, periodLabel } from './financials.js';
import type { GLine, GovernedLedger } from './governed.js';
import { AuthorizationService, SoDPolicyService, personId } from './auth.js';
import { StaleVersionError } from './persistence/repositories.js';
import { type RelationshipType, WORK } from './store.js';
import type { Actor, Permission } from './tools.js';

/* ================================================================================================
   GOVERNANCE — policy, not model output
   ================================================================================================ */
export type ActionClass = 'READ_ONLY' | 'CONFIRM_REQUIRED' | 'GOVERNED_ACTION';
export const ACTION_POLICY: Record<string, ActionClass> = {
  ANALYZE: 'READ_ONLY', FILTER: 'READ_ONLY', COMPARE: 'READ_ONLY', TRACE: 'READ_ONLY', PREVIEW: 'READ_ONLY',
  ADD_FLUX_COMMENT: 'CONFIRM_REQUIRED', UPDATE_FLUX_COMMENT: 'CONFIRM_REQUIRED',
  ADD_RECONCILIATION_COMMENT: 'CONFIRM_REQUIRED', UPDATE_RECONCILIATION_COMMENT: 'CONFIRM_REQUIRED',
  ATTACH_SUPPORT: 'CONFIRM_REQUIRED', CREATE_ISSUE: 'CONFIRM_REQUIRED', ASSIGN_REVIEWER: 'CONFIRM_REQUIRED',
  CREATE_SHARED_INVESTIGATION: 'CONFIRM_REQUIRED', SAVE_ANALYSIS: 'CONFIRM_REQUIRED', CREATE_SHARED_REPORT: 'CONFIRM_REQUIRED',
  CREATE_EXCEL_ARTIFACT: 'CONFIRM_REQUIRED', CREATE_SUPPORT_PACKAGE: 'CONFIRM_REQUIRED', REQUEST_GOVERNED_APPROVAL: 'CONFIRM_REQUIRED',
  /* workspace domain actions (3D): the user's own click is the confirmation; the same policy and audit as Sloane's */
  UPDATE_CLOSE_TASK_STATUS: 'CONFIRM_REQUIRED', SAVE_REPORT_DEFINITION: 'CONFIRM_REQUIRED',
  /* 4A: the authoritative Flux explanation, a recorded bank statement balance, and governed deliverables */
  UPDATE_FLUX_EXPLANATION: 'CONFIRM_REQUIRED', RECORD_RECONCILIATION_STATEMENT: 'CONFIRM_REQUIRED',
  GENERATE_EXCEL_ARTIFACT: 'CONFIRM_REQUIRED', REFRESH_EXCEL_ARTIFACT: 'CONFIRM_REQUIRED', SAVE_EXCEL_ARTIFACT: 'CONFIRM_REQUIRED', ARCHIVE_EXCEL_ARTIFACT: 'CONFIRM_REQUIRED', UPDATE_REPORT_DEFINITION: 'CONFIRM_REQUIRED', ARCHIVE_REPORT_DEFINITION: 'CONFIRM_REQUIRED', DELETE_REPORT_DEFINITION: 'CONFIRM_REQUIRED',
  RECONCILIATION_APPROVAL: 'GOVERNED_ACTION', CLOSE_CERTIFICATION: 'GOVERNED_ACTION', REPORT_PUBLICATION: 'GOVERNED_ACTION',
  MAPPING_CHANGE: 'GOVERNED_ACTION', DIMENSION_OVERRIDE: 'GOVERNED_ACTION', ERP_WRITE_BACK: 'GOVERNED_ACTION',
};
export const GOVERNED_ROUTE: Record<string, string> = {
  RECONCILIATION_APPROVAL: 'Reconciliations › review workflow — the assigned reviewer approves in Korvyn',
  CLOSE_CERTIFICATION: 'Close › certification — the Controller or CAO certifies in Korvyn',
  REPORT_PUBLICATION: 'Reporting Packages › publication workflow',
  MAPPING_CHANGE: 'Chart of Accounts › mapping change with impact preview and approval',
  DIMENSION_OVERRIDE: 'Account Activity › governed dimension override with approval',
  ERP_WRITE_BACK: 'Not supported — the ERP is the system of record; Korvyn never posts',
};
export const ActionGovernanceEngine = {
  classify: (type: string): ActionClass => ACTION_POLICY[type] ?? 'GOVERNED_ACTION',
  executable: (type: string) => ActionGovernanceEngine.classify(type) === 'CONFIRM_REQUIRED',
};

/* ================================================================================================
   PEOPLE — who can be assigned as a reviewer (authority, scope, segregation of duties)
   ================================================================================================ */
export const PEOPLE = [
  { id: 'user:mgiri', name: 'Mitra Giri', role: 'Controller', canReview: true, scope: 'ALL' as const },
  { id: 'user:lchen', name: 'Lin Chen', role: 'Accounting Manager', canReview: true, scope: 'ALL' as const },
  { id: 'user:skim', name: 'Sarah Kim', role: 'Assistant Controller', canReview: true, scope: 'ALL' as const },
  { id: 'user:slin', name: 'Sarah Lindqvist', role: 'Regional Controller, EMEA', canReview: true, scope: ['MER-UK', 'MER-DE'] },
  { id: 'user:spatel', name: 'Sarah Patel', role: 'Staff Accountant', canReview: false, scope: 'ALL' as const },
  { id: 'user:mreyes', name: 'Maria Reyes', role: 'Senior Accountant', canReview: false, scope: 'ALL' as const },
  { id: 'user:aokafor', name: 'Ade Okafor', role: 'Senior Accountant', canReview: false, scope: 'ALL' as const },
];
/** short names the seeded workflow uses, mapped to people (for segregation-of-duties checks) */
const INITIALS: Record<string, string> = { 'M. Reyes': 'user:mreyes', 'A. Okafor': 'user:aokafor', 'L. Chen': 'user:lchen', 'K. Weber': 'user:kweber', 'M. Giri': 'user:mgiri' };

/* ================================================================================================
   THE PROPOSAL
   ================================================================================================ */
export type ProposalStatus = 'PROPOSED' | 'VALIDATED' | 'WAITING_CONFIRMATION' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'SUPERSEDED' | 'STALE';
export interface ActionProposal {
  id: string; planId: string; sessionId: string; type: string; riskLevel: ActionClass;
  title: string; description: string;
  targetObjectId: string | null; targetObjectType: string | null; targetLabel: string | null;
  proposedPayload: Record<string, unknown>;
  editable: { field: string; label: string; multiline: boolean }[];
  sourceFinancialObjectIds: string[]; sourcePopulationIds: string[]; evidenceIds: string[];
  requestedBy: { id: string; name: string; role: string }; permissions: Permission[];
  validationStatus: 'VALID' | 'INVALID' | 'NEEDS_CHOICE'; validation: { errors: string[]; warnings: string[] };
  choice: { field: string; question: string; options: { id: string; label: string }[] } | null;
  confirmationRequired: boolean; executable: boolean;
  status: ProposalStatus; version: number; dependsOn: string[];
  targetVersion: number | null; investigationId: string | null; traceId: string | null;
  createdAt: string; updatedAt: string;
  governed: { route: string; readiness: { check: string; ok: boolean; detail: string }[] } | null;
  result: Record<string, unknown> | null; error: string | null; auditId: string | null;
  preview: { label: string; value: string }[];
}
export interface AuditRecord {
  auditId: string; actionId: string; actionType: string; riskLevel: ActionClass; actor: { id: string; name: string; role: string };
  requestedVia: 'Sloane'; at: string; target: { id: string | null; type: string | null; label: string | null };
  before: unknown; after: unknown; financialObjectIds: string[]; populationIds: string[]; evidenceIds: string[];
  confirmation: { confirmedBy: string; at: string; overwrite: boolean; requestId: string | null };
  investigationId: string | null; executionTraceId: string; proposalTraceId: string | null; outcome: 'COMPLETED' | 'FAILED'; error: string | null;
}

export interface ActionContext { gl: GovernedLedger; controls: ControlService; actor: Actor; expectedTargetVersion?: number | null; executionId?: string; artifacts?: import('./artifacts/engine.js').ArtifactEngine }
interface Service {
  type: string; permission: Permission; targetType: string;
  /** resolve target, derive preview, return errors/warnings; runs at proposal, edit, retarget and again before execution */
  validate(p: ActionProposal, c: ActionContext): { errors: string[]; warnings: string[]; choice?: ActionProposal['choice'] };
  targetVersion(p: ActionProposal, c: ActionContext): number | null;
  execute(p: ActionProposal, c: ActionContext, deps: ActionProposal[]): { before: unknown; after: unknown; afterRef?: string; result: Record<string, unknown>; timeline: string };
}

const now = () => new Date().toISOString();
const inScope = (a: Actor, entity: string | null) => !entity || entity === 'GROUP' ? a.scopeIds === 'ALL' : a.scopeIds === 'ALL' || a.scopeIds.includes(entity);
const who = (a: Actor) => ({ id: a.id, name: a.name });
const $ = (v: number) => money(v, 'USD');
const str = (p: ActionProposal, k: string) => String(p.proposedPayload[k] ?? '');
const figuresIn = (t: string) => (t.match(/\$?\(?\d[\d,]*(?:\.\d+)?\s?[MK]\)?/g) ?? []).map((x) => x.replace(/[\s$(),]/g, ''));

/* ---- target resolution ------------------------------------------------------------------------- */
function recTarget(p: ActionProposal, c: ActionContext) {
  const want = str(p, 'target').trim(), period = str(p, 'period');
  const defs = c.controls.allRecDefs().filter((d) => inScope(c.actor, d.entity));
  const idIn = (want.match(/REC-[A-Z0-9-]+?(?=[^A-Z0-9-]|$)/) ?? [])[0];
  const byId = defs.find((d) => d.id === want.replace(/^recon:/, '') || d.id === idIn);
  if (byId) return { def: byId, period };
  const norm = (x: string) => x.toLowerCase().replace(/[–—-]/g, '-').replace(/\s+/g, ' ');
  const t = norm(want).replace(/\breconciliation\b|\brec\b|\bthe\b/g, '').replace(/\s+/g, ' ').trim();
  const hits = t ? defs.filter((d) => norm(d.name).includes(t) || t.split(/\s+/).filter((w) => w.length > 2).every((w) => d.name.toLowerCase().includes(w === 'cip' ? 'construction in progress' : w))) : [];
  if (hits.length === 1) return { def: hits[0]!, period };
  const pool = hits.length ? hits : /cip|construction/.test(t) ? defs.filter((d) => d.accounts.includes('15000') || d.financialLineId === 'FS-CIP') : defs;
  return { def: null, period, choice: { field: 'target', question: want ? `No single reconciliation matches “${want}”. Which reconciliation?` : 'Which reconciliation?', options: pool.map((d) => ({ id: d.id, label: d.name })) } };
}
function fluxTarget(p: ActionProposal, c: ActionContext) {
  const code = str(p, 'account'), period = str(p, 'period');
  const item = code ? c.controls.fluxItems(period, c.actor.scopeIds === 'ALL' ? 'ALL' : new Set(c.actor.scopeIds)).find((i) => i.account === code) : null;
  return item ? { item, period } : null;
}
function evidenceFromPopulation(c: ActionContext, popId: string, kinds: string[]) {
  const def = c.gl.population(popId);
  if (!def) return null;
  const rows = c.gl.query(def, c.actor.scopeIds === 'ALL' ? 'ALL' : new Set(c.actor.scopeIds)).all.filter((l) => l.vendor && l.account !== '20100');
  const out: { ref: string; kind: string; label: string; line: GLine }[] = [];
  for (const l of rows) {
    if (kinds.includes('INVOICE') && l.invoiceRef) out.push({ ref: l.invoiceRef, kind: 'INVOICE', label: `Invoice ${l.invoiceRef} · ${l.vendor} · ${$(l.usd)}`, line: l });
    if (kinds.includes('PURCHASE_ORDER') && l.poRef) out.push({ ref: l.poRef, kind: 'PURCHASE_ORDER', label: `PO ${l.poRef} · ${l.vendor}`, line: l });
    if (kinds.includes('CONTRACT') && l.contractRef) out.push({ ref: l.contractRef, kind: 'CONTRACT', label: `Contract ${l.contractRef}`, line: l });
    if (kinds.includes('APPROVAL') && l.approvalRef) out.push({ ref: l.approvalRef, kind: 'APPROVAL', label: `Approval ${l.approvalRef}`, line: l });
  }
  const uniq = new Map(out.map((e) => [e.ref, e]));
  return { items: [...uniq.values()], lines: rows, def };
}

/* ================================================================================================
   ACTION SERVICES
   ================================================================================================ */
function commentService(kind: 'flux' | 'recon', mode: 'add' | 'update'): Service {
  const type = `${mode === 'add' ? 'ADD' : 'UPDATE'}_${kind === 'flux' ? 'FLUX' : 'RECONCILIATION'}_COMMENT`;
  const threadOf = (p: ActionProposal, c: ActionContext) => {
    if (kind === 'flux') { const t = fluxTarget(p, c); return t ? { key: `flux:${t.item.account}:${t.period}`, label: `Flux review · ${t.item.name} · ${periodLabel(t.period)}`, closed: null as string | null, entity: 'GROUP', facts: [t.item.changeUsd, t.item.currentUsd, t.item.priorUsd] } : null; }
    const r = recTarget(p, c); if (!r.def) return null;
    const rec = c.controls.reconcile(r.def, r.period);
    return { key: `recon:${r.def.id}:${r.period}`, label: `Reconciliation · ${r.def.name} · ${periodLabel(r.period)}`, closed: rec.workflow.status === 'APPROVED' ? 'the reconciliation is approved and closed to comments' : null, entity: r.def.entity, facts: rec.balanceInModule ? [] : [rec.glBalanceUsd, rec.differenceUsd ?? 0, ...rec.items.map((i) => i.amountUsd)] };
  };
  return {
    type, permission: kind === 'flux' ? 'FLUX_COMMENT' : 'RECON_COMMENT', targetType: kind === 'flux' ? 'FLUX_ITEM' : 'RECONCILIATION',
    validate(p, c) {
      const errors: string[] = [], warnings: string[] = [];
      let choice: ActionProposal['choice'] | undefined = undefined;
      if (kind === 'recon') { const r = recTarget(p, c); if (!r.def) { choice = r.choice; if (!r.choice?.options.length) errors.push('No reconciliation you may comment on matches.'); } }
      const th = threadOf(p, c);
      if (!th) { if (!choice) errors.push(kind === 'flux' ? `No flux item ${str(p, 'account') || '(none named)'} in ${periodLabel(str(p, 'period') || '2026-06')}.` : 'Reconciliation not resolved.'); return { errors, warnings, ...(choice ? { choice } : {}) }; }
      p.targetObjectId = th.key; p.targetObjectType = this.targetType; p.targetLabel = th.label;
      if (!inScope(c.actor, th.entity)) errors.push(`${c.actor.role} may not comment on ${th.label} (outside your entity scope).`);
      if (th.closed) errors.push(`Target closed: ${th.closed}.`);
      const text = str(p, 'text').trim();
      if (!text) errors.push('The comment is empty.');
      if (text.length > 2000) errors.push('The comment is longer than 2,000 characters.');
      if (mode === 'update') {
        const cm = WORK.thread(th.key).comments.find((x) => x.id === str(p, 'commentId'));
        if (!cm) errors.push(`Comment ${str(p, 'commentId') || '(none)'} does not exist on ${th.label}.`);
        else if (cm.author !== c.actor.name) errors.push(`Only ${cm.author} can edit that comment.`);
      }
      /* a figure the user typed that the target does not carry is flagged, never silently accepted or rewritten */
      const known = new Set([...th.facts.flatMap((v) => figuresIn($(v))), ...((p.proposedPayload['groundedFigures'] as string[] | undefined) ?? []).flatMap(figuresIn)]);
      const typed = figuresIn(text).filter((f) => /M|K/.test(f));
      const unknown = typed.filter((f) => !known.has(f));
      if (unknown.length) warnings.push(`The comment states ${unknown.map((u) => `$${u}`).join(', ')}, which is neither a figure on ${th.label} nor in the analysis it came from (${th.facts.length ? `the target carries ${th.facts.slice(0, 3).map($).join(', ')}` : 'its balance is computed by the Reconciliations module'}).`);
      p.preview = [{ label: 'Destination', value: th.label }, { label: mode === 'add' ? 'Comment' : 'Updated comment', value: text }, { label: 'Author', value: `${c.actor.name} via Sloane` }];
      return { errors, warnings };
    },
    targetVersion(p, c) { const th = threadOf(p, c); if (!th) return null; if (mode === 'update') return WORK.thread(th.key).comments.find((x) => x.id === str(p, 'commentId'))?.version ?? null; return WORK.thread(th.key).version; },
    execute(p, c) {
      const th = threadOf(p, c)!, text = str(p, 'text').trim();
      const t = WORK.thread(th.key);
      const before = { threadVersion: t.version, comments: t.comments.length, ...(mode === 'update' ? { comment: WORK.comment(str(p, 'commentId')) } : {}) };
      /* the repository re-checks the version inside the transaction: a concurrent writer raises STALE_PROPOSAL */
      const cm = mode === 'add'
        ? WORK.addComment(th.key, text, who(c.actor), { via: 'Sloane', source: 'SLOANE', expectedThreadVersion: c.expectedTargetVersion ?? null, investigationId: p.investigationId, financialObjectIds: p.sourceFinancialObjectIds, populationIds: p.sourcePopulationIds, executionId: c.executionId ?? null })
        : WORK.updateComment(str(p, 'commentId'), text, c.expectedTargetVersion ?? -1, who(c.actor), 'Sloane');
      return { before, after: { commentId: cm.id, version: cm.version, threadVersion: WORK.thread(th.key).version, text: cm.text }, afterRef: cm.id, result: { commentId: cm.id, version: cm.version, target: th.label, author: `${cm.author} via Sloane` }, timeline: `${mode === 'add' ? 'Created' : 'Updated'} ${kind === 'flux' ? 'Flux' : 'reconciliation'} comment on ${th.label}` };
    },
  };
}

const RELATIONSHIP: Record<string, RelationshipType> = { INVOICE: 'INVOICE_FOR', PURCHASE_ORDER: 'PO_FOR', CONTRACT: 'CONTRACT_FOR', APPROVAL: 'APPROVAL_FOR' };
const attachService: Service = {
  type: 'ATTACH_SUPPORT', permission: 'SUPPORT_ATTACH', targetType: 'SUPPORT_TARGET',
  validate(p, c) {
    const errors: string[] = [], warnings: string[] = [];
    let label: string, key: string, entity = 'GROUP';
    if (str(p, 'targetType') === 'FLUX') {
      const t = fluxTarget(p, c); if (!t) return { errors: [`No flux item ${str(p, 'account')} in ${periodLabel(str(p, 'period'))}.`], warnings };
      key = `flux:${t.item.account}:${t.period}`; label = `Flux review · ${t.item.name} · ${periodLabel(t.period)}`; p.targetObjectType = 'FLUX_ITEM';
    } else {
      const r = recTarget(p, c); if (!r.def) return { errors: r.choice?.options.length ? [] : ['No reconciliation you may attach to matches.'], warnings, ...(r.choice ? { choice: r.choice } : {}) };
      key = `recon:${r.def.id}:${r.period}`; label = `Reconciliation · ${r.def.name} · ${periodLabel(r.period)}`; entity = r.def.entity; p.targetObjectType = 'RECONCILIATION';
      if (c.controls.reconcile(r.def, r.period).workflow.status === 'APPROVED') errors.push('Target closed: the reconciliation is approved; support changes reopen review and are governed.');
    }
    p.targetObjectId = key; p.targetLabel = label;
    if (!inScope(c.actor, entity)) errors.push(`${c.actor.role} may not attach support to ${label} (outside your entity scope).`);
    const kinds = String(p.proposedPayload['kinds'] ?? 'INVOICE').split(',').map((k) => k.trim()).filter(Boolean);
    let items: { ref: string; kind: string; label: string }[] = [];
    const pkg = str(p, 'fromPackage') ? 'support package created by the preceding action' : null;
    if (pkg) items = [{ ref: '(package — created on confirmation)', kind: 'SUPPORT_PACKAGE', label: `Support package · ${pkg}` }];
    else {
      const pop = str(p, 'populationId');
      const ev = pop ? evidenceFromPopulation(c, pop, kinds) : null;
      if (!ev) errors.push(pop ? `Population ${pop} is not defined in this session.` : 'No population or evidence was named to attach.');
      else {
        items = ev.items.map((e) => ({ ref: e.ref, kind: e.kind, label: e.label }));
        const noRef = ev.lines.filter((l) => kinds.includes('INVOICE') && !l.invoiceRef);
        if (!ev.lines.length) warnings.push('The population has no AP-sourced lines, so no vendor documents apply.');
        if (noRef.length) warnings.push(`${noRef.length} AP line(s) in the population carry no invoice reference and cannot be attached.`);
      }
      const already = new Set(WORK.relsTo(key).map((r) => r.from));
      const dup = items.filter((i) => already.has(i.ref));
      if (dup.length) { warnings.push(`${dup.length} item(s) are already attached and will be skipped.`); items = items.filter((i) => !already.has(i.ref)); }
      if (!items.length && !errors.length) errors.push('Nothing new to attach.');
    }
    p.proposedPayload['items'] = items; p.evidenceIds = items.map((i) => i.ref);
    p.preview = [{ label: 'Destination', value: label }, { label: `Support to attach (${items.length})`, value: items.slice(0, 8).map((i) => i.label).join('\n') + (items.length > 8 ? `\n… and ${items.length - 8} more` : '') }, { label: 'Documents', value: 'References to the authoritative source — no document is copied (documents are not connected)' }];
    return { errors, warnings };
  },
  targetVersion: (p) => WORK.relationshipVersion(p.targetObjectId ?? ''),
  execute(p, c, deps) {
    const key = p.targetObjectId!, rel: RelationshipType = p.targetObjectType === 'FLUX_ITEM' ? 'FLUX_SUPPORTS' : 'RECONCILIATION_SUPPORTS';
    const before = WORK.relsTo(key).length;
    let items = p.proposedPayload['items'] as { ref: string; kind: string; label: string }[];
    if (str(p, 'fromPackage')) {
      const pkg = deps.find((d) => d.id === str(p, 'fromPackage') && d.status === 'COMPLETED');
      if (!pkg?.result?.['packageId']) throw new Error('the support package it depends on has not been created');
      items = [{ ref: String(pkg.result['packageId']), kind: 'SUPPORT_PACKAGE', label: `Support package ${pkg.result['packageId']}` }];
    }
    const created: { id: string; from: string; type: string; to: string }[] = [];
    const already = new Set(WORK.relsTo(key).map((r) => r.from));
    for (const it of items) {
      if (already.has(it.ref)) continue;
      const line = c.gl.lines.find((l) => l.invoiceRef === it.ref || l.poRef === it.ref || l.contractRef === it.ref || l.approvalRef === it.ref);
      const system = line ? `${line.connector} ${line.externalId}` : 'Korvyn';
      const r = WORK.relate({ type: rel, from: it.ref, to: key, kind: it.kind, label: it.label, sourceSystem: system, via: 'Sloane', executionId: c.executionId ?? null }, who(c.actor), p.investigationId);
      const ids = [r.id]; created.push(r);
      /* the document's own relationship to the transaction it evidences */
      if (line && RELATIONSHIP[it.kind]) { const t = WORK.relate({ type: RELATIONSHIP[it.kind]!, from: it.ref, to: `txn:${line.key}`, kind: it.kind, label: it.label, sourceSystem: system, via: 'Sloane', executionId: c.executionId ?? null }, who(c.actor), p.investigationId); ids.push(t.id); created.push(t); }
      WORK.attachSupport(key, it.ref, ids, who(c.actor), c.executionId ?? null, p.investigationId);
    }
    const attached = created.filter((x) => x.type === rel).length;
    return { before: { relationships: before }, after: { relationships: WORK.relsTo(key).length, created: created.map((x) => `${x.from} ${x.type} ${x.to}`) }, afterRef: created.map((x) => x.id).join(','), result: { attached, relationships: created.length, target: p.targetLabel }, timeline: `Attached ${attached} evidence item(s) to ${p.targetLabel}` };
  },
};

const issueService: Service = {
  type: 'CREATE_ISSUE', permission: 'ISSUE_CREATE', targetType: 'ISSUE',
  validate(p, c) {
    const errors: string[] = [], warnings: string[] = [];
    const title = str(p, 'title').trim();
    if (!title) errors.push('The issue needs a title.');
    const amt = p.proposedPayload['amountUsd'];
    const known = (p.proposedPayload['knownFigures'] as number[] | undefined) ?? [];
    if (typeof amt === 'number' && known.length && !known.some((k) => Math.abs(Math.abs(k) - Math.abs(amt)) < 50_000)) warnings.push(`${$(amt)} does not match a governed figure in the current analysis (${known.slice(0, 4).map($).join(', ')}). The issue will record the amount as stated.`);
    p.targetObjectId = null; p.targetObjectType = 'ISSUE'; p.targetLabel = 'New issue';
    const links = (p.proposedPayload['links'] as { ref: string; label: string }[] | undefined) ?? [];
    p.preview = [{ label: 'Issue', value: title }, { label: 'Description', value: str(p, 'description') }, { label: 'Amount', value: typeof amt === 'number' ? $(amt) : 'not stated' }, { label: 'Linked to', value: links.map((l) => l.label).join(' · ') || 'nothing' }, { label: 'Owner', value: str(p, 'owner') || 'unassigned' }];
    void c;
    return { errors, warnings };
  },
  targetVersion: () => null,
  execute(p, c) {
    const i = WORK.repos.issues.create({ title: str(p, 'title').trim(), description: str(p, 'description'), amountUsd: typeof p.proposedPayload['amountUsd'] === 'number' ? p.proposedPayload['amountUsd'] as number : null, links: (p.proposedPayload['links'] as { ref: string; label: string }[]) ?? [], owner: str(p, 'owner') || null, createdVia: 'Sloane', executionId: c.executionId ?? null }, c.actor.id, str(p, 'period') || null, p.investigationId);
    return { before: null, after: { id: i.id, title: i.title, amountUsd: i.amountUsd, status: i.status }, afterRef: i.id, result: { issueId: i.id, title: i.title }, timeline: `Created issue ${i.id} · ${i.title}` };
  },
};

function reviewerCandidates(name: string, entity: string) {
  const n = name.toLowerCase().replace(/^(user:)/, '').trim();
  const named = PEOPLE.filter((x) => x.id === name || x.name.toLowerCase() === n || x.name.toLowerCase().split(' ').includes(n) || x.name.toLowerCase().startsWith(n));
  const authorized = named.filter((x) => x.canReview && (x.scope === 'ALL' || (entity !== 'GROUP' && x.scope.includes(entity))));
  return { named, authorized };
}
const assignService: Service = {
  type: 'ASSIGN_REVIEWER', permission: 'REVIEW_ASSIGN', targetType: 'REVIEW_TARGET',
  validate(p, c) {
    const errors: string[] = [], warnings: string[] = [];
    let key: string, label: string, entity = 'GROUP', preparer: string | null = null;
    if (str(p, 'targetType') === 'FLUX') {
      const t = fluxTarget(p, c); if (!t) return { errors: [`No flux item ${str(p, 'account')} in ${periodLabel(str(p, 'period'))}.`], warnings };
      key = `flux:${t.item.account}:${t.period}`; label = `Flux review · ${t.item.name} · ${periodLabel(t.period)}`; preparer = t.item.explanation?.author ?? null;
    } else {
      const r = recTarget(p, c); if (!r.def) return { errors: [], warnings, ...(r.choice ? { choice: r.choice } : {}) };
      const rec = c.controls.reconcile(r.def, r.period);
      key = `recon:${r.def.id}:${r.period}`; label = `Reconciliation · ${r.def.name} · ${periodLabel(r.period)}`; entity = r.def.entity; preparer = r.def.preparer;
      if (rec.workflow.status === 'APPROVED') errors.push('Target closed: the reconciliation is already approved.');
    }
    p.targetObjectId = key; p.targetLabel = label; p.targetObjectType = str(p, 'targetType') === 'FLUX' ? 'FLUX_ITEM' : 'RECONCILIATION';
    if (!inScope(c.actor, entity)) errors.push(`${c.actor.role} may not assign work on ${label} (outside your entity scope).`);
    const who = str(p, 'reviewer');
    const cand = reviewerCandidates(who, entity);
    const chosen = PEOPLE.find((x) => x.id === who) ?? (cand.authorized.length === 1 ? cand.authorized[0] : null);
    let choice: ActionProposal['choice'] | undefined = undefined;
    if (!who) errors.push('No reviewer was named.');
    else if (!cand.named.length && !chosen) errors.push(`No one named “${who}” is in the Korvyn directory.`);
    else if (!chosen && cand.authorized.length > 1) choice = { field: 'reviewer', question: `More than one authorized reviewer matches “${who}”. Who should review?`, options: cand.authorized.map((x) => ({ id: x.id, label: `${x.name} · ${x.role}` })) };
    else if (!chosen) errors.push(`${cand.named.map((x) => `${x.name} (${x.role})`).join(', ')} ${cand.named.length > 1 ? 'are' : 'is'} not authorized to review ${label}.`);
    if (chosen) {
      const unauthorized = cand.named.filter((x) => !cand.authorized.includes(x));
      if (!chosen.canReview || !(chosen.scope === 'ALL' || (entity !== 'GROUP' && chosen.scope.includes(entity)))) errors.push(`${chosen.name} is not authorized to review ${label}.`);
      for (const r of SoDPolicyService.evaluate('ASSIGN_REVIEWER', { actorId: c.actor.id, preparerId: personId(preparer), reviewerId: chosen.id })) if (!r.ok) errors.push(`Segregation of duties (${r.policyId}): ${chosen.name} — ${r.reason}.`);
      if (chosen.id === c.actor.id) warnings.push('You are assigning yourself as reviewer.');
      if (unauthorized.length) warnings.push(`${unauthorized.map((x) => x.name).join(', ')} also match${unauthorized.length === 1 ? 'es' : ''} but ${unauthorized.length === 1 ? 'is' : 'are'} not an authorized reviewer.`);
      p.proposedPayload['reviewerId'] = chosen.id; p.proposedPayload['reviewerName'] = chosen.name;
    }
    const current = WORK.reviewer(key)?.name ?? (p.targetObjectType === 'RECONCILIATION' ? recTarget(p, c).def?.reviewer : null) ?? null;
    p.preview = [{ label: 'Review target', value: label }, { label: 'Reviewer', value: chosen ? `${chosen.name} · ${chosen.role}` : who || '—' }, { label: 'Current reviewer', value: current ?? 'none' }];
    return { errors, warnings, ...(choice ? { choice } : {}) };
  },
  targetVersion: (p) => WORK.reviewer(p.targetObjectId ?? '')?.version ?? 0,
  execute(p, c) {
    const key = p.targetObjectId!, prev = WORK.reviewer(key)?.name ?? null, name = str(p, 'reviewerName');
    const a = WORK.repos.assignments.assign({ targetKey: key, targetLabel: p.targetLabel!, reviewerId: str(p, 'reviewerId'), reviewerName: name, previousReviewer: prev, executionId: c.executionId ?? null }, c.actor.id, c.expectedTargetVersion ?? null, p.investigationId);
    return { before: { reviewer: prev }, after: { reviewer: name }, afterRef: a.id, result: { assignmentId: a.id, reviewer: name, target: p.targetLabel }, timeline: `Assigned ${name} as reviewer of ${p.targetLabel}` };
  },
};

function savedService(type: string, kind: 'ANALYSIS' | 'INVESTIGATION' | 'REPORT_DRAFT' | 'EXCEL_ARTIFACT' | 'SUPPORT_PACKAGE' | 'APPROVAL_REQUEST', permission: Permission, noun: string): Service {
  return {
    type, permission, targetType: kind,
    validate(p, c) {
      const errors: string[] = [], warnings: string[] = [];
      const name = str(p, 'name').trim();
      if (!name) errors.push(`The ${noun} needs a name.`);
      if (kind !== 'APPROVAL_REQUEST' && WORK.savedOf(kind).some((s) => s.name.toLowerCase() === name.toLowerCase() && s.createdBy === c.actor.id)) warnings.push(`You already have a ${noun} named “${name}”; this creates a new one.`);
      const share = ((p.proposedPayload['shareWith'] as string[] | undefined) ?? []).filter(Boolean);
      const domains = (p.proposedPayload['requiredPermissions'] as Permission[] | undefined) ?? [];
      for (const s of share) {
        const person = PEOPLE.find((x) => x.id === s || x.name.toLowerCase() === s.toLowerCase() || x.name.toLowerCase().split(' ')[0] === s.toLowerCase());
        if (!person) { errors.push(`Cannot share with “${s}”: not in the Korvyn directory.`); continue; }
        if (!person.canReview && domains.includes('AUDIT_VIEW')) errors.push(`Cannot share with ${person.name}: the investigation contains audit objects they may not view.`);
      }
      if (kind === 'SUPPORT_PACKAGE' && !c.gl.population(str(p, 'populationId'))) errors.push(`Population ${str(p, 'populationId') || '(none)'} is not defined in this session.`);
      p.targetObjectId = null; p.targetObjectType = kind; p.targetLabel = `New ${noun}`;
      const def = p.proposedPayload['definition'] as Record<string, unknown> | undefined;
      p.preview = [{ label: noun[0]!.toUpperCase() + noun.slice(1), value: name }, ...((p.proposedPayload['summary'] as { label: string; value: string }[] | undefined) ?? []), ...(share.length ? [{ label: 'Share with', value: share.join(', ') }] : []), ...(def && kind === 'REPORT_DRAFT' ? [{ label: 'Status', value: 'Draft — not published' }] : [])];
      return { errors, warnings };
    },
    targetVersion: () => null,
    execute(p, c) {
      const name = str(p, 'name').trim();
      let definition = (p.proposedPayload['definition'] as Record<string, unknown>) ?? {};
      if (kind === 'SUPPORT_PACKAGE') {
        const def = c.gl.population(str(p, 'populationId'))!, q = c.gl.query(def, c.actor.scopeIds === 'ALL' ? 'ALL' : new Set(c.actor.scopeIds));
        const ap = q.all.filter((l) => l.vendor && l.account !== '20100');
        definition = { populationId: def.id, filter: def.filter, transactions: q.rowCount, netUsd: q.netUsd,
          invoiceReferences: ap.filter((l) => l.invoiceRef).map((l) => l.invoiceRef), poReferences: [...new Set(ap.map((l) => l.poRef).filter(Boolean))], contractReferences: [...new Set(ap.map((l) => l.contractRef).filter(Boolean))], approvalReferences: ap.filter((l) => l.approvalRef).map((l) => l.approvalRef),
          missingEvidence: ap.filter((l) => !l.invoiceRef || (l.approvalRequired && !l.approvalRef)).map((l) => ({ transaction: l.key, missing: [!l.invoiceRef ? 'invoice' : '', l.approvalRequired && !l.approvalRef ? 'approval' : ''].filter(Boolean) })),
          status: 'DRAFT — not finalized; documents not fetched' };
      }
      const repoKind = ({ ANALYSIS: 'ANALYSIS', INVESTIGATION: 'INVESTIGATION_SHARE', REPORT_DRAFT: 'REPORT', EXCEL_ARTIFACT: 'EXCEL', SUPPORT_PACKAGE: 'PACKAGE', APPROVAL_REQUEST: 'APPROVAL_REQUEST' } as const)[kind];
      const s = WORK.repos.saved.create(repoKind, { name, definition, sharedWith: ((p.proposedPayload['shareWith'] as string[] | undefined) ?? []).filter(Boolean), createdVia: 'Sloane', executionId: c.executionId ?? null }, c.actor.id, { investigationId: p.investigationId });
      if (kind === 'SUPPORT_PACKAGE') for (const ref of [...(definition['invoiceReferences'] as string[]), ...(definition['poReferences'] as string[])]) WORK.relate({ type: 'PACKAGE_CONTAINS', from: s.id, to: ref, kind: 'REFERENCE', label: ref, sourceSystem: 'Korvyn', via: 'Sloane', executionId: c.executionId ?? null }, who(c.actor), p.investigationId);
      return { before: null, after: { id: s.id, kind, name }, afterRef: s.id, result: { [kind === 'SUPPORT_PACKAGE' ? 'packageId' : 'savedId']: s.id, name, ...(s.sharedWith.length ? { sharedWith: s.sharedWith } : {}) }, timeline: `${kind === 'APPROVAL_REQUEST' ? 'Routed' : 'Created'} ${noun} ${s.id} · ${name}` };
    },
  };
}

/* ---- 4A: governed deliverables. Validation reads the Artifact Engine; execution RECORDS the generation (inside the
   action's transaction) and starts the job, which streams the file after the transaction commits. ------------------ */
function artifactOf(p: ActionProposal, c: ActionContext) {
  const id = str(p, 'artifactId');
  const a = id && c.artifacts ? c.artifacts.get(id) : null;
  return { id, a };
}
const generateService: Service = {
  type: 'GENERATE_EXCEL_ARTIFACT', permission: 'ARTIFACT_CREATE', targetType: 'EXCEL_ARTIFACT',
  validate(p, c) {
    const errors: string[] = [], warnings: string[] = [];
    const { id, a } = artifactOf(p, c);
    if (!c.artifacts) return { errors: ['The Artifact Engine is not available.'], warnings };
    if (!a) return { errors: [id ? `No workbook ${id}.` : 'There is no saved workbook in this conversation to generate.'], warnings };
    const v = c.artifacts.view(c.actor, a.id);
    if (!v) return { errors: [`No workbook ${a.id}.`], warnings };
    errors.push(...c.artifacts.authorize(c.actor, a.definition));
    if (v.stale) errors.push(`The governed data behind v${a.version} has changed (${v.staleReasons.join('; ')}). Refresh the workbook — that creates v${a.version + 1} — before generating.`);
    const m = c.artifacts.compose(c.actor, a.definition, a.version, a.id);
    const fmt = str(p, 'format') === 'csv' ? 'csv' : 'xlsx';
    /* the package's own validation model decides: a FAIL blocks, a WARN is stated on the proposal and on the file */
    const val = c.artifacts.validate(c.actor, a.definition, m);
    for (const x of val.checks.filter((y) => y.status === 'FAIL' && y.check !== 'Permissions')) errors.push(/has no lines/.test(x.detail) ? `${x.detail} Widen the filter (e.g. a lower amount threshold) first.` : x.detail);
    if (a.status === 'ARCHIVED') errors.push(`${a.name} is archived. Restore it before generating.`);
    const hasTie = a.definition.sheets.some((s) => s.kind === 'TIEOUT');
    if (hasTie && m.tieOut && m.tieOut.status !== 'TIED') warnings.push(`Tie-out ${m.tieOut.status.replace(/_/g, ' ')}: the file will be labelled NOT audit-ready. Confirming acknowledges this.`);
    warnings.push(...m.warnings.filter((w) => /partition|not yet governed/.test(w)));
    for (const x of val.checks.filter((y) => y.status === 'WARN' && y.check !== 'Tie-out')) warnings.push(`${x.check}: ${x.detail}`);
    const big = m.populations.find((q) => q.rowCount > 2_000_000);
    if (big && fmt === 'xlsx') warnings.push(`The population is ${big.rowCount.toLocaleString('en-US')} lines. Excel would require ${m.sheets.filter((s) => s.part).length} worksheets — a CSV extract may be more practical.`);
    p.targetObjectId = `artifact:${a.id}`; p.targetObjectType = 'EXCEL_ARTIFACT'; p.targetLabel = `${a.name} v${a.version}`;
    p.preview = [{ label: 'Workbook', value: `${a.name} · v${a.version}` }, { label: 'File', value: fmt === 'csv' ? m.csvFileName : m.fileName },
      ...m.sheets.map((s) => ({ label: `Tab · ${s.name}`, value: `${s.rowCount.toLocaleString('en-US')} rows` })),
      ...(m.tieOut ? [{ label: 'Tie-out', value: `${m.tieOut.status.replace(/_/g, ' ')} · difference ${m.tieOut.differenceUsd.toFixed(2)} USD` }] : []),
      { label: 'Audit-ready', value: m.auditReady ? 'Yes' : 'No' }, { label: 'Validation', value: val.status.replace(/_/g, ' ').toLowerCase() }, { label: 'Generated', value: 'Server-side, from the pinned governed populations' }];
    return { errors, warnings };
  },
  targetVersion: (p, c) => artifactOf(p, c).a?.version ?? null,
  execute(p, c) {
    const { a } = artifactOf(p, c);
    const r = c.artifacts!.requestGeneration(c.actor, a!.id, { format: str(p, 'format') === 'csv' ? 'csv' : 'xlsx', expectedVersion: c.expectedTargetVersion ?? null, acknowledge: true, channel: 'SLOANE', investigationId: p.investigationId });
    if (!r.ok) { if (r.code === 'STALE_VERSION') throw new StaleVersionError('EXCEL_ARTIFACT', a!.id, c.expectedTargetVersion ?? 0, a!.version); throw new Error(r.reason); }
    return { before: null, after: { generationId: r.generationId, fileName: r.fileName }, afterRef: r.generationId,
      result: { artifactId: a!.id, artifactVersion: String(a!.version), generationId: r.generationId, jobId: r.job.id, fileName: r.fileName, status: 'GENERATING', jobUrl: `/api/work/artifacts/jobs/${r.job.id}` },
      timeline: `Generating ${r.fileName} (${a!.name} v${a!.version})` };
  },
};
const refreshService: Service = {
  type: 'REFRESH_EXCEL_ARTIFACT', permission: 'ARTIFACT_CREATE', targetType: 'EXCEL_ARTIFACT',
  validate(p, c) {
    const { id, a } = artifactOf(p, c);
    if (!a) return { errors: [id ? `No workbook ${id}.` : 'There is no saved workbook in this conversation.'], warnings: [] };
    const v = c.artifacts!.view(c.actor, a.id)!;
    p.targetObjectId = `artifact:${a.id}`; p.targetObjectType = 'EXCEL_ARTIFACT'; p.targetLabel = `${a.name} v${a.version}`;
    p.preview = [{ label: 'Workbook', value: `${a.name} · v${a.version} → v${a.version + 1}` }, { label: 'Why', value: v.stale ? v.staleReasons.join('; ') : 'Not stale — a refresh records the same definition against the current data' }];
    return { errors: [], warnings: v.stale ? [] : ['The workbook is not stale.'] };
  },
  targetVersion: (p, c) => artifactOf(p, c).a?.version ?? null,
  execute(p, c) {
    const { a } = artifactOf(p, c);
    const r = c.artifacts!.refresh(c.actor, a!.id, c.expectedTargetVersion ?? null, 'SLOANE');
    if (!r.ok) throw new Error(r.reason);
    return { before: { version: a!.version }, after: { version: r.artifact.version }, afterRef: a!.id, result: { artifactId: a!.id, artifactVersion: String(r.artifact.version) }, timeline: `Refreshed ${a!.name} to v${r.artifact.version}` };
  },
};
/** SAVED / ARCHIVED — a package's lifecycle state; the definition and its versions are untouched */
const lifecycleService = (type: 'SAVE_EXCEL_ARTIFACT' | 'ARCHIVE_EXCEL_ARTIFACT'): Service => ({
  type, permission: 'ARTIFACT_CREATE', targetType: 'EXCEL_ARTIFACT',
  validate(p, c) {
    const { id, a } = artifactOf(p, c);
    if (!c.artifacts) return { errors: ['The Artifact Engine is not available.'], warnings: [] };
    if (!a) return { errors: [id ? `No workbook ${id}.` : 'There is no saved workbook in this conversation.'], warnings: [] };
    const to = type === 'SAVE_EXCEL_ARTIFACT' ? 'SAVED' : 'ARCHIVED';
    p.targetObjectId = `artifact:${a.id}`; p.targetObjectType = 'EXCEL_ARTIFACT'; p.targetLabel = `${a.name} v${a.version}`;
    p.preview = [{ label: 'Workbook', value: `${a.name} · v${a.version}` }, { label: 'Status', value: `${(a.status ?? "DRAFT").toLowerCase()} → ${to.toLowerCase()}` },
      { label: 'Versions', value: `${a.history.length + 1} kept${to === 'ARCHIVED' ? '; generated files stay downloadable; generating needs a restore' : ''}` }];
    const errors = a.status === 'GENERATING' ? ['The workbook is generating; wait for it to finish or cancel the job.'] : [];
    return { errors, warnings: a.status === to ? [`${a.name} is already ${to.toLowerCase()}.`] : [] };
  },
  targetVersion: (p, c) => artifactOf(p, c).a?.version ?? null,
  execute(p, c) {
    const { a } = artifactOf(p, c);
    const to = type === 'SAVE_EXCEL_ARTIFACT' ? 'SAVED' : 'ARCHIVED';
    const r = c.artifacts!.setStatus(c.actor, a!.id, to, { via: 'SLOANE', expectedVersion: c.expectedTargetVersion ?? null });
    if (!r.ok) { if (r.code === 'STALE_VERSION') throw new StaleVersionError('EXCEL_ARTIFACT', a!.id, c.expectedTargetVersion ?? 0, a!.version); throw new Error(r.reason); }
    return { before: { status: a!.status }, after: { status: to }, afterRef: a!.id, result: { artifactId: a!.id, artifactVersion: String(a!.version), status: to }, timeline: `${to === 'SAVED' ? 'Saved' : 'Archived'} ${a!.name} (v${a!.version})` };
  },
});

const SERVICES: Service[] = [
  commentService('flux', 'add'), commentService('flux', 'update'), commentService('recon', 'add'), commentService('recon', 'update'),
  attachService, issueService, assignService, generateService, refreshService, lifecycleService('SAVE_EXCEL_ARTIFACT'), lifecycleService('ARCHIVE_EXCEL_ARTIFACT'),
  savedService('CREATE_SHARED_INVESTIGATION', 'INVESTIGATION', 'INVESTIGATION_SAVE', 'investigation'),
  savedService('SAVE_ANALYSIS', 'ANALYSIS', 'ANALYSIS_SAVE', 'analysis'),
  savedService('CREATE_SHARED_REPORT', 'REPORT_DRAFT', 'REPORT_CREATE', 'report draft'),
  savedService('CREATE_EXCEL_ARTIFACT', 'EXCEL_ARTIFACT', 'ARTIFACT_CREATE', 'Excel artifact'),
  savedService('CREATE_SUPPORT_PACKAGE', 'SUPPORT_PACKAGE', 'SUPPORT_PACKAGE_CREATE', 'support package draft'),
  savedService('REQUEST_GOVERNED_APPROVAL', 'APPROVAL_REQUEST', 'RECON_VIEW', 'governed workflow request'),
];
export const actionServices = { get: (t: string) => SERVICES.find((s) => s.type === t), types: () => SERVICES.map((s) => s.type) };

const TITLES: Record<string, string> = {
  ADD_FLUX_COMMENT: 'Proposed Flux comment', UPDATE_FLUX_COMMENT: 'Proposed Flux comment update', ADD_RECONCILIATION_COMMENT: 'Proposed reconciliation comment',
  UPDATE_RECONCILIATION_COMMENT: 'Proposed reconciliation comment update', ATTACH_SUPPORT: 'Support to attach', CREATE_ISSUE: 'Proposed issue', ASSIGN_REVIEWER: 'Proposed reviewer assignment',
  CREATE_SHARED_INVESTIGATION: 'Save investigation', SAVE_ANALYSIS: 'Save analysis', CREATE_SHARED_REPORT: 'Save report draft', CREATE_EXCEL_ARTIFACT: 'Save Excel artifact definition',
  CREATE_SUPPORT_PACKAGE: 'Proposed support package draft', REQUEST_GOVERNED_APPROVAL: 'Send to the governed workflow',
  GENERATE_EXCEL_ARTIFACT: 'Generate the workbook', REFRESH_EXCEL_ARTIFACT: 'Refresh the workbook', SAVE_EXCEL_ARTIFACT: 'Save the package', ARCHIVE_EXCEL_ARTIFACT: 'Archive the package',
  RECONCILIATION_APPROVAL: 'Reconciliation approval', CLOSE_CERTIFICATION: 'Close certification', REPORT_PUBLICATION: 'Report publication', MAPPING_CHANGE: 'Mapping change', DIMENSION_OVERRIDE: 'Governed dimension override', ERP_WRITE_BACK: 'ERP write-back',
};
const EDITABLE: Record<string, [string, string, boolean][]> = {
  ADD_FLUX_COMMENT: [['text', 'Comment', true]], UPDATE_FLUX_COMMENT: [['text', 'Comment', true]], ADD_RECONCILIATION_COMMENT: [['text', 'Comment', true]], UPDATE_RECONCILIATION_COMMENT: [['text', 'Comment', true]],
  CREATE_ISSUE: [['title', 'Title', false], ['description', 'Description', true]], CREATE_SHARED_INVESTIGATION: [['name', 'Title', false]], SAVE_ANALYSIS: [['name', 'Name', false]],
  CREATE_SHARED_REPORT: [['name', 'Report name', false]], CREATE_EXCEL_ARTIFACT: [['name', 'Workbook name', false]], CREATE_SUPPORT_PACKAGE: [['name', 'Package name', false]], ASSIGN_REVIEWER: [['reviewer', 'Reviewer', false]],
};

/* ================================================================================================
   THE ENGINE — durable
   ================================================================================================ */
export interface DecideInput { sessionId: string; proposalId?: string; planId?: string; decision: 'confirm' | 'cancel' | 'edit' | 'choose' | 'refresh' | 'regenerate'; edits?: Record<string, string>; choice?: string; requestId?: string }
export interface DecideResult { ok: boolean; results: { proposalId: string; type: string; status: ProposalStatus; code: string | null; message: string; result: Record<string, unknown> | null; auditId: string | null }[]; proposals: ActionProposal[]; timeline: string[] }
const OPEN: ProposalStatus[] = ['PROPOSED', 'WAITING_CONFIRMATION', 'VALIDATED', 'STALE'];

export class ActionEngine {
  constructor(private readonly ctxOf: (actor?: Actor) => ActionContext) {}
  private get repos() { return WORK.repos; }
  private save(p: ActionProposal, by: string) { p.updatedAt = now(); this.repos.actions.saveProposal(p, by); }

  /* ---- reads: always from the work store ---- */
  view(id: string) { return this.repos.actions.proposal<ActionProposal>(id); }
  ofSession(sessionId: string) { return this.repos.actions.proposalsForSession<ActionProposal>(sessionId); }
  ofInvestigation(investigationId: string) { return this.repos.actions.proposalsForInvestigation<ActionProposal>(investigationId); }
  openOf(sessionId: string) { return this.ofSession(sessionId).filter((p) => OPEN.includes(p.status)); }
  get audit() { return this.repos.audit.list(); }
  timeline(investigationIds: string[]) { return investigationIds.flatMap((id) => this.repos.investigations.events(id).map((e) => ({ at: e.createdAt, event: e.label, type: e.type, ref: e.ref }))).sort((x, y) => x.at.localeCompare(y.at)); }

  /** per investigation: a target name the user already resolved ("Electrical CIP" → REC-CIP-ELECTRICAL), durable */
  private aliasOf(p: ActionProposal) {
    const t = String(p.proposedPayload['target'] ?? '').trim().toLowerCase();
    if (!t || !p.investigationId) return;
    const hit = this.repos.records.list<{ name: string; value: string }>('TARGET_ALIAS', { investigation_id: p.investigationId }).filter((x) => x.name === t).at(-1);
    if (hit) { p.proposedPayload['target'] = hit.value; p.proposedPayload['__aliasNote'] = `“${t}” resolved to ${hit.value} — your earlier choice in this investigation.`; }
  }

  /** Create a proposal. Writes the PROPOSAL (so it survives a restart) and nothing else. */
  propose(input: { sessionId: string; planId: string; type: string; payload: Record<string, unknown>; dependsOn?: string[]; sourceFinancialObjectIds?: string[]; sourcePopulationIds?: string[]; investigationId?: string | null; traceId?: string | null; description?: string; actor?: Actor }): ActionProposal {
    const c = this.ctxOf(input.actor);
    const riskLevel = ActionGovernanceEngine.classify(input.type);
    const svc = actionServices.get(input.type);
    const p: ActionProposal = {
      id: korvynActionId(), planId: input.planId, sessionId: input.sessionId, type: input.type, riskLevel,
      title: TITLES[input.type] ?? input.type, description: input.description ?? '',
      targetObjectId: null, targetObjectType: null, targetLabel: null, proposedPayload: { ...input.payload },
      editable: (EDITABLE[input.type] ?? []).map(([field, label, multiline]) => ({ field, label, multiline })),
      sourceFinancialObjectIds: input.sourceFinancialObjectIds ?? [], sourcePopulationIds: input.sourcePopulationIds ?? [], evidenceIds: [],
      requestedBy: { id: c.actor.id, name: c.actor.name, role: c.actor.role }, permissions: svc ? [svc.permission] : [],
      validationStatus: 'VALID', validation: { errors: [], warnings: [] }, choice: null,
      confirmationRequired: riskLevel !== 'READ_ONLY', executable: riskLevel === 'CONFIRM_REQUIRED' && !!svc,
      status: 'PROPOSED', version: 1, dependsOn: input.dependsOn ?? [], targetVersion: null,
      investigationId: input.investigationId ?? null, traceId: input.traceId ?? null, createdAt: now(), updatedAt: now(),
      governed: null, result: null, error: null, auditId: null, preview: [],
    };
    this.aliasOf(p);
    if (riskLevel === 'GOVERNED_ACTION') this.prepareGoverned(p, c);
    else this.revalidate(p, c);
    this.save(p, c.actor.id);
    return p;
  }

  private revalidate(p: ActionProposal, c: ActionContext) {
    const svc = actionServices.get(p.type);
    if (!svc) { p.validationStatus = 'INVALID'; p.validation = { errors: [`No Korvyn action service executes ${p.type}.`], warnings: [] }; p.executable = false; p.status = 'PROPOSED'; return; }
    const v = svc.validate(p, c);
    const auth = AuthorizationService.can(c.actor as never, svc.permission);
    const perm = auth.allowed ? [] : [`Permission: ${auth.reason}, which ${p.title.toLowerCase()} requires.`];
    p.validation = { errors: [...perm, ...v.errors], warnings: [...(p.proposedPayload['__aliasNote'] ? [String(p.proposedPayload['__aliasNote'])] : []), ...v.warnings] };
    p.choice = v.choice ?? null;
    p.validationStatus = p.validation.errors.length ? 'INVALID' : p.choice ? 'NEEDS_CHOICE' : 'VALID';
    p.targetVersion = p.validationStatus === 'VALID' ? svc.targetVersion(p, c) : null;
    p.status = p.validationStatus === 'VALID' ? 'WAITING_CONFIRMATION' : 'PROPOSED';
  }

  private prepareGoverned(p: ActionProposal, c: ActionContext) {
    p.executable = false; p.confirmationRequired = true;
    const route = GOVERNED_ROUTE[p.type] ?? 'Governed workflow';
    const readiness: { check: string; ok: boolean; detail: string }[] = [];
    const capability = ({ RECONCILIATION_APPROVAL: 'RECON_APPROVE', CLOSE_CERTIFICATION: 'CLOSE_CERTIFY', REPORT_PUBLICATION: 'REPORT_PUBLISH', MAPPING_CHANGE: 'MAPPING_CHANGE', ERP_WRITE_BACK: 'ERP_WRITEBACK' } as Record<string, Permission>)[p.type];
    if (p.type === 'RECONCILIATION_APPROVAL') {
      const r = recTarget(p, c);
      if (r.def) {
        const rec = c.controls.reconcile(r.def, r.period);
        p.targetObjectId = `recon:${r.def.id}:${r.period}`; p.targetObjectType = 'RECONCILIATION'; p.targetLabel = `${r.def.name} · ${periodLabel(r.period)}`;
        const sod = SoDPolicyService.evaluate('RECONCILIATION_APPROVAL', { actorId: c.actor.id, preparerId: personId(rec.workflow.preparer) });
        readiness.push({ check: 'Ties', ok: rec.tieStatus === 'TIED', detail: rec.tieStatus }, { check: 'Required support complete', ok: rec.supportComplete, detail: rec.supportComplete ? 'complete' : `${rec.support.filter((s) => s.status === 'MISSING').length} missing` },
          { check: 'Submitted for review', ok: rec.workflow.status === 'IN_REVIEW', detail: rec.workflow.status },
          ...sod.map((x) => ({ check: `Segregation of duties (${x.policyId})`, ok: x.ok, detail: x.reason ?? `preparer ${rec.workflow.preparer}` })));
      } else p.choice = r.choice ?? null;
    }
    if (capability) readiness.push({ check: `Capability ${capability}`, ok: false, detail: 'not granted to any role in this phase' });
    const ready = readiness.length > 0 && readiness.filter((x) => !x.check.startsWith('Capability')).every((x) => x.ok);
    p.governed = { route, readiness };
    p.validationStatus = p.choice ? 'NEEDS_CHOICE' : 'VALID';
    p.validation = { errors: [], warnings: [`${p.title} is a GOVERNED action. Sloane prepares it and does not execute it: ${route}.${readiness.length ? ready ? ' The work is ready for the approver.' : ' The work is not ready.' : ''}`] };
    p.status = 'VALIDATED';
    p.preview = [{ label: 'Governed action', value: p.title }, ...(p.targetLabel ? [{ label: 'Target', value: p.targetLabel }] : []), { label: 'Route', value: route }];
  }

  /** revise an open proposal in place (a correction retargets it; it never becomes a second proposal) */
  revise(id: string, changes: Record<string, unknown>, actor?: Actor): ActionProposal | null {
    const p = this.view(id);
    if (!p || !OPEN.includes(p.status)) return null;
    Object.assign(p.proposedPayload, changes); p.version += 1;
    const c = this.ctxOf(actor);
    if (p.riskLevel === 'GOVERNED_ACTION') this.prepareGoverned(p, c); else this.revalidate(p, c);
    this.save(p, c.actor.id);
    return p;
  }

  /** The user's decision. The only caller of ActionService.execute. */
  decide(input: DecideInput, actor?: Actor): DecideResult {
    const replayKey = input.requestId ? `DECIDE:${input.sessionId}:${input.requestId}` : null;
    if (replayKey) { const prior = this.repos.idempotency.get<DecideResult>(replayKey); if (prior) return prior; }
    const c = this.ctxOf(actor);
    const out: DecideResult = { ok: true, results: [], proposals: [], timeline: [] };
    const targets = input.planId ? this.ofSession(input.sessionId).filter((p) => p.planId === input.planId) : [this.view(input.proposalId ?? '')].filter((p): p is ActionProposal => !!p && p.sessionId === input.sessionId);
    if (!targets.length) return { ok: false, results: [{ proposalId: input.proposalId ?? input.planId ?? '', type: '', status: 'FAILED', code: 'NOT_FOUND', message: 'No such proposal in this session.', result: null, auditId: null }], proposals: [], timeline: [] };
    const say = (p: ActionProposal, message: string, code: string | null = null) => out.results.push({ proposalId: p.id, type: p.type, status: p.status, code, message, result: p.result, auditId: p.auditId });

    if (input.decision === 'cancel') {
      for (const p of targets) { if (['COMPLETED', 'EXECUTING'].includes(p.status)) { say(p, `Already ${p.status.toLowerCase()} — not cancelled.`); continue; } p.status = 'CANCELLED'; this.save(p, c.actor.id); say(p, 'Cancelled. Nothing was written.'); }
    } else if (input.decision === 'edit' || input.decision === 'choose') {
      const p = targets[0]!;
      if (!OPEN.includes(p.status)) say(p, `A ${p.status.toLowerCase()} proposal cannot be edited.`);
      else {
        const changes: Record<string, unknown> = {};
        if (input.decision === 'edit') for (const [k, v] of Object.entries(input.edits ?? {})) { if (p.editable.some((e) => e.field === k)) changes[k] = v; }
        if (input.decision === 'choose' && p.choice && p.choice.options.some((o) => o.id === input.choice)) {
          changes[p.choice.field] = input.choice;
          const named = String(p.proposedPayload[p.choice.field] ?? '').trim().toLowerCase();
          if (named && p.choice.field === 'target' && p.investigationId) this.repos.records.insert('TARGET_ALIAS', { name: named, value: input.choice! }, c.actor.id, { investigationId: p.investigationId });
        }
        const r = this.revise(p.id, changes, actor)!; say(r, input.decision === 'edit' ? 'Updated. Nothing is written until you confirm.' : 'Updated.');
      }
    } else if (input.decision === 'refresh') {
      /* the user has seen that the target moved: re-read it, re-validate, and wait for a fresh confirmation */
      for (const p of targets) { if (p.status !== 'STALE') { say(p, `Only a stale proposal can be refreshed (this one is ${p.status.toLowerCase()}).`); continue; }
        delete p.proposedPayload['__preparedVersion']; this.revalidate(p, c); p.version += 1; this.save(p, c.actor.id); say(p, 'Refreshed against the current target. Review it, then confirm.'); }
    } else if (input.decision === 'regenerate') {
      /* supersede the stale proposal with a new one prepared against the current state */
      for (const p of targets) { if (!OPEN.includes(p.status)) { say(p, `A ${p.status.toLowerCase()} proposal cannot be regenerated.`); continue; }
        p.status = 'SUPERSEDED'; this.save(p, c.actor.id);
        const payload = { ...p.proposedPayload }; delete payload['__preparedVersion'];
        const n = this.propose({ sessionId: p.sessionId, planId: p.planId, type: p.type, payload, dependsOn: p.dependsOn, sourceFinancialObjectIds: p.sourceFinancialObjectIds, sourcePopulationIds: p.sourcePopulationIds, investigationId: p.investigationId, traceId: p.traceId, description: p.description, actor });
        say(p, `Superseded by ${n.id}.`); say(n, 'Regenerated against the current state. Review it, then confirm.'); targets.push(n); }
    } else {
      /* confirm: dependency order; a failed dependency stops its dependents; completed work is never repeated */
      const order = [...targets].sort((a, b) => (a.dependsOn.includes(b.id) ? 1 : b.dependsOn.includes(a.id) ? -1 : a.createdAt.localeCompare(b.createdAt)));
      for (const p0 of order) {
        const execKey = `EXECUTE:${p0.id}`;
        const done = this.repos.idempotency.get<{ result: Record<string, unknown>; auditId: string }>(execKey);
        const p = this.view(p0.id)!;
        if (done || p.status === 'COMPLETED') { say(p, 'Already completed — not repeated.', 'ALREADY_COMPLETED'); continue; }
        if (p.status === 'EXECUTING') { say(p, 'Already executing — not started twice.', 'IN_PROGRESS'); continue; }
        if (p.status === 'CANCELLED' || p.status === 'SUPERSEDED') { say(p, `Skipped: ${p.status.toLowerCase()}.`); continue; }
        if (p.status === 'STALE') { say(p, 'Stale: refresh or regenerate this proposal before confirming.', 'STALE_PROPOSAL'); out.ok = false; continue; }
        if (p.riskLevel === 'GOVERNED_ACTION') { say(p, `Not executed: ${p.title} is a governed action. ${p.governed?.route ?? ''}`, 'GOVERNED'); continue; }
        const deps = p.dependsOn.map((d) => this.view(d)!).filter(Boolean);
        const blocked = deps.find((d) => d.status !== 'COMPLETED');
        if (blocked) { p.error = `Not executed: it depends on “${blocked.title}”, which is ${blocked.status.toLowerCase()}.`; this.save(p, c.actor.id); say(p, p.error, 'DEPENDENCY'); out.ok = false; continue; }
        const prepared = p.targetVersion;
        this.revalidate(p, c);
        if (p.validationStatus !== 'VALID') { p.error = p.validationStatus === 'NEEDS_CHOICE' ? `Needs a choice first: ${p.choice?.question}` : p.validation.errors.join(' '); this.save(p, c.actor.id); say(p, `Not executed: ${p.error}`, p.validation.errors.some((e) => e.startsWith('Permission')) ? 'FORBIDDEN' : 'INVALID'); out.ok = false; continue; }
        const svc = actionServices.get(p.type)!;
        const stale = (cur: number | null) => {
          p.status = 'STALE'; p.targetVersion = prepared; p.error = `Stale: ${p.targetLabel} changed since this was proposed (version ${prepared} → ${cur}). Refresh to review the current state, regenerate, or cancel.`;
          this.save(p, c.actor.id);
          this.repos.actions.execution({ proposalId: p.id, actionType: p.type, outcome: 'STALE_PROPOSAL', result: null, error: p.error, auditEventId: null, requestId: input.requestId ?? null }, c.actor.id, p.investigationId);
          say(p, p.error, 'STALE_PROPOSAL'); out.ok = false;
        };
        const current = svc.targetVersion(p, c);
        if (prepared !== null && current !== null && current !== prepared) { stale(current); continue; }
        const executionId = `EXECUTION-${p.id.slice('ACTION-'.length)}`;
        try {
          /* ONE transaction: domain write + execution record + audit event + investigation event + idempotency key + status */
          this.repos.database.tx(() => {
            const r = svc.execute(p, { ...c, expectedTargetVersion: prepared, executionId }, deps);
            const ev = this.repos.audit.append({
              actor: { id: c.actor.id, name: c.actor.name, role: c.actor.role }, source: 'SLOANE', action: p.type,
              target: { id: p.targetObjectId, type: p.targetObjectType, label: p.targetLabel }, beforeRef: p.targetObjectId, afterRef: r.afterRef ?? null, before: r.before, after: r.after,
              investigationId: p.investigationId, executionTraceId: executionId, proposalId: p.id,
              confirmation: { confirmedBy: c.actor.name, at: now(), requestId: input.requestId ?? null },
              financialObjectIds: p.sourceFinancialObjectIds, populationIds: p.sourcePopulationIds, evidenceIds: p.evidenceIds, outcome: 'COMPLETED', error: null,
            });
            p.status = 'COMPLETED'; p.result = r.result; p.error = null; p.auditId = ev.eventId;
            this.repos.actions.execution({ proposalId: p.id, actionType: p.type, outcome: 'COMPLETED', result: r.result, error: null, auditEventId: ev.eventId, requestId: input.requestId ?? null }, c.actor.id, p.investigationId);
            if (p.investigationId) this.repos.investigations.event(p.investigationId, { type: 'ACTION_COMPLETED', label: r.timeline, ref: p.id, traceId: executionId }, c.actor.id);
            this.repos.idempotency.put(execKey, 'ACTION_EXECUTION', c.actor.id, { result: r.result, auditId: ev.eventId });
            this.save(p, c.actor.id);
            out.timeline.push(r.timeline); say(p, r.timeline);
          });
        } catch (e) {
          const fresh = this.view(p.id)!;
          if (e instanceof StaleVersionError) { Object.assign(p, { status: fresh.status }); stale(e.current); continue; }
          p.status = 'FAILED'; p.error = (e as Error).message; out.ok = false;
          const ev = this.repos.audit.append({ actor: { id: c.actor.id, name: c.actor.name, role: c.actor.role }, source: 'SLOANE', action: p.type, target: { id: p.targetObjectId, type: p.targetObjectType, label: p.targetLabel }, beforeRef: p.targetObjectId, afterRef: null, before: null, after: null, investigationId: p.investigationId, executionTraceId: executionId, proposalId: p.id, confirmation: { confirmedBy: c.actor.name, at: now(), requestId: input.requestId ?? null }, financialObjectIds: p.sourceFinancialObjectIds, populationIds: p.sourcePopulationIds, evidenceIds: p.evidenceIds, outcome: 'FAILED', error: p.error });
          p.auditId = ev.eventId; this.save(p, c.actor.id);
          say(p, `Failed: ${p.error}`, 'FAILED');
        }
      }
    }
    out.proposals = [...new Map(targets.map((p) => [p.id, this.view(p.id)!])).values()];
    if (replayKey) this.repos.idempotency.put(replayKey, 'DECISION', c.actor.id, out);
    return out;
  }
}
function korvynActionId() { return `ACTION-${Date.now().toString(36).toUpperCase()}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`; }
