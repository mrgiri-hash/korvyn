/**
 * PHASE 8C.1 — GENERALIZATION EVALUATION: case schema, outcome extraction and SEMANTIC scoring.
 *
 * A case states what the request must MEAN — the outcome class, the analysis it must produce or change, the tools it
 * must use, whether it must (or must not) ask, whether it must say a capability is unavailable, and what must never
 * appear — never the wording of the reply. The fixtures live in JSON beside this file and are read only by the
 * harness; no routing code imports them.
 */
import type { SloaneOrchestrator, TurnResponse } from '../orchestrator.js';

export type Family = 'STATEMENT' | 'TB' | 'PERIOD_COMPARE' | 'PIVOT' | 'FILTER' | 'SORT' | 'HIERARCHY' | 'DRILL' | 'TRACE' | 'FLUX' | 'RECON' | 'EVIDENCE'
  | 'LOOKUP' | 'SAVE' | 'MODIFY' | 'CONVERSATION' | 'CORRECTION' | 'TOPIC_CHANGE' | 'CLARIFICATION' | 'UNSUPPORTED' | 'SHORTHAND' | 'REFERENT' | 'COMPOUND' | 'NOVEL' | 'PERMISSION';
export type Outcome = 'ANALYSIS' | 'CANVAS' | 'CONVERSATION' | 'TOOLS' | 'AGENT' | 'CLARIFY' | 'PROPOSAL' | 'NOTE';
export type Persona = 'CONTROLLER' | 'CORPORATE' | 'RESTRICTED';

export interface Expect {
  outcome?: Outcome[];
  analysis?: {
    type?: string; statement?: 'BS' | 'IS' | null; periods?: string[]; periodsInclude?: string[]; primary?: string;
    rowsInclude?: string[]; rowsFirst?: string; columnsInclude?: string[]; measuresInclude?: string[];
    filter?: { dimension: string; value: string; op?: 'IN' | 'NOT_IN' }; noFilterOn?: string[]; accountType?: string;
    threshold?: boolean; thresholdPct?: boolean; sort?: string; topN?: number; expandedSome?: boolean; panel?: string;
    /** the same analysis id as the setup produced (a modification), or a new one */
    same?: boolean; fresh?: boolean;
  };
  toolsAny?: string[];
  canvasKind?: string[];
  clarify?: boolean;
  unsupported?: boolean;
  proposal?: string;
  forbidOutcome?: Outcome[];
  /** a regular expression the whole response must NOT match (permission leaks) */
  leak?: string;
}
export interface FocusSpec { row: string; period?: string }
export interface EvalCase { id: string; family: Family; set?: 'KNOWN' | 'HOLDOUT' | 'GENERATED'; persona?: Persona; setup?: string[]; setupFocus?: FocusSpec; input: string; focus?: FocusSpec; expect: Expect; note?: string }

export type Category = 'INTENT_MISCLASSIFIED' | 'CONTEXT_LOST' | 'OVER_INHERITED_CONTEXT' | 'WRONG_DIMENSION' | 'WRONG_MEASURE' | 'WRONG_PERIOD' | 'WRONG_SCOPE'
  | 'WRONG_REFERENT' | 'UNNECESSARY_CLARIFICATION' | 'MISSING_CLARIFICATION' | 'TOOL_SELECTION_ERROR' | 'CAPABILITY_ERROR' | 'PERMISSION_ERROR';
export type Metric = 'intent' | 'analysis' | 'context' | 'referent' | 'clarification' | 'tools' | 'unsupported' | 'permission';
export interface Check { metric: Metric; ok: boolean; category: Category | null; detail: string }

type J = Record<string, any>;
export interface Observed { outcome: Outcome; route: string | null; state: string; analysis: J | null; canvas: J | null; tools: string[]; notes: string[]; reply: string | null; text: string; clarification: boolean; proposalTypes: string[]; latencyMs: number; calls: string[] }

