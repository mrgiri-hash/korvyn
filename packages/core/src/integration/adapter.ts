import type { Account, Entity, Period, JournalEntry, DimensionValue } from '../domain/index.js';

/**
 * THE SEAM.
 *
 * Every external system reaches the core through this interface and no other
 * path. An adapter's entire job is translation: that system's vocabulary in,
 * canonical objects out, and the reverse on push.
 *
 * Note what is absent by design:
 *   - no HTTP, no SDK types, no vendor field names
 *   - no scheduling, retry or conflict policy (a sync engine's job, later)
 *   - no persistence
 *
 * An adapter is a pure translator plus an authenticated transport. Keeping it
 * that thin is what makes the connectors replaceable.
 */

// ---------------------------------------------------------------------------
// What can cross the boundary
// ---------------------------------------------------------------------------

/** The canonical types an adapter may exchange. Closed on purpose. */
export type CanonicalEntityType =
  | 'Account'
  | 'Entity'
  | 'Period'
  | 'JournalEntry'
  | 'DimensionValue';

/** Maps the discriminator to the actual canonical shape. */
export interface CanonicalTypeMap {
  Account: Account;
  Entity: Entity;
  Period: Period;
  JournalEntry: JournalEntry;
  DimensionValue: DimensionValue;
}

export type CanonicalOf<T extends CanonicalEntityType> = CanonicalTypeMap[T];

// ---------------------------------------------------------------------------
// Capabilities
//
// Connectors differ enormously: Procore has projects and commitments but no
// general ledger worth pushing to; QuickBooks has a GL but a thin dimension
// model; Yardi's period handling is its own world. Rather than have callers
// hard-code those differences, each adapter declares them and the caller
// branches on data.
// ---------------------------------------------------------------------------

export type SyncDirection = 'PULL' | 'PUSH' | 'BIDIRECTIONAL' | 'NONE';

export interface EntityCapability {
  readonly entityType: CanonicalEntityType;
  readonly direction: SyncDirection;
  /** Supports `since` filtering. If false, callers must full-scan. */
  readonly supportsIncremental: boolean;
  /** Supports cursor paging. If false, one call must return everything. */
  readonly supportsPaging: boolean;
  /** Honours an idempotency key on push, so a retry cannot double-post. */
  readonly supportsIdempotentPush: boolean;
}

export interface ConnectorCapabilities {
  readonly connectorId: string;
  readonly displayName: string;
  readonly entities: readonly EntityCapability[];
  /** Multi-entity source systems can scope a pull to one entity. */
  readonly supportsEntityScoping: boolean;
  /** Emits deletes/voids rather than only upserts. Affects reconciliation later. */
  readonly emitsDeletions: boolean;
  /** Server-side rate limit the caller should respect, if published. */
  readonly rateLimitPerMinute?: number;
}

export const capabilityFor = (
  caps: ConnectorCapabilities,
  t: CanonicalEntityType,
): EntityCapability | undefined => caps.entities.find((e) => e.entityType === t);

// ---------------------------------------------------------------------------
// Auth lifecycle
//
// Credentials are opaque to the core. The core knows an adapter is or is not
// authenticated and when its grant expires; it never knows what a token is.
// ---------------------------------------------------------------------------

export type AuthStatus = 'UNAUTHENTICATED' | 'AUTHENTICATED' | 'EXPIRED' | 'REVOKED';

export interface AuthState {
  readonly status: AuthStatus;
  /** ISO-8601. Absent when the grant does not expire. */
  readonly expiresAt?: string;
  readonly scopes?: readonly string[];
}

/** Opaque credential envelope. The core stores and forwards; it never inspects. */
export interface CredentialRef {
  readonly credentialId: string;
}

// ---------------------------------------------------------------------------
// Pull / push
// ---------------------------------------------------------------------------

export interface PullRequest<T extends CanonicalEntityType = CanonicalEntityType> {
  readonly entityType: T;
  /** Incremental watermark. Adapters lacking support must ignore and full-scan. */
  readonly since?: Date;
  /** Opaque continuation token from a prior PullResult. */
  readonly cursor?: string;
  readonly limit?: number;
  /** Restrict to one source-system entity, when supportsEntityScoping. */
  readonly externalEntityId?: string;
}

/**
 * Records are already canonical. Anything vendor-shaped has been translated
 * before it gets here — that is the whole point of the boundary.
 *
 * `warnings` carries records the adapter could not fully translate. Dropping
 * them silently is how imports lose data; surfacing them lets the caller decide.
 */
export interface PullResult<T extends CanonicalEntityType = CanonicalEntityType> {
  readonly entityType: T;
  readonly records: readonly CanonicalOf<T>[];
  readonly cursor?: string;
  readonly hasMore: boolean;
  readonly warnings: readonly TranslationWarning[];
  /** Watermark to pass as `since` next time. Adapter decides its semantics. */
  readonly highWatermark?: Date;
}

export interface TranslationWarning {
  readonly externalId: string;
  readonly reason: string;
  readonly severity: 'INFO' | 'WARN' | 'ERROR';
}

export interface PushRequest<T extends CanonicalEntityType = CanonicalEntityType> {
  readonly entityType: T;
  readonly records: readonly CanonicalOf<T>[];
  /**
   * Caller-supplied key so a retried push cannot double-post. Adapters that
   * declare supportsIdempotentPush must honour it.
   */
  readonly idempotencyKey?: string;
}

export interface PushOutcome {
  /** Index into the submitted records array. */
  readonly index: number;
  readonly accepted: boolean;
  /** Id assigned by the external system, when accepted. Opaque. */
  readonly externalId?: string;
  readonly error?: string;
}

export interface PushResult {
  readonly outcomes: readonly PushOutcome[];
  readonly acceptedCount: number;
  readonly rejectedCount: number;
}

// ---------------------------------------------------------------------------
// The interface every connector implements
// ---------------------------------------------------------------------------

export interface Adapter {
  readonly capabilities: ConnectorCapabilities;

  // -- auth lifecycle --
  authenticate(cred: CredentialRef): Promise<AuthState>;
  refresh(): Promise<AuthState>;
  revoke(): Promise<void>;
  authState(): AuthState;

  /** Cheap liveness probe. Should not count against a meaningful rate limit. */
  healthCheck(): Promise<{ readonly healthy: boolean; readonly detail?: string }>;

  // -- data movement --
  pull<T extends CanonicalEntityType>(req: PullRequest<T>): Promise<PullResult<T>>;
  push<T extends CanonicalEntityType>(req: PushRequest<T>): Promise<PushResult>;
}

/** Thrown by stubs and by adapters asked for an unsupported capability. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented`);
    this.name = 'NotImplementedError';
  }
}

export class UnsupportedCapabilityError extends Error {
  constructor(connectorId: string, what: string) {
    super(`Connector ${connectorId} does not support ${what}`);
    this.name = 'UnsupportedCapabilityError';
  }
}
