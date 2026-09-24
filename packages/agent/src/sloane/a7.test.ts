/**
 * A7 — GOVERNED CLAIM GROUNDING AND OBJECT CONSISTENCY.
 *
 * THE DEFECT THIS FILE EXISTS TO PREVENT, in its own words. Asked for the status of the MDH intercompany
 * receivable, Sloane answered:
 *
 *     "ties out and its supporting documentation is complete. However, it has been returned by the reviewer."
 *
 * The reconciliation does not tie, its support is missing, and only the review status was right. Two of the
 * three properties belong to a DIFFERENT reconciliation that genuinely ties with complete support. No figure
 * appears anywhere in the sentence, so Phase 2's figure grounding had nothing to check.
 *
 * Every test here builds its claims from the REAL governed records through the real tools, so a fixture drifting
 * from the product cannot make these pass. Nothing here needs a model.
 *
 *   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { loadSloaneConfig } from './config.js';
import { type Actor, ROLES, serverActor, toolRegistry, visibleOf } from './tools.js';
import { FactRegistry } from './v2/facts.js';
import { CLAIM_TYPES, type GovernedClaim, claimsFrom, claimsIn, verifySentence } from './v2/claims.js';
import { fromProse } from './v2/respond.js';
import { CHECKS } from './eval/agent/checks.js';
import { POLICY_PROFILES, type ProfileId } from './agent/model.js';
import { newInvestigation } from './agent/investigate.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const orch = new SloaneOrchestrator(new MockLLMAdapter(), loadSloaneConfig());
const me = serverActor();
const mdhActor: Actor = { id: 'user:mdh', name: 'Jonah Park', ...ROLES['ENTITY_ACCOUNTANT'] };
const PERIOD = '2026-06';

/** run a registered governed read exactly as the runtime does, and promote what it returned */
function read(tool: string, args: Record<string, string>, actor: Actor = me) {
  const reg = toolRegistry.get(tool);
  assert.ok(reg, `${tool} is registered`);
  const env = { data: orch.data, gl: orch.gl, controls: orch.controls, actor, visible: visibleOf(actor), objectId: `O-${tool}` };
  return reg!.run(args as never, env as never) as { object: import('./tools.js').FinancialObject };
}
const claimsOf = (tool: string, args: Record<string, string>, actor: Actor = me) => claimsFrom(read(tool, args, actor).object);

/* the two reconciliations the A6 defect blended: one that does not tie, one that does */
const MDH = 'REC-MDH-13100';
const REIT = 'REC-MGP-REIT-13100';

/* ================================================================================================
   §1/§20 — THE A6 DEFECT, AS A PERMANENT REGRESSION TEST
   ================================================================================================ */
test('A7 §1 — the governed record says what A6 got wrong, and the claim layer reads it', () => {
  const r = orch.controls.reconcile(orch.controls.recDef(MDH)!, PERIOD);
  assert.equal(r.tieStatus, 'NOT_TIED', 'the fixture still holds the defect this phase is about');
  assert.equal(r.supportComplete, false);
  assert.equal(String(r.workflow.status), 'RETURNED');

  const claims = claimsOf('getReconciliationStatus', { reconciliationId: MDH, period: PERIOD });
  const by = (t: string) => claims.find((c) => c.claimType === t);
  assert.equal(by('TIE_STATUS')?.value, 'NOT_TIED', 'the tie status is promoted from the read that returned it');
  assert.equal(by('TIE_STATUS')?.object.id, MDH, 'and is bound to the reconciliation it belongs to');
  assert.ok(claims.every((c) => c.period === r.period || c.period.length > 0), 'every claim carries a period');
});

