# PRD 05: Content Ingestion Pipeline

## Background

Current state: 204 nodes but chunks table is empty (0 rows). Content exists as node-level text but hasn't been chunked or embedded. Need to backfill all LS content and set up auto-ingest for new material.

## Plan

Phase 1: Backfill podcasts + blogs (the core LS content)
Phase 2: Backfill ainews (570+ daily digests)
Phase 3: Auto-ingest pipeline for new content

## Implementation Details

### Phase 1a: Podcasts

- **Source:** Latent Space YouTube channel
- **Current state:** 35 podcast nodes exist, but no chunks/embeddings
- **Work:**
  1. Scope: how many total LS podcast episodes exist?
  2. Update `scripts/bulk-ingest-podcasts.js` to also chunk + embed transcripts
  3. Run backfill on all episodes (not just the 6 in current manifest)
  4. Entity extraction per episode (companies, models, topics, people → nodes + edges)

### Phase 1b: Blog posts

- **Source:** latent.space on Substack
- **Current state:** 10 article nodes exist, but no chunks/embeddings
- **Work:**
  1. Scope: how many total Substack posts?
  2. Scrape all posts (Substack API or web scrape)
  3. Chunk + embed each post
  4. Entity extraction → nodes + edges

### Phase 2: AI News

- **Source:** github.com/smol-ai/ainews-web-2025 (570+ markdown files)
- **Current state:** 31 ainews nodes exist, no chunks
- **Frontmatter already has:** companies, models, topics, people arrays
- **Work:**
  1. Parse all 570+ issues
  2. Chunk body text + embed
  3. Create entity nodes from frontmatter tags
  4. Create edges between entities and issues

### Phase 3: Auto-ingest

- GitHub webhook for new ainews issues
- YouTube RSS or periodic check for new podcast episodes
- Substack RSS for new blog posts
- Each triggers: create node → chunk → embed → extract entities → create edges

### Chunking strategy

- ~500 token chunks with ~100 token overlap
- Natural segment boundaries where possible (section headers, topic changes)
- Each chunk gets embedded via text-embedding-3-small (1536d)
- Cost estimate: ~35K chunks × 900 chars avg = ~$0.62 total

### Depends on

- PRD 02 (schema with chunks table, vector index)
- PRD 04 (vector search working so we can verify embeddings)

## Done =

- All LS podcast transcripts chunked and embedded
- All LS blog posts chunked and embedded
- All 570+ ainews issues chunked and embedded
- Entity nodes created (guests, companies, topics)
- Edges connecting entities to content
- Auto-ingest pipeline running for new content
- Hybrid search returns relevant results across entire corpus
