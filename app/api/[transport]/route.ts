/**
 * Latent Space Hub MCP Endpoint (via mcp-handler)
 *
 * Exposes ls_* tools for external agents to query the Latent Space knowledge graph.
 *
 * Usage:
 *   claude mcp add --transport http latent-space https://latent-space-hub.vercel.app/api/mcp
 */

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

import { nodeService, edgeService } from '@/services/database';
import { getSQLiteClient } from '@/services/database/sqlite-client';

const ALLOW_WRITES = process.env.MCP_ALLOW_WRITES === 'true';

const handler = createMcpHandler(
  (server) => {
    // ─────────────────────────────────────────────────────────────────────────────
    // READ TOOLS (always enabled)
    // ─────────────────────────────────────────────────────────────────────────────

    // ls_search_nodes - Full-text search
    server.registerTool(
      'ls_search_nodes',
      {
        title: 'Search Latent Space nodes',
        description: 'Search the Latent Space knowledge graph by keyword. Returns matching nodes with title, description, dimensions.',
        inputSchema: {
          query: z.string().min(1).max(400).describe('Search query (keywords)'),
          limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
        },
      },
      async ({ query, limit = 20 }) => {
        const filters: any = {
          search: query.trim(),
          limit: Math.min(Math.max(limit, 1), 50),
        };

        const nodes = await nodeService.getNodes(filters);

        const summary = nodes.length === 0
          ? `No results found for "${query}".`
          : `Found ${nodes.length} result(s) for "${query}".`;

        const nodeList = nodes.map((node: any) =>
          `- #${node.id}: ${node.title} [${(node.dimensions || []).join(', ')}]`
        ).join('\n');

        return {
          content: [{ type: 'text', text: `${summary}\n\n${nodeList}` }],
        };
      }
    );

    // ls_get_nodes - Load full node content by ID
    server.registerTool(
      'ls_get_nodes',
      {
        title: 'Get Latent Space nodes by ID',
        description: 'Load full content of specific nodes by their IDs.',
        inputSchema: {
          nodeIds: z.array(z.number().int().positive()).min(1).max(10).describe('Node IDs to load (max 10)'),
        },
      },
      async ({ nodeIds }) => {
        const uniqueIds = Array.from(new Set(nodeIds.filter(id => Number.isFinite(id) && id > 0)));

        if (uniqueIds.length === 0) {
          return {
            content: [{ type: 'text', text: 'No valid node IDs provided.' }],
          };
        }

        const results: string[] = [];
        for (const id of uniqueIds) {
          try {
            const node = await nodeService.getNodeById(id);
            if (node) {
              results.push(`## Node #${node.id}: ${node.title}\n`
                + `**Description:** ${node.description || 'None'}\n`
                + `**Dimensions:** ${(node.dimensions || []).join(', ') || 'None'}\n`
                + `**Link:** ${node.link || 'None'}\n`
                + `**Content:** ${node.content || 'None'}\n`
              );
            } else {
              results.push(`Node #${id}: Not found`);
            }
          } catch (e) {
            results.push(`Node #${id}: Error loading`);
          }
        }

        return {
          content: [{ type: 'text', text: `Loaded ${results.length} node(s):\n\n${results.join('\n---\n')}` }],
        };
      }
    );

    // ls_query_edges - Find connections
    server.registerTool(
      'ls_query_edges',
      {
        title: 'Query Latent Space edges',
        description: 'Find connections (edges) between nodes. Use nodeId to get all connections for a specific node.',
        inputSchema: {
          nodeId: z.number().int().positive().optional().describe('Find edges connected to this node'),
          limit: z.number().min(1).max(100).optional().describe('Max edges to return (default 50)'),
        },
      },
      async ({ nodeId, limit = 50 }) => {
        let edges: any[];

        if (nodeId) {
          const connections = await edgeService.getNodeConnections(nodeId);
          edges = connections.slice(0, limit).map(c => c.edge);
        } else {
          edges = await edgeService.getEdges();
          edges = edges.slice(0, limit);
        }

        const parseContext = (ctx: any) => {
          if (typeof ctx === 'string') {
            try { return JSON.parse(ctx); } catch { return {}; }
          }
          return ctx || {};
        };

        const edgeList = edges.map((e: any) => {
          const ctx = parseContext(e.context);
          return `- Edge #${e.id}: Node #${e.from_node_id} → Node #${e.to_node_id} | ${ctx.explanation || 'No explanation'}`;
        }).join('\n');

        return {
          content: [{ type: 'text', text: `Found ${edges.length} connection(s):\n\n${edgeList}` }],
        };
      }
    );

    // ls_list_dimensions - List all dimensions
    server.registerTool(
      'ls_list_dimensions',
      {
        title: 'List Latent Space dimensions',
        description: 'List all dimensions (categories/tags) in the knowledge graph with node counts.',
        inputSchema: {},
      },
      async () => {
        const sqlite = getSQLiteClient();

        const result = await sqlite.query(`
          WITH dimension_counts AS (
            SELECT nd.dimension, COUNT(*) AS count
            FROM node_dimensions nd
            GROUP BY nd.dimension
          )
          SELECT
            d.name AS dimension,
            d.description,
            COALESCE(dc.count, 0) AS count
          FROM dimensions d
          LEFT JOIN dimension_counts dc ON dc.dimension = d.name
          ORDER BY dc.count DESC, d.name ASC
        `);

        const dimensions = result.rows.map((row: any) =>
          `- ${row.dimension}: ${row.count} node(s)${row.description ? ` - ${row.description}` : ''}`
        ).join('\n');

        return {
          content: [{ type: 'text', text: `${result.rows.length} dimensions:\n\n${dimensions}` }],
        };
      }
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // WRITE TOOLS (only when MCP_ALLOW_WRITES=true)
    // ─────────────────────────────────────────────────────────────────────────────

    if (ALLOW_WRITES) {
      server.registerTool(
        'ls_add_node',
        {
          title: 'Add Latent Space node',
          description: 'Create a new node in the knowledge graph.',
          inputSchema: {
            title: z.string().min(1).max(160).describe('Node title'),
            content: z.string().max(20000).optional().describe('Node content/notes'),
            link: z.string().url().optional().describe('Source URL'),
            description: z.string().max(2000).optional().describe('Short description'),
            dimensions: z.array(z.string()).min(1).max(5).describe('Categories/tags (at least 1)'),
          },
        },
        async ({ title, content, link, description, dimensions }) => {
          const node = await nodeService.createNode({
            title: title.trim(),
            content: content?.trim(),
            link: link?.trim(),
            description: description?.trim(),
            dimensions,
          });

          return {
            content: [{ type: 'text', text: `Created node #${node.id}: ${node.title}` }],
          };
        }
      );
    }
  },
  {
    serverInfo: {
      name: 'latent-space-hub',
      version: '1.0.0',
    },
  },
  {
    basePath: '/api',
    maxDuration: 30,
    verboseLogs: false,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
