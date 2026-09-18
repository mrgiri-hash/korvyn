/**
 * THE ARTIFACT ENGINE — the lifecycle of a governed deliverable.
 *
 *   ASK → BUILD → PREVIEW → REFINE → VALIDATE → GENERATE → DOWNLOAD / SAVE
 *
 * An artifact is a versioned DEFINITION (records kind EXCEL_ARTIFACT_DEFINITION): each refinement is a new version,
 * the prior definitions are kept in `history`, and every version PINS what it was built over — the populations (count,
 * totals and a content hash), the tie-out result, and the governed objects it cites (reconciliation balance and Flux
 * explanation ids + versions). If anything pinned moves, the artifact is STALE: it is not regenerated silently; a
 * Refresh creates a new version against the current data.
 *
 * Generation is server-side and asynchronous: a request validates (permissions, populations, staleness, tie-out) and
 * records a GENERATION (records kind ARTIFACT_GENERATION) before any file work starts; a job streams the workbook to
 * storage and marks the generation GENERATED or FAILED with its reason. A generated file is immutable and keeps its
 * own frozen definition and pins, so it stays historically reproducible whatever happens to the data afterwards.
 *
 * Status: DRAFT · VALIDATING · READY · GENERATING · GENERATED · FAILED · STALE (STALE is detected, not stored).
 */
import { createHash, randomUUID } from 'node:crypto';
import { AuthorizationService, type Capability } from '../auth.js';
import type { ControlService } from '../controls.js';
import { BASIS, type FinancialDataService } from '../financials.js';
import type { GovernedLedger } from '../governed.js';
import { type Stamped, patchRecordData, setRecordStatus } from '../persistence/repositories.js';
import { WORK } from '../store.js';
import type { Actor } from '../tools.js';
import { type ComposeEnv, type WorkbookModel, composeWorkbook, statusOf } from './compose.js';
import { ARTIFACT_TYPE_LABEL, type ArtifactDefinition, type ArtifactPins, type ArtifactStatus, type ArtifactType, DEFAULT_GL_COLUMNS, EXCEL_MAX_ROWS, type GLRule, type GLSheetDef, SHEET_NAMES, type SheetDef, type SheetKind, monLabel, periodToken, rangeLabel } from './model.js';
import { TEMPLATES, nameFor, sectionName } from './sections.js';
import { type ArtifactStorage, LocalArtifactStorage, defaultArtifactRoot } from './storage.js';
import { SOURCE_HEALTH } from '../governed.js';
import { type StructuredChange, refineDefinition, sheetsIn } from './refine.js';
import { CsvRenderer, type ExcelRenderer, ExcelJsStreamingRenderer } from './renderer.js';
import { MAPPING_VERSION, TieOutService } from './tieout.js';

const KIND = 'EXCEL_ARTIFACT_DEFINITION', GEN = 'ARTIFACT_GENERATION';
/** above this many lines, Sloane recommends a CSV extract (Excel is never blocked unless impossible) */
export const XLSX_RECOMMEND_CSV_ROWS = 2_000_000;
/** generation requests up to this many rows are awaited by the HTTP request; larger ones return a job to poll */
export const SYNC_WAIT_MS = 8_000;

export type Channel = 'SLOANE' | 'REPORTING' | 'OTHER';
export interface ArtifactBody {
  name: string; definition: ArtifactDefinition; pins: ArtifactPins;
  history: { version: number; at: string; by: string; change: string; definition: ArtifactDefinition; pins: ArtifactPins }[];
  createdVia: Channel; investigationId: string | null; sessionId: string | null; traceIds: string[];
  owner: string; ownerName: string; sharedWith: string[]; lastError: string | null; lastChange: string;
}
export interface GenerationBody {
  artifactId: string; artifactVersion: number; format: 'xlsx' | 'csv'; fileName: string; storageKey: string | null;
  bytes: number | null; sha256: string | null; definition: ArtifactDefinition; pins: ArtifactPins;
  tieOut: { status: string; differenceUsd: number } | null; auditReady: boolean; acknowledged: boolean; warnings: string[];
  channel: Channel; requestedBy: string; requestedByName: string; jobId: string; error: string | null;
  metrics: { definitionMs: number; validationMs: number; generationMs: number | null; rows: number; rowsPerSecond: number | null; peakHeapMb: number | null; sheets: string[] };
}
/** QUEUED → VALIDATING → GENERATING → COMPLETED | FAILED | CANCELLED */
export type JobStatus = 'QUEUED' | 'VALIDATING' | 'GENERATING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export interface Job { id: string; generationId: string; artifactId: string; status: JobStatus; rows: number; totalRows: number; sheet: string; startedAt: string; finishedAt: string | null; error: string | null; cancelRequested: boolean; cancelledBy: string | null; done: Promise<void> }
class Cancelled extends Error { constructor() { super('Cancelled'); } }
/** one validation check a package is judged by before it is generated */
export interface ValidationCheck { check: string; status: 'PASS' | 'WARN' | 'FAIL'; detail: string }
export interface Validation { status: 'VALID' | 'VALID_WITH_WARNINGS' | 'BLOCKED'; checks: ValidationCheck[]; auditReady: boolean }
export type EngineError = { ok: false; code: 'PERMISSION_DENIED' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'STALE' | 'STALE_VERSION' | 'TIE_OUT_WARNING' | 'CONFLICT'; reason: string; detail?: Record<string, unknown> };

const sha = (x: unknown) => createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16).toUpperCase();
const who = (a: Actor) => ({ id: a.id, name: a.name, role: a.role });
const entityAccessOf = (a: Actor) => ((a as { entityAccess?: 'ALL' | string[] }).entityAccess ?? a.scopeIds);

export class ArtifactEngine {
  readonly tie: TieOutService;
  private readonly jobs = new Map<string, Job>();
  readonly excel: ExcelRenderer = new ExcelJsStreamingRenderer();
  readonly csv = new CsvRenderer();
  /** where generated files live — behind the storage interface; no domain logic builds a path */
  store: ArtifactStorage = new LocalArtifactStorage(defaultArtifactRoot());
  /** the local root (tests point it at a temp directory) */
  get storage() { return (this.store as LocalArtifactStorage).root; }
  set storage(root: string) { this.store = new LocalArtifactStorage(root); }
  /** Excel's row limit, overridable so partitioning can be proven without writing a million rows */
  maxRowsPerSheet = Number(process.env['KORVYN_XLSX_MAX_ROWS'] ?? EXCEL_MAX_ROWS);

  constructor(readonly data: FinancialDataService, readonly gl: GovernedLedger, readonly controls: ControlService) {
    this.tie = new TieOutService(data, gl);
    this.recoverInterrupted();
  }

  /* ---- composition env ----------------------------------------------------------------------------- */
  env(actor: Actor): ComposeEnv {
    const ea = entityAccessOf(actor);
    return { data: this.data, gl: this.gl, controls: this.controls, tie: this.tie, visible: ea === 'ALL' ? 'ALL' : new Set(ea), maxRowsPerSheet: this.maxRowsPerSheet };
  }
  compose(actor: Actor, d: ArtifactDefinition, version = 0, artifactId = 'DRAFT', generatedAt?: string): WorkbookModel { return composeWorkbook(this.env(actor), d, { version, artifactId, generatedAt }); }

