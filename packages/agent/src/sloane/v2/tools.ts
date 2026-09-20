/**
 * SLOANE V2 — THE STABLE GOVERNED TOOL SURFACE.
 *
 * §9/§10/§11: Claude never reaches a database. It sees a small set of governed financial OPERATIONS,
 * permission-filtered BEFORE exposure, and asks for them by name with typed arguments. Korvyn resolves the finance
 * word, re-authorizes, runs the registered governed tool behind the operation, and hands back a COMPACT
 * observation — never rows. A population stays in Korvyn behind its id.
 *
 * WHY THE SET IS STABLE PER ACTOR, and not selected per request:
 * the Anthropic cached prefix is ordered tools → system → messages, so a tool array that changes shape from turn to
 * turn invalidates the cache on every turn. Variation belongs in the MESSAGES. The set is a constant list, filtered
 * only by what the actor may use, so a given person's prefix is byte-identical from one turn to the next.
 *
 * PHASE 1.5 — the set went from 29 governed reads to 8 operations (§14/§15). Nothing was removed from Korvyn: the
 * 29 tools are still registered and still reached, through the composed dispatchers in `compose.ts`. What changed
 * is that the model now chooses between OPERATIONS it can tell apart rather than between near-identical tools.
 */
import { type CompactObservation, compact } from '../agent/investigate.js';
/* the registry is populated by the modules that register into it; v2 names tools by id, so it must be sure they
   are there whatever imported v2 first (a bare import of this file once resolved a core set of three) */
import '../toolset.js';
import '../semantic/tools.js';
import '../semantic/concepttools.js';
import {
  type Actor, type FinancialObject, type ParamSpec, type SloaneTool, type ToolArgs, type ToolEnv,
  authorize, toolRegistry,
} from '../tools.js';
import { composedByName, composedCoverage, composedFor } from './compose.js';

/* ================================================================================================
   THE CORE SET — the operations, in one stable order
   ================================================================================================ */

/**
 * Two registered tools are exposed DIRECTLY because each is already exactly one operation and composing them
 * would only rename them:
 *   resolveFinancialConcept — what a finance term means on this book (§6)
 *   resolveFinancialObject  — which governed object a name refers to, with the ambiguity stated
 * Everything else the model sees is a composed operation from `compose.ts`.
 */
export const V2_DIRECT_TOOL_IDS: readonly string[] = ['resolveFinancialConcept', 'resolveFinancialObject'];

/** every registered READ tool the v2 surface can reach for this actor, composed or direct */
export function coreTools(actor: Actor): SloaneTool[] {
  const direct = V2_DIRECT_TOOL_IDS.map((id) => toolRegistry.get(id)).filter((t): t is SloaneTool => !!t && t.risk === 'READ' && authorize(actor, t).ok);
  const reached = composedCoverage(actor).map((id) => toolRegistry.get(id)).filter((t): t is SloaneTool => !!t);
  return [...direct, ...reached];
}

/* ================================================================================================
   CONTROL TOOLS — the three things the model may ask the PRODUCT to do
   ================================================================================================ */

/**
 * These are not governed reads and they compute nothing. They are how the model hands a turn to a surface that
 * already exists: the 8C analysis grid, the 8D investigation runtime, or the person.
 */
export const V2_CONTROL_TOOLS = ['open_analysis_grid', 'start_investigation', 'ask_clarification'] as const;
export type V2ControlTool = (typeof V2_CONTROL_TOOLS)[number];
export const isControlTool = (name: string): name is V2ControlTool => (V2_CONTROL_TOOLS as readonly string[]).includes(name);

/* ================================================================================================
   PROVIDER TOOL DEFINITIONS
   ================================================================================================ */

export interface V2ToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, { type: 'string'; description: string }>; required: string[]; additionalProperties: false };
}

/**
 * Every governed tool takes `Record<string, string>`, so every property is a string. That is deliberate and not a
 * shortcut: a number typed by the model would be coerced somewhere, and a coerced threshold is a silently different
 * question. Korvyn parses arguments itself, where the parse is governed.
 */
const propOf = (p: ParamSpec) => ({ type: 'string' as const, description: `${p.description}${p.kind === 'number' ? ' (a number, as text)' : ''}` });

export function toolDef(t: SloaneTool): V2ToolDef {
  const properties: Record<string, { type: 'string'; description: string }> = {};
  for (const p of t.params) properties[p.name] = propOf(p);
  return {
    name: t.id,
    description: `${t.description} Returns: ${t.outputs}.`,
    input_schema: { type: 'object', properties, required: t.params.filter((p) => p.required).map((p) => p.name), additionalProperties: false },
  };
}

