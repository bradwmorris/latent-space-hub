import 'server-only';

import { z } from 'zod';
import type {
  BacklogFile,
  BacklogProject,
  BacklogTask,
  CompletedBacklogProject,
} from '@/services/backlog/types';

const backlogTaskSchema = z.object({
  text: z.string().trim().min(1),
  done: z.boolean().default(false),
});

const backlogGitHubSchema = z.object({
  issue_number: z.number().int().positive(),
  issue_url: z.string().url(),
  issue_state: z.string().optional(),
  synced_at: z.string().optional(),
});

const backlogSourceSchema = z.object({
  surface: z.enum(['manual', 'web', 'discord', 'script']),
  actor: z.string().optional(),
  conversation_id: z.string().nullable().optional(),
});

const backlogProjectSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  status: z.string().trim().min(1),
  type: z.string().trim().min(1),
  priority: z.string().trim().min(1),
  prd: z.string().trim().min(1),
  notes: z.string().default(''),
  tasks: z.array(backlogTaskSchema).default([]),
  owner: z.string().optional(),
  branch: z.string().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  github: backlogGitHubSchema.optional(),
  source: backlogSourceSchema.optional(),
}).passthrough();

const completedBacklogProjectSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  prd: z.string().trim().min(1),
  completed_date: z.string().optional(),
  branch: z.string().optional(),
}).passthrough();

const backlogFileSchema = z.object({
  completed: z.array(completedBacklogProjectSchema).default([]),
  lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nextPrdNumber: z.number().int().positive(),
  projects: z.record(backlogProjectSchema),
  queue: z.array(z.string().trim().min(1)).default([]),
});

export function parseBacklogTask(input: unknown): BacklogTask {
  return backlogTaskSchema.parse(input);
}

export function parseBacklogProject(input: unknown): BacklogProject {
  return backlogProjectSchema.parse(input) as BacklogProject;
}

export function parseCompletedBacklogProject(input: unknown): CompletedBacklogProject {
  return completedBacklogProjectSchema.parse(input) as CompletedBacklogProject;
}

export function parseBacklogFile(input: unknown): BacklogFile {
  return backlogFileSchema.parse(input) as BacklogFile;
}
