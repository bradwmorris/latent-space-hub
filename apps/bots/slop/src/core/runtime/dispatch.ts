import type { BotProfile } from "../../types";
import { handleRuntimeChatMessage } from "../chat/respond";
import { handleJoinCommandEvent } from "../commands/join-service";
import {
  getSchedulingSession,
  handleSchedulingReplyEvent,
  startScheduleCommandEvent,
} from "../commands/schedule-service";
import {
  getEditEventSession,
  handleEditEventReplyEvent,
  startEditEventCommandEvent,
} from "../commands/edit-event-service";
import type {
  RuntimeChatTransport,
  RuntimeCommandEvent,
  RuntimeCommandTransport,
  RuntimeMessageEvent,
  RuntimeReplyPort,
} from "./types";

export async function dispatchRuntimeMessageEvent(
  profile: BotProfile,
  event: RuntimeMessageEvent,
  transport: RuntimeChatTransport,
  replyPort: RuntimeReplyPort
): Promise<void> {
  const schedulingSession = getSchedulingSession(event.conversation.id);
  if (schedulingSession && event.actor.id === schedulingSession.memberDiscordId) {
    await handleSchedulingReplyEvent(profile, event, replyPort, schedulingSession);
    return;
  }

  const editSession = getEditEventSession(event.conversation.id);
  if (editSession && event.actor.id === editSession.memberDiscordId) {
    await handleEditEventReplyEvent(event, replyPort, editSession);
    return;
  }

  await handleRuntimeChatMessage(profile, event, transport);
}

export async function dispatchRuntimeCommandEvent(
  profile: BotProfile,
  event: RuntimeCommandEvent,
  transport: RuntimeCommandTransport
): Promise<void> {
  switch (event.commandName) {
    case "join":
      await handleJoinCommandEvent(profile, event, transport);
      return;
    case "paper-club":
    case "builders-club":
      await startScheduleCommandEvent(profile, event, transport, event.commandName);
      return;
    case "edit-event":
      await startEditEventCommandEvent(event, transport);
      return;
  }
}
