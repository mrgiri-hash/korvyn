import { register } from './registry.js';
import { postToLedger } from '../humanApproval.js';

/**
 * The guardrail, exposed as a tool so the boundary is demonstrable: if the model
 * ever tries to post to the ERP, it is refused. postToLedger requires a
 * HumanApproval token that no agent code path can construct, so this always
 * returns the block message — the agent cannot write to the system of record.
 */
register({
  def: {
    name: 'post_to_ledger',
    description:
      'Attempt to post a journal entry to the ERP. NOTE: Korvyn is a read/validation layer over the system of record and NEVER posts. This tool always refuses — posting requires human approval outside the agent. Do not use it to "fix" anything; instead create a task or escalate.',
    input_schema: {
      type: 'object',
      properties: { entry: { type: 'string', description: 'Description of the entry the model wanted to post.' } },
      required: ['entry'],
      additionalProperties: false,
    },
  },
  run: (input) => {
    try {
      postToLedger(input['entry']); // no token — refused by construction
      return JSON.stringify({ posted: true }); // unreachable
    } catch (e) {
      return JSON.stringify({ refused: true, reason: (e as Error).message });
    }
  },
});
