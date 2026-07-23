/**
 * The no-post guardrail, enforced structurally.
 *
 * A HumanApproval token can only be minted by grant(), whose branding Symbol is
 * closure-private — no other code (including any agent tool) can construct a
 * valid token. postToLedger() refuses without one. The agent has no path to
 * grant(), so it literally cannot post to the ERP. This is the runtime-JS
 * equivalent of a type-system-enforced unforgeable token.
 */
const BRAND: unique symbol = Symbol('human-approval');

export interface HumanApprovalToken {
  readonly [BRAND]: true;
  readonly actor: string;
  readonly note?: string;
}

export const HumanApproval = {
  /** Called ONLY from a human-confirmed UI path — never reachable from agent tools. */
  grant(actor: string, note?: string): HumanApprovalToken {
    return note === undefined ? { [BRAND]: true, actor } : { [BRAND]: true, actor, note };
  },
  verify(token: unknown): token is HumanApprovalToken {
    return !!token && typeof token === 'object' && (token as Record<symbol, unknown>)[BRAND] === true;
  },
};

/**
 * The ERP is the system of record; Korvyn never posts. This exists to prove the
 * guardrail: without a HumanApproval token it refuses, and even with one it is
 * NotImplemented. No agent code path can obtain a token.
 */
export function postToLedger(_entry: unknown, approval?: unknown): never {
  if (!HumanApproval.verify(approval)) {
    throw new Error('BLOCKED: posting to the ledger requires a HumanApproval token that no agent code path can construct.');
  }
  throw new Error('NotImplemented: Korvyn never posts to the ERP (the system of record).');
}
