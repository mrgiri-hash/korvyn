/**
 * THE SECTION LIBRARY (Phase 4B) — the reusable parts every governed deliverable is composed from.
 *
 * An artifact TYPE (close review, reconciliation, flux, support, audit, financial, management, PBC) is a starting list of
 * sections — a TEMPLATE — never an engine of its own. Each section builder reads ONLY governed services: close readiness
 * and blockers, the versioned reconciliation balance, the one Flux explanation record, the AP-extract evidence references,
 * the governed ledger, the tie-out. Every row carries a TRACE reference back to its governed object (txn:, recon:, flux:,
 * population:, evidence:), so no section is a dead-end export. A number no service produces is never written.
 */
import { createHash } from 'node:crypto';
import type { Scope } from '../financials.js';
import { AP_EXTRACT, type GLine, SOURCE_HEALTH } from '../governed.js';
import { fluxAccountComments } from '../book.js';
import { WORK } from '../store.js';
import type { ToolEnv } from '../tools.js';
import { bsValues } from '../toolset.js';
import type { Block, Cell, Citation, ColumnSpec, ComposeEnv, PopulationPin, Row, SheetModel, Tone } from './compose.js';
import { type ArtifactDefinition, type ArtifactType, type ColFormat, type GLRule, type PlainSheetDef, SHEET_NAMES, type SheetKind, monLabel, periodToken, rangeLabel } from './model.js';
import { MAPPING_VERSION, type TieOutResult } from './tieout.js';
import { gapExposure } from '../audit/pbc.js';

/* ================================================================================================
   TEMPLATES — starting structures only; the user can add, remove and reorder any section
   ================================================================================================ */
export const TEMPLATES: Record<ArtifactType, { label: string; sections: SheetKind[]; window: 'MONTH' | 'FY' | 'RANGE' }> = {
  GL_EXTRACT: { label: 'GL extract', sections: ['GL'], window: 'FY' },
  EXCEL_WORKBOOK: { label: 'Workbook', sections: [], window: 'MONTH' },
  AUDIT_SUPPORT_PACKAGE: { label: 'Audit GL Package', sections: ['GL', 'TB', 'TIEOUT', 'POPULATION_METADATA', 'SOURCE_REFERENCES', 'EVIDENCE_INDEX'], window: 'FY' },
  RECONCILIATION_PACKAGE: { label: 'Reconciliation Package', sections: ['SUMMARY', 'RECONCILIATION', 'RECONCILING_ITEMS', 'GL', 'SUPPORT_INDEX', 'COMMENTS', 'RECON_PROOF'], window: 'MONTH' },
  FLUX_PACKAGE: { label: 'Flux Review Package', sections: ['FLUX', 'DRIVERS', 'GL', 'EXPLANATION', 'EVIDENCE_COVERAGE', 'RECONCILIATIONS'], window: 'MONTH' },
  CLOSE_REVIEW_PACKAGE: { label: 'Close Review Package', sections: ['CLOSE_SUMMARY', 'BLOCKERS', 'RECS_NOT_TIED', 'UNEXPLAINED_FLUX', 'MISSING_SUPPORT', 'PENDING_REVIEW', 'EXCEPTIONS'], window: 'MONTH' },
  SUPPORT_PACKAGE: { label: 'Vendor Support Package', sections: ['SUMMARY', 'GL', 'DRIVERS', 'RECONCILIATIONS', 'FLUX', 'EVIDENCE_INDEX', 'MISSING_SUPPORT', 'EVIDENCE_COVERAGE'], window: 'FY' },
  FINANCIAL_REPORT_PACKAGE: { label: 'Monthly Financial Package', sections: ['INCOME_STATEMENT', 'BALANCE_SHEET', 'VARIANCE', 'DRIVERS'], window: 'RANGE' },
  MANAGEMENT_REVIEW_PACKAGE: { label: 'Management Review Package', sections: ['CLOSE_SUMMARY', 'INCOME_STATEMENT', 'VARIANCE', 'MATERIAL_MOVEMENTS', 'BLOCKERS'], window: 'RANGE' },
  PBC_PACKAGE: { label: 'PBC Package', sections: ['PBC_SUMMARY', 'AUDIT_POPULATION', 'AUDIT_SELECTIONS', 'GL', 'EVIDENCE_MANIFEST', 'SUPPORT_GAPS'], window: 'RANGE' },
};
/** a section a template names with a different default name inside that package */
export const TEMPLATE_NAMES: Partial<Record<ArtifactType, Partial<Record<SheetKind, string>>>> = {
  RECONCILIATION_PACKAGE: { GL: 'GL Detail', RECON_PROOF: 'Tie-Out' },
  FLUX_PACKAGE: { FLUX: 'Flux Summary', GL: 'GL Detail', RECONCILIATIONS: 'Related Reconciliations', EVIDENCE_COVERAGE: 'Support' },
  SUPPORT_PACKAGE: { SUMMARY: 'Summary', DRIVERS: 'Projects', RECONCILIATIONS: 'Reconciliations', FLUX: 'Flux' },
  FINANCIAL_REPORT_PACKAGE: { DRIVERS: 'Top Drivers', VARIANCE: 'MoM Analysis' },
  AUDIT_SUPPORT_PACKAGE: {},
  PBC_PACKAGE: { GL: 'GL Detail', POPULATION_TIEOUT: 'TB Tie-Out', SUPPORT_GAPS: 'Exceptions', RECONCILIATIONS: 'Reconciliations', FLUX: 'Flux Explanations' },
};

/** what a request is asking for. Deterministic: the same words make the same kind of deliverable. */
export function detectType(text: string): ArtifactType | null {
  const t = ` ${text.toLowerCase()} `;
  if (/\bpbc\b/.test(t)) return 'PBC_PACKAGE';
  if (/\bclose (review )?package\b|\bcontroller (close )?(review )?package\b|\bclose items\b|\bcontroller attention\b|\bclose review\b/.test(t)) return 'CLOSE_REVIEW_PACKAGE';
  if (/\bmanagement (review )?package\b|\bboard (pack|package)\b|\bmanagement review\b/.test(t)) return 'MANAGEMENT_REVIEW_PACKAGE';
  if (/\breconciliation (review |support )?package\b|\breconciliation support\b|\brec package\b/.test(t)) return 'RECONCILIATION_PACKAGE';
  if (/\bflux (review )?package\b/.test(t)) return 'FLUX_PACKAGE';
  if (/\baudit[- ]ready\b|\baudit (gl |support )?(package|extract)\b/.test(t)) return 'AUDIT_SUPPORT_PACKAGE';
  if (/\bsupport package\b|\bcompile\b.*\bsupport\b|\bactivity and support\b|\bvendor (support )?package\b/.test(t)) return 'SUPPORT_PACKAGE';
  if (/\bfinancials?\b|\bincome statement\b|\bbalance sheet\b|\bp\s?&\s?l\b/.test(t) && /\bmonthly\b|\bpackage\b|\bvariance\b|\bmom\b/.test(t)) return 'FINANCIAL_REPORT_PACKAGE';
  if (/\bseparate tabs?\b|\bon (their own|its own|different) tabs?\b|\bworkbook with\b/.test(t)) return 'EXCEL_WORKBOOK';
  return null;
}

/* ================================================================================================
   THE SECTION CONTEXT — what every builder may read
   ================================================================================================ */
export interface SectionCtx {
  env: ComposeEnv; d: ArtifactDefinition; scope: Scope; period: string; prior: string | null;
  /** the entities this artifact may show: the scope, narrowed to the reader's access, minus complete entities when asked */
  vis: Set<string> | 'ALL'; ents: Set<string>; excludedEntities: string[];
  ctxLine: string; provenance: (x: string) => string; statusLine: { text: string; tone: Tone } | null;
  citations: Citation[]; excluded: { label: string; reason: string }[]; warnings: string[];
  /** the lines the package presents (every GL section), and the account groups they touch */
  glRows: GLine[]; glGroups: Set<string>; hasGl: boolean; populations: PopulationPin[]; tie: TieOutResult | null;
  /** the lines a focus-only package is about when it has no GL section (a vendor's FY, an account's month) */
  focusRows: () => GLine[];
}
const C = (key: string, header: string, width: number, format: ColFormat = 'text'): ColumnSpec => ({ key, header, width, format });
const TRACE = C('trace', 'Trace', 30);
const d2 = (v: number) => Math.round(v * 100) / 100;
function sheet(c: SectionCtx, s: PlainSheetDef, title: string, blocks: Block[], extra: string): SheetModel {
  return { name: s.name, kind: s.kind, title: [title, c.ctxLine, c.provenance(extra)], status: c.statusLine, blocks, rowCount: blocks.reduce((t, b) => t + b.rowCount, 0), populationId: null, part: null };
}
const table = (columns: ColumnSpec[], rows: Row[], heading?: string, totals?: Row[]): Block => ({ ...(heading ? { heading } : {}), columns, rowCount: rows.length, tabular: true, chunks: () => [rows], ...(totals ? { totals } : {}) });
const kv = (rows: [string, Cell][], heading?: string): Block => ({ ...(heading ? { heading } : {}), columns: [C('k', 'Item', 36), C('v', 'Value', 60)], rowCount: rows.length, tabular: false, chunks: () => [rows.map(([k, v]) => ({ style: 'label' as const, cells: [k, v] }))] });
const note = (text: string): Block => ({ columns: [C('n', 'Note', 110)], rowCount: 1, tabular: false, chunks: () => [[{ style: 'note' as const, cells: [text] }]] });
/** an item belongs in this artifact: a group-level item only at group scope with full access; an entity item when the
 *  entity is in scope, visible to the reader, and not left out as complete */
