import { tool } from 'ai';
import { z } from 'zod';
import { DimensionService } from '@/services/database/dimensionService';
import { getSQLiteClient } from '@/services/database/sqlite-client';

export const getDimensionTool = tool({
  description: 'Get detailed information about a specific dimension by name, including its description, priority status, and node count.',
  inputSchema: z.object({
    name: z.string().describe('The exact name of the dimension to retrieve')
  }),
  execute: async ({ name }) => {
    console.log('📁 GetDimension tool called for:', name);
    try {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return {
          success: false,
          error: 'Dimension name is required',
          data: null
        };
      }

      // Get dimension details from service
      const dimension = await DimensionService.getDimensionByName(trimmedName);

      // Get node count for this dimension
      const sqlite = getSQLiteClient();
      const countResult = await sqlite.query(`
        SELECT COUNT(*) AS count
        FROM node_dimensions
        WHERE dimension = ?
      `, [trimmedName]);

      const nodeCount = countResult.rows.length > 0
        ? Number((countResult.rows[0] as { count: number }).count)
        : 0;

      if (!dimension) {
        // Dimension might exist in node_dimensions but not in dimensions table
        if (nodeCount > 0) {
          return {
            success: true,
            data: {
              name: trimmedName,
              description: null,
              isPriority: false,
              nodeCount,
              exists: true,
              hasMetadata: false
            },
            message: `Dimension "${trimmedName}" exists with ${nodeCount} nodes but has no metadata (description/priority not set).`
          };
        }

        return {
          success: false,
          error: `Dimension "${trimmedName}" not found`,
          data: null
        };
      }

      const result = {
        name: dimension.name,
        description: dimension.description,
        isPriority: dimension.is_priority,
        nodeCount,
        updatedAt: dimension.updated_at,
        exists: true,
        hasMetadata: true
      };

      // Build descriptive message
      const parts: string[] = [];
      parts.push(`Dimension: ${result.name}`);
      if (result.isPriority) parts.push('Status: 🔒 Priority (locked)');
      parts.push(`Nodes: ${result.nodeCount}`);
      if (result.description) parts.push(`Description: ${result.description}`);
      parts.push(`Last updated: ${result.updatedAt}`);

      return {
        success: true,
        data: result,
        message: parts.join('\n')
      };
    } catch (error) {
      console.error('GetDimension tool error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get dimension',
        data: null
      };
    }
  }
});
