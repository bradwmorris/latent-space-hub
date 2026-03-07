# PRD 32: Paper Club Scheduling & Event Nodes

**Status:** Draft | **Created:** 2026-03-07

## 1. Background

Paper Club is a recurring community event where members present and discuss academic papers. Currently, the cron ingestion pipeline only captures Paper Club **after the fact** — it picks up the YouTube recording from LatentSpaceTV and creates a `paper-club` node for the video.

We need to support the **scheduling side**: members should be able to schedule themselves to host a Paper Club session. This creates a forward-looking "event" node that represents the upcoming session. When the recording is eventually ingested by the cron, it gets linked to this event node — connecting the plan to the outcome.

### Current flow (recording only)
```
LatentSpaceTV uploads recording
    -> cron discovers via RSS
    -> classifyLatentSpaceTV() detects "paper club" in title
    -> creates paper-club node with video link + transcript
```

### Target flow (scheduling + recording)
```
Member schedules Paper Club via /paper-club command or web UI
    -> creates paper-club-event node (upcoming, no recording yet)
    -> event visible in hub (date, presenter, paper title/link)

Later: LatentSpaceTV uploads recording
    -> cron discovers via RSS
    -> creates paper-club node (recording)
    -> auto-links recording node -> event node via edge
```

## 2. Plan

1. Add `paper-club-event` as a node concept (using existing `paper-club` type with metadata distinction)
2. Create scheduling UI / Discord command
3. Show upcoming events in the hub
4. Auto-link recordings to their event nodes when ingested

## 3. Implementation Details

### Step 1: Event node structure

Paper Club events use the existing `paper-club` node type but with metadata that distinguishes scheduled events from recordings.

**Event node shape:**
```
title:       "Paper Club: [Paper Title]"
node_type:   "paper-club"
event_date:  "2026-03-14" (the scheduled date)
link:        [URL to the paper being discussed]
description: "Hosted by [Member Name]. [1-2 sentence paper summary]"
dimensions:  ["paper-club"]
metadata: {
  event_status: "scheduled" | "completed" | "cancelled",
  presenter_name: "Brad Morris",
  presenter_discord_id: "123456789",
  presenter_node_id: 42,          // member node ID if they've /joined
  paper_url: "https://arxiv.org/abs/...",
  paper_title: "Attention Is All You Need",
  recording_node_id: null,        // filled when recording is linked
  scheduled_at: "2026-03-07T18:00:00Z"  // when the scheduling happened
}
```

**No schema changes needed.** This uses existing `nodes` table columns + JSON metadata.

### Step 2: Discord slash command — `/paper-club`

**Repo:** `latent-space-bots`

Add a `/paper-club` slash command:
```
/paper-club date:2026-03-14 paper:https://arxiv.org/abs/... title:Attention Is All You Need
```

Parameters:
| Param | Required | Description |
|-------|----------|-------------|
| `date` | Yes | Session date (YYYY-MM-DD) |
| `paper` | Yes | URL to the paper |
| `title` | Yes | Paper title |

**Handler logic:**
1. Look up the user's member node (require `/join` first)
2. Check for duplicate (same date + same presenter = reject)
3. Create the event node via `ls_add_node` MCP tool
4. Create edge: member node -> event node ("hosting paper club")
5. Reply with confirmation embed showing date, paper, presenter
6. Post announcement in configured channel (optional)

