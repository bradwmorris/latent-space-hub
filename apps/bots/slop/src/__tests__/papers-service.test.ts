import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRecentPaperMentions } = vi.hoisted(() => ({
  getRecentPaperMentions: vi.fn(),
}));

vi.mock("../config", () => ({
  db: {},
}));

vi.mock("../db", () => ({
  getRecentPaperMentions,
}));

import { handlePapersCommandEvent } from "../core/commands/papers-service";
import type { RuntimeCommandEvent, RuntimeCommandTransport } from "../core/runtime/types";

function makeEvent(): RuntimeCommandEvent {
  return {
    kind: "command",
    id: "cmd-1",
    commandName: "papers",
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
    options: {},
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

function makePaper(index: number) {
  const longTitle = `Very Long Paper Title ${index} ${"Token ".repeat(120)}`.trim();
  return {
    id: index,
    title: longTitle,
    paper_url: `https://example.com/papers/${index}/${"long-path-".repeat(20)}`,
    summary: "Summary ".repeat(80),
    thumbnail_url: null,
    source_url: null,
    discord_channel_id: "chan-1",
    discord_message_id: `msg-${index}`,
    discord_thread_id: `thread-${index}`,
    suggested_by_discord_id: "user-1",
    suggested_by_handle: `alice-${index}-${"handle".repeat(20)}`,
    status: "mentioned",
    scheduled_event_node_id: null,
    confirmed_by_discord_id: null,
    confirmed_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

describe("papers service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("splits oversized recent paper lists into Discord-safe messages", async () => {
    getRecentPaperMentions.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => makePaper(index + 1))
    );
    const transport = makeTransport();

    await handlePapersCommandEvent(makeEvent(), transport);

    expect(transport.editReply).toHaveBeenCalledTimes(1);
    expect(transport.followUp).toHaveBeenCalled();

    const sentMessages = [
      (transport.editReply as ReturnType<typeof vi.fn>).mock.calls[0][0],
      ...(transport.followUp as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]),
    ];

    expect(sentMessages.join("\n")).toContain("**Recent papers**");
    expect(sentMessages.every((message) => message.length <= 1800)).toBe(true);
  });
});
