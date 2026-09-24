/**
 * THE SOURCE FEED — ERP postings that arrive after the core snapshot, held durably and replayed on start.
 *
 * Two facts per posting, deliberately separate:
 *   - it is IN THE ERP from the moment it posts (the source TB a tie-out compares against sees it);
 *   - it is IN THE GOVERNED LEDGER only once it has SYNCED (every population, balance and artifact sees it then).
 * A posting that has not synced is the realistic way an ERP tie-out fails, and it is how the prototype demonstrates
 * NOT_TIED and a STALE artifact without inventing a difference.
 *
 * This is prototype scaffolding for a connector: `postSource` is reachable only through a development route
 * (loopback, dev auth mode) and through tests. Nothing here is reachable from Sloane.
 */
import { WORK } from './store.js';
import type { GovernedLedger, SourcePosting } from './governed.js';

const KIND = 'SOURCE_POSTING';
type Body = Omit<SourcePosting, 'id'>;

export function sourcePostings(): SourcePosting[] {
  return WORK.repos.records.list<Body>(KIND).map((r) => ({ id: r.id, entity: r.entity, period: r.period, postingDate: r.postingDate, description: r.description, lines: r.lines, synced: r.synced, postedBy: r.postedBy, postedAt: r.postedAt }));
}
/** on start: every synced posting is part of the governed population again */
export function replaySourceFeed(gl: GovernedLedger) { for (const p of sourcePostings()) gl.applyPosting(p); }

export function postSource(gl: GovernedLedger, p: { entity: string; period: string; description: string; lines: SourcePosting['lines']; synced: boolean }, by: string): SourcePosting {
  const net = p.lines.reduce((s, l) => s + l.local, 0);
  if (Math.abs(net) > 0.005) throw new Error('a source posting must balance (debits = credits)');
  if (!gl.entities().some((e) => e.id === p.entity)) throw new Error(`unknown entity ${p.entity}`);
  if (!gl.periods().includes(p.period)) throw new Error(`${p.period} is not a governed period`);
  for (const l of p.lines) if (!gl.account(l.account)?.postable) throw new Error(`${l.account} is not a postable account`);
  const body: Body = { entity: p.entity, period: p.period, postingDate: `${p.period}-28`, description: p.description, lines: p.lines, synced: p.synced, postedBy: by, postedAt: new Date().toISOString() };
  const rec = WORK.repos.records.insert<Body>(KIND, body, by, { prefix: 'ERPJE', status: p.synced ? 'SYNCED' : 'IN_ERP_ONLY', period: p.period, scope: p.entity });
  const out = { ...body, id: rec.id };
  if (out.synced) gl.applyPosting(out);
  return out;
}
/** a connector sync: every posting still only in the ERP reaches the governed ledger */
export function syncSourceFeed(gl: GovernedLedger, by: string): number {
  let n = 0;
  for (const r of WORK.repos.records.list<Body>(KIND).filter((x) => !x.synced)) {
    const u = WORK.repos.records.update<Body>(KIND, r.id, null, by, (o) => ({ entity: o.entity, period: o.period, postingDate: o.postingDate, description: o.description, lines: o.lines, synced: true, postedBy: o.postedBy, postedAt: o.postedAt }), { status: 'SYNCED' });
    if (gl.applyPosting({ ...u, id: u.id } as SourcePosting)) n++;
  }
  return n;
}
