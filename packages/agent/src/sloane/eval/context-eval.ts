/**
 * PHASE 8C.2 — THE CONTEXT-CONTROL HARNESS.
 *
 *   npx tsx src/sloane/eval/context-eval.ts [--mock] [--only K-A,H-M1] [--out file.json]
 *
 * Runs every multi-step script in eval/context.json through the REAL orchestrator (the live model unless --mock), each
 * in a fresh conversation, and scores each step semantically: did it stay on the current analysis or start a new one,
 * did a drill select the right row without re-sorting, did a ranking question leave the grid alone, did a correction
 * replace the stale value, was a clarification asked only when needed, did Undo restore the exact earlier state, and
 * does the workspace title name the analysis on screen. Every analysis step also checks title synchronisation.
 */
import '../../env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdapter, MockLLMAdapter } from '../adapter.js';
import { loadSloaneConfig } from '../config.js';
import { SloaneOrchestrator, type TurnResponse } from '../orchestrator.js';
import { DEV_DIRECTORY, actorContext } from '../auth.js';

type J = Record<string, any>;
type Metric = 'MODIFY_VS_NEW' | 'SORT_VS_DRILL' | 'RANK_VS_FILTER' | 'REFERENT' | 'CORRECTION' | 'UNDO' | 'TITLE' | 'CLARIFICATION';
interface Expect { metric: Metric; sameAs?: number; freshFrom?: number; restores?: number; type?: string; statement?: string; periods?: string[]; columnsInclude?: string[];
  filter?: { dimension: string; value: string }; filterDimensionNot?: { dimension: string; value: string }; noFilterOn?: string[]; sorted?: boolean; noPanel?: boolean;
  panel?: string[]; rowSelected?: 'LARGEST_VARIANCE'; sortSameAs?: number; topNull?: boolean; topN?: number; clarify?: boolean; titleDiffersFrom?: number; /** when the answer is an analysis, no filter on these dimensions (the words did not name one) */ onlyNamedIfAnalysis?: string[] }
interface Step { say?: string; choose?: number; expect?: Expect }
interface Case { id: string; set: 'KNOWN' | 'HOLDOUT' | 'FRESH'; category: string; steps: Step[] }

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const cfg = loadSloaneConfig();
const mock = process.argv.includes('--mock') || cfg.provider !== 'anthropic';
const orch = new SloaneOrchestrator(mock ? new MockLLMAdapter() : createAdapter(cfg), cfg);
const actor = actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:mgiri')!, null, 'eval');
const only = arg('only')?.split(',');
const cases = (JSON.parse(readFileSync(join(here, 'context.json'), 'utf8')).cases as Case[]).filter((c) => !only || only.includes(c.id));

const analysisOf = (r: TurnResponse): J | null => (r.objects ?? []).find((o) => o.type === 'FinancialAnalysis')?.analysis as J ?? null;
/** the most specific row on screen with the largest absolute variance — what "the biggest change" means on this grid */
function largestVarianceRow(a: J): string | null {
  const cols: J[] = a['result']['columns'], ci = cols.findIndex((c) => c['measure'] === 'VARIANCE');
  if (ci < 0) return null;
  const rows: J[] = a['result']['rows'].filter((r: J) => r['kind'] !== 'section');
  const leaf = (r: J) => !a['result']['rows'].some((x: J) => x['id'].startsWith(`${r['id']}/`));
  const c = rows.filter(leaf).filter((r) => r['cells'][ci]?.['value'] !== null);
  return c.sort((x, y) => Math.abs(y['cells'][ci]['value']) - Math.abs(x['cells'][ci]['value']))[0]?.['id'] ?? null;
}

