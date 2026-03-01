---
title: Evals
description: Trace logging and the /evals dashboard for monitoring Discord bot interactions.
---

# Trace Logging

Every Discord bot interaction logs a full trace to the `chats` table in Turso.

## What Gets Logged

| Field | Description |
|-------|-------------|
| Thread ID | Discord thread where the interaction happened |
| User message | The original user prompt |
| Bot response | Full text of Slop's reply |
| MCP tool calls | Each tool call: name, arguments, result summary, duration (ms) |
| Retrieval method | `agentic`, `smalltalk`, or `latest_node_lookup` |
| Model | LLM model used (e.g. `claude-sonnet-4-6`) |
| Latency | Total request time in milliseconds |
| Member ID | If the user has `/join`ed, their member node ID |
| Discord context | Channel, guild, thread metadata |

## Tool Call Traces

Each tool call in the agentic loop is captured individually:

```json
{
  "tool": "ls_search_nodes",
  "args": { "query": "Terminal-Bench", "limit": 5 },
  "result_preview": "Found 3 nodes...",
  "duration_ms": 142
}
```

This gives full visibility into what the LLM searched for, what it found, and how long each step took.

---

# Evals Dashboard

![Evals Dashboard](/images/docs/evals-dashboard.png)

The `/evals` page on the web app provides a visual interface for reviewing bot interaction traces.

## Features

- **Chronological feed** of all bot interactions
- **Expandable traces** showing the full tool-calling chain for each interaction
- **Tool call details** — arguments, results, timing for each MCP tool call
- **Filter by retrieval method** — see only agentic, smalltalk, or kickoff interactions
- **Response quality review** — compare what the bot said against what was in the knowledge graph

## Access

Navigate to `/evals` on the web app. Requires the app to be running (not available in readonly mode).
