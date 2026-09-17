/**
 * LIVE Phase 3B action tests through the real Anthropic adapter (SPENDS CREDITS).
 * The model interprets and plans; proposals are confirmed through orchestrator.decide(), the exact path the
 * /api/sloane/action route uses. Writes a secret-free digest to SLOANE_EVAL_OUT.
 * Run: npx tsx src/sloane/live-actions.ts
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { createAdapter } from './adapter.js';
import { loadSloaneConfig } from './config.js';
import { SloaneOrchestrator, type TurnResponse } from './orchestrator.js';
import { WORK } from './store.js';

const cfg = loadSloaneConfig();
if (cfg.provider !== 'anthropic') { console.error('live action tests need ANTHROPIC_API_KEY'); process.exit(2); }
const orch = new SloaneOrchestrator(createAdapter(cfg), cfg);
const log: unknown[] = [];
const snap = () => ({ comments: WORK.repos.records.list<{ source: string }>('FLUX_COMMENT').concat(WORK.repos.records.list<{ source: string }>('RECON_COMMENT')).filter((c) => c.source === 'SLOANE').length, relationships: WORK.relationships.length, issues: WORK.issues.length,
  saved: (['ANALYSIS', 'REPORT', 'EXCEL', 'PACKAGE'] as const).reduce((s, k) => s + WORK.repos.saved.list(k).length, 0), assignments: WORK.repos.records.list('REVIEWER_ASSIGNMENT').length });

async function turn(test: string, sid: string, q: string) {
  const before = snap();
  let r: TurnResponse = await orch.turn({ sessionId: sid, request: q });
  if (r.state === 'CLARIFICATION_REQUIRED' && r.clarification) r = await orch.turn({ sessionId: sid, clarification: { pendingId: r.clarification.pendingId, optionId: r.clarification.options[0]!.id } });
  const t = orch.trace(r.traceId)!;
  const after = snap();
  const props = r.actions?.proposals ?? [];
  const row = { test, request: q, state: r.state, latencyMs: t.latencyMs, interpretation: t.interpretation && { intent: t.interpretation.intent, object: t.interpretation.requestedObject, operation: t.interpretation.operation, continuity: t.interpretation.continuity, multiStep: t.interpretation.multiStep },
    planSource: t.plan.source, plan: t.plan.proposed.map((s) => `${s.tool}(${s.args.map((a) => `${a.name}=${String(a.value).slice(0, 60)}`).join(', ')})`), rejected: t.plan.validation?.rejected, toolsCalled: t.toolsExecuted.map((x) => `${x.tool}:${x.status}${x.error ? ` (${x.error})` : ''}`),
    proposals: props.map((p) => ({ id: p.id, type: p.type, riskLevel: p.riskLevel, status: p.status, validationStatus: p.validationStatus, target: p.targetLabel, preview: p.preview, errors: p.validation.errors, warnings: p.validation.warnings, choice: p.choice?.options.map((o) => o.label), dependsOn: p.dependsOn })),
    objects: r.objects.map((o) => `${o.type}: ${o.title}`), narrative: r.narrative.map((n) => n.text), notes: r.notes, writesDuringTurn: JSON.stringify(before) !== JSON.stringify(after) ? { before, after } : 'none', tokens: t.tokens };
  log.push(row);
  console.log(`\n[${test}] ${q}\n  ${r.state} · ${t.latencyMs}ms · plan=${t.plan.source} · ${row.toolsCalled.join(', ') || '-'} · writes during turn: ${row.writesDuringTurn === 'none' ? 'none' : 'YES'}`);
  for (const p of props) console.log(`  ▸ ${p.type} [${p.riskLevel}] ${p.status}/${p.validationStatus} → ${p.targetLabel ?? '(unresolved)'}${p.choice ? ` · choice: ${p.choice.options.map((o) => o.label).join(' | ')}` : ''}\n    ${p.preview.map((x) => `${x.label}: ${x.value.replace(/\n/g, ' / ').slice(0, 160)}`).join('\n    ')}${p.validation.errors.length ? `\n    ERRORS: ${p.validation.errors.join(' ')}` : ''}${p.validation.warnings.length ? `\n    warnings: ${p.validation.warnings.join(' ')}` : ''}`);
  if (!props.length) for (const n of r.narrative) console.log(`  » ${n.text}`);
  return r;
}
function decide(test: string, sid: string, body: Record<string, unknown>) {
  const before = snap();
  const r = orch.decide({ sessionId: sid, requestId: `live-${Math.random()}`, ...body } as never);
  const after = snap();
  log.push({ test, decision: body, results: r.results, before, after });
  console.log(`  ⇒ ${String(body['decision'])}: ${r.results.map((x) => `${x.type} ${x.status} — ${x.message}`).join(' | ')}\n    state ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  return r;
}
const chooseIfNeeded = (test: string, sid: string, r: TurnResponse, pick: string) => {
  for (const p of r.actions?.proposals ?? []) if (p.validationStatus === 'NEEDS_CHOICE' && p.choice) { const o = p.choice.options.find((x) => x.id === pick || x.label.includes(pick)) ?? p.choice.options[0]!; decide(test, sid, { proposalId: p.id, decision: 'choose', choice: o.id }); }
};

async function main() {
  const A = `live-A-${Date.now()}`;
  await turn('A', A, 'Why did CIP move in June?');
  const a = await turn('A', A, 'Use this explanation as the Flux comment.');
  for (const p of a.actions?.proposals ?? []) decide('A', A, { proposalId: p.id, decision: 'confirm' });
  console.log('  flux thread:', WORK.thread('flux:15000:2026-06').comments.filter((c) => c.source === 'SLOANE').map((c) => `${c.author} via ${c.via}: ${c.text.slice(0, 120)}`));

  await turn('B', A, 'Show me the CIP GL for June.');
  const b = await turn('B', A, 'Attach the invoices supporting this population to the Electrical CIP reconciliation.');
  chooseIfNeeded('B', A, b, 'MDH');
  for (const p of b.actions?.proposals ?? []) decide('B', A, { proposalId: p.id, decision: 'confirm' });
  console.log('  relationships:', WORK.relationships.map((x) => `${x.from} ${x.type} ${x.to}`).slice(0, 8));

  const c = await turn('C', A, 'Add a reconciliation comment that the $4.2M difference is timing-related and expected to clear in July.');
  chooseIfNeeded('C', A, c, 'MDH');
  for (const p of c.actions?.proposals ?? []) decide('C', A, { proposalId: p.id, decision: 'confirm' });

  const D = `live-D-${Date.now()}`;
  await turn('D', D, 'Build a Siemens FY26 spend report by project.');
  await turn('D', D, 'Add entity and compare to FY25.');
  const d = await turn('D', D, 'Save it.');
  for (const p of d.actions?.proposals ?? []) decide('D', D, { proposalId: p.id, decision: 'confirm' });
  console.log('  saved reports:', WORK.savedOf('REPORT_DRAFT').map((s) => `${s.id} ${s.name} rows=${JSON.stringify((s.definition as { rows?: string[] }).rows)} comparison=${JSON.stringify((s.definition as { comparison?: unknown }).comparison)}`));

  const E = `live-E-${Date.now()}`;
  await turn('E', E, 'Why did CIP move in June?');
  const e = await turn('E', E, 'Create an issue for the unsupported $7.2M.');
  for (const p of e.actions?.proposals ?? []) decide('E', E, { proposalId: p.id, decision: 'confirm' });

  const M = `live-M-${Date.now()}`;
  await turn('MULTI', M, 'Why did CIP move in June?');
  const m = await turn('MULTI', M, 'Use this explanation as the Flux comment, attach the support, and assign Sarah as reviewer.');
  if (m.actions) decide('MULTI', M, { planId: m.actions.planId, decision: 'confirm' });
  console.log('  timeline:', orch.timeline(M).map((x) => x.event));

  const G = `live-G-${Date.now()}`;
  const g = await turn('GOVERNED', G, 'Approve the Construction in progress — MDH reconciliation.');
  for (const p of g.actions?.proposals ?? []) decide('GOVERNED', G, { proposalId: p.id, decision: 'confirm' });

  writeFileSync(process.env['SLOANE_EVAL_OUT'] ?? 'sloane-live-actions.json', JSON.stringify({ model: cfg.model, at: new Date().toISOString(), log, audit: orch.actions.audit }, null, 2));
}
void main();
