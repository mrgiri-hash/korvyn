/**
 * A8 §24–§27 — THE LIVE ACCEPTANCES, through the real Anthropic adapter (SPENDS CREDITS).
 *
 * The A8 unit suite pins the resolution contract in isolation, which is the right place for it: a resolver
 * tested only end to end is a resolver whose failures are indistinguishable from the model's. What only a live
 * run can show is the thing this phase exists for — that the model's own reading of a request, Korvyn's
 * resolution of it and the object the reads came back with are the SAME object, turn after turn.
 *
 *   §24  the permanent MDH regression — the request names an entity object, and that object is what is read
 *   §25  a label several authorized objects answer to asks rather than picking
 *   §26  a module anchor holds through a generic follow-up
 *   §27  widening the period does not change the subject
 *
 * Run: npx tsx src/sloane/a8-live.ts
 */
import '../env.js';
import { createAdapter } from './adapter.js';
import { loadSloaneConfig } from './config.js';
import { SloaneOrchestrator, type TurnResponse } from './orchestrator.js';

const cfg = loadSloaneConfig();
if (cfg.provider !== 'anthropic') { console.error('A8 live acceptance needs ANTHROPIC_API_KEY in packages/agent/.env'); process.exit(2); }
const orch = new SloaneOrchestrator(createAdapter(cfg), cfg);

const MDH = 'REC-MDH-13100';
interface Turn { q: string; anchor?: { type: string; id: string; label: string } }

async function turn(sid: string, t: Turn) {
  const r: TurnResponse = await orch.turn({ sessionId: sid, request: t.q, ...(t.anchor ? { anchor: t.anchor } : {}) } as never);
  const tr = orch.trace(r.traceId)!;
  const rr = tr.referentResolution;
  return {
    q: t.q, state: r.state, basis: rr?.basis ?? null, anchorUsed: rr?.anchorUsed ?? null, inheritedUsed: rr?.inheritedUsed ?? null,
    verified: rr?.verified ?? null, verificationFailures: rr?.verificationFailures ?? [],
    considered: rr?.considered ?? 0, rejected: (rr?.rejected ?? []).slice(0, 3),
    object: tr.interpretation?.requestedObject ?? null,
    tools: tr.toolsExecuted.map((x) => `${x.tool}(${Object.entries(x.args).map(([k, v]) => `${k}=${v}`).join(', ')})`),
    objects: tr.objects.map((o) => o.title),
    clarification: r.clarification ? { question: r.clarification.question, options: r.clarification.options.map((o) => o.label) } : null,
    notes: r.notes,
    narrative: r.narrative.map((n) => n.text).join(' ').slice(0, 320),
  };
}

const ONLY = process.argv[2] ?? null;
const SUITES: { id: string; label: string; sid: string; turns: Turn[] }[] = [
  { id: '24', label: 'the MDH regression: identity first, then status', sid: 'a8-live-24', turns: [
    { q: 'What is the status of the MDH intercompany receivable reconciliation?' },
  ] },
  { id: '25', label: 'a label several authorized objects answer to', sid: 'a8-live-25', turns: [
    { q: 'Show me the cash reconciliation.' },
  ] },
  { id: '26', label: 'the module anchor holds through a generic follow-up', sid: 'a8-live-26', turns: [
    { q: 'Why is this off?', anchor: { type: 'reconciliation', id: MDH, label: 'Intercompany receivable — MDH vs foreign OpCos' } },
    { q: 'Show me the support.', anchor: { type: 'reconciliation', id: MDH, label: 'Intercompany receivable — MDH vs foreign OpCos' } },
  ] },
  { id: '27', label: 'widening the period does not change the subject', sid: 'a8-live-27', turns: [
    { q: 'Show me the MDH intercompany receivable reconciliation.' },
    { q: 'And for the last three months?' },
  ] },
];

(async () => {
  for (const s of SUITES.filter((x) => !ONLY || x.id === ONLY)) {
    console.log(`\n=== §${s.id} — ${s.label}`);
    for (const t of s.turns) {
      const row = await turn(s.sid, t);
      console.log(JSON.stringify(row, null, 1));
    }
  }
  process.exit(0);
})();
