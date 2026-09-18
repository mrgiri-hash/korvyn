/**
 * THE ONE BOOK (Phase 3D) — the server-side services the Korvyn workspaces AND Sloane both read and write for Flux
 * comments, close tasks, reconciliation support and saved reports. There is no second copy: the browser workspaces call
 * /api/work/* (workapi.ts), which calls these; Sloane's tools and action services call the same functions.
 *
 * Two financial models still exist and this file is where they meet, deliberately and visibly:
 *   - the SERVER book (@korvyn/core's GL: account groups 15000, 40000 …), which Sloane's tools compute amounts over;
 *   - the WORKSPACE objects the browser prototype presents (Flux statement lines `recost`, close tasks CT-001 …, saved
 *     reports RPT-0001 …). Their WORKFLOW state (comments, status, support, definitions) is stored here, once, seeded
 *     from `persistence/browser-book.json` (extracted from index.html by tools/extract-browser-book.mjs).
 * The crosswalks below are navigation between those two models, not a second mapping; amounts are never copied.
 */
import { readFileSync } from 'node:fs';
import { WORK, type Comment } from './store.js';
import { StaleVersionError, type Stamped, type SavedBody, type CloseTaskBody } from './persistence/repositories.js';
import { DEV_DIRECTORY } from './auth.js';
const nameOf = (id: string) => DEV_DIRECTORY.find((u) => u.id === id)?.name ?? (id.startsWith('system:') ? 'Korvyn' : id);

/* ================================================================================================
   THE EXTRACTED BROWSER FIXTURES (read once)
   ================================================================================================ */
export interface BrowserCloseTask { id: string; nm: string; ent: string; fn: string; own: string; rev: string; due: string; st: string; dep: string }
export interface BrowserBook {
  closeTasks: BrowserCloseTask[];
  reconciliationReview: Record<string, { prep: string; review: string; move: string; returnNote?: string }>;
  fluxLines: { id: string; name: string; parent: string | null; kind: string }[];
  reports: (Record<string, unknown> & { id: string; name: string; owner: string; version: number })[];
}
export const BROWSER_BOOK: BrowserBook = JSON.parse(readFileSync(new URL('./persistence/browser-book.json', import.meta.url), 'utf8'));

/** a workspace entity name → the server entity it is, where the server book models it (others roll up to the group) */
export const ENTITY_IDS: Record<string, string> = { 'Meridian DC Holdco': 'MDH' };
export const entityIdOf = (name: string) => ENTITY_IDS[name] ?? 'GROUP';

/* ================================================================================================
   CLOSE
   ================================================================================================ */
export const CLOSE_STATE: Record<string, string> = { done: 'COMPLETE', prog: 'IN_PROGRESS', blk: 'BLOCKED', not: 'NOT_STARTED' };
export const CLOSE_STATE_CODE: Record<string, string> = Object.fromEntries(Object.entries(CLOSE_STATE).map(([k, v]) => [v, k]));
export const CLOSE_TASK_STATES = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE'] as const;
export type CloseTaskState = (typeof CLOSE_TASK_STATES)[number];

export function closeTaskBodies(): CloseTaskBody[] {
  return BROWSER_BOOK.closeTasks.map((t) => ({ taskId: t.id, name: t.nm, workstream: t.fn, entity: entityIdOf(t.ent), entityName: t.ent, owner: t.own, approver: t.rev, due: t.due,
    state: CLOSE_STATE[t.st] ?? 'NOT_STARTED', blockedBy: t.st === 'blk' ? (t.dep || 'blocked — see the close checklist') : null, dependency: t.dep || null }));
}
export interface CloseTaskView { id: string; recordId: string; name: string; workstream: string; entity: string; entityName: string; owner: string; reviewer: string; due: string; state: string; code: string; blockedBy: string | null; dependency: string | null; version: number; updatedAt: string; updatedBy: string }
export const closeTaskView = (t: Stamped<CloseTaskBody>): CloseTaskView => ({ id: t.taskId, recordId: t.id, name: t.name, workstream: t.workstream, entity: t.entity, entityName: t.entityName ?? t.entity, owner: t.owner, reviewer: t.approver, due: t.due,
  state: t.state, code: CLOSE_STATE_CODE[t.state] ?? 'not', blockedBy: t.blockedBy ?? null, dependency: t.dependency ?? null, version: t.version, updatedAt: t.updatedAt, updatedBy: nameOf(t.updatedBy) });
