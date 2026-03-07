# PRD 29: Guides to Skills Migration

**Status:** Completed | **Created:** 2026-03-07 | **Updated:** 2026-03-07

## Summary

Migrated the entire "guides" system to "skills". Eliminated all guide references, removed the redundant HTTP MCP transport, consolidated to a single MCP server (standalone NPX), and updated the Discord bot to match.

## What was delivered

### Phase 1: Core migration
- Created skill service layer (`src/services/skills/skillService.ts`) with flat directory structure
- Created 2 operational skills (`db-operations`, `curation`) consolidating 5 old MCP guides
- Moved and refined 5 user-facing guides into `src/config/skills/` (welcome, agent-engineering, context-engineering, mcp-quickstart, slop)
- Created skill API routes (`app/api/skills/`)
- Created skill tools (listSkills, readSkill, writeSkill, deleteSkill)
- Updated MCP standalone server with `ls_list_skills`/`ls_read_skill` tools

### Phase 2: UI overhaul + flattening
- **Skills view** — accessible from left sidebar nav, renders SkillsPane in main content area
- **Evals view** — moved from separate `/evals` page into main app via left sidebar. Made theme-aware (CSS variables instead of hardcoded dark colors)
- **Settings panel removed** — entire settings modal and all 10 sub-components deleted (2,862 lines)
- **Flattened skill structure** — no more `system/`/`guides/`/`user/` subdirectories. One flat `src/config/skills/` directory. No categories in the service, API, or UI.
- **`start-here` skill** — agent orientation skill covering: what the graph is, content types, entity types, search workflow, member creation. Links to `db-operations` and `curation` for detailed guidance.
- **MCP server instructions** updated to say "Call ls_read_skill('start-here') first for orientation"

### Phase 3: Complete guide elimination
- Removed all 4 backward-compatible guide alias tools (`ls_list_guides`, `ls_read_guide`, `ls_write_guide`, `ls_delete_guide`)
- Deleted all guide artifacts: `src/config/guides/`, `src/services/guides/`, `src/tools/guides/`, `app/api/guides/`, `apps/mcp-server-standalone/guides/`
- Renamed events: `GUIDE_UPDATED` → `SKILL_UPDATED`, `guides:updated` → `skills:updated`
- Updated all docs (architecture.md, interfaces.md, deployment.md, agents.md, handover/setup.md, CLAUDE.md, user-facing docs)

### Phase 4: MCP consolidation + bot update
- **Deleted HTTP MCP transport** (`app/api/[transport]/route.ts`) — was a separate, drifted implementation with 14 tools vs the standalone's 18. Nobody used it. Removed `mcp-handler` dependency.
- **Single MCP server** — `apps/mcp-server-standalone/index.js` is now the only MCP server. Used by Claude Code (via `.mcp.json`), the Discord bot, and anyone following setup docs.
- **Published `latent-space-hub-mcp` v0.2.1** to NPM
- **Updated Discord bot** (`latent-space-bots` repo) — `READ_ONLY_TOOLS` now references `ls_list_skills`/`ls_read_skill`, renamed `readGuide()` → `readSkill()`, updated all variable names and labels. Pushed to main (Railway auto-deploys).

## Final MCP tool inventory (18 tools)

| # | Tool | Description |
|---|------|-------------|
| 1 | `ls_get_context` | Graph stats, top nodes, dimensions, available skills |
| 2 | `ls_search_nodes` | Hybrid vector + keyword search with filters (node_type, event_after/before, sortBy, dimensions) |
| 3 | `ls_get_nodes` | Load full node records by ID (up to 10) |
| 4 | `ls_add_node` | Create a node (title + dimensions required) |
| 5 | `ls_update_node` | Update node fields (content appends to notes, dimensions replace) |
| 6 | `ls_query_edges` | Find connections between nodes |
| 7 | `ls_create_edge` | Connect two nodes with explanation |
| 8 | `ls_update_edge` | Update edge explanation |
| 9 | `ls_list_dimensions` | List all dimensions with node counts |
| 10 | `ls_create_dimension` | Create a dimension |
| 11 | `ls_update_dimension` | Rename/update a dimension |
| 12 | `ls_delete_dimension` | Delete a dimension and its node links |
| 13 | `ls_search_content` | Hybrid chunk search (vector + FTS5 + RRF) |
| 14 | `ls_sqlite_query` | Read-only SQL (SELECT/WITH/PRAGMA) |
| 15 | `ls_list_skills` | List system and custom skills |
| 16 | `ls_read_skill` | Read a skill by name |
| 17 | `ls_write_skill` | Create/overwrite a custom skill |
| 18 | `ls_delete_skill` | Delete a custom skill |

**Note:** All 18 tools are currently always available. Write-gating via `MCP_ALLOW_WRITES` env var is a planned follow-up to make external access read-only by default.

## Files deleted
- `app/api/[transport]/route.ts` (redundant HTTP MCP transport)
- `app/api/guides/` (guide API routes)
- `src/config/guides/` (old guide directory)
- `src/services/guides/` (guide service stub)
- `src/tools/guides/` (guide tool stubs)
- `src/components/panes/GuidesPane.tsx`
- `src/components/settings/` (entire directory — 10 files)
- `apps/mcp-server-standalone/guides/` (old guide directory)

## External repo changes
- `latent-space-bots`: Updated `mcpGraphClient.ts` and `index.ts` to use skill tool names. Pushed to main.
