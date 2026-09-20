/**
 * TASK GRAPHS — the canonical workflows as dependency graphs of governed steps.
 *
 * A template is Korvyn's plan for a goal type: which registered tools to call, in what order, which results feed which
 * steps (`$task:<id>.refs.<key>` / `$task:<id>.population`), which steps are milestones a person sees, and which
 * expand the graph from what they found (a Flux comment per unexplained line, an evidence check per reconciliation that
 * might be approved). Every tool step is still validated by the Planner and re-authorised at execution; a template is
 * not a permission.
 */
import type { AgentGoal, AgentTask, TaskType } from './model.js';

type T = Partial<AgentTask> & Pick<AgentTask, 'taskId' | 'type' | 'title'>;
export function mkTask(p: T, version: number, origin: AgentTask['origin']): AgentTask {
  const tool = p.tool ?? null;
  const risk: AgentTask['riskLevel'] = p.riskLevel ?? (p.type === 'PREPARE_ACTION' ? 'PROPOSE' : p.type === 'WAIT_FOR_APPROVAL' ? 'GOVERNED' : tool ? 'READ' : 'INTERNAL');
  return {
    tool, args: {}, refs: {}, dependsOn: [], status: 'PENDING', riskLevel: risk,
    retryPolicy: risk === 'READ' ? { max: 1, on: 'TRANSIENT' } : { max: 0, on: 'NEVER' },
    attempts: 0, resultObjectIds: [], evidenceIds: [], proposalIds: [], artifactIds: [], executionTraceId: null, failureMode: null, error: null,
    scopeSensitive: false, milestone: false, origin, planVersion: version, invalidatedBy: null, startedAt: null, completedAt: null, latencyMs: null, priority: 50,
    ...p,
  };
}

const range = (g: AgentGoal) => ({ periodStart: g.periodRange?.start ?? g.period, periodEnd: g.periodRange?.end ?? g.period });
const tail = (deps: string[], soft = true): T[] => [
  { taskId: 'verify', type: 'VERIFY', title: 'Verification', check: 'VERIFY', dependsOn: deps, softDeps: soft, milestone: true, priority: 90 },
  { taskId: 'summarize', type: 'SUMMARIZE', title: 'Summary', check: 'SUMMARIZE', dependsOn: ['verify'], softDeps: true, priority: 95 },
];

