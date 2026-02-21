# PRD-14: Documentation Overhaul

## Background

The current `docs/` directory was copied from the RA-H open-source repo with surface-level renaming. It doesn't reflect what Latent Space Hub actually is today — a production knowledge graph platform with Discord bots, an MCP server, an 8-category taxonomy, a dashboard, content ingestion pipelines, and a public deployment.

**Problems:**
- Docs still use RA-H's numbered naming scheme (0_, 2_, 4_, 5_, 6_, 8_, 9_) with gaps from deleted files
- `6_ui.md` describes a 2-panel layout that no longer exists (PRD-12 shipped a dashboard + 8-category sidebar)
- No documentation about Sig & Slop (the Discord bots) — our most visible feature
- No documentation about the content ingestion pipeline (PRD-05, PRD-13)
- No documentation about the 8-category taxonomy (PRD-12)
- `taxonomy-proposal.md` and `latent-space-latest-intake.md` are stale point-in-time snapshots
- No public-facing docs for end users of the live app
- No clear contributor onboarding path
- The MCP server docs don't show how external developers actually connect and use the tools

**Goal:** Replace the inherited doc set with two clear documentation layers:
1. **Internal docs** (`docs/`) — for contributors and developers working on the project
2. **Public docs** (`public/docs/` or served via app routes) — for users of the live hub and developers connecting via MCP

## Scope

**In scope:**
- Delete or archive all inherited RA-H docs that no longer apply
- Write fresh internal developer documentation
- Write fresh public-facing documentation
- Create a documentation structure that can be maintained as features ship

**Out of scope:**
- API reference auto-generation (future)
- Interactive documentation / Storybook
- Video tutorials

## Dependencies

- PRD-12 (dashboard + categories) — DONE, need to document the 8 categories
- PRD-06/07 (bots + MCP server) — DONE, need to document both
- PRD-05 (content ingestion) — DONE, need to document the pipeline
- PRD-13 (auto-ingestion) — IN PLANNING, document the design but mark as upcoming

No blocking dependencies. This can run in parallel with other work.

---

## Plan

1. Archive stale docs that are no longer useful
2. Restructure `docs/` for internal developer docs
3. Write each internal doc (Parts 1–7)
4. Create public docs structure and write each doc (Parts 8–11)
5. Update docs/README.md as the new index
6. Update CLAUDE.md to reference new doc structure
7. Update backlog

---

## Part 1: Archive & Clean Up

### Action: Move stale files to `docs/archive/`

Files to archive (no longer accurate, superseded, or point-in-time snapshots):

| File | Reason |
|------|--------|
| `0_overview.md` | Superseded by new overview |
| `4_tools-and-workflows.md` | Superseded by new architecture + MCP docs |
| `5_logging-and-evals.md` | Superseded by new internals doc |
| `6_ui.md` | Outdated — doesn't reflect PRD-12 dashboard/categories |
| `9_open-source.md` | Superseded by new contributing doc |
| `taxonomy-proposal.md` | Archived — superseded by PRD-12's 8-category taxonomy |
| `latent-space-latest-intake.md` | Point-in-time snapshot (Jan 31), no longer useful |
| `os_docs/` | RA-H porting notes, historical only |

Files to **keep and update in place:**

| File | Action |
|------|--------|
| `2_schema.md` | Keep — rename to `schema.md`, update for 8 categories |
| `8_mcp.md` | Keep — rename to `mcp-server.md`, expand significantly |
| `TROUBLESHOOTING.md` | Keep — update with current issues |
| `latent-space-ingestion.md` | Keep — rename to `ingestion.md`, update for current pipeline |
| `README.md` | Keep — rewrite as new doc index |

---

## Part 2: New Internal Doc Structure

### Target structure:

```
docs/
  README.md                    — Doc index (quick links to everything)

  # Core reference
  overview.md                  — What LS Hub is, architecture, tech stack
  schema.md                    — Database schema (updated from 2_schema.md)
  categories.md                — The 8-category taxonomy with examples

  # Systems
  mcp-server.md                — MCP server: tools, setup, external developer guide
  bots.md                      — Sig & Slop: personalities, architecture, Discord setup
  ingestion.md                 — Content pipeline: sources, process, automation
  search.md                    — Vector search, FTS5, hybrid search, how it works

  # Developer
  contributing.md              — How to contribute, dev setup, git workflow
  architecture.md              — Codebase map, key directories, service layer
  TROUBLESHOOTING.md           — Common issues and fixes

  # Ops
  deployment.md                — Vercel deployment, env vars, readonly mode

  # Archive
  archive/                     — Superseded docs (moved here, not deleted)

  # Dev workflow (unchanged)
  development/
    backlog.json
    process.md
    prd-*.md
    completed-prds/
```

