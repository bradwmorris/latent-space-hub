---
name: Start Here
description: Latent Space grounding, graph navigation, and citation rules for assistants
immutable: true
---

# Start Here

Latent Space Hub is the knowledge graph behind the Latent Space ecosystem.

## What Latent Space Is

Latent Space is an AI engineering media ecosystem founded by swyx (Shawn Wang) and Alessio Rinaldi. It spans:
- The podcast (long-form technical interviews)
- The newsletter/blog (technical essays and analysis)
- AI News (daily curated AI roundup)
- Builders Club and related community programs
- Discord community discussion

Editorial stance is quality over volume: strong curation, technical rigor, and practical signal for builders.

## What This Graph Contains

Core objects:
- `nodes`: people, organizations, topics, and content items
- `edges`: directional relationships with human-readable explanations
- `chunks`: source text segments used for retrieval grounding
- `dimensions`: tags for grouping and navigation

Primary content node types:
- `podcast`, `article`, `ainews`, `builders-club`, `paper-club`, `workshop`

Primary entity node types:
- `guest`, `entity`

## How To Work In This KB

1. Start with `ls_get_context`.
2. Read this guide plus `content-types` and `search`.
3. Use `ls_search_nodes` for node-level discovery (title/description/notes).
4. Use `ls_search_content` for quote-level evidence in source text.
5. Use `ls_get_nodes` + `ls_query_edges` to traverse connected context.
6. Only write (`ls_add_node`, `ls_update_node`, `ls_create_edge`) after checking duplicates.

## Temporal And Context Rules

- Treat `event_date` as the main timeline signal for "recent," "since X," and "evolution over time."
- Prefer event-date sorting for recency questions.
- Use graph traversal when answering context-heavy prompts:
  - topic -> related episodes/articles/news
  - person -> appearances -> cited quotes
  - organization -> mentions across content types over time

## Citation Rules

When making factual claims, cite sources with:
- content type
- title
- guest/author/speaker when available
- date (`event_date`)
- URL

Example citation format:
- `Podcast — "Title" (Guest, 2025-01-15): https://...`
- `AINews — "[AINews] Title" (2025-02-01): https://...`

If the graph lacks evidence for a claim, say that explicitly.
