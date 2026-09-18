/**
 * AUDIT / PBC INTELLIGENCE (Phase 5A) — turn an auditor's request into a governed, traceable population and a support
 * package.
 *
 *   REQUEST → INTERPRET → RESOLVE SCOPE → BUILD POPULATION → TIE TO FINANCIAL TRUTH → TRACE EVIDENCE → IDENTIFY GAPS
 *   → REVIEW → GENERATE PACKAGE
 *
 * There is no audit ledger and no audit evidence store. A PBC request is a WORK record that holds what was asked (its
 * requirements, its selections as the auditor supplied them, the decisions a person made about them, the gap
 * resolutions). Everything else is DERIVED on every read from the services the rest of Korvyn uses:
 *
 *   population       GovernedLedger.definePopulation / query        (the same population ids Sloane and Excel use)
 *   tie-out          the ledger's own balances + TieOutService's ERP bridge
 *   evidence         the AP extract references on each governed line + WORK evidence relationships (the EvidenceGraph)
 *   reconciliations  ControlService.reconcile / reconBalance        (server-authoritative, versioned)
 *   Flux             ControlService.fluxItems (the ONE explanation record, id + version)
 *   package          the ArtifactEngine (type PBC_PACKAGE, sections in artifacts/sections.ts)
 *
 * A request PINS a fingerprint of what it was evaluated over; a later change in the ledger, the mapping, a
 * reconciliation, the evidence relationships or the tie-out makes it STALE — detected by comparison, never stored.
 */
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import type { ControlService } from '../controls.js';
import type { FinancialDataService } from '../financials.js';
import { type GLine, type GovernedLedger, type PopulationFilter, SOURCE_HEALTH } from '../governed.js';
import { WORK } from '../store.js';
import { type Stamped, patchRecordData } from '../persistence/repositories.js';
import type { Actor } from '../tools.js';
import { MAPPING_VERSION, type TieOutService, type TieStatus } from '../artifacts/tieout.js';
import { monLabel, periodToken, rangeLabel } from '../artifacts/model.js';

/* ================================================================================================
   THE DOMAIN
   ================================================================================================ */
