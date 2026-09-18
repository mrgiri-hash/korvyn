/**
 * THE EXCEL COMPOSITION ENGINE — ArtifactDefinition → WorkbookModel.
 *
 * ONE model drives both the preview and the file: the preview reads the first rows of each sheet's row source, the
 * renderer streams all of them. Rows are produced in CHUNKS from the governed population (never materialised as a
 * workbook-sized array for the browser), and a GL sheet that would exceed Excel's row limit is PARTITIONED into
 * "Governed GL", "Governed GL (2)", … by the same row source.
 *
 * Nothing here computes a figure of its own: GL rows are governed lines, TB and tie-out rows come from the tie-out
 * service, reconciliation rows from the server reconciliation balance (id + version), Flux rows from the one
 * authoritative explanation record (id + version).
 */
import { createHash } from 'node:crypto';
import type { ControlService } from '../controls.js';
import type { FinancialDataService } from '../financials.js';
import { type GLine, type GovernedLedger, type PopulationDef, SOURCE_HEALTH } from '../governed.js';
import { FLUX_LINE_ACCOUNTS } from '../book.js';
import { WORK } from '../store.js';
import { type ArtifactDefinition, type ColFormat, EXCEL_MAX_ROWS, GL_COLUMN, type GLSheetDef, SHEET_NAME_MAX, type SheetDef, fileNameOf, monLabel, periodToken, rangeLabel, scopeLabel } from './model.js';
import { type TieOutResult, type TieOutService, MAPPING_VERSION } from './tieout.js';

export type Cell = string | number | Date | null;
export type RowStyle = 'data' | 'total' | 'subtotal' | 'label' | 'note';
export interface Row { cells: Cell[]; style?: RowStyle }
export interface ColumnSpec { key: string; header: string; width: number; format: ColFormat }
export interface Block { heading?: string; columns: ColumnSpec[]; rowCount: number; chunks: () => Iterable<Row[]>; totals?: Row[]; tabular: boolean }
export type Tone = 'ok' | 'warn' | 'bad' | 'info';
export interface SheetModel { name: string; kind: SheetDef['kind']; title: string[]; status: { text: string; tone: Tone } | null; blocks: Block[]; rowCount: number; populationId: string | null; part: { index: number; of: number } | null }
export interface Citation { type: 'RECONCILIATION_BALANCE' | 'FLUX_EXPLANATION'; id: string; version: number | null; label: string }
export interface PopulationPin { sheet: string; populationId: string; populationVersion: string; rowCount: number; debitUsd: number; creditUsd: number; netUsd: number; contentHash: string }
export interface WorkbookModel {
  fileName: string; csvFileName: string; title: string; scopeLabel: string; rangeLabel: string;
  sheets: SheetModel[]; tieOut: TieOutResult | null; populations: PopulationPin[]; citations: Citation[]; sourceSystems: string[];
  excluded: { label: string; reason: string }[]; warnings: string[]; auditReady: boolean; totalRows: number; dataVersion: string;
}
export interface ComposeEnv { data: FinancialDataService; gl: GovernedLedger; controls: ControlService; tie: TieOutService; visible: Set<string> | 'ALL'; maxRowsPerSheet?: number; chunkSize?: number }

