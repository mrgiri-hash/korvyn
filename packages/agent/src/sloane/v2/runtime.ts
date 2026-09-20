/**
 * SLOANE CORE RUNTIME V2 — THE CONVERSATIONAL CORE.
 *
 * §2: this runs BESIDE the v1 orchestrator, behind SLOANE_RUNTIME_V2. Nothing here replaces a governed service:
 * the ledger, the controls, the permission model, the analysis grid, the investigation runtime, the artifact
 * engine, the work store and the trace are all v1's and are called, not re-implemented.
 *
 * THE LOOP, and what it costs:
 *
 *   load the conversation → build the context ONCE → ONE primary reasoning call
 *     → (only if it asked) governed tools, re-authorized, compacted → ONE more call to answer
 *     → persist the exchange → trace
 *
 * §3's targets, stated honestly: a turn that needs no facts is ONE model call and no narration pass. A turn that
 * needs facts is TWO — the model cannot answer from a tool result it has not seen, and that is the floor for native
 * tool use. What is gone is v1's unconditional four (converse → interpret → plan → narrate), the separate narration
 * call, and the analysisEdit call every turn a grid was on screen.
 *
 * §16: a turn a deterministic surface already answers — a grid command, an undo, a redo, a navigation — never
 * reaches this file. `eligible()` declines it and the orchestrator runs v1's deterministic path, at zero model calls.
 */
import { randomUUID } from 'node:crypto';
import type { ReasonMessage, ReasonToolUse, SloaneLLMAdapter, Usage } from '../adapter.js';
import type { ControlService } from '../controls.js';
import type { FinancialDataService } from '../financials.js';
import type { GovernedLedger } from '../governed.js';
import type { TurnResponse, TurnState } from '../orchestrator.js';
import { V2_SYSTEM, dataBlock } from '../prompts.js';
import type { ContextAssembler } from '../semantic/context.js';
import { type Actor, type FinancialObject, type ToolEnv, visibleOf } from '../tools.js';
import {
  type ConversationBody, type V2Path, type V2Trace, V2_LIMITS,
} from './model.js';
import {
  appendTurn, loadConversation, saveConversation, sessionLike, setPending, stateForModel, transcriptMessages,
} from './conversation.js';
import { type V2ToolOutcome, isControlTool, observationText, runTool, toolDefinitions } from './tools.js';

/** what a handoff into an existing v1 surface gives back; v2 renders none of it itself */
export interface V2Handoff { state: TurnState; extra: Partial<TurnResponse>; notes: string[] }

export interface V2Deps {
  adapter: SloaneLLMAdapter;
  data: FinancialDataService;
  gl: GovernedLedger;
  controls: ControlService;
  semantic: ContextAssembler;
  artifacts?: ToolEnv['artifacts'];
  pbc?: ToolEnv['pbc'];
}

export interface V2TurnInput {
  sessionId: string;
  request: string;
  actor: Actor;
  /** the answer to a question v2 asked last turn: an option id or the person's own words */
  clarification?: string | null;
  signal?: AbortSignal;
  status?: (text: string) => void;
  /** §22 — each text delta as the model writes it, so the browser shows an answer forming */
  onDelta?: (text: string) => void;
  /* the handoffs are per-turn closures, not construction-time dependencies: each one needs THIS turn's session,
     trace and cancellation, and a field on the runtime would be shared state between concurrent conversations. */
  /** §20: the 8C analysis grid, unchanged — v2 hands it the person's words and renders what it returns */
  openAnalysis?: (request: string) => Promise<V2Handoff | null>;
  /** §21: the 8D investigation runtime, unchanged */
  startInvestigation?: (objective: string) => Promise<V2Handoff | null>;
}

export interface V2TurnOut { state: TurnState; path: V2Path; extra: Partial<TurnResponse>; notes: string[]; trace: V2Trace }

const now = () => Date.now();

export class SloaneV2 {
  private readonly traces: V2Trace[] = [];
  constructor(private readonly deps: V2Deps) {}

  /** the reasoning contract v2 needs; without it (mock provider, no credentials) v1's deterministic engine answers */
  available(): boolean { return typeof this.deps.adapter.reason === 'function'; }

