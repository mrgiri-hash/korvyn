/**
 * §18 — HOW MANY TURNS STAY VERBATIM, DECIDED BY MEASUREMENT.
 *
 * The compaction window is the one v2 knob that trades money directly against continuity: every turn
 * kept verbatim is re-sent on the next one, and every turn compacted is a turn the model reads as a
 * quoted line instead of as what was said. Picking it by taste would be picking the product's memory
 * by taste, so it is run.
 *
 * The window is read from the environment at module load, so each setting is its own process — this
 * script spawns the A/B's v2 arm three times and puts the three scorecards beside each other. What
 * it compares is cost AND whether the conversation still held: §29's script is dependent end to end,
 * so a window too short shows up as a follow-up that has to ask what the subject is.
 *
 *   npm run sloane:v2-transcript              3, 4 and 6          (SPENDS CREDITS — three conversations)
 *   npm run sloane:v2-transcript -- 2,4       just those two
 */
import '../../env.js';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';

const arg = process.argv.slice(2).find((a) => /^[\d,]+$/.test(a));
const windows = (arg ? arg.split(',') : ['3', '4', '6']).map(Number).filter((n) => n >= 2 && n <= 10);

interface Run { verbatimTurns: number; scorecard: Record<string, unknown>[]; rows: { runtime: string; n: number; request: string; state: string; reply: string; input: number; costUsd: number; latencyMs: number }[] }

const runs: Run[] = [];
for (const w of windows) {
  const out = `./sloane-v2-transcript-${w}.json`;
  if (existsSync(out)) rmSync(out);
  console.log(`\n================ verbatimTurns = ${w} ================`);
  /* the categories are the §32 scorecard and say nothing about the window; the dependent conversation is
     the whole experiment, so each setting pays for that and nothing else */
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/sloane/v2/ab.ts', '--only', 'v2', '--no-categories'], {
    stdio: 'inherit',
    env: { ...process.env, SLOANE_V2_VERBATIM_TURNS: String(w), SLOANE_AB_OUT: out },
  });
  if (r.status !== 0 || !existsSync(out)) { console.error(`  the run at ${w} did not complete; it is left out rather than guessed at`); continue; }
  const body = JSON.parse(readFileSync(out, 'utf8')) as Run;
  runs.push({ ...body, verbatimTurns: w });
}

if (!runs.length) { console.error('no run completed'); process.exit(1); }

/**
 * A continuity failure is the conversation asking for something it was already told. It is read off
 * the STATE and the words, not off a judgement: a follow-up that stops to clarify, or an answer that
 * asks the person to restate the subject, is the window being too short showing through.
 */
const RESTATE = [
  /\bwhich (?:account|entity|period|month|line|company|scope)\b/i,
  /\bwhat (?:are|do) you (?:referring to|mean)\b/i,
  /\bcould you (?:tell me|say) which\b/i,
  /\bI (?:don'?t|do not) have (?:that|the subject) (?:in|from) (?:context|this conversation)\b/i,
  /\blet me know which\b/i,
];

const card = runs.map((r) => {
  const conv = r.rows.filter((x) => x.runtime === 'v2');
  /* turn 1 establishes the subject; every turn after it is a follow-up and must not need it restated */
  const follows = conv.slice(1);
  const broke = follows.filter((t) => t.state === 'CLARIFICATION_REQUIRED' || RESTATE.some((re) => re.test(t.reply)));
  const v2 = r.scorecard.find((s) => s['runtime'] === 'v2') ?? {};
  return {
    verbatimTurns: r.verbatimTurns,
    continuityBreaks: broke.length,
    brokeOn: broke.map((t) => t.n).join(',') || '—',
    inputTokens: v2['inputTokens'], cacheReadTokens: v2['cacheReadTokens'],
    costUsd: v2['costUsd'], latencyP50: v2['latencyP50'], latencyP90: v2['latencyP90'],
  };
});

console.log('\n=== §18: the transcript window ===');
console.table(card);

const clean = card.filter((c) => c.continuityBreaks === 0);
const choice = clean.length
  ? clean.reduce((a, b) => ((a.costUsd as number) <= (b.costUsd as number) ? a : b))
  : card.reduce((a, b) => (a.continuityBreaks <= b.continuityBreaks ? a : b));
console.log(
  clean.length
    ? `\nThe smallest window that held the conversation: ${choice.verbatimTurns} turns, at $${choice.costUsd} for the script.`
    : `\nEvery window broke continuity somewhere; the least bad was ${choice.verbatimTurns}. That is a finding about the transcript, not a setting to ship.`,
);

writeFileSync('./sloane-v2-transcript.json', JSON.stringify({ at: new Date().toISOString(), card, runs }, null, 2));
console.log('wrote ./sloane-v2-transcript.json');
