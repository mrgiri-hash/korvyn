import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadSloaneConfig } from './config.js';
import { createAdapter, type SloaneLLMAdapter } from './adapter.js';
import { LIMITS, SloaneOrchestrator } from './orchestrator.js';

/**
 * Korvyn's Sloane API. The browser talks to THIS, and this talks to the server-side orchestrator:
 *
 *   Browser -> /api/sloane/turn -> SloaneOrchestrator -> context · adapter · clarification · planner · tools
 *
 *   GET  /api/sloane/health            { available, mode, limits }            — no provider or model named
 *   POST /api/sloane/turn              { sessionId?, request } | { sessionId, clarification:{pendingId, optionId} }
 *                                      -> TurnResponse (state, objects, grounded narrative, clarification, context)
 *   GET  /api/sloane/trace/:traceId    the server-side SloaneExecutionTrace — loopback callers only (dev)
 *
 * RETIRED: /interpret, /plan, /narrate. They let the browser call reasoning stages and orchestrate the result
 * itself, which is exactly the authority this API exists to keep on the server. They answer 410.
 */
const cfg = loadSloaneConfig();
const adapter: SloaneLLMAdapter = createAdapter(cfg);
export const orchestrator = new SloaneOrchestrator(adapter, cfg);
const MAX_BODY = 16_000;

function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0, body = '';
    req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) { resolve(null); req.destroy(); } else body += c; });
    req.on('end', () => { try { const j = JSON.parse(body || '{}'); resolve(j && typeof j === 'object' && !Array.isArray(j) ? j : null); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const loopback = (req: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');

export async function handleSloane(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ?? '';
  if (!url.startsWith('/api/sloane/')) return false;
  const route = url.slice('/api/sloane/'.length).split('?')[0] ?? '';

  if (req.method === 'GET' && route === 'health') {
    send(res, 200, {
      available: adapter.provider !== 'mock',
      mode: orchestrator.mode,
      orchestration: 'server',
      configured: cfg.provider === 'mock' || cfg.credentialsPresent,
      limits: { maxToolCalls: LIMITS.maxToolCalls, wallClockMs: LIMITS.wallClockMs, timeoutMs: cfg.timeoutMs },
    });
    return true;
  }
  if (req.method === 'GET' && route.startsWith('trace/')) {
    if (!loopback(req) || process.env['SLOANE_DEV_TRACE'] === '0') { send(res, 404, { error: 'not found' }); return true; }
    const t = orchestrator.trace(route.slice('trace/'.length));
    send(res, t ? 200 : 404, t ?? { error: 'no such trace' });
    return true;
  }
  if (['interpret', 'plan', 'narrate'].includes(route)) {
    send(res, 410, { error: 'retired: Sloane orchestration runs on the server — use POST /api/sloane/turn' });
    return true;
  }
  if (req.method === 'POST' && route === 'turn') {
    const body = await readJson(req);
    if (!body) { send(res, 400, { error: 'invalid or oversized request body' }); return true; }
    const out = await orchestrator.turn({ sessionId: body['sessionId'], request: body['request'], clarification: body['clarification'] });
    send(res, 200, out);
    return true;
  }
  send(res, req.method === 'POST' || req.method === 'GET' ? 404 : 405, { error: 'unknown Sloane route' });
  return true;
}
