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
import { createHash } from 'node:crypto';
import { money, periodLabel } from './financials.js';
import { AP_EXTRACT, FX_CLOSING_SET, type GLine, type GovernedLedger, SOURCE_HEALTH, pct } from './governed.js';
import { WORK } from './store.js';
import { FLUX_LINE_ACCOUNTS, closeTaskView, fluxAccountComments, fluxExplanation } from './book.js';
import { StaleVersionError } from './persistence/repositories.js';

/* ---- recorded bank statement balances (a preparer's input, versioned) ------------------------------- */
export interface ReconStatementView { id: string; reconciliationId: string; period: string; amountUsd: number; reference: string; statementDate: string; enteredBy: string; version: number; updatedAt: string }
const STMT = 'RECON_STATEMENT';
export function reconStatement(recId: string, period: string): ReconStatementView | null {
  const r = WORK.repos.records.list<{ reconciliationId: string; amountUsd: number; reference: string; statementDate: string; enteredBy: string }>(STMT, { target: `${recId}:${period}` })[0];
  return r ? { id: r.id, reconciliationId: r.reconciliationId, period: r.period ?? period, amountUsd: r.amountUsd, reference: r.reference, statementDate: r.statementDate, enteredBy: r.enteredBy, version: r.version, updatedAt: r.updatedAt } : null;
}
/** record (or change, with the version read) the statement balance a BANK reconciliation is proven against */
export function recordReconStatement(recId: string, period: string, v: { amountUsd: number; reference: string; statementDate: string }, expectedVersion: number | null, actor: { id: string; name: string }) {
  const cur = WORK.repos.records.list<Record<string, unknown>>(STMT, { target: `${recId}:${period}` })[0];
  const body = { reconciliationId: recId, amountUsd: v.amountUsd, reference: v.reference, statementDate: v.statementDate, enteredBy: actor.name };
  if (!cur) {
    if (expectedVersion !== null && expectedVersion !== 0) throw new StaleVersionError(STMT, recId, expectedVersion, 0);
    return WORK.repos.records.insert(STMT, body, actor.id, { prefix: 'BANKSTMT', target: `${recId}:${period}`, period, status: 'RECORDED' });
  }
  return WORK.repos.records.update(STMT, cur.id, expectedVersion, actor.id, () => body);
}
export type ReconBalance = {
  reconciliationId: string; name: string; period: string; scope: string; method: RecMethod; accounts: string[]; financialLineId: string | null;
  workflowStatus: string; preparer: string; reviewer: string;
} & ({ available: false; reason: string } | {
  available: true; id: string; version: number; fingerprint: string; dataVersion: string; computedAt: string;
  glBalanceUsd: number; supportingBalanceUsd: number | null; supportingLabel: string; differenceUsd: number | null; tieStatus: string;
  items: { id: string; label: string; kind: string; amountUsd: number }[]; statementVersion: number | null; sourceIssues: string[];
});

type Vis = Set<string> | 'ALL';
const inVis = (v: Vis, e: string) => v === 'ALL' || v.has(e);
const TIE_TOLERANCE_USD = 1_000;
export const SEEDED = 'Workflow state (assignments, status, comments) is read from the durable Korvyn work store; every amount is derived from the governed ledger.';

/* ================================================================================================
   RECONCILIATIONS
   ================================================================================================ */
