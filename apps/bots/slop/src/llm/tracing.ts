import { db } from "../config";
import type { BotProfile, ToolTrace, TraceOptions } from "../types";

const toolTraces: ToolTrace[] = [];

export function clearTraces(): ToolTrace[] {
  const traces = [...toolTraces];
  toolTraces.length = 0;
  return traces;
}

export function recordTrace(trace: ToolTrace): void {
  toolTraces.push(trace);
}

export function summarizeUserMessage(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (clean.length <= 180) return clean;
  return `${clean.slice(0, 177)}...`;
}

export function inferInteractionKind(options: TraceOptions): string {
  if (options.interaction_kind) return options.interaction_kind;
  if (options.is_kickoff) return "Kickoff post from newly ingested content";
  if (options.is_slash_command) {
    if (options.slash_command === "join") return "Slash command: member onboarding";
    if (options.slash_command === "paper-club") return "Slash command: schedule paper club event";
    if (options.slash_command === "builders-club") return "Slash command: schedule builders club event";
    return "Slash command interaction";
  }
  if (options.retrieval_method === "smalltalk") return "Thread chat / small talk";
  if (options.retrieval_method === "agentic") return "Thread user request answered with agentic retrieval";
  if (options.retrieval_method === "event_create") return "Event scheduling workflow";
  return "Discord interaction";
}

export function getToolTracesSnapshot(): ToolTrace[] {
  return [...toolTraces];
}

export async function logTrace(
  profile: BotProfile,
  source: { userId: string; username: string; channelId: string; messageId: string },
  prompt: string,
  response: string,
  options: TraceOptions
): Promise<void> {
  try {
    const toolCalls: ToolTrace[] = clearTraces();
    const metadata = {
      interaction_kind: inferInteractionKind(options),
      discord_user_id: source.userId,
      discord_username: source.username,
      discord_channel_id: source.channelId,
      discord_message_id: source.messageId,
      retrieval_method: options.retrieval_method,
      context_node_ids: options.context_node_ids,
      tools_used: options.tools_used || toolCalls.map((t) => t.tool),
      skills_used: options.skills_used || [],
      tool_calls: toolCalls,
      member_id: options.member_id,
      model: profile.model,
      is_slash_command: options.is_slash_command,
      slash_command: options.slash_command,
      is_kickoff: options.is_kickoff,
      response_length: response.length,
      latency_ms: options.latency_ms,
      system_message: options.llm_trace?.system_prompt || null,
      llm_messages: options.llm_trace?.request_messages || null,
      llm_request_payload: options.llm_trace?.request_payload || null,
      openrouter_response_id: options.llm_trace?.response_id || null,
      openrouter_provider: options.llm_trace?.provider || null,
      openrouter_usage: options.llm_trace?.usage || null,
      estimated_cost_usd: options.llm_trace?.estimated_cost_usd ?? null
    };

    await db.execute({
      sql: "INSERT INTO chats (chat_type, user_message, assistant_message, thread_id, helper_name, agent_type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        "discord",
        prompt,
        response.slice(0, 8000),
        source.channelId,
        profile.name.toLowerCase(),
        "discord-bot",
        JSON.stringify(metadata),
        new Date().toISOString()
      ]
    });
  } catch (error) {
    console.warn("Trace logging failed:", error instanceof Error ? error.message : String(error));
  }
}
