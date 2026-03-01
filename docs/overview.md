# Latent Space Hub — Overview

## The System

Two repos, one knowledge graph.

| Repo | What it is | Deployed on |
|------|-----------|-------------|
| **latent-space-hub** | Knowledge graph — Next.js web app + Turso cloud SQLite + MCP server | Vercel |
| **latent-space-bots** | Discord bot (Slop) — queries the graph via MCP | Railway |

They share one Turso database. The hub writes to it (ingestion, web UI, API). The bot reads from it (MCP tool calls) and writes member data back.

## How It Works

```
Content sources             AI enrichment                Surfaces
──────────────────         ──────────────────           ──────────────────
YouTube transcripts    →   Embeddings (1536d)       →   Web App (Next.js)
Substack articles      →   Chunk splitting          →   MCP Server (agents)
AINews (smol.ai)       →   Entity extraction        →   Discord Bot (Slop)
LatentSpaceTV          →   Auto-edge creation       →   Announcements webhook
```

## Indexing Pipeline

```
Content in (YouTube URL, article, RSS feed)
    ↓
Auto-detect format → extract text (transcript, scrape, parse)
    ↓
Create node in SQLite nodes table — Turso
  (title, description, link, node_type, event_date, metadata)
    ↓
Background enrichment kicks off:
    ↓
1. Node-level embedding
   title + description → OpenAI text-embedding-3-small (1536d) → nodes.embedding
    ↓
2. Chunk-level embedding
   - Split source text into ~2000 char chunks (400 char overlap)
   - Smart boundaries: paragraph breaks > sentence ends > hard cut
   - Batch embed 20 chunks at a time → chunks.embedding (F32_BLOB)
    ↓
3. FTS5 sync via SQL triggers (automatic)
    ↓
4. Entity extraction (Claude Haiku)
   - Extract people, organizations, topics from content
   - Match against existing nodes or create new ones
   - Create typed edges (features, covers_topic, affiliated_with, etc.)
    ↓
5. Companion detection
   - Match podcast ↔ article pairs by title overlap
   - Create companion_article / companion_episode edges
    ↓
6. Discord notification
   - #announcements: clean announcement (title, date, link)
   - #yap or bot kickoff: Slop starts a discussion thread
```

## The Graph — By the Numbers

| Metric | Count |
|--------|-------|
| Total nodes | ~3,900 |
| Content nodes | ~515 (podcasts, articles, AINews, workshops, paper clubs, builders clubs) |
| People & entity nodes | ~3,360 (guests, organizations, topics) |
| Edges | ~7,500 |
| Chunks with embeddings | ~35,800 |
| Coverage | June 2023 → present, continuously updated |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 + TypeScript + Tailwind CSS |
| Database | Turso (cloud SQLite via `@libsql/client`) |
| Search | Turso native vector search (F32_BLOB + `vector_top_k`) + FTS5 + hybrid RRF |
| Embeddings | OpenAI `text-embedding-3-small` (1536d) |
| AI | Anthropic Claude (entity extraction) + OpenAI (embeddings) |
| MCP | Model Context Protocol server — `npx latent-space-hub-mcp` |
| Bot | Discord.js + OpenRouter → Claude Sonnet 4.6 |
| Deployment | Vercel (web + cron), Railway (bot), NPM (MCP package) |

## Origin

Forked from [RA-H Open Source](https://github.com/bradwmorris/ra-h_os) — a local-first personal knowledge graph. Latent Space Hub is the cloud-native deployment built for the LS community. The two projects share a common ancestor but evolve independently.