export type EvidenceType = 'INVOICE' | 'PO' | 'CONTRACT' | 'CHANGE_ORDER' | 'APPROVAL' | 'RECEIPT' | 'WORKPAPER' | 'RECONCILIATION' | 'FLUX_EXPLANATION' | 'POLICY' | 'SOURCE_TRANSACTION' | 'OTHER';
export const EVIDENCE_TYPES: EvidenceType[] = ['INVOICE', 'PO', 'CONTRACT', 'CHANGE_ORDER', 'APPROVAL', 'RECEIPT', 'WORKPAPER', 'RECONCILIATION', 'FLUX_EXPLANATION', 'POLICY', 'SOURCE_TRANSACTION', 'OTHER'];
export const EVIDENCE_LABEL: Record<EvidenceType, string> = { INVOICE: 'Invoice', PO: 'Purchase order', CONTRACT: 'Contract', CHANGE_ORDER: 'Change order', APPROVAL: 'Approval', RECEIPT: 'Receipt', WORKPAPER: 'Workpaper', RECONCILIATION: 'Reconciliation', FLUX_EXPLANATION: 'Flux explanation', POLICY: 'Policy', SOURCE_TRANSACTION: 'ERP source transaction', OTHER: 'Other support' };
export type PopulationType = 'ADDITIONS' | 'ACTIVITY' | 'DISPOSALS';
export type IntakeSource = 'NL' | 'MANUAL' | 'UPLOAD' | 'SEED';
/** the structured reading of a request — what the model proposes and Korvyn validates */
export interface PBCRequirement {
  title: string; periodStart: string; periodEnd: string; scopeId: string;
  /** account codes (a group includes its children) and the statement object they name */
  accounts: string[]; objectName: string; populationType: PopulationType;
  minAbsUsd: number | null; entities?: string[]; project?: string | null; property?: string | null; vendor?: string | null;
  requiredEvidence: EvidenceType[];
}
export interface PBCInterpretation {
  requirement: PBCRequirement; from: 'words' | 'model+words' | 'upload' | 'manual';
  /** what the model proposed (tool arguments), kept so a reviewer can see what was accepted and what Korvyn overrode */
  modelProposal: Record<string, string> | null; resolved: string[]; notes: string[];
}
export type MatchStatus = 'MATCHED' | 'MULTIPLE_MATCHES' | 'PARTIAL_MATCH' | 'NOT_FOUND' | 'SOURCE_UNAVAILABLE';
export interface SelectionIdentifiers { transactionId?: string; journalId?: string; invoiceId?: string; account?: string; entity?: string; vendor?: string; amount?: number; date?: string; description?: string }
export interface AuditSelectionBody {
  requestId: string; no: number; source: 'AUTO' | 'AUDITOR'; method: string;
  /** the auditor's own text, kept verbatim */
  original: string; identifiers: SelectionIdentifiers;
  resolution: { chosenKey: string; by: string; at: string; note: string } | null;
}
export type EvidenceStatus = 'AVAILABLE' | 'MISSING' | 'PARTIAL' | 'UNAVAILABLE' | 'AMBIGUOUS' | 'NOT_REQUIRED';
export type DocumentAvailability = 'REFERENCE_AVAILABLE' | 'FILE_AVAILABLE' | 'EXTERNAL_RETRIEVAL_REQUIRED' | 'MISSING' | 'ACCESS_DENIED';
export interface EvidenceMatch {
  type: EvidenceType; status: EvidenceStatus; reference: string | null; document: DocumentAvailability; sourceSystem: string;
  detail: string; trace: string; evidenceId: string | null;
}
export type Coverage = 'FULL' | 'PARTIAL' | 'UNSUPPORTED';
export type GapStatus = 'OPEN' | 'RESOLVED' | 'WAIVED';
export interface SupportGapBody {
  requestId: string; gapKey: string; selectionNo: number; selectionId: string; transactionId: string | null;
  requirement: EvidenceType | 'SELECTION'; kind: string; amountUsd: number; severity: 'HIGH' | 'MEDIUM' | 'LOW'; owner: string;
  resolution: string | null; note: string | null; resolvedBy: string | null; resolvedAt: string | null;
}
export type PBCStatus = 'DRAFT' | 'MATCHING' | 'GATHERING_EVIDENCE' | 'REVIEW_REQUIRED' | 'READY' | 'GENERATING' | 'GENERATED' | 'DELIVERED' | 'STALE';
export interface PBCPins { populationId: string; rowCount: number; totalUsd: number; contentHash: string; dataVersion: string; mappingVersion: string; tieStatus: TieStatus; evidenceHash: string; reconHash: string; fluxHash: string; selectionHash: string; fingerprint: string; pinnedAt: string }
export interface PBCRequestBody {
  /* the 3C seeded fields, kept so every PBC_REQUEST record reads one way */
  title: string; populationId: string | null; owner: string; requestedBy: string; due: string;
  pbcNumber: string; source: IntakeSource; raw: string; fileName: string | null;
  intake: 'PARSED' | 'REQUIRES_REVIEW'; intakeNotes: string[];
  interpretation: PBCInterpretation | null;
  selectionsMode: 'POPULATION' | 'AUDITOR';
  pins: PBCPins | null; packageArtifactId: string | null;
  lifecycle: 'OPEN' | 'GENERATING' | 'GENERATED' | 'DELIVERED';
  delivered: { generationId: string; artifactVersion: number; at: string; by: string } | null;
  history: { version: number; at: string; by: string; change: string; requirement: PBCRequirement | null; pins: PBCPins | null }[];
  lastChange: string; createdByName: string; investigationId: string | null;
}
const KIND = 'PBC_REQUEST', SEL = 'AUDIT_SELECTION', GAP = 'SUPPORT_GAP';
/** the amount AT RISK behind a set of gaps: each affected selection once (a selection with three gaps is one exposure) */
export function gapExposure(gaps: { selectionId: string; requirement: string; amountUsd: number }[]) { const m = new Map<string, number>(); for (const g of gaps) if (!['RECONCILIATION', 'FLUX_EXPLANATION'].includes(g.requirement)) m.set(g.selectionId, Math.max(m.get(g.selectionId) ?? 0, g.amountUsd)); return { selections: m.size, usd: [...m.values()].reduce((t, v) => t + v, 0) }; }
/** evidence that supports an ACCOUNT's balance or movement rather than one transaction */
export const ACCOUNT_LEVEL: EvidenceType[] = ['RECONCILIATION', 'FLUX_EXPLANATION'];
/** a request whose population is larger than this is sampled (key items + systematic), never loaded whole */
export const AUTO_SELECT_ALL_MAX = 60;
const TOL = 0.5;
const sha = (x: unknown) => createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 12).toUpperCase();
const d2 = (v: number) => Math.round(v * 100) / 100;
export const usd = (v: number) => `${v < 0 ? '(' : ''}$${Math.abs(v) >= 1e6 ? `${(Math.abs(v) / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e3 ? `${(Math.abs(v) / 1e3).toFixed(0)}K` : Math.abs(v).toFixed(0)}${v < 0 ? ')' : ''}`;

/* ================================================================================================
   DOCUMENT CONNECTORS — connector-neutral, none connected in this phase (§19–§20)
   ================================================================================================ */
export interface DocumentConnector { id: string; system: string; kinds: EvidenceType[]; status: 'NOT_CONNECTED' | 'CONNECTED'; note: string; retrieve?: (reference: string) => Promise<{ fileName: string; bytes: Buffer }> }
export const DOCUMENT_CONNECTORS: DocumentConnector[] = [
  { id: 'netsuite-attachments', system: 'NetSuite', kinds: ['INVOICE', 'PO', 'APPROVAL', 'RECEIPT'], status: 'NOT_CONNECTED', note: 'NetSuite file-cabinet attachments are not connected; references come from the AP extract.' },
  { id: 'sap-dms', system: 'SAP S/4HANA', kinds: ['INVOICE', 'PO', 'CONTRACT', 'APPROVAL'], status: 'NOT_CONNECTED', note: 'SAP document management is not connected.' },
  { id: 'oracle-attachments', system: 'Oracle ERP Cloud', kinds: ['INVOICE', 'PO', 'APPROVAL'], status: 'NOT_CONNECTED', note: 'Oracle attachments are not connected.' },
  { id: 'jde-media', system: 'JD Edwards', kinds: ['INVOICE', 'PO'], status: 'NOT_CONNECTED', note: 'JD Edwards media objects are not connected, and the source itself is unavailable.' },
  { id: 'procore', system: 'Procore', kinds: ['CONTRACT', 'CHANGE_ORDER', 'RECEIPT'], status: 'NOT_CONNECTED', note: 'Procore project documents are not connected.' },
  { id: 'sharepoint', system: 'SharePoint', kinds: ['WORKPAPER', 'POLICY', 'CONTRACT'], status: 'NOT_CONNECTED', note: 'SharePoint libraries are not connected.' },
  { id: 'onedrive', system: 'OneDrive', kinds: ['WORKPAPER'], status: 'NOT_CONNECTED', note: 'OneDrive is not connected.' },
];
export const connectorFor = (system: string, type: EvidenceType) => DOCUMENT_CONNECTORS.find((c) => c.system === system && c.kinds.includes(type)) ?? DOCUMENT_CONNECTORS.find((c) => c.kinds.includes(type)) ?? null;

/* ================================================================================================
   INTERPRETATION — deterministic words; a model's proposal is accepted only where the words say nothing
   ================================================================================================ */
const EVIDENCE_WORDS: [RegExp, EvidenceType][] = [
  [/\binvoices?\b/, 'INVOICE'], [/\bpos?\b|\bpurchase orders?\b/, 'PO'], [/\bcontracts?\b/, 'CONTRACT'], [/\bchange orders?\b/, 'CHANGE_ORDER'],
  [/\bapprovals?\b|\bapproved\b|\bauthori[sz]ations?\b/, 'APPROVAL'], [/\breceipts?\b|\bgoods received\b/, 'RECEIPT'], [/\bworkpapers?\b/, 'WORKPAPER'],
  [/\breconciliations?\b|\brecs?\b/, 'RECONCILIATION'], [/\bflux\b|\bvariance explanations?\b/, 'FLUX_EXPLANATION'], [/\bpolic(y|ies)\b/, 'POLICY'],
  [/\berp (source|transaction|reference)s?\b|\bsource transactions?\b|\bsource references?\b/, 'SOURCE_TRANSACTION'],
];
export const evidenceIn = (t: string): EvidenceType[] => EVIDENCE_WORDS.filter(([re]) => re.test(t)).map(([, k]) => k);
const OBJECT_WORDS: [RegExp, string[], string][] = [
  [/\bcip\b|\bconstruction in progress\b|\bcapital (additions|expenditure|spend)\b|\bcapex\b|\bfixed asset additions\b/, ['15000'], 'Construction in progress'],
  [/\bpp&e\b|\bproperty,? plant\b|\bfixed assets?\b/, ['16000'], 'Property, plant & equipment'],
  [/\baccounts payable\b|\bap\b/, ['20000'], 'Accounts payable'],
  [/\brevenue\b/, ['40000'], 'Revenue'],
  [/\boperating expenses?\b|\bopex\b/, ['50000', '60000'], 'Operating expenses'],
];
function amountIn(t: string): number | null {
  const m = t.match(/(?:over|above|greater than|more than|at least|exceeding|>=?|>)\s*\$?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|million|b|bn|billion)?\b/i)
    ?? t.match(/(?:under|below|less than)\s*\$?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|million)?\b/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, '')), u = (m[2] ?? '').toLowerCase();
  return n * (u.startsWith('k') || u === 'thousand' ? 1e3 : u === 'm' || u === 'mm' || u === 'million' ? 1e6 : u.startsWith('b') ? 1e9 : 1);
}
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function windowIn(t: string, periods: string[]): { start?: string; end?: string; token: string | null } {
  const fy = t.match(/\bfy\s?'?(\d{2,4})\b/), year = fy ? (fy[1]!.length === 2 ? `20${fy[1]}` : fy[1]!) : null;
  const mons = [...t.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?\s*(20\d{2})?/gi)]
    .map((m) => `${m[2] ?? year ?? periods.at(-1)!.slice(0, 4)}-${String(MON.indexOf(m[1]!.slice(0, 3).toLowerCase()) + 1).padStart(2, '0')}`);
  if (/\bq([1-4])\b/i.test(t)) { const q = Number(t.match(/\bq([1-4])\b/i)![1]), y = year ?? periods.at(-1)!.slice(0, 4); return { start: `${y}-${String(q * 3 - 2).padStart(2, '0')}`, end: `${y}-${String(q * 3).padStart(2, '0')}`, token: `Q${q}` }; }
  if (mons.length >= 2) return { start: mons[0], end: mons.at(-1), token: null };
  if (mons.length === 1) return { start: year ? `${year}-01` : mons[0], end: mons[0], token: null };
  if (year) return { start: `${year}-01`, end: `${year}-12`, token: `FY${year.slice(2)}` };
  return { token: null };
}
/** the words a request says; `proposal` is the model's structured reading (tool arguments) and fills only what the
 *  words leave open. Returns what Korvyn resolved and what it had to default. */
export function interpretRequest(text: string, ctx: { periods: string[]; scopes: { id: string; name: string }[]; workingPeriod: string; projects: string[]; properties: string[] }, proposal: Record<string, string> | null = null): PBCInterpretation {
  const t = ` ${text.toLowerCase()} `, notes: string[] = [], resolved: string[] = [];
  const P = proposal ?? {};
  /* object */
  let accounts: string[] = [], objectName = '';
  for (const [re, a, n] of OBJECT_WORDS) if (re.test(t)) { accounts = a; objectName = n; break; }
  if (!accounts.length && P['account']) { const codes = P['account'].split(/[,\s]+/).filter((x) => /^\d{5}$/.test(x)); if (codes.length) { accounts = codes; objectName = codes.join(', '); resolved.push(`object from the model: ${objectName}`); } }
  if (!accounts.length) { accounts = ['15000']; objectName = 'Construction in progress'; notes.push('No financial object was named; Korvyn read the request as CIP (15000).'); }
  else resolved.push(`object: ${objectName} (${accounts.join(', ')})`);
  /* period — the governed window only; a year that runs past the latest closed month ends there, and says so */
  const w = windowIn(t, ctx.periods);
  let start = w.start ?? P['periodStart'] ?? `${ctx.workingPeriod.slice(0, 4)}-01`, end = w.end ?? P['periodEnd'] ?? ctx.workingPeriod;
  if (!ctx.periods.includes(end)) { const last = ctx.periods.filter((p) => p <= end).at(-1); if (last && last >= start) { notes.push(`${monLabel(end)} has not closed into the governed ledger; the window runs through ${monLabel(last)}.`); end = last; } }
  if (!ctx.periods.includes(start)) start = ctx.periods.find((p) => p >= start) ?? start;
  resolved.push(`period: ${rangeLabel(start, end)}${w.token ? ` (${w.token})` : ''}`);
  /* population type */
  const populationType: PopulationType = /\baddition|\bcapitali[sz]ed\b|\bcapex\b|\bspend\b/.test(t) ? 'ADDITIONS' : /\bdisposal|\bretire|\bsettle|\bplaced in service\b/.test(t) ? 'DISPOSALS' : (P['populationType'] as PopulationType) ?? 'ACTIVITY';
  resolved.push(`population: ${populationType.toLowerCase()}`);
  /* threshold */
  const amt = amountIn(t) ?? (P['minAbsAmount'] ? amountIn(`over ${P['minAbsAmount']}`) : null);
  if (amt !== null) resolved.push(`threshold: over ${usd(amt)}`);
  /* scope: an entity named; a project / property named ("South Valley" is the SV-PH2 programme at SILICON-VALLEY) */
  let scopeId = 'GROUP';
  const ent = ctx.scopes.find((s) => s.id !== 'GROUP' && new RegExp(`\\b${s.id.toLowerCase().replace(/-/g, '[- ]?')}\\b`).test(t));
  if (ent) { scopeId = ent.id; resolved.push(`scope: ${ent.name}`); }
  else if (P['scope'] && ctx.scopes.some((s) => s.id === P['scope'])) { scopeId = P['scope']!; resolved.push(`scope from the model: ${scopeId}`); }
  let project: string | null = null, property: string | null = null;
  if (/\bsouth valley\b|\bsilicon valley\b|\bsv-?ph2\b/.test(t)) { project = ctx.projects.find((p) => p.startsWith('SV')) ?? null; property = null; resolved.push(`project: ${project} (South Valley)`); }
  for (const p of ctx.projects) if (new RegExp(`\\b${p.toLowerCase()}\\b`).test(t)) { project = p; resolved.push(`project: ${p}`); }
  if (scopeId === 'GROUP' && !ent) notes.push('No scope was named; the request runs over Corporate Consolidated.');
  /* evidence */
  let requiredEvidence = evidenceIn(t);
  if (!requiredEvidence.length && P['evidence']) requiredEvidence = evidenceIn(` ${P['evidence'].toLowerCase()} `);
  if (/\bsupport\b/.test(t) && !requiredEvidence.length) { requiredEvidence = ['INVOICE', 'PO', 'APPROVAL']; notes.push('“Support” was read as invoice, purchase order and approval.'); }
  if (!requiredEvidence.includes('SOURCE_TRANSACTION')) requiredEvidence.push('SOURCE_TRANSACTION');
  resolved.push(`evidence: ${requiredEvidence.map((e) => EVIDENCE_LABEL[e].toLowerCase()).join(', ')}`);
  const tok = periodToken(start, end);
  const title = `${tok} ${objectName}${populationType === 'ADDITIONS' ? ' additions' : populationType === 'DISPOSALS' ? ' settlements' : ' activity'}${amt ? ` over ${usd(amt)}` : ''}`;
  return { requirement: { title, periodStart: start, periodEnd: end, scopeId, accounts, objectName, populationType, minAbsUsd: amt, project, property, vendor: null, requiredEvidence }, from: proposal ? 'model+words' : 'words', modelProposal: proposal, resolved, notes };
}

/* ================================================================================================
   UPLOAD INTAKE — CSV / TSV / XLSX / text; a PDF is REQUIRES_REVIEW (no parser in this phase)
   ================================================================================================ */
const COL: [RegExp, keyof SelectionIdentifiers | 'no' | 'text'][] = [
  [/^(sel(ection)?|sample|item)\s*(#|no\.?|number)?$|^#$/i, 'no'], [/^(journal|je|entry)\s*(id|#|no\.?|number)?$/i, 'journalId'], [/^(transaction|txn|line)\s*(id|#|ref(erence)?)?$/i, 'transactionId'],
  [/^invoice\s*(id|#|no\.?|number|ref(erence)?)?$/i, 'invoiceId'], [/^(gl\s*)?account(\s*(#|no\.?|number|code))?$/i, 'account'], [/^entity|company$/i, 'entity'], [/^vendor|supplier$/i, 'vendor'],
  [/^amount(\s*\(?usd\)?)?$|^value$/i, 'amount'], [/^(posting\s*)?date$|^gl date$/i, 'date'], [/^description|memo$/i, 'description'],
];
export interface ParsedUpload { title: string; pbcNumber: string | null; requestText: string; rows: { no: number; original: string; identifiers: SelectionIdentifiers }[]; intake: 'PARSED' | 'REQUIRES_REVIEW'; notes: string[] }
function parseTable(lines: string[][]): ParsedUpload {
  const notes: string[] = [];
  const meta: string[] = [];
  let header = -1;
  for (let i = 0; i < lines.length; i++) { const cells = lines[i]!.map((c) => c.trim()); if (cells.filter((c) => COL.some(([re]) => re.test(c))).length >= 2) { header = i; break; } meta.push(cells.filter(Boolean).join(' ')); }
  const text = meta.join(' ').trim();
  const pbcRaw = text.match(/\bpbc\s*#?\s*([A-Z0-9-]+)/i)?.[1] ?? null;
  /* "PBC #27" keeps the auditor's own numbering */
  const pbcNumber = pbcRaw ? (/^\d+$/.test(pbcRaw) ? `PBC #${pbcRaw}` : pbcRaw.toUpperCase()) : null;
  const title = (text.match(/pbc\s*#?\s*[A-Z0-9-]+\s*[—–:-]\s*([^.]+?)(?:\s{2,}|request:|$)/i)?.[1] ?? '').trim();
  if (header < 0) return { title, pbcNumber, requestText: text, rows: [], intake: 'REQUIRES_REVIEW', notes: ['No selection table was found (no header row naming journal, invoice, amount or similar columns).'] };
  const cols = lines[header]!.map((c) => COL.find(([re]) => re.test(c.trim()))?.[1] ?? null);
  const rows: ParsedUpload['rows'] = [];
  for (const r of lines.slice(header + 1)) {
    if (r.every((c) => !c.trim())) continue;
    const id: SelectionIdentifiers = {}; let no = rows.length + 1;
    r.forEach((c, i) => {
      const k = cols[i], v = c.trim(); if (!k || !v) return;
      if (k === 'no') { const n = Number(v.replace(/[^\d]/g, '')); if (n) no = n; }
      else if (k === 'amount') { const n = Number(v.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')); if (Number.isFinite(n)) id.amount = n; }
      else if (k !== 'text') (id as Record<string, string>)[k] = v;
    });
    rows.push({ no, original: r.map((c) => c.trim()).filter(Boolean).join(' | '), identifiers: id });
  }
  if (!rows.length) notes.push('The selection table has no rows.');
  const unusable = rows.filter((x) => !x.identifiers.transactionId && !x.identifiers.journalId && !x.identifiers.invoiceId && x.identifiers.amount === undefined).length;
  if (unusable) notes.push(`${unusable} row(s) carry no journal, invoice, transaction or amount — they need review.`);
  return { title, pbcNumber, requestText: text, rows, intake: rows.length && unusable < rows.length ? 'PARSED' : 'REQUIRES_REVIEW', notes };
}
function splitDelimited(text: string): string[][] {
  const delim = text.includes('\t') ? '\t' : ',';
  return text.split(/\r?\n/).map((line) => { const out: string[] = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]!; if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === delim && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; });
}
export async function parseUpload(fileName: string, content: Buffer): Promise<ParsedUpload> {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return parseTable(splitDelimited(content.toString('utf8')));
  if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(content as unknown as ArrayBuffer); } catch (e) { return { title: '', pbcNumber: null, requestText: '', rows: [], intake: 'REQUIRES_REVIEW', notes: [`The workbook could not be read: ${(e as Error).message}`] }; }
    const ws = wb.worksheets[0];
    if (!ws) return { title: '', pbcNumber: null, requestText: '', rows: [], intake: 'REQUIRES_REVIEW', notes: ['The workbook has no worksheet.'] };
    const lines: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => { const vals = (row.values as unknown[]).slice(1).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v && typeof v === 'object' && 'result' in (v as object) ? String((v as { result: unknown }).result) : v === null || v === undefined ? '' : String(v))); lines.push(vals); });
    return parseTable(lines);
  }
  /* no PDF / image parser in this phase: the file is recorded and flagged, never guessed at */
  return { title: fileName.replace(/\.[^.]+$/, ''), pbcNumber: null, requestText: '', rows: [], intake: 'REQUIRES_REVIEW', notes: [`${ext.toUpperCase() || 'This'} files are not parsed in this phase (no OCR / PDF extraction). The request is recorded and needs a person to enter its selections.`] };
}

