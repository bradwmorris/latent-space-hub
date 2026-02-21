# Latent Space Hub — Overview

## What is Latent Space Hub?

Knowledge base for the [Latent Space](https://www.latent.space/) community. Podcasts, articles, AI news, conference talks, papers — searchable via semantic vector search and connected in a knowledge graph.

**Open Source Foundation:** Built on [RA-H](https://github.com/bradwmorris/ra-h_os). Want to self-host your own knowledge graph? Use the open-source version.

## Design Philosophy

**Cloud-native** — Turso (cloud SQLite) as the database. Deployed on Vercel for public access.

**Agent-accessible** — MCP server lets any AI assistant (Claude Code, custom agents) search and contribute to the knowledge base.

**Simple & focused** — 2-panel UI for browsing and editing the knowledge graph.

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS
- **Database:** Turso (cloud SQLite via `@libsql/client`)
- **Search:** Turso native vector search (F32_BLOB + vector_top_k) + FTS5
- **Embeddings:** OpenAI (BYO API key)
- **MCP Server:** HTTP + stdio for Claude Code and external agents

## What's Included

- 2-panel UI (nodes list + focus panel)
- Node/Edge/Dimension CRUD
- Full-text and semantic search
- MCP server with `ls_*` tools
- PDF, YouTube, and website extraction
- Graph visualization (Map view)
- Readonly mode for public deployment

## Two-Panel Layout

```
+---------------+-------------------------+
|   NODES       |        FOCUS            |
|   Panel       |        Panel            |
|               |                         |
| - Search      | - Node content          |
| - Filters     | - Connections           |
| - List        | - Dimensions            |
|               |                         |
+---------------+-------------------------+
```

## MCP Integration

Connect any MCP-compatible assistant:

```json
{
  "mcpServers": {
    "latent-space": {
      "command": "node",
      "args": ["/path/to/latent-space-hub/apps/mcp-server/stdio-server.js"]
    }
  }
}
```

Tools: `ls_add_node`, `ls_search_nodes`, `ls_update_node`, `ls_get_nodes`, `ls_create_edge`, `ls_query_edges`, `ls_update_edge`, `ls_create_dimension`, `ls_update_dimension`, `ls_delete_dimension`, `ls_search_embeddings`

## Documentation

| Doc | Description |
|-----|-------------|
| [Schema](./2_schema.md) | Database schema, node/edge structure |
| [Tools & Workflows](./4_tools-and-workflows.md) | Available MCP tools, workflow system |
| [UI](./6_ui.md) | Component structure, panels, views |
| [MCP](./8_mcp.md) | External agent connector setup |
| [Troubleshooting](./TROUBLESHOOTING.md) | Common issues and fixes |
