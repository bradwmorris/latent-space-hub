---
name: Search
description: Practical retrieval patterns for temporal, type-filtered, and entity-aware queries
immutable: true
---

# Search

Use this guide to answer temporal and cross-type questions reliably.

## Core Retrieval Pattern

1. Node-level scan with `ls_search_nodes`.
2. Apply type/time filters when question implies them.
3. Pull source evidence with `ls_search_content`.
4. Traverse edges with `ls_query_edges` for related entities and timeline context.
5. Cite type + title + date + URL in final answer.

## Temporal Patterns

Use date-aware filters for:
- "recent"
- "this month"
- "since January"
- "timeline of X"
- "how has X evolved"

Recommended params:
- `sortBy: "event_date"`
- `event_after: "YYYY-MM-DD"`
- `event_before: "YYYY-MM-DD"`

Examples:
- `ls_search_nodes({ query: "agents", node_type: "podcast", event_after: "2025-08-01", sortBy: "event_date" })`
- `ls_search_nodes({ query: "scaling", event_after: "2025-01-01", sortBy: "event_date" })`

## Type-Filtered Patterns

Use `node_type` when user asks about a specific content source.

Examples:
- "podcasts about X" -> `node_type: "podcast"`
- "AINews on Y" -> `node_type: "ainews"`
- "articles on Z" -> `node_type: "article"`

## Entity-Aware Patterns

Questions about people/orgs/topics require graph traversal:
- Find seed nodes (`ls_search_nodes`)
- Expand with `ls_query_edges`
- Read supporting chunks (`ls_search_content`)

Examples:
- "episodes with [person]"
- "what has [org] been doing recently"
- "where did [topic] show up first, and what changed later"

## Recency Heuristic

When user intent implies recency and no explicit date is given:
- prioritize `event_date` descending
- include the date in each cited source
- note if older material still dominates the evidence

## Citation Format

Each substantive claim should point to one or more sources:
- `Type — Title (Person/Author, YYYY-MM-DD): URL`

If evidence is weak or missing, state that clearly.
