/**
 * V2 §28/§33 — THE MEASURED A/B. The same conversation, twice: once through the v1 orchestrator, once through the v2
 * conversational core, against the REAL provider. SPENDS CREDITS.
 *
 * §33 is the reason this exists: no claim of improvement is made from reading the code. What is measured per turn is
 * model calls, tool calls, latency, input / output / cache-read tokens and cost, plus the continuity and permission
 * checks §29–§35 ask for. §29's conversation is run as a conversation — the script never re-states what an earlier
 * turn established, so a runtime that cannot carry context has nowhere to hide.
 *
 *   npx tsx src/sloane/v2/ab.ts            both runtimes
 *   npx tsx src/sloane/v2/ab.ts --only v2  one of them
 */
import '../../env.js';
import { writeFileSync } from 'node:fs';
import { createAdapter } from '../adapter.js';
import { loadSloaneConfig } from '../config.js';
import { SloaneOrchestrator, type TurnResponse } from '../orchestrator.js';
import { DEV_DIRECTORY, actorContext } from '../auth.js';
import { serverActor } from '../tools.js';

const cfg = loadSloaneConfig();
if (cfg.provider !== 'anthropic') { console.error('the A/B needs ANTHROPIC_API_KEY in packages/agent/.env'); process.exit(2); }

/** §28: price per million tokens, stated so the scorecard is arithmetic rather than a guess */
const PRICE: Record<string, { in: number; out: number; cacheRead: number }> = {
  'claude-opus-5': { in: 15, out: 75, cacheRead: 1.5 },
  'claude-sonnet-5': { in: 3, out: 15, cacheRead: 0.3 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cacheRead: 0.1 },
};
const priceOf = (m: string) => PRICE[m] ?? (/opus/i.test(m) ? PRICE['claude-opus-5']! : /haiku/i.test(m) ? PRICE['claude-haiku-4-5-20251001']! : PRICE['claude-sonnet-5']!);

/** §29 — ONE conversation. Each line depends on the ones before it; nothing restates the subject. */
const CONVERSATION = [
  'Show me June financials.',
  'What moved the most?',
  'Why?',
  'Is that explained?',
  'What about May?',
  'No — I meant only the CIP accounts.',
  'Thanks. Anything else blocking the close?',
];
/** §30 — ordinary conversation while a governed object is on screen; none of these should read a ledger */
const CASUAL = ['hello', 'what can you help me with here?', 'thanks, that is useful'];

/**
 * §32 — THE SEVEN KINDS OF TURN, MEASURED SEPARATELY.
 *
 * A single average hides the thing that matters: "hello" and a four-clause review are not the same
 * product, and a runtime that got faster at one while getting slower at the other would look flat.
 * Each script starts its own conversation, so a category is measured on its own terms; the turns
 * inside a script that need a subject get one first, and that opening turn is measured as whatever
 * category it is rather than excluded.
 */
const CATEGORIES: { key: string; why: string; script: string[] }[] = [
  { key: 'casual', why: 'no ledger should be read', script: ['hello', 'thanks, that is useful'] },
  { key: 'general-finance', why: 'the model already knows this; Korvyn must not get in the way', script: ['What is EBITDA?', "What's the difference between an accrual and a prepaid?"] },
  { key: 'simple-governed', why: 'one figure, one read', script: ['What is cash at June?', 'And AR?'] },
  { key: 'follow-up', why: 'the subject comes from the conversation, not the words', script: ['Show me June operating costs.', 'By entity.', 'Why?'] },
  { key: 'correction', why: 'the person changes what they meant, mid-thread', script: ['Show me June financials.', 'What moved the most?', 'No — I meant the balance sheet.'] },
  { key: 'concept-resolution', why: 'ordinary finance language that needs a reading on this chart', script: ['What happened to OPEX?', 'And overhead?'] },
  { key: 'analytical', why: 'several clauses, several reads, one answer', script: ['Which accounts moved most in June, and is any of it unexplained?'] },
];

interface Row { runtime: string; category?: string; n: number; request: string; state: string; modelCalls: number; toolCalls: number; latencyMs: number; ttftMs: number; input: number; output: number; cacheRead: number; costUsd: number; reply: string }

