# PRD 14 (V2): Documentation Overhaul V2

## Status: Ready

---

## The Problem

There is no user-facing documentation. A Latent Space community member has no way to understand what the hub is, what they can do with it, or how to get started — unless they dig through a GitHub repo's `docs/` folder or stumble into the in-app Guides pane (which is designed for AI agents, not humans).

The hub has three access points — the web app, Slop in Discord, and MCP — but none of them are explained anywhere a normal person would find.

---

## Three Documentation Layers

This project has three distinct documentation needs. Two exist. One doesn't.

### 1. Developer Docs — `docs/` (EXISTS)

**Audience:** Contributors and developers building the codebase.
**Where:** `docs/` directory on GitHub.
**Content:** Architecture, schema, deployment, ingestion pipeline internals, troubleshooting.
**Status:** Exists, has drift from recent PRDs. Needs cleanup (Part B of this PRD).

### 2. Agent Guides — `src/config/guides/` (EXISTS)

**Audience:** Slop, Sig, and users' AI agents (via MCP `ls_read_guide`).
**Where:** Bundled in the app, served via Guides pane and MCP tools.
**Content:** Operational instructions for navigating the graph — categories, search patterns, learning paths. These are like skills/system prompts for AI consumption.
**Status:** Exists, mostly current. Needs verification pass.

### 3. User Docs — Published on the Hub (DOES NOT EXIST)

**Audience:** Latent Space community members — AI engineers, podcast listeners, Discord members, newsletter readers.
**Where:** Published at `https://latent-space-hub.vercel.app/docs` — a real page on the live hub.
**Content:** What is this, why should I care, and how do I use it.
**Status:** Does not exist. This is the primary deliverable of V2.

---

## Part A: User-Facing Documentation (Primary Deliverable)

### Who Is the User?

An AI engineer who follows Latent Space. They listen to the podcast, read the Substack, maybe hang out in the Discord. They're technical but they're not going to read codebase architecture docs. They want to understand what this thing is and start using it in under 5 minutes.

### What Do They Need to Know?

**One core message:** The Latent Space Hub is a knowledge graph of everything Latent Space has ever produced — every podcast episode, article, AI News digest, conference talk, paper club, builders club session — structured, connected, and searchable. There are three ways to use it.

### Content Plan

The docs should be a single published page (or a small set of pages) at `/docs`. Clean, scannable, no jargon about Turso or cron jobs.

---

#### Section 1: What Is the Latent Space Hub?

The hook. Why should someone care?

**Key points:**
- A knowledge graph of the entire Latent Space universe
- Every podcast, article, AINews digest, conference talk, paper club, builders club — structured and connected
- Not a static archive — a living graph where content is connected by who appeared, what topics were covered, which ideas contradict or build on each other
- Automatically updated — new content is ingested within an hour of publication
- Full transcripts, not just titles — you can search for what was actually *said*

**The numbers** (query at execution time):
- X,000+ nodes across 8 content categories
- X,000+ edges connecting them
- X0,000+ chunks of searchable full-text content
- Covering January 2025 → present, continuously updated

---

#### Section 2: Browse the Web App

**URL:** `https://latent-space-hub.vercel.app/`

How to navigate:

- **Dashboard** — Landing page. 8 category cards with preview items. Click any category to browse.
- **Categories** — Podcast, Guest, Article, Entity, Builders Club, Paper Club, Workshop, AI News. Content categories sort by most recent. Guest and Entity sort by most connected.
- **Search** — `Cmd+K` to search across everything. Finds episodes, guests, topics, articles by name.
- **Map** — Visual graph view. See how everything connects. Larger nodes have more connections.
- **Focus Panel** — Click any node to see its full details: description, notes, connections, source links, dimensions.

Brief explanation of what each category contains:
- **Podcast** — Latent Space podcast episodes with full transcripts
- **Article** — Blog posts from the latent.space Substack
- **AI News** — Daily AINews digests from smol.ai
- **Builders Club** — Community meetup recordings
- **Paper Club** — Deep-dive paper discussions
- **Workshop** — Conference talks and tutorials (AI Engineer events)
- **Guest** — People who appear on or create LS content
- **Entity** — Organizations (OpenAI, Anthropic) and technical topics (RAG, agents, MCP)

---

#### Section 3: Talk to Slop in Discord

Slop is an AI bot in the Latent Space Discord with full access to the knowledge graph.

**What Slop does:**
- Answers questions about anything covered in Latent Space content
- Searches the full graph — transcripts, articles, AINews — not just titles
- Gives opinionated, provocative takes grounded in the actual content
- Cites specific episodes, articles, and dates
- Connects dots across the graph — "this contradicts what X said in episode Y three months ago"

**How to use Slop:**
- `/ask` — Ask a question. Slop searches the graph and responds.
- `/search` — Search the knowledge base directly.
- `/episode` — Find specific episodes by topic or guest.
- `/debate` — Get Slop to argue both sides of a topic.
- Or just @ mention Slop in any channel.

