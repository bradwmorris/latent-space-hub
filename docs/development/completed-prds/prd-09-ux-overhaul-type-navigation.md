# PRD 09: UX Overhaul — Collapsible Type Navigation + Simplified Main Workspace

## Background

The current app UX is powerful but too complex for the primary flow we now want.

Today, the core UI is implemented as a flexible pane workspace:
- `src/components/layout/ThreePanelLayout.tsx` manages two dynamic slots (`slotA`, `slotB`) with split-resize and pane swapping.
- `src/components/layout/LeftToolbar.tsx` toggles pane types (`views`, `map`, `dimensions`, `guides`) plus search/add/settings.
- `src/components/panes/ViewsPane.tsx` + `src/components/views/ViewsOverlay.tsx` provide feed/list/grid/kanban behavior driven by dimensions.
- `src/components/panes/DimensionsPane.tsx` + `src/components/nodes/FolderViewOverlay.tsx` provide dimension-folder browsing, drag/drop, saved views, and dimension editing.
- `src/components/panes/GuidesPane.tsx` duplicates guide browsing in primary navigation, while guides also already exist in Settings via `src/components/settings/GuidesViewer.tsx`.

This architecture creates unnecessary cognitive load for the target product flow. We need a clear, simpler information architecture:
- A single collapsible left panel for navigation.
- Left panel grouped by **Type** folders (not Dimensions).
- Main area focused on the selected content.
- Top-level view icons in main area so users can switch between Map, Feed, and Type Folder view.
- Guides removed from primary navigation and retained in Settings.

## Product Intent

Create a clean, simple, high-signal interface where:
1. Users browse node collections by **type** from a left collapsible panel.
2. Users click any type folder to open nodes in main workspace.
3. Users can switch main rendering mode with top icons (`Map`, `Feed`, `Type`).
4. Settings remains the home for advanced tooling, including Guides.

## Goals

1. Replace the pane-centric mental model with a simple nav + content model.
2. Make `type` the primary grouping primitive in navigation.
3. Keep Feed and Map available as first-class views without bringing back multi-pane complexity.
4. Reduce visual and interaction complexity while preserving critical power-user functionality (search, node open, settings access).
5. Preserve compatibility with current schema naming (`node_type`) while supporting requested product language (`type`).

## Non-Goals

1. Rewriting node editor semantics in `FocusPanel`.
2. Replacing map rendering internals (`MapPane` physics/graph logic).
3. Removing dimensions from the data model or node metadata.
4. Major visual redesign of Settings internals beyond navigation organization.

## UX Principles

1. One obvious navigation rail, one obvious workspace.
2. Type-first browsing in nav; content-first rendering in workspace.
3. No hidden dual-pane state.
4. Fast switching between views without losing current selection context.
5. Keep advanced controls in Settings, not main navigation.
6. Visual style should match Codex desktop screenshot direction: restrained, neutral, minimal.

## Visual Direction (Codex-Matched)

Design and styling for this project should intentionally copy the Codex UI style shown in the provided screenshot.

1. Use a monochrome/neutral palette only.
- Remove purple/green accent identity from current app shell.
- Use grayscale surfaces, borders, text hierarchy, and subtle hover states.
2. Maintain low-contrast, clean dark surfaces with minimal ornament.
3. Use simple rounded corners, thin borders, and compact icon buttons.
4. Prefer calm depth (subtle shadows/overlays) over saturated color cues.
5. Keep typography understated and consistent; no decorative visual flourishes.
6. Preserve readability and contrast, but avoid bright branded highlight colors.
7. Left nav + main content proportions should visually mirror the Codex screenshot layout pattern.
8. Use Latent Space brand font choice: `Tachyon` as the primary display/brand face.

### Typography Spec

1. Primary display/brand font: `Tachyon` (Latent Space brand font).
2. UI/body fallback stack should remain clean and neutral for readability.
3. Use `Tachyon` for key navigational and heading moments (app title, major section labels), not dense body copy.
4. Maintain consistent type scale and spacing aligned with Codex-like restraint.

### Explicit Styling Constraint

- During implementation, any existing vivid accent colors in layout/navigation components should be replaced with neutral grayscale equivalents unless required for accessibility states.

## Current-State Findings (from code)

### Navigation Complexity

