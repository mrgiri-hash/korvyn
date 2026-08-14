# CLAUDE.md — `@korvyn/core`

The real TypeScript domain model — the full working guide is **[`README.md`](README.md)**; read it
before editing. This file is the load-bearing summary so the invariants are in front of you when
you work in this subtree.

## What it is

A typed GAAP domain model (`src/domain` — accounts, entities, dimensions, periods, journal entries,
validation) plus the adapter seam (`src/integration`). Also: the CIP→PIS capital-asset lifecycle
(`src/domain/capital.ts`) and a validated multinational GL fixture (`src/fixtures/enterprise-gl.ts`).
No sync engine, no persistence, no real API calls, no UI — deliberately.

## The rules that must not break

- **The boundary is one-directional.** `integration/` may import `domain/`, never the reverse, and
  no vendor field name (NetSuite / Intacct / Yardi / Procore / QuickBooks …) may appear outside an
  adapter's private translation code. `tools/check_boundary.py` enforces it without Node.
- **Money is `bigint` minor units, never `number`.** Does not survive `JSON.stringify` — use
  `moneyToJSON`. Balance is checked **per currency**.
- **One signed amount per journal line**, not debit/credit fields. Entity lives on the *line*.
- **`ValidatedJournalEntry` is a branded type** — the only way to get the brand is through
  `validateJournalEntry`, so posting something unvalidated is a compile error. The capital
  lifecycle mirrors this with branded determination gates (`approveCapitalization` /
  `approvePlacement`); `SETTLEMENT_OUT_OF_BALANCE` is the crown-jewel tie-out.
- **Normal balance derives from account type**, never stored. `MappingConfig` contains no
  functions (must serialise to a DB row).

## The one bridge to the UI

`tools/emit_enterprise_gl.mjs` serialises a validated GL snapshot into the main file's
`<script id="egl-data">` block — `index.html` at the repo root, re-pointed 2026-08-14 from
`apps/dashboard/korvyn_dashboard.html`. That is a build-time data snapshot, **not** a runtime
import — the page still depends on nothing. Exactly one view (`view-egl`) reads it.

## Verify

Node is installed but **not on `PATH`** — prepend it first (see [root CLAUDE.md](../../CLAUDE.md)):

```powershell
$env:Path = "C:\Users\mitragiri\tools\node22;$env:Path"
npm run check      # typecheck src + typecheck tests + 78 tests + boundary
```
