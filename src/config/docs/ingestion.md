---
title: Ingestion
description: How content gets into the knowledge graph — four sources, hourly cron, AI enrichment, and Discord notifications.
---

# Content Sources

Four feeds, polled hourly by Vercel cron.

| Source | Type | Method | Category |
|--------|------|--------|----------|
| Latent Space Podcast | YouTube | RSS + transcript extraction | `podcast` |
| latent.space Substack | Blog posts | RSS + article scraping | `article` |
| AINews (smol.ai) | Newsletter | RSS + markdown parsing | `ainews` |
| LatentSpaceTV | YouTube | RSS + transcript extraction | `workshop` / `builders-club` / `paper-club` |

# Hourly Cron

Two endpoints on Vercel, staggered by 30 minutes.

| Endpoint | Schedule | What it does |
|----------|----------|-------------|
| `GET /api/cron/ingest` | Every hour at `:00` | Polls all 4 RSS feeds, discovers new items, extracts text, creates nodes, embeds, notifies Discord |
| `GET /api/cron/extract-entities` | Every hour at `:30` | Finds content nodes with chunks but no edges, runs Claude Haiku entity extraction, creates entity nodes + edges |

Both require `Authorization: Bearer $CRON_SECRET`. A concurrency guard prevents overlapping runs.

# The Pipeline

When something new is found:

1. **Discover** — RSS check finds items not already in the DB (dedup by link URL)
2. **Extract** — YouTube transcript (`youtube-transcript-plus`) or article text (Cheerio scraper)
3. **Create node** — title, link, event_date, node_type, dimensions, metadata, raw text
4. **Chunk** — split into ~2,000-character pieces with 400-char overlap at smart boundaries (paragraph > sentence > hard cut)
5. **Embed** — OpenAI `text-embedding-3-small` (1536d). Node-level on title + description. Chunk-level in batches of 20.
6. **Companion detection** — match podcast ↔ article pairs by title word overlap (Jaccard threshold 0.5). Creates `companion_article` / `companion_episode` edges.
7. **Notify Discord** — post to #announcements + kick off Slop discussion thread
8. **Log** — record in `ingestion_runs` table

No new content? Nothing happens.

# Entity Extraction

Runs on the `:30` cron. Finds content nodes created in the last 7 days that have chunks but zero edges.

For each node:

1. Send chunk text to Claude Haiku with extraction prompt
2. Extract structured entities: people, organizations, topics
3. For each entity: search existing nodes → match or create new `guest`/`entity` node
4. Create typed edges: `features`, `covers_topic`, `affiliated_with`, `appeared_on`

Processes up to 5 items per run.

# Discord Notifications

Each newly ingested item triggers:

1. **#announcements** — clean card with emoji header, title, event date, and source link (webhook)
2. **Slop discussion** — the hub calls Slop's internal API (`/internal/kickoff`) to start a graph-backed discussion thread. Falls back to a #yap webhook if the bot API isn't configured.

Companion items skip the discussion kickoff to avoid duplicate threads.

# Search Indexing

Three layers, all automatic:

- **Full-text (FTS5)** — keyword search with BM25 ranking. `chunks_fts` virtual table, auto-synced via SQL triggers on chunk insert/update/delete.
- **Vector embeddings** — semantic search by meaning. OpenAI `text-embedding-3-small`, stored as F32_BLOB(1536) on both nodes and chunks. Queried via `vector_top_k()` with cosine similarity.
- **B-tree indexes** — fast filtering by date, type, and connections.

## Hybrid Search (Default)

Vector + FTS results run in parallel, merged via **Reciprocal Rank Fusion (RRF)**:

1. Run vector search + FTS5 in parallel (each returns `matchCount × 2` candidates)
2. Score each result: `1 / (60 + rank)`
3. Sum scores for chunks appearing in both lists
4. Sort by combined score, normalize to 0–1, return top K

Default: `matchCount = 5`, `similarityThreshold = 0.3`.

## Fallback Chain

If a search tier fails or returns empty, the system degrades gracefully:

```
hybrid (vector + FTS)  →  vector-only  →  FTS-only  →  LIKE (last resort)
```

## Chunking

- **Size:** ~2,000 characters per chunk
- **Overlap:** 400 characters
- **Boundary detection:** paragraph break (`\n\n`) → sentence end (`. `) → hard cut (in priority order, only used after 50% of chunk size)

# Extractors

| Extractor | Technology | Notes |
|-----------|-----------|-------|
| YouTube | `youtube-transcript-plus` (innertube API) | Falls back to article scrape if transcript unavailable |
| Website | Cheerio + readability heuristics | Strips nav/footer, extracts main content |
| PDF | `pdf-parse` (local) / direct fetch (arXiv) | Handles multi-page documents |

# Quick Add (Web UI)

Paste any URL or text into the sidebar Quick Add input:

| Input | Detection | What happens |
|-------|-----------|-------------|
| YouTube URL | `youtube.com` / `youtu.be` | Transcript extracted → node + chunks + embed |
| Website URL | Any other URL | Cheerio scrape → content extraction → node + embed |
| PDF / arXiv | `.pdf` or `arxiv.org` | PDF parse → text extraction → node + embed |
| Chat transcript | Timestamps, "You said:", etc. | Summarized → note node created |
| Plain text | Everything else | Note node created directly |
