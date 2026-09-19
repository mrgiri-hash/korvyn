# CLAUDE.md — Korvyn monorepo

Orienting guidance for the whole repo. **Working detail lives in a `CLAUDE.md` next to the code** —
Claude Code auto-loads the one for whatever subtree you're editing. Read that one before you edit
there; this file is the map and the shared rules.

> **`index.html` at the repo root is the main project file** (owner's direction, 2026-08-14). It is
> the product. Everything under `apps/` is now a predecessor kept for reference — read from them,
> edit them only if asked by name.

> **THE LIVE BRANCH IS `design/ui-overhaul-phase1`, NOT `main`.** Check with `git branch --show-current`
> before you read a line of `index.html`. `main` is seven commits behind and does not have the UI
> overhaul: no inspect-panel hierarchy, no mono figures, no materiality impact filter. The two
> branches render a visibly different Flux surface from an `index.html` of nearly identical size,
> so **a file that looks plausible is not evidence you are on the right branch** — and neither is a
> clean `git status`, which is equally clean on both.
>
> This is written down because it has already cost real work. On 2026-08-30 a session opened just
> after a `checkout` from this branch to `main`, read `main`'s `index.html`, found it byte-identical
> to `HEAD`, and concluded on that basis that nothing was missing — while the owner was looking at a
> screen this branch renders and `main` cannot. **When the file disagrees with what the owner
> describes, suspect the branch before you suspect the file.** Nothing was lost (the work was
> committed and pushed here), but the reflog was the thing that should have been read first.

| You're working in… | Read |
|---|---|
| **`index.html` — THE main file** | this document, then the file's own token/system comments |
| the merge — which app survives, and why it changed | [`apps/CONVERGENCE.md`](apps/CONVERGENCE.md) (plan + decisions) |
| `apps/review/` — superseded 2026-08-14; still holds the live GL engine | [`apps/review/CLAUDE.md`](apps/review/CLAUDE.md) |
| `apps/dashboard/` — the prototype `index.html` descends from | [`apps/dashboard/CLAUDE.md`](apps/dashboard/CLAUDE.md) |
| `packages/core/` — the domain model | [`packages/core/CLAUDE.md`](packages/core/CLAUDE.md) · [README](packages/core/README.md) |
| `packages/agent/` — the LLM agent | [`packages/agent/CLAUDE.md`](packages/agent/CLAUDE.md) · [README](packages/agent/README.md) |
| any UI | the token layer at the top of [`index.html`](index.html), then [`design-system/design-system.md`](design-system/design-system.md) (written record) |

## Editors and AI tooling

**This file and its four subtree siblings are the SOLE source of truth.** There is no mirror to
keep in step, and none should be recreated unless the owner asks for one.

**The `.cursor/rules/` mirror was retired 2026-09-02** (owner: Cursor is no longer in use). It
was six scoped `.mdc` files restating these documents for an editor that cannot read them, and
it carried no unique authority — `project.mdc`'s own opening said so: *"These rules are a
summary, not the authority. When they and a `CLAUDE.md` disagree, the `CLAUDE.md` wins."* So
nothing was lost with it, and the standing cost of the arrangement went too: every rule change
had to be made twice, and a mirror that drifted was worse than no mirror because each editor
then enforced a different repo. The files are in git history if a future editor ever needs the
same treatment.

## UI / Design System — read before any UI work

**The system is the token layer at the top of `index.html`** (`:root`, ~line 20 onward), called
**"Instrument"**: structured monochrome slate, one accent, engineered numerics, light + dark.
It is heavily self-documenting — the comments there explain *why* each value is what it is, and they
are the authority. Read them before editing any screen.

**Scope note (2026-08-14).** This replaces the **gold/teal/navy** system that this block used to
describe. That system, its `--k-*` tokens in
[`design-system/design-tokens.css`](design-system/design-tokens.css), and its "no blue accents" /
"teal for positive" rulings are **withdrawn** — they described `apps/review/`, which is no longer the
main file. `design-system/design-system.md` is kept as the dated record of how the system got here;
where it and `index.html` disagree, **the file wins** and the doc gets a new dated block.

**Non-negotiable rules**
1. **The ramp is the palette.** Twelve neutral steps (`--n-0` … `--n-900`) carry the whole
   instrument. If a new hue seems necessary, the answer is a different ramp step.
2. **ONE accent: cobalt `--accent` `#2F62D4`**, and it carries interaction. `--accent-2` (teal-slate)
   is admitted for the "incurred/actual" measure alone. Indigo `--ai` is reserved for AI surfaces
   (Ask Korvyn, Insight, generated recommendations) and must never become a second UI accent.
3. **Red / amber / green are STATE ONLY** — never decoration, never a series colour. Series step
   through the ramp into the accent (`--series-1` … `--series-4`).
4. **Two planes, named by role, not lightness:** content (the ramp) and chrome (`--chrome-*`).
   Chrome is a true *neutral*, never blue-tinted; header and sidebar share one base and separate by
   a hairline, never by lightness. Chrome themes are gated by `tools/check_chrome_themes.mjs`.
5. **Separation is lightness and hairlines, never shadow.** Shadow is reserved for true overlays —
   popovers, menus, modals, drawers. Cards, panels, tables and strips are flat.
6. **Six type sizes and only these six** (`--fs-label` … `--fs-page`). `--fs-micro` is for counts and
   badge numerals that carry no sentence, never prose. `--fs-hero` has exactly one caller.
7. **TWO font weights: 400 and 500.** The 11px uppercase label is a treatment of size, tracking and
   colour — not weight. Spacing is the 4px scale (`--s-1` … `--s-12`).
8. Severity is a 3px left border and nothing else — never a dot, never a pill, never both.
   Provenance dots are the one element allowed semantic colour at rest, and only when stale or
   unreachable, so a healthy screen stays monochrome.

**Rules carried forward unchanged from the previous system** (they are about structure, not colour,
and still hold)
9. On any data table, colour AT MOST two columns — the primary variance and its direction. Gray all
   supporting columns (Organic, FX, CTA, NCI).
10. Subtotal rows outrank detail rows. Never equal weight.
11. One card per screen REGION, not per table or row. Tables use row hairlines, never card borders or
    per-cell borders. No box-in-box.
12. Badges mean "action required from the user," not "count of items." Inventory counts render as
    quiet gray text.
13. One filled primary button per screen. All others outline.
14. All money, dates, IDs, deltas: monospace, tabular-nums, right-aligned. Chrome uses Inter.
    Never blend them.
15. Every table and form ships with empty, loading, error, hover, and visible keyboard-focus states —
    not just the happy path.

**Consolidation-scale screens (600+ entities)**
16. The roll-up tree is a status instrument: every node shows its own completion (mini-bar + fraction)
    AND an exception count rolled up from everything beneath it.
17. Tables default to exceptions + material movements only ("5 of 214 lines"); full detail sits
    behind a filter chip.
18. Multi-currency/elim/NCI data lives behind column-set toggles (Local / Reporting / FX-CTA /
    Eliminations / NCI split), never one wide table.

**Before calling any screen done:** run `node tools/check_chrome_themes.mjs` if chrome was touched,
and report which of the rules above the screen passes. Never introduce a colour, font size, weight or
spacing value that is not already a token in `index.html`.

## What's in the repo

```
Korvyn/
├─ index.html                 ← THE MAIN FILE. Single self-contained page, ~24k lines,
│                               ~60 views, the "Instrument" system. Open it in a browser.
├─ apps/                      predecessors, kept for reference (single-file HTML, no build)
│   ├─ dashboard/             korvyn_dashboard.html — what index.html grew out of
│   └─ review/                the Financial Review Platform — superseded 2026-08-14,
│       ├─ index.html           but still the only home of the live GL engine
│       └─ mocks/             design explorations, reference only
├─ packages/                  real TypeScript libraries
│   ├─ core/                  canonical GAAP domain model + ERP integration boundary
│   └─ agent/                 server-side LLM agent over the domain (tools, approvals)
├─ design-system/             dated written record of how the UI system got here
├─ assets/                    brand (logo)
├─ tools/                     repo-wide tooling (check_chrome_themes.mjs)
└─ archive/                   superseded snapshots (git-ignored)
```

`index.html` and `apps/` are prototypes; `packages/` are the real code. They share **no runtime
code**. The one bridge is build-time and one-directional: `packages/core/tools/emit_enterprise_gl.mjs`
serialises a validated GL snapshot into `index.html`'s `<script id="egl-data">` (data, not an
import). It is read by exactly one view, `view-egl`.

**Product thesis (keep edits in this lane):** own the construction-in-progress → placed-in-service
(CIP → PIS) determination-and-defense layer — the ASC 360 / 835-20 capitalization judgment between
project-cost systems and the GL. Deliberate non-scope: not a Workiva replacement (no XBRL/EDGAR/MD&A),
not enterprise planning.

## Shared conventions (apply everywhere)

- **The ERP is the system of record.** Korvyn reads it and adds visibility, workflow, controls,
  close, reconciliation, analytics and AI. **Never build journal-entry creation, approval, or
  posting.** (The core *models* journal entries because validating/reconciling them requires
  representing them faithfully — that is not posting.)
- **Numbers derive, never duplicate.** If a figure appears in two places, derive it once. Never scale
  sample data into a headline (see the `RECON_SCALE` cautionary tale in the dashboard CLAUDE.md).
- **No dead controls.** If an affordance can't act, don't add it.
- **AI narrates, never computes a number** — every figure comes from an engine/tool; the AI layer
  only explains and cites.
- **The main file stays single-file** (`index.html`, and likewise `apps/*`): no build step, no
  external runtime dependencies. It is ~2 MB — read the region you need, never the whole file.
- **Work incrementally.** Never rebuild or redesign an existing page unless asked.

## 2026-08-25 — Flux inspect panel: four modes and the in-review freeze

> **Partly superseded 2026-08-29** — the hero and the contribution-bar drivers are
> gone; see *the inspect panel takes the reference's shape* below. The four MODES,
> the freeze rule and the part registry still govern.


The docked inspect panel (`#fxDetail` in `index.html`) composes itself to the line
through `dwModeOf` / `dwOverviewKeys`. `RW_LAYOUT.drawer.sum` is the material-line
default those keys return — not the only Overview. Do not restore a single
composition for every line.

| Mode | When | What the panel does |
|---|---|---|
| **inspect** | `!r.req`, not submitted/approved | Reads. Drivers lead; a quiet `explainCue` if nothing is on the line; no footer. |
| **explain** | `r.req`, draft/returned | The explanation is the subject and owns Save/Accept. Footer is Submit only once coverage clears. |
| **review** | `rc.status==='submitted'` | Reports. Footer is Return / Mark reviewed, gated by `canReviewLine`. |
| **locked** | `rc.status==='approved'` | Reports. No Needs attention. Footer is Reopen (Controller/CAO) or a quiet “Controller or CAO to reopen”. |

**Overview carries a common tail (2026-08-25, later).** Below the mode-specific
parts, every mode's Overview now ends with three summaries — **Workflow & review**,
**Evidence**, **Comments** — mirroring the reference (`apps/review/`) inspector's
fuller Overview. Each is a collapsed block: its count and a chevron through to its
own tab, never a second copy of that tab. Comments shows the last message *inside*
the same block (`.rw-peekwrap`); Evidence shows its count and expected-gaps.
`dwOverviewKeys` appends `['reviewer','evidRow','cmtPeek']` to each mode's keys.
The full page composes these from `RW_LAYOUT.page` in its three columns. Both
densities now read as a **light dashboard** (owner's direction, 2026-08-25): the
drawer is a stack of white hairline blocks on a soft-gray (`--bg2`) body; the full
page is a white header band over a gray body with the three argument columns
floating as elevated white cards. Depth is lightness plus a soft shadow, never the
heavy overlay shadow — this deliberately relaxes the old "one card, hairlines
inside, no shadow" ruling for this panel. The drawer-specific block CSS stays
scoped `:not(.dw-page)` and the page card CSS is scoped `.dw-page`, so the two
treatments never leak into each other. Two touches of colour, both over facts already stated: the
Review-owner row carries an initials avatar (`rwInitials`) beside the spelt-out
name, and the Explanation header carries a **derived** classification pill —
Routine (below materiality) · Material · explained (accepted and within tolerance) ·
Needs review (otherwise; a Korvyn draft is not acceptance). It is never typed.

**Freeze rule.** Submitted reads exactly like locked in the explanation card
(`canPrep = !lock && !frozen && caps().prepare`). A preparer must not rewrite the
words a reviewer is reading — the sign-off would attach to text nobody reviewed.
The way back is the reviewer’s Return, a recorded transition. Name the freeze
rather than silently dropping Edit.

The header leads with a **hero variance** (owner's direction, 2026-08-25 — "push
the visual language"): the movement is the subject of a flux review, so it is the
big signed figure with a direction glyph and its Δ%, over a quiet `prior → current`
balance flow with the period labels. `.rw-hero` replaced the four-equal-cell grid,
which replaced a 2×2 hero+mute grid before it — the figure is one step larger on
the full page. Colour lands only on the variance (rules 2/3). Key drivers render as
a **contribution visualization** — each driver's share of the movement as a bar,
carrying the same up/down the value does — so the shape of the variance reads at a
glance instead of being decoded from three percentages. The hero also carries a
**trailing-period sparkline** (`dwHeroSpark`, accent — a trend is a series, not a
state), and the review-state block a **coverage bar**: the explained share as a
fill with a tick at the coverage the tolerance demands, so "past the tick" reads as
signable. Every one is derived from the same `dwCtx` figures the text states.

No seeded line starts submitted or approved. Locked is reachable only by walking
a line through the workflow. `CMT` is in-memory; a reload restores the book.

## 2026-08-26 — the left rail moved to the content plane (amends design rule 4)

The left rail (`.rail` / `#railNav`) was dark chrome, sharing the ribbon's base so
the two read as one "midnight L". At the owner's direction it now sits on the
**content plane** — a **light rail** in light mode (white surface, cobalt active
state), following the theme (dark in dark mode), while the **ribbon stays dark
chrome**. Reasoning: a close tool is used all day, a light rail is calmer and the
familiar finance-software pattern, and the ribbon's dense status still reads best on
dark. This **amends design-system rule 4** ("header and sidebar share one base,
separate by a hairline, never by lightness") for the sidebar only — header and rail
now differ by plane by intent. Implementation: the `.railrole`/`.railkid`/`.rbadge`
classes are shared with the dark ribbon nav, so the light treatment is added as
`.rail`-scoped overrides onto content tokens (`--surface`, `--ink`, `--accent-bg`,
`--accent-ink`, `--accent`), never by editing the shared base. Every pairing is AA.

## 2026-08-28 — Flux filters moved inline (the drawer is gone on Flux)

At the owner's direction, Flux analysis no longer uses the shared collapsible
`#filterbar` drawer. Every filter it held is now a **persistent inline field row**
(`fxFilterFields()` → `.fx-fields` inside `#fxRoot`), directly under the period
navigator — the Zendesk Support reporting pattern. `paintTopbar()` hides
`.filterbar` when `fxHere`; **every other page keeps the drawer unchanged**.

**ONE TAB ARCHITECTURE — the whole command surface** (`FX_FTABS`, `fxFTab`,
`setFilterTab()`). Eight tabs over ONE contextual row, each named for the question
it answers. A tab marked `cfg:1` configures rather than filters and never carries
a count:

| Tab | The question it answers | Row |
|---|---|---|
| **Period** | when, against what | Period · Compare · Cadence |
| **Scope** | which part of the enterprise | Entity · Segment · Region · More · Find |
| **Workflow** | what needs action | Status · Explained · Reason code |
| **Variance** | what kind of movement | Materiality · Direction · Movement over |
| **Basis** | how figures are stated | Eliminations · Units |
| **Display** `cfg` | how to view it | Mode · Table |
| **Saved Views** `cfg` | which saved configuration | View · ☆ · Save current… |
| **Actions** `cfg` | what to perform | Requests · Audit log · Export · Memo · Print |

**There is no second toolbar and there must not be one.** The old
`Review|Financials|Narrative · Table · ☆ · Views · •••` strip is gone as a
standalone object: `pageActions()` and `viewControls()` are retired, Display owns
the mode and the Table menu, Saved Views owns the star and the Views menu, Actions
owns the ellipsis. Placements already tried and rejected: a row above the tabs (the
row this design removed), a row below the fields (still a second toolbar), and the
shell topbar (squeezes `#tbScope` and wraps the title).

**Naming is deliberate.** The filter family is **Workflow**, not "Review" — Review
is also a display mode, and one word cannot name two unrelated controls on one
surface. **Variance**, not "Movement" — the page is a variance analysis.

**Submit is the one CTA, and it appears only when it can act** (2026-08-28). It used
to render unconditionally, so the loudest control on the page — the only filled
cobalt button — spent most of the close inert, answering a click with "Nothing is
ready to submit". That is the "no dead controls" rule, and a permanent primary
button that usually does nothing also teaches the preparer to stop reading it. It
now renders only when lines are ready and states the count: **"Submit 3 ready
lines"**.

**The count and the action share one predicate** (`readyToSubmit()`), so a button
reading "Submit 3" can never submit two or five. Verified end to end: claimed 1,
submitted 1, then removed itself.

**Two submits, two right places — do not merge them.** `submitAll()` acts on every
ready line in the current view, so it belongs on the STATEMENT: a bulk action
launched from inside one line's working paper would submit lines the reviewer cannot
see. The per-line Submit already lives in the review panel's footer (`exSubmit`),
gated on coverage and stating *why* when it is withheld.

**Progressive disclosure at enterprise scale.** Entity · Segment · Region lead the
Scope row because they are the cuts a group controller actually makes; Property and
Cost center sit behind **More** (`FX_MOREDIMS`), which opens the same standard
popover. A dimension behind More still counts against the Scope tab — a filter does
not stop existing because it is one level deeper. Country, fund, HoldCo, project,
ERP source and ownership join `FX_MOREDIMS` as the model carries them.

**The review panel is a full-height dock** (owner's direction, 2026-08-28), running
the same band as the Korvyn assistant — top ≈ 94px to the foot of the viewport,
854px against the assistant's 874px. It used to open at y≈365 on a 960px viewport,
so the working paper lived in the bottom 60% of the screen.

The mechanism is still **geometry, not z-index**: `sizeDrawer()` pins the panel
below whatever still occupies its column, so the fix is to make the full-width rows
yield that column, never to raise the panel over live controls. Two insets, because
there are two containers — rows inside `#fxRoot` (`.fx-work`, `.fx-focusline`) take
`--fx-dw-w + 12px`; shell rows above it (`.topbar`, `.secnav`, `.subnav`) sit in a
wider box and take `+48px`. Both are **declared, not measured**: computing them in
`sizeDrawer()` from the drawer's own left edge is a feedback loop — the inset moves
the layout the next pass measures, and the panel walks off the bottom of the screen
(observed). Two traps worth knowing: `body.fx-mercury #fxRoot .fx-work` sets a
`margin` shorthand later in the sheet that silently zeroes an earlier reservation
(hence the `#fxRoot.aw` specificity), and the tab strip must be `white-space:nowrap`
+ `overflow-x:auto` — with the panel open the bar loses ~450px and "Saved Views"
broke onto a second line. The insets clear on close and are disarmed in
`S.dwPage` mode; verified untouched on GL overview, Trial balance, Consolidation
and Overview.

**Full screen takes the screen, and its tabs SWAP** (owner's direction, 2026-08-28).
This reverses "PAGE MODE NAVIGATION IS A SCROLL, NOT A SWAP": every region used to
be mounted at once as one ~2,400px document with the tab bar jumping between them,
so a tab told you where you were rather than what you were looking at. Full screen
now shows the active tab's content — Overview keeps the three-column argument
(judge · comp · rec), which is what the full page is *for*; every other tab is its
parts in one wide column, read from **the drawer's own registry** (`RW_LAYOUT.drawer`
via `dwPageCols()`), so a part added to a drawer tab appears on the full screen
automatically and an unknown tab falls back to Overview rather than rendering blank.
`FX_PAGETABS` uses the drawer's tab ids so one vocabulary drives both densities.
The scroll spy is gone with the scrolling index — it would have fought the
reviewer's tab choice on the first scroll; only its `scrolled` shadow survives.

The page chrome stands down with the statement it describes: `.fx-filters`,
`.fx-work`, `.topbar`, `.secnav`, `.subnav` all hide under `body.fx-dw-page`, so
the paper opens at y≈117 (88% of a 960px viewport) instead of y≈363 (62%). Two
traps: `paintSubnav()` writes `style.display='flex'` **inline**, so hiding the
statement tabs needs `!important`; and `S.dwPage` survives navigation while
`sizeDrawer()` runs from a resize observer on every page — the body class must be
toggled on `#fxRoot.offsetParent!==null`, or the topbar stays hidden on the General
Ledger and the Trial balance (observed). The sheet is framed with `--rule-strong`,
not `--rule`: the docked panel gets its edge from white-on-gray lightness, but the
full-screen sheet keeps the gray body, so its border does the separating alone.

**The full-screen header is a two-column grid** (237px → ~160px). The identity and
the movement share the left column; the review state owns the right for both rows,
so the two facts a reviewer scans — what moved, and whether it is signable — sit
side by side instead of leaving a wide hole beside a 2-line name opposite a 4-line
verdict. `display:contents` on `.rw-idrow` is what makes it CSS-only: `.rw-id`,
`.rw-state` and `.rw-hact` are its children, not the header's, and cannot be placed
in the header's grid until the wrapper stops generating a box. **The window
controls share the return strip's cell** (`grid-area:from` + `justify-self:end`,
with `padding-right` on `.ws-from` reserving the corner) — giving them a column of
their own put them at the LEFT edge of a column the state block had widened to
34ch, which floated collapse and close in the middle of the header instead of in
the panel's corner. Under 1360px the
state drops to its own full-width row and reads left. The sparkline is `flex:1 1
110px` because it is the one part of the hero that can give — a shape cue, not a
figure — and without that it wrapped the whole hero onto a second line once the
state took a column (+42px).

Removed from the header, all at the owner's direction: the return strip's metadata
(section · "line 1 of 16" · "N still need review" — the section heads the row in the
statement behind the page, the position is what the ‹ link and Next move *through*,
and the count is the worklist bar's job; `owed` still gates the Next button, only
its text went), `CONSOLIDATED` under the line name (the Scope tab states scope), and
"· star to require an explanation" from the below-materiality verdict — an
instruction living in a status line, teaching a control instead of reporting where
the line stands.

**Earlier in the same pass** (237px → 158px).
The shortcut legend is hidden (`#fxRoot.dw-page .ws-from .keys`) — it spent a band
teaching five keys above the line the reviewer came to read, and the "‹ Income
statement flux" link is the same exit Esc is. The verdict sentence gets 78ch rather
than 46ch, which stopped a 72-character line wrapping into two ragged right-aligned
rows. And **the hero reads across in page mode, not down**: its three sub-rows
(figure · prior→current flow · sparkline) are stacked for the 440px drawer, where
stacking is the only option; on a full screen they fit one row, so `FAVORABLE` and
`MAY '26 → JUN '26` drop their `margin-left:auto` and trail the fact each qualifies
rather than stranding themselves mid-line. Drawer hero unchanged at 121px.

**Dark-mode hairlines were resolving to the light value.** `--rule` /
`--rule-strong` are ramp-derived aliases declared at `:root`, so they substituted
`:root`'s light `--border` and every dark-mode hairline drew `rgba(20,24,36,.10)`
— a dark line on a dark surface. They are now redeclared in the dark block beside
`--border`, exactly as that block's own comment instructs for ramp-derived aliases.
App-wide fix; all 10 chrome themes still pass AA.

**The topbar entity-tree scope (`#tbScope`) is hidden on Flux.** It was not merely
duplicating the Scope tab — it was a dead control that contradicted the page.
`sliceOk()` filters on `S.ent/seg/prop/cc/reg` and never on `F.entity`, so setting
the tree to one entity left every figure identical (Total revenue 88.1 before and
after). The two do not even share a vocabulary: the tree lists 4 legal entities
(Meridian DC Holdco, Fleet DC OpCo …), the Scope tab 5 property entities (Meridian
Ashburn Holdings …). The header could therefore read "Fleet DC OpCo · 1 of 4
entities" over a statement narrowed to three entirely different entities. Same
precedent and same treatment as Fund / Region / Ownership: **hidden on Flux,
untouched on every other page** — verified on Overview, Trial balance, Account
activity, Consolidation, Trending review and GL overview. If flux is ever wired to
`F.entity`, wire it before restoring the control, not after.

**Controls only for what the prototype supports.** Currency, owner, approval-stage,
GAAP basis, mapping version, and movement-type (organic/FX/acquisition) were all
specified but are NOT rendered: flux consolidates to USD only, there is one preparer
constant, and no movement decomposition exists. A control that cannot act is a dead
control (shared conventions) — add them when the engine carries them.

**`glHead()` and `periodNav()` are gone from Flux.** The header's `h1` duplicated
the shell's "Flux analysis" title (already `display:none`) and its context line
restated scope · comparison · cadence · currency — four facts the Period, Scope and
Basis tabs now each carry as an editable field. The arrows-and-months navigator
became the Period field, which reaches **any** period in one click rather than only
a neighbour. `pLabel()` keeps the Period field honest under cadence: quarterly reads
"Q2 2026", not "Jun 2026".

**Display mode is a FIELD, not a segmented control** (2026-08-28). It was the only
control in the command surface with a different shape — twelve 180px dropdowns and
one 199px three-button capsule — the exact inconsistency the tabs exist to remove. A
segmented control earns its width when the choice is flipped constantly and the
alternatives must be visible at rest; this one is set once a session, and each option
needs a sentence to explain it, which a segment cannot carry and a menu row can. The
`fxGroup` labels went with it: every field states its own name.

**TWO modes, not three** (owner's direction). Review and Financials had converged to
a single column of difference: the mode was built to strip four (`REVIEW_CHROME` =
`cmt · status · owner · resid`) but only `cmt` still ships in the default set, so
"Financials" had become "Review minus the Explanation column" — a whole display mode
to hide one column that Table › Columns already toggles. They merged into
**Statement**; **Narrative** is unchanged and is the one mode that still sheds review
chrome, because it prints the explanation under the line and the column beside it
would be the same words twice. Measured: Statement 6 columns / 25 rows, Narrative 5
columns / 27 rows.

`DISP_MODES` is now `[['stmt','Statement'],['full','Narrative']]`. **Every retired
key migrates on READ** in `dispMode()` — `status` (Review), `nums` (Financials) and
the pre-2026 `compact`/`review`/`cmt` all resolve to Statement, so a saved view
stored under any of them still opens without a migration pass over stored state.
Anything unrecognised falls back to Statement, never Narrative: a corrupt value must
not open the statement with a paragraph under every line. Verified for all nine
inputs including `undefined` and garbage. The `1–n` keyboard legend and the shortcut
handler both derive from `DISP_MODES.length`, so retiring a mode cannot leave the
legend promising a key that does nothing (verified: `1`/`2` switch, `3` is inert).

**One field shape on every tab** (2026-08-28). Measured before the fix, the row
changed shape whenever the tab changed: widths of 150 · 156 · 168 · 216 across the
five filter tabs, and a **14px radius on a 28px control — a perfect capsule**, which
is both the "giant pills / rounded capsules" the brief rules out and a mismatch with
the Submit button beside it drawing its own 6px. The cause was
`body.fx-mercury #fxRoot.aw{--radius:14px}`: any control asking for `var(--radius)`
in this subtree gets rounded into a pill. **Pin 6px explicitly on `.fxf` and on
`.fx-fields .seg`** — do not inherit `--radius` here.

Fields are now a fixed **180px × 28px × 6px** on all eight tabs, so a long value
ellipsises and the tooltip carries `label · value` to keep it recoverable — which is
what the Zendesk reference does too ("Requester organ…"). Action buttons (Saved
Views, Actions) stay content-width by design: they are actions, not filters, and
match on height and radius. Verified across all eight tabs: one radius, one height,
one field width.

**The strip carries tabs and the CTA, nothing else.** Find is a field in Scope,
Clear all sits at the right of the field row. Do not re-attach controls to the
strip. **Every control states its active selection** — `Entity · 3 selected`,
`Currency · USD`, `More · 2 active` — one short value if there is one, a count
otherwise; a field at its default reads "All"/"Any". Accent marks only a field
actually narrowing the population, so an untouched row is monochrome (rules 2/3);
fields are flat and only the popover, a true overlay, has a shadow (rule 5).

**Each tab shows a count of its live filters, and this is load-bearing, not
decoration.** Tabs hide filters; on a surface whose numbers get signed, a reviewer
must never read a filtered statement with no visible reason why. The counts mean
the strip still answers "is anything filtering this?" from any tab. Materiality
and Units never count — they are context, not narrowing. Do not remove the counts
without replacing the guarantee.

**ONE POPOVER SYSTEM for every selector on the page** — `pop()` / `paintPop()`
into the single global `#pop`. Anchored under its trigger, never a modal or a
drawer, one open at a time, closes on outside-click and Escape. Multi-selects are
**staged**: Search · **Included | Excluded** · Select all · checkbox list ·
**Clear (left) / Apply (right)**. They edit a draft (`popDraft`/`popDraftX`) and
commit on Apply — closing abandons it. Staging exists because picking four entities
one at a time meant four full recomputes of the consolidation, and because
Included-vs-Excluded cannot be read mid-build. Select all acts on **what the search
is showing**, never the hidden options. Single-selects (Status, Direction, Explained,
Eliminations, Units, Cadence, Period, Materiality) commit on click and close — an
Apply step for one choice is a second gesture for one intent. **The shell is
constant; the content varies** — do not force a threshold editor or a period list
into the checkbox model.

**`S.excl` is real filtering, not a label.** Per-dimension exclusion flags run
through `dimOk()` in `sliceOk()`; Selected and Excluded are arithmetically
complementary (verified: 24.4 + 63.7 = 88.1 total revenue). Because the same list
means the opposite thing under the flag, `excl` rides in `snapshot()` with the
dimension arrays, and every place that renders a scope — `fxDimField()`,
`activeChips()`, `scopeWord()`, `ctxSummary()`, `scopeSentence()` — spells the
exclusion ("Excl. 2", "All except 2 entities"). An empty selection always clears
the flag: there is no exclusion of nothing.

Statement order (`S.sort`) moved into the **Table** menu — it is table
configuration, not a filter, and hiding the drawer would otherwise orphan it.

## 2026-08-28 — the narrative and the comments are ONE conversation

At the owner's direction, redesigned across both densities. The thesis: a flux
line's explanation and its comment thread are not two features, they are **one
argument over time** — Korvyn or a preparer states the movement, entities
contribute, a reviewer questions, someone answers, it is signed. They were being
rendered as a wall of prose with its authorship demoted to a caption, plus a
separate tab that opened with a compose box and then spent 830px on a chase-list.

**One grammar, `.rw-msg`, for every voice.** Avatar in the gutter, identity on one
line with the time pushed right, words against a rail, quiet metadata beneath:

| Voice | Treatment |
|---|---|
| **Explanation** (`.lead`) | the opening statement — author, provenance beside the name, prose against a rail |
| Korvyn draft | indigo `--ai` avatar + rail, never the cobalt accent (rule 2) |
| A person | ramp rail, cobalt avatar |
| **You** (`.mine`) | accent rail + a quiet "you" label — so your own questions are findable among four entities' answers |
| **Awaited** (`.owed`) | a silhouette: same geometry, dashed hollow avatar, no rail |
| **Composer** (`.comp`) | your avatar and a field, at the END of the thread |

**Order is the fix, not decoration.** The tab now reads: who is talking → what was
said → the box to reply → who has not answered. The composer used to lead, asking
the reviewer to write before reading a word; it now closes the thread, stays a
single growing line, and reveals its byline and Post/Clear only once there is a
draft — so an empty box invites rather than demanding to be filled in. `cmtField()`
toggles that class and autosizes **without repainting**, because a repaint takes the
caret with it (same contract `exField` holds).

**"Awaiting a comment" is a worklist, not the conversation.** Seven silent entities
rendered seven full cards — the tab measured 1,079px with an empty thread. It
collapses to one line (`S.cmtOwedOpen`) stating the count and the share of the
movement still silent, plus an overdue count; opening it returns every action
unchanged (Request · Chase · Record on behalf · withdraw). Comments tab: **1,079px →
342px**.

**Threaded replies, ONE level deep** (2026-08-28). Every message carries a stable
id — a lineage contribution by the scope that authored it (`k:<key>`), a discussion
comment by its own `id`, backfilled in `commentStream()` so nothing downstream meets
an id-less message. A reply stores `parent`.

**One level is a decision, not a limit.** `cmtRootOf()` re-parents a reply aimed at
a reply to the root of its branch, in `cmtSave()` — so the *stored* shape can only
ever be two deep and the renderer is never asked to flatten a tree it did not
create. A review thread's question is "what was said about this line"; a reply four
levels in is unreadable at 440px and tells an auditor nothing a flat answer does
not. Verified: aiming at a reply produces a sibling, never a third level.

The reply box renders **inside the group it belongs to** (`cmtComp` stands down
while `S.cmtReplyTo` is set — two composers is two carets). The filter applies to
**roots only**: hiding a corporate reply that answers an entity's contribution would
orphan the answer and make the thread read as though nobody responded. The draft is
**discarded** when aiming and un-aiming — text written as a general note is not the
same statement once filed as an answer to one person. `S.cmtReplyTo` clears in
`pick()`, `pickAt()` and `closeDrawer()`: a reply aimed at a message on one line
must never file its answer under a stranger on the next.

`cmtComp` is a new part in the registry, so it is in both `RW_LAYOUT.drawer.comments`
and `RW_LAYOUT.page.rec` — add parts in both or the full page silently drops them.
`.rw-cm`, `.rw-cstream` and `.rw-comp` are retired with the card layout they styled.
One trap: the base avatar rule is `#fxRoot.aw .fx-detail .rw-av`, so `.rw-av.ai`
must match that specificity or every avatar stays cobalt.

## 2026-08-28 — the statement grid: status column, star gutter, default columns

> **Amended 2026-08-29** — `FXST` gains `Ready` and `Explained`, and "Draft ready" is
> now "Korvyn drafted". The one-word closed vocabulary is unchanged.


**The Explanation column has ONE subject: where the line stands.** `cmtIndicators()`
used to emit up to six indicators — needs-explanation, item count, coverage percent,
inherited/draft, document count, review status — in five visual languages, so the
column meant something different on every row. Measured on the seeded income
statement: **14 of 16 cells empty**, and the two that were not carried two entirely
different compositions ("4 · 100% expl · In review" and "⚠ Needs explanation"). A
column whose meaning changes row to row cannot be scanned, only read cell by cell.
It now emits one word from a closed vocabulary (`FXST`): Needs explanation ·
Returned · Draft ready · Inherited · In review · Reviewed, first-true-wins, because
a line is in exactly one place in the review. Counts and coverage moved to the
workspace where they can be acted on — they are inventory, and rule 12 says
inventory does not compete with status.

**The warning glyph is gone.** Rule 8: severity is a 3px left border and nothing
else, never a dot, never a pill, never both. The row already carries that border, so
`⚠ Needs explanation` was the second and third mark for one fact.

**The star holds its gutter but not its ink.** 15 stars rendered, 0 set — a
permanent column of grey outlines immediately left of the line name, the most
valuable horizontal position in the table, for an action taken on maybe one line a
period. It is NOT removed: starring forces a line to require an explanation even
below materiality, which is a materiality override and a real control. A SET star
stays visible at rest (amber) — that is what a watchlist is for; an unset one
appears on row hover or focus. **`opacity:0`, never `visibility:hidden`** — the
latter takes the button out of the tab order and silently removes a real control
from every keyboard user (caught in test).

**Contribution is RETIRED** (owner's direction), removed from `COL_DEFS` as well as
the default so a known-wrong measure is not one click away in the column picker. It
computed `|Δ line| ÷ Σ|Δ detail lines|` and did not survive being read:

- the **name** promised contribution to net income or contribution margin, and
  delivered share of gross movement;
- **unsigned** — `+1.4` and `−1.4` both read 27% with identical bars, two movements
  in opposite directions that partly cancel, shown as equal;
- **subtotals shared the detail lines' denominator**, so Total revenue 40%, Total
  opex 40% and Net income 12% double-counted and the column summed well past 100%;
- the **bar drew at 2.2× the true share**, pegging full at 45.5%.

If it returns it needs a stated basis and a signed reading. The `case 'contrib'` in
the cell renderer is kept deliberately — see the guard below.

**A retired column must not take the table down with it.** `S.cols` is persisted in
saved views, so a view stored before a retirement still names the dead column;
`hcell()` then ran `COL_DEFS.find(...).nm` on `undefined` and threw, taking the whole
statement with it. `renderGrid()` now filters `S.cols` against `COL_DEFS` in the ONE
place header and body both read from, so the two can never disagree about how many
cells exist. Verified: a stale `[…,'contrib','trend',…]` view drops contrib, keeps
trend, and renders 7 header cells against 7 data cells.

**12-period trend is off by default** (owner's direction). A sparkline on every row
is a second chart competing with the figures beside it, and "how has this line
behaved over time" is a question asked of one line in the workspace, not of sixteen
at once. Still one click away under Display › Table › Columns.

## 2026-08-28 — UI/UX Phase 1: Corporate Flux is the reference implementation

Owner's direction: refine the Flux **page shell and controls** — not the statement
table, not the review panel, not the narrative — into the interaction language the
rest of Korvyn will adopt. Zendesk is the reference for *discipline* (compact
enterprise density, restrained borders, predictable menus), never for branding or
IA. **The shell is unchanged**: dark ribbon, global module nav, contextual
Accounting rail, Search / Ask Korvyn, notifications, profile, scope architecture.

**The page states its identity once, in the shell's own title row.** `paintTopbar()`
writes both halves for Flux: the name — **Corporate Flux** — and one quiet context
line beneath it, `KFX.pageContext()` → *"Jun 2026 vs May 2026 · Consolidated · USD"*.
It replaced the crumb *"Income statement · variance analysis"*, which named the
statement the tabs directly beneath already name, and restated what the page is
called where its context belongs. Every clause comes from the function the matching
control reads (`cmpPhrase` · `scopeWord` · `ccyWord`), so the header and the Period,
Scope and Basis fields cannot drift. The cadence word drops out of a plain
prior-period comparison — "Jun 2026 vs May 2026 · Monthly" says monthly twice.
**Do not add a header inside `#fxRoot`.** That is why `glHead()` was retired; the
page name would then be on screen twice.

The stack now reads **A: what view you are in → B: how it is filtered**:

| y | Region |
|---|---|
| 86 | **Corporate Flux** + context line (the shell title row) |
| 161 | Income statement · Balance sheet · Cash flows · Equity — level 1 tabs |
| 223 | Period · Scope · Workflow · Variance · Basis · Display · Saved Views · Actions — level 2 |
| 255 | the one contextual field row |
| 358 | the statement (was 365) |

**ONE TAB LANGUAGE — `.ktabs` / `.ktab`, a design-system primitive.** The same idea
was drawn three ways on one screen: the statement picker at 36px on 8/14 padding,
the Flux command bar at 30px on 0/10, and the popover's Included|Excluded pair at
28px on 0/2. All three now draw from one primitive — 32px, `0 12px`, `--fs-table`,
2px underline, no pill, no fill, no shadow, no radius; the strip scrolls before it
wraps. **Two levels, one vocabulary:** level 1 (where you ARE) takes the accent;
`.lvl2` (the command surface) is identical geometry with an **ink** underline. Two
accent underlines 60px apart is the competing-tab-rows problem — with one accent on
the screen the hierarchy reads without a second colour, size or shape. `#subnav2`
and the Flux bar both emit `.ktab`; **add a tab row by using the primitive, never by
restyling buttons.** Tab rows are keyboard-driven: roving `tabindex`, ←/→/Home/End
through one delegated handler (all eight Flux tabs previously had `tabindex=0`, so
reaching the field row took nine presses of Tab).

**ONE DROPDOWN LANGUAGE — `.pop` is now the app-wide standard.** Measured before:
seventeen menus hanging off seventeen identical 180px fields opened at **eleven
widths between 230px and 330px**; the internal inset was 11 / 9 / 11 / 7px across
header, search, footer and rows; **0 of 6 rows were focusable** and none carried a
role; and the menu **never re-placed**, so one scroll left it 228px from its
trigger. Now:

- **Two fixed widths** — 300px standard, 340px `.wide` (dimension multi-selects and
  the materiality editor, which carry a second column of figures or a form). Never
  narrower than the control it hangs off.
- **One inset**, `--pop-x`, for header, search, rows and footer, so a section label
  and its rows start on the same pixel.
- **`--shadow-md`, not `--shadow-lg`** — an anchored menu is not a modal. A 44px
  blur under a 1px border is two separations doing one job.
- **Anchoring is live**: re-placed on scroll and resize, right-aligns to the trigger
  rather than sliding along the viewport, closes when the trigger leaves the screen.
- **Single-select is a TICK, multi-select is a CHECKBOX.** A box that fills in reads
  as "one of several"; drawing it on Period or Cadence promised a choice the menu
  does not offer. A single-select also carries the selection on the **row**
  (`--accent-bg`) — one row can be selected, so it is obvious the moment the menu
  reopens. A multi-select keeps the row neutral and lets the ticked box carry it,
  because twelve accent-filled rows is the loud state this pass removes. Reason code
  moved to the checkbox, where it always belonged.
- **Keyboard throughout**: ↑/↓/Home/End/Enter/Space, Escape closes and returns focus
  to the trigger. Roles are assigned after paint (`popEnhance()`) rather than at the
  twenty call sites that emit rows, so any menu added later is covered.
- Section separators are `.pop-h.sec` / `.pop-l.sec`, not an inline `border-top`
  written at ten call sites. Long lists get a search — Period had **30 rows and no
  search**.

**THE ACCENT MARKS THE OPEN FIELD, NOT THE FILTERED ONE.** This **amends** the
2026-08-28 ruling above that "accent marks a field actually narrowing the
population". A Scope row with three dimensions set was three cobalt tablets in a row
of five — the loud selected state the owner ruled out, and a misuse of the accent
besides: rule 2 says the accent carries *interaction*, which is what it does now, on
the field whose menu is open. A narrowing filter is stated by its **value**: `--hint`
"All"/"Any" at rest, `--ink` at 500 against a stronger border once it narrows. The
guarantee that a filtered statement always says so is unchanged and never rested on
colour — **every tab carries a live count of its own filters**, and Clear all
appears at the end of the row.

**The field row is ONE row and stays one row.** `flex-wrap:wrap` made it two the
moment the review panel took 440px (measured: 36px → 72px, pushing the statement
down at exactly the moment a reviewer needs it). It scrolls instead, on the same
discipline as the tab strip.

**Tab counts follow the tab that owns the filter.** `syncFilterChrome()` read the
*first* tab in the DOM and scored it against `FX_FTABS[0]` (Period) while its own
comment said the query belongs to Scope — so typing in Find updated the wrong tab's
count and Scope's never moved. Counts are now looked up by `data-tab` and refreshed
together.

**`#fxRoot.aw` no longer redefines `--radius`.** `--radius:14px` was a parallel
design system inside one page: every control asking for the token got rounded into a
capsule, which is why `.fxf` and `.seg` each had to pin 6px back by hand. The card
declares its own corner (10px); nothing inherits it.

**Deliberately NOT done in this phase** (owner's direction — later phases): the
statement table, the variance column treatment, the comments/support panel, the
narrative experience, row hierarchy and account-group presentation. The eight-tab
command architecture, its names, and the two-submits rule are unchanged — the
existing IA already answers the questions the brief listed.

**Open question for the owner:** the left rail still reads **"Flux analysis"** while
the page now reads **"Corporate Flux"**. Renaming a nav item is a navigation change,
so it was not made unasked.

## 2026-08-28 — BOXY: the surface is a ground, its regions are the cards

> **Superseded 2026-08-29 FOR THE INSPECT PANEL AND THE ASSISTANT**, which are
> full-width bands on a sheet. The statement page still reads as cards on a ground,
> and the `overflow:hidden` / sticky-header trap below still holds everywhere.


Owner reviewed the pass above and its verdict was **"I don't feel any changes"** —
fairly. Everything in it was structural, behavioural or sub-pixel: real fixes, but
a reviewer opening the page saw the same screen with a different title. What
follows is the visible half, and it **supersedes the "4b UNBOXED" direction**
recorded in the mercury block.

**The inversion.** `#fxRoot.aw` was ONE flat white card holding un-boxed bands. It
is now a **ground**: `background:none`, no border, no radius, `padding:0`. Each
region standing on it is its own white card with a real edge — the command
surface, the worklist tiles, the statement. This is the reference's own structure
(a light canvas carrying bordered white cards), and it honours **rule 11** more
literally than the flat version did: exactly one card per region, rather than one
card for the whole screen. **Rule 5 is intact** — the cards separate by *lightness
and a hairline*, never by shadow.

| Region | Treatment |
|---|---|
| statement picker | **folder tabs** — `.ktabs.lvl1`, selected tab is a white box whose bottom edge IS the panel's top edge |
| command surface | one white card, radius `0 6px 6px 6px`, joined to the folder tab above it |
| worklist | a row of **stat tiles** — figure over label, one card each (was a strip between two hairlines) |
| statement | a framed card; the line count is its header band; filled `thead`, filled section rows |

**A CARD EDGE AND AN INNER DIVIDER ARE NOT THE SAME LINE.** This is the rule to
carry forward. `--line` (n-200) is a hairline *between things sharing a surface*;
against the darker page it all but vanished, so a card read as white paint rather
than an object. **Outer edge of a region → `--line2` (n-300). Dividers inside a
card → `--line`.** Nothing new was introduced; both are ramp steps.

**Planes.** Light-mode `--bg` moved `var(--n-50)` → `var(--n-100)`. At `#F7F8FA`
the page was three percent off the white cards standing on it. **The dark block is
unchanged and must stay so** — the ramp inverts there, so `--n-50` is already the
darkest step and is correctly the page.

**The UI face is no longer Inter.** `--sans` leads with `"Segoe UI Variable Text"`,
then `-apple-system`, then the usual descent; `--num` is now `var(--sans)` so
chrome and figures share one face (rule 14). Two reasons this is right rather than
merely different: the reference screens themselves run system faces (San Francisco
/ Segoe / Helvetica Neue / Lucida Grande), not a licensed brand face; and it keeps
the file self-contained — no `@font-face`, no CDN. **Inter is deliberately absent
from the stack**: leaving it first would make the change invisible on any machine
that has it installed, which is exactly how the previous pass failed. Measured on
the review machine: Segoe UI Variable Text renders 9% narrower than Inter, and
**tabular figures are exact — 0.000px spread across all ten digits**, so numeric
columns still align. IBM Plex Sans and Source Sans were considered and rejected:
neither is installed locally and neither can be embedded without breaking
self-containment.

`--h-field:32px` is a new token — a filter-row field is an input-shaped box you
read a value out of, not a chip you press, so it is taller than `--h-btn` and
borders at `--border-strong`.

**Trap: never put `overflow:hidden` on `.card.fx-table`.** The column heads are
`position:sticky; top:var(--fx-stick)`, and an `overflow:hidden` ancestor becomes
their containing block — the header row lands ~147px down the middle of the
statement, under rows it is supposed to label. Observed and fixed. `#fxRoot
.fx-table{overflow:visible}` exists for this reason; do not out-specify it. The
sticky head also stopped painting `var(--bg)`: borrowing the page colour for a band
inside a white card was only ever invisible because the page was near-white. It is
`--n-50` now, a step lighter than the `--bg2` section rows, so the two filled bands
never read as one.

Verified: 60/60 views render, console clean, all 10 chrome themes pass AA, dark
mode holds the boxy structure, numeric columns align, dropdowns still anchor under
the taller fields.

## 2026-08-28 — contrast, and ONE named FILTERS region

**"The header and filter pretty much blends. There's no contrast"** (owner, on the
boxy pass). Two planes were doing nothing:

- **The header painted a tint, not a plane.** `.topbar` was
  `color-mix(--bg 82%, transparent)` — once the page darkened it became a slightly
  lighter wash of the page a few pixels above cards of a third colour. It is
  `--surface` at 92% with a `--line2` edge now: the header is the top of the
  CONTENT plane, so it takes the content surface.
- **White fields on a white card behind an invisible hairline.** Measured: a field
  against its ground was **1.06:1**. The command card is **two bands inside one
  border** now — the tab band keeps the card's surface, the field band is a control
  ground (`--n-100`) under a real rule, and the fields are white boxes standing on
  it at 1.13:1 fill plus a 1.34:1 border. This is what the reference does: the
  fields are the objects, the band is what they stand on.

**ONE FILTERS REGION HEADER — `.kfh`** (owner's direction). The shell already drew
a filter icon and the word *Filters* on the collapsible drawer that every non-Flux
page uses; Flux had neither, so the same idea was named on 59 screens and anonymous
on the one that is the reference for the rest. It is a primitive now — same icon
(the shell's own path, `M2 3h12M4 8h8M6 13h4`, exported as `KFILT_IC`), same word,
same band — sitting above whatever tabs and fields the surface carries:

```
⇶ FILTERS   2 active                              Clear all
Period  Scope ¹  Workflow ¹  Variance  Basis │ Display  Saved Views  Actions
[Period Jun 2026 ⌄]  [Compare May 2026 ⌄]  [Cadence Monthly ⌄]
```

The band owns the two facts that are region-wide, not tab-wide: **the count of
every live filter across every tab** (the tab badges say *where* a filter is; this
says whether the page is filtered at all), and **Clear all**, which reaches across
all tabs and so belongs beside the count rather than trailing whichever row happens
to be open. It repaints on its own in `syncFilterChrome()` via `fxHeadInner()` —
safe, because unlike the field row it holds no input a reviewer could be typing
into.

**The strip says where the filters stop.** `.ktab-div` is a hairline before the
first `cfg:1` tab. Display, Saved Views and Actions configure rather than filter and
never carry a count, so one word must not claim all eight — the divider is what lets
the band be called *Filters* honestly.

`.filterbar-hd` (the platform drawer's header) was aligned to the same band — same
icon size, same label type, `--line2` border, no shadow. It stays a button while it
still opens a drawer.

**Not yet done — the platform filter still uses the collapsible drawer.** The
analysis is complete and the finding matters: of ~25 control groups in that drawer
only **five are real** (`fundScope` · `regionScope` · `ownType` · `ccyMode` ·
`periodType`/`periodVal`, bound to `F`). **Seven are dead controls** — `gfClassGrp`,
`gfPeriodGrp`, `gfCompareGrp` on GL financial statements and `gtCatGrp`,
`gtEntityGrp`, `gtViewGrp`, `gtRangeGrp` on Trending review are every one a
`<select onchange="renderAll()">` with no id and no state binding, so choosing "By
entity" or "Operating expenses" changes nothing. Nine more (`fx*Grp`) are Flux
legacy that never render, because the drawer is hidden on Flux.

## 2026-08-28 — the FILTERS band folds, and the platform adopts the format

**The band is the toggle** (owner's direction). It reverses the "persistent inline
fields" ruling for the OPEN/CLOSED state only — the fields are still one row under
one tab strip, they just start folded, the way the drawer this band replaced always
behaved. Folded on Flux the region is 35px and the statement opens 73px higher.

**The count survives the fold, and that is load-bearing.** On a surface whose
numbers get signed a reviewer must never read a filtered statement with no visible
reason why. Collapsing hides WHICH filters are set, never THAT they are — the band
keeps `N active` and Clear all. Clear all sits inside the toggle and so calls
`event.stopPropagation()`; the band is a `role="button"` div, not a `<button>`,
because a nested button is invalid (the same construction the shell's header used).
`setFilterTab()` opens the region — choosing a category is asking to see its
controls. `Alt+F` toggles it; on Flux that shortcut previously called the shell's
`toggleFilters()`, which opened a drawer that is `display:none` there, so it did
nothing at all.

**THE PLATFORM FILTER IS NOW THE SAME OBJECT** (`#gfBar`), on every non-Flux
surface. What it replaced was a three-column grid with a titled but empty
"Comparison" column, native OS selects, a blue segmented capsule and a
Reset / chip / Save-as-preset / Apply footer.

- **`#filterCtrls` stays in the DOM and stays hidden.** `readFilters()` reads `F`
  straight off those `<select>` elements, so they remain the state store and the
  new fields drive them by setting `.value` and dispatching `change` — which fires
  the control's own inline `onchange`. `readFilters()`, `onPeriodType()`,
  `resetFilters()` and every downstream figure are untouched. **No handler is
  duplicated and no data path moved.** Verified end to end: picking Fund II through
  the field set `F.fund='F2'`.
- **Options are read from the control being driven**, never restated in the
  registry — the same "derive, never duplicate" rule the figures follow.
- Tabs are per page: **Scope** (Fund · Region · Ownership) · **Period** ·
  **Basis** (Currency), plus **Ledger** (`GL_DIMS` → `glSet`) on GL overview and
  Account activity, so the ledger's four real dimensions became a tab instead of
  being lost with the chips.
- **A field with nothing to choose does not render.** "Which" exists only for a
  single quarter or a single month.
- The menu is the same `.pop`: a generic `g:<key>` branch, so the shell declares
  its filters as data and the rendering, keyboard, anchoring, width and
  selected-state all come from one place. Long lists get the search automatically.

**SEVEN DEAD CONTROLS DELETED, not ported.** `gfClassGrp` · `gfPeriodGrp` ·
`gfCompareGrp` (GL financial statements) and `gtCatGrp` · `gtEntityGrp` ·
`gtViewGrp` · `gtRangeGrp` (Trending review) were each a
`<select onchange="renderAll()">` with no id and no state binding — choosing "By
entity" or "Operating expenses" changed not one figure on screen. A control that
cannot act is a dead control.

**The field CSS no longer belongs to Flux.** `#fxRoot .fxf` / `#fxRoot .fx-fields`
became `:is(#fxRoot,#gfBar) …` — 27 rules, rewritten in place so compound selectors
stay correct, and specificity is unchanged because `:is()` takes the highest of its
arguments. Add a third surface by adding it to that `:is()`, never by copying the
block.

Verified: 60/60 views render, console clean, 10/10 chrome themes pass AA, the field
→ select → `F` path works, the ledger field drives `GLF`, and reset clears both.

## 2026-08-28 — the thread is a TIMELINE

> **Superseded 2026-08-29** — the connector and full-bleed rows went with the card
> treatment; a message is a bordered card now. The `.rw-msg` grammar and the
> one-level reply shape are unchanged.


Owner's direction, from the reference's Interactions panel. The `.rw-msg` grammar
of 2026-08-28 stands; four things about how it is drawn changed.

**ONE vertical line, in the gutter.** Every message carried its own 2px rail beside
its prose, so a thread of six was six short rails at six different heights with
nothing connecting them — six marks for one idea. A single connector now runs
behind the badges (`.rw-msg::before`, 1px `--line2`, at
`calc(var(--rw-bleed) + 11px)`), which is what makes a thread read as one exchange
over time rather than a stack of cards. The per-message rail is gone with it: a
second vertical line beside the first is the box-in-box rule applied to strokes.
`.rw-thread` and `.rw-grp` are **`gap:0`** and the spacing is padding — a gap would
cut the connector between every pair.

**The voice moved to the badge.** The rail carried it (accent for you, indigo for a
Korvyn draft) while every avatar was cobalt — so the one element that could carry
identity did not, and the accent marked a *message* rather than an interaction.
Now: **a person is ramp (`--n-500`), YOU are the accent, a Korvyn draft is indigo**
(rule 2 — indigo is the AI marker and never a second UI accent), an awaited voice
stays a dashed hollow circle. The badge is a 22px rounded square (18px on a reply),
opaque and `z-index:1`, so it covers the connector without needing a ring.

**Title over meta.** The header was one baseline row with the time pushed to the far
right, so on a 440px panel a long name and its timestamp sat at opposite edges with
a void between them. `.who` is now `flex:0 0 100%` at `--fs-ui`; role and time fall
to a quiet `--fs-label` line beneath, `.hd .sp` is retired, and the separator is
drawn by `.role ~ .at::before` so it appears only when both halves exist.

**Full-bleed, not inset.** Rows run to the panel's own edge — `--rw-bleed` is set on
`.dw-body` and the row negates it with symmetric margins — so the tint reads as
"this row" and not as a card that grew a background. Hover is `--surface2`; the
message the composer is aimed at takes `--accent-bg` via a new `.aim` class, which
is the one row genuinely *in play*.

Verified in both densities: connector 1px at the badge centre, badge 22px/5px,
`.who` full width with meta on its own line, message left edge = body left edge,
`.tx` rail removed, `.aim` tint on the replied-to message, page mode unchanged,
60/60 views, 10/10 themes AA.

## 2026-08-28 — ONE filter affordance per surface

**Collapsed on arrival.** Both regions already defaulted to folded, but the flag is
session state, so a band left open while adjusting one page's filters greeted you
open on the next. `paintTopbar()` now folds both whenever `TAB` changes
(`_lastFiltTab`), through `gfOpen=false` and `KFX.collapseFilters()`. Switching the
**statement** on Flux is not a page change and leaves the band as the reviewer set
it.

**Duplicate entry points removed** (owner: "I see quite a few double filter
options"). Six surfaces carried a page-level **Filters** button *inside the content*
that opened the very same panel the FILTERS band above it opens — `glActions`,
`glSurfActions`, the comments toolbar, and the Requests / Data Room / Evidence
headers — plus the GL chip bar's **+ Filter** button and its **Advanced context**
link. All removed. The GL chips themselves stay: they are a display of what is on
with per-chip removal, not a second way in.

**`toggleFilters()` is this file's placeholder handler — 37 callers, and most have
nothing to do with filtering.** After removing the duplicates, ~25 remain wired to
it: **Actions ⌄**, **···** (More), **Export**, **Columns**, **New request** ×2,
**+ New Report**, **Run Report**, **View calendar**, **+ Add / Plan**, **Save
view**, **Save review**, **Assign owner**, **Download** ×2, **Link as related**,
**Open source document**, the FP&A header's *All entities / USD / May 2026* pills,
and several `<tr onclick>` rows. Each opens the filter panel instead of doing what
it says.

These were **deliberately left alone**: they are mislabelled placeholders, not
duplicate filters, and deleting a primary CTA like "New request" or "Export" is a
product decision, not a UI-consistency one. They are the largest remaining
"no dead controls" debt in the file — worth a pass of their own, either wiring them
or removing them.

## 2026-08-28 — the page header's command cluster moves into the band

Owner's direction: *"the export s/b inside filter tabs. Also, the ... + action
button."* On the precedent Flux already set — **"Actions absorbs the ellipsis menu.
The tab IS the menu, so its contents are the row; putting a menu inside a tab would
be two clicks to reach one action."**

The platform band gains a **cfg** tab, **Actions**, after the `.ktab-div` (added to
`gfBarInner` too — it had only been in Flux's strip). `Export` and `···`/`Actions ⌄`
are gone from every page header.

**`glExport` and `glActions` are now empty strings.** That retires them at all 26
call sites in two edits and with no change to any of them — they are interpolated,
so an empty string is inert. Do not re-add a command cluster to `glHead()`.

**`···` and "Actions ⌄" were not ported as buttons**, because neither ever had
contents: both called `toggleFilters()`. The Actions *tab* is what they were
pretending to be.

**Export is real now.** `gfExport()` walks the page's primary visible `table.tbl` —
after the filters, in the order on screen — and downloads a properly quoted CSV
named from `VIEW_META`. `gfTable()` gates it: a page with no table offers Print
alone, because a control that cannot act is a dead control, which is exactly what
the button this replaced was. Verified: `account-activity.csv`, headers plus rows,
commas inside dates and figures correctly quoted.

One `···` survives, on `fdetail` — it calls `pickTab('findex')`, real navigation,
not a filter placeholder.

## 2026-08-28 — a collapsed rail must not hide navigation

Reported by the owner: *"when I collapse left panel, GL options further expands.
Shouldn't I have an extra drawer?"* — and the instinct was right; this was a real
defect, not a cosmetic one.

**What was wrong.** `body.rail-collapsed` sets `.railkids{display:none!important}`,
but the group button still ran `toggleRailGroup(k); pickTab(...)`. So in a 56px
rail, clicking **General Ledger**:

1. flipped `railExpanded[k]` with **nothing visible to show for it** — the change
   only surfaced the next time the rail was expanded, which is exactly the
   "further expands" that was reported;
2. **navigated to `glintel`**, a page nobody asked for; and
3. left the group's **six children unreachable** — GL overview, Trial balance,
   Account activity, Financial reporting, Flux analysis and Trending review had no
   route at all until the rail was expanded again.

**The fix is a flyout, in the product's ONE popover language.** `pop()` takes a
third argument, `side`, and `popPlace()` honours it: beside the trigger, top
aligned, flipping to the trigger's left if the right edge cannot take it and
lifting off the bottom rather than running past the viewport. A 56px icon has no
useful "under". The flyout therefore inherits the shared anchoring, widths,
keyboard, roles and selected-row treatment for free.

**`toggleRailGroup(k,el)` now returns false when it has handled the click itself**,
and the inline handler reads `if(!toggleRailGroup('…',this))return;` — so a
collapsed rail opens the children and does **not** navigate or flip hidden state,
while an expanded rail behaves exactly as before. The group button also carries
`data-pop`, so the outside-click handler leaves it alone and a second click closes
its own flyout rather than reopening it.

**`railFlyoutRows(label)` reads the rows off the rail the shell already painted** —
never a second copy of the nav config — so an item added to the rail appears in the
collapsed flyout with no further wiring.

Verified: opens 6px to the right, top-aligned; lists all six children with the
current page ticked; does not navigate; leaves `railExpanded` untouched; ↓ moves to
the next row; Escape closes and returns focus to the rail button; a second click
toggles it shut; picking a row navigates and closes. Covers every grouped rail item
in the product, not just GL — `ledger` has one group of 6, `filings` two of 3 and 2.
Expanded-rail behaviour unchanged. 60/60 views, 10/10 themes AA.

**Note for a later pass:** the outside-click dismissal is bound to **`mousedown`**,
not `click`. A synthetic `.click()` in a test will not trigger it — that cost a
false "second click does not close" reading here.

## 2026-08-28 — ONE PAGE TEMPLATE: title once, options in the band, then content

Owner: *"when I click on each tab they have different views… have the standard
options on top and the content will be based on the options."* Measured before the
pass: **35 distinct opening shapes across 60 views**, and three causes.

**THE PAGE STATES ITS NAME ONCE.** 23 views printed the title twice — once in the
shell's title row from `VIEW_META`, again as an `h1` a few pixels below. `glHead()`
now suppresses the `h1` when `glDupTitle()` says it repeats the topbar, comparing
against `VIEW_META` directly so it does not depend on which paints first. A
drill-down whose header names a *record* rather than the view keeps its title. This
generalises the ruling Flux already had. **23 → 0.**

**ONE HEADER COMPONENT.** `.fp-hd` was a second header with the same shape and its
own class, so FP&A's seven views drifted from the other twenty-five. `fpHead()`
delegates to `glHead()` and keeps only what is genuinely FP&A's — the
illustrative-data marker. **`.fp-hd` in use: 7 → 0.**

**THE PAGE'S OWN FILTERS MOVED INTO THE BAND.** Nine views rendered their own row
of controls *inside the content*, below the band that is supposed to own options —
GL intelligence alone had ten selects. They appear as a **More filters** tab (the
owner's own vocabulary from the Phase 1 brief). **9 → 0.**

They are **discovered, not registered**: every `.grp` in the current view holding a
`<label>` and a bound `<select>` — the exact shape the retired shell drawer used, so
the pages were already speaking this vocabulary. A page that adds a filter gains it
in the band with no wiring, and no handler is duplicated: the field sets the select
and the select's own `onchange` runs. Verified end to end on `glintel` — picking
Entity through the band moved `gliEnt` from `all` to `Meridian DC Holdco`.

45 of the 52 in-page selects are genuinely bound (`setGliF`, `setClFilter`,
`setAxF`, `setAmF`, `setPolF`, `setDrF`, `setDrevF`, `setGlRecon*`). The 7 that are
not carry no `onchange` and are **skipped rather than redrawn** — no dead controls.

Two traps worth keeping:

- **`gfPageGrps()` must NOT test visibility.** The source row is hidden once it has
  moved, so a visibility test would stop finding it on the very next paint. It is
  scoped to `#view-<TAB>` instead, which is what keeps the hidden `#filterCtrls`
  store out of the result.
- **`renderAll` is wrapped as `_renderAll(); paintTopbar();`** (line ~30593), so the
  view has already re-rendered by the time `paintGfBar()` → `gfHidePageRow()` runs
  and the fresh row is there to be stood down. `renderAll()` itself does not call
  `paintTopbar`.

The source row is hidden with `[data-gf-moved]`, never deleted, and a card left
holding nothing but the row is hidden with it.

Field values normalise `"All " + label` to just **"All"** — the page rows write
their default as "All entity", and the label is already on the field.

**What this pass deliberately did NOT do:** the content region itself. Distinct
opening shapes went 35 → 33, because the variance that remains is `kpis` /
`statrow` / `card` combinations *inside* the content, not the frame around it.
Collapsing those needs a single `page({options, strip, body})` builder every view
calls — the "full page template" option, which the owner deferred. The frame is
standard now; the body is not.

## 2026-08-29 — the inspect panel takes the reference's shape: bands, one rail, one control set

Owner's direction throughout, against `apps/review/index.html` — the inspector this
panel is meant to match. **Read that file's `.fxi-*` CSS before changing this panel**;
it is the specimen, and several rulings below are its own comments rather than new
argument. The Flux review panel, its full-screen page and the Korvyn Assistant are
now one object at three densities.

**Overview is FIVE cards, the reference's five** — Explanation · Key drivers ·
Workflow & review · Evidence · Comments. `state` (the NEEDS REVIEW band) and `attn`
(Needs attention) are **not** among them, and their absence is the point: the
reference has neither. Nothing they carried was lost, it moved where the reference
carries it — the verdict is the classification pill on the Explanation card,
coverage and residual are rows in Workflow & review, and the itemised blockers still
render in full on the FULL PAGE (`RW_LAYOUT.page.judge`), which has the room a 440px
dock does not. `cmtPeek` was deleted when the thread merged into Overview and
**restored** when Comments went back to its own tab; it is a summary of a tab, so it
only earns its place while that tab exists.

**EVERY SECTION IS A FULL-WIDTH BAND ON A SHEET.** This **supersedes the 2026-08-28
BOXY ruling** ("the surface is a ground, its regions are the cards") *for the inspect
panel and the Assistant* — the statement page keeps its cards. A floating card needs
a gutter, the gutter needs a scrollbar allowance, and the card needs its own padding
inside that, which is how one panel ended up with **three left rails**: header text
at 16, card edge at 27, card content and tabs at 42. Running the band edge to edge
collapses all of it — the band pads to `--s-4` exactly as the header does, so every
word in the panel starts on the same pixel. Separation is a hairline between bands,
which is what rule 5 asks for anyway.

Three traps, all of which cost a round of "still not aligned":

- **Compare content to the HEADER, never cards to other cards.** A stack that is
  uniformly wrong is uniformly symmetric. Full screen was inset 16px on both sides
  while its header spanned the sheet, and every card-vs-card check passed.
- **`.rw-col.solo{max-width:120ch}` capped the card, not the prose.** Every
  single-column tab stopped ~500px short of the header. The measure limit belongs on
  the paragraph (96ch); the card fills the sheet. The `judge` column already worked
  this way — follow it.
- **A scrollbar takes layout width, so chrome outside the scroller is wider than
  bands inside it.** `scrollbar-gutter:stable` makes the reserve constant and the
  header, tabs and footer take it as a right margin. `--dw-sbw` / `--cp-sbw` are
  **measured at runtime** — a scrollbar's width is a platform fact, not a token.

**The header is a FOUR-FIGURE BAND**, which **supersedes the 2026-08-25 hero**
("push the visual language"). Current · Compared · Variance · Δ%, equal billing under
their own labels, colour on the two variance cells alone. The hero said the same
thing three rows deep and left the two balances a reviewer ties back to as the
smallest text in the block. Weight is `--fw-medium`, not the reference's 700 — rule 7
admits two weights and 700 is not one. The favourable/unfavourable word rides in the
Variance cell's LABEL, and drops when the line did not move (`Variance · no movement`
overflowed the band and said nothing the `0.0` did not).

**Key drivers is a list that FOOTS**, which **retires the contribution bars** of
2026-08-25. The reference's own note is the argument: the drivers foot to the header's
variance, and that is what the Total row is for. The bars restated a percentage
printed beside them and broke the footing — four independently scaled widths do not
visibly add to a whole. Two things that must not come back:

- **The unexplained residual is NOT a driver.** Drivers decompose what moved; the
  residual measures how much of that movement nobody has ACCEPTED an explanation for.
  Different axes over the same total — printing `0.9 + 0.3 + 0.2 + 1.4` under a Total
  of `1.4` asks the reader to believe 2.8 = 1.4.
- **The plug absorbs the rounding.** Deriving the remainder from true values leaves
  the PRINTED column off by a tenth. A reviewer checking a column is not holding the
  unrounded figures.

**Evidence is a workpaper index** — File · Uploaded by · Ref. · Status. `Ref.` and
`Status` are derived and honest about what this model knows: Ref. counts the accepted
items citing a document, and the line's own sign-off IS the verification event, so an
approved line reads Verified and everything else Pending. There is no separate
document-approval workflow and inventing a badge for one would assert a control that
does not exist. `evidenceDocs()` dedupes by name and is read by the tab count, the
table AND the Overview card — `evidenceFor()` returns one row per CITATION, so
counting it made the tab say 3 while the table listed 2.

**History reads: the series → the memory → the log.** Balance & movement by period
(two columns, newest first), prior-period explanation with its framing note, then
Activity as a timeline with a round type badge per event. The badge is a tinted disc
with a coloured glyph, **not** the reference's saturated disc with a white one:
`--warning` is a dark amber in light mode and a LIGHT amber in dark, so a white glyph
reads ~2:1 on half the themes. `histFocus` no longer reorders the sections — a tab
whose sections move depending on how you arrived cannot be learned.

**THE REVIEW CONVERSATION**

- **A return posts its reason INTO the thread**, tagged at the preparer, marked
  `Changes requested`. It went to `rc.revNote` — a field surfaced as a status caption
  — so the trail read: Korvyn drafted, a preparer explained, and then the line was
  inexplicably back with the preparer. `rc.revNote` is still written, so the footer
  and grid are untouched. `cmtPost()` is the single writer for the thread.
- **Every message states which side of the review is speaking** (`cmtRole`), derived
  from the RECORD, never from a job title — a Controller is preparer on one line and
  reviewer on the next, which is what `canReviewLine()` is about.
- **A status pill renders only where a status exists.** The reference shows
  Superseded / Included in rollup / Approved / Excluded because its rollup carries
  them; a discussion comment here carries none and gets no pill rather than a
  decorative one.

**KORVYN DRAFTS EVERY LINE, not only the material ones.** The gate was `r.req`, so
the population a reviewer most wants a fast read on — the lines nobody will work by
hand — was the one place with no machine help. Materiality decides whether an
explanation is REQUIRED; it was never a statement about whether Korvyn can write one.
Strictly additive; the surviving guards are that a dismissed draft stays dismissed and
that a line which did not move has nothing to explain. `bestExplanation(r,rc,noGen)`
takes a third argument because the GRID asks about every visible row and only wants to
know whether something is inherited — generating there would run `explainObj()` per
row and materialise a `CMT` record for every line as a side effect of rendering.

**The statement column gains `Ready` and `Explained`** (`FXST`), and this closed a
hole rather than adding a word: with items accepted and the record still in draft,
**no branch fired and the cell rendered EMPTY** — explaining a line erased its status.
A written narrative with no items was worse, reading "Needs explanation" over an
explanation somebody had written. `Ready` vs `Explained` is whether anyone is waiting:
only a `req` line can be handed over. "Draft ready" was renamed **"Korvyn drafted"** —
it meant the near-opposite of ready. `fxStateKey()` is the one derivation; the column
and the hover peek both read it.

**A HOVER PEEK on the Explanation cell** reads the words without opening anything.
Deliberately NOT the `pop()` system — a pop traps focus and swallows the click heading
for the panel underneath; this is a transient read. On an immaterial line the mark is
a quiet indigo **K**, absent at rest and revealed on row hover or focus, the same
discipline the star gutter uses (`opacity:0`, never `visibility:hidden`).

**FULL SCREEN gains a General ledger tab** — every entry behind the line, NOT the
drilled slice. The drill reaches journal entries only under the node you pinned and
only after five clicks; this is the question a reviewer asks before signing. Rows link
out through `erpLink()`, the app's existing "View in ERP" language.

**WINDOW CONTROLS ARE ONE PRIMITIVE** across every docked panel — `#fxRoot .rw-ib`
and `.cp-head .cp-tool` on one rule. They were drawn five ways: 26 vs 24px targets,
15 vs 14px glyphs, `--muted` vs `--n-400`, two hover fills, a 2px cluster gap against
9px. **A third panel joins that rule; it never copies the values.** The collapse
chevron is gone in both — a chevron says "next", the arrow-into-a-bar says "fold this
panel to the edge", which is what the control does.

**THE KORVYN ASSISTANT TAKES THE SAME FORMAT.** Same bands, same rail at `--s-4`,
same window controls, sentence-case section titles (the labels were already written in
sentence case — only the CSS was shouting them), suggestions as rows in the band
rather than boxes in it. The greeting keeps its indigo wash: that is Korvyn's own
voice (rule 2), not decoration.

**THE STATEMENT SHEDS COLUMNS RATHER THAN RUNNING UNDER THE PANEL.** With the review
panel and the Assistant both open the table was **691px inside a 487px box**. Every
column is `white-space:nowrap` so it cannot compress, and `.fx-table` is deliberately
`overflow:visible` (an overflow ancestor breaks the sticky column heads — see the trap
in the BOXY block), so the extra 204px drew *underneath* the panel with nothing on
screen saying so. `fxShed()` drops columns by CLASS in a stated order — Δ%, then the
analytics columns, then Explanation last because it is the column a reviewer scans —
down to a floor of line + current + compared + Δ amount. Two rules:

- **Hide by class, never by rebuilding the column set.** `S.cols` is what the reviewer
  chose and must survive a resize.
- **Measure the TRACK, not the table.** Hiding a column changes the table's width and
  never the track's, which is what keeps this from looping.

Body cells carry `data-c="<col>"`, injected at the one place cells are built, because
the headers had `col-*` classes and the cells had nothing — a column could not be
addressed as a column, and `:nth-child` is unsafe when the column SET is user-chosen.

**`.ai` IS A GLOBAL COMPONENT, NOT A MODIFIER.** It is the AI answer panel (~line
1469) and carries `display:none` until `.ai.show`. Used as a local modifier it renders
the element at 0×0 with opacity 1. This bit twice in one session — once on the
statement's Korvyn mark, once on the explanation prose. The token for the colour is
`--ai`; the local modifier is `krv`. `.rw-av.ai` and `.rw-msg.ai` survive only because
their own rules re-declare `display`.

**Specificity notes worth keeping.** Three fixes failed silently before landing:
`#fxRoot.dw-page .fx-detail .dw-body` ties with `#fxRoot.aw .fx-detail .dw-body` and
loses on source order (use `#fxRoot.aw.dw-page`); the card-vs-inner-box override ties
with `#fxRoot.aw:not(.dw-page) .fx-detail .rw-wf` and must sit BELOW it in the sheet;
and `.rw-rg:first-child{border-top:none}` stripped a card's own top border until it
was scoped `:not(.rw-card)` — invisible in light mode, a bright line in dark.

**Verified:** 63 view keys render, 0 console errors, 10/10 chrome themes AA, dark mode
holds in both densities. Band edges, rail identity, box-in-box, nested and collapsed
cards, uppercase titles, truncated figures and header/body cell counts asserted across
21 lines × 4 dock tabs, 6 page tabs and both Assistant tabs.

**THE 200% DUPLICATION IS FIXED** (later the same day). `kdAccept()` and
`exPropose()`/`sugAccept()`/`sugAllAccept()` each pushed into `rc.items` from the same
decomposition and neither knew the other existed — `suggest()` walked
`drivers(id).bySeg`, which IS `byDim(id,'seg')`, the very call `explainObj()` already
made, then applied its own reason map and its own sentence. Using both, which the UI
invited, took a line from 100% explained / 0.0 residual to **200% explained / 1.4
residual** with no warning.

Three changes, in this order of importance:

1. **A driver carries a stable key onto the item it becomes** (`kdKey`, from
   `kdKeyOf`), and every path that turns a driver into an item goes through
   `kdAddDriver()`. Accepting the same driver twice is now impossible rather than
   discouraged — the guard is in the WRITER, not in each call site. There are exactly
   two `rc.items.push` sites left: that writer, and `exSave()` where a person types
   an item from nothing.
2. **`suggest()` builds from `explainObj(r).drivers`** with `kdReason` and
   `kdItemNote` — one source, one reason mapping, one wording. It also filters out
   drivers already on the line, so regenerating after accepting a draft proposes what
   is genuinely left instead of offering the same four again. The unattributed
   remainder is keyed `gap:rest` and measured against what the LINE holds, not against
   the proposal list, or accepting a draft first would leave a gap that double-counts.
3. **The key survives the item editor.** Without `kdKey` carried through `exSave()`,
   editing a suggestion and then accepting the same driver from the draft would put it
   on the line twice — the edit would have laundered away the only thing the guard
   reads.

Every path now **reports what it skipped** rather than quietly doing less than its
button said ("3 drivers accepted, 1 already on the line").

Verified across all 21 statement lines with the orders interleaved — draft→suggestions,
suggestions→draft, draft twice, and edit-a-suggestion→draft: coverage never exceeds
100%, no line accumulates duplicate items, and the edited item stays edited while the
draft adds only the drivers it does not already hold.

## 2026-08-29 — the full screen is brought onto the dock's grammar

Owner's direction: refine the inspect panel and **review the full-screen version**,
"make everything consistent". The pass above brought the DOCK onto the reference's
shape and left the full page behind it on eight counts. Every one below was measured
before it was changed, and every one is a case of the same rule being enforced at one
density and not the other.

**OVERVIEW MEANS THE SAME THING AT BOTH DENSITIES.** `RW_LAYOUT.page` mounted the FULL
contents of four other tabs into the page's Overview — the drill, the evidence table
and its financial source, the whole comment thread and composer, the period trend, the
prior-period explanation and the activity log: **thirteen regions** against the dock's
five. Since full screen started swapping rather than scrolling (2026-08-28), that left
six tabs of which one contained five, so `evid`, `drill`, `prior`, `trend`, `trail` and
the thread were each reachable two ways — which is exactly how the two compositions
drifted apart in the first place.

It is now the reference's five, in the three columns' own argument:

| Column | Parts |
|---|---|
| **judge** — is this defensible, and what is stopping it | `explain` · `attn` |
| **comp** — the decomposition and its support | `drivers` · `evidRow` |
| **rec** — the record and the conversation | `reviewer` · `cmtPeek` |

`attn` is the ONE page-only addition and that stays deliberate: the itemised blockers
need room a 440px dock does not have. `evidRow` and `cmtPeek` are the same summaries
the dock uses — a count and a chevron through to the tab, never a second copy of it.
Everything that left is one click away on the tab that owns it, and each is now in
exactly one place. **Do not re-mount a tab's full contents into Overview.**

**`drivers()` had a hard `if(X.page)return ''`.** So the card the reference calls Key
drivers — one of its five — did not exist at the density with the most room for it, and
`drill` stood where it should have been **with no section title at all**: a nameless
band in a stack of named ones. The guard is gone; the drill is the Drivers tab's own
content, which is what that tab is for.

**A SOLO TAB'S BANDS ARE THE SAME BANDS OVERVIEW'S COLUMNS DRAW.**
`#fxRoot .rw-col.solo .rw-rg+.rw-rg` is one id and FOUR classes and so beat the page's
card rule (one id, three) — so from the second band down every solo tab drew a 20px
margin, a 20px top padding **and** a top border directly under the previous band's
bottom border. Measured: Evidence and History at `20px 16px 16px` against Overview's
flat `16px`, and History's middle band carrying `border-top:1px` *and*
`border-bottom:1px` — **two hairlines 20px apart** where every other band in the panel
has one. The `:not(.rw-card)` guard had been carried over from the rule above it, where
it exists to stop a card losing its own top edge; here it excluded precisely the
elements that needed the reset. Two rules now: the reset undoes the `.solo` separation,
and a second restores the card's own `padding-top` — zeroing it for everything put the
title hard against the hairline (caught on the first pass).

**THE CARD TITLE IS ONE COLOUR.** `.rw-card .rw-sec` declares `color:var(--ink)` where
the card treatment is defined and **neither density was getting it**:
`#fxRoot.aw .fx-detail .rw-sec` (`--hint`) and `#fxRoot.aw:not(.dw-page) …` (`--muted`)
are each declared later and each wins its tie on source order, so the same title
rendered **n-600 in the dock and n-500 on the page** — two ramp steps apart, which reads
as two kinds of heading rather than as a drift. Restored to the declared intent rather
than picking a winner between the two accidents: a card states its own name, so the
name is ink; the quiet tracked label those rules were written for is a BARE `.rw-sec`
on a band, which they still govern.

**ONE TAB ORDER AND ONE BADGE RULE.** The dock read Overview · Comments · Evidence ·
History; the page read … Evidence · Comments · History — one vocabulary presented in
two orders, so the tab a reviewer reaches for moved when the panel changed size. The
page also showed a bare gap dot on Evidence and **nothing at all** on History, so the
same tab answered "how much is here?" in the dock and refused to on the full screen.
Both strips are declared as data now (`FX_DOCKTABS` beside `FX_PAGETABS`) and read one
`badgeOf()` — the two hand-written literals with two badge rules inside them are what
let the orders and the counts diverge. Rule 12 is unchanged: a `.ct` count is quiet
inventory, the dot is the one thing action-owed. The two page-only analytical tabs sit
together straight after Overview, which is the order the drill-down is walked.

**THE WORKLIST TILES NEVER STOOD DOWN.** `#fxRoot.dw-page>.fx-work{display:none}` is one
id and two classes; `body.fx-mercury #fxRoot .fx-work{display:flex}` is one id, two
classes **and an element**, and later in the sheet — so the tiles out-specified their own
stand-down and stayed on screen (measured `display:flex`, 64px) above a sheet whose
whole point is to take the screen. Exactly the family of trap the neighbouring comment
already warns about for the margin shorthand: **that subtree restyles rows page mode has
already retired, so scope the restyle to the density that has the rows**
(`#fxRoot:not(.dw-page)`), never by adding `!important` to the stand-down.

**"Conversation" was still a second name for the thread.** The 2026-08-29 ruling above
records that the tab, the header and the Overview peek all say *Comments*; the tab was
renamed and **the card header was not**. Renamed at the one call site.

**An empty state is still a band.** `cmtStream` is in `RW_NOCARD` because its normal
output is a list of message cards — but with nothing to say it returns a bare
`.rw-quiet`, which inherited padding from nothing and printed "Nothing said yet." hard
against the panel edge, **16px left of every other word in the panel**. Same fault on the
page, where the part mounts in a bare `.rw-rg`. One rule covers both.

**The panel's one segmented control takes the panel's control shape.** Inherited from
the global `.seg`, the General ledger filter was the only control in the inspector at
`--h-btn` (28px) while every button beside it is a `.sm` at `--h-btn-sm` (26px), and its
selected segment was a **filled cobalt** — a second filled primary competing with the
footer's real one, which is rule 13. It takes the tinted selected state this app already
uses for a chosen option everywhere else (`#fxRoot .tbtn.on`, the `.pop` single-select
row).

**Checked and found already correct**, so they are recorded rather than re-fixed: the
tab strip's text rail (the button box starts 10px left of the rail, its *text* lands on
it — `padding:0 calc(var(--s-4) - 10px)` plus the button's own 10px, by design); the
`--s-4` content rail across header, bands and footer in both densities (237 on the page,
982 in the dock, every element); and the scrollbar gutter reservation.

**Verified:** 60/60 views render; **160/160** combinations of 16 statement lines × 4 dock
tabs and 6 page tabs render with content; console clean; 10/10 chrome themes pass AA;
dark mode holds in both densities with the ink title reading light-on-dark and no
bright-line artifacts. Every band in every tab at both densities now measures
`padding:16px` with a single bottom hairline and the last band in a column carrying
none.

**Still open, and deliberately not changed here** — the full page's solo tabs draw one
bordered, 12px-radius column card on the gray body. That is the documented page
treatment (three columns side by side each have to read as their own document), but with
only ONE column it is a box inside the panel frame. Worth an owner's call rather than a
unilateral change.

## 2026-08-29 — comments follow the explanation they answer (peek and reply, not the thread)

Owner: *"wouldn't it be much better from the UX perspective that the comments are right
below the explanation — user/reviewer are making comments based on the explanation?"*
Correct about the defect, and this is the third time this has been in play, so the
numbers are recorded with the decision.

**What was wrong.** `cmtPeek` closed Overview, fifth of five. Measured on a typical
line in a 572px dock body: Explanation 0–229, Key drivers 229–441, Workflow & review
441–637, Evidence 637–704, **Comments 704–771** — the last thing said about the line
sat **132px below the fold and four cards away from the words it is about**. A reviewer
who had just read an explanation and wanted to question it scrolled past the whole
panel to find the box.

**Why not the whole thread**, which is what the 2026-08-29 pass above briefly did before
the reference composition was restored. The Comments tab measures **346px with an empty
thread and 789px** on `ga`, the one seeded line with three messages. Mounted under the
Explanation card that pushes Workflow & review — status, coverage, residual, who is
next — from y=441 to **y≈1150: two screens below the words being judged**. The panel
would bury the verdict under the conversation, which is the opposite failure.

The argument that carried the inline version has also since been retired by another
change: **a Return already posts its reason into the thread**, so the reviewer standing
at the point of decision is no longer without a way to say why.

**What shipped.** `cmtPeek` is SECOND — `['explain','cmtPeek','drivers','reviewer',
'evidRow']` — and carries the last message plus `cmtComposer()`, the same one-line
composer the Comments tab uses, which reveals its byline and Post/Clear only once there
is a draft. The archive, the filters, the threaded replies and the "awaiting" worklist
stay on the tab that owns them. Measured cost: the Comments card goes 67px → 145px
(188px with a message), so Workflow & review moves 441 → 586 in the dock. **The verdict
was already below the fold at 441 in a 554–613px body**; the state band at the top of
the panel and the footer's actions are what is pinned, and neither moved.

**The page follows** — `page.judge` is `['explain','cmtPeek','attn']`, `comp` is
`['drivers','evidRow']`, `rec` is `['reviewer']` alone. On 1184px the three columns are
all in view, so the peek was below no fold there — but the panel must not answer "where
do I reply to this?" two different ways depending on its width.

**THE REFERENCE'S CARD ORDER IS WHAT THIS TRADES AWAY**, knowingly: `apps/review` reads
Explanation · Key drivers · Workflow & review · Evidence · Comments. Adjacency to the
explanation beat matching that order. The five cards and their contents are otherwise
untouched. **If this is ever reversed again, reverse the ORDER, not the composer** —
the reply box beside the explanation is the thing that was actually asked for.

**Standing down is not the same as disappearing.** `cmtComp` may render nothing while
`S.cmtReplyTo` is set, because the composer it defers to is three rows above it inside
the group it is aimed at. From Overview that box is on another tab, so the same silent
stand-down just deletes the reply affordance — click Reply, come back to read the
explanation, and the box is gone. The peek renders `.rw-peekaim` instead: one quiet line
naming where the reply is, with a button back to it. Round-trips verified, including
Cancel restoring the composer.

**One composer, one caret** — the peek and `cmtComp` both emit `#cmtIn`, and they are on
different tabs in both densities. Asserted: across **160** combinations of 16 lines × 4
dock tabs and 6 page tabs there is never more than one `#cmtIn` in the document.

**Verified end to end:** typing sets `.live` with no repaint (the caret contract
`cmtField` holds); posting from Overview writes to the thread, moves the peek count
0 → 1, updates the last-message line to what was written, updates the Comments tab
badge, clears the draft and leaves the reviewer on Overview. 60/60 views · 160/160
tab/density combinations · console clean · 10/10 chrome themes AA · dark mode holds in
both densities · band grammar unchanged (every band still `padding:16px` with one bottom
hairline).

## 2026-08-29 — Overview, Evidence and History against the reference, card by card

Owner's direction with the reference inspector's three screenshots. Everything here is
either a structural gap against that specimen or a rule the panel was breaking to get
closer to it. **Where the reference uses colour and this system does not, the system
wins** — that ruling is made three times below and it is the through-line of the pass.

**KEY DRIVERS FOOT IN PLAIN INK.** Every driver row and the Total carried
`.dlt.up`/`.dlt.dn`, so a card whose entire job is a decomposition adding to a total
rendered as four or five green figures over a green Total. Rule 3 read backwards: red,
amber and green are STATE, "never decoration, never a series colour", and a driver
amount is exactly a series value. The one state on the line is already coloured, once,
in the header band's Variance cell. The explicit `+`/`−` sign carries direction
losslessly — which is what a footing schedule uses — and survives greyscale and all ten
chrome themes. The reference prints them plain too.

**WORKFLOW & REVIEW GAINS A CLOCK, AND IT IS A REAL ONE.** The reference closes on
"Target sign-off · Aug 5, 2026 · 4 days left"; this model has **no per-line sign-off
target**, and inventing one would assert a control nobody built — the same reason the
evidence table derives Verified/Pending from the line's own sign-off rather than badging
a document-approval workflow that does not exist. What does exist is the explanation
REQUEST raised on the line, with a real due date and a real lateness instant. The row is
**Response due**, under its own honest name, and it is absent when no request is open
rather than printing a placeholder. Matched on line AND statement AND period — a request
raised against another comparison is not this line's clock.

*Count days end-of-day to end-of-day.* `dueParts()` sets `dueTs` to 23:59:59.999 of the
due day, so `Math.ceil((dueTs - Date.now())/864e5)` turns a request the controller chose
as "In 5 days" into "**6 days left**" for all but the last second of today (observed).
Measured against the end of today it is a whole number by construction and reads back
exactly what was chosen.

**A FILE STATES ITS TYPE.** Every document rendered the same `▤` glyph, so a reviewer
scanning evidence could not tell the PDF approval from the XLSX rollforward without
reading the extension off the end of a name the table truncates. The reference
distinguishes them **by colour** — a red PDF icon, a green spreadsheet — which is not
available here (rule 3; a file format is not a state). `fileKind()` renders a short
monochrome tag instead: it sits at the START of the row so truncation cannot eat it, and
gives the names a common left edge. One helper, read by the Overview card and the
Evidence table both, so the two speak one vocabulary. 5.73:1 light, 6.62:1 dark.

**"+ Add document" WAS AN EMPTY FIELD.** Its rule sits inside the comment composer's
block and had picked up the composer's shape — solid hairline box, left-aligned muted
text, `cursor:text` — on a control whose only act is to open a file picker. Dashed,
centred, accent ink: what the reference draws and what the pattern means everywhere
else. An outline, not a fill, so the footer's Submit is still the panel's one filled
primary (rule 13).

**THE ACTIVITY TIMELINE: THE GLYPH CARRIES THE KIND, COLOUR CARRIES THE STATE.** Four of
`RW_ACTS`' seven rules painted a state colour on an event that is not a state —
submitting and reassigning were amber, **attaching a document was green**, a comment took
the accent — so a line worked normally for a week read as a column of alarms and
successes, and three attachments in a row said "three things passed". Colour is now the
two events that ARE states (approved; returned or reopened), so a healthy review reads
monochrome and the one amber disc in a timeline is worth looking at.

The table grew to ten rules and **every act string `logA()` actually writes now maps to a
specific glyph — nothing falls through to the generic bullet** (asserted by evaluating
the shipped `RW_ACTS` against all 27 of them). Order is precedence and three pairs were
wrong or missing:

- `/withdraw/` **never matched anything** — `logA` writes "with**drew** the explanation
  request", which the longer stem misses; it fell through to `/request/` and reported a
  withdrawal as a request. Match the stem, `/withdr/`.
- `/request/` must precede `/explan/` — "requested an explanation from …" contains both.
- "completed the review at …" reached no rule at all: `/reviewed/` does not match "the
  review". It is named in the approval rule now.

**A DENSITY CHANGE IS NOT AN AUDIT EVENT.** `dwPage()` logged "opened the full review
page" / "returned to the docked workspace" into the LINE'S append-only record — a view
toggle in a trail whose own caption promises that edits record the value before and
after. Nothing changed, so there was nothing to record, and it was not harmless: reading
one line at both densities during a single session drove its History count **from 0 to
9** (observed), burying the two entries that were real. Worse, "returned to the docked
workspace" matches `/return/`, so every collapse badged itself amber as though the
reviewer had sent the line back to its preparer.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10
chrome themes AA · band grammar unchanged (226 + 186 + 32 across the three shapes) ·
never more than one `#cmtIn` · the trail holds at 4 entries across two full-screen
round trips · new elements measured in both modes — type tag 5.73/6.62, Add document
7.29/8.63, the due pill 6.32/7.32, the neutral activity badge 6.32/7.32.

## 2026-08-29 — the content plane had no contrast gate, and it showed

Owner, comparing a BlackLine screenshot: *"why does it look so clear — is it the font or
the background?"* Neither, mostly. Their Analytics tab shows six objects; the Flux page
renders 204 text nodes, 194 of them at 12px or smaller. That part is a product difference
and not fixable by styling. What WAS fixable is the second cause: **a large share of this
app's small text was painted in greys that fail WCAG AA**, and nothing checked it.

**`check_chrome_themes.mjs` covers the CHROME plane — ribbon, rail, close strip — and it
has been passing 10/10 the whole time.** The content plane had no gate at all. A DOM sweep
of all 60 views in both modes found **3,641 text elements below the AA floor**, including
the four period labels under the inspect panel's header figures (2.36:1), "Korvyn draft —
not yet accepted by a preparer" (2.36:1) and the statement's "3 lines · 1 open" (2.09:1).

**THE RAMP ALREADY SAID SO.** `--n-400`'s own comment is *"placeholder, disabled, trailing
glyphs"* — and `--faint` pointed at it while **141 CSS rules and 9 JS literals used it as
`color:` for real words**. This was documented misuse, not a judgment call. `--faint` is no
longer a foreground: the only two survivors are a `::placeholder` and one `[disabled]`
control, which are the two contrast exemptions WCAG actually grants.

**`--hint` PASSED ON A CARD AND FAILED ON THE PAGE.** `#6B7285` reads 4.80:1 on `--surface`
but **4.25:1 on `--bg` / `--n-100`** — so the same label cleared AA inside a card and failed
on the page background and on every section-header bar. Light `--n-500` is nudged 30% toward
n-600 (`#656C7F`): worst 4.64:1 across all six content surfaces, still a visible 1.24:1 step
from n-600, dark ramp untouched. That makes the step's own stated role — "secondary text,
labels" — true for the first time.

**WHITE INK ON A SEMANTIC FILL INVERTS AND NOBODY HAD NOTICED.** `--on-accent` / `--on-neg`
are `#FFFFFF` in BOTH token blocks. That is right in light mode (white clears AA on every
semantic: warning 5.42, pos 5.40, neg 5.62, accent 5.50, accent-2 4.95) and wrong in dark,
where the semantics go LIGHT: **2.19:1 on the dark amber, 2.21 on green, 2.68 on the
accent** — measured on the close-timeline segments and the `.n.q` count badge, the two
places a fill is coloured from DATA so no CSS rule states the pairing. New token
**`--on-fill`**: white in light, `#141824` in dark, worst 5.40/5.77. It cannot be
`var(--n-900)` — that step inverts too.

Also: `.th-sort .ar` (the sort caret, an affordance) was painted in `--n-300`, a BORDER
step, at 1.43:1; `.t.krv` used `--ai` (the surface hue) where `--ai-ink` is the reading
colour, 4.47:1; and light `--accent-2` read 4.37:1 as a figure colour on `--bg`, nudged
`#0E7C86` → `#0D757E` (4.83 on `--bg`, 5.47 on white).

**Result: 3,641 → 0.** What remains is 21 elements across two separator classes — a `·`
between two labels and a `›` between two lifecycle stages. Those are decoration, WCAG
exempts decoration, and making them legible would make them compete with the text they
separate. They are named in the checker's `DECORATIVE` list so the decision is recorded
rather than passing silently; if either ever carries meaning it leaves that list rather
than gaining an exception.

### `tools/check_text_contrast.mjs` — the gate that was missing

Three gates, one per way this happened, all static and all reading the tokens out of
`index.html` rather than restating them:

| Gate | Catches |
|---|---|
| **ROLE** | a TEXT token failing AA on any content surface in either mode — the `--hint` case |
| **USE** | a NOT-A-FOREGROUND token appearing as a `color:`, in CSS **or in a JS style string** |
| **ON-FILL** | `--on-fill` failing AA on any saturated semantic in either mode |

The JS-literal arm is not belt-and-braces: after every CSS rule had been moved off
`--faint`, the statement still rendered "Not applicable" at 2.36:1 because its colour was
assembled in a template (`c:'var(--faint)'`). A CSS-only scan would have declared victory.

**Negative-tested, because a gate that only ever passes is worthless.** Each of the three
was re-broken in turn against a backup and each failed with the right message and exit 1 —
ROLE reported `--hint on --bg = 4.25:1`, USE named both the CSS line and the JS literal,
ON-FILL listed all five fills at 2.19–3.07.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10
chrome themes still AA · 0 content text failures in light and dark. One scanner lesson
worth keeping: **kill transitions before measuring computed colour.** `.cp-ubtn` and others
carry `transition:` on all properties, so a sweep that flips the theme and measures
immediately reads mid-transition values — that produced ~1,200 phantom failures until
`*{transition:none!important}` went in.

## 2026-08-29 — the card title steps up: `--fs-card` 15px → 17px

Owner's direction, and the third of the three causes behind *"why does BlackLine look so
clear"*. The first is density and is a product question; the second was contrast and is
fixed above; this is the last one that is purely typographic.

**A card has to resolve as ONE OBJECT before any of it is read**, and what carries that is
the jump from its title to its body. At 15px/500 over 12px/400 the jump was **1.25× and one
weight step** — which is why a screen of six cards read as one continuous field of text
beside a reference whose titles step roughly 1.6×. 17px takes it to **1.42× on size alone.**

**No third weight, deliberately.** Design rule 7 admits two — 400 and 500 — and the
reference gets its jump partly from a heavier face. Buying the same effect with size keeps
the rule intact; if 1.42× still reads soft, the next move is the owner's call to amend rule
7, not a quiet 600 slipped in here.

**Still six type sizes.** This changes a value in the scale, it does not add one:
10 / 11 / 12 / 13 / **17** / 20.

**What actually moved, checked rather than assumed.** `--fs-card` has 78 callers and is not
only titles — the CSS also points figures, two search inputs and the rail wordmark at it, so
the bump could have enlarged the wrong things. Swept every view for elements now computing
to 17px: **115 card `h2`s, the panel's `.rw-sec` titles, `fr-title`, `trace-title`,
`trace-chain-h`, `cp-title`, `cp-lbl`, `card-hd`** — all titles — plus the inspect panel's
four header figures (`rw-met-v`) and one hero delta, where a step up suits them, and the
Evidence/Comments jump rows, which are card titles. The at-risk callers I was watching
(`.ai-body`, `.cmd input`, `.cmdk-in input`, `.residual`, `.det-c .v`, `.rail-name`) are
**not in the DOM in any reachable state** — dead CSS for surfaces that no longer render. So
nothing visible was wrongly enlarged, and nothing needed pinning back after all.

**No layout gave way.** Overflow sweep over 13k elements across all 60 views before and
after: **the same 10 groups both times**, every one pre-existing (SVG attribute artifacts
and three 3px card-rounding cases). No new clipping, no new wrapping.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10
chrome themes AA · content text gate clean · panel band grammar unchanged (128 bands at
`padding:16px` with a bottom hairline, 61 last-in-column without).

**What this step did NOT touch:** the font stack, the spacing scale, the weights, density.
Verified against the diff — no `--sans`, `--num`, `--s-*`, `--fw-*` or `--h-*` token
changed. (The two steps below then took the weight and the colour deliberately.)

## 2026-08-29 — a third weight, and the quiet text scale one step darker

Owner: *"complete all 3 steps"* — the remaining two levers from the BlackLine comparison,
taken knowingly rather than by default.

**A THIRD WEIGHT. THIS AMENDS DESIGN RULE 7**, which said "TWO font weights: 400 and 500".
`--fw-strong:600` exists now and is spent on ONE thing: the title of a card or panel
region. With `--fs-card` at 17px that puts a title at 1.42× its body on size and the rest
of the distance on weight.

- **It is not for figures.** Several `--fs-card` callers are amounts, not titles
  (`.residual`, `.gltr-hero-d`, `.radar-card .capcol .amt`, `.fr-row.tot .fr-val`,
  `.hm-node .n`). A heavier numeral says "this number is emphasised", which is a different
  claim from "this block is called X". They stay at 500, which is why the rule that applies
  600 **lists its selectors** instead of keying off `font-size:var(--fs-card)`.
- **FONT-WEIGHT INHERITS, and a title is usually a flex row.** Bolding `.card h2` bolded
  everything the card hangs beside its name: measured — "View by:", "($214M)", a
  "Quarterly" button, the ▸ fold caret, six SVG percentages, and in the panel the jump
  row's count, its "7 awaiting" and its "›". Only the title's own TEXT takes the weight;
  `.card h2 > *` and friends reset element children to 500, and the jump row is targeted at
  `.l` rather than at the button.
- **The rule sits at the FOOT of the sheet.** Each member ties with what it overrides —
  `.card h2` against `.card h2` — and a tie breaks on source order. `.rw-sec` needed one id
  and FOUR classes to clear `#fxRoot.aw:not(.dw-page) .fx-detail .rw-sec`, which sets 500;
  written with three it silently lost (caught in the sweep, not by reading).

**AND THE BROWSER'S OWN BOLD WAS ALREADY A FOURTH WEIGHT.** `b`/`strong` are set to
`--fw-medium` in about a dozen SCOPED rules, so a `<b>` inside those was fine and a bare one
anywhere else fell through to the UA default `bolder` = **700**. Measured: **543 elements**
across the app, undeclared, under a rule that admitted two. They now take `--fw-strong` —
they are emphasis and are meant to be heavier, and de-bolding 543 of them would be a change
made for tidiness rather than for reading. **The app now renders exactly three weights:
400 (4,728) · 500 (2,303) · 600 (680). Nothing arrives from the user agent.**

**THE QUIET TEXT SCALE MOVED ONE RAMP STEP DARKER.** `--muted` is the most-used text colour
in the app — 61 of 204 text elements on the Flux page, more than `--ink` — and at 6.48:1 it
was why a screen of labels read soft. Both quiet aliases step down one:

| | was | now |
|---|---|---|
| `--ink-strong` n-900 | 17.71:1 | unchanged |
| `--ink` n-800 | 14.12:1 | unchanged |
| `--muted` | n-600 · 6.48 / 5.73 on `--bg` | **n-700 · 10.00 / 8.84** |
| `--hint` | n-500 · 4.80 / 4.25 | **n-600 · 6.48 / 5.73** |

Four levels, all clear of AA on every content surface in both modes, and the whole scale
darker rather than one rule patched. n-500's own tuning (`#6B7285` → `#656C7F`) still stands
and is still load-bearing — **85 rules name `var(--n-500)` directly** rather than going
through `--hint`, and at the old value those read 4.25:1 on `--bg`.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10
chrome themes AA · content gate clean, worst `--muted` 8.84 and `--hint` 5.73 · band grammar
unchanged · dark mode holds · **overflow sweep identical to baseline** — the one panel row
that overflows (`.rw-idrow`, 411>407) measures the same with `--fs-card` and `--fw-strong`
forced back to their old values, so it is pre-existing and nothing is clipped (controls at
1725 inside a panel edge at 1737).

## 2026-08-29 — the type and density passes go PLATFORM-WIDE, and the CDN font dependency goes

Owner: *"I need you to update the fonts/density etc for the entire platform — I can see that
you did not [make] platform wide changes."* Correct on both counts, and the second one had a
specific cause worth recording.

**THE CHROME PLANE WAS EXCLUDED, AND THE CHROME IS WHAT YOU SEE ON EVERY SCREEN.** The
contrast, weight and size passes above moved `--muted` / `--hint` / `--fs-card` /
`--fw-strong`. The ribbon, rail and close strip do not use any of them — they run on
`--chrome-text*`, driven by the ten theme definitions, and only **6 of 152** chrome rules
reference `--muted`/`--hint` at all. So every one of those passes was genuinely platform-wide
*across the 60 content views* and changed nothing about the frame around them. Measured
before: ribbon nav 13px/400, rail items 12px/400, close strip 11px/500 — untouched.

### The font was never the app's own

`index.html` declared **zero `@font-face`** and carried
`@import url('https://fonts.googleapis.com/css2?family=Inter&family=Newsreader&family=IBM+Plex+Mono')`.
So two recorded claims were false: *"no build step, no external runtime dependencies"* and
*"it keeps the file self-contained — no `@font-face`, no CDN"*. Every open made a network
request, and offline or behind a locked-down network the whole type system silently fell
back. **Inter was already being fetched and then not used**, because `--sans` led with Segoe.

- **Inter is embedded** (71KB variable woff2, lifted from `apps/review`, which has shipped it
  all along) and leads `--sans`. This does not overrule the 2026-08-28 decision, it retires
  its reason: *"leaving it first would mean the change is invisible on any machine that has
  it installed"* was an argument against relying on a LOCAL install. Embedded, every machine
  renders the same face.
- **IBM Plex Mono is embedded**, three weights — 400/500/600, matching the declared scale.
  700 is deliberately not shipped: `b,strong` is pinned to 600, so nothing asks for it.
- **Newsreader is dropped** and `--serif` falls back to Georgia. Three callers, all AI-panel
  prose. A network dependency for three italic paragraphs is not a trade worth making.
- **The `@import` is deleted.** `document.fonts` now lists exactly two families, both from
  embedded payloads, and the page issues **no font network requests**. Self-containment is
  true for the first time. +167KB on a 2.6MB file.

**Inter is 6.5% wider than the face it replaced**, which in a `white-space:nowrap` app is a
real risk. Swept all 60 views: overflow groups went **10 → 7** — the extra card padding
resolved three pre-existing ones and Inter introduced none. **Tabular figures are exact,
0.000px spread across all ten digits**, so every numeric column still aligns (rule 14).

### Density, at the tokens

Every value below was OFF the 4px `--s-*` scale the system declares, which is why the app
read tight and slightly arbitrary rather than tight and deliberate. Each moves to the nearest
step up, so the platform gains air in one place rather than in 800 rules:

| token | was | now | reach |
|---|---|---|---|
| `--pad-card` | 13px | **16px** (`--s-4`) | 129 cards |
| `--pad-cell` | 0 10px | **0 12px** (`--s-3`) | every table |
| `--pad-kpi` | 9px 16px | **12px 16px** | every KPI strip |
| `--pad-toolbar` | 7px | **8px** (`--s-2`) | every toolbar |
| `--h-section` | 28px | **32px** | equal to `--h-tab` now |
| `--row-h` | 40px | **44px** | 459 rows |

**`--row-h` is the one that costs something** and it is the biggest single lever on how the
product feels: +4px on every row in the product. Dial it back HERE, never in the rules that
read it.

**The reference implementation was opting out.** `#fxRoot .fx-tbl td{height:34px}` was the
one table in the product ignoring `--row-h` — so the density pass would have moved every
table except the screen the rest of the product is measured against. It derives from the
token now (`calc(var(--row-h) - 4px)` = 40px), one step tighter for a stated reason: a flux
statement puts 25 lines on screen and the review panel takes 440px of it.

**Chrome joined the same scale**: rail items 12px → 13px (`--fs-ui`, matching the ribbon nav
they belong to), rail rows 6px → 7/8px vertical, and the rail wordmark onto `--fw-strong`.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10 chrome
themes AA · content text gate clean · **overflow 10 → 7** · rows 44 (459) / 40 (Flux) · card
padding 16px on all 129 · no font network requests · digit spread 0.000px.

**Still deliberately untouched:** how much is on a screen. Six objects versus 204 text nodes
is a decision about what a flux reviewer needs in front of them, and it belongs to the
product, not the stylesheet.

## 2026-08-29 — control heights, line-height and the close strip onto the scale

The token pass above moved the platform's look; this is the rule layer behind it, which
had not moved. Three things, all measured before and after.

**EIGHT CONTROL HEIGHTS BECAME THREE.** Across all 60 views, controls rendered at 22, 23,
26, 28, 30, 31, 33 and 36px against four declared tokens — because **almost nothing set
`height`**. The button family derived its box from `padding:9px` plus a line-height, so a
control's size was whatever the font happened to make it; only ~9% landed on a token.

Fixed at both ends. The tokens moved toward the air the density pass took —
**`--h-btn` 28 → 32** (so a standard button, a tab and a filter field are finally the same
height) and **`--h-btn-sm` 26 → 28**, with `--h-chip` 24 unchanged. Then the strays were
given a height *from* a token and horizontal padding only: `.btn-out`, `.btn-primary`,
`select`/`input[type=date]`, `.pgbtn`, `.det-b`, `.dt-btn`, `.selpill`, `.trace-act`,
`.trace-open`, `.pipe-allbtn`, `.btn-x`, `.ftabs button`.

**Result: 92% of controls on a token (241 of 261), three heights — 32 · 24 · 28.** The
remaining 20 are unclassed one-offs in single views (bare `<button>` at 33/38/29, three bare
inputs, `.trace-seg`); they are named here rather than swept, because each needs its own
view opened to place it and none is a shared component.

`.ftabs button` is on `--h-tab` now but is still **a second tab language** — the design
system says to add a tab row with the `.ktabs` primitive, never by restyling buttons.
Converting it is an HTML change across several views and is not in this pass; putting it on
the token at least stops the product's two tab rows measuring 44px and 32px.

**SIXTEEN LINE-HEIGHTS BECAME THREE.** `--lh-tight` / `--lh` / `--lh-relaxed` already
existed with sensible values (1.2 / 1.5 / 1.62) and had **four callers**. The CSS carried
1.02, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.42, 1.45, 1.5, 1.55, 1.6, 1.7 and 1.75
as literals. **119 declarations** were bucketed to the nearest token; `line-height:1` (×18)
and `0` (×5) are left alone, being glyph centring rather than typography. Every rendered
line-height now derives from one of the three.

**THE CLOSE STRIP'S LABELS WERE PROSE AT `--fs-micro`.** `.cstrip-l .tag` ("CLOSE") and
`.cstrip-m .m .mk` ("Day", "Complete") sat at 10px, and rule 6 reserves micro for "counts,
badge numerals, ornament captions ONLY". Both are uppercase tracked labels, which is what
`--fs-label` is for — 10px → 11px on the strip that is on screen at all times.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10
chrome themes AA · content text gate clean · overflow 7 groups, unchanged.

**Deliberately NOT swept: the off-4px-scale spacing** — **1,089 declarations in the CSS and
90 in template literals**. Each needs a round-up-or-down judgement, it would change the look
a third time, and the regression risk is real for a diminishing return. It is gated instead.

### `tools/check_spacing_scale.mjs` — a RATCHET, not a demand for zero

The gate records what is there today and **fails if it grows**. New code lands on the scale,
old code converges when a rule is touched for another reason, and the number only ever goes
down. A gate that demanded zero would be red from the first run and switched off by the
second.

- **Per VALUE, not one total**, so ten fewer 7px cannot pay for ten more 13px.
- **A value absent from the baseline fails on sight** — the actual case this exists to
  catch is somebody typing `padding:15px` into a new rule.
- **CSS and template literals are counted separately.** An inline style built in JS is the
  same mistake somewhere a stylesheet linter would never look, and one budget must not hide
  inside the other.
- **`--baseline` prints the current map, through the same scanner the gate uses.** Recompute
  it that way, never by hand: the first attempt at this baseline was written by a throwaway
  script whose regex was escaped wrong, and it was 89 short.

**A HALF-TOKENISED VALUE IS THE POINT, AND THE FIRST CUT MISSED IT.** Skipping any
declaration mentioning `var()` was the obvious way to avoid counting tokens, and it silently
ignored `padding:2px var(--s-2)` — a hard-coded literal sitting right beside a token, which
is exactly the thing worth catching. It strips `var()`/`calc()`/`clamp()`/`min()`/`max()`
sub-expressions instead and counts what is left, so a fully tokenised value reduces to
nothing and a mixed one is caught. That correction alone found **44 more**.

**Negative-tested on all four paths**: a new value fails as `NEW`, a half-tokenised value
fails as `UP` on 7px, a fully tokenised value including `calc(var(--s-4) - 2px)` passes and
counts nothing, and a genuine fix passes while printing the exact lowered baseline to paste.

## 2026-08-29 — the numerals: one face, one scale, all tabular

Owner: *"the fonts and number size/color texture, height, spacing are not consistent."*
Right, and measuring it found three real faults the token passes had not touched — one of
them introduced by this session's own work.

**62 ELEMENTS WERE RENDERING IN ARIAL.** A `<button>` or `<select>` that sets `font-size`
but no `font-family` falls through to the **user agent's** control font, which is Arial here.
`font:inherit` was on some button rules and missing from others — `.selpill`, `.trace-row-*`,
`.trace-act`, `.trace-open`, `.trace-seg`, `.btn-icon` — including **six figures**. That is
not something that can be kept right rule by rule, so it is one reset:
`button,input,select,textarea,optgroup{font-family:inherit}`. `<code>`/`<kbd>`/`<samp>` had
the same hole on the other side, falling through to the UA's generic `monospace` instead of
the IBM Plex Mono this file now embeds.

**`--fs-figure` WAS SMALLER THAN `--fs-card`, AND THIS SESSION DID THAT.** The figure size
sat one step ABOVE the card title at 16 vs 15. Raising the title to 17 and leaving the figure
at 16 inverted it — every KPI value in the product became smaller than the heading above it,
which is why the stat tiles stopped reading as figures. It is `var(--fs-page)` now: the role
keeps its own name for its 17 callers and the platform renders one fewer size. A worklist
figure hard-coding `font-size:22px` in the mercury block went with it.

**THE SCALE IS NOW ACTUALLY THE SCALE.** Chart labels were the last holdouts — SVG `<text>`
at 9, 15 and `size/4.4` (34px on a large donut), set as presentation attributes, which cannot
take a `var()`. They are `style="font-size:var(--fs-*)"` now; the geometry-derived donut
centre is capped with `min(calc(…), var(--fs-hero))` so it stays responsive without inventing
a size. Eleven glyph rules at 8/9px went to `--fs-micro`.

| measure | before | after |
|---|---|---|
| font families rendering | Inter, **Arial**, generic monospace | **Inter + IBM Plex Mono, nothing else** |
| text sizes off the scale | 16 · 22 · 34 · 15 · 9 · 8 | **none** |
| numerals tabular | 1649 / 1649 | 1649 / 1649 (this one was already right) |
| distinct family/size/weight combos | 29 | **20** |

**The declared scale, corrected:** `--fs-micro` 10 · `--fs-label` 11 · `--fs-table` 12 ·
`--fs-ui` 13 · `--fs-card` 17 · `--fs-page` 20, plus `--fs-hero` 28. `--fs-figure` is an
ALIAS of `--fs-page`, not a seventh size. The old note that `--fs-hero` "has exactly one
caller" is stale — it has two.

### The figures are monospace — rule 14 is honoured rather than amended

Owner's call. `--num` was aliased to `--sans` on 2026-08-28, which read rule 14's second
sentence ("Chrome uses Inter") and dropped its first ("All money, dates, IDs, deltas:
monospace"). `--num` is `var(--mono)` — IBM Plex Mono, embedded — and **both halves hold at
once because chrome does not use `--num` at all**: 0 of 152 chrome rules. The two faces never
blend because they never meet.

**MEASURED BEFORE SWITCHING, not after.** A monospace figure is **13.2% wider** —
`(1,234,567.89)` goes 89px → 101px at 12px — and this is a dense product with seven numeric
columns, so the risk was `fxShed()` silently dropping one. Tested by overriding `--num` live
first: overflow groups 9 before / 9 after with **zero new**, the Flux statement still fitting
its track exactly (1216 = 1216), and no column shed with the panel open or closed. The
columns absorb it because their width is driven by the header text, not the figure — the
sample cell measured *narrower* in mono, 133px against 139px.

**THE SWITCH ALONE ONLY MOVED 75% OF THEM**, and the reason is the interesting part.

- **Seven rules define `.num`** — `.dt`, `.tbl`, `.ic-mx`, `.tbl.fr-filing`, `#fxRoot .tbl`,
  `.rw-docs`, `.rw-per`, `.acctsurf` — and exactly ONE set a font-family. The other six set
  `text-align` and `font-variant-numeric` and let the family fall through, so flipping
  `--num` moved some numeric columns and left others in Inter *in the same table*. One base
  rule, `th.num,td.num{font-family:var(--num)}`, at the lowest specificity so each of those
  rules keeps controlling its own alignment.
- **THE `tabular-nums` HEURISTIC WAS WRONG, AND THE OWNER CAUGHT IT.** The first cut gave
  `var(--num)` to every rule declaring `tabular-nums`, on the theory that a thing opting into
  tabular figures IS a figure. **font-family inherits, and `tabular-nums` is routinely set on
  a CONTAINER or a `th`** — so the sweep put the monospace face on ~700 WORD-bearing elements:
  152 table headers ("Amount", "Age"), 284 `.ic-mini` sentences ("3 blockers"), 60 provenance
  lines ("NetSuite · 10 min ago"). Three panels side by side then showed three different
  faces. It shipped, and the owner saw it before I did — the lesson is to grep the RENDERED
  result for words-in-the-figure-face after any family change, not to trust the CSS reasoning.

**The face goes on the LEAF that holds the figure, never a container, header or label.** After
the revert: `td.num` takes it and `th.num` does NOT (a column heading is a word), split out of
the one rule that bundled them. The display figures are listed as an explicit set of leaf
selectors (`.hst-v`, `.mc-v`, `.kpi .v`, `.fpkpi .vv`, `#fxRoot.aw .fx-detail .rw-met-v` …) so
nothing inherits the face into a sibling label. Three rules that hard-coded `--num` on a
phrase were freed (`.burn-lbl` "46% paid · 60% invoiced", `.pipecol-hd .tot`, `.card-sum`), and
`.piv td.rowhdr` was pinned back to `--sans` where it had picked up the column's mono.

**Result: pure words rendering in the figure face went 700 → 14**, and the 14 are value cells
(`.det-c .v` = "✓ Balanced" / "Tie exactly") whose content is a figure most of the time and a
word occasionally — forcing either face is wrong for the other, so they are left. **1,233
numerals on the figure face, all tabular, 0 elements clipped.** Verified by spot check: the
statement cells, the panel's four-figure band and the KPI tiles are mono; table headers, the
band's period labels, pivot row headers and the whole Korvyn Assistant are Inter.

**The ~300 numerals still in Inter are markup, not CSS**, and are left deliberately: unclassed
`<td>` account codes that are LEFT-aligned beside a name (a `.num` would wrongly right-align
them — they need their own class at ~10 template sites), and numbers inside sentences, which
SHOULD stay Inter because a figure that switches face mid-sentence reads worse than one that
does not.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10 chrome
themes AA · content text gate clean · spacing ratchet unchanged · 0 clipped elements · 14
word-in-mono cells, all runtime-mixed value cells.

### The inspect panel's tabs disagreed on the figure face — the leaf-list missed the panel's own

Owner, looking at the docked Flux panel: *"each tab's fonts / color shading / numbers looks
different."* Right, and specific: on Overview the header band read `60.0M` in mono but the Key
drivers `+0.2` / `+0.6` right below it were **Inter**, while History and Evidence were all
mono. Same panel, same kind of number, a different face per tab.

Cause: the mono switch's leaf-selector list covered the STATEMENT and the KPI tiles but not
the panel's own value classes, which each declared `tabular-nums` and no family and so fell to
Inter — `.rw-kd .v`, `.rw-kd-tot span:last-child`, `.rw-r .v`, `.rw-r .p`, `.rw-tot .v`, plus
`#fxRoot .rw-per td.num` / `.rw-docs td.num` which out-specify the base `td.num` rule and drop
its family. All seven now take `var(--num)`.

**And `.mono` — a class literally named monospace — rendered in Inter** everywhere except
`.rw-fsr .v .mono`, because that was its only rule. The GL-drill account codes and JE ids
(`class="mono"`, `"pill mono"`) were Inter. One global `.mono{font-family:var(--mono)}` fixes
every use.

**Result: all six dock tabs are 100% mono figures, 0 Inter, 0 words-in-mono.** The only
numbers still Inter are `.ct` count badges ("Comments 5"), which sit inline with a word and
are inventory (rule 12), not figures.

**Spacing, same panel:** the Comments header (`.rw-cbar`) sat 12px above its content while
every other card title uses 8px (the `.aw` override on `.rw-sec`), so that one card read
looser. `.rw-cbar` margin-bottom `--s-3` → `--s-2`. Title-to-content gap is now 8px on every
tab.

### The inspect panel has a 4-STEP TYPE CONTRACT — everything conforms, in both densities

Owner, still: *"you can't make such changes universally … spacing/fonts/color shading are
inconsistent,"* and then *"the right flux panel is terrible."* Both fair. The pattern was
reactive — fix a class, claim it, the owner finds the next. So this time the whole panel was
audited element-by-element in both densities and forced onto ONE explicit scale:

| step | size | use |
|---|---|---|
| title | 17px / 600 / `--ink` | card / section title (`.rw-sec`) |
| **body** | **12px / 400 / `--ink` or `--muted`** | prose, list rows, tables, messages — everything |
| meta | 11px / 400 / `--hint` | provenance, timestamps, secondary links |
| count | 10px / 500 / `--hint` | badge numerals |

**The body step was the whole problem.** Half the panel was 13px (`--fs-ui`) and half 12px
(`--fs-table`) with no principle: Explanation prose, Key drivers, the Evidence table, the
History balance table, comment author names, activity titles and the GL drill were all 13,
while Workflow, Comments messages and counts were 12 — so the text changed size card to card
and tab to tab. **Eleven rules** moved to `--fs-table`: `.rw-expl`, `.rw-kd li`, `.rw-kd-tot`,
`.rw-figs .who`, `.rw-flist .rw-doc`, `.rw-docs td`, `.rw-per td`, `.rw-ac .t`, `.rw-who`,
`.rw-msg .who`, `.rw-gl td`, plus the peek `.who`/`.tx`. 12px is the coherent choice because
it matches the statement grid the panel hangs off. The four things that stay 13px are the
panel HEADER identity (`.rw-nm` ×2) and controls (`.rw-ib`), not body.

**Colour:** `.gap` ("7 awaiting") rendered `--sev-med` amber while the identical text in the
Comments header (`.rw-cawait`) was neutral `--hint`. One fact, two colours → both `--hint`
(a waiting-count is inventory, rule 12, not an alarm).

**Two buttons, two sizes:** Accept (`.btn-primary.sm`, 12px) sat beside Edit
(`.btn-out.sm`, 11px). Both `--fs-table` now.

**Result, verified element-by-element in BOTH densities across all six tabs:** every body
element is 12px, every meta 11px, every count 10px, every title 17px — no 13px anywhere, no
off-scale size, no off-token colour (bar the decorative `--n-300` drill chevron), every
figure mono. Three off-scale paddings (7px) fixed to 8px; spacing ratchet baseline lowered
1089 → 1086.

**The honest note:** this was still done by auditing one surface exhaustively, not by a
mechanism that guarantees it platform-wide. The contract above is the standard; the panel now
meets it. The next surface (statement, close screens, GL) would need the same element-level
audit — a "figures are mono / text is on the 4-step scale / colour is a token" consistency
gate over the RENDERED DOM would be the real universal fix, and does not exist yet.

## 2026-08-29 — the Overview tab, made enterprise grade

Owner: *"I will give you full liberty to make my overview tab enterprise grade."* The
consistency passes above fixed drift; this is the hierarchy and polish that make a flux
review panel read as enterprise software. Three structural faults, found by auditing every
element rather than eyeballing:

**THE SUBJECT WAS BURIED.** The line name — the panel's whole subject — rendered at
**`--fs-ui` (13px)**, *smaller* than the section titles inside it (`--fs-card`, 17px). A
reviewer's eye landed on "Explanation" before "Rental revenue". The line name is now
**`--fs-page` (20px) / `--fw-strong` / `--ink-strong`** — it is the panel's title in the
literal sense the token is named for, and it stays one line (ellipsis, not shrink) even for
the longest name ("Transaction and acquisition costs" fits at 20px without clipping or
colliding with the window controls, verified in both densities).

**TWO LABEL/VALUE CARDS, THREE DIFFERENT TREATMENTS.** Workflow & review and Financial
source are structurally identical — a stack of label:value rows — but drew nothing alike:

| | label case | label size | value align | label col |
|---|---|---|---|---|
| Workflow (before) | sentence | 12px | RIGHT | 104px |
| Financial source (before) | UPPERCASE | 10px | LEFT | 96px |
| **both (after)** | **UPPERCASE tracked** | **11px `--fs-label`** | **LEFT** | **100px** |

One field-row system now: an uppercase tracked `--muted` field label in a fixed 100px
column, and a **left-aligned** value so every value starts on the same pixel and the card
scans like a data sheet — not Workflow's old ragged right-align. This is the design
system's own `--fs-label` treatment ("uppercase section label, tracked"), so the two cards
are byte-identical in type and layout now (verified: label `11/500/UPPER/100px`, value
`12/left` on both).

**THE RESULT IS A STRICT 5-STEP HIERARCHY** from the six tokens, each with ONE role, and it
holds across all six tabs in BOTH densities:

| step | token | role |
|---|---|---|
| 20 | `--fs-page` | line name (subject) |
| 17 | `--fs-card` | section titles · header figures |
| 12 | `--fs-table` | all body — prose, rows, tables, messages |
| 11 | `--fs-label` | UPPERCASE field labels |
| 10 | `--fs-micro` | counts, captions |

Verified element-by-element: **dock renders exactly {20,17,12,11,10}, three weights
{400,500,600}, zero off-scale, zero off-token colour, every figure mono.** Page mode had two
13px stragglers in the header's below-materiality note (`.rw-state.soft` inherited 13,
pinned to `--fs-table`); after that, page mode is identically clean.

Row padding moved 7px → `--s-2` (8px) on both cards — on-scale, and the spacing ratchet
caught a 1px optical nudge I tried to add (removed it; baseline lowered 1086 → 1083).

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10 chrome
themes AA · content text gate clean · spacing ratchet green · long-name stress test passes ·
both densities on the 5-step scale.

**Still deliberately NOT done** (would need owner direction, not liberty): reordering the
Overview cards, adding a header verdict band (the reference has none — the classification
pill carries it), or touching the four-figure band's structure. This pass was hierarchy and
consistency, which is what "enterprise grade" was missing.

**Later (owner: "focus on UI") — the four-figure band became an instrument strip.** It read
`gap:0`, four figures edge-to-edge as one blur; now each cell is divided by a hairline
(`.rw-met + .rw-met` border-left) with `--s-3` breathing room, first/last cells flush to the
band edges. The variance label was truncating ("Variance · fav…") in a ~100px cell — dropped
to "Variance" since the cell's colour and its ▲/▼ arrow already carry favourable/unfavourable
(the word still lives in the statement's F/U column and the Explanation). Verified: 0.5px
dividers, no label truncation on any line, both densities, gates green.

**Then (owner: "all three") — the variance leads, the pill is a badge, the sparkline is
refined.**
- **THE VARIANCE WAS NOT COLOURED, a real bug.** `#fxRoot.aw .fx-detail .rw-met-v{color:--ink}`
  (1 id + 3 classes) out-specified `#fxRoot .dlt.up`/`.dn` (1 id + 2), so the variance
  rendered slate on every line — against "colour lands only on the two variance cells".
  Restored with `.rw-met-v.dlt.up{--pos}` / `.dn{--neg}` / `.n{--muted}` at matching
  specificity. The variance amount also steps up one size (`.rw-met-v.hero` → `--fs-page`/20
  vs 17 for Current/Prior), with a fixed 24px line box on `.rw-met-v` keeping all four labels
  on one baseline. The variance now leads by SIZE and COLOUR — green favourable, red
  unfavourable (verified both).
- **The classification pill is a status badge**: UPPERCASE + `--tracking-label`, inline-flex,
  so "NEEDS REVIEW" / "ROUTINE" read as deliberate tokens, not a soft wash.
- **The sparkline** trades its flat 7%-opacity fill for a vertical gradient
  (`linearGradient #rwSpkFill`, accent .16 → 0) and a hollow ring endpoint (surface fill,
  accent stroke) instead of a solid dot.

Verified: 16/16 lines render, gradient present, console clean, all three gates green (the
spacing ratchet caught a 2px pill padding and made me revert it to 1px).

## 2026-08-30 — the Explanation column tells the review state, with timestamps

Owner's direction, several passes. In **Narrative** mode the Explanation column printed the
prose alone, so a Korvyn draft read as a settled explanation and a returned line read as
though nothing was owed — the honesty the *status* column carries in Statement mode was lost
the moment the words appeared. `narrCell()` now emits a marker under the prose for the three
states where the words are NOT the line's settled answer:

- **Korvyn draft** — an indigo `✦` leads the prose and a grey `.eb-prov` line reads
  *"Korvyn draft — preparer to review and approve"* (the panel's own draft treatment: sparkle
  carries the `--ai` identity, rule 2).
- **Open for review** (submitted) — muted *"Open for review — {reviewer} to review and
  finalize · submitted {time}"*, the column's own `wait` treatment.
- **Returned** — amber (`--warning`, the panel's change-request colour) *"Changes requested by
  {reviewer} · {time} — address before this is final: {note}"*.

An accepted or signed-off explanation is final and reads as prose alone. **Timestamps are
stamped on the record**, not derived: `exSubmit` writes `rc.submittedAt`, `exReturn` writes
`rc.returnedAt`, both via `stamp()`; the marker's `.eb-when` is quiet `--hint` and stays in
the sans face (a date inside a running sentence reads worse switching face mid-line). The
Korvyn draft's own timestamp (`best.at`) also shows in the panel's `.rw-prov`.

## 2026-08-30 — the KPI strip is an instrument, and it tracks the review states

The worklist tiles gained three visual reads within the same flat cards and the app's own
state palette (owner: "full creative ability"):

- the **explained** tile is a STACKED METER (`.wl-meter`) — signed (green `--success`) ·
  explained (accent) · owed (amber `--warning`) as a share of the gross movement, over a bare
  track for the part below materiality. Derived, never duplicated: the same figures the tiles
  state, split by review state (`reqD`/`signedD`/`owedD`/`explD` in the worklist builder).
- **signed-off** carries a `.wl-mini` fill bar of done ÷ required.
- an exception tile takes a 3px STATE EDGE as an inset shadow (`.edge-act` cobalt for *need
  you*, `.edge-warn` amber for *unexplained*, `.edge-bad` red for *returned*) — rule 8's
  severity idiom, no layout shift, only when something is owed, so a finished strip is
  monochrome. *Need you* is the hero (`.hero` → accent-ink figure); Ties-to-TB is a green/amber
  status.

Every fill is a BACKGROUND, never text (the on-fill gate is not in play); heights/radii/edges
are not spacing (the 4px ratchet is not either). Later, the strip gained **`returned`** and
**`in review`** segments (one-click filters via `S.show`, cased in `visible()`), so the KPI
strip reflects the review state machine below.

## 2026-08-30 — the inspect panel: simpler Overview, a thread, a variance chip

Owner supplied the reference inspector's screenshots.

- **Overview is Explanation · Conversation · Workflow** — Key drivers and Evidence left
  Overview in BOTH densities (`dwOverviewKeys` → `['explain','cmtPeek','reviewer']`; each is
  its own tab). `RW_LAYOUT.page` matched.
- **Workflow & review is four rows** (`reviewer()`): Status (coloured only for a real state) ·
  Review owner (avatar) · Assigned to · Prepared by · Response due. **Labels are sentence
  case, values right-align** (`#fxRoot .rw-wfr .k/.v`) — matching the reference; the 11px
  uppercase tracked label read as shouting inside a key→value record.
- **Evidence is attachments only** (`RW_LAYOUT.drawer.evid=['evid']` — Financial source moved
  off; it answers a Drivers/GL question, not a support one).
- **The variance is a highlighted answer chip** in the four-figure band — a soft `--pos-bg` /
  `--neg-bg` tint (`.rw-met-hero`) with the figure at the `-ink` step and the dividers around
  it standing down, so the movement reads as one lifted answer.
- **The comments are a THREAD, not boxes** (owner: "rather than in boxes, I prefer a thread").
  The message border/fill/radius come off in the dock and a single timeline rail runs down the
  avatar gutter (`.rw-thread::before` at `left:11px`, avatars as opaque beads, replies branch
  right). This reverses the 2026-08-29 bordered-card ruling FOR THE COMMENTS THREAD only; the
  section cards (Explanation/Workflow/Evidence) stay bordered cards on the ground. `cmtHi()`
  highlights `@`-mentions.

## 2026-08-30 — assignment, @-mention, and auto-notify

The model had FIXED scope-owners (`ENT_OWNERS`/`REG_OWNERS`) and an accidental preparer, so
there was nothing to reassign. Now there is.

- **`pplDir()`** — one flat roster built from the seeded entity/region owners + the standard
  preparer/reviewer + the acting user (no second identity model). **`lineAssignee(rc)`** — the
  reassignable responder, defaults to the preparer. **`canAssign = ()=>caps().reopen`** —
  Controllers and the CAO only (the owner's choice).
- **Reassign** (Workflow card "Assigned to" row + `assignDialog`/`assignLine`) and per-comment
  **Add responder** (`assignComment`, gated `caps().review`) both go through the audit trail
  (the `⇄` reassign event that existed in `RW_ACTS` but nothing wrote).
- **`@`-mention in the composer** (owner: "add a name by using @"): `cmtMentionScan` matches
  `@` + word-chars (not the trailing `. Patel`, so an inserted name does not keep the menu
  open), `cmtMentionPick` inserts `@Name` into `S.cmtMentions`, `cmtKey` drives ↑/↓/Enter/Esc.
  On post, each still-present mention raises a notification for a reviewer.
- **Auto-notify** (owner: "yes, auto notify"): reassignment and directed comments/mentions
  raise a PERSON-TARGETED request via `raiseReq(r,nm,ask,sub)` — `sub:'own'` for a whole-line
  hand-off (one per line, prior withdrawn), `sub:'return'`/`'query'` for the review loop and
  comment asks. It lands in the person's queue (`reqOwnerRec(q)` resolves ownership by the
  named person, not just the scope), drives the line's Response-due row and the worklist
  count, and is late-able. `exSubmit` discharges the `own`/`return` obligations.

## 2026-08-30 — the enforced review sequence and the back-and-forth control

Owner: "add proper sequence … the control has to be strictly in place … the back-and-forth
review comments should have a robust control."

- **The review is a state machine** — Korvyn draft → Prepared → In review → Returned (loop) →
  Reviewed — drawn as a **progress stepper** (`rwStepper`/`rwFlowStage`) in the Workflow card:
  travelled path green, current step accent, a returned line amber back at *Prepared*.
- **Open review items gate re-submission** (the robust control). `reviewItems(rc)` = change
  requests (`c.chg && !c.resolved`). A returned line does not offer Submit while any are open —
  the footer shows *"N reviewer comment(s) to address · Address comments"*, enforced in
  `exSubmit`, `readyToSubmit` AND `dwFoot` so they cannot disagree. The preparer responds via
  **`cmtResolve`** (a threaded reply is required; silence is not addressing), the comment reads
  **Addressed**, and Submit returns.
- **Auto-routing**: `exReturn` sets `rc.assignee = preparer` and notifies (`sub:'return'`);
  `exSubmit` sets `rc.assignee = reviewer` and, on a resubmit, notifies (`sub:'review'`).
- **The statement flags "Open"** while a review comment is unaddressed (`fxStateKey` →
  `reviewItems(rc).length?'open':'ret'`; `FXST.open`), and relaxes to "Returned · ready to
  resubmit" once addressed.
- **A directed question is answered only by the named person** (owner: "others shouldn't be
  able to answer that question"). `canAddress(c)` — if `c.ask` names a person, only they may
  mark it addressed; a plain return falls back to the preparer. `cmtResolve` re-checks it.
- **Prior-period explanation is wired to the prior period's FINAL review** (owner). The
  `prior` card, `exCarry` and the AI context object now require `priorRec(id).status ===
  'approved'` — a prior draft/in-review is work in progress, not institutional memory. Shows
  the sign-off provenance (*"reviewed by … · locked …"*).

## 2026-08-30 — the full screen is the REVIEW DESK, Korvyn's signature review surface

Owner: "the reviewer can come in to the full screen and just review/address the open comments
… a signature item … think big." Four moves, all built.

**The layout is two columns, not three** (`RW_LAYOUT.page` = `{judge:['explain'],
rec:['openItems','reviewer','cmtHead','cmtStream','cmtComp','cmtOwed']}`; `dwPageCols` returns
two; `.rw-cols.desk` grid). LEFT is the case — the explanation at reading width. RIGHT is the
review — the workflow record with its stepper, then the WHOLE live conversation, so a reviewer
reads the argument on the left and works the review on the right without changing tabs.
**Needs attention is gone** (the blockers are the open comments, now the subject of the right
column) and **the Comments tab is removed from the page** (`FX_PAGETABS`) — Overview IS the
conversation, so no second place for one thread. The dock keeps its Comments tab.

1. **A review control bar in the header** — `dwStatePill(rc)` + `dwCtrlBtns(r,rc)` in the
   `ws-from.rw-ctrlbar` strip: the state pill and the state-appropriate action (Return / Mark
   reviewed / Address N open / Submit / Reopen). Shares its guards with `dwFoot`.
2. **An open-items ribbon** (`openItems` part, page-only, top of the review column) — the
   unaddressed reviewer comments as a checklist, each with *"Awaiting {person}"* and an Address
   action for the person it is directed at. Renders nothing when clean.
3. **A review-queue flow** — a progress meter in the header (*"N of M reviewed"* + `.rw-cbbar`),
   **Next needing review →** (`fxNextOpen`), and **signing a line glides to the next**
   (`exApprove` calls `fxNextOpen()` in `S.dwPage`).
4. **Keyboard-first** — in `fxKeys` under `S.dwPage`: **a** approve · **r** return · **c**
   comment (`dwFocusComposer`) · **j/k** next/prev line in the queue (`dwQueueMove`, walks the
   visible rows, keeps the desk open via `pickAt`) · **n** next needing review · **Esc** back.

Verified across the whole turn: the full loop (submit → return → "Open" flag + blocked
resubmit → address → Submit → route → sign → glide) works; the control bar shows the right
state+actions in every state; `j/k/c` drive the queue; 63/63 views render; console clean; all
three gates pass (contrast, spacing unchanged at 1079/89, chrome 10/10) in this and every
2026-08-30 pass above.

## 2026-08-30 — the Review Desk becomes a command centre (hero, Korvyn's read, motion)

Owner: "not totally sold or impressed … this can be the heart of Korvyn … think big." The
desk was a bigger panel; these make it a command centre.

- **THE COMMAND HERO** (`dwPageHero`, full page only — the dock keeps the four-figure band).
  LEFT states the MOVEMENT with authority: the variance at `--fs-hero`, coloured, with the
  favourable/unfavourable verdict and Δ%, the prior→current flow beneath, and the trajectory.
  RIGHT is the VERDICT cluster: the progress stepper, a coverage instrument (the share a
  reviewer signs against, with residual against tolerance), the state pill and the one action
  that advances it (`dwStatePill` + `dwCtrlBtns`, shared with the footer's guards). Swapped in
  at `S.dwPage?dwPageHero(r,rc):figs`; the stepper drops out of the Workflow card on the page
  (`X.page?'':rwStepper`) and the state band leaves the idrow — the hero carries both.
- **KORVYN'S READ** (`krvSummary` part, page-only, leads `page.judge`) — a generated one-line
  verdict in Korvyn's indigo voice (`--ai-bg`/`--ai-line`), state-adaptive: indigo/ready when
  clean, **amber** with open comments or residual over tolerance, **green** when signed off. It
  NARRATES the engine's figures (coverage, residual, open count) — never computes one.
- **THE FOUR EXPERIENCE MOVES** (owner: "all four"). #1 Korvyn's read (above). #2 the
  conversation is the centrepiece — the review column widened to `minmax(520px,640px)` on the
  desk grid. #3 immersive — more air entering full screen (`.dw-hd` padding, `.dw-body`
  padding-top). #4 MOTION — a one-shot entrance (`.dw-in` set in `dwPage()` on #fxDetail, which
  paintDrawer never recreates so a re-render cannot replay it) and a glide when the queue moves
  to a new line (`.dw-glide` set in `pickAt()` only on a line change in page mode), both under
  `@media (prefers-reduced-motion:no-preference)`.

## 2026-08-30 — every full-screen tab, elevated (Drivers, GL, Evidence, History)

Owner: "update the full screen UI for other tabs." The Overview desk was elevated; the other
page tabs still rendered as one short card floating in empty gray. The command hero already
heads every tab (it is in `dwHead`, not Overview); the bodies now use the screen too.

- **DRIVERS is a contribution chart** — each drill row (`dwDrivers`) carries `--sh:<share>%`,
  and a `::before` fills it with `--accent-bg` to that width, so the decomposition reads as a
  horizontal bar chart footing to the movement. The residual/total rows carry no `--sh` and
  stay unbarred. Full screen only; the 440px dock stays a compact list.
- **HISTORY is two columns** — `dwPageCols('hist')` returns `[['judge',['trend']],
  ['rec',['prior','trail']]]`: the period series on the left, the signed-off prior explanation
  and the activity log on the right, filling the width like Overview.
- **SINGLE-COLUMN TABS ARE COMPOSED, NOT STRETCHED** — `.rw-cols.one` is capped at 1000px and
  centred under the full-width hero, so Drivers, General ledger (the 40-row ledger with its
  All/Manual/Post-close filters and View-in-ERP links) and Evidence read as a document on the
  sheet rather than one lonely band across 1,250px. That was the empty-space problem.

Verified: 63/63 views, all five page tabs (`sum·drive·gl·evid·hist`) render with content, the
driver bars size to share, History splits, GL is a full ledger, console clean, all three gates
pass (spacing unchanged at 1079/89, chrome 10/10).

## 2026-08-30 — materiality is the policy, and the policy is cited on every required line

Owner: "enhance the materiality filter and link it precisely to the flux explanation/variance …
make this enterprise grade." The threshold already drove `r.flag`→`r.req`; what was missing was
that the policy was *chosen blind* and *cited nowhere*. Two moves, one principle: the materiality
policy answers two questions about every line — is an explanation REQUIRED (the threshold) and is
it SUFFICIENT to sign (the residual tolerance) — and both are now expressed in the SAME on-screen
unit as the figure they judge, so the filter, the statement and the inspect panel cite the policy
identically and cannot drift.

**ONE SET OF HELPERS, defined once beside `fmt`/`pct`** (so `thr`/`prof`/`matFac`/`fmt`/`uName`
are all in scope): `matAbsThr()`/`matTolThr()` (the two bars in $000), `matRule()` ("1.0M and 5%"),
`matBasis(r)` and `matImpact()`. `rows()` now carries `hitAbs`/`hitPct` on every row so the basis
can say WHICH bar breached without recomputing. **`matBasis(r)` is the single source** for why a
line does/doesn't require an explanation — kind `floor|imm|watch|mat`, each a precise sentence:
*"Material — Δ 1.4M exceeds 1.0M and 6.8% exceeds 5%, per Monthly close policy."* It reads the same
whether it lands in a tooltip or a panel.

**THE FILTER LEADS WITH A LIVE IMPACT PANEL** (`.mat-impact`, top of the `mat` popover). A
materiality threshold is a judgement about how much of the movement must be defended, and it was
being set with no sight of what it captured. The panel states **"N of M lines require an
explanation"** over a coverage bar and **"K material · captures X% of the $Y gross movement"** —
read from `rows()`, so it counts exactly what the grid flags. It **repaints live**: `setAbs`/
`setPct`/`setFloor`/`setTol` all gained `if(popKind==='mat')paintPop()` (only `setOp`/`setProfile`
had it). Verified: default 2 lines / 54%; `setAbs(0.5)` → 3 lines / 71% (Property taxes joins on
the $ bar) with the grid's "Needs explanation" count moving in lockstep.

**THE INSPECT PANEL CITES THE POLICY on every required line** — a neutral `.rw-basis` band at the
top of the Explanation card (a tracked "WHY REQUIRED" label over the sentence), shown only when
`r.req`: the precise breach (or the watchlist reason) **plus** *"Signable once the unexplained
residual is within 0.5M."* — so the requirement is never a bare flag; it names the policy that
raised it and the tolerance that clears it. Neutral by design: materiality is context, not a state
(rules 2/3); the control is the requirement, not a colour. An immaterial line shows no band
(explanation optional). The **statement Δ cell tooltip** now uses the same `matBasis(r).why` and
covers watch-listed lines too, replacing the old `flag`-only "Breaches …" string that printed the
threshold without a unit letter.

**The star (below-materiality flag) folds into the identical workflow** and is now gated to
`caps().policy` (Accounting Manager / Controller / CAO) — a preparer can no longer add OR remove a
reviewer's mandatory-flux flag. A watch-listed line reads `r.watch→r.req`, so it gets the same
"Needs explanation" flag, the same submit gate, and the same reviewer-note-at-sign-off as a
threshold-material line; its basis band reads the reviewer-decision reason instead of a breach.

Verified: 63/63 views · console clean · all three gates pass (contrast, spacing unchanged at
1079/89, chrome 10/10) · impact panel live across abs/pct/op/floor/tol and profile · basis band
correct for material, watch-listed and immaterial lines in the dock · Δ tooltip matches the band.

## 2026-08-31 — one dropdown model, and materiality is a level

Owner: *"The dropdown options are not consistent. I want to simplify the entire filters
ribbon … can we make each dropdown selectable by clicking on the box … re-do the Variance
tab. The materiality options should be very simple. I don't need SEC, other add'l
options."* Measured before the pass, the eight-tab ribbon opened **ten different kinds of
menu**, and two of them were forms.

**EVERY FILTER COMMITS ON CLICK.** The ribbon held two contradictory models. A
single-select (Status, Direction, Period, Cadence, Eliminations, Units) committed on click
and closed. A multi-select (Entity, Segment, Region, Property, Cost center) edited a DRAFT
and did nothing at all until a `Clear / Unfiltered / Show all` footer was pressed — so
ticking three entities and walking away left the statement unfiltered while three boxes
read as chosen. **One surface cannot answer "did that take effect?" two ways.**

The staging had two stated reasons and neither survived. Recompute cost is not real on this
book — `renderAll()` is one frame. And "Included vs Excluded cannot be read mid-build" is
answered better by making the mode a switch over a LIVE selection than by hiding the whole
act behind Apply: you now watch the statement move as you flip it. Verified arithmetically
complementary as before — Ashburn only 39.5 + all except 48.6 = 88.1 total revenue.

`popDraft` / `popDraftX` are gone with the footer. **The menu renders from `S`, which is
what the statement renders from, so the two cannot disagree.** `.pop-ft` / `.pop-ftn` /
`.pop-clr` are retired; Clear moved into the header, where every other menu already carried
it.

**Only these | All except is a switch, and it appears only once something is chosen.** It
was an `Included|Excluded` tab pair sitting permanently above the list — a control for a
decision the reviewer had not reached yet, drawn in the `.ktab` primitive, which then
needed an exception in the tab-strip arrow handler (`if(t.closest('.pop-mode'))return`).
It is `.pop-sw` now, the chosen half takes `--accent-bg` (the same "one option is selected"
treatment the single-select row uses, not a second idiom), and the keyboard exception is
gone with the borrowed class. 5.73–10.48:1 in both modes.

**THE TRIGGER DOES NOT SURVIVE ITS OWN FILTER — and this was a live bug, not a consequence
of the change.** `renderAll()` rebuilds the field row, which destroys the button `#pop` is
anchored to; `popPlace()` then measured a detached node, got a zero rect, and parked the
menu in the **top-left corner of the window**. Measured on Reason code, which already
committed live: **(609,302) → (8,6) on one click.**

The fix went in `popPlace()`, **not in each commit path**. A first cut put it in the new
`popLive()` and covered exactly the four handlers this pass rewrote, missing every other
menu that repaints in place — `setReason`, `clearReason`, `setProfile`, `setSort`,
`setDens`, `setFullAll`. **The guard belongs where the rectangle is read**, so it covers
every caller including any added later. `popRebind()` re-acquires the trigger by its
`data-pop` key, and when it cannot, the menu **stays put** rather than being placed against
a zero rect. Verified 609,302 → 609,307 on Reason, Entity and Materiality; Escape still
returns focus to the *rebuilt* trigger, and `popLive()` restores the focused row index so
a checkbox list is still drivable from the keyboard.

### Movement over became a list

**It was the only control in the ribbon answered with a keyboard was the only control in the ribbon answered with a keyboard** — a bare
number input in a menu of option lists, which is most of what "not consistent" was pointing
at. It is a list of fixed amounts now, held in `$000` in `TH_STEPS` and rendered through
the unit on screen, so it reads `0.5M / 1.0M / 2.5M` in millions and `500K / 1,000K` in
thousands rather than offering "0.5" of whatever is current. `threshWord()` phrases it once
for the menu row, the field and the chip — three places that were each formatting it their
own way ("over 1.0M" in the row against "over 1M" in the field beside it).

**And the list exposed a real bug in the control it replaced.** `S.thresh` is stored in
DISPLAY units, so switching millions → thousands left `1` in the field and silently turned
a **1.0M floor into a 1.0K one — a thousand times looser** — under a Units menu whose own
note promises that "switching units never silently changes what is flagged". Invisible
while the control was a box you had typed into yourself; obvious the moment it became a
list of stated amounts. `setUnits()` re-expresses the value so the AMOUNT is unchanged.
Materiality never had this fault: it is stored in $M and converted once through `matFac()`.

### Two field-row faults, both in the row's own markup

- **The Saved Views field printed its label twice** — "View **View** Standard review". It
  was wrapped in `fxGroup('View', …)` around a field already labelled View, and was the one
  control on the eight tabs not drawn by `fxField()`. `fxGroup()` and `.fxg` / `.fxg-l` are
  retired with it: a group label exists to name a control that has none, and every control
  in the row states its own name.
- **The Table menu carried a nested Units row** while Units is a field on Basis — a second
  entry point to one control, the duplication the 2026-08-28 pass removed everywhere else.
- The Display mode note still said **"All three read the same figures"**; there have been
  two modes since `DISP_MODES` was cut to Statement + Narrative.

**Measured after.** Every filter tab's row is uniformly **180×32**. Across all 18 menus
reachable from the ribbon: **0 non-search inputs** (was 5, in two menus), **every row
clickable**, one anatomy — `pop-h → [pop-s] → pop-l → [pop-b]` — and one width, 300px,
except the three dimension multi-selects at 340px, which carry a second column of figures.
Search appears at one stated list length (>12) rather than always on some menus and never
on others. `viewmode` and `views` keep their section stacks: they configure rather than
filter and are not part of this vocabulary.

**Verified:** 60/60 views render · console clean · 10/10 chrome themes AA · content text
gate clean · spacing ratchet green (baseline **lowered** 1079 → 1077 with the retired
footer and tab-pair rules; the gate caught a 6px I introduced in `.pop-sw` and it was put
on the scale) · dark mode holds · Only these / All except arithmetically complementary ·
keyboard drives every menu through a commit · Escape returns focus to the rebuilt trigger ·
the platform band (`#gfBar`, `g:` menus) untouched and still committing on click.

**Deliberately NOT done:** the Actions tab is still a row of buttons rather than fields —
the tab IS the menu by the 2026-08-28 ruling, and putting a menu inside a tab would be two
clicks to reach one action. The Reason code menu has 14 rows and no search, which is
correct under the >12 rule only because it is not a dimension; if it grows, it takes the
same search every other long list has.

### Later the same day — the rule editor comes back, smaller

Owner, with a mockup: *"I said simple like attached … the materiality options should be
very simple."* **Simple meant a SMALLER FORM, not no form.** The pass above read it as "no
form" and replaced the editor with a list of three named levels — which did not simplify
the control, it removed the ability to set a threshold at all. Corrected: Amount · Percent ·
Logic (Either|Both) · Residual tolerance, and one line.

What stays gone is the NAMING. Monthly close policy / SEC / MD&A / Tight review were three
presets over the same four numbers, and "SEC / MD&A" asserted a reporting basis this model
does not carry — the same fault the evidence table avoids by deriving Verified/Pending from
a line's own sign-off rather than badging a document-approval workflow nobody built. There
is no policy NAME any more; **`prof()` survives as the one place that phrases the rule**, so
the memo, the chips, the panel and the audit trail all say `1.0M and 5%` identically. Also
gone: the `and/or` control's ability to build a rule no written policy states, the
small-balance floor (a constant, not a threshold a reviewer sets), and the impact CARD.

**A LIST APPLIES ON CLICK; A FORM APPLIES ON APPLY.** The rule editor is the one staged
control left in the ribbon, and the split is a rule rather than an exception: you cannot
half-type `0.25` without passing through `0`, and a statement that recomputed on every
keystroke would flag every line in the book on the way to the value you meant. Cancel is
what a list does not need and a form does. `Save as default` applies AND writes `S.matDef`,
which is what clearing the rule returns to — so "default" is a real state rather than a
second copy of Apply.

**Staging is what earns the caption its place.** It is not a description, it is a
measurement of the PENDING rule: *"3 of 16 lines require an explanation **(now 2)**"* — what
Apply will do, before you press it, counted off `rows()` so it cannot drift from the grid.
It inks up only while the draft would change the count, so it is silent until it has news.
**The caption refreshes; the form does not** — `paintPop()` on every keystroke takes the
caret with it, the same contract `cmtField()` and `exField()` hold, so `matCap()` rewrites
only the line and the Logic pair.

The capability gate stays (`caps().policy`) and the reason has not changed: drop the bar
mid-close and a breaching line stops requiring an explanation, leaves the flagged count and
drops out of the flux memo, which then prints the new rule as though it had been in force
all period. **Do not remove the gate to make the form feel lighter.**

`1.0`, not `1`: a whole number is padded to one decimal in a field labelled Amount ($M),
because that is money. Only a whole number — rounding a typed `0.25` to `0.3` on the next
paint would silently change the rule. The percent stays bare; 5% is not 5.0%.

### ONE SELECTION AFFORDANCE, and no description at the bottom of a filter

Owner: *"I said consistent dropdown — I see some options that get selected using the boxes,
others don't … why do we need a description at the bottom of each filter?"*

**Both were rules this file had written down, and both were wrong.** "Single-select is a
TICK, multi-select is a CHECKBOX" produced exactly what was reported: a single-select drew a
bare tick and filled the whole row with `--accent-bg`, a multi-select drew a square box and
left the row neutral — two answers to "how do I choose this?" on one surface. **Every option
row now carries the same 14px box, and no row fill**: the box IS the selected state, so a
second one is redundant. The distinction that matters is still carried where it belongs —
`.pop-o.ck` keeps the checkbox ROLE in `popEnhance()`, so a screen reader is told the truth
about whether one answer is possible or several, while the eye reads one language.

**The exception is tagged, not hand-written.** Three kinds of row cannot hold a box: More
(each row opens another menu), a saved view (its gutter holds a favourite star, which is a
control), and the Table menu's four commands. `popEnhance()` marks them `.nobox` after
paint, and a `.nobox` row carries its selected state on the row — so no call site has to
remember, and a menu added later is covered. A More row also gets a `›`, because a row that
opens another menu must not read as an option that refuses to tick.

**Nine menus carried a paragraph explaining the control above it.** A filter whose name and
options do not say what it filters is not fixed by a footnote, and a footnote under every one
turned a 26px option row into a 60px card. All nine are gone. Two captions survive and
neither is prose: the rule editor's impact count, and the 12-period trend readout, which is a
data popover rather than a filter.

**And the same habit had spread onto the rows.** *"under 90% of the movement"* beside
*"Partly explained"*, *"34px rows"* beside *"Standard"*, *"biggest movers first"* beside
*"Largest Δ amount"* — a footnote per option. **The sub column carries a VALUE, never a
sentence**: a resolved period on Compare, a movement figure on a dimension, a count on Reason
code, `5 shown` and `Alt+Z` in the Table menu. Prose belongs to the option's own name or
nowhere.

**Measured after, across all 18 menus reachable from the ribbon:** every row is either boxed
or `.nobox`-tagged (**no third state**), **zero footers**, one box at 14×14/3px, no selected-row
fill, two widths (300px; 340px only for the three dimension lists, which carry a column of
figures). 60/60 views · console clean · 10/10 chrome themes AA · content text gate clean
(caption 6.48 light / 7.73 dark, Save as default 6.44/7.39, Either|Both 6.5/7.69) · spacing
ratchet unchanged. Apply / Cancel / Save as default / reopen / clear all verified end to end,
and the caret survives every keystroke in the form.

### Later — SELECTED FILTERS: the tabs stay, and a slim strip says what is on

Owner: *"the FILTERS are not intuitive. I got lost toggling different options from the
tab … it should be something like this when the filters are selected"*, with a reference
showing `Selected filters ›` followed by removable chips. And: *"I don't want to see a
bulky strip that overtakes the filter."*

**A DETOUR WORTH RECORDING: the eight-tab surface was replaced wholesale and the owner
rejected it.** The reasoning behind that attempt was sound and is still true — thirteen
filters behind eight tabs put at most three on screen, so ten were invisible at any
moment, and the tab badges could only ever say a filter existed SOMEWHERE. But the fix
was too big: it retired the tabs, the context/filters split and the whole command
surface for a chip bar, and lost a layout the owner wants. **The defect was never the
tabs. It was that nothing stated what was selected.** Reverted by replaying every
accepted splice onto a clean base rather than unpicking the last one — which is the only
safe way to undo one pass out of eight in a 2.9 MB single file.

**What shipped is the small version of the same idea.** `fxSelStrip()` renders one line
under the field row:

```
Selected filters ›   ⟨Entity: 2 selected ×⟩   ⟨Movement over: over 0.5M ×⟩   Clear all
```

- **It does not render at all when nothing is selected** — zero height, not an empty
  band. An unfiltered page pays nothing for it. Measured: region 108px open / 35px
  folded with no filters, +42px with the strip.
- **It is the quietest row in the region.** Ramp chips on the surface, not the accent:
  the tabs and fields are where you act, the strip is where you read, and a row of
  cobalt tablets would shout louder than the controls above it (rule 2).
- **A chip is two targets, and both are real buttons** — the body opens that filter,
  the × removes it. Not one handler inspecting the event, so both are keyboard-reachable
  and each says what it does.
- **Clicking a chip goes to the tab that owns the filter AND opens its menu**, so the
  strip and the tab strip can never disagree about where you are. The tab is derived
  from `FX_FTABS` (`fxTabOf`), never a second list, and a dimension behind **More**
  routes to Scope. The menu anchors to the FIELD, not to the chip — the menu belongs to
  the control, and a chip disappears the moment its filter is cleared.

**THE STRIP SURVIVES THE FOLD, and that is the point.** Collapsing hides WHICH controls
are available; it must never hide WHAT is filtering the statement — on a surface whose
numbers get signed, that guarantee is the reason the tab badges existed. Folded with two
filters the whole region is 77px and still names both. `.fx-filters.shut` hides
`.fx-ftabs` and `.fx-fields` and deliberately not `.fx-sel`.

**ONE STATEMENT OF WHAT A FILTER READS.** `fxFilterState(k)` returns `{nm, on, val}` and
is the single source for both the field and its chip — `fxDimField()` and the
`show / dir / reason / cover / thresh / elim` branches of `fxOneField()` were each
computing their own label and value, so a chip written separately would have drifted from
the field within one change. The exclusion wording ("Excl. 2") is spelt in that one place,
which is what stops a field that is HIDING Meridian West from reading "Meridian West".

**The query owns a chip too** (`Find: “rent”`), so `setQuery()` calls `fxPaintSel()` — the
strip repaints alone and never the row holding the input, because a repaint takes the
caret with it (the contract `cmtField` and `exField` hold).

**Verified:** 60/60 views · console clean · all three gates pass · every filter tab's row
still 180×32 · strip absent at rest, 41px when present, identical text folded and open ·
chip → correct tab + correct menu anchored to its field (including a More dimension) ·
× removes one filter, Clear all removes the strip · caret survives typing in Find ·
light and dark 6.48–14.12:1 on every element.

## 2026-08-31 — the worklist bar: four tiles, and the review's own words

Owner: *"simplify the KPI — I don't need TB tie out. Do we need to rename 'Need You'?
Can we make this super helpful for users?"* Six tiles became four, and two of the three
removals were duplicates rather than trims.

**"NEED YOU" WAS NOT WHAT THE NUMBER MEANT.** It counts every required line not yet
signed off, whoever holds it — including a line sitting with another entity that owes YOU
an explanation, and a line you submitted that another reviewer is holding. Nothing in it
is about you. A count that over-claims ownership is worse than a dull one, because a
reviewer trusts it and works the wrong queue. (`SHOWS` has an *"Assigned to me"* filter
whose predicate is `r.req && r.status!=='approved'` — the same population, equally
un-personal. Now that `lineAssignee()` exists, that filter could be made honest; it has
not been, and it is the obvious next fix here.)

It reads **to review**, and its complement reads **reviewed**. The pair states progress in
the same two words the review's own state machine uses: `FXST.done` is literally
"Reviewed", while this bar had been calling the same state **"signed off"** — two names
for one fact on one screen, which is exactly the drift this file's comments keep warning
about. The focus line said "signed off" too and now says "reviewed".

**FLAGGED WAS THE REAL CLUTTER, and it was a duplicate.** `flag` means "breaches the
materiality policy", which at the start of a close is the SAME set as "to review" — the
seeded statement rendered `2 FLAGGED` beside `2 TO REVIEW`, the same two lines counted
twice — and that population is already stated by the explanation rule's own caption
("2 of 16 lines require an explanation"). The filter is untouched and still reachable from
Workflow › Status; the tile still appears when `flag` is the ACTIVE filter, so it can
always be switched off from where it was switched on.

**TIES TO TB IS GONE (owner).** It is a control, not a work item. `paintMethod()` states
it under the statement and the memo prints it at sign-off — `tieOut()` is unchanged and
both still read it. A permanent green tick in a bar of work counts teaches the eye to skip
the bar. `.wl-tie` and its five CSS rules went with it.

**What made two removals safe is the Selected filters strip.** An exception tile used to
have to exist partly so a filter could be switched off from the same bar it was switched
on; the chips do that now for every filter on the page. That is what let this bar shed a
third of itself without losing a single entry point.

**Measured:** 6 tiles → 4 (`2 to review · 2.8 unexplained · 46% explained · 0/2
reviewed`), strip 75px, and the statement opens ~30px higher. Exceptions still appear on
their own: driving one line to submitted put `1 IN REVIEW` back in the row, and it leaves
again when the count returns to zero.

**Verified:** 60/60 views · console clean · 10/10 chrome themes AA · content text gate
clean · spacing ratchet green (baseline lowered 1077 → 1076 with the retired `.wl-tie`
padding) · tiles still one-click filters, and the Selected filters chip appears when one
is on · balance sheet renders the same four tiles.

### The Δ% column is neutral ON PURPOSE — checked, not changed

Owner: *"I see red/green colour on Amount but not on the %. It may be right but wanted to
point this out."* It is right, and it is design rule 9: **colour at most two columns, the
primary variance and its direction.** Measured on the rendered grid:

| column | colour |
|---|---|
| Δ amount | `--pos` / `--neg` — `rgb(15,122,68)` on a favourable line |
| Δ % | `--ink`, neutral — `rgb(59,66,86)` |
| F / U mark | `--pos` / `--neg`, the SAME green as the amount |

So colour does land twice on that pair — on the amount and on the favourability letter
beside the percentage. Colouring the number as well would be the third rendering of one
signal in one row, and on an income statement the sign and the favourability are not the
same fact: an expense that ROSE is a negative Δ and unfavourable, while a revenue line
that rose is positive and favourable. The letter is what carries that distinction; the
percentage is a magnitude and stays quiet.

**A per-line progress/coverage BAR COLUMN was considered and declined.** This file has
already run that experiment: `contrib` was a bar-in-a-cell column and it was retired
(2026-08-28) for reasons that apply again — 25 bars are a second chart competing with the
figures beside them, and a bar scaled per row cannot be read against its neighbours. The
same argument retired the 12-period sparkline from the default column set. Coverage is a
question asked of ONE line, and the inspect panel already answers it with a coverage bar
against the tolerance tick. If a per-line cue is ever wanted on the grid, the honest
version is a micro-bar inside the Explanation cell for partly-explained lines only — a
handful of rows, not every row — and it needs the owner's call, not a unilateral change.

### Later the same day — the worklist reads from YOUR side of the review

Owner: *"the KPI should be a snapshot for both preparer and reviewer and it should flip
based on the credentials … preparer will see how many flux explanations are needed, how
many you need to sign off, what is with the reviewer."*

**ONE PIPELINE, READ FROM ONE END OR THE OTHER.** The tiles are the review's own states,
ordered the way the work actually flows, and every one is a filter:

| lens | tiles |
|---|---|
| **preparer** | `needs explanation` → `ready to submit` → `with reviewer` |
| **reviewer** | `awaiting your review` · `you returned` · `with preparer` |
| **read-only** | `in review` · `returned` · `with preparer` |

Then `explained %` (with the stacked meter) and `reviewed N/M` on both.

**IT CANNOT FLIP ON THE JOB TITLE, and that is the whole design problem.** `FX_CAPS`
gives Accounting Manager, Controller and the CAO **both** prepare and review — three of
six roles, and every role that actually works a close. A strip keyed on the title would
show those three one queue and silently hide the other. What decides the side is the
LINE: `canReviewLine()` means nobody reviews a line they prepared, so on any given line
you are one or the other. Same discipline `cmtRole()` follows — read the side off the
RECORD, never off a title.

**A DUAL ROLE GETS THE PREPARER PIPELINE, and its review queue surfaces as an
exception.** You prepare before you review; and the reviewer pipeline for someone who
prepared the statement is three zeros, because `awaitingMyReview` excludes lines you
prepared — it is empty *precisely when* you are the one who explained them. So the review
queue is not lost: `awaiting your review` appears as an exception tile the moment it is
non-empty, which is the discipline every other exception in this bar already follows.

**A QUEUE SWITCH WAS BUILT AND REMOVED** (owner: *"remove this — system should update the
KPI based on the role"*). A `Preparing | Reviewing` pair sat at the head of the strip for
dual-cap roles. It asked a reviewer to tell the product something the product already
knows, and a control that only restates a fact is one more thing to get wrong. `lensOf()`
derives it; there is no `S.lens`, no stored preference and nothing to press.

**READ-ONLY OWNS NOTHING, so its lens says so.** FP&A and External Auditor have
`review:0`, which made `awaitingMyReview` a permanent zero — a tile promising a queue
they are not allowed to hold. They get a third lens: the same pipeline in neutral words,
no hero, no accent edge.

**ONE PREDICATE, THREE READERS.** `rowReady(r)` is the whole definition of "ready to hand
over" — explained inside tolerance, still with the preparer, and (if returned) every
reviewer comment addressed. `readyToSubmit()` is now literally `rows().filter(rowReady)`,
the `Ready to submit` filter is `!rowReady(r)`, and the tile counts the same. The Submit
CTA already lived by that rule ("a button reading Submit 3 can never submit two"); the
tile and the filter now live by it too, so a tile reading 3 cannot open a statement of 2.

`SHOWS` gains **Ready to submit · With a reviewer · Awaiting your review · With the
preparer**, so every tile is also reachable from Workflow › Status and names itself in the
Selected filters strip once it is on.

**`unexplained` left the always-on set.** It is the same fact as the gauge beside it in a
different unit — the gauge IS its complement — and the per-line figure is already a column
in the statement. Still a filter, and it returns as a tile while it is the active one.

**THE HERO IS `needs explanation`, not "to explain"** (owner asked for a better name). Not
taste — consistency: this exact state is already called *Needs explanation* by `FXST.need`
in the Explanation column, by the Status filter and by the Selected filters chip. "To
explain" was a fourth name for one state, which is the same drift that had this bar saying
"signed off" while the column said "Reviewed".

**And it exposed a real layout bug.** The tiles were `flex:1 1 0` — forced to equal width —
so with the review panel taking 440px every tile shrank to 141px and the LONGEST label (the
hero, the one that matters) spilled past its own tile edge, while `explained` and `reviewed`
sat in slack they did not need. `flex:1 1 auto` sizes each tile to its content and shares the
remainder: measured, no overflow and no truncation with the panel closed, with it open, or in
the observing lens. An ellipsis backstop keeps a longer label added later from spilling, with
the full text in the tooltip every tile already carries.

**Verified:** 60/60 views · console clean · 10/10 chrome themes AA · content text gate
clean · spacing ratchet green · five tiles in every lens · the strip flips correctly
across all six roles (Asset Manager and the three dual roles → preparer; FP&A and External
Auditor → the observing lens) · the three new filters open exactly what their tiles count
(`ready` and `myrev` both 0 and both render the empty state; `wprep` opens 6 lines) ·
balance sheet renders the same five tiles.

### The tile and the column were deriving one state twice

Reported by the owner: with the rule at **2.0M or 5%** the statement marked FOUR lines
"Needs explanation" and the tile said THREE.

The odd line out was **Repairs and maintenance — 0.2 movement, +6.9%.** The percent bar
makes it material, so it REQUIRES an explanation; and with a residual of 0.2 against a 0.5
tolerance it is already `clear`, though nobody has written a word. The tile tested
`!r.clear` and dropped it.

**That is the threshold/tolerance conflation this file already warns about.** The
THRESHOLD decides whether a line must be explained at all (`r.req`); the TOLERANCE decides
whether an explanation covers enough of the movement (`r.clear`). Different numbers,
different questions — `!clear` was answering the second while the column answered the
first.

**The fix is not a better predicate, it is one fewer.** `fxStateKey()` already decides what
the Explanation column prints, so `fxStateOf(r)` wraps it and both the tile and the filter
read it: *needs explanation* is now literally `fxStateOf(r)==='need'`. Same discipline as
`rowReady()` feeding `readyToSubmit()`, the Ready filter and its tile — **one function,
every reader**, with no second derivation left to drift.

**THE FILTER CARRIED THE SAME FAULT, AND IT PREDATES THE WORKLIST PASS.**
`S.show==='open'` is labelled "Needs explanation" in `SHOWS` and was
`r.req && (draft||returned) && !r.clear` — so a material, entirely unexplained line whose
movement is small has been invisible to its own filter for as long as the filter has
existed. Fixed by the same one-liner.

**Verified across six rules** — 2.0M or 5% · 1.0M and 5% · 0.25M or 2% · 5M or 10% · 0.1M
or 1% · 10M and 20% — the tile and the column agree at every setting, on the income
statement (4/4) and the balance sheet (12/12). Clicking the tile opens exactly those four
lines (Tenant recoveries, Power and utilities, Repairs and maintenance, Property taxes) and
every one is marked in the column. 60/60 views · console clean · three gates green.

**The lesson is the one already written in memory: never pass replacement text through the
shell.** This block itself was first inserted with
a `node -e` one-liner inside double quotes, and the shell ate every backtick as a command
substitution — the paragraph landed with its code spans replaced by empty strings and a
terminal escape sequence. Write the text to a file and splice from the file.

## 2026-08-31 — the trend column stays a line; the bar was built twice and rejected twice

Owner: *"12 month trend — can we add horizontal bar instead? Also can we add MoM or QoQ
change options?"* → *"I meant one straight horizontal bar."* → *"where is the color?"* →
**"forget about the bar — I don't like it. I can't tell how that is relevant when it only
shows one bar. How is this helpful?"**

It was not helpful, and the reason is worth writing down so it is not attempted a third
time.

**A SINGLE BAR OF THE CURRENT MOVEMENT RESTATES THE Δ AMOUNT COLUMN.** Same number, same
sign, same green/red, two columns away. The only thing it added over the figure was
pre-attentive magnitude — which line moved most — and **the statement already answers that
better**: the Δ Amount header sorts by largest movement in one click. A column that
duplicates its neighbour and loses to a control that already exists has no argument left.

Colouring it is what made the duplication obvious. The accent version at least looked like a
different kind of information; once it was green and red it was visibly the Δ column drawn
again. That the owner saw it immediately after the colour landed is the whole story.

**Its shared scale also mixed subtotals with detail lines**, so the longest bar on the income
statement was Total revenue — longest because it is a sum, which tells a reviewer nothing.

**THE ONLY NON-REDUNDANT JOB THIS COLUMN HAS IS CONTEXT**: *is this month's movement normal
for this line, or the first of its kind in a year?* That question needs HISTORY, which is
exactly what one bar cannot carry and what the sparkline does. So the column is the line
again, byte-identical to what shipped, and still off by default.

**Two shapes were rejected on the way**, both at the owner's direction: eleven bars of
period-over-period change (a bar-sparkline — *"I meant one straight horizontal bar"*), and
then the single bar. **If a MoM/QoQ basis is ever wanted again, it belongs on a control that
shows a SERIES, not on one that shows a single number.**

### What was kept, because it was real

Three fixes found while building the thing that got reverted. They are unrelated to the bar
and they stay.

- **`colOn()` APPENDED, so every newly enabled column landed after Explanation** — the widest
  and only text column, which belongs last (owner: *"why is the trend behind the explanation?
  The sequence is flawed"*). A new column now takes the first slot whose `COL_DEFS` position
  is later than its own. Columns already on screen keep whatever order the reviewer dragged
  them into; this decides only where a NEW one lands, which is the part nobody was choosing.
  Verified: `trend`, `resid` and `share` each land in their canonical slot, all before
  Explanation.
- **`COLS_DEFAULT` still listed `contrib`**, retired 2026-08-28 and gone from `COL_DEFS`.
  "Reset to default" wrote a dead id back into `S.cols`. `renderGrid()` filtered it out, which
  is why the table never broke — but the picker and any saved view taken after a reset carried
  the ghost.
- **`colName()`** is the one namer for a column, so a header and the column picker cannot
  disagree.

### And a latent dark-mode bug, app-wide

`--pos` / `--neg` / `--warn` / `--neu` are declared in `:root` as `var(--success)` and
friends. **A custom property resolves where it is DECLARED**, so they resolved against html's
LIGHT semantics and inherited down as frozen light values — `[data-theme="dark"]` redefines
`--success` on BODY, too late. Measured before the fix: a favourable Δ rendered `#0F7A44` on
a `#171A21` surface, **about 2:1**. Every green and red figure was affected — the Δ amount,
the F/U mark, the unexplained residual, the worklist meter.

**The dark block's own comment states the rule and was not followed**: *"if you add a
ramp-derived alias to `:root`, add it here too."* `--pos-ink` had been re-declared there and
its three siblings had not, which is how it went unseen. `--neutral` had to be re-resolved
first, or `--neu` would have inherited the same freeze one link down the chain.

After: dark `--pos` `#46C489` at **7.89:1**, `--neg` `#F0685E` at **5.68:1**.

**THE STATIC GATE CANNOT SEE THIS.** `check_text_contrast.mjs` resolves `--pos` → `--success`
analytically and gets the dark value, so it passed throughout. Only the RENDERED colour shows
the freeze. A gate for this class of bug has to read computed style in a browser; it does not
exist yet and is the obvious next tool.

**Verified after the revert:** 60/60 views · console clean · three gates green · the trend
column renders the line again (2 paths, 0 rects) and sits before Explanation · the Table menu
is back to Table · Statement order · Row density.

## 2026-08-31 — three borrowings from the design comps

Owner supplied three comps of this screen and asked for a read on them, then: *"let's start
with 1–3."* The filter tab architecture is explicitly out of scope. What follows is what was
worth taking; the rest of the read is in the response, not here.

### 1. The Δ pair shares one header

"Δ amount" and "Δ %" are ONE measure in two units, and the header row read them as two
unrelated columns — the Δ glyph twice and the word that ties them, *change*, nowhere. They
sit under a single **CHANGE** span now with `$` and `%` beneath, which is what a financial
statement does on paper.

**THE SPAN IS CONDITIONAL, and that is the whole trick.** `fxShed()` hides Δ% by CLASS when
the track narrows, so a hard `colspan=2` would keep spanning two columns while only one
existed and drag every heading to its right one cell out of line. The group renders only when
BOTH are in the column set, and `fxShed()` syncs the colspan when it sheds — a colspan is an
attribute, the one thing a class cannot hide. Verified: panel open → colspan 1, panel closed
→ colspan 2, header and body cell counts equal (8/8) throughout.

**ONE VALUE DRIVES BOTH ROWS, or they overlap.** The sub-row pins at
`--fx-stick + --fx-hgrp-h`, so that height cannot be guessed. Set at 20px against a row that
rendered 32px, the sub-row pinned **12px into the row above** and the pair sat over the first
body rows (measured: header 150–204, first body cell top 178). The group cell is the only
cell in row 1 that is not `rowspan="2"`, so its height IS row 1's height — it is pinned to
the same token the offset uses and the two can no longer disagree. Verified at three scroll
positions: the rows abut at exactly 0px.

### 2. Comments and Support as count columns

Both figures existed and were reachable only inside the panel. On the row they answer "which
lines already carry a conversation, and which carry documents" while a reviewer scans.

**Inventory, not a badge** (rule 12): a quiet grey numeral beside its icon, never a filled
pill — which is the thing to avoid from comp #2, where a green "Reviewed" pill on 18 of 21
rows is a wall of decoration. **An empty cell is an em dash, not a `0`**: two dozen zeroes
stop the eye on exactly the rows with nothing to say.

Support counts **documents**, not citations — `evidenceDocs()` dedupes by file name, which is
the list the Evidence tab and its badge already read. Counting `evidenceFor()` would say 3
where the tab lists 2. Both columns are OFF by default and shed with the analytics group,
before Explanation. Verified live: the seeded thread on General and administrative reads 3,
and posting a comment moved Tenant recoveries from — to 1.

### 3. A driver states its share — it already did, and it was broken

The comps show Key drivers with a share per driver. **We already print it**, in `dwDrivers()`,
which is the drivers view that actually renders.

**`RWSEC.drivers` — the reference's Key drivers card, `.rw-kd` — IS ORPHANED.** It is still
listed in `RW_LAYOUT.drawer.sum`, but Overview has been state-composed by `dwOverviewKeys()`
since 2026-08-30 and that returns `['explain','cmtPeek','reviewer']`, and `RW_LAYOUT.page` was
rebuilt as the two-column Review Desk. Swept the rendered DOM for `.rw-kd` across 6 tabs × 2
densities × 6 lines: **zero hits.** The share was added there first and reverted; the part is
left in place and NAMED as orphaned, because it is the reference composition and is what to
mount if that card ever returns.

**AND THE LIVE ONE HAD THE `contrib` BUG.** Found while looking for the card: *Site operations
and staffing* moved 0.0 and its drivers read **23474% · 19460% · 11119% · 7005%** — four
drivers of ±0.0 that very nearly cancel, divided by the almost-nothing they leave behind.

That is exactly the fault that retired `contrib`, surviving in the one place a share is still
printed: **a percentage is only meaningful while its denominator can carry one.** Below half a
display unit the total rounds to 0.0 on screen and a percentage of it is noise however it is
computed. `shareOf(v,tot)` returns `null` there and the row prints no share — the AMOUNTS
carry the decomposition on their own, which is what a footing schedule does anyway. One
helper, so the root drivers, the drill rows and the bar widths cannot disagree about when a
share exists.

Verified after: Site operations blank with 0% bars; Power and utilities 69 + 18 + 8 + 5 = 100;
Rental revenue 37 + 35 + 23 + 5 = 100; drilled one level (Power → by region) 56 + 23 + 21 = 100.

**Verified overall:** 60/60 views · console clean · three gates green (the ratchet caught a
2px sub-row padding and it went to `--s-1`) · header and body cell counts equal with the
columns on and off and with the panel open and closed · both statements render the two-row
header.

### Later — the defaults, and the period columns name their period

Owner, on the pass above: *"I wouldn't make 12-month trend a default view. Also, instead of
saying current and compared — please add the month on the header. And I didn't like comments
and support columns — you can either remove or leave as an option."*

**THE TWO DEFAULTS HAD DRIFTED.** `S.cols` (what a session opens on) never held the trend
column; `COLS_DEFAULT` (what "Reset to default" writes) did. So a reset handed the column
back and looked like the product had turned it on. They agree now, and that is the rule: a
reset must return you to what a new session opens on, not to a different set.

The trend column and the two count columns are all OPTIONS — real, listed in `COL_DEFS`, one
click away in Display › Table › Columns, off until somebody asks. Comments and Support were
never in either default; they stay available rather than being deleted, which is the lighter
of the two options the owner offered.

**THE PERIOD COLUMNS NAME THEIR PERIOD.** "Current" and "Compared" are ROLES; a reviewer
reading a statement wants the period, and all three comps put the month on the header. A
figure under a column headed **Jun 2026** needs no decoding, and a printed or exported
statement carries its own dates.

**TWO NAMES, TWO JOBS.** `colHead()` is what the header says; `colName()` stays the stable
role name for the column PICKER, the sort tooltip and the shed order — "turn off Jun 2026" is
meaningless in a list of columns, and the wording would change every month. Compared resolves
through `cmpBtnLabel()`, so it reads **Budget** or **Forecast** when that is what the
statement is measured against rather than inventing a date for a comparison that has none,
and `pLabel()` carries the cadence.

Verified across every basis: monthly `Jun 2026 | May 2026`, quarterly `Q2 2026 | Q1 2026`,
year-over-year `Jun 2026 | Jun 2025`, budget `Jun 2026 | Budget`, and stepping a period back
`May 2026 | Apr 2026`. The picker still reads Current · Compared · Δ amount · Δ % ·
Explanation.

**Worth an owner's call, not taken here:** with dates on the header the column ORDER reads
backwards — `Jun 2026 | May 2026 | Change` is newest-first, where a variance statement is
normally read left to right as prior → current → change, which is what all three comps do.
Flipping `cur` and `pri` in `COL_DEFS` (and so in the canonical insert order) would fix it,
but column order is the reviewer's to set and it was not asked for.

**Verified:** 60/60 views · console clean · three gates green · header and body cell counts
equal with all three optional columns on (9/9) · both statements.

## 2026-08-31 — the income statement is PUBLISHED: costs positive, colour on favourability

Owner: *"you have operating expenses as all −ve. Why? This is flawed reporting."*

**It was a convention, not a bug — and the wrong convention for this surface.** Every account
carries its natural sign, so an expense is negative and every subtotal is a plain SUM of its
children: Net operating income was literally Total revenue **plus** Total operating expenses.
That is coherent management reporting. A published income statement does the opposite —
expenses POSITIVE, the column footing by convention (revenue less expenses) rather than by
addition — and on a screen called Income Statement Flux under Financial reporting, that is
what a controller expects.

You can have one or the other, not both. This is the published presentation, done as a
**display layer** so the engine keeps its additive arithmetic:

| | |
|---|---|
| `lineRaw()` | natural sign; the subtotal recursion runs on this, so Total opex is still the SUM of its children and NOI is still Total revenue PLUS Total opex |
| `lineVal()` | `lineRaw` × the line's display sign — every caller outside the recursion reads this, so the grid, the panel, the memo, the sparkline and the export flip together and none can disagree |

**ONE FLAG ON THE LINE, NEVER A GUESS FROM THE SECTION.** `exp:1` marks a line whose natural
balance is a cost. Section membership would be wrong: *Gain on disposition* sits under
Non-operating beside Depreciation and is a credit — flipping it would report a gain as a loss.
**The balance sheet is untouched**: contra-accounts there are legitimately negative in a
published balance sheet, and there is no favourable direction to key a sign off.

**THE DECOMPOSITION HAD TO FLIP WITH THE LINE.** `byDim()` and `rwAgg()` sum the raw slices
and bypass `lineVal` entirely, so without the same sign the header would read a +1.4 expense
increase while its drivers read −1.0 / −0.2 / −0.1 — the card would not foot to the movement it
sits under, which is the one thing Key drivers exists to do. Same for account sub-rows
(`acctSgn`, resolved through the line the account rolls up to via `COA.c`).

### unfav() was a coincidence waiting to break

The old body read `(r.cur<0 && r.d<0) || (r.cur>=0 && r.d<0)` — which is `r.d<0` on **both**
branches, identical to the balance-sheet rule sitting beside it. It looked like it
distinguished revenue from expense and did not. It produced correct F/U marks only BECAUSE
expenses were carried negative, so a rising cost happened to be a falling number. Publish the
statement and the coincidence breaks: a rising cost is +1.4 and would have read **Favorable**.
Stated properly it is the same rule the accounting is — revenue up is good, cost up is bad.

**COLOUR FOLLOWS FAVOURABILITY, THE ARROW FOLLOWS THE SIGN.** The Δ cell, the panel's
four-figure band and the full-screen hero all key colour on `unfav()`; component amounts
(drivers, drill nodes) go through `unfavOn(id,d)`, the same rule applied to a part of the
movement. On the balance sheet `unfav()` is `d<0`, so this is exactly the sign rule it
replaces. Tying the ARROW to favourability too was tried and reverted within the pass: it made
an up-arrow mean "good", so a cost that FELL 0.2 rendered as a green up-arrow — which reads as
a cost that rose. Two facts, two channels.

**Verified end to end:**

| line | Δ | grid | panel | drivers |
|---|---|---|---|---|
| Power and utilities (cost rose) | +1.4 | red ▼‑class, **U** | ▲ 1.4 red | all red, foot to 1.4 |
| Repairs and maintenance (cost fell) | (0.2) | green, **F** | ▼ 0.2 green | all green |
| Tenant recoveries (revenue rose) | +1.4 | green, **F** | ▲ 1.4 green | all green |

Footing on screen: Total revenue 88.1 − Total opex 30.0 = NOI 58.1; NOI − G&A − Txn = EBITDA
57.3; EBITDA − D&A − interest − tax = Net income 28.1. All check. The six opex lines sum to
30.1 against a stated 30.0 — display rounding at 1dp, present before this change and unrelated
to sign.

60/60 views · console clean · three gates green · balance sheet unchanged.

## 2026-09-01 — THE PERIOD IS A PROPERTY OF THE BOOK (stage 1 of 3)

Owner: *"we need to work on the period — which is super important. People will be working
one period at a time. How do you make this default and static? I believe you need to
change/update the architecture."* Then, decisively: *"this should apply to the entire
platform"*, and on where it comes from — *"we have the open/close period, regular accounting
stuff. Each section can be locked/unlocked but once the period is closed, everything becomes
final."*

**NO SCREEN DICTATES THE PERIOD.** That is the answer to the question, and it is why the
period could never be made sticky as a filter: a filter belongs to a view, and four views
each owning one produced four answers. Measured before the change, on ONE screen:

| | said | from |
|---|---|---|
| the close strip | `JUN 2026` | `CLOSE_DAYS.period` — a hard-coded string |
| the topbar chip | `Inception to date` | `F.periodType`, defaulting to `itd` |
| the statement | `Jun 2026` | `S.cur`, a private cursor |

**And it reset.** `pickLens()` wrote the lens's own `filters.periodType` back over whatever
had been chosen, so picking a period on Flux and opening Reconciliations silently returned
you to inception-to-date.

### The model

    BOOK.open     the period the book ACCEPTS WORK IN. One at a time. It moves only
                  through a governed close/reopen, never by navigating.
    VIEW.period   what you are LOOKING AT. Defaults to BOOK.open. You may look back at a
                  closed period; doing so is reading, not working.

Conflating those two is the bug. `BOOK.periods` is the register — status, who signed it
off and when, and a per-section lock map. **Absence means closed**: silence is not
permission.

**A SECTION IS THE UNIT OF LOCK, and the sections already existed.** `CLOSE_FUNCS` is the
close checklist's own function list (Cash & banking, Revenue & billing, Fixed assets & CIP
…) — exactly what a controller locks one at a time. A locked section is final while the
period is still open; closing the period locks every section at once, so `sectionLocked()`
returns true for everything the moment status leaves `open`.

**`canEditPeriod(sec)` is the one predicate every edit surface will ask**, and it is
deliberately SEPARATE from role capability: being a Controller does not make a closed period
editable, and an open period does not make you a reviewer. Both have to hold.
`periodBlockReason()` returns the sentence rather than a bare false — *"Apr 2026 is closed
— signed off by M. Giri, Controller on May 5, 2026. Switch to Jun 2026 to make changes."*

### It lives in the SHELL, and that cost a round

The first cut put the register beside `PERIODS` inside the flux module and **the close strip
threw on load**: that script block is wrapped, so nothing declared in it is reachable from
the shell. The same mistake then repeated in `bookPeriodMenu()`, which walked `PERIODS` and
`pKey()` — the handler threw and the menu silently never opened.

The boundary is real and worth stating: **two script blocks, and the flux one is wrapped.**
The shell can call `KFX.*`; nothing else crosses. The register is platform state, so it
belongs in the shell, and the dependency runs the right way round — the flux cursor READS
the book. `KFX.syncPeriod(k)` is the only bridge, called BY `setPeriod()`, never the
reverse. `S.cur` cannot be seeded from `VIEW.period` either: `S` is built while the flux
block evaluates and the shell has not run yet.

### The control

The close strip's `JUN 2026` is now the period control — already top-left on all 60 views,
which is where a period belongs. It is chrome, not a filter. The word beside it says whether
the book accepts work: **CLOSE** while open, **CLOSED** (amber) while you are reading
history. The menu lists every period with its status and names the open one at the foot.

`setPeriod()` is the ONE writer. It also repaints the chrome explicitly, because
**`renderAll()` does not** — the close strip rides the nav's paint cycle, so the first
version repainted every figure and left the strip naming the period you had just left.
Order matters: `paintCloseStrip` rebuilds the markup including the `#hdrCtl` container that
`paintHdrCtl` then fills.

`windowMonths()` keeps `itd` / `ytd` / `quarter` / `month` but they are **window WIDTHS
anchored to `VIEW.period`** now, not periods: every one ends at the book's period instead of
at whatever a stale `periodVal` happened to name. A fixed-asset rollforward still gets
inception-to-date — that is a wider window on Jun 2026, not a different period. No figures
moved, because each view keeps the width it declared.

**Verified:** 60/60 views · console clean on a fresh tab · three gates green · the strip, the
statement and the book agree · setting the period from the strip moves Flux, and setting it
from Flux's Period field moves the strip · **it survives `pickLens('portfolio')` →
`pickLens('ledger')` → `pickTab('glrecon')`** · a closed period reads CLOSED with
`canEditPeriod()` false and a precise reason.

### Still to build — stages 2 and 3

1. **Enforcement.** `canEditPeriod()` exists and nothing asks it yet. Every edit surface
   needs the guard: explanations, comments, sign-off, requests, assignment, the star, saved
   views. Plus one read-only banner so a closed period announces itself rather than failing
   at the click.
2. **Section locks.** `BOOK.periods[k].locks` is honoured by `sectionLocked()` and nothing
   writes it. Needs the lock/unlock control on the close checklist, role-gated to
   `caps().reopen`, with an audit entry — and the close/reopen transition itself.

### Later — the close and reopen, which the register shipped without

Owner: *"where is my period close/open?"* Fair: the previous pass built the register and the
picker but not the one act they exist to record, so the book could be READ in any period and
MOVED to none.

**WHO.** Gated to the roles `FX_CAPS` already grants `reopen` — Controller and Chief
Accounting Officer, whose own role descriptions say they "review, approve and lock" and
"determine, lock and can reopen". Everyone else sees the state and is told who can change it,
rather than a control that refuses them at the click.

**CLOSING ADVANCES THE BOOK.** A close is not a switch on one period, it is a hand-off: this
period becomes final and the next one opens. Closing the LAST period in the calendar opens
nothing, and the book is then final everywhere — the owner's own "once the period is closed,
everything becomes final". That needs no special case: `bookStatus(BOOK.open)` is no longer
`open`, so `canEditPeriod()` is false on every surface.

**IT IS RECORDED.** Each transition appends to the period's own history with who, what role
and when, and that record is what the menu and `periodBlockReason()` read back. Verified:
close then reopen leaves *"closed the period — Mitra Giri, Controller"* and *"reopened the
period — Mitra Giri, Chief Accounting Officer"*.

**THE CONFIRMATION IS A PANEL, NOT A BROWSER DIALOG**, and it states the consequence in full —
which period becomes final, which one opens, and that there may be none. It replaces the menu
body in place; `periodMenuBody()` is split out so Cancel can restore the list without
re-anchoring the menu to the Cancel button.

**Three things that had to be got right, each of which failed first:**

- **A document handler dismisses `#wsPop` on any click inside it**, so the confirmation
  rendered into a menu that was removed in the same tick — the panel simply never appeared.
  Every action button calls `event.stopPropagation()` first.
- **`min-width` is not a width.** The confirmation body is a sentence, and with only a min the
  menu grew to the width of that sentence: a 900px popover hanging off a chip in the corner.
  It is a fixed 300px.
- **CONTENT TOKENS, NOT CHROME.** `.ws-menu` is a WHITE popover on the content plane even
  though it is launched from the dark ribbon. `--chrome-text` put the period name at
  **1.17:1** on white and `--chrome-text-mute` put the sentence at **3.81:1**, under the AA
  floor. Now 14.12:1 and 10:1. **The static text gate does not see this** — those tokens are
  scoped to the chrome plane, which it checks against chrome surfaces. Judge a token by the
  surface it lands on, not by the control that opened it.

**`setPeriodHard()` exists because `setPeriod()` short-circuits on an unchanged key** —
exactly the case after a reopen, where the period is the same and its STATUS is not.

**Verified:** close → strip reads `JUN 2026 · CLOSED`, `canEditPeriod()` false, reason precise ·
reopen → `CLOSE`, editable, both entries in history · a non-admin sees the state and no
control · Cancel restores the list and stays anchored · 60/60 views · console clean · three
gates green.

**Still open — the enforcement.** `canEditPeriod()` is now reachable, correct, and asked by
nothing. The next stage is threading it through the edit surfaces (explanations, comments,
sign-off, requests, assignment, the star) with one read-only banner, plus writing
`BOOK.periods[k].locks` from a section control on the close checklist.

**And a process note, because this is the third time.** This block was first inserted with a
`node -e` one-liner and the shell ate every backtick as a command substitution — the
paragraph landed with its code spans blanked out. The rule is already written in memory:
**never pass replacement text through the shell.** Write it to a file and splice from the
file.

### Later — the close was unreachable, and two literals disagreed about who may reopen

Owner: *"how do i close the period?"* The control shipped in the pass above and the owner
could not find it. Three separate causes, all real:

**THE STRIP SAID `CLOSE` BESIDE A PERIOD THAT WAS OPEN.** `.cstrip-l .tag` rendered
**Close** while the book accepted work and **Closed** once it did not — so the one place a
controller would look for "close the period" carried the word and no control, and the word
meant the OPPOSITE of the state it was reporting. It reads **Open** / **Closed** now, which
is the vocabulary the menu's own period list already uses. One word, one meaning.

**THE DEFAULT IDENTITY CAN NEVER CLOSE.** `USER_ROLE` is *Accounting Manager*, whose role
text is "Prepares and reviews" — correctly not a period admin. So the product as it opens
shows the gate's polite refusal and nothing else, and testing the close meant a trip through
Settings › Roles & access. The refusal now carries the prototype's OWN role switch —
**Act as Controller** — beside the sentence explaining why it is needed. Settings already
says the role "is switchable here so you can preview each"; this is that same device at the
point of refusal. It is **not** an access request and must not be made to read like one: in
a real deployment an admin assigns the role and this button does not exist. It is an
OUTLINE, so the menu's one filled control is still the act itself (rule 13).

**AND THE POLICY WAS STATED TWICE, IN CONFLICT.** Settings' sign-off matrix said Controller
may lock but **not reopen**; `reopenPeriod()` was gated on `canClosePeriod()`, which admitted
both Controller and CAO. Two hand-written literals for one policy, already drifted — the
exact failure the rest of this file keeps collapsing. **`PERIOD_CAPS` is now the one table**,
read by the period control AND by the matrix, and the matrix wins the disagreement because it
is the declared policy: a **Controller locks the period, only the Chief Accounting Officer
reopens it.** Close and reopen are separate capabilities and the menu names the right role
for each. A role absent from the table has neither — silence is not permission.

The matrix also now lists **Accounting Manager**, the default identity. A role whose standing
is missing from the table cannot be checked against the wall it hits, which is most of why
this took a session to notice.

**Verified:** strip reads `JUN 2026 · OPEN` · the menu as Accounting Manager states the rule,
names the signed-in role and offers Act as Controller · one click reaches **Close Jun 2026** ·
the confirmation, the commit, the advance and the audit entry all unchanged · a **Controller
is refused the reopen** and offered *Act as Chief Accounting Officer*, who gets it · history
reads `closed the period — Mitra Giri, Controller` then `reopened the period — Mitra Giri,
Chief Accounting Officer` · matrix renders `Accounting Manager Yes/No/No · Controller
Yes/Yes/No · CAO Yes/Yes/Yes` · 60/60 views · console clean · three gates green · the act-as
button 14:1 and the note 11.5:1 on the white menu.

**Checked and found clean, recorded so it is not re-chased:** `VIEW.period` was instrumented
with a setter trap and every one of the 63 view keys driven through `pickTab()` — **zero
moves, synchronous or asynchronous.** No view silently changes the working period; a stray
`MAY 2026` seen mid-session was the test harness clicking a period row, not the app.

## 2026-09-01 — THE PERIOD IS THE WORKSPACE (stage 2 of 3): every Accounting page inherits it

Owner's brief: make the selected accounting period the persistent financial context for the
whole Accounting workspace. **PERIOD** = what period am I working in · **SCOPE** = what
organisation am I viewing · **VIEW** = how do I want to analyse it. Stage 1 built the register
(`BOOK` / `VIEW`); this is the stage where the pages actually read it.

**A PAGE THAT HARD-CODES THE PERIOD CANNOT INHERIT ONE.** Measured before: 60 literal
`Jun 2026` and 69 `Jun 30, 2026` in the file, and the worst of them was `glCtx()` — the subhead
of **every** General Ledger page — which pushed the string `'Jun 2026'`. `periodCtxLine(tab)` is
the one place that turns the selected key into each page's own shape, and `perLong` / `perEnd` /
`perRange` / `perQtr` / `perWindow` / `perAdd` are the words it is built from. Month arithmetic
is on the KEY, never on `Date`, so nothing can drift a day.

| Page | States |
|---|---|
| Close | `June 2026 Close` · `June 1 – June 30, 2026` |
| Financials | the presentation window — `Jun 2026` · `Q2 2026` · `Jan–Jun 2026` |
| Trial balance · Reconciliations · Intercompany | `As of Jun 30, 2026` |
| Flux | `Jun 2026 vs May 2026` |
| Trending | the window on screen — `Jul 2025–Jun 2026` |
| Consolidation · Exceptions · Accounting Issues | `June 2026` / `June 2026 close` |

Verified end to end: one `setPeriod('2026-03')` from the header moves all of them, and the
selection survives `ledger → portfolio → fpa → ledger`.

### PRESENTATION IS NOT PERIOD, and it appears only where it acts

`F.periodType` was a *period* control offering "Single month" plus a **Which** picker — a second
way to choose the period, which is exactly the redundancy the brief removes. On Accounting it is
**Presentation** now (Monthly · Quarterly · YTD), it drives the same `#periodType` element so no
data path moved, and **Which is gone**: the quarter and the month are the selected period's own.

**It renders on Financials and nowhere else.** Every other Accounting page either reads no window
or answers "as of", so a control there could not change a figure — and a control that cannot act
is a dead control. Measured before deciding: switching the window moves figures on **glfin only**,
across all six Accounting pages tested. That is also why the lens default moved `itd → month` —
inception-to-date is not a presentation *of* a period, and nothing but Financials noticed.

**And the balance sheet stops being scaled.** The statement rendered every line as `cur` and
`cur * 6` under a heading that read "YTD Jun 2026" — including the balance sheet, whose balances
were being multiplied by six. A balance answers "as of" and has no window to widen: it scales
nothing, heads its columns `As of Jun 30, 2026` / `As of May 31, 2026`, and drops the YTD pair.
When the presentation IS year-to-date the period pair and the YTD pair are the same two figures,
so the duplicate is dropped there too.

### FLUX: THE COMPARISON IS DETERMINISTIC

Three controls became one. **Period, Compare and Cadence** were an open-ended "Period A vs
Period B" — the Compare menu even carried a `custom` branch listing every prior period in the
calendar, a second way to move the period that never went through the book. They are one **View**
field on a **Comparison** tab, and each option is a NAMED PAIR of a window and a basis the engine
already understood, so no figure path moved:

| View | Resolves to | `grain` · `compare` |
|---|---|---|
| MoM | Jun 2026 vs May 2026 | `m` · `seq` |
| QoQ | Q2 2026 vs Q1 2026 | `q` · `seq` |
| YoY | Jun 2026 vs Jun 2025 | `m` · `yoy` |
| YTD | Jan–Jun 2026 vs Jan–Jun 2025 | `ytd` · `yoy` |
| 6M Trend | Jan–Jun 2026 | `t6` · `seq` |
| 12M Trend | Jul 2025–Jun 2026 | `ttm` · `seq` |
| Budget · Forecast | Jun 2026 vs budget / forecast | `m` · `budget` / `fcst` |

**The view is DERIVED from the pair, never stored beside it** (`fxViewId()`), so a saved view
taken before this change still opens and anything unrecognised — the retired `custom` among them
— resolves to MoM rather than to a comparison nobody chose. Same migrate-on-read discipline
`dispMode()` follows.

**ONE PRIOR RULE.** `priorForView(v)` replaces the branch-per-basis: a window grain compares
against the window immediately before it, so `q`, `6M` and `12M` all follow one line instead of
three. `win()` gained `t6` and nothing else.

**A TREND VIEW NAMES ITS WINDOW, NOT A PAIR** — "Jan–Jun 2026", per the brief. Its compared
column then names the prior window itself (`cmpBtnLabel()` → `Jul–Dec 2025`), so nothing on the
statement is unlabelled. Budget and Forecast were KEPT: they are equally deterministic — same
period, a different basis — and dropping them would have removed real function. What is gone is
the arbitrary date picker.

**`cadenceWord()` is retired to an empty string.** It existed to add "Monthly" beside a phrase
that did not carry its own window; every view's phrase now names the window on both sides of the
`vs`, so a cadence word would say it twice.

**THE HEADER LEADS WITH THE COMPARISON** (brief §5). The page is **Flux** — not "Corporate Flux";
an adjective that never changes was competing with the line that does — and the comparison is
marked `.tb-cmp` (ink at `--fs-ui` against `--fs-label --hint` beside it), so it reads as the
subject of the page rather than as crumb. A reviewer never has to open a filter to know what the
figures are.

### TRENDING IS ANCHORED, AND WAS NOT

It rendered a fixed 30-month series ending at a hard-coded Jun 2026 with **no window control at
all** — so once the book can open in any period it would have shown months *after* the period
under review. `trendSeries()` is one function read by the chart, the statistics beside it and the
header line, so they cannot describe different spans: 6 months · 12 months · Quarterly (four
quarters, each the SUM of its months, not every third month) · Full history, every one ending AT
the selected period. The window is a bound `<select>` in a labelled `.grp`, which is the
vocabulary `gfPageGrps()` already discovers — so it needed no wiring of its own. Its growth
figure is annualised from the window on screen; it used to divide by a hard-coded 2.5 years.

### THE CLOSE WORKSPACE IS AN ORCHESTRATION CENTRE, NOT A DASHBOARD

The page opened on **seven KPI cards** — close period, completion, days remaining, tasks
completed, tasks overdue, blockers, entity completion — which is the "dense dashboard full of
KPIs" the brief rules out, and which answered *how much is there* six times before answering
*what needs me* once. It now opens on the four questions the brief names: where are we, what
requires attention, what work remains, what can I drill into.

**Nothing is duplicated.** Every row states where a workspace stands, read from that workspace's
OWN data (`GL_RECON`, `icUnmatched()`, `consolReady()`, `amKpi()`, and `KFX.fluxStats()` — a new
export that walks the same `rows()` the statement renders, so the orchestration page and the page
it links to cannot disagree about the count), and hands the reviewer to it. **The period needs no
argument passed**: it is global, so the destination inherits it. Severity on the attention rows is
a 3px left border and nothing else (rule 8); the meters are 60px glances beside the fraction that
is the actual fact. Every figure the seven cards carried survives — completion is the headline,
blockers and overdue lead Needs attention, the entity table below is untouched.

### THE DROPDOWN NAVIGATES; IT DOES NOT CLOSE THE LEDGER

Owner: *"Korvyn should not imply that clicking a simple dropdown button directly closes the
accounting ledger. The ERP remains the source of truth."* Right — and it was the primary action
of the menu. The footer is **"View Jun 2026 Close →"** now. `closePeriod()` / `reopenPeriod()`
are untouched, still gated by `PERIOD_CAPS`, and moved to the **Close workspace's own header**,
which is where the close is orchestrated and where its governance act belongs.

### TWO CONTROLS LABELLED "PERIOD" ON ONE STRIP

The close strip carried the master period chip on the left (`JUN 2026`) and, on the right, a
second chip labelled **Period** reading *"Month"*. It has never shown a period — it shows the
window width. It is named **Window** now, and on the Accounting workspace it does not render at
all: the window is Presentation and the period is the book's. Every other module keeps it, having
no global period to inherit.

### A live bug found while mapping, and fixed

`windowMonths()`'s quarter branch read `PERIODS[viewIdx()]` — `viewIdx()` does not exist and
`PERIODS` belongs to the wrapped flux module, so the function **threw** the moment anyone chose
Quarterly. It never fired because the default was inception-to-date; making Quarterly a
first-class presentation is exactly what would have surfaced it. It computes the quarter from the
period key now, in shell arithmetic.

### Structural, not built (brief §3/§14)

`closeVersion` is read off the period record and rendered when present. **Nothing writes it** and
no version management exists — this is the shape being reserved, not a feature being claimed.
Deliberately not built: the ERP close API, a certification engine, close-version history,
restatement, workflow automation, a new permissions architecture, a snapshot engine.

**Verified:** **180/180** — all 60 views rendered in each of three periods (Jun 2026, Mar 2026,
Dec 2025) · console clean · three gates green (the spacing ratchet caught six off-scale values in
the new Close CSS and they were put on the scale; baselines unchanged at 1076/89) · the six Flux
views resolve exactly as specified and re-anchor when the period moves · Trending never runs past
the selected period in any of its four windows · Presentation renders on Financials alone and
moves only its figures · the balance sheet scales nothing · the close action is offered to a
Controller and withheld from an Accounting Manager · the period survives a module round-trip.

### Still on independent period state — the next increment

- **`ASOF`** (the "As of · Live" rewind beside the window chip) is a separate time axis and was
  deliberately left alone; it answers "as the record stood at a timestamp", not "which accounting
  period", and conflating the two would be the same mistake this pass undid.
- **`CLOSE_DAYS`** still carries authored `opened` / `due` / `remaining` and the close timeline's
  `DAYS` axis is a literal `Jul 1 … Jul 8`, so the close CALENDAR does not move with the period
  even though the close itself does.
- **`IC_ASOF='2026-06-30'`**, `gliAsOf`'s "Full period · Jun 30" and the remaining hard-coded
  dates inside sample DATA. Data is data; the labels above it are what matter and those now
  derive.
- **`glfin`'s prior-period factor** is still the illustrative `P = 0.982` rather than a period
  lookup, so its comparative column is proportional rather than sourced.
- **The GL engine reads its own book**, not `windowMonths()` — anchoring GL FIGURES to the period
  (rather than only their labels) is the real stage-3 work, alongside the `canEditPeriod()`
  enforcement stage 1 left open.

## 2026-09-01 — the Close workspace becomes an operating surface, not a dashboard

Owner's brief: Close must answer four questions immediately — where are we, what is
preventing completion, what needs *me*, and where do I go next — and it is the
**orchestration layer**, not a place to do the accounting. Financials, Flux,
Reconciliations, Intercompany, Consolidation and Accounting Issues keep their own
workspaces; Close states their readiness and routes into them.

**ONE PAGE, THREE EMPHASES, NO THIRD ARCHITECTURE.** `Overview · My work · All work`
is a `.ktabs.lvl2` strip — the design-system tab primitive, not a new component — and
all three share the same header, status strip and switcher. **All work is what was
already on this page**: the close timeline, blockers, entity completion and the
filtered checklist, reused whole rather than rebuilt. Overview and My work are new
compositions over the same data.

### The status strip, and why the three stages do not sum to the headline

One integrated strip, not three KPI cards. The headline is `closePct()` — **the same
figure the ribbon has always shown**, so the page cannot contradict the chrome above
it. Beneath it the three stages (brief §6) each state their **own fraction**:

| Stage | Measures | Today |
|---|---|---|
| Preparation | checklist tasks complete | 54 / 76 |
| Review | reconciliations reviewed + flux signed off + entities consolidated | 25 / 51 |
| Certification | entity sign-offs | 0 / 4 |

They are not slices of one number and are not presented as if they were: preparing the
book, reviewing it and certifying it are different work over different objects, and
printing each denominator is cheaper than a footnote explaining a weighted total.
**Certification reads zero honestly** — nothing signs off yet, and borrowing a figure
from the stage before it would assert a control that does not exist.

### Needs attention is the section that dominates, and materiality decides its order

Six rows maximum, **ranked by financial impact with blocking work ahead of everything**
— a blocker stops other work, which no amount does. Each row carries the figure that
ranks it, the entity or pair it belongs to, the owner the record names, and a route.

**ONE MONEY UNIT AT THE EDGE.** The book states reconciliation and flux figures in
`$000` and intercompany in `$M`. Ranked in their own units, a 1.4M flux line sorted
above a 2.3M intercompany break — the exact "treat $18.4M like $2,300" failure the
brief calls out, arriving through unit drift rather than through indifference.
Everything is converted to `$000` once, on the way in, so the ranking and the wording
read one scale.

### Close work is a table, and every count comes from the workspace it describes

`GL_RECON` · `GL_IC` · `GL_CONSOL` · `CLOSE_TASKS` · `amKpi()` · `KFX.fluxStats()`,
which walks the same `rows()` the flux statement renders. There is no headline authored
over a table that says something else (the `RECON_SCALE` rule). **Two fields ARE
authored and are named as such in the code**: the owning team and the last-activity
time. This prototype models no org chart and no event log, and inventing a derivation
for them would be worse than saying they are placeholders.

**Status is one closed vocabulary** (`CW_ST`, brief §5) — Not started · In progress ·
Prepared · Pending review · Review required · Blocked · Exception · Ready · Ready for
certification · Certified. No "Good"/"Okay"/"Done". Colour is on **blocked and
exception only**; everything else is the neutral `.pill`, so the table is not a rainbow.

### A ROW'S ROUTE IS AN INDEX, NOT A STRING OF CODE

The first cut put the destination's filter call into the onclick as text —
`cwOpen('finrep', "KFX.setShow('need')")` — which **terminates the double-quoted
attribute at its own first inner quote**, so the handler was truncated and every
attention row silently did nothing. Escaping it would have worked and would still have
been a page that builds code out of strings. `cwLink()` files the route as a FUNCTION
while the row renders and returns the index; `CW_ROUTES` is reset at the top of
`closeShell()`, or every repaint would append another copy of every destination
(asserted: 17 routes after one paint and after four).

Verified end to end — each row lands on the right workspace **with the destination's
own filter applied**, in the period the book is open in:

| Row | Lands on |
|---|---|
| Flux · material variances | `finrep`, `S.show='need'` |
| Reconciliations · awaiting review | `glrecon`, `glReconFilter='prog'` |
| Close checklist · blocked | `acctclose`, `clFilter.st='blk'` |
| Intercompany · unmatched | `icomp` |

**The period is never passed.** It is global, so the destination inherits whatever the
book is open in — which is the whole point of the increment before this one.

### My work is wired, not mocked — and the two name forms did not match

It reads the owner recorded on the close task and on the reconciliation against the
signed-in user. The app already has both, so building an authorization model to answer
"what is mine" would be a framework written to avoid reading a field.

**The book writes owners as `M. Giri` and the session knows `Mitra Giri`**, so a string
compare found **1 of 16** items that are actually mine. `cwIsMe()` matches on surname
plus first initial, the only thing the two forms share. 9 items now.

### Certification reports; it does not act

Understated block (brief §11): *Not ready · 6 items must be cleared before this period
can be certified · View blockers*. **No close button** — the governance act is the
period control in this page's header, gated by `PERIOD_CAPS`, and there is no ERP close
posting here. Every attention item is a certification gate, so the count is the
attention count and the sentence says what it gates rather than calling six things
"blocking" when four of them block only the sign-off.

### Judgment calls worth recording

- **Close readiness (brief §10) was omitted.** The brief offered it conditionally —
  "if this makes the page too repetitive, prioritize the Close Work table" — and it is
  the Close Work table with fewer columns. One statement of where a workstream stands.
- **No filter ribbon on Overview** (brief §15, which prefers none). The page shows six
  attention rows and seven workstreams; there is nothing to filter yet.
- **No contextual drawer** (brief §18). The only docked panel in the product is the
  flux inspect panel, which is flux-scoped; the brief says not to build a new drawer
  architecture, so rows navigate. `openCloseTask()` still expands a task inline on
  All work, which is the pattern this page already had.
- **Entity names were left alone.** The brief lists credible enterprise names as
  examples; the book's own — Meridian DC Holdco, Fleet DC OpCo, Meridian Property Co —
  are already of that kind, and renaming the entity set would ripple through every
  workspace for no gain. Global texture comes from what is already modelled: EUR and
  GBP entities, four legal entities, eight close functions, 45 reconciliations.

**Verified:** **360/360** — all 60 views rendered across 3 Close tabs × 2 periods ·
console clean · three gates green (the ratchet caught five off-scale values in the new
CSS; they were derived from tokens and the baseline is unchanged at 1076/89) · every
route lands filtered and in period · the route table is stable across repaints · the
hierarchy measures header → strip → tabs → attention → work → certification, with
attention 453px tall against activity's secondary placement below the fold · type on
the 5-step scale (20 / 12 / 11) and every new element 5.62:1 or better.

**One tooling note.** The Browser pane's screenshots went stale mid-session — the DOM
returned correct live state while the pane painted a previous view — and this session
could not start its own server (five already running from other chats). Verification
fell back to computed geometry, computed colour and rendered text, which is stronger
evidence than a screenshot anyway; the visual was confirmed on the last good frame.

## 2026-09-02 — RECONCILIATIONS R1: the work unit is a governed reconciliation group

Owner's brief, stage 1 of an eight-increment roadmap. The page this replaces listed one row per
(account, entity) out of `GL_RECON` and asked a preparer to tick accounts off. That model is
rejected: the chain is

```
ERP GL / TB -> approved account mapping -> canonical account
            -> financial statement line -> RECONCILIATION GROUP
```

and every one of those layers already existed in this file. **Nothing in R1 re-declares a chart
of accounts, a trial balance, an entity hierarchy, a period selector or a balance.** Amounts come
from `fsAmount()` — the same governed object Financials, Trending and Flux read — so a
reconciliation and a statement cannot disagree about what the ledger says.

### TWO OBJECTS, AND THE DISTINCTION IS THE WHOLE DESIGN

| | |
|---|---|
| **`ReconciliationDefinition`** | PERSISTS ACROSS PERIODS. `REC-CIP-ELECTRICAL` is one governed, effective-dated, versioned configuration — not a new record every month. |
| **`ReconciliationInstance`** | ONE PER (definition, period, scope, reporting lens). `REC-CIP-ELECTRICAL-2026-06`. |

**Instances are DERIVED on demand, never stored** — that is what keeps the register from becoming
a second set of balances. Change the period and every figure re-resolves from the statement
engine. Verified across Jun / May / Apr 2026: one definition, three instances, three fingerprints,
and June's beginning is May's trial balance exactly.

**The ONLY thing stored is workflow state** (`RC_STATE`, seeded from `RC_SEED`). A review status
is a fact about people and cannot be derived from a balance. **There is no
`reconciliationPageStatus[]` and there must not be one** — the Control Center, the workspace and
Close all read `rcState()` / `reconReadiness()`.

### THE ROLL-FORWARD, AND WHY NOTHING IS STORED TWICE

```
beginning + activity + other = endingCalculated
difference = endingCalculated - trialBalance
```

**Neither `endingCalculated` nor `difference` is stored.** Both derive, every time.

- **BEGINNING IS THE PRIOR PERIOD'S GOVERNED ENDING BALANCE** — literally
  `fsAmount(line, prior).reported`, the same object Financials prints for May and Flux uses as its
  comparison. There is no separately maintained opening balance, so June cannot drift from May.
- **TRIAL BALANCE IS THE GOVERNED REPORTED BALANCE** — `fsAmount(line, period).reported`. No
  second TB store exists anywhere in the module.
- **ACTIVITY IS THE RESIDUAL OF THE GOVERNED MOVEMENT IN R1**, less any stated
  `r1ActivityVariance`. That is an honest prototype and is named as one in the code: R2 replaces
  it with the transaction population and the field disappears with it. Where a variance IS stated,
  the activity population genuinely does not explain the movement and **the reconciliation does
  not tie** — which is the point, and is how the untied cases exist without storing a difference.

Verified on the CIP reference model: 3,942.0 + 254.0 + 14.2 = 4,210.2 = TB, difference 0, and
4,210.2 is byte-identical to Financials, Trending and Flux current. **Zero mismatches across all
35 reconciled financial lines**, on both TB and beginning.

**A GROUP'S SHARE OF ITS LINE IS ALLOCATED WITH THE LAST GROUP TAKING THE REMAINDER**, on every
component independently — the same plug discipline the Flux key-drivers card uses and for the same
reason: four independently rounded figures do not visibly add up. The four CIP groups foot to CIP
on every column (verified: beginning 3,942.0, activity 254.0, other 14.2, TB 4,210.2).

**A SINGLE-GROUP LINE IS CARRIED AT FULL PRECISION, NOT AT THE DISPLAY DECIMAL.** Rounding to 1dp
is what makes a SPLIT foot on the printed column; applied to a line with one group it put the
reconciliation a rounding step away from the statement it exists to tie to — 32 lines were off by
up to 0.05 before this was fixed. `rcN()` / `fsM()` round once, on the way to the screen.

### THE POPULATION COMES FROM THE MAPPING, NEVER FROM A LIST ON THIS PAGE

`accountPopulationRule` is read against `MAPPINGS` through `mapResolve()` AT THE PERIOD. Nothing
in `RECON_DEFS` names a source account. Three things come back besides the population, and each
answers a question the brief asks:

- **`candidates`** — an UNMAPPED account Korvyn attributes here and cannot place. Surfaced on the
  row, above the table and in the workspace, never silently excluded, and it makes the tie status
  **Incomplete**. The worked case is `99120 Suspense - Unclassified` under Other Current Assets.
- **`contested`** — an account a RIVAL mapping rule would place in this group instead. `471100
  Electrical Installation` is the worked case: a chart-of-accounts rule says Electrical
  Infrastructure, a German entity-group rule says Mechanical, neither was filed as an override.
  Whichever group loses still has to know the account is claimed.
- **`rcPopulationDelta()`** — the population compared against the prior period's resolution of the
  same rule. Electrical CIP genuinely gains `15010` at 2026-06 because MV-2026-06-4 split the US
  and German capex accounts. A mapping change reads as a population change, not as an unexplained
  movement.

**A CONTESTED POPULATION IS NOT AN INCOMPLETE ONE.** Both rival rules put 471100 on FS-CIP and in
RG-CIP, so the LINE's population is complete and only the split between two groups is contested.
It is flagged, and it does not change the tie status. An UNMAPPED account is different: the
balance is attributable to nothing, so the population is not settled and Incomplete outranks the
arithmetic.

### SIX STATE DIMENSIONS, NEVER ONE BOOLEAN

`tie` · `movement` · `support` · `preparation` · `review` · `final`. A reconciliation that ties is
not one that is done: it can tie mechanically, still be missing its project roll-forward, and
still be sitting with a reviewer. **`final` is DERIVED from the other five and is not settable**,
and where it reads Open the panel states WHY in a sentence rather than leaving six pills to be
cross-read.

**TIE STATUS IS DERIVED AND CANNOT BE SET.** `rcTieStatus()` reads the population and the
materiality policy's tolerance; a user cannot mark an untied reconciliation Tied. **Support is
derived from its REQUIREMENTS**, not typed — a DERIVED requirement is satisfied by a governed
population Korvyn already holds, an ATTACHED one needs a document and reads Pending, which is R4.
A support requirement is not an attachment: *"project roll-forward is required and has not been
provided"* is a control statement that exists before any file does.

### THE CONTROL CENTER

A dense financial workpaper in the idiom Financials and Trending already established — `.fsx-bar`,
`.fsx-cx`, `.fsx-card`, `.amap-panel`, `.ktabs.lvl2`, `.pop`. **Nothing here introduces a second
table language, a second dropdown or a second docked panel.**

- **The page states its context once**, in the shell's own title row: *"Jun 2026 · USD · Corporate
  Consolidated · US GAAP"*. No second period picker, no second entity selector — Scope is
  inherited and untouched.
- **Eleven columns**: account / group · Beg · Activity · Other · End · TB · Diff · MoM · Tie ·
  Support · Review. Hairlines, tabular mono figures, indentation for hierarchy, row height one
  step tighter than the platform (`calc(var(--row-h) - 12px)`) because this surface puts
  forty-five lines and eleven columns on one screen. Derived from the token, never a literal.
- **The FS hierarchy is reused and PRUNED** to the branches that carry reconciliations. A section
  with nothing under it is noise, and rendering 40 empty financial lines would be the giant list
  of accounts this page exists to remove. **A section row is a LABEL BAND, not a total** — a sum
  across reconciliations is not itself a reconciliation and printing one would invite a reader to
  tie to it.
- **ONE compact status summary line**, not KPI cards: *"38 required reconciliations · 35 tied ·
  22 approved · 6 in review · 2 returned · 3 untied · 2 overdue · 5 support exceptions"*. Every
  count is a filter, so reading the position and opening it are the same gesture, and every count
  derives from `reconReadiness()`.
- **Quick views are READINGS of the same instances**, never separate pages.
- **MoM is neutral** (rule: sign is not favourability on a balance sheet — a rising asset and a
  rising liability are both positive and mean opposite things). Only the difference takes colour.
- Severity is a quiet word tag and only when something is owed, so a healthy screen carries none.
  An inventory fraction (CIP's `2/4` support) is grey text, never a badge.

**A `.rcx-r.ln td` rule sets ink at (0,2,1)**, so `.rcx-diff` and `.rcx-mom` have to match that
specificity and sit below it or a financial-line row prints its difference in ink. Caught by
measuring computed colour, not by reading.

**FSLINES NAMES ARE PRE-ESCAPED HTML** and are rendered raw, exactly as Financials and Trending
render them; a definition name is plain text this page authored and IS escaped. Escaping both
printed `Furniture &amp;amp; Equipment`.

### THE DOCKED WORKSPACE — six tabs, no modal

Summary · Roll-forward · Activity · Support · Review · Trace, in `.amap-panel`. Verified: **228/228
combinations of 38 definitions × 6 tabs render with content.**

- **Roll-forward** is an Excel-like workpaper and every row is a `RollforwardComponent`, so what is
  on screen IS the object model. It closes by naming the component types the model carries and
  this increment does not calculate — FX translation, ERP remeasurement, elimination. **FX is
  deliberately not buried inside Other**, because that is exactly the decision R3 would have to
  unpick. `REPORTING_ADJUSTMENT` is a separate component type from `GL_ACTIVITY` forever: a Korvyn
  reporting overlay is not an ERP posting and the trace has to keep saying so.
- **Activity** resolves the population's IDENTITY and size, not its transactions — accounts,
  canonical accounts, transaction count, ERP systems, `activityPopulationId`, mapping version.
  R2's grid, drill and download resolve the SAME id; they are not a different query. Transaction
  count is derived from the population (accounts × entities × a stable per-account rate) so it
  moves when the population moves instead of contradicting it. **A population with no modelled
  source account does not get to claim four ERP systems** — it says so.
- **Trace** answers "where did this number come from" as one vertical chain in the idiom
  Financials already uses: group → definition → financial line → mapping version → canonical
  accounts → source accounts → activity population → trial balance → ERP sources, then the
  reporting-adjustment disclosure and the fingerprint.
- **Submit / Approve / Add support / View activity render disabled with the increment they belong
  to in their title.** They are not dead controls pretending to work, and they are not absent —
  the shape of the workflow is visible and honestly dated.

### THE FINGERPRINT AND THE REVISION, BUILT NOW SO THEY DO NOT NEED A REWRITE

`reconciliationFingerprint` carries `sourceTBVersion` · `sourceGLSnapshotId` · `mappingVersion` ·
`hierarchyVersion` · `definitionVersion` · `statementVersion` · `reportingLensId` · `fxRateSetId` ·
`consolidationRuleSetId` · `dataAsOf`, plus an FNV digest of all of them so comparing two
fingerprints is one string compare. The instance carries `revision`, `priorCertifiedInstanceId`,
`reReviewRequired` and `changeSetId`. **R1 records them; the "data changed after sign-off"
detection and the amendment workflow are R6.** Verified: the three period instances of one
definition produce three different digests.

### REPORTING LENS — the third axis, and only one of four is built

`REPORTING_LENSES` carries Corporate Consolidated · EMEA Reporting Group · Germany Statutory · US
Tax Group, each with its hierarchy, basis, presentation currency, consolidation rule set and FX
rate set. **It is NOT a second entity selector** — Scope answers "which entities" and is
untouched; a lens answers "under which basis, in which currency, against which hierarchy".

**Only the corporate lens is built.** Translation, consolidation rule sets and statutory adjustment
engines do not exist, and a lens that silently returned US-GAAP-USD figures under a "Germany
Statutory" label would be a lie with a picker on it. The other three render **disabled with the
reason in their title** — the same treatment Financials gives the Cash Flow and Equity statements
it declares but has not built. Hiding them would make the architecture invisible and make the menu
lie about the choice.

### THE PAGE'S MENUS JOIN THE ONE POPOVER SYSTEM

`RCFIELD(k)` is the same descriptor shape `GFIELD(k)` is, and `paintPop()` gained an `rc:` branch
beside the `g:` one — so rendering, keyboard, anchoring, width and selected state all come from one
place. **A new page does not get a new dropdown.** `popRebind()`'s generic `[data-pop=…]` fallback
already re-acquires the trigger after `renderAll()`, so the menu survives its own filter.

### CLOSE CONSUMES THE SHARED READINESS OBJECT

`reconReadiness(period, scope)` returns `totalRequired` / `tiedCount` / `untiedCount` /
`incompleteCount` / `readyForReviewCount` / `inReviewCount` / `approvedCount` / `returnedCount` /
`overdueCount` / `supportExceptionCount` / `reReviewRequiredCount` — every one a count of
instances. `cwRecon()` reads it in the same guarded shape `cwFlux()` uses and for the same reason,
so a close cannot report a reconciliation position the Reconciliations page does not show. The
Close workstream row and the Review stage both moved onto it (22/38 and Review 24/44).

### LEGACY — `GL_RECON` SURVIVES, AND RETIRING IT IS NOT THIS INCREMENT'S JOB

`GL_RECON` has ~50 consumers across Home, Close, Exceptions, My Work, Issues, Consolidation, the
Controller command centre and Ask Korvyn, and it is the only entity-level reconciliation data in
the file. It stays, and it stays the fallback in `cwRecon()`. **What is retired is the page**:
`glvReconWork` / `glvReconDetail` / `glReconWork` / `glReconSel` and the `setGlRecon*` setters are
now orphaned as far as this view is concerned — a legacy deep link such as
`setGlReconSel('15000|Meridian DC Holdco')` still navigates to Reconciliations but lands on the
Control Center rather than on that account's pane. **That is the largest piece of debt this
increment leaves**, and it belongs to R5, when the review workflow gives the entity-level
reconciliation a real home.

### DELIBERATELY NOT BUILT (each named in the model, none faked)

Transaction-level activity grid, journal drill and export (R2) · sophisticated multi-currency, FX
bridge, elimination and statutory engines (R3) · Add support, evidence versioning, Excel publish
(R4) · submit / return / approve / sign-off (R5) · 12-month audit roll-forward and audit package
(R6) · Excel add-in (R7) · specialised reconciliation methods (R8). AI and Data Room integration
are not in R1 either.

**Verified:** 62/62 views render · 228/228 definition × tab combinations render with content ·
console clean on a fresh load · 10/10 chrome themes AA · content text gate clean (new elements
4.81–14.12 light, 5.56–13.53 dark) · spacing ratchet unchanged at 1072/88 · dark mode holds in
both densities · the roll-forward is exact for all 38 instances · the four CIP groups foot to CIP
on every column · Recon TB = Financials = Trending = Flux current = 4,210.2 and Recon beginning =
Financials May = 3,942.0 · zero TB or beginning mismatches across all 35 reconciled lines · the
period survives a module round-trip and the register re-resolves for Jun / May / Apr.

## 2026-09-02 — RECONCILIATIONS R2: the accounting proof under the roll-forward

R1 built the object model and the Control Center. R2 is the layer that makes a reconciliation
DEFENSIBLE rather than merely stated:

```
reconciliation group -> source GL accounts -> current-period GL activity
                     -> transactions / journals / invoices -> ERP source
```

**THE PROOF IS ARITHMETIC, NOT ASSERTION.** Every level foots into the one above by
construction. Measured on the reference model, Electrical CIP at Jun 2026:

| | |
|---|---|
| 237 transactions | debit 96.697 − credit 2.897 = **net 93.800** |
| 4 source accounts | activity 36.083 + 29.271 + 20.437 + 8.009 = **93.800** |
| the group | beginning 1,454.6 + activity 93.8 + other 5.2 = ending 1,553.6 = **TB 1,553.6** |

`populationDifference` prints an em dash because it IS nothing, not because it rounds to
nothing.

### NO TRANSACTION MATCHING, AND NONE MUST BE ADDED

Nothing in this module is Matched / Unmatched / Checked, and no line is manually certified.
Activity lines are SOURCE FACTS a preparer inspects for composition, materiality and
exceptions. Transaction matching is a different reconciliation METHOD and belongs to R8.
**Material activity is a LENS, not a classification** — filtering to it helps work a large
population and records nothing about what was looked at.

### THE POPULATION HAS DEPTH BECAUSE THE MAPPING DOES

R1's groups resolved one or two modelled accounts each, which proves an architecture and
cannot prove an account-level tie-out. Eleven source accounts and fifteen mappings were added
**to the governed spine**, not to this page — that is the whole point of the R1 ruling that a
population is whatever the mapping resolves. Purely additive: no existing account, mapping or
version changed, so Account Mapping, Financials, Trending and Flux read exactly what they read
before, and `SRC_TOTAL` / `SRC_UNMAPPED` are untouched because these are modelled samples OF
the estate.

Electrical CIP now resolves 4 accounts, Mechanical 4, Generators 2, Cooling/Other 8,
Accruals 2.

**ACCOUNT NUMBER IS NOT IDENTITY, and the tie-out demonstrates it.** Electrical CIP holds two
accounts numbered **15010** — `CIP - Electrical` in NetSuite US Development and
`Property Electrical Works` in the JD Edwards legacy book. `sacct()` keys on instance + chart +
code, so they cannot be merged by number, and the row states its ERP, instance and chart of
accounts beneath the name.

### THE SOURCE ACCOUNT ROLL-UP

Beginning, other and trial balance are each account's share of the group's, with the LAST
account taking the remainder — the same plug the groups use under their financial line, and for
the same reason. Shares derive from the account's own modelled balance, a real attribute rather
than a weight invented here.

**ACTIVITY IS THEN THE ACCOUNT'S OWN RESIDUAL, and the account named by `varianceOn` carries
the group's stated variance.** That is what makes an account-level difference roll INTO the
group difference instead of sitting beside it — Accrued Expenses is out by (6.4) and the
tie-out says immediately that it is `21100 Accrued Capital Costs`, not `21000`:

```
21000  Accrued Expenses - Operating   243.3  +2.1   —   245.4   245.4     —    Tied
21100  Accrued Capital Costs          147.3  (5.1)  —   142.2   148.6   (6.4)  Difference
Total  Accrued Expenses · 2 accounts  390.7  (3.1)  —   387.6   394.0   (6.4)  Difference
```

That is §54's reviewer story working: open an untied reconciliation, see which GL account is
out, drill to its journals.

### POSTING PERIOD IS THE FILTER; TRANSACTION DATE IS METADATA

A June reconciliation contains everything POSTED to June — including an invoice dated May 29 —
and excludes a July-posted item dated Jun 30. Both dates are on every transaction.

**AND THE BOUNDARY IS PROVED RATHER THAN ASSERTED.** An excluded transaction is invisible by
definition, so `rcBoundary()` generates the NEXT period's population and filters it for items
dated in THIS one. Those are exactly the rows a reader would otherwise have to take on trust.
Nothing is stored; both sets come from the same deterministic generator. On Electrical CIP:
*45 dated before Jun 2026 are included because they were posted to it ($15.6M); 54 dated in Jun
2026 are excluded because they were posted to Jul 2026.* Verified: **0** transactions in the
June population carry a posting period other than June.

### THE TRANSACTION MODEL

Deterministic from (sourceAccountId, period) — a reload, a re-render and an export produce
byte-identical rows, which is what lets an export reconcile to the screen. Weights are scaled so
the population sums EXACTLY to the target and the last row absorbs the rounding; ~15% carry the
opposite sign, so a net activity figure is a real net rather than a column of debits.

Every §10 field is carried: source transaction id · posting date and period · transaction date
and period · source account id, GL number and name · canonical account · journal number and
line · invoice and document number · memo and description · entity id and name · project ·
vendor · debit / credit / net · the three currencies and their three amounts · ERP platform,
instance id and name · source reference and, where one exists, a source URL.

**THE CANONICAL ACCOUNT IS A PROPERTY OF THE MAPPING, NOT OF THE SOURCE ACCOUNT.**
`SRC_ACCOUNTS` carries no `canon` — `rcPopulation()` adds it when the mapping resolves — so the
generator reading it off the account row got `undefined` and the trace printed an em dash. It
resolves through `mapResolve()` now. Worth remembering: an account row and a POPULATION row are
different objects.

**A DEEP LINK EXISTS ONLY WHERE THE INSTANCE PUBLISHES ONE.** Two of the seven ERP instances do;
the rest state *"Source reference available"* and offer no button. Measured: 97 of 97 NetSuite
transactions carry a URL, **0 of the JD Edwards ones do**. Nothing fabricates a URL.

### THE ACTIVITY DETAIL CANVAS

`View activity` **replaces the Control Center on the main canvas** — not a modal, and not a
twenty-column grid squeezed into the 420px dock. Period, scope, reporting lens and the selected
reconciliation are all inherited; nothing is passed and nothing is re-chosen; the return strip
goes back to the reconciliation that was open, with its Activity tab selected.

Four tabs over one population: **Accounts** (the tie-out, rows expand into their transactions) ·
**Transactions** (the whole population, one search, compact filters, sticky head, frozen
identifier, 50 a page) · **Composition** · **Population** (source-account membership and the
mapping rule that put each account there).

**ONE POPULATION, ONE ID.** The narrow summary, this canvas, the grid, every download and the
Trace all resolve the same `activityPopulationId`. There is no second query with its own total
anywhere in the module, and `rcActivityPopulation()` now COUNTS its transactions off the
population rather than deriving a size from a hash — which is what R1 declared the object for.

**The control total is the point of the header** (§18): a transaction count without its total
proves nothing, so debit, credit, net, the reconciliation activity and the population difference
are printed together.

**The tie bar is sticky** — beginning, activity, other, calculated ending, trial balance,
difference, above whatever transaction the reader has drilled to.

### EXCEPTIONS ARE STATED WITH THEIR AMOUNT, THEIR CAUSE AND THEIR ROUTE

- **UNMAPPED ACTIVITY.** `78410 Commissioning Services` is unmapped at June and a DRAFT rule in
  mapping v2026.07.1 places it in CIP from July — which is `MV-2026-07-1`'s own recorded note
  ("commissioning costs"), not an invention. So 48 transactions totalling +$1.2M sit in the
  ledger and in no reconciliation population. It is disclosed with its amount and a route to
  Account Mapping, and **it makes the tie status Incomplete**.

  **This changed the CIP reference model from Tied to Incomplete, deliberately.** §22 is
  explicit that unmapped activity can do so "even if the numerical ending happens to equal the
  TB", and it does: CIP's arithmetic still ties (difference —, TB 4,210.2, identical to
  Financials), and its POPULATION is not complete. Hiding that to keep the flagship line green
  would be the one failure a reconciliation engine must not commit. Readiness went 35 tied → 34
  tied, 1 incomplete → 2.

- **CONTESTED POPULATION, now defined.** Two live mapping rules disagree about `471100
  Electrical Installation` and neither was filed as an override, so it sits in Mechanical while
  Electrical has a live claim on it — $16.5M of movement. The balance is **not missing**, which
  is why this is not an incomplete population and does not change the tie; what moves when the
  conflict is resolved is the SPLIT between two groups, and both sides are told.

- **SOURCE CHANGED** (§21, §45). `sourceGLVersion` is the snapshot the population was generated
  against; when the live GL version has moved past it the population reads **Changed** and says
  so instead of quietly serving stale activity. `rcRefreshPopulation()` re-stamps it and bumps
  `populationVersion` — a real action with a real effect, not a button that reports success.
  Verified: `changed → refresh → current`.

### THE REPORTING ADJUSTMENT IS NOT GL ACTIVITY

It is a governed Korvyn overlay with its own basis, scope and approval. It is **not posted to
the ERP**, **not in the transaction population**, and is never given a source journal number
because it does not have one. It renders as its own band beside the population — component
type, amount, source, *In the GL population: No* — over the governed adjustment itself
(`RA-2026-06-001`, read from `fsAdjForLine()`; there is no second adjustment store) with a route
to it. Verified: 0 transactions of an adjustment type in any population.

### DOWNLOAD, MANIFEST AND VALIDATION

One column set (**34 columns**, every one §30 asks for), one row builder, two encodings. The
Excel file is a real workbook Excel opens natively — an HTML-table workbook with the Excel mime
and the manifest as its first block — which keeps the page self-contained: no library, no CDN,
no build step.

**EVERY EXPORT IS VALIDATED BEFORE IT IS WRITTEN.** The sum of the exported reporting amounts is
compared against the population amount and a mismatch **refuses** rather than quietly
succeeding. Negative-tested by forcing a difference: no blob was created, and the manifest
recorded `valid:false` with the difference. An export that does not reconcile to the screen is
the one failure this feature exists to prevent.

Three scopes, all validated: whole population (237 rows / $93.8M), one source account (63 rows /
$20.437M, every row that account), and the same in either format. The manifest — export id,
instance, population, period, scope, lens, component, counts, amounts, difference, validation,
mapping and GL versions, data as of, by and at — is shown in an **Exports this session** block
beside the population it describes rather than in an export-management module.

### TRACE, EXTENDED

- **Population** (§35): the reconciliation Trace now steps GL Activity component → activity
  population (count, amount, population version, mapping version, data as of) → journals and
  invoices → ERP, and the population step opens the Activity canvas.
- **Source account** (§36): identity, why the number alone is not identity, chart, ERP, entity
  reach, mapping, the account's own tie-out, and the chain group → line → canonical → account →
  activity → ERP.
- **Transaction** (§37): ERP transaction → source account → canonical → reconciliation group →
  roll-forward component → reconciliation → financial line, then the four surfaces that read
  that line — Financials, Trending, Flux, this reconciliation — which is real shared lineage
  (`fsAmount(financialLineId)`), not a claim.

### A CLASS NAME COLLISION ATE THE CONTROL CENTER'S OWN CONTROL ROW

Reported by the owner: *"I see some hidden selections."* Correct, and worth recording because
nothing failed loudly.

`.rcx-bar` was already R1's statement-picker row (`class="fsx-bar rcx-bar"`) when R2 declared it
again as the Composition tab's 6px share bar:

```css
.rcx-bar{display:block;height:6px;background:var(--n-100);overflow:hidden}
```

A single-class selector later in the sheet wins, so the header row collapsed from 53px to 21px
with `overflow:hidden` — which **hid the Reporting-lens field and the readiness count entirely**,
cut the Balance Sheet / Income Statement tabs in half, and let `.fsx-pick` overflow underneath
the quick-view row. No console error, no layout jump, no gate failure: the three gates check
contrast, chrome themes and the spacing scale, and none of them looks at whether an element
clips its own children.

Renamed to **`.rcx-sharebar`**, which is what it is. **A prefix is not a namespace — check the
name before you declare it.**

**A CLIPPING SWEEP IS NOW PART OF THE CHECK for this module**, because a static gate cannot see
this: walk every element on the surface and flag any that clips its own content without
`overflow:auto` or `text-overflow:ellipsis`. It found the collision immediately and one genuine
second case — the Population tab's ERP cell cut "JD Edwards Legacy North America" mid-glyph
(193px of content in a 167px cell) because `.rcx-tbl td` is nowrap and the base table rule clips.
`.rcx-acctsrc` ellipsises now and the cell carries the full text in its title. Verified: **0
clipped elements** across the Control Center and all four Activity tabs on three reconciliations.

### A CONTROL THAT REFUSES MUST SAY WHY, ON THE CONTROL

Reported by the owner: *"reporting lens for different reporting group is not clickable."*

The refusal is correct and stays. A lens restates the population under a different **basis,
currency AND hierarchy** at once, so selecting EMEA has to re-express every figure in EUR under
IFRS — R3's FX bridge and consolidation engine. Dividing by a rate to make the control feel
alive would break the invariant the whole module rests on: that a reconciliation and the
statement read the same governed amount. **Do not make these selectable before the engine
exists.**

What was wrong was the PRESENTATION, and it was the same fault as the R1 phase buttons: the
reason lived in a `title`, which is hover-only, so the row read as a control that silently
refused. Three fixes:

- the reason is **on the row**, in words, not in a tooltip;
- the row drops the tick gutter (it can never be ticked) and carries `aria-disabled="true"`
  instead of being announced as a radio option a reader could pick;
- a footer note says what a lens IS and that R3 makes the rest selectable, so the menu explains
  itself rather than leaving three dead rows.

**A REASON ON A MENU ROW IS A CLAUSE, NOT A PARAGRAPH.** The first cut used the full sentences
and added the hierarchy to each subtitle; rows went to 96px, `.pop-l` hit its 262px cap and
scrolled, and the fourth lens fell below the fold — a menu hiding an option in order to explain
why another one is unavailable. Short clause, currency and basis only in the subtitle, and the
argument in the footer: rows 28/57/73/73, no scroll in either axis.

Two defects found while checking, both fixed:

- **`setRcLens()` did not close its menu.** Every other single-select in the module calls
  `KFX.popClose()`; this one re-rendered and left the menu hanging open over the statement,
  re-anchored by `popRebind()`. The app's own 2026-08-31 ruling is that a single-select commits
  on click and closes.
- **`.pop-l` scrolled sideways.** Only `overflow-y` was declared, so `overflow-x` computes to
  `auto` and the vertical scrollbar's own 17px produced a horizontal one under it. A menu list
  never scrolls sideways — `overflow-x:hidden`.

### PERFORMANCE

The grid **pages** (50 a row) rather than rendering the population; the footer totals are the
whole filtered set, not the page. `rcTxPool`, `rcAcctRows`, `rcDefForSrc` and
`rcUnmappedActivity` are memoised per (key, period, lens) — the last one because
`reconReadiness()` resolves 38 instances a render and the unmapped scan walks every source
account through `mapResolve()`. Measured: **91ms** to render the Control Center with all 38
instances resolved.

### WHAT R2 DELIBERATELY DID NOT BUILD

R3 FX bridge / dual-currency reconciliation / eliminations / statutory · R4 support upload and
versioning · R5 submit / return / approve · R6 audit package · R7 Excel add-in · R8 transaction
matching. The three placeholder actions R1 left now **state their phase visibly** (`R4`, `R5`)
rather than hiding the reason in a tooltip.

**Legacy to retire later:** `glTxns()` / `GL_ACT` — the Account Activity browser — is built on
the LEGACY `COA` account codes, carries none of §10's fields and cannot be filtered by
`sourceAccountId` or `activityPopulationId`. §38 asks for one transaction browser; the honest
position is that there are two until `glact` is re-pointed at the governed model, and that is
its own pass rather than a side effect of this one.

**Verified:** 62/62 views · 152/152 definition × activity-tab combinations · all 18 acceptance
tests pass · console clean on a fresh load · 10/10 chrome themes AA · content text gate clean
(new elements 4.81–14.12 light, 7.19+ dark) · spacing ratchet unchanged at 1072/88 · dark mode
holds · accounts foot to the group on every column · the population's net equals the GL Activity
component exactly · exports reconcile and a forced mismatch refuses · 0 out-of-period
transactions in a period population.

## 2026-09-03 — RECONCILIATIONS R2.1: the beginning balance is what the prior period reported

A surgical pass over R1/R2, not a redesign: the page shell, the visual family, the dense table, the
docked workspace, the Activity Detail layout and its four tabs are unchanged. What changed is
accounting integrity, and then the clarity around it.

### THE BEGINNING BALANCE IS AS REPORTED — this was a misstatement, not a refinement

R2 allocated the prior period's line balance across the CURRENT groups by their declared shares, and
allocated each group's beginning across the CURRENT accounts. Both silently recast May under June's
rules. What that produced was not a rounding artifact:

> Mapping v2026.06.4 split the US and German capex accounts out of the generic CIP bucket. In MAY,
> **Mechanical CIP had no accounts at all** and Electrical CIP had one. June nonetheless reported a
> **$993.4M May beginning for Mechanical** — and because activity is the residual, booked the whole
> reclassification as **June operating activity**.

The bridge is explicit now, and every level foots:

```
beginning          the prior period's balance of the accounts THIS GROUP HELD THEN
+ classification   the opening balance of accounts that joined the group less those that left,
  change           valued at the prior period end — membership moving, not money
+ GL activity      what the ledger actually posted in the period
+ adj./other       the governed reporting overlay
= ending           = trial balance
```

| Jun 2026 | beginning | + activity | + classification | + adj. | = ending / TB |
|---|---|---|---|---|---|
| Electrical CIP | 57.2 | 30.9 | **+612.5** | 5.2 | 705.8 |
| Mechanical CIP | **0** | 32.7 | **+671.8** | 3.6 | 708.1 |
| Generators | 349.0 | 16.5 | 0 | 2.3 | 367.8 |
| Cooling / Other | 3,535.8 | 173.9 | **−1,284.3** | 3.1 | 2,428.4 |
| **CIP line** | **3,942.0** | 254.0 | **0** | 14.2 | **4,210.2** |

**THE PIECES FOOT BOTH WAYS.** `rcAcctBalance()` gives an account its share of its FINANCIAL LINE's
governed balance at a period, with the last account taking the remainder — so accounts sum to the
line exactly, and a move between two groups on one line contributes +x to one and −x to the other
and **nets to nothing at line level**. Financials, Trending and Flux are untouched, and every
reconciled line still ties to the statement at both ends in Jun, May and Apr.

**THIS IS NOT A HISTORICAL RECAST ENGINE and must not become one.** It resolves the prior period
with the prior period's mapping and states the difference. Restating history under today's rules is
a separate governed act, and R2.1 does not perform it.

**A line Korvyn models no source accounts for falls back to the declared share** — goodwill and
transformers have no population to compare and must not be given a fabricated one.

**`CLASSIFICATION_CHANGE` is a first-class component** (source `ACCOUNT_MAPPING`), carrying the prior
and current mapping versions and the affected source account ids. It is emitted only when membership
actually moved.

**THE TIE-OUT CARRIES THE ACCOUNTS THAT LEFT.** A row for an account held at the prior period end and
gone now opens with its as-reported balance, has the classification column take it straight back out,
and ends at nothing. Without those rows the accounts would sum to less than the beginning they are
supposed to explain.

**MoM MEASURES MOVEMENT, NOT RECLASSIFICATION.** With the bridge in place Electrical opened at 57.2
and closed at 705.8, so the old MoM read **1,134%** — a number describing a mapping version. The base
is restated for the classification change, as a comparative always is, and the four CIP groups become
comparable again: 5.4 / 5.4 / 5.4 / 7.9 against the line's 6.8.

### DATES, EVERYWHERE A BALANCE IS NAMED

`BEG` and `END` said nothing about WHICH balances. Two-line headers now, derived from the selected
period and nothing hard-coded — choose Jul 2026 and they read Jun 30 / Jul / Jul 31 on their own:

```
BEGINNING   ACTIVITY   ADJ./OTHER   ENDING    TB        DIFF   MOM
May 31      Jun                     Jun 30    Jun 30
```

The same clarity in the docked roll-forward (*Beginning balance · May 31, 2026 · as reported*,
*Jun 2026 GL activity*, *Calculated ending balance · Jun 30, 2026*), in the Summary figures, and in
the Activity Detail tie bar.

### "OTHER" NAMES ITSELF

`ADJ./OTHER` in the compact parent tables; in the detailed roll-forward the actual component —
**Reporting adjustment**, **Classification change** — because the system can now distinguish them and
hiding a known component behind "Other" is a choice to say less than is known. FX translation, ERP
remeasurement and eliminations stay declared for R3 and deliberately outside "Other".

### THE REPORTING LENS

Restrained metadata, not roadmap prose: a compact `Coming in R3` tag beside the name, currency and
basis on the right, no tick gutter on a row that can never be ticked, `aria-disabled`, and the
argument removed from the menu entirely — it lives in the code and this record. The first cut put
whole sentences on each row; rows went to 96px, the list hit its cap and scrolled the fourth lens out
of sight, which is a menu hiding an option in order to explain why another is unavailable.

### WORDING, IN AN ACCOUNTANT'S REGISTER

*"Held by the narrower rule; a rival rule at the same precedence claims it"* is precedence mechanics,
and precedence is not what a reviewer needs while reading a balance. Now:

> **Population conflict · $182.5M**
> GL 471100 · Electrical Installation is currently included in Mechanical CIP but is also claimed by
> another active mapping rule.
> Total Construction in Progress is unaffected, but the allocation between the groups may change when
> the mapping conflict is resolved. **Review population →**

The mechanics stay one click away in Population and Trace. The CONTESTED badge explains itself on
hover (*Competing mapping rule*). Population statuses are one word — In population · Contested ·
Pending mapping · Claimed · Unmapped — with the explanation in the cell's title, not inside it.
`Final` reads **Overall** (display only; `finalStatus` is unchanged).

### USABILITY

- **Identity survives a horizontal scroll.** GL # and GL name freeze on the tie-out and the
  population; posting date, GL # and GL name on the transaction grid. Far enough to keep identity,
  near enough to leave usable width.
- **The Accounts tab is `GL account tie-out`**, with a caption stating what it foots to.
- Transactions lead with the identity and document columns and put transaction date, document #,
  line #, debit/credit and the functional amounts behind **More columns**. The full model is preserved.
- The search placeholder **fits** — it was truncating itself at 150px.
- The Activity Detail header leads with the group, the period, the amount and the counts;
  reconciliation, population, population version, source GL version, mapping and hierarchy versions,
  lens and scope fold into **View provenance**.

### THE REPORTING ADJUSTMENT EXAMPLE WAS INCOHERENT

`RA-2026-06-001` was `basis:'management'` and read *"not capitalised under US GAAP"* — while being
APPROVED, therefore moving the reported figure, on a page presenting Corporate Consolidated / US
GAAP. **A US GAAP statement cannot include an amount its own note says US GAAP excludes.** It is a US
GAAP presentation overlay now: *"Approved reclassification of commissioning-related project costs to
Construction in Progress, pending the ERP reclass entry."* — the treatment is right, the ERP has not
caught up, and the overlay still says plainly that no journal exists behind it. Display only; no
figure moved.

### PROTOTYPE ACTIONS DO NOT SPEAK OUR ROADMAP

`R4` / `R5` were our vocabulary, not the product's. The disabled controls name the PHASE OF THE
PRODUCT — *Support & Evidence phase*, *Review & Sign-off phase* — and remain unpressable. Nothing may
imply evidence was attached or an approval happened.

**Verified:** 62/62 views · 152/152 definition × activity-tab combinations · console clean · 10/10
chrome themes AA · content text gate clean · spacing ratchet unchanged at 1072/88 · 0 clipped
elements · every reconciled line ties to Financials at both ends across Jun/May/Apr · every
instance's roll-forward exact · accounts foot to their group on every column · exports still validate
· no transaction-matching workflow introduced · no theme, shell or layout redesign · R3 not started.

## 2026-09-03 — RECONCILIATIONS R3: reporting lenses, FX and consolidation bridges

**THERE IS STILL ONE LEDGER.** No IFRS ledger, no statutory ledger, no tax ledger, no currency
ledger. Every lens reads the same source facts; what differs is the governed, versioned
interpretation stacked above them:

```
ERP GL / TB -> functional-currency facts -> accounting basis -> FX translation
            -> consolidation / eliminations -> reporting adjustments -> lens balance
```

### THE PRESENTATION AMOUNT IS THE ANCHOR; THE FUNCTIONAL AMOUNT IS DERIVED FROM IT

A modelling choice, and the one that keeps cross-surface consistency true. Under the corporate
lens every factor in `rcLensLine()` is 1 or 0 and the result is `fsAmount().reported` byte for
byte — so a reconciliation and Financials cannot drift. Functional = presentation ÷ period-end
rate is exact and invertible; nothing is fabricated in either direction.

**The US GAAP lens starts from the REPORTED figure; every other basis starts from the LEDGER.**
`fsAmount().reported` is source TB plus the approved US GAAP presentation overlays, so under IFRS
or local GAAP those overlays are not in force: the base is `sourceTB` with that basis's own
adjustments instead. Otherwise an IFRS balance would silently carry a US GAAP presentation
decision.

### THE TRANSLATION EFFECT IS A PLUG, AND IT IS THE RIGHT ONE

```
functional movement           Fmove = Fclose − Fopen
that movement at the average  Pmove = Fmove × rateAvg
translation effect            FX    = (Pclose − Popen) − Pmove
```

The standard CTA derivation. Exactly zero when the rates do not move or the entity already
reports in the presentation currency — which is why **Germany Statutory shows no FX at all**
(a EUR lens over a EUR-functional filing entity translates nothing) and **US Tax shows none**.
That is the architecture working, not an omission.

### THREE FX CATEGORIES, AND THEY CANNOT DOUBLE-COUNT

| | |
|---|---|
| **ERP-posted remeasurement** | a real `FXR` journal with a real JE number, inside GL activity, drillable to the transaction. Classified out for visibility — *"of which ERP remeasurement · 7 posted journals · included in GL activity above"* — never added again |
| **Reporting translation / CTA** | derived from balances and rates. **No journal number is invented.** Its own drill shows the calculation, the rate set, its source, version and approval |
| **Reporting-lens currency effect** | carried by the lens's own rate set and presentation currency, stamped into the fingerprint |

They are computed from different things — one from the transaction population, one from balances
and rates — so overlap is structurally impossible. Measured on Mechanical CIP: remeasurement
$1.507M (7 journals) against derived translation $1.446M (no journal).

### ELIMINATIONS ARE EMBEDDED, NOT ADDED — this was a real error caught in verification

The first cut subtracted eliminations from the lens balance, which put the corporate CIP
reconciliation **3.789 below Financials**. A consolidated statement is *already* net of group
eliminations; subtracting them again double-counts. The elimination is now carried as a
**disclosure of what the level contains**, and the roll-forward shows its **period movement**,
carved out of activity so a consolidation effect is never reported as operating movement. Same
treatment for basis adjustments where they are additive to the ledger base.

### A GROUP WITH NO ACCOUNTS IS NOTHING, NOT A SHARE — the second error caught

R2.1's fallback gave a group with no modelled accounts its declared share of the line. With
siblings using real account balances that share was **added on top**: Mechanical CIP contributed
993.4 at May for a group that held nothing, and CIP read 4,935.4 against a statement of 3,942.0.
**A declared share is only safe when every sibling uses one.** The fallback now applies only when
the LINE itself models no accounts; an account-modelled line gives an empty group zero.

### THE FOUR LENSES ARE OPERATIONAL

| Lens | Population | Basis | Currency | Eliminations | CIP Jun 2026 |
|---|---|---|---|---|---|
| Corporate Consolidated | 612 entities | US GAAP | USD | CRS-CORP-2026 | **4,210.2 USD** = Financials |
| EMEA Reporting Group | 206 EMEA entities | IFRS | EUR | CRS-EMEA-2026 | 1,316.1 EUR |
| Germany Statutory | 37 German filing entities | Local GAAP | EUR | **none — single filing population** | 232.9 EUR |
| US Tax Group | 248 US tax entities | Tax | USD | CRS-US-TAX | 1,693.2 USD |

Switching one changes the population, the basis, the presentation currency, the rate set, the
eliminations, every balance, the roll-forward and the trace. **The basis lives inside the lens**
so an impossible combination — IFRS under the US tax hierarchy — cannot be selected at all, and
there is no separate GAAP dropdown. A lens narrower than the scope chip says so on the page
rather than letting a reader assume the chip governs.

### THE ROLL-FORWARD CARRIES EVERY COMPONENT, EACH WITH A DRILL

Beginning · GL activity (*of which ERP remeasurement*) · Mapping / classification · FX
translation → **FX bridge** · Eliminations → **Consolidation trace** · Basis adjustment →
**Basis bridge** · Reporting adjustment → the governed adjustment · Calculated ending · Trial
balance · Difference. Labels are accountant-facing; the raw enums appear only in Trace and
provenance.

The **basis bridge** closes with the caveat that matters: the lenses cover different populations
and currencies as well as different bases, *"so these are not four measurements of one number —
they are four governed answers to four different questions over the same ledger."*

### FINGERPRINT AND TRACE

The fingerprint now pins `reportingLensId`, `reportingLensVersion`, `reportingBasis`,
`presentationCurrency`, `fxRateSetId`, `consolidationRuleSetVersion` and
`reportingAdjustmentSetVersion` alongside the R1/R2 versions — so a later policy or rate change
cannot silently rewrite a certified balance. Trace now opens at the lens (basis, jurisdiction,
version) → presentation currency and rate set → population and hierarchy → consolidation rules →
adjustment set → and only then the reconciliation objects.

### WHAT R3 DID NOT DO

No second ledger. No UI redesign — shell, Control Center, workspace, Activity Detail and its four
tabs, filter and dropdown behaviour all unchanged. R4 (evidence), R5 (sign-off), R6 (audit
package), R7 (Excel add-in) and R8 (specialised engines) are untouched. Rate drift is
representative and stated as such; this is not a treasury administration module.

**Verified:** 62/62 views · 608 lens × definition × activity-tab combinations · every
roll-forward foots in all four lenses · corporate reconciliation = Financials at both ends across
Jun/May/Apr/Mar · every derived drill renders under three lenses · exports still validate ·
console clean · 10/10 chrome themes AA · content text gate clean · spacing ratchet unchanged at
1072/88.

## 2026-09-03 — RECONCILIATIONS R3.1: currency integrity and traceability refinement

Not a redesign. The Control Center, the docked workspace, Activity Detail and its four tabs,
the table hierarchy, the filters and the lens control are all where R3 left them. What changed
is that the figures now say what currency they are in, the trace reads as accounting before it
reads as lineage, and nothing in provenance is blank.

### THE STALE "$" HAD ONE ROOT CAUSE, AND IT WAS NOT THE LENS

Under Germany Statutory the Summary printed `$3.2M · +$1.5M · $39.0M` over a footer that said
"In millions of EUR". The engine was right — `rcLensLine()` had translated every figure into
EUR — and the FORMATTER was `fsM()`, Financials' own, which prints "$" because Financials
presents the corporate lens. Sixty-four call sites in this module were calling a formatter that
had no idea a lens existed.

**`rcM()` is that formatter with the symbol resolved from the selected lens's presentation
currency** (`RC_CCY` · `ccySym()` · `ccyFmt()`), so switching the lens moves every figure on
the page without a template being touched. Pass a currency to state a specific one (a
transaction's own, an entity's functional); omit it and the lens governs. USD/EUR/GBP/CAD/
AUD/SGD/JPY carry a glyph; CHF and the Nordic currencies are written as their code, which is
what a treasury does. **`fsM()` is untouched and still Financials' formatter** — the two are
separate because they answer different questions.

The context line had the same disease one level up: `glCtx()` read
`ENTCTX.presentationCurrency`, which is the enterprise's, so EMEA read "USD · EMEA Reporting
Group · IFRS". It takes an optional currency now and Reconciliations passes the lens's.

### THE BLANK VERSIONS HAD ONE ROOT CAUSE TOO

`rcInstance()` reads `mappingVersion`, `hierarchyVersion`, `statementVersion` and `dataAsOf` off
`amounts.currentAmount`. R3 changed that object from `fsAmount()`'s to `rcLensLine()`'s and the
four fields were left behind — so every trace printed "v" and a blank, and the export manifest
stamped `undefined`. `rcLensLine()` now carries them; the hierarchy version is the LENS's (a
lens names its own hierarchy). Two callers also read `L.fxRateSetId`, which never existed (the
lens holds a prefix), and printed "rate set undefined" — `rcFxSetId(L,p)` is the one derivation.

**Data as of is an instant.** The feed reports "10 min ago", which is right for a health strip
and wrong for provenance: a snapshot statement has to survive being read next week.
`rcDataAsOf(p)` is the morning-after-close GL extract, derived from the period, stated as
representative. Financials still shows the relative feed time; that is outside this brief.

### CURRENCY · LOCAL IS GONE FROM THIS PAGE

The platform Basis tab's `Currency · USD | Local` field rendered on Reconciliations and did
nothing there — `sliceOk`-style, it moved no figure — while claiming a choice the lens had
already made. "Local" also has no meaning for a consolidated multi-currency population. `gfTabs()`
omits the Basis tab on `glrecon` only; every other page keeps it. Functional detail lives where
it can be honest: the entity drill (**By functional currency**) and the transaction grid, which
state each entity's and each transaction's own currency. Where functional equals presentation
the entity view prints "= reported" rather than the same EUR twice (§8).

### ADJ./OTHER OPENS

The one compact column can hold five governed components, and a reader who met "+617.7" had to
open Trace to learn it was a mapping bridge. The cell keeps its hover title and gains a click:
`rcAdjPeek()` anchors a small card under the cell — every component, the material ones with
their amount, the rest as a dash — and the route to the roll-forward. A financial-line cell sums
its groups component by component, which is how the CIP line correctly shows the classification
change netting to nothing while its groups show ±600M. **Deliberately not `pop()`**: a pop is an
option list that traps focus; this is a transient read, the discipline the Flux Explanation peek
follows. It closes on outside click, Escape, any scroll and every repaint.

### TRACE: TWO SECTIONS, THE ACCOUNTING FIRST

**How this balance is built** — opening balance → GL activity (of which ERP remeasurement,
included and not added again) → mapping / classification change → basis adjustment → FX
translation → consolidation / elimination → reporting adjustment → reported ending balance →
trial balance / Financials. One `.rcx-tn` node per component, and every material node opens the
surface that supports it. A component that does not apply says so in a clause — *"FX
translation · Not required · EUR → EUR"* — quieter than one carrying money, never as a block.

**Provenance** — lens (id, version), basis (jurisdiction), presentation currency, functional
currencies, population, hierarchy (version), mapping (version, state), statement definition
(version), FX rate set, consolidation rules (`N/A — single filing population` where there are
none), reporting adjustment set, reconciliation definition (version, effective), GL snapshot,
TB snapshot (now the lens's: `TB-2026-06-DE-STAT`), data as of, revision, fingerprint. **No
blank and no bare "v".**

The R1/R2 chain is kept whole under **Show technical lineage** — it was reordered, not removed.

### THE BASIS BRIDGE HOLDS THE CURRENCY STILL

Three things can differ between two lenses — basis, currency and population — and a bridge that
lets all three move at once is a number nobody can read. `rcBasisBody()` is now three tables:
this lens's bridge (source → adjustment → basis balance, in its own currency); **every basis
over this population in this currency**, so the only thing that moves down the column is the
basis; and the other lenses in their own currency AND translated into this one at the
period-end cross rate, in two columns, with the caveat that their populations differ. FX trace
and consolidation trace stay their own panes.

### A TRANSACTION BELONGS TO AN ENTITY THE LENS INCLUDES

Found from the EMEA composition frame: broken down by functional currency it read **USD and
CAD** — under a lens whose population is 206 EMEA entities. `rcTxPool()` drew a transaction's
entity from every entity that posts to the account, ignoring the lens, while
`rcEntityBalances()` had already narrowed to the lens population. The pool now applies the same
rule (the account's entities within the lens, else the lens's first entity), so Composition,
the transaction grid, the entity filter and the functional-currency list all describe the
population the balance was resolved over. Amounts are targets and did not move; exports still
validate; population difference is still nothing. The remeasurement rule was widened with it:
an FXR journal survives where the entity's functional currency differs from the presentation
currency **or the document was denominated in a third currency** (a EUR entity's USD invoice),
so a EUR-functional population under a EUR lens still shows the ERP remeasurement it really
posts rather than losing it with the foreign entities.

### A DRILL OPENED FROM THE DOCK NOW RENDERS

Pre-existing R3 gap found while wiring the trace routes: `rcDrillPane()` was mounted only by
Activity Detail, so the roll-forward's **FX bridge / Consolidation trace / Basis bridge** buttons
in the docked panel set `rcDrill` and drew nothing. The drill takes the panel's place while open
and Close returns to it.

### SMALLER, EACH REAL

- `rcN()` and `ccyFmt()` print an em dash for nothing and `<0.1` / `<€0.1M` for a figure that is
  real but below the display precision — never `($0.0M)` (§16).
- "Mapping / classification" reads **"Mapping / classification change"** in the roll-forward,
  the tie bar and the Adj./Other title (§14).
- The Activity tab and the Activity Detail provenance state presentation currency, functional
  currencies, basis and rate set (§22, §23). `functionalCurrency` on the instance is the actual
  list, not "multi-currency population".
- Composition's Activity column names its currency (§26). The export manifest carries
  `presentationCurrency` and `reportingBasis`.
- `reconAiContext()` returns the structured context §43 lists — lens, basis, currency,
  population, versions, rate set, rules, adjustment set, and the open instance with its
  fingerprint and amounts — and `cpContext()` renders its one line in the assistant:
  *"Looking at: Reconciliations · Jun 2026 · EUR · Germany Statutory · Local GAAP · Electrical
  CIP · REC-CIP-ELECTRICAL-2026-06"*. No AI surface was built.

### CROSS-SURFACE, STATED HONESTLY

Financials, Trending and Flux have no lens selector; they present the corporate lens (USD ·
US GAAP), and the corporate lens in Reconciliations resolves `fsAmount().reported` byte for byte,
so the four agree there. Under any other lens the Trace's last node says so — *"Financials
presents Corporate Consolidated · USD; this balance is that figure restated under the lens"* —
rather than letting **Open Financials** imply a EUR statement exists. Giving those pages a lens is
R3.5 and was not started.

**Verified:** 62/62 views render · console clean · 10/10 chrome themes AA · content text gate
clean · spacing ratchet unchanged at 1072/88 · all four lenses: 0 foreign symbols on the page or
in any dock tab, Activity Detail tab or drill · the switching cycle Corporate → EMEA → Germany →
US Tax → Corporate leaves no stale currency, basis, population, rate set, rule set or adjustment
set · the peek opens on click, suppresses the row click, closes on outside click and Escape · the
Basis tab is absent on `glrecon` and present elsewhere · 273 numeric grid cells, none reading
`0.0`.

## 2026-09-03 — context-preserving navigation: trace → inspect → return

Owner's brief: a link from Reconciliations to Financials, Flux, Account Mapping, Trending or
the adjustment must land on the governed object it names, never on a module's front door, and
the user must be able to come back to exactly the work they left — without relying on the
browser's Back and without an ERP-style breadcrumb chain.

### THE MODEL IS NAVIGATION STATE, NOT FINANCIAL STATE

`NAVCTX` (shell) holds one origin: `originSurface` · `originObjectId` · `originTab` ·
`originLabel` · `originContext` · `periodId` · `scopeId` · `reportingLensId` ·
`financialLineId` · `reconciliationGroupId` · `activityPopulationId` · `comparisonId` ·
`mappingVersion` · `sourceAccountId` · `scrollPosition` · and the origin's own `restore()`.
Nothing in it is a balance; every figure re-derives on return. `navGo(ctx, dest)` sets it and
runs the destination; `navReturn()` calls the origin's restore; `paintNavRet()` is painted by
the `renderAll` wrapper after every render, so the strip is on the destination and nowhere else.

**ONE HOP, BY DESIGN.** The context is dropped the moment the user is on any tab other than the
destination it was created for. A return strip that survives three pages of wandering is a
breadcrumb chain. The shell's history stack (the title-row chevron) is untouched and still
works beside it.

**THE STRIP IS ONE LINE** (`#navRet`, `.navret`): *← Back to Electrical CIP reconciliation ·
Jun 2026 · Germany Statutory · Trace*, and, when the lens is not corporate, the note that
Financials, Flux and Trending present Corporate Consolidated · USD — stated on the strip rather
than letting the destination imply a EUR statement exists.

### THE ORIGIN SNAPSHOTS ITS OWN UI AND NOTHING ELSE

`rcNavCtx()` (Reconciliations) is the one place the origin is described; `rcRestore()` the one
place it is reinstated: lens, selected row, dock tab, Activity Detail and its tab, quick view,
search, status and reviewer filters, expanded lines, open drill, folded lineage, activity
filters, expanded accounts, page scroll and dock scroll. The period and the enterprise scope are
the book's and the enterprise's: they are put back only if the user moved them while away, and
through their own writers (`setPeriod`, `ENTCTX.scope`).

**The dock animates in, and a scrollTop set during the entrance clamps to zero** (observed):
the restore re-applies the scroll on a short retry until it sticks.

### EVERY OUTBOUND LINK LANDS ON THE OBJECT

Nineteen call sites in the module went through `rcGo*`; the only `pickTab` calls left in it are
inside those functions and the restore.

| link | lands on |
|---|---|
| Open Financials · Financial line · Open the adjustment | `fsReveal(lineId)`: the right statement, every ancestor opened, the row selected and scrolled to; `adj` tab where asked |
| Open Flux | the Flux statement line the population's accounts roll into (`KFX.lineForAcct`), else the `RC_FS_FLUX` crosswalk — a NAVIGATION aid between two statement models with no shared id, not a second mapping; unifying them is R3.5. `comparisonId` is recorded from Flux's own grain/compare |
| Review mapping · Account mapping | the account open (`amapOpen`), or the group's rules on screen — searched by the canonical account its rule names, else its mapping group, else its financial line, because the mapping rows carry those and not the definition's name |
| Incomplete mapping banner | Account Mapping filtered to Unmapped |
| Trending | the line selected with its ancestors opened |
| Open the adjustment (band) | Data Enrichment on the adjustment |
| ERP sources | Sync, with the return |
| View activity | unchanged — it already resolves the exact `activityPopulationId` on this surface |

**Verified:** Financials arrives on FS-CIP with PP&E opened and the row selected, the strip
reads the origin and survives a tab change inside Financials; return restores lens, row, tab,
page scroll and dock scroll; Flux arrives on `recost` on the balance sheet with `m/seq` recorded;
Mapping arrives on the account or the group's rules; Trending arrives on FS-CIP; navigating to
an unrelated tab clears the context and hides the strip; 62/62 views render; console clean;
three gates green.

## 2026-09-04 — RECONCILIATIONS R3.2 → R5.7B: the objects R6 has to build on

Nine increments in one entry, at the density a later session needs rather than nine
retrospectives. The commit messages carry the full reasoning (`git log` from `30f60fd`
onward); this is the map, the invariants and the traps.

**READ THIS BEFORE STARTING R6 (Annual / Audit).** Every object an audit package needs
already exists. Rebuilding any of them is the failure mode this block is written to prevent.

### The governed objects, and which increment owns each

| Object | Owns | Where it lives |
|---|---|---|
| `ReconciliationDefinition` / `Instance` | R1 | `RECON_DEFS`, `rcInstance()` — instances DERIVE, never stored |
| `ActivityPopulation` + transactions | R2 | `rcPopulation`, `rcTxPool(srcId, period)` |
| `ReportingLens` | R3 | `REPORTING_LENSES`, `rcLensLine()` — all four built |
| `FinancialContext` / deep links | R3.2 | `NAVCTX`, `fcGo()` |
| `ReconciliationMethod` + `ReconciliationSource` | R3.5 | `RC_METHODS`, `rcMethodModel()`, `proofStatus` |
| `SupportRequirement` / `EvidenceObject` / `EvidenceVersion` / `EvidenceRelationship` | R4 | `RC_SUPPORT_REQS`, `EVIDENCE`, `EV_RELS`, `rcSupportGraph()` |
| `ReviewWorkflow` / `ReviewStage` / `ReviewSubmission` / `ReviewDecision` / `ReconciliationSignOff` | R5 | `RC_WORKFLOWS`, `RC_SUBS`, `RC_DECS`, `RC_SIGNOFFS`, `RC_EVENTS` |
| Chronology guard | R5.1 | `rcChronologyCheck()` — must stay at zero |
| Roles / scope / lens access / authority / mentions | R5.5–R5.6 | `KROLES`, `KSCOPES`, `KTEAMS`, `KAUTH`, `resolveEffectiveAccess()` |
| `ReconciliationAssignmentRule` / delegation | R5.7A | `RC_ASSIGN_RULES`, `KDELEGATIONS`, `rcResolveAssignment()` |
| `ReviewCheckpoint` / `ReviewDelta` | R5.7B | `RC_CHECKPOINTS`, `rcReviewDelta()`, `reconReviewSignals()` |

### The invariants — break any of these and the module stops being defensible

1. **ONE AMOUNT SERVICE.** Every figure resolves through `fsAmount()` / `rcLensLine()`. The
   corporate lens returns `fsAmount().reported` byte for byte, which is why Financials, Flux,
   Trending and Reconciliations agree. FS-CIP = **4,210.2** is the canary: if it moves,
   something has grown a second balance store.
2. **THREE FINGERPRINTS, THREE QUESTIONS.** `reconciliationFingerprint` = what the BALANCE was
   resolved from (this is what re-review compares). `packageFingerprint` = what the REVIEWER
   SAW, including pinned evidence versions. The R4 EVIDENCE fingerprint uses different key
   names again (`glSnapshotId` vs `sourceGLSnapshotId`) — comparing one with the other's
   vocabulary silently finds no drift, which shipped once. `rcFpHash()` is the only hasher.
3. **IMMUTABLE MEANS FROZEN.** Submissions, sign-offs and checkpoints are `Object.freeze`d and
   never edited. A correction is a NEW version / cycle / checkpoint.
4. **ONE INSTANT PER EVENT.** `rcEventAt()` clamps every audit event to the one before it. Two
   independently generated timestamps for one event is the Land defect (a certification dated
   before its own approvals).
5. **PERMISSION ≠ AUTHORITY ≠ INDEPENDENCE.** `kCanApprove()` is all three, in that order, and
   permission never absorbs SoD. Every check takes the actor and the object; no module reads a
   role name.
6. **ASSIGNMENT CANNOT GRANT PERMISSION** and **DELEGATION CANNOT EXCEED THE DELEGATOR.** Both
   surface as findings rather than silent upgrades.
7. **A MENTION IS NOT AN ASSIGNMENT.** Different objects, different actions, only one gated on
   `ASSIGN_WORK`.
8. **NO SOURCE FREEZE.** Only submission and certification pin snapshots. Pre-close checkpoints
   are made against a moving target on purpose and are NOT the formal package.
9. **AI CONTEXT IS ASSEMBLED AFTER ACCESS RESOLUTION** (`kAiContext()`), never redacted after.

### What R6 already has, and must not rebuild

An audit package is an assembly of objects that exist:

- the certified `ReconciliationSignOff` and the `ReviewSubmission` it cites;
- every `ReviewDecision` on that submission, with the reviewer who actually acted and
  `actingUnderDelegationId` where a delegation was used;
- the pinned `supportEvidenceVersionIds` and their `EvidenceRelationship`s;
- the `ReviewCheckpoint` history — what was looked at before submission, and by whom;
- `rcAssignTrace()` (why this person owned it) and `rcReviewTrace()` (who decided what);
- the append-only `RC_EVENTS` trail.

`VIEW_AUDIT_PACKAGE` is already a permission; `EXTERNAL_AUDITOR` already resolves to certified
work only (18 of 38 instances) and `XP-AUDIT` already opens on the Certified quick view.
**R6 is a reading of these, plus retention and export — not a new record.**

### Traps that have each cost a round

- **`ME` and `caps()` live in the flux closure.** In the shell, `ME` is a two-letter initials
  CONSTANT, so `ME()` fails at run time, not parse time. Shell scope uses `rcMe()`/`rcCaps()`;
  the access layer's actor is `kActor()`, which reads `USER_NAME` — never `cwMe()`, which reads
  a rendered DOM element and silently answers for the wrong person.
- **`pickTab` will not object to a tab the current lens does not declare.** It falls through to
  the lens's first tab. Settings is `pickLens('admin'); pickTab('admin')`.
- **A prefix is not a namespace.** `.rcx-bar` was declared twice and a single-class selector
  later in the sheet ate the Control Center's own header row. Grep the name before declaring it.
- **A splice script that fails mid-way loses every earlier edit** — the write is at the end.
  This has bitten four times.
- **Never pass replacement text through the shell**; write it to a file and splice from the file.
- **`sed -i` rewrites the whole file's line endings.** The working tree is CRLF; restore it with
  node if a shell tool flattens it.
- Verification runs on the python server in `.claude/launch.json` (`preview_start {name:'main'}`),
  not `file://`.

### The standing verification set

62/62 views · 912 lens × definition × tab combinations · `rcChronologyCheck()` = 0 ·
0 console errors · 0 clipped elements · the three gates · FS-CIP = 4,210.2.

### Deliberately deferred

R6 annual/audit and the post-certification amendment workflow · R7 Excel add-in · transaction
matching, depreciation and amortization engines · SSO/SCIM/DLP/impersonation · a security-event
console · AI surfaces of any kind (the data is structured; nothing is generated).

## 2026-09-04 — RECONCILIATIONS R6: multi-period, quarterly, annual, audit and certified history

**READ THE R3.2 → R5.7B BLOCK ABOVE FIRST.** R6 rebuilt nothing in it. What it adds is the layer
that turns one governed reconciliation reviewed in one period into a financial control HISTORY.

```
ONE persistent ReconciliationDefinition
+ MANY period instances, DERIVED, never stored
+ a governed CERTIFICATION FREQUENCY   policy: how often a conclusion is required
+ a user-chosen VIEW HORIZON           analysis: how much history is on screen
= IMMUTABLE certified history
```

**FREQUENCY AND HORIZON ARE NOT THE SAME THING, and conflating them is the bug this increment
exists to avoid.** A monthly reconciliation may be read year-to-date; a quarterly one still shows
its months; a goodwill reconciliation certified once a year still consumes twelve months of
governed history. **A VIEW HORIZON NEVER CREATES A FINANCIAL TRUTH** — `rcHorizonPeriods()`
returns period keys, `rcMultiPeriod()` resolves each one through `rcAmounts()`, and the totals
are sums of those. **There is no quarterly or annual balance store and there must not be one.**

### The objects R6 adds

| Object | Where |
|---|---|
| CertificationPolicy / frequency | `RC_CERT_FREQ` · `RC_CERT_POLICY` · `rcFreqOf` · `rcCertRequiredAt` |
| ViewHorizon | `RC_HORIZONS` · `rcHorizon` / `rcHzAnchor` · `rcHorizonPeriods` |
| PeriodBridge | `rcPeriodBridge` — one month as a bridge row, cached |
| MultiPeriodRollforward | `rcMultiPeriod` — the quarter / year workpaper |
| Activity matrix | `rcActivityMatrix` · `rcActivityByType` · `RC_ACT_TAXONOMY` |
| CertifiedReconciliationVersion | `rcCertOf` / `rcCertBuild` → `RC_CERT_STORE` (frozen) |
| Amendment versions | `RC_CERT_AMEND` · `rcAmendCertify` · `rcVersionBridge` |
| CertificationInstance | `RC_CERT_INSTANCES` · `rcCertifyHorizon` · `rcCertReadiness` |
| PostCloseChange | `RC_POSTCLOSE` · `rcPostClosePost` · `fsPostCloseDelta` |
| Evidence coverage | `rcEvidenceCoverage` — references, never copies |
| AuditPackage + Manifest | `RC_PACKAGES` · `rcPackageBuild` · `rcPackageExport` |

### THE GOVERNED SPINE WAS RE-DATED, AND THAT IS THE ENABLING CHANGE

There was no reconciliation history to roll forward: the opening mapping set was effective
**2026-01**, so `rcLineAccts()` resolved nothing before it, every group's opening balance for any
2025 period was zero, and an annual roll-forward could not exist. `MV-2026-01-1` is now
**`MV-2024-01-1` / `2024.01.1`, effective `2024-01`**, and the thirty rules it governs moved with
it; `RC_DEF_BASE`, the support requirements, the six review workflows and the assignment rules are
effective from the same month. **Nothing about the June 2026 split changed** — `MV-2026-06-4`
still introduces the German capex split and `mapVersionFor()` still returns it from June onward.
An opening mapping set dated the month the prototype's calendar happens to start was an artifact,
not an accounting fact. `2026.01.1` no longer exists as a version label.

**What that unlocks:** FY2025 is a COMPLETE governed year — opening $43.573M at Dec 31 2024,
twelve months, 12/12 certified, ending $47.662M = TB, difference nil, continuity unbroken. FY2026
is in progress: Jan–Jun governed, **Jul–Dec render as "not yet opened" and carry no figures**,
because a period after `BOOK.open` has not happened and `fsPeriodFactor()` is a statement about
the months it covers, not a growth law. Extrapolating them would have been the easy lie.

### AS-REPORTED IS THE DEFAULT AND THE CONTROL

Each period resolves under ITS OWN mapping version — `rcAmounts()` has done this since R2.1 — so
a December mapping change cannot silently recast January. Where membership genuinely moved, the
`CLASSIFICATION_CHANGE` component says so in the month it happened, which is why the annual
roll-forward foots without recasting anything. **Analytical recast is NOT implemented**; if it
ever is, it is a labelled alternative view and never the default. The horizon band states the
basis and names every mapping version in force ("3 mapping versions in force (2024.01.1,
2026.05.3, 2026.06.4)").

### THE CONTINUITY CONTROL WAS WRONG FIRST, AND THE FIX IS THE ACCOUNTING

The first cut tested `beginning[i] == calculatedEnding[i-1]`. **A month's opening is the prior
period's AS-REPORTED governed ending balance — the prior TRIAL BALANCE** — and those two are the
same figure only when the prior month tied. So it reported a continuity break on every untied
reconciliation in every month (11 each on Intercompany Receivable and Accrued Expenses), which is
not a break at all: it is the difference the reconciliation already discloses, counted twice.

**What the untied months DO cost is the year's footing, and that is real.** If a month's
calculated ending is 6.4 below its trial balance and the next month opens at that trial balance,
the year's opening plus its movement is short by exactly the differences that were never carried.
`openingResets` states that as its own line — *"Unreconciled difference at prior month end"* — so
the roll-forward foots AND the reader is told the reconciliation did not tie in those months. It
is a disclosure, not a plug. All 38 definitions now foot and hold continuity across every horizon.

### THE ACTIVITY MATRIX CLASSIFIES A REAL POPULATION

**The activity schema is the governed transaction taxonomy, not a category list invented for this
view.** `RC_TX_TYPES` already classifies every row of every activity population — vendor invoice,
capitalised interest, transfer, reclassification, accrual, reversal, journal, ERP remeasurement —
so each cell drills to the exact transactions behind it. `RC_ACT_TAXONOMY` holds the per-method
WORDING only: a CIP schedule calls a transfer "Transfers", a register calls the same governed
movement "Transfers from CIP". **This is what R1's declared-but-unbuilt `AS-CIP-FULL` was for**;
the registry entry is `built:1` now and names what it resolves to.

**A LINE WITH NO MODELLED POPULATION IS NOT A FOOTING FAILURE.** Several definitions resolve their
balance from the governed statement and model no source accounts (goodwill, transformers, land),
so there is nothing to classify. Left alone the matrix printed the non-GL components only and
reported "does not foot to the roll-forward movement" on **216 of 304** combinations — a red flag
on a condition the reader can do nothing about. The activity is stated as one honest row named
`GL activity` with the reason. 304/304 matrices foot; 78 carry a real classification.

### CERTIFIED HISTORY IS FROZEN, AND THE IMMUTABILITY IS MECHANICAL

`rcCertOf()` materialises a certified month once, deterministically, `Object.freeze`s it into
`RC_CERT_STORE`, and never recomputes it. A post-close journal changes the CURRENT resolution and
leaves the record untouched — which is what makes `sourceChanged` a DETECTION rather than an
assertion. Certified history is seeded governance exactly as `RC_SEED` is: `RC_CERTIFIED_THROUGH`
defaults to the last closed period, nothing at or after `BOOK.open` is claimed (the open period is
R5's), and nothing before `RC_HISTORY_FROM`.

**A POST-CLOSE JOURNAL IS SOURCE TRUTH, NOT A KORVYN OVERLAY.** It is added in `fsOwnTB()` — the
one place a source balance is resolved — so Financials, Trending, Flux and Reconciliations all
move together after a legitimate reopened-period adjustment (memo §21.8). Verified: a $4.2M late
accrual on May 2026 Electrical CIP moves the June reconciliation 705.833 → 710.033 **and FS-CIP
June 4,210.2 → 4,214.4**, while certified v1 stays at 57.188 with fingerprint `FP-76074653`.
Routing it through `RPT_ADJUSTMENTS` would have made an ERP posting a reporting overlay, which is
the distinction R2.1 spent a pass establishing.

**And it lands on the ACCOUNT it was posted to.** `rcAcctBalance()` carves the post-close amount
out before the weighted split and adds it back to its own account, so the bridge can name GL 15010
instead of spreading one journal across four CIP groups.

**`rcAsCertified()` IS A FLAG, NOT A CACHE FLUSH.** The first cut dropped every cache on entry and
exit because `_rcLensBalCache` and `_fsCtaPlugCache` key on line/period/lens and not on the
generation. It was correct and unusable — an annual Control Center resolves several hundred
certified records and paid two full rebuilds for each. Those two keys now carry `_rcMapGen()`,
which folds in the post-close generation and the as-certified flag, so the two resolutions cannot
serve each other's numbers and nothing is flushed. **38 definitions × 12 months: 95ms cold, 1ms warm.**

### THE CERTIFICATION CALENDAR REACHES THE CLOSE

`rcCertRequiredAt()` decides whether a conclusion is owed at a period end. **Overdue is a required
conclusion past its date**: a lender-covenant reconciliation is prepared and reviewed monthly and
CERTIFIED quarterly, and counting it overdue in April and May reports a breach of a control that
was never due (memo §28.6). `reconReadiness()` separates the populations — `overdueCount` counts
the required ones, `overdueAllCount` keeps the raw number. Measured: May 2026 overdue 18 → 15,
June (a quarter end) 17 → 16. Seeded policy: Cash and CIP monthly, **Long-Term and Current Debt
quarterly**, **Goodwill annual**, **Intangibles event-driven** (one declared control event, the
Ridgeline PPA at 2026-03). All four frequencies are exercised; no valuation or impairment engine
is implied by the annual one.

### THE SURFACE: NO SECOND CONTROL CENTER, NO ANNUAL APPLICATION

The horizon is one more field in the bar the page already has (`rcR6Field` → the same `RCFIELD`
descriptor shape, so the menus get the one popover system's keyboard, anchoring and widths for
nothing). The anchor field renders only for Quarter and Full year — the "to date" horizons are
anchored on the working period by definition. The grid **re-heads itself** (Opening / Movement /
Ending / TB / Diff / Change / Tie / Certified / Conclusion) and resolves **endpoints only** for 38
definitions; the monthly detail is one click away in the workspace, which is §52's progressive
disclosure. The workspace keeps its six tabs and changes what they are ABOUT: Roll-forward gains a
**By month / By activity** switch, Support becomes the evidence coverage matrix, Review becomes
the certification history and the horizon conclusion, Trace extends month → certification → package.

**Audit packages are governed OUTPUTS, not a module.** `rcPackageBuild()` builds the package and
its manifest together, because a package whose manifest is assembled later is one nobody can
reproduce. Support is **inherited by reference** — 48 evidence version ids for FY2025, never a
thirteenth copy of the same workpaper. A DELIVERED package is immutable: an amendment marks it
SUPERSEDED with a reason and names its replacement; AP-2026-001 is retained exactly as delivered.

**The GL export is the SAME export.** R2 built one 34-column set, two encodings, one manifest
register and the rule that an export which does not reconcile is REFUSED. R6 extracted the write
half as `rcWriteExport()` and widened the SCOPE to a period range — `rcExport()` is now a
one-liner over it. **The context columns became per-row**: a row in a twelve-month export is a
fact about its own month and carries the versions in force then, so `ctx` may be a function of the
row. Verified: 649 transactions, $3.571M, difference 0, valid.

### TRAPS THAT EACH COST A ROUND

- **A PREFIX IS NOT A NAMESPACE — third time.** `.rcx-hist` (a flex column for Review timeline)
  and `.rcx-chain` (the Trace chain) were already declared. The certified-history TABLE inherited
  `display:flex`, its `table-layout:fixed` was applied and ignored, and the lineage stack silently
  re-gapped the existing Trace. No console error, no gate failure. **`tools/check_css_duplicates.mjs`
  now gates it** — a ratchet over the 63 names legitimately declared twice today, failing when a
  new one appears. Negative-tested by reintroducing the exact `.rcx-hist` collision.
- **Two base rules written for the full-width grid, inherited by the 440px dock.**
  `.rcx-tbl td.rcx-nm` pins `min-width:260px`, and `.rcx-nm` is `display:flex` — so a child set to
  `display:block` is still a flex ITEM and the certifier would not stack under the period however
  it was declared. Both are overridden for R6's dock tables only. And `.rcx-tbl td` pins the row
  height, which clipped the second line into the row below.
- **`.rcx-tn` is a two-column grid.** R6's block children need `grid-column:1/-1` or the heading
  and its body land in adjacent cells and overlap. R6's state border is `st-ok`/`st-warn`/`st-bad`,
  NOT a reuse of `.bad`: `.rcx-tn.bad` already exists as a bare `border-left-color` with no
  border-style — inert by construction — and giving it a border would have changed every existing
  Trace node it lands on.
- **SPLICING AFTER THE LAST STATEMENT OF A FUNCTION IS NOT SPLICING AFTER THE FUNCTION.** Part B
  and Part C both landed inside a function body as unreachable code. The file parsed, the app
  loaded, and every symbol in the block was simply undefined. An 'after' splice must assert that
  the next line is a `}` at column 0.
- **AN AMENDMENT CHANGES A DERIVED STATE, SO THE DERIVATION MUST BE DROPPED.** `rcPeriodBridge()`
  caches on the post-close generation, and certifying an amendment posts nothing — so a month went
  on reading "changed after certification" after it had been amended. `rcAmendCertify()` and
  `rcCertifyHorizon()` clear `_rcBridgeCache` / `_rcActCache`.
- **Role defaults clear the selection.** `kApplyRoleDefaults()` runs inside `rcRows()` and calls
  `setRcQV()`, which nulls `rcSel`. After `setUserRole()`, render once to let it settle before
  selecting anything — this is R5.6 behaviour, not R6's, and it cost several screenshots.
- **Never pass replacement text through the shell.** A quoted heredoc still ate `\\'` and produced
  an anchor that could not match. Write the splice script with the Write tool.

### Verified

62/62 view keys (65 including the three lens-scoped ones) · **2,736 horizon × definition × tab ×
roll-mode combinations render with content, 0 errors, 0 empty** · **304/304 activity matrices
foot** · every definition foots and holds continuity across 8 horizons · reconciliation groups tie
to Financials at Jun 2024 through Jun 2026 · `rcChronologyCheck()` = 0 · console clean on a fresh
load · **all four gates pass** (chrome themes 10/10, content contrast, spacing ratchet unchanged at
1072/88, css duplicates 63/63) · **all 43 acceptance tests in brief §56–§60 pass**, run in the
product.

### Deliberately NOT built (R7 and beyond)

The Excel add-in · the full Data Room and PBC request workflow · an audit portal or auditor
messaging · audit confirmations · transaction-matching expansion · autonomous AI certification ·
ERP journal posting · a valuation or tax-provision engine · analytical recast to the current
mapping. **AI surfaces of any kind:** the objects are structured for grounding (`rcMultiPeriod`,
`rcVersionBridge`, `rcDownstreamImpact`, the package manifest) and nothing is generated.

### Open, and worth an owner's call

- **The 12-column annual by-activity matrix scrolls horizontally in the 440px dock.** That is the
  documented pattern for wide content and a quarter fits comfortably, but a year is tight. The
  honest alternative is opening the annual matrix on the main canvas the way Activity Detail does
  — which is a layout decision, not a defect, so it was not made unasked.
- **`RC_CERTIFIED_THROUGH` is empty**, so every definition's certified history runs to the last
  closed period. A real deployment configures it per definition.
- The event-driven example uses Intangible Assets with one declared control event. If acquisition
  accounting is ever modelled properly, that policy entry is where it attaches.

## 2026-09-04 — R6.1: the period is an operating state, and the calendar decides the work

R6 gave a reconciliation a certification FREQUENCY and the user a VIEW HORIZON. What it did not
do is decide WHICH WORK IS ACTIVE, so the product still behaved as though you pick a period and
then pick what to do in it. That is backwards for a close.

```
CurrentControlPeriod        the one period the enterprise is working in
+ FinancialControlCalendar  what it requires at this scope, lens and basis
= the active work, resolved — never chosen from a menu
```

**NO THIRD PERIOD VARIABLE.** `BOOK.open` is still what the book accepts work in and
`VIEW.period` is still what you are looking at. R6.1 adds the CONTROL state around them —
upcoming, pre-close, open, ready to finalise, certified — and what that state implies.

### Where it lives

| Concept | Function |
|---|---|
| Period lifecycle | `PERIOD_STATES` · `controlPeriodState()` · `controlPeriodExceptions()` |
| Fiscal calendar | `FISCAL` · `isQuarterEnd` · `isYearEnd` · `controlHorizons()` |
| The calendar | `financialControlCalendar()` / `fcal()` — cached, cleared with the recon caches |
| Audit horizon | `auditHorizon()` — resolved, never selected |
| Audit readiness | `auditControls()` · `auditReadiness()` · `rcAuditGenerate()` |
| Provenance | `controlProvenance()` — why this control is active, in one sentence |
| The guard | `canPerformActivePeriodAction()` · `rcGate()` · `rcPeriodActive()` |
| Amendment mode | `RC_AMENDMENT_MODE` · `wpAmendStart/End()` |
| Current Period | `renderCurrentPeriod()` · `wpLens()` · `wpNextAction()` · `wpStages()` |
| Audit History | `renderAuditHistory()` |

### JUNE IS A QUARTER END AND KORVYN KNOWS IT

`controlHorizons()` resolves month-end + Q2-end in June and month-end + Q4-end + FY-end in
December. Measured: Jun requires **34 monthly + 2 quarterly + 0 annual**; May requires **34 + 0 +
0**; Dec requires **34 + 2 + 1**. The user never answers "should I do the Q2 reconciliation now?"
and never activates year-end work by hand.

**AND THE VIEW HORIZON STILL CREATES NO WORK.** R6's distinction is load-bearing and untouched:
`rcHorizon` selects periods to LOOK at, `controlHorizons()` resolves what is DUE, and switching
the Control Center to FY2025 leaves both the required-control set and the audit horizon
unchanged (asserted).

### TWO CORRECTIONS THE FIRST CUT NEEDED

**PRE-CLOSE IS AN ACCOUNTING FACT, NOT A DAY COUNT.** It first read off days elapsed since the
period end, which made the working period read "Open" at day 6 while the ERP period was still
accepting postings — the opposite of what pre-close means. It is the SOURCE state: while the
source period is open the data is still arriving, which is exactly the condition R5.7B's
checkpoints exist for. No day constant, and it cannot drift with the prototype's clock.

**AN EXCEPTION ON ONE RECONCILIATION IS NOT THE PERIOD'S STATE.** Returned work and re-review
first won the state test, so two lines out of thirty-eight renamed the whole close and the header
stopped saying where the close actually was. The lifecycle state is the position; exceptions are
counted alongside it in `C.exceptions` and surfaced where they can be acted on. For a CLOSED
period they ARE the state, because nothing else can be true of a period whose work is finished.

### THE GUARD IS IN THE WRITERS, NOT ONLY ON THE BUTTONS

`canPerformActivePeriodAction()` is asked inside `rcSubmitReview`, `rcApproveStage`,
`rcStartPrep`, `rcMarkReady`, `rcReturnCommit`, `rcCertifyHorizon` and `rcPkgOpen`. It is
deliberately a THIRD question after capability and independence: being a Controller does not make
a certified period writable, and an open period does not make you a reviewer. Verified —
preparing in May leaves `rcState` byte-identical and reports *"May 2026 is certified history and
is read only. To prepare in it, a Controller or the Chief Accounting Officer must start an
amendment or request a reopen."*

**AND THE CONTROLS STAND DOWN, WHICH IS THE OTHER HALF.** The writer refusing is the guarantee;
it is not the experience. Opening May still showed "Mark reviewed through now", the readiness
actions and the review workflow exactly as the working period does — a control that will refuse
is worse than one that is not there. `rcCanPrepare()` and `rcRevActions()` are the two single
gates the panel already routed through, so adding the period to them stands every preparation and
review control down at once. **Everything still READS** — roll-forward, activity, support,
decisions, certification — which is the whole point of history being reachable.

### AUDIT IS PERIOD-DRIVEN AND THE PACKAGE ASSEMBLES ITSELF

R6 left the AuditPackage as a thing a user CREATES for any horizon they could name — the
free-form period-selection workspace the brief rules out. `auditHorizon()` resolves it from the
control period (a month audits the month, a quarter end the quarter, a year end the year), and
`rcPkgOpen()` now refuses anything else by name: *"An audit package is generated over the current
control horizon — quarter-end, Q2 2026. FY2025 is history: its packages open and read, and a
change to them goes through an amendment."*

`auditReadiness()` counts the (definition, period) conclusions the horizon requires and how many
carry a governed one. Measured: **Q2 2026 — 86 of 104 controls ready, Assembling**, with the
outstanding ones named; May 2026 — 34 of 34, Ready; Dec 2026 — 191 of 209 over FY2026. The
package completes itself; nothing has to be remembered.

`rcHorizonPackage` / `rcAuditGenerate` add a HORIZON-level package beside R6's per-definition
one, reusing the same manifest discipline. **R6's package, its manifest, its supersession and its
amendment bridge are untouched.**

### THE SURFACES

**The Accounting landing page is the Current Period workspace.** `renderAcctOver` is retired to a
delegation (the legacy body is kept as `renderAcctOverLegacy` and nothing calls it) so every deep
link still lands. What it replaced was seven KPI cards titled "Controller command centre" — the
startup dashboard the brief rules out. It now answers one question, role-aware: **what do I need
to do next.** Header (period · lens · basis · currency · state · data through), a restrained
PREPARE → REVIEW → CERTIFY → AUDIT READY indicator, the period's exceptions as one-click filters,
the work table (WORK · OWNER · STATE · NEXT ACTION), the controls active this period with a
`why`, and the audit package assembling.

**THE ROLE → QUEUE MAPPING USES DECLARED POLICY, and the first cut used the wrong field.**
`FX_CAPS.policy` is 1 for the Accounting Manager, so testing `reopen||policy` first gave a manager
the CERTIFICATION queue — the one queue that is not theirs — and `FX_CAPS.reopen` is 1 for both
the Controller and the CAO, so it cannot tell them apart at all. `PERIOD_CAPS` already declares
that distinction (a Controller LOCKS a period, only the CAO REOPENS one) and is the table the
sign-off matrix and the period control both read. Resolved: Asset Manager → my preparation work ·
Accounting Manager → my team's work and blockers · Controller → needs my review · CAO →
certification readiness · External Auditor → certified and audit-ready work.

**A CONTROL THAT OWES NO CONCLUSION THIS PERIOD OWES NO ACTION.** The first cut asked for
"Complete preparation" on Goodwill in June — an annual control next due in December. It is
de-prioritised, not hidden: the row reads *Not due this period · next due Dec 2026*, sorts below
everything owed, and is passive.

**The period navigator is CURRENT / HISTORY / UPCOMING.** It listed twelve months as twelve equal
choices, which is what makes a period read as a filter. Upcoming periods derive from the calendar
rather than from `MONTHS`, which stops at the working period.

**The rail follows the financial lifecycle** (§24): Current period · Financial foundation (trial
balance, account activity, account mapping, data enrichment) · Financial review (financials, flux,
trending) · Close & control (reconciliations, intercompany, consolidation, close, continuous
close) · Governance (issues, policies, audit history). Same components and same visual language;
only the order and the group names changed. **Account Mapping and Data Enrichment moved into the
foundation because that is where they act: they interpret and organise the trial balance's facts,
they do not create them** — the brief's §2 boundary, made structural.

> **Superseded 2026-09-04 by R6.2** — see *Financials is a DOMAIN* below. `Financial foundation`
> is gone as a user-facing group, Reconciliations moved into Financial review, Account Mapping
> and Data Enrichment into Governance, and Consolidation left the rail for Financials. The
> principle in this paragraph — the rail is the workflow, not the architecture — is what R6.2
> carried further, not what it reversed.

**Audit History, not "Audit"** (§25). Active readiness belongs to the current period; naming the
page Audit would promise a workspace that §15 says must not exist.

**Close consumes the one calendar** (§30). Its header states the control period title, its state
and its horizons — "Jun 2026 · Q2 2026 close · Month-end + Quarter-end · 34 monthly · 2 quarterly
controls required". `closeStages()`, `closePct()` and the checklist are untouched.

### Two small fixes made along the way

- **`REC-FF`'s name carried a pre-escaped entity** copied from the FSLINES name (which IS rendered
  raw). Escaped again on every definition render it read `Furniture &amp;amp; Equipment` in the
  Control Center, the multi-period grid and the work table. The definition name is plain text now,
  per R1's own rule; the financial line's name is untouched.
- **`--n-400` as `border-left-color`** tripped the content-contrast gate's USE arm. The gate is
  right: n-400's declared role is borders and placeholders and the arm catches any `color`
  property. It uses `--border-strong`.

### Verified

66/66 views · **3,192** period × horizon × definition × tab combinations render with content, 0
errors, 0 empty · console clean on a fresh load · **4/4 gates** · FS-CIP 4,210.2 and the
reconciliation groups still tie to it · `rcChronologyCheck()` = 0 · R6 intact (FY2025 foots, holds
continuity, 12/12 certified, the activity matrix reconciles) · **all 22 acceptance tests in the
brief pass, run in the product.**

### Deliberately not done

R7 / Korvyn for Excel · a separate audit application · a second period model · per-entity or
per-lens divergent close states beyond what `fcal(period, scope, lens)` already keys on (the
signature carries them; the seeded book has one enterprise close) · AI surfaces.

## 2026-09-04 — the module is named FLUX REVIEW

Owner’s direction. **User-facing names only — not one identifier moved.** The tab id is still
`finrep`, and `FX_*`, `#fxRoot`, `KFX`, `FLUX_GOV`, `rcGoFlux()` and every function name are
untouched: renaming those is a refactor of several hundred symbols with no product change and
real risk.

**35 references renamed**, found in two passes that must both be run — a source scan for the
declared strings, and a DOM sweep across every view for what a user actually SEES. The sweep
caught three the source scan could not: the shell title row **assigns** the page name
(`tt.textContent='Flux'`) rather than declaring it, and it is the one place the name is read
largest; plus `View Flux ›` in the drivers card and the Close review stage’s own description.

Renamed: the rail item and the tab registry · `VIEW_META.finrep` · the page title · the Cash
flows / Equity flux view’s heading · Close’s workstream rows and its review-stage description ·
the attention row · `MAP_USED_BY` · the Trace “where used” list · My Work’s workspace · the
Reconciliations routes (`Open Flux Review →`, `View Flux Review ›`, the Drivers button, the
downstream-impact row) · the memo (menu item, modal heading, printed title) · and the sign-off
vocabulary, which already said the right words and is now capitalised as a proper noun.

**Two navigation paths were stale as well as unrenamed** and were corrected with it: two notes
still read “General Ledger → Financial reporting → Flux review”, a path the rail has not used
since 2026-08-28. They read **Accounting → Flux Review**.

**DELIBERATELY NOT RENAMED — the domain terms that contain the word.** A flux is a movement
between two periods; that word is the accounting, not the product name, and “Flux Review group”
would read wrong:

| Left as-is | What it is |
|---|---|
| **Flux group** | a mapping taxonomy (`TAXONOMIES.flux`) — a dimension of the chart |
| **Flux Driver** | an enrichment field (`EF-FLUX`) |
| **Flux range / comparison / scope** | filter-group labels on the legacy `#filterCtrls` store and the Cash flows / Equity view |
| **flux explanations / commentary / notes** | the accounting artefacts a review produces |

**Verified:** 66/66 views · console clean · 4/4 gates · FS-CIP 4,210.2 · `rcChronologyCheck()` = 0
· R6 intact (FY2025 foots, 12/12 certified) · the control calendar unchanged · the
Reconciliation → Flux Review → return round trip still preserves context · a DOM sweep across
every view finds no bare “Flux” naming the module.


## 2026-09-04 — Account Mapping vs Data Enrichment: three attribute classes

Owner's direction, a focused clarification rather than a redesign. The two pages existed and
both worked; what was missing was the line between them and the layer that makes it visible.

```
ACCOUNT MAPPING    governed IDENTITY   — where a source GL account belongs in the reporting
                   structure: canonical account, group, financial statement line, cash-flow
                   category, hierarchy. Trial Balance, Financials, Flux Review, Trending,
                   Reconciliations and Reporting all read it.

DATA ENRICHMENT    governed CONTEXT    — capital / expense, asset class, project phase, vendor
                   and department normalization, flux driver, policy reference.

NEITHER TOUCHES A SOURCE FACT.
```

### The three attribute classes, and why the model needed them

`ENR_SRC` already carried PROVENANCE — where a value came from: ERP, rule, user, Excel, API.
It did not carry CLASS, which is a different question: **a vendor read from the ERP and a vendor
Korvyn standardised both have provenance, and only one of them is a source fact.**

| Class | Meaning |
|---|---|
| **SOURCE** | Read from the ERP exactly as received. Never changed, never overwritten. |
| **NORMALIZED** | A Korvyn-standardised form of a source value — the source value is preserved beside it. |
| **GOVERNED** | A Korvyn classification not present in the source system, applied by a rule or a person, versioned. |

`ENR_NORMALIZE` is the map (vendor `Siemens → Siemens Energy`, department
`DC Construction → Development & Construction`), and it is a MAP, NOT A REWRITE: the ERP still
says "DC Construction" and Korvyn additionally knows what that means. `enrAttrRows()` returns
all three classes for one object; the normalized row appears only where a rule actually matched,
so nothing claims a standardisation that was not made.

### THE WORKED EXAMPLE USES THIS BOOK'S OWN CHART

The brief illustrates it with "18430 Electrical Equipment". This book's electrical CIP account
is **15010 CIP - Electrical**, and inventing 18430 would create a source account that maps to
nothing and reconciles to nothing — the duplicate source truth the whole module refuses. The
accounting is identical: `JE-295204`, a $7.8M Siemens transformer package at South Valley,
booked to electrical CIP by the DC Construction department. Its source values are deliberately
the **un-normalised** ones, because that is what an ERP actually sends and it is what makes the
normalization layer visible rather than theoretical.

### Rules are architecture, not an engine (brief §7)

`ENR_RULES` declares four with their conditions and what they propose, and the values they
produced now REFERENCE them by id — so provenance reads *"Rule ER-01 — Electrical equipment
from Siemens · Vendor is Siemens Energy AND Account group is Electrical CIP"* instead of
"Korvyn Rule" and stopping there. Nothing evaluates them at write time. What this buys is that
when the engine is built the rules already exist as objects the existing values point at.
`ER-04` is deliberately a POPULATION rule (vendor + project + account group), which is §5's
point: a reusable governed rule rather than tagging every row.

### The surface

- **The subtitle** is the brief's own sentence, and it is said ONCE — it went into the topbar
  crumb (`VIEW_META.enrich.c`), where every other page carries its description, and glHead's
  second argument became the CONTEXT line, which is the pattern Reconciliations already follows.
  The first cut had the new sentence sitting under a near-identical old one.
- **The boundary block** renders on BOTH pages, each naming itself, the other, and the route
  across. A reader who lands on the wrong page can tell in a line.
- **The grid gains a Source value column** — an enrichment sits over a source fact and a reader
  must see the fact it sits over. It shows the normalization inline (`Siemens → Siemens Energy`).
- **Attribute type / Applies to filters**, through `RCFIELD` and the one popover system — the
  `enr:` prefix reads the same descriptors through the same renderer as `rc:`. A new page does
  not get a new dropdown.
- **The object panel** shows the three classes side by side under the source record, with the
  immutability stated on it: *"The amount, the account, the posting date, the journal and the
  trial balance are ERP facts. Nothing on this page changes them."*
- **Trace, inline** (§14): where the attribute came from — the rule, its condition, the effective
  version, what it was applied to — and where it is used, stated per class because a source
  attribute and a governed classification are not consumed the same way.

**A STORED `ENR_VALUE` IS ALWAYS A GOVERNED ENRICHMENT.** Source and normalized attributes are
read off the source record and are deliberately NOT rows in that store; putting them there would
be the second copy of a source fact. The grid says so on every row and the other two classes are
reached through the object panel, which is where they live.

### The name stays "Data Enrichment"

The brief prefers a rename only for a clear UX benefit and there is none: "Financial
Classification" is narrower than what the page holds (operational attributes, derived measures,
reporting overlays) and "Accounting Enrichment" is the same word with a longer prefix.

### TWO TOOLING TRAPS, BOTH OF WHICH BIT

- **`String.replace` interprets `$'` in the REPLACEMENT.** A block of JS that formats currency
  with `'$'+v` contains `$'` — "everything after the match" — and splicing it grew the 4.6 MB
  file to **6.7 MB in one call, with no error**. `.safe.js` now does every substitution through
  `split/join` or a function replacer, which are never interpreted. **Never pass a code block to
  `String.replace` as a replacement string.**
- **`git checkout index.html` hands the file back with LF.** The git blob is LF and the working
  tree was CRLF, so every multi-line anchor written against CRLF then matched zero times — with
  a confusing "anchor occurs 0" on text that is visibly present. `.safe.js` detects the file's
  own line ending. **The file is now uniformly LF**, which is what git stores anyway; the earlier
  note that the working tree is CRLF no longer holds after a checkout.

### Verified

66/66 views · console clean · 4/4 gates · **all 11 acceptance tests pass, run in the product** ·
FS-CIP 4,210.2 and the reconciliation groups still tie to it · adding and removing a governed
enrichment moves neither the statement nor the trial balance by a thousandth · R6/R6.1 intact
(FY2025 foots, 12/12 certified, the control calendar unchanged) · Account Mapping's rule shape
still carries only identity fields and no vendor, department, project or phase.

### Not done

R7 / Korvyn for Excel · a rules engine · an AI proposal UI (the `ai` provenance and the
Proposed → Reviewed → Accepted states are declared and one seeded value is `proposed`, but
nothing generates) · normalization of anything beyond vendor and department.

## 2026-09-04 — R6.2: Financials is a DOMAIN — statements, consolidation, reporting package

Owner's brief. Three closely connected experiences on one page, not three applications:

```
STATEMENTS         presents the governed result for Period x Scope x Lens x Basis
CONSOLIDATION      establishes and validates the group-level financial population
REPORTING PACKAGE  publishes that result to CFO / CEO / Board
```

**READ THE R3.2 → R6.1 BLOCKS ABOVE FIRST.** R6.2 rebuilt none of it. Every figure still
resolves through `fsAmount()` / `rcLensLine()`, the period is still `BOOK.open` vs
`VIEW.period`, and the canary is unmoved: **FS-CIP Jun 2026 = 4,210.2**.

### The navigation, and what it says about the product

`Financial foundation` is gone as a user-facing group — it named an architectural layer, not
a thing anyone does. The rail is the accountant's workflow now: **Current period** ·
**Financial review** (Trial balance · Account activity · Financials · Flux Review · Trending ·
**Reconciliations**) · **Close & control** (Close · Continuous Close · Intercompany) ·
**Governance** (Account Mapping · Data Enrichment · Accounting Issues · Policies · Audit
History).

- **Reconciliations moved into Financial review** because the flow is TB → statements →
  analysis → **proof**, and proof belongs beside the thing it proves.
- **Account Mapping and Data Enrichment are governance**: they are the versioned
  interpretation over the ledger, maintained on their own cadence, not a step in a close.
- **Account activity is proof, not a review step** (corrected the same day — see the cleanup
  note at the end of this block). It first went between Trial balance and Financials, which
  put a drill-through surface in the middle of the five-step sequence and gave it the same
  weight as the steps around it. It now sits under **Ledger & detail**, below the review flow.
- **CONSOLIDATION IS NO LONGER A RAIL PEER.** `pickTab('consol')` redirects to Financials ›
  Consolidation, so all ~20 deep links — Home, Close, Continuous Close, My Work, Issues, the
  entity explorer, Ask Korvyn, several followed by `setCsSub(...)` — keep working unedited.
  The `consol` view id stays mounted and unreachable rather than being removed from the lens's
  tab list, which is the lower-risk half of that trade.

### THE FINANCIALS / CONSOLIDATION BOUNDARY IS EXECUTABLE, NOT A COMMENT

`fnCanEditConsol()` returns `{ok:false, why}` unconditionally and every adjustment affordance
on the page asks it. Financials DISPLAYS FX, eliminations, adjustments, NCI and entity
contribution and lets a reader Trace all of them; creation, review and approval belong to the
governed consolidation process that owns the population. A boundary that lives only in prose
is a boundary that rots.

The seven consolidation views moved INSIDE the Financials Consolidation body (`fnConsolBar`),
so the shell's sub-view row never carries two levels of the same idea. Their data and every
`csv*` renderer are unchanged.

### Consolidation gained the architecture it was missing

`consolPerimeter` · `consolNCI` · `consolElimFor` · `consolElimCompleteness` · `consolBridge` ·
`consolRun` · `CONSOL_ADJ_TYPES`, plus two views — **Perimeter & ownership** and
**Entity-to-group bridge**.

- **An entity is inside the perimeter because its METHOD places it there**, read from
  `CONS_ENT` / `CONS_INVEST`, never a second list. Ownership and contribution are shown as
  different facts, which is what makes the 51%-held equity-method JV legible instead of
  looking like a consolidation error.
- **A COMPONENT THIS BUILD DOES NOT CALCULATE IS NAMED, NOT ZEROED.** `CONSOL_ADJ_TYPES` marks
  three live (elimination, reporting, translation) and four declared-not-calculated (NCI
  allocation, ownership change, fair value / PPA, equity pick-up). An engine that quietly
  reported nil for a step acquisition would be worse than one that says it does not model
  them — the reader would take the zero for an answer.
- **NCI IS A MEASURED NIL, not an omission.** Every consolidated subsidiary is wholly owned;
  the one majority holding that is not is equity method and outside the perimeter. The
  function exists so the bridge can state the step rather than leave it out.
- **A STATUTORY LENS IS NOT A GROUP CONSOLIDATION.** `consolidates` is read off the lens's own
  `consolidationRuleSetId` (R3 already models Germany Statutory without one), so corporate
  consolidation logic is never forced onto a single filing population.
- **A CLOSED PERIOD'S CONSOLIDATION CONCLUDED.** `consolRun` short-circuits for any period the
  book has closed. The entity gates (`csxEntities`, `GL_CLOSE`, `CONS_FX`) describe the
  CURRENT close; reporting them against history would raise a live blocker on a period that
  was certified months ago.

### THE ENTITY-TO-GROUP BRIDGE FOOTS BY CONSTRUCTION

```
entity trial balances, translated       A
+ intercompany eliminations             E     (signed effects ON the line)
+ ownership / NCI effects               N
= group trial balance                         fsAmount().sourceTB
+ reporting adjustments                       fsAmount().adj
= consolidated governed amount                fsAmount().reported
```

**A IS DERIVED FROM THE GROUP, NOT AGGREGATED INTO IT.** Korvyn holds one governed amount per
financial line; the entity columns are its composition, weighted by `CONS_ENT.share` with the
last entity taking the remainder — the same plug discipline the reconciliation groups use, and
for the same reason. **Remove the bridge and not one figure in the product moves.** Verified:
every leaf line of both statements foots, in every period tested.

**The intercompany lines are what make it real.** FS-ICR and FS-ICP are nil at group level
because they eliminate in full; the bridge shows $325.9M aggregated, ($325.9M) eliminated,
$0.0M group. And the elimination is a control that can FAIL: $3.6M of the population is
unmatched, so the statement's nil is an **unproven elimination**, disclosed as such rather
than being read as a completed one.

**Both effects are signed effects ON the line.** The first cut negated them a second time on
the way out and the two intercompany lines were the only ones that did not foot — which is how
it was caught. Eliminating a receivable and eliminating the reciprocal payable are BOTH
negative, because the two lines are stored with the sign their own side of the balance sheet
uses.

**Two shapes, two components.** The bridge STEPS are not the entity table's shape. Folded into
it as colspan rows, a one-sentence NCI note landed in a `white-space:nowrap` cell and stretched
the table to **1,719px inside a 924px card** — so the amount column, the one thing the bridge
exists to show, sat off screen at the default scroll position. A wide entity table that may
scroll, and a three-part step list that never does.

### THE MANAGEMENT REPORTING PACKAGE

`MRP_TEMPLATES` · `MRP_SECTION_TYPES` · `MRP_SCHEDULES` · `MRP_PACKAGES` · `mrpLive` ·
`mrpFreeze` · `mrpDistribute` · `mrpChangeImpact` · `mrpReadiness` · `mrpAiContext`.

**IT IS NOT THE AUDIT PACKAGE, and the two must not converge.** Both consume the same governed
financial model and answer different questions for different audiences. Nothing in R6.2 touches
`RC_PACKAGES`, `rcPackageBuild` or `auditReadiness`; a management package cites certification
STATE and never carries the certification evidence.

**1. PERIOD-DRIVEN, NEVER USER-CREATED.** `mrpActiveTemplates()` reads the
FinancialControlCalendar. Measured: **May (a month end) activates 1** template, **June (a
quarter end) activates 3** — Corporate Monthly, Corporate Quarterly, Board — and **Dec 2025 (a
year end) activates 4**, adding the FY Annual & Board package. A template with an external
`trigger` (lender, fund) is never activated by the accounting calendar. **A period that has not
opened activates nothing**: Dec 2026 is a year end and returns **0**, reading "no package due"
over a list of what its horizons will require, rather than assembling a package against a
period nobody can post to. That last case is worth stating precisely because the obvious
assertion — "a year end activates four" — is true of Dec 2025 and false of Dec 2026, and the
difference is the whole point.

**2. COMMENTARY IS REUSED, NEVER RETYPED.** A section holds `approvedNarrativeReferences` — ids
into `FX_EXPL` — and resolves the text, its author, its reviewer and its approval at render
time. Asserted by serialising the whole package object and searching it for the prose: **zero
hits.** The provenance line reads *Flux Review › FS-CIP › Jun 2026 vs May 2026 ›
EXPL-FS-CIP-2026-06-mom v3 › drafted by A. Okafor › approved by Corporate Accounting · Jul 2,
2026*. The package reports where an explanation stands; it never re-approves one.

**3. LARGE POPULATIONS ARE MANIFESTS, NOT ROWS.** A supporting schedule is a governed query
definition with a row count, an amount total, a fingerprint and a delivery mode. Two of the
June package's nine resolve **1.28M and 3.96M rows** and are background exports (CSV /
Parquet); the audit extract declares **41.2M**. The browser renders the manifest and the
aggregation. A schedule's amount is the governed line it aggregates, so an export reconciles
to the package by construction.

**4. A PUBLISHED PACKAGE IS IMMUTABLE.** `Object.freeze`, versioned, superseded with a reason
and a replacement. Seeded history is confined to CLOSED periods — publishing the open period
would contradict R6.1.

### TEMPLATE INHERITANCE — a variant states only its difference

`mrpTemplate()` resolves `extends` → parent sections → `drop` → `replace` → `add`. The chain
the brief names is real: **Corporate Monthly → Americas Monthly → South Valley Monthly**, the
last resolving 7 sections having dropped Liquidity and replaced Capex, without restating the
six it inherits. Copying a template that shares eleven sections is how a reporting library
drifts: change the corporate income statement and five copies keep the old one.

### CHANGE IMPACT AFTER PUBLICATION — and why the fingerprint had to pin the FIGURES

`mrpChangeImpact` compares the published fingerprint field by field against the live one, each
field carrying its own severity. **Version ids alone are not enough**: a post-close journal or a
newly approved reporting adjustment moves a published figure without moving a single version
label, and a package reporting "no impact" in that case would be worse than one with no
detection at all. `mrpStatementDigest` hashes every leaf line of every statement the template
presents — the amounts a reader of the package actually saw.

Measured: **April v1 → Republication required** (unresolved, a change landed after it went to
the CFO), **May v1 → superseded by v2**, **May v2 and both March packages → No change**.

### THE DEMONSTRATION IS A REPORTING ADJUSTMENT, NOT A POST-CLOSE JOURNAL

This distinction cost a round and is worth keeping. A post-close ERP posting rolls FORWARD —
May's balance is June's opening — so seeding two of them to demonstrate a reporting-package
feature moved the working period's headline figure: **FS-CIP June went 4,210.2 → 4,211.8**,
observed before it was reverted. A reporting adjustment is period-scoped by construction
(`fsAmount(line, period).adj` resolves that period's adjustments), so it changes the period
whose package was published and nothing after it. R6's post-close mechanism is untouched; it
is simply not the right instrument for a demonstration.

**THE PAIR OF LINES IS ALSO CHOSEN, NOT ARBITRARY.** Any adjustment to May moves a June-vs-May
variance, and one on a line the June flux review is built around silently changes which lines
require an explanation — measured: an FS-UTIL adjustment dropped Utilities out of the June
required set and took Material Variances from 2/2 to 1/1. **CIP → Buildings** (assets placed in
service) leaves the required population identical, verified with and without the seed: IS
[FS-UTIL, FS-RM], BS [FS-CIP, FS-RE]. It is also the placed-in-service determination this
product is about.

**Known and accepted consequence:** the two seeded closed-period amendments make R6's own
"changed after certification" detection fire, so Q2 audit readiness reads **78 of 104** where
CLAUDE.md previously recorded 86. Verified by removing the seed and re-reading (86/104) and
restoring it (78/104). That is the R6 architecture working on a real governed change, and one
change now demonstrates both the R6 re-review path and the R6.2 republication path.

### Two readings of one object

**The workspace** (§41) is compact stacked cards — readiness, content, commentary, schedules,
outputs, history, template — and deliberately not a wizard. **The published view** (§29) is
what an executive receives: title, context, version, approver, amendment reason, contents, key
movements and their provenance, and no preparation control anywhere.

**Every readiness state is read from the workspace that owns it** — `fsTieOut`,
`fxFluxReadiness`, `reconReadiness`, `consolRun`, `amKpi`, `mrpSchedule`. There is no
"reporting package reconciliation complete = yes" and there must not be one.

**A statement that does not balance blocks the package; an incomplete mapping does not.** The
unmapped population is a disclosed exclusion that Financials already states above the
statement, and treating a permanent estate-wide condition as a blocker would make the package
permanently unpublishable — a rule that reports nothing.

### Two upstream fixes R6.2 required, both defects in their own right

- **`fxWfStatus` ignored a seeded explanation's own status.** The workflow store stays the size
  of the work actually done (`fxWfEnsure` creates on demand), so a line nobody has touched has
  no record — and an explanation seeded as approved was reading "Needs explanation" purely
  because of that absence. The explanation's own status now speaks for the line until a
  workflow record supersedes it.
- **`fxFluxReadiness()` took no statement argument**, so it answered for whichever statement a
  user last left the Flux Review page on. A package section's readiness must not depend on
  that. `fxFluxReadiness(stmt)` — omitted, it is the page's own statement exactly as before.
  Do not shadow `fxStmt` with a local of the same name: it is a module-level `let` and not on
  `window`, so the outer value becomes unreachable (caught immediately).

### Traps, each of which cost a round

- **AN HTML ENTITY INSIDE `glEsc()` REACHES THE SCREEN AS ITS OWN SOURCE TEXT.** Nine call
  sites; one printed `CFO &#183; CEO` in the distribution column. Sweep the RENDERED DOM for
  `/&#\d+;|&[a-z]{2,8};/` in leaf text nodes — the source is not where this is visible.
- **A FINANCIAL LINE NAME IS PRE-ESCAPED HTML** and is rendered RAW everywhere else (R1 recorded
  this). Six R6.2 call sites escaped it again and printed `Furniture &amp;amp; Equipment`.
- **A BACKTICK INSIDE AN HTML COMMENT INSIDE A TEMPLATE LITERAL TERMINATES THE LITERAL.** A
  comment reading ``a `white-space:nowrap` cell`` broke the whole script block with
  "Unexpected identifier 'white'".
- **Never pass replacement text through the shell — FOURTH TIME.** A quoted heredoc still ate
  `\\'` and `\"`, producing `onclick="setCsSub(''+v[0]+'')"`. Write the splice script with the
  Write tool.
- **A prefix is not a namespace.** `.mrp-*` and `.csx-*` were greped before being declared; the
  duplicate-class gate confirms 63/63 unchanged.
- `--n-400` is gated as a non-foreground token. The disclosure caret took `--muted` because it
  is an AFFORDANCE; the two `›` separators took `--n-300`, which is what `.rw-figs .sep` and
  `.ws-from .sep` already use, and they are named in the checker's DECORATIVE list.

### Verified

**189 view renders** (63 views x 3 periods) with 0 errors and 0 empty · **40 Financials
sub-surface combinations** (3 periods x statements / 9 consolidation views / active package
templates) · **all 20 acceptance tests pass, run in the product** · console clean on a fresh
load · **4/4 gates** (chrome themes 10/10, content contrast, spacing ratchet unchanged at
1072/88, css duplicates 63/63) · **0 clipped elements** and **0 raw HTML entities** across every
new surface · dark mode holds · every bridge line foots · FS-CIP = **4,210.2** · R6/R6.1 intact
(FY2025 foots, chronology 0, the control calendar unchanged).

### Deliberately not built

The PowerPoint generation engine (the object model treats pptx as a first-class governed
output; nothing renders a deck) · a slide designer of any kind · the server-side query engine
behind a SERVER-mode schedule · email or distribution delivery (the RECORD is carried; no
integration) · a consolidation posting engine, statutory adjustment engine, NCI allocation,
step acquisition or purchase accounting · analytical recast · **R7 / Korvyn for Excel** · **AI
surfaces of any kind** — `mrpAiContext()` structures the objects a grounded answer would need
and nothing generates.

### Open, and worth an owner's call

- **The regional and programme template variants are declared and not activated.** Americas
  Monthly and South Valley Monthly resolve correctly and prove the inheritance chain, but the
  corporate calendar activates the corporate line only; wiring a variant to a scope is a
  deployment configuration decision.
- **`mrpPublish` is reachable and nothing calls it from the UI.** Publication is gated
  (`canPerformActivePeriodAction` plus every section ready) and June is legitimately not ready,
  so a publish button would spend the close refusing. It belongs on the readiness card once a
  period can actually reach READY.
- **The `consol` view id is mounted and unreachable.** Removing it from the lens's tab list
  would delete the div several lookups still name; it is inert, and tidying it is its own pass.

### Later the same day — two corrections, no redesign

**ACCOUNT ACTIVITY LEFT THE REVIEW SEQUENCE.** Financial review is TB → Financials → Flux
Review → Trending → Reconciliations and nothing else; account activity is what those five
DRILL INTO. Sitting between Trial balance and Financials it had the same rail weight as a
review step, which is the opposite of what a proof surface should read as. It keeps an entry
under a new **Ledger & detail** group so a reader who wants raw GL can still reach it
directly, deliberately below the flow rather than inside it. Every drill-through into it
(Trace, an account row, a population) is unchanged.

**THE CONSOLIDATION SCREEN SAID "TOTAL ENTITIES 4" UNDER A SCOPE CHIP READING "612
ENTITIES".** The modelled book was being presented as the whole enterprise, which reads as a
four-entity company however carefully the rest of the surface is built. `csxPopulation()` is
the one derivation now: **612 total · 548 ready · 41 in progress · 23 blocked**, and it
reconciles by construction (`reconciles` is asserted from the same figures the screen prints).

**THE FOUR MODELLED ENTITIES ARE INSIDE THOSE TOTALS, NOT BESIDE THEM.** `CONS_POP_OTHER`
authors the counts for the entities NOT modelled in detail (548 / 41 / 19 = 608) and
`csxPopulation()` adds the modelled entities' OWN states, so 19 + 4 blocked = 23 and the list
beneath is arithmetic rather than a caption: *Highest-priority exceptions · 4 of 23 blocked
entities shown*. All four modelled entities are in fact blocked, which is exactly what a
consolidation control tower should have on screen — what was missing was the population they
are a subset of.

**THE AGGREGATES ARE AUTHORED, NOT SCALED.** This is the same device `ORG_NODES` already uses
("leaves carry an authored number, so 612 is a sum and not a claim"). Scaling four blocked
entities to 612 is the `RECON_SCALE` mistake and would have reported an enterprise in total
failure. Nothing is invented as a ROW: no fabricated 612-entity tree, and the entity table,
the hierarchy and the bridge composition still show only what is genuinely modelled.

Four other places stated the same number and now read the population: the Consolidation header
strip, the perimeter card and its entity table, the entity-to-group bridge card, and
`consolRun().entitiesReady`, which is what the Reporting Package's Regional / Consolidation
section quotes. Two figures stay deliberately scoped to the modelled book and say so on the
card — the **readiness score** (a weighted average over the six gates, which only the modelled
entities carry) and the **bridge's entity composition**, whose note states that the
612-entity population rolls into those reporting entities and that the bridge foots either
way, because Korvyn holds one governed amount per line.

**Nothing else changed.** No new dashboards, cards, tabs or workflows; no print / preview /
download controls; no CFO/CEO redesign; Financials still carries Statements · Consolidation ·
Reporting Package with the same three roles.

**Verified:** 189 view renders across 3 periods, 0 errors, 0 empty · 11 Financials
sub-surface combinations · 10 targeted confirmations pass in the product · 4/4 gates ·
FS-CIP **4,210.2** · chronology 0 · 548 + 41 + 23 = 612.

## 2026-09-04 — R7.1: Korvyn for Excel, the connected workspace foundation

**KORVYN OWNS GOVERNED FINANCIAL TRUTH. EXCEL IS A CONNECTED WORKSPACE.** Not Download to
Excel, not an export, not an attachment manager, and not a second financial database.

**NOTHING IN THIS MODULE STORES A BALANCE.** Every connected object RESOLVES through the same
services the web reads — `fsAmount()`, `rcInstance()`, `rcAcctRows()`, `rcActivityPopulation()`,
`consolBridge()`, `mrpSchedule()`. Remove the whole module and not one number in the product
moves. The canary is unchanged: **FS-CIP Jun 2026 = 4,210.2**, on both surfaces.

### It is its own module, not a feature of Accounting

A horizontal surface spanning every governed object, so it is a lens reached from the More
launcher exactly as Data Room and Data & Governance are — `xl`, two views: **Workspace**
(the task pane and the workbook) and **Connected workbooks** (the register).

### FOUR PRIMITIVES

| | |
|---|---|
| **INSERT** | put a governed object into a workbook, still connected |
| **REFRESH** | update only the connected region, never the workbook around it |
| **TRACE** | how this amount is built, and where it is used |
| **PUBLISH** | send completed work back as governed evidence |

### THE THREE OWNERSHIP MODELS ARE A FIELD, NOT A CONVENTION

`XL_MODES` — **OBJECT** (Korvyn owns values and structure), **WORKPAPER** (Korvyn owns the
source population, the user owns the analysis), **EVIDENCE** (published back). `mode` is
carried on every connected object and on every catalogue entry, which is what stops a connected
statement and an analytical workpaper being treated as the same thing.

### THE FINANCIAL CONTEXT IS CAPTURED, NEVER DEFAULTED

`xlContext()` reads `viewPeriod()`, `ENTCTX.scope`, `rcLens()` and `fcal()` — the same objects
the web uses. A workbook inserted from a lens carries THAT lens; there is no fall-back to
Corporate Consolidated, because a fall-back is exactly how a Germany Statutory workbook would
silently come back in USD under US GAAP.

### REFRESH: SIX STATES, AND THE DATA / STRUCTURE SPLIT IS THE WHOLE OF §12

**THE STATE IS DERIVED, NEVER STORED.** Two fingerprints are compared against what the governed
services say NOW — `xlStructureFp()` (object type, lens, scope, mapping, hierarchy, statement
version, column set, row count) and `xlDataFp()` (the values themselves).

- A **data change** replaces values in place; the workbook is untouched.
- A **STRUCTURE change** can add or remove ROWS, so it asks first. Refreshing underneath
  somebody's formulas without warning is the one thing §10 forbids.
- A **CERTIFIED period is PINNED**: `refreshPolicy` is `PINNED_AS_REPORTED` and a later mapping
  change does not rewrite it. As reported is the default and stays the default; a recast is an
  explicit request.
- **REFRESH AVAILABLE** is distinct from **SOURCE CHANGED** on purpose — "there may be
  something new" is not "a figure you are looking at has moved".
- **OFFLINE** keeps the last refreshed values visible and deletes nothing.

**EVERY SEEDED STATE IS DETECTED, NOT FLAGGED.** The seed sets no status field:

| State | Why it is genuinely true |
|---|---|
| Source changed | R6.2's May reclassification landed after the range was inserted, and May is June's opening — a real cascade |
| Structure changed | the stored fingerprint is the REAL May resolve; the June mapping split the capex accounts, so the shape moved |
| Refresh available | `lastRefreshAt` is older than the source `dataAsOf`, compared as instants |
| Certified · pinned | May 2026 is closed, read from `fcal()` |

**BOOT ORDER IS LOAD-BEARING AND THE CALL SITE SAYS SO.** `xlSeed()` runs immediately before
`mrpSeedHistory()`. The published workpaper captures its dependencies' fingerprints as they
stand; `mrpSeedHistory()` then posts the May placed-in-service reclassification. Reverse the two
lines and the artifact correctly reads Current, because nothing would have changed after it.
**One governed change now demonstrates three things** — R6's re-review detection, R6.2's package
republication, and this.

### LARGE POPULATIONS: THE WORKBOOK HOLDS THE QUERY, NOT THE ROWS

A CIP activity query resolves **3,128,400 rows** (`XL_POP_SCALE` states the enterprise multiple
once rather than sprinkling a big number through the UI). `xlInsert` refuses and returns the
count with five ways to proceed — summarise server-side (340 rows), narrow the query, sample
500 marked as never publishable, keep it as a connected query (0 rows in the workbook), or
generate a background extract. Excel is never handed a volume it cannot hold.

### TRACE: TWO QUESTIONS, AND THEY ARE DIFFERENT QUESTIONS

*Connected range → Financial line → Reconciliation groups → Source accounts → Entities → GL
population → ERP source*, and *Financials · Flux Review · Trending · Reconciliation ·
Management Reporting Package · Audit*. Every node routes into the governed object in Korvyn.
Technical ids are carried and not shown by default.

**THE FINANCIAL LINE IS RESOLVED BY OBJECT TYPE.** A reconciliation object carries a DEFINITION
id; taking it for a line id silently lost the accounting half of the trace — no source accounts,
no reconciliation groups. And `rcPopulation()` takes a definition OBJECT, not an id: passing the
id returned an empty account list, which dropped the source-account step. Both caught by
asserting the node NAMES, not by reading the chain.

### PUBLISH: EVIDENCE, AND ONLY EVIDENCE

`PublishedExcelArtifact` is `Object.freeze`n, versioned, and supersedes its predecessor with the
prior version retained. It carries `sourceDependencies`, `connectedObjectDependencies`,
`sourceFingerprints`, `structureFingerprints`, `mappingVersions`, `enrichmentVersions` and
`fxRateSets` — which is what makes staleness detectable later by comparison rather than by a
flag. `xlArtifactState()` never overwrites the workpaper; it reports that a reviewer should
look.

**`postsToErp:false` and `altersGovernedFigure:false` are FIELDS on the artifact**, not a
promise in prose. **NOTHING ANYWHERE POSTS AN ERP JOURNAL**, and Publish cannot alter a governed
figure — it references one.

### PERMISSIONS: THE SAME RESOLVER, NO SECOND SECURITY MODEL

`xlCanInsert()` asks `kCanUseLens(kAccess(), lensId, 'VIEW')` — R5.5's own resolver. A
spreadsheet connection is a different transport, not a different permission model. Verified
against the roster: A. Johnson (`RL-DE-STAT: NONE`) is refused Germany Statutory by name and
allowed Corporate; a read-only user may retrieve and may not publish. The actor is a parameter
so the refusal is testable and so a future "acting as" preview resolves identically.

**`setUserRole()` IS THE PROTOTYPE ROLE SWITCH AND DOES NOT MOVE `kActor()`.** Testing the gate
through it reports a false pass — the resolver always answered for M. Giri, who has VIEW on
every lens. Drive `resolveEffectiveAccess(userId)` for a real user instead.

### WEB / EXCEL CONTINUITY

**Open in Excel** on Financials (line panel), Reconciliations (roll-forward and activity
population), Flux Review and the Reporting Package's supporting schedules — one restrained
contextual action per governed object, never a button on every row. Verified round trip:
FS-CIP opens in Excel at 4,210.2 in the same context, and Trace returns to the same line on the
same statement in the same period. **There is no duplicate financial model.**

### The workbook canvas is not a spreadsheet application

It renders what a connected workbook IS: a bordered connected range with a tag and its state,
the user's own title, notes and formulas around it, sheet tabs, and a compact task pane. Nothing
edits a cell, evaluates a formula or owns a value. Excel columns have WIDTHS — a fixed table of
eight equal columns truncated every label in the connected range, which is the one thing on the
sheet that has to be readable.

### Traps

- **Never pass replacement text through the shell — FIFTH TIME.** A quoted heredoc ate `\\'`
  twice in this increment, once producing `onclick="rcExcel(''` and a parse failure. Write the
  splice script with the Write tool.
- **`\\u00b7` IN A SPLICE ANCHOR IS SEVEN LITERAL CHARACTERS.** Node parses `\\` to one
  backslash and leaves `u00b7` as text, so the anchor never matches. An anchor needs the real
  character; a REPLACEMENT keeps its escapes, because those land inside a JS literal.
- A prefix is not a namespace: every `.xl-*` name was greped before being declared, and every
  child class (`.k`, `.n`, `.s`, `.m`, `.h`, `.t`) is scoped to its parent — those are far too
  common to declare bare. The duplicate-class gate confirms 63/63 unchanged.

### Verified

**195 view renders** across 3 periods, 0 errors, 0 empty · **18 workbook × sheet × pane
combinations** · **all 16 acceptance tests in §40 pass, run in the product** · console clean ·
**4/4 gates** (chrome themes 10/10, content contrast, spacing ratchet unchanged at 1072/88, css
duplicates 63/63) · 0 clipped elements · dark mode holds · **FS-CIP 4,210.2 on both surfaces** ·
R6/R6.1/R6.2 intact (612-entity consolidation, 3 active packages, chronology 0).

### Completion pass — the entry points, so the surface is discoverable

R7.1 shipped the engine, the task pane and four contextual actions buried one level deep (a
line panel footer, a reconciliation tab footer). The architecture existed and **a user could
not find it**. Three entry points close that, and all three use primitives the product already
has rather than new chrome.

**THE PAGE-LEVEL ACTION LIVES IN THE ACTIONS TAB**, beside Export and Print — which is where
this product already put the page-level command cluster (2026-08-28: *"the Actions tab is what
the ellipsis was pretending to be"*). Not a header button and not a fourth toolbar. It is a
MENU rather than three buttons because the choice is statement / section / line.

**THE MENU IS DERIVED FROM THE PAGE, NEVER A FIXED LIST.** `xlOpenMenu()` reads the surface:
Financials offers the current statement always, and the selected section, line or entity
contribution only when something is selected; Consolidation offers the entity-to-group bridge;
Reconciliations offers the roll-forward and its activity population for the definition that is
open; Flux Review offers the comparison table; the Trial balance offers itself. **A row that
would open nothing is filtered out**, so the button itself does not render where it could only
refuse — the no-dead-controls rule, applied to a menu.

**THE ROW ACTION IS ABSENT AT REST.** An ellipsis on statement rows and on reconciliation rows,
revealed on row hover or keyboard focus, carrying three or four actions that are actually
different — Trace, Open in Excel, View detail; and on a reconciliation, Open reconciliation,
Open in Excel, Activity in Excel, Trace. A row menu that only repeated the row click would be
the clutter §3 rules out.

**`opacity:0`, NEVER `visibility:hidden`** — the latter takes the button out of the tab order
and silently removes the control from every keyboard user. That lesson is already recorded for
the Flux star gutter and it applies unchanged here. Verified: `opacity 0`, `visibility visible`,
`tabIndex >= 0`.

**The reconciliation row action renders only on a row that HAS a reconciliation.** A
financial-line roll-up row has no definition to open, so it carries no ellipsis — asserted, not
assumed (every rendered action's `data-pop` matches `rcrow:REC-*`).

**`.fsx-more` WAS ALREADY TAKEN**, by the Composition tab's "Open Account activity" wrapper.
The duplicate-class gate caught it on its first run after the rule was written, which is
exactly what that gate exists for; renamed `.fsx-rowact`. A prefix is not a namespace — fourth
time this has been recorded, first time a gate caught it before the browser did.

**Verified:** 195 view renders across 3 periods, 0 errors, 0 empty · 9 row menus open with
content · 18 workbook × sheet × pane combinations · **all 7 §14 acceptance criteria pass in the
product** · 4/4 gates · FS-CIP 4,210.2 · R6.2 intact. Opening from a reconciliation row carries
period, scope, lens, basis, definition and mapping version into the workbook (asserted on the
resulting connected object, not on the click).

### The entry point is a page-level button, not a tab of a collapsed band

The pass above put the only always-visible entry point inside the **Actions tab of the filter
band**, which starts folded. That is the right home for Export and Print — commands a user goes
looking for — and the wrong home for the entry point to a product surface nobody knows exists
yet. A first-time reader could not answer "how do I open this in Excel?" without opening two
things first.

**ONE COMPACT BUTTON, IN `glHead`, WHICH IS ONE EDIT FOR FIVE PAGES.** `glHead` is the page
header every ledger surface renders, so appending the action there is what stops five call
sites drifting apart. It sits beside Save view in the top-right controls, is `.btn-out` because
Save view is already the screen's one filled primary (rule 13), and renders only on the
surfaces that hold a governed object worth taking to Excel — Financials, Flux Review, Trending,
Reconciliations and the Trial balance. The Actions-tab row stays: the header button is
DISCOVERY, the Actions row is where the page's commands live, and they are not duplicates of
each other.

**THE MENU IS §4's THREE GROUPS** — Current view · Selected rows · Detailed population — and a
group appears only where the surface has one. Every row states what it RESOLVES TO rather than
naming a rule, because that is what a reader checks before taking a figure into a workbook:
*Balance Sheet · Jun 30, 2026 · Corporate Consolidated · US GAAP · USD*.

**THE COMPARISON WAS BEING SILENTLY REWRITTEN.** `FLUX_TABLE` derived its comparison as
`perAdd(period,-1)` — month-over-month, always. A QoQ or YoY review opened in Excel would have
come back MoM, which is exactly what "preserve the exact current view" forbids. The comparison
is captured at insert (`fxComparison()`), carried on the connected object as
`comparisonPeriodId` / `comparisonType`, and read back on every refresh, so the workbook cannot
drift off the review it came from. Verified: a QoQ balance-sheet review resolves columns
*Mar 2026 | Jun 2026*, not *May | Jun*.

**TWO CONNECTED RANGES ON ONE SHEET WERE OVERLAPPING.** Every ad-hoc insert went to A3, so a
second Open in Excel drew its rows through the first one's. `xlNextRange()` places a range
below what the sheet already holds, with a blank row between so two ranges never share an edge
— which is also what an add-in does rather than overwriting somebody's grid. Verified:
`A3..12` and `A16..67`, no overlap.

**Verified:** the button is visible without hovering on all five pages (width > 0, opacity 1,
visibility visible, `offsetParent` non-null — asserted, not eyeballed) · 195 view renders across
3 periods, 0 errors, 0 empty · the Reconciliations → Current view → Excel journey lands on the
worksheet with the task pane and Insert / Refresh / Trace / Publish, not a toast · the detailed
population still hits the size guard at 3,128,400 rows · 4/4 gates · FS-CIP 4,210.2 · R6.2
intact.

### Opening Excel is a navigation, so it uses the navigation the product already has

The Excel workspace could be reached and not left — a user who opened a QoQ balance-sheet
review in Excel had no way back to the review they came from except the browser's own Back,
which reinstates none of the statement, the comparison, the selected row or the scroll.

**R3.2 ALREADY BUILT THIS.** `NAVCTX` / `navGo` / `navReturn` is the product's
context-preserving navigation — an origin snapshots ITS OWN UI and hands over a `restore()`,
and the shell never reaches into a module's state. `xlOpenFrom()` routes through `navGo()`, so
the standard return strip appears on the destination and there is no second return mechanism.
Reconciliations already had `rcNavCtx()`; it is called, not duplicated.

**FOUR ORIGINS, EACH SNAPSHOTTING ITS OWN SURFACE.** Financials (`fnSub`, statement, selected
line, panel tab, fold state, and the consolidation and package sub-state), Flux Review
(statement, comparison, level, display, selected line, panel tab, drill, quick filter),
Trending (statement, range, selection, tab, drill) and the Trial balance. The period, the scope
and the reporting lens are global and go back through their own writers; every amount
re-derives on return.

**§4 — A DIRECT ENTRY INVENTS NO ORIGIN.** Opened from the More launcher there is nothing to
return to, so the workspace offers **← Back to Accounting** and says why. It renders only when
`NAVCTX` is absent, so a user never sees two return controls.

**And that guard was wrong on the first cut.** `navGo` sets `NAVCTX`, calls `dest()` — which
renders the workspace — and only THEN stamps `destTab`. A guard on `destTab==='xlwork'` is
therefore false on the first paint, so both the strip and the fallback appeared together
(observed, and visible in a screenshot before it was fixed). An unstamped context is one being
created for this destination right now.

**Verified:** all four origins show the correct label and exactly one control · the return
restores the exact state — a QoQ balance-sheet review with CIP selected on the Drivers tab at
group level comes back as `bs / qoq / FS-CIP / drv / group` · direct entry offers Back to
Accounting with no strip · the context is still one hop and does not become a breadcrumb chain
· 195 view renders across 3 periods, 0 errors, 0 empty · 18 workbook × sheet × pane
combinations · 4/4 gates · FS-CIP 4,210.2 · R6.2 intact.

### R7.1 deliberately stops here (§37)

No general controlled write-back. No Office add-in manifest, no OfficeJS, no real .xlsx
generation, no live Excel connection — this is the object model and the product surface. No AI
in Excel: `xlTrace`, `xlSize` and the connected-object context are the grounded objects a future
answer would consume, and nothing generates. **No ERP journal write-back exists and none is
reachable.**

### Open, and worth an owner's call

- **The workbook canvas is a representation, not a real spreadsheet.** Cell editing, formula
  evaluation and range selection by drag are all absent by design; if the prototype ever needs
  to demonstrate a user editing around a connected range, that is a decision to make explicitly
  rather than by drift.
- **`XL_POP_SCALE` (13,200) is the stated enterprise multiple over the modelled sample.** It is
  what makes the large-population protection real; a deployment reads the true count from the
  query engine.

## 2026-09-05 — R7.2: the connected workpaper lifecycle

R7.1 built the four primitives. R7.2 is the layer that makes the loop credible:

```
KORVYN WEB -> OPEN IN EXCEL -> CONNECTED OBJECT -> USER ANALYSIS -> REFRESH
-> SOURCE CHANGE ASSESSMENT -> PUBLISH -> GOVERNED ARTIFACT
-> REVIEW / SUPPORT / REPORTING -> CERTIFICATION -> AUDIT HISTORY
```

Excel stays the flexible work surface; Korvyn stays authoritative for the source data, the
context, the permissions, the versions, the lineage, the evidence relationships and the
certification state. **NOTHING HERE POSTS AN ERP JOURNAL, WRITES BACK A GOVERNED FIGURE, OR
GENERATES ANYTHING.** The canary is unmoved: FS-CIP Jun 2026 = 4,210.2.

### THE OWNERSHIP BOUNDARY IS COLUMNS, AND IT IS ON SCREEN

`xlRegions()` states it and the ribbon shows it beside the selected object — **A:E Korvyn ·
G:M yours**. Refresh replaces the connected columns and nothing else; the vendor-share and
capitalisable-% formulas beside the range survive it (asserted by counting formulas in the
rendered sheet before and after, not by inspection).

### §16 — THE WORKPAPER IS VENDOR x PROJECT x MONTH

The summary is aggregated from the SAME transaction population R2 resolves (`rcTxPool`), so
the workbook and the Activity Detail canvas cannot disagree, and Excel never gets a second
query engine. The population — 3,128,400 rows — stays server-side; the workbook holds the
summary. Munters Cooling, Vertiv Systems, Turner Construction, ABB Switchgear, Schneider
Electric against Ashburn Hall C, Dublin DUB-01, Singapore SG-02 and the rest.

### THE DELTA IS A COMPARISON, NOT AN ASSERTION

`xlSnapshot()` captures the measurable facts behind a range at insert and at every refresh —
row count, transaction count, net, vendors, projects, and for a small result the VALUES keyed
by row label. `xlDelta()` compares them, so §4's preview reads *"5 lines changed · Beginning
balance −0.078 · GL activity −1.164 · Mapping / classification change −0.856"* rather than
"something moved".

**SUMMING THE LAST COLUMN HID OFFSETTING MOVEMENTS.** A roll-forward whose beginning fell and
whose activity rose by the same amount reported no change while its data fingerprint had
plainly moved. The per-row comparison is what makes the preview honest, and the materiality
bar is measured against the GROSS movement rather than the net for the same reason.

### §13 — FIVE IMPACT LEVELS, READ FROM WHAT ALREADY EXISTS

`NONE · IMMATERIAL · REVIEW · MATERIAL · STRUCTURAL`. STRUCTURAL is decided by the structure
fingerprint; MATERIAL by the flux review's own materiality policy (`matAbsThr`), so Excel and
the review surface cannot disagree about what material means. No new rules engine.

### §5 — STRUCTURE CHANGE STATES WHAT IT WOULD DO TO FORMULAS

`xlStructureDiff()` answers in rows and versions — *"2 rows added · formulas below the
connected range would move by 2 rows"*, *"mapping 2026.05.3 → 2026.06.4"* — with
**Refresh safely** and **Keep current version**. Keeping leaves the range exactly as it is and
the object stays marked, so the difference is never lost.

### §9 — PUBLISH PREVIEW: KORVYN ALREADY KNOWS EVERY FIELD

Workbook, purpose, target, period, scope, lens, basis, source state, connected dependencies
and version — all derived. The user picks a purpose and confirms. The TARGET is derived from
the connected objects rather than typed: a reconciliation workbook attaches to its
reconciliation, a schedule workbook to its schedule.

### §19 / §20 — ONE ARTIFACT STATE, READ WHEREVER IT IS CONSUMED

The Reconciliation Support tab and the Reporting Package's supporting schedules both read
`xlArtifactState()` — the same comparison the workbook shows. Neither keeps a support status
of its own, which is exactly what "do not duplicate support status separately" asks for: a
package cannot report a schedule as current while the workpaper behind it is stale.

### §21 — AUDIT LINEAGE WITHOUT A DUPLICATE COPY

Connected workbooks carries an audit-lineage table: which artifact, what it supports, the
period, the workbook version, the source fingerprints at publication, the mapping versions and
the publisher, with the state now. An auditor reads the artifact's own dependencies and follows
them back; no audit copy of the source data exists.

### §18 — RETURN TO THE WORKBOOK, NOT TO A LANDING PAGE

`xlOpenArtifact()` restores the workbook, the sheet the object sits on and the connected object
itself, and carries the origin through `navGo` so the user can come back.

### ONE SPEC BUILDER, AND THE SAME OMISSION COST THREE ROUNDS

`xlSpecOf(o)` is the only place a resolve spec is built. Hand-rolled copies in `xlRefreshState`,
`xlTrace`, `xlArtifactState` and `xlSheet` each dropped `strategy`, so a summarised workpaper
resolved the ACCOUNT TIE-OUT instead of its summary — which made every one of them report a
structure change that had not happened, and drew the wrong table on the sheet. **There is now
no other place that builds a spec; do not add one.**

### Also fixed

**Insert and refresh disagreed about the same range** — insert recorded the size guard's
ESTIMATE (340) and refresh the resolved count (47). The estimate is what is offered before the
insert; once the range exists the resolved count is the truth, and it is kept as
`estimatedRows` rather than thrown away.

**§23 — permissions are enforced on refresh, not only on insert.** Values already in a workbook
stay visible; retrieving NEW source data resolves the CURRENT access, so a lens revoked after
an insert cannot be re-read through an old workbook.

**Verified:** all 15 acceptance tests in §27 pass, run in the product · 195 view renders across
3 periods, 0 errors, 0 empty · 24 workbook × sheet × pane combinations · the three previews
render · 4/4 gates (the spacing ratchet caught a 2px padding and it went onto the scale) ·
FS-CIP 4,210.2 · 612 entities · chronology 0 · R6.2 intact.

### The single accountant workflow — one reconciliation, three controls

> "I opened my CIP reconciliation in Excel, did my analysis, refreshed the numbers, and
> published the workpaper back to Korvyn."

That sentence is the whole specification, and it is the acceptance test. A workbook opened FOR
ONE RECONCILIATION runs in a focused mode: **Back to reconciliation · Refresh · Publish to
Korvyn**, and nothing else.

**HIDDEN, NOT REMOVED.** Insert, Trace, the object picker, the query strategies, the pane tabs
and the workbook switcher all stand down while `xlFocus` is set; the general workspace is
byte-for-byte unchanged and still opens from the module itself. A mode is a reading of the same
objects, never a second implementation — asserted both ways in the same run.

**TWO SHEETS, TWO OWNERS, AND THAT IS THE DEMONSTRATION.** Sheet 1 *Reconciliation* is the
governed roll-forward, connected and not typeable. Sheet 2 *Analysis* is ORDINARY WORKBOOK
CONTENT — authored cells and real formulas (`=SUM`, `=SUMIF`, `='Reconciliation'!B6-C13`),
not a connected object. Vendor · Project · June activity · Classification · My adjustment ·
Notes, over the real vendors the population carries. Refresh replaces Sheet 1's range and never
touches Sheet 2, verified by counting formulas in the rendered sheet before and after.

**THE SOURCE UPDATE IS REAL, AND REVERSIBLE.** "Simulate a source posting" posts a genuine
+$14.2M ERP entry through R6's own `rcPostClosePost`, so the refresh that follows is a real
refresh: FS-CIP moves 4,210.2 → 4,224.4, the connected object detects it by comparison, and the
preview names the lines that moved. Clicking again withdraws it. **Nothing is seeded, so the
product still opens with the canary at 4,210.2** — a demonstration must not leave the book
changed.

**ONE PUBLISH DESTINATION.** The workbook is for one reconciliation, so the target is derived
rather than chosen: *Electrical CIP Analysis.xlsx · Jun 2026 · Electrical CIP · Reconciliation
support · v1*. It lands under that reconciliation's Support tab, reading the same
`xlArtifactState()` the workbook shows.

**Two things the focused mode fixed that were wrong generally.** The FILTERS band rendered on
the Excel workspace, where Scope / Period / Basis change nothing — a connected object carries
the context it was inserted with, so those were dead controls on every Excel screen, not only
this one. And `table-layout:fixed` only honours a colgroup when the TABLE has a width; without
one Chrome fell back to content sizing and a 104px column computed at 469px, pushing the
analysis amounts out of the pane.

**THE BACK ACTION WAS THREE CONTROLS, WHICH IS WHY IT WENT SOMEWHERE ELSE.** Reported: the back
arrow returned to Current Period. Measured with the focused workbook open, three back controls
were on screen at once — the shell's history chevron (`navBack()`, a STACK, so where it lands
depends on how you arrived), the navigation strip (`navReturn()`), and the ribbon's own
(`xlFocusExit()`). Only the last two were origin-aware. "Where do I go back?" is exactly what
that produces.

In the focused workflow the ribbon carries the ONLY one: `paintNavRet()` stands the strip down,
`navBack()` delegates to `xlFocusExit()` rather than popping a stack, and `#backBtn` is hidden.
And it names the RECONCILIATION rather than the module — `rcNavCtx` already carried the
definition name and the override was throwing it away for "Reconciliations".

**THE HEADER IS THE WHOLE CHROME** (§11):

```
← Back to Electrical CIP   Electrical CIP — Jun 2026   ● Korvyn connected   Refresh   Publish
```

The task pane is gone in this mode, the workbook takes the full width, the page header and the
FILTERS band stand down. Insert, Trace, the object catalogue, the search, the workbook picker
and History are hidden — the general workspace still has all of them and is unchanged, asserted
in the same run.

**Three layout defects fixed, each measured rather than eyeballed.** The label column was
150px against figures that read "Calculated ending balance · Jun 30, 2026" — a connected sheet
now sizes its first column at 250px and its figure columns at 150px, the way Excel would. The
`.grow` spacer is `flex:1`, so it consumed the remaining width and pushed the last control onto
a second line even though 790px of content fitted an 858px box. And the SIMULATION control left
the header for the sheet-tab row: it is scaffolding for the demonstration, not a step in the
workflow, and it was the 121px that made the header not fit.

**Verified end to end:** all 11 steps pass in the product · the return restores
`glrecon · REC-CIP-ELECTRICAL · tab roll · Jun 2026 · Corporate Consolidated · US_GAAP` ·
exactly one back control on screen · 195 view renders across 3 periods, 0 errors, 0 empty ·
24 workbook × sheet × pane combinations in the general workspace, which still shows
Insert / Refresh / Trace / Publish · 4/4 gates · FS-CIP 4,210.2 and `RC_POSTCLOSE` empty on a
fresh load.

**Verified:** all 11 steps of the workflow pass in the product, end to end · 195 view renders
across 3 periods, 0 errors, 0 empty · 24 workbook × sheet × pane combinations · 4/4 gates ·
FS-CIP 4,210.2 and `RC_POSTCLOSE` empty on a fresh load · R7.1, R7.2 and R6.2 intact.

### Deliberately not built

Broad controlled write-back · ERP posting · Excel AI of any kind · a graph visualisation (§7 is
an ANSWER — `xlDependencies().answer` — not a picture) · generic export/print polish (§25).

## 2026-09-05 — the single workflow reads like an accountant's workpaper

Owner's brief. Not new architecture: the connected-object model, the four primitives, the
publish lifecycle and the general workspace are all where R7.1/R7.2 left them. What changed is
that the workbook now reads the way the work is actually done.

### THREE TABS, EACH NAMED FOR THE ACCOUNTING

**Reconciliation · Analysis · GL Detail.** Deliberately not "Schedule" or "Pivot" — a sheet tab
in a close workpaper names the accounting, and a pivot is something you BUILD on the Analysis
sheet, not a place you go. Korvyn owns sheets 1 and 3; the accountant owns sheet 2 and refresh
never touches it.

### A SHEET CAN HOLD BOTH A CONNECTED RANGE AND AUTHORED CELLS

`xlSheet()` was either/or — an authored sheet OR a connected one. That is what a workpaper is
NOT: Korvyn's roll-forward with the preparer's header above it and their tie-out beneath. It
forced the header to be faked inside the code that also owned the connected block, which is how
the auto-injected tie-out came to read `=B12-B13` — the trial balance less the difference, two
rows off, in the one formula on the sheet whose job is to prove the reconciliation.

The Reconciliation sheet now states what an accountant reads before the first figure:

```
1  Electrical CIP — reconciliation workpaper
2  Consolidated Group · Jun 2026 · US GAAP · USD in millions
3  Prepared by Mitra Giri · W/P ref REC-CIP-ELECTRICAL-2026-06
4  Source: Korvyn governed reconciliation · connected and refreshable
6  Roll-forward component             Ref     Jun 2026 (USDm)
7    Beginning balance · May 31, 2026  B-1              57.1
8    GL activity · Jun 2026            GL-1             29.3
…
15   Difference                                          0.0
17 Tie-out
18   Calculated ending less trial balance      =C13-C14
19   Tolerance (governed policy)                        0.05
20   Conclusion             =IF(ABS(C18)<=C19,"Tied","Investigate")
```

**WHERE THE BLOCK SITS IS ONE NUMBER.** `XL_RECON_R0` / `XL_RECON_ROW` — the insert range, the
header, the tie-out and the Analysis sheet's cross-sheet formulas all address the same rows.
Four copies of `6` is how a tie ends up pointing at the beginning balance, which it did.

**THE REF COLUMN IS LOAD-BEARING, NOT DECORATION.** It is what supporting detail is tied to on
paper and it is what the drill is addressed by, so the reference on the face of the workpaper
and the sheet it opens cannot name different things. **There is no row-count column** — a
component is one balance, not a population.

**Accounting format.** `xlCell(v,dp)` writes a credit in parentheses and groups its thousands,
at a decimal place the resolved object states — a roll-forward to the hundred thousand, a GL
line to the thousand. Subtotal rows take a rule (`meta.rule`), not a bold. And an authored cell
is NOT formatted by the grid, so the Analysis sheet formats at build time through the same
function — its figures came through as `0.73 / 0.604 / -0.031`, three conventions in one column
and a minus sign in a workpaper.

Excel lets a label spill into empty neighbouring cells; `.u-t` / `.u-n` do too, or a fixed grid
clips its own workpaper header at the first column boundary.

### GL DETAIL — AND THE ROWS MUST SUM TO THE AMOUNT THAT WAS DRILLED

That is the whole contract of the tab. `foots` is COMPUTED in `xlGlDetail()` and stated on the
band, so it is measured on every drill rather than asserted once. A reviewer who cannot foot the
detail to the face of the workpaper has been given a list, not support.

**Two shapes, because two kinds of component are being supported.** GL activity is a TRANSACTION
population and resolves the governed rows R2 already models. Every other component — beginning,
classification change, FX translation, eliminations, reporting adjustment, trial balance — is a
BALANCE or a bridge, and its detail is the source-account schedule, which foots the same way.
**Inventing transactions for an FX effect derived from balances and rates would be fabricating a
journal that does not exist**, which is the one thing this module refuses everywhere else; the
band states the component's own basis instead.

Verified: all seven components foot.

**SIXTEEN GOVERNED FIELDS, NAMED ONCE** (`XL_GL_FIELDS`) — posting date · entity · GL account ·
account name · journal · line · document · vendor · project · type · memo · debit · credit ·
currency · amount · ERP source. The sheet, the column widths and the ERP link all read that one
list. A nil debit is blank, not `0.000`.

**A GL EXTRACT IS CHRONOLOGICAL.** Sorted by size the first screen was four journals and a
capitalised-interest entry — every one correctly carrying no vendor and no document, so a tab
called GL Detail opened on two empty columns. Posting date, then size within the day.

**THE DEEP LINK EXISTS ONLY WHERE THE INSTANCE PUBLISHES ONE**, which is R2's rule and is
unchanged: 200 of the 237 rows offer **Open in NetSuite**; the 37 JD Edwards rows state
*"Source reference · JD Edwards Legacy North America · no deep link published"* and offer no
button. Nothing fabricates a URL.

**Sixteen columns scroll, so the row numbers freeze** (`position:sticky` on `.xl-rn`). A ledger
read without them is a wall of figures nobody can cite a line of.

### THE SIZE GUARD HAD TO BE WHERE THE DRILL IS

**Widening the query to the whole group set the state and showed nothing at all** — the guard
renders in `xlPaneSize()`, which lives in the task pane, and this workflow hides the task pane.
`xlFocusSize()` takes the sheet's place while it is open, on the same discipline as the drill
panes, rather than becoming a second dialog system.

**AND A STRATEGY CHOSEN AT THE GUARD HAS TO CHANGE WHAT THE SHEET HOLDS**, or the guard is a
dialog that congratulates itself. Summarise aggregates to 47 vendor × project × month rows,
sample truncates and marks itself *not publishable as support*, and a connected query loads
**no rows at all** — the workbook holds the definition, which is the whole argument of §18.
Nothing fabricates a group-wide row: Korvyn resolves the population it models, and the band
states 3,128,400 as the QUERY's size and, separately, what the sheet is holding.

### THE ANALYSIS SHEET IS A WORKING SCHEDULE, NOT A LIST

Ten vendors × project with a period-over-period variance, a Var %, a Review flag against the
preparer's own scrutiny threshold, an XLOOKUP into the GL Detail sheet, an adjustment column and
notes; then the two thresholds named for whose they are — **Governed tolerance (Korvyn policy)**
and **My scrutiny threshold** — three ties, and two SUMIFS pivots by classification and by
project. Every formula is real and cross-sheet; nothing on it is a connected object.

**The ties point at the right rows** and are the reason `XL_RECON_ROW` exists. The GL Detail
total row MOVES with the drill, so the third tie is a `SUMIFS` over the column rather than a
cell reference that goes stale the moment a reviewer looks at a different component.

### OWNERSHIP IS TWO MARKS, NOT A SENTENCE

`[KORVYN] A:C roll-forward   [YOURS] header · tie-out`, and on the Analysis sheet
`[YOURS] Every cell on this sheet is yours. Refresh never touches it.` A sentence wrapped the
band onto a second row — 77px of chrome above the workpaper it describes; two marks say it in a
quarter of the width and the band is one line.

### THE BACK CONTROL — the third report of this, and the path that was still open

`xlOpenArtifact()` did not set `xlFocus`. So §16's own route — clicking the published support
item on the reconciliation — reopened the workbook in the GENERAL workspace, where the shell's
history chevron, the navigation strip and the Insert/Trace ribbon all come back. **The chevron
pops a STACK**, so where it lands depends on how you arrived, which is exactly the reported
"back goes to Accounting / Current Period".

**THE MODE IS A PROPERTY OF WHAT THE WORKBOOK IS FOR, not of how the user arrived.**
`xlFocusOf(wbId)` derives it from the workbook's own id and its connected object's period, and
every path that opens a workbook reads it. Verified on all three: the reconciliation panel's
Open in Excel, the page-level menu, and the published support item — one back control on screen
in each, and the return restores the reconciliation with the tab the user left from (`roll`,
`sum`, `sup` respectively).

### Verified

**21/21 acceptance checks pass, run in the product** · 204 view renders across 3 periods, 0
errors (the 12 "empty" are the three lens-scoped alias keys and the deliberately unreachable
`consol` view, unchanged) · console clean on a fresh load · **4/4 gates** (chrome themes 10/10,
content contrast, spacing ratchet unchanged at 1072/88, css duplicates 63/63) · 0 clipped
elements across all three sheets · **FS-CIP Jun 2026 = 4,210.2** · `rcChronologyCheck()` = 0 ·
`RC_POSTCLOSE` empty on a fresh load · the general workspace still renders Insert / Refresh /
Trace / Publish with its task pane across 11 workbook × sheet combinations.

### Not done, deliberately

> **Superseded 2026-09-11** — a connected range now holds its last refreshed values; see the
> block below. The owner's brief made the call (§14: "After Refresh: GL Activity updates").

**A connected range still resolves live rather than holding its last refreshed values.** So the
figure moves the moment a source posting lands and Refresh confirms a change the sheet has
already shown. That is R7.1 behaviour, it is what makes the canvas a representation rather than
a spreadsheet, and changing it is an architecture decision rather than a UX fix — worth an
owner's call. Everything else stands: no write-back, no Excel AI, no ERP posting, no second
system of record.

## 2026-09-11 — the single workflow, gaps closed against the brief

> **Superseded the same day by the EXCEL WORKFLOW RESET below.** The browser workbook, its
> formula engine (`xlCalc`), formula bar and cell editing were REMOVED. Held values
> (`o.held`/`xlHeld`), posting-as-a-GL-line in `rcTxPool`, the transaction-population structure
> fingerprint and the by-line roll-forward delta all survive and are still load-bearing.

The brief's work was committed (`f6ec8fd`) but never pushed, so it looked lost. Walking it step by
step against the brief found it incomplete, and several gaps were on the brief's own main path.

**THE MOST NATURAL ENTRY WAS THE BROKEN ONE.** The Roll-forward tab's **Open in Excel →**
(`rcExcel`) and the page menu's *Detailed population* row (`rcExcelActivity`) still called
`xlOpenFrom`, which is the general workspace. They opened an ad hoc workbook with Insert, Trace
and the catalogue, with the roll-forward appended under balance sheets already on the sheet.
Both now delegate to `xlOpenRecon`. The activity entry lands on the GL Detail sheet
(`xlOpenRecon(defId, ev, sheetName)`). The workbook is **`Electrical CIP Analysis.xlsx`**.

**A CONNECTED RANGE HOLDS WHAT IT HELD (`o.held`, `xlHeld()`).** It is set by `xlInsert`,
`xlRefresh` and `xlReindex`, and read by the sheet, both bands and the formula engine.
Fingerprints, the state and the delta still compare against the live resolution. An object with
nothing held falls back to live, exactly as before, and all four seeded states still detect.

**THE POSTING NAMES ITS ACCOUNT.** `xlSimulate` passed no `sourceAccountId`, so
`rcPostCloseByAccount` skipped it and the $14.2M was spread across CIP by weight: Electrical
moved 2.4. It now lands on the definition's own 15010, and activity, ending and TB each move 14.2.
**`rcTxPool` appends a post-close posting as its own GL line** (`postClose:true`). It generates the
other lines to the target *less* the postings, so the population still foots, now 238 lines, and
the band names the journal. `rcPostClosePost` now carries `vendorName` / `txType`.

**A NEW TRANSACTION IS A DATA CHANGE.** `xlStructureFp` counted rows for a transaction population,
so one posting turned GL Detail "Structure changed" and the workbook refresh was refused for it.
A roll-forward's delta is also stated by line ("GL activity +$14.2M"). Summing its column counted
one posting three times ("+$42.6M net activity").

**ONE REFRESH FOR THE WORKBOOK** in focused mode: every connected range, one preview (the
roll-forward's, with *Also refreshed: GL activity · 237 → 238 lines*), and a one-line confirmation
(`xlDoneLine`) stating the before and after. **The dialogs render at the top of the workbook**
in focused mode. Appended after the shell, they opened below the fold. Publish is the brief's
four rows plus Publish, and afterwards **View in Electrical CIP › Support**. `RECON_SUPPORT`
reads *Supporting analysis*, and the Support row states the period.

**THE WORKBOOK CALCULATES (`xlCalc`, `xlShow`).** Formula cells printed their own text, so
"Analysis formulas recalculate" could not be seen. A deliberately small evaluator covers exactly
the functions these formulas use: SUM, SUMIFS, COUNTIF(S), IF, IFERROR, ABS, XLOOKUP, arithmetic,
comparison, cross-sheet and whole-column refs. It evaluates over what the sheets HOLD, so a result
moves on Refresh and not before. **It is not a spreadsheet engine**; nothing edits a cell. A
**formula bar** (`xlFxBar`) shows your cell's formula, or *Korvyn connected · read-only* for a
connected value. That is the §3 ownership cue, and it is a subtle one.

**Workpaper type.** The grid defaulted every cell to the figure face, so connected labels were
monospace. Words are sans now; amounts, dates and IDs keep mono (`.xid`, driven by `mono` on the
resolved object). Subtotal rows take `--fw-medium` over a `--muted` rule (rule 10).

**GL Detail carries 19 fields**: separate transaction, functional and reporting currency, plus an
ERP reference. **The Analysis sheet addresses that layout by column letter** (H vendor, J type,
N net amount, R ERP source). Reorder `XL_GL_FIELDS` and those formulas move with it. The
preparer's judgement (classification, note) is keyed by **vendor**, not by row position. The
review flag is materiality, June activity against the 0.50 threshold, not the variance, which
flagged every line in a month the population grew. A line with no prior activity reads **New**.
Percentages do not go through `xlCell`, which reads anything ≥ 1,000 as billions (`1.658B%`).

**Verified:** all 12 steps of the brief's §17 walked in the product · 204/204 view renders across
Jun / Mar / Dec · console clean · 4/4 gates (baselines unchanged: 1072/88, 63) · FS-CIP 4,210.2
on a fresh load and after withdrawing the simulated posting · chronology 0 · 0 clipped elements
on all three sheets · every back path (Roll-forward, Activity, Support item) returns to the
Jun 2026 Electrical CIP reconciliation on the tab it left from.

**A tooling note.** With the viewport emulated at 1440×900, the Browser pane served stale
frames. The DOM had scrolled and changed, and the screenshot had not. `resize_window` with
`preset: desktop` fixed it. Trust the DOM over the picture.

## 2026-09-11 (later) — Account Recs → Excel, consolidated: the workbook belongs to the reconciliation

> **Superseded the same day by the EXCEL WORKFLOW RESET below.** Still true: the workbook opens
> inside Accounting (`xlFocusShow`), Reconciliations stays lit, the generic workspace never
> shows a reconciliation's workbook, and Return lands on the originating reconciliation and tab.
> Removed: the four browser sheets, cell editing, the gridless workpaper sheet and the band.

Owner's consolidated brief. It was not about new features. It fixed the same workflow so it
reads as an accountant's workpaper and never as the generic Korvyn for Excel surface.
**Supersedes the earlier block's workbook name and tab set.** It is **`Electrical CIP
Reconciliation.xlsx`** again, with four tabs.

**THE WORKBOOK OPENS INSIDE ACCOUNTING (`xlFocusShow`).** It used to `pickLens('xl')`, so the
first things on screen were the Excel module's rail (Workspace · Connected workbooks) and its
title ("Korvyn for Excel · Excel as a connected workspace"). It stays in the ledger lens now.
`pickTab` does not require the tab to be in the lens. **Reconciliations stays lit in the rail**
(`RT` in the rail painter), the title row states the workbook name, and the crumb reads
*Accounting · Reconciliations › Electrical CIP · Jun 2026 · connected Excel workpaper*.
`gfBarHidden` keys on `TAB==='xlwork'` as well as the lens, or the filter band returns.
`body.xl-focus` is set in `paintTopbar` on every paint. Toggled only by the Excel renderer, it
outlived the workbook and hid the shell's back chevron on the page Back returned to.

**THE GENERIC WORKSPACE NEVER SHOWS A RECONCILIATION'S WORKBOOK.** After Back, the focused
workbook stayed `xlWb`, so opening Korvyn for Excel from the launcher showed it in generic
chrome: Insert, the Connected/History pane, the picker, "Opened directly — no originating
surface". That is where "lands in a generic workspace" and "workbook context unclear" came
from. Entering the `xl` lens now leaves focus mode. A focused workbook is never the generic
current book, and it is excluded from the picker. `xlOpenBook` opens one in focus mode from
the register.

**OPEN IN EXCEL = THE WHOLE WORKPAPER (§18).** On Reconciliations the header button opens the
selected reconciliation's workpaper directly, with no menu. It isn't drawn with nothing
selected, and the "Open Korvyn for Excel" and "Detailed population" rows are not offered
there. Every entry lands on Roll-forward, including `rcExcelActivity`. Drill-down is an act
*inside* the workpaper.

**FOUR SHEETS, EACH WITH `owner`** (`korvyn` | `user`): Roll-forward · GL Detail · Analysis ·
Notes. The band reads `owner`: *Korvyn · connected — refresh maintains this sheet*, *Your
analysis* or *Yours — refresh never overwrites this sheet*. The Analysis ties address
`'Roll-forward'!`. `XL_RECON_R0` is 8: five title lines (name · period · lens · basis · USD
millions), a prepared-by line, then the roll-forward alone. **`wp:1` renders a sheet
gridless**: a rule under the heads, a rule above each subtotal, bold trial balance
(`meta.strong`), a double rule under the difference (`meta.dbl`), a 1px edge on Korvyn's range,
and no range-wide selection tint. The roll-forward's amount column is headed by the period.
The unit is in the title block.

**YOUR SHEETS ARE EDITABLE (`xlEdit`, `xlEditCommit`).** Double-click, Enter/F2, or just type.
A value starting with "=" is a formula `xlCalc` evaluates. Edits are marked `mine:1`, so the
refresh confirmation can say *"4 cells you edited, your formulas and notes untouched"*. Korvyn
cells carry `data-ro`, and typing on one says it is connected and read-only. The keydown
listener is **capture-phase with stopPropagation**, or a keystroke meant for a cell also fires
an app shortcut.

**SOURCE CHANGED, SUMMARISED BEFORE REFRESH (`xlSourceLine`, §15).** It reads *1 new posting ·
+$1.2M impact · GL activity / Ending balance / Trial balance affected · Review and refresh*.
Postings are measured as held GL lines vs live, and lines as the held roll-forward vs live. It
**always renders**; an older message must never hide a changed source. The simulated posting is
the brief's **$1.2M** (`XL_SIM_AMT`). Our governed GL activity is 29.3, so it goes to 30.5 (the
brief's 30.5 → 31.7 figures are illustrative).

**Also:** Open in NetSuite is a simulated action that states the journal and the system. It
was an anchor to an example domain. The publish dialog shows Workbook · Reconciliation · Period ·
Purpose (*Reconciliation supporting workpaper*) · **Source status**. Drilling to the component
already on GL Detail just switches sheet; re-resolving it silently refreshed the population.
A lost navigation context still returns to the reconciliation, in its period, on the tab it
was opened from (`xlFocus.rcTab`). The header stacks *Corporate Consolidated · US GAAP · USD*
under the title, so Refresh and Publish stay on one line with the rail present.

**Not built:** the optional ending-balance composition (§7). It would need a new connected
object type, and the brief rules out new Excel features.

**Verified:** the brief's 14-step flow end to end, through real clicks and keystrokes · Back
restores the tab, the selected reconciliation, the quick-view filter and the scroll (178 → 178) ·
204/204 view renders across three periods · console clean · 4/4 gates (baselines unchanged) ·
FS-CIP 4,210.2 · chronology 0 · all four seeded general-workspace states still detect · 0
clipped elements on all four sheets.

## 2026-09-11 (reset) — Account Reconciliations → Excel: Korvyn web does not recreate Excel

Owner's product decision. **Serious analysis belongs in Microsoft Excel (desktop or Excel for
the web) with the Korvyn add-in.** The web shows the reconciliation, its governed data, the
roll-forward, GL drill-down and downloads, source status, the launch into Excel, and what the
add-in holds. **There is no browser spreadsheet for this workflow and there must not be one**:
no grid, formula engine, cell editing, or Analysis sheet pretending to be Excel. The previous
two blocks built one and it was removed.

**THE WEB RECONCILIATION.**
- **Open in Excel is in the reconciliation panel's own header** (`.rcx-xlbtn`), one click from
  any tab. It is not in the page header (the same action twice) and not at the foot of a tab.
- **The Roll-forward is the accounting equation** (`rcRollTab`, `.rcx-eq`): an operator column,
  and every component on its own line even when nil. There are **no reference codes** (B-1,
  GL-1 …) and no Components table of raw enums; each line carries its action instead. *View
  prior balance* opens the tie-out, *View GL detail* the transactions, *View mapping impact* the
  population, *View FX detail* / *View elimination detail* the existing drills, *View adjustment
  support* the governed adjustment. Support attachments sit below the equation, not inside it.
- **The Activity tab is GL Detail**: *View GL detail*, *Download Excel*, *Download CSV*.
  `rcOpenGL(defId, tab)` opens the canvas on a tab, and Back returns to the reconciliation tab
  it came from (`rcActFrom`).
- **The transaction grid's default columns are the brief's**: Journal line, Debit, Credit,
  Currency, ERP source and ERP reference are no longer behind *More columns*.
- **The CSV carries the manifest**: a manifest block, a blank line, then the table, as the
  Excel file already did. A downloaded population must still say what it is and what it sums
  to. Verified: 237 rows, 34 columns each, summing to 29.3.
- **ERP links are a simulated action** (`rcErpBtn` / `rcErpOpen`). They were real anchors to
  an example domain, a link to a site that doesn't exist. Values travel as data attributes.

**OPEN IN EXCEL → LAUNCH → THE ADD-IN.** `xlOpenRecon` raises a launch dialog
(`#xlLaunch`, a true overlay: scrim plus `--shadow-lg`, Escape closes it). It lists the
workbook, the connected objects (roll-forward · GL activity population · reconciliation context)
and the last submitted version. `xlLaunchGo` builds the workbook's Korvyn content (**two
connected objects, nothing else**; the rest of the file is Excel's and isn't modelled) and hands
off through `navGo`. The view (`xlAddinView`) is a description of the workbook — its connected
Roll-forward as held, the GL Detail count, "your sheets are Excel's" — beside **the add-in's task
pane** (`xlAddinPane`): context, Status/Source, **Refresh · Trace · Submit Workpaper · Return to
Electrical CIP**, and the workpaper versions. Source changed, the refresh preview, submit and
trace all render **inside the pane**. The ERP-posting simulation is labelled a prototype control
and sits outside it.

**SUBMIT WORKPAPER, NOT PUBLISH**, with §16's rows. **Versions are immutable**: when the source
moves after submission v1 reads *Review required*, a refresh plus submit makes v2 *Current*, and
v1 is *Superseded* and kept. The Support row speaks the same words ("submitted", "Replaced by v2
· kept exactly as submitted").

**`rcM`, not `xlCell`, in the add-in.** The two formatters round a half differently (611.65 →
611.6 vs 611.7). The web roll-forward uses `rcM`, and with it the printed equation foots, so the
add-in matches the page it came from. **Never escape `rcM` output**: it returns HTML, and
escaping printed a literal `&mdash;`.

**Still open, for the owner.** The generic Korvyn for Excel module (the More launcher, and Open
in Excel on Financials / Flux Review / Trending / the Trial balance) still renders the R7.1
browser workbook with Insert and a grid. This reset was scoped to Account Reconciliations;
retiring that surface the same way is a product call.

**Verified:** the §20 flow end to end through real clicks · 204/204 view renders across three
periods · 228/228 reconciliation panel tabs (38 × 6) · console clean · 4/4 gates (the
duplicate-class gate caught a double-declared `.xa-msg`; baselines unchanged) · FS-CIP 4,210.2 ·
chronology 0 · the generic workspace's four seeded states still detect.

## 2026-09-11 — Account Reconciliations: targeted UI simplification

Owner's brief: presentation only — show what the accountant needs now, move detail behind
progressive disclosure. **No accounting, architecture, navigation or capability changed**; every
view, filter and field is still reachable.

**THE LIST.**
- **Seven primary queues** (`RC_QV_MAIN`): All · Assigned to me · Needs my review · Returned ·
  Re-review required · **Exceptions** · Certified. My team's work, Ready for review, Untied,
  Support exceptions and Overdue move to a **More** menu with counts (`RC_QV_MORE`,
  `RCFIELD('qvmore')`).
- **Exceptions** (`rcIsException`) means something is wrong with the reconciliation itself: it
  doesn't tie or its population is unsettled, support is missing or stale, or a required source
  is missing or changed. Overdue is a schedule state and stays its own view.
- **Status and Reviewer are one Filters menu** (`RCFIELD('filters')`). The shared popover
  renderer gained two small abilities: a row with `hd:1` renders a section heading, and a row
  may state its own tick with `on`, so one menu can hold two independent selections.
- **The summary is four figures** (required · exceptions · in review · approved), with
  **Breakdown** revealing the rest as filters. The **banner is one line**. The "N open" chip is
  gone.
- **ONE STATUS ON A ROW** (`rcRowFlags`), by priority: incomplete mapping > returned > re-review
  > missing or changed source > missing support > difference > contested > overdue. It shows as
  a sentence-case word, not a pill, with "+N" and the rest in the name's title. The method tag
  (SCHEDULE, SUBLEDGER…) moves to the title too. In the Tie and Review columns **healthy states
  are grey words** (`rcListSt`, `.rcx-okst`); only problems keep a pill. **Section rows are a
  quiet muted label**, not a band.
- **The role's default queue is applied before the tabs are drawn.** It ran inside the row
  builder, after them, so the first paint highlighted All over a table filtered to Needs my
  review. That predates this pass.
- The control row **wraps**. With the panel open it used to scroll sideways and hide search
  and filters.

**THE PANEL.** Same six tabs, each focused, nothing duplicated across them.
- **Summary** (`rcSumTab`): balance bridge → **Needs attention** (`rcSumAttention`, plain words,
  priority order, only when something is wrong) → movement → proof bridge → Status (Tie · Method
  · Review · Overall · Due). The eleven context rows sit behind **Details**. The Sources strip
  lives on Roll-forward only.
- **Roll-forward** for the non-balance methods leads with the roll-forward. Sources follow, and
  `.rcx-jenote` methodology notes collect under **Why this reconciliation works**.
- **GL Detail**: five facts, View GL detail · Download Excel · Download CSV, and one line saying
  a download is a static extract while Open in Excel is the connected workpaper. Population ID,
  versions, currencies and the population change sit behind Details.
- **Support** ends in one helper line, not the support philosophy.
- **Review**: status → review path → pre-close delta → readiness → submitted package. Policy
  IDs, submission IDs, fingerprints and snapshot versions collect in one Details (`tech`). The
  redundant Preparer and Current-stage rows go.
- **Trace** opens on a **Flow**: Source → Reconciliation → Support → Review → Used in
  (Financials · Flux Review · Close · Audit). Provenance and technical lineage are one expander
  that keeps its open state across a repaint (`rcTraceOpen.prov`). The separate "Where this is
  used" section is gone.

**Method descriptions and explanatory notes became hover titles or one-line helpers
(`.rcx-hint`)**, not paragraphs. Expanders are native `<details class="rcx-more">`.

**A testing trap worth keeping.** Content inside a closed `<details>` still reports an
`offsetParent` and a layout height in this Chrome (it hides with `content-visibility`), so "is
this text visible" cannot be answered that way. Check the expander's `open` state, or look.

**Verified:** 204/204 view renders across three periods · 456 panel-tab combinations (38 × 6,
monthly and full-year) · 40 drill-down canvas tabs · every queue view filters · console clean ·
4/4 gates (baselines unchanged) · FS-CIP 4,210.2 · chronology 0.

## 2026-09-11 — the right panel: ONE PURPOSE PER TAB, ONE OBVIOUS ACTION

Owner's brief, a presentation pass over the six panel tabs and the Excel hand-off. No new
reconciliation functionality, no change to the module's architecture, the left navigation, the
accounting logic or the Excel workstream. **The canary is unmoved: FS-CIP Jun 2026 = 4,210.2.**

**THE TAB IS THE QUESTION, AND EACH ONE NOW ANSWERS EXACTLY ONE.**

| Tab | Its one question | What moved |
|---|---|---|
| **Summary** | where does this stand? | the balance, one alert, three statuses — Tie · Support · Review |
| **Roll-forward** | how did the balance move? | gained the movement line and the proof bridge; the equation is unchanged |
| **GL Detail** | what is in the population? | gained the transactions themselves |
| **Support** | what proves it? | two sections, not three |
| **Review** | who holds it, and where is it? | opens on the status and the three people |
| **Trace** | where does the number come from? | the chain, and nothing that another tab already says |

### SUMMARY IS ORIENTATION, NOT A SECOND WORKPAPER

It carried the balance, the movement bar, the proof bridge, six status rows and eleven context
rows — three of which were readings of the same workflow. It is the balance, the attention block,
and **Tie · Support · Review**. Method, Overall, Due and Certification moved into the Details
expander that was already there; the movement and the proof bridge moved to Roll-forward, which
is the tab those two questions belong to.

**Support gained a row it never had.** Summary stated Tie and Review and left the support
position to be inferred from the attention block — so a reconciliation whose support was complete
said nothing about it at all. It reads `rcSupportFrac()`, the same fraction the Support tab's own
bar prints.

### THE MOVEMENT IS THE COMPARATIVE, SO IT SAYS WHAT IT EXCLUDES

`a.movement` is ending less beginning less the classification change — the base restated for a
membership change, exactly as a comparative always is (R2.1). On Summary that needed no clause.
Directly above an equation carrying **+$611.6M of classification change** it does: `+$37.1M`
over `+$611.6M` reads as a contradiction otherwise. `rcMomBar()` prints the caveat, with the
amount, **only when there is a reclassification**, and on its own line — inline it wrapped the
420px bar into three rows.

### GL DETAIL SHOWS THE TRANSACTIONS

The tab named for the population stated its identity, its size and its versions, and then sent
the reader to another canvas to see a single line of it. It now carries the transactions:
posting date · entity · GL account · account name · journal · document · vendor · project ·
memo · debit · credit · net · currency · ERP source — the twelve largest, the whole population
still one click away on the Activity Detail canvas with its filters and its twenty-column form.

- **Fourteen columns in a 420px dock means the amounts are reached by scrolling, so the posting
  date freezes.** Identity survives the scroll, which is what the Activity Detail grid does with
  its own identifier columns; a ledger a reviewer cannot cite a line of is a wall of figures.
  The table scrolls inside `.rcx-wrap` and the panel body itself never scrolls sideways
  (measured: 1,338px inside a 373px wrapper, body 405 = 405).
- **`.rcx-tbl` fills its track** (`min-width:100%`, last column takes the slack), which is right
  for the full-width Control Center grid and wrong here — the columns would be stretched until
  the dock took the width back. `.rcx-ptx` takes its natural width instead.
- **A row offers a deep link only where the ERP instance publishes one** (R2's rule, unchanged):
  the NetSuite rows carry `Open in NetSuite ↗`, the JD Edwards rows carry the platform name and
  its reference in a title. Nothing fabricates a URL.

### SUPPORT IS TWO SECTIONS AND FOUR FACTS

**Required support** then **Attachments · supplemental**. An Excel workpaper published against
this reconciliation is an attachment like any other; its own section asked a reviewer to look in
two places for "what else is attached". Its state is still `xlArtifactState()`, so the
reconciliation still cannot report a support status the workpaper does not have.

An item is **name · status · type · version**. "Supports: …", the supported amount and the
relationship type were a second and third line under every row, so a list of eight read as
sixteen; they are what the item's own detail is for. **An exception still speaks on the row** —
a required item never provided, and a source that moved after the item was published.

### REVIEW OPENS ON WHO HOLDS IT

**Status · Preparer · Reviewer · Final reviewer · Due**, then the review path, then the
role-appropriate actions where they can act. Preparation and Overall are readings of the same
workflow the status and the path already state, so opening the tab with three pills to
cross-read bought nothing; they are under Details with the workflow ids, submission ids,
fingerprints and snapshot versions. **A single-stage workflow shows no Final reviewer row**
rather than naming the same person twice.

### TRACE DROPS WHAT OTHER TABS ALREADY SAY

The chain is **Source → GL / trial balance → Reconciliation → Support → Review → used in
Financials · Flux Review · Close · Audit**, every step clickable into the surface that answers
it. GL / trial balance was missing from a chain whose whole subject is where the number comes
from.

**The evidence and review legs are gone.** Support and Review are two of the chain's own steps
and each opens the tab that owns it, so a second rendering of the same requirements and the same
decisions meant one fact stated on two tabs — which is how two renderings drift.
`rcEvidenceTrace()` and `rcReviewTrace()` are **named as orphaned** rather than deleted: they are
the composition to mount if a standalone lineage is ever wanted. Provenance and the technical
lineage are one expander, **View technical lineage**, instead of an expander containing a second
toggle.

### DENSITY IS SCOPED TO `#rcPanel`

The dock is 420px and carries six tabs of workpaper; the air between a section title and its
first row was costing a row a screen. Section padding tightened, key/value rows separated by a
hairline the way a data sheet is, evidence lists tightened. **Scoped to `#rcPanel`**, so the
shared `.amp-*` rules still govern the Account Mapping panel, which is a different surface with
a different amount to say.

**A healthy status is quiet text and an exception is a pill** (`rcListSt`), inside the panel as
well as in the table — the §6 ruling of 2026-09-11 applied where it had not reached.

### The Excel hand-off

**A page-level return** — the same `.rcx-back` control the Activity Detail canvas uses — sits
above the prototype note, so leaving any Reconciliations surface works the same way. The
workbook is **Roll-forward + GL Detail** and nothing else; Open in Excel stays in the panel
header, where it applies to the whole workpaper; the Open-in-Excel / Download distinction is
untouched (downloads are a static extract with their manifest, Open in Excel is the connected
workpaper).

### The gate earned its place again

`check_css_duplicates.mjs` refused a second bare `.rcx-mombar{flex-wrap:wrap}` — the exact
failure mode it exists for, five hours after it caught `.fsx-more`. The wrap is declared on the
original rule. **A prefix is not a namespace, and neither is a second declaration of your own
class.**

**Verified:** 192 view renders across 3 periods (the 12 "empty" are the three lens-scoped alias
keys and the deliberately unreachable `consol` view, unchanged) · **912 lens × definition × tab
combinations render with content, 0 errors, 0 empty** · **228 panel renders in the DOM with 0
clipped elements and 0 raw HTML entities** · console clean on a fresh load · **4/4 gates**
(chrome themes 10/10, content contrast, spacing ratchet unchanged at 1072/88, css duplicates
63/63) · **FS-CIP Jun 2026 = 4,210.2** · `rcChronologyCheck()` = 0 · `RC_POSTCLOSE` empty on a
fresh load · the Excel round trip returns to Electrical CIP on the tab it was left from.

## 2026-09-12 — TRIAL BALANCE PHASE 1: the governed balance population

Owner's brief. Trial Balance was a tie-out status screen built on the LEGACY `COA` / `GL_JE`
sample — four KPI cards over a "TB vs spine" variance table that reconciled the capex spine to
a chart of accounts nothing else in the product reads any more. It is now the authoritative
statement of what the governed balances ARE, what builds them, how they moved, what mapping is
applied, what is unmapped, and what GL detail proves them.

**NOTHING HERE IS A SECOND ACCOUNTING ENGINE.** Every figure resolves through the services the
rest of the product already reads — `fsAmount()` / `rcLensLine()` for a balance, `rcLineAccts()`
and `rcAcctBalance()` for the account population, `mapResolve()` for mapping identity,
`rcTxPool()` for the ledger detail, `ORG_NODES` for the entity hierarchy. **Delete this screen
and not one number in the product moves.** The canary is unmoved: FS-CIP Jun 2026 = 4,210.2.

### THE MOVEMENT BRIDGE FOOTS BY CONSTRUCTION, NOT BY A PLUG

```
beginning (prior reported) + period activity (source ledger movement)
+ adjustments / other (movement in the governed reporting overlay) = ending (reported)
```

Both sides are the same two facts `fsAmount()` already separates — `sourceTB` and `adj` — so the
identity is algebraic rather than arithmetic luck. **Asserted at 0 difference across all 54
lines, in all four reporting lenses, in three periods** (648 checks).

A SECTION TOTALS; A STATEMENT DOES NOT. Assets sum to assets, so Assets carries a figure.
Adding assets to liabilities and equity produces a number that is arithmetically real and means
nothing, and printing one invites a reader to tie to it — the same "a section row is a LABEL
BAND, not a total" ruling the Reconciliations grid already holds.

### §14 — THE BRIDGE BEFORE THE DRILL, AND WHAT IS NOT A JOURNAL

The source ledger movement is **not all journals**, and this is the finding that shaped the
drill. Measured on CIP at Jun 2026:

| | |
|---|---|
| source ledger movement | **254.0** |
| the GL transaction population | 246.177 — 946 lines across 18 accounts |
| FX translation | +8.261 |
| eliminations | −0.438 |

8.261 − 0.438 = **7.823**, exactly the gap. An FX translation effect and a consolidation
elimination are DERIVED FROM BALANCES AND RATES and have no journal behind them; inventing
transactions for them would fabricate an ERP posting that does not exist, which is what R3
already refuses. So a reader who opens GL detail expecting 254.0 and finds 246.2 is told the
difference FIRST — on the band, above the rows — rather than discovering it in the last row.

`tbxComponents()` reads R3's own decomposition rather than computing a second one, and states
`foots` and `unattributed` so the claim is measured on every line instead of asserted once. A
line Korvyn models no reconciliation group for says so rather than showing a fabricated split.

**`TBX_RECTYPE` is why this cannot drift**: SOURCE_GL · REPORTING_ADJUSTMENT · FX_TRANSLATION ·
ELIMINATION · CLASSIFICATION, each carrying what it is and whether the ERP posted it.

### THE FIVE VIEWS, AND WHAT EACH FOOTS TO

| View | Foots to |
|---|---|
| **Consolidated** | the FS hierarchy Financials walks — a TB line and a statement line are one object |
| **By entity** | `ORG_NODES`, weighted by the entity counts beneath, last child taking the remainder — children foot to the parent, parent to the statement |
| **By account** | `rcAcctBalance()`, last account taking the remainder — **18 CIP accounts foot to 4,210.2 exactly** |
| **By account group** | the same balances rolled to the mapping's own group |
| **Exceptions** | unmapped · conflicting · in review · draft change · new source account, ranked by the balance at stake |

**AN UNMAPPED ACCOUNT IS IN NO LINE, SO THE LINE LOOP NEVER REACHES IT.** It is the population's
most important row and is added explicitly — a TB that surfaced only what mapping had already
placed would hide precisely the accounts a controller needs.

**THE ACCOUNT VIEW IS A SAMPLE AND SAYS SO.** 35 modelled accounts against an estate of 12,842.
Scaling the sample would report the demo's own composition as the enterprise's, which is the
mistake `mapStats()` already refuses; the strip states the estate, the table states the sample,
and the two are never added together.

### §11, §12, §20 — THE DRILL LANDS IN THE SHARED MODEL

Every material amount is clickable, and each opens the population behind IT: activity opens the
governed ledger detail, the adjustment opens the governed adjustment, the balance opens the
composition. The detail is `rcTxPool()` with `XL_GL_FIELDS` — **the same dataset the
reconciliation activity canvas and the connected Excel workpaper resolve**, so when Account
Activity is upgraded it reads this rather than a second copy. Account Activity is NOT rebuilt
here, which is the whole point of drilling into the shared model.

Nineteen source fields do not belong in a 420px dock, so the drill takes the main canvas the way
Activity Detail does. Nine core columns, the rest behind **More columns** (§19).

**§13 — SOURCE AND GOVERNED STAY DISTINGUISHABLE.** The ERP said the source block; the governed
block is what Korvyn decided about it, versioned separately, and **nothing overwrites a source
value**. Stated on the panel and on the ledger detail, not implied.

**§15 — A DEEP LINK ONLY WHERE THE INSTANCE PUBLISHES ONE** (R2's rule, unchanged): 36 rows
offer *Open in NetSuite*, 28 state their reference and offer no button. Nothing fabricates a URL.

### §16, §17 — LINEAGE BOTH WAYS, AND THE WAY BACK

**Where used** names Financials · Flux Review · Trending · Reconciliations · Management Reporting
Package · Audit; the four that can be navigated to route through `financialContext` / `navGo`,
and the two that consume the line without a destination are named rather than linked.

The return restores the EXACT TB state — view, selection, panel tab, fold state, filters and
scroll — through the product's own one-hop `NAVCTX`, never a second return mechanism. Verified:
fold PP&E, select CIP, open Trace, search, go to Financials, return — all six restored.

### §18 — EXPORT CARRIES ITS MANIFEST, AND IS REFUSED IF IT DOES NOT BALANCE

Period · scope · entity count · lens · basis · currency · mapping version · hierarchy version ·
statement version · data as of · row count · assets / liabilities / equity · balance check ·
export id · by · at. Built and validated together, on the rule this product already holds: an
export that does not reconcile is refused rather than quietly written. **A financial line name
is pre-escaped HTML and is rendered raw on every screen — a file is not a screen**, so
`tbxPlain()` unescapes it rather than shipping `Furniture &amp;amp; Equipment` into a spreadsheet.

### NO SECOND ANYTHING

The same `.rcx-tbl` grid, `.ktabs.lvl2` picker, `.amap-panel` dock and `.pop` menus. `tbxField()`
joins `RCFIELD` as a delegate beside R2's, R6's and Data Enrichment's, and `tb:` joins the one
popover branch — **a new page does not get a new dropdown**. The reporting lens is the SAME
control Reconciliations carries, writing through the same `setRcLens()`: one lens, one writer,
one menu.

### TRAPS

- **`.rcx-nm` IS `display:flex` AND `.rcx-tbl td` PINS THE ROW HEIGHT.** Borrowed for an
  exception row that states its reason in a sentence, the second line drew straight through the
  row below — 89.5px of content in a 32px box. The R6 dock tables hit the same trap. The fix is
  NOT to out-specify the dense grid: a table whose cells must grow gets its own shape
  (`.tbx-exctbl`), and the one that must not keep its pinned height.
- **A statement-level total is a real number that means nothing.** Caught by reading the
  rendered page, not the code.
- **Forty permanent "Where used" links is clutter.** The row action is `opacity:0` and revealed
  on hover or focus — never `visibility:hidden`, which would take it out of the tab order.
- A prefix is not a namespace: every `.tbx-` name was greped before it was claimed (0 hits).
- **Escaping `\'` through a Python heredoc silently produces `'`**, so an anchor that is visibly
  present matches zero times. Splice by line index, or assert the count and read the failure.

### Verified

**All 12 demo scenarios in §22 pass, run in the product** · 192 view renders across 3 periods
(the 12 "empty" are the three lens-scoped alias keys and the deliberately unreachable `consol`
view, unchanged) · **60 period × lens × view combinations render, 0 errors, 0 empty** · **10
panel tab combinations** (5 tabs × line and account) · 0 clipped elements · 0 raw HTML entities
· 0 overlapping rows · console clean on a fresh load · **4/4 gates** (chrome themes 10/10,
content contrast, spacing ratchet **lowered 88 → 86 inline** with the legacy screen's inline
styles, css duplicates 63/63) · dark mode holds · **FS-CIP = 4,210.2** · A = L + E at 0 ·
`rcChronologyCheck()` = 0 · 612 entities · the movement bridge foots on every line in every lens
and period.

### Deliberately NOT built (the brief stops here)

Account Mapping, Report Builder and the Excel add-in are untouched. Account Activity is NOT
rebuilt — it still reads the legacy `COA` model, and the honest position is that two transaction
browsers exist until it is re-pointed at the governed one, which is its own pass. No AI surface.
No second period model, entity model, or balance store.

### Open, and worth an owner's call

- **The legacy `renderTBLegacy` body is gone**, but `tbGLDetail()`, `tbJournalRegister()`,
  `drillTB()`, `toggleTBType()` and `expandAllTBTypes()` remain defined and unreferenced. They
  belong to the retired screen; tidying them is its own pass.
- **`fsComposition()` and `tbxEntRows()` both weight a line by entity counts.** They agree, but
  they are two derivations of one idea and should become one when Financials next moves.

## 2026-09-12 (later) — ERP ONBOARDING: source system → CoA → mapping → close-period TB

Owner's brief, and it **corrects the Trial Balance phase-1 build committed hours earlier**.
The onboarding spine is now structural rather than asserted:

```
SOURCE SYSTEM -> SOURCE CHART OF ACCOUNTS -> ENTERPRISE DIMENSIONS -> ACCOUNT MAPPING
-> CLOSE-PERIOD TRIAL BALANCE -> GOVERNED LEDGER DETAIL -> FINANCIALS / FLUX / AUDIT
```

**KORVYN DOES NOT INVENT THE ACCOUNTING STRUCTURE.** The ERP says what accounts and
transactions exist; Korvyn preserves them and governs how they are INTERPRETED. FS-CIP is
still 4,210.2 and A = L + E at 0.

### THE THREE CORRECTIONS THE ACCEPTANCE TEST NAMED

**1. THE TB IS ACCOUNT-DRIVEN. MAPPING INTERPRETS IT; MAPPING DOES NOT CREATE IT.**
Phase 1 made the financial statement LINE the row. That said mapping creates the trial
balance, which is false: a TB is `SOURCE GL ACCOUNT × ENTITY × PERIOD × CURRENCY` and it
exists before Korvyn has interpreted a single account. The base view is now one row per source
account, grouped by chart of accounts, with the ERP's own record on the left — account number,
name, instance, type, normal balance, entities, debit, credit, net — and Korvyn's
interpretation to the right of a hairline: canonical account, account group, statement line,
mapping status. **An unmapped account is ON the trial balance**, not beside it.

**2. THE TB IS NOT A ROLL-FORWARD.** It is a position. Beginning / activity / adjustment /
ending left the base table entirely; the amount opens the movement bridge (§15), which is the
right answer to a different question and is unchanged. The statement roll-up survives as *By
statement line* — a reading of the TB, not the TB.

**3. THE ACCOUNTING TB IS THE TB FOR THE ACTIVE CLOSE (§12, §16).** `tbxClosePeriod()` is
`BOOK.open`; `VIEW.period` is what somebody is looking at. When they differ the page says it is
reading history and offers the way back, rather than presenting a closed period as the close.
Flexible multi-period TB reporting is REPORTING CONTEXT and belongs to Report Builder, which
this pass does not start.

### §2 — THE SOURCE CHART OF ACCOUNTS IS THE FIRST ACCOUNTING OBJECT

`SRC_COA` preserves, per account: the ERP's own account TYPE, normal balance, parent where
supplied, active flag, effective dates, currency context, first and last seen, and the source
system's identifier. **Nothing in Korvyn edits it — there is no writer and no edit affordance.**

**THE TYPE IS THE ERP'S OWN WORD, NOT KORVYN'S.** NetSuite says *Other Current Asset*, SAP
says *Bilanzkonto* / *Erfolgskonto*, JD Edwards says *Balance Sheet* / *Profit & Loss*, Oracle
says *Asset* / *Expense*. Deriving the type from the canonical account would be exactly
backwards — mapping would be creating the structure it is meant to interpret, and an unmapped
account would have no type at all.

**LAZY, AND THAT IS LOAD-BEARING.** `SRC_ACCOUNTS` is appended to further down the file (R2
added eleven accounts), so a table built at the point of declaration covered **24 of 35** — and
the eleven it missed rendered untyped and *Inactive* on the trial balance. Caught by looking at
the screen. It builds on first ask now, after the whole book exists.

### §14 — A BALANCE SHEET ACCOUNT AND A P&L ACCOUNT MEAN DIFFERENT THINGS BY "JUN 2026"

BS = ending balance at Jun 30. P&L = June period activity. The governed engine already returns
a P&L line as its period amount (FS-BREV reads 386.0 for June against 383.9 for May — not
cumulative), so no derivation is needed here; where an ERP delivers YTD P&L it would have to be
derived deterministically with its lineage preserved, and no instance in this book does.

**THE BASIS FOLLOWS THE LINE THE BALANCE IS REPORTED ON, NOT THE SOURCE TYPE** — and the one
case where they disagree is the accounting, not a fault. NetSuite books **78420 Owner Furnished
Equipment** to an EXPENSE account; the approved mapping capitalises it into Construction in
Progress. The figure is therefore a BALANCE, and labelling it "period activity" because of the
source type would misstate what the reader is looking at. The row states both, and says
**capitalised by mapping** — which is the CIP determination this product exists for. Asserted:
0 rows where the stated basis disagrees with its line.

### §8 — NO FAKE MIXED-CURRENCY TOTALS

The currency column was showing each account's SOURCE currency beside figures resolved in the
lens's reporting currency, so a column of EUR / SGD / GBP sat over USD amounts and the debit
and credit totals underneath read as a mixed-currency sum. The column is the **reporting
currency** — what the figures actually are — and each book's own currency is stated beside its
ERP instance, where it is a different fact rather than a contradiction.

### §1, §3–§10 — ACCOUNT MAPPING IS FIVE WORKSPACES OVER ONE POPULATION

**Source systems · Source accounts · Mapping rules · Coverage & exceptions · Versions.** The
status tabs that used to be the tab row are what they always were — a FILTER on the source
account population — and sit inside Source accounts now. There is no second chart-of-accounts
module: §3 is explicit, and it is right, because the source CoA is not a thing to administer on
its own, it is the population this page interprets.

- **Source systems (§1)** is deliberately NOT the technical console `glsync` already is. The
  questions are a controller's: which books are in, through which period, in which currencies,
  with GL detail or only balances. **A balance-only feed is a real onboarding state** — the JD
  Edwards instance publishes a trial balance and no transactions, and saying so is what stops a
  reviewer expecting detail that does not exist.
- **Mapping rules (§5, §6)** groups by what a rule RESOLVES TO, so "who feeds K1330" is one
  glance: **five source accounts across three ERP instances** — NetSuite 15010/15011/15012, SAP
  Germany 471100, JD Edwards 15010. Korvyn never forces a common account number across systems.
- **Coverage (§8)** answers "which ERP accounts has Korvyn not interpreted yet" per chart of
  accounts, which is the unit somebody is actually assigned to finish.
- **Versions (§7)** — a published version is immutable; a later one supersedes it. A draft has
  no publication instant, and saying so is the difference between a rule somebody is writing
  and a rule that governs a statement.

**§10 — IMPACT PREVIEW BEFORE APPROVAL.** A mapping change is not a configuration edit; it
moves reported balances. Every figure is measured off the governed objects, not estimated —
measured on a two-account change: *2 source accounts · 2 ERP instances · up to 84 entities ·
$454.0M Jun 2026 balance · Construction in Progress · 4 reconciliations · 2 published
workpapers*. The old `amapBulk()` applied a **hard-coded canonical account with no preview**;
it is superseded by picker → impact → approve, and **nothing is posted and no governed figure
moves** — the confirmation says exactly that rather than implying an approval happened.

**§9 — BULK.** Selection, a canonical target, copy-a-prior-period, CSV out and in. The export
carries a manifest and states the rule that matters: **re-import matches on ERP instance, chart
of accounts and source account number — never on the account number alone**, because the same
number means different things in different books (15010 is CIP-Electrical in NetSuite and
Property Electrical Works in JD Edwards).

### Traps

- **`fsStmtOf()` returns `'bs'` / `'is'`, not `'FS-BS'`.** A mismatch sweep written against the
  wrong values reported zero problems when there was exactly one.
- **Shell escaping ate `\'` twice more** (sixth and seventh time recorded), once producing
  `KFX.pop('am:bulkcanon',this)` inside a single-quoted string — a parse failure that took the
  whole block down. The rule stands and I broke it again: **write the splice script with the
  Write tool; never pass replacement text through a shell heredoc.**
- **The working tree is CRLF.** A multi-line needle written with `\n` matches zero times; split
  on `\n`, match on the trimmed line, and rejoin with `\n` so the endings round-trip.
- A test regex is case-sensitive and CSS is not: four "failures" across the two briefs were
  `text-transform:uppercase` headings, not defects.

### Verified

**All 15 demo scenarios in §22 pass, run in the product** · 192 view renders across 3 periods
(the 12 empty are the documented lens aliases and the unreachable `consol`) · 45 view × lens ×
workspace combinations · 0 clipped elements · 0 raw HTML entities · console clean · **4/4
gates** (baselines unchanged: 1072 css / 86 inline, 63 duplicates) · **35 of 35 source accounts
typed by their own ERP** · 0 basis disagreements · FS-CIP **4,210.2** · A = L + E at 0 ·
chronology 0.

### Deliberately NOT built — the brief stops here

Report Builder · the production Excel add-in · any expansion of Financials, Flux or Trending ·
a rules engine that evaluates `ENR_RULES` at write time · real CSV re-import parsing (the
export, the manifest and the matching rule exist; the import states what it would do) ·
publishing an actual new mapping version against the seeded history.

### Open, and worth an owner's call

- **`glsync` (Data & sync status) still exists** as the technical integration console. Source
  systems is the accountant-facing view of the same estate; whether the technical one stays is
  a product call, not one to make by deletion.
- **Account Activity still reads the legacy `COA` model.** Two transaction browsers exist until
  it is re-pointed at the governed one.

## 2026-09-12 (later) — CHART OF ACCOUNTS: the onboarding screen an accountant can read

Owner's simplification pass over the Account Mapping build of the same day. The acceptance
test is a sentence a controller should be able to say, and the rename is the design: somebody
onboarding an ERP is looking for **their chart of accounts**, not for a mapping engine.

```
CONNECT ERP -> REVIEW CHART OF ACCOUNTS -> MAP ACCOUNTS -> RESOLVE EXCEPTIONS
-> APPROVE VERSION -> USE IN JUNE CLOSE
```

FS-CIP is still 4,210.2 and A = L + E at 0. No mapping architecture changed — this is what the
page shows and in what order.

### WHAT CAME OFF THE PAGE, AND WHY EACH COST MORE THAN IT GAVE

| Removed | Why |
|---|---|
| the **THIS PAGE** and **DATA ENRICHMENT** cards | two paragraphs of architecture and a cross-promotion above the table somebody came to read. One helper line under the title says it; Financial Attributes is one small link in the tab row (§3, §21) |
| the **mapping-set metadata band** | the governing version is one clause beside the tabs. A metadata strip is not a step in mapping an account (§23) |
| **Source systems** as a primary tab | an integration inventory is not a step in mapping an account. The source system is a FILTER on the population, which is how an accountant reaches for it (§20) |
| **Mapping rules** as a primary tab | that was the engine rather than the work |
| the **second ribbon** | the status tabs were a FILTER on the population all along, so they are a filter |

Four tabs: **Source accounts · Mapping · Exceptions · Versions**. Source accounts is the
default and the table is the first thing on the page.

### §6 — THE ACCOUNT NUMBER AND ITS DESCRIPTION ARE TWO COLUMNS. GLOBALLY.

This is a reporting rule, not a layout preference. `15010 CIP - Electrical` in one field cannot
be sorted, filtered, matched on re-import or joined against the ERP — which is the whole reason
somebody exports a trial balance or a chart of accounts. The same split applies to every
id/name pair that leaves Korvyn: entity, vendor, project, canonical account, statement line.

**The trial balance export was rebuilt on it** and on the account-driven TB the previous pass
established: 23 columns, one row per source account, **every id and its name separate**
(verified: 0 cells gluing a code to a name), source fields first and Korvyn's interpretation
after them so the two halves are visibly grouped.

**§24 — analysis-ready.** The Excel workbook carries a title, **freeze panes** on the header row
and the two identifying columns, **autofilter** over the used range, a number format on the
numeric columns, and **the manifest on its own sheet** rather than sitting on top of the data
where it breaks every filter. CSV stays flat — one value per column, no display formatting in
the data, manifest above a blank line because a CSV has no second sheet.

### §13, §14 — MAPPING IS ORGANISED BY WHAT IT RESOLVES TO

One card per Korvyn account, so the enterprise case reads at a glance rather than needing a
query. **K1330 Electrical Infrastructure is fed by five source accounts across three ERP
instances** — NetSuite 15010 / 15011 / 15012, SAP Germany 471100, and JD Edwards 15010, where
the same number means a different account in a different book. Korvyn never forces a common
account number across systems, and a rules table hid exactly this.

### §9, §10 — THE PANEL AND THE EDIT

Panel: **Source · Korvyn mapping · Effective**, then Edit mapping and View history, with rule
ids, scope types and source identifiers behind Details. Edit: the source account, four choices
and an effective period, with scoped rules behind **Advanced**.

**THE ACCOUNT GROUP AND THE STATEMENT LINE ARE DERIVED, NOT ASKED.** Picking a canonical
account is what decides where the balance is reported; offering them as separate inputs would
let somebody build a combination the statement definition does not carry. They are shown as
facts on a quiet ground rather than drawn as disabled selects — **a greyed-out control invites
a click that can never work.**

### §15–§17 — EXCEPTIONS ARE WORK, NOT A REPORT

Unmapped · Conflict · Needs review · New, ranked by **balance at stake** so the $182.5M conflict
is above the $0.9M suspense account, each with one action. Severity is a 3px left edge and
nothing else (design rule 8).

The conflict pane names the two choices in words — *Keep Mechanical Infrastructure* / *Keep
Electrical Infrastructure* / *Create scoped rule* — with the balance affected and the entity
count. **No rule ids.**

### A RAW ID REACHED THE SCREEN, AND THE SWEEP IS WHAT CAUGHT IT

The conflict pane read **"scoped to em-de"**. `coaOf()` resolves a chart of accounts and nothing
else, so an entity-group scope fell through to its node id — exactly the decoding §22 says an
accountant should never have to do. `coaScopeName()` names a scope by the KIND of scope it is:
chart of accounts, ERP instance, entity group, or one entity. A DOM sweep for
`/MAP-\d|em-de|na-dev|RG-[A-Z]|FS-[A-Z]{2,}/` across every tab in every lens now runs with the
render sweep; it reports 0.

**And the same class of fault in the panel**: `m.ver` is a version's ID and its NUMBER is
`mapVer(m.ver).v`, so "Mapping version" read **vMV-2026-06-4** instead of v2026.06.4. Two call
sites, both fixed.

### Traps

- **The spacing gate flagged a 2px inside the EXPORTED workbook's stylesheet.** The gate cannot
  tell Korvyn's UI from a file Korvyn writes, and it is right not to try — the export carries no
  length values at all now and Excel supplies its own cell padding.
- **A card clips, so what is inside it must be able to give.** `.tbl td` is nowrap, which is
  right for a wide grid and wrong in a 418px card: the account description ran past the edge and
  the card's `overflow:hidden` ate it. The number and the ERP keep their shape; the description
  is the one column allowed to wrap.
- **State declared in a replaced block disappears with it.** `amapWs`, `amapF` and `amapImpact`
  lived in the header of the block this pass rewrote, and the page threw `amapWs is not defined`
  on first paint. Re-declare what a replacement still reads.
- A test regex is case-sensitive and CSS is not — four more "failures" were
  `text-transform:uppercase` headings.

### Verified

**All 11 screens in §26 confirmed in the product** · 192 view renders across 3 periods · 44
view × lens × tab combinations · **0 clipped elements · 0 raw HTML entities · 0 raw ids on
screen** · console clean · **4/4 gates** (baselines unchanged) · the TB export is 23 columns
with 0 glued id/name cells and a valid manifest · FS-CIP **4,210.2** · A = L + E at 0 ·
chronology 0.

### Deliberately NOT done

Report Builder · the Excel add-in · any expansion of Financials, Flux, Trending or Data
Enrichment · real CSV upload parsing (the validation, the preview and the apply path are real;
the file is read back from a representative edited export rather than a file picker) ·
publishing an actual new mapping version against the seeded history.

### Open

- **`glsync` still exists** as the technical integration console. The source-system facts an
  accountant needs are on the ERP filter now; whether the technical page stays is a product call.
- `amapBoundaryLegacy` / `amapStripLegacy` / `amapFieldOfLegacy` / `amapSysView` / `amapRulesView`
  / `amapCovView` / `amapVerView` are retired and unreferenced, named rather than deleted.

## 2026-09-12 (later) — GOVERNED LEDGER DETAIL, and the global table behaviour

Owner's brief. Two things shipped: the enterprise table behaviour every long table now shares,
and Account Activity rebuilt as the canonical governed ledger. FS-CIP is still 4,210.2 and
A = L + E at 0.

### §1 — `.ktbl`: THE ENTERPRISE TABLE BEHAVIOUR, DECLARED ONCE

> **The MECHANISM below was superseded the same day — see the GLOBAL TABLE SCROLLING STANDARD
> block that follows.** The reported fault and the two measured traps (a flex `<th>` cannot
> participate in table layout; a later, more specific `position:sticky` is what the offsets
> resolve against) still hold. The bounded wrapper does not: a primary table must not own a
> vertical scrollbar.

Reported: on a long wide table you had to scroll to the BOTTOM of the rows to reach the
horizontal scrollbar, then scroll back up to read the header you had just moved. On a
900-row ledger that makes the right-hand columns effectively unreachable.

**THE FIX IS TO BOUND THE SCROLLER, NOT TO SYNTHESISE A SCROLLBAR.** A wrapper capped at the
viewport owns both axes: its horizontal scrollbar sits at the bottom of the WRAPPER, which is
on screen, and the header sticks to the top of the same box. One element, both problems, and
no second scrollbar to keep in step — a synthetic one drifts the moment anything resizes.

**The allowance is measured, not declared.** A fixed token cannot know how much chrome sits
above a table: the trial balance carries a close banner, a status strip, a filter row and a tab
strip (~506px), Chart of Accounts does not. `ktblFit()` reads each wrapper's own top and sizes
it to the viewport — and reads nothing the reservation itself changes, because a max-height
computed from the element's own height is the feedback loop the flux drawer's note warns about.
A table that already fits keeps its natural height, so a six-row exception list grows no
scroller.

**TWO FAULTS FOUND BY MEASURING, NOT READING.**

- **A flex `<th>` cannot stick vertically.** Every header cell held at the wrapper's top except
  the first, which scrolled away with the body. `.rcx-nm` is `display:flex` — the Control Center
  needs that for its name cell — and on a HEADER cell it takes the th out of table layout.
  Proved by removing the class at runtime: with it the corner fails, without it the corner
  sticks. Same `display:flex` trap the R6 dock tables hit, in the one place it breaks a header
  rather than a row.
- **A later, more specific `position:sticky` is what the offsets resolve against.**
  `.rcx-tbl th.rcx-nm` re-declares position and left for the frozen column, so the `top` set by
  `.ktbl thead th` was never in play. The corner cell declares both axes itself now.

Verified on both pages: **13/13 and 12/12 header cells stick, the frozen column holds through a
horizontal scroll, and the scrollbar is on screen** (wrapper bottom 894 in a 910px viewport).

### §2–§8, §16–§21, §27 — ACCOUNT ACTIVITY IS THE GOVERNED LEDGER

One canonical population in four separable layers — **source facts · account mapping ·
financial attributes · governed records** — and the page's whole claim is that a reader can
always tell what the ERP said from what Korvyn concluded.

**IT IS THE POPULATION THE PRODUCT ALREADY RESOLVES.** `rcTxPool()` — what the reconciliation
activity canvas, the trial balance drill and the connected Excel workpaper read. There is no
second dataset, which is the point: CIP by asset class and CIP by vendor are two READINGS of
this, not two extracts.

**§10 — ATTRIBUTES ARE DERIVED FROM RULES, NOT STORED PER ROW.** Measured on the June
population: **ER-03 ("CIP accounts are capitalised by policy") classifies 485 transactions and
ER-01 6**, with 579 values inherited from the source account — 779 of 2,254 rows classified
without anyone tagging a row. What IS stored is the exception: a person's override, with its
prior value, reason and approver. `glxAttrs()` resolves rules, then inheritance, then
overrides, and every value carries its provenance (§8, §15).

**§20, §21 — A GOVERNED RECORD IS NOT AN ERP TRANSACTION.** The reporting adjustment against
Construction in Progress is reported balance no journal carries; it is a row with its own
record type, no journal number, its approval on it, and `Posted to the ERP: No`. Folding it into
a transaction would make the ledger claim the ERP posted something it did not. It carries a 3px
accent edge and nothing else — a different KIND of row, not a worse one.

**§17 — the column picker is grouped** into SOURCE · ACCOUNTING · ORGANIZATION · COUNTERPARTY ·
PROJECT · MAPPING · FINANCIAL ATTRIBUTES · CURRENCY · GOVERNANCE · LINEAGE. A flat list of every
governed field is a schema browser. **§5 — a field the ERP does not supply says so** rather than
reading as empty. **§27 — a deep link only where the instance publishes one.**

### TWO REAL DEFECTS THE BUILD SURFACED

**THE ACCOUNT GROUP A RULE TESTS IS THE ACCOUNTING ONE.** A first cut derived it by looking for
"CIP" in the canonical and statement-parent names — but K1330 is *Electrical Infrastructure*
under *Property, Plant & Equipment*, so neither contains the word and **every CIP rule silently
matched nothing**. The reconciliation group is the governed field that actually says "this is
CIP", and is what the fact derives from now.

**SOURCE TRANSACTION IDS ARE NOT UNIQUE.** 2,254 governed rows carry **623 distinct
`sourceTransactionId` values** — the generator builds the id from the CHART OF ACCOUNTS and the
row index, so every account in the same chart collides, one id twelve times over. Keyed on the
id alone the attribute cache handed one account's classification to another's rows, and
selecting a row opened somebody else's panel. This page keys on account + transaction + line
(`glxKey`), which is correct here — **but the collision is a defect in the shared transaction
model and is recorded as one**: that id is exported as the ERP reference and stamped into export
manifests, so renumbering it is its own pass and would move existing exports.

### §19, §24 — DOWNLOAD

The filtered population with source facts, mapping, attributes and lineage; every id and its
description separate; freeze panes, autofilter, number formats, and the manifest on its own
sheet. The manifest states the filters that produced the file, the source/governed row split,
and that rows whose record type is not SOURCE_GL were never posted to the ERP.

### Verified

192 view renders across 3 periods · 14 view × lens combinations including the ledger under all
four lenses · **0 clipped elements · 0 raw HTML entities** · console clean · **4/4 gates**
(baselines unchanged) · 2,254 distinct row keys with 0 duplicates · FS-CIP **4,210.2** ·
A = L + E at 0 · chronology 0.

### NOT DONE IN THIS PASS — named, not glossed

The brief is larger than one pass and these are the parts I did not build:

- **§9–§14 — the Financial Attributes page restructure** (Rules · Exceptions · Overrides ·
  Fields · Versions, defaulting to Exceptions). The attribute MODEL is now real and evaluated,
  and the ledger renders it; the page that administers it is still the old one.
- **§29 — the attribute impact preview.** The equivalent for mapping exists
  (`amapImpactOf`) and is the shape to reuse.
- **§25 — the re-publication / review-required cascade** when an attribute changes under a
  certified period. R6's detection is the mechanism; nothing wires attributes into it yet.
- **§30 — true server-side virtualization.** The page paginates at 50 and states the enterprise
  multiple; it does not stream.
- **§28 — MoM.** Untouched deliberately; the balance-sheet and P&L behaviour it depends on is
  already correct in the trial balance.

### Open

- **ER-02 and ER-04 match nothing.** They are authored against the worked example's project
  vocabulary ("South Valley Campus — Hall C"), which the generated population does not carry
  ("Ashburn Hall C", "Dallas Hall A"). A rule that can never fire is worth surfacing in the
  Rules view with its match count — which is a reason to do §11 next.


## 2026-09-12 (later still) — THE GLOBAL ENTERPRISE TABLE SCROLLING STANDARD

Owner's brief, correcting the `.ktbl` mechanism shipped hours earlier the same day. **ONE
VERTICAL PAGE SCROLL.** A primary enterprise work surface must not own a nested vertical
scrollbar; the page does. Presentation only — no accounting, no business logic, no module
redesign. FS-CIP Jun 2026 = 4,210.2 and A = L + E at 0, unmoved.

**WHAT THE EARLIER VERSION GOT WRONG, AND WHY IT LOOKED RIGHT.** It capped the wrapper at the
viewport, so the wrapper's own horizontal scrollbar was on screen and its header stuck to the
top of the same box — one element, both problems, and its comment argued explicitly against
"a second scrollbar to keep in step with the first". That reasoning is sound and it answered
the wrong question: it cured the unreachable scrollbar by creating a nested vertical one, which
is the thing the owner then ruled out. A finance table is read down the page, not inside a box.

### THE HEADER IS A REAL PROBLEM, NOT A DECLARATION

A box with `overflow-x:auto` **IS** a scrollport, and `overflow-y:visible` does not opt out —
when either axis is not `visible` the other computes to `auto`. CSS resolves `position:sticky`
against the nearest scrollport, so a header inside the wrapper can only stick to the WRAPPER,
which no longer scrolls vertically and therefore just leaves the screen with the page. The
alternative — no horizontal container at all — scrolls the whole page sideways. Neither is
usable, which is why the header now FLOATS.

`ktblSync()` offsets the `<thead>` by however far the table has travelled under the page
chrome. Three things about it are load-bearing:

- **The offset is `position:relative`/`top`, never a transform.** A transform becomes a
  containing block, and the frozen column's own `position:sticky` would stop resolving against
  the scrollport the moment the header floated.
- **It measures the HEADER'S own natural top, not the wrapper's**, subtracting the offset
  already applied so the reading is independent of the pass before it. Taking the wrapper's top
  left the floating header two pixels under the chrome it was supposed to meet (measured).
- **The chrome bottom is measured, not tokenised** — the same pattern `syncStick()` uses for
  the flux statement: read what is actually pinned above the content, because how much chrome
  sits above a table is a property of the PAGE. Measured at 150px; every screen's header lands
  on exactly 150.

### THE HORIZONTAL SCROLLBAR IS A SECOND, SYNCHRONISED CONTROL (§4, §5)

`.ktbl-sb` is a sticky bar pinned to the foot of the viewport whose inner spacer matches the
table's scroll width. **One horizontal position, two controls that write it** — a reentrancy
guard is what stops the two handlers driving each other round a loop, and there is no second
stored value to drift. It is CREATED by `ktblSync()` rather than written into markup, so a
table added later inherits it without its call site changing (§12).

**IT SHOWS ONLY WHILE THE TABLE OVERFLOWS SIDEWAYS AND RUNS PAST THE FOLD.** A table whose own
bottom edge is on screen already has a reachable bar, and two bars for one position is one too
many. Verified on the Reconciliations Control Center with the dock open: the table overflows
1206 into 814, its bottom sits at 793 in a 910px viewport, and the synthetic bar correctly
stands down.

**Its containing block is the card, and the release case cannot bite.** The bar is let go when
the card's bottom rises above the viewport bottom — by which point the table's bottom is on
screen too and the bar has already hidden itself. So it never floats over the balance-sheet
equation that follows it on Financials.

### THE FROZEN BLOCK IS MEASURED, NOT A TABLE OF PIXEL CONSTANTS (§6)

A cell carries `.kfreeze` and the last one `.kfreeze-end`; `ktblSync()` reads the header's own
column widths and writes each left offset. Two or three frozen columns declared in CSS is a
table of constants that a font, a translation or a column toggle silently invalidates — which
is exactly what `.rcx-tx-tbl`'s `left:104px`/`176px` already is. `.kfreeze2` is retired; it
existed only because the offsets were hand-written.

**Chart of Accounts freezes number and description** per the brief, and the checkbox rides with
them — a selection control that scrolls away from the row it selects is worse than no freeze.
Measured at 0 / 37 / 177, header and body identical, holding through a 700px horizontal scroll.

### WHAT BECAME THE SHARED COMPONENT

`.ktbl` now carries every primary table on the eight QA screens: Chart of Accounts, Trial
Balance, Account Activity, the Reconciliations Control Center, the GL account tie-out, the
Activity Detail transaction grid, Financials, Flux Review's statement grid and Trending.

- **`.rcx-txwrap{max-height:560px}` was the one remaining bounded primary table** — a nested
  vertical scrollbar on a governed transaction ledger. The wrapper keeps its identity, because
  the `tstick` offsets are scoped to it; it stops being a box.
- **The Financials statement had no wrapper at all**, so its header had nothing to stick to. It
  is the same component now, and the balance equation and unit footer still follow the table.
- **Reconciliations, Trending and the flux statement grid declared `position:sticky` on their
  header cells with `top:auto`**, which never sticks. That was three screens quietly not having
  a sticky header at all.

**Flux Review's own `#fxRoot` statement is untouched.** It sheds columns (`fxShed()`) rather
than scrolling, its heads are page-sticky at `--fx-stick`, and `.fx-table` is deliberately
`overflow:visible` — an overflow ancestor breaks those heads (the BOXY block's trap). It
already meets the standard by a different route; adding a scrollport would break it.

### §8 — THE BOUNDED SURFACES THAT KEEP THEIR SCROLL

The right-side dock (`.amap-panel` / `#rcPanel`), modals, `.pop` popovers and small preview
panes are MEANT to be bounded and are untouched. No `.ktbl` is mounted inside any of them.

**ONE JUDGMENT CALL, NAMED RATHER THAN GLOSSED:** `.xl-grid-wrap{max-height:560px}`, the
generic Korvyn-for-Excel browser workbook canvas, keeps its bound. It is a rendering of a
spreadsheet application's own viewport, not a Korvyn table, it is not among the brief's QA
screens, and that whole surface is already recorded as awaiting the owner's call after the
Account Reconciliations reset. If it should join the standard, that is a product decision.

### Verified

**192 view renders across 3 periods, 0 errors, 0 empty** (the 12 "empty" are the three
lens-scoped alias keys and the deliberately unreachable `consol` view, unchanged) · **0 nested
vertical scrollbars on all eight QA screens** · the header floats to exactly the measured chrome
bottom on all six screens that reach it · the bar drives the table and the table drives the bar
(400→400, 783→783 at the clamp) · frozen columns hold through a horizontal scroll with header
and body aligned · **0 clipped elements, 0 raw HTML entities** · console clean on a fresh load ·
**4/4 gates** (chrome themes 10/10, content contrast, spacing ratchet unchanged at 1072/86, css
duplicates 63/63) · dark mode holds · FS-CIP **4,210.2** · `rcChronologyCheck()` = 0.



## 2026-09-12 (final) — the table scrolling standard, finished

Owner's refinement pass over the standard shipped earlier the same day. Presentation only — no
accounting, no business logic, no filters, no data model. FS-CIP Jun 2026 = 4,210.2, unmoved.

### §2, §3 — ONE HORIZONTAL SCROLL BEHAVIOUR, AND IT IS ALWAYS REACHABLE

The first version showed the sticky bar only while the table ran past the fold, on the argument
that a table whose own bottom edge is on screen already has a reachable bar. That is true and it
is still two bars, in two places, depending on where the reader happens to be — which is exactly
the "duplicate independent scroll state" §3 rules out.

**The scroller keeps its scrollLeft and gives up its BAR** (`scrollbar-width:none`, and the
WebKit pseudo-element for Chrome). Wheel, trackpad, keyboard and the frozen columns all still
read the real `scrollLeft`; the sticky bar is that one position rendered somewhere reachable,
present for as long as the table overflows. There is no second state to keep in step — the
synchronisation is between a control and the scroller it drives, not between two scrollers.

### §5 — THE FROZEN BLOCK IS THE IDENTITY PAIR, AND A FROZEN BLOCK MUST BE LEFTMOST

`position:sticky` can only pin a contiguous run from the left edge. On **Account Activity** the
account number and its description are columns 4 and 5 of the default set, so freezing them
where they sat would have frozen the ERP, the journal and the posting date with them — four
columns of a 1,250px track before the reader reaches anything they came for. `glxOrdered()`
hoists the pair to the front instead: the column SET is still whatever the picker holds, nothing
the reader chose is dropped, and the posting date follows immediately, which is where a ledger
is read from anyway. The download reads the same order, so the file matches the screen.

**The Trial Balance had one glued "Source account" cell.** §5 asks for the pair to be frozen,
which presumes two columns, and it is the same reporting fault the Chart of Accounts export
fixed: a column somebody has to read a code out of cannot be sorted, filtered or matched. Split,
both frozen.

**The block is 25–30% of the track on all three screens** (TB 308px, Account Activity 344px,
Chart of Accounts 377px with its checkbox riding along), which is the balance §5 asks for:
enough to stay oriented, not so much that the horizontal workspace the freeze exists to serve is
what gets constrained.

### §6 — A FROZEN CELL IS THE SAME ROW, NOT A PANEL BESIDE IT

A sticky cell has its own background and therefore stops inheriting the row's, so a hovered or
selected row visibly lost its tint for its first two columns — which is most of what makes a
frozen block read as separate. It repaints hover, selected and section states now. The boundary
is a hairline plus a soft falloff that deepens only while something is actually scrolled under
it (`.ktbl.kx`), never a second border beside the cell's own edge.

**THE COMPONENT MARKS THE BOUNDARY, NOT THE CALL SITE.** `kfreeze-end` is applied by the
measuring pass to whichever column it ended on, so Reconciliations' `.rcx-nm` identity cell gets
the same edge without its markup knowing this class exists.

### §9 — THE HORIZONTAL POSITION SURVIVES A RE-RENDER

`renderAll()` rebuilds a view's innerHTML, so the scroller a reader had pushed 900px right is a
different element a frame later — and every selection, filter or drawer open would silently
return them to column one. The position is remembered against the TABLE's identity, not the
element, because the element is what does not survive. Verified: open a row drawer and close it
again and the page is still at x 600 / y 900 with the row still selected.

### THREE DEFECTS THE PASS SURFACED, ALL FOUND BY READING THE RENDERED PAGE

- **ONE ROW WAS SIZING A COLUMN IT SAID NOTHING ABOUT.** The Trial Balance footer's first cell
  was `.rcx-nm`, which carries `min-width:260px` for the Control Center's name column — so the
  frozen account-number column was 260px wide for a six-digit code, and the whole block was
  460px. It takes the same two cells every other row uses. **`max-width` does not apply to a
  table cell**; `min-width` on one cell does, and that is what decides a column.
- **A COLSPAN CELL PUSHES THE COLUMNS IT SPANS.** The chart-of-accounts band over the frozen
  pair sized the number column off the longest CoA name. It spans the whole table now — no
  pressure on any column — and a **sticky inner span** keeps the group label on screen at any
  horizontal position, which is what the band was frozen for.
- **THE FOOTER TOTALS LANDED ONE COLUMN LEFT.** Splitting the identity pair added a column and
  the footer's leading `colspan` was not re-counted, so the debit total printed under Entities.
  Caught by asserting each footer cell's x against the header it totals, not by reading markup.

**And one latent fault fixed before it could bite:** the freeze pass measured the LAST header
row, but the flux statement's identity column is a `rowspan` cell in the FIRST of two — so that
column would have silently stopped sticking the day that table grew wide enough to scroll. It
measures whichever header row declares the block.

### §10 — what is now on the component

Chart of Accounts · Trial Balance · Account Activity · Reconciliations (Control Center, GL
account tie-out, Activity Detail transactions) · Financials · Flux Review's statement grid ·
Trending · the Reporting Package's supporting schedules. Audit History and Reports carry no
table wide enough to overflow; they inherit the behaviour if one is ever added.

**§7 — the right-side drawer keeps its own vertical scroll**, which is the intended
distinction, and scrolling inside it moves the page by zero.

**§8 — pagination is untouched.** Nothing renders the enterprise dataset to solve scrolling.

### Verified

**§12 ACCEPTANCE, run in the product at §11's scale — 600 rows × 60 columns:** scrolled 300 rows
down and 6,752px right to the far-right attribute and lineage columns, the header sits at
exactly the measured chrome bottom (150) and the Account number / Account description pair holds
at x 0 and 106, header and body aligned, with the sticky bar at 894 in a 910px viewport and
synced. Repeated on the normal population for Trial Balance and Chart of Accounts.

192 view renders across 3 periods, 0 errors · **0 nested vertical scrollbars, 0 native
horizontal bars, 0 clipped elements, 0 raw HTML entities** across nine surfaces · header/footer
cell counts equal on every `.ktbl` · console clean on a fresh load · **4/4 gates** (baselines
unchanged: 1072 css / 86 inline, 63 duplicates) · dark mode holds · FS-CIP **4,210.2** ·
`rcChronologyCheck()` = 0.

### Open, and NOT touched here

**The Trial Balance's Debit and Credit columns do not foot to each other** — $5.824B against
$1.584B, so the Net column prints the difference rather than "Dr = Cr". That is the per-account
debit/credit derivation, it predates both of today's scrolling passes, and it is business logic
this brief rules out changing. Worth its own look: a trial balance whose two columns do not
agree is a real signal, even though the same population ties to Financials and A = L + E is 0.



## 2026-09-13 — GOVERNED ATTRIBUTE EDITING: inline, bulk, rule, import

Owner's brief. A missing or wrong non-GL dimension is fixed from Account Activity in a couple
of seconds, and Korvyn keeps the source, the lineage, the versioning and the downstream impact
underneath. **Easy like Excel for the user; governed like an accounting platform underneath.**

FS-CIP Jun 2026 = 4,210.2 and A = L + E at 0, before and after every edit — which is the whole
point of §8 and §18 and is asserted, not assumed.

### §1 — A SOURCE VALUE AND A GOVERNED VALUE ARE TWO OBJECTS

`GLX_DIMS` declares six: vendor, department, cost centre, business unit, region, project. Each
names the SOURCE field it sits over. `glxDim(r,k,p)` resolves four layers and says which one
won — **override > rule > normalized source > source** — returning the value, its provenance,
the source, the rule, the stored decision and the ERP-sync state.

**THE ERP NOW SUPPLIES A DEPARTMENT AND A COST CENTRE**, in the source system's own vocabulary
("DC Construction", not the reporting department), generated in `rcTxPool` on the one governed
population. That is deliberate: a value Korvyn computes for display is not a source value, and
without a real un-normalised source the normalization layer had nothing to do. Both row
builders in the pool carry it, so the reconciliation canvas and the Excel workpaper see the
same field.

**§6 IS THE REGISTRY, NOT A LIST OF EXCLUSIONS.** An ERP fact — account, journal, posting date,
amount, transaction id, ERP instance — has no `dim` and no `attr` descriptor, so no code path
can offer an editor for it. Verified: of the ten immutable fields, **zero** are editable.

**§7 — A MAPPING COLUMN IS ROUTED, NOT REFUSED.** Canonical account, account group and FS line
are real governed values owned by Chart of Accounts; clicking one says so and opens the account
there. Verified: **zero** mapping columns are editable.

### §3/§4 — THE INLINE EDITOR IS THE APP'S ONE POPOVER

Click a cell, pick a value, done — commit on click and close, the contract every single-select
in this product already holds, so nothing new has to be learned. No page, no wizard, no Apply.
The controlled list is **assembled from the population**, not a hand-written constant that goes
stale the first time an entity is added.

**§2 — ONE COLUMN, AND A QUIET MARK.** The table shows the governed value with a 5px provenance
dot; a plain source value carries no mark at all, so a clean ledger stays monochrome and the eye
lands on exactly the cells Korvyn has touched. Design rule 8 reserves dots for provenance, which
is precisely this. The source value is in the cell's title and in the row detail — never a
second full column.

**§4 — THE CONFIRMATION IS A LINE, NOT A MODAL**: what changed, its provenance, how many
downstream views consume it, and only where there is something to decide, the next scope.

### §9–§12, §22, §31 — THE SAME WRITE PATH AT FOUR SCALES

One row is a click. A selection is the same editor over N rows with the population stated before
it acts (measured: *24 transactions selected · $8.4M · Jun 2026* → applied). A population is a
**rule**: after an edit Korvyn matches on §12's patterns — the account, a distinctive memo stem,
the project family — and offers *Apply to N similar* / *Create rule* / *Review matches*.
**Nothing is applied without approval.** An estate is a **CSV round trip**: the template carries
the row key Korvyn matches on plus the governed columns, and the import **previews and counts
before it writes** (verified: 8 edited rows → 8 changes, 8 transactions, $6.556M, 0 rejects → 8
records written with scope `import`). Provenance does not degrade as the scope grows because
every rung goes through `glxEditWrite`.

### §17/§18 — STORED ONCE, CONSUMED EVERYWHERE, AND IT MOVES NO MONEY

`glxGovVendor` / `glxGovDept` / `glxGovProject` are what downstream reads. The Excel
workpaper's vendor × project summary, the reconciliation GL export, the reconciliation
transaction grid and the trial-balance drill all call the resolver instead of `r.vendorName`,
so **no module keeps its own copy** and there is nothing to keep in step.

**AND THE DISTINCTION §18 ASKS FOR IS STRUCTURAL.** An attribute edit changes analysis and never
the ledger, because nothing in this layer writes an amount: verified that a vendor edit moves
the trial balance by **0.000000**, the row's net/debit/credit by **0**, and leaves the source
vendor `null`. §8's amount boundary needs no guard — there is no path.

### §20/§21 — THE TWO CASES THAT LOOK ALIKE AND ARE NOT

**A certified period does not refuse the edit and does not silently rewrite history.** It records
`reviewRequired` and states the consequence with counts read off the real objects: *This period
is certified · affects 1 report, 1 reconciliation and 1 audit population · review required.*
Refusing to correct a vendor would be the wrong cure for the right worry.

**THE ERP CATCHING UP IS NOT THE ERP DISAGREEING**, and both look like "the source differs from
what was recorded". The edit stores the source AS IT STOOD, which is the only thing that
separates them. Verified both: a later sync of *Siemens Energy* reads **agrees** and the
exception goes; a later sync of *Siemens AG* reads **the source value changed after this was set
(was blank) — review the governed value**, and the governed value is **not** overwritten.

### §13/§14, §23–§29 — THE SURFACE

- **§28** The header states the page and its context and stops; the paragraph explaining the
  architecture above the ledger is gone. Toolbar: Search · Filters · **Columns · Saved views ·
  Download**.
- **§23–§26 Columns is LIVE.** Search, Reset, × — and **no Done**: every change is already
  applied, and an OK button on a panel that has already acted teaches a reader their changes
  were provisional when they were not. Visible columns first, then Add columns in the ten
  groups.
- **§25 THE PANEL LISTS WHAT THE TABLE RENDERS, IN THE TABLE'S ORDER.** The frozen identity pair
  is hoisted to the front by yesterday's scrolling standard, so a list in the raw set order
  disagreed with the columns on screen — and a reorder panel that does not match the table is
  worse than no panel. Asserted equal, chip for chip.
- **§27 Saved views** — CIP Review, AP Vendor Analysis, Audit GL Extract, Intercompany Review,
  plus your own; columns, order, filters and search.
- **§13/§14 A new governed field** is created from Columns, in six questions an accountant can
  answer and not one word of schema vocabulary.
- **§29** The download carries the governed value, the source value and a provenance column for
  every dimension. **A file is read away from the screen that explains it**, so a column the page
  calls "Vendor" is written "Governed vendor" beside "Source vendor".

### Verified

**All twelve §32 screens confirmed in the product, through real clicks**: the cleaned header ·
blank-vendor inline edit (editor opens under the cell, 10 options) · the governed value with its
dot and title · source beside governed in the row detail with Edit on each · a department
override over a normalization · 24-row bulk edit · the rule suggestion with its three choices ·
the Columns panel · reorder reflected in the table · Saved views · the certified-period
consequence · the ERP-source-change conflict.

192 view renders across 3 periods, 0 errors · console clean on a fresh load · **4/4 gates** ·
0 nested vertical scrollbars, 0 clipped elements, 0 raw HTML entities across eight surfaces and
the row panel · dark mode holds · FS-CIP **4,210.2** · `rcChronologyCheck()` = 0 · **the store
is empty on a fresh load** — the product ships with no seeded edits.

**The gates earned their place again.** Three `--n-400` foregrounds (its declared role is
borders and placeholders) and one 2px off the spacing scale. The drag handle took `--muted`
because it is an affordance — the same precedent the disclosure caret set — and one rule block
turned out to be dead CSS for a shape the row detail did not end up using, so it went rather
than got a token.

### NOT BUILT — named, not glossed

- **A rules ENGINE.** §11's *Create rule* records the rule and applies it to the population it
  matched **at approval**. It does not re-evaluate as new transactions arrive, which is what a
  recurring rule would have to do. The objects are shaped for it (`GLX_RULES` carries the
  conditions), and nothing pretends otherwise on screen.
- **§12's Review matches** filters the ledger by the rule's memo stem rather than opening a
  dedicated match list with per-row accept/reject.
- **Multi-select field type** (§14 admits it "only if clearly needed"; nothing needs it yet).
- Governed records that are not ERP transactions show — for every dimension and cannot be
  edited: a reporting adjustment has no vendor to correct.
- Report Builder, Financials, Flux, Trending and the Excel add-in are untouched, per the brief.



## 2026-09-13 (later) — GOVERNED DIMENSIONS: autocomplete, custom fields, lightweight approval

Owner's brief, finishing the governed-dimension experience inside Account Activity. **Enter
once, use everywhere.** FS-CIP Jun 2026 = 4,210.2 and the stores are empty on a fresh load —
the product ships with no seeded edits or approvals.

### §1 — THREE VALUES, AND ONLY ONE OF THEM IS A DECISION

    SOURCE     what the ERP supplied. Never written, never overwritten.
    GOVERNED   what Korvyn added, normalized or overrode. Null until somebody decides.
    EFFECTIVE  what Korvyn USES: governed if there is one, else the source. Derived.

**EFFECTIVE IS NOT A THIRD COPY, IT IS WHAT MAKES "PROPOSED" EXPRESSIBLE.** A value waiting for
approval is not governed and therefore not effective; without the third name a pending vendor
would either leak downstream or be invisible. `glxEff()` returns all three plus the pending
request, and the table shows the effective one.

### §3/§4/§5 — AUTOCOMPLETE, NOT A LIST

The editor was a static option list. It is a typeahead now: click, type **Sie**, get *Siemens
AG · Siemens Energy · Siemens Mobility · Siemens USA*, select, done.

**THE REFERENCE LIST IS WIDER THAN THE POPULATION.** `GLX_ROSTER` is the enterprise master —
typing has to reach vendors that have not posted this month, or autocomplete answers a narrower
question than the one being asked.

**IT IS STILL THE ONE POPOVER SYSTEM.** A descriptor marked `ac` renders the input always,
opens on nothing rather than on twenty rows nobody asked for, and §5 offers to CREATE the value.
The shell, anchoring, keyboard and widths are unchanged — "the shell is constant; the content
varies", which is the rule this file already holds.

**A CONTROLLED LIST STAYS A LIST.** `listy` keys off the field's own type and length, so a
three-value custom field gets a list and a vendor master gets typeahead, with nothing to
configure. **And Create is offered when the typing is a NEW VALUE, not while it is still a
prefix**: as long as every match begins with what has been typed the reader is narrowing, and
offering to create "sie" on the way to Siemens Energy is noise.

### §6–§8, §28 — APPROVAL IS PROPORTIONAL AND HAPPENS IN CONTEXT

`glxApprovalNeeded()` returns one of four: **certified period**, **new enterprise value**,
**material classification**, or nothing at all. Open-period normalization saves immediately —
requiring approval for every edit makes the fast path slow and teaches people to batch
corrections instead of making them, which costs the ledger more than the risk it guards.

Where approval IS needed the request is raised **on the row that raised it**: the proposed
value, the source, the current governed value, and one line — *@Mitra Giri vendor omitted in
ERP invoice posting*. The @ opens a roster of people and groups. No admin page, no second
screen. The `GLX_APPR` record carries every field §7 lists and almost none of it is shown.

**§28 — the approver's card** carries the journal, the account, the source value, the proposal,
who asked and why, with Approve / Reject / Open transaction. The object already supports a
delivery channel; email or Teams would read this record rather than a copy of it.

**§20 — ON APPROVAL THE VALUE BECOMES GOVERNED AND THEREFORE EFFECTIVE**, written to the one
store every downstream surface already reads, carrying the approval id. Verified end to end:
send → pending, effective still null, **nothing written**; approve → governed, effective,
in the reference list, one write stamped `APR-0001`, and `glxGovVendor` returns it.

### §9–§13 — THE ROW PANEL

**THE VALUE IS THE CONTROL.** A blue "Edit" beside every row is a column of affordances
competing with the values they act on, and it teaches a reader to aim at the word rather than
the thing. The value is the button, the way a spreadsheet cell is — measured: 9 dimension rows,
9 value-buttons, **0 blue Edit links**.

**§10 + Add dimension** filters the governed fields a transaction can carry, read from the
registries rather than a second list. **§11 + Create new dimension** is three questions — name,
kind of answer, applies to — and the field exists, becomes a column, and is editable without
leaving the row. **§13** origin is stated in the panel (Transaction · Normalization · Rule ·
Inherited from…), never as table clutter.

**§26 Used in is compact and shows only what exists.** Eight cards of which five were greyed out
told a reader mostly about what Korvyn cannot do.

### §22/§29 — THE EXPORT ANSWERS THE AUDIT QUESTIONS

Default: **38 columns** — 5 source, 6 governed, 6 effective, custom dimensions, and a value-source
column per dimension. **Full governed extract: 74 columns**, adding rule/override id, changed by,
changed at, approved by, approval status and effective period per dimension. Forcing that into
every file would bury the figures under their own lineage, which is why it is its own download.

**A visible dimension column IS the effective value**, so it is named *Effective vendor* in the
file — calling it "Governed vendor" produced two columns of that name in one export, which a
reader outside Korvyn cannot resolve.

### §17 — WHERE CORRECTIONS LIVE NOW

Everyday corrections happen in Account Activity. Financial Attributes stays the governance
surface — rules, exceptions, overrides, fields, versions — and the Columns panel links to it
rather than sending anyone there to fix a vendor.

### Verified

**All fifteen §30 scenarios walked in the product.** The two §31 acceptance sentences are both
true: *"typed Sie, selected Siemens Energy, continued working"* and *"clicked Add dimension,
created Funding Source, set Green Bond, and it became available in my GL, reports, audit
extracts and Excel."*

192 view renders across 3 periods, 0 errors · console clean · **4/4 gates** (baselines unchanged)
· 0 nested vertical scrollbars, 0 clipped elements, 0 raw HTML entities across eight surfaces ·
FS-CIP **4,210.2** · chronology 0 · both stores empty on load.

### TWO TRAPS WORTH KEEPING

- **AN INLINE onclick IS EVALUATED WHERE IT FIRES, NOT WHERE IT WAS WRITTEN.** The Create row's
  handler referenced `popQRaw`, which lives in the flux closure, so it threw in global scope.
  The typed value has to be BAKED INTO the attribute at paint time.
- **The Browser pane's console buffer survives navigation.** A fixed error kept reappearing on
  clean loads, with a stack pointing at a test script that no longer existed. An idle load
  cannot fire an inline handler — trust an in-page `window.onerror` listener over the pane's
  buffer, and re-check with one before chasing a ghost.
- And the lowercased copy of a search string is **for matching, not for carrying**: handing it
  to the create button named a new field "funding source".

### NOT BUILT — named, not glossed

- **A rules engine**, unchanged from yesterday: §16's *Create rule* records the rule and applies
  it to the population it matched at approval; it does not re-evaluate as new transactions
  arrive.
- **Approval routing beyond the in-app inbox.** The object carries approver, group and
  timestamps; there is no email, Teams or Slack delivery, which §28 says may come later.
- **A returned status.** `GLX_APPR_ST` declares Pending / Approved / Rejected / Returned and the
  UI offers the first three; returning a request for more information has no surface yet.
- **Inheritance is READ, not WRITTEN.** §13's scope model resolves a value inherited from the
  source account and says so; setting a dimension ON a project or vendor so it reaches every
  transaction is the Financial Attributes surface's job and was not built here.
- Report Builder is untouched, per the brief.



## 2026-09-13 (final) — BULK ENRICHMENT, OVERRIDE CONTROL, AND THE COLUMNS EXIT

Owner's brief, three fixes on the Account Activity experience rather than a redesign. FS-CIP
Jun 2026 = 4,210.2, and every store is empty on a fresh load.

### §14 — ROW → BATCH → RULE IS NOW AN EXPLICIT PRINCIPLE

    ROW    one inline correction · seconds · no ceremony
    BATCH  download → edit in Excel → upload → validate → ONE change set → ONE approval
    RULE   a recurring classification that stops the correction recurring at all

**Forcing batch-scale work through inline editing is the failure this exists to prevent.** A
hundred thousand GL lines cannot be corrected a cell at a time, and approving 3,821 rows
individually is not a stronger control than approving the set — it is the same control
performed badly enough that nobody performs it.

### §1–§9 — THE BATCH PATH

**§4 — EVERY EXPORT HAS AN IDENTITY, and that is what makes the upload safe.** `ENR-2026-06-0001`
records period, scope, lens, filters, row count, mapping and attribute versions, data-as-of,
who and when — **and a per-line fingerprint of the source facts**. Without that an upload is a
pile of rows nobody can tie to anything.

**§3 — the workbook is two halves and says so.** Identity and source columns are marked
`LOCKED — do not change` (17 of them); the governed columns are marked `EDITABLE` (9). A
reader in Excel can see which is which without a legend.

**§6 — nothing is written before a person looks.** Measured on the walked demo: 2,254 rows in
the file, **4,879 changes detected** (3,814 new values, 1,065 changed governed values), **6
rejected**, **8 held back**, $236.4M.

**§7/§8 — THE STALE CHECK OUTRANKS THE TAMPER CHECK, AND THE ORDER IS THE WHOLE DIFFERENCE.**
Both surface as "a source column in the file does not match the source column now". Run the
tamper test first and every line the ERP moved is reported as somebody editing the workbook —
which accuses the preparer of the one thing they did not do and hides the condition they need
to act on. Ask *did the source move?* first; only if it did not is a difference the file's
fault. Caught by reading the counts: 14 "tampered" rows that were 6 tampered and 8 moved.

**§9–§13 — the change set is the unit of approval.** `AC-2026-06-0001` carries the population,
the field-level comparison (field · previous · proposed · rows · amount, drillable to the rows),
the validation exceptions, the source snapshot and the versions in force. Submit with an
@mention; **one decision published 4,879 governed values**. The writes go through the same
`glxEditWrite` an inline edit uses, so provenance, the ERP-sync comparison and every downstream
consumer are one mechanism rather than a second one for bulk (§19, §20).

### §15–§18 — THE OVERRIDE CONTROL WAS THE REAL BUG

Yesterday's policy asked one question — does this need approval? — and so could not express
"say why" as distinct from "ask someone". That is what let an ERP-sourced vendor be replaced
silently. `glxControl()` returns **what is required**, from four inputs in precedence order:

| Case | Situation | Reason | Approval |
|---|---|---|---|
| D | certified period | yes | yes |
| C | overriding an ERP-sourced value | yes | yes |
| — | new enterprise value | no | yes |
| — | material classification | yes | yes |
| B | replacing an existing governed value | **yes** | no |
| A | filling a blank dimension | no | no |

**§15 CASE B — A REASON IS A CONTROL, NOT A QUEUE.** Where the policy asks only for a reason the
change is made immediately and the reason is on the record; routing it to somebody for a
decision nobody asked for is the over-control §17 warns against.

**§17's fast path never reaches the composer at all** — filling a blank returns `none` and saves
on the click. All four cases asserted in the product.

**§28 — the ERP-override case says so in words**: *You are overriding a value the ERP supplied.
The source stays Siemens AG; Siemens Energy is what Korvyn would report.*

### §21–§25 — THE COLUMNS EXIT

The panel had Reset and an × glyph and no plain way out, so a reader reached for the page's
**Back arrow** — which is navigation and takes them off Account Activity entirely. It has a
**Close** button now, and Escape closes it.

**"Close" is not "Done", and the difference is the point.** There is nothing to confirm: every
change is already live in the current view. The word means *finished configuring columns*, not
*save*. Verified: Close and Esc each dismiss the panel, keep the column changes, and leave
`TAB === 'glact'`.

Escape is registered once for the module and closes whichever local thing is open — the add-
dimension picker, the new-field form, the approval composer, the upload preview, the columns
panel — and never navigates.

### Verified

**All fifteen §27 steps and the §28/§29 demos walked in the product.** §30's three acceptance
tests hold: one download → one upload → one review → one change set → one approval covering
4,879 changes; an ERP-sourced vendor cannot be replaced silently; and the page Back arrow is
never needed to leave Columns.

192 view renders across 3 periods, 0 errors · console clean · **4/4 gates** (baselines unchanged)
· 0 nested vertical scrollbars, 0 clipped elements, 0 raw HTML entities · FS-CIP **4,210.2** ·
chronology 0 · all four stores empty on load.

### A NAME COLLISION, AND THE LESSON IS THE ONE ALREADY WRITTEN DOWN

`glxVal` has been the CELL VALUE READER since the ledger was built, with forty call sites. The
upload's validation state took the same name and the whole script block stopped parsing —
"Identifier 'glxVal' has already been declared", every symbol undefined, the page blank.
**A prefix is not a namespace, and that applies to a variable exactly as it applies to a CSS
class.** The newcomer was renamed `glxUp`; the function forty call sites read was not touched.

**And the Browser pane's console buffer survives navigation** — recorded again because it cost
time twice in one session. A fixed error keeps reappearing on clean loads with a stack pointing
at a test script that no longer exists. Trust an in-page `window.onerror` listener.

### PROTOTYPE SCAFFOLDING, LABELLED AS SUCH

**Simulate a completed workbook** (in the Upload menu) fills the governed columns of the last
export the way a preparer would, and deliberately introduces a handful of tampered source cells
and a handful of lines the ERP moved — then goes through the real validate → change set →
approve path. The DETECTION is real; a file this code wrote itself would otherwise never
exercise §7 or §8. It writes no governed value itself.

### NOT BUILT — named, not glossed

- **A real .xlsx enrichment workbook.** The template is CSV with LOCKED/EDITABLE marker rows;
  a genuine workbook would lock the source columns with sheet protection rather than a label.
- **Return-with-comment on a change set.** Return and Reject are both offered and both record
  the decision; neither carries a note back to the preparer yet.
- **Change-set history as a surface.** Sets are reachable from the Upload menu and through the
  live banner; there is no register listing every set for the period.
- **§20's "affected downstream objects"** is not enumerated on the set — the write carries
  `changeSetId` and every consumer reads the resolver, so the link exists in the data and is
  not yet a list on screen.
- Report Builder is untouched, per the brief.



## 2026-09-13 (last) — APPROVED BULK CHANGES PUBLISH INTO THE GOVERNED LEDGER

Owner's brief, closing the loop: an approved upload has to become part of Account Activity, not
stay inside the change set. FS-CIP Jun 2026 = 4,210.2 and every store is empty on a fresh load.

### §2/§3 — APPROVED AND PUBLISHED ARE TWO EVENTS, AND THE GAP IS REAL

A reviewer approving a set is a DECISION. Writing four thousand governed values into the ledger
is an OPERATION, and at enterprise scale a server-side one that can fail halfway. Collapsing
them into one status means a failed publication reads as an approved change nobody can find —
the worst of the three outcomes. So the state machine is Draft → Pending → Approved →
**Published**, with **Failed** as its own state beside them.

**The change set is not a destination** (§2). After publication it reads *Approved and published
to the Governed Ledger*, drops **Submit for approval**, and offers what you actually do with it:
**View affected transactions · Download approved changes · View audit trail**.

### §20/§21 — PUBLICATION IS CHUNKED, COMMITTED AND RECOVERABLE

A million proposed updates is not one client-side loop, and a run that dies at row 600,000 must
not leave a ledger nobody can describe. Each chunk commits and is recorded.

**A FAILURE STATES EXACTLY WHAT COMMITTED.** Verified by interrupting a publication at row
2,000 of 4,495: *"2,000 of 4,495 governed values were committed in 2 chunks; the rest were not
written. Nothing is in an undescribed state."* **Resume continues into the SAME attribute
version** — asserted, because resuming into a new one would make the period's ledger cite two
versions for one decision.

### §22/§23 — EVERY PUBLICATION MAKES A GOVERNED ATTRIBUTE VERSION

`AV-2026-06.1`, linked to the change set that produced it and stamped on every value it wrote.
Without it "the June governed ledger" is not something you can name, and §23's certified case
has nothing to point at.

**§23 — a certified period gets a NEW VERSION, never a rewrite of the signed one.** The published
set says so and names what is marked Review required: *N audit population, N reports and N
reconciliations.*

### §12 — THE WORKFLOW IS VISIBLY CONNECTED

**View affected transactions** returns to Account Activity filtered to the change set — the
membership read off the governed store rather than a list the set keeps — with a banner naming
the set, an **Open change set** link back, and Clear. Measured: *2,240 transactions changed by
AC-2026-06-0001*.

### §16/§17 — ONE LINEAGE, WHICHEVER PATH PRODUCED THE VALUE

`GLX_SRC` gives Manual edit · Bulk edit · Bulk upload · Rule one vocabulary. **A lineage spelt
three ways is three lineages.** The governed-dimension row in the panel reads:

> Vendor · Vertiv Holdings · Override · source Siemens Energy · **Bulk upload ·
> AC-2026-06-0001** · Mitra Giri · approved by Mitra Giri · **AV-2026-06.1** · effective Jun 2026

### §7 — THE THREE VARIANTS ARE AVAILABLE, NOT DEFAULT

Seventeen new columns in their own **GOVERNED DIMENSIONS** group — Source / Governed / Effective
for each dimension, plus Change source, Change set and Attribute version under LINEAGE. **None
is a default**: the table shows the effective value in one column per dimension, because three
columns per dimension is a ledger nobody can read.

### §10/§17 — THE FILES

**Full governed GL** (35 columns) carries source, governed and effective as first-class columns.
**Audit-ready GL** (101 columns) adds change source, change set, reason, prepared by, approved
by, approval date, attribute version, effective period and value source per dimension. A single
row answers §17 end to end:

| | |
|---|---|
| Source vendor | Siemens Energy |
| Governed vendor | Vertiv Holdings |
| Effective vendor | Vertiv Holdings |
| Change source | Bulk upload |
| Change set | AC-2026-06-0001 |
| Approved by | Mitra Giri |
| Attribute version | AV-2026-06.1 |

### THE BUG THAT MATTERED, AND IT WAS IN THE FILE

**The screen resolved and the export did not.** A visible dimension column renders through
`glxCellVal`, which asks the resolver; the export fell through to the generic `glxVal`, which
reads the row's own field — the SOURCE. So an audit file said *Effective vendor = Siemens
Energy* beside *Governed vendor = Vertiv Holdings*, which is the one contradiction §17 exists to
prevent. **Caught by reading a row of the file, not its headers** — the column names were right
the whole time.

### Verified

**§27's acceptance test passes.** After approving and publishing an uploaded change set, the
governed values are on the affected transactions in Account Activity with their provenance
dots; the Governed GL download carries the non-GL fields; the Audit-Ready GL distinguishes what
the ERP supplied, what Korvyn added, what Korvyn reported, who approved it and which change set
produced it. **The manual path is untouched and still works for one row.**

192 view renders across 3 periods, 0 errors · console clean · **4/4 gates** (baselines unchanged)
· 0 nested vertical scrollbars, 0 clipped elements, 0 raw HTML entities · FS-CIP **4,210.2** ·
chronology 0 · all stores empty on load · publication of 4,879 values in 5 committed chunks ·
the interrupted-then-resumed run lands in one attribute version.

### NOT BUILT — named, not glossed

- **Publication is chunked in the browser, not server-side.** The SHAPE is right — commit
  boundaries, a recorded chunk log, resume-from-committed, one version per set — and a
  deployment moves the loop behind an API without changing the objects. §20 asks for
  server-side and this prototype cannot be.
- **§23's "affected certified outputs" are counted, not marked.** The set states which audit
  population, reports and reconciliations need re-reading; nothing writes a Review-required flag
  onto those objects. R6's detection is the mechanism and the wiring is its own pass.
- **A change-set register.** Sets are reachable from the Upload menu, the live banner and the
  filter chip; there is no page listing every set for the period.
- **Rules still do not re-evaluate** as new transactions arrive — unchanged, and the third rung
  of ROW → BATCH → RULE is therefore the weakest of the three.
- Report Builder is untouched, per the brief.



## 2026-09-13 — WHERE THINGS STAND (read this before picking up Account Activity)

Orientation, not a retrospective. The eight dated blocks above carry the reasoning; this is the
map of what is finished, what is deliberately unfinished, and what a fresh session should not
go looking for.

### Finished, and verified in the product

**Account Activity is the governed ledger.** Source facts, mapping, governed dimensions, custom
fields, financial attributes and lineage over one population (`rcTxPool`), with three ways to
change a governed value — **ROW → BATCH → RULE** — all publishing into the same store, and one
resolver (`glxDim` / `glxEff`) that every downstream surface reads.

**The enterprise table scrolling standard** (`.ktbl`) carries every primary table: one page
scroll, a floating header, one synchronised horizontal bar, measured frozen columns.

The standing invariants are unchanged and are the first thing to re-assert after any edit:
**FS-CIP Jun 2026 = 4,210.2** · A = L + E at 0 · `rcChronologyCheck()` = 0 · 192 view renders
across 3 periods with 0 errors · 4/4 gates · every governed store empty on a fresh load.

### Deliberately unfinished — do not treat these as bugs

| | |
|---|---|
| **Publication is browser-side** | §20 asks for server-side. The SHAPE is right — commit boundaries, a chunk log, resume-from-committed, one attribute version per set — and a deployment moves the loop behind an API without changing the objects. |
| **Certified impact is counted, not marked** | A published set names the audit population, reports and reconciliations needing re-reading; nothing writes a Review-required flag onto those objects. R6's detection is the mechanism; wiring it is its own pass. |
| **Rules do not re-evaluate** | *Create rule* records the rule and applies it to the population it matched AT APPROVAL. Nothing re-runs as new transactions arrive, so **RULE is the weakest of the three rungs** and is the highest-value thing to build next inside this module. |
| **No change-set register** | Sets are reachable from the Upload menu, the live banner and the change-set filter chip. There is no page listing every set for a period. |
| **The enrichment workbook is CSV** | With `LOCKED`/`EDITABLE` marker rows. A real .xlsx would lock the source columns with sheet protection rather than a label. |
| **Approval routing is in-app only** | The object carries approver, group and timestamps; no email, Teams or Slack delivery. §28 says that may come later and the record is already the right shape for it. |
| **Return-with-comment** | Return and Reject record the decision on both single approvals and change sets; neither carries a note back to the preparer. |
| **Inheritance is read, not written** | A value inherited from the source account resolves and says so. SETTING a dimension on a project or vendor so it reaches every transaction belongs to Financial Attributes and was not built. |

### Partially resolved — worth knowing so it is not re-chased

**`glTxns()` / `GL_ACT` is no longer Account Activity's model** — that screen reads the governed
population now. But `glTxns` still serves the GL overview drill-downs and two reconciliation
detail panes, so the file genuinely still has two transaction readers. Retiring the second one
is its own pass and is not urgent.

**The generic Korvyn-for-Excel browser workbook** (the More launcher, and Open in Excel on
Financials / Flux Review / Trending / the Trial balance) still renders the R7.1 grid with
Insert. The Account Reconciliations reset replaced that surface only for reconciliations;
retiring it everywhere is a product call the owner has not made. `.xl-grid-wrap` is the one
primary table that keeps an internal vertical scrollbar, for the same reason.

### Not started, and named by the owner as next

**Report Builder.** Every brief since 2026-09-12 has ended "do not proceed to Report Builder
yet". The governed ledger is now the population it would read.

### The traps that have each cost a session

- **Never pass replacement text through the shell** — recorded eight times. Write the splice
  script with the Write tool. A quoted heredoc still eats `\'`.
- **A prefix is not a namespace**, and it applies to a VARIABLE as much as a CSS class:
  `glxVal` was the cell-value reader with forty call sites and a new `let glxVal` took the whole
  script block down.
- **The Browser pane's console buffer survives navigation.** A fixed error keeps reappearing on
  clean loads. Trust an in-page `window.onerror` listener.
- **Read a ROW of an export, not its headers.** The column names were right while the values
  were wrong for a whole pass.


## 2026-09-13 — REPORT BUILDER: the foundation pass

Owner's brief. **ACCOUNTING operates the close; REPORTING consumes, reshapes, analyses, exports
and publishes governed financial information.** One governed data foundation, many configurable
reporting experiences. FS-CIP Jun 2026 = 4,210.2, chronology 0, every governed store empty on load.

**Where it lives.** Inside the existing Reporting lens (`filings`), no new module. Rail:
**Financial reporting** (Report Builder `rbuild` · Saved Reports `rsaved`) · **External reporting**
(Dashboard · Filings · Working Papers · Review Center · XBRL · Filing packages — `freports`
renamed from "Reports" so two things are not called Reports) · **Governance** (Tasks · Issues).
Published and Scheduled Reports are NOT in the rail: a rail item that renders nothing is a dead
control, and the brief stops before them.

**NO SECOND DATA MODEL.** The whole block (`rbCatalog`, `rbRun`, `rbCompile` … search `REPORT
BUILDER — FOUNDATION`) reads `glxRows()` for GL lines, `glxDim()` for effective dimensions,
`glxCellVal()` for attributes and custom fields, `glxMap()` for mapping and `tbxTbRows()` for
balances. Delete it and not one number moves.

- **The catalog is built on every ask**, so a governed field created in Account Activity lands
  under CUSTOM GOVERNED FIELDS with no wiring (`RB_ATTR_HOME` places only the seeded attributes).
  Verified by creating one live. Two field DEFINITIONS were added to `ENR_FIELDS`
  (`EF-FUNDSRC` Funding Source, `EF-COMMST` Commissioning Status) — definitions, no values.
- **Vendor / Department / Cost center / Project / Region / Business unit mean the EFFECTIVE value.**
  Source / Governed / Effective variants sit behind "Show source and governed variants".
- Fields the book's ERPs do not supply (Customer, Customer ID, IC counterparty, Data hall) stay in
  the catalog marked **not supplied** rather than reading as empty.

**TWO AMOUNT BASES, and the difference is the accounting (§14).** *GL activity* sums governed lines.
*Balances* reads the governed trial balance per source account: a balance-sheet account is its
**month-end balance**, an income-statement account its **period activity** or **year to date**.
Summing across accounts at one date is a trial balance; summing a balance across months is not — so
a balance report has **no across-period Total column and no grand total** (its rows mix balances
with activity). Fields that live on GL lines, not accounts, refuse on the balance basis by name.

**A REPORT IS A QUERY DEFINITION.** `rbCompile()` states the server query (dataset, selection,
window, filters, scope, lens, reader, versions, `pinned:false`); `rbRun()` is the prototype executor
over the modelled sample, cached per definition + generation. The preview states the enterprise
population (`× XL_POP_SCALE`) as resolved server-side and never loads it. `RB_REPORTS` stores
definitions only; five samples (Monthly Trial Balance, Governed GL Detail, CIP by Project, Vendor
Spend by Project, Department Expense Analysis) are ordinary definitions opened in the one builder.

**REPORTING CONTEXT ≠ CLOSE CONTEXT.** The report's `period` (Month · Quarter · QTD · YTD · Fiscal
year · Prior fiscal year · Rolling 12 · Month vs prior year · Custom range) never writes
`VIEW.period` or `BOOK.open`; the Period row says "Accounting close stays Jun 2026". Months after the
open period are excluded and counted, never extrapolated. The platform filter band is hidden on both
pages (`gfBarHidden`) — it would be a second, contradicting period control.

**PERMISSIONS RUN AS THE READER, AT RUN TIME** (`rbPermit`, `resolveEffectiveAccess`), never stored in
the definition, so sharing cannot widen access. Enterprise / audit / function scopes see everything;
otherwise **every constraint a scope declares must hold** (region AND projects) and scopes union.
The first cut read them as alternatives and let an Ashburn line on an EMEA entity through for the
Americas Development scope — caught in test. A scoped reader is refused the balance basis (balances
are held per account across every entity). The lens must be VIEW-able.

**Menus are the one popover** (`rbFieldDesc` delegates from `RCFIELD`, keys `rc:rb.*`). A multi-select
filter commits and stays open by closing, repainting and re-opening on the rebuilt trigger
(`rbKeepOpen`) — `paintPop` is not exported from the flux closure.

**Export (§23)**: one flat table (`rbTable`) — every row field its own column, a Row type column for
subtotals — into CSV (metadata block first) or an Excel workbook (Report sheet with freeze and
autofilter, Metadata sheet: name, period, scope, lens, currency, basis, generated at/by, Governed
Ledger version, mapping version, attribute version, data as of, filters, close context, and
"Management report — not an official governed financial statement"). **Open in Excel** uses the
existing prototype path: `XL_OBJECT_TYPES.RB_REPORT` + an `xlResolve` branch make the report a
connected range of its definition (`__working` for an unsaved one).

**Trace (§25)**: every summary cell keeps the values that identify its node; clicking one lists the
governed lines and source accounts behind it (or the trial-balance accounts on the balance basis)
and routes a single-account node into Account Activity filtered to that account.

**Verified:** the three §31 users' reports built in the product (Jan–Jun balances by account; CIP by
project, vendor and month; June lines ≥ $1M with source and governed vendor → 79 lines) · all five
samples run in 26–130ms · 210 view renders across Jun 2026 / Mar 2026 / Dec 2025, 0 errors ·
console clean · 4/4 gates (baselines unchanged) · export content read back · Save / Save as /
Duplicate / Share / Archive · Open in Excel lands a connected range.

**Deliberately NOT built (the brief stops here):** Published and Scheduled Reports · the Excel
add-in's Refresh / Trace / Publish for a report · variance, %, QTD/YTD measures and formulas ·
analytical recast · persistence (reports are in-memory like every other store) · sensitive-dimension
tagging (the permission hook exists; no field is tagged) · an Open-in-Excel return strip from the
builder.

## 2026-09-13 (later) — REPORT BUILDER: simple on the surface

Owner's brief: keep the foundation, make building a report take 15–30 seconds. **The engine is
unchanged in kind** — Governed Ledger, definitions not data, server-side query, reader permissions.
What changed is what a controller has to think about.

**THE CONFIGURATION IS FIVE QUESTIONS.** Analyze by · Compare / Columns · Period · Filters · Value.
The left-hand field catalog is gone; every "+ Add" opens the **one popover** as a search-first picker
(`rbPickOpts`), grouped Accounting → Lineage. Typing "vendor" returns Vendor (effective value),
Vendor ID and the Source / Governed / Effective variants. Custom governed fields are in it with no
wiring.

**§6 — INFERENCE, NOT MODES.** A definition stores what was chosen; `rbEff()` resolves what it means
and is the only form the engine reads. Layout is inferred — Posting date, Journal, Memo, Document or
Source transaction ID in Analyze by makes it **line detail** (one row per GL line, the value appended,
no columns) — and only Advanced options overrides it. The Advanced line beside the toggle states
what was inferred ("Summary (automatic) · GL activity · Nested").

**ADVANCED OPTIONS, collapsed:** Basis (GL activity / Balances) · Layout (Automatic / Summary / Line
detail) · Row display · Subtotals · Income statement (balances only) · **Dimension values**
(Effective / Source / Governed — remaps the plain dimension fields in `rbEff`) · Records (all /
source GL / Korvyn governed) · Currency (stated, not a control — the lens owns it).

**PERIOD AND COMPARISON (§14, §15).** Current month · Prior month · Month · Quarter · Year to date ·
Fiscal year · Rolling 12 · Custom. **Comparison is a second window, not an engine** (`rbCmpWindow`):
prior period shifts by the window's own length, prior year by twelve months keeping the window's
words — Jun 2026 vs May 2026, YTD Jun 2026 vs YTD Jun 2025. The table shows both windows and a Change
column; balances compare balance-sheet accounts at each window's end.

**§7 TEMPLATES** (Trial Balance · GL Detail · Vendor Analysis · Project Analysis · Department Analysis ·
Custom) preconfigure the one builder. **§8 ASK KORVYN** (`rbAskParse`) is rule-based and PROPOSES:
the request becomes the visible configuration plus a card listing what was understood, with Undo;
nothing is saved and the engine computes every figure. "for all entities" is the absence of a
filter, not a dimension — the first cut added Entity and the balance basis refused it.

**AN OPENED REPORT READS AS A REPORT.** Open shows a one-line summary and Edit report; New and Edit
show the configuration. Header: inline-renameable title (click, Enter/blur saves) · Save · Save as ·
Download · Open in Excel · •••  (New, Rename, description, Edit/Hide configuration, View history,
Duplicate). An amount opens a menu — **View contributing rows**, and Open in Account Activity for a
single account through `navGo`, so Back returns to the report exactly as it was (`rbNavCtx`).

**SAVED REPORTS (§16–§22).** My Reports · Shared with Me · All Reports; Report name opens (double-click
renames); one ••• menu: Open · Rename · Edit report · Duplicate · Share / Permissions · View history ·
Archive (history kept) · Delete (inline confirmation). **History says what changed** (`rbDiffWhat`):
Renamed, Changed analyze by, Changed period definition, Changed filters, Changed advanced options…;
Save with no difference does not bump the version.

**DOWNLOAD IS STATIC; OPEN IN EXCEL IS A CONTRACT (§23–§31).** The Download menu is headed "Static
file — not connected" and the file's metadata says so. Open in Excel opens a handoff dialog: Excel
opens → the Korvyn Add-in loads → a connected workbook on this report; the workbook is native Excel.
It lists exactly what is passed to the add-in (`rbXlContract`: report id/version, scope, period,
comparison, currency, basis, analyze by, columns, filters, value, Governed Ledger / mapping /
attribute versions) and the panel's actions (Insert, Refresh, Trace, Change period, Change scope,
Publish). An unsaved report must be saved first. **The browser "Korvyn for Excel" screen is labelled
"Excel Add-in prototype"** (`rbXlProtoNote`) when a report lands there, with the standard return
strip back to the report. Nothing here edits cells, evaluates formulas or builds pivots.

**Verified:** Vendor Analysis template → Jan–Jun → Month → preview in under half a second · both §33
sentences and the §31 auditor sentence parse to the expected configuration (79 lines ≥ $1M) · field
search, inference, both comparisons, balance TB with no grand total · rename, duplicate, share,
archive, history, delete, save-with-diff (v4 "Changed period definition") · handoff dialog saved and
unsaved · prototype label and Back · static CSV/Excel metadata · render sweep across three periods ·
console clean · 4/4 gates · FS-CIP 4,210.2.

**Not built:** Published / Scheduled Reports, the real add-in, variance % and formulas, persistence,
an LLM behind Ask Korvyn (the parser is deterministic and says when it finds nothing).

## 2026-09-13 (last) — REPORT BUILDER becomes an analysis surface: ask → view → manipulate → explain → drill → Excel

Owner's brief. Same engine, same saved definitions, same Saved Reports; what changed is that the
**result dominates** and configuration recedes. FS-CIP 4,210.2, stores empty on load.

**THE PAGE.** A blank analysis opens on "What do you want to understand?" (one Ask Korvyn input, six
prompts the data can honestly answer — "Payroll by department" was dropped because this book has no
payroll accounts — and templates as quiet links). Once a report exists: header → **context ribbon**
(every part of the question is a chip: Project → Vendor · Monthly · Jan–Jun 2026 · filter chips ·
lens · currency) → **one action row** (+ Dimension · + Filter · Compare · Explain · Configure · the
command bar · Table|Chart) → a one-line Korvyn confirmation with Undo → up to four "Next" suggestions
→ the result. **Configure** is the full builder, unchanged, inside the right-side panel.

**ONE COMMAND BAR, TWO JOBS (`rbCmdRun`).** A whole question builds (`rbAskParse`); anything that reads
as a change edits the analysis on screen (`rbEditApply`): add / remove / group by / break this down by ·
monthly / quarterly / totals · compare June to May, to last year, prior quarter, prior YTD, a named
month (`compare:'m:YYYY-MM'`) · only capital / expenses / CIP / a named entity, project or vendor ·
changes above $5M (`minChange`, and it turns comparison on) · amounts over $1M (`minRow`, or a line filter
in detail) · show GL detail / summary · source|governed|effective vendor instead · debit / credit ·
sort by change or amount · chart / table. **Reporting AI edits the analysis definition and nothing
else**, and every edit shows what changed with Undo.

**THRESHOLDS AND SORT ARE DISPLAY RULES, NOT QUERY RULES.** `rbKids()` is the one order-and-visibility
function the table, chart and exports all read; a threshold hides detail rows and a subtotal still states
its whole group (the stat line says so). Change % reads **n/m** when the base is below the display
precision and caps at ±999%.

**DIRECT MANIPULATION.** A dimension chip opens Change dimension / Move left / Move right / Add level
below / Remove (`rbDimOp`). A row label opens Filter to · Analyze by <next dimension> (filters the path
and replaces the levels below — "Siemens Energy → Project") · Explain · View transactions
(`rbLabAction`). An amount opens **Explain · View contributors · View GL detail · Trace**.

**EXPLAIN IS DETERMINISTIC AND CARRIES ITS ROWS (`rbExplainData`).** The engine sums the governed lines
the target resolves to; the sentence only arranges the figures. Movement against the comparison window, or
against the prior month for a monthly column; composition otherwise. Drivers are the **next level of the
analysis** (below the last level, the first governed dimension not already used), accounts are canonical
accounts, and a line lacking the driver is "No vendor", never "(blank)". The panel shows the figure, the
prose, top drivers, contributing accounts and a Supporting data block (report, period, scope, currency,
path, selection, filters, dimension values, row count, Governed Ledger / mapping / attribute versions).

**VIEW GL DETAIL LANDS ON EXACTLY THOSE ROWS.** `glxRbDrill` (a set of `glxKey`s) filters Account
Activity's `glxView`, with a banner and Clear, when every contributing line is in the close period Account
Activity reads; otherwise the lines open in the panel and it says why. Back restores the analysis with its
panel and selection (`rbNavCtx`). **Trace** shows report amount → governed dimensions → GL population →
ERP source.

**Verified:** demo 1 (blank → "Show CIP by project and vendor monthly from January through June" →
Jun $53.0M → Explain +$18.3M vs May → View GL 176 lines → Back), demo 2 ("Compare June to May and add
department" → Vendor → Project → Department with May · Jun · Change · Change %), demo 3 (Siemens Energy
→ Analyze by Project), seventeen chained commands, chart, trace, config drawer, saved report reopening
into the result-first page · render sweep across three periods · console clean · 4/4 gates.

**Not built:** a language model behind the command bar (deterministic, says when it cannot act),
line charts, a trace graph, persistence, the Excel add-in.

## 2026-09-14 — REPORT BUILDER: one universal canvas (Fields → Columns → Rows → Filters → Live Preview)

Owner's brief. **Every report is the same object.** Trial balance, GL detail, vendor spend and a P&L are
configurations of the one engine; a template pre-fills the builder and is then gone. Supersedes the
2026-09-13 context ribbon and action row. Engine, saved definitions, Explain / Trace / View GL, the Excel
handoff and Saved Reports are unchanged underneath. FS-CIP 4,210.2, stores empty on load.

**THE PAGE** (`renderRBuild` in the `ONE UNIVERSAL CANVAS` block): header (editable name · Save · Save as ·
Download · Open in Excel · •••) → top row (**Period** chip + From/To or Through · Compare · "Close stays
Jun 2026" · the persistent **Ask Korvyn** bar) → a one-line confirmation with Undo → a three-part grid:

| Left `rb-cat4` | Middle `rb-bld4` | Main `rb-main4` |
|---|---|---|
| FIELDS: search first; groups; source/governed/effective variants only when searched | COLUMNS · ROWS (nested, indented) · FILTERS (`Field = value`) · VALUE · Report settings (collapsed) | the live preview: table or chart |

Catalog and builder are bounded sticky panels (their `top` is measured from `ktblChromeBottom()`); the
preview keeps the page scroll and `.ktbl`. Below 1280px the builder stacks under the catalog.

**ONE DEFINITION, FOUR WAYS IN.** Dragging from the catalog (`rbDragStart` / `rbDrop(ev,zone,at)` — a
field dropped on a chip inserts above it, so Department dropped on Vendor gives Project → Department →
Vendor), clicking a field (Add to rows / columns / filters), a template, and Ask Korvyn all write the
same definition. Chip menus: Change field · Move up/down · Add level below · Sort rows (name / largest
amount / largest change) · Subtotals · Value shown (Effective / Source / Governed) · Remove.

**LIVE PREVIEW WITH A LOADING STATE.** `rbTouch()` sets `rbBusy`: the previous result paints dimmed under
"Updating preview…", then the engine re-runs. A server-side run would hold the same state longer.

**TEMPLATES ARE CONFIGURATIONS** (Blank · Trial Balance · GL Detail · Vendor Spend · Project Activity ·
Department Expense · Financial Statement View) and appear only in the empty preview, beside four Ask
prompts. **Saved Reports no longer shows a Type column** — the type is inferred metadata, not a mode.
Seeds now include Capital Spend by Vendor, Department Expense Trend (rolling 12) and Corporate Income
Statement (a management view, explicitly not the certified statement).

**STATEMENT SHAPES.** Account group (Revenue / Operating Expenses) → Financial statement line → Account,
filtered to the Income statement, is a P&L; `rbFsOrd()` sorts those two fields in **statement order**, not
alphabetically, and Account group falls back to the line's parent for governed records. "Build a P&L by
month" and "balance sheet" requests build that shape (a balance sheet on the balance basis). A custom range
may run past the open period: Jan–Sep 2026 keeps its label and counts "3 months not yet open".

**Charts:** Bar for any summary; Line when the columns are time (top four first-level rows, ramp-into-accent
series, dashed for the second pair, every point clickable into the amount menu). A row with no value for a
governed dimension reads "No vendor" in the table, the same words Explain uses.

**Verified:** blank canvas, P&L Test (Jan–Sep 2026, Revenue first), Capital Spend by Vendor (Capital, YTD Jun
2026, 77 rows), field search for vendor and department, drag Department between Project and Vendor, reorder
within Rows, AI CIP report, amount menu (Explain · View contributors · View GL · Trace · Open in Excel), Explain
panel, Report settings, line chart, Saved Report reopening in the same canvas · render sweep · console clean ·
4/4 gates.

**Not built:** per-level subtotal or sort settings (both are report-wide), a per-column field setting, scenarios,
persistence, the Excel add-in.

## 2026-09-14 (later) — REPORT VIEW, EDIT REPORT, and the full GL drill

Owner's brief. **Report Builder creates the definition; Report View presents the finished result.** Same
engine, same definitions, same Saved Reports. FS-CIP 4,210.2, stores empty on load.

**TWO STATES (`rbMode`).** A saved report opens in **Report View** (`rbOpen(id)`); New and Saved Reports' Edit
report open **Edit Report** (`rbOpen(id,true)`, `rbNew`). Edit's **Save** writes a version and returns to the
view (`rbEditSave`); **Cancel** restores the stored definition and returns (`rbEditCancel`), or goes back to
Saved Reports for a report that was never saved. Save as from either state lands in the view.

**THE VIEW IS TEMPORARY, THE DEFINITION IS NOT.** Period, Compare and Filters in Report View write `rbVS`
(`patch` + `filters`) over the saved definition; `rbActive()` is what every reader runs — preview, Explain,
Contributors, Trace, drill, both downloads, the Excel contract — and in Edit it is simply the definition.
Saved filters show as muted chips ("Edit report to change"); temporary ones are removable, with Reset and
**Save as new report**. Row labels in the view offer Filter this view · Explain · View GL · Analyze
differently (→ Edit report); structural changes stay in Edit.

**THE FINISHED PRESENTATION (`rbPreviewHTML`, `rbFlatFin`).** Display is **Standard · Financial · Compact**,
inferred (`rbDisplayOf`: balances, statement filters or statement rows → Financial; line detail → Compact;
otherwise Standard), saved under Report settings and switchable per view. **Financial** renders each group as
a header row (depth 0 is a section band, uppercase), its striped detail, then **Total <group>**, with the top
level's total stronger; **Standard** keeps parent rows carrying amounts; every display stripes detail rows
(`rb-alt`, `--n-50`), removes cell hairlines, and closes with a double-ruled grand total (`rb-gtot`). Sticky
headers, frozen label column and the synced horizontal bar are the `.ktbl` standard. Comparison columns read
**Variance / Variance %**.

**EDIT IS COMPACT.** A 272px builder beside the preview that **collapses to a 32px Configure rail**
(`rbBldCollapsed`) — the table went 901px → 1141px — with state intact. The field catalog is a **drawer**
(`rbFieldsOpen`, positioned beside the builder) for dragging; "+ Add" still opens the search-first popover.
Drop targets appear only while dragging (`body.rb-dragging`).

**VIEW GL IS THE COMPLETE GOVERNED POPULATION (`rbGL`, `rbGLHTML`).** Any amount, any period — not only the
close period Account Activity reads — on Account Activity's own column registry and resolvers (`glxAllCols`,
`glxCellVal`, `glxEff`, `glxCellHTML`, provenance dots). Header: selection · period · report amount · line count;
context (report, selection, scope, period, filters, currency); a **reconciliation strip** (report amount · GL
population · difference · Reconciles), with a comparison cell reconciled as current less comparison; a Columns
picker over every field including source / governed / effective variants; pages of 100 with a total over all
lines. **Download Excel / Download CSV** are that exact population with a manifest (report and GL totals,
difference, versions); **Audit-ready Excel** adds source, governed and effective values and lineage. Open
Account Activity appears only when every line is in the close period. Return to report restores scroll,
selection and expansion; `rbNavCtx` also carries mode, view state and the drill.

**Verified:** Corporate Income Statement opens Financial with no builder zones (Revenue / Base Revenue headers,
Total Base Revenue / Total Revenue, grand total) · Edit → 272px builder, drawer, collapse to rail and back with
rows intact · Cancel leaves v1, Save writes v2 and returns · Capital Spend by Vendor Standard with 33 striped rows ·
temporary filter and Compare leave the saved definition untouched · Schneider Electric · Mar 2026 → 34 lines,
$3.912M reconciles to $3.912M, CSV 34 rows × 42 columns with manifest, audit file carries source and governed
vendor · return keeps the selected amount · 4/4 gates.

**Not built:** presentation sign flips (revenue shows in its natural credit sign, so a P&L grand total is a net,
not "Operating income"), per-level subtotal labels, persistence, Published / Scheduled Reports, the add-in.

## 2026-09-14 (last) — blank new report, blue-white banding, a clean Excel report

Owner's refinements on top of Report View / Edit Report.

**REPORT BUILDER STARTS BLANK.** Arriving at Report Builder — rail, Reporting lens, or choosing it while a
saved report is open in view — opens a blank **Untitled Report** in edit (`rbBlankReset`). The render dispatch
detects arrival (`_rbPrevTab`) and `pickTab` handles the same-tab case; only `rbOpen` (Open / Edit report) and
Back (`rbNavCtx().restore`) carry a definition in, by setting `rbIntent`. The empty preview offers "Start from
template": Trial Balance · GL Detail · Financial Statement · Vendor Spend · Project Activity · Department Expense.

**BLUE-WHITE BANDING (owner's direction — an addition to rule 1's ramp-only palette, scoped to report tables).**
`.rb-rep` declares four tints of `--accent` over the surface via `color-mix`: `--rb-stripe` 5% (alternating detail
rows, continuous through the whole report), `--rb-sub` 8% (subtotals, Standard parent rows), `--rb-band` 13%
(section headers and top-level totals), `--rb-grand` 16% over `--n-100` (grand total, double-ruled). Derived, so
dark mode follows, and quieter than a selection (`--accent-bg`). The stretched last column is fixed
(`.ktbl table.rb-rep th:last-child{width:auto}` over `.rcx-tbl th:last-child{width:100%}`).

**THREE DOWNLOADS, NEVER MIXED.** Report View → **Excel** is `rbExportPresentation`: ONE sheet, the report only —
name, period, lens, currency, a blank row, then the table — with the view's columns, hierarchy (`rbPresRows`,
fully expanded), indentation (`mso-char-indent-count`), banding in the light accent's tints (`RB_XL`), subtotal
and double-ruled grand total, column widths, frozen panes, gridlines off and `#,##0.0_);(#,##0.0);-` / `0.0%`
formats. **CSV** is the same report table under the same four-line heading. **Excel with report definition** (menu
› Advanced) keeps the old workbook with its metadata sheet (`rbExportDefinition`). View GL keeps its own Excel /
CSV / Audit-ready population exports.

**Verified:** blank from the lens, from Saved Reports and from a same-tab rail click; Open, Edit report and Back
still carry the report · computed stripe / sub / band / grand tints · Corporate Income Statement and Capital Spend by
Vendor Excel: 1 sheet, no metadata, banding, REVENUE / Total Revenue, indentation, number formats, frozen panes ·
CSV has no metadata · definition export still has its sheet · 4/4 gates.

## 2026-09-14 (IA) — Reporting structure, placeholders for management reporting, typed From / To

Owner's brief. Establishes the information architecture only; detailed Management Reporting, narrative,
board books, distribution, External Reporting redesign, Audit and the full Excel add-in are NOT built.

**THE RAIL** (`RAIL_SPEC.filings`): **Reporting** (Report Builder · Saved Reports) · **Management reporting**
(Reporting Packages · Published Reports) · **External reporting** (Dashboard · Filings · Working Papers · Review
Center · XBRL · Filing Packages) · **Governance** (Tasks · Issues). The "Financial reporting" parent is gone.
Management reporting assembles finished outputs; it is not a second report builder.

**REPORTING PACKAGES** (`rpkg`, `RB_PACKAGES`, `renderRPkg`) — Package name · Period · Owner · Status (Draft / In
review / Published) · Last updated, with June 2026 CFO, Q2 2026 Management and May 2026 CFO. A package's
`contents` are REFERENCES by type and id (`RB_PKG_REF_TYPES`: saved report, financial statement, flux,
reconciliation, Excel workpaper, narrative), never copies; a row expands to list them and each opens its owner.

**PUBLISHED REPORTS** (`rpub`, `RB_PUBLISHED`, `renderRPub`) — Report / package name · Type · Period · Published by
· Published date · Version. `rbPubPin()` freezes the snapshot record on first read: definition id and version,
period, scope, lens, currency, Governed Ledger / mapping / attribute versions, author, approval, timestamp. **A
published report opens in the ONE Report View** (`renderRBuild(target)` renders into `view-rpub`) with a return
strip and a pin line and no Edit report. The prototype re-runs the pinned definition and period; storing the
result is not built. Published packages do not open yet.

**TYPED FROM / TO** (`rbParseMonth`, `rbRangeInputs`, `rbMonthInput`) sit beside the period presets in both the
builder bar and the Report View bar, one markup. "Feb 2025", "February 2025", "Feb-25", "02/2025" and "2025-02" all
normalise to `2025-02` and display "Feb 2025"; anything else marks the field and says what it accepts. Typing a
month turns the period into a `range`, clamps a from before `RB_FIRST` with a note, and swaps a reversed pair. The
header reads **"Feb 2025 – Jul 2026"**, not "Custom period". Compare stays its own control.

**A RANGE KEEPS ITS ASKED-FOR MONTHS.** `rbWindow` still excludes months after the open period from `months`
(nothing is posted there, nothing is extrapolated) but returns them in `span`, and a monthly report adds the
missing columns, so Feb 2025 – Jul 2026 shows 18 columns with Jul 2026 empty and "1 month not yet open" stated.
GL drill resolves across the governed months (verified: 1,076 lines over 17 months, diff 0). The note
**"Accounting close remains Jun 2026"** travels with the inputs; `VIEW.period` and `BOOK.open` are never written.

**EXPORT HEADER** gains the basis line: name · period / range · lens · USD millions · US GAAP (Excel, frozen rows
now 7; CSV the same five lines).

**Verified:** rail order and labels · 216 view renders across 3 periods, 0 errors · the four parse forms plus a
rejected one · range label, 18 columns, not-open count · GL drill across the range and Return restoring it ·
published report opens striped with its pin and no edit · package contents expand · CSV / Excel header · FS-CIP
4,210.2 · chronology 0 · 4/4 gates (baselines unchanged).

## 2026-09-14 (shell) — PLATFORM SHELL RESTRUCTURE + SLOANE FOUNDATION

Owner's brief. **KORVYN** is the governed accounting operating environment, **SLOANE** the embedded
financial intelligence agent, **EXCEL** the connected work surface. Navigation, shell and AI-surface
terminology only — no feature page rebuilt, no Settings redesign, no route or data deleted.

**TOP NAV is Home · Accounting · Reporting · Audit · …** (`LENS_ORDER`). Fixed Assets, Procurement, FP&A and
Treasury left the ribbon; their lenses stay defined, so every existing `pickLens('assets'|'procure'|'fpa'|
'treasury')` deep link still resolves as a **hidden legacy route**. They were never in the More launcher, and
global search iterates `LENS_ORDER + UTIL_ORDER`, so they left search with the ribbon. Home's own pulse rows
still name them as source context (Home was not redesigned).

**ACCOUNTING RAIL** (`RAIL_SPEC.ledger`): Overview · *Source & ledger* (Chart of Accounts · Trial Balance ·
Account Activity) · *Review & analysis* (Financials · **Analysis** · **Flux Analysis** · Reconciliations) ·
*Close & control* (Close · Continuous Close · Intercompany · Exceptions) · *Governance* (Accounting Issues ·
**Precedent** = `issues` with `amSub='precedents'` · Policies · **Controls** (added to the ledger lens) · Data
Enrichment). Trending stays a route, linked from Analysis; Audit History moved to Audit. The Flux page is now
titled **Flux Analysis** in the rail, `TABS`, `VIEW_META` and the title row; deeper copy still says Flux Review.
**Analysis** (`analysis`, `renderAnalysis`) is a placeholder: Financial Analysis, the future dimensions, and
links to what exists today.

**AUDIT** (`LENSES.audit`, `RAIL_SPEC.audit`, `AUD_PAGES`, `renderAudPage`): Audit Overview · *Fieldwork*
(Requests / PBC · Populations · Evidence · GL Extracts) · *Deliverables* (Audit Packages · Audit History).
Placeholders read existing governed objects — `auditReadiness()`, `drKpi()`, `EVIDENCE`, `glxRows()`,
`RECON_DEFS`, `RC_PACKAGES` — and route to them. **No audit data model.**

**ENTERPRISE STRIP.** Needs you · Approvals · Exceptions now render on every workspace, not only Home. Left
anchor is **ENTERPRISE** everywhere except Accounting, which keeps its period chip (the period control). It
was first painted before the reconciliation queue was seeded (Needs you read 0 on arrival), so it repaints once
after boot.

**SLOANE** (block `SLOANE — KORVYN'S EMBEDDED FINANCIAL INTELLIGENCE AGENT`, just above `cpSend`):
- Header: **Search or ask Sloane** and a **Sloane** button with a dashed-orbit mark (not a chatbot glyph). The
  one existing panel is renamed — title Sloane, tabs **Ask · Monitor**, footer states the governance rule.
- `SLOANE_SURFACES` is the context registry: surface name and quick actions per page (Account Activity, Flux,
  Reconciliations, Close, Report Builder, Audit, …). `sloaneCtx()` / `paintSlCtx()` draw the **Context** band
  (surface · period · reporting lens · what is open) and repaint on every navigation.
- `sloaneResolve()` answers before the legacy path, as a **structured card** (`slCard`: kick · statement ·
  drivers · what Sloane set up · Based on · hidden Trace · actions · governance line). Built today: transactions
  without vendor (`slNoVendor`, View GL = exactly those lines via `glxRbDrill`), CIP movement (`slCipMove`, from
  `fsAmount` + governed CIP lines by effective vendor), and **Build …** (`slBuild` → `rbCmdRun`, with View GL /
  Explain / Save as / Open in Excel). Everything else falls through to the existing assistant.
- `SL_NEVER_RULES`: an imperative to approve, certify, publish, remap or override returns a governance card
  naming the page where a person decides. Sloane never writes those objects.
- Every user-visible "Ask Korvyn", "Korvyn AI", "Korvyn explanation", "Korvyn's read" and "Korvyn Intelligence"
  now says Sloane. Korvyn stays the platform name. "Korvyn draft/drafted" in Flux is unchanged.

**Verified:** 237 view renders across 3 periods, 0 errors · rails and nav read as above · Sloane context on
Account Activity and Report Builder · vendor answer 1,519 of 2,254 lines → View GL shows exactly 1,519 · CIP by
Vendor built with 11 rows · approve request refused · FS-CIP 4,210.2 · 4/4 gates (baselines unchanged).

**Not built (stop point):** the Analysis workspace, Audit workflows, Settings redesign, the Excel add-in,
Needs you / Approvals / Exceptions as a cross-platform panel (they still route to Home), a keyboard shortcut for
Sloane, an LLM behind Sloane.

## 2026-09-14 (later) — SLOANE + SEARCH: the quiet pass

Owner's brief: **Sloane disappears until useful; search disappears until invoked.** Supersedes the Sloane
panel, context band and answer card from the block above; the context registry, governance rules and
structured-answer idea survive in a much smaller form.

**THE PANEL** (`<aside id="copilot">`, 400px). Header: **Sloane** + one context line (`#slCtx`, e.g. *Account
Activity · Jun 2026*, *Capital Spend by Vendor · YTD Jun 2026*, *Electrical CIP Reconciliation · Jun 2026*),
Expand and Close only. Body: at most **three** suggestions (`sloaneActs()` from `SLOANE_SURFACES`), nothing
else. Foot: one input (*Ask Sloane…*) and a quiet **History** link. Gone: greeting, instructional copy, Ask /
Monitor tabs, source-health block, scope chips, recent prompts, New chat / Starred, the governance footer. The
old element ids (`cpSrc`, `cpTabs`, `cpScope`, `cpSaved`, …) survive in one hidden legacy mount so older
painters find an element and draw nothing. **It is never restored open on load.**

**ONE EXCHANGE ON SCREEN.** `cpSend` clears `#cpThread` before each question; `CP.recent` keeps the history
behind the link (`slHistory`). Monitoring is not a tab: Needs you, Exceptions and Continuous Close own it.

**THE ANSWER** (`slCard`): optional *Data warning* (only when a degraded source actually feeds the lines behind
the answer, `slDataWarn`) · statement · drivers · actions · one *Based on …* line · compact follow-ups. Trace
toggles an evidence sentence. Answers today: missing vendors, largest transactions, unusual activity (≥ $1M
lines), CIP movement (by vendor, by project, "explain further" bridge), biggest statement-line change, what needs
attention, what blocks the close, reconciliation variance / unmatched items (honestly: none — roll-forward, not
matching) / support gaps / untied, and in Report View biggest movement, compare to prior year, underlying GL, and
**Build …** → `rbCmdRun`. Report Builder has no `pp` comparison: a movement is read against **prior year**. The
governance refusals are one line and a route. Anything else still falls through to the older assistant engine.

**THE HEADER.** *Search or ask Sloane ⌘K* is the universal entry; the Sloane button is now an icon-sized
`.ribicon` beside notifications.

**THE PALETTE** (`cmdkIndex`, `cmdkHits`, `cmdkPaint`). *Search Korvyn or ask Sloane…*, one input, a subtle key
hint, no chips. Empty → up to four **Recent** objects opened from search. A query → at most six governed objects
(financial lines, reconciliations, saved reports, packages, source accounts; pages only when a page or its module
is named, max three) ranked by match, weight and **the page you are on** (+20 for recon objects in
Reconciliations, reports in Reporting), then one **Ask Sloane** row phrased from the top financial line (*Why did
CIP increase in June?*). A question → only the Ask row; *build / create / make …* → only **Build with Sloane**.
Initials are indexed, so *CIP* finds Construction in Progress.

**Fixed along the way:** `rbOpen` from another module reset to a blank report (the lens switch's render consumed
`rbIntent`); it re-arms before `pickTab`.

**Verified:** closed on load · minimal panel text is only title, context, three suggestions and History · every
suggestion on Account Activity, Reconciliation, Report View and Home returns a card · search "CIP" gives 6 objects
+ Ask, context-ranked in Reconciliations and Reporting · question and command each give one row · 237 view renders,
0 errors · FS-CIP 4,210.2 · 4/4 gates (baselines unchanged).

## 2026-09-14 (last) — ONE INTELLIGENCE COMMAND LAYER: find · answer · act

Owner's brief. **One input, one intelligence layer; Korvyn decides.** Supersedes the palette in the block above;
the panel and the answer card are unchanged except where noted.

**HEADER.** One control: *Search, ask, or command Sloane ⌘K*, with Sloane's dashed-orbit mark inside it instead
of a magnifier. The separate Sloane icon is gone (`#ribAi` survives as a hidden span for older painters). The side
panel is reached only as a **continuation** — a question or command from the palette, Explain on an amount, a
history entry, or *Continue in Sloane* in the empty palette.

**INTENT, WITHOUT MODES** (`cmdkIntent`): *build / create / make / generate / draft …* or *show … by …* → **act**
(one row, *Build Vendor Spend Report* · Build); *open / go to / take me to …* → **navigate** (month words and
"the" stripped; one clear match becomes a single *Open* row); on an active report, *add / remove / group by / only
/ sort / monthly …* → **edit** (one *Update <report>* row); an interrogative, a trailing "?", or six+ words →
**ask** (only the Ask Sloane row); otherwise **find**. Analytic words (*spend, cost, balance, movement …*) put the
Ask row first and are stripped before matching, so *South Valley spend* finds the entity and asks.

**FIND** (`cmdkIndex`, `cmdkScore`) searches governed objects first: financial lines, reconciliations, **vendors,
projects and entities** (effective values in the working period, `slValues`), saved reports, packages, Flux,
close tasks, accounting issues, policies, source accounts, audit populations — pages last and only when named
(max three). Ranking is weight + name match + current-context boost + recency. Near-ties read *A few possible
matches*; nothing found retries without object-type words, then reads *No exact object found* with *Ask Sloane:
What is …?*. The Ask row is phrased from the top object (*Why did CIP increase in June?*, *Explain Electrical CIP
Reconciliation*, *How much did Siemens Energy spend change in June?*).

**SLOANE, CONTEXT-FIRST** (`sloaneResolve`). On a reconciliation the open instance is the context:
*largest reconciling items*, *missing support*, *underlying GL*, *why is this still out of balance*. On audit pages,
*support for this population*. *Build …* uses Report Builder templates where the words name one (vendor spend,
project activity, department expense, trial balance, GL detail), adds *only <entity/project/vendor>* when a
governed value is named, and states what it configured (*Rows: Vendor → Project · Period: YTD Jun 2026 · Value:
Net Amount*). On an active report an edit runs `rbCmdRun` and offers **Undo**. A named vendor, project or entity
with an analytic word answers its spend vs prior month by the other dimension (`slDimSpend`). *What is blocking
June close?* now reads tasks, reconciliations, exceptions, approvals and mapping together.

**EXPLAIN IS SLOANE** (`slRbExplain`, `slShow`). Every Report Builder Explain — amount menu, row label menu,
header button, "explain top" — opens the side panel with a structured card from `rbExplainData`; the old
`rbPanel` explain mode is no longer reached from those entry points (Contributors and Trace still use it).

**ONE HISTORY** (`slHistory`): questions, commands and objects opened from the palette, newest first, behind the
panel's History link. The follow-up input reads *Ask a follow-up…* once an answer is on screen.

**Verified:** header has one input and no Sloane button · blank palette empty on load, *Continue in Sloane* after an
answer · CIP → 6 objects + Ask · CIP Reconciliation → possible matches · Siemens → vendor first · question → Ask
only → panel opens, palette closes · *Build vendor spend report* → Report Builder with Vendor → Project, YTD, Net
Amount · *Add department* on that report → Department added, Undo · reconciliation follow-ups use the open
reconciliation · 237 view renders, 0 errors · FS-CIP 4,210.2 · 4/4 gates (baselines unchanged).

**Not built:** an LLM behind intent or answers (both are deterministic and say when they cannot act) · Explain on Flux,
Financials and Trending still use their own surfaces · Report Builder's in-page Ask bar still exists beside the
global input.

## 2026-09-14 (final) — SLOANE: one intelligence layer, three depths

Owner's brief. **Command palette → right panel → full screen**, one set of resolvers and one context. The depth is
chosen by Korvyn and never named to the user. Supersedes the palette markup and styling from the block above.

**PALETTE** (`sl4` block, `cmdkHits`/`cmdkPaintList`, classes `.slp-*`). A 720px elevated surface under the
header: Sloane mark, one input, `esc`; rows are icon · name · one metadata line · type, grouped **Best match ·
Related · Ask Sloane** (or *Possible matches*, *Answer*, *Build*, *Recent · Suggested*). The active row is a
blue-gray tint (`color-mix` accent 7% over n-50), Sloane rows carry indigo. Empty: up to three Recent and two
suggestions. New intents: **journal numbers** (`JE-…` → the journal, drilling to its lines) and **account numbers**
(`15000` → the account, then Account Activity · Trial Balance · its Reconciliation · Financials). A phrase from the
page's own suggestions ranks first (*missing vendors* on Account Activity → *Find missing vendors*). **Quick answers
inline** (`slQuick`): close status and a statement line's balance, with one action. **Depth** (`slDepth`): *analyze /
investigate / what should I worry / everything blocking / across … / audit risk* or 12+ words → full screen;
other questions → panel; *open …* navigates.

**RIGHT PANEL** is unchanged in shape: Sloane, context line, input, ≤3 suggestions, History. Its answer is the
continuation of a palette question or an Explain.

**FULL SCREEN** (`#slFull`, `slFullRender`, classes `.slf-*`). A workspace on the light plane, not a stretched panel
and not a chat: header (Sloane · investigation title · context · New investigation · Return to panel · Close), a
command input, the question, the analysis, then an **Evidence / Related** side column. Rich views read the same
engines: **close readiness** (`slRichClose`: unreconciled accounts, unexplained Flux, pending approvals, blocked
tasks), **CIP movement** (`slRichCip`: narrative, by project, by vendor, supporting accounts), **unusual activity**
(`slRichUnusual`), **build** (`slRichBuild`: a preview from `rbAskParse`+`rbRun` — the Report Builder engine, no second
one — with Open in Report Builder · Save Report · Open in Excel). Anything else renders its panel card. Empty state:
*What do you want to understand?* with four starts and recent investigations.

**CONTINUITY.** `SL_CUR` is the one current answer; `cpSend` and `slShow` set it. **Expand** (`slExpand`) opens it in full
screen; **Return to panel** (`slCollapse`) reopens the panel with the same answer. A follow-up asked in full screen
also lands in the panel thread (`slShow(q,html,true)`). Navigating to another page closes full screen.

**INVESTIGATIONS** (prototype, `SL_INVS`, `slInvStart`): a title derived from the question (*June Close Review*, *CIP
Spend Increase*, *Unusual Activity*…), its context and its questions; follow-ups append and show as a quiet trail.
Not persisted.

**Fixed:** full-screen *Open in Report Builder* landed on a blank report — the lens switch's render consumed the intent
flag; it is armed before and after the switch.

**Verified:** palette groups for empty, CIP, a journal, 15000, Siemens, *missing vendors*, close status, CIP balance,
a broad question and a payroll build · the journal opens its lines · panel default and answer · Expand → *Unusual
Activity* with its tables and evidence · Return to panel keeps the answer · full-screen close (10 material blockers,
four sections) · CIP (three tables, related objects) · build preview (25 rows) · 237 view renders, 0 errors · FS-CIP
4,210.2 · 4/4 gates (baselines unchanged).

**Not built:** persistence of investigations, notes and evidence pinning inside an investigation, rich full-screen views
for reconciliation and audit questions (they render the panel card), a real payroll ledger (the book has none; Sloane
says so).

## 2026-09-14 (reset) — SLOANE: one session, three states

Owner's brief: rethink Sloane from first principles. **Supersedes the palette, the panel and the
full-screen page from the three Sloane blocks above.** The resolvers, the governed engines they read and
the governance refusals are kept. FS-CIP 4,210.2, chronology 0, stores empty on load.

**THREE STATES, ONE SESSION.** AMBIENT is the header input *Ask Sloane… ⌘K* (`slOpen`, `slHotkey`).
ASSIST is the right panel, now 440px (`--panel-w`), the canonical surface. WORKSPACE is the full screen,
the same investigation given room. **The centered command palette is retired**: `cmdkOpen` opens the panel
and nothing creates `#cmdkWrap`. Search is plumbing. `cmdkHits` / `cmdkIndex` still rank governed objects,
but only inside the panel while you type (`slType`, `slPaintFind`, ↑↓ Enter Esc in `slKey`).

**ONE SUBMISSION PATH** (`slSubmit`). It serves the header, typed Enter, suggestions, follow-ups, `askAI`
and `cpSend`, which now delegates; the older engine survives as the unreached `cpSendLegacy`. Routing, by
`cmdkIntent`:
- A journal, account number or *open …* opens the object.
- *build / create / show … by …* prepares a report definition in the panel (`slBuildCard`: `slBuildDef` →
  `rbAskParse` + `rbRun`, a 5-row preview, MoM via `rbCmpApply(def,'pm')`, Open in Report Builder · View
  GL · Save report · Open in Excel). It does not navigate first.
- Everything else goes to `sloaneResolve`, then `slQuick`, then `slNoAnswer` (the closest governed objects,
  honestly labelled).

**INVESTIGATION IS THE UNIT** (`SL_INVS`, `SL_INV`, `slAnswer`). An investigation holds a title from
`slInvTitle` (*CIP Increase — June 2026*, *Close Readiness*, *<recon> Variance*, a report's own name, a built
report's name, *Selected Activity*), its context and its entries (question, answer html, object, kind, tab).
A question continues the current investigation when its title matches or `slIsFollow` says so. The follow-up
buttons of the last answer always count, and anything asked inside the workspace appends. **History lists
investigations, never prompts** (`slListed`): the current one, any with two or more questions, any expanded
and any saved. A one-off stays out. Closing the panel loses nothing; *New investigation* starts clean.

**THE PANEL** (`slPaint`):
- Header: Sloane, one context line, Expand and Close.
- The input sits under the header.
- The body shows exactly one thing: results while typing, the investigation (label, earlier questions as a
  quiet trail, the current answer, *Open as workspace* when a workspace view exists), the investigations
  list, or at most three suggestions.
- Footer: *Investigations* and *New investigation*.

**Answers** keep the `slCard` shape (answer → drivers → actions → one evidence line → Trace), which adds
`for` (the selected object), `prev` (a compact table), `draft` (quoted words) and `pri` (the first action
outlined). The panel CIP answer leads with named project and vendor drivers and states the no-vendor
activity in words.

**CONTEXTUAL ENTRY POINTS** — the object is already known:
- **Explain on a report amount**: `slRbExplain` → `slAnswer` with the report name as the title and a `for`
  line (report · window · filters).
- **Ask Sloane on an Account Activity selection** (`slAskSelection`, in `glxBulkBar`) sets `SL_FOCUS`. It
  offers Explain selection · Find anomalies · Suggest dimensions (`slSelExplain` / `slSelAnomalies` /
  `slSelDims`). Suggestions only; bulk edit is where they are applied.
- **Investigate variance** in the reconciliation panel header (`slInvestigateRecon`) asks *Why is this off?*
  against the open reconciliation (`slReconVariance`: tie state, likely drivers, support gaps, review status).
- **A record dock opens beside Sloane**, never underneath it: `.amap-panel` shifts by `--panel-w` while the
  panel is open.

**Also answered:**
- *Draft the Flux explanation* (`slFluxDraft`): words only; Use draft copies and opens Flux Review; a
  preparer submits.
- *Show transactions over $XM* (`slOverThreshold` → `slUnusual(thr)`).
- *Compare to May* on a report (`SL_RB_EDIT`).

**THE WORKSPACE** (`slFullRender`, `#slFull`) is an overlay, so the page beneath never re-renders:
- Header: investigation title and context · **Collapse** (labelled, obvious) · Save investigation · ••• (New
  investigation, Close Sloane) · ✕.
- Body: follow-up input, the question, then the analysis; beside it the investigation's questions, Evidence
  (Trace) and Related.
- Rich views, all over existing engines: `slRichCip` (summary, top project and vendor drivers without the
  unattributed rows, unusual activity, related control context, supporting accounts, then View GL · Open
  Analysis · Create Flux draft · Create report · Open in Excel), `slRichRecon`, `slRichClose`,
  `slRichBuild`, `slRichUnusual`. A follow-up without a view of its own renders above its investigation's
  analysis (`slInvAnchor`).
- **Collapse** (`slCollapse`, and Escape) returns to the panel and the exact page, and restores `scrollY`.
  **Close** (`slCloseAll`) puts the panel away too. Navigating from inside the workspace closes it.
- **Trap:** `.slf-menu{display:grid}` outranked `[hidden]`, so the menu drew open. A closed overlay needs
  its own `[hidden]` rule.

**Verified:**
- JE-679397 → the journal row → Enter drills to its 1 line.
- *Why did CIP increase in June?* → panel answer with drivers, evidence and actions.
- *Build vendor spend by project monthly through June* → preview → Open in Report Builder lands on Vendor →
  Project.
- Report Explain carries report, window and filter.
- *Why is this off?* on Cooling / Other CIP works; the dock sits beside the panel.
- Expand → CIP workspace; Collapse restores scroll 320 and the same investigation; close and reopen keeps it.
- Investigations list: 3 meaningful, one-offs hidden.
- ⌘K opens and focuses the panel; the palette cannot open.
- 48-view sweep with 0 errors · 4/4 gates (baselines unchanged) · FS-CIP 4,210.2 · chronology 0.

**Not built:**
- Investigation persistence across reloads, notes and evidence pinning.
- Per-reader permission filtering inside resolvers (they read the same governed engines the pages read;
  `rbPermit` applies only where Report Builder runs).
- A language model behind intent and answers (deterministic, and it says when it cannot answer).
- *Trace this number* as a command.
- The Analysis module, Audit workflows, a Settings redesign and the production Excel add-in.

## 2026-09-15 — SLOANE UX REFINEMENT: icon, Home/History/New/Clear, answer in place, a real workspace

Owner's brief. **Answer here, drill here, offer actions, navigate only when the user asks.** Not a
rebuild: the investigation model, resolvers and governance refusals from 2026-09-14 are kept.
FS-CIP 4,210.2; the gates baselines are unchanged.

- **Header:** the "Ask Sloane…" bar is gone. A small `.ribsl` orbit icon (`#ribSl`, tooltip *Sloane*)
  sits beside notifications. `slIconClick()` toggles the panel (it collapses the workspace if that is
  open). ⌘K / Ctrl+K still opens the panel and focuses the input. `--panel-w` is `clamp(420px,32vw,460px)`.
- **Panel states, `SL_MODE`:** `home` · `session` · `history`. The header reads *Sloane* over the
  context line, with Home · History · New · Expand · Close (`.slx-hb`, titled icons).
  - **Home** (`slHomeHTML`): up to 2 recent investigations and up to 3 suggestions. The input sits
    under the heading.
  - **Session:** the follow-up input moves to the bottom through CSS `order` on `#copilot.slx-sess`.
    It is never re-parented, so focus and the caret survive.
  - **Opening** restores the active investigation, or shows Home when there is none (`slOpen`).
- **New vs Clear:**
  - **New** (`slNewAsk`) prompts *Save current / Discard / Cancel* only when the investigation is
    meaningful and unsaved: 2+ steps, expanded, or with logged actions (`slMeaningful`).
  - **Clear** (`slClear`) drops the conversational context (topic, focus, current answer) and keeps
    the investigation in History (`kept`). It never deletes.
- **History** lists investigations, never prompts: title · period · surface · steps · updated
  (`slInvRow`). **Four sample investigations are seeded** (`slSeedInvs`, `seed:true`): June CIP
  Increase, June Close Readiness, Siemens Vendor Review, Unusual Activity Review.
  - Their steps are `lazy`. `slHydrate()` resolves them through the real engines the first time one
    is read, so no answer is authored.
  - This is session UI state, not a governed store. The governed stores still ship empty.
- **The answer is a document** (`slCard`, `.slx-*`): kicker · headline · figure · key figures (`kv`) ·
  sections (`secs`: compact tables, `count` rows, "View all N →" disclosure, rows with `go`) · one
  tinted primary action (rule 13: a tint, not a fill) · trace · Evidence footer · next chips.
  `drv/drvLabel` still work and render as a section.
- **One resolve path:** `slResolveText()` is shared by `slSubmit` and hydration. Everything answers in
  place:
  - **A journal number** gives the journal (`slJournal`).
  - **A vendor analysis** (`slVendorAnalysis`: FYxx = the governed months of that year, prior = the
    same months a year earlier, Change % capped at ±999%) covers vendor, project and entity index hits.
  - **"View GL" everywhere** gives an embedded GL (`slGL`: 15 lines, Download Excel/CSV of the exact
    population, **Open full GL only when every line is in the close period** Account Activity reads).
  - **A report request** gives a preview with month columns (`slBuildDef` defaults an unperioded
    request to YTD by month). Its actions: Save report (`slSaveReport`, writes `RB_REPORTS` without
    leaving), Open in Excel, Edit in Report Builder.
  - **Close** gives 71% ready, blockers and control status; **Review blockers** (`slCloseBlockers`)
    stays in Sloane.
  - **A reconciliation** gives Variance, drivers, support, then View items / View support / View GL
    / Open Reconciliation.
  - Modules open only from an explicit escalation action.
- **Workspace** (`slFullRender`): header Home · History · Save investigation · Collapse · ••• (New,
  Clear conversation) · ✕.
  - **Layout:** a 2/3 main canvas (`.slw-work`/`.slw-main`) and a 1/3 side column: an **investigation
    timeline** (`slTimeline`, event labels from `slEvLabel`, logged actions from `slInvLog`; clicking
    restores that step) and evidence/related.
  - **Blocks appear only with content:** executive finding with `slwKpis`, driver tables with
    disclosure, `slwTrend`, `slwGLBlock`, related work, actions.
  - **New rich views:** `slRichVendor`, `slRichGL`. Viewing the GL stays in the workspace.
- **Traps:**
  - **`.ai` is the global AI panel component** (display:none): a Sloane suggestion row marked `.ai`
    vanished, so it is `.slx-sg`.
  - **A media-query single-class rule counts as a duplicate declaration**, so the responsive rules
    are scoped `#slFull .slw-*`.
  - **The Browser pane serves stale frames under an emulated viewport**; reset to `desktop` before
    screenshots.

**Not built:** persistence across reloads, recon answers for a reconciliation that is not open on
screen, an LLM behind intent, notes/pinning inside an investigation.

### Later the same day — navigation, finance language, governed proof

**SLOANE CAN TELL YOU WHAT HAPPENED AND PROVE EVERY NUMBER.** One drill chain, everywhere:
**finding → bridge / contributors → governed ledger population → transaction → ERP source**.
Each step is a step of the investigation, so Back walks it in reverse.

- **The mark:** the dotted circle is gone. `SLP_ORBIT` (the name is kept, it has ~20 callers) is now
  one geometric S with a terminal point: the point is Korvyn's orbit dot, the S is Sloane's own.
  It is the same SVG in the header (`#ribSl`), the panel title, the input, the workspace and
  History rows.
- **Navigation:**
  - **Back** (`slBack`) pops `SL_STACK`, a stack of `{mode, inv, view}` snapshots.
  - `slPush()` runs in `slAnswer`, `slView`, `slInvOpen`, `slHome`, `slHistShow` and `slNew`;
    `slBack` never pushes.
  - The panel header is Back · Home · History · New · Expand · Close, with Clear beside the input
    (it also appears while typing).
  - The workspace header is ← Back · Home · History · New · Clear · Save investigation · Collapse · ✕.
- **Intent without modes:**
  - `cmdkIntent` treats `show / list / view…` and finance words (financials, P&L, balance sheet,
    trial balance, recs) as **ask**, never find.
  - An account number is answered by `slAccount`: the account across every ERP that carries it,
    then View Account Activity / Trial Balance / Reconciliation / Financials.
  - A bare governed name ("Siemens") is its activity. A journal is `slJournal`.
- **Finance language** (`sloaneResolve`):
  - **Statements:** `slFinancials` covers financials / financial reporting / results / P&L /
    income statement / balance sheet / YTD. Period comes from the words or the working period;
    it asks "for which period?" only when the named month is not governed.
  - **TB and recs:** `slTB`, `slReconStatus`.
  - **GL / ledger:** the population.
  - **A statement line in plain words:** `slFinLine`.
  - **Operating and net income** derive exactly as `fsNetIncome` does.
- **Proof** (`o.proof` on `slCard`): a *Governed · N lines · period* line with View proof and
  Trace. When a card has a proof, Trace is dropped from its actions.
  - **Bridge** (`slLineProof`):
    - **Balance-sheet lines:** prior ending + source GL activity + other source movement +
      reporting adjustments = ending.
    - **P&L lines:** GL activity + source TB not held as lines + adjustments = reported.
  - **"Other source movement" is labelled as balances and rates with no journal behind it.**
    The GL population is only fully modelled for some lines (CIP); a revenue line holds a sample,
    and the bridge says so instead of forcing it to tie.
  - **Other proofs:** `slFinProof` (A = L + E, the P&L rebuilt from its sections) and
    `slVendorProof`.
- **Drivers are clickable:** every driver, account, project and composition row opens its exact
  population (`slDriverPop`, regrouped, each sub-total drills again). The same holds for workspace
  tables (`slfTable` rows accept a function) and Related work (`slShowReconPop`).
- **Population** (`slGL`): 15 fields and a debit/credit/net summary, 15 lines, then View all
  (`slGLMore`, in place) · Excel · CSV · Trace · Open full GL. **Every line opens `slTxn`:**
  source facts, a **Source / Governed / Effective / Provenance** table per dimension
  (normalization rule and version, or change set / approval when overridden), and
  **Open in NetSuite ↗ only where `r.sourceUrl` exists**. That is a simulated toast
  (`slErpOpen`); JD Edwards rows say no link is published.
- **History:**
  - **Search** (`slHistFilter`) repaints only the list, never the input. It matches title,
    surface, period, questions and answer headlines.
  - **Delete investigation** is a row action with inline confirm (`slInvDel`). **Clear never
    deletes.**
  - **Listing:** `slListed` now lists every investigation that produced a governed answer.
  - **Seeds** add June Financial Review. Asking a question whose title matches an existing
    investigation continues it rather than duplicating it.
- **Workspace Proof block** on CIP: governed lines · GL activity · adjustments/FX/eliminations ·
  total movement, with View population / View proof / Trace to source (the largest line's
  transaction). Card kinds (`txn`, `proof`, `driver`, `acct`, `fin`) render as a card, not over
  the anchor analysis.
- **Trap:** hydrating a seeded investigation re-resolves its steps and moves `SL_LASTO`. Read the
  current step's own card (`slEntry().o`), never `SL_LASTO`, after `slSubmit`.

## 2026-09-15 (later) — SLOANE 2.0 PHASE 1: the financial context engine, answer in place

Owner's brief. **Answer here → drill here → optional actions → navigate only for controlled work.** Not a
redesign: panel, workspace, History and the governed engines are unchanged underneath. FS-CIP 4,210.2; the
four gates' baselines are unchanged.

**ONE CONTEXT OBJECT, `SL_CTX`** (block `SLOANE 2.0 · PHASE 1 — THE FINANCIAL CONTEXT ENGINE`, above `cpSend`):
`currentObject · currentObjectType (financials | fs_line | account | vendor | project | entity | close |
reconciliations) · objectRef · shortName · currentPeriod · comparisonPeriod · compareOn · entityScope ·
reportingScope · currency · accountingBasis · activeDimensions · activeFilters · currentPopulation ·
currentInvestigation · currentSourcePage · currentSourceObject · lastAnalysisType · lastDrillLevel`.
- **Written only through `slCtxSet()`**, which also re-derives lens/currency/basis and `currentPopulation`
  (`slPopId`), and sets `_slCtxTouched`.
- **Stamped on every investigation step** (`entry.ctx`, `inv.ctxObj`) in `slAnswer`. `slView`, `slBack` and
  `slInvOpen` restore it, so Back, History, Expand and Collapse restore the analysis, not only the text.
  `slNew`/`slClear` drop it.
- **A new investigation that set no context does not inherit the previous one's** (`_slCtxTouched` is reset
  in `slSubmit`).
- **`slHydrate` rebuilds a stored investigation's context step by step without touching the live one.**

**THE RESOLVER, `slCtxResolve(text)`**, runs in `slResolveText` before `sloaneResolve` and returns
`{html, kind, inherit}`; `inherit` makes the answer a follow-up in the same investigation.
- **What the words name:** `slObjIn` finds an account number, a statement line (`slLineIn`, full names plus
  `SL_LINE_ALIAS`: cip, ar, ap, pp&e, opex…) or a governed vendor/project/entity (`slFindValue`), longest match
  wins. `slMonthsIn` finds periods (two months = a comparison); `slDimIn` finds "by project / now by vendor".
- **Intent is internal:** `slCtxIntent` → prove · gl · compare · breakdown · why · activity · show. BUILD and ACT
  stay with the resolvers that own them; `SL_STANDALONE` lists questions (unusual activity, missing vendors,
  largest movement, flux…) that must never be bent onto the object in context.
- **A follow-up that names no object inherits the context object and period**; a line named after a financial
  summary inherits its period.
- **Ahead of that:** close language → `slCloseBlock`; "unreconciled balances" → `slUnreconciled` (inline list,
  each row opens its reconciliation population); finance words (financials, results, P&L, balance sheet, YTD) →
  `slFinancials`. A bare account → `slAccount`; a vendor asked about as a vendor → `slVendorAnalysis`.
- **`slCtxRun(C, intent, dim)` is the one dispatcher**, shared by the resolver and every in-card action
  (`slCtxShow`):
  - `slCtxObject` — balance, MoM, project/vendor/account drivers.
  - `slCtxVariance` — why.
  - `slCtxCompare` — May vs June with a Project · May · Jun · Change table and a total row.
  - `slCtxBreakdown` — by a dimension, keeping the comparison if one is on.
  - `slCtxActivity`.
  - `slCtxProof` — a bridge plus a 10-line governed population preview; a statement line uses `slLineProof`.
- **Population and balance for any object:** `slPopRows` and `slObjBal`. A line's balance is
  `fsAmount().reported`, an account's is the sum of `rcAcctBalance` over every ERP that carries the number, a
  dimension's is its GL activity. A P&L object reads "amount", not "balance".

**EVERY MATERIAL NUMBER IS A WAY IN.**
- The headline figure (`figGo`) and key figures (`kv` row `[label, value, strong, go]`) are buttons.
- **A driver row drills** (`slCtxDrill`): it adds a filter to the context and answers with that population's GL.
- **In the GL preview a vendor or project cell narrows the population in place** (`slGLFilter`), and a row
  opens its transaction.
- **The GL preview is twelve columns** — posting date · journal · account · description · entity · vendor ·
  project · debit · credit · net · currency · ERP — with blue-white striping. Every other governed field stays
  in the Excel/CSV download and the transaction card.
- **The proof strip always states the currency.** View proof shows only when there is a proof to open.

**NO BRITTLE FALLBACK.**
- The generic "no governed answer" text is gone. With context: *"Sloane has CIP in context but could not act on
  …"* plus what it can do.
- An unmatched name says no object by that name exists in the period's ledger.
- A month that is not open (`slPeriodUnavailable`) says the book is working in Jun 2026.
- An empty population (`slCtxEmpty`) names the stale feed.

**Verified in the product:**
- **Test A:** June financials → breakdown of CIP (June inherited) → May vs June → by project (Project · May ·
  Jun · Change) → the GL → click Ashburn Hall C (its GL) → Back to the project breakdown.
- **Test B:** 15000 → June activity → why did it move (+$87.0M) → show proof (bridge + 10-line population).
- **Test C:** blocking June close → unreconciled balances (4, inline).
- **"no governed answer" appears nowhere.** Checks: 0 console errors · 4/4 gates.

**Not built (Phase 2):** PBC assembly, invoice retrieval, ERP/Flux/reconciliation write-back, support attachment
actions, Audit workflows, the Excel add-in, autonomous plans, an LLM behind intent, "Preview Excel" as anything
but the existing download.

## 2026-09-16 — SLOANE FOUNDATION PHASE 1: context · semantics · tools · objects · trace · mock LLM

Owner's brief. Replaces hard-coded request→answer branching with an internal architecture a real LLM can later
plug into. **No UI redesign, no external LLM.** One block, `SLOANE FOUNDATION`, just above `cpSend`; prefix
`sf`/`SF_` (greped free). FS-CIP 4,210.2 · chronology 0 · 4/4 gates unchanged.

**REUSED, NOT DUPLICATED — the most important rule of this layer.**
- `SL_CTX` stays the flat value store (sixty call sites); `SF_META` is a PROVENANCE sidecar keyed by field
  (`{source: EXPLICIT|INHERITED|DERIVED|DEFAULTED|UNKNOWN, confidence: HIGH|MEDIUM|LOW}`).
- `sfContext()` composes the two into the brief's FinancialContext.
- `slPush`/`slBack` stay the one stack; `entry.ctxMeta` rides with `entry.ctx`.
- `slObjIn`/`slMonthsIn`/`slDimIn`/`slCtxIntent` stay the one parser.
- `slCtxResolve` and `sloaneResolve` are invoked BY the orchestrator as two BRIDGE tools, never re-implemented
  beside it.

**THE LAYERS**
| Layer | Functions |
|---|---|
| context | `sfField` · `sfContext` · `sfUpdate` (the one writer, via `slCtxSet`) · `sfMerge` · `sfResetObject` · `sfResetPopulation` · `sfClearTemp` |
| semantics | `SF_OBJT` (22 canonical types) · `SF_ALIASES` (data, longest match) · `sfParse` → SemanticRequest · `sfClassify` → CONTINUATION / NEW_OBJECT / NEW_SCOPE / NEW_PERIOD / NEW_INVESTIGATION |
| tools | `SF_TOOLS` (metadata: inputs, permissions, `SF_RISK`, output type, trace, execution mode) · `sfToolRun` → `{success, object, contextUpdates, trace, warnings, errors}` · `sfPlan` · `sfPlanGuard` |
| objects | `SF_FOBJ` · `sfObject` (id, type, title, period, range, scope, currency, basis, provenance, `governedStatus`, traceable/drillable/exportable, actions, warnings, `render`) · `sfGoverned` |
| execution | `SF_TRACES` (cap 50) · `sfTraceStart/End` · `sloaneTrace(n)` · `sloaneDebug()` — dev only, never rendered |
| llm | `SF_LLM_MOCK` (`mock` / `deterministic-v1`) — interpret/plan delegate to semantics; summarize/explain/narrative return null · `sfSetLLM(adapter)` is the only provider seam |
| orchestration | `sfRun` → SloaneResponse `{state: ANSWER\|CLARIFICATION_REQUIRED\|NAVIGATE\|UNAVAILABLE\|ERROR, objects, html, context, …}` · `sfClarify` · `SF_PENDING` · `sfAnswerClarify` |
| evaluation | `sloaneSelfTest()` — 15 checks through the REAL orchestrator and engines; restores session state after |

**WIRING.** `slResolveText(text, opt)` is the single adapter onto `sfRun`. `slSubmit` acts on the response STATE
(NAVIGATE runs `resp.go`; CLARIFICATION_REQUIRED renders the question card) instead of re-reading the words.
Hydration passes no `nav`, so a replayed history step never navigates.

**RULES THE TESTS CAUGHT — keep them.**
- **Global governed state is never UNKNOWN.** Period, scope, currency and basis are DEFAULTED/HIGH before any
  context exists (`SF_GLOBAL`). Reading them as unknown made the clarification engine ask on every first
  question (the first run passed 1 of 13).
- **A dimension or ledger word is a VIEW of the object in context, not a new object.** "break it down by
  project" and "show me the GL" hit the PROJECT / GOVERNED_LEDGER aliases and were reset as new objects.
- **Inheritance needs a signal** (an operation, period, dimension, presentation or pointer word). "foo bar
  baz" with financials in context inherited them and answered with the statements, which §27 forbids.
  Typed tools are guarded (`sfPlanGuard`): no object means bridges only.
- **Two months on a statement are a RANGE, not a comparison**, unless the words say vs/compare.
- **A resumed request does not re-ask** its clarification (`O.resumed`).
- Execution ids come from a counter, not the capped buffer's length.

**CLARIFICATION IS SILENT IN NORMAL USE, BY DESIGN.** It fires on a named scope Korvyn cannot resolve ("for
the Atlantis region"), or on a material field that is genuinely UNKNOWN/LOW. "monthly income statement
Jan-Apr" with no scope named answers with the DEFAULTED enterprise scope rather than asking.

**Not built (named):** real LLM adapters · monthly-column statements (a January-start range renders as YTD
and the response warns; other ranges render the end month with a warning) · autonomous multi-step plans ·
typed tools for vendor analysis, journals-in-context, flux drafts and reports (they run through the bridges) ·
PBC / invoices / write-back / Excel generation / audit packages.

## 2026-09-16 — SLOANE PRE-LLM INFRASTRUCTURE: planner · canvas · evidence graph · artifacts · governance

Owner's sprint brief (phases A–Z). One block, `SLOANE INFRASTRUCTURE (2026-09-16)`, sits between the
SLOANE FOUNDATION block and `function cpSend`. It extends the foundation and re-implements none of it.
Everything uses the `si` prefix (JS) and `.si-` (CSS); both were grepped before they were claimed.
FS-CIP 4,210.2 · chronology 0 · `RC_POSTCLOSE` empty · 4/4 gates, baselines unchanged.

**Run in the console:** `sloaneSelfTest()` (foundation, 15), `siSelfTest()` (every phase, 31) and
`siEvalSuite()` (the 12 requests, in sequence). `siTraceView(n)` is the dev-only trace inspector.

**Hooks into the foundation (the only edits outside the block):**
- **`sfTraceStart`** adds `plan · steps · objectsCreated · artifactsCreated · actionsProposed ·
  actionsExecuted · permissions`.
- **`sfToolRun`** runs `siPermit` before every tool, then carries `data`, `populationId` and the
  drill contract on the object.
- **`sfRun`** calls `siRoute` after classification. Active-workbook follow-ups go first, then
  multi-step plans. When it answers, navigation and the single-tool loop are skipped. After every
  answer it runs `siInvRecord`.
- **`slNew`** closes the infrastructure investigation and the active workbook.
- **`slCtxResolve`** has one fix: a new object named after the orchestrator reset the previous one
  keeps that object's period (`keptPeriod`).

**What exists:**

| Phase | Where | Notes |
|---|---|---|
| B tools | `SI_TOOLS`, pushed into `SF_TOOLS` | getFinancialSummary, getAccountAnalysis, getJournal, getReconciliationPopulation, getCloseBlockers, getFluxAnalysis, getEvidenceReferences, plus composeExcelWorkbook, composeAuditWorkbook, buildSupportPackage, buildPBCPackage, proposeAction. Each returns `data` beside its render |
| C planner | `SI_PLAN_RULES`, `siPlan` | deterministic rules → `{planId, steps[tool, inputs, dependsOn, riskLevel, permitted]}`; inputs reference context (`$ctx.x`) or earlier outputs (`$1.largest.lineId`) |
| D execution | `siExecute` | QUEUED · RUNNING · COMPLETED · FAILED · WAITING_FOR_USER · WAITING_FOR_APPROVAL; a failed dependency never runs |
| E canvas | `SI_OBJT`, `siCanvasHTML` | 18 object types plus ActionProposal; a plan renders its step list and then one `.si-obj` section per object |
| F drill | `siDrillContract` | Finding → Contributors → GovernedPopulation → Transaction → ERPSourceReference |
| G provenance | `siValues(r,k,p)` | source / governed / effective / provenance / ruleId, off `glxDim` |
| H evidence | `SI_EDGES`, `siGraphBuild`, `getEvidenceForObject`, `getRelatedFinancialObjects`, `getSupportCoverage`, `findMissingEvidence` | built from EV_RELS, FX_EXPL, RECON_DEFS policies, RB_REPORTS, RC_PACKAGES, DR_REQUESTS; transaction edges derived per population (`siTxnEdges`) |
| I/J | `SI_INVESTIGATIONS`, `siInvRecord`, `siTimeline` | objects, populations, filters, questions, findings, evidence, actions, artifacts, timeline, conclusions — no messages |
| K | `siArtifact`, `siArtifactRevise` | the seven types; definitions only, versioned with history |
| L/M/N | `SI_XL_COLS`, `SI_XL_CMDS`, `siXlCmd`, `siXlFollow`, `SI_XL_PRESETS.KORVYN_FINANCIAL`, `siTieOut` | workbook definitions, nine commands, deterministic follow-ups, audit package with a COMPUTED tie-out |
| O/P | `siSupportPackage`, `siPBCPackage` | references only; coverage and missing evidence stated |
| Q/R | `SI_ACTION_POLICY`, `siActionLevel`, `SI_ACTION_CONTRACTS`, `siPropose`/`siConfirm`, `SI_AUDIT` | the level comes from policy; unknown → GOVERNED (fail closed); mock service; every step audited |
| S/T | `siSrcRef`, `SI_IFACE`, `siImplements`, `SI_ERP_MOCK`, `SI_DOC_MOCK`, `siRegisterConnector` | no production connector |
| W | `SF_LLM_MOCK.clarify`; `sfSetLLM` validates all six operations | a partial adapter is refused |
| X | `siPopulation`, `siPopPage`, `siPopExport` | population ids, server-side contract, cursor pages, async export job (definition) |
| Y | `siPermit`, `siVisibleRows` | user · module · entity/lens · document · action layers, off `kAccess`; rows via `rbPermit` |

**Traps:**
- **The seeded Sloane investigations hydrate through `sfRun` on first read.** A script that calls
  `slSubmit` straight after a reload can race that hydration. Wait for load, then submit.
- **The tie-out is honest but narrow.** Governed = ERP TB + approved adjustments is `fsAmount`'s own
  identity, so all 51 lines tie. It does not compare against an independent ERP extract, and the
  preview must never claim otherwise.
- **Session stores fill up during tests.** `SI_ARTIFACTS`, `SI_PROPOSALS`, `SI_AUDIT` and friends are
  session state, not governed stores. `siSelfTest` leaves its test records in them; a reload clears
  them.

**Not built (per the brief):** real LLM providers, autonomous agents, ERP writes, document or invoice
retrieval, OCR, a production Excel add-in or file generation, a PBC portal, auditor collaboration,
persistence across reloads.

## 2026-09-17 — SLOANE 2.0 PHASE 2: real LLM reasoning + governed tool use

Owner's brief. **THE LLM INTERPRETS AND PLANS. KORVYN EXECUTES AND PROVES.** The Sloane UI is unchanged apart
from the answer's generated explanation, the execution-state line and the clarification card. FS-CIP 4,210.2 ·
chronology 0 · `RC_POSTCLOSE` empty · 4/4 gates, baselines unchanged.

**Where it lives:**
- **Server:** `packages/agent/src/sloane/`.
  - `config.ts`: environment only.
  - `schema.ts`: JSON schemas plus strict hand-written validators.
  - `prompts.ts`: frozen system prompts; request data wrapped in `<enterprise_data>`.
  - `adapter.ts`: the `SloaneLLMAdapter` contract, `MockLLMAdapter`, `AnthropicSloaneAdapter`.
  - `routes.ts`: `/api/sloane/health · interpret · plan · narrate`, wired into `src/server.ts`, same-origin only
    (no open CORS).
- **Browser:** block `SLOANE 2.0 PHASE 2 — REASONING + GOVERNED TOOL USE` in `index.html`, between the
  infrastructure block and `cpSend`, prefix `s2`/`S2_`/`.s2-`.

**Configuration** (server environment, never the browser):

| Variable | Meaning |
|---|---|
| `SLOANE_LLM_PROVIDER` | `anthropic` or `mock`; defaults to `anthropic` when credentials exist, else `mock` |
| `SLOANE_LLM_MODEL` | default `claude-opus-5` |
| `SLOANE_LLM_EFFORT` | default `medium` |
| `SLOANE_LLM_TIMEOUT_MS` | default 20000 |
| `SLOANE_LLM_MAX_TOKENS` | default 8000 |
| `SLOANE_MAX_PLAN_STEPS` | default 8 |
| `ANTHROPIC_API_KEY` | read by the SDK only; never read, logged or forwarded by Sloane code |

**The adapter:** structured output via `output_config.format` (json_schema), adaptive thinking, a cached
system prompt, and `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`; SDK 0.114 types only the
array form, hence one widening cast). It handles `refusal` and `max_tokens`, maps errors onto a typed chain
(timeout · auth · rate_limited · unavailable) and re-validates every response. Health never names a provider;
`engine` rides in outcome bodies for the dev trace only.

**The page finds the service by a marker, not a probe.** `src/server.ts` injects
`<meta name="korvyn-sloane-api">` into the index.html it serves. The python static server does not, so it
never 404s on `/api/sloane/health` and runs `S2_DET`.

**Lifecycle** (`s2Submit`, called by `slSubmit`; synchronous in deterministic mode, async with the service):
1. **Interpret.** The request, a compact `s2Context()` (values with their provenance source), `s2Candidates()`
   (canonical ids: `line:` `account:` `journal:` `vendor:` `project:` `entity:` `scope:`) and the governed
   periods go to the model. The reply is re-validated with `s2ValidInterp`. A failed, unreachable or
   low-confidence reply falls back to `s2DetInterpret` and states a note.
2. **Resolve.** `s2ToRequest` resolves ids to governed objects, dropping any it cannot resolve, and maps to
   the foundation SemanticRequest. `s2Classify` lets the engine overrule a model's "continuation" about a
   different object.
3. **Clarify** (`s2ClarifyDecision`), before any context changes. The model RECOMMENDS; engine policy decides.
   A field is asked only if unreliable, where EXPLICIT / INHERITED / DERIVED are reliable and DEFAULTED /
   UNKNOWN are not:
   - a statement with no period needs `period`;
   - a multi-month statement range with no reliable scope needs `scope`;
   - a word matching 2+ governed entities needs `entity`.

   Answering resumes the held request (`S2_RESUME`). "Choose scope" opens a region list. Clarification loops
   are capped. Globals shown in an answer become INHERITED, so the next question does not re-ask.
4. **Apply context** (`s2ApplyContext`). The new-object reset, filters, `SL_CTX.minAbsAmount` (a display
   rule applied in `slDrvSec` / `slCmpSec`), comparison periods, and scope via `setScope`.
5. **Execute.**
   - **Single object:** `sfRun(raw, {req, cls, noClarify})`. The foundation orchestrator now accepts an
     injected request; its inner trace is folded into the Phase 2 trace.
   - **Plan** (multi-step, REVIEW, top-N, support questions): the allowlist (`s2Allowlist`: registered,
     non-bridge, `siPermit`-permitted, relevant to the intent) goes to the model. `s2ValidatePlan` checks
     each step: tool exists and is allowlisted; permitted; not GOVERNED; no CONFIRM tool on a read request;
     dependencies backward; `$ctx.x` / `$N.path` refs valid; required inputs present. Otherwise it repairs
     from context or rejects the step and its dependents, and caps at `maxToolCalls`. An empty plan retries
     with `s2DetPlan` (≤ `maxPlanIterations`), then falls back to single execution. `siExecute` runs it.
6. **Explain.** `s2Facts` extracts facts ONLY from tool outputs (`data`, the returned population, and
   `slObjBal` for a bridge answer). The model writes sentences citing object ids and fact keys. `s2Ground`
   rejects any sentence with a number that is not a fact's display value, or that cites an unknown object
   or fact, and dedupes. No grounded sentence means `s2DetNarrate` (facts arranged, never computed).
   Rendered as `.s2-nar` with `data-objects` / `data-facts` for later evidence highlighting.
7. **Remember.** The investigation gains `interpretations[]`, `resolvedContexts[]`, `plans[]`,
   `toolExecutions[]` and `corrections[]` (earlier objects marked `superseded`), plus grounded findings with
   object ids.

**Corrections** ("No, I meant South Valley only"): `s2MergeCorrection` changes the last executed
interpretation (`S2_LAST`) only where the correction says, then re-runs against the ORIGINAL words so the
bridge re-resolves the same object with the new filter.

**Deterministic passthrough.** In `S2_DET` mode, a request that uses nothing Phase 2 adds goes straight to
`slResolveText`, unchanged. Phase 2 features are thresholds, filters/corrections, top-N, review, support,
and the clarification policy. A clarification the FOUNDATION raised also resumes on the foundation path
(caught by infra test A5).

**Limits** (`S2_LIMITS`): 2 plan iterations · 8 tool calls · 2 clarification loops · 25 s per call ·
60 s wall clock · 60k tokens. Once the token budget or wall clock is hit, narration is deterministic.
Anything reached is stated in the answer note and `trace.reasoning.limitsReached`.

**Tool additions:**
- `getPopulationSupport` (references only; says invoice documents are not connected).
- `getFluxAnalysis({focusLargest})` moves context to the largest mover.
- `s2WrapTool` attaches `data` to comparePeriods / getDriverAnalysis / getGovernedPopulation / getProofBridge /
  getCloseReadiness / getReconciliationSummary.
- `sfToolRun` keeps the tool's population on the object as a NON-enumerable `lines`.

**Trace** (`trace.reasoning`, shown by `siTraceView`): mode, calls[stage · status · code · requestId ·
engine · latency · usage], contextSupplied, candidatesSupplied, interpretation, clarificationDecision,
plan (as proposed), planValidation[repairs · rejected · truncated], toolsAvailable, toolsSelected,
narrative, grounding[accepted refs · rejected with reasons · fact keys], tokens, limitsReached, fallbacks,
correction.

**Run:**
- `sloaneSelfTest()` 15 · `siSelfTest()` 31 · `siEvalSuite()` 12 · **`s2Eval()` 19** (phrasings, context chain,
  ambiguity, wrong context, multi-step, proof, follow-ups, correction, entity ambiguity, review, invented tool,
  fabricated number, provider down, permissions, injection, bounds).
- `npm run sloane:dryrun` in `packages/agent`: 17 checks of the REAL adapter against a local fake Messages
  endpoint, no spend.
- `preview_start {name:'sloane-demo'}` (`npm run sloane:demo`): the full browser → API → real adapter path
  against `scripted-demo.ts`, a **DEMO scaffold, not a provider**. It serves canned interpretations and plans
  for the four brief flows plus one deliberately invented figure, which grounding must reject.

**Traps:**
- **A seeded Sloane investigation hydrates through `sfRun` when a question continues it.** Hydration
  replays lazy steps, pushing traces and touching context mid-flow. Read a run's trace by its
  `rawUserRequest` + `reasoning`, never "the last trace".
- **`sfObject` does not keep `lines`.** Facts built from `o.lines` saw zero rows until `sfToolRun` attached
  them (non-enumerable).
- **Foundation `sfUpdate` marks scope DERIVED.** A reliability rule that only admits EXPLICIT/INHERITED asked
  for scope on every follow-up.
- **`.claude/launch.json` `runtimeExecutable` backslashes are eaten.** Use forward slashes.

**Not built:** a live model call from this environment (no credentials here; transport proven with the
scripted endpoint and the dry run) · monthly-column statements (a Jan-start range renders YTD, with the tool's
warning as the note) · entity-scoped statements (an entity filter on a P&L resolves but the statement stays
group) · streaming or progressive rendering of model output · write actions, PBC assembly, visual redesign.

## 2026-09-17 (later) — SLOANE: orchestration moved SERVER-SIDE, structured-output schema fixed

**Supersedes the "browser orchestrates" parts of the Phase 2 block above.** The first live Anthropic call
failed with HTTP 400 before the model ran, and it exposed that orchestration lived in the browser.

**The schema defect.** Anthropic structured outputs rejects `type: ["string","null"]` combined with `enum`
(even when the enum lists null). Every nullable field in `packages/agent/src/sloane/schema.ts` is now
`anyOf: [branch, {type:"null"}]`; enums are unchanged. `planSchema(toolIds)` restricts `tool` to the request's
allowlist. `structuredOutputProblems()` runs in the adapter before every call. All three schemas were accepted
by the live API.

**The live path is now:**
`Browser → POST /api/sloane/turn → SloaneOrchestrator (src/sloane/orchestrator.ts) → FinancialContextEngine →
SloaneLLMAdapter → ClarificationEngine → Planner → tool registry (src/sloane/tools.ts) → FinancialObjects`.
- The browser sends words, a session id and, to answer a question, `{pendingId, optionId}`. No context, plan
  or actor. `/interpret`, `/plan`, `/narrate` return **410**. `GET /api/sloane/trace/:id` (loopback only) returns
  the server-side `SloaneExecutionTrace`.
- Server tools read `@korvyn/core`'s validated enterprise GL (seed 42, 12 invoices/month — the snapshot
  `view-egl` embeds), via `src/sloane/financials.ts`. Declared, cited inputs: FX rate set `FXR-2026-AVG-REP-1`
  (core has no rates) and intercompany-fee elimination. Tools: `getIncomeStatement`, `getTrialBalance` (READ),
  `postJournalEntry` (GOVERNED, always refused). `WRITE_ACTIONS_ENABLED` is a constant `false`.
- Actor is server-configured (`SLOANE_ACTOR_ROLE`: FINANCE_REVIEWER default, ENTITY_ACCOUNTANT scoped to MDH);
  there is no authentication in this prototype and the browser cannot claim a role.
- The model interprets and narrates; it plans only multi-step requests (single objects use the deterministic
  plan). A deterministic interpreter answers when the adapter declines, fails or is unsure.
- **Browser (`index.html`):** when the page carries the `korvyn-sloane-api` marker and health says available,
  `s2Submit` → `s2ServerTurn` → `s2ServerRender` (existing `slCard`, no numbers computed in the browser).
  `S2_REMOTE` is gone; `s2Reasoner()` is a scripted test reasoner or `S2_DET`. On a static host the old
  deterministic browser engine still runs unchanged.

**Live test (verified):** "I want to see a monthly income statement from January through April." →
claude-opus-5 interprets (INCOME_STATEMENT, 2026-01→2026-04, monthly) → clarification: scope → consolidated →
`getIncomeStatement` executed server-side → IncomeStatement, 4 columns, NI $9.14M / $8.29M / $10.28M / $9.80M,
4 grounded sentences, 0 rejected. 3.4 s + 5.4 s.

**Run:** `npm run sloane:test` (10) · `npm run sloane:dryrun` (29; the fake endpoint now rejects incompatible
schemas like the live API) · typecheck. `preview_start {name:'sloane-serve'}` runs the REAL server
(`npm run serve` from `packages/agent`; `.env` there holds the key). `.env.example` holds a placeholder.

**Known gaps:** only two server tools exist, so every other Sloane capability works only on the static page,
which never calls the model · `sloaneSelfTest()` D3 fails on the live-server page (it drives the browser
clarification path synchronously; 15/15 on a static page) · prompt cache reads 0 (prompts likely below the
cacheable minimum) · `scripted-demo.ts` still scripts browser tool names, which the server planner rejects ·
the old key remains in git history (revoked).

## 2026-09-17 — SLOANE 2.0 PHASE 3A: governed server-side tool coverage across Korvyn

Owner's brief: every major Korvyn read/analysis capability becomes a governed server-side Sloane tool. No UI
redesign, no provider change, no write actions. **The LLM interprets and plans; Korvyn tools supply facts.**

**THE DATA BOUNDARY IS THE FIRST THING TO KNOW.** The server reads ONLY `@korvyn/core`'s enterprise GL (6
entities, Jan–Jun 2026, project / cost-centre / property dimensions). Reconciliations, flux, close, reports, audit
and evidence as the browser prototype models them do not exist server-side, and the browser's figures (FS-CIP
4,210.2) are NOT the server's. Phase 3A builds those domains server-side over the core GL instead of porting
browser data. The two books never mix.

**Files (`packages/agent/src/sloane/`):**

| File | Role |
|---|---|
| `governed.ts` | `GovernedLedger`: ONE population engine over flattened journal lines. `definePopulation` (canonical, stable `POP-` id) · `query` (count, totals, ONE page ≤ 50, async export hook) · `aggregate(rows, dimension, split)` (the only aggregator, every dimension) · `balanceUsd` · `sourceRef` |
| `controls.ts` | `ControlService`: reconciliations, flux, close, reporting, audit, evidence. Amounts are DERIVED. Workflow state (status, comments, tasks, report definitions, PBC) is SEEDED and says so (`SEEDED`) |
| `toolset.ts` | 88 READ tools in 12 domains, registered via `registerTools`. `findObjects` (universal find) · `ACCOUNT_ALIAS` (CIP → 15000) |
| `tools.ts` | types · `ROLES` (FINANCE_REVIEWER, ENTITY_ACCOUNTANT scoped to MDH, EXTERNAL_AUDITOR) · `authorize` · `visibleOf` |
| `orchestrator.ts` | context (focus, populationId, lastRefs, comparisonPeriod, filters) · relevance-ranked exposure · model plan with `$ctx.x` / `$N.refs.x` refs · validation and repair · execution-time ref resolution · `deterministicPlan` fallback |
| `coverage.test.ts` · `live-eval.ts` | offline coverage tests · LIVE suites §21/§22 (`npm run sloane:live-eval`, spends credits; `SLOANE_EVAL_ONLY=cross` for §17 + scoped permissions) |

**Declared inputs, cited on every object that uses them:** `FXR-2026-AVG-REP-1` (flows), `FXR-2026-CLS-REP-1`
(balances), `APX-2026-REP-1` (a representative AP extract: vendor, invoice, PO, contract and approval references;
**the core GL carries no vendor**), and `SOURCE_HEALTH` (JD Edwards unavailable, NetSuite stale, no deep links).

**Honest unavailable states:** cash flow statement (not modelled) · prior year (FY2025 is not in the governed
ledger, so "compare to last year" returns UNAVAILABLE) · bank reconciliations (`SOURCE_NOT_CONNECTED`, a separate
state from `NOT_TIED`) · documents (references only) · ERP TB extracts (the tie-out is PARTIAL).

**Genuine findings the data produces (derived, not seeded):** MDH intercompany receivable does NOT tie to the
foreign OpCos' payables (−$6.18M gross); REIT↔MDH ties; CIP project subledgers tie; AP lines missing
invoice/approval references come from the extract's rules.

**Traps that each cost a live-eval round:**
- **Exposure must be RANKED, never sliced in registration order.** At a 22-tool cap, evidence and recon tools fell
  off the end for multi-domain questions, and Claude answered "missing support" with the wrong tools.
- **A vendor population is the spend leg.** Both legs of an AP bill carry the vendor, so the AP liability offset
  netted Siemens spend to zero. `match()` excludes 20100 unless `includeApLiability`.
- **Population ids are canonical** (sorted keys and arrays), or one definition gets two ids.
- **Planner kind checks resolve names:** the model passes "Meridian DC Holdco LLC" for an entity, or "CIP" for an
  account.
- **Fact labels must say what a number is.** "Jun 2026 $6.17M" from `comparePeriods` was narrated as a balance; it
  is period activity.
- **"Does the reconciliation support it" needs `getReconciliationsForAccount`.** Without it Claude used evidence
  coverage as a stand-in.
- The deterministic `behind` regex routed "the GL behind X" to close-by-entity.
- **On the live page, seeded Sloane investigations hydrate through `/api/sloane/turn` first.** A test submission
  sent during hydration is dropped; resubmit, and read traces by request text.

**Verified:** typecheck · 17/17 unit + coverage tests (all 88 read tools run, bounded rows, footing across
dimensions, permissions, unavailable states, deterministic context chain) · 30/30 provider dry run · LIVE
claude-opus-5: §21 13/13 and §22 5/5 answered in place (FY2025 correctly UNAVAILABLE); §17 cross-module plan
executed 8 tools across analysis, recon and evidence in one answer; an entity accountant is exposed zero audit
tools · browser: a live answer renders in the existing Sloane panel, console clean · 4/4 repo gates · average live
turn 16 s (3 model calls), tools ≤ 14 ms.

**Not built (Phase 3A stops here):** any write (flux or recon comments, attachments, publishing, certification,
mapping, ERP, PBC finalisation) · server-side data for the browser's own recon/flux/close stores · real
documents · FY2025 · streaming · a real query engine behind population ids.

## 2026-09-17 — SLOANE 2.0 PHASE 3B: controlled Build + Act

Owner's brief. **The LLM understands and proposes; Korvyn validates; the user confirms; Korvyn executes; everything
is traced.** No UI redesign, no permission loosening, no model-reachable write.

**Files (`packages/agent/src/sloane/`):**

| File | Role |
|---|---|
| `actions.ts` | `ActionGovernanceEngine` (the server port of the browser's `SI_ACTION_POLICY`: same type names, same three classes, unknown type → GOVERNED_ACTION) · `ActionProposal` · 13 registered Action Services · `ActionEngine` (`propose` / `revise` / `decide`, audit, timelines, idempotency, staleness) · `PEOPLE` reviewer directory |
| `actiontools.ts` | 17 PROPOSE-risk tools the planner may call. They create proposals or session drafts and write nothing |
| `store.ts` | `WORK`: the one mutable work store (comment threads, evidence relationships, issues, assignments, saved objects). Only Action Services write it; `controls.ts` reads it back |
| `actions.test.ts` · `live-actions.ts` | 13 offline action tests · live Claude suite (`npm run sloane:live-actions`, spends credits) |

**The one execution path.** `POST /api/sloane/action {sessionId, proposalId|planId, decision: confirm|cancel|edit|choose,
edits?, choice?, overwrite?, requestId}` → `orchestrator.decide()` → `ActionEngine.decide()` → `ActionService.execute()`.
No tool, plan step or model output can reach `execute()`. Before every execution the engine re-resolves the actor
(a revoked permission stops the write), re-validates, checks dependencies and checks staleness. GOVERNED_ACTION
proposals (`RECONCILIATION_APPROVAL`, `CLOSE_CERTIFICATION`, `REPORT_PUBLICATION`, `MAPPING_CHANGE`,
`DIMENSION_OVERRIDE`, `ERP_WRITE_BACK`) show readiness and the governed route, and are never executed.

**Invariants:**
- A proposal executes at most once: COMPLETED returns "not repeated", EXECUTING refuses a second run, and a
  `requestId` replays the recorded response. The browser disables buttons while a decision is in flight.
- `targetVersion` is captured when a proposal is prepared. A changed target returns "Stale …" until the user
  chooses `overwrite`.
- A correction ("No, attach those to …") revises the SAME proposal (`reviseActionProposal`), never a duplicate. A
  target the user resolved once is remembered for the session.
- Authorship is the human: comments read "Mitra Giri via Sloane", source SLOANE; the audit actor is the person.
- The user's dictated wording is kept verbatim (`verbatim()` replaces a shortened model paraphrase).
- A figure in a comment or issue that is neither on the target nor in the analysis it came from is flagged, never
  rewritten.
- Attached evidence is a relationship to a reference (`RECONCILIATION_SUPPORTS` / `FLUX_SUPPORTS`, plus
  `INVOICE_FOR` etc. to the transaction, and `PACKAGE_CONTAINS`); `documentConnected:false`, no copy.
- Report and Excel drafts live in the session and are modified in place. Only "save" is a CONFIRM action (report
  saved as DRAFT, never published).

**Traps the live runs found:**
- **A dependency is not a package.** Claude made the attach step depend on the comment, and the service read any
  dependency as a support package and crashed. Package mode is now an explicit `fromPackage`; other dependencies
  are ordering only.
- **The stale check must read the prepared version BEFORE revalidating.** Revalidation refreshes `targetVersion`,
  so the first cut could never detect a change.
- **The same proposal card renders twice** (panel and workspace): repaint by `data-s3a`, never by element id.
- **A grounded explanation's figures come from the analysis objects, not the target.** Checking them only against
  the Flux line flagged every figure in the explanation.
- "Electrical CIP" has no server-side reconciliation: Korvyn asks which CIP reconciliation (honest), then
  remembers the choice.

**Verified:** typecheck · 30/30 unit tests · 30/30 dry run · LIVE claude-opus-5 (second run, after fixes):
- Tests A–E all pass: proposal first, the write only on confirm, no write during any turn.
- Multi-action: 3 proposals, then confirm-all completed all 3 in sequence.
- Governed approval showed readiness and was refused execution.
- Browser, live server: ActionPreview renders in the Sloane panel; Edit → v2 of the same proposal; a double-clicked
  Confirm wrote exactly one comment and one audit record; console clean.
- 4/4 repo gates.

**Not built:** production ERP write-back · close certification, reconciliation approval or report publication
through Sloane · PBC finalisation · document fetching · durable storage (`WORK`, proposals and audit are in memory
per server process) · authentication (the actor is server-configured) · a UI for the session activity endpoint.

## 2026-09-17 — SLOANE 2.0 PHASE 3C: durable work store, server source of truth, authorization foundation

Owner's brief. **Work Sloane or a person does survives a restart, is the same record everywhere, is done by an
authenticated actor with a capability, and is audited in an append-only log.** No redesign; the browser changed only
where it now consumes server state. Everything is in `packages/agent/src/sloane/`.

**Persistence** (`persistence/`). `node:sqlite` (`DatabaseSync`, WAL, experimental in Node 22), file
`packages/agent/data/korvyn-work.db` (git-ignored; `KORVYN_DB_PATH` overrides; `:memory:` under the test runner).
- `db.ts`: migrations for `records` (generic, `kind` + stamp columns + JSON `data`), `audit_events` with
  `audit_no_update` / `audit_no_delete` triggers, `idempotency`, `sessions`, `seed_meta`. `tx()` = BEGIN IMMEDIATE.
  `korvynId(prefix)` → `PREFIX-<time36><rand>`.
- `repositories.ts`: `RecordStore.update(kind,id,expectedVersion,…)` throws `StaleVersionError` (code
  `STALE_PROPOSAL`). Domain repositories: comments, evidence, issues, reviewer assignments, saved objects,
  investigations (+ events, context snapshots), actions (proposals + executions), reconciliations, flux, close,
  reports, audit (INSERT only), idempotency, sessions. **No generic update route exists.**
- `seed.ts` (`SEED_VERSION 3C.1`): the 38 Reconciliations-module definitions (`RECONDEF-…`, catalog MODULE) and the GL
  catalog, their workflow states, comments, support, flux explanations, close tasks, report definitions, published
  reports, packages, PBC — once, in one transaction.
- **Trap: a domain object whose own fields are `status` / `version` / `createdAt` collides with the record stamp
  columns and loses them.** `ActionRepository` stores the proposal whole under `{ proposal }` for exactly this reason.

**One book.** The server is authoritative for reconciliation WORKFLOW (status, comments, support, reviewer) for both
catalogs; module balances are still computed by the browser module (`tieStatus COMPUTED_IN_MODULE`, stated as a source
issue). `store.ts` (`WORK`, bound by the orchestrator) is the facade Sloane's tools and services use; `workapi.ts` is
what the UI uses, over the same repositories. Flux browser lines map to server account groups through
`FLUX_LINE_ACCOUNTS` — a navigation crosswalk, not a mapping.

**Auth** (`auth.ts`). `ActorContext` is built ONLY from the `korvyn_session` cookie (HttpOnly, SameSite=Strict).
`KORVYN_AUTH_MODE=dev` (default) auto-signs an anonymous caller in as `KORVYN_DEV_USER` (default `user:mgiri`); any other
value is strict (401). `POST /api/auth/dev/switch` is dev + loopback only. Directory: Mitra Giri and Sarah Kim
(FINANCE_REVIEWER), Priya Nair (EXTERNAL_AUDITOR: reads, no comment capabilities), Jonah Park (ENTITY_ACCOUNTANT, MDH
only). `AuthorizationService.can(actor, capability, {entity})`; `FUTURE_GOVERNED` (RECON_APPROVE, CLOSE_CERTIFY,
REPORT_PUBLISH, MAPPING_CHANGE, ERP_WRITEBACK) is stripped from every role. `SoDPolicyService` evaluates four policy
ids; nothing it guards is executable yet.

**Routes** (`routes.ts`, dispatched by `server.ts` for `API_PREFIXES`): `/api/auth/me` · `/api/auth/dev/switch` ·
`/api/sloane/turn` (actor from session; another user's conversation is 403) · `/api/sloane/action` (confirm · cancel ·
edit · choose · **refresh · regenerate** — `overwrite` is gone) · `/api/sloane/investigations[/:id[/resume]]` ·
`/api/sloane/session/:id/activity` · `/api/work/reconciliations/:id[/comments]` · `/api/work/flux/:account[/comments]` ·
`/api/work/flux/line/:lineId` · `/api/work/close` · `/api/work/evidence?target=` · `/api/work/issues` ·
`/api/work/saved/:kind`. A UI write requires `idempotencyKey`, takes `expectedThreadVersion`, and writes the domain
record + AuditEvent (source UI) + idempotency key in one transaction; a stale version is 409 `STALE_PROPOSAL`.

**Actions** (`actions.ts`). Execution is one transaction: domain write, `ACTION_EXECUTION`, AuditEvent, investigation
event, idempotency key `EXECUTE:<proposalId>`, status. A decision replays on `DECIDE:<session>:<requestId>`. A target
that moved makes the proposal `STALE`; the user refreshes (re-read, re-validate, confirm again), regenerates (supersede)
or cancels.

**Investigations** (`orchestrator.ts`). Every turn persists the step (request, READ tool calls, narrative, proposal
ids), findings, object and population refs, and a context snapshot. `investigationView` re-derives objects by replaying
the recorded READ calls; visible to the owner or a share. `resumeInvestigation(id, sessionId)` rebuilds a server
session from the record.

**Browser (`index.html`).** ActionPreview: STALE shows Refresh · Regenerate · Cancel. Reconciliation panel Review and
Support tabs append the server's comments (with a Post form) and attached evidence via `rcSrvWork` — only when the page
carries the `korvyn-sloane-api` marker. Sloane History adds **Saved in Korvyn** (`slSrvHistHTML`), and opening one
resumes it in a new server conversation (`slSrvInvOpen`).

**Also fixed:** Sloane's candidates and deterministic interpreter now resolve a reconciliation by NAME across both
catalogs, and "show me the comments on …" is a READ, not a comment proposal.

**Verified:** `npm run sloane:test` 42/42 (includes `persistence.test.ts`: restart on a real file DB, one book both
ways, permissions at API and at execution, STALE_PROPOSAL, idempotency, audit fields + trigger immutability, session
resolution) · `sloane:dryrun` 30/30 · core 78/78 + boundary · 4/4 gates unchanged · live server: a UI comment survives
a server restart and Sloane (live model) quotes it; the auditor is refused 403; a stale proposal refreshes and completes.

**Not built (per §33):** final reconciliation approval, close certification, report publication, ERP write-back, a
production identity provider, external auditor access, PBC finalization, invoice connectors, Excel binary generation.
**Debt:** module reconciliation balances and the Flux, Close and Reports browser pages still own their own state; the
browser keeps its seeded `RC_SEED`/`CMT` alongside the server's.

## 2026-09-17 — SLOANE 2.0 PHASE 3D: one book, server-authoritative state, session hardening

Owner's brief. A hardening phase: no Sloane redesign, no Artifact Intelligence, no Excel add-in, nothing governed
enabled. **Served by `npm run serve`, the browser is a presentation cache. The server's work store is the book for
Flux comments, reconciliation workflow, close task status and saved reports**, and Sloane reads and writes the same
records. FS-CIP 4,210.2 (browser) is untouched. The server book is still `@korvyn/core`'s GL.

**One book** (`packages/agent/src/sloane/book.ts`, seed `3D.1`):
- `tools/extract-browser-book.mjs` lifts `CLOSE_TASKS`, `RC_SEED`, `FSLINES` and `RB_REPORTS` out of index.html
  **once** into `persistence/browser-book.json`. The server seeds those into the store; a 3C.1 database upgrades in
  place (`upgradeTo3D`). Re-run the extractor only when those fixtures change.
- **Flux is keyed by the live Flux Review page's statement lines (`FS-CIP` …), not the retired `#fxRoot` module's ids.**
  `FLUX_LINE_ACCOUNTS` is a navigation crosswalk from an FS line to server account groups. A line's thread plus its
  accounts' threads is what the workspace shows (`fluxLineComments`); an account's thread plus its line's thread is
  what Sloane reads (`fluxAccountComments`).
- Close tasks carry server state (`setCloseTaskState`, versioned). Saved reports are one store for Reporting and Sloane
  (`reportView`, owner normalised to a display name, `getSavedReport` tool).

**Write pipeline** (`workapi.ts`, one path for every UI write): session actor → **authorization first** (`need`,
before any body validation) → `ActionGovernanceEngine.classify` must be `CONFIRM_REQUIRED` → `idempotencyKey` → one
transaction (domain write with the expected version + AuditEvent source UI + idempotency record). Every response carries
`outcome`: SUCCESS · VALIDATION_ERROR · PERMISSION_DENIED · STALE_VERSION · CONFLICT · NOT_FOUND · UNAVAILABLE; a
thrown error becomes UNAVAILABLE with a request id and no stack.

**Session and request security** (`auth.ts`, `routes.ts`, `server.ts`):
- `AuthProvider` → `AuthenticatedSession` → `ActorContext` → `AuthorizationService`; `DevSessionAuthProvider` is the
  only provider (`KORVYN_AUTH_MODE=dev`). No IdP.
- Cookie `korvyn_session`: HttpOnly, SameSite=Strict, Max-Age, `Secure` over HTTPS or `KORVYN_COOKIE_SECURE=1`;
  server-side expiry and revoke; `POST /api/auth/logout`.
- **CSRF**: a synchronizer token per session, sent as `X-Korvyn-CSRF` on every mutation, compared with
  `timingSafeEqual` (`CSRF_REJECTED`); plus an Origin/Referer check (`ORIGIN_REJECTED`) against
  `KORVYN_ALLOWED_ORIGINS`. `GET /api/auth/me` returns actor, token and expiry.
- CORS only for allowed origins, never `*`.
- SoD hooks: `canPrepare` · `canReview` · `canApprove` · `isOwnWork` (nothing they guard is executable yet).

**Browser adapter** (index.html, block `PHASE 3D — THE SERVER BOOK ADAPTER`, prefix `kb`/`KB`, **temporary**): runs
only when the page carries the `korvyn-sloane-api` meta marker. `kbFetch` adds the token and retries once after a
rotation; `kApi` returns `{status, body.outcome}`; `kbInvalidate` drops what the screen holds after any write,
including a completed Sloane action.
- **Flux Review › Review tab** gains a *Comments* section (`kbFluxSection`): the thread, a composer, Edit on your
  own comment (`POST /api/work/comments/:id/edit` with `expectedVersion`).
- **Reconciliation panel**: comments and support attach go through `kApi`; approved reconciliations refuse support
  changes (409 CONFLICT).
- **Close task detail**: a status control (`kbCloseControl`).
- **Saved Reports**: save, save as, rename, description, duplicate, archive, delete and share are overridden to
  write the server and re-read it.
- The local fixtures stay as the render cache and the static-host fallback.

**Sloane fixes the one-book tests found:**
- A reconciliation named in full ranks first in `findObjects` (the CIP alias used to crowd "Mechanical CIP" out).
- On a read the engine overrules the model's object when the request names a reconciliation, and a named one
  becomes focus before planning, so `$ctx.reconciliationId` resolves.
- A question about a reconciliation never falls through to a comment proposal.
- An ACT keeps the population in context when it names a new target ("attach the invoices to Mechanical CIP").
- `guardReconciliation`: a scoped actor cannot read a group reconciliation through Sloane.
- Pointer words make a request a continuation.

**Verified live** (claude-opus-5, `sloane-serve`):
- Flux: Sloane's comment shows on Flux Review › FS-CIP › Review; a workspace comment and edit are quoted back by
  Sloane.
- Recon: a workspace attach and comment on Mechanical CIP are read by Sloane; Sloane's confirmed invoice attach
  shows in the panel; Electrical CIP (approved) refuses.
- Close: a status change round-trips.
- Reports: Sloane saves → My Reports; a workspace rename → Sloane reads v2.
- Durability: server restart plus page reload keeps all of it.
- Authorization: the auditor is refused FLUX_COMMENT; MDH is refused group reconciliations.
- CSRF: missing or forged token 403; foreign Origin 403.

**Checks:** `npm run sloane:test` 54/54 (`onebook.test.ts` over a real HTTP server with a cookie jar) · `sloane:dryrun`
30/30 · core 78/78 · 4/4 gates unchanged.

**Not built / debt:**
- Reconciliation BALANCES are still computed by the browser module (`COMPUTED_IN_MODULE`).
- Flux explanations, workflow status and @-mention notifications remain browser-local.
- Report owner authorization is visibility only (no owner-only edit rule).
- The dev provider is the only provider; the adapter and local fixtures are temporary.
- The `#fxRoot` module is untouched and not one-book.
- `DEV_DIRECTORY` names are the only people Sloane can attribute.

## 2026-09-18 — SLOANE 2.0 PHASE 4A: Artifact Intelligence (real Excel workbook generation)

Owner's brief. Ask → build → preview → refine → validate → generate → download. **A workbook is a versioned DEFINITION that cites
governed objects; the file is rendered server-side from the same composition the preview shows.** Everything is in
`packages/agent/src/sloane/`. The browser book (FS-CIP 4,210.2) is untouched; every figure here is the server book (`@korvyn/core`'s GL).

**The two gates, closed first.**
- **Flux explanations are ONE server record** per (account group, period), `EXPL-<acct>-<period>` (`book.ts` `fluxExplanation` /
  `setFluxExplanation`). An edit is a new version, with the prior wording kept in `history`. Editing an APPROVED or SUBMITTED
  explanation returns it to DRAFT. The Flux Review panel reads it (served mode overrides `fxNarrative` / `fxNarrSave` and shows
  a *Governed explanation* block with id · version · who changed it) and edits it (`POST /api/work/flux/line/:lineId/explanation`).
  Sloane's `getFluxExplanation` reports the same explanation id and version. An artifact cites `(id, version)` and reads the words
  at generation; a definition never holds them.
- **Reconciliation balances are versioned server records** (`controls.ts` `reconBalance` → records kind `RECON_BALANCE`). The
  values derive every time; the snapshot's version moves only when a value moves (a fingerprint). A citation is `(id, version)`.
  **Module reconciliations the server book models**: a module line that is the only reconciliation on its statement line, and whose
  line maps through `FLUX_LINE_ACCOUNTS` (the existing crosswalk, not a new mapping). There are 11. They reconcile at group scope:
  cash is BANK, the rest are ROLLFORWARD. A roll-forward now includes the translation of the opening balance, so a
  multi-currency roll-forward ties. The four CIP groups (they share FS-CIP), the debt split and right-of-use stay `available:false`,
  with the reason. **They are never estimated, and an artifact lists them as excluded.**
- **BANK reconciliations prove against a RECORDED statement balance** (records kind `RECON_STATEMENT`, versioned,
  `POST /api/work/reconciliations/:id/statement`, capability SUPPORT_ATTACH, refused on an APPROVED reconciliation). The
  Reconciliations panel's Review tab shows the server balance and records the statement.

**The source feed** (`sourcefeed.ts`, records kind `SOURCE_POSTING`): a late ERP posting is IN THE ERP when it posts and IN THE
GOVERNED LEDGER once it syncs. `GovernedLedger.dataVersion()` moves with every synced posting, and population ids carry it. An
unsynced posting is how a tie-out genuinely fails. The feed is replayed on start. It is only reachable through
`POST /api/work/dev/source-posting` / `source-sync` (dev auth mode + loopback) and tests; it is scaffolding for a connector.

**The artifact module** (`artifacts/`):

| File | Role |
|---|---|
| `model.ts` | the `ArtifactDefinition` (sheets GL · TB · TIEOUT · RECONCILIATIONS · FLUX · SUMMARY), the GL column catalog (20 default columns; the Source / Governed / Effective vendor triplet; Department declared *unavailable* — the book carries none), deterministic file names |
| `compose.ts` | the ONE composition: definition → `WorkbookModel` (chunked row sources, partitioning at Excel's row limit, citations, population pins). Preview and file both read it |
| `tieout.ts` | the ERP tie-out. The SOURCE path reads core entries RAW plus every source posting; the GOVERNED path reads governed lines. Same translation (BS at closing, IS at average) and eliminations. Per-ERP sections, a per-account bridge (source → FX/CTA → eliminations → reporting adj. → final governed vs Korvyn governed TB). Status `TIED` · `NOT_TIED` · `PARTIALLY_VALIDATED` · `SOURCE_UNAVAILABLE` |
| `renderer.ts` | `ExcelRenderer` (the abstraction) → `ExcelJsStreamingRenderer` (exceljs 4.4 streaming WorkbookWriter; shared style objects; stripes as ONE conditional-format rule), `CsvRenderer` (manifest block, then rows). Preset `KORVYN_FINANCIAL` |
| `refine.ts` | deterministic refinement: each clause of the user's words becomes a structured change. **The user's words win over a model's structured reading** (a model's `vendor` never replaces "source vendor") |
| `engine.ts` | lifecycle, versions (history kept), pins + STALE detection, permissions, async generation jobs, downloads, audit |
| `perf.ts` | SYNTHETIC scale harness (governed lines repeated) |

**Lifecycle.** Each workbook change in a conversation is persisted by the ORCHESTRATOR (`persistDraft`, like the investigation
record), not by a tool: create = v1, every refinement = a new version, history kept, audited `ARTIFACT_CREATED` /
`ARTIFACT_MODIFIED`. **PROPOSE tools still write nothing.** Generation is a CONFIRM action (`GENERATE_EXCEL_ARTIFACT`) from Sloane,
or the preview's own *Generate Excel / CSV* button (`POST /api/work/artifacts/:id/generate`, channel REPORTING/SLOANE). Both run
`requestGeneration`, which checks permissions and the expected version, then **exact population** (the live pins must equal the
version's), non-empty populations, and the tie-out. It records an `ARTIFACT_GENERATION` (GENERATING) and starts a job that streams
the file to `packages/agent/data/artifacts/<GEN-id>/` (git-ignored; `KORVYN_ARTIFACT_DIR` overrides). A job the server was
running at restart is FAILED on start, with that reason. Status: DRAFT · VALIDATING · GENERATING · GENERATED · FAILED; **STALE is
detected, not stored**. A failure keeps the definition (`lastError`, no new version). Refresh = a new version against current data.
A generated file is immutable and keeps its own frozen definition and pins.

**Tie-out policy.** A workbook with a Tie-Out tab is labelled audit-ready ONLY when the tie-out is TIED. Anything else puts
`STATUS: …` on every sheet's title block, and generation needs `acknowledge` (a Sloane confirmation acknowledges the warning it
shows). On this book the group is **PARTIALLY_VALIDATED** (NetSuite stale, JD Edwards unavailable) at 0.00 difference; MDH alone is
TIED; an unsynced posting makes it NOT_TIED with the exact difference.

**Relatedness.** With a GL tab, "related" reconciliations and Flux lines are those of its population's account groups. **An empty
GL population relates to nothing, never to everything.**

**Names.** A derived name follows the definition (a new threshold renames "…over $1M" → "…over $500K"); a name the user gave
(`nameSource:'USER'`) stays. Adding a Tie-Out does not rename "FY26 Governed GL". Files: `Korvyn_FY26_Governed_GL_Corporate_Consolidated.xlsx`.

**Sloane.** Tools `buildExcelArtifact` · `modifyExcelArtifact` (pass the words verbatim) · `previewExcelArtifact` ·
`proposeGenerateExcelArtifact` · `proposeRefreshExcelArtifact`. `artifactPlan()` routes deliverable requests deterministically and
**overrides a model plan that did not act on the workbook** (e.g. a TB tie-out read for "make sure it ties back to ERP").
Artifact and draft refs survive turns about something else (`commitShown` keeps them). The browser renders an
`ExcelWorkbookPreview` as tabs over striped rows in the file's column order, with Generate Excel / CSV / Refresh / Refine and
job polling (`a4*` in index.html, block *PHASE 4A*).

**Verified:** `npm run sloane:test` **64/64** (including `artifacts.test.ts`: both gates, tests A–D, partitioning, security, failure,
refinement precedence), dry run 30/30, core 78/78, 4/4 repo gates unchanged. LIVE claude-opus-5 in the browser covered the §29 flow
(six turns → a real 146 KB workbook, read back), the §30 Siemens flow (it refuses an empty "over $1M" population before confirmation;
at $500K it has 2 lines, 4 cited CIP reconciliations and the edited EXPL-15000-2026-06 v2), both gates, and STALE → refresh →
regenerate with the prior file untouched. Scale (synthetic): 1.2M rows → xlsx in 35 s over 2 worksheets, peak heap 93 MB; 3M-row
CSV in 11 s.

**Traps:** the Browser tool times out at 45 s and a timed-out script KEEPS RUNNING, so it will submit concurrent Sloane turns. Wait
on `S2_BUSY`, one turn per call. **Shell escapes again** (the ninth time): a heredoc turned `\\b` into backspace characters in
`refine.ts`. Use the Write tool.

**Not built (per §33):** the Excel add-in, PBC interpretation, invoice retrieval, document packaging, PowerPoint, an auditor portal,
ERP write-back. **Also not built:** a server-side query engine behind population ids (the prototype executor holds the ~1.2k-line
book in memory; the renderer streams in chunks), a job queue that survives restart (jobs are in-process; interrupted ones are
FAILED on start), and governed dimension overrides (Governed Vendor is always empty on this book, and says so by being blank).

## 2026-09-18 — SLOANE 2.0 PHASE 4B: generalized Artifact Intelligence (governed deliverables of many types)

Owner's brief. **Every deliverable is a DEFINITION composed from one section library over governed services; a type is a starting
template, never an engine of its own.** Built on 4A without rebuilding it: same composition, renderer, pins, jobs, audit. The server
book is still `@korvyn/core`'s GL; the browser book (FS-CIP 4,210.2) is untouched.

**Types** (`model.ts` `ArtifactType`, `sections.ts` `TEMPLATES`):

| Type | Starting sections | Window |
|---|---|---|
| GL_EXTRACT | Governed GL (4A path, unchanged) | FY |
| AUDIT_SUPPORT_PACKAGE | GL · TB · Tie-Out · Population Metadata · Source References · Evidence Index | FY |
| CLOSE_REVIEW_PACKAGE | Close Summary · Material Blockers · Recs Not Tied · Unexplained Flux · Missing Support · Pending Review · Exceptions | month |
| RECONCILIATION_PACKAGE | Summary · Reconciliation · Reconciling Items · GL Detail · Support Index · Comments · Tie-Out | month |
| FLUX_PACKAGE | Flux Summary · Driver Analysis · GL Detail · Explanation · Support · Related Reconciliations | month |
| SUPPORT_PACKAGE (vendor) | Summary · GL · Projects · Reconciliations · Flux · Evidence Index · Missing Support · Support Coverage | FY |
| FINANCIAL_REPORT_PACKAGE | Income Statement · Balance Sheet · MoM Analysis · Top Drivers | range |
| MANAGEMENT_REVIEW_PACKAGE | Close Summary · Income Statement · Variance · Material Movements · Blockers | range |
| PBC_PACKAGE | **scaffold**: PBC requests as recorded + source references; nothing is interpreted | FY |
| EXCEL_WORKBOOK | "on separate tabs" requests go through the 4A GL path | — |

**The section library** (`artifacts/sections.ts`). Each builder reads only governed services: close readiness and blockers, the
versioned reconciliation balance, the one Flux explanation record, AP-extract evidence references, the ledger, the tie-out, the
income statement (`data.incomeStatement`) and balance sheet (`toolset.bsValues`, now exported). **Every row with a Trace column
carries a governed reference** (`txn:` `recon:` `flux:` `population:` `evidence:` `close:` `source:`); a test walks every template.
`compose.ts` dispatches any non-4A kind to `SECTIONS[kind]` with one `SectionCtx`. A GL section may carry a **rule**
(`resolveGlRule`): `MATERIAL_ITEMS` (the GL behind material / over-$X flux lines and blocking reconciliations), `RECONCILIATION`
(its accounts and entity) or `ACCOUNT_MONTH`. A rule that resolves to nothing (a module reconciliation) is an empty section with a
WARN, never a block. **Focus** (`reconciliationId` / `account` / `vendor`) decides what "related" means.

**Rules the build found, keep them:**
- **Blockers and approvals are read at the scope's full visibility and filtered by entity afterwards.** Passing the narrowed entity
  set to `closeBlockers` dropped the GROUP-level checklist blockers when completed entities were left out.
- **A period package measures the period, a population package its lines.** Adding a GL tab to a close package must not change its
  Missing Support; adding one to a financial package must not turn Top Drivers into a GL breakdown.
- **"Leave out completed entities"** is derived (`completeEntities`: every reconciliation tied and approved, nothing blocking or
  pending) and stated on the Close Summary and in the warnings. It is never a stored flag on an entity.

**Validation** (`engine.validate`): Permissions · Period · Scope · Population (per GL section) · Tie-out · Source freshness ·
Evidence · Reconciliation · Excluded (one line) · Stale · Audit-ready claim. **FAIL blocks generation**; WARN goes on the proposal
and the file. `VALID` / `VALID_WITH_WARNINGS` / `BLOCKED`. **Nothing is called audit-ready unless the tie-out is TIED.** Korvyn names
an audit package "Audit GL Extract", and a user name that claims "audit-ready" gets a WARN.

**Contract** (§2): `view().contract` gives id, type, title, period, scope, currency, basis, source objects / populations / evidence /
reconciliations / Flux items, sections, worksheets, status, version, creator, data and mapping versions, source systems,
investigation, trace, permissions, warnings and validation status.

**Evidence relationship versions are pinned.** A Support Index cites `EVIDENCE_RELATIONSHIPS` `(recon key, relationship count)`, so
support attached after a package was defined makes it STALE, the same way a moved balance does.

**Lifecycle additions:**
- **derive** (`deriveDefinition` → `create`, audited `ARTIFACT_DERIVED`): a NEW artifact with `derivedFrom`. The source is never
  touched. A month that has not closed is refused by name ("Create July using the June package" → July is not governed).
- **restore**: a prior definition becomes a NEW version.
- **setStatus**: SAVED / ARCHIVED / DRAFT. An archived package cannot be generated until it is restored.
- **Jobs**: QUEUED → VALIDATING → GENERATING → **COMPLETED** | FAILED | **CANCELLED**. `cancel` is checked per progress chunk and
  before rendering. A cancelled job discards its partial file and returns the artifact to its prior status. Generation records
  say `COMPLETED` now (4A's `GENERATED` is migrated on start); the ARTIFACT keeps `GENERATED`.
- **Storage** (`artifacts/storage.ts`): `ArtifactStorage` (`locate` / `commit` / `discard` / `exists` / `read`) →
  `LocalArtifactStorage`. Keys are `<GEN-id>/<file>` and can never escape the root. Tests still set `eng.storage = <dir>`.

**Refinement** (`refine.ts`), with the user's words still winning:
- Section words for every kind; a specific one subsumes a general one ("unreconciled" is Recs Not Tied, not Reconciliations).
- Reorder: "put X first / last / before Y".
- "Add a tab for items over $10M" → ITEMS_OVER.
- "Add GL detail for anything over $10M" / "the GL behind each material variance" → a rule GL.
- "Remove completed entities".
- Period and scope changes, checked against the governed periods and scopes.

**Sloane.**
- `buildExcelArtifact` detects the type from the words (`detectType`), then the focus: `recIn` (a reconciliation by its name's
  words in any order), `acctIn`, vendor.
- New tools: `deriveExcelArtifact`, `proposeSaveExcelArtifact`, `proposeArchiveExcelArtifact` (actions `SAVE_EXCEL_ARTIFACT` /
  `ARCHIVE_EXCEL_ARTIFACT`, CONFIRM_REQUIRED). `previewExcelArtifact` takes a `section` ("show me the blockers tab" → `findSheet`).
- `artifactPlan` routes package phrases, reuse, save / archive / restore and section previews. **A deliverable request never stops
  for the scope clarification**: the preview states Corporate Consolidated and "only MDH" refines it.

**HTTP:** `GET /api/work/artifacts/:id?section=` · `POST …/:id/status` · `…/:id/restore` · `…/:id/derive` · `…/jobs/:jobId/cancel`.
The browser preview (`a4*`) shows the package type, the validation checks, Save Draft / Cancel, the section it opened on, and the
new job states. Generate is disabled while validation is BLOCKED.

**Verified:**
- `npm run sloane:test` **76/76**, including `artifacts4b.test.ts` (12 tests): packages A–E read back from xlsx against the governed
  services, reuse, evidence-pin staleness, cancel, save / archive, storage, every template's traces, HTTP.
- Dry run 30/30, core 78/78, 4/4 repo gates unchanged.
- **LIVE claude-opus-5, every §29 flow**:
  - **A.** Close package → GL over $10M → remove completed → unreconciled first → blockers tab → xlsx.
  - **B.** Electrical CIP (module, marked not server-authoritative) and MDH trade payables (tied, balance cited) → xlsx.
  - **C.** Siemens FY26 support: $1M leaves no lines and generation is refused before confirmation; removing the threshold restores it.
  - **D.** "Audit-ready" GL extract: named "Audit GL Extract", said "not yet audit-ready" (PARTIALLY VALIDATED) → 161 KB xlsx.
  - **E.** Jan–Jun financials → GL over $5M → xlsx; "July using June" refused; "May using this" derived; saved.
- Browser: section preview, Save Draft, Generate → Ready/Download.

**Traps:**
- **Shell escapes, the tenth time**: a heredoc turned `\\b` into backspace characters in `engine.ts`. Found by reading the file, fixed
  with a script. Use the Write tool, always.
- `setUserRole`-style testing does not apply here: the external auditor's dev id is `user:auditor`.

**Not built (per §31):** automatic PBC parsing from auditor files, external invoice retrieval, the Excel add-in, PowerPoint, an
external auditor portal, a conversational-runtime redesign, ERP write-back. **Also not built:**
- a server-side query engine or a restart-surviving job queue (unchanged from 4A);
- an object-store `ArtifactStorage`;
- per-entity close readiness (the Close Summary's readiness is the whole scope's even when completed entities are left out, and says so);
- a template library users can save their own packages into (types are code templates; a saved package + derive is the reuse path).

## 2026-09-18 — SLOANE 2.0 PHASE 5A: Audit / PBC intelligence (request → population → evidence → package)

Owner's brief. **An auditor's request becomes a governed, traceable population and a support package** — REQUEST →
INTERPRET → RESOLVE SCOPE → BUILD POPULATION → TIE TO THE LEDGER → TRACE EVIDENCE → IDENTIFY GAPS → REVIEW → GENERATE.
No separate audit data model: the request, its selections and its gaps are WORK records; the population, tie-out,
matching and evidence are DERIVED from the one governed ledger every time. The server book is still `@korvyn/core`'s GL.

**Files** (`packages/agent/src/sloane/audit/`): `pbc.ts` (`AuditService`: interpretation, upload parsing, population,
tie-out, matching, evidence, gaps, evaluation, versioning, readiness, `AUDIT_CHECKS` hooks) · `pbctools.ts` (Sloane tools
and the PBC workspace object) · `pbcactions.ts` (four Action Services) · `fixtures/pbc27-fixed-asset-additions.csv`.
Package sections live in `artifacts/sections.ts` (PBC_SUMMARY · AUDIT_POPULATION · POPULATION_TIEOUT · AUDIT_SELECTIONS ·
EVIDENCE_MANIFEST · SUPPORT_GAPS); the audit-ready GL preset is `AUDIT_GL_COLUMNS` (`model.ts`).

**Records.** `PBC_REQUEST` (extends the 3C seeded record; a seeded one reads with empty defaults) · `AUDIT_SELECTION`
(the auditor's text kept verbatim, plus a person's resolution) · `SUPPORT_GAP` (materialised with a person's
waiver / resolution). Everything else — population, tie-out, matching, evidence, coverage, status, staleness — is
`AuditService.evaluate()`. A request is VERSIONED: create, a population change, a resolved selection, a linked
reference and a refresh each record a new version with the prior requirement and pins in `history`. Generation and
delivery are OPERATIONAL states (`patchRecordData`, no version bump), so a package that cites request vN does not go
stale because it was generated.

**Interpretation.** `interpretRequest()` — the user's words win; a model's structured arguments only fill what the words
leave open. Object (CIP → 15000 …), window clamped to governed months (FY26 runs Jan–Jun and says so), population type,
threshold, scope, project ("South Valley" is SV-PH2), required evidence (a source reference is always required).

**Intake.** Natural language (Sloane) · manual (`POST /api/work/pbc`, text or a structured requirement) · upload
(`POST /api/work/pbc/upload`, base64): CSV / TSV / TXT / XLSX are parsed (header row detected, metadata lines give the
PBC number and title — "PBC #27" keeps the auditor's numbering); a PDF is kept as REQUIRES_REVIEW. No OCR.

**Population and tie-out.** Selections are every item when the population is ≤ 60, else 25 key items plus a systematic
sample; an uploaded request uses the auditor's rows. The tie-out is population + items below the threshold = the
ledger's gross additions, then net activity against the TB movement, then the ERP → governed bridge. Statuses TIED ·
NOT_TIED · PARTIALLY_VALIDATED · SOURCE_UNAVAILABLE; on this book the group is PARTIALLY VALIDATED (NetSuite stale, JD
Edwards unavailable) at 0.00 difference, and an unsynced ERP posting makes it NOT TIED with the exact difference.

**Matching** (by transaction id → journal → invoice → amount + attributes, tolerance 0.5%): MATCHED · MULTIPLE_MATCHES
(candidates shown, never chosen) · PARTIAL_MATCH (states what differs) · NOT_FOUND · SOURCE_UNAVAILABLE (the entity's
ERP is down). A person's resolution is a new version. **Two selections resolving to one transaction are stated**
("would be tested twice"), never merged.

**Evidence and gaps.** Invoice / PO (AMBIGUOUS when two selections of different vendors cite one PO) / contract /
approval (not required under the $250K policy) / source reference, plus WORK relationships (a linked reference is
`INVOICE_FOR` → `txn:`). Document availability REFERENCE_AVAILABLE · EXTERNAL_RETRIEVAL_REQUIRED · MISSING ·
ACCESS_DENIED — no document connector is live (`DOCUMENT_CONNECTORS`, all NOT_CONNECTED). **Reconciliation and Flux are
ACCOUNT-level** (`ACCOUNT_LEVEL`): one gap per reconciliation / Flux line carrying the selections it affects, and they do
not decide a selection's own coverage. None of the CIP reconciliations is approved in the seeded book, so every CIP
request honestly carries "Reconciliation incomplete". Gap exposure is counted once per selection (`gapExposure`).

**Sloane.** Tools `buildPBCRequest` · `getPBCRequest` / `getAuditRequest` (the workspace; replaced the 3A seeded list) ·
`getPBCSupportGaps` · `getPBCSelectionGL` · `getAuditReadiness` · `modifyPBCRequest`, and proposals
`proposeRefreshPBCRequest` · `proposeDeliverPBCPackage` · `proposeResolveAuditSelection` · `proposeResolveSupportGap`
(action types REFRESH_PBC_REQUEST · MARK_PBC_DELIVERED · RESOLVE_AUDIT_SELECTION · RESOLVE_SUPPORT_GAP, all
CONFIRM_REQUIRED). **A tool never writes**: `s.drafts.pbc` is kept by the orchestrator (`persistPBC`), which also creates
the PBC_PACKAGE draft over the new request, so every 4B refinement and generation path applies unchanged.
`pbcPlan()` routes deterministically ahead of `artifactPlan()`: a request NAMED by its number opens it (never a rebuild),
"missing / what's missing" → gaps, "the GL for those selections" → the selections with their own gaps, population words
("only include South Valley", "exclude items under $500K") → `modifyPBCRequest`, "generate the completed selections" →
`filters.selections = COMPLETED` then the generate proposal. Package words ("add the TB tie-out", "include the related
reconciliations and Flux explanations", "add source vendor", "remove completed selections") go to the package; in a
PBC package TB / TIEOUT mean the POPULATION tie-out.

**Browser.** A PBCRequest / PBCSupportGaps answer renders as the **PBC workspace** inline in the Sloane panel
(`p5PbcHTML`: requirement, population, coverage, tabs Selections · What's missing · Tie-out · Reconciliations & Flux;
choose a candidate, refresh a stale request) above the package preview. Served by Korvyn, **Audit › Requests / PBC** adds
the governed requests, an upload and the workspace in place (`p5AudMount`). Reuses the 4A preview classes and `.ktabs`.

**Permissions and audit.** Read = AUDIT_VIEW (the MDH accountant has none; the external auditor reads and cannot create);
create / refresh / deliver = SUPPORT_PACKAGE_CREATE; link / waive = SUPPORT_ATTACH; rows scoped by entity; an
out-of-scope transaction's documents are ACCESS_DENIED. Audit events PBC_REQUEST_CREATED · PBC_POPULATION_GENERATED ·
PBC_SELECTIONS_MATCHED · PBC_SELECTION_MATCHED · PBC_EVIDENCE_LINKED · PBC_GAP_RESOLVED · PBC_REQUEST_MODIFIED ·
PBC_REQUEST_REFRESHED · PBC_PACKAGE_GENERATED · PBC_PACKAGE_DELIVERED, plus the UI write pipeline's own event.

**Readiness** ("are we audit-ready for CIP?") is deterministic conditions from `AUDIT_CHECKS` — missing evidence, stale
reconciliation, unexplained Flux, unsupported material movement, late approval, stale ERP feed, population drift —
never a score.

**Traps.** The `\b`-becomes-backspace trap hit twice more in Python splice scripts (a non-raw string); always use raw
strings or `chr(92)` and grep for `\x08` after every splice. A filter on WHAT IS SHOWN (`filters.selections`) must not
feed the request's pins or status, or a COMPLETED package reads its own request as stale.

**Verified:** `npm run sloane:test` 82/82 (`audit5a.test.ts`: A–F deterministically with the package read back; the
PBC #27 upload with every match status; XLSX; PDF → REQUIRES_REVIEW; resolve / link / waive; staleness after an unsynced
then synced posting; restricted document; permissions; readiness; refinements) · dry run 30/30 · core 78/78 · 4/4 gates.
**Live claude-opus-5** on `sloane-serve`: A–F end to end in the panel, F generated a 25 KB xlsx over the 3 fully supported
selections (not audit-ready: the tie-out is partially validated); the uploaded PBC #27 opened by number, a candidate
chosen in the workspace (v3) and the duplicate selection stated.

**Not built (§41):** a production external-auditor portal, invoice connectors, OCR, automated email ingestion, ERP
write-back, the Excel add-in, a conversational-runtime redesign, a UI overhaul. **Also not built:** document retrieval
(references only), a waive / link UI in the workspace (Sloane proposals and the API do it), per-request due dates and
owners edited in the UI, and sampling methods beyond key items + systematic.

## 2026-09-18 — SLOANE 2.0 PHASE 6: conversational runtime, latency, context continuity

Owner's brief. **A follow-up modifies the analysis on screen; reading it needs the conversation's state, not a model.**
No UI redesign, no Excel add-in, no new capability outside the conversation. Every step still goes through the
Planner's validation, permission checks and the one execution loop — conversational convenience never skips governance.

**Files.** `packages/agent/src/sloane/conversation.ts` (new) · `orchestrator.ts` (routing, streaming hooks,
supersession, state updates, titles) · `adapter.ts` / `config.ts` (routes) · `toolset.ts` (display thresholds) ·
`routes.ts` (`POST /api/sloane/turn/stream`) · `latency.ts` (the before/after harness) · `conversation.test.ts` ·
`index.html` (streamed render, shortcuts, supersession).

**ConversationState** (`SessionContext.conv`, created on first use so older snapshots still load): the governed
SUBJECT (account, vendor, project, entity), dimension, display threshold (USD millions), requested comparison (kept
even when unavailable), drill level, the primary analysis last run (`analysis` — what a follow-up re-runs), the
ordered items the answer SHOWED (for "the second one"), the last resolved object (for "it"), and the active
artifact / PBC / proposal. `afterAnswer()` updates it from what was shown; `onNewObject()` drops the old view.
Confidence per field: EXPLICIT_HIGH (stated this turn) · INHERITED_HIGH (≤3 turns) · INHERITED_MEDIUM · DERIVED
(policy default or derived) · UNKNOWN. An explicit instruction always wins. Every response carries `contextLine`
and `contextFields`.

**Routing, in order** (`tr.route`, `tr.shortcut` say which rule decided):
1. **SHORTCUT** — `capabilityGap()`: email/send, workbook formatting, budget/forecast, ledger changes → one line and
   2–3 runnable suggestions. No model, no invented action (the baseline turned "Email this to the auditors" into a
   Save-investigation proposal).
2. **DELIVERABLE** — when the last turn was about a workbook/PBC, or the words name one: `pbcPlan()` / `artifactPlan()`
   with no interpret or plan call.
3. **FOLLOW_UP** — `resolveConversational()`: dimension ("By vendor.", "Now projects."), threshold ("Only over $5M."),
   GL ("Show the GL."), proof, support ("Which of these are missing support?"), why, comparisons ("May vs June.",
   "vs last month", "last year" → honest gap if not governed), filter corrections ("No, South Valley only."), and
   deictic references ("the largest one", "the second item", "that vendor", "the GL for it"). Ambiguity asks
   "Which one?" with options that resume as requests. Action words and any new object return null → the model.
4. **FAST** — the model interprets a NEW question (Sonnet 5, effort low, no thinking); Korvyn's deterministic planner
   plans it unless the request has several clauses or is an action/build/correction.
5. **DEEP** — Opus plans only multi-clause reviews and actions. Narration: NARRATE route (Haiku 4.5, ≤3 sentences,
   answer first, correct a false premise); FAST for a broad review. Structural objects (workbook preview, PBC
   workspace) are their own answer — no narration call.

`SLOANE_LLM_FAST_MODEL` / `_FAST_EFFORT` (`none` = not sent; automatic for Haiku, which rejects `effort`) /
`_FAST_THINKING` · `SLOANE_LLM_NARRATE_MODEL` · `SLOANE_LLM_ROUTING=off` restores all-DEEP.

**Streaming** (`/api/sloane/turn/stream`, NDJSON): `status` events are the plan's own step purposes ("Breaking 15000
Construction in progress down by vendor"), `object` carries the structured answer the moment tools finish, `final`
the whole response. Same auth, CSRF and ownership as `/turn`. The browser renders the objects, then replaces the
same investigation entry when the narrative lands (`slReplaceLast`) — never a second entry.

**Supersession (§32).** A newer request in the same conversation aborts the one in flight (the browser aborts its
fetch; the server aborts provider calls through the signal) and the older turn commits nothing — the context is
restored to where it started. State `CANCELLED`.

**Other behaviour.**
- `getDriverAnalysis` / `analyzeByDimension` take `minAbsChange`: groups under the threshold collapse into one stated
  row, the total still states the whole movement.
- A GL population emptied by a threshold says what is there ("No single GL line exceeds $5.00M; the 4 lines total
  $15.80M and the largest is $4.70M"); support on it checks the lines behind the movement and says so.
- A trend emptied by a project/entity filter says where the activity is (Siemens: SG-DC1, LON-DC1).
- The planner repairs a threshold passed in dollars to millions.
- Partial failure answers with what ran and names what did not. A permission refusal is always said as one.
- Safe caches: interpretation (same words, same context, same actor, same data version), narrative (identical facts).
- Investigations are titled for what was investigated (`investigationTitle`).
- Browser: "back", "home", "clear", "start over", "new" are answered locally.

**Tools are in-process and take milliseconds** (≤ 40 ms per plan measured), so running independent steps in
parallel would buy nothing and was not built.

**Traps.** Python splice strings ate `\b` again (a non-raw `\b` inside a template literal); the Edit tool fixed it.
The Bash tool's heredoc broke on backticks — write splice scripts with the Write tool. Haiku 4.5 rejects
`output_config.effort` with a 400.

**Not built:** the Excel add-in, a UI redesign, token streaming of the narrative (it arrives as one event), a
server-side cache shared across processes, cross-session memory of conversation state.

## 2026-09-18 — SLOANE 2.0 PHASE 7: the governed agent runtime

Owner's brief. **The LLM reasons; Korvyn owns truth, tools, permissions, policy, workflow authority, evidence, state,
approvals, the audit trail and the stop conditions.** A goal ("Review the June close", "Prepare the controller review",
"Investigate Siemens for FY26", "Prepare the audit support package for CIP") becomes a durable run:
GOAL → PLAN → VALIDATE → EXECUTE STEP → OBSERVE → UPDATE STATE → REPLAN → CONTINUE / PAUSE / COMPLETE → VERIFY → TRACE.
No UI redesign, no Excel add-in, no uncontrolled autonomy, no direct database / ERP / API access for the model.

**Files** (`packages/agent/src/sloane/agent/`): `model.ts` (AgentRun, AgentGoal, AgentTaskGraph, AgentObservation,
AgentCheckpoint, statuses, autonomy levels, `POLICY_PROFILES`, `PROFILE_FOR`) · `goals.ts` (conservative goal detection and
parsing) · `graphs.ts` (the canonical workflows as task graphs) · `runtime.ts` (`AgentRuntime`). Orchestrator additions:
`agentSession` · `agentAllowlist` · `agentValidate` · `agentExecute` · `agentPlan` · `agentNarrate` · `agentTurn`, and
`orchestrator.agents`. Routes `/api/sloane/agent/runs…`. Tests `agent.test.ts` (14). Live eval `npm run sloane:live-agent`
(spends credits). Browser: the run card (`p7*`, `.p7-*` in index.html).

**THE RUNTIME NEVER EXECUTES ANYTHING ITSELF.** Every tool step goes through `agentValidate` (the Planner: registry,
allowlist, argument kinds, permission) and `agentExecute` (permission re-checked, the same env, draft / PBC persistence,
context and investigation updates as a turn). A proposal is written only by `ActionEngine.decide()` when a person decides a
CONFIRMATION checkpoint. A governed action is prepared at most, and a direct attempt to confirm one is refused
(`PERMISSION_DENIED … Not executed: … governed action`, verified live).

**Policy profiles are chosen by Korvyn from the goal type, never by the model or the words** (READ_ONLY for close review and
vendor investigation; CONTROLLER_REVIEW; AUDIT_SUPPORT; FINANCE_ANALYST). `autonomousActionTypes` is empty in every profile:
LEVEL 3 exists as architecture only. A read-only profile cannot prepare anything; a PROPOSE step outside
`preparableActions` is rejected at plan validation.

**Graphs, not lists.** Tasks have ids, dependencies (`softDeps` for VERIFY / SUMMARIZE), `$task:<id>.population` /
`.refs.<key>` inputs resolved at execution, milestones (the only lines a person sees), and `expand` rules that grow the graph
from what a step found: a Flux comment per unexplained material line, a reconciliation comment per untied reconciliation, an
evidence check (balance, difference, tie, support, review, source freshness) per reconciliation that might be approved. A
revision never overwrites: the old node is marked `invalidatedBy` and a new node `<id>~<version>` is added; dependencies
resolve to the latest live node. Every revision is recorded (`graph.revisions`).

**Checkpoints**: CONFIRMATION (bundles one action plan; the next PREPARE task starts a new plan id) · GOVERNED_APPROVAL
(Route to reviewer / Withdraw — neither approves) · EXTERNAL_DEPENDENCY (non-blocking: JD Edwards unavailable, bank source not
connected, NetSuite stale — stated with the governed amount it holds back, and no finding is stated about that portion) ·
CLARIFICATION / DECISION_REQUIRED (declared). A checkpoint waits until no preparation of its plan is still to run.

**Interventions** (API or typed into Sloane while the run is on screen, ≤ 12 words): Stop (cancel — completed work kept,
nothing reversed, open proposals cancelled) · Pause / Resume · "Only South Valley." (scope-sensitive steps invalidated and
re-run, the rest kept) · "Ignore …" (excluded from the rest of the run and the result) · "Focus on … first" (reorder) ·
"Don't create comments yet." (pending drafts skipped, prepared ones withdrawn). Persisted as `interventions` and audited.

**Stop conditions and retries.** maxSteps, active runtime (checkpoint waits excluded), consecutive failures. A READ step
retries once on a transient error; a PROPOSE step never retries. A failed step's hard dependents are skipped and said so.
`options.failTools / transientTools / unavailableSources / pace` are DEV/TEST simulation, refused outside dev auth on loopback.

**VERIFY before COMPLETED.** Common: every milestone ran or is explained · nothing written without a confirmed checkpoint ·
no governed action executed · read-only goals created no proposal · governed data version unchanged. Per goal: the close
position re-read; confirmed comments exist on their threads; trend foots to the population; the generated workbook exists in
storage, has its expected tabs, pins its population, records its tie-out status, and is not stale. A failed check leaves the
run BLOCKED, never COMPLETED.

**A RUN JUDGES ONLY ITS OWN PROPOSALS** (`runProposals`). A run started from the Sloane panel shares the conversation's
session, so a check over the whole session counted an earlier turn's confirmed comments as this run's writes. The live test
caught it (F stopped at 9/10 instead of claiming COMPLETED) and a regression test pins it.

**Durable, background, never a held request.** Runs are records kind `AGENT_RUN` (stored as `{ run }`), advance one step at a
time on timers, and are polled by the browser. A run the previous process was advancing is PAUSED on start with the reason,
never silently re-executed. A kick that arrives while the loop is unwinding sets `rekick` (a real race, found in testing).

**Result** (§24): one headline built from governed facts, counts, ranked findings, prepared actions with status, what needs a
person, external limitations, artifacts, and at most two grounded model sentences (grounding rejects any figure the model
did not receive). The card shows lines like `✓ Close status — 59% ready, 14 blockers`; never ids, JSON or reasoning.

**Verified:** `npm run sloane:test` 106/106 · dryrun 32 · core 78 · 4/4 gates unchanged · LIVE claude-opus-5 / sonnet-5 /
haiku-4-5: A–F complete and verified in the browser and in `live-agent.ts` (A 7.8s · B 14.9s incl. confirmation · C 10.3s ·
D 6.2s · E 8.1s · F 4.3s + generation), and a GENERIC goal planned by the model (7 validated steps).

**Not built (§45):** autonomous close, automatic reconciliation approval, close certification, ERP write-back, mapping changes,
unattended external communication, broad background monitoring, the Excel add-in. Also not built: a multi-process job queue
(runs advance in the server process), a UI to browse past runs (the API lists them), CLARIFICATION checkpoints raised by the
runtime (ambiguous vendors return "not a goal" today).

## 2026-09-18 — SLOANE: conversation precedes capability resolution

Owner's brief after a live regression: typing "hello" into Sloane answered "Sloane doesn’t have a governed Korvyn
capability for that yet." **Conversation is open, financial truth is governed, actions are controlled.**

**Two causes, one on each side.**
- **Browser (`index.html`, `slEnter`).** Typing runs an object search under the input; with no object match its only row
  is "Ask Sloane: What is hello?", and Enter picked that row — so the server received "What is hello?", never "hello".
  Enter now sends the typed words verbatim; a search row opens only when the person chose it (arrow keys / pointer,
  `SL_PICKED`), the words exactly name the object, or the words are a navigation command. The only local shortcuts left are
  back / home / clear / new.
- **Server (`orchestrator.ts`).** The interpretation had no "no tool" outcome, so every turn ended in a tool plan (a forced
  financial summary) or, with no plan, in `capabilityFallback()` and three static suggestions.

**The front door.** Every free-text turn that is not an explicit follow-up or deliverable command goes first to
`adapter.converse` (Sonnet, FAST route; `CONVERSE_SYSTEM`, `CONVERSATION_SCHEMA`): `conversationIntent` (GENERAL_CONVERSATION ·
CONTEXTUAL_CONVERSATION · FINANCIAL_QUESTION · FOLLOW_UP · CLARIFICATION_RESPONSE · ANALYSIS_REQUEST · ACTION_REQUEST ·
NAVIGATION_COMMAND · UNSUPPORTED_OPERATION · UNCLEAR), `requiresTool`, `reply`, `unsupportedOperation`. It runs in PARALLEL
with interpretation, so a financial question pays no extra latency. `requiresTool=false` → a `TurnResponse.reply` with no
tool, plan or FinancialObject (route CONVERSATION); the browser renders it as plain text (`.s2-conv`). The model is given a
compact context (page reported by the browser — `view`, display only — period, scope, investigation, active run, the last
answer's titles and stated figures). **A reply may repeat a figure only if that context states it**; otherwise the turn goes
to governed tools. Mock mode / provider down: `conversationalShortcut()` answers ordinary conversation deterministically.

**Capability gap is no longer the default.** It is said only when the operation is understood (the model's
UNSUPPORTED_OPERATION / ACTION_REQUEST, or an explicit request about a workbook such as "email this package"), needs
execution, and nothing registered performs it. No plan for an unclear request → "Can you tell me a little more about what
you want to do?". Every turn logs `[sloane:route] input intent requiresTool route model tool fallback`, and the trace carries
`conversation`.

**Verified in the browser, typed into Sloane** (live Sonnet): hello · need your help · thanks · what can you do? · what am I
looking at? (with and without an object) answered with no tool; June financials and "why did CIP increase?" ran governed
tools; "email this package to the auditor" → specific gap. 108 tests, dry run 33/33 (including a live-shaped "hello"), 4/4 gates.

**The agent-runtime hardening brief that this interrupted was finished afterwards** — see the next block.

## 2026-09-18 — SLOANE AGENT RUNTIME: clarification checkpoints and durable steering

Owner's brief. **An ambiguous goal waits for the person; a short instruction changes the run, durably.**

**Clarification.** `agent/ambiguity.ts` resolves every goal's words against governed catalogues — vendor MASTER
(`GovernedLedger.vendorMaster()`; `VENDOR_MASTER_ONLY` adds Siemens AG and Siemens Mobility with no activity, so no total
moves), projects, scopes, the chart (intercompany / payables / receivables), the tenant calendar (`TENANT_CALENDAR`,
`SLOANE_RELATIVE_PERIODS` = ASK_WHEN_OPEN · LAST_COMPLETED · CURRENT), PBC requests and saved workbooks. Customer, fund,
planning version, scenario, currency and lens have no governed alternative on this server and produce a NOTICE, never a
guess. A goal with an ambiguous material field is still a goal (`goal.pending`): the run is created, a CLARIFICATION
checkpoint (question, field, term, candidates with canonical ids, reason, createdAt; on answer: response, resolvedValue,
resolvedAt) is opened, status WAITING_FOR_USER, and nothing runs. `AgentRuntime.decide(cp, candidateId)` or a typed answer
(`answer()`, `matchAnswer()` — exact, contained, or "the second one") resolves the field, updates the conversation's
FinancialContext (`orchestrator.agentContext`), asks the next pending question or plans, and resumes the SAME run.

**Steering** (`agent/steering.ts` `classifySteering` → `AgentRuntime.steer`): SCOPE_CHANGE · PERIOD_CHANGE · FILTER_CHANGE
(threshold or vendor) · PRIORITY_CHANGE · EXCLUSION · OUTPUT_CHANGE · ACTION_CONSTRAINT · PAUSE · RESUME · CANCEL. A value
named ambiguously ("Only DC1") opens a clarification tied to the instruction (`steerType`) and nothing changes until it is
answered. Every instruction is a `UserSteeringEvent` on the run (instruction, type, actor, time, context before and after,
tasks invalidated and added, plan revision, effect), an `AGENT_RUN_STEERED` audit event and an investigation event.

**Safe replan** (`replanFor`): only tasks the change touches are invalidated (scope → scope-sensitive tasks; period → tasks
with period arguments; threshold → tasks that accept one), plus the tasks that consume them; what they expanded into is
dropped and its open drafts withdrawn; a confirmation gathering them is superseded; a non-blocking notice from a replaced
step is superseded; VERIFY and SUMMARIZE re-run; a new plan revision records it. Completed work that the change does not
touch is kept. A null patch removes an argument (scope widened, threshold removed). The step budget grows by exactly the
steps a person-initiated revision adds (logged). Constraints are part of `profileGate`, so no replan can re-introduce what
the person ruled out; lifting "no comments" re-expands the completed steps and reopens a confirmation.

**Precedence in the conversation** (`orchestrator.agentTurn`): an answer to the run's open question → a new GOAL (a new
run: "Review last quarter." never steers the vendor review on screen) → steering of the conversation's run → ordinary turn.
The run is found through the durable store (`activeFor`), so a refresh, navigation or server restart does not lose it; a
run re-attaches its conversation session to its investigation before each step.

**Browser**: the conversation id lives in `sessionStorage` for the tab (`s2Sid`, `s2ResetSid` on New); `p7Restore()` shows a
waiting run again after a refresh; the run card renders a clarification with one button per candidate and each candidate's
detail; while a question is open, Enter sends the words as the answer, never as a search result.

**Verified live in the browser** (one AgentRun throughout): "Review Siemens FY26 activity." → "Which Siemens vendor do you
mean?" [Siemens Energy] [Siemens AG] [Siemens Mobility] → refresh (same run, same question restored) → answered by button and
by typing → "Only South Valley." (5 steps re-run, By project kept) → "Ignore anything under $500K." → "Focus on CIP first." →
"Don't create comments yet." — revisions v2–v4, four steering events. "Review last quarter." asked Q1/Q2 and resumed on Q1;
"Get June close ready for controller review." + "Don't create comments yet." withdrew five unconfirmed drafts, superseded the
confirmation and completed the analysis. Siemens Energy has no South Valley activity in this book, and the run says so.
Tests: `steering.test.ts` (8) · 116 Sloane · dry run 33/33 · core 78 · 4/4 gates.

## 2026-09-19 — SLOANE PHASE 8A: the enterprise financial semantic layer and the Financial Graph

Owner's brief. Sloane now has a structured model of what Korvyn holds and how it relates. Claude reasons
over those relationships; Korvyn stays authoritative for facts and figures. No UI change, no Excel add-in, no
charts, no separate financial database, no graph database. The Dynamic Financial Canvas has not been started.

**Files** (`packages/agent/src/sloane/semantic/`):

| File | Role |
|---|---|
| `model.ts` | 60 canonical `SemanticType`s, 44 `RELATIONS`, the id prefixes (`entity:MDH`, `account:15000`, `fsline:FS-CIP`, `recon:REC-MDH-15000`, `flux:FLUX-15000-2026-06`, `person:user:lchen`, `project:SV-PH2`, `period:2026-06` …) |
| `graph.ts` | `FinancialGraph`: builds the graph for a period from the owning services, filters it per actor, and answers queries (§14 and §18) |
| `time.ts` | `resolvePeriods` over `TENANT_CALENDAR.fiscalYearStartMonth` and the governed months; `fiscalFrame` |
| `context.ts` | `EnterpriseFinancialContext` and `ContextAssembler` (the model's neighbourhood) |
| `tools.ts` | 15 READ tools (domain `semantic`), `semanticPlan` (routing for §18), `bareObjectPlan` |

**The graph is not a store.** Every node is read from the service that owns it: the governed ledger, `ControlService`,
the work store, `PEOPLE` and `DEV_DIRECTORY`, the reporting book's statement lines, `SOURCE_HEALTH` and the tenant
calendar. Each node names that service in `source`. No amount is computed here; an attribute that is a figure is copied
from the service that derived it. The build is 404 nodes and 1,148 edges in about 60 ms, cached 4 s per (period, ledger
data version). Reconciliations are read with `reconcile()`, never `reconBalance()`, because the latter writes a snapshot.
Constants the services already enforce are exported and cited rather than restated: `TIE_TOLERANCE_USD`,
`FLUX_MATERIALITY` (now used by `fluxItems` itself), `APPROVAL_THRESHOLD_USD`, `PROJECT_ALIAS`, `ENTITY_WORDS`.

**Permissions are structural** (`FinancialGraph.visibleTo`, `snapshot(actor)`):
- Each type needs a capability (Flux types FLUX_VIEW, reconciliations RECON_VIEW, close CLOSE_VIEW, audit AUDIT_VIEW,
  reports REPORT_VIEW, GL objects GL_VIEW).
- Each object is checked against its entity. An object that spans several entities (project, vendor, cost centre,
  region) is visible where any of them is. GROUP-scoped objects need unrestricted access.
- A scoped actor sees people, source systems and roles only when they are linked to something the actor can see.
- An edge to a hidden node is dropped with the node.
- Not-found reads identically for "hidden" and "does not exist" (asserted).
- The MDH accountant sees 176 of 404 objects. The auditor sees no Flux or close objects.

**Resolution** (`resolve`):
- `RESOLVED`, `AMBIGUOUS` (candidates, each with what distinguishes it), `NOT_FOUND`, or `MULTIPLE` ("budget vs actual"
  names two objects, which is not a choice between them).
- Mentions are matched longest-first. A statement line and the account it is mapped from collapse into one concept,
  keeping the account.
- A type word ("… reconciliation", "… report") narrows the search. An entity named alongside it picks that entity's
  object ("the intercompany receivable reconciliation for MDH").
- Period words go to the calendar, never to text search.
- People: initial forms ("L. Chen", "J. Park") map only when unique across the directories. A job title ("Controller")
  is a Role, and an owner resolved through it says so ("held by Mitra Giri"). A workflow name outside every directory
  ("K. Weber") is a person node flagged `inIdentityDirectory:false`, and the answer says their authority can't be checked.

**§7 — A PROJECT IS NEVER A SCOPE.** Found live: the model read "SV-PH2 BELONGS_TO MDH" in the neighbourhood and
returned MDH, correctly named, as the scope of "Show the TB for South Valley". The engine accepted it as EXPLICIT, and
the next question was answered for MDH alone. `FinancialContextEngine.resolve(I, c, request)` now accepts a NEW scope
only when `scopeNamedBy(...)` confirms that both the model's label and the user's own words name it. A refused change
becomes a plain note ("SV-PH2 is a project, not a legal entity, so the scope stays …"). A scoped user's own scope is not
a change, so no note appears. The prompt says the same. The engine is the guarantee; the prompt is not.

**Time** (§8): June · Jun-26 · current month · last month · quarter · last quarter · YTD · FY26 (PARTIAL, Jan–Jun of
Jan–Dec) · FY27 / prior year (NOT_GOVERNED) · prior forecast (PLANNING, not held) · close period. "Last quarter" follows
the tenant policy (ASK_WHEN_OPEN asks while June closes Q2). A year is 4 digits or 2 after a hyphen or apostrophe, never
"June 30". A month word must be a prefix of the month's name ("decide" and "market" are not months).

**The ContextAssembler** (§15) attaches `semantic` to the model context through `SloaneOrchestrator.modelContext`
(interpret, plan, agent plan) and a short form in `conversationContext` (converse). It carries the user, the fiscal
frame, scope with its hierarchy path, lens, focus with its workflow people, and a neighbourhood: named and focused
objects plus one hop, capped at 24 objects and 40 relations, identities and non-figure attributes only. Typical size is
2–5 KB. `SEMANTIC_RULE` in `prompts.ts` tells the model it is a map, not a source of figures.

**Routing.** `semanticPlan` runs in `deterministicPlan` after PBC and deliverables. `bareObjectPlan` is the last resort
before an empty plan, so a bare name ("South Valley", "close", "June") is resolved instead of asking the user to
rephrase. A period or scope clarification is skipped when the semantic route has claimed the request; the tools state
the period they read, and "which period?" is moot for a subject that has no trial balance.

**Tools:** resolveFinancialObject · getObjectRelationships · getResponsibleUsers · getObjectTracePath ·
getOpenReconciliationsByEntity · getPendingReviews · getOpenWorkForPerson · getMaterialFluxWithoutSupport ·
getReportsUsingObject · getReconciliationForBalance · getLargestUnresolvedCloseIssue · getSubjectTrialBalance
(a project, property, cost centre or vendor has no trial balance; the tool says so and gives its dimension-filtered
account-group balances, stating they do not balance) · getPlanningComparison · getEntityHierarchy · resolveFinancialPeriod.

**Verified:** `npm run sloane:test` 130/130 (`semantic.test.ts`, 14 tests covering §2, §7, §8, §15, §16, §17, §18, §19
and §20) · dry run 33/33 · core 78/78 · 4/4 gates. Live on claude-opus-5 (`sloane-serve`):
- All seven §18 questions answered with grounded narratives.
- A multi-clause question was planned DEEP across `getResponsibleUsers` and `getReconciliationsForAccount`.
- As the MDH accountant: one entity, the Flux review stated as outside their access, "What is the REIT?" asked back
  with nothing leaked.

**Known gaps:**
- Teams, funds, customers, departments, business units, drivers and assumptions are declared types with no governed
  instances.
- Budget, forecast and scenario are declared ungoverned.
- Regions are derived from country codes.
- The project → property link comes from the project's alias.
- Transactions are resolved on demand, not held as graph nodes.
- Seven of the nine material June flux items have no reviewer assigned. The largest close issue therefore has no owner,
  and the answer says so.

## 2026-09-19 — SLOANE PHASE 8B: the Universal Intent Resolver and the Dynamic Financial Canvas

Owner's brief. A short request ("close", "flux", "CIP", "Siemens", "June") opens a governed financial workspace rather
than a list of links. No UI redesign, no Excel add-in, no PowerPoint or PDF, no budget or forecast figures.

**Files** (`packages/agent/src/sloane/canvas/`): `intent.ts` (the `UniversalIntentResolver`, `IntentDefinition` and
`refinementOf`) · `canvas.ts` (the `CanvasEngine`, the `DynamicCanvasDefinition` and `canvasObject`). Route in
`orchestrator.ts` (`canvasTurn`). Tests in `canvas.test.ts` (7). Browser: the `c8*` functions and `.c8-*` classes in
`index.html`.

**THE ROUTE.** `canvasTurn` runs after the agent-runtime check and before deliverables and the conversational front
door. When it claims a request the trace reads `route: CANVAS` and carries the `IntentDefinition`. It claims:
- A workspace word as the whole request: close · flux (BS / IS / unexplained) · financials · income statement ·
  balance sheet · recs / reconciliations.
- A planning concept (budget, forecast, scenario, "vs actual").
- A bare period ("June", "Q2").
- A governed object, resolved through the 8A Financial Graph and so permission-filtered.
- "open …" with any of the above.

**It does not claim** a question, a sentence starting "show / view / list / give / compile / include / only …", or a
name inside a longer instruction ("Compile Siemens FY26 support", "Only include South Valley"). Those keep their
existing routes. The words must BE the object: `graph.mentions()` removes the matched terms and anything left over
refuses the claim. `graph.resolve().term` is the whole text and cannot be used for this.

**AMBIGUITY.** When exactly one candidate carries governed activity it is opened, and the others are named in a note
("“Siemens” also names Siemens AG and Siemens Mobility — records with no governed activity"). Otherwise the resolver
asks a clarification whose options resume as requests.

**THE CANVAS IS COMPOSITION, NOT DATA.** Every section wraps a `FinancialObject` that an existing READ tool returned
through `CanvasEngine.run()`. `run()` authorises exactly like a planned step (`authorize`) and records the call in the
trace. Nothing computes a figure. Filtering (BS/IS, unexplained, material only), sorting (largest first) and row counts
are row operations over the tool's own table. Each section carries:
- `sectionType`, `priority`, `layout` (lead / main / side) and `display` (maxRows, columns, rowRequest, emphasis);
- `sourceObjectIds`, `sourcePopulationIds` and `actions`, each a request or a structured workspace view;
- `trace`: tools with arguments, period, scope, data version, `MAPPING_VERSION` and snapshot ids.

A clear exception section is not drawn; its "nothing open" becomes one line in the status band.

**COMPOSITION BY KIND:**

| Kind | Sections |
|---|---|
| CLOSE | status (readiness, material blockers, tasks, reconciliations, flux, awaiting review, stale systems) · blockers · reconciliations not tied · unexplained flux · missing support · awaiting review · recent closes · reporting packages |
| FLUX | status (BS / IS material, unexplained, submitted, approved) · material movements · explanations awaiting review · movements without support · explanations in progress · monthly flux analyses |
| FINANCIALS | results · income statement or balance sheet · material movements · recent trend · related flux |
| RECONCILIATIONS | readiness · not tied or not provable · awaiting review or returned · support gaps · all reconciliations |
| OBJECT | an account or statement line (balance and movement, top projects / entities / vendors, flux, reconciliations, largest transactions, trend, evidence); a project / vendor / entity (governed activity, by the other dimensions, material transactions, related flux and reconciliations through the account groups it posts to, trend, evidence, relationships). A dimension has no trial balance, and no statement section is drawn for it |
| PERIOD | close, results, flux, reconciliations — each compact, each opening its own canvas |
| PLANNING | UNAVAILABLE: "no governed planning version is available in the current prototype", what is governed, and what Korvyn can show instead |

**ROLE-AWARE, NEVER FROM THE WORDS.** `personaOf(actor)` maps FINANCE_REVIEWER → CONTROLLER, ENTITY_ACCOUNTANT →
PREPARER, EXTERNAL_AUDITOR → AUDITOR and the new **CFO** role → EXECUTIVE. Base priorities are per (kind, section,
persona) and are raised by open conditions. A preparer's close leads with their open preparation tasks and missing
support. A controller's leads with material blockers and review. An executive's adds the largest financial movements.
A section the actor may not see is never built; the canvas states what was withheld ("Not shown — outside your access:
Flux"). An auditor asking for "flux" gets UNAVAILABLE with no flux object. **`user:cfo` (Dana Reyes, role CFO:
VIEW_ALL + ANALYSIS_SAVE + INVESTIGATION_SAVE) is new in `DEV_DIRECTORY`.**

**REFINEMENT.** `CanvasState` (intent, period, scope, subject, filters, focus, drill and the rows the primary section
showed) lives on `SessionContext.canvas`, and a snapshot goes into the investigation context. While the last answer
was a canvas (`conv.lastKind === 'CANVAS'`), a short instruction goes to `refinementOf()` and becomes one of:
- FILTER: only BS / only IS / unexplained / material only;
- SORT: largest first;
- FOCUS: start with the largest / the second / open ⟨row label⟩;
- RELATED: the related reconciliation · the GL behind the first one · the drivers of it · its support;
- RESET.

The canvas keeps its id and bumps its version, and the drill leads as a FOCUS section. "The largest" ranks by amount;
"the first" means the first row as shown. The primary section's rows also feed `conv.items`, so the Phase 6 deictic
follow-ups work after a canvas as well.

**BROWSER.** `s2ServerRender` renders a `DynamicFinancialCanvas` with `c8CanvasHTML`, and `slRender` opens it in the
Sloane workspace (`slExpand`). Lead and main sections go in the main column. Side sections sit above the timeline
(`c8Rich`). Every metric, row and action submits a request into the same conversation (`c8Q`). Structured workspaces
open only from an explicit action (`c8View`). Trace is a `<details>` under each section. Severity is a 3px edge; the
accent marks the object in focus.

**Verified:**
- `npm run sloane:test` 137/137 (7 new) · dry run pass · core 78/78 · 4/4 gates unchanged.
- Live browser on `sloane-serve`:
  - A–H (close, flux, financials, reconciliations, CIP, South Valley, Siemens, budget vs actual) plus recs and June.
  - §22: flux → only BS → show unexplained → largest first → the GL behind the first one, as ONE investigation of
    five steps.
  - §16: close → material blockers → the largest → its reconciliation. AR has none, and the canvas says so.
  - The MDH accountant: preparer composition, scoped to MDH, nothing from another entity, the REIT not discovered.

**Known limitations:**
- Composition is deterministic; the model is not consulted for short intents.
- "Overdue" reconciliations cannot be shown, because the server book carries no reconciliation due dates.
- Recent flux explanation activity is shown as explanations in progress, not as a dated log.
- Driver rows in a focused account read "project: …".
- The canvas is regenerated from its state on every refinement (tools take milliseconds).
- Budget, forecast and scenario have no governed instance.
- Every `open …` row click is resolved by label match against the primary section's rows.

## 2026-09-19 — SLOANE PHASE 8C: the governed analysis grid and conversational analysis engine

Owner's brief. A finance user builds, reshapes, filters, sorts, expands, drills, compares and saves a governed financial
analysis by talking to Sloane. There is no report builder and no spreadsheet clone. The analysis is ONE object, and every
figure in it is deterministic and traceable. No Excel add-in, charts, PowerPoint/PDF or budget data were built.

**Files** (`packages/agent/src/sloane/analysis/`):

| File | Role |
|---|---|
| `model.ts` | `AnalysisDefinition`, the `DIMENSIONS` and `MEASURES` registries, `CellContext`, the grid types, `VisualizationDefinition` and `ExcelHandoff` contracts, and `MODEL_OPS` |
| `query.ts` | `FinancialAnalysisQueryService`: `validate`, `run` (one server-side pass, paged) and `cell` (re-derives a CellContext from a cell id) |
| `edit.ts` | the ops, `resolveMembers` (permission-filtered, canonical ids), `parseAnalysis` (the deterministic reader) and `fromModel` (the model's ops, re-resolved) |
| `engine.ts` | `AnalysisEngine`: `apply(session, ops)`, referents, and drill / explain / Flux / reconciliation / support / chart / Excel / save |

The route is `analysisTurn` in `orchestrator.ts`, **ahead of the canvas**. Tests are in `analysis.test.ts` (9). The model
contract is `adapter.analysisEdit` with `ANALYSIS_EDIT_SCHEMA` and `ANALYSIS_EDIT_SYSTEM`. The browser code is the `c9*`
functions and `.c9-*` classes in `index.html`.

**ONE BALANCE SEMANTIC.** `GovernedLedger.contribution(line, period, 'ENDING' | 'ACTIVITY')` is now the only definition
of what a line contributes. A balance-sheet line counts through the period at the closing rate; an income-statement line
counts for the period at the average rate. `balanceUsd` and the query service both call it. A test asserts that the
grid equals `balanceUsd` for every account tested.

**THE DEFINITION** is book-aware. `book` is four separate facts: `accountingBookId`, `accountingBasis`,
`reportingLens` and `currency`. There is one effective book (`CORE-GL`, US GAAP); another book is refused by name
rather than assumed. The rest of the definition:

- **Layout:** `rows` and `columns` are `{dimension, variant?}`, and `measures`, `periods` and `primaryPeriod` are
  separate fields.
- **Comparison:** prior period, a named period, or prior year (refused, because FY2025 is not governed).
- **Filters and sorting:** `filters` (IN / NOT_IN on canonical members), `statement` (BS / IS, read from the governed
  account type), `valueFilter`, `sorts` and `topN`.
- **Hierarchy:** `hierarchies`: statement → type → account group → account in statement mode; group → account
  otherwise. Expansion is stored as canonical row ids in `expanded` / `collapsed`.
- **Lineage:** `populationIds`, `dataVersion`, `mappingVersion`, `createdBy` / `updatedBy`, and `derivedFrom`.

Every change is a new version of the same id.

**CANONICAL IDS EVERYWHERE.** A row id is its member path (`statement:BS/type:ASSET/account:15000/project:SV-PH2`). A
cell id is `rowId§columnId`. `cell()` rebuilds the full `CellContext` from the id alone: members, measure, period,
comparison, scope, book, filters, calculation, data and mapping versions, and the **governed population** behind the
cell. Exact line keys go through `definePopulation`, so the drill, support and export all read one population id.

The browser sends `focus: {analysisId, cellId | rowId}` for a grid click and `focus: {ref}` for a canvas row, and
**never a label**. The same change fixed the 8B canvas: rows open by `ref`, and a typed name that matches several rows
is refused ("2 rows … click the one you mean"). There is a regression test for duplicate labels.

**`/api/sloane/turn` and `/turn/stream` forwarded only named fields and dropped `focus`.** They forward it now. This was
also why 8B canvas row clicks lost their ref when live.

**DIMENSIONS** with governed data: account (hierarchical), financialLine, entity, region (derived from country), project,
property, vendor, costCenter, currency, recordType, sourceSystem, period and book. Fund, customer, department, business
unit and consolidation node are declared, and refused with the reason.

**Source / governed / effective variants** (vendor, project) are opt-in row dimensions. No governed override is held on
this server, so GOVERNED is empty and says so.

**MEASURES:** ENDING_BALANCE, BEGINNING_BALANCE, ACTIVITY, DEBIT, CREDIT, YTD, QTD, PRIOR_PERIOD, PRIOR_YEAR (blank,
not governed), and VARIANCE / VARIANCE_PCT (Korvyn's subtraction). Statement mode presents liabilities, equity and
revenue credit-positive.

**A SUM THAT MEANS NOTHING IS NOT PRINTED.** Statement section rows are blank. So is a node above the account dimension
in a statement or trial balance (an entity total mixing balance and P&L types). Totals appear only on activity
analyses.

**EDITING.** `parseAnalysis` is the deterministic reader. It covers:
- creation: "Show me May and June balance sheet", "Show June TB by entity", "Show monthly CIP activity by project
  Jan-Jun";
- layout: accounts on rows / months on columns, "X first, then Y", "projects underneath", move to columns, remove;
- filters: only / exclude members, only BS / IS accounts, over $X, material (the governed flux materiality);
- sorting: largest first, biggest variances, top N;
- periods: add / remove / primary / order / compare, prior year refused;
- measures and variants: variance, debit / credit, YTD / QTD; source / governed / effective;
- expansion: expand / collapse by member, rank or "this", and expand all;
- questions: drill ("the GL behind the largest movement / this / the first one"), why did it move, does Flux explain
  it, does it reconcile, does it have support, chart this, open in Excel, save, "use this analysis for May", more rows.

Where the reader does not recognise the words, the model is consulted in two cases:
- an analysis is on screen;
- or the words describe a grid's shape: rows / columns / down the side, or a statement or TB "by" a dimension.

`fromModel` re-resolves every name. An invented member is rejected and traced; it is never applied. Live, Claude read
"show me two months with accounts down the side" into a May–June grid with accounts on the rows.

**Rules the tests found:**
- A question never starts an analysis.
- "Show me June financials" and "Show the TB for X" keep their existing routes.
- Deliverable verbs (create, build, compile …) and bare "only BS" are not claimed.

**REFERENTS** (`activeRowId`, `activeCellId`, `activePopulationId`, `activeMember`) live on `SessionContext.analysis`
with the definition, and are snapshotted into the investigation. They resolve words as follows:
- "the largest movement" is the most specific visible row with the largest variance (a row whose children are all
  hidden counts as a leaf);
- "the first / third row" counts only rows that carry a figure;
- "this" is the selected cell;
- a member named but not on screen has its path opened, or its dimension added beneath ("South Valley is a project, not
  a row …").

**INTEGRATIONS** read the cell's population and account through existing READ tools (`authorize`d, traced):
- explain: `GovernedLedger.aggregate` by project, vendor, entity and account over the drilled population, plus
  `getFluxItem`;
- Flux: `getFluxItem` and `getFluxExplanation`;
- reconciliation: `getReconciliationsForAccount`;
- support: `getSupportCoverage` and `findMissingEvidence` on the **same** population id.

**SAVE** is a `SAVE_ANALYSIS` proposal carrying the definition, never the cells; it waits for confirmation. **CHART**
returns a `VisualizationDefinition` whose series point at cell ids; nothing is drawn yet. **EXCEL** returns an
`ExcelHandoff` (definition, query id, population ids).

**PERMISSIONS.** Lines are the actor's visible entities before anything is grouped, so members, totals, hierarchy and
drill populations cannot contain a hidden entity. A member the actor cannot see reads exactly like one that does not
exist. **A named scope outside access ("the consolidated balance sheet" for an MDH accountant) is refused
("may not view scope GROUP") and never narrowed silently.**

**GRID** (`c9Grid`):
- Layout: sticky header, frozen label column, indentation with chevrons (expand / collapse by row id), subtotals by
  weight and a hairline.
- Figures: accounting figures in parentheses, with no red on negatives (rule 3).
- Interaction: clicking a cell selects it (accent, rule 2) and shows a selection bar, and **the selection travels as
  `focus` with the next typed request**.
- Chips show the definition; the panel shows the GL / drivers / Flux / reconciliation / support; Trace is on demand.
- Paging: the server sends 200 rows a page, with "load more". The grid opens in the Sloane workspace (`slExpand`).
- **A render is stored per turn (`C9.seq`)**, because a drill does not bump the definition's version. **The selection is
  set only when a response arrives**, because a local re-render ran before the request was sent and cleared the click.

**Verified:**
- `npm run sloane:test` 146/146 (9 new) · dry run 33/33 · core 78/78 · 4/4 gates unchanged.
- LIVE (`sloane-serve`, claude):
  - A: 8 steps as one investigation, ending in a GL panel of 4 lines (POP-472D30B022) with the translation note.
  - B: SV-PH2 opened under MDH's CIP accounts by canonical path.
  - C: monthly CIP by project → top 5 → vendors.
  - D: a clicked cell → a 1-line population netting to ($4.70M) → support read the same POP id.
  - E: the MDH accountant sees only MDH; a hidden entity is "not found"; the consolidated request is refused; no leak.
  - The model path works, and a canvas row click opens by ref.

**Known limitations:**
- The query is an in-process pass over ~1.2k lines (the shape of a GROUP BY ROLLUP; a real engine is out of scope).
- Row virtualisation is server paging plus a scrollable grid; there is no windowed renderer.
- Only one non-period column dimension is supported.
- EBITDA is not a governed statement line.
- No governed attribute overrides are held.
- Eliminations are not held.
- Prior year is not governed.
- The drill's GL lines sum at average rates, so a translated balance differs from them; the panel states this.
- Model-assisted edits need the reasoning mode; the mock declines.

## 2026-09-19 — SLOANE PHASE 8C.1: natural-language generalization, measured

Owner's brief. The question was whether Sloane understands unseen finance language because of its architecture or
because its phrase rules happen to match the test sentences. **Measured with a holdout set, the answer before this pass
was: largely because of phrase rules.** No UI redesign, no Visualization Intelligence, Excel, PowerPoint or PDF.

**THE HARNESS** (`packages/agent/src/sloane/eval/`):
- `scoring.ts`: `observe()` classifies a turn (ANALYSIS · CANVAS · CONVERSATION · TOOLS · AGENT · CLARIFY · PROPOSAL ·
  NOTE); `score()` checks it semantically: intent, analysis shape, context kept, referent, clarification, tools,
  unsupported honesty, permission (leak regexes). Each failed check carries a failure category.
- `known.json` (28, from earlier briefs) and `holdout.json` (80, written for this pass, never read by routing code).
- `generalization.ts`: `npx tsx src/sloane/eval/generalization.ts --sets known,holdout,generated --gen 2 [--mock]
  [--only H01] [--out f.json]`. It runs the REAL orchestrator with three personas and makes model-generated adversarial
  paraphrases of the holdout (`SLOANE_EVAL_GEN_MODEL`, default Haiku). **The generator only writes inputs; the
  expectations are the original case's.** Set `KORVYN_DB_PATH=:memory:`. Spends credits unless `--mock`.
- **Contamination guard**: no holdout sentence may appear in routing code or prompts. H24's wording ("source GL only")
  was matched by a pre-existing 8C rule and was reworded; the note is on the case.

**RESULTS (cases fully passing):**

| | deterministic only | live, before | live, after |
|---|---|---|---|
| Known | 93% | 93% | **96%** |
| Holdout | 40% | 69% | **93%** |
| Generated paraphrases | — | — | **83%** (a fresh set each run) |

Latency after: follow-up edits p50 2.3 s / p90 2.9 s; new analyses p50 2.7 s / p90 4.4 s; a structured grid command 0 ms
of model time.

**WHAT CHANGED — architecture, not phrases:**
- **Model-first for natural language** (`analysisTurn`). With an analysis on screen, or words that name a grid object
  (`wantsAnalysisEditor`: a statement / TB / activity / rows / columns noun, or a split by a governed dimension — a
  vocabulary gate, and questions are excluded by syntax), the model reads the words first. The deterministic reader
  (`parseAnalysis`) runs only when no model is configured or the model declines, fails or is unsure.
- **The model states a RELATION** (`EDIT_RELATIONS`): NEW_ANALYSIS · MODIFY · ASK_ABOUT_ANALYSIS · CORRECTION ·
  NOT_ANALYSIS (the turn returns to the rest of Sloane) · NEEDS_CLARIFICATION (a question with options that resume as
  requests). The prompt (`ANALYSIS_EDIT_SYSTEM`) describes the analysis model and its rules; it has no example sentences.
- **The governed vocabulary travels with every edit** (`vocabulary(d)`: permitted account groups with types and
  children, entities, projects, properties, vendors, cost centres, and what Korvyn does not hold). Every name the model
  returns is re-resolved; an invented one is rejected.
- **New edit ops**: ACCOUNT_TYPE (`definition.accountTypes`), a % floor (`valueFilter.minPct`, which brings its variance),
  REMOVE_FILTER, CLEAR_FILTERS, UNDO (`AnalysisSession.history`, last 10 versions), statement both, expand / collapse
  all. Canonical forms: the three BS types are `statement BS`, the two IS types `IS`, all five no restriction.
- **The front door routes back.** A turn the vocabulary gate missed but the conversational model reads as
  ANALYSIS_REQUEST goes to the analysis editor (`CONVERSE_SYSTEM` now defines it by meaning).
- **A grid control is a structured command.** A chevron, Drill / Explain / Reconcile / Flux / Support or "load more"
  sends `focus.command` (`C9_CMD` in `index.html`), and the server applies it with no model call. Typed words never map
  to a command.
- **The planner reads the interpretation's structure.** Before name resolution, `deterministicPlan` maps
  (object type × intent): FLUX + FIND → unexplained flux; CLOSE → blockers; PROVE on an account or population →
  missing evidence. The model had read these correctly while the planner ignored it.

**A PERMISSION GAP WAS FOUND AND CLOSED.** The model path skipped the scope check the deterministic reader makes, so an
MDH accountant asking for "the consolidated balance sheet" got a grid of what they could see instead of a refusal.
Every new analysis now checks the scope its words name (`scopeNamedBy(request,'GROUP')`), whichever reader produced it.

**Also fixed:** the model's row references (`values ["largest"]` = the largest row; no values = the selection) are
honoured in `fromModel`. A doubled full stop on "Not available" notes. The scorer read any reply ending in "?" as a
clarification ("Hi. What can I help you with?"); it now reads the conversational intent.

**REMAINING FAILURE CATEGORIES** (holdout and generated): restricting a TB to "BS only" sometimes builds a new
statement instead of modifying; "what's behind the biggest change" can re-sort rather than drill; "the other Siemens"
continues rather than asks; a bare project name ("show South Valley") asks which object is meant; "take that back"
cannot cross from one analysis to a different one (history is per analysis).

**Traps:** the `\b`-becomes-backspace trap hit again in a Python splice (a non-raw string), and the shell ate a
backslash in a `sed` replacement. Grep for `\x08` after every splice.

## Toolchain

**Node is installed but not on `PATH`** — it lives at `C:\Users\mitragiri\tools\node22\` (v22.23.1,
npm bundled). Prepend it or things look broken:

```powershell
$env:Path = "C:\Users\mitragiri\tools\node22;$env:Path"
```

Before concluding a tool is absent, search the filesystem, not just `PATH`. Python is also available.

## Checks

```bash
node tools/check_chrome_themes.mjs     # index.html chrome themes pass WCAG AA (10 themes)
node tools/check_text_contrast.mjs    # index.html CONTENT text passes WCAG AA (both modes)
node tools/check_spacing_scale.mjs     # index.html spacing stays on the 4px scale (ratchet)
node tools/check_css_duplicates.mjs    # no class name newly claimed by a second component (ratchet)
cd packages/core && npm run check      # core: typecheck + 78 tests + import boundary
cd packages/agent && npm run dryrun    # agent: all tools resolve, no API call
```

For `index.html` the browser-preview sweep is the end-to-end check: open
`file:///C:/Korvyn/index.html`, drive every tab, assert each view rendered, console clean.

## Git

Repo `github.com/mrgiri-hash/korvyn` (private). Requires Node (checks use `node --test`) and Python
(the boundary checker).
