import { withinRateLimitByKey } from "../../discord/rate-limit";
import { modelBadge, agenticToolsFooter, splitForDiscord } from "../../discord/format";
import { generateAgenticResponse, generateResponse } from "../../llm/generate";
import { clearTraces, getToolTracesSnapshot, logTrace } from "../../llm/tracing";
import { buildSystemPrompt, parseProfileBlock } from "../../llm/prompts";
import { getSkillsContextOrThrow } from "../../skills";
import {
  formatMemberContext,
  lookupMember,
  updateMemberAfterInteraction,
} from "../../members";
import type { BotProfile } from "../../types";
import {
  defaultPromptFromCleanContent,
  shouldRespondToRuntimeMessage,
  type RuntimeChatTransport,
  type RuntimeMessageEvent,
} from "../runtime/types";

function isGreetingOrSmalltalk(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const simple = new Set([
    "hi",
    "hello",
    "hey",
    "yo",
    "sup",
    "how are you",
    "whats up",
    "what's up",
    "gm",
    "good morning",
    "good afternoon",
    "good evening",
  ]);
  return simple.has(normalized);
}

async function sendBotOutput(
  transport: RuntimeChatTransport,
  conversationId: RuntimeMessageEvent["conversation"],
  model: string,
  output: string,
  toolsUsed: string[]
): Promise<void> {
  await transport.sendText(conversationId, modelBadge(model));
  const parts = splitForDiscord(output);
  for (const part of parts) {
    await transport.sendText(conversationId, part);
  }
  await transport.sendText(conversationId, agenticToolsFooter(toolsUsed));
}

export async function handleRuntimeChatMessage(
  profile: BotProfile,
  event: RuntimeMessageEvent,
  transport: RuntimeChatTransport
): Promise<void> {
  if (!shouldRespondToRuntimeMessage(event, profile.name)) return;

  const ownedThread = event.conversation.ownerProfile === profile.name;
  if (
    !withinRateLimitByKey(profile.name, event.actor.id, event.conversation.id, {
      ownedThread,
    })
  ) {
    return;
  }

  clearTraces();
  const startTime = Date.now();
  const traceSource = {
    userId: event.actor.id,
    username: event.actor.username,
    channelId: event.conversation.id,
    messageId: event.id,
  };

  const prompt = defaultPromptFromCleanContent(event.cleanContent);
  const destination = await transport.ensureReplyConversation(
    event.conversation,
    prompt,
    profile.name
  );
  await transport.sendTyping(destination);

  const skillsContext = getSkillsContextOrThrow();
  const member = await lookupMember(event.actor.id);
  const memberContext = member
    ? formatMemberContext(member)
    : "[MEMBER STATUS] This user is not in the member graph yet. Casually mention `/join` when it naturally fits.";
  const systemPrompt = buildSystemPrompt({ skillsContext, memberContext });
  const smalltalk = isGreetingOrSmalltalk(prompt);

  if (smalltalk) {
    try {
      const { text: rawOutput, trace } = await generateResponse(
        profile,
        prompt,
        "No graph retrieval needed for greeting/smalltalk.",
        {
          requireSources: false,
          systemPrompt,
        }
      );
      const { clean: output, profile: profileUpdate } = parseProfileBlock(rawOutput);
      await sendBotOutput(transport, destination, profile.model, output, []);
      await logTrace(profile, traceSource, prompt, output, {
        retrieval_method: "smalltalk",
        context_node_ids: [],
        member_id: member?.id || null,
        is_slash_command: false,
        slash_command: null,
        is_kickoff: false,
        latency_ms: Date.now() - startTime,
        tools_used: [],
        skills_used: [],
        llm_trace: trace,
      });
      if (member && profileUpdate) {
        queueMicrotask(async () => {
          try {
            await updateMemberAfterInteraction(
              member,
              prompt,
              [],
              profileUpdate,
              event.actor.avatarUrl
            );
          } catch (error) {
            console.warn("Member update failed (non-blocking):", error);
          }
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await transport.sendText(
        destination,
        `${profile.name} hit an error while generating a response: ${msg}`
      );
    }
    return;
  }

  try {
    const { text: rawOutput, toolsUsed, skillsRead, trace } =
      await generateAgenticResponse(profile, prompt, { systemPrompt });
    const { clean: output, profile: profileUpdate } = parseProfileBlock(rawOutput);
    const nodeIds = getToolTracesSnapshot()
      .filter((t) => t.tool === "slop_get_nodes" || t.tool === "slop_search_nodes")
      .flatMap((t) => {
        const r = t.result as Record<string, unknown> | null;
        if (!r) return [];
        if (Array.isArray(r)) {
          return r
            .map((n: Record<string, unknown>) => Number(n.id))
            .filter(Number.isFinite);
        }
        if (typeof r === "object" && "nodes_count" in r) return [];
        return [];
      });

    await sendBotOutput(transport, destination, profile.model, output, toolsUsed);
    await logTrace(profile, traceSource, prompt, output, {
      retrieval_method: "agentic",
      context_node_ids: nodeIds,
      member_id: member?.id || null,
      is_slash_command: false,
      slash_command: null,
      is_kickoff: false,
      latency_ms: Date.now() - startTime,
      tools_used: toolsUsed,
      skills_used: skillsRead,
      llm_trace: trace,
    });

    if (member) {
      queueMicrotask(async () => {
        try {
          await updateMemberAfterInteraction(
            member,
            prompt,
            nodeIds,
            profileUpdate,
            event.actor.avatarUrl
          );
        } catch (error) {
          console.warn("Member update failed (non-blocking):", error);
        }
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await transport.sendText(
      destination,
      `${profile.name} hit an error while generating a response: ${msg}`
    );
  }
}
