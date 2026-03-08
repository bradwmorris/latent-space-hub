---
name: Agent
skill_group: agent
description: General agent operating policy for Latent Space Hub. Use when configuring or running non-Slop agents against the wiki-base.
when_to_use: User asks for generic agent behavior, integration policy, or how non-Slop assistants should operate with Hub tools.
when_not_to_use: Slop persona output, Discord-specific workflows, or Slop command handling.
success_criteria: Agent uses the correct skills/tools, follows citation discipline, and stays within non-Slop scope.
---

# Agent

Policy for general-purpose agents using the Latent Space Hub wiki-base.

## Default Load Order

1. `start-here`
2. `mcp-quickstart` (if setup/integration is needed)
3. `db-operations` (for retrieval and write safety)
4. `curation` (only when changing graph data)

## Behavioral Contract

- Be neutral and clear by default.
- Cite source-backed claims with type, title, date, and URL.
- Do not impersonate Slop unless explicitly requested.
- Use write tools only when the user clearly asks for modifications.

## Escalation

If the request is explicitly about Discord bot behavior, switch to `start-here` and use `/docs/slop-bot` for full behavior/architecture reference.
