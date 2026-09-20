/**
 * §3/§30 — DIRECT MODEL vs SLOANE, on unseen finance language.
 *
 * The brief's second goal is that Korvyn must PRESERVE and augment the underlying model's financial
 * intelligence, never constrain it. That is a claim about a comparison, so it is measured as one:
 *
 *   A. the direct model understands it AND Sloane understands it
 *   B. the direct model understands it AND SLOANE FAILS          ← the number that matters
 *   C. neither is clear
 *   D. Sloane adds a correct enterprise resolution the direct model could not have
 *   E. Sloane adds an INCORRECT enterprise resolution
 *
 * Both arms run the SAME configured model, so a difference is Korvyn's doing — prompt design,
 * routing, tool exposure, ontology or state — and never a difference in raw capability. That is the
 * §2 premise: a failure here is a defect in this layer, not a reason to add a keyword handler.
 *
 * Categories come from two independent readings, and they are kept separate on purpose:
 *   • a DETERMINISTIC comprehension detector, which is what decides B. It looks for the one failure
 *     this exercise exists to catch — saying a finance term is not understood. "Korvyn does not hold
 *     free cash flow" is NOT that; it is an honest unavailability and reads as understanding.
 *   • an optional MODEL GRADER (--grade), which judges the finer D/E distinction it takes finance
 *     reading to make. Its verdict never overrides the detector on B.
 *
 *   npx tsx src/sloane/eval/direct-vs-sloane.ts                  every case, graded    (SPENDS CREDITS)
 *   npx tsx src/sloane/eval/direct-vs-sloane.ts --no-grade       skip the grader
 *   npx tsx src/sloane/eval/direct-vs-sloane.ts --only G01,E01   named cases
 *   npx tsx src/sloane/eval/direct-vs-sloane.ts --kind general   one kind
 *   npx tsx src/sloane/eval/direct-vs-sloane.ts --limit 20       the first N
 *   npx tsx src/sloane/eval/direct-vs-sloane.ts --concepts-only  no model calls at all: the concept
 *                                                               layer's own resolution, free
 */
import '../../env.js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import { createAdapter } from '../adapter.js';
import { loadSloaneConfig } from '../config.js';
import { SloaneOrchestrator, type TurnResponse } from '../orchestrator.js';
import { serverActor } from '../tools.js';
import { FinancialDataService } from '../financials.js';
import { GovernedLedger } from '../governed.js';
import { resolveConcept, conceptById } from '../semantic/concepts.js';

/* ---- the holdout ----------------------------------------------------------------------------- */

interface Case {
  id: string;
  kind: 'general' | 'enterprise' | 'open';
  prompt: string;
  concept?: string;
  held?: boolean;
  ambiguous?: boolean;
}
const HOLDOUT: { note: string; cases: Case[] } = JSON.parse(
  readFileSync(new URL('./finance-holdout.json', import.meta.url), 'utf8'),
);

/* ---- the comprehension detector -------------------------------------------------------------- */

/**
 * The ONE failure mode being measured: an answer that says the TERM is not understood. Every pattern
 * below is about the language, never about the data — because "Korvyn does not hold that", "no
 * governed figure exists for June" and "which entity did you mean?" are all correct behaviour and
 * must not be scored as a comprehension failure. Getting that boundary wrong would make B meaningless.
 */
