/**
 * Tool registry. Each tool self-registers on import, so wiring a new capability
 * into the agent is one register() call — the harness reads whatever is here.
 * This is the "auto-wire every feature" property: add a tool file, import it,
 * and the model can use it. No intent parsing, no per-tool routing.
 */

export interface AgentTool {
  def: {
    name: string;
    description: string;
    input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  };
  run: (input: Record<string, unknown>) => string | Promise<string>;
}

const _tools = new Map<string, AgentTool>();

export function register(tool: AgentTool): void {
  _tools.set(tool.def.name, tool);
}

export function toolDefs() {
  return [..._tools.values()].map((t) => t.def);
}

export async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  const tool = _tools.get(name);
  if (!tool) return JSON.stringify({ error: `unknown tool: ${name}` });
  try {
    return await tool.run(input ?? {});
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message });
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
export const arg = str;
