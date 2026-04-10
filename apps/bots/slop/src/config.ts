import { createClient as createLibsqlClient } from "@libsql/client";
import os from "node:os";
import path from "node:path";
import type { Client } from "discord.js";
import type { BotProfile } from "./types";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function isLocalLibsqlUrl(url: string): boolean {
  if (url.startsWith("file:") || url === ":memory:" || url === "file::memory:") return true;
  return !/^[a-z][a-z0-9+.-]*:\/\//i.test(url);
}

function normalizeLibsqlUrl(url: string): string {
  if (!isLocalLibsqlUrl(url) || url.startsWith("file:") || url === ":memory:" || url === "file::memory:") {
    return url;
  }
  return `file:${path.resolve(url)}`;
}

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

const RAW_TURSO_DATABASE_URL = requiredEnv("TURSO_DATABASE_URL");
export const TURSO_DATABASE_URL = normalizeLibsqlUrl(RAW_TURSO_DATABASE_URL);
export const TURSO_AUTH_TOKEN = isLocalLibsqlUrl(RAW_TURSO_DATABASE_URL)
  ? process.env.TURSO_AUTH_TOKEN || ""
  : requiredEnv("TURSO_AUTH_TOKEN");
export const OPENROUTER_API_KEY = requiredEnv("OPENROUTER_API_KEY");

export const SLOP_MODEL = process.env.SLOP_MODEL || "anthropic/claude-sonnet-4-6";
export const DISCORD_TEST_GUILD_ID = process.env.DISCORD_TEST_GUILD_ID || "";
export const ALLOWED_CHANNEL_IDS = new Set(
  (process.env.ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
);
export const USER_RATE_LIMIT_WINDOW_MS = Number(process.env.USER_RATE_LIMIT_WINDOW_MS || 5000);
export const CHANNEL_RATE_LIMIT_WINDOW_MS = Number(process.env.CHANNEL_RATE_LIMIT_WINDOW_MS || 1200);
export const DEBATE_KICKOFF_SECRET = process.env.DEBATE_KICKOFF_SECRET || "";
export const DEBATE_KICKOFF_PORT = Number(process.env.DEBATE_KICKOFF_PORT || 8787);
export const DEBATE_KICKOFF_HOST = process.env.DEBATE_KICKOFF_HOST || "0.0.0.0";
export const BOT_TALK_CHANNEL_ID = process.env.BOT_TALK_CHANNEL_ID || "";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const HUB_BASE_URL = process.env.HUB_BASE_URL || "https://latent-space-hub.vercel.app";
export const REMINDERS_ENABLED = boolFromEnv(process.env.REMINDERS_ENABLED, true);
export const REMINDERS_ONE_HOUR_ENABLED = boolFromEnv(process.env.REMINDERS_ONE_HOUR_ENABLED, true);
export const PAPER_CLUB_CHANNEL_ID = process.env.PAPER_CLUB_CHANNEL_ID || "";
export const REMINDERS_TIMEZONE = process.env.REMINDERS_TIMEZONE || "America/Los_Angeles";
export const BOT_INSTANCE_ID =
  process.env.BOT_INSTANCE_ID ||
  process.env.RAILWAY_REPLICA_ID ||
  `${os.hostname()}:${process.pid}`;

export const clientsByProfile = new Map<BotProfile["name"], Client>();

export const db = isLocalLibsqlUrl(TURSO_DATABASE_URL)
  ? createLibsqlClient({
      url: TURSO_DATABASE_URL,
    })
  : createLibsqlClient({
      url: TURSO_DATABASE_URL,
      authToken: TURSO_AUTH_TOKEN,
    });

export const profiles: BotProfile[] = [
  {
    name: "Slop",
    token: process.env.BOT_TOKEN_SLOP || "",
    model: SLOP_MODEL,
    appId: process.env.BOT_APP_ID_SLOP,
  }
];

export function getProfileByName(name: BotProfile["name"]): BotProfile {
  const profile = profiles.find((p) => p.name === name);
  if (!profile) throw new Error(`Profile not found: ${name}`);
  return profile;
}

export function getReadyClient(name: BotProfile["name"]): Client {
  const client = clientsByProfile.get(name);
  if (!client || !client.isReady()) {
    throw new Error(`${name} client is not ready.`);
  }
  return client;
}
