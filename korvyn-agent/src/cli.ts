import 'dotenv/config';
import * as readline from 'node:readline';
import { KorvynAgent, type AgentEvent } from './agent.js';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const compact = (x: unknown): string => {
  const s = JSON.stringify(x);
  return s.length > 88 ? s.slice(0, 85) + '…' : s;
};

function handle(e: AgentEvent): void {
  if (e.type === 'text') process.stdout.write(e.text);
  else if (e.type === 'tool') process.stderr.write('\n' + dim(`  › ${e.tool}(${compact(e.input)})`));
  else if (e.type === 'done') {
    process.stdout.write('\n');
    if (e.sources.length) process.stderr.write(dim(`  ⌊ grounded in: ${e.sources.join(', ')}`) + '\n');
  }
}

async function main(): Promise<void> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key, or `export ANTHROPIC_API_KEY=...`.');
    process.exit(1);
  }

  const agent = new KorvynAgent();
  const oneShot = process.argv.slice(2).join(' ').trim();
  if (oneShot) {
    process.stdout.write('\n');
    await agent.ask(oneShot, handle);
    return;
  }

  console.log('Korvyn agent · claude-opus-4-8 · streaming · multi-turn');
  console.log(dim('reads: trace · explain_variance · list_detections · reconciliation_status · close_status · intercompany_status · financial_statement · get_policy · list_entities'));
  console.log(dim('acts:  create_task · save_evidence · escalate · set_exception_state · audit_log   (never posts to the ledger)'));
  console.log('Ask anything — it remembers the conversation. Ctrl-C to exit.');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '\nyou › ' });
  rl.prompt();
  rl.on('line', (line) => {
    const q = line.trim();
    if (!q) {
      rl.prompt();
      return;
    }
    process.stdout.write('\n');
    agent
      .ask(q, handle)
      .catch((err: unknown) => console.error('\nerror:', (err as Error).message))
      .finally(() => rl.prompt());
  });
  rl.on('close', () => process.exit(0));
}

void main();
