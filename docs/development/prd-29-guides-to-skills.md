# PRD 29: Guides to Skills Migration

**Status:** Ready | **Created:** 2026-03-07 | **Updated:** 2026-03-07

## 1. Background

RA-H completed a full guides-to-skills migration (2026-03-07). The migration:
- Renamed all "guide" surfaces to "skills" (service, tools, API, MCP, UI)
- Consolidated 7 operational guides into 1 `db-operations` skill
- Added 8 curated system skills with clear trigger/contract/success-criteria structure
- Dropped immutability (all skills editable/deletable)
- Kept backward compatibility via guide service aliases

Latent Space Hub still uses the old "guides" system with 6 bundled markdown files. We need to do the same migration, but adapted for LS Hub's context: this is a **public-facing knowledge base**, not a personal tool. The skills here serve two audiences:

1. **MCP agent skills** — operational procedures the bot/agent reads during execution (search policy, graph operations, content types)
2. **User-facing guides** — learning content humans browse in the UI (agent engineering, context engineering, onboarding)

### What exists today

**Bundled guides** (`src/config/guides/`):
| Guide | Purpose | Keep? |
|-------|---------|-------|
| `welcome.md` | Onboarding — what is LS Hub, where to start | Yes — refine |
| `agent-engineering.md` | Curated learning path on building AI agents | Yes — refine |
| `context-engineering.md` | Curated learning path on context/memory management | Yes — refine |
| `mcp-quickstart.md` | 2-minute MCP setup for Claude Code/Cursor | Yes — refine |
| `bots.md` | Slop bot documentation | Yes — refine |
| `categories.md` | 8 content categories reference | Yes — merge into welcome or drop |

**MCP standalone guides** (`apps/mcp-server-standalone/guides/system/`):
| Guide | Purpose | Keep? |
|-------|---------|-------|
| `start-here.md` | DB operations startup | Merge into `db-operations` skill |
| `schema.md` | Database schema reference | Merge into `db-operations` skill |
| `search.md` | Search tool docs | Merge into `db-operations` skill |
| `content-types.md` | Content types reference | Merge into `db-operations` skill |
| `member-profiles.md` | Member profile system | Merge into `db-operations` skill |

**Service layer:** `src/services/guides/guideService.ts` — filesystem-based, readonly mode support, uses `gray-matter` for frontmatter parsing.

**UI:** `GuidesPane.tsx` (sidebar browser) + `GuidesViewer.tsx` (settings editor).

**Tools:** `src/tools/guides/` — listGuides, readGuide, writeGuide.

**API:** `app/api/guides/` — GET list, GET/PUT/DELETE by name.

**MCP:** `ls_list_guides`, `ls_read_guide`, `ls_write_guide`, `ls_delete_guide`.

## 2. Decisions

### What skills should exist

