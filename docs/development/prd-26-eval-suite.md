# PRD 26: Eval Suite — Golden Dataset & Automated Testing

**Status:** Draft | **Created:** 2026-03-07

## 1. Background

The current `/evals` page is a log viewer for bot interactions. We need a proper eval system with golden test cases, automated scenario execution, and scoring — mirroring what RA-H has built. This lets us measure Slop's quality, catch regressions, and track improvements over time.

**Reference implementation:** RA-H eval system at `/Users/bradleymorris/Desktop/dev/ra-h/tests/evals/`

## 2. Plan

1. Define eval scenario schema and golden dataset
2. Build eval runner that executes scenarios against the bot
3. Add structured logging for eval runs (trace_id, scenario_id tagging)
4. Extend `/evals` dashboard with scenario results, scoring, and comparison
5. Create initial golden dataset (10-15 scenarios)

## 3. Implementation Details

### Step 1: Eval Types & Scenario Schema

**New file:** `tests/evals/types.ts`

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
    // Tool assertions
    toolsCalled?: string[];         // Hard: must call these MCP tools
    toolsCalledSoft?: string[];     // Soft: should call (warning if not)
    toolsNotCalled?: string[];      // Must NOT call

    // Response assertions
    responseContains?: string[];    // Hard: response must include
    responseContainsSoft?: string[];
    responseNotContains?: string[];

    // Source linking
    citesNodes?: boolean;           // Response should cite graph nodes

    // Performance guards
    maxLatencyMs?: number;
    maxTotalTokens?: number;
  };
  suites?: string[];                // e.g., ['search', 'creation', 'personality']
  enabled?: boolean;
  notes?: string;
};
```

**New file:** `tests/evals/dataset.json`
```json
{
  "id": "golden-v1",
  "name": "Latent Space Hub Golden Dataset v1",
  "description": "Baseline eval scenarios for Slop bot behavior.",
  "version": 1,
  "focus": ["search accuracy", "source citing", "personality", "tool usage"]
}
```

### Step 2: Golden Test Scenarios

**New directory:** `tests/evals/scenarios/`

Create 10-15 initial scenarios covering:

| Category | Example Scenario | Key Assertions |
|----------|-----------------|----------------|
| **Search** | "What has swyx said about agents?" | `toolsCalled: ['ls_search_content']`, `citesNodes: true` |
| **Search** | "Latest AI news from this week" | `toolsCalled: ['ls_search_nodes']`, `responseContains: ['ainews']` |
| **Entity lookup** | "Tell me about Anthropic" | Should find entity node, cite it |
| **Podcast** | "Summarize the latest podcast episode" | Should search by type, cite source |
| **Slash /tldr** | "/tldr transformer architecture" | Tool usage, concise response |
| **Slash /wassup** | "/wassup" | Should surface recent content |
| **Personality** | "What do you think about RAG?" | Should be opinionated (Slop persona), not generic |
| **No hallucination** | "What did Elon Musk say on the podcast?" | If Elon hasn't appeared, should say so — not hallucinate |
| **Member awareness** | Message from known member | Should reference member interests |
| **Source linking** | Any knowledge question | Response should include source links/references |

**New file per scenario:** `tests/evals/scenarios/search-basic.ts`, etc.
**Index file:** `tests/evals/scenarios/index.ts`

### Step 3: Eval Runner

**New file:** `tests/evals/runner.ts`

**Execution flow:**
1. Load scenarios from `scenarios/index.ts`
2. Filter by suite if `LS_EVALS_SUITE` env var set
3. For each scenario:
   - Generate `traceId`: `eval_[timestamp]_[uuid]`
   - Simulate bot interaction (call the same code path the Discord bot uses)
   - Wait for response
   - Check expectations (tools called, response content, latency)
   - Record pass/fail/warning
4. Print summary: passed, failed, warnings

**Key difference from RA-H:** RA-H POSTs to `/api/rah/chat`. For LS, we need to either:
- (a) Call the bot's message handler directly (requires importing from latent-space-bots), OR
- (b) Create a `/api/eval/run` endpoint that simulates the bot's MCP tool-calling loop

**Recommendation:** Option (b) — create an eval endpoint that uses the same MCP tools and system prompt as Slop but runs server-side. This avoids cross-repo dependencies.

**New file:** `app/api/eval/run/route.ts`
- Accepts scenario input
- Loads Slop's system prompt + soul file content
- Runs Claude with MCP tools (same as bot)
- Returns response + tool calls + timing
- Tags with `scenario_id` and `trace_id`

### Step 4: Structured Eval Logging

**Modify:** `app/api/evals/route.ts`

Add filtering by:
- `scenario_id IS NOT NULL` — synthetic eval runs
- `scenario_id IS NULL` — live interactions
- Specific `dataset_id`

**Modify:** `app/evals/EvalsClient.tsx`

Add new sections to the evals dashboard:
- **Source filter:** "All | Live | Eval Runs"
- **Scenario results table:** scenario name, pass/fail, latency, tool calls, last run date
- **Aggregate metrics:** pass rate, average latency, tool call accuracy

### Step 5: Run Command

**Add to `package.json`:**
```json
"scripts": {
  "evals": "tsx tests/evals/runner.ts"
}
```

**Usage:**
```bash
npm run evals                        # Run all
LS_EVALS_SUITE=search npm run evals  # Run search suite only
```

## 4. Key Files

| File | Action |
|------|--------|
| `tests/evals/types.ts` | Create |
| `tests/evals/dataset.json` | Create |
| `tests/evals/runner.ts` | Create |
| `tests/evals/scenarios/index.ts` | Create |
| `tests/evals/scenarios/*.ts` | Create (10-15 scenarios) |
| `app/api/eval/run/route.ts` | Create |
| `app/api/evals/route.ts` | Modify (add source/scenario filtering) |
| `app/evals/EvalsClient.tsx` | Modify (add eval results view) |
| `package.json` | Modify (add evals script) |

## 5. Flags

- **Cross-repo dependency:** Slop's soul file and system prompt live in `latent-space-bots`. The eval endpoint needs access to these. Options: (a) copy soul file to this repo, (b) fetch from latent-space-bots at runtime, (c) store soul content in a shared location. Recommend (a) — copy and maintain separately.
- **Database:** Eval traces go into the same `chats` table with `scenario_id` in metadata. No new tables needed.
- **Cost:** Each eval run calls Claude. 15 scenarios x ~$0.01 each = ~$0.15 per full run. Budget-friendly.
- **CI integration:** Future — run evals on PR merge. Not in scope for v1.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
