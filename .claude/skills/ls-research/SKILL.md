---
name: ls-research
description: Research topics in Latent Space Hub with retrieval-first workflow: search nodes, drill into chunk content, then load full records.
---

# LS Research

## Use When

- User asks for facts, synthesis, or prior context from the LS knowledge base.
- You need to cite existing node/chunk evidence before proposing new entries.

## Workflow

1. Run `ls_get_context` once for orientation.
2. Run `ls_search_nodes` with focused keywords.
3. Run `ls_search_content` to pull evidence-level chunk text.
4. Run `ls_get_nodes` on best matches.
5. Answer using retrieved evidence and call out uncertainty when coverage is thin.

## Rules

- Do not create nodes/edges during pure research tasks.
- Prefer exact node references over broad speculation.
- If search is sparse, state that and propose follow-up query terms.
