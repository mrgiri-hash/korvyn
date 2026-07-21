import {
  type Adapter,
  type AuthState,
  type CanonicalEntityType,
  type ConnectorCapabilities,
  type CredentialRef,
  type PullRequest,
  type PullResult,
  type PushRequest,
  type PushResult,
  NotImplementedError,
  UnsupportedCapabilityError,
  capabilityFor,
} from '../adapter';

/**
 * ProcoreAdapter — a DO-NOTHING stub.
 *
 * It exists for one reason: to prove the Adapter contract is implementable and
 * expressive enough for a real, awkward system. It makes no network calls.
 *
 * Procore is a good stress test precisely because it is a poor GL citizen:
 * it owns projects, commitments and change orders, but has no chart of accounts
 * or period close worth pulling. The capability descriptor below says so
 * honestly rather than pretending uniformity — which is the point of having a
 * capabilities descriptor at all.
 *
 * NOTE: no Procore field name appears in this file. When this becomes real,
 * `custom_fields.cost_code` and friends live in the private translation layer
 * and in MappingConfig — never in a signature the core can see.
 */
export class ProcoreAdapter implements Adapter {
  readonly capabilities: ConnectorCapabilities = {
    connectorId: 'procore',
    displayName: 'Procore',
    supportsEntityScoping: true,
    emitsDeletions: false,
    rateLimitPerMinute: 3600,
    entities: [
      // Cost dimensions are Procore's real contribution: it is the system of
      // record for projects and cost codes on a construction programme.
      {
        entityType: 'DimensionValue',
        direction: 'PULL',
        supportsIncremental: true,
        supportsPaging: true,
        supportsIdempotentPush: false,
      },
      // Commitments and invoices arrive as journal entries once translated.
      {
        entityType: 'JournalEntry',
        direction: 'PULL',
        supportsIncremental: true,
        supportsPaging: true,
        supportsIdempotentPush: false,
      },
      // Procore has no chart of accounts to speak of; declaring NONE is more
      // useful than a half-working implementation.
      {
        entityType: 'Account',
        direction: 'NONE',
        supportsIncremental: false,
        supportsPaging: false,
        supportsIdempotentPush: false,
      },
      {
        entityType: 'Entity',
        direction: 'NONE',
        supportsIncremental: false,
        supportsPaging: false,
        supportsIdempotentPush: false,
      },
      {
        entityType: 'Period',
        direction: 'NONE',
        supportsIncremental: false,
        supportsPaging: false,
        supportsIdempotentPush: false,
      },
    ],
  };

  private state: AuthState = { status: 'UNAUTHENTICATED' };

  // -- auth lifecycle ------------------------------------------------------

  async authenticate(_cred: CredentialRef): Promise<AuthState> {
    throw new NotImplementedError('ProcoreAdapter.authenticate');
  }

  async refresh(): Promise<AuthState> {
    throw new NotImplementedError('ProcoreAdapter.refresh');
  }

  async revoke(): Promise<void> {
    throw new NotImplementedError('ProcoreAdapter.revoke');
  }

  authState(): AuthState {
    return this.state;
  }

  async healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
    return { healthy: false, detail: 'stub adapter — no transport configured' };
  }

  // -- data movement -------------------------------------------------------

  async pull<T extends CanonicalEntityType>(req: PullRequest<T>): Promise<PullResult<T>> {
    // The capability check is real even in the stub: it is the behaviour a
    // caller must be able to rely on, and getting it wrong later is subtle.
    const cap = capabilityFor(this.capabilities, req.entityType);
    if (!cap || cap.direction === 'NONE' || cap.direction === 'PUSH') {
      throw new UnsupportedCapabilityError('procore', `pull(${req.entityType})`);
    }
    throw new NotImplementedError(`ProcoreAdapter.pull(${req.entityType})`);
  }

  async push<T extends CanonicalEntityType>(req: PushRequest<T>): Promise<PushResult> {
    const cap = capabilityFor(this.capabilities, req.entityType);
    if (!cap || cap.direction === 'NONE' || cap.direction === 'PULL') {
      throw new UnsupportedCapabilityError('procore', `push(${req.entityType})`);
    }
    throw new NotImplementedError(`ProcoreAdapter.push(${req.entityType})`);
  }
}
