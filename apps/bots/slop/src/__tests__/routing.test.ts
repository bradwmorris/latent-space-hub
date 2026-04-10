import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType } from "discord.js";

vi.mock("../config", () => ({
  ALLOWED_CHANNEL_IDS: new Set<string>(["allowed-channel"]),
}));

import {
  cleanUserPrompt,
  getThreadOwnerBotName,
  isAllowedChannel,
  shouldRespondToMessage,
} from "../discord/routing";

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    content: "hello",
    channelId: "allowed-channel",
    channel: { type: ChannelType.GuildText, name: "general" },
    author: { id: "user-1", bot: false },
    mentions: {
      users: {
        has: vi.fn().mockReturnValue(false),
      },
      repliedUser: undefined,
    },
    reference: undefined,
    inGuild: () => true,
    ...overrides,
  } as any;
}

describe("discord routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("strips the bot mention from the user prompt", () => {
    const message = makeMessage({
      content: "<@bot-1>   what's new?",
    });
    expect(cleanUserPrompt(message, "bot-1")).toBe("what's new?");
  });

  it("detects owned Slop threads by name", () => {
    const message = makeMessage({
      channel: { type: ChannelType.PublicThread, name: "Slop: thread seed" },
    });
    expect(getThreadOwnerBotName(message)).toBe("Slop");
  });

  it("responds to a direct mention in an allowed guild channel", () => {
    const message = makeMessage({
      content: "<@bot-1> hi",
      mentions: {
        users: {
          has: vi.fn().mockReturnValue(true),
        },
        repliedUser: undefined,
      },
    });
    expect(shouldRespondToMessage(message, "bot-1", "Slop")).toBe(true);
    expect(isAllowedChannel(message)).toBe(true);
  });

  it("responds inside a Slop-owned thread even without a direct mention", () => {
    const message = makeMessage({
      channel: { type: ChannelType.PublicThread, name: "slop: infrastructure" },
      content: "continue this",
    });
    expect(shouldRespondToMessage(message, "bot-1", "Slop")).toBe(true);
  });

  it("does not respond in a thread owned by another bot", () => {
    const message = makeMessage({
      channel: { type: ChannelType.PublicThread, name: "otherbot: thread" },
    });
    expect(shouldRespondToMessage(message, "bot-1", "Slop")).toBe(false);
  });

  it("rejects channels outside the allowlist", () => {
    const message = makeMessage({
      channelId: "random-channel",
    });
    expect(isAllowedChannel(message)).toBe(false);
  });
});
