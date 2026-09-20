/**
 * PHASE 3 §33–§37 — THE CONVERSATIONAL EVALUATION.
 *
 * The Tier 1 smoke measures whether a turn is fast, grounded and permitted. It cannot measure the thing this
 * phase is about, which is whether the answer READS like a colleague. So this harness prints the WHOLE reply
 * for the brief's own conversations and scores the shape of each one:
 *
 *   words          — the length of the answer a person actually reads
 *   sections       — how many labelled headings Korvyn drew ("Summary", "Key drivers", …). §4's target is 0
 *                    for an ordinary turn.
 *   artifact       — whether a grid, an investigation or another workspace opened (§37: not for a question)
 *   presentation   — what supporting presentation the turn returned, if any
 *
 * It SPENDS CREDITS. Run it as the phase regression, not after every edit.
 *
 *   npm run sloane:v2-conv
 *   npm run sloane:v2-conv -- --only close
 */
import '../../env.js';

process.env['KORVYN_WORKLOAD'] ??= 'AUTOMATED_EVALUATION';
import { createAdapter } from '../adapter.js';
import { loadSloaneConfig } from '../config.js';
import { SloaneOrchestrator } from '../orchestrator.js';
import { DEV_DIRECTORY, actorContext } from '../auth.js';
import { serverActor, type Actor } from '../tools.js';

const cfg = loadSloaneConfig();
if (cfg.provider !== 'anthropic') { console.error('needs ANTHROPIC_API_KEY in packages/agent/.env'); process.exit(2); }

const PRICE: Record<string, { in: number; out: number; cacheRead: number }> = {
  'claude-opus-5': { in: 15, out: 75, cacheRead: 1.5 },
  'claude-sonnet-5': { in: 3, out: 15, cacheRead: 0.3 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cacheRead: 0.1 },
};
const priceOf = (m: string) => PRICE[m] ?? (/opus/i.test(m) ? PRICE['claude-opus-5']! : /haiku/i.test(m) ? PRICE['claude-haiku-4-5-20251001']! : PRICE['claude-sonnet-5']!);

interface Case { key: string; why: string; script: string[]; actor?: Actor }

const ENTITY_ACCOUNTANT = () => actorContext(DEV_DIRECTORY.find((x) => x.roles[0] === 'ENTITY_ACCOUNTANT')!, null, 'offline');

const CASES: Case[] = [
  /* §33 — the natural close test */
  { key: 'close', why: '§33 — a close conversation with no command syntax',
    script: ["What's blocking June close?", 'Who owns them?', 'Only show me the ones nobody owns.', 'Take me through the biggest one.'] },
  /* §34 — the natural financial test */
  { key: 'financial', why: '§34 — does this read like a finance professional talking',
    script: ['How did June look?', 'Anything concerning?', 'What happened to EBITDA?', 'What drove it?', 'Show me the OPEX.', 'Which accounts?'] },
  /* §35 — the simple question test */
  { key: 'simple', why: '§35 — the smallest useful answer',
    script: ['What is EBITDA?', "What's our June EBITDA?", 'How many close blockers are left?', "What's behind that number?"] },
  /* §36 — presentation escalation */
  { key: 'escalate', why: '§36 — presentation escalates because the user asked for depth',
    script: ['Which vendors changed the most?', 'Show me all vendors by entity.', 'Put it in a grid.'] },
  /* §37 — no automatic investigation */
  { key: 'no-auto-workspace', why: '§37 — an ordinary question opens nothing; an explicit one does',
    script: ["What's blocking close?", 'Investigate the largest blocker.'] },
  /* §38 — restricted user */
  { key: 'restricted', why: '§38 — natural disclosure of permitted scope, then ordinary answers',
    actor: ENTITY_ACCOUNTANT(),
    script: ["What's blocking close across the entire REIT?", 'What about my own entity?'] },
  /* conversational, with a governed object on screen */
  { key: 'casual', why: 'ordinary conversation must not become a report',
    script: ['What was June revenue?', 'Thanks — that helps.', 'Can you explain how you think about flux review?'] },
];

