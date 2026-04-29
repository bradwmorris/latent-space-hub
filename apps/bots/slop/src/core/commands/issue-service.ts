import {
  GITHUB_ISSUE_REPO_NAME,
  GITHUB_ISSUE_REPO_OWNER,
  GITHUB_ISSUE_TOKEN,
} from "../../config";
import type { RuntimeCommandEvent, RuntimeCommandTransport } from "../runtime/types";

type GitHubIssueResponse = {
  number?: number;
  html_url?: string;
  title?: string;
};

function optionString(event: RuntimeCommandEvent, name: string): string {
  const value = event.options[name];
  return typeof value === "string" ? value.trim() : "";
}

function canCreateIssue(event: RuntimeCommandEvent): boolean {
  void event;
  if (!GITHUB_ISSUE_TOKEN) return false;
  return true;
}

function parseLabels(raw: string): string[] {
  return raw
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function buildIssueBody(event: RuntimeCommandEvent, body: string): string {
  const actorName = event.actor.globalName
    ? `${event.actor.globalName} (@${event.actor.username})`
    : `@${event.actor.username}`;

  return [
    body,
    "",
    "---",
    "Created from Discord via Slop `/issue`.",
    `Discord user: ${actorName} (${event.actor.id})`,
    `Discord conversation: ${event.conversation.name} (${event.conversation.id})`,
    `Discord command id: ${event.id}`,
  ].join("\n");
}

async function createGitHubIssue(params: {
  title: string;
  body: string;
  labels: string[];
}): Promise<GitHubIssueResponse> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(GITHUB_ISSUE_REPO_OWNER)}/${encodeURIComponent(GITHUB_ISSUE_REPO_NAME)}/issues`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${GITHUB_ISSUE_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "latent-space-slop-issue-command",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        labels: params.labels.length ? params.labels : undefined,
      }),
    }
  );

  const payload = (await response.json().catch(() => ({}))) as GitHubIssueResponse & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message || `GitHub issue create failed with HTTP ${response.status}`);
  }

  return payload;
}

export async function handleIssueCommandEvent(
  event: RuntimeCommandEvent,
  transport: RuntimeCommandTransport
): Promise<void> {
  if (!canCreateIssue(event)) {
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

  const issue = await createGitHubIssue({
    title,
    body: buildIssueBody(event, body),
    labels,
  });

  if (!issue.html_url || !issue.number) {
    await transport.editReply("Issue was created, but GitHub did not return a usable issue URL.");
    return;
  }

  await transport.editReply(`Created issue #${issue.number}: ${issue.html_url}`);
}
