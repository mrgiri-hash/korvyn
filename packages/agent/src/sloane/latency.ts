/**
 * SLOANE CONVERSATION LATENCY HARNESS — runs the Phase 6 conversations against a LIVE Korvyn server and records, per
 * turn: total latency, time to first object (when the server streams), each model call (stage, route, latency, tokens),
 * tools executed, state, and the objects returned. Spends credits when the server runs a real provider.
 *
 *   BASE=http://localhost:8787 npx tsx src/sloane/latency.ts [label] [suite,...]
 *
 * Writes data/latency-<label>.json and prints medians, so a before / after comparison is two files.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const BASE = process.env['BASE'] ?? 'http://localhost:8787';
const label = process.argv[2] ?? 'run';
const only = (process.argv[3] ?? '').split(',').filter(Boolean);

export const SUITES: Record<string, string[]> = {
  basic: ['Show me June financials.', 'What moved the most?', 'By entity.', 'Now projects.', 'Only over $5M.', 'Show the GL.', 'Which of these are missing support?'],
  followup: ['Why did CIP increase in June?', 'By vendor.', 'Only over $5M.', 'Show the GL.', 'May vs June.'],
  correction: ['Show Siemens FY26 activity.', 'Compare it to last year.', 'No, South Valley only.'],
  artifact: ['Give me FY26 GL.', 'Add TB.', 'Add source vendor.', 'Put project before vendor.', 'Preview it.'],
  pbc: ['Give me FY26 CIP additions over $1M with invoices, POs and approvals.', 'Show what\'s missing.', 'Only items over $500K.', 'Add related reconciliations.'],
  gap: ['Add May 2026 to the header of the workbook.', 'Email this to the auditors.'],
  deictic: ['What is blocking June close?', 'Show the largest one.', 'Show the GL for it.'],
};

let cookie = '', csrf = '';
async function call(method: string, path: string, body?: unknown): Promise<{ status: number; body: J; firstByteMs: number; firstObjectMs: number | null; stages: J[] }> {
  const t0 = Date.now();
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Origin: BASE, ...(cookie ? { cookie } : {}), ...(csrf && method !== 'GET' ? { 'X-Korvyn-CSRF': csrf } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const sc = r.headers.get('set-cookie') ?? ''; if (sc) cookie = sc.split(';')[0]!;
  const firstByteMs = Date.now() - t0;
  const ct = r.headers.get('content-type') ?? '';
  /* the streaming route answers NDJSON: status events, objects, narrative, then the final response */
  if (ct.includes('ndjson')) {
    const text = await r.text();
    let firstObjectMs: number | null = null; const stages: J[] = []; let final: J = {};
    for (const line of text.split('\n').filter(Boolean)) { const ev = JSON.parse(line) as J; if (ev.type === 'object' && firstObjectMs === null) firstObjectMs = ev.atMs ?? null; if (ev.type === 'status') stages.push(ev); if (ev.type === 'final') final = ev.response; }
    return { status: r.status, body: final, firstByteMs, firstObjectMs, stages };
  }
  return { status: r.status, body: ct.includes('json') ? await r.json() as J : {}, firstByteMs, firstObjectMs: null, stages: [] };
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0; };

async function main() {
  const me = await call('GET', '/api/auth/me'); csrf = me.body['csrfToken'];
  const stream = process.env['STREAM'] === '1';
  const out: J[] = [];
  for (const [suite, turns] of Object.entries(SUITES)) {
    if (only.length && !only.includes(suite)) continue;
    const sid = `lat-${suite}-${Math.random().toString(36).slice(2, 10)}`;
    for (const [i, q] of turns.entries()) {
      const t0 = Date.now();
      const r = await call('POST', stream ? '/api/sloane/turn/stream' : '/api/sloane/turn', { sessionId: sid, request: q });
      const ms = Date.now() - t0;
      const b = r.body; let tr: J = {};
      if (b['traceId']) tr = (await call('GET', `/api/sloane/trace/${b['traceId']}`)).body;
      const calls = (tr['calls'] as J[] | undefined) ?? [];
      const row = {
        suite, turn: i + 1, request: q, ms, state: b['state'], firstObjectMs: r.firstObjectMs, firstStatusMs: r.stages[0]?.atMs ?? null,
        route: tr['route'] ?? null, shortcut: tr['shortcut'] ?? null,
        calls: calls.map((c) => ({ stage: c.stage, route: c.route ?? null, status: c.status, ms: c.latencyMs, in: c.usage?.inputTokens ?? 0, out: c.usage?.outputTokens ?? 0 })),
        tools: ((tr['toolsExecuted'] as J[] | undefined) ?? []).map((x) => `${x.tool}:${x.status}`),
        objects: ((b['objects'] as J[] | undefined) ?? []).map((o) => `${o.type}|${o.title}`.slice(0, 110)),
        narrative: ((b['narrative'] as J[] | undefined) ?? []).map((n) => n.text).join(' ').slice(0, 320),
        notes: (b['notes'] as string[] | undefined ?? []).slice(0, 3), clarification: b['clarification']?.question ?? null,
        context: b['context'] ? { object: b['context'].object?.value, period: b['context'].period?.value, scope: b['context'].scope?.value, focus: b['context'].focus?.value } : null,
      };
      out.push(row);
      console.log(`${suite}#${row.turn} ${String(ms).padStart(6)}ms ${String(row.state).padEnd(22)} ${row.calls.map((c) => `${c.stage}${c.route ? '@' + c.route : ''}:${c.ms}`).join(' ') || '(no model)'} | ${row.tools.join(', ')} | ${q}`);
      if (row.clarification) console.log(`      ? ${row.clarification}`);
      if (row.objects.length) console.log(`      = ${row.objects.slice(0, 3).join(' ;; ')}`);
      if (row.narrative) console.log(`      » ${row.narrative.slice(0, 220)}`);
      if (row.notes.length) console.log(`      ! ${row.notes.join(' | ').slice(0, 220)}`);
    }
  }
  const all = out.map((r) => r.ms), first = out.filter((r) => r.turn === 1).map((r) => r.ms), follow = out.filter((r) => r.turn > 1).map((r) => r.ms);
  const summary = { label, turns: out.length, medianMs: median(all), medianFirstTurnMs: median(first), medianFollowUpMs: median(follow), maxMs: Math.max(...all),
    medianFirstObjectMs: median(out.map((r) => r.firstObjectMs).filter((x): x is number => x !== null)),
    modelCallsPerTurn: +(out.reduce((s, r) => s + r.calls.length, 0) / out.length).toFixed(2), toolCallsPerTurn: +(out.reduce((s, r) => s + r.tools.length, 0) / out.length).toFixed(2),
    tokensPerTurn: Math.round(out.reduce((s, r) => s + r.calls.reduce((t: number, c: J) => t + c.in + c.out, 0), 0) / out.length) };
  console.log('\nSUMMARY', JSON.stringify(summary));
  mkdirSync(new URL('../../data/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`../../data/latency-${label}.json`, import.meta.url), JSON.stringify({ summary, turns: out }, null, 1));
}
void main();
