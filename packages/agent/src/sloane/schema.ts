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
export const DIMENSIONS = ['project', 'vendor', 'entity', 'dept', 'costCenter', 'account', 'accountGroup', 'property', 'currency'] as const;
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

/* THE CONVERSATIONAL FRONT DOOR: every free-text turn is first classified — and, when no governed tool is needed,
   answered — here. requiresTool=false is a first-class outcome, not an error. */
export const CONVERSATION_INTENTS = ['GENERAL_CONVERSATION', 'CONTEXTUAL_CONVERSATION', 'FINANCIAL_QUESTION', 'FOLLOW_UP', 'CLARIFICATION_RESPONSE', 'ANALYSIS_REQUEST', 'ACTION_REQUEST', 'NAVIGATION_COMMAND', 'UNSUPPORTED_OPERATION', 'UNCLEAR', 'INVESTIGATION'] as const;
export interface Conversation { conversationIntent: (typeof CONVERSATION_INTENTS)[number]; requiresTool: boolean; reply: string | null; unsupportedOperation: string | null; confidence: number }
export const CONVERSATION_SCHEMA = obj({
  conversationIntent: strEnum(CONVERSATION_INTENTS),
  requiresTool: { type: 'boolean' },
  reply: nul('string'),
  unsupportedOperation: nul('string'),
  confidence: { type: 'number' },
});

/**
 * A2 §3/§4 — the OBJECTIVE CLASSIFICATION. One call per agent RUN (never per conversational turn), on the cheapest
 * route. It states what KIND of work the objective asks for; Korvyn maps that to a profile and caps it by the
 * actor's authority. The model is never told which profiles exist and can never name one.
 */
export const OUTCOME_CLASSES = ['ANALYZE', 'PREPARE_DELIVERABLE', 'PREPARE_WORKFLOW_ACTIONS'] as const;
export interface ObjectiveClass { outcome: (typeof OUTCOME_CLASSES)[number]; understanding: string; needsDeepReasoning: boolean; confidence: number }
export const OBJECTIVE_SCHEMA = obj({
  outcome: strEnum(OUTCOME_CLASSES),
  understanding: { type: 'string' },
  needsDeepReasoning: { type: 'boolean' },
  confidence: { type: 'number' },
});
export function validateObjective(v: Json): Result<ObjectiveClass> {
  const c = new V();
  if (!c.keys(v, 'objective', ['outcome', 'understanding', 'needsDeepReasoning', 'confidence'])) return { ok: false, errors: c.errors };
  c.enm(v['outcome'], 'outcome', OUTCOME_CLASSES);
  c.str(v['understanding'], 'understanding', false, 400);
  if (typeof v['needsDeepReasoning'] !== 'boolean') c.errors.push('needsDeepReasoning: expected boolean');
  if (typeof v['confidence'] !== 'number' || v['confidence'] < 0 || v['confidence'] > 1) c.errors.push('confidence: expected 0..1');
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: v as unknown as ObjectiveClass };
}

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
      c.str(A['value'], `steps[${i}].args[${j}].value`, true, 1200);
      c.enm(A['valueType'], `steps[${i}].args[${j}].valueType`, ARG_TYPES);
    });
  });
  if (Array.isArray(v['steps']) && !(v['steps'] as Json[]).length) c.errors.push('steps: empty plan');
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: v as unknown as Plan };
}

export interface Narrative { sentences: { text: string; objectIds: string[]; factKeys: string[] }[] }

export function validateConversation(v: Json): Result<Conversation> {
  const c = new V();
  if (!c.keys(v, 'conversation', ['conversationIntent', 'requiresTool', 'reply', 'unsupportedOperation', 'confidence'])) return { ok: false, errors: c.errors };
  c.enm(v['conversationIntent'], 'conversationIntent', CONVERSATION_INTENTS);
  if (typeof v['requiresTool'] !== 'boolean') c.errors.push('requiresTool: expected boolean');
  c.str(v['reply'], 'reply', true, 1200);
  c.str(v['unsupportedOperation'], 'unsupportedOperation', true, 120);
  if (typeof v['confidence'] !== 'number' || v['confidence'] < 0 || v['confidence'] > 1) c.errors.push('confidence: expected 0..1');
  if (v['requiresTool'] === false && (typeof v['reply'] !== 'string' || !String(v['reply']).trim())) c.errors.push('reply: required when no tool is needed');
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: v as unknown as Conversation };
}

