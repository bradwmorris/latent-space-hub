# PRD 10: Data Refinement & Hygiene

## Status: In Progress

**Last updated:** 2026-02-22

Phase 1 (type migration, content node descriptions/notes/dates) is complete. Phases 2A (ainews), 2B (article), 2C (guests), and 2F (UI date fix) are complete. Remaining: 2D (entities), 2E (edge cleanup).

---

## Background

PRD-05 ingested ~4,000+ nodes via the content ingestion pipeline. The raw content (chunks/transcripts) was there, but the user-facing fields were garbage — most nodes had NULL descriptions, NULL notes, wrong types, and no publish dates. This PRD tracks the systematic cleanup.

**Reference:** `docs/development/data-standards.md` defines the target data quality standards for all node types.

---

## Completed Work

### Phase 0: Audit & Graph Structure Decision ✅

- Audited all node types, identified missing fields, duplicates, and junk nodes
- Decided on **flat types** (no hub nodes) — `node_type` is the primary grouping mechanism
- Identified the target 8-type system: `podcast`, `ainews`, `article`, `builders-club`, `paper-club`, `workshop`, `guest`, `entity`

### Phase 1A: Node Type Migration ✅

All nodes now use the target type system. Zero NULL types remain.

**Migrations performed:**

| Migration | Count | Method |
|---|---|---|
| `episode` → `podcast` | 247 | SQL: metadata.series = 'latent-space-podcast' + title heuristics |
| `episode` → `paper-club` | 34 | SQL: metadata.series = 'paper-club' + title heuristics |
| `episode` → `builders-club` | 24 | SQL: metadata.series = 'meetup' + title heuristics |
| `source` → `ainews` | 136 | SQL: metadata.source_type = 'newsletter' OR title starts with '[AINews]' |
| `source` → `article` | 71 | SQL: remaining Substack blog posts (latent.space/p/...) |
| `source` → `paper-club` | 2 | SQL: metadata match |
| `person` → `guest` | 732 | Script: persons connected to content nodes via edges |
| `person` → `entity` | 4 | Script: persons NOT connected to any content |
| `organization` → `entity` | 683 | SQL: bulk UPDATE |
| `topic` → `entity` | 1867 | SQL: bulk UPDATE |

**Deletions performed:**

| What | Count | Reason |
|---|---|---|
| AI Engineer conference talks | 58 | Not LS content (channel_name = 'AI Engineer'), 0 chunks |
| Insight nodes | 65 | NULL metadata, 0 chunks, auto-generated placeholders |
| AINews placeholder nodes | 31 | Empty shells with 0 chunks, 0 edges (channel_name = 'Latent Space', [AINews] titles) |
| Promo/event posts | 7 | Non-content ("Join the community", "Speaker applications", etc.) |
| Duplicate source-podcast pairs | 52 | Merged: chunks moved to podcast node, edges redirected, source deleted |
| Duplicate paper-club pairs | 2 | Merged: edges redirected, duplicate deleted |

**Scripts used:** `scripts/output/reclassify-sources.ts`, `scripts/output/delete-null-types.ts`, `scripts/output/migrate-entity-types.ts`, `scripts/output/merge-pc-dupes.ts`

### Phase 1B: Publish Dates ✅

All content nodes now have `event_date` set to their publish/upload date.

| Type | Nodes with dates | Method |
|---|---|---|
| podcast | 247/247 | yt-dlp parallel fetch (video_id → upload_date) |
| paper-club | 32/32 | yt-dlp parallel fetch |
| builders-club | 24/24 | yt-dlp parallel fetch |
| ainews | 136/136 | Already had dates from ingestion |
| article | 71/71 | Mix: yt-dlp for video articles, Substack JSON-LD scraping for blog posts, metadata extraction |

**Scripts used:** `scripts/output/fetch-dates.sh` (parallel yt-dlp fetcher), `scripts/output/apply-dates.ts` (Turso batch updater)

