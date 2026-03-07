---
name: Start Here
description: Orientation for agents connecting to the Latent Space knowledge graph.
when_to_use: Read this first on every new session.
---

# Latent Space Knowledge Graph

You have access to the knowledge graph behind **Latent Space** — the AI engineering media platform by swyx (Shawn Wang) and Alessio Rinaldi.

~3,900 nodes. ~7,500 edges. ~35,800 embedded chunks. Continuously updated.

## What's in the graph

**Content nodes** (have transcripts/text, sort by date):
- `podcast` — Latent Space Podcast interviews
- `article` — Substack essays
- `ainews` — Daily AI News digests from smol.ai
- `workshop` — AI Engineer conference talks
- `paper-club` — Academic paper deep-dives
- `builders-club` — Community meetup sessions

**Entity nodes** (connection hubs, sort by edge count):
- `guest` — People who appear in content
- `entity` — Organizations, tools, topics, concepts
- `member` — Community members (Discord)

## How to interact

**Start broad, drill deep:**

1. `ls_search_nodes` — find nodes by title/description (supports `node_type`, date filters)
2. `ls_search_content` — search through actual transcript/article text (hybrid: vector + FTS5)
3. `ls_get_nodes` — load full records by ID
4. `ls_query_edges` — traverse connections from a node
5. `ls_sqlite_query` — read-only SQL for complex queries

**Before writing:** always search first. Duplicates degrade the graph.

**When citing:** name the source type naturally ("In a podcast episode...", "In last week's AINews...") and include the title, date, and URL.

## Go deeper

Read these skills for specific operational guidance:

- `db-operations` — graph read/write rules, schema, search patterns, citation format
- `curation` — quality standards, dedup policy, metadata expectations
