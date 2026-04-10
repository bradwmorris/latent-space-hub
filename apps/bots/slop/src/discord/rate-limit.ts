import type { Message } from "discord.js";
import { CHANNEL_RATE_LIMIT_WINDOW_MS, USER_RATE_LIMIT_WINDOW_MS } from "../config";
import type { BotProfile } from "../types";

const rateLimitByUser = new Map<string, number>();
const rateLimitByChannel = new Map<string, number>();

export function withinRateLimit(
  message: Message,
  profileName: BotProfile["name"],
  options?: { ownedThread?: boolean }
): boolean {
  return withinRateLimitByKey(
    profileName,
    message.author.id,
    message.channelId,
    options
  );
}

export function withinRateLimitByKey(
  profileName: BotProfile["name"],
  userId: string,
  conversationId: string,
  options?: { ownedThread?: boolean }
): boolean {
  const now = Date.now();
  const userKey = `${profileName}:${userId}`;
  const channelKey = `${profileName}:${conversationId}`;
  const userLast = rateLimitByUser.get(userKey) || 0;
  const channelLast = rateLimitByChannel.get(channelKey) || 0;
  const ownedThread = Boolean(options?.ownedThread);

  if (!ownedThread && now - userLast < USER_RATE_LIMIT_WINDOW_MS) return false;
  if (now - channelLast < CHANNEL_RATE_LIMIT_WINDOW_MS) return false;

  rateLimitByUser.set(userKey, now);
  rateLimitByChannel.set(channelKey, now);
  return true;
}