test('A7 §1/§20 — the exact A6 sentence is rejected, and the correct one is not', () => {
  const claims = claimsOf('getReconciliationStatus', { reconciliationId: MDH, period: PERIOD });
  const reg = new FactRegistry();
  reg.addClaims(claims);
  const opt = { hasGovernedRead: true, objectIds: ['O-1'], claims: reg.heldClaims(), focus: null };

  const bad = fromProse('The MDH intercompany receivable reconciliation ties out and its supporting documentation is complete. However, it has been returned by the reviewer.', reg, opt);
  const said = [bad.headline, ...bad.keyDrivers, bad.summary].filter(Boolean).map((a) => a!.text).join(' ');
  assert.equal(/ties out/.test(said), false, 'the false tie claim does not reach the reader');
  assert.equal(/documentation is complete/.test(said), false, 'nor the false support claim');
  assert.ok(bad.withheldClaims.length, 'and the person is told a status statement was withheld');
  assert.ok(bad.claimFailures.some((f) => f.reason === 'VALUE_MISMATCH'), 'recorded as a contradiction of the record');

  /* the TRUE statement about the same object passes untouched */
  const good = fromProse('The MDH intercompany receivable reconciliation does not tie, its support is missing, and it has been returned by the reviewer.', reg, opt);
  const kept = [good.headline, ...good.keyDrivers].filter(Boolean).map((a) => a!.text).join(' ');
  assert.match(kept, /does not tie/);
  assert.deepEqual(good.withheldClaims, [], 'nothing is withheld from a correct answer');
  assert.equal(good.claimsVerified.length, 3, 'all three governed claims are verified');
  assert.ok(good.claimsVerified.every((c) => c.object.id === MDH), 'against the one object');
});

/* ================================================================================================
   §9 — CROSS-OBJECT MIXING
   ================================================================================================ */
test('A7 §9 — a status belonging to another reconciliation cannot support a sentence about this one', () => {
  const a = orch.controls.reconcile(orch.controls.recDef(MDH)!, PERIOD);
  const b = orch.controls.reconcile(orch.controls.recDef(REIT)!, PERIOD);
  /* the fixture must actually differ, or this test proves nothing */
  assert.notEqual(a.tieStatus, b.tieStatus, 'the two reconciliations are in different states');
  assert.equal(b.tieStatus, 'TIED');

  const reg = new FactRegistry();
  reg.addClaims(claimsOf('getReconciliationStatus', { reconciliationId: MDH, period: PERIOD }));
  reg.addClaims(claimsOf('getReconciliationStatus', { reconciliationId: REIT, period: PERIOD }));
  const opt = { hasGovernedRead: true, objectIds: ['O-1'], claims: reg.heldClaims(), focus: null };

  /* BOTH tie values are now genuinely held; the question is which object the sentence is about */
  const mixed = fromProse(`${MDH} ties and its support is complete.`, reg, opt);
  assert.equal(/ties/.test([mixed.headline, ...mixed.keyDrivers].filter(Boolean).map((x) => x!.text).join(' ')), false,
    'a real tie status from the other reconciliation does not license this sentence');
  assert.ok(mixed.claimFailures.length, 'and the failure is recorded');

  /* and the same sentence about the reconciliation it IS true of stands */
  const right = fromProse(`${REIT} ties and its support is complete.`, reg, opt);
  assert.match([right.headline, ...right.keyDrivers].filter(Boolean).map((x) => x!.text).join(' '), /ties/);
  assert.deepEqual(right.withheldClaims, []);
});

test('A7 §12 — partial support does not make a sentence valid', () => {
  const reg = new FactRegistry();
  reg.addClaims(claimsOf('getReconciliationStatus', { reconciliationId: MDH, period: PERIOD }));
  const v = verifySentence(`${MDH} does not tie, and its support is complete.`, reg.heldClaims());
  /* the tie half is right and the support half is wrong: the sentence is not half valid */
  assert.ok(v.failures.some((f) => f.reason === 'VALUE_MISMATCH' && f.type === 'SUPPORT_STATUS'));
});

/* ================================================================================================
   §5/§7 — THE VOCABULARY, AND WHAT IT DOES AND DOES NOT CLAIM
   ================================================================================================ */
