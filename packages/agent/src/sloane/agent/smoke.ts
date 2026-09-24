/**
 * A1 §20 — THE SMOKE OBJECTIVE, against the real model. SPENDS CREDITS.   Run: npm run agent:smoke
 *
 *   "Review the June close status, identify the most material unresolved issues, and prepare a concise controller
 *    briefing with traceable evidence."
 *
 * It runs through the GENERIC loop (goal type INVESTIGATE, planner MODEL), NOT the Close template: §20 is explicit
 * that hard-coded Close workflow logic must not be added to make this pass, and the point of the exercise is that
 * the universal runtime can carry a cross-module objective with nothing written for it. Every step is a governed
 * READ, validated and authorized exactly like any other.
 *
 * Prints the ten §20 checks, the trace envelope and the telemetry. A capability the objective needed and Korvyn
 * does not have is reported as a CAPABILITY GAP rather than worked around.
 */
import '../../env.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSloaneConfig } from '../config.js';
import { AnthropicSloaneAdapter } from '../adapter.js';
import { SloaneOrchestrator } from '../orchestrator.js';
import { WRITE_ACTIONS_ENABLED, serverActor } from '../tools.js';
import { agentTelemetry, agentTrace } from '../trace.js';
import { POLICY_PROFILES } from './model.js';
import { isAgenticObjective } from './objective.js';

const OBJECTIVE = 'Review the June close status, identify the most material unresolved issues, and prepare a concise controller briefing with traceable evidence.';

const cfg = loadSloaneConfig();
if (!cfg.credentialsPresent) { console.error('ANTHROPIC_API_KEY is not set (packages/agent/.env).'); process.exit(1); }
const orch = new SloaneOrchestrator(new AnthropicSloaneAdapter(cfg), cfg, serverActor, undefined, undefined);
orch.artifacts.storage = mkdtempSync(join(tmpdir(), 'korvyn-a1-smoke-'));
const me = serverActor();
const A = orch.agents;
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];

const t0 = Date.now();
/* A2 §16 A — THE DIRECT GATE: a question is answered, never carried through as a run */
for (const q of ['What was June revenue?', 'Show May EBITDA.', 'Put that in bullets.']) {
  const g = isAgenticObjective(q);
  console.log(` gate  ${g.agentic ? 'AGENTIC' : 'direct '}  ${q.padEnd(28)} ${g.reason}`);
  if (g.agentic) { console.error('FAIL: a direct question started a run'); process.exit(1); }
}
console.log('');

/* A2 §16 B — no forced goal type: the objective is CLASSIFIED and Korvyn chooses the profile */
const started = A.start(me, OBJECTIVE);
if (!started.ok) { console.error('the runtime refused the objective:', started.reason); process.exit(1); }
const runId = started.run.runId;
console.log(`A1 §20 smoke · run ${runId} · ${cfg.provider} (${cfg.defaultModel} / ${cfg.advancedModel})\n`);

for (;;) {
  const b = A.body(runId, me)!;
  if (TERMINAL.includes(b.runStatus) || b.runStatus.startsWith('WAITING') || Date.now() - t0 > 300_000) break;
  await A.wait(runId, 3000);
  await new Promise((r) => setTimeout(r, 120));
}
const body = A.body(runId, me)!;
const P = POLICY_PROFILES[body.goal.policyProfile];
const T = agentTrace(body, { profile: P.id, autonomy: P.autonomy }, WRITE_ACTIONS_ENABLED);
const M = agentTelemetry(body);
const bodyType = body.goal.type;
const inv = body.result?.investigation ?? null;

/* ---- what the run actually did ---------------------------------------------------------------------------- */
console.log('--- PROGRESS ---');
for (const p of body.progress) console.log(` ${p.state.padEnd(8)} ${p.line}`);

console.log('\n--- THE BRIEFING ---');
console.log(` ${body.result?.headline ?? '(none)'}`);
for (const f of inv?.findings ?? []) console.log(`  · [${f.kind} / ${f.support}] ${f.statement}  ${f.observationRefs.join(' ')}`);
if (inv?.unresolved.length) console.log(` unresolved: ${inv.unresolved.join(' | ')}`);
for (const n of body.result?.notes ?? []) console.log(` note: ${n}`);
for (const x of body.result?.external ?? []) console.log(` external: ${x}`);

