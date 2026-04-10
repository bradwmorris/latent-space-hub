import { EventEmitter } from "node:events";
import type {
  RuntimeActor,
  RuntimeChatTransport,
  RuntimeCommandEvent,
  RuntimeCommandName,
  RuntimeCommandTransport,
  RuntimeConversation,
  RuntimeMessageEvent,
  RuntimeMessageRef,
  RuntimeReplyPort,
} from "../../core/runtime/types";

type ConsoleConversationRecord = RuntimeConversation & {
  threads: Map<string, ConsoleConversationRecord>;
};

export class ConsoleRuntimeClient extends EventEmitter {
  readonly botProfileName = "Slop" as const;
  readonly botHandle = "slop";
  readonly botUser: RuntimeActor = {
    id: "bot-slop",
    username: this.botHandle,
    globalName: "Slop",
    isBot: true,
  };

  private users = new Map<string, RuntimeActor>();
  private usernameIndex = new Map<string, string>();
  private conversations = new Map<string, ConsoleConversationRecord>();
  private nextMessageId = 1;
  private nextThreadId = 1;
  private currentConversationId: string;
  private currentUserId: string;

  constructor() {
    super();
    this.users.set(this.botUser.id, this.botUser);
    this.usernameIndex.set(this.botUser.username.toLowerCase(), this.botUser.id);

    const general = this.createChannel({ id: "c-1", name: "general" });
    this.currentConversationId = general.id;
    this.currentUserId = this.ensureUser("alice").id;
  }

  createChannel(options: { id: string; name: string }): RuntimeConversation {
    const record: ConsoleConversationRecord = {
      id: options.id,
      name: options.name,
      kind: "channel",
      ownerProfile: null,
      threads: new Map(),
    };
    this.conversations.set(record.id, record);
    return record;
  }

  ensureUser(username: string): RuntimeActor {
    const normalized = username.trim().replace(/^@/, "").toLowerCase();
    const existingId = this.usernameIndex.get(normalized);
    if (existingId) return this.users.get(existingId)!;

    const actor: RuntimeActor = {
      id: `u-${this.users.size + 1}`,
      username: normalized,
      globalName: normalized,
      isBot: false,
    };
    this.users.set(actor.id, actor);
    this.usernameIndex.set(normalized, actor.id);
    return actor;
  }

  getUsers(): RuntimeActor[] {
    return [...this.users.values()];
  }

  getCurrentUser(): RuntimeActor {
    return this.users.get(this.currentUserId)!;
  }

  setCurrentUser(username: string): RuntimeActor {
    const user = this.ensureUser(username);
    this.currentUserId = user.id;
    return user;
  }

  getCurrentConversation(): RuntimeConversation {
    return this.conversations.get(this.currentConversationId)!;
  }

  setCurrentConversation(conversationId: string): RuntimeConversation | null {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return null;
    this.currentConversationId = conversationId;
    return conversation;
  }

  listThreads(baseConversation?: RuntimeConversation): RuntimeConversation[] {
    const current = baseConversation || this.getCurrentConversation();
    const root =
      current.kind === "thread" && current.parentId
        ? this.conversations.get(current.parentId)
        : this.conversations.get(current.id);
    if (!root) return [];
    return [...root.threads.values()];
  }

  createMessageEvent(input: string): RuntimeMessageEvent {
    const conversation = this.getCurrentConversation();
    const actor = this.getCurrentUser();
    const botMentionRegex = new RegExp(`(^|\\s)@${this.botHandle}(?=\\s|$)`, "ig");
    const mentionsBot = botMentionRegex.test(input);
    const cleanContent = input.replace(botMentionRegex, " ").trim();

    return {
      kind: "message",
      id: this.nextMessageRef().id,
      actor,
      conversation,
      content: input,
      cleanContent,
      inGuild: true,
      allowed: true,
      mentionsBot,
      replyToBot: false,
    };
  }

  createCommandEvent(commandName: RuntimeCommandName): RuntimeCommandEvent {
    return {
      kind: "command",
      id: this.nextMessageRef().id,
      actor: this.getCurrentUser(),
      conversation: this.getCurrentConversation(),
      commandName,
    };
  }

  createReplyPort(event: RuntimeMessageEvent): RuntimeReplyPort {
    return {
      conversation: event.conversation,
      messageId: event.id,
      reply: async (text: string) => {
        await this.sendBotText(event.conversation, text);
      },
    };
  }

  createChatTransport(): RuntimeChatTransport {
    return {
      ensureReplyConversation: async (sourceConversation, seedText, botName) => {
        if (sourceConversation.kind === "thread") return sourceConversation;
        return this.openThread(sourceConversation, `${botName}: ${seedText.trim().replace(/\s+/g, " ").slice(0, 40) || "discussion"}`);
      },
      sendTyping: async () => {},
      sendText: async (conversation, text) => {
        return this.sendBotText(conversation, text);
      },
    };
  }

  createCommandTransport(conversation: RuntimeConversation): RuntimeCommandTransport {
    return {
      conversation,
      editReply: async (text: string) => {
        return this.sendSystemText(conversation, text);
      },
      followUp: async (text: string) => {
        await this.sendSystemText(conversation, text);
      },
      openThread: async ({ name }) => {
        if (conversation.kind === "thread") return null;
        return this.openThread(conversation, name);
      },
      sendText: async (targetConversation, text) => {
        return this.sendBotText(targetConversation, text);
      },
      sendWarning: async (targetConversation, text) => {
        await this.sendSystemText(targetConversation, text);
      },
    };
  }

  async sendUserEcho(event: RuntimeMessageEvent): Promise<void> {
    this.emit("userText", { actor: event.actor, text: event.content });
  }

  async sendSystemText(
    conversation: RuntimeConversation,
    text: string
  ): Promise<RuntimeMessageRef> {
    const ref = this.nextMessageRef();
    this.emit("systemText", { conversation, text });
    return ref;
  }

  async sendBotText(
    conversation: RuntimeConversation,
    text: string
  ): Promise<RuntimeMessageRef> {
    const ref = this.nextMessageRef();
    this.emit("botText", { conversation, text });
    return ref;
  }

  private openThread(
    parentConversation: RuntimeConversation,
    name: string
  ): RuntimeConversation {
    const parent = this.conversations.get(parentConversation.id);
    if (!parent) return parentConversation;

    const thread: ConsoleConversationRecord = {
      id: `t-${this.nextThreadId++}`,
      name,
      kind: "thread",
      parentId: parent.id,
      ownerProfile: this.botProfileName,
      threads: new Map(),
    };
    parent.threads.set(thread.id, thread);
    this.conversations.set(thread.id, thread);
    this.currentConversationId = thread.id;
    this.emit("threadCreated", { parent, thread });
    return thread;
  }

  private nextMessageRef(): RuntimeMessageRef {
    return { id: `m-${this.nextMessageId++}` };
  }
}
