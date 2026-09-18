/**
 * THE EXCEL RENDERER — WorkbookModel → a real .xlsx, streamed to disk.
 *
 * `ExcelRenderer` is the abstraction; `ExcelJsStreamingRenderer` is today's implementation (exceljs's streaming
 * WorkbookWriter: rows are committed as they are written, so memory is bounded by a chunk, not by the population).
 * Replacing the library is a new class implementing the same interface. `CsvRenderer` is the extract for populations
 * too large to be practical as a workbook.
 *
 * KORVYN_FINANCIAL — the formatting preset. A workbook an experienced controller would actually use: a compact title
 * block, a quiet header, light blue / white stripes (a conditional-format rule, so they survive sort and filter and cost
 * nothing per cell), hairline row borders, frozen header, autofilter, accounting formats with negatives in parentheses
 * and zeros as a dash, emphasised totals. No cover sheet, no gradients, no merged cells, no branding beyond one word.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import type { Block, Cell, ColumnSpec, Row, SheetModel, WorkbookModel } from './compose.js';
import type { ColFormat } from './model.js';

export interface RenderProgress { rows: number; sheet: string }
export interface RenderResult { path: string; bytes: number; sha256: string; rows: number; sheets: string[]; ms: number; peakHeapMb: number; rowsPerSecond: number }
export interface ExcelRenderer { readonly id: string; render(model: WorkbookModel, path: string, onProgress?: (p: RenderProgress) => void): Promise<RenderResult> }

/* ================================================================================================
   KORVYN_FINANCIAL
   ================================================================================================ */
export const KORVYN_FINANCIAL = {
  id: 'KORVYN_FINANCIAL',
  font: 'Calibri', size: 10,
  ink: 'FF1F2A3D', muted: 'FF5B6577', rule: 'FFD9E0EA', ruleStrong: 'FF8A99B0',
  headerFill: 'FFDCE6F3', stripeFill: 'FFEEF4FB', totalFill: 'FFE3EBF6',
  tone: { ok: 'FF1E7B45', warn: 'FF8A5A00', bad: 'FFB42318', info: 'FF1F4E99' },
  numFmt: {
    money: '#,##0.00_);(#,##0.00);"–"_);@_)', int: '#,##0_);(#,##0);"–"_)', pct: '0.0%_);(0.0%);"–"_)', date: 'dd-mmm-yyyy', text: '@', period: '@',
  } as Record<ColFormat, string>,
};
const P = KORVYN_FINANCIAL;
const thin = (argb: string) => ({ style: 'thin' as const, color: { argb } });
const font = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: P.font, size: P.size, color: { argb: P.ink }, ...o });
const numeric = (f: ColFormat) => f === 'money' || f === 'int' || f === 'pct';

/** style objects are created ONCE and shared by reference; exceljs caches a shared object's style id (WeakMap), so a
 *  million-row sheet costs one style lookup per cell, not one style object */
function stylesFor(cols: ColumnSpec[]) {
  const mk = (f: ColFormat, extra: Partial<ExcelJS.Style> = {}): Partial<ExcelJS.Style> => ({ numFmt: P.numFmt[f], font: font(), alignment: { vertical: 'middle', horizontal: numeric(f) ? 'right' : 'left', wrapText: false }, border: { bottom: thin(P.rule) }, ...extra });
  return {
    data: cols.map((c) => mk(c.format)),
    note: cols.map((c) => mk(c.format, { font: font({ color: { argb: P.muted }, italic: true }) })),
    label: cols.map((c, i) => mk(c.format, { font: font(i === 0 ? { color: { argb: P.muted } } : {}) })),
    subtotal: cols.map((c) => mk(c.format, { font: font({ bold: true }), border: { top: thin(P.ruleStrong), bottom: thin(P.rule) } })),
    total: cols.map((c) => mk(c.format, { font: font({ bold: true }), fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: P.totalFill } }, border: { top: thin(P.ruleStrong), bottom: { style: 'double', color: { argb: P.ruleStrong } } } })),
    header: cols.map((c) => ({ font: font({ bold: true }), fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: P.headerFill } } as ExcelJS.Fill, alignment: { vertical: 'middle', horizontal: numeric(c.format) ? 'right' : 'left', wrapText: true } as Partial<ExcelJS.Alignment>, border: { bottom: thin(P.ruleStrong) } })),
  };
}
const TITLE = { title: { font: font({ bold: true, size: 13 }) }, sub: { font: font({ color: { argb: P.muted }, size: 9 }) }, heading: { font: font({ bold: true, size: 11 }) } };

