# Korvyn Design System — Rules for Claude Code

This file is the source of truth for Korvyn's UI. Read it before building or
editing any screen. When a request conflicts with these rules, follow the rules
and say so. Every screen must pass the checklist at the bottom before it's done.

Design tokens live in `src/styles/design-tokens.css`. Never introduce a color,
font, or spacing value that isn't defined there.

---


> ## 2026-08-08 — Enterprise Filter Panel system supersedes the three-accent ruling
>
> The owner specified a new visual system (Inter primary, IBM Plex Sans alternate, IBM Plex Mono
> numeric; navy `#102A5E`, **Action blue `#1F4ED8`**, positive `#0F9D68`, negative `#D14343`,
> warning `#C58A1B`). It is applied in `apps/review/index.html`.
>
> **This changes two rules that previously read as non-negotiable**, and they are changed here so the
> written rules and the code cannot disagree:
> - **"No blue accents" no longer holds.** Action blue is the interactive affordance (links,
>   "View lines"). It is deliberately distinct from the navy that *fills* selected state, so
>   "clickable" and "selected" stop being one signal.
> - **Positive is green `#0F9D68`, not teal.** The earlier ruling preferring teal is withdrawn.
>
> Rules that still hold and were **not** changed: at most two coloured columns per table; subtotals
> outrank detail rows (table values render Medium, subtotal/section rows 600, so weight still
> separates them); badges mean action-required while counts stay quiet; one filled primary per screen;
> money/dates/IDs tabular and right-aligned.
>
> **Known gap:** no Inter woff2 is embedded, so the stack resolves to Segoe UI. Embedding one is a
> one-line upgrade with no other change.
>
> **Open accessibility item:** warning `#C58A1B` is 3.03:1 on white — large text only, below AA for
> normal text. Fine as a fill or a dot; a darker variant is needed wherever gold is used as body text.


## 1. Color discipline (the #1 rule)

Korvyn uses **three status colors and nothing else**:

- **Gold** (`--gold`) — needs attention / needs explanation / pending
- **Teal** (`--teal`) — matched / approved / tied out / favorable movement
- **Red** (`--danger`) — exception / overdue / unfavorable movement / elim mismatch

Everything else is neutral gray (`--text-900 / 600 / 400`) or the navy chrome
(`--ink`). **No blue accents, no green/red on every column, no per-row fills.**

The old UI failed because blue links, orange pills, red dots, green approvals,
and green/red deltas all competed at equal weight. If a screen has more than
three accent colors visible at once, that's the bug.

**On data tables: color at most two columns** — the primary variance and its
direction (e.g. MoM Δ and Δ%). Supporting/breakdown columns (Organic, FX, CTA,
NCI) render in gray monospace. They are detail, not headline.

---

## 2. Hierarchy — decide the primary signal, demote everything else

Every screen has ONE primary signal. Give only that signal color and weight;
everything else recedes to gray.

- Home dashboard → primary signal is "what needs my action"
- Flux/review table → primary signal is "which lines moved materially"
- Consolidation tree → primary signal is "where are the exceptions"

**Subtotal rows always outrank detail rows**: bold weight + a heavier bottom
border (2px `--border-strong`) than detail rows (1px `--border`). A subtotal must
never be the same visual weight as a line item — the eye has to skim to totals.

---

## 3. Boxes vs. hairlines

- **One card per screen *region*, not one card per table or row.** A card marks
  a distinct zone; it is not a container for every element.
- **Tables use row dividers (hairlines), not card borders or per-cell borders.**
  Do not wrap a data table in a bordered/shadowed card. The structure comes from
  the row divider and whitespace.
- No boxes-inside-boxes. If an element already sits inside a card, it does not
  get its own border.

---

## 4. Badges and counts

- **A badge means "action required from the user," not "here is a count of
  everything in this category."** `My Reviews: 4` (things assigned to me) is a
  valid badge. `Upload History: 14` is noise — that's inventory, render it as
  quiet gray text or omit it.
- Sidebar counts that are pure inventory use `--text-400`, not a colored badge.

---

## 5. Chrome / top bar

- One slim top bar (52px), one row. Brand, period context, search, Ask Korvyn,
  avatar. That's it.
- **One primary action per screen** (filled navy button). Everything else is a
  secondary outline button. Never two filled buttons competing.

---

## 6. Numbers are ledger-grade

- Every monetary figure, quantity, date, ID, and delta uses `--font-data`
  (IBM Plex Mono), `font-variant-numeric: tabular-nums`, right-aligned.
- UI chrome (labels, nav, buttons) uses `--font-ui` (Inter). Do not blend the
  two — the contrast is the product's personality.

---

## 7. Consolidation scale (600+ entities) — structural rules

These apply to any screen touching the entity roll-up:

- **The roll-up tree is a status instrument, not just navigation.** Every node
  (consolidated → region → entity) shows its own completion (mini-bar + fraction)
  and an **exception count that rolls up from everything beneath it**. The
  exception count is the number users scan for.
- **Tables default to exceptions + material movements only**, not the full line
  set. Show "5 of 214 lines" with full detail behind a filter chip. Never land
  the user on hundreds of unfiltered rows.
- **Multi-dimensional currency data lives behind column-set toggles**, never one
  wide table. Local / Reporting / FX-CTA / Eliminations / NCI split are separate
  views the user switches between, each readable on its own.
- **NCI and eliminations are first-class.** Show parent/minority split where a
  node has NCI; flag elimination mismatches as red exceptions inline — a failed
  elim is a material finding, not a footnote.

---

## 8. The states you must build (not just the happy path)

Every table and every form gets all of these, or it's not done:
- empty state (an instruction to act, not just "no data")
- loading skeleton
- error state (says what went wrong and how to fix it, in the UI's voice)
- disabled / pending-approval state
- row hover
- visible keyboard focus ring (`--k-focus-ring`) — never remove outlines

---

## 9. Copy

- Sentence case everywhere. Active voice. A button says what happens
  ("Submit for review", not "Submit").
- An action keeps its name through the whole flow: the "Approve" button produces
  an "Approved" toast.
- Errors don't apologize and are never vague. Empty states invite an action.

---

## HOW TO PROMPT ME (Claude Code) WITH THIS FILE

Don't say "make it clean" or "make it look enterprise" — that drifts every
screen. Instead, reference the rule:

  ✅ "Build the trial balance screen following design-system.md. Exceptions-first,
      column-set toggle for currency views, subtotals bold with heavy border."
  ✅ "This table has 4 colored columns — that violates rule 1. Keep color on
      MoM Δ and Δ% only, gray the rest."
  ✅ "Add the empty / loading / error states per rule 8."

  ❌ "Make it less crowded."
  ❌ "Make it look like BlackLine."

---

## FINAL CHECKLIST — run before any screen is done

1. ≤ 3 accent colors visible? (gold / teal / red only)
2. ≤ 2 colored columns on any data table?
3. Subtotals visually outrank detail rows?
4. No box-in-box; tables use hairlines not card borders?
5. Badges = action required, not inventory?
6. Exactly one primary (filled) button?
7. All money/dates/IDs in tabular monospace, right-aligned?
8. Empty / loading / error / hover / focus states all built?
9. (Consolidation screens) tree shows rollup completion + exception rollup per node?
10. (Consolidation screens) table defaults to exceptions-first, wide data behind column-set toggles?