---

## Part 3: `docs/overview.md` — What is Latent Space Hub

This is the most important doc. It answers: **what is this thing?**

### Content outline:

**What is Latent Space Hub?**
- A knowledge graph — a "second brain" for the entire Latent Space universe
- Every podcast episode, article, AI News digest, conference talk, paper club session, guest, and entity — structured, connected, and searchable
- Not a static wiki — a living graph where nodes have edges, dimensions, and source material
- Think of it as the memory layer for Latent Space

**How it works (high level):**
- Content goes in (ingestion pipeline extracts from YouTube, Substack, GitHub)
- AI enriches it (embeddings, entity extraction, auto-edges)
- Humans and agents explore it (web UI, MCP tools, Discord bots)
- The graph grows over time — connections compound

**Three interfaces:**
1. **The Web App** — Dashboard, browse by category, search, graph map
2. **The MCP Server** — Any AI coding agent can plug into the graph via `ls_*` tools
3. **The Discord Bots** — Sig (signal) and Slop (entropy) — two AI personalities that answer questions and debate topics grounded in the knowledge base

**Tech stack** (brief):
- Next.js 15 + TypeScript + Tailwind
- Turso (cloud SQLite) with native vector search
- Anthropic + OpenAI via Vercel AI SDK
- MCP protocol for agent access
- Discord.js for bot integration

**Numbers** (current):
- ~4,000 nodes across 8 content categories
- ~7,300 edges connecting them
- ~36,000 chunks with vector embeddings
- Covering Jan 2025 → present

---

## Part 4: `docs/categories.md` — The 8-Category Taxonomy

### Content outline:

Explain the 8 canonical categories, what each contains, and how content maps to them.

| Category | Icon | What it contains | Example |
|----------|------|-----------------|---------|
| **Podcast** | Mic | Latent Space podcast episodes | "AI UX Design with Linus Lee" |
| **Guest** | Users | People who appear on or create LS content | "Andrej Karpathy" |
| **Article** | FileText | Blog posts from latent.space Substack | "The 2025 AI Engineer Reading List" |
| **Entity** | Building2 | Organizations and technical topics | "OpenAI", "retrieval-augmented generation" |
| **Builders Club** | Hammer | Meetup recordings and community builds | "SF Builders Club: Multi-Agent Systems" |
| **Paper Club** | BookOpen | Deep-dive paper discussions | "Paper Club: Attention Is All You Need" |
| **Workshop** | Presentation | Conference talks, tutorials, AI Engineer events | "AI Engineer World's Fair: Prompt Engineering" |
| **AI News** | Newspaper | AINews daily digests | "AINews: OpenAI Dev Day Recap" |

Include:
- How categories were derived (PRD-12 migration from generic types)
- How the dashboard organizes them
- How categories affect search and retrieval
- Note: `hub` type exists internally for structural anchor nodes but is hidden from users

---

## Part 5: `docs/bots.md` — Sig & Slop

### Content outline:

**What are Sig and Slop?**
- Two Discord bot personalities backed by the LS knowledge base
- Same graph, different lenses

**Sig (Signal):**
- Precise, factual, citation-heavy
- Answers questions with specific episode references, dates, and guest names
- The reliable answer bot — "here's exactly what was said and when"

**Slop (Entropy):**
- Opinionated, provocative, connects unexpected dots
- Makes bold claims and hot takes grounded in the knowledge base
- The debate starter — "actually, this contradicts what Karpathy said in episode 47..."

**Architecture:**
- Separate repo: `latent-space-bots`
- Single Discord.js process, two bot users
- Read-only Turso connection for KB queries
- Hybrid search (vector + FTS) for content retrieval
- Persona docs define each bot's voice and behavior
- Thread-per-conversation pattern

**Slash commands:**
- `/ask` — Ask a question (Sig or Slop responds)
- `/search` — Search the knowledge base
- `/episode` — Find specific episodes
- `/debate` — Pit Sig vs Slop on a topic

**The Feed / #yap channel (PRD-13, upcoming):**
- New content triggers a webhook to Discord
- Sig posts a summary, Slop responds
- Community joins the thread
- Creates an organic feed of knowledge base activity

**How bots connect to the KB:**
- Direct Turso read connection (not via MCP)
- Shared service layer with the web app
- OpenRouter for LLM calls

---

## Part 6: `docs/mcp-server.md` — MCP Server & External Developer Guide

