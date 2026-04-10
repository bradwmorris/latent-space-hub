import {
  ChannelType,
  ThreadAutoArchiveDuration,
  type ChatInputCommandInteraction,
  type Message,
  type User,
} from "discord.js";
import type {
  RuntimeActor,
  RuntimeChatTransport,
  RuntimeCommandEvent,
  RuntimeCommandTransport,
  RuntimeConversation,
  RuntimeMessageEvent,
  RuntimeReplyPort,
} from "../../core/runtime/types";

function safeAvatarUrl(user: Pick<User, "displayAvatarURL">): string | undefined {
  try {
    return user.displayAvatarURL({ size: 256, extension: "png" });
  } catch {
    return undefined;
  }
}

function inferOwnerProfile(channel: { type: ChannelType; name?: string | null }): "Slop" | null {
  if (
    channel.type !== ChannelType.PublicThread &&
    channel.type !== ChannelType.PrivateThread
  ) {
    return null;
  }
  const threadName = (channel.name || "").trim().toLowerCase();
  if (threadName.startsWith("slop:")) return "Slop";
  return null;
}

function toRuntimeActor(user: {
  id: string;
  username: string;
  globalName?: string | null;
  bot?: boolean;
  displayAvatarURL?: User["displayAvatarURL"];
}): RuntimeActor {
  return {
    id: user.id,
    username: user.username,
    globalName: user.globalName || undefined,
    avatarUrl: user.displayAvatarURL ? safeAvatarUrl(user as User) : undefined,
    isBot: Boolean(user.bot),
  };
}

function toRuntimeConversation(channel: {
  id: string;
  name?: string | null;
  type: ChannelType;
  parentId?: string | null;
}): RuntimeConversation {
  return {
    id: channel.id,
    name: channel.name || channel.id,
    kind:
      channel.type === ChannelType.PublicThread ||
      channel.type === ChannelType.PrivateThread
        ? "thread"
        : "channel",
    parentId: channel.parentId || undefined,
    ownerProfile: inferOwnerProfile(channel),
  };
}

function stripBotMention(content: string, botUserId: string): string {
  const mentionPattern = new RegExp(`<@!?${botUserId}>`, "g");
  const cleaned = content.replace(mentionPattern, "").trim();
  return cleaned;
}

export function createRuntimeMessageEvent(
  message: Message,
  botUserId: string,
  allowed: boolean
): RuntimeMessageEvent {
  const directMentionPattern = new RegExp(`<@!?${botUserId}>`);
  return {
    kind: "message",
    id: message.id,
    actor: {
      ...toRuntimeActor(message.author),
      isWebhook: Boolean(message.webhookId),
    },
    conversation: toRuntimeConversation(message.channel),
    content: message.content,
    cleanContent: stripBotMention(message.content, botUserId),
    inGuild: message.inGuild(),
    allowed,
    mentionsBot:
      message.mentions.users.has(botUserId) || directMentionPattern.test(message.content),
    replyToBot:
      Boolean(message.reference?.messageId) &&
      message.mentions.repliedUser?.id === botUserId,
  };
}

export function createRuntimeReplyPort(message: Message): RuntimeReplyPort {
  return {
    conversation: toRuntimeConversation(message.channel),
    messageId: message.id,
    reply: async (text: string) => {
      await message.reply(text);
    },
  };
}

