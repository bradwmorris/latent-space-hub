# PRD 07: MCP Server (NPX) + Skills/Guides

## Background

The LS MCP server exists (`apps/mcp-server/`) but it's only an HTTP/stdio server embedded in the app. In the main RA-H repo, we went further — made the MCP server a standalone NPX package (`ra-h-mcp-server`) that anyone can install and connect to Claude Code/Desktop.

We need to do the same for Latent Space Hub. And critically: **the Discord bots (PRD-06) need to access the knowledge base through the same MCP server that humans use.** One interface, two audiences. Build it right here, and the bot just plugs in.

At the same time, the hub needs skills/guides — documentation that teaches agents (and humans via agents) how to work with the Latent Space knowledge base. These guides ship with the MCP server and are accessible as MCP tools.

## What This Delivers

1. **NPX-publishable MCP server** — `npx latent-space-hub-mcp` connects Claude to the LS knowledge base
2. **Skills/guides system** — Bundled documentation that agents read to understand the hub
3. **Shared interface** — Same tools and guides for humans (Claude Code/Desktop) and bots (Discord)

## Why Before Discord Bot

The bot needs to:
- Search the knowledge base (vector + FTS)
- Read guides to understand how to navigate content
- Access the same tools humans use

If the MCP server and guides aren't solid, the bot has no foundation. Build the interface first, then build the consumers.

---

## Plan

### 1. Standalone MCP server package

Create `apps/mcp-server-standalone/` — a self-contained NPX package, following the pattern from `ra-h-mcp-server`.

**Structure:**
```
apps/mcp-server-standalone/
  package.json          — NPX config (bin, files, engines)
  index.js              — Entry point with shebang
  services/
    tursoClient.js      — Turso connection (not better-sqlite3)
    nodeService.js      — Node CRUD
    edgeService.js      — Edge CRUD
    dimensionService.js — Dimension CRUD
    chunkService.js     — Chunk/search operations
    guideService.js     — Guide management
  guides/
    system/             — Immutable system guides (bundled)
    (user guides stored on disk at runtime)
  README.md             — Install, config, tool list
```

**Key difference from RA-H's standalone:** Turso (`@libsql/client`) instead of `better-sqlite3`. The standalone server connects to the same Turso database — it's cloud-native, not local-file.

**package.json:**
```json
{
  "name": "latent-space-hub-mcp",
  "bin": { "latent-space-hub-mcp": "./index.js" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@libsql/client": "^0.17.0",
    "zod": "^3.23.0"
  }
}
```

**Tools to register (ls_* namespace):**

Core:
- `ls_get_context` — Overview: stats, hub nodes, dimensions, guides list
- `ls_search_nodes` — Keyword search across titles, descriptions, content
- `ls_get_nodes` — Load full node records by ID
- `ls_add_node` — Create a node
- `ls_update_node` — Update a node
- `ls_create_edge` — Connect two nodes
- `ls_update_edge` — Update edge explanation
- `ls_query_edges` — Find edges for a node
- `ls_list_dimensions` — All dimensions with counts
- `ls_create_dimension` — New dimension
- `ls_update_dimension` — Rename/update dimension
- `ls_delete_dimension` — Remove dimension
- `ls_search_content` — Search through chunks (vector + FTS)
- `ls_sqlite_query` — Read-only SQL

Guides:
- `ls_list_guides` — All guides with name, description, immutable flag
- `ls_read_guide` — Full markdown content of a guide
- `ls_write_guide` — Create/update custom guides (system guides protected)
- `ls_delete_guide` — Delete custom guides only

### 2. Skills/guides for the hub

Guides teach agents how to work with the Latent Space knowledge base. They ship as system guides (immutable, bundled) and can be extended with custom guides.

**System guides to create:**

| Guide | Purpose |
|-------|---------|
| `start-here` | Orientation — what the LS Hub is, what's in it, how to navigate |
| `schema` | Database structure — nodes, edges, dimensions, chunks |
| `creating-nodes` | When and how to create nodes, title/description patterns |
| `edges` | How to create meaningful connections (not just proximity) |
| `dimensions` | The taxonomy — what dimensions exist, how to assign them |
| `search` | How to search — when to use keyword vs vector vs FTS vs SQL |
| `content-types` | What's in the hub — podcasts, blogs, ainews, entities |
| `agent-engineering` | Already exists — refine for LS context |
| `context-engineering` | Already exists — refine for LS context |

