# Latent Space Hub — Documentation

A wiki-base for the Latent Space universe — podcasts, articles, AI News, conference talks, paper clubs, and more. Searchable via hybrid vector + keyword search, connected in a graph, accessible via web UI, MCP tools, and Discord bot.

## Documentation

The source of truth for all user-facing documentation lives in `src/config/docs/` and is rendered at `/docs` in the web app.
Skills shown in the Hub and `/docs` are sourced from:
- `src/config/skills/slop/` (Slop skills)
- `src/config/skills/agents/` (general agent skills)

## Agent Start Here

For agent workflows, use this order:

1. [`AGENTS.md`](../AGENTS.md) - entrypoint map and guardrails
2. `src/config/skills/slop/start-here.md` - baseline wiki-base orientation
3. Choose a skill track:
   - Slop skills (read order): `start-here.md` -> `graph-search.md` -> `member-profiles.md` -> `db-operations.md` -> `curation.md` -> `event-scheduling.md`
   - Agent skills (read order): `agent.md` -> `mcp-quickstart.md`
4. The references in this `docs/` tree only when deeper detail is needed

| # | Doc | What it covers |
|---|-----|---------------|
| 1 | **Overview** | The system, how the two repos work together, indexing pipeline, tech stack |
| 2 | **Ingestion** | Content sources, hourly cron, enrichment pipeline, entity extraction, search indexing |
| 3 | **Database** | Turso cloud SQLite, categories, schema, edge types, metadata, example queries |
| 4 | **Interfaces** | Web app, MCP server (18 tools), Discord bot, announcements webhook |
| 5 | **Slop Bot** | Discord bot — how it works, slash commands, member system, skills, trace logging |
| 6 | **Evals** | Discord trace logging, /evals dashboard, querying traces |

## Developer Documentation

| Doc | What it covers |
|-----|---------------|
| [Contributing](./contributing.md) | Dev setup, git workflow, env vars |
| [Deployment](./development/deployment.md) | Vercel, Railway, Turso, NPM, environments |
| [Troubleshooting](./development/TROUBLESHOOTING.md) | Common issues and fixes |

PRDs, backlog, and development process docs are in `docs/development/`.

## Quick Start

```bash
git clone https://github.com/bradwmorris/latent-space-hub.git
cd latent-space-hub
cp .env.example .env.local    # Add Turso URL + token, API keys
npm install
npm run dev                   # localhost:3000
```

## MCP Integration

Connect any AI agent to the wiki-base:

```json
{
  "mcpServers": {
    "latent-space-hub": {
      "command": "npx",
      "args": ["-y", "latent-space-hub-mcp"],
      "env": {
        "TURSO_DATABASE_URL": "your-turso-url",
        "TURSO_AUTH_TOKEN": "your-turso-token"
      }
    }
  }
}
```
