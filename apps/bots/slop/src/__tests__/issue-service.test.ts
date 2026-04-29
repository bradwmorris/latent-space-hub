import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  BACKLOG_ADMIN_SECRET: "secret",
  HUB_BASE_URL: "https://hub.test",
}));

import { handleIssueCommandEvent } from "../core/commands/issue-service";
import type { RuntimeCommandEvent, RuntimeCommandTransport } from "../core/runtime/types";

function makeEvent(): RuntimeCommandEvent {
  return {
    kind: "command",
    id: "cmd-1",
    commandName: "issue",
    actor: {
      id: "user-1",
      username: "alice",
      globalName: "Alice",
    },
    conversation: {
      id: "chan-1",
      name: "paper-club",
      kind: "channel",
    },
    options: {
      title: "Fix the thing",
      body: "Detailed report",
      labels: "bug, discord",
    },
  };
}

function makeTransport(): RuntimeCommandTransport {
  return {
    conversation: {
      id: "chan-1",
      name: "paper-club",
      kind: "channel",
    },
    editReply: vi.fn().mockResolvedValue({ id: "reply-1" }),
    followUp: vi.fn().mockResolvedValue(undefined),
    openThread: vi.fn().mockResolvedValue(null),
    sendText: vi.fn().mockResolvedValue(undefined),
  };
}

describe("issue service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates issues through the Hub backlog API so the backlog UI stays in sync", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          project: {
            id: "fix-the-thing",
            github: {
              issue_number: 123,
              issue_url: "https://github.test/issue/123",
            },
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = makeTransport();

    await handleIssueCommandEvent(makeEvent(), transport);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hub.test/api/backlog/projects",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-backlog-admin-secret": "secret",
        }),
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      title: "Fix the thing",
      notes: expect.stringContaining("Detailed report"),
      labels: ["bug", "discord"],
      sourceSurface: "discord",
      sourceActor: "alice",
      sourceConversationId: "chan-1",
    });
    expect(transport.editReply).toHaveBeenCalledWith(
      expect.stringContaining("Backlog: https://hub.test/backlog?id=fix-the-thing")
    );
    expect(transport.editReply).toHaveBeenCalledWith(
      expect.stringContaining("Issue #123: https://github.test/issue/123")
    );
  });
});