console.log('\n--- THE MODEL DECIDED EACH STEP ---');
for (const s of body.investigation?.steps ?? [])
  console.log(` ${String(s.iteration).padStart(2)}. ${s.cls} ${s.model ?? ''} → ${s.decision}${s.calls.length ? `: ${s.calls.map((c) => c.tool).join(', ')}` : ''}${s.escalated ? ` [escalated: ${s.escalated}]` : ''} (${s.capabilitiesShown} capabilities shown, ${s.latencyMs}ms)`);
for (const r of body.investigation?.rejected ?? []) console.log(` refused: ${r.tool} — ${r.why}`);
const par = body.events.filter((e) => e.type === 'STEPS_PARALLEL');
console.log('\n--- §18 PARALLELISM ---');
if (par.length) for (const e of par) console.log(` ${e.label}`); else console.log(' (no tick had two independent reads ready)');

/* ---- §20's ten checks -------------------------------------------------------------------------------------- */
const checks: [string, boolean, string][] = [
  ['1. accepted the objective', body.goal.objective === OBJECTIVE, `verbatim: ${body.goal.objective === OBJECTIVE}`],
  ['2. planned', (body.investigation?.steps.length ?? 0) > 0 && body.planner === 'MODEL', `planner=${body.planner}, ${body.investigation?.steps.length ?? 0} THINK steps`],
  ['3. discovered authorized capabilities', (body.investigation?.steps[0]?.capabilitiesShown ?? 0) > 0, `${body.investigation?.steps[0]?.capabilitiesShown ?? 0} shown of the registry, READ-only, actor-filtered`],
  ['4. performed several governed reads', M.toolCalls >= 3, `${M.toolCalls} calls · ${M.toolsUsed.join(', ')}`],
  ['5. observed results', (body.investigation?.observations.length ?? 0) >= 3, `${body.investigation?.observations.length ?? 0} observations, ${M.factsDiscovered} facts`],
  ['6. replanned when warranted', body.graph.revisions.length >= 3, `${body.graph.revisions.length} plan revisions`],
  ['7. produced a final briefing', !!body.result?.headline && (inv?.findings.length ?? 0) > 0, `${inv?.findings.length ?? 0} findings`],
  ['8. preserved fact / evidence references', T.references.factIds.length > 0, `${T.references.factIds.length} fact ids, ${T.references.populationIds.length} populations`],
  ['9. persisted the full run', !!A.body(runId, me), `kind AGENT_RUN, status ${body.runStatus}`],
  ['10. reconstructed the operational trace', T.toolCalls.length > 0 && T.modelCalls.length > 0 && T.transitions.length > 0 && !!T.stopReason, `${T.modelCalls.length} model calls, ${T.toolCalls.length} tool calls, ${T.authorizations.length} authorizations`],
  ['+  no hard-coded Close logic', body.goal.type === 'INVESTIGATE' && body.graph.tasks.every((t) => t.origin !== 'TEMPLATE' || !t.tool), 'every tool step came from the model, not a template'],
  ['+  read-only: nothing prepared, nothing written', M.proposalsPrepared === 0 && M.governedActionsExecuted === 0, `autonomy ${T.policy.autonomy}`],
  ['+  no authorization violation', M.authorizationViolations === 0, `${M.authorizationDenials} denials recorded`],
];
console.log('\n--- §20 CHECKS ---');
for (const [name, ok, detail] of checks) console.log(` ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${detail}`);

