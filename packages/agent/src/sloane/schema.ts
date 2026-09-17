/**
 * The three structured contracts between Sloane's reasoning service and Korvyn, as JSON Schema
 * (sent to the model as the output format) and as strict hand-written validators (applied to
 * whatever comes back). The model's output is never trusted because a schema was requested:
 * every response is re-validated here and again by Korvyn in the browser before anything runs.
 */

export const OBJECT_TYPES = [
  'FINANCIAL_STATEMENT', 'INCOME_STATEMENT', 'BALANCE_SHEET', 'TRIAL_BALANCE', 'ACCOUNT', 'ACCOUNT_GROUP',
  'GOVERNED_LEDGER', 'JOURNAL', 'VENDOR', 'PROJECT', 'ENTITY', 'DEPARTMENT', 'COST_CENTER', 'RECONCILIATION',
  'FLUX', 'CLOSE', 'REPORT', 'AUDIT_POPULATION', 'EVIDENCE', 'INVOICE', 'SUPPORT_PACKAGE', 'EXCEL_ARTIFACT',
] as const;
export const OPERATIONS = ['VIEW', 'COMPARE_PERIODS', 'BREAKDOWN', 'EXPLAIN', 'DRILL', 'PROVE', 'BUILD', 'ACT', 'FIND', 'NAVIGATE'] as const;
export const INTENTS = ['UNDERSTAND', 'FIND', 'PROVE', 'BUILD', 'ACT', 'NAVIGATE', 'CORRECTION', 'REVIEW'] as const;
export const CONTINUITY = ['CONTINUATION', 'NEW_OBJECT', 'NEW_PERIOD', 'NEW_SCOPE', 'NEW_INVESTIGATION', 'CORRECTION'] as const;
export const DIMENSIONS = ['project', 'vendor', 'entity', 'dept', 'costCenter', 'account'] as const;
export const CLARIFY_FIELDS = ['scope', 'period', 'object', 'entity'] as const;
export const OUTPUT_PREFS = ['MONTHLY_COLUMNS', 'YEAR_TO_DATE', 'SINGLE_PERIOD'] as const;
export const COMPARISON_BASIS = ['PRIOR_PERIOD', 'PRIOR_YEAR'] as const;
export const ARG_TYPES = ['string', 'number', 'boolean', 'ref', 'null'] as const;

/* NULLABILITY IS ALWAYS anyOf WITH A NULL BRANCH, never a type array. Anthropic structured outputs rejects
   `type: ["string","null"]` combined with `enum` ("Enum value … does not match declared type"), even when the
   enum lists null; the live API failed on requestedObject.type for exactly that reason. One nullable shape for
   every field keeps a scalar and an enum from drifting into two conventions. */
const nullable = (branch: Record<string, unknown>) => ({ anyOf: [branch, { type: 'null' }] });
const nul = (t: string) => nullable({ type: t });
const strEnum = (vals: readonly string[], isNullable = false) => {
  const branch = { type: 'string', enum: [...vals] };
  return isNullable ? nullable(branch) : branch;
};
const obj = (properties: Record<string, unknown>) => ({
  type: 'object', additionalProperties: false, properties, required: Object.keys(properties),
});

export const INTERPRETATION_SCHEMA = obj({
  intent: strEnum(INTENTS),
  requestedObject: obj({ type: strEnum(OBJECT_TYPES, true), id: nul('string'), name: nul('string') }),
  operation: strEnum(OPERATIONS),
  period: nul('string'),
  periodRange: nullable(obj({ start: { type: 'string' }, end: { type: 'string' } })),
  comparisonPeriod: nul('string'),
  comparisonBasis: strEnum(COMPARISON_BASIS, true),
  scope: nullable(obj({ name: { type: 'string' }, candidateId: nul('string') })),
  dimensions: { type: 'array', items: strEnum(DIMENSIONS) },
  filters: { type: 'array', items: obj({ dimension: strEnum(DIMENSIONS), value: { type: 'string' }, candidateId: nul('string') }) },
  minAbsAmount: nul('number'),
  topN: nul('integer'),
  outputPreference: strEnum(OUTPUT_PREFS, true),
  continuity: strEnum(CONTINUITY),
  needsClarification: { type: 'boolean' },
  clarificationFields: { type: 'array', items: strEnum(CLARIFY_FIELDS) },
  multiStep: { type: 'boolean' },
  confidence: { type: 'number' },
});

