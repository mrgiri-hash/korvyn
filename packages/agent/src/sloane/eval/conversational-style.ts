/**
 * PHASE 3 §40 — DIRECT CLAUDE vs SLOANE, ON STYLE.
 *
 * The 125-prompt benchmark (`direct-vs-sloane.ts`) asks whether Sloane UNDERSTANDS as well as the bare model and
 * whether it adds a correct enterprise resolution. This asks a different question, and it is the one Phase 3 is
 * about: does Sloane sound materially worse than the model it is built on?
 *
 * Both arms run the SAME configured model, so a difference is Korvyn's doing and never a difference in raw
 * capability. Enterprise factual correctness is deliberately NOT compared — the bare model has no book, and §40
 * says so. What is compared is what a reader feels:
 *
 *   words            how long the answer is
 *   headings         manufactured section labels over a short answer
 *   artifacts        a workspace opened for a question
 *   plumbing         implementation language — tools, reads, populations, fields, schemas
 *   deflection       answering with a question when the conversation could have decided
 *
 * The questions are written for this file and appear nowhere in routing code or in any prompt (the contamination
 * guard below asserts it). It SPENDS CREDITS on both arms.
 *
 *   npm run sloane:style
 *   npm run sloane:style -- --only 4
 */
import '../../env.js';

process.env['KORVYN_WORKLOAD'] ??= 'AUTOMATED_EVALUATION';
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { createAdapter } from '../adapter.js';
import { loadSloaneConfig } from '../config.js';
import { SloaneOrchestrator } from '../orchestrator.js';
import { serverActor } from '../tools.js';
import { V2_SYSTEM } from '../prompts.js';
import { internalVocabulary } from '../v2/respond.js';

const cfg = loadSloaneConfig();
if (cfg.provider !== 'anthropic') { console.error('needs ANTHROPIC_API_KEY in packages/agent/.env'); process.exit(2); }

/**
 * §40's set. Ordinary things a controller says, in ordinary words — none of them phrased the way any example in
 * a prompt or a test is phrased, and none of them a command.
 */
const QUESTIONS: string[] = [
  'How are we tracking on close this month?',
  'Anything I should be worried about before I sign off?',
  'Is the intercompany stuff sorted yet?',
  'Give me the short version of where revenue landed.',
  'Did costs move much?',
  'What is sitting in construction in progress right now?',
  'Has anyone looked at the payables swing?',
  'Remind me what a roll-forward is meant to prove.',
  'Which reconciliations are still open?',
  'Is our margin holding up?',
  'How much did we spend with our biggest supplier?',
  'What does unexplained actually mean here?',
  'Are the German numbers in yet?',
  'Show me where the cash went.',
  'Anything unusual in the ledger this month?',
  'Who still owes me work?',
  'Is there anything blocking the quarter, not just the month?',
  'How does our depreciation look versus last month?',
  'What would you look at first if you were me?',
  'Can we close on time?',
  'Is the balance sheet in balance?',
  'What is the biggest single number that moved?',
  'Explain why flux review matters to an auditor.',
  'How many entities are we consolidating?',
  'Is there anything I can clear quickly?',
];