  /* ---- security: an artifact never exposes what its reader could not otherwise see ------------------ */
  authorize(actor: Actor, d: ArtifactDefinition, capability: Capability = 'ARTIFACT_CREATE'): string[] {
    const errors: string[] = [];
    const need = (c: Capability, why: string) => { const r = AuthorizationService.can(actor as never, c); if (!r.allowed) errors.push(`${why}: ${r.reason}.`); };
    need(capability, capability === 'ARTIFACT_CREATE' ? 'Creating or generating a workbook' : 'Reading this workbook');
    const need2 = (k: SheetKind, c: Capability) => { if (d.sheets.some((s) => s.kind === k)) need(c, `The ${SHEET_NAMES[k]} tab`); };
    need2('GL', 'GL_VIEW'); need2('TB', 'TB_VIEW'); need2('TIEOUT', 'TB_VIEW'); need2('RECONCILIATIONS', 'RECON_VIEW'); need2('FLUX', 'FLUX_VIEW');
    for (const k of ['RECS_NOT_TIED', 'RECONCILIATION', 'RECONCILING_ITEMS', 'SUPPORT_INDEX', 'RECON_PROOF'] as SheetKind[]) need2(k, 'RECON_VIEW');
    for (const k of ['UNEXPLAINED_FLUX', 'EXPLANATION', 'MATERIAL_MOVEMENTS'] as SheetKind[]) need2(k, 'FLUX_VIEW');
    for (const k of ['INCOME_STATEMENT', 'BALANCE_SHEET', 'VARIANCE'] as SheetKind[]) need2(k, 'TB_VIEW');
    if (d.focus?.reconciliationId) { const r = this.controls.recDef(d.focus.reconciliationId); const ea = entityAccessOf(actor); if (!r) errors.push(`${d.focus.reconciliationId} is not a governed reconciliation.`); else if (ea !== 'ALL' && (r.entity === 'GROUP' || !ea.includes(r.entity))) errors.push(`${r.name} is outside your entity access.`); }
    const scope = this.data.scope(d.scopeId);
    if (!scope) errors.push(`${d.scopeId} is not a governed scope.`);
    else {
      const ea = entityAccessOf(actor);
      if (ea !== 'ALL' && (scope.kind === 'GROUP' || scope.entityIds.some((e) => !ea.includes(e)))) errors.push(`Scope ${scope.kind === 'GROUP' ? 'Corporate Consolidated' : scope.name} is outside your entity access (${ea.join(', ')}).`);
    }
    return errors;
  }

  /* ---- definitions ---------------------------------------------------------------------------------- */
  /** a new definition from what was asked: template, window, scope, filters and the tabs the request names */
  newDefinition(o: { template?: 'AUDIT_GL_PACKAGE' | 'GL_EXTRACT'; type?: ArtifactType | null; focus?: ArtifactDefinition['focus']; periodStart?: string; periodEnd?: string; scopeId?: string; vendor?: string | null; project?: string | null; accounts?: string[]; minAbsUsd?: number | null; sheets?: SheetKind[]; name?: string | null; excludeCompleteEntities?: boolean }): ArtifactDefinition {
    if (o.type && o.type !== 'GL_EXTRACT' && !(o.type === 'AUDIT_SUPPORT_PACKAGE' && o.template)) return this.newPackage(o as Parameters<ArtifactEngine['newPackage']>[0]);
    const ps = this.gl.periods();
    const start = o.periodStart && ps.includes(o.periodStart) ? o.periodStart : `${ps.at(-1)!.slice(0, 4)}-01`;
    const end = o.periodEnd && ps.includes(o.periodEnd) ? o.periodEnd : ps.at(-1)!;
    const template = o.template ?? 'GL_EXTRACT';
    const glName = o.vendor ? `${o.vendor.split(' ')[0]} GL` : SHEET_NAMES.GL;
    const gl: GLSheetDef = { kind: 'GL', name: glName, filter: { ...(o.vendor ? { vendor: o.vendor } : {}), ...(o.project ? { project: o.project } : {}), ...(o.accounts?.length ? { accounts: o.accounts } : {}), ...(o.minAbsUsd ? { minAbsUsd: o.minAbsUsd } : {}) }, columns: [...DEFAULT_GL_COLUMNS], sort: o.vendor || o.minAbsUsd ? 'amount_desc' : 'date_asc' };
    const extra = new Set<SheetKind>(o.sheets ?? []);
    if (template === 'AUDIT_GL_PACKAGE') { extra.add('TB'); extra.add('TIEOUT'); }
    const order: SheetKind[] = ['SUMMARY', 'TB', 'TIEOUT', 'RECONCILIATIONS', 'FLUX'];
    const sheets: SheetDef[] = [gl, ...order.filter((k) => extra.has(k) && k !== 'SUMMARY').map((k) => (k === 'TB' ? { kind: 'TB' as const, name: SHEET_NAMES.TB, byEntity: false } : { kind: k as 'TIEOUT', name: SHEET_NAMES[k] }))];
    if (extra.has('SUMMARY')) sheets.push({ kind: 'SUMMARY', name: SHEET_NAMES.SUMMARY });
    const tok = periodToken(start, end);
    const notes: string[] = [];
    if (end !== `${end.slice(0, 4)}-12` && tok.startsWith('FY')) notes.push(`${tok} runs ${monLabel(start)} – ${monLabel(end)}: ${monLabel(end)} is the latest month closed into the governed ledger; the rest of the year is not yet governed.`);
    const d: ArtifactDefinition = { name: o.name ?? '', type: template === 'AUDIT_GL_PACKAGE' ? 'AUDIT_SUPPORT_PACKAGE' : 'GL_EXTRACT', template, periodStart: start, periodEnd: end, scopeId: o.scopeId ?? 'GROUP', currency: 'USD', basis: BASIS, sheets, notes, nameSource: o.name ? 'USER' : 'AUTO' };
    if (!o.name) d.name = this.nameOf(d);
    return d;
  }

  /** a PACKAGE: the type's template of sections, each built by the section library; the user can change any of it */
  newPackage(o: { type: ArtifactType; focus?: ArtifactDefinition['focus']; periodStart?: string; periodEnd?: string; scopeId?: string; vendor?: string | null; accounts?: string[]; minAbsUsd?: number | null; sheets?: SheetKind[]; name?: string | null; excludeCompleteEntities?: boolean }): ArtifactDefinition {
    const ps = this.gl.periods(), T = TEMPLATES[o.type];
    const end = o.periodEnd && ps.includes(o.periodEnd) ? o.periodEnd : ps.at(-1)!;
    const start = T.window === 'MONTH' ? end : o.periodStart && ps.includes(o.periodStart) && o.periodStart <= end ? o.periodStart : `${end.slice(0, 4)}-01`;
    const focus = { ...(o.focus ?? {}), ...(o.vendor ? { vendor: o.vendor } : {}) };
    const kinds = [...T.sections, ...(o.sheets ?? []).filter((k) => !T.sections.includes(k))];
    if (o.type === 'EXCEL_WORKBOOK' && !kinds.length) kinds.push('GL');
    const sheets: SheetDef[] = kinds.map((k) => this.section(o.type, k, { focus, minAbsUsd: o.minAbsUsd ?? null, accounts: o.accounts }));
    const tok = periodToken(start, end), notes: string[] = [];
    if (end !== `${end.slice(0, 4)}-12` && tok.startsWith('FY')) notes.push(`${tok} runs ${monLabel(start)} – ${monLabel(end)}: ${monLabel(end)} is the latest month closed into the governed ledger; the rest of the year is not yet governed.`);
    if (o.type === 'PBC_PACKAGE') notes.push('PBC is a scaffold in this phase: requests are listed as recorded; an auditor’s request file is not interpreted and responses are not assembled.');
    const d: ArtifactDefinition = { name: o.name ?? '', type: o.type, template: o.type === 'AUDIT_SUPPORT_PACKAGE' ? 'AUDIT_GL_PACKAGE' : 'GL_EXTRACT', periodStart: start, periodEnd: end, scopeId: o.scopeId ?? 'GROUP', currency: 'USD', basis: BASIS, sheets, notes, nameSource: o.name ? 'USER' : 'AUTO',
      ...(Object.keys(focus).length ? { focus } : {}), ...(o.excludeCompleteEntities ? { filters: { excludeCompleteEntities: true } } : {}) };
    if (!o.name) d.name = this.nameOf(d);
    return d;
  }
  /** one section of a package, named for the package it is in; a GL section presents the lines behind what the package reports */
  section(type: ArtifactType | undefined, k: SheetKind, o: { focus?: ArtifactDefinition['focus']; minAbsUsd?: number | null; accounts?: string[]; rule?: GLRule; name?: string }): SheetDef {
    const name = o.name ?? sectionName(type, k), f = o.focus ?? {};
    if (k === 'TB') return { kind: 'TB', name, byEntity: false };
    if (k !== 'GL') return { kind: k, name } as SheetDef;
    const rule: GLRule | undefined = o.rule ?? (f.reconciliationId && (type === 'RECONCILIATION_PACKAGE') ? { kind: 'RECONCILIATION', reconciliationId: f.reconciliationId } : f.account && type === 'FLUX_PACKAGE' ? { kind: 'ACCOUNT_MONTH', account: f.account } : undefined);
    return { kind: 'GL', name, filter: { ...(f.vendor ? { vendor: f.vendor } : {}), ...(o.accounts?.length ? { accounts: o.accounts } : {}), ...(o.minAbsUsd ? { minAbsUsd: o.minAbsUsd } : {}) }, columns: [...DEFAULT_GL_COLUMNS], sort: f.vendor || o.minAbsUsd || rule ? 'amount_desc' : 'date_asc', ...(rule ? { rule } : {}) };
  }
  /** the name a definition gets when the person has not named it — by type, focus, period and threshold */
  nameOf(d: ArtifactDefinition) { return nameFor(d, { recName: (id) => this.controls.recDef(id)?.name ?? null, acctName: (code) => this.gl.account(code)?.name ?? null }); }
  refine(d: ArtifactDefinition, instruction: string, structured?: StructuredChange) {
    const next = structuredClone(d) as ArtifactDefinition; next.notes = [];
    const r = refineDefinition(next, instruction, structured, { periods: this.gl.periods(), scopes: this.data.scopes().map((x) => ({ id: x.id, name: x.name })) });
    if (r.changes.some((c) => c.startsWith('Renamed'))) next.nameSource = 'USER';
    /* a name Korvyn derived follows the definition (a new threshold, a new template); a name the person chose stays */
    else if (next.nameSource !== 'USER') { const n = this.nameOf(next); if (n !== next.name) { r.changes.push(`Renamed to “${n}”`); next.name = n; } }
    return { definition: next, ...r };
  }

