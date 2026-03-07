import { tool } from 'ai';
import { z } from 'zod';
import { listSkills } from '@/services/skills/skillService';

export const listSkillsTool = tool({
  description: 'List all available skills with their names, descriptions, and categories.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const skills = listSkills();
      return {
        success: true,
        data: skills,
        message: `Found ${skills.length} skills`,
      };
    } catch (error) {
      console.error('[listSkills] error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list skills',
        data: [],
      };
    }
  },
});
