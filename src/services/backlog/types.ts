export type BacklogStatus = 'prd' | 'ready' | 'in_progress' | 'review' | 'blocked' | 'completed';

export type BacklogProjectType =
  | 'feature'
  | 'fix'
  | 'refactor'
  | 'ops'
  | 'docs'
  | 'security'
  | 'research'
  | 'infrastructure'
  | string;

export type BacklogPriority = 'high' | 'medium' | 'low' | string;

export type BacklogSourceSurface = 'manual' | 'web' | 'discord' | 'script';

export interface BacklogTask {
  text: string;
  done: boolean;
}

export interface BacklogGitHubMetadata {
  issue_number: number;
  issue_url: string;
  issue_state?: 'open' | 'closed' | string;
  synced_at?: string;
}

export interface BacklogSourceMetadata {
  surface: BacklogSourceSurface;
  actor?: string;
  conversation_id?: string | null;
}

export interface BacklogProject {
  id: string;
  title: string;
  status: BacklogStatus | string;
  type: BacklogProjectType;
  priority: BacklogPriority;
  prd: string;
  notes: string;
  tasks: BacklogTask[];
  owner?: string;
  branch?: string;
  due_date?: string;
  github?: BacklogGitHubMetadata;
  source?: BacklogSourceMetadata;
}

export interface CompletedBacklogProject {
  id: string;
  title: string;
  prd: string;
  completed_date?: string;
  branch?: string;
}

export interface BacklogFile {
  completed: CompletedBacklogProject[];
  lastUpdated: string;
  nextPrdNumber: number;
  projects: Record<string, BacklogProject>;
  queue: string[];
}

export interface BacklogProjectSummary extends BacklogProject {
  doneCount: number;
  taskCount: number;
  completionRatio: number;
  queuePosition: number;
}

export interface BacklogCompletedSummary extends CompletedBacklogProject {
  completedDateLabel: string;
}

export interface BacklogStatusColumn {
  id: Exclude<BacklogStatus, 'completed'>;
  label: string;
  items: BacklogProjectSummary[];
}

export interface BacklogOverview {
  lastUpdated: string;
  nextPrdNumber: number;
  githubEnabled: boolean;
  queue: BacklogProjectSummary[];
  columns: BacklogStatusColumn[];
  completed: BacklogCompletedSummary[];
}

export interface BacklogProjectDetail {
  project: BacklogProjectSummary;
  prdContent: string;
}

export interface CreateBacklogProjectInput {
  title: string;
  notes: string;
  labels?: string[];
  type?: BacklogProjectType;
  priority?: BacklogPriority;
  status?: Exclude<BacklogStatus, 'completed'>;
  dueDate?: string;
  tasks?: BacklogTask[];
  owner?: string;
  sourceSurface?: BacklogSourceSurface;
  sourceActor?: string;
  sourceConversationId?: string | null;
}

export interface UpdateBacklogProjectInput {
  notes?: string;
  type?: BacklogProjectType;
  priority?: BacklogPriority;
  status?: Exclude<BacklogStatus, 'completed'>;
  dueDate?: string | null;
  tasks?: BacklogTask[];
  github?: BacklogGitHubMetadata;
}

export interface BacklogMutationResult {
  project: BacklogProjectSummary;
  prdPath: string;
  prdContent: string;
  githubEnabled: boolean;
  warning?: string;
}

export interface GitHubIssueReference {
  number: number;
  url: string;
  state: string;
}