export function createDiscordChatTransport(message: Message): RuntimeChatTransport {
  const baseChannel = message.channel as any;

  return {
    ensureReplyConversation: async (sourceConversation, seedText, botName) => {
      if (
        message.channel.type === ChannelType.PublicThread ||
        message.channel.type === ChannelType.PrivateThread
      ) {
        return sourceConversation;
      }

      const seed = seedText.trim().replace(/\s+/g, " ").slice(0, 40) || "discussion";
      try {
        const thread = await message.startThread({
          name: `${botName}: ${seed}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          reason: `${botName} conversation thread`,
        });
        return toRuntimeConversation(thread);
      } catch {
        return sourceConversation;
      }
    },
    sendTyping: async (conversation) => {
      if (conversation.id === message.channel.id) {
        if (typeof baseChannel.sendTyping === "function") {
          await baseChannel.sendTyping();
        }
        return;
      }
      const thread = message.channel.isThread()
        ? baseChannel
        : await baseChannel.threads?.fetch?.(conversation.id).catch(() => null);
      if (thread && typeof thread.sendTyping === "function") {
        await thread.sendTyping();
      }
    },
    sendText: async (conversation, text) => {
      if (conversation.id === message.channel.id) {
        const sent = await baseChannel.send(text);
        return { id: sent.id };
      }
      const thread = message.channel.isThread()
        ? baseChannel
        : await baseChannel.threads?.fetch?.(conversation.id).catch(() => null);
      if (thread && typeof thread.send === "function") {
        const sent = await thread.send(text);
        return { id: sent.id };
      }
      const sent = await baseChannel.send(text);
      return { id: sent.id };
    },
  };
}

export function createRuntimeCommandEvent(
  interaction: ChatInputCommandInteraction
): RuntimeCommandEvent {
  return {
    kind: "command",
    id: interaction.id,
    actor: toRuntimeActor(interaction.user),
    conversation: {
      id: interaction.channelId || "unknown-channel",
      name: interaction.channel?.isTextBased() ? "channel" : "unknown",
      kind:
        interaction.channel?.type === ChannelType.PublicThread ||
        interaction.channel?.type === ChannelType.PrivateThread
          ? "thread"
          : "channel",
      parentId:
        interaction.channel &&
        "parentId" in interaction.channel &&
        typeof interaction.channel.parentId === "string"
          ? interaction.channel.parentId
          : undefined,
    },
    commandName: interaction.commandName as RuntimeCommandEvent["commandName"],
  };
}

export function createDiscordCommandTransport(
  interaction: ChatInputCommandInteraction
): RuntimeCommandTransport {
  const channel = interaction.channel as any;
  const baseConversation: RuntimeConversation = {
    id: interaction.channelId || "unknown-channel",
    name: channel?.name || interaction.channelId || "unknown",
    kind:
      interaction.channel?.type === ChannelType.PublicThread ||
      interaction.channel?.type === ChannelType.PrivateThread
        ? "thread"
        : "channel",
    parentId:
      interaction.channel &&
      "parentId" in interaction.channel &&
      typeof interaction.channel.parentId === "string"
        ? interaction.channel.parentId
        : undefined,
  };

  return {
    conversation: baseConversation,
    editReply: async (text: string) => {
      const reply = await interaction.editReply(text);
      return { id: reply.id };
    },
    followUp: async (text: string) => {
      await interaction.followUp(text);
    },
    openThread: async ({ name, startMessageId, reason }) => {
      if (!channel || !channel.threads) return null;
      try {
        const thread = await channel.threads.create({
          name,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
          startMessage: startMessageId,
          reason,
        });
        return toRuntimeConversation(thread);
      } catch {
        return null;
      }
    },
    sendText: async (conversation, text) => {
      if (!channel || typeof channel.send !== "function") {
        throw new Error("Interaction channel is not text based");
      }
      if (conversation.id === channel.id) {
        const sent = await channel.send(text);
        return { id: sent.id };
      }
      const thread = await channel.threads?.fetch?.(conversation.id).catch(() => null);
      if (!thread || typeof thread.send !== "function") {
        throw new Error(`Thread not found for conversation ${conversation.id}`);
      }
      const sent = await thread.send(text);
      return { id: sent.id };
    },
    sendWarning: async (conversation, text) => {
      const client = interaction.client;
      const channel = await client.channels.fetch(conversation.id).catch(() => null);
      const textChannel = channel as any;
      if (textChannel && typeof textChannel.send === "function") {
        await textChannel.send(text);
      }
    },
  };
}