  /** the pins a version records: what it was built over, as a fingerprint that moves when any of it moves */
  pins(m: WorkbookModel): ArtifactPins {
    const populations = m.populations.map((p) => ({ ...p }));
    const tieOut = m.tieOut ? { status: m.tieOut.status, differenceUsd: Math.round(m.tieOut.differenceUsd * 100) / 100 } : null;
    const sourceObjects = m.citations.map((c) => ({ type: c.type, id: c.id, version: c.version }));
    const fingerprint = sha({ p: populations.map((p) => [p.sheet, p.rowCount, p.debitUsd, p.creditUsd, p.contentHash]), t: tieOut, s: sourceObjects });
    return { dataVersion: m.dataVersion, sourceDataVersion: this.tie.sourceDataVersion(), mappingVersion: MAPPING_VERSION, fxRateSets: ['FXR-2026-CLS-REP-1', 'FXR-2026-AVG-REP-1'], populations, tieOut, sourceObjects, sourceSystems: m.sourceSystems, fingerprint, pinnedAt: new Date().toISOString() };
  }

  get(id: string) { return WORK.repos.records.get<ArtifactBody>(KIND, id); }
  private canSee(actor: Actor, a: Stamped<ArtifactBody>) { return a.owner === actor.id || a.sharedWith.includes(actor.id) || a.sharedWith.some((w) => w.toLowerCase() === actor.name.toLowerCase()); }

  create(actor: Actor, d: ArtifactDefinition, meta: { via: Channel; investigationId?: string | null; sessionId?: string | null; traceId?: string | null }): { ok: true; artifact: Stamped<ArtifactBody>; model: WorkbookModel } | EngineError {
    const denied = this.authorize(actor, d);
    if (denied.length) return { ok: false, code: 'PERMISSION_DENIED', reason: denied.join(' ') };
    const m = this.compose(actor, d, 1);
    const pins = this.pins(m);
    const body: ArtifactBody = { name: d.name, definition: d, pins, history: [], createdVia: meta.via, investigationId: meta.investigationId ?? null, sessionId: meta.sessionId ?? null, traceIds: meta.traceId ? [meta.traceId] : [], owner: actor.id, ownerName: actor.name, sharedWith: [], lastError: null, lastChange: 'Created' };
    const rec = WORK.repos.database.tx(() => {
      const r = WORK.repos.records.insert<ArtifactBody>(KIND, body, actor.id, { prefix: 'ARTIFACT', status: 'DRAFT', period: d.periodEnd, scope: d.scopeId, investigationId: meta.investigationId ?? null });
      this.audit(actor, meta.via, 'ARTIFACT_CREATED', r, null, { version: 1, name: d.name, type: d.type ?? 'GL_EXTRACT', sheets: d.sheets.map((s) => s.name), populations: pins.populations.map((p) => p.populationId) }, meta);
      /* a reuse is a NEW artifact that names its source; the source is never touched */
      if (d.derivedFrom) this.audit(actor, meta.via, 'ARTIFACT_DERIVED', r, null, { version: 1, from: { id: d.derivedFrom.artifactId, version: d.derivedFrom.version, name: d.derivedFrom.name } }, meta);
      return r;
    });
    return { ok: true, artifact: rec, model: m };
  }

  /** a new VERSION of the definition; the prior one is kept in history */
  modify(actor: Actor, id: string, next: ArtifactDefinition, change: string, meta: { via: Channel; traceId?: string | null; investigationId?: string | null; expectedVersion?: number | null }): { ok: true; artifact: Stamped<ArtifactBody>; model: WorkbookModel } | EngineError {
    const cur = this.get(id);
    if (!cur || !this.canSee(actor, cur)) return { ok: false, code: 'NOT_FOUND', reason: `No artifact ${id}.` };
    const denied = this.authorize(actor, next);
    if (denied.length) return { ok: false, code: 'PERMISSION_DENIED', reason: denied.join(' ') };
    if (meta.expectedVersion != null && meta.expectedVersion !== cur.version) return { ok: false, code: 'STALE_VERSION', reason: `The workbook changed since you read it (version ${meta.expectedVersion} → ${cur.version}).` };
    const m = this.compose(actor, next, cur.version + 1, id);
    const pins = this.pins(m);
    const rec = WORK.repos.database.tx(() => {
      const u = WORK.repos.records.update<ArtifactBody>(KIND, id, cur.version, actor.id, (o) => ({ ...strip(o), name: next.name, definition: next, pins, lastChange: change, lastError: null,
        traceIds: [...new Set([...o.traceIds, ...(meta.traceId ? [meta.traceId] : [])])], history: [...o.history, { version: o.version, at: o.updatedAt, by: o.updatedBy, change: o.lastChange, definition: o.definition, pins: o.pins }] }), { status: 'DRAFT', period: next.periodEnd, scope: next.scopeId });
      this.audit(actor, meta.via, 'ARTIFACT_MODIFIED', u, { version: cur.version, definition: summarize(cur.definition) }, { version: u.version, change, definition: summarize(next) }, meta);
      return u;
    });
    return { ok: true, artifact: rec, model: m };
  }

  /** a stale artifact refreshed against the current data: a NEW version, the definition unchanged */
  refresh(actor: Actor, id: string, expectedVersion: number | null, via: Channel) {
    const cur = this.get(id);
    if (!cur || !this.canSee(actor, cur)) return { ok: false as const, code: 'NOT_FOUND' as const, reason: `No artifact ${id}.` };
    return this.modify(actor, id, cur.definition, 'Refreshed against the current governed data', { via, expectedVersion });
  }

