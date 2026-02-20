# PRD 05: Content Ingestion Pipeline

## Background

Current state: ~204 nodes, 0 chunks, 0 embeddings. Existing bulk ingest scripts are based on legacy schema fields (`content`, `type`) and are not safe for current schema (`notes`, `node_type`, `event_date`, `source_type` metadata).

Goal: backfill all Latent Space content from January 2025 to present, with deterministic ingestion and clean, queryable metadata for hybrid/vector search.

## Plan

1. Preparation and cleanup (required before ingest)
2. Source enumeration and manifest generation
3. Idempotent node ingestion
4. Chunking + embeddings
5. Entity extraction + edge creation
6. Auto-ingest design (future)

## Preparation Required Before Backfill

No bulk ingest run should start until all items below are done.

### A. Resolve hard dependency on PRD-04

- `ChunkService.searchChunks()` must use real `vector_top_k()` queries.
- FTS + hybrid search methods must exist and be callable.
- Embedding pipeline must be enabled (current `NodeEmbedder`/`UniversalEmbedder` stubs must be replaced with working implementations).

### B. Fix ingestion schema contract

All ingestion writes must use current schema:

- `nodes.notes` (not `nodes.content`)
- `nodes.node_type` (not `nodes.type`)
- `nodes.event_date`
- `metadata.source_type` for `source` nodes (`blog | newsletter | article | paper | doc`)
- `nodes.chunk` contains full source text (transcript/article body/markdown), not a short summary
- `nodes.chunk_status` initialized to `not_chunked` until chunk pipeline runs

### C. Remove/replace broken legacy scripts

- Remove AIE artifacts:
  - `scripts/bulk-ingest-aie.js`
  - `scripts/data/aie-videos.json`
- Do not patch old one-off scripts in place for production use:
  - `scripts/bulk-ingest-podcasts.js`
  - `scripts/bulk-ingest-ainews.js`
- Replace with one unified ingestion entrypoint:
  - `scripts/ingest.(js|ts)` with flags:
  - `--source podcasts|articles|ainews|latentspacetv`
  - `--dry-run`
  - `--since YYYY-MM-DD`
  - `--until YYYY-MM-DD`
  - `--limit N` (optional for smoke tests)

### D. Define idempotent dedupe keys before import

Use deterministic upsert identity:

- Primary key: canonical `link`
- Secondary key: source-specific ID in metadata
  - YouTube: `video_id`
  - AINews: `slug`
  - Substack: `slug` or canonical URL path

Behavior on conflict:

- Update mutable fields (`title`, `description`, `chunk`, `event_date`, metadata)
- Preserve manual notes where applicable
- Never create duplicate nodes for same canonical source item

### E. Normalize existing nodes before large ingest

One cleanup pass on existing rows:

- Normalize `node_type` values to supported set
- Normalize links to canonical URL shape
- Fill missing `event_date` from metadata where possible
- Normalize dimension naming to project taxonomy
- Mark low-quality existing `chunk` values (summary-only content) as stale for overwrite

### F. Add source type in TypeScript

- Update `SourceMetadata.source_type` union in `src/types/database.ts` to include `'newsletter'`.

## Source Scope

4 source categories, Jan 2025 -> present:

1. Podcasts (`@LatentSpacePod` YouTube) -> `node_type='episode'`, dimension `podcast`
2. Articles (`latent.space` Substack) -> `node_type='source'`, `source_type='blog'`, dimension `article`
3. AINews (`smol-ai/ainews`) -> `node_type='source'`, `source_type='newsletter'`, dimension `ainews`
4. LatentSpaceTV (`@LatentSpaceTV`) -> `node_type='episode'`, series `{builders-club|paper-club|meetup}`

## Implementation Details

### Phase 0: Enumerate source manifests

- Generate manifests under `scripts/data/` for each source.
- Required manifest fields:
  - `source`, `external_id`, `link`, `title`, `publish_date`, raw source metadata
- Manifests are append-only artifacts for reproducibility and reruns.

### Phase 1: Node ingestion (idempotent)

- Ingest from manifests, source-by-source.
- Deduplicate on canonical identity rules above.
- Persist:
  - `title`, `description`, `notes`, `link`, `node_type`, `event_date`, `chunk`, `metadata`
