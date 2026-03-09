---
title: Tools
description: The tool surface area for agents and bots interacting with the wiki-base.
---

# Tools

Two independent tool systems exist — one for external agents (via MCP), one for Slop (internal to the bots repo). Both query the same Turso database.

## Hub Tools (MCP + Web App)

Defined in `src/tools/` using the Vercel AI SDK `tool()` helper. Each tool has a Zod input schema and an `execute` function. These are used by the web app's built-in agent and exposed via the MCP server.

### Tool Groups

Tools are organized into three groups in `src/tools/infrastructure/registry.ts`:

```typescript
// Core tools available to all agents (read-only graph operations)
const CORE_TOOLS = {
  sqliteQuery,       // Read-only SQL (SELECT/WITH/PRAGMA)
  queryNodes,        // Search nodes by title/notes/dimensions
  getNodesById,      // Load full node records by ID
  queryEdge,         // Get edges (connections) for a node
  queryDimensions,   // List dimensions with counts
  getDimension,      // Get single dimension details
  queryDimensionNodes, // Get nodes in a dimension
  searchContentEmbeddings, // Two-phase semantic search (vector + FTS5)
};

const ORCHESTRATION_TOOLS = {
  webSearch,         // Web search via external API
  think,             // Scratchpad for reasoning steps
};

// Write operations + extraction (workers only)
const EXECUTION_TOOLS = {
  createNode,        // Create node with title/notes/link/dimensions
  updateNode,        // Modify existing node
  createEdge,        // Create connection between nodes
  updateEdge,        // Update edge explanation
  createDimension,   // Create new dimension
  updateDimension,   // Rename, lock/unlock dimension
  deleteDimension,   // Remove dimension from all nodes
  youtubeExtract,    // Extract YouTube transcript
  websiteExtract,    // Extract website content
  paperExtract,      // Extract PDF content
};
```

### Role-Based Access

Agents get different tool sets based on their role:

| Role | Tools |
|------|-------|
| **All agents** | Core (8 read-only tools) |
| **Orchestrator** | Core + Orchestration + Execution |
| **Executor** | All tools |
| **Planner** | Core + webSearch, think, updateNode, createEdge, updateDimension |

### Tool Schema Example

Every tool follows the same pattern — Zod schema for input validation, async execute function:

```typescript
// src/tools/database/queryNodes.ts
export const queryNodesTool = tool({
  description: 'Search nodes by title/notes/dimensions',
  inputSchema: z.object({
    filters: z.object({
      dimensions: z.array(z.string()).optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
    }).optional()
  }),
  execute: async ({ filters = {} }) => {
    const nodes = await nodeService.getNodes({
      limit: filters.limit || 10,
      dimensions: filters.dimensions,
      search: filters.search
    });
    return { success: true, data: { nodes, count: nodes.length } };
  }
});
```

### MCP Server Mapping

The MCP server (`apps/mcp-server/`) exposes these same tools with `ls_` prefixed names:

| Hub Tool | MCP Name | Type |
|----------|----------|------|
| queryNodes | `ls_search_nodes` | read |
| getNodesById | `ls_get_nodes` | read |
| searchContentEmbeddings | `ls_search_embeddings` | read |
| queryEdge | `ls_query_edges` | read |
| queryDimensions | `ls_list_dimensions` | read |
| sqliteQuery | `ls_sqlite_query` | read |
| createNode | `ls_add_node` | write |
| updateNode | `ls_update_node` | write |
| createEdge | `ls_create_edge` | write |
| updateEdge | `ls_update_edge` | write |
| createDimension | `ls_create_dimension` | write |
| updateDimension | `ls_update_dimension` | write |
| deleteDimension | `ls_delete_dimension` | write |

---

## Slop Tools (Discord Bot)

Slop has its own tool definitions in `latent-space-bots/src/tools.ts`. These are **completely independent** from the hub tools — defined as OpenAI function-calling format, executed via direct Turso queries.

### All 8 Tools (Read-Only)

```typescript
// latent-space-bots/src/tools.ts
export const TOOL_DEFINITIONS: OpenAIToolDef[] = [
  { name: "slop_search_nodes",    description: "Search nodes by title/description/notes" },
  { name: "slop_search_content",  description: "FTS5 full-text search through chunks" },
  { name: "slop_get_nodes",       description: "Load full node records by ID" },
  { name: "slop_query_edges",     description: "Get edges for a node" },
  { name: "slop_list_dimensions", description: "List dimensions with counts" },
  { name: "slop_get_context",     description: "Graph stats (nodes, edges, chunks)" },
  { name: "slop_sqlite_query",    description: "Read-only SQL (SELECT/WITH/PRAGMA)" },
  { name: "slop_read_skill",      description: "Read a skill's markdown content" },
];
```

Every handler calls a corresponding function in `latent-space-bots/src/db.ts` which runs parameterized SQL against Turso. Results are truncated to 4000 chars to prevent token bloat.

### Write Operations (Not Tools)

Slop's write operations happen **outside the LLM tool loop**, triggered only by Discord slash commands:

| Command | What it writes |
|---------|---------------|
| `/join` | Creates a member node |
| `/paper-club` | Creates a scheduled event node |
| `/builders-club` | Creates a scheduled event node |

Member profile updates also happen post-response (updating notes, metadata, and edges) but are not LLM-callable tools.

### Key Difference from Hub Tools

| | Hub Tools | Slop Tools |
|---|-----------|-----------|
| **Format** | Vercel AI SDK `tool()` + Zod | OpenAI function-calling JSON |
| **DB access** | Via `nodeService`, `searchService` etc. | Direct SQL in `db.ts` |
| **Read tools** | 8 | 8 |
| **Write tools** | 10 | 0 (writes via slash commands only) |
| **Prefix** | `ls_` (MCP) / no prefix (internal) | `slop_` |
| **Used by** | Web app agent, MCP clients | Discord bot only |
