/**
 * AUTHENTICATION, AUTHORIZATION AND SEGREGATION OF DUTIES — the server's source of who is acting.
 *
 * AUTHENTICATION. Korvyn has no identity provider yet, so this is a clean, vendor-neutral abstraction:
 *   IdentityProvider      resolves an AuthenticatedUser. `DevIdentityProvider` serves a fixed directory for local
 *                         development; an OIDC/SAML provider implements the same interface later.
 *   SessionService        issues an opaque session id in an HttpOnly, SameSite=Strict cookie and stores the session
 *                         server-side. The browser never holds or sends a user id, role or permission.
 *   ActorContext          what every tool, action and repository call receives: the user, capabilities, entity and
 *                         scope access, document access. It is built from the SESSION, never from a request body.
 *
 * Dev mode (KORVYN_AUTH_MODE=dev, the default for local runs): a request with no session is signed in as
 * KORVYN_DEV_USER (default user:mgiri), and a loopback-only dev endpoint can switch the signed-in user to test
 * permissions. Any other mode refuses unauthenticated requests.
 *
 * AUTHORIZATION is by CAPABILITY, not role name. Roles are bundles of capabilities; checks name the capability and
 * the resource. Future governed capabilities are declared and are NOT granted to any role.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WorkRepositories } from './persistence/repositories.js';

export type Capability =
  | 'FINANCIALS_VIEW' | 'TB_VIEW' | 'GL_VIEW' | 'FLUX_VIEW' | 'FLUX_COMMENT' | 'RECON_VIEW' | 'RECON_COMMENT' | 'CLOSE_VIEW'
  | 'EVIDENCE_VIEW' | 'SUPPORT_ATTACH' | 'REPORT_VIEW' | 'REPORT_CREATE' | 'ISSUE_CREATE' | 'REVIEW_ASSIGN' | 'AUDIT_VIEW'
  | 'ANALYSIS_SAVE' | 'INVESTIGATION_SAVE' | 'ARTIFACT_CREATE' | 'SUPPORT_PACKAGE_CREATE' | 'CLOSE_TASK_UPDATE'
  /* future governed capabilities: declared so policy can name them; granted to NO role in this phase */
  | 'RECON_APPROVE' | 'CLOSE_CERTIFY' | 'REPORT_PUBLISH' | 'MAPPING_CHANGE' | 'ERP_WRITEBACK';
export const FUTURE_GOVERNED: Capability[] = ['RECON_APPROVE', 'CLOSE_CERTIFY', 'REPORT_PUBLISH', 'MAPPING_CHANGE', 'ERP_WRITEBACK'];

const VIEW_ALL: Capability[] = ['FINANCIALS_VIEW', 'TB_VIEW', 'GL_VIEW', 'FLUX_VIEW', 'RECON_VIEW', 'CLOSE_VIEW', 'EVIDENCE_VIEW', 'REPORT_VIEW', 'AUDIT_VIEW'];
export const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  FINANCE_REVIEWER: [...VIEW_ALL, 'FLUX_COMMENT', 'RECON_COMMENT', 'CLOSE_TASK_UPDATE', 'SUPPORT_ATTACH', 'REPORT_CREATE', 'ISSUE_CREATE', 'REVIEW_ASSIGN', 'ANALYSIS_SAVE', 'INVESTIGATION_SAVE', 'ARTIFACT_CREATE', 'SUPPORT_PACKAGE_CREATE'],
  /* one book, commenting and support on it; no group statements, no audit, no reviewer assignment, no shared reports */
  ENTITY_ACCOUNTANT: ['FINANCIALS_VIEW', 'TB_VIEW', 'GL_VIEW', 'FLUX_VIEW', 'RECON_VIEW', 'CLOSE_VIEW', 'EVIDENCE_VIEW', 'RECON_COMMENT', 'CLOSE_TASK_UPDATE', 'SUPPORT_ATTACH', 'ISSUE_CREATE', 'ANALYSIS_SAVE', 'ARTIFACT_CREATE'],
  /* the executive reader: every view, saved analysis; no workflow writes (Phase 8B — the CFO persona of the canvas) */
  CFO: [...VIEW_ALL, 'ANALYSIS_SAVE', 'INVESTIGATION_SAVE'],
  /* read-only: populations, evidence, reporting; never comments, never workflow in progress */
  EXTERNAL_AUDITOR: ['FINANCIALS_VIEW', 'TB_VIEW', 'GL_VIEW', 'RECON_VIEW', 'AUDIT_VIEW', 'EVIDENCE_VIEW', 'REPORT_VIEW', 'ANALYSIS_SAVE'],
};

