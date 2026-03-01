# MCP Server

The Latent Space Hub exposes its entire knowledge graph via the [Model Context Protocol](https://modelcontextprotocol.io/). Any MCP-compatible AI agent — Claude Code, Cursor, Windsurf, custom agents — can search, read, and contribute to the graph.

The Discord bot (`latent-space-bots`) also uses this MCP tool surface (via stdio) for graph retrieval and member-memory writes.

## Quick Start

### Option 1: NPX (standalone)

Add to your Claude Code or Cursor MCP config:

```json
{
  "mcpServers": {
    "latent-space-hub": {
      "command": "npx",
      "args": ["-y", "latent-space-hub-mcp"],
      "env": {
        "TURSO_DATABASE_URL": "libsql://latentspace-bradwmorris.aws-us-east-2.turso.io",
        "TURSO_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Option 2: Local stdio (development)

If you have the repo cloned:

```json
{
  "mcpServers": {
    "latent-space-hub": {
      "command": "node",
      "args": ["/path/to/latent-space-hub/apps/mcp-server/stdio-server.js"]
    }
  }
}
```

Requires the hub to be running (`npm run dev`).

### Option 3: HTTP transport

For assistants that support HTTP:

```json
{
  "mcpServers": {
    "latent-space-hub": {
      "url": "http://127.0.0.1:44145/mcp"
    }
  }
}
```

## Available Tools

### Context & Discovery

| Tool | Description |
|------|-------------|
| `ls_get_context` | Get graph overview — stats, hub nodes, dimensions, recent activity |
| `ls_list_dimensions` | List all dimensions with node counts |
| `ls_search_nodes` | Keyword search with optional `node_type`, `event_after`, `event_before`, and `sortBy` filters |
| `ls_search_content` | Full-text search through source material (transcripts, articles, papers) |

### Read

| Tool | Description |
|------|-------------|
| `ls_get_nodes` | Load full node records by ID (up to 10 per call) |
| `ls_query_edges` | Find connections for a specific node |
| `ls_sqlite_query` | Run read-only SQL (SELECT/WITH/PRAGMA only) |

### Write

| Tool | Description |
|------|-------------|
| `ls_add_node` | Create a new node (title, dimensions required) |
| `ls_update_node` | Update a node — content **appends** to notes, dimensions **replace** |
| `ls_create_edge` | Connect two nodes with a directional relationship and explanation |
| `ls_update_edge` | Update an edge's explanation |
| `ls_create_dimension` | Create a new dimension/tag |
| `ls_update_dimension` | Rename or update a dimension |
| `ls_delete_dimension` | Delete a dimension and remove it from all nodes |

### Guides

| Tool | Description |
|------|-------------|
| `ls_list_guides` | List all available guides (system + custom) |
| `ls_read_guide` | Read a guide by name |
| `ls_write_guide` | Create or update a custom guide |
| `ls_delete_guide` | Delete a custom guide |

## Example Workflows

### Find podcast episodes about a topic

```
1. ls_search_nodes({ query: "RAG retrieval augmented generation", node_type: "podcast", sortBy: "event_date" })
2. ls_get_nodes({ nodeIds: [123, 456, 789] })     # Get full details
3. ls_search_content({ query: "RAG", node_id: 123 })  # Read what was said
```

### Who has appeared on the podcast most?

```
ls_sqlite_query({
  sql: "SELECT n.title, COUNT(e.id) as appearances FROM nodes n JOIN edges e ON e.to_node_id = n.id WHERE n.node_type = 'guest' GROUP BY n.id ORDER BY appearances DESC LIMIT 10"
})
```

### Add a new article to the graph

```
1. ls_search_nodes({ query: "article title" })     # Check for duplicates
2. ls_add_node({
     title: "The Future of AI Agents",
     dimensions: ["agents", "ls-articles"],
     description: "Substack post analyzing agent architectures...",
     link: "https://www.latent.space/p/future-of-agents"
   })
3. ls_create_edge({
     sourceId: NEW_NODE_ID,
     targetId: GUEST_ID,
     explanation: "written by this author"
   })
```

### Trace connections between concepts

```
1. ls_search_nodes({ query: "Andrej Karpathy" })
2. ls_query_edges({ nodeId: 42 })                  # See all connections
3. ls_get_nodes({ nodeIds: [connected_ids...] })    # Load connected nodes
```

### Temporal search ("since")

```
ls_search_nodes({
  query: "agents",
  node_type: "podcast",
  event_after: "2025-06-01",
  sortBy: "event_date"
})
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TURSO_DATABASE_URL` | Yes | Turso database URL |
| `TURSO_AUTH_TOKEN` | Yes | Turso auth token |

Or create `~/.latent-space-hub/config.json`:

```json
{
  "tursoUrl": "libsql://...",
  "tursoToken": "..."
}
```

### Security (Public Deployment)

| Variable | Description |
|----------|-------------|
| `MCP_SHARED_SECRET` | Bearer token — requests must include `Authorization: Bearer <secret>` |
| `MCP_RATE_LIMIT_PER_MIN` | Requests per minute per IP |
| `MCP_ALLOW_WRITES` | Set `true` to enable write tools (read-only by default) |

## Key Files

| File | Purpose |
|------|---------|
| `apps/mcp-server-standalone/index.js` | Standalone NPX server (published to npm) |
| `apps/mcp-server-standalone/package.json` | NPM package config |
| `apps/mcp-server/server.js` | In-app HTTP MCP server |
| `apps/mcp-server/stdio-server.js` | In-app stdio MCP server |
| `src/tools/` | Tool definitions (shared by both servers) |

## Troubleshooting

### "Connection refused"

1. For local stdio: make sure the hub is running (`npm run dev`)
2. For HTTP: check port 44145 isn't blocked — `lsof -i :44145`
3. For NPX: verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set

### "Tools not showing"

1. Restart your AI assistant after configuring MCP
2. Verify the path or NPX command in your config
3. Test standalone: `npx latent-space-hub-mcp` — should start without errors

### Write tools not available

Write tools are disabled by default for security. Set `MCP_ALLOW_WRITES=true` to enable.
