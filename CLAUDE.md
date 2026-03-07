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

## Key Directories

```
app/                    — Next.js App Router (pages + API routes)
src/
  components/           — React UI components
    layout/             — ThreePanelLayout, LeftTypePanel, MainViewSwitcher
    dashboard/          — Dashboard with stats + category cards
    panes/              — MapPane, NodePane, SkillsPane, DimensionsPane
    focus/              — FocusPanel (tabbed node editor), SourceReader
  services/
    database/           — Turso client, node/edge/chunk services
    agents/             — QuickAdd orchestrator, autoEdge, transcript summarizer
    embedding/          — Chunking + embedding pipeline
    typescript/extractors/ — YouTube, website, PDF extractors
  tools/                — MCP tools + database CRUD tools
  config/
    categories.ts       — 8-category taxonomy config
    prompts/            — Agent system prompts
    skills/             — Skills (system/ + guides/) — agent & user-facing
  types/
    database.ts         — Core TypeScript definitions
apps/
  mcp-server/           — In-app MCP server (HTTP + stdio)
  mcp-server-standalone/ — NPX-installable MCP server (npm package)
scripts/                — Ingestion + data refinement scripts
docs/                   — System documentation (see docs/README.md)
docs/development/       — Dev workflow, backlog, PRDs
```

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
