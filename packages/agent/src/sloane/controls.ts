/**
 * GOVERNED CONTROL OBJECTS — reconciliations, flux, close, reporting, audit and evidence, server-side.
 *
 * What is DERIVED from the governed ledger (never stored): every balance, tie status, reconciling item, flux
 * variance, materiality test, population total, tie-out, selection and support coverage.
 *
 * What is STORED (workflow state — a fact about people, which no balance can derive): preparer and reviewer
 * assignments, review status, explanation text and its approval, comments, close task status, saved report
 * definitions, published-report and package records, PBC requests. These are seeded for the prototype and named
 * as seeded on every object that reads them. No store below holds an amount.
 *
 * READ ONLY. Nothing here writes a comment, attaches support, publishes, certifies or changes a mapping.
 */
import { money, periodLabel } from './financials.js';
import { AP_EXTRACT, FX_CLOSING_SET, type GLine, type GovernedLedger, SOURCE_HEALTH, pct } from './governed.js';
import { WORK } from './store.js';

type Vis = Set<string> | 'ALL';
const inVis = (v: Vis, e: string) => v === 'ALL' || v.has(e);
const TIE_TOLERANCE_USD = 1_000;
export const SEEDED = 'Workflow state (assignments, status, comments) is read from the durable Korvyn work store; every amount is derived from the governed ledger.';

/* ================================================================================================
   RECONCILIATIONS
   ================================================================================================ */
export type RecMethod = 'SUBLEDGER' | 'INTERCOMPANY' | 'ROLLFORWARD' | 'BANK' | 'MODULE';
export interface RecDef { id: string; entity: string; accounts: string[]; name: string; method: RecMethod; preparer: string; reviewer: string; supportRequirements: { id: string; label: string; kind: string }[]; financialLineId?: string | null }
export class ControlService {
  constructor(readonly gl: GovernedLedger) {}

  /* ---- reconciliations ---------------------------------------------------------------------------- */
  recDefs(): RecDef[] {
    const out: RecDef[] = [];
    const cip = [{ id: 'proj-rf', label: 'Project roll-forward', kind: 'WORKPAPER' }, { id: 'pis-memo', label: 'Placed-in-service memo (quarter-end)', kind: 'MEMO' }];
    for (const e of ['MDH', 'MER-UK', 'MER-DE', 'MER-SG']) {
      out.push({ id: `REC-${e}-15000`, entity: e, accounts: ['15000'], name: `Construction in progress — ${e}`, method: 'SUBLEDGER', preparer: e === 'MER-DE' ? 'K. Weber' : 'M. Reyes', reviewer: 'L. Chen', supportRequirements: cip });
      out.push({ id: `REC-${e}-10100`, entity: e, accounts: ['10100'], name: `Operating cash — ${e}`, method: 'BANK', preparer: 'A. Okafor', reviewer: 'L. Chen', supportRequirements: [{ id: 'bank-stmt', label: 'Bank statement', kind: 'BANK_STATEMENT' }] });
    }
    out.push({ id: 'REC-MDH-20100', entity: 'MDH', accounts: ['20100'], name: 'Trade payables — MDH', method: 'ROLLFORWARD', preparer: 'A. Okafor', reviewer: 'L. Chen', supportRequirements: [{ id: 'ap-aging', label: 'AP aging report', kind: 'REPORT' }] });
    out.push({ id: 'REC-MDH-21200', entity: 'MDH', accounts: ['21200'], name: 'Accrued interest — MDH', method: 'ROLLFORWARD', preparer: 'M. Reyes', reviewer: 'L. Chen', supportRequirements: [{ id: 'debt-sched', label: 'Debt interest schedule', kind: 'WORKPAPER' }] });
    out.push({ id: 'REC-MDH-13100', entity: 'MDH', accounts: ['13100'], name: 'Intercompany receivable — MDH vs foreign OpCos', method: 'INTERCOMPANY', preparer: 'M. Reyes', reviewer: 'L. Chen', supportRequirements: [{ id: 'ic-conf', label: 'Counterparty confirmations', kind: 'CONFIRMATION' }] });
    out.push({ id: 'REC-MGP-REIT-13100', entity: 'MGP-REIT', accounts: ['13100'], name: 'Intercompany receivable — REIT vs MDH', method: 'INTERCOMPANY', preparer: 'M. Reyes', reviewer: 'L. Chen', supportRequirements: [{ id: 'ic-conf', label: 'Counterparty confirmation', kind: 'CONFIRMATION' }] });
    return out;
  }
  /** the Reconciliations module's governed definitions: server-authoritative WORKFLOW, balances computed by the module */
  moduleRecDefs(): RecDef[] {
    return WORK.repos.reconciliations.definitions().filter((d) => d.catalog === 'MODULE').map((d) => ({ id: d.definitionId, entity: 'GROUP', accounts: [], name: d.name, method: 'MODULE' as const, preparer: d.preparer, reviewer: d.reviewer, supportRequirements: [], financialLineId: d.financialLineId } as RecDef));
  }
  allRecDefs(): RecDef[] { return [...this.recDefs(), ...this.moduleRecDefs()]; }
  recDef(id: string) { return this.allRecDefs().find((d) => d.id === id) ?? null; }

