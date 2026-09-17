/**
 * PROPOSE TOOLS — what the planner may call to prepare governed work. Every tool here has risk PROPOSE: it creates
 * an ActionProposal (or edits a session draft) and writes NOTHING to Korvyn work. Execution happens only through
 * ActionEngine.decide() after the user confirms, from the /api/sloane/action route — never from a plan.
 *
 * The model chooses WHICH proposal to prepare and supplies words and targets. It never chooses the action's class
 * (ActionGovernanceEngine does), never validates (the Action Service does) and never executes.
 */
import { ActionGovernanceEngine, type ActionProposal } from './actions.js';
import { BASIS, SNAPSHOT_ID, money, periodLabel } from './financials.js';
import type { DimensionKey, GLine } from './governed.js';
import type { FinancialObject, ParamSpec, SloaneTool, ToolArgs, ToolEnv, ToolResult, ToolSession } from './tools.js';
import { registerTools } from './tools.js';

const $ = (v: number) => money(v, 'USD');
const T = (name: string, description: string, required = false): ParamSpec => ({ name, kind: 'text', required, description });
const S = (env: ToolEnv): ToolSession => { if (!env.session) throw new Error('a proposal needs a Sloane session'); return env.session; };
const groupOf = (env: ToolEnv, code: string) => env.gl.account(code)?.parent ?? code;

function obj(env: ToolEnv, o: Partial<FinancialObject> & Pick<FinancialObject, 'type' | 'title'>): FinancialObject {
  return {
    id: env.objectId, status: 'AVAILABLE', scope: { id: 'GROUP', name: 'Governed Korvyn work' }, periods: [], periodLabel: '', currency: 'USD', basis: BASIS, unit: '',
    table: { columns: [], rows: [] }, facts: [], provenance: { source: 'Korvyn action proposal — nothing is written until confirmed', snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] },
    population: null, refs: {}, focus: null, unavailable: null, governed: true, ...o,
  };
}
/** a proposal as a FinancialObject the browser renders as an ActionPreview */
function proposalObject(env: ToolEnv, p: ActionProposal): ToolResult {
  const sess = S(env);
  sess.proposalsThisTurn.push(p.id);
  const o = obj(env, {
    type: 'ActionProposal', title: p.title, status: p.validationStatus === 'INVALID' ? 'PARTIAL' : 'AVAILABLE', periodLabel: String(p.proposedPayload['period'] ? periodLabel(String(p.proposedPayload['period'])) : ''),
    table: { columns: ['Value'], rows: p.preview.map((x) => ({ label: x.label, level: 1, kind: 'line' as const, cells: [x.value] })) },
    facts: [
      { key: 'actionType', label: 'Action', value: p.type, display: p.type },
      { key: 'riskLevel', label: 'Governance class (Korvyn policy)', value: p.riskLevel, display: p.riskLevel },
      { key: 'status', label: 'Status', value: p.status, display: p.status },
      { key: 'target', label: 'Target', value: p.targetLabel ?? 'unresolved', display: p.targetLabel ?? 'unresolved' },
      ...p.validation.errors.map((e, i) => ({ key: `error${i + 1}`, label: 'Validation error', value: e, display: e })),
      ...p.validation.warnings.map((w, i) => ({ key: `warning${i + 1}`, label: 'Warning', value: w, display: w })),
    ],
    refs: { proposalId: p.id }, action: p,
  });
  return { object: o, warnings: [...p.validation.errors, ...p.validation.warnings] };
}
function propose(env: ToolEnv, type: string, payload: Record<string, unknown>, extra: { dependsOn?: string[]; description?: string; populations?: string[] } = {}) {
  const s = S(env);
  return s.engine.propose({
    sessionId: s.id, planId: s.planId, type, payload, dependsOn: extra.dependsOn, description: extra.description,
    sourceFinancialObjectIds: s.lastObjects.map((o) => `${s.traceId}:${o.id}`), sourcePopulationIds: extra.populations ?? (s.populationId ? [s.populationId] : []),
    investigationId: s.investigationId, traceId: s.traceId, actor: env.actor,
  });
}
const afterP: ParamSpec = { name: 'afterProposal', kind: 'text', required: false, description: 'proposal id this action depends on, e.g. $0.refs.proposalId' };
const depsOf = (a: ToolArgs) => (a['afterProposal'] ? [a['afterProposal']] : []);
const periodOf = (a: ToolArgs, s: ToolSession) => a['period'] || s.period;
const recTargetOf = (a: ToolArgs, s: ToolSession) => a['target'] || (s.focus?.kind === 'reconciliation' ? s.focus.id : '') || s.lastRefs['reconciliationId'] || '';
const fluxAccountOf = (env: ToolEnv, a: ToolArgs, s: ToolSession) => groupOf(env, (a['account'] || (s.focus?.kind === 'account' ? s.focus.id : '') || s.lastRefs['account'] || s.lastRefs['largestAccount'] || '').replace(/^account:/, ''));

/* ================================================================================================
   COMMENTS
   ================================================================================================ */