export function validateNarrative(v: Json, objectIds: string[], factKeys: string[]): Result<Narrative> {
  const c = new V();
  if (!c.keys(v, 'narrative', ['sentences'])) return { ok: false, errors: c.errors };
  if (c.arr(v['sentences'], 'sentences', 8)) (v['sentences'] as Json[]).forEach((s, i) => {
    if (!c.keys(s, `sentences[${i}]`, ['text', 'objectIds', 'factKeys'])) return;
    const S = s as Record<string, Json>;
    c.str(S['text'], `sentences[${i}].text`, false, 400);
    if (c.arr(S['objectIds'], `sentences[${i}].objectIds`, 12)) (S['objectIds'] as Json[]).forEach((o) => { if (typeof o !== 'string' || !objectIds.includes(o)) c.errors.push(`sentences[${i}]: unknown object id`); });
    if (c.arr(S['factKeys'], `sentences[${i}].factKeys`, 20)) (S['factKeys'] as Json[]).forEach((o) => { if (typeof o !== 'string' || !factKeys.includes(o)) c.errors.push(`sentences[${i}]: unknown fact key`); });
  });
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: v as unknown as Narrative };
}

/* PHASE 8C: an edit to the governed analysis on screen (or a new one). The model names dimensions, members and periods
   in words and YYYY-MM; Korvyn re-resolves every name to a canonical id and re-checks every period before applying. */
