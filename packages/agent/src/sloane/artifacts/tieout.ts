/**
 * THE ERP TIE-OUT — does the Korvyn governed trial balance agree with what the source ERPs hold?
 *
 * Two independent paths over the same period and scope:
 *   SOURCE   every posting the ERPs hold: @korvyn/core's entries read RAW (not through the governed ledger's index)
 *            plus every source-feed posting, SYNCED OR NOT;
 *   GOVERNED the governed ledger's lines — what Korvyn's populations, balances and artifacts are built from.
 * Both translate the same way (balance-sheet accounts at the period-end closing set, income-statement accounts at the
 * monthly average set) and eliminate the same way, so a difference can only mean the two populations differ — a posting
 * the ERP holds that has not reached Korvyn, or the reverse. That is exactly the failure a tie-out exists to catch.
 *
 * The bridge from source to final governed balance is stated per account: Source ERP TB → FX / translation →
 * eliminations → reporting adjustments → final governed balance, compared with Korvyn's governed TB.
 * Status is never optimistic: a difference is NOT_TIED; a source that cannot be reached, or a stale extract, makes the
 * result PARTIALLY_VALIDATED (or SOURCE_UNAVAILABLE when nothing could be validated).
 */
import { createHash } from 'node:crypto';
import { FX_RATE_SET, type FinancialDataService, SNAPSHOT_ID } from '../financials.js';
import { FX_CLOSING_SET, type GovernedLedger, SOURCE_HEALTH } from '../governed.js';
import { sourcePostings } from '../sourcefeed.js';

export type TieStatus = 'TIED' | 'NOT_TIED' | 'PARTIALLY_VALIDATED' | 'SOURCE_UNAVAILABLE';
export const MAPPING_VERSION = 'CORE-COA-1';
const TOL = 0.005;

export interface TieAccountRow { account: string; name: string; section: string; source: number; fx: number; elim: number; adj: number; final: number; governed: number; difference: number; synthetic?: boolean }
export interface TieSourceSection {
  connector: string; system: string; instance: string; sourceStatus: 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';
  entities: { id: string; name: string; currency: string; localDebits: number; localCredits: number; balanced: boolean }[];
  sourceDebitsUsd: number; sourceCreditsUsd: number; governedDebitsUsd: number; governedCreditsUsd: number; differenceUsd: number;
  result: 'TIED' | 'NOT_TIED' | 'VALIDATED_AGAINST_STALE_EXTRACT' | 'SOURCE_UNAVAILABLE'; note: string;
}
export interface TieOutResult {
  status: TieStatus; differenceUsd: number; periodEnd: string; scopeId: string; entityIds: string[]; currency: 'USD';
  sources: TieSourceSection[];
  bridge: { sourceNet: number; fxTranslation: number; eliminations: number; eliminationDifference: number; reportingAdjustments: number; finalDebits: number; finalCredits: number; governedDebits: number; governedCredits: number; difference: number };
  accounts: TieAccountRow[];
  dataVersion: string; sourceDataVersion: string; mappingVersion: string; fxRateSets: string[]; unsyncedPostings: number;
  warnings: string[]; computedAt: string;
}

interface Leg { entity: string; account: string; period: string; local: number; currency: string; ic: boolean; connector: string }

export class TieOutService {
  constructor(private readonly data: FinancialDataService, private readonly gl: GovernedLedger) {}

  /** the source ERP data version: the core snapshot plus every posting the ERPs hold, synced or not */
  sourceDataVersion() {
    const ids = sourcePostings().map((p) => p.id);
    return ids.length ? `${SNAPSHOT_ID}+${ids.length}.${createHash('sha1').update(ids.join('|')).digest('hex').slice(0, 8).toUpperCase()}` : SNAPSHOT_ID;
  }

