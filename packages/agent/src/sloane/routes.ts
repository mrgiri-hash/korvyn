import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadSloaneConfig } from './config.js';
import { createAdapter, type SloaneLLMAdapter } from './adapter.js';
import { LIMITS, SloaneOrchestrator } from './orchestrator.js';
import { SessionService, DEV_DIRECTORY, type ActorContext } from './auth.js';
import { WORK } from './store.js';
import { WorkApi, type ApiResult } from './workapi.js';

/**
 * Korvyn's server API. The browser talks to THIS; every request resolves its actor from the authenticated session
 * cookie (SessionService), never from anything the browser sends.
 *
 *   GET  /api/auth/me                       the signed-in actor (dev mode signs an anonymous caller in as KORVYN_DEV_USER)
 *   POST /api/auth/dev/switch               { userId } — dev mode, loopback callers only (simulates an IdP login)
 *
 *   GET  /api/sloane/health                 { available, mode, limits } — no provider or model named
 *   POST /api/sloane/turn                   { sessionId?, request } | { sessionId, clarification:{pendingId, optionId} }
 *   GET  /api/sloane/trace/:traceId         the server-side SloaneExecutionTrace — loopback callers only (dev)
 *   POST /api/sloane/action                 { sessionId, proposalId | planId, decision: confirm|cancel|edit|choose|refresh|regenerate, edits?, choice?, requestId }
 *                                           The ONLY route that executes a Korvyn action service. There is no overwrite: a stale
 *                                           proposal is refreshed, regenerated or cancelled.
 *   GET  /api/sloane/session/:id/activity   the session's action timeline and audit records (its owner only)
 *   GET  /api/sloane/investigations         the actor's durable investigations
 *   GET  /api/sloane/investigations/:id     one restorable investigation (owner or shared)
 *   POST /api/sloane/investigations/:id/resume   { sessionId } — continue it in a conversation
 *
 *   DOMAIN ACTIONS (no generic CRUD):
 *   GET  /api/work/reconciliations/:defId?period=          workflow, comments, support, evidence
 *   POST /api/work/reconciliations/:defId/comments         { text, idempotencyKey, expectedThreadVersion?, period? }
 *   GET  /api/work/flux/:account?period=                   GET /api/work/flux/line/:lineId?period=
 *   POST /api/work/flux/:account/comments                  { text, idempotencyKey, expectedThreadVersion?, period? }
 *   GET  /api/work/close?period=   GET /api/work/evidence?target=   GET /api/work/issues   GET /api/work/saved/:kind
 *
 * RETIRED: /interpret, /plan, /narrate answer 410.
 */
const cfg = loadSloaneConfig();
const adapter: SloaneLLMAdapter = createAdapter(cfg);
export const orchestrator = new SloaneOrchestrator(adapter, cfg);
export const sessions = new SessionService(WORK.repos);
const work = new WorkApi(orchestrator);
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
const reply = (res: ServerResponse, r: ApiResult) => send(res, r.status, r.body);

