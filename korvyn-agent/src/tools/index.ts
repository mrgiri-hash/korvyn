/**
 * Importing this module registers every tool (side-effect imports). Add a new
 * capability by dropping a `*.tool(s).ts` file and importing it here — the agent
 * picks it up with no further wiring. That is the auto-wire property.
 */
// read tools
import './trace.tool.js';
import './detections.tool.js';
import './statement.tool.js';
import './entities.tool.js';
import './variance.tool.js';
import './ledger.tools.js';
// action tools (answers become work)
import './actions.tools.js';
// guardrail (never posts)
import './post.tool.js';
