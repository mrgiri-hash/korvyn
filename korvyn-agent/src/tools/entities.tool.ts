import { register } from './registry.js';
import { listEntities } from '../graph.js';

register({
  def: {
    name: 'list_entities',
    description:
      'List the consolidated group entities and the ERP source system each one feeds from, including which feeds are ' +
      'degraded (stale or unreachable). Use for "what entities are in scope", "which ERPs feed the close", or source-health questions.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  run: () => JSON.stringify(listEntities()),
});
