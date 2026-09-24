import './env.js';
import { createServer, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KorvynAgent } from './agent.js';
import { API_PREFIXES, handleSloane, originAllowed } from './sloane/routes.js';

/**
 * Thin HTTP bridge so the dashboard's Ask Korvyn can reach the real agent.
 *   GET  /health  -> { ok, model, keySet }
 *   POST /ask     -> streams newline-delimited JSON events ({type:'text'|'tool'|'done'|'error'})
 * CORS is RESTRICTED (3D): an Access-Control-Allow-Origin header is sent only for an origin listed in
 * KORVYN_ALLOWED_ORIGINS, never '*', and POST /ask is refused from any other origin. One KorvynAgent per sessionId.
 */
const PORT = Number(process.env['PORT'] ?? 8787);
const sessions = new Map<string, KorvynAgent>();

function cors(origin: string | undefined, res: ServerResponse): void {
  const allowed = (process.env['KORVYN_ALLOWED_ORIGINS'] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
}

const server = createServer((req, res) => {
  const url = req.url ?? '';
  // Sloane's API is same-origin only: the page is served from this server, so it gets no open CORS.
  if (API_PREFIXES.some((p) => url.startsWith(p))) {
    void handleSloane(req, res);
    return;
  }
  cors(typeof req.headers.origin === 'string' ? req.headers.origin : undefined, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve the main file so the app and the live agent share one origin. Re-pointed
  // 2026-08-14 from apps/review/index.html, which is superseded; REVIEW_UI_PATH still
  // overrides, so `REVIEW_UI_PATH=../../apps/review/index.html npm run serve` gets the
  // old UI back.
  if (req.method === 'GET' && (url === '/' || url === '/index.html' || url.startsWith('/?'))) {
    try {
      const uiPath = process.env['REVIEW_UI_PATH'] ?? join(process.cwd(), '..', '..', 'index.html');
      // The marker tells the page a Sloane reasoning service sits behind it. A static host serves the
      // file without it, so the page never probes an API that does not exist.
      const html = readFileSync(uiPath, 'utf8').replace('</head>', '<meta name="korvyn-sloane-api" content="/api/sloane"></head>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end('UI not found. Expected ../../index.html (or set REVIEW_UI_PATH).');
    }
    return;
  }

  if (req.method === 'GET' && url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model: 'claude-opus-4-8', keySet: !!process.env['ANTHROPIC_API_KEY'] }));
    return;
  }

  if (req.method === 'POST' && url.startsWith('/ask')) {
    if (!originAllowed(req)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ outcome: 'PERMISSION_DENIED', reason: 'Cross-origin request refused.' })); return; }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      let prompt = '';
      let sessionId = 'default';
      try {
        const j = JSON.parse(body || '{}') as { prompt?: unknown; sessionId?: unknown };
        prompt = String(j.prompt ?? '');
        sessionId = String(j.sessionId ?? 'default');
      } catch {
        /* fall through with defaults */
      }

      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' });
      const write = (o: unknown): void => void res.write(JSON.stringify(o) + '\n');

      if (!process.env['ANTHROPIC_API_KEY']) {
        write({ type: 'error', text: 'ANTHROPIC_API_KEY is not set on the agent server.' });
        res.end();
        return;
      }

      let agent = sessions.get(sessionId);
      if (!agent) {
        agent = new KorvynAgent();
        sessions.set(sessionId, agent);
      }
      try {
        await agent.ask(prompt, (e) => write(e));
      } catch (e) {
        console.error('[ask] failed:', (e as Error).message);
        write({ type: 'error', text: 'The agent could not complete this request.' });
      }
      res.end();
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`korvyn-agent server → http://localhost:${PORT}   (POST /ask · GET /health)`);
  console.log(process.env['ANTHROPIC_API_KEY'] ? 'ANTHROPIC_API_KEY detected.' : 'WARNING: ANTHROPIC_API_KEY not set — /ask will return an error event until you set it.');
});