interface Row {
  key: string; n: number; request: string; state: string; strategy: string;
  modelCalls: number; toolCalls: number; latencyMs: number; ttftMs: number; ttfuaMs: number;
  fresh: number; cached: number; output: number; costUsd: number;
  refs: number; unresolved: number; ungrounded: string[]; violations: string[];
  words: number; sections: number; artifact: string; presentation: string; reply: string;
}

const LABELS = /^(Summary|Key drivers|What drove it|What this suggests|Worth a look|Not yet established)$/;

async function run(): Promise<Row[]> {
  const i = process.argv.indexOf('--only');
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? (i >= 0 ? process.argv[i + 1] : undefined);
  const chosen = only && !only.startsWith('--') ? CASES.filter((c) => c.key === only) : CASES;
  if (!chosen.length) { console.error(`no case "${only}" — try ${CASES.map((c) => c.key).join(', ')}`); process.exit(2); }
  const rows: Row[] = [];
  for (const c of chosen) {
    const actor = c.actor ?? serverActor();
    const orch = new SloaneOrchestrator(createAdapter(cfg), { maxPlanSteps: cfg.maxPlanSteps, runtimeV2: true }, () => actor);
    const sid = `conv-${c.key}-${Date.now()}`;
    console.log(`\n${'═'.repeat(90)}\n── ${c.key} · ${c.why}`);
    for (let n = 0; n < c.script.length; n++) {
      const q = c.script[n]!;
      const t0 = Date.now();
      let ttft = 0;
      const hooks = { emit: (e: { type: string }) => { if (e.type === 'delta' && !ttft) ttft = Date.now() - t0; } };
      let r = await orch.turn({ sessionId: sid, request: q }, actor, hooks);
      if (r.state === 'CLARIFICATION_REQUIRED' && r.clarification) {
        console.log(`\n  Q${n + 1}. ${q}\n     ? ${r.clarification.question} [${r.clarification.options.map((o) => o.label).join(' | ')}]  → taking the first`);
        r = await orch.turn({ sessionId: sid, request: '', clarification: { pendingId: r.clarification.pendingId, optionId: r.clarification.options[0]!.id } }, actor, hooks);
      }
      const t = orch.v2.recent(1)[0];
      const labelled = r.narrative.filter((x) => x.label && LABELS.test(x.label)).length;
      const said = r.reply ?? r.narrative.map((x) => (x.label ? `\n[${x.label}]\n${x.text}` : x.text)).join('\n');
      const p = priceOf(t?.model ?? cfg.defaultModel);
      const cost = t ? (t.inputTokens * p.in + t.outputTokens * p.out + t.cacheReadTokens * p.cacheRead) / 1e6 : 0;
      const artifact = r.state === 'ANSWER' && t?.path === 'analysis-handoff' ? 'ANALYSIS_GRID'
        : t?.path === 'investigation-handoff' ? 'INVESTIGATION'
          : (r as { analysis?: unknown }).analysis ? 'ANALYSIS_GRID'
            : (r as { canvas?: unknown }).canvas ? 'CANVAS'
              : (r as { agentRun?: unknown }).agentRun ? 'INVESTIGATION' : '—';
      const pres = (r as { presentation?: { kind?: string } }).presentation?.kind ?? (r.objects.length ? `objects:${r.objects.length}` : '—');
      const row: Row = {
        key: c.key, n: n + 1, request: q, state: r.state, strategy: t?.strategy ?? '—',
        modelCalls: t?.modelCalls ?? 0, toolCalls: t?.toolCalls ?? 0, latencyMs: t?.latencyMs ?? 0,
        ttftMs: ttft || (t?.firstTokenMs ?? t?.latencyMs ?? 0), ttfuaMs: t?.firstUsefulMs ?? t?.latencyMs ?? 0,
        fresh: t?.inputTokens ?? 0, cached: t?.cacheReadTokens ?? 0, output: t?.outputTokens ?? 0, costUsd: cost,
        refs: t?.factRefs ?? 0, unresolved: t?.unresolvedRefs.length ?? 0, ungrounded: t?.ungroundedFigures ?? [],
        violations: t?.responseViolations ?? [],
        words: said.trim().split(/\s+/).filter(Boolean).length, sections: labelled,
        artifact, presentation: pres, reply: said.trim(),
      };
      rows.push(row);
      console.log(`\n  Q${n + 1}. ${q}`);
      console.log(`  ─ ${row.state} · ${row.strategy} · ${row.modelCalls} call${row.modelCalls === 1 ? '' : 's'} · ${row.toolCalls} tool${row.toolCalls === 1 ? '' : 's'} · ${row.latencyMs}ms · ttfua ${row.ttfuaMs}ms · $${row.costUsd.toFixed(4)} · ${row.words}w · ${row.sections} section${row.sections === 1 ? '' : 's'} · artifact ${row.artifact} · pres ${row.presentation}`);
      if (row.violations.length) console.log(`  ! ${row.violations.join('; ')}`);
      if (row.ungrounded.length) console.log(`  ! ungrounded: ${row.ungrounded.join(', ')}`);
      for (const ln of row.reply.split('\n')) console.log(`    ${ln}`);
    }
  }
  return rows;
}

