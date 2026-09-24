/**
 * Sloane reasoning-service configuration. Environment only; nothing here is a secret.
 *
 * MODELS — no Claude model id is hard-coded on the Sloane path. Both come from packages/agent/.env:
 *   ANTHROPIC_DEFAULT_MODEL   normal conversational / general reasoning: the FAST route (the front door,
 *                             interpretation, analysis edits) and the NARRATE route (grounded sentences)
 *   ANTHROPIC_ADVANCED_MODEL  reserved for advanced / escalated reasoning: the DEEP route (multi-clause plans,
 *                             broad reviews, actions, agent planning)
 *   Legacy names still read, lower precedence: SLOANE_LLM_MODEL → advanced, SLOANE_LLM_FAST_MODEL → default.
 *   If only one is set it serves both routes, and `warnings` says so. If neither is set the Anthropic provider
 *   cannot be used: the provider falls back to mock (Korvyn's deterministic engine) and `warnings` names the gap.
 *
 *   SLOANE_LLM_PROVIDER      anthropic | mock   (default: anthropic when a credential is present, else mock)
 *   SLOANE_LLM_NARRATE_MODEL optional NARRATE override (default: ANTHROPIC_DEFAULT_MODEL)
 *   SLOANE_LLM_EFFORT        DEEP effort        low|medium|high|xhigh|max (default: medium)
 *   SLOANE_LLM_FAST_EFFORT   FAST effort        (default: low; none = not sent — automatic for Haiku, which does not take it)
 *   SLOANE_LLM_FAST_THINKING on | off           (default: off — interpretation is short, structured work)
 *   SLOANE_LLM_ROUTING       on | off           (default: on; off sends every call to the ADVANCED model)
 *   SLOANE_LLM_TIMEOUT_MS    per-call timeout   (default: 20000)
 *   SLOANE_LLM_MAX_TOKENS    per-call output cap (default: 8000)
 *   SLOANE_MAX_PLAN_STEPS    plan length cap    (default: 8)
 *   ANTHROPIC_API_KEY        loaded ONLY from packages/agent/.env (src/env.ts) and read by the SDK — never by
 *                            this file, never logged, never returned to the browser.
 *
 * ROUTES (Phase 6). FAST reads a new request; NARRATE writes a few grounded sentences over computed facts.
 * DEEP plans what Korvyn's deterministic planner cannot. Most follow-ups reach neither: the conversation resolver
 * answers them from context without a model call.
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
  /** the ADVANCED (DEEP) model — kept as `model`, the engine a trace names by default */
  model: string;
  /** ANTHROPIC_DEFAULT_MODEL — normal conversational / general reasoning (FAST, NARRATE) */
  defaultModel: string;
  /** ANTHROPIC_ADVANCED_MODEL — advanced / escalated reasoning (DEEP) */
  advancedModel: string;
  /** configuration problems worth stating at startup; never contains a credential */
  warnings: string[];
  effort: Effort;
  routes: Record<Route, RouteConfig>;
  routing: boolean;
  /** V2 §2: the new conversational core runs BESIDE the old one, behind SLOANE_RUNTIME_V2. Off is the shipped default. */
  runtimeV2: boolean;
  timeoutMs: number;
  maxTokens: number;
  maxPlanSteps: number;
  credentialsPresent: boolean;
}

export function loadSloaneConfig(env: NodeJS.ProcessEnv = process.env): SloaneConfig {
  const credentialsPresent = !!(env['ANTHROPIC_API_KEY'] || env['ANTHROPIC_AUTH_TOKEN']);
  const warnings: string[] = [];
  const asked = String(env['SLOANE_LLM_PROVIDER'] ?? '').toLowerCase();
  let provider: ProviderId = asked === 'mock' ? 'mock' : asked === 'anthropic' ? 'anthropic' : credentialsPresent ? 'anthropic' : 'mock';
  const eff = (v: string | undefined, d: Effort): Effort => (EFFORTS.includes(String(v) as Effort) ? (String(v) as Effort) : d);
  const set = (k: string) => String(env[k] ?? '').trim();
  const dm = set('ANTHROPIC_DEFAULT_MODEL') || set('SLOANE_LLM_FAST_MODEL');
  const am = set('ANTHROPIC_ADVANCED_MODEL') || set('SLOANE_LLM_MODEL');
  const defaultModel = dm || am, advancedModel = am || dm;
  if (provider === 'anthropic') {
    if (!defaultModel) { warnings.push('ANTHROPIC_DEFAULT_MODEL and ANTHROPIC_ADVANCED_MODEL are not set in packages/agent/.env — Sloane runs on the deterministic engine'); provider = 'mock'; }
    else if (!dm) warnings.push('ANTHROPIC_DEFAULT_MODEL is not set — normal reasoning uses ANTHROPIC_ADVANCED_MODEL');
    else if (!am) warnings.push('ANTHROPIC_ADVANCED_MODEL is not set — escalated reasoning uses ANTHROPIC_DEFAULT_MODEL');
    if (!credentialsPresent) warnings.push('ANTHROPIC_API_KEY is not set in packages/agent/.env');
  }
  const model = advancedModel || 'deterministic-v1';
  const effort = eff(env['SLOANE_LLM_EFFORT'], 'medium');
  const routing = String(env['SLOANE_LLM_ROUTING'] ?? 'on').toLowerCase() !== 'off';
  const noEffort = (m: string) => /haiku/i.test(m);
  const deep: RouteConfig = { model, effort, thinking: true };
  const fast: RouteConfig = routing
    ? (() => { const fm = defaultModel || model, fe = String(env['SLOANE_LLM_FAST_EFFORT'] ?? '').toLowerCase();
        return { model: fm, effort: fe === 'none' || (!fe && noEffort(fm)) ? null : eff(fe, 'low'), thinking: String(env['SLOANE_LLM_FAST_THINKING'] ?? 'off').toLowerCase() === 'on' }; })()
    : deep;
  const nm = set('SLOANE_LLM_NARRATE_MODEL') || defaultModel || model;
  const narrate: RouteConfig = routing ? { model: nm, effort: noEffort(nm) ? null : 'low', thinking: false } : deep;
  return {
    provider, model, defaultModel: defaultModel || model, advancedModel: model, warnings, effort, routes: { FAST: fast, DEEP: deep, NARRATE: narrate }, routing,
    runtimeV2: /^(1|on|true|yes)$/i.test(String(env['SLOANE_RUNTIME_V2'] ?? '').trim()),
    timeoutMs: num(env['SLOANE_LLM_TIMEOUT_MS'], 20000),
    maxTokens: num(env['SLOANE_LLM_MAX_TOKENS'], 8000),
    maxPlanSteps: Math.min(num(env['SLOANE_MAX_PLAN_STEPS'], 8), 12),
    credentialsPresent,
  };
}
