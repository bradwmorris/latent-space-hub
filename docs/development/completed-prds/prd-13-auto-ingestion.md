# PRD 13: Auto-Ingestion Pipeline

## Background

The Latent Space Hub has a solid content ingestion pipeline (PRD-05) that backfilled ~570 content nodes, 36K chunks, and 7K edges from four sources. But that pipeline is **manual** — you run CLI scripts locally to generate manifests and ingest. The graph goes stale the moment you stop running them.

Latent Space publishes new content regularly:
- **Podcast episodes** — 2-3/week on `@LatentSpacePod`
- **Articles** — 1-2/week on `latent.space` Substack
- **AI News** — daily digests on `smol-ai/ainews-web-2025` GitHub
- **LatentSpaceTV** — occasional meetups/paper clubs on `@LatentSpaceTV`

This PRD builds an **automated pipeline** that checks for new content every hour, ingests it into the graph, and **triggers the Discord bots (Sig & Slop) to discuss it** in real-time. No manual intervention. The graph stays current and the community gets instant engagement on new content.

---

## Goals

1. **Every new piece of Latent Space content enters the graph within ~1 hour of publishing** — fully ingested, chunked, embedded, and entity-extracted
2. **Zero manual work** — the pipeline runs on Vercel cron, checks RSS/APIs, and processes anything new
3. **Visibility** — Discord webhook + in-app ingestion log so you always know what was added
4. **Bot engagement** — when new content drops, Sig & Slop automatically start discussing it in `#yap`, creating threads the community can jump into
5. **Reliability** — idempotent, deduped, with error logging and retry logic
6. **Reuse** — leverage the existing extractors (`youtube-transcript-plus`, `website.ts`) and pipeline logic (`ingest.ts`) rather than rebuilding

---

## Architecture

### Overview

```
Vercel Cron (hourly)
  → GET /api/cron/ingest
    → Check RSS feeds for all 4 sources
    → For each new item:
      1. Dedup check (link URL against nodes table)
      2. Extract content (transcript / article / markdown)
      3. Create node + dimensions
      4. Chunk + embed (OpenAI text-embedding-3-small)
      5. Entity extraction + edge creation (Claude)
    → Log results to ingestion_runs table
    → Post to #yap channel: announcement mentioning @Sig
    → Sig responds with analysis (already handles mentions)
    → Slop auto-responds to Sig (configured for #yap)
    → Thread created — community can engage
```

### Why Vercel Cron

- Everything lives in the same Next.js codebase — no separate infra
- Deploys with `git push` like everything else
- Hobby plan 60s timeout is sufficient: LS publishes 1-3 items/day, each item takes ~15-20s to fully process
- The existing extractors (`youtube-transcript-plus`, `cheerio`, website scraper) are all pure TypeScript — no binary dependencies needed

### Replacing yt-dlp for Discovery

The backfill used `yt-dlp` (Python binary) to enumerate YouTube channel videos. For ongoing discovery, we replace this with **YouTube RSS feeds** — every channel has a feed at:

```
https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}
```

This is a simple HTTP fetch + XML parse. Pure JS, runs on Vercel. Returns the most recent ~15 videos with titles, dates, and video IDs — exactly what we need for "are there new ones?"

---

## Source Configuration

All sources defined in a single config object. Easy to add new sources later.

```typescript
// src/config/sources.ts

export const SOURCES = {
  podcasts: {
    name: 'Latent Space Podcast',
    type: 'youtube_rss',
    feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQMbwBMmIRCCRDB2AlrO6bA',
    nodeType: 'podcast',
    dimensions: ['podcast'],
    metadata: { series: 'latent-space-podcast' },
  },
  latentspacetv: {
    name: 'LatentSpaceTV',
    type: 'youtube_rss',
    feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id={LATENTSPACETV_CHANNEL_ID}',
    nodeType: 'episode',
    dimensions: ['meetup'],
    // Series detection from title: builders-club, paper-club, meetup
    seriesDetection: true,
    metadata: {},
  },
  articles: {
    name: 'Latent Space Blog',
    type: 'substack_rss',
    feedUrl: 'https://www.latent.space/feed',
    nodeType: 'article',
    dimensions: ['article'],
    metadata: { source_type: 'blog' },
  },
  ainews: {
    name: 'AI News',
    type: 'github_rss',
    feedUrl: 'https://github.com/smol-ai/ainews-web-2025/commits/main.atom',
    // Alternative: GitHub API to list recent files
    apiUrl: 'https://api.github.com/repos/smol-ai/ainews-web-2025/contents/src/content/issues',
    nodeType: 'ainews',
    dimensions: ['ainews'],
    metadata: { source_type: 'newsletter' },
  },
} as const;
```

