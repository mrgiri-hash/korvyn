/**
 * SEMANTIC TOOLS (Phase 8A) — governed READ tools over the Financial Graph. Every answer is a traversal of the ACTOR's
 * snapshot (permission-filtered before anything is read), and every figure on a result is one the owning service
 * derived — the tools arrange, they do not compute financial truth. Registered like every other tool, so the planner
 * sees them only when the actor is permitted, and every call is authorized again at execution.
 *
 * `semanticPlan()` routes the cross-domain questions of §18 deterministically; anything else keeps its existing route.
 */
import { BASIS, SNAPSHOT_ID, money, periodLabel } from '../financials.js';
import { type FinancialObject, type SloaneTool, type TableRow, type ToolEnv, type ToolResult, registerTools } from '../tools.js';
import type { SemanticObject } from './model.js';
import { type FinancialGraph, type Resolution, financialGraph } from './graph.js';
import { resolvePeriods } from './time.js';

const $ = (v: unknown) => (typeof v === 'number' ? money(v, 'USD') : '—');
const G = (env: ToolEnv): FinancialGraph => financialGraph({ data: env.data, gl: env.gl, controls: env.controls, artifacts: env.artifacts ?? null });
const SRC = 'Korvyn Financial Graph — relationships read from the governed ledger, control service, work store and directories';
function obj(env: ToolEnv, o: Partial<FinancialObject> & Pick<FinancialObject, 'type' | 'title'>): FinancialObject {
  const sid = env.visible === 'ALL' ? 'GROUP' : [...env.visible][0]!;
  return { id: env.objectId, status: 'AVAILABLE', scope: { id: sid, name: env.data.scope(sid)?.name ?? sid }, periods: [], periodLabel: '', currency: 'USD', basis: BASIS, unit: 'USD millions',
    table: { columns: [], rows: [] }, facts: [], provenance: { source: SRC, snapshotId: SNAPSHOT_ID, journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] },
    population: null, refs: {}, focus: null, unavailable: null, governed: true, ...o };
}
const row = (label: string, cells: string[], ref?: string, level = 1, kind: TableRow['kind'] = 'line'): TableRow => ({ label, level, kind, cells, ...(ref ? { ref } : {}) });
const fact = (key: string, label: string, value: number | string, display?: string) => ({ key, label, value, display: display ?? String(value) });
const period = (env: ToolEnv, a: Record<string, string>) => (a['period'] && env.gl.periods().includes(a['period']) ? a['period'] : env.data.workingPeriod());
const FOCUS: Partial<Record<string, string>> = { Account: 'account', Reconciliation: 'reconciliation', FluxItem: 'fluxItem', Report: 'report', Vendor: 'vendor', Project: 'project', LegalEntity: 'entity', Close: 'close', AuditRequest: 'pbc' };
const focusOf = (o: SemanticObject) => { const k = FOCUS[o.type]; return k ? { kind: k, id: o.id.slice(o.id.indexOf(':') + 1), name: o.label } : null; };
const refsOf = (o: SemanticObject): Record<string, string> => o.type === 'Account' ? { account: String(o.attrs['code']) } : o.type === 'Reconciliation' ? { reconciliationId: String(o.attrs['reconciliationId']) } : o.type === 'FluxItem' ? { account: String(o.attrs['account']) } : {};

/** the object a tool is about: an explicit ref, else words to resolve, else the conversation's focus */
function subject(env: ToolEnv, a: Record<string, string>, p: string): Resolution | null {
  const g = G(env), ref = a['objectRef'];
  if (ref) {
    const norm = ref.startsWith('reconciliation:') ? `recon:${ref.slice(15)}` : ref.startsWith('fluxItem:') ? `flux:${ref.slice(9)}` : ref;
    const o = g.node(norm, env.actor, p) ?? g.node(`account:${ref}`, env.actor, p) ?? g.node(`recon:${ref}`, env.actor, p);
    if (o) return { status: 'RESOLVED', object: o, alsoKnownAs: [], term: ref };
    return g.resolve(ref, env.actor, { period: p });
  }
  if (a['text']) return g.resolve(a['text'], env.actor, { period: p });
  const f = env.session?.focus;
  if (f) { const id = f.kind === 'account' ? `account:${f.id}` : f.kind === 'reconciliation' ? `recon:${f.id}` : f.kind === 'fluxItem' ? `flux:${f.id}` : `${f.kind}:${f.id}`; const o = g.node(id, env.actor, p); if (o) return { status: 'RESOLVED', object: o, alsoKnownAs: [], term: f.name }; }
  return null;
}
/** a resolution that is not a single object becomes an honest result, never a guess */
function unresolved(env: ToolEnv, what: string, r: Resolution | null): ToolResult {
  if (!r) return { warnings: [], object: obj(env, { type: 'SemanticResolution', title: `Which ${what}?`, status: 'PARTIAL', facts: [fact('question', 'Needed', `Name the ${what} — nothing in the conversation says which one.`)] }) };
  if (r.status === 'AMBIGUOUS') return { warnings: [], object: obj(env, { type: 'SemanticResolution', title: `“${r.term}” — which one?`, status: 'PARTIAL',
    table: { columns: ['Type', 'What distinguishes it'], rows: r.candidates.map((c) => row(c.object.label, [c.object.type, c.detail], c.object.id)) },
    facts: [fact('question', 'Question', r.question), fact('candidates', 'Candidates', r.candidates.length)] }) };
  if (r.status === 'MULTIPLE') return { warnings: [], object: obj(env, { type: 'SemanticResolution', title: `“${r.term}” names ${r.objects.length} objects`, status: 'PARTIAL', table: { columns: ['Type', 'Governed'], rows: r.objects.map((o) => row(o.label, [o.type, o.governed === false ? 'No — not held on this server' : 'Yes'], o.id)) }, facts: [fact('objects', 'Objects', r.objects.length)] }) };
  return { warnings: [], object: obj(env, { type: 'SemanticResolution', title: `No ${what} found`, status: 'UNAVAILABLE', unavailable: { capability: what, reason: r.status === 'NOT_FOUND' ? r.note : '' }, facts: [fact('notFound', 'Not found', r.status === 'NOT_FOUND' ? r.note : '')] }) };
}
const personCell = (o: SemanticObject | null) => (o ? `${o.label}${o.attrs['title'] ? ` (${o.attrs['title']})` : ''}` : 'Not assigned');

