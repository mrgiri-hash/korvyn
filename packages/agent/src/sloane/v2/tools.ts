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
import { type PlanContext, composedByName, composedCoverage, composedFor, planContext } from './compose.js';
import { type ConversationReferent, inheritReferent } from './referent.js';
import { type FactContext, type FactRegistry, type FinancialFact, factsFrom } from './facts.js';
import { SHOW_TOOL } from './respond.js';

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
/**
 * PHASE 3 §4/§14/§31 — `respond` IS GONE FROM THE SURFACE AND NOTHING REPLACED IT AS A REQUIREMENT.
 *
 * Phase 2 made every answer a `respond` call so that the answer arrived as structure. Phase 3 wants the answer
 * to arrive as an ANSWER: the model writes, which is what it does anyway and on the same call, so no tool is
 * needed to say something and no schema shapes a sentence. `show_list` is what took its place, and it is
 * OPTIONAL — a handful of rows beneath the words when rows read better.
 *
 * `respond` and `show_list` stay in this list and only in this list: a session stored mid-turn, or a model that
 * has read an older prompt, may still emit one, and `isControlTool` has to keep recognising it so the loop can
 * answer it rather than treating it as a governed read. Neither is in `CONTROL_DEFS`, so neither is offered again.
 */
export const V2_CONTROL_TOOLS = ['getCurrentContext', 'show', 'show_list', 'respond', 'open_analysis_grid', 'start_investigation', 'ask_clarification'] as const;
export type V2ControlTool = (typeof V2_CONTROL_TOOLS)[number];
export const isControlTool = (name: string): name is V2ControlTool => (V2_CONTROL_TOOLS as readonly string[]).includes(name);

/* ================================================================================================
   PROVIDER TOOL DEFINITIONS
   ================================================================================================ */

export interface V2ToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, V2Prop>; required: string[]; additionalProperties: false };
}
/**
 * A governed tool's arguments are all strings (see below). `respond` is the exception and is not a governed
 * tool: its lists are lists because a driver list IS a list, and nothing in it reaches a query.
 */
export type V2Prop =
  | { type: 'string'; description: string }
  | { type: 'array'; items: { type: 'string' }; description: string };

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