  /** Everything about one reconciliation for one period, derived. */
  reconcile(def: RecDef, period: string) {
    const L = this.gl;
    const glBal = L.balanceUsd(def.accounts, period, 'ALL', [def.entity]);
    const prior = L.priorPeriod(period);
    const opening = prior ? L.balanceUsd(def.accounts, prior, 'ALL', [def.entity]) : 0;
    const items: { id: string; label: string; amountUsd: number; kind: string }[] = [];
    let comparison: number | null = null, comparisonLabel = '', tieStatus: 'TIED' | 'NOT_TIED' | 'SOURCE_NOT_CONNECTED' | 'COMPUTED_IN_MODULE' = 'TIED';
    const sourceIssues: string[] = [];
    const conn = L.entities().find((e) => e.id === def.entity)?.connector ?? 'unknown';
    const health = SOURCE_HEALTH[conn];
    if (def.method === 'SUBLEDGER') {
      const rows = L.lines.filter((l) => l.entity === def.entity && L.expandAccounts(def.accounts).includes(l.account) && l.period <= period);
      const rate = (l: GLine) => FX_CLOSING_SET.toUsd[l.currency]![period]!;
      const byProj = new Map<string, number>();
      rows.forEach((l) => byProj.set(l.project ?? 'Unassigned', (byProj.get(l.project ?? 'Unassigned') ?? 0) + l.local * rate(l)));
      comparison = [...byProj.entries()].filter(([k]) => k !== 'Unassigned').reduce((s, [, v]) => s + v, 0);
      comparisonLabel = 'Project subledger (sum of CIP by project)';
      const un = byProj.get('Unassigned');
      if (un && Math.abs(un) >= 1) items.push({ id: `${def.id}-UNASSIGNED`, label: 'CIP lines without a project', amountUsd: un, kind: 'UNASSIGNED_PROJECT' });
    } else if (def.method === 'INTERCOMPANY') {
      const cps = def.entity === 'MDH' ? ['MER-UK', 'MER-DE', 'MER-SG'] : ['MDH'];
      let counter = 0;
      for (const cp of cps) {
        const from = L.lines.filter((l) => l.entity === def.entity && l.account === '13100' && l.period <= period && (def.entity === 'MGP-REIT' || l.description.includes(cp))).reduce((s, l) => s + l.local * FX_CLOSING_SET.toUsd[l.currency]![period]!, 0);
        const to = -L.lines.filter((l) => l.entity === cp && l.account === '23100' && l.period <= period && (cp !== 'MDH' || /management fee/.test(l.description))).reduce((s, l) => s + l.local * FX_CLOSING_SET.toUsd[l.currency]![period]!, 0);
        counter += to;
        const d = from - to;
        if (Math.abs(d) >= TIE_TOLERANCE_USD) items.push({ id: `${def.id}-${cp}`, label: `Due from ${cp} vs ${cp} due to ${def.entity}`, amountUsd: d, kind: 'INTERCOMPANY_DIFFERENCE' });
      }
      comparison = counter; comparisonLabel = 'Counterparty payables, translated at the closing rate set';
    } else if (def.method === 'ROLLFORWARD') {
      const act = L.lines.filter((l) => l.entity === def.entity && def.accounts.includes(l.account) && l.period === period).reduce((s, l) => s + l.local * FX_CLOSING_SET.toUsd[l.currency]![period]!, 0);
      comparison = opening + act; comparisonLabel = 'Opening balance + period activity';
    } else if (def.method === 'MODULE') {
      comparisonLabel = 'Computed by the Reconciliations module'; tieStatus = 'COMPUTED_IN_MODULE';
      sourceIssues.push(`${def.name}'s balance, difference and reconciling items are computed by the Reconciliations module (${def.financialLineId ?? 'statement line'}); the server book does not model that line. Workflow — status, comments, support and reviewer — is server-authoritative.`);
    } else {
      comparisonLabel = 'Bank statement balance'; tieStatus = 'SOURCE_NOT_CONNECTED';
      sourceIssues.push('Bank statements are not connected; the cash balance cannot be proven against the bank.');
    }
    if (health && health.status !== 'AVAILABLE') sourceIssues.push(`${health.system}: ${health.note}`);
    const difference = comparison === null ? null : glBal - comparison - items.filter((i) => i.kind === 'UNASSIGNED_PROJECT').reduce((s, i) => s + i.amountUsd, 0);
    if (tieStatus !== 'SOURCE_NOT_CONNECTED' && tieStatus !== 'COMPUTED_IN_MODULE') tieStatus = items.some((i) => i.kind === 'INTERCOMPANY_DIFFERENCE') || (difference !== null && Math.abs(difference) >= TIE_TOLERANCE_USD) ? 'NOT_TIED' : 'TIED';
    const key = `recon:${def.id}:${period}`;
    const wf = { status: (WORK.repos.reconciliations.status(def.id)?.status ?? 'NOT_STARTED') as string };
    const thread = WORK.thread(key);
    const isQuarterEnd = Number(period.slice(5, 7)) % 3 === 0;
    const reqs = def.supportRequirements.filter((r) => r.id !== 'pis-memo' || isQuarterEnd);
    const attached = Object.fromEntries(WORK.repos.records.list<{ requirement: string; reference: string }>('SUPPORT_REQUIREMENT_ATTACHMENT', { target: key }).map((x) => [x.requirement, x.reference]));
    const support = reqs.map((r) => ({ requirement: r.label, kind: r.kind, reference: attached[r.id] ?? null, status: attached[r.id] ? 'ATTACHED_METADATA' : 'MISSING', documentConnected: false }));
    return {
      id: def.id, name: def.name, entity: def.entity, accounts: def.accounts, method: def.method, period,
      openingUsd: opening, glBalanceUsd: glBal, comparisonUsd: comparison, comparisonLabel, differenceUsd: difference, items, tieStatus,
      workflow: { status: wf.status, preparer: def.preparer, reviewer: WORK.reviewer(key)?.name ?? def.reviewer, comments: thread.comments, threadVersion: thread.version, due: `${period}-BD5` },
      attachedEvidence: WORK.relsTo(key), balanceInModule: def.method === 'MODULE', financialLineId: def.financialLineId ?? null,
      support, supportComplete: support.every((s) => s.status !== 'MISSING'), sourceIssues,
    };
  }
  reconciliations(period: string, vis: Vis) { return this.recDefs().filter((d) => inVis(vis, d.entity)).map((d) => this.reconcile(d, period)); }

