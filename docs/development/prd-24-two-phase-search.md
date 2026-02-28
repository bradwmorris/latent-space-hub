# PRD-24: Two-Phase Search & Node Embedding Backfill

## Target Repos

| Repo | Path | What changes |
|------|------|-------------|
| **latent-space-hub** | `/Users/bradleymorris/Desktop/dev/latent-space-hub` | All code + schema changes |
| **latent-space-bots** | `/Users/bradleymorris/Desktop/dev/latent-space-bots` | No changes (consumes hub via MCP — benefits automatically) |

**DO NOT touch `/Users/bradleymorris/Desktop/dev/ra-h`. That is a separate application with a separate database.**

## Database

- **Turso** (cloud libSQL) — `libsql://latentspace-bradwmorris.aws-us-east-2.turso.io`
- **Client:** `@libsql/client` — async, no `better-sqlite3`, no `vec0` extension
- **Vector type:** `F32_BLOB(1536)` with `libsql_vector_idx` (Turso native)
- **Vector search:** `vector_top_k('index_name', vector(?), k)` — NOT `vec0 MATCH`

---

## Context

The Latent Space Hub knowledge graph has ~3,900+ nodes. Most entity/guest/topic nodes are unsearchable via vector search because:

1. They have no chunks (no transcript/article body) — so `vector_top_k('chunks_embedding_idx', ...)` never finds them
2. `nodes.embedding` exists as a plain `BLOB` column — the `NodeEmbedder` writes to it, but **there is no vector index on nodes.embedding**
3. All search goes through the chunks table, completely missing entity/guest nodes

Searching for "Anthropic", "swyx", or "reinforcement learning" via vector search only finds results if those exact words appear in a chunk. The entity nodes themselves are invisible.

---

## Current Search Architecture (Verified)

Understanding what exists today is critical — there are **two disconnected layers** in the MCP server.

### What the MCP tools actually do (keyword only)

| Tool | Implementation | Search method | Tables |
|------|---------------|---------------|--------|
| `ls_search_nodes` (standalone MCP: `index.js`) | Hardcoded LIKE query | Keyword | nodes only |
| `ls_search_content` (standalone MCP: `index.js`) | FTS5 + LIKE fallback | Keyword + full-text | chunks + nodes |
| `ls_search_nodes` (hosted MCP: `app/api/[transport]/route.ts`) | Calls `nodeService.getNodes()` | Keyword (LIKE) | nodes only |
| `ls_search_content` (hosted MCP: `app/api/[transport]/route.ts`) | FTS5 + LIKE fallback | Keyword + full-text | chunks + nodes |
| Search box UI (`/api/nodes/search`) | `nodeService.searchNodes()` | Keyword (LIKE) | nodes only |
| AI chat tool (`searchContentEmbeddings`) | `chunkService.hybridSearch()` | Vector + FTS + LIKE fallback | chunks only |

### What exists but is NOT wired up

The standalone MCP server has a **services layer** (`apps/mcp-server-standalone/services/index.js`) with:

- `vectorSearch(queryEmbedding, limit)` — cosine similarity via `vector_top_k` on **chunks**
- `ftsSearch(query, limit)` — BM25 ranking via FTS5
- `nodeTextFallback(query, limit)` — LIKE on node fields
- `queryKnowledgeContext(query, options)` — orchestrator using Reciprocal Rank Fusion (RRF, k=60) to combine vector + FTS results

**This hybrid search engine is fully implemented but the MCP tools don't call it.** The tools bypass the services layer and run their own simpler SQL.

### Key implication

Adding `nodes_embedding_idx` + backfill alone **will not improve current MCP/Discord search**. The tools are hardcoded to keyword SQL. To get the benefit, you need both:

1. Node vector capability (index + node vector query path)
2. **Tool wiring** — `ls_search_*` must actually use the hybrid services layer (or be rewritten)

