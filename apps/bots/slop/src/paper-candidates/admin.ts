import type { Message, User } from "discord.js";
import { PAPER_SCHEDULER_ADMIN_DISCORD_IDS, db } from "../config";
import * as dbOps from "../db";
import { createMemberNodeFromUser } from "../members";
import { validateEventDate } from "../commands/validation";

const ADMIN_ACTION_RE = /\b(confirm|schedule|add|change|update)\b/i;

function firstSpeakerMention(message: Message): User | null {
  const botId = message.client.user?.id;
  return message.mentions.users.find((user) => !user.bot && user.id !== botId) || null;
}

function parseDate(text: string): string | null {
  const match = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match ? match[1] : null;
}

function isChangeOnly(text: string): boolean {
  return /\b(change|update)\b/i.test(text) && !/\b(confirm|schedule|add)\b/i.test(text);
}

export async function handlePaperMentionAdminMessage(message: Message): Promise<boolean> {
  if (!message.mentions.users.has(message.client.user?.id || "")) return false;
  if (!ADMIN_ACTION_RE.test(message.content)) return false;

  await dbOps.ensurePaperMentionsTable(db);
  const mention = await dbOps.getPaperMentionByDiscordThreadId(db, message.channelId);
  if (!mention) return false;

  if (!PAPER_SCHEDULER_ADMIN_DISCORD_IDS.has(message.author.id)) {
    await message.reply("Only Vibhu can confirm Paper Club speakers from paper mention threads.");
    return true;
  }

  const speaker = firstSpeakerMention(message);
  if (!speaker) {
    await message.reply("Tag the speaker to confirm or change, e.g. `@Slop confirm @speaker 2026-07-01`.");
    return true;
  }

  const member = await createMemberNodeFromUser(speaker);
  const presenterName = speaker.globalName || speaker.username;

  if (isChangeOnly(message.content)) {
    if (!mention.scheduled_event_node_id) {
      await message.reply("This paper has not been scheduled yet. Use `@Slop confirm @speaker YYYY-MM-DD` first.");
      return true;
    }
    const event = await dbOps.getNodeById(db, mention.scheduled_event_node_id);
    const metadata = (event?.metadata && typeof event.metadata === "object" ? event.metadata : {}) as Record<string, unknown>;
    await db.execute({
      sql: `UPDATE nodes SET metadata = ?, updated_at = ? WHERE id = ? AND node_type = 'event'`,
      args: [
        JSON.stringify({
          ...metadata,
          presenter_name: presenterName,
          presenter_discord_id: speaker.id,
          presenter_node_id: member.id,
        }),
        new Date().toISOString(),
        mention.scheduled_event_node_id,
      ],
    });
    await message.reply(`Speaker updated to <@${speaker.id}> for **${mention.title}**.`);
    return true;
  }

  const date = parseDate(message.content);
  if (!date) {
    await message.reply("Add the Paper Club date as `YYYY-MM-DD`, e.g. `@Slop confirm @speaker 2026-07-01`.");
    return true;
  }

  const dateValidation = validateEventDate(date, "paper-club");
  if (!dateValidation.valid) {
    await message.reply(dateValidation.error || "That Paper Club date is invalid.");
    return true;
  }

  const created = await dbOps.createEventNodeAtomic(db, {
    title: `Paper Club: ${mention.title}`,
    description: `Hosted by ${presenterName}. ${mention.summary}`,
    event_date: date,
    event_type: "paper-club",
    presenter_name: presenterName,
    presenter_discord_id: speaker.id,
    presenter_node_id: member.id,
    paper_title: mention.title,
    paper_url: mention.paper_url,
    source_discord_thread_id: mention.discord_thread_id || undefined,
    source_discord_message_id: mention.discord_message_id || undefined,
  });
  if (created.alreadyBooked) {
    await message.reply("That Paper Club slot is already booked. Pick another Wednesday.");
    return true;
  }

  await dbOps.createEdge(db, member.id, created.nodeId, "hosting Paper Club session");
  await dbOps.markPaperMentionScheduled(db, {
    paperMentionId: mention.id,
    scheduledEventNodeId: created.nodeId,
    confirmedByDiscordId: message.author.id,
  });

  await message.reply(`Confirmed <@${speaker.id}> for **${mention.title}** on ${date}.`);
  return true;
}