/** The plan schema is built per request: `tool` is an enum of the tools Korvyn allowlisted for THIS request, so
 *  the output format itself refuses an invented tool (Korvyn still re-validates). */
export const planSchema = (toolIds: readonly string[]) => obj({
  rationale: { type: 'string' },
  steps: {
    type: 'array',
    items: obj({
      tool: toolIds.length ? { type: 'string', enum: [...toolIds] } : { type: 'string' },
      purpose: { type: 'string' },
      dependsOn: { type: 'array', items: { type: 'integer' } },
      args: { type: 'array', items: obj({ name: { type: 'string' }, value: nul('string'), valueType: strEnum(ARG_TYPES) }) },
    }),
  },
});
export const PLAN_SCHEMA = planSchema([]);

export const NARRATIVE_SCHEMA = obj({
  sentences: {
    type: 'array',
    items: obj({ text: { type: 'string' }, objectIds: { type: 'array', items: { type: 'string' } }, factKeys: { type: 'array', items: { type: 'string' } } }),
  },
});

/**
 * Structural compatibility with Anthropic structured outputs, checked before anything is sent. Returns every
 * problem found (empty = compatible). Rules enforced, each learned from the live API or its documentation:
 *   - a node never combines a `type` array with `enum` (use anyOf with a null branch);
 *   - every object sets additionalProperties:false and requires every property it declares;
 *   - enums are non-empty and hold only values of the declared type;
 *   - no keyword outside the supported subset (numeric/string length constraints are rejected upstream).
 */
const SUPPORTED_KEYS = new Set(['type', 'enum', 'const', 'anyOf', 'properties', 'required', 'additionalProperties', 'items', 'description']);
export function structuredOutputProblems(schema: unknown, at = '$'): string[] {
  const out: string[] = [];
  const walk = (n: unknown, p: string): void => {
    if (!n || typeof n !== 'object' || Array.isArray(n)) { out.push(`${p}: schema node must be an object`); return; }
    const o = n as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!SUPPORTED_KEYS.has(k)) out.push(`${p}: unsupported keyword "${k}"`);
    if (Array.isArray(o['type']) && 'enum' in o) out.push(`${p}: type array combined with enum`);
    if ('enum' in o) {
      const e = o['enum'];
      if (!Array.isArray(e) || !e.length) out.push(`${p}: enum must be a non-empty array`);
      else if (typeof o['type'] === 'string') {
        const t = o['type'];
        e.forEach((v, i) => { const ok = t === 'string' ? typeof v === 'string' : t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' : t === 'boolean' ? typeof v === 'boolean' : false;
          if (!ok) out.push(`${p}.enum[${i}]: value does not match type ${t}`); });
      }
    }
    if (Array.isArray(o['anyOf'])) (o['anyOf'] as unknown[]).forEach((b, i) => walk(b, `${p}.anyOf[${i}]`));
    else if (o['type'] === undefined && !('enum' in o) && !('const' in o)) out.push(`${p}: node declares no type`);
    if (o['type'] === 'object') {
      const props = (o['properties'] ?? {}) as Record<string, unknown>;
      if (o['additionalProperties'] !== false) out.push(`${p}: object must set additionalProperties:false`);
      const req = Array.isArray(o['required']) ? (o['required'] as string[]) : [];
      for (const k of Object.keys(props)) { if (!req.includes(k)) out.push(`${p}.${k}: not listed in required`); walk(props[k], `${p}.${k}`); }
      for (const k of req) if (!(k in props)) out.push(`${p}.required: "${k}" is not a declared property`);
    }
    if (o['type'] === 'array') { if (o['items'] === undefined) out.push(`${p}: array without items`); else walk(o['items'], `${p}[]`); }
  };
  walk(schema, at);
  return out;
}

/* ---------------------------------------------------------------------------------------------- */

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };
type Json = unknown;

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v);

