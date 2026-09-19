/**
 * THE FINANCIAL GRAPH (Phase 8A) — a provider-neutral index of what Korvyn already knows, and how it relates.
 *
 * NOT A DATABASE. There is no graph store: every node and edge is read, on demand, from the service that owns it —
 * the governed ledger (entities, accounts, dimensions, populations), the control service (reconciliations, flux, close,
 * reports, audit populations, PBC), the work store (reviewers, evidence relationships), the identity and reviewer
 * directories, the reporting book's statement lines, and the tenant calendar. The graph holds identities and
 * relationships, never an amount it computed: an attribute that is a figure is copied from the service that derived
 * it, and every object names that service in `source` and, where one exists, the governed tool that states it.
 *
 * PERMISSIONS ARE STRUCTURAL. The full graph for a period is built once (a few seconds' cache, keyed by the ledger's
 * data version); what an ACTOR sees is a filtered copy — the capability each object type needs, the entity it belongs
 * to, and, for a scoped actor, only the people, systems and roles reachable from something they may see. An edge to a
 * hidden object is dropped with the object, so traversal cannot walk into what the actor may not see, and a search can
 * never tell "exists but hidden" from "does not exist". Nothing here reads the conversation to decide access.
 */
import type { Actor } from '../tools.js';
import { type FinancialDataService, money, periodLabel } from '../financials.js';
import { APPROVAL_THRESHOLD_USD, AP_EXTRACT, type GLine, type GovernedLedger, SOURCE_HEALTH, FX_CLOSING_SET } from '../governed.js';
import { type ControlService, FLUX_MATERIALITY, TIE_TOLERANCE_USD } from '../controls.js';
import { PEOPLE } from '../actions.js';
import { type Capability, DEV_DIRECTORY, ROLE_CAPABILITIES, SOD_POLICIES, personId } from '../auth.js';
import { BROWSER_BOOK, FLUX_LINE_ACCOUNTS } from '../book.js';
import { ENTITY_WORDS, PROJECT_ALIAS } from '../conversation.js';
import { ACCOUNT_ALIAS } from '../toolset.js';
import { WORK } from '../store.js';
import type { ArtifactEngine } from '../artifacts/engine.js';
import { type Edge, type Relation, type SemanticObject, type SemanticType, type TraceStep } from './model.js';
import { fiscalFrame, fiscalQuarterRange, fiscalYearOf, fiscalYearRange, fyLabel, quarterLabel, resolvePeriods } from './time.js';

export interface GraphDeps { data: FinancialDataService; gl: GovernedLedger; controls: ControlService; artifacts?: ArtifactEngine | null }
export interface Snapshot { key: string; period: string; nodes: Map<string, SemanticObject>; out: Map<string, Edge[]>; inn: Map<string, Edge[]>; edges: Edge[] }
export interface Hit { object: SemanticObject; score: number; matched: string }
export type Resolution =
  | { status: 'RESOLVED'; object: SemanticObject; alsoKnownAs: SemanticObject[]; term: string }
  | { status: 'AMBIGUOUS'; term: string; candidates: { object: SemanticObject; detail: string }[]; question: string }
  | { status: 'NOT_FOUND'; term: string; note: string }
  /** the words name several different objects ("budget vs actual") — each is its own object, not a choice between them */
  | { status: 'MULTIPLE'; term: string; objects: SemanticObject[] };
export interface Responsibility { person: SemanticObject; relation: 'PREPARER' | 'REVIEWER' | 'OWNER' | 'APPROVER' | 'REQUESTER'; via: SemanticObject; notes: string[] }

const TTL_MS = 4000;
/** the capability each type needs (any of); a type not listed needs none beyond its entity */
const CAP: Partial<Record<SemanticType, Capability[]>> = {
  Account: ['FINANCIALS_VIEW', 'TB_VIEW', 'GL_VIEW'], ChartOfAccounts: ['FINANCIALS_VIEW', 'TB_VIEW', 'GL_VIEW'], FinancialStatement: ['FINANCIALS_VIEW'], FinancialStatementLine: ['FINANCIALS_VIEW'],
  TrialBalance: ['TB_VIEW'], GovernedLedgerPopulation: ['GL_VIEW'], GovernedLedgerEntry: ['GL_VIEW'], Vendor: ['GL_VIEW'], Project: ['GL_VIEW', 'FINANCIALS_VIEW'], Property: ['GL_VIEW', 'FINANCIALS_VIEW'], CostCenter: ['GL_VIEW'],
  FluxAnalysis: ['FLUX_VIEW'], FluxItem: ['FLUX_VIEW'], FluxExplanation: ['FLUX_VIEW'],
  Reconciliation: ['RECON_VIEW'], ReconcilingItem: ['RECON_VIEW'], Close: ['CLOSE_VIEW'], CloseTask: ['CLOSE_VIEW'], CloseBlocker: ['CLOSE_VIEW'],
  Report: ['REPORT_VIEW'], ReportingPackage: ['REPORT_VIEW'], AuditRequest: ['AUDIT_VIEW'], AuditPopulation: ['AUDIT_VIEW'], AuditSelection: ['AUDIT_VIEW'], Evidence: ['EVIDENCE_VIEW'], SupportDocument: ['EVIDENCE_VIEW'],
};
export const REGION_OF: Record<string, { id: string; name: string }> = { US: { id: 'AMERICAS', name: 'Americas' }, GB: { id: 'EMEA', name: 'EMEA' }, DE: { id: 'EMEA', name: 'EMEA' }, SG: { id: 'APAC', name: 'APAC' } };
const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'what', 'which', 'who', 'show', 'only', 'all', 'my', 'our', 'county', 'national', 'dominion', 'other', 'total', 'group', 'review', 'open', 'close']);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cleanName = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').trim();
const initialForm = (n: string) => { const p = cleanName(n).split(/\s+/); return p.length > 1 ? `${p[0]![0]}. ${p.at(-1)}` : n; };
/** the plain-word alternatives of an alias regex ("south valley|silicon valley|sv[- ]?ph2" → south valley, silicon valley) */
const aliasWords = (re: RegExp) => re.source.split('|').map((s) => s.replace(/\\b/g, '').trim()).filter((s) => /^[a-z ]{3,}$/.test(s));
const reEsc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const $m = (v: number | null | undefined) => (v === null || v === undefined ? '—' : money(v, 'USD'));

export class FinancialGraph {
  private fullCache: { key: string; at: number; g: Snapshot } | null = null;
  private actorCache = new Map<string, { at: number; s: Snapshot }>();
  constructor(readonly d: GraphDeps) {}

  /* =================================================================================================
     BUILD — the whole graph for a period, from the owning services (cached briefly)
     ================================================================================================= */
  private full(period: string): Snapshot {
    const key = `${period}|${this.d.gl.dataVersion()}`;
    if (this.fullCache && this.fullCache.key === key && Date.now() - this.fullCache.at < TTL_MS) return this.fullCache.g;
    const { data, gl, controls } = this.d;
    const N = new Map<string, SemanticObject>(), E: Edge[] = [];
    const add = (o: SemanticObject) => {
      const c = N.get(o.id);
      if (!c) { N.set(o.id, o); return o; }
      if (o.type !== c.type) c.roles = [...new Set([...(c.roles ?? []), o.type])];
      c.aliases = [...new Set([...(c.aliases ?? []), ...(o.aliases ?? [])])];
      Object.assign(c.attrs, o.attrs);
      return c;
    };
    const link = (from: string | null | undefined, rel: Relation, to: string | null | undefined, attrs?: Record<string, unknown>) => { if (from && to && from !== to) E.push({ from, rel, to, ...(attrs ? { attrs } : {}) }); };
    const wp = data.workingPeriod(), periods = gl.periods(), td = { periods, workingPeriod: wp };

    /* ---- people and roles: the identity directory, the reviewer directory, and names on workflow records ---- */
    const byName = new Map<string, string[]>();
    const nameKey = (id: string, ...ns: string[]) => ns.forEach((n) => { const k = n.toLowerCase(); byName.set(k, [...new Set([...(byName.get(k) ?? []), id])]); });
    for (const [r, caps] of Object.entries(ROLE_CAPABILITIES)) add({ id: `role:${r}`, type: 'Role', label: r.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' '), attrs: { system: true, capabilities: caps }, source: 'Korvyn authorization (ROLE_CAPABILITIES)' });
    const title = (t: string) => { const id = `role:title:${slug(t)}`; add({ id, type: 'Role', label: t, aliases: [t], attrs: { system: false, kind: 'job title' }, source: 'Korvyn reviewer directory' }); return id; };
    for (const p of PEOPLE) {
      const id = `person:${p.id}`;
      add({ id, type: 'User', label: p.name, aliases: [initialForm(p.name), p.name.split(' ')[0]!], attrs: { userId: p.id, title: p.role, canReview: p.canReview, reviewScope: p.scope, inReviewerDirectory: true }, source: 'Korvyn reviewer directory' });
      link(id, 'HAS_ROLE', title(p.role));
      nameKey(id, p.name, initialForm(p.name), p.name.split(' ')[0]!);
    }
    for (const u of DEV_DIRECTORY) {
      const id = `person:${u.id}`, nm = cleanName(u.name), t = u.name.match(/\((.*)\)/)?.[1];
      add({ id, type: 'User', label: nm, aliases: [initialForm(nm), nm.split(' ')[0]!], attrs: { userId: u.id, systemRoles: u.roles, entityAccess: u.entityAccess, inIdentityDirectory: true, ...(t && !N.get(id)?.attrs['title'] ? { title: t } : {}) }, source: 'Korvyn identity directory' });
      u.roles.forEach((r) => link(id, 'HAS_ROLE', `role:${r}`));
      nameKey(id, nm, initialForm(nm), nm.split(' ')[0]!);
    }
    const titles = new Map([...N.values()].filter((o) => o.type === 'Role' && o.attrs['kind'] === 'job title').map((o) => [o.label.toLowerCase(), o.id]));
    /** a workflow name → a person; a job title → the role (never guessed onto a person); an unknown name → an
     *  undirectoried person node that says so. An initial form maps only when it is unique in the directories. */
    const personRef = (name: string | null | undefined): string | null => {
      if (!name) return null;
      const tid = titles.get(name.toLowerCase()); if (tid) return tid;
      const pid = personId(name); if (pid && N.has(`person:${pid}`)) return `person:${pid}`;
      const hits = byName.get(name.toLowerCase()) ?? [];
      if (hits.length === 1) return hits[0]!;
      const id = pid ? `person:${pid}` : `person:name:${slug(name)}`;
      if (!N.has(id)) add({ id, type: 'User', label: name, aliases: [name], attrs: { inIdentityDirectory: false, inReviewerDirectory: false, note: `${name} is named on workflow records but is in neither the identity nor the reviewer directory, so their authority and scope cannot be checked.` }, source: 'Korvyn work store (workflow record)' });
      return id;
    };

