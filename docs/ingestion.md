# Ingestion, Enrichment & Content Sources

## Content Sources

Four feeds, polled hourly by Vercel cron.

| Source | Feed | Node Type | Detection |
|--------|------|-----------|-----------|
| Latent Space Podcast | YouTube RSS (Atom) | `podcast` | New `<entry>` not in DB |
| LatentSpaceTV | YouTube RSS (Atom) | `workshop` / `builders-club` / `paper-club` | Series detection by title keywords |
| latent.space Substack | RSS | `article` | New `<item>` not in DB |
| AINews (smol.ai) | Substack RSS | `ainews` | Title starts with `[ainews]` |

## Hourly Cron

Two endpoints run on Vercel, staggered by 30 minutes.

| Endpoint | Schedule | What it does |
|----------|----------|-------------|
| `GET /api/cron/ingest` | Every hour at `:00` | Polls all 4 RSS feeds, discovers new items, extracts text, creates nodes, embeds, notifies Discord |
| `GET /api/cron/extract-entities` | Every hour at `:30` | Finds content nodes with chunks but no edges, runs Claude Haiku entity extraction, creates entity nodes + edges |

Both require `Authorization: Bearer $CRON_SECRET`.

### Concurrency Guard

The ingestion cron checks for an active run within the last 30 minutes. If one exists, it skips. This prevents overlapping runs from Vercel's retry behavior.

## Per-Item Pipeline

```
1. Discover     RSS/GitHub check → find items not already in DB (dedup by link URL)
2. Extract      YouTube transcript (youtube-transcript-plus) or article text (Cheerio scraper)
3. Create node  title, link, event_date, node_type, dimensions, metadata, raw text as chunk
4. Embed        Node-level: title+description → OpenAI text-embedding-3-small (1536d)
                Chunk-level: split ~2000 chars / 400 overlap → batch embed 20 at a time
5. Companion    Detect podcast↔article pairs by title word overlap (threshold 0.5)
                Creates companion_article or companion_episode edges
6. Notify       Post to Discord #announcements + trigger Slop discussion
7. Log          Record in ingestion_runs table (status, items found/ingested/skipped/failed)
```

## Entity Extraction

Runs on the `:30` cron. Finds content nodes created in the last 7 days that have chunks but zero edges.

For each node:
1. Send chunk text to Claude Haiku with extraction prompt
2. Extract structured entities: people, organizations, topics
3. For each entity: search existing nodes → match or create new `guest`/`entity` node
4. Create typed edges: `features`, `covers_topic`, `affiliated_with`, `appeared_on`
5. For AINews: also uses frontmatter entities when available

Processes up to 5 items per run (configurable via `?limit=` query param).

## Companion Detection

When a new podcast or article is ingested, the pipeline checks for a matching companion — same topic, published within a few days. Matching uses title word overlap scoring:

- Tokenize both titles, remove stopwords
- Calculate Jaccard-style overlap score
- Threshold: 0.5

If a companion is found:
- Creates a `companion_article` or `companion_episode` edge
- Companion items skip the Slop yap kickoff (avoids duplicate discussions)

## Discord Notifications

Each newly ingested item triggers up to two Discord messages:

### 1. #announcements (webhook)

Clean announcement with emoji header, title, date, chunk count, and source URL. Always fires.

### 2. Slop discussion kickoff

Two modes:

| Mode | Trigger | What happens |
|------|---------|-------------|
| **Webhook** | `DISCORD_YAP_WEBHOOK_URL` set | Posts to #yap with @Slop mention and prompt |
| **Bot API** (preferred) | `DISCORD_BOT_KICKOFF_URL` set | Calls bot's internal `/internal/kickoff` endpoint → Slop creates a thread and generates a graph-backed take |

The bot API mode gives more control — Slop searches the KB with its own tools and produces a richer opening post.

Companion items skip the discussion kickoff to avoid duplicate threads.

## Quick Add (Web UI)

Paste any URL or text into the sidebar Quick Add input:

| Input | Detection | Pipeline |
|-------|-----------|----------|
| YouTube URL | `youtube.com` or `youtu.be` in URL | Transcript extraction → node + chunks + embed |
| Website URL | Any other URL | Cheerio scrape → content extraction → node + embed |
| PDF / arXiv | `.pdf` extension or `arxiv.org` | PDF parse → text extraction → node + embed |
| Chat transcript | Contains timestamps, "You said:", etc. | Summarize → create note node |
| Plain text | Everything else | Create note node directly |

All paths end with: auto-dimension tagging, auto-edge creation to related entities, and chunk embedding.

## Extractors

| Extractor | Technology | Notes |
|-----------|-----------|-------|
| YouTube | `youtube-transcript-plus` (innertube API) | Falls back to Substack article scrape if transcript unavailable |
| Website | Cheerio + readability heuristics | Strips nav/footer, extracts main content |
| PDF | `pdf-parse` (local) / direct fetch (arXiv) | Handles multi-page documents |

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `TURSO_DATABASE_URL` | Yes | Database connection |
| `TURSO_AUTH_TOKEN` | Yes | Database auth |
| `OPENAI_API_KEY` | Yes | Embedding generation |
| `ANTHROPIC_API_KEY` | Yes | Entity extraction (Claude Haiku) |
| `CRON_SECRET` | Yes | Auth for cron endpoints |
| `DISCORD_ANNOUNCEMENTS_WEBHOOK_URL` | No | #announcements webhook |
| `DISCORD_YAP_WEBHOOK_URL` | No | #yap webhook (fallback mode) |
| `DISCORD_SLOP_USER_ID` | No | Slop's Discord user ID for @mentions |
| `DISCORD_BOT_KICKOFF_URL` | No | Bot kickoff API endpoint (preferred mode) |
| `DISCORD_BOT_KICKOFF_SECRET` | No | Shared secret for kickoff auth |
