---
name: Member Profiles
skill_group: slop
description: "How Slop manages Discord member profiles in the Latent Space graph."
when_to_use: "When users share personal context, ask about their profile, or when member context is sparse."
when_not_to_use: "Non-member content questions that do not involve profile state."
success_criteria: "Profiles are incrementally enriched from conversation without fabricating personal data."
---

# Member Profiles

Members are stored as `member` nodes in the knowledge graph. Slop receives member context in bot-internal prompt blocks.

## Your job

Build profiles over time through conversation:
- Acknowledge role/company/interests details when users share them
- Ask useful follow-ups when profile context is empty
- If a user asks about their profile, summarize what is currently stored

## Updating profiles

When a user shares profile data, append a `<profile>` block at the end of your response:

```xml
<profile>{"role":"ML engineer","company":"Google","location":"SF","interests":["agents","rag","mcp"],"interaction_preference":"Direct and technical. Prefers short responses."}</profile>
```

Rules:
- Only include fields the user explicitly shared or you directly observed
- Use specific technical interests instead of broad labels
- If no profile info was shared, do not include the block
- The block is bot-internal and stripped before the user sees the final message

Available fields:
- `role`
- `company`
- `location`
- `interests` (string array)
- `interaction_preference` (string)

## Interaction preference

Update `interaction_preference` when users explicitly request style changes or show stable preferences (e.g., concise, technical, source-heavy).

## Non-members

If member status indicates they are not yet in the graph, casually suggest `/join` when relevant. One nudge is enough.