  /** the artifact as the reader sees it: its status re-derived (STALE is detected here), versions and generations */
  view(actor: Actor, id: string) {
    const a = this.get(id);
    if (!a || !this.canSee(actor, a)) return null;
    const m = this.compose(actor, a.definition, a.version, a.id);
    const live = this.pins(m);
    const stale = live.fingerprint !== a.pins.fingerprint;
    const validation = this.validate(actor, a.definition, m, a.pins);
    const status: ArtifactStatus = a.status === 'GENERATING' || a.status === 'VALIDATING' || a.status === 'ARCHIVED' ? a.status as ArtifactStatus : stale ? 'STALE' : (a.status as ArtifactStatus) ?? 'DRAFT';
    return { id: a.id, name: a.name, version: a.version, status, stale, staleReasons: stale ? diffPins(a.pins, live) : [], definition: a.definition, pins: a.pins, livePins: live,
      createdVia: a.createdVia, investigationId: a.investigationId, owner: a.ownerName, createdAt: a.createdAt, updatedAt: a.updatedAt, lastChange: a.lastChange, lastError: a.lastError,
      versions: [...a.history.map((h) => ({ version: h.version, at: h.at, change: h.change, sheets: h.definition.sheets.map((s) => s.name), fingerprint: h.pins.fingerprint })), { version: a.version, at: a.updatedAt, change: a.lastChange, sheets: a.definition.sheets.map((s) => s.name), fingerprint: a.pins.fingerprint }],
      generations: this.generations(a.id), derivedFrom: a.definition.derivedFrom ?? null, type: a.definition.type ?? 'GL_EXTRACT', validation, contract: this.contract(a, m, validation, status) };
  }
  list(actor: Actor) { return WORK.repos.records.list<ArtifactBody>(KIND).filter((a) => this.canSee(actor, a)).map((a) => ({ id: a.id, name: a.name, version: a.version, status: a.status, updatedAt: a.updatedAt, sheets: a.definition.sheets.map((s) => s.name), createdVia: a.createdVia, type: a.definition.type ?? 'GL_EXTRACT', period: a.definition.periodEnd, derivedFrom: a.definition.derivedFrom?.artifactId ?? null })).reverse(); }
  generations(artifactId: string) {
    return WORK.repos.records.list<GenerationBody>(GEN, { target: artifactId }).map((g) => ({ id: g.id, status: g.status, artifactVersion: g.artifactVersion, format: g.format, fileName: g.fileName, bytes: g.bytes, sha256: g.sha256, tieOut: g.tieOut, auditReady: g.auditReady, acknowledged: g.acknowledged, warnings: g.warnings, error: g.error, requestedBy: g.requestedByName, channel: g.channel, createdAt: g.createdAt, updatedAt: g.updatedAt, metrics: g.metrics, jobId: g.jobId, downloadUrl: g.status === 'COMPLETED' ? `/api/work/artifacts/${encodeURIComponent(artifactId)}/generations/${encodeURIComponent(g.id)}/download` : null })).reverse();
  }

  /* ---- VALIDATION: what a package is judged by before it is generated --------------------------------- */
  /** every check a governed deliverable must pass, from the model it would be rendered from. FAIL blocks generation;
   *  WARN is stated in the preview and on the file; nothing is ever called audit-ready that the tie-out does not support */
  validate(actor: Actor, d: ArtifactDefinition, m: WorkbookModel, pinned?: ArtifactPins | null): Validation {
    const checks: ValidationCheck[] = [];
    const add = (check: string, status: ValidationCheck['status'], detail: string) => checks.push({ check, status, detail });
    const denied = this.authorize(actor, d);
    add('Permissions', denied.length ? 'FAIL' : 'PASS', denied.length ? denied.join(' ') : `${actor.name} may read every section at this scope.`);
    const ps = this.gl.periods();
    add('Period', ps.includes(d.periodEnd) && ps.includes(d.periodStart) && d.periodStart <= d.periodEnd ? 'PASS' : 'FAIL', ps.includes(d.periodEnd) ? `${monLabel(d.periodStart)} – ${monLabel(d.periodEnd)} is in the governed ledger.` : `${d.periodEnd} is not in the governed ledger (latest closed: ${monLabel(ps.at(-1)!)}).`);
    const scope = this.data.scope(d.scopeId);
    add('Scope', scope ? 'PASS' : 'FAIL', scope ? `${d.scopeId === 'GROUP' ? 'Corporate Consolidated' : scope.name} · ${scope.entityIds.length} entit${scope.entityIds.length === 1 ? 'y' : 'ies'}` : `${d.scopeId} is not a governed scope.`);
    for (const p of m.populations) {
      const g = d.sheets.find((x): x is GLSheetDef => x.kind === 'GL' && x.name === p.sheet);
      if (p.rowCount === 0) add(`Population · ${p.sheet}`, g?.rule ? 'WARN' : 'FAIL', g?.rule ? `${p.sheet} has no lines for what this package reports; the section is kept and says so.` : `${p.sheet} has no lines for this scope and window; there is nothing to generate.`);
      else add(`Population · ${p.sheet}`, 'PASS', `${p.rowCount.toLocaleString('en-US')} lines · ${p.populationId} · hash ${p.contentHash}`);
    }
    if (m.tieOut && d.sheets.some((x) => x.kind === 'TIEOUT')) add('Tie-out', m.tieOut.status === 'TIED' ? 'PASS' : 'WARN', statusOf(m.tieOut).text);
    const ents = new Set(scope?.entityIds ?? []);
    const src = this.gl.entities().filter((e) => ents.has(e.id)).map((e) => ({ e, h: SOURCE_HEALTH[e.connector] })).filter((x) => x.h && x.h.status !== 'AVAILABLE');
    add('Source freshness', src.length ? 'WARN' : 'PASS', src.length ? src.map((x) => `${x.e.id} · ${x.h!.system} ${x.h!.status.toLowerCase()}`).join('; ') : 'Every source system in scope is current.');
    const miss = m.sheets.filter((x) => x.kind === 'MISSING_SUPPORT').reduce((t, x) => t + x.rowCount, 0);
    if (d.sheets.some((x) => ['EVIDENCE_INDEX', 'EVIDENCE_COVERAGE', 'SUPPORT_INDEX', 'MISSING_SUPPORT'].includes(x.kind))) add('Evidence', miss ? 'WARN' : 'PASS', `${miss ? `${miss} missing support item(s) or evidence reference(s). ` : ''}Documents are referenced, not downloaded — no document is connected.`);
    if (d.focus?.reconciliationId) {
      const def = this.controls.recDef(d.focus.reconciliationId);
      if (def) { const b = this.controls.reconBalance(def, d.periodEnd); add('Reconciliation', !b.available ? 'WARN' : b.tieStatus === 'TIED' ? 'PASS' : 'WARN', !b.available ? `${def.name}: balances are not server-authoritative — ${b.reason}` : `${def.name}: ${b.tieStatus.replace(/_/g, ' ').toLowerCase()}${b.differenceUsd ? `, difference ${b.differenceUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}` : ''} · ${b.id} v${b.version}`); }
    }
    /* one line for everything left out, not one per item */
    if (m.excluded.length) add('Excluded', 'WARN', m.excluded.length === 1 ? `${m.excluded[0]!.label} — ${m.excluded[0]!.reason}` : `${m.excluded.length} items are not cited because their balances are not server-authoritative: ${m.excluded.map((x) => x.label).join('; ')}.`);
    if (pinned) { const live = this.pins(m); if (live.fingerprint !== pinned.fingerprint) add('Stale', 'FAIL', `The governed data changed since this version was defined: ${diffPins(pinned, live).join('; ')}.`); else add('Stale', 'PASS', 'Every pinned population and cited object is unchanged.'); }
    if (/audit[- ]?ready/i.test(d.name) && !m.auditReady) add('Audit-ready claim', 'WARN', 'The name says audit-ready but validation does not support it (no Tie-Out tab, or it does not tie). The file is not labelled audit-ready.');
    const status = checks.some((c) => c.status === 'FAIL') ? 'BLOCKED' : checks.some((c) => c.status === 'WARN') ? 'VALID_WITH_WARNINGS' : 'VALID';
    return { status, checks, auditReady: m.auditReady };
  }