- Assign dimensions:
  - category dimension + locked/priority dimensions.
- Store extraction provenance:
  - `metadata.extraction_method = 'ingestion-pipeline-v2'`
  - source retrieval timestamp

### Phase 2: Chunking + embedding

- Depends on PRD-04 completion.
- For each node with full `chunk` source text:
  - split into ~500-token chunks with ~100 overlap
  - embed each chunk with `text-embedding-3-small` (1536d)
  - write to `chunks` table with vector column
  - write node-level embedding for `title + description`
  - update `chunk_status='chunked'`

### Phase 3: Entity extraction + graph edges

- AINews:
  - use frontmatter entities (`companies`, `models`, `topics`, `people`) as primary extraction path.
- Podcasts/articles/LatentSpaceTV:
  - LLM extraction from title + description + source text sample.
- Create/reuse typed entity nodes:
  - `person`, `organization`, `topic`
- Create typed edges:
  - `appeared_on`, `covers_topic`, `affiliated_with`, `cites`

### Phase 4: Auto-ingest (future, not required for initial backfill)

- Poll or webhook triggers:
  - YouTube RSS/API for `@LatentSpacePod` and `@LatentSpaceTV`
  - Substack RSS for latent.space
  - GitHub updates for AINews repo
- Per new item pipeline:
  - enumerate -> ingest node -> chunk -> embed -> entity extraction -> edge creation

## Data Quality Rules

- No summary-only `chunk` payloads for ingested content.
- No duplicate node rows for same source item.
- `event_date` required for all ingest targets.
- `node_type` required and valid for all ingest targets.
- `source_type` required for `node_type='source'`.
- All ingestion runs must support `--dry-run` and emit counts:
  - discovered, inserted, updated, skipped, failed.

## Execution Order

1. Complete PRD-04 vector/embedding enablement
2. Implement unified ingestion script + manifest generation
3. Run normalization pass on existing nodes
4. Dry-run each source ingest
5. Run real source ingests
6. Run chunk+embed pass
7. Run entity+edge pass
8. Verify hybrid search quality on backfilled corpus

## Depends on

- PRD-02 schema cleanup (done)
- PRD-04 vector/embedding pipeline (must be complete before Phase 2)

## Done =

- [x] Prep checklist complete (A-F in this PRD)
- [x] Complete manifests for all 4 sources (Jan 2025 -> present)
- [x] Unified ingestion script implemented and used (legacy scripts retired)
- [x] Existing nodes normalized/deduplicated for ingest targets
- [x] Podcast + LatentSpaceTV episodes ingested with full transcript text
- [x] Substack articles ingested with full article text
- [x] AINews issues ingested with full markdown text
- [x] All ingested content chunked + embedded (node + chunk vectors)
- [x] Entity nodes and typed edges created
- [x] Vector search returns relevant results across full corpus

---

## COMPLETED

**Date:** 2026-02-20

All Latent Space content from Jan 2025 - Feb 2026 backfilled into the knowledge graph.

| Metric | Count |
|--------|-------|
| Total nodes | 4,024 |
| Content nodes (episodes + sources) | 570 |
| Entity nodes (people) | 740 |
| Entity nodes (organizations) | 685 |
| Entity nodes (topics) | 1,872 |
| Chunks (with 1536d vectors) | 36,443 |
| Edges | 7,293 |
| Dimensions | 1,629 |

### Key changes

- `scripts/ingest.ts` -- unified ingestion (4 sources, embed, seed-dimensions)
- `scripts/embed-all.ts` -- standalone chunking + embedding (batched DB inserts)
- `scripts/extract-entities.ts` -- entity extraction (frontmatter + LLM)
- `scripts/generate-manifests.ts` -- enumerate sources via yt-dlp, sitemap, git clone
- `src/services/typescript/embed-nodes.ts` -- NodeEmbedder now works (was stubbed)
- `src/services/typescript/embed-universal.ts` -- UniversalEmbedder now works (was stubbed)
- Added `'newsletter'` to `SourceMetadata.source_type`
- Deleted broken bulk ingest scripts and AIE data
