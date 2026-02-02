# Latent Space Hub — Latest Intake Checklist

**Snapshot date:** January 31, 2026 (US)

This document lists the most recently published items from the requested sources and provides a checklist to confirm what is missing from the hub database.

## Sources Checked

1) Latent Space Podcast page: https://www.latent.space/podcast
2) Latent Space Archive (sorted new): https://www.latent.space/archive?sort=new
3) YouTube playlist: https://www.youtube.com/playlist?list=PLWEAb1SXhjlfkEF_PxzYHonU_v5LPMI8L
4) X account: https://x.com/latentspacepod

**Access notes:**
- YouTube playlist feed could not be fetched via tooling (dynamic / feed blocked). Manual check required.
- X (twitter) is blocked from this environment. Manual check required.

## Most Recent Items — Podcast Page

From https://www.latent.space/podcast:

- 2026-01-08 — "Artificial Analysis: Independent LLM Evals as a Service — with George Cameron and Micah-Hill Smith" (Podcast) — https://www.latent.space/p/artificialanalysis
- 2025-04-11 — "SF Compute: Commoditizing Compute to solve the GPU Bubble forever" (Podcast) — https://www.latent.space/p/sfcompute
- 2025-04-03 — "The Creators of Model Context Protocol" (Podcast) — https://www.latent.space/p/mcp
- 2025-03-29 — "Unsupervised Learning x Latent Space Crossover Special" (Podcast) — https://www.latent.space/p/unsupervised-learning
- 2025-03-28 — "The Agent Network — Dharmesh Shah" (Podcast) — https://www.latent.space/p/dharmesh
- 2025-03-14 — "Building Snipd: The AI Podcast App for Learning" (Podcast) — https://www.latent.space/p/snipd
- 2025-03-11 — "⚡️The new OpenAI Agents Platform" (Podcast) — https://www.latent.space/p/openai-agents-platform
- 2025-03-04 — "⚡️How Claude 3.7 Plays Pokémon" (Podcast) — https://www.latent.space/p/how-claude-plays-pokemon-was-made

## Most Recent Items — Archive (Sorted New)

From https://www.latent.space/archive?sort=new:

- 2025-05-07 — "Claude Code: Anthropic's Agent in Your Terminal" — https://www.latent.space/p/claude-code
- 2025-04-28 — "Please stop forcing Clippy on those who want Anton" — https://www.latent.space/p/clippy-v-anton
- 2025-04-24 — "Why Every Agent needs Open Source Cloud Sandboxes" — https://www.latent.space/p/e2b
- 2025-04-21 — "AI Agents, meet Test Driven Development" — https://www.latent.space/p/anita-tdd
- 2025-04-20 — "In the Matter of OpenAI vs LangGraph" — https://www.latent.space/p/oai-v-langgraph
- 2025-04-15 — "⚡️GPT 4.1: The New OpenAI Workhorse" — https://www.latent.space/p/quasar
- 2025-04-11 — "SF Compute: Commoditizing Compute to solve the GPU Bubble forever" — https://www.latent.space/p/sfcompute
- 2025-04-03 — "The Creators of Model Context Protocol" — https://www.latent.space/p/mcp
- 2025-03-29 — "Unsupervised Learning x Latent Space Crossover Special" — https://www.latent.space/p/unsupervised-learning
- 2025-03-28 — "The Agent Network — Dharmesh Shah" — https://www.latent.space/p/dharmesh

## Manual Checks Required

### YouTube playlist (latest videos)
- Open the playlist URL and list the newest 5–10 videos by date.
- Compare video IDs against the hub DB or manifests.

### X (latentspacepod)
- Check the latest 10–20 posts for announcements of new episodes or newsletters.
- Add any new links to the intake list above.

## Database Gap Check (How to Confirm Missing Items)

Use MCP or DB queries to check if each item exists.

### Option A — MCP (read-only)
Example searches (use exact title):
- ls_search_nodes: "Artificial Analysis: Independent LLM Evals as a Service"
- ls_search_nodes: "Claude Code: Anthropic's Agent in Your Terminal"
- ls_search_nodes: "GPT 4.1: The New OpenAI Workhorse"

If no results return, the item is missing.

### Option B — SQL (Turso)
Query by link:

```sql
SELECT id, title, link, created_at
FROM nodes
WHERE link LIKE '%/p/artificialanalysis%'
   OR link LIKE '%/p/claude-code%'
   OR link LIKE '%/p/quasar%';
```

## Known Likely Gaps (Based on Repo Manifests)

These items are **not present** in the existing ingestion manifest files (`scripts/data/ls-podcasts-backfill.json`, `scripts/data/ls-ainews-backfill.json`, `scripts/data/aie-videos.json`) and are **likely missing** in the DB unless added manually:

- "Artificial Analysis: Independent LLM Evals as a Service" (2026-01-08)
- "Claude Code: Anthropic's Agent in Your Terminal" (2025-05-07)
- "Please stop forcing Clippy on those who want Anton" (2025-04-28)
- "Why Every Agent needs Open Source Cloud Sandboxes" (2025-04-24)
- "AI Agents, meet Test Driven Development" (2025-04-21)
- "In the Matter of OpenAI vs LangGraph" (2025-04-20)
- "⚡️GPT 4.1: The New OpenAI Workhorse" (2025-04-15)
- "SF Compute: Commoditizing Compute to solve the GPU Bubble forever" (2025-04-11)
- "The Creators of Model Context Protocol" (2025-04-03)
- "Unsupervised Learning x Latent Space Crossover Special" (2025-03-29)
- "The Agent Network — Dharmesh Shah" (2025-03-28)
- "Building Snipd: The AI Podcast App for Learning" (2025-03-14)
- "⚡️The new OpenAI Agents Platform" (2025-03-11)
- "⚡️How Claude 3.7 Plays Pokémon" (2025-03-04)

If you want, I can run the DB checks directly once you confirm access to Turso or provide an MCP endpoint for querying.
