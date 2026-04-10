import type { ChatInputCommandInteraction } from "discord.js";
import type { BotProfile } from "../types";
import { handleJoinCommandEvent } from "../core/commands/join-service";
import {
  createDiscordCommandTransport,
  createRuntimeCommandEvent,
} from "../adapters/discord/runtime";

export async function handleJoinCommand(
  profile: BotProfile,
  interaction: ChatInputCommandInteraction,
  _traceSource: { userId: string; username: string; channelId: string; messageId: string },
  _startTime: number
): Promise<void> {
  await handleJoinCommandEvent(
    profile,
    createRuntimeCommandEvent(interaction),
    createDiscordCommandTransport(interaction)
  );
}