> **Note:** YouTube channel IDs need to be confirmed. The podcast channel ID above is a placeholder — look it up from the existing manifest data or the channel page.

---

## Discovery: How Each Source Detects New Content

### YouTube (Podcasts + LatentSpaceTV)

**Method:** Fetch YouTube RSS feed → parse XML → extract video entries

```
GET https://www.youtube.com/feeds/videos.xml?channel_id={ID}
```

Returns Atom XML with recent videos. Parse out:
- `<yt:videoId>` → video ID
- `<title>` → title
- `<published>` → publish date
- `<link>` → canonical URL

**Dedup:** Check `nodes.link` for `https://www.youtube.com/watch?v={videoId}`

### Substack Articles

**Method:** Fetch Substack RSS feed → parse XML → extract article entries

```
GET https://www.latent.space/feed
```

Returns RSS 2.0 with recent posts. Parse out:
- `<link>` → article URL
- `<title>` → title
- `<pubDate>` → publish date
- `<description>` → excerpt

**Dedup:** Check `nodes.link` for the article URL

### AI News (GitHub)

**Method:** Fetch GitHub commits atom feed OR use GitHub API to list recent files

Option A — Commits feed:
```
GET https://github.com/smol-ai/ainews-web-2025/commits/main.atom
```

Option B — GitHub Contents API (preferred, more precise):
```
GET https://api.github.com/repos/smol-ai/ainews-web-2025/contents/src/content/issues
```

List files, sort by name (date-slug format), compare against what's already ingested.

**Dedup:** Check `nodes.link` or `nodes.title` against existing AINews nodes

---

## Processing Pipeline Per Item

Once a new item is discovered, the full pipeline runs:

### Step 1: Extract Content

| Source | Extractor | Output |
|--------|-----------|--------|
| YouTube (podcast/TV) | `youtube-transcript-plus` → `extractYouTube()` | Full transcript as `chunk` |
| Article (Substack) | `cheerio` → `extractWebsite()` | Article body as `chunk` |
| AINews (GitHub) | Fetch raw markdown from GitHub | Markdown body as `chunk` |

### Step 2: Create Node

Insert into `nodes` table with:
- `title`, `node_type`, `link` (canonical URL)
- `chunk` (full source text), `chunk_status = 'not_chunked'`
- `event_date` (publish date, ISO 8601)
- `metadata` JSON with source-specific fields + `extraction_method: 'auto-ingestion-v1'`
- `description` — generate from title + first ~500 chars of chunk

Assign dimensions via `node_dimensions`.

### Step 3: Chunk + Embed

Reuse the existing chunking logic from `ingest.ts`:
- Split `chunk` into ~2000-char segments with ~400-char overlap
- Batch embed via OpenAI `text-embedding-3-small`
- Insert into `chunks` table with embeddings
- Generate node-level embedding from `title + description`
- Update `chunk_status = 'chunked'`

### Step 4: Entity Extraction + Edges

Reuse logic from `extract-entities.ts`:
- For YouTube: extract persons, organizations, topics from title + description + chunk sample via Claude
- For AINews: parse frontmatter entities (companies, models, topics, people) if available
- For Articles: extract via Claude
- Create entity nodes (deduped by title + node_type)
- Create typed edges (`appeared_on`, `covers_topic`, `mentioned_in`, etc.)

---

## API Route

### `GET /api/cron/ingest`

The main cron endpoint. Vercel calls this every hour.

```typescript
// app/api/cron/ingest/route.ts

export const runtime = 'nodejs';
export const maxDuration = 60; // seconds (hobby plan max)

export async function GET(request: Request) {
  // 1. Verify cron authorization
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Check all sources for new items
  // 3. Process each new item through the pipeline
  // 4. Log results
  // 5. Send Discord webhook if anything was added
  // 6. Return summary
}
```

**Security:** Vercel cron jobs send a `CRON_SECRET` in the Authorization header. The route verifies this to prevent unauthorized triggers.

### `GET /api/cron/ingest?source=podcasts`

Optional: trigger a specific source only (useful for testing or manual re-runs).

### `POST /api/cron/ingest/trigger`

Manual trigger endpoint (admin only) for testing or forcing a re-check.

---

## Vercel Configuration

```jsonc
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "0 * * * *"   // Every hour, on the hour
    }
  ]
}
```

**Environment variables to add:**
- `CRON_SECRET` — random string for cron auth (Vercel auto-generates this)
- Existing: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- New: `DISCORD_WEBHOOK_URL` — for ingestion notifications

