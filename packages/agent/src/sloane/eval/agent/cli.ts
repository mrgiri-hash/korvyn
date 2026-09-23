/**
 * A5 §19/§20 — RUNNING THE AGENT EVALUATION.
 *
 *   npm run agent:eval                                  every scenario, DETERMINISTIC (free)
 *   npm run agent:eval -- --live                        every scenario against the configured model (SPENDS CREDITS)
 *   npm run agent:eval -- --live --scenario close-june-standard
 *   npm run agent:eval -- --live --profile CLOSE --repeat 3
 *   npm run agent:eval -- --live --estimate             what it would cost, without running anything
 *   npm run agent:eval -- --live --model claude-sonnet-5 --advanced claude-opus-5   §13 routing override
 *   npm run agent:eval -- --no-history                  score without appending to the regression record
 *
 * §20 — LIVE IS NEVER THE DEFAULT, and no ordinary test gate runs it. `--live` is a deliberate keystroke, the
 * estimate is one flag away, and a scenario filter is the cheapest control of all.
 */
import '../../../env.js';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSloaneConfig } from '../../config.js';
import { MockLLMAdapter } from '../../adapter.js';
import { AgentEvalHarness, historyEntry, type RoutingOverride } from './harness.js';
import type { AgentEvalScenario, EvalHistoryEntry, ScenarioResult, ScenarioSuite } from './model.js';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k: string) => argv.includes(`--${k}`);
const arg = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };

const live = flag('live');
const repeat = Math.max(1, Number(arg('repeat') ?? 1));
const only = arg('scenario')?.split(',');
const wantProfile = arg('profile');
const estimateOnly = flag('estimate');

/* ---- the suites ------------------------------------------------------------------------------- */
const dir = join(here, 'scenarios');
const suites: ScenarioSuite[] = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ScenarioSuite);
const selected: { suite: ScenarioSuite; sc: AgentEvalScenario }[] = [];
for (const suite of suites) {
  for (const sc of suite.scenarios) {
    if (only && !only.includes(sc.id)) continue;
    if (wantProfile && sc.profile !== wantProfile) continue;
    selected.push({ suite, sc });
  }
}
if (!selected.length) { console.error('no scenarios matched'); process.exit(2); }

/* ---- §20 the estimate, before anything is spent ------------------------------------------------ */
const histFile = join(here, 'history.json');
const history: EvalHistoryEntry[] = existsSync(histFile) ? JSON.parse(readFileSync(histFile, 'utf8')) : [];
const lastOf = (id: string) => [...history].reverse().find((h) => h.scenarioId === id && h.mode === 'LIVE') ?? null;
if (estimateOnly || live) {
  let known = 0, unknown = 0, est = 0;
  for (const { sc } of selected) { const p = lastOf(sc.id); if (p) { known += 1; est += p.economics.estimatedCostUsd * repeat; } else unknown += 1; }
  const avg = known ? est / (known * repeat) : 0.25;
  const total = est + unknown * repeat * avg;
  console.log(`${selected.length} scenario${selected.length === 1 ? '' : 's'} × ${repeat} run${repeat === 1 ? '' : 's'} · estimated $${total.toFixed(2)}` +
    `${unknown ? ` (${unknown} never run live; estimated at $${avg.toFixed(2)} each)` : ''}`);
  if (estimateOnly) process.exit(0);
}

/* ---- the harness ------------------------------------------------------------------------------- */
const cfg = loadSloaneConfig();
if (live && cfg.provider !== 'anthropic') { console.error('--live needs a configured provider (packages/agent/.env).'); process.exit(2); }
const routing: RoutingOverride | undefined = (arg('model') || arg('advanced') || arg('provider'))
  ? { ...(arg('model') ? { defaultModel: arg('model')! } : {}), ...(arg('advanced') ? { advancedModel: arg('advanced')! } : {}), ...(arg('provider') ? { provider: arg('provider')! } : {}) }
  : undefined;
const harness = new AgentEvalHarness({
  mode: live ? 'LIVE' : 'DETERMINISTIC',
  cfg, ...(routing ? { routing } : {}),
  ...(live ? {} : { adapter: new MockLLMAdapter() }),
  waitMs: live ? 300_000 : 30_000,
});

console.log(`${live ? 'LIVE' : 'DETERMINISTIC'} · ${selected.length} scenario(s) × ${repeat} · ${harness.cfg.provider}` +
  `${live ? ` · ${harness.cfg.defaultModel} / ${harness.cfg.advancedModel}` : ''}\n`);

