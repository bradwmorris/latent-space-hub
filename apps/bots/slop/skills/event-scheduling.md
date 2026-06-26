---
name: Event Scheduling
skill_group: slop
description: "Paper Club and Builders Club event schedule, commands, and how to query upcoming events."
when_to_use: "When users ask about upcoming events or how to schedule sessions."
when_not_to_use: "General content questions not about events."
success_criteria: "Accurate event info from graph queries. Directs users to slash commands for scheduling."
---

# Event Scheduling

Paper Club and Builders Club sessions are scheduled via Discord slash commands. You (Slop) **cannot schedule events** — the slash commands handle that. Your job is to answer questions about events.

## Weekly Schedule

| Event | Day | Time |
|-------|-----|------|
| Paper Club | Wednesday | 12:00–1:00pm PT |
| Builders Club | Friday afternoon PT / Saturday 8am Sydney | Varies with DST |

## Slash Commands (handled by bot code, not you)

- `/paper-club` — schedule a Paper Club session
- `/builders-club` — schedule a Builders Club session
- `/edit-event` — edit title, paper URL, date, or cancel your own scheduled event
- `/join` — optional; if missing, a profile is auto-created on first scheduling
- Recording intake — mention Slop with "add this recording" plus a YouTube URL. Slop creates or reuses the recording node, marks the matching event completed, and links recording → event. If the match is unclear, Slop asks which event to attach.
- Paper candidate detection — when paper-ish links are shared in configured Paper Club channels, Slop creates/reuses a discussion thread, stores a candidate node, posts a short TLDR, and adds a `Present this at Paper Club` button.

If someone asks you to schedule or edit an event, direct them to the slash command.

## Querying Events

**Upcoming events:**
Use `slop_get_upcoming_events` first.

Type-specific examples:

```json
{ "event_type": "paper-club", "limit": 10 }
```

```json
{ "event_type": "builders-club", "limit": 10 }
```

If you must use SQL:
```sql
SELECT id, title, event_date, json_extract(metadata, '$.event_type') as type,
       json_extract(metadata, '$.presenter_name') as presenter
FROM nodes
WHERE node_type = 'event'
  AND json_extract(metadata, '$.event_status') = 'scheduled'
  AND json_extract(metadata, '$.event_type') = 'paper-club' -- or builders-club
ORDER BY event_date ASC
```

**Important:** Do NOT query `paper-club` or `builders-club` node_types for upcoming sessions. Those are recording nodes. Upcoming sessions are `node_type = 'event'` with `event_status = 'scheduled'`.

If no upcoming events, say so and mention they can schedule one with `/paper-club` or `/builders-club`.

**Recent Paper Club candidate papers:**
Use `slop_get_recent_paper_candidates` first.

Examples:

```json
{ "status": "all", "limit": 10 }
```

```json
{ "status": "open", "limit": 10 }
```

Use `status: "all"` for "recently mentioned papers" or "recent candidates" because candidates that become scheduled are still useful recent paper mentions. Use `status: "open"` only when the user asks for unscheduled papers or papers that still need a presenter.

If you must use SQL:
```sql
SELECT id, title, link, created_at,
       json_extract(metadata, '$.event_status') AS status,
       json_extract(metadata, '$.presenter_status') AS presenter_status,
       json_extract(metadata, '$.source_url') AS source_url,
       json_extract(metadata, '$.discord_thread_id') AS discord_thread_id
FROM nodes
WHERE node_type = 'event'
  AND json_extract(metadata, '$.event_type') = 'paper-club'
  AND json_extract(metadata, '$.created_via') = 'slop-paper-candidate'
ORDER BY datetime(created_at) DESC, id DESC
LIMIT 10
```
