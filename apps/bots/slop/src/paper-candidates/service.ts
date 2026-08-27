import {
  ChannelType,
  ThreadAutoArchiveDuration,
  type Message,
  type PublicThreadChannel,
} from "discord.js";
import { HUB_BASE_URL, PAPER_CANDIDATE_CHANNEL_IDS, db } from "../config";
import * as dbOps from "../db";
import { detectPaperCandidate } from "./detect";
import { summarizePaperCandidate } from "./source";

export const PAPER_CANDIDATE_PRESENT_PREFIX = "paper_candidate_present:";

let indexReady: Promise<void> | null = null;

function ensureIndexes(): Promise<void> {
  if (!indexReady) {
    indexReady = dbOps.ensurePaperCandidateIndex(db).catch((error) => {
      indexReady = null;
      throw error;
    });
  }
  return indexReady;
}

function cleanThreadName(title: string): string {
  const clean = title.replace(/\s+/g, " ").replace(/[^\w\s:()#./-]/g, "").trim();
  return `paper: ${(clean || "candidate").slice(0, 82)}`;
}

async function getOrCreatePaperThread(
  message: Message,
  title: string
): Promise<PublicThreadChannel | null> {
  if (message.hasThread) {
    const channel = message.channel as any;
    const existing =
      message.thread ||
      (await channel.threads?.fetch?.(message.id).catch(() => null));
    if (existing && existing.type === ChannelType.PublicThread) return existing;
  }

  try {
    return await message.startThread({
      name: cleanThreadName(title),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: "Paper Club candidate thread",
    });
  } catch (error) {
    console.warn("Paper candidate thread creation failed:", error);
    return null;
  }
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

function safeSummary(text: string | undefined): string {
  const fallback = "Slop could not verify enough detail to summarize this paper safely yet.";
  if (!text?.trim()) return fallback;
  const clean = text.trim();
  if (!clean.startsWith("{")) return truncate(clean, 420);
  try {
    const parsed = JSON.parse(clean) as { summary?: unknown };
    return typeof parsed.summary === "string" && parsed.summary.trim()
      ? truncate(parsed.summary, 420)
      : fallback;
  } catch {
    return fallback;
  }
}

export function formatCandidateMessage(params: {
  title: string;
  paperUrl: string;
  summary?: string;
  takeaways: string[];
  sources: string[];
  suggestedBy: string;
}): string {
  const summary = safeSummary(params.summary);
  const takeaways = params.takeaways
    .filter((line) => !line.trim().startsWith("{"))
    .slice(0, 5)
    .map((line) => `- ${truncate(line, 170)}`)
    .join("\n");
  const sources = [...new Set(params.sources)].slice(0, 3).join("\n");
  return [
    `**Paper mentioned:** ${params.title}`,
    "",
    params.paperUrl,
    "",
    "**Summary**",
    summary,
    "",
    "**Main takeaways**",
    takeaways,
    "",
    "**Sources**",
    sources,
    "",
    `Suggested by ${params.suggestedBy}`,
    "",
    `Added to the [Papers backlog](${HUB_BASE_URL}/?type=paper-mentions).`,
  ].join("\n");
}

export async function handlePaperCandidateMessage(message: Message): Promise<boolean> {
  if (!PAPER_CANDIDATE_CHANNEL_IDS.size) return false;
  if (!PAPER_CANDIDATE_CHANNEL_IDS.has(message.channelId)) return false;
  if (message.author.bot && !message.webhookId) return false;

  const detection = detectPaperCandidate({
    content: message.content || "",
    embeds: message.embeds.map((embed) => ({
      title: embed.title,
      description: embed.description,
      url: embed.url,
    })),
  });
  if (!detection) return false;

  await ensureIndexes();
  await dbOps.ensurePaperMentionsTable(db);
  const existing = await dbOps.getPaperMentionByDiscordMessageId(db, message.id);
  if (existing) return true;

  const summary = await summarizePaperCandidate(detection);
  const thread = await getOrCreatePaperThread(message, summary.title);
  if (!thread) return false;

  await dbOps.upsertPaperMention(db, {
    title: summary.title,
    paperUrl: detection.paperUrl,
    sourceUrl: detection.sourceUrl,
    thumbnailUrl: summary.imageUrl,
    summary: summary.description || summary.tldr.join("\n"),
    discordChannelId: message.channelId,
    discordMessageId: message.id,
    discordThreadId: thread.id,
    suggestedByDiscordId: message.author.id,
    suggestedByHandle: message.author.username,
  });

  await thread.send({
    content: formatCandidateMessage({
      title: summary.title,
      paperUrl: detection.paperUrl,
      summary: summary.description,
      takeaways: summary.tldr,
      sources: summary.sources,
      suggestedBy: `<@${message.author.id}>`,
    }),
  });
  return true;
}
