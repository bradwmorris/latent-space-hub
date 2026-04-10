import * as dbOps from "../../db";
import { db } from "../../config";
import { lookupMember } from "../../members";
import type {
  RuntimeCommandEvent,
  RuntimeCommandTransport,
  RuntimeMessageEvent,
  RuntimeReplyPort,
} from "../runtime/types";
import { editEventSessionStore } from "../sessions/edit-event-store";
import { getNextDatesForDay } from "../../commands/schedulingDates";
import {
  validateEventDate,
  validateEventTitle,
  validatePaperUrl,
} from "../../commands/validation";

export type EditableEvent = {
  id: number;
  title: string;
  eventDate: string;
  eventType: "paper-club" | "builders-club";
  metadata: Record<string, unknown>;
};

export type EditSession = {
  memberDiscordId: string;
  memberNodeId?: number;
  memberUsername?: string;
  events: EditableEvent[];
  selectedEventId?: number;
  step: "pick_event" | "menu" | "edit_title" | "edit_url" | "edit_notes" | "pick_date";
  dateOptions?: string[];
};

function getSelectedEvent(session: EditSession): EditableEvent | null {
  if (!session.selectedEventId) return null;
  return session.events.find((e) => e.id === session.selectedEventId) || null;
}

function formatEventLine(event: EditableEvent, idx: number): string {
  const label = event.eventType === "paper-club" ? "Paper Club" : "Builders Club";
  return `**${idx + 1}.** ${label} — ${event.eventDate} — ${event.title}`;
}

function menuPrompt(eventType: "paper-club" | "builders-club"): string {
  if (eventType === "paper-club") {
    return "Reply with:\n`1` change title\n`2` change paper URL\n`3` reschedule date\n`4` add/update notes & supplementary links\n`5` cancel event\n`6` done";
  }
  return "Reply with:\n`1` change title\n`2` reschedule date\n`3` cancel event\n`4` done";
}

function toEditableEvent(row: dbOps.ScheduledEventRow): EditableEvent | null {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const eventType = metadata.event_type;
  if (eventType !== "paper-club" && eventType !== "builders-club") return null;
  return {
    id: row.id,
    title: row.title,
    eventDate: row.event_date,
    eventType,
    metadata,
  };
}

export function getEditEventSession(conversationId: string): EditSession | undefined {
  return editEventSessionStore.get(conversationId);
}

export function clearEditEventSession(conversationId: string): void {
  editEventSessionStore.clear(conversationId);
}

