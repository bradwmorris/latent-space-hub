import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  db: {},
}));

vi.mock("../db", () => ({
  findRecordingNodeByYouTubeVideoId: vi.fn(),
  getRecentRecordingTargetEvents: vi.fn(),
  createRecordingNodeForEvent: vi.fn(),
  attachRecordingToEvent: vi.fn(),
}));

vi.mock("youtube-transcript-plus", () => ({
  fetchTranscript: vi.fn().mockResolvedValue([
    { text: "dependencies", offset: 0.4, duration: 5.2, lang: "en" },
    { text: "DeepSeek V4 context intelligence", offset: 5.6, duration: 4.4, lang: "en" },
  ]),
}));

import * as dbOps from "../db";
import {
  extractYouTubeVideoId,
  handleRecordingIntakeMessage,
  handleRecordingIntakeReplyEvent,
  shouldHandleRecordingIntake,
  type RecordingIntakeSession,
} from "../core/chat/recording-intake";
import type {
  RuntimeChatTransport,
  RuntimeConversation,
  RuntimeMessageEvent,
  RuntimeReplyPort,
} from "../core/runtime/types";

const conversation: RuntimeConversation = {
  id: "thread-1",
  name: "Slop: recording",
  kind: "thread",
  ownerProfile: "Slop",
};

function makeEvent(content: string): RuntimeMessageEvent {
  return {
    kind: "message",
    id: "msg-1",
    actor: {
      id: "user-1",
      username: "alice",
    },
    conversation,
    content,
    cleanContent: content.replace("@slop", "").trim(),
    inGuild: true,
    allowed: true,
    mentionsBot: true,
    replyToBot: false,
  };
}

function makeTransport(): RuntimeChatTransport {
  return {
    ensureReplyConversation: vi.fn().mockResolvedValue(conversation),
    sendTyping: vi.fn().mockResolvedValue(undefined),
    sendText: vi.fn().mockResolvedValue({ id: "bot-msg-1" }),
  };
}

function makeReplyPort(): RuntimeReplyPort {
  return {
    conversation,
    messageId: "msg-2",
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("recording intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          title: "DeepSeek-V4: Towards Highly Efficient Million-Token Context Intelligence",
          author_name: "Latent Space TV",
          author_url: "https://www.youtube.com/@LatentSpaceTV",
          thumbnail_url: "https://i.ytimg.com/vi/TJxziFGc3HA/hqdefault.jpg",
        }),
      })
    );
  });

  it("detects recording intake intent and YouTube IDs", () => {
    expect(shouldHandleRecordingIntake("add this recording to the graph")).toBe(true);
    expect(shouldHandleRecordingIntake("what does this recording cover")).toBe(false);
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=TJxziFGc3HA")).toBe("TJxziFGc3HA");
    expect(extractYouTubeVideoId("https://youtu.be/TJxziFGc3HA")).toBe("TJxziFGc3HA");
  });

  it("creates and attaches a new recording when the event match is confident", async () => {
    vi.mocked(dbOps.findRecordingNodeByYouTubeVideoId).mockResolvedValue(null);
    vi.mocked(dbOps.getRecentRecordingTargetEvents).mockResolvedValue([
      {
        id: 4555,
        title: "Paper Club: DeepSeek V4 Pro/Flash",
        event_date: "2026-04-29",
        link: "https://luma.com/dd32jzvx",
        event_type: "paper-club",
        event_status: "scheduled",
        presenter_name: "Eugene Cheah",
        paper_title: "DeepSeek V4 Pro/Flash",
        topic: null,
        metadata: {
          event_status: "scheduled",
          event_type: "paper-club",
        },
      },
      {
        id: 4554,
        title: "Paper Club: Self-Distilled RLVR paper",
        event_date: "2026-04-22",
        link: "https://luma.com/smhmwdku",
        event_type: "paper-club",
        event_status: "completed",
        presenter_name: "Vibhu Sapra",
        paper_title: "Self-Distilled RLVR paper",
        topic: null,
        metadata: {},
      },
    ]);
    vi.mocked(dbOps.createRecordingNodeForEvent).mockResolvedValue({ id: 9001 });
    vi.mocked(dbOps.attachRecordingToEvent).mockResolvedValue(undefined);
    const transport = makeTransport();
    const event = makeEvent("@slop add this recording to the graph https://www.youtube.com/watch?v=TJxziFGc3HA for Paper Club");

    const handled = await handleRecordingIntakeMessage(
      { name: "Slop", model: "model", token: "token" },
      event,
      transport,
      conversation,
      event.cleanContent
    );

    expect(handled).toBe(true);
    expect(dbOps.createRecordingNodeForEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        targetEvent: expect.objectContaining({ id: 4555 }),
        title: "DeepSeek-V4: Towards Highly Efficient Million-Token Context Intelligence",
        canonicalUrl: "https://www.youtube.com/watch?v=TJxziFGc3HA",
        videoId: "TJxziFGc3HA",
        transcript: expect.stringContaining("[0.4s] dependencies"),
        transcriptMetadata: expect.objectContaining({
          total_segments: 2,
          extraction_method: "youtube-transcript-plus",
        }),
      })
    );
    expect(dbOps.attachRecordingToEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        recordingNodeId: 9001,
        targetEvent: expect.objectContaining({ id: 4555 }),
      })
    );
    expect(transport.sendText).toHaveBeenCalledWith(
      conversation,
      expect.stringContaining("Added recording node #9001")
    );
  });

  it("attaches the selected event when clarification was required", async () => {
    vi.mocked(dbOps.createRecordingNodeForEvent).mockResolvedValue({ id: 9002 });
    vi.mocked(dbOps.attachRecordingToEvent).mockResolvedValue(undefined);
    const session: RecordingIntakeSession = {
      memberDiscordId: "user-1",
      url: "https://www.youtube.com/watch?v=abc",
      videoId: "abc",
      metadata: { title: "Ambiguous recording" },
      targets: [
        {
          score: 1,
          event: {
            id: 1,
            title: "Paper Club: First",
            event_date: "2026-04-01",
            link: null,
            event_type: "paper-club",
            event_status: "completed",
            presenter_name: null,
            paper_title: "First",
            topic: null,
            metadata: {},
          },
        },
        {
          score: 1,
          event: {
            id: 2,
            title: "Paper Club: Second",
            event_date: "2026-04-08",
            link: null,
            event_type: "paper-club",
            event_status: "completed",
            presenter_name: null,
            paper_title: "Second",
            topic: null,
            metadata: {},
          },
        },
      ],
    };
    const replyPort = makeReplyPort();

    await handleRecordingIntakeReplyEvent(makeEvent("2"), replyPort, session);

    expect(dbOps.createRecordingNodeForEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        targetEvent: expect.objectContaining({ id: 2 }),
      })
    );
    expect(replyPort.reply).toHaveBeenCalledWith(
      expect.stringContaining("linked it to event #2")
    );
  });
});
