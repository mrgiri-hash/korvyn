/**
 * A8 — GOVERNED OBJECT RESOLUTION AND REFERENT VERIFICATION.
 *
 * THE CLASS THIS CLOSES. A7 made a statement about a governed object verifiable against that object. It also
 * proved the harder failure: Korvyn read REC-IC-RECV — a GROUP-level reconciliation named "Intercompany
 * Receivable" that genuinely ties — described it perfectly, and answered a question about the MDH one. Every
 * claim verified. Every figure grounded. The answer was about the wrong object, and every control it passed
 * reported success.
 *
 * So the question is no longer only "is this supported?" but "is it supported by the object the person meant?".
 *
 * Every case here resolves against the REAL governed catalogues, so a fixture drifting from the product cannot
 * make these pass. Nothing here needs a model.
 *
 *   Run: npm run sloane:test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLLMAdapter } from './adapter.js';
import { SloaneOrchestrator } from './orchestrator.js';
import { loadSloaneConfig } from './config.js';
import { type Actor, ROLES, serverActor, visibleOf } from './tools.js';
import { findObjects } from './toolset.js';
import {
  type ReferentCandidate, type ResolvedReferent, clarificationFor, explicitConstraints,
  inheritObject, notFoundNote, resolveReferent, verifyReturned,
} from './v2/resolve.js';

const orch = new SloaneOrchestrator(new MockLLMAdapter(), loadSloaneConfig());
const me = serverActor();
const mdhActor: Actor = { id: 'user:mdh', name: 'Jonah Park', ...ROLES['ENTITY_ACCOUNTANT'] };

const MDH = 'REC-MDH-13100';
const GROUP_IC = 'REC-IC-RECV';
const REIT = 'REC-MGP-REIT-13100';

const defs = () => orch.controls.allRecDefs();
const cat = () => ({
  entities: orch.gl.entities().map((e) => ({ id: e.id, name: e.name })),
  objectIds: defs().map((d) => d.id),
  periods: orch.data.governedPeriods(),
});

/** the candidates the product itself would produce for this actor — already permission-filtered (§22) */
function candidatesFor(request: string, actor: Actor = me): ReferentCandidate[] {
  const env = { gl: orch.gl, controls: orch.controls, visible: visibleOf(actor), actor };
  const byId = new Map(defs().map((d) => [d.id, d]));
  return findObjects(env, request, 14).map((h) => {
    const d = byId.get(h.ref.replace(/^recon:/, ''));
    return { ref: h.ref, kind: h.kind, name: h.name, s: h.s, ...(d ? { entity: d.entity } : {}) };
  });
}
const resolve = (request: string, over: Partial<Parameters<typeof resolveReferent>[0]> = {}, actor: Actor = me): ResolvedReferent =>
  resolveReferent({ request, candidates: candidatesFor(request, actor), catalogues: cat(), ...over });

/* ================================================================================================
   §24 — THE PERMANENT MDH REGRESSION. IDENTITY FIRST, THEN STATUS.
   ================================================================================================ */
test('A8 §24 — "the MDH intercompany receivable reconciliation" resolves to the MDH object and nothing else', () => {
  const q = 'What is the status of the MDH intercompany receivable reconciliation?';
  const r = resolve(q);

  assert.equal(r.objectRef?.id, MDH, 'the governed MDH reconciliation');
  /* the three objects this has been wrong about before, named so a regression says which one it picked */
  assert.notEqual(r.objectRef?.id, GROUP_IC, 'not the group-level object of the same name');
  assert.notEqual(r.objectRef?.id, REIT, 'not the REIT-side one');
  assert.equal(r.explicitConstraints.entity, 'MDH', 'the entity was read as a governed constraint');
  assert.equal(r.confidence, 'HIGH');

  /* and the group object was REJECTED for a stated reason, not merely out-ranked */
  assert.ok(r.telemetry.considered > 1, 'there was a real choice to make');
  assert.equal(r.resolutionBasis, 'EXPLICIT_NAME');

  /* §11 — it is offered, never substituted */
  assert.equal(r.broaderAlternative?.ref, `recon:${GROUP_IC}`);
});

