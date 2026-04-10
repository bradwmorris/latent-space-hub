import * as dbOps from "../../db";
import { db } from "../../config";
import { logTrace } from "../../llm/tracing";
import {
  createMemberNodeFromActor,
  isUniqueConstraintError,
  lookupMember,
} from "../../members";
import type { BotProfile, MemberMetadata } from "../../types";
import type {
  RuntimeActor,
  RuntimeCommandEvent,
  RuntimeCommandTransport,
} from "../runtime/types";

const joinInFlight = new Set<string>();
const DB_TIMEOUT_MS = 10_000;

function safeAvatarUrl(actor: RuntimeActor): string | undefined {
  return actor.avatarUrl;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function handleJoinCommandEvent(
  profile: BotProfile,
  event: RuntimeCommandEvent,
  transport: RuntimeCommandTransport
): Promise<void> {
  if (joinInFlight.has(event.actor.id)) {
    await transport.editReply("Already processing your `/join` request. Try again in a few seconds.");
    return;
  }

  joinInFlight.add(event.actor.id);
  const startTime = Date.now();
  const traceSource = {
    userId: event.actor.id,
    username: event.actor.username,
    channelId: event.conversation.id,
    messageId: event.id,
  };

  try {
    const existing = await withTimeout(
      lookupMember(event.actor.id),
      DB_TIMEOUT_MS,
      "lookupMember"
    );
    if (existing) {
      const refreshedMetadata: MemberMetadata = {
        ...existing.metadata,
        discord_id: event.actor.id,
        discord_handle: event.actor.username,
        avatar_url: safeAvatarUrl(event.actor) || existing.metadata.avatar_url,
        last_active: new Date().toISOString(),
      };
      let rows = await withTimeout(
        dbOps.updateMemberNode(db, existing.id, {
          metadata: refreshedMetadata as Record<string, unknown>,
        }),
        DB_TIMEOUT_MS,
        "updateMemberNode"
      );
      if (rows === 0) {
        rows = await withTimeout(
          dbOps.updateMemberNode(db, existing.id, {
            metadata: refreshedMetadata as Record<string, unknown>,
          }),
          DB_TIMEOUT_MS,
          "updateMemberNode retry"
        );
      }
      if (rows === 0) throw new Error("member metadata update had no effect");

      const reply = `You're already in the graph. I've been tracking your interests since ${existing.metadata.joined_at}.`;
      await transport.editReply(reply);
      await logTrace(profile, traceSource, "/join", reply, {
        retrieval_method: "member_lookup",
        context_node_ids: [],
        member_id: existing.id,
        is_slash_command: true,
        slash_command: "join",
        is_kickoff: false,
        latency_ms: Date.now() - startTime,
      });
      return;
    }

    try {
      const newMember = await withTimeout(
        createMemberNodeFromActor(event.actor),
        DB_TIMEOUT_MS,
        "createMemberNodeFromActor"
      );
      const reply =
        "You're in the graph. As we chat, I'll learn what you're into and connect you to relevant content.";
      await transport.editReply(reply);
      await logTrace(profile, traceSource, "/join", reply, {
        retrieval_method: "member_create",
        context_node_ids: [],
        member_id: newMember.id,
        is_slash_command: true,
        slash_command: "join",
        is_kickoff: false,
        latency_ms: Date.now() - startTime,
      });
    } catch (createError) {
      const raced = await withTimeout(
        lookupMember(event.actor.id),
        DB_TIMEOUT_MS,
        "lookupMember after create"
      );
      if (raced && isUniqueConstraintError(createError)) {
        const refreshedMetadata: MemberMetadata = {
          ...raced.metadata,
          discord_id: event.actor.id,
          discord_handle: event.actor.username,
          avatar_url: safeAvatarUrl(event.actor) || raced.metadata.avatar_url,
          last_active: new Date().toISOString(),
        };
        let rows = await withTimeout(
          dbOps.updateMemberNode(db, raced.id, {
            metadata: refreshedMetadata as Record<string, unknown>,
          }),
          DB_TIMEOUT_MS,
          "updateMemberNode raced"
        );
        if (rows === 0) {
          rows = await withTimeout(
            dbOps.updateMemberNode(db, raced.id, {
              metadata: refreshedMetadata as Record<string, unknown>,
            }),
            DB_TIMEOUT_MS,
            "updateMemberNode raced retry"
          );
        }
        if (rows === 0) throw new Error("member metadata update had no effect");

        const reply = `You're already in the graph. I've been tracking your interests since ${raced.metadata.joined_at}.`;
        await transport.editReply(reply);
        await logTrace(profile, traceSource, "/join", reply, {
          retrieval_method: "member_lookup",
          context_node_ids: [],
          member_id: raced.id,
          is_slash_command: true,
          slash_command: "join",
          is_kickoff: false,
          latency_ms: Date.now() - startTime,
        });
        return;
      }
      throw createError;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/timeout/i.test(msg)) {
      await transport.editReply(
        "Database is slow right now. Please try `/join` again in a moment."
      );
      return;
    }
    await transport.editReply(
      "Something went wrong. Try `/join` again in a moment. If it keeps failing, let us know in #support."
    );
  } finally {
    joinInFlight.delete(event.actor.id);
  }
}
