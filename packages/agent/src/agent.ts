import Anthropic from '@anthropic-ai/sdk';
import './tools/index.js';
import { toolDefs, runTool } from './tools/registry.js';

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are Korvyn's finance assistant for the Meridian Global Portfolio close.

You answer from the tools — they read the ingested accounting graph and Korvyn's own workflow state. Hard rules:
- Every figure, account, entity, or source you state must come from a tool result. Never invent numbers or facts.
- If the tools cannot answer, say "not traceable" and name what is missing. Do NOT fall back to general knowledge.
- Cite the account / entity / source for figures. Surface any missing links and the owner who can resolve them, plainly.
- You can DO work, not just answer: create tasks, save evidence, escalate, and move an exception through its lifecycle
  (New → Assigned → Escalated → Cleared → Dismissed) when the user asks or when it clearly follows from the finding. State what you did.
- You NEVER post to the ERP — it is the system of record. If asked to post or "fix" a balance, decline and offer to create a task or escalate instead.
- Be concise. Lead with the answer; keep reasoning brief.`;

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: string; input: unknown }
  | { type: 'done'; sources: string[] };

/**
 * A stateful agent session: multi-turn memory, streaming output, a GA tool-use
 * loop (client.messages.stream), and per-answer provenance (which tools were
 * consulted). Reads ANTHROPIC_API_KEY from the environment.
 */
export class KorvynAgent {
  private readonly client = new Anthropic();
  private readonly tools = toolDefs() as unknown as Anthropic.Tool[];
  private readonly history: Anthropic.MessageParam[] = [];

  async ask(prompt: string, onEvent: (e: AgentEvent) => void): Promise<void> {
    this.history.push({ role: 'user', content: prompt });
    const consulted = new Set<string>();

    for (let step = 0; step < 16; step++) {
      const stream = this.client.messages.stream({
        model: MODEL,
        max_tokens: 8192,
        system: SYSTEM,
        tools: this.tools,
        messages: this.history,
      });
      stream.on('text', (delta) => onEvent({ type: 'text', text: delta }));
      const msg = await stream.finalMessage();

      const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      this.history.push({ role: 'assistant', content: msg.content as Anthropic.ContentBlockParam[] });

      if (msg.stop_reason === 'pause_turn') continue;
      if (toolUses.length === 0) {
        onEvent({ type: 'done', sources: [...consulted] });
        return;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        consulted.add(tu.name);
        onEvent({ type: 'tool', tool: tu.name, input: tu.input });
        const out = await runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>);
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      }
      this.history.push({ role: 'user', content: results });
    }
    onEvent({ type: 'done', sources: [...consulted] });
  }

  reset(): void {
    this.history.length = 0;
  }
}
