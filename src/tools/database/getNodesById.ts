import { tool } from 'ai';
import { z } from 'zod';
import { nodeService } from '@/services/database/nodes';

export const getNodesByIdTool = tool({
  description: 'Load full node records by IDs',
  inputSchema: z.object({
    nodeIds: z.array(z.number().int().positive()).min(1).max(10).describe('List of node IDs to load'),
    includeContentPreview: z.boolean().default(true).describe('Whether to return a trimmed content preview for each node'),
  }),
  execute: async ({ nodeIds, includeContentPreview }) => {
    const uniqueIds = Array.from(new Set(nodeIds.filter(id => Number.isFinite(id) && id > 0)));
    if (uniqueIds.length === 0) {
      return {
        success: false,
        error: 'No valid node IDs provided',
        data: { nodes: [] },
      };
    }

    const nodes = await Promise.all(
      uniqueIds.map(async id => {
        try {
          const node = await nodeService.getNodeById(id);
          if (!node) return null;
          const preview = includeContentPreview
            ? (node.notes || node.description || '')
                .split(/\s+/)
                .slice(0, 80)
                .join(' ')
                .trim()
            : undefined;

          return {
            id: node.id,
            title: node.title,
            link: node.link,
            dimensions: node.dimensions || [],
            chunk_status: node.chunk_status || 'unknown',
            updated_at: node.updated_at,
            content_preview: preview || null,
            metadata: node.metadata ?? null,
          };
        } catch (error) {
          console.warn(`getNodesByIdTool: failed to load node ${id}`, error);
          return null;
        }
      })
    );

    const foundNodes = nodes.filter(Boolean);

    return {
      success: true,
      data: {
        nodes: foundNodes,
        requested: uniqueIds,
        missing: uniqueIds.filter(id => !foundNodes.find(node => node && node.id === id)),
      },
      message: `Loaded ${foundNodes.length} of ${uniqueIds.length} requested nodes.`,
    };
  },
});