const TITLE_ROWS = 4;               // title · context · provenance · (status or blank) — then a blank row and the header
const HEADER_OFFSET = TITLE_ROWS + 2;
const d2 = (v: number) => Math.round(v * 100) / 100;
const utcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/* ---- governed dimensions: Source / Governed / Effective ------------------------------------------ */
/** governed vendor overrides recorded against a governed line (none are approved in the server book today) */
function governedVendors(): Map<string, string> {
  return new Map(WORK.repos.records.list<{ dimension: string; value: string }>('GOVERNED_DIMENSION').filter((r) => r.dimension === 'vendor' && r.target).map((r) => [r.target!.replace(/^txn:/, ''), r.value]));
}
export function glCell(l: GLine, key: string, gv: Map<string, string>): Cell {
  switch (key) {
    case 'postingDate': return utcDate(l.postingDate);
    case 'period': return monLabel(l.period);
    case 'journal': return l.journalId;
    case 'journalLine': return l.lineNo;
    case 'entryNo': return l.entryNo;
    case 'accountNumber': return l.account;
    case 'accountDescription': return l.accountName;
    case 'accountGroup': return `${l.group} ${l.groupName}`;
    case 'entity': return l.entity;
    case 'entityName': return l.entityName;
    case 'sourceVendor': return l.vendor;
    case 'governedVendor': return gv.get(l.key) ?? null;
    case 'vendor': return gv.get(l.key) ?? l.vendor;
    case 'department': return null;
    case 'costCenter': return l.costCenter;
    case 'project': return l.project;
    case 'property': return l.property;
    case 'description': return l.description;
    case 'debit': return l.usd > 0 ? d2(l.usd) : null;
    case 'credit': return l.usd < 0 ? d2(-l.usd) : null;
    case 'netAmount': return d2(l.usd);
    case 'currency': return 'USD';
    case 'localAmount': return d2(l.local);
    case 'localCurrency': return l.currency;
    case 'erp': return SOURCE_HEALTH[l.connector]?.system ?? l.connector;
    case 'erpReference': return l.externalId;
    case 'recordType': return l.recordType;
    case 'invoiceRef': return l.invoiceRef;
    case 'poRef': return l.poRef;
    case 'approvalRef': return l.approvalRef;
    default: return null;
  }
}
/** the header a column carries in THIS workbook: "Vendor" becomes "Effective Vendor" beside its source and governed forms */
function headerOf(key: string, cols: string[]) {
  if (key === 'vendor' && (cols.includes('sourceVendor') || cols.includes('governedVendor'))) return 'Effective Vendor';
  return GL_COLUMN(key)?.header ?? key;
}

/* ---- the GL population a GL sheet presents ------------------------------------------------------- */
export function glPopulation(env: ComposeEnv, d: ArtifactDefinition, s: GLSheetDef) {
  const scope = env.data.scope(d.scopeId)!;
  const filter = { ...s.filter, periodStart: d.periodStart, periodEnd: d.periodEnd, ...(scope.kind === 'GROUP' ? {} : { entities: scope.entityIds }) };
  const def = env.gl.definePopulation(filter, s.sort, `${d.name} · ${s.name}`);
  const q = env.gl.query(def, env.visible, { limit: 1 });
  const h = createHash('sha1');
  for (const l of q.all) h.update(`${l.key}:${l.usd.toFixed(2)}|`);
  return { def, rows: q.all, pin: { sheet: s.name, populationId: def.id, populationVersion: env.gl.dataVersion(), rowCount: q.rowCount, debitUsd: d2(q.debitUsd), creditUsd: d2(q.creditUsd), netUsd: d2(q.netUsd), contentHash: h.digest('hex').slice(0, 16).toUpperCase() } };
}
function* chunked<T, R>(items: readonly T[], size: number, map: (x: T) => R) { for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size).map(map); }

/** the account groups a GL population touches — what "related" means for reconciliations and Flux */
function groupsOf(env: ComposeEnv, rows: readonly GLine[]) { return new Set(rows.map((l) => l.group)); }

/* ================================================================================================
   COMPOSE
   ================================================================================================ */
