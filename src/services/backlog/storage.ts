import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { parseBacklogFile } from '@/services/backlog/schema';
import {
  buildCreateTitle,
  buildIssueBody,
  buildPrdPath,
  ensureTaskList,
  normalizeDueDate,
  renderPrdContent,
  slugifyBacklogTitle,
} from '@/services/backlog/prd';
import {
  createIssue,
  getGitHubBacklogConfig,
  getRepoFileSha,
  readRepoText,
  searchIssueByBacklogId,
  updateIssue,
  writeRepoFile,
} from '@/services/backlog/github';
import type {
  BacklogCompletedSummary,
  BacklogFile,
  BacklogMutationResult,
  BacklogOverview,
  BacklogProject,
  BacklogProjectDetail,
  BacklogProjectSummary,
  BacklogStatusColumn,
  BacklogTask,
  CreateBacklogProjectInput,
  GitHubIssueReference,
  UpdateBacklogProjectInput,
} from '@/services/backlog/types';

const BACKLOG_FILE_PATH = path.join(process.cwd(), 'docs/development/backlog/backlog.json');
const PRD_ROOT = path.join(process.cwd(), 'docs/development');
const ACTIVE_STATUSES = ['prd', 'ready', 'in_progress', 'review', 'blocked'] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function extractCreatedDateFromPrd(content: string): string {
  const match = content.match(/\*\*Status:\*\*\s*Draft\s*\|\s*\*\*Created:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || todayIso();
}

function nowIso(): string {
  return new Date().toISOString();
}

function supportsGitHubBacklog(): boolean {
  return Boolean(getGitHubBacklogConfig());
}

function canWriteLocally(): boolean {
  return process.env.BACKLOG_ALLOW_LOCAL_MUTATIONS === 'true' || process.env.NODE_ENV !== 'production';
}

async function readLocalBacklogFile(): Promise<BacklogFile> {
  const raw = await fs.readFile(BACKLOG_FILE_PATH, 'utf-8');
  return parseBacklogFile(JSON.parse(raw));
}

async function writeLocalBacklogFile(file: BacklogFile): Promise<void> {
  await fs.writeFile(BACKLOG_FILE_PATH, `${JSON.stringify(file, null, 2)}\n`, 'utf-8');
}

async function readLocalPrd(prdPath: string): Promise<string> {
  const absolutePath = path.join(process.cwd(), prdPath);
  return fs.readFile(absolutePath, 'utf-8');
}

async function writeLocalPrd(prdPath: string, content: string): Promise<void> {
  const absolutePath = path.join(process.cwd(), prdPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf-8');
}

export async function readBacklogFile(): Promise<BacklogFile> {
  if (supportsGitHubBacklog()) {
    try {
      const raw = await readRepoText('docs/development/backlog/backlog.json');
      return parseBacklogFile(JSON.parse(raw));
    } catch (error) {
      console.warn('Falling back to local backlog file read:', error);
    }
  }

  return readLocalBacklogFile();
}

export async function readBacklogPrd(prdPath: string): Promise<string> {
  if (supportsGitHubBacklog()) {
    try {
      return await readRepoText(prdPath);
    } catch (error) {
      console.warn(`Falling back to local PRD read for ${prdPath}:`, error);
    }
  }

  return readLocalPrd(prdPath);
}

function summarizeProject(project: BacklogProject, queuePosition: number): BacklogProjectSummary {
  const taskCount = project.tasks.length;
  const doneCount = project.tasks.filter((task) => task.done).length;
  return {
    ...project,
    taskCount,
    doneCount,
    completionRatio: taskCount > 0 ? doneCount / taskCount : 0,
    queuePosition,
  };
}

function buildColumns(queue: BacklogProjectSummary[]): BacklogStatusColumn[] {
  const labels: Record<(typeof ACTIVE_STATUSES)[number], string> = {
    prd: 'PRD',
    ready: 'Ready',
    in_progress: 'In Progress',
    review: 'Review',
    blocked: 'Blocked',
  };

  return ACTIVE_STATUSES.map((status) => ({
    id: status,
    label: labels[status],
    items: queue.filter((project) => project.status === status),
  }));
}

function buildCompletedSummary(file: BacklogFile): BacklogCompletedSummary[] {
  return [...file.completed]
    .sort((a, b) => (b.completed_date || '').localeCompare(a.completed_date || ''))
    .slice(0, 12)
    .map((item) => ({
      ...item,
      completedDateLabel: item.completed_date || 'unknown',
    }));
}

export async function getBacklogOverview(): Promise<BacklogOverview> {
  const file = await readBacklogFile();
  const queue = file.queue
    .map((id, index) => file.projects[id] ? summarizeProject(file.projects[id], index + 1) : null)
    .filter((project): project is BacklogProjectSummary => project !== null);

  return {
    lastUpdated: file.lastUpdated,
    nextPrdNumber: file.nextPrdNumber,
    githubEnabled: supportsGitHubBacklog(),
    queue,
    columns: buildColumns(queue),
    completed: buildCompletedSummary(file),
  };
}

export async function getBacklogProjectDetail(id: string): Promise<BacklogProjectDetail | null> {
  const file = await readBacklogFile();
  const queuePosition = Math.max(0, file.queue.indexOf(id)) + 1;
  const project = file.projects[id];
  if (!project) return null;

  const prdContent = await readBacklogPrd(project.prd);
  return {
    project: summarizeProject(project, queuePosition),
    prdContent,
  };
}

function getProjectById(file: BacklogFile, id: string): BacklogProject {
  const project = file.projects[id];
  if (!project) {
    throw new Error(`Backlog project not found: ${id}`);
  }
  return project;
}

async function syncProjectIssue(params: {
  backlogId: string;
  title: string;
  notes: string;
  tasks: BacklogTask[];
  prdPath: string;
  dueDate?: string;
}): Promise<GitHubIssueReference | null> {
  const config = getGitHubBacklogConfig();
  if (!config) {
    return null;
  }

  const body = buildIssueBody({
    title: params.title,
    backlogId: params.backlogId,
    notes: params.notes,
    prdPath: params.prdPath,
    tasks: params.tasks,
    repoOwner: config.owner,
    repoName: config.repo,
    branch: config.branch,
    dueDate: params.dueDate,
  });

  const existing = await searchIssueByBacklogId(params.backlogId);
  if (existing) {
    const updated = await updateIssue(existing.number, {
      title: params.title,
      body,
    });
    return {
      number: updated.number,
      url: updated.html_url,
      state: updated.state,
    };
  }

  const created = await createIssue({
    title: params.title,
    body,
    labels: ['backlog'],
  });

  return {
    number: created.number,
    url: created.html_url,
    state: created.state,
  };
}

function buildProjectRecord(input: {
  id: string;
  prdPath: string;
  create: CreateBacklogProjectInput;
  issue?: GitHubIssueReference | null;
}): BacklogProject {
  const tasks = ensureTaskList(input.create.tasks, input.create.title);

  return {
    id: input.id,
    title: buildCreateTitle(input.create),
    status: input.create.status || 'prd',
    type: input.create.type || 'feature',
    priority: input.create.priority || 'medium',
    prd: input.prdPath,
    notes: input.create.notes.trim(),
    tasks,
    owner: input.create.owner,
    due_date: normalizeDueDate(input.create.dueDate),
    github: input.issue ? {
      issue_number: input.issue.number,
      issue_url: input.issue.url,
      issue_state: input.issue.state,
      synced_at: nowIso(),
    } : undefined,
    source: input.create.sourceSurface ? {
      surface: input.create.sourceSurface,
      actor: input.create.sourceActor,
      conversation_id: input.create.sourceConversationId,
    } : undefined,
  };
}

async function persistBacklogFiles(params: {
  prdPath: string;
  prdContent: string;
  file: BacklogFile;
}): Promise<void> {
  if (supportsGitHubBacklog()) {
    const backlogSha = await getRepoFileSha('docs/development/backlog/backlog.json');
    let prdSha: string | null = null;
    try {
      prdSha = await getRepoFileSha(params.prdPath);
    } catch {
      prdSha = null;
    }

    await writeRepoFile({
      repoPath: params.prdPath,
      content: params.prdContent,
      message: `Add ${path.posix.basename(params.prdPath, '.md')}`,
      sha: prdSha,
    });
    await writeRepoFile({
      repoPath: 'docs/development/backlog/backlog.json',
      content: `${JSON.stringify(params.file, null, 2)}\n`,
      message: 'Update development backlog',
      sha: backlogSha,
    });
    return;
  }

  if (!canWriteLocally()) {
    throw new Error('Backlog mutations are disabled. Configure GitHub backlog env vars or allow local mutations.');
  }

  await writeLocalPrd(params.prdPath, params.prdContent);
  await writeLocalBacklogFile(params.file);
}

export async function createBacklogProject(input: CreateBacklogProjectInput): Promise<BacklogMutationResult> {
  const file = await readBacklogFile();
  const title = buildCreateTitle(input);
  if (!title) {
    throw new Error('Title is required.');
  }

  const backlogId = slugifyBacklogTitle(title);
  if (!backlogId) {
    throw new Error('Could not derive a valid backlog id from the provided title.');
  }
  if (file.projects[backlogId]) {
    throw new Error(`Backlog project already exists: ${backlogId}`);
  }

  const prdNumber = file.nextPrdNumber;
  const prdPath = buildPrdPath(prdNumber, title);
  const issue = await syncProjectIssue({
    backlogId,
    title,
    notes: input.notes,
    tasks: ensureTaskList(input.tasks, title),
    prdPath,
    dueDate: normalizeDueDate(input.dueDate),
  });

  const project = buildProjectRecord({
    id: backlogId,
    prdPath,
    create: input,
    issue,
  });

  const prdContent = renderPrdContent({
    prdNumber,
    title,
    createdDate: todayIso(),
    notes: input.notes,
    tasks: project.tasks,
    dueDate: project.due_date,
    github: project.github,
    sourceSurface: project.source?.surface,
    sourceActor: project.source?.actor,
  });

  const nextFile: BacklogFile = {
    ...file,
    lastUpdated: todayIso(),
    nextPrdNumber: prdNumber + 1,
    projects: {
      ...file.projects,
      [backlogId]: project,
    },
    queue: [...file.queue, backlogId],
  };

  await persistBacklogFiles({
    prdPath,
    prdContent,
    file: nextFile,
  });

  return {
    project: summarizeProject(project, nextFile.queue.length),
    prdPath,
    prdContent,
    githubEnabled: supportsGitHubBacklog(),
    warning: supportsGitHubBacklog()
      ? undefined
      : 'GitHub backlog integration is not configured. The project was created locally without a linked issue.',
  };
}

export async function updateBacklogProject(id: string, input: UpdateBacklogProjectInput): Promise<BacklogMutationResult> {
  const file = await readBacklogFile();
  const current = getProjectById(file, id);
  const existingPrdContent = await readBacklogPrd(current.prd);
  const updated: BacklogProject = {
    ...current,
    notes: input.notes !== undefined ? input.notes.trim() : current.notes,
    type: input.type || current.type,
    priority: input.priority || current.priority,
    status: input.status || current.status,
    due_date: input.dueDate === null ? undefined : normalizeDueDate(input.dueDate) || current.due_date,
    tasks: input.tasks ? ensureTaskList(input.tasks, current.title) : current.tasks,
    github: input.github || current.github,
  };

  const issue = await syncProjectIssue({
    backlogId: updated.id,
    title: updated.title,
    notes: updated.notes,
    tasks: updated.tasks,
    prdPath: updated.prd,
    dueDate: updated.due_date,
  });

  if (issue) {
    updated.github = {
      issue_number: issue.number,
      issue_url: issue.url,
      issue_state: issue.state,
      synced_at: nowIso(),
    };
  }

  const queuePosition = Math.max(0, file.queue.indexOf(id)) + 1;
  const prdNumberMatch = updated.prd.match(/prd-(\d+)-/);
  const prdNumber = prdNumberMatch ? Number(prdNumberMatch[1]) : 0;
  const prdContent = renderPrdContent({
    prdNumber,
    title: updated.title,
    createdDate: extractCreatedDateFromPrd(existingPrdContent),
    notes: updated.notes,
    tasks: updated.tasks,
    dueDate: updated.due_date,
    github: updated.github,
    sourceSurface: updated.source?.surface,
    sourceActor: updated.source?.actor,
  });

  const nextFile: BacklogFile = {
    ...file,
    lastUpdated: todayIso(),
    projects: {
      ...file.projects,
      [id]: updated,
    },
  };

  await persistBacklogFiles({
    prdPath: updated.prd,
    prdContent,
    file: nextFile,
  });

  return {
    project: summarizeProject(updated, queuePosition),
    prdPath: updated.prd,
    prdContent,
    githubEnabled: supportsGitHubBacklog(),
    warning: supportsGitHubBacklog()
      ? undefined
      : 'GitHub backlog integration is not configured. The project was updated locally without a linked issue.',
  };
}

export async function reorderBacklogProject(id: string, beforeId?: string | null): Promise<BacklogOverview> {
  const file = await readBacklogFile();
  if (!file.projects[id]) {
    throw new Error(`Backlog project not found: ${id}`);
  }

  const queue = file.queue.filter((entry) => entry !== id);
  if (beforeId && queue.includes(beforeId)) {
    const index = queue.indexOf(beforeId);
    queue.splice(index, 0, id);
  } else {
    queue.push(id);
  }

  const nextFile: BacklogFile = {
    ...file,
    lastUpdated: todayIso(),
    queue,
  };

  if (supportsGitHubBacklog()) {
    const sha = await getRepoFileSha('docs/development/backlog/backlog.json');
    await writeRepoFile({
      repoPath: 'docs/development/backlog/backlog.json',
      content: `${JSON.stringify(nextFile, null, 2)}\n`,
      message: `Reorder backlog project ${id}`,
      sha,
    });
  } else if (canWriteLocally()) {
    await writeLocalBacklogFile(nextFile);
  } else {
    throw new Error('Backlog mutations are disabled. Configure GitHub backlog env vars or allow local mutations.');
  }

  return getBacklogOverview();
}

export async function setBacklogProjectDueDate(id: string, dueDate: string | null): Promise<BacklogMutationResult> {
  return updateBacklogProject(id, { dueDate });
}

export async function backfillGitHubIssues(): Promise<Array<{ id: string; issueNumber: number }>> {
  if (!supportsGitHubBacklog()) {
    throw new Error('GitHub backlog integration is not configured.');
  }

  const file = await readBacklogFile();
  const updatedResults: Array<{ id: string; issueNumber: number }> = [];
  let nextFile = file;

  for (const id of file.queue) {
    const project = nextFile.projects[id];
    if (!project) continue;
    if (project.github?.issue_number) continue;

    const issue = await syncProjectIssue({
      backlogId: project.id,
      title: project.title,
      notes: project.notes,
      tasks: project.tasks,
      prdPath: project.prd,
      dueDate: project.due_date,
    });
    if (!issue) continue;

    nextFile = {
      ...nextFile,
      lastUpdated: todayIso(),
      projects: {
        ...nextFile.projects,
        [id]: {
          ...project,
          github: {
            issue_number: issue.number,
            issue_url: issue.url,
            issue_state: issue.state,
            synced_at: nowIso(),
          },
        },
      },
    };
    updatedResults.push({ id, issueNumber: issue.number });
  }

  if (updatedResults.length) {
    const sha = await getRepoFileSha('docs/development/backlog/backlog.json');
    await writeRepoFile({
      repoPath: 'docs/development/backlog/backlog.json',
      content: `${JSON.stringify(nextFile, null, 2)}\n`,
      message: 'Backfill GitHub issues for backlog projects',
      sha,
    });
  }

  return updatedResults;
}