const loopback = (req: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
const actorView = (a: ActorContext) => ({ id: a.id, name: a.name, role: a.role, capabilities: a.permissions, entityAccess: a.entityAccess, authenticatedVia: a.authenticatedVia });
const DECISIONS = ['confirm', 'cancel', 'edit', 'choose', 'refresh', 'regenerate'];

/** the actor for this request, or a 401 already sent */
function authed(req: IncomingMessage, res: ServerResponse): ActorContext | null {
  const a = sessions.resolve(req, res);
  if (!a) send(res, 401, { error: 'UNAUTHENTICATED', reason: 'Sign in to Korvyn.' });
  return a;
}
/** a live conversation belongs to the user who started it */
function ownsSession(res: ServerResponse, actor: ActorContext, sessionId: string): boolean {
  const owner = orchestrator.sessionOwner(sessionId);
  if (owner && owner !== actor.id) { send(res, 403, { error: 'FORBIDDEN', reason: 'This conversation belongs to another user.' }); return false; }
  return true;
}

export const API_PREFIXES = ['/api/sloane/', '/api/auth/', '/api/work/'];

export async function handleSloane(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ?? '';
  if (!API_PREFIXES.some((p) => url.startsWith(p))) return false;
  const [path, qs] = [url.split('?')[0] ?? '', new URLSearchParams(url.split('?')[1] ?? '')];
  const period = qs.get('period') ?? undefined;

  /* ---- auth ------------------------------------------------------------------------------------- */
  if (path.startsWith('/api/auth/')) {
    const route = path.slice('/api/auth/'.length);
    if (req.method === 'GET' && route === 'me') { const a = authed(req, res); if (a) send(res, 200, { actor: actorView(a), mode: sessions.mode }); return true; }
    if (req.method === 'POST' && route === 'dev/switch') {
      if (sessions.mode !== 'dev' || !loopback(req)) { send(res, 404, { error: 'not found' }); return true; }
      const body = await readJson(req);
      const a = typeof body?.['userId'] === 'string' ? sessions.switchTo(req, res, body['userId']) : null;
      if (!a) { send(res, 400, { error: 'BAD_REQUEST', reason: 'unknown user', users: DEV_DIRECTORY.map((u) => ({ id: u.id, name: u.name, roles: u.roles })) }); return true; }
      send(res, 200, { actor: actorView(a) });
      return true;
    }
    send(res, 404, { error: 'unknown auth route' });
    return true;
  }

  /* ---- domain actions ----------------------------------------------------------------------------- */
  if (path.startsWith('/api/work/')) {
    const seg = path.slice('/api/work/'.length).split('/').map(decodeURIComponent);
    const actor = authed(req, res); if (!actor) return true;
    if (seg[0] === 'reconciliations' && seg[1]) {
      if (req.method === 'GET' && seg.length === 2) { reply(res, work.reconciliationWorkflow(actor, seg[1], period)); return true; }
      if (req.method === 'POST' && seg[2] === 'comments' && seg.length === 3) { const b = await readJson(req); if (!b) { send(res, 400, { error: 'invalid body' }); return true; } reply(res, work.addReconciliationComment(actor, seg[1], b)); return true; }
    }
    if (seg[0] === 'flux' && seg[1]) {
      if (req.method === 'GET' && seg[1] === 'line' && seg[2] && seg.length === 3) { reply(res, work.fluxLineComments(actor, seg[2], period)); return true; }
      if (req.method === 'GET' && seg.length === 2) { reply(res, work.fluxWorkflow(actor, seg[1], period)); return true; }
      if (req.method === 'POST' && seg[2] === 'comments' && seg.length === 3) { const b = await readJson(req); if (!b) { send(res, 400, { error: 'invalid body' }); return true; } reply(res, work.addFluxComment(actor, seg[1], b)); return true; }
    }
    if (req.method === 'GET' && seg[0] === 'close' && seg.length === 1) { reply(res, work.close(actor, period)); return true; }
    if (req.method === 'GET' && seg[0] === 'evidence' && seg.length === 1) { const t = qs.get('target'); if (!t) { send(res, 400, { error: 'target is required' }); return true; } reply(res, work.evidence(actor, t)); return true; }
    if (req.method === 'GET' && seg[0] === 'issues' && seg.length === 1) { reply(res, work.issues(actor)); return true; }
    if (req.method === 'GET' && seg[0] === 'saved' && seg[1] && seg.length === 2) { reply(res, work.savedObjects(actor, seg[1])); return true; }
    send(res, req.method === 'POST' || req.method === 'GET' ? 404 : 405, { error: 'unknown work route' });
    return true;
  }

  /* ---- sloane ----------------------------------------------------------------------------------- */
  const route = path.slice('/api/sloane/'.length);
  if (req.method === 'GET' && route === 'health') {
    send(res, 200, {
      available: adapter.provider !== 'mock', mode: orchestrator.mode, orchestration: 'server', auth: sessions.mode,
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
  const actor = authed(req, res); if (!actor) return true;

  if (req.method === 'POST' && route === 'action') {
    const body = await readJson(req);
    if (!body || typeof body['sessionId'] !== 'string' || !DECISIONS.includes(String(body['decision'])) || (typeof body['proposalId'] !== 'string' && typeof body['planId'] !== 'string')) { send(res, 400, { error: 'sessionId, decision and proposalId or planId are required' }); return true; }
    if (!ownsSession(res, actor, body['sessionId'])) return true;
    const edits = body['edits'] && typeof body['edits'] === 'object' ? Object.fromEntries(Object.entries(body['edits'] as Record<string, unknown>).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v).slice(0, 2000)])) : undefined;
    const out = orchestrator.decide({ sessionId: body['sessionId'], ...(typeof body['proposalId'] === 'string' ? { proposalId: body['proposalId'] } : {}), ...(typeof body['planId'] === 'string' ? { planId: body['planId'] } : {}),
      decision: body['decision'] as 'confirm', ...(edits ? { edits } : {}), ...(typeof body['choice'] === 'string' ? { choice: body['choice'] } : {}), ...(typeof body['requestId'] === 'string' ? { requestId: body['requestId'].slice(0, 80) } : {}) }, actor);
    send(res, 200, { ...out, timeline: orchestrator.timeline(body['sessionId']) });
    return true;
  }
  if (req.method === 'GET' && route.startsWith('session/') && route.endsWith('/activity')) {
    const sid = route.slice('session/'.length, -'/activity'.length);
    if (!ownsSession(res, actor, sid)) return true;
    send(res, 200, { timeline: orchestrator.timeline(sid), audit: orchestrator.auditOf(sid) });
    return true;
  }
  if (req.method === 'GET' && route === 'investigations') { send(res, 200, { investigations: orchestrator.listInvestigations(actor) }); return true; }
  if (route.startsWith('investigations/')) {
    const [id, verb] = route.slice('investigations/'.length).split('/');
    if (req.method === 'GET' && id && !verb) { const v = orchestrator.investigationView(id, actor); send(res, v ? 200 : 404, v ?? { error: 'NOT_FOUND' }); return true; }
    if (req.method === 'POST' && id && verb === 'resume') {
      const body = await readJson(req);
      const sid = typeof body?.['sessionId'] === 'string' ? body['sessionId'] : '';
      if (!ownsSession(res, actor, sid)) return true;
      const v = orchestrator.resumeInvestigation(id, sid, actor);
      send(res, v ? 200 : 404, v ? { sessionId: sid, ...v } : { error: 'NOT_FOUND' });
      return true;
    }
  }
  if (req.method === 'POST' && route === 'turn') {
    const body = await readJson(req);
    if (!body) { send(res, 400, { error: 'invalid or oversized request body' }); return true; }
    if (typeof body['sessionId'] === 'string' && !ownsSession(res, actor, body['sessionId'])) return true;
    const out = await orchestrator.turn({ sessionId: body['sessionId'], request: body['request'], clarification: body['clarification'] }, actor);
    send(res, 200, out);
    return true;
  }
  send(res, req.method === 'POST' || req.method === 'GET' ? 404 : 405, { error: 'unknown Sloane route' });
  return true;
}
