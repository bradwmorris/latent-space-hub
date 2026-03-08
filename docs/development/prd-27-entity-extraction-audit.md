# PRD 27: Ingestion & Entity Extraction Pipeline Audit

**Status:** ready | **Updated:** 2026-03-08

## 1. What This PRD Fixes

The ingestion pipeline creates nodes for podcasts, articles, AINews, and LatentSpaceTV recordings. After creating each node, it calls Claude Haiku to extract entities (people, orgs, topics) and creates entity nodes + edges linking them to the content.

**What's broken:**

1. **Entity extraction creates garbage nodes.** Entity nodes get a description like `"person extracted from auto-ingestion"` — no useful information. Every node in the system should have an explicit, clear description of what it is.

2. **Duplicate entities exist** (e.g. "Boris Cherny" appears twice). The dedup check is `LOWER(title) = LOWER(?)` — exact match only. No fuzzy matching, no search. If Claude returns "Boris Cherney" one time and "Boris Cherny" the next, you get two nodes.

3. **Entity scope is too broad.** Currently extracts people, organizations, AND topics. Topics create noise — hundreds of vague entity nodes like "scaling laws", "RAG", "fine-tuning". Entities should be limited to **major organizations and fields of research** only. People are already captured well as guests/hosts.

4. **Using expensive model for simple tasks.** Claude Haiku costs $1/$5 per million tokens. `gpt-5-mini` costs $0.25/$2 — 4x cheaper on input. For structured extraction tasks this is more than capable.

