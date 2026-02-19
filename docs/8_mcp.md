# MCP Server

> How to connect Claude Code and other AI assistants to the Latent Space Hub.

**How it works:** The Latent Space Hub runs an MCP (Model Context Protocol) server. This lets any MCP-compatible assistant — like Claude Code — search the knowledge base, add new content, and manage the knowledge graph.

---

## Quick Start

1. Start the hub: `npm run dev`
2. Configure your AI assistant (see below)
3. Use naturally: "Search Latent Space for notes on X" or "Add this to the knowledge base"

---

## Available Tools

| Tool | Description |
|------|-------------|
| `ls_add_node` | Create a new node (title/content/dimensions) |
| `ls_search_nodes` | Search existing nodes |
| `ls_update_node` | Update an existing node |
| `ls_get_nodes` | Get nodes by ID |
| `ls_create_edge` | Create relationship between nodes |
| `ls_query_edges` | Query existing edges |
| `ls_update_edge` | Update edge metadata |
| `ls_create_dimension` | Create a new dimension |
| `ls_update_dimension` | Update dimension description |
| `ls_delete_dimension` | Delete a dimension |
| `ls_search_embeddings` | Semantic search across embeddings |

---

## Claude Code Configuration

Add to your `~/.claude.json` or Claude Code settings:

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

Replace `/path/to/latent-space-hub` with the actual path to your installation.

**Note:** The hub must be running (`npm run dev`) for the MCP server to work.

---

## HTTP Transport

For assistants that support HTTP transport:

**URL:** `http://127.0.0.1:44145/mcp`

---

## Hub MCP Security (Public Deployment)

For public MCP endpoints, you can enable a bearer token and rate limit:

- `MCP_SHARED_SECRET` — if set, requests must include `Authorization: Bearer <secret>`
- `MCP_RATE_LIMIT_PER_MIN` — integer requests per minute per IP (best-effort)
- `MCP_ALLOW_WRITES` — set `true` to expose write tools (default is read-only)

```json
{
  "mcpServers": {
    "latent-space": {
      "url": "http://127.0.0.1:44145/mcp"
    }
  }
}
```

To start the HTTP server standalone:
```bash
node apps/mcp-server/server.js
```

---

## Example Usage

Once connected, you can ask your AI assistant:

```
"Search Latent Space for what was said about MCP architecture"
"Add this conversation summary as a new node"
"Find all nodes with the 'agents' dimension"
"Create an edge between node 123 and node 456"
"What are the most connected nodes?"
```

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/mcp-server/server.js` | HTTP MCP server |
| `apps/mcp-server/stdio-server.js` | STDIO MCP server (for Claude Code) |

---

## Troubleshooting

### "Connection refused"

1. Make sure the hub is running: `npm run dev`
2. Check the port isn't blocked: `lsof -i :44145`
3. Verify the server started: check terminal output

### "Tools not showing"

1. Restart your AI assistant after configuring
2. Verify the path in your config is correct
3. Check `node apps/mcp-server/stdio-server.js` runs without errors
