/**
 * 5A — the Action Services for a PBC request. Registered with the one ActionEngine, so they run only after the user
 * confirms, with permission re-checked, staleness checked against the request's version, idempotency and audit —
 * exactly as every other Sloane action. The HTTP routes (workapi) run the same AuditService methods with the same
 * policy, so the workspace and Sloane cannot diverge.
 */
import { StaleVersionError } from '../persistence/repositories.js';
import { type ActionContext, type ActionProposal, type Service, registerActionServices } from '../actions.js';
import { EVIDENCE_LABEL, type EvidenceType, evidenceIn, usd } from './pbc.js';

const str = (p: ActionProposal, k: string) => String(p.proposedPayload[k] ?? '');
function reqOf(p: ActionProposal, c: ActionContext) {
  const id = str(p, 'pbcRequestId');
  const r = id && c.pbc ? c.pbc.get(id) : null;
  return { id, r };
}
const target = (p: ActionProposal, r: { id: string; pbcNumber: string; title: string; version: number }) => { p.targetObjectId = `pbc:${r.id}`; p.targetObjectType = 'PBC_REQUEST'; p.targetLabel = `${r.pbcNumber} ${r.title} v${r.version}`; };
const vis = (c: ActionContext) => (c.actor.scopeIds === 'ALL' ? 'ALL' as const : new Set(c.actor.scopeIds));

