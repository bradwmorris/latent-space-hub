import {
  Client,
  Events,
  GatewayIntentBits,
  type Interaction,
  type Message
} from "discord.js";
import {
  ALLOWED_CHANNEL_IDS,
  BOT_INSTANCE_ID,
  PAPER_CLUB_CHANNEL_ID,
  REMINDERS_ENABLED,
  REMINDERS_ONE_HOUR_ENABLED,
  REMINDERS_TIMEZONE,
  clientsByProfile,
  db,
} from "../config";
import { registerSlashCommands } from "../commands/register";
import type { BotProfile } from "../types";
import { setupReminders } from "../reminders";
import { dispatchRuntimeCommandEvent, dispatchRuntimeMessageEvent } from "../core/runtime/dispatch";
import {
  createDiscordChatTransport,
  createDiscordCommandTransport,
  createRuntimeCommandEvent,
  createRuntimeMessageEvent,
  createRuntimeReplyPort,
} from "../adapters/discord/runtime";

const processedMessageIds = new Set<string>();

export async function handleMessage(client: Client, profile: BotProfile, message: Message): Promise<void> {
  const dedupeKey = `${profile.name}:${message.id}`;
  if (processedMessageIds.has(dedupeKey)) return;
  const botUserId = client.user?.id;
  if (!botUserId) return;
  processedMessageIds.add(dedupeKey);
  const allowed = !ALLOWED_CHANNEL_IDS.size || ALLOWED_CHANNEL_IDS.has(message.channelId);
  await dispatchRuntimeMessageEvent(
    profile,
    createRuntimeMessageEvent(message, botUserId, allowed),
    createDiscordChatTransport(message),
    createRuntimeReplyPort(message)
  );
}

export async function handleInteraction(client: Client, profile: BotProfile, interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) return;
  if (interaction.user.bot) return;
  if (ALLOWED_CHANNEL_IDS.size && !ALLOWED_CHANNEL_IDS.has(interaction.channelId || "")) {
    return;
  }

  await interaction.deferReply();
  await dispatchRuntimeCommandEvent(
    profile,
    createRuntimeCommandEvent(interaction),
    createDiscordCommandTransport(interaction)
  );
}

export async function startBot(profile: BotProfile): Promise<void> {
  if (!profile.token.trim()) {
    throw new Error(`${profile.name} cannot start without BOT_TOKEN_SLOP.`);
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
  });
  clientsByProfile.set(profile.name, client);

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`${profile.name} ready as ${readyClient.user.tag}`);
    if (profile.name === "Slop") {
      setupReminders(client, db, {
        enabled: REMINDERS_ENABLED,
        oneHourEnabled: REMINDERS_ONE_HOUR_ENABLED,
        paperClubChannelId: PAPER_CLUB_CHANNEL_ID,
        instanceId: BOT_INSTANCE_ID,
        timezone: REMINDERS_TIMEZONE,
      });
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await handleInteraction(client, profile, interaction);
  });

  client.on(Events.MessageCreate, async (message) => {
    await handleMessage(client, profile, message);
  });

  await registerSlashCommands(profile);
  await client.login(profile.token);
}