export interface AuthenticatedUser { id: string; name: string; email: string; roles: string[]; entityAccess: 'ALL' | string[]; scopeAccess: 'ALL' | string[]; documentAccess: 'REFERENCES_ONLY' | 'NONE'; active: boolean }
export interface ActorContext {
  /* the Actor shape every tool and service already reads */
  id: string; name: string; role: string; permissions: Capability[]; scopeIds: 'ALL' | string[];
  user: AuthenticatedUser; sessionId: string | null; authenticatedVia: string;
  entityAccess: 'ALL' | string[]; scopeAccess: 'ALL' | string[]; documentAccess: AuthenticatedUser['documentAccess'];
}

export interface IdentityProvider { readonly id: string; user(userId: string): AuthenticatedUser | null; list(): AuthenticatedUser[] }
export const DEV_DIRECTORY: AuthenticatedUser[] = [
  { id: 'user:mgiri', name: 'Mitra Giri', email: 'mgiri@korvyn.dev', roles: ['FINANCE_REVIEWER'], entityAccess: 'ALL', scopeAccess: 'ALL', documentAccess: 'REFERENCES_ONLY', active: true },
  { id: 'user:skim', name: 'Sarah Kim', email: 'skim@korvyn.dev', roles: ['FINANCE_REVIEWER'], entityAccess: 'ALL', scopeAccess: 'ALL', documentAccess: 'REFERENCES_ONLY', active: true },
  { id: 'user:auditor', name: 'Priya Nair (External Auditor)', email: 'pnair@auditfirm.dev', roles: ['EXTERNAL_AUDITOR'], entityAccess: 'ALL', scopeAccess: 'ALL', documentAccess: 'REFERENCES_ONLY', active: true },
  { id: 'user:cfo', name: 'Dana Reyes (CFO)', email: 'dreyes@korvyn.dev', roles: ['CFO'], entityAccess: 'ALL', scopeAccess: 'ALL', documentAccess: 'REFERENCES_ONLY', active: true },
  { id: 'user:mdh', name: 'Jonah Park (MDH Accountant)', email: 'jpark@korvyn.dev', roles: ['ENTITY_ACCOUNTANT'], entityAccess: ['MDH'], scopeAccess: ['MDH'], documentAccess: 'REFERENCES_ONLY', active: true },
];
export class DevIdentityProvider implements IdentityProvider {
  readonly id = 'dev-directory';
  constructor(private readonly users: AuthenticatedUser[] = DEV_DIRECTORY) {}
  user(userId: string) { return this.users.find((u) => u.id === userId && u.active) ?? null; }
  list() { return this.users.filter((u) => u.active); }
}

export function actorContext(user: AuthenticatedUser, sessionId: string | null, via: string): ActorContext {
  const caps = [...new Set(user.roles.flatMap((r) => ROLE_CAPABILITIES[r] ?? []))].filter((c) => !FUTURE_GOVERNED.includes(c));
  return { id: user.id, name: user.name, role: user.roles[0] ?? 'NONE', permissions: caps, scopeIds: user.entityAccess, user, sessionId, authenticatedVia: via, entityAccess: user.entityAccess, scopeAccess: user.scopeAccess, documentAccess: user.documentAccess };
}

/* ================================================================================================
   AUTHORIZATION SERVICE
   ================================================================================================ */
export interface Resource { entity?: string | null; scope?: string | null; kind?: string }
export type Decision = { allowed: true } | { allowed: false; reason: string; capability: Capability };
export const AuthorizationService = {
  can(actor: Pick<ActorContext, 'role' | 'permissions' | 'entityAccess' | 'scopeIds'>, capability: Capability, resource: Resource = {}): Decision {
    if (!actor.permissions.includes(capability)) return { allowed: false, capability, reason: `${actor.role} lacks ${capability}` };
    const access = actor.entityAccess ?? actor.scopeIds;
    const ent = resource.entity ?? resource.scope ?? null;
    if (ent && access !== 'ALL') {
      if (ent === 'GROUP' || !access.includes(ent)) return { allowed: false, capability, reason: `${actor.role} may not access ${ent === 'GROUP' ? 'group-level' : ent} ${resource.kind ?? 'data'}` };
    }
    return { allowed: true };
  },
};

/* ================================================================================================
   SEGREGATION OF DUTIES — the architecture hook. Policies are data; ActionGovernance asks by id.
   ================================================================================================ */
