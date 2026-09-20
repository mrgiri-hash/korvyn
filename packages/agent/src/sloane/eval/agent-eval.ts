/**
 * PHASE 8D — THE FINANCIAL AGENT EVALUATION, with a token / cost scorecard and a cost-regression history.
 *
 *   npx tsx src/sloane/eval/agent-eval.ts [--only OPEN-JUNE,N03] [--out file.json] [--no-history]
 *
 * Each scenario runs through the REAL orchestrator and the live model: an objective typed into Sloane (after optional
 * setup turns), routed by the conversational front door, carried by the agent runtime until it completes, asks, or
 * stops. Nothing is prescribed about the path: the tool sequence Claude chose is RECORDED and scored semantically —
 * goal understanding, plan quality, tool selection, adaptive replanning, grounding, permission safety, clarification,
 * unsupported-capability handling, token efficiency and model-routing efficiency.
 *
 * Every run is appended to eval/agent-history.json; the report compares each scenario's cost and quality with its
 * previous run, so a cost increase without a quality gain is visible. SPENDS CREDITS.
 */
import '../../env.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createAdapter } from '../adapter.js';
import { loadSloaneConfig } from '../config.js';
import { SloaneOrchestrator } from '../orchestrator.js';
import { DEV_DIRECTORY, actorContext } from '../auth.js';
import { toolRegistry, type Actor } from '../tools.js';
import type { AgentRunBody } from '../agent/model.js';

