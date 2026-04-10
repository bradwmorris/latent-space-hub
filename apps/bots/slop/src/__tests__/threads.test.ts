import { describe, expect, it, vi } from "vitest";
import { ChannelType, ThreadAutoArchiveDuration } from "discord.js";
import { ensureDestinationChannel } from "../discord/threads";

describe("ensureDestinationChannel", () => {
  it("returns the existing thread when the message is already in a thread", async () => {
    const thread = { type: ChannelType.PublicThread, id: "thread-1" };
    const result = await ensureDestinationChannel({
      channel: thread,
    } as any, "Slop");
    expect(result).toBe(thread);
  });

  it("creates a new thread from a channel message when possible", async () => {
    const createdThread = { id: "thread-2", type: ChannelType.PublicThread };
    const startThread = vi.fn().mockResolvedValue(createdThread);
    const message = {
      content: "   tell me about inference clusters   ",
      channel: { type: ChannelType.GuildText },
      startThread,
    };

    const result = await ensureDestinationChannel(message as any, "Slop");

    expect(result).toBe(createdThread);
    expect(startThread).toHaveBeenCalledWith({
      name: "Slop: tell me about inference clusters",
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: "Slop conversation thread",
    });
  });

  it("falls back to the source channel when thread creation fails", async () => {
    const channel = { type: ChannelType.GuildText, id: "channel-1" };
    const message = {
      content: "hello",
      channel,
      startThread: vi.fn().mockRejectedValue(new Error("missing permissions")),
    };

    const result = await ensureDestinationChannel(message as any, "Slop");

    expect(result).toBe(channel);
  });
});
