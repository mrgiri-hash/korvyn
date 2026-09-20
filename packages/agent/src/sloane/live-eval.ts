/**
 * LIVE evaluation of Sloane through the real Anthropic adapter (SPENDS CREDITS). Phase 3A suites:
 *   §21 — thirteen cross-domain requests in one conversation
 *   §22 — the five-turn context chain
 * Writes a secret-free trace digest to SLOANE_EVAL_OUT (default ./sloane-live-eval.json).
 * Run: npx tsx src/sloane/live-eval.ts
 */
import '../env.js';
import { writeFileSync } from 'node:fs';
import { createAdapter } from './adapter.js';
import { loadSloaneConfig } from './config.js';
import { SloaneOrchestrator, type TurnResponse } from './orchestrator.js';

const cfg = loadSloaneConfig();
if (cfg.provider !== 'anthropic') { console.error('live eval needs ANTHROPIC_API_KEY in the environment'); process.exit(2); }
const orch = new SloaneOrchestrator(createAdapter(cfg), cfg);

const SUITE_21 = [
  'Show me June financials.', 'What changed the most?', 'Break that down by entity.', 'Show me the GL behind the largest movement.',
  "Which reconciliations don't tie?", 'Which recs are missing support?', 'What is blocking June close?', 'Show Siemens spend for FY26.',
  'Compare that to last year.', 'Show me the support behind the largest Siemens transaction.', 'Which reports include CIP?',
  'Show me the proof behind this number.', 'Why did CIP increase and does the reconciliation support it?',
];
const SUITE_22 = ['Show me June financials', 'what changed the most?', 'break that down by project', 'show me the GL', 'which of these transactions have missing support?'];

async function run(label: string, sid: string, qs: string[]) {
  const out: unknown[] = [];
  for (const q of qs) {
    let r: TurnResponse = await orch.turn({ sessionId: sid, request: q });
    /* a clarification is answered with its first option, as a user would pick the obvious one */
    if (r.state === 'CLARIFICATION_REQUIRED' && r.clarification) r = await orch.turn({ sessionId: sid, clarification: { pendingId: r.clarification.pendingId, optionId: r.clarification.options[0]!.id } });
    const t = orch.trace(r.traceId)!;
    const row = {
      suite: label, request: q, state: r.state, latencyMs: t.latencyMs,
      interpretation: t.interpretation && { intent: t.interpretation.intent, object: t.interpretation.requestedObject, operation: t.interpretation.operation, period: t.interpretation.period, periodRange: t.interpretation.periodRange, comparison: t.interpretation.comparisonPeriod ?? t.interpretation.comparisonBasis, filters: t.interpretation.filters, dimensions: t.interpretation.dimensions, continuity: t.interpretation.continuity, multiStep: t.interpretation.multiStep, confidence: t.interpretation.confidence },
      interpretationSource: t.interpretationSource, classification: t.classification, contextBefore: t.contextBefore,
      toolsExposed: t.toolsExposed, planSource: t.plan.source, planProposed: t.plan.proposed.map((s) => `${s.tool}(${s.args.map((a) => `${a.name}=${a.value}`).join(', ')})`),
      planRepairs: t.plan.validation?.repairs, planRejected: t.plan.validation?.rejected,
      toolsCalled: t.toolsExecuted.map((x) => ({ tool: x.tool, args: x.args, status: x.status, error: x.error, result: x.result, latencyMs: x.latencyMs })),
      objects: t.objects, narrative: r.narrative.map((n) => n.text), groundingRejected: t.narrative.rejected, narrativeSource: t.narrative.source,
      notes: r.notes, warnings: t.warnings, errors: t.errors, fallbacks: t.fallbacks, calls: t.calls.map((c) => ({ stage: c.stage, status: c.status, code: c.code, detail: c.detail, latencyMs: c.latencyMs })),
      tokens: t.tokens, contextAfter: r.context,
    };
    out.push(row);
    console.log(`\n[${label}] ${q}\n  ${r.state} · ${t.latencyMs}ms · plan=${t.plan.source} · tools=${t.toolsExecuted.map((x) => `${x.tool}:${x.status}`).join(', ') || '-'}\n  focus=${r.context.focus.value ?? '-'} · pop=${r.context.populationId.value ?? '-'}`);
    for (const n of r.narrative) console.log(`  » ${n.text}`);
    if (r.notes.length) console.log(`  notes: ${r.notes.join(' | ')}`);
    if (t.fallbacks.length) console.log(`  fallbacks: ${t.fallbacks.join(' | ')}`);
  }
  return out;
}

const SUITE_CROSS = ['Show me June financials.', 'Why did CIP increase and does the reconciliation support it?'];
async function main() {
  if (process.env['SLOANE_EVAL_ONLY'] === 'cross') {
    const c = await run('§17', `live-17-${Date.now()}`, SUITE_CROSS);
    /* §15 live: an entity accountant asks for audit work and group data */
    const scoped = new SloaneOrchestrator(createAdapter(cfg), cfg, () => ({ id: 'user:scoped', name: 'Scoped', role: 'ENTITY_ACCOUNTANT', permissions: ['FINANCIALS_VIEW', 'TB_VIEW', 'GL_VIEW', 'FLUX_VIEW', 'RECON_VIEW', 'CLOSE_VIEW', 'EVIDENCE_VIEW'], scopeIds: ['MDH'] }));
    const perm: unknown[] = [];
    for (const q of ['Show me the audit selections for CIP additions.', "Which reconciliations don't tie?"]) {
      const r = await scoped.turn({ sessionId: `live-perm-${Date.now()}`, request: q }); const t = scoped.trace(r.traceId)!;
      perm.push({ request: q, state: r.state, exposed: t.toolsExposed.tools, tools: t.toolsExecuted.map((x) => `${x.tool}:${x.status}`), narrative: r.narrative.map((n) => n.text), notes: r.notes });
      console.log(`\n[§15 scoped] ${q}\n  ${r.state} · exposed audit tools: ${t.toolsExposed.tools.filter((x) => /Audit|PBC|Selections|PopulationTie/.test(x)).length} · tools=${t.toolsExecuted.map((x) => x.tool).join(', ') || '-'}`);
      for (const n of r.narrative) console.log(`  » ${n.text}`); if (r.notes.length) console.log(`  notes: ${r.notes.join(' | ')}`);
    }
    writeFileSync(process.env['SLOANE_EVAL_OUT'] ?? 'sloane-live-cross.json', JSON.stringify({ model: cfg.model, cross: c, permissions: perm }, null, 2));
    return;
  }
  const a = await run('§21', `live-21-${Date.now()}`, SUITE_21);
  const b = await run('§22', `live-22-${Date.now()}`, SUITE_22);
  const file = process.env['SLOANE_EVAL_OUT'] ?? 'sloane-live-eval.json';
  writeFileSync(file, JSON.stringify({ model: cfg.model, effort: cfg.effort, at: new Date().toISOString(), suite21: a, suite22: b }, null, 2));
  console.log(`\nwrote ${file}`);
}
void main();
