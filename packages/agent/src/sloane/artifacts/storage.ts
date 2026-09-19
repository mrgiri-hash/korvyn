/**
 * ARTIFACT STORAGE — where generated files live, behind one interface.
 *
 * Domain logic never builds a filesystem path: it asks the storage for a key's location, and the storage decides where
 * that is. `LocalArtifactStorage` is the only implementation today (a directory on the server); an object-store
 * implementation would satisfy the same interface — `locate` returning a staging path, `commit` uploading it. A key is
 * `<generationId>/<fileName>`, so two generations never share a file and a generated file is never overwritten.
 */
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

export interface ArtifactStorage {
  readonly kind: string;
  /** where the renderer writes the file for this key (the directory exists when this returns) */
  locate(key: string): string;
  /** the file is complete; an object store would upload it here */
  commit(key: string): { bytes: number };
  /** remove a partial or abandoned file (a cancelled or failed job) */
  discard(key: string): void;
  exists(key: string): boolean;
  /** a local path a response can stream from */
  read(key: string): string;
}

export class LocalArtifactStorage implements ArtifactStorage {
  readonly kind = 'LOCAL';
  constructor(public root: string) {}
  private path(key: string) {
    const p = resolve(this.root, key);
    /* a key can never climb out of the storage root */
    if (!p.startsWith(resolve(this.root) + sep)) throw new Error(`storage key escapes the root: ${key}`);
    return p;
  }
  locate(key: string) { const p = this.path(key); mkdirSync(dirname(p), { recursive: true }); return p; }
  commit(key: string) { return { bytes: statSync(this.path(key)).size }; }
  discard(key: string) { try { rmSync(dirname(this.path(key)), { recursive: true, force: true }); } catch { /* nothing to remove */ } }
  exists(key: string) { return existsSync(this.path(key)); }
  read(key: string) { return this.path(key); }
}

/** the default root: KORVYN_ARTIFACT_DIR, else packages/agent/data/artifacts (the OS temp dir under tests) */
export function defaultArtifactRoot() {
  return process.env['KORVYN_ARTIFACT_DIR'] ?? (process.env['NODE_TEST_CONTEXT'] ? join(tmpdir(), 'korvyn-artifacts') : new URL('../../../data/artifacts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
}
