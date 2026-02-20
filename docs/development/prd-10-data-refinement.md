# PRD 10: Data Refinement & Hygiene

## Background

PRD-05 ingested ~523 nodes via the pipeline. The raw content (chunk) is there, but the user-facing fields are garbage:

- **1,736 / 1,874 nodes** have NULL or empty `description`
- **1,670 / 1,874 nodes** have NULL or empty `notes`
- **1,532 nodes** have zero rows in the `chunks` table
- **157 nodes** have NULL `node_type`
- **100 edges** have NULL or undefined `context`
- **2,619 / 2,688 edges** are `ai_similarity` with JSON blob context — no human-readable explanation
- Node types are wrong — `source` and `episode` are too generic, hiding the actual content categories

The database has data but it's not usable. This PRD fixes that.

## Open Question: Graph Structure — Hub Nodes vs Flat Types

Before diving into refinement, we need to decide how the graph should be structured for maximum efficiency — both for SQL queries and for bot retrieval.

### The problem

Right now every node is a flat peer. 182 podcast episodes sit alongside 121 newsletter issues and 755 topic nodes with no structural hierarchy. `node_type` lets us filter (`WHERE node_type = 'podcast'`), but there's no single place in the graph that says "what IS the Latent Space podcast?" The bots have to infer context from individual nodes.

### Option A: Flat types only (current state, cleaned up)

Keep the current flat model. `node_type` is the only grouping mechanism. Bots get grounding context from their system prompts and guides, not from the graph itself.

**Pros:**
- Simplest. No extra nodes to create or maintain.
- `node_type` queries are fast and well-understood.
- Guides (MCP `start-here`, `content-types`) can carry the grounding context instead.

**Cons:**
- Bots can't "discover" what LS is from the graph — they only know what's hardcoded in prompts.
- No graph-level representation of content series as first-class entities.
- No natural parent-child traversal (e.g., "show me all episodes of the podcast" requires a flat WHERE, not a graph walk).

### Option B: Hub nodes as structural anchors

Create a small number of "hub" nodes — one master identity node ("Latent Space") and one per content series (podcast, AINews, articles, etc.). All content nodes connect to their hub via edges. Bots retrieve hub nodes for instant contextual grounding.

**Possible hierarchy:**
```
"Latent Space" (master hub)
  ├── "Latent Space Podcast" → podcast episodes
  ├── "AINews" → newsletter issues
  ├── "Latent Space Articles" → article nodes
  ├── "Builders Club" → meetup recordings
  ├── "Paper Club" → paper-club sessions
  └── "AI Engineer Conference" → AIE event nodes
```

**Pros:**
- Bots can retrieve a single node and instantly understand "what is the LS podcast?"
- Graph becomes navigable — traversal from hub → content → entities is natural.
- Hub nodes can store aggregate metadata (total episodes, date range, hosts, key themes).
- Rich descriptions on hubs improve vector search — "Latent Space podcast" query hits the hub node first.
- People connect to hubs naturally (swyx → "hosts" → LS Podcast).

**Cons:**
- More nodes and edges to create and maintain.
- Need to decide: what `node_type` do hubs get? A new `'hub'` type? Or something else?
- Every new content node needs a "contains" edge to its hub — maintenance overhead.
- Could the same grounding be achieved with just better guides/prompts instead?

### Option C: Hybrid — hub nodes exist but are lightweight

Create hub nodes for identity/grounding, but don't wire every content node to its hub via individual edges. Instead, the hub nodes exist as rich context anchors that the bots retrieve when they need grounding, and the `node_type` filter handles the actual content grouping.

