/**
 * Sloane reasoning-service configuration. Environment only; nothing here is a secret.
 *
 *   SLOANE_LLM_PROVIDER    anthropic | mock      (default: anthropic when a key is present, else mock)
 *   SLOANE_LLM_MODEL       the DEEP model        (default: claude-opus-5) — complex planning, broad reviews
 *   SLOANE_LLM_EFFORT      DEEP effort           low|medium|high|xhigh|max (default: medium)
 *   SLOANE_LLM_FAST_MODEL  the FAST model        (default: claude-sonnet-5) — interpretation and narration
 *   SLOANE_LLM_FAST_EFFORT FAST effort           (default: low; none = not sent — automatic for Haiku, which does not take it)
 *   SLOANE_LLM_FAST_THINKING  on | off           (default: off — interpretation is short, structured work)
 *   SLOANE_LLM_NARRATE_MODEL the NARRATE model   (default: claude-haiku-4-5) — a few grounded sentences over facts Korvyn computed;
 *                          grounding rejects any number the facts do not carry, so the fastest model is the right one
 *   SLOANE_LLM_ROUTING     on | off              (default: on; off sends every call to the DEEP model, as before Phase 6)
 *   SLOANE_LLM_TIMEOUT_MS  per-call timeout      (default: 20000)
 *   SLOANE_LLM_MAX_TOKENS  per-call output cap   (default: 8000)
 *   SLOANE_MAX_PLAN_STEPS  plan length cap       (default: 8)
 *   ANTHROPIC_API_KEY      read by the SDK from the server environment — never by this file,
 *                          never logged, never sent to the browser.
 *
 * ROUTES (Phase 6). FAST reads a new request; NARRATE writes a few grounded sentences over computed facts.
 * DEEP plans what Korvyn's deterministic planner cannot: broad reviews and multi-domain requests. Most follow-ups
 * reach neither: the conversation resolver answers them from context without a model call.
 */
export type ProviderId = 'anthropic' | 'mock';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Route = 'FAST' | 'DEEP' | 'NARRATE';

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

/** effort null = not sent (a model that does not take the parameter, e.g. Haiku) */
export interface RouteConfig { model: string; effort: Effort | null; thinking: boolean }
export interface SloaneConfig {
  provider: ProviderId;
  /** the DEEP model (kept as `model` — the engine a trace names by default) */
  model: string;
  effort: Effort;
  routes: Record<Route, RouteConfig>;
  routing: boolean;
  timeoutMs: number;
  maxTokens: number;
  maxPlanSteps: number;
  credentialsPresent: boolean;
}

export function loadSloaneConfig(env: NodeJS.ProcessEnv = process.env): SloaneConfig {
  const credentialsPresent = !!(env['ANTHROPIC_API_KEY'] || env['ANTHROPIC_AUTH_TOKEN']);
  const asked = String(env['SLOANE_LLM_PROVIDER'] ?? '').toLowerCase();
  const provider: ProviderId = asked === 'mock' ? 'mock' : asked === 'anthropic' ? 'anthropic' : credentialsPresent ? 'anthropic' : 'mock';
  const eff = (v: string | undefined, d: Effort): Effort => (EFFORTS.includes(String(v) as Effort) ? (String(v) as Effort) : d);
  const model = env['SLOANE_LLM_MODEL'] || 'claude-opus-5';
  const effort = eff(env['SLOANE_LLM_EFFORT'], 'medium');
  const routing = String(env['SLOANE_LLM_ROUTING'] ?? 'on').toLowerCase() !== 'off';
  const deep: RouteConfig = { model, effort, thinking: true };
  const fast: RouteConfig = routing
    ? (() => { const fm = env['SLOANE_LLM_FAST_MODEL'] || 'claude-sonnet-5', fe = String(env['SLOANE_LLM_FAST_EFFORT'] ?? '').toLowerCase();
        return { model: fm, effort: fe === 'none' || (!fe && /haiku/.test(fm)) ? null : eff(fe, 'low'), thinking: String(env['SLOANE_LLM_FAST_THINKING'] ?? 'off').toLowerCase() === 'on' }; })()
    : deep;
  const nm = env['SLOANE_LLM_NARRATE_MODEL'] || 'claude-haiku-4-5';
  const narrate: RouteConfig = routing ? { model: nm, effort: /haiku/.test(nm) ? null : 'low', thinking: false } : deep;
  return {
    provider, model, effort, routes: { FAST: fast, DEEP: deep, NARRATE: narrate }, routing,
    timeoutMs: num(env['SLOANE_LLM_TIMEOUT_MS'], 20000),
    maxTokens: num(env['SLOANE_LLM_MAX_TOKENS'], 8000),
    maxPlanSteps: Math.min(num(env['SLOANE_MAX_PLAN_STEPS'], 8), 12),
    credentialsPresent,
  };
}