function explanationFor(env: ToolEnv, s: ToolSession, account: string, period: string) {
  const sentences = s.lastNarrative.filter(Boolean);
  if (sentences.length) { let t = ''; for (const x of sentences) { if ((t + ' ' + x).length > 600) break; t = `${t} ${x}`.trim(); } return t || sentences[0]!.slice(0, 600); }
  const i = env.controls.fluxItems(period, env.visible).find((x) => x.account === account);
  return i ? `${i.name} moved ${$(i.changeUsd)} (${i.changePct}) from ${$(i.priorUsd)} to ${$(i.currentUsd)} in ${periodLabel(period)}.` : '';
}
/** the figures the analysis Sloane just gave carries — a comment built from them is grounded */
const grounded = (s: ToolSession) => s.lastObjects.flatMap((o) => o.facts.map((f) => f.display));
/** when the user dictated the wording ("add a comment that …"), their words are kept exactly; a shortened model paraphrase is replaced */
function verbatim(s: ToolSession, text: string) {
  const said = (s.request.match(/comment (?:that|saying|:)\s*(.+?)[.\s]*$/i) ?? [])[1];
  if (!said) return text;
  const k = (x: string) => x.toLowerCase().replace(/[^a-z0-9$.]/g, '');
  return !text || k(said).includes(k(text)) || k(text).includes(k(said).slice(0, 24)) ? said : text;
}
const COMMENT_TOOLS: SloaneTool[] = [
  { id: 'proposeFluxComment', domain: 'action', permission: 'FLUX_VIEW', risk: 'PROPOSE', objectTypes: ['FLUX', 'ACCOUNT', 'ACCOUNT_GROUP'],
    description: 'Prepare (not write) a comment on a Flux review line. With useLastExplanation=true, or no text, the comment is the grounded explanation Sloane just gave. The user confirms before anything is written.',
    params: [{ name: 'account', kind: 'account', required: false, description: 'flux line account group; default the account in focus' }, { name: 'period', kind: 'period', required: false, description: 'default context period' }, T('text', 'exact comment wording; leave empty to use the last explanation'), T('useLastExplanation', 'true to use the explanation just given'), afterP],
    outputs: 'ActionProposal (ADD_FLUX_COMMENT); refs proposalId',
    run(a, env) { const s = S(env), period = periodOf(a, s), account = fluxAccountOf(env, a, s);
      const text = a['text'] && a['useLastExplanation'] !== 'true' ? a['text'] : explanationFor(env, s, account, period);
      return proposalObject(env, propose(env, 'ADD_FLUX_COMMENT', { account, period, text: a['useLastExplanation'] === 'true' ? text : verbatim(s, text), source: 'SLOANE', groundedFigures: grounded(s) }, { dependsOn: depsOf(a), description: 'Adds one comment to the Flux line thread' })); } },
  { id: 'proposeFluxCommentUpdate', domain: 'action', permission: 'FLUX_VIEW', risk: 'PROPOSE', objectTypes: ['FLUX'],
    description: 'Prepare (not write) an edit to an existing Flux comment you authored.', params: [{ name: 'account', kind: 'account', required: false, description: 'flux line' }, { name: 'period', kind: 'period', required: false, description: 'period' }, T('commentId', 'comment id; default the latest comment in context'), T('text', 'new wording', true)],
    outputs: 'ActionProposal (UPDATE_FLUX_COMMENT)',
    run(a, env) { const s = S(env); return proposalObject(env, propose(env, 'UPDATE_FLUX_COMMENT', { account: fluxAccountOf(env, a, s), period: periodOf(a, s), commentId: a['commentId'] || s.lastRefs['commentId'] || '', text: a['text'] })); } },
  { id: 'proposeReconciliationComment', domain: 'action', permission: 'RECON_VIEW', risk: 'PROPOSE', objectTypes: ['RECONCILIATION'],
    description: 'Prepare (not write) a comment on a reconciliation. Pass the user\'s wording verbatim in text. target is a reconciliation id or name; default the reconciliation in focus. Korvyn resolves or asks which reconciliation.',
    params: [T('target', 'reconciliation id or name'), { name: 'period', kind: 'period', required: false, description: 'period' }, T('text', 'the comment wording, verbatim', true), afterP],
    outputs: 'ActionProposal (ADD_RECONCILIATION_COMMENT); refs proposalId',
    run(a, env) { const s = S(env); return proposalObject(env, propose(env, 'ADD_RECONCILIATION_COMMENT', { target: recTargetOf(a, s), period: periodOf(a, s), text: verbatim(s, a['text'] ?? ''), groundedFigures: grounded(s) }, { dependsOn: depsOf(a) })); } },
  { id: 'proposeReconciliationCommentUpdate', domain: 'action', permission: 'RECON_VIEW', risk: 'PROPOSE', objectTypes: ['RECONCILIATION'],
    description: 'Prepare (not write) an edit to an existing reconciliation comment you authored.', params: [T('target', 'reconciliation id or name'), { name: 'period', kind: 'period', required: false, description: 'period' }, T('commentId', 'comment id; default the latest in context'), T('text', 'new wording', true)],
    outputs: 'ActionProposal (UPDATE_RECONCILIATION_COMMENT)',
    run(a, env) { const s = S(env); return proposalObject(env, propose(env, 'UPDATE_RECONCILIATION_COMMENT', { target: recTargetOf(a, s), period: periodOf(a, s), commentId: a['commentId'] || s.lastRefs['commentId'] || '', text: a['text'] })); } },
];

/* ================================================================================================
   SUPPORT, ISSUES, REVIEWERS, PACKAGES
   ================================================================================================ */