interface Check { metric: Metric; ok: boolean; detail: string }
let seq = 0;
async function run(c: Case) {
  const sid = `ctx-${Date.now().toString(36)}-${++seq}`;
  const shots: { a: J | null; r: TurnResponse }[] = [];
  const checks: { step: number; say: string; check: Check }[] = [];
  let lastA: J | null = null;
  for (const [i, st] of c.steps.entries()) {
    const prev = shots[i - 1]?.r;
    const r = st.choose !== undefined && prev?.clarification
      ? await orch.turn({ sessionId: sid, clarification: { pendingId: prev.clarification.pendingId, optionId: prev.clarification.options[st.choose]!.id } }, actor)
      : await orch.turn({ sessionId: sid, request: st.say ?? '' }, actor);
    const a = analysisOf(r); if (a) lastA = a;
    shots.push({ a, r });
    const say = st.say ?? `(choose option ${st.choose})`;
    const push = (metric: Metric, ok: boolean, detail: string) => checks.push({ step: i, say, check: { metric, ok, detail } });
    const d = a?.['definition'] as J | undefined, E = st.expect;
    /* title synchronisation is checked on EVERY analysis step: the workspace names the analysis on screen */
    if (d) push('TITLE', r.workspace?.title === d['name'], `workspace “${r.workspace?.title ?? '—'}” vs definition “${d['name']}”`);
    if (!E) continue;
    const m = E.metric, clarified = r.state === 'CLARIFICATION_REQUIRED';
    const at = (k: number) => shots[k]?.a?.['definition'] as J | undefined;
    if (E.clarify !== undefined) push(E.clarify ? m : 'CLARIFICATION', clarified === E.clarify, `clarified ${clarified}${clarified ? ` — “${r.clarification?.question}”` : ''}; expected ${E.clarify}`);
    if (E.clarify === true) continue;
    const need = E.sameAs !== undefined || E.freshFrom !== undefined || E.restores !== undefined || E.statement || E.periods || E.filter || E.panel || E.sorted || E.topN || E.titleDiffersFrom !== undefined || E.noFilterOn || E.columnsInclude;
    if (!d) { if (need) push(m, false, `no analysis (${r.state}, route ${orch.trace(r.traceId)?.route}${clarified ? `, asked “${r.clarification?.question}”` : ''}: ${(r.notes ?? []).join(' ').slice(0, 120)})`); continue; }
    if (E.sameAs !== undefined) push(m, d['id'] === at(E.sameAs)?.['id'], `analysis ${d['id']} vs step ${E.sameAs} ${at(E.sameAs)?.['id']}`);
    if (E.freshFrom !== undefined) push(m, !!at(E.freshFrom) && d['id'] !== at(E.freshFrom)!['id'], `analysis ${d['id']} must differ from step ${E.freshFrom}`);
    if (E.restores !== undefined) { const t = at(E.restores); push('UNDO', !!t && d['id'] === t['id'] && d['version'] === t['version'] && JSON.stringify(d['filters']) === JSON.stringify(t['filters']) && d['statement'] === t['statement'], `now ${d['id']} v${d['version']} “${d['name']}”; step ${E.restores} was ${t?.['id']} v${t?.['version']} “${t?.['name']}”`); }
    if (E.type) push(m, d['analysisType'] === E.type, `type ${d['analysisType']}`);
    if (E.statement) push(m, d['statement'] === E.statement, `statement ${d['statement']}`);
    if (E.periods) push(m, JSON.stringify([...d['periods']].sort()) === JSON.stringify([...E.periods].sort()), `periods ${d['periods']}`);
    if (E.columnsInclude) push(m, E.columnsInclude.every((x) => d['columns'].some((c: J) => c['dimension'] === x)), `columns ${d['columns'].map((c: J) => c['dimension'])}`);
    const fs: J[] = d['filters'];
    if (E.filter) push(m, fs.some((f) => f['dimension'] === E.filter!.dimension && f['op'] === 'IN' && f['values'].includes(E.filter!.value)), `filters ${JSON.stringify(fs.map((f) => [f['dimension'], f['values']]))}`);
    if (E.filterDimensionNot) push(m, !fs.some((f) => f['dimension'] === E.filterDimensionNot!.dimension && f['op'] === 'IN' && f['values'].includes(E.filterDimensionNot!.value)), `still filtered to ${E.filterDimensionNot.value}`);
    if (E.onlyNamedIfAnalysis) push(m, E.onlyNamedIfAnalysis.every((dim) => !fs.some((f) => f['dimension'] === dim)), `filters ${JSON.stringify(fs.map((f) => [f['dimension'], f['values']]))}`);
    if (E.noFilterOn) push(m, E.noFilterOn.every((dim) => !fs.some((f) => f['dimension'] === dim)), `filters ${JSON.stringify(fs.map((f) => [f['dimension'], f['values']]))}`);
    if (E.sorted) push(m, d['sorts'].length > 0, `sorts ${JSON.stringify(d['sorts'])}`);
    if (E.noPanel) push(m, !a!['panel'], `panel ${a!['panel']?.['kind'] ?? 'none'}`);
    /* a drill may open the row's ledger (GL), explain it (EXPLAIN) or open it in place (EXPAND) — all three show what is behind it */
    const expandedSel = !!a!['referents']?.['activeRowId'] && (d['expanded'] as string[]).includes(a!['referents']['activeRowId']) && !(at(i - 1)?.['expanded'] ?? []).includes(a!['referents']['activeRowId']);
    if (E.panel) push(m, E.panel.includes(a!['panel']?.['kind']) || (E.panel.includes('EXPAND') && expandedSel), `panel ${a!['panel']?.['kind'] ?? 'none'}${expandedSel ? ' (expanded the row in place)' : ''}`);
    /* "the biggest change" refers to the grid the person was LOOKING AT when they asked — the previous step's */
    if (E.rowSelected) { const want = largestVarianceRow(shots[i - 1]?.a ?? a!), got = a!['referents']?.['activeRowId']; push(m, !!want && got === want, `selected ${got}; largest variance on screen ${want}`); }
    if (E.sortSameAs !== undefined) push(m, JSON.stringify(d['sorts']) === JSON.stringify(at(E.sortSameAs)?.['sorts']), `sorts ${JSON.stringify(d['sorts'])} vs step ${E.sortSameAs} ${JSON.stringify(at(E.sortSameAs)?.['sorts'])}`);
    if (E.topNull) push(m, d['topN'] === null, `topN ${d['topN']}`);
    if (E.topN) push(m, d['topN'] === E.topN, `topN ${d['topN']}`);
    if (E.titleDiffersFrom !== undefined) push('TITLE', r.workspace?.title !== shots[E.titleDiffersFrom]?.r.workspace?.title, `title “${r.workspace?.title}” vs step ${E.titleDiffersFrom} “${shots[E.titleDiffersFrom]?.r.workspace?.title}”`);
  }
  void lastA;
  return { id: c.id, set: c.set, category: c.category, pass: checks.every((x) => x.check.ok), checks, steps: shots.map((s, i) => ({ say: c.steps[i]!.say ?? `(choose ${c.steps[i]!.choose})`, state: s.r.state, route: orch.trace(s.r.traceId)?.route ?? null, relation: orch.trace(s.r.traceId)?.analysisContext?.relation ?? null, proposed: orch.trace(s.r.traceId)?.analysisContext?.proposedRelation ?? null, adjustments: orch.trace(s.r.traceId)?.analysisContext?.adjustments ?? [], applied: orch.trace(s.r.traceId)?.shortcut ?? null, fallbacks: (orch.trace(s.r.traceId)?.fallbacks ?? []).slice(0, 4), analysis: s.a ? `${s.a['definition']['id']} v${s.a['definition']['version']} ${s.a['definition']['name']}` : null, workspace: s.r.workspace?.title ?? null, question: s.r.clarification?.question ?? null })) };
}