### Phase 1C: Descriptions & Notes for Content Types ✅

| Type | Descriptions | Notes | Method |
|---|---|---|---|
| podcast | 247/247 ✅ | 247/247 ✅ | Claude Code via MCP: read chunks → generate → ls_update_node |
| paper-club | 32/32 ✅ | 32/32 ✅ | Claude Code via MCP: read chunks → generate → ls_update_node |
| builders-club | 24/24 ✅ | 24/24 ✅ | Claude Code via MCP: read chunks → generate → ls_update_node |

**Workflow:** For each node, read first 3 chunks (chunk_idx 0, 1, 2) from `chunks` table via `ls_sqlite_query`, generate description (1-2 sentences, concrete/specific) and notes (3-6 bullet points, insight-dense), write via `ls_update_node` content field (appends to notes) and description field (overwrites).

---

## Remaining Work

### Phase 2A: AINews Descriptions & Notes ✅

**136/136 nodes complete.** All AINews nodes now have descriptions ("AI News edition covering...") and bullet-point notes. Generated via 10 parallel Claude Code subagents reading chunks and writing via MCP.

### Phase 2B: Article Descriptions & Notes ✅

**71/71 nodes complete.** All article nodes now have descriptions ("Latent Space article/podcast episode...") and bullet-point notes. Generated via 5 parallel Claude Code subagents.

### Phase 2C: Guest Descriptions & Notes ✅

**725/735 nodes complete.** 10 skipped (product/bot accounts: Claude Opus, Augment Code, Gemini folks, Claudeai, Cline, Cognition, Claude_code, Lmarena_ai, Latent.Space, Devin). Generated via 3 parallel Claude Code subagents split by ID range (< 2000, 2000-3000, >= 3000).

**Approach used:** Batch-queried edges for all guests in SQL `IN` clauses, resolved Twitter handles to real identities using training knowledge, wrote descriptions (role + why they matter) and bullet-point notes using edge context. Cross-node context assembly was key — guest descriptions came from their connected episodes, not from chunks on the guest node itself.

**Duplicate handle pairs flagged for future cleanup:** Teknium1/Teknuim1/Teknim1, Akhaliq/_akhaliq, Philschmid/_philschmid, Lewtun/Lvwerra, Karpathy/Andrej Karpathy, Gdb/Greg_brockman, Mike_krieger/Mikeyk, Swix/Swixs/Swyx.

### Phase 2D: Entity Descriptions & Notes 🟡

**1,612/2,589 entities have descriptions (62%). ~977 remaining (all 1-edge or 0-edge entities).**

Completed in 3 rounds by edge count priority:
1. **10+ edges (72 entities):** ✅ All done. Major companies (OpenAI, Anthropic, Google, DeepSeek), concepts (RL, benchmarking, reasoning), and platforms (Hugging Face, LangChain).
2. **5-9 edges (121 entities):** ✅ All done. Mid-tier companies, models, and technical concepts.
3. **2-4 edges (548 entities):** ✅ All done. Long-tail companies, specific models, niche concepts.
4. **0-1 edges (~1,808 entities):** ~842 done, ~977 remaining. Hit rate limit during processing.

**Data quality issues flagged:**
- `N/A` (id 2067, 41 edges) and `Unknown` (id 2336, 33 edges) — placeholder entities, need edge cleanup
- Multiple Decibel Partners transcription variants: Deible/Desible/Decible/Desel/Descelible/CTI Decible/Deal Partners/Deel Partners
- Duplicate entities: HuggingFace/Hugging Face, TogetherCompute/Together AI, SmallI/Small AI
- ASR artifacts: "Enthropic" = Anthropic, "Laid in Space" = Latent Space, "L Chain" = LangChain

**Approach:** Batch-queried edges via SQL IN clauses, used training knowledge for well-known entities, derived context from edge connections for unknowns. Parallel Claude Code subagents (3-6 at a time).

