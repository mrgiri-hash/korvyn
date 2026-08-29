#!/usr/bin/env node
/**
 * CI gate for CONTENT text contrast.
 *
 * check_chrome_themes.mjs covers the ribbon, rail and close strip — the chrome plane, whose
 * colours come from theme definitions. Nothing covered the CONTENT plane, and that gap was
 * real rather than theoretical: a sweep of all 60 views in both modes found 3,641 text
 * elements below the WCAG AA floor, including the four period labels under the inspect
 * panel's header figures at 2.36:1 and "Korvyn draft — not yet accepted by a preparer" at
 * the same. Every one of them passed the chrome gate the whole time.
 *
 *   node tools/check_text_contrast.mjs
 *
 * Three gates, each aimed at one of the ways that happened:
 *
 *   1. ROLE     a token declared a TEXT role must clear 4.5:1 on every content surface in
 *               BOTH modes. --hint failed this at 4.25:1 on --bg while passing at 4.80:1 on
 *               a white card, so the same label passed inside a card and failed on the page.
 *               A spot check on one surface will never find that.
 *   2. USE      a token declared NOT-A-FOREGROUND must never appear as a `color:` — in CSS
 *               or in a style string built by JS. --faint (and --n-400 named directly) was
 *               the `color:` of 141 rules and 9 JS literals.
 *   3. ON-FILL  text sitting on a saturated semantic fill must clear 4.5:1 on that fill in
 *               both modes. White does in light and fails in dark, where the semantics go
 *               LIGHT — 2.19:1 on the close-timeline segments.
 *
 * Tokens are read out of index.html, never restated here, so the gate and the product cannot
 * disagree about what ships.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');

const AA = 4.5; // text below 18.66px, or below 24px when not bold — i.e. all of this app

// ---- token blocks ----------------------------------------------------------------------
/** The body of the first block opened by `head`, balanced on braces. */
function block(head) {
  const i = SRC.indexOf(head);
  if (i < 0) throw new Error('could not find "' + head + '" in index.html');
  const s = SRC.indexOf('{', i);
  let d = 0;
  for (let j = s; j < SRC.length; j++) {
    if (SRC[j] === '{') d++;
    else if (SRC[j] === '}') { d--; if (!d) return SRC.slice(s + 1, j); }
  }
  throw new Error('unbalanced block for "' + head + '"');
}

/** Declarations only. Comments are stripped first, so a hex quoted inside a note explaining
 *  a past value cannot be mistaken for the value that ships. */
function decls(body) {
  const out = {};
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const LIGHT = decls(block(':root{'));
const DARK = Object.assign({}, LIGHT, decls(block('[data-theme="dark"]{')));

/** Follow var() chains to a literal. Depth-capped so a cycle reports rather than hangs. */
function resolve(map, name, depth) {
  depth = depth || 0;
  if (depth > 12) throw new Error('var() cycle at ' + name);
  const v = map[name];
  if (v === undefined) return null;
  const m = /^var\((--[\w-]+)(?:\s*,.*)?\)$/.exec(v.trim());
  return m ? resolve(map, m[1], depth + 1) : v.trim();
}

// ---- colour maths (same as the chrome gate) ---------------------------------------------
function parse(c) {
  c = String(c).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return Array.from(m[1]).map((h) => parseInt(h + h, 16));
  m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2]]; }
  return null;
}
function lum(rgb) {
  const s = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}
function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function lineOf(i) { return SRC.slice(0, i).split('\n').length; }

// ---- what the tokens are FOR -------------------------------------------------------------
/** Every opaque surface content text lands on. --bg / --n-100 is the darkest of them in
 *  light mode and is exactly where --hint failed, so leaving it out reopens the hole. */
const SURFACES = ['--surface', '--surface2', '--bg', '--bg2', '--n-50', '--n-100'];

/** TEXT — must clear AA on every surface above, in both modes. */
const TEXT = ['--ink-strong', '--ink', '--muted', '--hint'];

/** NOT A FOREGROUND. The ramp's own comment for n-400 is "placeholder, disabled, trailing
 *  glyphs"; it reads 2.36:1 on white and 2.09:1 on --bg — under the 4.5 text floor AND under
 *  the 3.0 non-text floor — so it cannot carry a word, or a mark anyone has to see. */
const NOT_FG = ['--faint', '--n-400'];

/** The two contrast exemptions WCAG actually grants, and nothing else. A placeholder is not
 *  content (the label and the value are) and must read as "nothing typed yet"; a disabled
 *  control must read as unavailable. Tested against the whole declaration. */
const FG_EXEMPT = [/::placeholder/, /\[disabled\]/];