  /** the COMMON ARTIFACT CONTRACT every deliverable type satisfies */
  contract(a: Stamped<ArtifactBody>, m: WorkbookModel, v: Validation, status: string) {
    const d = a.definition, cites = m.citations;
    const recIds = [...new Set([...cites.filter((c) => c.type === 'RECONCILIATION_BALANCE').map((c) => c.id), ...(d.focus?.reconciliationId ? [d.focus.reconciliationId] : [])])];
    return {
      id: a.id, type: d.type ?? 'GL_EXTRACT', typeLabel: ARTIFACT_TYPE_LABEL[d.type ?? 'GL_EXTRACT'], title: a.name, period: { start: d.periodStart, end: d.periodEnd, label: m.rangeLabel }, scope: { id: d.scopeId, label: m.scopeLabel }, currency: d.currency, basis: d.basis,
      sourceFinancialObjects: cites.filter((c) => c.type !== 'EVIDENCE_RELATIONSHIPS').map((c) => ({ type: c.type, id: c.id, version: c.version })),
      sourcePopulations: m.populations.map((p) => ({ id: p.populationId, sheet: p.sheet, rows: p.rowCount, hash: p.contentHash })),
      sourceEvidence: cites.filter((c) => c.type === 'EVIDENCE_RELATIONSHIPS').map((c) => ({ id: c.id, version: c.version })),
      sourceReconciliations: recIds, sourceFluxItems: cites.filter((c) => c.type === 'FLUX_EXPLANATION').map((c) => c.id),
      sections: d.sheets.map((x) => ({ kind: x.kind, name: x.name })), worksheets: m.sheets.map((x) => x.name), status, version: a.version, createdBy: a.ownerName, createdAt: a.createdAt,
      dataVersion: m.dataVersion, mappingVersion: MAPPING_VERSION, sourceSystems: m.sourceSystems, investigationId: a.investigationId, executionTraceId: a.traceIds.at(-1) ?? null,
      permissions: { owner: a.ownerName, sharedWith: a.sharedWith }, warnings: m.warnings, validationStatus: v.status, derivedFrom: d.derivedFrom ?? null,
    };
  }

  /** REUSE: a NEW artifact from an existing one — the source is never overwritten */
  derive(actor: Actor, id: string, o: { periodEnd?: string | null; scopeId?: string | null; vendor?: string | null; name?: string | null }, meta: { via: Channel; investigationId?: string | null; sessionId?: string | null; traceId?: string | null }): { ok: true; artifact: Stamped<ArtifactBody>; model: WorkbookModel; changes: string[] } | EngineError {
    const src = this.get(id);
    if (!src || !this.canSee(actor, src)) return { ok: false, code: 'NOT_FOUND', reason: `No artifact ${id}.` };
    const r0 = this.deriveDefinition(src, o);
    if (!r0.ok) return r0;
    const r = this.create(actor, r0.definition, meta);
    return r.ok ? { ...r, changes: r0.changes } : r;
  }
  /** the definition a reuse would create — the source's structure over a new period, scope or vendor */
  deriveDefinition(src: { id: string; version: number; name: string; definition: ArtifactDefinition }, o: { periodEnd?: string | null; scopeId?: string | null; vendor?: string | null; name?: string | null }): { ok: true; definition: ArtifactDefinition; changes: string[] } | EngineError {
    const ps = this.gl.periods(), d = structuredClone(src.definition) as ArtifactDefinition, changes: string[] = [];
    if (o.periodEnd && o.periodEnd !== d.periodEnd) {
      if (!ps.includes(o.periodEnd)) return { ok: false, code: 'VALIDATION_ERROR', reason: `${/^\d{4}-\d{2}$/.test(o.periodEnd) ? monLabel(o.periodEnd) : o.periodEnd} is not in the governed ledger — the latest closed period is ${monLabel(ps.at(-1)!)}. Korvyn will not build a package for a period that has not closed.` };
      const month = d.periodStart === d.periodEnd, fy = d.periodStart === `${d.periodEnd.slice(0, 4)}-01`;
      const wasTok = periodToken(d.periodStart, d.periodEnd), wasMon = monLabel(d.periodEnd), wasRange = rangeLabel(d.periodStart, d.periodEnd);
      d.periodStart = month ? o.periodEnd : fy ? `${o.periodEnd.slice(0, 4)}-01` : d.periodStart <= o.periodEnd ? d.periodStart : `${o.periodEnd.slice(0, 4)}-01`;
      d.periodEnd = o.periodEnd;
      changes.push(`Period ${wasRange} → ${rangeLabel(d.periodStart, d.periodEnd)}`);
      if (d.nameSource === 'USER') d.name = d.name.replace(wasTok, periodToken(d.periodStart, d.periodEnd)).replace(wasMon, monLabel(d.periodEnd));
    }
    if (o.scopeId && o.scopeId !== d.scopeId) {
      const sc = this.data.scope(o.scopeId);
      if (!sc) return { ok: false, code: 'VALIDATION_ERROR', reason: `${o.scopeId} is not a governed scope.` };
      changes.push(`Scope ${d.scopeId} → ${o.scopeId}`); d.scopeId = o.scopeId;
    }
    if (o.vendor && o.vendor !== d.focus?.vendor) {
      d.focus = { ...(d.focus ?? {}), vendor: o.vendor };
      for (const x of d.sheets) if (x.kind === 'GL' && x.filter.vendor) x.filter.vendor = o.vendor;
      changes.push(`Vendor → ${o.vendor}`);
    }
    if (!changes.length && !o.name) return { ok: false, code: 'VALIDATION_ERROR', reason: 'Name what the new package should differ by — a period, a scope or a vendor. An identical copy would be the same package twice.' };
    d.derivedFrom = { artifactId: src.id, version: src.version, name: src.name };
    d.notes = [];
    if (o.name) { d.name = o.name; d.nameSource = 'USER'; } else if (d.nameSource !== 'USER') d.name = this.nameOf(d);
    return { ok: true, definition: d, changes };
  }

  /** a prior definition restored as a NEW version — history is never rewritten */
  restore(actor: Actor, id: string, version: number, meta: { via: Channel; expectedVersion?: number | null; traceId?: string | null }) {
    const cur = this.get(id);
    if (!cur || !this.canSee(actor, cur)) return { ok: false as const, code: 'NOT_FOUND' as const, reason: `No artifact ${id}.` };
    const h = cur.history.find((x) => x.version === version);
    if (!h) return { ok: false as const, code: 'NOT_FOUND' as const, reason: `${cur.name} has no version ${version}.` };
    return this.modify(actor, id, h.definition, `Restored the definition of v${version}`, meta);
  }

