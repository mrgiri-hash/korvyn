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
import type { ArtifactDefinition, SheetKind } from './artifacts/model.js';
import { columnFor } from './artifacts/model.js';
import { amountIn, sheetsIn } from './artifacts/refine.js';

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
   EXCEL ARTIFACTS (Phase 4A) — governed deliverables. Build, refine and preview change the workbook DEFINITION held in
   the conversation (the orchestrator persists each change as a new artifact version); generation is a proposal the
   user confirms, executed server-side by the Artifact Engine. No tool here writes a file.
   ================================================================================================ */
type XDraft = { id: string; definition: Record<string, unknown>; change?: string; dirty?: boolean; version?: number };
const draftOf = (s: ToolSession) => s.drafts.excel as XDraft | null;
function artifactEngine(env: ToolEnv) { if (!env.artifacts) throw new Error('the Artifact Engine is not available in this context'); return env.artifacts; }
/** the workbook in the conversation: the session draft, or the artifact the last answer produced */
function currentDraft(env: ToolEnv, s: ToolSession): XDraft | null {
  const d = draftOf(s); if (d) return d;
  const id = s.lastRefs['artifactId'];
  const a = id ? artifactEngine(env).get(id) : null;
  if (!a) return null;
  s.drafts.excel = { id: a.id, definition: a.definition as unknown as Record<string, unknown>, version: a.version } as XDraft;
  return draftOf(s);
}
function noWorkbook(env: ToolEnv): ToolResult {
  return { warnings: ['No workbook in this conversation yet.'], object: obj(env, { type: 'ExcelWorkbookPreview', title: 'No workbook yet', status: 'UNAVAILABLE', unavailable: { capability: 'Workbook', reason: 'There is no workbook in this conversation yet — ask for one first, e.g. “Give me the FY26 governed GL”.' }, facts: [{ key: 'unavailable', label: 'Workbook', value: 'none', display: 'There is no workbook in this conversation yet.' }] }) };
}
/** the WORKBOOK PREVIEW object: the same composition the file is rendered from, with representative striped rows */
export function workbookObject(env: ToolEnv, draft: XDraft, extra: { changes?: string[]; notes?: string[] } = {}): ToolResult {
  const eng = artifactEngine(env), d = draft.definition as unknown as ArtifactDefinition;
  const denied = eng.authorize(env.actor, d);
  if (denied.length) return { warnings: denied, object: obj(env, { type: 'ExcelWorkbookPreview', title: `${d.name} — not permitted`, status: 'UNAVAILABLE', unavailable: { capability: 'Workbook', reason: denied.join(' ') }, facts: [{ key: 'unavailable', label: 'Workbook', value: 'denied', display: denied.join(' ') }] }) };
  const m = eng.compose(env.actor, d, draft.version ?? 1, draft.id || 'DRAFT');
  /* a kept workbook reports its REAL status (STALE when what it pinned has moved); an unsaved one is a draft */
  const view = draft.id && !draft.dirty ? eng.view(env.actor, draft.id) : null;
  const pv = eng.previewOf(m, { id: draft.id || 'DRAFT', version: draft.version ?? 1, status: view?.status ?? 'DRAFT', name: d.name });
  if (view?.stale) pv.warnings.unshift(`STALE: the governed data behind v${view.version} has changed (${view.staleReasons.join('; ')}). Refresh to create v${view.version + 1} before generating.`);
  const t = pv.tieOut;
  const notes = [...(extra.notes ?? []), ...pv.warnings];
  return { warnings: notes, object: obj(env, {
    type: 'ExcelWorkbookPreview', title: `${d.name} — workbook preview`, status: t && t.status !== 'TIED' && d.sheets.some((x) => x.kind === 'TIEOUT') ? 'PARTIAL' : 'AVAILABLE',
    periods: [d.periodStart, d.periodEnd], periodLabel: pv.range, scope: { id: d.scopeId, name: pv.scope }, unit: 'workbook',
    table: { columns: ['Rows', 'Columns'], rows: pv.sheets.map((sh) => ({ label: sh.name, level: 1, kind: 'line' as const, cells: [sh.rowCount.toLocaleString('en-US'), String(sh.columns.length)] })) },
    facts: [
      { key: 'workbook', label: 'Workbook', value: d.name, display: d.name },
      { key: 'artifactStatus', label: 'Status', value: pv.status, display: pv.status },
      { key: 'fileName', label: 'File', value: pv.fileName, display: pv.fileName },
      { key: 'sheets', label: 'Tabs', value: pv.sheets.map((x) => x.name).join(', '), display: pv.sheets.map((x) => x.name).join(', ') },
      ...pv.sheets.filter((x) => x.kind === 'GL').map((x, i) => ({ key: `glRows${i ? i + 1 : ''}`, label: `${x.name} lines`, value: x.rowCount, display: x.rowCount.toLocaleString('en-US') })),
      /* a tie-out is a claim only a Tie-Out tab makes; without one the workbook says it has none */
      ...(t && d.sheets.some((x) => x.kind === 'TIEOUT') ? [{ key: 'tieOutStatus', label: 'Tie-out', value: t.status, display: t.status.replace(/_/g, ' ') }, { key: 'tieOutDifference', label: 'Tie-out difference (USD)', value: t.differenceUsd, display: t.differenceUsd.toFixed(2) }]
        : [{ key: 'tieOutStatus', label: 'Tie-out', value: 'none', display: 'no Tie-Out tab in this workbook' }]),
      { key: 'auditReady', label: 'Audit-ready', value: pv.auditReady ? 'yes' : 'no', display: pv.auditReady ? 'yes' : 'no' },
      ...(extra.changes ?? []).map((c, i) => ({ key: `change${i + 1}`, label: 'Change', value: c, display: c })),
      ...(extra.notes ?? []).map((c, i) => ({ key: `note${i + 1}`, label: 'Note', value: c, display: c })),
      ...(pv.recommendCsv ? [{ key: 'recommendCsv', label: 'Size', value: pv.recommendCsv, display: pv.recommendCsv }] : []),
      ...(draft.id ? [{ key: 'saved', label: 'Saved', value: `${draft.id} v${draft.version ?? 1}`, display: `Kept as ${draft.id} v${draft.version ?? 1} — every change is a new version` }] : []),
    ],
    provenance: { source: 'Workbook definition over governed Korvyn objects — preview of the same composition the file is generated from', snapshotId: m.dataVersion, journalLines: m.populations.reduce((a, p) => a + p.rowCount, 0), fxRateSetId: 'FXR-2026-CLS-REP-1', eliminations: m.tieOut ? 'Intercompany eliminated at Corporate Consolidated' : null, declaredInputs: [] },
    refs: { excelDraftId: draft.id || 'DRAFT', ...(draft.id ? { artifactId: draft.id } : {}), ...(m.populations[0] ? { populationId: m.populations[0].populationId } : {}) },
    draft: { kind: 'EXCEL', id: draft.id || 'DRAFT', definition: draft.definition }, workbook: { ...pv, changes: extra.changes ?? [], notes },
  }) };
}
const SHEET_ARG = (v: string | undefined) => (v ?? '').split(/[,;]| and /).map((x) => sheetsIn(` ${x.toLowerCase()} `)[0]).filter((x): x is SheetKind => !!x);
const EXCEL_TOOLS: SloaneTool[] = [
  { id: 'buildExcelArtifact', domain: 'build', permission: 'ARTIFACT_CREATE', risk: 'PROPOSE', objectTypes: ['EXCEL_ARTIFACT', 'GOVERNED_LEDGER', 'TRIAL_BALANCE'],
    description: 'Build a governed Excel WORKBOOK (a deliverable, e.g. "give me the FY26 governed GL", "the FY26 audit GL package", "all Siemens FY26 transactions over $1M with the related reconciliations and Flux explanations on separate tabs"). Tabs: GL (default), TB, TIEOUT (ties back to the ERP), RECONCILIATIONS, FLUX, SUMMARY. Returns a striped WORKBOOK PREVIEW; no file is generated until the user asks to download.',
    params: [{ name: 'periodStart', kind: 'period', required: false, description: 'first month; default the fiscal year start' }, { name: 'periodEnd', kind: 'period', required: false, description: 'last month; default the latest governed month' }, { name: 'scope', kind: 'scope', required: false, description: 'GROUP (Corporate Consolidated) or an entity; default context' },
      { name: 'vendor', kind: 'vendor', required: false, description: 'only this vendor’s lines' }, { name: 'project', kind: 'project', required: false, description: 'only this project' }, { name: 'account', kind: 'account', required: false, description: 'only this account / group' },
      T('minAbsAmount', 'only lines over this amount, e.g. "1M" or "500K"'), T('sheets', 'extra tabs: TB, TIEOUT, RECONCILIATIONS, FLUX, SUMMARY (comma-separated)'), T('template', 'AUDIT_GL_PACKAGE for GL + TB + Tie-Out, else GL_EXTRACT'), T('name', 'workbook name')],
    outputs: 'ExcelWorkbookPreview; refs artifactId, excelDraftId',
    run(a, env) { const s = S(env), eng = artifactEngine(env), req = s.request.toLowerCase();
      const words = `${req} ${a['sheets'] ?? ''}`;
      const sheets = [...new Set([...SHEET_ARG(a['sheets']), ...sheetsIn(` ${req} `).filter((k) => k !== 'FLUX' || /\bflux\b/.test(req))])];
      const template = /audit|package/.test(a['template'] ?? '') || /\baudit\b|\bpackage\b/.test(req) ? 'AUDIT_GL_PACKAGE' : 'GL_EXTRACT';
      /* the user's words are authoritative; a bare model number is USD millions (the convention every Sloane tool uses) */
      const argAmt = (v: string | undefined) => { if (!v) return null; const n = amountIn(`over ${v}`); return n !== null && /^[\s$]*[\d.,]+\s*$/.test(v) && n < 1000 ? n * 1e6 : n; };
      const amt = amountIn(req) ?? argAmt(a['minAbsAmount']);
      const vendor = a['vendor'] || env.gl.vendors().find((v) => req.includes(v.toLowerCase().split(' ')[0]!)) || null;
      const fy = req.match(/\bfy\s?'?(\d{2,4})\b/), year = fy ? (fy[1]!.length === 2 ? `20${fy[1]}` : fy[1]!) : null;
      /* "this GL in Excel": the governed population in context is the workbook's GL */
      const pop = /\b(this|these|that|those)\b/.test(req) && s.populationId ? env.gl.population(s.populationId) : null;
      const f = pop?.filter ?? {};
      const d = eng.newDefinition({ template, periodStart: a['periodStart'] || f.periodStart || (year ? `${year}-01` : undefined), periodEnd: a['periodEnd'] || f.periodEnd || (year ? `${year}-12` : s.period),
        scopeId: a['scope'] || (f.entities?.length === 1 ? f.entities[0] : s.scope), vendor: vendor ?? f.vendor ?? null, project: a['project'] || f.project || null, accounts: a['account'] ? [a['account']] : f.accounts ?? [], minAbsUsd: amt ?? f.minAbsUsd ?? null, sheets,
        /* a name only when the user gave one; otherwise Korvyn's deterministic name (and so a clean file name) */
        name: (/\b(call|name|title)\b/i.test(s.request) && a['name']) || (pop ? pop.label.replace(/ · .*$/, '') : null) });
      void words;
      s.drafts.excel = { id: '', definition: d as unknown as Record<string, unknown>, change: 'Created', dirty: true, version: 1 } as XDraft;
      return workbookObject(env, draftOf(s)!, { changes: [`Built ${d.name}: ${d.sheets.map((x) => x.name).join(', ')}`] }); } },
  { id: 'modifyExcelArtifact', domain: 'build', permission: 'ARTIFACT_CREATE', risk: 'PROPOSE', objectTypes: ['EXCEL_ARTIFACT'],
    description: 'Refine the workbook in this conversation from the user’s words: add/remove/move GL columns ("add source vendor", "put project before vendor", "remove department"), sort ("largest first"), threshold ("only transactions over $500K"), tabs ("put the TB on another tab", "make sure it ties back to ERP", "add the related reconciliations", "add the Flux explanations", "remove the tie-out tab", "add a summary tab", "add entity to the TB"). Pass the user’s words verbatim in instruction. Changes the definition only — nothing is regenerated.',
    params: [T('instruction', 'the user’s words, verbatim'), T('addColumn', 'optional structured: a GL column'), T('removeColumn', 'optional structured: a GL column'), T('addSheet', 'optional structured: TB | TIEOUT | RECONCILIATIONS | FLUX | SUMMARY'), T('removeSheet', 'optional structured: a tab'), T('sort', 'optional structured: amount_desc | amount_asc | date_asc | date_desc'), T('minAbsAmount', 'optional structured: e.g. 500K')],
    outputs: 'ExcelWorkbookPreview; refs artifactId',
    run(a, env) { const s = S(env), eng = artifactEngine(env), dr = currentDraft(env, s);
      if (!dr) return noWorkbook(env);
      const structured = { addColumns: a['addColumn'] ? [columnFor(a['addColumn']) ?? a['addColumn']] : undefined, removeColumns: a['removeColumn'] ? [columnFor(a['removeColumn']) ?? a['removeColumn']] : undefined,
        addSheets: a['addSheet'] ? SHEET_ARG(a['addSheet']) : undefined, removeSheets: a['removeSheet'] ? SHEET_ARG(a['removeSheet']) : undefined,
        sort: ['amount_desc', 'amount_asc', 'date_asc', 'date_desc'].includes(a['sort'] ?? '') ? a['sort'] as never : undefined,
        minAbsUsd: a['minAbsAmount'] ? (() => { const n = amountIn(`over ${a['minAbsAmount']}`); return n !== null && /^[\s$]*[\d.,]+\s*$/.test(a['minAbsAmount']!) && n < 1000 ? n * 1e6 : n ?? undefined; })() : undefined };
      const r = eng.refine(dr.definition as unknown as ArtifactDefinition, a['instruction'] || s.request, structured);
      if (r.changed) s.drafts.excel = { ...dr, definition: r.definition as unknown as Record<string, unknown>, change: r.changes.join('; '), dirty: true } as XDraft;
      return workbookObject(env, draftOf(s)!, { changes: r.changes, notes: r.notes }); } },
  { id: 'previewExcelArtifact', domain: 'build', permission: 'GL_VIEW', risk: 'PROPOSE', objectTypes: ['EXCEL_ARTIFACT'],
    description: 'Show what the workbook in this conversation will look like ("show me what it will look like", "preview it"): tabs, row counts, striped representative rows, tie-out status.',
    params: [], outputs: 'ExcelWorkbookPreview; refs artifactId',
    run(_a, env) { const s = S(env), dr = currentDraft(env, s); return dr ? workbookObject(env, dr) : noWorkbook(env); } },
  { id: 'proposeGenerateExcelArtifact', domain: 'action', permission: 'ARTIFACT_CREATE', risk: 'PROPOSE', objectTypes: ['EXCEL_ARTIFACT'],
    description: 'Prepare (not run) generating the real file for the workbook in this conversation ("download it", "generate the Excel", "give me the CSV"). format xlsx (default) or csv. Korvyn validates permissions, populations, staleness and the tie-out; the user confirms; the file is generated server-side.',
    params: [T('format', 'xlsx | csv')], outputs: 'ActionProposal (GENERATE_EXCEL_ARTIFACT); refs proposalId',
    run(a, env) { const s = S(env), dr = currentDraft(env, s);
      if (!dr) return noWorkbook(env);
      const fmt = /csv/i.test(a['format'] ?? '') || /\bcsv\b/i.test(s.request) ? 'csv' : 'xlsx';
      return proposalObject(env, propose(env, 'GENERATE_EXCEL_ARTIFACT', { artifactId: dr.id, format: fmt, name: (dr.definition as { name?: string }).name ?? '' }, { description: 'Generates the workbook file server-side from the governed definition' })); } },
  { id: 'proposeRefreshExcelArtifact', domain: 'action', permission: 'ARTIFACT_CREATE', risk: 'PROPOSE', objectTypes: ['EXCEL_ARTIFACT'],
    description: 'Prepare (not run) refreshing a STALE workbook against the current governed data ("refresh it") — a new version of the same definition.',
    params: [], outputs: 'ActionProposal (REFRESH_EXCEL_ARTIFACT)',
    run(_a, env) { const s = S(env), dr = currentDraft(env, s); if (!dr?.id) return noWorkbook(env); return proposalObject(env, propose(env, 'REFRESH_EXCEL_ARTIFACT', { artifactId: dr.id })); } },
];

registerTools([...COMMENT_TOOLS, ...WORK_TOOLS, ...SAVE_TOOLS, ...REPORT_TOOLS, ...EXCEL_TOOLS]);
export const ACTION_TOOLS_LOADED = true;