**Guide format** (YAML frontmatter + markdown, same as RA-H):
```markdown
---
name: Start Here
description: Orientation to the Latent Space Hub knowledge base
immutable: true
---

# Start Here
...
```

**Guide storage at runtime:**
- System guides: bundled in package, always re-seeded on startup
- Custom guides: stored at a configurable path (default: `~/.latent-space-hub/guides/`)
- Max 10 custom guides

### 3. Config and auth

The standalone server needs Turso credentials. Two options:

**Option A: Environment variables**
```bash
TURSO_DATABASE_URL=libsql://latentspace-...turso.io
TURSO_AUTH_TOKEN=...
```

**Option B: Config file** (`~/.latent-space-hub/config.json`)
```json
{
  "tursoUrl": "libsql://...",
  "tursoToken": "..."
}
```

Probably both — env vars take precedence, config file as fallback. First run without config should print setup instructions.

### 4. Claude Code/Desktop integration

**Claude Code (`.claude/settings.json`):**
```json
{
  "mcpServers": {
    "latent-space-hub": {
      "command": "npx",
      "args": ["latent-space-hub-mcp"],
      "env": {
        "TURSO_DATABASE_URL": "...",
        "TURSO_AUTH_TOKEN": "..."
      }
    }
  }
}
```

**Claude Desktop (`claude_desktop_config.json`):**
Same pattern.

### 5. Bot compatibility

The Discord bots (PRD-06) will import the service layer directly rather than going through MCP protocol:

```javascript
// Bot imports services directly
import { searchNodes, getNodes } from 'latent-space-hub-mcp/services/nodeService.js'
import { searchContent } from 'latent-space-hub-mcp/services/chunkService.js'
import { readGuide } from 'latent-space-hub-mcp/services/guideService.js'
```

This means the service layer needs to be cleanly separated from the MCP transport. Same logic, two consumers: MCP protocol (humans) and direct import (bots).

---

## Implementation order

1. Create `apps/mcp-server-standalone/` structure
2. Implement Turso client service (adapt from existing `sqlite-client.ts`)
3. Port node/edge/dimension/chunk services to standalone JS
4. Implement guide service (reference RA-H's `guideService.js`)
5. Write system guides
6. Register all MCP tools with `ls_*` namespace
7. Add config/auth handling (env vars + config file)
8. Test locally: `node index.js` → connect from Claude Code
9. Write README with install + config instructions
10. Publish to NPM
11. Test: `npx latent-space-hub-mcp` works end-to-end

---

## Depends on

- **PRD-01** (identity + cleanup) — tool namespace must be `ls_*` before we publish
- **PRD-02** (schema) — schema must be finalized before we build services against it
- **PRD-04** (vector search) — search tools need vector_top_k + FTS5 working
- **PRD-05** (content ingestion) — guides reference content types that need to exist

## Blocks

- **PRD-06** (Discord bot) — bot imports the service layer from this package

---

## Done =

- [x] `npx latent-space-hub-mcp` starts and connects to Turso
- [x] All core `ls_*` tools work (CRUD + search + guides)
- [x] System guides bundled and accessible via `ls_read_guide`
- [x] Custom guides can be created/read/deleted
- [x] Service layer extracted for bot use (`apps/mcp-server-standalone/services`)
- [x] README documents install, config, and available tools
- [x] Published on NPM (`latent-space-hub-mcp`)
- [ ] Tested with both Claude Code and Claude Desktop

---

## Status Update (2026-02-20)

### Completed

- Standalone package created: `apps/mcp-server-standalone/`
- MCP server published and installable via `npx latent-space-hub-mcp`
- Config/auth flow implemented (`TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` + config file fallback)
- Guide system implemented with immutable bundled guides + custom guide CRUD
- Core ls tools implemented for context, nodes, edges, dimensions, content search, and read-only SQL
- Shared service layer extracted in `apps/mcp-server-standalone/services` to support bot reuse
- Guide-only direction adopted for LS-specific behavior (LS `.claude/skills/ls-*` removed)

### Remaining

- Add/curate the full target set of system guides (`creating-nodes`, `edges`, `dimensions`, `search`, `content-types`) to match plan completeness
- Validate end-to-end in Claude Desktop in addition to Claude Code

### Notes

- `latent-space-hub-mcp@0.1.1` is live.
- Bot integration path is implemented, but package export parity for `./services` should be verified on next publish.