- Current left UI is a 50px icon-only toolbar (`LeftToolbar`) that controls pane state, not content state.
- Users must understand slot A/B behavior, pane replacement rules, split behavior, drag-drop across slots, and collapsible/close semantics.

### Dimension-Centric Browsing

- Both `ViewsOverlay` and `FolderViewOverlay` are built around dimensions as primary filters/groupings.
- This conflicts with the desired type-folder mental model.

### Guides Duplication

- Guides exist in main pane navigation (`GuidesPane`) and in Settings (`GuidesViewer`).
- Desired IA is to remove guides from primary nav and keep them under Settings only.

### Schema Naming Mismatch Risk

- Code uses `node_type` as canonical (`setup-schema.mjs`, `types/database.ts`, `app/api/nodes/route.ts`, `services/database/nodes.ts`).
- Product request refers to `type` column. We need explicit compatibility mapping in API/UI contract.

## Target Information Architecture

### Layout

```
┌───────────────────────────────┬──────────────────────────────────────────┐
│ Left Collapsible Type Panel   │ Main Workspace                           │
│                               │                                          │
│ - Search (optional quick)     │ Top bar: [Type] [Feed] [Map] icons      │
│ - Type folders (expand/collapse) │ Content based on selected view/state  │
│   - episode (count)           │                                          │
│   - person (count)            │ - Type view: nodes in selected type      │
│   - organization (count)      │ - Feed view: chronological feed           │
│   - ...                       │ - Map view: graph                         │
└───────────────────────────────┴──────────────────────────────────────────┘
```

### View Modes

- **Type View**: Primary/default. Shows nodes for selected type.
- **Feed View**: Existing feed behavior, simplified (no dimension-column complexity by default).
- **Map View**: Existing map behavior.

### Selection Model

- Left panel selection drives main content context.
- Clicking a node opens/focuses it in the main workspace.
- View switching preserves current selected type and selected node where possible.

## Functional Requirements

### 1) Left Collapsible Type Panel

1. Fixed left panel with collapse/expand toggle.
2. Shows folder-like rows for each available type with count badge.
3. Folder rows are expandable to reveal nodes for that type (virtualized/paginated as needed).
4. Clicking folder header sets active type in workspace.
5. Clicking node opens it in main workspace.
6. Panel state persists (collapsed state, expanded folders, last selected type).
7. Empty states:
- No types available.
- Type exists but has no nodes.

### 2) Type Semantics and Data Contract

1. UI language uses `Type`.
2. Data contract supports both naming conventions:
- Canonical internal field remains `node_type` in current code.
- API accepts `type` as alias for forward compatibility.
3. Add API support for type summaries:
- `GET /api/types` returns type list with counts.
4. Add API filtering for nodes by type:
- Existing `/api/nodes?node_type=...` remains.
- Add alias support `/api/nodes?type=...`.

### 3) Main Workspace with Top View Icons

1. Add a top-level view switcher in workspace header (`Type`, `Feed`, `Map`).
2. Icons must be visible and discoverable in main content area (not hidden in left toolbar-only model).
3. Switching views does not reset selected type unless incompatible.
4. If a type is selected and user enters Feed, feed may optionally pre-filter by that type (configurable behavior; default ON for coherence).
5. If user enters Map, selected node/type influences highlighted context if available.

### 4) Remove Guides from Primary Navigation

1. Remove Guides as a top-level main navigation pane/view.
2. Keep Guides management/reading in Settings via existing `GuidesViewer` and APIs.
3. Any deep-links to guides from nav should redirect to Settings > Guides.

### 5) Settings Placement

1. Settings remains accessible from main UI.
2. Guides tab remains in Settings sidebar.
3. No duplicate guide navigation entry in primary workspace nav.

### 6) Simplicity Constraints

1. No slot A/B interaction model in new UX.
2. No split handle interaction in default UX.
3. No pane swapping or cross-slot drag-drop in main UX.
4. Preserve keyboard shortcuts where useful (`Cmd+K`, etc.), but do not introduce multi-pane shortcuts.
5. Main shell styling must follow the Codex screenshot aesthetic (neutral, minimal, restrained).

## Technical Plan

## Part 1: Replace Layout Shell

### File: `src/components/layout/ThreePanelLayout.tsx`

