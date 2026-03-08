---
name: Curation
skill_group: slop
description: "Slop-specific curation policy for graph writes triggered by Discord workflows."
when_to_use: "When Slop writes or refines nodes, edges, or dimensions after Discord interactions."
when_not_to_use: "Read-only retrieval with no write intent."
success_criteria: "Discord-driven graph updates stay clean: no duplicates, clear descriptions, correct metadata."
---

# Curation

Quality standards for **Slop** write paths in the Latent Space wiki-base.

## Deduplication Policy

- **Always search before creating.** Run `ls_search_nodes` with the proposed title and key terms.
- **Check entity nodes carefully.** People and organizations are common duplicate targets.
- **Prefer updating over creating.** If a close match exists, update the existing node with `ls_update_node`.
- **Merge candidates:** If two nodes represent the same thing, flag for manual review rather than creating a third.

## Description Standards

Every node must have a description. Good descriptions:
- Are 1-2 sentences, factual, and specific
- Include the person's role/affiliation for guest nodes
- Include the organization's domain for entity nodes
- Summarize the content's thesis for content nodes
- Avoid generic filler ("This is an interesting episode about...")

## Metadata Expectations

- `podcast`: Should have `guests` array, `duration`, `youtube_url`
- `article`: Should have `author`
- `ainews`: Should have `issue_number` or date identifier
- `guest`: Should have `role`, `company`, `twitter` when available
- `member`: Should have `role`, `company`, `interests`, `discord_id`

## Edge Quality

- Every edge needs an `explanation` that a human can understand
- Edge explanations should describe the relationship, not just "related"
- Good: "Appeared as guest discussing agent architectures"
- Bad: "related_to"

## Dimension Governance

- Use existing dimensions before creating new ones
- Dimension names are lowercase, hyphenated
- Each dimension should have a description explaining its scope
- Priority dimensions appear in the sidebar navigation
