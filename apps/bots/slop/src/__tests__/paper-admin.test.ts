import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  ensurePaperMentionsTable: vi.fn(),
  getPaperMentionByDiscordThreadId: vi.fn(),
  createEventNodeAtomic: vi.fn(),
  createEdge: vi.fn(),
  markPaperMentionScheduled: vi.fn(),
  updatePaperMentionPaperUrl: vi.fn(),
  upsertPaperMention: vi.fn(),
  getNodeById: vi.fn(),
  createMemberNodeFromUser: vi.fn(),
}));

vi.mock("../config", () => ({
  db: mocks.db,
  REMINDERS_TIMEZONE: "America/Los_Angeles",
  PAPER_SCHEDULER_ADMIN_DISCORD_IDS: new Set(["vibhu-id"]),
  PAPER_SCHEDULER_ADMIN_USERNAMES: new Set(["swyxio", "bradwmorris", "beeradley"]),
}));

vi.mock("../db", () => ({
  ensurePaperMentionsTable: mocks.ensurePaperMentionsTable,
  getPaperMentionByDiscordThreadId: mocks.getPaperMentionByDiscordThreadId,
  createEventNodeAtomic: mocks.createEventNodeAtomic,
  createEdge: mocks.createEdge,
  markPaperMentionScheduled: mocks.markPaperMentionScheduled,
  updatePaperMentionPaperUrl: mocks.updatePaperMentionPaperUrl,
  upsertPaperMention: mocks.upsertPaperMention,
  getNodeById: mocks.getNodeById,
}));

vi.mock("../members", () => ({
  createMemberNodeFromUser: mocks.createMemberNodeFromUser,
}));

import {
  handlePaperMentionAdminMessage,
  isPaperAdminAction,
  isPaperSchedulerAdmin,
  parsePaperClubDate,
  parseProposedPaperTitle,
} from "../paper-candidates/admin";

const paperMention = {
  id: 11,
  title: "Learning Mechanics",
  paper_url: "https://arxiv.org/abs/2604.21691",
  summary: "A paper summary.",
  thumbnail_url: null,
  source_url: null,
  discord_channel_id: "paper-channel",
  discord_message_id: "original-message",
  discord_thread_id: "paper-thread",
  suggested_by_discord_id: "someone",
  suggested_by_handle: "someone",
  status: "mentioned",
  scheduled_event_node_id: null,
  confirmed_by_discord_id: null,
  confirmed_at: null,
  created_at: "2026-08-20T00:00:00.000Z",
  updated_at: "2026-08-20T00:00:00.000Z",
};

const organizer = { id: "brad-id", username: "bradwmorris", globalName: "Brad Morris", bot: false };
const speaker = { id: "speaker-id", username: "alice", globalName: "Alice", bot: false };
const bot = { id: "slop-id", username: "slop", globalName: "Slop", bot: true };

