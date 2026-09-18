# CLAUDE.md — `korvyn-agent`

The server-side agentic LLM layer over Korvyn's graph — the full working guide is
**[`README.md`](README.md)**; read it before editing. This file is the load-bearing summary.

## What it is

A full agentic AI (not a chatbot) over a compact, deterministic port of the Meridian fixture
(`src/graph.ts`, `src/ledger.ts`). Uses the Claude API (`claude-opus-4-8`) with tool-calling:
streaming, multi-turn, and it **takes action** — it doesn't just answer. Kept a **separate package**
from `apps/` and `packages/core/` specifically so the LLM dependency and the API key live
server-side and neither of those is touched.

## The rules that must not break

- **It cannot break the ledger.** `post_to_ledger` exists but is refused by construction — posting
  needs a `HumanApproval` token whose branding Symbol is closure-private, so no agent code path can
  mint one. The ERP stays the system of record. Do not add a path that mints approval.
- **Grounded, or it says so.** Every figure must come from a tool result; if the graph can't answer
  it returns `not traceable: <reason>` and names what's missing. No LLM touches the numbers.
- **Tools self-register.** Each `src/tools/*.tool(s).ts` registers itself; add a file, import it in
  `src/tools/index.ts`, and the model can use it. No intent parsing — do not reintroduce a
  `parseIntent`-style dispatcher.
- **The API key never enters the repo.** Read from `ANTHROPIC_API_KEY`; `.env` is git-ignored; the
  code never handles the value. Do not log it, echo it, or write it to a file.

## Tools

**Read** — `trace` · `explain_variance` · `list_detections` · `reconciliation_status` ·
`close_status` · `intercompany_status` · `financial_statement` · `get_policy` · `list_entities`
· **Act** — `create_task` · `save_evidence` · `escalate` · `set_exception_state` · `audit_log`
· **Guardrail** — `post_to_ledger` (always refuses).

## Run

Node is installed but **not on `PATH`** — prepend it first (see [root CLAUDE.md](../../CLAUDE.md)).

```bash
npm install
cp .env.example .env      # paste your key from console.anthropic.com
npm run dryrun            # exercise ALL tools with NO API call (free)
npm run agent             # interactive multi-turn REPL (spends credits)
npm run serve             # serves the main file (../../index.html) + live agent at :8787
                          # REVIEW_UI_PATH overrides — point it at apps/review/index.html
                          # for the superseded review platform
```

`npm run serve` is the only way to get a **live** Ask Korvyn — a published claude.ai artifact can
never reach a model API (sandbox CSP), so the artifact only ever shows the deterministic fallback.

## Sloane reasoning service (2026-09-17)

`src/sloane/` is Korvyn's **Sloane API** — interpret · plan · narrate over a provider-neutral `SloaneLLMAdapter`
(`AnthropicSloaneAdapter`, `claude-opus-5`, structured output, strict re-validation; `MockLLMAdapter` declines so the
browser's deterministic engine answers). Mounted by `src/server.ts` at `/api/sloane/*`, same-origin only. **Since 2026-09-17 it orchestrates server-side**: `POST /api/sloane/turn` →
`SloaneOrchestrator` (context, interpretation, clarification, planning, permissions, READ-only tools over `@korvyn/core`'s GL,
grounding, traces). `/interpret` `/plan` `/narrate` return 410. `npm run sloane:test` · `npm run sloane:dryrun`. `npm run sloane:dryrun` (no spend) · `npm run sloane:demo` (scripted DEMO endpoint, not a provider). Full
record in the root CLAUDE.md, *SLOANE 2.0 PHASE 2*.

**Phase 3A (2026-09-17):** 88 governed READ tools across 12 domains over one population engine
(`governed.ts`), control objects (`controls.ts`), tool catalog (`toolset.ts`). The server book is `@korvyn/core`'s GL, not the
browser's. `npm run sloane:live-eval` spends credits. Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 3A*.

**Phase 3B (2026-09-17):** controlled Build + Act. PROPOSE tools (`actiontools.ts`) create ActionProposals; only
`POST /api/sloane/action` → `ActionEngine.decide()` executes a registered Action Service (`actions.ts`), after
confirmation, with re-checked permission, staleness, idempotency and audit. Governed actions are prepare-only.
Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 3B*.

**Phase 3C (2026-09-17):** durable work store (`persistence/`, `node:sqlite`, `data/korvyn-work.db`), server-authoritative
workflow for reconciliations (both catalogs), flux, close and work objects; session-cookie auth and capability authorization
(`auth.ts`); domain APIs under `/api/work/*` (`workapi.ts`); append-only audit; STALE_PROPOSAL with refresh / regenerate /
cancel (no overwrite). Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 3C*.

**Phase 4A (2026-09-18):** Artifact Intelligence — real `.xlsx`/CSV generation from governed definitions (`src/sloane/artifacts/`:
`model` · `compose` · `renderer` (ExcelJS streaming behind `ExcelRenderer`, preset `KORVYN_FINANCIAL`) · `tieout` · `refine` · `engine`),
server-authoritative Flux explanations (`book.ts` `fluxExplanation` / `setFluxExplanation`) and versioned reconciliation balances
(`controls.ts` `reconBalance`), and a source feed for late ERP postings (`sourcefeed.ts`). `npx tsx src/sloane/artifacts/perf.ts` is the
synthetic scale harness. Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 4A*.

**Phase 4B (2026-09-18):** generalized Artifact Intelligence — package types (close review, reconciliation, Flux, vendor support,
audit support, monthly financial, management review; PBC scaffold) composed from one section library (`artifacts/sections.ts`), NL package
refinement, derive/reuse, a validation model, the common artifact contract, save/archive/restore, job cancel (COMPLETED/CANCELLED) and
`ArtifactStorage` (`artifacts/storage.ts`). Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 4B*.

**Phase 5A (2026-09-18):** Audit / PBC intelligence — requests (NL, manual, CSV / TSV / XLSX upload; PDF needs review) become versioned
`PBC_REQUEST` records whose population, tie-out, selection matching, evidence and support gaps are derived from the one ledger
(`src/sloane/audit/pbc.ts`), Sloane tools and proposals (`audit/pbctools.ts`, `audit/pbcactions.ts`), a PBC_PACKAGE over the request,
and `/api/work/pbc/*`. Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 5A*.

**Phase 3D (2026-09-17):** one book — Flux comments (keyed by FS lines), reconciliation workflow, close task status and saved
reports are read and written by the workspace and Sloane through the same store (`book.ts`, seeded from `browser-book.json` by
`tools/extract-browser-book.mjs`). Session hardening: HttpOnly SameSite cookie, per-session CSRF token (`X-Korvyn-CSRF`), Origin check,
allowed-origin CORS, logout; authorization before validation; a standard `outcome` contract. Full record in the root CLAUDE.md,
*SLOANE 2.0 PHASE 3D*.
