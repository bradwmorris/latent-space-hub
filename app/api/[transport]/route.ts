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
import { listGuides, readGuide } from '@/services/guides/guideService';

const ALLOW_WRITES = process.env.MCP_ALLOW_WRITES === 'true';
const MCP_SHARED_SECRET = process.env.MCP_SHARED_SECRET?.trim();
const MCP_RATE_LIMIT_PER_MIN = Number.parseInt(process.env.MCP_RATE_LIMIT_PER_MIN || '0', 10);

const rateLimitState = new Map<string, { count: number; resetAt: number }>();

function getClientId(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  return (forwarded?.split(',')[0]?.trim() || realIp || 'unknown').toLowerCase();
}

function isAuthorized(request: Request): boolean {
  if (!MCP_SHARED_SECRET) return true;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${MCP_SHARED_SECRET}`;
}

function isRateLimited(request: Request): boolean {
  if (!MCP_RATE_LIMIT_PER_MIN || MCP_RATE_LIMIT_PER_MIN <= 0) return false;
  const clientId = getClientId(request);
  const now = Date.now();
  const windowMs = 60_000;
  const entry = rateLimitState.get(clientId);

  if (!entry || now >= entry.resetAt) {
    rateLimitState.set(clientId, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (entry.count >= MCP_RATE_LIMIT_PER_MIN) {
    return true;
  }

  entry.count += 1;
  return false;
}

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
                + `**Notes:** ${node.notes || 'None'}\n`
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

    // ls_list_guides - List available guides
    server.registerTool(
      'ls_list_guides',
      {
        title: 'List Latent Space guides',
        description: 'List available reading guides for exploring the Latent Space hub.',
        inputSchema: {},
      },
      async () => {
        const guides = listGuides();
        if (guides.length === 0) {
          return { content: [{ type: 'text', text: 'No guides available.' }] };
        }

        const lines = guides.map(guide =>
          `- ${guide.name}${guide.description ? ` — ${guide.description}` : ''}`
        ).join('\n');

        return {
          content: [{ type: 'text', text: `Available guides (${guides.length}):\n\n${lines}` }],
        };
      }
    );

    // ls_read_guide - Read a guide by name
    server.registerTool(
      'ls_read_guide',
      {
        title: 'Read a Latent Space guide',
        description: 'Load the full text of a guide by name.',
        inputSchema: {
          name: z.string().min(1).max(120).describe('Guide name (case-insensitive)'),
        },
      },
      async ({ name }) => {
        const guide = readGuide(name.trim());
        if (!guide) {
          return { content: [{ type: 'text', text: `Guide not found: ${name}` }] };
        }

        const header = `# ${guide.name}\n\n${guide.description ? `${guide.description}\n\n` : ''}`;
        return {
          content: [{ type: 'text', text: `${header}${guide.content}` }],
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
          // MCP backward compat: external schema uses "content", internally we store as "notes"
          const node = await nodeService.createNode({
            title: title.trim(),
            notes: content?.trim(),
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

async function guard(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (isRateLimited(request)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  }

  return handler(request);
}

export { guard as GET, guard as POST, guard as DELETE };
