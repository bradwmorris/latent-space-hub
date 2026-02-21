# PRD 12: Dashboard + Category Taxonomy

## Background

The Latent Space Hub has 4,024 nodes, 7,293 edges, and 36,443 chunks — a substantial knowledge base. But there's no way to see it all at a glance. When you open the app, you get the map or an empty "Select a type" prompt. There's no overview, no orientation, no sense of scale.

Separately, the left sidebar categories don't match the actual content. The sidebar currently shows whatever `node_type` values exist in the database — `episode`, `person`, `organization`, `topic`, `source`, and some NULLs. These are generic database labels, not the real categories that define Latent Space's content. A user looking at the sidebar has no idea they're browsing a podcast archive, a newsletter backlog, or a builders club recording library.

This PRD fixes both problems:

1. **Dashboard** — a new view that is the default landing page. A clear, elegant overview of everything in the Hub.
2. **Category taxonomy** — 8 canonical content categories that replace the current generic types, reflected in the sidebar, dashboard, and data layer.

---

## The 8 Categories

These are the real content categories of Latent Space. Every node in the database maps to exactly one:

| Category | DB `node_type` value | What it contains | Current state |
|---|---|---|---|
| **Podcast** | `podcast` | Latent Space podcast episodes | `episode` with series=latent-space-podcast (~182 nodes) |
| **Guest** | `guest` | People — hosts, guests, researchers, founders | `person` (~740 nodes) |
| **Article** | `article` | Blog posts, essays, written long-form | `source` with source_type=blog (~134 nodes) |
| **Entity** | `entity` | Companies, labs, tools, models, concepts, topics | `organization` (~685) + `topic` (~1,872) |
| **Builders Club** | `builders-club` | Builders Club / Latent Space TV meetup recordings | `episode` with series=meetup (~75 nodes) |
| **Paper Club** | `paper-club` | Paper Club deep-dive sessions | `episode` with series=paper-club (~11 nodes) |
| **Workshop** | `workshop` | Conference talks, AI Engineer sessions, tutorials | `episode` with channel=AI Engineer + NULLs (~35 nodes) |
| **AI News** | `ainews` | AINews daily digests | `source` with source_type=newsletter (~121 nodes) |

**Important:** These are the only 8 categories that appear in the sidebar and dashboard. `hub` nodes (structural anchors from PRD-10) exist in the database but are not a user-facing category — they're infrastructure.

### What changes from the current taxonomy

| Old type | New category | Migration |
|---|---|---|
| `episode` | `podcast`, `builders-club`, `paper-club`, or `workshop` | Split by `metadata.series` and channel |
| `source` | `article` or `ainews` | Split by `metadata.source_type` |
| `person` | `guest` | Rename |
| `organization` | `entity` | Merge with topic |
| `topic` | `entity` | Merge with organization |
| `NULL` | Classify into one of the 8 | Infer from title/metadata |
| `event` | `workshop` or appropriate | Reclassify |
| `concept` | `entity` | Merge |
| `subscriber` | Remove or reclassify | Edge case |

### Category metadata and display

Each category needs a canonical display config:

```typescript
const CATEGORIES = {
  podcast:        { label: 'Podcast',        icon: Mic,          order: 0 },
  guest:          { label: 'Guest',          icon: Users,        order: 1 },
  article:        { label: 'Article',        icon: FileText,     order: 2 },
  entity:         { label: 'Entity',         icon: Building2,    order: 3 },
  'builders-club':{ label: 'Builders Club',  icon: Hammer,       order: 4 },
  'paper-club':   { label: 'Paper Club',     icon: BookOpen,     order: 5 },
  workshop:       { label: 'Workshop',       icon: Presentation, order: 6 },
  ainews:         { label: 'AI News',        icon: Newspaper,    order: 7 },
} as const;
```

The sidebar always shows all 8 categories in this fixed order, regardless of count. This is the branded navigation — not a dynamic dump of whatever `node_type` values happen to exist.

---

## The Dashboard

### What it is

The dashboard is the default landing page of the app. It replaces the current "Select a type from the left panel" empty state and the map-as-default. It's an at-a-glance overview of everything in the Hub.

### Design principles

1. **Simple** — no charts, no graphs, no analytics dashboards. Just clean cards showing what's in the Hub.
2. **Useful** — every element is clickable, leading deeper into the content.
3. **Elegant** — matches the existing Codex-matched dark aesthetic. Monochrome. Restrained.
4. **Information-dense** — show as much as possible without clutter.

