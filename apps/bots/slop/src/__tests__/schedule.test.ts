import { describe, expect, it } from "vitest";
import { getNextDatesForDay } from "../commands/schedulingDates";

describe("getNextDatesForDay", () => {
  it("returns the requested count on target day", () => {
    const dates = getNextDatesForDay(3, 5); // Wednesday
    expect(dates).toHaveLength(5);
    for (const date of dates) {
      const d = new Date(`${date}T00:00:00Z`);
      expect(d.getUTCDay()).toBe(3);
    }
  });
});
