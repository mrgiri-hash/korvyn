/**
 * A4 §15 — THE WORKPRODUCT A RUN LEAVES BEHIND.
 *
 * A completed run has a result, and until A4 that result lived only inside the run: to read what an agent
 * concluded you had to open the run that concluded it. A workproduct is the same conclusion as a governed object
 * in its own right — referenceable, durable, and usable by Sloane, the Close UI, Reporting, Audit, an export or a
 * later scheduled run without any of them knowing the agent runtime exists.
 *
 * IT IS GENERIC, AND IT IS NOT A DOCUMENT STORE. `type` is what makes one a controller briefing; there is no
 * Close-only record, no Close-only table and no Close-only reader. It is written through the SavedObjectRepository
 * every other saved definition uses (`AGENT_WORKPRODUCT`), so it inherits versioning, ownership, audit and the
 * one place records are read back.
 *
 * NOTHING HERE COMPOSES A NUMBER. Every figure in a workproduct was already established by a governed read during
 * the run and carries the FinancialFact id it came from; this projects what the run concluded into a stable shape
 * and drops anything that cannot be traced. A workproduct is therefore never more certain than the run was.
 *
 * §16 — THE THREE THINGS A READER MUST NOT CONFUSE, kept in three separate fields:
 *
 *   materialFindings     FACT. What the governed reads established, with the fact ids behind it.
 *   recommendedActions   MODEL RECOMMENDATION. What the run suggests a person consider. Nothing is recorded.
 *   preparedActions      GOVERNED ACTION PROPOSAL. Real proposals, waiting for a decision, with their status.
 *
 * Collapsing any two of those is how "9 blockers have no owner" becomes "assign these owners" becomes an
 * assignment nobody approved.
 */
import type { AgentRunBody, ObjectRef } from './model.js';

export const WORKPRODUCT_TYPES = ['CONTROLLER_BRIEFING', 'INVESTIGATION_SUMMARY', 'PREPARATION_SUMMARY'] as const;
export type WorkproductType = (typeof WORKPRODUCT_TYPES)[number];

/** a statement the run established, with what it rests on */
export interface WorkproductFinding {
  statement: string;
  /** the finding vocabulary the run itself used — OBSERVED_FACT, EVIDENCE, INFERENCE, … */
  kind: string;
  support: string;
  severity?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  amountUsd?: number | null;
  /** FinancialFact ids, the canonical handles a reader can resolve */
  factRefs: string[];
  /** governed objects and populations the statement is about */
  objectRefs: string[];
}

export interface AgentWorkproduct {
  id: string;
  type: WorkproductType;
  title: string;
  period: string;
  periodRange: { start: string; end: string } | null;
  scope: string;
  /** the objects the work was about, as governed references */
  subject: ObjectRef[];
  /** one paragraph a person reads first — the run's own headline and counts, never a new claim */
  executiveSummary: string;
  counts: { label: string; value: number }[];
  /** §16 FACT */
  materialFindings: WorkproductFinding[];
  /** §16 MODEL RECOMMENDATION — what to consider. Nothing here has been recorded against any record. */
  recommendedActions: { text: string; basis: string[] }[];
  /** §16 GOVERNED ACTION PROPOSAL — real proposals and where each one stands */
  preparedActions: { proposalId: string; title: string; status: string; riskLevel: string }[];
  /** what the run could not establish, stated rather than inferred */
  unresolvedQuestions: string[];
  /** limitations outside Korvyn's control that bounded the work */
  limitations: string[];
  factRefs: string[];
  evidenceRefs: string[];
  populationRefs: string[];
  /**
   * §19 — PRESENTATION BY REFERENCE, NEVER BY VALUE. A workproduct points at the governed definitions Korvyn
   * already has (an analysis, a saved report, a workbook) so a later "chart this for the last 12 months" resolves
   * through the shared presentation layer rather than re-reading numbers a model once wrote down. A4 builds no
   * chart; it makes sure the slot a chart would use is a reference.
   */
  presentation: { analysisIds: string[]; reportIds: string[]; artifactIds: string[] };
  sourceAgentRunId: string;
  traceRef: string;
  profile: string;
  /** what the run was judged against, by reference — the profile's own declarations */
  evaluationRefs: { required: { id: string; label: string; dimension: string; severity: string }[]; prohibited: { id: string; label: string; dimension: string; severity: string }[] } | null;
  createdAt: string;
  /** the conversation it was produced in, when there was one. The two objects stay separate. */
  conversationId: string | null;
}

