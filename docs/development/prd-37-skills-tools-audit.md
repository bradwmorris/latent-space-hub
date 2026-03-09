# PRD-37: Decouple Slop from MCP + Skills/Tools Audit

**Status:** Draft | **Created:** 2026-03-09

## 1. Background

Slop currently connects to the hub via MCP (stdio subprocess), but the relationship is awkward:

1. **Tool definition mismatch** — Slop fetches 9 read-only tool schemas from MCP, but then intercepts `ls_read_skill` locally before it reaches MCP. The tool *definitions* come from the hub, but the *execution* is split between local interception and MCP forwarding.
2. **Skill duplication** — The same 6 Slop skills exist in two places: `latent-space-hub/src/config/skills/slop/` (served via MCP) and `latent-space-bots/skills/` (read locally). Slop reads from local, but an external agent calling `ls_list_skills` via MCP sees the hub copies — which may drift.
3. **Write operations hide behind MCP** — Slop's hardcoded writes (member create, event create, member update, edge create) go through `McpGraphClient.callTool()` → MCP subprocess → Turso. But Slop already has a direct Turso client (`@libsql/client`) for chat logging and index creation. The MCP layer adds latency and complexity for no benefit.
4. **Skills may be redundant** — Some skills may duplicate what the LLM already gets from tool descriptions or the system prompt.

**Decision:** Remove MCP from Slop entirely. Slop becomes a self-contained bot that talks directly to Turso. MCP stays clean as the external agent interface.

## 2. Plan

### Phase 1: Decouple Slop from MCP (in `latent-space-bots`)
1. Replace `McpGraphClient` with direct Turso queries
2. Define Slop's own tool schemas locally
3. Implement tool handlers as direct DB queries

### Phase 2: Audit & refine skills (in `latent-space-bots`)
4. Audit each Slop skill for value vs. redundancy
5. Refine surviving skills — delete, merge, or tighten

### Phase 3: Clean up hub-side + documentation (in `latent-space-hub`)
6. Remove Slop skills from hub (`src/config/skills/slop/`)
7. Verify agent skills are clean and accurate
8. Update documentation in both repos

## 3. Implementation Details

### Step 1: Replace McpGraphClient with direct Turso queries

Slop already has a direct Turso client at line 105 of `src/index.ts`:
```typescript
const db = createLibsqlClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
```

Currently used only for:
- `ensureMemberDiscordIndex()` — CREATE INDEX
- Chat logging — INSERT INTO chats

**Create `src/db.ts`** — a thin query layer that replaces every `mcpGraph.*` call with direct SQL:

| McpGraphClient method | Replacement | SQL |
|---|---|---|
| `lookupMemberByDiscordId(id)` | `db.execute()` | `SELECT ... FROM nodes WHERE node_type='member' AND json_extract(metadata, '$.discord_id') = ?` |
| `createMemberNode(payload)` | `db.execute()` | `INSERT INTO nodes (title, description, node_type, metadata, ...) VALUES (...)` |
| `updateMemberNode(id, updates)` | `db.execute()` | `UPDATE nodes SET ... WHERE id = ?` |
| `createEventNode(payload)` | `db.execute()` | `INSERT INTO nodes (...) VALUES (...)` |
| `createMemberEdge(src, tgt, expl)` | `db.execute()` | `INSERT INTO edges (source_id, target_id, explanation, ...) VALUES (...)` |
| `getBookedDates(type, dates)` | `db.execute()` | `SELECT event_date, ... FROM nodes WHERE node_type='event' AND ...` |
| `checkEventSlot(type, date)` | `db.execute()` | `SELECT id, title, ... FROM nodes WHERE node_type='event' AND ...` |
| `searchNodes(query, limit)` | `db.execute()` | FTS5 query: `SELECT ... FROM nodes_fts WHERE nodes_fts MATCH ? ...` |
| `searchContent(query, limit)` | `db.execute()` | FTS5 or vector query on chunks table |
| `getNodes(nodeIds)` | `db.execute()` | `SELECT ... FROM nodes WHERE id IN (...)` |
| `queryLatestContent(type, limit)` | `db.execute()` | `SELECT ... FROM nodes WHERE event_date IS NOT NULL ORDER BY ...` |

