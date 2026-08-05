/**
 * Append-only workflow stores — Korvyn's OWN state, not the ledger. These are
 * the real side effects the agent produces: answers become work. Nothing here
 * writes to the ERP. Session-scoped (in memory for the process lifetime).
 */

const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
let seq = 0;
const id = (prefix: string) => `${prefix}-${(++seq).toString().padStart(4, '0')}`;

export interface Task { id: string; title: string; owner: string; due: string; createdAt: string; source: string; }
export interface Evidence { id: string; claim: string; links: string[]; actor: string; savedAt: string; }
export interface Escalation { id: string; exceptionId: string; to: string; reason: string; at: string; }
export interface StateChange { exceptionId: string; from: string; to: string; by: string; at: string; }

const TASKS: Task[] = [];
const EVIDENCE: Evidence[] = [];
const ESCALATIONS: Escalation[] = [];
const STATE_LOG: StateChange[] = [];
const EXC_STATE = new Map<string, string>();

const LIFECYCLE = ['New', 'Assigned', 'Escalated', 'Cleared', 'Dismissed'] as const;

export function createTask(title: string, owner = 'Unassigned', due = '—'): Task {
  const task: Task = { id: id('TASK'), title, owner, due, createdAt: now(), source: 'Korvyn agent' };
  TASKS.push(task);
  return task;
}

export function saveEvidence(claim: string, links: string[] = [], actor = 'Korvyn agent'): Evidence {
  const ev: Evidence = { id: id('EV'), claim, links, actor, savedAt: now() };
  EVIDENCE.push(ev);
  return ev;
}

export function escalate(exceptionId: string, to = 'Controller', reason = ''): Escalation {
  const es: Escalation = { id: id('ESC'), exceptionId, to, reason, at: now() };
  ESCALATIONS.push(es);
  const from = EXC_STATE.get(exceptionId) ?? 'New';
  EXC_STATE.set(exceptionId, 'Escalated');
  STATE_LOG.push({ exceptionId, from, to: 'Escalated', by: to, at: now() });
  return es;
}

export function setExceptionState(exceptionId: string, state: string, by = 'Korvyn agent'): StateChange | { error: string } {
  const target = LIFECYCLE.find((s) => s.toLowerCase() === state.trim().toLowerCase());
  if (!target) return { error: `invalid state "${state}". Lifecycle: ${LIFECYCLE.join(' → ')}.` };
  const from = EXC_STATE.get(exceptionId) ?? 'New';
  EXC_STATE.set(exceptionId, target);
  const change: StateChange = { exceptionId, from, to: target, by, at: now() };
  STATE_LOG.push(change);
  return change;
}

export function exceptionState(exceptionId: string): string | undefined {
  return EXC_STATE.get(exceptionId);
}

export function auditLog() {
  return {
    tasks: TASKS,
    evidence: EVIDENCE,
    escalations: ESCALATIONS,
    stateChanges: STATE_LOG,
    counts: { tasks: TASKS.length, evidence: EVIDENCE.length, escalations: ESCALATIONS.length, stateChanges: STATE_LOG.length },
    note: 'Append-only. Dismissed and superseded items are retained — nothing is deleted.',
  };
}