    /* ---- enterprise structure ---- */
    const coreEnts = data.gl.entities as unknown as { id: string; name: string; kind: string; functionalCurrency: string; parentId?: string; ownershipPct?: number; consolidationMethod?: string; countryCode?: string }[];
    const conn = new Map(gl.entities().map((e) => [e.id, e.connector]));
    const group = data.scopes().find((s) => s.kind === 'GROUP')!;
    add({ id: 'consol:GROUP', type: 'ConsolidationNode', label: group.name, aliases: ['consolidated', 'the group', 'group', 'corporate consolidated', 'portfolio'], scope: 'GROUP', attrs: { members: group.entityIds, presentationCurrency: group.presentationCurrency, method: 'FULL' }, source: 'FinancialDataService (governed scopes)', tool: { id: 'getTrialBalanceByEntity', args: {} } });
    add({ id: 'elim:GROUP', type: 'EliminationEntity', label: 'Group eliminations', scope: 'GROUP', governed: true, attrs: { eliminates: ['intercompany receivable/payable (13000 / 23000)', 'intercompany management fees'], note: 'Eliminations are computed by the consolidation in FinancialDataService; no elimination entity posts journals.' }, source: 'FinancialDataService (consolidation)' });
    link('elim:GROUP', 'PART_OF', 'consol:GROUP');
    for (const e of coreEnts) {
      const id = `entity:${e.id}`, reg = REGION_OF[e.countryCode ?? ''];
      add({ id, type: 'LegalEntity', label: e.name, aliases: [e.id, ...ENTITY_WORDS.filter(([, v]) => v === e.id).flatMap(([re]) => aliasWords(re))], scope: e.id,
        attrs: { entityId: e.id, kind: e.kind, functionalCurrency: e.functionalCurrency, parent: e.parentId ?? null, ownershipPct: e.ownershipPct ?? null, consolidationMethod: e.consolidationMethod ?? null, countryCode: e.countryCode ?? null, sourceSystem: conn.get(e.id) ?? null },
        source: '@korvyn/core enterprise GL (entities)', tool: { id: 'getTrialBalance', args: { entity: e.id } } });
      link(id, 'CHILD_OF', e.parentId ? `entity:${e.parentId}` : null, e.ownershipPct !== undefined ? { ownershipPct: e.ownershipPct } : undefined);
      if (e.consolidationMethod === 'FULL') link(id, 'INCLUDED_IN', 'consol:GROUP', { method: 'FULL' });
      link(id, 'FUNCTIONAL_CURRENCY', `currency:${e.functionalCurrency}`);
      add({ id: `currency:${e.functionalCurrency}`, type: 'Currency', label: e.functionalCurrency, attrs: {}, source: '@korvyn/core enterprise GL' });
      if (reg) { add({ id: `region:${reg.id}`, type: 'Region', label: reg.name, aliases: [reg.name], scope: [], attrs: { derivedFrom: "each entity's country code — Korvyn holds no region hierarchy" }, source: 'derived from entity country codes' }); link(id, 'IN_REGION', `region:${reg.id}`); (N.get(`region:${reg.id}`)!.scope as string[]).push(e.id); }
      if (conn.get(e.id)) link(id, 'SOURCED_FROM', `source:${conn.get(e.id)}`);
    }
    add({ id: 'currency:USD', type: 'Currency', label: 'USD', attrs: { presentation: true }, source: 'governed scopes' });
    /* a parent with children is also a sub-consolidation of them */
    for (const e of coreEnts) {
      const kids = coreEnts.filter((k) => k.parentId === e.id);
      if (!kids.length) continue;
      add({ id: `entity:${e.id}`, type: 'ParentEntity', label: e.name, attrs: { children: kids.map((k) => k.id) }, source: '@korvyn/core enterprise GL (entities)' });
      if (e.parentId) {
        add({ id: `consol:${e.id}`, type: 'ConsolidationNode', label: `${e.name} subgroup`, aliases: [`${e.id} subgroup`], scope: 'GROUP', attrs: { members: [e.id, ...kids.map((k) => k.id)], note: 'A sub-consolidation implied by the ownership tree; the server consolidates at group level only.' }, source: 'derived from the entity ownership tree' });
        link(`consol:${e.id}`, 'INCLUDED_IN', 'consol:GROUP');
        [e, ...kids].forEach((k) => link(`entity:${k.id}`, 'INCLUDED_IN', `consol:${e.id}`));
      }
    }
    for (const [k, h] of Object.entries(SOURCE_HEALTH)) add({ id: `source:${k}`, type: 'SourceSystem', label: h.system, aliases: [h.instance], scope: coreEnts.filter((e) => conn.get(e.id) === k).map((e) => e.id), attrs: { instance: h.instance, status: h.status, deepLinks: h.deepLinks, note: h.note }, source: 'SOURCE_HEALTH (connector status)' });

    /* ---- dimensions: projects, properties, cost centres, vendors (who spends where) ---- */
    const acc = (m: Map<string, Set<string>>, k: string, v: string) => { const s = m.get(k) ?? new Set(); s.add(v); m.set(k, s); };
    const projEnt = new Map<string, Set<string>>(), propEnt = new Map<string, Set<string>>(), ccEnt = new Map<string, Set<string>>(), venEnt = new Map<string, Set<string>>(), venProj = new Map<string, Set<string>>(), projProp = new Map<string, Set<string>>();
    for (const l of gl.lines) {
      if (l.project) acc(projEnt, l.project, l.entity);
      if (l.property) acc(propEnt, l.property, l.entity);
      if (l.costCenter) acc(ccEnt, l.costCenter, l.entity);
      if (l.project && l.property) acc(projProp, l.project, l.property);
      if (l.vendor && l.account !== '20100') { acc(venEnt, l.vendor, l.entity); if (l.project) acc(venProj, l.vendor, l.project); }
    }
    for (const [p, ents] of propEnt) add({ id: `property:${p}`, type: 'Property', label: p.split('-').map((w) => w[0] + w.slice(1).toLowerCase()).join(' '), aliases: [p], scope: [...ents], attrs: { code: p, entities: [...ents] }, source: 'governed ledger (property dimension)', tool: { id: 'analyzeByDimension', args: { dimension: 'property' } } });
    for (const [p, ents] of projEnt) {
      const al = PROJECT_ALIAS.filter(([, v]) => v === p).flatMap(([re]) => aliasWords(re));
      const nm = al[0] ? al[0].split(' ').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ') : null;
      add({ id: `project:${p}`, type: 'Project', label: nm ? `${p} — ${nm}` : p, aliases: [p, ...al], scope: [...ents], attrs: { code: p, name: nm, entities: [...ents], isLegalEntity: false }, source: 'governed ledger (project dimension)', tool: { id: 'getTrend', args: { project: p } } });
      [...ents].forEach((e) => link(`project:${p}`, 'BELONGS_TO', `entity:${e}`));
      /* the property a programme sits at: from lines that carry both, else where the project's own alias names it */
      const props = projProp.get(p) ?? new Set([...propEnt.keys()].filter((q) => al.some((a) => q.toLowerCase().replace(/-/g, ' ').split(' ').join(' ').includes(a))));
      props.forEach((q) => link(`project:${p}`, 'RELATES_TO', `property:${q}`, { matchedBy: projProp.has(p) ? 'ledger lines' : "the project's alias names the property" }));
    }
    for (const [c, ents] of ccEnt) { add({ id: `costcenter:${c}`, type: 'CostCenter', label: c, aliases: [c], scope: [...ents], attrs: { entities: [...ents] }, source: 'governed ledger (cost-centre dimension)' }); [...ents].forEach((e) => link(`costcenter:${c}`, 'BELONGS_TO', `entity:${e}`)); }
    for (const v of gl.vendorMaster('ALL')) {
      const id = `vendor:${v.name}`, first = v.name.split(/\s+/)[0]!;
      add({ id, type: 'Vendor', label: v.name, aliases: [v.name, ...(first.length >= 4 && !STOP.has(first.toLowerCase()) ? [first] : [])], scope: venEnt.has(v.name) ? [...venEnt.get(v.name)!] : null,
        attrs: { vendorId: v.id, hasActivity: v.hasActivity, activityUsd: v.activityUsd, note: v.note || null, source: AP_EXTRACT.id }, source: `AP extract ${AP_EXTRACT.id} (vendor master)`, tool: { id: 'getTrend', args: { vendor: v.name } } });
      (venProj.get(v.name) ?? new Set()).forEach((p) => link(id, 'ACTIVE_IN', `project:${p}`));
      (venEnt.get(v.name) ?? new Set()).forEach((e) => link(id, 'ACTIVE_IN', `entity:${e}`));
    }