const inEnts = (c: SectionCtx, e: string) => (e === 'GROUP' ? c.scope.kind === 'GROUP' && c.vis === 'ALL' : c.ents.has(e));

/* ---- relatedness: which reconciliations and Flux lines a package is about ------------------------ */
export function focusGroups(c: SectionCtx): Set<string> | null {
  const L = c.env.gl, f = c.d.focus ?? {};
  if (f.account) return new Set([L.account(f.account)?.parent ?? f.account]);
  if (f.reconciliationId) { const r = c.env.controls.recDef(f.reconciliationId); if (r) return new Set(r.accounts.map((a) => L.account(a)?.parent ?? a)); }
  return c.hasGl ? c.glGroups : null;
}

/* ================================================================================================
   GL RULES — the lines a GL section presents beyond its own filter
   ================================================================================================ */
export function resolveGlRule(env: ComposeEnv, d: ArtifactDefinition, rule: GLRule, vis: Set<string> | 'ALL'): { accounts: string[]; entities?: string[]; keys?: string[]; periodStart: string; periodEnd: string; note: string } {
  const p = d.periodEnd;
  if (rule.kind === 'AUDIT_SELECTIONS') {
    const v = env.audit?.evaluate(rule.requestId, vis, { selections: d.filters?.selections });
    const keys = (v?.selections ?? []).map((x) => x.line?.key).filter((k): k is string => !!k);
    return { accounts: [], keys, periodStart: env.gl.periods()[0]!, periodEnd: env.gl.periods().at(-1)!, note: v ? `The governed lines behind ${keys.length} matched selection(s) of ${v.body.pbcNumber}${d.filters?.selections === 'COMPLETED' ? ' (fully supported only)' : ''}` : 'The PBC request is not available.' };
  }
  if (rule.kind === 'ACCOUNT_MONTH') return { accounts: [rule.account], periodStart: p, periodEnd: p, note: `${monLabel(p)} lines of ${rule.account} ${env.gl.account(rule.account)?.name ?? ''}`.trim() };
  if (rule.kind === 'RECONCILIATION') {
    const r = env.controls.recDef(rule.reconciliationId);
    if (!r || r.method === 'MODULE') return { accounts: [], periodStart: p, periodEnd: p, note: `${r?.name ?? rule.reconciliationId}: the server book does not model this reconciliation's accounts, so no GL detail is cited.` };
    return { accounts: r.accounts, ...(r.entity !== 'GROUP' ? { entities: [r.entity] } : {}), periodStart: p, periodEnd: p, note: `${monLabel(p)} activity in ${r.accounts.join(', ')}${r.entity !== 'GROUP' ? ` · ${r.entity}` : ''} — the reconciliation's population` };
  }
  /* MATERIAL_ITEMS: every account group whose governed movement this period is material (or over the stated amount),
     and the accounts of every blocking reconciliation over it — the lines behind the items the package reports */
  const min = rule.minUsd;
  const flux = env.controls.fluxItems(p, vis).filter((i) => (min === null ? i.material : Math.abs(i.changeUsd) >= min));
  const recs = env.controls.closeBlockers(p, vis).filter((b) => b.kind === 'RECONCILIATION_NOT_TIED' && (min === null || (b.amountUsd ?? 0) >= min)).map((b) => env.controls.recDef(b.ref)).filter((r): r is NonNullable<typeof r> => !!r && r.method !== 'MODULE');
  const accounts = [...new Set([...flux.map((i) => i.account), ...recs.flatMap((r) => r.accounts)])];
  const what = min === null ? 'material movements' : `items over $${min >= 1e6 ? `${+(min / 1e6).toFixed(2)}M` : `${Math.round(min / 1e3)}K`}`;
  return { accounts, periodStart: p, periodEnd: p, note: accounts.length ? `${monLabel(p)} GL behind ${what}: ${accounts.map((a) => `${a} ${env.gl.account(a)?.name ?? ''}`.trim()).join('; ')}` : `No ${what} in ${monLabel(p)} — this section has no lines.` };
}

/* ================================================================================================
   THE BUILDERS
   ================================================================================================ */
type Builder = (s: PlainSheetDef, c: SectionCtx) => SheetModel;

const pct = (a: number, b: number) => (Math.abs(b) < 0.5 ? null : (a - b) / Math.abs(b));

