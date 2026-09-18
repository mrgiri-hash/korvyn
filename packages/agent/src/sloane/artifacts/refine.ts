/**
 * NATURAL-LANGUAGE REFINEMENT of a workbook DEFINITION. Deterministic and bounded: each clause of the request becomes
 * one structured change (add / remove / move a column, sort, threshold, add / remove a sheet, TB by entity, rename).
 * The model may also pass the structured change directly; both land here, so the same words always make the same
 * change. Nothing is regenerated — the definition changes, and a file is produced only when generation is requested.
 */
import { type ArtifactDefinition, DEFAULT_GL_COLUMNS, GL_COLUMN, type GLRule, type GLSheetDef, SHEET_NAMES, type SheetDef, type SheetKind, columnFor, monLabel } from './model.js';
import { sectionName } from './sections.js';

export interface Refinement { changes: string[]; notes: string[]; validate: boolean; changed: boolean }
export interface StructuredChange {
  addColumns?: string[]; removeColumns?: string[]; move?: { column: string; before?: string; after?: string };
  sort?: GLSheetDef['sort']; minAbsUsd?: number | null; addSheets?: SheetKind[]; removeSheets?: SheetKind[]; tbByEntity?: boolean; name?: string;
  /** 4B: a section placed first, last, or before another */
  moveSheet?: { sheet: SheetKind; to: 'first' | 'last' | { before: SheetKind } };
  /** 4B: a tab of the items at or over an amount */
  itemsOver?: number;
  /** 4B: a GL section presenting the lines behind what the package reports (material items, or items over an amount) */
  glBehind?: { minUsd: number | null };
  excludeCompleteEntities?: boolean;
  periodEnd?: string; scopeId?: string;
}
/** what refinement may resolve names against: the governed periods and scopes */
export interface RefineCtx { periods: string[]; scopes: { id: string; name: string }[] }

const SHEET_WORDS: [RegExp, SheetKind][] = [
  [/\btie.?outs?\b|\bties? (it )?back\b|\btie (it )?(back )?to (the )?erp\b|\bties? to (the )?erp\b|\breconciles? to (the )?erp\b/, 'TIEOUT'],
  [/\btb\b|\btrial balances?\b/, 'TB'], [/\breconciliations?\b|\brecs\b/, 'RECONCILIATIONS'], [/\bflux\b|\bexplanations\b/, 'FLUX'], [/\bsummary\b/, 'SUMMARY'],
  /* 4B — the section library */
  [/\bpending (approvals?|reviews?)\b|\bawaiting (review|approval)\b/, 'PENDING_REVIEW'],
  [/\bunreconciled\b|\b(recs?|reconciliations?|accounts?) (that are )?not tied\b|\buntied\b|\bdo(es)? not tie\b/, 'RECS_NOT_TIED'],
  [/\bblockers?\b|\bblocking items?\b/, 'BLOCKERS'],
  [/\bunexplained (flux|variances?|movements?)\b/, 'UNEXPLAINED_FLUX'],
  [/\bmissing (support|invoices?|evidence|documents?)\b/, 'MISSING_SUPPORT'],
  [/\bexceptions?\b/, 'EXCEPTIONS'],
  [/\b(support|evidence) coverage\b|\bcoverage\b/, 'EVIDENCE_COVERAGE'],
  [/\bevidence (index|references?)\b|\bevidence\b/, 'EVIDENCE_INDEX'],
  [/\bcomments?\b/, 'COMMENTS'],
  [/\breconciling items?\b/, 'RECONCILING_ITEMS'],
  [/\bsupport index\b|\bsupport(ing)? documents? (list|index)\b/, 'SUPPORT_INDEX'],
  [/\bdrivers?\b|\bby project\b|\bprojects? (tab|breakdown|analysis)\b/, 'DRIVERS'],
  [/\bsource references?\b|\bsource systems?\b/, 'SOURCE_REFERENCES'],
  [/\baudit trail\b/, 'AUDIT_TRAIL'],
  [/\bincome statements?\b|\bp\s?&\s?l\b/, 'INCOME_STATEMENT'],
  [/\bbalance sheets?\b/, 'BALANCE_SHEET'],
  [/\bmom\b|\bmonth[- ]over[- ]month\b|\bvariance analysis\b/, 'VARIANCE'],
  [/\bmaterial movements?\b/, 'MATERIAL_MOVEMENTS'],
  [/\bpopulation metadata\b/, 'POPULATION_METADATA'],
];
/** a specific section named by words that also name a general one is the specific one */
const SUBSUMES: [SheetKind, SheetKind[]][] = [['RECS_NOT_TIED', ['RECONCILIATIONS']], ['RECONCILING_ITEMS', ['RECONCILIATIONS']], ['UNEXPLAINED_FLUX', ['FLUX']], ['COMMENTS', ['RECONCILIATIONS', 'FLUX']],
  ['EVIDENCE_COVERAGE', ['EVIDENCE_INDEX']], ['MISSING_SUPPORT', ['EVIDENCE_INDEX']], ['SUPPORT_INDEX', ['EVIDENCE_INDEX']], ['VARIANCE', ['FLUX']], ['MATERIAL_MOVEMENTS', ['FLUX']], ['PENDING_REVIEW', ['FLUX', 'RECONCILIATIONS']]];
