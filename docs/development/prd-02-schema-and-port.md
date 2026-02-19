# PRD 02: Schema Cleanup + Port RA-H Changes

## Background

The Turso database has 204 nodes, 109 edges, 27 dimensions, but 0 chunks. Schema has dead columns and is missing recent improvements from the main RA-H app (66 commits in last 3 weeks). Need to finalize the schema and bring across the good changes in one batch.

## Plan

1. Finalize database schema — drop dead columns, add new ones, align with RA-H main
2. Port schema changes from main app
3. Port UX components that add value for read-only browsing
4. Test everything

## Implementation Details

### Schema changes (Turso migration)

**Drop dead columns:**
- `nodes.type` — replaced by flexible dimensions
- `nodes.is_pinned` — unused
- `edges.user_feedback` — unused
- `chat_memory_state` table — orphaned

**Rename:**
- `nodes.content` → `nodes.notes` (align with RA-H main, affects 41+ files)

**Add columns:**
- `nodes.event_date` — ISO 8601 date field for temporal queries
- `dimensions.icon` — visual icon for dimension browsing

**Add indexes:**
- Vector index on `chunks.embedding` via `libsql_vector_idx`
- FTS5 virtual table on `chunks.text`

**Migration approach:** Idempotent script in setup-schema.mjs. Run once, safe to re-run.

### MCP backward compatibility

- External MCP tools keep `content` in their schemas
- Map to `notes` at the handler boundary (same pattern as main app)

### UX ports from RA-H main

**Port (valuable for read-only):**
- Database Table Pane — 14-column spreadsheet view for browsing all nodes
- Feed Pane simplification — remove kanban/grid/saved views, add sort dropdown
- UI polish fixes — default tab order, dimension editing, refresh button (Cmd+Shift+R)
- Temporal awareness — surface event_date, created_at, updated_at in UI

**Skip (write-only features):**
- Quick Add loading / fire-and-forget
- Node creation quality improvements
- Agent-specific features (memory, approvals)

### Key files affected

- `src/types/database.ts` — content → notes, add event_date
- `src/services/database/nodes.ts` — column rename
- `src/services/database/chunks.ts` — schema alignment
- `setup-schema.mjs` — migration script
- All MCP tool handlers — backward compat mapping
- `src/components/` — new Table Pane, Feed updates

## Done =

- Schema finalized and migrated on Turso
- content → notes rename complete across codebase
- New columns (event_date, dimensions.icon) added
- Dead columns dropped
- Table Pane, Feed simplification, UI polish ported
- MCP tools backward compatible
- Everything works in readonly mode