console.log('\n--- §8 EXECUTION WATERFALL ---');
const W = body.waterfall;
const parts: [string, number][] = [['classify (model)', W.classifyMs], ['plan', W.planMs], ['think (model)', W.thinkMs], ['tools', W.toolMs], ['synthesize (model)', W.synthesizeMs], ['narrate (model)', W.narrateMs], ['verify', W.verifyMs]];
const total = M.latencyMs || 1;
for (const [k, v] of parts) console.log(` ${k.padEnd(20)} ${String(v).padStart(6)}ms  ${((v / total) * 100).toFixed(1).padStart(5)}%`);
console.log(` ${'unaccounted'.padEnd(20)} ${String(Math.max(0, total - parts.reduce((a, x) => a + x[1], 0))).padStart(6)}ms`);
console.log(` replans: ${W.usefulReplans} useful / ${W.noopReplans} no-op`);
const cited = new Set((inv?.findings ?? []).flatMap((f) => f.observationRefs));
const obs = body.investigation?.observations ?? [];
console.log(` reads: ${obs.length} · cited by a finding: ${obs.filter((o) => cited.has(o.ref)).length} · uncited: ${obs.filter((o) => !cited.has(o.ref)).length}`);
console.log(` profile: ${body.goal.policyProfile} · outcome ${body.goal.outcome} (${body.goal.outcomeSource}) · goal type ${body.goal.type}`);
const byStage = body.trace.modelCalls.reduce<Record<string, number>>((a, c) => { const k = `${c.stage}@${c.route}`; a[k] = (a[k] ?? 0) + 1; return a; }, {});
console.log(` model calls: ${Object.entries(byStage).map(([k, v]) => `${k}×${v}`).join(' ')}`);

/* A2 §16 C — HEADLESS: the same objective, started with no conversation */
console.log('\n--- §16 C HEADLESS ---');
const h = orch.agentService.start(me, { objective: OBJECTIVE, origin: 'SCHEDULE', externalRef: 'a2-acceptance' });
if (!h.ok) { console.error('FAIL: headless start refused:', h.reason); process.exit(1); }
for (let i = 0; i < 150; i++) { const hb = A.body(h.runId, me)!; if (TERMINAL.includes(hb.runStatus) || hb.runStatus.startsWith('WAITING')) break; await A.wait(h.runId, 3000); await new Promise((r) => setTimeout(r, 120)); }
const hb = A.body(h.runId, me)!;
const ht = orch.agentService.trace(h.runId, me)!;
console.log(` run ${h.runId} ${hb.runStatus} · profile ${hb.goal.policyProfile} · goal type ${hb.goal.type} · reads ${hb.trace.toolCalls.length} · facts ${ht.references.factIds.length}`);
console.log(` origin recorded: ${hb.events.filter((e) => e.type === 'ORIGIN').map((e) => e.label).join('; ') || '(none)'}`);
console.log(` same contract: traceKind ${ht.traceKind} · authorizations ${ht.authorizations.length} · conversation dependency: ${hb.sessionId.startsWith('agent-') ? 'none' : hb.sessionId}`);
const hOk = hb.runStatus === 'COMPLETED' && hb.goal.type === bodyType && hb.goal.policyProfile === body.goal.policyProfile && hb.trace.toolCalls.length > 0;
console.log(` ${hOk ? 'PASS' : 'FAIL'}  same runtime semantics, same authorization, same trace, no conversation`);

console.log('\n--- TELEMETRY (§22) ---');
console.log(` status ${M.status} · stop: ${M.stopReason}`);
console.log(` iterations ${M.iterations} · steps ${M.steps} · model calls ${M.modelCalls} · tool calls ${M.toolCalls} (empty ${M.emptyToolCalls}, refused ${M.refusedToolCalls}, failed ${M.failedToolCalls})`);
console.log(` latency ${(M.latencyMs / 1000).toFixed(1)}s · tokens ${M.inputTokens} in / ${M.outputTokens} out / ${M.cacheReadTokens} cached · est. $${M.estimatedCostUsd.toFixed(4)}`);
console.log(` grounding: ${M.ungroundedRejected} statement(s) rejected for a figure no observation carried`);
if (M.budgetLimitsReached.length) console.log(` budget: ${M.budgetLimitsReached.join('; ')}`);

const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${failed.length ? `${failed.length} CHECK(S) FAILED` : 'ALL CHECKS PASS'} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failed.length ? 1 : 0);
