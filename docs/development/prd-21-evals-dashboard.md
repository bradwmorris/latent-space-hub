# PRD-21: Evals Dashboard — Log and review Slop's Discord interactions

**Status:** ready
**Type:** feature
**Priority:** high
**Repo(s):** latent-space-hub, latent-space-bots

---

## Goal

We have zero visibility into what Slop is doing in Discord. The existing `maybeLogChat` writes to columns that don't exist in the `chats` table — so logging is silently broken. We need to:

1. Fix bot logging so every interaction is captured with full tool traces
2. Build a simple dashboard to review those traces

This is table stakes for a production bot. Can't improve what you can't see.

---

## Architecture

### Data flow

```
Discord user message
  → Slop processes (MCP searches, member lookups, LLM call)
  → Slop responds
  → Log full trace to `chats` table in Turso
  → Dashboard reads from `chats` where chat_type = 'discord'
```

### Storage: existing `chats` table (no migration needed)

The `chats` table already has the right shape. Map bot data to existing columns:

| Column | Bot value |
|--------|-----------|
| `chat_type` | `'discord'` |
| `user_message` | User's Discord message (cleaned) |
| `assistant_message` | Slop's response |
| `thread_id` | Discord channel/thread ID |
| `helper_name` | `'slop'` |
| `agent_type` | `'discord-bot'` |
| `metadata` | JSON blob with all rich data (see below) |

### Metadata JSON schema

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
      "tool": "search_content",
      "args": { "query": "transformer architecture" },
      "result": { "nodes": [...] },
      "duration_ms": 230
    },
    {
      "tool": "update_member_node",
      "args": { "id": 55, "content": "..." },
      "result": { "success": true },
      "duration_ms": 85
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

---

## Changes

### Part 1: Fix bot logging (latent-space-bots)

**File:** `src/index.ts`

1. **Rewrite `maybeLogChat` → `logTrace`**
   - Align INSERT to actual `chats` table columns
   - Accept a structured trace object instead of individual args
   - Always log (remove the `ENABLE_CHAT_LOG_WRITE` gate — logging should be on by default)
   - Keep best-effort error handling (log the error instead of swallowing it)

2. **Capture tool calls throughout the request lifecycle**
   - Add a `traceCollector` object at the start of each `handleMessage` / `handleInteraction`
   - Wrap MCP client calls to record tool name, args, result, and duration
   - Capture member graph operations (lookupMember, createMember, updateMember, createEdge)
   - Pass collector through to `logTrace` at the end

3. **Capture timing**
   - Record `startTime` at message receipt
   - Calculate total `latency_ms` before logging

4. **Capture Discord context**
   - Username (not just user ID)
   - Whether it was a slash command and which one
   - Whether it was a kickoff-triggered response

**File:** `src/mcpGraphClient.ts`

5. **Add instrumented wrappers** (optional but clean)
   - Each MCP method returns `{ result, duration_ms }` alongside data
   - Or: the trace collector wraps calls externally

### Part 2: Evals dashboard (latent-space-hub)

**Route:** `/evals` (replace existing disabled page)

**Files to create/modify:**
- `app/evals/page.tsx` — server component, fetches initial data
- `app/evals/EvalsClient.tsx` — client component, interactive dashboard
- `app/api/evals/route.ts` — API route for paginated trace queries

**Dashboard layout:**

```
┌─────────────────────────────────────────────────────┐
│  Evals — Slop Discord Traces                        │
│                                                     │
│  [Filter: All | Slash commands | Kickoffs | Errors] │
│  [Search: _______________]                          │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │ 12:34  @swyx  "what's the latest on..."  3 tools││
│  │ 12:32  @user2 /tldr transformers         1 tool ││
│  │ 12:30  KICKOFF: Episode 127              2 tools││
│  │ 12:28  @user3 "has anyone talked about..." 0   ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ◀ prev  page 1 of 12  next ▶                      │
└─────────────────────────────────────────────────────┘
```

**Expanded trace view (click a row):**

```
┌─────────────────────────────────────────────────────┐
│  Trace #4821  •  2026-02-27 12:34:02 AEST          │
│  User: @swyx (id: 123456789)  •  Latency: 2.3s    │
│  Channel: #general  •  Thread: 987654321           │
│                                                     │
│  ── User Message ──────────────────────────────     │
│  what's the latest on scaling laws?                 │
│                                                     │
│  ── Tool Calls (3) ───────────────────────────      │
│  1. search_content({ query: "scaling laws" })       │
│     → 5 results, 230ms                             │
│  2. get_nodes([42, 87, 153])                       │
│     → 3 nodes, 45ms                                │
│  3. update_member_node({ id: 55, ... })            │
│     → success, 85ms                                │
│                                                     │
│  ── Response ──────────────────────────────────     │
│  [Full Slop response text]                         │
│                                                     │
│  ── Metadata ──────────────────────────────────     │
│  Model: claude-sonnet-4-6  •  Retrieval: mcp      │
│  Member: node #55  •  Context nodes: 42, 87, 153  │
└─────────────────────────────────────────────────────┘
```

### Part 3: API route for dashboard

**File:** `app/api/evals/route.ts`

```typescript
// GET /api/evals?page=1&limit=25&filter=all&search=
// Returns: { traces: ChatRow[], total: number, page: number }
// Queries: SELECT * FROM chats WHERE chat_type = 'discord' ORDER BY created_at DESC
```

Simple paginated query. Filters:
- `all` — everything
- `slash` — where metadata contains `is_slash_command: true`
- `kickoff` — where metadata contains `is_kickoff: true`
- `tools` — where metadata contains non-empty `tool_calls`
- `search` — LIKE match on user_message or assistant_message

---

## Verification

- [ ] Send Slop a message in Discord → row appears in `chats` table with `chat_type = 'discord'`
- [ ] Metadata JSON contains tool_calls array with names, args, results, durations
- [ ] Member graph operations (update, edge creation) are captured in tool_calls
- [ ] `/evals` page loads and shows paginated list of traces
- [ ] Clicking a trace shows full detail: message, response, tool calls, metadata
- [ ] Filters work (slash commands, kickoffs, tool-using traces)
- [ ] Search works on message content

---

## Tasks

- [ ] Part 1: Rewrite bot logging — align to chats schema, capture tool calls + timing
- [ ] Part 2: Build /evals dashboard — list view + expanded trace view
- [ ] Part 3: API route — paginated queries with filters

---

## Out of scope (future)

- Token/cost tracking (OpenRouter may not return usage data reliably)
- Automated quality scoring or LLM-as-judge evals
- Alerting on errors or anomalies
- Log retention / cleanup policies
- Export / download traces
