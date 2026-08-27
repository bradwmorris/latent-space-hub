import { ThreadAutoArchiveDuration, type Message, type User } from "discord.js";
import {
  PAPER_SCHEDULER_ADMIN_DISCORD_IDS,
  PAPER_SCHEDULER_ADMIN_USERNAMES,
  REMINDERS_TIMEZONE,
  db,
} from "../config";
import * as dbOps from "../db";
import { createMemberNodeFromUser } from "../members";
import { validateEventDate, validatePaperUrl } from "../commands/validation";

const ADMIN_ACTION_RE = /\b(confirm|schedule|create|add|change|update)\b/i;
const PAPER_CLUB_ASSIGNMENT_RE =
  /\b(?:is|will be|will)\s+(?:doing|presenting|speaking(?:\s+at)?|hosting)\s+(?:the\s+)?paper\s+club\b/i;
const CONFIRM_RE = /^(yes|y|confirm|confirmed|do it|schedule it|create it)[.!]?$/i;
const CANCEL_RE = /^(no|n|cancel|stop|never mind|nevermind)[.!]?$/i;
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

type PendingPaperSchedule = {
  organizerId: string;
  mention: dbOps.PaperMentionRow;
  speaker: User;
  date: string;
  paperUrl: string;
  stage: "paper_link" | "confirm";
  createdAt: number;
};

const pendingSchedules = new Map<string, PendingPaperSchedule>();

export function isPaperAdminAction(text: string): boolean {
  return ADMIN_ACTION_RE.test(text) || PAPER_CLUB_ASSIGNMENT_RE.test(text);
}

export function isPaperSchedulerAdmin(user: Pick<User, "id" | "username">): boolean {
  return (
    PAPER_SCHEDULER_ADMIN_DISCORD_IDS.has(user.id) ||
    PAPER_SCHEDULER_ADMIN_USERNAMES.has(user.username.toLowerCase())
  );
}

function calendarDateInTimeZone(now: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function parsePaperClubDate(
  text: string,
  now = new Date(),
  timeZone = REMINDERS_TIMEZONE || "America/Los_Angeles"
): string | null {
  const exact = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (exact) return exact[1];
  if (!/\bnext\s+week\b/i.test(text)) return null;

  const local = calendarDateInTimeZone(now, timeZone);
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day, 12));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() + (9 - daysSinceMonday));
  return date.toISOString().slice(0, 10);
}

function extractPaperUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>()]+/i);
  if (!match) return null;
  return match[0].replace(/[.,;!?]+$/, "");
}