export function observe(orch: SloaneOrchestrator, r: TurnResponse): Observed {
  const t = orch.trace(r.traceId);
  const a = (r.objects ?? []).find((o) => o.type === 'FinancialAnalysis')?.analysis as J | undefined;
  const c = (r.objects ?? []).find((o) => o.type === 'DynamicFinancialCanvas')?.canvas as J | undefined;
  const props = (r.actions?.proposals ?? []).map((p) => p.type);
  const tools = (t?.toolsExecuted ?? []).filter((x) => x.status === 'COMPLETED').map((x) => x.tool);
  const clar = r.state === 'CLARIFICATION_REQUIRED' || (!!r.reply && t?.conversation?.conversationIntent === 'UNCLEAR');
  const outcome: Outcome = r.state === 'CLARIFICATION_REQUIRED' ? 'CLARIFY' : props.length ? 'PROPOSAL' : a ? 'ANALYSIS' : c ? 'CANVAS' : t?.route === 'AGENT' ? 'AGENT'
    : r.reply ? (clar ? 'CLARIFY' : 'CONVERSATION') : tools.length ? 'TOOLS' : 'NOTE';
  return { outcome, route: t?.route ?? null, state: r.state, analysis: a ?? null, canvas: c ?? null, tools, notes: r.notes ?? [], reply: r.reply ?? null,
    text: JSON.stringify(r), clarification: clar, proposalTypes: props, latencyMs: t?.latencyMs ?? 0, calls: (t?.calls ?? []).map((x) => `${x.stage}@${x.route ?? '?'}`) };
}

const UNSUPPORTED_WORDS = /\bnot (yet )?(available|supported|held|governed|in the governed|expose|exposed|possible)|\bcannot\b|\bcan't\b|\bunavailable\b|\bno (fund|customer|department|elimination|governed)|isn't (held|available|supported)|does not (yet )?(support|expose|hold)|not (currently|yet) (supported|available)/i;