const T = (t: Omit<SloaneTool, 'domain' | 'risk'> & { risk?: SloaneTool['risk'] }): SloaneTool => ({ domain: 'semantic', risk: 'READ', ...t });
const P = { name: 'period', kind: 'period' as const, required: false, description: 'month, YYYY-MM; defaults to context' };
const REF = { name: 'objectRef', kind: 'objectRef' as const, required: false, description: 'semantic id (account:15000, fsline:FS-CIP, recon:REC-MDH-15000, project:SV-PH2, person:user:lchen …); defaults to the conversation’s focus' };
const TXT = { name: 'text', kind: 'text' as const, required: false, description: 'the words that name the object, when no id is known' };

export const SEMANTIC_TOOLS: SloaneTool[] = [
  T({ id: 'resolveFinancialObject', description: 'Resolve words to ONE governed object (entity, project, vendor, account, statement line, reconciliation, person, period …) or state the ambiguity with what distinguishes each candidate. Distinguishes legal entity / project / fund / scope / consolidation node.',
    objectTypes: ['SemanticResolution'], params: [{ ...TXT, required: true }, P], outputs: 'the object, or candidates', permission: 'FINANCIALS_VIEW',
    run(a, env) {
      const p = period(env, a), g = G(env), r = g.resolve((a['text'] ?? ''), env.actor, { period: p });
      if (r.status !== 'RESOLVED') return unresolved(env, 'object', r);
      const o = r.object, rels = g.relationships(o.id, env.actor, { period: p, limit: 200 });
      /* a long list of one relationship (a close's 76 tasks) is one row with its count, not 76 rows */
      const groups = new Map<string, { rel: string; type: string; others: SemanticObject[] }>();
      for (const x of rels) { const out = x.from.id === o.id, other = out ? x.to : x.from, k = `${x.rel}|${out}|${other.type}`; const gr = groups.get(k) ?? { rel: out ? x.rel : `${x.rel} (inverse)`, type: other.type, others: [] }; gr.others.push(other); groups.set(k, gr); }
      const W = (t: string) => (['User', 'Role'].includes(t) ? 0 : ['LegalEntity', 'ConsolidationNode', 'Project', 'Property', 'Account', 'FinancialStatementLine', 'Period', 'Quarter', 'FiscalYear'].includes(t) ? 1 : ['CloseTask', 'TrialBalance'].includes(t) ? 3 : 2);
      const grows = [...groups.values()].sort((a, b) => W(a.type) - W(b.type) || a.others.length - b.others.length).slice(0, 14).map((gr) => gr.others.length > 3
        ? row(gr.rel, [`${gr.others.length} × ${gr.type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`, `e.g. ${gr.others.slice(0, 2).map((x) => x.label).join('; ')}`])
        : gr.others.map((x) => row(gr.rel, [x.label, x.type], x.id))).flat();
      const status = [o.attrs['status'] && fact('status', 'Status', String(o.attrs['status'])), typeof o.attrs['readinessPct'] === 'number' && fact('readiness', 'Readiness', `${o.attrs['readinessPct']}%`),
        Array.isArray(o.attrs['governedMonths']) && fact('governedMonths', 'Governed months', (o.attrs['governedMonths'] as string[]).length ? `${periodLabel((o.attrs['governedMonths'] as string[])[0]!)}–${periodLabel((o.attrs['governedMonths'] as string[]).at(-1)!)}` : 'none'),
        o.attrs['note'] && fact('note', 'Note', String(o.attrs['note']))].filter(Boolean) as ReturnType<typeof fact>[];
      return { warnings: o.governed === false ? [String(o.attrs['note'] ?? 'Not held on this server.')] : [], object: obj(env, { type: 'SemanticObject', title: `${o.label} · ${o.type.replace(/([a-z])([A-Z])/g, '$1 $2')}`,
        table: { columns: ['Relationship', 'Object', 'Type'], rows: grows },
        facts: [fact('object', 'Resolved to', o.label), fact('type', 'Type', o.type), fact('what', 'What it is', g.describe(o)), ...status, fact('source', 'Owned by', o.source), ...(r.alsoKnownAs.length ? [fact('aka', 'Also presented as', r.alsoKnownAs.map((x) => x.label).join(', '))] : []), ...(o.governed === false ? [fact('governed', 'Governed', 'No — not held on this server')] : [])],
        refs: { semanticId: o.id, ...refsOf(o) }, focus: focusOf(o) }) };
    } }),
  T({ id: 'getObjectRelationships', description: 'The governed relationships of an object (who prepares and reviews it, what it belongs to, what reconciles, supports, uses or contains it), from the actor’s permitted graph.',
    objectTypes: ['SemanticRelationships'], params: [REF, TXT, P], outputs: 'relationships', permission: 'FINANCIALS_VIEW',
    run(a, env) {
      const p = period(env, a), r = subject(env, a, p); if (r?.status !== 'RESOLVED') return unresolved(env, 'object', r);
      const o = r.object, rels = G(env).relationships(o.id, env.actor, { depth: 1, limit: 40, period: p });
      return { warnings: [], object: obj(env, { type: 'SemanticRelationships', title: `Relationships · ${o.label}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['From', 'Relationship', 'To', 'Type'], rows: rels.map((x) => row(x.from.label, [x.rel, x.to.label, (x.from.id === o.id ? x.to : x.from).type], x.from.id === o.id ? x.to.id : x.from.id)) },
        facts: [fact('object', 'Object', o.label), fact('relationships', 'Relationships', rels.length)], refs: { semanticId: o.id, ...refsOf(o) }, focus: focusOf(o) }) };
    } }),
  T({ id: 'getResponsibleUsers', description: 'Who prepares, reviews, owns or approves an object and the work beneath it (a flux review, a close, an entity, an account), with directory authority and segregation-of-duties notes.',
    objectTypes: ['ResponsibleUsers'], params: [REF, TXT, P], outputs: 'people and their responsibility', permission: 'FINANCIALS_VIEW',
    run(a, env) {
      const p = period(env, a), r = subject(env, a, p); if (r?.status !== 'RESOLVED') return unresolved(env, 'object', r);
      const o = r.object, people = G(env).responsible(o.id, env.actor, p);
      const notes = [...new Set(people.flatMap((x) => x.notes))];
      return { warnings: notes, object: obj(env, { type: 'ResponsibleUsers', title: `Who is responsible · ${o.label}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Responsibility', 'Person', 'On'], rows: people.map((x) => row(x.relation, [personCell(x.person), x.via.label], x.via.id)) },
        facts: [fact('object', 'Object', o.label), fact('people', 'People named', new Set(people.map((x) => x.person.id)).size), ...people.slice(0, 6).map((x, i) => fact(`r${i + 1}`, `${x.relation.toLowerCase()} · ${x.via.label}`, x.person.label)), ...notes.slice(0, 3).map((n, i) => fact(`note${i + 1}`, 'Note', n))],
        refs: { semanticId: o.id }, focus: focusOf(o) }) };
    } }),
  T({ id: 'getObjectTracePath', description: 'Trace a figure: financial statement → statement line → account → governed ledger population → transaction → ERP source → evidence references (or up from a transaction). Structured steps, never prose.',
    objectTypes: ['TracePath'], params: [REF, TXT, P], outputs: 'trace steps', permission: 'FINANCIALS_VIEW',
    run(a, env) {
      const p = period(env, a), ref = a['objectRef'];
      const r = ref?.startsWith('txn:') ? null : subject(env, a, p);
      if (!ref?.startsWith('txn:') && r?.status !== 'RESOLVED') return unresolved(env, 'figure', r);
      const id = ref?.startsWith('txn:') ? ref : (r as Extract<Resolution, { status: 'RESOLVED' }>).object.id;
      const { steps, notes } = G(env).trace(id, env.actor, p);
      return { warnings: notes, object: obj(env, { type: 'TracePath', title: `Trace · ${steps[0]?.label ?? id}`, periods: [p], periodLabel: periodLabel(p), status: steps.length ? 'AVAILABLE' : 'UNAVAILABLE',
        table: { columns: ['Level', 'Detail'], rows: steps.map((s) => row(s.label, [s.level.replace(/([a-z])([A-Z])/g, '$1 $2'), s.detail], s.id)) },
        facts: [fact('steps', 'Trace steps', steps.length), ...steps.map((s, i) => fact(`step${i + 1}`, s.level, s.label)), ...notes.map((n, i) => fact(`note${i + 1}`, 'Note', n))],
        refs: Object.fromEntries(steps.map((s) => [s.level, s.id])) }) };
    } }),
  T({ id: 'getOpenReconciliationsByEntity', description: 'Which subsidiaries (legal entities with a parent) still have open reconciliations — workflow not approved — with their tie status; group-level reconciliations stated separately.',
    objectTypes: ['OpenReconciliationsByEntity'], params: [P], outputs: 'subsidiaries and their open reconciliations', permission: 'RECON_VIEW',
    run(a, env) {
      const p = period(env, a), q = G(env).openReconciliationsBySubsidiary(env.actor, p);
      const rows: TableRow[] = [];
      for (const r of q.rows) { rows.push(row(r.entity.label, [String(r.open.length), String(r.recs.length), ''], r.entity.id, 0, 'subtotal')); r.open.forEach((x) => rows.push(row(x.label, [String(x.attrs['status']), String(x.attrs['tieStatus']), x.attrs['differenceUsd'] === null ? '—' : $(x.attrs['differenceUsd'])], x.id, 1))); }
      const withOpen = q.rows.filter((r) => r.open.length);
      return { warnings: [], object: obj(env, { type: 'OpenReconciliationsByEntity', title: `Subsidiaries with open reconciliations · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Open / status', 'Total / tie', 'Difference'], rows },
        facts: [fact('subsidiaries', 'Subsidiaries in scope', q.rows.length), fact('withOpen', 'Subsidiaries with open reconciliations', withOpen.length), ...withOpen.map((r, i) => fact(`sub${i + 1}`, r.entity.label, `${r.open.length} of ${r.recs.length} open`)),
          fact('groupOpen', 'Group-level reconciliations open (not attributable to a subsidiary)', q.groupOpen.length)] }) };
    } }),
  T({ id: 'getPendingReviews', description: 'Who needs to review what: material flux items not yet approved (by reviewer, with what is outstanding), reconciliations in review and close tasks awaiting approval. domain = flux | recon | close | all.',
    objectTypes: ['PendingReviews'], params: [{ name: 'domain', kind: 'text', required: false, description: 'flux, recon, close or all' }, P], outputs: 'reviewers and their items', permission: 'FINANCIALS_VIEW',
    run(a, env) {
      const p = period(env, a), dom = (['flux', 'recon', 'close'].includes(a['domain'] ?? '') ? a['domain'] : 'all') as 'flux' | 'recon' | 'close' | 'all';
      const cap = { flux: 'FLUX_VIEW', recon: 'RECON_VIEW', close: 'CLOSE_VIEW' } as const;
      if (dom !== 'all' && !env.actor.permissions.includes(cap[dom])) return { warnings: [], object: obj(env, { type: 'PendingReviews', title: 'Pending reviews', status: 'UNAVAILABLE', unavailable: { capability: cap[dom], reason: `${env.actor.role} lacks ${cap[dom]}` } }) };
      /* the Flux review is a group-level review: a scoped user is told so, never told that "no one" needs to review it */
      const groupFlux = env.visible !== 'ALL' && (dom === 'flux' || dom === 'all');
      if (groupFlux && dom === 'flux') return { warnings: [], object: obj(env, { type: 'PendingReviews', title: 'Flux review', status: 'UNAVAILABLE', unavailable: { capability: 'Flux review', reason: 'The Flux review is a group-level review; your access is scoped to your entity, so its reviewers are not shown to you.' }, facts: [fact('scoped', 'Flux review', 'group-level — outside your access')] }) };
      const q = G(env).pendingReviews(env.actor, dom, p);
      const by = new Map<string, typeof q.items>();
      q.items.forEach((x) => { const k = x.reviewer?.label ?? 'No reviewer assigned'; by.set(k, [...(by.get(k) ?? []), x]); });
      const rows: TableRow[] = [];
      for (const [k, xs] of by) { rows.push(row(k, [String(xs.length), ''], xs[0]!.reviewer?.id, 0, 'subtotal')); xs.forEach((x) => rows.push(row(x.item.label, [x.domain, x.state], x.item.id, 1))); }
      const unassigned = by.get('No reviewer assigned')?.length ?? 0;
      return { warnings: [...(unassigned ? [`${unassigned} item${unassigned === 1 ? ' has' : 's have'} no reviewer assigned.`] : []), ...(groupFlux ? ['The group-level Flux review is outside your access and is not included.'] : [])], object: obj(env, { type: 'PendingReviews', title: `Who needs to review · ${dom === 'all' ? 'close work' : dom === 'flux' ? 'Flux' : dom === 'recon' ? 'reconciliations' : 'close tasks'} · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Items / domain', 'State'], rows },
        facts: [fact('items', 'Items awaiting review', q.items.length), fact('reviewers', 'Reviewers named', [...by.keys()].filter((k) => k !== 'No reviewer assigned').length), ...[...by].map(([k, xs], i) => fact(`rv${i + 1}`, k, `${xs.length} item${xs.length === 1 ? '' : 's'}`)), ...(unassigned ? [fact('unassigned', 'No reviewer assigned', unassigned)] : [])] }) };
    } }),
  T({ id: 'getOpenWorkForPerson', description: 'The open work a named person prepares, reviews or owns (reconciliations, flux items and explanations, close tasks, PBC requests, reports).',
    objectTypes: ['OpenWork'], params: [{ name: 'person', kind: 'text', required: true, description: 'a person’s name, initial form or semantic id' }, P], outputs: 'open work', permission: 'CLOSE_VIEW',
    run(a, env) {
      const p = period(env, a), q = G(env).openWorkFor((a['person'] ?? ''), env.actor, p);
      if (q.resolution.status !== 'RESOLVED') return unresolved(env, 'person', q.resolution);
      const who = q.resolution.object;
      return { warnings: [], object: obj(env, { type: 'OpenWork', title: `Open work · ${who.label}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['As', 'Type', 'Status'], rows: q.items.map((x) => row(x.item.label, [x.relation.replace('_BY', '').toLowerCase(), x.item.type, String(x.item.attrs['status'] ?? '—')], x.item.id)) },
        facts: [fact('person', 'Person', who.label), fact('open', 'Open items', q.items.length)], refs: { semanticId: who.id } }) };
    } }),
  T({ id: 'getMaterialFluxWithoutSupport', description: 'Material flux items with no support linked — neither to the flux item nor to its explanation — with explanation status and reviewer.',
    objectTypes: ['FluxWithoutSupport'], params: [P], outputs: 'flux items', permission: 'FLUX_VIEW',
    run(a, env) {
      const p = period(env, a), q = G(env).materialFluxWithoutSupport(env.actor, p);
      if (!env.data.scope('GROUP') || env.visible !== 'ALL') return { warnings: [], object: obj(env, { type: 'FluxWithoutSupport', title: 'Material flux without support', status: 'UNAVAILABLE', unavailable: { capability: 'Flux review', reason: 'The Flux review is a group-level review; your access is scoped to one entity.' } }) };
      return { warnings: [], object: obj(env, { type: 'FluxWithoutSupport', title: `Material flux items with no support · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Change', 'Explanation', 'Reviewer'], rows: q.items.map((x) => row(x.item.label, [$(x.item.attrs['changeUsd']), x.explanation ? String(x.explanation.attrs['status']) : 'none', String(x.item.attrs['reviewer'] ?? x.explanation?.attrs['reviewer'] ?? 'not assigned')], x.item.id)) },
        facts: [fact('count', 'Material items without support', q.items.length), ...q.items.slice(0, 6).map((x, i) => fact(`f${i + 1}`, x.item.label, $(x.item.attrs['changeUsd'])))] }) };
    } }),
  T({ id: 'getReportsUsingObject', description: 'Which saved reports (and the packages that contain them) use a financial statement line or account group, and on which report line.',
    objectTypes: ['ReportsUsing'], params: [REF, TXT, P], outputs: 'reports', permission: 'REPORT_VIEW',
    run(a, env) {
      const p = period(env, a), r = subject(env, a, p); if (r?.status !== 'RESOLVED') return unresolved(env, 'financial line', r);
      const q = G(env).reportsUsing(r.object.id, env.actor, p);
      return { warnings: [], object: obj(env, { type: 'ReportsUsing', title: `Reports that use ${r.object.label}`,
        table: { columns: ['Report line', 'Packages'], rows: q.reports.map((x) => row(x.report.label, [x.lines.join(', '), q.packages.filter((k) => k.report.id === x.report.id).map((k) => k.pkg.label).join(', ') || '—'], x.report.id)) },
        facts: [fact('object', 'Object', r.object.label), fact('reports', 'Reports', q.reports.length), ...q.reports.map((x, i) => fact(`rep${i + 1}`, x.report.label, x.lines.join(', ')))], refs: { semanticId: r.object.id } }) };
    } }),
  T({ id: 'getReconciliationForBalance', description: 'Which reconciliation(s) support an account’s or statement line’s balance, with status, tie and whether the server holds the balance.',
    objectTypes: ['ReconciliationsForBalance'], params: [REF, TXT, { name: 'entity', kind: 'entity', required: false, description: 'narrow to one entity' }, P], outputs: 'reconciliations', permission: 'RECON_VIEW',
    run(a, env) {
      const p = period(env, a), r = subject(env, a, p); if (r?.status !== 'RESOLVED') return unresolved(env, 'balance', r);
      const q = G(env).reconciliationsFor(r.object.id, env.actor, p, a['entity']);
      return { warnings: q.recs.length ? [] : [`No reconciliation supports ${r.object.label} in your authorized scope.`], object: obj(env, { type: 'ReconciliationsForBalance', title: `Reconciliations supporting ${r.object.label} · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Entity', 'Status', 'Tie', 'Difference', 'Support'], rows: q.recs.map((x) => row(x.label, [String(x.attrs['entity']), String(x.attrs['status']), String(x.attrs['tieStatus']), x.attrs['balanceAuthoritative'] ? $(x.attrs['differenceUsd']) : 'computed in module', x.attrs['supportComplete'] ? 'Complete' : 'Missing'], x.id)) },
        facts: [fact('object', 'Balance', r.object.label), fact('recs', 'Reconciliations', q.recs.length), ...q.recs.slice(0, 6).map((x, i) => fact(`rec${i + 1}`, x.label, `${x.attrs['status']} · ${x.attrs['tieStatus']}`))],
        refs: { semanticId: r.object.id, ...(q.recs.length === 1 ? { reconciliationId: String(q.recs[0]!.attrs['reconciliationId']) } : {}) }, focus: focusOf(r.object) }) };
    } }),
  T({ id: 'getLargestUnresolvedCloseIssue', description: 'The largest unresolved close issue (blocking issues first, then by amount) and who owns and reviews it.',
    objectTypes: ['CloseIssue'], params: [P], outputs: 'the issue and its owners', permission: 'CLOSE_VIEW',
    run(a, env) {
      const p = period(env, a), q = G(env).largestCloseIssue(env.actor, p);
      if (!q.issue) return { warnings: [], object: obj(env, { type: 'CloseIssue', title: `No unresolved close issue · ${periodLabel(p)}`, facts: [fact('issues', 'Unresolved issues', 0)] }) };
      const owners = q.people.filter((x) => x.relation === 'PREPARER' || x.relation === 'OWNER'), revs = q.people.filter((x) => x.relation === 'REVIEWER');
      return { warnings: [...new Set(q.people.flatMap((x) => x.notes))], object: obj(env, { type: 'CloseIssue', title: `Largest unresolved close issue · ${periodLabel(p)}`, periods: [p], periodLabel: periodLabel(p),
        table: { columns: ['Responsibility', 'Person'], rows: q.people.map((x) => row(x.via.label, [x.relation, personCell(x.person)], x.person.id)) },
        facts: [fact('issue', 'Issue', q.issue.label), fact('severity', 'Severity', String(q.issue.attrs['severity'])), fact('amount', 'Amount', (q.issue.attrs['amountUsd'] as number | null) ?? 'not measured', $(q.issue.attrs['amountUsd'])),
          fact('owner', 'Owner', owners.map((x) => x.person.label).join(', ') || (q.target?.type === 'SourceSystem' ? 'a source system — no person owns it' : 'no owner named')), fact('reviewer', 'Reviewer', revs.map((x) => x.person.label).join(', ') || '—'),
          fact('ranking', 'Ranked', `blocking issues first, then by amount — 1 of ${q.ranked}`)], refs: { semanticId: q.issue.id, ...(q.target ? refsOf(q.target) : {}) }, focus: q.target ? focusOf(q.target) : null }) };
    } }),
  T({ id: 'getSubjectTrialBalance', description: 'The trial balance for a named subject. A legal entity or the group gets its governed trial balance (use getTrialBalance / getTrialBalanceByEntity); a PROJECT, property, cost centre or vendor is not a legal entity and has no trial balance, so this states that and gives its dimension-filtered account-group balances instead.',
    objectTypes: ['SubjectBalances'], params: [{ ...TXT, required: true }, P], outputs: 'balances or the entity trial balance route', permission: 'TB_VIEW',
    run(a, env) {
      const p = period(env, a), g = G(env), r = g.resolve((a['text'] ?? ''), env.actor, { period: p });
      if (r.status !== 'RESOLVED') return unresolved(env, 'subject', r);
      const o = r.object;
      if (o.type === 'LegalEntity' || o.type === 'ConsolidationNode') return { warnings: [], object: obj(env, { type: 'SubjectBalances', title: `${o.label} is a ${o.type === 'LegalEntity' ? 'legal entity' : 'consolidation'} — use its governed trial balance`, facts: [fact('route', 'Governed trial balance', o.tool?.id ?? 'getTrialBalance'), fact('subject', 'Subject', o.label)], refs: { semanticId: o.id, ...(o.type === 'LegalEntity' ? { entity: String(o.attrs['entityId']) } : {}) }, focus: focusOf(o) }) };
      const b = g.subjectBalances(o, env.actor, p);
      if (!b) return unresolved(env, 'subject with balances', { status: 'NOT_FOUND', term: o.label, note: `${o.label} is a ${o.type}; it carries no balances.` });
      const total = b.rows.reduce((s, x) => s + x.amount, 0);
      return { warnings: [`${o.label} is a ${o.type.toLowerCase()}, not a legal entity, so it has no trial balance. These are the governed ledger lines that carry ${b.dimension} ${b.value}, by account group — they do not balance, because the offsetting entries (AP, cash) usually carry no ${b.dimension}.`],
        object: obj(env, { type: 'SubjectBalances', title: `${o.label} — balances by account group · ${periodLabel(p)} (not a trial balance)`, periods: [p], periodLabel: periodLabel(p),
          table: { columns: ['Section', 'Amount (USD)', 'Lines'], rows: b.rows.map((x) => row(`${x.group} ${x.name}`, [x.section === 'INCOME_STATEMENT' ? `${periodLabel(p)} activity` : `balance at ${periodLabel(p)}`, $(x.amount), String(x.lines)], `account:${x.group}`)) },
          facts: [fact('subject', 'Subject', o.label), fact('kind', 'What it is', g.describe(o)), fact('entities', 'Posts through', b.entities.join(', ') || '—'), fact('lines', 'Governed lines', b.lineCount), fact('net', 'Net of the lines shown', total, $(total)), fact('notTb', 'Trial balance', 'Not applicable — only a legal entity has one')],
          provenance: { source: SRC, snapshotId: SNAPSHOT_ID, journalLines: b.lineCount, fxRateSetId: 'FXR-2026-CLS-REP-1 (balances) · FXR-2026-AVG-REP-1 (activity)', eliminations: null, declaredInputs: [] }, refs: { semanticId: o.id }, focus: focusOf(o) }) };
    } }),
  T({ id: 'getPlanningComparison', description: 'Budget vs actual, forecast vs actual, scenarios: states which planning versions are governed on this server (actuals only) and never substitutes one for another.',
    objectTypes: ['PlanningComparison'], params: [{ ...TXT, required: true }], outputs: 'availability', permission: 'FINANCIALS_VIEW',
    run(a, env) {
      const s = G(env).snapshot(env.actor), t = (a['text'] ?? '').toLowerCase();
      const named = ['planning:BUDGET', 'planning:FORECAST', 'planning:SCENARIO', 'planning:VERSION', 'planning:ACTUAL'].map((i) => s.nodes.get(i)!).filter((o) => (o.aliases ?? []).some((al) => t.includes(al)) || t.includes(o.label.toLowerCase()));
      const missing = named.filter((o) => o.governed === false);
      return { warnings: missing.map((o) => String(o.attrs['note'])), object: obj(env, { type: 'PlanningComparison', title: missing.length ? `${missing.map((o) => o.label).join(' and ')} not available` : 'Actuals', status: missing.length ? 'UNAVAILABLE' : 'AVAILABLE',
        unavailable: missing.length ? { capability: 'Planning versions', reason: 'The governed book on this server holds actuals only; no budget, forecast or scenario is held, so no variance to plan can be stated.' } : null,
        table: { columns: ['Governed on this server'], rows: named.map((o) => row(o.label, [o.governed === false ? 'No' : 'Yes — the governed ledger'], o.id)) },
        facts: named.map((o, i) => fact(`v${i + 1}`, o.label, o.governed === false ? 'not held' : 'governed')) }) };
    } }),
  T({ id: 'getEntityHierarchy', description: 'The legal-entity ownership tree the actor may see: parent, ownership, consolidation method, functional currency, region and source system.',
    objectTypes: ['EntityHierarchy'], params: [], outputs: 'the tree', permission: 'FINANCIALS_VIEW',
    run(_a, env) {
      const h = G(env).hierarchy(env.actor);
      return { warnings: [], object: obj(env, { type: 'EntityHierarchy', title: 'Entity hierarchy',
        table: { columns: ['Entity', 'Owned by', 'Ownership', 'Method', 'Currency', 'Region'], rows: h.map((x) => row(x.entity.label, [String(x.entity.attrs['entityId']), x.visibleParent ? String(x.entity.attrs['parent']) : x.entity.attrs['parent'] ? 'outside your access' : '—', x.entity.attrs['ownershipPct'] === null ? '—' : `${Number(x.entity.attrs['ownershipPct']) * 100}%`, String(x.entity.attrs['consolidationMethod'] ?? '—'), String(x.entity.attrs['functionalCurrency']), x.region?.slice(7) ?? '—'], x.entity.id, x.depth)) },
        facts: [fact('entities', 'Entities', h.length), fact('top', 'Top of your tree', h[0]?.entity.label ?? '—')] }) };
    } }),
  T({ id: 'resolveFinancialPeriod', description: 'Resolve period words (June, Jun-26, current month, last month, quarter, last quarter, YTD, FY26, FY27, prior year, prior forecast, close period) against the tenant fiscal calendar, stating how much of each is governed.',
    objectTypes: ['PeriodResolution'], params: [{ ...TXT, required: true }], outputs: 'periods', permission: 'FINANCIALS_VIEW',
    run(a, env) {
      const rs = resolvePeriods((a['text'] ?? ''), { periods: env.gl.periods(), workingPeriod: env.data.workingPeriod() });
      return { warnings: rs.filter((r) => r.status !== 'GOVERNED' && r.note).map((r) => r.note), object: obj(env, { type: 'PeriodResolution', title: rs.length ? `Periods · ${rs.map((r) => r.label).join(', ')}` : 'No period named', status: rs.some((r) => r.status === 'AMBIGUOUS') ? 'PARTIAL' : 'AVAILABLE',
        table: { columns: ['Resolved to', 'From', 'To', 'Governed'], rows: rs.map((r) => row(`“${r.term}”`, [r.label, r.start ? periodLabel(r.start) : '—', r.end ? periodLabel(r.end) : '—', r.status], r.start ? `period:${r.start}` : undefined)) },
        facts: rs.map((r, i) => fact(`p${i + 1}`, `“${r.term}”`, `${r.label} (${r.status.toLowerCase().replace('_', ' ')})`)) }) };
    } }),
];
registerTools(SEMANTIC_TOOLS);
export const SEMANTIC_TOOL_IDS = new Set(SEMANTIC_TOOLS.map((t) => t.id));

/* ================================================================================================
   §18 ROUTING — deterministic plans for the cross-domain questions; null leaves the existing route in charge
   ================================================================================================ */
export interface SemanticPlanStep { tool: string; purpose: string; dependsOn: number[]; args: { name: string; value: string | null }[] }
export function semanticPlan(text: string, ctx: { period: { value: string }; focus: { value: { kind: string; id: string } | null }; lastRefs: Record<string, string> }): SemanticPlanStep[] | null {
  const t = text.toLowerCase().trim(), p = ctx.period.value;
  const S = (tool: string, purpose: string, args: Record<string, string | undefined> = {}): SemanticPlanStep => ({ tool, purpose, dependsOn: [], args: Object.entries({ period: p, ...args }).filter(([, v]) => v !== undefined).map(([name, value]) => ({ name, value: value ?? null })) });
  const focusRef = ctx.focus.value ? `${ctx.focus.value.kind === 'reconciliation' ? 'recon' : ctx.focus.value.kind === 'fluxItem' ? 'flux' : ctx.focus.value.kind}:${ctx.focus.value.id}` : undefined;
  /* the object a question is about: named in the words ("… for CIP"), else "this …" is the focus */
  const about0 = (t.match(/\b(?:for|of|on|behind|supports?|use|uses|using)\s+(?!this\b|that\b|it\b)([a-z0-9 &'.-]{3,60}?)(?:\s+balance)?\s*\??$/) ?? [])[1];
  /* "who owns / reviews X", "trace X", "where does X come from": the subject is what follows the verb */
  const verbObj = (t.match(/\bwho (?:owns|prepares|prepared|reviews|reviewed|approves|approved|is responsible for|signs off)\s+(.+?)\s*\??$/) ?? t.match(/^\s*trace\s+(.+?)\s*\??$/) ?? t.match(/\bwhere does\s+(.+?)\s+come from\b/) ?? [])[1];
  const about = (verbObj ?? about0)?.replace(/^(the|our|my|this|that) /, '');
  const target = (): Record<string, string | undefined> => (about ? { text: about } : { objectRef: focusRef });
  if (/\b(subsidiar(y|ies)|entities|entity)\b.*\b(open|outstanding|unapproved|still)\b.*\b(reconciliations?|recs?)\b/.test(t)) return [S('getOpenReconciliationsByEntity', 'Reading every subsidiary’s reconciliations')];
  if (/\bwho\b.*\b(needs? to|has to|must|should)?\s*review\b|\bawaiting (my )?review\b|\bpending reviews?\b/.test(t) && !/\b(approve|assign)\b/.test(t)) return [S('getPendingReviews', 'Finding who must review what', { domain: /\bflux\b/.test(t) ? 'flux' : /\brec(onciliation)?s?\b/.test(t) ? 'recon' : /\btasks?\b/.test(t) ? 'close' : 'all' })];
  if (/\bmaterial\b.*\bflux\b.*\b(no|without|missing|lack)\b.*\bsupport\b|\bflux\b.*\b(no|without|missing) support\b/.test(t)) return [S('getMaterialFluxWithoutSupport', 'Checking support on every material flux item')];
  if (/\b(what|which) reports?\b.*\b(use|uses|using|include|contain)\b/.test(t) && !/\bbuild|create\b/.test(t)) return (about || focusRef) ? [S('getReportsUsingObject', 'Tracing report lines to the governed line', target())] : null;
  if (/\bwhich reconciliations?\b.*\bsupports?\b|\breconciliations? (that |which )?supports?\b|\bwhat reconciles\b/.test(t)) return (about || focusRef) ? [S('getReconciliationForBalance', 'Finding the reconciliations behind the balance', target())] : null;
  if (/\b(largest|biggest|top)\b.*\b(unresolved|open)?\s*(close )?(issue|blocker|problem)\b/.test(t) && /\bclose|issue|blocker\b/.test(t)) return [S('getLargestUnresolvedCloseIssue', 'Ranking unresolved close issues and their owners')];
  const person = (t.match(/\b(?:open work|workload|work) (?:for|of)\s+([a-z .'-]+?)\s*\??$/) ?? t.match(/\bopen work (?:does|has)\s+([a-z .'-]+?)(?:\s+have)?\s*\??$/) ?? t.match(/\bwhat (?:does|is)\s+([a-z .'-]+?)\s+(?:have open|own|working on|responsible for)\b/) ?? [])[1];
  if (person && /\b(open work|workload|have open|working on|responsible for|own)\b/.test(t)) return [S('getOpenWorkForPerson', 'Reading the open work the person is named on', { person })];
  if (/\bwho\b.*\b(owns?|prepares?|prepared|reviews?|reviewed|approves?|responsible)\b/.test(t)) return [S('getResponsibleUsers', 'Reading who is responsible', target())];
  if (/\b(tb|trial balance)\b.*\bfor\b\s+(.+)$/.test(t)) { const subj = (t.match(/\bfor\s+(?:the\s+)?(.+?)\s*[.?]?$/) ?? [])[1]; if (subj && !/^(the )?(group|consolidated|all entities)$/.test(subj)) return [S('getSubjectTrialBalance', 'Resolving the subject before choosing a trial balance', { text: subj })]; }
  if (/\b(budget|forecast|scenario|plan)\b.*\b(vs|versus|against|compared?)\b|\b(vs|versus|against)\b.*\b(budget|forecast|plan)\b|\bvariance to (budget|forecast|plan)\b/.test(t)) return [S('getPlanningComparison', 'Checking which planning versions are governed', { text })];
  if (/\b(entity|legal entity|ownership|org(anisation|anization)?) (hierarchy|tree|structure)\b|\bsubsidiaries of\b/.test(t)) return [S('getEntityHierarchy', 'Reading the ownership tree')];
  if (/^\s*trace\b|\bwhere does\b.*\bcome from\b/.test(t) && !/\bgl\b/.test(t)) return [S('getObjectTracePath', 'Tracing the figure to its source', target())];
  if (/^\s*(what|who) (is|are)\s+[a-z]/.test(t) && !/\b(balance|movement|change|spend|revenue|income|why|largest|biggest|blocking|behind|missing|left|open|outstanding|due|late|ready|happening|going|wrong|changed|driving|needed|required|pending|unexplained|not)\b|ing\b\s/.test(t)) { const w = (t.match(/^\s*(?:what|who) (?:is|are)\s+(.+?)\s*\??$/) ?? [])[1]; if (w && w.split(/\s+/).length <= 5) return [S('resolveFinancialObject', 'Resolving what that name refers to', { text: w })]; }
  return null;
}

/** LAST RESORT, after every other route declined: a short request that is only a NAME ("South Valley", "Siemens",
 *  "close", "June") is resolved through the graph — what it is, and how it relates — instead of asking to rephrase. */
export function bareObjectPlan(text: string, ctx: { period: { value: string } }): SemanticPlanStep[] | null {
  const t = text.toLowerCase().replace(/^\s*(show( me)?|open|tell me about|about|look up|find)\s+/, '').replace(/[?.!]+\s*$/, '').trim();
  if (!t || t.split(/\s+/).length > 5 || /\b(why|how|compare|build|create|make|add|remove|explain|break|drill|prove|send|assign|attach|approve|post|generate|export)\b/.test(t)) return null;
  return [{ tool: 'resolveFinancialObject', purpose: 'Resolving what that name refers to', dependsOn: [], args: [{ name: 'text', value: t }, { name: 'period', value: ctx.period.value }] }];
}
