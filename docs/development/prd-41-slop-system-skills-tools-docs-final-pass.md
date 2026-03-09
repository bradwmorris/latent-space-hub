# PRD: Slop Bot Final Structure Review + Documentation Final Pass

**Status:** Draft | **Created:** 2026-03-09

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

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
