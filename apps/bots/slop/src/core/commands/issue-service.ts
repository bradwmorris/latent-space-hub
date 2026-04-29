import {
  BACKLOG_ADMIN_SECRET,
  HUB_BASE_URL,
} from "../../config";
import type { RuntimeCommandEvent, RuntimeCommandTransport } from "../runtime/types";

type BacklogCreateResponse = {
  success?: boolean;
  data?: {
    project?: {
      id?: string;
      github?: {
        issue_number?: number;
        issue_url?: string;
      };
    };
    warning?: string;
  };
  error?: string;
};

function optionString(event: RuntimeCommandEvent, name: string): string {
  const value = event.options[name];
  return typeof value === "string" ? value.trim() : "";
}

function canCreateIssue(): boolean {
  return Boolean(BACKLOG_ADMIN_SECRET);
}

function parseLabels(raw: string): string[] {
  return raw
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 10);
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

async function createBacklogProject(params: {
  title: string;
  notes: string;
  labels: string[];
  event: RuntimeCommandEvent;
}): Promise<BacklogCreateResponse> {
  const response = await fetch(`${HUB_BASE_URL.replace(/\/$/, "")}/api/backlog/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-backlog-admin-secret": BACKLOG_ADMIN_SECRET,
    },
    body: JSON.stringify({
      title: params.title,
      notes: params.notes,
      labels: params.labels,
      type: "feature",
      priority: "medium",
      status: "prd",
      sourceSurface: "discord",
      sourceActor: params.event.actor.username,
      sourceConversationId: params.event.conversation.id,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as BacklogCreateResponse;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Backlog issue create failed with HTTP ${response.status}`);
  }

  return payload;
}

export async function handleIssueCommandEvent(
  event: RuntimeCommandEvent,
  transport: RuntimeCommandTransport
): Promise<void> {
  if (!canCreateIssue()) {
    await transport.editReply(
      "Issue creation is not configured for this bot instance. Set `BACKLOG_ADMIN_SECRET` in Railway."
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

  const result = await createBacklogProject({
    title,
    notes: buildBacklogNotes(event, body, labels),
    labels,
    event,
  });

  const project = result.data?.project;
  if (!project?.id) {
    await transport.editReply("Backlog item was created, but the Hub did not return a usable project id.");
    return;
  }

  const backlogUrl = `${HUB_BASE_URL.replace(/\/$/, "")}/backlog?id=${encodeURIComponent(project.id)}`;
  const issueLine = project.github?.issue_url
    ? `Issue #${project.github.issue_number}: ${project.github.issue_url}`
    : "Issue: not created because the Hub GitHub backlog integration is not configured.";

  await transport.editReply(
    [
      `Created backlog item \`${project.id}\`.`,
      `Backlog: ${backlogUrl}`,
      issueLine,
      result.data?.warning || null,
    ]
      .filter((line) => line !== null)
      .join("\n")
  );
}
