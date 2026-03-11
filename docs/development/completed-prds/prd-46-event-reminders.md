# PRD-46: Event Reminders — Slop posts day-before Paper Club reminder

**Status:** Completed | **Created:** 2026-03-11 | **Updated:** 2026-03-11

## 1. Background

Paper Club coordination is manual. Slop should post a reminder in the Paper Club channel, tag the presenter, and include the paper link.

**Repo:** `latent-space-bots`

## 2. Scope + Constraint

### Product goal

Post one reminder per scheduled Paper Club session before the session date.

### Critical data constraint (current schema)

`event_date` is stored as `YYYY-MM-DD` (date-only), not datetime. Because time-of-day is not stored, true per-event "24 hours before" cannot be computed generically.

### MVP decision

For Paper Club (fixed Wednesday 12:00-1:00pm PT), implement a **daily 12:00pm PT day-before reminder**. This effectively gives a 24h reminder for the current Paper Club schedule.

### Future-proof note

If event times become variable, add `event_datetime_utc` and compute exact reminder windows from that field.

## 3. Plan

1. Add `node-cron` dependency
2. Add Paper Club reminder queries + metadata update helpers in `src/db.ts`
3. Create `src/reminders/index.ts` with timezone-aware scheduler
4. Add durable idempotency (DB-backed, multi-instance safe)
5. Wire reminders in bot startup (`ClientReady`)
6. Add env config + docs
7. Validate with local dry run + production logs

## 4. Implementation Details

### Step 1: Add `node-cron`

```bash
cd latent-space-bots
npm install node-cron
npm install -D @types/node-cron
```

### Step 2: Add reminder DB helpers to `src/db.ts`

Use **paper-club only** filtering and date-only comparison.

```typescript
type EventReminderRow = {
  id: number;
  title: string;
  event_date: string;
  metadata: unknown;
};

async function getPaperClubEventsForDate(db: Client, targetDate: string): Promise<EventReminderRow[]> {
  const result = await db.execute({
    sql: `SELECT id, title, event_date, metadata
          FROM nodes
          WHERE node_type = 'event'
            AND json_extract(metadata, '$.event_status') = 'scheduled'
            AND json_extract(metadata, '$.event_type') = 'paper-club'
            AND event_date = ?
            AND json_extract(metadata, '$.reminded_24h_at') IS NULL
          ORDER BY event_date ASC`,
    args: [targetDate]
  });

  return result.rows as EventReminderRow[];
}
```

### Step 3: Create `src/reminders/index.ts`

Run once per day at noon Pacific time:

```typescript
cron.schedule("0 12 * * *", async () => {
  // timezone: America/Los_Angeles
  // targetDate = tomorrow (PT) in YYYY-MM-DD
  // fetch + attempt send
}, { timezone: "America/Los_Angeles" });
```

Reminder message format:

```text
📅 **Paper Club tomorrow (12pm PT)**

<@presenter> is presenting: **{event title}**

Review the paper and come prepared with questions:
{paper_url}
```

### Step 4: Durable idempotency (required, not optional)

In-memory `Set` is insufficient (fails on restarts and multi-instance deploys). Use DB-backed state in metadata.

Recommended fields:
- `reminded_24h_claimed_at` (ISO string)
- `reminded_24h_claimed_by` (instance id)
- `reminded_24h_at` (ISO string, set only after successful send)
- `reminded_24h_message_id` (Discord message id)

Flow:
1. Read candidates from `getPaperClubEventsForDate(...)`.
2. **Claim row atomically** (`UPDATE ... WHERE reminded_24h_at IS NULL AND reminded_24h_claimed_at IS NULL`).
3. If claim succeeded, send Discord message.
4. On success: set `reminded_24h_at` + `reminded_24h_message_id`, clear claim fields.
5. On failure: clear claim fields for retry.

This prevents duplicate posts across restarts and horizontally scaled bot instances.

### Step 5: Wire up in `src/discord/bot.ts`

Start reminders once in `ClientReady`:

```typescript
client.once(Events.ClientReady, (readyClient) => {
  setupReminders(client, db);
});
```

### Step 6: Config (no hardcoded channel IDs)

Add env vars in `src/config.ts` + `.env.example`:
- `PAPER_CLUB_CHANNEL_ID` (required for reminders)
- `REMINDERS_ENABLED` (`true`/`false`, default `true`)
- `BOT_INSTANCE_ID` (optional; fallback to hostname/pid)

Do not hardcode `1107320650961518663` in code.

### Step 7: Validation checklist

1. Create a scheduled `paper-club` event for tomorrow's date.
2. Run reminder handler in dry-run/log mode.
3. Confirm one message posts in configured channel.
4. Restart bot and re-run: no duplicate.
5. Simulate two workers: only one claims/sends.

## 5. Dependency / Ordering Notes

- **PRD-45 race condition remains open** (non-atomic event scheduling). Duplicate scheduled events for the same slot can still be created until PRD-45 Step 1 lands. Reminders will then post once per duplicate event node.
- Recommendation: land PRD-45 Step 1 (atomic slot booking) before or alongside PRD-46.

## 6. Open Questions / Follow-ups

- **Builders Club reminders:** same pattern, separate channel id.
- **Second reminder (e.g., 30min):** requires datetime field for true timing.
- **Message style:** plain text is fine for MVP; embeds optional later.

## COMPLETED

**Date:** 2026-03-11

**Repo:** `latent-space-bots`

**Shipped commit:** `2c8fc01` on `main`

### What was implemented

1. Added scheduler dependency:
   - `node-cron` + `@types/node-cron`
2. Added DB reminder helpers in `src/db.ts`:
   - `getPaperClubEventsForDate(...)`
   - `claimPaperClub24hReminder(...)`
   - `finalizePaperClub24hReminder(...)`
   - `releasePaperClub24hReminderClaim(...)`
3. Added `src/reminders/index.ts`:
   - daily cron at `0 12 * * *` in `America/Los_Angeles`
   - computes tomorrow date in PT and checks paper-club scheduled events only
   - posts reminder with presenter mention + paper link
4. Wired reminder startup in `src/discord/bot.ts` on `ClientReady`
5. Added env-config and defaults in `src/config.ts`:
   - `PAPER_CLUB_CHANNEL_ID`
   - `REMINDERS_ENABLED` (default `true`)
   - `REMINDERS_TIMEZONE` (default `America/Los_Angeles`)
   - `BOT_INSTANCE_ID` (fallback host/pid)
6. Updated `.env.example` and `README.md` docs

### Runtime verification

- Bot startup logs confirm scheduler activation:
  - `[reminders] Scheduler started (daily 12:00 America/Los_Angeles)`
- Reminder target channel is config-driven and single-channel:
  - uses `PAPER_CLUB_CHANNEL_ID` only
- Reminder query scope is restricted:
  - `node_type='event'`
  - `metadata.event_type='paper-club'`
  - `metadata.event_status='scheduled'`

### Notes

- Reminders are durable across restart/multi-instance via DB-backed claim/finalize metadata.
- Known adjacent risk remains in PRD-45: if duplicate scheduled event rows exist for same slot, reminders run once per duplicate event row until atomic scheduling lands.

---
