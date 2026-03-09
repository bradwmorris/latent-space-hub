import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { listSkills, readSkill } from '@/services/skills/skillService';

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
}

export interface Doc extends DocMeta {
  content: string;
}

export interface DocNavLink {
  slug: string;
  title: string;
  description: string;
  href: string;
  section: 'Docs' | 'Getting Started (Human)' | 'Slop Skills' | 'Agent Skills';
}

const DOCS_DIR = path.join(process.cwd(), 'src/config/docs');
const BOTS_REPO_DIR = path.resolve(process.cwd(), '../latent-space-bots');
const BOTS_INDEX_PATH = path.join(BOTS_REPO_DIR, 'src/index.ts');
const BOTS_SKILLS_DIR = path.join(BOTS_REPO_DIR, 'skills');
const HUB_SLOP_SKILLS_DIR = path.join(process.cwd(), 'src/config/skills/agents');
const AUTO_SYSTEM_START = '<!-- AUTO:SLOP_SYSTEM_PROMPT_START -->';
const AUTO_SYSTEM_END = '<!-- AUTO:SLOP_SYSTEM_PROMPT_END -->';
const LEGACY_SKILL_SLUG_REDIRECTS: Record<string, string> = {
  'welcome-to-the-hub': 'start-here',
  'slop': 'start-here',
  'slop-agent': 'start-here',
  'agent-engineering': 'agent',
  'context-engineering': 'agent',
};

function extractQuotedStrings(block: string): string[] {
  return [...block.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) =>
    m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
  );
}