---

## Ingestion Log

### Database Table

```sql
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed
  source TEXT,                              -- 'all', 'podcasts', 'articles', etc.
  items_found INTEGER DEFAULT 0,
  items_ingested INTEGER DEFAULT 0,
  items_skipped INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  details TEXT,                             -- JSON: per-item results
  error TEXT,                               -- error message if failed
  duration_ms INTEGER
);
```

Every cron run creates a row. This powers both the Discord notification and the in-app log.

### Extraction Failure Cooldown Table

```sql
CREATE TABLE IF NOT EXISTS ingestion_failures (
  url TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT,
  failure_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  first_failed_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_failed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Prevents the cron from retrying the same broken URL every hour (e.g. a YouTube video with no captions yet). Cooldown escalates: 6h after 1 failure, 24h after 2, 72h after 3+. Cleared automatically when the URL is eventually ingested successfully.

### In-App Dashboard

Add an "Ingestion" section to the dashboard (or a dedicated `/admin/ingestion` page):
- Last run time + status
- Items ingested in last 24h / 7d / 30d
- Recent runs table with expand for details
- Source health: last successful ingest per source, any failures

### Discord: #yap Channel — Bot Engagement on New Content

The `#yap` channel in the test Discord server is where Sig & Slop discuss new content as it drops. The flow uses a **Discord webhook + existing bot mention handling** — no bot code changes required for the basic flow.

#### How It Works

1. **Auto-ingestion completes** — new podcast/article/ainews is in the graph
2. **Hub posts a webhook message to `#yap`** with a formatted announcement that **mentions Sig** (`<@SIG_BOT_USER_ID>`)
3. **Sig sees the mention** — the bot already responds to mentions in allowed channels. It queries the KB (the content was just ingested), writes an analysis/summary
4. **Slop auto-responds to Sig** — Slop is configured to watch `#yap` and respond when Sig posts (small config addition to the bot)
5. **Thread is created** — the bots' exchange lives in a thread. Community members can jump in

#### Webhook Message Format

Each new item gets its own webhook message (not batched), so each one spawns its own thread:

**For a new podcast:**
```
🎙️ New Podcast Episode

**The Future of AI Agents** — with Harrison Chase & Sam Altman
Published: 2026-02-22 | 45 chunks indexed

<@SIG_BOT_USER_ID> what's the signal here?
```

**For a new article:**
```
📝 New Article

**Why RAG Is Dead (And What Replaces It)**
Published: 2026-02-22 | 28 chunks indexed

<@SIG_BOT_USER_ID> break this down for us
```

**For a new AINews digest:**
```
📰 AI News Daily

**2026-02-22 — GPT-5 Launch Day**
Published: 2026-02-22 | 23 chunks indexed

<@SIG_BOT_USER_ID> what's the signal in today's noise?
```

#### Why This Works Without Bot Code Changes

The bots already:
- Respond to mentions in allowed channels
- Query the knowledge base for context
- Create threads for conversations
- Have distinct personalities (Sig = analytical, Slop = hot takes)

The only bot-side change needed is:
- **Add `#yap` channel ID to `ALLOWED_CHANNEL_IDS`** env var in the bot
- **Add Slop auto-respond config** — when Sig posts in `#yap`, Slop replies. This is a small addition to the bot's `MessageCreate` handler: if the message author is Sig and the channel is `#yap`, Slop responds after a short delay (~5-10s)

#### Webhook Configuration

The webhook is a standard **Discord channel webhook** (not a bot):
- Created via Discord: Server Settings → Integrations → Webhooks → New Webhook → assign to `#yap`
- Returns a webhook URL: `https://discord.com/api/webhooks/{id}/{token}`
- Store as `DISCORD_YAP_WEBHOOK_URL` env var in Vercel

The webhook message includes the Sig mention, but the webhook itself posts as a neutral "Latent Space Hub" identity (custom name + avatar configurable in the webhook settings).

#### Silent When Nothing New

If the cron run finds no new content, nothing is posted. No spam.

---

## Shared Pipeline Module

The current pipeline logic lives in `scripts/ingest.ts` — a CLI script that imports `@libsql/client` directly. For the cron route, we need the same logic available as importable functions within the Next.js app.

### Refactor Plan

Extract the core pipeline logic into a shared service:

