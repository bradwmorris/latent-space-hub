# Database Schema

Latent Space Hub uses **Turso** (cloud-hosted libSQL/SQLite) via `@libsql/client`.

Primary schema source of truth:
- `setup-schema.mjs` — DDL statements
- `src/types/database.ts` — TypeScript definitions

## Core Tables

### `nodes`

The central table. Every piece of content, person, organization, and topic is a node.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing ID |
| `title` | TEXT NOT NULL | Node title |
| `notes` | TEXT | User notes / analysis (was `content` in legacy schema) |
| `description` | TEXT | One-sentence summary |
| `link` | TEXT | Source URL |
| `node_type` | TEXT | Category — see [Categories](./categories.md) |
| `event_date` | TEXT | ISO 8601 date for temporal queries |
| `chunk` | TEXT | Raw source text |
| `chunk_status` | TEXT | Embedding pipeline status |
| `embedding` | BLOB | Node-level embedding (F32_BLOB) |
| `embedding_text` | TEXT | Text used to generate embedding |
| `embedding_updated_at` | TEXT | When embedding was last generated |
| `metadata` | TEXT (JSON) | Type-specific metadata (see below) |
| `created_at` | TEXT | Timestamp |
| `updated_at` | TEXT | Timestamp |

**`node_type` values (8 categories + hub):**

| Value | What it represents |
|-------|-------------------|
| `podcast` | Latent Space podcast episodes |
| `guest` | People (guests, speakers, authors) |
| `article` | Substack blog posts |
| `entity` | Organizations and technical topics |
| `builders-club` | Meetup recordings |
| `paper-club` | Paper club sessions |
| `workshop` | Conference talks and tutorials |
| `ainews` | AINews daily digests |
| `hub` | Internal structural anchor nodes (hidden from UI) |

### `dimensions`

Tags/categories for organizing nodes. Many-to-many with nodes.

| Column | Type | Description |
|--------|------|-------------|
| `name` | TEXT PK | Dimension name |
| `description` | TEXT | What this dimension covers |
| `icon` | TEXT | Visual icon identifier |
| `is_priority` | INTEGER | 1 = auto-assigned to new nodes |
| `created_at` | TEXT | Timestamp |
| `updated_at` | TEXT | Timestamp |

### `node_dimensions`

Join table between nodes and dimensions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing ID |
| `node_id` | INTEGER FK → nodes | Node reference |
| `dimension` | TEXT | Dimension name |
| `created_at` | TEXT | Timestamp |

Constraint: `UNIQUE(node_id, dimension)`

### `edges`

Directed relationships between nodes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing ID |
| `from_node_id` | INTEGER FK → nodes | Source node |
| `to_node_id` | INTEGER FK → nodes | Target node |
| `context` | TEXT (JSON) | Relationship metadata (see Edge Context) |
| `source` | TEXT | How the edge was created (`user`, `ai_similarity`, helper name) |
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
| `embedding` | BLOB | Vector embedding (F32_BLOB, 1536d) |
| `embedding_type` | TEXT | Model used for embedding |
| `metadata` | TEXT (JSON) | Chunk-level metadata |
| `created_at` | TEXT | Timestamp |

### `chats`

Conversation logs.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing ID |
| `chat_type` | TEXT | Type of conversation |
| `user_message` | TEXT | User's input |
| `assistant_message` | TEXT | AI response |
| `thread_id` | TEXT | Conversation thread identifier |
| `focused_node_id` | INTEGER | Node being discussed |
| `helper_name` | TEXT | Which agent handled the chat |
| `agent_type` | TEXT | Agent classification |
| `metadata` | TEXT (JSON) | Cost, tokens, tools used |
| `created_at` | TEXT | Timestamp |

### `logs`

Audit/activity logs.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing ID |
| `ts` | TEXT | Timestamp |
| `table_name` | TEXT | Which table was affected |
| `action` | TEXT | What happened (INSERT, UPDATE, etc.) |
| `row_id` | INTEGER | ID of the affected row |
| `summary` | TEXT | Human-readable summary |
| `snapshot_json` | TEXT | Full row snapshot |
| `enriched_summary` | TEXT | AI-enriched summary |

