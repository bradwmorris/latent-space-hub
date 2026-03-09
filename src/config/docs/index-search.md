---
title: Indexing & Search
description: How content is indexed and searched — chunking, embeddings, full-text search, and hybrid search with Reciprocal Rank Fusion.
---

# How Indexing Works

When a node is created with content, it goes through an indexing pipeline that makes it searchable in three different ways. Each layer serves a different purpose.

## 1. Chunking

Long text (transcripts, articles) gets split into smaller pieces so search can find specific passages, not just whole documents.

- **Chunk size:** ~2,000 characters
- **Overlap:** 400 characters between chunks (so context isn't lost at boundaries)
- **Smart splitting:** prefers paragraph breaks (`\n\n`), then sentence ends (`. `), then hard cuts — only after at least 50% of the chunk is filled

Each chunk is stored in the `chunks` table, linked back to its parent node by `node_id`.

## 2. Embedding (Vector Search)

Each chunk gets turned into a 1536-dimensional vector — a list of numbers that captures its meaning. Similar content produces similar vectors. This is what powers "search by meaning" rather than exact keyword matching.

- **Model:** OpenAI `text-embedding-3-small` (1536 dimensions)
- **Node-level:** one embedding per node from title + description
- **Chunk-level:** one embedding per chunk, batched 20 at a time
- **Storage:** `F32_BLOB` columns (Turso's native vector format)
- **Index:** `libsql_vector_idx` with cosine distance metric

## 3. Full-Text Search (FTS5)

SQLite's built-in full-text search. Fast keyword matching with relevance ranking (BM25). Good for exact terms, names, and phrases.

- **Virtual table:** `chunks_fts` mirrors the `chunks` table
- **Auto-synced:** SQL triggers fire on insert, update, and delete — no manual sync needed
- **Ranking:** BM25 (term frequency × inverse document frequency)

## B-Tree Indexes

Standard database indexes for fast filtering:

- `node_type` — filter by category
- `event_date` — sort by date
- `updated_at` — recent changes
- `from_node_id` / `to_node_id` — edge lookups
- `node_id` on chunks — find chunks for a node
- `thread_id` on chats — group chat messages

---

# How Search Works

## Hybrid Search (Default)

The default search combines vector and full-text results using **Reciprocal Rank Fusion (RRF)**. This gets the best of both worlds — semantic understanding from vectors, exact matching from keywords.

1. **Run both searches in parallel** — vector search and FTS5, each fetching 2× the requested result count
2. **Score each result by rank:** `score = 1 / (60 + rank)`
3. **Sum scores** for results appearing in both lists (these get boosted)
4. **Sort by combined score**, normalize to 0–1, return top K

Default settings: `matchCount = 5`, `similarityThreshold = 0.3`.

## Two-Phase Search

The full search pipeline runs in two phases:

**Phase 1 — Find relevant nodes:**
- Vector search on node embeddings (title + description meaning)
- Falls back to keyword search (LIKE on title/description/notes) if vector fails

**Phase 2 — Find relevant passages:**
- Hybrid search (vector + FTS5 + RRF) within the nodes found in Phase 1
- If Phase 1 found nothing, searches all chunks directly
- Falls back to text search (LIKE with AND) as a last resort

## Fallback Chain

If a search tier fails or returns empty, the system degrades gracefully:

```
hybrid (vector + FTS)  →  vector-only  →  FTS-only  →  LIKE (last resort)
```

Each layer catches errors and moves to the next. The search always returns something if there's anything remotely relevant.

## Search Methods

Different surfaces use different entry points:

| Surface | How it searches |
|---------|----------------|
| **Web app** (`Cmd+K`) | Two-phase hybrid search |
| **MCP** (`ls_search_nodes`) | Node-level hybrid (vector + keyword + RRF) |
| **MCP** (`ls_search_content`) | Full two-phase: node discovery → chunk search |
| **MCP** (`ls_sqlite_query`) | Direct SQL — agents write their own queries |
| **Discord bot** (Slop) | Direct Turso queries via internal tools |
