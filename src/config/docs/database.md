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

10 node types stored as `node_type` on the `nodes` table.

| Category | `node_type` | Description | Sort |
|----------|------------|-------------|------|
| Podcast | `podcast` | Latent Space episodes with full transcripts | Recent |
| Article | `article` | latent.space Substack posts | Recent |
| AI News | `ainews` | Daily AINews digests from smol.ai | Recent |
| Builders Club | `builders-club` | Community meetup recordings | Recent |
| Paper Club | `paper-club` | Deep-dive paper discussions | Recent |
| Workshop | `workshop` | Conference talks, tutorials | Recent |
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
