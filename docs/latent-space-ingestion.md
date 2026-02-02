# Latent Space Hub: Daily Ingestion Process (Last 24 Hours)

This document defines the lightweight, repeatable process for ingesting all new Latent Space content created in the last 24 hours.

## Scope (Last 24 Hours)

Ingest any new items from:
- AI News (Latent Space Substack)
- Latent Space Podcast
- AI Engineer YouTube (talks)

Paper Club / Builders Club are excluded unless new access is granted.

## Prerequisites

- Working local checkout of the hub repo (`latent-space-hub`)
- Environment variables available (local `.env.local` or exported):
  - `TURSO_DATABASE_URL`
  - `TURSO_AUTH_TOKEN`
  - `OPENAI_API_KEY` (required for AI summary generation)

## Data Sources

- AI News RSS: `https://www.latent.space/feed`
- AI News content pages: `https://news.smol.ai/issues/<slug>`
- Latent Space Podcast (YouTube): check Latent Space channel for new uploads
- AI Engineer channel (YouTube): check AI Engineer channel or event playlist

## Daily Process (15-30 minutes)

### 1) Collect new items (last 24 hours)

- AI News: check the RSS feed or Substack for new AI News entries.
- Podcast: check YouTube channel uploads for new Latent Space episodes.
- AIE: check AI Engineer uploads for new talks.

Capture for each item:
- Title
- Date
- YouTube ID or Substack slug
- Guest/Speaker (if available)
- Link

### 2) Update the manifest files

Update the relevant JSON files under `scripts/data/`:

- AI News: `scripts/data/ls-ainews-backfill.json`
  - Add `{ slug, title, date, substack_url }`

- Podcasts: `scripts/data/ls-podcasts-backfill.json`
  - Add `{ id, title, guest, company, month }`

- AIE videos: `scripts/data/aie-videos.json`
  - Add `{ id, title, speaker, company, event }`

### 3) Dry run ingestion (sanity check)

Run dry runs to confirm titles, summaries, and duplicate detection.

```bash
node scripts/bulk-ingest-ainews.js --dry-run
node scripts/bulk-ingest-podcasts.js --dry-run
node scripts/bulk-ingest-aie.js --dry-run
```

Confirm:
- Items are detected as new (not skipped)
- Summaries look clean and relevant
- Titles follow the required format

### 4) Run ingestion (write to Turso)

```bash
node scripts/bulk-ingest-ainews.js
node scripts/bulk-ingest-podcasts.js
node scripts/bulk-ingest-aie.js
```

Notes:
- These scripts skip items already in Turso.
- The AIE script uses `scripts/data/ingested.json` for tracking. Keep this file committed and up to date.

### 5) Verify in the hub

Do a quick check in the UI or via MCP tools:
- Search for a new title or guest
- Confirm node details and dimension tags

## Troubleshooting

- If summaries fail: check `OPENAI_API_KEY` and rerun.
- If writes fail: check `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`.
- If duplicates appear: verify `link` or `slug` in the manifest and re-run.

## Operational Notes

- This is a manual process. If needed later, it can be automated with a daily cron job that pulls from RSS and YouTube feeds.
- The hub is read-only for public users. Ingestion is an admin-only process using Turso credentials.