  private sourceLegs(entityIds: Set<string>, end: string): Leg[] {
    const ents = new Map(this.gl.entities().map((e) => [e.id, e]));
    const out: Leg[] = [];
    for (const e of this.data.gl.entries) {
      const period = e.periodId as string;
      if (period > end) continue;
      for (const l of e.lines) {
        const ent = l.entityId as string;
        if (!entityIds.has(ent)) continue;
        out.push({ entity: ent, account: l.accountId as string, period, local: Number(l.amount.amountMinor) / 10 ** l.amount.scale, currency: l.amount.currency as string, ic: /^Intercompany/i.test(e.description), connector: ents.get(ent)!.connector });
      }
    }
    for (const p of sourcePostings()) {
      if (p.period > end || !entityIds.has(p.entity)) continue;
      const ent = ents.get(p.entity)!;
      for (const l of p.lines) out.push({ entity: p.entity, account: l.account, period: p.period, local: l.local, currency: ent.currency, ic: /^Intercompany/i.test(p.description), connector: ent.connector });
    }
    return out;
  }
  private governedLegs(entityIds: Set<string>, end: string): Leg[] {
    return this.gl.lines.filter((l) => l.period <= end && entityIds.has(l.entity)).map((l) => ({ entity: l.entity, account: l.account, period: l.period, local: l.local, currency: l.currency, ic: /^Intercompany/i.test(l.description), connector: l.connector }));
  }
  /** balance-sheet accounts at the closing rate of the period end; income-statement accounts at each month's average */
  private usd(l: Leg, end: string): number {
    const a = this.gl.account(l.account);
    const r = a?.section === 'INCOME_STATEMENT' ? FX_RATE_SET.toUsd[l.currency]?.[l.period] : FX_CLOSING_SET.toUsd[l.currency]?.[end];
    if (r === undefined) throw new Error(`no rate for ${l.currency} ${l.period}`);
    return l.local * r;
  }
  /** intercompany balances and flows are eliminated only when the scope holds both sides (the consolidated group) */
  private eliminates(l: Leg, group: boolean) {
    if (!group || !l.ic) return false;
    const a = this.gl.account(l.account);
    return a?.section === 'INCOME_STATEMENT' || l.account === '13100' || l.account === '23100';
  }

