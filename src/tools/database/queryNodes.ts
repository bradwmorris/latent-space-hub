import { tool } from 'ai';
import { z } from 'zod';
import { nodeService } from '@/services/database/nodes';
import { formatNodeForChat } from '../infrastructure/nodeFormatter';
import type { Node } from '@/types/database';

export const queryNodesTool = tool({
  description: 'Search nodes by title/notes/dimensions',
  inputSchema: z.object({
    filters: z.object({
      dimensions: z.array(z.string()).describe('Filter by dimensions (e.g., ["research", "ai", "technology"]). Replaces old type/stage filtering.').optional(),
      search: z.string().describe('Search term to match against title or notes').optional(),
      limit: z.number().min(1).max(50).default(10).describe('Maximum number of results to return')
    }).optional()
  }),
  execute: async ({ filters = {} }) => {
    console.log('🔍 QueryNodes tool called with filters:', JSON.stringify(filters, null, 2));
    try {
      const limit = filters.limit || 10;

      const searchTerm = filters.search?.trim();
      if (searchTerm && /^\d+$/.test(searchTerm)) {
        const nodeId = Number(searchTerm);
        const node = await nodeService.getNodeById(nodeId);
        if (!node) {
          return {
            success: true,
            data: {
              nodes: [],
              count: 0,
              filters_applied: filters,
            },
            message: `Found 0 nodes matching id ${nodeId}`,
          };
        }

        const formatted = formatNodeForChat({
          id: node.id,
          title: node.title,
          dimensions: node.dimensions || [],
        });

        return {
          success: true,
          data: {
            nodes: [{
              id: node.id,
              title: node.title,
              dimensions: node.dimensions || [],
              formatted_display: formatted,
            }],
            count: 1,
            filters_applied: filters,
          },
          message: `Found 1 node matching id ${nodeId}:\n${formatted}`,
        };
      }

      // Add timeout to prevent hanging
      const timeoutPromise: Promise<Node[] | undefined> = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('QueryNodes timeout after 10 seconds')), 10000);
      });

      // Use new nodeService with dimension-based filtering
      const nodesPromise: Promise<Node[] | undefined> = nodeService.getNodes({
        limit,
        dimensions: filters.dimensions,
        search: filters.search
      });

      const nodes = await Promise.race<Node[] | undefined>([nodesPromise, timeoutPromise]);

      // Handle the case where nodes might be undefined/null
      const safeNodes: Node[] = Array.isArray(nodes) ? nodes : [];
      const limitedNodes = safeNodes.slice(0, limit);

      // Format nodes for chat display
      const formattedNodes = limitedNodes.map(node => {
        const formatted = formatNodeForChat({
          id: node.id,
          title: node.title,
          dimensions: node.dimensions || []
        });
        return {
          id: node.id,
          title: node.title,
          dimensions: node.dimensions || [],
          formatted_display: formatted
        };
      });

      // Create message with formatted node labels only (no full node payload)
      const formattedLabels = formattedNodes.map(node => node.formatted_display).join(', ');
      const message = `Found ${safeNodes.length} nodes${filters.dimensions ? ` with dimensions: ${filters.dimensions.join(', ')}` : ''}${filters.search ? ` matching: "${filters.search}"` : ''}${formattedLabels ? `:\n${formattedLabels}` : ''}`;

      return {
        success: true,
        data: {
          nodes: formattedNodes,
          count: safeNodes.length,
          filters_applied: filters
        },
        message: message
      };
    } catch (error) {
      console.error('QueryNodes tool error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to query nodes',
        data: {
          nodes: [],
          count: 0,
          filters_applied: filters
        }
      };
    }
  }
});

// Legacy export for backwards compatibility
export const queryItemsTool = queryNodesTool;