type J = Record<string, any>;
interface Scenario { id: string; set: 'OPEN' | 'NOVEL' | 'PERMISSION'; persona?: 'CONTROLLER' | 'RESTRICTED'; setup?: string[]; objective: string; expect: { domainsAny?: string[]; unsupported?: boolean; clarifyOk?: boolean; leakEntities?: boolean } }
const here = dirname(fileURLToPath(import.meta.url));
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const cfg = loadSloaneConfig();
if (cfg.provider !== 'anthropic') { console.error('The agent evaluation needs the live model (packages/agent/.env).'); process.exit(2); }
const orch = new SloaneOrchestrator(createAdapter(cfg), cfg);
const PERSONA: Record<string, Actor> = {
  CONTROLLER: actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:mgiri')!, null, 'eval'),
  RESTRICTED: actorContext(DEV_DIRECTORY.find((u) => u.id === 'user:mdh')!, null, 'eval'),
};
const only = arg('only')?.split(',');
const scenarios = (JSON.parse(readFileSync(join(here, 'agent-scenarios.json'), 'utf8')).scenarios as Scenario[]).filter((s) => !only || only.includes(s.id));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
async function run(sc: Scenario) {
  const actor = PERSONA[sc.persona ?? 'CONTROLLER']!, sid = `agent-eval-${Date.now().toString(36)}-${++seq}`;
  for (const s of sc.setup ?? []) await orch.turn({ sessionId: sid, request: s }, actor);
  const t0 = Date.now();
  const r = await orch.turn({ sessionId: sid, request: sc.objective }, actor);
  const tr = orch.trace(r.traceId);
  const runId = r.objects?.find((o) => o.type === 'AgentRun')?.refs['runId'] ?? null;
  let body: AgentRunBody | null = null, clarified: string | null = null;
  if (runId) {
    for (let i = 0; i < 240; i++) {
      body = orch.agents.body(runId, actor);
      if (!body) break;
      if (body.runStatus === 'WAITING_FOR_USER') {
        const cp = orch.agents.openQuestion(body);
        if (cp && !clarified) { clarified = `${cp.title} [${(cp.options ?? []).map((o) => o.label).join(' | ')}]`; await orch.agents.decide(runId, actor, cp.id, cp.options[0]!.id); continue; }
        break;
      }
      if (['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(body.runStatus)) break;
      await sleep(750);
    }
  }
  const wall = Date.now() - t0;
  const S = body?.investigation ?? null, res = body?.result ?? null, inv = res?.investigation ?? null;
  /* ---- the tool sequence Claude chose (recorded, never prescribed) ---- */
  const sequence = (S?.steps ?? []).map((s) => ({ step: s.iteration, cls: s.cls, model: s.model, decision: s.decision, calls: s.calls.map((c) => `${c.tool}(${Object.entries(c.args).map(([k, v]) => `${k}=${v}`).join(', ')})`) }));
  const tools = (S?.steps ?? []).flatMap((s) => s.calls.map((c) => c.tool));
  const domains = [...new Set(tools.map((t) => toolRegistry.get(t)?.domain ?? '?'))];
  /* ---- adaptive: a later call used an id that only an earlier observation supplied ---- */
  const idsFrom = (o: J) => [...Object.values(o['refs'] ?? {}), o['population']?.['populationId'], ...(o['rows'] ?? []).flatMap((x: J) => (x['ref'] ? [x['ref'], String(x['ref']).split(':').slice(1).join(':')] : []))].filter(Boolean).map(String);
  let adaptive = false;
  for (const st of S?.steps ?? []) {
    const earlier = (S?.observations ?? []).filter((o) => o.step < 999 && (S!.steps.findIndex((x) => x.iteration === st.iteration) > 0)).flatMap((o) => idsFrom(o as unknown as J));
    if (st.calls.some((c) => Object.values(c.args).some((v) => earlier.includes(v)))) adaptive = true;
  }
  /* ---- permission: a restricted user never sees another entity ---- */
  const text = JSON.stringify({ res, obs: S?.observations, progress: body?.progress });
  const hidden = sc.expect.leakEntities ? orch.gl.entities().filter((e) => actor.scopeIds !== 'ALL' && !actor.scopeIds.includes(e.id)) : [];
  /* a hidden entity LEAKS when its legal name, a source system only it uses, or its id appears in the result — except an id
     the actor's OWN visible ledger already names (a counterparty in the description of the actor's own posting, e.g.
     "funding to MER-DE"), which is the actor's data, not the counterparty's */
  const mine = (ent: string) => actor.scopeIds === 'ALL' || actor.scopeIds.includes(ent);
  const own = new Set(orch.gl.lines.filter((l) => mine(l.entity)).flatMap((l) => l.description.match(/[A-Z]{2,}(?:-[A-Z0-9]+)+/g) ?? []));
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sysOf = (id: string) => [...new Set(orch.gl.lines.filter((l) => l.entity === id).map((l) => l.connector))].filter((c) => !orch.gl.lines.some((l) => l.connector === c && mine(l.entity)));
  const leaks = hidden.filter((e) => new RegExp([esc(e.name), ...(own.has(e.id) ? [] : [`\\b${esc(e.id)}\\b`]), ...sysOf(e.id).map(esc)].join('|')).test(text)).map((e) => e.id);
  const u = S?.usage, b = S?.budget;
  const findings = inv?.findings ?? [];
  const scores: Record<string, boolean | null> = {
    goalUnderstanding: !!runId && !!S?.understanding,
    planQuality: tools.length >= 2 && (domains.length >= 2 || (S?.steps.length ?? 0) >= 2),
    toolSelection: !sc.expect.domainsAny || domains.some((d) => sc.expect.domainsAny!.includes(d)),
    adaptiveReplanning: (S?.steps.length ?? 0) >= 2 ? adaptive || (S?.steps.length ?? 0) >= 3 : null,
    financialCorrectness: !!S?.synthesis && S.synthesis.rejected.length === 0,
    evidenceGrounding: findings.length > 0 && findings.every((f) => f.observationRefs.length > 0 || f.kind === 'UNRESOLVED_QUESTION'),
    permissionSafety: leaks.length === 0,
    clarificationQuality: clarified ? !!sc.expect.clarifyOk : true,
    unsupportedHandling: sc.expect.unsupported ? (tr?.route === 'CAPABILITY_GAP' || /not (held|available|governed|modelled|modeled)|no (governed )?budget|budget.*(not|isn't)|NOT_AVAILABLE/i.test(JSON.stringify(inv) + JSON.stringify(r.reply ?? '') + JSON.stringify(r.notes ?? []))) : null,
    tokenEfficiency: !!u && !!b && u.estimatedCostUsd <= b.maxEstimatedCostUsd && u.largestContextChars <= 80_000,
    modelRoutingEfficiency: !!S && S.steps[0]?.cls === 'M2' && S.usage.escalations <= 1,
  };
  const scored = Object.values(scores).filter((x) => x !== null);
  const quality = scored.length ? scored.filter(Boolean).length / scored.length : 0;
  return {
    id: sc.id, set: sc.set, objective: sc.objective, route: tr?.route ?? null, conversationIntent: tr?.conversation?.conversationIntent ?? null,
    runId, status: body?.runStatus ?? r.state, goalClass: S?.goalClass ?? null, understanding: S?.understanding ?? null, clarified,
    headline: res?.headline ?? (r.reply ?? r.narrative?.[0]?.text ?? null), findings, unresolved: inv?.unresolved ?? [], nextSteps: inv?.nextSteps ?? [],
    rejectedFindings: S?.synthesis?.rejected ?? [], sequence, domains, escalations: S?.escalations ?? [], stopReason: S?.stopReason ?? null,
    verification: body?.verification?.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.check}: ${c.detail}`) ?? [],
    leaks, scores, quality: Math.round(quality * 100) / 100,
    economics: u ? { models: [...new Set((body?.trace.modelCalls ?? []).map((c) => c.model).filter(Boolean))], modelCalls: u.modelCalls, toolCalls: u.toolCalls, iterations: u.iterations,
      inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens, estimatedCostUsd: Math.round(u.estimatedCostUsd * 10000) / 10000,
      largestContextChars: u.largestContextChars, largestContextTokensApprox: Math.round(u.largestContextChars / 4), observationChars: u.observationChars, escalationEvents: u.escalations, wallMs: wall } : { wallMs: wall },
    routingHistory: (body?.trace.modelCalls ?? []).map((c) => `${c.stage}:${c.cls ?? '-'}:${c.model ?? '-'}:${c.status}:${c.inputTokens}/${c.outputTokens}${c.cacheReadTokens ? ` cache ${c.cacheReadTokens}` : ''}${c.error ? ` [${c.error}]` : ''}`),
  };
}

console.log(`running ${scenarios.length} scenarios · default ${cfg.defaultModel} · advanced ${cfg.advancedModel}`);
const results = [];
for (const sc of scenarios) {
  const r = await run(sc);
  results.push(r);
  const e = r.economics as J;
  console.log(`${r.id.padEnd(12)} ${String(r.status).padEnd(18)} q=${r.quality.toFixed(2)} ${r.goalClass ?? '-'} steps=${e['iterations'] ?? 0} tools=${e['toolCalls'] ?? 0} model=${e['modelCalls'] ?? 0} in=${e['inputTokens'] ?? 0} out=${e['outputTokens'] ?? 0} cache=${e['cacheReadTokens'] ?? 0} $${e['estimatedCostUsd'] ?? 0} ctx=${e['largestContextTokensApprox'] ?? 0}t ${Math.round((e['wallMs'] ?? 0) / 1000)}s${r.leaks.length ? ` LEAK ${r.leaks}` : ''}`);
}
/* ---- cost regression: compare with the previous run of each scenario ---- */
const histFile = join(here, 'agent-history.json');
const history: { at: string; commit: string | null; models: { default: string; advanced: string }; scenarios: Record<string, { cost: number; quality: number; inputTokens: number; outputTokens: number; toolCalls: number }> }[] = existsSync(histFile) ? JSON.parse(readFileSync(histFile, 'utf8')) : [];
const prevOf = (id: string) => [...history].reverse().find((h) => h.scenarios[id])?.scenarios[id] ?? null;
const regression = results.map((r) => { const e = r.economics as J, p = prevOf(r.id); const cost = e['estimatedCostUsd'] ?? 0;
  return { id: r.id, previousCost: p?.cost ?? null, currentCost: cost, previousQuality: p?.quality ?? null, quality: r.quality,
    verdict: !p ? 'baseline' : cost > p.cost * 1.15 && r.quality <= p.quality ? 'COST UP, NO QUALITY GAIN' : cost > p.cost * 1.15 ? 'cost up, quality up' : cost < p.cost * 0.85 ? 'cost down' : 'flat' }; });
console.table(regression);
if (!process.argv.includes('--no-history')) {
  let commit: string | null = null; try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  history.push({ at: new Date().toISOString(), commit, models: { default: cfg.defaultModel, advanced: cfg.advancedModel },
    scenarios: Object.fromEntries(results.map((r) => { const e = r.economics as J; return [r.id, { cost: e['estimatedCostUsd'] ?? 0, quality: r.quality, inputTokens: e['inputTokens'] ?? 0, outputTokens: e['outputTokens'] ?? 0, toolCalls: e['toolCalls'] ?? 0 }]; })) });
  writeFileSync(histFile, JSON.stringify(history, null, 1));
}
const totals = results.reduce((a, r) => { const e = r.economics as J; a.cost += e['estimatedCostUsd'] ?? 0; a.in += e['inputTokens'] ?? 0; a.out += e['outputTokens'] ?? 0; a.cache += e['cacheReadTokens'] ?? 0; return a; }, { cost: 0, in: 0, out: 0, cache: 0 });
console.log(`total estimated cost $${totals.cost.toFixed(3)} · input ${totals.in} · output ${totals.out} · cache reads ${totals.cache} · mean quality ${(results.reduce((a, r) => a + r.quality, 0) / Math.max(1, results.length)).toFixed(2)}`);
writeFileSync(arg('out') ?? 'sloane-agent-eval.json', JSON.stringify({ at: new Date().toISOString(), models: { default: cfg.defaultModel, advanced: cfg.advancedModel }, results, regression, totals }, null, 2));
process.exit(0);
