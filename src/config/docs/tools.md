---
title: Tools
description: "How agents interact with the wiki-base: MCP tools for external agents, Slop tools for the Discord bot."
---

# Tools

Two independent tool systems exist. Both query the same Turso database but are completely separate codebases.

| System | Where | Used by | Access |
|--------|-------|---------|--------|
| **MCP tools** | `apps/mcp-server-standalone/` | External agents (Claude Code, Cursor, etc.) | Read-only |
| **Slop tools** | `latent-space-bots/src/tools.ts` | Discord bot | Read-only (writes via slash commands only) |

---

## MCP Tools

The MCP server is an NPX package (`latent-space-hub-mcp`) that external agents install to query the wiki-base. It connects directly to Turso and exposes read-only tools.

Install and configure:

```bash
npx latent-space-hub-mcp
```

Requires Turso credentials via environment variables (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) or `~/.latent-space-hub/config.json`. See the [MCP Server](/docs/mcp-server) page for setup details.

### Available Tools (9, read-only)

| MCP Name | What it does |
|----------|-------------|
| `ls_get_context` | Wiki-base stats (node counts, edge counts, chunk counts) |
| `ls_search_nodes` | Keyword search on node titles, descriptions, and notes |
| `ls_get_nodes` | Load full node records by ID |
| `ls_search_content` | Hybrid search (vector + FTS5 + RRF) over transcript and article text |
| `ls_query_edges` | Get connections for a node |
| `ls_list_dimensions` | List dimensions with node counts |
| `ls_sqlite_query` | Read-only SQL (SELECT/WITH/PRAGMA only) |
| `ls_list_skills` | List system and custom skills |
| `ls_read_skill` | Read a skill's markdown content by name |

`ls_search_content` is the most powerful search tool. If an `OPENAI_API_KEY` is configured, it runs vector similarity + FTS5 keyword matching with Reciprocal Rank Fusion. Without it, it falls back to FTS5 and keyword matching only.

Skills (`ls_list_skills`, `ls_read_skill`) are markdown documents agents can read for orientation and query patterns. See the [Skills](/docs/skills) page.

### Write Tools

The MCP server does not expose write tools. External agents cannot create, update, or delete nodes, edges, or dimensions. The wiki-base is maintained by the ingestion pipeline and internal tooling.

---

## Slop Tools (Discord Bot)

Slop has its own tool definitions in `latent-space-bots/src/tools.ts`. These are completely independent from the MCP tools: defined as OpenAI function-calling format, executed via direct Turso queries.

### All 9 Tools (Read-Only)

```typescript
// latent-space-bots/src/tools.ts

// search tools
{ name: "slop_semantic_search",  description: "Vector search by meaning (default for questions)" },
{ name: "slop_search_nodes",     description: "Keyword substring match on node titles/descriptions" },
{ name: "slop_search_content",   description: "FTS5 keyword search through transcript/article text" },

// graph traversal
{ name: "slop_get_nodes",        description: "Load full node records by ID" },
{ name: "slop_query_edges",      description: "Get connections for a node" },
{ name: "slop_list_dimensions",  description: "List dimensions with counts" },

// utility
{ name: "slop_get_context",      description: "Wiki-base stats (nodes, edges, chunks)" },
{ name: "slop_sqlite_query",     description: "Read-only SQL (SELECT/WITH/PRAGMA)" },
{ name: "slop_read_skill",       description: "Read a skill's markdown content" },
```

`slop_semantic_search` embeds the query via OpenAI `text-embedding-3-small` and runs `vector_top_k()` on both node and chunk embeddings, fusing results with RRF. The keyword tools (`search_nodes`, `search_content`) use SQL LIKE and FTS5 respectively. Every handler runs parameterized SQL against Turso. Results are truncated to 4000 chars to prevent token bloat.

### Write Operations (Not Tools)

Slop's write operations happen **outside the LLM tool loop**, triggered only by Discord slash commands:

| Command | What it writes |
|---------|---------------|
| `/join` | Creates a member node |
| `/paper-club` | Creates a scheduled event node |
| `/builders-club` | Creates a scheduled event node |

Member profile updates also happen post-response (updating notes, metadata, and edges) but are not LLM-callable tools.

---

## Comparison

| | MCP Tools | Slop Tools |
|---|-----------|-----------|
| **Format** | MCP SDK + Zod schemas | OpenAI function-calling JSON |
| **DB access** | Direct Turso (standalone package) | Direct Turso (bots repo) |
| **Search** | Hybrid (vector + FTS5 + RRF) via `ls_search_content` | 3 separate tools: semantic, keyword, FTS5 |
| **Read tools** | 9 | 9 |
| **Write tools** | 0 | 0 (writes via slash commands only) |
| **Prefix** | `ls_` | `slop_` |
| **Used by** | Any MCP-compatible agent | Discord bot only |
