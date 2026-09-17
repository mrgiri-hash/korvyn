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
  | 'ANALYSIS_SAVE' | 'INVESTIGATION_SAVE' | 'ARTIFACT_CREATE' | 'SUPPORT_PACKAGE_CREATE'
  /* future governed capabilities: declared so policy can name them; granted to NO role in this phase */
  | 'RECON_APPROVE' | 'CLOSE_CERTIFY' | 'REPORT_PUBLISH' | 'MAPPING_CHANGE' | 'ERP_WRITEBACK';
export const FUTURE_GOVERNED: Capability[] = ['RECON_APPROVE', 'CLOSE_CERTIFY', 'REPORT_PUBLISH', 'MAPPING_CHANGE', 'ERP_WRITEBACK'];

const VIEW_ALL: Capability[] = ['FINANCIALS_VIEW', 'TB_VIEW', 'GL_VIEW', 'FLUX_VIEW', 'RECON_VIEW', 'CLOSE_VIEW', 'EVIDENCE_VIEW', 'REPORT_VIEW', 'AUDIT_VIEW'];
export const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  FINANCE_REVIEWER: [...VIEW_ALL, 'FLUX_COMMENT', 'RECON_COMMENT', 'SUPPORT_ATTACH', 'REPORT_CREATE', 'ISSUE_CREATE', 'REVIEW_ASSIGN', 'ANALYSIS_SAVE', 'INVESTIGATION_SAVE', 'ARTIFACT_CREATE', 'SUPPORT_PACKAGE_CREATE'],
  /* one book, commenting and support on it; no group statements, no audit, no reviewer assignment, no shared reports */
  ENTITY_ACCOUNTANT: ['FINANCIALS_VIEW', 'TB_VIEW', 'GL_VIEW', 'FLUX_VIEW', 'RECON_VIEW', 'CLOSE_VIEW', 'EVIDENCE_VIEW', 'RECON_COMMENT', 'SUPPORT_ATTACH', 'ISSUE_CREATE', 'ANALYSIS_SAVE', 'ARTIFACT_CREATE'],
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
};

/* ================================================================================================
   SESSION SERVICE
   ================================================================================================ */
const COOKIE = 'korvyn_session';
export class SessionService {
  readonly mode: 'dev' | 'strict';
  constructor(private readonly repos: WorkRepositories, readonly idp: IdentityProvider = new DevIdentityProvider(), env: NodeJS.ProcessEnv = process.env) {
    this.mode = (env['KORVYN_AUTH_MODE'] ?? 'dev') === 'dev' ? 'dev' : 'strict';
    this.devUser = env['KORVYN_DEV_USER'] ?? 'user:mgiri';
  }
  private readonly devUser: string;
  private cookieOf(req: IncomingMessage) { return (req.headers.cookie ?? '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? null; }
  /** the actor for this request, from the session cookie; dev mode signs an anonymous request in as the dev user */
  resolve(req: IncomingMessage, res: ServerResponse | null): ActorContext | null {
    const sid = this.cookieOf(req);
    const s = sid ? this.repos.sessions.resolve(sid) : null;
    const user = s ? this.idp.user(s.userId) : null;
    if (user) return actorContext(user, sid, this.idp.id);
    if (this.mode !== 'dev' || !res) return null;
    const dev = this.idp.user(this.devUser);
    if (!dev) return null;
    const nsid = this.repos.sessions.create(dev.id);
    res.setHeader('Set-Cookie', `${COOKIE}=${nsid}; HttpOnly; SameSite=Strict; Path=/`);
    return actorContext(dev, nsid, `${this.idp.id} (dev auto sign-in)`);
  }
  /** dev only: sign in as another directory user (simulates an IdP login; loopback callers only) */
  switchTo(req: IncomingMessage, res: ServerResponse, userId: string): ActorContext | null {
    if (this.mode !== 'dev') return null;
    const u = this.idp.user(userId);
    if (!u) return null;
    const old = this.cookieOf(req); if (old) this.repos.sessions.revoke(old);
    const sid = this.repos.sessions.create(u.id);
    res.setHeader('Set-Cookie', `${COOKIE}=${sid}; HttpOnly; SameSite=Strict; Path=/`);
    return actorContext(u, sid, `${this.idp.id} (dev sign-in)`);
  }
}
