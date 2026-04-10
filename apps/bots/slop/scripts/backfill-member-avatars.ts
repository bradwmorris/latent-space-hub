import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { McpGraphClient } from "../src/mcpGraphClient";

type MemberRow = {
  id: number;
  metadata: Record<string, unknown>;
};

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

async function main(): Promise<void> {
  const token = process.env.BOT_TOKEN_SLOP;
  if (!token) throw new Error("Missing BOT_TOKEN_SLOP");

  const mcp = new McpGraphClient();
  await mcp.connect();

  const response = await mcp.callTool("ls_sqlite_query", {
    sql: "SELECT id, metadata FROM nodes WHERE node_type = 'member' ORDER BY id ASC"
  });
  const rows = ((response.structuredContent as { rows?: unknown[] } | undefined)?.rows || []) as Array<
    Record<string, unknown>
  >;
  const members: MemberRow[] = rows.map((row) => ({
    id: Number(row.id),
    metadata: parseMetadata(row.metadata)
  }));

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

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
      await mcp.callTool("ls_update_node", {
        id: member.id,
        updates: { metadata: nextMetadata }
      });
      updated += 1;
      console.log(`updated member ${member.id} (${discordId})`);
    } catch (error) {
      failed += 1;
      console.warn(`failed member ${member.id} (${discordId}):`, error);
    }
  }

  await client.destroy();
  console.log(`done: updated=${updated} skipped=${skipped} failed=${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
