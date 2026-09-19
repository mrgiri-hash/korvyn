/**
 * Phase 7 LIVE agent eval — the six brief scenarios A–F against the real model (interpretation for GENERIC goals,
 * grounded narration of every result). SPENDS CREDITS.   Run: npm run sloane:live-agent
 * Writes data/live-agent-<time>.json with status, verification, headline, model calls and latency per scenario.
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSloaneConfig } from './config.js';
import { AnthropicSloaneAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { serverActor } from './tools.js';

const cfg = loadSloaneConfig();
if (!cfg.credentialsPresent) { console.error('ANTHROPIC_API_KEY is not set (packages/agent/.env).'); process.exit(1); }
const orch = new SloaneOrchestrator(new AnthropicSloaneAdapter(cfg), cfg, serverActor, undefined, undefined);
orch.artifacts.storage = mkdtempSync(join(tmpdir(), 'korvyn-live-agent-'));
const A = orch.agents, me = serverActor();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(id: string, done: (s: string) => boolean, ms = 90000) { const t = Date.now(); while (Date.now() - t < ms && !done(A.get(id, me)!.status)) { await A.wait(id, 2000); await sleep(100); } }
const out: Record<string, unknown>[] = [];
async function scenario(name: string, text: string, steer: (id: string) => Promise<void> = async () => {}, opts = {}) {
  const t0 = Date.now(), r = A.start(me, text, { options: opts });
  if (!r.ok) { out.push({ name, error: r.reason }); return; }
  await steer(r.run.runId);
  await until(r.run.runId, (s) => ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED', 'WAITING_FOR_CONFIRMATION', 'WAITING_FOR_GOVERNED_APPROVAL'].includes(s));
  const v = A.get(r.run.runId, me)!, b = A.body(r.run.runId, me)!;
  out.push({ name, text, status: v.status, ms: Date.now() - t0, headline: v.result?.headline ?? null, narrative: v.result?.narrative ?? [], verification: v.verification?.checks ?? null, modelCalls: b.trace.modelCalls, steps: b.usage.steps, revisions: b.graph.revisions.length });
  console.log(`${name}: ${v.status} · ${v.verification ? `${v.verification.checks.filter((c) => c.ok).length}/${v.verification.checks.length}` : '-'} · ${Date.now() - t0}ms · ${v.result?.headline ?? ''}`);
}
const decideOpen = (type: string, d: string) => async (id: string) => { await until(id, (s) => s.startsWith('WAITING') || s === 'COMPLETED'); const c = A.get(id, me)!.checkpoints.find((x) => x.type === type && x.status === 'OPEN'); if (c) await A.decide(id, me, c.id, d); };
await scenario('A close review', 'Review the June close.');
await scenario('B controller prep', 'Prepare the controller review for June.', decideOpen('CONFIRMATION', 'confirm'));
await scenario('C interruption', 'Investigate ABB spend for FY26', async (id) => { await sleep(1500); A.intervene(id, me, 'Only South Valley.'); }, { pace: 800 });
await scenario('D JDE unavailable', 'Investigate Siemens Energy for FY26');
await scenario('E governed approval', 'Prepare the controller review for June and approve the reconciliations that are ready', async (id) => { await decideOpen('CONFIRMATION', 'cancel')(id); await decideOpen('GOVERNED_APPROVAL', 'route')(id); });
await scenario('F audit package', 'Prepare the audit support package for CIP', decideOpen('CONFIRMATION', 'confirm'));
await scenario('G generic', 'Work through why CIP moved in June and what supports it');
mkdirSync('data', { recursive: true });
const f = `data/live-agent-${Date.now()}.json`; writeFileSync(f, JSON.stringify(out, null, 2)); console.log(`wrote ${f}`);
process.exit(0);