/* ---- the contamination guard (the discipline `direct-vs-sloane.ts` already holds) ----------------- */
const SRC = ['orchestrator.ts', 'prompts.ts', 'v2/runtime.ts', 'v2/strategy.ts', 'v2/compose.ts', 'v2/respond.ts', 'semantic/concepts.ts']
  .map((f) => { try { return readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'); } catch { return ''; } }).join('\n');
const leaked = QUESTIONS.filter((q) => SRC.includes(q));
if (leaked.length) { console.error(`these questions appear in routing code or a prompt:\n  ${leaked.join('\n  ')}`); process.exit(2); }

/* ---- the deterministic style read ---------------------------------------------------------------- */
/* §17 — ONE DEFINITION OF PLUMBING, and it is the product's. A second regex here would be a second answer
   to "did internal vocabulary reach the person", and the two would drift within a phase.
   `internalVocabulary` is what Korvyn records in its own trace, so it is what this scores. */
const HEADING = /^(summary|key drivers|what drove it|what this suggests|worth a look|not yet established|overview|analysis|recommendation)s?:?\s*$/im;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

interface Row { n: number; q: string; arm: 'direct' | 'sloane'; words: number; headings: number; plumbing: string[]; artifact: string; deflected: boolean; ms: number; text: string }

const style = (text: string): { headings: number; plumbing: string[] } => ({
  headings: (text.match(HEADING) ?? []).length,
  plumbing: internalVocabulary(text),
});
/**
 * A DEFLECTION IS A TURN THAT ANSWERS NOTHING, not an answer that ends with an offer. "Costs barely moved …
 * Want the revenue drivers?" is exactly the shape §7 asks for and the first cut scored it as a deflection —
 * so the only deflection counted is a turn whose WHOLE content is a question.
 */
const deflects = (text: string): boolean => { const t = text.trim(); return /\?\s*$/.test(t) && !/[.!]/.test(t.replace(/\b(vs|approx|etc|e\.g|i\.e)\./gi, '')); };

async function main() {
  const i = process.argv.indexOf('--only');
  const only = Number(process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? (i >= 0 ? process.argv[i + 1] : NaN));
  const set = Number.isFinite(only) ? QUESTIONS.slice(0, only) : QUESTIONS;
  const adapter = createAdapter(cfg);
  const sdk = new Anthropic();
  const rows: Row[] = [];

  for (let n = 0; n < set.length; n++) {
    const q = set[n]!;
    console.log(`\n${'─'.repeat(88)}\n${n + 1}. ${q}`);

    /* ARM A — THE BARE MODEL, THROUGH THE SDK AND NOT THROUGH KORVYN'S ADAPTER.
       Sloane's adapter refuses a call with no governed tool, which is a guarantee worth having and makes it the
       wrong instrument for this arm: a comparison against "the model" has to be against the model, with none of
       Korvyn in the loop. Same model id, so the difference measured is Korvyn's doing. */
    const t0 = Date.now();
    const raw = await sdk.messages.create({
      model: cfg.defaultModel, max_tokens: 900,
      system: 'You are a helpful financial assistant talking with a finance professional about their company’s books.',
      messages: [{ role: 'user', content: q }],
    });
    const dtext = raw.content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join(String.fromCharCode(10)).trim();
    const ds = style(dtext);
    rows.push({ n: n + 1, q, arm: 'direct', words: words(dtext), ...ds, artifact: '—', deflected: deflects(dtext), ms: Date.now() - t0, text: dtext });

    /* ARM B — Sloane, one fresh conversation per question so nothing carries over */
    const orch = new SloaneOrchestrator(adapter, { maxPlanSteps: cfg.maxPlanSteps, runtimeV2: true }, () => serverActor());
    const t1 = Date.now();
    let r = await orch.turn({ sessionId: `style-${n}-${Date.now()}`, request: q }, serverActor());
    if (r.state === 'CLARIFICATION_REQUIRED' && r.clarification) {
      rows.push({ n: n + 1, q, arm: 'sloane', words: words(r.clarification.question), headings: 0, plumbing: [], artifact: '—', deflected: true, ms: Date.now() - t1, text: `? ${r.clarification.question}` });
      console.log(`  DIRECT (${rows.at(-2)!.words}w): ${dtext.replace(/\s+/g, ' ').slice(0, 200)}`);
      console.log(`  SLOANE  asked back: ${r.clarification.question}`);
      continue;
    }
    const t = orch.v2.recent(1)[0];
    const stext = (r.reply ?? r.narrative.map((x) => x.text).join('\n')).trim();
    const ss = style(stext);
    const artifact = t?.path === 'analysis-handoff' ? 'ANALYSIS_GRID' : t?.path === 'investigation-handoff' ? 'INVESTIGATION' : '—';
    rows.push({ n: n + 1, q, arm: 'sloane', words: words(stext), ...ss, artifact, deflected: deflects(stext), ms: Date.now() - t1, text: stext });
    console.log(`  DIRECT (${rows.at(-2)!.words}w, ${ds.headings} headings): ${dtext.replace(/\s+/g, ' ').slice(0, 200)}`);
    console.log(`  SLOANE (${words(stext)}w, ${ss.headings} headings, ${t?.modelCalls ?? 0} calls): ${stext.replace(/\s+/g, ' ').slice(0, 260)}`);
    if (ss.plumbing.length) console.log(`         ! plumbing: ${ss.plumbing.join(', ')}`);
  }

  const arm = (a: 'direct' | 'sloane') => rows.filter((r) => r.arm === a);
  const med = (set2: Row[], f: (r: Row) => number) => { const v = set2.map(f).sort((x, y) => x - y); return v[Math.floor(v.length / 2)] ?? 0; };
  const line = (label: string, a: 'direct' | 'sloane') => {
    const s = arm(a);
    return `${label.padEnd(10)} ${String(s.length).padStart(2)} answers · p50 ${String(med(s, (r) => r.words)).padStart(3)} words · max ${String(Math.max(...s.map((r) => r.words))).padStart(3)}`
      + ` · headings ${s.reduce((x, r) => x + r.headings, 0)} · plumbing ${s.filter((r) => r.plumbing.length).length}`
      + ` · asked back ${s.filter((r) => r.deflected).length} · artifacts ${s.filter((r) => r.artifact !== '—').length}`
      + ` · p50 ${med(s, (r) => r.ms)}ms`;
  };
  console.log(`\n${'═'.repeat(88)}\n════ §40 STYLE COMPARISON ════`);
  console.log(line('DIRECT', 'direct'));
  console.log(line('SLOANE', 'sloane'));
  const worse = rows.filter((r) => r.arm === 'sloane').filter((r) => {
    const d = rows.find((x) => x.n === r.n && x.arm === 'direct')!;
    return r.plumbing.length > 0 || r.headings > d.headings || (r.deflected && !d.deflected);
  });
  console.log(`\nSloane reads worse than the bare model on ${worse.length} of ${arm('sloane').length}:`);
  for (const r of worse) console.log(`  ${r.n}. ${r.q}${r.plumbing.length ? ` — plumbing: ${r.plumbing.join(', ')}` : ''}${r.deflected ? ' — asked back' : ''}${r.headings ? ' — headings' : ''}`);
  console.log(`\nthe prompt this ran against is ${V2_SYSTEM.length} chars`);
}

await main();