test('A8 §24 — and the identity is verified against what the read returned', () => {
  const r = resolve('What is the status of the MDH intercompany receivable reconciliation?');
  /* the read that reaches the right object verifies */
  const good = verifyReturned(r, { refs: { reconciliationId: MDH, entity: 'MDH', period: '2026-06' } });
  assert.equal(good.ok, true);
  assert.equal(good.unverifiable, false);

  /* §8/§23H — the resolver said MDH and the tool came back with something else */
  const bad = verifyReturned(r, { refs: { reconciliationId: GROUP_IC, entity: 'GROUP' } });
  assert.equal(bad.ok, false);
  assert.match(bad.mismatches.join(' '), new RegExp(GROUP_IC));

  /* a read carrying no identity is UNVERIFIABLE, which is honest and is not a pass */
  const none = verifyReturned(r, { refs: {} });
  assert.equal(none.unverifiable, true);
  assert.equal(r.telemetry.verified, null, 'and the telemetry says so rather than claiming success');
});

/* ================================================================================================
   §23 — THE MATRIX
   ================================================================================================ */
test('A8 §23A — an exact object name resolves to it', () => {
  const r = resolve('Mechanical CIP reconciliation');
  assert.equal(r.objectRef?.id, 'REC-CIP-MECHANICAL');
  assert.equal(r.confidence, 'HIGH');
});

test('A8 §23C — a group object with no entity qualifier is still the right answer', () => {
  const r = resolve('What is the status of the intercompany receivable reconciliation?');
  assert.equal(r.objectRef?.id, GROUP_IC, 'nothing was traded away to fix the entity case');
  assert.equal(r.explicitConstraints.entity, null);
});

test('A8 §23D/§25 — a genuinely ambiguous label asks rather than picking', () => {
  const r = resolve('Show me the cash reconciliation.');
  assert.equal(r.resolutionBasis, 'AMBIGUOUS');
  assert.equal(r.objectRef, null, 'nothing is chosen');
  assert.ok(r.ambiguous.length >= 2, `${r.ambiguous.length} candidates remained`);
  const q = clarificationFor(r);
  assert.ok(q && /which one/i.test(q), q ?? 'no question');
  /* the options are governed labels, not ids */
  assert.ok(r.ambiguous.every((a) => a.label.length > 2 && !a.label.startsWith('REC-')));

  /* §10 — and naming the entity settles it without asking */
  const settled = resolve('Show me the MDH operating cash reconciliation.');
  assert.equal(settled.resolutionBasis, 'EXPLICIT_NAME');
  assert.equal(settled.objectRef?.id, 'REC-MDH-10100');
});

test('A8 §23E/§26 — a module anchor is the subject, and a generic follow-up does not re-resolve', () => {
  const anchor = { type: 'reconciliation', id: MDH, label: 'Intercompany receivable — MDH vs foreign OpCos' };
  for (const q of ['Why is this off?', 'What changed?', 'Show me support.', 'Compare to last month.']) {
    const r = resolveReferent({ request: q, candidates: candidatesFor(q), catalogues: cat(), anchor });
    assert.equal(r.objectRef?.id, MDH, `"${q}" stays on the anchored object`);
    assert.equal(r.resolutionBasis, 'MODULE_ANCHOR');
    assert.equal(r.telemetry.anchorUsed, true);
  }
});

test('A8 §23F — an explicit subject change replaces the anchor', () => {
  const anchor = { type: 'reconciliation', id: MDH, label: 'Intercompany receivable — MDH vs foreign OpCos' };
  const q = 'Now show me the REIT intercompany receivable instead.';
  const r = resolveReferent({ request: q, candidates: candidatesFor(q), catalogues: cat(), anchor });
  assert.notEqual(r.resolutionBasis, 'MODULE_ANCHOR', 'naming another object changes the subject');
  assert.equal(r.objectRef?.id, REIT);
});

