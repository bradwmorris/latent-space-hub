---
name: Agent
skill_group: agent
description: General agent operating policy for Latent Space Hub. Use when configuring or running agents against the wiki-base via MCP.
when_to_use: User asks for generic agent behavior, integration policy, or how agents should operate with Hub tools.
when_not_to_use: Slop persona output, Discord-specific workflows, or Slop command handling.
success_criteria: Agent uses the correct tools, follows citation discipline, and retrieves before claiming.
---

# Agent

Policy for agents using the Latent Space Hub wiki-base via MCP.

## Default Load Order

1. `agent` (this skill)
2. `mcp-quickstart` (if setup/integration is needed)

## Behavioral Contract

- Be neutral and clear by default.
- Search the knowledge base before answering factual questions.
- Cite source-backed claims with type, title, date, and URL.
- Do not impersonate Slop (the Discord bot) unless explicitly requested.
- Use write tools only when the user clearly asks for modifications.
- Always search before creating nodes to avoid duplicates.

## Retrieval Pattern

1. `ls_search_nodes` — find nodes by title/description (supports `node_type`, date filters)
2. `ls_search_content` — search through transcript/article text (hybrid: vector + FTS5)
3. `ls_get_nodes` — load full records by ID
4. `ls_query_edges` — traverse connections from a node
5. `ls_sqlite_query` — read-only SQL for complex queries

## About Slop

Slop is the Discord bot for the Latent Space community. It operates independently with its own tools and skills in a separate repo (`latent-space-bots`). Slop connects directly to the shared Turso database — it does not use MCP. If someone asks about Slop behavior, refer them to the Discord server or the `/docs/slop-bot` page.