export function parseProposedPaperTitle(text: string): string | null {
  const quoted = text.match(/\b(?:on|about)\s+["'“‘]([^"'”’]+)["'”’]/i);
  if (quoted?.[1]?.trim()) return quoted[1].replace(/\s+/g, " ").trim();
  const anyQuoted = [...text.matchAll(/["“]([^"”]+)["”]|['‘]([^'’]+)['’]/g)];
  const fallback = anyQuoted.at(-1)?.slice(1).find((value) => value?.trim());
  if (fallback) return fallback.replace(/\s+/g, " ").trim();
  return null;
}

function paperThreadName(title: string): string {
  const clean = title.replace(/\s+/g, " ").replace(/[^\w\s:()#./-]/g, "").trim();
  return `paper-club: ${(clean || "proposed paper").slice(0, 78)}`;
}

function confirmationPrompt(session: PendingPaperSchedule): string {
  return [
    "Please confirm this Paper Club:",
    `**Paper:** ${session.mention.title}`,
    `**Link:** ${session.paperUrl}`,
    `**Speaker:** <@${session.speaker.id}>`,
    `**Date:** ${session.date}`,
    "",
    "Reply **yes** to create it or **no** to cancel.",
  ].join("\n");
}

async function createConfirmedPaperClub(
  message: Message,
  session: PendingPaperSchedule
): Promise<void> {
  const member = await createMemberNodeFromUser(session.speaker);
  const presenterName = session.speaker.globalName || session.speaker.username;
  const created = await dbOps.createEventNodeAtomic(db, {
    title: `Paper Club: ${session.mention.title}`,
    description: `Hosted by ${presenterName}. ${session.mention.summary}`,
    event_date: session.date,
    event_type: "paper-club",
    presenter_name: presenterName,
    presenter_discord_id: session.speaker.id,
    presenter_node_id: member.id,
    paper_title: session.mention.title,
    paper_url: session.paperUrl,
    source_discord_thread_id: session.mention.discord_thread_id || undefined,
    source_discord_message_id: session.mention.discord_message_id || undefined,
  });
  if (created.alreadyBooked) {
    await message.reply("That Paper Club slot is already booked. Pick another Wednesday.");
    return;
  }

  await dbOps.createEdge(db, member.id, created.nodeId, "hosting Paper Club session");
  await dbOps.markPaperMentionScheduled(db, {
    paperMentionId: session.mention.id,
    scheduledEventNodeId: created.nodeId,
    confirmedByDiscordId: message.author.id,
  });
  await message.reply(
    `Confirmed <@${session.speaker.id}> for **${session.mention.title}** on ${session.date}.\n${session.paperUrl}`
  );
}

async function handlePendingSchedule(message: Message): Promise<boolean> {
  const session = pendingSchedules.get(message.channelId);
  if (!session || session.organizerId !== message.author.id) return false;
  if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
    pendingSchedules.delete(message.channelId);
    await message.reply("That Paper Club confirmation expired. Ping Slop again to restart it.");
    return true;
  }

  if (session.stage === "paper_link") {
    const rawUrl = extractPaperUrl(message.content);
    if (!rawUrl) {
      await message.reply("Please send the paper link before I schedule it.");
      return true;
    }
    const validated = validatePaperUrl(rawUrl);
    if (!validated.valid) {
      await message.reply(validated.error || "That paper link is not valid.");
      return true;
    }
    session.paperUrl = validated.url;
    session.stage = "confirm";
    await dbOps.updatePaperMentionPaperUrl(db, session.mention.id, validated.url);
    await message.reply(confirmationPrompt(session));
    return true;
  }

  const answer = message.content.trim();
  if (CANCEL_RE.test(answer)) {
    pendingSchedules.delete(message.channelId);
    await message.reply("Cancelled. Nothing was scheduled.");
    return true;
  }
  if (!CONFIRM_RE.test(answer)) {
    await message.reply("Reply **yes** to create this Paper Club or **no** to cancel.");
    return true;
  }

  pendingSchedules.delete(message.channelId);
  await createConfirmedPaperClub(message, session);
  return true;
}

function firstSpeakerMention(message: Message): User | null {
  const botId = message.client.user?.id;
  return message.mentions.users.find((user) => !user.bot && user.id !== botId) || null;
}

function isChangeOnly(text: string): boolean {
  return /\b(change|update)\b/i.test(text) && !/\b(confirm|schedule|add)\b/i.test(text);
}

export async function handlePaperMentionAdminMessage(message: Message): Promise<boolean> {
  if (await handlePendingSchedule(message)) return true;
  if (!message.mentions.users.has(message.client.user?.id || "")) return false;
  if (!isPaperAdminAction(message.content)) return false;

  if (!isPaperSchedulerAdmin(message.author)) {
    await message.reply("Only configured Paper Club organizers can confirm speakers from paper mention threads.");
    return true;
  }

  const speaker = firstSpeakerMention(message);
  if (!speaker) {
    await message.reply(
      "Tag the speaker, e.g. `@Slop can you add @speaker to speak next week on \"Paper title\"`."
    );
    return true;
  }

  const date = parsePaperClubDate(message.content);
  if (!date && !isChangeOnly(message.content)) {
    await message.reply(
      "Add `next week` or a date as `YYYY-MM-DD`, e.g. `@Slop add @speaker to speak next week on \"Paper title\"`."
    );
    return true;
  }
  if (date) {
    const dateValidation = validateEventDate(date, "paper-club");
    if (!dateValidation.valid) {
      await message.reply(dateValidation.error || "That Paper Club date is invalid.");
      return true;
    }
  }

  await dbOps.ensurePaperMentionsTable(db);
  let mention = await dbOps.getPaperMentionByDiscordThreadId(db, message.channelId);

  if (!mention) {
    const title = parseProposedPaperTitle(message.content);
    if (!title) {
      await message.reply(
        "Put the paper title after `on`, e.g. `@Slop add @speaker to speak next week on \"Paper title\"`."
      );
      return true;
    }
    if (!date) return true;

    let thread;
    try {
      thread = await message.startThread({
        name: paperThreadName(title),
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: "Paper Club organizer confirmation",
      });
    } catch (error) {
      console.warn("Paper Club organizer thread creation failed:", error);
      await message.reply("I couldn't create the confirmation thread. Please try again.");
      return true;
    }

    const rawUrl = extractPaperUrl(message.content);
    const validatedUrl = rawUrl ? validatePaperUrl(rawUrl) : null;
    const paperUrl = validatedUrl?.valid ? validatedUrl.url : "";
    const created = await dbOps.upsertPaperMention(db, {
      title,
      paperUrl,
      summary: `Proposed by ${message.author.globalName || message.author.username} for Paper Club.`,
      sourceUrl: rawUrl || undefined,
      discordChannelId: message.channelId,
      discordMessageId: message.id,
      discordThreadId: thread.id,
      suggestedByDiscordId: speaker.id,
      suggestedByHandle: speaker.username,
    });
    mention = {
      id: created.id,
      title,
      paper_url: paperUrl,
      summary: `Proposed by ${message.author.globalName || message.author.username} for Paper Club.`,
      thumbnail_url: null,
      source_url: rawUrl,
      discord_channel_id: message.channelId,
      discord_message_id: message.id,
      discord_thread_id: thread.id,
      suggested_by_discord_id: speaker.id,
      suggested_by_handle: speaker.username,
      status: "mentioned",
      scheduled_event_node_id: null,
      confirmed_by_discord_id: null,
      confirmed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const session: PendingPaperSchedule = {
      organizerId: message.author.id,
      mention,
      speaker,
      date,
      paperUrl,
      stage: paperUrl ? "confirm" : "paper_link",
      createdAt: Date.now(),
    };
    pendingSchedules.set(thread.id, session);
    await thread.send(
      session.stage === "paper_link"
        ? "Before I schedule this, please send the paper link."
        : confirmationPrompt(session)
    );
    return true;
  }

  if (isChangeOnly(message.content)) {
    if (!mention.scheduled_event_node_id) {
      await message.reply("This paper has not been scheduled yet. Use `@Slop confirm @speaker YYYY-MM-DD` first.");
      return true;
    }
    const member = await createMemberNodeFromUser(speaker);
    const presenterName = speaker.globalName || speaker.username;
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

  if (!date) return true;

  const rawUrl = extractPaperUrl(message.content) || mention.paper_url;
  const validatedUrl = rawUrl ? validatePaperUrl(rawUrl) : null;
  const session: PendingPaperSchedule = {
    organizerId: message.author.id,
    mention,
    speaker,
    date,
    paperUrl: validatedUrl?.valid ? validatedUrl.url : "",
    stage: validatedUrl?.valid ? "confirm" : "paper_link",
    createdAt: Date.now(),
  };
  pendingSchedules.set(message.channelId, session);

  if (session.stage === "paper_link") {
    await message.reply("Before I schedule this, please send the paper link.");
    return true;
  }
  if (session.paperUrl !== mention.paper_url) {
    await dbOps.updatePaperMentionPaperUrl(db, mention.id, session.paperUrl);
  }
  await message.reply(confirmationPrompt(session));
  return true;
}
