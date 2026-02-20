# latent-space-hub-mcp

Standalone MCP server for Latent Space Hub.

## Install / Run

```bash
npx latent-space-hub-mcp
```

## Required config

Set environment variables:

```bash
export TURSO_DATABASE_URL="libsql://..."
export TURSO_AUTH_TOKEN="..."
```

Or create `~/.latent-space-hub/config.json`:

```json
{
  "tursoUrl": "libsql://...",
  "tursoToken": "..."
}
```

## Claude MCP config

```json
{
  "mcpServers": {
    "latent-space-hub": {
      "command": "npx",
      "args": ["latent-space-hub-mcp"],
      "env": {
        "TURSO_DATABASE_URL": "libsql://...",
        "TURSO_AUTH_TOKEN": "..."
      }
    }
  }
}
```

## Tools

- `ls_get_context`
- `ls_search_nodes`
- `ls_get_nodes`
- `ls_add_node`
- `ls_update_node`
- `ls_query_edges`
- `ls_create_edge`
- `ls_update_edge`
- `ls_list_dimensions`
- `ls_create_dimension`
- `ls_update_dimension`
- `ls_delete_dimension`
- `ls_search_content`
- `ls_sqlite_query`
- `ls_list_guides`
- `ls_read_guide`
- `ls_write_guide`
- `ls_delete_guide`
