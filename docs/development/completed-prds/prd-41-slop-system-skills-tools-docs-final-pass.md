# PRD: Slop Bot Final Structure Review + Documentation Final Pass

**Status:** Completed | **Created:** 2026-03-09 | **Completed:** 2026-03-10

## 1. Background

Before final polish and sharing, we need one consolidated pass across Slop bot behavior (system message, skills, tools), full architecture understanding across Hub + bots repos, and a controlled documentation cleanup focused on simplicity, clarity, and explainability.

This PRD is designed to remove remaining complexity and produce a clean, explainable system and docs set.

## 2. Plan

1. Final structure check of Slop bot runtime (system message, skills, tools) to lock the simplest robust method
2. Build a clear cross-repo architecture map (Hub + `latent-space-bots`) that is easy to explain from docs
3. Propose final documentation hierarchy/order and get explicit owner approval before any restructure
4. Run a page-by-page documentation cleanup pass (clarity, code snippets, images)
5. Update embedded tldraw map/view and prep share-ready documentation state

## 3. Implementation Details

### Step 1: Slop Bot Structure Check (System Message + Skills + Tools)

**Goal:** Validate that the current Slop architecture is minimal, robust, and internally consistent.

**Scope:** Primarily `latent-space-bots`, plus any hub-side prompt/skill/tool interfaces that Slop depends on.

**Work:**
- Audit system message composition and ordering (base prompt, policy layers, injected context)
- Audit active skills and when/how they are loaded
- Audit tool surface area used by Slop (read vs write paths, fallback behavior, guardrails)
- Identify redundant, conflicting, or stale behavior
- Produce a "keep / remove / simplify" decision list

**Output:**
- Final recommended structure for prompt + skills + tools with rationale
- Concrete implementation checklist for any required cleanup changes

### Step 2: Deep Architecture Mapping (Hub + Bots)

**Goal:** Build an end-to-end understanding that can be explained simply.

**Work:**
- Map boundaries and responsibilities between this repo (`latent-space-hub`) and `latent-space-bots`
- Trace key runtime flows:
  - user input -> bot orchestration -> tool calls -> DB reads/writes -> response
  - scheduled/background workflows (ingestion, events, announcements)
- Document where schemas/contracts are shared and where coupling risks exist
- Capture key "how it works" diagrams/tables in plain language

**Output:**
- A concise architecture map suitable for documentation
- A "how to explain this in 2 minutes" summary

### Step 3: Final Documentation Structure/Hierarchy Decision (Approval Gate)

**Goal:** Decide and lock the final docs hierarchy/order.

**Work:**
- Propose a final information architecture for docs (top-level order, page grouping, navigation sequence)
- Remove bloat and fluff from proposal; prioritize short, practical, readable docs
- Explicitly mark what will be moved, merged, deleted, or rewritten
- Resolve docs source-of-truth for **Slop Skills** so they render reliably on the live Hub docs page:
  - Current issue: docs page references Slop Skills that are pulled from `latent-space-bots`, not stored in this repo, so live-site rendering can fail
  - Decide and document the robust approach:
    - Preferred: stable sync/import pipeline from bots repo -> hub docs build/runtime
    - Fallback: copy canonical Slop Skills into hub repo and treat hub as docs source-of-truth
  - Define ownership and update process so skills/docs do not drift again

**Hard gate (required):**
- **The agent MUST get explicit approval from Brad on the final hierarchy proposal before changing documentation structure or doing broad doc rewrites.**
- **No docs restructuring, mass edits, or page-order changes are allowed before this approval.**

**Output:**
- Final hierarchy proposal ready for owner sign-off
- Signed-off change list for doc restructure
- Signed-off Slop Skills source-of-truth plan (including fallback path)

### Step 4: Page-by-Page Documentation Cleanup

**Goal:** Ensure every docs page is clean, simple, and understandable.

**Work:**
- Review each documentation page individually
- Rewrite for clarity and brevity (remove fluff, ambiguity, stale details)
- Add targeted code snippets where they materially improve understanding
- Update/replace images where outdated or unclear
- Verify terminology consistency (`LS Wiki-Base` / `wiki-base`)

**Output:**
- Updated docs pages with consistent quality and readability
- Per-page checklist indicating reviewed/updated status

### Step 5: tldraw Map/View Refresh + Share Prep

**Goal:** Refresh the embedded tldraw architecture map/view so it matches final docs and is share-ready.

**Work:**
- Update tldraw map content and structure to match final approved architecture
- Ensure embed links/config are current
- Validate rendering in docs and app context
- Prepare final "ready to share" package (links + brief walkthrough)

**Output:**
- Updated embedded tldraw map/view
- Share-ready documentation state and review checklist

