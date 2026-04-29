import path from 'path';
import type { BacklogGitHubMetadata, BacklogTask, CreateBacklogProjectInput } from '@/services/backlog/types';

export function slugifyBacklogTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeDueDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return isValidIsoDate(trimmed) ? trimmed : undefined;
}

export function buildPrdPath(prdNumber: number, title: string): string {
  return path.posix.join('docs', 'development', `prd-${prdNumber}-${slugifyBacklogTitle(title)}.md`);
}

export function buildDefaultTasks(title: string): BacklogTask[] {
  return [
    { text: `Scope the implementation for ${title}`, done: false },
    { text: `Implement the main product and engineering changes for ${title}`, done: false },
    { text: `Verify behavior and update the relevant documentation`, done: false },
  ];
}

export function ensureTaskList(tasks: BacklogTask[] | undefined, title: string): BacklogTask[] {
  const cleaned = (tasks || [])
    .map((task) => ({ text: task.text.trim(), done: Boolean(task.done) }))
    .filter((task) => task.text.length > 0);
  return cleaned.length ? cleaned : buildDefaultTasks(title);
}

export function renderPrdContent(input: {
  prdNumber: number;
  title: string;
  createdDate: string;
  notes: string;
  tasks: BacklogTask[];
  dueDate?: string;
  github?: BacklogGitHubMetadata;
  sourceSurface?: string;
  sourceActor?: string;
}): string {
  const noteLines = input.notes
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const background = noteLines.length ? noteLines.join('\n\n') : `Build and ship ${input.title}.`;
  const implementationBlocks = input.tasks
    .map((task, index) => {
      const stepNumber = index + 1;
      return `### Step ${stepNumber}: ${task.text}\n\n- Implement: ${task.text}\n- Verify the affected route, component, service, or workflow.\n`;
    })
    .join('\n');
  const openQuestions: string[] = [];

  if (input.dueDate) {
    openQuestions.push(`- Target due date: \`${input.dueDate}\``);
  }
  if (input.github) {
    openQuestions.push(`- GitHub issue: [#${input.github.issue_number}](${input.github.issue_url})`);
  }
  if (input.sourceSurface) {
    const actor = input.sourceActor ? ` by ${input.sourceActor}` : '';
    openQuestions.push(`- Created via \`${input.sourceSurface}\`${actor}`);
  }
  if (!openQuestions.length) {
    openQuestions.push('- None currently.');
  }

  return [
    `# PRD-${input.prdNumber}: ${input.title}`,
    '',
    `**Status:** Draft | **Created:** ${input.createdDate}`,
    '',
    '## 1. Background',
    '',
    background,
    '',
    '## 2. Plan',
    '',
    ...input.tasks.map((task, index) => `${index + 1}. ${task.text}`),
    '',
    '## 3. Implementation Details',
    '',
    implementationBlocks.trimEnd(),
    '',
    '## 4. Open Questions / Notes',
    '',
    ...openQuestions,
    '',
    '---',
    '',
    '**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.',
    '',
  ].join('\n');
}

export function buildIssueBody(input: {
  title: string;
  backlogId: string;
  notes: string;
  prdPath: string;
  tasks: BacklogTask[];
  repoOwner: string;
  repoName: string;
  branch: string;
  dueDate?: string;
}): string {
  const prdUrl = `https://github.com/${input.repoOwner}/${input.repoName}/blob/${input.branch}/${input.prdPath}`;
  const notes = input.notes.trim() || 'No additional context provided.';
  const taskLines = input.tasks.map((task) => `- [ ] ${task.text}`);
  const dueDateLine = input.dueDate ? `- Due date: \`${input.dueDate}\`` : null;

  return [
    `## ${input.title}`,
    '',
    notes,
    '',
    '### Links',
    '',
    `- PRD: [${input.prdPath}](${prdUrl})`,
    dueDateLine,
    '',
    '### Backlog Tasks',
    '',
    ...taskLines,
    '',
    `<!-- backlog-id: ${input.backlogId} -->`,
    `<!-- backlog-prd: ${input.prdPath} -->`,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function buildCreateTitle(input: CreateBacklogProjectInput): string {
  return input.title.trim();
}
