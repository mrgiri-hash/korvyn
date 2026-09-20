/**
 * PHASE 8C.2 — CONTEXT CONTROL.
 *
 * The model (or the deterministic reader) PROPOSES how the words relate to the analysis on screen; this module is where
 * Korvyn VALIDATES that against the analysis actually on screen, before a single op is applied:
 *
 *   governEdit       the ContextRelation, checked against state — a restriction of the grid stays on the grid, a question
 *                    never persists a sort or a limit, a drill never re-orders, "the other X" is resolved against the
 *                    member in context, and a clarification is asked only when context cannot decide
 *   history          the conversation's AnalysisStateHistory — one revision per meaningful change, across analyses, so
 *                    Undo / Redo step between distinct analyses as well as within one
 *   analysisName     the active workspace title, derived from the definition so it cannot drift from what is on screen
 *
 * Every rule here is structural (what the ops would do to the definition on screen) or grammatical (a question, a
 * restrictive particle, a correction marker) — never a match on a particular request.
 */
import { randomUUID } from 'node:crypto';
import { periodLabel } from '../financials.js';
import { type AnalysisOp, type EditDeps, type Member, memberCandidates, resolveMembers } from './edit.js';
import type { AnalysisDefinition, ContextRelation } from './model.js';
import type { AnalysisSession } from './engine.js';