const colLetter = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/* ================================================================================================
   EXCEL (streaming)
   ================================================================================================ */
export class ExcelJsStreamingRenderer implements ExcelRenderer {
  readonly id = 'exceljs-stream-4.4';
  async render(model: WorkbookModel, path: string, onProgress?: (p: RenderProgress) => void): Promise<RenderResult> {
    const t0 = Date.now();
    let peak = process.memoryUsage().heapUsed, rows = 0;
    const sample = () => { const h = process.memoryUsage().heapUsed; if (h > peak) peak = h; };
    await mkdir(dirname(path), { recursive: true });
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: path, useStyles: true, useSharedStrings: false });
    wb.creator = 'Korvyn'; wb.created = new Date(); wb.title = model.title;
    for (const s of model.sheets) {
      rows += await this.sheet(wb, s, (n) => { if (n % 20_000 === 0) { sample(); onProgress?.({ rows: rows + n, sheet: s.name }); } });
      sample();
    }
    await wb.commit();
    const bytes = (await stat(path)).size;
    const sha = createHash('sha256');
    await new Promise<void>((res, rej) => { const rs = createReadStream(path); rs.on('data', (c: Buffer) => sha.update(c)); rs.on('end', () => res()); rs.on('error', rej); });
    const ms = Date.now() - t0;
    return { path, bytes, sha256: sha.digest('hex'), rows, sheets: model.sheets.map((s) => s.name), ms, peakHeapMb: Math.round(peak / 1e6), rowsPerSecond: Math.round(rows / Math.max(ms / 1000, 0.001)) };
  }

  private async sheet(wb: ExcelJS.stream.xlsx.WorkbookWriter, s: SheetModel, tick: (n: number) => void): Promise<number> {
    const single = s.blocks.length === 1 && s.blocks[0]!.tabular;
    const headerRow = 6; // title · context · provenance · status · blank · header
    const ws = wb.addWorksheet(s.name, { views: [single ? { state: 'frozen', ySplit: headerRow, xSplit: 0, showGridLines: false } : { showGridLines: false }], properties: { defaultRowHeight: 15 } as ExcelJS.WorksheetProperties });
    /* column widths: the widest of every block's column at that position */
    const widths: number[] = [];
    for (const b of s.blocks) b.columns.forEach((c, i) => { widths[i] = Math.max(widths[i] ?? 8, c.width); });
    ws.columns = widths.map((w) => ({ width: w }));
    const put = (vals: Cell[], style?: Partial<ExcelJS.Style>) => { const r = ws.addRow(vals); if (style) r.eachCell({ includeEmpty: false }, (c) => { c.style = style; }); r.commit(); return r; };
    /* the compact title block */
    put([s.title[0] ?? s.name], TITLE.title); put([s.title[1] ?? ''], TITLE.sub); put([s.title[2] ?? ''], TITLE.sub);
    if (s.status) put([s.status.text], { font: font({ bold: true, color: { argb: P.tone[s.status.tone] } }) }); else put(['']);
    let n = 0, rowNo = 4;
    for (const [bi, b] of s.blocks.entries()) {
      if (bi > 0 || b.heading) { put(['']); rowNo++; if (b.heading) { put([b.heading], TITLE.heading); rowNo++; } } else { put(['']); rowNo++; }
      const st = stylesFor(b.columns);
      const hdr = ws.addRow(b.columns.map((c) => c.header)); hdr.height = 28; hdr.eachCell((c, i) => { c.style = st.header[i - 1]!; }); hdr.commit(); rowNo++;
      const headerAt = rowNo, first = rowNo + 1;
      for (const chunk of b.chunks()) {
        for (const r of chunk) { this.row(ws, r, st, b.columns.length); n++; rowNo++; tick(n); }
        await Promise.resolve();
      }
      const last = rowNo;
      if (b.tabular && last >= first) {
        /* stripes as ONE conditional-format rule over the data range: survives sort and filter, no per-cell fill */
        ws.addConditionalFormatting({ ref: `A${first}:${colLetter(b.columns.length)}${last}`, rules: [{ type: 'expression', priority: 1, formulae: ['MOD(ROW()-' + first + ',2)=1'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: P.stripeFill } } } }] } as ExcelJS.ConditionalFormattingOptions);
        if (single) ws.autoFilter = { from: { row: headerAt, column: 1 }, to: { row: last, column: b.columns.length } };
      }
      for (const t of b.totals ?? []) { this.row(ws, t, st, b.columns.length); rowNo++; }
    }
    ws.commit();
    return n;
  }
  private row(ws: ExcelJS.Worksheet, r: Row, st: ReturnType<typeof stylesFor>, width: number) {
    const x = ws.addRow(r.cells.slice(0, width).map((v) => (v === null ? null : v)));
    const set = r.style === 'total' ? st.total : r.style === 'subtotal' ? st.subtotal : r.style === 'note' ? st.note : r.style === 'label' ? st.label : st.data;
    for (let i = 1; i <= width; i++) x.getCell(i).style = set[i - 1]!;
    x.commit();
  }
}