export const sheetsIn = (t: string): SheetKind[] => {
  const ks = SHEET_WORDS.filter(([re]) => re.test(t)).map(([, k]) => k);
  const drop = new Set(SUBSUMES.filter(([k]) => ks.includes(k)).flatMap(([, x]) => x));
  return ks.filter((k) => !drop.has(k));
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "June", "Jun 2026", "2026-05" → a period key, or null */
export function monthIn(t: string, periods: string[]): string | null {
  const iso = t.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const m = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?\s*(20\d{2})?/i);
  if (!m) return null;
  const mm = String(MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) + 1).padStart(2, '0');
  const yr = m[2] ?? periods.at(-1)?.slice(0, 4) ?? '2026';
  return `${yr}-${mm}`;
}
/** "$500K", "1M", "1.5 million", "250,000" → USD */
export function amountIn(t: string): number | null {
  const m = t.match(/(?:over|above|greater than|more than|at least|exceeding|>=?|larger than|bigger than)\s*\$?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|million|b|bn|billion)?\b/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, '')), u = (m[2] ?? '').toLowerCase();
  return n * (u.startsWith('k') || u === 'thousand' ? 1e3 : u === 'm' || u === 'mm' || u === 'million' ? 1e6 : u.startsWith('b') ? 1e9 : 1);
}
const gl = (d: ArtifactDefinition) => d.sheets.find((s): s is GLSheetDef => s.kind === 'GL') ?? null;
const label = (k: string) => GL_COLUMN(k)?.header ?? k;

const fmtAmt = (m: number) => `$${m >= 1e6 ? `${+(m / 1e6).toFixed(2)}M` : `${Math.round(m / 1e3)}K`}`;
const glBehind = (minUsd: number | null): GLSheetDef => ({ kind: 'GL', name: minUsd === null ? 'GL · Material Items' : `GL Over ${fmtAmt(minUsd)}`, filter: {}, columns: [...DEFAULT_GL_COLUMNS], sort: 'amount_desc', rule: { kind: 'MATERIAL_ITEMS', minUsd } as GLRule });
const kindName = (d: ArtifactDefinition, k: SheetKind) => sectionName(d.type, k);

