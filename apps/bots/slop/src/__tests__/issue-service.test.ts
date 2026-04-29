import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  GITHUB_ISSUE_REPO_NAME: "latent-space-hub",
  GITHUB_ISSUE_REPO_OWNER: "bradwmorris",
  GITHUB_ISSUE_TOKEN: "github-token",
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

  it("creates a GitHub issue only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        number: 123,
        html_url: "https://github.test/issue/123",
        title: "Fix the thing",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = makeTransport();

    await handleIssueCommandEvent(makeEvent(), transport);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/bradwmorris/latent-space-hub/issues",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer github-token",
        }),
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      title: "Fix the thing",
      body: expect.stringContaining("Detailed report"),
      labels: ["backlog", "bug", "discord"],
    });
    expect(transport.editReply).toHaveBeenCalledWith(
      "Created issue #123: https://github.test/issue/123"
    );
  });
});
