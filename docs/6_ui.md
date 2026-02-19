# User Interface

> How to navigate and use Latent Space Hub's interface.

**How it works:** Latent Space Hub uses a 2-panel layout: browse nodes on the left, work with focused content on the right. Settings give you access to workflows, database views, a knowledge map, and more.

---

## 2-Panel Layout

```
┌─────────────┬─────────────────────────┐
│   NODES     │        FOCUS            │
│   Panel     │        Panel            │
│             │                         │
│ • Search    │ • Tabbed workspace      │
│ • Filters   │ • Node content          │
│ • Folders   │ • Connections           │
│             │                         │
└─────────────┴─────────────────────────┘
```

---

## Left Panel: Nodes

Browse and manage your knowledge base.

### Features

- **Search bar** — Cmd+K opens global search modal
- **Dimension filters** — Multi-select dimension tags
- **Node list** — Scrollable list of filtered nodes
- **Folder view toggle** — Switch between list and folder views

### Node Display

Each node shows:
- Title + description preview
- Dimension tags (with custom icons)
- Last updated timestamp
- Node ID badge

### Folder View

Click the folder icon to open the **Folder View Overlay**:

**Two Modes:**

1. **Folders Mode** — Browse by dimension folders
   - Each dimension shows as a folder card
   - Drag nodes to folders to add dimensions
   - Click to view nodes in that dimension

2. **Filtered View Mode** — Multi-dimension filtering with views
   - Add multiple dimension filters
   - Choose view layout (List, Grid, Kanban)
   - Save views for quick access

---

## Filtered View System

### View Modes

| Mode | Description |
|------|-------------|
| **List** | Nodes grouped by dimension with section headers |
| **Grid** | Cards in responsive grid, grouped by dimension |
| **Kanban** | Columns per dimension, drag to move between |

### Compound Filters (AND Logic)

Add secondary filters to columns:

1. Add a filter (e.g., "inbox")
2. Click the `[+ AND]` button next to the dimension name
3. Select secondary dimension (e.g., "research")
4. Column now shows only nodes with BOTH dimensions

### Saved Views

Save filter + view combinations:

1. Configure your filters and view mode
2. Click the save icon
3. Name your view
4. Access from the "Saved Views" dropdown

### Drag-and-Drop

- **Reorder nodes** within views
- **Move between Kanban columns** (updates dimensions)
- **Drag from nodes list** to dimension folders

---

## Right Panel: Focus

Active workspace for the node(s) you're working with.

### Tabbed Interface

- **Primary tab** — Main focused node
- **Additional tabs** — Related nodes opened from links
- **Tab controls** — Close (×), reorder, switch

### Node Detail View

| Section | Content |
|---------|---------|
| **Header** | Title, node ID, trash icon |
| **Content** | Full markdown content with syntax highlighting |
| **Metadata** | Created, updated, type, link |
| **Dimensions** | Editable dimension tags |
| **Connections** | Incoming/outgoing edges |

### Content Rendering

- Markdown support
- `[NODE:id:"title"]` renders as clickable links
- Syntax highlighting for code blocks
- YouTube embeds (if link is YouTube URL)

---

## Search (Cmd+K)

Global search modal with 4-tier relevance:

1. **Exact title match** — Highest priority
2. **Title substring** — High priority
3. **FTS content match** — Medium priority
4. **Semantic embedding** — Conceptual matches

**Features:**
- Type-ahead instant results
- Keyboard navigation (↑↓, Enter)
- Click or Enter to open in Focus panel

---

## Settings Panel

**Access:** Settings cog icon (top-right)

### Tabs

| Tab | Purpose |
|-----|---------|
| **API Keys** | Configure OpenAI/Tavily keys |
| **Workflows** | View, edit, create workflows |
| **Tools** | View available tools |
| **Map** | Knowledge graph visualization |
| **Database** | Full node table with filters/sorting |
| **Logs** | Activity feed (last 100 entries) |
| **Agents** | External agent (MCP) configuration |

---

## Map View

Visual graph of your knowledge network.

**Features:**
- Force-directed layout with pan/zoom
- Node size proportional to edge count
- Top 15 nodes labeled (title + dimensions)
- Click node to highlight connections
- Selection shows connected nodes in green

---

## Database View

Full table view of all nodes.

**Columns:**
- Node (title + ID)
- Dimensions (folder badges)
- Edges (count)
- Updated (timestamp)

**Features:**
- Search by title/content
- Filter by dimensions
- Sort by updated/edges/created
- Pagination

---

## Dimension Icons

Each dimension can have a custom Lucide icon.

**To set:**
1. Open Folder View → hover over dimension
2. Click edit (pencil) icon
3. Choose icon from curated options
4. Icons persist in localStorage

---

## Node References

**Format:** `[NODE:id:"title"]`

**Rendering:**
- Clickable labels in node content
- Hover shows preview tooltip
- Click opens in Focus panel

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open search |
| `Escape` | Close modals/overlays |

---

## Design System

### Colors

- **Background:** `#0a0a0a` (near black)
- **Accent:** Green (`#22c55e`) for actions, selections
- **Text:** White (primary), neutral-400 (secondary)

### Typography

- **Font:** Geist (monospace feel)
- **Sizes:** 11-14px for UI, larger for content

### Buttons

- **Primary:** White bg, black text
- **Secondary:** Transparent, border, white text
- **Toggle:** 28×28px, subtle border, icon only
