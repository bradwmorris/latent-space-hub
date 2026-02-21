# Architecture

## Project Structure

```
latent-space-hub/
├── app/                           Next.js App Router
│   ├── api/                       30+ API routes
│   │   ├── nodes/                 Node CRUD + search
│   │   ├── edges/                 Edge CRUD
│   │   ├── dimensions/            Dimension CRUD + search
│   │   ├── dashboard/             Stats + category previews
│   │   ├── guides/                Guide CRUD
│   │   ├── quick-add/             Multi-format ingestion
│   │   ├── ingestion/             Embedding pipeline
│   │   ├── extract/               PDF upload
│   │   ├── health/                Ping, DB, vectors
│   │   ├── system/                MCP status, auto-context
│   │   ├── tools/                 Tool listing
│   │   ├── types/                 Node type schemas
│   │   ├── logs/                  System logs
│   │   └── events/                SSE stream
│   ├── page.tsx                   Home → ThreePanelLayout
│   └── layout.tsx                 Root layout
│
├── src/
│   ├── components/                React UI (~70 files)
│   │   ├── layout/                Core layout
│   │   │   ├── ThreePanelLayout   Main app shell
│   │   │   ├── LeftTypePanel      Category sidebar
│   │   │   └── MainViewSwitcher   Dashboard/Type/Feed/Map toggle
│   │   ├── dashboard/             Dashboard with stats + category cards
│   │   ├── panes/                 Content panes
│   │   │   ├── MapPane            ReactFlow graph visualization
│   │   │   ├── NodePane           Node detail view
│   │   │   ├── GuidesPane         Built-in guides
│   │   │   └── DimensionsPane     Dimension browser
│   │   ├── focus/                 Focus panel (right side)
│   │   │   ├── FocusPanel         Tabbed node editor
│   │   │   ├── SourceReader       Source content viewer
│   │   │   └── dimensions/        Dimension tag editor
│   │   ├── views/                 Feed views
│   │   │   ├── ListView           Chronological list
│   │   │   ├── GridView           Card grid
│   │   │   └── KanbanView         Kanban board
│   │   ├── agents/                QuickAdd input UI
│   │   ├── nodes/                 Search modal
│   │   ├── settings/              Settings modal (logs, tools, keys, DB)
│   │   ├── common/                Shared components (chips, dialogs)
│   │   └── helpers/               Markdown renderer, node tokens
│   │
│   ├── services/
│   │   ├── database/              All DB access
│   │   │   ├── sqlite-client      Turso client init + health
│   │   │   ├── nodes              Node CRUD + search + filtering
│   │   │   ├── edges              Edge management
│   │   │   ├── chunks             Chunk storage + retrieval
│   │   │   ├── dimensionService   Dimension CRUD + auto-assignment
│   │   │   └── descriptionService AI-powered description generation
│   │   ├── agents/                AI agent logic
│   │   │   ├── quickAdd           Multi-format ingestion orchestrator
│   │   │   ├── autoEdge           Automatic edge creation after node creation
│   │   │   └── transcriptSummarizer  Chat transcript → structured summary
│   │   ├── embedding/             Embedding pipeline
│   │   │   ├── ingestion          Chunk → embed → store workflow
│   │   │   └── autoEmbedQueue     Async background embedding queue
│   │   ├── typescript/extractors/ Content extractors
│   │   │   ├── youtube            Transcript extraction (innertube)
│   │   │   ├── website            Web scraping (Cheerio + readability)
│   │   │   └── paper              PDF/arXiv extraction (pdf-parse)
│   │   ├── guides/                Guide CRUD service
│   │   ├── events.ts              SSE real-time broadcasting
│   │   └── embeddings.ts          AI embedding wrapper
│   │
│   ├── tools/                     MCP tool definitions
│   │   ├── database/              Node/edge/dimension CRUD tools
│   │   ├── other/                 Extraction, search, web, SQL tools
│   │   └── infrastructure/        Registry, groups, formatters
│   │
│   ├── config/
│   │   ├── categories.ts          8-category taxonomy config
│   │   ├── prompts/               Agent system prompts
│   │   └── guides/                Built-in markdown guides
│   │
│   ├── types/
│   │   └── database.ts            Core TypeScript definitions
│   │
│   └── hooks/                     React hooks (persistence, etc.)
│
├── apps/
│   ├── mcp-server/                In-app MCP server (HTTP + stdio)
│   └── mcp-server-standalone/     NPX-installable MCP server
│
├── scripts/                       Ingestion + data refinement scripts
├── docs/                          Documentation (you are here)
└── docs/development/              PRDs, backlog, process
```

## Key Patterns

### Database Access

All DB operations go through `src/services/database/`. Components and API routes never run SQL directly — they call service functions.

```
API route → service function → Turso client → Turso cloud
```

### MCP Tools

Tools in `src/tools/` wrap the same database services used by the web app. The MCP server exposes these tools to external agents.

```
External agent → MCP protocol → tool handler → database service → Turso
```

### Real-Time Updates

Changes broadcast via Server-Sent Events (SSE) from `src/services/events.ts`. The UI subscribes to these events for live updates without polling.

Events: `NODE_CREATED`, `NODE_UPDATED`, `NODE_DELETED`, `EDGE_CREATED`, `EDGE_DELETED`, `DIMENSION_UPDATED`

### Auto-Embedding Queue

When a node is created with sufficient content, it's added to `autoEmbedQueue`. The queue processes in the background:

1. Chunk text (~2000 chars, 400 overlap)
2. Generate embeddings via OpenAI
3. Store chunks + embeddings in Turso

### Quick Add Pipeline

The QuickAdd input detects content type and routes to the appropriate handler:

```
User input → detectInputType()
  YouTube URL    → youtubeExtract → create node → auto-edge → auto-embed
  Website URL    → websiteExtract → create node → auto-edge → auto-embed
  PDF/arXiv      → paperExtract   → create node → auto-edge → auto-embed
  Chat transcript → summarize     → create node → auto-edge → auto-embed
  Plain text     → create note    → auto-edge → auto-embed
```

### Node Type System

Categories are defined in `src/config/categories.ts` and the TypeScript union in `src/types/database.ts`. The canonical DB column is `node_type`. The API accepts both `node_type` and `type` as query parameters.

## Key Files

| File | Why it matters |
|------|---------------|
| `src/types/database.ts` | Core type definitions — Node, Edge, Chunk, Dimension, all metadata schemas |
| `src/config/categories.ts` | 8-category taxonomy config (labels, icons, sort modes) |
| `src/services/database/sqlite-client.ts` | Turso client initialization and health checks |
| `src/services/database/nodes.ts` | Node CRUD — the most-used service |
| `src/services/agents/quickAdd.ts` | Multi-format ingestion orchestrator |
| `src/services/embedding/ingestion.ts` | Chunk + embed pipeline |
| `src/tools/infrastructure/registry.ts` | MCP tool registration |
| `src/components/layout/ThreePanelLayout.tsx` | Main app layout shell |
| `apps/mcp-server-standalone/index.js` | Standalone MCP server entry point |