export const SECTIONS: Partial<Record<SheetKind, Builder>> = {
  /* ---- close ---------------------------------------------------------------------------------- */
  CLOSE_SUMMARY(s, c) {
    const r = c.env.controls.closeReadiness(c.period, c.vis);
    const b = r.blockers.filter((x) => inEnts(c, x.entity));
    const recs = c.env.controls.reconBalances(c.period, c.vis).filter((x) => inEnts(c, x.scope));
    const flux = c.env.controls.fluxItems(c.period, c.vis).filter((i) => i.material);
    const src = Object.values(SOURCE_HEALTH).filter((h) => h.status !== 'AVAILABLE');
    const rows: [string, Cell][] = [['Close readiness', `${r.readinessPct}%`], ...r.parts.map((p) => [p.l, `${p.n} of ${p.d}`] as [string, Cell]),
      ['Material blockers', b.filter((x) => x.severity === 'BLOCKING').length], ['High-severity items', b.filter((x) => x.severity === 'HIGH').length],
      ['Reconciliations not tied', recs.filter((x) => x.available && x.tieStatus === 'NOT_TIED').length], ['Reconciliations that cannot be proven (source not connected)', recs.filter((x) => x.available && x.tieStatus === 'SOURCE_NOT_CONNECTED').length],
      ['Reconciliations not modelled on the server book', recs.filter((x) => !x.available).length], ['Material Flux lines not approved', flux.filter((i) => i.status !== 'APPROVED').length],
      ['Pending approvals', c.env.controls.pendingApprovals(c.period, c.vis).filter((x) => inEnts(c, x.entity)).length],
      ['Source systems stale or unavailable', src.length ? src.map((h) => `${h.system} (${h.status.toLowerCase()})`).join('; ') : 'none'],
      ...(c.excludedEntities.length ? [['Entities left out as complete', c.excludedEntities.join(', ')] as [string, Cell]] : [])];
    return sheet(c, s, `${monLabel(c.period)} Close Summary`, [kv(rows)], 'Read from close readiness, blockers, reconciliation balances and Flux records');
  },
  BLOCKERS(s, c) {
    const b = c.env.controls.closeBlockers(c.period, c.vis).filter((x) => inEnts(c, x.entity) && (s.params?.minUsd === undefined || (x.amountUsd ?? 0) >= s.params.minUsd));
    /* the tool's own order: severity, then amount — Korvyn ranks by what the governed tools report, nothing else */
    const rows = b.map((x, i) => ({ cells: [i + 1, x.severity, x.kind.replace(/_/g, ' ').toLowerCase(), x.label, x.entity, x.amountUsd === null ? null : d2(x.amountUsd), traceOf(x.kind, x.ref, c.period)] as Cell[] }));
    return sheet(c, s, `Material Blockers · ${monLabel(c.period)}`, [table([C('rank', 'Rank', 6, 'int'), C('sev', 'Severity', 11), C('kind', 'Kind', 26), C('item', 'Item', 56), C('ent', 'Entity', 11), C('amt', 'Amount (USD)', 17, 'money'), TRACE], rows)], `${rows.length} items ranked by severity, then governed amount`);
  },
  RECS_NOT_TIED(s, c) {
    const bs = c.env.controls.reconBalances(c.period, c.vis).filter((x) => inEnts(c, x.scope));
    const rows: Row[] = [];
    for (const b of bs) {
      if (!b.available) continue;
      if (b.tieStatus === 'TIED') continue;
      c.citations.push({ type: 'RECONCILIATION_BALANCE', id: b.id, version: b.version, label: b.name });
      rows.push({ cells: [b.name, b.reconciliationId, b.scope === 'GROUP' ? 'Corporate Consolidated' : b.scope, b.glBalanceUsd, b.supportingBalanceUsd, b.differenceUsd, b.tieStatus.replace(/_/g, ' '), b.workflowStatus.replace(/_/g, ' '), b.preparer, b.reviewer, `${b.id} v${b.version}`, `recon:${b.reconciliationId}:${c.period}`] });
    }
    rows.sort((a, b) => Math.abs(Number(b.cells[5] ?? 0)) - Math.abs(Number(a.cells[5] ?? 0)));
    return sheet(c, s, `Reconciliations Not Tied · ${monLabel(c.period)}`, [table([C('n', 'Reconciliation', 36), C('id', 'Reconciliation ID', 20), C('sc', 'Scope', 14), C('gl', 'GL Balance', 17, 'money'), C('sup', 'Supporting Balance', 17, 'money'), C('df', 'Difference', 15, 'money'), C('t', 'Tie Status', 20), C('st', 'Review Status', 15), C('p', 'Preparer', 12), C('r', 'Reviewer', 12), C('rec', 'Balance Record', 26), TRACE], rows)], `${rows.length} reconciliations that do not tie or cannot be proven, cited by balance record`);
  },
  UNEXPLAINED_FLUX(s, c) {
    const items = c.env.controls.fluxItems(c.period, c.vis).filter((i) => i.material && i.status !== 'APPROVED');
    const rows = items.map((i) => { if (i.explanation) c.citations.push({ type: 'FLUX_EXPLANATION', id: i.explanation.id, version: i.explanation.version, label: i.name });
      return { cells: [i.name, d2(i.currentUsd), d2(i.priorUsd), d2(i.changeUsd), pct(i.currentUsd, i.priorUsd), i.status.replace(/_/g, ' '), i.explanation ? `${i.explanation.id} v${i.explanation.version}` : 'none recorded', i.reviewer, `flux:${i.account}:${c.period}`] as Cell[] }; });
    return sheet(c, s, `Unexplained Flux · ${monLabel(c.period)}`, [table([C('g', 'Account / Group', 32), C('cur', 'Current', 17, 'money'), C('pri', 'Prior', 17, 'money'), C('ch', 'Variance', 16, 'money'), C('pc', 'Variance %', 11, 'pct'), C('st', 'Status', 14), C('ex', 'Explanation Record', 26), C('rv', 'Reviewer', 12), TRACE], rows)], `${rows.length} material movements without an approved explanation`);
  },
  MISSING_SUPPORT(s, c) {
    /* a package about one thing (a vendor, a reconciliation) lists the reconciliations related to it, not every one */
    const fg = c.d.focus?.vendor || c.d.focus?.reconciliationId || c.d.focus?.account ? focusGroups(c) ?? new Set<string>() : null;
    const related = (id: string) => { if (c.d.focus?.reconciliationId) return id === c.d.focus.reconciliationId; const d = c.env.controls.recDef(id); return !fg || !!d?.accounts.some((a) => fg.has(c.env.gl.account(a)?.parent ?? a) || fg.has(a)); };
    const recs = c.env.controls.reconciliations(c.period, c.vis).filter((r) => inEnts(c, r.entity) && !r.supportComplete && related(r.id));
    const recRows = recs.flatMap((r) => r.support.filter((x) => x.status === 'MISSING').map((x) => ({ cells: [r.name, r.id, x.requirement, x.kind, `recon:${r.id}:${c.period}`] as Cell[] })));
    /* a package about a population (a vendor, a GL extract) measures ITS lines; a close or management package measures the
       period — adding a GL tab to a close package must not change what its Missing Support tab covers */
    const periodPkg = c.d.type === 'CLOSE_REVIEW_PACKAGE' || c.d.type === 'MANAGEMENT_REVIEW_PACKAGE';
    const lines = c.d.focus?.vendor ? (c.hasGl ? c.glRows : c.focusRows()) : c.hasGl && !periodPkg ? c.glRows : c.env.gl.lines.filter((l) => l.period === c.period && inEnts(c, l.entity));
    const ev = c.env.controls.evidenceForLines(lines);
    const txRows = ev.missing.sort((a, b) => Math.abs(b.line.usd) - Math.abs(a.line.usd)).map((m) => ({ cells: [m.line.key, m.line.postingDate, m.line.entity, m.line.vendor, d2(Math.abs(m.line.usd)), m.gaps.join(', '), `txn:${m.line.key}`] as Cell[] }));
    return sheet(c, s, `Missing Support · ${monLabel(c.period)}`, [
      table([C('n', 'Reconciliation', 36), C('id', 'Reconciliation ID', 20), C('rq', 'Required Support', 36), C('k', 'Kind', 16), TRACE], recRows, 'Reconciliations missing required support'),
      table([C('t', 'Transaction', 16), C('d', 'Posting Date', 12), C('e', 'Entity', 10), C('v', 'Vendor', 22), C('a', 'Amount (USD)', 17, 'money'), C('g', 'Missing Evidence Reference', 40), TRACE], txRows, `Transactions missing evidence references (${AP_EXTRACT.id})`),
    ], `${recRows.length} missing support items · ${txRows.length} transactions missing references`);
  },
  PENDING_REVIEW(s, c) {
    const rows = c.env.controls.pendingApprovals(c.period, c.vis).filter((x) => inEnts(c, x.entity)).map((x) => ({ cells: [x.kind.replace(/_/g, ' ').toLowerCase(), x.label, x.entity, x.approver, traceOf(x.kind, x.ref, c.period)] as Cell[] }));
    return sheet(c, s, `Pending Review · ${monLabel(c.period)}`, [table([C('k', 'Kind', 22), C('i', 'Item', 50), C('e', 'Entity', 11), C('a', 'Approver', 14), TRACE], rows)], `${rows.length} items awaiting a reviewer`);
  },
  EXCEPTIONS(s, c) {
    const rows = c.env.controls.continuousCloseSignals(c.period, c.vis).map((x) => ({ cells: [x.signal.replace(/_/g, ' ').toLowerCase(), x.ref, x.detail, x.amountUsd === null ? null : d2(x.amountUsd), `signal:${x.ref}`] as Cell[] }));
    return sheet(c, s, `Exceptions · ${monLabel(c.period)}`, [table([C('s', 'Signal', 26), C('r', 'Reference', 22), C('d', 'Detail', 70), C('a', 'Amount (USD)', 17, 'money'), TRACE], rows)], `${rows.length} continuous-close signals`);
  },
  MATERIAL_MOVEMENTS(s, c) {
    const items = c.env.controls.fluxItems(c.period, c.vis).filter((i) => i.material);
    const rows = items.map((i) => ({ cells: [i.name, d2(i.currentUsd), d2(i.priorUsd), d2(i.changeUsd), pct(i.currentUsd, i.priorUsd), i.status.replace(/_/g, ' '), `flux:${i.account}:${c.period}`] as Cell[] }));
    return sheet(c, s, `Material Movements · ${monLabel(c.period)} vs ${c.prior ? monLabel(c.prior) : 'n/a'}`, [table([C('g', 'Account / Group', 32), C('cur', 'Current', 17, 'money'), C('pri', 'Prior', 17, 'money'), C('ch', 'Movement', 16, 'money'), C('pc', 'Movement %', 11, 'pct'), C('st', 'Explanation Status', 16), TRACE], rows)], `${rows.length} material movements, largest first`);
  },
  ITEMS_OVER(s, c) {
    const min = s.params?.minUsd ?? 10_000_000;
    const rows: Row[] = [];
    for (const b of c.env.controls.closeBlockers(c.period, c.vis)) if (inEnts(c, b.entity) && (b.amountUsd ?? 0) >= min) rows.push({ cells: ['Blocker', b.label, b.entity, d2(b.amountUsd!), traceOf(b.kind, b.ref, c.period)] });
    for (const i of c.env.controls.fluxItems(c.period, c.vis)) if (Math.abs(i.changeUsd) >= min) rows.push({ cells: ['Flux movement', i.name, 'GROUP', d2(i.changeUsd), `flux:${i.account}:${c.period}`] });
    for (const b of c.env.controls.reconBalances(c.period, c.vis)) if (b.available && inEnts(c, b.scope) && Math.abs(b.differenceUsd ?? 0) >= min) rows.push({ cells: ['Reconciliation difference', b.name, b.scope, b.differenceUsd, `recon:${b.reconciliationId}:${c.period}`] });
    for (const l of c.env.gl.lines) if (l.period === c.period && inEnts(c, l.entity) && Math.abs(l.usd) >= min) rows.push({ cells: ['GL line', `${l.key} · ${l.accountName}`, l.entity, d2(l.usd), `txn:${l.key}`] });
    rows.sort((a, b) => Math.abs(Number(b.cells[3])) - Math.abs(Number(a.cells[3])));
    const lbl = `$${min >= 1e6 ? `${+(min / 1e6).toFixed(2)}M` : `${Math.round(min / 1e3)}K`}`;
    return sheet(c, s, `Items Over ${lbl} · ${monLabel(c.period)}`, [table([C('k', 'Kind', 22), C('i', 'Item', 56), C('e', 'Entity', 11), C('a', 'Amount (USD)', 17, 'money'), TRACE], rows)], `${rows.length} items at or over ${lbl}`);
  },

  /* ---- analysis ------------------------------------------------------------------------------- */
  DRIVERS(s, c) {
    const L = c.env.gl, dim = (s.params?.dimension ?? 'entity') as Parameters<typeof L.aggregate>[1];
    const prior = c.prior;
    /* a population package (a vendor, a GL extract) breaks down ITS lines; every other package breaks down the period's
       material movements — adding a GL tab to a financial package does not change what its drivers are about */
    const popPkg = !!c.d.focus?.vendor || c.d.type === 'SUPPORT_PACKAGE' || c.d.type === 'GL_EXTRACT' || c.d.type === 'EXCEL_WORKBOOK' || !c.d.type;
    const accounts = s.params?.accounts === 'MATERIAL' || (!s.params?.accounts && !c.d.focus?.account && !c.d.focus?.vendor && !(c.hasGl && popPkg))
      ? c.env.controls.fluxItems(c.period, c.vis).filter((i) => i.material).slice(0, 5).map((i) => i.account)
      : s.params?.accounts ? [s.params.accounts] : c.d.focus?.account ? [c.d.focus.account] : [];
    const rows: Row[] = [];
    if (accounts.length) {
      for (const a of accounts) {
        const set = new Set(L.expandAccounts([a]));
        const lines = L.lines.filter((l) => set.has(l.account) && (l.period === c.period || l.period === prior) && inEnts(c, l.entity));
        const g = L.aggregate(lines, dim, { current: (l) => l.period === c.period, prior: (l) => l.period === prior });
        for (const x of g.slice(0, 12)) rows.push({ cells: [`${a} ${L.account(a)?.name ?? ''}`.trim(), x.label, d2(L.presented(a, x.current)), d2(L.presented(a, x.prior)), d2(L.presented(a, x.change)), x.lines, `population:${a}:${dim}:${x.key ?? 'none'}`] });
      }
      return sheet(c, s, `${s.name} · ${monLabel(c.period)} vs ${prior ? monLabel(prior) : 'n/a'} · by ${dim}`, [table([C('a', 'Account / Group', 30), C('d', `Driver (${dim})`, 28), C('cur', 'Current', 17, 'money'), C('pri', 'Prior', 17, 'money'), C('ch', 'Change', 16, 'money'), C('n', 'Lines', 8, 'int'), TRACE], rows)], `governed lines aggregated by ${dim}; presented sign`);
    }
    /* a population-based package (a vendor): the package's lines by the dimension, over its window */
    const lines = c.hasGl ? c.glRows : c.focusRows();
    const g = L.aggregate(lines, dim);
    const tot = g.reduce((t, x) => t + x.current, 0);
    const rs = g.map((x) => ({ cells: [x.label, d2(x.current), x.lines, Math.abs(tot) >= 0.5 ? x.current / tot : null, `population:${dim}:${x.key ?? 'none'}`] as Cell[] }));
    return sheet(c, s, `${s.name} · ${rangeLabel(c.d.periodStart, c.d.periodEnd)} · by ${dim}`, [table([C('d', dim === 'project' ? 'Project' : `Driver (${dim})`, 28), C('a', 'Amount (USD)', 17, 'money'), C('n', 'Lines', 8, 'int'), C('s', 'Share', 9, 'pct'), TRACE], rs, undefined, [{ style: 'total', cells: ['Total', d2(tot), lines.length, null, null] }])], `${lines.length} governed lines by ${dim}`);
  },
  EXPLANATION(s, c) {
    const acct = c.d.focus?.account; const items = acct ? c.env.controls.fluxItems(c.period, c.vis).filter((i) => i.account === (c.env.gl.account(acct)?.parent ?? acct)) : [];
    const i = items[0];
    if (!i) return sheet(c, s, 'Explanation', [note(acct ? `No Flux line for ${acct} in ${monLabel(c.period)}.` : 'This package has no account in focus.')], 'Flux explanation');
    const e = i.explanation;
    if (e) c.citations.push({ type: 'FLUX_EXPLANATION', id: e.id, version: e.version, label: i.name });
    const rec = e ? WORK.repos.records.get<{ history?: { version: number; text: string; status: string; at: string; by: string }[] }>('FLUX_EXPLANATION', e.id) : null;
    const comments = fluxAccountComments(i.account, c.period);
    return sheet(c, s, `Explanation · ${i.name} · ${monLabel(c.period)}`, [
      kv([['Flux line', i.name], ['Movement (USD)', d2(i.changeUsd)], ['Materiality', i.material ? 'Material' : 'Below threshold'], ['Status', i.status.replace(/_/g, ' ')],
        ['Explanation record', e ? `${e.id} v${e.version}` : 'none recorded'], ['Explanation', e?.text ?? 'No explanation has been recorded.'], ['Author', e?.author ?? '—'], ['Reviewer', i.reviewer ?? '—'], ['Trace', `flux:${i.account}:${c.period}`]]),
      table([C('v', 'Version', 9, 'int'), C('st', 'Status', 12), C('t', 'Wording', 90), C('by', 'Changed By', 16), C('at', 'Changed At', 20)], (rec?.history ?? []).map((h) => ({ cells: [h.version, h.status, h.text, h.by, h.at.slice(0, 16).replace('T', ' ')] })), 'Earlier versions of the wording'),
      table([C('a', 'Author', 22), C('at', 'Date', 18), C('t', 'Comment', 90), C('on', 'On', 16)], comments.map((m) => ({ cells: [`${m.author}${m.via ? ` via ${m.via}` : ''}`, m.at.slice(0, 16).replace('T', ' '), m.text, m.on] })), 'Comments on this line'),
    ], 'The one governed explanation record, read at generation');
  },
  COMMENTS(s, c) {
    const rows: Row[] = [];
    const recIds = c.d.focus?.reconciliationId ? [c.d.focus.reconciliationId] : c.env.controls.allRecDefs().filter((r) => inEnts(c, r.entity)).map((r) => r.id);
    for (const id of recIds) for (const m of WORK.thread(`recon:${id}:${c.period}`).comments) rows.push({ cells: ['Reconciliation', c.env.controls.recDef(id)?.name ?? id, `${m.author}${m.via ? ` via ${m.via}` : ''}`, m.at.slice(0, 16).replace('T', ' '), m.text, m.version, `recon:${id}:${c.period}`] });
    if (c.d.focus?.account) { const g = c.env.gl.account(c.d.focus.account)?.parent ?? c.d.focus.account; for (const m of fluxAccountComments(g, c.period)) rows.push({ cells: ['Flux line', g, `${m.author}${m.via ? ` via ${m.via}` : ''}`, m.at.slice(0, 16).replace('T', ' '), m.text, m.version, `flux:${g}:${c.period}`] }); }
    return sheet(c, s, `Comments · ${monLabel(c.period)}`, [table([C('o', 'Object', 14), C('n', 'Name', 32), C('a', 'Author', 22), C('d', 'Date', 17), C('t', 'Comment', 80), C('v', 'Version', 8, 'int'), TRACE], rows)], `${rows.length} comments from the work store`);
  },

  /* ---- reconciliation ------------------------------------------------------------------------- */
  RECONCILIATION(s, c) {
    const id = c.d.focus?.reconciliationId, def = id ? c.env.controls.recDef(id) : null;
    if (!def) return sheet(c, s, 'Reconciliation', [note('This package has no reconciliation in focus.')], 'Reconciliation');
    const b = c.env.controls.reconBalance(def, c.period), r = c.env.controls.reconcile(def, c.period);
    if (b.available) c.citations.push({ type: 'RECONCILIATION_BALANCE', id: b.id, version: b.version, label: def.name });
    const rows: [string, Cell][] = [['Reconciliation', def.name], ['Reconciliation ID', def.id], ['Scope', def.entity === 'GROUP' ? 'Corporate Consolidated' : def.entity], ['Method', def.method.toLowerCase()],
      ...(b.available ? [['GL balance (USD)', b.glBalanceUsd], [b.supportingLabel, b.supportingBalanceUsd], ['Difference', b.differenceUsd], ['Tie status', b.tieStatus.replace(/_/g, ' ')], ['Balance record', `${b.id} v${b.version}`]] as [string, Cell][]
        : [['Balance', `Not server-authoritative — ${b.reason}`]] as [string, Cell][]),
      ['Review status', r.workflow.status.replace(/_/g, ' ')], ['Preparer', r.workflow.preparer], ['Reviewer', r.workflow.reviewer], ['Support', r.supportComplete ? 'complete' : `${r.support.filter((x) => x.status === 'MISSING').length} required item(s) missing`], ['Trace', `recon:${def.id}:${c.period}`]];
    if (!b.available) c.excluded.push({ label: `${def.name} (${def.id}) balance`, reason: b.reason });
    return sheet(c, s, `${def.name} · ${monLabel(c.period)}`, [kv(rows)], b.available ? 'Server balance record, cited by id and version' : 'Workflow is server-authoritative; the balance is not modelled on the server book');
  },
  RECONCILING_ITEMS(s, c) {
    const ids = c.d.focus?.reconciliationId ? [c.d.focus.reconciliationId] : c.env.controls.allRecDefs().filter((r) => inEnts(c, r.entity)).map((r) => r.id);
    const rows: Row[] = [];
    for (const id of ids) { const def = c.env.controls.recDef(id); if (!def) continue; const b = c.env.controls.reconBalance(def, c.period); if (!b.available) continue; for (const i of c.env.controls.redact(b, c.vis).items) rows.push({ cells: [def.name, i.label, i.kind.replace(/_/g, ' ').toLowerCase(), i.amountUsd, `${b.id} v${b.version}`, `recon:${id}:${c.period}`] }); }
    return sheet(c, s, `Reconciling Items · ${monLabel(c.period)}`, rows.length ? [table([C('r', 'Reconciliation', 34), C('i', 'Item', 44), C('k', 'Kind', 24), C('a', 'Amount (USD)', 17, 'money'), C('b', 'Balance Record', 26), TRACE], rows)] : [note(ids.length === 1 && !c.env.controls.reconBalance(c.env.controls.recDef(ids[0]!)!, c.period).available ? 'The server book does not model this reconciliation; its reconciling items are computed by the Reconciliations module and are not cited.' : 'No reconciling items: the reconciliation carries no difference to explain.')], `${rows.length} reconciling items`);
  },
  SUPPORT_INDEX(s, c) {
    const ids = c.d.focus?.reconciliationId ? [c.d.focus.reconciliationId] : c.env.controls.allRecDefs().filter((r) => inEnts(c, r.entity)).map((r) => r.id);
    const req: Row[] = [], att: Row[] = [];
    for (const id of ids) {
      const def = c.env.controls.recDef(id); if (!def) continue;
      const r = c.env.controls.reconcile(def, c.period), key = `recon:${id}:${c.period}`;
      for (const x of r.support) req.push({ cells: [def.name, x.requirement, x.kind, x.status === 'MISSING' ? 'MISSING' : 'Attached (reference)', x.reference, key] });
      for (const e of WORK.relsTo(key)) att.push({ cells: [def.name, e.label, e.kind, e.from, e.via, e.at.slice(0, 10), 'Reference only — document not connected', `evidence:${e.id}`] });
      c.citations.push({ type: 'EVIDENCE_RELATIONSHIPS', id: key, version: WORK.relationshipVersion(key), label: `${def.name} support` });
    }
    return sheet(c, s, `Support Index · ${monLabel(c.period)}`, [
      table([C('r', 'Reconciliation', 34), C('q', 'Requirement', 34), C('k', 'Kind', 16), C('st', 'Status', 20), C('ref', 'Reference', 30), TRACE], req, 'Required support'),
      table([C('r', 'Reconciliation', 34), C('l', 'Description', 34), C('k', 'Kind', 16), C('ref', 'Reference', 30), C('v', 'Attached Via', 12), C('d', 'Date', 12), C('av', 'Availability', 34), TRACE], att, 'Attached evidence references'),
    ], `${req.length} requirements · ${att.length} attached references`);
  },
  RECON_PROOF(s, c) {
    const id = c.d.focus?.reconciliationId, def = id ? c.env.controls.recDef(id) : null;
    if (!def) return sheet(c, s, 'Tie-Out', [note('This package has no reconciliation in focus.')], 'Reconciliation tie-out');
    const b = c.env.controls.reconBalance(def, c.period), r = c.env.controls.reconcile(def, c.period);
    if (!b.available) return sheet(c, s, `${def.name} · Tie-Out`, [note(`Not proven on the server book: ${b.reason}`)], 'Reconciliation tie-out');
    const items = b.items.reduce((t, i) => t + i.amountUsd, 0);
    const rows: [string, Cell][] = [['Opening balance (prior period end)', d2(r.openingUsd)], ['Period movement', d2(r.glBalanceUsd - r.openingUsd)], ['GL balance (period end)', b.glBalanceUsd],
      [b.supportingLabel, b.supportingBalanceUsd], ['Reconciling items', d2(items)], ['Difference', b.differenceUsd], ['Result', b.tieStatus.replace(/_/g, ' ')], ['Balance record', `${b.id} v${b.version}`], ['Trace', `recon:${def.id}:${c.period}`]];
    return sheet(c, s, `${def.name} · Tie-Out · ${monLabel(c.period)}`, [kv(rows)], 'GL balance proven against the supporting balance');
  },

  /* ---- evidence ------------------------------------------------------------------------------- */
  EVIDENCE_INDEX(s, c) {
    const lines = c.hasGl ? c.glRows : c.focusRows();
    const recsByKey = new Map<string, string[]>();
    for (const r of c.env.controls.allRecDefs()) for (const a of r.accounts) { const g = c.env.gl.account(a)?.parent ?? a; const k = `${r.entity}|${g}`; recsByKey.set(k, [...(recsByKey.get(k) ?? []), r.id]); }
    const rows: Row[] = [];
    const sys = (l: GLine) => `${SOURCE_HEALTH[l.connector]?.system ?? l.connector} · ${AP_EXTRACT.id}`;
    for (const l of lines) {
      if (!l.vendor || l.account === '20100') continue;
      const recs = [...(recsByKey.get(`${l.entity}|${l.group}`) ?? []), ...(recsByKey.get(`GROUP|${l.group}`) ?? [])].join(', ');
      for (const [ref, type] of [[l.invoiceRef, 'Invoice'], [l.poRef, 'Purchase order'], [l.contractRef, 'Contract'], [l.approvalRef, 'Approval']] as [string | null, string][]) {
        if (!ref) continue;
        rows.push({ cells: [ref, type, sys(l), ref, l.key, recs || null, `FLUX-${l.group}-${l.period}`, 'Reference only — document not connected', `txn:${l.key}`] });
      }
    }
    return sheet(c, s, 'Evidence Index', [table([C('id', 'Evidence ID', 24), C('t', 'Type', 14), C('s', 'Source System', 34), C('d', 'Source Document', 24), C('tx', 'Related Transaction', 16), C('r', 'Related Reconciliation', 28), C('f', 'Related Flux Item', 22), C('av', 'Availability', 34), TRACE], rows)], `${rows.length} evidence references from ${lines.length} lines · documents are referenced, not downloaded`);
  },
  EVIDENCE_COVERAGE(s, c) {
    const lines = c.hasGl ? c.glRows : c.focusRows();
    const ap = lines.filter((l) => l.vendor && l.account !== '20100');
    if (!ap.length) return sheet(c, s, 'Support Coverage', [note(`Support coverage is not measurable for these lines: none is an AP-sourced line with evidence references (${AP_EXTRACT.id}). Coverage is stated only where the evidence graph supports it.`)], 'Support coverage');
    const full = ap.filter((l) => l.invoiceRef && (!l.approvalRequired || l.approvalRef) && (!l.project || l.poRef));
    const none = ap.filter((l) => !l.invoiceRef);
    const part = ap.filter((l) => l.invoiceRef && !full.includes(l));
    const amt = (x: GLine[]) => d2(x.reduce((t, l) => t + Math.abs(l.usd), 0));
    const tot = amt(ap);
    return sheet(c, s, 'Support Coverage', [kv([['Lines in scope', lines.length], ['AP-sourced lines (evidence measurable)', ap.length], ['Lines where evidence is not measurable (not AP)', lines.length - ap.length],
      ['Supported amount (USD)', amt(full)], ['Partially supported amount (USD)', amt(part)], ['Unsupported amount (USD)', amt(none)], ['Support coverage', tot ? `${((amt(full) / tot) * 100).toFixed(1)}%` : 'n/a'],
      ['Missing evidence references', c.env.controls.evidenceForLines(lines).missing.length], ['Evidence source', `${AP_EXTRACT.id} — references only; no document is connected`]])], 'Supported = invoice, plus approval where required and PO where the line has a project');
  },
  SOURCE_REFERENCES(s, c) {
    const byConn = new Map<string, GLine[]>();
    for (const l of c.hasGl ? c.glRows : []) byConn.set(l.connector, [...(byConn.get(l.connector) ?? []), l]);
    const ents = c.env.gl.entities().filter((e) => c.scope.entityIds.includes(e.id));
    const rows = [...new Set(ents.map((e) => e.connector))].map((k) => { const h = SOURCE_HEALTH[k]!; return { cells: [h.system, h.instance, h.status, ents.filter((e) => e.connector === k).map((e) => e.id).join(', '), (byConn.get(k) ?? []).length, 'none published', h.note, `source:${h.instance}`] as Cell[] }; });
    return sheet(c, s, 'Source References', [table([C('s', 'Source System', 22), C('i', 'Instance', 14), C('st', 'Status', 13), C('e', 'Entities', 26), C('n', 'Lines in This Workbook', 12, 'int'), C('dl', 'Deep Link', 14), C('nt', 'Note', 60), TRACE], rows),
      kv([['Governed data version', c.env.gl.dataVersion()], ['Source ERP data version', c.env.tie.sourceDataVersion()], ['Mapping version', MAPPING_VERSION], ['FX rate sets', 'FXR-2026-CLS-REP-1 (balances), FXR-2026-AVG-REP-1 (activity)']], 'Versions')], `${rows.length} source systems`);
  },
  AUDIT_TRAIL(s, c) {
    const keys = new Set<string>();
    for (const r of c.env.controls.allRecDefs()) if (inEnts(c, r.entity)) keys.add(`recon:${r.id}:${c.period}`);
    for (const i of c.env.controls.fluxItems(c.period, c.vis)) keys.add(`flux:${i.account}:${c.period}`);
    const ev = WORK.repos.audit.list().filter((e) => e.target?.id && keys.has(e.target.id)).slice(-500).reverse();
    const rows = ev.map((e) => ({ cells: [e.at.slice(0, 19).replace('T', ' '), e.actor.name, e.source, e.action, e.target.label ?? e.target.id, e.outcome, e.eventId] as Cell[] }));
    return sheet(c, s, `Audit Trail · ${monLabel(c.period)}`, [table([C('at', 'At', 19), C('a', 'Actor', 20), C('s', 'Channel', 9), C('ac', 'Action', 28), C('t', 'Target', 40), C('o', 'Outcome', 11), C('id', 'Audit Event', 26)], rows)], `${rows.length} append-only audit events on the reconciliations and Flux lines in scope`);
  },
  POPULATION_METADATA(s, c) {
    const blocks = c.populations.map((p) => kv([['Population', p.populationId], ['Population version (data version)', p.populationVersion], ['Rows', p.rowCount], ['Total debits (USD)', p.debitUsd], ['Total credits (USD)', p.creditUsd], ['Net (USD)', p.netUsd],
      ['Content hash', p.contentHash], ['Mapping version', MAPPING_VERSION], ['Definition', JSON.stringify(c.d.sheets.find((x) => x.name === p.sheet && x.kind === 'GL') ?? {})], ['Trace', `population:${p.populationId}`]], p.sheet));
    return sheet(c, s, 'Population Metadata', blocks.length ? blocks : [note('This workbook has no GL population.')], `${blocks.length} governed population(s)`);
  },

  /* ---- financial statements ------------------------------------------------------------------- */
  INCOME_STATEMENT(s, c) {
    const months = c.env.gl.periods().filter((p) => p >= c.d.periodStart && p <= c.d.periodEnd);
    const r = c.env.data.incomeStatement(c.d.scopeId, months);
    const cols = [C('l', 'Line', 36), ...months.map((m) => C(m, monLabel(m), 15, 'money')), C('t', 'Total', 16, 'money')];
    const rows: Row[] = r.rows.map((x) => ({ style: x.kind === 'total' ? 'total' : x.kind === 'subtotal' ? 'subtotal' : x.level === 0 ? 'label' : 'data', cells: [`${x.level ? '   ' : ''}${x.label}`, ...(x.level === 0 && x.kind === 'line' ? months.map(() => null) : x.values.map(d2)), x.level === 0 && x.kind === 'line' ? null : d2(x.values.reduce((t, v) => t + v, 0))] as Cell[] }));
    return sheet(c, s, `Income Statement · ${rangeLabel(months[0]!, months.at(-1)!)} · ${r.currency}`, [{ columns: cols, rowCount: rows.length, tabular: false, chunks: () => [rows] }],
      `${r.journalLines} journal lines · ${r.translated ? `translated at ${r.fxRateSetId}` : 'functional currency'} · intercompany eliminated when both parties are in scope`);
  },
  BALANCE_SHEET(s, c) {
    const months = c.env.gl.periods().filter((p) => p >= c.d.periodStart && p <= c.d.periodEnd);
    const env = { data: c.env.data, gl: c.env.gl, controls: c.env.controls, visible: c.env.visible, objectId: '', actor: null } as unknown as ToolEnv;
    const sc = c.d.scopeId === 'GROUP' ? undefined : c.d.scopeId;
    const vals = months.map((m) => bsValues(env, m, sc));
    const nm = (code: string) => c.env.gl.account(code)?.name ?? code;
    const line = (label: string, f: (b: ReturnType<typeof bsValues>) => number, style: Row['style'] = 'data'): Row => ({ style, cells: [label, ...vals.map((b) => d2(f(b)))] });
    const rows: Row[] = [{ style: 'label', cells: ['Assets', ...months.map(() => null)] },
      ...vals[0]!.a.map(([code], i) => line(`   ${nm(code)}`, (b) => b.a[i]![1])), line('Total assets', (b) => b.ta, 'subtotal'),
      { style: 'label', cells: ['Liabilities', ...months.map(() => null)] }, ...vals[0]!.l.map(([code], i) => line(`   ${nm(code)}`, (b) => b.l[i]![1])), line('Total liabilities', (b) => b.tl, 'subtotal'),
      { style: 'label', cells: ['Equity', ...months.map(() => null)] }, line('   Contributed and other equity', (b) => b.eq), line('   Retained earnings — year to date', (b) => b.re), line('   Cumulative translation adjustment (derived)', (b) => b.cta),
      line('Total equity', (b) => b.te, 'subtotal'), line('Total liabilities and equity', (b) => b.tl + b.te, 'total')];
    return sheet(c, s, `Balance Sheet · ${rangeLabel(months[0]!, months.at(-1)!)} · USD`, [{ columns: [C('l', 'Line', 40), ...months.map((m) => C(m, monLabel(m), 16, 'money'))], rowCount: rows.length, tabular: false, chunks: () => [rows] }],
      'Month-end balances at the closing rate set; intercompany presented gross; translation derived as the balancing residual');
  },
  VARIANCE(s, c) {
    const months = c.env.gl.periods().filter((p) => p >= c.d.periodStart && p <= c.d.periodEnd);
    const is = c.env.data.incomeStatement(c.d.scopeId, months);
    const env = { data: c.env.data, gl: c.env.gl, controls: c.env.controls, visible: c.env.visible, objectId: '', actor: null } as unknown as ToolEnv;
    const sc = c.d.scopeId === 'GROUP' ? undefined : c.d.scopeId;
    const bs = months.map((m) => bsValues(env, m, sc));
    const series: [string, number[], Row['style']][] = [
      ...is.rows.filter((r) => r.kind !== 'line').map((r) => [r.label, r.values, r.kind === 'total' ? 'total' : 'subtotal'] as [string, number[], Row['style']]),
      ['Total assets', bs.map((b) => b.ta), 'subtotal'], ['Total liabilities', bs.map((b) => b.tl), 'subtotal'], ['Total equity', bs.map((b) => b.te), 'subtotal']];
    const mom = months.slice(1);
    const rows: Row[] = series.map(([label, v, style]) => ({ style: style === 'total' ? 'total' : 'data', cells: [label, ...mom.map((_, i) => d2(v[i + 1]! - v[i]!)), v.length > 1 ? pct(v.at(-1)!, v.at(-2)!) : null] as Cell[] }));
    return sheet(c, s, `MoM Variance · ${rangeLabel(months[0]!, months.at(-1)!)}`, [{ columns: [C('l', 'Line', 36), ...mom.map((m, i) => C(m, `${monLabel(m).slice(0, 3)} vs ${monLabel(months[i]!).slice(0, 3)}`, 15, 'money')), C('p', `${monLabel(months.at(-1)!).slice(0, 3)} MoM %`, 11, 'pct')], rowCount: rows.length, tabular: false, chunks: () => [rows] }],
      'Month-over-month change of each statement subtotal; income statement at average rates, balance sheet at closing rates');
  },


  /* ---- audit / PBC (5A) — every figure from AuditService.evaluate over the governed services ---------------- */
  PBC_SUMMARY(s, c) {
    const v = pbcOf(c); if (!v) return sheet(c, s, 'PBC Summary', [note('This package has no PBC request in focus.')], 'PBC request');
    const q = v.requirement, cv = v.coverage, open = v.gaps.filter((g) => g.status === 'OPEN');
    const rows: [string, Cell][] = [['PBC', v.body.pbcNumber], ['Request', v.body.title], ['Requested by', v.body.requestedBy], ['Owner', v.body.owner], ['Received as', v.body.source === 'UPLOAD' ? `Upload · ${v.body.fileName ?? ''}` : v.body.source === 'NL' ? 'Natural-language request' : v.body.source === 'MANUAL' ? 'Manual request' : 'Recorded request'],
      ['Request version', `v${v.version}`], ['Status', `${v.status.replace(/_/g, ' ')}${v.statusReasons[0] ? ` — ${v.statusReasons[0]}` : ''}`],
      ...(q ? [['Period', rangeLabel(q.periodStart, q.periodEnd)], ['Scope', c.ctxLine.split(' · ')[0] ?? q.scopeId], ['Financial object', `${q.objectName} (${q.accounts.join(', ')}) · ${q.populationType.toLowerCase()}`], ['Threshold', q.minAbsUsd ? `over ${usdFmt(q.minAbsUsd)}` : 'none'],
        ['Required evidence', q.requiredEvidence.map((e) => EV_LABEL[e] ?? e).join(', ')]] as [string, Cell][] : [['Requirement', 'Not interpreted — the request needs review']] as [string, Cell][]),
      ...(v.population ? [['Population', `${v.population.id} · ${v.population.rowCount} lines`], ['Population total (USD)', v.population.totalUsd], ['Population tie-out', v.tie ? v.tie.status.replace(/_/g, ' ') : 'n/a']] as [string, Cell][] : []),
      ['Selections', `${v.selections.length}${c.d.filters?.selections === 'COMPLETED' ? ' (fully supported only)' : c.d.filters?.selections === 'OPEN' ? ' (open items only)' : ''}`],
      ['Matched', `${v.matching.MATCHED} · multiple ${v.matching.MULTIPLE_MATCHES} · partial ${v.matching.PARTIAL_MATCH} · not found ${v.matching.NOT_FOUND} · source unavailable ${v.matching.SOURCE_UNAVAILABLE}`],
      ['Fully supported', `${cv.full} · ${usdFmt(cv.fullUsd)}`], ['Partially supported', `${cv.partial} · ${usdFmt(cv.partialUsd)}`], ['Unsupported', `${cv.unsupported} · ${usdFmt(cv.unsupportedUsd)}`],
      ['Support coverage (by amount)', cv.pct === null ? 'n/a' : `${(cv.pct * 100).toFixed(1)}%`], ['Open support gaps', (() => { const ex = gapExposure(open); return `${open.length}${ex.selections ? ` · on ${ex.selections} selection(s) worth ${usdFmt(ex.usd)}` : ''}`; })()],
      ['Documents', 'References only — no document connector; retrieval is external'], ['Governed data version', v.population?.dataVersion ?? c.env.gl.dataVersion()], ['Mapping version', MAPPING_VERSION], ['Trace', `pbc:${v.id}`]];
    c.citations.push({ type: 'PBC_REQUEST', id: v.id, version: v.version, label: v.body.pbcNumber });
    for (const w of v.warnings) if (!c.warnings.includes(w)) c.warnings.push(w);
    return sheet(c, s, `${v.body.pbcNumber} · ${v.body.title}`, [kv(rows), ...(v.statusReasons.length > 1 ? [note(v.statusReasons.join(' '))] : [])], 'The PBC request as evaluated over the governed ledger');
  },
  AUDIT_POPULATION(s, c) {
    const v = pbcOf(c); if (!v?.population || !v.requirement) return sheet(c, s, 'Population', [note('The request has no governed population.')], 'Audit population');
    const q = v.requirement, pop = c.env.audit!.population(q, c.vis), sel = new Set(v.selections.map((x) => x.line?.key).filter(Boolean));
    const rows: Row[] = pop.rows.map((l) => ({ cells: [l.key, utc(l.postingDate), l.entity, `${l.account} ${l.accountName}`, gv(l), l.project, d2(l.usd), sel.has(l.key) ? 'Selected' : '', `txn:${l.key}`] as Cell[] }));
    return sheet(c, s, `Population · ${q.title}`, [kv([['Population', v.population.id], ['Definition', JSON.stringify(v.population.filter)], ['Lines', v.population.rowCount], ['Total (USD)', v.population.totalUsd], ['Below the threshold (not in the population)', `${v.population.belowThreshold.count} lines · ${usdFmt(v.population.belowThreshold.totalUsd)}`],
      ['Content hash', v.population.contentHash], ['Data version', v.population.dataVersion], ['Mapping version', v.population.mappingVersion], ['Source systems', v.population.sourceSystems.join(', ')]]),
      table([C('t', 'Transaction', 16), C('d', 'Posting Date', 12, 'date'), C('e', 'Entity', 10), C('a', 'Account', 30), C('v', 'Vendor', 22), C('p', 'Project', 12), C('amt', 'Amount (USD)', 17, 'money'), C('s', 'Selection', 10), TRACE], rows, undefined, [{ style: 'total', cells: ['Total', null, null, null, null, null, v.population.totalUsd, `${sel.size} selected`, null] }])],
      `${v.population.rowCount} governed lines · the same population id Sloane and Excel resolve`);
  },
  POPULATION_TIEOUT(s, c) {
    const v = pbcOf(c); const t = v?.tie; if (!t || !v?.requirement) return sheet(c, s, 'TB Tie-Out', [note('No population to tie out.')], 'Population tie-out');
    const q = v.requirement;
    const st: Tone = t.status === 'TIED' ? 'ok' : t.status === 'NOT_TIED' ? 'bad' : 'warn';
    const m = sheet(c, s, `TB Tie-Out · ${q.title}`, [
      kv([['Population (over the threshold)', t.populationUsd], ['+ Items below the threshold', t.belowThresholdUsd], [`= Gross ${q.populationType.toLowerCase()} in ${rangeLabel(q.periodStart, q.periodEnd)}`, t.grossAdditionsUsd], ['+ Other movement (settlements, transfers)', t.otherMovementUsd],
        ['= Net activity (average rates)', t.netActivityUsd], ['Opening balance (closing rates)', t.openingUsd], ['Closing balance (closing rates)', t.closingUsd], ['TB movement', t.tbMovementUsd], ['Translation between average and closing rates', d2(t.tbMovementUsd - t.netActivityUsd)], ['Population difference', t.difference]], 'Population → account activity → governed TB'),
      kv([['ERP source balance', t.bridge.sourceUsd], ['+ FX translation', t.bridge.fxUsd], ['+ Eliminations', t.bridge.eliminationsUsd], ['+ Reporting adjustments', t.bridge.adjustmentsUsd], ['= Final governed balance', t.bridge.finalUsd], ['Korvyn governed TB', t.bridge.governedUsd], ['Difference', t.bridge.differenceUsd], ['Source status', t.bridge.sourceStatus.replace(/_/g, ' ')],
        ...t.bridge.systems.map((x) => [x.system, x.status.replace(/_/g, ' ').toLowerCase()] as [string, Cell])], `ERP → governed bridge for ${q.accounts.join(', ')} at ${monLabel(q.periodEnd)}`),
      ...(t.reasons.length ? [note(t.reasons.join(' '))] : [])], 'Tie-out read from the governed ledger and the ERP tie-out service');
    m.status = { text: `TIE-OUT: ${t.status.replace(/_/g, ' ')}${t.status === 'TIED' ? '' : ' — the population is not complete as an audit population until it ties'}`, tone: st };
    return m;
  },
  AUDIT_SELECTIONS(s, c) {
    const v = pbcOf(c); if (!v) return sheet(c, s, 'Selections', [note('No PBC request in focus.')], 'Selections');
    const types = (v.requirement?.requiredEvidence ?? []).filter((e) => e !== 'SOURCE_TRANSACTION');
    const rows: Row[] = v.selections.map((x) => ({ cells: [x.no, x.source === 'AUDITOR' ? 'Auditor' : x.method, x.original, x.status.replace(/_/g, ' '), x.line?.key ?? (x.candidates.length ? `${x.candidates.length} candidates` : null), x.line?.entity ?? null, x.line ? utc(x.line.postingDate) : null, x.line ? gv(x.line) : null, x.line ? d2(x.line.usd) : x.identifiers.amount ?? null,
      ...types.map((t) => x.evidence.find((e) => e.type === t)?.status.replace(/_/g, ' ') ?? (x.line ? '—' : null)), x.coverage ?? 'not matched', x.reason, x.trace[1] ?? x.trace[0]!] as Cell[] }));
    return sheet(c, s, `Selections · ${v.body.pbcNumber}`, [table([C('n', 'Sel #', 7, 'int'), C('src', 'Source / Method', 18), C('o', 'Original Reference', 38), C('m', 'Match', 16), C('t', 'Transaction', 16), C('e', 'Entity', 10), C('d', 'Posting Date', 12, 'date'), C('v', 'Vendor', 22), C('a', 'Amount (USD)', 17, 'money'),
      ...types.map((t) => C(t, EV_LABEL[t] ?? t, 14)), C('cv', 'Coverage', 13), C('r', 'Reason', 44), TRACE], rows)], `${rows.length} selections · the auditor's original reference kept verbatim`);
  },
  EVIDENCE_MANIFEST(s, c) {
    const v = pbcOf(c); if (!v) return sheet(c, s, 'Evidence Manifest', [note('No PBC request in focus.')], 'Evidence manifest');
    const recOf = (x: { line: { entity: string; group: string } | null }) => (x.line ? c.env.controls.recDef(`REC-${x.line.entity}-${x.line.group}`)?.id ?? null : null);
    const rows: Row[] = [];
    for (const x of v.selections) for (const e of x.evidence) {
      const conn = e.document === 'REFERENCE_AVAILABLE' || e.document === 'EXTERNAL_RETRIEVAL_REQUIRED' ? DOC_NOTE(e.sourceSystem, e.type) : e.document === 'MISSING' ? 'Nothing to retrieve' : '—';
      rows.push({ cells: [x.no, x.line?.key ?? null, e.evidenceId ?? e.reference, EV_LABEL[e.type] ?? e.type, e.status.replace(/_/g, ' '), e.sourceSystem, e.reference, e.document.replace(/_/g, ' '), conn, recOf(x), x.line ? `FLUX-${x.line.group}-${x.line.period}` : null, e.trace] });
      c.citations.push({ type: 'EVIDENCE_RELATIONSHIPS', id: e.trace, version: c.env.gl ? relVersion(e.trace) : 0, label: `evidence on ${e.trace}` });
    }
    /* one citation per transaction, not per row */
    const seen = new Set<string>(); for (let i = c.citations.length - 1; i >= 0; i--) { const k = `${c.citations[i]!.type}:${c.citations[i]!.id}`; if (seen.has(k)) c.citations.splice(i, 1); else seen.add(k); }
    return sheet(c, s, `Evidence Manifest · ${v.body.pbcNumber}`, [table([C('n', 'Selection', 9, 'int'), C('t', 'Transaction ID', 16), C('id', 'Evidence ID', 22), C('ty', 'Evidence Type', 18), C('st', 'Status', 13), C('ss', 'Source System', 18), C('ref', 'Document Reference', 24), C('av', 'Availability', 26), C('rt', 'Retrieval', 48), C('rc', 'Related Reconciliation', 20), C('fx', 'Related Flux', 20), TRACE], rows),
      note('The manifest lists what Korvyn knows about each document. REFERENCE AVAILABLE means Korvyn holds the reference, not the file: no document connector is live in this phase, so every document is retrieved from its source system.')], `${rows.length} evidence rows`);
  },
  SUPPORT_GAPS(s, c) {
    const v = pbcOf(c); if (!v) return sheet(c, s, 'Exceptions', [note('No PBC request in focus.')], 'Exceptions');
    const g = [...v.gaps].sort((a, b) => (a.status === 'OPEN' ? 0 : 1) - (b.status === 'OPEN' ? 0 : 1) || b.amountUsd - a.amountUsd);
    const rows: Row[] = g.map((x) => ({ cells: [x.kind, x.selectionNo, x.transactionId, x.requirement === 'SELECTION' ? 'Selection' : EV_LABEL[x.requirement] ?? x.requirement, x.amountUsd, x.severity, x.owner, x.status, x.resolution ?? x.note, x.transactionId ? `txn:${x.transactionId}` : `pbc:${v.id}#${x.selectionNo}`] }));
    const open = g.filter((x) => x.status === 'OPEN');
    return sheet(c, s, `Exceptions · ${v.body.pbcNumber}`, [table([C('k', 'Gap', 30), C('n', 'Selection', 9, 'int'), C('t', 'Transaction', 16), C('r', 'Requirement', 18), C('a', 'Amount (USD)', 17, 'money'), C('sv', 'Severity', 9), C('o', 'Owner', 14), C('st', 'Status', 10), C('res', 'Resolution / Detail', 50), TRACE], rows, undefined,
      [{ style: 'total', cells: ['Open', open.length, null, null, d2(open.reduce((t, x) => t + x.amountUsd, 0)), null, null, null, null, null] }])], `${open.length} open · ${g.length - open.length} resolved or waived`);
  },

  /* ---- PBC (scaffold) ------------------------------------------------------------------------- */
  PBC_REQUESTS(s, c) {
    const rows = c.env.controls.pbc().map((r) => ({ cells: [r.id, r.title, r.requestedBy, r.owner, r.due, r.status, r.populationId, `pbc:${r.id}`] as Cell[] }));
    return sheet(c, s, 'PBC Requests', [table([C('id', 'Request', 14), C('t', 'Title', 50), C('rb', 'Requested By', 18), C('o', 'Owner', 14), C('d', 'Due', 12), C('s', 'Status', 13), C('p', 'Population', 20), TRACE], rows), note('Scaffold: PBC requests are listed as recorded. Interpreting an auditor’s request file and assembling its responses is not automated in this phase.')], `${rows.length} requests in the work store`);
  },
};

