# Tools & Guides

> MCP tools for external agents and the guides system for context sharing.

**How it works:** Latent Space Hub exposes tools via MCP that external AI agents can call to read, create, and update your knowledge graph. Guides are markdown documents that help external agents understand your knowledge base.

---

## MCP Tools

Latent Space Hub provides MCP tools for external agents:

### Node Operations

| Tool | Description |
|------|-------------|
| `ls_add_node` | Create a new knowledge node |
| `ls_search_nodes` | Search nodes by title, content, or dimensions |
| `ls_update_node` | Update an existing node |
| `ls_get_nodes` | Get nodes by ID array |

### Edge Operations

| Tool | Description |
|------|-------------|
| `ls_create_edge` | Create relationship between nodes |
| `ls_query_edges` | Query existing edges |
| `ls_update_edge` | Update edge metadata |

### Dimension Operations

| Tool | Description |
|------|-------------|
| `ls_create_dimension` | Create a new dimension tag |
| `ls_update_dimension` | Update dimension description |
| `ls_delete_dimension` | Delete a dimension |

### Search

| Tool | Description |
|------|-------------|
| `ls_search_embeddings` | Semantic search across chunk embeddings |

### Guides

| Tool | Description |
|------|-------------|
| _No MCP guide tools currently registered_ | Guides are managed in-app via API/UI |

---

## Tool Schemas

### ls_add_node

```typescript
{
  title: string,        // Required
  content?: string,
  description?: string,
  dimensions?: string[],
  link?: string,
  metadata?: object
}
```

### ls_search_nodes

```typescript
{
  search?: string,      // Full-text search
  dimensions?: string[],// Filter by dimensions
  limit?: number        // Max results (default: 20)
}
```

### ls_update_node

```typescript
{
  id: number,           // Node ID
  title?: string,
  content?: string,     // Replaces existing content
  description?: string,
  dimensions?: string[],
  link?: string,
  metadata?: object
}
```

### ls_create_edge

```typescript
{
  from_node_id: number,
  to_node_id: number,
  context?: string      // Relationship description
}
```

### ls_search_embeddings

```typescript
{
  query: string,        // Search query
  node_id?: number,     // Scope to specific node
  limit?: number,       // Max results
  threshold?: number    // Similarity threshold (0-1)
}
```

---

## Guides

Guides are markdown documents stored in `src/config/guides/` that help external AI agents understand your knowledge base context, conventions, and usage patterns.

### Why Guides?

When an external agent (like Claude Code) connects to Latent Space Hub via MCP, it has access to tools but lacks context about:
- How your knowledge base is organized
- What dimensions mean in your system
- Best practices for creating/linking nodes
- Your specific workflows and conventions

Guides bridge this gap by providing structured documentation that agents can read.

### Managing Guides

**Via UI:**
1. Open Settings (gear icon)
2. Click the "Guides" tab
3. Create, edit, or delete guides

**Via Pane:**
- Click the Guides icon in the left toolbar
- Browse and read guides directly

### Built-in Guides

| Guide | Purpose |
|-------|---------|
| `connect` | How to find and create connections between nodes |
| `integrate` | Deep analysis and integration patterns |
| `prep` | Preparing content for the knowledge base |
| `research` | Research workflow patterns |
| `survey` | Survey and discovery patterns |

### Creating Custom Guides

Guides use markdown with optional YAML frontmatter:

```markdown
---
description: Brief description shown in guide list
---

# Guide Title

Your guide content here...
```

---

## API Routes

Latent Space Hub exposes REST APIs that MCP tools call internally:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/nodes` | GET/POST | List/create nodes |
| `/api/nodes/[id]` | GET/PUT/DELETE | Node CRUD |
| `/api/nodes/search` | POST | Search nodes |
| `/api/edges` | GET/POST | List/create edges |
| `/api/edges/[id]` | GET/PUT/DELETE | Edge CRUD |
| `/api/dimensions` | GET/POST | List/create dimensions |
| `/api/dimensions/search` | GET | Search dimensions |
| `/api/guides` | GET | List guides |
| `/api/guides/[name]` | GET/PUT/DELETE | Guide CRUD |

---

## Database Tools (Internal)

These tools are used by APIs and internal operations:

| Tool | File | Purpose |
|------|------|---------|
| `queryNodes` | `src/tools/database/queryNodes.ts` | Search nodes |
| `createNode` | `src/tools/database/createNode.ts` | Create node |
| `updateNode` | `src/tools/database/updateNode.ts` | Update node |
| `deleteNode` | `src/tools/database/deleteNode.ts` | Delete node |
| `getNodesById` | `src/tools/database/getNodesById.ts` | Get by ID |
| `createEdge` | `src/tools/database/createEdge.ts` | Create edge |
| `updateEdge` | `src/tools/database/updateEdge.ts` | Update edge |
| `queryEdge` | `src/tools/database/queryEdge.ts` | Query edges |
| `queryDimensions` | `src/tools/database/queryDimensions.ts` | Query dimensions |
| `searchContentEmbeddings` | `src/tools/other/searchContentEmbeddings.ts` | Semantic search |

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/mcp-server/server.js` | HTTP MCP server |
| `apps/mcp-server/stdio-server.js` | STDIO MCP server |
| `src/tools/infrastructure/registry.ts` | Tool registry |
| `src/services/guides/guideService.ts` | Guide management |
| `src/config/guides/*.md` | Built-in guides |