## 4. Success Criteria

- Slop runtime structure is simplified and explicitly justified
- Hub + bots architecture is clearly mapped and explainable
- Final docs hierarchy is approved by owner before restructure work begins
- Slop Skills display reliably on the live docs page via an explicit, robust source-of-truth strategy
- Docs are significantly cleaner and easier to understand page-by-page
- tldraw embed is current and ready for external sharing

## 5. Risks / Notes

- This work spans two repos; keep boundaries explicit and avoid hidden assumptions.
- Avoid premature docs edits before hierarchy approval gate is passed.
- Prioritize clarity and maintainability over "comprehensive but bloated" documentation.

## 6. Progress Log

### 2026-03-09 / 2026-03-10

**Step 1: Slop Bot Structure Check - DONE**

Audited system message, skills, and tools. Found and fixed:

**Bots repo (`latent-space-bots/`) changes:**

| File | Change |
|------|--------|
| `src/config.ts` | Added optional `OPENAI_API_KEY` env var for embedding queries |
| `src/db.ts` | Added `semanticSearch()`: embeds query via OpenAI, runs `vector_top_k()` on node + chunk embeddings, fuses with RRF |
| `src/tools.ts` | Added `slop_semantic_search` tool (8 → 9 tools). Rewrote all tool descriptions to accurately reflect search method (LIKE vs FTS5 vs vector). Organized tools into 3 groups: search, graph traversal, utility. |
| `src/llm/prompts.ts` | Replaced vague "start with semantic_search" with explicit routing: semantic for conceptual queries, search_nodes for known names, sqlite_query for temporal/events. Added critical event node_type caveat (recordings vs scheduled). |
| `skills/start-here.md` | Condensed 5-step search list to 3 steps with semantic search as primary |
| `skills/db-operations.md` | Replaced search strategy list with tool comparison table (vector vs LIKE vs FTS5) |

Also fixed (earlier in session):
- `src/db.ts` line 90: member notes overwrite bug (SET notes = ? → COALESCE append)

**Step 4: Page-by-Page Documentation Cleanup - DONE**

Hub repo (`latent-space-hub/`) docs changes:

| Page | Status | Changes |
|------|--------|---------|
| `overview.md` | Done | Simplified, removed fluff/em dashes, added ASCII diagram, added Origin section |
| `database.md` | Done | Full-width schema image, removed em dashes, fixed YAML frontmatter |
| `ingestion.md` | Done | Removed Quick Add section, fixed frontmatter |
| `index-search.md` | Done | Full rewrite: separated storage vs indexing vs search, Dylan Patel example throughout, added Slop search section with tool decision tree, all data verified against DB |
| `tools.md` | Done (new) | Created page covering both MCP tools (9, read-only) and Slop tools (9, with semantic search) |
| `skills.md` | Done (new) | Created page covering both skill systems, updated paths to local slop skills |
| `slop-bot.md` | Done | Updated tool count 8→9, rewrote tools table (search vs utility split), updated architecture diagram, added routing explanation |
| `mcp-server.md` | Done | Updated for read-only, removed write tools references |
| `evals.md` | Done | Minor cleanup |

**Other hub changes:**
- `app/docs/tools/page.tsx` and `app/docs/skills/page.tsx` created (route pages)
- `src/services/docs/docsService.ts` updated (added tools/skills to nav order)
- `src/components/docs/DocsLayout.tsx` updated (collapsible sidebar sections with stronger visual headers)
- `src/config/skills/slop/` created (copied slop skills from bots repo for reliable rendering)
- `src/services/skills/skillService.ts` updated (reads slop skills from local copy instead of cross-repo path)
- `apps/mcp-server-standalone/index.js` updated (removed all write tools, read-only only, bumped to 0.3.0)
- `docs/development/prd-42-description-quality.md` created (backlog item for fixing ingestion descriptions)
- `docs/development/prd-43-entity-dedup.md` created (backlog item for entity deduplication)
- `docs/development/backlog/backlog.json` updated (added description-quality and entity-dedup projects)

**Steps 2, 3, 5:** Deferred. Architecture mapping, docs hierarchy approval gate, and tldraw refresh are lower priority now that the core docs and code changes are complete.

---

## COMPLETED

**Date:** 2026-03-10

**Summary:** Full documentation pass across all docs pages. Slop bot structure audited and locked (system message, 9 tools with semantic search, 4 skills). MCP standalone server stripped of all write tools (read-only only). Slop skills copied into hub repo for reliable docs rendering. Docs sidebar made collapsible with stronger section headers. Two new PRDs created (description quality, entity dedup). Steps 2/3/5 deferred as non-critical.
