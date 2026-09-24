/**
 * AMBIGUITY — does a goal's wording resolve to ONE governed value per field, or to several?
 *
 * One resolver per field type, each reading the catalogue Korvyn actually governs (the vendor master, the scopes, the
 * projects, the chart, the tenant calendar, the PBC requests, the saved workbooks). A resolver returns a value (one
 * canonical match), an AMBIGUITY (several matches that would change the answer — Sloane asks), or a NOTICE (the field
 * has no governed catalogue on this server, so Sloane says so instead of guessing). It never clarifies what cannot
 * change the result: one match proceeds silently.
 */
import { periodLabel } from '../financials.js';
import type { ConvDeps } from '../conversation.js';
import { valuesIn } from '../conversation.js';

export type AmbiguityField = 'vendor' | 'customer' | 'entity' | 'project' | 'fund' | 'period' | 'currency' | 'lens' | 'planningVersion' | 'scenario' | 'account' | 'artifact' | 'pbc';
export interface Candidate { id: string; label: string; detail: string }
export interface Ambiguity { field: AmbiguityField; term: string; question: string; reason: string; candidates: Candidate[] }
export interface Resolved {
  vendor?: string; project?: string; entity?: string; account?: string; pbcRequestId?: string; artifactId?: string;
  period?: string; periodRange?: { start: string; end: string } | null; periodLabel?: string;
}
export interface Resolution { values: Resolved; ambiguities: Ambiguity[]; notices: string[]; labels: Record<string, string> }
export interface AmbiguityDeps extends ConvDeps {
  periods: string[]; workingPeriod: string;
  pbcRequests: { id: string; pbcNumber: string; title: string; status: string }[];
  artifacts: { id: string; name: string; status: string; type: string }[];
}

/* ================================================================================================
   TENANT CALENDAR — how relative periods resolve. A calendar that decides deterministically never asks.
   ================================================================================================ */
export type RelativePeriodPolicy = 'ASK_WHEN_OPEN' | 'LAST_COMPLETED' | 'CURRENT';
export const TENANT_CALENDAR = {
  fiscalYearStartMonth: 1,
  /** "last quarter" while the current quarter's final month is still open could mean the quarter closing now or the last
   *  completed one. ASK_WHEN_OPEN asks in exactly that case; the other two policies decide it. */
  relativePeriods: ((process.env['SLOANE_RELATIVE_PERIODS'] ?? 'ASK_WHEN_OPEN').toUpperCase() as RelativePeriodPolicy),
};
export function setRelativePeriodPolicy(p: RelativePeriodPolicy) { TENANT_CALENDAR.relativePeriods = p; }
const qOf = (p: string) => ({ y: Number(p.slice(0, 4)), q: Math.floor((Number(p.slice(5, 7)) - 1) / 3) + 1 });
const qRange = (y: number, q: number) => ({ start: `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}`, end: `${y}-${String(q * 3).padStart(2, '0')}` });
const prevQ = (y: number, q: number) => (q === 1 ? { y: y - 1, q: 4 } : { y, q: q - 1 });
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (t: string) => [...new Set(t.toLowerCase().replace(/[^a-z0-9& -]/g, ' ').split(/\s+/).filter((w) => w.length >= 3))];
const GENERIC = new Set(['review', 'investigate', 'activity', 'spend', 'prepare', 'the', 'and', 'for', 'fy26', 'close', 'june', 'package', 'support', 'audit', 'controller', 'only', 'with', 'ready', 'get', 'global', 'portfolio', 'consolidated', 'group', 'all']);
const $m = (v: number) => `$${(Math.abs(v) / 1e6).toFixed(2)}M`;