/* ---- grammar ---------------------------------------------------------------------------------------------------- */
/** a request phrased as a request ("can you sort…") is an instruction, whatever its punctuation */
const MODAL_REQUEST = /^(can|could|would|will) you\b|^please\b/;
/** an interrogative that asks about the grid rather than asking for it to change */
export const isQuestion = (t: string) => { const s = t.toLowerCase().trim(); return !MODAL_REQUEST.test(s) && (/\?\s*$/.test(s) || /^(which|what|who|where|how (much|many|big)|is|are|does|do|did|was|were)\b/.test(s)); };
const RESTRICTIVE = /\b(only|just|exclusively|solely|restrict(ed)? to|limit(ed)? to)\b/;
const DISPLAY_VERB = /^(show|give|get|pull|open|display|run|build|create|make|let'?s see|lemme see|i want|i need|can you show|bring up)\b/;
const OTHER_WORDS = /\b(the other|another|a different|different one|other one)\b/;
const SUPERLATIVE = /\b(biggest|largest|most|highest|greatest|smallest|least|lowest|top)\b/;
const POINTER = /\b(this|that|it|these|those|this one|that one|here)\b/;
const STATEMENT_WORDS = /\b(balance sheets?|bs|b\/s|income statements?|p ?& ?l|pnl|trial balances?|tb)\b/;
/** the kind of analysis the words name, if they name one */
function kindNamed(t: string): { type: 'STATEMENT' | 'TRIAL_BALANCE'; statement: 'BS' | 'IS' | null } | null {
  if (/\b(trial balances?|tb|t\/b)\b/.test(t)) return { type: 'TRIAL_BALANCE', statement: null };
  const bs = /\b(balance sheets?|bs|b\/s|statements? of financial position)\b/.test(t), is = /\b(income statements?|p ?& ?l|pnl|profit (and|&) loss|statements? of operations)\b/.test(t);
  return bs !== is ? { type: 'STATEMENT', statement: bs ? 'BS' : 'IS' } : null;
}
const REPLACE_WORDS = /\b(instead|switch( over)? to|swap to|change (it )?to|replace (it|this) with|rather than|new analysis|start (a )?new|start over)\b/;

/* ---- relation ---------------------------------------------------------------------------------------------------- */
const MUTATING = new Set(['FORGET', 'SET_ROWS', 'SET_COLUMNS', 'ADD_ROW_DIM', 'REMOVE_DIM', 'MOVE_TO_COLUMNS', 'FILTER', 'CLEAR_FILTERS', 'STATEMENT', 'THRESHOLD', 'ACCOUNT_TYPES', 'REMOVE_FILTER', 'SORT', 'TOP', 'PERIODS', 'ADD_PERIOD', 'REMOVE_PERIOD', 'PRIMARY', 'ORDER_PERIODS', 'COMPARE', 'ADD_MEASURE', 'REMOVE_MEASURE', 'EXPAND', 'COLLAPSE', 'EXPAND_ALL', 'COLLAPSE_ALL', 'VARIANT']);
/** what a question must never leave behind as a side effect: an order, a limit, a narrowing */
const ORDERING = new Set(['SORT', 'TOP']);

/** the relation the ops themselves imply, when nothing proposed one (the deterministic reader) */
export function relationOf(ops: AnalysisOp[], active: AnalysisDefinition | null, correction = false): ContextRelation {
  const has = (...k: string[]) => ops.some((o) => k.includes(o.op));
  if (has('UNDO', 'REDO', 'OTHER', 'FORGET') || correction) return 'CORRECT_CURRENT';
  if (has('CLARIFY')) return 'CLARIFY_REFERENT';
  if (has('NEW', 'DUPLICATE')) return active ? 'REPLACE_CURRENT' : 'START_NEW';
  if (has('DRILL', 'SELECT')) return 'DRILL_CURRENT';
  if (has('EXPLAIN', 'FLUX', 'RECON', 'SUPPORT', 'RANK', 'CHART', 'EXCEL', 'SAVE')) return 'EXPLAIN_CURRENT';
  if (ops.some((o) => MUTATING.has(o.op))) return 'MODIFY_CURRENT';
  return 'CONTINUE_CURRENT';
}

export interface ClarifyOption { label: string; ops: AnalysisOp[] | null; request: string | null }
export interface Governed {
  relation: ContextRelation;
  ops: AnalysisOp[];
  /** what Korvyn changed about the proposal, and why — recorded in the trace, never shown as an error */
  adjustments: string[];
  clarify: { question: string; options: ClarifyOption[] } | null;
  /** a correction that rejects the last reading: go back one step before asking what was meant */
  undoFirst: boolean;
}

/** can a NEW analysis be expressed as a restriction of the one on screen? — structure only */
function asRestriction(n: Extract<AnalysisOp, { op: 'NEW' }>, a: AnalysisDefinition): AnalysisOp[] | null {
  const sameBase = n.analysisType === a.analysisType && (n.statement ?? null) === (a.statement ?? null);
  const narrowsStatement = n.analysisType === 'STATEMENT' && !!n.statement && (a.analysisType === 'TRIAL_BALANCE' || (a.analysisType === 'STATEMENT' && (a.statement === null || a.statement === n.statement)));
  const narrowsActivity = n.analysisType === 'ANALYSIS' && a.analysisType === 'ANALYSIS';
  if (!sameBase && !narrowsStatement && !narrowsActivity) return null;
  if (n.explicitPeriods && !n.periods.every((p) => a.periods.includes(p))) return null;
  const out: AnalysisOp[] = [];
  if (n.statement && n.statement !== a.statement) out.push({ op: 'STATEMENT', statement: n.statement });
  const onScreen = new Set([...a.rows, ...a.columns].map((x) => x.dimension));
  for (const r of n.rows) if (r.dimension !== 'account' && r.dimension !== 'period' && !onScreen.has(r.dimension)) out.push({ op: 'ADD_ROW_DIM', dim: r, after: null });
  const already = (m: Member) => a.filters.some((f) => f.dimension === m.dimension && f.op === 'IN' && f.values.includes(m.value));
  const fresh = n.filters.filter((m) => !already(m));
  if (fresh.length) out.push({ op: 'FILTER', members: fresh, exclude: false });
  return out;
}

/** the members of a dimension the analysis on screen is already about: its IN filters and its active member */
function inContext(s: AnalysisSession | null): Member[] {
  if (!s) return [];
  const out: Member[] = s.definition.filters.filter((f) => f.op === 'IN').flatMap((f) => f.values.map((v, i) => ({ dimension: f.dimension, value: v, label: f.labels[i] ?? v })));
  const am = s.referents.activeDimensionMemberId ?? s.referents.activeMember;
  if (am && !out.some((m) => `${m.dimension}:${m.value}` === am)) { const [dim, ...v] = am.split(':'); out.push({ dimension: dim as never, value: v.join(':'), label: v.join(':') }); }
  return out;
}

/** the name's first word — "the other one" after Siemens Energy means another Siemens */
const stem = (label: string) => label.replace(/^\d+\s+/, '').split(/\s+/)[0] ?? label;
/** the term as the governed names spell it ("siemens" → "Siemens") */
const properTerm = (term: string, cands: Member[]) => { for (const c of cands) { const i = c.label.toLowerCase().indexOf(term.toLowerCase()); if (i >= 0) return c.label.slice(i, i + term.length); } return term; };
/** choosing a member with nothing posted says so, so an empty grid is not mistaken for a broken one */
const choose = (m: Member, d: EditDeps): AnalysisOp[] => [{ op: 'FILTER', members: [m], exclude: false }, ...(m.dimension === 'vendor' && !d.gl.vendors().includes(m.value) ? [{ op: 'NOTE', text: `${m.label} is a vendor-master record with no governed activity in the ledger, so the analysis is empty.` } as AnalysisOp] : [])];
const describe = (m: Member, d: EditDeps) => {
  const active = m.dimension !== 'vendor' || d.gl.vendors().includes(m.value);
  return `${m.label}${active ? '' : ' — no governed activity'}`;
};

export interface GovernInput {
  proposed: ContextRelation | null; ops: AnalysisOp[]; active: AnalysisSession | null; request: string; deps: EditDeps;
  /** the model read the words (its members, pointers and ephemeral readings are checked against the words themselves) */
  modelRead?: boolean;
  /** the model's persistentMutation, when a model read the words */
  persistent?: boolean | null;
  correction?: boolean;
}

export function governEdit(g: GovernInput): Governed {
  const { active, request, deps } = g;
  const t = request.toLowerCase().trim();
  const A = active?.definition ?? null;
  const adjustments: string[] = [];
  let ops = [...g.ops];
  let relation: ContextRelation = g.proposed ?? relationOf(ops, A, !!g.correction);
  let clarify: Governed['clarify'] = null, undoFirst = false, subjectReplaced = false;
  const named = resolveMembers(request, deps);
  const key = (m: Member) => `${m.dimension}:${m.value}`;

  /* 0. the words win over a reading of them (the same rule as a workbook refinement):
     - a member the model filtered on must be one the words name, when the words name any;
     - "other / another / different" is a referent relative to what is in context — Korvyn resolves it, never a guess;
     - a superlative points at the largest (or smallest) row, not at whatever happens to be selected */
  if (g.modelRead) {
    /* a new analysis's filters too: a member the words do not name is not one they asked for (an account is the subject,
       which the words may name by an alias the model spelled out — it is kept) */
    if (named.length) for (const [i, o] of ops.entries()) if (o.op === 'NEW') {
      const kept = o.filters.filter((m) => m.dimension === 'account' || named.some((n) => key(n) === key(m)));
      const add = named.filter((n) => n.dimension !== 'account' && !kept.some((m) => key(m) === key(n)));
      if (kept.length !== o.filters.length || add.length) { adjustments.push(`the new analysis filters on ${[...kept, ...add].map((m) => m.label).join(', ') || 'nothing'} — what the words name${kept.length !== o.filters.length ? `, not ${o.filters.filter((m) => !kept.includes(m)).map((m) => m.label).join(', ')}` : ''}`); ops[i] = { ...o, filters: [...kept, ...add] }; }
    }
    if (named.length) for (const [i, o] of ops.entries()) if (o.op === 'FILTER' && !o.members.some((m) => named.some((n) => key(n) === key(m)))) {
      const inCtx = new Set(inContext(active).map(key));
      const fresh = named.filter((n) => !inCtx.has(key(n)) || o.exclude);
      if (fresh.length) { adjustments.push(`filtered on ${fresh.map((m) => m.label).join(', ')} (what the words name) instead of ${o.members.map((m) => m.label).join(', ')}`); ops[i] = { ...o, members: fresh }; }
    }
    if (OTHER_WORDS.test(t) && !ops.some((o) => o.op === 'OTHER') && ops.some((o) => o.op === 'CLARIFY' || o.op === 'FILTER')) {
      const term = (named.find((m) => m.dimension !== 'account')?.label ?? '').split(/\s+/)[0] ?? '';
      ops = [...ops.filter((o) => o.op !== 'CLARIFY' && !(o.op === 'FILTER' && o.members.every((m) => inContext(active).some((c) => key(c) === key(m))))), { op: 'OTHER', term }];
      adjustments.push('“other / different” is resolved against the member in context');
    }
    if (SUPERLATIVE.test(t) && !POINTER.test(t)) ops = ops.map((o) => (o.op === 'DRILL' || o.op === 'EXPLAIN' || o.op === 'SELECT') && o.target.kind === 'active' ? { ...o, target: { kind: /\b(smallest|least|lowest)\b/.test(t) ? 'smallest' : 'largest' } } : o);
  }
  /* an ephemeral ranking answers a QUESTION; an instruction about order persists as a sort */
  const rk = ops.find((o): o is Extract<AnalysisOp, { op: 'RANK' }> => o.op === 'RANK');
  if (rk && A && !isQuestion(t)) {
    ops = [...ops.filter((o) => o !== rk), { op: 'SORT', by: rk.by ?? (A.measures.includes('VARIANCE') ? 'VARIANCE' : 'VALUE'), period: null }, ...(RESTRICTIVE.test(t) && rk.n > 0 ? [{ op: 'TOP', n: rk.n } as AnalysisOp] : [])];
    adjustments.push('an instruction about order persists: sorted the grid instead of answering a ranking question');
  }
  /* a verb that asks to SEE a new subject broken down (a statement or TB on screen, an account named that it is not
     already about) is a new analysis of that subject, not a filter on the statement */
  if (A && A.analysisType !== 'ANALYSIS' && DISPLAY_VERB.test(t) && !RESTRICTIVE.test(t) && !STATEMENT_WORDS.test(t) && !ops.some((o) => o.op === 'NEW')) {
    const subj = ops.flatMap((o) => (o.op === 'FILTER' && !o.exclude ? o.members : [])).filter((m) => m.dimension === 'account' && !A.filters.some((f) => f.dimension === 'account' && f.values.includes(m.value)));
    const byDims = ops.flatMap((o) => (o.op === 'ADD_ROW_DIM' ? [o.dim] : o.op === 'SET_ROWS' ? o.dims : []));
    if (subj.length && byDims.length) {
      const others = ops.flatMap((o) => (o.op === 'FILTER' && !o.exclude ? o.members : [])).filter((m) => m.dimension !== 'account');
      ops = [{ op: 'NEW', analysisType: 'ANALYSIS', statement: null, periods: [A.primaryPeriod], rows: byDims.filter((x) => x.dimension !== 'period'), columns: [{ dimension: 'period' }], measures: ['ACTIVITY'], filters: [...subj, ...others], name: `${subj.map((m) => m.label.replace(/^\d+\s+/, '')).join(', ')} activity`, explicitPeriods: false }];
      adjustments.push(`${subj.map((m) => m.label).join(', ')} by ${byDims.map((x) => x.dimension).join(', ')} is a new subject asked for by name: a new analysis, not a filter on ${A.name}`);
      relation = 'REPLACE_CURRENT'; subjectReplaced = true;
    }
  }

  /* 1. modify-vs-new: a NEW analysis that is only a restriction of the grid on screen stays on the grid */
  /* a verb that asks to SEE a different kind of analysis (a statement while a trial balance is on screen, the income
     statement while the balance sheet is) is a replacement, even when the reading only changed periods — otherwise the
     filters and layout of the analysis on screen would be silently carried into one the words did not ask for */
  const namedKind = kindNamed(t);
  if (A && !subjectReplaced && namedKind && DISPLAY_VERB.test(t) && !RESTRICTIVE.test(t) && !ops.some((o) => o.op === 'NEW')
    && (namedKind.type !== A.analysisType || (namedKind.type === 'STATEMENT' && namedKind.statement !== A.statement))) {
    const per = ops.find((o): o is Extract<AnalysisOp, { op: 'PERIODS' }> => o.op === 'PERIODS')?.periods ?? ops.flatMap((o) => (o.op === 'ADD_PERIOD' ? [o.period] : []));
    const periods = per.length ? [...new Set([...per])].sort() : [A.primaryPeriod];
    const keep = ops.filter((o) => ['COMPARE', 'ADD_MEASURE', 'SORT', 'TOP', 'THRESHOLD', 'EXPAND', 'EXPAND_ALL'].includes(o.op));
    const members = ops.flatMap((o) => (o.op === 'FILTER' && !o.exclude ? o.members : []));
    ops = [{ op: 'NEW', analysisType: namedKind.type, statement: namedKind.statement, periods, rows: [{ dimension: 'account' }], columns: [{ dimension: 'period' }], measures: ['ENDING_BALANCE'], filters: members, name: namedKind.type === 'TRIAL_BALANCE' ? 'Trial balance' : namedKind.statement === 'IS' ? 'Income statement' : 'Balance sheet', explicitPeriods: per.length > 0 }, ...keep];
    adjustments.push(`the words ask to see a ${namedKind.type === 'TRIAL_BALANCE' ? 'trial balance' : namedKind.statement === 'IS' ? 'income statement' : 'balance sheet'}, a different analysis from ${A.name}: it replaces it rather than inheriting its filters and layout`);
    relation = 'REPLACE_CURRENT'; subjectReplaced = true;
  }
  const nw = ops.find((o): o is Extract<AnalysisOp, { op: 'NEW' }> => o.op === 'NEW');
  if (A && nw && !subjectReplaced) {
    const restriction = asRestriction(nw, A);
    const explicitNew = REPLACE_WORDS.test(t) || (DISPLAY_VERB.test(t) && !RESTRICTIVE.test(t) && !['MODIFY_CURRENT', 'CONTINUE_CURRENT', 'CORRECT_CURRENT'].includes(g.proposed ?? ''));
    if (restriction && !explicitNew) {
      ops = [...restriction, ...ops.filter((o) => o !== nw && o.op !== 'NEW')];
      adjustments.push(`kept ${A.name}: the request restricts the analysis on screen (${restriction.map((o) => o.op).join(', ') || 'no change'}), it does not ask for a new one`);
      relation = restriction.length ? (g.proposed === 'CORRECT_CURRENT' ? 'CORRECT_CURRENT' : 'MODIFY_CURRENT') : 'CONTINUE_CURRENT';
    } else if (relation !== 'START_NEW' && relation !== 'REPLACE_CURRENT') { adjustments.push(`${g.proposed ?? 'the reading'} carried a new analysis that is not a restriction of ${A.name}: it replaces it`); relation = 'REPLACE_CURRENT'; }
    else relation = 'REPLACE_CURRENT';
  }
  if (!A && nw) relation = 'START_NEW';

  /* 2. drill vs sort: a drill or an explanation selects a row; it never re-orders or limits the grid as a side effect */
  const inspecting = ops.some((o) => o.op === 'DRILL' || o.op === 'EXPLAIN' || o.op === 'SELECT');
  if (inspecting && g.persistent !== true && ops.some((o) => ORDERING.has(o.op))) {
    adjustments.push(`dropped ${ops.filter((o) => ORDERING.has(o.op)).map((o) => o.op).join(', ')}: selecting a row to open does not re-order or limit the grid`);
    ops = ops.filter((o) => !ORDERING.has(o.op));
  }
  if (inspecting && relation === 'MODIFY_CURRENT') relation = ops.some((o) => o.op === 'DRILL' || o.op === 'SELECT') ? 'DRILL_CURRENT' : 'EXPLAIN_CURRENT';

  /* 3. rank vs filter: a question about which item ranks where is answered, never persisted as a sort or a limit */
  const orderingOnly = ops.length > 0 && ops.every((o) => ORDERING.has(o.op) || o.op === 'COMPARE' || (o.op === 'ADD_MEASURE' && (o.measure === 'VARIANCE' || o.measure === 'VARIANCE_PCT')));
  const limitNotAsked = ops.some((o) => o.op === 'TOP') && g.persistent === false && !RESTRICTIVE.test(t);
  if (A && !inspecting && ops.some((o) => ORDERING.has(o.op)) && ((isQuestion(t) && orderingOnly) || limitNotAsked)) {
    const sort = ops.find((o): o is Extract<AnalysisOp, { op: 'SORT' }> => o.op === 'SORT');
    const top = ops.find((o): o is Extract<AnalysisOp, { op: 'TOP' }> => o.op === 'TOP');
    const variance = ops.some((o) => o.op === 'COMPARE' || (o.op === 'ADD_MEASURE' && o.measure === 'VARIANCE'));
    const by = sort?.by === 'VARIANCE' || variance ? 'VARIANCE' : sort?.by === 'VALUE' ? 'VALUE' : null;
    ops = [...ops.filter((o) => !orderingOnly && !ORDERING.has(o.op)), { op: 'RANK', by, n: top?.n ?? 1, dir: 'DESC' }];
    adjustments.push(`answered as a ranking: ${isQuestion(t) ? 'a question about which item ranks where' : 'the words do not ask to see only that many rows'} — the grid keeps its sort and limit`);
    relation = 'EXPLAIN_CURRENT';
  }
  if (ops.some((o) => o.op === 'RANK') && relation === 'MODIFY_CURRENT') relation = 'EXPLAIN_CURRENT';

  /* 4. "the other X": the candidates the name could mean, less the one already in context */
  const other = ops.find((o): o is Extract<AnalysisOp, { op: 'OTHER' }> => o.op === 'OTHER');
  if (other) {
    ops = ops.filter((o) => o !== other);
    const ctx = inContext(active);
    let term = other.term.trim();
    let cands = term ? memberCandidates(term, deps) : [];
    if (!cands.length && ctx.length) { const base = ctx.find((m) => m.dimension !== 'account') ?? ctx[0]!; term = stem(base.label); cands = memberCandidates(term, deps).filter((m) => m.dimension === base.dimension); }
    let dims = new Set(cands.map((m) => m.dimension));
    let current = ctx.filter((m) => dims.has(m.dimension) && cands.some((c) => c.dimension === m.dimension && c.value === m.value));
    let others = cands.filter((c) => !current.some((m) => m.dimension === c.dimension && m.value === c.value));
    /* the term named only the member already in context ("the other Siemens Energy"): the other readings share its stem */
    if (!others.length && current.length) {
      term = stem(current[0]!.label); cands = memberCandidates(term, deps).filter((m) => m.dimension === current[0]!.dimension);
      dims = new Set(cands.map((m) => m.dimension));
      current = ctx.filter((m) => dims.has(m.dimension) && cands.some((c) => c.dimension === m.dimension && c.value === m.value));
      others = cands.filter((c) => !current.some((m) => m.dimension === c.dimension && m.value === c.value));
    }
    relation = 'CORRECT_CURRENT';
    if (!cands.length) ops.push({ op: 'NOTE', text: `Nothing named “${term || 'that'}” is among the members you can see, so the analysis is unchanged.` });
    else if (!current.length && cands.length > 1) clarify = { question: `Which ${term} do you mean?`, options: cands.slice(0, 5).map((m) => ({ label: describe(m, deps), ops: choose(m, deps), request: null })) };
    else if (others.length === 1) { ops.unshift(...choose(others[0]!, deps)); adjustments.push(`“the other ${term}” is ${others[0]!.label}: the only other governed ${others[0]!.dimension} by that name`); }
    else if (others.length > 1) clarify = { question: `Which ${term} do you mean?`, options: others.slice(0, 5).map((m) => ({ label: describe(m, deps), ops: choose(m, deps), request: null })) };
    else ops.push({ op: 'NOTE', text: `${current[0]!.label} is the only ${term} among the members you can see.` });
    if (clarify) { relation = 'CLARIFY_REFERENT'; clarify.question = `Which ${properTerm(term, cands)} do you mean?`; }
  }

  /* 5. a clarification is asked only when context cannot decide */
  const cl = ops.find((o): o is Extract<AnalysisOp, { op: 'CLARIFY' }> => o.op === 'CLARIFY');
  if (cl && !clarify) {
    ops = ops.filter((o) => o !== cl);
    const byOption = cl.options.map((label) => ({ label, members: resolveMembers(label, deps) }));
    const pool = [...named, ...byOption.flatMap((x) => x.members)].filter((m, i, xs) => xs.findIndex((y) => y.dimension === m.dimension && y.value === m.value) === i);
    const ctx = inContext(active);
    const held = pool.filter((m) => ctx.some((c) => c.dimension === m.dimension && c.value === m.value));
    if (A && held.length === 1) {
      ops.unshift({ op: 'FILTER', members: held, exclude: false });
      adjustments.push(`did not ask: ${held[0]!.label} is already the ${held[0]!.dimension} in context`);
      relation = 'CONTINUE_CURRENT';
    } else if (named.length === 1 && pool.length === 1 && A) {
      ops.unshift({ op: 'FILTER', members: named, exclude: false });
      adjustments.push(`did not ask: “${named[0]!.label}” is the only governed object by that name you can see`);
      relation = 'MODIFY_CURRENT';
    } else {
      clarify = { question: cl.question, options: byOption.map((x) => ({ label: x.label, ops: x.members.length === 1 && A ? [{ op: 'FILTER', members: x.members, exclude: false }] : null, request: x.members.length === 1 && A ? null : x.label })) };
      relation = 'CLARIFY_REFERENT';
      /* "that's not what I asked": the last reading is rejected before asking what was meant */
      if ((g.proposed === 'CORRECT_CURRENT' || g.correction) && !pool.length) undoFirst = true;
      if (!clarify.options.length) clarify.options = [{ label: 'Keep the analysis as it was', ops: [], request: null }, { label: 'Put back what I just undid', ops: null, request: 'redo' }];
    }
  }
  return { relation, ops, adjustments, clarify, undoFirst };
}

/* ---- the analysis state history -------------------------------------------------------------------------------- */
export interface AnalysisRevision {
  revisionId: string; previousRevisionId: string | null;
  analysisId: string; version: number; name: string;
  relation: ContextRelation; reason: string; userTurn: string; timestamp: string;
  /** the whole analysis session as it stood — definitions are small, and a snapshot restores exactly */
  snapshot: AnalysisSession;
}
export interface AnalysisHistory { revisions: AnalysisRevision[]; cursor: number }
const MAX_REVISIONS = 60;
export const emptyHistory = (): AnalysisHistory => ({ revisions: [], cursor: -1 });

/** record a revision after the one the cursor is on; anything that had been undone is no longer redoable */
export function recordRevision(h: AnalysisHistory, s: AnalysisSession, relation: ContextRelation, reason: string, userTurn: string): AnalysisRevision {
  const prev = h.revisions[h.cursor] ?? null;
  const r: AnalysisRevision = { revisionId: `AR-${randomUUID().slice(0, 8)}`, previousRevisionId: prev?.revisionId ?? null, analysisId: s.definition.id, version: s.definition.version, name: s.definition.name,
    relation, reason: reason.slice(0, 300), userTurn: userTurn.slice(0, 300), timestamp: new Date().toISOString(), snapshot: JSON.parse(JSON.stringify(s)) as AnalysisSession };
  h.revisions = [...h.revisions.slice(0, h.cursor + 1), r].slice(-MAX_REVISIONS);
  h.cursor = h.revisions.length - 1;
  return r;
}
/** step the cursor; the revision it lands on is restored exactly (definition, referents, paging) */
export function stepHistory(h: AnalysisHistory, dir: -1 | 1): AnalysisRevision | null {
  const i = h.cursor + dir;
  if (i < 0 || i >= h.revisions.length) return null;
  h.cursor = i;
  return h.revisions[i]!;
}
/** the next version for an analysis: past every version the history has seen, so an undone version is never reused */
export function nextVersion(h: AnalysisHistory, analysisId: string, current: number): number {
  return Math.max(current, ...h.revisions.filter((r) => r.analysisId === analysisId).map((r) => r.version)) + 1;
}

/* ---- the active workspace title ------------------------------------------------------------------------------- */
const DIM_LABEL: Record<string, string> = { account: 'account', financialLine: 'statement line', entity: 'entity', region: 'region', project: 'project', property: 'property', vendor: 'vendor', costCenter: 'cost center', currency: 'currency', recordType: 'record type', sourceSystem: 'source system', book: 'book' };
/** the title follows the definition, so the workspace always names what is on screen */
export function analysisName(d: AnalysisDefinition): string {
  if (d.nameSource === 'USER') return d.name;
  const acctFilter = d.filters.find((f) => f.dimension === 'account' && f.op === 'IN');
  const subject = acctFilter ? acctFilter.labels.map((l) => l.replace(/^\d+\s+/, '')).slice(0, 2).join(', ') + (acctFilter.labels.length > 2 ? ` +${acctFilter.labels.length - 2}` : '') : null;
  let base = d.analysisType === 'STATEMENT' ? (d.statement === 'IS' ? 'Income statement' : d.statement === 'BS' ? 'Balance sheet' : 'Financial statements')
    : d.analysisType === 'TRIAL_BALANCE' ? `Trial balance${d.statement ? ` · ${d.statement === 'BS' ? 'balance-sheet' : 'income-statement'} accounts` : ''}`
    : `${subject ?? 'GL'} activity`;
  if (d.analysisType !== 'ANALYSIS' && subject) base += ` · ${subject}`;
  if (d.accountTypes?.length) base += ` · ${d.accountTypes.map((x) => x.toLowerCase()).join(' & ')} accounts`;
  const members = d.filters.filter((f) => f.dimension !== 'account' && f.dimension !== 'recordType');
  for (const f of members.slice(0, 2)) base += ` · ${f.op === 'NOT_IN' ? 'excl. ' : ''}${f.labels.slice(0, 2).join(', ')}${f.labels.length > 2 ? ` +${f.labels.length - 2}` : ''}`;
  const by = [...d.rows, ...d.columns].map((x) => x.dimension).filter((x) => x !== 'account' && x !== 'period').filter((x, i, xs) => xs.indexOf(x) === i);
  if (by.length) base += ` by ${by.map((x) => DIM_LABEL[x] ?? x).join(' and ')}`;
  const ps = [...d.periods].sort();
  base += ` · ${ps.length > 1 ? `${periodLabel(ps[0]!)}–${periodLabel(ps.at(-1)!)}` : periodLabel(ps[0] ?? d.primaryPeriod)}`;
  return base;
}
