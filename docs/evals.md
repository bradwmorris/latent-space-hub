# Evals — Discord Trace Logging & Dashboard

Every Slop interaction in Discord is logged to the `chats` table with full tool call traces. The `/evals` dashboard provides a UI to review these traces.

## How It Works

```
User sends message in Discord
  → Slop processes (MCP searches, member lookups, LLM call)
  → Slop responds
  → Full trace written to `chats` table (chat_type = 'discord')
  → /evals dashboard reads and displays traces
```

Logging is always-on and best-effort — if the write fails, Slop still responds normally. A `console.warn` is emitted on failure.

## What Gets Logged

Every Discord interaction produces one row in `chats` with:

| Field | Column | Value |
|-------|--------|-------|
| Type | `chat_type` | `'discord'` |
| User message | `user_message` | Cleaned prompt text |
| Bot response | `assistant_message` | Slop's full response (up to 8000 chars) |
| Channel | `thread_id` | Discord channel/thread ID |
| Bot name | `helper_name` | `'slop'` |
| Agent type | `agent_type` | `'discord-bot'` |
| Timestamp | `created_at` | ISO 8601 |
| Rich data | `metadata` | JSON blob (see below) |

### Metadata JSON

The `metadata` column contains a JSON object with everything needed to reconstruct and debug the interaction:

```json
{
  "discord_user_id": "123456789",
  "discord_username": "swyx",
  "discord_channel_id": "987654321",
  "discord_message_id": "111222333",
  "retrieval_method": "mcp:search_content",
  "context_node_ids": [42, 87, 153],
  "tool_calls": [
    {
      "tool": "ls_search_content",
      "args": { "query": "transformer architecture", "limit": 6 },
      "result": { "results_count": 5 },
      "duration_ms": 230
    },
    {
      "tool": "ls_get_nodes",
      "args": { "nodeIds": [42, 87, 153] },
      "result": { "nodes_count": 3 },
      "duration_ms": 45
    }
  ],
  "member_id": 55,
  "model": "anthropic/claude-sonnet-4-6",
  "is_slash_command": false,
  "slash_command": null,
  "is_kickoff": false,
  "response_length": 1847,
  "latency_ms": 2300
}
```

**Tool call results are summarized** to keep row sizes reasonable. Large results (search hits, node lists) are reduced to counts like `{ "results_count": 5 }`. Errors include the error message.

### What's Captured Per Interaction Type

| Interaction | `is_slash_command` | `slash_command` | `is_kickoff` |
|-------------|--------------------|-----------------|--------------|
| @Slop mention | `false` | `null` | `false` |
| `/tldr <query>` | `true` | `"tldr"` | `false` |
| `/wassup` | `true` (or `false` via text) | `"wassup"` | `false` |
| `/join` | `true` | `"join"` | `false` |
| Kickoff trigger | `false` | `null` | `true` |

## Dashboard

**URL:** `/evals` (works locally and in production — readonly GET requests pass through middleware)

### Features

- **Paginated trace list** — 25 per page, newest first
- **Filters** — All, Slash commands, Kickoffs, With tools
- **Search** — Text match on user message or bot response
- **Expanded trace view** — Click any row to see:
  - Full user message
  - All tool calls with args, results, and timing
  - Full bot response
  - Metadata (model, retrieval method, member ID, context nodes, latency)

### API

```
GET /api/evals?page=1&limit=25&filter=all&search=
```

| Param | Values | Default |
|-------|--------|---------|
| `page` | 1+ | `1` |
| `limit` | 1-100 | `25` |
| `filter` | `all`, `slash`, `kickoff`, `tools` | `all` |
| `search` | free text | empty |

Returns:

```json
{
  "traces": [...],
  "total": 142,
  "page": 1,
  "limit": 25,
  "totalPages": 6
}
```

## How Tracing Works in the Bot

The tracing system is built into `McpGraphClient` in the `latent-space-bots` repo:

1. **`McpGraphClient.callTraces`** — Every `callTool()` invocation automatically records the tool name, arguments, summarized result, duration, and any errors.
2. **`mcpGraph.clearTraces()`** — Called at the start of each `handleMessage`/`handleInteraction` to reset, then again inside `logTrace()` to collect all accumulated traces.
3. **`logTrace()`** — Assembles the full trace (Discord context + tool calls + timing) and writes to the `chats` table.

Member update operations (`updateMemberAfterInteraction`) happen asynchronously after the trace is logged and are not captured in the main trace.

## Querying Traces Directly

You can query traces via SQL (MCP tools or direct Turso access):

```sql
-- Recent Discord traces
SELECT id, user_message, created_at,
       json_extract(metadata, '$.discord_username') as username,
       json_extract(metadata, '$.latency_ms') as latency,
       json_extract(metadata, '$.retrieval_method') as method
FROM chats
WHERE chat_type = 'discord'
ORDER BY created_at DESC
LIMIT 20;

-- Traces with tool errors
SELECT id, user_message, json_extract(metadata, '$.tool_calls') as tools
FROM chats
WHERE chat_type = 'discord'
  AND json_extract(metadata, '$.tool_calls') LIKE '%"error"%';

-- Average latency by retrieval method
SELECT json_extract(metadata, '$.retrieval_method') as method,
       COUNT(*) as count,
       AVG(json_extract(metadata, '$.latency_ms')) as avg_latency_ms
FROM chats
WHERE chat_type = 'discord'
GROUP BY method;
```

## Files

| File | Repo | Purpose |
|------|------|---------|
| `src/mcpGraphClient.ts` | latent-space-bots | `ToolTrace` type, `callTraces` array, `clearTraces()` |
| `src/index.ts` | latent-space-bots | `logTrace()` function, trace instrumentation in handlers |
| `app/api/evals/route.ts` | latent-space-hub | GET API for paginated trace queries |
| `app/evals/page.tsx` | latent-space-hub | Server component wrapper |
| `app/evals/EvalsClient.tsx` | latent-space-hub | Dashboard UI (list + detail view) |
