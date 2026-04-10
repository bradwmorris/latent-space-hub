import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  db: {},
}));

vi.mock("../db", () => ({
  getScheduledEventsByPresenter: vi.fn(),
  getBookedDates: vi.fn(),
  updateEventNode: vi.fn(),
}));

vi.mock("../members", () => ({
  lookupMember: vi.fn(),
}));

import { handleEditEventReply } from "../commands/edit-event";

function makeMessage(content: string) {
  return {
    channelId: "thread-1",
    content,
    reply: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("edit-event flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects an event and moves from pick_event to menu", async () => {
    const session: any = {
      memberDiscordId: "user-1",
      events: [
        {
          id: 1,
          title: "Paper Club: Test",
          eventDate: "2026-04-08",
          eventType: "paper-club",
          metadata: {},
        },
      ],
      step: "pick_event",
    };
    const message = makeMessage("1");

    await handleEditEventReply(message, session as any);

    expect(session.step).toBe("menu");
    expect(session.selectedEventId).toBe(1);
    expect(message.reply).toHaveBeenCalledWith(
      "Editing:\n**1.** Paper Club — 2026-04-08 — Paper Club: Test\n\nReply with:\n`1` change title\n`2` change paper URL\n`3` reschedule date\n`4` add/update notes & supplementary links\n`5` cancel event\n`6` done"
    );
  });

  it("moves a paper-club session from menu to edit_notes", async () => {
    const session: any = {
      memberDiscordId: "user-1",
      selectedEventId: 1,
      events: [
        {
          id: 1,
          title: "Paper Club: Test",
          eventDate: "2026-04-08",
          eventType: "paper-club",
          metadata: { notes: "Existing notes" },
        },
      ],
      step: "menu",
    };
    const message = makeMessage("4");

    await handleEditEventReply(message, session as any);

    expect(session.step).toBe("edit_notes");
    expect(message.reply).toHaveBeenCalledWith(
      "Send your notes for attendees. You can include a message, supplementary links, background reading — anything helpful.\n\nCurrent notes:\nExisting notes\n\nSend `clear` to remove existing notes."
    );
  });

  it("rejects invalid builder-club menu choices", async () => {
    const session: any = {
      memberDiscordId: "user-1",
      selectedEventId: 2,
      events: [
        {
          id: 2,
          title: "Builders Club: Infra",
          eventDate: "2026-04-10",
          eventType: "builders-club",
          metadata: {},
        },
      ],
      step: "menu",
    };
    const message = makeMessage("9");

    await handleEditEventReply(message, session as any);

    expect(session.step).toBe("menu");
    expect(message.reply).toHaveBeenCalledWith(
      "That option isn't valid for this event type. Use the numbered menu shown above."
    );
  });
});
