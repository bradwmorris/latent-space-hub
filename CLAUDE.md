# Latent Space Hub

Knowledge base for the Latent Space community. Built on the RA-H foundation, deployed as its own product.

**This is NOT a demo. This is the product.**

---

## Tech Stack

- **Framework:** Next.js 15 + TypeScript + Tailwind CSS
- **Database:** Turso (cloud SQLite via `@libsql/client`) — NOT local SQLite, NOT better-sqlite3
- **Search:** Turso native vector search (F32_BLOB + vector_top_k) + FTS5
- **AI:** Anthropic (Claude) + OpenAI (GPT) models via Vercel AI SDK — BYO keys
- **MCP:** Model Context Protocol server in `apps/mcp-server/` (HTTP + stdio)
- **Deployment:** Vercel (readonly mode for public)
- **Bots:** Discord bots (Sig & Slop) in separate repo (`latent-space-bots`)
- **UI:** Dashboard + 8-category sidebar + focus panel

## Database

**Turso** — cloud-hosted SQLite. Not a local file.

- URL: `latentspace-bradwmorris.aws-us-east-2.turso.io`
- Client: `@libsql/client` (NOT better-sqlite3)
- Schema: `docs/schema.md`
- Vector search: Turso supports native vector via F32_BLOB + `libsql_vector_idx` + `vector_top_k()`

**Do NOT reference:**
- `~/Library/Application Support/RA-H/db/rah.sqlite` (that's the local Mac app)
- `npm rebuild better-sqlite3` (not used here)
- `SQLITE_VEC_EXTENSION_PATH` (not needed for Turso)

## Project Structure

```
latent-space-hub/
├── app/                           Next.js App Router
│   ├── api/                       30+ API routes
│   │   ├── nodes/                 Node CRUD + search
│   │   ├── edges/                 Edge CRUD
│   │   ├── dimensions/            Dimension CRUD + search
│   │   ├── dashboard/             Stats + category previews
│   │   ├── skills/                Skill CRUD
│   │   ├── quick-add/             Multi-format ingestion
│   │   ├── ingestion/             Embedding pipeline
│   │   ├── cron/
│   │   │   ├── ingest/            Hourly auto-ingestion cron
│   │   │   └── extract-entities/  Entity extraction cron
│   │   ├── extract/               PDF upload
│   │   ├── health/                Ping, DB, vectors
│   │   ├── system/                MCP status, auto-context
│   │   ├── tools/                 Tool listing
│   │   ├── types/                 Node type schemas
│   │   ├── logs/                  System logs
│   │   └── events/                SSE stream
│   ├── docs/                      User-facing documentation pages
│   ├── evals/                     Eval dashboard
│   └── layout.tsx                 Root layout
│
├── src/
│   ├── components/                React UI (~70 files)
│   │   ├── layout/                Core layout
│   │   ├── dashboard/             Dashboard with stats + category cards
│   │   ├── panes/                 MapPane, NodePane, SkillsPane, DimensionsPane
│   │   ├── focus/                 FocusPanel (tabbed node editor), SourceReader
│   │   ├── views/                 ListView, GridView, KanbanView
│   │   ├── agents/                QuickAdd input UI
│   │   ├── nodes/                 Search modal
│   │   ├── common/                Shared components (chips, dialogs)
│   │   └── helpers/               Markdown renderer, node tokens
│   │
│   ├── services/
│   │   ├── database/              All DB access (Turso client, nodes, edges, chunks, dimensions)
│   │   ├── agents/                QuickAdd orchestrator, autoEdge, transcript summarizer
│   │   ├── embedding/             Chunking + embedding pipeline
│   │   ├── typescript/extractors/ YouTube, website, PDF extractors
│   │   ├── ingestion/             Auto-ingestion pipeline (sources, processing, notify)
│   │   ├── skills/                Skill service (bundled + user)
│   │   ├── docs/                  User-facing docs service (reads from src/config/docs/)
│   │   └── events.ts              SSE real-time broadcasting
│   │
│   ├── tools/                     MCP tool definitions
│   │   ├── database/              Node/edge/dimension CRUD tools
│   │   ├── other/                 Extraction, search, web, SQL tools
│   │   └── infrastructure/        Registry, groups, formatters
│   │
│   ├── config/
│   │   ├── categories.ts          8-category taxonomy config
│   │   ├── prompts/               Agent system prompts
│   │   ├── skills/                Skills — agent & user-facing (9 files)
│   │   └── docs/                  User-facing documentation content (6 files, source of truth)
│   │
│   └── types/
│       └── database.ts            Core TypeScript definitions
│
├── apps/
│   ├── mcp-server/                In-app MCP server (HTTP + stdio)
│   └── mcp-server-standalone/     NPX-installable MCP server
│
├── scripts/                       Ingestion, data refinement, companion backfill
├── docs/
│   ├── README.md                  Documentation index
│   ├── contributing.md            Contribution guidelines
│   └── development/               PRDs, backlog, process
```

### Key Patterns

- **Database access:** All DB operations go through `src/services/database/`. Components and API routes never run SQL directly.
- **MCP tools:** Tools in `src/tools/` wrap the same database services used by the web app.
- **Real-time updates:** Changes broadcast via SSE from `src/services/events.ts`. Events: `NODE_CREATED`, `NODE_UPDATED`, `NODE_DELETED`, `EDGE_CREATED`, `EDGE_DELETED`, `DIMENSION_UPDATED`.
- **Auto-embedding:** When a node is created with content, it's queued for background chunking + embedding.
- **Documentation:** Source of truth is `src/config/docs/` (rendered at `/docs` in the web app). `docs/development/` holds PRDs and backlog.

## Development

### Local dev

```bash
npm install
npm run dev             # localhost:3000
npm run type-check      # Must pass before committing
```

### Git workflow

**Always work on feature branches. Never commit directly to main.**

```bash
git checkout main && git pull origin main
git checkout -b feature/[name]
# ... do work ...
git add . && git commit -m "feat: description"
# merge after review
```

### Slash commands

| Command | What it does |
|---------|-------------|
| `/dev`  | Execute a PRD — branch, implement, commit |

### Backlog

**File:** `docs/development/backlog/backlog.json`

**Backlog UI:** `cd docs/development/backlog/ui && source venv/bin/activate && python server.py` → http://localhost:5561

Queue of projects in priority order. Each project has:
- `status`: `prd` → `ready` → `in_progress` → `review` → `completed`
- `prd`: path to the PRD file with implementation details
- `tasks`: checklist of individual items

PRDs are in `docs/development/` — they are the spec. Read the PRD before coding.

**PRD template:** `docs/development/backlog/prd-template.md`

## Origin

Forked from RA-H Open Source (`bradwmorris/ra-h_os`). The main RA-H app continues evolving separately. Schema changes from main should be evaluated for porting, but this repo has its own identity and roadmap.
