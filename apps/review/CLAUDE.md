# CLAUDE.md — Korvyn Review Platform (`apps/review/index.html`)

**This is the active front-end.** The Financial Review Platform — a single self-contained HTML file
(inlined wordmark + tokens, no build step). Open it in a browser, or serve it live with the agent
(below). For the monorepo map see the [root CLAUDE.md](../../CLAUDE.md); for the UI system see
[`design-system/design-system.md`](../../design-system/design-system.md) — read it before any UI work.

## The organizing idea

The unit of work is a **Financial Review Package** (Operating Expense, Cash, Revenue, Fixed Asset,
CIP, Debt, Lease, AP…), **not a module**. The home answers *"what reviews need me today?"* and every
review opens a consistent workspace: Executive Summary · AI Analysis · Trend · Reconciliation ·
Transaction Drilldown · Workpapers · Supporting Evidence · Journal Entries · Discussion · Review
History · Approvals · Audit Readiness.

**Flux review is the most developed surface.** Operating Expense and Revenue reviews are wired
**live** to an embedded GL trending engine (interactive chart, materiality-flagged variance table,
transaction drill-down, derived exec + AI narrative). Other reviews show honest "connects as we go"
stubs naming their real engine — never mocked numbers.

## Rules that must hold

- **AI narrates, never computes a number.** Every figure comes from the engine; the AI layer only
  explains and cites. This is the product thesis — do not let a generated number appear un-derived.
- **Numbers derive, never duplicate; no dead controls** (the repo-wide conventions apply here too).
- **The chart of accounts is a real engine.** `index.html` carries a built-from-spec ~152-account
  REIT chart that foots (A = L + E via cash-plug + retained earnings in the GL ledger); the
  taxonomies all derive from it. Don't hardcode a number a taxonomy should derive.
- **Enterprise period lock:** locked periods are read-only everywhere — a banner plus guards on
  every edit surface; reopen is role-gated (Controller / Administrator) with confirm + audit log.
- **Config-driven left nav** (`NAV_CFG`) with an admin Settings → Navigation editor (role × item
  matrix, reorder, custom items, preview-as-role). Roles: Preparer / Reviewer / Controller /
  Administrator / External auditor.

## Design-system status

The go-forward system is **gold/teal/navy** (`design-system/`). This file historically used a cobalt
accent and is being brought into line — check any UI change against the design-system checklist and
the "no blue accents" rule. When a request conflicts with the design system, follow the system and
say so.

## `mocks/` — design explorations, kept for reference

`gl-trending-review.html` (one review package end-to-end: MoM/QoQ trending, data-vintage
versioning, evidence, approve-&-freeze immutable versions) and the flux mock explorations. Reference
only — the platform is `index.html`.

## Running it with the live agent (the full chatbot)

Opened on its own, the **Ask Korvyn** panel falls back to a grounded, deterministic engine that
still cites its source. For the full streaming LLM agent, run [`korvyn-agent`](../../packages/agent),
which serves this UI and the agent on one origin:

```bash
cd ../../packages/agent
cp .env.example .env      # add ANTHROPIC_API_KEY
npm install && npm run serve      # → http://localhost:8787  (serves this index.html + POST /ask)
```

A published claude.ai artifact can never reach a live LLM (sandbox CSP), so the agentic chatbot only
runs here, not from an artifact link.
