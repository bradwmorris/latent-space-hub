import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { DISCORD_TEST_GUILD_ID } from "../config";
import type { BotProfile } from "../types";

export async function registerSlashCommands(profile: BotProfile): Promise<void> {
  if (!profile.appId) {
    console.log(`${profile.name}: BOT_APP_ID not provided; skipping slash command registration.`);
    return;
  }

  const commands = [
    new SlashCommandBuilder()
      .setName("join")
      .setDescription("Add yourself to the Latent Space knowledge graph"),
    new SlashCommandBuilder()
      .setName("paper-club")
      .setDescription("Schedule a Paper Club session — pick a date and paper"),
    new SlashCommandBuilder()
      .setName("builders-club")
      .setDescription("Schedule a Builders Club session — pick a date and topic"),
    new SlashCommandBuilder()
      .setName("edit-event")
      .setDescription("Edit or cancel one of your scheduled events"),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(profile.token);
  if (DISCORD_TEST_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(profile.appId, DISCORD_TEST_GUILD_ID), { body: commands });
    console.log(`${profile.name}: guild slash commands registered.`);
  } else {
    await rest.put(Routes.applicationCommands(profile.appId), { body: commands });
    console.log(`${profile.name}: global slash commands registered.`);
  }
}
