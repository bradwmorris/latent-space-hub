# Database — Turso Cloud SQLite

## Infrastructure

Latent Space Hub runs on **Turso** — cloud-hosted libSQL (SQLite fork with native vector search). Single database, shared by the web app (Vercel), the MCP server, and the Discord bot.

| Detail | Value |
|--------|-------|
| Provider | Turso |
| Client | `@libsql/client` |
| Vector support | Native F32_BLOB columns + `vector_top_k()` function |
| Full-text search | FTS5 virtual tables with auto-sync triggers |
| Schema source | `setup-schema.mjs` (DDL) + `src/types/database.ts` (TypeScript types) |

## Categories

8 content categories stored as `node_type` on the `nodes` table, plus 2 internal types.

| Category | `node_type` | Description | Sort mode |
|----------|------------|-------------|-----------|
| Podcast | `podcast` | Latent Space podcast episodes | Recent (by date) |
| Guest | `guest` | People — guests, speakers, authors | Connected (by edge count) |
| Article | `article` | Substack blog posts | Recent |
| Entity | `entity` | Organizations and technical topics | Connected |
| Builders Club | `builders-club` | Meetup recordings | Recent |
| Paper Club | `paper-club` | Paper discussion sessions | Recent |
| Workshop | `workshop` | Conference talks, tutorials | Recent |
| AI News | `ainews` | AINews daily digests (smol.ai) | Recent |
| Hub | `hub` | Internal structural anchors (hidden from UI) | — |
| Member | `member` | Discord community member profiles | — |

Categories are configured in `src/config/categories.ts` with display label, Lucide icon, and sort mode.

## Schema

### `nodes`

The central table. Every piece of content, person, organization, topic, and member is a node.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing ID |
| `title` | TEXT NOT NULL | Node title |
| `notes` | TEXT | User notes / analysis |
| `description` | TEXT | One-sentence summary |
| `link` | TEXT | Source URL |
| `node_type` | TEXT | Category (see above) |
| `event_date` | TEXT | ISO 8601 date for temporal queries |
| `chunk` | TEXT | Raw source text (transcript, article body) |
| `chunk_status` | TEXT | Embedding pipeline status |
| `embedding` | BLOB | Node-level embedding |
| `embedding_vec` | F32_BLOB(1536) | Node-level vector (Turso native index) |
| `embedding_text` | TEXT | Text used to generate embedding |
| `embedding_updated_at` | TEXT | When embedding was last generated |
| `metadata` | TEXT (JSON) | Type-specific metadata (see below) |
| `created_at` | TEXT | Timestamp |
| `updated_at` | TEXT | Timestamp |

### `edges`

Directed relationships between nodes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing ID |
| `from_node_id` | INTEGER FK → nodes | Source node |
| `to_node_id` | INTEGER FK → nodes | Target node |
| `context` | TEXT (JSON) | Relationship metadata (see Edge Context) |
| `source` | TEXT | How the edge was created (`user`, `ai_similarity`, bot name) |
| `created_at` | TEXT | Timestamp |
| `updated_at` | TEXT | Timestamp |

### `chunks`

Chunked text for retrieval and semantic search.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing ID |
| `node_id` | INTEGER FK → nodes | Parent node |
| `chunk_idx` | INTEGER | Position in sequence |
| `text` | TEXT NOT NULL | Chunk text (~2000 chars) |
| `embedding` | F32_BLOB(1536) | Vector embedding |
| `embedding_type` | TEXT | Model used |
| `metadata` | TEXT (JSON) | Chunk-level metadata |
| `created_at` | TEXT | Timestamp |

### `dimensions`

Tags/categories. Many-to-many with nodes via `node_dimensions`.

| Column | Type | Description |
|--------|------|-------------|
| `name` | TEXT PK | Dimension name |
| `description` | TEXT | What this dimension covers |
| `icon` | TEXT | Visual icon identifier |
| `is_priority` | INTEGER | 1 = auto-assigned to new nodes |

### `node_dimensions`

Join table. Constraint: `UNIQUE(node_id, dimension)`.

### `chats`

Discord bot interaction traces. Every Slop interaction is logged here.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing ID |
| `chat_type` | TEXT | `'discord'` |
| `user_message` | TEXT | User input |
| `assistant_message` | TEXT | Bot response |
| `thread_id` | TEXT | Discord channel/thread ID |
| `helper_name` | TEXT | `'slop'` |
| `agent_type` | TEXT | `'discord-bot'` |
| `metadata` | TEXT (JSON) | Tool calls, timing, model, retrieval method, member ID |
| `created_at` | TEXT | Timestamp |

