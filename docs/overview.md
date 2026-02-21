# Latent Space Hub — Overview

## What is Latent Space Hub?

A knowledge graph for the [Latent Space](https://www.latent.space/) universe — every podcast episode, article, AI News digest, conference talk, paper club session, guest, and entity, structured, connected, and searchable.

Think of it as a **second brain** for Latent Space. Not a static wiki — a living graph where nodes have edges, dimensions, and full source material. The graph grows over time and connections compound.

## How It Works

```
Content sources          AI enrichment            Three interfaces
─────────────────       ──────────────────       ──────────────────
YouTube transcripts  →  Embeddings (1536d)    →  Web App (dashboard)
Substack articles    →  Entity extraction     →  MCP Server (agents)
GitHub (AINews)      →  Auto-edges            →  Discord Bots (Sig & Slop)
```

1. **Content goes in** — Ingestion pipeline extracts from YouTube, Substack, and GitHub
2. **AI enriches it** — Chunks are embedded, entities extracted, edges created automatically
3. **Humans and agents explore it** — Via the web UI, MCP tools, or Discord bots
4. **The graph grows** — Each new piece of content connects to existing knowledge

## Three Interfaces

### 1. The Web App

Dashboard landing page with stats and 8 category cards. Browse by category (Podcast, Guest, Article, Entity, Builders Club, Paper Club, Workshop, AI News). Full-text and semantic search. Interactive graph map visualization.

### 2. The MCP Server

Any MCP-compatible AI agent (Claude Code, Cursor, Windsurf, custom agents) can plug into the graph via `ls_*` tools. Search, read, and contribute to the knowledge base programmatically.

```bash
npx latent-space-hub-mcp
```

See [MCP Server docs](./mcp-server.md) for setup.

### 3. Discord Bots — Sig & Slop

Two AI personalities backed by the knowledge base:
- **Sig (Signal)** — Precise, factual, citation-heavy. The reliable answer bot.
- **Slop (Entropy)** — Opinionated, provocative, connects unexpected dots. The debate starter.

See [Bots docs](./bots.md) for details.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 + TypeScript + Tailwind CSS |
| Database | Turso (cloud SQLite via `@libsql/client`) |
| Search | Turso native vector search (F32_BLOB + `vector_top_k`) + FTS5 |
| Embeddings | OpenAI `text-embedding-3-small` (1536d) |
| AI | Anthropic (Claude) + OpenAI via Vercel AI SDK |
| MCP | Model Context Protocol server (`npx latent-space-hub-mcp`) |
| Bots | Discord.js — separate repo (`latent-space-bots`) |
| Deployment | Vercel (web app, readonly), Railway (Discord bots) |

## The Graph — By the Numbers

| Metric | Count |
|--------|-------|
| Total nodes | ~4,000 |
| Content nodes | ~570 (episodes, articles, newsletters) |
| Entity nodes | ~3,400 (people, orgs, topics) |
| Edges | ~7,300 |
| Chunks with embeddings | ~36,000 |
| Coverage | Jan 2025 → present |

## Origin

Forked from [RA-H Open Source](https://github.com/bradwmorris/ra-h_os) — a local-first personal knowledge graph. Latent Space Hub is the cloud-native product built specifically for the LS community. The two projects share a common ancestor but evolve independently.

## Documentation

| Doc | What it covers |
|-----|---------------|
| **[Categories](./categories.md)** | The 8 content categories |
| **[Schema](./schema.md)** | Database tables and relationships |
| **[MCP Server](./mcp-server.md)** | External agent setup and tools |
| **[Bots](./bots.md)** | Sig & Slop — Discord bot architecture |
| **[Ingestion](./ingestion.md)** | Content pipeline and sources |
| **[Search](./search.md)** | Vector, FTS, and hybrid search |
| **[Architecture](./architecture.md)** | Codebase map and patterns |
| **[Contributing](./contributing.md)** | Dev setup and workflow |
| **[Deployment](./deployment.md)** | Vercel, environments, readonly mode |
| **[Troubleshooting](./TROUBLESHOOTING.md)** | Common issues and fixes |
