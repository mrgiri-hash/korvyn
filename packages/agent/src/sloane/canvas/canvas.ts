/**
 * PHASE 8B — THE DYNAMIC FINANCIAL CANVAS.
 *
 * A canvas is a DEFINITION: an intent, a period, a scope and an ordered list of sections. Every section is composed from
 * a FinancialObject that an existing governed READ tool returned — the canvas has no data model of its own, computes no
 * figure, and reads nothing a tool would not read. Each call is authorised exactly as a planned tool call is
 * (`authorize`), so a section the actor may not see is never built; the canvas says so in one line instead.
 *
 * Composition is intent-driven and role-aware. The persona (preparer, controller, executive, auditor) comes from the
 * actor's governed role, never from the words. Priority is a base weight per (kind, section, persona), raised by open
 * conditions in the section (blocking items, differences, unexplained movements) and lowered when the section is clear.
 * A clear exception section is not drawn: its "nothing open" becomes one line in the status band.
 *
 * The CanvasState — intent, filters, focus and drill — is kept on the conversation's context, so the next short
 * instruction REFINES the canvas on screen rather than recreating it.
 */
import { MAPPING_VERSION } from '../artifacts/tieout.js';
import type { ControlService } from '../controls.js';
import type { FinancialDataService } from '../financials.js';
import type { GovernedLedger } from '../governed.js';
import type { FinancialGraph } from '../semantic/graph.js';
import { type Actor, type FinancialObject, type TableRow, type ToolArgs, type ToolEnv, authorize, toolRegistry, visibleOf } from '../tools.js';
import type { CanvasKind, IntentDefinition, Refinement } from './intent.js';

export type SectionType = 'SUMMARY' | 'STATUS' | 'FOCUS' | 'FINANCIAL_TABLE' | 'DRIVER_ANALYSIS' | 'VARIANCE' | 'TREND' | 'EXCEPTIONS' | 'WORKFLOW'
  | 'RECONCILIATIONS' | 'FLUX' | 'EVIDENCE' | 'RELATED_OBJECTS' | 'RECENT_ACTIVITY' | 'SUGGESTED_ACTIONS';
export type Persona = 'PREPARER' | 'CONTROLLER' | 'EXECUTIVE' | 'AUDITOR';
/** an action is a request Sloane runs in the same conversation, or a structured workspace to open */
export interface CanvasAction { label: string; request?: string; view?: string; primary?: boolean }
export interface CanvasMetric { label: string; value: string; tone: 'bad' | 'warn' | 'ok' | null; request?: string }
export interface SectionTrace { tools: { tool: string; args: ToolArgs }[]; period: string; scope: string; dataVersion: string; mappingVersion: string; snapshotIds: string[]; path: string[] }
export interface CanvasSection {
  id: string;
  sectionType: SectionType;
  title: string;
  subtitle: string | null;
  priority: number;
  layout: 'lead' | 'main' | 'side';
  /** the governed object the section renders (rows as the tool returned them, filtered/sorted by the canvas) */
  object: FinancialObject | null;
  metrics: CanvasMetric[];
  display: { maxRows: number; columns: number[] | null; rowRequest: 'open' | null; emphasis: string | null };
  sourceObjectIds: string[];
  sourcePopulationIds: string[];
  actions: CanvasAction[];
  trace: SectionTrace;
  /** "nothing open" — stated, not drawn as an empty table */
  empty: string | null;
}
export interface CanvasFilters { statement: 'BS' | 'IS' | null; explanation: 'UNEXPLAINED' | null; materialOnly: boolean; sort: 'LARGEST' | null }
export interface CanvasState {
  id: string; version: number; kind: CanvasKind; intent: IntentDefinition; period: string; scope: string;
  subject: IntentDefinition['subject'];
  filters: CanvasFilters;
  /** the object the conversation is on ("start with the largest one") */
  focus: { ref: string; label: string } | null;
  /** what is shown for it ("the related reconciliation", "the GL behind it") */
  drill: { target: 'ITEM' | 'RECONCILIATION' | 'GL' | 'DRIVERS' | 'EVIDENCE'; ref: string; label: string } | null;
  /** the rows of the primary section, in the order shown — what "the first one" means */
  rows: { label: string; ref: string; amount: number | null }[];
}
export interface DynamicCanvasDefinition {
  id: string; version: number; intent: IntentDefinition; kind: CanvasKind;
  title: string; subtitle: string; headline: { value: string; label: string; tone: CanvasMetric['tone'] } | null;
  period: string; periodLabel: string; scope: { id: string; name: string };
  context: { persona: Persona; role: string; reportingLens: string; currency: string; basis: string; dataVersion: string; mappingVersion: string; sources: string[] };
  sections: CanvasSection[];
  filters: CanvasFilters; focus: CanvasState['focus']; drill: CanvasState['drill'];
  /** what is not shown, and why (permission, planning, source) */
  notes: string[];
  structuredWorkspace: { label: string; view: string } | null;
  generatedAt: string;
}
export interface CanvasDeps { data: FinancialDataService; gl: GovernedLedger; controls: ControlService; graph: FinancialGraph; actor: Actor; monthLabel: (p: string) => string }
export interface CanvasCall { tool: string; args: ToolArgs; status: 'COMPLETED' | 'REFUSED' | 'FAILED'; objectId: string | null; latencyMs: number; error: string | null; warnings: string[] }
export interface ComposeResult { definition: DynamicCanvasDefinition; state: CanvasState; calls: CanvasCall[]; objects: FinancialObject[] }

export const personaOf = (a: Actor): Persona => (a.role === 'ENTITY_ACCOUNTANT' ? 'PREPARER' : a.role === 'EXTERNAL_AUDITOR' ? 'AUDITOR' : a.role === 'CFO' ? 'EXECUTIVE' : 'CONTROLLER');
const WORKSPACES: Record<CanvasKind, { label: string; view: string } | null> = {
  CLOSE: { label: 'Open Close', view: 'acctclose' }, FLUX: { label: 'Open Flux Review', view: 'finrep' }, FINANCIALS: { label: 'Open Financials', view: 'glfin' },
  RECONCILIATIONS: { label: 'Open Reconciliations', view: 'glrecon' }, OBJECT: { label: 'Open Account Activity', view: 'glact' }, PERIOD: { label: 'Open Current Period', view: 'acctover' }, PLANNING: null,
};

/* ---- small readers: nothing here computes a figure --------------------------------------------------------- */
export function money(s: string | undefined): number | null {
  if (!s) return null; const m = s.replace(/,/g, '').match(/(\()?-?\$?(\d+(?:\.\d+)?)([KMB])?\)?/);
  if (!m || !/\d/.test(s) || /%/.test(s)) return null;
  const v = Number(m[2]) * ({ K: 1e-3, M: 1, B: 1e3 } as Record<string, number>)[m[3] ?? 'M']!;
  return m[1] || /^-/.test(s.trim()) ? -v : v;
}
const fact = (o: FinancialObject | null, k: string) => o?.facts.find((f) => f.key === k)?.display ?? null;
const AMOUNT_COLS = ['Change', 'Difference', 'Amount (USD)', 'Amount', 'GL balance', 'Jun 2026'];
const amountCol = (o: FinancialObject) => { for (const c of AMOUNT_COLS) { const i = o.table.columns.indexOf(c); if (i >= 0) return i; } return o.table.columns.length - 1; };
const rowAmount = (o: FinancialObject, r: TableRow) => money(r.cells[amountCol(o)]);
/** the account a row is about: `flux:16000:2026-06`, `FLUX-11000-2026-06`, `account:15000`, `REC-MDH-13100` */
export function accountOfRef(ref: string): string | null {
  const m = ref.match(/^(?:flux:)?FLUX-(\d{5})-/) ?? ref.match(/^flux:(\d{5})\b/) ?? ref.match(/^account:(\d{5})$/) ?? ref.match(/^(?:recon:)?REC-.+-(\d{5})$/);
  return m ? m[1]! : null;
}
export const reconOfRef = (ref: string) => ref.match(/^(?:recon:)?(REC-.+-\d{5})$/)?.[1] ?? null;
const entityOfRecon = (id: string) => id.match(/^REC-(.+)-\d{5}$/)?.[1] ?? null;
const isBS = (acct: string) => /^[123]/.test(acct);
const withRows = (o: FinancialObject, rows: TableRow[]): FinancialObject => ({ ...o, table: { columns: o.table.columns, rows } });
/** newest month first, the total still last */
const newestFirst = (o: FinancialObject) => withRows(o, [...o.table.rows.filter((r) => r.kind === 'line')].reverse().concat(o.table.rows.filter((r) => r.kind !== 'line')));

