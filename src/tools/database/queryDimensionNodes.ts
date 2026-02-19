import { tool } from 'ai';
import { z } from 'zod';
import { nodeService } from '@/services/database/nodes';
import { formatNodeForChat } from '../infrastructure/nodeFormatter';
import type { Node } from '@/types/database';

export const queryDimensionNodesTool = tool({
  description: 'Query all nodes within a specific dimension. Returns nodes sorted by edge count (most connected first).',
  inputSchema: z.object({
    dimension: z.string().describe('The dimension name to query nodes from'),
    limit: z.number().optional().default(20).describe('Maximum number of nodes to return (default: 20)'),
    offset: z.number().optional().default(0).describe('Number of nodes to skip for pagination'),
    includeContent: z.boolean().optional().default(false).describe('Include truncated content preview (default: false)'),
  }),
  execute: async ({ dimension, limit = 20, offset = 0, includeContent = false }) => {
    try {
      // Query nodes with this dimension
      const nodes = await nodeService.getNodes({
        dimensions: [dimension],
        limit,
        offset,
        sortBy: 'edges',
      });

      if (!nodes || nodes.length === 0) {
        return {
          success: true,
          dimension,
          nodes: [],
          total: 0,
          message: `No nodes found in dimension "${dimension}"`,
        };
      }

      const formattedNodes = nodes.map((node: Node) => {
        const formatted: Record<string, unknown> = {
          id: node.id,
          title: node.title,
          label: formatNodeForChat({
            id: node.id,
            title: node.title,
            dimensions: node.dimensions || [],
          }),
          edgeCount: node.edge_count || 0,
          dimensions: node.dimensions || [],
        };

        if (includeContent && node.notes) {
          // Truncate to ~100 chars
          formatted.contentPreview = node.notes.length > 100
            ? node.notes.substring(0, 100) + '...'
            : node.notes;
        }

        return formatted;
      });

      return {
        success: true,
        dimension,
        nodes: formattedNodes,
        total: nodes.length,
        hasMore: nodes.length >= limit,
        message: `Found ${nodes.length} nodes in dimension "${dimension}"`,
      };
    } catch (error) {
      console.error('queryDimensionNodes error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to query dimension nodes',
      };
    }
  },
});