class V {
  errors: string[] = [];
  keys(v: Json, at: string, allowed: string[]): v is Record<string, Json> {
    if (!isObj(v)) { this.errors.push(`${at}: expected object`); return false; }
    for (const k of Object.keys(v)) if (!allowed.includes(k)) this.errors.push(`${at}.${k}: unexpected field`);
    for (const k of allowed) if (!(k in v)) this.errors.push(`${at}.${k}: missing`);
    return true;
  }
  enm(v: Json, at: string, vals: readonly string[], nullable = false): void {
    if (nullable && v === null) return;
    if (typeof v !== 'string' || !vals.includes(v)) this.errors.push(`${at}: not one of ${vals.join('|')}`);
  }
  str(v: Json, at: string, nullable = false, max = 400): void {
    if (nullable && v === null) return;
    if (typeof v !== 'string') this.errors.push(`${at}: expected string`);
    else if (v.length > max) this.errors.push(`${at}: longer than ${max}`);
  }
  per(v: Json, at: string, nullable = true): void {
    if (nullable && v === null) return;
    if (typeof v !== 'string' || !PERIOD.test(v)) this.errors.push(`${at}: expected YYYY-MM`);
  }
  arr(v: Json, at: string, max: number): v is Json[] {
    if (!Array.isArray(v)) { this.errors.push(`${at}: expected array`); return false; }
    if (v.length > max) this.errors.push(`${at}: more than ${max} items`);
    return true;
  }
}

export interface Interpretation {
  intent: (typeof INTENTS)[number];
  requestedObject: { type: (typeof OBJECT_TYPES)[number] | null; id: string | null; name: string | null };
  operation: (typeof OPERATIONS)[number];
  period: string | null;
  periodRange: { start: string; end: string } | null;
  comparisonPeriod: string | null;
  comparisonBasis: (typeof COMPARISON_BASIS)[number] | null;
  scope: { name: string; candidateId: string | null } | null;
  dimensions: (typeof DIMENSIONS)[number][];
  filters: { dimension: (typeof DIMENSIONS)[number]; value: string; candidateId: string | null }[];
  minAbsAmount: number | null;
  topN: number | null;
  outputPreference: (typeof OUTPUT_PREFS)[number] | null;
  continuity: (typeof CONTINUITY)[number];
  needsClarification: boolean;
  clarificationFields: (typeof CLARIFY_FIELDS)[number][];
  multiStep: boolean;
  confidence: number;
}

export function validateInterpretation(v: Json): Result<Interpretation> {
  const c = new V();
  const K = Object.keys(INTERPRETATION_SCHEMA.properties);
  if (!c.keys(v, 'interpretation', K)) return { ok: false, errors: c.errors };
  c.enm(v['intent'], 'intent', INTENTS);
  if (c.keys(v['requestedObject'], 'requestedObject', ['type', 'id', 'name'])) {
    const o = v['requestedObject'] as Record<string, Json>;
    c.enm(o['type'], 'requestedObject.type', OBJECT_TYPES, true);
    c.str(o['id'], 'requestedObject.id', true, 120);
    c.str(o['name'], 'requestedObject.name', true, 160);
  }
  c.enm(v['operation'], 'operation', OPERATIONS);
  c.per(v['period'], 'period');
  if (v['periodRange'] !== null && c.keys(v['periodRange'], 'periodRange', ['start', 'end'])) {
    const r = v['periodRange'] as Record<string, Json>;
    c.per(r['start'], 'periodRange.start', false); c.per(r['end'], 'periodRange.end', false);
    if (typeof r['start'] === 'string' && typeof r['end'] === 'string' && r['start'] > r['end']) c.errors.push('periodRange: start after end');
  }
  c.per(v['comparisonPeriod'], 'comparisonPeriod');
  c.enm(v['comparisonBasis'], 'comparisonBasis', COMPARISON_BASIS, true);
  if (v['scope'] !== null && c.keys(v['scope'], 'scope', ['name', 'candidateId'])) {
    const s = v['scope'] as Record<string, Json>;
    c.str(s['name'], 'scope.name', false, 160); c.str(s['candidateId'], 'scope.candidateId', true, 120);
  }
  if (c.arr(v['dimensions'], 'dimensions', 3)) (v['dimensions'] as Json[]).forEach((d, i) => c.enm(d, `dimensions[${i}]`, DIMENSIONS));
  if (c.arr(v['filters'], 'filters', 6)) (v['filters'] as Json[]).forEach((f, i) => {
    if (c.keys(f, `filters[${i}]`, ['dimension', 'value', 'candidateId'])) {
      const F = f as Record<string, Json>;
      c.enm(F['dimension'], `filters[${i}].dimension`, DIMENSIONS);
      c.str(F['value'], `filters[${i}].value`, false, 160);
      c.str(F['candidateId'], `filters[${i}].candidateId`, true, 120);
    }
  });
  const m = v['minAbsAmount'];
  if (m !== null && (typeof m !== 'number' || !Number.isFinite(m) || m < 0)) c.errors.push('minAbsAmount: expected non-negative number or null');
  const t = v['topN'];
  if (t !== null && (!Number.isInteger(t) || (t as number) < 1 || (t as number) > 10)) c.errors.push('topN: expected integer 1..10 or null');
  c.enm(v['outputPreference'], 'outputPreference', OUTPUT_PREFS, true);
  c.enm(v['continuity'], 'continuity', CONTINUITY);
  if (typeof v['needsClarification'] !== 'boolean') c.errors.push('needsClarification: expected boolean');
  if (c.arr(v['clarificationFields'], 'clarificationFields', 4)) (v['clarificationFields'] as Json[]).forEach((d, i) => c.enm(d, `clarificationFields[${i}]`, CLARIFY_FIELDS));
  if (typeof v['multiStep'] !== 'boolean') c.errors.push('multiStep: expected boolean');
  const cf = v['confidence'];
  if (typeof cf !== 'number' || cf < 0 || cf > 1) c.errors.push('confidence: expected 0..1');
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: v as unknown as Interpretation };
}

