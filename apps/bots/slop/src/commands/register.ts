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
    new SlashCommandBuilder()
      .setName("backlog-create")
      .setDescription("Create a backlog item + PRD + GitHub issue in Latent Space Hub")
      .addStringOption((option) =>
        option
          .setName("title")
          .setDescription("Backlog title")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("notes")
          .setDescription("Context or problem statement")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("Project type")
          .setRequired(false)
          .addChoices(
            { name: "feature", value: "feature" },
            { name: "fix", value: "fix" },
            { name: "refactor", value: "refactor" },
            { name: "ops", value: "ops" },
            { name: "docs", value: "docs" },
            { name: "security", value: "security" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("priority")
          .setDescription("Priority")
          .setRequired(false)
          .addChoices(
            { name: "high", value: "high" },
            { name: "medium", value: "medium" },
            { name: "low", value: "low" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("due_date")
          .setDescription("Optional due date in YYYY-MM-DD")
          .setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName("confirm")
          .setDescription("Actually create the backlog item (default: preview only)")
          .setRequired(false)
      ),
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