### Phase 2E: Edge Cleanup 🟡

**7,128 / 7,130 edges are `ai_similarity` with JSON blob context.**

These edges were auto-generated during ingestion. They need:
1. **Audit:** Are the connections meaningful? Sample 50 edges, check if the relationship is real.
2. **Context rewrite:** Convert JSON blob context to plain English sentences.
3. **Junk removal:** Delete edges that don't represent meaningful relationships.
4. **Direction check:** Verify from_node_id → to_node_id reads logically.

**This is the hardest task** — 7K edges need individual evaluation. Consider:
- Rule-based rewrite for common patterns (guest → episode, episode → topic)
- Batch delete edges between unrelated entity nodes with low similarity
- Claude Code for ambiguous cases

### Phase 2F: UI Date Display Fix ✅

- `src/services/database/nodes.ts` — default sort changed to `event_date DESC NULLS LAST, updated_at DESC`
- `src/components/layout/ThreePanelLayout.tsx` — event_dates display as absolute dates ("Jan 15, 2025"), updated_at dates show as relative ("3d ago")

---

## Current Database Snapshot (as of 2026-02-22, post-2C)

| Metric | Count |
|---|---|
| Total nodes | 3,808 |
| Total edges | 7,130 |
| Total chunks | 35,329 |
| NULL node_type | 0 ✅ |
| NULL description | ~2,560 (was 3,286) |
| NULL notes | ~2,560 (was 3,286) |
| NULL event_date | 3,297 |
| Edges with NULL context | 1 |
| Edges `ai_similarity` | 7,128 |

**Node type breakdown:**

| Type | Total | Has Desc | Has Notes | Has Date |
|---|---|---|---|---|
| entity | 2,562 | 12 | 12 | 0 |
| guest | 735 | 725 ✅ | 725 ✅ | 0 |
| podcast | 247 | 247 ✅ | 247 ✅ | 247 ✅ |
| ainews | 136 | 136 ✅ | 136 ✅ | 136 ✅ |
| article | 72 | 72 ✅ | 71 ✅ | 72 ✅ |
| paper-club | 32 | 32 ✅ | 32 ✅ | 32 ✅ |
| builders-club | 24 | 24 ✅ | 24 ✅ | 24 ✅ |

---

## Technical Notes

### Scripts

All batch scripts are in `scripts/output/` and use `@libsql/client` directly (no Next.js deps). Pattern:
- `--dry-run` flag for preview
- Batch processing in chunks of 50
- Direct Turso connection via `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` from `.env.local`

| Script | Purpose |
|---|---|
| `fetch-dates.sh` | Parallel yt-dlp date fetcher (15 workers) |
| `apply-dates.ts` | Batch update event_date + metadata.publish_date |
| `reclassify-sources.ts` | Source → article migration + promo deletion |
| `delete-null-types.ts` | Delete AIE, insight, placeholder nodes |
| `migrate-entity-types.ts` | Person/org/topic → guest/entity migration |
| `merge-pc-dupes.ts` | Merge paper-club duplicate pairs |

### Claude Code MCP Workflow

For description/notes generation, the pattern is:
1. **Read chunks:** `ls_sqlite_query` → `SELECT node_id, substr(text, 1, 2000) FROM chunks WHERE node_id = ? AND chunk_idx IN (0, 1, 2)`
2. **Generate:** Claude Code reads chunks, writes description + bullet-point notes
3. **Write:** `ls_update_node` — `content` field APPENDS to notes, `description` field OVERWRITES
4. **Batch:** Process 10-12 nodes per subagent, run 2-3 subagents in parallel

### Data Quality Standards

See `docs/development/data-standards.md` for the full spec. Key rules:
- Descriptions: 1-2 sentences, concrete/specific, no vague verbs
- Notes: 3-8 bullet points, information-dense, each teaches something
- Dates: `event_date` = publish/upload date in YYYY-MM-DD format
- Types: One of 8 canonical types, no NULLs