export function closeTask(period: string, taskId: string) { return WORK.repos.close.tasks(period).find((t) => t.taskId === taskId) ?? null; }
export function setCloseTaskState(period: string, taskId: string, to: CloseTaskState, blockedBy: string | null, expectedVersion: number | null, by: string) {
  const t = closeTask(period, taskId);
  if (!t) return null;
  return WORK.repos.records.update<CloseTaskBody>('CLOSE_TASK', t.id, expectedVersion, by, (o) => ({ taskId: o.taskId, name: o.name, workstream: o.workstream, entity: o.entity, entityName: o.entityName, owner: o.owner, approver: o.approver, due: o.due,
    state: to, blockedBy: to === 'BLOCKED' ? (blockedBy || o.blockedBy || o.dependency || 'blocked') : null, dependency: o.dependency ?? null }), { status: to });
}

/* ================================================================================================
   FLUX — the workspace's statement lines and the server account groups
   ================================================================================================ */
/** a workspace Flux line → the server account groups it presents. Each account belongs to exactly ONE line, so a
 *  comment Sloane writes on an account is shown on exactly one line (no thread is shared by two lines). */
export const FLUX_LINE_ACCOUNTS: Record<string, string[]> = {
  'FS-CASH': ['10000'], 'FS-AR': ['11000'], 'FS-PRE': ['12000'], 'FS-ICR': ['13000'], 'FS-CIP': ['15000'], 'FS-BLDG': ['16000'], 'FS-ACCDEP': ['17000'], 'FS-INTAN': ['18000'],
  'FS-AP': ['20000'], 'FS-ACC': ['21000'], 'FS-ICP': ['23000'], 'FS-DEBT': ['25000'], 'FS-CAP': ['30000'],
  'FS-BREV': ['40000'], 'FS-UTIL': ['50000'], 'FS-PROF': ['60000'], 'FS-DEP': ['65000'], 'FS-OTH': ['70000'],
};
export const fluxLineOfAccount = (account: string) => Object.entries(FLUX_LINE_ACCOUNTS).find(([, a]) => a.includes(account))?.[0] ?? null;
export const fluxLine = (lineId: string) => {
  const l = BROWSER_BOOK.fluxLines.find((x) => x.id === lineId && x.kind !== 'stmt');
  if (!l) return null;
  let root = l; while (root.parent) { const p = BROWSER_BOOK.fluxLines.find((x) => x.id === root.parent); if (!p) break; root = p; }
  return { id: l.id, label: l.name, stmt: root.id === 'FS-IS' ? 'is' : 'bs' };
};
export const fluxLineKey = (lineId: string, period: string) => `fluxline:${lineId}:${period}`;
export const fluxAccountKey = (account: string, period: string) => `flux:${account}:${period}`;

export type BookComment = Comment & { threadKey: string; on: string };
const tag = (key: string, on: string) => (c: Comment): BookComment => ({ ...c, threadKey: key, on });
const byTime = (a: BookComment, b: BookComment) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id);

/** what the Flux WORKSPACE shows on a line: the line's own thread, plus the threads of the account groups it presents */
export function fluxLineComments(lineId: string, period: string) {
  const key = fluxLineKey(lineId, period), line = WORK.thread(key);
  const accounts = FLUX_LINE_ACCOUNTS[lineId] ?? [];
  const comments = [...line.comments.map(tag(key, 'line')), ...accounts.flatMap((a) => WORK.thread(fluxAccountKey(a, period)).comments.map(tag(fluxAccountKey(a, period), a)))].sort(byTime);
  return { key, threadVersion: line.version, accounts, comments };
}
/** what SLOANE reads on an account group: its own thread, plus the thread of the workspace line that presents it */
export function fluxAccountComments(account: string, period: string) {
  const key = fluxAccountKey(account, period), own = WORK.thread(key).comments.map(tag(key, account));
  const lineId = fluxLineOfAccount(account);
  const line = lineId ? WORK.thread(fluxLineKey(lineId, period)).comments.map(tag(fluxLineKey(lineId, period), `line:${lineId}`)) : [];
  return [...own, ...line].sort(byTime);
}

/* ================================================================================================
   SAVED REPORTS — one store for the Reporting workspace and Sloane
   ================================================================================================ */
/** Sloane's report dimensions ↔ the Reporting workspace's field ids */
const DIM_TO_FIELD: Record<string, string> = { vendor: 'vendor', project: 'project', entity: 'entity', account: 'acctNo', costCenter: 'costCenter', currency: 'currency', property: 'property', period: 'period' };
const FIELD_TO_DIM: Record<string, string> = { vendor: 'vendor', project: 'project', entity: 'entity', acctNo: 'account', costCenter: 'costCenter', currency: 'currency', property: 'property' };