**The #yap feed:**
When new content drops (a new podcast episode, article, or AINews digest), Slop automatically kicks off a discussion in #yap. It digs into the graph, surfaces the most interesting connections and insights, and links back to the source. Community jumps in from there.

**Slop's personality:**
Slop is not a polite assistant. It's opinionated, provocative, and occasionally unhinged — but always grounded in the knowledge base. It exists to spark discussion, not to give safe answers.

---

#### Section 4: Connect Your AI Agent (MCP)

Plug your AI agent directly into the knowledge graph via Model Context Protocol.

**Works with:** Claude Code, Cursor, Windsurf, or any MCP-compatible agent.

**Setup (2 minutes):**

Add to your MCP config:

```json
{
  "mcpServers": {
    "latent-space-hub": {
      "command": "npx",
      "args": ["-y", "latent-space-hub-mcp"],
      "env": {
        "TURSO_DATABASE_URL": "libsql://latentspace-bradwmorris.aws-us-east-2.turso.io",
        "TURSO_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

Restart your agent. The `ls_*` tools are now available.

**What your agent can do:**
- Search across all Latent Space content — episodes, articles, transcripts, AINews
- Find connections between guests, topics, and episodes
- Run custom queries against the graph
- Read full source material (transcripts, articles)
- Explore dimensions and learning paths

**Example prompts:**
- "Search Latent Space for everything about AI agents"
- "What has Andrej Karpathy talked about on the podcast?"
- "Find episodes that discuss RAG vs fine-tuning"
- "What were the key themes in AINews this month?"
- "Trace the connections between LangChain and the agents discussion"

**Available tools:**
- `ls_search_nodes` — Search by title, description, topic
- `ls_search_content` — Deep search through full transcripts and articles
- `ls_get_context` — Get a graph overview (stats, top nodes, dimensions)
- `ls_get_nodes` — Load full node details by ID
- `ls_query_edges` — Find connections between nodes
- `ls_sqlite_query` — Custom SQL for advanced queries
- `ls_read_guide` — Read built-in navigation guides

---

### Implementation

The app already has the infrastructure to serve markdown content: `react-markdown`, `remark-gfm`, `gray-matter`, and the guide service pattern. The `/docs` page extends this.

#### New Files

| File | Purpose |
|------|---------|
| `src/config/docs/` | Directory for user-facing markdown docs |
| `src/config/docs/index.md` | Main docs page content (or split into multiple files) |
| `app/docs/page.tsx` | Next.js page route — renders docs at `/docs` |
| `app/docs/[slug]/page.tsx` | Individual doc pages (if multi-page) |
| `src/services/docs/docsService.ts` | Service to read docs from `src/config/docs/` (mirrors guideService pattern) |
| `src/components/docs/DocsLayout.tsx` | Clean layout for docs rendering — not the three-panel dashboard, a simple content page |

#### Design Decisions

**Single page vs multi-page?**

Start with a **single page** with anchor sections. One URL to share: `/docs`. If it grows, split into `/docs/[slug]` later. The content described above is ~4 sections, fits comfortably on one scrollable page.

**Layout:**

NOT the three-panel dashboard layout. The docs page should be a clean, standalone content page:
- Full-width content column (max ~720px, centered)
- Sticky section nav on the side (desktop) or collapsible at top (mobile)
- Hub branding + link back to the dashboard
- Light, readable typography

**Readonly mode:**

Docs are read-only by nature. No special handling needed — the page just renders markdown.

**Link from the dashboard:**

Add a "Docs" or "?" link somewhere accessible from the main dashboard — header, footer, or settings — so users browsing the hub can find the documentation.

---

## Part B: Developer Docs Drift Cleanup

The developer docs in `docs/` have drift from PRD-13, PRD-16, and PRD-10. This is the tactical cleanup.

### Significant Drift

| File | Issue | Fix |
|------|-------|-----|
| `docs/ingestion.md` | "Auto-Ingestion (Upcoming — PRD-13)" — shipped. Missing cron routes, companion detection, announcement/yap split, entity extraction cron | Replace "Upcoming" section with shipped implementation: two cron endpoints, per-item flow, companion detection, Discord notification split |
| `docs/bots.md` | "#yap Channel (Upcoming)" — shipped. Feed says "Sig posts an analysis" — now Slop-only | Replace feed section: Slop-only kickoff, companion-aware, implementation references (notify.ts, hasCompanion) |
| `docs/deployment.md` | Missing Vercel cron config and Discord webhook env vars | Add cron jobs section (two endpoints, schedule, auth). Add env vars: `DISCORD_ANNOUNCEMENTS_WEBHOOK_URL`, `DISCORD_YAP_WEBHOOK_URL`, `DISCORD_SLOP_USER_ID`, `CRON_SECRET` |

### Minor Drift

| File | Issue | Fix |
|------|-------|-----|
| `docs/overview.md` | Graph stats stale, "present" vague, no mention of auto-ingestion | Refresh stats from DB, "continuously updated", mention auto-ingestion |
| `docs/architecture.md` | Missing `app/api/cron/extract-entities/`, `scripts/link-companion-nodes.ts` | Add to project structure tree |
| `docs/contributing.md` | Missing Discord/cron env vars, no link to data-standards.md | Add env vars, add data quality section referencing data-standards |
| `docs/TROUBLESHOOTING.md` | Entity extraction section doesn't mention separate cron | Add cron timeout note + backfill info |
| `docs/README.md` | `data-standards.md` not linked, no pointer to user docs | Add data-standards row, add note about user docs at `/docs` |

### No Changes Needed

`docs/schema.md`, `docs/categories.md`, `docs/search.md`, `docs/mcp-server.md` — all current.

---

## Part C: Agent Guides Verification

Quick pass on `src/config/guides/` to make sure agent-facing content is accurate.

| Guide | Check |
|-------|-------|
| `categories.md` | Categories match `src/config/categories.ts` |
| `mcp-quickstart.md` | Tool names match current MCP server |
| `agent-engineering.md` | Spot-check 3-4 referenced titles exist in the graph |
| `context-engineering.md` | Spot-check 3-4 referenced titles exist in the graph |
| `bots.md` | Already updated by PRD-16 — verify |
| `welcome.md` | Verify orientation paths still work |

Fix discrepancies if found.

---

## Execution Order

| Step | What | Effort |
|------|------|--------|
| 1 | Design and build `/docs` page route + layout | Medium |
| 2 | Write Section 1: What Is the Latent Space Hub? | Small |
| 3 | Write Section 2: Browse the Web App | Small |
| 4 | Write Section 3: Talk to Slop in Discord | Small |
| 5 | Write Section 4: Connect Your AI Agent (MCP) | Small |
| 6 | Add docs link from the dashboard | Tiny |
| 7 | Fix developer docs drift — `ingestion.md`, `bots.md`, `deployment.md` | Medium |
| 8 | Fix minor drift — `overview.md`, `architecture.md`, `contributing.md`, `TROUBLESHOOTING.md`, `README.md` | Small |
| 9 | Verify agent guides | Small |

---

## Dependencies

| Dependency | Status | Impact |
|-----------|--------|--------|
| PRD-10 data-refinement | Phase 2 in progress | Not a blocker. User docs describe the product as-is. Graph stats update is a one-line change when Phase 2 finishes |
| PRD-16 graph-bot-polish | Code complete | Companion detection, Slop-only, entity cron — all reflected in this plan |

**V2 can run now.**

## Out of Scope

- New documentation platform (Docusaurus, GitBook, etc.) — overkill, the Next.js app can serve this
- Video tutorials
- Interactive demos
- Cross-repo docs for `latent-space-bots`
- CHANGELOG.md updates

---

## Done =

### User Docs (Primary)
- [x] `/docs` page exists and is published on the live hub
- [x] Section 1: What is the LS Hub — clear, compelling, with live graph stats
- [x] Section 2: Browse the web app — dashboard, categories, search, map explained
- [x] Section 3: Talk to Slop — commands, personality, the feed, how it works
- [x] Section 4: Connect your AI agent — MCP setup, example prompts, tool list
- [x] Docs page is linked from the main dashboard
- [x] A community member can go from zero to understanding in under 5 minutes

### Developer Docs (Drift Cleanup)
- [x] No doc says "upcoming" or "planned" for any shipped feature
- [x] `docs/ingestion.md` — auto-ingestion documented as shipped
- [x] `docs/bots.md` — feed section matches production
- [x] `docs/deployment.md` — cron jobs + webhook env vars documented
- [x] Minor drift fixed in overview, architecture, contributing, troubleshooting, README

### Agent Guides (Verification)
- [x] All 6 guides verified against current product
- [x] Discrepancies fixed (none needed — all current)

### Quality Gates
- [x] User docs answer "how do I use this?" — no implementation details
- [x] Developer docs answer "how does this work internally?" — no user-facing fluff
- [x] Agent guides help bots/agents navigate the graph — operational, not explanatory
- [x] `npm run type-check` passes

---

## COMPLETED
**Date:** 2026-02-23
**What was delivered:**
- User-facing `/docs` page with 4 sections: What Is the Hub, Browse the Web App, Talk to Slop, Connect Your AI Agent (MCP)
- DocsLayout component with sticky section nav, responsive mobile toggle, and back-to-hub link
- docsService for reading markdown docs from `src/config/docs/`
- Docs link in sidebar (both collapsed and expanded states), visible in readonly mode
- Fixed significant drift in `ingestion.md` (auto-ingestion now documented as shipped with cron endpoints, companion detection, Discord notifications), `bots.md` (Slop-only feed with companion awareness), `deployment.md` (cron jobs and 7 new env vars)
- Fixed minor drift in `overview.md` (stats, coverage dates, auto-ingestion mention), `architecture.md` (cron routes, docs route, ingestion service, companion script), `contributing.md` (Discord/cron env vars), `TROUBLESHOOTING.md` (entity extraction cron), `README.md` (user docs reference)
- Verified all 6 agent guides — no discrepancies found
