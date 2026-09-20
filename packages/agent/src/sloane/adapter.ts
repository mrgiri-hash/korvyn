import Anthropic from '@anthropic-ai/sdk';
import type { Route, SloaneConfig } from './config.js';
import { AGENT_STEP_SYSTEM, AGENT_SYNTH_SYSTEM, ANALYSIS_EDIT_SYSTEM, CONVERSE_SYSTEM, INTERPRET_SYSTEM, NARRATE_SYSTEM, PLAN_SYSTEM, dataBlock } from './prompts.js';
import {
  INTERPRETATION_SCHEMA, NARRATIVE_SCHEMA, planSchema, structuredOutputProblems,
  validateInterpretation, validateNarrative, validatePlan,
  type Interpretation, type Narrative, type Plan, type Result, CONVERSATION_SCHEMA, type Conversation, validateConversation, ANALYSIS_EDIT_SCHEMA, validateAnalysisEdit,
  agentStepSchema, validateAgentStep, type AgentStepOut, AGENT_SYNTH_SCHEMA, validateAgentSynth, type AgentSynthOut, AGENT_STEP_SCHEMA, normalizeAgentStep, normalizeAgentSynth } from './schema.js';
import type { AnalysisEdit } from './analysis/model.js';

/**
 * THE PROVIDER-NEUTRAL CONTRACT. Korvyn's orchestrator speaks only this shape; a provider is an
 * implementation detail of the server. Nothing in the browser — and nothing in the Sloane UI —
 * knows which provider or model answered.
 */
export interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens: number; /** 8D: tokens written to the prompt cache (billed ~1.25× input) */ cacheWriteTokens?: number }
/** which route and model answered — recorded on every call in the trace, never shown to a user */
interface Answered { route?: Route; model?: string }
export type AdapterOutcome<T> =
  | ({ status: 'ok'; value: T; usage: Usage | null; latencyMs: number; requestId: string | null } & Answered)
  /** the adapter deliberately declines — Korvyn uses its deterministic engine */
  | ({ status: 'declined'; reason: string; latencyMs: number } & Answered)
  /** the provider or the output failed — Korvyn falls back and says so */
  | ({ status: 'error'; code: 'unavailable' | 'rate_limited' | 'timeout' | 'refused' | 'invalid_output' | 'auth' | 'cancelled'; detail: string; latencyMs: number; requestId: string | null; /** tokens a call spent before its output was rejected — billed, so counted */ usage?: Usage | null } & Answered);
/** Phase 6: a call names its ROUTE (FAST for interpretation and narration, DEEP for complex planning) and may be
 *  cancelled when the user moves on before it returns */
export interface CallOptions { route?: Route; signal?: AbortSignal; /** a longer ceiling for a large reasoning step (the agent's THINK / SYNTHESIZE) */ timeoutMs?: number }

export interface InterpretInput { request: string; context: unknown; candidates: unknown; workingPeriod: string; availablePeriods: string[] }
export interface PlanInput { request: string; interpretation: Interpretation; context: unknown; tools: { id: string; description: string; requiredInputs: string[]; optionalInputs: string[]; outputs?: string }[]; maxSteps: number }
export interface ConverseInput { request: string; context: unknown }
/** Phase 8C: an edit to the governed analysis on screen (or a new one); Korvyn re-resolves and re-validates every op */
export interface AnalysisEditInput { request: string; analysis: unknown; dimensions: unknown; measures: unknown; periods: string[]; workingPeriod: string; visibleRows: unknown; vocabulary?: unknown; selectedCell?: unknown; /** 8C.2: what "it", "the second one" and "the other one" point at */ referents?: unknown; /** analyses earlier in this conversation, newest first — what "switch back" can mean */ previousAnalyses?: string[] }
/** 8D: one THINK step of an open investigation — compact context, the relevant capability subset (the tool enum) */
/**
 * V2 §12/§13: the ONE primary reasoning call. Unlike every contract above it is not structured output — the model
 * writes the reply in its own words and asks for governed tools by name, natively. Korvyn still owns every figure:
 * a tool result is the only place a number can come from, and the runtime re-authorizes each call.
 */
