/**
 * GOALS — turning what the user asked Sloane to ACHIEVE into a structured AgentGoal, and nothing more.
 *
 * Detection is deliberately conservative: a goal is a request to carry work through several governed steps ("Review
 * the June close", "Prepare the controller review", "Review Siemens FY26 activity", "Prepare the audit support package for
 * CIP"). A question ("why did CIP move?") is NOT a goal and stays with the conversation. The goal TYPE, and with it
 * the policy profile, is chosen here by Korvyn — never by the model and never by a word in the request that names a
 * profile ("run as controller" changes nothing).
 *
 * An AMBIGUOUS goal is still a goal: the fields that resolved are set, the ones that did not are carried as `pending`
 * clarifications, and the run waits for the answer instead of being refused.
 */
import { periodLabel } from '../financials.js';
import { type AgentGoal, type GoalType, PROFILE_FOR, POLICY_PROFILES } from './model.js';
import { type Ambiguity, type AmbiguityDeps, type Resolution, resolveTerms } from './ambiguity.js';

/** the words that make a request a GOAL (work to carry through), not a question */
const GOAL_VERB = /\b(review|prepare|investigate|assemble|get\b.*\bready|work through|take care of|run (?:the|a)\b|put together|pull together|refresh|regenerate)\b/i;
const PERIOD_WORD = /\b(quarter|month|year|q[1-4]|ytd|january|february|march|april|may|june|july|august|september|october|november|december)\b/;

/** @param subject whether the words name (or ambiguously name) a vendor, project or entity */
/**
 * A4 §4 — THE PERSON ASKING FOR NOTHING TO BE PREPARED, as against Korvyn's own default. `noActions` is
 * otherwise DERIVED from the profile Korvyn chose, so this is the one thing that must outrank it: a profile that
 * may prepare must never relax an instruction a person gave. It reads the same shape `noComments` beside it does,
 * and it is not a router — nothing downstream branches on which words matched.
 */
