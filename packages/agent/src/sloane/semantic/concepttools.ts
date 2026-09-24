/**
 * THE CONCEPT-AWARE GOVERNED SURFACE.
 *
 * One tool — `resolveFinancialConcept` — and one shared resolver the composed v2 tools use, so a finance word a
 * person actually says ("OPEX", "accruals", "development spend") becomes governed account members, an honest
 * ambiguity, or an honest "Korvyn does not hold that" — and never a guess.
 *
 * §1's boundary in one line: the MODEL knows what OPEX means; KORVYN knows what OPEX means HERE.
 */
import { conceptById, type ConceptResolution, FINANCIAL_CONCEPTS, resolutionFacts, resolveConcept } from './concepts.js';
import { type SloaneTool, type ToolEnv, type ToolResult, registerTools } from '../tools.js';
import { base, row, unavailable } from '../toolset.js';

/**
 * What a composed tool needs to know about a subject before it reads a figure.
 * `accounts` is the governed member list — the same shape `PopulationFilter.accounts` takes.
 */
export interface SubjectResolution {
  /** governed account / group codes, joined for the `account` argument */
  accounts: string[];
  label: string;
  resolution: ConceptResolution | null;
  /** set when Korvyn must NOT quote a figure: the concept is ambiguous, derived or not held */
  blocked: { kind: 'AMBIGUOUS' | 'NOT_HELD' | 'DERIVED' | 'PROCESS'; message: string } | null;
}

const isCode = (env: ToolEnv, s: string) => /^\d{4,6}$/.test(s.trim()) && !!env.gl.account(s.trim());

/**
 * Resolve what the person named into governed members.
 *  - an account or group code passes straight through;
 *  - a comma-separated member list (what a prior resolution returned) passes through;
 *  - anything else goes to the concept layer.
 */
export function resolveSubject(env: ToolEnv, subject: string | undefined, settled?: Record<string, string>): SubjectResolution {
  const raw = (subject ?? '').trim();
  if (!raw) return { accounts: [], label: 'All activity', resolution: null, blocked: null };

  const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length && parts.every((x) => isCode(env, x))) {
    return { accounts: parts, label: parts.map((c) => `${c} ${env.gl.account(c)?.name ?? ''}`.trim()).join(' + '), resolution: null, blocked: null };
  }

  const r = resolveConcept({ text: raw, gl: env.gl, ...(settled ? { settled } : {}) });
  if (r.status === 'UNKNOWN') return { accounts: [], label: raw, resolution: r, blocked: null };

  if (r.status === 'NOT_HELD') {
    const note = r.mappings.find((m) => m.basis === 'NOT_HELD')?.note ?? '';
    return { accounts: [], label: r.concept!.canonicalName, resolution: r,
      blocked: { kind: 'NOT_HELD', message: `${r.concept!.canonicalName}: ${note}` } };
  }
  /* DEFAULTED is not blocked: Korvyn reads it the way a professional would AND the note says which reading. */
  if (r.status === 'AMBIGUOUS') {
    const opts = r.mappings.map((m) => `${m.label} (${m.members.join(', ') || 'derived'})`).join(' | ');
    return { accounts: [], label: r.concept!.canonicalName, resolution: r,
      blocked: { kind: 'AMBIGUOUS', message: `"${raw}" has more than one honest reading on this book: ${opts}. Ask which one is meant before quoting a figure.` } };
  }
  const chosen = r.chosen!;
  if (chosen.kind === 'DERIVED') {
    const comps = (chosen.formula ?? []).map((f) => `${f.sign < 0 ? 'less ' : ''}${conceptById(f.conceptId)?.canonicalName ?? f.conceptId}`).join(', ');
    return { accounts: [], label: r.concept!.canonicalName, resolution: r,
      blocked: { kind: 'DERIVED', message: `${r.concept!.canonicalName} is not a posted line on this book. It is built from ${comps}. Read each component as a governed figure.` } };
  }
  if (chosen.kind === 'PROCESS') {
    return { accounts: [], label: r.concept!.canonicalName, resolution: r,
      blocked: { kind: 'PROCESS', message: `${r.concept!.canonicalName} is a close activity, not a balance. ${chosen.note}` } };
  }
  /* a mapping whose members present with opposite signs must not be summed into one figure */
  const signs = new Set(chosen.members.map((c) => env.gl.presented(c, 1)));
  if (signs.size > 1) {
    return { accounts: chosen.members, label: chosen.label, resolution: r,
      blocked: { kind: 'AMBIGUOUS', message: `${chosen.label} spans accounts that present with opposite signs (${chosen.members.join(', ')}), so one combined figure would be meaningless. Read them separately.` } };
  }
  return { accounts: chosen.members, label: chosen.label, resolution: r, blocked: null };
}