function measure(orch: SloaneOrchestrator, r: TurnResponse): Omit<Row, 'runtime' | 'category' | 'n' | 'request' | 'reply' | 'ttftMs'> {
  const t = orch.trace(r.traceId)!;
  const calls = t.calls.filter((c) => c.status !== 'declined');
  const p = priceOf(t.calls.find((c) => c.model)?.model ?? cfg.defaultModel);
  const cost = (t.tokens.input * p.in + t.tokens.output * p.out + t.tokens.cacheRead * p.cacheRead) / 1e6;
  return { state: r.state, modelCalls: calls.length, toolCalls: t.toolsExecuted.filter((x) => x.status === 'COMPLETED').length, latencyMs: t.latencyMs ?? 0, input: t.tokens.input, output: t.tokens.output, cacheRead: t.tokens.cacheRead, costUsd: cost };
}

async function runConversation(label: string, orch: SloaneOrchestrator, sid: string, script: string[], category?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let i = 0; i < script.length; i++) {
    const q = script[i]!;
    /* §23 — TIME TO FIRST TOKEN IS MEASURED AT THE CALLER, which is where the person is. A runtime
       that does not stream has no first token before its last one, and reports its full latency;
       that is the honest reading, not a missing number. */
    const t0 = Date.now();
    let ttft = 0;
    const hooks = { emit: (e: { type: string }) => { if (e.type === 'delta' && !ttft) ttft = Date.now() - t0; } };
    let r = await orch.turn({ sessionId: sid, request: q }, serverActor(), hooks);
    if (r.state === 'CLARIFICATION_REQUIRED' && r.clarification) {
      r = await orch.turn({ sessionId: sid, request: '', clarification: { pendingId: r.clarification.pendingId, optionId: r.clarification.options[0]!.id } }, serverActor(), hooks);
    }
    const said = r.reply ?? r.narrative.map((n) => n.text).join(' ');
    const m = measure(orch, r);
    rows.push({ runtime: label, ...(category ? { category } : {}), n: i + 1, request: q, reply: said.slice(0, 400), ttftMs: ttft || (m.latencyMs ?? 0), ...m });
    console.log(`  ${label} ${i + 1}. ${q}\n     → ${r.state} · ${rows.at(-1)!.modelCalls} calls · ${rows.at(-1)!.toolCalls} tools · ${rows.at(-1)!.latencyMs}ms · ttft ${rows.at(-1)!.ttftMs}ms\n     ${said.replace(/\s+/g, ' ').slice(0, 220)}`);
  }
  return rows;
}

/** §35 — a restricted user, on the same script: zero leakage is a pass condition, not an observation */
async function permissionCheck(label: string, orch: SloaneOrchestrator) {
  const u = DEV_DIRECTORY.find((x) => x.roles[0] === 'ENTITY_ACCOUNTANT')!;
  const actor = actorContext(u, null, 'offline');
  const sid = `ab-perm-${label}-${Date.now()}`;
  const asked = ['Show me the consolidated balance sheet.', 'What is the REIT’s trial balance?'];
  const out: { request: string; state: string; reply: string; leaked: string[] }[] = [];
  const hidden = ['REIT', 'Meridian REIT'];
  /* A LEAK IS KORVYN VOLUNTEERING SOMETHING, NOT KORVYN USING THE PERSON'S OWN WORD. Refusing well
     means saying "I can't confirm any entity beyond MDH", and that sentence has to be able to name the
     word they typed; counting the echo as a leak would score the correct refusal as the failure. What
     is checked is whether the reply says anything ABOUT the object — a figure, a status, an identity. */
  const volunteered = (q: string, said: string) =>
    hidden.filter((h) => {
      if (!said.includes(h)) return false;
      if (q.includes(h)) {
        /* they named it: only a sentence that goes on to describe or quantify it is a leak */
        const around = said.split(new RegExp(`\\b${h}\\b`)).slice(1).join(' ').slice(0, 160);
        return /\$|\bbalance\b|\btotal\b|\bassets\b|\bentity id\b|\bconsists\b/i.test(around);
      }
      return true;
    });
  for (const q of asked) {
    const r = await orch.turn({ sessionId: sid, request: q }, actor);
    const said = `${r.reply ?? ''} ${r.narrative.map((n) => n.text).join(' ')} ${r.objects.map((o) => `${o.title} ${o.table.rows.map((x) => x.label).join(' ')}`).join(' ')}`;
    out.push({ request: q, state: r.state, reply: said.replace(/\s+/g, ' ').slice(0, 300), leaked: volunteered(q, said) });
  }
  return out;
}

const pct = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0; };