export function templateFor(goal: AgentGoal): T[] {
  const p = goal.period, s = goal.subject;
  const closeReads: T[] = [
    { taskId: 'readiness', type: 'RETRIEVE', title: 'Close status', tool: 'getCloseReadiness', args: { period: p }, milestone: true, priority: 10 },
    { taskId: 'blockers', type: 'RETRIEVE', title: 'Blockers', tool: 'getCloseBlockers', args: { period: p }, milestone: true, priority: 11 },
    { taskId: 'recsNotTied', type: 'RETRIEVE', title: 'Reconciliations', tool: 'getReconciliationsNotTied', args: { period: p }, milestone: true, priority: 12 },
    { taskId: 'recsPending', type: 'RETRIEVE', title: 'Reconciliations pending review', tool: 'getReconciliationsPendingReview', args: { period: p }, priority: 13 },
    { taskId: 'flux', type: 'RETRIEVE', title: 'Flux', tool: 'getUnexplainedFluxItems', args: { period: p }, milestone: true, priority: 14 },
  ];
  switch (goal.type) {
    case 'REVIEW_CLOSE': return [
      ...closeReads,
      { taskId: 'recSupport', type: 'VALIDATE', title: 'Support gaps', tool: 'getReconciliationsMissingSupport', args: { period: p }, milestone: true, priority: 15 },
      { taskId: 'sources', type: 'VALIDATE', title: 'Source systems', check: 'SOURCES', dependsOn: ['blockers', 'recsNotTied'], milestone: true, priority: 16 },
      ...tail(['readiness', 'blockers', 'recsNotTied', 'recsPending', 'flux', 'recSupport', 'sources']),
    ];
    case 'PREPARE_CONTROLLER_REVIEW': return [
      ...closeReads.map((t) => t.taskId === 'flux' ? { ...t, expand: goal.constraints.noComments ? undefined : 'FLUX_COMMENTS' as const }
        : t.taskId === 'recsNotTied' ? { ...t, expand: goal.constraints.noComments ? undefined : 'RECON_COMMENTS' as const }
          : t.taskId === 'recsPending' && goal.constraints.approveReady ? { ...t, expand: 'RECON_APPROVALS' as const, milestone: true, title: 'Approval readiness' } : t),
      { taskId: 'sources', type: 'VALIDATE', title: 'Source systems', check: 'SOURCES', dependsOn: ['blockers', 'recsNotTied'], priority: 16 },
      { taskId: 'pack', type: 'BUILD_ARTIFACT', title: 'Review package', tool: 'buildExcelArtifact', args: { type: 'CLOSE_REVIEW_PACKAGE', periodStart: p, periodEnd: p }, request: `Close review package for ${p}`, dependsOn: ['readiness'], milestone: true, priority: 30 },
      { taskId: 'confirm', type: 'REQUEST_CONFIRMATION', title: 'Your confirmation', check: 'CONFIRMATION', dependsOn: ['flux', 'recsNotTied', 'recsPending', 'pack'], softDeps: true, milestone: true, priority: 80 },
      ...tail(['readiness', 'blockers', 'recsNotTied', 'recsPending', 'flux', 'sources', 'pack', 'confirm']),
    ];
    case 'INVESTIGATE_VENDOR': {
      /* the SUBJECT is a vendor, a project or an entity; the scope filters narrow it; the first breakdown reads the subject
         alone, so a later scope change keeps it */
      const subj: Record<string, string> = s.vendor ? { vendor: s.vendor } : s.project ? { project: s.project } : { entity: s.entity! };
      const f: Record<string, string> = { ...subj, ...range(goal), ...(s.project ? { project: s.project } : {}), ...(s.entity ? { entity: s.entity } : {}), ...(s.vendor ? { vendor: s.vendor } : {}), ...(s.account ? { account: s.account } : {}) };
      const T: Record<string, string> = goal.threshold ? { minAbsChange: String(goal.threshold) } : {}, P: Record<string, string> = goal.threshold ? { minAbsAmount: String(goal.threshold) } : {};
      const dims = s.vendor ? ['project', 'entity'] : s.project ? ['vendor', 'entity'] : ['project', 'vendor'];
      return [
        { taskId: 'trend', type: 'ANALYZE', title: 'Activity by month', tool: 'getTrend', args: f, milestone: true, scopeSensitive: true, priority: 10 },
        { taskId: `by-${dims[0]}`, type: 'ANALYZE', title: `By ${dims[0]}`, tool: 'analyzeByDimension', args: { dimension: dims[0]!, ...subj, ...range(goal), ...T }, milestone: true, priority: 11 },
        { taskId: `by-${dims[1]}`, type: 'ANALYZE', title: `By ${dims[1]}`, tool: 'analyzeByDimension', args: { dimension: dims[1]!, ...f, ...T }, milestone: true, scopeSensitive: true, priority: 12 },
        { taskId: 'population', type: 'RETRIEVE', title: 'GL population', tool: 'getGovernedPopulation', args: { ...f, ...P }, milestone: true, scopeSensitive: true, priority: 13 },
        { taskId: 'support', type: 'VALIDATE', title: 'Support', tool: 'findMissingEvidence', refs: { populationId: '$task:population.population' }, dependsOn: ['population'], milestone: true, scopeSensitive: true, priority: 14 },
        { taskId: 'sources', type: 'VALIDATE', title: 'Source systems', tool: 'getSourceSystemReferences', refs: { populationId: '$task:population.population' }, dependsOn: ['population', `by-${dims[1]}`], check: 'VENDOR_SOURCES', milestone: true, scopeSensitive: true, priority: 15 },
        ...tail(['trend', `by-${dims[0]}`, `by-${dims[1]}`, 'population', 'support', 'sources']),
      ];
    }
    case 'PREPARE_AUDIT_SUPPORT': {
      if (s.pbcRequestId) return [
        { taskId: 'pbc', type: 'RETRIEVE', title: 'PBC request', tool: 'getPBCRequest', args: { pbcId: s.pbcRequestId }, milestone: true, priority: 10 },
        { taskId: 'gaps', type: 'VALIDATE', title: 'Support gaps', tool: 'getPBCSupportGaps', args: { pbcRequestId: s.pbcRequestId }, dependsOn: ['pbc'], milestone: true, priority: 11 },
        ...tail(['pbc', 'gaps']),
      ];
      const acct = s.account ?? '15000', r = range(goal);
      return [
        { taskId: 'population', type: 'RETRIEVE', title: 'Audit population', tool: 'getGovernedPopulation', args: { account: acct, ...r, ...(s.entity ? { entity: s.entity } : {}) }, milestone: true, scopeSensitive: true, priority: 10 },
        { taskId: 'build', type: 'BUILD_ARTIFACT', title: 'Audit workbook', tool: 'buildExcelArtifact', args: { type: 'AUDIT_SUPPORT_PACKAGE', account: acct, ...r, ...(s.entity ? { scope: s.entity } : {}) }, request: `Audit support package for ${acct} ${r.periodStart} to ${r.periodEnd}`, dependsOn: ['population'], milestone: true, scopeSensitive: true, priority: 20 },
        { taskId: 'preview', type: 'VALIDATE', title: 'Workbook validation', tool: 'previewExcelArtifact', dependsOn: ['build'], priority: 21 },
        { taskId: 'generate', type: 'PREPARE_ACTION', title: 'Generation prepared', tool: 'proposeGenerateExcelArtifact', args: { format: goal.outputFormat }, request: 'Generate the Excel workbook', dependsOn: ['preview'], planKey: 'ACTIONS', priority: 30 },
        { taskId: 'confirm', type: 'REQUEST_CONFIRMATION', title: 'Your confirmation', check: 'CONFIRMATION', dependsOn: ['generate'], milestone: true, priority: 40 },
        { taskId: 'generation', type: 'EXECUTE_ACTION', title: 'Workbook generated', check: 'GENERATION', dependsOn: ['confirm'], milestone: true, priority: 50 },
        ...tail(['population', 'build', 'preview', 'generate', 'confirm', 'generation'], false),
      ];
    }
    case 'BUILD_FINANCIAL_ARTIFACT': return [
      /* an EXISTING workbook (the user named one) is regenerated from its saved definition, never rebuilt */
      ...(s.artifactId ? [] : [{ taskId: 'build', type: 'BUILD_ARTIFACT' as const, title: 'Workbook', tool: 'buildExcelArtifact', args: { ...range(goal) }, request: goal.objective, milestone: true, priority: 20 }]),
      { taskId: 'preview', type: 'VALIDATE', title: 'Workbook validation', tool: 'previewExcelArtifact', dependsOn: s.artifactId ? [] : ['build'], priority: 21 },
      { taskId: 'generate', type: 'PREPARE_ACTION', title: 'Generation prepared', tool: 'proposeGenerateExcelArtifact', args: { format: goal.outputFormat }, request: 'Generate the workbook', dependsOn: ['preview'], planKey: 'ACTIONS', priority: 30 },
      { taskId: 'confirm', type: 'REQUEST_CONFIRMATION', title: 'Your confirmation', check: 'CONFIRMATION', dependsOn: ['generate'], milestone: true, priority: 40 },
      { taskId: 'generation', type: 'EXECUTE_ACTION', title: 'Workbook generated', check: 'GENERATION', dependsOn: ['confirm'], milestone: true, priority: 50 },
      ...tail([...(s.artifactId ? [] : ['build']), 'preview', 'generate', 'confirm', 'generation'], false),
    ];
    case 'GENERIC': return [];
    /* 8D: an open investigation has no template — it starts with one THINK step and the model grows the graph */
    case 'INVESTIGATE': return [{ taskId: 'think-1', type: 'ANALYZE', title: 'Planning the investigation', check: 'THINK', dependsOn: [], milestone: false, priority: 1 }];
  }
}

/** the task type a tool step is, when the model proposed it (GENERIC goals) */
export function typeOfTool(domain: string, risk: string): TaskType {
  if (risk === 'PROPOSE') return domain === 'build' ? 'BUILD_ARTIFACT' : 'PREPARE_ACTION';
  return domain === 'analysis' ? 'ANALYZE' : domain === 'evidence' || domain === 'trace' ? 'TRACE' : 'RETRIEVE';
}