/* ---- run --------------------------------------------------------------------------------------- */
const money = (n: number) => `$${n.toFixed(4)}`;
const results: { sc: AgentEvalScenario; suite: ScenarioSuite; runs: ScenarioResult[] }[] = [];
for (const { suite, sc } of selected) {
  const runs: ScenarioResult[] = [];
  for (let k = 0; k < repeat; k++) runs.push(await harness.run(sc));
  results.push({ sc, suite, runs });

  for (const r of runs) {
    const mark = r.verdict === 'PASS' ? 'PASS' : r.verdict === 'FAIL' ? 'FAIL' : r.verdict === 'SKIPPED' ? 'SKIP' : 'ERR ';
    const e = r.economics;
    console.log(`${mark}  ${r.scenarioId.padEnd(24)} ${String(r.status).padEnd(24)} ${(r.profile ?? '-').padEnd(20)} ` +
      `${e.modelCalls}m ${e.toolCalls}t ${Math.round(e.latencyMs / 1000)}s ${money(e.estimatedCostUsd)}`);
    if (r.coverage) {
      const c = r.coverage;
      if (c.known.length) console.log(`      findings  ${c.found.length}/${c.known.length} found${c.missed.length ? ` · MISSED ${c.missed.map((m) => `${m.label} [${m.severity}]`).join('; ')}` : ''}`);
      if (c.falsePositives.length) console.log(`      FALSE POSITIVE  ${c.falsePositives.map((f) => f.why).join('; ')}`);
    }
    for (const h of r.hardFailures) console.log(`      HARD  ${h}`);
    for (const s of r.softFailures) console.log(`      soft  ${s}`);
    for (const nn of r.notes) console.log(`      note  ${nn}`);
  }
  if (repeat > 1) {
    const passed = runs.filter((r) => r.verdict === 'PASS').length;
    const known = sc.expectedFindings ?? [];
    console.log(`      ×${repeat}  passed ${passed}/${repeat}` +
      known.map((e) => ` · ${e.id} found ${runs.filter((r) => r.coverage?.found.some((f) => f.id === e.id)).length}/${repeat}`).join(''));
  }
}

/* ---- the dimension table: §2, and it does not average ------------------------------------------ */
console.log('');
const dims = new Map<string, { hard: number; hardFailed: number; soft: number; softFailed: number }>();
for (const { runs } of results) for (const r of runs) for (const [k, v] of Object.entries(r.dimensions)) {
  const d = dims.get(k) ?? { hard: 0, hardFailed: 0, soft: 0, softFailed: 0 };
  dims.set(k, { hard: d.hard + v.hard, hardFailed: d.hardFailed + v.hardFailed, soft: d.soft + v.soft, softFailed: d.softFailed + v.softFailed });
}
console.table([...dims.entries()].map(([dimension, v]) => ({ dimension, hard: v.hard, 'hard failed': v.hardFailed, soft: v.soft, 'soft failed': v.softFailed })));

const all = results.flatMap((r) => r.runs);
const passed = all.filter((r) => r.verdict === 'PASS').length;
const cost = all.reduce((n, r) => n + r.economics.estimatedCostUsd, 0);
const skipped = all.filter((r) => r.verdict === 'SKIPPED').length;
console.log(`${passed}/${all.length - skipped} passed${skipped ? ` · ${skipped} skipped (need a model — run with --live)` : ''} · ${money(cost)}${live ? '' : ' (deterministic — no provider call)'}`);

/* ---- §14 the regression record, appended ------------------------------------------------------- */
if (!flag('no-history') && live) {
  for (const { sc, suite, runs } of results) for (const r of runs) history.push(historyEntry(r, sc, harness.cfg, 'LIVE', suite.suite));
  mkdirSync(dirname(histFile), { recursive: true });
  writeFileSync(histFile, JSON.stringify(history, null, 1));
  console.log(`appended ${all.length} result(s) to ${histFile.split('src')[1]}`);
  /**
   * §14 — WHAT MOVED SINCE THE LAST LIVE RUN. `before` is the last entry for this scenario that is not one this
   * invocation just appended, so comparing is comparing against history rather than against ourselves. A PASS
   * that became a FAIL is the one word this table exists to print.
   */
  const appended = new Set(history.slice(-all.length));
  const moved = results.map(({ sc, runs }) => {
    const before = [...history].reverse().find((h) => h.scenarioId === sc.id && h.mode === 'LIVE' && !appended.has(h)) ?? null;
    const now = runs[0]!;
    return {
      scenario: sc.id,
      previous: before?.verdict ?? 'baseline', now: now.verdict,
      costBefore: before ? Number(before.economics.estimatedCostUsd.toFixed(4)) : null,
      costNow: Number(now.economics.estimatedCostUsd.toFixed(4)),
      verdict: !before ? 'baseline'
        : before.verdict === 'PASS' && now.verdict !== 'PASS' ? 'REGRESSION'
          : before.verdict !== 'PASS' && now.verdict === 'PASS' ? 'fixed' : 'unchanged',
    };
  });
  console.table(moved);
}

const out = arg('out');
if (out) { writeFileSync(out, JSON.stringify(results, null, 1)); console.log(`wrote ${out}`); }

/* a HARD failure is a failing exit code: this is a gate, not a report (§15) */
process.exit(all.some((r) => r.verdict === 'FAIL' || r.verdict === 'ERROR') ? 1 : 0);
