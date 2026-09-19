/**
 * SLOANE'S SERVER-SIDE TOOL REGISTRY, ACTOR AND PERMISSIONS.
 *
 * The browser never sees this file's contents: it receives FinancialObjects, not tool definitions. The planner
 * sees each allowlisted tool's id, description and inputs — never its implementation, and never a tool the actor
 * is not permitted to use (the allowlist is filtered BEFORE it is shown, and every call is authorized AGAIN at
 * execution).
 *
 * Three independent gates run before any tool executes, all here, all server-side:
 *   1. PERMISSION  — the actor holds the tool's permission, and every scope/entity argument is within the actor's
 *                    entity scope (row-level: every tool also reads only the actor's visible entities);
 *   2. GOVERNANCE  — the tool's risk level is READ (write actions are disabled: WRITE_ACTIONS_ENABLED is a
 *                    constant, not configuration);
 *   3. ARGUMENTS   — every declared input is present and resolves to a governed value (orchestrator Planner).
 */
import { postToLedger } from '../humanApproval.js';
import { type Capability, DEV_DIRECTORY, ROLE_CAPABILITIES, actorContext } from './auth.js';
import type { ControlService } from './controls.js';
import type { FinancialDataService } from './financials.js';
import type { GovernedLedger } from './governed.js';

/** PROPOSE: prepares an ActionProposal or a session draft and writes nothing to Korvyn work. */
export type Risk = 'READ' | 'PROPOSE' | 'CONFIRM' | 'GOVERNED';
/** Authorization is by CAPABILITY (auth.ts); a tool's permission is a capability name. */
export type Permission = Capability;
export const WRITE_ACTIONS_ENABLED = false as const;
export type Domain = 'financials' | 'tb' | 'ledger' | 'analysis' | 'flux' | 'recon' | 'close' | 'reporting' | 'audit' | 'evidence' | 'trace' | 'find' | 'governance' | 'action' | 'build' | 'semantic';

/* ---- the actor ----------------------------------------------------------------------------------
   Every request's actor is an ActorContext built by SessionService from the authenticated SESSION (auth.ts). It is
   never read from a request body: a browser cannot claim an id, a role, a capability or a scope. `Actor` is the
   subset tools and services read. */
export interface Actor { id: string; name: string; role: string; permissions: Permission[]; scopeIds: 'ALL' | string[]; entityAccess?: 'ALL' | string[] }
/** role bundles as Actor shapes, for tests and offline tools; production actors come from sessions */
export const ROLES: Record<string, Omit<Actor, 'id' | 'name'>> = Object.fromEntries(Object.entries(ROLE_CAPABILITIES).map(([role, caps]) => {
  const u = DEV_DIRECTORY.find((x) => x.roles[0] === role);
  return [role, { role, permissions: caps, scopeIds: u?.entityAccess ?? 'ALL' }];
}));
/** the offline default (tests, dry runs, CLI): the dev directory's finance reviewer, never a request-supplied identity */
export function serverActor(): Actor {
  const u = DEV_DIRECTORY[0]!;
  return actorContext(u, null, 'offline');
}

/* ---- financial objects: what the browser receives ------------------------------------------------ */
export interface Fact { key: string; label: string; value: number | string; display: string }
export interface TableRow { label: string; level: number; kind: 'line' | 'subtotal' | 'total'; cells: string[]; ref?: string }
export interface FinancialObject {
  id: string;
  type: string;
  title: string;
  status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
  scope: { id: string; name: string };
  periods: string[];
  periodLabel: string;
  currency: string;
  basis: string;
  unit: string;
  table: { columns: string[]; rows: TableRow[] };
  facts: Fact[];
  /** Phase 7: an agent run's view (progress, checkpoints, result) — rendered as the run card */
  agentRun?: unknown;
  provenance: { source: string; snapshotId: string; journalLines: number | null; fxRateSetId: string | null; eliminations: string | null; declaredInputs: string[] };
  /** a large result set: a definition id, a count and one bounded page — never the rows */
  population: { populationId: string; rowCount: number; returned: number; cursor: number; nextCursor: number | null; sort: string; exportHook: unknown } | null;
  /** machine references a later plan step (`$N.refs.key`) or the next turn's context can point at */
  refs: Record<string, string>;
  /** what this object makes the subject of the conversation */
  focus: { kind: string; id: string; name: string } | null;
  unavailable: { capability: string; reason: string } | null;
  /** an action proposal (type 'ActionProposal') or a session draft; the browser renders it as an ActionPreview */
  action?: import('./actions.js').ActionProposal;
  draft?: { kind: 'REPORT' | 'EXCEL'; id: string; definition: Record<string, unknown> };
  /** Phase 8B: a DYNAMIC FINANCIAL CANVAS (type DynamicFinancialCanvas) — sections composed from governed objects */
  canvas?: Record<string, unknown>;
  /** Phase 8C: a GOVERNED ANALYSIS (type FinancialAnalysis) — definition, grid result, panel, referents */
  analysis?: Record<string, unknown>;
  /** a WORKBOOK PREVIEW (type ExcelWorkbookPreview): tabs, counts, representative rows — the browser renders it striped */
  workbook?: Record<string, unknown>;
  /** a PBC WORKSPACE (type PBCRequest / PBCSupportGaps): the request, its population, selections, gaps — rendered inline */
  pbc?: Record<string, unknown>;
  governed: true;
}