Rewrite and significantly expand from current `8_mcp.md`.

### Content outline:

**What is the MCP Server?**
- Exposes the entire LS knowledge graph to any MCP-compatible AI agent
- Claude Code, Cursor, Windsurf, custom agents — all can search, read, and contribute

**Quick Start (for external developers):**
```json
{
  "mcpServers": {
    "latent-space-hub": {
      "command": "npx",
      "args": ["-y", "latent-space-hub-mcp"],
      "env": {
        "TURSO_DATABASE_URL": "...",
        "TURSO_AUTH_TOKEN": "..."
      }
    }
  }
}
```

**Available Tools** (grouped):

*Context & Discovery:*
- `ls_get_context` — Get graph overview (stats, hub nodes, dimensions)
- `ls_list_dimensions` — List all categories/tags
- `ls_search_nodes` — Keyword search across titles, descriptions, notes
- `ls_search_content` — Full-text search through source material (transcripts, articles)

*Read:*
- `ls_get_nodes` — Load full node records by ID
- `ls_query_edges` — Find connections between nodes
- `ls_sqlite_query` — Run read-only SQL for advanced queries

*Write:*
- `ls_add_node` — Create a new node
- `ls_update_node` — Update existing node (content appends to notes)
- `ls_create_edge` — Connect two nodes with an explanation
- `ls_update_edge` — Update edge explanation
- `ls_create_dimension` / `ls_update_dimension` / `ls_delete_dimension`

*Guides:*
- `ls_list_guides` / `ls_read_guide` — Access built-in documentation
- `ls_write_guide` / `ls_delete_guide` — Create custom guides

**Example workflows:**
1. "Find all podcast episodes about RAG" — search → get nodes → read source chunks
2. "Who has appeared on the podcast most?" — SQL query with GROUP BY
3. "Add a new article to the graph" — add node → create edges → assign dimensions
4. "What connects Andrej Karpathy to retrieval-augmented generation?" — query edges, trace paths

**Security:**
- Bearer token auth for HTTP transport
- `MCP_ALLOW_WRITES` controls write access
- Read-only by default for public deployments

---

## Part 7: `docs/ingestion.md` — Content Pipeline

Update from current `latent-space-ingestion.md`.

### Content outline:

**Sources:**
| Source | Type | Method | Category |
|--------|------|--------|----------|
| Latent Space Podcast | YouTube | RSS + transcript extraction | podcast |
| latent.space Substack | Blog | RSS + article scraping | article |
| AINews | GitHub | API + markdown parsing | ainews |
| LatentSpaceTV | YouTube | RSS + transcript extraction | builders-club, paper-club, workshop |

**Pipeline (per item):**
1. Discover new content (RSS check / GitHub API)
2. Extract content (transcript, article text, markdown)
3. Create node with metadata (title, link, event_date, dimensions, category)
4. Chunk text (~2000 chars, 400 overlap)
5. Generate embeddings (text-embedding-3-small, 1536d)
6. Extract entities (Claude) — create person/org/topic nodes + edges
7. Log to ingestion_runs table

**Manual ingestion (current):**
- `scripts/ingest.ts` — unified ingestion script
- Manifest files in `scripts/data/`
- Dry-run support: `--dry-run` flag

**Auto-ingestion (PRD-13, upcoming):**
- Vercel cron (hourly) → `/api/cron/ingest`
- Per-source RSS polling
- Discord webhook on new content
- Zero manual intervention

**Quick Add (web UI):**
- Paste any URL or text into Quick Add input
- Auto-detects: YouTube, website, PDF, arXiv, chat transcript, plain note
- Runs appropriate extractor → creates node → auto-edges → auto-embed

---

## Part 8: `docs/search.md` — How Search Works

### Content outline:

**Three search tiers:**
1. **Vector search** — Semantic similarity via Turso's `vector_top_k()` on 1536d embeddings
2. **FTS5** — Full-text search on chunks table
3. **Hybrid (RRF)** — Reciprocal Rank Fusion combining vector + FTS results

**Fallback chain:** hybrid → vector-only → FTS-only → LIKE (last resort)

**What gets searched:**
- Node titles and descriptions (node-level search)
- Chunk text — full source material: transcripts, articles, papers (content-level search)

**Via MCP:**
- `ls_search_nodes` — node-level keyword search
- `ls_search_content` — chunk-level content search (uses hybrid by default)
- `ls_sqlite_query` — custom SQL for advanced filtering

---

## Part 9: `docs/architecture.md` — Codebase Map

### Content outline:

