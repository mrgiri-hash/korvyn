/**
 * Sloane reasoning-service configuration. Environment only; nothing here is a secret.
 *
 *   SLOANE_LLM_PROVIDER    anthropic | mock      (default: anthropic when a key is present, else mock)
 *   SLOANE_LLM_MODEL       model id              (default: claude-opus-5)
 *   SLOANE_LLM_EFFORT      low|medium|high|xhigh|max (default: medium — interpretation is short, structured work)
 *   SLOANE_LLM_TIMEOUT_MS  per-call timeout      (default: 20000)
 *   SLOANE_LLM_MAX_TOKENS  per-call output cap   (default: 8000)
 *   SLOANE_MAX_PLAN_STEPS  plan length cap       (default: 8)
 *   ANTHROPIC_API_KEY      read by the SDK from the server environment — never by this file,
 *                          never logged, never sent to the browser.
 */
export type ProviderId = 'anthropic' | 'mock';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

export interface SloaneConfig {
  provider: ProviderId;
  model: string;
  effort: Effort;
  timeoutMs: number;
  maxTokens: number;
  maxPlanSteps: number;
  credentialsPresent: boolean;
}

export function loadSloaneConfig(env: NodeJS.ProcessEnv = process.env): SloaneConfig {
  const credentialsPresent = !!(env['ANTHROPIC_API_KEY'] || env['ANTHROPIC_AUTH_TOKEN']);
  const asked = String(env['SLOANE_LLM_PROVIDER'] ?? '').toLowerCase();
  const provider: ProviderId = asked === 'mock' ? 'mock' : asked === 'anthropic' ? 'anthropic' : credentialsPresent ? 'anthropic' : 'mock';
  const effort = String(env['SLOANE_LLM_EFFORT'] ?? 'medium') as Effort;
  return {
    provider,
    model: env['SLOANE_LLM_MODEL'] || 'claude-opus-5',
    effort: EFFORTS.includes(effort) ? effort : 'medium',
    timeoutMs: num(env['SLOANE_LLM_TIMEOUT_MS'], 20000),
    maxTokens: num(env['SLOANE_LLM_MAX_TOKENS'], 8000),
    maxPlanSteps: Math.min(num(env['SLOANE_MAX_PLAN_STEPS'], 8), 12),
    credentialsPresent,
  };
}