import { CONTEXT_RELATIONS, EPHEMERAL_KINDS, MODEL_OPS, REFERENT_KINDS, type AnalysisEdit } from './analysis/model.js';
const OP_SCHEMA = obj({ op: strEnum(MODEL_OPS), dimensions: { type: 'array', items: { type: 'string' } }, values: { type: 'array', items: { type: 'string' } }, periods: { type: 'array', items: { type: 'string' } }, measure: nul('string'), number: nul('number'), percent: nul('number'), statement: nul('string'), rowRef: nul('string') });
export const ANALYSIS_EDIT_SCHEMA = obj({
  contextRelation: strEnum(CONTEXT_RELATIONS),
  targetReferent: obj({ kind: strEnum(REFERENT_KINDS), rank: nul('number'), rowRef: nul('string'), values: { type: 'array', items: { type: 'string' } } }),
  ops: { type: 'array', items: OP_SCHEMA },
  ephemeralOperation: obj({ kind: strEnum(EPHEMERAL_KINDS), by: strEnum(['VALUE', 'VARIANCE'], true), n: nul('number'), dir: strEnum(['DESC', 'ASC'], true) }),
  persistentMutation: { type: 'boolean' },
  requiresClarification: { type: 'boolean' },
  confidence: { type: 'number' },
  unsupported: nul('string'),
  question: nul('string'),
  options: { type: 'array', items: { type: 'string' } },
});
export function validateAnalysisEdit(v: Json): Result<AnalysisEdit> {
  const c = new V();
  if (!c.keys(v, 'edit', ['contextRelation', 'targetReferent', 'ops', 'ephemeralOperation', 'persistentMutation', 'requiresClarification', 'confidence', 'unsupported', 'question', 'options'])) return { ok: false, errors: c.errors };
  c.enm(v['contextRelation'], 'contextRelation', CONTEXT_RELATIONS);
  if (c.keys(v['targetReferent'], 'targetReferent', ['kind', 'rank', 'rowRef', 'values'])) {
    const T = v['targetReferent'] as Record<string, Json>;
    c.enm(T['kind'], 'targetReferent.kind', REFERENT_KINDS); c.str(T['rowRef'], 'targetReferent.rowRef', true, 300);
    if (T['rank'] !== null && typeof T['rank'] !== 'number') c.errors.push('targetReferent.rank: expected number');
    if (c.arr(T['values'], 'targetReferent.values', 8)) (T['values'] as Json[]).forEach((x) => c.str(x, 'targetReferent.values', false, 120));
  }
  if (c.keys(v['ephemeralOperation'], 'ephemeralOperation', ['kind', 'by', 'n', 'dir'])) {
    const E = v['ephemeralOperation'] as Record<string, Json>;
    c.enm(E['kind'], 'ephemeralOperation.kind', EPHEMERAL_KINDS);
    if (E['by'] !== null) c.enm(E['by'], 'ephemeralOperation.by', ['VALUE', 'VARIANCE']);
    if (E['dir'] !== null) c.enm(E['dir'], 'ephemeralOperation.dir', ['DESC', 'ASC']);
    if (E['n'] !== null && typeof E['n'] !== 'number') c.errors.push('ephemeralOperation.n: expected number');
  }
  for (const k of ['persistentMutation', 'requiresClarification']) if (typeof v[k] !== 'boolean') c.errors.push(`${k}: expected boolean`);
  c.str(v['question'], 'question', true, 300);
  if (c.arr(v['options'], 'options', 6)) (v['options'] as Json[]).forEach((x) => c.str(x, 'options', false, 120));
  if (c.arr(v['ops'], 'ops', 8)) (v['ops'] as Json[]).forEach((o, i) => {
    if (!c.keys(o, `ops[${i}]`, ['op', 'dimensions', 'values', 'periods', 'measure', 'number', 'percent', 'statement', 'rowRef'])) return;
    const O = o as Record<string, Json>;
    c.enm(O['op'], `ops[${i}].op`, MODEL_OPS);
    for (const k of ['dimensions', 'values', 'periods']) if (c.arr(O[k], `ops[${i}].${k}`, 12)) (O[k] as Json[]).forEach((x) => c.str(x, `ops[${i}].${k}`, false, 120));
    if (Array.isArray(O['periods'])) (O['periods'] as Json[]).forEach((p) => c.per(p, `ops[${i}].periods`, false));
    c.str(O['measure'], `ops[${i}].measure`, true, 40); c.str(O['statement'], `ops[${i}].statement`, true, 8); c.str(O['rowRef'], `ops[${i}].rowRef`, true, 300);
    if (O['number'] !== null && typeof O['number'] !== 'number') c.errors.push(`ops[${i}].number: expected number`);
    if (O['percent'] !== null && typeof O['percent'] !== 'number') c.errors.push(`ops[${i}].percent: expected number`);
  });
  if (typeof v['confidence'] !== 'number' || v['confidence'] < 0 || v['confidence'] > 1) c.errors.push('confidence: expected 0..1');
  c.str(v['unsupported'], 'unsupported', true, 160);
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: v as unknown as AnalysisEdit };
}

/* ================================================================================================
   PHASE 8D — the financial agent's contracts. A THINK step names the next governed calls (from the relevant subset the
   step was shown — the tool enum is that subset), its running notes, open questions, whether to ask or synthesize, and
   whether it needs a more capable class. The SYNTHESIS separates observed fact, evidence, inference, draft explanation
   and unresolved question, each with its support level and the observations it rests on. Korvyn re-validates both.
   ================================================================================================ */