const WORK_TOOLS: SloaneTool[] = [
  { id: 'proposeSupportAttachment', domain: 'action', permission: 'EVIDENCE_VIEW', risk: 'PROPOSE', objectTypes: ['EVIDENCE', 'RECONCILIATION', 'FLUX'],
    description: 'Prepare (not write) attaching evidence references from a population (default: the population in context) to a reconciliation or Flux line. kinds: INVOICE, PURCHASE_ORDER, CONTRACT, APPROVAL (comma-separated; "the support" means all four). To attach a support package being created in the same plan, set afterProposal to that package proposal.',
    params: [T('target', 'reconciliation id or name (or empty for the Flux line in focus when targetType=FLUX)'), T('targetType', 'RECONCILIATION | FLUX (default RECONCILIATION)'), { name: 'account', kind: 'account', required: false, description: 'Flux line when targetType=FLUX' }, { name: 'period', kind: 'period', required: false, description: 'period' }, { name: 'populationId', kind: 'populationId', required: false, description: 'default the population in context' }, T('kinds', 'evidence kinds'), afterP],
    outputs: 'ActionProposal (ATTACH_SUPPORT); refs proposalId',
    run(a, env) { const s = S(env), type = (a['targetType'] || 'RECONCILIATION').toUpperCase();
      const dep = a['afterProposal'] ? s.engine.view(a['afterProposal']) : null;
      return proposalObject(env, propose(env, 'ATTACH_SUPPORT', { targetType: type === 'FLUX' ? 'FLUX' : 'RECONCILIATION', target: type === 'FLUX' ? '' : recTargetOf(a, s), account: fluxAccountOf(env, a, s), period: periodOf(a, s), populationId: a['populationId'] || s.populationId || '', kinds: a['kinds'] || 'INVOICE', ...(dep?.type === 'CREATE_SUPPORT_PACKAGE' ? { fromPackage: dep.id } : {}) }, { dependsOn: depsOf(a) })); } },
  { id: 'proposeIssue', domain: 'action', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: ['GOVERNED_LEDGER', 'RECONCILIATION', 'FLUX'],
    description: 'Prepare (not create) an issue. amount in USD millions as the user stated it. Links default to the objects in the current analysis. Korvyn checks the amount against the governed figures in context and warns if none match.',
    params: [T('title', 'short issue title'), T('description', 'what is wrong'), T('amount', 'USD millions, e.g. 7.2'), T('owner', 'owner name; default unassigned'), afterP],
    outputs: 'ActionProposal (CREATE_ISSUE); refs proposalId',
    run(a, env) { const s = S(env), amt = a['amount'] ? Number(String(a['amount']).replace(/[^0-9.\-]/g, '')) * 1e6 : null;
      const known = s.lastObjects.flatMap((o) => o.facts.filter((f) => typeof f.value === 'number' && Math.abs(f.value as number) >= 1000).map((f) => f.value as number));
      const links = [...(s.focus ? [{ ref: `${s.focus.kind}:${s.focus.id}`, label: s.focus.name }] : []), { ref: `period:${s.period}`, label: periodLabel(s.period) }, ...(s.lastRefs['reconciliationId'] ? [{ ref: `recon:${s.lastRefs['reconciliationId']}`, label: env.controls.recDef(s.lastRefs['reconciliationId'])?.name ?? s.lastRefs['reconciliationId'] }] : []), ...(s.populationId ? [{ ref: `population:${s.populationId}`, label: `Population ${s.populationId}` }] : [])];
      const title = a['title'] || `${s.focus?.name ?? 'Issue'}${amt !== null ? ` — ${$(amt)}` : ''}`;
      return proposalObject(env, propose(env, 'CREATE_ISSUE', { title, description: a['description'] || s.request, amountUsd: amt, owner: a['owner'] || '', period: s.period, links, knownFigures: known }, { dependsOn: depsOf(a) })); } },
  { id: 'proposeReviewerAssignment', domain: 'action', permission: 'RECON_VIEW', risk: 'PROPOSE', objectTypes: ['RECONCILIATION', 'FLUX'],
    description: 'Prepare (not make) a reviewer assignment on a reconciliation or Flux line. reviewer is a person\'s name as the user said it; Korvyn resolves authorized reviewers, applies segregation of duties, and asks when more than one matches.',
    params: [T('reviewer', 'person name', true), T('target', 'reconciliation id or name'), T('targetType', 'RECONCILIATION | FLUX'), { name: 'account', kind: 'account', required: false, description: 'Flux line when targetType=FLUX' }, { name: 'period', kind: 'period', required: false, description: 'period' }, afterP],
    outputs: 'ActionProposal (ASSIGN_REVIEWER); refs proposalId',
    run(a, env) { const s = S(env), type = (a['targetType'] || (a['target'] || s.focus?.kind === 'reconciliation' || s.lastRefs['reconciliationId'] ? 'RECONCILIATION' : 'FLUX')).toUpperCase();
      return proposalObject(env, propose(env, 'ASSIGN_REVIEWER', { reviewer: a['reviewer'], targetType: type === 'FLUX' ? 'FLUX' : 'RECONCILIATION', target: recTargetOf(a, s), account: fluxAccountOf(env, a, s), period: periodOf(a, s) }, { dependsOn: depsOf(a) })); } },
  { id: 'proposeSupportPackage', domain: 'action', permission: 'EVIDENCE_VIEW', risk: 'PROPOSE', objectTypes: ['SUPPORT_PACKAGE', 'EVIDENCE'],
    description: 'Prepare (not create) a support package DRAFT for a population (default: the population in context): transactions, invoice, PO, contract and approval references, and missing evidence. Documents are not fetched; the package is not finalized.',
    params: [{ name: 'populationId', kind: 'populationId', required: false, description: 'default the population in context' }, T('name', 'package name'), afterP],
    outputs: 'ActionProposal (CREATE_SUPPORT_PACKAGE); refs proposalId',
    run(a, env) { const s = S(env), pop = a['populationId'] || s.populationId || '', def = env.gl.population(pop), q = def ? env.gl.query(def, env.visible) : null;
      const ap = q ? q.all.filter((l) => l.vendor && l.account !== '20100') : [];
      const summary = q ? [{ label: 'Population', value: `${pop} · ${q.rowCount} transactions · net ${$(q.netUsd)}` }, { label: 'Invoice references', value: String(ap.filter((l) => l.invoiceRef).length) }, { label: 'PO / contract references', value: `${new Set(ap.map((l) => l.poRef).filter(Boolean)).size} / ${new Set(ap.map((l) => l.contractRef).filter(Boolean)).size}` }, { label: 'Approval references', value: String(ap.filter((l) => l.approvalRef).length) }, { label: 'Missing evidence', value: `${ap.filter((l) => !l.invoiceRef || (l.approvalRequired && !l.approvalRef)).length} line(s)` }, { label: 'Status', value: 'Draft — documents not fetched, not finalized' }] : [];
      return proposalObject(env, propose(env, 'CREATE_SUPPORT_PACKAGE', { name: a['name'] || `Support package · ${def?.label ?? pop}`, populationId: pop, summary }, { dependsOn: depsOf(a), populations: pop ? [pop] : [] })); } },
  { id: 'prepareGovernedAction', domain: 'action', permission: 'RECON_VIEW', risk: 'PROPOSE', objectTypes: ['RECONCILIATION', 'CLOSE', 'REPORT'],
    description: 'For approve reconciliation, certify close, publish report, change mapping, override a governed dimension, or write to the ERP: PREPARE only. Korvyn classifies these as governed actions, shows readiness and the governed route, and never executes them. actionType: RECONCILIATION_APPROVAL | CLOSE_CERTIFICATION | REPORT_PUBLICATION | MAPPING_CHANGE | DIMENSION_OVERRIDE | ERP_WRITE_BACK.',
    params: [T('actionType', 'governed action type', true), T('target', 'target id or name'), { name: 'period', kind: 'period', required: false, description: 'period' }],
    outputs: 'ActionProposal (GOVERNED_ACTION, not executable); refs proposalId',
    run(a, env) { const s = S(env);
      /* the model's label is only a label: the class comes from policy, and an unknown label is governed */
      const type = a['actionType']!.toUpperCase().replace(/[^A-Z_]/g, '');
      const p = propose(env, type, { target: recTargetOf(a, s), period: periodOf(a, s) });
      if (ActionGovernanceEngine.classify(type) !== 'GOVERNED_ACTION') { p.validationStatus = 'INVALID'; p.validation.errors.push(`${type} is not a governed action; use its own proposal.`); p.executable = false; p.status = 'CANCELLED'; }
      return proposalObject(env, p); } },
  { id: 'reviseActionProposal', domain: 'action', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: [],
    description: 'Change an open proposal in place when the user corrects it ("No, attach those to the Mechanical reconciliation", "make the reviewer Lin", "change the title"). proposalId defaults to the most recent open proposal. Never creates a duplicate.',
    params: [T('proposalId', 'open proposal id; default the latest'), T('target', 'new target'), T('text', 'new wording'), T('reviewer', 'new reviewer'), T('title', 'new title'), T('name', 'new name')],
    outputs: 'ActionProposal (revised); refs proposalId',
    run(a, env) { const s = S(env), open = s.engine.openOf(s.id), id = a['proposalId'] && s.engine.view(a['proposalId']) ? a['proposalId'] : open.at(-1)?.id;
      if (!id) return { warnings: ['No open proposal to change.'], object: obj(env, { type: 'ActionProposal', title: 'No open proposal', status: 'UNAVAILABLE', unavailable: { capability: 'Revise proposal', reason: 'There is no open proposal in this conversation to change.' }, facts: [{ key: 'unavailable', label: 'Revise', value: 'none open', display: 'There is no open proposal in this conversation to change.' }] }) };
      const changes: Record<string, unknown> = {};
      for (const k of ['target', 'text', 'reviewer', 'title', 'name']) if (a[k]) changes[k] = a[k];
      const p = s.engine.revise(id, changes, env.actor)!;
      return proposalObject(env, p); } },
];

