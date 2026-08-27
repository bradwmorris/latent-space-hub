import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlePaperCandidateMessage: vi.fn(),
  handlePaperMentionAdminMessage: vi.fn(),
  dispatchRuntimeMessageEvent: vi.fn(),
  createRuntimeMessageEvent: vi.fn(() => ({ kind: "message" })),
  createDiscordChatTransport: vi.fn(() => ({})),
  createRuntimeReplyPort: vi.fn(() => ({})),
}));

vi.mock("../config", () => ({
  ALLOWED_CHANNEL_IDS: new Set<string>(),
  BOT_INSTANCE_ID: "test",
  PAPER_CLUB_CHANNEL_ID: "paper-channel",
  REMINDERS_ENABLED: false,
  REMINDERS_ONE_HOUR_ENABLED: false,
  REMINDERS_TIMEZONE: "America/Los_Angeles",
  clientsByProfile: new Map(),
  db: {},
}));
vi.mock("../commands/register", () => ({ registerSlashCommands: vi.fn() }));
vi.mock("../reminders", () => ({ setupReminders: vi.fn() }));
vi.mock("../core/runtime/dispatch", () => ({
  dispatchRuntimeCommandEvent: vi.fn(),
  dispatchRuntimeMessageEvent: mocks.dispatchRuntimeMessageEvent,
}));
vi.mock("../adapters/discord/runtime", () => ({
  createDiscordChatTransport: mocks.createDiscordChatTransport,
  createDiscordCommandTransport: vi.fn(),
  createRuntimeCommandEvent: vi.fn(),
  createRuntimeMessageEvent: mocks.createRuntimeMessageEvent,
  createRuntimeReplyPort: mocks.createRuntimeReplyPort,
}));
vi.mock("../paper-candidates/buttons", () => ({ handlePaperCandidateButton: vi.fn() }));
vi.mock("../paper-candidates/admin", () => ({
  handlePaperMentionAdminMessage: mocks.handlePaperMentionAdminMessage,
}));
vi.mock("../paper-candidates/service", () => ({
  handlePaperCandidateMessage: mocks.handlePaperCandidateMessage,
}));

import { handleMessage } from "../discord/bot";

function makeMessage(id: string) {
  return {
    id,
    channelId: "paper-channel",
    author: { id: "author-id" },
  } as any;
}

describe("Discord paper message routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlePaperMentionAdminMessage.mockResolvedValue(false);
    mocks.handlePaperCandidateMessage.mockResolvedValue(false);
  });

  it("stops before generic chat after handling an organizer schedule", async () => {
    mocks.handlePaperMentionAdminMessage.mockResolvedValue(true);
    await handleMessage({ user: { id: "bot-id" } } as any, { name: "Slop" } as any, makeMessage("admin-1"));

    expect(mocks.handlePaperCandidateMessage).not.toHaveBeenCalled();
    expect(mocks.dispatchRuntimeMessageEvent).not.toHaveBeenCalled();
  });

  it("stops before generic chat after handling a paper candidate", async () => {
    mocks.handlePaperCandidateMessage.mockResolvedValue(true);
    await handleMessage({ user: { id: "bot-id" } } as any, { name: "Slop" } as any, makeMessage("candidate-1"));

    expect(mocks.dispatchRuntimeMessageEvent).not.toHaveBeenCalled();
  });
});
