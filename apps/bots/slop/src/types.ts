import type { Client } from "discord.js";

export type ToolTrace = {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  duration_ms: number;
  error?: string;
};

export type BotProfile = {
  name: "Slop";
  token: string;
  model: string;
  appId?: string;
};

export type DestinationChannel = {
  sendTyping: () => Promise<void>;
  send: (content: string) => Promise<unknown>;
};

export type KickoffPayload = {
  channelId?: string;
  title?: string;
  url?: string;
  contentType?: string;
  eventDate?: string;
  summary?: string;
  prompt?: string;
  exchanges?: number;
};

export type SchedulingSession = {
  eventType: "paper-club" | "builders-club";
  memberId: number;
  memberDiscordId: string;
  memberUsername: string;
  availableDates: string[];
  step: "pick_date" | "pick_title";
  chosenDate?: string;
};

export type MemberMetadata = {
  discord_id: string;
  discord_handle: string;
  avatar_url?: string;
  joined_at: string;
  last_active?: string;
  interaction_count?: number;
  interests?: string[];
  role?: string;
  company?: string;
  location?: string;
  interaction_preference?: string;
};

export type MemberNode = {
  id: number;
  title: string;
  notes: string;
  metadata: MemberMetadata;
};

export type LlmTrace = {
  system_prompt: string;
  request_messages: OpenRouterMessage[];
  request_payload: Record<string, unknown>;
  response_id?: string;
  provider?: string | null;
  usage?: Record<string, unknown> | null;
  estimated_cost_usd?: number | null;
  latency_ms: number;
  rounds: number;
};

export type AgenticResult = {
  text: string;
  toolsUsed: string[];
  skillsRead: string[];
  trace: LlmTrace;
};

export type TraceOptions = {
  retrieval_method: string;
  context_node_ids: number[];
  member_id: number | null;
  is_slash_command: boolean;
  slash_command: string | null;
  is_kickoff: boolean;
  latency_ms: number;
  interaction_kind?: string;
  tools_used?: string[];
  skills_used?: string[];
  llm_trace?: LlmTrace | null;
};

export type OpenRouterToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
};

export type OpenRouterChatResponse = {
  id?: string;
  provider?: string;
  usage?: Record<string, unknown>;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: OpenRouterToolCall[];
      role?: string;
    };
    finish_reason?: string;
  }>;
};

export type SkillMeta = {
  name: string;
  description: string;
};

export type ClientsByProfile = Map<BotProfile["name"], Client>;