/* ================================================================================================
   SAVED ANALYSIS AND INVESTIGATIONS
   ================================================================================================ */
const SAVE_TOOLS: SloaneTool[] = [
  { id: 'proposeSaveAnalysis', domain: 'action', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: [],
    description: 'Prepare (not save) the current analysis as a reusable Korvyn object: its tool definition, period, scope, dimensions, filters, financial objects and populations.',
    params: [T('name', 'analysis name')], outputs: 'ActionProposal (SAVE_ANALYSIS); refs proposalId',
    run(a, env) { const s = S(env), calls = s.lastToolCalls;
      const dims = [...new Set(calls.map((c) => c.args['dimension']).filter(Boolean))], filters = calls.flatMap((c) => ['vendor', 'project', 'account', 'entity', 'costCenter'].filter((k) => c.args[k]).map((k) => ({ dimension: k, value: c.args[k]! })));
      const definition = { toolCalls: calls, period: s.period, scope: s.scope, dimensions: dims, filters, financialObjectIds: s.lastObjects.map((o) => `${s.traceId}:${o.id}`), objectTitles: s.lastObjects.map((o) => o.title), populationIds: s.populationId ? [s.populationId] : [], investigationId: s.investigationId };
      if (!calls.length) return proposalObject(env, propose(env, 'SAVE_ANALYSIS', { name: a['name'] || '', definition, summary: [{ label: 'Analysis', value: 'nothing has been analysed in this conversation yet' }] }));
      return proposalObject(env, propose(env, 'SAVE_ANALYSIS', { name: a['name'] || s.lastObjects[0]?.title || 'Saved analysis', definition, summary: [{ label: 'Objects', value: s.lastObjects.map((o) => o.title).join(' · ') }, { label: 'Tools', value: calls.map((c) => c.tool).join(', ') }, { label: 'Period · scope', value: `${periodLabel(s.period)} · ${s.scope}` }, ...(filters.length ? [{ label: 'Filters', value: filters.map((f) => `${f.dimension}=${f.value}`).join(', ') }] : []), ...(s.populationId ? [{ label: 'Population', value: s.populationId }] : [])] })); } },
  { id: 'proposeSaveInvestigation', domain: 'action', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: [],
    description: 'Prepare (not save) saving — and optionally sharing — this investigation: objective, context, findings, financial objects, evidence, actions, timeline and artifacts. shareWith is a comma-separated list of names; Korvyn checks each recipient may see the contents.',
    params: [T('title', 'investigation title'), T('shareWith', 'names, comma-separated')], outputs: 'ActionProposal (CREATE_SHARED_INVESTIGATION); refs proposalId',
    run(a, env) { const s = S(env), inv = s.investigation, actions = s.engine.ofSession(s.id).filter((p) => p.status === 'COMPLETED');
      const share = (a['shareWith'] || '').split(',').map((x) => x.trim()).filter(Boolean);
      const definition = { objective: inv.objective, context: { period: s.period, scope: s.scope, focus: s.focus }, findings: inv.findings, financialObjects: inv.objects, populations: inv.populationIds, evidence: actions.flatMap((p) => p.evidenceIds), actions: actions.map((p) => ({ id: p.id, type: p.type, target: p.targetLabel, result: p.result })), timeline: inv.timeline, artifacts: actions.filter((p) => /REPORT|EXCEL|PACKAGE|ANALYSIS/.test(p.type)).map((p) => p.result) };
      const needsAudit = inv.objects.some((o) => /Audit|PBC|Selections/.test(o.type)) ? ['AUDIT_VIEW'] : [];
      return proposalObject(env, propose(env, 'CREATE_SHARED_INVESTIGATION', { name: a['title'] || inv.objective.slice(0, 80) || 'Investigation', definition, shareWith: share, requiredPermissions: needsAudit,
        summary: [{ label: 'Objective', value: inv.objective }, { label: 'Findings', value: String(inv.findings.length) }, { label: 'Financial objects', value: String(inv.objects.length) }, { label: 'Completed actions', value: String(actions.length) }, { label: 'Timeline events', value: String(inv.timeline.length) }] })); } },
];