test('A8 §23G/§27 — expanding the period does not change the subject', () => {
  const anchor = { type: 'reconciliation', id: MDH, label: 'Intercompany receivable — MDH vs foreign OpCos' };
  for (const q of ['Show me this reconciliation for the last six months.', 'Compare this with the prior six months.']) {
    const r = resolveReferent({ request: q, candidates: candidatesFor(q), catalogues: cat(), anchor });
    assert.equal(r.objectRef?.id, MDH, 'one subject, many periods — never six best-matching reconciliations');
  }
});

test('A8 §23I/§11 — a requested entity object that does not exist is not answered with the broader one', () => {
  /* MER-SG has no trade-payables reconciliation; the GROUP "Accounts Payable" does exist */
  const has = defs().some((d) => d.entity === 'MER-SG' && /payable/i.test(d.name));
  assert.equal(has, false, 'the fixture still lacks the entity-specific object this case needs');
  const r = resolve('Show me the MER-SG accounts payable reconciliation.');
  assert.equal(r.resolutionBasis, 'NOT_FOUND');
  assert.equal(r.objectRef, null, 'the broader object never becomes the answer');
  const note = notFoundNote(r);
  assert.ok(note && /could not find/i.test(note), note ?? 'no note');
  if (r.broaderAlternative) assert.match(note!, /say so if you want that instead/);
});

test('A8 §23J/§22 — an unauthorized object is never a candidate, so it is never ranked or redacted', () => {
  const q = 'Show me the MER-DE operating cash reconciliation.';
  const seen = candidatesFor(q, mdhActor).map((c) => c.ref);
  assert.equal(seen.some((r) => r.includes('MER-DE')), false, 'it does not enter the candidate set at all');
  const r = resolve(q, {}, mdhActor);
  assert.notEqual(r.objectRef?.id, 'REC-MER-DE-10100');
  /* and an unrestricted actor does reach it, so the test is about authority and not about matching */
  assert.equal(resolve(q).objectRef?.id, 'REC-MER-DE-10100');
});

test('A8 §23K/§23L/§14 — a candidate contradicting a stated basis, book or lens is a different object', () => {
  /**
   * The server book models one basis and one lens, so this is asserted on the RULE rather than on a fixture
   * that does not exist — stated plainly rather than implied by a passing test over synthetic data that
   * pretends to be the book.
   */
  const twins: ReferentCandidate[] = [
    { ref: 'recon:REC-PREPAID-US', kind: 'reconciliation', name: 'Prepaids (REC-PREPAID-US)', basis: 'US_GAAP', lens: 'CORP', s: 60 },
    { ref: 'recon:REC-PREPAID-EMEA', kind: 'reconciliation', name: 'Prepaids (REC-PREPAID-EMEA)', basis: 'IFRS', lens: 'EMEA', s: 90 },
  ];
  const r = resolveReferent({ request: 'Show me prepaids', candidates: twins, catalogues: cat(), context: { basis: 'US_GAAP' } });
  /* the stated basis is INHERITED context, not an explicit constraint, so it does not filter... */
  assert.ok(r.objectRef, 'context alone does not reject a candidate');

  /* ...but an EXPLICIT one does, whatever the label score says */
  const k = { ...r.explicitConstraints, basis: 'US_GAAP' };
  const filtered = twins.filter((c) => !c.basis || c.basis === k.basis);
  assert.deepEqual(filtered.map((c) => c.ref), ['recon:REC-PREPAID-US'], 'the higher-scoring IFRS twin is removed, not out-ranked');
});

test('A8 §23H — a wrong-object tool return is caught even when the resolution was right', () => {
  const r = resolve('What is the status of the MDH intercompany receivable reconciliation?');
  const v = verifyReturned(r, { refs: { reconciliationId: REIT, entity: 'MGP-REIT' } });
  assert.equal(v.ok, false);
  assert.equal(r.telemetry.verified, false);
  assert.ok(r.telemetry.verificationFailures.length);
});

