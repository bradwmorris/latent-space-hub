# Content Ingestion

How content gets into the Latent Space Hub knowledge graph.

## Sources

| Source | Content Type | Method | Category |
|--------|-------------|--------|----------|
| Latent Space Podcast | YouTube videos | RSS + transcript extraction | `podcast` |
| latent.space Substack | Blog posts | RSS + article scraping | `article` |
| AINews (smol.ai) | GitHub markdown | GitHub API + markdown parsing | `ainews` |
| LatentSpaceTV | YouTube videos | RSS + transcript extraction | `builders-club`, `paper-club`, `workshop` |

## Pipeline (Per Item)

```
1. Discover    RSS check / GitHub API → find new content
2. Extract     Transcript / article text / markdown
3. Create      Node with title, link, event_date, dimensions, category
4. Chunk       Split text (~2000 chars, 400 overlap)
5. Embed       text-embedding-3-small → 1536d vectors
6. Connect     Entity extraction (Claude) → person/org/topic nodes + edges
7. Log         Record in ingestion_runs table
```

## Manual Ingestion (Current)

### Unified Script

```bash
npx tsx scripts/ingest.ts
```

This replaced the three legacy scripts (`bulk-ingest-ainews.js`, `bulk-ingest-podcasts.js`, `bulk-ingest-aie.js`).

### Manifest Files

Content is defined in manifest JSON files under `scripts/data/`:

| File | Content |
|------|---------|
| `scripts/data/ls-podcasts-backfill.json` | Podcast episodes: `{ id, title, guest, company, month }` |
| `scripts/data/ls-ainews-backfill.json` | AINews issues: `{ slug, title, date, substack_url }` |
| `scripts/data/aie-videos.json` | AI Engineer videos: `{ id, title, speaker, company, event }` |

### Daily Process

1. **Check for new content** — RSS feeds, YouTube channels, GitHub
2. **Update manifest files** — Add new items to the relevant JSON
3. **Dry run** — Verify titles, summaries, dedup detection
4. **Run ingestion** — Write to Turso
5. **Verify** — Search the hub for new items

### Dedup

Scripts are idempotent — items already in the database are skipped. Dedup uses canonical link + source-specific IDs.

## Quick Add (Web UI)

Paste any URL or text into the Quick Add input in the sidebar:

| Input Type | Detection | What happens |
|-----------|-----------|-------------|
| YouTube URL | URL contains `youtube.com` or `youtu.be` | Transcript extracted, node created |
| Website URL | Any other URL | Page scraped with Cheerio, content extracted |
| PDF / arXiv | URL ends in `.pdf` or contains `arxiv.org` | Paper text extracted |
| Chat transcript | Contains timestamps, "You said:", etc. | Summarized, node created with key points |
| Plain text | Everything else | Created as a note node |

After extraction, every input type follows the same path:
1. Node created with auto-detected dimensions
2. Auto-edge creates connections to related entities
3. Auto-embed queue chunks and embeds the content

## Auto-Ingestion (Upcoming — PRD-13)

Automated hourly ingestion with zero manual intervention:

- **Vercel cron** (hourly) → `GET /api/cron/ingest`
- Per-source RSS polling
- Discord webhook announces new content to `#yap` channel
- Sig bot responds with analysis, Slop responds with hot take

## Extractors

| Extractor | File | Technology |
|-----------|------|-----------|
| YouTube | `src/services/typescript/extractors/youtube.ts` | `youtube-transcript-plus` (innertube) |
| Website | `src/services/typescript/extractors/website.ts` | Cheerio + readability |
| PDF | `src/services/typescript/extractors/paper.ts` | `pdf-parse` (local), direct fetch (arXiv) |

## Prerequisites

| Variable | Required for |
|----------|-------------|
| `TURSO_DATABASE_URL` | All ingestion |
| `TURSO_AUTH_TOKEN` | All ingestion |
| `OPENAI_API_KEY` | Embedding generation |
| `ANTHROPIC_API_KEY` | Entity extraction |
