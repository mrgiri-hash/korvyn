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