/* ================================================================================================
   THE SERVICE
   ================================================================================================ */
export interface SelectionView {
  id: string; no: number; source: 'AUTO' | 'AUDITOR'; method: string; original: string; identifiers: SelectionIdentifiers;
  status: MatchStatus; reason: string; resolvedBy: string | null; line: GLine | null; candidates: { key: string; amountUsd: number; entity: string; vendor: string | null; date: string; description: string }[];
  evidence: EvidenceMatch[]; coverage: Coverage | null; trace: string[];
}
export interface GapView extends SupportGapBody { id: string; status: GapStatus; version: number; live: boolean }
export interface PBCView {
  id: string; version: number; body: PBCRequestBody; requirement: PBCRequirement | null;
  population: { id: string; filter: PopulationFilter; rowCount: number; totalUsd: number; contentHash: string; dataVersion: string; mappingVersion: string; generatedAt: string; sourceSystems: string[]; belowThreshold: { count: number; totalUsd: number } } | null;
  tie: PBCTieOut | null; selections: SelectionView[]; gaps: GapView[];
  coverage: { matched: number; full: number; partial: number; unsupported: number; fullUsd: number; partialUsd: number; unsupportedUsd: number; matchedUsd: number; pct: number | null; countPct: number | null };
  matching: Record<MatchStatus, number>;
  reconciliations: { id: string; name: string; entity: string; available: boolean; tieStatus: string; glBalanceUsd: number | null; differenceUsd: number | null; status: string; preparer: string; reviewer: string; supportComplete: boolean; comments: number; balanceRecord: string | null; reason: string | null }[];
  flux: { id: string; account: string; name: string; period: string; changeUsd: number; material: boolean; status: string; explanationId: string | null; explanationVersion: number | null; text: string | null }[];
  status: PBCStatus; statusReasons: string[]; stale: boolean; staleReasons: string[]; pinsLive: PBCPins | null; warnings: string[]; duplicates: string[];
}
export interface PBCTieOut {
  status: TieStatus; populationUsd: number; belowThresholdUsd: number; grossAdditionsUsd: number; otherMovementUsd: number; netActivityUsd: number;
  openingUsd: number; closingUsd: number; tbMovementUsd: number; difference: number;
  bridge: { sourceUsd: number; fxUsd: number; eliminationsUsd: number; adjustmentsUsd: number; finalUsd: number; governedUsd: number; differenceUsd: number; sourceStatus: TieStatus; systems: { system: string; status: string }[] };
  reasons: string[];
}

export class AuditService {
  constructor(private readonly data: FinancialDataService, private readonly gl: GovernedLedger, private readonly controls: ControlService, private readonly tie: TieOutService) {}
  ctx() { return { periods: this.gl.periods(), scopes: this.data.scopes().map((s) => ({ id: s.id, name: s.name })), workingPeriod: this.data.workingPeriod(), projects: this.gl.dimensionValues('project'), properties: this.gl.dimensionValues('property') }; }
  /** a 3C seeded request predates the 5A fields; it reads with their empty defaults (never rewritten on read) */
  private norm<T extends Stamped<PBCRequestBody> | null>(r: T): T {
    if (!r) return r;
    const x = r as Stamped<PBCRequestBody>;
    return { ...x, pbcNumber: x.pbcNumber ?? x.id, source: x.source ?? 'SEED', raw: x.raw ?? '', fileName: x.fileName ?? null, intake: x.intake ?? 'REQUIRES_REVIEW', intakeNotes: x.intakeNotes ?? [], interpretation: x.interpretation ?? null,
      selectionsMode: x.selectionsMode ?? 'POPULATION', pins: x.pins ?? null, packageArtifactId: x.packageArtifactId ?? null, lifecycle: x.lifecycle ?? 'OPEN', delivered: x.delivered ?? null, history: x.history ?? [], lastChange: x.lastChange ?? 'Seeded', createdByName: x.createdByName ?? x.owner, investigationId: x.investigationId ?? null } as T;
  }
  get(id: string) { return this.norm(WORK.repos.records.get<PBCRequestBody>(KIND, id)); }
  list() { return WORK.repos.records.list<PBCRequestBody>(KIND).map((r) => this.norm(r)); }
  selections(requestId: string) { return WORK.repos.records.list<AuditSelectionBody>(SEL, { target: requestId }).sort((a, b) => a.no - b.no); }
  private gapRecords(requestId: string) { return WORK.repos.records.list<SupportGapBody>(GAP, { target: requestId }); }

  /* ---- create ----------------------------------------------------------------------------------- */
  create(actor: Actor, o: { interpretation: PBCInterpretation | null; source: IntakeSource; raw: string; fileName?: string | null; pbcNumber?: string | null; title?: string | null; intake?: 'PARSED' | 'REQUIRES_REVIEW'; intakeNotes?: string[]; auditorRows?: ParsedUpload['rows']; channel: 'SLOANE' | 'UI'; traceId?: string | null; investigationId?: string | null }) {
    const n = this.list().filter((r) => /^PBC-5A-/.test(r.pbcNumber ?? '')).length + 1;
    const req = o.interpretation?.requirement ?? null;
    const body: PBCRequestBody = {
      title: o.title || req?.title || o.fileName || 'Untitled PBC request', populationId: null, owner: actor.name, requestedBy: o.source === 'UPLOAD' ? 'External auditor' : actor.name, due: '',
      pbcNumber: o.pbcNumber ?? `PBC-5A-${String(n).padStart(3, '0')}`, source: o.source, raw: o.raw.slice(0, 20_000), fileName: o.fileName ?? null,
      intake: o.intake ?? (req ? 'PARSED' : 'REQUIRES_REVIEW'), intakeNotes: o.intakeNotes ?? [], interpretation: o.interpretation,
      selectionsMode: o.auditorRows?.length ? 'AUDITOR' : 'POPULATION', pins: null, packageArtifactId: null, lifecycle: 'OPEN', delivered: null, history: [],
      lastChange: 'Created', createdByName: actor.name, investigationId: o.investigationId ?? null,
    };
    const rec = WORK.repos.database.tx(() => {
      const r = WORK.repos.records.insert<PBCRequestBody>(KIND, body, actor.id, { prefix: 'PBC', status: 'OPEN', period: req?.periodEnd ?? null, scope: req?.scopeId ?? null, investigationId: o.investigationId ?? null });
      this.audit(actor, o.channel, 'PBC_REQUEST_CREATED', r, { source: o.source, pbcNumber: body.pbcNumber, title: body.title, requirement: req, intake: body.intake }, o.traceId);
      if (o.auditorRows?.length) o.auditorRows.forEach((x) => WORK.repos.records.insert<AuditSelectionBody>(SEL, { requestId: r.id, no: x.no, source: 'AUDITOR', method: 'Auditor selection', original: x.original, identifiers: x.identifiers, resolution: null }, actor.id, { prefix: 'SEL', target: r.id, status: 'OPEN' }));
      return r;
    });
    if (req && body.selectionsMode === 'POPULATION') this.autoSelect(actor, rec.id);
    return this.snapshot(actor, rec.id, 'Created', o.channel, o.traceId ?? null);
  }
  /** a request's population selections: every item when the population is small, else key items plus a systematic sample */
  private autoSelect(actor: Actor, id: string) {
    const r = this.get(id)!;
    const pop = this.population(r.interpretation!.requirement, 'ALL');
    const rows = pop.rows;
    const all = rows.length <= AUTO_SELECT_ALL_MAX;
    const key = all ? rows : rows.slice(0, 25);
    const rest = all ? [] : rows.slice(25), step = Math.max(1, Math.floor(rest.length / 15));
    const chosen = [...key.map((l) => ({ l, how: all ? 'All items in the population' : 'Key item (largest)' })), ...rest.filter((_, i) => i % step === 0).slice(0, 15).map((l) => ({ l, how: `Systematic 1-in-${step}` }))];
    WORK.repos.database.tx(() => {
      for (const s of this.selections(id)) if (s.source === 'AUTO') WORK.repos.records.update<AuditSelectionBody>(SEL, s.id, s.version, actor.id, (x) => x, { status: 'REMOVED' });
      chosen.forEach(({ l, how }, i) => WORK.repos.records.insert<AuditSelectionBody>(SEL, { requestId: id, no: i + 1, source: 'AUTO', method: how, original: `${l.key} · ${l.entity} · ${l.postingDate} · ${usd(l.usd)}`, identifiers: { transactionId: l.key, amount: d2(l.usd), entity: l.entity, date: l.postingDate }, resolution: null }, actor.id, { prefix: 'SEL', target: id, status: 'OPEN' }));
    });
  }