export function applyStructured(d: ArtifactDefinition, c: StructuredChange, r: Refinement, ctx?: RefineCtx) {
  /* ---- 4B: package-level changes ---- */
  if (c.periodEnd) {
    if (ctx && !ctx.periods.includes(c.periodEnd)) r.notes.push(`${monLabel(c.periodEnd)} is not in the governed ledger (latest closed: ${monLabel(ctx.periods.at(-1)!)}); the period is unchanged.`);
    else if (c.periodEnd !== d.periodEnd) {
      const month = d.periodStart === d.periodEnd, fy = d.periodStart === `${d.periodEnd.slice(0, 4)}-01`;
      d.periodStart = month ? c.periodEnd : fy ? `${c.periodEnd.slice(0, 4)}-01` : d.periodStart <= c.periodEnd ? d.periodStart : `${c.periodEnd.slice(0, 4)}-01`;
      d.periodEnd = c.periodEnd; r.changes.push(`Period changed to ${d.periodStart === d.periodEnd ? monLabel(d.periodEnd) : `${monLabel(d.periodStart)} – ${monLabel(d.periodEnd)}`}`); r.changed = true;
    }
  }
  if (c.scopeId && c.scopeId !== d.scopeId) {
    const sc = ctx?.scopes.find((x) => x.id === c.scopeId);
    if (ctx && !sc) r.notes.push(`${c.scopeId} is not a governed scope; the scope is unchanged.`);
    else { d.scopeId = c.scopeId; r.changes.push(`Scope changed to ${c.scopeId === 'GROUP' ? 'Corporate Consolidated' : sc?.name ?? c.scopeId}`); r.changed = true; }
  }
  if (c.excludeCompleteEntities !== undefined && !!d.filters?.excludeCompleteEntities !== c.excludeCompleteEntities) {
    d.filters = { ...(d.filters ?? {}), excludeCompleteEntities: c.excludeCompleteEntities };
    r.changes.push(c.excludeCompleteEntities ? 'Left out entities whose close work is complete' : 'Included completed entities again'); r.changed = true;
  }
  if (c.itemsOver) {
    const ex = d.sheets.find((x) => x.kind === 'ITEMS_OVER') as { params?: { minUsd?: number }; name: string } | undefined;
    if (ex) { ex.params = { ...(ex.params ?? {}), minUsd: c.itemsOver }; ex.name = `Items Over ${fmtAmt(c.itemsOver)}`; r.changes.push(`Items tab now at or over ${fmtAmt(c.itemsOver)}`); }
    else { d.sheets.push({ kind: 'ITEMS_OVER', name: `Items Over ${fmtAmt(c.itemsOver)}`, params: { minUsd: c.itemsOver } }); r.changes.push(`Added a tab of items at or over ${fmtAmt(c.itemsOver)}`); }
    r.changed = true;
  }
  if (c.glBehind) {
    const ex = d.sheets.find((x): x is GLSheetDef => x.kind === 'GL' && x.rule?.kind === 'MATERIAL_ITEMS');
    const next = glBehind(c.glBehind.minUsd);
    if (ex) { ex.rule = next.rule; ex.name = next.name; r.changes.push(`${next.name}: the GL behind ${c.glBehind.minUsd === null ? 'each material item' : `items over ${fmtAmt(c.glBehind.minUsd)}`}`); }
    else { d.sheets.push(next); r.changes.push(`Added ${next.name} — the GL behind ${c.glBehind.minUsd === null ? 'each material variance and blocking reconciliation' : `each item over ${fmtAmt(c.glBehind.minUsd)}`}`); }
    r.changed = true;
  }
  const g = gl(d);
  const needGl = (what: string) => { if (!g) { r.notes.push(`There is no GL sheet in this workbook to ${what}.`); return false; } return true; };
  for (const k of c.addSheets ?? []) {
    if (d.sheets.some((s) => s.kind === k)) { r.notes.push(`${SHEET_NAMES[k]} is already a tab in this workbook.`); continue; }
    const nm = kindName(d, k);
    d.sheets.push(k === 'TB' ? { kind: 'TB', name: nm, byEntity: false } : k === 'GL' ? { kind: 'GL', name: nm, filter: {}, columns: [...DEFAULT_GL_COLUMNS], sort: 'date_asc' } : { kind: k as 'TIEOUT', name: nm } as SheetDef);
    r.changes.push(`Added the ${nm} tab`); r.changed = true;
    if (k === 'TIEOUT') r.validate = true;
  }
  for (const k of c.removeSheets ?? []) {
    const i = d.sheets.findIndex((s) => s.kind === k);
    if (i < 0) { r.notes.push(`${kindName(d, k)} is not a tab in this workbook; nothing removed.`); continue; }
    if (d.sheets.length === 1) { r.notes.push('A workbook needs at least one tab; nothing removed.'); continue; }
    const [gone] = d.sheets.splice(i, 1); r.changes.push(`Removed the ${gone!.name} tab`); r.changed = true;
    if (k === 'TIEOUT') r.notes.push('Without a Tie-Out tab the workbook is not labelled audit-ready.');
  }
  if (c.tbByEntity !== undefined) {
    const tb = d.sheets.find((s) => s.kind === 'TB') as { byEntity: boolean } | undefined;
    if (!tb) { d.sheets.push({ kind: 'TB', name: SHEET_NAMES.TB, byEntity: c.tbByEntity }); r.changes.push(`Added the Trial Balance tab${c.tbByEntity ? ' by entity' : ''}`); r.changed = true; }
    else if (tb.byEntity !== c.tbByEntity) { tb.byEntity = c.tbByEntity; r.changes.push(c.tbByEntity ? 'Trial Balance now shows each entity, with eliminations and translation as rows' : 'Trial Balance is consolidated'); r.changed = true; }
  }
  for (const k of c.addColumns ?? []) {
    if (!needGl('add a column to')) break;
    const col = GL_COLUMN(k);
    if (!col) { r.notes.push(`“${k}” is not a governed GL column.`); continue; }
    if (!col.available) { r.notes.push(`${col.header} is not available: ${col.note}`); continue; }
    if (g!.columns.includes(k)) { r.notes.push(`${col.header} is already in the GL tab.`); continue; }
    /* a vendor triplet reads source → governed → effective */
    const at = k === 'sourceVendor' || k === 'governedVendor' ? g!.columns.indexOf('vendor') : -1;
    if (at >= 0) g!.columns.splice(k === 'sourceVendor' ? at : g!.columns.includes('sourceVendor') ? g!.columns.indexOf('sourceVendor') + 1 : at, 0, k);
    else { const net = g!.columns.indexOf('debit'); if (net >= 0 && !['debit', 'credit', 'netAmount', 'localAmount'].includes(k) && GL_COLUMN(k)!.format !== 'money') g!.columns.splice(net, 0, k); else g!.columns.push(k); }
    r.changes.push(`Added ${col.header}`); r.changed = true;
  }
  for (const k of c.removeColumns ?? []) {
    if (!needGl('remove a column from')) break;
    const col = GL_COLUMN(k);
    if (!g!.columns.includes(k)) { r.notes.push(`${col?.header ?? k} is not in the GL tab${col && !col.available ? ` (${col.note})` : ''}; nothing removed.`); continue; }
    if (g!.columns.length === 1) { r.notes.push('The GL tab needs at least one column.'); continue; }
    g!.columns = g!.columns.filter((x) => x !== k); r.changes.push(`Removed ${col?.header ?? k}`); r.changed = true;
  }
  if (c.move && needGl('reorder')) {
    const { column, before, after } = c.move, anchor = before ?? after!;
    if (!g!.columns.includes(column)) r.notes.push(`${label(column)} is not in the GL tab.`);
    else if (!g!.columns.includes(anchor)) r.notes.push(`${label(anchor)} is not in the GL tab.`);
    else { const rest = g!.columns.filter((x) => x !== column); const i = rest.indexOf(anchor); rest.splice(before ? i : i + 1, 0, column); g!.columns = rest; r.changes.push(`Moved ${label(column)} ${before ? 'before' : 'after'} ${label(anchor)}`); r.changed = true; }
  }
  if (c.sort && needGl('sort')) { if (g!.sort !== c.sort) { g!.sort = c.sort; r.changes.push(`Sorted ${c.sort === 'amount_desc' ? 'largest amount first' : c.sort === 'amount_asc' ? 'smallest amount first' : c.sort === 'date_asc' ? 'oldest posting first' : 'newest posting first'}`); r.changed = true; } else r.notes.push('The GL tab is already sorted that way.'); }
  if (c.minAbsUsd !== undefined && needGl('filter')) {
    if (c.minAbsUsd === null) { delete g!.filter.minAbsUsd; r.changes.push('Removed the amount threshold'); }
    else { g!.filter.minAbsUsd = c.minAbsUsd; r.changes.push(`Only lines over ${c.minAbsUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} (absolute amount)`); }
    r.changed = true;
  }
  if (c.moveSheet) {
    const { sheet: k, to } = c.moveSheet, i = d.sheets.findIndex((x) => x.kind === k);
    if (i < 0) r.notes.push(`${kindName(d, k)} is not a tab in this workbook; add it first.`);
    else {
      const [x] = d.sheets.splice(i, 1);
      if (to === 'first') d.sheets.unshift(x!); else if (to === 'last') d.sheets.push(x!);
      else { const j = d.sheets.findIndex((y) => y.kind === to.before); d.sheets.splice(j < 0 ? d.sheets.length : j, 0, x!); }
      r.changes.push(`Moved ${x!.name} ${to === 'first' ? 'to the front' : to === 'last' ? 'to the end' : `before ${kindName(d, (to as { before: SheetKind }).before)}`}`); r.changed = true;
    }
  }
  if (c.name) { d.name = c.name; r.changes.push(`Renamed to “${c.name}”`); r.changed = true; }
}

