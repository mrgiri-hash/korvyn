/**
 * A development inspector for stored agent runs: `npx tsx src/sloane/agent/runs.ts [n]`.
 *
 * Reads the durable work store (kind AGENT_RUN) and prints what A1 measures per run — governed reads, parallel
 * batches, canonical fact ids, estimated cost and the stop reason. No model call, no spend.
 */
import '../../env.js';
import { MockLLMAdapter } from '../adapter.js';
import { SloaneOrchestrator } from '../orchestrator.js';
import { serverActor } from '../tools.js';
import { WORK } from '../store.js';
import type { AgentRunBody } from './model.js';

/* constructing the orchestrator is what binds the work store; nothing else here touches it */
new SloaneOrchestrator(new MockLLMAdapter(), { maxPlanSteps: 8 }, serverActor);

const n = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 5;
const runs = WORK.repos.records.list<{ run: AgentRunBody }>('AGENT_RUN');
console.log(`${runs.length} stored agent run(s); showing the last ${Math.min(n, runs.length)}\n`);
for (const r of runs.slice(-n)) {
  const run = r.run;
  const par = run.events.filter((e) => e.type === 'STEPS_PARALLEL');
  const facts = run.observations.reduce((a, o) => a + (o.factIds?.length ?? 0), 0)
    + (run.investigation?.observations ?? []).reduce((a, o) => a + o.facts.filter((f) => f.id).length, 0);
  console.log(`${run.runId}  ${run.goal.type.padEnd(13)} ${run.runStatus.padEnd(10)} reads=${String(run.trace.toolCalls.length).padStart(2)} modelCalls=${String(run.usage.modelCalls).padStart(2)} parallelBatches=${par.length} factIds=${String(facts).padStart(3)} cost=$${(run.usage.estimatedCostUsd ?? 0).toFixed(4)}`);
  console.log(`   goal: ${run.goal.title}`);
  for (const e of par) console.log(`   §18: ${e.label}`);
  if (run.completionReason) console.log(`   stop: ${run.completionReason}`);
}
process.exit(0);