  /* ---- population ------------------------------------------------------------------------------- */
  populationFilter(q: PBCRequirement, withThreshold = true): PopulationFilter {
    const scope = this.data.scope(q.scopeId);
    return { periodStart: q.periodStart, periodEnd: q.periodEnd, accounts: q.accounts, ...(scope && scope.kind !== 'GROUP' ? { entities: scope.entityIds } : q.entities?.length ? { entities: q.entities } : {}),
      ...(q.project ? { project: q.project } : {}), ...(q.property ? { property: q.property } : {}), ...(q.vendor ? { vendor: q.vendor } : {}), ...(withThreshold && q.minAbsUsd ? { minAbsUsd: q.minAbsUsd } : {}) };
  }
  /** ADDITIONS are debits (capital posted in); DISPOSALS credits (settled out); ACTIVITY every line */
  private signOk(q: PBCRequirement) { return (l: GLine) => q.populationType === 'ADDITIONS' ? l.local > 0 && l.account !== '20100' : q.populationType === 'DISPOSALS' ? l.local < 0 : true; }
  population(q: PBCRequirement, vis: Set<string> | 'ALL') {
    const def = this.gl.definePopulation(this.populationFilter(q), 'amount_desc', q.title);
    const all = this.gl.query(def, vis, { limit: 1 }).all;
    const rows = all.filter(this.signOk(q));
    const h = createHash('sha1'); for (const l of rows) h.update(`${l.key}:${l.usd.toFixed(2)}|`);
    const below = this.gl.lines.filter(this.gl.match(this.populationFilter(q, false), vis)).filter(this.signOk(q)).filter((l) => q.minAbsUsd && Math.abs(l.usd) < q.minAbsUsd);
    const systems = [...new Set(rows.map((l) => SOURCE_HEALTH[l.connector]?.system ?? l.connector))];
    return { def, rows, contentHash: h.digest('hex').slice(0, 16).toUpperCase(), totalUsd: d2(rows.reduce((s, l) => s + l.usd, 0)), below: { count: below.length, totalUsd: d2(below.reduce((s, l) => s + l.usd, 0)) }, systems };
  }

  /* ---- tie-out ------------------------------------------------------------------------------------ */
  tieOut(q: PBCRequirement, pop: ReturnType<AuditService['population']>, vis: Set<string> | 'ALL'): PBCTieOut {
    const f = this.populationFilter(q, false);
    const window = this.gl.lines.filter(this.gl.match(f, vis));
    const signed = window.filter(this.signOk(q));
    const gross = signed.reduce((s, l) => s + l.usd, 0), net = window.reduce((s, l) => s + l.usd, 0);
    const prior = this.gl.priorPeriod(q.periodStart);
    const ents = f.entities;
    /* balances at the closing rate, activity at the average rate: the difference between the two is translation, stated */
    const opening = prior ? this.gl.balanceUsd(q.accounts, prior, vis, ents) : 0;
    const closing = this.gl.balanceUsd(q.accounts, q.periodEnd, vis, ents);
    const narrowed = !!(q.project || q.property || q.vendor);
    const reasons: string[] = [];
    const t = this.tie.tieOut(q.scopeId, q.periodEnd);
    const accts = new Set(this.gl.expandAccounts(q.accounts));
    const rows = t.accounts.filter((a) => accts.has(a.account) || q.accounts.includes(a.account));
    const sum = (k: 'source' | 'fx' | 'elim' | 'adj' | 'final' | 'governed' | 'difference') => d2(rows.reduce((s, a) => s + a[k], 0));
    const bridge = { sourceUsd: sum('source'), fxUsd: sum('fx'), eliminationsUsd: sum('elim'), adjustmentsUsd: sum('adj'), finalUsd: sum('final'), governedUsd: sum('governed'), differenceUsd: sum('difference'), sourceStatus: t.status, systems: t.sources.map((s) => ({ system: s.system, status: s.result })) };
    /* the population is drawn from the same lines the activity sums, so population + below-threshold = gross additions by
       construction; what can fail is the account-level bridge to the ERP and the TB */
    const popDiff = d2(pop.totalUsd + pop.below.totalUsd - gross);
    let status: TieStatus = t.status;
    if (Math.abs(popDiff) > TOL) { status = 'NOT_TIED'; reasons.push(`The population and the below-threshold items do not sum to the gross ${q.populationType.toLowerCase()} (difference ${usd(popDiff)}).`); }
    if (Math.abs(bridge.differenceUsd) > TOL) { status = 'NOT_TIED'; reasons.push(`The ERP-to-governed bridge for ${q.accounts.join(', ')} does not tie (difference ${usd(bridge.differenceUsd)}) — ${t.unsyncedPostings} unsynced source posting(s).`); }
    if (t.status === 'PARTIALLY_VALIDATED') reasons.push(`Source bridge partially validated: ${t.sources.filter((s) => s.result !== 'TIED').map((s) => `${s.system} ${s.result.toLowerCase().replace(/_/g, ' ')}`).join('; ')}.`);
    if (narrowed) reasons.push('The request is narrowed by project / property / vendor, so the TB balance covers more than the population; the population ties to its own activity, and the TB bridge is stated for the accounts as a whole.');
    return { status, populationUsd: pop.totalUsd, belowThresholdUsd: pop.below.totalUsd, grossAdditionsUsd: d2(gross), otherMovementUsd: d2(net - gross), netActivityUsd: d2(net), openingUsd: d2(opening), closingUsd: d2(closing), tbMovementUsd: d2(closing - opening), difference: popDiff, bridge, reasons };
  }

  /* ---- matching ----------------------------------------------------------------------------------- */
  private idx: { v: string; byKey: Map<string, GLine>; byJournal: Map<string, GLine[]>; byInvoice: Map<string, GLine[]> } | null = null;
  private index() {
    const v = this.gl.dataVersion();
    if (this.idx?.v === v) return this.idx;
    const byKey = new Map<string, GLine>(), byJournal = new Map<string, GLine[]>(), byInvoice = new Map<string, GLine[]>();
    for (const l of this.gl.lines) {
      byKey.set(l.key.toUpperCase(), l);
      if (!byJournal.has(l.journalId.toUpperCase())) byJournal.set(l.journalId.toUpperCase(), []); byJournal.get(l.journalId.toUpperCase())!.push(l);
      if (l.invoiceRef && l.account !== '20100') { const k = l.invoiceRef.toUpperCase(); if (!byInvoice.has(k)) byInvoice.set(k, []); byInvoice.get(k)!.push(l); }
    }
    return (this.idx = { v, byKey, byJournal, byInvoice });
  }
  match(s: { identifiers: SelectionIdentifiers; resolution: AuditSelectionBody['resolution'] }, vis: Set<string> | 'ALL'): Pick<SelectionView, 'status' | 'reason' | 'line' | 'candidates' | 'resolvedBy'> {
    const I = this.index(), id = s.identifiers;
    const seen = (l: GLine) => vis === 'ALL' || vis.has(l.entity);
    const cand = (ls: GLine[]) => ls.map((l) => ({ key: l.key, amountUsd: d2(l.usd), entity: l.entity, vendor: l.vendor, date: l.postingDate, description: l.description }));
    if (s.resolution) { const l = I.byKey.get(s.resolution.chosenKey.toUpperCase()); if (l && seen(l)) return { status: 'MATCHED', reason: `Chosen by ${s.resolution.by}${s.resolution.note ? ` — ${s.resolution.note}` : ''}`, line: l, candidates: [], resolvedBy: s.resolution.by }; }
    const amountOk = (l: GLine) => id.amount === undefined || Math.abs(Math.abs(l.usd) - Math.abs(id.amount)) <= Math.max(1, Math.abs(id.amount) * 0.005) || Math.abs(Math.abs(l.local) - Math.abs(id.amount)) <= Math.max(1, Math.abs(id.amount) * 0.005);
    const attrs = (l: GLine) => [!id.entity || l.entity.toUpperCase() === id.entity.toUpperCase() || l.entityName.toLowerCase() === id.entity.toLowerCase(), !id.vendor || (l.vendor ?? '').toLowerCase().startsWith(id.vendor.toLowerCase().split(' ')[0]!), !id.date || l.postingDate === id.date.slice(0, 10), !id.account || l.account === id.account];
    const decide = (ls: GLine[], how: string) => {
      const vis2 = ls.filter(seen);
      if (!vis2.length) return null;
      const exact = vis2.filter((l) => amountOk(l) && attrs(l).every(Boolean));
      if (exact.length === 1) return { status: 'MATCHED' as const, reason: `Matched by ${how}${id.amount !== undefined ? ' and amount' : ''}`, line: exact[0]!, candidates: [], resolvedBy: null };
      if (exact.length > 1) return { status: 'MULTIPLE_MATCHES' as const, reason: `${exact.length} governed lines match by ${how}; a person must choose`, line: null, candidates: cand(exact), resolvedBy: null };
      return { status: 'PARTIAL_MATCH' as const, reason: `Found by ${how}, but ${[!vis2.some(amountOk) ? 'the amount differs' : '', vis2.some((l) => !attrs(l).every(Boolean)) ? 'entity, vendor, date or account differs' : ''].filter(Boolean).join(' and ')}`, line: null, candidates: cand(vis2), resolvedBy: null };
    };
    if (id.transactionId) { const l = I.byKey.get(id.transactionId.toUpperCase()); if (l) { const r = decide([l], 'transaction id'); if (r) return r; } }
    if (id.journalId) { const ls = (I.byJournal.get(id.journalId.toUpperCase()) ?? []).filter((l) => l.account !== '20100' || id.account === '20100'); if (ls.length) { const r = decide(ls, 'journal'); if (r) return r; } }
    if (id.invoiceId) { const ls = I.byInvoice.get(id.invoiceId.toUpperCase()) ?? []; if (ls.length) { const r = decide(ls, 'invoice'); if (r) return r; } }
    if (id.amount !== undefined) {
      const ls = this.gl.lines.filter((l) => seen(l) && l.account !== '20100' && amountOk(l) && attrs(l).every(Boolean));
      if (ls.length === 1) { const n = attrs(ls[0]!).filter((x, i) => x && [id.entity, id.vendor, id.date, id.account][i]).length; return n >= 1 ? { status: 'MATCHED', reason: 'Matched by amount and attributes', line: ls[0]!, candidates: [], resolvedBy: null } : { status: 'PARTIAL_MATCH', reason: 'Only the amount matches; no other identifier confirms it', line: null, candidates: cand(ls), resolvedBy: null }; }
      if (ls.length > 1) return { status: 'MULTIPLE_MATCHES', reason: `${ls.length} governed lines carry this amount; a person must choose`, line: null, candidates: cand(ls.slice(0, 10)), resolvedBy: null };
    }
    /* not in the governed ledger: if the entity's source is unavailable, the ledger may simply not have it yet */
    const ent = id.entity ? this.gl.entities().find((e) => e.id.toUpperCase() === id.entity!.toUpperCase() || e.name.toLowerCase() === id.entity!.toLowerCase()) : null;
    if (ent && SOURCE_HEALTH[ent.connector]?.status === 'UNAVAILABLE') return { status: 'SOURCE_UNAVAILABLE', reason: `${SOURCE_HEALTH[ent.connector]!.system} (${ent.id}) is unavailable; the governed ledger holds only its last extract, so this item cannot be confirmed`, line: null, candidates: [], resolvedBy: null };
    return { status: 'NOT_FOUND', reason: 'No governed transaction you can see matches these identifiers', line: null, candidates: [], resolvedBy: null };
  }

