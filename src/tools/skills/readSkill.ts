import { tool } from 'ai';
import { z } from 'zod';
import { readSkill } from '@/services/skills/skillService';

export const readSkillTool = tool({
  description: 'Read a skill by name. Returns the full markdown content with instructions.',
  inputSchema: z.object({
    name: z.string().describe('The name of the skill to read'),
  }),
  execute: async ({ name }) => {
    try {
      const skill = readSkill(name);
      if (!skill) {
        return {
          success: false,
          error: `Skill "${name}" not found`,
          data: null,
        };
      }
      return {
        success: true,
        data: skill,
        message: `Loaded skill: ${skill.name}`,
      };
    } catch (error) {
      console.error('[readSkill] error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read skill',
        data: null,
      };
    }
  },
});