**System skills** (bundled, agent-facing — following RA-H's refined structure):

| Skill | Source | Description |
|-------|--------|-------------|
| `db-operations` | **New** — consolidate 5 MCP standalone guides | Core graph read/write policy. Search before create, description standards, edge rules, dimension governance. |
| `curation` | **New** | Content quality standards, entity extraction rules, dedup policy, metadata expectations. |

**User-facing guides** (bundled, human-readable — displayed in UI):

| Guide | Source | Description |
|-------|--------|-------------|
| `welcome` | Refine existing | What is LS Hub, the 8 categories, how to explore, where to start. Absorb `categories.md` content. |
| `agent-engineering` | Refine existing | Curated learning path through agent design fundamentals and frontiers. |
| `context-engineering` | Refine existing | Learning path on context/memory management for AI systems. |
| `mcp-quickstart` | Refine existing | 2-minute setup guide for connecting MCP to Claude Code/Cursor. |
| `slop` | Refine `bots.md` | Slop bot — what it does, how to interact, how it works. Rename from `bots.md` since Sig is deprecated. |

### Architecture decisions

1. **Rename everything from "guides" to "skills"** — service, tools, API routes, MCP tools, UI labels, pane types
2. **Two skill categories:**
   - `system/` — agent-facing operational skills (db-operations, curation)
   - `guides/` — user-facing learning content (welcome, agent-engineering, etc.)
3. **No immutability enforcement** — matches RA-H's final decision. All skills editable.
4. **No consolidation of user guides** — they're learning paths, not overlapping policy docs
5. **Consolidate MCP standalone guides** — 5 operational guides → 1 `db-operations` skill (matching RA-H pattern)
6. **User skills:** max 10 custom skills allowed
7. **Backward compatibility** — guide service becomes a stub delegating to skill service, old API routes delegate, old MCP tool names still work
8. **Readonly mode** — in production (Vercel), use bundled skills only, no filesystem writes
9. **Skill frontmatter structure** (matching RA-H):
   ```yaml
   ---
   name: DB Operations
   description: "Core graph read/write policy."
   when_to_use: "Any graph read/write operation."
   when_not_to_use: "Pure conversation."
   success_criteria: "Writes are explicit and correct."
   ---
   ```

### UI: Guides visible to users

Add a **read-only guides section** in the UI where users can browse the user-facing guides (welcome, agent-engineering, context-engineering, mcp-quickstart, slop). This replaces the current GuidesPane.

- Users can read but not edit system guides
- Clean markdown rendering with the existing styling
- No settings/editor UI for system guides
- The settings panel (`SkillsSettings`) only shows user-created custom skills

## 3. Implementation

### Part 1: Skill Service Layer

**Create:** `src/services/skills/skillService.ts`

Port from RA-H's `skillService.ts` with LS adaptations:
- `listSkills()` → `SkillMeta[]` (name, description, category: 'system' | 'guide' | 'user')
- `readSkill(name)` → `Skill | null`
- `writeSkill(name, content)` → writes to user skills dir, max 10 enforced
- `deleteSkill(name)` → deletes user skills only

Storage:
- System skills: `src/config/skills/system/` (bundled, checked in)
- User guides: `src/config/skills/guides/` (bundled, checked in)
- User skills: `~/.latent-space-hub/skills/` (runtime, local only)
- Readonly mode: bundled only, no filesystem

Legacy redirect map:
```typescript
const LEGACY_REDIRECTS: Record<string, string> = {
  'start-here': 'db-operations',
  'schema': 'db-operations',
  'search': 'db-operations',
  'content-types': 'db-operations',
  'member-profiles': 'db-operations',
  'bots': 'slop',
};
```

**Modify:** `src/services/guides/guideService.ts` — convert to stub:
```typescript
export { listSkills as listGuides, readSkill as readGuide, writeSkill as writeGuide } from '../skills/skillService';
```

### Part 2: Skill Content

**Create:** `src/config/skills/system/`
- `db-operations.md` — consolidate the 5 MCP standalone guides (start-here, schema, search, content-types, member-profiles) into one comprehensive graph operations skill. Follow RA-H's structure: core rules, search-before-create, description standards, edge conventions, dimension policy.
- `curation.md` — content quality standards, entity extraction expectations, dedup rules, metadata requirements.

**Create:** `src/config/skills/guides/`
- Move + refine existing guides:
  - `welcome.md` — absorb `categories.md` content, tighten
  - `agent-engineering.md` — refine to match RA-H's cleaner skill structure
  - `context-engineering.md` — same
  - `mcp-quickstart.md` — same
  - `slop.md` — rename from `bots.md`, update for Slop-only

**Delete:** `src/config/guides/` directory (after migration)

**Update:** `apps/mcp-server-standalone/`
- Move `guides/system/` → `skills/system/`
- Replace 5 individual files with single `db-operations.md`
- Add `curation.md`
- Update custom skills path from `guides/custom/` to `skills/custom/`

### Part 3: Skill Tools

**Create:** `src/tools/skills/`
- `listSkills.ts` — wraps `listSkills()`
- `readSkill.ts` — wraps `readSkill(name)`
- `writeSkill.ts` — wraps `writeSkill(name, content)`, broadcasts `skills:updated`
- `deleteSkill.ts` — wraps `deleteSkill(name)`

**Modify:** `src/tools/guides/*.ts` — delegate to skill equivalents

### Part 4: API Routes

**Create:** `app/api/skills/route.ts` — GET list
**Create:** `app/api/skills/[name]/route.ts` — GET read, PUT update, DELETE delete

**Modify:** `app/api/guides/route.ts` — delegate to skills
**Modify:** `app/api/guides/[name]/route.ts` — delegate to skills

### Part 5: UI

**Create:** `src/components/panes/SkillsPane.tsx`
- Two sections: "Guides" (user-facing learning content) and "Skills" (operational + user-created)
- Click any skill/guide to read full content (markdown rendered)
- Read-only for system skills and guides
- Edit/delete buttons only for user-created skills
- "New Skill" button (max 10 user skills)
- Event listener on `skills:updated`

**Create:** `src/components/settings/SkillsSettings.tsx`
- Settings panel for managing user-created skills only
- Create, edit, delete custom skills
- System skills listed but not editable
- Replaces `GuidesViewer.tsx` in settings modal

**Modify:** `src/components/panes/types.ts`
- Rename pane type: `'guides'` → `'skills'`
- Update `PANE_LABELS`, `DEFAULT_SLOT_B`

**Modify:** `src/components/layout/LeftToolbar.tsx`
- Update icon mapping and label: `skills: FileText`, label `'Skills'`

**Modify:** `src/components/layout/ThreePanelLayout.tsx`
- Update pane type references from `guides` to `skills`
- Import `SkillsPane` instead of `GuidesPane`

**Modify:** `src/components/settings/SettingsModal.tsx`
- Replace `GuidesViewer` tab with `SkillsSettings`

### Part 6: MCP Server Updates

**Modify:** `apps/mcp-server-standalone/index.js`
- Rename functions: `listGuides` → `listSkills`, `readGuideFile` → `readSkillFile`, etc.
- Rename tools: `ls_list_guides` → `ls_list_skills`, `ls_read_guide` → `ls_read_skill`, etc.
- Keep old tool names as aliases for backward compatibility
- Update `ls_get_context` to return `skills` field
- Move file paths from `guides/` to `skills/`

**Modify:** `app/api/[transport]/route.ts`
- Add `ls_list_skills`, `ls_read_skill` tools
- Keep `ls_list_guides`, `ls_read_guide` as aliases

### Part 7: Documentation + Cleanup

**Modify:**
- `CLAUDE.md` — update directory listing, mention skills not guides
- `docs/contributing.md` — update references
- `docs/architecture.md` — update if it mentions guides

**Delete after migration:**
- `src/config/guides/` (replaced by `src/config/skills/`)
- `src/components/panes/GuidesPane.tsx` (replaced by `SkillsPane.tsx`)
- `src/components/settings/GuidesViewer.tsx` (replaced by `SkillsSettings.tsx`)
- `apps/mcp-server-standalone/guides/` (replaced by `skills/`)

## 4. Files

| File | Action |
|------|--------|
| `src/services/skills/skillService.ts` | Create |
| `src/services/guides/guideService.ts` | Modify → stub |
| `src/config/skills/system/db-operations.md` | Create |
| `src/config/skills/system/curation.md` | Create |
| `src/config/skills/guides/welcome.md` | Create (move + refine) |
| `src/config/skills/guides/agent-engineering.md` | Create (move + refine) |
| `src/config/skills/guides/context-engineering.md` | Create (move + refine) |
| `src/config/skills/guides/mcp-quickstart.md` | Create (move + refine) |
| `src/config/skills/guides/slop.md` | Create (move + rename + refine) |
| `src/tools/skills/listSkills.ts` | Create |
| `src/tools/skills/readSkill.ts` | Create |
| `src/tools/skills/writeSkill.ts` | Create |
| `src/tools/skills/deleteSkill.ts` | Create |
| `src/tools/guides/*.ts` | Modify → delegate |
| `app/api/skills/route.ts` | Create |
| `app/api/skills/[name]/route.ts` | Create |
| `app/api/guides/route.ts` | Modify → delegate |
| `app/api/guides/[name]/route.ts` | Modify → delegate |
| `src/components/panes/SkillsPane.tsx` | Create |
| `src/components/settings/SkillsSettings.tsx` | Create |
| `src/components/panes/types.ts` | Modify |
| `src/components/layout/LeftToolbar.tsx` | Modify |
| `src/components/layout/ThreePanelLayout.tsx` | Modify |
| `src/components/settings/SettingsModal.tsx` | Modify |
| `apps/mcp-server-standalone/index.js` | Modify |
| `app/api/[transport]/route.ts` | Modify |
| `src/config/guides/` | Delete (after migration) |
| `src/components/panes/GuidesPane.tsx` | Delete |
| `src/components/settings/GuidesViewer.tsx` | Delete |
| `CLAUDE.md` | Modify |

## 5. Done =

- [x] Skill service layer created with list/read/write/delete
- [x] Guide service converted to compatibility stub
- [x] 2 system skills created (db-operations, curation)
- [x] 5 user-facing guides refined and moved to skills/guides/
- [x] Skill tools created (internal)
- [x] API routes created with legacy delegation
- [x] SkillsPane shows guides (read-only) and skills (editable for user-created)
- [x] SkillsSettings replaces GuidesViewer in settings
- [x] MCP standalone server updated with skill tools
- [x] MCP HTTP server updated with skill tools
- [x] Old guide files, components, and MCP guides deleted
- [x] CLAUDE.md and docs updated
- [x] `npm run type-check` passes
- [x] `npm run build` passes

### Phase 2 (post-initial)

- [x] **Skills view in UI** — added as selectable view from left nav sidebar (not top nav), opens SkillsPane in main content area
- [x] **Settings panel removed** — entire settings modal and all 10 sub-components deleted (SettingsModal, ToolsViewer, ApiKeysViewer, DatabaseViewer, ContextViewer, ExternalAgentsPanel, LogsViewer, LogsRow, GuidesViewer, SkillsSettings). Settings button removed from LeftTypePanel.
- [x] **Evals view in UI** — EvalsClient moved from separate /evals page into main app, accessible via left nav sidebar. Theme-aware (CSS variables instead of hardcoded dark colors).
- [x] **Flattened skill structure** — removed `system/` and `guides/` subdirectories. All skills live in one flat `src/config/skills/` directory. Removed `SkillCategory` type and `category` field from service, API, and UI. SkillsPane shows a flat list with no section headers.
- [x] **`start-here` skill created** — agent orientation skill that acts as a system-message equivalent for external agents. Covers: what the graph is, content types, entity types, how to search content, how to add members. Links out to `db-operations` and `curation` for detailed operational guidance.
- [x] **MCP server instructions updated** — server `instructions` field now says "Call ls_read_skill('start-here') first for orientation"
- [x] **MCP standalone skills flattened** — `skills/system/` → `skills/` with `start-here.md` added
- [x] NPM republish required for Discord bot to see new skills

### Phase 3 (guide removal)

- [x] **Removed all backward-compatible guide aliases** — deleted 4 redundant tools (ls_list_guides, ls_read_guide, ls_write_guide, ls_delete_guide) from both MCP standalone server and HTTP transport route
- [x] **Deleted all guide artifacts** — `src/config/guides/`, `src/services/guides/`, `src/tools/guides/`, `app/api/guides/`, `apps/mcp-server-standalone/guides/`
- [x] **Renamed events** — `GUIDE_UPDATED` → `SKILL_UPDATED` in events.ts, writeSkill.ts, deleteSkill.ts, ThreePanelLayout.tsx; `guides:updated` → `skills:updated` in SkillsPane.tsx
- [x] **Updated all docs** — architecture.md, interfaces.md, deployment.md, agents.md, handover/setup.md, CLAUDE.md, src/config/docs/interfaces.md (user-facing)
- [x] **Updated MCP standalone** — package.json files field `guides/system` → `skills`, README tool list updated
- [x] **CSS class rename** — `guide-content` → `skill-content` in SkillsPane
- [x] Type-check passes, build passes

---
## COMPLETED
**Date:** 2026-03-07
**What was delivered:**

**Phase 1:** Full guides-to-skills migration. Created skill service layer, 2 operational skills (db-operations consolidating 5 MCP guides, curation), 5 refined user-facing guides. MCP standalone and HTTP servers updated with ls_list_skills/ls_read_skill tools plus backward-compatible guide aliases. Guide service converted to stub.

**Phase 2:** Removed all skill categories — no more system/guide/user distinction, just "skills". Created `start-here` orientation skill covering the two primary agent use cases (answering content questions, adding members). Added Skills and Evals as views in the left sidebar. Removed entire settings panel (2,862 lines deleted). Made EvalsClient theme-aware. MCP server instructions updated to reference start-here.

**Phase 3:** Complete guide elimination. Removed all 4 backward-compatible guide alias tools, deleted all guide directories/services/routes/tools, renamed events and CSS classes, updated all documentation. Zero references to "guides" remain in active code or docs (only in archive/ and natural English prose). NPM package needs republishing (version bump from 0.2.0).