  /** SAVED, ARCHIVED or back to DRAFT — a lifecycle state, not a new definition */
  setStatus(actor: Actor, id: string, status: 'SAVED' | 'ARCHIVED' | 'DRAFT', meta: { via: Channel; expectedVersion?: number | null; traceId?: string | null }): { ok: true; artifact: Stamped<ArtifactBody> } | EngineError {
    const cur = this.get(id);
    if (!cur || !this.canSee(actor, cur)) return { ok: false, code: 'NOT_FOUND', reason: `No artifact ${id}.` };
    const r = AuthorizationService.can(actor as never, 'ARTIFACT_CREATE');
    if (!r.allowed) return { ok: false, code: 'PERMISSION_DENIED', reason: r.reason };
    if (meta.expectedVersion != null && meta.expectedVersion !== cur.version) return { ok: false, code: 'STALE_VERSION', reason: `The workbook changed since you read it (version ${meta.expectedVersion} → ${cur.version}).` };
    if (cur.status === 'GENERATING') return { ok: false, code: 'CONFLICT', reason: 'The workbook is generating; wait for it to finish or cancel the job.' };
    WORK.repos.database.tx(() => {
      setRecordStatus(WORK.repos.records, KIND, id, status, actor.id);
      this.audit(actor, meta.via, status === 'ARCHIVED' ? 'ARTIFACT_ARCHIVED' : status === 'SAVED' ? 'ARTIFACT_SAVED' : 'ARTIFACT_REOPENED', cur, { status: cur.status }, { version: cur.version, status }, meta);
    });
    return { ok: true, artifact: this.get(id)! };
  }

  /** the WORKBOOK PREVIEW: the same model the file is rendered from, with representative rows */
  previewOf(m: WorkbookModel, a: { id: string; version: number; status: string; name: string }, sample = 15, section?: string | null) {
    const t = m.tieOut ? { ...statusOf(m.tieOut), status: m.tieOut.status, differenceUsd: Math.round(m.tieOut.differenceUsd * 100) / 100 } : null;
    const partitions = m.sheets.filter((s) => s.part).length;
    return {
      artifactId: a.id, version: a.version, status: a.status, name: a.name, fileName: m.fileName, csvFileName: m.csvFileName, scope: m.scopeLabel, range: m.rangeLabel, currency: 'USD', auditReady: m.auditReady,
      tieOut: t, warnings: m.warnings, excluded: m.excluded, totalRows: m.totalRows, citations: m.citations.length,
      recommendCsv: m.populations.some((p) => p.rowCount > XLSX_RECOMMEND_CSV_ROWS) ? `The population is ${Math.max(...m.populations.map((p) => p.rowCount)).toLocaleString('en-US')} lines. Excel would require ${Math.max(partitions, 1)} worksheets. A CSV extract may be more practical.` : null,
      focusSheet: section ? findSheet(m, section) : null,
      sheets: m.sheets.map((s) => {
        const b = s.blocks.find((x) => x.tabular) ?? s.blocks[s.blocks.length - 1]!;
        const rows: { cells: string[]; style: string }[] = [];
        for (const chunk of b.chunks()) { for (const r of chunk) { if (rows.length >= sample) break; rows.push({ cells: r.cells.map((c, i) => fmtCell(c, b.columns[i]?.format ?? 'text')), style: r.style ?? 'data' }); } if (rows.length >= sample) break; }
        return { name: s.name, kind: s.kind, title: s.title, rowCount: s.rowCount, part: s.part, columns: b.columns.map((c) => ({ header: c.header, format: c.format })), rows, totals: (b.totals ?? []).map((r) => ({ cells: r.cells.map((c, i) => fmtCell(c, b.columns[i]?.format ?? 'text')), style: 'total' })), heading: b.heading ?? null, blocks: s.blocks.length };
      }),
    };
  }

  /* ---- generation ------------------------------------------------------------------------------------ */
  /** validate and start a generation. The FILE is produced by the job; this returns before any file work begins. */
  requestGeneration(actor: Actor, id: string, o: { format?: 'xlsx' | 'csv'; expectedVersion?: number | null; acknowledge?: boolean; channel: Channel; investigationId?: string | null }): { ok: true; generationId: string; job: Job; warnings: string[]; fileName: string } | EngineError {
    const t0 = Date.now();
    const a = this.get(id);
    if (!a || !this.canSee(actor, a)) return { ok: false, code: 'NOT_FOUND', reason: `No artifact ${id}.` };
    const denied = this.authorize(actor, a.definition);
    if (denied.length) return { ok: false, code: 'PERMISSION_DENIED', reason: denied.join(' ') };
    if (o.expectedVersion != null && o.expectedVersion !== a.version) return { ok: false, code: 'STALE_VERSION', reason: `The workbook definition changed since you read it (version ${o.expectedVersion} → ${a.version}). Review it and generate again.` };
    if (a.status === 'GENERATING') return { ok: false, code: 'CONFLICT', reason: 'This workbook is already generating.' };
    if (a.status === 'ARCHIVED') return { ok: false, code: 'CONFLICT', reason: `${a.name} is archived. Restore it before generating.` };
    const prev = (a.status === 'FAILED' || a.status === 'VALIDATING' ? 'DRAFT' : a.status) as ArtifactStatus;
    setRecordStatus(WORK.repos.records, KIND, id, 'VALIDATING', actor.id);
    const format = o.format ?? 'xlsx';
    const tv = Date.now();
    let m: WorkbookModel;
    try { m = this.compose(actor, a.definition, a.version, a.id, new Date().toISOString()); }
    catch (e) { this.fail(actor, a, `Validation failed: ${(e as Error).message}`, o.channel); return { ok: false, code: 'VALIDATION_ERROR', reason: `The workbook could not be built from the governed data: ${(e as Error).message}` }; }
    const live = this.pins(m);
    const back = (_s?: ArtifactStatus) => setRecordStatus(WORK.repos.records, KIND, id, prev, actor.id);
    const v = this.validate(actor, a.definition, m);
    /* EXACT POPULATION: the file is the population this version pinned, or nothing */
    if (live.fingerprint !== a.pins.fingerprint) { back('DRAFT'); return { ok: false, code: 'STALE', reason: `The governed data behind v${a.version} has changed since it was defined (${diffPins(a.pins, live).join('; ')}). Refresh the artifact — that creates v${a.version + 1} against the current data — then generate.`, detail: { reasons: diffPins(a.pins, live) } }; }
    const fail = v.checks.filter((c) => c.status === 'FAIL');
    if (fail.length) { back('DRAFT'); return { ok: false, code: 'VALIDATION_ERROR', reason: fail.map((c) => c.detail).join(' '), detail: { validation: v } }; }
    if (format === 'csv' && !a.definition.sheets.some((s) => s.kind === 'GL')) { back('DRAFT'); return { ok: false, code: 'VALIDATION_ERROR', reason: 'A CSV extract needs a GL tab.' }; }
    const hasTie = a.definition.sheets.some((s) => s.kind === 'TIEOUT');
    const warnings = [...new Set([...m.warnings, ...v.checks.filter((c) => c.status === 'WARN' && c.check !== 'Tie-out').map((c) => `${c.check}: ${c.detail}`)])];
    if (hasTie && m.tieOut && m.tieOut.status !== 'TIED') {
      const s = statusOf(m.tieOut);
      if (!o.acknowledge) { back('DRAFT'); return { ok: false, code: 'TIE_OUT_WARNING', reason: `${s.text} Policy permits generating it, clearly labelled as not audit-ready — confirm to continue.`, detail: { tieOut: m.tieOut.status, differenceUsd: m.tieOut.differenceUsd } }; }
      warnings.push(s.text);
    }
    const validationMs = Date.now() - tv;
    const fileName = format === 'csv' ? m.csvFileName : m.fileName;
    const jobId = `JOB-${randomUUID().slice(0, 8).toUpperCase()}`;
    const body: GenerationBody = { artifactId: id, artifactVersion: a.version, format, fileName, storageKey: null, bytes: null, sha256: null, definition: a.definition, pins: live,
      tieOut: m.tieOut ? { status: m.tieOut.status, differenceUsd: Math.round(m.tieOut.differenceUsd * 100) / 100 } : null, auditReady: m.auditReady, acknowledged: !!o.acknowledge, warnings,
      channel: o.channel, requestedBy: actor.id, requestedByName: actor.name, jobId, error: null, metrics: { definitionMs: Date.now() - t0 - validationMs, validationMs, generationMs: null, rows: m.totalRows, rowsPerSecond: null, peakHeapMb: null, sheets: m.sheets.map((s) => s.name) } };
    const g = WORK.repos.database.tx(() => {
      const rec = WORK.repos.records.insert<GenerationBody>(GEN, body, actor.id, { prefix: 'GEN', target: id, status: 'GENERATING', period: a.definition.periodEnd, scope: a.definition.scopeId });
      setRecordStatus(WORK.repos.records, KIND, id, 'GENERATING', actor.id);
      return rec;
    });
    const job: Job = { id: jobId, generationId: g.id, artifactId: id, status: 'QUEUED', rows: 0, totalRows: m.totalRows, sheet: '', startedAt: new Date().toISOString(), finishedAt: null, error: null, cancelRequested: false, cancelledBy: null, done: Promise.resolve() };
    job.done = new Promise<void>((resolve) => setImmediate(() => { void this.runJob(actor, a, g.id, m, format, job, { ...o, prev }).finally(resolve); }));
    this.jobs.set(jobId, job);
    return { ok: true, generationId: g.id, job, warnings, fileName };
  }

