import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { db } from "../src/config";

const TEST_CHANNEL = "1480759312941846588";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  const { rows } = await db.execute({
    sql: `SELECT id, title, event_date, metadata FROM nodes
          WHERE node_type = 'event'
            AND json_extract(metadata, '$.event_type') = 'paper-club'
            AND json_extract(metadata, '$.event_status') = 'scheduled'
          ORDER BY event_date ASC LIMIT 1`,
    args: [],
  });

  if (!rows.length) {
    console.log("No scheduled paper-club events found.");
    process.exit(0);
  }

  const event = rows[0];
  const meta = typeof event.metadata === "string" ? JSON.parse(event.metadata) : event.metadata;
  const presenterId = meta.presenter_discord_id;
  const presenterName = meta.presenter_name || "TBD";
  const mention = presenterId ? `<@${presenterId}>` : presenterName;
  const paperLine = meta.paper_url
    ? `\n\nReview the paper and come prepared with questions:\n${meta.paper_url}`
    : "";

  const channel = await client.channels.fetch(TEST_CHANNEL);
  if (!channel?.isTextBased() || !("send" in channel)) {
    console.error("Channel not found or not sendable.");
    process.exit(1);
  }

  await (channel as any).send({
    content: `📅 **Paper Club tomorrow**\n\n${mention} is presenting: **${event.title}**${paperLine}`,
    allowedMentions: { parse: ["users"] },
  });

  console.log(`Sent reminder for: ${event.title} (${event.event_date})`);
  process.exit(0);
});

client.login(process.env.BOT_TOKEN_SLOP);
