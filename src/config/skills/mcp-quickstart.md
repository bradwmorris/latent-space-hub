---
name: MCP Quickstart
description: Connect your AI agent to the Latent Space knowledge graph in 2 minutes.
---

# MCP Quickstart

Connect any MCP-compatible AI agent to the Latent Space Hub knowledge graph.

## Setup (2 minutes)

Add this to your Claude Code or Cursor MCP config:

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

Restart your AI assistant. The `ls_*` tools should now be available.

## What You Can Do

### Search the Knowledge Base

Ask your agent:
- "Search Latent Space for episodes about agents"
- "Find what was said about RAG in recent podcasts"
- "Who has appeared on the Latent Space podcast?"

### Explore Connections

- "What topics does Andrej Karpathy connect to?"
- "Show me the most connected entities in the graph"
- "Trace the relationship between OpenAI and agents"

### Run Custom Queries

- "How many podcast episodes are in the hub?"
- "What are the most recent articles?"
- "List all dimensions with their node counts"

## Available Tools

**Search:** `ls_search_nodes`, `ls_search_content`
**Read:** `ls_get_nodes`, `ls_get_context`, `ls_query_edges`
**Write:** `ls_add_node`, `ls_update_node`, `ls_create_edge`
**Explore:** `ls_list_dimensions`, `ls_sqlite_query`
**Skills:** `ls_list_skills`, `ls_read_skill`

## Tips

- Start with `ls_read_skill("start-here")` to understand the graph
- Use `ls_get_context` to get live stats and top nodes
- Use `ls_search_content` for deep searches through transcripts and articles
- Use `ls_sqlite_query` for advanced filtering and aggregation
- Read `ls_read_skill("db-operations")` for detailed graph operation policy
