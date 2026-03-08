# PRD: Final UI/UX Cleanup

**Status:** Draft | **Created:** 2026-03-08

## 1. Background

Residual layout abstractions from the old RA-H open-source repo are causing naming confusion and could introduce subtle bugs. The three-panel layout is actually two panels, the focus/tab system lingers from a multi-pane design we no longer use, and the Paper Club category view doesn't show upcoming events even though the Events calendar does.

## 2. Plan

1. Audit and rename ThreePanelLayout — confirm no third panel renders, rename to reflect reality, clean up dead code (SplitHandle)
2. Audit focus/tab state — confirm it clears properly, doesn't cause stale state, decide if multi-tab support should stay or be simplified
3. Fix Paper Club not showing upcoming events — the sort+limit combination excludes future-dated nodes

## 3. Implementation Details

### Step 1: Layout Naming Cleanup

**Problem:** `ThreePanelLayout` is a misnomer. The component renders two panels:
- Left: `LeftTypePanel` (sidebar navigation, 260px / 48px collapsed)
- Main: workspace area (Dashboard, Feed, Map, Events, node detail, etc.)

`SplitHandle.tsx` exists but is completely unused — dead code from the old split-pane design.

**Files:**
- `src/components/layout/ThreePanelLayout.tsx` — Rename to `AppLayout.tsx`
- `src/components/layout/SplitHandle.tsx` — Delete (unused, only referenced in old PRD docs)
- `app/page.tsx` — Update import from `ThreePanelLayout` to `AppLayout`
- Any other imports of `ThreePanelLayout` (grep to find)

**Rules:**
- Rename the component and file, update all imports
- Do NOT restructure the component internals — it works, just has a misleading name
- Delete `SplitHandle.tsx` only if confirmed unused (grep for imports)
- Keep the layout flexible enough that a third panel could be added later if needed — this is just a naming fix, not an architecture change

### Step 2: Focus/Tab State Audit

**Problem:** When a node is clicked, it opens in a tabbed `NodePane` with `openTabs` and `activeTab` state. This is a remnant of the old multi-pane design where you could have several nodes open simultaneously across panels. The user reports that nodes "somehow stay in focus."

**Current behavior (confirmed by code review):**
- `openTabs: number[]` and `activeTab: number | null` are ephemeral (not persisted to localStorage)
- They ARE cleared when switching category types or major views (Dashboard, Feed, Map, etc.)
- They survive navigation within the same context (e.g., browsing within Feed view)
- Multiple tabs can be open — the NodePane header shows draggable tabs with close buttons

**Decision needed:** The multi-tab system works and isn't broken. Two options:

**Option A — Keep tabs, add clear affordance (recommended):**
- Add a visible "Close all tabs" or "Back to list" button when NodePane is showing
- Ensure clicking the same category type in the sidebar clears focus (currently it does)
- No structural changes

**Option B — Simplify to single-node focus:**
- Remove `openTabs` array, keep only `activeTab`
- Remove tab bar from NodePane
- Clicking a new node replaces the current one
- Simpler but loses the ability to compare nodes

**Implementation (Option A):**
- `src/components/layout/ThreePanelLayout.tsx` (or `AppLayout.tsx` after rename):
  - Verify all view-switch paths clear `activeTab` and `openTabs`
  - Add a "← Back" button visible when `showingFocusedNode` is true
- `src/components/panes/NodePane.tsx`:
  - Keep tab system as-is
  - Ensure tab close button works reliably
  - When last tab is closed, return to previous view

### Step 3: Fix Paper Club Upcoming Events

**Problem:** Clicking "Paper Club" in the sidebar shows only past paper clubs. The "Events" calendar view shows upcoming paper clubs at the top. Users expect to see upcoming paper clubs in the Paper Club category view.

**Root cause:** The `TypeNodeList` component (inline in ThreePanelLayout.tsx) fetches:
```
/api/nodes?type=paper-club&limit=100&sortBy=event_date
```

The API sorts `event_date DESC NULLS LAST`. With limit=100, if there are many past paper clubs, the 100-item window may not include future-dated ones. The client-side upcoming/past split then has no upcoming nodes to display.

Meanwhile, `EventsCalendarPane` fetches with `limit=200` and does its own client-side date filtering, so it catches upcoming events.

**Fix — two changes:**

1. **API-level:** In `src/services/database/nodes.ts`, when `sortBy=event_date`, use a smarter sort that puts upcoming events first:
   ```sql
   ORDER BY
     CASE WHEN n.event_date >= date('now') THEN 0 ELSE 1 END,
     CASE WHEN n.event_date >= date('now') THEN n.event_date END ASC,
     CASE WHEN n.event_date < date('now') THEN n.event_date END DESC
   ```
   This puts upcoming events first (sorted ASC by date), then past events (sorted DESC by date). With limit=100, upcoming events are guaranteed to appear.

2. **Client-level:** In the `TypeNodeList` component (ThreePanelLayout.tsx lines 114-139), verify the upcoming/past split logic works for `paper-club` type:
   - Currently checks `(n.event_date || '') >= today` for upcoming
   - This should work correctly once the API returns upcoming events in the result set
   - Confirm `hasEventSections` is true for `paper-club` type (it should be — line 110 checks `['event', 'paper-club', 'builders-club']`)

**Files:**
- `src/services/database/nodes.ts` — Fix `event_date` sort order
- `src/components/layout/ThreePanelLayout.tsx` — Verify client-side upcoming/past split includes `paper-club`

## 4. Open Questions / Notes

- **Tab system:** Leaning toward Option A (keep tabs, add back button). The tab system isn't broken and could be useful. But if it causes confusion, Option B is a clean simplification. Decide during implementation.
- **SplitHandle:** Confirm zero imports before deleting. If it's imported in a type file but never used at runtime, still delete.
- **Events sort change:** The new sort order affects ALL types that use `sortBy=event_date`, not just paper-club. Verify this doesn't break anything for other event-like types (builders-club, event). It shouldn't — showing upcoming first is the right default for all event types.
- **Limit:** Consider bumping the TypeNodeList fetch limit from 100 to 200 for event-like types as a safety net.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