const CONTROL_DEFS: Partial<Record<V2ControlTool, V2ToolDef>> = {
  /**
   * §3 — WHAT THE STATE BLOCK STOPPED PUSHING, AVAILABLE WHEN IT IS ACTUALLY NEEDED.
   *
   * It is not a governed read: it computes nothing, reaches no service and can refuse nothing. It reports what
   * THIS CONVERSATION is on, which is why it is a control tool and why an agent gets it for free without a
   * neighbourhood being assembled for every step.
   */
  getCurrentContext: {
    name: 'getCurrentContext',
    description:
      'What this conversation is currently on: the active object, the population behind the last answer, the comparison period, and the references in hand. '
      + 'Call it when a short message points at something you cannot resolve from what was said — "why?", "what about May?", "by vendor", "show the accounts" — '
      + 'and the transcript alone does not tell you which object or population is meant. You do not need it to answer an ordinary question.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  show: SHOW_TOOL,
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
  /* a control tool with no definition is a retired one (`respond`): recognised if a stale turn emits it,
     never offered again */
  const control = V2_CONTROL_TOOLS.map((n) => CONTROL_DEFS[n]).filter((d): d is V2ToolDef => !!d);
  return [...direct, ...composedFor(actor).map((c) => c.def), ...control];
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
  /** Phase 2: the canonical facts this read produced, already registered and referenceable by id */
  facts: FinancialFact[];
  /** PHASE 2.5 §6/§7: the person's own word for the subject, and the cut a breakdown was taken by */
  ctx: PlanContext;
  /** C1.1: which dimensions this call inherited from the conversation's referent, for the trace */
  inherited?: string[];
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
  ({ tool: name, ran: null, args, status: refused ? 'REFUSED' : 'FAILED', object: null, observation: compact(step, name, name, null, err, refused), latencyMs: ms, error: err, facts: [], ctx: planContext(args) });

/**
 * §11/§35 — the ONE execution path. A composed operation resolves to a registered tool first; permission is then
 * re-checked on THAT tool even though it was filtered before exposure, because exposure happened at the start of
 * the turn and authority is what holds at the moment of the read.
 */
export function runTool(
  name: string, raw: unknown, env: Omit<ToolEnv, 'objectId'>, step: number, objectSeq: number,
  facts?: { registry: FactRegistry; ctx: FactContext },
  referent?: ConversationReferent | null,
): V2ToolOutcome {
  /* C1.1 §8 — THE GENERIC BOUNDARY, AND IT IS ONE LINE BECAUSE IT HAS TO BE.
     A call to a subject-bearing operation that names no subject is elliptical, and the conversation's subject
     is what it is about. A call that names one is the model's to decide, absolutely, which is what keeps a
     topic switch working. This is the only place a referent is read, and it reads structure — never a phrase. */
  const inh = inheritReferent(name, coerceArgs(raw), referent ?? null);
  const given = inh.args;
  const t0 = Date.now();
  const composed = composedByName(name);
  let args = given, id = name, note: string | undefined, title: string | undefined, measure: PlanContext['measure'];

  if (composed) {
    const missing = composed.def({ allows: () => true }).input_schema.required.filter((k) => !given[k]);
    if (missing.length) return fail(name, given, step, `missing required ${missing.join(', ')}`, false, Date.now() - t0);
    let planned;
    try { planned = composed.plan(given, { ...env, objectId: `V2-FO-${objectSeq}` }); }
    catch (e) { return fail(name, given, step, e instanceof Error ? e.message : String(e), false, Date.now() - t0); }
    if (planned.kind === 'ANSWER') {
      /* the concept could not honestly produce a figure: that IS the governed answer */
      return register({ tool: name, ran: null, args: given, status: 'COMPLETED', object: planned.object,
        observation: compact(step, name, name, planned.object, null), latencyMs: Date.now() - t0, error: null, facts: [], ctx: { ...planContext(given), ...(measure ? { measure } : {}), ...(note ? { note } : {}) }, ...(inh.inherited.length ? { inherited: inh.inherited } : {}) }, facts);
    }
    id = planned.tool; args = planned.args; note = planned.note; title = planned.title; measure = planned.measure;
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
    /* §28 — the dispatcher knows the person's own word for the subject; the registered tool only knew the codes */
    if (title) r.object.title = title;
    const obs = compact(step, name, name, r.object, null);
    if (note) obs.note = obs.note ? `${note} ${obs.note}` : note;
    return register({ tool: name, ran: id, args, status: 'COMPLETED', object: r.object, observation: obs, latencyMs: Date.now() - t0, error: null, facts: [], ctx: { ...planContext(given), ...(measure ? { measure } : {}), ...(note ? { note } : {}) }, ...(inh.inherited.length ? { inherited: inh.inherited } : {}) }, facts);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ...fail(name, args, step, err, false, Date.now() - t0), ran: id };
  }
}

/**
 * PHASE 2 — every governed figure this read produced becomes a canonical fact with an id, and the observation
 * the model sees carries that id beside the value. That is the whole mechanism: the model can only cite a
 * figure it was handed an id for, so a figure it never read has no way into the answer.
 */
/**
 * PHASE 2.6.1 — AN EXPLANATION IS READING MATERIAL, NOT A CITABLE VALUE.
 *
 * The two semantic reads return what a word MEANS on this book — a definition, a resolution status, a note.
 * None of it is a figure, and the fact contract exists for exactly one reason: so the model never types an
 * authoritative figure. Handing it ids for prose invited the opposite, and the live smoke showed it: asked
 * whether a consolidated figure includes eliminations, the model cited the concept's status and its mapping
 * and Korvyn substituted them verbatim, producing "Yes — RESOLVED the June revenue figures already reflect
 * … A consolidation step, not an account rather than a separate account". Every word governed, and the
 * sentence unreadable.
 *
 * So these reads carry no ids. The model still SEES every word of them and answers in its own — which is what
 * a conceptual question wants, and it is also why such a turn is a reasoned one rather than a composed one.
 */
const EXPLANATORY_TOOL_IDS = new Set(V2_DIRECT_TOOL_IDS);

function register(o: V2ToolOutcome, f?: { registry: FactRegistry; ctx: FactContext }): V2ToolOutcome {
  if (!f || !o.object || (o.ran && EXPLANATORY_TOOL_IDS.has(o.ran))) return o;
  const made = f.registry.add(factsFrom(o.object, f.ctx));
  /* the observation's facts are the object's own, in order, so the id lands on the right one */
  const byKey = new Map(made.map((x, i) => [o.object!.facts[i]?.key ?? x.label, x.factId]));
  for (const of of o.observation.facts) { const id = byKey.get(of.key); if (id) of.id = id; }
  return { ...o, facts: made };
}

/** what goes back to the model as a tool_result: the compact observation, as text, never the rows */
export const observationText = (o: CompactObservation): string => JSON.stringify(o);
