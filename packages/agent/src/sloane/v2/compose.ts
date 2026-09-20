/**
 * THE COMPOSED GOVERNED SURFACE (§15/§16).
 *
 * Twenty-nine registered READ tools are twenty-nine variations of about seven financial operations. Showing all of
 * them to the model every turn costs 5.3k tokens of attention and makes the model choose between near-identical
 * capabilities. This file exposes the OPERATIONS and keeps the capabilities.
 *
 * WHAT A COMPOSED TOOL IS, AND WHAT IT IS NOT:
 *   IS      a dispatcher. It reads its arguments, resolves a finance word to governed members through the concept
 *           layer, picks the registered tool that answers it, and runs THAT tool — which re-authorizes, computes
 *           through `GovernedLedger`, and returns its own governed object unchanged.
 *   IS NOT  a query engine. It computes nothing, it holds no balance semantic, and it can only reach tools the
 *           actor is already permitted to use. There is no generic SQL here and there must never be.
 *
 * So the governance chain is untouched: permission is still checked per underlying tool, argument validation is
 * still the registered tool's, and the output is still a governed FinancialObject.
 */
import { resolveMeasure } from '../semantic/concepts.js';
import { accountArg, resolveSubject } from '../semantic/concepttools.js';
import { base, row } from '../toolset.js';
import { type Actor, type FinancialObject, type SloaneTool, type ToolArgs, type ToolEnv, authorize, toolRegistry } from '../tools.js';
import type { V2ToolDef } from './tools.js';

/** what a composed tool decided: run this governed tool, or answer here because there is nothing honest to read */
export type ComposedPlan =
  | { kind: 'RUN'; tool: string; args: ToolArgs; note?: string; title?: string }
  | { kind: 'ANSWER'; object: FinancialObject; note?: string };

export interface ComposedTool {
  name: string;
  /** every registered tool this facade can reach — used to filter exposure and to describe it honestly */
  covers: string[];
  /** built per actor, so the description names only what this person may actually ask for */
  def: (env: DescribeEnv) => V2ToolDef;
  plan: (args: ToolArgs, env: ToolEnv) => ComposedPlan;
}

export interface DescribeEnv { allows: (toolId: string) => boolean }

const S = (description: string) => ({ type: 'string' as const, description });
const def = (name: string, description: string, props: Record<string, { type: 'string'; description: string }>, required: string[] = []): V2ToolDef =>
  ({ name, description, input_schema: { type: 'object', properties: props, required, additionalProperties: false } });

/** a concept that cannot honestly produce a figure answers in place, with what Korvyn does hold */
function blockedObject(env: ToolEnv, title: string, s: ReturnType<typeof resolveSubject>): FinancialObject {
  const b = s.blocked!;
  const r = s.resolution;
  const rows = (r?.mappings ?? []).map((m) => row(m.label, [m.members.join(', ') || 'derived', m.basis, m.note], 1, 'line', `mapping:${m.mappingId}`));
  return base(env, {
    type: 'FinancialConcept', title,
    status: b.kind === 'NOT_HELD' ? 'UNAVAILABLE' : 'PARTIAL',
    table: { columns: ['Reading', 'Accounts', 'Basis', 'Note'], rows },
    facts: [
      { key: 'concept', label: 'Concept', value: r?.concept?.conceptId ?? s.label, display: r?.concept?.canonicalName ?? s.label },
      { key: 'resolution', label: 'Enterprise resolution', value: b.kind, display: b.kind },
      { key: 'reason', label: 'Why no figure', value: b.message, display: b.message },
      ...(r?.analysisPaths ?? []).slice(0, 3).map((t, i) => ({ key: `canShow${i + 1}`, label: 'Korvyn can show', value: t, display: t })),
    ],
    ...(b.kind === 'NOT_HELD' ? { unavailable: { capability: s.label, reason: b.message } } : {}),
    ...(r?.concept ? { refs: { conceptId: r.concept.conceptId } } : {}),
    provenance: { source: 'Korvyn governed financial concept catalogue and chart of accounts', snapshotId: 'CONCEPTS-1', journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] },
  });
}

