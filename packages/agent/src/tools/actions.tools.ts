import { register, arg } from './registry.js';
import { createTask, saveEvidence, escalate, setExceptionState, auditLog } from '../stores.js';

/** Action tools — answers become work. Real side effects into Korvyn's own append-only stores (never the ledger). */

register({
  def: {
    name: 'create_task',
    description: 'Create a task in Korvyn (e.g. to chase a missing confirmation). Use when the user asks to "create a task", "assign follow-up", or when an answer should become tracked work. Returns the created task.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What the task is.' },
        owner: { type: 'string', description: 'Who should own it (name).' },
        due: { type: 'string', description: 'Due date (free text).' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  run: (input) => JSON.stringify(createTask(arg(input['title']), arg(input['owner']) || 'Unassigned', arg(input['due']) || '—')),
});

register({
  def: {
    name: 'save_evidence',
    description: 'Save a claim plus its supporting links as an evidence item (immutable audit record). Use for "save this as evidence", "record this for the file". Returns the evidence record.',
    input_schema: {
      type: 'object',
      properties: {
        claim: { type: 'string', description: 'The statement being evidenced.' },
        links: { type: 'array', items: { type: 'string' }, description: 'Supporting record ids / references (e.g. korvynIds, exception ids, policy ids).' },
      },
      required: ['claim'],
      additionalProperties: false,
    },
  },
  run: (input) => {
    const links = Array.isArray(input['links']) ? (input['links'] as unknown[]).map((x) => String(x)) : [];
    return JSON.stringify(saveEvidence(arg(input['claim']), links));
  },
});

register({
  def: {
    name: 'escalate',
    description: 'Escalate an exception to an owner/role with a reason. Sets the exception state to Escalated. Use for "escalate this", "flag to the controller".',
    input_schema: {
      type: 'object',
      properties: {
        exceptionId: { type: 'string', description: 'The exception id (e.g. TX-RECON-13500-HOLD, TX-DET-ICNM).' },
        to: { type: 'string', description: 'Who to escalate to (name or role).' },
        reason: { type: 'string', description: 'Why.' },
      },
      required: ['exceptionId'],
      additionalProperties: false,
    },
  },
  run: (input) => JSON.stringify(escalate(arg(input['exceptionId']), arg(input['to']) || 'Controller', arg(input['reason']))),
});

register({
  def: {
    name: 'set_exception_state',
    description: 'Move an exception through its lifecycle: New → Assigned → Escalated → Cleared → Dismissed. Use for "assign this", "clear it", "dismiss it", "mark as ...". Records the change in the audit log; nothing is deleted.',
    input_schema: {
      type: 'object',
      properties: {
        exceptionId: { type: 'string', description: 'The exception id.' },
        state: { type: 'string', enum: ['New', 'Assigned', 'Escalated', 'Cleared', 'Dismissed'], description: 'The new lifecycle state.' },
        by: { type: 'string', description: 'Who is making the change (name).' },
      },
      required: ['exceptionId', 'state'],
      additionalProperties: false,
    },
  },
  run: (input) => JSON.stringify(setExceptionState(arg(input['exceptionId']), arg(input['state']), arg(input['by']) || 'Korvyn agent')),
});

register({
  def: {
    name: 'audit_log',
    description: 'The append-only record of everything the agent has done this session: tasks created, evidence saved, escalations, and exception state changes. Use for "what have you done", "show the audit trail".',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  run: () => JSON.stringify(auditLog()),
});
