import { tool } from 'ai';
import { z } from 'zod';
import { deleteSkill } from '@/services/skills/skillService';
import { eventBroadcaster } from '@/services/events';

export const deleteSkillTool = tool({
  description: 'Delete a custom skill by name.',
  inputSchema: z.object({
    name: z.string().describe('The name of the skill to delete'),
  }),
  execute: async ({ name }) => {
    try {
      deleteSkill(name);
      eventBroadcaster.broadcast({ type: 'SKILL_UPDATED', data: { name } });
      return {
        success: true,
        data: { name },
        message: `Skill "${name}" deleted`,
      };
    } catch (error) {
      console.error('[deleteSkill] error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete skill',
        data: null,
      };
    }
  },
});
