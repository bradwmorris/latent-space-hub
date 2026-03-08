---
title: Interfaces
description: Four surfaces for interacting with the knowledge graph — web app, MCP server, Discord bot, and announcements webhook.
---

# Web App

Next.js 15 app deployed on Vercel. The primary interface for browsing and managing the graph.

## Dashboard

![Dashboard](/images/docs/dashboard.png)

Landing page with stats and 8 category cards. Each card shows node count and 3 preview items — content sorted by most recent, entities by most connected.

## Categories

![Categories](/images/docs/category-list.png)

Click any category to see a filtered list. Supports list, grid, and kanban layouts.

## Search

![Search](/images/docs/search.png)

`Cmd+K` global search across titles, descriptions, and content. Hybrid search: FTS5 + vector + Reciprocal Rank Fusion.

## Graph Map

![Graph Map](/images/docs/map-view.png)

Interactive ReactFlow visualization of node connections.

## Feed View

![Feed View](/images/docs/feed-view.png)

Chronological content feed with source text reader and format-aware rendering (transcript, markdown, raw).

## Sidebar

Fixed left panel with all 8 categories (icon + count badge), Quick Add input at top for pasting any URL or text to ingest, plus search, skills, evals, and docs access.

## Key Features

- Light/dark mode
- Real-time updates via SSE (node/edge/dimension changes broadcast instantly)
- Source reader with format-aware rendering
- Readonly mode for public deployments (`NEXT_PUBLIC_READONLY_MODE=true`)

---

# MCP Server

The knowledge graph is accessible to any MCP-compatible AI agent via the [Model Context Protocol](https://modelcontextprotocol.io/). Published to NPM as `latent-space-hub-mcp`.

## Quick Start

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

## Architecture

The standalone MCP server (`apps/mcp-server-standalone/`) connects directly to Turso via `@libsql/client`. It runs as a stdio process — the MCP client spawns it as a subprocess.

```
AI Agent (Claude Code / Cursor / Discord Bot)
    ↓ stdio
latent-space-hub-mcp (Node.js process)
    ↓ libsql
Turso cloud SQLite
```

## All 18 Tools

### Search & Discovery

| Tool | Description |
|------|-------------|
| `ls_get_context` | Graph overview — stats, hub nodes, dimensions, recent activity |
| `ls_search_nodes` | Hybrid search across titles and descriptions. Supports `node_type`, `event_after`, `event_before`, `sortBy` filters |
| `ls_search_content` | Full-text search through source material (transcripts, articles). FTS5 + vector, fused with RRF |
| `ls_list_dimensions` | List all dimensions/tags with node counts |

### Read

| Tool | Description |
|------|-------------|
| `ls_get_nodes` | Load full node records by ID (up to 10 per call) |
| `ls_query_edges` | Find all connections for a specific node |
| `ls_sqlite_query` | Run read-only SQL — `SELECT`, `WITH`, `PRAGMA` only |

### Write

| Tool | Description |
|------|-------------|
| `ls_add_node` | Create a new node (title + dimensions required) |
| `ls_update_node` | Update a node — content **appends** to notes, dimensions **replace** |
| `ls_create_edge` | Connect two nodes with a directional relationship and explanation |
| `ls_update_edge` | Update an edge's explanation |
| `ls_create_dimension` | Create a new dimension/tag |
| `ls_update_dimension` | Rename or update a dimension |
| `ls_delete_dimension` | Delete a dimension and remove from all nodes |

### Skills

| Tool | Description |
|------|-------------|
| `ls_list_skills` | List all skills |
| `ls_read_skill` | Read a skill by name |
| `ls_write_skill` | Create or update a custom skill |
| `ls_delete_skill` | Delete a custom skill |

## Setup Options

| Option | Config | Notes |
|--------|--------|-------|
| NPX (standalone) | `"command": "npx", "args": ["-y", "latent-space-hub-mcp"]` | No local repo needed. Connects directly to Turso. |
| Local stdio | `"command": "node", "args": ["path/to/apps/mcp-server/stdio-server.js"]` | Requires hub running (`npm run dev`). Proxies to Next.js API. |

## Security (Public Deployment)

| Variable | Description |
|----------|-------------|
| `MCP_SHARED_SECRET` | Bearer token for auth |
| `MCP_RATE_LIMIT_PER_MIN` | Rate limit per IP |
| `MCP_ALLOW_WRITES` | `true` to enable write tools (read-only by default) |

---

# Discord Bot — Slop

![Slop](/images/docs/slop-avatar.png)

Slop is the community bot. Searches the knowledge graph, answers questions with source links, remembers members, and schedules community events.

| | |
|---|---|
| **Repo** | `latent-space-bots` (separate from latent-space-hub) |
| **Hosted on** | Railway (always-on process) |
| **LLM** | Claude Sonnet 4.6 via OpenRouter |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/join` | Create your member profile so Slop remembers your interests |
| `/paper-club` | Schedule a Paper Club session — pick a date and paper |
| `/builders-club` | Schedule a Builders Club session — pick a date and topic |

## @Mentions

![Slop Response](/images/docs/slop-response.jpg)

Mention @Slop in any allowed channel. Slop creates a thread, searches the graph with 9 read-only MCP tools (up to 5 rounds of tool calls), and responds with source links.

## Member System

`/join` creates a member node in the knowledge graph. Slop then remembers your role, company, interests, and interaction preferences across conversations. Each interaction creates edges linking you to the content you discuss.

## Full Documentation

See **[Slop Bot](/docs/slop-bot)** for the complete reference — how the system prompt works, how skills load, how scheduling works, how member profiles evolve, and how trace logging captures every interaction

---

# Announcements Webhook

One-way webhook from Vercel → Discord. Not a bot — just formatted messages posted via Discord webhook URL.

## What It Posts

When the hourly ingestion cron finds new content:

1. **#announcements** — Clean card with emoji header, title, event date, chunk count, and source link
2. **#yap kickoff** (fallback mode) — Mentions @Slop with a prompt to discuss the new content

The webhook uses a shared identity ("Latent Space Hub") with configurable avatar.

## Webhook vs Bot Kickoff

| Mode | How | When |
|------|-----|------|
| Webhook | Posts to `DISCORD_YAP_WEBHOOK_URL` | Fallback when bot kickoff isn't configured |
| Bot API (preferred) | Calls `DISCORD_BOT_KICKOFF_URL` | Slop gets full agentic tool access to discuss the content |

The bot API mode is preferred because Slop searches the knowledge graph with its own tools and produces a richer, more contextual opening post.