export function composeWorkbook(env: ComposeEnv, d: ArtifactDefinition, opts: { version: number; artifactId: string; generatedAt?: string } = { version: 1, artifactId: 'DRAFT' }): WorkbookModel {
  const scope = env.data.scope(d.scopeId);
  if (!scope) throw new Error(`unknown scope ${d.scopeId}`);
  const sLabel = scopeLabel(d.scopeId, scope.name), rLabel = rangeLabel(d.periodStart, d.periodEnd), tok = periodToken(d.periodStart, d.periodEnd);
  const chunk = env.chunkSize ?? 5_000, maxRows = env.maxRowsPerSheet ?? EXCEL_MAX_ROWS;
  const hasTie = d.sheets.some((s) => s.kind === 'TIEOUT');
  const tie = hasTie || d.sheets.some((s) => s.kind === 'TB' || s.kind === 'SUMMARY') ? env.tie.tieOut(d.scopeId, d.periodEnd) : null;
  const auditReady = hasTie && tie?.status === 'TIED';
  const statusLine = tie && hasTie ? statusOf(tie) : null;
  const ctx = `${sLabel} · ${rLabel} · USD · ${d.basis}`;
  const gv = governedVendors();
  const sheets: SheetModel[] = [], populations: PopulationPin[] = [], citations: Citation[] = [], excluded: WorkbookModel['excluded'] = [], warnings: string[] = [...d.notes];
  const relatedGroups = new Set<string>();
  const glPops = new Map<string, ReturnType<typeof glPopulation>>();
  /* with a GL tab, "related" means related to ITS population — an empty population relates to nothing, never to everything */
  const hasGl = d.sheets.some((s) => s.kind === 'GL');
  for (const s of d.sheets) if (s.kind === 'GL') { const p = glPopulation(env, d, s); glPops.set(s.name, p); populations.push(p.pin); groupsOf(env, p.rows).forEach((g) => relatedGroups.add(g)); }
  const provenance = (extra: string) => `${extra} · Generated from governed Korvyn data · ${d.name} v${opts.version}`;
  const used = new Set<string>();
  const sheetName = (n: string) => { let x = n.slice(0, SHEET_NAME_MAX), i = 2; while (used.has(x)) x = `${n.slice(0, SHEET_NAME_MAX - 4)} (${i++})`; used.add(x); return x; };

  for (const s of d.sheets) {
    if (s.kind === 'GL') {
      const p = glPops.get(s.name)!;
      const cols: ColumnSpec[] = s.columns.map((k) => ({ key: k, header: headerOf(k, s.columns), width: GL_COLUMN(k)?.width ?? 14, format: GL_COLUMN(k)?.format ?? 'text' }));
      const title = s.name === 'Governed GL' ? `${tok} Governed GL` : s.name;
      /* partition at Excel's row limit: the header block and a totals row are counted against every sheet */
      const per = Math.max(1, maxRows - HEADER_OFFSET - 2);
      const parts = Math.max(1, Math.ceil(p.rows.length / per));
      if (parts > 1) warnings.push(`${s.name}: ${p.rows.length.toLocaleString('en-US')} lines exceed Excel's ${maxRows.toLocaleString('en-US')}-row sheet limit and are partitioned across ${parts} worksheets.`);
      const money = (k: string) => cols.findIndex((c) => c.key === k);
      for (let i = 0; i < parts; i++) {
        const slice = p.rows.slice(i * per, (i + 1) * per);
        const last = i === parts - 1;
        const tot: Row = { style: 'total', cells: cols.map((c, j) => j === 0 ? `Total — ${p.rows.length.toLocaleString('en-US')} lines` : c.key === 'debit' ? p.pin.debitUsd : c.key === 'credit' ? p.pin.creditUsd : c.key === 'netAmount' ? p.pin.netUsd : null) };
        sheets.push({ name: sheetName(i === 0 ? s.name : `${s.name} (${i + 1})`), kind: 'GL', populationId: p.def.id, rowCount: slice.length, part: parts > 1 ? { index: i + 1, of: parts } : null,
          title: [parts > 1 ? `${title} (${i + 1} of ${parts})` : title, ctx, provenance(parts > 1 ? `Lines ${(i * per + 1).toLocaleString('en-US')}–${(i * per + slice.length).toLocaleString('en-US')} of ${p.rows.length.toLocaleString('en-US')}` : `${p.rows.length.toLocaleString('en-US')} lines · population ${p.def.id}`)],
          status: statusLine, blocks: [{ columns: cols, rowCount: slice.length, tabular: true, chunks: () => chunked(slice, chunk, (l) => ({ cells: s.columns.map((k) => glCell(l, k, gv)) })), totals: last && money('netAmount') >= 0 || last && money('debit') >= 0 ? [tot] : [] }] });
      }
    } else if (s.kind === 'TB') {
      const rows = env.tie.governedTrialBalance(d.scopeId, d.periodEnd, s.byEntity);
      const cols: ColumnSpec[] = [...(s.byEntity ? [{ key: 'entity', header: 'Entity', width: 14, format: 'text' as const }] : []),
        { key: 'account', header: 'Account Number', width: 11, format: 'text' }, { key: 'name', header: 'Account Description', width: 34, format: 'text' },
        { key: 'debit', header: 'Debit', width: 17, format: 'money' }, { key: 'credit', header: 'Credit', width: 17, format: 'money' }, { key: 'net', header: 'Net', width: 17, format: 'money' },
        { key: 'currency', header: 'Currency', width: 9, format: 'text' }, { key: 'group', header: 'Korvyn Mapping (Account Group)', width: 32, format: 'text' }, { key: 'section', header: 'Statement', width: 16, format: 'text' }];
      const dr = rows.reduce((t, r) => t + (r.net > 0 ? r.net : 0), 0), cr = rows.reduce((t, r) => t + (r.net < 0 ? -r.net : 0), 0);
      const data = rows.map((r) => ({ cells: [...(s.byEntity ? [r.entity] : []), r.account, r.name, r.net > 0 ? d2(r.net) : null, r.net < 0 ? d2(-r.net) : null, d2(r.net), 'USD', r.group, r.section] as Cell[] }));
      const label = s.byEntity ? ['Total', null] : ['Total', null];
      sheets.push({ name: sheetName(s.name), kind: 'TB', populationId: null, rowCount: rows.length, part: null,
        title: [`${tok} Trial Balance · as of ${monLabel(d.periodEnd)}`, ctx, provenance(`${rows.length} rows · governed TB through ${monLabel(d.periodEnd)}${s.byEntity ? ' · by entity, with eliminations and translation as rows' : ' · consolidated, eliminated'}`)],
        status: statusLine, blocks: [{ columns: cols, rowCount: data.length, tabular: true, chunks: () => [data], totals: [{ style: 'total', cells: [...(s.byEntity ? ['Total'] : []), s.byEntity ? null : label[0], null, d2(dr), d2(cr), d2(dr - cr), 'USD', null, null] }] }] });
    } else if (s.kind === 'TIEOUT') {
      sheets.push(tieSheet(sheetName(s.name), tie!, d, ctx, provenance, opts.generatedAt));
    } else if (s.kind === 'RECONCILIATIONS') {
      const scopeEnts = new Set(scope.entityIds);
      const defs = env.controls.allRecDefs().filter((r) => (r.entity === 'GROUP' ? scope.kind === 'GROUP' && env.visible === 'ALL' : scopeEnts.has(r.entity) && (env.visible === 'ALL' || env.visible.has(r.entity))));
      const grpOf = (a: string) => env.gl.account(a)?.parent ?? a;
      const relatedTo = (accts: string[]) => !hasGl || accts.some((a) => relatedGroups.has(grpOf(a)) || relatedGroups.has(a) || env.gl.expandAccounts([a]).some((x) => relatedGroups.has(grpOf(x))));
      const moduleRelated = (lineId: string | null | undefined) => !!lineId && (!hasGl || (FLUX_LINE_ACCOUNTS[lineId] ?? []).some((a) => relatedGroups.has(a)));
      const rows: Row[] = [];
      for (const def of defs) {
        const isRelated = def.method === 'MODULE' ? moduleRelated(def.financialLineId) : relatedTo(def.accounts);
        if (!isRelated) continue;
        const b = env.controls.reconBalance(def, d.periodEnd);
        if (!b.available) { excluded.push({ label: `${def.name} (${def.id})`, reason: b.reason }); continue; }
        citations.push({ type: 'RECONCILIATION_BALANCE', id: b.id, version: b.version, label: def.name });
        rows.push({ cells: [def.name, def.id, def.accounts.map((a) => `${a} ${env.gl.account(a)?.name ?? ''}`.trim()).join(', '), def.entity === 'GROUP' ? 'Corporate Consolidated' : def.entity, b.method, b.glBalanceUsd, b.supportingBalanceUsd, b.supportingLabel, b.differenceUsd, b.tieStatus.replace(/_/g, ' '), b.workflowStatus.replace(/_/g, ' '), b.preparer, b.reviewer, `${b.id} v${b.version}`] });
      }
      const cols: ColumnSpec[] = [{ key: 'name', header: 'Reconciliation', width: 34, format: 'text' }, { key: 'id', header: 'Reconciliation ID', width: 20, format: 'text' }, { key: 'accounts', header: 'Account / Group', width: 30, format: 'text' }, { key: 'scope', header: 'Scope', width: 14, format: 'text' }, { key: 'method', header: 'Method', width: 12, format: 'text' },
        { key: 'gl', header: 'GL Balance', width: 17, format: 'money' }, { key: 'sup', header: 'Supporting Balance', width: 17, format: 'money' }, { key: 'supSrc', header: 'Supporting Source', width: 40, format: 'text' }, { key: 'diff', header: 'Difference', width: 15, format: 'money' },
        { key: 'tie', header: 'Tie Status', width: 16, format: 'text' }, { key: 'status', header: 'Review Status', width: 15, format: 'text' }, { key: 'prep', header: 'Preparer', width: 12, format: 'text' }, { key: 'rev', header: 'Reviewer', width: 12, format: 'text' }, { key: 'rec', header: 'Balance Record', width: 26, format: 'text' }];
      const blocks: Block[] = [{ columns: cols, rowCount: rows.length, tabular: true, chunks: () => [rows] }];
      const ex = excluded.filter((x) => defs.some((r) => x.label.endsWith(`(${r.id})`)));
      if (ex.length) blocks.push({ heading: 'Not included — balance is not server-authoritative', columns: [{ key: 'r', header: 'Reconciliation', width: 34, format: 'text' }, { key: 'w', header: 'Reason', width: 90, format: 'text' }], rowCount: ex.length, tabular: false, chunks: () => [ex.map((x) => ({ style: 'note' as const, cells: [x.label, x.reason] }))] });
      sheets.push({ name: sheetName(s.name), kind: 'RECONCILIATIONS', populationId: null, rowCount: rows.length, part: null, status: statusLine,
        title: [`Reconciliations · ${monLabel(d.periodEnd)}`, ctx, provenance(`${rows.length} reconciliations cited by balance record (id + version)${hasGl ? ' · related to the GL population' : ''}`)], blocks });
    } else if (s.kind === 'FLUX') {
      const vis = scope.kind === 'GROUP' ? env.visible : new Set(scope.entityIds);
      const items = env.controls.fluxItems(d.periodEnd, vis).filter((i) => !hasGl || relatedGroups.has(i.account));
      const rows: Row[] = items.map((i) => {
        if (i.explanation) citations.push({ type: 'FLUX_EXPLANATION', id: i.explanation.id, version: i.explanation.version, label: i.name });
        const pctv = Math.abs(i.priorUsd) < 0.5 ? null : (i.currentUsd - i.priorUsd) / Math.abs(i.priorUsd);
        return { cells: [i.name, d2(i.currentUsd), d2(i.priorUsd), d2(i.changeUsd), pctv, i.material ? 'Material' : 'Below threshold', i.status.replace(/_/g, ' '), i.explanation?.text ?? null, i.explanation?.author ?? null, i.reviewer, i.explanation ? `${i.explanation.id} v${i.explanation.version}` : null] };
      });
      const prior = env.gl.priorPeriod(d.periodEnd);
      const cols: ColumnSpec[] = [{ key: 'grp', header: 'Account / Group', width: 32, format: 'text' }, { key: 'cur', header: `Current (${monLabel(d.periodEnd)})`, width: 17, format: 'money' }, { key: 'pri', header: `Prior (${prior ? monLabel(prior) : 'n/a'})`, width: 17, format: 'money' }, { key: 'var', header: 'Variance', width: 16, format: 'money' }, { key: 'pct', header: 'Variance %', width: 11, format: 'pct' },
        { key: 'mat', header: 'Materiality', width: 15, format: 'text' }, { key: 'st', header: 'Status', width: 14, format: 'text' }, { key: 'ex', header: 'Explanation', width: 70, format: 'text' }, { key: 'au', header: 'Author', width: 14, format: 'text' }, { key: 'rv', header: 'Reviewer', width: 12, format: 'text' }, { key: 'rec', header: 'Explanation Record', width: 26, format: 'text' }];
      sheets.push({ name: sheetName(s.name), kind: 'FLUX', populationId: null, rowCount: rows.length, part: null, status: statusLine,
        title: [`Flux · ${monLabel(d.periodEnd)} vs ${prior ? monLabel(prior) : 'n/a'}`, ctx, provenance(`${rows.length} lines · explanations read from the governed record (id + version) at generation`)], blocks: [{ columns: cols, rowCount: rows.length, tabular: true, chunks: () => [rows] }] });
    } else if (s.kind === 'SUMMARY') {
      const kv = (k: string, v: Cell): Row => ({ style: 'label', cells: [k, v] });
      const pops = [...glPops.values()];
      const rows: Row[] = [kv('Scope', `${sLabel} (${scope.entityIds.length} entities)`), kv('Period', rLabel), kv('Currency · basis', `USD · ${d.basis}`),
        ...pops.flatMap((p) => [kv(`${p.pin.sheet} — lines`, p.pin.rowCount.toLocaleString('en-US')), kv(`${p.pin.sheet} — total debits`, p.pin.debitUsd), kv(`${p.pin.sheet} — total credits`, p.pin.creditUsd), kv(`${p.pin.sheet} — net`, p.pin.netUsd), kv(`${p.pin.sheet} — population`, p.pin.populationId)]),
        kv('Source systems', sourceSystemsOf(env, d.scopeId).join('; ')), kv('Tie-out status', tie ? `${tie.status.replace(/_/g, ' ')}${tie.differenceUsd >= 0.005 ? ` — difference ${tie.differenceUsd.toFixed(2)}` : ''}` : 'No tie-out in this workbook'),
        kv('Governed data version', env.gl.dataVersion()), kv('Mapping version', MAPPING_VERSION)];
      sheets.push({ name: sheetName(s.name), kind: 'SUMMARY', populationId: null, rowCount: rows.length, part: null, status: statusLine, title: [`${d.name} — Summary`, ctx, provenance('Summary')],
        blocks: [{ columns: [{ key: 'k', header: 'Item', width: 34, format: 'text' }, { key: 'v', header: 'Value', width: 44, format: 'money' }], rowCount: rows.length, tabular: false, chunks: () => [rows] }] });
    }
  }
  if (tie && !hasTie && d.sheets.some((s) => s.kind === 'TB')) warnings.push('The workbook has no Tie-Out sheet, so it is not labelled audit-ready.');
  const scopeName = scope.name;
  return {
    fileName: fileNameOf(d, scopeName, 'xlsx'), csvFileName: fileNameOf(d, scopeName, 'csv'), title: d.name, scopeLabel: sLabel, rangeLabel: rLabel,
    sheets, tieOut: tie, populations, citations, sourceSystems: sourceSystemsOf(env, d.scopeId), excluded, warnings: [...new Set(warnings)], auditReady,
    totalRows: sheets.reduce((t, s) => t + s.rowCount, 0), dataVersion: env.gl.dataVersion(),
  };
}