const rows = await run();

const med = (set: Row[], f: (r: Row) => number) => { const v = set.map(f).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? 0; };
const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);

console.log(`\n${'═'.repeat(90)}\n════ CONVERSATIONAL SCORECARD ════`);
console.log(`turns              ${rows.length}`);
console.log(`answer length      p50 ${med(rows, (r) => r.words)} words · max ${Math.max(...rows.map((r) => r.words))}`);
console.log(`labelled sections  ${sum((r) => r.sections)} across ${rows.filter((r) => r.sections > 0).length} turns`);
console.log(`artifacts opened   ${rows.filter((r) => r.artifact !== '—').length} (${[...new Set(rows.filter((r) => r.artifact !== '—').map((r) => `${r.key}/${r.n}:${r.artifact}`))].join(', ') || 'none'})`);
console.log(`model calls        ${sum((r) => r.modelCalls)} · ${(sum((r) => r.modelCalls) / rows.length).toFixed(2)}/turn`);
console.log(`latency            p50 ${med(rows, (r) => r.latencyMs)}ms · ttfua p50 ${med(rows, (r) => r.ttfuaMs)}ms`);
console.log(`tokens             fresh ${sum((r) => r.fresh)} · cached ${sum((r) => r.cached)} · output ${sum((r) => r.output)}`);
console.log(`cost               $${sum((r) => r.costUsd).toFixed(4)}`);
const unresolved = rows.filter((r) => r.unresolved > 0);
const bare = rows.filter((r) => r.ungrounded.length > 0);
console.log(`contract           unresolved refs ${unresolved.length} · ungrounded figures ${bare.length}`);
if (bare.length) for (const r of bare) console.log(`  ungrounded · ${r.key}/${r.n} · ${r.ungrounded.join(', ')}`);

/* §38 — what a restricted reader was told about things they cannot see */
const perm = rows.filter((r) => r.key === 'restricted');
const leaked = perm.filter((r) => {
  const after = (r.reply.split(/\bREIT\b/).slice(1).join(' ') || '').slice(0, 200);
  if (!after) return false;
  if (/\b(no|not|cannot|can’t|can't|don’t|don't|unable|outside|only|limited)\b/i.test(after)) return false;
  return /[$€£]\s?[\d,]/.test(after) || /\b(consists of|comprises|entity id)\b/i.test(after);
});
console.log(`restricted         ${perm.length} turns · volunteered ${leaked.length}`);
