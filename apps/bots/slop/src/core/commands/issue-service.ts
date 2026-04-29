import {
  GITHUB_ISSUE_BRANCH,
  GITHUB_ISSUE_REPO_NAME,
  GITHUB_ISSUE_REPO_OWNER,
  GITHUB_ISSUE_TOKEN,
  HUB_BASE_URL,
} from "../../config";
import type { RuntimeCommandEvent, RuntimeCommandTransport } from "../runtime/types";

const BACKLOG_PATH = "docs/development/backlog/backlog.json";

type BacklogTask = {
  text: string;
  done: boolean;
};

type BacklogFile = {
  completed: unknown[];
  lastUpdated: string;
  nextPrdNumber: number;
  projects: Record<string, BacklogProject>;
  queue: string[];
};

type BacklogProject = {
  id: string;
  title: string;
  status: string;
  type: string;
  priority: string;
  prd: string;
  notes: string;
  tasks: BacklogTask[];
  github?: {
    issue_number: number;
    issue_url: string;
    issue_state: string;
    synced_at: string;
  };
  source?: {
    surface: "discord";
    actor: string;
    conversation_id: string;
  };
};

type GitHubFileResponse = {
  sha: string;
  content: string;
  encoding: string;
};

type GitHubIssueResponse = {
  number: number;
  html_url: string;
  state: string;
};

function optionString(event: RuntimeCommandEvent, name: string): string {
  const value = event.options[name];
  return typeof value === "string" ? value.trim() : "";
}

function canCreateIssue(): boolean {
  return Boolean(GITHUB_ISSUE_TOKEN);
}

function parseLabels(raw: string): string[] {
  return raw
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function encodeRepoPath(repoPath: string): string {
  return repoPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildDefaultTasks(title: string): BacklogTask[] {
  return [
    { text: `Scope the implementation for ${title}`, done: false },
    { text: `Implement the main product and engineering changes for ${title}`, done: false },
    { text: "Verify behavior and update the relevant documentation", done: false },
  ];
}

function buildBacklogNotes(event: RuntimeCommandEvent, body: string, labels: string[]): string {
  const actorName = event.actor.globalName
    ? `${event.actor.globalName} (@${event.actor.username})`
    : `@${event.actor.username}`;
  const labelLine = labels.length ? `Requested labels: ${labels.map((label) => `\`${label}\``).join(", ")}` : null;

  return [
    body,
    "",
    "---",
    "Created from Discord via Slop `/issue`.",
    `Discord user: ${actorName} (${event.actor.id})`,
    `Discord conversation: ${event.conversation.name} (${event.conversation.id})`,
    `Discord command id: ${event.id}`,
    labelLine,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function githubFetch(pathname: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_ISSUE_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "latent-space-slop-issue-command",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message || `GitHub API failed with HTTP ${response.status}`);
  }

  return response;
}

async function readBacklogFile(): Promise<{ file: BacklogFile; sha: string }> {
  const response = await githubFetch(
    `/repos/${GITHUB_ISSUE_REPO_OWNER}/${GITHUB_ISSUE_REPO_NAME}/contents/${encodeRepoPath(BACKLOG_PATH)}?ref=${encodeURIComponent(GITHUB_ISSUE_BRANCH)}`
  );
  const payload = (await response.json()) as GitHubFileResponse;
  const content = Buffer.from(payload.content, payload.encoding === "base64" ? "base64" : "utf-8").toString("utf-8");
  return {
    file: JSON.parse(content) as BacklogFile,
    sha: payload.sha,
  };
}

async function writeRepoFile(params: {
  repoPath: string;
  content: string;
  message: string;
  sha?: string;
}): Promise<void> {
  await githubFetch(
    `/repos/${GITHUB_ISSUE_REPO_OWNER}/${GITHUB_ISSUE_REPO_NAME}/contents/${encodeRepoPath(params.repoPath)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: params.message,
        content: Buffer.from(params.content, "utf-8").toString("base64"),
        sha: params.sha,
        branch: GITHUB_ISSUE_BRANCH,
      }),
    }
  );
}

