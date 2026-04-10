---
name: DB Operations
skill_group: slop
description: "Schema, search patterns, citation format, and response framing for Slop's graph queries."
when_to_use: "When answering factual questions that need graph retrieval, or when you need schema details."
when_not_to_use: "Pure opinion prompts with no factual claims or retrieval need."
success_criteria: "Responses are grounded in retrieved evidence with correct source links and natural framing."
---

# DB Operations

Schema and retrieval policy for **Slop**.

## Schema

Core tables:
- `nodes` — canonical entity records (id, title, notes, description, link, node_type, event_date, metadata, chunk)
- `node_dimensions` — many-to-many between nodes and dimensions
- `dimensions` — taxonomy definitions (name, description, icon, is_priority)
- `edges` — directed relationships (from_node_id, to_node_id, context JSON with explanation + type)
- `chunks` — retrieval text segments (node_id, text, position, embedding)

## Node Types

Content types (sort by event_date descending):
- `podcast` — Latent Space Podcast long-form interviews. Key: title, event_date, link, metadata.guests, transcript chunks.
- `article` — Latent Space Substack blog essays. Key: title, event_date, link, metadata.author, article text chunks.
- `ainews` — Daily AI News curation issues. Key: title, event_date, link, issue text chunks.
- `builders-club` — Community meetup sessions and demos. Key: title, event_date, link, transcript chunks.
- `paper-club` — Academic paper deep-dives. Key: title, event_date, link, metadata.paper_title.
- `workshop` — Conference talks and tutorials from AI Engineer events. Key: title, event_date, link, transcript chunks.
- `event` — Scheduled/completed Paper Club and Builders Club sessions. Key: event_date, metadata.event_type, metadata.event_status.

Entity types (sort by edge count descending):
- `guest` — People who appear in content. Key: title, description, edges to appearances.
- `entity` — Organizations, tools, topics, concepts. Key: title, description, edges to content nodes.
- `member` — Community members. Key: title, description, metadata (role, company, interests, avatar_url).

## Search Strategy

Three search tools, each works differently:

| Tool | How it works | Best for |
|------|-------------|----------|
| `slop_semantic_search` | Vector embeddings (meaning) | Natural language questions, conceptual queries. Default choice. |
| `slop_search_nodes` | Substring matching (SQL LIKE) | Known names, exact terms, filtering by node_type. |
| `slop_search_content` | Keyword index (FTS5) | Exact words/phrases in transcripts and articles. |

**After finding results:** `slop_get_nodes` for full records, `slop_query_edges` for connections, `slop_sqlite_query` for date filters or aggregations.

If semantic search misses, try keyword tools with specific terms. If keyword tools miss, try semantic search with a rephrased question.

### Temporal queries
Use `slop_sqlite_query` for date-aware searches:
```sql
SELECT id, title, event_date, link FROM nodes
WHERE node_type = 'podcast' AND event_date >= '2025-01-01'
ORDER BY event_date DESC LIMIT 10
```

### Entity-aware queries
Questions about people/orgs/topics require graph traversal:
1. Find seed nodes (`slop_search_nodes`)
2. Expand with `slop_query_edges`)
3. Read supporting chunks (`slop_search_content`)

## Citation Rules

When making factual claims, cite sources with:
- Content type, title, guest/author/speaker, date (event_date), URL

Format: `[Title](url)` — include type and date naturally in prose.

If the graph lacks evidence for a claim, say that explicitly.

## Response Framing

Always name the source type naturally:
- "In a podcast episode..."
- "In last week's AINews..."
- "In a Latent Space article..."

Do not flatten all sources into generic "node" references.