console.log(`running ${cases.length} scripts (${mock ? 'deterministic engine only' : `live: default ${cfg.defaultModel}, advanced ${cfg.advancedModel}`})`);
const results = [];
for (const c of cases) { const r = await run(c); results.push(r); console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id.padEnd(6)} ${r.category.padEnd(15)} ${r.checks.filter((x) => !x.check.ok).map((x) => `[${x.step}:${x.check.metric}] ${x.check.detail}`).join(' | ').slice(0, 260)}`); }
const METRICS: Metric[] = ['MODIFY_VS_NEW', 'SORT_VS_DRILL', 'RANK_VS_FILTER', 'REFERENT', 'CORRECTION', 'CLARIFICATION', 'UNDO', 'TITLE'];
const card: Record<string, Record<string, string>> = {};
for (const set of ['KNOWN', 'HOLDOUT', 'FRESH']) {
  const all = results.filter((r) => r.set === set).flatMap((r) => r.checks);
  card[set] = Object.fromEntries(METRICS.map((m) => { const xs = all.filter((x) => x.check.metric === m); return [m, xs.length ? `${xs.filter((x) => x.check.ok).length}/${xs.length}` : '—']; }));
  card[set]!['cases'] = `${results.filter((r) => r.set === set && r.pass).length}/${results.filter((r) => r.set === set).length}`;
  /* unnecessary clarification rate: steps that must NOT ask, that asked */
  const noAsk = all.filter((x) => x.check.metric === 'CLARIFICATION');
  card[set]!['unnecessaryClarificationRate'] = noAsk.length ? `${noAsk.filter((x) => !x.check.ok).length}/${noAsk.length}` : '—';
}
console.table(card);
writeFileSync(arg('out') ?? 'sloane-context-eval.json', JSON.stringify({ at: new Date().toISOString(), mode: mock ? 'mock' : { default: cfg.defaultModel, advanced: cfg.advancedModel }, scorecard: card, results }, null, 2));