export interface ReasonToolUse { id: string; name: string; input: unknown }
export interface ReasonMessage {
  role: 'user' | 'assistant';
  content: string | unknown[];
  /**
   * PHASE 1.5 — mark this message as the end of a cacheable prefix. The provider allows four breakpoints; v2
   * spends two on tools+system and two HERE, on the end of the replayed transcript and on the current turn. That
   * is what stops a conversation paying full input price for everything said so far, on every round of every turn.
   */
  cache?: true;
}
export interface ReasonInput {
  system: string;
  /** the transcript, then this turn — the variation lives HERE so the tools+system prefix stays cacheable */
  messages: ReasonMessage[];
  /** the stable per-actor tool array; the last one carries the cache breakpoint */
  tools: { name: string; description: string; input_schema: object }[];
  maxTokens?: number;
  /** called with each text delta as the model writes it; streaming is used only when this is supplied (§22) */
  onText?: (delta: string) => void;
}
export interface ReasonOut {
  stopReason: string | null;
  /** what the model said, in its own words */
  text: string;
  toolUses: ReasonToolUse[];
  /** the raw assistant blocks, replayed verbatim into the next round so nothing is reconstructed */
  content: unknown[];
}

export interface AgentStepInput { context: unknown; toolIds: string[] }
export interface AgentSynthInput { context: unknown; refs: string[] }
export interface NarrateInput { request: string; objects: { objectId: string; type: string; title: string; facts: { key: string; label: string; display: string }[] }[] }

export interface SloaneLLMAdapter {
  readonly provider: string;
  readonly model: string;
  /** ANTHROPIC_DEFAULT_MODEL / ANTHROPIC_ADVANCED_MODEL, for development traces; absent on the mock */
  readonly models?: { default: string; advanced: string };
  interpret(i: InterpretInput, o?: CallOptions): Promise<AdapterOutcome<Interpretation>>;
  plan(i: PlanInput, o?: CallOptions): Promise<AdapterOutcome<Plan>>;
  narrate(i: NarrateInput, o?: CallOptions): Promise<AdapterOutcome<Narrative>>;
  /** the conversational front door: classify the turn and, when no tool is needed, answer it */
  converse(i: ConverseInput, o?: CallOptions): Promise<AdapterOutcome<Conversation>>;
  analysisEdit(i: AnalysisEditInput, o?: CallOptions): Promise<AdapterOutcome<AnalysisEdit>>;
  /** 8D: the financial agent — decide the next governed step, and synthesize what the investigation established */
  agentStep?(i: AgentStepInput, o?: CallOptions): Promise<AdapterOutcome<AgentStepOut>>;
  agentSynth?(i: AgentSynthInput, o?: CallOptions): Promise<AdapterOutcome<AgentSynthOut>>;
  /** V2: the primary reasoning call — native tool use, no structured output */
  reason?(i: ReasonInput, o?: CallOptions): Promise<AdapterOutcome<ReasonOut>>;
}

/** Offline / test / demo mode: every call declines, so Korvyn's deterministic engine answers. */
export class MockLLMAdapter implements SloaneLLMAdapter {
  readonly provider = 'mock';
  readonly model = 'deterministic-v1';
  async interpret(): Promise<AdapterOutcome<Interpretation>> { return { status: 'declined', reason: 'mock adapter', latencyMs: 0 }; }
  async plan(): Promise<AdapterOutcome<Plan>> { return { status: 'declined', reason: 'mock adapter', latencyMs: 0 }; }
  async narrate(): Promise<AdapterOutcome<Narrative>> { return { status: 'declined', reason: 'mock adapter', latencyMs: 0 }; }
  async converse(): Promise<AdapterOutcome<Conversation>> { return { status: 'declined', reason: 'mock adapter', latencyMs: 0 }; }
  async analysisEdit(): Promise<AdapterOutcome<AnalysisEdit>> { return { status: 'declined', reason: 'mock adapter', latencyMs: 0 }; }
  async reason(): Promise<AdapterOutcome<ReasonOut>> { return { status: 'declined', reason: 'mock adapter', latencyMs: 0 }; }
}

/**
 * The first production adapter. Structured output through output_config.format, re-validated by
 * the strict validators; adaptive thinking; server-side refusal fallbacks. Credentials are resolved
 * by the SDK from the server environment and are never read, logged or forwarded here.
 */
export class AnthropicSloaneAdapter implements SloaneLLMAdapter {
  readonly provider = 'anthropic';
  readonly model: string;
  readonly models: { default: string; advanced: string };
  private readonly client: Anthropic;