/* ---- 5A helpers ---- */
const EV_LABEL: Record<string, string> = { INVOICE: 'Invoice', PO: 'Purchase order', CONTRACT: 'Contract', CHANGE_ORDER: 'Change order', APPROVAL: 'Approval', RECEIPT: 'Receipt', WORKPAPER: 'Workpaper', RECONCILIATION: 'Reconciliation', FLUX_EXPLANATION: 'Flux explanation', POLICY: 'Policy', SOURCE_TRANSACTION: 'ERP source transaction', OTHER: 'Other support' };
const pbcCache = new WeakMap<SectionCtx, ReturnType<NonNullable<ComposeEnv['audit']>['evaluate']>>();
function pbcOf(c: SectionCtx) { const id = c.d.focus?.pbcRequestId; if (!id || !c.env.audit) return null; if (!pbcCache.has(c)) pbcCache.set(c, c.env.audit.evaluate(id, c.vis, { selections: c.d.filters?.selections })); return pbcCache.get(c) ?? null; }
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const usdFmt = (v: number) => `${v < 0 ? '(' : ''}$${(Math.abs(v) / 1e6).toFixed(2)}M${v < 0 ? ')' : ''}`;
const gv = (l: GLine) => glxVendor(l);
function glxVendor(l: GLine) { return l.vendor; }
const relVersion = (trace: string) => WORK.relationshipVersion(trace);
const DOC_NOTE = (system: string, type: string) => `External retrieval — ${system} ${type === 'RECONCILIATION' || type === 'FLUX_EXPLANATION' ? 'record in Korvyn' : 'document not connected'}`;

