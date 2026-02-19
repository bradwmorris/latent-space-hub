import { tool } from 'ai';
import { z } from 'zod';
import { edgeService } from '@/services/database/edges';

export const updateEdgeTool = tool({
  description: 'Update edge context/source',
  inputSchema: z.object({
    edge_id: z.number().describe('The ID of the edge to update'),
    updates: z.object({
      context: z.record(z.any()).optional().describe('Updated context information for this edge - can include explanation, relationship type, strength, notes, etc.'),
      source: z.enum(['user', 'ai_similarity', 'helper_name']).optional().describe('Updated source classification for this edge')
    }).describe('Fields to update on the edge')
  }),
  execute: async (params) => {
    console.log('📝 UpdateEdge tool called with params:', JSON.stringify(params, null, 2));
    
    try {
      // Validate that edge exists before updating
      const existingEdge = await edgeService.getEdgeById(params.edge_id);
      if (!existingEdge) {
        return {
          success: false,
          error: `Edge with ID ${params.edge_id} not found`,
          data: null
        };
      }

      // Filter out undefined values from updates
      const cleanUpdates = Object.fromEntries(
        Object.entries(params.updates).filter(([_, value]) => value !== undefined)
      );

      if (Object.keys(cleanUpdates).length === 0) {
        return {
          success: false,
          error: 'No valid updates provided',
          data: existingEdge
        };
      }

      // Update the edge
      const updatedEdge = await edgeService.updateEdge(params.edge_id, cleanUpdates);

      // Build descriptive message
      const updateDescriptions = [];
      if (cleanUpdates.context) updateDescriptions.push('context');
      if (cleanUpdates.source) updateDescriptions.push(`source to ${cleanUpdates.source}`);

      return {
        success: true,
        data: updatedEdge,
        message: `Updated edge ${params.edge_id}: ${updateDescriptions.join(', ')}`
      };
    } catch (error) {
      console.error('UpdateEdge tool error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update edge',
        data: null
      };
    }
  }
});