/** the request, clause by clause → structured changes */
export function parseInstruction(text: string, ctx?: RefineCtx): StructuredChange {
  const c: StructuredChange = {};
  const push = <K extends 'addColumns' | 'removeColumns' | 'addSheets' | 'removeSheets'>(k: K, v: NonNullable<StructuredChange[K]>[number]) => { const a = (c[k] ?? []) as unknown[]; if (!a.includes(v)) a.push(v); (c as Record<string, unknown>)[k] = a; };
  for (const raw of text.split(/[.;\n]|,? and then |, then /i)) {
    const t = ` ${raw.toLowerCase().trim()} `;
    if (!t.trim()) continue;
    const rename = raw.match(/\b(?:call|name|rename) (?:it|the workbook)(?: to)? [“"']?([^“"'.]+)[”"']?/i);
    if (rename) { c.name = rename[1]!.trim(); continue; }
    /* 4B — completed entities */
    if (/\bentit(y|ies)\b/.test(t) && /\b(complete|completed|finished|done|closed)\b/.test(t)) { c.excludeCompleteEntities = /\b(remove|exclude|drop|hide|leave out|without|skip|take out)\b/.test(t); continue; }
    /* 4B — reorder a section: "put unreconciled accounts first", "move blockers to the end", "put exceptions before blockers" */
    const sm = t.match(/\b(?:put|move|place|show|list)\s+(?:the\s+)?(.+?)\s+(first|at the (?:top|front|start)|last|at the (?:end|bottom)|to the (?:front|end|top|bottom)|before (?:the\s+)?(.+?))\s*$/);
    if (sm) { const a = sheetsIn(sm[1]!)[0], b = sm[3] ? sheetsIn(sm[3])[0] : undefined;
      if (a && (!sm[3] || b)) { c.moveSheet = { sheet: a, to: /first|top|front|start/.test(sm[2]!) && !sm[3] ? 'first' : /last|end|bottom/.test(sm[2]!) && !sm[3] ? 'last' : { before: b! } }; continue; } }
    /* 4B — a tab of items over an amount, and the GL behind material items */
    const amt0 = amountIn(t) ?? (() => { const m = t.match(/\$\s*([\d][\d,]*(?:\.\d+)?)\s*(k|m|mm|million|thousand|b|bn)?\b/i); if (!m) return null; const n = Number(m[1]!.replace(/,/g, '')), u = (m[2] ?? '').toLowerCase(); return n * (u.startsWith('k') || u === 'thousand' ? 1e3 : u.startsWith('m') ? 1e6 : u.startsWith('b') ? 1e9 : 1); })();
    const glWord = /\b(gl|general ledger|underlying gl|gl detail|ledger detail|transactions behind|lines behind)\b/.test(t);
    if (glWord && /\b(behind|underlying|detail|for|supporting)\b/.test(t) && (/\bmaterial\b/.test(t) || (amt0 !== null && /\b(movements?|variances?|items?|anything|everything|blockers?)\b/.test(t)))) { c.glBehind = { minUsd: /\bmaterial\b/.test(t) && amt0 === null ? null : amt0 }; continue; }
    if (amt0 !== null && /\b(tab|sheet|section|list)\b/.test(t) && /\b(items?|anything|everything|over|above)\b/.test(t) && !/\b(transactions?|lines?)\b/.test(t)) { c.itemsOver = amt0; continue; }
    /* 4B — period and scope */
    if (ctx && /\b(change|switch|set|move|make it|make this|use|instead|period|month|for)\b/.test(t) && !/\b(over|above|transactions?)\b/.test(t)) {
      const pe = monthIn(t, ctx.periods);
      const sc = ctx.scopes.find((x) => x.id !== 'GROUP' && (new RegExp(`\\b${x.id.toLowerCase().replace(/[-]/g, '[- ]?')}\\b`).test(t) || (x.name.length > 4 && t.includes(x.name.toLowerCase())))) ?? (/\b(consolidated|group|corporate|all entities)\b/.test(t) ? ctx.scopes.find((x) => x.id === 'GROUP') : undefined);
      if (pe || sc) { if (pe) c.periodEnd = pe; if (sc) c.scopeId = sc.id; if (!sheetsIn(t).length) continue; }
    }
    /* TB by entity */
    if (/\bentit(y|ies)\b/.test(t) && /\b(tb|trial balance)\b/.test(t)) { c.tbByEntity = !/\bremove\b|\bwithout\b|\bconsolidat/.test(t); continue; }
    /* move */
    const mv = t.match(/\b(?:put|move|place)\s+(?:the\s+)?(.+?)\s+(before|after|ahead of|in front of)\s+(?:the\s+)?(.+?)\s*$/);
    if (mv) { const a = columnFor(mv[1]!), b = columnFor(mv[3]!); if (a && b) { c.move = /after/.test(mv[2]!) ? { column: a, after: b } : { column: a, before: b }; continue; } }
    /* sort */
    if (/\bsort|\border\b|\bfirst\b/.test(t) && /largest|biggest|highest|amount|smallest|oldest|newest|latest|date|chronolog/.test(t)) {
      c.sort = /smallest|lowest/.test(t) ? 'amount_asc' : /newest|latest|most recent/.test(t) ? 'date_desc' : /oldest|date|chronolog/.test(t) ? 'date_asc' : 'amount_desc'; continue;
    }
    /* threshold */
    const amt = amountIn(t);
    if (amt !== null && /\b(only|transactions?|lines?|include|over|above|greater|more than|filter|amounts?)\b/.test(t)) { c.minAbsUsd = amt; }
    if (/\b(remove|drop|no|without|clear)\b.*\b(threshold|filter)\b/.test(t)) c.minAbsUsd = null;
    /* sheets */
    const sks = sheetsIn(t);
    if (sks.length && /\b(remove|drop|delete|take out|without)\b/.test(t)) { sks.forEach((k) => push('removeSheets', k)); continue; }
    if (sks.length && (sks.includes('TIEOUT') || /\b(tab|tabs|sheet|sheets|add|put|include|with|also|separate|another|make sure|give)\b/.test(t))) { sks.forEach((k) => push('addSheets', k)); continue; }
    if (amt !== null) continue;
    /* columns: "add source vendor and governed vendor", "remove department" */
    const rm = t.match(/\b(?:remove|drop|delete|hide|take out)\s+(?:the\s+)?(.+?)\s*(?:column|columns)?\s*$/);
    if (rm) { for (const w of rm[1]!.split(/,| and /)) { const k = columnFor(w); if (k) push('removeColumns', k); } continue; }
    const add = t.match(/\b(?:add|include|show|with)\s+(?:the\s+)?(.+?)\s*(?:column|columns|to the gl|to it)?\s*$/);
    if (add) for (const w of add[1]!.split(/,| and |\s&\s/)) { const k = columnFor(w); if (k) push('addColumns', k); }
  }
  return c;
}

