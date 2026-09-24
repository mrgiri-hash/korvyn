/**
 * A5 §5/§7/§8 — DID THE RUN FIND WHAT IS KNOWN TO BE THERE, AND DID IT CLAIM ANYTHING THAT IS NOT?
 *
 * TWO CORRECT RUNS WILL WORD THE SAME FINDING DIFFERENTLY, so wording is not what is matched. A finding is
 * matched on the GOVERNED HANDLES it carries — the fact ids behind it, the objects it is about, the account or
 * entity or reconciliation it names, the amount it states. Those are the same handles the product uses to make
 * the finding drillable, so matching on them is matching on what the run actually established.
 *
 * THE AMOUNT IS THE STRONGEST SIGNAL AND IS NOT ENOUGH ON ITS OWN. "$6.18M" appearing in a sentence is a good
 * sign that the run reached the intercompany break, and it is not proof: a scenario therefore states the
 * governed refs as well, and a match needs the subject AND (where the scenario gives one) the amount.
 *
 * NO MODEL GRADES THIS. §5 admits a semantic evaluator only where comparison genuinely needs one, and none of
 * this does. A model asked whether a run found what it was supposed to find is the self-judgment §5 warns
 * against, and there is no path to one in this file.
 */
import type { KorvynTrace } from '../../trace.js';
import type { AgentEvalScenario, CoverageResult, ExpectedFinding } from './model.js';

type TraceFinding = KorvynTrace['findings'][number];

/** the governed handles a finding carries, flattened once so matching reads them uniformly */
function handlesOf(f: TraceFinding): { ids: Set<string>; text: string } {
  const ids = new Set<string>();
  for (const x of f.factIds) ids.add(x);
  for (const o of f.objectIds) {
    ids.add(o);
    /* an object id is often `kind:id` or `kind:id:period` — the parts are handles too */
    for (const part of o.split(':')) if (part) ids.add(part);
  }
  return { ids, text: f.statement };
}

/** §5 — an amount matches when it is within tolerance, in either USD or millions, however the run stated it */
function statesAmount(f: TraceFinding, usd: number, tolerance: number): boolean {
  if (f.amountUsd != null && Math.abs(Math.abs(f.amountUsd) - Math.abs(usd)) <= tolerance) return true;
  const m = Math.abs(usd) / 1e6;
  const lo = (Math.abs(usd) - tolerance) / 1e6, hi = (Math.abs(usd) + tolerance) / 1e6;
  for (const raw of f.statement.match(/\$?\s?([\d,]+(?:\.\d+)?)\s?([MKB])?/g) ?? []) {
    const num = Number(raw.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(num)) continue;
    const scale = /M/i.test(raw) ? 1 : /K/i.test(raw) ? 1e-3 : /B/i.test(raw) ? 1e3 : null;
    if (scale === null) { if (Math.abs(num - Math.abs(usd)) <= tolerance) return true; continue; }
    const asM = num * scale;
    if (asM >= lo && asM <= hi) return true;
    void m;
  }
  return false;
}

/** a word appears as a WORD, so "AP" does not match "happens" and an account code does not match a longer number */
const mentions = (text: string, word: string) => new RegExp(`(^|[^A-Za-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`, 'i').test(text);

export interface Matched { finding: TraceFinding; matchedBy: string }

/**
 * Does this finding establish the expected one? Returns WHY it matched, because a coverage report that says
 * "found" without saying how is a report nobody can check.
 */
export function matches(f: TraceFinding, e: ExpectedFinding): string | null {
  const { ids, text } = handlesOf(f);
  const refs = e.refs ?? {};
  const hit: string[] = [];
  for (const [kind, list] of Object.entries(refs)) {
    for (const id of list ?? []) {
      if (ids.has(id)) { hit.push(`${kind}:${id} (governed ref)`); continue; }
      if (mentions(text, id)) hit.push(`${kind}:${id} (named)`);
    }
  }
  const subject = hit.length > 0;
  const wantsAmount = e.amountUsd != null;
  const amountOk = wantsAmount ? statesAmount(f, e.amountUsd!, e.amountTolerance ?? Math.abs(e.amountUsd!) * 0.02) : true;

  /* the last resort, used only where a scenario says why no governed handle exists */
  if (!subject && e.mustMention?.length) {
    const all = e.mustMention.every((w) => mentions(text, w) || text.toLowerCase().includes(w.toLowerCase()));
    if (all && amountOk) return `mentions ${e.mustMention.join(' + ')}`;
    return null;
  }
  if (!subject) return null;
  if (!amountOk) return null;
  return hit.slice(0, 2).join(' + ') + (wantsAmount ? ` + states ${(e.amountUsd! / 1e6).toFixed(2)}M` : '');
}

