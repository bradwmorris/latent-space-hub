# PRD: Ingestion Description Quality

**Status:** Draft | **Created:** 2026-03-10

## 1. Problem

The auto-ingestion pipeline generates weak, vague node descriptions. Instead of explicit descriptions like "Latent Space podcast episode featuring Dylan Patel of SemiAnalysis covering Taiwan/TSMC endgame scenarios and hyperscaler AI capex", it produces descriptions that start with transcript text or use vague verbs like "discusses" and "explores".

This matters because node-level embeddings are built from `title + description`. A bad description means the node embedding is a poor semantic fingerprint, which forces search to fall back to chunk scanning. Explicit descriptions let agents find the right node without ever touching the chunks table.

RA-H (the upstream fork) solved this with a stricter description prompt, forbidden word list, post-generation sanitization, and quality monitoring. The hub's auto-ingestion pipeline uses a weaker prompt (`generateContentDescription()`) that doesn't enforce any of this.

## 2. Current State

Two description generators exist in the hub, with different quality levels:

| Generator | Used by | Prompt quality | Forbidden words | Sanitization |
|-----------|---------|---------------|-----------------|-------------|
| `generateContentDescription()` | Auto-ingestion (podcasts, articles, news) | Weak | None | None |
| `generateDescription()` | Manual node creation (API) | Better | None | None |

**RA-H's generator** (the gold standard) has:
- Forbidden words: "discusses", "explores", "examines", "talks about", "is about", "delves into"
- Format enforcement: "Podcast episode where...", "Blog post arguing...", "Research paper showing..."
- Post-generation sanitization (strips "Your note" / "This note" openers)
- Weak-pattern regex logging for quality monitoring
- 280-char strict limit

**Files:**
- Hub ingestion description: `src/services/extraction/entityExtractor.ts` (line ~236)
- Hub ingestion pipeline: `src/services/ingestion/processing.ts` (line ~405)
- Hub manual description: `src/services/database/descriptionService.ts`
- RA-H description: `ra-h/src/services/database/descriptionService.ts`

## 3. Plan

### Step 1: Port RA-H description prompt to hub

Replace `generateContentDescription()` with the RA-H-quality prompt. Key elements to port:

- Forbidden vague verbs (hard reject list)
- Format-first opener: "Podcast episode where...", "Article arguing...", "AINews digest covering..."
- Concrete claims/findings, not topic summaries
- "Why it matters" ending
- 280-char strict limit with truncation fallback

### Step 2: Unify description generation

Consolidate `generateContentDescription()` and `generateDescription()` into one function with the strict prompt. Both auto-ingestion and manual creation should produce the same quality.

### Step 3: Add quality monitoring

- Regex check for weak patterns after generation
- Log warnings when descriptions contain forbidden words
- Fallback: if generation produces a weak description, retry once with stricter prompt

### Step 4: Backfill existing nodes

Write a script to identify nodes with weak descriptions (contains forbidden verbs, starts with transcript text, or is just a copy of the title) and regenerate them.

Scope: ~530 content nodes (podcasts, articles, ainews, workshops, paper clubs, builders clubs). Entity/guest nodes are lower priority.

### Step 5: Re-embed backfilled nodes

After descriptions are regenerated, re-run node-level embedding for all updated nodes so the vectors match the new descriptions.

## 4. Success Criteria

- All auto-ingested nodes get explicit, format-first descriptions
- No descriptions contain forbidden vague verbs
- Existing weak descriptions are backfilled and re-embedded
- One unified description generator used everywhere

## 5. Risks

- Backfill touches ~530 nodes and costs OpenAI API calls (description generation + re-embedding)
- Re-embedding changes vector similarity scores, which could temporarily affect search ranking
- GPT-4.1-mini may need prompt tuning to match RA-H quality with the stricter prompt

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