test('A7 §5 — a status phrase is read as a governed claim; ordinary prose is not', () => {
  assert.deepEqual(claimsIn('The reconciliation does not tie.'), [{ type: 'TIE_STATUS', value: 'NOT_TIED' }]);
  assert.deepEqual(claimsIn('It ties.'), [{ type: 'TIE_STATUS', value: 'TIED' }]);
  assert.deepEqual(claimsIn('Support is missing.'), [{ type: 'SUPPORT_STATUS', value: 'MISSING' }]);
  assert.deepEqual(claimsIn('It has been returned by the reviewer.'), [{ type: 'REVIEW_STATUS', value: 'RETURNED' }]);
  /* the sentence that started A7 makes three claims at once */
  assert.equal(claimsIn('It ties out, support is complete, and it was returned by the reviewer.').length, 3);
  /* and a sentence about money, or about nothing governed, makes none */
  assert.deepEqual(claimsIn('The difference is $6.18M, concentrated in three counterparties.'), []);
  assert.deepEqual(claimsIn('EBITDA strips out financing and depreciation.'), []);
});

test('A7 §7 — a read that names no governed object produces no claims at all', () => {
  /* an unbound claim is the defect this layer exists to prevent, so there is no such thing */
  const o = read('getReconciliationSummary', { period: PERIOD }).object;
  assert.equal(claimsFrom(o).length, 0, 'a list of many reconciliations binds a status to none of them');
});

/* ================================================================================================
   §10/§11 — OWNER AND SOURCE AVAILABILITY
   ================================================================================================ */
test('A7 §10 — owner and reviewer are governed claims bound to the object', () => {
  const claims = claimsOf('getReconciliation', { reconciliationId: MDH, period: PERIOD });
  const r = orch.controls.reconcile(orch.controls.recDef(MDH)!, PERIOD);
  const owner = claims.find((c) => c.claimType === 'OWNER');
  const assignee = claims.find((c) => c.claimType === 'ASSIGNEE');
  /* whichever the read states, it must be the record's own value and bound to the record */
  for (const c of [owner, assignee].filter(Boolean)) assert.equal(c!.object.id, MDH);
  if (owner) assert.equal(owner.value, r.workflow.preparer);
  if (assignee) assert.equal(assignee.value, r.workflow.reviewer);
});

test('A7 §11 — a source that is not connected is a governed claim, not a description', () => {
  const bank = orch.controls.recDefs().find((d) => d.method === 'BANK' && d.entity === 'MDH');
  assert.ok(bank, 'the fixture carries a bank reconciliation');
  const r = orch.controls.reconcile(bank!, PERIOD);
  assert.equal(r.tieStatus, 'SOURCE_NOT_CONNECTED', 'and its source genuinely is not connected');
  const reg = new FactRegistry();
  reg.addClaims(claimsOf('getReconciliationStatus', { reconciliationId: bank!.id, period: PERIOD }));
  const opt = { hasGovernedRead: true, objectIds: ['O-1'], claims: reg.heldClaims(), focus: null };
  /* claiming it ties is a contradiction of a record that says the source cannot be read */
  const bad = fromProse(`${bank!.id} ties.`, reg, opt);
  assert.ok(bad.claimFailures.some((f) => f.reason === 'VALUE_MISMATCH'), 'a source-not-connected reconciliation does not tie');
});

/* ================================================================================================
   §15/§16 — VERSION AND AS-OF
   ================================================================================================ */
test('A7 §15 — a status read for another period is not the position now', () => {
  const reg = new FactRegistry();
  reg.addClaims(claimsOf('getReconciliationStatus', { reconciliationId: MDH, period: PERIOD }));
  const now = reg.heldClaims().find((c) => c.claimType === 'TIE_STATUS')!;
  /* the same object and type in a different period is a DIFFERENT claim and does not replace the current one */
  reg.addClaims([{ ...now, value: 'TIED', display: 'ties', period: 'May 2026', claimId: 'c_prior' }]);
  const held = reg.heldClaims().filter((c) => c.claimType === 'TIE_STATUS' && c.object.id === MDH);
  assert.equal(held.length, 2, 'both periods are held');
  assert.ok(held.some((c) => c.period === now.period && c.value === 'NOT_TIED'), 'and the current one still says what the record says');
});

