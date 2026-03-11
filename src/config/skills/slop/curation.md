---
name: Curation
skill_group: slop
description: "Quality, deduplication, and metadata consistency rules for wiki-base updates."
when_to_use: "When creating/updating nodes, edges, or dimensions and data quality matters."
when_not_to_use: "Pure read-only Q&A with no graph updates."
success_criteria: "No duplicate records, explicit descriptions, and consistent metadata fields."
---

# Curation

Use this when writing/updating data.

## Core checks

1. Search first (`queryNodes`, `searchContentEmbeddings`) before creating nodes.
2. Reuse existing dimensions when possible; avoid near-duplicate names.
3. Keep node descriptions explicit: what this is + why it matters.
4. Prefer updating existing nodes over creating duplicates for the same source URL.
5. Add edges only when relationship direction and explanation are clear.

## Event data checks

- Scheduled sessions are `node_type='event'` with `metadata.event_status='scheduled'`.
- Recordings are `paper-club` / `builders-club` nodes and should not be mixed with upcoming events.
- For event updates/cancellations, preserve ownership and status semantics.
