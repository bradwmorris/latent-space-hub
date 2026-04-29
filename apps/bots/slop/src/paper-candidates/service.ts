import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ThreadAutoArchiveDuration,
  type Message,
  type PublicThreadChannel,
} from "discord.js";
import { PAPER_CANDIDATE_CHANNEL_IDS, db } from "../config";
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

function formatCandidateMessage(params: {
  title: string;
  paperUrl: string;
  tldr: string[];
  sources: string[];
}): string {
  const tldr = params.tldr.slice(0, 3).map((line) => `- ${line}`).join("\n");
  const sources = [...new Set(params.sources)].slice(0, 3).join("\n");
  return [
    `**Paper Club candidate:** ${params.title}`,
    "",
    params.paperUrl,
    "",
    "**TLDR**",
    tldr,
    "",
    "**Sources**",
    sources,
    "",
    "Want to present this at Paper Club?",
  ].join("\n");
}

function candidateButton(candidateNodeId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PAPER_CANDIDATE_PRESENT_PREFIX}${candidateNodeId}`)
      .setLabel("Present this at Paper Club")
      .setStyle(ButtonStyle.Primary)
  );
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
  const existing = await dbOps.getPaperCandidateByDiscordMessageId(db, message.id);
  if (existing?.metadata?.slop_message_id) return true;

  const summary = await summarizePaperCandidate(detection);
  const thread = await getOrCreatePaperThread(message, summary.title);
  if (!thread) return false;

  const created = existing
    ? { id: existing.id, alreadyExists: true }
    : await dbOps.createPaperCandidateNode(db, {
        title: summary.title,
        paperUrl: detection.paperUrl,
        sourceUrl: detection.sourceUrl,
        description: summary.description,
        tldr: summary.tldr,
        tldrSources: summary.sources,
        discordChannelId: message.channelId,
        discordMessageId: message.id,
        discordThreadId: thread.id,
      });

  if (created.alreadyExists && existing?.metadata?.slop_message_id) return true;

  const sent = await thread.send({
    content: formatCandidateMessage({
      title: summary.title,
      paperUrl: detection.paperUrl,
      tldr: summary.tldr,
      sources: summary.sources,
    }),
    components: [candidateButton(created.id)],
  });
  await dbOps.updatePaperCandidateSlopMessage(db, created.id, sent.id);
  return true;
}