## Edge Context Model

`edges.context` stores JSON with relationship semantics:

```typescript
interface EdgeContext {
  type: EdgeContextType;       // Relationship type (see below)
  confidence: number;          // 0-1
  explanation: string;         // Human-readable description
  created_via: EdgeCreatedVia; // 'ui' | 'agent' | 'mcp' | 'workflow'
  role?: string;               // e.g. host/guest for appeared_on
  depth?: string;              // e.g. mention/discussion/deep-dive
  valid_from?: string;         // Temporal start
  valid_until?: string;        // Temporal end
}
```

**Edge relationship types:**

| Type | Meaning | Example |
|------|---------|---------|
| `created_by` | Content → Creator | Article → Author |
| `features` | Whole → Part | Episode → Guest |
| `appeared_on` | Person → Content | Guest → Episode |
| `covers_topic` | Content → Topic | Episode → "RAG" |
| `affiliated_with` | Person → Organization | Researcher → OpenAI |
| `expert_in` | Person → Topic | Engineer → "agents" |
| `part_of` | Part → Whole | Talk → Conference |
| `cites` | Content → Source | Article → Paper |
| `related_to` | General connection | Any ↔ Any |
| `interested_in` | Subscriber → Interest | User → Topic |
| `extends` | Builds on prior work | Paper → Earlier paper |
| `supports` | Evidence for a claim | Study → Hypothesis |
| `contradicts` | Counter-evidence | Finding → Earlier claim |
| `source_of` | Derivative → Source | Summary → Original |

## Metadata by Category

Stored in `nodes.metadata` as JSON. Validated at the application layer.

**Podcast / Builders Club / Paper Club / Workshop:**
```json
{ "publish_date": "2025-01-15", "series": "latent-space-podcast", "duration": "1:23:45", "video_url": "https://..." }
```

**Guest:**
```json
{ "role": "ML Engineer", "affiliations": ["OpenAI"], "expertise": ["agents", "RAG"], "twitter": "@handle" }
```

**Entity (organization):**
```json
{ "org_type": "startup", "website": "https://...", "founded": "2023", "hq": "San Francisco" }
```

**Article:**
```json
{ "source_type": "blog", "authors": ["swyx"], "publish_date": "2025-02-01" }
```

**AI News:**
```json
{ "source_type": "newsletter", "publish_date": "2025-02-01" }
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
| `idx_logs_table` | logs | `table_name` |

**Search indexes:**
- **Vector:** `libsql_vector_idx` on `chunks.embedding` (1536d F32_BLOB)
- **FTS5:** `chunks_fts` virtual table over `chunks.text`

## Example Queries

### Count nodes by category
```sql
SELECT node_type, COUNT(*) as count
FROM nodes
WHERE node_type IS NOT NULL
GROUP BY node_type
ORDER BY count DESC;
```

### Find most connected guests
```sql
SELECT n.id, n.title, COUNT(e.id) as edge_count
FROM nodes n
JOIN edges e ON e.from_node_id = n.id OR e.to_node_id = n.id
WHERE n.node_type = 'guest'
GROUP BY n.id
ORDER BY edge_count DESC
LIMIT 20;
```

### Recent podcast episodes
```sql
SELECT id, title, event_date, description
FROM nodes
WHERE node_type = 'podcast'
ORDER BY event_date DESC
LIMIT 10;
```

### Nodes with a specific dimension
```sql
SELECT n.id, n.title, n.node_type
FROM nodes n
JOIN node_dimensions nd ON nd.node_id = n.id
WHERE nd.dimension = 'agents'
ORDER BY n.updated_at DESC;
```

### Edges for a specific node
```sql
SELECT e.id, e.context,
  src.title as from_title,
  tgt.title as to_title
FROM edges e
JOIN nodes src ON src.id = e.from_node_id
JOIN nodes tgt ON tgt.id = e.to_node_id
WHERE e.from_node_id = 42 OR e.to_node_id = 42;
```