import { AGENT_DOMAINS, ESCALATION_REASONS, FINDING_KINDS, GOAL_CLASSES, SUPPORT } from './agent/investigate.js';
export const AGENT_DECISIONS = ['CALL_TOOLS', 'ASK_USER', 'SYNTHESIZE'] as const;
export interface AgentStepOut {
  goalClass: (typeof GOAL_CLASSES)[number]; understanding: string; decision: (typeof AGENT_DECISIONS)[number];
  calls: { tool: string; purpose: string; progress: string; args: { name: string; value: string }[] }[];
  needCapabilities: string[];
  workingNotes: { text: string; support: (typeof SUPPORT)[number]; observationRefs: string[] }[];
  openQuestions: string[]; question: string | null; options: string[]; confidence: number;
  escalate: { needed: boolean; reason: (typeof ESCALATION_REASONS)[number] | null; detail: string | null };
}
export const agentStepSchema = (toolIds: readonly string[]) => obj({
  goalClass: strEnum(GOAL_CLASSES),
  understanding: { type: 'string' },
  decision: strEnum(AGENT_DECISIONS),
  calls: { type: 'array', items: obj({ tool: toolIds.length ? { type: 'string', enum: [...toolIds] } : { type: 'string' }, purpose: { type: 'string' }, progress: { type: 'string' }, args: { type: 'array', items: obj({ name: { type: 'string' }, value: { type: 'string' } }) } }) },
  needCapabilities: { type: 'array', items: strEnum(AGENT_DOMAINS) },
  workingNotes: { type: 'array', items: obj({ text: { type: 'string' }, support: strEnum(SUPPORT), observationRefs: { type: 'array', items: { type: 'string' } } }) },
  openQuestions: { type: 'array', items: { type: 'string' } },
  question: nul('string'),
  options: { type: 'array', items: { type: 'string' } },
  confidence: { type: 'number' },
  escalate: obj({ needed: { type: 'boolean' }, reason: strEnum(ESCALATION_REASONS, true), detail: nul('string') }),
});
/** the step schema every call sends: identical across steps, so the provider can read the cached prefix */
export const AGENT_STEP_SCHEMA = agentStepSchema([]);
const clipS = (x: Json, n: number): Json => (typeof x === 'string' && x.length > n ? `${x.slice(0, n - 1)}…` : x);
const clipA = (x: Json, n: number): Json => (Array.isArray(x) ? x.slice(0, n) : x);
/**
 * Over-long prose or one list item too many is not a wrong answer: it is clipped to the contract's limits before
 * validation, so a sound step is not thrown away for a 260-character purpose. Structure, enums, the tool allowlist and
 * observation references are still validated strictly.
 */
