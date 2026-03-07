/**
 * Legacy guide service — delegates to skill service for backward compatibility.
 */
import { listSkills, readSkill, writeSkill, deleteSkill } from '../skills/skillService';
import type { SkillMeta, Skill } from '../skills/skillService';

export interface GuideMeta {
  name: string;
  description: string;
}

export interface Guide extends GuideMeta {
  content: string;
}

function toGuideMeta(s: SkillMeta): GuideMeta {
  return { name: s.name, description: s.description };
}

function toGuide(s: Skill): Guide {
  return { name: s.name, description: s.description, content: s.content };
}

export function listGuides(): GuideMeta[] {
  return listSkills().map(toGuideMeta);
}

export function readGuide(name: string): Guide | null {
  const skill = readSkill(name);
  return skill ? toGuide(skill) : null;
}

export function writeGuide(name: string, content: string): void {
  writeSkill(name, content);
}

export { deleteSkill as deleteGuide };
