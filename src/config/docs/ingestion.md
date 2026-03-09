---
title: Ingestion
description: How content gets into the wiki-base — four sources, hourly cron, AI enrichment, and Discord notifications.
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

Two endpoints on Vercel, staggered.

| Endpoint | Schedule | What it does |
|----------|----------|-------------|
| `GET /api/cron/ingest` | Every hour at `:00` | Polls all 4 RSS feeds, discovers new items, extracts text, creates nodes, embeds, notifies Discord |
| `GET /api/cron/extract-entities` | Every hour at `:30` | Finds content nodes missing entity extraction, runs GPT-4.1-mini extraction, creates entity nodes + edges |

Both require `Authorization: Bearer $CRON_SECRET`. A concurrency guard prevents overlapping runs.

# The Pipeline

When something new is found:

1. **Discover** — RSS check finds items not already in the DB (dedup by link URL)
2. **Extract** — YouTube transcript (`youtube-transcript-plus` with innertube/timedtext fallbacks) or article text (Cheerio scraper, Jina.ai fallback)
3. **Create node** — title, link, event_date, node_type, dimensions, metadata, raw text
4. **Generate description** — GPT-4.1-mini creates a one-sentence summary
5. **Chunk** — split into ~2,000-character pieces with 400-char overlap at smart boundaries (paragraph > sentence > hard cut)
6. **Embed** — OpenAI `text-embedding-3-small` (1536d). Node-level on title + description. Chunk-level in batches of 20.
7. **Companion detection** — match podcast ↔ article pairs by title word overlap (Jaccard threshold 0.5). Creates `companion_article` / `companion_episode` edges.
8. **Event recording linking** — for builders-club/paper-club, finds scheduled event nodes within ±3 days and links recording → event
9. **Notify Discord** — post to #announcements + kick off Slop discussion thread
10. **Log** — record in `ingestion_runs` table

No new content? Nothing happens. Runtime budget: 55 seconds, max 10 items per source per run.

# Entity Extraction

Runs on the `:30` cron. Finds content nodes where `metadata.entity_extraction.status` is null or failed.

For each node:

1. **AINews items** — try frontmatter-based extraction first (companies/topics from metadata)
2. **All others** — send chunk text to GPT-4.1-mini with extraction prompt
3. Extract structured entities: organizations (max 5) and research themes (max 5)
4. For each entity: search existing nodes with fuzzy dedup (Levenshtein distance) → match or create new `guest`/`entity` node
5. Generate entity descriptions via GPT-4.1-mini for new entity nodes
6. Create typed edges: `features`, `covers_topic`, `affiliated_with`
7. Write audit trail to node metadata: status, method, entities found, edges created

Processes up to 15 items per run (60-second budget).

# Discord Notifications

Each newly ingested item triggers:

1. **#announcements** — Clean card with emoji header, title, event date, chunk count, and source link (webhook)
2. **Slop discussion** — the hub calls Slop's internal API (`/internal/kickoff`) to start a graph-backed discussion thread. Falls back to a #yap webhook if the bot API isn't configured.

Companion items skip the discussion kickoff to avoid duplicate threads.

## Webhook vs Bot Kickoff

| Mode | How | When |
|------|-----|------|
| Webhook | Posts to `DISCORD_YAP_WEBHOOK_URL` | Fallback when bot kickoff isn't configured |
| Bot API (preferred) | Calls `DISCORD_BOT_KICKOFF_URL` | Slop gets full agentic tool access to discuss the content |

The bot API mode is preferred because Slop searches the wiki-base with its own tools and produces a richer, more contextual opening post.

# Extractors

| Extractor | Technology | Notes |
|-----------|-----------|-------|
| YouTube | `youtube-transcript-plus` (innertube API) | Falls back to direct innertube, then legacy timedtext API |
| Website | Cheerio + readability heuristics | Falls back to Jina.ai Reader API |
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