- Replace slot-based state model (`slotA`, `slotB`, `activePane`, split handlers) with simpler app shell state:
  - `isLeftPanelCollapsed`
  - `activeView: 'type' | 'feed' | 'map'`
  - `selectedType: string | null`
  - `selectedNodeId: number | null`
- Remove split pane rendering and drop-zone logic.
- Render:
  - Left type panel component
  - Main workspace container with top view icons
  - Existing modals (search/settings/add)
- Restyle shell containers to match Codex screenshot visual language:
  - neutral dark background layers
  - subtle borders
  - compact spacing rhythm
  - no colorful accent rails

### File: `src/components/layout/LeftToolbar.tsx`

- Deprecate/remove as primary navigation controller.
- Replace with new component(s):
  - `src/components/layout/LeftTypePanel.tsx`
  - optional `src/components/layout/MainViewSwitcher.tsx`
- Ensure new left panel styling matches screenshot:
  - slim, dark, quiet surface
  - neutral icon/text states
  - no saturated active colors

### File: `src/components/layout/SplitHandle.tsx`

- Remove from active layout path.
- If retained temporarily, mark legacy + unused and schedule cleanup.

## Part 2: Introduce Type Navigation Data Layer

### File: `app/api/types/route.ts` (new)

- Implement endpoint returning type groups and counts.
- Response shape example:

```json
{
  "success": true,
  "data": [
    { "type": "episode", "count": 120 },
    { "type": "person", "count": 87 }
  ]
}
```

### File: `src/services/database/nodes.ts`

- Add service method for grouped type counts.
- Keep existing `node_type` filtering.

### File: `app/api/nodes/route.ts`

- Add query alias handling:
  - If `type` present and `node_type` absent, map `type -> node_type`.
- Preserve existing behavior to avoid regressions.

### File: `src/types/database.ts`

- Keep `node_type` as canonical type field.
- Add optional API-facing alias type in filter interfaces if needed for frontend ergonomics.

## Part 3: Build Left Type Panel

### File: `src/components/layout/LeftTypePanel.tsx` (new)

- Responsibilities:
  - Fetch `/api/types`
  - Render collapsible folder list
  - Expand/collapse each type row
  - Fetch/render nodes by selected type (paged)
  - Emit callbacks: `onTypeSelect`, `onNodeSelect`, `onToggleCollapse`

### File: `app/api/nodes/route.ts` + existing search APIs

- Reuse node list endpoint with `type`/`node_type` filters for nested node lists.

## Part 4: Main View Switcher + Content Composition

### File: `src/components/layout/MainViewSwitcher.tsx` (new)

- Top icon control for `Type`, `Feed`, `Map`.
- Reflect active state and keyboard accessible labels.
- Visual treatment should copy screenshot icon controls:
  - compact icon buttons
  - neutral hover/active backgrounds
  - no bright accent fills

### File: `src/components/panes/ViewsPane.tsx` and `src/components/views/ViewsOverlay.tsx`

- Use as Feed rendering path in main workspace.
- Simplify default feed mode to avoid dimension-first complexity in initial state.
- Keep advanced dimension filters available but de-emphasized.

### File: `src/components/panes/MapPane.tsx`

- Keep map renderer.
- Accept selected node/type context for highlighting when provided.

### File: `src/components/panes/NodePane.tsx` / `src/components/focus/FocusPanel.tsx`

- Use for node detail rendering in main content flow.
- Remove assumptions that node panel only exists as a slot within dual-pane architecture.

## Part 5: Remove Guides from Primary Nav

### File: `src/components/panes/types.ts`

- Remove `guides` from primary pane type unions used by new main navigation.
- Keep internal types only if still needed by settings or legacy migration code.

### File: `src/components/panes/GuidesPane.tsx`

- Remove from workspace routing.
- Optionally keep file for backward compatibility during transition; mark deprecated.

### File: `src/components/settings/SettingsModal.tsx`

- Confirm Guides tab remains and is reachable.
- Optional: add direct “Guides” shortcut from top-right settings opening behavior if requested.

## Part 6: Docs + Terminology Alignment

### File: `docs/6_ui.md`