    /* ---- time: the tenant fiscal calendar around the governed months ---- */
    for (const fy of [...new Set(periods.map(fiscalYearOf))]) {
      const r = fiscalYearRange(fy);
      add({ id: `fy:${fy}`, type: 'FiscalYear', label: fyLabel(fy), aliases: [fyLabel(fy), `fiscal ${fy}`], attrs: { start: r.start, end: r.end, governedMonths: periods.filter((p) => p >= r.start && p <= r.end) }, source: 'tenant fiscal calendar' });
      for (let q = 1; q <= 4; q++) { const qr = fiscalQuarterRange(fy, q); add({ id: `quarter:${fy}-Q${q}`, type: 'Quarter', label: quarterLabel(fy, q), attrs: { start: qr.start, end: qr.end, governed: periods.some((p) => p >= qr.start && p <= qr.end) }, source: 'tenant fiscal calendar' }); link(`quarter:${fy}-Q${q}`, 'PART_OF', `fy:${fy}`); }
    }
    for (const p of periods) {
      const f = fiscalFrame(p, td);
      add({ id: `period:${p}`, type: 'Period', label: periodLabel(p), attrs: { status: f.status, fiscalYear: f.fiscalYear, quarter: f.quarter, isQuarterEnd: f.isQuarterEnd, isYearEnd: f.isYearEnd }, source: 'governed ledger periods + tenant calendar' });
      const { fy, q } = { fy: fiscalYearOf(p), q: Number(f.quarter.slice(1, 2)) };
      link(`period:${p}`, 'PART_OF', `quarter:${fy}-Q${q}`);
    }
    add({ id: `closeperiod:${wp}`, type: 'ClosePeriod', label: `${periodLabel(wp)} close period`, attrs: { period: wp, status: 'OPEN' }, source: 'governed ledger (working period)' });
    link(`closeperiod:${wp}`, 'CLOSES', `period:${wp}`);

    /* ---- financial structure ---- */
    add({ id: 'coa:CORE', type: 'ChartOfAccounts', label: 'Korvyn core chart of accounts', aliases: ['chart of accounts', 'coa'], attrs: { accounts: gl.accounts().length }, source: '@korvyn/core enterprise GL (accounts)' });
    const aliasFor = (name: string) => Object.entries(ACCOUNT_ALIAS).filter(([, exp]) => name.toLowerCase().startsWith(exp)).map(([k]) => k);
    for (const a of gl.accounts()) {
      const id = `account:${a.code}`;
      add({ id, type: 'Account', label: `${a.code} ${a.name}`, aliases: [a.code, a.name, ...(a.parent ? [] : aliasFor(a.name))], attrs: { code: a.code, name: a.name, type: a.type, section: a.section, postable: a.postable, parent: a.parent }, source: '@korvyn/core enterprise GL (accounts)', tool: { id: 'getAccountAnalysis', args: { account: a.code } } });
      link(id, 'CHILD_OF', a.parent ? `account:${a.parent}` : null);
      link(id, 'IN_CHART', 'coa:CORE');
      if (['13000', '23000'].includes(a.code)) link(id, 'ELIMINATED_IN', 'elim:GROUP');
    }
    for (const l of BROWSER_BOOK.fluxLines) {
      const stmt = l.kind === 'stmt', id = stmt ? `fs:${l.id}` : `fsline:${l.id}`;
      add({ id, type: stmt ? 'FinancialStatement' : 'FinancialStatementLine', label: l.name, aliases: [l.name, l.id], scope: 'GROUP', governed: stmt || l.kind !== 'line' || !!FLUX_LINE_ACCOUNTS[l.id],
        attrs: { lineId: l.id, kind: l.kind, mappedAccounts: FLUX_LINE_ACCOUNTS[l.id] ?? [], ...(l.kind === 'line' && !FLUX_LINE_ACCOUNTS[l.id] ? { note: 'This statement line is not mapped to a server account group; the server book does not state it.' } : {}) },
        source: 'Korvyn reporting book (statement lines)', tool: stmt ? { id: l.id === 'FS-IS' ? 'getIncomeStatement' : 'getBalanceSheet', args: {} } : null });
      if (l.parent) link(id, 'PART_OF', BROWSER_BOOK.fluxLines.find((x) => x.id === l.parent)?.kind === 'stmt' ? `fs:${l.parent}` : `fsline:${l.parent}`);
    }
    add({ id: 'fs:FS-CF', type: 'FinancialStatement', label: 'Cash Flow Statement', aliases: ['cash flow', 'cash flow statement'], scope: 'GROUP', governed: false, attrs: { note: 'The cash flow statement is not modelled on the server book.' }, source: 'not modelled' });
    for (const [line, accts] of Object.entries(FLUX_LINE_ACCOUNTS)) accts.forEach((a) => link(`fsline:${line}`, 'MAPPED_FROM', `account:${a}`, { crosswalk: 'FLUX_LINE_ACCOUNTS' }));
    add({ id: 'lens:CORPORATE', type: 'ReportingLens', label: 'Corporate Consolidated', aliases: ['corporate', 'corporate consolidated'], attrs: { basis: 'US GAAP', presentationCurrency: 'USD', fxAverage: 'FXR-2026-AVG-REP-1', fxClosing: FX_CLOSING_SET.id, note: 'The server book presents one lens.' }, source: 'governed scopes' });
    add({ id: 'basis:US_GAAP', type: 'AccountingBasis', label: 'US GAAP', aliases: ['us gaap', 'gaap'], attrs: {}, source: 'governed scopes' });
    link('lens:CORPORATE', 'USES', 'basis:US_GAAP'); link('lens:CORPORATE', 'USES', 'currency:USD'); link('lens:CORPORATE', 'USES', 'consol:GROUP');
    add({ id: `tb:${period}:GROUP`, type: 'TrialBalance', label: `Trial balance · ${periodLabel(period)} · group`, scope: 'GROUP', period, attrs: { scope: 'GROUP' }, source: 'FinancialDataService (trial balance)', tool: { id: 'getTrialBalanceByEntity', args: { period } } });
    link(`tb:${period}:GROUP`, 'BELONGS_TO', 'consol:GROUP'); link(`tb:${period}:GROUP`, 'IN_PERIOD', `period:${period}`);
    for (const e of coreEnts) { const id = `tb:${period}:${e.id}`; add({ id, type: 'TrialBalance', label: `Trial balance · ${periodLabel(period)} · ${e.id}`, scope: e.id, period, attrs: { scope: e.id }, source: 'FinancialDataService (trial balance)', tool: { id: 'getTrialBalance', args: { entity: e.id } } }); link(id, 'BELONGS_TO', `entity:${e.id}`); link(id, 'IN_PERIOD', `period:${period}`); }

    /* ---- policies and controls (constants the services already enforce) ---- */
    add({ id: 'policy:AP-APPROVAL', type: 'Policy', label: 'AP approval threshold', attrs: { thresholdUsd: APPROVAL_THRESHOLD_USD, appliesTo: 'AP bills', source: AP_EXTRACT.id }, source: 'governed ledger (AP extract rules)' });
    add({ id: 'policy:FLUX-MATERIALITY', type: 'Policy', label: 'Flux materiality', aliases: ['materiality'], attrs: { ...FLUX_MATERIALITY, rule: `material when |change| ≥ ${$m(FLUX_MATERIALITY.absUsd)}, or ≥ ${$m(FLUX_MATERIALITY.minUsd)} and ≥ ${FLUX_MATERIALITY.pct * 100}%` }, source: 'ControlService (flux)' });
    add({ id: 'policy:RECON-TIE', type: 'Policy', label: 'Reconciliation tie tolerance', attrs: { toleranceUsd: TIE_TOLERANCE_USD }, source: 'ControlService (reconciliations)' });
    for (const s of SOD_POLICIES) add({ id: `control:${s.id}`, type: 'Control', label: s.description, aliases: [s.id], attrs: { appliesTo: s.appliesTo, kind: 'segregation of duties' }, source: 'SoDPolicyService' });

    /* ---- planning: the concepts exist; the server book holds actuals only ---- */
    add({ id: 'planning:ACTUAL', type: 'Actual', label: 'Actuals', aliases: ['actual', 'actuals'], governed: true, attrs: { note: 'The governed ledger.' }, source: 'governed ledger' });
    for (const [k, t, lab, al] of [['BUDGET', 'Budget', 'Budget', ['budget']], ['FORECAST', 'Forecast', 'Forecast', ['forecast', 'prior forecast', 'reforecast']], ['SCENARIO', 'Scenario', 'Scenario', ['scenario']], ['VERSION', 'PlanningVersion', 'Planning version', ['planning version', 'plan version']]] as const) {
      add({ id: `planning:${k}`, type: t, label: lab, aliases: [...al], governed: false, attrs: { note: `${lab}s are not held on this server: the book holds actuals only, so a ${lab.toLowerCase()} comparison cannot be stated.` }, source: 'not modelled' });
      link(`planning:${k}`, 'COMPARES', 'planning:ACTUAL');
    }

    /* ---- evidence relationships (the work store) ---- */
    const evidence = (target: string, rels: ReturnType<typeof WORK.relsTo>, scope: string | null) => rels.forEach((r) => {
      add({ id: `evidence:${r.id}`, type: 'Evidence', label: r.label, scope, attrs: { kind: r.kind, relationship: r.type, reference: r.from, createdBy: r.createdBy, via: r.via, at: r.at, documentConnected: false, sourceSystem: r.sourceSystem }, source: 'Korvyn work store (evidence relationships)' });
      link(target, 'SUPPORTED_BY', `evidence:${r.id}`, { relationship: r.type });
    });