  /**
   * §16/§37 — what v2 does NOT take. A structured UI command and a clarification v1 is holding belong to the path
   * that can answer them with no model call at all; taking them here would add a call and remove a guarantee.
   */
  eligible(input: { request: string; hasUiCommand: boolean; v1Pending: boolean }): boolean {
    if (!this.available()) return false;
    if (input.hasUiCommand) return false;
    if (input.v1Pending) return false;
    return !!input.request.trim();
  }

  recent(n = 20): V2Trace[] { return this.traces.slice(-n); }
  traceOf(id: string): V2Trace | null { return this.traces.find((t) => t.traceId === id) ?? null; }
  /** the durable conversation, for tests and the development trace */
  conversation(sessionId: string, actor: Actor): ConversationBody { return loadConversation(sessionId, actor, this.seed(actor)); }

  private seed(actor: Actor) {
    const scope = actor.scopeIds === 'ALL' ? 'GROUP' : actor.scopeIds[0]!;
    return {
      period: this.deps.data.workingPeriod(), scope,
      currency: this.deps.data.scope(scope)?.presentationCurrency ?? 'USD',
      basis: 'US GAAP', lens: 'Corporate Consolidated', bookId: 'CORE-GL',
    };
  }

  async turn(input: V2TurnInput): Promise<V2TurnOut> {
    const t0 = now();
    const { actor, sessionId } = input;
    const status = input.status ?? (() => {});
    const trace: V2Trace = {
      runtime: 'v2', traceId: `V2-${randomUUID().slice(0, 8)}`, sessionId, path: 'conversation',
      request: input.request.slice(0, V2_LIMITS.maxRequestChars), model: null, escalationReason: null,
      modelCalls: 0, toolCalls: 0, contextBuilds: 0, toolsExposed: 0, transcriptTurns: 0, latencyMs: 0,
      firstTokenMs: null, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      calls: [], tools: [], activeStateRefs: {}, ungroundedFigures: [], notes: [],
    };
    const notes: string[] = [];
    const note = (s: string) => { if (s && !notes.includes(s)) notes.push(s); };
    const spend = (u: Usage | null | undefined) => {
      if (!u) return;
      trace.inputTokens += u.inputTokens; trace.outputTokens += u.outputTokens;
      trace.cacheReadTokens += u.cacheReadTokens; trace.cacheWriteTokens += u.cacheWriteTokens ?? 0;
    };
    const done = (state: TurnState, path: V2Path, extra: Partial<TurnResponse>): V2TurnOut => {
      trace.path = path; trace.latencyMs = now() - t0;
      trace.notes = notes.slice();
      this.traces.push(trace); if (this.traces.length > 200) this.traces.shift();
      console.log(`[sloane:v2] ${trace.traceId} ${path} ${state} ${trace.latencyMs}ms${trace.firstTokenMs === null ? '' : ` ttft=${trace.firstTokenMs}ms`} calls=${trace.modelCalls} tools=${trace.toolCalls} in=${trace.inputTokens} out=${trace.outputTokens} cacheRead=${trace.cacheReadTokens} cacheWrite=${trace.cacheWriteTokens}`);
      return { state, path, extra, notes, trace };
    };

    /* ---- 1. the conversation, as it actually stands ------------------------------------------- */
    let body = loadConversation(sessionId, actor, this.seed(actor));
    trace.transcriptTurns = body.turns.length;

    /* a question v2 asked last turn: the answer becomes the person's next message, so the transcript stays a
       transcript — there is no side channel carrying a decision the conversation cannot see */
    let request = input.request.trim().slice(0, V2_LIMITS.maxRequestChars);
    if (body.pending && input.clarification) {
      const opt = body.pending.options.find((o) => o.id === input.clarification || o.label === input.clarification);
      request = opt ? opt.label : String(input.clarification).slice(0, V2_LIMITS.maxRequestChars);
      body = setPending(body, null);
    } else if (body.pending && request) {
      body = setPending(body, null);
    }
    if (!request) return done('ERROR', 'deterministic', { notes: ['request is required'] });

    /* ---- 2. the context, built ONCE ------------------------------------------------------------ */
    const tools = toolDefinitions(actor);
    trace.toolsExposed = tools.length;
    let semantic: unknown = null;
    try { semantic = this.deps.semantic.forModel(actor, request, sessionLike(body.state)); } catch { semantic = null; }
    trace.contextBuilds = 1;
    const state = stateForModel(body.state);
    trace.activeStateRefs = {
      period: body.state.period, scope: body.state.scope, object: body.state.activeObject?.id ?? null,
      analysisId: body.state.activeAnalysisId, populationId: body.state.activePopulationId,
    };
    /* §10: the state and the neighbourhood are DATA — the same fenced block every other Sloane prompt uses, so a
       memo or a vendor name inside them can never read as an instruction */
    const opening = `${dataBlock({ state, semantic })}\n\n${request}`;

    /* the current turn also ends a cacheable prefix: within a turn, round 2's request repeats everything up to
       here, so the tool round costs cache reads rather than full input (§19) */
    const messages: ReasonMessage[] = [...transcriptMessages(body), { role: 'user', content: opening, cache: true }];

    /* ---- 3. the reasoning loop ------------------------------------------------------------------ */
    const objects: FinancialObject[] = [];
    const outcomes: V2ToolOutcome[] = [];
    let answer = '';
    let handoff: { kind: 'analysis' | 'investigation'; arg: string } | null = null;
    let clarify: { question: string; options: { id: string; label: string }[] } | null = null;

    for (let round = 0; round <= V2_LIMITS.maxToolRounds; round++) {
      if (input.signal?.aborted) return done('CANCELLED', 'conversation', { notes: ['Superseded by a newer request.'] });
      const last = round === V2_LIMITS.maxToolRounds;
      /* §23 — the first token is the number a person feels. It is measured per turn, not per call: a tool round
         writes nothing, so the clock runs until the model starts the ANSWER. */
      const onText = input.onDelta
        ? (t: string) => { if (trace.firstTokenMs === null) trace.firstTokenMs = now() - t0; input.onDelta!(t); }
        : undefined;
      const res = await this.deps.adapter.reason!(
        { system: V2_SYSTEM, messages, tools, maxTokens: V2_LIMITS.maxOutputTokens, ...(onText ? { onText } : {}) },
        { route: 'FAST', ...(input.signal ? { signal: input.signal } : {}) },
      );
      trace.modelCalls += 1;
      trace.model = res.model ?? trace.model;
      const call = {
        stage: `reason:${round}`, model: res.model ?? null, status: res.status,
        latencyMs: res.latencyMs,
        inputTokens: res.status === 'declined' ? 0 : (res.usage?.inputTokens ?? 0),
        outputTokens: res.status === 'declined' ? 0 : (res.usage?.outputTokens ?? 0),
        cacheReadTokens: res.status === 'declined' ? 0 : (res.usage?.cacheReadTokens ?? 0),
        stopReason: res.status === 'ok' ? res.value.stopReason : null,
        error: res.status === 'error' ? `${res.code}: ${res.detail}` : res.status === 'declined' ? res.reason : null,
      };
      trace.calls.push(call);
      if (res.status !== 'ok') { spend('usage' in res ? res.usage : null); break; }
      spend(res.usage);

      const uses: ReasonToolUse[] = res.value.toolUses;
      if (!uses.length) { answer = res.value.text; break; }

      /* a control tool ends the turn: the product does the thing, and no further reasoning call is spent */
      const ctl = uses.find((u) => isControlTool(u.name));
      if (ctl) {
        const arg = (v: unknown, k: string) => (v && typeof v === 'object' ? String((v as Record<string, unknown>)[k] ?? '') : '');
        if (ctl.name === 'ask_clarification') {
          const q = arg(ctl.input, 'question') || 'Which one did you mean?';
          const opts = arg(ctl.input, 'options').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 6);
          clarify = { question: q, options: opts.map((label, i) => ({ id: `opt${i + 1}`, label })) };
        } else if (ctl.name === 'open_analysis_grid') {
          handoff = { kind: 'analysis', arg: arg(ctl.input, 'request') || request };
        } else {
          handoff = { kind: 'investigation', arg: arg(ctl.input, 'objective') || request };
        }
        answer = res.value.text;
        break;
      }

      if (last) {
        /* the step limit: answer with what the governed objects already say rather than spending another round */
        answer = res.value.text;
        note('Sloane reached its step limit for this turn; the figures below are what it read.');
        break;
      }

      messages.push({ role: 'assistant', content: res.value.content });
      const env: Omit<ToolEnv, 'objectId'> = {
        data: this.deps.data, gl: this.deps.gl, controls: this.deps.controls, actor, visible: visibleOf(actor),
        ...(this.deps.artifacts ? { artifacts: this.deps.artifacts } : {}),
        ...(this.deps.pbc ? { pbc: this.deps.pbc } : {}),
      };
      /* EVERY tool_use must be answered, or the provider rejects the next request — an over-cap call gets a
         result that says it was not run, never silence */
      const results = uses.map((u, i) => {
        if (i >= V2_LIMITS.maxToolsPerRound) {
          return { use: u, text: JSON.stringify({ status: 'NOT_RUN', note: `only ${V2_LIMITS.maxToolsPerRound} tools run in one step; ask again if you still need this` }) };
        }
        const o = runTool(u.name, u.input, env, outcomes.length + 1, objects.length + 1);
        outcomes.push(o);
        trace.toolCalls += 1;
        trace.tools.push({ tool: o.tool, status: o.status === 'COMPLETED' ? 'COMPLETED' : o.status === 'REFUSED' ? 'REFUSED' : 'FAILED', latencyMs: o.latencyMs, error: o.error });
        if (o.object) { objects.push(o.object); status(`Reading ${o.object.title}`); }
        if (o.status === 'REFUSED' && o.error) note(`Not permitted: ${o.error}.`);
        return { use: u, text: observationText(o.observation) };
      });
      messages.push({ role: 'user', content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.use.id, content: r.text })) });
    }

    /* ---- 4. what the turn leaves on screen ------------------------------------------------------ */
    const refs = {
      toolCalls: outcomes.map((o) => ({ tool: o.tool, args: o.args })),
      objectIds: objects.map((o) => o.id),
      populationIds: [...new Set(objects.map((o) => o.population?.populationId).filter((x): x is string => !!x))],
      evidenceIds: [] as string[],
      analysisId: body.state.activeAnalysisId,
      agentRunId: body.state.agentRunId,
    };
    /* the governed state moves with what was actually read — identities only, never a figure */
    const focused = objects.filter((o) => o.focus).at(-1);
    const population = objects.map((o) => o.population?.populationId).filter(Boolean).at(-1) ?? null;
    const merged = Object.assign({}, ...objects.map((o) => o.refs)) as Record<string, string>;
    body = {
      ...body,
      state: {
        ...body.state,
        activeObject: focused?.focus ?? body.state.activeObject,
        activePopulationId: population ?? body.state.activePopulationId,
        lastRefs: { ...body.state.lastRefs, ...merged },
      },
    };

    if (clarify) {
      const pendingId = `PND-${randomUUID().slice(0, 8)}`;
      body = setPending(appendTurn(body, { userMessage: request, assistantMessage: clarify.question, path: 'clarification', refs }), { id: pendingId, question: clarify.question, options: clarify.options, askedAt: new Date().toISOString() });
      saveConversation(body, actor);
      return done('CLARIFICATION_REQUIRED', 'clarification', {
        notes, objects, clarification: { pendingId, field: 'conversation', question: clarify.question, options: clarify.options },
      });
    }

    if (handoff) {
      const run = handoff.kind === 'analysis' ? input.openAnalysis : input.startInvestigation;
      trace.escalationReason = handoff.kind === 'analysis' ? 'the person wants a grid to work in' : 'the objective needs a governed investigation';
      const h = run ? await run(handoff.arg) : null;
      const path: V2Path = handoff.kind === 'analysis' ? 'analysis-handoff' : 'investigation-handoff';
      if (h) {
        h.notes.forEach(note);
        const said = answer || (handoff.kind === 'analysis' ? 'Opened it as an analysis you can reshape.' : 'Started the investigation.');
        body = appendTurn(body, { userMessage: request, assistantMessage: said, path, refs });
        saveConversation(body, actor);
        return done(h.state, path, { ...h.extra, notes: [...(h.extra.notes ?? []), ...notes] });
      }
      note(handoff.kind === 'analysis' ? 'Sloane could not open that as an analysis here.' : 'Sloane could not start an investigation here.');
    }

    if (!answer) {
      const failed = trace.calls.at(-1);
      note(failed?.error ? 'Sloane could not complete this turn; the governed figures below are unchanged.' : 'Sloane has nothing to add to this.');
      body = appendTurn(body, { userMessage: request, assistantMessage: '', path: 'conversation', refs });
      saveConversation(body, actor);
      return done(objects.length ? 'ANSWER' : 'UNAVAILABLE', 'conversation', { notes, objects, narrative: [] });
    }

    /* §1 — EVERY ENTERPRISE FIGURE MUST BE POINTABLE AT. The benchmark found an answer that said $3.69M
       where three independent governed reads all said $3.50M, so "quote it exactly" is a rule the prompt
       states and cannot enforce. This is the enforcement, and it deliberately only MEASURES: the answer
       is what Sloane said, and rewriting it would hide the defect rather than surface it. */
    trace.ungroundedFigures = ungrounded(answer, outcomes, body);
    if (trace.ungroundedFigures.length) {
      note(`Korvyn could not match ${trace.ungroundedFigures.join(', ')} to a governed read in this conversation — check ${trace.ungroundedFigures.length > 1 ? 'those figures' : 'that figure'} against the objects below before relying on ${trace.ungroundedFigures.length > 1 ? 'them' : 'it'}.`);
    }

    const path: V2Path = objects.length ? 'analytical' : 'conversation';
    body = appendTurn(body, { userMessage: request, assistantMessage: answer, path, refs });
    saveConversation(body, actor);
    /* one reply, in Sloane's own words. There is no second narration pass, and nothing rewrites it. */
    return done('ANSWER', path, objects.length
      ? { notes, objects, narrative: [{ text: answer, objectIds: objects.map((o) => o.id) }] }
      : { notes, objects: [], narrative: [], reply: answer });
  }
}