**Reference the hub's schema** (`docs/schema.md`) for exact column names and types.

**Key considerations:**
- The hub's `nodes` table schema is the contract. Query it directly — no abstraction layer needed beyond parameterized queries.
- `ls_sqlite_query` calls in `McpGraphClient` (member lookup, event slot check, booked dates, latest content) are already raw SQL — they translate 1:1.
- `ls_search_nodes` and `ls_search_content` need the hub's FTS5/vector search query patterns. Check `src/services/database/` in the hub for the exact queries.
- `ls_add_node`, `ls_update_node`, `ls_create_edge` — check the hub's database service for the exact INSERT/UPDATE patterns, especially auto-populated fields (`created_at`, `updated_at`, dimension assignment).

### Step 2: Define Slop's own tool schemas

Replace `mcpGraph.getToolDefinitions()` with a local array of OpenAI function definitions.

**Create `src/tools.ts`** with the 9 read-only tool schemas (minus `ls_list_skills` and `ls_read_skill` — see below):

Tools for the LLM (read-only, for conversational responses):

| Tool | Keep? | Notes |
|---|---|---|
| `ls_search_nodes` | **Yes** → `slop_search_nodes` | Primary search tool |
| `ls_search_content` | **Yes** → `slop_search_content` | Semantic/chunk search |
| `ls_get_nodes` | **Yes** → `slop_get_nodes` | Fetch by ID |
| `ls_query_edges` | **Yes** → `slop_query_edges` | Relationship lookup |
| `ls_list_dimensions` | **Yes** → `slop_list_dimensions` | Category browsing |
| `ls_get_context` | **Maybe** | Evaluate — may be replaceable with a static context block in system prompt |
| `ls_sqlite_query` | **Yes** → `slop_sqlite_query` | Flexible read-only queries |
| `ls_list_skills` | **Drop from LLM tools** | Skills are already listed in the system prompt `[SKILLS]` block |
| `ls_read_skill` | **Yes** → `slop_read_skill` | Keep — reads from local `skills/*.md` |

**Rename tools** from `ls_*` to `slop_*` to make it clear these are bot-internal, not MCP. Update tool descriptions to be Slop-specific.

**Tool handler** in the tool call loop (`src/index.ts` line 793-823):
- `slop_read_skill` → `readLocalSkillStrict(name)` (already works this way)
- All other `slop_*` tools → execute via `src/db.ts` direct queries

### Step 3: Implement tool handlers

Each tool handler in `src/tools.ts` exports:
1. The OpenAI function definition (name, description, parameters JSON schema)
2. An `execute(args, db)` function that runs the query and returns formatted results

The tool call loop in `src/index.ts` changes from:
```typescript
// OLD
if (toolName === "ls_read_skill") {
  resultText = readLocalSkillStrict(args.name);
} else {
  const result = await mcpGraph.callTool(toolName, args);
}
```
To:
```typescript
// NEW
const handler = toolHandlers[toolName];
if (!handler) throw new Error(`Unknown tool: ${toolName}`);
resultText = await handler.execute(args, db);
```

### Step 4: Audit Slop skills for value vs. redundancy

Current Slop skills (`latent-space-bots/skills/`):

| Skill | What it contains | Verdict |
|---|---|---|
| `start-here` | Routes to other skills, describes bot capabilities | **Likely keep** — provides runtime orientation the system prompt doesn't cover |
| `graph-search` | Search strategy, content type descriptions | **Likely merge into db-operations** — overlaps with tool descriptions |
| `db-operations` | Schema details, search patterns, citation format | **Keep** — has schema info tools don't carry. Absorb graph-search into it |
| `curation` | Dedup policy, description standards, metadata | **Likely delete** — Slop's tools are read-only, curation guidance is dead weight |
| `member-profiles` | `<profile>` block protocol, enrichment policy | **Keep** — unique to bot-internal mechanism |
| `event-scheduling` | Paper Club / Builders Club scheduling details | **Evaluate** — slash commands are hardcoded, but LLM may need to explain them to users |