### Dashboard layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Dashboard                                                          │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ 4,024    │ │ 7,293    │ │ 36,443   │ │ 570      │              │
│  │ Nodes    │ │ Edges    │ │ Chunks   │ │ Episodes │              │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
│                                                                     │
│  ┌─ Podcast ─────────────────┐  ┌─ AI News ─────────────────┐     │
│  │  182 episodes             │  │  121 digests               │     │
│  │                           │  │                            │     │
│  │  Latest:                  │  │  Latest:                   │     │
│  │  · The GPU Commoditiz...  │  │  · [AINews] GPT 4.5 ...   │     │
│  │  · Brex's AI Hail Mary   │  │  · [AINews] Qwen 3 ...    │     │
│  │  · First Mech Interp...  │  │  · [AINews] Oracle ...    │     │
│  └───────────────────────────┘  └────────────────────────────┘     │
│                                                                     │
│  ┌─ Guest ───────────────────┐  ┌─ Article ─────────────────┐     │
│  │  740 people               │  │  134 articles              │     │
│  │                           │  │                            │     │
│  │  Most connected:          │  │  Latest:                   │     │
│  │  · swyx (42 edges)        │  │  · Agent Engineering       │     │
│  │  · Alessio Fanelli (38)   │  │  · AI in 2025             │     │
│  │  · George Hotz (24)       │  │  · The Shift...           │     │
│  └───────────────────────────┘  └────────────────────────────┘     │
│                                                                     │
│  ┌─ Entity ──────────────────┐  ┌─ Builders Club ───────────┐     │
│  │  2,557 entities           │  │  75 recordings             │     │
│  │                           │  │                            │     │
│  │  Most connected:          │  │  Latest:                   │     │
│  │  · OpenAI (89 edges)      │  │  · Builders Club #42      │     │
│  │  · Anthropic (67)         │  │  · BC: Live with...       │     │
│  │  · Transformer (54)       │  │  · BC: Demo Day...        │     │
│  └───────────────────────────┘  └────────────────────────────┘     │
│                                                                     │
│  ┌─ Paper Club ──────────────┐  ┌─ Workshop ────────────────┐     │
│  │  11 sessions              │  │  35 sessions               │     │
│  │                           │  │                            │     │
│  │  Latest:                  │  │  Latest:                   │     │
│  │  · Attention Is All...    │  │  · Welcome to AIE CODE    │     │
│  │  · RLHF Deep Dive        │  │  · Building with...       │     │
│  │  · Scaling Laws          │  │  · Prompt Engineering...   │     │
│  └───────────────────────────┘  └────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Dashboard components

#### 1. Stats bar (top)

A horizontal row of 4 stat cards showing aggregate numbers:

| Stat | Source |
|---|---|
| Total Nodes | `SELECT COUNT(*) FROM nodes` |
| Total Edges | `SELECT COUNT(*) FROM edges` |
| Total Chunks | `SELECT COUNT(*) FROM chunks` |
| Content Episodes | `SELECT COUNT(*) FROM nodes WHERE node_type IN ('podcast', 'builders-club', 'paper-club', 'workshop', 'ainews', 'article')` |

Each stat card: number on top (large, white, tabular-nums), label below (small, muted). Dark surface, subtle border. No icons.

#### 2. Category cards (8 cards, 2-column grid)

Each category gets a card showing:
- **Category name** — using the canonical label + icon
- **Count** — "182 episodes" / "740 people" / etc.
- **Preview list** — 3 most relevant nodes for that category:
  - Content categories (podcast, article, ainews, builders-club, paper-club, workshop): show **3 most recent** by `event_date` or `updated_at`
  - Entity categories (guest, entity): show **3 most connected** by edge count

Each preview item is clickable — opens the node in the focus panel.

Clicking the category name or count navigates to the Type view filtered to that category (same as clicking in sidebar).

#### Card layout:
- Header: icon + label (left), count badge (right)
- Divider line
- 3 node rows: title (truncated), date or edge count

#### Card styling:
- Background: `#111` (same as workspace)
- Border: `1px solid #1a1a1a`
- Border-radius: `8px`
- Padding: `16px`
- Hover: subtle brightness increase on the card

---

## Sidebar Updates

### Current behavior (from `LeftTypePanel.tsx`)

