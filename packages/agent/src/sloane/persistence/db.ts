/**
 * THE DURABLE WORK STORE — Korvyn's server-side persistence for governed work.
 *
 * Technology: SQLite through Node's built-in `node:sqlite` (Node 22). No new dependency, a single file on disk, real
 * transactions. Nothing outside this folder imports it: business logic talks to REPOSITORIES (repositories.ts), and
 * the LLM adapter, planner and tools never see a database primitive. Replacing SQLite with Postgres is a new
 * implementation of the same repository interfaces.
 *
 * Tables:
 *   records          every durable domain object, one row: stable Korvyn id, kind, version, created/updated by and at,
 *                    status, scope, period, target, investigation, and the object itself as JSON
 *   audit_events     APPEND ONLY. Triggers refuse UPDATE and DELETE, so no product workflow can rewrite history
 *   idempotency      one row per executed write key: a replayed key returns the recorded result, never a second write
 *   sessions         authenticated sessions (the browser holds only an opaque HttpOnly cookie)
 *   seed_meta        which deterministic development seed has been applied
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS records (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL, version INTEGER NOT NULL,
     created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
     status TEXT, scope TEXT, period TEXT, target TEXT, investigation_id TEXT, data TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS records_kind_target ON records(kind, target)`,
  `CREATE INDEX IF NOT EXISTS records_kind_investigation ON records(kind, investigation_id)`,
  `CREATE INDEX IF NOT EXISTS records_kind_created_by ON records(kind, created_by)`,
  `CREATE TABLE IF NOT EXISTS audit_events (
     seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, at TEXT NOT NULL,
     actor_id TEXT NOT NULL, source TEXT NOT NULL, action TEXT NOT NULL, target TEXT, investigation_id TEXT, data TEXT NOT NULL)`,
  `CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END`,
  `CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY, scope TEXT NOT NULL, actor_id TEXT NOT NULL, at TEXT NOT NULL, result TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS seed_meta (name TEXT PRIMARY KEY, version TEXT NOT NULL, at TEXT NOT NULL)`,
];

/** Stable Korvyn ids: PREFIX-<time base36>-<random>. Sortable by creation, never a UI index. */
export function korvynId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`;
}

export class KorvynDatabase {
  readonly db: DatabaseSync;
  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
    for (const m of MIGRATIONS) this.db.exec(m);
  }
  /** one synchronous transaction; a thrown error rolls everything back */
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  close() { this.db.close(); }
}

let shared: KorvynDatabase | null = null;
/** the process database: KORVYN_DB_PATH, else packages/agent/data/korvyn-work.db */
export function workDatabase(path = process.env['KORVYN_DB_PATH'] ?? new URL('../../../data/korvyn-work.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')): KorvynDatabase {
  if (!shared || shared.path !== path) shared = new KorvynDatabase(path);
  return shared;
}