test('A7 §15 — a later read of the same status in the same period replaces it', () => {
  const reg = new FactRegistry();
  const first = claimsOf('getReconciliationStatus', { reconciliationId: MDH, period: PERIOD });
  reg.addClaims(first);
  const tie = first.find((c) => c.claimType === 'TIE_STATUS')!;
  reg.addClaims([{ ...tie, value: 'TIED', display: 'ties', claimId: 'c_reopened' }]);
  const held = reg.heldClaims().filter((c) => c.claimType === 'TIE_STATUS' && c.object.id === tie.object.id && c.period === tie.period);
  assert.equal(held.length, 1, 'one current position per object, type and period');
  assert.equal(held[0]!.value, 'TIED', 'and it is the most recent read');
});

/* ================================================================================================
   §14/§22 — DERIVED DISCLOSURE
   ================================================================================================ */
test('A7 §14 — an out-of-scope identity is not amplified into synthesised prose', () => {
  const vis = visibleOf(mdhActor);
  assert.notEqual(vis, 'ALL', 'the restricted actor is genuinely restricted');
  /* the sentence A6 measured, quoted from a comment on the actor's OWN reconciliation */
  const said = 'The reviewer records that the due-from MER-DE does not agree to the counterparty payable.';
  const d = orch.controls.derivedDisclosure(said, vis);
  assert.equal(/MER-DE/.test(d.text), false, 'the protected identity does not survive into generated text');
  assert.deepEqual(d.suppressed, ['MER-DE']);
  assert.match(d.text, /counterparty outside your access/, 'and the reader is told something was withheld');

  /* THE SOURCE IS UNCHANGED — §14 suppresses the repeat, never the record */
  const r = orch.controls.reconcile(orch.controls.recDef(MDH)!, PERIOD);
  assert.ok(r.workflow.comments.some((c) => /MER-DE/.test(String(c.text))), 'the governed comment still says what it says');

  /* and an actor who may see the entity sees it */
  assert.equal(orch.controls.derivedDisclosure(said, visibleOf(me)).text, said);
});

test('A7 §14 — the disclosure policy is applied to a published answer', () => {
  const reg = new FactRegistry();
  const opt = {
    hasGovernedRead: true, objectIds: ['O-1'], claims: [] as GovernedClaim[], focus: null,
    disclose: (t: string) => orch.controls.derivedDisclosure(t, visibleOf(mdhActor)),
  };
  const def = fromProse('The break is against MER-DE and two other counterparties.', reg, opt);
  const text = [def.headline, ...def.keyDrivers].filter(Boolean).map((a) => a!.text).join(' ');
  assert.equal(/MER-DE/.test(text), false);
  assert.deepEqual(def.suppressedEntities, ['MER-DE']);
});

/* ================================================================================================
   §6/§23 — BOTH PATHS, AND NO EXTRA MODEL CALL
   ================================================================================================ */
