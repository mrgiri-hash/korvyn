#!/usr/bin/env node
/**
 * CI gate for the chrome theme picker.
 *
 * Fails the build if any shipped theme drops a required pair below WCAG AA, declares a token
 * outside the chrome whitelist, or inverts the framing relationship in dark mode.
 *
 * A picker with nine options where three fail contrast is worse than five that pass, so this
 * runs over the theme DEFINITIONS rather than over a rendered page — it cannot be skipped by
 * not looking at a screen.
 *
 *   node tools/check_chrome_themes.mjs
 *
 * Definitions are extracted from the single-file app rather than duplicated here, so the
 * checker and the product can never disagree about what ships.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'apps', 'dashboard', 'korvyn_dashboard.html'), 'utf8');

const AA = 4.5;
const AAA_LARGE = 3.0;               // non-text / focus indicators
// The dark-mode content surface (--n-0 in the [data-theme="dark"] block). Chrome must stay
// darker than this or the framing relationship inverts. Keep it in step with the token block.
const CONTENT_SURFACE_DARK = '#171A21';

// ---- pull the literals out of the app --------------------------------------------------
function grab(name, open, close) {
  const i = SRC.indexOf(name);
  if (i < 0) throw new Error(`could not find ${name} in korvyn_dashboard.html`);
  const s = SRC.indexOf(open, i);
  let d = 0;
  for (let j = s; j < SRC.length; j++) {
    if (SRC[j] === open) d++;
    else if (SRC[j] === close) { d--; if (!d) return SRC.slice(s, j + 1); }
  }
  throw new Error(`unbalanced literal for ${name}`);
}

const scope = {};
// order matters: the theme table spreads these
for (const [name, open, close] of [
  ['const SEM_ON_DARK', '{', '}'],
  ['const SEM_ON_LIGHT', '{', '}'],
  ['const BADGE_ON_DARK', '{', '}'],
  ['const BADGE_ON_LIGHT', '{', '}'],
  ['const D_', '{', '}'],
  ['const L_', '{', '}'],
  ['const CHROME_WRITABLE', '[', ']'],
  ['const CHROME_KEYMAP', '{', '}'],
  ['const CHROME_THEMES', '[', ']'],
]) {
  const key = name.replace('const ', '');
  const literal = grab(name, open, close);
  // eslint-disable-next-line no-new-func
  scope[key] = new Function(...Object.keys(scope), `return (${literal});`)(...Object.values(scope));
}
const { CHROME_THEMES, CHROME_WRITABLE, CHROME_KEYMAP } = scope;

// ---- colour maths (mirrors the app's cx* helpers) --------------------------------------
const parse = (c) => {
  c = String(c).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) { const n = parseInt(m[1], 16); return [[(n >> 16) & 255, (n >> 8) & 255, n & 255], 1]; }
  m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x.trim())); return [[p[0], p[1], p[2]], p.length > 3 ? p[3] : 1]; }
  throw new Error(`unparseable colour: ${c}`);
};
const over = (fg, bg) => {
  const [f, a] = parse(fg); const [b] = parse(bg);
  return f.map((v, i) => Math.round(v * a + b[i] * (1 - a)));
};
const lum = (rgb) => {
  const s = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const ratio = (a, b) => {
  const la = lum(Array.isArray(a) ? a : parse(a)[0]);
  const lb = lum(Array.isArray(b) ? b : parse(b)[0]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** The pairs that must pass. Badge pairs COMPOSITE the translucent fill over the background —
 *  measuring the raw rgba would flatter the result, and count badges are exactly the pair
 *  that fails in practice. */