  /* ---- evidence (the EvidenceGraph: AP-extract references on the line + WORK relationships) ------------ */
  evidence(l: GLine, types: EvidenceType[], ctx: { vis: Set<string> | 'ALL'; poVendors: Map<string, Set<string>>; periodEnd?: string }): EvidenceMatch[] {
    const sys = SOURCE_HEALTH[l.connector]?.system ?? l.connector, health = SOURCE_HEALTH[l.connector]?.status ?? 'UNAVAILABLE';
    const rels = WORK.relsTo(`txn:${l.key}`);
    const relOf = (t: EvidenceType) => rels.find((r) => r.kind.toUpperCase() === t || r.kind.toUpperCase().replace(/ /g, '_') === t);
    const denied = !(ctx.vis === 'ALL' || ctx.vis.has(l.entity));
    const doc = (ref: string | null): DocumentAvailability => denied ? 'ACCESS_DENIED' : !ref ? 'MISSING' : health === 'UNAVAILABLE' ? 'EXTERNAL_RETRIEVAL_REQUIRED' : 'REFERENCE_AVAILABLE';
    const out: EvidenceMatch[] = [];
    const push = (type: EvidenceType, status: EvidenceStatus, reference: string | null, detail: string, evidenceId: string | null = null) =>
      out.push({ type, status, reference, document: status === 'NOT_REQUIRED' ? (reference ? doc(reference) : 'MISSING') : status === 'MISSING' ? 'MISSING' : doc(reference), sourceSystem: sys, detail, trace: `txn:${l.key}`, evidenceId });
    for (const t of types) {
      const rel = relOf(t);
      if (rel && t !== 'RECONCILIATION' && t !== 'FLUX_EXPLANATION') { push(t, 'AVAILABLE', rel.from, `Attached by reference (${rel.via}, ${rel.at.slice(0, 10)})`, rel.id); continue; }
      if (t === 'INVOICE') { l.invoiceRef ? push(t, 'AVAILABLE', l.invoiceRef, 'Invoice reference from the AP extract') : push(t, 'MISSING', null, 'No invoice reference on the bill'); continue; }
      if (t === 'PO') {
        if (!l.poRef) { l.project ? push(t, 'MISSING', null, 'The line carries a project but no PO reference') : push(t, 'NOT_REQUIRED', null, 'No project: a PO is not required by policy'); continue; }
        const vs = ctx.poVendors.get(l.poRef);
        vs && vs.size > 1 ? push(t, 'AMBIGUOUS', l.poRef, `${l.poRef} is also referenced by ${[...vs].filter((v) => v !== l.vendor).join(', ')} among the selections — the PO cannot be tied to one vendor`) : push(t, 'AVAILABLE', l.poRef, 'PO reference from the AP extract');
        continue;
      }
      if (t === 'CONTRACT') { l.contractRef ? push(t, 'AVAILABLE', l.contractRef, 'Contract reference (vendor × project)') : push(t, l.project ? 'MISSING' : 'NOT_REQUIRED', null, l.project ? 'No contract reference' : 'No project: no contract expected'); continue; }
      if (t === 'APPROVAL') { !l.approvalRequired ? push(t, 'NOT_REQUIRED', l.approvalRef, 'Below the $250K approval policy') : l.approvalRef ? push(t, 'AVAILABLE', l.approvalRef, 'Approval reference (policy: bills of $250K and over)') : push(t, 'MISSING', null, 'Approval required by policy ($250K and over) and not referenced'); continue; }
      if (t === 'SOURCE_TRANSACTION') { const r = this.gl.sourceRef(l); health === 'UNAVAILABLE' ? push(t, 'UNAVAILABLE', r.transactionId || null, `${sys} is unavailable; the reference is from the last extract only`) : health === 'STALE' ? push(t, 'PARTIAL', r.transactionId || null, `${sys} extract is stale`) : r.transactionId ? push(t, 'AVAILABLE', r.transactionId, `${sys} ${r.transactionType} ${r.transactionId} line ${r.lineId}`) : push(t, 'MISSING', null, 'No ERP source reference'); continue; }
      if (t === 'RECONCILIATION') {
        const def = this.controls.recDef(`REC-${l.entity}-${l.group}`);
        if (!def) { push(t, 'UNAVAILABLE', null, `No server-modelled reconciliation for ${l.group} at ${l.entity}`); continue; }
        const at = ctx.periodEnd ?? l.period, r = this.controls.reconcile(def, at), b = this.controls.reconBalance(def, at);
        const ok = r.tieStatus === 'TIED' && r.workflow.status === 'APPROVED' && r.supportComplete;
        push(t, ok ? 'AVAILABLE' : 'PARTIAL', b.available ? `${b.id} v${b.version}` : def.id, ok ? `${def.name}: tied and approved` : `${def.name}: ${[r.tieStatus !== 'TIED' ? r.tieStatus.replace(/_/g, ' ').toLowerCase() : '', r.workflow.status !== 'APPROVED' ? r.workflow.status.replace(/_/g, ' ').toLowerCase() : '', !r.supportComplete ? 'support incomplete' : ''].filter(Boolean).join(', ')}`);
        continue;
      }
      if (t === 'FLUX_EXPLANATION') {
        const f = this.controls.fluxItems(l.period, 'ALL').find((x) => x.account === l.group);
        if (!f || !f.material) { push(t, 'NOT_REQUIRED', f?.explanation ? `${f.explanation.id} v${f.explanation.version}` : null, `${l.group} movement in ${monLabel(l.period)} is below the Flux materiality threshold`); continue; }
        f.explanation && f.status === 'APPROVED' ? push(t, 'AVAILABLE', `${f.explanation.id} v${f.explanation.version}`, 'Approved Flux explanation') : f.explanation ? push(t, 'PARTIAL', `${f.explanation.id} v${f.explanation.version}`, `Flux explanation ${f.status.toLowerCase()}`) : push(t, 'MISSING', null, `Material ${l.group} movement in ${monLabel(l.period)} has no explanation`);
        continue;
      }
      push(t, 'MISSING', null, `No ${EVIDENCE_LABEL[t].toLowerCase()} is related to this transaction`);
    }
    return out;
  }
  /** a SELECTION's coverage is its own support: invoice, PO, approval, contract, source reference. A reconciliation or
   *  a Flux explanation supports the ACCOUNT, and is a request-level gap (one per reconciliation / Flux line) instead. */
  static coverageOf(ev: EvidenceMatch[]): Coverage {
    const req = ev.filter((e) => e.status !== 'NOT_REQUIRED' && !ACCOUNT_LEVEL.includes(e.type));
    if (req.every((e) => e.status === 'AVAILABLE')) return 'FULL';
    const inv = ev.find((e) => e.type === 'INVOICE');
    if ((inv && inv.status === 'MISSING') || !req.some((e) => e.status === 'AVAILABLE')) return 'UNSUPPORTED';
    return 'PARTIAL';
  }

