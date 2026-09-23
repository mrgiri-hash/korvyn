/**
 * A6 — THE SECOND PRODUCTION PROFILE, AND THE PROOF IT IS ONLY CONFIGURATION.
 *
 *   §4   RECONCILIATION is declarative: no tool names, no steps, no tolerance, no rules
 *   §5   no code anywhere branches on it
 *   §6   PRECEDENCE — the narrower profile wins through the existing selection, with no phrase routing
 *   §7   a module launch anchors on the governed ObjectRef and nothing else
 *   §11  it may prepare, and only what its own contract permits
 *   §20  its evaluation expectations are executable and every check it names exists
 *   §22  a reconciliation question does not become an agent run
 *
 * The live BEHAVIOUR (does it find the break, does it stay honest about evidence) is the evaluation harness's
 * job, not this file's: `npm run agent:eval -- --live --profile RECONCILIATION`. What is asserted here is the
 * architecture, which must hold whether or not a model is configured.
 *
 *   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { type Actor, ROLES, serverActor } from './tools.js';
import { POLICY_PROFILES, type ProfileId } from './agent/model.js';
import { profileForOutcome } from './agent/objective.js';
import { CHECKS } from './eval/agent/checks.js';
import { score } from './eval/agent/harness.js';
import { coverageOf } from './eval/agent/match.js';
import type { AgentEvalScenario, ScenarioSuite } from './eval/agent/model.js';
import type { AgentRunBody } from './agent/model.js';
import type { KorvynTrace } from './trace.js';
import type { AgentStepOut } from './schema.js';

const me = serverActor();
const auditor: Actor = { id: 'user:auditor', name: 'Priya Nair', ...ROLES['EXTERNAL_AUDITOR']! };
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'];
const usage = { inputTokens: 900, outputTokens: 120, cacheReadTokens: 80, cacheWriteTokens: 0 };
const ok = <T>(value: T, route: string) => ({ status: 'ok' as const, latencyMs: 1, requestId: null, usage, model: 'claude-sonnet-5', route, value });
const read = (tool: string, args: Record<string, string>) => ({ tool, intent: 'READ' as const, purpose: `Reading ${tool}`, progress: 'Inspecting the reconciliation', args: Object.entries(args).map(([name, value]) => ({ name, value })) });
const step = (o: Partial<AgentStepOut>): AgentStepOut => ({
  goalClass: 'RECONCILIATION_REVIEW', understanding: 'Look at the reconciliation.', decision: 'CALL_TOOLS', calls: [], needCapabilities: [],
  workingNotes: [], openQuestions: [], question: null, options: [], confidence: 0.8, escalate: { needed: false, reason: null, detail: null }, ...o,
}) as AgentStepOut;

function scripted(steps: (n: number) => AgentStepOut, outcome = 'ANALYZE', workClass: string | null = 'RECONCILIATION_REVIEW') {
  const a = new MockLLMAdapter(); Object.defineProperty(a, 'provider', { value: 'scripted' });
  const A = a as unknown as Record<string, unknown>;
  A['classifyObjective'] = async () => ok({ outcome, workClass, understanding: 'scripted', needsDeepReasoning: false, confidence: 0.9 }, 'NARRATE');
  let n = 0;
  A['agentStep'] = async (_i: unknown, o: { route: string }) => { n += 1; return ok(steps(n), o.route); };
  A['agentSynth'] = async (_i: unknown, o: { route: string }) => ok({ headline: 'The reconciliation does not tie.', inspected: [], findings: [], unresolved: [], nextSteps: [], confidence: 0.7, escalate: { needed: false, reason: null, detail: null } }, o.route);
  return new SloaneOrchestrator(a, { maxPlanSteps: 8 }, () => me);
}
const reconScript = (n: number) => (n === 1
  ? step({ calls: [read('getReconciliationsNotTied', { period: '2026-06' })] })
  : step({ decision: 'SYNTHESIZE' }));
async function until(o: SloaneOrchestrator, runId: string, actor: Actor, ms = 20000): Promise<AgentRunBody> {
  const t0 = Date.now();
  for (;;) { const b = o.agents.body(runId, actor)!; if (TERMINAL.includes(b.runStatus) || b.runStatus.startsWith('WAITING') || Date.now() - t0 > ms) return b; await new Promise((r) => setTimeout(r, 25)); }
}

/* ================================================================================================
   §4 / §5 — CONFIGURATION, AND NOTHING BRANCHES ON IT
   ================================================================================================ */