/* ---- §1: the figures in an answer, checked against what was actually read --------------------- */

/**
 * A money or percentage figure, as finance writes it: "$3.50M", "($11.02M)", "-75.9%", "1,234".
 * Bare integers are deliberately out — a year, an account code and a count of reconciliations are
 * not figures anyone would trace, and flagging them would bury the one that matters.
 */
const FIGURE = /\(?-?[$€£]\s?[\d,]+(?:\.\d+)?\s?[MKB]?\)?|-?\d[\d,]*(?:\.\d+)?\s?%/g;

/**
 * One key per figure, so the same amount written two defensible ways reads as one: parentheses and a
 * leading minus are both "negative", a trailing zero is not information, and the currency symbol and
 * the scale letter are presentation. What survives is sign and significant digits, which is what a
 * person checking a number against a ledger actually compares.
 */
function figureKey(raw: string): string {
  const neg = /^\(/.test(raw.trim()) || /^-/.test(raw.trim());
  const digits = raw.replace(/[()$€£%,\s]/g, '').replace(/^-/, '').replace(/[MKB]$/i, '');
  if (!/\d/.test(digits)) return '';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '';
  /* 3.50 and 3.5 are one number; 3.69 and 3.50 are not */
  return `${neg && n !== 0 ? '-' : ''}${String(n)}`;
}

/**
 * Grounded means: this turn's tool results, or something Sloane or the person already said earlier in
 * this conversation. A figure carried forward from three turns ago is grounded — it was read then, and
 * making the check turn-local would flag ordinary continuity as fabrication.
 */
function ungrounded(answer: string, outcomes: V2ToolOutcome[], body: ConversationBody): string[] {
  const said = answer.match(FIGURE) ?? [];
  if (!said.length) return [];
  const corpus = [
    ...outcomes.map((o) => observationText(o.observation)),
    ...body.turns.flatMap((t) => [t.userMessage, t.assistantMessage]),
    body.summary ?? '',
  ].join(' ');
  const known = new Set((corpus.match(FIGURE) ?? []).map(figureKey).filter(Boolean));
  const out: string[] = [];
  for (const s of said) {
    const k = figureKey(s);
    /* zero and a lone per-cent sign are not claims about the book */
    if (!k || k === '0' || known.has(k)) continue;
    const trimmed = s.trim();
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out.slice(0, 6);
}
