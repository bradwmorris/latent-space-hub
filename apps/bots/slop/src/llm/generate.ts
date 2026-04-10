import { OPENROUTER_API_KEY } from "../config";
import { db } from "../config";
import { TOOL_DEFINITIONS, TOOL_HANDLERS, type OpenAIToolDef } from "../tools";
import type {
  AgenticResult,
  BotProfile,
  LlmTrace,
  OpenRouterChatResponse,
  OpenRouterMessage
} from "../types";
import { buildSystemPrompt } from "./prompts";
import { recordTrace } from "./tracing";
import { readLocalSkillStrict } from "../skills";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const MAX_AGENTIC_ROUNDS = 5;
export const MAX_TOOL_RESULT_CHARS = 4000;

export function extractEstimatedCostUsd(usage: Record<string, unknown> | undefined): number | null {
  if (!usage) return null;
  const candidates = [
    usage.total_cost,
    usage.cost,
    usage.estimated_cost,
    usage.usd_cost,
    usage.total_cost_usd
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export async function generateResponse(
  profile: BotProfile,
  userPrompt: string,
  context: string,
  options?: { requireSources?: boolean; systemPrompt?: string }
): Promise<{ text: string; trace: LlmTrace }> {
  const requireSources = options?.requireSources ?? true;
  const systemContent = options?.systemPrompt || buildSystemPrompt({ skillsContext: "", memberContext: "" });
  const contextNote = requireSources
    ? "Use the supplied context for factual claims. Include a short Sources list with links."
    : "";
  const payload: {
    model: string;
    temperature: number;
    max_tokens: number;
    messages: OpenRouterMessage[];
  } = {
    model: profile.model,
    temperature: 0.6,
    max_tokens: 700,
    messages: [
      {
        role: "system",
        content: contextNote ? `${systemContent}\n\n${contextNote}` : systemContent
      },
      {
        role: "user",
        content: `User message:\n${userPrompt}\n\nContext:\n${context}`
      }
    ]
  };

  const start = Date.now();
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter error (${response.status}): ${body.slice(0, 400)}`);
  }

  const data = (await response.json()) as OpenRouterChatResponse;
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("OpenRouter returned empty response.");
  }

  return {
    text,
    trace: {
      system_prompt: systemContent,
      request_messages: payload.messages,
      request_payload: payload,
      response_id: data.id,
      provider: data.provider ?? null,
      usage: data.usage ?? null,
      estimated_cost_usd: extractEstimatedCostUsd(data.usage),
      latency_ms: Date.now() - start,
      rounds: 1
    }
  };
}

export async function generateAgenticResponse(
  profile: BotProfile,
  userPrompt: string,
  options?: { systemPrompt?: string }
): Promise<AgenticResult> {
  const systemContent = options?.systemPrompt || buildSystemPrompt({ skillsContext: "", memberContext: "" });
  const tools: OpenAIToolDef[] = TOOL_DEFINITIONS;
  const start = Date.now();

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: systemContent
    },
    { role: "user", content: userPrompt }
  ];

  const toolsUsed: string[] = [];
  const skillsRead = new Set<string>();

  for (let round = 0; round < MAX_AGENTIC_ROUNDS; round++) {
    const payload = {
      model: profile.model,
      temperature: 0.6,
      max_tokens: 1200,
      messages,
      tools
    };

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter error (${response.status}): ${body.slice(0, 400)}`);
    }

    const data = (await response.json()) as OpenRouterChatResponse;

    const choice = data.choices?.[0];
    const assistantMsg = choice?.message;
    if (!assistantMsg) throw new Error("OpenRouter returned empty response.");

    const aMsg: OpenRouterMessage = { role: "assistant" };
    if (assistantMsg.content) aMsg.content = assistantMsg.content;
    if (assistantMsg.tool_calls?.length) aMsg.tool_calls = assistantMsg.tool_calls;
    messages.push(aMsg);

    if (!assistantMsg.tool_calls?.length) {
      const text = (assistantMsg.content || "").trim();
      if (!text) throw new Error("OpenRouter returned empty response after tool loop.");
      return {
        text,
        toolsUsed,
        skillsRead: [...skillsRead],
        trace: {
          system_prompt: systemContent,
          request_messages: payload.messages,
          request_payload: {
            ...payload,
            tools: tools.map((t) => t.function.name)
          },
          response_id: data.id,
          provider: data.provider ?? null,
          usage: data.usage ?? null,
          estimated_cost_usd: extractEstimatedCostUsd(data.usage),
          latency_ms: Date.now() - start,
          rounds: round + 1
        }
      };
    }

    for (const tc of assistantMsg.tool_calls) {
      const toolName = tc.function.name;
      toolsUsed.push(toolName);
      let resultText: string;
      try {
        const args = JSON.parse(tc.function.arguments || "{}");

        const toolStart = Date.now();
        if (toolName === "slop_read_skill" && typeof args.name === "string") {
          skillsRead.add(args.name);
          resultText = readLocalSkillStrict(args.name);
        } else if (TOOL_HANDLERS[toolName]) {
          resultText = await TOOL_HANDLERS[toolName].execute(args, db);
        } else {
          resultText = `Error: Unknown tool "${toolName}"`;
        }
        recordTrace({ tool: toolName, args, result: resultText.length > 500 ? { length: resultText.length } : resultText, duration_ms: Date.now() - toolStart });
        if (resultText.length > MAX_TOOL_RESULT_CHARS) {
          resultText = resultText.slice(0, MAX_TOOL_RESULT_CHARS) + "\n...[truncated]";
        }
      } catch (error) {
        resultText = `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: resultText
      });
    }
  }

  messages.push({
    role: "user",
    content: "Please provide your final answer now based on the information gathered."
  });

  const finalPayload = {
    model: profile.model,
    temperature: 0.6,
    max_tokens: 1200,
    messages
  };

  const finalResponse = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(finalPayload)
  });

  if (!finalResponse.ok) {
    const body = await finalResponse.text();
    throw new Error(`OpenRouter error (${finalResponse.status}): ${body.slice(0, 400)}`);
  }

  const finalData = (await finalResponse.json()) as {
    id?: string;
    provider?: string;
    usage?: Record<string, unknown>;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = finalData.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned empty response on final round.");
  return {
    text,
    toolsUsed,
    skillsRead: [...skillsRead],
    trace: {
      system_prompt: systemContent,
      request_messages: finalPayload.messages,
      request_payload: finalPayload,
      response_id: finalData.id,
      provider: finalData.provider ?? null,
      usage: finalData.usage ?? null,
      estimated_cost_usd: extractEstimatedCostUsd(finalData.usage),
      latency_ms: Date.now() - start,
      rounds: MAX_AGENTIC_ROUNDS + 1
    }
  };
}
