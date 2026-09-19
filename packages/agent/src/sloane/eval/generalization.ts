/**
 * PHASE 8C.1 — THE GENERALIZATION HARNESS.
 *
 *   npx tsx src/sloane/eval/generalization.ts [--sets known,holdout,generated] [--gen 3] [--mock] [--only H01,H02] [--out file]
 *
 * Runs every case through the REAL orchestrator (the live model unless --mock), each in a fresh conversation as its
 * persona: setup turns establish the starting context (not scored), an optional grid focus is resolved to the cell's
 * canonical id exactly as a click would send it, then the input is scored semantically (scoring.ts).
 *
 * GENERATED cases: a separate model call paraphrases each holdout seed. The generator only writes inputs — it never
 * sees an outcome and never marks one correct; each paraphrase inherits the seed's fixed, deterministic expectations.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { createAdapter, MockLLMAdapter } from '../adapter.js';
import { loadSloaneConfig } from '../config.js';
import { SloaneOrchestrator, type TurnResponse } from '../orchestrator.js';
import { DEV_DIRECTORY, actorContext } from '../auth.js';
import type { Actor } from '../tools.js';
import { type Category, type Check, type EvalCase, type FocusSpec, type Metric, type Persona, observe, score } from './scoring.js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const sets = (arg('sets') ?? 'known,holdout').split(',');
const only = arg('only')?.split(',');
const nGen = Number(arg('gen') ?? (sets.includes('generated') ? 2 : 0));
const cfg = loadSloaneConfig();
const mock = flag('mock') || cfg.provider !== 'anthropic';
const orch = new SloaneOrchestrator(mock ? new MockLLMAdapter() : createAdapter(cfg), cfg);
const PERSONA: Record<Persona, Actor> = {
  CONTROLLER: actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:mgiri')!, null, 'eval'),
  CORPORATE: actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:skim')!, null, 'eval'),
  RESTRICTED: actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:mdh')!, null, 'eval'),
};
const load = (f: string, set: EvalCase['set']) => (JSON.parse(readFileSync(join(here, f), 'utf8')).cases as EvalCase[]).map((c) => ({ ...c, set }));

/* the grid focus a click would send: the canonical cell id of the named row in the named period's column */
function focusFor(r: TurnResponse | null, f: FocusSpec | undefined) {
  if (!r || !f) return undefined;
  const a = r.objects?.find((o) => o.type === 'FinancialAnalysis')?.analysis as Record<string, any> | undefined;
  if (!a) return undefined;
  const row = a['result']['rows'].find((x: any) => x.id === f.row || x.id.endsWith(`/${f.row}`));
  const col = a['result']['columns'].findIndex((c: any) => !f.period || c.period === f.period);
  return row && col >= 0 ? { analysisId: a['definition']['id'], cellId: row.cells[col].id } : undefined;
}

let seq = 0;
async function runCase(c: EvalCase) {
  const actor = PERSONA[c.persona ?? 'CONTROLLER'], sid = `gen-${Date.now().toString(36)}-${++seq}`;
  let last: TurnResponse | null = null, setupId: string | null = null;
  for (const s of c.setup ?? []) {
    last = await orch.turn({ sessionId: sid, request: s, ...(c.setupFocus && s === c.setup!.at(-1) ? {} : {}) }, actor);
    if (last.state === 'CLARIFICATION_REQUIRED' && last.clarification) last = await orch.turn({ sessionId: sid, clarification: { pendingId: last.clarification.pendingId, optionId: last.clarification.options[0]!.id } }, actor);
    const a = last.objects?.find((o) => o.type === 'FinancialAnalysis')?.analysis as Record<string, any> | undefined;
    if (a) setupId = a['definition']['id'];
  }
  if (c.setupFocus && last) { const f = focusFor(last, c.setupFocus); if (f) last = await orch.turn({ sessionId: sid, request: 'show me the GL behind this', focus: f }, actor); }
  const t0 = Date.now();
  const r = await orch.turn({ sessionId: sid, request: c.input, ...(c.focus ? { focus: focusFor(last, c.focus) } : {}) }, actor);
  const o = observe(orch, r);
  const checks = score(c, o, setupId);
  return { id: c.id, set: c.set, family: c.family, persona: c.persona ?? 'CONTROLLER', input: c.input, pass: checks.every((x) => x.ok), checks, outcome: o.outcome, route: o.route, calls: o.calls, notes: o.notes.slice(0, 3), reply: o.reply, wallMs: Date.now() - t0, latencyMs: o.latencyMs,
    analysis: o.analysis ? { id: o.analysis['definition']['id'], type: o.analysis['definition']['analysisType'], statement: o.analysis['definition']['statement'], periods: o.analysis['definition']['periods'], rows: o.analysis['definition']['rows'].map((x: any) => x.dimension), columns: o.analysis['definition']['columns'].map((x: any) => x.dimension), measures: o.analysis['definition']['measures'], filters: o.analysis['definition']['filters'].map((f: any) => `${f.dimension}${f.op === 'NOT_IN' ? '!=' : '='}${f.values.join('|')}`), panel: o.analysis['panel']?.['kind'] ?? null, source: o.analysis['source'] } : null,
    tools: o.tools, setupId };
}

