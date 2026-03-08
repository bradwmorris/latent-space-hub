---
name: DB Operations
skill_group: slop
description: "Slop-specific graph read/write policy for Discord interactions."
when_to_use: "When Slop needs to read or update wiki-base data while answering Discord mentions, thread replies, or slash-command workflows."
when_not_to_use: "General agent setup tasks or non-Slop assistants."
success_criteria: "Slop retrieval is accurate and write operations are explicit, deduplicated, and consistent with Discord bot workflows."
---

# DB Operations

DB policy for **Slop**. Use this when Slop is retrieving or mutating wiki-base data during Discord conversations.

## Core Rules

1. **Search before create.** Always run `ls_search_nodes` before `ls_add_node`. Duplicates degrade the graph.
2. **Descriptions are mandatory.** Every node needs a concise, informative description (1-2 sentences).
3. **Dimensions are required.** At least 1, max 5 per node. Use existing dimensions when possible.
4. **Edge explanations matter.** Every edge needs a human-readable `explanation` field.
5. **Use `ls_sqlite_query` for read-only inspection** — SELECT/WITH/PRAGMA only.
6. **Discord-first framing.** Query results must be transformed into concise thread-friendly responses with source links.

## Schema

Core tables:
- `nodes` — canonical entity records (id, title, notes, description, link, node_type, event_date, metadata, chunk)
- `node_dimensions` — many-to-many between nodes and dimensions
- `dimensions` — taxonomy definitions (name, description, icon, is_priority)
- `edges` — directed relationships (from_node_id, to_node_id, context JSON with explanation + type)
- `chunks` — retrieval text segments (node_id, content, position, embedding)

## Node Types

Content types (sort by event_date descending):
- `podcast` — Latent Space Podcast long-form interviews. Key: title, event_date, link, metadata.guests, transcript chunks.
- `article` — Latent Space Substack blog essays. Key: title, event_date, link, metadata.author, article text chunks.
- `ainews` — Daily AI News curation issues. Key: title, event_date, link, issue text chunks.
- `builders-club` — Community meetup sessions and demos. Key: title, event_date, link, transcript chunks.
- `paper-club` — Academic paper deep-dives. Key: title, event_date, link, metadata.paper_title.
- `workshop` — Conference talks and tutorials from AI Engineer events. Key: title, event_date, link, transcript chunks.

Entity types (sort by edge count descending):
- `guest` — People who appear in content. Key: title, description, edges to appearances.
- `entity` — Organizations, tools, topics, concepts. Key: title, description, edges to content nodes.
- `member` — Community members. Key: title, description, metadata (role, company, interests, avatar_url).

## Search Patterns

### Core retrieval pattern
1. Node-level scan with `ls_search_nodes` (title/description/notes matching).
2. Apply type/time filters when question implies them.
3. Pull source evidence with `ls_search_content` (chunk-level text).
4. Traverse edges with `ls_query_edges` for related entities and timeline context.
5. Cite type + title + date + URL in final answer.

### Temporal queries
Use date-aware filters for "recent", "this month", "since January", "timeline of X":
- `sortBy: "event_date"`
- `event_after: "YYYY-MM-DD"`
- `event_before: "YYYY-MM-DD"`

### Type-filtered queries
Use `node_type` when user asks about a specific content source:
- "podcasts about X" → `node_type: "podcast"`
- "AINews on Y" → `node_type: "ainews"`

### Entity-aware queries
Questions about people/orgs/topics require graph traversal:
1. Find seed nodes (`ls_search_nodes`)
2. Expand with `ls_query_edges`
3. Read supporting chunks (`ls_search_content`)

## Citation Rules

When making factual claims, cite sources with:
- Content type, title, guest/author/speaker, date (event_date), URL

Format: `Type — "Title" (Person, YYYY-MM-DD): URL`

If the graph lacks evidence for a claim, say that explicitly.

## Response Framing

Always name the source type naturally:
- "In a podcast episode..."
- "In last week's AINews..."
- "In a Latent Space article..."

Do not flatten all sources into generic "node" references.