/** the Reporting workspace definition for a report Sloane built (rows, filters and period translated; nothing invented) */
export function browserDefOf(name: string, d: Record<string, unknown>): Record<string, unknown> {
  if (d['browser'] && typeof d['browser'] === 'object') return d['browser'] as Record<string, unknown>;
  const rows = ((d['rows'] as string[] | undefined) ?? []).map((r) => DIM_TO_FIELD[r]).filter((x): x is string => !!x && x !== 'period');
  const f = (d['filters'] as Record<string, string> | undefined) ?? {};
  const filters = Object.entries(f).filter(([k]) => DIM_TO_FIELD[k]).map(([k, v]) => ({ k: DIM_TO_FIELD[k], vals: [v] }));
  const from = String(d['periodStart'] ?? ''), to = String(d['periodEnd'] ?? '');
  return { name, desc: 'Built with Sloane.', layoutMode: 'auto', basis: 'activity', rows, cols: ['period'], filters, measure: 'net', plYtd: false, subtotals: true, rowLayout: 'nested', compare: null,
    recType: 'all', dimValue: 'effective', scopeId: 'SC-GROUP', lensId: 'RL-CORP', period: from && to ? { kind: 'range', from, to } : { kind: 'ytd' } };
}
/** the definition Sloane's tools read, kept in step with a workspace edit (rows, filters, period) */
export function sloaneShapeOf(browser: Record<string, unknown>): Record<string, unknown> {
  const rows = ((browser['rows'] as string[] | undefined) ?? []).map((r) => FIELD_TO_DIM[r] ?? r);
  const filters: Record<string, string> = {};
  for (const x of (browser['filters'] as { k: string; vals: string[] }[] | undefined) ?? []) if (x.vals?.length) filters[FIELD_TO_DIM[x.k] ?? x.k] = x.vals.join(', ');
  const p = (browser['period'] as { kind: string; from?: string; to?: string } | undefined) ?? { kind: 'ytd' };
  return { rows, filters, period: p, ...(p.kind === 'range' ? { periodStart: p.from, periodEnd: p.to } : {}) };
}
export interface SavedReportView { id: string; name: string; version: number; status: string; owner: string; createdBy: string; createdAt: string; updatedBy: string; updatedAt: string; createdByName: string; updatedByName: string; createdVia: string; sharedWith: string[]; archived: boolean; definition: Record<string, unknown>; browser: Record<string, unknown> }
/** the workspace reads an owner as a person's name; a report created by an authenticated user stores their id */
const ownerName = (o: string) => (o.startsWith('user:') ? nameOf(o) : o);
export const reportView = (r: Stamped<SavedBody>): SavedReportView => ({ id: r.id, name: r.name, version: r.version, status: r.status ?? 'DRAFT', owner: ownerName(String(r.definition['owner'] ?? r.createdBy)), createdBy: r.createdBy, createdAt: r.createdAt, updatedBy: r.updatedBy, updatedAt: r.updatedAt, createdByName: nameOf(r.createdBy), updatedByName: nameOf(r.updatedBy),
  createdVia: r.createdVia, sharedWith: r.sharedWith, archived: r.status === 'ARCHIVED', definition: r.definition, browser: browserDefOf(r.name, r.definition) });
export const savedReports = () => WORK.repos.saved.list('REPORT').filter((r) => r.status !== 'DELETED').map(reportView);
export const savedReport = (id: string) => savedReports().find((r) => r.id === id) ?? null;
export function findSavedReport(text: string) {
  const t = text.toLowerCase().replace(/\breport\b|\bthe\b/g, ' ').replace(/\s+/g, ' ').trim();
  const words = t.split(' ').filter((w) => w.length > 2);
  const scored = savedReports().map((r) => ({ r, s: r.name.toLowerCase() === t ? 100 : words.filter((w) => r.name.toLowerCase().includes(w)).length })).filter((x) => x.s > 0);
  return scored.sort((a, b) => b.s - a.s || b.r.updatedAt.localeCompare(a.r.updatedAt))[0]?.r ?? null;
}
export function reportSeedRecords() {
  return BROWSER_BOOK.reports.map((r) => {
    const { id, name, version: _v, history: _h, createdAt: _ca, updatedAt: _ua, createdBy: _cb, updatedBy: _ub, lastRun: _lr, sharedWith, archived: _a, ...browser } = r as Record<string, unknown> & { id: string; name: string; sharedWith?: string[] };
    void _v; void _h; void _ca; void _ua; void _cb; void _ub; void _lr; void _a;
    return { id, body: { name, definition: { ...sloaneShapeOf(browser), owner: r.owner, status: 'SAVED', browser: { name, ...browser } }, sharedWith: sharedWith ?? [], createdVia: 'UI' as const, executionId: null } };
  });
}

export { StaleVersionError };