    /* ---- flux review ---- */
    const prior = gl.priorPeriod(period);
    if (prior) {
      const fa = `fluxanalysis:${period}`;
      add({ id: fa, type: 'FluxAnalysis', label: `Flux review · ${periodLabel(period)} vs ${periodLabel(prior)}`, aliases: ['flux', 'flux review', 'flux analysis'], scope: 'GROUP', period, attrs: { period, comparison: prior }, source: 'ControlService (flux)', tool: { id: 'getFluxSummary', args: { period } } });
      link(fa, 'IN_PERIOD', `period:${period}`); link(fa, 'COMPARED_TO', `period:${prior}`); link(fa, 'GOVERNED_BY', 'policy:FLUX-MATERIALITY');
      for (const f of controls.fluxItems(period, 'ALL')) {
        const id = `flux:${f.id}`;
        add({ id, type: 'FluxItem', label: `${f.name} · ${periodLabel(period)}`, scope: 'GROUP', period,
          attrs: { account: f.account, material: f.material, status: f.status, currentUsd: f.currentUsd, priorUsd: f.priorUsd, changeUsd: f.changeUsd, changePct: f.changePct, reviewer: f.reviewer, explanationId: f.explanation?.id ?? null, comments: f.comments.length },
          source: 'ControlService (flux; amounts derived from the governed ledger)', tool: { id: 'getFluxItem', args: { account: f.account, period } } });
        link(fa, 'CONTAINS', id); link(`account:${f.account}`, 'HAS_FLUX', id);
        Object.entries(FLUX_LINE_ACCOUNTS).filter(([, a]) => a.includes(f.account)).forEach(([ln]) => link(`fsline:${ln}`, 'HAS_FLUX', id));
        link(id, 'REVIEWED_BY', personRef(f.reviewer));
        evidence(id, f.attachedEvidence, 'GROUP');
        if (f.explanation) {
          const x = f.explanation, xid = `explanation:${x.id}`;
          add({ id: xid, type: 'FluxExplanation', label: `Explanation · ${f.name}`, scope: 'GROUP', period, attrs: { explanationId: x.id, status: x.status, version: x.version, author: x.author, reviewer: x.reviewer, supportRefs: x.supportRefs, updatedBy: x.updatedBy, updatedAt: x.updatedAt }, source: 'Korvyn work store (the one Flux explanation record)', tool: { id: 'getFluxExplanation', args: { account: f.account, period } } });
          link(id, 'HAS_EXPLANATION', xid); link(xid, 'PREPARED_BY', personRef(x.author)); link(xid, 'REVIEWED_BY', personRef(x.reviewer));
          x.supportRefs.forEach((ref) => { add({ id: `evidence:ref:${ref}`, type: 'Evidence', label: ref, scope: 'GROUP', attrs: { reference: ref, documentConnected: false }, source: 'Flux explanation support references' }); link(xid, 'SUPPORTED_BY', `evidence:ref:${ref}`); });
        }
      }
    }

    /* ---- reconciliations (both catalogs; workflow from the work store, balances derived) ---- */
    for (const def of controls.allRecDefs()) {
      const r = controls.reconcile(def, period), id = `recon:${def.id}`, isGroup = def.entity === 'GROUP';
      const missing = r.support.filter((s) => s.status === 'MISSING').map((s) => s.requirement);
      add({ id, type: 'Reconciliation', label: def.name, aliases: [def.id, def.name], scope: def.entity, period,
        attrs: { reconciliationId: def.id, catalog: isGroup ? 'MODULE' : 'GL', method: def.method, entity: def.entity, accounts: def.accounts, financialLineId: def.financialLineId ?? null, status: r.workflow.status, tieStatus: r.tieStatus,
          glBalanceUsd: r.balanceInModule ? null : r.glBalanceUsd, differenceUsd: r.balanceInModule ? null : r.differenceUsd, supportComplete: r.supportComplete, missingSupport: missing, preparer: def.preparer, reviewer: r.workflow.reviewer, balanceAuthoritative: !r.balanceInModule, sourceIssues: r.sourceIssues },
        source: 'ControlService (reconciliations; workflow from the work store)', tool: { id: 'getReconciliation', args: { reconciliationId: def.id, period } } });
      link(id, 'BELONGS_TO', isGroup ? 'consol:GROUP' : `entity:${def.entity}`); link(id, 'IN_PERIOD', `period:${period}`);
      def.accounts.forEach((a) => link(`account:${a}`, 'RECONCILED_BY', id));
      if (def.financialLineId) link(`fsline:${def.financialLineId}`, 'RECONCILED_BY', id);
      link(id, 'PREPARED_BY', personRef(def.preparer)); link(id, 'REVIEWED_BY', personRef(r.workflow.reviewer));
      link(id, 'GOVERNED_BY', 'policy:RECON-TIE'); link(id, 'GOVERNED_BY', 'control:SOD-PREPARER-NOT-APPROVER');
      for (const it of r.items) { add({ id: `reconitem:${it.id}`, type: 'ReconcilingItem', label: it.label, scope: def.entity, period, attrs: { amountUsd: it.amountUsd, kind: it.kind }, source: 'ControlService (derived reconciling item)' }); link(id, 'HAS_RECONCILING_ITEM', `reconitem:${it.id}`); }
      evidence(id, r.attachedEvidence, def.entity);
    }

    /* ---- close ---- */
    const cl = `close:${period}`;
    const ready = controls.closeReadiness(period, 'ALL');
    add({ id: cl, type: 'Close', label: `${periodLabel(period)} close`, aliases: ['close', 'the close', 'month-end close', `${periodLabel(period).toLowerCase()} close`], period, attrs: { readinessPct: ready.readinessPct, parts: ready.parts, open: period === wp }, source: 'ControlService (close)', tool: { id: 'getCloseReadiness', args: { period } } });
    link(cl, 'CLOSES', `period:${period}`);
    for (const t of controls.closeTasks(period, 'ALL')) {
      const id = `closetask:${t.id}`;
      add({ id, type: 'CloseTask', label: t.name, aliases: [t.id], scope: t.entity, period, attrs: { taskId: t.id, workstream: t.workstream, entity: t.entity, owner: t.owner, approver: t.approver, due: t.due, status: t.status, blockedBy: t.blockedBy ?? null }, source: 'Korvyn work store (close tasks)', tool: { id: 'getCloseTasks', args: { period } } });
      link(cl, 'HAS_TASK', id); link(id, 'OWNED_BY', personRef(t.owner)); link(id, 'REVIEWED_BY', personRef(t.approver)); link(id, 'BELONGS_TO', t.entity === 'GROUP' ? 'consol:GROUP' : `entity:${t.entity}`);
    }
    const instToSource = new Map(Object.entries(SOURCE_HEALTH).map(([k, h]) => [h.instance, `source:${k}`]));
    for (const b of ready.blockers) {
      const id = `blocker:${b.kind}:${b.ref}:${b.entity}`;
      const target = b.kind.startsWith('RECONCILIATION') ? `recon:${b.ref}` : b.kind === 'FLUX_UNEXPLAINED' ? `flux:${b.ref}` : b.kind === 'TASK_BLOCKED' ? `closetask:${b.ref}` : instToSource.get(b.ref) ?? null;
      add({ id, type: 'CloseBlocker', label: b.label, scope: b.entity, period, attrs: { kind: b.kind, severity: b.severity, amountUsd: b.amountUsd, entity: b.entity, ref: b.ref }, source: 'ControlService (close blockers, derived)', tool: { id: 'getCloseBlockers', args: { period } } });
      link(cl, 'HAS_BLOCKER', id); link(id, 'RELATES_TO', target);
    }

    /* ---- reporting ---- */
    const pub = controls.published();
    for (const r of controls.reports()) {
      const id = `report:${r.id}`;
      add({ id, type: 'Report', label: r.name, aliases: [r.id, r.name], scope: 'GROUP', attrs: { reportId: r.id, owner: r.owner, kind: r.kind, definitionVersion: r.definitionVersion, lines: r.lines.map((l) => l.label), published: pub.filter((p) => p.reportId === r.id).map((p) => ({ period: p.period, version: p.version, publishedBy: p.publishedBy })) }, source: 'Korvyn work store (report definitions)', tool: { id: 'getReportData', args: { reportId: r.id } } });
      link(id, 'OWNED_BY', personRef(r.owner));
      for (const ln of r.lines) for (const a of ln.accounts) {
        link(id, 'USES', `account:${a}`, { line: ln.label });
        Object.entries(FLUX_LINE_ACCOUNTS).filter(([, x]) => x.includes(a)).forEach(([fl]) => link(id, 'USES', `fsline:${fl}`, { line: ln.label, via: `account ${a}` }));
      }
    }
    for (const p of controls.packages()) {
      const id = `package:${p.id}`;
      add({ id, type: 'ReportingPackage', label: p.name, aliases: [p.id], scope: 'GROUP', attrs: { period: p.period, status: p.status, owner: p.owner, contents: p.contents }, source: 'Korvyn work store (reporting packages)' });
      link(id, 'OWNED_BY', personRef(p.owner));
      p.contents.filter((c) => c.startsWith('report:')).forEach((c) => link(id, 'CONTAINS', c));
    }

    /* ---- audit ---- */
    for (const ap of controls.auditPopulations()) { add({ id: `auditpop:${ap.id}`, type: 'AuditPopulation', label: ap.name, aliases: [ap.id], attrs: { accounts: ap.accounts, tieOutTo: ap.tieOutTo }, source: 'ControlService (audit populations)', tool: { id: 'getAuditPopulation', args: { auditPopulationId: ap.id } } }); ap.accounts.forEach((a) => link(`auditpop:${ap.id}`, 'SELECTED_FROM', `account:${a}`)); }
    for (const q of controls.pbc()) {
      const id = `pbc:${q.id}`;
      add({ id, type: 'AuditRequest', label: `${q.id} ${q.title}`, aliases: [q.id], attrs: { status: q.status, due: q.due, requestedBy: q.requestedBy, owner: q.owner, populationId: q.populationId }, source: 'Korvyn work store (PBC requests)', tool: { id: 'getPBCRequest', args: { pbcId: q.id } } });
      link(id, 'OWNED_BY', personRef(q.owner));
      if (q.populationId) link(id, 'USES', `auditpop:${q.populationId}`);
    }

