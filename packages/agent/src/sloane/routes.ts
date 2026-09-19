import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { loadSloaneConfig } from './config.js';
import { createAdapter, type SloaneLLMAdapter } from './adapter.js';
import { LIMITS, SloaneOrchestrator } from './orchestrator.js';
import { AuthContext, DevIdentityProvider, DevSessionAuthProvider, DEV_DIRECTORY, type ActorContext, type AuthResolution } from './auth.js';
import { WORK } from './store.js';
import { HTTP_OF, WorkApi, type ApiResult, type Outcome } from './workapi.js';

/**
 * Korvyn's server API. The browser talks to THIS. Every request resolves its actor through AuthContext
 * (AuthProvider -> AuthenticatedSession -> ActorContext); nothing the browser sends names a user, role or capability.
 *
 * REQUEST PROTECTION (3D)
 *   - Every state-changing request (anything but GET/HEAD/OPTIONS) must carry the session's synchronizer token in
 *     `X-Korvyn-CSRF` (timing-safe compare), AND its Origin (or Referer) must be this server's own origin or an origin
 *     listed in KORVYN_ALLOWED_ORIGINS. The token is read from GET /api/auth/me by same-origin script only.
 *   - The session cookie is HttpOnly, SameSite=Strict, Max-Age bound, Secure over HTTPS; sessions expire server-side
 *     and POST /api/auth/logout revokes one.
 *   - CORS: no Access-Control-Allow-Origin at all unless the caller's Origin is in KORVYN_ALLOWED_ORIGINS; never '*'.
 *   - Errors: every response carries `outcome` (SUCCESS · VALIDATION_ERROR · PERMISSION_DENIED · STALE_VERSION ·
 *     CONFLICT · NOT_FOUND · UNAVAILABLE). An unexpected failure is UNAVAILABLE with a request id; the detail is logged
 *     server-side and never sent.
 *
 *   GET  /api/auth/me                        the signed-in actor and the CSRF token for this session
 *   POST /api/auth/logout                    revoke this session
 *   POST /api/auth/dev/switch                { userId } — dev mode, loopback only (simulates an IdP login)
 *
 *   GET  /api/sloane/health · POST /api/sloane/turn · POST /api/sloane/action · GET /api/sloane/trace/:id (loopback)
 *   GET  /api/sloane/investigations[/:id] · POST /api/sloane/investigations/:id/resume · GET /api/sloane/session/:id/activity
 *   Phase 7 agent runs: GET|POST /api/sloane/agent/runs · GET /api/sloane/agent/runs/:id (?trace=1 loopback)
 *   POST …/:id/intervene {text} · …/:id/pause · …/:id/resume · …/:id/cancel · …/:id/checkpoints/:cpId {decision}
 *
 *   ONE-BOOK DOMAIN ACTIONS (no generic CRUD):
 *   GET  /api/work/reconciliations/:id                 POST …/:id/comments · POST …/:id/support
 *   GET  /api/work/flux/:account · GET /api/work/flux/line/:lineId   POST /api/work/flux/line/:lineId/comments · POST /api/work/flux/:account/comments
 *   POST /api/work/comments/:commentId/edit
 *   GET  /api/work/close · GET /api/work/close/tasks   POST /api/work/close/tasks/:taskId/status
 *   GET  /api/work/reports[/:id] · POST /api/work/reports · POST /api/work/reports/:id (update / archive / delete)
 *   GET  /api/work/evidence?target= · GET /api/work/issues · GET /api/work/saved/:kind
 *
 *   4A — WHAT A DELIVERABLE CITES, AND THE DELIVERABLES
 *   GET  /api/work/flux/line/:lineId/explanation · POST …/explanation      the ONE authoritative explanation (versioned)
 *   POST /api/work/reconciliations/:id/statement                          a recorded bank statement balance (BANK method)
 *        (GET /api/work/reconciliations/:id now carries `balance`: the versioned server balance record)
 *   GET  /api/work/artifacts · GET /api/work/artifacts/:id?rows=           definition, versions, generations, preview
 *   POST /api/work/artifacts/:id/generate { format, expectedVersion, acknowledge, channel, idempotencyKey }
 *   POST /api/work/artifacts/:id/refresh  { expectedVersion }              a STALE artifact → a new version
 *   GET  /api/work/artifacts/jobs/:jobId · GET /api/work/artifacts/:id/generations/:gid/download
 *   POST /api/work/artifacts/jobs/:jobId/cancel                                a queued / running job stops; no file kept
 *   POST /api/work/artifacts/:id/status  { status: SAVED|ARCHIVED|DRAFT }      lifecycle state
 *   POST /api/work/artifacts/:id/restore { version }                           a prior definition as a NEW version
 *   POST /api/work/artifacts/:id/derive  { periodEnd, scopeId, vendor }        a NEW artifact from this one
 *   GET  /api/work/pbc · GET /api/work/pbc/:id?offset=&limit=                   5A: PBC requests / the PBC workspace (paged selections)
 *   POST /api/work/pbc { text | accounts, periodStart, … } · POST /api/work/pbc/upload { fileName, content (base64) }
 *   POST /api/work/pbc/:id/refresh · /deliver · /selections/:sid/resolve { transaction, note }
 *   POST /api/work/pbc/:id/gaps/:gid/resolve { status: WAIVED|RESOLVED, note } · /gaps/:gid/link-evidence { reference }
 *   POST /api/work/dev/source-posting · POST /api/work/dev/source-sync     dev auth mode + loopback only
 */