OpenAI key is needed for query-time embedding generation (to convert search text → vector). The services layer already handles this when a key is available, falling back to keyword search without one.

### Who calls what (end-to-end)

```
Discord bot → MCP ls_search_content → FTS5/LIKE on chunks (keyword only)
Discord bot → MCP ls_search_nodes  → LIKE on nodes (keyword only)
Hub search box → /api/nodes/search → LIKE on nodes (keyword only)
Hub AI chat → searchContentEmbeddings → vector + FTS on chunks (no node search)
```

---

## Solution

Four things need to happen:

1. **Vector index on nodes** — Create `nodes_embedding_idx` so node-level vector search works
2. **Backfill** — Embed all nodes missing embeddings (they have title + description text)
3. **Two-phase search** — Search nodes first (broad), then drill into chunks (deep)
4. **Wire MCP tools to hybrid search** — Connect `ls_search_*` to the services layer so Discord/MCP consumers actually benefit

---

## Phase 1: Schema — Vector Index on Nodes

### Problem

`nodes.embedding` is declared as `BLOB`. Turso's `libsql_vector_idx` requires `F32_BLOB(1536)`. Need to either:
- Verify Turso can index a plain BLOB column containing F32 data, OR
- Migrate the column type

### Implementation

**File:** `setup-schema.mjs` — add to migration section:

```sql
-- Attempt to create vector index on nodes.embedding
CREATE INDEX IF NOT EXISTS nodes_embedding_idx ON nodes
  (libsql_vector_idx(embedding, 'metric=cosine', 'compress_neighbors=float8', 'max_neighbors=20'));
```

**Risk:** If Turso rejects indexing a BLOB column, the fallback is:
1. Add new column: `ALTER TABLE nodes ADD COLUMN embedding_vec F32_BLOB(1536)`
2. Copy data: `UPDATE nodes SET embedding_vec = embedding WHERE embedding IS NOT NULL`
3. Create index on `embedding_vec` instead
4. Update `NodeEmbedder` to write to `embedding_vec`

**Test first** — run the `CREATE INDEX` manually via `check-turso.mjs` or Turso CLI before committing.

### Files
- `setup-schema.mjs` — add index creation in migration section

---

## Phase 2: Backfill — Embed All Orphan Nodes

### Problem

`NodeEmbedder.embedNodes()` already works — it queries `WHERE embedding IS NULL`, embeds `title + "\n" + description`, and writes via `UPDATE nodes SET embedding = vector(?)`. But it has `LIMIT 1000`, so multiple batches may be needed.

### Current NodeEmbedder location

**File:** `src/services/typescript/embed-nodes.ts`

The existing `NodeEmbedder`:
- Uses `getSQLiteClient()` (Turso via `@libsql/client`) — NOT `better-sqlite3`
- Embeds `title + "\n" + description`
- Stores via `UPDATE nodes SET embedding = vector(?), embedding_text = ?, embedding_updated_at = datetime()`
- No `vec_nodes` table — writes directly to `nodes.embedding`

### Implementation

**New file:** `scripts/backfill-node-embeddings.ts`

Simple script that imports `NodeEmbedder` and calls `embedNodes()` in a loop until no more unembedded nodes remain.

```
Loop:
  result = embedder.embedNodes({ verbose: true })
  if result.processed === 0: break
  log progress
```

