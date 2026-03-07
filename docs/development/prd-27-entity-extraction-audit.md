# PRD 27: Entity Extraction Pipeline Audit & Cleanup

**Status:** Draft | **Created:** 2026-03-07

## 1. Background

Entity extraction runs automatically during content ingestion and via a cron endpoint. It uses Claude Haiku to extract people, organizations, and topics from content, then creates entity nodes and edges. The system works for the 80% case but has known fragilities: deduplication race conditions, duplicated code, hardcoded blocklists, inconsistent metadata, and no feedback loop. This audit will map the full pipeline, fix issues, and make it robust.

## 2. Plan

1. Audit the full pipeline end-to-end and document the flow
2. Fix deduplication and consistency issues
3. Consolidate duplicated code into shared utilities
4. Improve entity quality (blocklist, normalization, validation)
5. Add observability (extraction audit trail per node)

## 3. Implementation Details

### Step 1: Consolidate Duplicated Code

**Problem:** Entity extraction logic exists in TWO places with duplicated blocklists, prompts, and normalization:
- `src/services/ingestion/processing.ts` (lines 398-454) — during ingestion
- `app/api/cron/extract-entities/route.ts` (242 lines) — cron endpoint

**Fix:** Extract shared module.

**New file:** `src/services/extraction/entityExtractor.ts`

```typescript
export const ENTITY_BLOCKLIST = ['ai', 'llm', 'ml', 'tech', 'product', 'today', 'week'];

export const HOST_ALIASES: Record<string, string> = {
  'swixs': 'swyx', 'swix': 'swyx', 'switz': 'swyx',
  'alesio': 'Alessio', 'allesio': 'Alessio', 'allesop': 'Alessio',
};

export function cleanEntity(name: string): string { ... }
export function formatEntityExplanation(entityType: string, entityName: string, contentTitle: string, contentType: string): string { ... }
export async function extractEntitiesWithClaude(title: string, description: string, chunk: string): Promise<ExtractedEntities> { ... }
export async function findOrCreateEntity(title: string, entityType: string): Promise<number> { ... }
export async function ensureEntityEdge(contentNodeId: number, entityNodeId: number, explanation: string): Promise<void> { ... }
```

**Modify:**
- `src/services/ingestion/processing.ts` — import from shared module
- `app/api/cron/extract-entities/route.ts` — import from shared module

### Step 2: Fix Deduplication Race Condition

**Problem:** If Claude returns `["swyx", "Swyx"]`, both go through `findOrCreateEntity()` — the second call may create a duplicate because the first hasn't committed yet.

**Fix:** Deduplicate the entire extraction result before processing:

```typescript
// In entityExtractor.ts
export function deduplicateEntities(entities: ExtractedEntities): ExtractedEntities {
  const seen = new Set<string>();
  const dedup = (arr: string[]) => arr
    .map(cleanEntity)
    .filter(e => {
      const key = e.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    people: dedup(entities.people || []),
    organizations: dedup(entities.organizations || []),
    topics: dedup(entities.topics || []),
  };
}
```

### Step 3: Fix AINews Frontmatter Validation

**Problem:** Code expects `metadata.frontmatter_entities.{people, companies, topics, models}` but no schema validation. Malformed data silently falls through.

**Fix:** Add validation in shared module:

```typescript
export function parseFrontmatterEntities(metadata: any): ExtractedEntities | null {
  const fe = metadata?.frontmatter_entities;
  if (!fe || typeof fe !== 'object') return null;
  return {
    people: Array.isArray(fe.people) ? fe.people.filter(isString) : [],
    organizations: Array.isArray(fe.companies) ? fe.companies.filter(isString) : [],
    topics: [
      ...(Array.isArray(fe.topics) ? fe.topics.filter(isString) : []),
      ...(Array.isArray(fe.models) ? fe.models.filter(isString) : []),
    ],
  };
}
```

### Step 4: Centralize Explanation Templates

**Problem:** Edge explanations are ad-hoc strings scattered across files. If format changes, edge type heuristics in `edges.ts` break silently.

**Fix:** Create centralized explanation templates:

```typescript
// In entityExtractor.ts
export function formatEntityExplanation(
  entityType: 'person' | 'organization' | 'topic',
  entityName: string,
  contentTitle: string,
  contentNodeType: string,
): string {
  if (entityType === 'person' && ['podcast', 'builders-club', 'workshop', 'paper-club'].includes(contentNodeType)) {
    return `appeared on ${contentTitle}`;
  }
  return `covers ${entityName}`;
}
```

### Step 5: Add Extraction Audit Trail

**Problem:** No record of what entities were extracted from which node. Can't debug false extractions or missing entities.

**Fix:** Store extraction results in node metadata:

```typescript
// After extraction, update node metadata
await nodeService.updateNode(nodeId, {
  metadata: {
    ...existingMetadata,
    entity_extraction: {
      status: 'success',
      extracted_at: new Date().toISOString(),
      method: 'claude-haiku' | 'frontmatter',
      entities: { people: [...], organizations: [...], topics: [...] },
      edges_created: 7,
    }
  }
});
```

### Step 6: Extend Blocklist & Make Configurable

**Current blocklist:** `['ai', 'llm', 'ml', 'tech', 'product', 'today', 'week']` — too short.

**Extended blocklist:**
```typescript
export const ENTITY_BLOCKLIST = new Set([
  // Too generic
  'ai', 'llm', 'ml', 'tech', 'product', 'today', 'week',
  'software', 'hardware', 'data', 'model', 'system', 'platform',
  'tool', 'framework', 'library', 'api', 'sdk',
  // Temporal
  'today', 'yesterday', 'this week', 'last week', 'recently',
  // Meta
  'latent space', 'podcast', 'episode', 'article', 'newsletter',
]);
```

**Future:** Move to a config file or DB table for runtime editing.

## 4. Key Files

| File | Action |
|------|--------|
| `src/services/extraction/entityExtractor.ts` | Create (shared module) |
| `src/services/ingestion/processing.ts` | Modify (use shared module) |
| `app/api/cron/extract-entities/route.ts` | Modify (use shared module) |
| `src/services/database/edges.ts` | Review (ensure heuristics match centralized templates) |
| `src/services/database/nodes.ts` | Modify (store extraction audit in metadata) |

## 5. Flags

- **Metadata format inconsistency:** Auto-extracted entities use `metadata.entity_type` but `node_type` is always `'entity'`. The `migrate-entity-types.ts` script may have split some into separate types. Need to audit actual DB state to understand current reality.
- **Rate limiting:** No throttling on Claude calls during batch extraction. The cron defaults to 5 items, but if increased, could hit rate limits. Add a simple delay between calls.
- **7-day window:** Cron only processes nodes created in last 7 days. Older nodes with 0 edges are permanently orphaned. Consider a backfill mode.
- **Edge direction:** Person→Content for podcast appearances, Content→Entity for covers. This is correct but fragile — relies on explanation text matching heuristics.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