/**
 * §8 — WHAT THE RUN RAISED THAT THE FIXTURE DOES NOT SUPPORT. Two kinds, and they are different failures:
 *
 *   a DECLARED ABSENCE the run claimed anyway — the fixture is known not to contain it, so this is a false issue
 *   a FACTUAL claim with no fact behind it — the run stated something it did not read
 *
 * An INFERENCE, a DRAFT_EXPLANATION and an UNRESOLVED_QUESTION are none of these: they are the run reasoning,
 * offering words for review, or saying what it could not settle. Counting them as false positives would punish
 * a run for keeping the three apart, which is the distinction the product spent A3 and A4 establishing.
 */
function falsePositives(findings: TraceFinding[], sc: AgentEvalScenario): CoverageResult['falsePositives'] {
  const out: CoverageResult['falsePositives'] = [];
  for (const a of sc.expectedAbsences ?? []) {
    for (const f of findings) {
      if (f.kind !== 'OBSERVED_FACT' && f.kind !== 'EVIDENCE') continue;
      /**
       * A6 — AN ABSENCE IS A CLAIM ABOUT WHAT IS SAID, NOT MERELY ABOUT WHICH OBJECT IS NAMED. Where an absence
       * gives BOTH a governed ref and the words, both must hold: "a difference on a reconciliation that ties" is
       * about a finding that ASSERTS a difference, and a run that correctly reports "REC-MDH-20100 ties" names
       * the same object. Measured live the moment findings started carrying governed handles — four correct
       * statements were reported as fabricated breaks, which is the false-failure class that teaches a reader to
       * discount the real ones. Either alone still fires when an absence gives only one.
       */
      const hitRef = a.refs ? !!matches(f, { id: a.id, label: a.label, severity: 'MATERIAL', refs: a.refs }) : null;
      const hitWord = a.mustNotMention?.length ? a.mustNotMention.every((w) => mentions(f.statement, w)) : null;
      const hit = hitRef !== null && hitWord !== null ? hitRef && hitWord : (hitRef ?? hitWord ?? false);
      if (hit) out.push({ statement: f.statement, kind: f.kind, why: `${a.label}${a.why ? ` — ${a.why}` : ''}` });
    }
  }
  for (const f of findings) {
    if (f.kind !== 'OBSERVED_FACT' && f.kind !== 'EVIDENCE') continue;
    if (f.factIds.length) continue;
    /* a factual statement with no fact behind it, that also states a figure, is a claim the run did not read */
    if (/\$\s?[\d,]|\b\d+(?:\.\d+)?\s?[MKB]\b|\b\d+%/.test(f.statement)) out.push({ statement: f.statement, kind: f.kind, why: 'states a figure and carries no FinancialFact' });
  }
  return out;
}

export function coverageOf(trace: KorvynTrace, sc: AgentEvalScenario): CoverageResult | null {
  const known = sc.expectedFindings ?? [];
  if (!known.length && !(sc.expectedAbsences ?? []).length) return null;
  const found: CoverageResult['found'] = [];
  const missed: CoverageResult['missed'] = [];
  for (const e of known) {
    let hit: { by: string; statement: string } | null = null;
    for (const f of trace.findings) {
      const why = matches(f, e);
      if (why) { hit = { by: why, statement: f.statement }; break; }
    }
    if (hit) found.push({ id: e.id, matchedBy: hit.by, statement: hit.statement });
    else missed.push({ id: e.id, label: e.label, severity: e.severity });
  }
  return {
    known: known.map((e) => ({ id: e.id, label: e.label, severity: e.severity })),
    found, missed,
    falsePositives: falsePositives(trace.findings, sc),
    criticalMissed: missed.filter((m) => m.severity === 'CRITICAL').length,
    materialMissed: missed.filter((m) => m.severity === 'MATERIAL').length,
  };
}
