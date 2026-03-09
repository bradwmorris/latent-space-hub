---
title: Overview
description: The wiki-base for the Latent Space community — externalised context that humans and agents read and write together.
---

# What Is This?

Latent Space Wiki-Base is a shared knowledge system for the [Latent Space](https://www.latent.space/) community. It's a hybrid between a wiki and a database — structured content stored in SQLite, enriched by AI, and accessible to both humans and agents.

The core idea is **externalised context**. Instead of knowledge living in people's heads, chat logs, or scattered docs, it lives in one graph that everyone — community members, contributors, and AI agents — continuously reads from and writes to.

You're not just building documentation. You're building a system where the documentation, the database, and the AI agent layer are the same thing.

# How It Works

```
Content sources             AI enrichment                Surfaces
──────────────────         ──────────────────           ──────────────────
YouTube transcripts    →   Embeddings (1536d)       →   Web App (Next.js)
Substack articles      →   Chunk splitting          →   MCP Server (agents)
AINews (smol.ai)       →   Entity extraction        →   Discord Bot (Slop)
LatentSpaceTV          →   Auto-edge creation       →   Announcements webhook
```

1. **Content goes in** — an auto-ingestion pipeline polls RSS feeds hourly, extracts transcripts and articles
2. **AI enriches it** — text is chunked, embedded, and indexed. Entities are extracted. Edges are created automatically
3. **Humans and agents explore it** — via the web app, MCP tools, or Discord
4. **The graph grows** — each new piece of content connects to existing knowledge

New content is automatically chunked, embedded, and indexed for search. See [Indexing & Search](/docs/index-search) for how the pipeline works.

# Two Repos, One Database

| Repo | What it is | Deployed on |
|------|-----------|-------------|
| **[latent-space-hub](https://github.com/bradwmorris/latent-space-hub)** | Knowledge graph — Next.js web app, ingestion pipeline, MCP server, evals | Vercel |
| **[latent-space-bots](https://github.com/bradwmorris/latent-space-bots)** | Discord bot (Slop) — agentic tool-calling, member memory | Railway |

They share one Turso database. The hub writes to it (ingestion, web UI, API). The bot reads from it (direct Turso queries) and writes member data back.

# Architecture

<iframe src="https://www.tldraw.com/p/IlWpHJhlb-BBzyjY0NTAo?d=v-1377.-777.2932.1546.page" width="100%" height="500" style="border: 1px solid #1e1e1e; border-radius: 10px;" allowfullscreen></iframe>

Four cloud services, no self-hosted infrastructure.

| Service | Role |
|---------|------|
| **Vercel** | Web app (read-only) + hourly ingestion cron + Discord announcements |
| **Turso** | Cloud SQLite — single shared database for web app, bot, and MCP |
| **Railway** | Slop bot — always-on Discord gateway with agentic tool-calling |
| **OpenRouter** | LLM routing for Slop (currently Claude Sonnet 4.6, swappable) |

# The Graph

| Metric | Count |
|--------|-------|
| Total nodes | ~4,100+ |
| Content nodes | ~530 (podcasts, articles, AINews, workshops, paper clubs, builders clubs) |
| People & entity nodes | ~3,400 (guests, organizations, topics) |
| Event nodes | ~50 (scheduled paper club and builders club sessions) |
| Edges | ~8,100 |
| Chunks with embeddings | ~36,000 |
| Coverage | June 2023 → present, continuously updated |

# Web App

Next.js 15 app deployed on Vercel. The primary interface for browsing and managing the graph.

## Dashboard

![Dashboard](/images/docs/dashboard.png)

Landing page with stats and 8 category cards. Each card shows node count and 3 preview items — content sorted by most recent, entities by most connected.

## Categories

![Categories](/images/docs/category-list.png)

Click any category to see a filtered list. Supports list, grid, and kanban layouts.

## Search

![Search](/images/docs/search.png)

`Cmd+K` global search across titles, descriptions, and content. Hybrid search: FTS5 + vector + Reciprocal Rank Fusion.

## Graph Map

![Graph Map](/images/docs/map-view.png)

Interactive ReactFlow visualization of node connections.

## Feed View

![Feed View](/images/docs/feed-view.png)

Chronological content feed with source text reader and format-aware rendering (transcript, markdown, raw).

## Sidebar

Fixed left panel with all 8 categories (icon + count badge), Quick Add input at top for pasting any URL or text to ingest, plus search, skills, evals, and docs access.

## Key Features

- Light/dark mode
- Real-time updates via SSE (node/edge/dimension changes broadcast instantly)
- Source reader with format-aware rendering
- Readonly mode for public deployments (`NEXT_PUBLIC_READONLY_MODE=true`)

# Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 + TypeScript + Tailwind CSS |
| Database | Turso (cloud SQLite via `@libsql/client`) |
| Search | Turso native vector search (F32_BLOB + `vector_top_k`) + FTS5 + hybrid RRF |
| Embeddings | OpenAI `text-embedding-3-small` (1536d) |
| AI | OpenAI GPT-4.1-mini (entity extraction, descriptions) |
| MCP | Model Context Protocol server — `npx latent-space-hub-mcp` |
| Bot | Discord.js + OpenRouter → Claude Sonnet 4.6 |

Built on [RA-H](https://github.com/bradwmorris/ra-h_os), a local-first personal wiki-base.
