# Latent Space Hub — Documentation

A knowledge graph for the Latent Space universe — podcasts, articles, AI News, conference talks, paper clubs, and more. Searchable via hybrid vector + keyword search, connected in a graph, accessible via web UI, MCP tools, and Discord bot.

## Core Documentation

Read in this order.

| # | Doc | What it covers |
|---|-----|---------------|
| 1 | **[Overview](./overview.md)** | The system, how the two repos work together, indexing pipeline, tech stack |
| 2 | **[Ingestion](./ingestion.md)** | Content sources, hourly cron, enrichment pipeline, entity extraction, Discord notifications |
| 3 | **[Database](./database.md)** | Turso cloud SQLite, categories, full schema, edge context model, indexes, example queries |
| 4 | **[Interfaces](./interfaces.md)** | Web app, MCP server (18 tools), Discord bot (agentic tool-calling), announcements webhook |

## Developer Documentation

| Doc | What it covers |
|-----|---------------|
| [Architecture](./architecture.md) | Codebase structure, key directories, patterns |
| [Slop Bot](./slop-bot.md) | Discord bot internals — system prompt, skills, member system, scheduling, trace logging |
| [Contributing](./contributing.md) | Dev setup, git workflow, env vars |
| [Deployment](./deployment.md) | Vercel, Railway, Turso, NPM, environments |
| [Search](./search.md) | Vector search, FTS5, hybrid RRF, fallback chain |
| [Evals](./evals.md) | Discord trace logging, /evals dashboard |
| [Troubleshooting](./TROUBLESHOOTING.md) | Common issues and fixes |

## Quick Start

```bash
git clone https://github.com/bradwmorris/latent-space-hub.git
cd latent-space-hub
cp .env.example .env.local    # Add Turso URL + token, API keys
npm install
npm run dev                   # localhost:3000
```

## MCP Integration

Connect any AI agent to the knowledge graph:

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

See [Interfaces — MCP Server](./interfaces.md#2-mcp-server) for full tool reference.
