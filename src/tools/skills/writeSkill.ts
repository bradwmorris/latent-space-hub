import { tool } from 'ai';
import { z } from 'zod';
import { writeSkill } from '@/services/skills/skillService';
import { eventBroadcaster } from '@/services/events';

export const writeSkillTool = tool({
  description: 'Write or update a custom skill. Content should be full markdown with YAML frontmatter (name, description).',
  inputSchema: z.object({
    name: z.string().describe('The name of the skill to write'),
    content: z.string().describe('Full markdown content including YAML frontmatter'),
  }),
  execute: async ({ name, content }) => {
    try {
      writeSkill(name, content);
      eventBroadcaster.broadcast({ type: 'GUIDE_UPDATED', data: { name } });
      return {
        success: true,
        data: { name },
        message: `Skill "${name}" saved`,
      };
    } catch (error) {
      console.error('[writeSkill] error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write skill',
        data: null,
      };
    }
  },
});