  private async runJob(actor: Actor, a: Stamped<ArtifactBody>, genId: string, m: WorkbookModel, format: 'xlsx' | 'csv', job: Job, o: { channel: Channel; investigationId?: string | null; prev: ArtifactStatus }) {
    const fileName = format === 'csv' ? m.csvFileName : m.fileName;
    const key = `${genId}/${fileName}`;
    const check = () => { if (job.cancelRequested) throw new Cancelled(); };
    try {
      check();
      job.status = 'VALIDATING';
      /* the definition a job renders is the version that was requested; a change while queued fails it rather than
         rendering a file that no longer matches what was validated */
      const cur = this.get(a.id);
      if (!cur || cur.version !== a.version) throw new Error(`The definition changed to v${cur?.version ?? '?'} while the job was queued; generate again.`);
      check();
      job.status = 'GENERATING';
      const path = this.store.locate(key);
      const manifest: [string, string][] = [['Korvyn governed extract', a.name], ['Artifact', `${a.id} v${a.version}`], ['Scope', m.scopeLabel], ['Period', m.rangeLabel], ['Currency', 'USD'], ['Basis', a.definition.basis],
        ...m.populations.map((p) => [`Population ${p.sheet}`, `${p.populationId} · ${p.rowCount} lines · net ${p.netUsd.toFixed(2)}`] as [string, string]), ['Governed data version', m.dataVersion], ['Mapping version', MAPPING_VERSION], ['Tie-out', m.tieOut ? m.tieOut.status : 'not included'], ['Generated', new Date().toISOString()], ['Generated by', actor.name]];
      const progress = (p: { rows: number; sheet: string }) => { job.rows = p.rows; job.sheet = p.sheet; check(); };
      const r = format === 'csv' ? await this.csv.render(m, path, manifest, progress) : await this.excel.render(m, path, progress);
      check();
      const { bytes } = this.store.commit(key);
      const g = WORK.repos.records.get<GenerationBody>(GEN, genId)!;
      WORK.repos.database.tx(() => {
        WORK.repos.records.update<GenerationBody>(GEN, genId, g.version, actor.id, (x) => ({ ...strip(x), storageKey: key, bytes, sha256: r.sha256, metrics: { ...x.metrics, generationMs: r.ms, rows: r.rows, rowsPerSecond: r.rowsPerSecond, peakHeapMb: r.peakHeapMb, sheets: r.sheets } }), { status: 'COMPLETED' });
        setRecordStatus(WORK.repos.records, KIND, a.id, 'GENERATED', actor.id);
        this.audit(actor, o.channel, 'ARTIFACT_GENERATED', a, null, { version: a.version, generationId: genId, format, fileName, bytes, sha256: r.sha256, rows: r.rows, tieOut: m.tieOut?.status ?? null, auditReady: m.auditReady, populations: m.populations.map((p) => p.populationId), storage: this.store.kind }, { investigationId: o.investigationId ?? a.investigationId });
      });
      job.status = 'COMPLETED'; job.rows = r.rows;
    } catch (e) {
      this.store.discard(key);
      const g = WORK.repos.records.get<GenerationBody>(GEN, genId);
      if (e instanceof Cancelled) {
        const why = `Cancelled by ${job.cancelledBy ?? actor.name} after ${job.rows.toLocaleString('en-US')} rows; no file was kept.`;
        job.status = 'CANCELLED'; job.error = why;
        if (g) WORK.repos.records.update<GenerationBody>(GEN, genId, g.version, actor.id, (x) => ({ ...strip(x), error: why }), { status: 'CANCELLED' });
        setRecordStatus(WORK.repos.records, KIND, a.id, o.prev, actor.id);
        this.audit(actor, o.channel, 'ARTIFACT_GENERATION_CANCELLED', a, null, { version: a.version, generationId: genId, rows: job.rows }, { investigationId: o.investigationId ?? a.investigationId });
      } else {
        const why = (e as Error).message;
        job.status = 'FAILED'; job.error = why;
        if (g) WORK.repos.records.update<GenerationBody>(GEN, genId, g.version, actor.id, (x) => ({ ...strip(x), error: why }), { status: 'FAILED' });
        this.fail(actor, a, `Generation failed: ${why}`, o.channel);
      }
    } finally { job.finishedAt = new Date().toISOString(); }
  }
  /** a running or queued job stops at its next chunk; the partial file is discarded and the definition is untouched */
  cancel(actor: Actor, jobId: string): { ok: true; job: ReturnType<ArtifactEngine['job']> } | EngineError {
    const j = this.jobs.get(jobId);
    if (!j) return { ok: false, code: 'NOT_FOUND', reason: `No job ${jobId}.` };
    const a = this.get(j.artifactId);
    if (!a || !this.canSee(actor, a)) return { ok: false, code: 'NOT_FOUND', reason: `No job ${jobId}.` };
    if (j.status === 'COMPLETED' || j.status === 'FAILED' || j.status === 'CANCELLED') return { ok: false, code: 'CONFLICT', reason: `The job has already ${j.status.toLowerCase()}.` };
    j.cancelRequested = true; j.cancelledBy = actor.name;
    return { ok: true, job: this.job(jobId) };
  }
  /** a failure keeps the definition intact and records why */
  private fail(actor: Actor, a: Stamped<ArtifactBody>, why: string, channel: Channel) {
    const cur = this.get(a.id)!;
    /* lastError is operational state, not a new definition: the version stays what the definition is */
    patchRecordData(WORK.repos.records, KIND, a.id, { lastError: why }, 'FAILED', actor.id);
    this.audit(actor, channel, 'ARTIFACT_GENERATION_FAILED', cur, null, { version: cur.version, error: why }, { investigationId: cur.investigationId }, 'FAILED', why);
  }
  job(id: string) { const j = this.jobs.get(id); return j ? { id: j.id, generationId: j.generationId, artifactId: j.artifactId, status: j.status, rows: j.rows, totalRows: j.totalRows, sheet: j.sheet, startedAt: j.startedAt, finishedAt: j.finishedAt, error: j.error, cancelRequested: j.cancelRequested } : null; }
  jobPromise(id: string) { return this.jobs.get(id)?.done ?? Promise.resolve(); }

