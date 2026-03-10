---
title: Overview
description: The wiki-base for the Latent Space community.
---

# What Is This?

Latent Space Wiki-Base is a shared knowledge system for the [Latent Space](https://www.latent.space/) community. It combines markdown documentation with a simple relational database (SQLite). The documentation is living, breathing, evolving over time as content is ingested, enriched by AI, and explored by both humans and agents.

The core idea is **externalised context**. Rather than knowledge living in people's heads or inside agent context windows, it lives in one shared database that community members, contributors, and AI agents continuously read from and write to.

```
                    ┌─────────────────────┐
                    │                     │
    Humans ────────>│     Wiki-Base       │<──────── Agents
      ^             │   (Turso SQLite)    │             ^
      │             │                     │             │
      │             └─────────────────────┘             │
      │                    │      │                     │
      └────────────────────┘      └─────────────────────┘
         read / write via              read / write via
         web app + Discord             MCP tools + bot tools
```

The documentation, the database, and the AI agent layer are the same thing.

These docs describe how it all works. Each page covers a layer of the system.

# Two Repos, One Database

| Repo | What it is | Deployed on |
|------|-----------|-------------|
| **[latent-space-hub](https://github.com/bradwmorris/latent-space-hub)** | Web app, ingestion pipeline, MCP server, evals | Vercel |
| **[latent-space-bots](https://github.com/bradwmorris/latent-space-bots)** | Discord bot (Slop), agentic tool-calling, member memory | Railway |

They share one Turso database. The hub writes to it (ingestion, web UI, API). The bot reads from it (direct Turso queries) and writes member data back.

# Architecture

<iframe src="https://www.tldraw.com/p/IlWpHJhlb-BBzyjY0NTAo?d=v-1377.-777.2932.1546.page" width="100%" height="500" style="border: 1px solid #1e1e1e; border-radius: 10px;" allowfullscreen></iframe>

Four cloud services, no self-hosted infrastructure.

| Service | Role |
|---------|------|
| **Vercel** | Web app (read-only) + hourly ingestion cron + Discord announcements |
| **Turso** | Cloud SQLite, single shared database for web app, bot, and MCP |
| **Railway** | Slop bot, always-on Discord gateway with agentic tool-calling |
| **OpenRouter** | LLM routing for Slop (currently Claude Sonnet 4.6, swappable) |

# The Database

| Metric | Count |
|--------|-------|
| Total nodes | ~4,100+ |
| Content nodes | ~530 (podcasts, articles, AINews, workshops, paper clubs, builders clubs) |
| People & entity nodes | ~3,400 (guests, organizations, topics) |
| Event nodes | ~50 (scheduled paper club and builders club sessions) |
| Edges | ~8,100 |
| Chunks with embeddings | ~36,000 |
| Coverage | June 2023 to present, continuously updated |

# Web App

Next.js 15 app deployed on Vercel. The primary interface for browsing and managing the database.

## Dashboard

![Dashboard](/images/docs/dashboard.png)

Landing page with stats and 8 category cards. Each card shows node count and 3 preview items.

## Categories

![Categories](/images/docs/category-list.png)

Click any category to see a filtered list. Supports list, grid, and kanban layouts.

## Search

![Search](/images/docs/search.png)

`Cmd+K` global search across titles, descriptions, and content. Hybrid search: FTS5 + vector + Reciprocal Rank Fusion.

## Sidebar

Fixed left panel with all 8 categories (icon + count badge), Quick Add input for pasting any URL or text to ingest, plus search, skills, evals, and docs access.

# Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 + TypeScript + Tailwind CSS |
| Database | Turso (cloud SQLite via `@libsql/client`) |
| Search | Turso native vector search (F32_BLOB + `vector_top_k`) + FTS5 + hybrid RRF |
| Embeddings | OpenAI `text-embedding-3-small` (1536d) |
| AI | OpenAI GPT-4.1-mini (entity extraction, descriptions) |
| MCP | Model Context Protocol server, `npx latent-space-hub-mcp` |
| Bot | Discord.js + OpenRouter, Claude Sonnet 4.6 |

# Origin

Forked from [RA-H](https://github.com/bradwmorris/ra-h_os), a local-first personal wiki-base. Heavily modified for community use. If you want to build something like this for your own personal context or for an enterprise installation, RA-H is completely open source.