test('§4 — the Reconciliation profile is declarative and carries no reconciliation logic', () => {
  const p = POLICY_PROFILES['RECONCILIATION'];
  assert.equal(p.execution, 'GENERIC', 'it runs the generic runtime');
  assert.ok(p.purpose.length > 40 && p.completion.length >= 4);
  assert.ok(p.policyRefs?.includes('TIE_TOLERANCE_USD'), 'it names the tie policy by reference');

  const json = JSON.stringify(p);
  /* §4 — no tool names, no account rules, no tolerance value, no step sequence */
  assert.equal(/\bget[A-Z]\w+|propose[A-Z]\w+/.test(json), false, 'no tool is named');
  /**
   * §4 — NO TOLERANCE OR MATERIALITY COPIED IN. The deployment's own default (`base.materialityUsd`) sits on
   * every profile and is not a copy; what WOULD be a copy is this profile restating a governed threshold, which
   * is how `TIE_TOLERANCE_USD` would come to have two values that silently disagree.
   */
  assert.equal(p.materialityUsd, POLICY_PROFILES['INVESTIGATION'].materialityUsd, 'it carries no threshold of its own');
  /* it NAMES the tolerance policies (which is what §4 asks for) and carries no value for any of them */
  assert.deepEqual(p.policyRefs, ['TIE_TOLERANCE_USD', 'APPROVAL_THRESHOLD_USD']);
  const withoutRefs = JSON.stringify({ ...p, policyRefs: [] });
  assert.equal(/tolerance|threshold/i.test(withoutRefs), false, 'and states no tolerance value of its own');
  assert.equal(/roll-?forward|subledger|intercompany|13100/i.test(json), false, 'no reconciliation method or account is hard-coded');

  /* §11 — it acts NARROWER than it reads, which is the whole point of actionDomains */
  assert.deepEqual(p.actionDomains, ['action'], 'it prepares workflow actions, not workbooks');
  assert.ok(p.domains.length > p.actionDomains.length + 5, 'and reads far wider: a break is often explained elsewhere');
  assert.equal(p.preparableActions.includes('GENERATE_EXCEL_ARTIFACT'), false, 'it does not build deliverables');
  assert.ok(p.preparableActions.includes('ADD_RECONCILIATION_COMMENT') && p.preparableActions.includes('ATTACH_SUPPORT'));
});

test('§5 — no code outside the profile table branches on RECONCILIATION', () => {
  const dir = join(process.cwd(), 'src', 'sloane');
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) files.push(f); } };
  walk(dir);
  /* the shapes that would BE a branch on this profile's identity — not the bare word, which is also a goal class,
     a domain, an object type and half the product's vocabulary */
  const BRANCH = /POLICY_PROFILES\[\s*['"]RECONCILIATION['"]\s*\]|(?:policyProfile|profile)\s*===\s*['"]RECONCILIATION['"]|['"]RECONCILIATION['"]\s*===\s*(?:\w+\.)?(?:policyProfile|profile)/;
  const offenders = files.filter((f) => !f.endsWith(join('agent', 'model.ts')))
    .filter((f) => BRANCH.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
  assert.deepEqual(offenders.map((f) => f.split('src')[1]), []);
});

/* ================================================================================================
   §6 — PRECEDENCE
   ================================================================================================ */
test('§6 — a reconciliation objective reaches RECONCILIATION; a close objective still reaches CLOSE', () => {
  /* the narrower profile wins because it declares fewer classes — no phrase, no route, no ordering by hand */
  assert.equal(profileForOutcome('ANALYZE', me, undefined, 'RECONCILIATION_REVIEW').profile, 'RECONCILIATION');
  assert.equal(profileForOutcome('PREPARE_WORKFLOW_ACTIONS', me, undefined, 'RECONCILIATION_REVIEW').profile, 'RECONCILIATION');

  /* a broad close objective is unaffected: CLOSE_READINESS is a class RECONCILIATION does not claim */
  assert.equal(profileForOutcome('ANALYZE', me, undefined, 'CLOSE_READINESS').profile, 'CLOSE');
  assert.equal(profileForOutcome('PREPARE_WORKFLOW_ACTIONS', me, undefined, 'REVIEW_PREPARATION').profile, 'CLOSE');
  assert.equal(profileForOutcome('ANALYZE', me, undefined, 'FLUX_REVIEW').profile, 'CLOSE');

  /* and the reason is structural, not a table of winners */
  assert.ok(POLICY_PROFILES['RECONCILIATION'].servesClasses!.length < POLICY_PROFILES['CLOSE'].servesClasses!.length);
  assert.ok(POLICY_PROFILES['CLOSE'].servesClasses!.includes('RECONCILIATION_REVIEW'), 'CLOSE keeps it as the fallback');

  /* §6 — the actor's authority still caps it, exactly as it caps every other profile */
  const capped = profileForOutcome('PREPARE_WORKFLOW_ACTIONS', auditor, undefined, 'RECONCILIATION_REVIEW');
  assert.equal(capped.profile, 'INVESTIGATION');
  assert.equal(capped.capped, true);
});

