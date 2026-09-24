/**
 * Loads packages/agent/.env by ABSOLUTE path, whatever the working directory, before anything else reads the
 * environment. Import it first: `import './env.js'`.
 *
 * The Anthropic credential comes ONLY from that file. A key inherited from the shell or a parent process is
 * dropped, so a stray `export ANTHROPIC_API_KEY=…` can never silently become the key Sloane spends. Every other
 * variable keeps dotenv's normal precedence (the shell wins), so tests and scripts can still set model ids.
 *
 * Nothing here logs, returns or forwards a credential value — only whether one is present.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

export const AGENT_ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const CREDENTIALS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;

const file: Record<string, string> = existsSync(AGENT_ENV_PATH) ? parse(readFileSync(AGENT_ENV_PATH)) : {};
for (const k of CREDENTIALS) {
  if (file[k]) process.env[k] = file[k];
  else if (process.env[k]) {
    delete process.env[k];
    console.warn(`[env] ignored ${k} from the shell environment — Sloane reads credentials only from packages/agent/.env`);
  }
}
for (const [k, v] of Object.entries(file)) if (!(CREDENTIALS as readonly string[]).includes(k) && process.env[k] === undefined) process.env[k] = v;