export function sourceSystemsOf(env: ComposeEnv, scopeId: string) {
  const s = env.data.scope(scopeId)!;
  return [...new Set(env.gl.entities().filter((e) => s.entityIds.includes(e.id)).map((e) => { const h = SOURCE_HEALTH[e.connector]; return h ? `${h.system} ${h.instance} (${h.status.toLowerCase()})` : e.connector; }))];
}
export function statusOf(t: TieOutResult): { text: string; tone: Tone } {
  const diff = t.differenceUsd >= 0.005 ? ` — difference ${t.differenceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD` : '';
  if (t.status === 'TIED') return { text: 'STATUS: TIED — the governed TB agrees with every source ERP TB. Audit-ready.', tone: 'ok' };
  if (t.status === 'NOT_TIED') return { text: `STATUS: NOT TIED${diff}. This workbook is NOT audit-ready — see Tie-Out.`, tone: 'bad' };
  if (t.status === 'SOURCE_UNAVAILABLE') return { text: 'STATUS: SOURCE UNAVAILABLE — no source ERP TB could be validated. Not audit-ready.', tone: 'bad' };
  return { text: `STATUS: PARTIALLY VALIDATED — ${t.sources.filter((s) => s.result !== 'TIED').map((s) => s.system).join(', ')} could not be validated against a live source. Not audit-ready — see Tie-Out.`, tone: 'warn' };
}