const CONTROL_DEFS: Record<V2ControlTool, V2ToolDef> = {
  open_analysis_grid: {
    name: 'open_analysis_grid',
    description: 'Open or change the governed analysis grid — a pivot of governed balances or activity with rows, columns, periods and filters. Use this when the person wants a TABLE they will then reshape ("show June TB by entity", "break that down by project", "add a variance column"), not for a single figure or a narrative answer.',
    input_schema: {
      type: 'object',
      properties: { request: { type: 'string', description: "The person's own words describing the grid they want, verbatim." } },
      required: ['request'], additionalProperties: false,
    },
  },
  start_investigation: {
    name: 'start_investigation',
    description: 'Hand an OPEN-ENDED objective to the governed investigation runtime — a question that needs several rounds of evidence and a written conclusion ("find out why margin fell", "review the June close"), not one that two or three tool calls answer.',
    input_schema: {
      type: 'object',
      properties: { objective: { type: 'string', description: 'The objective in one sentence, in the finance language the person used.' } },
      required: ['objective'], additionalProperties: false,
    },
  },
  ask_clarification: {
    name: 'ask_clarification',
    description: 'Ask the person ONE question, only when the conversation genuinely cannot decide — two governed objects share the name, or a term reads two ways on this book and the choice changes the figure. Never ask for something the conversation or the current state already says.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'One short question.' },
        options: { type: 'string', description: 'The choices, separated by " | ". Each must be a thing Korvyn can act on.' },
      },
      required: ['question'], additionalProperties: false,
    },
  },
};

/** the full provider tool array for this actor: the two direct resolvers, the composed operations, then control */
export function toolDefinitions(actor: Actor): V2ToolDef[] {
  const direct = V2_DIRECT_TOOL_IDS
    .map((id) => toolRegistry.get(id))
    .filter((t): t is SloaneTool => !!t && t.risk === 'READ' && authorize(actor, t).ok)
    .map(toolDef);
  return [...direct, ...composedFor(actor).map((c) => c.def), ...V2_CONTROL_TOOLS.map((n) => CONTROL_DEFS[n])];
}

/* ================================================================================================
   EXECUTION — re-authorized, bounded, compacted
   ================================================================================================ */

export interface V2ToolOutcome {
  tool: string;
  /** the registered governed tool that actually ran, when a composed operation dispatched to one */
  ran: string | null;
  args: ToolArgs;
  status: 'COMPLETED' | 'REFUSED' | 'FAILED' | 'UNKNOWN';
  object: FinancialObject | null;
  observation: CompactObservation;
  latencyMs: number;
  error: string | null;
}

/** every argument arrives as text; anything else the model sent is coerced to text or dropped */
export function coerceArgs(raw: unknown): ToolArgs {
  const out: ToolArgs = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
    /* an object or array argument is not something a governed tool takes; it is dropped, and the missing-required
       check below reports it as missing rather than passing a stringified blob into a governed query */
  }
  return out;
}

const fail = (name: string, args: ToolArgs, step: number, err: string, refused: boolean, ms = 0): V2ToolOutcome =>
  ({ tool: name, ran: null, args, status: refused ? 'REFUSED' : 'FAILED', object: null, observation: compact(step, name, name, null, err, refused), latencyMs: ms, error: err });

/**
 * §11/§35 — the ONE execution path. A composed operation resolves to a registered tool first; permission is then
 * re-checked on THAT tool even though it was filtered before exposure, because exposure happened at the start of
 * the turn and authority is what holds at the moment of the read.
 */
export function runTool(name: string, raw: unknown, env: Omit<ToolEnv, 'objectId'>, step: number, objectSeq: number): V2ToolOutcome {
  const given = coerceArgs(raw);
  const t0 = Date.now();
  const composed = composedByName(name);
  let args = given, id = name, note: string | undefined;

  if (composed) {
    const missing = composed.def({ allows: () => true }).input_schema.required.filter((k) => !given[k]);
    if (missing.length) return fail(name, given, step, `missing required ${missing.join(', ')}`, false, Date.now() - t0);
    let planned;
    try { planned = composed.plan(given, { ...env, objectId: `V2-FO-${objectSeq}` }); }
    catch (e) { return fail(name, given, step, e instanceof Error ? e.message : String(e), false, Date.now() - t0); }
    if (planned.kind === 'ANSWER') {
      /* the concept could not honestly produce a figure: that IS the governed answer */
      return { tool: name, ran: null, args: given, status: 'COMPLETED', object: planned.object,
        observation: compact(step, name, name, planned.object, null), latencyMs: Date.now() - t0, error: null };
    }
    id = planned.tool; args = planned.args; note = planned.note;
  }

  const tool = toolRegistry.get(id);
  if (!tool) return fail(name, args, step, `${name} is not a Korvyn capability`, true, Date.now() - t0);
  if (tool.risk !== 'READ') return fail(name, args, step, `${name} is a ${tool.risk} action; this conversation runs governed reads only`, true, Date.now() - t0);
  const gate = authorize(env.actor, tool, args);
  if (!gate.ok) return fail(name, args, step, gate.reason, true, Date.now() - t0);
  const missing = tool.params.filter((p) => p.required && !args[p.name]).map((p) => p.name);
  if (missing.length) return fail(name, args, step, `missing required ${missing.join(', ')}`, false, Date.now() - t0);

  try {
    const r = tool.run(args, { ...env, objectId: `V2-FO-${objectSeq}` });
    const obs = compact(step, name, name, r.object, null);
    if (note) obs.note = obs.note ? `${note} ${obs.note}` : note;
    return { tool: name, ran: id, args, status: 'COMPLETED', object: r.object, observation: obs, latencyMs: Date.now() - t0, error: null };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ...fail(name, args, step, err, false, Date.now() - t0), ran: id };
  }
}

/** what goes back to the model as a tool_result: the compact observation, as text, never the rows */
export const observationText = (o: CompactObservation): string => JSON.stringify(o);