**Validation:**
- Date must be in the future
- Max 1 scheduled event per member at a time (can't hoard slots)
- Paper URL must be a valid URL

### Step 3: Web UI — upcoming events display

**File:** `src/components/dashboard/` or a new section

Show upcoming Paper Club events on the dashboard or in the Paper Club category view.

**Option A: Dashboard card**
Add an "Upcoming Paper Club" section to the dashboard showing the next 3 scheduled sessions:
```
Upcoming Paper Club
---
Mar 14 — "Attention Is All You Need" — Brad Morris
Mar 21 — "Scaling Laws for Neural LMs" — Jane Doe
Mar 28 — [Open slot]
```

**Option B: Category view enhancement**
In the Paper Club category view, show scheduled events at the top (sorted by date ascending), then past recordings below (sorted by date descending). Distinguish visually — scheduled events get a "Upcoming" badge or different background.

Recommend **Option B** — keeps it in the natural place users would look, no dashboard clutter.

**Implementation:**
- Filter paper-club nodes where `metadata.event_status = 'scheduled'` and `event_date >= today`
- Sort ascending by event_date
- Display with presenter name, paper title, date
- Visual distinction from recorded sessions (badge, icon, or subtle background)

### Step 4: Auto-link recordings to events

**File:** `src/services/ingestion/processing.ts`

When the cron ingests a Paper Club recording from LatentSpaceTV:

1. After creating the recording node, search for matching event nodes:
   ```sql
   SELECT id, metadata FROM nodes
   WHERE node_type = 'paper-club'
   AND json_extract(metadata, '$.event_status') = 'scheduled'
   AND event_date BETWEEN date(recording_date, '-3 days') AND date(recording_date, '+3 days')
   ```
2. Match by date proximity (within 3 days) — Paper Club dates may shift slightly
3. If a match is found:
   - Create edge: recording node -> event node ("recording of scheduled session")
   - Update event node metadata: `event_status: 'completed'`, `recording_node_id: [recording node ID]`
4. If no match: just create the recording node as normal (no event was scheduled)

**Matching heuristic:** Date proximity is the primary signal. If multiple events match (unlikely), prefer exact date match, then closest date.

### Step 5: Scheduling via web UI (future / optional)

If we want to allow scheduling from the web app (not just Discord):

**File:** `app/api/paper-club/schedule/route.ts`

POST endpoint that creates the event node. Would need auth (member must be logged in / identified). This is lower priority — the Discord command covers the main use case since the community lives there.

## 4. Files

| File | Action |
|------|--------|
| `latent-space-bots/src/index.ts` | Add `/paper-club` slash command + handler |
| `latent-space-bots/src/mcpGraphClient.ts` | Add `createPaperClubEvent()` helper method |
| `src/services/ingestion/processing.ts` | Add event-recording auto-linking logic |
| `src/components/views/ListView.tsx` | Show upcoming badge for scheduled events |
| `src/types/database.ts` | Add `PaperClubEventMetadata` type (optional, for documentation) |

## 5. Open Questions

- Should there be a way to cancel a scheduled session? (`/paper-club cancel`?)
- Should Slop announce upcoming Paper Club sessions automatically? (e.g., 24h before)
- Do we want a cap on how far in advance someone can schedule? (e.g., max 4 weeks out)
- Should the web UI allow scheduling, or is Discord-only sufficient for now?
- What channel should the scheduling confirmation post to? `#paper-club`? `#announcements`?

---

**When complete:** Add `## COMPLETED` header with date and summary.

---

## COMPLETED (latent-space-hub parts)
**Date:** 2026-03-07
**What was delivered:**

### New `event` node type
- Added `'event'` to `NodeType` — first-class events in the knowledge graph
- Added `EventMetadata` interface (`event_status`, `event_type`, presenter info, `recording_node_id`)
- Events are separate from recordings — each recording (paper-club/builders-club) gets a linked event node
- Added to sidebar as "Events" category with CalendarDays icon

### UI — Upcoming / Past sections in Events view
- `TypeNodeList` splits events into **Upcoming** (scheduled, green highlight) and **Past** (completed) sections
- Event rows show event_type badge (Paper Club = purple, Builders Club = amber)
- Upcoming events: green left border, "Upcoming" badge, presenter name
- `ListView` (feed view): green "Upcoming" badge for event nodes

### Ingestion pipeline
- Recording nodes tagged with `event_status: 'recording'` in metadata
- `linkRecordingToEvent()` searches for matching scheduled `event` nodes (3-day window)
- If no scheduled event found, auto-creates a completed event node and links it
- Works for both paper-club and builders-club recordings

### Backfill script
- `npx tsx scripts/backfill-event-status.ts` — creates event nodes for all existing recordings
- Tags existing paper-club/builders-club nodes with `event_status: 'recording'`
- Creates edge from recording to event node
- Supports `--dry-run` flag

### Discord slash commands (latent-space-bots repo)
- `/paper-club date:YYYY-MM-DD title:"Paper Title" [paper:URL]` — schedules Paper Club event
- `/builders-club date:YYYY-MM-DD topic:"Session Topic"` — schedules Builders Club event
- Validates: member exists, date is future, correct day of week (Wed for PC, Fri for BC)
- Double-booking prevention: queries graph for existing scheduled event on same date+type
- Creates event node via MCP, links to member, sends confirmation

### Event scheduling skill
- `src/config/skills/event-scheduling.md` — bot-facing skill documenting weekly schedule, validation rules, lifecycle
- Paper Club: Wednesdays 12–1pm PT
- Builders Club: Saturday 8am Sydney (Friday afternoon PT, varies with DST)
