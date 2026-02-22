# PRD 16: Graph & Bot Final Polish

Last round of changes to the knowledge graph ingestion pipeline and bot architecture before moving on.

## Background

Four issues need resolution before the graph + bot system is in a clean, maintainable state:

1. **Podcast/article double discussion** — Many Substack articles on latent.space are companion pieces to podcast episodes (same content, different format). Both get ingested — which is fine, both should exist in the graph. The problem is both trigger a yap discussion kickoff tagging Slop, so the same conversation gets started twice. Need companion detection + single-kickoff logic.

2. **Entity extraction is silently failing** — The `extractEntitiesForNode()` function exists in the ingestion pipeline and runs inside a try/catch that swallows errors. Result: nodes ingested via hourly cron (IDs 4050-4069, Feb 22) have **0 edges**, while older batch-processed nodes have 6-14 edges each. The graph is growing nodes but not connections. Only 2 out of 7 recently cron-ingested nodes got edges.

3. **Bot design sprawl** — Two bots (Sig + Slop) were built in parallel. Neither is polished. Rather than spreading effort across both, focus exclusively on Slop, get it working really well, then revisit Sig later.

4. **Dashboard stats are flat** — The stats bar shows 4 aggregate numbers (Nodes, Edges, Chunks, Content) with no breakdown by node type. You can't see at a glance how many podcasts vs guests vs articles exist without scrolling to the category cards. The type distribution should be the hero of the dashboard.

## Current State

### Podcast/Article Double Kickoff
- **Podcasts**: ingested from YouTube RSS, transcript from `youtube-transcript-plus`
- **Articles**: ingested from Substack RSS (`latent.space/feed`), body from cheerio/Jina
- **Both should exist in the graph** — the article often has unique editorial content worth keeping
- **Both get announced** — fine, users should see both formats
- **Both trigger yap kickoff** — the problem. `notifyAnnouncementsThenYap()` fires unconditionally for every ingested item (`index.ts:111`). Slop gets tagged twice for what's essentially the same content.
- **No companion detection**: nothing currently connects a podcast to its companion article, so the system can't know to skip the second kickoff
- **Side bug**: `[AINews] Gemini 3.1 Pro` (node 4050) landed as `article` instead of `ainews` — likely ingested before the title-filter fix shipped

### Entity Extraction
- **Code path**: `processing.ts:265-321` — `extractEntitiesForNode()` calls Claude to extract people/orgs/topics, then `findOrCreateEntity()` + `ensureEdge()`
- **Called at**: `processing.ts:416-427` — wrapped in try/catch that logs warning and continues
- **Likely failure mode**: missing `ANTHROPIC_API_KEY` in Vercel cron environment (function returns empty arrays when key is missing, line 151-153), OR Claude API timeouts within the 55-second cron budget, OR the key exists but the function hits rate limits
- **Batch script worked**: `scripts/extract-entities.ts` was run manually during initial ingestion and successfully created edges — but it's not connected to the cron pipeline

### Bot Architecture
- **Sig**: "Signal" — precise, citation-heavy answer bot
- **Slop**: "Entropy" — opinionated, provocative debate starter
- **Both run in `latent-space-bots` repo** (separate from this repo)
- **This repo's role**: ingestion notifications via webhooks to Discord
- **Current state**: both bots exist but neither is polished; effort is split

---

## Plan

### Part 1: Podcast/Article Companion Detection + Single Kickoff

**Goal**: Both the podcast and its companion article should appear in the graph and in announcements. But only ONE discussion kickoff should fire in yap — not two.

**The actual problem**: `notifyAnnouncementsThenYap()` fires unconditionally for every ingested item (`index.ts:111`). When a podcast and its companion article both get ingested, Slop gets tagged twice for the same content.

**Approach**: Detect companions at ingestion time. Always announce both. Only kick off yap discussion for the first one ingested — skip yap for the companion.

#### Step 1: `findCompanionNode()` — title similarity matching

**File: `src/services/ingestion/processing.ts`**

Add a function that checks if a companion already exists in the DB:

```typescript
async function findCompanionNode(params: {
  nodeType: 'podcast' | 'article';
  title: string;
}): Promise<number | null>
```

Logic:
- If new node is `article`, search for `podcast` nodes with similar titles (and vice versa)
- Match heuristics:
  - Strip common prefixes ("Ep XX:", episode numbers)
  - Extract guest names from "— with Guest Name" pattern
  - Compare remaining title core (fuzzy match via word overlap)
- Return the matching node ID, or null

