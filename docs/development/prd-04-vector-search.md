# PRD 04: Enable Vector Search

## Background

Vector search was stubbed out when the repo was migrated to Turso. All code paths fall back to basic LIKE queries with hardcoded 0.8 similarity scores. As of 2026-02-19, Turso's native vector search is confirmed working on this instance (F32_BLOB, libsql_vector_idx, vector_top_k).

## Plan

1. Replace stubbed vector search with Turso native implementation
2. Add FTS5 for keyword search
3. Implement hybrid search (RRF) combining both
4. Test end-to-end

## Implementation Details

### Turso vector search API

```sql
-- Column type
v F32_BLOB(1536)

-- Create index
CREATE INDEX idx_chunks_vec ON chunks (libsql_vector_idx(embedding))

-- Query
SELECT chunks.*
FROM vector_top_k('idx_chunks_vec', vector(?), 10) AS vt
JOIN chunks ON chunks.id = vt.id
```

### Files to update

**`src/services/database/chunks.ts`:**
- `searchChunks()` — Replace stub with real vector_top_k() query
- Add `ftsSearch()` method using FTS5
- Add `hybridSearch()` method combining both via RRF
- Fix `getChunksWithoutEmbeddings()` to actually query

**`src/services/typescript/sqlite-vec.ts`:**
- Remove all "not supported" warnings
- Update serialization helpers for Turso's vector() function

**`src/services/database/sqlite-client.ts`:**
- Fix `checkVectorExtension()` to return true

**`src/tools/other/searchContentEmbeddings.ts`:**
- Update to use real vector search (should mostly work once chunks.ts is fixed)

**`setup-schema.mjs`:**
- Add vector index creation
- Add FTS5 virtual table creation

### Hybrid search (RRF pattern)

```sql
WITH fts AS (
  SELECT rowid as id, ROW_NUMBER() OVER (ORDER BY rank) as r
  FROM fts_chunks WHERE fts_chunks MATCH ?
  LIMIT 20
),
vec AS (
  SELECT vt.id, ROW_NUMBER() OVER () as r
  FROM vector_top_k('idx_chunks_vec', vector(?), 20) AS vt
)
SELECT COALESCE(f.id, v.id) as chunk_id,
  (1.0/(60 + COALESCE(f.r, 1000))) + (1.0/(60 + COALESCE(v.r, 1000))) as score
FROM fts f FULL OUTER JOIN vec v ON f.id = v.id
ORDER BY score DESC LIMIT 10;
```

### Depends on

- PRD 02 (schema cleanup — vector index on chunks, FTS5 table)

## Done =

- searchChunks() uses real vector_top_k()
- FTS5 index exists and ftsSearch() works
- Hybrid search (RRF) combines both
- searchContentEmbeddings MCP tool returns real similarity scores
- Tested with actual 1536d embeddings on Turso