### `logs`

Audit/activity log for node, edge, and dimension changes.

## Edge Context Model

`edges.context` stores JSON with relationship semantics:

```typescript
interface EdgeContext {
  type: EdgeContextType;       // Relationship type
  confidence: number;          // 0–1
  explanation: string;         // Human-readable description
  created_via: string;         // 'ui' | 'agent' | 'mcp' | 'workflow'
  role?: string;               // e.g. host/guest for appeared_on
  depth?: string;              // mention / discussion / deep-dive
  valid_from?: string;         // Temporal bounds
  valid_until?: string;
}
```

### Edge Types

| Type | Direction | Example |
|------|-----------|---------|
| `created_by` | Content → Creator | Article → Author |
| `features` | Whole → Part | Episode → Guest |
| `appeared_on` | Person → Content | Guest → Episode |
| `covers_topic` | Content → Topic | Episode → "RAG" |
| `affiliated_with` | Person → Org | Researcher → OpenAI |
| `expert_in` | Person → Topic | Engineer → "agents" |
| `part_of` | Part → Whole | Talk → Conference |
| `cites` | Content → Source | Article → Paper |
| `related_to` | Any ↔ Any | General connection |
| `interested_in` | Member → Topic | User → "agents" |
| `extends` | Work → Prior work | Paper → Earlier paper |
| `supports` | Evidence → Claim | Study → Hypothesis |
| `contradicts` | Counter → Claim | Finding → Earlier claim |
| `source_of` | Derivative → Source | Summary → Original |

## Metadata by Category

Stored in `nodes.metadata` as JSON.

**Podcast / Builders Club / Paper Club / Workshop:**
```json
{ "publish_date": "2025-01-15", "series": "latent-space-podcast", "duration": "1:23:45", "video_url": "https://..." }
```

**Guest:**
```json
{ "role": "ML Engineer", "affiliations": ["OpenAI"], "expertise": ["agents", "RAG"], "twitter": "@handle" }
```

**Entity:**
```json
{ "org_type": "startup", "website": "https://...", "founded": "2023", "hq": "San Francisco" }
```

**Article:**
```json
{ "source_type": "blog", "authors": ["swyx"], "publish_date": "2025-02-01" }
```

**AINews:**
```json
{ "source_type": "newsletter", "publish_date": "2025-02-01" }
```

**Member:**
```json
{ "discord_id": "123456", "discord_handle": "user", "avatar_url": "...", "joined_at": "2025-01-01T00:00:00Z", "last_active": "...", "interaction_count": 5, "interests": ["agents", "RAG"] }
```

## Indexes

| Index | Table | Column(s) |
|-------|-------|-----------|
| `idx_nodes_updated` | nodes | `updated_at` |
| `idx_nodes_node_type` | nodes | `node_type` |
| `idx_node_dimensions_node` | node_dimensions | `node_id` |
| `idx_node_dimensions_dim` | node_dimensions | `dimension` |
| `idx_edges_from` | edges | `from_node_id` |
| `idx_edges_to` | edges | `to_node_id` |
| `idx_chunks_node` | chunks | `node_id` |
| `idx_chats_thread` | chats | `thread_id` |

### Search Indexes

- **Vector:** `libsql_vector_idx` on `chunks.embedding` — 1536d F32_BLOB, cosine metric, compressed neighbors (float8), max 20 neighbors
- **FTS5:** `chunks_fts` virtual table over `chunks.text` — auto-synced via SQL triggers on insert/update/delete

## Example Queries

### Count nodes by category
```sql
SELECT node_type, COUNT(*) as count
FROM nodes WHERE node_type IS NOT NULL
GROUP BY node_type ORDER BY count DESC;
```

### Most connected guests
```sql
SELECT n.id, n.title, COUNT(e.id) as edge_count
FROM nodes n
JOIN edges e ON e.from_node_id = n.id OR e.to_node_id = n.id
WHERE n.node_type = 'guest'
GROUP BY n.id ORDER BY edge_count DESC LIMIT 20;
```

### Recent podcast episodes
```sql
SELECT id, title, event_date, description
FROM nodes WHERE node_type = 'podcast'
ORDER BY event_date DESC LIMIT 10;
```

### Edges for a specific node
```sql
SELECT e.id, e.context, src.title as from_title, tgt.title as to_title
FROM edges e
JOIN nodes src ON src.id = e.from_node_id
JOIN nodes tgt ON tgt.id = e.to_node_id
WHERE e.from_node_id = 42 OR e.to_node_id = 42;
```
