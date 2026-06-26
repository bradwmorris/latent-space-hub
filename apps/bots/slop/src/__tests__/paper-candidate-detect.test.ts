import { describe, expect, it } from "vitest";
import { detectPaperCandidate } from "../paper-candidates/detect";

describe("detectPaperCandidate", () => {
  it("detects direct arXiv links", () => {
    const result = detectPaperCandidate({
      content: "This looks good https://arxiv.org/abs/2604.21691",
    });

    expect(result?.paperUrl).toBe("https://arxiv.org/abs/2604.21691");
    expect(result?.sourceKind).toBe("paper");
  });

  it("detects social posts when the surrounding text is paper-ish", () => {
    const result = detectPaperCandidate({
      content: "New paper thread https://x.com/example/status/123",
      embeds: [{ description: "We introduce a new benchmark in this paper." }],
    });

    expect(result?.paperUrl).toBe("https://x.com/example/status/123");
    expect(result?.sourceKind).toBe("social");
  });

  it("detects ordinary links in paper candidate channels", () => {
    const result = detectPaperCandidate({
      content: "Nice homepage https://example.com",
    });

    expect(result?.paperUrl).toBe("https://example.com");
    expect(result?.sourceKind).toBe("web");
  });
});