The sidebar currently:
1. Fetches type counts from `GET /api/types`
2. Renders whatever types come back, ordered by count descending
3. Shows raw `node_type` values with `textTransform: capitalize` — so `episode`, `person`, `organization`, `topic`, `source`
4. No icons, no fixed order, no branded labels

### Target behavior

The sidebar must:
1. Always show exactly 8 categories in the fixed order defined above
2. Use branded labels ("Podcast" not "episode", "AI News" not "newsletter")
3. Show category-specific Lucide icons
4. Show counts next to each category
5. Categories with 0 nodes still appear (dimmed, count shows "0")
6. Hub nodes are excluded from counts and never shown

### What changes in `LeftTypePanel.tsx`

Replace the dynamic `typeCounts.map(...)` rendering with a hardcoded category list that maps to API data:

```typescript
// Instead of rendering whatever the API returns,
// render the 8 canonical categories in order,
// looking up counts from the API data

const CATEGORIES = [
  { key: 'podcast',        label: 'Podcast',        icon: Mic },
  { key: 'guest',          label: 'Guest',           icon: Users },
  { key: 'article',        label: 'Article',         icon: FileText },
  { key: 'entity',         label: 'Entity',          icon: Building2 },
  { key: 'builders-club',  label: 'Builders Club',   icon: Hammer },
  { key: 'paper-club',     label: 'Paper Club',      icon: BookOpen },
  { key: 'workshop',       label: 'Workshop',        icon: Presentation },
  { key: 'ainews',         label: 'AI News',         icon: Newspaper },
];
```

The sidebar fetches counts from `/api/types` as before, but now renders the fixed list and looks up counts by key rather than rendering whatever the API returns.

---

## View Switcher Update

### Current views: Type, Feed, Map

Add **Dashboard** as a new view. It becomes the default (replaces `map` as the initial `activeView`).

```typescript
export type MainView = 'dashboard' | 'type' | 'feed' | 'map';

const VIEW_CONFIG = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'type',      icon: FolderOpen,      label: 'Type' },
  { id: 'feed',      icon: List,            label: 'Feed' },
  { id: 'map',       icon: Map,             label: 'Map' },
];
```

Default `activeView` changes from `'map'` to `'dashboard'`.

When a user clicks a category in the sidebar, it switches to `'type'` view (as today).

---

## API Changes

### New endpoint: `GET /api/dashboard`

Returns all data needed to render the dashboard in a single call:

```json
{
  "success": true,
  "data": {
    "stats": {
      "total_nodes": 4024,
      "total_edges": 7293,
      "total_chunks": 36443,
      "total_content": 570
    },
    "categories": [
      {
        "key": "podcast",
        "label": "Podcast",
        "count": 182,
        "preview": [
          { "id": 2, "title": "Captaining IMO Gold...", "date": "2025-02-15" },
          { "id": 3, "title": "Brex's AI Hail Mary...", "date": "2025-02-10" },
          { "id": 5, "title": "The First Mech Interp...", "date": "2025-02-08" }
        ]
      },
      {
        "key": "guest",
        "label": "Guest",
        "count": 740,
        "preview": [
          { "id": 100, "title": "swyx", "edge_count": 42 },
          { "id": 101, "title": "Alessio Fanelli", "edge_count": 38 },
          { "id": 200, "title": "George Hotz", "edge_count": 24 }
        ]
      }
    ]
  }
}
```

The API constructs this from 8 targeted queries — one per category for the count + preview. Previews are 3 items each:
- Content types: `ORDER BY event_date DESC NULLS LAST, updated_at DESC LIMIT 3`
- Entity types (guest, entity): `ORDER BY edge_count DESC LIMIT 3` (with subquery for edge count)

### Existing endpoint: `GET /api/types`

Keep as-is. The sidebar still uses this for counts. The categories constant on the frontend handles display mapping.

---

## Data Layer Changes

### `src/types/database.ts`

Update the `NodeType` union:

```typescript
export type NodeType =
  | 'podcast'
  | 'guest'
  | 'article'
  | 'entity'
  | 'builders-club'
  | 'paper-club'
  | 'workshop'
  | 'ainews'
  | 'hub';        // Structural anchor — not user-facing
```

Remove the old types: `episode`, `person`, `organization`, `topic`, `source`, `event`, `concept`, `subscriber`.

