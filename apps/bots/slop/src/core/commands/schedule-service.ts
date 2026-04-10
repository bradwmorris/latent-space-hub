import * as dbOps from "../../db";
import { db, HUB_BASE_URL } from "../../config";
import { logTrace } from "../../llm/tracing";
import { createMemberNodeFromActor, lookupMember } from "../../members";
import type { BotProfile, SchedulingSession } from "../../types";
import type {
  RuntimeCommandEvent,
  RuntimeCommandTransport,
  RuntimeMessageEvent,
  RuntimeReplyPort,
} from "../runtime/types";
import { schedulingSessionStore } from "../sessions/scheduling-store";
import { getNextDatesForDay } from "../../commands/schedulingDates";
import {
  validateEventDate,
  validateEventTitle,
  validatePaperUrl,
} from "../../commands/validation";

const schedulingInFlight = new Set<string>();

export function getSchedulingSession(
  conversationId: string
): SchedulingSession | undefined {
  return schedulingSessionStore.get(conversationId);
}

export function clearSchedulingSession(conversationId: string): void {
  schedulingSessionStore.clear(conversationId);
}

export async function startScheduleCommandEvent(
  profile: BotProfile,
  event: RuntimeCommandEvent,
  transport: RuntimeCommandTransport,
  command: "paper-club" | "builders-club"
): Promise<void> {
  const inFlightKey = `${event.actor.id}:${command}`;
  if (schedulingInFlight.has(inFlightKey)) {
    await transport.editReply(`You already have a ${command} scheduling flow in progress.`);
    return;
  }
  schedulingInFlight.add(inFlightKey);

  try {
    let member = await lookupMember(event.actor.id);
    if (!member) {
      await createMemberNodeFromActor(event.actor);
      member = await lookupMember(event.actor.id);
      if (!member) {
        await transport.editReply(
          "Couldn't create your profile. Try again or run `/join` first."
        );
        return;
      }
    }

    const isPaperClub = command === "paper-club";
    const label = isPaperClub ? "Paper Club" : "Builders Club";
    const targetDay = isPaperClub ? 3 : 5;
    const nextDates = getNextDatesForDay(targetDay, 6);
    const booked = await dbOps.getBookedDates(db, command, nextDates);
    const available = nextDates.filter((d) => !booked.has(d)).slice(0, 4);

    if (!available.length) {
      await transport.editReply(`All upcoming ${label} slots are booked. Try again later.`);
      return;
    }

    const dayLabel = isPaperClub ? "Wed" : "Fri";
    const lines = available.map((d, i) => {
      const date = new Date(`${d}T12:00:00Z`);
      const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      const day = date.getUTCDate();
      return `**${i + 1}.** ${dayLabel} ${month} ${day} (${d})`;
    });
    const prompt = isPaperClub
      ? "Reply with the **number** of the date you want, and the **paper title** (optionally with URL)."
      : "Reply with the **number** of the date you want, and your **topic**.";

    const message = await transport.editReply(
      `**Schedule a ${label} session**\n\nAvailable dates:\n${lines.join("\n")}\n\n${prompt}`
    );

    let sessionConversation = event.conversation;
    const thread = await transport.openThread({
      name: `${label}: ${event.actor.username} scheduling`,
      startMessageId: message.id,
      reason: `${label} scheduling thread`,
    });
    if (thread) {
      sessionConversation = thread;
    } else if (schedulingSessionStore.has(sessionConversation.id)) {
      await transport.followUp(
        "Another scheduling session is active in this channel. Try again in a few minutes."
      );
      return;
    }

    schedulingSessionStore.set(
      sessionConversation.id,
      {
        eventType: command,
        memberId: member.id,
        memberDiscordId: event.actor.id,
        memberUsername: event.actor.username,
        availableDates: available,
        step: "pick_date",
      },
      thread && transport.sendWarning
        ? {
            onWarn: async () => {
              await transport.sendWarning?.(
                sessionConversation,
                schedulingSessionStore.warningText()
              );
            },
          }
        : undefined
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await transport.editReply(`Couldn't start scheduling: ${msg}`);
  } finally {
    schedulingInFlight.delete(inFlightKey);
  }
}

export async function handleSchedulingReplyEvent(
  profile: BotProfile,
  event: RuntimeMessageEvent,
  replyPort: RuntimeReplyPort,
  session: SchedulingSession
): Promise<void> {
  const text = event.content.trim();
  const isPaperClub = session.eventType === "paper-club";

  if (session.step === "pick_date") {
    const match = text.trim().match(/^(\d)\s*(.*)/s);
    if (!match) {
      await replyPort.reply(
        `Reply with a number (1-${session.availableDates.length}) to pick a date.`
      );
      return;
    }

    const pick = parseInt(match[1], 10);
    if (pick < 1 || pick > session.availableDates.length) {
      await replyPort.reply(
        `Pick a number between 1 and ${session.availableDates.length}.`
      );
      return;
    }

    const chosenDate = session.availableDates[pick - 1];
    const titleText = match[2]?.trim();

    if (titleText) {
      await createScheduledEvent(profile, event, replyPort, session, chosenDate, titleText);
      return;
    }

    session.chosenDate = chosenDate;
    session.step = "pick_title";
    const dateLabel = new Date(`${chosenDate}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const ask = isPaperClub
      ? `Got it: **${dateLabel}**. What paper are you presenting? (title, optionally URL)`
      : `Got it: **${dateLabel}**. What's your topic?`;
    await replyPort.reply(ask);
    return;
  }

  if (session.step === "pick_title") {
    if (!text) {
      await replyPort.reply(
        isPaperClub ? "What paper are you presenting?" : "What's your topic?"
      );
      return;
    }
    await createScheduledEvent(
      profile,
      event,
      replyPort,
      session,
      session.chosenDate!,
      text
    );
  }
}

async function createScheduledEvent(
  profile: BotProfile,
  event: RuntimeMessageEvent,
  replyPort: RuntimeReplyPort,
  session: SchedulingSession,
  dateStr: string,
  titleText: string
): Promise<void> {
  const isPaperClub = session.eventType === "paper-club";
  const label = isPaperClub ? "Paper Club" : "Builders Club";

  try {
    const dateValidation = validateEventDate(dateStr, session.eventType);
    if (!dateValidation.valid) {
      await replyPort.reply(
        dateValidation.error || "That date is not valid anymore. Please restart scheduling."
      );
      return;
    }

    let paperUrl: string | undefined;
    let rawTitle = titleText;
    if (isPaperClub) {
      const urlMatch = titleText.match(/(https?:\/\/\S+)/);
      if (urlMatch) {
        const validUrl = validatePaperUrl(urlMatch[1]);
        if (!validUrl.valid) {
          await replyPort.reply(validUrl.error || "Paper URL is invalid.");
          return;
        }
        paperUrl = validUrl.url;
        rawTitle = titleText.replace(urlMatch[0], "").trim();
      }
    }

    const titleValidation = validateEventTitle(rawTitle);
    if (!titleValidation.valid) {
      await replyPort.reply(titleValidation.error || "Title is invalid.");
      return;
    }
    const cleanTitle = titleValidation.title;

    const eventPayload: Parameters<typeof dbOps.createEventNodeAtomic>[1] = isPaperClub
      ? {
          title: `${label}: ${cleanTitle}`,
          description: `Hosted by ${session.memberUsername}. ${cleanTitle}`,
          event_date: dateStr,
          event_type: "paper-club",
          presenter_name: session.memberUsername,
          presenter_discord_id: session.memberDiscordId,
          presenter_node_id: session.memberId,
          paper_title: cleanTitle,
          paper_url: paperUrl,
        }
      : {
          title: `${label}: ${cleanTitle}`,
          description: `Hosted by ${session.memberUsername}. ${cleanTitle}`,
          event_date: dateStr,
          event_type: "builders-club",
          presenter_name: session.memberUsername,
          presenter_discord_id: session.memberDiscordId,
          presenter_node_id: session.memberId,
          topic: cleanTitle,
        };

    const created = await dbOps.createEventNodeAtomic(db, eventPayload);
    if (created.alreadyBooked) {
      await replyPort.reply(
        "That slot was just taken. Pick another date with `/paper-club` or `/builders-club`."
      );
      clearSchedulingSession(replyPort.conversation.id);
      return;
    }

    await dbOps.createEdge(
      db,
      session.memberId,
      created.nodeId,
      `hosting ${label} session`
    );

    const dateLabel = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const deepLink = `${HUB_BASE_URL}/?type=${session.eventType}`;
    const reply = `**${label} scheduled!**\n📅 ${dateLabel}\n📝 ${cleanTitle}\n🎤 ${session.memberUsername}\n\n[View in the Hub](${deepLink})`;
    await replyPort.reply(reply);
    clearSchedulingSession(replyPort.conversation.id);

    const traceSource = {
      userId: session.memberDiscordId,
      username: session.memberUsername,
      channelId: replyPort.conversation.id,
      messageId: event.id,
    };
    await logTrace(profile, traceSource, `/${session.eventType}`, reply, {
      retrieval_method: "event_create",
      context_node_ids: [created.nodeId],
      member_id: session.memberId,
      is_slash_command: true,
      slash_command: session.eventType,
      is_kickoff: false,
      latency_ms: 0,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await replyPort.reply(`Couldn't create the event: ${msg}`);
    clearSchedulingSession(replyPort.conversation.id);
  }
}
