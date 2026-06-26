import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRecentPaperCandidates } = vi.hoisted(() => ({
  getRecentPaperCandidates: vi.fn(),
}));

vi.mock("../config", () => ({
  OPENAI_API_KEY: "",
}));

vi.mock("../db", () => ({
  getRecentPaperCandidates,
}));

import { TOOL_DEFINITIONS, TOOL_HANDLERS } from "../tools";

describe("recent paper candidates tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes a dedicated tool for recent Paper Club candidate papers", async () => {
    expect(TOOL_DEFINITIONS.some((tool) => tool.function.name === "slop_get_recent_paper_candidates"))
      .toBe(true);

    getRecentPaperCandidates.mockResolvedValue([
      {
        id: 9,
        title: "Learning Mechanics",
        link: "https://arxiv.org/abs/2604.21691",
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
        event_status: "candidate",
        presenter_status: "none",
        source_url: "https://arxiv.org/abs/2604.21691",
        discord_channel_id: "paper-channel",
        discord_message_id: "msg-1",
        discord_thread_id: "thread-1",
        scheduled_event_node_id: null,
      },
    ]);

    const output = await TOOL_HANDLERS.slop_get_recent_paper_candidates.execute(
      { status: "open", limit: 100 },
      {} as any
    );

    expect(getRecentPaperCandidates).toHaveBeenCalledWith({}, { status: "open", limit: 25 });
    expect(JSON.parse(output)).toMatchObject({
      count: 1,
      candidates: [
        {
          title: "Learning Mechanics",
          event_status: "candidate",
        },
      ],
    });
  });
});