export function resolveTerms(text: string, d: AmbiguityDeps): Resolution {
  const t = ` ${text.toLowerCase()} `, out: Resolution = { values: {}, ambiguities: [], notices: [], labels: {} };
  const ws = words(t);

  /* ---- vendor: against the vendor MASTER, visible to the actor ---- */
  const master = d.gl.vendorMaster(d.visible);
  const exactV = master.filter((v) => new RegExp(`\\b${esc(v.name.toLowerCase())}\\b`).test(t));
  if (exactV.length === 1) { out.values.vendor = exactV[0]!.name; out.labels['vendor'] = exactV[0]!.name; }
  else if (!exactV.length) {
    for (const w of ws) {
      if (w.length < 4 || GENERIC.has(w) || ['county', 'national', 'dominion'].includes(w)) continue;
      const hits = master.filter((v) => v.name.toLowerCase().split(/\s+/)[0] === w);
      if (hits.length === 1) { out.values.vendor = hits[0]!.name; out.labels['vendor'] = hits[0]!.name; break; }
      if (hits.length > 1) {
        const withAct = hits.filter((h) => h.hasActivity);
        out.ambiguities.push({ field: 'vendor', term: w, question: `Which ${cap(w)} vendor do you mean?`,
          reason: `I found ${hits.length} ${cap(w)} vendors in your authorized scope${withAct.length === 1 ? `; only ${withAct[0]!.name} has governed activity in the period` : ''}. Which one should I use?`,
          candidates: hits.sort((a, b) => Math.abs(b.activityUsd) - Math.abs(a.activityUsd)).map((h) => ({ id: `vendor:${h.name}`, label: h.name, detail: h.hasActivity ? `${$m(h.activityUsd)} of governed activity` : 'Vendor master only — no governed activity' })) });
        break;
      }
    }
  }

  /* ---- project / property ---- */
  const vals = valuesIn(t, d);
  const proj = vals.filter((v) => v.dimension === 'project');
  if (proj.length === 1) { out.values.project = proj[0]!.value; out.labels['project'] = proj[0]!.name; }
  else if (!proj.length) {
    const codes = d.gl.dimensionValues('project');
    for (const w of ws) {
      const hits = codes.filter((c) => c.toLowerCase().split('-').includes(w));
      if (hits.length > 1) { out.ambiguities.push({ field: 'project', term: w, question: `Which ${w.toUpperCase()} project do you mean?`, reason: `${hits.length} governed projects carry "${w.toUpperCase()}": ${hits.join(', ')}. Which one should I use?`, candidates: hits.map((h) => ({ id: `project:${h}`, label: h, detail: 'Governed project' })) }); break; }
      if (hits.length === 1) { out.values.project = hits[0]!; out.labels['project'] = hits[0]!; break; }
    }
  }

  /* ---- entity / scope: an explicit entity word resolves; a shared name ("Meridian") is several scopes ---- */
  const ent = vals.filter((v) => v.dimension === 'entity');
  if (ent.length === 1) { out.values.entity = ent[0]!.value; out.labels['entity'] = ent[0]!.name; }
  else if (!ent.length && !out.values.vendor && !out.values.project && !out.ambiguities.length) {
    const scopes = d.data.scopes().filter((s) => d.visible === 'ALL' || s.kind !== 'ENTITY' || d.visible.has(s.id));
    for (const w of ws) {
      if (GENERIC.has(w) || w.length < 4) continue;
      const hits = scopes.filter((s) => new RegExp(`\\b${esc(w)}\\b`, 'i').test(s.name) || s.id.toLowerCase() === w);
      if (hits.length === 1) { out.values.entity = hits[0]!.kind === 'ENTITY' ? hits[0]!.id : undefined; out.labels['entity'] = hits[0]!.name; break; }
      if (hits.length > 1) {
        out.ambiguities.push({ field: 'entity', term: w, question: `Which ${cap(w)} entity do you mean?`, reason: `"${cap(w)}" matches ${hits.length} scopes you can see. Which one should I use?`,
          candidates: hits.map((s) => ({ id: `entity:${s.kind === 'ENTITY' ? s.id : 'GROUP'}`, label: s.kind === 'ENTITY' ? s.name : `${s.name} — all entities`, detail: s.kind === 'ENTITY' ? `Legal entity ${s.id}` : 'Consolidated scope' })) });
        break;
      }
    }
  }

  /* ---- financial line / account: a word two account groups share ---- */
  const AMBIG_ACCT: [RegExp, RegExp, string[]][] = [
    [/\bintercompany\b|\bic\b/, /\b(intercompany|ic) (receivable|payable)s?\b|\bdue (from|to)\b/, ['13000', '23000']],
    [/\bpayables?\b/, /\b(accounts|retainage|intercompany|ic|trade) payables?\b|\bap\b/, ['20000', '22000', '23000']],
    [/\breceivables?\b/, /\b(accounts|intercompany|ic|trade) receivables?\b|\bar\b/, ['11000', '13000']],
  ];
  if (/\bcip\b|construction in progress/.test(t)) out.values.account = '15000';
  else for (const [word, exact, codes] of AMBIG_ACCT) {
    if (!word.test(t) || exact.test(t)) continue;
    if (/\bpbc\b/.test(t)) break;
    const accts = codes.map((c) => d.gl.account(c)).filter((a): a is NonNullable<typeof a> => !!a);
    const term = (t.match(word) ?? ['account'])[0].trim();
    out.ambiguities.push({ field: 'account', term, question: `Which ${term} account do you mean?`, reason: `"${term}" names ${accts.length} account groups in the chart. Which one should I use?`, candidates: accts.map((a) => ({ id: `account:${a.code}`, label: `${a.code} ${a.name}`, detail: 'Account group' })) });
    break;
  }

  /* ---- period: named months resolve; relative periods follow the tenant calendar ---- */
  const wp = d.workingPeriod, { y, q } = qOf(wp);
  const wpClosing = Number(wp.slice(5, 7)) % 3 === 0;
  const explicitQ = t.match(/\bq([1-4])(?:\s+(20\d\d))?\b/);
  if (explicitQ) { const yy = Number(explicitQ[2] ?? y), r = qRange(yy, Number(explicitQ[1])); setRange(out, r, d, `Q${explicitQ[1]} ${yy}`); }
  else if (/\b(last|previous|prior) quarter\b/.test(t)) {
    const last = prevQ(y, q), cur = { y, q };
    const policy = TENANT_CALENDAR.relativePeriods;
    if (policy === 'ASK_WHEN_OPEN' && wpClosing) {
      out.ambiguities.push({ field: 'period', term: 'last quarter', question: 'Which quarter do you mean?',
        reason: `${periodLabel(wp)} is still open, so "last quarter" could be Q${cur.q} ${cur.y}, which is closing now, or Q${last.q} ${last.y}, the last completed quarter. Which one should I review?`,
        candidates: [{ id: `quarter:${last.y}-Q${last.q}`, label: `Q${last.q} ${last.y}`, detail: 'Last completed quarter' }, { id: `quarter:${cur.y}-Q${cur.q}`, label: `Q${cur.q} ${cur.y}`, detail: 'Closing now' }] });
    } else { const pick = policy === 'CURRENT' && wpClosing ? cur : last; setRange(out, qRange(pick.y, pick.q), d, `Q${pick.q} ${pick.y}`); }
  } else if (/\bthis quarter\b/.test(t)) setRange(out, qRange(y, q), d, `Q${q} ${y}`);
  else if (/\b(last|previous|prior) month\b/.test(t)) { const i = d.periods.indexOf(wp); if (i > 0) { out.values.period = d.periods[i - 1]!; out.labels['period'] = periodLabel(d.periods[i - 1]!); } }
  else {
    const m = MONTH_NAMES.findIndex((mn) => new RegExp(`\\b(${mn}|${mn.slice(0, 3)})\\b`).test(t));
    if (m >= 0) { const p = `${y}-${String(m + 1).padStart(2, '0')}`; if (d.periods.includes(p)) { out.values.period = p; out.labels['period'] = periodLabel(p); } else out.notices.push(`${cap(MONTH_NAMES[m]!)} ${y} is not a governed period yet; the governed months are ${periodLabel(d.periods[0]!)}–${periodLabel(d.periods.at(-1)!)}.`); }
  }
  if (/\b(last|prior|previous) year\b|\bfy ?25\b|\b2025\b/.test(t)) out.notices.push('FY2025 is not in the governed ledger on this server, so a prior-year view is not available.');

  /* ---- PBC request ---- */
  if (/\bpbc\b/.test(t)) {
    const num = t.match(/\bpbc[\s#-]*(?:no\.?\s*)?(\d[\d-]*)\b/);
    let hits = d.pbcRequests.filter((r) => r.status !== 'DELIVERED');
    if (num) hits = hits.filter((r) => r.pbcNumber.replace(/\D/g, '').endsWith(num[1]!.replace(/\D/g, '')));
    else { const topical = hits.filter((r) => ws.some((w) => !GENERIC.has(w) && w.length >= 4 && w !== 'request' && r.title.toLowerCase().includes(w))); if (topical.length) hits = topical; }
    if (hits.length === 1) { out.values.pbcRequestId = hits[0]!.id; out.labels['pbc'] = `${hits[0]!.pbcNumber} — ${hits[0]!.title}`; }
    else if (hits.length > 1) out.ambiguities.push({ field: 'pbc', term: 'PBC request', question: 'Which PBC request do you mean?', reason: `There are ${hits.length} open PBC requests. Which one should I prepare support for?`, candidates: hits.map((r) => ({ id: `pbc:${r.id}`, label: `${r.pbcNumber} — ${r.title}`, detail: r.status.replace(/_/g, ' ').toLowerCase() })) });
  }

  /* ---- artifact target: an EXISTING workbook named by words the user used ---- */
  if (/\b(existing|saved|my|the)\b[^.]*\b(package|workbook)\b/.test(t) && /\b(refresh|regenerate|re-?generate|update|rerun|re-run)\b/.test(t)) {
    const hits = d.artifacts.filter((a) => a.status !== 'ARCHIVED' && ws.some((w) => !GENERIC.has(w) && w.length >= 3 && a.name.toLowerCase().includes(w)));
    const pool = hits.length ? hits : d.artifacts.filter((a) => a.status !== 'ARCHIVED');
    if (pool.length === 1) { out.values.artifactId = pool[0]!.id; out.labels['artifact'] = pool[0]!.name; }
    else if (pool.length > 1) out.ambiguities.push({ field: 'artifact', term: 'workbook', question: 'Which workbook do you mean?', reason: `You have ${pool.length} saved workbooks that match. Which one should I use?`, candidates: pool.slice(0, 6).map((a) => ({ id: `artifact:${a.id}`, label: a.name, detail: a.type.replace(/_/g, ' ').toLowerCase() })) });
  }

  /* ---- fields with no governed catalogue on this server: said, never guessed ---- */
  if (/\bcustomers?\b/.test(t)) out.notices.push('Customers are not a governed catalogue on this server (the AP extract carries vendors only), so Sloane cannot resolve a customer.');
  if (/\bfunds?\b/.test(t)) out.notices.push('Funds are not modelled on this server; every figure is Corporate Consolidated or a legal entity.');
  if (/\b(budget|forecast|plan(ning)? version|reforecast)\b/.test(t)) out.notices.push('There is no planning version on this server — only governed actuals — so Sloane will not compare against a budget or forecast.');
  if (/\bscenarios?\b|\bdownside\b|\bupside\b/.test(t)) out.notices.push('Scenarios are not modelled on this server; Sloane works on governed actuals only.');
  if (/\bin (eur|euros?|gbp|pounds?|sgd|local currency)\b/.test(t)) out.notices.push('The server book presents USD only; entity figures are translated at the governed rate sets, not re-presented in local currency.');
  if (/\b(ifrs|statutory|local gaap|tax basis)\b/.test(t)) out.notices.push('Only the Corporate Consolidated · US GAAP lens is governed on this server.');
  return out;
}
function setRange(out: Resolution, r: { start: string; end: string }, d: AmbiguityDeps, label: string) {
  const end = d.periods.includes(r.end) ? r.end : d.periods.filter((p) => p <= r.end).at(-1);
  if (!end || r.start > d.periods.at(-1)!) { out.notices.push(`${label} is not a governed period on this server.`); return; }
  out.values.periodRange = { start: r.start, end }; out.values.period = end; out.values.periodLabel = label; out.labels['period'] = label;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** apply a chosen candidate to the resolved values */
export function applyCandidate(field: AmbiguityField, id: string, d: AmbiguityDeps): Resolved & { label: string } {
  const [kind, v] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  switch (kind) {
    case 'vendor': return { vendor: v, label: v };
    case 'project': return { project: v, label: v };
    case 'entity': return v === 'GROUP' ? { entity: undefined, label: 'Corporate Consolidated' } : { entity: v, label: d.data.scope(v)?.name ?? v };
    case 'account': return { account: v, label: `${v} ${d.gl.account(v)?.name ?? ''}`.trim() };
    case 'pbc': return { pbcRequestId: v, label: d.pbcRequests.find((r) => r.id === v)?.pbcNumber ?? v };
    case 'artifact': return { artifactId: v, label: d.artifacts.find((a) => a.id === v)?.name ?? v };
    case 'quarter': { const [yy, qq] = v.split('-Q'); const r = qRange(Number(yy), Number(qq)); const end = d.periods.includes(r.end) ? r.end : d.periods.filter((p) => p <= r.end).at(-1)!; return { period: end, periodRange: { start: r.start, end }, periodLabel: `Q${qq} ${yy}`, label: `Q${qq} ${yy}` }; }
    default: void field; return { label: v };
  }
}