const cfg = loadSloaneConfig();
const adapter: SloaneLLMAdapter = createAdapter(cfg);
export const orchestrator = new SloaneOrchestrator(adapter, cfg);
const idp = new DevIdentityProvider();
export const authProvider = new DevSessionAuthProvider(WORK.repos, idp);
export const auth = new AuthContext(authProvider, idp);
/** @deprecated 3C export name */
export const sessions = { mode: authProvider.mode, resolve: (req: IncomingMessage, res: ServerResponse | null) => auth.resolve(req, res)?.actor ?? null };
const work = new WorkApi(orchestrator);
const MAX_BODY = 32_000;

function readJson(req: IncomingMessage, max = MAX_BODY): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0, body = '';
    req.on('data', (c: Buffer) => { size += c.length; if (size > max) { resolve(null); req.destroy(); } else body += c; });
    req.on('end', () => { try { const j = JSON.parse(body || '{}'); resolve(j && typeof j === 'object' && !Array.isArray(j) ? j : null); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
const reply = (res: ServerResponse, r: ApiResult) => send(res, r.status, r.body);
const refuse = (res: ServerResponse, outcome: Exclude<Outcome, 'SUCCESS'>, reason: string, extra: Record<string, unknown> = {}) => send(res, HTTP_OF[outcome], { outcome, reason, ...extra });

const loopback = (req: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
const actorView = (a: ActorContext) => ({ id: a.id, name: a.name, role: a.role, capabilities: a.permissions, entityAccess: a.entityAccess, authenticatedVia: a.authenticatedVia });
const DECISIONS = ['confirm', 'cancel', 'edit', 'choose', 'refresh', 'regenerate'];
const MUTATING = (m?: string) => !['GET', 'HEAD', 'OPTIONS'].includes(m ?? 'GET');

/* ---- origin and CSRF -------------------------------------------------------------------------- */
const allowedOrigins = () => (process.env['KORVYN_ALLOWED_ORIGINS'] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
function ownOrigin(req: IncomingMessage) { const host = req.headers.host ?? ''; const https = (req.socket as { encrypted?: boolean } | undefined)?.encrypted || String(req.headers['x-forwarded-proto'] ?? '').startsWith('https'); return `${https ? 'https' : 'http'}://${host}`; }
/** the request's origin is this server or an explicitly allowed Korvyn origin */
export function originAllowed(req: IncomingMessage): boolean {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
  const referer = typeof req.headers.referer === 'string' ? req.headers.referer : null;
  const src = origin ?? (referer ? (() => { try { return new URL(referer).origin; } catch { return 'invalid'; } })() : null);
  if (!src) return String(req.headers['sec-fetch-site'] ?? 'same-origin') === 'same-origin';
  return src === ownOrigin(req) || allowedOrigins().includes(src);
}
function csrfValid(req: IncomingMessage, a: AuthResolution): boolean {
  const sent = req.headers['x-korvyn-csrf'];
  if (typeof sent !== 'string' || !sent) return false;
  const x = Buffer.from(sent), y = Buffer.from(a.session.csrfToken);
  return x.length === y.length && timingSafeEqual(x, y);
}
/** CORS for an explicitly allowed Korvyn origin only; nothing for anyone else */
function cors(req: IncomingMessage, res: ServerResponse) {
  const o = typeof req.headers.origin === 'string' ? req.headers.origin : null;
  if (o && allowedOrigins().includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Korvyn-CSRF'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
}

/** the actor for this request, or a 401 already sent; mutations additionally pass origin + CSRF checks */
function authed(req: IncomingMessage, res: ServerResponse): AuthResolution | null {
  if (MUTATING(req.method) && !originAllowed(req)) { refuse(res, 'PERMISSION_DENIED', 'Cross-origin request refused.', { code: 'ORIGIN_REJECTED' }); return null; }
  const a = auth.resolve(req, res);
  if (!a) { send(res, 401, { outcome: 'PERMISSION_DENIED', code: 'UNAUTHENTICATED', reason: 'Sign in to Korvyn.' }); return null; }
  if (MUTATING(req.method) && !csrfValid(req, a)) { refuse(res, 'PERMISSION_DENIED', 'This request is missing its session protection token. Reload and try again.', { code: 'CSRF_REJECTED' }); return null; }
  return a;
}
/** a live conversation belongs to the user who started it */
function ownsSession(res: ServerResponse, actor: ActorContext, sessionId: string): boolean {
  const owner = orchestrator.sessionOwner(sessionId);
  if (owner && owner !== actor.id) { refuse(res, 'PERMISSION_DENIED', 'This conversation belongs to another user.'); return false; }
  return true;
}
/** an action decision's per-proposal codes, as the one outcome contract */
function decisionOutcome(results: { code: string | null; status: string }[]): Outcome {
  const codes = results.map((r) => r.code);
  if (codes.includes('STALE_PROPOSAL')) return 'STALE_VERSION';
  if (codes.includes('FORBIDDEN') || codes.includes('GOVERNED')) return 'PERMISSION_DENIED';
  if (codes.includes('NOT_FOUND')) return 'NOT_FOUND';
  if (codes.includes('INVALID')) return 'VALIDATION_ERROR';
  if (codes.includes('DEPENDENCY') || codes.includes('IN_PROGRESS')) return 'CONFLICT';
  if (codes.includes('FAILED')) return 'UNAVAILABLE';
  return 'SUCCESS';
}

export const API_PREFIXES = ['/api/sloane/', '/api/auth/', '/api/work/'];

export async function handleSloane(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ?? '';
  if (!API_PREFIXES.some((p) => url.startsWith(p))) return false;
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
  try {
    await route(req, res, url);
  } catch (e) {
    const requestId = randomUUID();
    console.error(`[korvyn] ${requestId} ${req.method} ${url.split('?')[0]} failed:`, (e as Error)?.message ?? e);
    refuse(res, 'UNAVAILABLE', 'Korvyn could not complete this request. Nothing was changed.', { requestId });
  }
  return true;
}

async function route(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
  const [path, qs] = [url.split('?')[0] ?? '', new URLSearchParams(url.split('?')[1] ?? '')];
  const period = qs.get('period') ?? undefined;

  /* ---- auth ------------------------------------------------------------------------------------- */
  if (path.startsWith('/api/auth/')) {
    const r = path.slice('/api/auth/'.length);
    if (req.method === 'GET' && r === 'me') { const a = authed(req, res); if (a) send(res, 200, { outcome: 'SUCCESS', actor: actorView(a.actor), mode: auth.mode, csrfToken: a.session.csrfToken, expiresAt: a.session.expiresAt, provider: a.session.provider }); return; }
    if (req.method === 'POST' && r === 'logout') { const a = authed(req, res); if (!a) return; authProvider.signOut(req, res); send(res, 200, { outcome: 'SUCCESS' }); return; }
    if (req.method === 'POST' && r === 'dev/switch') {
      /* a login: no session exists to hold a token yet, so it is protected by dev mode + loopback + same origin */
      if (auth.mode !== 'dev' || !loopback(req)) { refuse(res, 'NOT_FOUND', 'not found'); return; }
      if (!originAllowed(req)) { refuse(res, 'PERMISSION_DENIED', 'Cross-origin request refused.', { code: 'ORIGIN_REJECTED' }); return; }
      const body = await readJson(req);
      const s = typeof body?.['userId'] === 'string' ? authProvider.signInAs(req, res, body['userId']) : null;
      const u = s ? idp.user(s.userId) : null;
      if (!s || !u) { refuse(res, 'VALIDATION_ERROR', 'unknown user', { users: DEV_DIRECTORY.map((x) => ({ id: x.id, name: x.name, roles: x.roles })) }); return; }
      send(res, 200, { outcome: 'SUCCESS', actor: { id: u.id, name: u.name, role: u.roles[0] }, csrfToken: s.csrfToken });
      return;
    }
    refuse(res, 'NOT_FOUND', 'unknown auth route');
    return;
  }

  /* ---- domain actions ------------------------------------------------------------------------------ */
  if (path.startsWith('/api/work/')) {
    const seg = path.slice('/api/work/'.length).split('/').map(decodeURIComponent);
    const a = authed(req, res); if (!a) return;
    const actor = a.actor, G = req.method === 'GET', P = req.method === 'POST';
    /* an uploaded PBC file (base64) may be larger than an ordinary write */
    const body = P ? await readJson(req, seg[0] === 'pbc' && seg[1] === 'upload' ? 3_000_000 : MAX_BODY) : {};
    if (P && !body) { refuse(res, 'VALIDATION_ERROR', 'invalid or oversized request body'); return; }
    const b = body ?? {};
    const [s0, s1, s2, s3] = seg;
    if (s0 === 'reconciliations' && s1) {
      if (G && seg.length === 2) return reply(res, work.reconciliationWorkflow(actor, s1, period));
      if (P && s2 === 'comments' && seg.length === 3) return reply(res, work.addReconciliationComment(actor, s1, b));
      if (P && s2 === 'support' && seg.length === 3) return reply(res, work.attachReconciliationSupport(actor, s1, b));
      if (P && s2 === 'statement' && seg.length === 3) return reply(res, work.recordReconciliationStatement(actor, s1, b));
    }
    if (s0 === 'flux' && s1) {
      if (s1 === 'line' && s2) {
        if (G && seg.length === 3) return reply(res, work.fluxLineComments(actor, s2, period));
        if (P && s3 === 'comments' && seg.length === 4) return reply(res, work.addFluxLineComment(actor, s2, b));
        if (G && s3 === 'explanation' && seg.length === 4) return reply(res, work.fluxLineExplanation(actor, s2, period));
        if (P && s3 === 'explanation' && seg.length === 4) return reply(res, work.setFluxLineExplanation(actor, s2, b));
      }
      if (G && seg.length === 2) return reply(res, work.fluxWorkflow(actor, s1, period));
      if (P && s2 === 'comments' && seg.length === 3) return reply(res, work.addFluxComment(actor, s1, b));
    }
    if (P && s0 === 'comments' && s1 && s2 === 'edit' && seg.length === 3) return reply(res, work.editComment(actor, s1, b));
    if (s0 === 'close') {
      if (G && seg.length === 1) return reply(res, work.close(actor, period));
      if (G && s1 === 'tasks' && seg.length === 2) return reply(res, work.closeTasks(actor, period));
      if (P && s1 === 'tasks' && s2 && s3 === 'status' && seg.length === 4) return reply(res, work.setCloseTaskStatus(actor, s2, b));
    }
    if (s0 === 'reports') {
      if (G && seg.length === 1) return reply(res, work.reports(actor));
      if (P && seg.length === 1) return reply(res, work.createReport(actor, b));
      if (G && s1 && seg.length === 2) return reply(res, work.report(actor, s1));
      if (P && s1 && seg.length === 2) return reply(res, work.updateReport(actor, s1, b));
    }
    if (s0 === 'pbc') {
      if (G && seg.length === 1) return reply(res, work.pbcRequests(actor));
      if (P && seg.length === 1) return reply(res, work.createPBCRequest(actor, b));
      if (P && s1 === 'upload' && seg.length === 2) return reply(res, await work.uploadPBCRequest(actor, b));
      if (G && s1 && seg.length === 2) return reply(res, work.pbcRequest(actor, s1, Number(qs.get('offset') ?? 0) || 0, Number(qs.get('limit') ?? 40) || 40));
      if (P && s1 && s2 === 'refresh' && seg.length === 3) return reply(res, work.refreshPBCRequest(actor, s1, b));
      if (P && s1 && s2 === 'deliver' && seg.length === 3) return reply(res, work.deliverPBCRequest(actor, s1, b));
      if (P && s1 && s2 === 'selections' && s3 && seg[4] === 'resolve' && seg.length === 5) return reply(res, work.resolvePBCSelection(actor, s1, s3, b));
      if (P && s1 && s2 === 'gaps' && s3 && seg[4] === 'resolve' && seg.length === 5) return reply(res, work.resolvePBCGap(actor, s1, s3, b));
      if (P && s1 && s2 === 'gaps' && s3 && seg[4] === 'link-evidence' && seg.length === 5) return reply(res, work.linkPBCEvidence(actor, s1, s3, b));
    }
    if (s0 === 'artifacts') {
      if (G && seg.length === 1) return reply(res, work.artifacts(actor));
      if (G && s1 === 'jobs' && s2 && seg.length === 3) return reply(res, work.artifactJob(actor, s2));
      if (P && s1 === 'jobs' && s2 && s3 === 'cancel' && seg.length === 4) return reply(res, work.cancelArtifactJob(actor, s2));
      if (G && s1 && seg.length === 2) return reply(res, work.artifact(actor, s1, Math.min(Number(qs.get('rows') ?? 15) || 15, 25), qs.get('section')));
      if (P && s1 && s2 === 'status' && seg.length === 3) return reply(res, work.setArtifactStatus(actor, s1, b));
      if (P && s1 && s2 === 'restore' && seg.length === 3) return reply(res, work.restoreArtifact(actor, s1, b));
      if (P && s1 && s2 === 'derive' && seg.length === 3) return reply(res, work.deriveArtifact(actor, s1, b));
      if (P && s1 && s2 === 'generate' && seg.length === 3) return reply(res, await work.generateArtifact(actor, s1, b));
      if (P && s1 && s2 === 'refresh' && seg.length === 3) return reply(res, work.refreshArtifact(actor, s1, b));
      if (G && s1 && s2 === 'generations' && s3 && seg[4] === 'download' && seg.length === 5) {
        const d = work.artifactDownload(actor, s1, s3);
        if (!d.ok) { refuse(res, d.code === 'PERMISSION_DENIED' ? 'PERMISSION_DENIED' : d.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'CONFLICT', d.reason); return; }
        res.writeHead(200, { 'Content-Type': d.contentType, 'Content-Length': String(d.bytes), 'Content-Disposition': `attachment; filename="${d.fileName.replace(/"/g, '')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        createReadStream(d.path).pipe(res);
        return;
      }
    }
    /* development only: a late ERP posting / a connector sync — dev auth mode, loopback */
    if (P && s0 === 'dev' && auth.mode === 'dev' && loopback(req)) {
      if (s1 === 'source-posting' && seg.length === 2) return reply(res, work.devSourcePosting(actor, b));
      if (s1 === 'source-sync' && seg.length === 2) return reply(res, work.devSourceSync(actor));
    }
    if (G && s0 === 'evidence' && seg.length === 1) { const t = qs.get('target'); if (!t) { refuse(res, 'VALIDATION_ERROR', 'target is required'); return; } return reply(res, work.evidence(actor, t)); }
    if (G && s0 === 'issues' && seg.length === 1) return reply(res, work.issues(actor));
    if (G && s0 === 'saved' && s1 && seg.length === 2) return reply(res, work.savedObjects(actor, s1));
    refuse(res, 'NOT_FOUND', 'unknown work route');
    return;
  }

  /* ---- sloane ----------------------------------------------------------------------------------- */
  const r = path.slice('/api/sloane/'.length);
  if (req.method === 'GET' && r === 'health') {
    send(res, 200, { outcome: 'SUCCESS', available: adapter.provider !== 'mock', mode: orchestrator.mode, orchestration: 'server', auth: auth.mode,
      configured: cfg.provider === 'mock' || cfg.credentialsPresent, limits: { maxToolCalls: LIMITS.maxToolCalls, wallClockMs: LIMITS.wallClockMs, timeoutMs: cfg.timeoutMs } });
    return;
  }
  if (req.method === 'GET' && r.startsWith('trace/')) {
    if (!loopback(req) || process.env['SLOANE_DEV_TRACE'] === '0') { refuse(res, 'NOT_FOUND', 'not found'); return; }
    const t = orchestrator.trace(r.slice('trace/'.length));
    if (t) send(res, 200, t); else refuse(res, 'NOT_FOUND', 'no such trace');
    return;
  }
  if (['interpret', 'plan', 'narrate'].includes(r)) { send(res, 410, { outcome: 'NOT_FOUND', reason: 'retired: Sloane orchestration runs on the server — use POST /api/sloane/turn' }); return; }
  const a = authed(req, res); if (!a) return;
  const actor = a.actor;

  if (req.method === 'POST' && r === 'action') {
    const body = await readJson(req);
    if (!body || typeof body['sessionId'] !== 'string' || !DECISIONS.includes(String(body['decision'])) || (typeof body['proposalId'] !== 'string' && typeof body['planId'] !== 'string')) { refuse(res, 'VALIDATION_ERROR', 'sessionId, decision and proposalId or planId are required'); return; }
    if (!ownsSession(res, actor, body['sessionId'])) return;
    const edits = body['edits'] && typeof body['edits'] === 'object' ? Object.fromEntries(Object.entries(body['edits'] as Record<string, unknown>).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v).slice(0, 2000)])) : undefined;
    const out = orchestrator.decide({ sessionId: body['sessionId'], ...(typeof body['proposalId'] === 'string' ? { proposalId: body['proposalId'] } : {}), ...(typeof body['planId'] === 'string' ? { planId: body['planId'] } : {}),
      decision: body['decision'] as 'confirm', ...(edits ? { edits } : {}), ...(typeof body['choice'] === 'string' ? { choice: body['choice'] } : {}), ...(typeof body['requestId'] === 'string' ? { requestId: body['requestId'].slice(0, 80) } : {}) }, actor);
    const outcome = decisionOutcome(out.results);
    send(res, HTTP_OF[outcome], { outcome, ...out, timeline: orchestrator.timeline(body['sessionId']) });
    return;
  }
  if (req.method === 'GET' && r.startsWith('session/') && r.endsWith('/activity')) {
    const sid = r.slice('session/'.length, -'/activity'.length);
    if (!ownsSession(res, actor, sid)) return;
    send(res, 200, { outcome: 'SUCCESS', timeline: orchestrator.timeline(sid), audit: orchestrator.auditOf(sid) });
    return;
  }
  if (req.method === 'GET' && r === 'investigations') { send(res, 200, { outcome: 'SUCCESS', investigations: orchestrator.listInvestigations(actor) }); return; }
  if (r.startsWith('investigations/')) {
    const [id, verb] = r.slice('investigations/'.length).split('/');
    if (req.method === 'GET' && id && !verb) { const v = orchestrator.investigationView(id, actor); if (v) send(res, 200, { outcome: 'SUCCESS', ...v }); else refuse(res, 'NOT_FOUND', 'No such investigation'); return; }
    if (req.method === 'POST' && id && verb === 'resume') {
      const body = await readJson(req);
      const sid = typeof body?.['sessionId'] === 'string' ? body['sessionId'] : '';
      if (!ownsSession(res, actor, sid)) return;
      const v = orchestrator.resumeInvestigation(id, sid, actor);
      if (v) send(res, 200, { outcome: 'SUCCESS', sessionId: sid, ...v }); else refuse(res, 'NOT_FOUND', 'No such investigation');
      return;
    }
  }
  /* Phase 7: governed agent runs. The run advances in the background; the browser polls the run, never holds a request open
     for it. Only the actor who started a run may read, interrupt, decide or cancel it. */
  if (r === 'agent/runs' || r.startsWith('agent/runs/')) {
    const A = orchestrator.agents, parts = r.split('/').slice(2);
    if (req.method === 'GET' && !parts.length) { send(res, 200, { outcome: 'SUCCESS', runs: A.list(actor) }); return; }
    if (req.method === 'POST' && !parts.length) {
      const body = await readJson(req);
      if (!body || typeof body['request'] !== 'string' || !body['request'].trim()) { refuse(res, 'VALIDATION_ERROR', 'request is required'); return; }
      if (typeof body['sessionId'] === 'string' && !ownsSession(res, actor, body['sessionId'])) return;
      /* failure simulation is a dev/test aid: never honoured outside dev auth on loopback */
      const opt = body['options'] && typeof body['options'] === 'object' && auth.mode === 'dev' && loopback(req) ? body['options'] as Record<string, unknown> : {};
      const list = (k: string) => Array.isArray(opt[k]) ? (opt[k] as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 10) : undefined;
      const options = { ...(typeof opt['pace'] === 'number' ? { pace: Math.min(5000, Math.max(0, opt['pace'])) } : {}), ...(list('failTools') ? { failTools: list('failTools')! } : {}), ...(list('transientTools') ? { transientTools: list('transientTools')! } : {}), ...(list('unavailableSources') ? { unavailableSources: list('unavailableSources')! } : {}) };
      const out = A.start(actor, body['request'].slice(0, 1000), { options, ...(typeof body['sessionId'] === 'string' ? { sessionId: body['sessionId'] } : {}) });
      if (!out.ok) { refuse(res, 'VALIDATION_ERROR', out.reason); return; }
      await A.wait(out.run.runId, typeof body['waitMs'] === 'number' ? Math.min(20000, body['waitMs']) : 0);
      send(res, 200, { outcome: 'SUCCESS', run: A.view(out.run) });
      return;
    }
    const [id, verb, sub] = parts;
    const body0 = A.body(id!, actor);
    if (!body0) { refuse(res, 'NOT_FOUND', 'No such run'); return; }
    if (req.method === 'GET' && !verb) {
      const trace = new URL(req.url ?? '/', 'http://x').searchParams.get('trace') === '1' && loopback(req);
      send(res, 200, { outcome: 'SUCCESS', run: A.view(body0), ...(trace ? { body: body0 } : {}) });
      return;
    }
    if (req.method === 'POST') {
      const body = (await readJson(req)) ?? {};
      if (verb === 'intervene') { const t = typeof body['text'] === 'string' ? body['text'].slice(0, 500) : ''; const o = A.intervene(id!, actor, t); send(res, 200, { outcome: o.ok ? 'SUCCESS' : 'VALIDATION_ERROR', recognised: o.recognised, effect: o.effect, run: o.run ?? A.view(body0) }); return; }
      if (verb === 'resume' || verb === 'pause') { const o = A.intervene(id!, actor, verb); send(res, 200, { outcome: 'SUCCESS', effect: o.effect, run: o.run ?? A.view(body0) }); return; }
      if (verb === 'cancel') { const o = A.cancel(id!, actor); send(res, 200, { outcome: o.ok ? 'SUCCESS' : 'VALIDATION_ERROR', run: o.run ?? A.view(body0) }); return; }
      if (verb === 'checkpoints' && sub) {
        const o = await A.decide(id!, actor, sub, String(body['decision'] ?? ''), typeof body['requestId'] === 'string' ? body['requestId'].slice(0, 80) : undefined);
        if (!o.ok) { refuse(res, 'VALIDATION_ERROR', o.reason ?? 'rejected'); return; }
        await A.wait(id!, typeof body['waitMs'] === 'number' ? Math.min(20000, body['waitMs']) : 0);
        send(res, 200, { outcome: 'SUCCESS', run: A.get(id!, actor) });
        return;
      }
    }
    refuse(res, 'NOT_FOUND', 'unknown agent route');
    return;
  }
  if (req.method === 'POST' && r === 'turn') {
    const body = await readJson(req);
    if (!body) { refuse(res, 'VALIDATION_ERROR', 'invalid or oversized request body'); return; }
    if (typeof body['sessionId'] === 'string' && !ownsSession(res, actor, body['sessionId'])) return;
    const out = await orchestrator.turn({ sessionId: body['sessionId'], request: body['request'], clarification: body['clarification'], view: body['view'], focus: body['focus'] }, actor);
    send(res, 200, { outcome: 'SUCCESS', ...out });
    return;
  }
  /* Phase 6: the same turn, streamed as NDJSON — status lines as Korvyn works, the structured objects as soon as they
     exist, then the final response with the narrative. A client that disconnects cancels the turn: nothing it would
     have committed to the conversation is kept. Authentication, CSRF and ownership are the same as /turn. */
  if (req.method === 'POST' && r === 'turn/stream') {
    const body = await readJson(req);
    if (!body) { refuse(res, 'VALIDATION_ERROR', 'invalid or oversized request body'); return; }
    if (typeof body['sessionId'] === 'string' && !ownsSession(res, actor, body['sessionId'])) return;
    const t0 = Date.now(), ac = new AbortController();
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no' });
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    const write = (ev: Record<string, unknown>) => { if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify({ ...ev, atMs: Date.now() - t0 })}\n`); };
    const out = await orchestrator.turn({ sessionId: body['sessionId'], request: body['request'], clarification: body['clarification'], view: body['view'], focus: body['focus'] }, actor, { emit: (e) => write(e as unknown as Record<string, unknown>), signal: ac.signal });
    write({ type: 'final', response: { outcome: 'SUCCESS', ...out } });
    if (!res.writableEnded) res.end();
    return;
  }
  refuse(res, req.method === 'POST' || req.method === 'GET' ? 'NOT_FOUND' : 'VALIDATION_ERROR', 'unknown Sloane route');
}
