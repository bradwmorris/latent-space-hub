import { describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  HUB_BASE_URL: "https://hub.example.test",
  PAPER_CANDIDATE_CHANNEL_IDS: new Set<string>(),
  db: {},
}));

import { formatCandidateMessage } from "../paper-candidates/service";

describe("paper candidate message formatting", () => {
  it("renders a concise paragraph followed by 3-5 main takeaways", () => {
    const message = formatCandidateMessage({
      title: "Learning Mechanics",
      paperUrl: "https://arxiv.org/abs/2604.21691",
      summary:
        "This paper studies how models acquire and retain skills during training, with emphasis on mechanisms that make learning more or less stable across settings.",
      takeaways: [
        "Frames learning dynamics as something that can be inspected mechanistically.",
        "Focuses on stability and transfer rather than only headline benchmark scores.",
        "Gives Paper Club a concrete way to discuss what is happening inside training runs.",
        "Highlights open questions about which findings generalize beyond the studied setup.",
      ],
      sources: ["https://arxiv.org/abs/2604.21691"],
      suggestedBy: "<@123>",
    });

    expect(message).toContain("**Summary**\nThis paper studies");
    expect(message).toContain("**Main takeaways**");
    expect(message.match(/^- /gm)).toHaveLength(4);
    expect(message.indexOf("**Summary**")).toBeLessThan(message.indexOf("**Main takeaways**"));
  });

  it("caps verbose summaries and takeaways for Discord", () => {
    const message = formatCandidateMessage({
      title: "Verbose Paper",
      paperUrl: "https://example.com/paper",
      summary: "Summary ".repeat(120),
      takeaways: Array.from({ length: 8 }, (_, index) => `Takeaway ${index + 1} ${"detail ".repeat(80)}`),
      sources: ["https://example.com/paper"],
      suggestedBy: "<@123>",
    });

    expect(message.match(/^- /gm)).toHaveLength(5);
    expect(message.length).toBeLessThan(1800);
  });

  it("never renders malformed structured output as the summary", () => {
    const message = formatCandidateMessage({
      title: "Microsoft reasoning paper",
      paperUrl: "https://example.com/paper",
      summary: '{"title":"Microsoft paper","summary":"truncated output',
      takeaways: ['{"title":"Microsoft paper"'],
      sources: ["https://example.com/paper"],
      suggestedBy: "<@123>",
    });

    expect(message).not.toContain('{"title"');
    expect(message).toContain("Slop could not verify enough detail");
  });
});
