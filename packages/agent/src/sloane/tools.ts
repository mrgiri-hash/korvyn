/**
 * SLOANE'S SERVER-SIDE TOOL REGISTRY, ACTOR AND PERMISSIONS.
 *
 * The browser never sees this file's contents: it receives FinancialObjects, not tool definitions. The planner
 * sees each allowlisted tool's id, description and inputs — never its implementation.
 *
 * Three independent gates run before any tool executes, all here, all server-side:
 *   1. PERMISSION  — the actor holds the tool's permission and may see the requested scope;
 *   2. GOVERNANCE  — the tool's risk level is READ (write actions are disabled: WRITE_ACTIONS_ENABLED is a
 *                    constant, not configuration);
 *   3. ARGUMENTS   — every declared input is present and resolves to a governed value.
 */
import { postToLedger } from '../humanApproval.js';
import { BASIS, FX_RATE_SET, SNAPSHOT_ID, type FinancialDataService, money, periodLabel } from './financials.js';

export type Risk = 'READ' | 'CONFIRM' | 'GOVERNED';
export type Permission = 'VIEW_FINANCIAL_STATEMENTS' | 'VIEW_TRIAL_BALANCE' | 'POST_JOURNAL';
export const WRITE_ACTIONS_ENABLED = false as const;

/* ---- the actor ----------------------------------------------------------------------------------
   This prototype server has no authentication, so the actor is a SERVER-configured identity. It is never read
   from a request body: a browser cannot claim a role or widen its scopes. */
export interface Actor { id: string; name: string; role: string; permissions: Permission[]; scopeIds: 'ALL' | string[] }
const ROLES: Record<string, Omit<Actor, 'id' | 'name'>> = {
  FINANCE_REVIEWER: { role: 'FINANCE_REVIEWER', permissions: ['VIEW_FINANCIAL_STATEMENTS', 'VIEW_TRIAL_BALANCE'], scopeIds: 'ALL' },
  ENTITY_ACCOUNTANT: { role: 'ENTITY_ACCOUNTANT', permissions: ['VIEW_FINANCIAL_STATEMENTS', 'VIEW_TRIAL_BALANCE'], scopeIds: ['MDH'] },
};
export function serverActor(env: NodeJS.ProcessEnv = process.env): Actor {
  const r = ROLES[String(env['SLOANE_ACTOR_ROLE'] ?? '')] ?? ROLES['FINANCE_REVIEWER']!;
  return { id: 'user:mgiri', name: 'M. Giri', ...r };
}

/* ---- financial objects: what the browser receives ------------------------------------------------ */
export interface Fact { key: string; label: string; value: number | string; display: string }
export interface FinancialObject {
  id: string;
  type: 'IncomeStatement' | 'TrialBalance';
  title: string;
  scope: { id: string; name: string };
  periods: string[];
  periodLabel: string;
  currency: string;
  basis: string;
  unit: string;
  table: { columns: string[]; rows: { label: string; level: number; kind: 'line' | 'subtotal' | 'total'; cells: string[] }[] };
  facts: Fact[];
  provenance: { source: string; snapshotId: string; journalLines: number; fxRateSetId: string | null; eliminations: string | null };
  governed: true;
}

export interface ParamSpec { name: string; kind: 'period' | 'scope' | 'entity'; required: boolean; description: string }
export type ToolArgs = Record<string, string>;
export interface ToolEnv { data: FinancialDataService; actor: Actor; objectId: string }
export interface SloaneTool {
  id: string;
  description: string;
  objectTypes: string[];
  params: ParamSpec[];
  outputs: string;
  permission: Permission;
  risk: Risk;
  run(args: ToolArgs, env: ToolEnv): { object: FinancialObject; warnings: string[] };
}

const periodRange = (all: string[], a: string, b: string) => all.filter((p) => p >= a && p <= b);

