import { register } from './registry.js';
import { listDetections, listExceptions } from '../graph.js';
import { exceptionState } from '../stores.js';

/** Merge any lifecycle change this session has made over the base state. */
function withState<T extends { id: string; state: string }>(rows: T[]): T[] {
  return rows.map((r) => {
    const live = exceptionState(r.id);
    return live ? { ...r, state: live } : r;
  });
}

register({
  def: {
    name: 'list_detections',
    description:
      'List the broken / missing-link detections Korvyn found in the ingested graph, ranked by materiality. Each is opened ' +
      'as a first-class exception with a proposed owner and its current lifecycle state. Use for "what did Korvyn detect", ' +
      '"broken links", "missing links", "what is not traceable". Pass includeFinancial:true to also include the financial ' +
      'exceptions in one ranked list.',
    input_schema: {
      type: 'object',
      properties: {
        includeFinancial: { type: 'boolean', description: 'Include financial exceptions alongside detections, ranked together by materiality.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  run: (input) => JSON.stringify(withState(input['includeFinancial'] === true ? listExceptions() : listDetections())),
});
