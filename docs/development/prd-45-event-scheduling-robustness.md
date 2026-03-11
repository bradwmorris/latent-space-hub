# PRD-45: Event Scheduling Robustness — slash command hardening, hub deep links, event editing

## Background

Audit of `/join`, `/paper-club`, and `/builders-club` slash commands revealed critical robustness gaps: race conditions on slot booking (double-booking possible), no input validation, in-memory session loss on restart, no tests. Additionally, two new capabilities requested: (1) Slop shares a hub link after scheduling, (2) event owners can edit their scheduled events.

**Repos:** `latent-space-bots` (primary), `latent-space-hub` (Steps 5-6)

---

## Plan

1. **Atomic slot booking** — eliminate race condition on event creation
2. **Input validation & sanitization** — URLs, titles, dates
3. **Session robustness** — dedup, timeout warnings, thread fallback fix
4. **`/join` hardening** — metadata update verification, timeout handling
5. **Hub deep link after scheduling** — Slop posts link to Paper Club / Builders Club view
6. **Event editing** — owner can update their scheduled event (title, paper, topic, date)
7. **Tests** — cover critical paths

---

## Implementation Details

### Step 1: Atomic slot booking (bots repo)

**Problem:** `getBookedDates()` and `createEventNode()` are two separate calls. Between them, another user can book the same slot.

**Fix in `src/db.ts`:**

```typescript
async function createEventNodeAtomic(params: CreateEventParams): Promise<{ nodeId: number; alreadyBooked: boolean }> {
  // Single batch: check + insert in one Turso call
  // Use Turso batch() to run both statements atomically
  const result = await turso.batch([
    {
      sql: `SELECT id FROM nodes WHERE node_type = 'event'
            AND json_extract(metadata, '$.event_status') = 'scheduled'
            AND json_extract(metadata, '$.event_type') = ?
            AND event_date = ?`,
      args: [params.eventType, params.eventDate]
    },
    {
      sql: `INSERT INTO nodes (title, node_type, event_date, metadata, created_at, updated_at)
            SELECT ?, 'event', ?, ?, datetime('now'), datetime('now')
            WHERE NOT EXISTS (
              SELECT 1 FROM nodes WHERE node_type = 'event'
                AND json_extract(metadata, '$.event_status') = 'scheduled'
                AND json_extract(metadata, '$.event_type') = ?
                AND event_date = ?
            )`,
      args: [params.title, params.eventDate, JSON.stringify(params.metadata), params.eventType, params.eventDate]
    }
  ], "write");

  const inserted = result[1].rowsAffected > 0;
  if (!inserted) return { nodeId: 0, alreadyBooked: true };
  return { nodeId: Number(result[1].lastInsertRowid), alreadyBooked: false };
}
```

**Update `src/commands/schedule.ts`:**
- Replace `createEventNode()` call with `createEventNodeAtomic()`
- If `alreadyBooked: true`, tell user "That slot was just taken — pick another date" and re-show available dates

### Step 2: Input validation & sanitization (bots repo)

**Add `src/commands/validation.ts`:**

```typescript
// Paper URL validation
function validatePaperUrl(url: string): { valid: boolean; url: string; error?: string } {
  // Must be http/https, max 2048 chars
  // Must match known paper hosts OR be a general URL
  // Strip tracking params
}

// Title validation
function validateEventTitle(title: string): { valid: boolean; title: string; error?: string } {
  // 3-200 chars, no control characters
  // Trim whitespace
}

// Date validation
function validateEventDate(date: string): { valid: boolean; error?: string } {
  // Must be in the future
  // Must be correct day of week (Wed for paper-club, Fri for builders-club)
}
```

**Update `src/commands/schedule.ts`:**
- Validate title after extraction (trim + length check)
- Validate paper URL if provided
- Validate chosen date is still in the future at creation time
- Fix reply matching: `text.trim().match(/^(\d)\s*(.*)/s)` — add trim()

### Step 3: Session robustness (bots repo)

**3a: In-flight deduplication for `/paper-club` and `/builders-club`**

Add scheduling-in-flight set (same pattern as `/join`):
```typescript
const schedulingInFlight = new Set<string>();
// Key: `${userId}:${command}` — one active session per user per command type
```

**3b: Session timeout warning**

Before the 10-minute timeout fires, send a message at 8 minutes:
```typescript
session.warningTimeout = setTimeout(() => {
  thread.send("Heads up — this scheduling session expires in 2 minutes. Reply with your choice to continue.");
}, 8 * 60 * 1000);
```

**3c: Thread fallback collision fix**

When thread creation fails and session falls back to `channelId`, check if a session already exists for that channel. If so, reject with "Another scheduling session is active in this channel — try again in a few minutes."

### Step 4: `/join` hardening (bots repo)