/* a DIFFERENT model call writes paraphrases; it never sees results */
async function paraphrases(seed: EvalCase, n: number): Promise<string[]> {
  const client = new Anthropic();
  const msg = await client.messages.create({ model: process.env['SLOANE_EVAL_GEN_MODEL'] ?? 'claude-haiku-4-5', max_tokens: 400,
    system: 'You write test inputs for a finance assistant. Given one request a controller might type, write alternative ways a real accountant would type the SAME request: vary wording, word order, shorthand, casual tone, occasional typos. Keep the same meaning and the same periods. Return only the lines, one per line, no numbering.',
    messages: [{ role: 'user', content: `${seed.setup?.length ? `(It follows on from: "${seed.setup.join('" then "')}")\n` : ''}Request: ${seed.input}\nWrite ${n} alternatives.` }] });
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  return text.split('\n').map((l) => l.replace(/^[-*\d.)\s"]+|"$/g, '').trim()).filter((l) => l.length > 2 && l.length < 200 && l.toLowerCase() !== seed.input.toLowerCase()).slice(0, n);
}

async function main() {
  let cases: EvalCase[] = [];
  if (sets.includes('known')) cases.push(...load('known.json', 'KNOWN'));
  const hold = load('holdout.json', 'HOLDOUT');
  if (sets.includes('holdout')) cases.push(...hold);
  if (nGen > 0 && !mock) {
    const seeds = hold.filter((c) => !['PERMISSION', 'CONVERSATION'].includes(c.family) && !c.focus && !c.setupFocus);
    for (const s of seeds) { try { (await paraphrases(s, nGen)).forEach((p, i) => cases.push({ ...s, id: `${s.id}g${i + 1}`, input: p, set: 'GENERATED' })); } catch (e) { console.error('paraphrase failed', s.id, (e as Error).message); } }
  }
  if (only) cases = cases.filter((c) => only.some((o) => c.id === o || c.id.startsWith(`${o}g`)));
  console.log(`running ${cases.length} cases (${mock ? 'deterministic engine only' : `live: ${cfg.model}`})`);
  const results: Awaited<ReturnType<typeof runCase>>[] = [];
  for (const c of cases) {
    try { const r = await runCase(c); results.push(r); console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id.padEnd(7)} ${r.outcome.padEnd(12)} ${String(r.wallMs).padStart(6)}ms  ${c.input.slice(0, 70)}${r.pass ? '' : `\n        ${r.checks.filter((x: Check) => !x.ok).map((x: Check) => `${x.category}: ${x.detail}`).join('\n        ')}`}`); }
    catch (e) { console.log(`ERR  ${c.id} ${(e as Error).message}`); }
  }
  /* ---- the scorecard ---- */
  const METRICS: Metric[] = ['intent', 'analysis', 'context', 'referent', 'clarification', 'tools', 'unsupported', 'permission'];
  const card: Record<string, Record<string, string>> = {};
  for (const set of ['KNOWN', 'HOLDOUT', 'GENERATED']) {
    const R = results.filter((r) => r.set === set); if (!R.length) continue;
    card[set] = { cases: `${R.filter((r) => r.pass).length}/${R.length} (${Math.round((100 * R.filter((r) => r.pass).length) / R.length)}%)` };
    for (const m of METRICS) { const ch = R.flatMap((r) => r.checks.filter((x: Check) => x.metric === m)); if (ch.length) card[set]![m] = `${ch.filter((x) => x.ok).length}/${ch.length} (${Math.round((100 * ch.filter((x) => x.ok).length) / ch.length)}%)`; }
  }
  const cats: Record<string, number> = {};
  for (const r of results) for (const x of r.checks) if (!x.ok) cats[`${r.set}:${x.category as Category}`] = (cats[`${r.set}:${x.category}`] ?? 0) + 1;
  const lat = (f: (r: (typeof results)[number]) => boolean) => { const v = results.filter(f).map((r) => r.latencyMs).sort((a, b) => a - b); return v.length ? { n: v.length, p50: v[Math.floor(v.length / 2)], p90: v[Math.floor(v.length * 0.9)] } : null; };
  const latency = { deterministic: lat((r) => r.analysis?.source === 'deterministic' || r.route === 'CANVAS'), modelFollowUp: lat((r) => r.analysis?.source === 'reasoning' && !!r.setupId), modelNewAnalysis: lat((r) => r.analysis?.source === 'reasoning' && !r.setupId), compound: lat((r) => r.family === 'COMPOUND'), all: lat(() => true) };
  console.log('\nSCORECARD'); console.table(card); console.log('FAILURE CATEGORIES', cats); console.log('LATENCY (server ms)', latency);
  writeFileSync(arg('out') ?? 'sloane-generalization.json', JSON.stringify({ at: new Date().toISOString(), mode: mock ? 'mock' : cfg.model, scorecard: card, categories: cats, latency, results }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