test('A7 §6 — the agent path carries the same claims and the same verifier', () => {
  /* the investigation state declares the field the synthesis checks against, and starts empty */
  assert.deepEqual(newInvestigation().claims, [], 'an investigation accumulates claims as it reads');
  /* and the agent runtime verifies findings with the SAME function the conversational path uses — one verifier,
     not two implementations of one rule (§6) */
  const rt = readFileSync(join(process.cwd(), 'src', 'sloane', 'agent', 'runtime.ts'), 'utf8');
  assert.match(rt, /verifySentence\(/, 'the agent synthesis calls the shared verifier');
  assert.match(rt, /derivedDisclosure\(/, 'and the shared disclosure policy');
});

test('A7 §23 — verification is structural: no model is consulted', () => {
  /* the claim layer must never reach a provider; a status check that costs a call is one nobody will keep on */
  const src = readFileSync(join(process.cwd(), 'src', 'sloane', 'v2', 'claims.ts'), 'utf8');
  assert.equal(/adapter|anthropic|llm|agentStep|agentSynth/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'the verifier calls no model');
  assert.equal(/import .*adapter/i.test(src), false);
});

/* ================================================================================================
   §18/§19 — TRACE AND EVAL
   ================================================================================================ */
test('A7 §19 — the new checks exist, are named by the profiles, and catch what they are for', () => {
  for (const name of ['SAME_OBJECT_CLAIM_CONSISTENCY', 'NO_OUT_OF_SCOPE_DERIVED_DISCLOSURE', 'CURRENT_VERSION_STATUS', 'CORRECT_TIE_STATUS', 'CORRECT_SUPPORT_STATUS', 'CORRECT_REVIEW_STATUS']) {
    assert.ok(CHECKS[name], `${name} is implemented`);
  }
  /* and every check a profile now names still exists — the A5 rule, re-asserted over the new ones */
  for (const id of Object.keys(POLICY_PROFILES) as ProfileId[]) {
    for (const x of [...(POLICY_PROFILES[id].evaluation?.required ?? []), ...(POLICY_PROFILES[id].evaluation?.prohibited ?? [])]) {
      assert.ok(CHECKS[x.check], `${id} names ${x.check}`);
    }
  }
});

test('A7 §19 — the object-consistency check fails a trace whose finding mixes two objects', () => {
  const claims = [
    { claimType: 'TIE_STATUS', objectType: 'reconciliation', objectId: MDH, value: 'NOT_TIED', display: 'does not tie', period: 'Jun 2026', scope: 'MDH', version: null, provenance: 'x' },
    { claimType: 'TIE_STATUS', objectType: 'reconciliation', objectId: REIT, value: 'TIED', display: 'ties', period: 'Jun 2026', scope: 'MGP-REIT', version: null, provenance: 'x' },
  ];
  const sc = { id: 's', title: 't', objective: 'o', profile: 'RECONCILIATION', actor: 'user:mgiri', dataset: 'd', version: 1 };
  const check = (name: string, statement: string, held = claims) =>
    CHECKS[name]!({ trace: { findings: [{ statement, kind: 'OBSERVED_FACT', support: 'SUPPORTED', severity: null, amountUsd: null, factIds: ['f_1'], objectIds: [MDH] }], claims: held } as never,
      workproduct: null, scenario: sc as never, coverage: null, hiddenEntities: [], args: { claimType: 'TIE_STATUS' } });

  /**
   * THE SAME DEFECT HAS TWO DIAGNOSES, and both are caught. Where Korvyn holds the SUBJECT'S OWN value, saying
   * the other object's is a contradiction of the record — a VALUE mismatch. Where it holds no value of that kind
   * for the subject at all, the only thing supporting the sentence is another object — an OBJECT mismatch.
   */
  assert.equal(check('CORRECT_TIE_STATUS', `${MDH} ties.`).ok, false, 'a tie the record contradicts fails');
  assert.equal(check('CORRECT_TIE_STATUS', `${REIT} ties.`).ok, true, 'and the object it is true of passes');

  /* SUPPORT_STATUS is held for the REIT reconciliation only, so a sentence about MDH has nothing of its own */
  const withSupport = [...claims, { claimType: 'SUPPORT_STATUS', objectType: 'reconciliation', objectId: REIT, value: 'COMPLETE', display: 'complete', period: 'Jun 2026', scope: 'MGP-REIT', version: null, provenance: 'x' }];
  const mixed = check('SAME_OBJECT_CLAIM_CONSISTENCY', `${MDH} does not tie and its support is complete.`, withSupport);
  assert.equal(mixed.ok, false, 'a support status borrowed from another reconciliation fails');
  assert.match(mixed.detail, /mixed objects/);
});

test('A7 §2 — the claim types are declared, and every mapped key resolves to one of them', () => {
  assert.ok(CLAIM_TYPES.length >= 14, 'the declared claim taxonomy is complete');
  for (const t of ['TIE_STATUS', 'REVIEW_STATUS', 'SUPPORT_STATUS', 'OWNER', 'SOURCE_AVAILABILITY']) {
    assert.ok((CLAIM_TYPES as readonly string[]).includes(t));
  }
});

/* ================================================================================================
   §6 — THE V1 CONVERSATIONAL PATH, WHICH IS THE ONE THE DEFECT HAPPENED ON
   ================================================================================================ */
test('A7 §6 — ground() rejects the A6 sentence on the v1 path', async () => {
  /**
   * The A6 answer came from the v1 orchestrator (`narrate@NARRATE`), not v2 — v2 is off by default. Fixing only
   * the v2 builder would have left the defect live in the path that produced it, which is why §6 says both.
   */
  const { ground } = await import('./orchestrator.js');
  const o = read('getReconciliationStatus', { reconciliationId: MDH, period: PERIOD }).object;
  const sentence = (text: string) => [{ text, objectIds: [o.id], factKeys: [] }];

  const bad = ground(sentence('The MDH intercompany receivable reconciliation ties out and its support is complete.'), [o]);
  assert.equal(bad.accepted.length, 0, 'the sentence does not survive');
  assert.match(bad.rejected[0]!.why, /status|withheld/i);

  const good = ground(sentence('The MDH intercompany receivable reconciliation does not tie and its support is missing.'), [o]);
  assert.equal(good.accepted.length, 1, 'the true sentence does');
  assert.deepEqual(good.rejected, []);

  /* §14 on the same path: a protected identity is not amplified, and the reader is told */
  const dis = ground(sentence('The break is against MER-DE.'), [o], (t) => orch.controls.derivedDisclosure(t, visibleOf(mdhActor)));
  assert.equal(/MER-DE/.test(dis.accepted.map((a) => a.text).join(' ')), false);
  assert.deepEqual(dis.suppressed, ['MER-DE']);
});

/* ================================================================================================
   §3/§4 — OBJECT RESOLUTION: THE CLAIMS MUST BE ABOUT THE OBJECT THE PERSON NAMED
   ================================================================================================ */
test('A7 §4 — "the MDH intercompany receivable" resolves to MDH, not the group object of the same name', async () => {
  /**
   * THE ACTUAL A6 DEFECT, corrected. The answer was not a blend: every status in it was true of
   * REC-IC-RECV, a GROUP-level reconciliation named "Intercompany Receivable" that genuinely ties with
   * complete support and was returned. Its whole name is a substring of the request while the MDH one's is
   * not, so both the ranker and the deterministic override chose it — and no amount of claim verification
   * could catch that, because the read was self-consistent about the object it read.
   *
   * The entity the request names is governed data, and it decides.
   */
  const { findObjects } = await import('./toolset.js');
  const { deterministicInterpret } = await import('./orchestrator.js');
  const env = { gl: orch.gl, controls: orch.controls, visible: visibleOf(me), actor: me };
  const q = 'What is the status of the MDH intercompany receivable reconciliation?';

  assert.equal(findObjects(env, q, 4)[0]?.ref, `recon:${MDH}`, 'the ranker prefers the entity that was named');

  const recs = orch.controls.allRecDefs().map((d) => ({ id: d.id, name: d.name, entity: d.entity }));
  const ctx = orch.context.initial(me);
  assert.equal(deterministicInterpret(q, orch.data, ctx, recs).requestedObject.id, `recon:${MDH}`, 'and so does the override');

  /* WITHOUT an entity named, the group object is still the right answer — nothing was traded away */
  const group = 'What is the status of the intercompany receivable reconciliation?';
  assert.equal(findObjects(env, group, 2)[0]?.ref, 'recon:REC-IC-RECV');
  assert.equal(deterministicInterpret(group, orch.data, ctx, recs).requestedObject.id, 'recon:REC-IC-RECV');

  /* and the case the full-name rule exists for is untouched */
  assert.equal(findObjects(env, 'Mechanical CIP reconciliation', 2)[0]?.ref, 'recon:REC-CIP-MECHANICAL');
});