const FAIL = [
  /\bI (?:don'?t|do not|cannot|can'?t) (?:understand|recognise|recognize|parse|make sense of)\b/i,
  /\bI(?:'m| am) not (?:sure|clear) what .{0,40}\b(?:means?|refers? to|is)\b/i,
  /\b(?:not|isn'?t) (?:a )?(?:term|concept|phrase|word) (?:I|Korvyn|we) (?:understand|recognise|recognize|know|use)\b/i,
  /\bunfamiliar (?:with|term|phrase)\b/i,
  /* "this book has no governed concept called X" was in this list and should never have been: it is a
     statement about the CATALOGUE, not about understanding, and the answer that carries it goes on to
     name the right accounts. It scored Korvyn's honest, useful reply as the one failure being counted. */
  /\bwhat do you mean by\b/i,
  /\bcould you (?:clarify|explain|tell me) what you mean by\b/i,
  /\b(?:doesn'?t|does not) (?:appear|seem) to be a (?:standard |recognised |recognized )?(?:finance|accounting|financial) term\b/i,
  /\bI(?:'m| am) not familiar\b/i,
  /\bcan you rephrase\b/i,
  /\bI didn'?t (?:catch|follow|understand) that\b/i,
];
/**
 * A NON-RECOGNITION SCOPED TO THE BOOK IS A STATEMENT ABOUT THE DATA, NOT ABOUT UNDERSTANDING.
 * "maintenance run-rate isn't a term I recognise AS DEFINED ON THIS BOOK" is Korvyn reporting its
 * catalogue and then offering the right accounts — the opposite of the failure being counted. Without
 * this, the one thing the benchmark exists to measure is triggered by Korvyn doing its job well.
 */
const SCOPED = /\b(?:on|in|for) (?:this|the|your) (?:book|books|ledger|chart|tenant|catalogue|catalog)\b|\bas (?:defined|governed|held|set up) (?:here|on this book)\b|\bKorvyn (?:does not|doesn'?t) (?:hold|carry|define)\b/i;
const failingMatch = (text: string) => {
  for (const r of FAIL) {
    const m = r.exec(text);
    if (!m) continue;
    /* judge the SENTENCE the phrase sits in, not the whole answer */
    const at = m.index;
    const sentence = text.slice(Math.max(0, text.lastIndexOf('.', at) + 1), text.indexOf('.', at + m[0].length) + 1 || undefined);
    if (SCOPED.test(sentence)) continue;
    return r;
  }
  return null;
};
const comprehensionFailure = (text: string) => !!failingMatch(text);
const failureReason = (text: string) => failingMatch(text)?.source ?? null;

/** a reply so thin it says nothing is also not understanding — measured, not assumed */
const empty = (text: string) => text.replace(/\s+/g, ' ').trim().length < 12;

/* ---- the two arms ---------------------------------------------------------------------------- */

const cfg = loadSloaneConfig();

/**
 * ARM A — the configured default model, with NOTHING of Korvyn around it. The system prompt is the
 * shortest honest framing of the same situation: a finance assistant with no access to a book. Any
 * more than that starts building Korvyn, and the baseline stops being a baseline.
 */
const DIRECT_SYSTEM =
  'You are a finance assistant talking to a corporate controller. You have no access to any ' +
  "company's books, ledger or systems — so you can explain what finance and accounting terms mean " +
  'and what you would look at, but you cannot state any figure for their business. Answer in two or ' +
  'three sentences.';

interface Arm { reply: string; latencyMs: number; input: number; output: number; cacheRead: number; ok: boolean; detail?: string }

async function direct(client: Anthropic, prompt: string): Promise<Arm> {
  const t0 = Date.now();
  try {
    const msg = await client.beta.messages.create({
      model: cfg.defaultModel,
      max_tokens: 400,
      system: [{ type: 'text', text: DIRECT_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
      thinking: { type: 'disabled' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
    const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' ');
    const u = msg.usage as unknown as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
    return { reply: text, latencyMs: Date.now() - t0, input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, ok: true };
  } catch (e) {
    return { reply: '', latencyMs: Date.now() - t0, input: 0, output: 0, cacheRead: 0, ok: false, detail: String((e as Error).message ?? e) };
  }
}

/**
 * ARM B — Sloane on the SAME model. A fresh conversation per case: these are independent probes of
 * language understanding, not a conversation, and letting one case's context reach the next would
 * measure continuity instead of comprehension.
 */
async function sloane(orch: SloaneOrchestrator, c: Case, n: number): Promise<Arm & { state: string; tools: string[]; clarified: string | null; modelCalls: number; ungrounded: string[] }> {
  const sid = `dvs-${c.id}-${n}`;
  const t0 = Date.now();
  let clarified: string | null = null;
  let r: TurnResponse;
  try {
    r = await orch.turn({ sessionId: sid, request: c.prompt }, serverActor());
    if (r.state === 'CLARIFICATION_REQUIRED' && r.clarification) {
      /* the QUESTION is part of what Sloane said, and is exactly where a comprehension failure hides
         ("what do you mean by OPEX?"), so it is scored — and then answered, so the case still gets
         an answer to judge. */
      clarified = r.clarification.question;
      r = await orch.turn(
        { sessionId: sid, request: '', clarification: { pendingId: r.clarification.pendingId, optionId: r.clarification.options[0]!.id } },
        serverActor(),
      );
    }
  } catch (e) {
    return { reply: '', latencyMs: Date.now() - t0, input: 0, output: 0, cacheRead: 0, ok: false, detail: String((e as Error).message ?? e), state: 'ERROR', tools: [], clarified: null, modelCalls: 0, ungrounded: [] };
  }
  const t = orch.trace(r.traceId);
  const said = [clarified, r.reply, ...r.narrative.map((x) => x.text)].filter(Boolean).join(' ');
  const objects = r.objects.map((o) => `${o.title}: ${o.table.rows.slice(0, 6).map((x) => x.label).join(', ')}`).join(' | ');
  return {
    reply: [said, objects].filter(Boolean).join(' — '),
    latencyMs: Date.now() - t0,
    input: t?.tokens.input ?? 0, output: t?.tokens.output ?? 0, cacheRead: t?.tokens.cacheRead ?? 0,
    ok: true, state: r.state, clarified,
    tools: (t?.toolsExecuted ?? []).map((x) => x.tool),
    modelCalls: (t?.calls ?? []).filter((x) => x.status !== 'declined').length,
    /* §1 — a figure the answer stated that no governed read produced. Korvyn tells the person on the
       turn; the benchmark has to see it too, or a check that fires is indistinguishable from one that
       does not. */
    ungrounded: r.notes.filter((x) => /could not match/.test(x)),
  };
}

/* ---- the concept layer, on its own ----------------------------------------------------------- */

const gl = new GovernedLedger(new FinancialDataService());

/** Free, and the most direct reading of whether the ontology carries the term at all. */
function conceptRow(c: Case) {
  const r = resolveConcept({ text: c.prompt, gl });
  const expected = c.concept ? conceptById(c.concept) : null;
  return {
    id: c.id,
    expected: c.concept ?? null,
    resolved: r.concept?.conceptId ?? null,
    matched: c.concept ? r.concept?.conceptId === c.concept : null,
    status: r.status,
    chosen: r.chosen ? { mappingId: r.chosen.mappingId, members: r.chosen.members, basis: r.chosen.basis } : null,
    expectedExists: c.concept ? !!expected : null,
  };
}

/* ---- the grader ------------------------------------------------------------------------------ */

const GRADER_SYSTEM =
  'You are grading a benchmark of two finance assistants on the same question. A is a general model ' +
  'with no access to any books. B is an enterprise system over one company\'s governed ledger.\n\n' +
  'Judge two things for each, and nothing else.\n' +
  'UNDERSTOOD: did the answer show it understood the FINANCE LANGUAGE in the question? Saying a figure ' +
  'is not available, that the company does not hold that measure, or asking which entity or period is ' +
  'meant all count as understanding. Only say it did not understand if it said it did not know what the ' +
  'TERM or the QUESTION meant.\n' +
  'ENTERPRISE: for B only — did it add something specific to this company (a figure, an account, a ' +
  'reading of the term on this chart, a governed status)? If it did, is that addition CORRECT as far as ' +
  'the answer itself shows, or does it contradict itself, misuse the term, or assert something a ' +
  'general reading of the term would not support?\n\n' +
  'Answer with a single JSON object and no other text:\n' +
  '{"aUnderstood":true|false,"bUnderstood":true|false,"bAdded":"none"|"correct"|"incorrect","why":"one short sentence"}';

interface Grade { aUnderstood: boolean; bUnderstood: boolean; bAdded: 'none' | 'correct' | 'incorrect'; why: string }

async function grade(client: Anthropic, c: Case, a: string, b: string): Promise<Grade | null> {
  try {
    const msg = await client.beta.messages.create({
      model: cfg.defaultModel,
      max_tokens: 300,
      system: [{ type: 'text', text: GRADER_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `QUESTION: ${c.prompt}\n\nA (general model):\n${a.slice(0, 1500) || '(no answer)'}\n\nB (enterprise system):\n${b.slice(0, 1500) || '(no answer)'}` }],
      thinking: { type: 'disabled' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
    const text = msg.content.filter((x) => x.type === 'text').map((x) => (x as { text: string }).text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const v = JSON.parse(m[0]) as Grade;
    if (typeof v.aUnderstood !== 'boolean' || typeof v.bUnderstood !== 'boolean') return null;
    if (!['none', 'correct', 'incorrect'].includes(v.bAdded)) return null;
    return v;
  } catch { return null; }
}

/* ---- categorisation -------------------------------------------------------------------------- */

type Cat = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * The detector decides understanding; the grader only decides what Sloane ADDED. Where the two
 * disagree about understanding the disagreement is recorded rather than resolved — a category that
 * quietly depends on a grader is not a measurement.
 */
function categorise(aText: string, bText: string, g: Grade | null, ungroundedCount = 0): { cat: Cat; aOk: boolean; bOk: boolean; disagreement: string | null } {
  const aOk = !comprehensionFailure(aText) && !empty(aText);
  const bOk = !comprehensionFailure(bText) && !empty(bText);
  let disagreement: string | null = null;
  if (g) {
    if (g.aUnderstood !== aOk) disagreement = `grader says A ${g.aUnderstood ? 'understood' : 'did not'}, detector says ${aOk ? 'understood' : 'did not'}`;
    if (g.bUnderstood !== bOk) disagreement = `${disagreement ? disagreement + '; ' : ''}grader says B ${g.bUnderstood ? 'understood' : 'did not'}, detector says ${bOk ? 'understood' : 'did not'}`;
  }
  if (!aOk && !bOk) return { cat: 'C', aOk, bOk, disagreement };
  if (aOk && !bOk) return { cat: 'B', aOk, bOk, disagreement };
  /* both understood: D and E are about what Sloane ADDED on top.
     AN ENTERPRISE FIGURE KORVYN CANNOT POINT AT IS AN INCORRECT ADDITION BY CONSTRUCTION, whatever a
     grader makes of it — §1 says the enterprise number must be proved, so an unproved one is E. This
     is the deterministic half of E, and it does not depend on anyone's reading. */
  if (ungroundedCount > 0) return { cat: 'E', aOk, bOk, disagreement };
  if (g?.bAdded === 'incorrect') return { cat: 'E', aOk, bOk, disagreement };
  if (g?.bAdded === 'correct') return { cat: 'D', aOk, bOk, disagreement };
  return { cat: 'A', aOk, bOk, disagreement };
}

/* ---- the run --------------------------------------------------------------------------------- */

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] ?? null : null; };
const has = (name: string) => process.argv.includes(name);

(async () => {
  const conceptsOnly = has('--concepts-only');
  const graded = !has('--no-grade') && !conceptsOnly;
  const only = arg('--only')?.split(',').map((s) => s.trim());
  const kind = arg('--kind');
  const limit = Number(arg('--limit') ?? 0);

  let cases = HOLDOUT.cases;
  if (only) cases = cases.filter((c) => only.includes(c.id));
  if (kind) cases = cases.filter((c) => c.kind === kind);
  if (limit > 0) cases = cases.slice(0, limit);

  /* the concept layer's own reading is free and runs whatever else does */
  const concepts = cases.map(conceptRow);
  const withConcept = concepts.filter((c) => c.expected);
  const conceptCard = {
    cases: withConcept.length,
    matched: withConcept.filter((c) => c.matched).length,
    byStatus: concepts.reduce<Record<string, number>>((a, c) => { a[c.status] = (a[c.status] ?? 0) + 1; return a; }, {}),
    expectedMissing: withConcept.filter((c) => !c.expectedExists).map((c) => c.expected),
  };
  console.log('\n=== concept layer (deterministic, free) ===');
  console.table([conceptCard]);
  if (conceptCard.expectedMissing.length) console.log('  concepts named by the holdout that the catalogue does not carry:', conceptCard.expectedMissing.join(', '));

  if (conceptsOnly) {
    writeFileSync('./sloane-concepts.json', JSON.stringify({ at: new Date().toISOString(), conceptCard, concepts }, null, 2));
    console.log('\nwrote ./sloane-concepts.json');
    return;
  }

  if (cfg.provider !== 'anthropic') { console.error('this benchmark needs ANTHROPIC_API_KEY in packages/agent/.env (or run --concepts-only)'); process.exit(2); }

  const client = new Anthropic({ timeout: cfg.timeoutMs, maxRetries: 1 });
  const orch = new SloaneOrchestrator(createAdapter(cfg), { ...cfg, runtimeV2: true });

  interface Row {
    id: string; kind: string; prompt: string; cat: Cat;
    aOk: boolean; bOk: boolean; aFail: string | null; bFail: string | null; disagreement: string | null;
    direct: Arm; sloane: Awaited<ReturnType<typeof sloane>>; grade: Grade | null; concept: ReturnType<typeof conceptRow>;
  }
  const rows: Row[] = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    /* the two arms are independent, so they run together; the grader needs both and follows */
    const [a, b] = await Promise.all([direct(client, c.prompt), sloane(orch, c, i)]);
    const g = graded ? await grade(client, c, a.reply, b.reply) : null;
    const { cat, aOk, bOk, disagreement } = categorise(a.reply, b.reply, g, b.ungrounded.length);
    rows.push({
      id: c.id, kind: c.kind, prompt: c.prompt, cat, aOk, bOk,
      aFail: failureReason(a.reply), bFail: failureReason(b.reply), disagreement,
      direct: a, sloane: b, grade: g, concept: concepts[i]!,
    });
    const mark = cat === 'B' ? '  ← B' : cat === 'E' ? '  ← E' : '';
    console.log(`${String(i + 1).padStart(3)}/${cases.length} ${c.id} [${cat}]${mark} ${c.prompt}`);
    if (cat === 'B' || cat === 'E' || cat === 'C') {
      console.log(`        A: ${a.reply.replace(/\s+/g, ' ').slice(0, 180)}`);
      console.log(`        B: ${b.reply.replace(/\s+/g, ' ').slice(0, 180)}`);
      if (g) console.log(`        grader: ${g.why}`);
    }
  }

  /* ---- the scorecard ---- */
  const count = (k: Cat) => rows.filter((r) => r.cat === k).length;
  const pct = (n: number) => `${((n / rows.length) * 100).toFixed(1)}%`;
  const cats = {
    total: rows.length,
    A: `${count('A')} (${pct(count('A'))})`,
    'B — direct understands, SLOANE FAILS': `${count('B')} (${pct(count('B'))})`,
    C: `${count('C')} (${pct(count('C'))})`,
    'D — Sloane adds correct enterprise resolution': `${count('D')} (${pct(count('D'))})`,
    'E — Sloane adds INCORRECT resolution': `${count('E')} (${pct(count('E'))})`,
  };
  console.log('\n=== categories ===');
  console.table([cats]);

  const p = (xs: number[], q: number) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0; };
  const cost = (arm: 'direct' | 'sloane') => {
    const P = /opus/i.test(cfg.defaultModel) ? { in: 15, out: 75, cr: 1.5 } : /haiku/i.test(cfg.defaultModel) ? { in: 1, out: 5, cr: 0.1 } : { in: 3, out: 15, cr: 0.3 };
    return +(rows.reduce((a, r) => a + (r[arm].input * P.in + r[arm].output * P.out + r[arm].cacheRead * P.cr) / 1e6, 0)).toFixed(4);
  };
  const armCard = (['direct', 'sloane'] as const).map((k) => ({
    arm: k, model: cfg.defaultModel,
    latencyP50: p(rows.map((r) => r[k].latencyMs), 0.5), latencyP90: p(rows.map((r) => r[k].latencyMs), 0.9),
    input: rows.reduce((a, r) => a + r[k].input, 0), output: rows.reduce((a, r) => a + r[k].output, 0),
    cacheRead: rows.reduce((a, r) => a + r[k].cacheRead, 0), costUsd: cost(k),
    understood: rows.filter((r) => (k === 'direct' ? r.aOk : r.bOk)).length,
  }));
  console.log('\n=== arms ===');
  console.table(armCard);

  const byKind = ['general', 'enterprise', 'open'].map((k) => {
    const rs = rows.filter((r) => r.kind === k);
    return rs.length ? { kind: k, n: rs.length, B: rs.filter((r) => r.cat === 'B').length, E: rs.filter((r) => r.cat === 'E').length, D: rs.filter((r) => r.cat === 'D').length } : null;
  }).filter(Boolean);
  console.log('\n=== by kind ===');
  console.table(byKind);

  const disagreements = rows.filter((r) => r.disagreement).length;
  if (disagreements) console.log(`\n${disagreements} case(s) where the grader and the detector read understanding differently — recorded, not resolved.`);

  const out = process.env['SLOANE_DVS_OUT'] ?? './sloane-direct-vs-sloane.json';
  writeFileSync(out, JSON.stringify({
    at: new Date().toISOString(), model: cfg.defaultModel, graded,
    holdoutNote: HOLDOUT.note, categories: cats, arms: armCard, byKind, conceptCard,
    categoryB: rows.filter((r) => r.cat === 'B').map((r) => ({ id: r.id, prompt: r.prompt, direct: r.direct.reply, sloane: r.sloane.reply, why: r.bFail })),
    categoryE: rows.filter((r) => r.cat === 'E').map((r) => ({ id: r.id, prompt: r.prompt, sloane: r.sloane.reply, ungrounded: r.sloane.ungrounded, why: r.sloane.ungrounded.length ? 'a figure no governed read produced' : r.grade?.why })),
    ungroundedTurns: rows.filter((r) => r.sloane.ungrounded.length).map((r) => ({ id: r.id, prompt: r.prompt, note: r.sloane.ungrounded[0], tools: r.sloane.tools })),
    rows,
  }, null, 2));
  console.log(`\nwrote ${out}`);
})();
