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
import { FactRegistry, type FinancialFact, bareFigures, renderFacts, withoutRefs } from './facts.js';
import { type RespondInput, type ResponseDefinition, buildResponse, drillOffers, renderResponse } from './respond.js';
import {
  type Offer, type ResponseStrategy, composeDirect, directEligible, drillCall, offerTaken,
} from './strategy.js';

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

/**
 * §24 — WHOSE TOKENS THESE WERE. A benchmark run, a test and a person's question are three workloads, and a cost
 * report that adds them together is not a cost report. This does not redesign any account infrastructure; it puts
 * one honest label on every trace so the three can be told apart afterwards.
 */
const workload = (): V2Trace['workload'] =>
  (process.env['KORVYN_WORKLOAD'] === 'AUTOMATED_EVALUATION' ? 'AUTOMATED_EVALUATION'
    /* the node test runner announces itself in every worker; NODE_ENV is not set by it and is not reliable */
    : process.env['KORVYN_WORKLOAD'] === 'DEVELOPMENT_TEST' || !!process.env['NODE_TEST_CONTEXT'] || process.env['NODE_ENV'] === 'test' ? 'DEVELOPMENT_TEST'
      : 'SLOANE_RUNTIME');

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

  /**
   * PHASE 2.5 §6 — WHAT A DIRECT ANSWER DOES INSTEAD OF A SECOND MODEL CALL.
   *
   * Everything here also happens on the reasoned path: the SAME `renderResponse` resolves the references and
   * withholds a sentence Korvyn cannot fill in, the same offers are computed from the cited facts, the same
   * record is written. §6 is explicit that there must not be a second formatter, and there is not — what differs
   * is only who wrote the ResponseDefinition, and both writers hand it to one renderer.
   */
  private finishDirect(a: {
    body: ConversationBody; actor: Actor; request: string; trace: V2Trace;
    notes: string[]; note: (s: string) => void; facts: FactRegistry;
    objects: FinancialObject[]; outcomes: V2ToolOutcome[]; def: ResponseDefinition;
    path: V2Path; done: (state: TurnState, path: V2Path, extra: Partial<TurnResponse>) => V2TurnOut;
    onDelta?: ((t: string) => void) | undefined; t0: number;
  }): V2TurnOut {
    const rendered = renderResponse(a.def, a.facts);
    a.trace.responseType = a.def.responseType;
    a.trace.factRefs = a.def.factRefs.length;
    a.trace.unresolvedRefs = rendered.unresolved;
    a.trace.ungroundedFigures = rendered.bare;
    if (rendered.typed.length) a.trace.responseViolations = [...a.trace.responseViolations, `figures typed rather than referenced: ${rendered.typed.join(', ')}`];
    a.trace.factsProduced = a.outcomes.reduce((n, o) => n + o.facts.length, 0);
    /* APPENDED, not assigned: the §16 escape is recorded by the caller BEFORE it hands the turn here, and
       overwriting it would lose the one finding that says why Korvyn had to compose the answer itself. */
    a.trace.responseViolations = [...a.trace.responseViolations, ...a.def.violations];
    if (rendered.unresolved.length) a.note('Sloane could not resolve part of that; it is not showing it.');

    /* §13/§14 — the answer exists NOW, so a caller watching for text gets it now. Nothing was streamed while the
       read ran, which is honest: there was no answer to stream, and a placeholder would not have been one. */
    if (a.onDelta && rendered.text) {
      if (a.trace.firstTokenMs === null) a.trace.firstTokenMs = now() - a.t0;
      if (a.trace.firstUsefulMs === null) a.trace.firstUsefulMs = now() - a.t0;
      a.onDelta(rendered.text);
    }
    const out = this.publish(a.body, a.actor, a.request, a.path, a.objects, a.outcomes, rendered.text, a.facts, a.def);
    return a.done('ANSWER', a.path, {
      notes: a.notes, objects: a.objects, narrative: out.narrative,
      ...(rendered.nextActions.length ? { suggestions: rendered.nextActions } : {}),
    });
  }

  /**
   * The record, the offers and the narrative — written once, by whichever path produced the answer.
   *
   * §19: the offers are stored WITH the fact each one would drill from, so the next turn can run a drill the
   * person clicked without asking a model what they meant.
   */
  private publish(
    body: ConversationBody, actor: Actor, request: string, path: V2Path,
    objects: FinancialObject[], outcomes: V2ToolOutcome[], answer: string,
    facts: FactRegistry, def: ResponseDefinition | null,
  ): { narrative: { text: string; objectIds: string[]; label?: string; assertion?: string }[] } {
    const refs = {
      toolCalls: outcomes.map((o) => ({ tool: o.tool, args: o.args })),
      objectIds: objects.map((o) => o.id),
      populationIds: [...new Set(objects.map((o) => o.population?.populationId).filter((x): x is string => !!x))],
      evidenceIds: [] as string[],
      analysisId: body.state.activeAnalysisId,
      agentRunId: body.state.agentRunId,
    };
    const focused = objects.filter((o) => o.focus).at(-1);
    const population = objects.map((o) => o.population?.populationId).filter(Boolean).at(-1) ?? null;
    const merged = Object.assign({}, ...objects.map((o) => o.refs)) as Record<string, string>;
    /* §7 — the word THIS answer used for its subject, so a drill taken from it can say it back rather than
       naming the codes it resolved to */
    const said = outcomes.map((o) => o.ctx.subject).filter(Boolean).at(-1) ?? null;
    const offers: Offer[] = def ? drillOffers(def, facts, said) : [];
    const next: ConversationBody = {
      ...body,
      state: {
        ...body.state,
        activeObject: focused?.focus ?? body.state.activeObject,
        activePopulationId: population ?? body.state.activePopulationId,
        lastRefs: { ...body.state.lastRefs, ...merged },
        offers,
      },
    };
    saveConversation({ ...appendTurn(next, { userMessage: request, assistantMessage: answer, path, refs }), facts: facts.snapshot() }, actor);
    const rendered = def ? renderResponse(def, facts) : null;
    return {
      narrative: rendered
        ? rendered.parts.map((pt) => ({ text: pt.text, objectIds: pt.objectIds.length ? pt.objectIds : objects.map((o) => o.id), ...(pt.label ? { label: pt.label } : {}), assertion: pt.assertion }))
        : [{ text: answer, objectIds: objects.map((o) => o.id) }],
    };
  }

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
      firstTokenMs: null, firstUsefulMs: null, strategy: null, strategyReason: null, directShape: null,
      workload: workload(), inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      calls: [], tools: [], activeStateRefs: {}, ungroundedFigures: [],
      factsProduced: 0, factRefs: 0, unresolvedRefs: [], responseType: null, responseViolations: [], notes: [],
    };
    const notes: string[] = [];
    const note = (s: string) => { if (s && !notes.includes(s)) notes.push(s); };
    /**
     * PHASE 2.5 §12 — A DISCLOSURE IS SAID ONCE PER CONVERSATION, NOT ONCE PER ANSWER.
     *
     * "Korvyn read that as total operating cost, excluding D&A" has to be in the FIRST answer about OPEX; by the
     * third it is a paragraph the person has already read, attached to a one-line figure. It is dropped when the
     * same sentence is already in the transcript — which is a fact about this conversation, not about the words,
     * so it generalises to any note a dispatcher ever carries.
     */
    const fresh = (n: string | null | undefined): string | null =>
      (n && !body.turns.some((t) => t.assistantMessage.includes(n)) ? n : null);
    const spend = (u: Usage | null | undefined) => {
      if (!u) return;
      trace.inputTokens += u.inputTokens; trace.outputTokens += u.outputTokens;
      trace.cacheReadTokens += u.cacheReadTokens; trace.cacheWriteTokens += u.cacheWriteTokens ?? 0;
    };
    const done = (state: TurnState, path: V2Path, extra: Partial<TurnResponse>): V2TurnOut => {
      trace.path = path; trace.latencyMs = now() - t0;
      trace.notes = notes.slice();
      this.traces.push(trace); if (this.traces.length > 200) this.traces.shift();
      console.log(`[sloane:v2] ${trace.traceId} ${path}${trace.strategy ? `/${trace.strategy === 'GROUNDED_DIRECT' ? 'direct' : 'reason'}` : ''} ${state} ${trace.latencyMs}ms${trace.firstTokenMs === null ? '' : ` ttft=${trace.firstTokenMs}ms`}${trace.firstUsefulMs === null ? '' : ` ttfua=${trace.firstUsefulMs}ms`} calls=${trace.modelCalls} tools=${trace.toolCalls} in=${trace.inputTokens} out=${trace.outputTokens} cacheRead=${trace.cacheReadTokens} cacheWrite=${trace.cacheWriteTokens}`);
      return { state, path, extra, notes, trace };
    };

    /* ---- 1. the conversation, as it actually stands ------------------------------------------- */
    let body = loadConversation(sessionId, actor, this.seed(actor));
    trace.transcriptTurns = body.turns.length;

    /* PHASE 2 §35 — the fact registry is the conversation's, not the turn's: "what's behind that?" three turns
       later resolves the SAME fact, and a restart does not turn a governed figure into a dangling reference. */
    const facts = new FactRegistry();
    if (body.facts?.length) facts.restore(body.facts);
    const factCtx = { book: body.state.accountingBookId, lens: body.state.reportingLens };

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

    /* ---- 1b. §19/§20 — AN OFFER THE PERSON TOOK ------------------------------------------------
       Korvyn ends a governed answer with what can be looked at next, read from the cited facts' own drills.
       The browser renders each as a chip that sends its label back as the next message, so a request that is
       EXACTLY one of those labels is not a question to be understood — it is a row of a menu Korvyn wrote, and
       the drill behind it was decided when the offer was made. That turn costs NO model call.

       The match is exact on the normalised label and deliberately not fuzzy: a near-match rule would be a phrase
       handler under another name and would start answering things nobody clicked. A TYPED drill goes to the
       model like any other request and costs one call.

       §29 DOES NOT APPLY HERE, and the reason is worth stating because the rule below it is absolute. That rule
       exists because an answer can be narrower than the QUESTION and only the model knows the question. An offer
       is KORVYN'S OWN SENTENCE about a fact already on this reader's screen and already inside their visibility —
       there is no wider question it could be narrowing. The scope is still named in the answer (`scopeClause`),
       so a limited reader clicking a chip gets their entity named and does not pay a model call to be told
       something Korvyn wrote the label for. */
    const taken = offerTaken(request, body.state.offers);
    if (taken) {
      const fact = facts.get(taken.factId);
      const call = fact ? drillCall(taken, fact, { period: body.state.period, scope: body.state.scope }) : null;
      if (call) {
        const env: Omit<ToolEnv, 'objectId'> = {
          data: this.deps.data, gl: this.deps.gl, controls: this.deps.controls, actor, visible: visibleOf(actor),
          ...(this.deps.artifacts ? { artifacts: this.deps.artifacts } : {}),
          ...(this.deps.pbc ? { pbc: this.deps.pbc } : {}),
        };
        const o = runTool(call.tool, call.args, env, 1, 1, { registry: facts, ctx: factCtx });
        trace.toolCalls += 1;
        trace.tools.push({ tool: o.tool, status: o.status === 'COMPLETED' ? 'COMPLETED' : o.status === 'REFUSED' ? 'REFUSED' : 'FAILED', latencyMs: o.latencyMs, error: o.error });
        /* the offer's word beats the code the drill resolved by (§7): `subject` here is `'50000,60000'`, and
           the person called it OPEX one turn ago */
        const word = taken.subject ?? o.ctx.subject;
        /* §20 — the title, too: a drill resolves by code, and "GL population · 50000,60000 · Jun 2026" is the
           argument list talking. The codes stay on the object's refs and in its trace, where they belong. */
        if (o.object && taken.subject) o.object.title = o.object.title.replace(/[\d]{4,}(?:\s*,\s*[\d]{4,})*/, taken.subject);
        const built = o.status === 'COMPLETED' && o.object
          ? composeDirect(o.object, o.facts, { actor, subject: word, dimension: o.ctx.dimension, measure: o.ctx.measure, note: fresh(o.ctx.note ?? o.observation.note), nextActions: [] })
          : null;
        if (built) {
          trace.strategy = 'GROUNDED_DIRECT'; trace.directShape = built.shape;
          trace.strategyReason = 'the person took an offer Korvyn made';
          return this.finishDirect({ body, actor, request, trace, notes, note, facts, objects: [o.object!], outcomes: [o], def: built.def, path: 'drill', done, onDelta: input.onDelta, t0 });
        }
        /* the drill could not be composed — say nothing about it and let the model have the turn */
        trace.strategyReason = 'the offer resolved to nothing Korvyn could state on its own';
      }
    }

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
    let response: ResponseDefinition | null = null;
    let rendered: ReturnType<typeof renderResponse> | null = null;

    for (let round = 0; round <= V2_LIMITS.maxToolRounds; round++) {
      if (input.signal?.aborted) return done('CANCELLED', 'conversation', { notes: ['Superseded by a newer request.'] });
      const last = round === V2_LIMITS.maxToolRounds;
      /* §23 — the first token is the number a person feels. It is measured per turn, not per call: a tool round
         writes nothing, so the clock runs until the model starts the ANSWER. */
      const onText = input.onDelta
        ? (t: string) => { if (trace.firstTokenMs === null) trace.firstTokenMs = now() - t0; input.onDelta!(t); }
        : undefined;
      /**
       * §22/§23 — THE ANSWER IS A TOOL INPUT NOW, SO WATCHING FOR TEXT SEES NOTHING.
       *
       * Phase 1.5 bought its first token at 2.6s by streaming the model's prose; Phase 2 moved the answer into
       * `respond`, and the first measured run paid for that structure with a first token at 8.4s — the whole
       * latency, because nothing arrived until the turn ended. The headline is read out of the tool input as it
       * is written, with each COMPLETE reference resolved to its governed value on the way past: a half-written
       * reference is held back rather than shown as machinery.
       */
      const stream = input.onDelta ? { json: '', sent: 0 } : null;
      const onToolInput = stream
        ? (u: { name: string; partial: string }) => {
            if (u.name !== 'respond') return;
            stream.json += u.partial;
            const m = /"headline"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(stream.json);
            if (!m) return;
            /* only up to the last completed reference, so {{FACT: never reaches a reader half-formed */
            let text = m[1]!.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            /* WHAT IS STREAMED CANNOT BE TAKEN BACK, so a reference is held until it is whole. Both halves of
               that matter and each was observed live as a stray brace in front of a governed value: an open
               "{{" whose "}}" has not arrived yet, and the very first "{" of a reference about to be written. */
            const open = text.lastIndexOf('{{');
            if (open >= 0 && !text.slice(open).includes('}}')) text = text.slice(0, open);
            if (text.endsWith('{')) text = text.slice(0, -1);
            const shown = renderFacts(text, facts).text;
            if (shown.length <= stream.sent) return;
            if (trace.firstTokenMs === null) trace.firstTokenMs = now() - t0;
            /* §14 — the headline of `respond` IS the answer, so its first character is the first USEFUL one */
            if (trace.firstUsefulMs === null) trace.firstUsefulMs = now() - t0;
            input.onDelta!(shown.slice(stream.sent));
            stream.sent = shown.length;
          }
        : undefined;
      const res = await this.deps.adapter.reason!(
        { system: V2_SYSTEM, messages, tools, maxTokens: V2_LIMITS.maxOutputTokens, ...(onText ? { onText } : {}),
          ...(onToolInput ? { onToolInput, eagerTools: ['respond'] } : {}) },
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
      const found = uses.find((u) => isControlTool(u.name));
      /* §22 — ANSWERING IN THE SAME BREATH AS READING IS ANSWERING BEFORE THE FACTS EXIST. A model that emits a
         governed read and `respond` together has written references to facts it has not been given yet; taking
         the answer here would publish an answer with nothing behind it. The reads run, `respond` is handed back
         unrun, and the model answers on the call it was always going to spend. */
      const early = !!found && found.name === 'respond' && uses.some((u) => !isControlTool(u.name));
      const ctl = early ? undefined : found;
      if (ctl) {
        const arg = (v: unknown, k: string) => (v && typeof v === 'object' ? String((v as Record<string, unknown>)[k] ?? '') : '');
        if (ctl.name === 'respond') {
          /* §22 — THE ANSWER ARRIVES AS STRUCTURE, ON THE SAME CALL THAT WOULD HAVE WRITTEN PROSE. There is no
             formatting pass: Korvyn validates the references against the registry, renders the governed values,
             and that is the answer. A second model call here would be a second place a figure could change. */
          response = buildResponse((ctl.input ?? {}) as RespondInput, facts, {
            hasGovernedRead: outcomes.some((o) => o.status === 'COMPLETED' && o.facts.length > 0),
            objectIds: objects.map((o) => o.id),
          });
          rendered = renderResponse(response, facts);
          answer = rendered.text;
        } else if (ctl.name === 'ask_clarification') {
          const q = arg(ctl.input, 'question') || 'Which one did you mean?';
          const opts = arg(ctl.input, 'options').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 6);
          clarify = { question: q, options: opts.map((label, i) => ({ id: `opt${i + 1}`, label })) };
        } else if (ctl.name === 'open_analysis_grid') {
          handoff = { kind: 'analysis', arg: arg(ctl.input, 'request') || request };
        } else {
          handoff = { kind: 'investigation', arg: arg(ctl.input, 'objective') || request };
        }
        /* §22 — where `respond` answered, the RENDERED structure IS the answer. Any prose the model also emitted
           beside the tool call is not: it carries no fact references, so nothing checked a figure in it. */
        if (!rendered) answer = res.value.text;
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
        if (isControlTool(u.name)) {
          return { use: u, text: JSON.stringify({ status: 'NOT_RUN', note: 'the governed reads in this step have run; their results are below. Answer now by calling respond again, referencing the facts they returned.' }) };
        }
        if (i >= V2_LIMITS.maxToolsPerRound) {
          return { use: u, text: JSON.stringify({ status: 'NOT_RUN', note: `only ${V2_LIMITS.maxToolsPerRound} tools run in one step; ask again if you still need this` }) };
        }
        const o = runTool(u.name, u.input, env, outcomes.length + 1, objects.length + 1, { registry: facts, ctx: factCtx });
        outcomes.push(o);
        trace.toolCalls += 1;
        trace.tools.push({ tool: o.tool, status: o.status === 'COMPLETED' ? 'COMPLETED' : o.status === 'REFUSED' ? 'REFUSED' : 'FAILED', latencyMs: o.latencyMs, error: o.error });
        if (o.object) { objects.push(o.object); status(`Reading ${o.object.title}`); }
        if (o.status === 'REFUSED' && o.error) note(`Not permitted: ${o.error}.`);
        return { use: u, text: observationText(o.observation) };
      });
      /* ---- §5/§6 — THE STRATEGY DECISION -------------------------------------------------------
         This is the whole of Phase 2.5. The model declared, on the read it asked for, whether that read settles
         the question or is raw material for a judgement. Korvyn now checks that declaration against what came
         back and, where it holds, ANSWERS — the second model call is not made, because it would add a sentence
         Korvyn can already write and nothing else.

         The model PROPOSES and Korvyn VALIDATES: a declaration Korvyn cannot honour falls through to the call
         below, so a wrong declaration costs one extra call and can never produce a wrong answer. */
      const elig = directEligible(outcomes, actor);
      if (elig.ok) {
        const o = elig.outcome;
        const built = composeDirect(o.object!, o.facts, { actor, subject: o.ctx.subject, dimension: o.ctx.dimension, measure: o.ctx.measure, note: fresh(o.ctx.note ?? o.observation.note), nextActions: [] });
        if (built) {
          trace.strategy = 'GROUNDED_DIRECT'; trace.directShape = built.shape; trace.strategyReason = null;
          return this.finishDirect({ body, actor, request, trace, notes, note, facts, objects, outcomes, def: built.def, path: 'analytical', done, onDelta: input.onDelta, t0 });
        }
        trace.strategyReason = 'no composer fits this governed result';
      } else {
        trace.strategyReason = elig.reason;
      }
      trace.strategy = 'GROUNDED_REASONING';

      /* the one-line reminder that costs nothing and changes what the next call does: left to itself after a
         tool result a model writes prose, and prose is the one shape that carries no sections. The prose path
         is still handled, but it is the fallback, not the road. */
      messages.push({ role: 'user', content: [
        ...results.map((r) => ({ type: 'tool_result', tool_use_id: r.use.id, content: r.text })),
        { type: 'text', text: 'Now answer by calling respond, with each figure written as its {{FACT:id}} reference.' },
      ] });
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
    /* the governed state moves with what was actually read — identities only, never a figure. A clarification
       and a handoff write the record here; an ANSWER writes it through `publish`, which also stores the offers. */
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

    /* ---- 5. grounding, structurally ------------------------------------------------------------
       PHASE 2 — THE ORDER IS INVERTED. Phase 1.5 asked, after the fact, whether a number the model had
       already written could be found in a tool result. Now the model cannot write an authoritative number
       at all: it cites a factId and Korvyn substitutes the governed display value. So the checks below are
       not a search for a bad number — they are the two ways the contract can be broken, and both are
       structural rather than textual:
         an UNRESOLVED reference   the model cited a fact that does not exist
         a BARE figure             the model typed a company figure instead of referencing one
       Where the model answered in prose rather than through `respond`, the Phase 1.5 check still runs as
       the backstop, because prose has no references to check. */
    trace.factsProduced = outcomes.reduce((a, o) => a + o.facts.length, 0);

    if (response && rendered) {
      trace.responseType = response.responseType;
      trace.responseViolations = response.violations;
      trace.factRefs = response.factRefs.length;
      trace.unresolvedRefs = rendered.unresolved;
      trace.ungroundedFigures = rendered.bare;
      /* §17 — a figure the registry already holds was Korvyn's own number written the long way round. It is a
         contract miss and is recorded as one; it is not a warning, because there is nothing for the person to
         check: the value, its sign and its scale are the governed ones. Only a figure Korvyn cannot find at all
         can be wrong, and only that one is said out loud. */
      if (rendered.typed.length) trace.responseViolations = [...trace.responseViolations, `figures typed rather than referenced: ${rendered.typed.join(', ')}`];
      if (rendered.unresolved.length) note('Sloane referred to a figure Korvyn could not resolve; that part of the answer is withheld.');
      if (rendered.bare.length) {
        note(`${rendered.bare.join(', ')} ${rendered.bare.length > 1 ? 'were' : 'was'} written without a governed reference — check ${rendered.bare.length > 1 ? 'them' : 'it'} against the figures below.`);
      }
      response.violations.filter((v) => v.startsWith('figure stated with no governed read')).forEach(() => {
        note('Sloane stated a company figure without reading it; treat that part as unverified.');
      });
    } else if (governedProse(answer, outcomes)) {
      /* §16 — THE ESCAPE HATCH IS CLOSED WITH THE MECHANISM, NOT WITH A WARNING.
         Phase 2 measured one governed turn in twenty-five answering in prose rather than through `respond`. The
         references still resolved, so the figures were right; what was lost was the structure, and with it the
         withholding rule and the offers. Rather than warn about it, Korvyn composes the answer itself from the
         governed result — the SAME composer a direct answer uses. The model's prose is discarded, because a
         sentence Korvyn did not build is a sentence Korvyn cannot stand behind at this point in the turn. */
      const o = outcomes.filter((x) => x.status === 'COMPLETED' && x.object && x.facts.length).at(-1)!;
      const built = composeDirect(o.object!, o.facts, { actor, subject: o.ctx.subject, dimension: o.ctx.dimension, measure: o.ctx.measure, note: fresh(o.ctx.note ?? o.observation.note), nextActions: [] });
      if (built) {
        trace.responseViolations = ['answered in prose; Korvyn composed the answer from the governed result'];
        trace.directShape = built.shape;
        return this.finishDirect({ body, actor, request, trace, notes, note, facts, objects, outcomes, def: built.def, path: 'analytical', done, onDelta: undefined, t0 });
      }
      /* No composer fits this governed result — a statement summary is six lines and is not one figure — so the
         prose stands, MINUS any sentence carrying a figure the model typed rather than referenced. That is the
         same rule §18 already applies to an unresolved reference, for the same reason: a sentence that names a
         line and a period and then states a number Korvyn cannot point at still reads as data. Dropping it
         costs a general-knowledge aside inside a governed answer, and the note says what happened. */
      const withValues = renderFacts(answer, facts).text;
      /* §17 — THE SPLIT IS THE SAME ON EVERY PATH. A figure the registry already holds is Korvyn's own number
         written the long way round: the value, the sign and the scale are governed and there is nothing for the
         person to check, so the sentence stays. Only a figure Korvyn cannot find at all is dropped. Applying the
         split on `respond` alone was how 13 of the 125 benchmark prompts reported real governed values as
         unsupported. */
      const split = classify(answer, facts);
      const kept = withValues.split(/(?<=[.!?])\s+/).filter((sn) => !bareFigures(withoutRefs(sn)).some((b) => !facts.holdsDisplay(b) && !facts.holdsMagnitude(b)));
      answer = kept.join(' ').trim() || 'Korvyn read the governed figures below; it is not restating them, because it could not verify how they were written.';
      trace.responseViolations = ['answered in prose and Korvyn could not compose the governed result',
        ...(split.typed.length ? [`figures typed rather than referenced: ${split.typed.join(', ')}`] : [])];
      trace.ungroundedFigures = [];
      if (split.bare.length) note(`${split.bare.join(', ')} ${split.bare.length > 1 ? 'were' : 'was'} written without a governed reference and ${split.bare.length > 1 ? 'have' : 'has'} been left out; the figures below are what Korvyn read.`);
    } else if (/\{\{FACT:/.test(answer)) {
      /* THE MODEL WROTE REFERENCES AND ANSWERED IN PROSE ANYWAY — observed live on the first run of this phase.
         A reference is Korvyn's machinery and must never reach the person (§26), so it is resolved here exactly
         as `respond` would resolve it: the contract is a property of the runtime, not of the model remembering
         to call a tool. What prose did NOT do is organise the answer, and the trace records that as the defect
         it is rather than letting it pass silently. */
      const written = answer;
      const r = renderFacts(answer, facts);
      /* §18, the prose half: a sentence Korvyn could not fill in is dropped rather than published with a hole.
         Prose has no sections to withhold, so the sentence is the unit. */
      answer = r.unresolved.length
        ? (r.text.split(/(?<=[.!?])\s+/).filter((s) => !s.includes('[figure unavailable]')).join(' ').trim()
           || 'Korvyn could not resolve the figures behind that, so it is not showing them.')
        : r.text;
      trace.factRefs = r.used.length;
      trace.unresolvedRefs = r.unresolved;
      const split2 = classify(written, facts);
      trace.responseViolations = ['answered in prose rather than through respond',
        ...(split2.typed.length ? [`figures typed rather than referenced: ${split2.typed.join(', ')}`] : [])];
      trace.ungroundedFigures = split2.bare;
      if (r.unresolved.length) note('Sloane referred to a figure Korvyn could not resolve; that part of the answer is withheld.');
      if (trace.ungroundedFigures.length) {
        note(`${trace.ungroundedFigures.join(', ')} ${trace.ungroundedFigures.length > 1 ? 'were' : 'was'} written without a governed reference — check ${trace.ungroundedFigures.length > 1 ? 'them' : 'it'} against the figures below.`);
      }
    } else {
      /* the model answered in prose. Nothing referenced a fact, so the measured check is what there is. */
      trace.ungroundedFigures = ungrounded(answer, outcomes, body, facts);
      if (trace.ungroundedFigures.length) {
        note(`Korvyn could not match ${trace.ungroundedFigures.join(', ')} to a governed read in this conversation — check ${trace.ungroundedFigures.length > 1 ? 'those figures' : 'that figure'} against the objects below before relying on ${trace.ungroundedFigures.length > 1 ? 'them' : 'it'}.`);
      }
    }

    const path: V2Path = objects.length ? 'analytical' : 'conversation';
    /* §21/§24 — the sections travel as separate narrative entries so the renderer can draw a quiet label above
       each; a DIRECT answer produces exactly one entry with no label, which is what §23 asks for. §19 — the
       offers Korvyn is about to make are stored with the facts they drill from, whichever path wrote them. */
    const narrative = this.publish(body, actor, request, path, objects, outcomes, answer, facts, response).narrative;

    return done('ANSWER', path, objects.length
      ? { notes, objects, narrative, ...(rendered?.nextActions.length ? { suggestions: rendered.nextActions } : {}) }
      : { notes, objects: [], narrative: [], reply: answer, ...(rendered?.nextActions.length ? { suggestions: rendered.nextActions } : {}) });
  }
}

