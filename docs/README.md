# Latent Space Hub — Documentation

## What is this?

A knowledge graph for the Latent Space universe — podcasts, articles, AI News, conference talks, paper clubs, and more. Searchable via semantic vector search, connected in a graph, accessible via web UI, MCP tools, and Discord bots.

## Documentation

### Core

| Doc | Description |
|-----|-------------|
| [Overview](./overview.md) | What LS Hub is, how it works, three interfaces, tech stack |
| [Categories](./categories.md) | The 8 content categories and how they map to the database |
| [Schema](./schema.md) | Database tables, relationships, edge model, example queries |

### Systems

| Doc | Description |
|-----|-------------|
| [MCP Server](./mcp-server.md) | External agent setup, all tools, example workflows |
| [Bots](./bots.md) | Sig & Slop — Discord bot architecture and commands |
| [Ingestion](./ingestion.md) | Content pipeline, sources, extractors, Quick Add |
| [Search](./search.md) | Vector, FTS5, hybrid search, fallback chain |

### Developer

| Doc | Description |
|-----|-------------|
| [Architecture](./architecture.md) | Codebase map, key directories, patterns |
| [Contributing](./contributing.md) | Dev setup, git workflow, backlog, env vars |
| [Deployment](./deployment.md) | Vercel, environments, readonly mode |
| [Troubleshooting](./TROUBLESHOOTING.md) | Common issues and fixes |

### Development Workflow

| Doc | Description |
|-----|-------------|
| [Backlog](./development/backlog.json) | Priority queue of projects |
| [Process](./development/process.md) | How work gets done |
| PRDs | `docs/development/prd-*.md` — feature specs |

## Quick Start

```bash
git clone https://github.com/bradwmorris/latent-space-hub.git
cd latent-space-hub
cp .env.example .env.local    # Add Turso URL + token, API keys
npm install
npm run dev                   # localhost:3000
```

## MCP Integration

Connect your AI agent to the knowledge graph:

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

See [MCP Server docs](./mcp-server.md) for full setup and tool reference.