export function noActionsAsked(text: string): { noActions: true; userSetNoActions: true } | Record<string, never> {
  return /\b(don'?t|do not|no|without)\b[^.]{0,40}\b(prepar|draft|comment|creat|writ|chang)/i.test(text) ? { noActions: true, userSetNoActions: true } : {};
}

export function detectGoalType(text: string, subject = false): GoalType | null {
  const t = text.toLowerCase().trim();
  if (t.length < 8 || /\?\s*$/.test(t) && !/^(can|could|would|will) you\b/.test(t)) return null;
  if (!GOAL_VERB.test(t) && !/\bapprove\b.*\b(reconciliations?|recs?)\b.*\b(ready|that are)\b/.test(t)) return null;
  /* a request that opens with an action verb is an action, never a goal ("send … for review") */
  if (/^(please )?(send|assign|attach|add|comment|create|post|save|email|share|delete|mark|link|submit)\b/.test(t)) return null;
  if (/\b(audit (support|package|gl)|support package for (the )?audit|pbc package|audit[- ]ready (gl|package)|support for (the )?pbc)\b/.test(t) && /\b(prepare|assemble|build|put together|pull together|get)\b/.test(t)) return 'PREPARE_AUDIT_SUPPORT';
  /* "as a controller" names a role, not a goal: only the controller REVIEW (or approvals) makes this goal type */
  if (/\bcontroller'?s? review\b|\breview for (the )?controller\b|\bget\b.*\bready for (the )?(controller|review)\b|\bapprove\b.*\b(reconciliations?|recs?)\b/.test(t) && /\b(prepare|get|ready|approve|assemble)\b/.test(t)) return 'PREPARE_CONTROLLER_REVIEW';
  if (/\b(refresh|regenerate|re-?generate)\b.*\b(package|workbook)\b/.test(t)) return 'BUILD_FINANCIAL_ARTIFACT';
  /* a package / workbook request is a deliverable, never a close review ("prepare a close review package") */
  if (/\b(package|workbook|excel|pack)\b/.test(t)) return /\b(prepare|assemble|put together|pull together)\b/.test(t) ? 'BUILD_FINANCIAL_ARTIFACT' : null;
  if (/\bclose\b/.test(t) && /\breview\b|\bwhere (does|do) (the )?close stand\b/.test(t)) return 'REVIEW_CLOSE';
  /* "review" must be the request's verb ("Review Siemens FY26 activity"), not a noun ("… for review") */
  const leadReview = /^(please |can you |could you |let'?s |now )?(review|look into|dig into)\b/.test(t);
  if (/\binvestigate\b/.test(t) || (leadReview && subject)) return 'INVESTIGATE_VENDOR';
  if (/\breview\b/.test(t) && PERIOD_WORD.test(t)) return 'REVIEW_CLOSE';
  if (/\b(work through|take care of)\b/.test(t)) return 'GENERIC';
  return null;
}
/** does a resolution name a subject (a vendor, project or entity — or several)? */
export const hasSubject = (r: Resolution) => !!(r.values.vendor || r.values.project || r.values.entity || r.ambiguities.some((a) => ['vendor', 'project', 'entity', 'account'].includes(a.field)));

export type GoalDeps = AmbiguityDeps;

/** the structured goal; the policy profile comes from PROFILE_FOR[type] and nowhere else */
export function parseGoal(text: string, d: GoalDeps, forced?: GoalType, res?: Resolution): AgentGoal | null {
  const r = res ?? resolveTerms(text, d);
  const type = forced ?? detectGoalType(text, hasSubject(r));
  if (!type) return null;
  const t = text.toLowerCase();
  const v = r.values;
  /* only the ambiguities that matter to THIS goal type are asked */
  const relevant: Record<GoalType, string[]> = {
    REVIEW_CLOSE: ['period', 'entity'], PREPARE_CONTROLLER_REVIEW: ['period', 'entity'], INVESTIGATE_VENDOR: ['vendor', 'project', 'entity', 'period', 'account'],
    PREPARE_AUDIT_SUPPORT: ['account', 'pbc', 'period', 'entity'], BUILD_FINANCIAL_ARTIFACT: ['artifact', 'period', 'entity', 'account'], GENERIC: ['vendor', 'project', 'entity', 'period', 'account'],
    /* A2 §3: the generic loop is now the runtime for every new run, so the clarifications the legacy subject
       templates raised must be raised here too — an ambiguous "Siemens" still asks, whichever path carries it. */
    INVESTIGATE: ['vendor', 'project', 'entity', 'period', 'account'],
  };
  const pending: Ambiguity[] = r.ambiguities.filter((a) => relevant[type].includes(a.field));
  /* an investigation needs a subject Korvyn can resolve or ask about; "investigate the close" is a close review */
  if (type === 'INVESTIGATE_VENDOR' && !v.vendor && !v.project && !v.entity && !pending.some((a) => ['vendor', 'project', 'entity'].includes(a.field))) return /\bclose\b/.test(t) ? parseGoal(text, d, 'REVIEW_CLOSE', r) : null;
  const fy = /\bfy\s?(20)?26\b|\bfiscal (year )?2026\b|\bytd\b|\byear to date\b|\bthis year\b/.test(t);
  const span = type === 'INVESTIGATE_VENDOR' || type === 'PREPARE_AUDIT_SUPPORT' || fy;
  const period = v.period ?? d.workingPeriod;
  const periodRange = v.periodRange ?? (span && !v.period ? { start: d.periods[0]!, end: d.workingPeriod } : null);
  const profile = PROFILE_FOR[type];
  const approve = /\bapprove\b/.test(t);
  const goal: AgentGoal = {
    type, objective: text.trim().slice(0, 500), title: '', period, periodRange, scope: v.entity ?? 'GROUP',
    subject: { vendor: v.vendor ?? null, project: v.project ?? null, entity: v.entity ?? null, account: v.account ?? (/\b(intercompany|ic) receivable/.test(t) ? '13000' : null), pbcRequestId: v.pbcRequestId ?? null, reconciliationId: /\bintercompany\b.*\brec/.test(t) ? 'REC-MDH-13100' : null, artifactId: v.artifactId ?? null },
    labels: { ...r.labels },
    successCriteria: [], constraints: { noComments: /\b(don'?t|do not|no)\b.*\bcomments?\b/.test(t), exclude: [], focusFirst: [], noActions: type === 'REVIEW_CLOSE' || type === 'INVESTIGATE_VENDOR', approveReady: approve && type === 'PREPARE_CONTROLLER_REVIEW', noPackage: false, ...noActionsAsked(t) },
    requestedOutputs: [], userInstructions: [], policyProfile: profile, riskTolerance: POLICY_PROFILES[profile].autonomy >= 2 ? 'PREPARE' : 'READ_ONLY',
    threshold: null, outputFormat: /\bcsv\b/.test(t) ? 'csv' : 'xlsx', pending, resolved: [], notices: r.notices.slice(), periodText: v.periodLabel ?? null,
  };
  retitle(goal);
  return goal;
}

/** the title, criteria and outputs follow the goal as it is resolved and steered — never a stale label */
export function retitle(g: AgentGoal) {
  /* while the period itself is the open question, the title does not claim one */
  const pl = g.pending.some((a) => a.field === 'period') ? 'period to confirm' : g.periodText ?? (g.periodRange ? `${periodLabel(g.periodRange.start)}–${periodLabel(g.periodRange.end)}` : periodLabel(g.period));
  const subj = g.subject.vendor ?? g.labels['project'] ?? g.subject.project ?? g.labels['entity'] ?? g.subject.entity ?? (g.subject.account === '15000' ? 'CIP' : null);
  const scope = [g.subject.vendor && g.subject.project ? g.labels['project'] ?? g.subject.project : null, (g.subject.vendor || g.subject.project) && g.subject.entity ? g.labels['entity'] ?? g.subject.entity : null].filter(Boolean).join(' · ');
  const waiting = g.pending.length ? g.pending[0]!.term : null;
  g.title = g.type === 'REVIEW_CLOSE' ? (pl === 'period to confirm' ? 'Close review · period to confirm' : `${pl} close review`)
    : g.type === 'PREPARE_CONTROLLER_REVIEW' ? `${pl} controller review preparation`
      : g.type === 'PREPARE_AUDIT_SUPPORT' ? `Audit support package${subj ? ` — ${subj}` : g.subject.pbcRequestId ? ` — ${g.labels['pbc'] ?? g.subject.pbcRequestId}` : ''} · ${pl}`
        : g.type === 'INVESTIGATE_VENDOR' ? `${subj ?? capWord(waiting ?? 'Subject')} review${scope ? ` — ${scope}` : ''} · ${pl}`
          : g.type === 'BUILD_FINANCIAL_ARTIFACT' ? (g.subject.artifactId ? `${g.labels['artifact'] ?? 'Saved workbook'} · regenerate` : `Financial package · ${pl}`) : g.objective.slice(0, 80);
  const approve = g.constraints.approveReady;
  const crit: Record<string, string[]> = {
    REVIEW_CLOSE: ['Close readiness stated', 'Every material blocker named with its amount', 'Reconciliations not tied and pending review identified', 'Unexplained material flux identified', 'Source systems that limit the review disclosed', 'Nothing written'],
    PREPARE_CONTROLLER_REVIEW: ['Close position and blockers read', 'Draft Flux comments prepared for unexplained material lines', 'Draft reconciliation comments prepared where a reconciliation does not tie', ...(approve ? ['Reconciliations evidence-checked before any approval is prepared; approvals routed to a different approver'] : []), 'Nothing written without confirmation'],
    PREPARE_AUDIT_SUPPORT: ['Audit GL population defined and pinned', 'Tie-out status recorded', 'Workbook generated with the expected tabs', 'Generation verified before completion'],
    INVESTIGATE_VENDOR: ['Activity by month and by dimension', 'Governed population defined', 'Missing support identified', 'Source systems and their availability disclosed'],
    BUILD_FINANCIAL_ARTIFACT: ['Package defined from governed sections', 'Previewed and validated', 'Generated only after confirmation'],
    GENERIC: ['Plan validated by Korvyn', 'Every result from a governed tool'],
  };
  const outs: Record<string, string[]> = { REVIEW_CLOSE: ['Close review summary'], PREPARE_CONTROLLER_REVIEW: ['Draft comments (unconfirmed)', 'Close review package preview', ...(approve ? ['Governed approval routing'] : [])], PREPARE_AUDIT_SUPPORT: ['Audit support workbook'], INVESTIGATE_VENDOR: ['Review summary'], BUILD_FINANCIAL_ARTIFACT: ['Financial workbook'], GENERIC: ['Answer'] };
  g.successCriteria = crit[g.type]!; g.requestedOutputs = outs[g.type]!;
}
const capWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
