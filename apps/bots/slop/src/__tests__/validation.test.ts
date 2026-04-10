import { describe, expect, it } from "vitest";
import { validateEventDate, validateEventTitle, validatePaperUrl } from "../commands/validation";

describe("validation", () => {
  it("rejects invalid paper urls", () => {
    const invalid = validatePaperUrl("notaurl");
    expect(invalid.valid).toBe(false);
  });

  it("strips tracking params from urls", () => {
    const valid = validatePaperUrl("https://arxiv.org/abs/1706.03762?utm_source=test&utm_medium=x");
    expect(valid.valid).toBe(true);
    expect(valid.url).toBe("https://arxiv.org/abs/1706.03762");
  });

  it("enforces title length", () => {
    expect(validateEventTitle("a").valid).toBe(false);
    expect(validateEventTitle("A Valid Paper Title").valid).toBe(true);
  });

  it("requires future date and valid day", () => {
    expect(validateEventDate("not-a-date", "paper-club").valid).toBe(false);

    const nextWed = nextDayIso(3);
    const nextFri = nextDayIso(5);
    expect(validateEventDate(nextWed, "paper-club").valid).toBe(true);
    expect(validateEventDate(nextWed, "builders-club").valid).toBe(false);
    expect(validateEventDate(nextFri, "builders-club").valid).toBe(true);
  });
});

function nextDayIso(targetDay: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() !== targetDay);
  return d.toISOString().slice(0, 10);
}