  constructor(private readonly cfg: SloaneConfig) {
    this.model = cfg.model;
    this.models = { default: cfg.defaultModel, advanced: cfg.advancedModel };
    this.client = new Anthropic({ timeout: cfg.timeoutMs, maxRetries: 1 });
  }

  private async call<T>(system: string, payload: unknown, schema: object, validate: (v: unknown) => Result<T>, o: CallOptions = {}): Promise<AdapterOutcome<T>> {
    const out = await this.call0(system, payload, schema, validate, o);
    return { ...out, route: o.route ?? 'DEEP', model: this.cfg.routes[o.route ?? 'DEEP'].model };
  }
  private async call0<T>(system: string, payload: unknown, schema: object, validate: (v: unknown) => Result<T>, o: CallOptions): Promise<AdapterOutcome<T>> {
    const t0 = Date.now();
    const R = this.cfg.routes[o.route ?? 'DEEP'];
    if (o.signal?.aborted) return { status: 'error', code: 'cancelled', detail: 'the request was superseded', latencyMs: 0, requestId: null };
    // a schema the provider would reject is Korvyn's bug, not a provider outage: refuse it before any call
    const problems = structuredOutputProblems(schema);
    if (problems.length) return { status: 'error', code: 'invalid_output', detail: 'output schema is not structured-output compatible: ' + problems.slice(0, 3).join('; '), latencyMs: 0, requestId: null };
    /* FAST is small structured work: no extended thinking, low effort. DEEP keeps adaptive thinking. */
    const params = {
      model: R.model,
      /* a narrative is a few sentences: a tight output cap keeps a verbose model from spending seconds on prose */
      max_tokens: system === NARRATE_SYSTEM || system === CONVERSE_SYSTEM ? Math.min(this.cfg.maxTokens, 1500) : this.cfg.maxTokens,
      system: [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user' as const, content: dataBlock(payload) }],
      thinking: R.thinking ? { type: 'adaptive' as const } : { type: 'disabled' as const },
      output_config: { ...(R.effort ? { effort: R.effort } : {}), format: { type: 'json_schema' as const, schema: schema as Record<string, unknown> } },
      betas: ['server-side-fallback-2026-07-01'],
    };
    try {
      // `fallbacks: "default"` routes a refused request to Anthropic's recommended fallback by
      // refusal category. SDK 0.114 types only the array form, hence the one widening here.
      const ro = { ...(o.signal ? { signal: o.signal } : {}), ...(o.timeoutMs ? { timeout: o.timeoutMs } : {}) };
      const msg = await this.client.beta.messages.create({ ...params, fallbacks: 'default' } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, Object.keys(ro).length ? ro : undefined);
      const requestId = (msg as unknown as { _request_id?: string | null })._request_id ?? null;
      const latencyMs = Date.now() - t0;
      const u = msg.usage;
      const usage = { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0 };
      if (msg.stop_reason === 'refusal') return { status: 'error', code: 'refused', detail: 'the reasoning service declined this request', latencyMs, requestId, usage };
      if (msg.stop_reason === 'max_tokens') return { status: 'error', code: 'invalid_output', detail: 'output was truncated', latencyMs, requestId, usage };
      const text = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return { status: 'error', code: 'invalid_output', detail: 'output was not JSON', latencyMs, requestId, usage }; }
      const v = validate(parsed);
      if (!v.ok) return { status: 'error', code: 'invalid_output', detail: v.errors.slice(0, 6).join('; '), latencyMs, requestId, usage };
      return { status: 'ok', value: v.value, latencyMs, requestId, usage };
    } catch (e) {
      const latencyMs = Date.now() - t0;
      if (o.signal?.aborted || e instanceof Anthropic.APIUserAbortError) return { status: 'error', code: 'cancelled', detail: 'the request was superseded', latencyMs, requestId: null };
      if (e instanceof Anthropic.APIConnectionTimeoutError) return { status: 'error', code: 'timeout', detail: 'the reasoning service timed out', latencyMs, requestId: null };
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { status: 'error', code: 'auth', detail: 'the reasoning service is not authorised', latencyMs, requestId: null };
      if (e instanceof Anthropic.RateLimitError) return { status: 'error', code: 'rate_limited', detail: 'the reasoning service is rate limited', latencyMs, requestId: null };
      if (e instanceof Anthropic.APIError) return { status: 'error', code: 'unavailable', detail: `the reasoning service returned ${e.status ?? 'an error'}${providerReason(e)}`, latencyMs, requestId: e.requestID ?? null };
      return { status: 'error', code: 'unavailable', detail: 'the reasoning service could not be reached', latencyMs, requestId: null };
    }
  }