```
src/services/ingestion/
  index.ts           — public API: checkAndIngest(), ingestItem()
  discovery.ts       — RSS/API fetching + XML parsing for each source
  processing.ts      — extract content, create node, chunk, embed, extract entities
  sources.ts         — source configuration (feeds, node types, dimensions)
  log.ts             — ingestion_log table operations
  notify.ts          — Discord #yap webhook: per-item announcements with Sig mention
```

This service uses the existing Next.js database services (`@/services/database/*`) and extractors (`@/services/typescript/extractors/*`).

The CLI script (`scripts/ingest.ts`) can optionally be updated to import from this shared module too, but that's not required — the CLI script still works for manual bulk operations.

---

## Implementation Phases

### Phase 1: Foundation (core pipeline)

1. Create `src/services/ingestion/sources.ts` — source config with RSS feed URLs
2. Create `src/services/ingestion/discovery.ts` — RSS fetcher + XML parser for YouTube, Substack, GitHub
3. Create `src/services/ingestion/processing.ts` — per-item pipeline (extract → node → chunk → embed → entities)
4. Create `src/services/ingestion/log.ts` — ingestion_runs table + CRUD
5. Create `app/api/cron/ingest/route.ts` — cron endpoint with auth
6. Create `vercel.json` with hourly cron schedule
7. Add `CRON_SECRET` env var to Vercel
8. Test locally with manual trigger

### Phase 2: #yap Bot Engagement

9. Create Discord webhook for `#yap` channel in test server
10. Create `src/services/ingestion/notify.ts` — format per-content-type messages, POST to webhook with Sig mention
11. Add `DISCORD_YAP_WEBHOOK_URL` + `DISCORD_SIG_USER_ID` env vars to Vercel
12. Add `#yap` channel ID to bot's `ALLOWED_CHANNEL_IDS` (in `latent-space-bots` repo)
13. Add Slop auto-respond behavior: when Sig posts in `#yap`, Slop replies after ~5-10s delay (small change in `latent-space-bots/src/index.ts`)
14. Test end-to-end: new item appears → ingested → webhook posts to #yap → Sig responds → Slop responds → thread created

### Phase 3: Dashboard

15. Add ingestion log API route: `GET /api/admin/ingestion-log`
16. Add ingestion status to dashboard or dedicated admin page
17. Show: last run, recent items, source health, failure alerts

### Phase 4: Hardening

18. Add retry logic for transient failures (network timeouts, rate limits)
19. Add per-source error tracking (if a source fails 3x in a row, alert)
20. Add manual trigger UI button (admin only)
21. Add `--since` override for cron (only check items from last 24h to bound the work)

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| RSS feed is down | Log warning, skip source, try again next hour |
| YouTube transcript unavailable | Try 4 fallbacks (youtube-transcript-plus → npm → innertube → timedtext), then Substack article fallback. If all fail, record in `ingestion_failures` with exponential cooldown (6h → 24h → 72h) |
| Substack article is paywalled | Check extracted content length, skip if < 100 chars, log as skipped |
| OpenAI rate limit | Retry with exponential backoff (1s, 2s, 4s), fail after 3 attempts |
| Claude rate limit (entity extraction) | Queue for next run, node is still usable without entities |
| Duplicate detected | Skip silently (idempotent) |
| Cron runs overlap | Check `ingestion_runs` for `status = 'running'`, skip if another run is active. Stuck runs older than 30 minutes are auto-cleared as failed |
| GitHub API rate limit (AINews) | Use unauthenticated limit (60/hr), fall back to commits feed |
| Total runtime approaching 55s | Stop processing, log partial results, pick up remaining next hour |
| Repeated extraction failure | `ingestion_failures` table tracks per-URL failures with escalating cooldowns: 1st fail = 6h, 2nd = 24h, 3+ = 72h. Cleared on successful ingestion |

---

## AINews: Special Handling

AINews is the trickiest source because the current pipeline clones the entire GitHub repo. That won't work in a serverless function. Instead:

**Option A (Preferred):** Use GitHub Contents API to list files in `src/content/issues/`, identify new ones by slug, then fetch each new file's raw content individually via:
```
GET https://raw.githubusercontent.com/smol-ai/ainews-web-2025/main/src/content/issues/{slug}.md
```

**Option B:** Use the GitHub commits feed to detect new commits that add issue files, then fetch the raw content.

Both avoid cloning the repo. Option A is simpler and more reliable.

