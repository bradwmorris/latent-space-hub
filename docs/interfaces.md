# Interfaces & Surfaces

Four ways to interact with the knowledge graph.

## 1. Web App

Next.js 15 app deployed on Vercel. The primary interface for browsing and managing the graph.

### Views

- **Dashboard** — Landing page with stats and 8 category cards. Each card shows node count and 3 preview items (content by most recent, entities by most connected).
- **Category view** — Click any category to see a filtered list. Supports list, grid, and kanban layouts.
- **Node detail** — Full node view with metadata, notes, source text reader, dimension tags, and edge list.
- **Graph map** — Interactive ReactFlow visualization of node connections.
- **Search** — `Cmd+K` global search across titles, descriptions, and content. Hybrid search: FTS5 + vector + Reciprocal Rank Fusion.

### Sidebar

- Fixed left panel with all 8 categories, each with icon and count badge.
- **Quick Add** input at top — paste any URL or text to ingest content (see [Ingestion](./ingestion.md)).
- Search, skills, evals, and docs access.

### Key Features

- Light/dark mode
- Real-time updates via SSE (node/edge/dimension changes broadcast instantly)
- Source reader with format-aware rendering (transcript, markdown, raw)
- Readonly mode for public deployments (`NEXT_PUBLIC_READONLY_MODE=true`)

### URL

Production: deployed on Vercel (custom domain or `.vercel.app`)

---

## 2. MCP Server

The knowledge graph is accessible to any MCP-compatible AI agent via the [Model Context Protocol](https://modelcontextprotocol.io/). Published to NPM as `latent-space-hub-mcp`.

### Quick Start

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

### Architecture

The standalone MCP server (`apps/mcp-server-standalone/`) connects directly to Turso via `@libsql/client`. It runs as a stdio process — the MCP client (Claude Code, the Discord bot, etc.) spawns it as a subprocess.

```
AI Agent (Claude Code / Cursor / Discord Bot)
    ↓ stdio
latent-space-hub-mcp (Node.js process)
    ↓ libsql
Turso cloud SQLite
```

### All 18 Tools

#### Search & Discovery

| Tool | Description |
|------|-------------|
| `ls_get_context` | Graph overview — stats, hub nodes, dimensions, recent activity |
| `ls_search_nodes` | Hybrid search across titles and descriptions. Supports `node_type`, `event_after`, `event_before`, `sortBy` filters |
| `ls_search_content` | Full-text search through source material (transcripts, articles). Two-phase: FTS5 keyword match + vector similarity, fused with RRF |
| `ls_list_dimensions` | List all dimensions/tags with node counts |

#### Read

| Tool | Description |
|------|-------------|
| `ls_get_nodes` | Load full node records by ID (up to 10 per call) |
| `ls_query_edges` | Find all connections for a specific node |
| `ls_sqlite_query` | Run read-only SQL — `SELECT`, `WITH`, `PRAGMA` only |

#### Write

| Tool | Description |
|------|-------------|
| `ls_add_node` | Create a new node (title + dimensions required) |
| `ls_update_node` | Update a node — content **appends** to notes, dimensions **replace** |
| `ls_create_edge` | Connect two nodes with a directional relationship and explanation |
| `ls_update_edge` | Update an edge's explanation |
| `ls_create_dimension` | Create a new dimension/tag |
| `ls_update_dimension` | Rename or update a dimension |
| `ls_delete_dimension` | Delete a dimension and remove from all nodes |

#### Skills

| Tool | Description |
|------|-------------|
| `ls_list_skills` | List all skills |
| `ls_read_skill` | Read a skill by name |
| `ls_write_skill` | Create or update a custom skill |
| `ls_delete_skill` | Delete a custom skill |

### Search Pipeline

`ls_search_content` runs a hybrid search pipeline:

1. **FTS5 keyword match** — SQLite full-text search on `chunks_fts`
2. **Vector similarity** — Embed the query via OpenAI, run `vector_top_k()` on `chunks.embedding`
3. **Reciprocal Rank Fusion (RRF)** — Merge both result sets with position-based scoring
4. **Fallback chain** — If hybrid returns nothing, falls back to node-level text search

`ls_search_nodes` also supports hybrid search at the node level (title + description embeddings).

### Setup Options

| Option | Config | Notes |
|--------|--------|-------|
| NPX (standalone) | `"command": "npx", "args": ["-y", "latent-space-hub-mcp"]` | No local repo needed. Connects directly to Turso. |
| Local stdio | `"command": "node", "args": ["path/to/apps/mcp-server/stdio-server.js"]` | Requires hub running (`npm run dev`). Proxies to Next.js API. |
| HTTP transport | `"url": "http://127.0.0.1:44145/mcp"` | For agents supporting HTTP MCP. |

### Security (Public Deployment)

| Variable | Description |
|----------|-------------|
| `MCP_SHARED_SECRET` | Bearer token for auth |
| `MCP_RATE_LIMIT_PER_MIN` | Rate limit per IP |
| `MCP_ALLOW_WRITES` | `true` to enable write tools (read-only by default) |

---

## 3. Discord Bot — Slop

Slop is the community bot. Searches the knowledge graph, answers questions with source links, remembers members, and schedules community events.

**Repo:** `latent-space-bots` (separate from latent-space-hub)
**Hosted on:** Railway (always-on process)
**LLM:** Claude Sonnet 4.6 via OpenRouter

See **[Slop Bot documentation](./slop-bot.md)** for the full reference.

### Quick Summary

- **9 read-only MCP tools** passed to the LLM via OpenRouter tool-calling. The LLM decides what to search (up to 5 rounds).
- **5 slash commands:** `/tldr`, `/wassup`, `/join`, `/paper-club`, `/builders-club`
- **@Slop mentions** create threads for conversation
- **Member system** — `/join` creates a member node; Slop remembers interests, role, and interaction preferences across conversations
- **Event scheduling** — `/paper-club` and `/builders-club` create event nodes with date picking and double-booking prevention
- **Automated kickoffs** — hub calls Slop's API when new content is ingested; Slop generates an opening take
- **Trace logging** — every interaction logged to `chats` table with full tool call traces

---

## 4. Discord Announcements Webhook

One-way webhook from Vercel → Discord. Not a bot — just formatted messages posted via Discord webhook URL.

### What it posts

When the hourly ingestion cron finds new content:

1. **#announcements** — Clean card with emoji header, title, event date, chunk count, and source link
2. **#yap kickoff** (fallback mode) — Mentions @Slop with a prompt to discuss the new content

The webhook uses a shared identity ("Latent Space Hub") with configurable avatar.

### Webhook vs Bot Kickoff

| Mode | How | When |
|------|-----|------|
| Webhook | Posts to `DISCORD_YAP_WEBHOOK_URL` | Fallback when bot kickoff isn't configured |
| Bot API (preferred) | Calls `DISCORD_BOT_KICKOFF_URL` | Slop gets full agentic tool access to discuss the content |

The bot API mode is preferred because Slop searches the knowledge graph with its own tools and produces a richer, more contextual opening post.
