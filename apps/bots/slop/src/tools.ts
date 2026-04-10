/**
 * Slop's local tool definitions and handlers.
 *
 * These replace the MCP tool definitions. The LLM sees these as available
 * functions and the tool loop executes them via direct Turso queries.
 */
import type { Client as LibsqlClient } from "@libsql/client";
import { OPENAI_API_KEY } from "./config";
import * as dbOps from "./db";

// ── OpenAI function calling types ──────────────────────────────

export type OpenAIToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ToolHandler = {
  execute: (args: Record<string, unknown>, db: LibsqlClient) => Promise<string>;
};

// ── Tool definitions (what the LLM sees) ───────────────────────

export const TOOL_DEFINITIONS: OpenAIToolDef[] = [
  // ── Search tools (3) ────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "slop_semantic_search",
      description:
        "Search by meaning using vector embeddings. Finds content even when exact words don't match: 'infrastructure investment' finds 'capex spending'. Default search tool for natural language questions. Searches both node descriptions and transcript/article passages, returns fused results.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query" },
          limit: { type: "number", description: "Max results (default 8, max 20)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "slop_search_nodes",
      description:
        "Keyword substring search on node titles, descriptions, and notes (SQL LIKE). Does NOT understand meaning. Use for known names, exact terms, or browsing by node_type. Returns node metadata but not transcript text.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Exact keyword or name to match" },
          limit: { type: "number", description: "Max results (default 10, max 25)" },
          node_type: { type: "string", description: "Filter by type: podcast, article, ainews, guest, entity, member, event, workshop, paper-club, builders-club" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "slop_search_content",
      description:
        "Keyword search through transcript and article text using full-text indexing (FTS5). Matches exact words only, not meaning. Use for specific quotes, technical terms, or phrases you expect to appear verbatim in content.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keywords or phrase to find in transcripts/articles" },
          limit: { type: "number", description: "Max results (default 10, max 25)" },
        },
        required: ["query"],
      },
    },
  },
  // ── Graph traversal tools (3) ───────────────────────────────
  {
    type: "function",
    function: {
      name: "slop_get_nodes",
      description: "Load full node records by ID. Use after search to get complete details (notes, metadata, link, description).",
      parameters: {
        type: "object",
        properties: {
          nodeIds: {
            type: "array",
            items: { type: "number" },
            description: "Node IDs to retrieve (max 10)",
          },
        },
        required: ["nodeIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "slop_query_edges",
      description: "Get connections for a node. Returns linked nodes with relationship type and explanation. Use to find who appeared in an episode, what topics a guest covers, etc.",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "number", description: "Node ID to get connections for" },
          limit: { type: "number", description: "Max edges (default 25)" },
        },
        required: ["nodeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "slop_list_dimensions",
      description: "List all priority dimensions (categories) with node counts.",
      parameters: { type: "object", properties: {} },
    },
  },
  // ── Utility tools (3) ───────────────────────────────────────
  {
    type: "function",
    function: {
      name: "slop_get_upcoming_events",
      description:
        "Get upcoming scheduled events from event nodes only. Use this for 'upcoming paper clubs/builders clubs' questions instead of raw SQL. Supports strict event_type filtering.",
      parameters: {
        type: "object",
        properties: {
          event_type: { type: "string", enum: ["paper-club", "builders-club"], description: "Optional event type filter" },
          limit: { type: "number", description: "Max events (default 10, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "slop_get_context",
      description: "Get wiki-base stats: total nodes, edges, and chunks.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "slop_sqlite_query",
      description:
        "Run read-only SQL (SELECT/WITH/PRAGMA). Use for date-range filters, aggregations, counting, and queries the other tools can't express.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query (SELECT/WITH/PRAGMA only)" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "slop_read_skill",
      description: "Read a skill by name. Returns full markdown content with instructions.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name (e.g. 'db-operations', 'event-scheduling')" },
        },
        required: ["name"],
      },
    },
  },
];

// ── Tool handlers (what executes when the LLM calls a tool) ────

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  slop_semantic_search: {
    execute: async (args, db) => {
      const query = String(args.query || "");
      const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
      const result = await dbOps.semanticSearch(db, query, OPENAI_API_KEY, limit);
      if (result.method === "unavailable") {
        return JSON.stringify({ error: "Semantic search unavailable (no embedding API key). Use slop_search_nodes or slop_search_content instead." });
      }
      if (result.method === "embedding_failed") {
        return JSON.stringify({ error: "Failed to generate query embedding. Use slop_search_nodes or slop_search_content instead." });
      }
      return JSON.stringify({ method: result.method, results: result.results, count: result.results.length });
    },
  },

  slop_search_nodes: {
    execute: async (args, db) => {
      const query = String(args.query || "");
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
      const nodeType = typeof args.node_type === "string" ? args.node_type : undefined;
      const nodes = await dbOps.searchNodes(db, query, limit, nodeType);
      return JSON.stringify({ nodes, count: nodes.length });
    },
  },

  slop_search_content: {
    execute: async (args, db) => {
      const query = String(args.query || "");
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
      const results = await dbOps.searchContent(db, query, limit);
      return JSON.stringify({ results, count: results.length });
    },
  },

  slop_get_nodes: {
    execute: async (args, db) => {
      const nodeIds = Array.isArray(args.nodeIds) ? args.nodeIds.map(Number) : [];
      const nodes = await dbOps.getNodesById(db, nodeIds);
      return JSON.stringify({ nodes, count: nodes.length });
    },
  },

  slop_query_edges: {
    execute: async (args, db) => {
      const nodeId = Number(args.nodeId);
      const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 50);
      const edges = await dbOps.queryEdges(db, nodeId, limit);
      return JSON.stringify({ edges, count: edges.length });
    },
  },

  slop_list_dimensions: {
    execute: async (_args, db) => {
      const dimensions = await dbOps.listDimensions(db);
      return JSON.stringify({ dimensions, count: dimensions.length });
    },
  },

  slop_get_context: {
    execute: async (_args, db) => {
      const context = await dbOps.getContext(db);
      return JSON.stringify(context);
    },
  },

  slop_get_upcoming_events: {
    execute: async (args, db) => {
      const eventType = (args.event_type === "paper-club" || args.event_type === "builders-club")
        ? args.event_type
        : undefined;
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const events = await dbOps.getUpcomingScheduledEvents(db, { eventType, limit });
      return JSON.stringify({ events, count: events.length });
    },
  },

  slop_sqlite_query: {
    execute: async (args, db) => {
      const sql = String(args.sql || "");
      const rows = await dbOps.sqliteQuery(db, sql);
      return JSON.stringify({ rows, count: rows.length });
    },
  },

  // slop_read_skill is handled separately in index.ts (reads from local skills/ dir)
};
