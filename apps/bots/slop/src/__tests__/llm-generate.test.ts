import { beforeEach, describe, expect, it, vi } from "vitest";

const { toolExecute } = vi.hoisted(() => ({
  toolExecute: vi.fn(),
}));

vi.mock("../config", () => ({
  OPENROUTER_API_KEY: "openrouter-key",
  db: {},
}));

vi.mock("../tools", () => ({
  TOOL_DEFINITIONS: [
    {
      type: "function",
      function: {
        name: "slop_get_context",
        description: "Get context",
        parameters: { type: "object", properties: {} },
      },
    },
  ],
  TOOL_HANDLERS: {
    slop_get_context: {
      execute: toolExecute,
    },
  },
}));

vi.mock("../skills", () => ({
  readLocalSkillStrict: vi.fn(() => "skill body"),
}));

vi.mock("../llm/tracing", () => ({
  recordTrace: vi.fn(),
}));

import { generateAgenticResponse } from "../llm/generate";

describe("generateAgenticResponse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toolExecute.mockResolvedValue(JSON.stringify({ ok: true }));
  });

  it("passes provider reasoning fields back during tool-call loops", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "response-1",
          provider: "SiliconFlow",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                reasoning_content: "provider reasoning token block",
                reasoning_details: [{ type: "reasoning.text", text: "provider reasoning token block" }],
                tool_calls: [
                  {
                    id: "call-1",
                    type: "function",
                    function: { name: "slop_get_context", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "response-2",
          provider: "SiliconFlow",
          choices: [{ message: { role: "assistant", content: "Final answer." } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAgenticResponse(
      { name: "Slop", token: "bot-token", model: "deepseek/deepseek-v4-pro" },
      "What can you do?",
      { systemPrompt: "System prompt" }
    );

    expect(result.text).toBe("Final answer.");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(secondPayload.messages[2]).toMatchObject({
      role: "assistant",
      reasoning_content: "provider reasoning token block",
      reasoning_details: [{ type: "reasoning.text", text: "provider reasoning token block" }],
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "slop_get_context", arguments: "{}" },
        },
      ],
    });
    expect(secondPayload.messages[3]).toMatchObject({
      role: "tool",
      tool_call_id: "call-1",
      content: JSON.stringify({ ok: true }),
    });
    expect(result.trace.request_messages[2]).not.toHaveProperty("reasoning_content");
    expect(result.trace.request_messages[2]).not.toHaveProperty("reasoning_details");
  });
});
