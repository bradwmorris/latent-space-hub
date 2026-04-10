import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { db } from "../src/config";
import { updateMemberNode } from "../src/db";
import { parseMetadata } from "../src/members";
import type { MemberMetadata } from "../src/types";

type MemberRow = {
  id: number;
  metadata: MemberMetadata;
};

async function main(): Promise<void> {
  const token = process.env.BOT_TOKEN_SLOP;
  if (!token) throw new Error("Missing BOT_TOKEN_SLOP");

  const response = await db.execute({
    sql: "SELECT id, metadata FROM nodes WHERE node_type = 'member' ORDER BY id ASC",
    args: [],
  });
  const members: MemberRow[] = response.rows.map((row) => ({
    id: Number(row.id),
    metadata: parseMetadata(row.metadata),
  }));

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    await client.login(token);

    for (const member of members) {
      const discordId = String(member.metadata.discord_id || "");
      if (!discordId) {
        skipped += 1;
        continue;
      }

      try {
        const user = await client.users.fetch(discordId);
        const avatarUrl = user.displayAvatarURL({ size: 256, extension: "png" });
        const nextMetadata = { ...member.metadata, avatar_url: avatarUrl };
        await updateMemberNode(db, member.id, { metadata: nextMetadata });
        updated += 1;
        console.log(`updated member ${member.id} (${discordId})`);
      } catch (error) {
        failed += 1;
        console.warn(`failed member ${member.id} (${discordId}):`, error);
      }
    }
  } finally {
    await client.destroy();
  }

  console.log(`done: updated=${updated} skipped=${skipped} failed=${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
