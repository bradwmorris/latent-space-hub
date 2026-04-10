import {
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import {
  createDiscordCommandTransport,
  createRuntimeCommandEvent,
} from "../adapters/discord/runtime";
import {
  getEditEventSession as getCoreEditEventSession,
  handleEditEventReplyEvent,
  startEditEventCommandEvent,
  type EditSession,
} from "../core/commands/edit-event-service";

export function getEditEventSession(channelId: string): EditSession | undefined {
  return getCoreEditEventSession(channelId);
}

export async function handleEditEventCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await startEditEventCommandEvent(
    createRuntimeCommandEvent(interaction),
    createDiscordCommandTransport(interaction)
  );
}

export async function handleEditEventReply(message: Message, session: EditSession): Promise<void> {
  await handleEditEventReplyEvent(
    {
      kind: "message",
      id: message.id || `msg-${message.channelId}`,
      actor: {
        id: message.author?.id || session.memberDiscordId,
        username: message.author?.username || session.memberUsername || "user",
      },
      conversation: {
        id: message.channelId,
        name: message.channelId,
        kind: "thread",
        ownerProfile: "Slop",
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
        ownerProfile: "Slop",
      },
      messageId: message.id || `msg-${message.channelId}`,
      reply: async (text: string) => {
        await message.reply(text);
      },
    },
    session
  );
}
