---
name: Event Scheduling
description: "How to handle Paper Club and Builders Club event scheduling via Discord commands."
when_to_use: "When a user runs /paper-club or /builders-club, or asks about upcoming events."
when_not_to_use: "General conversation not about event scheduling."
success_criteria: "Event node created with correct metadata, linked to member, confirmation sent."
---

# Event Scheduling

Paper Club and Builders Club sessions are scheduled via Discord slash commands. Each creates an `event` node in the knowledge graph.

## Weekly Schedule

| Event | Day | Time | Luma |
|-------|-----|------|------|
| Paper Club | Wednesday | 12:00–1:00pm PT | https://luma.com/ls |
| Builders Club | Saturday 8am Sydney (Friday afternoon PT) | ~1–3pm PT Friday (varies with DST) | — |

**Paper Club** runs every **Wednesday at 12pm Pacific**. One session per week — one paper, one presenter.

**Builders Club** runs every **Saturday at 8am Sydney time**, which lands on **Friday afternoon Pacific**. The exact PT hour shifts with daylight saving:
- Sydney AEDT + SF PST (Nov–Mar): Friday 1pm PT
- Sydney AEDT + SF PDT (Mar–Apr): Friday 2pm PT
- Sydney AEST + SF PDT (Apr–Oct): Friday 3pm PT

## Commands

| Command | Purpose |
|---------|---------|
| `/paper-club date:YYYY-MM-DD title:"Paper Title" [paper:URL]` | Schedule a Paper Club session |
| `/builders-club date:YYYY-MM-DD topic:"Session Topic"` | Schedule a Builders Club session |

## Validation Rules

1. **Must be a member.** User must have run `/join` first. If not, reply: "You need to `/join` the graph first before scheduling events."
2. **Date must be future.** Reject past dates with a clear message.
3. **Date format.** Must be `YYYY-MM-DD`. Reject other formats.
4. **Correct day of week.** Paper Club dates must fall on a Wednesday. Builders Club dates must fall on a Saturday (Sydney) / Friday (PT). Reject with: "Paper Club runs on Wednesdays" or "Builders Club runs on Fridays/Saturdays".
5. **No double booking.** Before creating, query for an existing scheduled event on the same date and event_type. If one exists, reply: "That slot is already booked by [presenter]. Try a different week."

### Double-booking check query
```sql
SELECT id, title, json_extract(metadata, '$.presenter_name') AS presenter
FROM nodes
WHERE node_type = 'event'
  AND json_extract(metadata, '$.event_type') = '<event-type>'
  AND json_extract(metadata, '$.event_status') = 'scheduled'
  AND event_date = '<date>'
LIMIT 1
```

## Event Node Structure

Event nodes use `node_type: 'event'` with dimensions `['event', '<event-type>']`.

**Metadata fields:**
- `event_status`: `scheduled` → `completed` (when recording ingested) or `cancelled`
- `event_type`: `paper-club` or `builders-club`
- `presenter_name`: Discord username of the host
- `presenter_discord_id`: Discord user ID
- `presenter_node_id`: Member node ID in the graph
- `paper_url`, `paper_title`: Paper Club only
- `topic`: Builders Club only
- `recording_node_id`: Filled automatically when the recording is ingested
- `scheduled_at`: ISO timestamp of when the scheduling happened

## Lifecycle

```
Member runs /paper-club or /builders-club
  → Check: is the date the correct day of week?
  → Check: is the slot already booked?
  → Event node created (event_status: 'scheduled')
  → Edge: member → event ("hosting Paper Club session")
  → Confirmation reply with date, title, presenter

Later: Recording ingested from LatentSpaceTV
  → Ingestion pipeline matches by date (±3 days) and event_type
  → Edge: recording → event ("recording of Paper Club session")
  → Event metadata updated: event_status → 'completed', recording_node_id set
```

## UI Display

- Events appear in the **Events** sidebar category
- **Upcoming** section: scheduled events, sorted by date ascending, green highlight
- **Past** section: completed events with linked recordings
- Event type shown as badge (Paper Club = purple, Builders Club = amber)

## When Discussing Events

If a user asks about upcoming events, query the graph:
```sql
SELECT id, title, event_date, metadata FROM nodes
WHERE node_type = 'event'
AND json_extract(metadata, '$.event_status') = 'scheduled'
ORDER BY event_date ASC
```

If no upcoming events, say so and mention they can schedule one with `/paper-club` or `/builders-club`.
