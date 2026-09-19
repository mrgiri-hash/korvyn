/**
 * 5A — AUDIT / PBC TOOLS. What Sloane may call over a PBC request. Reads render the PBC WORKSPACE (the request, its
 * population, the population tie-out, the selections, evidence and support gaps) inline, wherever the conversation is.
 *
 * A PBC request the conversation creates or changes is kept by the ORCHESTRATOR (`s.drafts.pbc`), exactly as a
 * workbook draft is: a tool never writes. The package is an ordinary PBC_PACKAGE artifact over the request, so every
 * 4B refinement ("add the TB tie-out", "include the related reconciliations and Flux explanations", "remove completed
 * selections") and generation path applies to it unchanged. Nothing here is a second evidence system or a second ledger.
 */
import { BASIS, SNAPSHOT_ID, periodLabel } from '../financials.js';
import { SOURCE_HEALTH } from '../governed.js';
import type { FinancialObject, ParamSpec, SloaneTool, ToolArgs, ToolEnv, ToolResult, ToolSession } from '../tools.js';
import { registerTools } from '../tools.js';
import { populationObject } from '../toolset.js';
import { propose, proposalObject } from '../actiontools.js';
import { acctIn } from '../actiontools.js';
import { rangeLabel } from '../artifacts/model.js';
import { TieOutService } from '../artifacts/tieout.js';
import { ACCOUNT_LEVEL, AuditService, EVIDENCE_LABEL, type EvidenceType, type PBCInterpretation, type PBCRequirement, type PBCView, evidenceIn, gapExposure, interpretRequest, usd, windowIn } from './pbc.js';

/** a request the conversation is creating or changing; the orchestrator keeps it and clears `dirty` */
export interface PBCDraft { op: 'create' | 'modify'; id: string | null; interpretation: PBCInterpretation | null; requirement?: PBCRequirement; raw: string; change: string; dirty: boolean }

const T = (name: string, description: string, required = false): ParamSpec => ({ name, kind: 'text', required, description });
const S = (env: ToolEnv): ToolSession => { if (!env.session) throw new Error('a PBC tool needs a Sloane session'); return env.session; };
/* the orchestrator binds one service; a tool run outside it (a test, the dry run) gets one over the SAME ledger */
const LOCAL = new WeakMap<object, AuditService>();
const svc = (env: ToolEnv): AuditService => { if (env.pbc) return env.pbc; if (env.artifacts?.pbc) return env.artifacts.pbc; let a = LOCAL.get(env.gl); if (!a) { a = new AuditService(env.data, env.gl, env.controls, new TieOutService(env.data, env.gl)); LOCAL.set(env.gl, a); } return a; };
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const low = (x: string) => x.replace(/_/g, ' ').toLowerCase();

function obj(env: ToolEnv, o: Partial<FinancialObject> & Pick<FinancialObject, 'type' | 'title'>): FinancialObject {
  return {
    id: env.objectId, status: 'AVAILABLE', scope: { id: 'GROUP', name: 'Corporate Consolidated' }, periods: [], periodLabel: '', currency: 'USD', basis: BASIS, unit: 'USD',
    table: { columns: [], rows: [] }, facts: [], provenance: { source: 'Korvyn PBC workspace — governed ledger, evidence relationships, reconciliations and Flux; documents by reference', snapshotId: env.gl.dataVersion?.() ?? SNAPSHOT_ID, journalLines: null, fxRateSetId: 'FXR-2026-AVG-REP-1', eliminations: null, declaredInputs: ['APX-2026-REP-1'] },
    population: null, refs: {}, focus: null, unavailable: null, governed: true, ...o,
  };
}
const unavailable = (env: ToolEnv, title: string, reason: string): ToolResult => ({ warnings: [reason], object: obj(env, { type: 'PBCRequest', title, status: 'UNAVAILABLE', unavailable: { capability: 'PBC', reason }, facts: [{ key: 'unavailable', label: 'PBC', value: 'none', display: reason }] }) });