```
latent-space-hub/
  app/                        — Next.js App Router
    api/                      — 30+ API routes (nodes, edges, dimensions, dashboard, etc.)
    page.tsx                  — Home → ThreePanelLayout
  src/
    components/               — React UI (~70 files)
      layout/                 — ThreePanelLayout, LeftTypePanel, MainViewSwitcher
      dashboard/              — Dashboard with stats + category cards
      panes/                  — MapPane (ReactFlow), NodePane, GuidesPane, DimensionsPane
      focus/                  — FocusPanel (tabbed node editor), SourceReader
      views/                  — Feed views (List, Grid, Kanban)
      agents/                 — QuickAdd UI
      settings/               — Settings modal (logs, tools, API keys, database)
    services/
      database/               — Turso client, node/edge/chunk/dimension services
      agents/                 — QuickAdd orchestrator, autoEdge, transcript summarizer
      embedding/              — Chunking + embedding pipeline, auto-queue
      typescript/extractors/  — YouTube, website, PDF extractors
      guides/                 — Guide CRUD service
      events.ts               — SSE real-time broadcasting
    tools/                    — MCP tool definitions (database CRUD, extraction, search)
    config/
      prompts/                — Agent system prompts
      guides/                 — Built-in markdown guides
      categories.ts           — 8-category taxonomy config
    types/                    — TypeScript definitions (database.ts is the key file)
  apps/
    mcp-server-standalone/    — NPX-installable MCP server
  scripts/                    — Ingestion, data refinement, utilities
  docs/                       — This documentation
  docs/development/           — PRDs, backlog, process
```

**Key patterns:**
- Node types are defined in `src/types/database.ts` and `src/config/categories.ts`
- All DB access goes through `src/services/database/` — never direct SQL from components
- MCP tools in `src/tools/` wrap the same database services
- Real-time updates via SSE (`src/services/events.ts`)
- Auto-embedding queue processes in background after node creation

---

## Part 10: `docs/contributing.md` — Contributor Guide

### Content outline:

**Setup:**
```bash
git clone https://github.com/bradwmorris/latent-space-hub.git
cd latent-space-hub
cp .env.example .env.local    # Add Turso URL + token, API keys
npm install
npm run dev                   # localhost:3000
npm run type-check            # Must pass before committing
```

**Git workflow:**
- Always branch from main: `git checkout -b feature/[name]`
- Never commit directly to main
- PRDs drive features — read the PRD before coding

**Backlog:**
- `docs/development/backlog.json` — priority queue
- Each project has a PRD in `docs/development/`
- Status: ready → in_progress → review → completed

**Environment variables:**
| Var | Required | Description |
|-----|----------|-------------|
| `TURSO_DATABASE_URL` | Yes | Turso database URL |
| `TURSO_AUTH_TOKEN` | Yes | Turso auth token |
| `OPENAI_API_KEY` | For embeddings | OpenAI API key |
| `ANTHROPIC_API_KEY` | For agents | Anthropic API key |
| `NEXT_PUBLIC_READONLY_MODE` | No | Disable writes for public deployment |

---

## Part 11: `docs/deployment.md` — Deployment Guide

### Content outline:

**Vercel deployment:**
- Connected to GitHub main branch
- Auto-deploy on merge
- Readonly mode enabled via `NEXT_PUBLIC_READONLY_MODE=true`
- No guide writes, no node creation in readonly

**Environment:**
| Service | What | Where |
|---------|------|-------|
| Database | Turso | `latentspace-bradwmorris.aws-us-east-2.turso.io` |
| Web App | Next.js | Vercel (readonly) |
| Discord Bots | Sig & Slop | Railway |
| MCP Server | NPX package | npm registry |

**Local dev vs production:**
- Local: full write access, hot reload, all API keys in `.env.local`
- Production: readonly UI, bots connect via read-only Turso connection

---

## Part 12: Public-Facing Docs

Public documentation should be accessible from the live web app. Two options:

### Option A: In-app guide pages (recommended)
Use the existing guide system — write public docs as built-in guides that render in the app's Guides pane. No new infrastructure needed.

### Option B: Static pages in the app
Add a `/docs` route in the Next.js app that renders markdown files from `public/docs/`.

### Recommended: Option A (guides)

Create these as built-in guides in `src/config/guides/`:

1. **`welcome.md`** (update existing) — "What is Latent Space Hub? How to explore."
2. **`categories.md`** (new) — "8 content categories and what they contain"
3. **`mcp-quickstart.md`** (new) — "Connect your AI agent to the LS knowledge graph in 2 minutes"
4. **`bots.md`** (new) — "Meet Sig & Slop — the LS Discord bots"

