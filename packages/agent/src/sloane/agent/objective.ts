/**
 * A2 §3/§4 — THE INVOCATION GATE AND THE OBJECTIVE CLASSIFIER: two decisions, deliberately separated.
 *
 * Before A2 one 15-branch regex did both jobs at once — it decided whether a request warranted a run AND which of
 * six execution templates would run it — so the words in a request chose the run's authority. That is the coupling
 * A2 removes.
 *
 *   A. IS THIS AGENTIC?  a cheap, conservative, DETERMINISTIC pre-gate. It only ever says "this could be work to
 *      carry through" or "this is a question / an instruction". It never chooses authority, never names a template
 *      and never decides what the run will do. On the conversational path the MODEL has already answered this
 *      (`conversationIntent === 'INVESTIGATION'`), and §4 is explicit that an existing lightweight classification
 *      is preferred to a new frontier call on every turn — so this is the fallback, not the primary.
 *
 *   B. WHAT KIND OF WORK IS IT?  a single classification through the MODEL GATEWAY, once per RUN (never per turn),
 *      on the cheapest route. It returns an OUTCOME CLASS, not a profile: the model says what the person asked for;
 *      KORVYN maps that to a profile and intersects it with what the actor may actually do. The model can widen
 *      nothing — an objective that asks to prepare a package, from an actor who may only read, resolves to a
 *      read-only profile and the run says so.
 *
 * §3's prohibition is honoured literally: nothing here matches a finance phrase, and the deterministic fallback
 * ranks on GRAMMAR (does the request name an outcome to produce?) rather than on vocabulary.
 */
import type { Capability } from '../auth.js';
import type { AgentHost, ModelCallRecord } from './host.js';
import { type OutcomeClass, type ProfileId, POLICY_PROFILES, PROFILE_FOR_OUTCOME } from './model.js';
import type { Actor } from '../tools.js';

/* ================================================================================================
   A. THE PRE-GATE — is this work to carry through, or a turn to answer?
   ================================================================================================ */
/**
 * Deliberately crude and deliberately CONSERVATIVE: a false negative costs an ordinary answer, a false positive
 * costs a run nobody asked for. It is three structural tests, none of them about finance:
 *   - a question is not an objective (it ends in '?', or opens with an interrogative);
 *   - a single clause with no verb of work is an instruction, not an objective;
 *   - an objective states work to carry OUT — it has an imperative verb of investigation or production, and
 *     usually more than one clause.
 * The verbs are ordinary English, not a domain vocabulary, and adding one does not change any run's authority.
 */
const WORK_VERB = /\b(review|investigate|prepare|assemble|analyse|analyze|compile|examine|look into|dig into|work through|put together|pull together|go through|figure out|find out|work out|get .{0,24}\bready)\b/i;
const INTERROGATIVE = /^(what|which|who|when|where|why|how|is|are|was|were|do|does|did|can|could|should|would|show|list|give|tell)\b/i;
const IMPERATIVE_EDIT = /^(please\s+)?(put|make|rewrite|reword|shorten|summarise|summarize|format|turn|convert|add|remove|change|open|go|back|undo|redo|clear|save|send|email|share|export|download|print)\b/i;

/**
 * A request that names a FILE to build is not multi-step autonomous work: Korvyn's conversation already composes,
 * validates and generates governed workbooks and packages in one turn (Phase 4A/4B), and routing "Build the June
 * close review package" to an agent would duplicate that path with a slower one. A1 §21's rule — simple requests
 * must not use agents — applied to the one category the conversation is already better at.
 *
 * This lives in the GATE, not the classifier: a caller that starts a run explicitly (headless, a module, a
 * scheduler) may still ask for a deliverable, and PREPARE_DELIVERABLE is how that run is profiled.
 */
const CONVERSATION_BUILDS = /\b(package|workbook|spreadsheet|extract|xlsx|csv)\b/i;

export interface GateDecision { agentic: boolean; reason: string }
/**
 * @param text the request, verbatim
 * @param modelSaysAgentic the conversational front door's own classification, when one is available — it OUTRANKS
 *        this function, because a model reading the whole turn is a better judge than three regexes over its words
 */
export function isAgenticObjective(text: string, modelSaysAgentic?: boolean): GateDecision {
  if (modelSaysAgentic !== undefined) return { agentic: modelSaysAgentic, reason: modelSaysAgentic ? 'the conversational classifier read this as an objective' : 'the conversational classifier read this as an ordinary turn' };
  const t = text.trim();
  if (t.length < 12) return { agentic: false, reason: 'too short to be an objective' };
  if (/\?\s*$/.test(t)) return { agentic: false, reason: 'a question is answered, not carried through' };
  if (IMPERATIVE_EDIT.test(t)) return { agentic: false, reason: 'an instruction about the answer on screen, not work to carry through' };
  if (CONVERSATION_BUILDS.test(t)) return { agentic: false, reason: 'a deliverable the conversation composes in one turn' };
  if (!WORK_VERB.test(t)) return { agentic: false, reason: 'no verb of work to carry through' };
  if (INTERROGATIVE.test(t) && !WORK_VERB.test(t.split(/\s+/).slice(0, 3).join(' '))) return { agentic: false, reason: 'reads as a question' };
  return { agentic: true, reason: 'states work to carry through' };
}