This runs inside `processDiscoveredItem()` after the node is created.

#### Step 2: Create companion edge

When a companion is found:
- Create edge: `article → podcast` with explanation `"companion article for podcast episode"`
- Log the linkage

This keeps both nodes (the article may have unique editorial content) but makes the relationship explicit in the graph.

#### Step 3: Add `hasCompanion` flag to `ProcessItemResult`

**File: `src/services/ingestion/processing.ts`**

Add `hasCompanion?: boolean` to `ProcessItemResult`. Set it to `true` when `findCompanionNode()` returns a match.

#### Step 4: Split announcement and yap — skip yap for companions

**File: `src/services/ingestion/notify.ts`**

Split `notifyAnnouncementsThenYap()` into two independent functions:

```typescript
export async function notifyAnnouncement(payload: NotifyPayload): Promise<void>
export async function notifyYapKickoff(payload: NotifyPayload): Promise<void>
```

**File: `src/services/ingestion/index.ts`**

Update the notification call (line 111) to use the split:

```typescript
if (result.status === 'ingested' && !dryRun && result.nodeType) {
  try {
    // Always announce
    await notifyAnnouncement({ ... });

    // Only kick off yap discussion if this isn't a companion to something already discussed
    if (!result.hasCompanion) {
      await notifyYapKickoff({ ... });
    }
  } catch (error) {
    console.warn('[ingestion] Failed to send Discord notifications', error);
  }
}
```

**How timing works:**
- Podcast ingested first → no companion found → announce + yap. Article comes later → companion found (podcast exists) → announce only. Correct.
- Article ingested first → no companion found → announce + yap. Podcast comes later → companion found (article exists) → announce only. Correct.
- Both in same cron run → first one processed has no companion → announce + yap. Second one finds the first → announce only. Correct.

#### Step 5: Backfill existing companion pairs

Write a one-time script `scripts/link-companion-nodes.ts`:
- Query all `article` nodes from `latent.space/p/` links
- For each, run `findCompanionNode()` against `podcast` nodes
- Create edges for confirmed matches
- Log results for manual review

#### Step 6: Fix AINews classification bug

Node 4050 (`[AINews] Gemini 3.1 Pro`) was classified as `article` — ingested before the title-filter fix shipped. Manually reclassify from `article` → `ainews`. Verify the existing filter in `discovery.ts` handles `[AINews]` (capital A).

---

### Part 2: Fix Entity Extraction on Ingestion

**Goal**: Every new node ingested via cron should get entities extracted and edges created. Silent failures must be visible.

#### Step 1: Diagnose the failure

Before writing code, run a test ingestion manually and check:
1. Is `ANTHROPIC_API_KEY` set in the Vercel cron environment?
2. Does `extractEntitiesWithClaude()` succeed when called directly?
3. Is the 55-second cron budget running out before entity extraction completes?

Check Vercel function logs for the `[ingestion] Entity extraction failed` warning message.

#### Step 2: Make failures visible

**File: `src/services/ingestion/processing.ts`**

Currently (line 415-427):
```typescript
try {
  await extractEntitiesForNode({ ... });
} catch (error) {
  console.warn('[ingestion] Entity extraction failed; continuing without entities', error);
}
```

Change to:
- Log the full error (not just warn)
- Add `entity_extraction_status` to the `ProcessItemResult` return value: `'success' | 'failed' | 'skipped'`
- Include the error message in the ingestion run details
- Surface in the ingestion run summary (e.g., "3 ingested, 2 entity extractions failed")

#### Step 3: Decouple entity extraction from cron budget

Entity extraction (Claude API call + node/edge creation) is expensive and runs inside the 55-second cron budget. If the cron processes multiple items, later ones get no entity extraction.

**Option A (simple)**: Run entity extraction as a separate cron job that processes nodes with `edge_count = 0` and `created_at > 24h ago`. A "catch-up" pass.

**Option B (deferred queue)**: After ingestion, mark nodes as `entity_extraction_pending` in metadata. A separate `/api/cron/extract-entities` endpoint processes the queue.

**Recommendation**: Option A is simpler and covers the gap. Add a new cron route:

**File: `app/api/cron/extract-entities/route.ts`** (new)
- Query nodes with 0 edges, created in last 7 days, node_type in (podcast, article, ainews)
- Run `extractEntitiesForNode()` on each (with its own budget)
- Schedule at a different offset than ingestion (e.g., `:30` past the hour)

#### Step 4: Backfill missing entities

