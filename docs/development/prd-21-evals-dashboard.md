# PRD-21: Evals — Interaction logging, trace dashboard, golden dataset & automated testing

**Status:** ready
**Type:** feature
**Priority:** high
**Repo(s):** latent-space-hub, latent-space-bots
**Absorbs:** PRD-26 (Eval Suite)

---

## Goal

We have zero visibility into what Slop is doing in Discord. The existing `maybeLogChat` writes to columns that don't exist in the `chats` table — so logging is silently broken. We need to:

1. Fix bot logging so every interaction is captured with full tool traces
2. Build a dashboard to review those traces
3. Create a golden eval dataset with automated scenario testing and scoring

This is table stakes for a production bot. Can't improve what you can't see — and can't prevent regressions without evals.

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

### Part 4: Eval scenario schema & golden dataset

**New files:**
- `tests/evals/types.ts` — Scenario type definition
- `tests/evals/dataset.json` — Dataset metadata
- `tests/evals/scenarios/index.ts` — Scenario index
- `tests/evals/scenarios/*.ts` — 10-15 individual scenarios

```typescript
type Scenario = {
  id: string;
  name: string;
  description?: string;
  input: {
    message: string;               // What the user says to Slop
    discord_username?: string;      // Simulate specific user
    channel?: string;               // Simulate channel context
    is_slash_command?: boolean;
    slash_command?: string;
  };
  expect?: {
    toolsCalled?: string[];         // Hard: must call these MCP tools
    toolsCalledSoft?: string[];     // Soft: should call (warning if not)
    toolsNotCalled?: string[];      // Must NOT call
    responseContains?: string[];    // Hard: response must include
    responseContainsSoft?: string[];
    responseNotContains?: string[];
    citesNodes?: boolean;           // Response should cite graph nodes
    maxLatencyMs?: number;
    maxTotalTokens?: number;
  };
  suites?: string[];                // e.g., ['search', 'creation', 'personality']
  enabled?: boolean;
  notes?: string;
};
```

**Golden dataset categories (10-15 scenarios):**

| Category | Example | Key Assertions |
|----------|---------|----------------|
| Search | "What has swyx said about agents?" | `toolsCalled: ['ls_search_content']`, `citesNodes: true` |
| Search | "Latest AI news from this week" | `toolsCalled: ['ls_search_nodes']`, `responseContains: ['ainews']` |
| Entity lookup | "Tell me about Anthropic" | Should find entity node, cite it |
| Podcast | "Summarize the latest podcast episode" | Should search by type, cite source |
| Slash /tldr | "/tldr transformer architecture" | Tool usage, concise response |
| Slash /wassup | "/wassup" | Should surface recent content |
| Personality | "What do you think about RAG?" | Opinionated (Slop persona), not generic |
| No hallucination | "What did Elon Musk say on the podcast?" | Should say "not found" — not hallucinate |
| Member awareness | Message from known member | Should reference member interests |
| Source linking | Any knowledge question | Response includes source links |

### Part 5: Eval runner & API endpoint

**New files:**
- `tests/evals/runner.ts` — CLI runner
- `app/api/eval/run/route.ts` — Server-side eval endpoint

**Execution flow:**
1. Load scenarios from `scenarios/index.ts`
2. Filter by suite if `LS_EVALS_SUITE` env var set
3. For each scenario:
   - Generate `traceId`: `eval_[timestamp]_[uuid]`
   - Call `/api/eval/run` (uses same MCP tools + system prompt as Slop, runs server-side)
   - Check expectations (tools called, response content, latency)
   - Record pass/fail/warning
4. Print summary

**Eval endpoint (`/api/eval/run`):**
- Accepts scenario input
- Loads Slop's system prompt (copy maintained in this repo)
- Runs Claude with MCP tools (same as bot)
- Returns response + tool calls + timing
- Tags with `scenario_id` and `trace_id`

### Part 6: Extend dashboard with eval results + run script

**Modify:** `app/api/evals/route.ts` — add filtering by `scenario_id IS NOT NULL` (eval runs) vs `IS NULL` (live)

**Modify:** `app/evals/EvalsClient.tsx` — add:
- Source filter: "All | Live | Eval Runs"
- Scenario results table: name, pass/fail, latency, tool calls, last run
- Aggregate metrics: pass rate, average latency, tool call accuracy

**Add to `package.json`:**
```json
"scripts": {
  "evals": "tsx tests/evals/runner.ts"
}
```

```bash
npm run evals                        # Run all
LS_EVALS_SUITE=search npm run evals  # Run search suite only
```

---

## Tasks

- [ ] Part 1: Rewrite bot logging — align to chats schema, capture tool calls + timing
- [ ] Part 2: Build /evals dashboard — list view + expanded trace view
- [ ] Part 3: API route — paginated queries with filters
- [ ] Part 4: Define eval types and scenario schema
- [ ] Part 5: Create golden dataset — 10-15 scenarios
- [ ] Part 6: Build eval runner + eval API endpoint
- [ ] Part 7: Extend /evals dashboard — source filter, scenario results, aggregate metrics
- [ ] Part 8: Add `npm run evals` script

---

## Flags

- **Cross-repo:** Bot logging changes (Part 1) are in `latent-space-bots`. Eval runner (Part 5) needs Slop's system prompt — copy and maintain in this repo.
- **Database:** Eval traces go into same `chats` table with `scenario_id` in metadata. No new tables.
- **Cost:** Each eval run calls Claude. 15 scenarios × ~$0.01 = ~$0.15 per full run.
- **CI integration:** Future — run evals on PR merge. Not in scope for v1.

---

## Out of scope (future)

- Token/cost tracking (OpenRouter may not return usage data reliably)
- Alerting on errors or anomalies
- Log retention / cleanup policies
- Export / download traces
