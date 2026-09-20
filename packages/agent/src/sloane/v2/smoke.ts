/**
 * PHASE 2.5 §23 — TIER 1: THE DEVELOPMENT SMOKE.
 *
 * Fifteen turns against the REAL provider, covering the kinds of turn this phase changed: a direct fact, a
 * reasoned one, a follow-up, a trace chain, a conceptual question, a negative/sign case and a permission
 * refusal. It SPENDS CREDITS, and it is the harness to run while iterating — the 25-turn A/B is the phase
 * regression and the 125-prompt benchmark is the final gate, each run once rather than after every edit.
 *
 * What it reports per turn: the strategy Korvyn chose, model calls, tool calls, latency, TTFT, TTFUA, and
 * fresh / cached / output tokens separately (§11), because a single "input" number hides the thing this phase
 * is about. The contract checks are Korvyn's own trace findings, never a grader's reading of the prose.
 *
 *   npm run sloane:v2-smoke
 *   npm run sloane:v2-smoke -- --only direct
 */
import '../../env.js';

/* §24 — these tokens are a benchmark's, not a person's. `WORKLOAD` is read per turn, so setting it after the
   imports have been hoisted still takes effect. */
process.env['KORVYN_WORKLOAD'] ??= 'AUTOMATED_EVALUATION';
import { createAdapter } from '../adapter.js';
import { loadSloaneConfig } from '../config.js';
import { SloaneOrchestrator } from '../orchestrator.js';
import { DEV_DIRECTORY, actorContext } from '../auth.js';
import { serverActor, type Actor } from '../tools.js';

const cfg = loadSloaneConfig();
if (cfg.provider !== 'anthropic') { console.error('the smoke needs ANTHROPIC_API_KEY in packages/agent/.env'); process.exit(2); }

/** §28's prices, stated so the scorecard is arithmetic rather than a guess */
const PRICE: Record<string, { in: number; out: number; cacheRead: number }> = {
  'claude-opus-5': { in: 15, out: 75, cacheRead: 1.5 },
  'claude-sonnet-5': { in: 3, out: 15, cacheRead: 0.3 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cacheRead: 0.1 },
};
const priceOf = (m: string) => PRICE[m] ?? (/opus/i.test(m) ? PRICE['claude-opus-5']! : /haiku/i.test(m) ? PRICE['claude-haiku-4-5-20251001']! : PRICE['claude-sonnet-5']!);

/**
 * Each case names what it is FOR, so a slow or expensive one can be read against its purpose rather than
 * against an average. A script runs as ONE conversation: nothing restates the subject.
 */
interface Case { key: string; why: string; script: string[]; actor?: Actor; expect?: 'GROUNDED_DIRECT' | 'GROUNDED_REASONING' | 'ANY' }
const CASES: Case[] = [
  { key: 'direct', why: 'the figure IS the answer — one model call', expect: 'GROUNDED_DIRECT',
    script: ['What is our June OPEX?', "And what's the CIP balance?"] },
  { key: 'stock-vs-flow', why: 'capex asked as spend is a flow, not the CIP balance', expect: 'GROUNDED_DIRECT',
    script: ['How much capex did we spend in June?'] },
  { key: 'reasoning', why: 'a judgement genuinely needs the second call', expect: 'GROUNDED_REASONING',
    script: ['Why did OPEX increase in June?'] },
  { key: 'follow-up', why: 'the subject comes from the conversation, not the words', expect: 'ANY',
    script: ['Show me June construction in progress.', 'By project.'] },
  { key: 'trace', why: 'a drill chain: how many calls does each step cost', expect: 'ANY',
    script: ['What is our June OPEX?', "What's behind that?", 'Show the accounts.'] },
  { key: 'conceptual', why: 'the model already knows this; Korvyn must not read a ledger', expect: 'ANY',
    script: ['What is EBITDA?'] },
  { key: 'negative', why: 'a credit stays a credit and a decrease stays a decrease', expect: 'ANY',
    script: ['What is accounts payable at June, and did it go up or down?'] },
  /* PHASE 2.6 — the derived-metric cases. A metric is not a posted line, and "what is June EBITDA" should cost
     exactly what "what is June OPEX" costs: one call, because the read settles it. */
  { key: 'metric', why: 'a derived metric is governed, and a lookup of one is still a lookup', expect: 'ANY',
    script: ['How about EBITDA?', 'Compare EBITDA May vs June.', 'What drove the change?'] },
  { key: 'comparison', why: 'the whole statement is ranked, not the one line that carried a fact', expect: 'ANY',
    script: ['Compare May and June income statement and tell me the largest movements.'] },
  /* PHASE 2.6.1 — the consolidation chain. A movement explained from account detail has to be the SAME
     population as the statement that stated it, and "does this include eliminations?" has to be answerable. */
  { key: 'consolidation', why: 'statement and drill are one population, and the basis is answerable', expect: 'ANY',
    script: ['What was June revenue?', 'Break that down by account.', 'Does that include intercompany eliminations?'] },
  /* PHASE 3: 'ANY', because refusing WITHOUT a read became the common answer and is strictly better — it
     leaks nothing, costs one call and no tool, and §29's rule was that a limited reader is WORDED rather than
     composed, which a conversation-only turn also satisfies. What is asserted is the leak count below. */
  { key: 'permission', why: 'a refusal is worded, never composed, and leaks nothing', expect: 'ANY',
    actor: actorContext(DEV_DIRECTORY.find((x) => x.roles[0] === 'ENTITY_ACCOUNTANT')!, null, 'offline'),
    script: ['Show me the consolidated balance sheet.', "What is the REIT's trial balance?"] },
];