function makeMessage(params: {
  content: string;
  threadId?: string;
  mentionedUsers?: Array<typeof organizer>;
  createdThread?: { id: string; send: ReturnType<typeof vi.fn> };
}) {
  const mentioned = params.mentionedUsers || [];
  return {
    id: `message-${params.threadId || "channel"}`,
    channelId: params.threadId || "paper-thread",
    content: params.content,
    author: organizer,
    client: { user: bot },
    mentions: {
      users: {
        has: (id: string) => mentioned.some((user) => user.id === id),
        find: (predicate: (user: typeof organizer) => boolean) => mentioned.find(predicate),
      },
    },
    startThread: vi.fn().mockResolvedValue(params.createdThread),
    reply: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("paper mention organizer scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPaperMentionByDiscordThreadId.mockResolvedValue(paperMention);
    mocks.createEventNodeAtomic.mockResolvedValue({ nodeId: 42, alreadyBooked: false });
    mocks.createMemberNodeFromUser.mockResolvedValue({ id: 7 });
    mocks.upsertPaperMention.mockResolvedValue({ id: 21, alreadyExists: false });
  });

  it("allows configured Discord IDs and organizer usernames", () => {
    expect(isPaperSchedulerAdmin({ id: "vibhu-id", username: "vibhu" })).toBe(true);
    for (const username of ["swyxio", "bradwmorris", "beeradley", "SwyxIO"]) {
      expect(isPaperSchedulerAdmin({ id: `id-${username}`, username })).toBe(true);
    }
    expect(isPaperSchedulerAdmin({ id: "someone-else", username: "alice" })).toBe(false);
  });

  it("recognizes a natural create request", () => {
    expect(isPaperAdminAction("@Slop create a Paper Club for @alice next week")).toBe(true);
    expect(parseProposedPaperTitle("@Slop add @alice to speak next week on 'Mechanics of Learning'"))
      .toBe("Mechanics of Learning");
  });

  it("resolves next week to Wednesday in the Paper Club timezone", () => {
    expect(
      parsePaperClubDate(
        "next week",
        new Date("2026-08-27T01:00:00.000Z"),
        "America/Los_Angeles"
      )
    ).toBe("2026-09-02");
  });

  it("asks for confirmation and only creates the event after yes", async () => {
    const start = makeMessage({
      content: "<@slop-id> create a Paper Club for <@speaker-id> next week",
      mentionedUsers: [bot, speaker],
    });

    await handlePaperMentionAdminMessage(start);

    expect(mocks.createEventNodeAtomic).not.toHaveBeenCalled();
    expect(start.reply).toHaveBeenCalledWith(expect.stringContaining("Reply **yes**"));

    const confirmation = makeMessage({ content: "yes" });
    await handlePaperMentionAdminMessage(confirmation);

    expect(mocks.createEventNodeAtomic).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        event_date: parsePaperClubDate("next week"),
        presenter_discord_id: "speaker-id",
        paper_url: paperMention.paper_url,
      })
    );
    expect(mocks.markPaperMentionScheduled).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ paperMentionId: 11, scheduledEventNodeId: 42 })
    );
  });

  it("collects and appends a missing paper link before confirmation", async () => {
    const mentionWithoutLink = { ...paperMention, id: 12, paper_url: "", discord_thread_id: "link-thread" };
    mocks.getPaperMentionByDiscordThreadId.mockResolvedValue(mentionWithoutLink);
    const start = makeMessage({
      threadId: "link-thread",
      content: "<@slop-id> create a Paper Club for <@speaker-id> next week",
      mentionedUsers: [bot, speaker],
    });

    await handlePaperMentionAdminMessage(start);
    expect(start.reply).toHaveBeenCalledWith("Before I schedule this, please send the paper link.");

    const linkReply = makeMessage({
      threadId: "link-thread",
      content: "https://arxiv.org/abs/2608.12345",
    });
    await handlePaperMentionAdminMessage(linkReply);

    expect(mocks.updatePaperMentionPaperUrl).toHaveBeenCalledWith(
      mocks.db,
      12,
      "https://arxiv.org/abs/2608.12345"
    );
    expect(linkReply.reply).toHaveBeenCalledWith(expect.stringContaining("Reply **yes**"));

    await handlePaperMentionAdminMessage(makeMessage({ threadId: "link-thread", content: "yes" }));
    expect(mocks.createEventNodeAtomic).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ paper_url: "https://arxiv.org/abs/2608.12345" })
    );
  });

  it("creates a confirmation thread from a natural channel request", async () => {
    mocks.getPaperMentionByDiscordThreadId.mockResolvedValue(null);
    const createdThread = { id: "new-paper-thread", send: vi.fn().mockResolvedValue(undefined) };
    const channelMessage = makeMessage({
      threadId: "paper-channel",
      content: "<@slop-id> can you add <@speaker-id> to speak next week on 'Attention Is All You Need'",
      mentionedUsers: [bot, speaker],
      createdThread,
    });

    await handlePaperMentionAdminMessage(channelMessage);

    expect(channelMessage.startThread).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringContaining("Attention Is All You Need") })
    );
    expect(mocks.upsertPaperMention).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        title: "Attention Is All You Need",
        paperUrl: "",
        discordThreadId: "new-paper-thread",
      })
    );
    expect(createdThread.send).toHaveBeenCalledWith(
      "Before I schedule this, please send the paper link."
    );
    expect(mocks.createEventNodeAtomic).not.toHaveBeenCalled();

    await handlePaperMentionAdminMessage(makeMessage({
      threadId: "new-paper-thread",
      content: "https://arxiv.org/abs/1706.03762",
    }));
    await handlePaperMentionAdminMessage(makeMessage({
      threadId: "new-paper-thread",
      content: "yes",
    }));

    expect(mocks.createEventNodeAtomic).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        paper_title: "Attention Is All You Need",
        paper_url: "https://arxiv.org/abs/1706.03762",
        presenter_discord_id: "speaker-id",
      })
    );
  });
});