export interface SoDContext { actorId: string; preparerId?: string | null; reviewerId?: string | null; approverId?: string | null; proposerId?: string | null }
export interface SoDPolicy { id: string; description: string; appliesTo: string[]; check(c: SoDContext): string | null }
const INITIAL_TO_USER: Record<string, string> = { 'M. Reyes': 'user:mreyes', 'A. Okafor': 'user:aokafor', 'L. Chen': 'user:lchen', 'K. Weber': 'user:kweber', 'M. Giri': 'user:mgiri', 'Mitra Giri': 'user:mgiri', 'Sarah Kim': 'user:skim' };
export const personId = (nameOrId: string | null | undefined) => (!nameOrId ? null : nameOrId.startsWith('user:') ? nameOrId : INITIAL_TO_USER[nameOrId] ?? null);
export const SOD_POLICIES: SoDPolicy[] = [
  { id: 'SOD-PREPARER-NOT-REVIEWER', description: 'The preparer of a reconciliation or flux explanation cannot be its reviewer.', appliesTo: ['ASSIGN_REVIEWER'],
    check: (c) => (c.preparerId && c.reviewerId && c.preparerId === c.reviewerId ? 'the preparer cannot review their own work' : null) },
  { id: 'SOD-PREPARER-NOT-APPROVER', description: 'A preparer cannot approve their own reconciliation.', appliesTo: ['RECONCILIATION_APPROVAL'],
    check: (c) => (c.preparerId && c.preparerId === c.actorId ? 'you prepared this reconciliation and cannot approve it' : null) },
  { id: 'SOD-CERTIFIER-NOT-PREPARER', description: 'A certifier cannot certify controlled work they prepared.', appliesTo: ['CLOSE_CERTIFICATION'],
    check: (c) => (c.preparerId && c.preparerId === c.actorId ? 'you prepared controlled work in this close and cannot certify it' : null) },
  { id: 'SOD-MAPPING-PROPOSER-NOT-APPROVER', description: 'A mapping change requires an approver other than its proposer.', appliesTo: ['MAPPING_CHANGE'],
    check: (c) => (c.proposerId && c.approverId && c.proposerId === c.approverId ? 'the proposer of a mapping change cannot approve it' : null) },
];
export const SoDPolicyService = {
  evaluate(actionType: string, c: SoDContext): { policyId: string; ok: boolean; reason: string | null }[] {
    return SOD_POLICIES.filter((p) => p.appliesTo.includes(actionType)).map((p) => { const r = p.check(c); return { policyId: p.id, ok: !r, reason: r }; });
  },
  /** the questions a future governed action asks before it may run. Nothing here is executable yet: approval and
   *  certification capabilities are granted to no role, so `canApprove` is false for everyone in this phase. */
  canPrepare(actor: Pick<ActorContext, 'id' | 'permissions'>, work: { reviewerId?: string | null }) {
    return work.reviewerId && work.reviewerId === actor.id ? { ok: false, reason: 'you are the reviewer of this work and cannot prepare it' } : { ok: true, reason: null };
  },
  canReview(actor: Pick<ActorContext, 'id'>, work: { preparerId?: string | null }) {
    return this.isOwnWork(actor, work) ? { ok: false, reason: 'you prepared this work and cannot review it' } : { ok: true, reason: null };
  },
  canApprove(actor: Pick<ActorContext, 'id' | 'permissions'>, work: { preparerId?: string | null }, capability: Capability = 'RECON_APPROVE') {
    if (!actor.permissions.includes(capability)) return { ok: false, reason: `${capability} is not granted in this phase` };
    return this.isOwnWork(actor, work) ? { ok: false, reason: 'you prepared this work and cannot approve it' } : { ok: true, reason: null };
  },
  isOwnWork: (actor: Pick<ActorContext, 'id'>, work: { preparerId?: string | null }) => !!work.preparerId && personId(work.preparerId) === actor.id,
};

/* ================================================================================================
   AUTHENTICATION BOUNDARY
     AuthProvider  ->  AuthenticatedSession  ->  ActorContext  ->  AuthorizationService
   The rest of Korvyn asks `AuthContext.resolve(req)` and never learns whether the identity came from the development
   session provider or, later, Entra ID / Okta / another OIDC or SAML provider — a new AuthProvider, nothing else.
   ================================================================================================ */
export interface AuthenticatedSession { sessionId: string; userId: string; csrfToken: string; issuedAt: string; expiresAt: string; provider: string }
export interface AuthProvider {
  readonly id: string;
  /** the live session carried by this request, or null. May establish one (dev auto sign-in) when `res` is given. */
  authenticate(req: IncomingMessage, res: ServerResponse | null): AuthenticatedSession | null;
  signOut(req: IncomingMessage, res: ServerResponse): void;
}
export interface AuthResolution { session: AuthenticatedSession; actor: ActorContext }

