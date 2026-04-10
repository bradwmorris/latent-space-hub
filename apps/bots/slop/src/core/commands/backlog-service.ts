import {
  BACKLOG_ADMIN_SECRET,
  BACKLOG_ALLOWED_DISCORD_USER_IDS,
  HUB_BASE_URL,
} from "../../config";
import type { RuntimeCommandEvent, RuntimeCommandTransport } from "../runtime/types";

function optionString(event: RuntimeCommandEvent, name: string): string {
  const value = event.options[name];
  return typeof value === "string" ? value.trim() : "";
}

function optionBoolean(event: RuntimeCommandEvent, name: string): boolean {
  return event.options[name] === true;
}

function canCreateBacklog(event: RuntimeCommandEvent): boolean {
  if (!BACKLOG_ADMIN_SECRET) return false;
  if (!BACKLOG_ALLOWED_DISCORD_USER_IDS.size) return false;
  return BACKLOG_ALLOWED_DISCORD_USER_IDS.has(event.actor.id);
}

function previewMessage(params: {
  title: string;
  notes: string;
  type: string;
  priority: string;
  dueDate?: string;
}): string {
  const dueDateLine = params.dueDate ? `Due date: \`${params.dueDate}\`\n` : "";
  return [
    "Backlog create preview",
    "",
    `Title: ${params.title}`,
    `Type: ${params.type}`,
    `Priority: ${params.priority}`,
    dueDateLine ? dueDateLine.trimEnd() : null,
    "",
    params.notes,
    "",
    "Re-run the command with `confirm: true` to create the backlog item, PRD, and GitHub issue.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function handleBacklogCreateCommandEvent(
  event: RuntimeCommandEvent,
  transport: RuntimeCommandTransport
): Promise<void> {
  if (!canCreateBacklog(event)) {
    await transport.editReply(
      "Backlog creation is not configured for this bot instance or you are not in the allowed Discord user list."
    );
    return;
  }

  const title = optionString(event, "title");
  const notes = optionString(event, "notes");
  const type = optionString(event, "type") || "feature";
  const priority = optionString(event, "priority") || "medium";
  const dueDate = optionString(event, "due_date");
  const confirm = optionBoolean(event, "confirm");

  if (!title || !notes) {
    await transport.editReply("`title` and `notes` are required.");
    return;
  }

  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    await transport.editReply("`due_date` must use YYYY-MM-DD.");
    return;
  }

  if (!confirm) {
    await transport.editReply(
      previewMessage({
        title,
        notes,
        type,
        priority,
        dueDate: dueDate || undefined,
      })
    );
    return;
  }

  const response = await fetch(`${HUB_BASE_URL.replace(/\/$/, "")}/api/backlog/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-backlog-admin-secret": BACKLOG_ADMIN_SECRET,
    },
    body: JSON.stringify({
      title,
      notes,
      type,
      priority,
      dueDate: dueDate || undefined,
      sourceSurface: "discord",
      sourceActor: event.actor.username,
      sourceConversationId: event.conversation.id,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const error = payload?.error || `Backlog create failed with HTTP ${response.status}`;
    await transport.editReply(error);
    return;
  }

  const result = payload.data;
  const issueLine = result.project?.github?.issue_url
    ? `Issue: ${result.project.github.issue_url}`
    : "Issue: not created (GitHub integration not configured)";
  const backlogLine = `${HUB_BASE_URL.replace(/\/$/, "")}/backlog?id=${encodeURIComponent(result.project.id)}`;

  await transport.editReply(
    [
      `Created backlog item \`${result.project.id}\`.`,
      `Backlog: ${backlogLine}`,
      `PRD: ${HUB_BASE_URL.replace(/\/$/, "")}/api/backlog/${encodeURIComponent(result.project.id)}`,
      issueLine,
      result.warning || null,
    ]
      .filter((line) => line !== null)
      .join("\n")
  );
}
