# Search & Indexing

Latent Space Hub uses three layers of indexing — all automatic — and a hybrid search system that combines them.

## Three Indexing Layers

### 1. FTS5 (Full-Text Search)

SQLite's built-in full-text search engine. Keyword search with BM25 relevance ranking.

- Virtual table `chunks_fts` mirrors the `chunks` table (external content mode)
- Kept in sync automatically via SQL triggers on `chunks` (insert, update, delete)
- Uses BM25 ranking (lower = better match, normalized to 0-1 at query time)
- Rebuilt on schema setup: `INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')`

**FTS5 table definition:**

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text, content='chunks', content_rowid='id'
)
```

**Sync triggers:**

```sql
-- Insert: mirror new chunks into FTS
CREATE TRIGGER chunks_fts_insert AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;

-- Delete: remove from FTS
CREATE TRIGGER chunks_fts_delete AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
END;

-- Update: delete old, insert new
CREATE TRIGGER chunks_fts_update AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
```

**Query construction:** Each search term is individually double-quoted to prevent FTS5 syntax errors. Single-character terms are discarded. Terms are space-separated (implicit AND).

### 2. Vector Embeddings (Semantic Search)

OpenAI `text-embedding-3-small` generates 1536-dimension embeddings. Two tiers:

| Tier | What's embedded | Stored in | Purpose |
|------|----------------|-----------|---------|
| **Node-level** | `title + "\n" + description` | `nodes.embedding` | Node search (finding episodes, guests, topics) |
| **Chunk-level** | Chunk text content | `chunks.embedding` (`F32_BLOB(1536)`) | Content search (finding what was said) |

**Vector index:**

```sql
CREATE INDEX chunks_embedding_idx ON chunks (
  libsql_vector_idx(embedding, 'metric=cosine', 'compress_neighbors=float8', 'max_neighbors=20')
)
```

Queried via `vector_top_k()` at search time. Similarity is computed as `1.0 - vector_distance_cos(...)` (cosine distance converted to similarity).

### 3. B-tree Indexes

Standard SQL indexes for filtering and joins:

```sql
CREATE INDEX idx_nodes_updated ON nodes(updated_at);
CREATE INDEX idx_nodes_node_type ON nodes(node_type);
CREATE INDEX idx_node_dimensions_node ON node_dimensions(node_id);
CREATE INDEX idx_node_dimensions_dim ON node_dimensions(dimension);
CREATE INDEX idx_edges_from ON edges(from_node_id);
CREATE INDEX idx_edges_to ON edges(to_node_id);
CREATE INDEX idx_chunks_node ON chunks(node_id);
CREATE INDEX idx_logs_ts ON logs(ts);
```

## Ingestion Flow (Per Item)

```
Content (YouTube / article / PDF)
  → Extract text (extractors)
  → Create node
  → Chunk text (~2000 chars, 400-char overlap)
  → Generate embeddings (OpenAI, batches of 20)
  → Store as F32_BLOB → auto-indexed by Turso vector index
  → FTS5 triggers auto-sync chunk text
  → Entity extraction (Claude) → create edges
```

### Chunking

- **Chunk size:** ~2,000 characters
- **Overlap:** 400 characters
- **Boundary detection priority:**
  1. Paragraph break (`\n\n`) — if found after 50% of chunk size
  2. Sentence end (`. `) — if found after 50% of chunk size
  3. Hard cut at chunk size if no boundary found

### Embedding Generation

- **Model:** OpenAI `text-embedding-3-small` (1536 dimensions)
- **Chunk-level:** Batches of 20 chunks per API call, each chunk inserted individually
- **Node-level:** One node at a time, embeds `title + description` (truncated to 2000 chars)

### chunk_status Tracking

Tracked on the `nodes` table via `nodes.chunk_status`:

```
null → 'chunking' → 'chunked'
                  ↘ 'error'
```

If a node has no chunk content, status is set directly to `chunked` (skipped).

## Search at Query Time

### Hybrid Search (Default)

Combines vector and FTS5 results using **Reciprocal Rank Fusion (RRF)** — merges two ranked lists without needing comparable scores.

**RRF formula:** `score = 1 / (k + rank)` where `k = 60` and `rank` is 1-indexed.

Both sub-searches run in parallel, each returning `matchCount * 2` candidates. Chunks appearing in both lists get their RRF scores summed. Final results are sorted by combined score, normalized to 0-1, and sliced to `matchCount`.

```
1. Run vector search + FTS5 in parallel
2. Score each result: 1 / (60 + rank)
3. Sum scores for chunks appearing in both lists
4. Sort by combined score, normalize, return top K
```

Default parameters: `matchCount = 5`, `similarityThreshold = 0.3`.

### Fallback Chain

If a search tier fails or returns empty, the system degrades gracefully:

```
hybrid (vector + FTS)  →  vector-only  →  FTS-only  →  LIKE (last resort)
```

The LIKE fallback requires all terms (length > 2) to match via `LOWER(text) LIKE '%term%'`, returns a fixed similarity of 0.5, and orders shorter chunks first.

## What Gets Searched

| Search type | What it searches | Use case |
|-------------|-----------------|----------|
| **Node search** | Titles and descriptions (node-level embeddings) | Finding specific episodes, guests, topics |
| **Content search** | Chunk text — transcripts, articles, papers (chunk-level embeddings) | Finding what was said about a topic |

## Via MCP Tools

| Tool | What it does |
|------|-------------|
| `ls_search_nodes` | Keyword search across node titles, descriptions, and notes |
| `ls_search_content` | Full content search through chunks (uses hybrid by default) |
| `ls_sqlite_query` | Custom SQL for advanced filtering and aggregation |

## Via Web UI

- **Cmd+K** opens the global search modal
- Searches across node titles and dimensions
- Results show node title, type badge, and matching dimensions
- Click a result to navigate to the node

## Key Files

| File | What it does |
|------|-------------|
| `src/services/database/chunks.ts` | Hybrid search, vector search, FTS5 search, RRF fusion, fallback chain |
| `src/services/typescript/embed-universal.ts` | Chunking + chunk-level embedding (batch of 20) |
| `src/services/typescript/embed-nodes.ts` | Node-level embedding (title + description) |
| `src/services/embedding/ingestion.ts` | Orchestrates chunk + node embedding, manages chunk_status |
| `src/tools/other/searchContentEmbeddings.ts` | MCP content search tool with full fallback chain |
| `setup-schema.mjs` | FTS5 table, triggers, vector index, B-tree index definitions |