  interpret(i: InterpretInput, o?: CallOptions) { return this.call(INTERPRET_SYSTEM, i, INTERPRETATION_SCHEMA, validateInterpretation, o); }
  plan(i: PlanInput, o?: CallOptions) {
    const ids = i.tools.map((t) => t.id);
    return this.call(PLAN_SYSTEM, i, planSchema(ids), (v) => validatePlan(v, ids, i.maxSteps), o);
  }
  converse(i: ConverseInput, o?: CallOptions) { return this.call(CONVERSE_SYSTEM, i, CONVERSATION_SCHEMA, validateConversation, o); }
  analysisEdit(i: AnalysisEditInput, o?: CallOptions) { return this.call(ANALYSIS_EDIT_SYSTEM, i, ANALYSIS_EDIT_SCHEMA, validateAnalysisEdit, o); }
  /* the tool enum is the step's relevant subset: the model cannot name a capability it was not shown */
  agentStep(i: AgentStepInput, o?: CallOptions) { return this.call(AGENT_STEP_SYSTEM, i.context, AGENT_STEP_SCHEMA, (v) => validateAgentStep(normalizeAgentStep(v), i.toolIds), { timeoutMs: 60000, ...o }); }
  agentSynth(i: AgentSynthInput, o?: CallOptions) { return this.call(AGENT_SYNTH_SYSTEM, i.context, AGENT_SYNTH_SCHEMA, (v) => validateAgentSynth(normalizeAgentSynth(v, i.refs), i.refs), { timeoutMs: 90000, ...o }); }
  narrate(i: NarrateInput, o?: CallOptions) {
    const ids = i.objects.map((x) => x.objectId), keys = i.objects.flatMap((x) => x.facts.map((f) => f.key));
    return this.call(NARRATE_SYSTEM, i, NARRATIVE_SCHEMA, (v) => validateNarrative(v, ids, keys), o);
  }

