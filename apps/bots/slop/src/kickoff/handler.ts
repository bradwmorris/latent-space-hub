import { ChannelType, ThreadAutoArchiveDuration, type Client, type GuildTextBasedChannel } from "discord.js";
import { BOT_TALK_CHANNEL_ID, getProfileByName, getReadyClient } from "../config";
import { generateAgenticResponse } from "../llm/generate";
import { modelBadge, agenticToolsFooter } from "../discord/format";
import type { DestinationChannel, KickoffPayload } from "../types";
import { getToolTracesSnapshot, logTrace } from "../llm/tracing";

const activeDebates = new Set<string>();

export function buildKickoffQuery(payload: KickoffPayload): string {
  const candidate =
    payload.prompt ||
    [payload.title, payload.contentType, payload.summary, payload.eventDate]
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .join(" | ");
  return candidate?.trim() || "Summarize the most recent Latent Space content and why it matters.";
}

export async function resolveKickoffDestination(client: Client, payload: KickoffPayload): Promise<DestinationChannel> {
  const channelId = (payload.channelId || BOT_TALK_CHANNEL_ID || "").trim();
  if (!channelId) {
    throw new Error("No kickoff channel configured. Set BOT_TALK_CHANNEL_ID or include channelId in request.");
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Channel ${channelId} is not text-based or is inaccessible.`);
  }

  if (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread) {
    return channel as unknown as DestinationChannel;
  }

  const seedParts = [
    "New content ingested.",
    payload.title ? `Title: ${payload.title}` : "",
    payload.contentType ? `Type: ${payload.contentType}` : "",
    payload.eventDate ? `Date: ${payload.eventDate}` : "",
    payload.url ? `Source: ${payload.url}` : ""
  ].filter(Boolean);

  const baseChannel = channel as GuildTextBasedChannel;
  const kickoffMessage = await baseChannel.send(seedParts.join("\n"));
  const threadTitleSeed = (payload.title || payload.contentType || "new-content")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);

  try {
    const thread = await kickoffMessage.startThread({
      name: `Slop: ${threadTitleSeed || "new-content"}`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: "Kickoff for newly ingested content"
    });
    return thread as unknown as DestinationChannel;
  } catch {
    return baseChannel as unknown as DestinationChannel;
  }
}

export async function runDeterministicKickoff(payload: KickoffPayload): Promise<{ ok: true }> {
  const slopProfile = getProfileByName("Slop");
  const slopClient = getReadyClient("Slop");

  const destination = await resolveKickoffDestination(slopClient, payload);
  const kickoffKey = `kickoff:${payload.channelId || BOT_TALK_CHANNEL_ID || "unknown"}`;

  if (activeDebates.has(kickoffKey)) {
    throw new Error("A kickoff is already running for this channel.");
  }

  activeDebates.add(kickoffKey);
  const startTime = Date.now();
  const channelId = payload.channelId || BOT_TALK_CHANNEL_ID || "unknown";
  try {
    const slopPrompt = [
      "New content just dropped in Latent Space. Break it down.",
      `Context query: ${buildKickoffQuery(payload)}`,
      payload.title ? `Title: ${payload.title}` : "",
      payload.contentType ? `Type: ${payload.contentType}` : "",
      payload.eventDate ? `Date: ${payload.eventDate}` : "",
      payload.url ? `URL: ${payload.url}` : "",
      "Search the knowledge base for this content, summarize what's new, why it matters, and give your take. Cite sources."
    ]
      .filter(Boolean)
      .join("\n");

    const { text: output, toolsUsed, skillsRead, trace } = await generateAgenticResponse(slopProfile, slopPrompt);
    await destination.send(`${modelBadge(slopProfile.model)}\n${output}`);
    await destination.send(agenticToolsFooter(toolsUsed));

    const nodeIds = getToolTracesSnapshot()
      .filter((t) => t.tool === "slop_get_nodes" || t.tool === "slop_search_nodes")
      .flatMap((t) => {
        const r = t.result as Record<string, unknown> | null;
        if (r && Array.isArray((r as { nodes?: unknown[] }).nodes)) {
          return ((r as { nodes: Array<Record<string, unknown>> }).nodes).map((n) => Number(n.id)).filter(Number.isFinite);
        }
        return [];
      });
    await logTrace(slopProfile, { userId: "system", username: "kickoff", channelId, messageId: "" }, slopPrompt, output, {
      retrieval_method: "agentic",
      context_node_ids: nodeIds,
      member_id: null,
      is_slash_command: false,
      slash_command: null,
      is_kickoff: true,
      latency_ms: Date.now() - startTime,
      tools_used: toolsUsed,
      skills_used: skillsRead,
      llm_trace: trace
    });
  } finally {
    activeDebates.delete(kickoffKey);
  }

  return { ok: true };
}
