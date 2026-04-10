import type { BotProfile } from "../../types";

export type RuntimeProfileName = BotProfile["name"];

export type RuntimeConversation = {
  id: string;
  name: string;
  kind: "channel" | "thread";
  parentId?: string;
  ownerProfile?: RuntimeProfileName | null;
};

export type RuntimeActor = {
  id: string;
  username: string;
  globalName?: string;
  avatarUrl?: string;
  isBot?: boolean;
  isWebhook?: boolean;
};

export type RuntimeMessageEvent = {
  kind: "message";
  id: string;
  actor: RuntimeActor;
  conversation: RuntimeConversation;
  content: string;
  cleanContent: string;
  inGuild: boolean;
  allowed: boolean;
  mentionsBot: boolean;
  replyToBot: boolean;
};

export type RuntimeCommandName =
  | "join"
  | "paper-club"
  | "builders-club"
  | "edit-event";

export type RuntimeCommandEvent = {
  kind: "command";
  id: string;
  actor: RuntimeActor;
  conversation: RuntimeConversation;
  commandName: RuntimeCommandName;
};

export type RuntimeMessageRef = {
  id: string;
};

export interface RuntimeReplyPort {
  conversation: RuntimeConversation;
  messageId: string;
  reply(text: string): Promise<void>;
}

export interface RuntimeChatTransport {
  ensureReplyConversation(
    sourceConversation: RuntimeConversation,
    seedText: string,
    botName: RuntimeProfileName
  ): Promise<RuntimeConversation>;
  sendTyping(conversation: RuntimeConversation): Promise<void>;
  sendText(conversation: RuntimeConversation, text: string): Promise<RuntimeMessageRef | void>;
}

export interface RuntimeCommandTransport {
  conversation: RuntimeConversation;
  editReply(text: string): Promise<RuntimeMessageRef>;
  followUp(text: string): Promise<void>;
  openThread(options: {
    name: string;
    startMessageId: string;
    reason: string;
  }): Promise<RuntimeConversation | null>;
  sendText(conversation: RuntimeConversation, text: string): Promise<RuntimeMessageRef | void>;
  sendWarning?(conversation: RuntimeConversation, text: string): Promise<void>;
}

export function shouldRespondToRuntimeMessage(
  event: RuntimeMessageEvent,
  profileName: RuntimeProfileName
): boolean {
  if (!event.inGuild) return false;

  if (event.conversation.ownerProfile) {
    if (event.conversation.ownerProfile !== profileName) return false;
    if (event.actor.isBot && !event.actor.isWebhook) return false;
    return true;
  }

  if (event.actor.isBot && !event.actor.isWebhook) return false;
  return event.mentionsBot || event.replyToBot;
}

export function defaultPromptFromCleanContent(cleanContent: string): string {
  const trimmed = cleanContent.trim();
  return trimmed || "Give a concise update based on the most relevant Latent Space context.";
}