**For each skill, answer:**
1. Can the LLM accomplish the task with just system prompt + tool descriptions?
2. Does the skill contain information not available elsewhere?
3. If the LLM is asked about this topic and *doesn't* read the skill, does it fail?

**Slash command boundary:**
- `/join`, `/paper-club`, `/builders-club` are hardcoded in `src/index.ts` — they do NOT go through the LLM
- If a user asks Slop conversationally to "schedule a paper club", the LLM has no write tools — it should direct them to the slash command
- The `event-scheduling` skill should either be tightened to just say "direct users to the slash commands" or deleted if the system prompt rules already handle this

### Step 5: Refine surviving skills

Based on audit:
- **Delete** skills that duplicate tool descriptions or system prompt
- **Merge** `graph-search` into `db-operations` if both survive
- **Tighten** remaining skills — remove anything the LLM already gets from tool schemas
- Update `REQUIRED_SLOP_SKILLS` array in `src/index.ts` to match

### Step 6: Remove Slop skills from hub

The hub currently has 6 Slop skills in `src/config/skills/slop/`:
```
start-here.md, graph-search.md, member-profiles.md,
db-operations.md, curation.md, event-scheduling.md
```

These are served via MCP `ls_list_skills` / `ls_read_skill` to any external agent.

**Decision:** Delete them. Slop skills are bot-internal operational guidance. External agents shouldn't see them — they have their own agent skills in `src/config/skills/agents/`.

After deletion:
- `ls_list_skills` via MCP returns only: `agent`, `mcp-quickstart`
- `ls_read_skill` via MCP can only read agent skills
- Update `skillService.ts` to remove `SLOP_SKILL_ORDER`, `BUNDLED_SLOP_SKILLS_DIR`, and the `'slop'` skill group
- Update `LEGACY_REDIRECTS` — remove redirects to deleted skills, or redirect to agent equivalents

### Step 7: Verify agent skills

Agent skills in `src/config/skills/agents/`:
- `agent.md` — general policy for external MCP agents
- `mcp-quickstart.md` — setup guide for connecting

Verify:
- Tool list in `mcp-quickstart.md` matches what the MCP server actually exposes
- No references to Slop-specific behavior
- Instructions still work end-to-end
- `ls_list_skills` returns only these two

### Step 8: Update documentation

**In `latent-space-hub`:**
- `docs/README.md` — update system overview to reflect clean MCP = external agents only
- `CLAUDE.md` — remove any stale references to Slop skills in hub

**In `latent-space-bots`:**
- `README.md` — document that Slop is self-contained: direct Turso, local skills, local tools
- `docs/slop-system-message.md` — update to reflect post-audit state
- Add architecture section showing the clean separation:

```
┌─────────────────────────┐     ┌─────────────────────────────┐
│   latent-space-bots     │     │     latent-space-hub        │
│                         │     │                             │
│  Discord ← → Slop Bot  │     │  Web UI ← → Next.js App    │
│    │                    │     │                             │
│    ├─ System prompt     │     │  MCP Server (external       │
│    │   [IDENTITY]       │     │  agents only)               │
│    │   [RULES]          │     │    ├─ ls_* tools (full set) │
│    │   [SKILLS]         │     │    └─ agent skills          │
│    │   [MEMBER]         │     │       (agent.md,            │
│    │                    │     │        mcp-quickstart.md)   │
│    ├─ Local tools       │     │                             │
│    │   slop_search_*    │     │                             │
│    │   slop_get_*       │     │                             │
│    │   slop_read_skill  │     │                             │
│    │                    │     │                             │
│    ├─ Local skills      │     │                             │
│    │   skills/*.md      │     │                             │
│    │                    │     │                             │
│    └─ Direct Turso ─────┼─────┼──→ Turso DB (shared)       │
│                         │     │                             │
└─────────────────────────┘     └─────────────────────────────┘
```

## 4. Scope & Sequencing

**What changes in `latent-space-bots` (Phase 1 + 2):**
- New: `src/db.ts` — direct Turso query layer
- New: `src/tools.ts` — local tool schemas + handlers
- Modified: `src/index.ts` — remove `McpGraphClient`, use local tools + db
- Deleted: `src/mcpGraphClient.ts`
- Modified: `skills/*.md` — refined based on audit
- Modified: `package.json` — remove `@modelcontextprotocol/sdk` dependency