Update metadata interfaces accordingly:
- `EpisodeMetadata` → keep but rename usage context
- `PersonMetadata` → `GuestMetadata`
- `OrganizationMetadata` + `TopicMetadata` → `EntityMetadata`
- `SourceMetadata` → split into content-type-specific if needed, or keep generic
- Remove `EventMetadata`, `ConceptMetadata`, `SubscriberMetadata`

### `scripts/refine-data.ts`

Update the `--task types` command to use the new 8-category taxonomy instead of the PRD-10 taxonomy. The migration logic:

```
episode + series='latent-space-podcast'  → podcast
episode + series='meetup'                → builders-club
episode + series='paper-club'            → paper-club
episode + channel='AI Engineer'          → workshop
episode + no series (misc)               → workshop (default for unclassified video content)

source + source_type='newsletter'        → ainews
source + source_type='blog'              → article
source + no source_type                  → article (default)

person                                   → guest
organization                             → entity
topic                                    → entity
concept                                  → entity
event                                    → workshop (or entity, case-by-case)
subscriber                               → remove or guest

NULL                                     → classify from title/metadata into one of the 8
```

### Category config constant

Create a shared config file used by both frontend and scripts:

**File: `src/config/categories.ts`**

```typescript
import {
  Mic, Users, FileText, Building2, Hammer,
  BookOpen, Presentation, Newspaper
} from 'lucide-react';

export const CATEGORIES = [
  { key: 'podcast',        label: 'Podcast',       icon: Mic,          sortMode: 'recent' },
  { key: 'guest',          label: 'Guest',          icon: Users,        sortMode: 'connected' },
  { key: 'article',        label: 'Article',        icon: FileText,     sortMode: 'recent' },
  { key: 'entity',         label: 'Entity',         icon: Building2,    sortMode: 'connected' },
  { key: 'builders-club',  label: 'Builders Club',  icon: Hammer,       sortMode: 'recent' },
  { key: 'paper-club',     label: 'Paper Club',     icon: BookOpen,     sortMode: 'recent' },
  { key: 'workshop',       label: 'Workshop',       icon: Presentation, sortMode: 'recent' },
  { key: 'ainews',         label: 'AI News',        icon: Newspaper,    sortMode: 'recent' },
] as const;

export type CategoryKey = typeof CATEGORIES[number]['key'];

// For non-React contexts (scripts, API routes)
export const CATEGORY_KEYS: string[] = CATEGORIES.map(c => c.key);
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.key, c.label])
);
```

---

## Technical Plan

### File changes (in implementation order)

#### Phase 1: Category taxonomy

| File | Change |
|---|---|
| `src/config/categories.ts` | **NEW** — canonical category config |
| `src/types/database.ts` | Update `NodeType` union to 8 new types + `hub` |
| `scripts/refine-data.ts` | Update `--task types` migration to new taxonomy |
| `app/api/types/route.ts` | No change needed (dynamically returns whatever types exist) |
| `app/api/nodes/route.ts` | No change needed (filters by whatever `type` is passed) |

#### Phase 2: Sidebar update

| File | Change |
|---|---|
| `src/components/layout/LeftTypePanel.tsx` | Replace dynamic type list with fixed CATEGORIES array, add icons, branded labels, fixed order |

#### Phase 3: Dashboard

| File | Change |
|---|---|
| `app/api/dashboard/route.ts` | **NEW** — single endpoint returning stats + category previews |
| `src/components/dashboard/Dashboard.tsx` | **NEW** — dashboard view component |
| `src/components/layout/MainViewSwitcher.tsx` | Add `dashboard` view, update default |
| `src/components/layout/ThreePanelLayout.tsx` | Import + render Dashboard, update default `activeView` to `'dashboard'` |

#### Phase 4: Metadata type cleanup

| File | Change |
|---|---|
| `src/types/database.ts` | Clean up metadata interfaces for new types |
| `src/services/database/nodes.ts` | Ensure `getTypeCounts()` works with new types |

### Implementation sequence

1. Create `src/config/categories.ts` with the canonical 8-category config
2. Update `NodeType` in `src/types/database.ts`
3. Update `LeftTypePanel.tsx` to use fixed category list + icons
4. Build `app/api/dashboard/route.ts`
5. Build `src/components/dashboard/Dashboard.tsx`
6. Update `MainViewSwitcher.tsx` to add dashboard view
7. Update `ThreePanelLayout.tsx` to render dashboard + set as default view
8. Update `scripts/refine-data.ts` type migration for new taxonomy
9. Type-check + build
10. Update metadata interfaces in `database.ts`