const refreshPBC: Service = {
  type: 'REFRESH_PBC_REQUEST', permission: 'SUPPORT_PACKAGE_CREATE', targetType: 'PBC_REQUEST',
  validate(p, c) {
    const { id, r } = reqOf(p, c);
    if (!c.pbc) return { errors: ['The audit / PBC service is not available.'], warnings: [] };
    if (!r) return { errors: [id ? `No PBC request ${id}.` : 'There is no PBC request in this conversation.'], warnings: [] };
    const v = c.pbc.evaluate(r.id, vis(c))!;
    target(p, r);
    p.preview = [{ label: 'Request', value: `${r.pbcNumber} · v${r.version} → a new version` }, { label: 'Why', value: v.stale ? v.staleReasons.join('; ') : 'Not stale — a refresh re-evaluates against the current governed data' },
      ...(r.lifecycle === 'DELIVERED' ? [{ label: 'Delivered package', value: `kept exactly as delivered (generation ${r.delivered?.generationId})` }] : [])];
    return { errors: [], warnings: v.stale ? [] : ['The request is not stale.'] };
  },
  targetVersion: (p, c) => reqOf(p, c).r?.version ?? null,
  execute(p, c) {
    const { r } = reqOf(p, c);
    if (c.expectedTargetVersion != null && r!.version !== c.expectedTargetVersion) throw new StaleVersionError('PBC_REQUEST', r!.id, c.expectedTargetVersion, r!.version);
    const u = c.pbc!.refresh(c.actor, r!.id, 'SLOANE', c.executionId ?? null);
    /* the package over the request pins its version: refresh it too, so the next generation reads the new version */
    if (u.packageArtifactId && c.artifacts?.get(u.packageArtifactId)) c.artifacts.refresh(c.actor, u.packageArtifactId, null, 'SLOANE');
    return { before: { version: r!.version }, after: { version: u.version }, afterRef: r!.id, result: { pbcRequestId: r!.id, pbcVersion: String(u.version) }, timeline: `Refreshed ${r!.pbcNumber} to v${u.version}` };
  },
};
const deliverPBC: Service = {
  type: 'MARK_PBC_DELIVERED', permission: 'SUPPORT_PACKAGE_CREATE', targetType: 'PBC_REQUEST',
  validate(p, c) {
    const { id, r } = reqOf(p, c);
    if (!c.pbc) return { errors: ['The audit / PBC service is not available.'], warnings: [] };
    if (!r) return { errors: [id ? `No PBC request ${id}.` : 'There is no PBC request in this conversation.'], warnings: [] };
    target(p, r);
    const errors: string[] = [];
    const a = r.packageArtifactId && c.artifacts ? c.artifacts.get(r.packageArtifactId) : null;
    const gen = a && c.artifacts ? c.artifacts.generations(a.id).find((g) => g.status === 'COMPLETED') ?? null : null;
    if (!a) errors.push(`${r.pbcNumber} has no package yet — build and generate it first.`);
    else if (!gen) errors.push(`${a.name} has not been generated — generate the file before marking it delivered.`);
    if (r.lifecycle === 'DELIVERED') errors.push(`${r.pbcNumber} is already delivered (${r.delivered?.at.slice(0, 10)}).`);
    const v = c.pbc.evaluate(r.id, vis(c))!;
    const open = v.gaps.filter((g) => g.status === 'OPEN' && g.severity !== 'LOW');
    p.preview = [{ label: 'Request', value: `${r.pbcNumber} · ${r.title}` }, ...(gen ? [{ label: 'Package delivered', value: `${gen.fileName} (${gen.id}, package v${gen.artifactVersion})` }] : []),
      { label: 'After delivery', value: 'The delivered package is kept exactly as delivered; a refresh creates a new version' }];
    return { errors, warnings: open.length ? [`${open.length} material support gap(s) are still open (${usd(open.reduce((t, g) => t + g.amountUsd, 0))}) — the package states them on its Exceptions tab.`] : [] };
  },
  targetVersion: (p, c) => reqOf(p, c).r?.version ?? null,
  execute(p, c) {
    const { r } = reqOf(p, c);
    const gen = c.artifacts!.generations(r!.packageArtifactId!).find((g) => g.status === 'COMPLETED')!;
    const u = c.pbc!.setLifecycle(c.actor, r!.id, 'DELIVERED', { delivered: { generationId: gen.id, artifactVersion: gen.artifactVersion, at: new Date().toISOString(), by: c.actor.name } }, 'PBC_PACKAGE_DELIVERED', 'SLOANE', c.executionId ?? null);
    return { before: { lifecycle: r!.lifecycle }, after: { lifecycle: 'DELIVERED', generationId: gen.id }, afterRef: r!.id, result: { pbcRequestId: r!.id, generationId: gen.id }, timeline: `${r!.pbcNumber} marked delivered (${gen.fileName})` };
    void u;
  },
};
const selOf = (p: ActionProposal, c: ActionContext, id: string) => { const n = Number(str(p, 'selection').replace(/\D/g, '')); return c.pbc!.evaluate(id, vis(c))?.selections.find((x) => x.no === n) ?? null; };
const resolveSelection: Service = {
  type: 'RESOLVE_AUDIT_SELECTION', permission: 'SUPPORT_PACKAGE_CREATE', targetType: 'PBC_REQUEST',
  validate(p, c) {
    const { id, r } = reqOf(p, c);
    if (!c.pbc || !r) return { errors: [id ? `No PBC request ${id}.` : 'There is no PBC request in this conversation.'], warnings: [] };
    target(p, r);
    const s = selOf(p, c, r.id), key = str(p, 'transaction').toUpperCase();
    const errors: string[] = [];
    if (!s) errors.push(`${r.pbcNumber} has no selection ${str(p, 'selection') || '(none named)'}.`);
    const line = key ? c.gl.lines.find((l) => l.key.toUpperCase() === key) : null;
    if (!line) errors.push(key ? `${key} is not a governed transaction.` : 'Name the governed transaction the selection is.');
    else if (c.actor.scopeIds !== 'ALL' && !c.actor.scopeIds.includes(line.entity)) errors.push(`${key} is outside your scope.`);
    p.preview = [{ label: 'Selection', value: s ? `#${s.no} · ${s.original}` : '—' }, { label: 'Currently', value: s ? `${s.status.replace(/_/g, ' ').toLowerCase()} — ${s.reason}` : '—' },
      { label: 'Match to', value: line ? `${line.key} · ${line.entity} · ${line.postingDate} · ${usd(line.usd)}${line.vendor ? ` · ${line.vendor}` : ''}` : key || '—' }];
    const warnings = s && line && s.candidates.length && !s.candidates.some((x) => x.key === line.key) ? [`${line.key} is not one of the candidates Korvyn found for selection ${s.no}.`] : [];
    return { errors, warnings };
  },
  targetVersion: (p, c) => reqOf(p, c).r?.version ?? null,
  execute(p, c) {
    const { r } = reqOf(p, c), s = selOf(p, c, r!.id)!;
    const u = c.pbc!.resolveSelection(c.actor, r!.id, s.id, str(p, 'transaction'), str(p, 'note') || 'Matched by the user', 'SLOANE', c.executionId ?? null);
    return { before: { selection: s.no, status: s.status }, after: { chosenKey: str(p, 'transaction').toUpperCase() }, afterRef: r!.id, result: { pbcRequestId: r!.id, pbcVersion: String(u.version) }, timeline: `${r!.pbcNumber} selection ${s.no} matched to ${str(p, 'transaction').toUpperCase()}` };
  },
};
function gapOf(p: ActionProposal, c: ActionContext, id: string) {
  const n = Number(str(p, 'selection').replace(/\D/g, '')), ev = (evidenceIn(` ${str(p, 'evidence').toLowerCase()} `)[0] ?? null) as EvidenceType | null;
  const gaps = c.pbc!.evaluate(id, vis(c))?.gaps.filter((g) => g.selectionNo === n && g.status === 'OPEN') ?? [];
  return ev ? gaps.filter((g) => g.requirement === ev) : gaps;
}
const resolveGap: Service = {
  type: 'RESOLVE_SUPPORT_GAP', permission: 'SUPPORT_ATTACH', targetType: 'PBC_REQUEST',
  validate(p, c) {
    const { id, r } = reqOf(p, c);
    if (!c.pbc || !r) return { errors: [id ? `No PBC request ${id}.` : 'There is no PBC request in this conversation.'], warnings: [] };
    target(p, r);
    const gs = gapOf(p, c, r.id), mode = str(p, 'mode') === 'WAIVE' ? 'WAIVE' : 'LINK', errors: string[] = [];
    if (!gs.length) errors.push(`Selection ${str(p, 'selection') || '?'} has no open ${str(p, 'evidence') || 'support'} gap on ${r.pbcNumber}.`);
    else if (gs.length > 1) errors.push(`Selection ${str(p, 'selection')} has ${gs.length} open gaps (${gs.map((g) => g.kind).join(', ')}) — name which one.`);
    const g = gs[0];
    if (g && mode === 'LINK' && (!g.transactionId || g.requirement === 'SELECTION')) errors.push('A reference can only be linked to a gap on a matched transaction.');
    if (mode === 'LINK' && !str(p, 'reference').trim()) errors.push('Name the reference to link (e.g. an invoice number).');
    if (mode === 'WAIVE' && !str(p, 'note').trim()) errors.push('A waiver needs a reason.');
    p.preview = [{ label: 'Gap', value: g ? `Selection ${g.selectionNo} · ${g.kind} · ${usd(g.amountUsd)} · ${g.severity.toLowerCase()}` : '—' },
      { label: mode === 'LINK' ? 'Link' : 'Waive', value: mode === 'LINK' ? `${g && g.requirement !== 'SELECTION' ? EVIDENCE_LABEL[g.requirement as EvidenceType] : 'Reference'} ${str(p, 'reference')} → ${g?.transactionId ?? '—'} (a reference, not a document)` : `Reason: ${str(p, 'note')}` }];
    return { errors, warnings: mode === 'WAIVE' ? ['A waived gap is stated on the package’s Exceptions tab with its reason.'] : [] };
  },
  targetVersion: (p, c) => reqOf(p, c).r?.version ?? null,
  execute(p, c) {
    const { r } = reqOf(p, c), g = gapOf(p, c, r!.id)[0]!;
    const u = str(p, 'mode') === 'WAIVE' ? c.pbc!.resolveGap(c.actor, r!.id, g.id, { status: 'WAIVED', note: str(p, 'note') }, 'SLOANE', c.executionId ?? null)
      : c.pbc!.linkEvidence(c.actor, r!.id, g.id, str(p, 'reference').trim(), 'SLOANE', c.executionId ?? null);
    return { before: { gap: g.gapKey, status: 'OPEN' }, after: { mode: str(p, 'mode') || 'LINK' }, afterRef: r!.id, result: { pbcRequestId: r!.id, pbcVersion: String(u.version) }, timeline: `${r!.pbcNumber} selection ${g.selectionNo}: ${g.kind} ${str(p, 'mode') === 'WAIVE' ? 'waived' : `linked ${str(p, 'reference')}`}` };
  },
};
registerActionServices([refreshPBC, deliverPBC, resolveSelection, resolveGap], {
  REFRESH_PBC_REQUEST: 'Refresh the PBC request', MARK_PBC_DELIVERED: 'Mark the PBC package delivered', RESOLVE_AUDIT_SELECTION: 'Match an audit selection', RESOLVE_SUPPORT_GAP: 'Resolve a support gap',
});
export const PBC_ACTIONS_LOADED = true;