export interface PlanStep { tool: string; purpose: string; dependsOn: number[]; args: { name: string; value: string | null; valueType: (typeof ARG_TYPES)[number] }[] }
export interface Plan { rationale: string; steps: PlanStep[] }

/** Structural validation only. Whether a tool is allowed, permitted and fully argued is Korvyn's call. */
export function validatePlan(v: Json, allowedTools: string[], maxSteps: number): Result<Plan> {
  const c = new V();
  if (!c.keys(v, 'plan', ['rationale', 'steps'])) return { ok: false, errors: c.errors };
  c.str(v['rationale'], 'rationale', false, 600);
  if (c.arr(v['steps'], 'steps', maxSteps)) (v['steps'] as Json[]).forEach((s, i) => {
    if (!c.keys(s, `steps[${i}]`, ['tool', 'purpose', 'dependsOn', 'args'])) return;
    const S = s as Record<string, Json>;
    if (typeof S['tool'] !== 'string' || !allowedTools.includes(S['tool'])) c.errors.push(`steps[${i}].tool: not in the allowlist`);
    c.str(S['purpose'], `steps[${i}].purpose`, false, 200);
    if (c.arr(S['dependsOn'], `steps[${i}].dependsOn`, maxSteps))
      (S['dependsOn'] as Json[]).forEach((d) => { if (!Number.isInteger(d) || (d as number) < 0 || (d as number) >= i) c.errors.push(`steps[${i}].dependsOn: must reference an earlier step`); });
    if (c.arr(S['args'], `steps[${i}].args`, 10)) (S['args'] as Json[]).forEach((a, j) => {
      if (!c.keys(a, `steps[${i}].args[${j}]`, ['name', 'value', 'valueType'])) return;
      const A = a as Record<string, Json>;
      c.str(A['name'], `steps[${i}].args[${j}].name`, false, 60);
      c.str(A['value'], `steps[${i}].args[${j}].value`, true, 200);
      c.enm(A['valueType'], `steps[${i}].args[${j}].valueType`, ARG_TYPES);
    });
  });
  if (Array.isArray(v['steps']) && !(v['steps'] as Json[]).length) c.errors.push('steps: empty plan');
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: v as unknown as Plan };
}

export interface Narrative { sentences: { text: string; objectIds: string[]; factKeys: string[] }[] }

export function validateNarrative(v: Json, objectIds: string[], factKeys: string[]): Result<Narrative> {
  const c = new V();
  if (!c.keys(v, 'narrative', ['sentences'])) return { ok: false, errors: c.errors };
  if (c.arr(v['sentences'], 'sentences', 8)) (v['sentences'] as Json[]).forEach((s, i) => {
    if (!c.keys(s, `sentences[${i}]`, ['text', 'objectIds', 'factKeys'])) return;
    const S = s as Record<string, Json>;
    c.str(S['text'], `sentences[${i}].text`, false, 400);
    if (c.arr(S['objectIds'], `sentences[${i}].objectIds`, 6)) (S['objectIds'] as Json[]).forEach((o) => { if (typeof o !== 'string' || !objectIds.includes(o)) c.errors.push(`sentences[${i}]: unknown object id`); });
    if (c.arr(S['factKeys'], `sentences[${i}].factKeys`, 8)) (S['factKeys'] as Json[]).forEach((o) => { if (typeof o !== 'string' || !factKeys.includes(o)) c.errors.push(`sentences[${i}]: unknown fact key`); });
  });
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: v as unknown as Narrative };
}