Run entity extraction on the ~5 nodes from Feb 22 that have 0 edges:
- Node 4050, 4051, 4066, 4068, 4069
- Can do this via the new cron endpoint or a one-time script

---

### Part 3: Slop-Only Kickoff + Persona Refinement

**Goal**: Strip the discussion kickoff to Slop only. Refine Slop's persona: short, opinionated, unhinged, always links back to original resources, surfaces graph connections. Sig stays available for slash commands but is removed from all automated flows.

**Decision**: Slop-first. This is no longer a question — the decision is made. Sig's auto-responses are disabled. All kickoff energy goes through Slop. Sig comes back later once Slop sets the quality bar.

#### Step 1: Rewrite `typePrompt()` — unified graph-insight prompt

**File: `src/services/ingestion/notify.ts`**

The current per-type prompts (`drop your 1-2 hottest takes`, `give your sharpest summary`, etc.) are generic. Replace with a single prompt that directs Slop to mine the graph for connections:

```typescript
// Before (type-specific, generic):
function typePrompt(nodeType: NodeType): string {
  switch (nodeType) {
    case 'podcast':
      return 'drop your 1-2 hottest takes on this episode';
    case 'article':
      return 'give your sharpest summary + one contrarian angle';
    case 'ainews':
      return "what's the real signal in this update?";
    default:
      return 'what stands out most here?';
  }
}

// After (unified, graph-aware):
function typePrompt(_nodeType: NodeType): string {
  return 'what are the most interesting insights from this? find and reference the most interesting connections from the graph';
}
```

This gives Slop a clear job: dig into the graph, surface connections, reference specific content.

#### Step 2: Update `buildYapContent()` — Slop-only mention + new tone

**File: `src/services/ingestion/notify.ts`**

Two changes: remove Sig from mentions, and rewrite the closing instruction.

```typescript
// Before:
const sigId = process.env.DISCORD_SIG_USER_ID;
const slopId = process.env.DISCORD_SLOP_USER_ID;
const mentions = [sigId ? `<@${sigId}>` : '@Sig', slopId ? `<@${slopId}>` : '@Slop'].join(' ');
// ...
lines.push('', `${mentions} ${typePrompt(payload.nodeType)}. keep it brief so people can jump in.`);

// After:
const slopId = process.env.DISCORD_SLOP_USER_ID;
const mention = slopId ? `<@${slopId}>` : '@Slop';
// ...
lines.push('', `${mention} ${typePrompt(payload.nodeType)}. keep it short.`);
```

The message posted to #yap will now read like:

```
🧠 Discussion Kickoff

**The Future of AI Agents — with Harrison Chase**
Published: 2026-02-23 | 15 chunks indexed
https://youtu.be/...

@Slop what are the most interesting insights from this? find and reference the most interesting connections from the graph. keep it short.
```

#### Step 3: Clean up `DISCORD_SIG_USER_ID` from kickoff path

**File: `.env.example`**

`DISCORD_SIG_USER_ID` is no longer needed for the kickoff flow. Keep it documented (Sig still works for slash commands in `latent-space-bots`) but add a comment clarifying it's not used for automated kickoff:

```env
# Bot user IDs
# DISCORD_SIG_USER_ID is not used for automated kickoff (Slop-only) — kept for slash commands in latent-space-bots
DISCORD_SIG_USER_ID=123456789012345678
DISCORD_SLOP_USER_ID=123456789012345678
```

#### Step 4: Update bot guides (this repo)

**File: `src/config/guides/bots.md`**

Update "The Feed" section to reflect Slop-only kickoff:

```markdown
## The Feed

When new content is ingested, a kickoff message drops in #yap tagging Slop.
Slop digs into the graph, surfaces the most interesting connections and insights,
and links back to the original sources. Community jumps in from there.
```

Remove references to "Sig posts an analysis" from the kickoff flow. Sig's section stays (it still works for slash commands) but the automated feed is Slop's domain.

**File: `docs/bots.md`**

Same update — "The Feed" section should reflect Slop-only automated kickoff.

#### Step 5: Slop persona refinement (for `latent-space-bots` repo)

These changes happen in the separate `latent-space-bots` repo but are specified here as the requirements:

**Update `personas/slop.soul.md` with these directives:**

1. **Short and concise** — no essays. 2-4 sentences max per point. Get in, say something sharp, get out.

2. **Always reference and link original resources** — every claim must link back to the source. "Harrison Chase literally said [X] in [this episode](url)" not "someone mentioned agents once." Direct URLs, episode titles, dates.