/** Saturated fills that carry text, and the ink that has to sit on them. Listed here because
 *  they are applied from DATA through a style attribute, so no CSS rule states the pairing
 *  and nothing else in the file can be read to discover it. */
const FILLS = ['--warning', '--pos', '--neg', '--accent', '--accent-2'];
const ON_FILL = '--on-fill';

/** Decoration — recorded rather than passing silently. A "·" between two labels and a "›"
 *  between two lifecycle stages carry nothing the layout does not, WCAG exempts decoration,
 *  and making them legible would make them compete with the text they separate. If either
 *  ever carries meaning it leaves this list; it does not gain an exception. */
const DECORATIVE = ['.crumbs .sep', '.sub .sep', '.trace-life-sep', '.rw-meta .sep',
  '.rw-figs .sep', '.ws-from .sep', '.rw-msg .role ~ .at::before'];

// ---- run ----------------------------------------------------------------------------------
let failed = 0;
const out = (s) => process.stdout.write(s + '\n');
out('content text gate — WCAG AA over the tokens and rules that ship\n');

// 1. ROLE
out('1. text tokens on content surfaces');
for (const t of TEXT) {
  const rows = [];
  let worst = Infinity, where = '';
  for (const pair of [['light', LIGHT], ['dark', DARK]]) {
    const mode = pair[0], map = pair[1];
    const fg = parse(resolve(map, t));
    if (!fg) { out('FAIL  ' + t + ' does not resolve in ' + mode); failed++; continue; }
    for (const s of SURFACES) {
      const bg = parse(resolve(map, s));
      if (!bg) continue;
      const r = ratio(fg, bg);
      if (r < worst) { worst = r; where = mode + ' on ' + s; }
      if (r < AA) { rows.push('      ' + mode + ': ' + t + ' on ' + s + ' = ' + r.toFixed(2) + ':1 < ' + AA); failed++; }
    }
  }
  out((rows.length ? 'FAIL' : 'ok  ') + '  ' + t.padEnd(14) + ' worst ' + worst.toFixed(2) + ':1  (' + where + ')');
  rows.forEach(out);
}

// 2. USE
out('\n2. non-foreground tokens used as a colour');
for (const t of NOT_FG) {
  const bad = [];
  for (const m of SRC.matchAll(new RegExp('color:\\s*var\\(' + t + '\\)', 'g'))) {
    const from = SRC.lastIndexOf('\n', m.index) + 1;
    let to = SRC.indexOf('\n', m.index); if (to < 0) to = SRC.length;
    const decl = SRC.slice(from, to);
    if (!FG_EXEMPT.some((re) => re.test(decl))) {
      bad.push('      line ' + lineOf(m.index) + ': ' + decl.trim().slice(0, 84));
    }
  }
  // style strings assembled in JS — how one rule kept --faint after every CSS rule had
  // been moved off it, and the only reason the DOM sweep still found "Not applicable"
  for (const m of SRC.matchAll(new RegExp('[\'"`]var\\(' + t + '\\)[\'"`]', 'g'))) {
    bad.push('      line ' + lineOf(m.index) + ': JS literal ' + m[0]);
  }
  out((bad.length ? 'FAIL' : 'ok  ') + '  ' + t.padEnd(14) + ' ' + bad.length + ' foreground use(s)');
  bad.slice(0, 12).forEach(out);
  if (bad.length > 12) out('      … and ' + (bad.length - 12) + ' more');
  failed += bad.length;
}

// 3. ON-FILL
out('\n3. text on saturated semantic fills');
for (const pair of [['light', LIGHT], ['dark', DARK]]) {
  const mode = pair[0], map = pair[1];
  const ink = parse(resolve(map, ON_FILL));
  if (!ink) { out('FAIL  ' + ON_FILL + ' does not resolve in ' + mode); failed++; continue; }
  const rows = [];
  let worst = Infinity;
  for (const f of FILLS) {
    const bg = parse(resolve(map, f));
    if (!bg) continue;
    const r = ratio(ink, bg);
    worst = Math.min(worst, r);
    if (r < AA) { rows.push('      ' + mode + ': ' + ON_FILL + ' on ' + f + ' = ' + r.toFixed(2) + ':1 < ' + AA); failed++; }
  }
  out((rows.length ? 'FAIL' : 'ok  ') + '  ' + mode.padEnd(14) + ' worst ' + worst.toFixed(2) + ':1');
  rows.forEach(out);
}

out('\n(' + DECORATIVE.length + ' separator rules are classified decoration and not gated — see DECORATIVE)');
out('');
if (failed) {
  out(failed + ' failure(s). A label nobody can read is not a quiet label, it is a missing one.');
  process.exit(1);
}
out('Content text clears AA on every surface in both modes; no non-foreground token carries a colour.');
