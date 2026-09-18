/**
 * NATURAL-LANGUAGE REFINEMENT of a workbook DEFINITION. Deterministic and bounded: each clause of the request becomes
 * one structured change (add / remove / move a column, sort, threshold, add / remove a sheet, TB by entity, rename).
 * The model may also pass the structured change directly; both land here, so the same words always make the same
 * change. Nothing is regenerated — the definition changes, and a file is produced only when generation is requested.
 */
import { type ArtifactDefinition, DEFAULT_GL_COLUMNS, GL_COLUMN, type GLSheetDef, SHEET_NAMES, type SheetKind, columnFor } from './model.js';

export interface Refinement { changes: string[]; notes: string[]; validate: boolean; changed: boolean }
export interface StructuredChange {
  addColumns?: string[]; removeColumns?: string[]; move?: { column: string; before?: string; after?: string };
  sort?: GLSheetDef['sort']; minAbsUsd?: number | null; addSheets?: SheetKind[]; removeSheets?: SheetKind[]; tbByEntity?: boolean; name?: string;
}

const SHEET_WORDS: [RegExp, SheetKind][] = [
  [/\btie.?outs?\b|\bties? (it )?back\b|\btie (it )?(back )?to (the )?erp\b|\bties? to (the )?erp\b|\breconciles? to (the )?erp\b/, 'TIEOUT'],
  [/\btb\b|\btrial balances?\b/, 'TB'], [/\breconciliations?\b|\brecs\b/, 'RECONCILIATIONS'], [/\bflux\b|\bexplanations?\b/, 'FLUX'], [/\bsummary\b/, 'SUMMARY'],
];
export const sheetsIn = (t: string): SheetKind[] => SHEET_WORDS.filter(([re]) => re.test(t)).map(([, k]) => k);
/** "$500K", "1M", "1.5 million", "250,000" → USD */
export function amountIn(t: string): number | null {
  const m = t.match(/(?:over|above|greater than|more than|at least|exceeding|>=?|larger than|bigger than)\s*\$?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|million|b|bn|billion)?\b/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, '')), u = (m[2] ?? '').toLowerCase();
  return n * (u.startsWith('k') || u === 'thousand' ? 1e3 : u === 'm' || u === 'mm' || u === 'million' ? 1e6 : u.startsWith('b') ? 1e9 : 1);
}
const gl = (d: ArtifactDefinition) => d.sheets.find((s): s is GLSheetDef => s.kind === 'GL') ?? null;
const label = (k: string) => GL_COLUMN(k)?.header ?? k;

export function applyStructured(d: ArtifactDefinition, c: StructuredChange, r: Refinement) {
  const g = gl(d);
  const needGl = (what: string) => { if (!g) { r.notes.push(`There is no GL sheet in this workbook to ${what}.`); return false; } return true; };
  for (const k of c.addSheets ?? []) {
    if (d.sheets.some((s) => s.kind === k)) { r.notes.push(`${SHEET_NAMES[k]} is already a tab in this workbook.`); continue; }
    d.sheets.push(k === 'TB' ? { kind: 'TB', name: SHEET_NAMES.TB, byEntity: false } : { kind: k as 'TIEOUT', name: SHEET_NAMES[k] });
    r.changes.push(`Added the ${SHEET_NAMES[k]} tab`); r.changed = true;
    if (k === 'TIEOUT') r.validate = true;
  }
  for (const k of c.removeSheets ?? []) {
    const i = d.sheets.findIndex((s) => s.kind === k);
    if (i < 0) { r.notes.push(`${SHEET_NAMES[k]} is not a tab in this workbook; nothing removed.`); continue; }
    if (d.sheets.length === 1) { r.notes.push('A workbook needs at least one tab; nothing removed.'); continue; }
    d.sheets.splice(i, 1); r.changes.push(`Removed the ${SHEET_NAMES[k]} tab`); r.changed = true;
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
  if (c.name) { d.name = c.name; r.changes.push(`Renamed to “${c.name}”`); r.changed = true; }
}

/** the request, clause by clause → structured changes */
export function parseInstruction(text: string): StructuredChange {
  const c: StructuredChange = {};
  const push = <K extends 'addColumns' | 'removeColumns' | 'addSheets' | 'removeSheets'>(k: K, v: NonNullable<StructuredChange[K]>[number]) => { const a = (c[k] ?? []) as unknown[]; if (!a.includes(v)) a.push(v); (c as Record<string, unknown>)[k] = a; };
  for (const raw of text.split(/[.;\n]|,? and then |, then /i)) {
    const t = ` ${raw.toLowerCase().trim()} `;
    if (!t.trim()) continue;
    const rename = raw.match(/\b(?:call|name|rename) (?:it|the workbook)(?: to)? [“"']?([^“"'.]+)[”"']?/i);
    if (rename) { c.name = rename[1]!.trim(); continue; }
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

export function refineDefinition(d: ArtifactDefinition, text: string, structured: StructuredChange = {}): Refinement {
  const r: Refinement = { changes: [], notes: [], validate: false, changed: false };
  /* the user's own words are authoritative; a structured change from the model can only ADD to them (a model that
     reads "add source vendor" as "vendor" must not replace what the user said) */
  const parsed = parseInstruction(text);
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
  applyStructured(d, merged, r);
  if (!r.changed && !r.notes.length) r.notes.push('Korvyn did not find a change to make to the workbook in that request.');
  return r;
}
export const DEFAULTS = { DEFAULT_GL_COLUMNS };
