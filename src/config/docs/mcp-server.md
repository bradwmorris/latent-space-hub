---
title: MCP Server
description: How external agents interact with the wiki-base via the Model Context Protocol — read-only by default.
---

# The Idea

Every community, product, and service will eventually have an externalised knowledge base that agents can query. The MCP server is how external agents — Claude Code, Cursor, Windsurf, or any MCP-compatible client — interact with the Latent Space wiki-base programmatically.

Instead of humans reading docs or searching a website, their agents connect to the knowledge graph directly, search it, and bring back what's relevant.

# Architecture

The standalone MCP server (`apps/mcp-server-standalone/`) connects directly to Turso via `@libsql/client`. It runs as a stdio process — the MCP client spawns it as a subprocess.

```
AI Agent (Claude Code / Cursor / Windsurf)
    ↓ stdio
latent-space-hub-mcp (Node.js process)
    ↓ libsql
Turso cloud SQLite
```

Published to NPM as [`latent-space-hub-mcp`](https://www.npmjs.com/package/latent-space-hub-mcp).

# Quick Start

Add to your Claude Code, Cursor, or Windsurf MCP config:

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

# Security

**The MCP server is read-only by default.** External agents can search and read the wiki-base but cannot create, update, or delete anything.

Write tools (node creation, edge creation, dimension management) are only registered when `MCP_ALLOW_WRITES=true` is explicitly set. This is intended for trusted internal use only — not for public-facing agent access.

| Variable | Description | Default |
|----------|-------------|---------|
| `TURSO_DATABASE_URL` | Turso database URL (required) | — |
| `TURSO_AUTH_TOKEN` | Turso auth token (required) | — |
| `MCP_ALLOW_WRITES` | Enable write tools | `false` |
| `OPENAI_API_KEY` | Enables vector search in `ls_search_nodes` | — |
| `LSH_SKILLS_DIR` | Custom skills directory | `~/.latent-space-hub/skills/` |

The Turso credentials are the primary security boundary. Do not share them publicly.

# Read Tools (Always Available)

| Tool | Description |
|------|-------------|
| `ls_get_context` | Graph overview — stats, top nodes, dimensions, available skills |
| `ls_search_nodes` | Hybrid search across nodes by title/description. Supports `node_type`, date range, and dimension filters |
| `ls_search_content` | Full-text + vector search through source material (transcripts, articles). Hybrid RRF fusion |
| `ls_get_nodes` | Load full node records by ID (up to 10 per call) |
| `ls_query_edges` | Find all connections for a specific node |
| `ls_list_dimensions` | List all dimensions/tags with node counts |
| `ls_sqlite_query` | Run read-only SQL — `SELECT`, `WITH`, `PRAGMA` only |
| `ls_list_skills` | List system and custom skills |
| `ls_read_skill` | Read a skill by name |

# Write Tools (Requires `MCP_ALLOW_WRITES=true`)

| Tool | Description |
|------|-------------|
| `ls_add_node` | Create a new node (title + dimensions required) |
| `ls_update_node` | Update a node — content **appends** to notes, dimensions **replace** |
| `ls_create_edge` | Connect two nodes with a directional relationship and explanation |
| `ls_update_edge` | Update an edge's explanation |
| `ls_create_dimension` | Create a new dimension/tag |
| `ls_update_dimension` | Rename or update a dimension |
| `ls_delete_dimension` | Delete a dimension and remove from all nodes |
| `ls_write_skill` | Create or update a custom skill |
| `ls_delete_skill` | Delete a custom skill |

# Setup Options

| Option | Config | Notes |
|--------|--------|-------|
| NPX (standalone) | `"command": "npx", "args": ["-y", "latent-space-hub-mcp"]` | No local repo needed. Connects directly to Turso. Read-only by default. |
| Local stdio | `"command": "node", "args": ["path/to/apps/mcp-server/stdio-server.js"]` | Requires hub running (`npm run dev`). Proxies to Next.js API. |
| HTTP transport | `"url": "http://127.0.0.1:44145/mcp"` | For agents supporting HTTP MCP transport. |

# Slop Does Not Use MCP

The Discord bot (Slop) used to connect via MCP but has been decoupled. Slop now queries Turso directly with its own internal tools (`slop_*` prefix) in the `latent-space-bots` repo. The MCP server is exclusively for external agent access.