  /* ---- flux ---------------------------------------------------------------------------------------- */
  fluxItems(period: string, vis: Vis, comparison?: string) {
    const L = this.gl;
    const prior = comparison ?? L.priorPeriod(period);
    if (!prior) return [];
    const groups = L.accounts().filter((a) => !a.postable || !a.parent).map((a) => a.code);
    return groups.map((g) => {
      const cur = L.presented(g, L.balanceUsd([g], period, vis)), pri = L.presented(g, L.balanceUsd([g], prior, vis));
      const d = cur - pri;
      const material = Math.abs(d) >= 1_000_000 || (Math.abs(d) >= 250_000 && Math.abs(pri) > 0 && Math.abs(d / pri) >= 0.1);
      const exr = WORK.repos.flux.explanation(g, period);
      const ex = exr ? { id: exr.explanationId, status: exr.status, text: exr.text, author: exr.author, reviewer: exr.reviewer, version: exr.version, supportRefs: exr.supportRefs } : null;
      const thread = WORK.thread(`flux:${g}:${period}`);
      const status = !material ? 'NOT_REQUIRED' : !ex ? 'UNEXPLAINED' : ex.status;
      return { id: `FLUX-${g}-${period}`, account: g, name: `${g} ${L.account(g)?.name ?? ''}`, section: L.account(g)?.section ?? '', period, comparison: prior, currentUsd: cur, priorUsd: pri, changeUsd: d, changePct: pct(cur, pri), material, status, explanation: ex ?? null,
        comments: thread.comments, threadVersion: thread.version, reviewer: WORK.reviewer(`flux:${g}:${period}`)?.name ?? ex?.reviewer ?? null, attachedEvidence: WORK.relsTo(`flux:${g}:${period}`) };
    }).filter((i) => Math.abs(i.currentUsd) + Math.abs(i.priorUsd) >= 1).sort((a, b) => Math.abs(b.changeUsd) - Math.abs(a.changeUsd));
  }