**Important:** This script must use the Turso client (same as the app), NOT `better-sqlite3`. Load `.env.local` for `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `OPENAI_API_KEY`.

### Files
- New: `scripts/backfill-node-embeddings.ts`
- Reference: `src/services/typescript/embed-nodes.ts` (no changes needed)

---

## Phase 3: Node-Level Vector Search

### Problem

`NodeService` only has LIKE-based text search. Need vector search using the new `nodes_embedding_idx`.

### Implementation

**File:** `src/services/database/nodes.ts` — add method:

```typescript
async searchNodesByVector(
  queryEmbedding: number[],
  similarityThreshold = 0.4,
  matchCount = 10,
  nodeType?: string,
  dimensions?: string[]
): Promise<Array<Node & { similarity: number }>>
```

**SQL pattern** (Turso `vector_top_k`):
```sql
SELECT n.id, n.title, n.description, n.notes, n.link, n.node_type, n.event_date,
       n.metadata, n.chunk_status, n.embedding_updated_at,
       n.created_at, n.updated_at,
       COALESCE((SELECT JSON_GROUP_ARRAY(d.dimension)
                 FROM node_dimensions d WHERE d.node_id = n.id), '[]') as dimensions_json,
       (SELECT COUNT(*) FROM edges WHERE from_node_id = n.id OR to_node_id = n.id) as edge_count,
       (1.0 - vector_distance_cos(n.embedding, vector(?))) as similarity
FROM vector_top_k('nodes_embedding_idx', vector(?), ?) AS vt
JOIN nodes n ON n.rowid = vt.id
WHERE (1.0 - vector_distance_cos(n.embedding, vector(?))) >= ?
  [AND n.node_type = ?]
  [AND EXISTS (SELECT 1 FROM node_dimensions nd WHERE nd.node_id = n.id AND nd.dimension IN (...))]
ORDER BY similarity DESC
LIMIT ?
```

**Note:** All queries are `async` — Turso uses `@libsql/client` which is promise-based, unlike RA-H's synchronous `better-sqlite3`.

### Files
- `src/services/database/nodes.ts` — add `searchNodesByVector()`

---

## Phase 4: Two-Phase Search Service

### Problem

Need an orchestrator that runs node search first, then optionally drills into chunks.

### Implementation

**New file:** `src/services/database/search.ts`

```typescript
export class SearchService {
  // Phase 1: Find relevant nodes (vector + LIKE fallback)
  async searchNodes(query, options): Promise<NodeSearchResult[]>

  // Phase 2: Search chunks within specific nodes
  async searchChunksInNodes(query, nodeIds, options): Promise<ChunkSearchResult[]>