**Pros:**
- Hub nodes provide grounding without the edge maintenance overhead.
- `node_type` remains the primary grouping mechanism.
- Hub → content association is implicit (hub's `anchors_type` metadata points to the `node_type` value).

**Cons:**
- Graph doesn't actually connect hubs to content — it's metadata-level association, not graph-level.
- Loses the traversal benefit of Option B.

### Questions to resolve during Phase 0

These should be explored during the audit before committing to an approach:

1. **How do the bots actually retrieve context today?** Is the bottleneck the data structure, or the prompt/guide content? Would better guides alone solve the grounding problem?
2. **How many "contains" edges would Option B create?** If it's ~500 content nodes × 1 hub edge each, that's manageable. If it bloats the edge table, it's a problem.
3. **Would hub nodes clutter the UI type navigation?** If hubs show up alongside regular content, is that confusing? Does the UI need to filter them out?
4. **Do we need a master "Latent Space" hub, or just per-series hubs?** The master hub is appealing but might be redundant with the `start-here` guide.
5. **What `node_type` should hubs use?** Options: `'hub'` (new type), `'collection'` (generic), or same type as their children with a metadata flag.
6. **How do hubs interact with the planned PRD-08 Storylines?** Storylines are also structural/narrative nodes — is there overlap?
7. **What's the maintenance story?** When new content is ingested, do hub edges get created automatically? Do hub node stats (episode count, date range) need periodic updates?

### Decision point

This decision should be made after Phase 0 (audit) when we have a concrete understanding of the current data shape. The audit should include explicit evaluation of:
- Sample bot retrieval quality with and without hub-like context
- Edge count impact analysis
- UI rendering implications

## Approach

**Phase 0: Audit** — manual review of current state, identify all issues, update this PRD with specifics before any code runs. Includes evaluating the hub nodes question above.

**Phase 0.5: Graph structure decision** — based on audit findings, decide on flat types vs hub nodes vs hybrid. If hub nodes: create them before fixing individual nodes.

**Phase 1: Build refinement script** — batch processor that fixes each category below, with dry-run mode and example output for human review before committing changes.

**Phase 2: Run in batches** — process small batches (10-20 nodes), review output, iterate on prompts/logic, then run the rest.

---

## Phase 0: Audit

Before writing any code, manually audit the database:

- [ ] Sample 5 nodes of each `node_type` — what's populated, what's missing?
- [ ] Sample 10 edges — are directions correct? Are explanations useful?
- [ ] Check chunk coverage — which node types have chunks, which don't?
- [ ] Check for duplicate nodes (same content, different IDs)
- [ ] Document all issues found → update this PRD

---

---

## Phase 1: Refinement Tasks

### 1. Node Types

**This is the highest priority fix. Node types drive the primary navigation views in the UI.**

The current `node_type` values are wrong. `episode` and `source` are too generic — they hide the actual content categories that the user cares about. The correct categories are derived from `metadata.series` and `metadata.source_type` which already exist in the data.

**Canonical node types:**

| node_type | What it is | Current state | Count |
|---|---|---|---|
| `podcast` | Latent Space podcast episode | `episode` + metadata.series = `latent-space-podcast` | 182 |
| `meetup` | Builders Club / Latent Space TV | `episode` + metadata.series = `meetup` | 75 |
| `paper-club` | Paper Club episode | `episode` + metadata.series = `paper-club` | 11 |
| `article` | Blog post, essay, written content | `source` + metadata.source_type = `blog` | 134 |
| `newsletter` | AI News digest | `source` + metadata.source_type = `newsletter` | 121 |
| `person` | Individual human | already correct | 264 |
| `organization` | Company, lab, institution | already correct | 187 |
| `topic` | Concept, technology, subject area | already correct | 755 |
| `hub` | Structural anchor — master identity or content series | TBD (see graph structure question) | 0 → 7? |
| `insight` | Extracted insight or synthesis node | keep if exists | — |
| `paper` | Academic or research paper | for future use | — |

**These are the primary views in the UI.** Each type should be a navigable category.

**Migration logic:**

```
IF node_type = 'episode':
  IF metadata.series = 'latent-space-podcast' → node_type = 'podcast'
  IF metadata.series = 'meetup' → node_type = 'meetup'
  IF metadata.series = 'paper-club' → node_type = 'paper-club'
  IF no series → infer from title/content, default to 'podcast'

IF node_type = 'source':
  IF metadata.source_type = 'newsletter' → node_type = 'newsletter'
  IF metadata.source_type = 'blog' → node_type = 'article'
  IF no source_type → infer from title/content

IF node_type IS NULL:
  Examine title + metadata → assign correct type

35 episodes + 12 sources have no series/source_type metadata — these need manual classification.
```

### 2. Descriptions

**Every node must have a clear, concise, contextually grounding description.**

This is the most important field in the entire database. It is what the user sees first. It must tell them exactly what this thing is in plain language.

**Rules:**

- One to two sentences maximum.
- First sentence states exactly WHAT this is. Second sentence (optional) adds critical context.
- Must be concrete and specific. No vague language. No "explores", "discusses", "examines", "delves into".
- Must include contextually grounding information — WHO is involved, WHAT the subject is, WHEN it happened if relevant.

**Examples of GOOD descriptions:**

- `Podcast episode featuring George Hotz (tinygrad) and swyx discussing commoditizing GPU compute and making petaflop-scale AI accessible to individuals. Recorded January 2025.`
- `AI News digest covering Qwen 3 model family release (0.6B to 235B MoE), including benchmarks against Llama 4 and DeepSeek. Published April 2025.`
- `Blog post by Lilian Weng (OpenAI) explaining RLHF, DPO, and constitutional AI alignment techniques with mathematical foundations.`
- `Sam Altman — CEO of OpenAI. Previously president of Y Combinator.`
- `Retrieval-Augmented Generation — technique combining LLM generation with external document retrieval to ground responses in source material.`

**Examples of BAD descriptions (do NOT produce these):**

- `This episode explores the future of AI computing.` — vague, no specifics
- `An interesting discussion about various topics in machine learning.` — meaningless
- `Discusses important developments in the AI space.` — says nothing
- `A comprehensive overview of recent advances.` — garbage

**Generation approach:**

- For nodes WITH chunk data: summarize from the chunk content
- For entity nodes (person, organization, topic) WITHOUT chunks: use the node title + any metadata + edge context to generate
- For nodes that already have a description: review and rewrite if it's vague/bad

### 3. Notes

**Notes should capture the most important insights, takeaways, and key points from/about the node.**

This is NOT a summary (that's the description). Notes are the valuable extracted knowledge — the stuff worth remembering.

**Rules:**

- Bullet points, 3-8 items
- Each bullet is a specific, concrete insight — not a topic label
- For content nodes (podcast, article, newsletter): key arguments, surprising claims, important announcements, technical details worth remembering
- For entity nodes (person, org, topic): key facts, relationships, notable positions/opinions
- Must be information-dense — every bullet should teach the reader something

**Example for a podcast episode:**

```
- George Hotz argues GPU clouds will be commoditized within 2 years, making $10M training runs accessible to individuals
- tinygrad's approach: build the simplest possible ML framework, then optimize — opposite of PyTorch's philosophy
- Key tension: NVIDIA's CUDA moat vs. open alternatives (AMD ROCm, tinygrad's custom backends)
- Hotz prediction: most AI companies will fail because they're building on rented infrastructure
```

**Example for a person entity:**

```
- CEO of OpenAI since 2019, navigated the board crisis of November 2023
- Advocates for gradual AI deployment ("iterative deployment") over pausing
- Previously ran Y Combinator (2014-2019), invested in >1000 startups
- Publicly stated AGI could arrive by 2027-2028
```

### 4. Edges

**Every edge must have a clear, human-readable explanation of what the connection is and why it matters.**

Current state is broken:
- 2,619 edges have `source: ai_similarity` with JSON blob context containing generic explanations
- 100 edges have NULL/undefined context
- Edge directions may be incorrect

**Rules:**

- The `context` field must be a clear, human-readable sentence (NOT a JSON blob)
- The explanation should read naturally: `[source node] [explanation] [target node]`
- Direction matters: `from_node_id` → `to_node_id` should read logically
- Every edge must have a non-null, non-empty context

**Edge direction conventions:**

| Relationship | Direction | Example |
|---|---|---|
| Hub → content hub (if hubs adopted) | Latent Space → LS Podcast | "produces" |
| Hub → content node (if hubs adopted) | LS Podcast → Episode X | "contains" |
| Person → hub (if hubs adopted) | swyx → LS Podcast | "hosts" |
| Person appeared on episode | person → episode | "appeared as guest on" |
| Episode covers topic | episode → topic | "covers in depth" |
| Person works at org | person → org | "is CEO of" |
| Article references paper | article → paper | "cites and builds on" |
| Node is related to node | either → either | clear explanation required |

**What needs to happen:**

- Audit all 2,619 `ai_similarity` edges — are they real relationships or noise?
- Rewrite context from JSON blobs to plain English
- Fix NULL/undefined contexts
- Remove junk edges that don't represent meaningful relationships
- Verify direction is correct for all edges

### 5. Chunks

**Every node must have at least one row in the `chunks` table.**

Current state: 1,532 nodes have zero chunks.

**Rules:**

- Content nodes (podcast, meetup, paper-club, article, newsletter): should have MANY chunks — the full transcript/article split into ~2000 char segments with overlap. These should already exist from the `chunk` column on the node — they just need to be split and inserted into the `chunks` table.
- Entity nodes (person, organization, topic): should have exactly ONE chunk containing a comprehensive summary of what is known about this entity from the graph. This chunk enables vector search to find these entities.

**Process:**

- For nodes with `chunk` data on the node row but no rows in `chunks` table: run the chunking logic (split + embed + insert)
- For entity nodes with no `chunk` data: generate a summary chunk from the node's description, notes, and connected edges, then embed it

---

## Phase 2: Execution Plan

### Step 1: Build `scripts/refine-data.ts`

Single script with subcommands:

```bash
# Audit mode — show current state
npx tsx scripts/refine-data.ts --audit

# Create hub nodes (if hub approach adopted — run once, idempotent)
# npx tsx scripts/refine-data.ts --task hubs --dry-run
# npx tsx scripts/refine-data.ts --task hubs

# Dry run — show what would change for N nodes
npx tsx scripts/refine-data.ts --task types --limit 5 --dry-run
npx tsx scripts/refine-data.ts --task descriptions --limit 5 --dry-run

# Live run — apply changes
npx tsx scripts/refine-data.ts --task types --limit 20
npx tsx scripts/refine-data.ts --task descriptions --limit 20

# Wire content nodes to their hub (if hub approach adopted)
# npx tsx scripts/refine-data.ts --task hub-edges --dry-run
# npx tsx scripts/refine-data.ts --task hub-edges

# All tasks
npx tsx scripts/refine-data.ts --task types
npx tsx scripts/refine-data.ts --task descriptions
npx tsx scripts/refine-data.ts --task notes
npx tsx scripts/refine-data.ts --task edges
npx tsx scripts/refine-data.ts --task chunks
```

### Step 2: Review loop

For each task:
1. Run `--dry-run --limit 5` and output results to console
2. **Human reviews output** — approves or gives feedback
3. Iterate on prompts/logic until output quality is right
4. Run `--limit 20`, review again
5. Run full batch

### Step 3: Verify

After all tasks complete:
- Re-run `--audit` to confirm zero NULL descriptions, zero NULL notes, zero missing chunks, zero NULL types
- Spot-check 10 random nodes in the UI
- Spot-check 10 random edges for direction + explanation quality

---

## Technical Notes

- Use `@libsql/client` directly (same pattern as `ingest.ts`) — no Next.js deps
- LLM calls for description/notes generation: use `gpt-4o-mini` for speed/cost, with option to use `gpt-4o` for higher quality on specific node types
- Batch size: 10-20 nodes per LLM call where possible
- Rate limiting: respect OpenAI limits, add sleep between batches
- Idempotent: skip nodes that already have good data (non-null, non-empty, passes quality check)
- All changes logged to console with before/after for review

---

## Current Database Snapshot (as of 2026-02-20)

| Metric | Count |
|---|---|
| Total nodes | 1,874 |
| Total edges | 2,688 |
| Total chunks | 28,352 |
| NULL description | 1,736 |
| NULL notes | 1,670 |
| NULL node_type | 157 |
| Nodes without chunk rows | 1,532 |
| Edges with NULL context | 100 |
| Edges `ai_similarity` | 2,619 |

**Node type breakdown (current → target):**

| Current type | Count | Target type |
|---|---|---|
| `episode` (series=latent-space-podcast) | 182 | `podcast` |
| `episode` (series=meetup) | 75 | `meetup` |
| `episode` (series=paper-club) | 11 | `paper-club` |
| `episode` (no series) | 35 | classify manually |
| `source` (source_type=blog) | 134 | `article` |
| `source` (source_type=newsletter) | 121 | `newsletter` |
| `source` (no source_type) | 12 | classify manually |
| `person` | 264 | `person` (no change) |
| `organization` | 187 | `organization` (no change) |
| `topic` | 755 | `topic` (no change) |
| NULL | 157 | classify from title/metadata |
| *(TBD)* | 0 → 7? | `hub` — if hub node approach adopted (see open question) |
