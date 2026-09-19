/**
 * STEERING — a short instruction to a running (or just finished) AgentRun, classified into what it changes.
 *
 *   SCOPE_CHANGE      "Only South Valley."            project / entity narrowed or cleared
 *   PERIOD_CHANGE     "Use May instead."              the period the run works on
 *   FILTER_CHANGE     "Ignore anything under $500K."  a threshold, or a vendor filter ("only Siemens Energy")
 *   PRIORITY_CHANGE   "Focus on CIP first."           what runs and is reported first
 *   EXCLUSION         "Ignore Revenue."               a subject dropped from the rest of the run and the result
 *   OUTPUT_CHANGE     "No package." / "Make it CSV."  what the run produces
 *   ACTION_CONSTRAINT "Don't create comments yet."    what the run may prepare, until lifted
 *   PAUSE · RESUME · CANCEL
 *
 * Classification is deterministic and reads governed values through the same resolvers a goal uses; a value the words
 * name ambiguously ("Only DC1") comes back as an ambiguity, and the runtime asks before it changes anything.
 */
import { thresholdIn } from '../conversation.js';
import { type Ambiguity, type AmbiguityDeps, resolveTerms } from './ambiguity.js';
import type { SteeringType } from './model.js';

export interface SteeringIntent {
  type: SteeringType;
  scope?: { dimension: 'project' | 'entity'; value: string; label: string } | { clear: true };
  period?: { period: string; periodRange: { start: string; end: string } | null; label: string };
  threshold?: number | null;
  vendor?: { value: string; label: string };
  focus?: string;
  exclude?: string;
  output?: 'noPackage' | 'package' | 'csv' | 'xlsx';
  constraint?: { noComments?: boolean; noActions?: boolean };
  /** a value the instruction names ambiguously — asked before anything changes */
  ambiguity?: Ambiguity;
}

const PERIOD_CUE = /\b(use|instead|switch|change|make it|for|only|try|look at|move to|go to)\b/;