export class CanvasEngine {
  private calls: CanvasCall[] = [];
  private objects: FinancialObject[] = [];
  private denied = new Set<string>();
  private static readonly AREA: Record<string, string> = { flux: 'Flux', close: 'close', recon: 'reconciliations', reporting: 'reporting packages', audit: 'audit', evidence: 'evidence', financials: 'group statements', ledger: 'the ledger', analysis: 'analysis', semantic: 'Flux support', tb: 'the trial balance' };
  private seq = 0;
  constructor(private readonly d: CanvasDeps) {}

  /** run one governed READ tool exactly as a planned step would: authorised, scoped to the actor, recorded */
  private run(tool: string, args: ToolArgs): FinancialObject | null {
    const t = toolRegistry.get(tool);
    if (!t || t.risk !== 'READ') return null;
    const g = authorize(this.d.actor, t, args);
    const st = Date.now();
    if (!g.ok) { this.denied.add(t.domain); this.calls.push({ tool, args, status: 'REFUSED', objectId: null, latencyMs: 0, error: g.reason, warnings: [] }); return null; }
    try {
      const env: ToolEnv = { data: this.d.data, gl: this.d.gl, controls: this.d.controls, actor: this.d.actor, objectId: `CV-${++this.seq}`, visible: visibleOf(this.d.actor) };
      const r = t.run(args, env);
      this.calls.push({ tool, args, status: 'COMPLETED', objectId: r.object.id, latencyMs: Date.now() - st, error: null, warnings: r.warnings });
      if (r.object.status === 'UNAVAILABLE' && /not permitted|outside|access/i.test(r.object.unavailable?.reason ?? '')) { this.denied.add(t.domain); return null; }
      this.objects.push(r.object);
      return r.object;
    } catch (e) {
      this.calls.push({ tool, args, status: 'FAILED', objectId: null, latencyMs: Date.now() - st, error: (e as Error).message, warnings: [] });
      return null;
    }
  }

  private trace(o: FinancialObject | null, tools: { tool: string; args: ToolArgs }[], s: CanvasState): SectionTrace {
    const refs = o ? o.table.rows.map((r) => r.ref).filter((x): x is string => !!x).slice(0, 12) : [];
    return { tools, period: s.period, scope: s.scope, dataVersion: this.d.gl.dataVersion(), mappingVersion: MAPPING_VERSION,
      snapshotIds: o ? [o.provenance.snapshotId] : [], path: [...tools.map((x) => `${x.tool}(${Object.entries(x.args).map(([k, v]) => `${k}=${v}`).join(', ')})`), ...(o ? [o.provenance.source] : []), ...refs.slice(0, 3)] };
  }