- Rewrite architecture docs from 2-panel pane model to collapsible left type nav + main workspace.
- Replace “Dimension folder view” references in primary nav with “Type folders”.
- Clarify that dimensions still exist as metadata/editing tags, not primary nav taxonomy.

### File: `docs/2_schema.md`

- Clarify naming:
  - Canonical DB column currently `node_type` in this repo.
  - Product language uses “Type”.
  - If remote schema introduces `type`, define migration/adapter strategy.

## Migration and Compatibility Strategy

1. Do not break existing `node_type` storage semantics.
2. Add API adapter layer for `type` alias immediately.
3. If production Turso schema truly has `type` (instead of `node_type`), add compatibility in DB service layer:
- Option A: migration to canonical `node_type`.
- Option B: dual-read/write abstraction at query layer.
4. Decision checkpoint before implementation start:
- Verify real production schema column name.
- Lock canonical direction before coding.

## Accessibility Requirements

1. Left panel folders and node rows are keyboard navigable.
2. View switcher icons have visible labels/tooltips and ARIA labels.
3. Collapse/expand states announce correctly to screen readers.
4. Ensure sufficient contrast in active/inactive nav states.
5. If grayscale active states reduce discoverability, use luminance contrast and weight changes rather than hue shifts.

## Performance Requirements

1. Type list loads <300ms for normal dataset sizes (network permitting).
2. Node lists in folder expansions should paginate/virtualize for large groups.
3. View switching should be client-instant without full page reload.
4. Avoid fetching all nodes globally on initial load.

## Risks

1. Hidden coupling to slot architecture may cause regressions in node opening/tab behavior.
2. Feed and dimensions code currently intertwined; simplification may expose edge cases.
3. `type` vs `node_type` mismatch can cause silent empty states without strict compatibility handling.
4. Removing split-pane may impact power users; mitigate with clean node switching and fast search.

## QA Plan

1. Navigation smoke tests:
- Load app, collapse/expand left panel, open type folder, open node.
2. View switch tests:
- Switch Type <-> Feed <-> Map with active selection retained.
3. Guide IA tests:
- Ensure no guides entry in main nav, guides still available in Settings.
4. API compatibility tests:
- `/api/nodes?node_type=episode` and `/api/nodes?type=episode` return equivalent sets.
5. Regression tests:
- Node edits, dimension tags, map click-to-open, search modal selection.

## Implementation Sequence

1. Add type API + node filter alias.
2. Build `LeftTypePanel` with mock integration.
3. Replace shell layout in `ThreePanelLayout`.
4. Integrate top view switcher and main content routing.
5. Remove guides from main nav path.
6. Update docs + polish + regression sweep.

## Done =

- [x] Left panel is collapsible and shows folders grouped by type
- [x] Clicking a type folder shows nodes for that type
- [x] Clicking a node opens/focuses it in main workspace
- [x] Main workspace has top view icons for Type, Feed, and Map
- [x] Guides removed from primary navigation
- [x] Guides remain available in Settings
- [x] No split-pane/slot UX in default app flow
- [x] `/api/nodes` supports `type` alias for `node_type`
- [x] New `/api/types` endpoint returns type counts
- [x] UX docs updated to reflect new architecture
- [x] Main shell styling matches Codex screenshot direction (neutral monochrome, no saturated accent palette)

---

## COMPLETED
**Date:** 2026-02-20
**Branch:** `feature/prd-09-ux-overhaul`
**What was delivered:**
- Replaced pane-centric layout (slot A/B, SplitHandle, LeftToolbar) with clean left type panel + main workspace
- New `LeftTypePanel` component: collapsible (260px/48px), type folders with counts, expandable node lists, search/add/settings access
- New `MainViewSwitcher` component: top-level Type/Feed/Map tab icons
- New `GET /api/types` endpoint returning `node_type` groups with counts
- Added `type` query alias in `GET /api/nodes` for forward compatibility
- Added `getTypeCounts()` to NodeService
- Removed guides from primary navigation (guides remain in Settings)
- Updated CSS design tokens from purple accent to neutral grayscale (Codex-matched)
- Added Tachyon font-display CSS class for brand moments
- Neutralized Settings modal sidebar colors
- Rewrote `docs/6_ui.md` for new architecture
- Updated `docs/2_schema.md` with type/node_type naming clarification
- Type-check and build both pass