/**
 * §17 — THE TWO KINDS OF FIGURE THE MODEL TYPED, TOLD APART THE SAME WAY EVERYWHERE.
 *
 * `typed` is a figure byte-identical to something the registry holds — Korvyn's own number written the long way
 * round, a contract miss with nothing for a reader to check. `bare` is a figure Korvyn cannot find at all, and is
 * the only one that can be wrong. Run on the model's own prose, with any references stripped first.
 */
function classify(text: string, reg: FactRegistry): { typed: string[]; bare: string[] } {
  const typed: string[] = [];
  const bare: string[] = [];
  /* a magnitude the registry holds counts as typed: the digits are governed and the direction is in the verb
     ("EBITDA fell $0.39M" against a stored "($0.39M)"). Only a magnitude Korvyn cannot find at all is bare. */
  for (const f of bareFigures(withoutRefs(text))) (reg.holdsDisplay(f) || reg.holdsMagnitude(f) ? typed : bare).push(f);
  return { typed, bare };
}

/**
 * §16 — A GOVERNED NUMERICAL ANSWER THAT ARRIVED AS PROSE.
 *
 * Not every prose answer is a defect: a conceptual question and a refusal are prose and should be. What must
 * never happen is this company's figures reaching a person through a sentence nothing structured. The test is
 * therefore about the TURN, not about the wording — governed reads produced authoritative figures, and the
 * model wrote instead of calling `respond`.
 */