  /* ---- close --------------------------------------------------------------------------------------- */
  closeTasks(period: string, vis: Vis) {
    const working = this.gl.periods().at(-1)!;
    const stored = WORK.repos.close.tasks(working).map((t) => ({ id: t.taskId, name: t.name, workstream: t.workstream, entity: t.entity, owner: t.owner, approver: t.approver, due: t.due, status: t.state, blockedBy: t.blockedBy ?? undefined, version: t.version }));
    const base = period === working ? stored : stored.map((t) => ({ ...t, status: 'COMPLETE' }));
    return base.filter((t) => t.entity === 'GROUP' ? vis === 'ALL' : inVis(vis, t.entity));
  }
  closeBlockers(period: string, vis: Vis) {
    const recs = this.reconciliations(period, vis), flux = this.fluxItems(period, vis), tasks = this.closeTasks(period, vis);
    const out: { kind: string; ref: string; label: string; entity: string; amountUsd: number | null; severity: 'BLOCKING' | 'HIGH' | 'MEDIUM' }[] = [];
    recs.filter((r) => r.tieStatus === 'NOT_TIED').forEach((r) => out.push({ kind: 'RECONCILIATION_NOT_TIED', ref: r.id, label: `${r.name} does not tie`, entity: r.entity, amountUsd: r.items.reduce((s, i) => s + Math.abs(i.amountUsd), 0) || Math.abs(r.differenceUsd ?? 0), severity: 'BLOCKING' }));
    recs.filter((r) => r.workflow.status === 'RETURNED').forEach((r) => out.push({ kind: 'RECONCILIATION_RETURNED', ref: r.id, label: `${r.name} returned by reviewer`, entity: r.entity, amountUsd: null, severity: 'HIGH' }));
    flux.filter((f) => f.status === 'UNEXPLAINED').forEach((f) => out.push({ kind: 'FLUX_UNEXPLAINED', ref: f.id, label: `Material movement unexplained: ${f.name}`, entity: 'GROUP', amountUsd: Math.abs(f.changeUsd), severity: 'BLOCKING' }));
    tasks.filter((t) => t.status === 'BLOCKED').forEach((t) => out.push({ kind: 'TASK_BLOCKED', ref: t.id, label: `${t.name} — ${t.blockedBy ?? 'blocked'}`, entity: t.entity, amountUsd: null, severity: 'BLOCKING' }));
    for (const [k, h] of Object.entries(SOURCE_HEALTH)) if (h.status === 'UNAVAILABLE') {
      const ents = this.gl.entities().filter((e) => e.connector === k && inVis(vis, e.id));
      ents.forEach((e) => out.push({ kind: 'SOURCE_UNAVAILABLE', ref: h.instance, label: `${h.system} source unavailable for ${e.name}`, entity: e.id, amountUsd: null, severity: 'HIGH' }));
    }
    const rank = { BLOCKING: 0, HIGH: 1, MEDIUM: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.amountUsd ?? 0) - (a.amountUsd ?? 0));
  }
  pendingApprovals(period: string, vis: Vis) {
    const out: { kind: string; ref: string; label: string; approver: string; entity: string }[] = [];
    this.reconciliations(period, vis).filter((r) => r.workflow.status === 'IN_REVIEW').forEach((r) => out.push({ kind: 'RECONCILIATION_REVIEW', ref: r.id, label: r.name, approver: r.workflow.reviewer, entity: r.entity }));
    this.fluxItems(period, vis).filter((f) => f.status === 'SUBMITTED').forEach((f) => out.push({ kind: 'FLUX_EXPLANATION', ref: f.id, label: f.name, approver: f.explanation!.reviewer, entity: 'GROUP' }));
    this.closeTasks(period, vis).filter((t) => t.status === 'AWAITING_APPROVAL').forEach((t) => out.push({ kind: 'CLOSE_TASK', ref: t.id, label: t.name, approver: t.approver, entity: t.entity }));
    return out;
  }
  closeReadiness(period: string, vis: Vis) {
    const tasks = this.closeTasks(period, vis), recs = this.reconciliations(period, vis), flux = this.fluxItems(period, vis).filter((f) => f.material);
    const done = tasks.filter((t) => t.status === 'COMPLETE').length;
    const recOk = recs.filter((r) => r.tieStatus === 'TIED' && r.workflow.status === 'APPROVED').length;
    const fluxOk = flux.filter((f) => f.status === 'APPROVED').length;
    const parts = [{ l: 'Close tasks complete', n: done, d: tasks.length }, { l: 'Reconciliations tied and approved', n: recOk, d: recs.length }, { l: 'Material flux explained and approved', n: fluxOk, d: flux.length }];
    const num = parts.reduce((s, p) => s + p.n, 0), den = parts.reduce((s, p) => s + p.d, 0);
    return { period, readinessPct: den ? Math.round((num / den) * 100) : 100, parts, blockers: this.closeBlockers(period, vis) };
  }
  continuousCloseSignals(period: string, vis: Vis) {
    const L = this.gl, out: { signal: string; ref: string; detail: string; amountUsd: number | null }[] = [];
    this.reconciliations(period, vis).filter((r) => r.method === 'INTERCOMPANY').forEach((r) => r.items.forEach((i) => out.push({ signal: 'INTERCOMPANY_MISMATCH', ref: i.id, detail: i.label, amountUsd: i.amountUsd })));
    const rows = L.lines.filter((l) => l.period === period && inVis(vis, l.entity));
    const missingApr = rows.filter((l) => l.approvalRequired && !l.approvalRef);
    if (missingApr.length) out.push({ signal: 'MISSING_APPROVAL_REFERENCE', ref: 'AP bills', detail: `${missingApr.length} AP lines above the approval threshold carry no approval reference`, amountUsd: missingApr.reduce((s, l) => s + Math.abs(l.usd), 0) });
    const late = rows.filter((l) => l.day >= 27 && /Capital|Placed in service/.test(l.description));
    if (late.length) out.push({ signal: 'LATE_CAPITAL_POSTING', ref: 'CIP', detail: `${late.length} capital lines posted in the last days of the period`, amountUsd: late.reduce((s, l) => s + Math.abs(l.usd), 0) / 2 });
    for (const h of Object.values(SOURCE_HEALTH)) if (h.status !== 'AVAILABLE') out.push({ signal: `SOURCE_${h.status}`, ref: h.instance, detail: `${h.system}: ${h.note}`, amountUsd: null });
    return out;
  }

  /* ---- reporting ----------------------------------------------------------------------------------- */
  reports() { return WORK.repos.reports.definitions().map((r) => ({ id: r.id, name: r.name, owner: r.owner, kind: r.kind, definitionVersion: r.definitionVersion, lines: r.lines })); }
  report(id: string) { return this.reports().find((r) => r.id === id) ?? null; }
  published() { return WORK.repos.reports.published() as unknown as { id: string; reportId: string; name: string; period: string; version: number; publishedBy: string; publishedAt: string; snapshotId: string }[]; }
  packages() { return WORK.repos.reports.packages() as unknown as { id: string; name: string; period: string; status: string; owner: string; contents: string[] }[]; }
  reportData(id: string, period: string, vis: Vis) {
    const r = this.report(id)!;
    const prior = this.gl.priorPeriod(period);
    return r.lines.map((ln) => {
      const g = ln.accounts[0]!;
      const cur = ln.accounts.reduce((s, a) => s + this.gl.presented(g, this.gl.balanceUsd([a], period, vis)), 0);
      const pri = prior ? ln.accounts.reduce((s, a) => s + this.gl.presented(g, this.gl.balanceUsd([a], prior, vis)), 0) : null;
      return { label: ln.label, accounts: ln.accounts, currentUsd: cur, priorUsd: pri };
    });
  }

  /* ---- audit --------------------------------------------------------------------------------------- */
  auditPopulations() { return AUDIT_POPS; }
  auditPopulation(id: string) { return AUDIT_POPS.find((p) => p.id === id) ?? null; }
  pbc() { return WORK.repos.records.list<{ title: string; populationId: string | null; owner: string; requestedBy: string; due: string }>('PBC_REQUEST').map((r) => ({ id: r.id, title: r.title, populationId: r.populationId, owner: r.owner, requestedBy: r.requestedBy, due: r.due, status: r.status ?? 'OPEN' })); }

  /* ---- evidence ------------------------------------------------------------------------------------ */
  evidenceForLines(rows: GLine[]) {
    const ap = rows.filter((l) => l.vendor && l.account !== '20100');
    const invoices = ap.filter((l) => l.invoiceRef), pos = ap.filter((l) => l.poRef), contracts = [...new Set(ap.map((l) => l.contractRef).filter(Boolean))];
    const aprReq = rows.filter((l) => l.approvalRequired), aprOk = aprReq.filter((l) => l.approvalRef);
    const missing = ap.map((l) => ({ line: l, gaps: [!l.invoiceRef ? 'invoice reference' : '', l.approvalRequired && !l.approvalRef ? 'approval reference' : '', l.project && !l.poRef ? 'PO reference' : ''].filter(Boolean) })).filter((m) => m.gaps.length);
    return {
      apLines: ap.length, nonApLines: rows.length - ap.length, invoiceRefs: invoices.length, poRefs: pos.length, contractRefs: contracts.length,
      approvalsRequired: aprReq.length, approvalRefs: aprOk.length, missing, documentConnected: false, source: AP_EXTRACT.id,
    };
  }
}

const AUDIT_POPS = [
  { id: 'AUD-POP-CIP-ADD', name: 'CIP additions', accounts: ['15100', '15200', '15400'], description: 'Capital expenditure — CIP addition', sign: 'debit' as const, tieOutTo: 'Gross debits to CIP accounts from capital additions' },
  { id: 'AUD-POP-AP-OPEX', name: 'Operating expense vendor bills', accounts: ['50000', '60000'], description: 'Vendor bill — operating expense', sign: 'debit' as const, tieOutTo: 'Operating expense debits from vendor bills' },
  { id: 'AUD-POP-REVENUE', name: 'Customer revenue invoices', accounts: ['40000'], description: 'Customer invoice — recurring services', sign: 'credit' as const, tieOutTo: 'Revenue credits from customer invoices' },
];

export const fmtUsd = (v: number | null) => (v === null ? '—' : money(v, 'USD'));
export { periodLabel };
