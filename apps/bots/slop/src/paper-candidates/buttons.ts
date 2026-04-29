import {
  ChannelType,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import { db } from "../config";
import * as dbOps from "../db";
import type {
  RuntimeCommandEvent,
  RuntimeCommandTransport,
  RuntimeConversation,
} from "../core/runtime/types";
import { startPrefilledPaperClubScheduleEvent } from "../core/commands/schedule-service";
import type { BotProfile } from "../types";
import { PAPER_CANDIDATE_PRESENT_PREFIX } from "./service";

function toConversation(interaction: ButtonInteraction): RuntimeConversation {
  const channel = interaction.channel;
  return {
    id: interaction.channelId || "unknown-channel",
    name: channel && "name" in channel && channel.name ? channel.name : interaction.channelId || "unknown",
    kind:
      channel?.type === ChannelType.PublicThread ||
      channel?.type === ChannelType.PrivateThread
        ? "thread"
        : "channel",
    parentId:
      channel &&
      "parentId" in channel &&
      typeof channel.parentId === "string"
        ? channel.parentId
        : undefined,
  };
}

function toCommandEvent(interaction: ButtonInteraction): RuntimeCommandEvent {
  return {
    kind: "command",
    id: interaction.id,
    actor: {
      id: interaction.user.id,
      username: interaction.user.username,
      globalName: interaction.user.globalName || undefined,
      isBot: Boolean(interaction.user.bot),
    },
    conversation: toConversation(interaction),
    commandName: "paper-club",
    options: {},
  };
}

function createButtonSchedulingTransport(
  interaction: ButtonInteraction
): RuntimeCommandTransport {
  const channel = interaction.channel as any;
  const conversation = toConversation(interaction);
  return {
    conversation,
    editReply: async (text: string) => {
      const reply = await interaction.editReply(text);
      return { id: (reply as Message).id };
    },
    followUp: async (text: string) => {
      await interaction.followUp(text);
    },
    openThread: async () => null,
    sendText: async (target, text) => {
      if (target.id === conversation.id && channel && typeof channel.send === "function") {
        const sent = await channel.send(text);
        return { id: sent.id };
      }
      const fetched = await interaction.client.channels.fetch(target.id).catch(() => null);
      const textChannel = fetched as any;
      if (textChannel && typeof textChannel.send === "function") {
        const sent = await textChannel.send(text);
        return { id: sent.id };
      }
      throw new Error(`Conversation ${target.id} is not text based`);
    },
    sendWarning: async (target, text) => {
      const fetched = await interaction.client.channels.fetch(target.id).catch(() => null);
      const textChannel = fetched as any;
      if (textChannel && typeof textChannel.send === "function") {
        await textChannel.send(text);
      }
    },
  };
}

export async function handlePaperCandidateButton(
  profile: BotProfile,
  interaction: ButtonInteraction
): Promise<boolean> {
  if (!interaction.customId.startsWith(PAPER_CANDIDATE_PRESENT_PREFIX)) return false;

  const rawId = interaction.customId.slice(PAPER_CANDIDATE_PRESENT_PREFIX.length);
  const candidateNodeId = Number(rawId);
  if (!Number.isFinite(candidateNodeId) || candidateNodeId <= 0) {
    await interaction.reply({ content: "That Paper Club candidate is not valid.", ephemeral: true });
    return true;
  }

  await interaction.deferReply();
  const candidate = await dbOps.getPaperCandidateById(db, candidateNodeId);
  if (!candidate) {
    await interaction.editReply("That Paper Club candidate could not be found.");
    return true;
  }

  const metadata = candidate.metadata || {};
  const paperTitle =
    typeof metadata.paper_title === "string" && metadata.paper_title.trim()
      ? metadata.paper_title.trim()
      : candidate.title;
  const paperUrl =
    typeof metadata.paper_url === "string" && metadata.paper_url.trim()
      ? metadata.paper_url.trim()
      : candidate.link || undefined;
  const sourceDiscordThreadId =
    typeof metadata.discord_thread_id === "string" ? metadata.discord_thread_id : interaction.channelId;
  const sourceDiscordMessageId =
    typeof metadata.discord_message_id === "string" ? metadata.discord_message_id : undefined;

  await startPrefilledPaperClubScheduleEvent(
    profile,
    toCommandEvent(interaction),
    createButtonSchedulingTransport(interaction),
    {
      paperTitle,
      paperUrl,
      sourceDiscordThreadId,
      sourceDiscordMessageId,
      paperCandidateNodeId: candidate.id,
    }
  );
  return true;
}