async function createGitHubIssue(params: {
  title: string;
  body: string;
  labels: string[];
}): Promise<GitHubIssueResponse> {
  const response = await githubFetch(`/repos/${GITHUB_ISSUE_REPO_OWNER}/${GITHUB_ISSUE_REPO_NAME}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      labels: Array.from(new Set(["backlog", ...params.labels])),
    }),
  });
  return (await response.json()) as GitHubIssueResponse;
}

function renderIssueBody(input: {
  title: string;
  notes: string;
  tasks: BacklogTask[];
  backlogId: string;
  prdPath: string;
}): string {
  const prdUrl = `https://github.com/${GITHUB_ISSUE_REPO_OWNER}/${GITHUB_ISSUE_REPO_NAME}/blob/${GITHUB_ISSUE_BRANCH}/${input.prdPath}`;
  return [
    `## ${input.title}`,
    "",
    input.notes,
    "",
    "### Links",
    "",
    `- PRD: [${input.prdPath}](${prdUrl})`,
    "",
    "### Backlog Tasks",
    "",
    ...input.tasks.map((task) => `- [ ] ${task.text}`),
    "",
    `<!-- backlog-id: ${input.backlogId} -->`,
    `<!-- backlog-prd: ${input.prdPath} -->`,
    "",
  ].join("\n");
}

function renderPrdContent(input: {
  prdNumber: number;
  title: string;
  notes: string;
  tasks: BacklogTask[];
  issue: GitHubIssueResponse;
  actor: string;
}): string {
  const implementationBlocks = input.tasks
    .map((task, index) => {
      const stepNumber = index + 1;
      return `### Step ${stepNumber}: ${task.text}\n\n- Implement: ${task.text}\n- Verify the affected route, component, service, or workflow.\n`;
    })
    .join("\n")
    .trimEnd();

  return [
    `# PRD-${input.prdNumber}: ${input.title}`,
    "",
    `**Status:** Draft | **Created:** ${todayIso()}`,
    "",
    "## 1. Background",
    "",
    input.notes,
    "",
    "## 2. Plan",
    "",
    ...input.tasks.map((task, index) => `${index + 1}. ${task.text}`),
    "",
    "## 3. Implementation Details",
    "",
    implementationBlocks,
    "",
    "## 4. Open Questions / Notes",
    "",
    `- GitHub issue: [#${input.issue.number}](${input.issue.html_url})`,
    `- Created via \`discord\` by ${input.actor}`,
    "",
    "---",
    "",
    "**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.",
    "",
  ].join("\n");
}

async function createBacklogIssue(params: {
  title: string;
  notes: string;
  labels: string[];
  event: RuntimeCommandEvent;
}): Promise<{ id: string; issue: GitHubIssueResponse }> {
  const { file, sha } = await readBacklogFile();
  const id = slugifyTitle(params.title);
  if (!id) throw new Error("Could not derive a backlog id from the title.");
  if (file.projects[id]) throw new Error(`Backlog item already exists: ${id}`);

  const prdNumber = file.nextPrdNumber;
  const prdPath = `docs/development/prd-${prdNumber}-${id}.md`;
  const tasks = buildDefaultTasks(params.title);
  const issue = await createGitHubIssue({
    title: params.title,
    body: renderIssueBody({
      title: params.title,
      notes: params.notes,
      tasks,
      backlogId: id,
      prdPath,
    }),
    labels: params.labels,
  });

  const project: BacklogProject = {
    id,
    title: params.title,
    status: "prd",
    type: "feature",
    priority: "medium",
    prd: prdPath,
    notes: params.notes,
    tasks,
    github: {
      issue_number: issue.number,
      issue_url: issue.html_url,
      issue_state: issue.state,
      synced_at: nowIso(),
    },
    source: {
      surface: "discord",
      actor: params.event.actor.username,
      conversation_id: params.event.conversation.id,
    },
  };

  const nextFile: BacklogFile = {
    ...file,
    lastUpdated: todayIso(),
    nextPrdNumber: prdNumber + 1,
    projects: {
      ...file.projects,
      [id]: project,
    },
    queue: [...file.queue, id],
  };

  await writeRepoFile({
    repoPath: prdPath,
    content: renderPrdContent({
      prdNumber,
      title: params.title,
      notes: params.notes,
      tasks,
      issue,
      actor: params.event.actor.username,
    }),
    message: `Add prd-${prdNumber}-${id}`,
  });
  await writeRepoFile({
    repoPath: BACKLOG_PATH,
    content: `${JSON.stringify(nextFile, null, 2)}\n`,
    message: `Add backlog item ${id}`,
    sha,
  });

  return { id, issue };
}

export async function handleIssueCommandEvent(
  event: RuntimeCommandEvent,
  transport: RuntimeCommandTransport
): Promise<void> {
  if (!canCreateIssue()) {
    await transport.editReply(
      "Issue creation is not configured for this bot instance. Set `GITHUB_ISSUE_TOKEN` in Railway."
    );
    return;
  }

  const title = optionString(event, "title");
  const body = optionString(event, "body");
  const labels = parseLabels(optionString(event, "labels"));

  if (!title || !body) {
    await transport.editReply("`title` and `body` are required.");
    return;
  }

  if (title.length > 256) {
    await transport.editReply("`title` must be 256 characters or fewer.");
    return;
  }

  const result = await createBacklogIssue({
    title,
    notes: buildBacklogNotes(event, body, labels),
    labels,
    event,
  });

  const backlogUrl = `${HUB_BASE_URL.replace(/\/$/, "")}/backlog?id=${encodeURIComponent(result.id)}`;
  await transport.editReply(
    [
      `Created backlog item \`${result.id}\`.`,
      `Backlog: ${backlogUrl}`,
      `Issue #${result.issue.number}: ${result.issue.html_url}`,
    ].join("\n")
  );
}