/** the `account` argument a governed tool takes for this subject */
export const accountArg = (s: SubjectResolution): string | undefined => (s.accounts.length ? s.accounts.join(',') : undefined);

/* ================================================================================================
   THE TOOL
   ================================================================================================ */

function conceptObject(env: ToolEnv, r: ConceptResolution): ToolResult {
  const f = resolutionFacts(r);
  if (r.status === 'UNKNOWN') {
    return unavailable(env, 'FinancialConcept', `Concept · ${r.term}`, 'Governed concept',
      `Korvyn holds no governed concept called "${r.term}". Say what it means in accounting terms and Korvyn will look for the governed equivalent.`);
  }
  const c = r.concept!;
  const rows = (f.korvynReads ? [f.korvynReads] : f.candidates).map((m) =>
    row(m.as, [m.accounts.length ? m.accounts.join(', ') : 'derived', m.basis, m.note], 1, 'line', `mapping:${m.mappingId}`));
  return {
    warnings: r.status === 'NOT_HELD' ? [f.notes[0] ?? ''] : [],
    object: base(env, {
      type: 'FinancialConcept',
      title: `${c.canonicalName} · what it means here`,
      status: r.status === 'NOT_HELD' ? 'UNAVAILABLE' : r.status === 'AMBIGUOUS' ? 'PARTIAL' : 'AVAILABLE',
      table: { columns: ['Reading', 'Accounts', 'Basis', 'Note'], rows },
      facts: [
        { key: 'concept', label: 'Concept', value: c.conceptId, display: c.canonicalName },
        { key: 'definition', label: 'General meaning', value: c.definition, display: c.definition },
        { key: 'status', label: 'Enterprise resolution', value: r.status, display: r.status },
        ...(f.korvynReads ? [{ key: 'members', label: 'Korvyn reads it as', value: f.korvynReads.accounts.join(','), display: `${f.korvynReads.as}${f.korvynReads.accounts.length ? ` (${f.korvynReads.accounts.join(', ')})` : ''}` }] : []),
        ...(r.status === 'AMBIGUOUS' ? [{ key: 'candidates', label: 'Readings this book supports', value: f.candidates.length, display: String(f.candidates.length) }] : []),
        ...f.notes.slice(0, 3).map((t, i) => ({ key: `note${i + 1}`, label: 'Note', value: t, display: t })),
      ],
      ...(f.korvynReads?.accounts.length ? { refs: { account: f.korvynReads.accounts.join(','), conceptId: c.conceptId } } : { refs: { conceptId: c.conceptId } }),
      ...(r.status === 'NOT_HELD' ? { unavailable: { capability: c.canonicalName, reason: f.notes[0] ?? 'not held on this book' } } : {}),
      provenance: { source: 'Korvyn governed financial concept catalogue and chart of accounts', snapshotId: 'CONCEPTS-1', journalLines: null, fxRateSetId: null, eliminations: null, declaredInputs: [] },
    }),
  };
}

const CONCEPT_TOOLS: SloaneTool[] = [
  {
    id: 'resolveFinancialConcept', domain: 'semantic', permission: 'FINANCIALS_VIEW', risk: 'READ',
    objectTypes: ['ACCOUNT', 'ACCOUNT_GROUP', 'FINANCIAL_STATEMENT'],
    description:
      'What a finance term means ON THIS BOOK: the governed accounts behind OPEX, EBITDA, capex, accruals, working capital, NOI, CIP, intercompany and the rest — or the honest statement that this book holds no such grouping. '
      + 'Use it when the person asks what Korvyn COUNTS in a term. You do not need it to explain what a term means in general, '
      /* PHASE 3 §9 — it resolves a NAME, so it can never be the last call in a turn about a balance, a status or
         a movement. Observed live: "is the intercompany stuff sorted yet?" resolved to accounts 13000 and 23000
         and then reported that the read had not given a reconciliation status — which it never does. */
      + 'and you do NOT need it before asking for a figure: every measure tool takes the term directly and resolves it itself. '
      + 'It returns a MEANING — never a balance, a movement, a status or a reconciliation position. If the question asked for one of those, '
      + 'this is not the answer: pass the term straight to the tool that reads it.',
    params: [{ name: 'term', kind: 'text', required: true, description: 'the finance word or phrase the person used, in their words' }],
    outputs: 'FinancialConcept; facts concept, definition, status, members; refs account (the governed member list to pass on)',
    run(a, env) { return conceptObject(env, resolveConcept({ text: a['term']!, gl: env.gl })); },
  },
];

registerTools(CONCEPT_TOOLS);

/** for the eval harness and tests: every alias the catalogue knows */
export const CONCEPT_COUNT = FINANCIAL_CONCEPTS.length;
export const CONCEPT_TOOLS_LOADED = true;