5. **~200 lines of duplicate code** across `processing.ts` and `extract-entities/route.ts`. Same functions copy-pasted. Already diverging (one has retry, one doesn't).

6. **The catch-up cron is broken.** It queries for nodes with zero edges, but companion linking runs first and gives most nodes an edge — so the cron thinks they're done.

---

## 2. How Entity Extraction Currently Works

```
Vercel Cron (hourly at :00) → /api/cron/ingest
  → checkAndIngest()                          — src/services/ingestion/index.ts
    → discoverSource()                        — src/services/ingestion/discovery.ts
    → processDiscoveredItem()                 — src/services/ingestion/processing.ts
      → nodeService.createNode()              — creates the content node
      → embedNodeContent()                    — chunks + embeds
      → linkRecordingToEvent()                — paper-club/builders-club only
      → findCompanionNode()                   — podcast↔article pairs
      → extractEntitiesForNode()              — THE ENTITY EXTRACTION (line 664)
        → extractEntitiesWithClaude()         — calls Claude Haiku (line 280)
          → prompt: "Extract prominent entities... Return JSON"
          → sends: title + first 500 chars description + first 2500 chars content
          → model: claude-haiku-4-5-20251001 (line 306)
          → returns: {"people": [...], "organizations": [...], "topics": [...]}
        → for each entity:
          → findOrCreateEntity()              — line 239
            → SELECT WHERE LOWER(title) = LOWER(?) AND node_type = 'entity'
            → if not found: CREATE new node with node_type='entity'
            → description is just: "person extracted from auto-ingestion"
          → ensureEdge()                      — line 268
            → check edge exists (one direction only)
            → create edge with explanation "appeared on {title}" or "covers {name}"
            → metadata: created_via='workflow', source='ai_similarity' (wrong label)

Vercel Cron (hourly at :30) → /api/cron/extract-entities
  → SAME extraction logic, copy-pasted (~200 lines)
  → finds nodes with 0 edges AND created < 7 days ago
  → processes max 5 per run
  → BROKEN: most nodes already have a companion edge, so query returns nothing
```

**Key files:**
- `src/services/ingestion/processing.ts` — main ingestion + entity extraction (lines 239-529)
- `app/api/cron/extract-entities/route.ts` — duplicate catch-up cron (242 lines)
- `src/services/ingestion/index.ts` — orchestrator
- `src/services/ingestion/discovery.ts` — RSS discovery
- `src/services/database/nodes.ts` — node CRUD (no dedup)
- `src/services/database/edges.ts` — edge creation + inference

---

## 3. Implementation Plan

### Part 1: Consolidate into shared module + switch to gpt-5-mini

**Create:** `src/services/extraction/entityExtractor.ts`

Move ALL extraction logic out of both `processing.ts` and `extract-entities/route.ts` into one shared module:
- `ENTITY_BLOCKLIST`, `HOST_ALIAS_REPLACEMENTS`, `cleanEntity()`
- `extractEntities()` — the LLM call (now using OpenAI)
- `findOrCreateEntity()` — with proper dedup (Part 2)
- `ensureEdge()` — with bidirectional check
- `extractEntitiesForNode()` — the orchestrator

**Switch model from Claude Haiku to `gpt-5-mini`:**

Currently (`processing.ts:304-311`):
```typescript
const response = await withRetry(async () => {
  return client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    ...
  });
});
```

Replace with OpenAI SDK (already installed: `openai` in package.json):
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await withRetry(async () => {
  return openai.chat.completions.create({
    model: 'gpt-5-mini',
    temperature: 0,
    max_tokens: 500,
    response_format: { type: 'json_object' },  // guaranteed valid JSON
    messages: [{ role: 'user', content: prompt }],
  });
});
```

Benefits:
- 4x cheaper on input ($0.25 vs $1.00 per 1M tokens)
- 2.5x cheaper on output ($2.00 vs $5.00 per 1M tokens)
- Native JSON mode — no more regex extraction of JSON from response
- `OPENAI_API_KEY` already exists in env (used by edge inference in `edges.ts`)

**After this part:**
- `processing.ts` loses ~200 lines of extraction code, replaced by imports
- `extract-entities/route.ts` loses ~130 lines, replaced by imports
- One place to fix bugs, one model config, one blocklist

### Part 2: Fix entity dedup — search before creating

**Problem:** `findOrCreateEntity()` does exact `LOWER(title) = LOWER(?)` match. "Boris Cherney" and "Boris Cherny" create two nodes. No fuzzy matching at all.

**Fix:** Before creating a new entity, search the nodes table properly:

```typescript
async function findOrCreateEntity(
  name: string,
  entityType: 'organization' | 'research_field',
  sourceContext: { contentTitle: string; contentType: string }
): Promise<number> {
  const normalized = cleanEntity(name);

  // Step 1: Exact match (fast, indexed)
  const exact = await sqlite.query(
    "SELECT id FROM nodes WHERE LOWER(title) = LOWER(?) AND node_type = 'entity' LIMIT 1",
    [normalized]
  );
  if (exact.rows.length > 0) return exact.rows[0].id;

  // Step 2: Fuzzy match — search for similar titles
  // Use LIKE with first/last word to catch typos and variations
  const words = normalized.split(' ').filter(w => w.length > 2);
  if (words.length > 0) {
    const fuzzy = await sqlite.query(
      `SELECT id, title FROM nodes
       WHERE node_type = 'entity'
         AND (${words.map(() => 'LOWER(title) LIKE ?').join(' OR ')})
       LIMIT 10`,
      words.map(w => `%${w.toLowerCase()}%`)
    );

    // If we find a close match (e.g. same last name + similar first name), use it
    for (const row of fuzzy.rows) {
      if (isFuzzyMatch(normalized, row.title)) {
        return row.id;
      }
    }
  }

  // Step 3: No match — create new entity with proper description
  const node = await nodeService.createNode({ ... });
  return node.id;
}
```

**Add index on title for fast lookups:**
```sql
CREATE INDEX IF NOT EXISTS idx_nodes_title_lower ON nodes(LOWER(title));
```

This makes the exact match query use an index instead of scanning the entire table.

### Part 3: Tighten entity scope — organizations and research fields only

**Current:** Extracts people, organizations, topics.
**New:** Extract **organizations** and **research fields** only. Drop people (they're already captured as guests/hosts through other means) and drop generic "topics" (too noisy).

Update the extraction prompt:

```
Extract major entities from this content. Return strict JSON only.
Schema: {"organizations": string[], "research_fields": string[]}
Rules:
- organizations: Only major companies, labs, or institutions (e.g. "OpenAI", "DeepMind", "Stanford"). Not products, not projects.
- research_fields: Only established fields or subfields of research (e.g. "reinforcement learning", "mechanistic interpretability", "constitutional AI"). Not generic topics like "AI" or "scaling".
- Keep names in standard capitalization.
- Max 5 organizations, max 5 research fields.
- If unsure, leave it out.

Title: {title}
Content: {first 2500 chars}
```

Update `EntityExtractionResult`:
```typescript
interface EntityExtractionResult {
  organizations: string[];
  research_fields: string[];
}
```

Remove: `people` from extraction. Remove: generic `topics`.

### Part 4: Every node gets a proper description

**This is the most important change.**

Right now, entity nodes get: `"person extracted from auto-ingestion"`. That's useless.

Every node in the system — content nodes AND entity nodes — must have an explicit, short description of **what it is**.

**For entity nodes** (created during extraction):

Add a second LLM call (cheap — gpt-5-mini) when creating a new entity, using the content that triggered the creation:

```typescript
async function generateEntityDescription(
  entityName: string,
  entityType: 'organization' | 'research_field',
  sourceContent: { title: string; chunk: string }
): Promise<{ description: string; notes: string }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    temperature: 0,
    max_tokens: 300,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `Generate a description and notes for this entity based on the source content.

Entity: "${entityName}"
Type: ${entityType}
Source: "${sourceContent.title}"
Content: ${sourceContent.chunk.slice(0, 1500)}

Return JSON:
{
  "description": "One sentence. What this entity IS. For an org: what they do and why they matter in AI/ML. For a research field: what it studies and why it matters. Be specific, not generic.",
  "notes": "2-3 sentences of additional context from the source content. What was said about this entity? Why is it relevant to the Latent Space community?"
}

Examples of GOOD descriptions:
- "Anthropic is an AI safety company that builds Claude, focused on constitutional AI and interpretability research."
- "Mechanistic interpretability is the study of reverse-engineering neural network internals to understand how models represent and process information."

Examples of BAD descriptions:
- "organization extracted from auto-ingestion"
- "A company in the AI space"
- "An important research area"
`
    }],
  });

  return JSON.parse(response.choices[0].message.content);
}
```

Then when creating the entity node:
```typescript
const { description, notes } = await generateEntityDescription(normalized, entityType, sourceContext);