  /* ---- the whole request, derived ----------------------------------------------------------------- */
  evaluate(id: string, vis: Set<string> | 'ALL', o: { selections?: 'ALL' | 'COMPLETED' | 'OPEN' } = {}): PBCView | null {
    const r = this.get(id);
    if (!r) return null;
    const q = r.interpretation?.requirement ?? null;
    const pop = q ? this.population(q, vis) : null;
    const tie = q && pop ? this.tieOut(q, pop, vis) : null;
    const sels = this.selections(id).filter((s) => s.status !== 'REMOVED');
    const types = q?.requiredEvidence ?? ['INVOICE', 'PO', 'APPROVAL', 'SOURCE_TRANSACTION'];
    const matched = sels.map((s) => ({ s, m: this.match(s, vis) }));
    /* a PO is ambiguous when two selections of different vendors cite it */
    const poVendors = new Map<string, Set<string>>();
    for (const { m } of matched) if (m.line?.poRef && m.line.vendor) { if (!poVendors.has(m.line.poRef)) poVendors.set(m.line.poRef, new Set()); poVendors.get(m.line.poRef)!.add(m.line.vendor); }
    let views: SelectionView[] = matched.map(({ s, m }) => {
      const ev = m.line ? this.evidence(m.line, types, { vis, poVendors, ...(q ? { periodEnd: q.periodEnd } : {}) }) : [];
      return { id: s.id, no: s.no, source: s.source, method: s.method, original: s.original, identifiers: s.identifiers, ...m, evidence: ev, coverage: m.line ? AuditService.coverageOf(ev) : null,
        trace: m.line ? [`selection:${s.id}`, `txn:${m.line.key}`, `journal:${m.line.journalId}`, `source:${SOURCE_HEALTH[m.line.connector]?.instance ?? m.line.connector}:${m.line.externalId}`, ...ev.filter((e) => e.evidenceId).map((e) => `evidence:${e.evidenceId}`)] : [`selection:${s.id}`] };
    });
    const allViews = views;
    /* two selections that resolve to ONE transaction would test it twice: stated, never silently merged */
    const byKey = new Map<string, number[]>(); for (const x of allViews) if (x.line) byKey.set(x.line.key, [...(byKey.get(x.line.key) ?? []), x.no]);
    const duplicates = [...byKey].filter(([, n]) => n.length > 1).map(([k, n]) => `Selections ${n.join(' and ')} are the same governed transaction ${k} — it would be tested twice.`);
    if (o.selections === 'COMPLETED') views = views.filter((v) => v.coverage === 'FULL');
    if (o.selections === 'OPEN') views = views.filter((v) => v.coverage !== 'FULL');
    const cov = { matched: 0, full: 0, partial: 0, unsupported: 0, fullUsd: 0, partialUsd: 0, unsupportedUsd: 0, matchedUsd: 0, pct: null as number | null, countPct: null as number | null };
    for (const v of views) if (v.line) { const a = Math.abs(v.line.usd); cov.matched++; cov.matchedUsd += a; if (v.coverage === 'FULL') { cov.full++; cov.fullUsd += a; } else if (v.coverage === 'PARTIAL') { cov.partial++; cov.partialUsd += a; } else { cov.unsupported++; cov.unsupportedUsd += a; } }
    if (cov.matchedUsd > 0) { cov.pct = cov.fullUsd / cov.matchedUsd; cov.countPct = cov.full / cov.matched; }
    const matching = { MATCHED: 0, MULTIPLE_MATCHES: 0, PARTIAL_MATCH: 0, NOT_FOUND: 0, SOURCE_UNAVAILABLE: 0 } as Record<MatchStatus, number>;
    views.forEach((v) => matching[v.status]++);
    /* gaps: what the evidence says now, merged with what a person decided */
    const stored = new Map(this.gapRecords(id).map((g) => [g.gapKey, g]));
    const liveGaps = this.liveGaps(r, allViews).filter((g) => views.some((v) => v.id === g.selectionId) || ACCOUNT_LEVEL.includes(g.requirement as EvidenceType));
    const gaps: GapView[] = liveGaps.map((g) => { const s = stored.get(g.gapKey); return { ...g, id: s?.id ?? `GAP-${sha(`${id}:${g.gapKey}`)}`, status: (s?.status === 'WAIVED' || s?.status === 'RESOLVED' ? s.status : 'OPEN') as GapStatus, version: s?.version ?? 0, live: true, resolution: s?.resolution ?? null, note: s && (s.status === 'WAIVED' || s.status === 'RESOLVED') ? s.note : g.note, resolvedBy: s?.resolvedBy ?? null, resolvedAt: s?.resolvedAt ?? null, owner: s?.owner ?? g.owner }; });
    /* a stored gap the evidence no longer shows is resolved BY THE EVIDENCE */
    for (const s of stored.values()) if (!liveGaps.some((g) => g.gapKey === s.gapKey) && views.some((v) => v.id === s.selectionId)) gaps.push({ ...s, id: s.id, status: 'RESOLVED', version: s.version, live: false, resolution: s.resolution ?? 'Evidence is now available' });
    /* related reconciliations and Flux for the matched lines, server-authoritative */
    const pairs = new Map<string, GLine>(); for (const v of views) if (v.line) pairs.set(`${v.line.entity}|${v.line.group}`, v.line);
    const reconciliations = [...pairs.values()].map((l) => {
      const def = this.controls.recDef(`REC-${l.entity}-${l.group}`);
      if (!def) return null;
      const p = q?.periodEnd ?? l.period, rc = this.controls.reconcile(def, p), b = this.controls.reconBalance(def, p);
      return { id: def.id, name: def.name, entity: def.entity, available: b.available, tieStatus: rc.tieStatus, glBalanceUsd: b.available ? b.glBalanceUsd : null, differenceUsd: b.available ? b.differenceUsd : null, status: rc.workflow.status, preparer: rc.workflow.preparer, reviewer: rc.workflow.reviewer, supportComplete: rc.supportComplete, comments: rc.workflow.comments.length, balanceRecord: b.available ? `${b.id} v${b.version}` : null, reason: b.available ? null : b.reason };
    }).filter((x): x is NonNullable<typeof x> => !!x);
    const fluxKeys = new Set<string>(); for (const v of views) if (v.line) fluxKeys.add(`${v.line.group}|${v.line.period}`);
    const flux = [...fluxKeys].map((k) => { const [g, p] = k.split('|'); const f = this.controls.fluxItems(p!, 'ALL').find((x) => x.account === g); return f ? { id: f.id, account: f.account, name: f.name, period: p!, changeUsd: d2(f.changeUsd), material: f.material, status: f.status, explanationId: f.explanation?.id ?? null, explanationVersion: f.explanation?.version ?? null, text: f.explanation?.text ?? null } : null; }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.period.localeCompare(b.period));
    const live = q && pop && tie ? this.pinsOf(r, pop, tie, allViews) : null;
    const staleReasons = r.pins && live ? diffPins(r.pins, live) : [];
    const stale = staleReasons.length > 0;
    const allMatching = { MATCHED: 0, MULTIPLE_MATCHES: 0, PARTIAL_MATCH: 0, NOT_FOUND: 0, SOURCE_UNAVAILABLE: 0 } as Record<MatchStatus, number>;
    allViews.forEach((v) => allMatching[v.status]++);
    const { status, reasons } = this.statusOf(r, { stale, matching: allMatching, gaps, tie, views: allViews });
    const warnings = [...duplicates, ...(r.interpretation?.notes ?? []), ...r.intakeNotes, ...(tie?.reasons ?? [])];
    return { id, version: r.version, body: r, requirement: q, population: pop && q ? { id: pop.def.id, filter: pop.def.filter, rowCount: pop.rows.length, totalUsd: pop.totalUsd, contentHash: pop.contentHash, dataVersion: this.gl.dataVersion(), mappingVersion: MAPPING_VERSION, generatedAt: r.pins?.pinnedAt ?? r.createdAt, sourceSystems: pop.systems, belowThreshold: pop.below } : null,
      tie, selections: views, gaps, coverage: { ...cov, fullUsd: d2(cov.fullUsd), partialUsd: d2(cov.partialUsd), unsupportedUsd: d2(cov.unsupportedUsd), matchedUsd: d2(cov.matchedUsd) }, matching, reconciliations, flux, status, statusReasons: reasons, stale, staleReasons, pinsLive: live, warnings, duplicates };
  }
  private liveGaps(r: Stamped<PBCRequestBody>, views: SelectionView[]): SupportGapBody[] {
    const out: SupportGapBody[] = [];
    const threshold = r.interpretation?.requirement.minAbsUsd ?? 1_000_000;
    const ownerOf = (l: GLine | null) => (l ? this.controls.recDef(`REC-${l.entity}-${l.group}`)?.preparer : null) ?? r.owner;
    const KINDS: Partial<Record<EvidenceType, Partial<Record<EvidenceStatus, string>>>> = {
      INVOICE: { MISSING: 'Missing invoice' }, PO: { MISSING: 'Missing PO', AMBIGUOUS: 'Ambiguous PO' }, APPROVAL: { MISSING: 'Missing approval' }, CONTRACT: { MISSING: 'Missing contract' },
      RECONCILIATION: { PARTIAL: 'Reconciliation incomplete', UNAVAILABLE: 'No reconciliation modelled' }, FLUX_EXPLANATION: { MISSING: 'Flux explanation missing', PARTIAL: 'Flux explanation not approved' },
      SOURCE_TRANSACTION: { UNAVAILABLE: 'Source system unavailable', PARTIAL: 'Source extract stale', MISSING: 'No ERP source reference' },
    };
    const acct = new Map<string, SupportGapBody & { nos: number[] }>();
    for (const v of views) {
      const amt = d2(Math.abs(v.line?.usd ?? v.identifiers.amount ?? 0));
      if (!v.line) { out.push({ requestId: r.id, gapKey: `${v.no}:SELECTION`, selectionNo: v.no, selectionId: v.id, transactionId: null, requirement: 'SELECTION', kind: v.status === 'MULTIPLE_MATCHES' ? 'Selection matches several transactions' : v.status === 'PARTIAL_MATCH' ? 'Selection only partly matches' : v.status === 'SOURCE_UNAVAILABLE' ? 'Selection source unavailable' : 'Selection not found', amountUsd: amt, severity: 'HIGH', owner: r.owner, resolution: null, note: null, resolvedBy: null, resolvedAt: null }); continue; }
      for (const e of v.evidence) {
        const kind = KINDS[e.type]?.[e.status] ?? (e.status === 'MISSING' ? `Missing ${EVIDENCE_LABEL[e.type].toLowerCase()}` : null);
        if (!kind || e.status === 'AVAILABLE' || e.status === 'NOT_REQUIRED') continue;
        /* account-level: ONE gap per reconciliation / Flux line, carrying every selection it affects */
        if (ACCOUNT_LEVEL.includes(e.type)) {
          const key = `${e.type}:${e.reference ?? e.trace}`, ex = acct.get(key);
          if (ex) { ex.amountUsd = d2(ex.amountUsd + amt); ex.nos.push(v.no); continue; }
          acct.set(key, { requestId: r.id, gapKey: key, selectionNo: v.no, selectionId: v.id, transactionId: null, requirement: e.type, kind, amountUsd: amt, severity: 'MEDIUM', owner: ownerOf(v.line), resolution: null, note: e.detail, resolvedBy: null, resolvedAt: null, nos: [v.no] });
          continue;
        }
        const material = amt >= threshold;
        const sev = material && (e.type === 'INVOICE' || e.type === 'APPROVAL' || e.type === 'SOURCE_TRANSACTION') ? 'HIGH' : material ? 'MEDIUM' : 'LOW';
        out.push({ requestId: r.id, gapKey: `${v.no}:${e.type}`, selectionNo: v.no, selectionId: v.id, transactionId: v.line.key, requirement: e.type, kind, amountUsd: amt, severity: sev, owner: ownerOf(v.line), resolution: null, note: e.detail, resolvedBy: null, resolvedAt: null });
      }
    }
    for (const g of acct.values()) { const { nos, ...b } = g; out.push({ ...b, severity: b.amountUsd >= threshold ? 'MEDIUM' : 'LOW', note: `${b.note} — affects selection${nos.length > 1 ? 's' : ''} ${nos.join(', ')}` }); }
    return out;
  }
  private statusOf(r: Stamped<PBCRequestBody>, x: { stale: boolean; matching: Record<MatchStatus, number>; gaps: GapView[]; tie: PBCTieOut | null; views: SelectionView[] }): { status: PBCStatus; reasons: string[] } {
    const reasons: string[] = [];
    if (x.stale && r.lifecycle !== 'DELIVERED') return { status: 'STALE', reasons: ['The governed data behind this request changed since it was evaluated; refresh it to create a new version.'] };
    if (r.lifecycle === 'DELIVERED') return { status: 'DELIVERED', reasons: [`Delivered ${r.delivered?.at.slice(0, 10)} by ${r.delivered?.by} (generation ${r.delivered?.generationId}, package v${r.delivered?.artifactVersion}); kept exactly as delivered${x.stale ? '. The data has changed since — a refresh creates a new version' : ''}.`] };
    if (r.lifecycle === 'GENERATING') return { status: 'GENERATING', reasons: ['The package is being generated.'] };
    if (!r.interpretation) return { status: 'DRAFT', reasons: ['The request has no structured requirement yet — it needs review.'] };
    if (r.intake === 'REQUIRES_REVIEW') reasons.push('The uploaded request could not be fully parsed and needs review.');
    const unmatched = x.matching.MULTIPLE_MATCHES + x.matching.PARTIAL_MATCH + x.matching.NOT_FOUND + x.matching.SOURCE_UNAVAILABLE;
    const openGaps = x.gaps.filter((g) => g.status === 'OPEN');
    const material = openGaps.filter((g) => g.severity !== 'LOW');
    if (unmatched) reasons.push(`${unmatched} selection(s) are not matched to one governed transaction.`);
    if (material.length) { const ex = gapExposure(material); reasons.push(`${material.length} material support gap(s) are open${ex.selections ? ` on ${ex.selections} selection(s) (${usd(ex.usd)})` : ''}.`); }
    if (x.tie && x.tie.status !== 'TIED') reasons.push(`The population tie-out is ${x.tie.status.replace(/_/g, ' ').toLowerCase()}.`);
    if (!x.views.length) reasons.push('The request has no selections.');
    if (unmatched) return { status: 'MATCHING', reasons };
    if (material.length) return { status: 'GATHERING_EVIDENCE', reasons };
    if (r.intake === 'REQUIRES_REVIEW' || (x.tie && x.tie.status !== 'TIED') || !x.views.length) return { status: 'REVIEW_REQUIRED', reasons };
    if (r.lifecycle === 'GENERATED') return { status: 'GENERATED', reasons: ['The package has been generated; deliver it or refine it.'] };
    return { status: 'READY', reasons: ['Every selection is matched, required support is available and the population ties.'] };
  }
  private pinsOf(r: Stamped<PBCRequestBody>, pop: ReturnType<AuditService['population']>, tie: PBCTieOut, views: SelectionView[]): PBCPins {
    const keys = views.map((v) => v.line?.key).filter((k): k is string => !!k);
    const evidenceHash = sha(keys.map((k) => `${k}:${WORK.relationshipVersion(`txn:${k}`)}`));
    const recs = [...new Set(views.map((v) => v.line ? `REC-${v.line.entity}-${v.line.group}` : '').filter(Boolean))].map((id) => { const d = this.controls.recDef(id); if (!d) return id; const b = this.controls.reconBalance(d, r.interpretation!.requirement.periodEnd); const s = this.controls.reconcile(d, r.interpretation!.requirement.periodEnd); return `${id}:${b.available ? b.version : 'm'}:${s.workflow.status}:${s.supportComplete}`; });
    const flux = [...new Set(views.map((v) => v.line ? `${v.line.group}|${v.line.period}` : '').filter(Boolean))].map((k) => { const [g, p] = k.split('|'); const f = this.controls.fluxItems(p!, 'ALL').find((x) => x.account === g); return `${k}:${f?.explanation?.version ?? 0}:${f?.status ?? '-'}`; });
    const selectionHash = sha(views.map((v) => `${v.no}:${v.status}:${v.line?.key ?? ''}`));
    const base = { populationId: pop.def.id, rowCount: pop.rows.length, totalUsd: pop.totalUsd, contentHash: pop.contentHash, dataVersion: this.gl.dataVersion(), mappingVersion: MAPPING_VERSION, tieStatus: tie.status, evidenceHash, reconHash: sha(recs), fluxHash: sha(flux), selectionHash };
    return { ...base, fingerprint: sha(base), pinnedAt: new Date().toISOString() };
  }

