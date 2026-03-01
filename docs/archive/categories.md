# Content Categories

Latent Space Hub organizes all content into **8 canonical categories**. These replace the generic database types (episode, person, organization, topic, source) with branded, product-specific classifications.

## The 8 Categories

| Category | Description | Examples |
|----------|------------|---------|
| **Podcast** | Latent Space podcast episodes — deep dives with industry leaders | "AI UX Design with Linus Lee", "The GPU Rich vs GPU Poor" |
| **Guest** | People who appear on or create LS content | Andrej Karpathy, Simon Willison, Swyx |
| **Article** | Blog posts from the latent.space Substack | "The 2025 AI Engineer Reading List", "Agents 101" |
| **Entity** | Organizations and technical topics | OpenAI, retrieval-augmented generation, LangChain |
| **Builders Club** | Meetup recordings and community builds | "SF Builders Club: Multi-Agent Systems" |
| **Paper Club** | Deep-dive paper discussions | "Paper Club: Attention Is All You Need" |
| **Workshop** | Conference talks, tutorials, AI Engineer events | "AI Engineer World's Fair: Prompt Engineering" |
| **AI News** | AINews daily digests from smol.ai | "AINews: OpenAI Dev Day Recap" |

## How Categories Map to the Database

The `node_type` column in the `nodes` table stores the category. The mapping from legacy types:

```
episode + series=latent-space-podcast  →  podcast
episode + series=meetup                →  builders-club
episode + series=paper-club            →  paper-club
source  + source_type=newsletter       →  ainews
source  + source_type=blog             →  article
person                                 →  guest
organization                           →  entity
topic                                  →  entity
```

## Dashboard

The dashboard (default landing page) shows all 8 categories as cards with:
- Category name and icon
- Total node count
- 3 preview items (content categories show most recent; entity/guest show most connected)

Clicking a category navigates to the filtered node list.

## Sidebar

The left panel shows a fixed list of all 8 categories in canonical order. Each shows:
- Branded label with icon (e.g. "Podcast" with mic icon, not "episode")
- Node count badge
- Categories with 0 nodes are dimmed but visible

## Internal: Hub Nodes

A `hub` node type exists for structural anchor nodes (e.g. "Latent Space Podcast" as a series hub). These are internal — hidden from the sidebar and dashboard — and serve as connection points in the graph.

## How Categories Affect Search

When searching via MCP or the web UI:
- `ls_search_nodes` supports filtering by `node_type` (the category)
- The sidebar acts as a category filter
- Content categories (podcast, article, ainews, builders-club, paper-club, workshop) sort by most recent
- Entity categories (guest, entity) sort by most connected (edge count)

## Configuration

Categories are defined in `src/config/categories.ts` with:
- `key` — the `node_type` value stored in the database
- `label` — the display name shown in the UI
- `icon` — Lucide icon component
- `sortMode` — `'recent'` (by date) or `'connected'` (by edge count)
