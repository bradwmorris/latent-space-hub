import type { User } from "discord.js";
import * as dbOps from "../db";
import { db } from "../config";
import type { MemberMetadata, MemberNode } from "../types";
import { summarizeUserMessage } from "../llm/tracing";

export function parseMetadata(raw: unknown): MemberMetadata {
  if (!raw || typeof raw !== "object") {
    return {
      discord_id: "",
      discord_handle: "",
      joined_at: new Date().toISOString(),
      interests: [],
      interaction_count: 0
    };
  }

  const data = raw as Record<string, unknown>;
  return {
    discord_id: String(data.discord_id || ""),
    discord_handle: String(data.discord_handle || ""),
    avatar_url: data.avatar_url ? String(data.avatar_url) : undefined,
    joined_at: String(data.joined_at || new Date().toISOString()),
    last_active: data.last_active ? String(data.last_active) : undefined,
    interaction_count: Number(data.interaction_count || 0),
    interests: Array.isArray(data.interests) ? data.interests.map((x) => String(x)) : [],
    role: data.role ? String(data.role) : undefined,
    company: data.company ? String(data.company) : undefined,
    location: data.location ? String(data.location) : undefined,
    interaction_preference: data.interaction_preference ? String(data.interaction_preference) : undefined
  };
}

export async function lookupMember(discordId: string): Promise<MemberNode | null> {
  const row = await dbOps.lookupMemberByDiscordId(db, discordId);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    notes: row.notes || "",
    metadata: parseMetadata(row.metadata)
  };
}

export async function createMemberNodeFromUser(
  user: Pick<User, "id" | "username" | "globalName" | "displayAvatarURL">
): Promise<{ id: number }> {
  return createMemberNodeFromActor({
    id: user.id,
    username: user.username,
    globalName: user.globalName || undefined,
    avatarUrl: user.displayAvatarURL({ size: 256, extension: "png" }),
  });
}

export async function createMemberNodeFromActor(user: {
  id: string;
  username: string;
  globalName?: string;
  avatarUrl?: string;
}): Promise<{ id: number }> {
  const now = new Date().toISOString();
  const title = (user.globalName || user.username || "Discord Member").trim();
  return dbOps.createMemberNode(db, {
    title,
    description: `${title} — community member profile in Latent Space Discord.`,
    metadata: {
      discord_id: user.id,
      discord_handle: user.username,
      avatar_url: user.avatarUrl,
      joined_at: now,
      last_active: now,
      interaction_count: 0,
      interests: []
    }
  });
}

export function isUniqueConstraintError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /unique|constraint|already exists/i.test(msg);
}

export async function ensureMemberDiscordIndex(): Promise<void> {
  try {
    await db.execute({
      sql:
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_member_discord_id_unique " +
        "ON nodes(json_extract(metadata, '$.discord_id')) " +
        "WHERE node_type = 'member' " +
        "AND json_extract(metadata, '$.discord_id') IS NOT NULL " +
        "AND json_extract(metadata, '$.discord_id') != ''",
      args: []
    });
    console.log("Member uniqueness index ready: idx_nodes_member_discord_id_unique");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`Could not create member uniqueness index (continuing): ${msg}`);
  }
}

export function formatMemberContext(member: MemberNode): string {
  const interests = (member.metadata.interests || []).slice(0, 12).join(", ") || "none yet";
  const lastActive = member.metadata.last_active || member.metadata.joined_at || "unknown";
  const recentNotes = member.notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(" | ");
  const profileLines: string[] = [];
  profileLines.push(`Name: ${member.title}`);
  if (member.metadata.role) profileLines.push(`Role: ${member.metadata.role}`);
  if (member.metadata.company) profileLines.push(`Company: ${member.metadata.company}`);
  if (member.metadata.location) profileLines.push(`Location: ${member.metadata.location}`);
  profileLines.push(`Interests: ${interests}`);
  if (member.metadata.interaction_preference) {
    profileLines.push(`Interaction preference: ${member.metadata.interaction_preference}`);
  }
  profileLines.push(`Last active: ${lastActive}`);
  profileLines.push(`Recent interactions: ${recentNotes || "none"}`);
  return (
    `[MEMBER CONTEXT]\n` +
    profileLines.join("\n") + "\n" +
    `Use this to personalize your response. Update interaction_preference in <profile> when you learn how they like to interact.`
  );
}

export async function updateMemberAfterInteraction(
  member: MemberNode,
  userMessage: string,
  retrievalNodeIds: number[],
  profileUpdate?: { role?: string; company?: string; location?: string; interests?: string[]; interaction_preference?: string } | null,
  avatarUrl?: string
): Promise<void> {
  const nowIso = new Date().toISOString();

  const metadata: MemberMetadata = {
    ...member.metadata,
    avatar_url: avatarUrl || member.metadata.avatar_url,
    last_active: nowIso,
    interaction_count: (member.metadata.interaction_count || 0) + 1
  };

  if (profileUpdate) {
    if (profileUpdate.role) metadata.role = profileUpdate.role;
    if (profileUpdate.company) metadata.company = profileUpdate.company;
    if (profileUpdate.location) metadata.location = profileUpdate.location;
    if (profileUpdate.interests?.length) {
      metadata.interests = Array.from(
        new Set([...(member.metadata.interests || []), ...profileUpdate.interests])
      ).slice(0, 25);
    }
    if (profileUpdate.interaction_preference) {
      metadata.interaction_preference = profileUpdate.interaction_preference;
    }
  }

  const line = `[${nowIso.slice(0, 10)}] ${summarizeUserMessage(userMessage)}`;
  await dbOps.updateMemberNode(db, member.id, {
    content: line,
    metadata: metadata as Record<string, unknown>
  });

  const uniqueTargets = Array.from(new Set(retrievalNodeIds.filter((id) => Number.isFinite(id) && id > 0 && id !== member.id))).slice(0, 8);
  await Promise.all(
    uniqueTargets.map(async (targetId) => {
      try {
        await dbOps.createEdge(db,
          member.id,
          targetId,
          "showed interest in this content during a Discord conversation"
        );
      } catch (error) {
        console.warn(`Member edge create failed (${member.id} -> ${targetId}):`, error);
      }
    })
  );
}
