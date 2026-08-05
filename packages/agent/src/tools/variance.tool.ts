import { register, arg } from './registry.js';
import { explainVariance } from '../ledger.js';

register({
  def: {
    name: 'explain_variance',
    description:
      'Deterministically decompose an account\'s period-over-period movement into its drivers (by vendor / recurring vs ' +
      'non-recurring), with an explicit unattributed residual. Use for "why did X move", "explain the delta in X", ' +
      '"what drove the change in X". Components plus residual reconcile exactly to the delta; no causation is inferred.',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'GL account number or name (e.g. 21000, "accrued capital costs").' },
        from: { type: 'string', description: 'Start period (default 2026-Q1).' },
        to: { type: 'string', description: 'End period (default 2026-Q2).' },
      },
      required: ['account'],
      additionalProperties: false,
    },
  },
  run: (input) => JSON.stringify(explainVariance(arg(input['account']), arg(input['from']) || '2026-Q1', arg(input['to']) || '2026-Q2')),
});
