# PRD 31: UI Polish & Documentation Refresh

**Status:** Draft | **Created:** 2026-03-07

## 1. Background

The hub UI needs a design pass — cleaner layout, light mode as the default, and fixing readability issues in the documentation pages (especially in light mode). While we're touching the docs rendering, we should also do a content pass to make sure the documentation itself is accurate and up to date after the PRD-29 guides-to-skills migration and HTTP transport removal.

## 2. Plan

1. Make light mode the default theme
2. Fix docs page readability in light mode
3. Design pass across core UI surfaces — cleaner, tighter, less visual noise
4. Events UI overhaul — top bar tab + calendar view
5. Content pass on all 5 documentation pages — update for current state

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

### Step 4: Events UI overhaul — top bar tab + calendar view

Events currently display as a plain list when selected from the sidebar. We want a dedicated Events experience with a calendar view.

#### 4a. Add Events tab to top bar

**File:** `src/components/layout/MainViewSwitcher.tsx`

- Add a new `'events'` option to the `MainView` type (currently: `'dashboard' | 'type' | 'feed' | 'map' | 'skills' | 'evals'`)
- Add an Events button to the top bar using the `CalendarDays` icon (from lucide-react, already used in sidebar)
- Position it after Map in the tab order: Dashboard | Type | Feed | Map | **Events**
- Clicking it sets `activeView` to `'events'`

**File:** `src/components/layout/ThreePanelLayout.tsx`

- Handle `activeView === 'events'` — render the new `EventsCalendarPane` in the main content area
- When Events view is active, the left sidebar can remain visible (for quick navigation) but the main area shows the calendar

#### 4b. Install a calendar library

**No calendar library exists in the project.** Evaluate and pick one:

| Library | Pros | Cons |
|---------|------|------|
| `react-big-calendar` | Full-featured (month/week/day), widely used, supports event rendering customization | Heavier, needs moment/date-fns adapter |
| `@schedule-x/react` | Modern, lightweight, good styling out of the box, month/week/day views | Newer, smaller community |
| `react-day-picker` | Very lightweight, great for simple month grids | No built-in event rendering — would need custom overlay |

**Recommendation:** `react-big-calendar` with `date-fns` as the localizer — it's the most mature option for displaying events on a calendar grid with custom event rendering. Alternatively, `@schedule-x/react` if we want something more modern and lighter.

Install:
```bash
npm install react-big-calendar date-fns
npm install -D @types/react-big-calendar
```

#### 4c. Build EventsCalendarPane

**New file:** `src/components/panes/EventsCalendarPane.tsx`

This is the main calendar view component:

- **Data source:** Fetch all event-type nodes via `/api/nodes?type=event&limit=200` (same query the sidebar uses)
- **Also include:** `paper-club` and `builders-club` node types (they have `event_date` and `event_status`)
- **Calendar mapping:** Map each event node to a calendar event object:
  ```typescript
  {
    id: node.id,
    title: node.title,
    start: new Date(node.event_date),
    end: new Date(node.event_date),  // events are single-slot; add 1hr default duration
    resource: {
      node_type: node.node_type,
      event_status: node.metadata?.event_status,
      event_type: node.metadata?.event_type,
      presenter_name: node.metadata?.presenter_name
    }
  }
  ```
- **Views:** Month view (default), with week view as secondary option
- **Event styling:**
  - Scheduled/upcoming events: green accent (matches existing green border treatment)
  - Completed events: muted/default color
  - Paper Club: purple accent badge
  - Builders Club: amber accent badge
  - Cancelled: strikethrough or grey
- **Click behavior:** Clicking a calendar event opens it in the FocusPanel (same as clicking from sidebar list)
- **Light/dark mode:** Must respect theme variables — calendar backgrounds, text, borders all use CSS vars
- **Today indicator:** Highlight today's date
- **Empty states:** Months with no events should still look clean

#### 4d. Calendar navigation & header

- Month/year navigation arrows (prev/next)
- "Today" button to jump back to current month
- Optional: toggle between Month and Week views
- Display count of upcoming events in header (e.g., "Events — 3 upcoming")

#### 4e. Coordinate with sidebar

When the Events top bar tab is active:
- The sidebar Events category should appear selected/highlighted for visual consistency
- Clicking an event in the sidebar list while in calendar view should scroll/navigate the calendar to that event's month
- The sidebar still works independently — selecting Events from sidebar when in Type view keeps existing list behavior