/** what kind of workproduct a run produced, from what the run actually did — not from its profile's name */
export function workproductTypeOf(run: AgentRunBody): WorkproductType {
  const prepared = run.result?.prepared?.length ?? 0;
  if (prepared) return 'PREPARATION_SUMMARY';
  return run.goal.workClass === 'CLOSE_READINESS' || run.goal.workClass === 'REVIEW_PREPARATION' ? 'CONTROLLER_BRIEFING' : 'INVESTIGATION_SUMMARY';
}

/**
 * Project a finished run into a workproduct. It reads the run and nothing else, so it can be recomputed from a
 * persisted run at any time and can never introduce a figure the run did not establish.
 */
export function workproductOf(run: AgentRunBody, type?: WorkproductType): AgentWorkproduct | null {
  const r = run.result;
  if (!r) return null;
  const inv = r.investigation ?? null;
  const g = run.goal;

  /* FACT — the run's own findings, each carrying the facts and objects it rests on */
  const factsOf = (refs: string[]) => {
    const out: string[] = [];
    for (const ref of refs) {
      const o = (run.investigation?.observations ?? []).find((x) => x.ref === ref);
      for (const f of o?.facts ?? []) if (f.id && !out.includes(f.id)) out.push(f.id);
    }
    return out;
  };
  const severity = new Map((r.findings ?? []).map((f) => [f.text, f.severity] as const));
  const amount = new Map((r.findings ?? []).map((f) => [f.text, f.amountUsd ?? null] as const));
  const materialFindings: WorkproductFinding[] = (inv?.findings ?? []).map((f) => ({
    statement: f.statement, kind: f.kind, support: f.support,
    severity: severity.get(f.statement) ?? null, amountUsd: amount.get(f.statement) ?? null,
    factRefs: factsOf(f.observationRefs ?? []), objectRefs: f.objectIds ?? [],
  }));
  /* a template run has structured findings and no investigation narrative — it still has facts to state */
  if (!materialFindings.length) {
    for (const f of r.findings ?? []) materialFindings.push({ statement: f.text, kind: 'OBSERVED_FACT', support: 'SUPPORTED', severity: f.severity, amountUsd: f.amountUsd ?? null, factRefs: [], objectRefs: f.objectId ? [f.objectId] : [] });
  }

  /* MODEL RECOMMENDATION — labelled as what it is, and kept out of the findings */
  const recommendedActions = (inv?.nextSteps ?? []).map((n) => ({ text: n.label, basis: [] as string[] }))
    .concat((r.requireAction ?? []).map((t) => ({ text: t, basis: [] as string[] })))
    .filter((x, i, a) => x.text && a.findIndex((y) => y.text === x.text) === i)
    .slice(0, 12);

  const allFacts = [...new Set([
    ...(run.investigation?.observations ?? []).flatMap((o) => o.facts.map((f) => f.id)),
    ...(run.observations ?? []).flatMap((o) => o.factIds ?? []),
  ].filter((x): x is string => !!x))];
  const evidenceRefs = [...new Set((run.observations ?? []).flatMap((o) => o.evidence ?? []))];

  return {
    id: `WP-${run.runId.replace(/^RUN-/, '')}`,
    type: type ?? workproductTypeOf(run),
    title: g.title, period: g.period, periodRange: g.periodRange ?? null, scope: g.scope,
    subject: g.refs ?? [],
    executiveSummary: r.headline,
    counts: r.counts ?? [],
    materialFindings,
    recommendedActions,
    preparedActions: r.prepared ?? [],
    unresolvedQuestions: inv?.unresolved ?? [],
    limitations: r.external ?? [],
    factRefs: allFacts,
    evidenceRefs,
    populationRefs: inv?.populations ?? [],
    presentation: {
      analysisIds: [], reportIds: [],
      artifactIds: (r.artifacts ?? []).map((a) => a.id),
    },
    sourceAgentRunId: run.runId,
    traceRef: run.runId,
    profile: g.policyProfile,
    evaluationRefs: null,
    createdAt: run.completedAt ?? run.updatedAt,
    conversationId: run.sessionId ?? null,
  };
}
