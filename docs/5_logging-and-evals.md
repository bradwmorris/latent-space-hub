# Logging & Evals

## Logging System

RA-H uses a **trigger-based logging system** that automatically captures all database activity in the `logs` table.

### What Gets Logged

**Automatically logged via triggers:**
- **Node operations** - Create, update (via `trg_nodes_ai`, `trg_nodes_au`)
- **Edge operations** - Create, update (via `trg_edges_ai`, `trg_edges_au`)
- **Chat operations** - All conversations with token/cost metadata (via `trg_chats_ai`)

**Log structure:**
```typescript
{
  id: number,
  ts: timestamp,
  table_name: 'nodes' | 'edges' | 'chats',
  action: 'INSERT' | 'UPDATE',
  row_id: number,
  summary: string,              // Human-readable description
  snapshot_json: string,         // Full row data as JSON
  enriched_summary: string | null // Enhanced log entry
}
```

### Chat Metadata

Every chat log includes detailed execution metadata:

```typescript
metadata: {
  // Token tracking
  prompt_tokens: number,
  completion_tokens: number,
  reasoning_tokens: number,
  total_tokens: number,
  
  // Cost tracking
  cost: number,                  // USD cost for this chat
  
  // Tool usage
  tools_used: string[],          // Array of tool names called
  
  // Workflow tracking
  is_workflow: boolean,
  workflow_key?: string,
  workflow_node_id?: number,
  
  // Model parameters
  reasoning_effort?: 'low' | 'medium' | 'high',
  
  // Execution trace
  trace?: {
    session_id: string,
    parent_session_id?: string,
    execution_time_ms: number
  }
}
```

### Auto-Pruning

**Trigger:** `trg_logs_prune`  
**Behavior:** Keeps last 10,000 log entries  
**Runs:** After every INSERT to logs table

This prevents infinite database growth while preserving recent activity history.

### Enriched Logs View

**View:** `logs_v`  
**Purpose:** Joins log entries with related data for readable activity feed

**Enrichment:**
- Node logs → show node title
- Edge logs → show from/to node titles
- Chat logs → show agent name, user/assistant message previews

## Settings Panel Visibility

**Location:** Settings → Logs tab

**Features:**
- **Real-time activity feed** - Shows last 100 log entries
- **Table filtering** - Filter by nodes/edges/chats
- **Action filtering** - Filter by INSERT/UPDATE
- **Detailed view** - Click to see full snapshot_json
- **Token/cost visibility** - Chat logs show usage and costs
- **Tool usage** - See which tools were called per chat

**Query:**
```sql
SELECT * FROM logs_v 
ORDER BY ts DESC 
LIMIT 100
```

## Cost Tracking

**Automatic cost calculation:**
- Every chat records token counts from LLM response
- Cost computed using model-specific pricing
- Stored in `chats.metadata.cost` (USD)
- Aggregated in Settings → Analytics

**Model pricing:**
- GPT-4o Mini: $0.15/1M input, $0.60/1M output
- Claude Sonnet 4.5: $3.00/1M input, $15.00/1M output

**Typical costs:**
- Easy mode chat: $0.01-0.03
- Hard mode chat: $0.03-0.10
- Integrate workflow: ~$0.18
- Deep analysis: ~$0.33

## Token Analytics

**Settings → Analytics panel shows:**
- Total tokens used (all time)
- Total cost (USD)
- Breakdown by agent (ra-h, ra-h-easy, mini-rah, wise-rah)
- Breakdown by conversation thread
- Average cost per chat

**Query:**
```sql
SELECT 
  helper_name,
  COUNT(*) as chat_count,
  SUM(JSON_EXTRACT(metadata, '$.total_tokens')) as total_tokens,
  SUM(JSON_EXTRACT(metadata, '$.cost')) as total_cost
FROM chats
WHERE metadata IS NOT NULL
GROUP BY helper_name
```

## Evaluation (Future)

**Planned features:**
- Edge quality ratings (user feedback via `edges.user_feedback`)
- Memory node relevance scoring
- Workflow success metrics
- Connection discovery quality

**Current state:**
- Infrastructure exists (`edges.user_feedback` column)
- UI not yet implemented
- Manual evaluation via logs table queries
