---
title: Database
description: Turso cloud SQLite — schema, categories, edge types, and search indexes.
---

# Turso

Cloud-hosted libSQL (SQLite fork) with native vector search. Single database shared by the web app, bot, and MCP server.

| Detail | Value |
|--------|-------|
| Provider | Turso |
| Client | `@libsql/client` |
| Vector | Native F32_BLOB columns + `vector_top_k()` |
| Full-text | FTS5 virtual tables with auto-sync triggers |

# Categories

11 node types stored as `node_type` on the `nodes` table.

| Category | `node_type` | Description | Sort |
|----------|------------|-------------|------|
| Podcast | `podcast` | Latent Space episodes with full transcripts | Recent |
| Article | `article` | latent.space Substack posts | Recent |
| AI News | `ainews` | Daily AINews digests from smol.ai | Recent |
| Builders Club | `builders-club` | Community meetup recordings | Recent |
| Paper Club | `paper-club` | Deep-dive paper discussions | Recent |
| Workshop | `workshop` | Conference talks, tutorials | Recent |
| Event | `event` | Scheduled community events (paper club, builders club sessions) | Recent |
| Guest | `guest` | People — guests, speakers, authors | Most connected |
| Entity | `entity` | Organizations and technical topics | Most connected |
| Hub | `hub` | Internal structural anchors (hidden) | — |
| Member | `member` | Discord community member profiles | — |

# Schema

![Schema Diagram](/images/docs/schema-diagram.svg)

### nodes

The central table. Every piece of content, person, organization, and topic.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-incrementing |
| `title` | TEXT NOT NULL | Node title |
| `description` | TEXT | One-sentence summary |
| `link` | TEXT | Source URL |
| `node_type` | TEXT | Category |
| `event_date` | TEXT | ISO 8601 date |
| `chunk` | TEXT | Raw source text |
| `embedding` | F32_BLOB(1536) | Node-level vector |
| `metadata` | JSON | Type-specific metadata |
| `notes` | TEXT | User notes / analysis |

### chunks

Chunked text for semantic search.

| Column | Type | Description |
|--------|------|-------------|
| `node_id` | INTEGER FK | Parent node |
| `chunk_idx` | INTEGER | Position in sequence |
| `text` | TEXT NOT NULL | ~2000 chars |
| `embedding` | F32_BLOB(1536) | Vector embedding |

### edges

Directed relationships between nodes.

| Column | Type | Description |
|--------|------|-------------|
| `from_node_id` | INTEGER FK | Source node |
| `to_node_id` | INTEGER FK | Target node |
| `context` | JSON | Type, confidence, explanation |
| `source` | TEXT | How edge was created |

### dimensions

Tags/categories. Many-to-many with nodes via `node_dimensions` join table.

### chats

Discord bot interaction traces. Full MCP tool call logs, timing, Discord context.

# Edge Context Model

`edges.context` stores JSON with relationship semantics:

```typescript
interface EdgeContext {
  type: EdgeContextType;       // Relationship type (see table below)
  confidence: number;          // 0–1
  explanation: string;         // Human-readable description
  created_via: string;         // 'ui' | 'agent' | 'mcp' | 'workflow'
  role?: string;               // e.g. host/guest for appeared_on
  depth?: string;              // mention / discussion / deep-dive
  valid_from?: string;         // Temporal bounds
  valid_until?: string;
}
```

# Edge Types

14 relationship types stored in `edges.context`:

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
| `extends` | Work → Prior | Paper → Earlier paper |
| `supports` | Evidence → Claim | Study → Hypothesis |
| `contradicts` | Counter → Claim | Finding → Earlier claim |
| `source_of` | Derivative → Source | Summary → Original |

# Indexes

### B-tree

`node_type`, `event_date`, `updated_at`, `from_node_id`, `to_node_id`, `node_id` (chunks), `thread_id` (chats)

### Vector

`libsql_vector_idx` on `chunks.embedding` — 1536d, cosine metric, compressed neighbors (float8), max 20 neighbors

### Full-text

`chunks_fts` virtual table on `chunks.text` — auto-synced via SQL triggers on insert/update/delete

# Metadata by Category

Stored in `nodes.metadata` as JSON. Each category has its own shape.

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

# Example Queries

```sql
-- Count nodes by category
SELECT node_type, COUNT(*) as count
FROM nodes WHERE node_type IS NOT NULL
GROUP BY node_type ORDER BY count DESC;

-- Most connected guests
SELECT n.id, n.title, COUNT(e.id) as edge_count
FROM nodes n
JOIN edges e ON e.from_node_id = n.id OR e.to_node_id = n.id
WHERE n.node_type = 'guest'
GROUP BY n.id ORDER BY edge_count DESC LIMIT 20;

-- Recent podcast episodes
SELECT id, title, event_date, description
FROM nodes WHERE node_type = 'podcast'
ORDER BY event_date DESC LIMIT 10;

-- Edges for a specific node
SELECT e.id, e.context, src.title as from_title, tgt.title as to_title
FROM edges e
JOIN nodes src ON src.id = e.from_node_id
JOIN nodes tgt ON tgt.id = e.to_node_id
WHERE e.from_node_id = 42 OR e.to_node_id = 42;
```