3. **Opinionated and unhinged** — bold takes, no hedging. "This is obviously wrong because..." not "one could argue that perhaps..." Slop has opinions and isn't afraid of them. Provocative, irreverent, occasionally chaotic.

4. **Graph connections are the value** — Slop's unique power is connecting dots across the knowledge base. "This contradicts what [person] said in [episode] three months ago" or "Funny how [company] keeps getting mentioned in AINews but none of the podcast guests take them seriously." The graph IS the insight engine.

5. **No filler, no preamble** — don't start with "Great question!" or "Interesting topic!" Jump straight into the take.

**Example Slop kickoff response:**

> ok so Harrison Chase is basically admitting LangChain peaked — he said "we're rebuilding everything" which is EXACTLY what [Karpathy predicted in ep 47](https://youtu.be/...) back in January. meanwhile [this AINews from last week](https://latent.space/p/...) has 3 other agent frameworks launching. the agents war is real and LangChain is playing catch-up. thoughts?

**Action items for `latent-space-bots` repo:**
- [ ] Disable Sig's auto-responses to kickoff mentions (keep slash commands active)
- [ ] Rewrite `personas/slop.soul.md` with the 5 directives above
- [ ] Add system prompt instruction: "Keep responses under 280 characters when possible, never exceed 500 characters for kickoff responses"
- [ ] Add system prompt instruction: "Always include direct URLs to sources referenced"
- [ ] Add system prompt instruction: "Search the graph for contradictions, patterns, and recurring themes before responding"
- [ ] Test Slop responses against 5 recent podcast episodes for quality + personality
- [ ] Verify Slop correctly surfaces graph edges (not just top search results)

---

### Part 4: Dashboard Stats — Node Type Breakdown

**Goal**: Replace the flat "Nodes / Edges / Chunks / Content" stats bar with a layout that prioritizes a per-type breakdown of nodes. Keep the aggregate totals, but make the type distribution the hero.

#### Current State

The dashboard stats bar (`Dashboard.tsx:100-144`) shows 4 equal cards:

```
[ Nodes: 4,200 ] [ Edges: 12,500 ] [ Chunks: 85,000 ] [ Content: 3,800 ]
```

This tells you nothing about what's in the graph. You have to scroll down to the category cards to see the breakdown.

Meanwhile, the API already queries per-category counts (`/api/dashboard/route.ts:44-106`) for the category cards below. The data is there — just not surfaced at the top.

#### Design

Replace the current 4-card stats bar with a two-row layout:

**Row 1: Node type breakdown** (the hero)

A compact row of type pills showing the count per node type, using the existing category icons and labels from `categories.ts`. Each pill is clickable (navigates to that category view).

```
🎙️ Podcast 142  |  👤 Guest 89  |  📝 Article 67  |  🏢 Entity 312  |  🛠️ Builders Club 24  |  📄 Paper Club 18  |  📺 Workshop 31  |  📰 AI News 52
```

Visual treatment:
- Horizontal row, wraps if needed
- Each pill: icon + label + count
- Muted background, slightly more prominent than current stat cards
- Clickable — same `onCategoryClick` handler used by the category cards below
- Uses the existing `CATEGORIES` config for order, icons, and labels

**Row 2: Aggregate totals** (secondary, compact)

The existing totals (nodes, edges, chunks, content) stay, but smaller and secondary. They become a subtle summary line below the type breakdown:

```
4,200 nodes  ·  12,500 edges  ·  85,000 chunks  ·  3,800 content
```

Visual treatment:
- Single line, inline text with dot separators
- Smaller font (11-12px), muted color (#555)
- No individual cards — just a text line

#### Implementation

**File: `src/components/dashboard/Dashboard.tsx`**

1. Add `type_counts` to `DashboardData.stats`:

```typescript
interface DashboardData {
  stats: {
    total_nodes: number;
    total_edges: number;
    total_chunks: number;
    total_content: number;
    type_counts: Array<{ key: string; label: string; count: number }>;
  };
  categories: CategoryData[];
}
```

2. Replace the stats bar (lines 120-144) with two sections:

**Type breakdown row**: Map over `stats.type_counts`, render clickable pills with icon + label + count. Pull icon from `CATEGORY_MAP[key].icon`.

**Aggregate summary line**: Render totals as inline text: `{nodes} nodes · {edges} edges · {chunks} chunks · {content} content`.

3. Update skeleton loading to match new layout (wider row instead of 4 cards).

**File: `app/api/dashboard/route.ts`**

Add `type_counts` to the stats response. This data is already being queried per-category (lines 44-106) — just extract the counts and include them in `stats`:

```typescript
const stats = {
  total_nodes: Number(nodesResult.rows[0]?.cnt ?? 0),
  total_edges: Number(edgesResult.rows[0]?.cnt ?? 0),
  total_chunks: Number(chunksResult.rows[0]?.cnt ?? 0),
  total_content: Number(contentResult.rows[0]?.cnt ?? 0),
  type_counts: categories.map(c => ({ key: c.key, label: c.label, count: c.count })),
};
```

No new database queries needed — the category counts are already fetched.

---

## Done =

- [x] Companion detection: `findCompanionNode()` detects podcast/article pairs at ingestion
- [x] Companion edge: detected pairs get linked with an explicit edge
- [x] Single kickoff: `notifyAnnouncementsThenYap()` split — announcements always fire, yap skipped for companions
- [x] Backfill script links existing podcast/article pairs
- [ ] Node 4050 reclassified from `article` → `ainews` *(requires manual DB update on Turso)*
- [x] Entity extraction failures are visible in ingestion run details
- [x] Separate entity extraction cron catches nodes that missed extraction
- [ ] Backfill: all recently-ingested nodes with 0 edges get entity extraction *(run via new cron endpoint or `scripts/extract-entities.ts`)*
- [x] Bot: `typePrompt()` rewritten to unified graph-insight prompt
- [x] Bot: `buildYapContent()` updated to Slop-only mention
- [x] Bot: `.env.example` updated with `DISCORD_SLOP_USER_ID` and Sig note
- [x] Bot: `src/config/guides/bots.md` updated — feed section reflects Slop-only kickoff
- [x] Bot: `docs/bots.md` updated — feed section reflects Slop-only kickoff
- [x] Bot: Slop persona requirements documented for `latent-space-bots` repo *(in PRD Part 3 Step 5)*
- [x] Dashboard: Stats bar replaced with type breakdown row + compact aggregate line
- [x] Dashboard: API returns `type_counts` in stats response
- [x] Dashboard: Type pills clickable, navigate to category view

---

## COMPLETED
**Date:** 2026-02-23
**What was delivered:**

### Part 1: Companion Detection
- `findCompanionNode()` with title-similarity matching (word overlap ≥ 50%) in `processing.ts`
- Automatic companion edge creation (`article → podcast`) at ingestion time
- `hasCompanion` flag on `ProcessItemResult` to skip duplicate yap kickoffs
- `notifyAnnouncementsThenYap()` split into `notifyAnnouncement()` + `notifyYapKickoff()` — announcements always fire, yap skipped for companions
- Backfill script: `scripts/link-companion-nodes.ts` (run with `npx tsx scripts/link-companion-nodes.ts`)
- AINews title filter verified working (lowercase check at discovery.ts:93-94); node 4050 needs manual DB reclassification

### Part 2: Entity Extraction
- Entity extraction now logs full errors (not just warnings) and tracks `entityExtractionStatus` + `entityExtractionError` on each run detail
- New cron endpoint: `app/api/cron/extract-entities/route.ts` — runs at :30 past the hour, picks up nodes with 0 edges created in last 7 days
- Added to `vercel.json` cron schedule

### Part 3: Slop-Only Kickoff
- `typePrompt()` rewritten to unified graph-insight prompt
- `buildYapContent()` now Slop-only (removed Sig mention)
- `.env.example` updated with `DISCORD_SLOP_USER_ID` and comment explaining Sig is not used for automated kickoff
- Bot guides updated in both `src/config/guides/bots.md` and `docs/bots.md`
- Slop persona requirements documented in PRD for `latent-space-bots` repo implementation

### Part 4: Dashboard Stats
- Stats bar replaced with clickable type cards in a 4-column grid (icon + large count + label per category)
- Cards use the same visual treatment as the category cards below (dark background, border, rounded corners, hover state)
- Compact aggregate summary line below the cards (nodes · edges · chunks · content)
- API returns `type_counts` array in stats response (no new DB queries — reuses category counts)
- Skeleton loading state updated to match 4-column card grid

### Manual follow-ups
- Run `scripts/link-companion-nodes.ts` to backfill existing companion pairs
- Run entity extraction cron or `scripts/extract-entities.ts` to backfill nodes 4050-4069
- Manually reclassify node 4050 from `article` → `ainews` in Turso
- Implement Slop persona changes in `latent-space-bots` repo (see PRD Part 3 Step 5)
