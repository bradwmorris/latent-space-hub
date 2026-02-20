---
name: ls-curation
description: Curate the LS graph by creating/updating nodes, dimensions, and edges with strict quality and dedupe checks.
---

# LS Curation

## Use When

- User wants to add new knowledge or clean up existing graph data.

## Workflow

1. `ls_search_nodes` to detect duplicates before any write.
2. If node exists, use `ls_update_node`; otherwise use `ls_add_node`.
3. Ensure dimensions exist (`ls_list_dimensions`, `ls_create_dimension` as needed).
4. Create explicit relationships with `ls_create_edge` and human-readable explanation.
5. Validate impact with `ls_get_nodes` and `ls_query_edges`.

## Quality Bar

- Titles are specific and stable.
- Descriptions explain what and why.
- Dimensions are constrained (1-5, no synonyms in parallel).
- Edge explanations read as a sentence from source to target.