/* ---- the Tie-Out sheet ----------------------------------------------------------------------------- */
function tieSheet(name: string, t: TieOutResult, d: ArtifactDefinition, ctx: string, provenance: (x: string) => string, generatedAt?: string): SheetModel {
  const kv = (k: string, v: Cell): Row => ({ style: 'label', cells: [k, v] });
  const context: Row[] = [kv('Period', `Through ${monLabel(t.periodEnd)} (${rangeLabel(d.periodStart, d.periodEnd)})`), kv('Scope', `${ctx.split(' · ')[0]} · ${t.entityIds.length} entities`), kv('Currency', 'USD (balance sheet at the period-end closing rate; income statement at monthly average rates)'),
    kv('Source systems', t.sources.map((s) => `${s.system} ${s.instance} — ${s.sourceStatus.toLowerCase()}`).join('; ')), kv('Governed data version', t.dataVersion), kv('Source ERP data version', t.sourceDataVersion),
    kv('Mapping version', t.mappingVersion), kv('FX rate sets', t.fxRateSets.join(', ')), kv('Generated', generatedAt ?? t.computedAt), kv('Result', t.status.replace(/_/g, ' '))];
  const bySource: Row[] = t.sources.flatMap((s) => [
    { cells: [s.system, s.instance, s.entities.map((e) => e.id).join(', '), s.sourceStatus, d2(s.sourceDebitsUsd), d2(s.sourceCreditsUsd), d2(s.governedDebitsUsd), d2(s.governedCreditsUsd), d2(s.differenceUsd), s.result.replace(/_/g, ' '), s.note] as Cell[] },
    ...s.entities.map((e) => ({ style: 'note' as const, cells: [`   ${e.name} — in ${e.currency}`, e.currency, e.id, e.balanced ? 'Source TB balances (Dr = Cr)' : 'SOURCE TB DOES NOT BALANCE', d2(e.localDebits), d2(e.localCredits), null, null, null, `Functional-currency source TB (${e.currency}), not USD`, null] as Cell[] })),
  ]);
  const b = t.bridge;
  const bridge: Row[] = [
    { cells: ['Source ERP TB (all systems, translated to USD) — net', d2(b.sourceNet), 'Translation at mixed rates leaves a net; the CTA below balances it'] },
    { cells: ['FX / translation — cumulative translation adjustment (derived)', d2(b.fxTranslation), 'Derived: balance-sheet accounts at the closing rate, income statement at monthly average rates'] },
    { cells: ['Eliminations — intercompany balances and fees', d2(b.eliminations), 'Both sides inside the scope'] },
    { cells: ['Intercompany elimination difference (unmatched)', d2(b.eliminationDifference), 'Due-from and due-to that do not eliminate to zero'] },
    { cells: ['Reporting adjustments', d2(b.reportingAdjustments), 'None approved in the server book for this scope'] },
    { style: 'subtotal', cells: ['Final governed balance — debits / credits', null, `${fmt(b.finalDebits)} / ${fmt(b.finalCredits)}`] },
    { style: 'subtotal', cells: ['Korvyn governed TB — debits / credits', null, `${fmt(b.governedDebits)} / ${fmt(b.governedCredits)}`] },
    { style: 'total', cells: ['Difference (final governed vs Korvyn governed TB)', d2(b.difference), t.status === 'NOT_TIED' ? 'NOT TIED' : 'Agrees'] },
  ];
  const accts: Row[] = t.accounts.map((r) => ({ cells: [r.account, r.name, d2(r.source), d2(r.fx), d2(r.elim), d2(r.adj), d2(r.final), d2(r.governed), d2(r.difference)] }));
  const sumK = (k: 'source' | 'fx' | 'elim' | 'adj' | 'final' | 'governed' | 'difference') => d2(t.accounts.reduce((s, r) => s + r[k], 0));
  const status = statusOf(t);
  return {
    name, kind: 'TIEOUT', populationId: null, rowCount: t.accounts.length, part: null,
    title: ['ERP Tie-Out', ctx, provenance(`${t.sources.length} source system${t.sources.length > 1 ? 's' : ''} · ${t.accounts.length} accounts`)], status,
    blocks: [
      { heading: 'Context', columns: [{ key: 'k', header: 'Item', width: 30, format: 'text' }, { key: 'v', header: 'Value', width: 60, format: 'text' }], rowCount: context.length, tabular: false, chunks: () => [context] },
      { heading: 'By source system', columns: [{ key: 'sys', header: 'Source system', width: 30, format: 'text' }, { key: 'inst', header: 'Instance', width: 14, format: 'text' }, { key: 'ent', header: 'Entities', width: 22, format: 'text' }, { key: 'st', header: 'Source status', width: 26, format: 'text' },
        { key: 'sd', header: 'Source ERP TB Debits', width: 18, format: 'money' }, { key: 'sc', header: 'Source ERP TB Credits', width: 18, format: 'money' }, { key: 'gd', header: 'Korvyn Governed Debits', width: 18, format: 'money' }, { key: 'gc', header: 'Korvyn Governed Credits', width: 18, format: 'money' }, { key: 'df', header: 'Difference', width: 14, format: 'money' }, { key: 'rs', header: 'Result', width: 30, format: 'text' }, { key: 'nt', header: 'Note', width: 60, format: 'text' }],
        rowCount: bySource.length, tabular: false, chunks: () => [bySource] },
      { heading: 'Consolidated governed result', columns: [{ key: 'b', header: 'Bridge', width: 58, format: 'text' }, { key: 'a', header: 'Amount (USD)', width: 18, format: 'money' }, { key: 'n', header: 'Note', width: 70, format: 'text' }], rowCount: bridge.length, tabular: false, chunks: () => [bridge] },
      { heading: 'By account', columns: [{ key: 'a', header: 'Account', width: 10, format: 'text' }, { key: 'n', header: 'Account Description', width: 40, format: 'text' }, { key: 's', header: 'Source ERP TB', width: 17, format: 'money' }, { key: 'fx', header: 'FX / Translation', width: 16, format: 'money' }, { key: 'el', header: 'Eliminations', width: 16, format: 'money' },
        { key: 'ad', header: 'Reporting Adj.', width: 14, format: 'money' }, { key: 'fi', header: 'Final Governed', width: 17, format: 'money' }, { key: 'go', header: 'Korvyn Governed TB', width: 17, format: 'money' }, { key: 'df', header: 'Difference', width: 14, format: 'money' }],
        rowCount: accts.length, tabular: false, chunks: () => [accts], totals: [{ style: 'total', cells: ['Total', null, sumK('source'), sumK('fx'), sumK('elim'), sumK('adj'), sumK('final'), sumK('governed'), sumK('difference')] }] },
    ],
  };
}
const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export type { PopulationDef };