**What changes in `latent-space-hub` (Phase 3):**
- Deleted: `src/config/skills/slop/` (6 files)
- Modified: `src/services/skills/skillService.ts` — remove slop skill group
- Modified: `docs/README.md`, `CLAUDE.md` — update docs
- Verified: `src/config/skills/agents/` — ensure accuracy

**Order of operations:**
1. Phase 1 first (decouple) — this is the structural change
2. Phase 2 (audit skills) — easier once tools are local and the architecture is clean
3. Phase 3 (hub cleanup) — safe to do after Slop no longer reads from hub skills

## 5. Open Questions

- **Tool naming:** `slop_*` vs keeping `ls_*`? Renaming makes the boundary clear but changes the tool names the LLM has learned. Could keep `ls_*` names for now and rename later.
- **Search queries:** Need to extract the exact FTS5 and vector search SQL from the hub's database services. These are the most complex queries to port.
- **Embedding/chunking:** Slop doesn't do embeddings — it only reads. The hub's ingestion pipeline handles all embedding. This doesn't change.
- **Chat logging:** Already uses direct Turso (`db.execute`). No change needed.
- **Trace/observability:** `McpGraphClient.callTraces` is used for logging tool calls to the chats table. Replace with equivalent local tracing in the tool handler loop.

---

## COMPLETED

**Date:** 2026-03-09

**What was delivered:**

### Phase 1: Decouple Slop from MCP (latent-space-bots)
- Created `src/db.ts` — direct Turso query layer replacing all `McpGraphClient` operations
- Created `src/tools.ts` — 8 local tool definitions (`slop_*`) + handlers for the LLM
- Removed all `McpGraphClient` usage from `src/index.ts`
- `mcpGraphClient.ts` is now dead code (can be deleted)
- Removed `@modelcontextprotocol/sdk` and `latent-space-hub-mcp` dependencies from `package.json`
- Tool names changed from `ls_*` to `slop_*` to clarify they're bot-internal
- Tool call loop now executes handlers directly against Turso instead of proxying through MCP

### Phase 2: Audit & refine skills (latent-space-bots)
- **Deleted:** `graph-search.md` — duplicated tool descriptions and `db-operations` content
- **Deleted:** `curation.md` — write-focused policy, but Slop's LLM tools are read-only
- **Merged:** `graph-search` search strategy content into `db-operations`
- **Updated:** `start-here.md` — clarified slash command boundary, updated tool names to `slop_*`
- **Updated:** `db-operations.md` — consolidated schema + search patterns + citation, updated tool names
- **Updated:** `event-scheduling.md` — tightened to focus on querying events, clarified Slop cannot schedule
- **Kept:** `member-profiles.md` — unchanged, unique `<profile>` block protocol
- Updated `REQUIRED_SLOP_SKILLS` from 6 to 4 skills

### Phase 3: Hub cleanup (latent-space-hub)
- **Deleted:** `src/config/skills/slop/` (6 files) — Slop skills no longer served via MCP
- **Updated:** `src/services/skills/skillService.ts` — removed slop skill group, all skills are now 'agent'
- **Updated:** `src/components/panes/SkillsPane.tsx` — removed slop skill section
- **Updated:** `src/components/docs/DocsLayout.tsx` — removed Slop Skills nav section
- **Updated:** `src/services/docs/docsService.ts` — removed slop skill nav links, updated types
- **Updated:** `src/config/skills/agents/agent.md` — removed references to deleted slop skills, added retrieval pattern
- **Updated:** `src/config/skills/agents/mcp-quickstart.md` — corrected tool list to match actual MCP server
- **Updated:** `apps/mcp-server-standalone/skills/start-here.md` — added event-scheduling to skill list

**Architecture after this PRD:**
- Slop is self-contained: direct Turso, local tools (`slop_*`), local skills
- MCP server is clean: serves only agent skills, used only by external agents
- No more tool name collisions or skill duplication across repos