/**
 * The subject → governed members step every measure tool shares.
 * A DEFAULTED concept resolves and carries a NOTE: Korvyn read the term the way a finance professional would, the
 * tenant has not ruled, and the answer has to say which reading it used (§7).
 */
function subjectStep(args: ToolArgs, env: ToolEnv, title: string): { account?: string; note?: string; measure?: 'BALANCE' | 'ACTIVITY'; blocked?: ComposedPlan } {
  const s = resolveSubject(env, args['subject']);
  if (s.blocked) return { blocked: { kind: 'ANSWER', object: blockedObject(env, title, s), note: s.blocked.message } };
  const acct = accountArg(s);
  const note = s.resolution?.status === 'DEFAULTED' ? s.resolution.notes[0] : undefined;
  /* §13 — what the person asked for: the explicit argument, else the sentence's own verb, else what the term
     means. Capex asked as spend is ACTIVITY even though its accounts sit on the balance sheet. */
  const measure = resolveMeasure(args['subject'] ?? '', s.resolution?.concept ?? null, args['measure']) ?? undefined;
  return { ...(acct ? { account: acct } : {}), ...(note ? { note } : {}), ...(measure ? { measure } : {}) };
}

/**
 * §28 — A TITLE IS READ BY A PERSON, AND THE PERSON SAID THE WORD.
 *
 * The registered tools name an object from what they were GIVEN, which is how a governed read of OPEX came back
 * titled "Top movements by vendor · 50000,60000 · MDH · Jun 2026 vs May 2026" — accurate, and written in the
 * argument list rather than in the language of the question. The dispatcher is the one place that still knows
 * the person's own word for the subject, so it is the one place that can put it back.
 *
 * The codes are not lost: they stay on the object's refs, its provenance and its trace, which is where somebody
 * checking the population looks for them.
 */
function businessTitle(subject: string | undefined, what: string, scope: string | undefined, periods: string): string | undefined {
  if (!subject) return undefined;
  const label = /^[\d,\s]+$/.test(subject) ? subject : subject.replace(/\s+/g, ' ').trim();
  const name = label.length <= 3 ? label.toUpperCase() : label.charAt(0).toUpperCase() + label.slice(1);
  const scoped = scope && scope !== 'GROUP' ? ` — ${scope}` : '';
  return [`${name}${what ? ` ${what}` : ''}${scoped}`, periods].filter(Boolean).join(' · ');
}
const periodPhrase = (p: string | undefined, through?: string, cmp?: string) =>
  through ? `${p}–${through}` : cmp && cmp.toLowerCase() !== 'none' ? `${p} vs ${cmp}` : (p ?? '');

/** one governed argument map from several partial ones; a key with no value is dropped, never sent as empty */
const A = (...parts: Record<string, string | undefined>[]): ToolArgs =>
  Object.fromEntries(parts.flatMap((x) => Object.entries(x)).filter(([, v]) => v !== undefined && v !== '')) as ToolArgs;
const carry = (args: ToolArgs, keys: string[]): ToolArgs => Object.fromEntries(keys.filter((k) => args[k]).map((k) => [k, args[k]!])) as ToolArgs;

/* ================================================================================================
   THE OPERATIONS
   ================================================================================================ */