/* ================================================================================================
   CSV — the extract for very large populations (the first GL sheet), with its manifest block first
   ================================================================================================ */
export class CsvRenderer {
  readonly id = 'csv-stream';
  async render(model: WorkbookModel, path: string, manifest: [string, string][], onProgress?: (p: RenderProgress) => void): Promise<RenderResult> {
    const t0 = Date.now();
    await mkdir(dirname(path), { recursive: true });
    const gl = model.sheets.filter((s) => s.kind === 'GL');
    if (!gl.length) throw new Error('A CSV extract needs a GL sheet in the workbook definition.');
    const out = createWriteStream(path, { encoding: 'utf8' });
    const q = (v: Cell) => { if (v === null) return ''; if (v instanceof Date) return v.toISOString().slice(0, 10); const s = typeof v === 'number' ? String(v) : v; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const write = (line: string) => new Promise<void>((res) => { if (out.write(line)) res(); else out.once('drain', () => res()); });
    for (const [k, v] of manifest) await write(`${q(k)},${q(v)}\n`);
    await write('\n');
    await write(gl[0]!.blocks[0]!.columns.map((c: ColumnSpec) => q(c.header)).join(',') + '\n');
    let rows = 0;
    for (const s of gl) for (const b of s.blocks as Block[]) for (const chunk of b.chunks()) {
      await write(chunk.map((r) => r.cells.map(q).join(',')).join('\n') + '\n');
      rows += chunk.length; if (rows % 50_000 < chunk.length) onProgress?.({ rows, sheet: s.name });
    }
    await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
    const bytes = (await stat(path)).size, ms = Date.now() - t0;
    const sha = createHash('sha256'); await new Promise<void>((res, rej) => { const rs = createReadStream(path); rs.on('data', (c) => sha.update(c)); rs.on('end', () => res()); rs.on('error', rej); });
    return { path, bytes, sha256: sha.digest('hex'), rows, sheets: gl.map((s) => s.name), ms, peakHeapMb: Math.round(process.memoryUsage().heapUsed / 1e6), rowsPerSecond: Math.round(rows / Math.max(ms / 1000, 0.001)) };
  }
}