The frontmatter parsing (extracting companies, models, topics, people) happens on the fetched markdown content, same as the current pipeline.

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `CRON_SECRET` | Auth for cron endpoint | Yes (Vercel auto-generates) |
| `DISCORD_YAP_WEBHOOK_URL` | Webhook URL for `#yap` channel | Yes (Phase 2) |
| `DISCORD_SIG_USER_ID` | Sig's Discord user ID, for `<@id>` mentions | Yes (Phase 2) |
| `TURSO_DATABASE_URL` | Database connection | Existing |
| `TURSO_AUTH_TOKEN` | Database auth | Existing |
| `OPENAI_API_KEY` | Embeddings | Existing |
| `ANTHROPIC_API_KEY` | Entity extraction | Existing |

**Bot-side env changes** (in `latent-space-bots` repo):
| Variable | Change |
|----------|--------|
| `ALLOWED_CHANNEL_IDS` | Add `#yap` channel ID to the comma-separated list |

---

## Testing Strategy

1. **Local manual trigger:** `curl http://localhost:3000/api/cron/ingest` with proper auth header
2. **Dry-run mode:** Add `?dry_run=true` query param to check RSS without ingesting
3. **Single-source test:** `?source=podcasts` to test one source at a time
4. **Verify dedup:** Run twice, confirm second run finds 0 new items
5. **Verify in UI:** New nodes appear in dashboard with correct types and dimensions
6. **Verify Discord:** Webhook posts the correct summary
7. **Verify chunks:** New nodes have chunks with embeddings, search returns them

---

## Success Criteria

- [ ] Cron runs every hour on Vercel without manual intervention
- [ ] New podcast episode appears in graph within ~1 hour of YouTube publish
- [ ] New Substack article appears within ~1 hour
- [ ] New AINews digest appears within ~1 hour
- [ ] New LatentSpaceTV video appears within ~1 hour
- [ ] Each ingested item has: node + dimensions + chunks + embeddings + entity edges
- [ ] New content posts to `#yap` with Sig mention
- [ ] Sig responds with analysis grounded in the just-ingested content
- [ ] Slop auto-responds to Sig with a counter-take
- [ ] Exchange lives in a thread that community can join
- [ ] Ingestion log shows run history in dashboard
- [ ] No duplicate nodes created on repeated runs
- [ ] Pipeline completes within 60s even with 3-4 new items
- [ ] Failures are logged and don't block other sources

---

## Dependencies

- **Completed:** PRD-05 Content Ingestion (extractors, pipeline logic, schema)
- **Completed:** PRD-04 Vector Search (embedding storage, vector indexing)
- **Soft dependency:** PRD-12 Dashboard (ingestion log UI lives alongside dashboard stats)
- **No dependency on:** PRD-10 Data Refinement (auto-ingestion creates clean data from the start)

---

## Bot-Side Changes (latent-space-bots repo)

This PRD is primarily a hub-side feature, but two small changes are needed in the bot repo:

### 1. Add #yap to allowed channels

Add the `#yap` channel ID to `ALLOWED_CHANNEL_IDS` in the bot's Railway env. Sig already responds to mentions in allowed channels — this just adds the new channel.

### 2. Slop auto-respond to Sig in #yap

Add a check in the `MessageCreate` handler in `src/index.ts`:

```typescript
// In Slop's message handler:
if (message.author.id === SIG_BOT_USER_ID && message.channel.id === YAP_CHANNEL_ID) {
  // Wait 5-10 seconds for natural pacing
  await sleep(5000 + Math.random() * 5000);
  // Slop responds to Sig's message (treated like a mention)
  await handleSlopResponse(message);
}
```

This is ~10 lines of code. Slop already has all the infrastructure to respond — this just adds the trigger condition for auto-engagement in `#yap`.

---

## Out of Scope

- **Backfilling historical gaps** — use existing CLI scripts for that
- **New source types** (Twitter/X, Discord, Reddit) — future PRDs
- **Content summarization** — the pipeline stores raw content; summaries are a separate concern
- **User-submitted content** — different workflow, different PRD
- **Real-time webhooks from YouTube/Substack** — not available to regular users; RSS polling is the right approach
- **Multi-round bot debates** — Sig responds once, Slop responds once. Extended debates are a future feature (the `/debate` command already handles that)

---

## COMPLETED
**Date:** 2026-02-21
**What was delivered:** Hub-side foundation for auto-ingestion is implemented in this repo. Added shared ingestion services for source config/discovery/processing/logging/Discord notify, new cron endpoints (`GET /api/cron/ingest`, `POST /api/cron/ingest/trigger`) with `CRON_SECRET` auth, `vercel.json` hourly cron schedule, and admin ingestion log API (`GET /api/admin/ingestion-log`) with run history and health windows. Processing now supports YouTube + Substack + AINews discovery, dedupe by link/title, extraction, node creation, chunking/embedding, and entity edge creation.