**4a: Verify metadata update**
After `updateMemberNode()`, confirm the returned result indicates rows affected > 0. If not, log warning and retry once.

**4b: Avatar URL safety**
Wrap `displayAvatarURL()` in try/catch — fall back to null if it throws.

**4c: Timeout handling**
Add AbortController with 10-second timeout on database calls. If timeout, tell user "Database is slow right now — please try again in a moment."

**4d: Retry guidance**
Change error message from generic to: "Something went wrong — try `/join` again in a moment. If it keeps failing, let us know in #support."

### Step 5: Hub deep link after scheduling (bots repo + hub repo)

**Goal:** After Slop creates an event, post a message with a link to the hub view.

**Bot side (`src/commands/schedule.ts`):**

After successful `createEventNodeAtomic()`, send follow-up message:
```typescript
const hubBaseUrl = "https://latent-space-hub.vercel.app";
const eventType = isPaperClub ? "paper-club" : "builders-club";
const categoryLabel = isPaperClub ? "Paper Club" : "Builders Club";

// Option A: Direct category deep link (if hub supports query params)
const deepLink = `${hubBaseUrl}/?view=${eventType}`;

// Option B: Fallback — just the base URL with instructions
const fallbackMessage = `View upcoming sessions at ${hubBaseUrl} — open **${categoryLabel}** from the sidebar.`;

await thread.send(
  `Scheduled! ${deepLink ? `[View in the Hub](${deepLink})` : fallbackMessage}`
);
```

**Hub side (if deep link support needed):**

Check if `ThreePanelLayout.tsx` already supports URL-based category selection. If not, add query param handling:
- Read `?view=paper-club` from URL on mount
- Set the active sidebar category accordingly
- This is a nice-to-have — the fallback message works fine without it

### Step 6: Event editing — owner can update their scheduled event

**6a: Bot command: `/edit-event` (bots repo)**

New slash command or subcommand. Flow:
1. User runs `/edit-event` (or replies "edit" in their scheduling thread)
2. Bot looks up the user's scheduled events: `SELECT * FROM nodes WHERE node_type='event' AND json_extract(metadata, '$.event_status')='scheduled' AND json_extract(metadata, '$.presenter_discord_id')=?`
3. If no events: "You don't have any upcoming scheduled events."
4. If one event: show details, ask what to change
5. If multiple: show numbered list, user picks one
6. Editable fields:
   - **Title** (paper title / topic)
   - **Paper URL** (paper-club only) — add/change/remove
   - **Date** — reschedule to different available slot (uses same availability check)
   - **Cancel** — sets `event_status='cancelled'`
7. Updates node via `UPDATE nodes SET ... WHERE id = ? AND json_extract(metadata, '$.presenter_discord_id') = ?` (ownership check in SQL)

**6b: Add `updateEventNode()` to `src/db.ts` (bots repo):**

```typescript
async function updateEventNode(nodeId: number, presenterDiscordId: string, updates: Partial<EventUpdates>): Promise<boolean> {
  // Ownership-checked update
  // Only update fields that are provided
  // Validate new date is available if date changed (atomic check)
  // Return false if node not found or not owned by this user
}
```

**6c: Hub API — PATCH `/api/nodes/[id]` already exists**

Verify the existing node update API works for event metadata changes. The bot's direct Turso access handles this, but the hub API should also support it for future use.

### Step 7: Tests (bots repo)

**Add `src/__tests__/` with vitest or similar:**

Priority test cases:
1. **Slot booking race condition** — two concurrent `createEventNodeAtomic()` for same date, only one succeeds
2. **Input validation** — malformed URLs rejected, title length enforced, past dates rejected
3. **Session deduplication** — second `/paper-club` from same user rejected while session active
4. **Member creation race** — concurrent `/join` calls produce exactly one member node
5. **Date generation** — `getNextDatesForDay()` returns correct days, skips booked slots
6. **Reply parsing** — leading/trailing spaces, invalid numbers, empty titles
7. **Ownership check** — `updateEventNode()` rejects updates from non-owner

---

## Open Questions / Notes

- **PRD-40 (bot-write-guardrails) overlap:** Step 1 (atomic writes) and Step 4 (timeout handling) relate to guardrails work. This PRD is scoped to event scheduling specifically — PRD-40 handles the general write policy framework. They can be done in either order; if PRD-40 lands first, Steps 1/4 should use its `executeWrite()` wrapper.
- **Turso batch atomicity:** Turso's `batch("write")` runs statements sequentially in a single HTTP call with implicit transaction. Confirm this provides the atomicity guarantee needed for Step 1.
- **`/edit-event` vs thread-based editing:** Slash command is more discoverable. Thread-based ("reply edit in your scheduling thread") is more contextual but harder to implement (threads may be archived). Recommend slash command.
- **Deep link query params:** If adding `?view=paper-club` support to the hub is low-effort, do it. If not, the fallback message ("open Paper Club from the sidebar") is fine for v1.