  /** a download re-checks access against the reader NOW (a permission removed since generation removes the file) */
  download(actor: Actor, artifactId: string, genId: string, channel: Channel): { ok: true; path: string; fileName: string; contentType: string; bytes: number } | EngineError {
    const a = this.get(artifactId);
    if (!a || !this.canSee(actor, a)) return { ok: false, code: 'NOT_FOUND', reason: `No artifact ${artifactId}.` };
    const g = WORK.repos.records.get<GenerationBody>(GEN, genId);
    if (!g || g.artifactId !== artifactId) return { ok: false, code: 'NOT_FOUND', reason: `No generation ${genId}.` };
    const denied = this.authorize(actor, g.definition, 'GL_VIEW');
    if (denied.length) return { ok: false, code: 'PERMISSION_DENIED', reason: denied.join(' ') };
    if (g.status !== 'COMPLETED' || !g.storageKey) return { ok: false, code: 'CONFLICT', reason: g.status === 'FAILED' || g.status === 'CANCELLED' ? `This generation ${g.status.toLowerCase()}: ${g.error}` : 'The file is still being generated.' };
    if (!this.store.exists(g.storageKey)) return { ok: false, code: 'NOT_FOUND', reason: `The file for ${g.id} is no longer in storage; generate the version again.` };
    this.audit(actor, channel, 'ARTIFACT_DOWNLOADED', a, null, { version: g.artifactVersion, generationId: genId, fileName: g.fileName, sha256: g.sha256 }, { investigationId: a.investigationId });
    return { ok: true, path: this.store.read(g.storageKey), fileName: g.fileName, contentType: g.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: g.bytes ?? 0 };
  }

  /** a generation that was running when the server stopped is FAILED with that reason; the definition is untouched */
  private recoverInterrupted() {
    try {
      for (const g of WORK.repos.records.list<GenerationBody>(GEN, { status: 'GENERATING' })) {
        WORK.repos.records.update<GenerationBody>(GEN, g.id, g.version, 'system:artifacts', (x) => ({ ...strip(x), error: 'Interrupted by a server restart before the file was complete. The definition is kept — generate again.' }), { status: 'FAILED' });
        setRecordStatus(WORK.repos.records, KIND, g.artifactId, 'FAILED', 'system:artifacts');
      }
      for (const a of WORK.repos.records.list<ArtifactBody>(KIND).filter((x) => x.status === 'VALIDATING')) setRecordStatus(WORK.repos.records, KIND, a.id, 'DRAFT', 'system:artifacts');
      /* 4A named a finished generation GENERATED; the job model says COMPLETED */
      for (const g of WORK.repos.records.list<GenerationBody>(GEN, { status: 'GENERATED' })) setRecordStatus(WORK.repos.records, GEN, g.id, 'COMPLETED', 'system:artifacts');
    } catch { /* no database bound yet (a unit test composing directly) */ }
  }

  private audit(actor: Actor, channel: Channel, action: string, a: Stamped<ArtifactBody>, before: unknown, after: Record<string, unknown>, meta: { investigationId?: string | null; traceId?: string | null } = {}, outcome: 'COMPLETED' | 'FAILED' = 'COMPLETED', error: string | null = null) {
    return WORK.repos.audit.append({ actor: who(actor), source: channel === 'SLOANE' ? 'SLOANE' : 'UI', action, target: { id: a.id, type: 'EXCEL_ARTIFACT', label: a.name },
      beforeRef: a.id, afterRef: a.id, before, after: { ...after, channel, scope: a.definition.scopeId, period: `${a.definition.periodStart}..${a.definition.periodEnd}` }, investigationId: meta.investigationId ?? a.investigationId ?? null, executionTraceId: meta.traceId ?? null, proposalId: null,
      confirmation: null, financialObjectIds: [], populationIds: a.pins.populations.map((p) => p.populationId), evidenceIds: [], outcome, error });
  }
}

/* ---- helpers --------------------------------------------------------------------------------------- */
/** the tab a person names — "the blockers tab", "GL", "tie-out" — by name, then by what the words mean */
export function findSheet(m: WorkbookModel, words: string): string | null {
  const w = words.toLowerCase().replace(/\b(the|tab|tabs|sheet|sheets|section|worksheet)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!w) return null;
  const stem = (x: string) => x.replace(/s\b/g, '');
  const exact = m.sheets.find((s) => s.name.toLowerCase() === w);
  if (exact) return exact.name;
  const part = m.sheets.find((s) => stem(s.name.toLowerCase()).includes(stem(w)));
  if (part) return part.name;
  const kinds = sheetsIn(` ${w} `);
  const byKind = m.sheets.find((s) => kinds.includes(s.kind as SheetKind) || (/\b(gl|general ledger|ledger)\b/.test(w) && s.kind === 'GL'));
  return byKind?.name ?? null;
}
/** the deterministic name of a definition: its window, its vendor (if any), what it is, and its threshold */
/** 4A's name function, kept for callers that have no engine; the engine names through `nameOf` (nameFor, by type) */
export function autoName(d: ArtifactDefinition) {
  const tok = periodToken(d.periodStart, d.periodEnd);
  const g = d.sheets.find((s): s is GLSheetDef => s.kind === 'GL');
  const m = g?.filter.minAbsUsd;
  const thr = m ? ` over $${m >= 1e6 ? `${+(m / 1e6).toFixed(2)}M` : `${Math.round(m / 1e3)}K`}` : '';
  const audit = d.sheets.some((s) => s.kind === 'TB') && d.sheets.some((s) => s.kind === 'TIEOUT');
  if (g?.filter.vendor) return `${tok} ${g.filter.vendor} GL${thr}`;
  return d.template === 'AUDIT_GL_PACKAGE' && audit ? `${tok} Audit GL Package${thr}` : `${tok} Governed GL${thr}`;
}
const STAMP = ['id', 'version', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'status', 'scope', 'period', 'target', 'investigationId'];
function strip<T extends object>(o: T): T { const c = { ...(o as Record<string, unknown>) }; for (const k of STAMP) if (k !== 'investigationId') delete c[k]; return c as T; }
function summarize(d: ArtifactDefinition) { return { name: d.name, sheets: d.sheets.map((s) => (s.kind === 'GL' ? { name: s.name, columns: s.columns, sort: s.sort, filter: s.filter } : s)), periodStart: d.periodStart, periodEnd: d.periodEnd, scopeId: d.scopeId }; }
export function diffPins(a: ArtifactPins, b: ArtifactPins): string[] {
  const out: string[] = [];
  for (const p of a.populations) {
    const q = b.populations.find((x) => x.sheet === p.sheet);
    if (!q) out.push(`${p.sheet} population no longer resolves`);
    else if (q.contentHash !== p.contentHash) out.push(`${p.sheet}: ${p.rowCount} → ${q.rowCount} lines, net ${p.netUsd.toFixed(2)} → ${q.netUsd.toFixed(2)}`);
  }
  if ((a.tieOut?.status ?? null) !== (b.tieOut?.status ?? null) || (a.tieOut?.differenceUsd ?? 0) !== (b.tieOut?.differenceUsd ?? 0)) out.push(`tie-out ${a.tieOut?.status ?? 'none'} → ${b.tieOut?.status ?? 'none'}`);
  for (const s of a.sourceObjects) { const t = b.sourceObjects.find((x) => x.type === s.type && x.id === s.id); if (!t) out.push(`${s.id} is no longer cited`); else if (t.version !== s.version) out.push(`${s.id} v${s.version} → v${t.version}`); }
  for (const t of b.sourceObjects) if (!a.sourceObjects.some((s) => s.type === t.type && s.id === t.id)) out.push(`${t.id} is newly cited`);
  return out;
}
export function fmtCell(v: unknown, f: string): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) { const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${String(v.getUTCDate()).padStart(2, '0')}-${M[v.getUTCMonth()]}-${v.getUTCFullYear()}`; }
  if (typeof v === 'number') {
    if (f === 'pct') return Math.abs(v) < 0.0005 ? '–' : `${v < 0 ? '(' : ''}${Math.abs(v * 100).toFixed(1)}%${v < 0 ? ')' : ''}`;
    if (f === 'int' || (f === 'text' && Number.isInteger(v))) return v === 0 ? (f === 'text' ? '0' : '–') : v.toLocaleString('en-US');
    if (Math.abs(v) < 0.005) return '–';
    const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v < 0 ? `(${s})` : s;
  }
  return String(v);
}