### Step 5: Documentation content pass

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
| `src/components/layout/ThreePanelLayout.tsx` | Modify — default theme to light, handle events view |
| `src/components/layout/MainViewSwitcher.tsx` | Modify — add Events tab with CalendarDays icon |
| `src/components/panes/EventsCalendarPane.tsx` | **New** — calendar view component |
| `app/layout.tsx` | Modify — initial theme attribute |
| `app/docs/[slug]/page.tsx` | Modify — fix light mode rendering |
| `src/config/docs/overview.md` | Review + update content |
| `src/config/docs/interfaces.md` | Review + update content |
| `src/config/docs/ingestion.md` | Review + update content |
| `src/config/docs/database.md` | Review + update content |
| `src/config/docs/evals.md` | Review + update content |
| `src/components/dashboard/*` | Modify — design pass |
| `src/components/layout/LeftTypePanel.tsx` | Modify — design pass, coordinate with events view |
| `src/components/focus/FocusPanel.tsx` | Modify — design pass |
| `src/components/views/*` | Modify — design pass |
| `src/components/panes/SkillsPane.tsx` | Modify — design pass |
| `src/components/panes/map/*` | Modify — light mode contrast |
| `package.json` | Modify — add calendar library dependency |

## 5. Open Questions

- Are there specific UI reference sites or design styles to aim for?
- Should the docs pages support a table of contents / sidebar navigation?
- Any specific pages or views that feel particularly broken right now?
- Calendar library choice: `react-big-calendar` (mature, full-featured) vs `@schedule-x/react` (modern, lighter)? Leaning toward react-big-calendar.
- Should the calendar show week/day views or just month?
- Should clicking an empty date slot in the calendar trigger event creation (future feature)?

---

**When complete:** Add `## COMPLETED` header with date and summary.

---

## COMPLETED
**Date:** 2026-03-08
**What was delivered:**

### Theme & Typography
1. **Theme system overhaul** — System preference is now the default. `prefers-color-scheme` media query auto-detects. Flash-of-wrong-theme prevented by inline script in `<head>`.
2. **Typography system** — Added Inter as proportional body font (`--font-body`). Mono remains for UI chrome (`--font-mono`). Body text in descriptions, notes, docs, list/grid views uses Inter at 14-15px with 1.6 line-height.
3. **Light mode token fixes** — `--text-primary` darkened to `#111`, `--bg-surface` increased contrast to `#f0f0f0`, borders strengthened to `#d0d0d0`, added `--card-shadow` for card definition. All hardcoded dark-mode colors (`#e0e0e0`, `#181818`, `#2f2f2f`, `#3a3a3a`) replaced with CSS variables.
4. **Theme toggle** — Replaced bulky moon-pill-sun switch with a single clean icon button (28px, no border, subtle hover). Shows moon in light mode, sun in dark.

### Documentation
5. **Docs page readability** — Full overhaul: all text uses CSS variables (no hardcoded colors), proper heading hierarchy (h1: 24px, h2: 20px, h3: 17px), visible table borders with header backgrounds, styled code blocks with borders, blockquotes with background. Theme toggle added to docs header.
6. **Docs sidebar** — Active state with `var(--accent-brand)` left border and surface background. Section links use mono font.
7. **Docs content pass** — Updated overview stats (~4,100+ nodes, ~8,100 edges), added Event node type to database docs, removed HTTP transport option from interfaces docs.

### Dashboard
8. **Recently Added section** — Shows 6 latest content nodes with type badge, title, and date above the category grid.
9. **Stat pills & category cards** — Visible borders (`--border-subtle`) and `box-shadow` in light mode. Category cards show border on hover.
10. **ASCII header stats line** — Uses `--text-secondary` for better contrast in both modes.

### Core UI Surfaces
11. **MainViewSwitcher** — Added Events tab with CalendarDays icon. Active tab shows `var(--accent-brand)` bottom border. Breadcrumb lighter weight.
12. **ListView & GridView** — Descriptions use body font. Consistent border-radius (4px/8px). Type badges use brand accent. Cards have subtle shadows in light mode.
13. **KanbanView** — Column headers use `var(--font-mono)` with weight 500.
14. **Focus Panel** — Default tab changed from Notes → Description. Tab order: Description | Notes | Source. Active indicator uses `var(--accent-brand)`. Inactive tabs use `var(--text-muted)`.
15. **Map pane** — Light mode already handled in `map-styles.css` (background `#f8f8f8`, expanded node styling). CSS variables ensure proper contrast.

### Events
16. **Events Calendar** — New `EventsCalendarPane` with month grid view. Color-coded events (green=upcoming, purple=paper-club, amber=builders-club, grey=completed/cancelled). Today indicator, prev/next/today nav. No external dependency — pure React. Fetches event, paper-club, builders-club types in parallel.
17. **Upcoming styling** — Bolder badge (10px, weight 700), thicker 3px green left border, green dot in section header. All greens use `var(--success)` for light mode compatibility.
18. **Dates** — Bumped to 13px, font-weight 600, mono font, `var(--text-secondary)` — clearly visible in both modes.
19. **Presenter avatars** — Paper Club and Builders Club lists show presenter's Discord avatar (32px circle) next to each title. Fetches member nodes to build name→avatar map. Falls back to initial letter circle.
