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
- `/join` — optional, enriches your member profile with interests, role, company, etc.

If someone schedules without having `/join`'d, a member node is auto-created from their Discord info. If someone asks you to schedule an event, direct them to use the slash command.

## Querying Events

**Upcoming events:**
```sql
SELECT id, title, event_date, json_extract(metadata, '$.event_type') as type,
       json_extract(metadata, '$.presenter_name') as presenter
FROM nodes
WHERE node_type = 'event'
  AND json_extract(metadata, '$.event_status') = 'scheduled'
ORDER BY event_date ASC
```

**Important:** Do NOT query `paper-club` or `builders-club` node_types for upcoming sessions. Those are recording nodes. Upcoming sessions are `node_type = 'event'` with `event_status = 'scheduled'`.

If no upcoming events, say so and mention they can schedule one with `/paper-club` or `/builders-club`.
