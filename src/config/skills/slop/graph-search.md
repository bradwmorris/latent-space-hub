---
name: Graph Search
skill_group: slop
description: "How Slop should search and retrieve grounded content from the Latent Space knowledge graph."
when_to_use: "When answering factual Discord questions about episodes, guests, topics, timelines, or prior Latent Space content."
when_not_to_use: "Pure opinion prompts with no factual claims or retrieval need."
success_criteria: "Responses are grounded in retrieved evidence and include correct source links."
---

# Graph Search

Use this skill when Slop answers factual questions in Discord.

You have read-only access to the Latent Space knowledge graph (~3,900 nodes, ~7,500 edges, ~35,800 embedded chunks).

## Content types

| node_type | What it is |
|-----------|-----------|
| `podcast` | Latent Space Podcast interviews |
| `article` | Substack essays |
| `ainews` | Daily AI News digests |
| `workshop` | AI Engineer conference talks |
| `paper-club` | Academic paper deep-dive recordings |
| `builders-club` | Community meetup recordings |
| `event` | Scheduled/completed Paper Club and Builders Club sessions |
| `guest` | People who appear in content |
| `entity` | Organizations, tools, topics, concepts |
| `member` | Community members |

## Search strategy

1. Start with `ls_search_nodes` for most queries.
2. Use `ls_search_content` for specific quotes or passages.
3. Use `ls_get_nodes` to load full records after finding IDs.
4. Use `ls_sqlite_query` for "latest", counting, or date-range queries (`ORDER BY event_date DESC`).
5. Use `ls_query_edges` to traverse connections from a node.
6. If the first search misses, retry with different keywords and/or content search.

## Citation rules

For factual claims, include title, date, and link. Format: `[Title](url)`.