function governedProse(answer: string, outcomes: V2ToolOutcome[]): boolean {
  if (!/\{\{FACT:/.test(answer) && !FIGURE.test(answer)) return false;
  FIGURE.lastIndex = 0;
  return outcomes.some((o) => o.status === 'COMPLETED' && !!o.object && o.facts.some((f) => f.kind === 'GOVERNED' || f.kind === 'DERIVED'));
}

/* ---- §1: the figures in an answer, checked against what was actually read --------------------- */

/**
 * A money or percentage figure, as finance writes it: "$3.50M", "($11.02M)", "-75.9%", "1,234".
 * Bare integers are deliberately out — a year, an account code and a count of reconciliations are
 * not figures anyone would trace, and flagging them would bury the one that matters.
 */
const FIGURE = /\(-?[$€£]\s?[\d,]+(?:\.\d+)?\s?[MKB]?\)|-?[$€£]\s?[\d,]+(?:\.\d+)?\s?[MKB]?|-?\d[\d,]*(?:\.\d+)?\s?%/g;

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
function ungrounded(answer: string, outcomes: V2ToolOutcome[], body: ConversationBody, reg: FactRegistry): string[] {
  const said = answer.match(FIGURE) ?? [];
  if (!said.length) return [];
  const corpus = [
    ...outcomes.map((o) => observationText(o.observation)),
    ...body.turns.flatMap((t) => [t.userMessage, t.assistantMessage]),
    body.summary ?? '',
  ].join(' ');
  const known = new Set((corpus.match(FIGURE) ?? []).map(figureKey).filter(Boolean));
  /**
   * PHASE 2.6.1 — THE SAME MAGNITUDE WITH THE SIGN IN THE VERB, ON THE PROSE PATH TOO.
   *
   * `FactRegistry.holdsMagnitude` already settled this for a structured answer: "EBITDA fell $0.39M" is a
   * correct sentence about a figure stored as "($0.39M)", because the digits are governed and the direction is
   * carried by the word. This path compares against the CONVERSATION rather than the registry and kept the
   * strict signed key, so the same sentence read as a fabrication depending only on which path answered —
   * observed live. Magnitude is its own set, and a figure is only unmatched when neither holds.
   */
  const mag = new Set([...known].map((k) => k.replace(/^-/, '')));
  const out: string[] = [];
  for (const s of said) {
    const k = figureKey(s);
    /* zero and a lone per-cent sign are not claims about the book */
    if (!k || k === '0' || known.has(k) || mag.has(k.replace(/^-/, ''))) continue;
    /**
     * PHASE 2.6.1 — THE REGISTRY OUTLIVES THE OBSERVATION, AND §36 SAYS IT MUST.
     *
     * A turn that calls no tool has no observations, and a figure it restates was a FACT two turns ago rather
     * than a phrase in the prose. Checking only what was SAID reported EBITDA's own governed movement as a
     * figure Korvyn could not find — observed live, intermittently, depending on whether the earlier answer
     * happened to spell the difference out. The registry is the durable record of what was read, so it is what
     * this asks.
     */
    if (reg.holdsDisplay(s.trim()) || reg.holdsMagnitude(s.trim())) continue;
    const trimmed = s.trim();
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out.slice(0, 6);
}
