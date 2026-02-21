# User Interface

> How to navigate and use Latent Space Hub's interface.

**How it works:** Latent Space Hub uses a collapsible left type panel + main workspace layout. Browse nodes by type on the left, view content in the main workspace with top-level view switching (Type, Feed, Map). Settings contain advanced tooling including Guides.

---

## Layout

```
┌───────────────────────────┬──────────────────────────────────────────┐
│ Left Type Panel            │ Main Workspace                           │
│ (collapsible)              │                                          │
│                            │ Top bar: [Type] [Feed] [Map] icons      │
│ - Search (Cmd+K)          │ Content based on selected view/state     │
│ - Add                     │                                          │
│ - Type folders with counts│ - Type view: nodes by selected type      │
│   - episode (120)         │ - Feed view: chronological feed          │
│   - person (87)           │ - Map view: knowledge graph              │
│   - ...                   │                                          │
│ - Settings                │                                          │
└───────────────────────────┴──────────────────────────────────────────┘
```

---

## Left Panel: Type Navigation

Browse your knowledge base organized by entity type.

### Features

- **Collapsible** — toggle between expanded (260px) and icon-only (48px) modes
- **Search** — Cmd+K opens global search modal
- **Add** — Quick add for new nodes
- **Type folders** — Expandable rows for each type with count badges
- **Node list** — Expand a type to see its nodes, click to open

### Type Folders

Each type (episode, person, organization, topic, etc.) shows as a collapsible folder:
- Click folder header to select type and expand node list
- Count badge shows number of nodes
- Nodes within are clickable to open in main workspace

---

## Main Workspace

### View Modes

Top-level view switcher provides three modes:

| Mode | Icon | Description |
|------|------|-------------|
| **Type** | FolderOpen | Shows nodes for the selected type from left panel |
| **Feed** | List | Chronological feed of all nodes |
| **Map** | Map | Knowledge graph visualization |

### Selection Model

- Left panel type selection drives Type view content
- Clicking any node opens it in the main workspace
- View switching preserves selected type where relevant
- Node detail uses a tabbed interface for multiple open nodes

---

## Node Detail View

When a node is opened:

| Section | Content |
|---------|---------|
| **Header** | Title, node ID, type |
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

Global search modal with multi-tier relevance:

1. **Exact title match** — Highest priority
2. **Title substring** — High priority
3. **FTS content match** — Medium priority
4. **Semantic embedding** — Conceptual matches

**Features:**
- Type-ahead instant results
- Keyboard navigation
- Click or Enter to open in main workspace

---

## Settings Panel

**Access:** Settings button in left panel (bottom)

### Tabs

| Tab | Purpose |
|-----|---------|
| **Logs** | System activity feed |
| **Tools** | Available tools |
| **Guides** | Browse and manage guides |
| **API Keys** | Configure OpenAI/Anthropic keys |
| **Database** | Full node table with filters/sorting |
| **Context** | Auto-context configuration |
| **Agents** | External agent (MCP) configuration |

Note: Guides are accessible only through Settings, not primary navigation.

---

## Map View

Visual graph of your knowledge network.

**Features:**
- Force-directed layout with pan/zoom
- Node size proportional to edge count
- Top nodes labeled (title + dimensions)
- Click node to highlight connections

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open search |
| `Cmd+N` | Open Add modal |
| `Escape` | Close modals/overlays |

---

## Design System

### Visual Direction

Codex-matched neutral palette: restrained, minimal, monochrome.

### Colors

- **Background:** `#0a0a0a` (near black)
- **Surface:** `#111111`
- **Accent:** Neutral grayscale for active states
- **Text:** White (primary), neutral grays (secondary/muted)

### Typography

- **Display/Brand:** Tachyon (Latent Space brand font) for headings and nav labels
- **Body/UI:** Geist (clean sans-serif)
- **Mono:** JetBrains Mono for code

### Components

- Slim borders, compact spacing
- Subtle hover states (luminance, not hue)
- Rounded corners (6-8px)
- No saturated accent colors in navigation
