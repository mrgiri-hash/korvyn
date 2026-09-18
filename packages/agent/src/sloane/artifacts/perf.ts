/**
 * ARTIFACT PERFORMANCE HARNESS (4A) — measures the renderer at enterprise row counts.
 *
 * SYNTHETIC BY DESIGN: the server book holds ~1.2k governed lines, so this streams those governed lines REPEATED (keys
 * suffixed) to reach the target count. It measures the rendering path — definition, composition, streaming write,
 * partitioning at Excel's real 1,048,576-row limit, CSV — not a real population. Nothing here is written to the work
 * store. Run: npx tsx src/sloane/artifacts/perf.ts [xlsxRows] [csvRows]
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { FinancialDataService } from '../financials.js';
import { GovernedLedger } from '../governed.js';
import { ControlService } from '../controls.js';
import { KorvynDatabase } from '../persistence/db.js';
import { bindWork, WORK } from '../store.js';
import { seedDevelopment } from '../persistence/seed.js';
import { serverActor } from '../tools.js';
import { ArtifactEngine } from './engine.js';
import { type Row, type SheetModel, type WorkbookModel, glCell } from './compose.js';
import { DEFAULT_GL_COLUMNS, EXCEL_MAX_ROWS, GL_COLUMN } from './model.js';
import { CsvRenderer, ExcelJsStreamingRenderer } from './renderer.js';

const xlsxRows = Number(process.argv[2] ?? 1_200_000), csvRows = Number(process.argv[3] ?? 3_000_000);
const mb = () => Math.round(process.memoryUsage().heapUsed / 1e6);

const db = new KorvynDatabase(':memory:'); bindWork(db);
const data = new FinancialDataService(), gl = new GovernedLedger(data), controls = new ControlService(gl);
seedDevelopment(db, WORK.repos, data.workingPeriod(), controls.recDefs());
const eng = new ArtifactEngine(data, gl, controls), actor = serverActor();

/* 1. definition + composition + validation latency on the REAL governed book */
let t = Date.now();
const d = eng.newDefinition({ template: 'AUDIT_GL_PACKAGE' });
const tDef = Date.now() - t; t = Date.now();
const m = eng.compose(actor, d, 1, 'PERF');
const tCompose = Date.now() - t; t = Date.now();
const pins = eng.pins(m);
const tPins = Date.now() - t;
console.log(`[real book] definition ${tDef} ms · compose (GL ${m.populations[0]!.rowCount} lines + TB + tie-out) ${tCompose} ms · pin/validate ${tPins} ms · fingerprint ${pins.fingerprint}`);

/* 2. a synthetic GL sheet of N rows, partitioned exactly as compose partitions (header block + totals per sheet) */
function syntheticGl(n: number, perSheet: number): SheetModel[] {
  const base = gl.lines, cols = DEFAULT_GL_COLUMNS.map((k) => ({ key: k, header: GL_COLUMN(k)!.header, width: GL_COLUMN(k)!.width, format: GL_COLUMN(k)!.format }));
  const gv = new Map<string, string>(), parts = Math.ceil(n / perSheet), out: SheetModel[] = [];
  for (let p = 0; p < parts; p++) {
    const from = p * perSheet, count = Math.min(perSheet, n - from);
    out.push({ name: p ? `Governed GL (${p + 1})` : 'Governed GL', kind: 'GL', title: [`SYNTHETIC perf GL (${p + 1} of ${parts})`, 'Governed lines repeated to reach the row count — not a governed population', `Lines ${from + 1}–${from + count} of ${n}`], status: null, rowCount: count, populationId: 'SYNTHETIC', part: { index: p + 1, of: parts },
      blocks: [{ columns: cols, rowCount: count, tabular: true, chunks: function* () { for (let i = 0; i < count; i += 5000) { const rows: Row[] = []; for (let j = i; j < Math.min(i + 5000, count); j++) { const l = base[(from + j) % base.length]!; rows.push({ cells: DEFAULT_GL_COLUMNS.map((k) => glCell(l, k, gv)) }); } yield rows; } } }] });
  }
  return out;
}
const model = (sheets: SheetModel[]): WorkbookModel => ({ fileName: 'perf.xlsx', csvFileName: 'perf.csv', title: 'perf', scopeLabel: 'Corporate Consolidated', rangeLabel: 'Jan 2026 – Jun 2026', sheets, tieOut: null, populations: [], citations: [], sourceSystems: [], excluded: [], warnings: [], auditReady: false, totalRows: sheets.reduce((s, x) => s + x.rowCount, 0), dataVersion: gl.dataVersion() });

const dir = join(tmpdir(), 'korvyn-perf');
await rm(dir, { recursive: true, force: true });
const perSheet = EXCEL_MAX_ROWS - 8;
console.log(`[xlsx] ${xlsxRows.toLocaleString('en-US')} rows → ${Math.ceil(xlsxRows / perSheet)} worksheet(s) at the ${EXCEL_MAX_ROWS.toLocaleString('en-US')}-row limit · heap before ${mb()} MB`);
const rx = await new ExcelJsStreamingRenderer().render(model(syntheticGl(xlsxRows, perSheet)), join(dir, 'perf.xlsx'), (p) => { if (p.rows % 200_000 === 0) console.log(`   … ${p.rows.toLocaleString('en-US')} rows · ${p.sheet} · heap ${mb()} MB`); });
console.log(`[xlsx] ${rx.rows.toLocaleString('en-US')} rows · sheets ${rx.sheets.join(', ')} · ${(rx.ms / 1000).toFixed(1)} s · ${rx.rowsPerSecond.toLocaleString('en-US')} rows/s · ${(rx.bytes / 1e6).toFixed(1)} MB · peak heap ${rx.peakHeapMb} MB`);
const rc = await new CsvRenderer().render(model(syntheticGl(csvRows, csvRows)), join(dir, 'perf.csv'), [['Korvyn perf extract', 'SYNTHETIC']]);
console.log(`[csv ] ${rc.rows.toLocaleString('en-US')} rows · ${(rc.ms / 1000).toFixed(1)} s · ${rc.rowsPerSecond.toLocaleString('en-US')} rows/s · ${(rc.bytes / 1e6).toFixed(1)} MB · heap at end ${rc.peakHeapMb} MB`);
await rm(dir, { recursive: true, force: true });