export type RecMethod = 'SUBLEDGER' | 'INTERCOMPANY' | 'ROLLFORWARD' | 'BANK' | 'MODULE';
export interface RecDef { id: string; entity: string; accounts: string[]; name: string; method: RecMethod; preparer: string; reviewer: string; supportRequirements: { id: string; label: string; kind: string }[]; financialLineId?: string | null; serverModelled?: boolean }
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
  /** the Reconciliations module's governed definitions, with server-authoritative workflow.
   *  4A — BALANCES TOO, where the server book models the line. A module reconciliation whose statement line is the only
   *  reconciliation on that line, and whose line maps to a server account group (FLUX_LINE_ACCOUNTS — the existing
   *  navigation crosswalk, not a new mapping), is reconciled on the server book at group scope: cash against a recorded
   *  bank statement balance, everything else as a roll-forward. A line the server book does not model (the four CIP
   *  groups share FS-CIP and the server carries CIP by project, not by those groups; the debt split; right-of-use …) stays
   *  MODULE: its balance is not server-authoritative and nothing that needs proof may cite it. */
  moduleRecDefs(): RecDef[] {
    const defs = WORK.repos.reconciliations.definitions().filter((d) => d.catalog === 'MODULE');
    const perLine = new Map<string, number>();
    for (const d of defs) if (d.financialLineId) perLine.set(d.financialLineId, (perLine.get(d.financialLineId) ?? 0) + 1);
    return defs.map((d) => {
      const accts = d.financialLineId && perLine.get(d.financialLineId) === 1 ? FLUX_LINE_ACCOUNTS[d.financialLineId] ?? null : null;
      const bank = d.financialLineId === 'FS-CASH';
      return { id: d.definitionId, entity: 'GROUP', accounts: accts ?? [], name: d.name, method: (!accts ? 'MODULE' : bank ? 'BANK' : 'ROLLFORWARD') as RecMethod, preparer: d.preparer, reviewer: d.reviewer,
        supportRequirements: bank && accts ? [{ id: 'bank-stmt', label: 'Bank statements (all accounts)', kind: 'BANK_STATEMENT' }] : [], financialLineId: d.financialLineId, serverModelled: !!accts } as RecDef;
    });
  }
  allRecDefs(): RecDef[] { return [...this.recDefs(), ...this.moduleRecDefs()]; }
  recDef(id: string) { return this.allRecDefs().find((d) => d.id === id) ?? null; }

  /** Everything about one reconciliation for one period, derived. */
  reconcile(def: RecDef, period: string) {
    const L = this.gl;
    /* a GROUP reconciliation (a module line the server models) covers every entity */
    const ents = def.entity === 'GROUP' ? undefined : [def.entity];
    const inEnt = (e: string) => !ents || ents.includes(e);
    const acctSet = new Set(L.expandAccounts(def.accounts));
    const glBal = L.balanceUsd(def.accounts, period, 'ALL', ents);
    const prior = L.priorPeriod(period);
    const opening = prior ? L.balanceUsd(def.accounts, prior, 'ALL', ents) : 0;
    const items: { id: string; label: string; amountUsd: number; kind: string }[] = [];
    let comparison: number | null = null, comparisonLabel = '', tieStatus: 'TIED' | 'NOT_TIED' | 'SOURCE_NOT_CONNECTED' | 'COMPUTED_IN_MODULE' = 'TIED';
    const sourceIssues: string[] = [];
    let statement: ReconStatementView | null = null;
    const conn = def.entity === 'GROUP' ? 'group' : L.entities().find((e) => e.id === def.entity)?.connector ?? 'unknown';
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
      /* opening + activity, both at this period's closing rate, plus the translation of the opening balance from the
         prior closing rate to this one — the three pieces a multi-currency roll-forward is made of. Zero translation
         for a USD entity. */
      const rate = (l: GLine, p: string) => FX_CLOSING_SET.toUsd[l.currency]![p]!;
      const rows = L.lines.filter((l) => inEnt(l.entity) && acctSet.has(l.account));
      const act = rows.filter((l) => l.period === period).reduce((s, l) => s + l.local * rate(l, period), 0);
      const fx = prior ? rows.filter((l) => l.period <= prior).reduce((s, l) => s + l.local * (rate(l, period) - rate(l, prior)), 0) : 0;
      comparison = opening + act + fx;
      comparisonLabel = Math.abs(fx) >= 0.005 ? 'Opening balance + period activity + translation of the opening balance' : 'Opening balance + period activity';
    } else if (def.method === 'MODULE') {
      comparisonLabel = 'Computed by the Reconciliations module'; tieStatus = 'COMPUTED_IN_MODULE';
      sourceIssues.push(`${def.name}'s balance, difference and reconciling items are computed by the Reconciliations module (${def.financialLineId ?? 'statement line'}); the server book does not model that line. Workflow — status, comments, support and reviewer — is server-authoritative.`);
    } else {
      /* BANK: the supporting balance is the bank statement a preparer RECORDED (a fact about the outside world, entered
         with its reference). Without one the balance cannot be proven. */
      statement = reconStatement(def.id, period);
      if (statement) { comparison = statement.amountUsd; comparisonLabel = `Bank statement balance · ${statement.reference}`; }
      else {
        comparisonLabel = 'Bank statement balance'; tieStatus = 'SOURCE_NOT_CONNECTED';
        sourceIssues.push('No bank statement balance has been recorded for this period; the cash balance cannot be proven against the bank.');
      }
    }
    if (def.entity === 'GROUP' && def.method !== 'MODULE') for (const h of new Set(L.entities().map((e) => SOURCE_HEALTH[e.connector]).filter((h) => h && h.status !== 'AVAILABLE'))) sourceIssues.push(`${h!.system}: ${h!.note}`);
    else if (health && health.status !== 'AVAILABLE') sourceIssues.push(`${health.system}: ${health.note}`);
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
      id: def.id, name: def.name, entity: def.entity, accounts: def.accounts, method: def.method, period, statement,
      openingUsd: opening, glBalanceUsd: glBal, comparisonUsd: comparison, comparisonLabel, differenceUsd: difference, items, tieStatus,
      workflow: { status: wf.status, preparer: def.preparer, reviewer: WORK.reviewer(key)?.name ?? def.reviewer, comments: thread.comments, threadVersion: thread.version, due: `${period}-BD5` },
      attachedEvidence: WORK.relsTo(key), balanceInModule: def.method === 'MODULE', financialLineId: def.financialLineId ?? null,
      support, supportComplete: support.every((s) => s.status !== 'MISSING'), sourceIssues,
    };
  }
  reconciliations(period: string, vis: Vis) { return this.recDefs().filter((d) => inVis(vis, d.entity)).map((d) => this.reconcile(d, period)); }

  /** 4A — THE SERVER-AUTHORITATIVE RECONCILIATION BALANCE. What an artifact, Sloane and the Reconciliations workspace
   *  all cite: the GL balance, the supporting balance, the difference and the tie status — derived every time from the
   *  governed ledger and any recorded statement, and VERSIONED: the derived values are materialised as a snapshot record
   *  whose version moves only when a value moves (a changed fingerprint). A citation is (id, period, version).
   *  A module line the server book does not model returns `available:false` with the reason; it is never estimated. */
  reconBalance(def: RecDef, period: string): ReconBalance {
    const r = this.reconcile(def, period);
    const base = { reconciliationId: def.id, name: def.name, period, scope: def.entity, method: def.method, accounts: def.accounts, financialLineId: def.financialLineId ?? null,
      workflowStatus: r.workflow.status, preparer: r.workflow.preparer, reviewer: r.workflow.reviewer };
    if (r.tieStatus === 'COMPUTED_IN_MODULE') return { ...base, available: false, reason: r.sourceIssues[0] ?? 'Not modelled on the server book.' };
    const c = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
    const values = { glBalanceUsd: c(r.glBalanceUsd)!, supportingBalanceUsd: c(r.comparisonUsd), supportingLabel: r.comparisonLabel, differenceUsd: c(r.differenceUsd), tieStatus: r.tieStatus,
      items: r.items.map((i) => ({ id: i.id, label: i.label, kind: i.kind, amountUsd: c(i.amountUsd)! })), statementVersion: r.statement?.version ?? null };
    const fingerprint = `RBF-${createHash('sha1').update(JSON.stringify(values)).digest('hex').slice(0, 12).toUpperCase()}`;
    const key = `${def.id}:${period}`, KIND = 'RECON_BALANCE', by = 'system:recon-balance';
    const body = { ...values, reconciliationId: def.id, fingerprint, dataVersion: this.gl.dataVersion() };
    const cur = WORK.repos.records.list<typeof body>(KIND, { target: key })[0];
    const rec = !cur ? WORK.repos.records.insert(KIND, body, by, { prefix: 'RECONBAL', target: key, period, scope: def.entity, status: r.tieStatus })
      : cur.fingerprint !== fingerprint ? WORK.repos.records.update<typeof body>(KIND, cur.id, cur.version, by, () => body, { status: r.tieStatus }) : cur;
    return { ...base, available: true, id: rec.id, version: rec.version, fingerprint, dataVersion: rec.dataVersion, computedAt: rec.updatedAt, ...values, sourceIssues: r.sourceIssues };
  }
  /** every reconciliation (both catalogs) an actor may see, with its server balance */
  reconBalances(period: string, vis: Vis) { return this.allRecDefs().filter((d) => (d.entity === 'GROUP' ? vis === 'ALL' : inVis(vis, d.entity))).map((d) => this.reconBalance(d, period)); }

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
      /* the ONE authoritative explanation record (book.ts) — the same one the Flux workspace edits */
      const exr = fluxExplanation(g, period);
      const ex = exr ? { id: exr.explanationId, status: exr.status, text: exr.text, author: exr.author, reviewer: exr.reviewer, version: exr.version, supportRefs: exr.supportRefs, updatedAt: exr.updatedAt, updatedBy: exr.updatedBy, lineId: exr.lineId } : null;
      /* one book: the account's own thread AND the thread of the Flux workspace line that presents it */
      const thread = { version: WORK.thread(`flux:${g}:${period}`).version, comments: fluxAccountComments(g, period) };
      const status = !material ? 'NOT_REQUIRED' : !ex ? 'UNEXPLAINED' : ex.status;
      return { id: `FLUX-${g}-${period}`, account: g, name: `${g} ${L.account(g)?.name ?? ''}`, section: L.account(g)?.section ?? '', period, comparison: prior, currentUsd: cur, priorUsd: pri, changeUsd: d, changePct: pct(cur, pri), material, status, explanation: ex ?? null,
        comments: thread.comments, threadVersion: thread.version, reviewer: WORK.reviewer(`flux:${g}:${period}`)?.name ?? ex?.reviewer ?? null, attachedEvidence: WORK.relsTo(`flux:${g}:${period}`) };
    }).filter((i) => Math.abs(i.currentUsd) + Math.abs(i.priorUsd) >= 1).sort((a, b) => Math.abs(b.changeUsd) - Math.abs(a.changeUsd));
  }

  /* ---- close --------------------------------------------------------------------------------------- */
  closeTasks(period: string, vis: Vis) {
    const working = this.gl.periods().at(-1)!;
    const stored = WORK.repos.close.tasks(working).map(closeTaskView).map((t) => ({ id: t.id, name: t.name, workstream: t.workstream, entity: t.entity, entityName: t.entityName, owner: t.owner, approver: t.reviewer, due: t.due, status: t.state, blockedBy: t.blockedBy ?? undefined, version: t.version, updatedBy: t.updatedBy, updatedAt: t.updatedAt }));
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
