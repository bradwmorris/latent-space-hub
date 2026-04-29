import { fetchTranscript } from "youtube-transcript-plus";
import { db } from "../../config";
import * as dbOps from "../../db";
import type { BotProfile } from "../../types";
import type {
  RuntimeChatTransport,
  RuntimeConversation,
  RuntimeMessageEvent,
  RuntimeReplyPort,
} from "../runtime/types";
import { recordingIntakeSessionStore } from "../sessions/recording-intake-store";

type YouTubeMetadata = {
  title: string;
  authorName?: string;
  authorUrl?: string;
  thumbnailUrl?: string;
};

type TranscriptData = {
  text: string;
  metadata: Record<string, unknown>;
};

type ScoredTarget = {
  event: dbOps.RecordingTargetEventRow;
  score: number;
};

export type RecordingIntakeSession = {
  memberDiscordId: string;
  url: string;
  videoId: string;
  metadata: YouTubeMetadata;
  transcript?: TranscriptData | null;
  existingRecordingNodeId?: number;
  targets: ScoredTarget[];
};

const STOPWORDS = new Set([
  "add",
  "added",
  "adding",
  "attach",
  "graph",
  "recording",
  "session",
  "talk",
  "this",
  "that",
  "the",
  "for",
  "and",
  "with",
  "youtube",
  "video",
  "paper",
  "club",
]);

export function extractYouTubeUrl(text: string): string | null {
  const match = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^ \n<>()]+|youtu\.be\/[^ \n<>()]+)/i);
  if (!match) return null;
  return match[0].replace(/[),.;!?]+$/g, "");
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (/(^|\.)youtu\.be$/i.test(parsed.hostname)) {
      return parsed.pathname.split("/").filter(Boolean)[0] || null;
    }
    if (/(^|\.)youtube\.com$/i.test(parsed.hostname)) {
      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

export function shouldHandleRecordingIntake(text: string): boolean {
  const normalized = text.toLowerCase();
  const hasWriteIntent = /\b(add|attach|link|save|ingest|pull)\b/.test(normalized);
  const hasRecordingIntent = /\b(recording|video|youtube|graph|talk|session)\b/.test(normalized);
  return hasWriteIntent && hasRecordingIntent;
}

function inferEventTypeHint(text: string): "paper-club" | "builders-club" | undefined {
  const normalized = text.toLowerCase();
  if (/\bpaper\s*club\b/.test(normalized)) return "paper-club";
  if (/\bbuilders?\s*club\b/.test(normalized)) return "builders-club";
  return undefined;
}

function canonicalYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

function scoreTargets(
  prompt: string,
  metadata: YouTubeMetadata,
  targets: dbOps.RecordingTargetEventRow[]
): ScoredTarget[] {
  const sourceTokens = tokenize(`${prompt} ${metadata.title}`);
  return targets
    .map((event) => {
      const eventTokens = tokenize(
        [
          event.title,
          event.paper_title || "",
          event.topic || "",
          event.presenter_name || "",
        ].join(" ")
      );
      let score = 0;
      for (const token of sourceTokens) {
        if (eventTokens.has(token)) score += 1;
      }
      return { event, score };
    })
    .filter((target) => target.score > 0)
    .sort((a, b) => b.score - a.score || b.event.event_date.localeCompare(a.event.event_date));
}

function confidentTarget(targets: ScoredTarget[]): ScoredTarget | null {
  const [first, second] = targets;
  if (!first || first.score < 2) return null;
  if (second && second.score >= first.score) return null;
  return first;
}

async function fetchYouTubeMetadata(url: string): Promise<YouTubeMetadata> {
  const response = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  );
  if (!response.ok) {
    throw new Error(`YouTube metadata lookup failed (${response.status})`);
  }
  const data = (await response.json()) as {
    title?: string;
    author_name?: string;
    author_url?: string;
    thumbnail_url?: string;
  };
  return {
    title: data.title || "YouTube recording",
    authorName: data.author_name,
    authorUrl: data.author_url,
    thumbnailUrl: data.thumbnail_url,
  };
}

function formatTimestamp(seconds: number): string {
  return `${Math.max(0, Math.round(seconds * 10) / 10)}s`;
}

