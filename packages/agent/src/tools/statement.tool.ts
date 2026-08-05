import { register, arg } from './registry.js';
import { getStatement } from '../graph.js';

register({
  def: {
    name: 'financial_statement',
    description:
      'Return a consolidated financial statement, derived from the trial balance. Use for "show me the balance sheet", ' +
      '"income statement", "P&L", "cash flow". Figures are in USD millions; the balance sheet ties (assets = liabilities + equity).',
    input_schema: {
      type: 'object',
      properties: {
        statement: {
          type: 'string',
          enum: ['balance_sheet', 'income_statement', 'cash_flow'],
          description: 'Which statement to return.',
        },
      },
      required: ['statement'],
      additionalProperties: false,
    },
  },
  run: (input) => JSON.stringify(getStatement(arg(input['statement']) || 'balance_sheet')),
});
