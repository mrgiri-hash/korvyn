/**
 * Exercises the whole tool layer WITHOUT calling the API — proves reads, actions,
 * the lifecycle, and the no-post guardrail before you spend a token. Run: npm run dryrun
 */
import './tools/index.js';
import { toolDefs, runTool } from './tools/registry.js';

async function main(): Promise<void> {
  console.log('registered tools:', toolDefs().map((t) => t.name).join(', '), '\n');

  const cases: Array<[string, Record<string, unknown>]> = [
    // reads
    ['trace', { subject: '13500' }],
    ['explain_variance', { account: '21000' }],
    ['list_detections', {}],
    ['reconciliation_status', {}],
    ['close_status', {}],
    ['intercompany_status', {}],
    ['financial_statement', { statement: 'income_statement' }],
    ['get_policy', { query: 'capitalization' }],
    // actions (answers become work)
    ['create_task', { title: 'Chase Property Co counterparty confirmation', owner: 'M. Giri', due: 'Jul 10' }],
    ['escalate', { exceptionId: 'TX-DET-ICNM', to: 'A. Okafor', reason: '104 days old' }],
    ['set_exception_state', { exceptionId: 'TX-RECON-13500-HOLD', state: 'Assigned', by: 'A. Okafor' }],
    // the lifecycle change should now be reflected here
    ['list_detections', { includeFinancial: true }],
    // guardrail: must refuse
    ['post_to_ledger', { entry: 'Dr 13500 2,300,000 / Cr eliminations' }],
    // the append-only record of what was done
    ['audit_log', {}],
  ];

  for (const [name, input] of cases) {
    const out = await runTool(name, input);
    console.log(`# ${name}(${JSON.stringify(input)})`);
    console.log(out.length > 520 ? out.slice(0, 520) + ' …' : out, '\n');
  }
}

void main();