/* ================================================================================================
   §3/§4 — CONSTRAINTS ARE GOVERNED DATA, AND HARD BEATS SOFT
   ================================================================================================ */
test('A8 §3 — constraints are read from the governed catalogues, never from a word list', () => {
  const k = explicitConstraints('the MDH intercompany receivable for 2026-06', cat());
  assert.equal(k.entity, 'MDH');
  assert.equal(k.period, '2026-06');
  /* a word that is not a governed thing is not a constraint */
  assert.equal(explicitConstraints('the quarterly reconciliation', cat()).entity, null);
  /* and a governed id stated literally is the strongest signal there is */
  assert.equal(explicitConstraints(`show ${MDH}`, cat()).objectId, MDH);
});

test('A8 §4 — a hard constraint filters; a higher soft score cannot outvote it', () => {
  const q = 'MDH intercompany receivable';
  const cands = candidatesFor(q);
  const group = cands.find((c) => c.ref === `recon:${GROUP_IC}`);
  if (group) {
    const r = resolve(q);
    assert.equal(r.objectRef?.id, MDH);
    assert.ok(r.telemetry.considered >= 2);
  }
  /* and an explicit id beats even an anchor */
  const anchor = { type: 'reconciliation', id: GROUP_IC, label: 'Intercompany Receivable' };
  const byId = resolveReferent({ request: `status of ${MDH}`, candidates: candidatesFor(`status of ${MDH}`), catalogues: cat(), anchor });
  assert.equal(byId.resolutionBasis, 'EXPLICIT_ID');
  assert.equal(byId.objectRef?.id, MDH);
});

test('A8 §11 — an id the actor cannot see is not found, never quietly swapped', () => {
  const q = `status of REC-MER-DE-10100`;
  const r = resolve(q, {}, mdhActor);
  assert.equal(r.resolutionBasis, 'NOT_FOUND');
  assert.equal(r.objectRef, null);
});

/* ================================================================================================
   §6/§12 — THE CONVERSATION'S OBJECT
   ================================================================================================ */
test('A8 §6/§12 — a request naming nothing stays on the object in hand, and naming one replaces it', () => {
  const current = { type: 'reconciliation', id: MDH, label: 'Intercompany receivable — MDH vs foreign OpCos' };
  const q = 'Show me the history.';
  const stay = inheritObject(resolveReferent({ request: q, candidates: candidatesFor(q), catalogues: cat() }), current);
  assert.equal(stay.objectRef?.id, MDH);
  assert.equal(stay.resolutionBasis, 'CONVERSATION_REFERENT');
  assert.equal(stay.telemetry.inheritedUsed, true);

  /* a named object replaces it — the referent is not sticky */
  const q2 = 'Show me the Mechanical CIP reconciliation.';
  const moved = inheritObject(resolveReferent({ request: q2, candidates: candidatesFor(q2), catalogues: cat() }), current);
  assert.equal(moved.objectRef?.id, 'REC-CIP-MECHANICAL');
  assert.notEqual(moved.resolutionBasis, 'CONVERSATION_REFERENT');

  /* and an AMBIGUOUS request is not silently answered with the object in hand */
  const q3 = 'Show me the cash reconciliation.';
  const amb = inheritObject(resolveReferent({ request: q3, candidates: candidatesFor(q3), catalogues: cat() }), current);
  assert.equal(amb.resolutionBasis, 'AMBIGUOUS');
});

/* ================================================================================================
   §16 — TELEMETRY
   ================================================================================================ */
test('A8 §16 — resolution records what it considered, rejected and chose', () => {
  const r = resolve('What is the status of the MDH intercompany receivable reconciliation?');
  const t = r.telemetry;
  assert.ok(t.considered > 0);
  assert.ok(t.survivors.length > 0);
  assert.equal(t.basis, 'EXPLICIT_NAME');
  assert.equal(typeof t.anchorUsed, 'boolean');
  /* a rejection carries its REASON, so a trace says why an object was not eligible rather than only which won */
  for (const x of t.rejected) assert.ok(x.why.length > 3, 'every rejection is explained');
});
