/**
 * SLOANE CORE RUNTIME V2 — THE CONVERSATION RECORD AND THE GOVERNED STATE IT CARRIES.
 *
 * The audit's first finding was that Sloane had no conversation: every model call was single-shot and continuity was
 * emulated by thirty state fields and several hundred regexes. V2 separates the two things that were tangled:
 *
 *   THE TRANSCRIPT      what was actually said, in the person's own words, durable, replayed to the model
 *   THE GOVERNED STATE  what the product is on (period, scope, book, the active object / analysis / population)
 *
 * Meaning comes from the transcript. State carries only product facts a tool needs as arguments. Nothing here derives
 * a financial figure: every amount still comes from a governed tool.
 */

/** one exchange, kept verbatim. `userMessage` is the ORIGINAL language — never an intent enum. */
export interface V2Turn {
  turnId: string;
  at: string;
  userMessage: string;
  assistantMessage: string;
  /** which of the three paths answered it — for the trace and for A/B measurement */
  path: V2Path;
  refs: {
    toolCalls: { tool: string; args: Record<string, string> }[];
    objectIds: string[];
    populationIds: string[];
    evidenceIds: string[];
    analysisId: string | null;
    agentRunId: string | null;
  };
}

export type V2Path = 'deterministic' | 'conversation' | 'analytical' | 'drill' | 'analysis-handoff' | 'investigation-handoff' | 'clarification';

/**
 * §6/§19 — the governed state of the conversation. Book, basis, lens and currency are HERE, not hard-coded at the
 * point an analysis is created: a new analysis must inherit what the conversation is actually on.
 */
export interface V2State {
  period: string;
  periodRange: { start: string; end: string } | null;
  comparisonPeriod: string | null;
  scope: string;
  accountingBookId: string;
  accountingBasis: string;
  reportingLens: string;
  currency: string;
  activeObject: { kind: string; id: string; name: string } | null;
  activeAnalysisId: string | null;
  activePopulationId: string | null;
  selectedRowId: string | null;
  selectedCellId: string | null;
  currentInvestigationId: string | null;
  agentRunId: string | null;
  /** the governed refs the last turn produced — a tool argument may resolve from these */
  lastRefs: Record<string, string>;
  /**
   * PHASE 2.5 §19 — the next steps Korvyn OFFERED at the end of the last answer, each bound to the fact it
   * would drill from. When the person takes one, the drill is already decided and the turn costs no model call:
   * they picked from a menu Korvyn wrote. Durable with the rest of the state, so a refresh does not lose it.
   */
  offers?: import('./strategy.js').Offer[];
}

/** a question Sloane asked and is waiting on; durable, so a refresh or a restart does not lose it */
export interface V2Pending {
  id: string;
  question: string;
  options: { id: string; label: string }[];
  askedAt: string;
}

/** the durable record — one per conversation, kind SLOANE_CONVERSATION, id = sessionId */
export interface ConversationBody {
  sessionId: string;
  owner: string;
  startedAt: string;
  updatedAt: string;
  /** §5: turns older than the verbatim window, compacted deterministically (no model call) */
  summary: string[];
  turns: V2Turn[];
  state: V2State;
  pending: V2Pending | null;
  /**
   * PHASE 2 §35 — the canonical facts this conversation has produced. They are on the RECORD rather than in
   * process memory for the same reason the transcript is: "what's behind that?" three turns later has to reach
   * the same fact, and a server restart must not turn a governed figure into a dangling reference. The registry
   * is bounded and evicts the least recently referenced, so a long conversation cannot grow without limit.
   */
  facts?: import('./facts.js').FinancialFact[];
}

/** §27 — the v2 development trace. Never carries a secret, a prompt or a raw row. */
export interface V2Trace {
  runtime: 'v2';
  traceId: string;
  sessionId: string;
  path: V2Path;
  request: string;
  model: string | null;
  escalationReason: string | null;
  modelCalls: number;
  toolCalls: number;
  contextBuilds: number;
  toolsExposed: number;
  transcriptTurns: number;
  latencyMs: number;
  /** §23 — milliseconds to the first visible token of the ANSWER, or null when nothing streamed */
  firstTokenMs: number | null;
  /**
   * PHASE 2.5 §14 — TIME TO FIRST *USEFUL* ANSWER. For a turn whose answer is a governed figure, the first
   * token cannot honestly arrive before the read does, so optimising TTFT alone would reward a placeholder.
   * This is the instant the first words of the REAL answer exist — for a direct answer, the moment Korvyn
   * composed it; for a reasoned one, the model's first token of the answer.
   */
  firstUsefulMs: number | null;
  /** §3 — how this turn spent its model calls. Never named to the person. */
  strategy: import('./strategy.js').ResponseStrategy | null;
  /** why a direct answer was not composed, when it was not */
  strategyReason: string | null;
  /** what the composer recognised in the governed result: VALUE | BREAKDOWN | STATUS */
  directShape: string | null;
  /**
   * §24 — whose tokens these were. A benchmark run and a person's question are different workloads and a
   * cost report that mixes them is not a cost report. Read from KORVYN_WORKLOAD; the evaluation harnesses set it.
   */
  workload: 'SLOANE_RUNTIME' | 'AUTOMATED_EVALUATION' | 'DEVELOPMENT_TEST';
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  calls: { stage: string; model: string | null; status: string; latencyMs: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; stopReason: string | null; error: string | null }[];
  tools: { tool: string; status: 'COMPLETED' | 'REFUSED' | 'FAILED'; latencyMs: number; error: string | null }[];
  activeStateRefs: Record<string, string | null>;
  /**
   * §1 — figures in the answer that appear in NO governed read of this conversation. Korvyn's claim is
   * that it proves the enterprise number, so a number it cannot point at is worth recording whether or
   * not it is wrong. Measured, never rewritten: the answer is what Sloane said.
   */
  ungroundedFigures: string[];
  /**
   * PHASE 2 — what structural grounding did this turn. `factsProduced` is how many canonical facts the governed
   * reads yielded; `factRefs` how many the model cited; `unresolvedRefs` ids it cited that did not exist;
   * `bareFigures` figures it typed on its own authority instead of referencing. The last two are defects, and
   * the point of the phase is that both should be zero rather than merely small.
   */
  factsProduced: number;
  factRefs: number;
  unresolvedRefs: string[];
  responseType: string | null;
  /** §20 — causal claims demoted to inference, and any assertion withheld */
  responseViolations: string[];
  notes: string[];
  /** §11 — Korvyn's findings about its own work. Telemetry and the dev trace only; never rendered. */
  diagnostics: string[];
}

export const V2_LIMITS = {
  /**
   * §5/§18: turns kept verbatim in the model's context; older ones are compacted. Four was chosen by
   * measurement, not by taste — the transcript experiment is recorded in the CLAUDE.md block for this phase.
   * `SLOANE_V2_VERBATIM_TURNS` overrides it so the experiment can be re-run without an edit.
   */
  verbatimTurns: Math.max(2, Math.min(10, Number(process.env['SLOANE_V2_VERBATIM_TURNS']) || 4)),
  /** hard cap on retained turns in the record (the summary carries the rest) */
  maxTurns: 40,
  /** §14: how many tool rounds one exchange may take before Korvyn stops and answers with what it has */
  maxToolRounds: 3,
  maxToolsPerRound: 4,
  maxRequestChars: 2000,
  /**
   * §21 — the reply budget for an ordinary conversational turn. It is a BACKSTOP, not the target: the prompt
   * asks for two or three sentences. A turn does not get the whole allowance just because it exists.
   */
  maxOutputTokens: 900,
} as const;