export function classifySteering(text: string, d: AmbiguityDeps): SteeringIntent | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  if (!t || t.split(' ').length > 16 || /\?$/.test(t)) return null;
  if (/^(stop|cancel|abort|halt|never ?mind)\b/.test(t)) return { type: 'CANCEL' };
  if (/^(pause|hold on|hold off)\b/.test(t) && !/\bcomments?\b|\bactions?\b/.test(t)) return { type: 'PAUSE' };

  /* action constraints — set and lifted */
  if (/\b(don'?t|do not|no|stop|hold off on|without)\b.*\bcomments?\b/.test(t)) return { type: 'ACTION_CONSTRAINT', constraint: { noComments: true } };
  if (/\b(you can|go ahead and|ok(ay)? to|feel free to|now)\b.*\b(create|prepare|draft|add|write)\b.*\bcomments?\b/.test(t)) return { type: 'ACTION_CONSTRAINT', constraint: { noComments: false } };
  if (/\b(don'?t|do not)\b.*\b(prepare|propose|create|take|make)\b.*\b(any )?(actions?|changes|anything)\b|\bread[- ]only\b|\bjust (look|read)\b/.test(t)) return { type: 'ACTION_CONSTRAINT', constraint: { noActions: true } };
  if (/\b(you can|go ahead and|ok(ay)? to)\b.*\b(prepare|propose)\b.*\b(actions?|changes)\b/.test(t)) return { type: 'ACTION_CONSTRAINT', constraint: { noActions: false } };
  if (/^(resume|continue|carry on|go on|proceed|keep going|go ahead)\b/.test(t)) return { type: 'RESUME' };

  /* outputs */
  if (/\b(no|skip|don'?t (build|create|prepare|make)|without)( the| a| any)? (package|workbook|excel|pack)\b/.test(t)) return { type: 'OUTPUT_CHANGE', output: 'noPackage' };
  if (/\b(as|in|make it|give me)( a)? csv\b/.test(t)) return { type: 'OUTPUT_CHANGE', output: 'csv' };
  if (/\b(as|in|make it)( an?)? (xlsx|excel)( file)?\b/.test(t)) return { type: 'OUTPUT_CHANGE', output: 'xlsx' };
  if (/\b(add|include|also (build|prepare|make)|build|make|prepare)( me)?( a| the)? (package|workbook)\b/.test(t)) return { type: 'OUTPUT_CHANGE', output: 'package' };

  /* thresholds before exclusions: "ignore anything under $500K" is a filter, not an exclusion */
  if (/\b(ignore|exclude|drop|skip|hide|leave out)\b.*\b(under|below|less than|smaller than)\b|\bonly\b.*\b(over|above|greater than|more than)\b|\b(over|above) \$?\d/.test(t)) {
    /* "ignore anything under $500K" and "only items over $500K" state the same floor */
    const v = thresholdIn(t.replace(/\b(under|below|less than|smaller than)\b/g, 'over'));
    if (v !== null) return { type: 'FILTER_CHANGE', threshold: v };
  }
  if (/\b(remove|drop|clear) the (threshold|filter)\b|\bshow (everything|all amounts)\b/.test(t)) return { type: 'FILTER_CHANGE', threshold: null };
  if (/^(ignore|skip|leave out|exclude|drop|forget( about)?)\s+/.test(t)) {
    const what = t.replace(/^(ignore|skip|leave out|exclude|drop|forget( about)?)\s+/, '').replace(/^the\s+/, '').replace(/\s+(issue|item|line|one|for now)s?$/, '').trim();
    if (what) return { type: 'EXCLUSION', exclude: what };
  }
  const focus = t.match(/\bfocus on (?:the )?(.+?)(?: first)?$|\b(?:start|begin) with (?:the )?(.+)$|\bprioriti[sz]e (?:the )?(.+)$|^(?:the )?([a-z0-9][a-z0-9 &-]{1,30}) first$/);
  if (focus) return { type: 'PRIORITY_CHANGE', focus: (focus[1] ?? focus[2] ?? focus[3] ?? focus[4] ?? '').trim() };

  /* periods and scopes: read through the governed resolvers */
  const r = resolveTerms(t, d);
  const pAmb = r.ambiguities.find((a) => a.field === 'period');
  if ((r.values.period || pAmb) && (PERIOD_CUE.test(t) || t.split(' ').length <= 3)) {
    if (pAmb) return { type: 'PERIOD_CHANGE', ambiguity: pAmb };
    return { type: 'PERIOD_CHANGE', period: { period: r.values.period!, periodRange: r.values.periodRange ?? null, label: r.labels['period'] ?? r.values.period! } };
  }
  if (/\b(all entities|whole group|entire group|consolidated|all projects|everything again|remove the scope)\b/.test(t)) return { type: 'SCOPE_CHANGE', scope: { clear: true } };
  const narrowing = /\b(only|just|narrow( it)? to|limit( it)? to|restrict( it)? to)\b/.test(t) || t.split(' ').length <= 3;
  if (narrowing) {
    const sAmb = r.ambiguities.find((a) => a.field === 'project' || a.field === 'entity');
    if (r.values.project) return { type: 'SCOPE_CHANGE', scope: { dimension: 'project', value: r.values.project, label: r.labels['project'] ?? r.values.project } };
    if (r.values.entity) return { type: 'SCOPE_CHANGE', scope: { dimension: 'entity', value: r.values.entity, label: r.labels['entity'] ?? r.values.entity } };
    if (sAmb) return { type: 'SCOPE_CHANGE', ambiguity: sAmb };
    const vAmb = r.ambiguities.find((a) => a.field === 'vendor');
    if (r.values.vendor) return { type: 'FILTER_CHANGE', vendor: { value: r.values.vendor, label: r.values.vendor } };
    if (vAmb) return { type: 'FILTER_CHANGE', ambiguity: vAmb };
  }
  return null;
}