    const g = index(`${key}`, period, N, E);
    this.fullCache = { key, at: Date.now(), g };
    this.actorCache.clear();
    return g;
  }

  /* =================================================================================================
     WHAT AN ACTOR SEES — the only snapshot any query reads
     ================================================================================================= */
  static visibleTo(a: Actor, o: SemanticObject): boolean {
    const caps = CAP[o.type];
    if (caps && !caps.some((c) => a.permissions.includes(c))) return false;
    if (!o.scope || a.scopeIds === 'ALL') return true;
    const ok = (e: string) => e !== 'GROUP' && (a.scopeIds as string[]).includes(e);
    return Array.isArray(o.scope) ? o.scope.some(ok) : ok(o.scope);
  }
  snapshot(actor: Actor, period?: string): Snapshot {
    const p = period && this.d.gl.periods().includes(period) ? period : this.d.data.workingPeriod();
    const full = this.full(p);
    const key = `${actor.id}|${actor.role}|${JSON.stringify(actor.scopeIds)}|${actor.permissions.join(',')}|${full.key}`;
    const hit = this.actorCache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.s;
    const nodes = new Map([...full.nodes].filter(([, o]) => FinancialGraph.visibleTo(actor, o)));
    if (actor.scopeIds !== 'ALL') {
      /* a scoped actor learns of people, systems and roles only through what they may see */
      const via = (id: string) => full.edges.some((e) => (e.from === id || e.to === id) && nodes.has(e.from === id ? e.to : e.from) && !['User', 'Role', 'SourceSystem'].includes(nodes.get(e.from === id ? e.to : e.from)!.type));
      for (const [id, o] of [...nodes]) if ((o.type === 'User' && id !== `person:${actor.id}` && !via(id)) || (o.type === 'SourceSystem' && !via(id))) nodes.delete(id);
      for (const [id, o] of [...nodes]) if (o.type === 'Role' && !full.edges.some((e) => e.to === id && e.rel === 'HAS_ROLE' && nodes.has(e.from))) nodes.delete(id);
    }
    const s = index(key, p, nodes, full.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)));
    if (actor.permissions.includes('REPORT_VIEW') && this.d.artifacts) for (const a of this.d.artifacts.list(actor).slice(0, 25)) s.nodes.set(`artifact:${a.id}`, { id: `artifact:${a.id}`, type: 'Artifact', label: a.name, aliases: [a.id], attrs: { status: a.status, version: a.version, artifactType: a.type, period: a.period, sheets: a.sheets }, source: 'Artifact engine', tool: { id: 'previewExcelArtifact', args: { artifactId: a.id } } });
    this.actorCache.set(key, { at: Date.now(), s });
    return s;
  }

  /* =================================================================================================
     §14 — THE SERVICE
     ================================================================================================= */
  node(id: string, actor: Actor, period?: string) { return this.snapshot(actor, period).nodes.get(id) ?? null; }

  /** Phrases in the words that name an object the actor may see — longest first, never overlapping. */
  mentions(text: string, actor: Actor, period?: string): { term: string; ids: string[] }[] {
    const s = this.snapshot(actor, period), t = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
    const names = new Map<string, Set<string>>();
    for (const o of s.nodes.values()) {
      if (['Period', 'Quarter', 'FiscalYear', 'TrialBalance', 'Currency', 'Evidence', 'ReconcilingItem'].includes(o.type)) continue;
      for (const n of [o.label, ...(o.aliases ?? [])]) { const k = n.toLowerCase().trim(); if (k.length < 3 || STOP.has(k)) continue; const set = names.get(k) ?? new Set(); set.add(o.id); names.set(k, set); }
    }
    const out: { term: string; ids: string[]; a: number; b: number }[] = [];
    for (const k of [...names.keys()].sort((x, y) => y.length - x.length)) {
      const re = new RegExp(`(?<![a-z0-9])${reEsc(k)}(?![a-z0-9])`, 'g');
      for (const m of t.matchAll(re)) { const a = m.index!, b = a + k.length; if (out.some((x) => a < x.b && b > x.a)) continue; out.push({ term: k, ids: [...names.get(k)!], a, b }); }
    }
    return out.sort((x, y) => x.a - y.a).map(({ term, ids }) => ({ term, ids: this.collapse(ids, s) }));
  }
  /** a statement line and the account group it is mapped from name ONE concept: keep the account (the governed one) */
  private collapse(ids: string[], s: Snapshot): string[] {
    if (ids.length < 2) return ids;
    const accts = ids.filter((i) => i.startsWith('account:'));
    return ids.filter((i) => !(i.startsWith('fsline:') && this.accountsOfLine(i, s).some((a) => accts.includes(a))));
  }
  accountsOfLine(lineId: string, s: Snapshot): string[] {
    const out = new Set<string>(), walk = (id: string) => { (s.out.get(id) ?? []).filter((e) => e.rel === 'MAPPED_FROM').forEach((e) => out.add(e.to)); (s.inn.get(id) ?? []).filter((e) => e.rel === 'PART_OF').forEach((e) => walk(e.from)); };
    walk(lineId);
    return [...out];
  }

  /** searchSemanticObjects — ranked over labels, aliases and ids of what the actor may see */
  search(text: string, actor: Actor, o: { types?: SemanticType[]; limit?: number; period?: string } = {}): Hit[] {
    const s = this.snapshot(actor, o.period), t = text.toLowerCase().trim(), words = t.split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
    const hits: Hit[] = [];
    for (const ob of s.nodes.values()) {
      if (o.types && !o.types.includes(ob.type) && !(ob.roles ?? []).some((r) => o.types!.includes(r))) continue;
      const names = [ob.label, ...(ob.aliases ?? []), ob.id.slice(ob.id.indexOf(':') + 1)].map((n) => n.toLowerCase());
      let score = 0, matched = '';
      for (const n of names) {
        const sc = n === t ? 100 : n.startsWith(`${t} `) || n.endsWith(` ${t}`) || n.includes(` ${t} `) ? 70 : t.length >= 4 && n.includes(t) ? 55 : t.includes(n) && n.length >= 4 ? 50 : words.filter((w) => new RegExp(`(^|[^a-z])${reEsc(w)}`).test(n) || (ACCOUNT_ALIAS[w] !== undefined && n.includes(ACCOUNT_ALIAS[w]!))).length * 12;
        if (sc > score) { score = sc; matched = n; }
      }
      if (score > 0) hits.push({ object: ob, score, matched });
    }
    return hits.sort((a, b) => b.score - a.score || rank(a.object) - rank(b.object)).slice(0, o.limit ?? 12);
  }

  /** resolveObject — one object, or an honest ambiguity, or not found. Never "exists but hidden". */
  resolve(text: string, actor: Actor, o: { types?: SemanticType[]; period?: string } = {}): Resolution {
    const term = text.trim(), s = this.snapshot(actor, o.period);
    if (!term) return { status: 'NOT_FOUND', term, note: 'Nothing was named.' };
    /* a type word ("… reconciliation", "… report") narrows the search to that type; an entity the words also name
       picks that entity's object ("the intercompany receivable reconciliation for MDH") */
    const tw = o.types ? null : TYPE_WORDS.find(([re]) => re.test(term));
    if (tw && !this.mentions(term, actor, o.period).some((m) => m.ids.length === 1 && tw[1].includes(s.nodes.get(m.ids[0]!)!.type) && m.term.length >= term.length - 12)) {
      const rest = term.toLowerCase().replace(tw[0], ' ').replace(/\b(the|for|of|a|an|on|in)\b/g, ' ').replace(/\s+/g, ' ').trim();
      let hits = rest ? this.search(rest, actor, { types: tw[1], ...(o.period ? { period: o.period } : {}) }) : [];
      const ents = this.mentions(term, actor, o.period).flatMap((m) => m.ids).filter((i) => i.startsWith('entity:')).map((i) => i.slice(7));
      if (ents.length) { const f = hits.filter((h) => ents.includes(String(h.object.attrs['entity']))); if (f.length) hits = f; }
      if (hits[0] && hits[0].score >= 24) {
        const top = hits.filter((h) => h.score === hits[0]!.score);
        if (top.length === 1) return { status: 'RESOLVED', object: top[0]!.object, alsoKnownAs: [], term };
        return { status: 'AMBIGUOUS', term, candidates: top.map((h) => ({ object: h.object, detail: this.describe(h.object) })), question: `"${term}" matches ${top.length} objects you can see — which one do you mean?` };
      }
    }
    const m = this.mentions(term, actor, o.period).filter((x) => !o.types || x.ids.some((i) => o.types!.includes(s.nodes.get(i)!.type)));
    const whole = m.find((x) => x.term.length >= term.toLowerCase().replace(/[^a-z0-9 &'-]/g, '').trim().length - 2) ?? (m.length === 1 ? m[0] : null);
    if (!whole && m.length > 1 && m.every((x) => x.ids.length === 1)) return { status: 'MULTIPLE', term, objects: m.map((x) => s.nodes.get(x.ids[0]!)!) };
    /* a period word is resolved by the tenant calendar, never by text search */
    const per = resolvePeriods(term, { periods: this.d.gl.periods(), workingPeriod: this.d.data.workingPeriod() });
    if (!whole && per.length === 1 && per[0]!.term.length >= term.toLowerCase().trim().length - 3) {
      const r = per[0]!;
      if (r.status === 'AMBIGUOUS') return { status: 'AMBIGUOUS', term, question: r.note, candidates: r.candidates.map((c) => ({ object: { id: c.id, type: 'Quarter' as const, label: c.label, attrs: {}, source: 'tenant fiscal calendar' }, detail: c.detail })) };
      const pid = r.start && r.start === r.end ? `period:${r.start}` : null;
      const ob: SemanticObject = (pid && s.nodes.get(pid)) || { id: r.start ? `period:${r.start}${r.end !== r.start ? `..${r.end}` : ''}` : `planning:${r.label.toUpperCase()}`, type: (r.kind === 'PLANNING' ? 'Forecast' : r.kind === 'FISCAL_YEAR' || r.kind === 'PRIOR_YEAR' ? 'FiscalYear' : r.kind === 'QUARTER' ? 'Quarter' : 'Period') as SemanticType, label: r.label, attrs: { start: r.start, end: r.end, status: r.status, note: r.note }, source: 'tenant fiscal calendar', governed: r.status !== 'NOT_GOVERNED' };
      return { status: 'RESOLVED', object: ob, alsoKnownAs: [], term };
    }
    let ids = whole ? whole.ids.filter((i) => !o.types || o.types.includes(s.nodes.get(i)!.type)) : [];
    if (!ids.length) { const h = this.search(term, actor, o); if (h[0] && h[0].score >= 50) ids = this.collapse(h.filter((x) => x.score === h[0]!.score).map((x) => x.object.id), s); }
    if (!ids.length) return { status: 'NOT_FOUND', term, note: `No object named "${term}" is in your authorized scope.` };
    if (ids.length === 1) {
      const ob = s.nodes.get(ids[0]!)!;
      const aka = [...(s.out.get(ob.id) ?? []), ...(s.inn.get(ob.id) ?? [])].filter((e) => e.rel === 'MAPPED_FROM').map((e) => s.nodes.get(e.from === ob.id ? e.to : e.from)!).filter(Boolean);
      return { status: 'RESOLVED', object: ob, alsoKnownAs: aka, term };
    }
    const cands = ids.map((i) => s.nodes.get(i)!).sort((a, b) => rank(a) - rank(b));
    return { status: 'AMBIGUOUS', term, candidates: cands.map((c) => ({ object: c, detail: this.describe(c) })), question: `"${term}" names ${cands.length} objects you can see — which one do you mean?` };
  }

  /** a one-line description that distinguishes an object from others of its name */
  describe(o: SemanticObject): string {
    const a = o.attrs;
    switch (o.type) {
      case 'Vendor': return a['hasActivity'] ? `Vendor · ${$m(a['activityUsd'] as number)} governed activity` : 'Vendor master record only — no governed activity';
      case 'Project': return `Project (not a legal entity) · posts through ${(a['entities'] as string[]).join(', ')}`;
      case 'Property': return `Property · ${(a['entities'] as string[]).join(', ')}`;
      case 'LegalEntity': return `Legal entity ${a['entityId']} · ${a['functionalCurrency']}${a['parent'] ? ` · owned by ${a['parent']}` : ' · top of the ownership tree'}`;
      case 'ConsolidationNode': return `Consolidation · ${(a['members'] as string[]).length} entities`;
      case 'User': return `${a['title'] ?? 'Person'}${a['inIdentityDirectory'] === false && a['inReviewerDirectory'] === false ? ' · not in the directory' : ''}`;
      case 'Account': return `Account ${a['parent'] ? `under ${a['parent']}` : 'group'} · ${String(a['type']).toLowerCase()}`;
      case 'FinancialStatementLine': return `Statement line${(a['mappedAccounts'] as string[]).length ? ` · from ${(a['mappedAccounts'] as string[]).join(', ')}` : ' · not mapped on the server'}`;
      case 'Reconciliation': return `Reconciliation · ${a['entity']} · ${a['status']} · ${a['tieStatus']}`;
      case 'FluxItem': return `Flux item · ${a['material'] ? 'material' : 'not material'} · ${a['status']}`;
      case 'Close': return `Period close · ${a['open'] ? 'open' : 'closed'} · readiness ${a['readinessPct']}%`;
      case 'Period': return `Accounting period · ${String(a['status']).toLowerCase()} · ${a['quarter']}`;
      case 'FiscalYear': case 'Quarter': return `Fiscal ${o.type === 'Quarter' ? 'quarter' : 'year'} · ${a['start'] ?? ''}–${a['end'] ?? ''} by the tenant calendar`;
      case 'FluxAnalysis': return `Flux review · ${a['period']} vs ${a['comparison']}`;
      case 'Budget': case 'Forecast': case 'Scenario': case 'PlanningVersion': return 'Planning version · not held on this server';
      default: return o.type.replace(/([a-z])([A-Z])/g, '$1 $2');
    }
  }

  /** getRelationships — the object's edges (both directions), to a depth, each with the object at the other end */
  relationships(id: string, actor: Actor, o: { rels?: Relation[]; depth?: number; limit?: number; period?: string } = {}) {
    const s = this.snapshot(actor, o.period), out: { from: SemanticObject; rel: Relation; to: SemanticObject; attrs?: Record<string, unknown> }[] = [];
    if (!s.nodes.has(id)) return out;
    const seen = new Set([id]); let frontier = [id];
    for (let d = 0; d < (o.depth ?? 1) && out.length < (o.limit ?? 40); d++) {
      const next: string[] = [];
      for (const n of frontier) for (const e of [...(s.out.get(n) ?? []), ...(s.inn.get(n) ?? [])]) {
        if (o.rels && !o.rels.includes(e.rel)) continue;
        if (out.length >= (o.limit ?? 40)) break;
        if (out.some((x) => x.from.id === e.from && x.to.id === e.to && x.rel === e.rel)) continue;
        out.push({ from: s.nodes.get(e.from)!, rel: e.rel, to: s.nodes.get(e.to)!, ...(e.attrs ? { attrs: e.attrs } : {}) });
        const other = e.from === n ? e.to : e.from; if (!seen.has(other)) { seen.add(other); next.push(other); }
      }
      frontier = next;
    }
    return out;
  }

  /** getResponsibleUsers — who prepares, reviews, owns or approves an object (and the work beneath it) */
  responsible(id: string, actor: Actor, period?: string): Responsibility[] {
    const s = this.snapshot(actor, period), me = s.nodes.get(id);
    if (!me) return [];
    const REL: Partial<Record<Relation, Responsibility['relation']>> = { PREPARED_BY: 'PREPARER', REVIEWED_BY: 'REVIEWER', OWNED_BY: 'OWNER', APPROVED_BY: 'APPROVER' };
    const direct = (oid: string) => (s.out.get(oid) ?? []).filter((e) => REL[e.rel]).map((e) => ({ e, via: s.nodes.get(oid)! }));
    /* the object itself, then the work beneath it that people are named on */
    const under: string[] = [id];
    const kids = (rels: Relation[], dir: 'out' | 'in') => (dir === 'out' ? s.out : s.inn).get(id)?.filter((e) => rels.includes(e.rel)).map((e) => (dir === 'out' ? e.to : e.from)) ?? [];
    if (me.type === 'FluxItem') under.push(...kids(['HAS_EXPLANATION'], 'out'));
    if (me.type === 'FluxAnalysis') for (const f of kids(['CONTAINS'], 'out')) { if (s.nodes.get(f)!.attrs['material']) under.push(f, ...((s.out.get(f) ?? []).filter((e) => e.rel === 'HAS_EXPLANATION').map((e) => e.to))); }
    if (me.type === 'Close') under.push(...kids(['HAS_TASK'], 'out'));
    if (me.type === 'Account' || me.type === 'FinancialStatementLine') under.push(...kids(['RECONCILED_BY', 'HAS_FLUX'], 'out'));
    if (me.type === 'LegalEntity' || me.type === 'ConsolidationNode') under.push(...kids(['BELONGS_TO'], 'in').filter((x) => ['Reconciliation', 'CloseTask'].includes(s.nodes.get(x)!.type)));
    if (me.type === 'CloseBlocker') under.push(...kids(['RELATES_TO'], 'out'));
    const out: Responsibility[] = [];
    for (const u of [...new Set(under)]) for (const { e, via } of direct(u)) {
      let person = s.nodes.get(e.to)!;
      const notes: string[] = [];
      /* an owner that is a job title: name the people who hold it, and say it came through the title */
      if (person.type === 'Role') { const holders = (s.inn.get(person.id) ?? []).filter((x) => x.rel === 'HAS_ROLE').map((x) => s.nodes.get(x.from)!); notes.push(`Owned by the ${person.label} role${holders.length ? ` (held by ${holders.map((h) => h.label).join(', ')})` : ''}.`); if (holders.length === 1) person = holders[0]!; }
      const rel = REL[e.rel]!;
      if (person.attrs['inIdentityDirectory'] === false && person.attrs['inReviewerDirectory'] === false) notes.push(`${person.label} is not in the directory; authority and scope cannot be checked.`);
      if (rel === 'REVIEWER' && person.attrs['canReview'] === false) notes.push(`${person.label} is not authorized to review in the reviewer directory.`);
      if (rel === 'REVIEWER') { const prep = direct(u).find((x) => x.e.rel === 'PREPARED_BY'); if (prep && prep.e.to === person.id) notes.push('Segregation of duties: the preparer is also the reviewer (SOD-PREPARER-NOT-REVIEWER).'); }
      const scope = person.attrs['reviewScope'];
      if (rel === 'REVIEWER' && Array.isArray(scope) && via.scope && !Array.isArray(via.scope) && via.scope !== 'GROUP' && !scope.includes(via.scope)) notes.push(`${person.label}'s review scope (${scope.join(', ')}) does not include ${via.scope}.`);
      out.push({ person, relation: rel, via, notes });
    }
    return out;
  }

  /** getTracePath — statement → line → account → population → transaction → source / evidence, or up from a txn */
  trace(id: string, actor: Actor, period?: string): { steps: TraceStep[]; notes: string[] } {
    const s = this.snapshot(actor, period), p = s.period, gl = this.d.gl, steps: TraceStep[] = [], notes: string[] = [];
    const push = (level: TraceStep['level'], sid: string, label: string, detail: string) => steps.push({ level, id: sid, label, detail });
    const canGl = actor.permissions.includes('GL_VIEW');
    const vis = actor.scopeIds === 'ALL' ? 'ALL' as const : new Set(actor.scopeIds);
    const down = (acct: string) => {
      const a = s.nodes.get(`account:${acct}`)!;
      push('Account', a.id, a.label, `${String(a.attrs['type']).toLowerCase()} account group`);
      if (!canGl) { notes.push(`${actor.role} lacks GL_VIEW, so the trace stops at the account.`); return; }
      const def = gl.definePopulation({ accounts: [acct], periodStart: p, periodEnd: p }, 'amount_desc', `${a.label} · ${periodLabel(p)} activity`);
      const q = gl.query(def, vis, { limit: 1 });
      push('GovernedLedgerPopulation', `population:${def.id}`, def.label, `${q.rowCount} governed lines · net ${$m(q.netUsd)}`);
      const l = q.page[0];
      if (!l) { notes.push('No governed activity in the period.'); return; }
      txnDown(l);
    };
    const txnDown = (l: GLine) => {
      push('GovernedLedgerEntry', `txn:${l.key}`, `${l.key} ${l.description}`, `${l.entity} · ${l.postingDate} · ${$m(l.usd)} (the largest line in the population)`);
      const src = gl.sourceRef(l);
      push('SourceTransaction', `sourcetxn:${src.transactionId}`, `${src.transactionType} ${src.transactionId}`, `${src.erpSystem} ${src.instance} · journal ${src.journalId} line ${src.lineId}`);
      push('SourceSystem', `source:${l.connector}`, src.erpSystem, `${src.availability}${src.deepLink ? '' : ' · no deep link published'}`);
      if (actor.permissions.includes('EVIDENCE_VIEW')) {
        const refs = [l.invoiceRef && `invoice ${l.invoiceRef}`, l.poRef && `PO ${l.poRef}`, l.contractRef && `contract ${l.contractRef}`, l.approvalRef && `approval ${l.approvalRef}`].filter(Boolean);
        const rels = WORK.relsTo(`txn:${l.key}`);
        push('Evidence', `evidence:${l.key}`, refs.length ? refs.join(' · ') : 'No document reference', `${refs.length ? `references from ${AP_EXTRACT.id}` : 'not an AP line'}${rels.length ? ` · ${rels.length} linked in Korvyn` : ''} · documents are not connected`);
      }
    };
    const ob = s.nodes.get(id);
    if (id.startsWith('txn:')) {
      const l = gl.lines.find((x) => x.key === id.slice(4) && (vis === 'ALL' || vis.has(x.entity)));
      if (!l || !canGl) return { steps, notes: ['No such transaction in your authorized scope.'] };
      const lines = Object.entries(FLUX_LINE_ACCOUNTS).filter(([, a]) => a.includes(l.group)).map(([k]) => s.nodes.get(`fsline:${k}`)).filter(Boolean) as SemanticObject[];
      const st = lines[0] ? this.statementOf(lines[0].id, s) : null;
      if (st) push('FinancialStatement', st.id, st.label, 'where the transaction is presented');
      if (lines[0]) push('FinancialStatementLine', lines[0].id, lines[0].label, `mapped from ${l.group}`);
      push('Account', `account:${l.group}`, `${l.group} ${l.groupName}`, `posted to ${l.account} ${l.accountName}`);
      txnDown(l);
      return { steps, notes };
    }
    if (!ob) return { steps, notes: ['That object is not in your authorized scope.'] };
    if (ob.type === 'FinancialStatement') { push('FinancialStatement', ob.id, ob.label, 'statement'); notes.push('Name a line to trace a figure on it.'); return { steps, notes }; }
    if (ob.type === 'FinancialStatementLine') {
      const st = this.statementOf(ob.id, s); if (st) push('FinancialStatement', st.id, st.label, 'statement');
      const accts = this.accountsOfLine(ob.id, s).map((a) => a.slice(8));
      push('FinancialStatementLine', ob.id, ob.label, accts.length ? `mapped from ${accts.join(', ')} (FLUX_LINE_ACCOUNTS)` : 'not mapped to a server account group');
      if (!accts.length) { notes.push(`${ob.label} is not modelled on the server book, so it cannot be traced to governed lines.`); return { steps, notes }; }
      down(accts[0]!); if (accts.length > 1) notes.push(`Traced through ${accts[0]}; the line also maps from ${accts.slice(1).join(', ')}.`);
      return { steps, notes };
    }
    if (ob.type === 'Account') { const g = (ob.attrs['parent'] as string | null) ?? (ob.attrs['code'] as string); const ln = (s.inn.get(`account:${g}`) ?? []).find((e) => e.rel === 'MAPPED_FROM'); if (ln) { const st = this.statementOf(ln.from, s); if (st) push('FinancialStatement', st.id, st.label, 'statement'); push('FinancialStatementLine', ln.from, s.nodes.get(ln.from)!.label, `mapped from ${g}`); } down(ob.attrs['code'] as string); return { steps, notes }; }
    if (ob.type === 'Reconciliation' || ob.type === 'FluxItem') {
      const acct = ob.type === 'FluxItem' ? ob.attrs['account'] as string : (ob.attrs['accounts'] as string[])[0];
      if (!acct) { notes.push(`${ob.label} is computed by the Reconciliations module on a line the server book does not model; there is no governed population to trace.`); return { steps, notes }; }
      const g = gl.account(acct)?.parent ?? acct, ln = (s.inn.get(`account:${g}`) ?? []).find((e) => e.rel === 'MAPPED_FROM');
      if (ln) { const st = this.statementOf(ln.from, s); if (st) push('FinancialStatement', st.id, st.label, 'statement'); push('FinancialStatementLine', ln.from, s.nodes.get(ln.from)!.label, `mapped from ${g}`); }
      notes.push(`Traced from ${ob.label} through account ${acct}.`);
      down(acct); return { steps, notes };
    }
    notes.push(`${ob.type} is not a figure; a trace starts from a statement, line, account, reconciliation, flux item or transaction.`);
    return { steps, notes };
  }
  private statementOf(lineId: string, s: Snapshot): SemanticObject | null { let cur = lineId; for (let i = 0; i < 6; i++) { const up = (s.out.get(cur) ?? []).find((e) => e.rel === 'PART_OF'); if (!up) return null; if (up.to.startsWith('fs:')) return s.nodes.get(up.to) ?? null; cur = up.to; } return null; }

  /** getRelatedWorkflow / getRelatedEvidence / getRelatedFinancialObjects — the neighbourhood by kind */
  related(id: string, actor: Actor, kind: 'workflow' | 'evidence' | 'financial', period?: string): SemanticObject[] {
    const types: Record<typeof kind, SemanticType[]> = {
      workflow: ['Reconciliation', 'FluxItem', 'FluxExplanation', 'CloseTask', 'CloseBlocker', 'AuditRequest', 'ReconcilingItem'],
      evidence: ['Evidence', 'SupportDocument', 'AuditPopulation', 'AuditSelection'],
      financial: ['Account', 'FinancialStatementLine', 'FinancialStatement', 'Report', 'ReportingPackage', 'TrialBalance', 'LegalEntity', 'ConsolidationNode', 'Project', 'Vendor', 'Property'],
    };
    return [...new Map(this.relationships(id, actor, { depth: 2, limit: 120, ...(period ? { period } : {}) }).flatMap((r) => [r.from, r.to]).filter((o) => o.id !== id && types[kind].includes(o.type)).map((o) => [o.id, o])).values()];
  }

  /* =================================================================================================
     §18 — CROSS-DOMAIN QUERIES, answered by traversal over what the actor may see
     ================================================================================================= */
  /** subsidiaries (entities with a parent) and their reconciliations still open (workflow not APPROVED) */
  openReconciliationsBySubsidiary(actor: Actor, period?: string) {
    const s = this.snapshot(actor, period);
    const subs = [...s.nodes.values()].filter((o) => o.type === 'LegalEntity' && o.attrs['parent']);
    const recsOf = (eid: string) => (s.inn.get(eid) ?? []).filter((e) => e.rel === 'BELONGS_TO').map((e) => s.nodes.get(e.from)!).filter((o) => o.type === 'Reconciliation');
    const rows = subs.map((e) => ({ entity: e, recs: recsOf(e.id), open: recsOf(e.id).filter((r) => r.attrs['status'] !== 'APPROVED') }));
    const groupOpen = s.nodes.has('consol:GROUP') ? recsOf('consol:GROUP').filter((r) => r.attrs['status'] !== 'APPROVED') : [];
    return { period: s.period, rows, groupOpen };
  }
  /** material flux items and reconciliations in review, by the person who must review them */
  pendingReviews(actor: Actor, domain: 'flux' | 'recon' | 'close' | 'all', period?: string) {
    const s = this.snapshot(actor, period), out: { reviewer: SemanticObject | null; item: SemanticObject; state: string; domain: string }[] = [];
    const rev = (id: string) => { const e = (s.out.get(id) ?? []).find((x) => x.rel === 'REVIEWED_BY'); return e ? s.nodes.get(e.to)! : null; };
    if (domain === 'flux' || domain === 'all') for (const f of [...s.nodes.values()].filter((o) => o.type === 'FluxItem' && o.attrs['material'] && o.attrs['status'] !== 'APPROVED')) {
      const x = (s.out.get(f.id) ?? []).find((e) => e.rel === 'HAS_EXPLANATION');
      const r = rev(f.id) ?? (x ? rev(x.to) : null);
      out.push({ reviewer: r, item: f, domain: 'flux', state: f.attrs['status'] === 'UNEXPLAINED' ? 'needs an explanation before review' : f.attrs['status'] === 'SUBMITTED' ? 'explanation submitted — awaiting review' : `explanation ${String(f.attrs['status']).toLowerCase()}` });
    }
    if (domain === 'recon' || domain === 'all') for (const r of [...s.nodes.values()].filter((o) => o.type === 'Reconciliation' && ['IN_REVIEW', 'SUBMITTED', 'READY_FOR_REVIEW'].includes(String(o.attrs['status'])))) out.push({ reviewer: rev(r.id), item: r, domain: 'recon', state: 'in review' });
    if (domain === 'close' || domain === 'all') for (const t of [...s.nodes.values()].filter((o) => o.type === 'CloseTask' && o.attrs['status'] === 'AWAITING_APPROVAL')) out.push({ reviewer: rev(t.id), item: t, domain: 'close', state: 'awaiting approval' });
    return { period: s.period, items: out };
  }
  /** open work a person is named on */
  openWorkFor(personIdOrText: string, actor: Actor, period?: string) {
    const s = this.snapshot(actor, period);
    const res = personIdOrText.startsWith('person:') ? { status: 'RESOLVED' as const, object: s.nodes.get(personIdOrText)!, alsoKnownAs: [], term: personIdOrText } : this.resolve(personIdOrText, actor, { types: ['User'], ...(period ? { period } : {}) });
    if (res.status !== 'RESOLVED' || !res.object) return { resolution: res, items: [] as { item: SemanticObject; relation: string }[] };
    const done = (o: SemanticObject) => ['APPROVED', 'COMPLETE', 'NOT_REQUIRED'].includes(String(o.attrs['status']));
    const items = (s.inn.get(res.object.id) ?? []).filter((e) => ['PREPARED_BY', 'REVIEWED_BY', 'OWNED_BY', 'APPROVED_BY'].includes(e.rel)).map((e) => ({ item: s.nodes.get(e.from)!, relation: e.rel }))
      .filter((x) => ['Reconciliation', 'FluxItem', 'FluxExplanation', 'CloseTask', 'AuditRequest', 'Report', 'ReportingPackage'].includes(x.item.type) && !done(x.item));
    return { resolution: res, items };
  }
  /** material flux items with no support linked to them or to their explanation */
  materialFluxWithoutSupport(actor: Actor, period?: string) {
    const s = this.snapshot(actor, period);
    const sup = (id: string) => (s.out.get(id) ?? []).filter((e) => e.rel === 'SUPPORTED_BY').length;
    return { period: s.period, items: [...s.nodes.values()].filter((o) => o.type === 'FluxItem' && o.attrs['material']).map((f) => { const x = (s.out.get(f.id) ?? []).find((e) => e.rel === 'HAS_EXPLANATION'); return { item: f, explanation: x ? s.nodes.get(x.to)! : null, support: sup(f.id) + (x ? sup(x.to) : 0) }; }).filter((r) => r.support === 0) };
  }
  /** reports (and packages) that use an account group or statement line */
  reportsUsing(id: string, actor: Actor, period?: string) {
    const s = this.snapshot(actor, period), ob = s.nodes.get(id);
    if (!ob) return { object: null, reports: [], packages: [] };
    const targets = new Set([id]);
    if (ob.type === 'FinancialStatementLine') this.accountsOfLine(id, s).forEach((a) => targets.add(a));
    if (ob.type === 'Account') { const p = ob.attrs['parent'] as string | null; if (p) targets.add(`account:${p}`); (s.inn.get(id) ?? []).filter((e) => e.rel === 'MAPPED_FROM').forEach((e) => targets.add(e.from)); }
    const reports = new Map<string, { report: SemanticObject; lines: Set<string> }>();
    for (const t of targets) for (const e of s.inn.get(t) ?? []) if (e.rel === 'USES' && s.nodes.get(e.from)!.type === 'Report') { const r = reports.get(e.from) ?? { report: s.nodes.get(e.from)!, lines: new Set() }; r.lines.add(String(e.attrs?.['line'] ?? '')); reports.set(e.from, r); }
    const packages = [...reports.keys()].flatMap((r) => (s.inn.get(r) ?? []).filter((e) => e.rel === 'CONTAINS').map((e) => ({ pkg: s.nodes.get(e.from)!, report: s.nodes.get(r)! })));
    return { object: ob, reports: [...reports.values()].map((r) => ({ report: r.report, lines: [...r.lines] })), packages };
  }
  /** the reconciliations that support an account group's or statement line's balance (children and the line included) */
  reconciliationsFor(id: string, actor: Actor, period?: string, entity?: string) {
    const s = this.snapshot(actor, period), ob = s.nodes.get(id);
    if (!ob) return { object: null, recs: [] as SemanticObject[] };
    const accts = new Set<string>();
    if (ob.type === 'FinancialStatementLine') this.accountsOfLine(id, s).forEach((a) => accts.add(a));
    if (ob.type === 'Account') accts.add(id);
    /* "this balance" said while a reconciliation or flux item is in focus is that object's account balance */
    if (ob.type === 'Reconciliation') { (ob.attrs['accounts'] as string[]).forEach((a) => accts.add(`account:${a}`)); entity = entity ?? String(ob.attrs['entity']); }
    if (ob.type === 'FluxItem') accts.add(`account:${ob.attrs['account']}`);
    for (const a of [...accts]) (s.inn.get(a) ?? []).filter((e) => e.rel === 'CHILD_OF').forEach((e) => accts.add(e.from));
    const lines = ob.type === 'FinancialStatementLine' ? [id] : [...accts].flatMap((a) => (s.inn.get(a) ?? []).filter((e) => e.rel === 'MAPPED_FROM').map((e) => e.from));
    const recs = new Map<string, SemanticObject>();
    for (const t of [...accts, ...lines]) for (const e of s.out.get(t) ?? []) if (e.rel === 'RECONCILED_BY') recs.set(e.to, s.nodes.get(e.to)!);
    return { object: ob, recs: [...recs.values()].filter((r) => !entity || r.attrs['entity'] === entity || r.attrs['entity'] === 'GROUP') };
  }
  /** the largest unresolved close issue: blocking first, then by amount — and who owns it */
  largestCloseIssue(actor: Actor, period?: string) {
    const s = this.snapshot(actor, period);
    const sev: Record<string, number> = { BLOCKING: 0, HIGH: 1, MEDIUM: 2 };
    const bl = [...s.nodes.values()].filter((o) => o.type === 'CloseBlocker').sort((a, b) => sev[String(a.attrs['severity'])]! - sev[String(b.attrs['severity'])]! || ((b.attrs['amountUsd'] as number | null) ?? -1) - ((a.attrs['amountUsd'] as number | null) ?? -1));
    const top = bl[0] ?? null;
    if (!top) return { issue: null, target: null, people: [] as Responsibility[], ranked: 0 };
    const t = (s.out.get(top.id) ?? []).find((e) => e.rel === 'RELATES_TO');
    const target = t ? s.nodes.get(t.to)! : null;
    return { issue: top, target, people: target ? this.responsible(target.id, actor, s.period) : [], ranked: bl.length };
  }
  /** entity tree for the actor */
  hierarchy(actor: Actor) {
    const s = this.snapshot(actor), ents = [...s.nodes.values()].filter((o) => o.type === 'LegalEntity');
    const depth = (o: SemanticObject): number => { const p = o.attrs['parent'] as string | null; const po = p ? s.nodes.get(`entity:${p}`) : null; return po ? depth(po) + 1 : 0; };
    const order = (o: SemanticObject): string => { const p = o.attrs['parent'] as string | null; const po = p ? s.nodes.get(`entity:${p}`) : null; return (po ? `${order(po)}/` : '') + o.attrs['entityId']; };
    return ents.sort((a, b) => order(a).localeCompare(order(b))).map((o) => ({ entity: o, depth: depth(o), region: (s.out.get(o.id) ?? []).find((e) => e.rel === 'IN_REGION')?.to ?? null, visibleParent: !!(o.attrs['parent'] && s.nodes.has(`entity:${o.attrs['parent']}`)) }));
  }
  /** a dimension's account balances — what "the TB for a project" can honestly be */
  subjectBalances(subject: SemanticObject, actor: Actor, period?: string) {
    const s = this.snapshot(actor, period), p = s.period, gl = this.d.gl;
    const dim = subject.type === 'Project' ? 'project' : subject.type === 'Property' ? 'property' : subject.type === 'CostCenter' ? 'costCenter' : subject.type === 'Vendor' ? 'vendor' : null;
    const val = (subject.attrs['code'] as string | undefined) ?? subject.label;
    if (!dim) return null;
    const vis = actor.scopeIds === 'ALL' ? null : new Set(actor.scopeIds);
    const lines = gl.lines.filter((l) => (dim === 'vendor' ? l.vendor === val && l.account !== '20100' : (l as unknown as Record<string, string | null>)[dim] === val) && l.period <= p && (!vis || vis.has(l.entity)));
    const by = new Map<string, { group: string; name: string; section: string; amount: number; lines: number }>();
    for (const l of lines) {
      const bs = l.section !== 'INCOME_STATEMENT';
      if (!bs && l.period !== p) continue;
      const amt = bs ? l.local * (FX_CLOSING_SET.toUsd[l.currency]?.[p] ?? NaN) : l.usd;
      const g = by.get(l.group) ?? { group: l.group, name: l.groupName, section: l.section, amount: 0, lines: 0 };
      g.amount += amt; g.lines++; by.set(l.group, g);
    }
    return { period: p, dimension: dim, value: val, entities: [...new Set(lines.map((l) => l.entity))], rows: [...by.values()].sort((a, b) => a.group.localeCompare(b.group)), lineCount: lines.length };
  }
}

function index(key: string, period: string, nodes: Map<string, SemanticObject>, edges: Edge[]): Snapshot {
  const out = new Map<string, Edge[]>(), inn = new Map<string, Edge[]>();
  for (const e of edges) { (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e); (inn.get(e.to) ?? inn.set(e.to, []).get(e.to)!).push(e); }
  return { key, period, nodes, out, inn, edges };
}
/** words that name an object's TYPE, and the types they mean */
const TYPE_WORDS: [RegExp, SemanticType[]][] = [
  [/\breconciliations?\b|\brecs?\b/, ['Reconciliation']], [/\breports?\b/, ['Report', 'ReportingPackage']], [/\bpackages?\b/, ['ReportingPackage']],
  [/\bclose tasks?\b|\btasks?\b/, ['CloseTask']], [/\bflux (items?|lines?)\b/, ['FluxItem']], [/\bpbc( requests?)?\b/, ['AuditRequest']],
];
/** tie-break order when two objects score alike: governed structure before work before people */
const ORDER: SemanticType[] = ['LegalEntity', 'ConsolidationNode', 'Account', 'FinancialStatementLine', 'Project', 'Vendor', 'Property', 'Reconciliation', 'FluxAnalysis', 'FluxItem', 'Close', 'Report', 'User'];
const rank = (o: SemanticObject) => { const i = ORDER.indexOf(o.type); return i < 0 ? ORDER.length : i; };

/** one graph per ledger — tools and the context assembler share it */
const GRAPHS = new WeakMap<GovernedLedger, FinancialGraph>();
export function financialGraph(d: GraphDeps): FinancialGraph {
  let g = GRAPHS.get(d.gl);
  if (!g) { g = new FinancialGraph(d); GRAPHS.set(d.gl, g); }
  if (d.artifacts && !g.d.artifacts) (g.d as GraphDeps).artifacts = d.artifacts;
  return g;
}