  private section(s: CanvasState, type: SectionType, title: string, o: FinancialObject | null, p: Partial<CanvasSection> & { priority: number; tools?: { tool: string; args: ToolArgs }[] }): CanvasSection {
    const tools = p.tools ?? (o ? this.calls.filter((c) => c.objectId === o.id).map((c) => ({ tool: c.tool, args: c.args })) : []);
    return {
      id: `${type.toLowerCase()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, sectionType: type, title, subtitle: p.subtitle ?? null,
      priority: p.priority, layout: p.layout ?? 'main', object: o, metrics: p.metrics ?? [],
      display: { maxRows: 6, columns: null, rowRequest: o && o.table.rows.some((r) => r.ref) ? 'open' : null, emphasis: null, ...(p.display ?? {}) },
      sourceObjectIds: o ? [...new Set(o.table.rows.map((r) => r.ref).filter((x): x is string => !!x))].slice(0, 25) : [],
      sourcePopulationIds: o ? [o.population?.populationId, o.refs['populationId']].filter((x): x is string => !!x) : [],
      actions: p.actions ?? [], trace: this.trace(o, tools, s), empty: p.empty ?? null,
    };
  }

  /** filter and sort a list the way the canvas state asks — rows only; the object's own facts are the tool's */
  private shape(o: FinancialObject, s: CanvasState, opts: { statement?: boolean; material?: (r: TableRow) => boolean } = {}): FinancialObject {
    let rows = o.table.rows.filter((r) => r.kind === 'line');
    if (opts.statement && s.filters.statement) rows = rows.filter((r) => { const a = accountOfRef(r.ref ?? ''); return a ? isBS(a) === (s.filters.statement === 'BS') : true; });
    if (s.filters.materialOnly && opts.material) rows = rows.filter(opts.material);
    if (s.filters.sort === 'LARGEST') rows = [...rows].sort((a, b) => Math.abs(rowAmount(o, b) ?? 0) - Math.abs(rowAmount(o, a) ?? 0));
    return withRows(o, rows);
  }

  compose(state: CanvasState): ComposeResult {
    this.calls = []; this.objects = []; this.denied = new Set(); this.seq = 0;
    const s = state, persona = personaOf(this.d.actor);
    const sections: CanvasSection[] = [];
    const notes = [...s.intent.notes];
    let headline: DynamicCanvasDefinition['headline'] = null, title = '', subtitle = '';
    const P = s.period, PL = this.d.monthLabel(P);
    const periods = this.d.data.governedPeriods(), pi = periods.indexOf(P), prior = pi > 0 ? periods[pi - 1]! : null;
    const scopeName = this.d.data.scope(s.scope)?.name ?? s.scope;
    const w = (base: Record<Persona, number>) => base[persona];
    let primary: FinancialObject | null = null;

    const drill = this.drill(s);
    if (drill) sections.push(drill);

    switch (s.kind) {
      case 'CLOSE': {
        const ready = this.run('getCloseReadiness', { period: P });
        const blockers = this.run('getCloseBlockers', { period: P });
        const approvals = this.run('getPendingApprovals', { period: P });
        const signals = this.run('getContinuousCloseSignals', { period: P });
        const stale = signals ? signals.table.rows.filter((r) => /^SOURCE_/.test(r.label)).map((r) => (r.cells[1] ?? '').split(':')[0]!) : [];
        title = `${PL} close`;
        subtitle = `${scopeName} · ${s.intent.currency} · the close the book is working in`;
        if (ready) headline = { value: fact(ready, 'readinessPct') ?? '—', label: 'ready', tone: null };
        const blocking = blockers ? blockers.table.rows.filter((r) => r.cells[0] === 'BLOCKING').length : 0;
        if (ready) sections.push(this.section(s, 'STATUS', 'Where the close stands', ready, { priority: 1000, layout: 'lead', display: { maxRows: 0, columns: null, rowRequest: null, emphasis: null },
          metrics: [
            ...(blockers ? [{ label: 'Material blockers', value: String(blocking), tone: (blocking ? 'bad' : 'ok') as CanvasMetric['tone'], request: 'show only material blockers' }] : []),
            { label: 'Close tasks', value: fact(ready, 'tasks') ?? '—', tone: null },
            { label: 'Reconciliations tied & approved', value: fact(ready, 'reconciliations') ?? '—', tone: null, request: 'reconciliations' },
            { label: 'Material flux explained', value: fact(ready, 'flux') ?? '—', tone: null, request: 'flux' },
            ...(approvals ? [{ label: 'Awaiting review', value: fact(approvals, 'pending') ?? '0', tone: (Number(fact(approvals, 'pending')) ? 'warn' : 'ok') as CanvasMetric['tone'] }] : []),
            ...(stale.length ? [{ label: 'Stale or unavailable systems', value: stale.join(' · '), tone: 'warn' as const }] : []),
          ] }));
        if (blockers) {
          const shown = this.shape(blockers, s, { material: (r) => r.cells[0] === 'BLOCKING' });
          primary = shown;
          sections.push(this.section(s, 'EXCEPTIONS', s.filters.materialOnly ? 'Material blockers' : 'What is blocking the close', shown, {
            priority: w({ PREPARER: 820, CONTROLLER: 900, EXECUTIVE: 860, AUDITOR: 700 }) + Math.min(blocking, 20) * 5,
            subtitle: `${shown.table.rows.length} of ${blockers.table.rows.length}${s.filters.sort === 'LARGEST' ? ' · largest first' : ''}`,
            display: { maxRows: 8, columns: null, rowRequest: 'open', emphasis: 'BLOCKING' },
            actions: [{ label: 'Start with the largest', request: 'start with the largest one', primary: true }, { label: 'Only material', request: 'show only material blockers' }, { label: 'Largest first', request: 'largest first' }],
            empty: shown.table.rows.length ? null : 'Nothing is blocking the close.' }));
        }
        if (persona === 'PREPARER') {
          const tasks = this.run('getCloseTasks', { period: P });
          if (tasks) { const open = withRows(tasks, tasks.table.rows.filter((r) => !/^COMPLETE/.test(r.cells[4] ?? '')));
            sections.push(this.section(s, 'WORKFLOW', 'Preparation tasks still open', open, { priority: 950, subtitle: `${open.table.rows.length} of ${fact(tasks, 'tasks') ?? tasks.table.rows.length} tasks`, display: { maxRows: 6, columns: [0, 2, 3, 4], rowRequest: null, emphasis: null }, empty: open.table.rows.length ? null : 'Every preparation task is complete.' })); }
        }
        const recs = this.run('getReconciliationsNotTied', { period: P });
        if (recs) sections.push(this.section(s, 'RECONCILIATIONS', 'Reconciliations not tied', recs, { priority: w({ PREPARER: 880, CONTROLLER: 800, EXECUTIVE: 600, AUDITOR: 820 }) + (recs.table.rows.length ? 20 : -400),
          subtitle: [fact(recs, 'totalDifference') ? `${fact(recs, 'totalDifference')} unreconciled` : null, fact(recs, 'sourceNotConnected') !== '0' ? `${fact(recs, 'sourceNotConnected')} source not connected` : null].filter(Boolean).join(' · ') || null,
          display: { maxRows: 5, columns: [0, 4, 5, 7], rowRequest: 'open', emphasis: 'NOT_TIED' }, actions: [{ label: 'Reconciliations', request: 'reconciliations' }], empty: recs.table.rows.length ? null : 'Every reconciliation ties.' }));
        const flux = this.run('getUnexplainedFluxItems', { period: P });
        if (flux) sections.push(this.section(s, 'FLUX', 'Unexplained material movements', this.shape(flux, s, { statement: true }), { priority: w({ PREPARER: 700, CONTROLLER: 780, EXECUTIVE: 820, AUDITOR: 500 }) + (flux.table.rows.length ? 20 : -400),
          subtitle: `${fact(flux, 'unexplained') ?? flux.table.rows.length} unexplained`, display: { maxRows: 5, columns: [2, 3, 5], rowRequest: 'open', emphasis: 'UNEXPLAINED' }, actions: [{ label: 'Flux', request: 'flux' }], empty: flux.table.rows.length ? null : 'Every material movement is explained.' }));
        const support = this.run('getReconciliationsMissingSupport', { period: P });
        if (support) sections.push(this.section(s, 'EVIDENCE', 'Missing support', support, { priority: w({ PREPARER: 860, CONTROLLER: 640, EXECUTIVE: 300, AUDITOR: 760 }), layout: 'side',
          subtitle: `${fact(support, 'missingItems') ?? '—'} items on ${fact(support, 'missingSupport') ?? support.table.rows.length} reconciliations`, display: { maxRows: 4, columns: [8], rowRequest: 'open', emphasis: null }, empty: support.table.rows.length ? null : 'No support is missing.' }));
        if (approvals && approvals.table.rows.length) sections.push(this.section(s, 'WORKFLOW', 'Awaiting review or approval', approvals, { priority: w({ PREPARER: 500, CONTROLLER: 850, EXECUTIVE: 700, AUDITOR: 400 }), layout: 'side', display: { maxRows: 4, columns: [1], rowRequest: 'open', emphasis: null } }));
        if (persona === 'EXECUTIVE') { const mv = this.run('getLargestFinancialMovements', { period: P });
          if (mv) sections.push(this.section(s, 'VARIANCE', 'Largest financial movements', mv, { priority: 880, display: { maxRows: 5, columns: null, rowRequest: 'open', emphasis: null } })); }
        /* recent close history: each period's own readiness, read from the same tool */
        const hist = periods.slice(Math.max(0, pi - 2), pi + 1).reverse().map((p) => ({ p, o: p === P ? ready : this.run('getCloseReadiness', { period: p }) })).filter((x) => x.o);
        if (hist.length > 1) {
          const tbl: FinancialObject = { ...hist[0]!.o!, id: `CV-HIST-${P}`, type: 'CloseHistory', title: 'Recent closes', table: { columns: ['Ready', 'Blockers'], rows: hist.map((h) => ({ label: this.d.monthLabel(h.p), level: 1, kind: 'line', cells: [fact(h.o, 'readinessPct') ?? '—', fact(h.o, 'blockers') ?? '—'] })) }, facts: [] };
          sections.push(this.section(s, 'TREND', 'Recent closes', tbl, { priority: 300, layout: 'side', tools: hist.map((h) => ({ tool: 'getCloseReadiness', args: { period: h.p } })), display: { maxRows: 3, columns: null, rowRequest: null, emphasis: null } }));
        }
        const pk = this.run('getReportingPackages', { period: P });
        if (pk) sections.push(this.section(s, 'RELATED_OBJECTS', 'Related reporting packages', pk, { priority: w({ PREPARER: 100, CONTROLLER: 250, EXECUTIVE: 600, AUDITOR: 200 }), layout: 'side', display: { maxRows: 3, columns: [1], rowRequest: null, emphasis: null } }));
        break;
      }
      case 'FLUX': {
        const sum = this.run('getFluxSummary', { period: P });
        const listTool = s.filters.explanation === 'UNEXPLAINED' ? 'getUnexplainedFluxItems' : 'getMaterialFluxItems';
        const items = this.run(listTool, { period: P });
        title = `${PL} flux`; subtitle = `${PL} vs ${prior ? this.d.monthLabel(prior) : 'prior month'} · ${scopeName} · ${s.intent.currency}`;
        if (sum) {
          const mat = sum.table.rows.filter((r) => r.cells[4] === 'Yes'), bs = mat.filter((r) => isBS(accountOfRef(r.ref ?? '') ?? '9')).length;
          headline = { value: fact(sum, 'unexplained') ?? '—', label: `of ${fact(sum, 'material') ?? '—'} material movements unexplained`, tone: Number(fact(sum, 'unexplained')) ? 'bad' : 'ok' };
          sections.push(this.section(s, 'STATUS', 'Flux status', sum, { priority: 1000, layout: 'lead', display: { maxRows: 0, columns: null, rowRequest: null, emphasis: null },
            metrics: [
              { label: 'Balance sheet material', value: String(bs), tone: null, request: 'only BS' },
              { label: 'Income statement material', value: String(mat.length - bs), tone: null, request: 'only IS' },
              { label: 'Unexplained', value: fact(sum, 'unexplained') ?? '—', tone: Number(fact(sum, 'unexplained')) ? 'bad' : 'ok', request: 'show unexplained' },
              { label: 'Submitted for review', value: fact(sum, 'submitted') ?? '0', tone: Number(fact(sum, 'submitted')) ? 'warn' : null },
              { label: 'Approved', value: fact(sum, 'approved') ?? '0', tone: null },
            ] }));
        }
        if (items) {
          const shown = this.shape(items, s, { statement: true });
          primary = shown;
          const view = [s.filters.statement === 'BS' ? 'balance sheet' : s.filters.statement === 'IS' ? 'income statement' : null, s.filters.explanation === 'UNEXPLAINED' ? 'unexplained' : null, s.filters.sort === 'LARGEST' ? 'largest first' : null].filter(Boolean).join(' · ');
          sections.push(this.section(s, 'FLUX', s.filters.explanation === 'UNEXPLAINED' ? 'Unexplained material movements' : 'Material movements', shown, {
            priority: w({ PREPARER: 900, CONTROLLER: 920, EXECUTIVE: 900, AUDITOR: 700 }), subtitle: `${shown.table.rows.length} of ${items.table.rows.length}${view ? ` · ${view}` : ''}`,
            display: { maxRows: 9, columns: null, rowRequest: 'open', emphasis: 'UNEXPLAINED' },
            actions: [{ label: 'View BS', request: 'only BS' }, { label: 'View IS', request: 'only IS' }, { label: 'Show unexplained', request: 'show unexplained' }, { label: 'Largest first', request: 'largest first' },
              { label: 'Show drivers', request: 'show the drivers of the first one' }, { label: 'View GL', request: 'show me the GL behind the first one', primary: true }],
            empty: shown.table.rows.length ? null : `No ${view || 'material'} movements.` }));
        }
        const approvals = this.run('getPendingApprovals', { period: P });
        if (approvals) { const fx = withRows(approvals, approvals.table.rows.filter((r) => r.cells[0] === 'FLUX_EXPLANATION'));
          sections.push(this.section(s, 'WORKFLOW', 'Explanations awaiting review', fx, { priority: w({ PREPARER: 500, CONTROLLER: 800, EXECUTIVE: 400, AUDITOR: 300 }) + (fx.table.rows.length ? 0 : -500), layout: 'side', display: { maxRows: 4, columns: [1], rowRequest: 'open', emphasis: null }, empty: fx.table.rows.length ? null : 'No explanation is waiting for review.' })); }
        const unsupported = this.run('getMaterialFluxWithoutSupport', { period: P });
        if (unsupported && unsupported.status !== 'UNAVAILABLE') sections.push(this.section(s, 'EVIDENCE', 'Material movements without support', this.shape(unsupported, s, { statement: true }), { priority: w({ PREPARER: 700, CONTROLLER: 600, EXECUTIVE: 250, AUDITOR: 650 }), layout: 'side', display: { maxRows: 4, columns: [0], rowRequest: 'open', emphasis: null } }));
        if (sum) { const inflight = withRows(sum, sum.table.rows.filter((r) => /SUBMITTED|APPROVED|DRAFT|RETURNED/.test(r.cells[5] ?? '')));
          if (inflight.table.rows.length) sections.push(this.section(s, 'RECENT_ACTIVITY', 'Explanations in progress', inflight, { priority: 350, layout: 'side', display: { maxRows: 4, columns: [5], rowRequest: 'open', emphasis: null } })); }
        const hist = periods.slice(Math.max(0, pi - 3), pi + 1).reverse().map((p) => ({ p, o: p === P ? sum : this.run('getFluxSummary', { period: p }) })).filter((x) => x.o);
        if (hist.length > 1) sections.push(this.section(s, 'TREND', 'Monthly flux analyses', { ...hist[0]!.o!, id: `CV-FLUXHIST-${P}`, type: 'FluxHistory', title: 'Monthly flux analyses', facts: [],
          table: { columns: ['Material', 'Unexplained'], rows: hist.map((h) => ({ label: this.d.monthLabel(h.p), level: 1, kind: 'line' as const, cells: [fact(h.o, 'material') ?? '—', fact(h.o, 'unexplained') ?? '—'] })) } },
          { priority: 300, layout: 'side', tools: hist.map((h) => ({ tool: 'getFluxSummary', args: { period: h.p } })), display: { maxRows: 4, columns: null, rowRequest: null, emphasis: null } }));
        break;
      }
      case 'FINANCIALS': {
        const bsView = s.filters.statement === 'BS' || (s.intent.requestedView === 'BS' && s.filters.statement !== 'IS');
        const is = this.run('getIncomeStatement', { periodStart: P, periodEnd: P, scope: s.scope });
        const isPrior = prior ? this.run('getIncomeStatement', { periodStart: prior, periodEnd: prior, scope: s.scope }) : null;
        const bs = bsView ? this.run('getBalanceSheet', { period: P, scope: s.scope }) : null;
        title = `${PL} financials`; subtitle = `${scopeName} · ${s.intent.currency} · ${s.intent.basis}${prior ? ` · compared with ${this.d.monthLabel(prior)}` : ''}`;
        if (is) {
          headline = { value: fact(is, `netIncome.${P}`) ?? '—', label: 'net income', tone: null };
          sections.push(this.section(s, 'SUMMARY', 'Results', is, { priority: 1000, layout: 'lead', display: { maxRows: 0, columns: null, rowRequest: null, emphasis: null },
            metrics: [
              { label: `Revenue ${PL}`, value: fact(is, `totalRevenue.${P}`) ?? '—', tone: null },
              ...(isPrior && prior ? [{ label: `Revenue ${this.d.monthLabel(prior)}`, value: fact(isPrior, `totalRevenue.${prior}`) ?? '—', tone: null }] : []),
              { label: `Net income ${PL}`, value: fact(is, `netIncome.${P}`) ?? '—', tone: null },
              ...(isPrior && prior ? [{ label: `Net income ${this.d.monthLabel(prior)}`, value: fact(isPrior, `netIncome.${prior}`) ?? '—', tone: null }] : []),
            ] }));
        }
        const stmt = bsView ? bs : is;
        if (stmt) { primary = stmt; sections.push(this.section(s, 'FINANCIAL_TABLE', bsView ? `Balance sheet · ${PL}` : `Income statement · ${PL}`, stmt, { priority: 900, display: { maxRows: 40, columns: null, rowRequest: 'open', emphasis: null },
          actions: [bsView ? { label: 'View income statement', request: 'only IS' } : { label: 'View balance sheet', request: 'only BS' }] })); }
        const mv = this.run('getLargestFinancialMovements', { period: P });
        if (mv) sections.push(this.section(s, 'VARIANCE', 'Material movements', mv, { priority: w({ PREPARER: 600, CONTROLLER: 800, EXECUTIVE: 850, AUDITOR: 500 }), layout: 'side', display: { maxRows: 5, columns: [2], rowRequest: 'open', emphasis: null },
          actions: [{ label: 'Why did the largest move?', request: 'show the drivers of the largest one' }] }));
        const first = periods[Math.max(0, pi - 5)]!;
        const trend = this.run('getIncomeStatement', { periodStart: first, periodEnd: P, scope: s.scope });
        if (trend) { const ms = periods.slice(periods.indexOf(first), pi + 1);
          sections.push(this.section(s, 'TREND', 'Recent trend', { ...trend, id: `CV-TREND-${P}`, type: 'FinancialTrend', title: 'Recent trend', facts: trend.facts,
            table: { columns: ['Revenue', 'Net income'], rows: ms.map((m) => ({ label: this.d.monthLabel(m), level: 1, kind: 'line' as const, cells: [fact(trend, `totalRevenue.${m}`) ?? '—', fact(trend, `netIncome.${m}`) ?? '—'] })).reverse() } },
          { priority: 400, layout: 'side', display: { maxRows: 6, columns: null, rowRequest: null, emphasis: null } })); }
        const fx = this.run('getFluxSummary', { period: P });
        if (fx) sections.push(this.section(s, 'FLUX', 'Related flux', null, { priority: 350, layout: 'side', tools: [{ tool: 'getFluxSummary', args: { period: P } }],
          metrics: [{ label: 'Material movements', value: fact(fx, 'material') ?? '—', tone: null, request: 'flux' }, { label: 'Unexplained', value: fact(fx, 'unexplained') ?? '—', tone: Number(fact(fx, 'unexplained')) ? 'bad' : 'ok', request: 'flux' }] }));
        break;
      }
      case 'RECONCILIATIONS': {
        const sum = this.run('getReconciliationSummary', { period: P });
        title = `${PL} reconciliations`; subtitle = `${scopeName} · ${s.intent.currency}`;
        if (sum) {
          headline = { value: `${fact(sum, 'tied') ?? '—'} of ${fact(sum, 'total') ?? '—'}`, label: 'tie', tone: null };
          sections.push(this.section(s, 'STATUS', 'Readiness', sum, { priority: 1000, layout: 'lead', display: { maxRows: 0, columns: null, rowRequest: null, emphasis: null },
            metrics: [
              { label: 'Not tied', value: fact(sum, 'notTied') ?? '0', tone: Number(fact(sum, 'notTied')) ? 'bad' : 'ok' },
              { label: 'Source not connected', value: fact(sum, 'sourceNotConnected') ?? '0', tone: Number(fact(sum, 'sourceNotConnected')) ? 'warn' : null },
              { label: 'Missing support', value: fact(sum, 'missingSupport') ?? '0', tone: Number(fact(sum, 'missingSupport')) ? 'warn' : 'ok' },
              { label: 'In review', value: fact(sum, 'inReview') ?? '0', tone: null },
              { label: 'Approved', value: fact(sum, 'approved') ?? '0', tone: null },
            ] }));
        }
        const nt = this.run('getReconciliationsNotTied', { period: P });
        if (nt) { const shown = this.shape(nt, s, { material: (r) => r.cells[5] === 'NOT_TIED' }); primary = shown;
          sections.push(this.section(s, 'EXCEPTIONS', 'Not tied or not provable', shown, { priority: w({ PREPARER: 950, CONTROLLER: 900, EXECUTIVE: 800, AUDITOR: 900 }), subtitle: fact(nt, 'totalDifference') ? `${fact(nt, 'totalDifference')} unreconciled difference` : null,
            display: { maxRows: 8, columns: [0, 1, 4, 5, 7], rowRequest: 'open', emphasis: 'NOT_TIED' },
            actions: [{ label: 'Start with the largest', request: 'start with the largest one', primary: true }, { label: 'Show the GL behind the first', request: 'show me the GL behind the first one' }],
            empty: shown.table.rows.length ? null : 'Every reconciliation ties.' })); }
        const pr = this.run('getReconciliationsPendingReview', { period: P });
        if (pr) sections.push(this.section(s, 'WORKFLOW', 'Awaiting review or returned', pr, { priority: w({ PREPARER: 700, CONTROLLER: 850, EXECUTIVE: 500, AUDITOR: 400 }), layout: 'side', display: { maxRows: 5, columns: [7], rowRequest: 'open', emphasis: 'RETURNED' }, empty: pr.table.rows.length ? null : 'Nothing is waiting for review.' }));
        const ms = this.run('getReconciliationsMissingSupport', { period: P });
        if (ms) sections.push(this.section(s, 'EVIDENCE', 'Support gaps', ms, { priority: w({ PREPARER: 880, CONTROLLER: 700, EXECUTIVE: 300, AUDITOR: 850 }), layout: 'side', display: { maxRows: 5, columns: [8], rowRequest: 'open', emphasis: null }, empty: ms.table.rows.length ? null : 'No support is missing.' }));
        if (sum) sections.push(this.section(s, 'RECONCILIATIONS', 'All reconciliations', this.shape(sum, s), { priority: 300, display: { maxRows: 12, columns: [0, 2, 4, 5, 6, 7], rowRequest: 'open', emphasis: 'NOT_TIED' } }));
        break;
      }
      case 'PERIOD': {
        const ready = this.run('getCloseReadiness', { period: P }), is = this.run('getIncomeStatement', { periodStart: P, periodEnd: P, scope: s.scope }), fx = this.run('getFluxSummary', { period: P }), rc = this.run('getReconciliationSummary', { period: P });
        title = PL; subtitle = `${scopeName} · ${s.intent.currency} · everything governed for ${PL}`;
        if (ready) headline = { value: fact(ready, 'readinessPct') ?? '—', label: 'close ready', tone: null };
        if (ready) sections.push(this.section(s, 'STATUS', 'Close', ready, { priority: 1000, layout: 'lead', actions: [{ label: `${PL} close`, request: `${PL} close`, primary: true }], display: { maxRows: 0, columns: null, rowRequest: null, emphasis: null },
          metrics: [{ label: 'Blockers', value: fact(ready, 'blockers') ?? '—', tone: Number(fact(ready, 'blockers')) ? 'bad' : 'ok', request: `${PL} close` }, { label: 'Tasks', value: fact(ready, 'tasks') ?? '—', tone: null }] }));
        if (is) sections.push(this.section(s, 'SUMMARY', 'Results', is, { priority: 900, actions: [{ label: 'Financials', request: `${PL} financials` }], display: { maxRows: 0, columns: null, rowRequest: null, emphasis: null },
          metrics: [{ label: 'Revenue', value: fact(is, `totalRevenue.${P}`) ?? '—', tone: null }, { label: 'Net income', value: fact(is, `netIncome.${P}`) ?? '—', tone: null }] }));
        if (fx) sections.push(this.section(s, 'FLUX', 'Flux', fx, { priority: 800, actions: [{ label: 'Flux', request: `${PL} flux` }], display: { maxRows: 0, columns: null, rowRequest: null, emphasis: null },
          metrics: [{ label: 'Material', value: fact(fx, 'material') ?? '—', tone: null }, { label: 'Unexplained', value: fact(fx, 'unexplained') ?? '—', tone: Number(fact(fx, 'unexplained')) ? 'bad' : 'ok' }] }));
        if (rc) sections.push(this.section(s, 'RECONCILIATIONS', 'Reconciliations', rc, { priority: 700, actions: [{ label: 'Reconciliations', request: `${PL} reconciliations` }], display: { maxRows: 0, columns: null, rowRequest: null, emphasis: null },
          metrics: [{ label: 'Tied', value: `${fact(rc, 'tied') ?? '—'} of ${fact(rc, 'total') ?? '—'}`, tone: null }, { label: 'Missing support', value: fact(rc, 'missingSupport') ?? '—', tone: Number(fact(rc, 'missingSupport')) ? 'warn' : 'ok' }] }));
        break;
      }
      case 'PLANNING': {
        const pc = this.run('getPlanningComparison', { text: s.intent.words });
        title = s.intent.requestedComparison ? `${s.intent.primaryObjectType} vs actual` : (s.intent.primaryObjectType ?? 'Planning');
        subtitle = 'Planning & Performance';
        headline = { value: 'Not available', label: 'no governed planning version', tone: 'warn' };
        notes.push(`${s.intent.primaryObjectType === 'Forecast' ? 'Forecast' : 'Budget and forecast'} concepts are recognised, but no governed planning version is available in the current prototype. Korvyn will not estimate one.`);
        sections.push(this.section(s, 'STATUS', 'What is governed', pc, { priority: 1000, layout: 'lead', display: { maxRows: 4, columns: null, rowRequest: null, emphasis: null },
          metrics: [{ label: 'Budget', value: 'Not held', tone: 'warn' }, { label: 'Forecast', value: 'Not held', tone: 'warn' }, { label: 'Scenarios', value: 'Not held', tone: 'warn' }, { label: 'Actuals', value: 'Governed ledger', tone: 'ok', request: 'financials' }] }));
        sections.push(this.section(s, 'SUGGESTED_ACTIONS', 'What Korvyn can show instead', null, { priority: 500, actions: [{ label: `${PL} financials`, request: 'financials', primary: true }, { label: 'Month-over-month flux', request: 'flux' }, { label: 'Trend over the year', request: 'show the income statement trend January through June' }] }));
        break;
      }
      case 'OBJECT': this.composeObject(s, sections, notes, (h, t, st) => { headline = h; title = t; subtitle = st; }, (o) => { primary = o; }); break;
    }

    if (!sections.some((x) => x.object || x.metrics.length)) notes.push(`This ${s.kind === 'OBJECT' ? 'object' : s.kind.toLowerCase()} is outside your access, so nothing is shown.`);
    if (this.denied.size) notes.push(`Not shown — outside your access: ${[...new Set([...this.denied].map((x) => CanvasEngine.AREA[x] ?? x))].join(', ')}.`);
    const hints = new Set<string>();
    for (const c of this.calls) for (const wv of c.warnings) if (/\bstale\b|source is unavailable|older than the freshness/i.test(wv) && hints.size < 2) hints.add(wv);
    notes.push(...hints);

    /* ---- prioritisation: open conditions first; clear ones collapse into a line; the focus leads ---- */
    const clear: string[] = [];
    const kept = sections.filter((x) => { if (x.empty && x.sectionType !== 'FOCUS' && x.sectionType !== 'FLUX' && s.kind !== 'OBJECT') { clear.push(x.empty); return false; } return true; });
    kept.sort((a, b) => b.priority - a.priority);
    const lead = kept.find((x) => x.layout === 'lead');
    if (lead && clear.length) lead.metrics.push(...clear.slice(0, 3).map((c) => ({ label: c, value: '✓', tone: 'ok' as const })));
    const shownRows = primary ? (primary as FinancialObject).table.rows.filter((r) => r.kind === 'line' && r.ref).map((r) => ({ label: r.label, ref: r.ref!, amount: rowAmount(primary!, r) })) : [];
    const next: CanvasState = { ...s, rows: shownRows.slice(0, 25) };
    const suggested = kept.find((x) => x.sectionType === 'SUGGESTED_ACTIONS');
    const nothing = !kept.some((x) => x.object || x.metrics.length);
    if (!suggested && s.kind !== 'PLANNING' && !nothing) {
      const acts: CanvasAction[] = [];
      if (drill) acts.push({ label: 'Back to the canvas', request: 'reset' });
      const ws = WORKSPACES[s.kind]; if (ws) acts.push({ label: ws.label, view: ws.view });
      if (acts.length) kept.push(this.section(s, 'SUGGESTED_ACTIONS', 'Next', null, { priority: 0, layout: 'side', actions: acts }));
    }
    const def: DynamicCanvasDefinition = {
      id: s.id, version: s.version, intent: s.intent, kind: s.kind, title, subtitle, headline, period: P, periodLabel: PL, scope: { id: s.scope, name: scopeName },
      context: { persona, role: this.d.actor.role, reportingLens: s.intent.reportingLens, currency: s.intent.currency, basis: s.intent.basis, dataVersion: this.d.gl.dataVersion(), mappingVersion: MAPPING_VERSION,
        sources: [...new Set(this.objects.map((o) => o.provenance.source))].slice(0, 4) },
      sections: kept, filters: s.filters, focus: s.focus, drill: s.drill, notes: [...new Set(notes)], structuredWorkspace: WORKSPACES[s.kind], generatedAt: new Date().toISOString(),
    };
    return { definition: def, state: next, calls: this.calls, objects: this.objects };
  }

  /* ---- an object canvas: an account, a statement line, a project, a vendor, an entity ------------------------ */
  private composeObject(s: CanvasState, sections: CanvasSection[], notes: string[], head: (h: DynamicCanvasDefinition['headline'], t: string, st: string) => void, setPrimary: (o: FinancialObject) => void) {
    const subj = s.subject!, P = s.period, PL = this.d.monthLabel(P);
    const periods = this.d.data.governedPeriods(), pi = periods.indexOf(P), first = periods[Math.max(0, pi - 5)]!;
    const acct = subj.type === 'Account' ? subj.key : subj.type === 'FinancialStatementLine' ? (this.d.graph.accountsOfLine(subj.id, this.d.graph.snapshot(this.d.actor, P))[0]?.replace(/^account:/, '') ?? null) : null;
    if (acct) {
      const an = this.run('getAccountAnalysis', { account: acct, period: P, scope: s.scope });
      head({ value: fact(an, 'balance') ?? '—', label: `balance · ${PL}`, tone: null }, subj.label, `${this.d.data.scope(s.scope)?.name ?? s.scope} · ${PL} vs ${pi > 0 ? this.d.monthLabel(periods[pi - 1]!) : 'prior'} · USD`);
      if (an) {
        sections.push(this.section(s, 'SUMMARY', 'Balance and movement', an, { priority: 1000, layout: 'lead', display: { maxRows: 0, columns: null, rowRequest: null, emphasis: null },
          metrics: [{ label: `Balance ${PL}`, value: fact(an, 'balance') ?? '—', tone: null }, { label: `Activity ${PL}`, value: fact(an, 'activity') ?? '—', tone: null }, { label: 'Activity prior month', value: fact(an, 'activity.prior') ?? '—', tone: null },
            { label: 'Change in activity', value: fact(an, 'activity.change') ?? '—', tone: null }, { label: 'Lines', value: fact(an, 'lines') ?? '—', tone: null }] }));
        const shaped = this.shape(an, s);
        const byDim = (dim: string) => withRows(shaped, shaped.table.rows.filter((r) => r.label.startsWith(`${dim}: `)).map((r) => ({ ...r, label: r.label.slice(dim.length + 2), ref: `${dim}:${r.label.slice(dim.length + 2)}` })));
        for (const [dim, t, pr] of [['project', 'Top projects', 900], ['entity', 'Top entities', 850], ['vendor', 'Top vendors', 700]] as const) {
          const o = this.shape(byDim(dim), s); if (dim === 'project' && o.table.rows.length) setPrimary(o);
          if (o.table.rows.length) sections.push(this.section(s, 'DRIVER_ANALYSIS', t, o, { priority: pr, display: { maxRows: 5, columns: [1, 2, 3], rowRequest: 'open', emphasis: null }, tools: [{ tool: 'getAccountAnalysis', args: { account: acct, period: P, scope: s.scope } }] }));
        }
      }
      const tr = this.run('getTrend', { account: acct, periodStart: first, periodEnd: P, scope: s.scope });
      if (tr) sections.push(this.section(s, 'TREND', 'Monthly activity', newestFirst(tr), { priority: 600, layout: 'side', display: { maxRows: 7, columns: null, rowRequest: null, emphasis: null } }));
      const fx = this.run('getFluxItem', { account: acct, period: P });
      if (fx) sections.push(this.section(s, 'FLUX', 'Flux', fx, { priority: 800, layout: 'side', display: { maxRows: 1, columns: [2, 5], rowRequest: null, emphasis: 'UNEXPLAINED' }, actions: [{ label: 'Why did it move?', request: `why did ${acct} move in ${PL}?` }] }));
      const rc = this.run('getReconciliationsForAccount', { account: acct, period: P });
      if (rc) sections.push(this.section(s, 'RECONCILIATIONS', 'Reconciliations', rc, { priority: 780, layout: 'side', subtitle: [fact(rc, 'tied') ? `${fact(rc, 'tied')} of ${fact(rc, 'reconciliations')} tied` : null, Number(fact(rc, 'missingSupport')) ? `${fact(rc, 'missingSupport')} missing support` : null].filter(Boolean).join(' · ') || null,
        display: { maxRows: 5, columns: [5, 7], rowRequest: 'open', emphasis: 'NOT_TIED' }, empty: rc.table.rows.length ? null : 'No reconciliation is defined for this account.' }));
      const gl = this.run('getGovernedPopulation', { account: acct, period: P, scope: s.scope, sort: 'amount_desc' });
      if (gl) sections.push(this.section(s, 'RECENT_ACTIVITY', `Largest transactions · ${PL}`, gl, { priority: 650, display: { maxRows: 6, columns: [0, 1, 3, 4, 6], rowRequest: 'open', emphasis: null }, subtitle: `${gl.population?.rowCount ?? gl.table.rows.length} lines in the governed population` }));
      const ev = this.run('getSupportCoverage', { objectRef: `account:${acct}`, period: P });
      if (ev) sections.push(this.section(s, 'EVIDENCE', 'Evidence', ev, { priority: 500, layout: 'side', display: { maxRows: 4, columns: null, rowRequest: null, emphasis: null } }));
      return;
    }
    /* a dimension subject: project, vendor, cost centre, property, entity — its governed activity, never a trial balance */
    const dim = subj.type === 'Vendor' ? 'vendor' : subj.type === 'Project' || subj.type === 'Property' ? 'project' : subj.type === 'LegalEntity' ? 'entity' : 'costCenter';
    const val = subj.type === 'Property' ? String(this.d.graph.node(subj.id, this.d.actor, P)?.attrs['project'] ?? subj.key) : subj.key;
    const filt: ToolArgs = { [dim]: val };
    const pop = this.run('getGovernedPopulation', { ...filt, periodStart: first, periodEnd: P, scope: s.scope, sort: 'amount_desc' });
    const trend = this.run('getTrend', { ...filt, periodStart: first, periodEnd: P, scope: s.scope });
    const wlabel = `${this.d.monthLabel(first)}–${PL}`;
    head({ value: fact(pop, 'net') ?? fact(trend, 'total') ?? '—', label: `governed activity · ${wlabel}`, tone: null }, subj.label, `${subj.type === 'LegalEntity' ? 'Legal entity' : subj.type} · ${this.d.data.scope(s.scope)?.name ?? s.scope} · USD`);
    sections.push(this.section(s, 'SUMMARY', 'Activity', pop, { priority: 1000, layout: 'lead', display: { maxRows: 0, columns: null, rowRequest: null, emphasis: null },
      metrics: [{ label: `Activity ${wlabel}`, value: fact(pop, 'net') ?? '—', tone: null }, { label: 'Lines', value: fact(pop, 'lineCount') ?? '—', tone: null }, { label: 'Entities', value: fact(pop, 'entities') ?? '—', tone: null }, { label: 'Largest line', value: fact(pop, 'largest') ?? '—', tone: null }] }));
    if (!pop || !Number(fact(pop, 'lineCount'))) notes.push(`${subj.label} has no governed activity in ${wlabel} that you can see.`);
    const others = (['account', 'project', 'entity', 'vendor'] as const).filter((x) => x !== dim && !(dim === 'costCenter' && x === 'account' && false));
    let firstDim: FinancialObject | null = null;
    for (const [i, od] of others.entries()) {
      const o = this.run('analyzeByDimension', { dimension: od, ...filt, periodStart: first, periodEnd: P, scope: s.scope });
      if (o && o.table.rows.some((r) => r.kind === 'line')) { if (!firstDim) firstDim = o;
        sections.push(this.section(s, 'DRIVER_ANALYSIS', `By ${od}`, o, { priority: 900 - i * 50, display: { maxRows: 5, columns: null, rowRequest: od === 'account' ? 'open' : null, emphasis: null } })); }
    }
    if (firstDim) setPrimary(firstDim);
    if (trend) sections.push(this.section(s, 'TREND', 'Monthly activity', newestFirst(trend), { priority: 600, layout: 'side', display: { maxRows: 7, columns: null, rowRequest: null, emphasis: null } }));
    if (pop && pop.table.rows.length) sections.push(this.section(s, 'RECENT_ACTIVITY', 'Material transactions', pop, { priority: 700, display: { maxRows: 6, columns: [0, 1, 2, 3, 4, 6], rowRequest: 'open', emphasis: null }, subtitle: `${pop.population?.rowCount ?? pop.table.rows.length} governed lines` }));
    /* the flux and reconciliation context is the accounts the subject posts to */
    const accts = [...new Set((pop?.table.rows ?? []).map((r) => r.cells[2]).filter((x): x is string => !!x && /^\d{5}$/.test(x)).map((a) => this.d.gl.account(a)?.parent ?? a))].slice(0, 4);
    if (accts.length) {
      const fx = this.run('getMaterialFluxItems', { period: P });
      if (fx) { const rel = withRows(fx, fx.table.rows.filter((r) => accts.includes(accountOfRef(r.ref ?? '') ?? '')));
        if (rel.table.rows.length) sections.push(this.section(s, 'FLUX', 'Related flux', rel, { priority: 750, layout: 'side', display: { maxRows: 4, columns: [2], rowRequest: 'open', emphasis: 'UNEXPLAINED' } })); }
      const rc = this.run('getReconciliationsForAccount', { account: accts[0]!, period: P });
      if (rc && rc.table.rows.length) sections.push(this.section(s, 'RECONCILIATIONS', 'Related reconciliations', rc, { priority: 720, layout: 'side', display: { maxRows: 4, columns: [5], rowRequest: 'open', emphasis: 'NOT_TIED' } }));
      if (pop?.population?.populationId) { const ev = this.run('getSupportCoverage', { populationId: pop.population.populationId });
        if (ev) sections.push(this.section(s, 'EVIDENCE', 'Evidence', ev, { priority: 550, layout: 'side', display: { maxRows: 4, columns: null, rowRequest: null, emphasis: null } })); }
    }
    const rel = this.run('getObjectRelationships', { objectRef: subj.id, period: P });
    if (rel && rel.table.rows.length) sections.push(this.section(s, 'RELATED_OBJECTS', 'Related', rel, { priority: 300, layout: 'side', display: { maxRows: 6, columns: null, rowRequest: null, emphasis: null } }));
  }

  /* ---- the focus: the object the conversation is on, and what is shown for it --------------------------------- */
  private drill(s: CanvasState): CanvasSection | null {
    const d = s.drill; if (!d) return null;
    const P = s.period, acct = accountOfRef(d.ref), rec = reconOfRef(d.ref);
    const base = { priority: 2000, layout: 'lead' as const };
    const back: CanvasAction = { label: 'Back to the full canvas', request: 'reset' };
    if (d.target === 'GL') {
      const args: ToolArgs = rec ? { account: acct!, entity: entityOfRecon(rec)!, period: P, sort: 'amount_desc' } : acct ? { account: acct, period: P, scope: s.scope, sort: 'amount_desc' } : {};
      if (!args['account']) return null;
      const gl = this.run('getGovernedPopulation', args);
      return this.section(s, 'FOCUS', `GL behind ${d.label}`, gl, { ...base, subtitle: gl ? `${fact(gl, 'lineCount') ?? '—'} lines · net ${fact(gl, 'net') ?? '—'} · ${this.d.monthLabel(P)}` : null, display: { maxRows: 10, columns: null, rowRequest: 'open', emphasis: null },
        actions: [{ label: 'The related reconciliation', request: 'show the related reconciliation' }, back] });
    }
    if (d.target === 'RECONCILIATION') {
      const o = rec ? this.run('getReconciliation', { reconciliationId: rec, period: P }) : acct ? this.run('getReconciliationsForAccount', { account: acct, period: P }) : null;
      return this.section(s, 'FOCUS', `Reconciliation · ${d.label}`, o, { ...base, display: { maxRows: 8, columns: null, rowRequest: 'open', emphasis: 'NOT_TIED' },
        actions: [{ label: 'The GL behind it', request: 'show me the GL behind it' }, { label: 'Open Reconciliations', view: 'glrecon' }, back], empty: o && !o.table.rows.length ? 'No reconciliation is defined for this account.' : null });
    }
    if (d.target === 'DRIVERS' && acct) {
      const o = this.run('getAccountAnalysis', { account: acct, period: P, scope: s.scope });
      return this.section(s, 'FOCUS', `Drivers · ${d.label}`, o, { ...base, display: { maxRows: 8, columns: null, rowRequest: null, emphasis: null }, actions: [{ label: 'The GL behind it', request: 'show me the GL behind it' }, back] });
    }
    if (d.target === 'EVIDENCE') {
      const o = this.run('getRelatedEvidence', { objectRef: rec ? `recon:${rec}` : acct ? `account:${acct}` : d.ref });
      return this.section(s, 'FOCUS', `Support · ${d.label}`, o, { ...base, display: { maxRows: 8, columns: null, rowRequest: null, emphasis: null }, actions: [back] });
    }
    /* ITEM: open the object itself */
    if (rec) { const o = this.run('getReconciliation', { reconciliationId: rec, period: P });
      return this.section(s, 'FOCUS', d.label, o, { ...base, display: { maxRows: 8, columns: null, rowRequest: null, emphasis: 'NOT_TIED' }, actions: [{ label: 'The GL behind it', request: 'show me the GL behind it', primary: true }, { label: 'Its support', request: 'show the support for it' }, back] }); }
    if (acct) { const fx = this.run('getFluxItem', { account: acct, period: P }), an = this.run('getAccountAnalysis', { account: acct, period: P, scope: s.scope });
      const o = an ? withRows(an, an.table.rows.slice(0, 8)) : fx;
      return this.section(s, 'FOCUS', d.label, o, { ...base, subtitle: fx ? `Change ${fact(fx, 'change') ?? '—'} · ${String(fact(fx, 'status') ?? '').replace(/_/g, ' ').toLowerCase()}` : null, display: { maxRows: 8, columns: null, rowRequest: null, emphasis: null },
        metrics: fx ? [{ label: 'Prior', value: fact(fx, 'prior') ?? '—', tone: null }, { label: 'Current', value: fact(fx, 'current') ?? '—', tone: null }, { label: 'Change', value: fact(fx, 'change') ?? '—', tone: null }, { label: 'Explanation', value: String(fact(fx, 'status') ?? '—').replace(/_/g, ' ').toLowerCase(), tone: fact(fx, 'status') === 'UNEXPLAINED' ? 'bad' : null }] : [],
        actions: [{ label: 'The GL behind it', request: 'show me the GL behind it', primary: true }, { label: 'The related reconciliation', request: 'show the related reconciliation' }, back] }); }
    const dv = d.ref.match(/^(project|vendor|entity):(.+)$/);
    if (dv) {
      const subj = s.subject, sAcct = subj?.type === 'Account' ? subj.key : null;
      const args: ToolArgs = { [dv[1]!]: dv[1] === 'entity' ? (this.d.data.scope(dv[2]!)?.id ?? this.d.gl.entities().find((e) => e.name === dv[2])?.id ?? dv[2]!) : dv[2]!, period: P, scope: s.scope, sort: 'amount_desc', ...(sAcct ? { account: sAcct } : {}) };
      const gl = this.run('getGovernedPopulation', args);
      return this.section(s, 'FOCUS', `${d.label}${sAcct ? ` · ${subj!.label}` : ''} · ${this.d.monthLabel(P)}`, gl, { ...base, subtitle: gl ? `${fact(gl, 'lineCount') ?? '—'} lines · net ${fact(gl, 'net') ?? '—'}` : null, display: { maxRows: 10, columns: null, rowRequest: 'open', emphasis: null }, actions: [back] });
    }
    const task = d.ref.match(/^task:(.+)$/)?.[1];
    if (task) { const t = this.run('getCloseTasks', { period: P });
      return this.section(s, 'FOCUS', d.label, t ? withRows(t, t.table.rows.filter((r) => r.ref === d.ref)) : null, { ...base, display: { maxRows: 1, columns: null, rowRequest: null, emphasis: null }, actions: [{ label: 'Open Close', view: 'acctclose' }, back] }); }
    const txn = d.ref.match(/^txn:(.+)$/)?.[1];
    if (txn) { const o = this.run('getTransaction', { transactionId: txn });
      return this.section(s, 'FOCUS', d.label, o, { ...base, display: { maxRows: 12, columns: null, rowRequest: null, emphasis: null }, actions: [{ label: 'Trace to source', request: `trace ${txn}` }, back] }); }
    return null;
  }

  /** apply a conversational refinement to the canvas on screen */
  refine(state: CanvasState, r: Refinement): { state: CanvasState; note: string | null } {
    const s: CanvasState = JSON.parse(JSON.stringify(state)); s.version += 1;
    const pick = (rank: number | null, largest: boolean) => {
      const rows = largest ? [...s.rows].sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0)) : s.rows;
      return rows[(rank ?? 1) - 1] ?? null;
    };
    switch (r.op) {
      case 'RESET': s.filters = { statement: null, explanation: null, materialOnly: false, sort: null }; s.focus = null; s.drill = null; return { state: s, note: null };
      case 'SORT': s.filters.sort = 'LARGEST'; s.drill = null; return { state: s, note: null };
      case 'FILTER':
        if (r.statement !== undefined) s.filters.statement = r.statement ?? null;
        if (r.explanation !== undefined) s.filters.explanation = r.explanation ?? null;
        if (r.materialOnly) s.filters.materialOnly = true;
        s.drill = null;
        return { state: s, note: r.statement && !['FLUX', 'CLOSE', 'FINANCIALS'].includes(s.kind) ? 'A balance-sheet / income-statement filter applies to flux and financials; this canvas is unchanged.' : null };
      case 'FOCUS': {
        /* by canonical ref only; a label that names several rows is refused, never guessed */
        if (!r.ref && r.label) { const n = s.rows.filter((x) => x.label.toLowerCase().includes(r.label!.toLowerCase())).length; return { state, note: `${n} rows on this canvas are named “${r.label}” — click the one you mean.` }; }
        const row = r.ref ? s.rows.find((x) => x.ref === r.ref) ?? null : pick(r.rank, r.largest);
        if (!row) return { state, note: r.ref ? 'That row is no longer on this canvas.' : 'There is nothing on this canvas to open.' };
        s.focus = { ref: row.ref, label: row.label }; s.drill = { target: 'ITEM', ref: row.ref, label: row.label };
        return { state: s, note: null };
      }
      case 'RELATED': {
        const row = r.rank || r.largest ? pick(r.rank, r.largest) : s.focus ?? pick(1, false);
        if (!row) return { state, note: 'There is nothing on this canvas to open.' };
        s.focus = { ref: row.ref, label: row.label }; s.drill = { target: r.target === 'FLUX' ? 'ITEM' : r.target, ref: row.ref, label: row.label };
        return { state: s, note: null };
      }
    }
  }
}

/** the canvas as a governed FinancialObject: what the browser receives, and what the conversation keeps */
export function canvasObject(def: DynamicCanvasDefinition, primary: FinancialObject | null): FinancialObject {
  const lead = def.sections.find((x) => x.layout === 'lead');
  return {
    id: `CANVAS-${def.id}-v${def.version}`, type: 'DynamicFinancialCanvas', title: def.title, status: def.kind === 'PLANNING' ? 'UNAVAILABLE' : 'AVAILABLE',
    scope: def.scope, periods: [def.period], periodLabel: def.periodLabel, currency: def.context.currency, basis: def.context.basis, unit: 'USD millions',
    table: primary ? primary.table : { columns: [], rows: [] },
    facts: (lead?.metrics ?? []).map((m, i) => ({ key: `m${i + 1}`, label: m.label, value: m.value, display: m.value })),
    provenance: { source: def.context.sources.join(' · ') || 'Korvyn governed services', snapshotId: def.context.dataVersion, journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] },
    population: null, refs: { canvasId: def.id, period: def.period, ...(primary?.refs ?? {}) }, focus: def.focus ? { kind: 'canvasFocus', id: def.focus.ref, name: def.focus.label } : null,
    unavailable: def.kind === 'PLANNING' ? { capability: 'Planning versions', reason: def.notes.find((n) => /planning version/.test(n)) ?? 'No governed planning version is held.' } : null,
    canvas: def as unknown as Record<string, unknown>, governed: true,
  };
}
