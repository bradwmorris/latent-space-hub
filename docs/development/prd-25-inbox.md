# PRD 25: Inbox — Conversation View of All Bot Interactions

**Status:** Draft | **Created:** 2026-03-07

## 1. Background

The `/evals` page logs bot interactions as traces, but it's oriented as a debugging/monitoring tool — not a view of what's happening. We want an `/inbox` that shows every bot interaction in a familiar inbox/conversation UI: Discord messages now, email later. This becomes the primary surface for understanding what Slop is doing day-to-day.

## 2. Plan

1. Create `/inbox` route with conversation-list UI
2. Build conversation detail view (threaded, per-user)
3. Add filtering, search, and status indicators
4. Wire to existing `chats` table (same data as `/evals`, different presentation)
5. Add inbox stats to dashboard

## 3. Implementation Details

### Step 1: Inbox Page & API Route

**New files:**
- `app/inbox/page.tsx` — server component (mirrors evals pattern)
- `app/inbox/InboxClient.tsx` — client component with inbox UI
- `app/api/inbox/route.ts` — API endpoint

**API design:**
```
GET /api/inbox?page=1&limit=50&user=discord_username&channel=channel_id&unread=true
```

**Query:** Same `chats` table, `chat_type = 'discord'`. Group by user (`json_extract(metadata, '$.discord_username')`). Return conversations ordered by most recent interaction.

**Response shape:**
```json
{
  "conversations": [
    {
      "user": { "discord_id": "...", "username": "...", "avatar_url": "...", "member_id": 42 },
      "last_message": { "user_message": "...", "assistant_message": "...", "created_at": "..." },
      "message_count": 12,
      "last_active": "2026-03-07T...",
      "channels": ["general", "slop-testing"]
    }
  ],
  "total": 45,
  "page": 1
}
```

**Key files to reference:**
- `app/evals/EvalsClient.tsx` — existing trace UI pattern
- `app/api/evals/route.ts` — existing query pattern against `chats` table
- `src/services/chat/middleware.ts` — what gets logged per interaction

### Step 2: Conversation Detail View

Click a conversation → expand to show full message thread with that user.

**API:**
```
GET /api/inbox/[discord_user_id]?page=1&limit=50
```

**Query:**
```sql
SELECT * FROM chats
WHERE chat_type = 'discord'
  AND json_extract(metadata, '$.discord_user_id') = ?
ORDER BY created_at DESC
LIMIT ? OFFSET ?
```

**UI elements per message:**
- User message (left-aligned, user avatar)
- Bot response (right-aligned, Slop avatar)
- Timestamp
- Tool calls badge (expandable, same as evals trace)
- Channel/thread context
- Retrieval method indicator

### Step 3: Filtering & Search

**Filters:**
- By user (dropdown of known users)
- By channel
- By date range
- By interaction type (slash command, mention, kickoff)
- Text search across user_message + assistant_message

### Step 4: Inbox Stats on Dashboard

Add an inbox summary card or stat row to the main dashboard:
- Total conversations today
- Active users this week
- Average response latency
- Most active users

**Files to modify:**
- `app/api/dashboard/route.ts` — add inbox stats query
- `src/components/dashboard/Dashboard.tsx` — render inbox stats

### Step 5: Future Email Support (Architecture Only)

Design the `chats` table usage to support `chat_type = 'email'` later:
- Same conversation grouping logic (by sender address instead of discord_id)
- Same inbox UI with type badges (Discord vs Email)
- No implementation now — just ensure the data model supports it

## 4. Key Files

| File | Action |
|------|--------|
| `app/inbox/page.tsx` | Create |
| `app/inbox/InboxClient.tsx` | Create |
| `app/api/inbox/route.ts` | Create |
| `app/api/inbox/[discord_user_id]/route.ts` | Create |
| `app/api/dashboard/route.ts` | Modify (add inbox stats) |
| `src/components/dashboard/Dashboard.tsx` | Modify (render inbox stats) |
| `setup-schema.mjs` | Review — may need index on `json_extract(metadata, '$.discord_user_id')` |

## 5. Flags

- **Performance:** Grouping by JSON-extracted field (`discord_user_id`) may be slow at scale. Consider adding a top-level `sender_id` column to `chats` if query times exceed 500ms.
- **Avatar URLs:** Member nodes already store `avatar_url` in metadata. Non-members won't have avatars — use Discord's CDN URL from the metadata or a default.
- **Navigation:** Need to add "Inbox" to the main nav/layout alongside Dashboard, Search, etc.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