export function normalizeAgentStep(v: Json): Json {
  if (!isObj(v)) return v;
  const o: Record<string, Json> = { ...v };
  o['understanding'] = clipS(o['understanding'], 400);
  o['calls'] = clipA(o['calls'], 3);
  if (Array.isArray(o['calls'])) o['calls'] = (o['calls'] as Json[]).map((c) => isObj(c) ? { ...c, purpose: clipS(c['purpose'], 240), progress: clipS(c['progress'], 120), args: Array.isArray(c['args']) ? (clipA(c['args'], 14) as Json[]).map((a) => isObj(a) ? { ...a, name: clipS(a['name'], 40), value: clipS(a['value'], 200) } : a) : c['args'] } : c);
  o['needCapabilities'] = clipA(o['needCapabilities'], 6);
  o['workingNotes'] = clipA(o['workingNotes'], 8);
  if (Array.isArray(o['workingNotes'])) o['workingNotes'] = (o['workingNotes'] as Json[]).map((w) => isObj(w) ? { ...w, text: clipS(w['text'], 400), observationRefs: clipA(w['observationRefs'], 10) } : w);
  o['openQuestions'] = Array.isArray(o['openQuestions']) ? (clipA(o['openQuestions'], 6) as Json[]).map((x) => clipS(x, 240)) : o['openQuestions'];
  o['question'] = clipS(o['question'], 240);
  o['options'] = Array.isArray(o['options']) ? (clipA(o['options'], 5) as Json[]).map((x) => clipS(x, 140)) : o['options'];
  if (isObj(o['escalate'])) o['escalate'] = { ...o['escalate'], detail: clipS(o['escalate']['detail'], 240) };
  return o;
}
export function normalizeAgentSynth(v: Json, refs: readonly string[]): Json {
  if (!isObj(v)) return v;
  const o: Record<string, Json> = { ...v };
  o['headline'] = clipS(o['headline'], 400);
  o['inspected'] = Array.isArray(o['inspected']) ? (clipA(o['inspected'], 14) as Json[]).map((x) => clipS(x, 240)) : o['inspected'];
  /* a finding citing an observation that does not exist keeps the refs that do; with none left it is still validated
     (and its figures still grounded) — an unknown ref is dropped, never invented */
  if (Array.isArray(o['findings'])) o['findings'] = (clipA(o['findings'], 12) as Json[]).map((f) => isObj(f) ? { ...f, statement: clipS(f['statement'], 500), observationRefs: Array.isArray(f['observationRefs']) ? (f['observationRefs'] as Json[]).filter((r) => typeof r === 'string' && refs.includes(r)).slice(0, 10) : f['observationRefs'] } : f);
  o['unresolved'] = Array.isArray(o['unresolved']) ? (clipA(o['unresolved'], 8) as Json[]).map((x) => clipS(x, 300)) : o['unresolved'];
  if (Array.isArray(o['nextSteps'])) o['nextSteps'] = (clipA(o['nextSteps'], 4) as Json[]).map((n) => isObj(n) ? { ...n, label: clipS(n['label'], 80), request: clipS(n['request'], 240) } : n);
  return o;
}
export function validateAgentStep(v: Json, toolIds: readonly string[], maxCalls = 3): Result<AgentStepOut> {
  const c = new V();
  if (!c.keys(v, 'step', ['goalClass', 'understanding', 'decision', 'calls', 'needCapabilities', 'workingNotes', 'openQuestions', 'question', 'options', 'confidence', 'escalate'])) return { ok: false, errors: c.errors };
  c.enm(v['goalClass'], 'goalClass', GOAL_CLASSES); c.enm(v['decision'], 'decision', AGENT_DECISIONS); c.str(v['understanding'], 'understanding', false, 400);
  if (c.arr(v['calls'], 'calls', maxCalls)) (v['calls'] as Json[]).forEach((x, i) => {
    if (!c.keys(x, `calls[${i}]`, ['tool', 'purpose', 'progress', 'args'])) return;
    const X = x as Record<string, Json>;
    c.enm(X['tool'], `calls[${i}].tool`, toolIds); c.str(X['purpose'], `calls[${i}].purpose`, false, 240); c.str(X['progress'], `calls[${i}].progress`, false, 120);
    if (c.arr(X['args'], `calls[${i}].args`, 14)) (X['args'] as Json[]).forEach((a, j) => { if (c.keys(a, `calls[${i}].args[${j}]`, ['name', 'value'])) { c.str((a as Record<string, Json>)['name'], 'arg name', false, 40); c.str((a as Record<string, Json>)['value'], 'arg value', false, 200); } });
  });
  if (c.arr(v['needCapabilities'], 'needCapabilities', 6)) (v['needCapabilities'] as Json[]).forEach((x) => c.enm(x, 'needCapabilities', AGENT_DOMAINS));
  if (c.arr(v['workingNotes'], 'workingNotes', 8)) (v['workingNotes'] as Json[]).forEach((x, i) => { if (!c.keys(x, `workingNotes[${i}]`, ['text', 'support', 'observationRefs'])) return; const X = x as Record<string, Json>; c.str(X['text'], 'note', false, 400); c.enm(X['support'], 'support', SUPPORT); if (c.arr(X['observationRefs'], 'refs', 10)) (X['observationRefs'] as Json[]).forEach((r) => c.str(r, 'ref', false, 12)); });
  if (c.arr(v['openQuestions'], 'openQuestions', 6)) (v['openQuestions'] as Json[]).forEach((x) => c.str(x, 'openQuestion', false, 240));
  c.str(v['question'], 'question', true, 240);
  if (c.arr(v['options'], 'options', 5)) (v['options'] as Json[]).forEach((x) => c.str(x, 'option', false, 140));
  if (typeof v['confidence'] !== 'number' || v['confidence'] < 0 || v['confidence'] > 1) c.errors.push('confidence: expected 0..1');
  if (c.keys(v['escalate'], 'escalate', ['needed', 'reason', 'detail'])) { const E = v['escalate'] as Record<string, Json>; if (typeof E['needed'] !== 'boolean') c.errors.push('escalate.needed: expected boolean'); if (E['reason'] !== null) c.enm(E['reason'], 'escalate.reason', ESCALATION_REASONS); c.str(E['detail'], 'escalate.detail', true, 240); }
  if (v['decision'] === 'CALL_TOOLS' && Array.isArray(v['calls']) && !(v['calls'] as Json[]).length) c.errors.push('decision CALL_TOOLS with no calls');
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: v as unknown as AgentStepOut };
}
export interface AgentSynthOut {
  headline: string; inspected: string[];
  findings: { statement: string; kind: (typeof FINDING_KINDS)[number]; support: (typeof SUPPORT)[number]; observationRefs: string[] }[];
  unresolved: string[]; nextSteps: { label: string; request: string }[]; confidence: number;
  escalate: { needed: boolean; reason: (typeof ESCALATION_REASONS)[number] | null; detail: string | null };
}
export const AGENT_SYNTH_SCHEMA = obj({
  headline: { type: 'string' },
  inspected: { type: 'array', items: { type: 'string' } },
  findings: { type: 'array', items: obj({ statement: { type: 'string' }, kind: strEnum(FINDING_KINDS), support: strEnum(SUPPORT), observationRefs: { type: 'array', items: { type: 'string' } } }) },
  unresolved: { type: 'array', items: { type: 'string' } },
  nextSteps: { type: 'array', items: obj({ label: { type: 'string' }, request: { type: 'string' } }) },
  confidence: { type: 'number' },
  escalate: obj({ needed: { type: 'boolean' }, reason: strEnum(ESCALATION_REASONS, true), detail: nul('string') }),
});
export function validateAgentSynth(v: Json, refs: readonly string[]): Result<AgentSynthOut> {
  const c = new V();
  if (!c.keys(v, 'synthesis', ['headline', 'inspected', 'findings', 'unresolved', 'nextSteps', 'confidence', 'escalate'])) return { ok: false, errors: c.errors };
  c.str(v['headline'], 'headline', false, 400);
  if (c.arr(v['inspected'], 'inspected', 14)) (v['inspected'] as Json[]).forEach((x) => c.str(x, 'inspected', false, 240));
  if (c.arr(v['findings'], 'findings', 12)) (v['findings'] as Json[]).forEach((x, i) => { if (!c.keys(x, `findings[${i}]`, ['statement', 'kind', 'support', 'observationRefs'])) return; const X = x as Record<string, Json>; c.str(X['statement'], 'statement', false, 500); c.enm(X['kind'], 'kind', FINDING_KINDS); c.enm(X['support'], 'support', SUPPORT); if (c.arr(X['observationRefs'], 'refs', 10)) (X['observationRefs'] as Json[]).forEach((r) => { if (typeof r !== 'string' || !refs.includes(r)) c.errors.push(`findings[${i}]: unknown observation ${String(r)}`); }); });
  if (c.arr(v['unresolved'], 'unresolved', 8)) (v['unresolved'] as Json[]).forEach((x) => c.str(x, 'unresolved', false, 300));
  if (c.arr(v['nextSteps'], 'nextSteps', 4)) (v['nextSteps'] as Json[]).forEach((x, i) => { if (!c.keys(x, `nextSteps[${i}]`, ['label', 'request'])) return; c.str((x as Record<string, Json>)['label'], 'label', false, 80); c.str((x as Record<string, Json>)['request'], 'request', false, 240); });
  if (typeof v['confidence'] !== 'number' || v['confidence'] < 0 || v['confidence'] > 1) c.errors.push('confidence: expected 0..1');
  if (c.keys(v['escalate'], 'escalate', ['needed', 'reason', 'detail'])) { const E = v['escalate'] as Record<string, Json>; if (typeof E['needed'] !== 'boolean') c.errors.push('escalate.needed: expected boolean'); if (E['reason'] !== null) c.enm(E['reason'], 'escalate.reason', ESCALATION_REASONS); }
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: v as unknown as AgentSynthOut };
}