function extractArrayStrings(source: string, arrayName: string): string[] {
  const pattern = new RegExp(`const\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm');
  const match = source.match(pattern);
  if (!match) return [];
  return extractQuotedStrings(match[1]);
}

function extractJoinBlockStrings(source: string, varName: string): string[] {
  const pattern = new RegExp(`const\\s+${varName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\.join\\("\\\\n"\\);`, 'm');
  const match = source.match(pattern);
  if (!match) return [];
  return extractQuotedStrings(match[1]);
}

function extractSkillsHeaderLine(source: string): string {
  const match = source.match(/cachedSkillsContext\s*=\s*\[\s*"([^"]+)"/m);
  if (!match) {
    return '[SKILLS] Canonical source: local bot skills directory. Use ls_read_skill(name) for full instructions.';
  }
  return match[1];
}

function buildSlopSkillsLinesFromDir(skillDir: string, orderedSkillNames: string[]): string[] {
  if (!fs.existsSync(skillDir)) return [];
  const files = fs.readdirSync(skillDir).filter((f) => f.endsWith('.md'));
  const byName = new Map<string, { name: string; description: string }>();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(skillDir, file), 'utf-8');
    const { data } = matter(raw);
    const name = String(data.name || file.replace('.md', ''));
    const description = String(data.description || '');
    byName.set(name.toLowerCase(), { name, description });
  }

  const lines: string[] = [];
  for (const skillName of orderedSkillNames) {
    const found = byName.get(skillName.toLowerCase());
    if (!found) continue;
    lines.push(`- **${found.name}**: ${found.description}`);
  }

  if (lines.length) return lines;
  return [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `- **${s.name}**: ${s.description}`);
}

function buildSlopSystemPromptSection(): string {
  const fallbackOrderedSkills = ['Start Here', 'Graph Search', 'Member Profiles', 'DB Operations', 'Curation', 'Event Scheduling'];
  const botsIndexAvailable = fs.existsSync(BOTS_INDEX_PATH);
  const source = botsIndexAvailable ? fs.readFileSync(BOTS_INDEX_PATH, 'utf-8') : '';
  const orderedSkillNames = botsIndexAvailable
    ? extractArrayStrings(source, 'REQUIRED_SLOP_SKILLS')
    : fallbackOrderedSkills;

  const identityLines = botsIndexAvailable
    ? extractJoinBlockStrings(source, 'identity')
    : [
        '[IDENTITY]',
        "You are Slop — Latent Space community's AI. Opinionated, sharp, concise.",
        'Lead with your take. Challenge lazy thinking. Short sentences hit harder — use them.',
        'Bold your strongest claims. End with a question or challenge when debating.',
        "Never agree just to be agreeable. Never hedge. Never use filler like 'interesting' or 'fascinating'.",
        'You are not an assistant. You are an interlocutor.',
      ];
  const rulesLines = botsIndexAvailable
    ? extractJoinBlockStrings(source, 'rules')
    : [
        '[RULES]',
        "Search the knowledge base BEFORE answering factual questions. Don't guess — look it up.",
        'Always link to sources: [Title](url). Never reference content without a link.',
        'Never fabricate names, dates, episodes, quotes, or links. If tools return nothing, say so.',
        "Mark speculation explicitly: 'No hard data, but...' or 'Extrapolating here...'",
      ];
  const skillsHeader = botsIndexAvailable
    ? extractSkillsHeaderLine(source)
    : '[SKILLS] Canonical source: local bot skills directory. Use ls_read_skill(name) for full instructions.';
  const skillsLines = botsIndexAvailable
    ? buildSlopSkillsLinesFromDir(BOTS_SKILLS_DIR, orderedSkillNames)
    : buildSlopSkillsLinesFromDir(HUB_SLOP_SKILLS_DIR, orderedSkillNames);
  const memberBlock = [
    '[MEMBER CONTEXT]',
    'Name: <member name>',
    'Role: <if known>',
    'Company: <if known>',
    'Location: <if known>',
    'Interests: <comma-separated>',
    'Interaction preference: <if known>',
    'Last active: <timestamp>',
    'Recent interactions: <summary>',
    'Use this to personalize your response. Update interaction_preference in <profile> when you learn how they like to interact.',
  ];

  const fullPrompt = [
    ...identityLines,
    '',
    ...rulesLines,
    '',
    skillsHeader,
    ...skillsLines,
    '',
    ...memberBlock,
  ].join('\n');

  return [
    AUTO_SYSTEM_START,
    '## Slop System Message (Live from `latent-space-bots`)',
    '',
    botsIndexAvailable
      ? 'This section is generated at runtime from:'
      : 'This section is generated from fallback mirrored sources (bots repo not mounted here):',
    ...(botsIndexAvailable
      ? ['- `../latent-space-bots/src/index.ts`', '- `../latent-space-bots/skills/*.md`']
      : ['- `src/config/skills/slop/*.md`']),
    '',
    '```text',
    fullPrompt,
    '```',
    AUTO_SYSTEM_END,
  ].join('\n');
}

function injectSlopSystemPromptSection(content: string): string {
  const auto = buildSlopSystemPromptSection();
  const start = content.indexOf(AUTO_SYSTEM_START);
  const end = content.indexOf(AUTO_SYSTEM_END);
  if (start >= 0 && end > start) {
    return `${content.slice(0, start).trimEnd()}\n\n${auto}\n`;
  }
  return `${content.trimEnd()}\n\n${auto}\n`;
}

/** Ordered list of core doc pages. Slug must match filename (without .md) and route. */
const DOC_ORDER = [
  'overview',
  'database',
  'ingestion',
  'index-search',
  'tools',
  'skills',
  'mcp-server',
  'slop-bot',
  'evals',
];

/** Ordered list of getting started pages. */
const GETTING_STARTED_ORDER = [
  'getting-started-humans',
  'getting-started-join-discord',
  'getting-started-familiar-with-ls',
  'getting-started-use-join',
  'getting-started-understand-app-and-bot',
  'getting-started-sign-up-for-sessions',
  'getting-started-subscribe-substack',
  'getting-started-subscribe-youtube',
  'getting-started-contribute-with-slash-commands',
];

export function getDoc(slug: string): Doc | null {
  const filepath = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(filepath)) return null;

  const raw = fs.readFileSync(filepath, 'utf-8');
  const { data, content } = matter(raw);
  const resolvedContent = slug === 'slop-bot' ? injectSlopSystemPromptSection(content.trim()) : content.trim();
  return {
    slug,
    title: data.title || slug,
    description: data.description || '',
    content: resolvedContent,
  };
}

export function listDocs(): DocMeta[] {
  const allDocSlugs = [...DOC_ORDER, ...GETTING_STARTED_ORDER];
  return allDocSlugs
    .map((slug) => {
      const filepath = path.join(DOCS_DIR, `${slug}.md`);
      if (!fs.existsSync(filepath)) return null;
      const raw = fs.readFileSync(filepath, 'utf-8');
      const { data } = matter(raw);
      return {
        slug,
        title: data.title || slug,
        description: data.description || '',
      };
    })
    .filter((d): d is DocMeta => d !== null);
}

function toSkillSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function listDocsNavigation(): DocNavLink[] {
  const docs: DocNavLink[] = listDocs().map((d) => {
    const isGettingStarted = d.slug.startsWith('getting-started-');
    return {
      ...d,
      href: `/docs/${d.slug}`,
      section: isGettingStarted ? 'Getting Started (Human)' : 'Docs',
    };
  });

  const allSkills = listSkills();
  const slopSkills: DocNavLink[] = allSkills
    .filter((s) => s.skillGroup === 'slop')
    .map((s) => ({
      slug: `skills/${toSkillSlug(s.name)}`,
      title: s.fileName,
      description: s.description || '',
      href: `/docs/skills/${toSkillSlug(s.name)}`,
      section: 'Slop Skills' as const,
    }));
  const agentSkills: DocNavLink[] = allSkills
    .filter((s) => s.skillGroup === 'agent')
    .map((s) => ({
      slug: `skills/${toSkillSlug(s.name)}`,
      title: s.fileName,
      description: s.description || '',
      href: `/docs/skills/${toSkillSlug(s.name)}`,
      section: 'Agent Skills' as const,
    }));

  return [...docs, ...slopSkills, ...agentSkills];
}

export function listSkillDocSlugs(): string[] {
  return listSkills().map((s) => toSkillSlug(s.name));
}

export function getSkillDocBySlug(skillSlug: string): Doc | null {
  const resolvedSlug = LEGACY_SKILL_SLUG_REDIRECTS[skillSlug] || skillSlug;
  const match = listSkills().find((s) => toSkillSlug(s.name) === resolvedSlug);
  if (!match) return null;
  const skill = readSkill(match.name);
  if (!skill) return null;
  return {
    slug: `skills/${resolvedSlug}`,
    title: skill.name,
    description: skill.description || '',
    content: skill.content,
  };
}
