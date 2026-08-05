import { register, arg } from './registry.js';
import { reconciliationStatus, closeStatus, intercompanyStatus, findPolicy } from '../ledger.js';

register({
  def: {
    name: 'reconciliation_status',
    description: 'Reconciliation book status: totals, open/overdue counts, and every account carrying a difference (with owner). Use for "reconciliation status", "what is unreconciled", "which accounts have differences".',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  run: () => JSON.stringify(reconciliationStatus()),
});

register({
  def: {
    name: 'close_status',
    description: 'Close position for the current period: completion %, close day, blocking tasks/entities, unreconciled count, entities ready, sign-off. Use for "close status", "how is the close going", "what is blocking the close".',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  run: () => JSON.stringify(closeStatus()),
});

register({
  def: {
    name: 'intercompany_status',
    description: 'Intercompany pair status: matched/unmatched pairs, total difference, elimination readiness, and per-pair detail. Use for "intercompany status", "which IC pairs do not tie", "is elimination ready".',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  run: () => JSON.stringify(intercompanyStatus()),
});

register({
  def: {
    name: 'get_policy',
    description: 'Look up accounting policies (capitalization thresholds, elimination, etc.) by id, title, category, or level. Empty query returns all. Use for "capitalization policy", "what is the threshold", "policy ACC-CAP-001".',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Policy id, title keyword, category, or level (e.g. "ACC-CAP-001", "capitalization", "Germany"). Empty = list all.' } },
      required: [],
      additionalProperties: false,
    },
  },
  run: (input) => JSON.stringify(findPolicy(arg(input['query']))),
});