  // Combined: Phase 1 -> Phase 2
  async twoPhaseSearch(options): Promise<TwoPhaseSearchResult>
}
```

**Flow:**
1. Generate query embedding via `EmbeddingService.generateQueryEmbedding(query)`
2. **Phase 1:** `vector_top_k('nodes_embedding_idx', ...)` -> top N nodes
3. If vector fails or returns empty -> fall back to LIKE on title/description/notes
4. **Phase 2** (if requested): `hybridSearch` on chunks table, scoped to `nodeIds` from Phase 1
5. Return both layers: matched nodes + relevant chunks

**When Phase 2 triggers:**
- Caller controls via `includeChunks: boolean` parameter
- The search tool defaults to `includeChunks: true` for general queries

### Files
- New: `src/services/database/search.ts`
- `src/services/database/index.ts` — add export

---

## Phase 5: Update Search Tools

### 5a. searchContentEmbeddingsTool (Next.js app)

**File:** `src/tools/other/searchContentEmbeddings.ts`

Update to use two-phase search. Add `nodes_only` parameter. When `node_id` is specified, skip Phase 1 and go straight to chunk search (existing behavior preserved).

Return format adds `nodes` array alongside `chunks`:
```typescript
{
  nodes: [{ id, title, description, similarity, dimensions, node_type }],
  chunks: [{ id, node_id, text, similarity, node_title }],
  search_method: 'two_phase' | 'vector' | 'fts' | 'text_fallback',
  phase2_ran: boolean
}
```

### 5b. Wire MCP Tools to Hybrid Services Layer

**This is the critical step that makes Discord/MCP search actually benefit from node embeddings.**

The standalone MCP server (`apps/mcp-server-standalone/index.js`) currently hardcodes LIKE/FTS queries in the tool handlers. But a full hybrid search engine already exists in `apps/mcp-server-standalone/services/index.js` — it's just not wired up.

**File:** `apps/mcp-server-standalone/index.js`

1. **`ls_search_nodes`**: Replace hardcoded LIKE query with call to services layer. Add node vector search path (`vector_top_k` on `nodes_embedding_idx`) with LIKE fallback when no OpenAI key.
2. **`ls_search_content`**: Replace hardcoded FTS/LIKE with call to `queryKnowledgeContext()` from services layer, which already does vector + FTS + RRF fusion. Falls back to keyword search gracefully when no OpenAI key is configured.

**File:** `apps/mcp-server-standalone/services/index.js`

3. Add `nodeVectorSearch()` — new function that queries `nodes_embedding_idx` (mirrors existing `vectorSearch()` which queries `chunks_embedding_idx`).
4. Update `queryKnowledgeContext()` to include node vector results in the RRF fusion.

**Hosted MCP transport** (`app/api/[transport]/route.ts`) — same pattern: wire `ls_search_nodes` and `ls_search_content` to use the SearchService (Phase 4) instead of hardcoded queries.

**OpenAI key behavior:** When available, query embedding is generated and vector search runs. When absent, system falls back to FTS5/LIKE — no degradation of existing behavior.

**Do NOT add OpenAI key as a new requirement for the standalone MCP server.** It should remain optional — vector search is an enhancement when the key is present, not a gate.

### Files
- `src/tools/other/searchContentEmbeddings.ts` — two-phase search
- `apps/mcp-server-standalone/index.js` — wire tools to services layer
- `apps/mcp-server-standalone/services/index.js` — add `nodeVectorSearch()`, update `queryKnowledgeContext()`
- `app/api/[transport]/route.ts` — wire to SearchService

---

## Phase 6: Auto-Embed on Node Creation

### Problem

Nodes created via auto-edge extraction or cron ingestion may not get embeddings.

### Current state

The node creation API route (`app/api/nodes/route.ts`) already calls:
```typescript
autoEmbedQueue.enqueue(node.id, { reason: 'node_created' });
scheduleAutoEdgeCreation(node.id);
```

The `autoEmbedQueue` runs `embedNodeContent()` which calls `NodeEmbedder` (Stage 1: node embedding) and `UniversalEmbedder` (Stage 2: chunk embedding).

### Gap

When `autoEdge.ts` creates edges to existing entity nodes, those entity nodes may lack embeddings. They were created earlier without going through the embed queue.

### Fix

**File:** `src/services/agents/autoEdge.ts`

After creating auto-edges, enqueue matched entity nodes for embedding if they lack one:

```typescript
import { autoEmbedQueue } from '@/services/embedding/autoEmbedQueue';