  /** Korvyn's governed trial balance through a period end, USD — consolidated (eliminated, with the derived CTA) or by
   *  entity (each entity's translated balances, then the eliminations and the CTA as their own rows so the sheet foots). */
  governedTrialBalance(scopeId: string, periodEnd: string, byEntity: boolean) {
    const scope = this.data.scope(scopeId)!;
    const group = scope.kind === 'GROUP';
    const legs = this.governedLegs(new Set(scope.entityIds), periodEnd);
    const rows: { entity: string | null; account: string; name: string; group: string; section: string; net: number }[] = [];
    const key = (e: string | null, a: string) => `${e ?? ''}|${a}`;
    const m = new Map<string, number>(), elim = new Map<string, number>();
    let total = 0, elimTotal = 0;
    for (const l of legs) {
      const v = this.usd(l, periodEnd);
      m.set(key(byEntity ? l.entity : null, l.account), (m.get(key(byEntity ? l.entity : null, l.account)) ?? 0) + v); total += v;
      if (this.eliminates(l, group)) { elim.set(l.account, (elim.get(l.account) ?? 0) - v); elimTotal -= v; }
    }
    const info = (a: string) => { const x = this.gl.account(a); const g = x?.parent ?? a; return { name: x?.name ?? a, group: `${g} ${this.gl.account(g)?.name ?? ''}`.trim(), section: x?.section === 'INCOME_STATEMENT' ? 'Income statement' : 'Balance sheet' }; };
    for (const [k, v] of [...m.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const [e, a] = k.split('|') as [string, string];
      const net = byEntity ? v : v + (elim.get(a) ?? 0);
      if (Math.abs(net) >= TOL) rows.push({ entity: byEntity ? e : null, account: a, ...info(a), net });
    }
    if (byEntity) for (const [a, v] of [...elim.entries()].sort(([x], [y]) => x.localeCompare(y))) if (Math.abs(v) >= TOL) rows.push({ entity: 'ELIMINATIONS', account: a, ...info(a), net: v });
    if (Math.abs(total) >= TOL) rows.push({ entity: byEntity ? 'TRANSLATION' : null, account: 'CTA', name: 'Cumulative translation adjustment (derived)', group: 'Equity (derived)', section: 'Balance sheet', net: -total });
    if (group && Math.abs(elimTotal) >= TOL) rows.push({ entity: byEntity ? 'ELIMINATIONS' : null, account: 'ICDIFF', name: 'Intercompany elimination difference (unmatched)', group: 'Eliminations (derived)', section: 'Balance sheet', net: -elimTotal });
    return rows;
  }

  tieOut(scopeId: string, periodEnd: string): TieOutResult {
    const scope = this.data.scope(scopeId);
    if (!scope) throw new Error(`unknown scope ${scopeId}`);
    const group = scope.kind === 'GROUP';
    const ids = new Set(scope.entityIds);
    const src = this.sourceLegs(ids, periodEnd), gov = this.governedLegs(ids, periodEnd);
    const acc = (legs: Leg[]) => {
      const pre = new Map<string, number>(), elim = new Map<string, number>();
      for (const l of legs) {
        const v = this.usd(l, periodEnd);
        pre.set(l.account, (pre.get(l.account) ?? 0) + v);
        if (this.eliminates(l, group)) elim.set(l.account, (elim.get(l.account) ?? 0) - v);
      }
      return { pre, elim };
    };
    const S = acc(src), G = acc(gov);
    const codes = [...new Set([...S.pre.keys(), ...G.pre.keys()])].sort();
    const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
    const rows: TieAccountRow[] = [];
    for (const code of codes) {
      const a = this.gl.account(code);
      const s = S.pre.get(code) ?? 0, e = S.elim.get(code) ?? 0, g = (G.pre.get(code) ?? 0) + (G.elim.get(code) ?? 0);
      const final = s + e;
      rows.push({ account: code, name: a?.name ?? code, section: a?.section ?? '', source: s, fx: 0, elim: e, adj: 0, final, governed: g, difference: final - g });
    }
    /* the two derived balancing lines: translation (CTA) and any intercompany that does not eliminate to zero */
    const fxS = -sum(S.pre), fxG = -sum(G.pre), edS = -sum(S.elim), edG = -sum(G.elim);
    if (Math.abs(fxS) >= TOL || Math.abs(fxG) >= TOL) rows.push({ account: 'CTA', name: 'Cumulative translation adjustment (derived)', section: 'BALANCE_SHEET', source: 0, fx: fxS, elim: 0, adj: 0, final: fxS, governed: fxG, difference: fxS - fxG, synthetic: true });
    if (group && (Math.abs(edS) >= TOL || Math.abs(edG) >= TOL)) rows.push({ account: 'ICDIFF', name: 'Intercompany elimination difference (unmatched)', section: 'BALANCE_SHEET', source: 0, fx: 0, elim: edS, adj: 0, final: edS, governed: edG, difference: edS - edG, synthetic: true });

    /* per source system: the ERP's own TB against the governed population for the same entities */
    const sources: TieSourceSection[] = [];
    for (const conn of [...new Set(scope.entityIds.map((id) => this.gl.entities().find((e) => e.id === id)!.connector))]) {
      const h = SOURCE_HEALTH[conn] ?? { system: conn, instance: 'unknown', status: 'UNAVAILABLE' as const, note: 'Unknown connector.' };
      const ents = this.gl.entities().filter((e) => ids.has(e.id) && e.connector === conn);
      const eIds = new Set(ents.map((e) => e.id));
      const dc = (legs: Leg[]) => {
        const byA = new Map<string, number>();
        for (const l of legs) if (eIds.has(l.entity)) byA.set(`${l.entity}|${l.account}`, (byA.get(`${l.entity}|${l.account}`) ?? 0) + this.usd(l, periodEnd));
        return byA;
      };
      const sA = dc(src), gA = dc(gov);
      const dr = (m: Map<string, number>) => [...m.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0), cr = (m: Map<string, number>) => -[...m.values()].filter((v) => v < 0).reduce((s, v) => s + v, 0);
      const diff = [...new Set([...sA.keys(), ...gA.keys()])].reduce((s, k) => s + Math.abs((sA.get(k) ?? 0) - (gA.get(k) ?? 0)), 0);
      const local = ents.map((e) => {
        const legs = src.filter((l) => l.entity === e.id);
        const byA = new Map<string, number>(); for (const l of legs) byA.set(l.account, (byA.get(l.account) ?? 0) + l.local);
        const d = [...byA.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0), c = -[...byA.values()].filter((v) => v < 0).reduce((s, v) => s + v, 0);
        return { id: e.id, name: e.name, currency: e.currency, localDebits: d, localCredits: c, balanced: Math.abs(d - c) < TOL };
      });
      const tied = diff < TOL;
      const result: TieSourceSection['result'] = !tied ? 'NOT_TIED' : h.status === 'AVAILABLE' ? 'TIED' : h.status === 'STALE' ? 'VALIDATED_AGAINST_STALE_EXTRACT' : 'SOURCE_UNAVAILABLE';
      sources.push({ connector: conn, system: h.system, instance: h.instance, sourceStatus: h.status, entities: local, sourceDebitsUsd: dr(sA), sourceCreditsUsd: cr(sA), governedDebitsUsd: dr(gA), governedCreditsUsd: cr(gA), differenceUsd: diff, result,
        note: !tied ? 'The ERP holds postings the governed ledger does not (or the reverse).' : h.status === 'AVAILABLE' ? 'Source TB agrees with the governed population.' : h.status === 'STALE' ? `Agrees with the last extract, which is older than the freshness policy. ${h.note}` : `Compared with the last extract held; the live source cannot be reached. ${h.note}` });
    }

    const finalMap = rows.map((r) => r.final), govMap = rows.map((r) => r.governed);
    const dr = (vs: number[]) => vs.filter((v) => v > 0).reduce((s, v) => s + v, 0), cr = (vs: number[]) => -vs.filter((v) => v < 0).reduce((s, v) => s + v, 0);
    const difference = rows.reduce((s, r) => s + Math.abs(r.difference), 0);
    const anyNotTied = difference >= TOL || sources.some((s) => s.result === 'NOT_TIED');
    const validated = sources.filter((s) => s.result === 'TIED').length;
    const status: TieStatus = anyNotTied ? 'NOT_TIED' : validated === sources.length ? 'TIED' : validated === 0 && sources.every((s) => s.result === 'SOURCE_UNAVAILABLE') ? 'SOURCE_UNAVAILABLE' : 'PARTIALLY_VALIDATED';
    const unsynced = sourcePostings().filter((p) => !p.synced && ids.has(p.entity) && p.period <= periodEnd).length;
    const warnings = [
      ...sources.filter((s) => s.result !== 'TIED').map((s) => `${s.system} (${s.instance}): ${s.note}`),
      ...(unsynced ? [`${unsynced} ERP posting${unsynced > 1 ? 's have' : ' has'} not synced into the governed ledger.`] : []),
      'No reporting adjustments are approved in the server book for this scope.',
    ];
    return {
      status, differenceUsd: difference, periodEnd, scopeId, entityIds: scope.entityIds, currency: 'USD', sources,
      bridge: { sourceNet: sum(S.pre), fxTranslation: fxS, eliminations: sum(S.elim), eliminationDifference: group ? edS : 0, reportingAdjustments: 0, finalDebits: dr(finalMap), finalCredits: cr(finalMap), governedDebits: dr(govMap), governedCredits: cr(govMap), difference },
      accounts: rows, dataVersion: this.gl.dataVersion(), sourceDataVersion: this.sourceDataVersion(), mappingVersion: MAPPING_VERSION,
      fxRateSets: [FX_CLOSING_SET.id, FX_RATE_SET.id], unsyncedPostings: unsynced, warnings, computedAt: new Date().toISOString(),
    };
  }
}