const STATEMENT: ComposedTool = {
  name: 'getStatement',
  covers: ['getFinancialSummary', 'getIncomeStatement', 'getBalanceSheet', 'getTrialBalance', 'getFinancialStatementLine'],
  def: () => def('getStatement',
    'A governed statement or one line of it. view: summary (revenue, NOI, net income, assets, cash, CIP with prior and change) | income_statement | balance_sheet | trial_balance | line. '
    + 'Set subject to read ONE line or one finance concept — an account code such as 15000, or a term such as "CIP", "accounts receivable", "operating expenses"; Korvyn resolves the term to its governed accounts and says so if the book supports more than one reading.',
    { view: S('summary | income_statement | balance_sheet | trial_balance | line. Defaults to line when subject is set, else summary.'),
      subject: S('an account or group code, or a finance term in the person’s own words'),
      period: S('month, YYYY-MM'),
      through: S('for income_statement: the last month of a range, YYYY-MM'),
      measure: S('balance | activity — whether they asked what is THERE at a date or what MOVED in the period. Leave out when the term itself settles it.'),
      scope: S('governed scope id (GROUP or an entity id); defaults to the conversation’s scope') },
    ['period']),
  plan(a, env) {
    const view = (a['view'] ?? (a['subject'] ? 'line' : 'summary')).toLowerCase();
    const p = a['period']!;
    if (view.startsWith('line') || (a['subject'] && view === 'summary')) {
      const s = subjectStep(a, env, `${a['subject']} · ${p}`);
      if (s.blocked) return s.blocked;
      if (!s.account) return { kind: 'RUN', tool: 'getFinancialSummary', args: A({ period: p, ...carry(a, ['scope']) }), note: `Korvyn could not resolve "${a['subject']}" to a governed line; showing the statement summary.` };
      /* §13 — A STATEMENT LINE IS A BALANCE, AND THAT IS NOT ALWAYS WHAT WAS ASKED. "How much capex did we spend
         in June" reaches this tool with capex's accounts, and returning their balance would answer a question
         nobody asked with figures that are individually correct. An ACTIVITY measure goes to the analysis that
         reports what posted in the window instead. */
      if (s.measure === 'ACTIVITY') {
        return { kind: 'RUN', tool: 'getAccountAnalysis', args: A({ account: s.account, period: p, ...carry(a, ['scope']) }),
          note: s.note, title: businessTitle(a['subject'], 'activity', a['scope'], p) };
      }
      return { kind: 'RUN', tool: 'getFinancialStatementLine', args: A({ account: s.account, period: p, ...carry(a, ['scope']) }),
        ...(s.note ? { note: s.note } : {}), title: businessTitle(a['subject'], 'balance', a['scope'], p) };
    }
    if (view.startsWith('income')) return { kind: 'RUN', tool: 'getIncomeStatement', args: A({ periodStart: p, periodEnd: a['through'] ?? p, scope: a['scope'] ?? 'GROUP' }) };
    if (view.startsWith('balance')) return { kind: 'RUN', tool: 'getBalanceSheet', args: A({ period: p, ...carry(a, ['scope']) }) };
    if (view.startsWith('trial')) return { kind: 'RUN', tool: 'getTrialBalance', args: A({ period: p, entity: a['scope'] ?? 'GROUP' }) };
    return { kind: 'RUN', tool: 'getFinancialSummary', args: A({ period: p, ...carry(a, ['scope']) }) };
  },
};

