# PRD 02: Schema Cleanup + Typed Entity Model

## Background

The Turso database has 204 nodes, 109 edges, 27 dimensions, but 0 chunks. Schema has dead columns and is missing recent improvements from the main RA-H app. More importantly, the schema was designed for a single-user personal knowledge base — it needs to evolve into a **typed entity graph** for a media organization.

### Design decisions (from schema review, 2026-02-19)

Research into how BBC, Netflix, Spotify, and the SPoRC podcast corpus model their knowledge graphs led to these conclusions:

1. **Single `nodes` table with a `node_type` column** — not separate tables per entity. BBC and Netflix both use one unified graph with typed entities, not separate physical tables. The type lives on the node, not in the table structure. This keeps the edge system simple (everything connects to everything) while giving agents a reliable field to filter on.

2. **Subscribers are nodes** — community members live in the same `nodes` table with `node_type = 'subscriber'`. Edges connect them to topics, episodes, and people they're interested in. The bot builds subscriber profiles over time through these edges.

3. **Type-specific properties in `metadata` JSON** — each `node_type` has a defined metadata schema (enforced at the application layer, not SQL constraints). An episode MUST have `publish_date`, `duration`, `series`. A person MUST have `role`, `affiliations`.

4. **Typed edge relationships** — the existing `context` JSON on edges already supports typed relationships (`created_by`, `features`, `part_of`, etc.). Extend this for media-org relationships: `appeared_on`, `covers_topic`, `affiliated_with`, `interested_in`.

5. **Chunks table is fine as-is** — chunks reference `node_id` regardless of the node's type. The chunking/embedding pipeline needs to be fixed (PRD-04), but the schema is sound.

6. **Storylines are a future concept** — the BBC's separation of content/storylines/entities is powerful but over-engineering for v1. See PRD-08.

## Plan

1. Finalize database schema — drop dead columns, add `node_type`, align with RA-H main
2. Define metadata schemas per node type
3. Port schema changes from main app
4. Port UX components that add value for read-only browsing
5. Test everything

## Implementation Details

### Schema changes (Turso migration)

**Drop dead columns:**
- `nodes.type` — legacy field, replaced by new `node_type`
- `nodes.is_pinned` — unused
- `edges.user_feedback` — unused
- `chat_memory_state` table — orphaned

**Rename:**
- `nodes.content` → `nodes.notes` (align with RA-H main, affects 41+ files)

**Add columns:**
- `nodes.node_type` — TEXT, one of: `episode`, `person`, `organization`, `topic`, `source`, `event`, `concept`, `subscriber`
- `nodes.event_date` — ISO 8601 date field for temporal queries
- `dimensions.icon` — visual icon for dimension browsing

**Add indexes:**
- Index on `nodes.node_type` — fast type filtering
- Vector index on `chunks.embedding` via `libsql_vector_idx`
- FTS5 virtual table on `chunks.text`

**Migration approach:** Idempotent script in setup-schema.mjs. Run once, safe to re-run. Existing 204 nodes get `node_type` backfilled based on current dimensions (e.g., dimension `person` → `node_type = 'person'`).

### Node type metadata schemas

Each `node_type` has required and optional fields stored in the `metadata` JSON column. Application-layer validation, not SQL constraints.

| node_type | Required metadata | Optional metadata |
|-----------|------------------|-------------------|
| `episode` | `publish_date`, `duration`, `series` | `audio_url`, `video_url`, `episode_number`, `season` |
| `person` | `role` | `affiliations`, `expertise`, `twitter`, `website`, `contact` |
| `organization` | `org_type` (startup/lab/bigco/institution) | `website`, `founded`, `hq` |
| `topic` | — | `parent_topic`, `aliases` |
| `source` | `source_type` (paper/article/blog/doc) | `authors`, `publish_date`, `doi` |
| `event` | `event_date`, `event_type` (conference/launch/release) | `location`, `url` |
| `concept` | — | `definition`, `related_terms` |
| `subscriber` | `platform` (discord/web), `platform_id` | `display_name`, `joined_date`, `tier` |

### Edge relationship types

Extend the existing `context.type` enum for media-org relationships:

**Existing (keep):** `created_by`, `features`, `part_of`, `source_of`, `extends`, `supports`, `contradicts`, `related_to`

**Add:**
- `appeared_on` — Person → Episode (with `role`: host/guest/co-host)
- `covers_topic` — Episode/Source → Topic (with `depth`: mention/discussion/deep-dive)
- `affiliated_with` — Person → Organization (with `role`, `valid_from`, `valid_until`)
- `interested_in` — Subscriber → Topic/Person/Episode
- `cites` — Episode/Source → Source
- `expert_in` — Person → Topic

### MCP backward compatibility

- External MCP tools keep `content` in their schemas
- Map to `notes` at the handler boundary (same pattern as main app)

### UX ports from RA-H main

**Port (valuable for read-only):**
- Database Table Pane — 14-column spreadsheet view for browsing all nodes
- Feed Pane simplification — remove kanban/grid/saved views, add sort dropdown
- UI polish fixes — default tab order, dimension editing, refresh button (Cmd+Shift+R)
- Temporal awareness — surface event_date, created_at, updated_at in UI
- Node type filtering — filter/group by `node_type` in UI

**Skip (write-only features):**
- Quick Add loading / fire-and-forget
- Node creation quality improvements
- Agent-specific features (memory, approvals)

### Key files affected

- `src/types/database.ts` — content → notes, add node_type, add event_date, metadata type schemas
- `src/services/database/nodes.ts` — column rename, node_type support
- `src/services/database/edges.ts` — new relationship types in context inference
- `src/services/database/chunks.ts` — schema alignment
- `setup-schema.mjs` — migration script (add node_type, backfill, indexes)
- All MCP tool handlers — backward compat mapping
- `src/components/` — new Table Pane, Feed updates, type filtering

## Done =

- Schema finalized and migrated on Turso
- `node_type` column added and backfilled for existing 204 nodes
- content → notes rename complete across codebase
- New columns (node_type, event_date, dimensions.icon) added
- Dead columns dropped
- Metadata schemas defined per node_type
- Edge relationship types extended
- Table Pane, Feed simplification, UI polish ported
- MCP tools backward compatible
- Everything works in readonly mode