interface Row {
  key: string; n: number; request: string; state: string; strategy: string; shape: string; reason: string;
  modelCalls: number; toolCalls: number; latencyMs: number; ttftMs: number; ttfuaMs: number;
  fresh: number; cached: number; output: number; costUsd: number;
  refs: number; unresolved: number; ungrounded: string[]; violations: string[]; reply: string;
}

async function run(): Promise<Row[]> {
  const i = process.argv.indexOf('--only');
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? (i >= 0 ? process.argv[i + 1] : undefined);
  const chosen = only && !only.startsWith('--') ? CASES.filter((c) => c.key === only) : CASES;
  if (!chosen.length) { console.error(`no case named "${only}" — try ${CASES.map((c) => c.key).join(', ')}`); process.exit(2); }
  const rows: Row[] = [];
  for (const c of chosen) {
    const orch = new SloaneOrchestrator(createAdapter(cfg), { maxPlanSteps: cfg.maxPlanSteps, runtimeV2: true }, () => c.actor ?? serverActor());
    const sid = `smoke-${c.key}-${Date.now()}`;
    console.log(`\n── ${c.key} · ${c.why}`);
    for (let i = 0; i < c.script.length; i++) {
      const q = c.script[i]!;
      const t0 = Date.now();
      let ttft = 0;
      const hooks = { emit: (e: { type: string }) => { if (e.type === 'delta' && !ttft) ttft = Date.now() - t0; } };
      let r = await orch.turn({ sessionId: sid, request: q }, c.actor ?? serverActor(), hooks);
      if (r.state === 'CLARIFICATION_REQUIRED' && r.clarification) {
        r = await orch.turn({ sessionId: sid, request: '', clarification: { pendingId: r.clarification.pendingId, optionId: r.clarification.options[0]!.id } }, c.actor ?? serverActor(), hooks);
      }
      const t = orch.v2.recent(1)[0];
      const said = r.reply ?? r.narrative.map((n) => n.text).join(' ');
      const p = priceOf(t?.model ?? cfg.defaultModel);
      const cost = t ? (t.inputTokens * p.in + t.outputTokens * p.out + t.cacheReadTokens * p.cacheRead) / 1e6 : 0;
      const row: Row = {
        key: c.key, n: i + 1, request: q, state: r.state,
        strategy: t?.strategy ?? '—', shape: t?.directShape ?? '—', reason: t?.strategyReason ?? '',
        modelCalls: t?.modelCalls ?? 0, toolCalls: t?.toolCalls ?? 0, latencyMs: t?.latencyMs ?? 0,
        ttftMs: ttft || (t?.firstTokenMs ?? t?.latencyMs ?? 0), ttfuaMs: t?.firstUsefulMs ?? t?.latencyMs ?? 0,
        fresh: t?.inputTokens ?? 0, cached: t?.cacheReadTokens ?? 0, output: t?.outputTokens ?? 0, costUsd: cost,
        refs: t?.factRefs ?? 0, unresolved: t?.unresolvedRefs.length ?? 0, ungrounded: t?.ungroundedFigures ?? [],
        violations: t?.responseViolations ?? [], reply: said.replace(/\s+/g, ' ').slice(0, 260),
      };
      rows.push(row);
      const flag = c.expect && c.expect !== 'ANY' && row.strategy !== c.expect ? `  ⚠ expected ${c.expect}` : '';
      console.log(`  ${i + 1}. ${q}`);
      console.log(`     → ${row.strategy}${row.shape !== '—' ? `/${row.shape}` : ''} · ${row.modelCalls} call${row.modelCalls === 1 ? '' : 's'} · ${row.toolCalls} tool${row.toolCalls === 1 ? '' : 's'} · ${row.latencyMs}ms · ttft ${row.ttftMs}ms · ttfua ${row.ttfuaMs}ms · $${row.costUsd.toFixed(4)}${flag}`);
      if (row.reason) console.log(`       why not direct: ${row.reason}`);
      console.log(`     ${row.reply}`);
    }
  }
  return rows;
}