  /**
   * V2 §12/§13 — the one primary reasoning call.
   *
   * THE CACHE BREAKPOINTS ARE THE POINT. The provider's cached prefix is ordered tools → system → messages, so the
   * breakpoint goes on the LAST tool and on the system block: a person's tool array and system prompt are identical
   * from turn to turn, and only the transcript below them changes. Put a breakpoint anywhere in the messages and the
   * prefix is re-written every turn — the 14k-write / 0-read pattern 8D measured.
   *
   * Thinking is DISABLED here by design: an ordinary conversational turn is not a reasoning budget problem, and the
   * latency the audit measured came from calls, not from thought. Deep work escalates to the investigation runtime.
   */
  async reason(i: ReasonInput, o: CallOptions = {}): Promise<AdapterOutcome<ReasonOut>> {
    const t0 = Date.now();
    const R = this.cfg.routes[o.route ?? 'FAST'];
    const answered = { route: o.route ?? 'FAST', model: R.model };
    if (o.signal?.aborted) return { status: 'error', code: 'cancelled', detail: 'the request was superseded', latencyMs: 0, requestId: null, ...answered };
    if (!i.tools.length) return { status: 'error', code: 'invalid_output', detail: 'no governed tool is available to this actor', latencyMs: 0, requestId: null, ...answered };
    const tools = i.tools.map((t, n) => ({
      name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Beta.Messages.BetaTool['input_schema'],
      ...(n === i.tools.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));
    const params = {
      model: R.model,
      max_tokens: Math.min(this.cfg.maxTokens, i.maxTokens ?? 1600),
      system: [{ type: 'text' as const, text: i.system, cache_control: { type: 'ephemeral' as const } }],
      messages: i.messages.map(cacheable) as unknown as Anthropic.Beta.Messages.BetaMessageParam[],
      tools: tools as unknown as Anthropic.Beta.Messages.BetaToolUnion[],
      thinking: { type: 'disabled' as const },
      ...(R.effort ? { output_config: { effort: R.effort } } : {}),
      betas: ['server-side-fallback-2026-07-01'],
    };
    try {
      const ro = { ...(o.signal ? { signal: o.signal } : {}), ...(o.timeoutMs ? { timeout: o.timeoutMs } : {}) };
      const msg = i.onText
        ? await (() => {
            /* §22 — stream only when the caller wants deltas. The final message is the same shape either way, so
               nothing downstream knows which path ran; a stream that fails is reported like any other call. */
            const st = this.client.beta.messages.stream({ ...params, fallbacks: 'default' } as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming, Object.keys(ro).length ? ro : undefined);
            st.on('text', (t: string) => { try { i.onText!(t); } catch { /* a renderer that throws must not fail the turn */ } });
            return st.finalMessage();
          })()
        : await this.client.beta.messages.create({ ...params, fallbacks: 'default' } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, Object.keys(ro).length ? ro : undefined);
      const requestId = (msg as unknown as { _request_id?: string | null })._request_id ?? null;
      const latencyMs = Date.now() - t0;
      const u = msg.usage;
      const usage = { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0 };
      if (msg.stop_reason === 'refusal') return { status: 'error', code: 'refused', detail: 'the reasoning service declined this request', latencyMs, requestId, usage, ...answered };
      const text = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text').map((b) => b.text).join('').trim();
      const toolUses: ReasonToolUse[] = msg.content
        .filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input }));
      /* a truncated turn that asked for nothing and said nothing has no answer in it; anything else is usable */
      if (msg.stop_reason === 'max_tokens' && !text && !toolUses.length) return { status: 'error', code: 'invalid_output', detail: 'output was truncated', latencyMs, requestId, usage, ...answered };
      return { status: 'ok', value: { stopReason: msg.stop_reason, text, toolUses, content: msg.content as unknown[] }, latencyMs, requestId, usage, ...answered };
    } catch (e) {
      const latencyMs = Date.now() - t0;
      if (o.signal?.aborted || e instanceof Anthropic.APIUserAbortError) return { status: 'error', code: 'cancelled', detail: 'the request was superseded', latencyMs, requestId: null, ...answered };
      if (e instanceof Anthropic.APIConnectionTimeoutError) return { status: 'error', code: 'timeout', detail: 'the reasoning service timed out', latencyMs, requestId: null, ...answered };
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { status: 'error', code: 'auth', detail: 'the reasoning service is not authorised', latencyMs, requestId: null, ...answered };
      if (e instanceof Anthropic.RateLimitError) return { status: 'error', code: 'rate_limited', detail: 'the reasoning service is rate limited', latencyMs, requestId: null, ...answered };
      if (e instanceof Anthropic.APIError) return { status: 'error', code: 'unavailable', detail: `the reasoning service returned ${e.status ?? 'an error'}${providerReason(e)}`, latencyMs, requestId: e.requestID ?? null, ...answered };
      return { status: 'error', code: 'unavailable', detail: 'the reasoning service could not be reached', latencyMs, requestId: null, ...answered };
    }
  }
}

/**
 * A message the runtime marked as the end of a cacheable prefix. String content becomes a single text block so the
 * breakpoint has somewhere to sit; block content takes it on its LAST block, which is what the prefix ends with.
 */
function cacheable(m: { role: 'user' | 'assistant'; content: string | unknown[]; cache?: true }) {
  if (!m.cache) return { role: m.role, content: m.content };
  const cc = { cache_control: { type: 'ephemeral' as const } };
  if (typeof m.content === 'string') return { role: m.role, content: [{ type: 'text', text: m.content, ...cc }] };
  const blocks = [...m.content];
  const last = blocks.at(-1);
  if (last && typeof last === 'object') blocks[blocks.length - 1] = { ...(last as Record<string, unknown>), ...cc };
  return { role: m.role, content: blocks };
}

/** The provider's own error type and message, sanitised: a 400 names the rejected field, which is what makes a
 *  schema defect diagnosable from the trace. Credentials never appear in provider errors; redacted anyway. */
function providerReason(e: InstanceType<typeof Anthropic.APIError>): string {
  const body = (e as unknown as { error?: { error?: { type?: string; message?: string } } }).error?.error;
  if (!body) return '';
  const msg = String(body.message ?? '').replace(/sk-ant-[A-Za-z0-9_-]+/g, '<redacted>').replace(/\s+/g, ' ').slice(0, 240);
  return ` (${body.type ?? 'error'}: ${msg})`;
}

export function createAdapter(cfg: SloaneConfig): SloaneLLMAdapter {
  return cfg.provider === 'anthropic' ? new AnthropicSloaneAdapter(cfg) : new MockLLMAdapter();
}