  /* ---- versioning ---------------------------------------------------------------------------------- */
  /** record what the request was evaluated over (its pins) and materialise its gaps — a NEW version when anything moved */
  snapshot(actor: Actor, id: string, change: string, channel: 'SLOANE' | 'UI', traceId: string | null) {
    const v = this.evaluate(id, 'ALL');
    const r = this.get(id)!;
    if (!v) return r;
    const pins = v.pinsLive;
    const next = WORK.repos.database.tx(() => {
      const u = WORK.repos.records.update<PBCRequestBody>(KIND, id, r.version, actor.id, (o) => ({ ...strip(o), pins, populationId: v.population?.id ?? null, lastChange: change,
        history: o.pins || o.history.length ? [...o.history, { version: o.version, at: o.updatedAt, by: o.updatedBy, change: o.lastChange, requirement: o.interpretation?.requirement ?? null, pins: o.pins }] : o.history }), { status: v.status === 'STALE' ? 'OPEN' : v.status });
      for (const g of v.gaps.filter((x) => x.live)) {
        const ex = this.gapRecords(id).find((x) => x.gapKey === g.gapKey);
        if (!ex) WORK.repos.records.insert<SupportGapBody>(GAP, { requestId: id, gapKey: g.gapKey, selectionNo: g.selectionNo, selectionId: g.selectionId, transactionId: g.transactionId, requirement: g.requirement, kind: g.kind, amountUsd: g.amountUsd, severity: g.severity, owner: g.owner, resolution: null, note: g.note, resolvedBy: null, resolvedAt: null }, actor.id, { prefix: 'GAP', target: id, status: 'OPEN' });
      }
      for (const g of this.gapRecords(id)) if (g.status === 'OPEN' && !v.gaps.some((x) => x.live && x.gapKey === g.gapKey)) WORK.repos.records.update<SupportGapBody>(GAP, g.id, g.version, actor.id, (o) => ({ ...strip(o), resolution: 'Evidence is now available', resolvedBy: 'Korvyn (evidence re-evaluated)', resolvedAt: new Date().toISOString() }), { status: 'RESOLVED' });
      this.audit(actor, channel, 'PBC_POPULATION_GENERATED', u, { version: u.version, populationId: pins?.populationId, rows: pins?.rowCount, totalUsd: pins?.totalUsd, dataVersion: pins?.dataVersion, tie: pins?.tieStatus }, traceId);
      this.audit(actor, channel, 'PBC_SELECTIONS_MATCHED', u, { version: u.version, ...v.matching, coverage: v.coverage.pct, gaps: v.gaps.filter((g) => g.status === 'OPEN').length }, traceId);
      return u;
    });
    return next;
  }
  /** a request changed by a person or by Sloane: a NEW version, the prior requirement and pins kept in history */
  modify(actor: Actor, id: string, next: PBCRequirement, change: string, channel: 'SLOANE' | 'UI', traceId: string | null) {
    const r = this.get(id)!;
    const interp: PBCInterpretation = { ...(r.interpretation ?? { from: 'manual', modelProposal: null, resolved: [], notes: [] }), requirement: next, resolved: [...(r.interpretation?.resolved ?? []), change] } as PBCInterpretation;
    const selectionsChange = r.selectionsMode === 'POPULATION' && JSON.stringify(this.populationFilter(next)) !== JSON.stringify(r.interpretation ? this.populationFilter(r.interpretation.requirement) : null);
    WORK.repos.records.update<PBCRequestBody>(KIND, id, r.version, actor.id, (o) => ({ ...strip(o), interpretation: interp, title: o.source === 'UPLOAD' ? o.title : next.title, lastChange: change, lifecycle: o.lifecycle === 'DELIVERED' ? 'OPEN' : o.lifecycle, history: [...o.history, { version: o.version, at: o.updatedAt, by: o.updatedBy, change: o.lastChange, requirement: o.interpretation?.requirement ?? null, pins: o.pins }] }));
    this.audit(actor, channel, 'PBC_REQUEST_MODIFIED', this.get(id)!, { change, requirement: next }, traceId);
    if (selectionsChange) this.autoSelect(actor, id);
    return this.snapshot(actor, id, change, channel, traceId);
  }
  refresh(actor: Actor, id: string, channel: 'SLOANE' | 'UI', traceId: string | null) {
    const before = this.evaluate(id, 'ALL');
    const r = this.get(id)!;
    if (r.lifecycle === 'DELIVERED') WORK.repos.records.update<PBCRequestBody>(KIND, id, r.version, actor.id, (o) => ({ ...strip(o), lifecycle: 'OPEN', lastChange: 'Reopened by refresh; the delivered package is kept as delivered' }));
    if (r.selectionsMode === 'POPULATION' && before?.stale) this.autoSelect(actor, id);
    const u = this.snapshot(actor, id, `Refreshed against the current governed data${before?.staleReasons.length ? `: ${before.staleReasons.join('; ')}` : ''}`, channel, traceId);
    this.audit(actor, channel, 'PBC_REQUEST_REFRESHED', u, { from: r.version, to: u.version, reasons: before?.staleReasons ?? [] }, traceId);
    return u;
  }
  resolveSelection(actor: Actor, id: string, selectionId: string, chosenKey: string, note: string, channel: 'SLOANE' | 'UI', traceId: string | null) {
    const s = WORK.repos.records.get<AuditSelectionBody>(SEL, selectionId);
    if (!s || s.requestId !== id) throw new Error(`No selection ${selectionId} on ${id}`);
    const l = this.index().byKey.get(chosenKey.toUpperCase());
    if (!l) throw new Error(`${chosenKey} is not a governed transaction`);
    WORK.repos.records.update<AuditSelectionBody>(SEL, selectionId, s.version, actor.id, (o) => ({ ...strip(o), resolution: { chosenKey: l.key, by: actor.name, at: new Date().toISOString(), note } }));
    this.audit(actor, channel, 'PBC_SELECTION_MATCHED', this.get(id)!, { selection: s.no, chosenKey: l.key, note }, traceId);
    return this.snapshot(actor, id, `Selection ${s.no} matched to ${l.key} by ${actor.name}`, channel, traceId);
  }
  /** attach a reference to a transaction (the EvidenceGraph relationship) — a reference, never a document */
  linkEvidence(actor: Actor, id: string, gapId: string, reference: string, channel: 'SLOANE' | 'UI', traceId: string | null) {
    const v = this.evaluate(id, 'ALL'), g = v?.gaps.find((x) => x.id === gapId);
    if (!g || !g.transactionId || g.requirement === 'SELECTION') throw new Error('Evidence can only be linked to a gap on a matched transaction');
    const rel = WORK.relate({ type: 'INVOICE_FOR', from: reference, to: `txn:${g.transactionId}`, kind: g.requirement, label: `${EVIDENCE_LABEL[g.requirement as EvidenceType]} ${reference}`, sourceSystem: 'Korvyn (reference)', via: channel === 'SLOANE' ? 'Sloane' : 'UI', executionId: traceId }, { id: actor.id, name: actor.name } as never, null);
    this.audit(actor, channel, 'PBC_EVIDENCE_LINKED', this.get(id)!, { gap: g.gapKey, reference, relationshipId: rel.id, transactionId: g.transactionId }, traceId);
    return this.snapshot(actor, id, `${EVIDENCE_LABEL[g.requirement as EvidenceType]} ${reference} linked to selection ${g.selectionNo}`, channel, traceId);
  }
  resolveGap(actor: Actor, id: string, gapId: string, o: { status: 'WAIVED' | 'RESOLVED'; note: string }, channel: 'SLOANE' | 'UI', traceId: string | null) {
    const v = this.evaluate(id, 'ALL');
    const g = v?.gaps.find((x) => x.id === gapId);
    if (!g) throw new Error(`No gap ${gapId}`);
    if (!o.note.trim()) throw new Error('A gap is resolved with a reason');
    let rec = this.gapRecords(id).find((x) => x.gapKey === g.gapKey);
    if (!rec) { this.snapshot(actor, id, 'Gaps materialised', channel, traceId); rec = this.gapRecords(id).find((x) => x.gapKey === g.gapKey)!; }
    WORK.repos.records.update<SupportGapBody>(GAP, rec.id, rec.version, actor.id, (x) => ({ ...strip(x), resolution: o.status === 'WAIVED' ? 'Waived' : 'Resolved outside Korvyn', note: o.note, resolvedBy: actor.name, resolvedAt: new Date().toISOString() }), { status: o.status });
    this.audit(actor, channel, 'PBC_GAP_RESOLVED', this.get(id)!, { gap: g.gapKey, kind: g.kind, status: o.status, note: o.note, amountUsd: g.amountUsd }, traceId);
    return this.snapshot(actor, id, `Gap ${g.kind} on selection ${g.selectionNo} ${o.status.toLowerCase()}`, channel, traceId);
  }
  setLifecycle(actor: Actor, id: string, lifecycle: PBCRequestBody['lifecycle'], extra: Partial<PBCRequestBody>, action: string, channel: 'SLOANE' | 'UI', traceId: string | null) {
    /* an operational state, not a new version: a package that cites request vN must not go stale because it was generated */
    patchRecordData(WORK.repos.records, KIND, id, { ...extra, lifecycle }, null, actor.id);
    const u = this.get(id)!;
    this.audit(actor, channel, action, u, { lifecycle, ...extra }, traceId);
    return u;
  }
  linkPackage(actor: Actor, id: string, artifactId: string) {
    const r = this.get(id)!;
    if (r.packageArtifactId === artifactId) return r;
    patchRecordData(WORK.repos.records, KIND, id, { packageArtifactId: artifactId }, null, actor.id);
    return this.get(id)!;
  }

