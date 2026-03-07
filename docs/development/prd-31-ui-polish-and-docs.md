# PRD 31: UI Polish & Documentation Refresh

**Status:** Draft | **Created:** 2026-03-07

## 1. Background

The hub UI needs a design pass — cleaner layout, light mode as the default, and fixing readability issues in the documentation pages (especially in light mode). While we're touching the docs rendering, we should also do a content pass to make sure the documentation itself is accurate and up to date after the PRD-29 guides-to-skills migration and HTTP transport removal.

## 2. Plan

1. Make light mode the default theme
2. Fix docs page readability in light mode
3. Design pass across core UI surfaces — cleaner, tighter, less visual noise
4. Content pass on all 5 documentation pages — update for current state

## 3. Implementation Details

### Step 1: Light mode as default

**File:** `src/components/layout/ThreePanelLayout.tsx` (or wherever theme initialization happens)

- Change the default theme from `'dark'` to `'light'`
- Ensure the theme persists in localStorage so users who prefer dark can switch and stay
- Verify all CSS variables in the light theme tokens are correct and complete

**File:** `app/layout.tsx` or global styles

- Make sure the initial HTML render doesn't flash (set `data-theme="light"` on `<html>` before hydration)

### Step 2: Fix documentation readability in light mode

**Files:** `app/docs/[slug]/page.tsx` and related doc rendering components

Current issues in light mode:
- Text contrast too low — body text is hard to read
- Code blocks blend into background
- Table borders barely visible
- Heading hierarchy unclear

Fixes:
- Ensure all doc page text uses `var(--text-primary)` / `var(--text-secondary)` (not hardcoded colors)
- Code blocks: use `var(--bg-surface)` background with clear border in light mode
- Tables: visible borders using `var(--border-default)`
- Headings: proper weight and color contrast
- Links: use `var(--accent-primary)` with visible underline
- Blockquotes: visible left border + muted background

### Step 3: UI design pass

General principles: reduce visual noise, tighter spacing, cleaner borders, more whitespace.

**Dashboard (`src/components/dashboard/`)**
- Review category card styling — cleaner borders, consistent padding
- Stats row — tighten spacing, ensure numbers are prominent
- Light mode: verify card backgrounds don't blend into page background

**Sidebar (`src/components/layout/LeftTypePanel.tsx`)**
- Review icon + label alignment
- Active state visibility in light mode
- Hover states — subtle but clear

**Focus Panel (`src/components/focus/FocusPanel.tsx`)**
- Tab styling — active tab should be clearly distinct in light mode
- Metadata display — tighter, cleaner layout
- Source reader — verify readability in light mode

**List/Grid/Kanban views**
- Card borders and shadows in light mode
- Text hierarchy — title vs description vs metadata
- Hover states

**SkillsPane**
- Skill card styling — verify light mode
- Markdown rendering — same fixes as docs (contrast, code blocks)

**Map pane**
- Node and edge colors in light mode — ensure sufficient contrast

### Step 4: Documentation content pass

Review and update all 5 doc pages in `src/config/docs/`:

**`overview.md`**
- Verify stats, category list, feature descriptions match current state
- Remove any references to guides, settings panel, HTTP transport
- Update tool count (18 tools, single NPX server)

**`interfaces.md`**
- Already partially updated in PRD-29 — verify completeness
- Remove HTTP transport setup option
- Verify Discord bot section is accurate

**`ingestion.md`**
- Verify source list (podcasts, articles, ainews, latentspacetv)
- Verify series detection description (builders-club, paper-club, workshop)
- Check cron schedule description

**`database.md`**
- Verify schema description matches actual Turso tables
- Check any references to local SQLite or better-sqlite3

**`evals.md`**
- Verify description matches current evals implementation
- Update if needed for theme-aware changes from PRD-29

## 4. Files

| File | Action |
|------|--------|
| `src/components/layout/ThreePanelLayout.tsx` | Modify — default theme to light |
| `app/layout.tsx` | Modify — initial theme attribute |
| `app/docs/[slug]/page.tsx` | Modify — fix light mode rendering |
| `src/config/docs/overview.md` | Review + update content |
| `src/config/docs/interfaces.md` | Review + update content |
| `src/config/docs/ingestion.md` | Review + update content |
| `src/config/docs/database.md` | Review + update content |
| `src/config/docs/evals.md` | Review + update content |
| `src/components/dashboard/*` | Modify — design pass |
| `src/components/layout/LeftTypePanel.tsx` | Modify — design pass |
| `src/components/focus/FocusPanel.tsx` | Modify — design pass |
| `src/components/views/*` | Modify — design pass |
| `src/components/panes/SkillsPane.tsx` | Modify — design pass |
| `src/components/panes/map/*` | Modify — light mode contrast |

## 5. Open Questions

- Are there specific UI reference sites or design styles to aim for?
- Should the docs pages support a table of contents / sidebar navigation?
- Any specific pages or views that feel particularly broken right now?

---

**When complete:** Add `## COMPLETED` header with date and summary.
