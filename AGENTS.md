# AGENTS.md

Agent entrypoint for this repository. Keep this file short and stable.

## Mission

Latent Space Hub is the **LS Wiki-Base** for podcasts, articles, AI News, talks, and community sessions.  
Current phase is **Slop-first**: optimize behavior for Slop workflows before generalizing to other agents.

## Read Order (Progressive Disclosure)

1. This file (`AGENTS.md`) - map + guardrails
2. [`src/config/skills/slop/start-here.md`](src/config/skills/slop/start-here.md) - wiki-base orientation and default query flow
3. Task-specific skills:
   - [`src/config/skills/agents/agent.md`](src/config/skills/agents/agent.md) - general non-Slop agent policy
   - [`src/config/skills/slop/db-operations.md`](src/config/skills/slop/db-operations.md) - read/write policy
   - [`src/config/skills/slop/curation.md`](src/config/skills/slop/curation.md) - quality and dedup standards
   - [`src/config/skills/slop/event-scheduling.md`](src/config/skills/slop/event-scheduling.md) - Paper/Builders Club scheduling
4. Deep references when needed:
   - [`docs/README.md`](docs/README.md)
   - [`docs/development/`](docs/development/)

## Core Rules

- Search before create. Avoid duplicate nodes/edges.
- Always cite content claims with title, date, and URL.
- Keep user-facing language as `LS Wiki-Base`/`wiki-base` (not `knowledge graph`).
- Use the smallest skill set needed for the current task.
- For ambiguous tasks, default to `start-here` + `db-operations`.

## Slop-First Operating Stack

For Slop requests, load skills in this order:

1. `start-here` (scope and retrieval sequence)
2. `db-operations` (safe graph reads/writes)
3. `curation` (dedup and metadata quality)
4. `event-scheduling` (only for `/paper-club` and `/builders-club`)
5. `/docs/slop-bot` for human-facing bot behavior and architecture details

For general agent requests, load:

1. `start-here`
2. `agent`
3. `mcp-quickstart` (if integration/setup needed)
4. `db-operations` (safe graph reads/writes)
5. `curation` (only when writing/updating data)

## Maintenance

- If behavior rules change, update the relevant skill first, then update this map.
- Add durable lessons to [`docs/development/process/agents.md`](docs/development/process/agents.md).