export function refineDefinition(d: ArtifactDefinition, text: string, structured: StructuredChange = {}, ctx?: RefineCtx): Refinement {
  const r: Refinement = { changes: [], notes: [], validate: false, changed: false };
  /* the user's own words are authoritative; a structured change from the model can only ADD to them (a model that
     reads "add source vendor" as "vendor" must not replace what the user said) */
  const parsed = parseInstruction(text, ctx);
  const merged: StructuredChange = { ...parsed };
  const S = structured as Record<string, unknown>, M = merged as Record<string, unknown>;
  for (const [k, v] of Object.entries(S)) {
    if (v === undefined || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v)) {
      const cur = (M[k] as string[] | undefined) ?? [];
      /* "vendor" from the model when the user named the source or governed form is that form, not a second column */
      const add = (v as string[]).filter((x) => !(k === 'addColumns' && x === 'vendor' && cur.some((c) => c === 'sourceVendor' || c === 'governedVendor')));
      M[k] = [...new Set([...cur, ...add])];
    }
    else if (M[k] === undefined) M[k] = v;
  }
  applyStructured(d, merged, r, ctx);
  if (!r.changed && !r.notes.length) r.notes.push('Korvyn did not find a change to make to the workbook in that request.');
  return r;
}
export const DEFAULTS = { DEFAULT_GL_COLUMNS };
