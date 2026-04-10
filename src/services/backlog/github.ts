import 'server-only';

export interface GitHubBacklogConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface GitHubContentFile {
  sha: string;
  content?: string;
}

interface GitHubIssueApiRecord {
  number: number;
  html_url: string;
  state: string;
  title: string;
  body?: string | null;
}

const GITHUB_API_BASE = 'https://api.github.com';

function encodeRepoPath(repoPath: string): string {
  return repoPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function getGitHubBacklogConfig(): GitHubBacklogConfig | null {
  const token = process.env.GITHUB_BACKLOG_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const branch = process.env.GITHUB_DEFAULT_BRANCH || 'main';

  if (!token || !owner || !repo) {
    return null;
  }

  return { token, owner, repo, branch };
}

async function githubFetch(pathname: string, init: RequestInit = {}, accept = 'application/vnd.github+json'): Promise<Response> {
  const config = getGitHubBacklogConfig();
  if (!config) {
    throw new Error('GitHub backlog integration is not configured.');
  }

  const response = await fetch(`${GITHUB_API_BASE}${pathname}`, {
    ...init,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${config.token}`,
      'User-Agent': 'latent-space-hub-backlog',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub API ${response.status}: ${body || response.statusText}`);
  }

  return response;
}

export async function readRepoText(repoPath: string): Promise<string> {
  const config = getGitHubBacklogConfig();
  if (!config) {
    throw new Error('GitHub backlog integration is not configured.');
  }

  const response = await githubFetch(
    `/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(repoPath)}?ref=${encodeURIComponent(config.branch)}`,
    {},
    'application/vnd.github.raw+json'
  );
  return response.text();
}

export async function readRepoJson<T>(repoPath: string): Promise<T> {
  const raw = await readRepoText(repoPath);
  return JSON.parse(raw) as T;
}

export async function getRepoFileSha(repoPath: string): Promise<string | null> {
  const config = getGitHubBacklogConfig();
  if (!config) {
    throw new Error('GitHub backlog integration is not configured.');
  }

  const response = await githubFetch(
    `/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(repoPath)}?ref=${encodeURIComponent(config.branch)}`
  );
  const payload = (await response.json()) as GitHubContentFile;
  return payload.sha || null;
}

export async function writeRepoFile(params: {
  repoPath: string;
  content: string;
  message: string;
  sha?: string | null;
}): Promise<void> {
  const config = getGitHubBacklogConfig();
  if (!config) {
    throw new Error('GitHub backlog integration is not configured.');
  }

  await githubFetch(`/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(params.repoPath)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: params.message,
      content: Buffer.from(params.content, 'utf-8').toString('base64'),
      sha: params.sha || undefined,
      branch: config.branch,
    }),
  });
}

export async function searchIssueByBacklogId(backlogId: string): Promise<GitHubIssueApiRecord | null> {
  const config = getGitHubBacklogConfig();
  if (!config) {
    throw new Error('GitHub backlog integration is not configured.');
  }

  const query = encodeURIComponent(`repo:${config.owner}/${config.repo} "backlog-id: ${backlogId}" in:body`);
  const response = await githubFetch(`/search/issues?q=${query}`);
  const payload = (await response.json()) as { items?: GitHubIssueApiRecord[] };
  return payload.items?.[0] || null;
}

export async function createIssue(params: {
  title: string;
  body: string;
  labels?: string[];
}): Promise<GitHubIssueApiRecord> {
  const config = getGitHubBacklogConfig();
  if (!config) {
    throw new Error('GitHub backlog integration is not configured.');
  }

  const response = await githubFetch(`/repos/${config.owner}/${config.repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      labels: params.labels || ['backlog'],
    }),
  });

  return (await response.json()) as GitHubIssueApiRecord;
}

export async function updateIssue(issueNumber: number, params: {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
}): Promise<GitHubIssueApiRecord> {
  const config = getGitHubBacklogConfig();
  if (!config) {
    throw new Error('GitHub backlog integration is not configured.');
  }

  const response = await githubFetch(`/repos/${config.owner}/${config.repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });

  return (await response.json()) as GitHubIssueApiRecord;
}