export async function startEditEventCommandEvent(
  event: RuntimeCommandEvent,
  transport: RuntimeCommandTransport
): Promise<void> {
  try {
    const member = await lookupMember(event.actor.id);
    const rows = await dbOps.getScheduledEventsByPresenter(db, {
      presenterDiscordId: event.actor.id,
      presenterNodeId: member?.id,
      presenterName: event.actor.username,
    });
    const events = rows
      .map(toEditableEvent)
      .filter((value): value is EditableEvent => value !== null);
    if (!events.length) {
      await transport.editReply("You don't have any upcoming scheduled events.");
      return;
    }

    const message = await transport.editReply("Opening event editor...");
    let sessionConversation = event.conversation;
    const thread = await transport.openThread({
      name: `Edit Event: ${event.actor.username}`,
      startMessageId: message.id,
      reason: "Event editing thread",
    });
    if (thread) {
      sessionConversation = thread;
    } else if (editEventSessionStore.has(sessionConversation.id)) {
      await transport.followUp(
        "Another event editing session is already active in this channel."
      );
      return;
    }

    if (events.length === 1) {
      const only = events[0];
      editEventSessionStore.set(sessionConversation.id, {
        memberDiscordId: event.actor.id,
        memberNodeId: member?.id,
        memberUsername: event.actor.username,
        events,
        selectedEventId: only.id,
        step: "menu",
      });
      await transport.sendText(
        sessionConversation,
        `Editing:\n${formatEventLine(only, 0)}\n\n${menuPrompt(only.eventType)}`
      );
      return;
    }

    editEventSessionStore.set(sessionConversation.id, {
      memberDiscordId: event.actor.id,
      memberNodeId: member?.id,
      memberUsername: event.actor.username,
      events,
      step: "pick_event",
    });
    await transport.sendText(
      sessionConversation,
      `Pick the event to edit:\n${events
        .map((scheduledEvent, idx) => formatEventLine(scheduledEvent, idx))
        .join("\n")}`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await transport.editReply(`Couldn't open event editor: ${msg}`);
  }
}

export async function handleEditEventReplyEvent(
  event: RuntimeMessageEvent,
  replyPort: RuntimeReplyPort,
  session: EditSession
): Promise<void> {
  const text = event.content.trim();

  if (session.step === "pick_event") {
    const n = Number.parseInt(text, 10);
    if (!Number.isFinite(n) || n < 1 || n > session.events.length) {
      await replyPort.reply(`Pick a number between 1 and ${session.events.length}.`);
      return;
    }
    const selected = session.events[n - 1];
    session.selectedEventId = selected.id;
    session.step = "menu";
    await replyPort.reply(
      `Editing:\n${formatEventLine(selected, n - 1)}\n\n${menuPrompt(selected.eventType)}`
    );
    return;
  }

  const selected = getSelectedEvent(session);
  if (!selected) {
    clearEditEventSession(replyPort.conversation.id);
    await replyPort.reply("This edit session expired. Please run `/edit-event` again.");
    return;
  }

  if (session.step === "menu") {
    if (text === "1") {
      session.step = "edit_title";
      await replyPort.reply("Send the new title/topic.");
      return;
    }
    if (selected.eventType === "paper-club" && text === "2") {
      session.step = "edit_url";
      await replyPort.reply("Send the new paper URL, or `none` to remove it.");
      return;
    }

    const rescheduleChoice = selected.eventType === "paper-club" ? "3" : "2";
    const notesChoice = selected.eventType === "paper-club" ? "4" : null;
    const cancelChoice = selected.eventType === "paper-club" ? "5" : "3";
    const doneChoice = selected.eventType === "paper-club" ? "6" : "4";

    if (notesChoice && text === notesChoice) {
      session.step = "edit_notes";
      const current =
        typeof selected.metadata.notes === "string" && selected.metadata.notes
          ? `\n\nCurrent notes:\n${selected.metadata.notes}`
          : "";
      await replyPort.reply(
        `Send your notes for attendees. You can include a message, supplementary links, background reading — anything helpful.${current}\n\nSend \`clear\` to remove existing notes.`
      );
      return;
    }
    if (text === rescheduleChoice) {
      const targetDay = selected.eventType === "paper-club" ? 3 : 5;
      const nextDates = getNextDatesForDay(targetDay, 8);
      const booked = await dbOps.getBookedDates(db, selected.eventType, nextDates);
      const options = nextDates
        .filter((d) => d === selected.eventDate || !booked.has(d))
        .slice(0, 6);
      session.dateOptions = options;
      session.step = "pick_date";
      await replyPort.reply(
        `Pick a new date:\n${options
          .map((d, idx) => `**${idx + 1}.** ${d}`)
          .join("\n")}`
      );
      return;
    }
    if (text === cancelChoice) {
      const result = await dbOps.updateEventNode(db, {
        nodeId: selected.id,
        presenterDiscordId: session.memberDiscordId,
        presenterNodeId: session.memberNodeId,
        presenterName: session.memberUsername,
        cancel: true,
      });
      if (!result.ok) {
        await replyPort.reply(
          "Couldn't cancel this event (not found, not yours, or already updated)."
        );
        clearEditEventSession(replyPort.conversation.id);
        return;
      }
      await replyPort.reply("Event cancelled.");
      clearEditEventSession(replyPort.conversation.id);
      return;
    }
    if (text === doneChoice) {
      await replyPort.reply("Done. Event editor closed.");
      clearEditEventSession(replyPort.conversation.id);
      return;
    }
    await replyPort.reply(
      "That option isn't valid for this event type. Use the numbered menu shown above."
    );
    return;
  }

  if (session.step === "edit_title") {
    const validTitle = validateEventTitle(text);
    if (!validTitle.valid) {
      await replyPort.reply(validTitle.error || "Invalid title.");
      return;
    }
    const label =
      selected.eventType === "paper-club" ? "Paper Club" : "Builders Club";
    const result = await dbOps.updateEventNode(db, {
      nodeId: selected.id,
      presenterDiscordId: session.memberDiscordId,
      presenterNodeId: session.memberNodeId,
      presenterName: session.memberUsername,
      title: `${label}: ${validTitle.title}`,
      description: `Hosted by ${selected.metadata.presenter_name || "presenter"}. ${validTitle.title}`,
      metadataUpdates:
        selected.eventType === "paper-club"
          ? { paper_title: validTitle.title }
          : { topic: validTitle.title },
    });
    if (!result.ok) {
      await replyPort.reply("Couldn't update title.");
      clearEditEventSession(replyPort.conversation.id);
      return;
    }
    selected.title = `${label}: ${validTitle.title}`;
    session.step = "menu";
    await replyPort.reply(`Title updated.\n\n${menuPrompt(selected.eventType)}`);
    return;
  }

  if (session.step === "edit_url") {
    if (text.toLowerCase() === "none") {
      const result = await dbOps.updateEventNode(db, {
        nodeId: selected.id,
        presenterDiscordId: session.memberDiscordId,
        presenterNodeId: session.memberNodeId,
        presenterName: session.memberUsername,
        metadataUpdates: { paper_url: null },
      });
      if (!result.ok) {
        await replyPort.reply("Couldn't remove paper URL.");
        clearEditEventSession(replyPort.conversation.id);
        return;
      }
      session.step = "menu";
      await replyPort.reply(`Paper URL removed.\n\n${menuPrompt(selected.eventType)}`);
      return;
    }

    const validUrl = validatePaperUrl(text);
    if (!validUrl.valid) {
      await replyPort.reply(validUrl.error || "Invalid URL.");
      return;
    }
    const result = await dbOps.updateEventNode(db, {
      nodeId: selected.id,
      presenterDiscordId: session.memberDiscordId,
      presenterNodeId: session.memberNodeId,
      presenterName: session.memberUsername,
      metadataUpdates: { paper_url: validUrl.url },
    });
    if (!result.ok) {
      await replyPort.reply("Couldn't update paper URL.");
      clearEditEventSession(replyPort.conversation.id);
      return;
    }
    session.step = "menu";
    await replyPort.reply(`Paper URL updated.\n\n${menuPrompt(selected.eventType)}`);
    return;
  }

  if (session.step === "edit_notes") {
    const newNotes = text.toLowerCase() === "clear" ? null : text;
    const result = await dbOps.updateEventNode(db, {
      nodeId: selected.id,
      presenterDiscordId: session.memberDiscordId,
      presenterNodeId: session.memberNodeId,
      presenterName: session.memberUsername,
      notes: newNotes,
    });
    if (!result.ok) {
      await replyPort.reply("Couldn't update notes.");
      clearEditEventSession(replyPort.conversation.id);
      return;
    }
    session.step = "menu";
    const confirm = newNotes === null ? "Notes cleared." : "Notes updated.";
    await replyPort.reply(`${confirm}\n\n${menuPrompt(selected.eventType)}`);
    return;
  }

  if (session.step === "pick_date") {
    const options = session.dateOptions || [];
    const n = Number.parseInt(text, 10);
    if (!Number.isFinite(n) || n < 1 || n > options.length) {
      await replyPort.reply(`Pick a number between 1 and ${options.length}.`);
      return;
    }
    const chosenDate = options[n - 1];
    const validDate = validateEventDate(chosenDate, selected.eventType);
    if (!validDate.valid) {
      await replyPort.reply(validDate.error || "Invalid date.");
      return;
    }
    const result = await dbOps.updateEventNode(db, {
      nodeId: selected.id,
      presenterDiscordId: session.memberDiscordId,
      presenterNodeId: session.memberNodeId,
      presenterName: session.memberUsername,
      eventDate: chosenDate,
    });
    if (!result.ok) {
      if (result.reason === "already_booked") {
        await replyPort.reply("That slot is no longer available. Pick another date.");
      } else {
        await replyPort.reply("Couldn't reschedule this event.");
        clearEditEventSession(replyPort.conversation.id);
      }
      return;
    }
    selected.eventDate = chosenDate;
    session.step = "menu";
    await replyPort.reply(`Date updated to ${chosenDate}.\n\n${menuPrompt(selected.eventType)}`);
  }
}
