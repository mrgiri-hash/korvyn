import { register, arg } from './registry.js';
import { traceSubject } from '../graph.js';

register({
  def: {
    name: 'trace',
    description:
      'Trace a figure, GL account number, exception id, or figure name to its provenance chain from the ingested graph. ' +
      'Returns each hop with its source system and link type (stated / derived / inferred), or a missing link with the ' +
      'owner who can resolve it. Use this for "trace X", "where does X come from", "why is X flagged", or lineage questions. ' +
      'If the subject is not in the ingested graph it returns notTraceable with the reason.',
    input_schema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'A GL account number (e.g. 13500, 21000), an exception id (e.g. TX-RECON-13500-HOLD), or a figure name (e.g. "due from affiliates", "accrued capital costs").',
        },
      },
      required: ['subject'],
      additionalProperties: false,
    },
  },
  run: (input) => JSON.stringify(traceSubject(arg(input['subject']))),
});
