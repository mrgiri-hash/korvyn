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

const OBJECTIVE = 'Review the June close status, identify the most material unresolved issues, and prepare a concise controller briefing with traceable evidence.';

const cfg = loadSloaneConfig();
if (!cfg.credentialsPresent) { console.error('ANTHROPIC_API_KEY is not set (packages/agent/.env).'); process.exit(1); }
const orch = new SloaneOrchestrator(new AnthropicSloaneAdapter(cfg), cfg, serverActor, undefined, undefined);
orch.artifacts.storage = mkdtempSync(join(tmpdir(), 'korvyn-a1-smoke-'));
const me = serverActor();
const A = orch.agents;
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];

const t0 = Date.now();
const started = A.start(me, OBJECTIVE, { goalType: 'INVESTIGATE' });
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

console.log('\n--- TELEMETRY (§22) ---');
console.log(` status ${M.status} · stop: ${M.stopReason}`);
console.log(` iterations ${M.iterations} · steps ${M.steps} · model calls ${M.modelCalls} · tool calls ${M.toolCalls} (empty ${M.emptyToolCalls}, refused ${M.refusedToolCalls}, failed ${M.failedToolCalls})`);
console.log(` latency ${(M.latencyMs / 1000).toFixed(1)}s · tokens ${M.inputTokens} in / ${M.outputTokens} out / ${M.cacheReadTokens} cached · est. $${M.estimatedCostUsd.toFixed(4)}`);
console.log(` grounding: ${M.ungroundedRejected} statement(s) rejected for a figure no observation carried`);
if (M.budgetLimitsReached.length) console.log(` budget: ${M.budgetLimitsReached.join('; ')}`);

const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${failed.length ? `${failed.length} CHECK(S) FAILED` : 'ALL CHECKS PASS'} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failed.length ? 1 : 0);