const ANALYZE: ComposedTool = {
  name: 'analyzeFinancials',
  covers: ['getAccountAnalysis', 'comparePeriods', 'getDriverAnalysis', 'analyzeByDimension', 'getTopMovements', 'getTrend'],
  def: () => def('analyzeFinancials',
    'How something moved and what drove it. With a subject and no dimension you get the period activity, the balance, the change against the prior month AND the top project, entity and vendor drivers in one read — this is the tool for "why did X move". '
    + 'Set dimension to break the movement down (project | entity | vendor | costCenter | property | currency | account | accountGroup | description). Set through for a trend across months. '
    + 'subject may be an account code or a finance term; Korvyn resolves the term to governed accounts.',
    { subject: S('an account or group code, or a finance term in the person’s own words'),
      period: S('month, YYYY-MM'),
      comparisonPeriod: S('month to compare against; defaults to the prior month. Pass "none" for no comparison.'),
      through: S('last month of a range, YYYY-MM — gives a trend instead of a two-period comparison'),
      dimension: S('project | entity | vendor | costCenter | property | currency | account | accountGroup | description'),
      top: S('how many movers to return (a number, as text) — ranks the largest movements'),
      minChange: S('ignore groups whose change is below this, in USD millions (a number, as text)'),
      vendor: S('narrow to one vendor'), project: S('narrow to one project'),
      measure: S('balance | activity — whether they asked what is THERE at a date or what MOVED in the period'),
      scope: S('governed scope id (GROUP or an entity id)'), entity: S('narrow to one entity') },
    ['period']),
  plan(a, env) {
    const s = subjectStep(a, env, `${a['subject'] ?? 'Activity'} · ${a['period']}`);
    if (s.blocked) return s.blocked;
    const filters = carry(a, ['scope', 'entity', 'vendor', 'project']);
    const acct = s.account ? { account: s.account } : {};
    const p = a['period']!;
    const none = (a['comparisonPeriod'] ?? '').toLowerCase() === 'none';
    const cmp = none ? {} : carry(a, ['comparisonPeriod']);
    const dim = a['dimension'];
    const minChange = a['minChange'] ? { minAbsChange: a['minChange'] } : {};

    const N = s.note ? { note: s.note } : {};
    const T = businessTitle(a['subject'], dim ? `by ${dim}` : '', a['entity'] ?? a['scope'], periodPhrase(p, a['through'], a['comparisonPeriod']));
    const TT = T ? { title: T } : {};
    if (a['through'] && !dim) return { kind: 'RUN', tool: 'getTrend', args: A({ periodStart: p, periodEnd: a['through'], ...acct, ...filters }), ...N, ...TT };
    if (dim && a['through']) return { kind: 'RUN', tool: 'analyzeByDimension', args: A({ dimension: dim, periodStart: p, periodEnd: a['through'], ...acct, ...filters, ...minChange }), ...N, ...TT };
    if (dim && none) return { kind: 'RUN', tool: 'analyzeByDimension', args: A({ dimension: dim, periodStart: p, periodEnd: p, ...acct, ...filters, ...minChange }), ...N, ...TT };
    if (dim && a['top']) return { kind: 'RUN', tool: 'getTopMovements', args: A({ dimension: dim, period: p, ...cmp, ...acct, ...filters, topN: a['top'] }), ...N, ...TT };
    if (dim) return { kind: 'RUN', tool: 'getDriverAnalysis', args: A({ dimension: dim, period: p, ...cmp, ...acct, ...filters, ...minChange }), ...N, ...TT };
    /* no dimension: an account subject gets the richer single read — activity, balance, change and its drivers */
    if (s.account && !a['vendor'] && !a['project']) return { kind: 'RUN', tool: 'getAccountAnalysis', args: A({ account: s.account, period: p, ...cmp, ...carry(a, ['scope']) }), ...N, ...TT };
    return { kind: 'RUN', tool: 'comparePeriods', args: A({ period: p, ...cmp, ...acct, ...filters }), ...N, ...TT };
  },
};

