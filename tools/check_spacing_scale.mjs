#!/usr/bin/env node
/**
 * RATCHET GATE for the 4px spacing scale.
 *
 * The design system declares --s-1 … --s-12 on a 4px scale, and index.html carries 1,051
 * padding/margin/gap declarations that are not on it (6px ×159, 9px ×125, 10px ×123 …).
 * That is a real inconsistency and it is ALSO not worth a sweep: ~800 rules, each needing a
 * round-up-or-down judgement, changing the look for a diminishing return and a real chance
 * of regression.
 *
 * So this gate does not demand zero. It records what is there today and fails if it grows —
 * new code lands on the scale, old code converges when a rule is touched for other reasons,
 * and the number only ever goes down.
 *
 *   node tools/check_spacing_scale.mjs
 *
 * PER VALUE, not a single total, so 10 fewer 7px cannot pay for 10 more 13px. And a value
 * that does not appear in the baseline at all fails on sight — that is the actual case this
 * exists to catch, someone typing `padding:15px` into a new rule.
 *
 * CSS and template literals are counted SEPARATELY. Inline styles built in JS are the same
 * mistake in a place a stylesheet linter would never look, and lumping them together would
 * let one budget hide inside the other.
 *
 * WHEN A COUNT DROPS, lower the baseline in the same commit. The gate prints the exact line
 * to paste. Leaving it high re-opens the room you just closed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** Recorded 2026-08-29 with `node tools/check_spacing_scale.mjs --baseline`.
 *  Lower these when a count drops; never raise them. */
const BASELINE = {
  css: { 1: 64, 2: 117, 3: 69, 5: 76, 6: 162, 7: 115, 9: 131, 10: 127, 11: 48, 13: 22,
    14: 86, 15: 14, 17: 5, 18: 25, 22: 3, 26: 9, 30: 2, 34: 1, 50: 1, 70: 1, 114: 1 },
  inline: { 2: 5, 3: 10, 5: 7, 6: 25, 7: 4, 9: 6, 10: 13, 11: 3, 13: 1, 14: 7, 18: 8 },
};

const STEP = 4;
const PROPS = 'padding|margin|gap|row-gap|column-gap'
  + '|padding-(?:top|right|bottom|left)|margin-(?:top|right|bottom|left)';

/** Strip var() and calc() sub-expressions, innermost first, so what is left is the literals
 *  the rule actually hard-codes. Removing the WHOLE declaration when it mentions var() was
 *  the first cut and it was wrong: `padding:2px var(--s-2)` is exactly the half-tokenised
 *  value this gate exists to notice, and it went uncounted. A value that is entirely tokens
 *  reduces to nothing and counts nothing, which is the intended outcome. */
function stripDerived(value) {
  let v = value, prev;
  do {
    prev = v;
    v = v.replace(/\b(?:var|calc|clamp|min|max)\(([^()]*)\)/g, ' ');
  } while (v !== prev);
  return v;
}

/** Count off-scale px literals in spacing declarations. */
function scan(text) {
  const out = {};
  const re = new RegExp(`(^|[;{\\s])(${PROPS})\\s*:\\s*([^;}]+)`, 'g');
  let m;
  while ((m = re.exec(text))) {
    for (const tok of stripDerived(m[3]).match(/-?\d+(?:\.\d+)?px/g) || []) {
      const n = Math.abs(parseFloat(tok));
      if (n === 0 || n % STEP === 0) continue;
      out[n] = (out[n] || 0) + 1;
    }
  }
  return out;
}

const styleOpen = SRC.indexOf('<style>');
const styleClose = SRC.indexOf('</style>', styleOpen);
if (styleOpen < 0 || styleClose < 0) throw new Error('could not locate the <style> block in index.html');
// comments stripped so a px quoted inside a note explaining a past value is not counted
const CSS = SRC.slice(styleOpen, styleClose).replace(/\/\*[\s\S]*?\*\//g, '');
const INLINE = SRC.slice(styleClose);

const found = { css: scan(CSS), inline: scan(INLINE) };

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const out = (s) => process.stdout.write(s + '\n');
const fmt = (o) => '{ ' + Object.keys(o).map(Number).sort((a, b) => a - b)
  .map((k) => `${k}: ${o[k]}`).join(', ') + ' }';

/** `--baseline` prints what the file contains right now, ready to paste into BASELINE.
 *  Recomputing it by hand in a throwaway script is how you get a wrong baseline — this
 *  reads through the same scanner the gate uses, so the two can never disagree. */
if (process.argv.includes('--baseline')) {
  out('const BASELINE = {');
  out(`  css: ${fmt(found.css)},`);
  out(`  inline: ${fmt(found.inline)},`);
  out('};');
  process.exit(0);
}

let failed = 0;
const lowered = {};

out('spacing scale gate — off-4px padding/margin/gap, ratcheted\n');

for (const zone of ['css', 'inline']) {
  const base = BASELINE[zone], now = found[zone];
  const rows = [];
  for (const k of Object.keys(now).map(Number).sort((a, b) => a - b)) {
    const was = base[k] || 0, is = now[k];
    if (is > was) {
      rows.push(was === 0
        ? `      NEW  ${k}px ×${is} — not in the baseline at all`
        : `      UP   ${k}px ${was} -> ${is}`);
      failed += is - was;
    } else if (is < was) {
      lowered[zone] = lowered[zone] || {};
      lowered[zone][k] = is;
    }
  }
  for (const k of Object.keys(base).map(Number)) {
    if (!(k in now) && base[k] > 0) { lowered[zone] = lowered[zone] || {}; lowered[zone][k] = 0; }
  }
  const total = sum(now), baseTotal = sum(base);
  out(`${rows.length ? 'FAIL' : 'ok  '}  ${zone.padEnd(7)} ${total} off-scale (baseline ${baseTotal}${
    total < baseTotal ? `, down ${baseTotal - total}` : ''})`);
  rows.forEach(out);
}

if (Object.keys(lowered).length) {
  out('\nsome counts dropped — lower the baseline in this commit:');
  for (const zone of Object.keys(lowered)) {
    const merged = { ...BASELINE[zone], ...lowered[zone] };
    const body = Object.keys(merged).map(Number).sort((a, b) => a - b)
      .filter((k) => merged[k] > 0).map((k) => `${k}: ${merged[k]}`).join(', ');
    out(`  ${zone}: { ${body} },`);
  }
}

out('');
if (failed) {
  out(`${failed} new off-scale value(s). Spacing comes from --s-1 … --s-12; if a rule needs`);
  out('something between them, derive it with calc() on a token so it stays on the scale.');
  process.exit(1);
}
out(`On-scale or better: css ${sum(found.css)}, inline ${sum(found.inline)} — neither grew.`);
