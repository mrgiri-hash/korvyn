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
 *
 * PHASE 3 §4/§27 — THE MODEL WRITES THE ANSWER. Phase 2 required a `respond` call carrying a response type and
 * six sections, and `renderResponse` drew a heading above each; measured on the brief's own close conversation
 * that produced 207-word reports with three headings over two sentences of answer. The model now answers by
 * WRITING — the same call, the same cost, the same fact references — and `show_list` adds rows only when rows
 * read better than a sentence. `fromProse` turns what it wrote into the SAME `ResponseDefinition` everything
 * downstream already reads, so the grounding, the withholding, the offers and the trace are one path with two
 * authors rather than a main road and an escape hatch.
 */
import { randomUUID } from 'node:crypto';
import type { ReasonMessage, ReasonToolUse, SloaneLLMAdapter, Usage } from '../adapter.js';
import type { ControlService } from '../controls.js';
import type { FinancialDataService } from '../financials.js';
import type { GovernedLedger } from '../governed.js';
import type { Presentation, TurnResponse, TurnState } from '../orchestrator.js';
import { V2_SYSTEM, dataBlock } from '../prompts.js';
import type { ContextAssembler } from '../semantic/context.js';
import { type Actor, type FinancialObject, type ToolEnv, visibleOf } from '../tools.js';
import {
  type ConversationBody, type TurnRender, type V2Path, type V2Trace, V2_LIMITS,
} from './model.js';
import {
  appendTurn, contextOnDemand, listConversations, loadConversation, readConversation, saveConversation, setPending,
  stateForModel, transcriptMessages, withRender,
} from './conversation.js';
import { type V2ToolOutcome, isControlTool, observationText, runTool, toolDefinitions } from './tools.js';
import { FactRegistry, type FinancialFact, bareFigures, renderFacts, withoutRefs } from './facts.js';
import { type RespondInput, type ResponseDefinition, buildResponse, drillOffers, fromProse, renderResponse, withList } from './respond.js';
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

  /* ---- PHASE C1: the conversation as a readable object ------------------------------------------ */
  /** §2 — what History lists. Owner-filtered in the store; there is no parameter for someone else's thread. */
  conversations(actor: Actor) { return listConversations(actor); }
  /** §26 — the whole thread, with what each turn showed, so reopening restores rather than summarises */
  transcript(sessionId: string, actor: Actor) { return readConversation(sessionId, actor); }
  /**
   * §31 — remember what the person saw. Called by the orchestrator once the turn's response exists, because the
   * response is the only place the rendered shape is assembled; the runtime would otherwise have to build it a
   * second time and the two could drift.
   */
  /**
   * §23/§43 — a turn another runtime answered still belongs to the conversation it was asked in. The record
   * keeps the exchange and the link (`agentRunId`), so the thread is whole in History and the investigation is
   * reachable from it. The agent runtime keeps its own record; this does not duplicate it.
   */
  recordExternalTurn(sessionId: string, actor: Actor, request: string, said: string, runId: string | null): void {
    const body = loadConversation(sessionId, actor, this.seed(actor));
    const next = appendTurn(body, {
      userMessage: request, assistantMessage: said, path: 'investigation-handoff',
      refs: { toolCalls: [], objectIds: [], populationIds: [], evidenceIds: [], analysisId: null, agentRunId: runId },
    });
    saveConversation({ ...next, state: { ...next.state, agentRunId: runId ?? next.state.agentRunId } }, actor);
  }

  remember(sessionId: string, actor: Actor, render: TurnRender): void {
    const body = loadConversation(sessionId, actor, this.seed(actor));
    if (!body.turns.length) return;
    saveConversation(withRender(body, render), actor);
  }

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
    notes: string[]; note: (s: string) => void; diag: (s: string) => void; diagnostics: string[]; facts: FactRegistry;
    objects: FinancialObject[]; outcomes: V2ToolOutcome[]; def: ResponseDefinition;
    path: V2Path; done: (state: TurnState, path: V2Path, extra: Partial<TurnResponse>) => V2TurnOut;
    onDelta?: ((t: string) => void) | undefined; t0: number;
  }): V2TurnOut {
    const rendered = renderResponse(a.def, a.facts);
    a.trace.responseType = a.def.responseType;
    a.trace.factRefs = a.def.factRefs.length;
    a.trace.unresolvedRefs = rendered.unresolved;
    /* APPENDED, not assigned — the same trap as the violations above. A composed answer may be standing in for
       prose Korvyn withheld, and the figure that caused the withholding is the one finding worth keeping. */
    a.trace.ungroundedFigures = [...new Set([...a.trace.ungroundedFigures, ...rendered.bare])];
    if (rendered.typed.length) a.trace.responseViolations = [...a.trace.responseViolations, `figures typed rather than referenced: ${rendered.typed.join(', ')}`];
    a.trace.factsProduced = a.outcomes.reduce((n, o) => n + o.facts.length, 0);
    /* APPENDED, not assigned: the §16 escape is recorded by the caller BEFORE it hands the turn here, and
       overwriting it would lose the one finding that says why Korvyn had to compose the answer itself. */
    a.trace.responseViolations = [...a.trace.responseViolations, ...a.def.violations];
    if (rendered.unresolved.length) a.diag(`unresolved fact references: ${rendered.unresolved.join(', ')}`);

    /* §13/§14 — the answer exists NOW, so a caller watching for text gets it now. Nothing was streamed while the
       read ran, which is honest: there was no answer to stream, and a placeholder would not have been one. */
    if (a.onDelta && rendered.text) {
      if (a.trace.firstTokenMs === null) a.trace.firstTokenMs = now() - a.t0;
      if (a.trace.firstUsefulMs === null) a.trace.firstUsefulMs = now() - a.t0;
      a.onDelta(rendered.text);
    }
    const out = this.publish(a.body, a.actor, a.request, a.path, a.objects, a.outcomes, rendered.text, a.facts, a.def);
    /* §7 — a composed BREAKDOWN is a handful of named rows and reads as a list; a single figure or a status is
       a sentence and shows nothing. The rows come back RESOLVED from `publish`, never from the definition. */
    return a.done('ANSWER', a.path, {
      notes: a.notes, diagnostics: a.diagnostics, objects: a.objects, narrative: out.narrative,
      presentation: out.rows.length ? { kind: 'LIST', rows: out.rows } : null,
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
  ): { narrative: { text: string; objectIds: string[]; label?: string; assertion?: string }[]; rows: string[] } {
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
    /**
     * §14 — THE MESSAGE AND THE PRESENTATION ARE TWO THINGS, AND A ROW BELONGS TO EXACTLY ONE OF THEM.
     *
     * The rows were travelling as narrative entries marked `row` AND being copied into the presentation from
     * the definition's own assertions — so they drew twice, and the presentation copy still held the raw
     * `{{FACT:…}}` references because only `renderResponse` resolves those. Observed live: four resolved rows
     * followed by four rows of machinery.
     *
     * The split happens once, here, after resolution: message parts are the answer, row parts are the
     * presentation, and neither can be the other.
     */
    const parts = rendered ? rendered.parts : [];
    const msg = parts.filter((p) => !p.row);
    const rows = parts.filter((p) => p.row).map((p) => p.text);
    return {
      narrative: rendered
        ? msg.map((pt) => ({ text: pt.text, objectIds: pt.objectIds.length ? pt.objectIds : objects.map((o) => o.id), ...(pt.label ? { label: pt.label } : {}), assertion: pt.assertion }))
        : [{ text: answer, objectIds: objects.map((o) => o.id) }],
      rows,
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
      factsProduced: 0, factRefs: 0, unresolvedRefs: [], responseType: null, responseViolations: [], notes: [], diagnostics: [],
    };
    const notes: string[] = [];
    /**
     * RUNTIME V3 §11 — TWO CHANNELS, AND ONLY ONE OF THEM IS FOR A PERSON.
     *
     * `note` is something a finance professional needs told: their access is narrower than their question, a
     * source is stale, a period is not governed. `diag` is Korvyn checking its own work — an unresolved
     * reference, a figure it could not back, a population mismatch. Both were `note` before, so
     * "…were written without a governed reference — check them against the figures below" reached a
     * controller's screen. The withholding still happens; what changed is that it happens silently and the
     * finding goes to the trace, which is where a defect belongs.
     */
    const diagnostics: string[] = [];
    const note = (s: string) => { if (s && !notes.includes(s)) notes.push(s); };
    const diag = (s: string) => { if (s && !diagnostics.includes(s)) diagnostics.push(s); };
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
      trace.diagnostics = diagnostics.slice();
      /* §11 — the diagnostics ride on the response for the trace and for debug mode; the browser never draws
         them. A `presentation` nobody set stays null, which is how §5's invariant holds by default. */
      extra = { diagnostics, presentation: null, ...extra };
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
          return this.finishDirect({ body, actor, request, trace, notes, note, diag, diagnostics, facts, objects: [o.object!], outcomes: [o], def: built.def, path: 'drill', done, onDelta: input.onDelta, t0 });
        }
        /* the drill could not be composed — say nothing about it and let the model have the turn */
        trace.strategyReason = 'the offer resolved to nothing Korvyn could state on its own';
      }
    }

    /* ---- 2. the context, built ONCE ------------------------------------------------------------ */
    const tools = toolDefinitions(actor);
    trace.toolsExposed = tools.length;
    /**
     * §5 — THE SEMANTIC NEIGHBOURHOOD IS NO LONGER BUILT ON EVERY TURN.
     *
     * It seeded up to 24 objects and 40 relations from the FOCUS and the references in hand, so an ordinary
     * "hello" arrived carrying a map of whatever was last looked at. That is the same stickiness the state
     * block caused, in a larger and more expensive form, and for a future agent it would be paid once per step.
     *
     * The graph is untouched and still answers `resolveFinancialObject`, `resolveFinancialConcept` and the
     * candidate resolution. What stopped is pushing it at the model unasked.
     */
    trace.contextBuilds = 1;
    const state = stateForModel(body.state);
    trace.activeStateRefs = {
      period: body.state.period, scope: body.state.scope, object: body.state.activeObject?.id ?? null,
      analysisId: body.state.activeAnalysisId, populationId: body.state.activePopulationId,
    };
    /* The four facts a tool call cannot be correct without — period, scope, basis, currency — and nothing about
       the conversation. Still DATA, in the same fenced block every other Sloane prompt uses, so a memo or a
       vendor name inside it can never read as an instruction. */
    const opening = `${dataBlock({ book: state })}\n\n${request}`;

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
    /* §5/§7 — nothing is visible unless this is set. It is set in exactly one place: the `show` branch below. */
    let presentation: Presentation | null = null;
    /**
     * §7 — A PRESENTATION ASKED FOR TOO EARLY IS STILL A PRESENTATION THAT WAS ASKED FOR.
     *
     * A model that has understood "show me all of them" emits the governed read AND `show` in the same step.
     * The read has to run first — `show` may reference facts that do not exist yet — so the tool call is handed
     * back unrun. It was then DISCARDED, and the model, having already said what it wanted, answered in prose:
     * measured live, the escalation never fired even though the model had asked for it in round 0.
     *
     * The intent is kept instead. If the model asks again after the reads, that wins; if it does not, this is
     * still its own stated intent from this same turn, and honouring it is not a guess.
     */
    type ShowInput = { kind?: string; lead?: string; rows?: string[] | string; of?: string };
    let deferredShow: ShowInput | null = null;

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
            /**
             * PHASE C1 — A WHOLE REFERENCE KORVYN CANNOT RESOLVE IS ALSO NOT SHOWN.
             *
             * The rule above holds a reference that has not finished ARRIVING. A reference that has arrived
             * whole but names a fact not yet in the registry — the model writes it before the read that
             * produces it has been promoted — resolves to nothing and was streamed verbatim: observed live as
             * "Revenue slipped to {{FACT:f_EeCrM7fdHJj9}} from …" on a person's screen, which is the one thing
             * Phase 2 §26 forbids absolutely.
             *
             * Holding at the first unresolved reference can only ever DELAY text, never lose it: the fact
             * registers later in the same turn and the next delta continues from there, and the final answer
             * is rendered whole regardless. Machinery must never be legible to a reader.
             */
            let shown = renderFacts(text, facts).text;
            const bad = shown.indexOf('{{FACT:');
            if (bad >= 0) shown = shown.slice(0, bad);
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

      /**
       * §3 — `getCurrentContext` is the one control tool that does NOT end the turn. It answers a question the
       * model asked so it can go on and do the work, so it is served like a tool result and the loop continues.
       */
      const ctxAsk = uses.find((u) => u.name === 'getCurrentContext');
      if (ctxAsk && uses.every((u) => u.name === 'getCurrentContext')) {
        trace.toolCalls += 1;
        trace.tools.push({ tool: 'getCurrentContext', status: 'COMPLETED', latencyMs: 0, error: null });
        messages.push({ role: 'assistant', content: res.value.content });
        messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: ctxAsk.id, content: JSON.stringify(contextOnDemand(body.state)) }] });
        continue;
      }
      /* a control tool ends the turn: the product does the thing, and no further reasoning call is spent */
      const found = uses.find((u) => isControlTool(u.name) && u.name !== 'getCurrentContext');
      /* §22 — ANSWERING IN THE SAME BREATH AS READING IS ANSWERING BEFORE THE FACTS EXIST. A model that emits a
         governed read and an ANSWER together has written references to facts it has not been given yet; taking
         the answer here would publish an answer with nothing behind it. The reads run, the answering tool is
         handed back unrun, and the model answers on the call it was always going to spend. */
      const answering = !!found && (found.name === 'show' || found.name === 'show_list' || found.name === 'respond');
      const early = answering && uses.some((u) => !isControlTool(u.name));
      /* keep what it asked to show, so the read that had to come first cannot cost the presentation */
      if (early && found && (found.name === 'show' || found.name === 'show_list')) {
        deferredShow = (found.input ?? {}) as ShowInput;
      }
      const ctl = early ? undefined : found;
      if (ctl) {
        const arg = (v: unknown, k: string) => (v && typeof v === 'object' ? String((v as Record<string, unknown>)[k] ?? '') : '');
        const opt = {
          hasGovernedRead: outcomes.some((o) => o.status === 'COMPLETED' && o.facts.length > 0),
          objectIds: objects.map((o) => o.id),
        };
        if (ctl.name === 'show' || ctl.name === 'show_list') {
          /**
           * §7 — THE PRESENTATION DECISION, AND THE MODEL'S OWN TEXT IS STILL THE ANSWER. It is emitted beside
           * the tool call on the same response, so there is no extra call and no formatting pass.
           *
           * KORVYN VALIDATES WHAT THE MODEL ASKED FOR. A table of an object this turn did not read cannot be
           * shown — there is nothing to show — so it degrades to no presentation rather than to a guess.
           */
          const raw = { ...(deferredShow ?? {}), ...((ctl.input ?? {}) as Record<string, unknown>) } as { kind?: string; lead?: string; rows?: string[] | string; of?: string };
          deferredShow = null;
          const rows = (Array.isArray(raw.rows) ? raw.rows.map(String) : String(raw.rows ?? '').split('|')).map((r) => r.trim()).filter(Boolean);
          let prose = res.value.text.trim();
          const wantsTable = String(raw.kind ?? (ctl.name === 'show_list' ? 'list' : '')).toLowerCase().startsWith('tab');
          /**
           * §6 — A TURN ALWAYS SAYS SOMETHING. A model that has decided the table IS the answer emits `show`
           * and no text at all, and the person then gets a table under a blank reply (observed live). The
           * presentation is SUPPORTING by contract, so Korvyn writes the supported sentence from the governed
           * result — the same composer, and the same rule as everywhere else: it composes only when the model
           * left nothing publishable.
           */
          if (!prose) {
            const o = outcomes.filter((x) => x.status === 'COMPLETED' && x.object && x.facts.length).at(-1);
            const built = o ? composeDirect(o.object!, o.facts, { actor, subject: o.ctx.subject, dimension: o.ctx.dimension, measure: o.ctx.measure, note: fresh(o.ctx.note ?? o.observation.note), nextActions: [] }) : null;
            if (built) { prose = renderResponse(built.def, facts).text; diag('the model showed without saying anything; Korvyn composed the sentence'); }
          }
          response = rows.length
            ? withList(fromProse(prose, facts, opt), raw.lead ?? null, rows, facts)
            : fromProse(prose, facts, opt);
          rendered = renderResponse(response, facts);
          answer = rendered.text;
          if (wantsTable) {
            const wanted = String(raw.of ?? '').trim();
            const obj = objects.find((o) => o.id === wanted) ?? (objects.length === 1 ? objects[0] : undefined);
            if (obj && obj.table && obj.table.rows.length) {
              presentation = { kind: 'TABLE', objectId: obj.id, title: obj.title, ...(raw.lead ? { lead: raw.lead.trim() } : {}) };
            } else {
              diag(`a table was asked for and ${wanted ? `object ${wanted} was not read this turn` : 'no single governed result was available'}`);
            }
          }
          /* a LIST is NOT set here: its rows carry fact references, and only `publish` returns them resolved */
        } else if (ctl.name === 'respond') {
          /* RETIRED, and still answered: a stale session or an older prompt may emit one. It builds exactly as
             it did, so nothing stored mid-conversation is lost. */
          response = buildResponse((ctl.input ?? {}) as RespondInput, facts, opt);
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
        diag('step limit reached for this turn');
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
        if (u.name === 'getCurrentContext') return { use: u, text: JSON.stringify(contextOnDemand(body.state)) };
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
        /* a refusal IS for the person: it changes what they can expect from the answer. The wording is theirs,
           not Korvyn's error string. */
        if (o.status === 'REFUSED' && o.error) note(o.error);
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
          return this.finishDirect({ body, actor, request, trace, notes, note, diag, diagnostics, facts, objects, outcomes, def: built.def, path: 'analytical', done, onDelta: input.onDelta, t0 });
        }
        trace.strategyReason = 'no composer fits this governed result';
      } else {
        trace.strategyReason = elig.reason;
      }
      trace.strategy = 'GROUNDED_REASONING';

      /* §4 — the reminder asks for an ANSWER, not for a shape. What it has to carry is the one thing a model
         will not do unprompted after a tool result: write the figure as its reference rather than reading the
         number out of the JSON it just saw. */
      messages.push({ role: 'user', content: [
        ...results.map((r) => ({ type: 'tool_result', tool_use_id: r.use.id, content: r.text })),
        /* §7 — THE LAST INSTRUCTION BEFORE THE ANSWER DECIDES THE ANSWER'S SHAPE. It used to say only "answer
           briefly", so at the one moment the model chose between prose and a presentation, the presentation was
           not in front of it — measured live, `show` never fired even on "show me all of them". Both options are
           stated here, in the same words the contract uses. */
        { type: 'text', text: 'Now answer them, briefly and in your own words. Write every company figure as its {{FACT:id}} reference. If they asked to SEE something rather than asking a question, call show as well — kind=table with the objectId above — instead of listing rows in your sentence.' },
      ] });
    }

    /**
     * §7 — the model asked to show something, the read it needed ran, and it then answered in prose without
     * asking again. Its own request from this turn stands: a TABLE of an object that now exists is exactly what
     * it wanted, and Korvyn validates that the object was read before it honours it.
     */
    /* §7 — AND ONLY WHEN THE MODEL ADDED NOTHING AFTER THE READ. A request made in the same step as the read is
       provisional: it was made before the model had seen anything. If it then wrote a real answer and chose not
       to ask again, it chose prose, and honouring the earlier request would be Korvyn guessing — measured live,
       that put a table under "can you show me high level capex analysis", which §19 says wants an answer. The
       case this still covers is the model that says nothing more, where its only stated intent is the one it
       already gave. */
    if (!presentation && deferredShow && !answer.trim()) {
      const raw: ShowInput = deferredShow;
      const rows = (Array.isArray(raw.rows) ? raw.rows.map(String) : String(raw.rows ?? '').split('|')).map((r) => r.trim()).filter(Boolean);
      const wantsTable = String(raw.kind ?? '').toLowerCase().startsWith('tab');
      if (wantsTable) {
        const wanted = String(raw.of ?? '').trim();
        const obj = objects.find((o) => o.id === wanted) ?? (objects.length === 1 ? objects[0] : undefined);
        if (obj?.table?.rows.length) {
          presentation = { kind: 'TABLE', objectId: obj.id, title: obj.title, ...(raw.lead ? { lead: raw.lead.trim() } : {}) };
          diag('presentation honoured from the request made before the read ran');
        }
      }
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
      /**
       * §6 — A TURN THAT READ SOMETHING NEVER RENDERS BLANK.
       *
       * Measured live: a model can end a turn with no text and no tool at all, and the person then got an empty
       * reply under their own question with a governed object sitting unused on the response. Korvyn composes
       * the sentence from what it read — the same last-resort composer used everywhere else — so the floor is
       * an answer, not a blank.
       */
      const o0 = outcomes.filter((x) => x.status === 'COMPLETED' && x.object && x.facts.length).at(-1);
      const built0 = o0 ? composeDirect(o0.object!, o0.facts, { actor, subject: o0.ctx.subject, dimension: o0.ctx.dimension, measure: o0.ctx.measure, note: fresh(o0.ctx.note ?? o0.observation.note), nextActions: [] }) : null;
      if (built0) {
        diag('the model returned nothing; Korvyn composed the governed result');
        trace.directShape = built0.shape;
        return this.finishDirect({ body, actor, request, trace, notes, note, diag, diagnostics, facts, objects, outcomes, def: built0.def, path: 'analytical', done, onDelta: undefined, t0 });
      }
      const failed = trace.calls.at(-1);
      if (failed?.error) { diag(failed.error); note('Sloane could not finish that one — try asking again.'); }
      else note('Sloane could not put an answer together for that — try asking it another way.');
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
      if (rendered.unresolved.length) diag(`unresolved fact references: ${rendered.unresolved.join(', ')}`);
      if (rendered.bare.length) diag(`figures typed without a governed reference: ${rendered.bare.join(', ')}`);
      response.violations.filter((v) => v.startsWith('figure stated with no governed read')).forEach((v) => diag(v));
    } else {
      /**
       * PHASE 3 §4 — THE MODEL WROTE THE ANSWER, AND THAT IS THE ANSWER.
       *
       * Phase 2 treated this as an escape hatch and Phase 2.5 closed it by DISCARDING the words and composing a
       * sentence from the governed result instead. Measured on the brief's own close conversation, that replaced
       * a reviewer's walkthrough of the largest blocker with "…moved by $0.26M, made up of 5 entitys, the largest
       * being …" — a correct figure answering a question nobody asked. The hatch was the road, so it is the road.
       *
       * THREE BRANCHES BECAME ONE, and nothing about the guarantees moved: `fromProse` builds the same
       * `ResponseDefinition` a tool call would have built, so the references resolve, an unresolvable sentence is
       * withheld, an unsupported causal claim is typed as inference, two populations compared in one claim are
       * still called out, and the offers are still read from the cited facts.
       */
      response = fromProse(answer, facts, {
        hasGovernedRead: outcomes.some((o) => o.status === 'COMPLETED' && o.facts.length > 0),
        objectIds: objects.map((o) => o.id),
      });
      rendered = renderResponse(response, facts);

      /**
       * §39 — KORVYN COMPOSES ONLY WHEN THE MODEL LEFT NOTHING PUBLISHABLE, which is the whole difference
       * between this and Phase 2.5.
       *
       * Phase 2.5 composed over the model's words on EVERY governed prose turn, and that is what replaced a
       * reviewer's walkthrough with a one-line breakdown of something else. Now the sentences the model wrote
       * are the answer; only a sentence whose figure Korvyn can find nowhere is withheld, and composition is
       * what happens when withholding leaves an empty reply rather than what happens instead of publishing.
       */
      if (!rendered.text.trim()) {
        const o = outcomes.filter((x) => x.status === 'COMPLETED' && x.object && x.facts.length).at(-1);
        const built = o ? composeDirect(o.object!, o.facts, { actor, subject: o.ctx.subject, dimension: o.ctx.dimension, measure: o.ctx.measure, note: fresh(o.ctx.note ?? o.observation.note), nextActions: [] }) : null;
        if (built) {
          trace.responseViolations = [...trace.responseViolations, ...response.violations,
            'nothing the model wrote could be published; Korvyn composed the governed result'];
          trace.directShape = built.shape;
          trace.ungroundedFigures = response.withheldFigures;
          if (response.withheldFigures.length) diag(`figures withheld with no governed reference: ${response.withheldFigures.join(', ')}`);
          return this.finishDirect({ body, actor, request, trace, notes, note, diag, diagnostics, facts, objects, outcomes, def: built.def, path: 'analytical', done, onDelta: undefined, t0 });
        }
      }

      answer = rendered.text;
      trace.responseType = response.responseType;
      trace.responseViolations = [...trace.responseViolations, ...response.violations];
      trace.factRefs = response.factRefs.length;
      trace.unresolvedRefs = rendered.unresolved;
      trace.ungroundedFigures = rendered.bare;
      if (rendered.typed.length) trace.responseViolations = [...trace.responseViolations, `figures typed rather than referenced: ${rendered.typed.join(', ')}`];
      /* §11/§13 — the sentence is withheld and the finding is recorded. The person reads an answer that does
         not contain the unsupported claim, which is what "answer naturally" means; they do not read a report
         on Korvyn's own validation. */
      if (rendered.unresolved.length) diag(`unresolved fact references: ${rendered.unresolved.join(', ')}`);
      if (response.withheldFigures.length) {
        trace.ungroundedFigures = [...new Set([...trace.ungroundedFigures, ...response.withheldFigures])];
        diag(`figures withheld with no governed reference: ${response.withheldFigures.join(', ')}`);
      }
      if (rendered.bare.length) diag(`figures typed without a governed reference: ${rendered.bare.join(', ')}`);
    }

    const path: V2Path = objects.length ? 'analytical' : 'conversation';
    /* §21/§24 — the sections travel as separate narrative entries so the renderer can draw a quiet label above
       each; a DIRECT answer produces exactly one entry with no label, which is what §23 asks for. §19 — the
       offers Korvyn is about to make are stored with the facts they drill from, whichever path wrote them. */
    const published = this.publish(body, actor, request, path, objects, outcomes, answer, facts, response);
    const narrative = published.narrative;
    /* a TABLE the model asked for wins; otherwise the resolved rows ARE the list */
    if (!presentation && published.rows.length) presentation = { kind: 'LIST', rows: published.rows };

    return done('ANSWER', path, objects.length
      ? { notes, diagnostics, presentation, objects, narrative, ...(rendered?.nextActions.length ? { suggestions: rendered.nextActions } : {}) }
      : { notes, diagnostics, presentation, objects: [], narrative: [], reply: answer, ...(rendered?.nextActions.length ? { suggestions: rendered.nextActions } : {}) });
  }
}

/**
 * PHASE 3 §45 — WHAT THIS PHASE DELETED, NAMED SO IT IS NOT REBUILT.
 *
 * `governedProse`, `classify`, `figureKey` and `ungrounded` were the machinery of the prose ESCAPE HATCH: a
 * measured, string-matching search for a figure the model might have invented, plus the decision about whether
 * to throw its words away and compose over them. With prose as the answer channel there is no hatch and no
 * second check — `fromProse` runs the same structural validation every other answer gets, and a figure with no
 * governed reference is found by the registry rather than by re-reading the tool JSON as a corpus.
 */