test('§6 — selection is by declaration, so removing the class would hand the work back to CLOSE', () => {
  /* a scenario proving the mechanism rather than the current table: a class only CLOSE declares goes to CLOSE */
  assert.equal(profileForOutcome('ANALYZE', me, undefined, 'EVIDENCE_REVIEW').profile, 'CLOSE');
  /* a class nobody declares falls back to the outcome's own default — pre-A4 behaviour, unchanged */
  assert.equal(profileForOutcome('ANALYZE', me, undefined, 'ANOMALY_REVIEW').profile, 'INVESTIGATION');
});

test('§6 — a live-shaped classification carries the class through to the run', async () => {
  const orch = scripted(reconScript);
  const r = orch.agents.start(me, 'Why is the MDH intercompany reconciliation off?', { sessionId: 'a6-precedence-1' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  /**
   * AN AMBIGUOUS GOAL WAITS BEFORE IT CLASSIFIES — A4's clarification hardening, working, and the right order:
   * the profile is chosen from a RESOLVED objective, not from the words as typed. The harness answers the
   * question the way a person would, and so does this test.
   */
  let b = await until(orch, r.run.runId, me);
  const q = orch.agents.openQuestion(b);
  if (q?.options?.length) { await orch.agents.decide(r.run.runId, me, q.id, q.options[0]!.id); b = await until(orch, r.run.runId, me); }
  assert.equal(b.goal.policyProfile, 'RECONCILIATION');
  assert.equal(b.goal.workClass, 'RECONCILIATION_REVIEW');
  /* §4 — read-only by default, because this objective asked to understand rather than prepare */
  assert.equal(b.goal.constraints.noActions, false, 'the profile may prepare');
});

/* ================================================================================================
   §7 / §13 — THE MODULE LAUNCH ANCHORS ON THE OBJECT
   ================================================================================================ */
test('§7 — a launch carries the reconciliation, the period and the scope, and nothing else', async () => {
  const orch = scripted(reconScript);
  const out = orch.agentLaunch.launch(me, {
    action: 'INVESTIGATE',
    context: {
      module: 'reconciliations',
      objectRefs: [
        { type: 'reconciliation', id: 'REC-MDH-13100', label: 'Intercompany receivable — MDH vs foreign OpCos' },
        { type: 'domSelection', id: 'the row the user had highlighted' },
      ],
      period: '2026-06', scope: 'MDH', lens: 'Corporate Consolidated',
    },
    sessionId: 'a6-module-1',
  });
  assert.ok(out.ok, out.reason ?? '');
  const b = await until(orch, out.runId!, me);

  /* §13 — the objective names no account, entity or period: the anchor came from the ObjectRef */
  assert.ok(b.goal.refs?.some((x) => x.type === 'reconciliation' && x.id === 'REC-MDH-13100'));
  assert.match(b.goal.objective, /Intercompany receivable/);
  assert.equal(b.launchedFrom?.object, 'reconciliation:REC-MDH-13100');
  assert.equal(b.launchedFrom?.period, '2026-06');
  assert.equal(b.origin, 'MODULE');
  /* §7 — and the page state did not travel */
  assert.ok(out.carried!.dropped.some((d) => /domSelection/.test(d)));
  assert.equal(b.goal.refs?.some((x) => x.type === 'domSelection'), false);
  assert.equal(b.actor.id, me.id, 'the same authorization, whoever launched it');
});

/* ================================================================================================
   §22 — A RECONCILIATION QUESTION IS NOT AN AGENT RUN
   ================================================================================================ */
test('§22 — the existence of a Reconciliation profile does not agentify every reconciliation question', () => {
  const orch = scripted(reconScript);
  for (const q of [
    'What is the status of the MDH intercompany receivable reconciliation?',
    'Does the trade payables reconciliation tie?',
    'What is the difference on 13100?',
  ]) {
    assert.equal(orch.agents.detect(q, me), null, `"${q}" is a question, not work to carry through`);
  }
});

/* ================================================================================================
   §20 — THE PROFILE'S EVALUATION EXPECTATIONS ARE EXECUTABLE
   ================================================================================================ */
test('§20 — every expectation the profile declares names a check that exists, and covers the dimensions that matter', () => {
  const e = POLICY_PROFILES['RECONCILIATION'].evaluation!;
  for (const x of [...e.required, ...e.prohibited]) assert.ok(CHECKS[x.check], `no such check: ${x.check}`);
  const dims = new Set([...e.required, ...e.prohibited].map((x) => x.dimension));
  for (const d of ['COVERAGE', 'GROUNDING', 'AUTHORIZATION', 'ACTION_SAFETY', 'COMPLETION'] as const) {
    assert.ok(dims.has(d), `the profile says nothing about ${d}`);
  }
  /* §20 — and no composite score anywhere */
  assert.equal(JSON.stringify(e).includes('score'), false);
});

/* ================================================================================================
   §9 / §16 — EVIDENCE HONESTY, AND §20 NO FABRICATED CAUSE
   ================================================================================================ */
const zeroPhase = { modelCalls: 0, modelMs: 0, toolCalls: 0, toolMs: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
const trace = (over: Partial<KorvynTrace> = {}): KorvynTrace => ({
  traceId: 'TR-1', traceKind: 'AGENT_RUN' as KorvynTrace['traceKind'], subjectId: 'RUN-1', subjectTitle: 'recon',
  actor: { id: 'user:mgiri', role: 'FINANCE_REVIEWER', scope: 'ALL' },
  policy: { profile: POLICY_PROFILES['RECONCILIATION'].label, autonomy: 2, writeActionsEnabled: false },
  objective: 'Investigate.', startedAt: 'a', endedAt: 'b', status: 'COMPLETED',
  plan: { planId: 'P', version: 1, source: 'MODEL', revisions: [] },
  steps: [], modelCalls: [], toolCalls: [], authorizations: [], observations: [], transitions: [], approvals: [], interventions: [],
  proposals: [], references: { objectIds: [], factIds: [], evidenceIds: [], populationIds: [], artifactIds: [], proposalIds: [] },
  usage: { steps: 4, modelCalls: 6, toolCalls: 8, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, estimatedCostUsd: 0.1, latencyMs: 1000 },
  verification: { at: 'x', passed: true, checks: [] }, stopReason: null,
  findings: [], withheldFindings: [], unresolved: [],
  economy: { planning: { ...zeroPhase }, investigation: { ...zeroPhase }, preparation: { ...zeroPhase }, synthesis: { ...zeroPhase }, approval: { checkpoints: 0, decided: 0, waitMs: 0, resumedSteps: 0, resumedCostUsd: 0 } },
  origin: null, workproductId: null, result: { headline: 'h', findings: 0, narrative: [] }, ...over,
});
const f = (o: Partial<KorvynTrace['findings'][number]>) => ({ statement: 's', kind: 'OBSERVED_FACT', support: 'SUPPORTED', severity: null, amountUsd: null, factIds: ['f_1'], objectIds: [], ...o });
const sc = (o: Partial<AgentEvalScenario> = {}): AgentEvalScenario => ({ id: 'sc', title: 't', objective: 'o', profile: 'RECONCILIATION', actor: 'user:mgiri', dataset: 'CORE-EGL-S42-I12', version: 1, ...o });
const scored = (t: KorvynTrace, s = sc()) => score({ scenario: s, trace: t, workproduct: null, hiddenEntities: [], knownPeople: ['Mitra Giri', 'L. Chen'] });

test('§16 — evidence that could not be retrieved must be said, not filled in', () => {
  const silent = scored(trace({
    observations: [{ stepId: 's1', at: 'x', status: 'COMPLETED', resultType: 'R', objectIds: [], warnings: ['the bank source is not connected'], errors: [], findings: 0 }],
    findings: [f({ statement: 'The cash balance is supported' })],
  }));
  assert.ok(silent.hardFailures.some((h) => /nothing in the result says so/.test(h)), 'a silent run fails');

  const honest = scored(trace({
    observations: [{ stepId: 's1', at: 'x', status: 'COMPLETED', resultType: 'R', objectIds: [], warnings: ['the bank source is not connected'], errors: [], findings: 0 }],
    findings: [f({ statement: 'The GL balance is $12.00M' })],
    unresolved: ['The bank statement source is not connected, so the balance cannot be proved.'],
  }));
  assert.ok(!honest.hardFailures.some((h) => /says so/.test(h)), 'saying so satisfies it');
});

test('§20 — a cause asserted as fact needs a record; offered as an inference it does not', () => {
  const invented = scored(trace({ findings: [f({ statement: 'The difference is because the German entity posted late', factIds: [], objectIds: [] })] }));
  assert.ok(invented.hardFailures.some((h) => /asserted as fact with nothing behind it/.test(h)));

  const reasoned = scored(trace({ findings: [f({ kind: 'INFERENCE', statement: 'The difference is likely because of timing', factIds: [], objectIds: [] })] }));
  assert.ok(!reasoned.hardFailures.some((h) => /asserted as fact/.test(h)), 'an interpretation is allowed to be an interpretation');

  const grounded = scored(trace({ findings: [f({ statement: 'The difference is due to unmatched postings', factIds: ['f_9'] })] }));
  assert.ok(!grounded.hardFailures.some((h) => /asserted as fact/.test(h)));
});

/* ================================================================================================
   §19 — THE EVAL SUITE MATCHES ON GOVERNED HANDLES
   ================================================================================================ */
test('§19 — the reconciliation suite is complete, versioned, and matches structurally', () => {
  const file = join(process.cwd(), 'src', 'sloane', 'eval', 'agent', 'scenarios', 'reconciliation.json');
  const suite = JSON.parse(readFileSync(file, 'utf8')) as ScenarioSuite;
  assert.equal(suite.suite, 'RECONCILIATION');
  assert.equal(suite.scenarios.length, 10, '§19 lists ten cases');
  /* the cases §19 names are each present */
  for (const id of ['recon-mdh-break', 'recon-module-launch', 'recon-historical', 'recon-no-issue', 'recon-evidence-unavailable', 'recon-restricted-actor', 'recon-prepare-comment', 'recon-reject-action', 'recon-resume-action', 'recon-simple-lookup']) {
    assert.ok(suite.scenarios.some((s) => s.id === id), `missing ${id}`);
  }
  /* every scenario names this profile and a real check */
  for (const s of suite.scenarios) {
    assert.equal(s.profile, 'RECONCILIATION');
    for (const e of [...(s.requires ?? []), ...(s.prohibits ?? [])]) assert.ok(CHECKS[e.check], `${s.id}: no such check ${e.check}`);
  }
});

test('§19 — the known break is matched by governed handle and amount, not by wording', () => {
  const file = join(process.cwd(), 'src', 'sloane', 'eval', 'agent', 'scenarios', 'reconciliation.json');
  const suite = JSON.parse(readFileSync(file, 'utf8')) as ScenarioSuite;
  const s = suite.scenarios.find((x) => x.id === 'recon-mdh-break')!;

  /* the real figure, worded two ways — both match */
  for (const statement of [
    'REC-MDH-13100 does not tie: the difference is $6.18M',
    'The MDH intercompany receivable exceeds the counterparties’ payables by 6.184M',
  ]) {
    const c = coverageOf(trace({ findings: [f({ statement, objectIds: ['recon:REC-MDH-13100'] })] }), s)!;
    assert.ok(c.found.some((x) => x.id === 'break'), `not matched: ${statement}`);
  }
  /* the right object with the wrong amount is not the finding */
  const wrong = coverageOf(trace({ findings: [f({ statement: 'REC-MDH-13100 is out by $99M', objectIds: ['recon:REC-MDH-13100'] })] }), s)!;
  assert.equal(wrong.found.some((x) => x.id === 'break'), false);
  assert.equal(wrong.missed.some((m) => m.id === 'break'), true, 'and it is recorded as a miss');
});

test('§15 — a tied reconciliation: borrowing another reconciliation’s break is a false positive', () => {
  const file = join(process.cwd(), 'src', 'sloane', 'eval', 'agent', 'scenarios', 'reconciliation.json');
  const suite = JSON.parse(readFileSync(file, 'utf8')) as ScenarioSuite;
  const s = suite.scenarios.find((x) => x.id === 'recon-no-issue')!;
  const borrowed = coverageOf(trace({ findings: [f({ statement: 'Trade payables is out by 6.18M', objectIds: ['recon:REC-MDH-20100'] })] }), s)!;
  assert.ok(borrowed.falsePositives.length, 'a break on a reconciliation that ties is flagged');
});

/* ================================================================================================
   §2 of A5 — THE BASELINE LABEL AND ITS COMPARISON
   ================================================================================================ */
test('A6 §2 — a live result can be labelled as a baseline, and the label is on the entry', async () => {
  const { historyEntry, variance } = await import('./eval/agent/harness.js');
  const { loadSloaneConfig } = await import('./config.js');
  const s = sc({ expectedFindings: [{ id: 'break', label: 'the break', severity: 'CRITICAL', refs: { reconciliations: ['REC-MDH-13100'] } }] });
  const hit = scored(trace({ findings: [f({ objectIds: ['recon:REC-MDH-13100'] })] }), s);
  const h = historyEntry(hit, s, loadSloaneConfig(), 'LIVE', 'RECONCILIATION', 'RECON_BASELINE_V1');
  assert.equal(h.baseline, 'RECON_BASELINE_V1');
  assert.equal(h.suite, 'RECONCILIATION');
  assert.ok(h.commit !== undefined);

  /* §3 — variance reports a distribution, and never expresses a hard failure as a rate */
  const miss = scored(trace({ findings: [f({ objectIds: ['recon:REC-OTHER'] })] }), s);
  const v = variance(s, [hit, miss, hit]);
  assert.equal(v.runs, 3);
  assert.equal(v.findingConsistency[0]!.foundIn, 2);
  assert.equal(v.missFrequency[0]!.missedIn, 1);
  assert.equal(v.hardFailures.length, miss.hardFailures.length, 'the failing run’s hard failures are listed individually');
  assert.ok(v.hardFailures.every((x) => x.run === 2), 'and attributed to the run that produced them');
  assert.ok(v.latencyMs.min <= v.latencyMs.max && v.costUsd.min <= v.costUsd.max);
});

/* ================================================================================================
   A6 §1 — A BASELINE IS A HISTORY, SO THE HISTORY HAS TO READ
   ================================================================================================ */
test('A6 §1 — the economy projection reads a run recorded before the fields it measures existed', async () => {
  const { runEconomy } = await import('./trace.js');
  /**
   * Found collecting the first live CLOSE baseline: `waterfall` arrived in A2 and this projection in A5, so
   * every run persisted before them throws on read — and one unreadable run takes the whole reference point
   * with it. An absent measurement is nothing measured; it is never a crash and never an invented figure.
   */
  const old = { runId: 'RUN-A1-OLD', goal: {}, usage: {}, result: null } as unknown as AgentRunBody;
  const e = runEconomy(old);
  assert.equal(e.approval.waitMs, 0, 'an unmeasured wait reads as nothing waited');
  assert.equal(e.approval.checkpoints, 0);
  assert.equal(e.investigation.modelCalls + e.planning.modelCalls + e.preparation.modelCalls + e.synthesis.modelCalls, 0);
  assert.equal(e.investigation.toolCalls, 0);
});

/* ================================================================================================
   A6 §11 — AN ACTION A PROFILE NAMES MUST BE AN ACTION THAT EXISTS
   ================================================================================================ */
test('A6 §11 — every action a profile may prepare is one ActionGovernance classifies', async () => {
  const { ACTION_POLICY } = await import('./actions.js');
  const { PROPOSE_ACTION_TYPE } = await import('./agent/runtime.js');
  /**
   * The first live RECONCILIATION suite prepared a comment and the harness reported it as OUTSIDE the profile
   * that had just prepared it. The cause was two vocabularies for one act: the profiles and the runtime's
   * capability map said `ADD_RECON_COMMENT`, while `ACTION_POLICY` — and so the proposal the tool actually
   * creates — says `ADD_RECONCILIATION_COMMENT`. The gate therefore compared a name against itself and let the
   * action through, which is not a gate. A5 asserts every CHECK a profile names exists; this is the same
   * assertion for every ACTION, and it is the thing that stops the next one.
   */
  const bad: string[] = [];
  for (const p of Object.values(POLICY_PROFILES)) for (const a of p.preparableActions) if (!(a in ACTION_POLICY)) bad.push(`${p.id}.preparableActions: ${a}`);
  for (const [tool, type] of Object.entries(PROPOSE_ACTION_TYPE)) if (!(type in ACTION_POLICY)) bad.push(`${tool} → ${type}`);
  assert.deepEqual(bad, [], 'every declared action type is one ActionGovernance classifies');
});

/* ================================================================================================
   A6 §13 — THE GOVERNED ANCHOR DECIDES THE KIND OF WORK WHEN THE WORDS DO NOT
   ================================================================================================ */
test('A6 §13 — an objective anchored on a reconciliation reaches the Reconciliation profile', async () => {
  const { anchorWorkClass } = await import('./agent/model.js');
  const goal = (type: string, id: string) => ({ refs: [{ type, id }] } as unknown as Parameters<typeof anchorWorkClass>[0]);
  /**
   * "Investigate this variance." from the Reconciliations page names no domain, so classification returned no
   * work class and the run took the generic investigation profile — measured live, and the object it was
   * anchored on was a reconciliation the whole time.
   */
  assert.equal(anchorWorkClass(goal('reconciliation', 'REC-MDH-13100')), 'RECONCILIATION_REVIEW');
  const anchor = anchorWorkClass(goal('reconciliation', 'REC-MDH-13100'));
  assert.equal(profileForOutcome('ANALYZE', me, undefined, null, anchor).profile, 'RECONCILIATION', 'with no class from the model, the anchor selects');
  /**
   * AND A CLASS NOTHING DECLARES SELECTS NOTHING, which is what the first fix missed. The model read
   * "Investigate this variance." as VARIANCE_EXPLANATION — a real class in the vocabulary that no profile serves
   * — so filling only a NULL left the run on the generic profile a second time, measured live.
   */
  assert.equal(profileForOutcome('ANALYZE', me, undefined, 'VARIANCE_EXPLANATION', anchor).profile, 'RECONCILIATION', 'a class that selects nothing yields to the anchor');
  /* but a class that DOES select is never overruled by the anchor */
  assert.equal(profileForOutcome('ANALYZE', me, undefined, 'CLOSE_READINESS', anchor).profile, 'CLOSE', 'the model wins wherever its answer means something');
  /* a type that does not determine the work says nothing, and the classifier's own answer stands */
  for (const t of ['vendor', 'project', 'account', 'entity', 'report']) assert.equal(anchorWorkClass(goal(t, 'X')), null, `${t} does not name a kind of work`);
  assert.equal(profileForOutcome('ANALYZE', me, undefined, null).profile, 'INVESTIGATION', 'with no class, nothing changes');
});

test('A6 §12 — a finding carries the governed handles it rests on, not a run-local object id', async () => {
  /**
   * Measured live: a run that stated the $6.18M difference, its three counterparty legs and its missing support
   * was scored as having MISSED the break, because its findings carried only `RUN-…-x21-1` — unique to that run
   * and resolvable to nothing. A finding nobody can resolve to a governed object is not drillable.
   */
  const a = new MockLLMAdapter(); Object.defineProperty(a, 'provider', { value: 'scripted' });
  const A = a as unknown as Record<string, unknown>;
  A['classifyObjective'] = async () => ok({ outcome: 'ANALYZE', workClass: 'RECONCILIATION_REVIEW', understanding: 'scripted', needsDeepReasoning: false, confidence: 0.9 }, 'NARRATE');
  let n = 0;
  A['agentStep'] = async (_i: unknown, o: { route: string }) => { n += 1; return ok(n === 1
    ? step({ calls: [read('getReconciliation', { reconciliationId: 'REC-MDH-13100', period: '2026-06' })] })
    : step({ decision: 'SYNTHESIZE' }), o.route); };
  A['agentSynth'] = async (_i: unknown, o: { route: string }) => ok({ headline: 'It does not tie.', inspected: [],
    findings: [{ statement: 'The reconciliation does not tie by $6.18M.', kind: 'OBSERVED_FACT', support: 'SUPPORTED', observationRefs: ['O1'] }],
    unresolved: [], nextSteps: [], confidence: 0.8, escalate: { needed: false, reason: null, detail: null } }, o.route);
  const orch = new SloaneOrchestrator(a, { maxPlanSteps: 8 }, () => me);

  const r = orch.agents.start(me, 'Investigate the MDH intercompany reconciliation for June.', { sessionId: 'a6-handles' });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  /* an ambiguous subject is asked about before it is classified — A4's clarification, working */
  let b = await until(orch, r.run.runId, me);
  const q = orch.agents.openQuestion(b);
  if (q?.options?.length) { await orch.agents.decide(r.run.runId, me, q.id, q.options[0]!.id); b = await until(orch, r.run.runId, me); }
  const t = orch.agentService.trace(r.run.runId, me)!;
  const f = t.findings[0];
  assert.ok(f, 'the run produced a finding');
  assert.ok(f!.objectIds.includes('REC-MDH-13100'), `the reconciliation it is about is a handle on it — got ${JSON.stringify(f!.objectIds)}`);
  assert.ok(f!.objectIds.some((x) => /^RUN-/.test(x)), 'and the run-local object id is still carried, so nothing downstream lost a reference');
});

test('A6 §1 — a baseline entry records the profile VERSION, so two baselines can be compared', async () => {
  const { historyEntry } = await import('./eval/agent/harness.js');
  const { loadSloaneConfig } = await import('./config.js');
  /* the trace carries the profile ID; matching only on its LABEL recorded 'none' on every entry ever written */
  for (const named of ['RECONCILIATION', 'Reconciliation']) {
    const r = { ...scored(trace({ findings: [f({})] }), sc()), profile: named };
    const h = historyEntry(r, sc(), loadSloaneConfig(), 'LIVE', 'RECONCILIATION', 'RECON_BASELINE_V1');
    assert.notEqual(h.profileVersion, 'none', `${named} resolves to a profile`);
    assert.match(h.profileVersion, /^RECONCILIATION\/\d+$/, 'and the version is the shape of its contract');
  }
});

test('A6 §13 — the anchored object is named to the model, so nothing has to be restated', async () => {
  /**
   * Measured live on close-recon-break: launched with REC-MDH-13100 selected, the model answered "no entity,
   * account, or reconciliation identifier was specified" and asked the user — twice in three runs. The runs that
   * worked had SEARCHED for the object they were already holding, which is luck, not design.
   */
  const a = new MockLLMAdapter(); Object.defineProperty(a, 'provider', { value: 'scripted' });
  const A = a as unknown as Record<string, unknown>;
  A['classifyObjective'] = async () => ok({ outcome: 'ANALYZE', workClass: 'RECONCILIATION_REVIEW', understanding: 'scripted', needsDeepReasoning: false, confidence: 0.9 }, 'NARRATE');
  let seen: string | null = null;
  A['agentStep'] = async (i: unknown, o: { route: string }) => { seen ??= JSON.stringify(i); return ok(step({ decision: 'SYNTHESIZE' }), o.route); };
  A['agentSynth'] = async (_i: unknown, o: { route: string }) => ok({ headline: 'x', inspected: [], findings: [], unresolved: [], nextSteps: [], confidence: 0.5, escalate: { needed: false, reason: null, detail: null } }, o.route);
  const orch = new SloaneOrchestrator(a, { maxPlanSteps: 8 }, () => me);

  const r = orch.agentLaunch.launch(me, {
    action: 'INVESTIGATE', sessionId: 'a6-frame',
    objective: 'Investigate this reconciliation and tell me what is unresolved.',
    context: { module: 'reconciliations', objectRefs: [{ type: 'reconciliation', id: 'REC-MDH-13100', label: 'Intercompany receivable' }], period: '2026-06', scope: 'MDH' },
  });
  assert.ok(r.ok, r.ok ? 'launched' : String(r.reason));
  await until(orch, r.runId ?? '', me);
  assert.ok(seen, 'the model was asked something');
  assert.match(String(seen), /REC-MDH-13100/, 'and what it was asked names the object the run is anchored on');
});

test('A6 §15 — an absence needs the object AND the claim, so a correct statement is not a fabrication', async () => {
  const file = join(process.cwd(), 'src', 'sloane', 'eval', 'agent', 'scenarios', 'reconciliation.json');
  const suite = JSON.parse(readFileSync(file, 'utf8')) as ScenarioSuite;
  const s = suite.scenarios.find((x) => x.id === 'recon-no-issue')!;
  /* the correct answer names the same reconciliation, and must not be read as having invented a break */
  const good = coverageOf(trace({ findings: [f({ statement: 'REC-MDH-20100 ties for Jun 2026: the GL balance equals the comparison.', objectIds: ['recon:REC-MDH-20100'] })] }), s)!;
  assert.deepEqual(good.falsePositives, [], 'reporting that it ties is not a fabricated break');
  /* and a run that asserts a break on it still fails */
  const bad = coverageOf(trace({ findings: [f({ statement: 'REC-MDH-20100 does not tie: it is out by $2.10M.', objectIds: ['recon:REC-MDH-20100'] })] }), s)!;
  assert.ok(bad.falsePositives.length >= 1, 'an invented break is still caught');
  /* and the phrasing the earlier live run used is caught by its own absence, not by naming the object */
  const out = coverageOf(trace({ findings: [f({ statement: 'Trade payables is out by 6.18M', objectIds: ['recon:REC-MDH-20100'] })] }), s)!;
  assert.ok(out.falsePositives.length >= 1, '"out by" on a tied reconciliation is still a fabrication');
});
