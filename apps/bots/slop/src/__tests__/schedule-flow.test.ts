import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  db: {},
  HUB_BASE_URL: "https://hub.test",
}));

vi.mock("../db", () => ({
  createEventNodeAtomic: vi.fn(),
  createEdge: vi.fn(),
  getBookedDates: vi.fn(),
  markPaperCandidateScheduled: vi.fn(),
}));

vi.mock("../members", () => ({
  createMemberNodeFromUser: vi.fn(),
  lookupMember: vi.fn(),
}));

vi.mock("../llm/tracing", () => ({
  logTrace: vi.fn(),
}));

import { handleSchedulingReply } from "../commands/schedule";
import type { SchedulingSession } from "../types";

function makeMessage(content: string) {
  return {
    id: "msg-1",
    channelId: "thread-1",
    content,
    reply: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("schedule flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves from pick_date to pick_title when the user selects a date without a title", async () => {
    const session: SchedulingSession = {
      eventType: "paper-club",
      memberId: 1,
      memberDiscordId: "user-1",
      memberUsername: "alice",
      availableDates: ["2026-04-08", "2026-04-15"],
      step: "pick_date",
    };
    const message = makeMessage("2");

    await handleSchedulingReply({ name: "Slop", model: "model", token: "token" }, message, session);

    expect(session.step).toBe("pick_title");
    expect(session.chosenDate).toBe("2026-04-15");
    expect(message.reply).toHaveBeenCalledWith(
      "Got it: **Wed, Apr 15**. What paper are you presenting? (title, optionally URL)"
    );
  });

  it("uses a prefilled paper when the user selects a date from a candidate thread", async () => {
    const dbOps = await import("../db");
    vi.mocked(dbOps.createEventNodeAtomic).mockResolvedValue({
      nodeId: 42,
      alreadyBooked: false,
    });
    vi.mocked(dbOps.createEdge).mockResolvedValue(undefined);
    vi.mocked(dbOps.markPaperCandidateScheduled).mockResolvedValue(undefined);
    const session: SchedulingSession = {
      eventType: "paper-club",
      memberId: 1,
      memberDiscordId: "user-1",
      memberUsername: "alice",
      availableDates: ["2026-05-06"],
      step: "pick_date",
      prefilledPaperTitle: "Learning Mechanics",
      prefilledPaperUrl: "https://arxiv.org/abs/2604.21691",
      paperCandidateNodeId: 9,
      sourceDiscordThreadId: "thread-1",
      sourceDiscordMessageId: "msg-original",
    };
    const message = makeMessage("1");

    await handleSchedulingReply({ name: "Slop", model: "model", token: "token" }, message, session);

    expect(dbOps.createEventNodeAtomic).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        event_type: "paper-club",
        paper_title: "Learning Mechanics",
        paper_url: "https://arxiv.org/abs/2604.21691",
        paper_candidate_node_id: 9,
        source_discord_thread_id: "thread-1",
        source_discord_message_id: "msg-original",
      })
    );
    expect(dbOps.markPaperCandidateScheduled).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        candidateNodeId: 9,
        scheduledEventNodeId: 42,
      })
    );
  });

  it("asks for a valid numeric choice when the pick_date reply is malformed", async () => {
    const session: SchedulingSession = {
      eventType: "builders-club",
      memberId: 1,
      memberDiscordId: "user-1",
      memberUsername: "alice",
      availableDates: ["2026-04-10", "2026-04-17"],
      step: "pick_date",
    };
    const message = makeMessage("next friday works");

    await handleSchedulingReply({ name: "Slop", model: "model", token: "token" }, message, session);

    expect(message.reply).toHaveBeenCalledWith("Reply with a number (1-2) to pick a date.");
    expect(session.step).toBe("pick_date");
  });

  it("prompts again when pick_title receives an empty reply", async () => {
    const session: SchedulingSession = {
      eventType: "builders-club",
      memberId: 1,
      memberDiscordId: "user-1",
      memberUsername: "alice",
      availableDates: ["2026-04-10"],
      step: "pick_title",
      chosenDate: "2026-04-10",
    };
    const message = makeMessage("   ");

    await handleSchedulingReply({ name: "Slop", model: "model", token: "token" }, message, session);

    expect(message.reply).toHaveBeenCalledWith("What's your topic?");
  });
});
