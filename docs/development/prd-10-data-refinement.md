# PRD 10: Data Refinement & Hygiene

## Background

PRD-05 ingested ~523 nodes via the pipeline. The raw content (chunk) is there, but the user-facing fields are garbage:

- **1,736 / 1,874 nodes** have NULL or empty `description`
- **1,670 / 1,874 nodes** have NULL or empty `notes`
- **1,532 nodes** have zero rows in the `chunks` table
- **157 nodes** have NULL `node_type`
- **100 edges** have NULL or undefined `context`
- **2,619 / 2,688 edges** are `ai_similarity` with JSON blob context — no human-readable explanation
- Node types are too generic (`source` = ainews + articles + blogs all lumped together)

The database has data but it's not usable. This PRD fixes that.

## Approach

**Phase 0: Audit** — manual review of current state, identify all issues, update this PRD with specifics before any code runs.

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

## Phase 1: Refinement Tasks

### 1. Descriptions

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

### 2. Notes

**Notes should capture the most important insights, takeaways, and key points from/about the node.**

This is NOT a summary (that's the description). Notes are the valuable extracted knowledge — the stuff worth remembering.

**Rules:**

- Bullet points, 3-8 items
- Each bullet is a specific, concrete insight — not a topic label
- For content nodes (episodes, articles, ainews): key arguments, surprising claims, important announcements, technical details worth remembering
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

### 3. Edges

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

### 4. Chunks

**Every node must have at least one row in the `chunks` table.**

Current state: 1,532 nodes have zero chunks.

**Rules:**

- Content nodes (episode, source/article, ainews): should have MANY chunks — the full transcript/article split into ~2000 char segments with overlap. These should already exist from the `chunk` column on the node — they just need to be split and inserted into the `chunks` table.
- Entity nodes (person, organization, topic): should have exactly ONE chunk containing a comprehensive summary of what is known about this entity from the graph. This chunk enables vector search to find these entities.

**Process:**

- For nodes with `chunk` data on the node row but no rows in `chunks` table: run the chunking logic (split + embed + insert)
- For entity nodes with no `chunk` data: generate a summary chunk from the node's description, notes, and connected edges, then embed it

### 5. Node Types

**Every node must have a correct, specific `node_type`.**

Current state:
- 157 nodes have NULL `node_type`
- `source` is used for both ainews digests and blog articles (should be distinct)

**Valid node types:**

| node_type | What it means |
|---|---|
| `episode` | Podcast episode or video (has transcript) |
| `article` | Blog post, essay, or written content |
| `newsletter` | AI News digest or newsletter issue |
| `paper` | Academic or research paper |
| `person` | Individual human |
| `organization` | Company, lab, or institution |
| `topic` | Concept, technology, or subject area |
| `insight` | Extracted insight or synthesis node |

**What needs to happen:**

- Fix all 157 NULL types by examining title + metadata
- Split `source` into `article` vs `newsletter` based on metadata (`source_type: 'newsletter'` in metadata = `newsletter`, `source_type: 'blog'` = `article`)
- Verify all existing types are correct

---

## Phase 2: Execution Plan

### Step 1: Build `scripts/refine-data.ts`

Single script with subcommands:

```bash
# Audit mode — show current state
npx tsx scripts/refine-data.ts --audit

# Dry run — show what would change for N nodes
npx tsx scripts/refine-data.ts --task descriptions --limit 5 --dry-run

# Live run — apply changes
npx tsx scripts/refine-data.ts --task descriptions --limit 20

# All tasks
npx tsx scripts/refine-data.ts --task descriptions
npx tsx scripts/refine-data.ts --task notes
npx tsx scripts/refine-data.ts --task types
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
| Nodes without chunks rows | 1,532 |
| Edges with NULL context | 100 |
| Edges `ai_similarity` | 2,619 |

**Node type breakdown:**

| Type | Count |
|---|---|
| topic | 716 |
| episode | 303 |
| source | 267 |
| person | 252 |
| organization | 179 |
| NULL | 157 |
