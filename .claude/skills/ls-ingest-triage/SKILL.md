---
name: ls-ingest-triage
description: Triage new source material into normalized node records, dimensions, and follow-up extraction work.
---

# LS Ingest Triage

## Use When

- User is importing podcast/article/newsletter/video content and wants fast graph-ready records.

## Workflow

1. Map source item to node fields (`title`, `description`, `link`, `node_type`, `event_date`).
2. Use `ls_search_nodes` for dedupe check.
3. Create/update node via `ls_add_node` or `ls_update_node`.
4. Assign clean dimensions (`ls_list_dimensions`, `ls_create_dimension` if missing).
5. Store long-form text into `chunk` or chunk pipeline follow-up notes.

## Rules

- Keep one canonical node per source item.
- Prefer update over duplicate create.
- Add explicit follow-up tasks when transcript/body is unavailable.