/* ================================================================================================
   REPORT DRAFTS — built and modified in the session, saved by confirmation
   ================================================================================================ */
const DIM_WORDS: Record<string, DimensionKey> = { vendor: 'vendor', vendors: 'vendor', project: 'project', projects: 'project', entity: 'entity', entities: 'entity', account: 'account', 'account group': 'accountGroup', 'cost center': 'costCenter', costcenter: 'costCenter', department: 'costCenter', property: 'property', currency: 'currency', month: 'period', period: 'period' };
const dimOf = (w: string | undefined) => (w ? DIM_WORDS[w.toLowerCase().trim()] ?? ((['vendor', 'project', 'entity', 'account', 'accountGroup', 'costCenter', 'property', 'currency', 'period'] as string[]).includes(w) ? (w as DimensionKey) : null) : null);
interface ReportDef { name: string; rows: DimensionKey[]; filters: Record<string, string>; periodStart: string; periodEnd: string; spendOnly: boolean; minAbsAmountM: number | null; comparison: { periodStart: string; periodEnd: string; status: 'AVAILABLE' | 'UNAVAILABLE'; note: string } | null; measure: string; notes: string[] }
function reportRows(env: ToolEnv, d: ReportDef, start: string, end: string) {
  const f = { periodStart: start, periodEnd: end, ...(d.filters['vendor'] ? { vendor: d.filters['vendor'] } : {}), ...(d.filters['project'] ? { project: d.filters['project'] } : {}), ...(d.filters['account'] ? { accounts: [d.filters['account']] } : {}), ...(d.filters['entity'] ? { entities: [d.filters['entity']] } : {}) };
  return env.gl.lines.filter(env.gl.match(f, env.visible)).filter((l) => !d.spendOnly || (l.vendor && l.account !== '20100'));
}
function reportPreview(env: ToolEnv, draft: { id: string; definition: Record<string, unknown> }): ToolResult {
  const d = draft.definition as unknown as ReportDef;
  const cur = reportRows(env, d, d.periodStart, d.periodEnd), cmp = d.comparison?.status === 'AVAILABLE' ? reportRows(env, d, d.comparison.periodStart, d.comparison.periodEnd) : null;
  const [d1, d2] = d.rows;
  const top = d1 ? env.gl.aggregate(cur, d1).filter((g) => d.minAbsAmountM === null || Math.abs(g.current) >= d.minAbsAmountM * 1e6) : [];
  const cmpBy = (rows: GLine[] | null, dim: DimensionKey, key: string | null, dim2?: DimensionKey, key2?: string | null) => (rows ? rows.filter((l) => env.gl.dimOf(l, dim) === key && (!dim2 || env.gl.dimOf(l, dim2) === key2)).reduce((s, l) => s + l.usd, 0) : null);
  const cols = ['Amount (USD)', ...(d.comparison ? [d.comparison.status === 'AVAILABLE' ? `${periodLabel(d.comparison.periodStart)}–${periodLabel(d.comparison.periodEnd)}` : 'Comparison (unavailable)'] : []), 'Lines'];
  const rows: FinancialObject['table']['rows'] = [];
  for (const g of top.slice(0, 20)) {
    const c = d.comparison ? [cmp ? $(cmpBy(cmp, d1!, g.key)!) : 'n/a'] : [];
    rows.push({ label: g.label, level: 0, kind: d2 ? 'subtotal' : 'line', cells: [$(g.current), ...c, String(g.lines)] });
    if (d2) for (const h of env.gl.aggregate(cur.filter((l) => env.gl.dimOf(l, d1!) === g.key), d2).slice(0, 8)) rows.push({ label: h.label, level: 1, kind: 'line', cells: [$(h.current), ...(d.comparison ? [cmp ? $(cmpBy(cmp, d1!, g.key, d2, h.key)!) : 'n/a'] : []), String(h.lines)] });
  }
  const tot = top.reduce((s, g) => s + g.current, 0);
  rows.push({ label: 'Total', level: 0, kind: 'total', cells: [$(tot), ...(d.comparison ? [cmp ? $(cmp.reduce((s, l) => s + l.usd, 0)) : 'n/a'] : []), String(cur.length)] });
  const pl = `${periodLabel(d.periodStart)}–${periodLabel(d.periodEnd)}`;
  return { warnings: d.notes, object: obj(env, {
    type: 'ReportDraft', title: `${d.name} (draft preview)`, periods: [d.periodStart, d.periodEnd], periodLabel: pl, unit: 'USD millions',
    table: { columns: cols, rows },
    facts: [{ key: 'rows', label: 'Rows', value: d.rows.join(' → ') || 'none', display: d.rows.join(' → ') || 'none' }, { key: 'total', label: `Total ${pl}`, value: tot, display: $(tot) }, { key: 'groups', label: 'Top-level groups', value: top.length, display: String(top.length) }, ...top.slice(0, 5).flatMap((g, i) => [{ key: `group${i + 1}.label`, label: `Group ${i + 1}`, value: g.label, display: g.label }, { key: `group${i + 1}.amount`, label: g.label, value: g.current, display: $(g.current) }]), ...(d.comparison ? [{ key: 'comparison', label: 'Comparison', value: d.comparison.note, display: d.comparison.note }] : []), { key: 'status', label: 'Status', value: 'Draft — not saved, not published', display: 'Draft — not saved, not published' }],
    refs: { reportDraftId: draft.id }, draft: { kind: 'REPORT', id: draft.id, definition: draft.definition },
    provenance: { source: 'Report draft over the governed ledger (session draft — not saved)', snapshotId: SNAPSHOT_ID, journalLines: cur.length, fxRateSetId: 'FXR-2026-AVG-REP-1', eliminations: null, declaredInputs: d.spendOnly ? ['APX-2026-REP-1'] : [] },
  }) };
}
function comparisonFor(env: ToolEnv, d: ReportDef, spec: string) {
  const governed = env.gl.periods();
  const yr = (p: string, k: number) => `${Number(p.slice(0, 4)) + k}${p.slice(4)}`;
  const m = spec.toUpperCase().match(/FY\s?'?(\d{2,4})/);
  let start: string, end: string;
  if (m) { const y = m[1]!.length === 2 ? `20${m[1]}` : m[1]!; start = `${y}${d.periodStart.slice(4)}`; end = `${y}${d.periodEnd.slice(4)}`; }
  else { start = yr(d.periodStart, -1); end = yr(d.periodEnd, -1); }
  const ok = governed.includes(start) && governed.includes(end);
  return { periodStart: start, periodEnd: end, status: ok ? 'AVAILABLE' as const : 'UNAVAILABLE' as const, note: ok ? `Compared to ${periodLabel(start)}–${periodLabel(end)}` : `${periodLabel(start)}–${periodLabel(end)} is not in the governed ledger (governed ${periodLabel(governed[0]!)}–${periodLabel(governed.at(-1)!)}); the comparison is recorded in the definition and its column is empty` };
}
const REPORT_TOOLS: SloaneTool[] = [
  { id: 'buildReportDraft', domain: 'build', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: ['REPORT'],
    description: 'Build a report DRAFT in this conversation and preview it (nothing is saved): rows are dimensions in order (vendor, project, entity, account, costCenter, property, currency, period), with optional vendor/project/account/entity filters, a month range, and a comparison (e.g. FY25). "spend" reports read AP spend lines.',
    params: [T('name', 'report name'), T('rows', 'dimensions in order, comma-separated', true), { name: 'periodStart', kind: 'period', required: false, description: 'first month' }, { name: 'periodEnd', kind: 'period', required: false, description: 'last month' }, { name: 'vendor', kind: 'vendor', required: false, description: 'vendor filter' }, { name: 'project', kind: 'project', required: false, description: 'project filter' }, { name: 'account', kind: 'account', required: false, description: 'account filter' }, { name: 'entity', kind: 'entity', required: false, description: 'entity filter' }, T('spend', 'true for AP spend'), T('comparison', 'e.g. FY25 or PRIOR_YEAR'), T('minAbsAmount', 'USD millions threshold on the first row dimension')],
    outputs: 'ReportDraft preview; refs reportDraftId',
    run(a, env) { const s = S(env), ps = env.gl.periods();
      const rows = (a['rows'] || '').split(/,|→|>|\bthen\b/).map((x) => dimOf(x)).filter((x): x is DimensionKey => !!x);
      const filters: Record<string, string> = {}; for (const k of ['vendor', 'project', 'account', 'entity']) if (a[k]) filters[k] = a[k]!;
      const d: ReportDef = { name: a['name'] || [filters['vendor'], 'spend by', rows.join(' and ')].filter(Boolean).join(' '), rows, filters, periodStart: a['periodStart'] || ps[0]!, periodEnd: a['periodEnd'] || ps.at(-1)!, spendOnly: a['spend'] === 'true' || !!filters['vendor'] || rows.includes('vendor'), minAbsAmountM: a['minAbsAmount'] ? Number(a['minAbsAmount']) : null, comparison: null, measure: 'Period activity, USD at the monthly average rate', notes: [] };
      if (a['comparison']) { d.comparison = comparisonFor(env, d, a['comparison']); if (d.comparison.status === 'UNAVAILABLE') d.notes.push(d.comparison.note); }
      if (d.spendOnly) d.notes.push('Spend is AP-sourced lines from the representative AP extract (APX-2026-REP-1); the AP liability offset is excluded.');
      s.drafts.report = { id: s.drafts.report?.id ?? `RDRAFT-${s.planId.slice(-6)}`, definition: d as unknown as Record<string, unknown> };
      return reportPreview(env, s.drafts.report); } },
  { id: 'modifyReportDraft', domain: 'build', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: ['REPORT'],
    description: 'Modify the report draft in this conversation in place: addDimension (optionally first=true), removeDimension, moveFirst, minAbsAmount (USD millions on the first dimension, "vendors over $5M"), comparison (FY25 / PRIOR_YEAR / none), name, vendor/project filters. Preview only; nothing is saved.',
    params: [T('addDimension', 'dimension to add'), T('first', 'true to put the added dimension first'), T('removeDimension', 'dimension to remove'), T('moveFirst', 'dimension to move first'), T('minAbsAmount', 'USD millions threshold'), T('comparison', 'FY25 | PRIOR_YEAR | none'), T('name', 'report name'), { name: 'vendor', kind: 'vendor', required: false, description: 'vendor filter' }, { name: 'project', kind: 'project', required: false, description: 'project filter' }],
    outputs: 'ReportDraft preview; refs reportDraftId',
    run(a, env) { const s = S(env);
      if (!s.drafts.report) return { warnings: ['There is no report draft in this conversation yet.'], object: obj(env, { type: 'ReportDraft', title: 'No report draft', status: 'UNAVAILABLE', unavailable: { capability: 'Modify report', reason: 'There is no report draft in this conversation yet — ask Sloane to build one first.' }, facts: [{ key: 'unavailable', label: 'Report draft', value: 'none', display: 'There is no report draft in this conversation yet.' }] }) };
      const d = s.drafts.report.definition as unknown as ReportDef;
      const add = dimOf(a['addDimension']), rem = dimOf(a['removeDimension']), mv = dimOf(a['moveFirst']);
      if (add && !d.rows.includes(add)) { if (a['first'] === 'true') d.rows.unshift(add); else d.rows.push(add); }
      if (a['removeDimension'] && !rem) d.notes.push(`“${a['removeDimension']}” is not a dimension of this report.`);
      if (rem) { if (d.rows.includes(rem)) d.rows = d.rows.filter((x) => x !== rem); else d.notes.push(`${a['removeDimension']} is not in the report; nothing removed.`); }
      if (mv && d.rows.includes(mv)) d.rows = [mv, ...d.rows.filter((x) => x !== mv)];
      if (a['minAbsAmount']) d.minAbsAmountM = Number(a['minAbsAmount']);
      if (a['comparison']) { if (/^none$/i.test(a['comparison'])) d.comparison = null; else { d.comparison = comparisonFor(env, d, a['comparison']); if (d.comparison.status === 'UNAVAILABLE' && !d.notes.includes(d.comparison.note)) d.notes.push(d.comparison.note); } }
      if (a['name']) d.name = a['name'];
      for (const k of ['vendor', 'project']) if (a[k]) d.filters[k] = a[k]!;
      if (/department/i.test(a['addDimension'] ?? '') || /department/i.test(a['removeDimension'] ?? '')) d.notes.push('Department is the cost-center dimension in the governed ledger.');
      return reportPreview(env, s.drafts.report); } },
  { id: 'proposeSaveReport', domain: 'action', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: ['REPORT'],
    description: 'Prepare (not save) saving the report draft in this conversation as a Korvyn saved report definition (draft status, not published).', params: [T('name', 'report name')],
    outputs: 'ActionProposal (CREATE_SHARED_REPORT); refs proposalId',
    run(a, env) { const s = S(env), dr = s.drafts.report; const d = dr?.definition as unknown as ReportDef | undefined;
      return proposalObject(env, propose(env, 'CREATE_SHARED_REPORT', { name: a['name'] || d?.name || '', definition: dr ? { ...dr.definition, draftId: dr.id, status: 'DRAFT' } : {}, summary: d ? [{ label: 'Rows', value: d.rows.join(' → ') }, { label: 'Period', value: `${periodLabel(d.periodStart)}–${periodLabel(d.periodEnd)}` }, { label: 'Filters', value: Object.entries(d.filters).map(([k, v]) => `${k}=${v}`).join(', ') || 'none' }, ...(d.minAbsAmountM !== null ? [{ label: 'Threshold', value: `${d.rows[0]} over $${d.minAbsAmountM}M` }] : []), ...(d.comparison ? [{ label: 'Comparison', value: d.comparison.note }] : [])] : [{ label: 'Report', value: 'no draft in this conversation' }] })); } },
];

/* ================================================================================================
   EXCEL ARTIFACT DEFINITIONS — built and modified in the session, saved by confirmation
   ================================================================================================ */
const XL_COLS: Record<string, string> = { postingDate: 'Posting date', journal: 'Journal', entity: 'Entity', account: 'Account', accountName: 'Account name', description: 'Description', sourceVendor: 'Source vendor (AP extract)', project: 'Project', costCenter: 'Cost center', currency: 'Currency', amountLocal: 'Amount (functional)', amountUsd: 'Amount (USD)', erpSource: 'ERP source', invoiceRef: 'Invoice reference' };
const XL_ALIAS: Record<string, string> = { vendor: 'sourceVendor', 'source vendor': 'sourceVendor', department: 'costCenter', 'cost center': 'costCenter', amount: 'amountUsd', 'usd amount': 'amountUsd', 'posting date': 'postingDate', date: 'postingDate', 'account name': 'accountName', erp: 'erpSource', invoice: 'invoiceRef', 'invoice reference': 'invoiceRef' };
const colKey = (w: string | undefined) => { if (!w) return null; const t = w.toLowerCase().trim(); return XL_COLS[w] ? w : XL_ALIAS[t] ?? Object.keys(XL_COLS).find((k) => k.toLowerCase() === t || XL_COLS[k]!.toLowerCase() === t) ?? null; };
const cell = (env: ToolEnv, l: GLine, k: string) => ({ postingDate: l.postingDate, journal: l.journalId, entity: l.entity, account: l.account, accountName: l.accountName, description: l.description, sourceVendor: l.vendor ?? '', project: l.project ?? '', costCenter: l.costCenter ?? '', currency: l.currency, amountLocal: money(l.local, l.currency), amountUsd: $(l.usd), erpSource: `${l.connector} ${l.externalId}`, invoiceRef: l.invoiceRef ?? '' } as Record<string, string>)[k] ?? '';
function excelPreview(env: ToolEnv, draft: { id: string; definition: Record<string, unknown> }): ToolResult {
  const d = draft.definition as { name: string; sheets: { name: string; source: Record<string, string>; columns?: string[]; sort?: string }[]; notes: string[] };
  const gl = d.sheets[0]!, def = env.gl.population(gl.source['populationId']!);
  const q = def ? env.gl.query({ ...def, sort: (gl.sort as never) ?? def.sort }, env.visible, { limit: 5 }) : null;
  const cols = gl.columns ?? [];
  return { warnings: d.notes, object: obj(env, {
    type: 'ExcelArtifactDraft', title: `${d.name} (Excel artifact — draft)`, unit: 'workbook definition',
    table: { columns: cols.map((c) => XL_COLS[c] ?? c), rows: (q?.page ?? []).map((l) => ({ label: l.key, level: 1, kind: 'line' as const, cells: cols.map((c) => cell(env, l, c)) })) },
    facts: [{ key: 'sheets', label: 'Sheets', value: d.sheets.map((s) => s.name).join(', '), display: d.sheets.map((s) => s.name).join(', ') }, { key: 'columns', label: 'GL columns', value: cols.length, display: String(cols.length) }, { key: 'rows', label: 'Rows in the connected population', value: q?.rowCount ?? 0, display: String(q?.rowCount ?? 0) }, { key: 'sort', label: 'Sort', value: gl.sort ?? def?.sort ?? 'amount_desc', display: gl.sort ?? def?.sort ?? 'amount_desc' }, { key: 'status', label: 'Status', value: 'Definition draft — not saved; no file generated', display: 'Definition draft — not saved; no file generated' }],
    refs: { excelDraftId: draft.id, ...(def ? { populationId: def.id } : {}) }, draft: { kind: 'EXCEL', id: draft.id, definition: draft.definition },
  }) };
}
const EXCEL_TOOLS: SloaneTool[] = [
  { id: 'buildExcelArtifact', domain: 'build', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: ['EXCEL_ARTIFACT', 'GOVERNED_LEDGER'],
    description: 'Build an Excel artifact DEFINITION for a GL population (default: the population in context) and preview it. Structure only: sheets, columns, sort; the population stays server-side and no file is generated.',
    params: [{ name: 'populationId', kind: 'populationId', required: false, description: 'default the population in context' }, T('name', 'workbook name')], outputs: 'ExcelArtifactDraft; refs excelDraftId',
    run(a, env) { const s = S(env), pop = a['populationId'] || s.populationId || '', def = env.gl.population(pop);
      if (!def) return { warnings: ['No population in context.'], object: obj(env, { type: 'ExcelArtifactDraft', title: 'No population', status: 'UNAVAILABLE', unavailable: { capability: 'Excel artifact', reason: 'There is no governed population in this conversation to put in Excel — ask for the GL first.' }, facts: [{ key: 'unavailable', label: 'Excel', value: 'none', display: 'There is no governed population in this conversation to put in Excel.' }] }) };
      s.drafts.excel = { id: s.drafts.excel?.id ?? `XDRAFT-${s.planId.slice(-6)}`, definition: { name: a['name'] || `${def.label}.xlsx`, sheets: [{ name: 'GL', source: { kind: 'GOVERNED_POPULATION', populationId: def.id }, columns: ['postingDate', 'journal', 'entity', 'account', 'accountName', 'costCenter', 'project', 'currency', 'amountUsd', 'erpSource'], sort: def.sort }], notes: [] } };
      return excelPreview(env, s.drafts.excel); } },
  { id: 'modifyExcelArtifact', domain: 'build', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: ['EXCEL_ARTIFACT'],
    description: 'Modify the Excel artifact definition in this conversation: addColumn, removeColumn (e.g. "source vendor", "department"), sort (amount_desc | amount_asc | date_asc | date_desc), addSheet ("TB" adds a trial balance by entity tab), name.',
    params: [T('addColumn', 'column'), T('removeColumn', 'column'), T('sort', 'sort order'), T('addSheet', 'TB'), T('name', 'workbook name')], outputs: 'ExcelArtifactDraft; refs excelDraftId',
    run(a, env) { const s = S(env);
      if (!s.drafts.excel) return { warnings: ['No Excel artifact draft yet.'], object: obj(env, { type: 'ExcelArtifactDraft', title: 'No Excel draft', status: 'UNAVAILABLE', unavailable: { capability: 'Modify Excel artifact', reason: 'There is no Excel artifact draft in this conversation yet.' }, facts: [{ key: 'unavailable', label: 'Excel', value: 'none', display: 'There is no Excel artifact draft in this conversation yet.' }] }) };
      const d = s.drafts.excel.definition as { name: string; sheets: { name: string; source: Record<string, string>; columns?: string[]; sort?: string }[]; notes: string[] };
      const gl = d.sheets[0]!, cols = gl.columns!;
      const add = colKey(a['addColumn']), rem = colKey(a['removeColumn']);
      if (a['addColumn'] && !add) d.notes.push(`“${a['addColumn']}” is not a governed GL column.`);
      if (add && !cols.includes(add)) cols.push(add);
      if (rem) { if (cols.includes(rem)) gl.columns = cols.filter((c) => c !== rem); else d.notes.push(`${XL_COLS[rem]} is not in the workbook; nothing removed.`); }
      if (/department/i.test(`${a['addColumn'] ?? ''}${a['removeColumn'] ?? ''}`)) d.notes.push('Department is the cost-center column in the governed ledger.');
      if (/vendor/i.test(a['addColumn'] ?? '')) d.notes.push('The server-side ledger carries one vendor value per line, from the representative AP extract; it is labelled source vendor.');
      if (a['sort'] && ['amount_desc', 'amount_asc', 'date_asc', 'date_desc'].includes(a['sort'])) gl.sort = a['sort'];
      else if (a['sort']) gl.sort = /small|asc/i.test(a['sort']) ? 'amount_asc' : /date|old/i.test(a['sort']) ? 'date_asc' : 'amount_desc';
      if (a['addSheet'] && /tb|trial/i.test(a['addSheet']) && !d.sheets.some((x) => x.name === 'Trial balance')) d.sheets.push({ name: 'Trial balance', source: { kind: 'TRIAL_BALANCE_BY_ENTITY', period: s.period } });
      if (a['name']) d.name = a['name'];
      return excelPreview(env, s.drafts.excel); } },
  { id: 'proposeSaveExcelArtifact', domain: 'action', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: ['EXCEL_ARTIFACT'],
    description: 'Prepare (not save) saving the Excel artifact definition in this conversation as a Korvyn artifact.', params: [T('name', 'workbook name')], outputs: 'ActionProposal (CREATE_EXCEL_ARTIFACT)',
    run(a, env) { const s = S(env), dr = s.drafts.excel, d = dr?.definition as { name: string; sheets: { name: string; columns?: string[] }[] } | undefined;
      return proposalObject(env, propose(env, 'CREATE_EXCEL_ARTIFACT', { name: a['name'] || d?.name || '', definition: dr ? { ...dr.definition, draftId: dr.id } : {}, summary: d ? [{ label: 'Sheets', value: d.sheets.map((x) => x.name).join(', ') }, { label: 'GL columns', value: (d.sheets[0]!.columns ?? []).map((c) => XL_COLS[c] ?? c).join(', ') }, { label: 'File', value: 'Definition only — generated server-side on export' }] : [{ label: 'Workbook', value: 'no draft in this conversation' }] })); } },
];

registerTools([...COMMENT_TOOLS, ...WORK_TOOLS, ...SAVE_TOOLS, ...REPORT_TOOLS, ...EXCEL_TOOLS]);
export const ACTION_TOOLS_LOADED = true;