export type ParamKind =
  | 'period' | 'scope' | 'entity' | 'account' | 'dimension' | 'number' | 'text' | 'vendor' | 'project'
  | 'populationId' | 'transactionId' | 'journalId' | 'reconciliationId' | 'reportId' | 'auditPopulationId' | 'pbcId' | 'objectRef';
export interface ParamSpec { name: string; kind: ParamKind; required: boolean; description: string }
export type ToolArgs = Record<string, string>;
export type Visible = Set<string> | 'ALL';
/** what a PROPOSE tool may know about the conversation it runs in — read-only session facts, and the proposal engine */
export interface ToolSession {
  id: string; planId: string; traceId: string; period: string; scope: string;
  focus: { kind: string; id: string; name: string } | null; populationId: string | null;
  lastNarrative: string[]; lastObjects: FinancialObject[]; lastRefs: Record<string, string>;
  investigationId: string; request: string;
  investigation: { objective: string; findings: string[]; objects: { id: string; type: string; title: string }[]; populationIds: string[]; timeline: { at: string; event: string }[] };
  lastToolCalls: { tool: string; args: Record<string, string> }[];
  proposalsThisTurn: string[];
  drafts: { report: { id: string; definition: Record<string, unknown> } | null; excel: { id: string; definition: Record<string, unknown> } | null;
    /** 5A: a PBC request the conversation is creating or changing; the orchestrator keeps it (like a workbook draft) */
    pbc?: import('./audit/pbctools.js').PBCDraft | null };
  engine: import('./actions.js').ActionEngine;
}
export interface ToolEnv {
  data: FinancialDataService; gl: GovernedLedger; controls: ControlService; actor: Actor; objectId: string; visible: Visible;
  session?: ToolSession;
  /** the Artifact Engine — composes previews; persistence and generation happen outside the tool */
  artifacts?: import('./artifacts/engine.js').ArtifactEngine;
  /** 5A: the audit / PBC service — reads; a PBC request is kept by the orchestrator, like a workbook draft */
  pbc?: import('./audit/pbc.js').AuditService;
}
export interface ToolResult { object: FinancialObject; warnings: string[] }
export interface SloaneTool {
  id: string;
  domain: Domain;
  description: string;
  objectTypes: string[];
  params: ParamSpec[];
  outputs: string;
  permission: Permission;
  risk: Risk;
  run(args: ToolArgs, env: ToolEnv): ToolResult;
}

const TOOLS: SloaneTool[] = [];
export const registerTools = (ts: SloaneTool[]) => { for (const t of ts) { if (TOOLS.some((x) => x.id === t.id)) throw new Error(`duplicate Sloane tool ${t.id}`); TOOLS.push(t); } };

/* Registered so governance is provable: it is never offered to the planner, and a plan that names it is
   rejected. Even if it ran, the ledger guard refuses without a HumanApproval token no agent path can mint. */
registerTools([{
  id: 'postJournalEntry', domain: 'governance', description: 'Post a journal entry to the ERP.', objectTypes: [], params: [], outputs: 'none',
  permission: 'ERP_WRITEBACK', risk: 'GOVERNED', run() { postToLedger({}); },
}]);

export const toolRegistry = {
  all: (): readonly SloaneTool[] => TOOLS,
  get: (id: string): SloaneTool | undefined => TOOLS.find((t) => t.id === id),
};

export const visibleOf = (actor: Actor): Visible => (actor.scopeIds === 'ALL' ? 'ALL' : new Set(actor.scopeIds));

export type Gate = { ok: true } | { ok: false; gate: 'PERMISSION' | 'GOVERNANCE' | 'SCOPE'; reason: string };
export function authorize(actor: Actor, tool: SloaneTool, args?: ToolArgs): Gate {
  /* READ reads; PROPOSE prepares a proposal and writes nothing. Anything else is a write, and no model-reachable write exists. */
  if (tool.risk !== 'READ' && tool.risk !== 'PROPOSE' && !WRITE_ACTIONS_ENABLED) return { ok: false, gate: 'GOVERNANCE', reason: `${tool.id} is a ${tool.risk} action and write actions are disabled for the model; changes go through confirmed Korvyn action services` };
  if (!actor.permissions.includes(tool.permission)) return { ok: false, gate: 'PERMISSION', reason: `${actor.role} lacks ${tool.permission}` };
  if (actor.scopeIds !== 'ALL') for (const k of ['scope', 'entity']) {
    const sc = args?.[k];
    if (sc && !actor.scopeIds.includes(sc)) return { ok: false, gate: 'SCOPE', reason: `${actor.role} may not view scope ${sc}` };
  }
  return { ok: true };
}
