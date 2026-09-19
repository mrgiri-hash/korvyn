import Anthropic from '@anthropic-ai/sdk';
import type { Route, SloaneConfig } from './config.js';
import { ANALYSIS_EDIT_SYSTEM, CONVERSE_SYSTEM, INTERPRET_SYSTEM, NARRATE_SYSTEM, PLAN_SYSTEM, dataBlock } from './prompts.js';
import {
  INTERPRETATION_SCHEMA, NARRATIVE_SCHEMA, planSchema, structuredOutputProblems,
  validateInterpretation, validateNarrative, validatePlan,
  type Interpretation, type Narrative, type Plan, type Result, CONVERSATION_SCHEMA, type Conversation, validateConversation, ANALYSIS_EDIT_SCHEMA, validateAnalysisEdit } from './schema.js';
import type { AnalysisEdit } from './analysis/model.js';

/**
 * THE PROVIDER-NEUTRAL CONTRACT. Korvyn's orchestrator speaks only this shape; a provider is an
 * implementation detail of the server. Nothing in the browser — and nothing in the Sloane UI —
 * knows which provider or model answered.
 */
export interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens: number }
/** which route and model answered — recorded on every call in the trace, never shown to a user */
interface Answered { route?: Route; model?: string }
export type AdapterOutcome<T> =
  | ({ status: 'ok'; value: T; usage: Usage | null; latencyMs: number; requestId: string | null } & Answered)
  /** the adapter deliberately declines — Korvyn uses its deterministic engine */
  | ({ status: 'declined'; reason: string; latencyMs: number } & Answered)
  /** the provider or the output failed — Korvyn falls back and says so */
  | ({ status: 'error'; code: 'unavailable' | 'rate_limited' | 'timeout' | 'refused' | 'invalid_output' | 'auth' | 'cancelled'; detail: string; latencyMs: number; requestId: string | null } & Answered);
/** Phase 6: a call names its ROUTE (FAST for interpretation and narration, DEEP for complex planning) and may be
 *  cancelled when the user moves on before it returns */
export interface CallOptions { route?: Route; signal?: AbortSignal }

export interface InterpretInput { request: string; context: unknown; candidates: unknown; workingPeriod: string; availablePeriods: string[] }
export interface PlanInput { request: string; interpretation: Interpretation; context: unknown; tools: { id: string; description: string; requiredInputs: string[]; optionalInputs: string[]; outputs?: string }[]; maxSteps: number }
export interface ConverseInput { request: string; context: unknown }
/** Phase 8C: an edit to the governed analysis on screen (or a new one); Korvyn re-resolves and re-validates every op */
export interface AnalysisEditInput { request: string; analysis: unknown; dimensions: unknown; measures: unknown; periods: string[]; workingPeriod: string; visibleRows: unknown; vocabulary?: unknown; selectedCell?: unknown }
export interface NarrateInput { request: string; objects: { objectId: string; type: string; title: string; facts: { key: string; label: string; display: string }[] }[] }

export interface SloaneLLMAdapter {
  readonly provider: string;
  readonly model: string;
  interpret(i: InterpretInput, o?: CallOptions): Promise<AdapterOutcome<Interpretation>>;
  plan(i: PlanInput, o?: CallOptions): Promise<AdapterOutcome<Plan>>;
  narrate(i: NarrateInput, o?: CallOptions): Promise<AdapterOutcome<Narrative>>;
  /** the conversational front door: classify the turn and, when no tool is needed, answer it */
  converse(i: ConverseInput, o?: CallOptions): Promise<AdapterOutcome<Conversation>>;
  analysisEdit(i: AnalysisEditInput, o?: CallOptions): Promise<AdapterOutcome<AnalysisEdit>>;
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
}

/**
 * The first production adapter. Structured output through output_config.format, re-validated by
 * the strict validators; adaptive thinking; server-side refusal fallbacks. Credentials are resolved
 * by the SDK from the server environment and are never read, logged or forwarded here.
 */
export class AnthropicSloaneAdapter implements SloaneLLMAdapter {
  readonly provider = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly cfg: SloaneConfig) {
    this.model = cfg.model;
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
      const msg = await this.client.beta.messages.create({ ...params, fallbacks: 'default' } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, o.signal ? { signal: o.signal } : undefined);
      const requestId = (msg as unknown as { _request_id?: string | null })._request_id ?? null;
      const latencyMs = Date.now() - t0;
      if (msg.stop_reason === 'refusal') return { status: 'error', code: 'refused', detail: 'the reasoning service declined this request', latencyMs, requestId };
      if (msg.stop_reason === 'max_tokens') return { status: 'error', code: 'invalid_output', detail: 'output was truncated', latencyMs, requestId };
      const text = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return { status: 'error', code: 'invalid_output', detail: 'output was not JSON', latencyMs, requestId }; }
      const v = validate(parsed);
      if (!v.ok) return { status: 'error', code: 'invalid_output', detail: v.errors.slice(0, 6).join('; '), latencyMs, requestId };
      const u = msg.usage;
      return { status: 'ok', value: v.value, latencyMs, requestId,
        usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0 } };
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
  narrate(i: NarrateInput, o?: CallOptions) {
    const ids = i.objects.map((x) => x.objectId), keys = i.objects.flatMap((x) => x.facts.map((f) => f.key));
    return this.call(NARRATE_SYSTEM, i, NARRATIVE_SCHEMA, (v) => validateNarrative(v, ids, keys), o);
  }
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