These show up in the app's Settings > Guides tab and are also accessible via MCP (`ls_read_guide`).

---

## Part 13: Update `docs/schema.md`

Rename `2_schema.md` → `schema.md`. Update:
- Replace old node_type values (episode, person, organization, topic, source, event, concept, subscriber) with the 8 canonical categories (podcast, guest, article, entity, builders-club, paper-club, workshop, ainews) + hub
- Update metadata schemas per category
- Add example SQL queries for common operations
- Remove PRD-02 migration notes (historical, move to archive)

---

## Part 14: Update `TROUBLESHOOTING.md`

Add sections for:
- MCP server connection issues
- Turso-specific errors (connection refused, auth token expired)
- Discord bot setup issues
- Embedding generation failures
- Common `npm run type-check` failures

---

## Part 15: Update Project Files

### File: `docs/README.md`
Rewrite as the new documentation index with the updated file list and structure.

### File: `CLAUDE.md`
Update the "Key Directories" section to reference new doc filenames. Add a "Documentation" section pointing to `docs/README.md`.

### File: `docs/development/backlog.json`
Add `documentation-overhaul` project to queue.

---

## Execution Order

| Step | What | Effort |
|------|------|--------|
| 1 | Archive stale docs → `docs/archive/` | Small |
| 2 | Rename kept files (drop number prefixes) | Small |
| 3 | Write `overview.md` | Medium |
| 4 | Write `categories.md` | Small |
| 5 | Write `bots.md` | Medium |
| 6 | Rewrite `mcp-server.md` | Medium |
| 7 | Update `ingestion.md` | Small |
| 8 | Write `search.md` | Small |
| 9 | Write `architecture.md` | Medium |
| 10 | Write `contributing.md` | Small |
| 11 | Write `deployment.md` | Small |
| 12 | Update `schema.md` | Medium |
| 13 | Update `TROUBLESHOOTING.md` | Small |
| 14 | Create public-facing guides (4 files) | Medium |
| 15 | Rewrite `docs/README.md` index | Small |
| 16 | Update `CLAUDE.md` | Small |

---

## Done =

- [x] All stale docs archived to `docs/archive/`
- [x] Number prefixes removed from filenames
- [x] `overview.md` — accurately describes what LS Hub is, how it works, three interfaces
- [x] `categories.md` — 8-category taxonomy documented with examples
- [x] `bots.md` — Sig & Slop personalities, architecture, commands, feed concept
- [x] `mcp-server.md` — external developer can set up and use MCP in 5 minutes
- [x] `ingestion.md` — pipeline documented, sources listed, quick-add explained
- [x] `search.md` — vector + FTS + hybrid search explained
- [x] `architecture.md` — codebase map accurate to current state
- [x] `contributing.md` — new contributor can set up and start working
- [x] `deployment.md` — environments and deployment documented
- [x] `schema.md` — updated for 8 categories, example queries added
- [x] `TROUBLESHOOTING.md` — updated with MCP, Turso, bot issues
- [x] Public guides created: welcome, categories, mcp-quickstart, bots
- [x] `docs/README.md` — updated index
- [x] `CLAUDE.md` — references new doc structure
- [x] `npm run type-check` passes

---

## COMPLETED

**Date:** 2026-02-22

**What was delivered:**

Replaced the entire inherited RA-H documentation set with fresh, accurate documentation for Latent Space Hub.

**Internal docs (11 files in `docs/`):**
- `overview.md` — What LS Hub is, three interfaces, tech stack, graph stats
- `categories.md` — 8-category taxonomy with examples and database mapping
- `bots.md` — Sig & Slop architecture, commands, feed concept
- `mcp-server.md` — Full external developer guide with setup, all tools, example workflows
- `ingestion.md` — Content pipeline, sources, extractors, Quick Add
- `search.md` — Vector + FTS5 + hybrid RRF search
- `architecture.md` — Complete codebase map with key patterns
- `contributing.md` — Dev setup, git workflow, env vars
- `deployment.md` — Vercel, environments, readonly mode
- `schema.md` — Updated for 8 categories, example queries
- `TROUBLESHOOTING.md` — Updated with MCP, Turso, bot, embedding issues

**Public-facing guides (4 files in `src/config/guides/`):**
- `welcome.md` — Rewritten for current product
- `categories.md` — New: content categories explained
- `mcp-quickstart.md` — New: 2-minute MCP setup
- `bots.md` — New: Meet Sig & Slop

**Archived:** 8 stale files moved to `docs/archive/`