---

## Accessibility Requirements

1. Dashboard stat cards and category cards are keyboard navigable
2. Category cards have ARIA labels with count context (e.g., "Podcast, 182 episodes")
3. Preview node items are focusable and announce title on focus
4. Dashboard has a heading hierarchy (`h1` for "Dashboard", `h2` for each category)
5. Sidebar category icons have `aria-hidden="true"` (labels carry the meaning)
6. Sufficient contrast between card backgrounds and text in all states

## Performance Requirements

1. Dashboard API returns in <500ms (8 simple queries, no joins beyond edge count)
2. Dashboard renders without layout shift — stat cards have fixed height
3. Sidebar category list is static (no loading state needed for the list itself — only for counts)
4. Category cards can show skeleton states while the dashboard API loads

## Risks

1. **Type migration ordering** — the data refinement script (`scripts/refine-data.ts --task types`) must run before the UI changes go live, or the sidebar will show empty categories. Mitigation: the sidebar should gracefully show 0 counts.
2. **entity is a mega-category** — combining org + topic into entity creates one category with ~2,500+ nodes. This is by design (the user requested it), but the preview should show "most connected" not "most recent" to surface the most useful entities.
3. **Metadata interface breaking changes** — renaming `PersonMetadata` to `GuestMetadata` etc. will cause type errors in any code that imports them. Fix all references during implementation.
4. **hub nodes showing up** — the sidebar and dashboard must explicitly exclude `node_type = 'hub'` from counts and listings. The `/api/types` endpoint may return hubs; the frontend filters them out.

## QA Plan

1. **Sidebar**: all 8 categories visible in correct order, with correct counts, with icons
2. **Dashboard**: all 8 category cards render with counts and preview items
3. **Dashboard click-through**: clicking a category card navigates to type view; clicking a preview node opens it
4. **Dashboard stats**: 4 stat cards show correct aggregate numbers
5. **Empty state**: if a category has 0 nodes, card shows gracefully (count=0, no preview items)
6. **Type migration**: after running `--task types`, no nodes have old type values (episode, source, person, organization, topic)
7. **View switching**: Dashboard <-> Type <-> Feed <-> Map all work, focused node preserved where appropriate

---

## Depends on

- **PRD-10 (Data Refinement)**: the type migration in PRD-10's script needs to be updated to use the new 8-category taxonomy before running. PRD-10 Phase 2 (execution) should use this PRD's taxonomy.

## Blocks

- **PRD-11 (Discord Bot v2)**: bots need to understand the 8 categories for grounding context.

---

## COMPLETED

**Date:** 2026-02-22

**What was delivered:**

1. **`src/config/categories.ts`** — canonical 8-category config (key, label, icon, sortMode, order) with `CategoryKey`, `CATEGORY_KEYS`, `CATEGORY_LABELS`, `CATEGORY_MAP` exports
2. **`src/types/database.ts`** — `NodeType` union updated to `podcast | guest | article | entity | builders-club | paper-club | workshop | ainews | hub`. Metadata interfaces consolidated: `ContentMetadata`, `GuestMetadata`, `EntityMetadata`, `HubMetadata` replace the 8 old interfaces
3. **`src/components/layout/LeftTypePanel.tsx`** — sidebar now renders fixed 8-category list with Lucide icons, branded labels, fixed order. Categories with 0 nodes show dimmed. Icons have `aria-hidden`, buttons have proper `aria-label`
4. **`app/api/dashboard/route.ts`** — new endpoint returning aggregate stats (nodes, edges, chunks, content) + 8 category cards with count and 3-item preview (recent by event_date or most-connected by edge count)
5. **`src/components/dashboard/Dashboard.tsx`** — dashboard view with stats bar, 2-column category card grid, skeleton loading state. Cards clickable to navigate to type view, preview items clickable to open nodes
6. **`src/components/layout/MainViewSwitcher.tsx`** — `MainView` type extended with `'dashboard'`, added LayoutDashboard icon tab
7. **`src/components/layout/ThreePanelLayout.tsx`** — imports Dashboard, renders it in view switch, default `activeView` changed from `'map'` to `'dashboard'`

**Type-check:** pass
**Build:** pass

**Note:** The `scripts/refine-data.ts --task types` migration was already built with the 8-category taxonomy in PRD-10. It does not need updating — the UI now matches what the script will produce when executed.