const TOOLS: SloaneTool[] = [
  {
    id: 'getIncomeStatement',
    description: 'Monthly income statement (one column per month) for a governed scope and an inclusive month range, derived from posted journal lines. Group scope is consolidated in USD with intercompany eliminated.',
    objectTypes: ['INCOME_STATEMENT', 'FINANCIAL_STATEMENT'],
    params: [
      { name: 'periodStart', kind: 'period', required: true, description: 'first month, YYYY-MM' },
      { name: 'periodEnd', kind: 'period', required: true, description: 'last month, YYYY-MM' },
      { name: 'scope', kind: 'scope', required: true, description: 'governed scope id' },
    ],
    outputs: 'IncomeStatement: rows by account, monthly columns; facts totalRevenue.<period>, netIncome.<period>, totalRevenue.range, netIncome.range',
    permission: 'VIEW_FINANCIAL_STATEMENTS',
    risk: 'READ',
    run(args, env) {
      const periods = periodRange(env.data.governedPeriods(), args['periodStart']!, args['periodEnd']!);
      const r = env.data.incomeStatement(args['scope']!, periods);
      const ccy = r.currency;
      const facts: Fact[] = [];
      periods.forEach((p, i) => {
        facts.push({ key: `totalRevenue.${p}`, label: `Total revenue · ${periodLabel(p)}`, value: r.totalRevenue[i]!, display: money(r.totalRevenue[i]!, ccy) });
        facts.push({ key: `netIncome.${p}`, label: `Net income · ${periodLabel(p)}`, value: r.netIncome[i]!, display: money(r.netIncome[i]!, ccy) });
      });
      const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
      const rangeLabel = periods.length > 1 ? `${periodLabel(periods[0]!)}–${periodLabel(periods[periods.length - 1]!)}` : periodLabel(periods[0]!);
      facts.push({ key: 'totalRevenue.range', label: `Total revenue · ${rangeLabel}`, value: sum(r.totalRevenue), display: money(sum(r.totalRevenue), ccy) });
      facts.push({ key: 'netIncome.range', label: `Net income · ${rangeLabel}`, value: sum(r.netIncome), display: money(sum(r.netIncome), ccy) });
      facts.push({ key: 'scope', label: 'Scope', value: r.scope.name, display: r.scope.name });
      facts.push({ key: 'periods', label: 'Periods', value: rangeLabel, display: rangeLabel });
      const warnings: string[] = [];
      if (r.translated) warnings.push(`Non-USD entities are presented in USD at ${FX_RATE_SET.id} (${FX_RATE_SET.type}, representative).`);
      return {
        warnings,
        object: {
          id: env.objectId, type: 'IncomeStatement', title: `Income statement · ${rangeLabel}`,
          scope: { id: r.scope.id, name: r.scope.name }, periods, periodLabel: rangeLabel, currency: ccy, basis: BASIS, unit: `${ccy} millions`,
          table: { columns: periods.map(periodLabel), rows: r.rows.map((x) => ({ label: x.label, level: x.level, kind: x.kind, cells: x.displays })) },
          facts,
          provenance: {
            source: '@korvyn/core validated enterprise GL — posted journal lines', snapshotId: SNAPSHOT_ID, journalLines: r.journalLines,
            fxRateSetId: r.fxRateSetId,
            eliminations: r.eliminated.some((v) => v !== 0) ? `Intercompany management fees eliminated (${r.eliminated.map((v) => money(v, ccy)).join(' · ')})` : null,
          },
          governed: true,
        },
      };
    },
  },
  {
    id: 'getTrialBalance',
    description: 'Cumulative trial balance for ONE legal entity through a month, in its functional currency. Not available for the consolidated group (a consolidated trial balance needs a closing-rate set that is not modelled).',
    objectTypes: ['TRIAL_BALANCE'],
    params: [
      { name: 'period', kind: 'period', required: true, description: 'month, YYYY-MM' },
      { name: 'entity', kind: 'entity', required: true, description: 'legal entity id' },
    ],
    outputs: 'TrialBalance: rows by account with debit and credit; facts debit, credit, difference',
    permission: 'VIEW_TRIAL_BALANCE',
    risk: 'READ',
    run(args, env) {
      const r = env.data.trialBalance(args['entity']!, args['period']!);
      const c = r.currency;
      return {
        warnings: [],
        object: {
          id: env.objectId, type: 'TrialBalance', title: `Trial balance · ${periodLabel(r.through)}`,
          scope: { id: r.entity.id, name: r.entity.name }, periods: [r.through], periodLabel: periodLabel(r.through), currency: c, basis: BASIS, unit: `${c} millions`,
          table: { columns: ['Debit', 'Credit'], rows: r.rows.map((x) => ({ label: `${x.code} ${x.name}`, level: 1, kind: 'line' as const, cells: [x.debit ? money(x.debit, c) : '', x.credit ? money(x.credit, c) : ''] })) },
          facts: [
            { key: 'debit', label: 'Total debits', value: r.debit, display: money(r.debit, c) },
            { key: 'credit', label: 'Total credits', value: r.credit, display: money(r.credit, c) },
            { key: 'difference', label: 'Difference', value: r.difference, display: money(r.difference, c) },
          ],
          provenance: { source: '@korvyn/core validated enterprise GL — posted journal lines', snapshotId: SNAPSHOT_ID, journalLines: r.journalLines, fxRateSetId: null, eliminations: null },
          governed: true,
        },
      };
    },
  },
  {
    /* Registered so governance is provable: it is never offered to the planner, and a plan that names it is
       rejected. Even if it ran, the ledger guard refuses without a HumanApproval token no agent path can mint. */
    id: 'postJournalEntry',
    description: 'Post a journal entry to the ERP.',
    objectTypes: [],
    params: [],
    outputs: 'none',
    permission: 'POST_JOURNAL',
    risk: 'GOVERNED',
    run() { postToLedger({}); },
  },
];

export const toolRegistry = {
  all: (): readonly SloaneTool[] => TOOLS,
  get: (id: string): SloaneTool | undefined => TOOLS.find((t) => t.id === id),
};

export type Gate = { ok: true } | { ok: false; gate: 'PERMISSION' | 'GOVERNANCE' | 'SCOPE'; reason: string };
export function authorize(actor: Actor, tool: SloaneTool, args?: ToolArgs): Gate {
  if (tool.risk !== 'READ' && !WRITE_ACTIONS_ENABLED) return { ok: false, gate: 'GOVERNANCE', reason: `${tool.id} is a ${tool.risk} action and write actions are disabled` };
  if (!actor.permissions.includes(tool.permission)) return { ok: false, gate: 'PERMISSION', reason: `${actor.role} lacks ${tool.permission}` };
  const sc = args?.['scope'] ?? args?.['entity'];
  if (sc && actor.scopeIds !== 'ALL' && !actor.scopeIds.includes(sc)) return { ok: false, gate: 'SCOPE', reason: `${actor.role} may not view scope ${sc}` };
  return { ok: true };
}