/* ================================================================================================
   B. THE OBJECTIVE CLASSIFIER — what kind of work, through the Model Gateway
   ================================================================================================ */
export interface ObjectiveClassification {
  outcome: OutcomeClass;
  /** the model's own words for what it read the objective as — recorded, never used to choose authority */
  understanding: string;
  /** does this objective warrant DEEP reasoning from the first step? Korvyn still owns the ceiling. */
  needsDeepReasoning: boolean;
  confidence: number;
  source: 'model' | 'deterministic' | 'caller';
  call: ModelCallRecord | null;
}

/**
 * The DETERMINISTIC fallback, used when no model is configured, when the classifier declines or fails, or when the
 * caller already knows. It reads the objective's OBJECT — does it name a thing to be produced and handed over? —
 * and not its subject matter. "Package", "workbook", "briefing", "memo" are ordinary English nouns for an artifact;
 * they do not name a finance domain and they do not choose a template.
 */
/**
 * Deliberately narrow: a FILE. A "briefing", a "memo", a "summary" or a "write-up" is prose, and prose is what the
 * ANALYZE path already produces — classifying those as a deliverable would send an ordinary review down an
 * artifact-generation pipeline and stop it for a confirmation nobody asked for (observed, on A1's own smoke
 * objective, which asks for "a concise controller briefing"). When in doubt this returns ANALYZE, because the cost
 * of under-classifying is a run that reads and reports, and the cost of over-classifying is a run that stops.
 */
const DELIVERABLE_NOUN = /\b(package|workbook|spreadsheet|extract|export|xlsx|csv|excel file|audit file|data file)\b/i;
/**
 * PREPARE_WORKFLOW_ACTIONS IS DELIBERATELY NOT REACHABLE WITHOUT A MODEL. Telling "prepare the drafts that would
 * clear this" from "tell me what would need drafting" is a judgement about language, and every candidate word is
 * more often the SUBJECT of an analysis question than an instruction to act — "whether June is safe to sign off"
 * asks for an opinion and names no work to record. (Observed: a word list selected a preparation profile for it and
 * ran an action-preparation template.) Without a model Korvyn under-classifies on purpose: a run that reads and
 * reports is a far smaller mistake than a run that prepares work nobody asked for.
 */
export function deterministicOutcome(text: string): { outcome: OutcomeClass; understanding: string } {
  if (DELIVERABLE_NOUN.test(text)) return { outcome: 'PREPARE_DELIVERABLE', understanding: 'the objective names a file to be produced and handed over' };
  return { outcome: 'ANALYZE', understanding: 'the objective asks for a question to be worked out, with nothing produced' };
}

/**
 * ONE model call per RUN, on the cheapest route the gateway offers. Never per conversational turn: §4 rules that
 * out, and the conversational path has already decided it is agentic before this is reached.
 */
export async function classifyObjective(host: AgentHost, text: string, signal?: AbortSignal): Promise<ObjectiveClassification> {
  const det = deterministicOutcome(text);
  const fallback = (source: 'deterministic'): ObjectiveClassification => ({ ...det, needsDeepReasoning: false, confidence: 0.4, source, call: null });
  if (!host.classifyObjective) return fallback('deterministic');
  try {
    const r = await host.classifyObjective(text, signal);
    if (!r.out || r.out.status !== 'ok') return { ...fallback('deterministic'), call: r.call };
    const v = r.out.value;
    return { outcome: v.outcome, understanding: v.understanding, needsDeepReasoning: v.needsDeepReasoning, confidence: v.confidence, source: 'model', call: r.call };
  } catch { return fallback('deterministic'); }
}

/* ================================================================================================
   KORVYN MAPS OUTCOME → PROFILE, AND THE ACTOR'S AUTHORITY CAPS IT
   ================================================================================================ */
/** the capability an actor must hold for a profile to be allowed to PREPARE anything at all */
const PREPARE_CAPABILITY: Capability = 'FLUX_COMMENT';
export interface ProfileDecision { profile: ProfileId; outcome: OutcomeClass; capped: boolean; reason: string }

/**
 * A profile is authority, so this is Korvyn's decision and only Korvyn's. Two rules:
 *   1. the outcome the objective asks for selects the profile;
 *   2. an actor who cannot prepare anything is CAPPED to a read-only profile, whatever the objective asked for,
 *      and the run states that it was capped rather than silently doing less than was asked.
 */
export function profileForOutcome(outcome: OutcomeClass, actor: Actor, requested?: ProfileId): ProfileDecision {
  const wanted = requested && POLICY_PROFILES[requested] ? requested : PROFILE_FOR_OUTCOME[outcome];
  const p = POLICY_PROFILES[wanted];
  if (p.autonomy >= 2 && !actor.permissions.includes(PREPARE_CAPABILITY))
    return { profile: 'INVESTIGATION', outcome, capped: true, reason: `${actor.role} may not prepare work in Korvyn, so this runs read-only: it will state what it found and what would need preparing.` };
  return { profile: wanted, outcome, capped: false, reason: `Objective classified ${outcome} → ${p.label} (autonomy ${p.autonomy}); chosen by Korvyn, never by the request.` };
}