async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptData | null> {
  try {
    const segments = await fetchTranscript(videoId, { lang: "en" });
    const cleaned = segments
      .map((segment) => ({
        text: String(segment.text || "").trim(),
        offset: Number(segment.offset || 0),
        duration: Number(segment.duration || 0),
        lang: segment.lang || "unknown",
      }))
      .filter((segment) => segment.text.length > 0);
    if (!cleaned.length) return null;
    const text = cleaned
      .map((segment) => `[${formatTimestamp(segment.offset)}] ${segment.text}`)
      .join("\n");
    return {
      text,
      metadata: {
        transcript_length: text.length,
        total_segments: cleaned.length,
        language: cleaned[0]?.lang || "unknown",
        content_format: "timestamped_transcript",
        extraction_method: "youtube-transcript-plus",
      },
    };
  } catch (error) {
    console.warn(
      "YouTube transcript extraction failed:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

function formatTarget(target: ScoredTarget, index: number): string {
  const event = target.event;
  const type = event.event_type === "paper-club" ? "Paper Club" : "Builders Club";
  const presenter = event.presenter_name ? ` — ${event.presenter_name}` : "";
  return `**${index + 1}.** ${type} — ${event.event_date} — ${event.title}${presenter}`;
}

async function attachOrCreateRecording(params: {
  session: RecordingIntakeSession;
  target: dbOps.RecordingTargetEventRow;
  actor: RuntimeMessageEvent["actor"];
  conversation: RuntimeConversation;
  messageId: string;
}): Promise<{ recordingNodeId: number; created: boolean }> {
  let recordingNodeId = params.session.existingRecordingNodeId || 0;
  let created = false;

  if (!recordingNodeId) {
    const inserted = await dbOps.createRecordingNodeForEvent(db, {
      targetEvent: params.target,
      title: params.session.metadata.title,
      canonicalUrl: params.session.url,
      videoId: params.session.videoId,
      channelName: params.session.metadata.authorName,
      channelUrl: params.session.metadata.authorUrl,
      thumbnailUrl: params.session.metadata.thumbnailUrl,
      transcript: params.session.transcript?.text,
      transcriptMetadata: params.session.transcript?.metadata,
      addedByDiscordId: params.actor.id,
      addedByUsername: params.actor.username,
      discordChannelId: params.conversation.id,
      discordMessageId: params.messageId,
    });
    recordingNodeId = inserted.id;
    created = true;
  }

  await dbOps.attachRecordingToEvent(db, {
    recordingNodeId,
    targetEvent: params.target,
    recordingUrl: params.session.url,
    addedByDiscordId: params.actor.id,
    addedByUsername: params.actor.username,
  });

  return { recordingNodeId, created };
}

export async function handleRecordingIntakeReplyEvent(
  event: RuntimeMessageEvent,
  replyPort: RuntimeReplyPort,
  session: RecordingIntakeSession
): Promise<void> {
  const text = event.cleanContent.trim().toLowerCase();
  if (text === "cancel") {
    recordingIntakeSessionStore.clear(replyPort.conversation.id);
    await replyPort.reply("Recording intake cancelled.");
    return;
  }

  const choice = Number.parseInt(text, 10);
  if (!Number.isFinite(choice) || choice < 1 || choice > session.targets.length) {
    await replyPort.reply(`Reply with a number between 1 and ${session.targets.length}, or \`cancel\`.`);
    return;
  }

  const target = session.targets[choice - 1].event;
  const result = await attachOrCreateRecording({
    session,
    target,
    actor: event.actor,
    conversation: event.conversation,
    messageId: event.id,
  });
  recordingIntakeSessionStore.clear(replyPort.conversation.id);
  const verb = result.created ? "Added" : "Linked existing";
  await replyPort.reply(
    `${verb} recording node #${result.recordingNodeId} and linked it to event #${target.id}: ${target.title}`
  );
}

export async function handleRecordingIntakeMessage(
  _profile: BotProfile,
  event: RuntimeMessageEvent,
  transport: RuntimeChatTransport,
  destination: RuntimeConversation,
  prompt: string
): Promise<boolean> {
  if (!shouldHandleRecordingIntake(prompt)) return false;

  const rawUrl = extractYouTubeUrl(prompt);
  if (!rawUrl) {
    await transport.sendText(destination, "Send the YouTube recording URL and I can attach it to the matching Paper Club or Builders Club event.");
    return true;
  }

  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) {
    await transport.sendText(destination, "I only know how to add YouTube recordings right now. Send a normal YouTube watch or youtu.be URL.");
    return true;
  }

  const canonicalUrl = canonicalYouTubeUrl(videoId);
  await transport.sendTyping(destination);
  const metadata = await fetchYouTubeMetadata(canonicalUrl);
  const transcript = await fetchYouTubeTranscript(videoId);
  const existing = await dbOps.findRecordingNodeByYouTubeVideoId(db, {
    videoId,
    canonicalUrl,
  });
  const eventType = inferEventTypeHint(prompt);
  const candidateEvents = await dbOps.getRecentRecordingTargetEvents(db, {
    eventType,
    limit: 50,
  });
  const scored = scoreTargets(prompt, metadata, candidateEvents);
  const target = confidentTarget(scored);

  const session: RecordingIntakeSession = {
    memberDiscordId: event.actor.id,
    url: canonicalUrl,
    videoId,
    metadata,
    transcript,
    existingRecordingNodeId: existing?.id,
    targets: scored.slice(0, 5),
  };

  if (target) {
    const result = await attachOrCreateRecording({
      session,
      target: target.event,
      actor: event.actor,
      conversation: event.conversation,
      messageId: event.id,
    });
    const verb = result.created ? "Added" : "Linked existing";
    await transport.sendText(
      destination,
      `${verb} recording node #${result.recordingNodeId} and linked it to event #${target.event.id}: ${target.event.title}`
    );
    return true;
  }

  if (!scored.length) {
    await transport.sendText(
      destination,
      `I found the recording metadata for **${metadata.title}**, but I couldn't confidently match it to a Paper Club or Builders Club event. Reply with the event title/date, or run this again with "Paper Club" or "Builders Club" in the message.`
    );
    return true;
  }

  recordingIntakeSessionStore.set(destination.id, session);
  await transport.sendText(
    destination,
    [
      `I found **${metadata.title}**, but I need you to pick the event to attach it to:`,
      "",
      ...session.targets.map(formatTarget),
      "",
      "Reply with a number, or `cancel`.",
    ].join("\n")
  );
  return true;
}
