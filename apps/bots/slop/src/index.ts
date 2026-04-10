import "dotenv/config";
import { ALLOWED_CHANNEL_IDS, db, profiles } from "./config";
import { ensureScheduledEventSlotIndex } from "./db";
import { startBot } from "./discord/bot";
import { startKickoffServer } from "./kickoff/server";
import { ensureMemberDiscordIndex } from "./members";
import { loadSkillsContextFromLocalStrict } from "./skills";
import { TOOL_DEFINITIONS } from "./tools";

async function main(): Promise<void> {
  console.log("Starting Latent Space bots...");

  const activeProfiles = profiles.filter((profile) => profile.token.trim());

  if (!activeProfiles.length) {
    console.error("No bot profiles configured (all tokens missing). Exiting.");
    process.exit(1);
  }

  console.log(`Active bots: ${activeProfiles.map((p) => p.name).join(", ")}`);

  if (ALLOWED_CHANNEL_IDS.size) {
    console.log(`Allowed channels: ${[...ALLOWED_CHANNEL_IDS].join(", ")}`);
  } else {
    console.warn("ALLOWED_CHANNEL_IDS not set. Bots will respond in any channel they can read.");
  }

  await ensureMemberDiscordIndex();
  await ensureScheduledEventSlotIndex(db);
  console.log("Scheduled-event slot uniqueness index ready.");
  console.log(`Local tools loaded: ${TOOL_DEFINITIONS.length} read-only tools available for LLM`);

  const skillsCtx = loadSkillsContextFromLocalStrict();
  console.log(`Skills loaded: ${skillsCtx.length} chars`);

  await Promise.all(activeProfiles.map((profile) => startBot(profile)));
  startKickoffServer();
}

main().catch((error) => {
  console.error("Fatal bot startup error:", error);
  process.exit(1);
});
