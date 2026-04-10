import "dotenv/config";
import readline from "node:readline";
import { loadSkillsContextFromLocalStrict } from "../../skills";
import {
  dispatchRuntimeCommandEvent,
  dispatchRuntimeMessageEvent,
} from "../../core/runtime/dispatch";
import type { RuntimeCommandName } from "../../core/runtime/types";
import type { BotProfile } from "../../types";
import { ConsoleRuntimeClient } from "./client";

const profile: BotProfile = {
  name: "Slop",
  token: "",
  model: process.env.SLOP_MODEL || "anthropic/claude-sonnet-4-6",
};
const client = new ConsoleRuntimeClient();
const skillsContext = loadSkillsContextFromLocalStrict();

function printSystem(message: string): void {
  process.stdout.write(`\x1b[90m${message}\x1b[0m\n`);
}

function printBot(message: string): void {
  process.stdout.write(`\x1b[36m@${client.botUser.username}:\x1b[0m ${message}\n`);
}

function printUser(username: string, message: string): void {
  process.stdout.write(`\x1b[33m@${username}:\x1b[0m ${message}\n`);
}

client.on("systemText", ({ text }) => {
  printSystem(text);
});

client.on("botText", ({ text }) => {
  printBot(text);
});

client.on("threadCreated", ({ thread }) => {
  printSystem(`Thread created: ${thread.name} (${thread.id})`);
  updatePrompt();
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function promptName(): string {
  const conversation = client.getCurrentConversation();
  if (conversation.kind === "thread") {
    return `#${conversation.name} <${conversation.id}> `;
  }
  return `#${conversation.name}> `;
}

function updatePrompt(): void {
  rl.setPrompt(promptName());
  rl.prompt();
}

function printHelp(): void {
  printSystem(
    "Commands: /as <@user|name>, /users, /threads, /switch <id|name>, /join, /paper-club, /builders-club, /edit-event, /help, /quit"
  );
}

async function handleLocalCommand(input: string): Promise<boolean> {
  if (input === "/help") {
    printHelp();
    return true;
  }
  if (input === "/quit" || input === "/exit") {
    rl.close();
    return true;
  }
  if (input.startsWith("/as ")) {
    const nextUser = client.setCurrentUser(input.slice(4).trim().replace(/^@/, ""));
    printSystem(`Switched user to @${nextUser.username}`);
    return true;
  }
  if (input === "/users") {
    const lines = client
      .getUsers()
      .map((user) => `@${user.username} <${user.id}>${user.isBot ? " [bot]" : ""}`);
    printSystem(lines.join("\n"));
    return true;
  }
  if (input === "/threads") {
    const threads = client.listThreads();
    if (!threads.length) {
      printSystem("No threads available in this channel");
      return true;
    }
    const currentId = client.getCurrentConversation().id;
    const lines = threads.map((thread) => {
      const active = thread.id === currentId ? " [current]" : "";
      return `#${thread.name} <${thread.id}>${active}`;
    });
    printSystem(lines.join("\n"));
    return true;
  }
  if (input.startsWith("/switch ")) {
    const target = input.slice("/switch ".length).trim();
    if (!target) {
      printSystem("Usage: /switch <thread-id|thread-name>");
      return true;
    }
    const current = client.getCurrentConversation();
    if (current.kind === "thread" && (target === current.parentId || target === "general")) {
      const conversation = client.setCurrentConversation(current.parentId!);
      if (conversation) printSystem(`Switched to #${conversation.name}`);
      return true;
    }
    const threads = client.listThreads();
    const match = threads.find((thread) => thread.id === target || thread.name === target);
    if (!match) {
      printSystem(`Thread ${target} not found`);
      return true;
    }
    client.setCurrentConversation(match.id);
    printSystem(`Switched to #${match.name}`);
    return true;
  }

  if (
    input === "/join" ||
    input === "/paper-club" ||
    input === "/builders-club" ||
    input === "/edit-event"
  ) {
    const event = client.createCommandEvent(input.slice(1) as RuntimeCommandName);
    try {
      await dispatchRuntimeCommandEvent(
        profile,
        event,
        client.createCommandTransport(event.conversation)
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      printSystem(`Error: ${msg}`);
    }
    return true;
  }

  return false;
}

printSystem("Profile: Slop");
printSystem(`Skills loaded: ${skillsContext.length} chars`);
printSystem(`Channel: #${client.getCurrentConversation().name}`);
printSystem(`Active user: @${client.getCurrentUser().username}`);
printSystem('Mention the bot with "@slop" to begin');
printSystem(
  "Type /help to see local commands. Supported literal local commands: /join, /paper-club, /builders-club, /edit-event"
);
updatePrompt();

rl.on("line", async (line) => {
  const input = line.trim();
  if (!input) {
    updatePrompt();
    return;
  }

  const handled = await handleLocalCommand(input);
  if (handled) {
    updatePrompt();
    return;
  }

  const event = client.createMessageEvent(input);
  await client.sendUserEcho(event);
  printUser(event.actor.username, input);
  try {
    await dispatchRuntimeMessageEvent(
      profile,
      event,
      client.createChatTransport(),
      client.createReplyPort(event)
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    printSystem(`Error: ${msg}`);
  }
  updatePrompt();
});

rl.on("close", () => {
  printSystem("Bye!");
  process.exit(0);
});
