---
title: Overview
description: The knowledge graph for the Latent Space community — two repos, one database, four surfaces.
---

# The System

Two repos, one knowledge graph.

| Repo | What it is | Deployed on |
|------|-----------|-------------|
| **[latent-space-hub](https://github.com/bradwmorris/latent-space-hub)** | Knowledge graph — Next.js web app, ingestion pipeline, MCP server, evals | Vercel |
| **[latent-space-bots](https://github.com/bradwmorris/latent-space-bots)** | Discord bot (Slop) — agentic MCP tool-calling, member memory | Railway |

They share one Turso database. The hub writes to it (ingestion, web UI, API). The bot reads from it (MCP tool calls) and writes member data back.

# How It Works

```
Content sources             AI enrichment                Surfaces
──────────────────         ──────────────────           ──────────────────
YouTube transcripts    →   Embeddings (1536d)       →   Web App (Next.js)
Substack articles      →   Chunk splitting          →   MCP Server (agents)
AINews (smol.ai)       →   Entity extraction        →   Discord Bot (Slop)
LatentSpaceTV          →   Auto-edge creation       →   Announcements webhook
```

1. **Content goes in** — auto-ingestion pipeline polls RSS feeds hourly, extracts from YouTube and Substack
2. **AI enriches it** — chunks are embedded, entities extracted, edges created automatically
3. **Humans and agents explore it** — via the web UI, MCP tools, or Discord
4. **The graph grows** — each new piece of content connects to existing knowledge

# Architecture

<iframe src="https://www.tldraw.com/p/IlWpHJhlb-BBzyjY0NTAo?d=v-1377.-777.2932.1546.page" width="100%" height="500" style="border: 1px solid #1e1e1e; border-radius: 10px;" allowfullscreen></iframe>

Four cloud services, no self-hosted infrastructure.

| Service | Role |
|---------|------|
| **Vercel** | Web app (read-only) + hourly ingestion cron + Discord announcements |
| **Turso** | Cloud SQLite — single shared database for web app, bot, and MCP |
| **Railway** | Slop bot — always-on Discord gateway with agentic MCP tool-calling |
| **OpenRouter** | LLM routing for Slop (currently Claude Sonnet 4.6, swappable) |

# The Graph

| Metric | Count |
|--------|-------|
| Total nodes | ~3,900 |
| Content nodes | ~515 (podcasts, articles, AINews, workshops, paper clubs, builders clubs) |
| People & entity nodes | ~3,360 (guests, organizations, topics) |
| Edges | ~7,500 |
| Chunks with embeddings | ~35,800 |
| Coverage | June 2023 → present, continuously updated |

# Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 + TypeScript + Tailwind CSS |
| Database | Turso (cloud SQLite via `@libsql/client`) |
| Search | Turso native vector search (F32_BLOB + `vector_top_k`) + FTS5 + hybrid RRF |
| Embeddings | OpenAI `text-embedding-3-small` (1536d) |
| AI | Anthropic Claude (entity extraction) + OpenAI (embeddings) |
| MCP | Model Context Protocol server — `npx latent-space-hub-mcp` |
| Bot | Discord.js + OpenRouter → Claude Sonnet 4.6 |

Built on [RA-H](https://github.com/bradwmorris/ra-h_os), a local-first personal knowledge graph.
