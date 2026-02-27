---
title: Latent Space Hub
description: The knowledge graph for the Latent Space community — every podcast, article, and AI News digest, structured, connected, and searchable.
---

# What Is This?

A knowledge graph of the entire [Latent Space](https://www.latent.space/) universe. Every podcast episode, Substack article, AI News digest, conference talk, paper club session, and builders club meetup — structured into nodes, connected by edges, and searchable down to the transcript level.

New content is automatically ingested within an hour of publication — chunked, embedded, entity-extracted, and wired into the existing graph. You can search for what was actually *said*, not just titles.

---

# The Web App

**[latent-space-hub.vercel.app](https://latent-space-hub.vercel.app/)**

![Dashboard](/images/docs/dashboard.png)

### Dashboard

The landing page. Category cards show counts and the latest items. Click any card to browse.

### Categories

| Category | What's in it |
|----------|-------------|
| **Podcast** | Latent Space episodes with full transcripts |
| **Article** | latent.space Substack posts |
| **AI News** | Daily AINews digests from smol.ai |
| **Builders Club** | Community meetup recordings |
| **Paper Club** | Deep-dive paper discussions |
| **Workshop** | AI Engineer conference talks and tutorials |
| **Guest** | People who appear on or create LS content |
| **Entity** | Organizations and technical topics |

Content categories sort by most recent. Guest and Entity sort by most connected.

### Views

- **Dashboard** — category cards with stats and previews
- **Type** — browse a single category with sidebar listing and detail panel
- **Feed** — chronological feed across all categories (list, grid, or kanban)
- **Map** — interactive graph visualization

### Search

`Cmd+K` opens global search across all categories.

![Search](/images/docs/search.png)

### Focus Panel

Click any node to see its details: description, notes, connections, source links, and dimensions.

---

# Slop — The Discord Bot

![Slop](/images/docs/slop-avatar.png)

Slop is an AI bot in the Latent Space Discord backed by the full knowledge graph. It searches transcripts, articles, and AINews in real time — then gives opinionated, source-grounded responses.

### What It Does

- Searches full transcripts and articles, not just titles
- Gives opinionated takes grounded in actual sources
- Links directly to episodes, articles, and AINews in every response
- Connects dots across the graph
- Remembers your interests if you `/join`

### Commands

| Method | What happens |
|--------|-------------|
| **@Slop** | Mention Slop in any allowed channel. A thread is created and Slop responds with graph-backed context. Follow-up in the thread. |
| `/tldr <query>` | Concise summary on any topic from the knowledge graph. |
| `/wassup` | What's new and interesting in Latent Space right now. |
| `/join` | Create your member profile. Slop remembers your interests over time. |

### Member Memory

When you `/join`, Slop creates a member node tied to your Discord account. From then on, Slop checks your profile before responding, logs a one-line summary of each interaction, tracks your interests and activity, and creates connections between your profile and the content it retrieves for you. All of this happens silently after Slop responds.

### Auto-Discussions

When new content drops, the hub posts an announcement and Slop kicks off a discussion thread — surfacing connections and insights from the graph.

![Discussion kickoff in Discord](/images/docs/discord-kickoff.jpg)

### Personality

Slop is not a polite assistant. Opinionated, provocative, occasionally unhinged — but always grounded in the knowledge base. It exists to spark discussion, not give safe answers.

![Slop responding to a discussion](/images/docs/slop-response.jpg)

---

# Connect Your AI Agent (MCP)

Plug any AI agent into the knowledge graph via the [Model Context Protocol](https://modelcontextprotocol.io/).

**Works with:** Claude Code, Cursor, Windsurf, or any MCP-compatible agent.

### Setup

Add to your MCP config (Claude Code: `~/.claude.json`, Cursor: `.cursor/mcp.json`):

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

### What Your Agent Can Do

- Search across all content — episodes, articles, transcripts, AINews
- Find connections between guests, topics, and episodes
- Read full source material (transcripts, articles, papers)
- Run custom SQL queries against the graph
- Explore dimensions and content guides

### Example Prompts

- "Search Latent Space for everything about AI agents"
- "What has Andrej Karpathy talked about on the podcast?"
- "Find episodes that discuss RAG vs fine-tuning"
- "What were the key themes in AINews this month?"
- "Who are the most connected guests in the knowledge graph?"

### Tools

| Tool | What it does |
|------|-------------|
| `ls_search_nodes` | Search nodes by title, description, topic. Filter by type or date. |
| `ls_search_content` | Deep search through full transcripts and articles. |
| `ls_get_context` | Graph overview — stats, top nodes, dimensions. |
| `ls_get_nodes` | Load full node details by ID. |
| `ls_query_edges` | Find all connections for a specific node. |
| `ls_sqlite_query` | Run read-only SQL for advanced queries. |
| `ls_read_guide` | Read built-in navigation guides. |
| `ls_list_dimensions` | List all dimensions with node counts. |

---

# Evals

Every Slop interaction is traced and logged — MCP tool calls, retrieval method, response latency, Discord context.

**URL:** [/evals](/evals)

![Evals Dashboard](/images/docs/evals-dashboard.png)

Each trace captures the user's message, Slop's response, every MCP tool call with timing, the retrieval method used, total latency, and Discord context. Filter by slash commands, kickoffs, or interactions with tool calls. Click any row to expand the full trace.

---

# How It Works

### The Pipeline

Every hour, the system checks four sources:

| Source | Type | Method |
|--------|------|--------|
| Latent Space Podcast | YouTube | RSS + transcript extraction |
| latent.space Substack | Blog posts | RSS + article scraping |
| AINews (smol.ai) | GitHub markdown | GitHub API + markdown parsing |
| LatentSpaceTV | YouTube | RSS + transcript extraction |

When something new is found:

1. **Extract** — pull the transcript or article text
2. **Chunk** — split into ~2,000-character pieces
3. **Embed** — generate vectors via OpenAI `text-embedding-3-small`
4. **Extract entities** — Claude identifies people, companies, and topics
5. **Connect** — link to related nodes already in the graph
6. **Detect companions** — pair matching podcasts and articles
7. **Announce** — post to Discord + kick off Slop discussion

No new content? Nothing happens.

### Architecture

Four cloud services, no self-hosted infrastructure.

| Service | Role |
|---------|------|
| **Vercel** | Web app (read-only) + hourly ingestion cron + Discord announcements |
| **Turso** | Cloud SQLite — single shared database for web app, bot, and MCP |
| **Railway** | Slop bot — always-on Discord gateway |
| **OpenRouter** | LLM routing for Slop (currently Claude Sonnet 4.6, swappable via config) |

### Search

Three indexing layers, all automatic:

- **Full-text (FTS5)** — keyword search with BM25 ranking
- **Vector embeddings** — semantic search by meaning, not just keywords
- **B-tree indexes** — fast filtering by date, type, and connections

Default mode is **hybrid** — vector + FTS in parallel, merged via Reciprocal Rank Fusion. Degrades gracefully if any layer fails.

### Open Source

| Repo | What's in it |
|------|-------------|
| [latent-space-hub](https://github.com/bradwmorris/latent-space-hub) | Web app, ingestion pipeline, MCP server, evals |
| [latent-space-bots](https://github.com/bradwmorris/latent-space-bots) | Discord bot (Slop) — personas, MCP client, member memory |

Built with Next.js 15, TypeScript, Turso, and the Vercel AI SDK. Forked from [RA-H](https://github.com/bradwmorris/ra-h_os), a local-first personal knowledge graph.
