import type { Client as LibsqlClient } from "@libsql/client";
import type { Client as DiscordClient } from "discord.js";
import cron from "node-cron";
import {
  claimPaperClub1hReminder,
  claimPaperClub24hReminder,
  finalizePaperClub1hReminder,
  finalizePaperClub24hReminder,
  getPaperClubEventsForDateOneHour,
  getPaperClubEventsForDate,
  releasePaperClub1hReminderClaim,
  releasePaperClub24hReminderClaim,
} from "../db";

type ReminderConfig = {
  enabled: boolean;
  oneHourEnabled: boolean;
  paperClubChannelId: string;
  instanceId: string;
  timezone: string;
};

function formatIsoDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Failed to format date parts for reminders.");
  }
  return `${year}-${month}-${day}`;
}

function getTomorrowDateInTimeZone(timeZone: string): string {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return formatIsoDateInTimeZone(tomorrow, timeZone);
}

function getTodayDateInTimeZone(timeZone: string): string {
  return formatIsoDateInTimeZone(new Date(), timeZone);
}

export function setupReminders(client: DiscordClient, db: LibsqlClient, config: ReminderConfig): void {
  if (!config.enabled) {
    console.log("[reminders] Disabled (REMINDERS_ENABLED=false)");
    return;
  }

  if (!config.paperClubChannelId) {
    console.warn("[reminders] PAPER_CLUB_CHANNEL_ID is not set; reminders disabled.");
    return;
  }

  const runReminderJob = async (
    mode: "24h" | "1h",
    targetDate: string,
    headline: string
  ): Promise<void> => {
    try {
      const events = mode === "24h"
        ? await getPaperClubEventsForDate(db, targetDate)
        : await getPaperClubEventsForDateOneHour(db, targetDate);
      if (!events.length) {
        console.log(`[reminders] No ${mode} reminder candidates.`);
        return;
      }

      const channel = await client.channels.fetch(config.paperClubChannelId);
      if (!channel || !channel.isTextBased()) {
        console.warn("[reminders] Paper Club channel missing or not text-based.");
        return;
      }
      const sendChannel = "send" in channel && typeof channel.send === "function" ? channel : null;
      if (!sendChannel) {
        console.warn("[reminders] Paper Club channel does not support sending messages.");
        return;
      }

      for (const event of events) {
        const claimed = mode === "24h"
          ? await claimPaperClub24hReminder(db, event.id, config.instanceId)
          : await claimPaperClub1hReminder(db, event.id, config.instanceId);
        if (!claimed) continue;

        const metadata = (event.metadata && typeof event.metadata === "object" ? event.metadata : {}) as Record<string, unknown>;
        const presenterId = typeof metadata.presenter_discord_id === "string" ? metadata.presenter_discord_id : "";
        const presenterName = typeof metadata.presenter_name === "string" ? metadata.presenter_name : "TBD";
        const paperUrl = typeof metadata.paper_url === "string" ? metadata.paper_url : "";
        const presenterMention = presenterId ? `<@${presenterId}>` : presenterName;
        const paperLine = paperUrl
          ? `\n\nReview the paper and come prepared with questions:\n${paperUrl}`
          : "";
        const notesLine = event.notes ? `\n\n${event.notes}` : "";

        let sentMessageId = "";
        try {
          const sent = await sendChannel.send({
            content:
              `📅 **${headline}**\n\n` +
              `${presenterMention} is presenting: **${event.title}**${paperLine}${notesLine}`,
            allowedMentions: { parse: ["users"] },
          });
          sentMessageId = sent.id;
        } catch (error) {
          if (mode === "24h") {
            await releasePaperClub24hReminderClaim(db, event.id, config.instanceId);
          } else {
            await releasePaperClub1hReminderClaim(db, event.id, config.instanceId);
          }
          console.error(`[reminders] Failed sending ${mode} reminder for event=${event.id}:`, error);
          continue;
        }

        try {
          if (mode === "24h") {
            await finalizePaperClub24hReminder(db, event.id, sentMessageId);
          } else {
            await finalizePaperClub1hReminder(db, event.id, sentMessageId);
          }
          console.log(`[reminders] Sent ${mode} reminder for event=${event.id}`);
        } catch (error) {
          console.error(`[reminders] Reminder sent but finalize failed for ${mode} event=${event.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`[reminders] ${mode} reminder check failed:`, error);
    }
  };

  cron.schedule("0 12 * * *", async () => {
    const targetDate = getTomorrowDateInTimeZone(config.timezone);
    console.log(`[reminders] Checking 24h paper-club reminders for event_date=${targetDate}`);
    await runReminderJob("24h", targetDate, "Paper Club tomorrow");
  }, { timezone: config.timezone });

  if (config.oneHourEnabled) {
    cron.schedule("0 11 * * *", async () => {
      const targetDate = getTodayDateInTimeZone(config.timezone);
      console.log(`[reminders] Checking 1h paper-club reminders for event_date=${targetDate}`);
      await runReminderJob("1h", targetDate, "Paper Club in 1 hour");
    }, { timezone: config.timezone });
  }

  console.log(
    `[reminders] Scheduler started (daily 12:00${config.oneHourEnabled ? " and 11:00" : ""} ${config.timezone})`
  );
}