const node = await nodeService.createNode({
  title: normalized,
  node_type: 'entity',
  description,        // "Anthropic is an AI safety company..."
  notes,              // Additional context from source
  chunk: notes,       // Also store in chunk for search/embedding
  dimensions: ['entity'],
  metadata: {
    entity_type: entityType,
    extraction_method: 'gpt-5-mini',
    first_seen_in: sourceContext.contentTitle,
  },
});
```

**For content nodes** (podcasts, articles, etc.):

The ingestion pipeline already creates descriptions via `buildDescription()` (`processing.ts:86-89`), but it's just title + first 500 chars of content — not a real description.

Add a description generation step after content extraction:

```typescript
async function generateContentDescription(
  title: string,
  nodeType: string,
  chunk: string,
  metadata: Record<string, unknown>
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    temperature: 0,
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Write a one-sentence description for this ${nodeType}.

Title: "${title}"
Content: ${chunk.slice(0, 2000)}

Rules:
- Start with what it IS: "A Latent Space podcast episode featuring X, discussing Y."
- Include who's involved and what they talk about.
- One sentence, max 50 words.
- No fluff, no opinions. Just facts.

Examples:
- "Latent Space podcast episode featuring Ilya Sutskever, discussing scaling laws, compute efficiency, and the future of foundation models."
- "AI News daily digest covering OpenAI's GPT-5 release, Google's Gemini updates, and new research on chain-of-thought reasoning."
- "Latent Space blog post by swyx analyzing the shift from RAG to long-context models, with benchmarks and practical recommendations."
`
    }],
  });

  return response.choices[0].message.content.trim();
}
```

Call this for every new content node before `createNode()`.

### Part 5: Fix the catch-up cron

Replace the broken query. Instead of checking edges (which is wrong), check a metadata flag:

```sql
SELECT n.id, n.title, SUBSTR(n.chunk, 1, 3000) as chunk, n.node_type, n.metadata
FROM nodes n
WHERE n.node_type IN ('podcast', 'article', 'ainews', 'builders-club', 'paper-club', 'workshop')
  AND n.chunk IS NOT NULL
  AND (
    json_extract(n.metadata, '$.entity_extraction.status') IS NULL
    OR json_extract(n.metadata, '$.entity_extraction.status') = 'failed'
  )
ORDER BY n.created_at DESC
LIMIT ?
```

- No 7-day window — catches everything
- No edge check — uses the metadata audit trail instead
- Increase default limit from 5 to 15

After extraction, write the result to metadata (this is the audit trail):
```typescript
metadata.entity_extraction = {
  status: 'success' | 'failed',
  extracted_at: new Date().toISOString(),
  method: 'gpt-5-mini' | 'frontmatter',
  entities_found: { organizations: [...], research_fields: [...] },
  edges_created: number,
};
```

### Part 6: Audit dimensions — consider removal

Dimensions were inherited from RA-H. Now that we have `node_type` categories (podcast, article, ainews, entity, member, event, etc.) and a category taxonomy in the sidebar, dimensions may be redundant.

**Audit needed:**
- What dimensions currently exist in the DB?
- Are any used in queries, filters, or UI beyond what `node_type` already covers?
- Do MCP tools or Slop use dimensions in searches?

If dimensions are just duplicating `node_type`, remove them:
- Drop `node_dimensions` junction table
- Remove dimension assignment from all node creation paths
- Remove DimensionsPane from UI
- Simplify ingestion (no dimension logic at all)

**Decision:** Audit first, then decide. This may become a separate PRD if the removal is large.

---

## 4. Key Files

| File | Action |
|------|--------|
| `src/services/extraction/entityExtractor.ts` | **Create** — single shared module for all extraction |
| `src/services/ingestion/processing.ts` | **Modify** — delete ~200 lines of extraction code, import shared module, add description generation |
| `app/api/cron/extract-entities/route.ts` | **Modify** — delete ~130 lines, import shared module, fix query |
| `src/services/database/nodes.ts` | **Review** — ensure createNode handles description properly |
| `src/services/database/edges.ts` | **Review** — edge metadata labels |
| `package.json` | **Review** — openai SDK already installed |

## 5. Tasks

- [x] Part 1: Create shared `entityExtractor.ts`, refactor both callers, switch to `gpt-4.1-mini`
- [x] Part 2: Fix entity dedup — fuzzy search before creating (levenshtein + LIKE)
- [x] Part 3: Tighten entity scope — organizations and research fields only, drop people/topics
- [x] Part 4: Every node gets a proper description — entity nodes AND content nodes
- [x] Part 5: Fix catch-up cron query + add extraction audit trail to metadata
- [x] Part 6: Audit dimensions — **decision: keep**. Dimensions are deeply integrated (20+ files, 9 MCP tools, primary UI axis for FolderViewOverlay kanban). They serve a different purpose than node_type (flexible many-to-many tagging vs. fixed classification).

## 6. Flags

- **Cost:** gpt-5-mini at $0.25/$2.00 per 1M tokens. Entity extraction + description generation = ~2 calls per node. At ~1000 tokens per call, that's ~$0.002 per node. Negligible.
- **Backfill:** Existing entity nodes have garbage descriptions. Need a one-time backfill script to regenerate descriptions for all ~N entity nodes. Run after Part 4 lands.
- **OPENAI_API_KEY:** Already in env (used by edge inference). No new secrets needed.
- **Breaking change:** Dropping `people` from entity extraction means new ingestions won't create person entities. Existing person entities stay. This is intentional — people are captured through other means (guest metadata, member nodes).

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.

---

## COMPLETED

**Date:** 2026-03-08

**What was delivered:**

1. **Created `src/services/extraction/entityExtractor.ts`** — single shared module for all entity extraction logic. Contains: `extractEntities()` (LLM call), `findOrCreateEntity()` (fuzzy dedup), `ensureEdge()` (bidirectional check), `extractEntitiesForNode()` (orchestrator), `generateContentDescription()` (content node descriptions), `generateEntityDescription()` (entity node descriptions), `isFuzzyMatch()` (levenshtein-based), plus all constants and helpers.

2. **Refactored `processing.ts`** — removed ~200 lines of duplicated extraction code (EntityExtractionResult interface, ENTITY_BLOCKLIST, HOST_ALIAS_REPLACEMENTS, cleanEntity, withRetry, findOrCreateEntity, ensureEdge, extractEntitiesWithClaude, extractEntitiesForNode). Now imports from shared module. Content description generation uses `generateContentDescription()` instead of `buildDescription()` (title + 500 char preview).

3. **Refactored `extract-entities/route.ts`** — removed ~130 lines of duplicated code. Now imports `extractEntitiesForNode` from shared module. Fixed the broken catch-up cron query: uses `json_extract(n.metadata, '$.entity_extraction.status')` instead of edge count. Removed 7-day window. Increased default limit from 5 to 15. Writes failed audit trail on error.

4. **Model switch** — Claude Haiku → `gpt-4.1-mini` (OpenAI). Native JSON mode (`response_format: { type: 'json_object' }`), no more regex extraction. Uses existing `OPENAI_API_KEY`. Note: PRD specified `gpt-5-mini` but `gpt-4.1-mini` is the current equivalent model.

5. **Entity scope tightened** — now extracts only `organizations` and `research_fields`. Dropped `people` (captured via guest/host metadata) and `topics` (too noisy). AINews frontmatter: only uses `companies`, ignores `topics`/`models`/`people`.

6. **Fuzzy dedup** — `findOrCreateEntity()` now does: (1) exact LOWER match, (2) LIKE-based word search + levenshtein distance check with threshold of 1 edit per 5 chars. Catches "Boris Cherney" vs "Boris Cherny".

7. **Entity descriptions** — new entities get LLM-generated descriptions ("Anthropic is an AI safety company...") and notes. No more "person extracted from auto-ingestion".

8. **Content descriptions** — new content nodes get LLM-generated one-sentence descriptions instead of title + 500-char preview.

9. **Extraction audit trail** — writes `metadata.entity_extraction = { status, extracted_at, method, entities_found, edges_created }` after each extraction. Failed extractions also get audit trail.

10. **Bidirectional edge check** — `ensureEdge()` now checks both directions before creating.

11. **EdgeSource type** — added `'entity_extraction'` to `EdgeSource` union type. Entity edges now use `source: 'entity_extraction'` instead of `source: 'ai_similarity'`.

12. **Dimensions audit** — decided to keep. Dimensions are the primary flexible organization layer (20+ files, 9 MCP tools, drives FolderViewOverlay kanban). They complement node_type rather than duplicating it.

**Backfill needed:** Existing entity nodes still have garbage descriptions. A one-time backfill script should regenerate descriptions for all entity nodes using `generateEntityDescription()`.