const LEDGER: ComposedTool = {
  name: 'getLedgerDetail',
  covers: ['getGovernedPopulation', 'getTransaction', 'getJournal'],
  def: () => def('getLedgerDetail',
    'The governed ledger lines behind a figure: a bounded page of the population with its count, totals and a population id, or one transaction or journal by id. '
    + 'Rows returned are a sample of the population, never the whole of it.',
    { subject: S('an account or group code, or a finance term'),
      period: S('month, YYYY-MM'), through: S('last month of a range, YYYY-MM'),
      transactionId: S('one governed line id — returns that transaction'),
      journalId: S('one journal id — returns its lines'),
      minAmount: S('only lines at or above this, in USD millions (a number, as text)'),
      vendor: S('narrow to one vendor'), project: S('narrow to one project'), entity: S('narrow to one entity'),
      scope: S('governed scope id'), cursor: S('row to continue from (a number, as text)') }),
  plan(a, env) {
    if (a['transactionId']) return { kind: 'RUN', tool: 'getTransaction', args: A({ transactionId: a['transactionId'] }) };
    if (a['journalId']) return { kind: 'RUN', tool: 'getJournal', args: A({ journalId: a['journalId'] }) };
    const s = subjectStep(a, env, `${a['subject'] ?? 'Ledger'} · ${a['period'] ?? ''}`);
    if (s.blocked) return s.blocked;
    const range = a['through'] ? { periodStart: a['period']!, periodEnd: a['through'] } : carry(a, ['period']);
    return { kind: 'RUN', tool: 'getGovernedPopulation',
      args: A({ ...range, ...(s.account ? { account: s.account } : {}), ...carry(a, ['scope', 'entity', 'vendor', 'project', 'cursor']), ...(a['minAmount'] ? { minAbsAmount: a['minAmount'] } : {}) }), ...(s.note ? { note: s.note } : {}) };
  },
};

const CONTROL: ComposedTool = {
  name: 'getControlStatus',
  covers: ['getCloseReadiness', 'getCloseBlockers', 'getReconciliationSummary', 'getReconciliationsForAccount', 'getReconciliation',
    'getFluxSummary', 'getUnexplainedFluxItems', 'getFluxItem', 'getSupportCoverage', 'findMissingEvidence'],
  def: (e) => {
    const areas = [
      e.allows('getCloseReadiness') ? 'close' : null,
      e.allows('getReconciliationSummary') ? 'reconciliations' : null,
      e.allows('getFluxSummary') ? 'flux' : null,
      e.allows('getSupportCoverage') ? 'evidence' : null,
    ].filter(Boolean);
    return def('getControlStatus',
      `Where the close and its controls stand. area: ${areas.join(' | ')}. `
      + 'close gives readiness and the blocking items; reconciliations gives the position, or one reconciliation, or those for an account; '
      + 'flux gives the material movements and which are unexplained; evidence gives support coverage and what is missing. '
      + 'Set detail to narrow: blockers | unexplained | missing.',
      { area: S(`one of: ${areas.join(', ')}`),
        period: S('month, YYYY-MM'),
        subject: S('an account or group code, or a finance term — narrows to that line'),
        reconciliationId: S('one reconciliation id'),
        populationId: S('for evidence: the population to check'),
        detail: S('blockers | unexplained | missing'),
        scope: S('governed scope id') },
      ['area', 'period']);
  },
  plan(a, env) {
    const area = (a['area'] ?? 'close').toLowerCase(), p = a['period']!, detail = (a['detail'] ?? '').toLowerCase();
    if (area.startsWith('recon')) {
      if (a['reconciliationId']) return { kind: 'RUN', tool: 'getReconciliation', args: A({ reconciliationId: a['reconciliationId'], period: p }) };
      const s = subjectStep(a, env, `Reconciliations · ${p}`);
      if (s.blocked) return s.blocked;
      if (s.account) return { kind: 'RUN', tool: 'getReconciliationsForAccount', args: A({ account: s.account.split(',')[0]!, period: p }) };
      return { kind: 'RUN', tool: 'getReconciliationSummary', args: A({ period: p }) };
    }
    if (area.startsWith('flux')) {
      const s = subjectStep(a, env, `Flux · ${p}`);
      if (s.blocked) return s.blocked;
      if (s.account) return { kind: 'RUN', tool: 'getFluxItem', args: A({ account: s.account.split(',')[0]!, period: p }) };
      if (detail.startsWith('unexpl')) return { kind: 'RUN', tool: 'getUnexplainedFluxItems', args: A({ period: p }) };
      return { kind: 'RUN', tool: 'getFluxSummary', args: A({ period: p }) };
    }
    if (area.startsWith('evid') || area.startsWith('support')) {
      const ref = carry(a, ['populationId']);
      const s = subjectStep(a, env, `Support · ${p}`);
      if (s.blocked) return s.blocked;
      const objRef = s.account ? { objectRef: `account:${s.account.split(',')[0]!}` } : {};
      const args = A({ period: p, ...ref, ...objRef });
      return { kind: 'RUN', tool: detail.startsWith('miss') ? 'findMissingEvidence' : 'getSupportCoverage', args };
    }
    return { kind: 'RUN', tool: detail.startsWith('block') ? 'getCloseBlockers' : 'getCloseReadiness', args: A({ period: p }) };
  },
};

