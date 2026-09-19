/**
 * TIME INTELLIGENCE (Phase 8A) — a period word resolves against the TENANT FISCAL CALENDAR and the governed periods,
 * never against a guess. The model is never asked where a quarter starts or which year "June" means: every boundary
 * here comes from `TENANT_CALENDAR.fiscalYearStartMonth` and the ledger's own governed months.
 *
 * A resolution says what it resolved to AND how much of it is governed: FY26 is Jan–Dec 2026 by the calendar, and only
 * Jan–Jun of it is in the ledger. "Prior year" and "prior forecast" resolve to what they mean and say plainly that the
 * governed book does not hold them — they are never quietly substituted with something that is held.
 */
import { periodLabel } from '../financials.js';
import { TENANT_CALENDAR } from '../agent/ambiguity.js';

export type PeriodKind = 'MONTH' | 'QUARTER' | 'YTD' | 'FISCAL_YEAR' | 'CLOSE_PERIOD' | 'PRIOR_YEAR' | 'PLANNING';
export type PeriodStatus = 'GOVERNED' | 'PARTIAL' | 'NOT_GOVERNED' | 'AMBIGUOUS';
export interface PeriodCandidate { id: string; label: string; detail: string }
export interface PeriodResolution {
  term: string; kind: PeriodKind; label: string;
  start: string | null; end: string | null;
  /** every month the calendar puts in the window, and the ones the ledger holds */
  months: string[]; governedMonths: string[];
  status: PeriodStatus; candidates: PeriodCandidate[]; note: string;
}
export interface TimeDeps { periods: string[]; workingPeriod: string }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FULL_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const idx = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1;
const fromIdx = (i: number) => ym(Math.floor(i / 12), (i % 12) + 1);
const span = (a: string, b: string) => { const out: string[] = []; for (let i = idx(a); i <= idx(b); i++) out.push(fromIdx(i)); return out; };

/* ---- the calendar: every boundary is derived from the fiscal-year start month ------------------------ */
const fyStartMonth = () => TENANT_CALENDAR.fiscalYearStartMonth;
/** a fiscal year is named for the calendar year it ENDS in */
export function fiscalYearOf(p: string): number { const m = Number(p.slice(5, 7)), y = Number(p.slice(0, 4)); return fyStartMonth() === 1 ? y : m >= fyStartMonth() ? y + 1 : y; }
export function fiscalYearRange(fy: number) { const s = fyStartMonth() === 1 ? ym(fy, 1) : ym(fy - 1, fyStartMonth()); return { start: s, end: fromIdx(idx(s) + 11) }; }
export function fiscalQuarterOf(p: string) { const fy = fiscalYearOf(p), q = Math.floor((idx(p) - idx(fiscalYearRange(fy).start)) / 3) + 1; return { fy, q }; }
export function fiscalQuarterRange(fy: number, q: number) { const s = idx(fiscalYearRange(fy).start) + (q - 1) * 3; return { start: fromIdx(s), end: fromIdx(s + 2) }; }
export const fyLabel = (fy: number) => `FY${String(fy).slice(2)}`;
export const quarterLabel = (fy: number, q: number) => `Q${q} ${fyLabel(fy)}`;

function make(term: string, kind: PeriodKind, label: string, start: string, end: string, d: TimeDeps, note = ''): PeriodResolution {
  const months = span(start, end), governed = months.filter((m) => d.periods.includes(m));
  const status: PeriodStatus = governed.length === months.length ? 'GOVERNED' : governed.length ? 'PARTIAL' : 'NOT_GOVERNED';
  const auto = status === 'PARTIAL' ? `${label} runs ${periodLabel(start)}–${periodLabel(end)}; the ledger holds ${periodLabel(governed[0]!)}–${periodLabel(governed.at(-1)!)} of it.`
    : status === 'NOT_GOVERNED' ? `${label} (${periodLabel(start)}–${periodLabel(end)}) is not in the governed ledger; the governed months are ${periodLabel(d.periods[0]!)}–${periodLabel(d.periods.at(-1)!)}.` : '';
  return { term, kind, label, start, end, months, governedMonths: governed, status, candidates: [], note: [note, auto].filter(Boolean).join(' ') };
}