---

## COMPLETED

**Status:** Completed  
**Date:** 2026-03-11  
**Repos:** `latent-space-bots`, `latent-space-hub`

### Shipped commits

- `latent-space-bots`: `7b1dc8f` (core implementation), `f5ebade` (runtime skills update)
- `latent-space-hub`: `bc9c5a3` (deep links + backlog/PRD sync), `e2d4674` (skills/docs update)

### What was implemented

#### 1) Atomic slot booking

- Added `ensureScheduledEventSlotIndex()` in `latent-space-bots/src/db.ts`
  - Creates unique index for scheduled slots by `(event_date, metadata.event_type)` on `node_type='event'`.
- Added `createEventNodeAtomic()` in `latent-space-bots/src/db.ts`
  - Uses insert + unique-constraint handling to return `{ alreadyBooked: true }` safely under race.
- Startup now ensures the unique index exists in `latent-space-bots/src/index.ts`.

**Note:** Implementation uses a DB uniqueness constraint + error handling instead of Turso batch `SELECT+INSERT`. This still guarantees one winner under concurrency.

#### 2) Input validation and sanitization

- Added `latent-space-bots/src/commands/validation.ts`:
  - `validatePaperUrl()` (http/https only, max length, strips tracking params)
  - `validateEventTitle()` (trim/collapse whitespace, length and control-char checks)
  - `validateEventDate()` (strict `YYYY-MM-DD`, future date, weekday check by event type)
- Wired validation into scheduling flow in `latent-space-bots/src/commands/schedule.ts`.

#### 3) Session robustness

- Added per-user in-flight dedupe for scheduling commands.
- Added 8-minute warning + 10-minute session expiry cleanup.
- Added channel fallback collision check if thread creation fails.
- Added cleaner session timer lifecycle management.

#### 4) `/join` hardening

- `updateMemberNode()` now returns rows-affected count.
- `/join` now:
  - verifies metadata update success and retries once when needed,
  - wraps DB operations with 10-second timeout helper,
  - uses safe avatar URL fallback,
  - returns improved retry/support guidance on failure.

#### 5) Hub deep link after scheduling

- Bot now posts deep link after successful schedule:
  - `${HUB_BASE_URL}/?type=paper-club` or `${HUB_BASE_URL}/?type=builders-club`
- Added `HUB_BASE_URL` config + `.env.example` entry in bots repo.
- Hub now supports deep-link category selection on load:
  - `latent-space-hub/src/components/layout/ThreePanelLayout.tsx`
  - Accepts both `?type=` and `?view=`.

#### 6) Event editing (`/edit-event`)

- Added new slash command registration for `/edit-event`.
- Added interactive edit flow in `latent-space-bots/src/commands/edit-event.ts`:
  - list owned scheduled events,
  - select event,
  - change title/topic,
  - update/remove paper URL (paper-club),
  - reschedule date with availability checks,
  - cancel event.
- Added DB helpers:
  - `getScheduledEventsByPresenter()`
  - `updateEventNode()` with ownership guard and booked-slot conflict handling.
- Integrated message handling in `latent-space-bots/src/discord/bot.ts`.

#### 7) Tests

- Added Vitest to `latent-space-bots`.
- Added tests:
  - `src/__tests__/validation.test.ts`
  - `src/__tests__/schedule.test.ts`
- Added pure date helper module `src/commands/schedulingDates.ts` for isolated testing.

### Additional related improvements completed

- Reminder robustness improvements (adjacent to PRD-46 and called out as risk during review):
  - stale-claim recovery window in DB claim query,
  - safer send/finalize sequencing to reduce duplicate or stuck reminders,
  - implemented in `latent-space-bots/src/db.ts` and `latent-space-bots/src/reminders/index.ts`.
- Runtime skill updates in bots (`skills/start-here.md`, `skills/event-scheduling.md`) to include `/edit-event`.
- Hub docs/skills updates to keep guidance aligned with shipped behavior:
  - `src/config/skills/slop/start-here.md`
  - `src/config/skills/slop/event-scheduling.md`
  - `src/config/docs/slop-bot.md`
  - `src/config/docs/tools.md`
  - `src/config/docs/getting-started-contribute-with-slash-commands.md`
  - `src/config/docs/getting-started-sign-up-for-sessions.md`
  - `AGENTS.md` (event-scheduling scope note)

### Validation run

- `latent-space-bots`
  - `npm run build` passed
  - `npm test` passed (`5` tests)
- `latent-space-hub`
  - `npm run type-check` passed
