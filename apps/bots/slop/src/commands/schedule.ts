import {
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import type { BotProfile, SchedulingSession } from "../types";
import {
  createDiscordCommandTransport,
  createRuntimeCommandEvent,
} from "../adapters/discord/runtime";
import {
  getSchedulingSession as getCoreSchedulingSession,
  handleSchedulingReplyEvent,
  startScheduleCommandEvent,
} from "../core/commands/schedule-service";

export function getSchedulingSession(channelId: string): SchedulingSession | undefined {
  return getCoreSchedulingSession(channelId);
}

export async function handleScheduleCommand(
  profile: BotProfile,
  interaction: ChatInputCommandInteraction,
  command: "paper-club" | "builders-club"
): Promise<void> {
  const runtimeEvent = createRuntimeCommandEvent(interaction);
  runtimeEvent.commandName = command;
  await startScheduleCommandEvent(
    profile,
    runtimeEvent,
    createDiscordCommandTransport(interaction),
    command
  );
}

export async function handleSchedulingReply(
  profile: BotProfile,
  message: Message,
  session: SchedulingSession
): Promise<void> {
  await handleSchedulingReplyEvent(
    profile,
    {
      kind: "message",
      id: message.id,
      actor: {
        id: message.author?.id || session.memberDiscordId,
        username: message.author?.username || session.memberUsername,
      },
      conversation: {
        id: message.channelId,
        name: message.channelId,
        kind: "thread",
        ownerProfile: profile.name,
      },
      content: message.content,
      cleanContent: message.content.trim(),
      inGuild: true,
      allowed: true,
      mentionsBot: false,
      replyToBot: false,
    },
    {
      conversation: {
        id: message.channelId,
        name: message.channelId,
        kind: "thread",
        ownerProfile: profile.name,
      },
      messageId: message.id,
      reply: async (text: string) => {
        await message.reply(text);
      },
    },
    session
  );
}