/** the request the words or the conversation name: an id, a PBC number ("PBC #27", "PBC-5A-001"), else the one in context */
export function pbcIdOf(env: ToolEnv, a: ToolArgs, s: ToolSession | null): string | null {
  const A = svc(env), all = A.list();
  const direct = a['pbcRequestId'] || a['pbcId'];
  if (direct) { const id = direct.replace(/^pbc:/, ''); if (A.get(id)) return id; const byNo = all.find((r) => r.pbcNumber === id); if (byNo) return byNo.id; }
  const t = ` ${(s?.request ?? '').toLowerCase()} `;
  const no = t.match(/\bpbc[\s#-]*(?:no\.?\s*)?([a-z0-9-]*\d[a-z0-9-]*)\b/);
  if (no) { const want = no[1]!.toUpperCase(); const hit = all.find((r) => r.id.toUpperCase() === want || (r.pbcNumber ?? '').toUpperCase() === want || (r.pbcNumber ?? '').toUpperCase().endsWith(`-${want}`) || (r.pbcNumber ?? '').replace(/\D/g, '') === want.replace(/\D/g, '')); if (hit) return hit.id; }
  const ctxId = s?.lastRefs['pbcRequestId'] || (s?.focus?.kind === 'pbc' ? s.focus.id : null);
  return ctxId && A.get(ctxId) ? ctxId : null;
}

/* ================================================================================================
   THE PBC WORKSPACE OBJECT — one reading of AuditService.evaluate, rendered inline by the browser
   ================================================================================================ */
export function pbcObject(env: ToolEnv, id: string, o: { focus?: 'workspace' | 'gaps'; evidence?: EvidenceType[]; changes?: string[]; notes?: string[]; page?: { offset: number; limit: number } } = {}): ToolResult {
  const A = svc(env), v = A.evaluate(id, env.visible);
  if (!v) return unavailable(env, 'PBC request not found', `No PBC request ${id}.`);
  const q = v.requirement, gapsOnly = o.focus === 'gaps';
  const openGaps = v.gaps.filter((g) => g.status === 'OPEN' && (!o.evidence?.length || o.evidence.includes(g.requirement as EvidenceType)));
  const gapSel = new Set(openGaps.filter((g) => !ACCOUNT_LEVEL.includes(g.requirement as EvidenceType)).map((g) => g.selectionId));
  const shown = gapsOnly ? v.selections.filter((x) => gapSel.has(x.id)) : v.selections;
  const missingOf = (sid: string) => v.gaps.filter((g) => g.selectionId === sid && g.status === 'OPEN' && !ACCOUNT_LEVEL.includes(g.requirement as EvidenceType)).map((g) => g.kind).join('; ');
  const title = gapsOnly ? `${v.body.pbcNumber} · ${o.evidence?.length ? `missing ${o.evidence.map((e) => EVIDENCE_LABEL[e].toLowerCase()).join(', ')}` : 'what’s missing'}` : `${v.body.pbcNumber} · ${v.body.title}`;
  const facts: FinancialObject['facts'] = [
    { key: 'pbcNumber', label: 'PBC request', value: v.body.pbcNumber, display: `${v.body.pbcNumber} · ${v.body.title}` },
    { key: 'status', label: 'Status', value: v.status, display: `${low(v.status)}${v.statusReasons[0] ? ` — ${v.statusReasons[0]}` : ''}` },
    { key: 'version', label: 'Request version', value: v.version, display: `v${v.version}` },
  ];
  if (q) facts.push({ key: 'requirement', label: 'Requirement', value: q.title, display: `${q.objectName} (${q.accounts.join(', ')}) · ${low(q.populationType)} · ${rangeLabel(q.periodStart, q.periodEnd)}${q.minAbsUsd ? ` · over ${usd(q.minAbsUsd)}` : ''}${q.project ? ` · project ${q.project}` : ''} · evidence: ${q.requiredEvidence.map((e) => EVIDENCE_LABEL[e].toLowerCase()).join(', ')}` });
  if (v.population) facts.push({ key: 'populationRows', label: 'Population lines', value: v.population.rowCount, display: v.population.rowCount.toLocaleString('en-US') },
    { key: 'populationTotal', label: 'Population total (USD)', value: v.population.totalUsd, display: usd(v.population.totalUsd) },
    ...(v.population.belowThreshold.count ? [{ key: 'belowThreshold', label: 'Below the threshold (USD)', value: v.population.belowThreshold.totalUsd, display: `${v.population.belowThreshold.count} lines · ${usd(v.population.belowThreshold.totalUsd)}` }] : []));
  if (v.tie) facts.push({ key: 'tieOut', label: 'Population tie-out', value: v.tie.status, display: `${low(v.tie.status)}${v.tie.reasons[0] ? ` — ${v.tie.reasons[0]}` : ''}` },
    { key: 'grossAdditions', label: 'Gross additions tie to the ledger (USD)', value: v.tie.grossAdditionsUsd, display: usd(v.tie.grossAdditionsUsd) });
  facts.push(
    { key: 'selections', label: 'Selections', value: v.selections.length, display: `${v.selections.length} · ${Object.entries(v.matching).filter(([, n]) => n).map(([k, n]) => `${n} ${low(k)}`).join(', ')}` },
    { key: 'coverage', label: 'Support coverage (by amount)', value: v.coverage.pct ?? 0, display: `${pct(v.coverage.pct)} · ${v.coverage.full} fully supported, ${v.coverage.partial} partly, ${v.coverage.unsupported} unsupported` },
    { key: 'openGaps', label: 'Open support gaps', value: openGaps.length, display: (() => { const ex = gapExposure(openGaps), acct = openGaps.filter((g) => ACCOUNT_LEVEL.includes(g.requirement as EvidenceType)).length; return `${openGaps.length}${ex.selections ? ` · on ${ex.selections} selection(s) worth ${usd(ex.usd)}` : ''}${acct ? ` · ${acct} account-level (reconciliation / Flux)` : ''}`; })() },
  );
  const kinds = new Map<string, number>(); openGaps.forEach((g) => kinds.set(g.kind, (kinds.get(g.kind) ?? 0) + 1));
  [...kinds].slice(0, 6).forEach(([k, n], i) => facts.push({ key: `gap${i + 1}`, label: 'Gap', value: n, display: `${n} × ${k}` }));
  if (v.reconciliations.length) facts.push({ key: 'reconciliations', label: 'Related reconciliations', value: v.reconciliations.length, display: v.reconciliations.map((r) => `${r.name} (${r.available ? low(r.tieStatus) : 'module'}, ${low(r.status)})`).join('; ') });
  if (v.flux.length) facts.push({ key: 'flux', label: 'Related Flux lines', value: v.flux.length, display: `${v.flux.length} · ${v.flux.filter((f) => f.material).length} material` });
  if (v.stale) facts.push({ key: 'stale', label: 'Stale', value: 'yes', display: `The governed data changed: ${v.staleReasons.join('; ')}` });
  (o.changes ?? []).forEach((c, i) => facts.push({ key: `change${i + 1}`, label: 'Change', value: c, display: c }));
  const rows = shown.map((x) => ({
    label: `#${x.no} ${x.line?.key ?? x.original.slice(0, 40)}`, level: 1, kind: 'line' as const,
    cells: [x.line?.entity ?? x.identifiers.entity ?? '—', x.line?.vendor ?? x.identifiers.vendor ?? '—', usd(Math.abs(x.line?.usd ?? x.identifiers.amount ?? 0)), low(x.status), x.coverage ? low(x.coverage) : '—', missingOf(x.id) || '—'],
    ref: x.line ? `txn:${x.line.key}` : `selection:${x.id}`,
  }));
  /* the browser's inline workspace: everything it draws, and nothing it would have to compute */
  const pbc = {
    id: v.id, version: v.version, pbcNumber: v.body.pbcNumber, title: v.body.title, status: v.status, statusReasons: v.statusReasons, lifecycle: v.body.lifecycle, source: v.body.source, intake: v.body.intake, intakeNotes: v.body.intakeNotes,
    requirement: q ? { object: `${q.objectName} (${q.accounts.join(', ')})`, window: rangeLabel(q.periodStart, q.periodEnd), population: low(q.populationType), threshold: q.minAbsUsd ? `over ${usd(q.minAbsUsd)}` : 'none', scope: q.scopeId === 'GROUP' ? 'Corporate Consolidated' : q.scopeId, project: q.project, evidence: q.requiredEvidence.map((e) => EVIDENCE_LABEL[e]) } : null,
    interpretation: v.body.interpretation ? { from: v.body.interpretation.from, resolved: v.body.interpretation.resolved, notes: v.body.interpretation.notes } : null,
    population: v.population ? { id: v.population.id, rows: v.population.rowCount, total: usd(v.population.totalUsd), below: v.population.belowThreshold.count ? `${v.population.belowThreshold.count} lines · ${usd(v.population.belowThreshold.totalUsd)} below the threshold` : null, systems: v.population.sourceSystems, dataVersion: v.population.dataVersion, mappingVersion: v.population.mappingVersion, generatedAt: v.population.generatedAt } : null,
    tie: v.tie ? { status: v.tie.status, rows: [['Population (over the threshold)', usd(v.tie.populationUsd)], ['Below the threshold', usd(v.tie.belowThresholdUsd)], ['Gross additions', usd(v.tie.grossAdditionsUsd)], ['Other movement', usd(v.tie.otherMovementUsd)], ['Net activity', usd(v.tie.netActivityUsd)], ['Opening balance', usd(v.tie.openingUsd)], ['Closing balance', usd(v.tie.closingUsd)], ['TB movement', usd(v.tie.tbMovementUsd)], ['Difference', usd(v.tie.difference)]], bridge: v.tie.bridge, reasons: v.tie.reasons } : null,
    coverage: { ...v.coverage, pctLabel: pct(v.coverage.pct) }, matching: v.matching,
    selections: shown.slice(o.page?.offset ?? 0, (o.page?.offset ?? 0) + (o.page?.limit ?? 40)).map((x) => ({ id: x.id, no: x.no, method: x.method, original: x.original, status: x.status, reason: x.reason, key: x.line?.key ?? null, entity: x.line?.entity ?? x.identifiers.entity ?? null, vendor: x.line?.vendor ?? null, date: x.line?.postingDate ?? x.identifiers.date ?? null, amount: usd(Math.abs(x.line?.usd ?? x.identifiers.amount ?? 0)), system: x.line ? `${SOURCE_HEALTH[x.line.connector]?.system ?? x.line.connector} ${x.line.externalId}` : null,
      coverage: x.coverage, evidence: x.evidence.map((e) => ({ type: EVIDENCE_LABEL[e.type], status: e.status, reference: e.reference, document: e.document, detail: e.detail })), candidates: x.candidates.slice(0, 5).map((c) => ({ ...c, amount: usd(c.amountUsd) })), missing: missingOf(x.id) })),
    selectionCount: shown.length, page: { offset: o.page?.offset ?? 0, limit: o.page?.limit ?? 40 },
    gaps: openGaps.slice(0, 40).map((g) => ({ id: g.id, selection: g.selectionNo, kind: g.kind, requirement: g.requirement, transaction: g.transactionId, amount: usd(g.amountUsd), severity: g.severity, owner: g.owner, note: g.note })),
    gapCount: openGaps.length, gapsResolved: v.gaps.filter((g) => g.status !== 'OPEN').length,
    reconciliations: v.reconciliations, flux: v.flux.map((f) => ({ ...f, change: usd(f.changeUsd) })),
    stale: v.stale, staleReasons: v.staleReasons, duplicates: v.duplicates, packageArtifactId: v.body.packageArtifactId, delivered: v.body.delivered, warnings: v.warnings, focus: o.focus ?? 'workspace',
  };
  return { warnings: [...(o.notes ?? []), ...v.warnings.slice(0, 3)], object: obj(env, {
    type: gapsOnly ? 'PBCSupportGaps' : 'PBCRequest', title, status: v.status === 'READY' || v.status === 'GENERATED' || v.status === 'DELIVERED' ? 'AVAILABLE' : 'PARTIAL',
    periods: q ? [q.periodStart, q.periodEnd] : [], periodLabel: q ? rangeLabel(q.periodStart, q.periodEnd) : '', scope: { id: q?.scopeId ?? 'GROUP', name: q?.scopeId && q.scopeId !== 'GROUP' ? q.scopeId : 'Corporate Consolidated' },
    table: { columns: ['Entity', 'Vendor', 'Amount (USD)', 'Match', 'Coverage', 'Missing'], rows }, facts,
    refs: { pbcRequestId: v.id, ...(v.population ? { populationId: v.population.id, auditPopulationId: v.population.id } : {}), ...(v.body.packageArtifactId ? { artifactId: v.body.packageArtifactId } : {}), ...(gapsOnly ? { pbcSelectionScope: 'GAPS' } : { pbcSelectionScope: 'ALL' }) },
    focus: { kind: 'pbc', id: v.id, name: `${v.body.pbcNumber} ${v.body.title}` }, pbc,
  }) };
}
/** a short list of requests (no id named, no request in context) */
function pbcList(env: ToolEnv, status?: string): ToolResult {
  const A = svc(env), rs = A.list().filter((r) => !status || r.status === status);
  return { warnings: [], object: obj(env, {
    type: 'PBCRequests', title: 'PBC requests',
    table: { columns: ['Owner', 'Requested by', 'Status', 'Lifecycle'], rows: rs.map((r) => ({ label: `${r.pbcNumber ?? r.id} · ${r.title}`, level: 1, kind: 'line' as const, cells: [r.owner, r.requestedBy, low(r.status ?? 'OPEN'), low(r.lifecycle ?? 'OPEN')], ref: `pbc:${r.id}` })) },
    facts: [{ key: 'requests', label: 'Requests', value: rs.length, display: String(rs.length) }, { key: 'open', label: 'Not yet delivered', value: rs.filter((r) => r.lifecycle !== 'DELIVERED').length, display: String(rs.filter((r) => r.lifecycle !== 'DELIVERED').length) }],
    refs: rs[0] ? { pbcId: rs[0].id } : {},
  }) };
}

/* ================================================================================================
   REFINING A REQUEST'S POPULATION — the words; the requirement is otherwise unchanged
   ================================================================================================ */
function money(t: string): { dir: 'over' | 'under'; usd: number } | null {
  const m = t.match(/\b(over|above|greater than|more than|at least|exceeding|under|below|less than|smaller than)\s*\$?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|million|b|bn)?\b/i);
  if (!m) return null;
  const n = Number(m[2]!.replace(/,/g, '')), u = (m[3] ?? '').toLowerCase();
  return { dir: /under|below|less|smaller/.test(m[1]!.toLowerCase()) ? 'under' : 'over', usd: n * (u.startsWith('k') || u === 'thousand' ? 1e3 : u.startsWith('m') ? 1e6 : u.startsWith('b') ? 1e9 : 1) };
}
export function refineRequirement(q: PBCRequirement, text: string, ctx: ReturnType<AuditService['ctx']>): { next: PBCRequirement; changes: string[]; notes: string[] } {
  const t = ` ${text.toLowerCase()} `, next: PBCRequirement = JSON.parse(JSON.stringify(q)), changes: string[] = [], notes: string[] = [];
  const m = money(t);
  /* "exclude items under $500K" and "only items over $500K" both mean a floor of $500K */
  if (m && (m.dir === 'over' || /\b(exclude|remove|drop|without|leave out)\b/.test(t))) { if (next.minAbsUsd !== m.usd) { next.minAbsUsd = m.usd; changes.push(`Threshold: over ${usd(m.usd)}`); } }
  else if (m && m.dir === 'under') notes.push(`“under ${usd(m.usd)}” would select the small items; a PBC population keeps a floor — say “exclude items under …” to raise it.`);
  if (/\b(no|remove the|drop the|without a) threshold\b|\ball amounts\b/.test(t) && next.minAbsUsd) { next.minAbsUsd = null; changes.push('Threshold removed'); }
  const sv = /\bsouth valley\b|\bsilicon valley\b|\bsv-?ph2\b/.test(t) ? ctx.projects.find((p) => p.startsWith('SV')) ?? null : ctx.projects.find((p) => new RegExp(`\\b${p.toLowerCase()}\\b`).test(t)) ?? null;
  if (sv && next.project !== sv) { next.project = sv; changes.push(`Only project ${sv}${sv.startsWith('SV') ? ' (South Valley)' : ''}`); }
  if (/\b(all projects|every project|remove the project)\b/.test(t) && next.project) { next.project = null; changes.push('Every project'); }
  const ent = ctx.scopes.find((s) => s.id !== 'GROUP' && new RegExp(`\\b${s.id.toLowerCase().replace(/-/g, '[- ]?')}\\b`).test(t));
  if (ent && next.scopeId !== ent.id) { next.scopeId = ent.id; changes.push(`Scope: ${ent.name}`); }
  if (/\b(corporate consolidated|the group|all entities)\b/.test(t) && next.scopeId !== 'GROUP') { next.scopeId = 'GROUP'; changes.push('Scope: Corporate Consolidated'); }
  const w = windowIn(t, ctx.periods);
  if (w.end && ctx.periods.includes(w.end) && (w.end !== next.periodEnd || (w.start && w.start !== next.periodStart))) { next.periodStart = w.start && ctx.periods.includes(w.start) ? w.start : next.periodStart; next.periodEnd = w.end; changes.push(`Window: ${rangeLabel(next.periodStart, next.periodEnd)}`); }
  const addEv = /\b(add|include|also|require|with)\b/.test(t) ? evidenceIn(t).filter((e) => !next.requiredEvidence.includes(e)) : [];
  /* "include the related reconciliations" is a PACKAGE tab, not a new evidence requirement — the package tool handles it */
  if (addEv.length) { next.requiredEvidence.push(...addEv); changes.push(`Also require: ${addEv.map((e) => EVIDENCE_LABEL[e].toLowerCase()).join(', ')}`); }
  const dropEv = /\b(don'?t need|no longer|drop|remove)\b/.test(t) ? evidenceIn(t).filter((e) => next.requiredEvidence.includes(e) && e !== 'SOURCE_TRANSACTION') : [];
  if (dropEv.length) { next.requiredEvidence = next.requiredEvidence.filter((e) => !dropEv.includes(e)); changes.push(`No longer require: ${dropEv.map((e) => EVIDENCE_LABEL[e].toLowerCase()).join(', ')}`); }
  if (changes.length) { const pv = next.populationType === 'ADDITIONS' ? ' additions' : next.populationType === 'DISPOSALS' ? ' settlements' : ' activity'; next.title = `${q.title.split(' ')[0]} ${next.objectName}${pv}${next.minAbsUsd ? ` over ${usd(next.minAbsUsd)}` : ''}${next.project ? ` · ${next.project}` : ''}${next.scopeId !== 'GROUP' ? ` · ${next.scopeId}` : ''}`; }
  return { next, changes, notes };
}

/* ================================================================================================
   THE TOOLS
   ================================================================================================ */
const P_ID: ParamSpec = { name: 'pbcRequestId', kind: 'text', required: false, description: 'the PBC request (id or PBC number); default the one in this conversation' };
const PBC_TOOLS: SloaneTool[] = [
  { id: 'buildPBCRequest', domain: 'audit', permission: 'SUPPORT_PACKAGE_CREATE', risk: 'PROPOSE', objectTypes: ['AUDIT_POPULATION', 'EVIDENCE', 'EXCEL_ARTIFACT'],
    description: 'Turn an auditor / PBC request into a governed request: "Give me FY26 CIP additions over $1M with invoices, POs, approvals and reconciliation support", "pull the support for this PBC", "the auditors want all capex over $500K with approvals". Korvyn interprets the object, window, threshold, scope, project and required evidence (the user’s words win), builds the governed population, ties it to the ledger, selects and matches items, traces evidence and states the gaps. Returns the PBC WORKSPACE and a PBC package draft. Nothing is delivered.',
    params: [{ name: 'periodStart', kind: 'period', required: false, description: 'first month' }, { name: 'periodEnd', kind: 'period', required: false, description: 'last month' }, { name: 'scope', kind: 'scope', required: false, description: 'GROUP or an entity' },
      { name: 'account', kind: 'account', required: false, description: 'the account / group the request is about' }, T('minAbsAmount', 'the threshold, e.g. 1M'), T('evidence', 'required evidence, comma-separated (invoices, POs, approvals, contracts, reconciliations, Flux)'), T('populationType', 'ADDITIONS | ACTIVITY | DISPOSALS'), T('pbcNumber', 'the auditor’s PBC number, if given'), T('title', 'the auditor’s title, if given')],
    outputs: 'PBCRequest (workspace) + ExcelWorkbookPreview (package draft); refs pbcRequestId, artifactId',
    run(a, env) { const s = S(env), A = svc(env);
      const proposal: Record<string, string> = Object.fromEntries(['periodStart', 'periodEnd', 'scope', 'account', 'minAbsAmount', 'evidence', 'populationType'].filter((k) => a[k]).map((k) => [k, a[k]!]));
      const interp = interpretRequest(s.request, A.ctx(), Object.keys(proposal).length ? proposal : null);
      if (!interp.requirement.accounts.length) return unavailable(env, 'PBC request — which object?', 'Name the financial object the request is about — e.g. “CIP additions”.');
      s.drafts.pbc = { op: 'create', id: null, interpretation: interp, raw: s.request, change: 'Created', dirty: true };
      return { warnings: interp.notes, object: obj(env, { type: 'PBCRequest', title: interp.requirement.title, facts: [{ key: 'requirement', label: 'Requirement', value: interp.requirement.title, display: interp.resolved.join(' · ') }], refs: {} }) }; } },
  { id: 'getPBCRequest', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION'],
    description: 'The PBC workspace for a request — its population, tie-out, selections, matching, evidence coverage and support gaps ("show me the PBC request", "open PBC #27", "where are we on the CIP request"); with no request named or in context, the list of PBC requests (optionally by status).',
    params: [P_ID, { name: 'pbcId', kind: 'pbcId', required: false, description: 'PBC-2026-001' }, T('status', 'OPEN, IN_PROGRESS, NOT_STARTED …')], outputs: 'PBCRequest | PBCRequests; refs pbcRequestId',
    run(a, env) { const id = pbcIdOf(env, a, env.session ?? null); return id && (a['pbcRequestId'] || a['pbcId'] || !a['status']) ? pbcObject(env, id) : pbcList(env, a['status']); } },
  { id: 'getAuditRequest', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION'], description: 'One PBC / audit request by id with its population, selections and support gaps.',
    params: [{ name: 'pbcId', kind: 'pbcId', required: true, description: 'PBC-2026-001' }], outputs: 'PBCRequest; refs pbcRequestId',
    run(a, env) { const id = pbcIdOf(env, a, null); return id ? pbcObject(env, id) : unavailable(env, 'PBC request not found', `No PBC request ${a['pbcId']}.`); } },
  { id: 'getPBCSupportGaps', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION', 'EVIDENCE'],
    description: 'What is missing on a PBC request: the selections with open support gaps and what each lacks ("which selections are missing evidence?", "show me what’s missing", "show the missing invoices" — pass evidence=invoice to narrow). Every gap states the requirement, amount, severity and owner.',
    params: [P_ID, T('evidence', 'optional: only this kind of gap (invoice, PO, approval, contract, reconciliation, Flux)')], outputs: 'PBCSupportGaps; refs pbcRequestId, pbcSelectionScope',
    run(a, env) { const s = env.session ?? null, id = pbcIdOf(env, a, s); if (!id) return unavailable(env, 'Which PBC request?', 'There is no PBC request in this conversation — ask for one first, e.g. “Give me FY26 CIP additions over $1M with invoices and approvals”.');
      const ev = evidenceIn(` ${`${a['evidence'] ?? ''} ${/\bmissing\b.*\b(invoices?|pos?|purchase orders?|approvals?|contracts?)\b|\b(invoices?|approvals?|contracts?)\b.*\bmissing\b/.test((s?.request ?? '').toLowerCase()) ? (s?.request ?? '').toLowerCase() : ''}`} `).filter((e) => e !== 'RECONCILIATION' || /reconcil/.test(a['evidence'] ?? ''));
      return pbcObject(env, id, { focus: 'gaps', evidence: ev }); } },
  { id: 'getPBCSelectionGL', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['GOVERNED_LEDGER', 'AUDIT_POPULATION'],
    description: 'The governed GL lines behind a PBC request’s selections ("show me the underlying GL for those selections") — all matched selections, or only those with open gaps when the conversation was just looking at what is missing.',
    params: [P_ID, T('which', 'ALL | GAPS; default: the selections the conversation was looking at')], outputs: 'GovernedPopulation; refs populationId, pbcRequestId',
    run(a, env) { const s = env.session ?? null, A = svc(env), id = pbcIdOf(env, a, s); if (!id) return unavailable(env, 'Which PBC request?', 'There is no PBC request in this conversation.');
      const v = A.evaluate(id, env.visible)!, which = a['which'] === 'ALL' || a['which'] === 'GAPS' ? a['which'] : /\b(those|these|them)\b/.test((s?.request ?? '').toLowerCase()) && s?.lastRefs['pbcSelectionScope'] === 'GAPS' ? 'GAPS' : 'ALL';
      const gapSel = new Set(v.gaps.filter((g) => g.status === 'OPEN' && !ACCOUNT_LEVEL.includes(g.requirement as EvidenceType)).map((g) => g.selectionId));
      const keys = v.selections.filter((x) => x.line && (which === 'ALL' || gapSel.has(x.id))).map((x) => x.line!.key);
      const q = v.requirement!;
      const r = populationObject(env, 'GovernedPopulation', `GL behind ${v.body.pbcNumber} ${which === 'GAPS' ? 'selections with open gaps' : 'selections'} · ${rangeLabel(q.periodStart, q.periodEnd)}`, { periodStart: q.periodStart, periodEnd: q.periodEnd, keys: keys.length ? keys : ['__NONE__'] }, { ...a, limit: '25' });
      r.object.refs = { ...r.object.refs, pbcRequestId: id }; r.object.facts.push({ key: 'selectionsShown', label: 'Selections', value: keys.length, display: `${keys.length} of ${v.selections.length} selections (${which === 'GAPS' ? 'those with open support gaps' : 'every matched selection'})` });
      if (v.selections.some((x) => !x.line)) r.warnings.push(`${v.selections.filter((x) => !x.line).length} selection(s) are not matched to a governed transaction and have no GL line.`);
      return r; } },
  { id: 'getAuditReadiness', domain: 'audit', permission: 'AUDIT_VIEW', risk: 'READ', objectTypes: ['AUDIT_POPULATION', 'EVIDENCE'],
    description: 'Is an account audit-ready ("are we audit-ready for CIP?") — deterministic conditions only, never a score: the population and its tie-out, invoice and approval references, stale reconciliations, unexplained Flux, unsupported material movement, late approvals, stale ERP feeds, open PBC gaps.',
    params: [{ name: 'account', kind: 'account', required: false, description: 'the account / group; default CIP' }, { name: 'periodStart', kind: 'period', required: false, description: 'first month' }, { name: 'periodEnd', kind: 'period', required: false, description: 'last month' }],
    outputs: 'AuditReadiness; facts checks, findings',
    run(a, env) { const s = env.session, A = svc(env), ps = env.gl.periods();
      const acct = (a['account'] || acctIn(env, s?.request ?? '') || '15000').replace(/^account:/, ''), w = windowIn(` ${(s?.request ?? '').toLowerCase()} `, ps);
      const end = a['periodEnd'] || (w.end && ps.includes(w.end) ? w.end : ps.at(-1)!), start = a['periodStart'] || (w.start && ps.includes(w.start) ? w.start : `${end.slice(0, 4)}-01`);
      const r = A.readiness([acct], start, end, env.visible), name = env.gl.account(acct)?.name ?? acct;
      const findings = r.checks.filter((c) => c.status === 'FINDING');
      return { warnings: ['Audit readiness is a list of conditions Korvyn can verify — it is not a score.'], object: obj(env, {
        type: 'AuditReadiness', title: `Audit readiness · ${name} · ${rangeLabel(start, end)}`, status: findings.length ? 'PARTIAL' : 'AVAILABLE', periods: [start, end], periodLabel: rangeLabel(start, end),
        table: { columns: ['Result', 'Count', 'Amount (USD)', 'Detail'], rows: r.checks.map((c) => ({ label: c.label, level: 1, kind: 'line' as const, cells: [c.status === 'FINDING' ? 'Finding' : c.status === 'PASS' ? 'Pass' : 'n/a', String(c.count), c.amountUsd === null ? '—' : usd(c.amountUsd), c.detail] })) },
        facts: [
          { key: 'population', label: 'Population', value: r.population.rows, display: `${r.population.rows.toLocaleString('en-US')} lines · ${usd(r.population.totalUsd)}` },
          { key: 'tieOut', label: 'Tie-out', value: r.tie.status, display: low(r.tie.status) },
          { key: 'invoiceRefs', label: 'Invoice references', value: r.evidence.invoiceRefs, display: `${r.evidence.invoiceRefs} of ${r.evidence.apLines} AP lines` },
          { key: 'approvalRefs', label: 'Approval references', value: r.evidence.approvalRefs, display: `${r.evidence.approvalRefs} of ${r.evidence.approvalsRequired} required` },
          { key: 'linesMissing', label: 'Lines missing support', value: r.evidence.linesMissing, display: `${r.evidence.linesMissing} · ${usd(r.evidence.amountMissing)}` },
          { key: 'findings', label: 'Findings', value: findings.length, display: `${findings.length} of ${r.checks.length} checks — ${findings.map((c) => c.label).join('; ') || 'none'}` },
          { key: 'openGaps', label: 'Open PBC support gaps', value: r.openGaps, display: String(r.openGaps) },
        ], refs: { populationId: r.population.id, account: acct }, focus: { kind: 'account', id: acct, name } }) }; } },
  { id: 'modifyPBCRequest', domain: 'audit', permission: 'SUPPORT_PACKAGE_CREATE', risk: 'PROPOSE', objectTypes: ['AUDIT_POPULATION'],
    description: 'Change the POPULATION of the PBC request in this conversation from the user’s words: "only include South Valley", "exclude items under $500K", "only MDH", "change it to Q2", "also require contracts". A new request version; the selections are re-drawn and the package refreshes. (Package tabs and columns — "add the TB tie-out", "add source vendor", "remove completed selections" — are modifyExcelArtifact.)',
    params: [P_ID, T('instruction', 'the user’s words, verbatim')], outputs: 'PBCRequest; refs pbcRequestId',
    run(a, env) { const s = S(env), A = svc(env), id = pbcIdOf(env, a, s); if (!id) return unavailable(env, 'Which PBC request?', 'There is no PBC request in this conversation.');
      const r = A.get(id)!, q = r.interpretation?.requirement;
      if (!q) return unavailable(env, `${r.pbcNumber} needs review`, `${r.pbcNumber} has no structured requirement yet — it needs review before its population can change.`);
      const f = refineRequirement(q, a['instruction'] || s.request, A.ctx());
      if (!f.changes.length) return pbcObject(env, id, { notes: [...f.notes, 'Nothing in the words changes the request’s population.'] });
      s.drafts.pbc = { op: 'modify', id, interpretation: null, requirement: f.next, raw: s.request, change: f.changes.join('; '), dirty: true };
      return pbcObject(env, id, { changes: f.changes, notes: f.notes }); } },
  /* proposals — nothing is written until the user confirms */
  { id: 'proposeRefreshPBCRequest', domain: 'action', permission: 'SUPPORT_PACKAGE_CREATE', risk: 'PROPOSE', objectTypes: ['AUDIT_POPULATION'],
    description: 'Prepare (not run) refreshing a STALE PBC request against the current governed data ("refresh the PBC request", "refresh the request") — a new version; a delivered package is kept exactly as delivered.',
    params: [P_ID], outputs: 'ActionProposal (REFRESH_PBC_REQUEST)',
    run(a, env) { const id = pbcIdOf(env, a, S(env)); if (!id) return unavailable(env, 'Which PBC request?', 'There is no PBC request in this conversation.'); return proposalObject(env, propose(env, 'REFRESH_PBC_REQUEST', { pbcRequestId: id })); } },
  { id: 'proposeDeliverPBCPackage', domain: 'action', permission: 'SUPPORT_PACKAGE_CREATE', risk: 'PROPOSE', objectTypes: ['AUDIT_POPULATION', 'EXCEL_ARTIFACT'],
    description: 'Prepare (not run) marking the PBC request DELIVERED with its latest generated package ("mark it delivered", "we sent it to the auditors"). A delivered package is never rewritten; a later refresh creates a new version.',
    params: [P_ID], outputs: 'ActionProposal (MARK_PBC_DELIVERED)',
    run(a, env) { const id = pbcIdOf(env, a, S(env)); if (!id) return unavailable(env, 'Which PBC request?', 'There is no PBC request in this conversation.'); return proposalObject(env, propose(env, 'MARK_PBC_DELIVERED', { pbcRequestId: id })); } },
  { id: 'proposeResolveAuditSelection', domain: 'action', permission: 'SUPPORT_PACKAGE_CREATE', risk: 'PROPOSE', objectTypes: ['AUDIT_POPULATION'],
    description: 'Prepare (not run) matching an ambiguous or partly matched selection to ONE governed transaction the user chose ("selection 3 is JE-000412 line 2", "use the first candidate for selection 5"). Korvyn never chooses among candidates itself.',
    params: [P_ID, T('selection', 'the selection number', true), T('transaction', 'the governed transaction key the user chose', true), T('note', 'why')], outputs: 'ActionProposal (RESOLVE_AUDIT_SELECTION)',
    run(a, env) { const id = pbcIdOf(env, a, S(env)); if (!id) return unavailable(env, 'Which PBC request?', 'There is no PBC request in this conversation.'); return proposalObject(env, propose(env, 'RESOLVE_AUDIT_SELECTION', { pbcRequestId: id, selection: a['selection'], transaction: a['transaction'], note: a['note'] ?? S(env).request })); } },
  { id: 'proposeResolveSupportGap', domain: 'action', permission: 'SUPPORT_ATTACH', risk: 'PROPOSE', objectTypes: ['AUDIT_POPULATION', 'EVIDENCE'],
    description: 'Prepare (not run) closing a PBC support gap: LINK a reference the user gives ("link invoice INV-88213 to selection 4") or WAIVE it with a reason ("waive the approval gap on selection 2 — approved in the board minutes"). A reference, never a document.',
    params: [P_ID, T('selection', 'the selection number', true), T('evidence', 'invoice | PO | approval | contract …'), T('reference', 'the reference to link'), T('mode', 'LINK | WAIVE'), T('note', 'the reason')], outputs: 'ActionProposal (RESOLVE_SUPPORT_GAP)',
    run(a, env) { const s = S(env), id = pbcIdOf(env, a, s); if (!id) return unavailable(env, 'Which PBC request?', 'There is no PBC request in this conversation.');
      const mode = /waive/i.test(a['mode'] ?? s.request) ? 'WAIVE' : 'LINK';
      return proposalObject(env, propose(env, 'RESOLVE_SUPPORT_GAP', { pbcRequestId: id, selection: a['selection'], evidence: a['evidence'] ?? evidenceIn(` ${s.request.toLowerCase()} `)[0] ?? '', reference: a['reference'] ?? '', mode, note: a['note'] ?? s.request })); } },
];
registerTools(PBC_TOOLS);
export const PBC_TOOL_IDS = new Set(PBC_TOOLS.map((t) => t.id));
export const PBC_TOOLS_LOADED = true;
void periodLabel;
