import 'dotenv/config';
import { createServer, type ServerResponse } from 'node:http';
import { KorvynAgent } from './agent.js';

/**
 * Thin HTTP bridge so the dashboard's Ask Korvyn can reach the real agent.
 *   GET  /health  -> { ok, model, keySet }
 *   POST /ask     -> streams newline-delimited JSON events ({type:'text'|'tool'|'done'|'error'})
 * CORS is open (localhost dev). One KorvynAgent per sessionId keeps multi-turn memory.
 */
const PORT = Number(process.env['PORT'] ?? 8787);
const sessions = new Map<string, KorvynAgent>();

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
}

const server = createServer((req, res) => {
  cors(res);
  const url = req.url ?? '';

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model: 'claude-opus-4-8', keySet: !!process.env['ANTHROPIC_API_KEY'] }));
    return;
  }

  if (req.method === 'POST' && url.startsWith('/ask')) {
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
        write({ type: 'error', text: (e as Error).message });
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