const COOKIE = 'korvyn_session';
const TTL_HOURS = 12;
/** Secure in HTTPS environments (TLS socket, an HTTPS proxy, or KORVYN_COOKIE_SECURE=1); plain HTTP stays usable locally */
export function secureRequest(req: IncomingMessage, env: NodeJS.ProcessEnv = process.env) {
  return env['KORVYN_COOKIE_SECURE'] === '1' || (req.socket as { encrypted?: boolean } | undefined)?.encrypted === true || String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim() === 'https';
}
export function sessionCookie(req: IncomingMessage, value: string, maxAgeSeconds: number, env: NodeJS.ProcessEnv = process.env) {
  return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secureRequest(req, env) ? '; Secure' : ''}`;
}
const cookieOf = (req: IncomingMessage) => (req.headers.cookie ?? '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? null;

/** the development provider: server-side sessions in the work store, an opaque HttpOnly cookie, and a fixed directory */
export class DevSessionAuthProvider implements AuthProvider {
  readonly id = 'dev-session';
  readonly mode: 'dev' | 'strict';
  private readonly devUser: string;
  constructor(private readonly repos: WorkRepositories, readonly idp: IdentityProvider = new DevIdentityProvider(), private readonly env: NodeJS.ProcessEnv = process.env) {
    this.mode = (env['KORVYN_AUTH_MODE'] ?? 'dev') === 'dev' ? 'dev' : 'strict';
    this.devUser = env['KORVYN_DEV_USER'] ?? 'user:mgiri';
  }
  private issue(req: IncomingMessage, res: ServerResponse, userId: string): AuthenticatedSession {
    const s = this.repos.sessions.create(userId, TTL_HOURS);
    res.setHeader('Set-Cookie', sessionCookie(req, s.id, TTL_HOURS * 3600, this.env));
    return { sessionId: s.id, userId, csrfToken: s.csrfToken, issuedAt: s.createdAt, expiresAt: s.expiresAt, provider: this.id };
  }
  authenticate(req: IncomingMessage, res: ServerResponse | null): AuthenticatedSession | null {
    const sid = cookieOf(req);
    const s = sid ? this.repos.sessions.resolve(sid) : null;
    if (s && this.idp.user(s.userId)) return { sessionId: s.id, userId: s.userId, csrfToken: s.csrfToken, issuedAt: s.createdAt, expiresAt: s.expiresAt, provider: this.id };
    if (this.mode !== 'dev' || !res || !this.idp.user(this.devUser)) return null;
    return this.issue(req, res, this.devUser);
  }
  /** dev only: sign in as another directory user (simulates an IdP login) */
  signInAs(req: IncomingMessage, res: ServerResponse, userId: string): AuthenticatedSession | null {
    if (this.mode !== 'dev' || !this.idp.user(userId)) return null;
    const old = cookieOf(req); if (old) this.repos.sessions.revoke(old);
    return this.issue(req, res, userId);
  }
  signOut(req: IncomingMessage, res: ServerResponse) {
    const sid = cookieOf(req); if (sid) this.repos.sessions.revoke(sid);
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0, this.env));
  }
}

/** the one place the server turns a request into an actor */
export class AuthContext {
  constructor(readonly provider: AuthProvider & { mode?: 'dev' | 'strict' }, readonly idp: IdentityProvider) {}
  get mode() { return this.provider.mode ?? 'strict'; }
  resolve(req: IncomingMessage, res: ServerResponse | null): AuthResolution | null {
    const session = this.provider.authenticate(req, res);
    const user = session ? this.idp.user(session.userId) : null;
    return session && user ? { session, actor: actorContext(user, session.sessionId, session.provider) } : null;
  }
}

/** @deprecated 3C name kept for callers and tests: the development provider behind AuthContext */
export class SessionService {
  readonly provider: DevSessionAuthProvider;
  readonly auth: AuthContext;
  constructor(repos: WorkRepositories, idp: IdentityProvider = new DevIdentityProvider(), env: NodeJS.ProcessEnv = process.env) {
    this.provider = new DevSessionAuthProvider(repos, idp, env);
    this.auth = new AuthContext(this.provider, idp);
  }
  get mode() { return this.provider.mode; }
  resolve(req: IncomingMessage, res: ServerResponse | null): ActorContext | null { return this.auth.resolve(req, res)?.actor ?? null; }
  switchTo(req: IncomingMessage, res: ServerResponse, userId: string): ActorContext | null {
    const s = this.provider.signInAs(req, res, userId);
    const u = s ? this.provider.idp.user(s.userId) : null;
    return s && u ? actorContext(u, s.sessionId, `${s.provider} (dev sign-in)`) : null;
  }
}