export function traceOf(kind: string, ref: string, period: string) {
  if (/RECONCILIATION/.test(kind)) return `recon:${ref}:${period}`;
  if (/FLUX/.test(kind)) return ref.startsWith('FLUX-') ? `flux:${ref.split('-')[1]}:${period}` : `flux:${ref}`;
  if (/TASK|CLOSE/.test(kind)) return `close:${ref}:${period}`;
  if (/SOURCE/.test(kind)) return `source:${ref}`;
  return ref;
}

/** entities whose close work is COMPLETE — every reconciliation tied and approved, no blocker, nothing pending — derived */
export function completeEntities(env: ComposeEnv, period: string, entityIds: string[]): string[] {
  const blockers = env.controls.closeBlockers(period, 'ALL'), pending = env.controls.pendingApprovals(period, 'ALL');
  return entityIds.filter((e) => {
    const recs = env.controls.reconciliations(period, new Set([e])).filter((r) => r.entity === e);
    return recs.length > 0 && recs.every((r) => r.tieStatus === 'TIED' && r.workflow.status === 'APPROVED') && !blockers.some((b) => b.entity === e) && !pending.some((p) => p.entity === e);
  });
}

/** the deterministic name of a definition, by type: its period, what it is about, and its threshold */
export function nameFor(d: ArtifactDefinition, env: { recName: (id: string) => string | null; acctName: (code: string) => string | null; pbcName?: (id: string) => string | null }): string {
  const tok = periodToken(d.periodStart, d.periodEnd), mon = monLabel(d.periodEnd), t = d.type ?? 'GL_EXTRACT';
  const g = d.sheets.find((s) => s.kind === 'GL') as { filter?: { minAbsUsd?: number; vendor?: string } } | undefined;
  const m = g?.filter?.minAbsUsd;
  const thr = m ? ` over $${m >= 1e6 ? `${+(m / 1e6).toFixed(2)}M` : `${Math.round(m / 1e3)}K`}` : '';
  const vendor = d.focus?.vendor ?? g?.filter?.vendor;
  switch (t) {
    case 'CLOSE_REVIEW_PACKAGE': return `${mon} Close Review Package`;
    case 'MANAGEMENT_REVIEW_PACKAGE': return `${mon} Management Review Package`;
    case 'RECONCILIATION_PACKAGE': return `${mon} ${env.recName(d.focus?.reconciliationId ?? '') ?? 'Reconciliation'} Reconciliation Package`;
    case 'FLUX_PACKAGE': return `${mon} ${env.acctName(d.focus?.account ?? '') ?? 'Flux'} Flux Package`;
    case 'SUPPORT_PACKAGE': return `${tok} ${vendor ?? 'Vendor'} Support Package${thr}`;
    case 'AUDIT_SUPPORT_PACKAGE': return `${tok} Audit GL Extract`;
    case 'FINANCIAL_REPORT_PACKAGE': return `${rangeLabel(d.periodStart, d.periodEnd)} Monthly Financial Package`;
    case 'PBC_PACKAGE': return `${env.pbcName?.(d.focus?.pbcRequestId ?? '') ?? `${tok} PBC`} Package`;
    case 'EXCEL_WORKBOOK': return `${mon} ${d.sheets.map((x) => x.name).slice(0, 3).join(', ')} Workbook`;
    default: {
      const audit = d.sheets.some((s) => s.kind === 'TB') && d.sheets.some((s) => s.kind === 'TIEOUT');
      if (vendor) return `${tok} ${vendor} GL${thr}`;
      return d.template === 'AUDIT_GL_PACKAGE' && audit ? `${tok} Audit GL Package${thr}` : `${tok} Governed GL${thr}`;
    }
  }
}
export const sectionName = (t: ArtifactType | undefined, k: SheetKind) => (t && TEMPLATE_NAMES[t]?.[k]) ?? SHEET_NAMES[k];
export const shortHash = (x: unknown) => createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 10).toUpperCase();