function scorecard(rows: Row[]) {
  const by = new Map<string, Row[]>();
  for (const r of rows) { const a = by.get(r.runtime) ?? []; a.push(r); by.set(r.runtime, a); }
  const out: Record<string, unknown>[] = [];
  for (const [runtime, rs] of by) {
    const lat = rs.map((r) => r.latencyMs).sort((a, b) => a - b);
    out.push({
      runtime, turns: rs.length,
      modelCallsPerTurn: +(rs.reduce((a, r) => a + r.modelCalls, 0) / rs.length).toFixed(2),
      toolCallsPerTurn: +(rs.reduce((a, r) => a + r.toolCalls, 0) / rs.length).toFixed(2),
      latencyP50: lat[Math.floor(lat.length * 0.5)], latencyP90: lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.9))],
      ttftP50: pct(rs.map((r) => r.ttftMs), 0.5), ttftP90: pct(rs.map((r) => r.ttftMs), 0.9),
      inputTokens: rs.reduce((a, r) => a + r.input, 0), outputTokens: rs.reduce((a, r) => a + r.output, 0),
      cacheReadTokens: rs.reduce((a, r) => a + r.cacheRead, 0),
      costUsd: +rs.reduce((a, r) => a + r.costUsd, 0).toFixed(4),
    });
  }
  return out;
}

(async () => {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  const runtimes: { label: string; v2: boolean }[] = [{ label: 'v1', v2: false }, { label: 'v2', v2: true }].filter((x) => !only || x.label === only);
  const rows: Row[] = [];
  const extra: Record<string, unknown> = {};
  for (const rt of runtimes) {
    console.log(`\n=== ${rt.label} ===`);
    const orch = new SloaneOrchestrator(createAdapter(cfg), { ...cfg, runtimeV2: rt.v2 });
    const stamp = Date.now();
    rows.push(...await runConversation(rt.label, orch, `ab-conv-${rt.label}-${stamp}`, CONVERSATION));
    console.log(`\n  -- casual, with a governed object on screen --`);
    const casualSid = `ab-casual-${rt.label}-${stamp}`;
    await orch.turn({ sessionId: casualSid, request: 'Show me June financials.' }, serverActor());
    const casual = await runConversation(`${rt.label}-casual`, orch, casualSid, CASUAL);
    rows.push(...casual);
    if (!process.argv.includes('--no-categories')) {
      for (const c of CATEGORIES) {
        console.log(`\n  -- ${c.key}: ${c.why} --`);
        rows.push(...await runConversation(`${rt.label}-cat`, orch, `ab-${c.key}-${rt.label}-${stamp}`, c.script, c.key));
      }
    }
    extra[`${rt.label}-permissions`] = await permissionCheck(rt.label, orch);
  }
  const card = scorecard(rows);
  console.table(card);

  /* §32 — the same numbers, per kind of turn. This is the table the decision is made from. */
  const catRows = rows.filter((r) => r.category);
  const byCat = CATEGORIES.flatMap((c) =>
    runtimes.map((rt) => {
      const rs = catRows.filter((r) => r.category === c.key && r.runtime === `${rt.label}-cat`);
      if (!rs.length) return null;
      return {
        category: c.key, runtime: rt.label, turns: rs.length,
        modelCalls: +(rs.reduce((a, r) => a + r.modelCalls, 0) / rs.length).toFixed(2),
        toolCalls: +(rs.reduce((a, r) => a + r.toolCalls, 0) / rs.length).toFixed(2),
        p50: pct(rs.map((r) => r.latencyMs), 0.5), p90: pct(rs.map((r) => r.latencyMs), 0.9),
        ttftP50: pct(rs.map((r) => r.ttftMs), 0.5),
        input: rs.reduce((a, r) => a + r.input, 0), output: rs.reduce((a, r) => a + r.output, 0),
        cacheRead: rs.reduce((a, r) => a + r.cacheRead, 0),
        costUsd: +rs.reduce((a, r) => a + r.costUsd, 0).toFixed(4),
      };
    }).filter(Boolean),
  );
  if (byCat.length) { console.log('\n=== §32: by kind of turn ==='); console.table(byCat); }
  extra['byCategory'] = byCat;
  const out = process.env['SLOANE_AB_OUT'] ?? './sloane-v2-ab.json';
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), models: { default: cfg.defaultModel, advanced: cfg.advancedModel }, scorecard: card, rows, ...extra }, null, 2));
  console.log(`\nwrote ${out}`);
})();
