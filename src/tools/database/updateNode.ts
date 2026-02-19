import { tool } from 'ai';
import { z } from 'zod';

export const updateNodeTool = tool({
  description: 'Update node fields',
  inputSchema: z.object({
    id: z.number().describe('The ID of the node to update'),
    updates: z.object({
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New notes (mapped to notes field internally)'),
      link: z.string().optional().describe('New link'),
      dimensions: z.array(z.string()).optional().describe('New dimension tags - completely replaces existing dimensions'),
      chunk: z.string().optional().describe('New chunk content'),
      metadata: z.record(z.any()).optional().describe('New metadata - completely replaces existing metadata')
    }).describe('Object containing the fields to update')
  }),
  execute: async ({ id, updates }) => {
    try {
      if (!updates || Object.keys(updates).length === 0) {
        return {
          success: false,
          error: 'updateNode requires at least one field in the updates object.',
          data: null
        };
      }

      // MCP backward compat: external schema uses "content", internally we use "notes"
      // Map content → notes before processing
      const internalUpdates: Record<string, any> = { ...updates };
      if (updates.content !== undefined) {
        internalUpdates.notes = updates.content;
        delete internalUpdates.content;
      }

      // FORCE APPEND for notes field - fetch existing and append new notes
      if (internalUpdates.notes) {
        const fetchResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/nodes/${id}`);
        if (fetchResponse.ok) {
          const { node } = await fetchResponse.json();
          const existingNotes = (node?.notes || '').trim();
          const newNotes = internalUpdates.notes.trim();

          // Skip if new notes are identical to existing (model sent duplicate)
          if (existingNotes === newNotes) {
            console.log(`[updateNode] ERROR - new notes identical to existing (${existingNotes.length} chars). Model should NOT call updateNode again.`);
            return {
              success: false,
              error: 'Notes already up to date - do not call updateNode again. Move to next step.',
              data: null
            };
          }

          // Detect if adding a section that already exists
          const newSectionMatch = newNotes.match(/^##\s+(.+)$/m);
          if (newSectionMatch && existingNotes) {
            const sectionHeader = newSectionMatch[0];
            if (existingNotes.includes(sectionHeader)) {
              console.log(`[updateNode] ERROR - Section "${sectionHeader}" already exists in node`);
              return {
                success: false,
                error: `Section "${sectionHeader}" already exists in this node. Cannot append duplicate section.`,
                data: null
              };
            }
          }

          // Detect if model included existing notes + new notes
          if (existingNotes && newNotes.startsWith(existingNotes)) {
            const actualNewNotes = newNotes.substring(existingNotes.length).trim();
            console.log(`[updateNode] Model included existing notes - extracting new part only (${actualNewNotes.length} chars)`);
            const separator = existingNotes.endsWith('\n\n') ? '' : '\n\n';
            internalUpdates.notes = `${existingNotes}${separator}${actualNewNotes}`;
          } else if (existingNotes) {
            const separator = existingNotes.endsWith('\n\n') ? '' : '\n\n';
            internalUpdates.notes = `${existingNotes}${separator}${newNotes}`;
            console.log(`[updateNode] Appended notes: ${existingNotes.length} + ${newNotes.length} = ${internalUpdates.notes.length} chars`);
          } else {
            console.log(`[updateNode] No existing notes, using new notes as-is (${newNotes.length} chars)`);
          }
        }
      }

      // Call the nodes API endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/nodes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(internalUpdates)
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to update node',
          data: null
        };
      }

      return {
        success: true,
        data: result.node,
        message: `Updated node ID ${id}${internalUpdates.dimensions ? ` with dimensions: ${internalUpdates.dimensions.join(', ')}` : ''}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update node',
        data: null
        };
    }
  }
});

// Legacy export for backwards compatibility
export const updateItemTool = updateNodeTool;
