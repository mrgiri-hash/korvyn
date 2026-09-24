/**
 * DEMO / TEST SCAFFOLD — NOT A PRODUCTION PROVIDER.
 *
 * Runs the full Sloane path in a browser with no credentials and no spend:
 *
 *   browser -> /api/sloane/* -> routes -> AnthropicSloaneAdapter (REAL) -> HTTP -> THIS scripted endpoint
 *
 * The endpoint speaks the Messages API response shape and returns canned structured output for the
 * four Phase 2 demonstration flows. Anything it has no script for comes back at low confidence, so
 * Korvyn's client falls back to its deterministic interpreter — exactly as it would for a real model
 * that is unsure. Narratives are built ONLY from the facts Korvyn sent, plus one deliberately
 * invented figure, so the demo shows grounding rejecting it.
 *
 *   node packages/agent/node_modules/tsx/dist/cli.mjs packages/agent/src/sloane/scripted-demo.ts
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

type J = Record<string, unknown>;
const base = { intent: 'UNDERSTAND', requestedObject: { type: null, id: null, name: null }, operation: 'VIEW', period: null, periodRange: null,
  comparisonPeriod: null, comparisonBasis: null, scope: null, dimensions: [], filters: [], minAbsAmount: null, topN: null, outputPreference: null,
  continuity: 'NEW_INVESTIGATION', needsClarification: false, clarificationFields: [], multiStep: false, confidence: 0.93 };

const INTERPRETATIONS: Record<string, J> = {
  'show monthly income statement jan-apr': { ...base, requestedObject: { type: 'INCOME_STATEMENT', id: null, name: 'Income statement' },
    periodRange: { start: '2026-01', end: '2026-04' }, outputPreference: 'MONTHLY_COLUMNS', continuity: 'NEW_OBJECT', needsClarification: true, clarificationFields: ['scope'], confidence: 0.94 },
  'why did cip increase in june?': { ...base, requestedObject: { type: 'ACCOUNT_GROUP', id: 'line:FS-CIP', name: 'Construction in Progress' }, operation: 'EXPLAIN', period: '2026-06', continuity: 'NEW_OBJECT', confidence: 0.95 },
  'now by vendor': { ...base, requestedObject: { type: 'ACCOUNT_GROUP', id: 'line:FS-CIP', name: 'Construction in Progress' }, operation: 'BREAKDOWN', dimensions: ['vendor'], continuity: 'CONTINUATION', confidence: 0.96 },
  'show the gl': { ...base, requestedObject: { type: 'ACCOUNT_GROUP', id: 'line:FS-CIP', name: 'Construction in Progress' }, operation: 'DRILL', continuity: 'CONTINUATION', confidence: 0.95 },
  'review june close and tell me what needs attention.': { ...base, intent: 'REVIEW', requestedObject: { type: 'CLOSE', id: null, name: 'June close' }, period: '2026-06', continuity: 'NEW_OBJECT', multiStep: true, confidence: 0.92 },
  'show june financials and explain the three largest movements.': { ...base, requestedObject: { type: 'FINANCIAL_STATEMENT', id: null, name: 'Financials' }, operation: 'EXPLAIN', period: '2026-06', topN: 3, continuity: 'NEW_OBJECT', multiStep: true, confidence: 0.93 },
};

const arg = (name: string, value: unknown) => ({ name, value: value == null ? null : String(value), valueType: value == null ? 'null' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : String(value).startsWith('$') ? 'ref' : 'string' });
function planFor(interp: J): J {
  if (interp['intent'] === 'REVIEW') return { rationale: 'Close review: readiness, blockers, untied reconciliations, flux, support.', steps: [
    { tool: 'getCloseReadiness', purpose: 'Where the June close stands', dependsOn: [], args: [arg('period', '2026-06')] },
    { tool: 'getCloseBlockers', purpose: 'What is blocking it', dependsOn: [], args: [arg('period', '2026-06')] },
    { tool: 'getReconciliationSummary', purpose: 'Reconciliations that do not tie', dependsOn: [], args: [arg('period', '2026-06'), arg('untiedOnly', true)] },
    { tool: 'getFluxAnalysis', purpose: 'Largest movements needing explanation', dependsOn: [], args: [arg('period', '2026-06'), arg('top', 5)] },
    { tool: 'getEvidenceReferences', purpose: 'Support behind the largest movement', dependsOn: [3], args: [arg('lineId', '$3.largest.lineId')] },
  ] };
  if (interp['topN'] === 3) return { rationale: 'Financials, rank movements, analyse the top three.', steps: [
    { tool: 'getFinancialSummary', purpose: 'June financials', dependsOn: [], args: [arg('period', '2026-06')] },
    { tool: 'getFluxAnalysis', purpose: 'Rank the movements', dependsOn: [], args: [arg('period', '2026-06'), arg('top', 5)] },
    { tool: 'getAccountAnalysis', purpose: 'Largest movement', dependsOn: [1], args: [arg('lineId', '$1.movers.0.lineId')] },
    { tool: 'getAccountAnalysis', purpose: 'Second largest movement', dependsOn: [1], args: [arg('lineId', '$1.movers.1.lineId')] },
    { tool: 'getAccountAnalysis', purpose: 'Third largest movement', dependsOn: [1], args: [arg('lineId', '$1.movers.2.lineId')] },
  ] };
  return { rationale: 'Single analysis.', steps: [{ tool: 'getCloseReadiness', purpose: 'fallback', dependsOn: [], args: [] }] };
}

function narrativeFor(objects: { objectId: string; type: string; title: string; facts: { key: string; label: string; display: string }[] }[]): J {
  const sentences: J[] = [];
  for (const o of objects) {
    const f = (k: string) => o.facts.find((x) => x.key === `${o.objectId}.${k}`);
    if (o.type === 'AccountAnalysis' && f('change')) sentences.push({ text: `${o.title} moved ${f('change')!.display} in ${f('period')?.display ?? 'the period'}.`, objectIds: [o.objectId], factKeys: [f('change')!.key].concat(f('period') ? [f('period')!.key] : []) });
    if (o.type === 'FluxAnalysis' && f('mover0.name')) sentences.push({ text: `The largest movement was ${f('mover0.name')!.display} at ${f('mover0.change')!.display}.`, objectIds: [o.objectId], factKeys: [f('mover0.name')!.key, f('mover0.change')!.key] });
    if (o.type === 'CloseReadiness' && f('pct')) sentences.push({ text: `The close is ${f('pct')!.display} complete${f('blockers') ? ` with ${f('blockers')!.display} blockers` : ''}.`, objectIds: [o.objectId], factKeys: [f('pct')!.key].concat(f('blockers') ? [f('blockers')!.key] : []) });
    if (o.type === 'ReconciliationSummary' && f('untiedCount')) sentences.push({ text: `${f('untiedCount')!.display} reconciliations do not tie.`, objectIds: [o.objectId], factKeys: [f('untiedCount')!.key] });
  }
  // One deliberately invented figure: Korvyn's grounding must reject this sentence and never render it.
  if (objects[0]) sentences.push({ text: 'Management expects a further $412.0M next month.', objectIds: [objects[0].objectId], factKeys: [] });
  return { sentences: sentences.slice(0, 6) };
}

const provider = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = JSON.parse(body || '{}') as J;
    const system = JSON.stringify(j['system'] ?? '');
    const content = String(((j['messages'] as J[])?.[0] ?? {})['content'] ?? '');
    const data = JSON.parse(content.replace(/^<enterprise_data>\n?/, '').replace(/\n?<\/enterprise_data>$/, '')) as J;
    let out: J;
    if (system.includes('interpretation stage')) {
      out = INTERPRETATIONS[String(data['request']).trim().toLowerCase()] ?? { ...base, confidence: 0.3 };
    } else if (system.includes('planning stage')) {
      out = planFor(data['interpretation'] as J);
    } else {
      out = narrativeFor(data['objects'] as never);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'request-id': 'req_scripted' });
    res.end(JSON.stringify({ id: 'msg_scripted', type: 'message', role: 'assistant', model: 'scripted-demo', stop_reason: 'end_turn', stop_sequence: null, stop_details: null,
      content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 1200, output_tokens: 180, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 } }));
  });
});

provider.listen(0, '127.0.0.1', async () => {
  const port = (provider.address() as AddressInfo).port;
  process.env['ANTHROPIC_BASE_URL'] = `http://127.0.0.1:${port}`;
  process.env['ANTHROPIC_API_KEY'] = 'scripted-demo-not-a-key';
  process.env['SLOANE_LLM_PROVIDER'] = 'anthropic';
  process.env['REVIEW_UI_PATH'] ??= fileURLToPath(new URL('../../../../index.html', import.meta.url));
  console.log(`[sloane] scripted provider on ${port} — DEMO ONLY, no model is called`);
  await import('../server.js');
});
