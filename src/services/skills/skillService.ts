import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

export interface SkillMeta {
  name: string;
  description: string;
  skillGroup: 'slop' | 'agent';
  fileName: string;
}

export interface Skill extends SkillMeta {
  content: string;
}

const isReadOnly = process.env.NEXT_PUBLIC_READONLY_MODE === 'true';

const BUNDLED_SLOP_SKILLS_DIR = path.join(process.cwd(), 'src/config/skills/slop');
const BUNDLED_AGENT_SKILLS_DIR = path.join(process.cwd(), 'src/config/skills/agents');
const USER_SKILLS_DIR = path.join(os.homedir(), '.latent-space-hub/skills');

const MAX_USER_SKILLS = 10;
const SLOP_SKILL_ORDER = [
  'start-here.md',
  'graph-search.md',
  'member-profiles.md',
  'db-operations.md',
  'curation.md',
  'event-scheduling.md',
];
const AGENT_SKILL_ORDER = [
  'agent.md',
  'mcp-quickstart.md',
];

const LEGACY_REDIRECTS: Record<string, string> = {
  'start-here': 'start-here',
  'schema': 'db-operations',
  'search': 'db-operations',
  'content-types': 'db-operations',
  'bots': 'start-here',
  'slop': 'start-here',
  'slop-agent': 'start-here',
  'categories': 'start-here',
  'agent-engineering': 'agent',
  'context-engineering': 'agent',
};

function ensureUserDir(): void {
  if (isReadOnly) return;
  if (!fs.existsSync(USER_SKILLS_DIR)) {
    fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
  }
}

function readSkillsFromDir(dir: string, defaultSkillGroup?: 'slop' | 'agent'): Skill[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  return files.map(file => {
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
    const { data, content } = matter(raw);
    const skillGroup = defaultSkillGroup || (data.skill_group === 'agent' ? 'agent' : 'slop');
    return {
      name: data.name || file.replace('.md', ''),
      description: data.description || '',
      skillGroup,
      fileName: file,
      content: content.trim(),
    };
  });
}

function readBundledSkills(): Skill[] {
  const slop = readSkillsFromDir(BUNDLED_SLOP_SKILLS_DIR, 'slop');
  const agent = readSkillsFromDir(BUNDLED_AGENT_SKILLS_DIR, 'agent');
  return [...slop, ...agent];
}

function resolveSkillName(name: string): string {
  const lower = name.toLowerCase().trim().replace(/\.md$/, '');
  return LEGACY_REDIRECTS[lower] || lower;
}

function skillOrderIndex(fileName: string, skillGroup: 'slop' | 'agent'): number {
  const list = skillGroup === 'agent' ? AGENT_SKILL_ORDER : SLOP_SKILL_ORDER;
  const idx = list.indexOf(fileName);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function sortSkills(skills: Skill[]): Skill[] {
  return skills.slice().sort((a, b) => {
    if (a.skillGroup !== b.skillGroup) {
      return a.skillGroup === 'slop' ? -1 : 1;
    }
    const ai = skillOrderIndex(a.fileName, a.skillGroup);
    const bi = skillOrderIndex(b.fileName, b.skillGroup);
    if (ai !== bi) return ai - bi;
    return a.fileName.localeCompare(b.fileName);
  });
}

export function listSkills(): SkillMeta[] {
  const bundled = sortSkills(readBundledSkills());

  const skills: SkillMeta[] = bundled.map(s => ({
    name: s.name,
    description: s.description,
    skillGroup: s.skillGroup,
    fileName: s.fileName,
  }));

  if (!isReadOnly) {
    ensureUserDir();
    const user = readSkillsFromDir(USER_SKILLS_DIR);
    const bundledNames = new Set(skills.map(s => s.name.toLowerCase()));
    for (const s of user) {
      if (!bundledNames.has(s.name.toLowerCase())) {
        skills.push({ name: s.name, description: s.description, skillGroup: s.skillGroup, fileName: s.fileName });
      }
    }
  }

  return skills;
}

export function readSkill(name: string): Skill | null {
  const resolved = resolveSkillName(name);

  // Search bundled skills
  const bundled = sortSkills(readBundledSkills());
  const bundledMatch = bundled.find(s => s.name.toLowerCase() === resolved || s.fileName.toLowerCase() === `${resolved}.md`);
  if (bundledMatch) return bundledMatch;

  // Then user skills
  if (!isReadOnly) {
    ensureUserDir();
    const user = sortSkills(readSkillsFromDir(USER_SKILLS_DIR));
    const userMatch = user.find(s => s.name.toLowerCase() === resolved || s.fileName.toLowerCase() === `${resolved}.md`);
    if (userMatch) return userMatch;
  }

  return null;
}

export function writeSkill(name: string, content: string): void {
  if (isReadOnly) return;
  ensureUserDir();

  const filename = `${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.md`;

  // Check max limit
  const existing = fs.readdirSync(USER_SKILLS_DIR).filter(f => f.endsWith('.md'));
  const isUpdate = existing.some(f => f === filename);
  if (!isUpdate && existing.length >= MAX_USER_SKILLS) {
    throw new Error(`Maximum of ${MAX_USER_SKILLS} custom skills reached. Delete one before adding another.`);
  }

  const filepath = path.join(USER_SKILLS_DIR, filename);
  fs.writeFileSync(filepath, content, 'utf-8');
}

export function deleteSkill(name: string): void {
  if (isReadOnly) return;
  ensureUserDir();

  const filename = `${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.md`;
  const filepath = path.join(USER_SKILLS_DIR, filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }
}