export function score(c: EvalCase, o: Observed, setupAnalysisId: string | null): Check[] {
  const E = c.expect, out: Check[] = [];
  const push = (metric: Metric, ok: boolean, category: Category, detail: string) => out.push({ metric, ok, category: ok ? null : category, detail });
  if (E.outcome) push('intent', E.outcome.includes(o.outcome), E.outcome.includes('CLARIFY') && o.outcome !== 'CLARIFY' ? 'MISSING_CLARIFICATION' : o.outcome === 'CLARIFY' ? 'UNNECESSARY_CLARIFICATION' : 'INTENT_MISCLASSIFIED', `outcome ${o.outcome} (route ${o.route}); expected ${E.outcome.join('|')}`);
  if (E.forbidOutcome) push('intent', !E.forbidOutcome.includes(o.outcome), 'INTENT_MISCLASSIFIED', `outcome ${o.outcome} is forbidden here`);
  if (E.clarify !== undefined) push('clarification', o.clarification === E.clarify, E.clarify ? 'MISSING_CLARIFICATION' : 'UNNECESSARY_CLARIFICATION', `clarification ${o.clarification}; expected ${E.clarify}`);
  if (E.canvasKind) push('intent', !!o.canvas && E.canvasKind.includes(o.canvas['kind']), 'INTENT_MISCLASSIFIED', `canvas ${o.canvas?.['kind'] ?? 'none'}`);
  if (E.toolsAny) push('tools', E.toolsAny.some((x) => o.tools.includes(x)) || (!!o.canvas && E.canvasKind === undefined && E.toolsAny.some((x) => JSON.stringify(o.canvas).includes(x))), 'TOOL_SELECTION_ERROR', `tools ${o.tools.join(',') || 'none'}; expected any of ${E.toolsAny.join(',')}`);
  if (E.proposal) push('tools', o.proposalTypes.includes(E.proposal), 'TOOL_SELECTION_ERROR', `proposals ${o.proposalTypes.join(',') || 'none'}`);
  if (E.unsupported) push('unsupported', UNSUPPORTED_WORDS.test([...o.notes, o.reply ?? ''].join(' ') + JSON.stringify(o.analysis?.['definition'] ?? '')) || UNSUPPORTED_WORDS.test(o.text), 'CAPABILITY_ERROR', `notes: ${o.notes.join(' | ').slice(0, 160)}`);
  if (E.leak) push('permission', !new RegExp(E.leak, 'i').test(o.text), 'PERMISSION_ERROR', 'restricted member or balance appeared in the response');
  const A = E.analysis;
  if (A) {
    const a = o.analysis, d = a?.['definition'] as J | undefined;
    if (!d) { push('analysis', false, o.outcome === 'CLARIFY' ? 'UNNECESSARY_CLARIFICATION' : 'INTENT_MISCLASSIFIED', `no analysis (outcome ${o.outcome})`); return out; }
    const rows: string[] = d['rows'].map((r: J) => r['dimension']), cols: string[] = d['columns'].map((r: J) => r['dimension']);
    if (A.same !== undefined) push('context', A.same ? d['id'] === setupAnalysisId : d['id'] !== setupAnalysisId, A.same ? 'CONTEXT_LOST' : 'OVER_INHERITED_CONTEXT', `analysis ${d['id']} vs setup ${setupAnalysisId}`);
    if (A.fresh) push('context', d['id'] !== setupAnalysisId, 'OVER_INHERITED_CONTEXT', 'expected a new analysis');
    if (A.type) push('analysis', d['analysisType'] === A.type, 'INTENT_MISCLASSIFIED', `type ${d['analysisType']}`);
    if (A.statement !== undefined) push('analysis', (d['statement'] ?? null) === A.statement, 'WRONG_SCOPE', `statement ${d['statement']}`);
    if (A.periods) push('analysis', JSON.stringify([...d['periods']].sort()) === JSON.stringify([...A.periods].sort()), 'WRONG_PERIOD', `periods ${d['periods'].join(',')}`);
    if (A.periodsInclude) push('analysis', A.periodsInclude.every((p) => d['periods'].includes(p)), 'WRONG_PERIOD', `periods ${d['periods'].join(',')}`);
    if (A.primary) push('analysis', d['primaryPeriod'] === A.primary, 'WRONG_PERIOD', `primary ${d['primaryPeriod']}`);
    if (A.rowsInclude) push('analysis', A.rowsInclude.every((x) => rows.includes(x)), 'WRONG_DIMENSION', `rows ${rows.join('>')}`);
    if (A.rowsFirst) push('analysis', rows[0] === A.rowsFirst, 'WRONG_DIMENSION', `rows ${rows.join('>')}`);
    if (A.columnsInclude) push('analysis', A.columnsInclude.every((x) => cols.includes(x)), 'WRONG_DIMENSION', `columns ${cols.join(',')}`);
    if (A.measuresInclude) push('analysis', A.measuresInclude.every((m) => d['measures'].includes(m)), 'WRONG_MEASURE', `measures ${d['measures'].join(',')}`);
    if (A.filter) { const f = (d['filters'] as J[]).find((x) => x['dimension'] === A.filter!.dimension && (x['op'] ?? 'IN') === (A.filter!.op ?? 'IN'));
      push('analysis', !!f && f['values'].includes(A.filter.value), 'WRONG_DIMENSION', `filters ${JSON.stringify(d['filters'].map((x: J) => [x['dimension'], x['op'], x['values']]))}`); }
    if (A.noFilterOn) push('context', A.noFilterOn.every((dim) => !(d['filters'] as J[]).some((x) => x['dimension'] === dim)), 'OVER_INHERITED_CONTEXT', `filters ${JSON.stringify(d['filters'].map((x: J) => [x['dimension'], x['values']]))}`);
    if (A.accountType) push('analysis', (d['accountTypes'] ?? []).includes(A.accountType), 'WRONG_SCOPE', `account types ${JSON.stringify(d['accountTypes'] ?? null)}`);
    if (A.threshold) push('analysis', !!d['valueFilter'], 'WRONG_MEASURE', `valueFilter ${JSON.stringify(d['valueFilter'])}`);
    if (A.thresholdPct) push('analysis', !!d['valueFilter'] && typeof d['valueFilter']['minPct'] === 'number', 'WRONG_MEASURE', `valueFilter ${JSON.stringify(d['valueFilter'])}`);
    if (A.sort) push('analysis', d['sorts'][0]?.['by'] === A.sort, 'WRONG_MEASURE', `sorts ${JSON.stringify(d['sorts'])}`);
    if (A.topN) push('analysis', d['topN'] === A.topN, 'WRONG_MEASURE', `topN ${d['topN']}`);
    if (A.expandedSome) push('referent', (d['expanded'] as string[]).length > 0, 'WRONG_REFERENT', `expanded ${d['expanded'].length}`);
    if (A.panel) push(c.family === 'REFERENT' ? 'referent' : 'tools', a!['panel']?.['kind'] === A.panel, c.family === 'REFERENT' ? 'WRONG_REFERENT' : 'TOOL_SELECTION_ERROR', `panel ${a!['panel']?.['kind'] ?? 'none'}`);
  }
  return out;
}