  /* ---- audit readiness: deterministic conditions only, never a score ---------------------------------- */
  readiness(accounts: string[], periodStart: string, periodEnd: string, vis: Set<string> | 'ALL') {
    const q: PBCRequirement = { title: 'readiness', periodStart, periodEnd, scopeId: 'GROUP', accounts, objectName: '', populationType: 'ADDITIONS', minAbsUsd: null, requiredEvidence: ['INVOICE', 'PO', 'APPROVAL', 'SOURCE_TRANSACTION'] };
    const pop = this.population(q, vis), tie = this.tieOut(q, pop, vis);
    const ev = this.controls.evidenceForLines(pop.rows);
    const checks = AUDIT_CHECKS.map((c) => ({ id: c.id, label: c.label, ...c.run({ svc: this, controls: this.controls, gl: this.gl, accounts, periodStart, periodEnd, vis, rows: pop.rows }) }));
    return { population: { id: pop.def.id, rows: pop.rows.length, totalUsd: pop.totalUsd }, tie, evidence: { apLines: ev.apLines, invoiceRefs: ev.invoiceRefs, approvalsRequired: ev.approvalsRequired, approvalRefs: ev.approvalRefs, linesMissing: ev.missing.length, amountMissing: d2(ev.missing.reduce((s, m) => s + Math.abs(m.line.usd), 0)) }, checks,
      openGaps: this.list().flatMap((r) => this.gapRecords(r.id).filter((g) => g.status === 'OPEN')).length };
  }

  audit(actor: Actor, channel: 'SLOANE' | 'UI', action: string, r: { id: string; title?: string }, after: Record<string, unknown>, traceId?: string | null) {
    return WORK.repos.audit.append({ actor: { id: actor.id, name: actor.name, role: actor.role }, source: channel, action, target: { id: r.id, type: 'PBC_REQUEST', label: r.title ?? r.id }, beforeRef: r.id, afterRef: r.id, before: null, after,
      investigationId: null, executionTraceId: traceId ?? null, proposalId: null, confirmation: null, financialObjectIds: [], populationIds: typeof after['populationId'] === 'string' ? [after['populationId'] as string] : [], evidenceIds: [], outcome: 'COMPLETED', error: null });
  }
}
const STAMP = ['id', 'version', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'status', 'scope', 'period', 'target', 'investigationId'];
function strip<T extends object>(o: T): T { const c = { ...(o as Record<string, unknown>) }; for (const k of STAMP) delete c[k]; return c as T; }
export function diffPins(a: PBCPins, b: PBCPins): string[] {
  const out: string[] = [];
  if (a.contentHash !== b.contentHash) out.push(`population ${a.rowCount} → ${b.rowCount} lines, ${usd(a.totalUsd)} → ${usd(b.totalUsd)}`);
  if (a.dataVersion !== b.dataVersion) out.push(`governed data ${a.dataVersion} → ${b.dataVersion}`);
  if (a.mappingVersion !== b.mappingVersion) out.push(`mapping ${a.mappingVersion} → ${b.mappingVersion}`);
  if (a.tieStatus !== b.tieStatus) out.push(`tie-out ${a.tieStatus} → ${b.tieStatus}`);
  if (a.evidenceHash !== b.evidenceHash) out.push('evidence relationships changed (support added or removed)');
  if (a.reconHash !== b.reconHash) out.push('a related reconciliation changed');
  if (a.fluxHash !== b.fluxHash) out.push('a related Flux explanation changed');
  if (a.selectionHash !== b.selectionHash) out.push('selection matching changed');
  return out;
}

/* ================================================================================================
   CONTINUOUS AUDIT READINESS — the hooks (§33). Each is a deterministic check over governed services; nothing runs in
   the background in this phase — they run when readiness is asked for.
   ================================================================================================ */
interface CheckCtx { svc: AuditService; controls: ControlService; gl: GovernedLedger; accounts: string[]; periodStart: string; periodEnd: string; vis: Set<string> | 'ALL'; rows: GLine[] }
export const AUDIT_CHECKS: { id: string; label: string; run: (c: CheckCtx) => { status: 'PASS' | 'FINDING' | 'NOT_APPLICABLE'; count: number; amountUsd: number | null; detail: string } }[] = [
  { id: 'missing-evidence', label: 'Missing evidence', run: (c) => { const m = c.controls.evidenceForLines(c.rows).missing; return { status: m.length ? 'FINDING' : 'PASS', count: m.length, amountUsd: d2(m.reduce((s, x) => s + Math.abs(x.line.usd), 0)), detail: m.length ? `${m.length} lines missing an invoice, PO or approval reference` : 'Every AP line carries its required references' }; } },
  { id: 'stale-reconciliation', label: 'Reconciliations not tied or not approved', run: (c) => { const acc = new Set(c.accounts); const recs = c.controls.reconciliations(c.periodEnd, c.vis).filter((r) => r.accounts.some((a) => acc.has(a) || acc.has(c.gl.account(a)?.parent ?? ''))); const bad = recs.filter((r) => r.tieStatus !== 'TIED' || r.workflow.status !== 'APPROVED'); return { status: !recs.length ? 'NOT_APPLICABLE' : bad.length ? 'FINDING' : 'PASS', count: bad.length, amountUsd: null, detail: recs.length ? `${recs.length - bad.length} of ${recs.length} reconciliations tied and approved` : 'No server-modelled reconciliation for these accounts' }; } },
  { id: 'unexplained-flux', label: 'Unexplained material Flux', run: (c) => { const acc = new Set(c.accounts); const f = c.controls.fluxItems(c.periodEnd, c.vis).filter((x) => acc.has(x.account) && x.material && x.status !== 'APPROVED'); return { status: f.length ? 'FINDING' : 'PASS', count: f.length, amountUsd: f.length ? d2(f.reduce((s, x) => s + Math.abs(x.changeUsd), 0)) : null, detail: f.length ? `${f.map((x) => x.name).join(', ')}: material movement without an approved explanation` : 'Material movements are explained' }; } },
  { id: 'unsupported-material-movement', label: 'Material items without an invoice', run: (c) => { const m = c.rows.filter((l) => Math.abs(l.usd) >= 1_000_000 && l.vendor && !l.invoiceRef); return { status: m.length ? 'FINDING' : 'PASS', count: m.length, amountUsd: d2(m.reduce((s, l) => s + Math.abs(l.usd), 0)), detail: m.length ? `${m.length} items of $1M+ carry no invoice reference` : 'No $1M+ item lacks an invoice reference' }; } },
  { id: 'late-approval', label: 'Approvals required and not referenced', run: (c) => { const m = c.rows.filter((l) => l.approvalRequired && !l.approvalRef); return { status: m.length ? 'FINDING' : 'PASS', count: m.length, amountUsd: d2(m.reduce((s, l) => s + Math.abs(l.usd), 0)), detail: m.length ? `${m.length} bills over the $250K policy without an approval reference` : 'Every bill over policy carries an approval reference' }; } },
  { id: 'stale-erp-feed', label: 'Stale or unavailable ERP feeds', run: (c) => { const bad = [...new Set(c.rows.map((l) => l.connector))].map((k) => SOURCE_HEALTH[k]).filter((h) => h && h.status !== 'AVAILABLE'); return { status: bad.length ? 'FINDING' : 'PASS', count: bad.length, amountUsd: null, detail: bad.length ? bad.map((h) => `${h!.system} ${h!.status.toLowerCase()}`).join('; ') : 'Every source is current' }; } },
  { id: 'population-drift', label: 'Population drift since requests were evaluated', run: (c) => { const drift = c.svc.list().filter((r) => r.pins && r.interpretation && r.interpretation.requirement.accounts.some((a) => c.accounts.includes(a))).map((r) => c.svc.evaluate(r.id, c.vis)).filter((v) => v?.stale); return { status: drift.length ? 'FINDING' : 'PASS', count: drift.length, amountUsd: null, detail: drift.length ? `${drift.length} PBC request(s) are stale: ${drift.map((v) => v!.body.pbcNumber).join(', ')}` : 'No PBC request over these accounts has drifted' }; } },
];
