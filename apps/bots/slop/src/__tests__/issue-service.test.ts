import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  GITHUB_ISSUE_BRANCH: "main",
  GITHUB_ISSUE_REPO_NAME: "latent-space-hub",
  GITHUB_ISSUE_REPO_OWNER: "bradwmorris",
  GITHUB_ISSUE_TOKEN: "github-token",
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

  it("writes the backlog, PRD, and issue directly through GitHub", async () => {
    const backlog = {
      completed: [],
      lastUpdated: "2026-04-29",
      nextPrdNumber: 50,
      projects: {},
      queue: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sha: "backlog-sha",
          content: Buffer.from(JSON.stringify(backlog), "utf-8").toString("base64"),
          encoding: "base64",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          number: 123,
          html_url: "https://github.test/issue/123",
          state: "open",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      });
    vi.stubGlobal("fetch", fetchMock);
    const transport = makeTransport();

    await handleIssueCommandEvent(makeEvent(), transport);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/bradwmorris/latent-space-hub/contents/docs/development/backlog/backlog.json?ref=main",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/bradwmorris/latent-space-hub/issues",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      title: "Fix the thing",
      labels: ["backlog", "bug", "discord"],
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://api.github.com/repos/bradwmorris/latent-space-hub/contents/docs/development/backlog/backlog.json",
      expect.objectContaining({ method: "PUT" })
    );
    expect(transport.editReply).toHaveBeenCalledWith(
      expect.stringContaining("Backlog: https://hub.test/backlog?id=fix-the-thing")
    );
    expect(transport.editReply).toHaveBeenCalledWith(
      expect.stringContaining("Issue #123: https://github.test/issue/123")
    );
  });
});