const pairsFor = (v) => {
  const badgeBg = over(v.badge, v.bg);
  return [
    ['Sidebar text', ratio(v.tx, v.bg), AA],
    ['Sidebar secondary', ratio(v.tx2, v.bg), AA],
    ['Sidebar mute', ratio(v.tm, v.bg), AA],
    ['Module nav label', ratio(v.tx, v.bg), AA],
    ['Count badge neutral', ratio(parse(v.tx2)[0], badgeBg), AA],
    ['Count badge on-active', ratio(parse(v.tx)[0], over(v.badgeOn, v.bg)), AA],
    ['Count badge muted', ratio(parse(v.tm)[0], over(v.badgeMut, v.bg)), AA],
    // Badges are now a translucent WASH carrying a tinted text, so the pair to measure is
    // that text over the composited fill — not the old solid-fill-with-background-text.
    ['Count badge blocking', ratio(parse(v.bdgT)[0], over(v.bdgF, v.bg)), AA],
    ['Count badge at-risk', ratio(parse(v.bwnT)[0], over(v.bwnF, v.bg)), AA],
    // The on-chrome semantics are still drawn as TEXT on the connection strip and on the
    // rewound-state control, so they have to clear AA against the chrome itself.
    ['Semantic text danger', ratio(v.dg, v.bg), AA],
    ['Semantic text warning', ratio(v.wn, v.bg), AA],
    ['Semantic dot success', ratio(v.sc, v.bg), AAA_LARGE],
    ['Chrome accent', ratio(v.ac, v.bg), AA],
    ['Strip text', ratio(v.tx, v.bg2), AA],
    ['Accent indicator', ratio(v.ac, v.bg), AAA_LARGE],
  ];
};

/** Reported, never gated. Hairline visibility has no WCAG threshold, and the shipped default
 *  sits at 1.19 — inventing a 1.2 bar here would fail the build on an opinion rather than a
 *  standard. Surfaced so a reviewer can see a theme whose borders have gone flat. */
const borderVisibility = (v) => ratio(over(v.bd, v.bg), v.bg);

let failed = 0;
const line = (s) => process.stdout.write(s + '\n');

line('chrome theme gate — WCAG AA over shipped theme definitions\n');

// 1. scope enforcement
for (const t of CHROME_THEMES) {
  for (const mode of ['light', 'dark']) {
    for (const k of Object.keys(t[mode] || {})) {
      const prop = CHROME_KEYMAP[k];
      if (!prop) { line(`FAIL  ${t.id}.${mode}: unknown token key "${k}"`); failed++; }
      else if (!CHROME_WRITABLE.includes(prop)) {
        line(`FAIL  ${t.id}.${mode}: "${k}" -> ${prop} is outside the chrome whitelist`); failed++;
      }
    }
  }
}

// 2. contrast + 3. dark-mode framing
for (const t of CHROME_THEMES) {
  const rows = [];
  let worst = Infinity;
  for (const mode of ['light', 'dark']) {
    for (const [name, r, min] of pairsFor(t[mode] || t.light)) {
      if (min === AA) worst = Math.min(worst, r);
      if (r < min) { rows.push(`      ${mode}: ${name} ${r.toFixed(2)}:1 < ${min}`); failed++; }
    }
  }
  const framingOk = lum(parse(t.dark.bg)[0]) < lum(parse(CONTENT_SURFACE_DARK)[0]);
  if (!framingOk) {
    rows.push(`      dark: chrome ${t.dark.bg} is not darker than the content surface ${CONTENT_SURFACE_DARK}`);
    failed++;
  }
  const bvL = borderVisibility(t.light), bvD = borderVisibility(t.dark);
  line(`${rows.length ? 'FAIL' : 'ok  '}  ${t.id.padEnd(14)} min ${worst.toFixed(2)}:1  framing ${framingOk ? 'ok' : 'INVERTED'}  border ${bvL.toFixed(2)}/${bvD.toFixed(2)}`);
  rows.forEach(line);
}

line('');
if (failed) {
  line(`${failed} failure(s). A picker where some options fail is worse than a shorter list where all pass.`);
  process.exit(1);
}
line(`All ${CHROME_THEMES.length} themes pass AA in both modes, keep chrome scope, and preserve dark framing.`);