/** Every period expression in the words, resolved. An empty list means the words name no period. */
export function resolvePeriods(text: string, d: TimeDeps): PeriodResolution[] {
  const t = ` ${text.toLowerCase()} `, out: PeriodResolution[] = [];
  const wp = d.workingPeriod, fyNow = fiscalYearOf(wp), { q: qNow } = fiscalQuarterOf(wp);
  const taken: [number, number][] = [];
  const claim = (m: RegExpMatchArray) => { const a = m.index!, b = a + m[0].length; if (taken.some(([x, y]) => a < y && b > x)) return false; taken.push([a, b]); return true; };
  const each = (re: RegExp, f: (m: RegExpMatchArray) => void) => { for (const m of t.matchAll(re)) if (claim(m)) f(m); };

  /* planning versions are periods of a plan, not of the ledger */
  each(/\b(prior|previous|last) forecast\b|\b(budget|forecast|reforecast)\b/g, (m) => {
    out.push({ term: m[0].trim(), kind: 'PLANNING', label: cap(m[0].trim()), start: null, end: null, months: [], governedMonths: [], status: 'NOT_GOVERNED', candidates: [],
      note: 'Planning versions (budget, forecast, scenario) are not held in the governed ledger on this server; only actuals are.' });
  });
  each(/\b(the |current |this )?close period\b|\bthe (current )?close\b/g, (m) => out.push(make(m[0].trim(), 'CLOSE_PERIOD', `${periodLabel(wp)} close`, wp, wp, d, 'The close period is the period the book is open in.')));
  each(/\b(current|this) month\b/g, (m) => out.push(make(m[0].trim(), 'MONTH', periodLabel(wp), wp, wp, d)));
  each(/\b(last|prior|previous) month\b/g, (m) => { const p = fromIdx(idx(wp) - 1); out.push(make(m[0].trim(), 'MONTH', periodLabel(p), p, p, d)); });
  each(/\b(ytd|year[- ]to[- ]date)\b/g, (m) => out.push(make(m[0].trim(), 'YTD', `YTD ${periodLabel(wp)}`, fiscalYearRange(fyNow).start, wp, d)));
  each(/\b(prior|previous|last) (fiscal )?year\b|\bpy\b/g, (m) => { const r = fiscalYearRange(fyNow - 1); out.push({ ...make(m[0].trim(), 'PRIOR_YEAR', fyLabel(fyNow - 1), r.start, r.end, d), kind: 'PRIOR_YEAR' }); });
  each(/\bfy\s?'?(20)?(\d{2})\b|\bfiscal (year )?(20\d\d)\b/g, (m) => { const fy = m[4] ? Number(m[4]) : 2000 + Number(m[2]); const r = fiscalYearRange(fy); out.push(make(m[0].trim(), 'FISCAL_YEAR', fyLabel(fy), r.start, r.end, d)); });
  each(/\b(last|previous|prior) quarter\b/g, (m) => {
    const prev = qNow === 1 ? { fy: fyNow - 1, q: 4 } : { fy: fyNow, q: qNow - 1 };
    const closing = fiscalQuarterRange(fyNow, qNow).end === wp;
    if (TENANT_CALENDAR.relativePeriods === 'ASK_WHEN_OPEN' && closing) {
      const a = fiscalQuarterRange(prev.fy, prev.q), b = fiscalQuarterRange(fyNow, qNow);
      out.push({ term: m[0].trim(), kind: 'QUARTER', label: 'Quarter to confirm', start: null, end: null, months: [], governedMonths: [], status: 'AMBIGUOUS',
        candidates: [{ id: `quarter:${prev.fy}-Q${prev.q}`, label: quarterLabel(prev.fy, prev.q), detail: `${periodLabel(a.start)}–${periodLabel(a.end)} · last completed quarter` },
          { id: `quarter:${fyNow}-Q${qNow}`, label: quarterLabel(fyNow, qNow), detail: `${periodLabel(b.start)}–${periodLabel(b.end)} · closing now` }],
        note: `${periodLabel(wp)} is still open, so "last quarter" could be the quarter closing now or the last completed one; the tenant calendar asks in that case.` });
      return;
    }
    const pick = TENANT_CALENDAR.relativePeriods === 'CURRENT' && closing ? { fy: fyNow, q: qNow } : prev, r = fiscalQuarterRange(pick.fy, pick.q);
    out.push(make(m[0].trim(), 'QUARTER', quarterLabel(pick.fy, pick.q), r.start, r.end, d));
  });
  each(/\b(this|current|the) quarter\b|\bqtd\b/g, (m) => { const r = fiscalQuarterRange(fyNow, qNow); out.push(make(m[0].trim(), 'QUARTER', quarterLabel(fyNow, qNow), r.start, m[0].includes('qtd') ? wp : r.end, d)); });
  /* a bare "quarter" is the current fiscal quarter, stated as such */
  each(/\bquarter(ly)?\b/g, (m) => { const r = fiscalQuarterRange(fyNow, qNow); out.push(make(m[0].trim(), 'QUARTER', quarterLabel(fyNow, qNow), r.start, r.end, d, 'No quarter was named, so this is the current fiscal quarter.')); });
  each(/\bq([1-4])(?:\s*(?:fy)?\s?'?(20)?(\d{2}))?\b/g, (m) => { const fy = m[3] ? 2000 + Number(m[3]) : fyNow, q = Number(m[1]), r = fiscalQuarterRange(fy, q); out.push(make(m[0].trim(), 'QUARTER', quarterLabel(fy, q), r.start, r.end, d)); });
  each(/\b(20\d\d)-(0[1-9]|1[0-2])\b/g, (m) => { const p = `${m[1]}-${m[2]}`; out.push(make(m[0].trim(), 'MONTH', periodLabel(p), p, p, d)); });
  /* a year is four digits, or two after a hyphen or apostrophe ("Jun-26", "June '26") — never "June 30" */
  each(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:[\s,]+(20\d\d)\b|-'?(\d{2})\b|\s'(\d{2})\b)?/g, (m) => {
    const yy = m[2] ? Number(m[2]) : m[3] ? 2000 + Number(m[3]) : m[4] ? 2000 + Number(m[4]) : null;
    if (m[1] === 'may' && !yy && /\bmay (i|we|you|be|have|not|need)\b/.test(t)) return; /* "may" the verb */
    const mi = MONTHS.indexOf(m[1]!) + 1;
    /* "decide", "market", "junior" are not months: the word must be the month's name or a prefix of it */
    if (!FULL_MONTHS[mi - 1]!.startsWith(m[0].match(/^[a-z]+/)![0])) return;
    if (yy) { const p = ym(yy, mi); out.push(make(m[0].trim(), 'MONTH', periodLabel(p), p, p, d)); return; }
    /* a bare month is the one in the working fiscal year — never silently moved to another year */
    const r = fiscalYearRange(fyNow), p = span(r.start, r.end).find((x) => Number(x.slice(5, 7)) === mi)!;
    out.push(make(m[0].trim(), 'MONTH', periodLabel(p), p, p, d, idx(p) > idx(wp) ? `${periodLabel(p)} is after the open period (${periodLabel(wp)}); nothing is posted there yet.` : ''));
  });
  return out;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The fiscal structure around a period, for context and for the graph's time nodes. */
export function fiscalFrame(p: string, d: TimeDeps) {
  const fy = fiscalYearOf(p), { q } = fiscalQuarterOf(p), fr = fiscalYearRange(fy), qr = fiscalQuarterRange(fy, q);
  return {
    period: p, label: periodLabel(p), fiscalYear: fyLabel(fy), fiscalYearRange: fr, quarter: quarterLabel(fy, q), quarterRange: qr,
    ytd: { start: fr.start, end: p }, priorPeriod: d.periods.includes(fromIdx(idx(p) - 1)) ? fromIdx(idx(p) - 1) : null,
    isQuarterEnd: qr.end === p, isYearEnd: fr.end === p, closePeriod: d.workingPeriod, status: p === d.workingPeriod ? 'OPEN' : d.periods.includes(p) ? (idx(p) < idx(d.workingPeriod) ? 'CLOSED' : 'NOT_OPEN') : 'NOT_GOVERNED',
    calendar: { fiscalYearStartMonth: fyStartMonth(), relativePeriods: TENANT_CALENDAR.relativePeriods },
  };
}