const rows = await run();

/* ---- the scorecard ---------------------------------------------------------------------------- */
const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
const med = (f: (r: Row) => number) => { const v = rows.map(f).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? 0; };
const direct = rows.filter((r) => r.strategy === 'GROUNDED_DIRECT');
const reason = rows.filter((r) => r.strategy === 'GROUNDED_REASONING');
const band = (label: string, set: Row[]) => set.length
  ? `${label.padEnd(18)} ${String(set.length).padStart(2)} turns · ${(set.reduce((a, r) => a + r.modelCalls, 0) / set.length).toFixed(2)} calls · p50 ${med2(set, (r) => r.latencyMs)}ms · ttfua p50 ${med2(set, (r) => r.ttfuaMs)}ms · $${(set.reduce((a, r) => a + r.costUsd, 0) / set.length).toFixed(4)}/turn`
  : `${label.padEnd(18)} —`;
function med2(set: Row[], f: (r: Row) => number) { const v = set.map(f).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? 0; }

console.log('\n════ TIER 1 SMOKE ════');
console.log(band('GROUNDED_DIRECT', direct));
console.log(band('GROUNDED_REASONING', reason));
console.log(`\ntotal              ${rows.length} turns · ${sum((r) => r.modelCalls)} model calls · ${sum((r) => r.toolCalls)} tool calls`);
console.log(`tokens             fresh ${sum((r) => r.fresh)} · cached ${sum((r) => r.cached)} · output ${sum((r) => r.output)}`);
console.log(`latency            p50 ${med((r) => r.latencyMs)}ms · ttft p50 ${med((r) => r.ttftMs)}ms · ttfua p50 ${med((r) => r.ttfuaMs)}ms`);
console.log(`cost               $${sum((r) => r.costUsd).toFixed(4)}`);

/* §15/§16 — the contract, read off Korvyn's own trace */
const unresolved = rows.filter((r) => r.unresolved > 0);
const bare = rows.filter((r) => r.ungrounded.length > 0);
const prose = rows.filter((r) => r.violations.some((v) => /prose/.test(v)));
console.log(`\ncontract           unresolved refs ${unresolved.length} · figures with no governed reference ${bare.length} · prose escapes ${prose.length}`);
if (bare.length) for (const r of bare) console.log(`  ungrounded · ${r.key}/${r.n} · ${r.ungrounded.join(', ')} · ${r.request}`);
if (prose.length) for (const r of prose) console.log(`  prose · ${r.key}/${r.n} · ${r.request}`);

/* §29 — a refusal must leak nothing it was not given.
   A LEAK IS KORVYN VOLUNTEERING SOMETHING, NOT KORVYN USING THE PERSON'S OWN WORD: refusing well means being
   able to say "I can't produce a REIT-wide trial balance", so the signal is a FIGURE or an affirmative identity
   claim after the echo — the two things a refusal never contains. */
const perm = rows.filter((r) => r.key === 'permission');
const leaked = perm.filter((r) => {
  const after = (r.reply.split(/\bREIT\b/).slice(1).join(' ') || '').slice(0, 160);
  if (!after) return false;
  /* A REFUSAL CLAUSE CAN ARRIVE MID-SENTENCE — "this is MDH's trial balance, NOT the REIT parent" — so the
     negation is looked for across the whole window rather than only at its head. Observed scoring a correct
     refusal as a leak, which is the one mistake this check must not make. */
  if (/\b(no|not|cannot|can’t|can't|don’t|don't|unable|outside|only)\b/i.test(after)) return false;
  return /[$€£]\s?[\d,]/.test(after) || /\b(consists of|comprises|entity id)\b/i.test(after);
});
console.log(`permission         ${perm.length} turns · volunteered ${leaked.length}`);