// After createAutoEdges():
for (const [, entityNode] of matches) {
  if (!entityNode.embedding_updated_at) {
    autoEmbedQueue.enqueue(entityNode.id, { reason: 'auto_edge_entity' });
  }
}
```

### Files
- `src/services/agents/autoEdge.ts` — add embed queue trigger

---

## Implementation Order

| Step | What | Depends On | Risk |
|------|------|-----------|------|
| 1 | Test `CREATE INDEX` on nodes.embedding BLOB via Turso CLI | None | **Key risk** — may need column type change |
| 2 | Add index to `setup-schema.mjs` migration | Step 1 | Low |
| 3 | Run backfill script (embed orphan nodes) | Step 2 | Low (~$0.02, ~15 min) |
| 4 | Add `searchNodesByVector()` to NodeService | Steps 2+3 | Low |
| 5 | Create SearchService (two-phase) | Step 4 | Medium |
| 6 | Update searchContentEmbeddingsTool (Next.js AI chat) | Step 5 | Medium |
| 7 | Add `nodeVectorSearch()` to standalone services layer | Steps 2+3 | Low |
| 8 | Wire standalone MCP tools (`ls_search_*`) to services layer | Steps 5+7 | **Medium — this is what makes Discord search better** |
| 9 | Wire hosted MCP transport to SearchService | Steps 5+7 | Medium |
| 10 | Add auto-embed triggers to autoEdge.ts | None (parallel) | Low |

Steps 1-3 can be done immediately and independently validated.
Steps 4-6 are the core search chain (Next.js app).
Steps 7-9 are the MCP/Discord search chain — **without these, Discord search stays keyword-only.**
Step 10 prevents future orphans.

---

## Verification

1. **After backfill:** `SELECT COUNT(*) FROM nodes WHERE embedding IS NOT NULL` — should be close to total node count
2. **Vector index test:**
   ```sql
   SELECT n.title, (1.0 - vector_distance_cos(n.embedding, vector(?))) as sim
   FROM vector_top_k('nodes_embedding_idx', vector(?), 5) AS vt
   JOIN nodes n ON n.rowid = vt.id
   ```
   With a test embedding for "AI safety company" — should return Anthropic
3. **Two-phase search test:** Search for "agent frameworks" — Phase 1 should surface relevant entity nodes, Phase 2 should return transcript chunks from those nodes
4. **Coverage check:**
   ```sql
   SELECT node_type,
          SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as embedded,
          COUNT(*) as total
   FROM nodes GROUP BY node_type
   ```
   All types should show high coverage
5. **New node test:** Create a test entity node via API -> verify it gets embedded within the auto-embed queue cycle

---

## Key Files Summary

| File | Repo | Change |
|------|------|--------|
| `setup-schema.mjs` | latent-space-hub | Add `nodes_embedding_idx` vector index |
| `scripts/backfill-node-embeddings.ts` | latent-space-hub | **New** — batch backfill script (uses Turso client) |
| `src/services/database/nodes.ts` | latent-space-hub | Add `searchNodesByVector()` |
| `src/services/database/search.ts` | latent-space-hub | **New** — two-phase search orchestrator |
| `src/services/database/index.ts` | latent-space-hub | Export SearchService |
| `src/tools/other/searchContentEmbeddings.ts` | latent-space-hub | Use two-phase search |
| `apps/mcp-server-standalone/index.js` | latent-space-hub | **Wire tools to services layer** (replaces hardcoded LIKE/FTS) |
| `apps/mcp-server-standalone/services/index.js` | latent-space-hub | Add `nodeVectorSearch()`, update `queryKnowledgeContext()` |
| `app/api/[transport]/route.ts` | latent-space-hub | Wire to SearchService (same pattern as standalone) |
| `src/services/agents/autoEdge.ts` | latent-space-hub | Trigger embed queue on entity creation |
| `src/services/typescript/embed-nodes.ts` | latent-space-hub | Reference only (no changes needed) |
| `src/services/embedding/ingestion.ts` | latent-space-hub | Reference only (no changes needed) |

---

## Key Differences from RA-H (DO NOT CONFUSE)

| | Latent Space Hub (THIS project) | RA-H (SEPARATE app) |
|---|---|---|
| **Database** | Turso (cloud libSQL) | Local SQLite + vec0 extension |
| **Client** | `@libsql/client` (async) | `better-sqlite3` (sync) |
| **Vector type** | `F32_BLOB(1536)` | Plain `BLOB` + `vec_nodes` virtual table |
| **Vector search** | `vector_top_k('index', vector(?), k)` | `vec_nodes WHERE embedding MATCH ?` |
| **Node vector table** | None yet — needs `nodes_embedding_idx` | `vec_nodes` (vec0 virtual table) |
| **Chunk vector index** | `chunks_embedding_idx` (libsql_vector_idx) | `vec_chunks` (vec0 virtual table) |
| **All queries** | `async/await` | Synchronous |
| **Repo path** | `/Users/bradleymorris/Desktop/dev/latent-space-hub` | `/Users/bradleymorris/Desktop/dev/ra-h` |
