# PRD: Entity Deduplication

**Status:** Draft | **Created:** 2026-03-10

## 1. Problem

The entity extraction cron creates duplicate nodes for people and organizations that already exist in the graph. Example: "Dylan Patel" exists as guest node 3129 (created 2026-02-20, rich notes, 7 edges). The extraction cron created a second "Dylan Patel" as entity node 4212 (created 2026-02-28) and linked new content to the duplicate instead of the canonical node. This means graph traversal from the canonical node misses newer content.

This is not an isolated case. The extraction pipeline's fuzzy dedup (Levenshtein distance) is not catching matches across node types (guest vs entity) or with minor name variations.

## 2. Current State

Entity extraction runs on the `:30` cron (`/api/cron/extract-entities`). For each content node:

1. GPT-4.1-mini extracts organization names and research themes
2. For each entity, the pipeline searches existing nodes with fuzzy dedup
3. If no match found, creates a new node
4. Creates typed edges (features, covers_topic, affiliated_with)

**Where dedup fails:**

- **Cross-type matching**: Search may not check `guest` nodes when looking for entity matches. "Dylan Patel" as a `guest` doesn't match when the pipeline only looks at `entity` nodes.
- **Name variations**: "SemiAnalysis" vs "Semi Analysis" vs "Semianalysis" - Levenshtein catches some but not all.
- **No post-creation validation**: Once a duplicate is created, there's no mechanism to detect or merge it later.

**Files:**
- Entity extraction pipeline: `src/services/extraction/entityExtractor.ts`
- Entity dedup logic: same file, search/match functions
- Extraction cron: `app/api/cron/extract-entities/route.ts`

## 3. Plan

### Step 1: Fix entity dedup at ingestion time

Make the dedup search broader and stricter:

- Search ALL node types (guest, entity, member), not just entities
- Normalize names before comparison: lowercase, strip punctuation, collapse whitespace
- Use multiple matching strategies: exact normalized match, Levenshtein <= 2, word-level overlap (Jaccard)
- For people: also check if the name appears in existing node descriptions
- Log match decisions for debugging

### Step 2: Add pre-creation confirmation

Before creating a new entity node:

- Run the broadened search
- If any candidate scores above a threshold, link to existing node instead of creating new
- If ambiguous (multiple candidates), pick the one with more edges (more canonical)
- Log when a new entity is created vs matched to existing

### Step 3: Retroactive dedup scan

Write a script to find and merge existing duplicates:

1. Find all groups of nodes with similar titles (normalized Levenshtein <= 2) across guest/entity types
2. For each group, pick the canonical node (prefer guest over entity, more edges, older creation date)
3. Move all edges from duplicates to the canonical node
4. Delete duplicate nodes
5. Log all merges for review

### Step 4: Add ongoing dedup monitoring

- Weekly check for potential duplicates (can run as a cron or manual script)
- Log warnings when the extraction pipeline creates a new entity that's "close" to an existing one

## 4. Scope Estimate

- ~4,100 nodes total, ~2,000 entity/guest nodes to scan
- Unknown duplicate count (Dylan Patel was found manually, likely more exist)
- Step 3 script should be run with dry-run mode first to review before executing

## 5. Success Criteria

- Entity extraction never creates a duplicate of an existing guest/entity node
- All existing duplicates are merged (edges moved, duplicates deleted)
- Graph traversal from any canonical node reaches all related content
- Merge log exists for audit trail

## 6. Risks

- Aggressive dedup could incorrectly merge distinct entities with similar names (e.g. two different people named "Michael Chen")
- Moving edges changes graph structure, could temporarily affect search results
- Need to handle edge direction correctly during merge (from_node_id vs to_node_id)

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
