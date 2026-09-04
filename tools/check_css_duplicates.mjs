/* ==========================================================================================
   check_css_duplicates.mjs — A CLASS DECLARED TWICE IS A SILENT BUG, AND IT HAS BITTEN TWICE
   ==========================================================================================
   `.rcx-bar` was declared once as the Reconciliation Control Center's statement-picker row and
   again as a 6px share bar. A single-class selector later in the sheet wins, so the header row
   collapsed from 53px to 21px with `overflow:hidden` and took the reporting-lens field and the
   readiness count off screen. No console error, no layout jump, no gate failure — the three
   existing gates check contrast, chrome themes and the spacing scale, and none of them looks at
   whether a name is already taken.

   R6 did it again with `.rcx-hist` (a flex column for Review timeline, redeclared as a table)
   and `.rcx-chain` (the Trace chain, silently re-gapped). Two names, one afternoon.

   THIS IS A RATCHET, NOT A DEMAND FOR ZERO. Sixty-seven single-class base rules are legitimately
   declared more than once — a base plus a themed override, a component plus a dark-mode variant.
   Demanding zero would be red on the first run and switched off by the second. The gate records
   the names that are duplicated TODAY and fails when a NEW one appears, which is exactly the
   case it exists to catch: somebody typing a class name the sheet already holds.

     node tools/check_css_duplicates.mjs              check
     node tools/check_css_duplicates.mjs --baseline   print the current list to paste in
   ========================================================================================== */
import { readFileSync } from 'node:fs';

const FILE = new URL('../index.html', import.meta.url);
const src  = readFileSync(FILE, 'utf8');
const sheet = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));

/* Only SINGLE-CLASS BASE RULES are counted. `.a .b` and `.a.b` are refinements of something
   already declared and are how the design system is meant to be extended; `.a{...}` written
   twice is two components claiming one name. */
const counts = new Map();
sheet.replace(/\/\*[\s\S]*?\*\//g, '').split('}').forEach(block => {
  const i = block.lastIndexOf('{');
  if (i < 0) return;
  block.slice(0, i).split(',').forEach(sel => {
    const s = sel.trim();
    if (/^\.[a-zA-Z][\w-]*$/.test(s)) counts.set(s, (counts.get(s) || 0) + 1);
  });
});
const dup = [...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s).sort();

/* the names that are legitimately declared more than once today */
const BASELINE = new Set(`
.ax-cat-v .brand-lockup .btn-out .btn-primary .card .catmix-val .cc-hero-v .cc-stat-v
.cl-detail .content .copilot .cp-foot .cp-head .cp-lbl .cp-msg-a .cp-scroll .cp-src
.cp-tabs .cp-title .cp-util .cstrip .cstrip-fresh .desc .det-log-r .dt-title .filterbar
.filterbar-caret .filterbar-hd .filterbar-toggle .fr-title .frm-v .fxg-c .fxg-x-m
.fxg-x-t .gltr-hero-d .gltr-hero-v .hst-v .kfh .kpi .kq-r2 .legend .mc .mc-v .memo-hd
.memo-line .menu-btn .narr .np-empty .np-ttl .rail .rail-foot .rcx-changed .rcx-contest
.rcx-ctrl .rcx-mapflag .rcx-od .ribai .ribbon .spark .stat .topbar .trace-chain-h
.trace-title
`.trim().split(/\s+/));

if (process.argv.includes('--baseline')) {
  console.log('duplicate single-class base rules (' + dup.length + '):\n');
  console.log(dup.join(' '));
  process.exit(0);
}

const added   = dup.filter(s => !BASELINE.has(s));
const removed = [...BASELINE].filter(s => !dup.includes(s)).sort();

console.log('css duplicate-class gate — single-class base rules declared more than once\n');
console.log('  in the sheet ' + dup.length + ' (baseline ' + BASELINE.size + ')');
if (removed.length) console.log('  resolved since the baseline: ' + removed.join(' '));

if (added.length) {
  console.log('\nFAIL — ' + added.length + ' class'
    + (added.length === 1 ? '' : 'es') + ' newly declared twice:\n');
  added.forEach(s => console.log('  ' + s + '  x' + counts.get(s)));
  console.log('\nA single-class rule later in the sheet wins outright, so the second');
  console.log('declaration silently replaces the first component’s box. Rename the new one,');
  console.log('or scope it as a descendant/modifier of what is already there.');
  process.exit(1);
}
console.log('\nNo class name is newly claimed by a second component.');