const TRACE: ComposedTool = {
  name: 'traceFinancialObject',
  covers: ['traceFinancialObject'],
  def: () => def('traceFinancialObject',
    'Where a figure comes from: statement line → accounts → governed population → journals → ERP source systems, with the rate sets used.',
    { subject: S('an account or group code, or a finance term'), period: S('month, YYYY-MM'), scope: S('governed scope id') },
    ['subject', 'period']),
  plan(a, env) {
    const s = subjectStep(a, env, `Trace · ${a['subject']}`);
    if (s.blocked) return s.blocked;
    if (!s.account) return { kind: 'RUN', tool: 'resolveFinancialObject', args: A({ text: a['subject']!, period: a['period']! }), note: 'Korvyn could not resolve that to a governed line; resolving the name instead.' };
    return { kind: 'RUN', tool: 'traceFinancialObject', args: A({ account: s.account, period: a['period']!, ...carry(a, ['scope']) }), ...(s.note ? { note: s.note } : {}) };
  },
};

const WORKFLOW: ComposedTool = {
  name: 'getWorkflowContext',
  covers: ['getResponsibleUsers', 'getObjectRelationships'],
  def: () => def('getWorkflowContext',
    'Who owns, prepares, reviews or approves a governed object, and what it relates to. aspect: people (default) | relationships.',
    { object: S('the object in the person’s words, or a canonical ref such as account:15000 or recon:REC-MDH-15000'),
      aspect: S('people | relationships'), period: S('month, YYYY-MM') },
    ['object']),
  plan(a) {
    const tool = (a['aspect'] ?? 'people').toLowerCase().startsWith('rel') ? 'getObjectRelationships' : 'getResponsibleUsers';
    const ref = a['object']!;
    const isRef = /^[a-z]+:/.test(ref);
    return { kind: 'RUN', tool, args: A({ ...(isRef ? { objectRef: ref } : { text: ref }), ...carry(a, ['period']) }) };
  },
};

export const COMPOSED_TOOLS: readonly ComposedTool[] = [STATEMENT, ANALYZE, LEDGER, CONTROL, TRACE, WORKFLOW];
export const composedByName = (n: string): ComposedTool | undefined => COMPOSED_TOOLS.find((c) => c.name === n);

/**
 * §10 — exposure is filtered before the model sees it. A facade is offered only where the actor may use at least
 * one of the tools behind it, and its description names only the areas they may actually ask for.
 */
export function composedFor(actor: Actor): { tool: ComposedTool; def: V2ToolDef }[] {
  const allows = (id: string) => { const t = toolRegistry.get(id); return !!t && t.risk === 'READ' && authorize(actor, t).ok; };
  const e: DescribeEnv = { allows };
  return COMPOSED_TOOLS.filter((c) => c.covers.some(allows)).map((c) => ({ tool: c, def: c.def(e) }));
}

/** the registered tools a composed facade can reach for this actor — what the trace records as available */
export const composedCoverage = (actor: Actor): string[] => {
  const allows = (id: string) => { const t = toolRegistry.get(id); return !!t && t.risk === 'READ' && authorize(actor, t).ok; };
  return [...new Set(COMPOSED_TOOLS.flatMap((c) => c.covers))].filter(allows);
};

export type { SloaneTool };
