# PRD 15: Hub Node Architecture

## Status: Ready

---

## Background

The Latent Space Hub knowledge graph has 3,807 nodes across 8 node types, but no structural anchor nodes representing the core Latent Space properties themselves. Individual episodes, articles, and meetup recordings exist — but there's no node for "the Latent Space Podcast" as a thing you can navigate to and explore outward from.

This PRD creates **5 hub nodes** — one for each major Latent Space property — and connects them via edges to every content node in their category. These become the most highly-connected nodes in the graph, serving as natural navigation anchors.

**This is NOT the "hub nodes as graph infrastructure" concept rejected in PRD-10 Phase 0.** That was about using `node_type = 'hub'` as a structural mechanism for grouping. This is about creating real, meaningful nodes for real things (the podcast, the newsletter, the community programs) that happen to become hubs through their edge count.

### Why this matters

- **Navigation:** Users can find "Latent Space Podcast" and see every episode radiating from it
- **Bot grounding:** Discord bots can reference the hub node to understand what the podcast IS
- **Graph density:** Currently the most-connected node is OpenAI (205 edges). These 5 hub nodes will each have 24–247 edges, making them top-tier navigation points
- **Identity:** The graph should know what Latent Space is — not just contain its content

### Current state

| Property | Existing Node? | ID | Edges | Content Nodes |
|---|---|---|---|---|
| Latent Space Podcast | No (586 is the guest prompt article) | — | — | 247 (`podcast`) |
| Latent Space Articles/Substack | Duplicate entities | 2074 (18 edges), 2334 (1 edge) | 19 total | 71 (`article`) |
| Builders Club | No | — | — | 24 (`builders-club`) |
| Writers Club | No node, no dimension, no node_type | — | — | 1 related (363) |
| AI News | Entity node (empty) | 2218 | 2 | 136 (`ainews`) |

### Dimension fragmentation (cleanup opportunity)

| Dimension | Nodes | Issue |
|---|---|---|
| `latent-space-podcast` | 182 | Primary — keep |
| `podcast` | 36 | Overlaps with `latent-space-podcast` |
| `LS Pod` | 35 | Overlaps with `latent-space-podcast` |
| `article` | 86 | Primary — keep |
| `LS Articles` | 10 | Overlaps with `article` |
| `meetup` | 74 | Used for builders-club content |
| `Builders Club` | 0 | Empty — created but never used |
| `ainews` | 121 | Primary — keep |
| `AI News` | 0 | Empty — created but never used |

---

## Plan

### Phase 1: Create / Update Hub Nodes (5 nodes)

For each hub node: create or update the node with a rich description, detailed notes, correct metadata, appropriate dimensions, and `node_type = 'entity'` (these are real things, not content).

**Important:** Node 2334 ("Latent Space" duplicate) must be merged into 2074 first — redirect its 1 edge, then delete 2334.

#### 1. Latent Space Podcast

**Action:** Create new node

```
Title: Latent Space Podcast
node_type: entity
link: https://www.latent.space/podcast
dimensions: [latent-space-podcast]

Description: Top-10 US technology podcast hosted by swyx (Shawn Wang) and Alessio Rinaldi,
covering AI engineering for software engineers building with LLMs. Running since June 2023,
with 247+ episodes featuring guests from every major AI lab and startup.

Notes:
- Hosted by swyx and Alessio Rinaldi — technical but not ML researchers, targeting the
  "AI Engineer" audience (software engineers building with LLMs)
- Format: long-form technical interviews (60-120 min), conversational tone, focused on
  nitty-gritty details — hyperparameters, infrastructure, dead-ends, scaling stories
- First episode: June 2023 (Ep 18: "Petaflops to the People" with George Hotz)
- Available as audio podcast and YouTube video; professionally edited with guest review
- Part of the broader Latent Space ecosystem: newsletter (Substack), Discord community,
  Builders Club meetups, Paper Club, and AI Engineer conference
- Guest prompt explicitly asks for: specific examples over generalizations, money/infra
  figures, predictions, passionate rants, and underrated contributors
- Virtually every major AI lab and startup has appeared on the show
```

#### 2. Latent Space (Articles & Substack)

**Action:** Update existing node 2074 (merge 2334 into it first)

```
Node ID: 2074
Title: Latent Space (Newsletter & Blog)
node_type: entity
link: https://www.latent.space
dimensions: [article]

Description: Latent Space Substack newsletter and blog by swyx and Alessio Rinaldi —
the written arm of the Latent Space ecosystem, publishing long-form technical articles,
essay series, and event recaps for AI engineers. Running since 2023.

Notes:
- Published on Substack at latent.space — covers AI engineering topics in depth
- Includes original essays (e.g., "The Rise of the AI Engineer"), conference recaps,
  reading lists, and companion pieces to podcast episodes
- Part of the Latent Space ecosystem alongside the podcast, Discord, Builders Club,
  and AI Engineer conference
- Notable articles: "The Rise of the AI Engineer" (June 2023), "2024 in Agents",
  "How to Run a Paper Club"
- 71 articles currently in the knowledge graph (Jan 2023 – present)
```

#### 3. Latent Space Builders Club

**Action:** Create new node

```
Title: Latent Space Builders Club
node_type: entity
link: https://www.latent.space/p/builders-club
dimensions: [meetup]

Description: Latent Space community meetup program where AI engineers demo projects,
share workflows, and present live builds. Includes the "AI in Action" series and
specialized formats like the Dev Writers Meetup. Running since April 2024.

Notes:
- Regular virtual meetups organized by the Latent Space community on Discord
- "AI in Action" is the primary format — members demo real projects and tools they've
  built (Cursor workflows, n8n automations, agent frameworks, hardware projects)
- Also includes specialized formats: Dev Writers Meetup, year-end hangouts, SF in-person meetups
- Sessions are recorded on YouTube and ingested into the knowledge graph
- First recorded session: April 2024 ("Personal AI Meetup")
- 24 sessions currently in the knowledge graph
- Distinct from Paper Club (which focuses on reading and discussing academic papers)
```

#### 4. Latent Space Writers Club

**Action:** Create new node

```
Title: Latent Space Writers Club
node_type: entity
dimensions: [meetup]

Description: Latent Space community program for technical writers in AI engineering.
A sub-program of the Builders Club focused on the craft of technical writing, featuring
talks and workshops on writing about AI.

Notes:
- Sub-program within the Latent Space Builders Club community
- Also called "Dev Writers Meetup" — focused on technical writing craft for AI engineers
- Known session: "Why I Write" with Drew Breunig (Jan 2026)
- Part of the broader Latent Space community ecosystem
- Newer and smaller than the Builders Club — fewer recorded sessions
```

#### 5. AI News (by swyx)

**Action:** Update existing node 2218

```
Node ID: 2218
Title: AI News (by swyx)
node_type: entity
link: https://buttondown.com/ainews
dimensions: [ainews]

Description: Daily AI news digest curated by swyx, covering the most important
developments in AI with editorial commentary. Published since January 2025,
with 136+ editions tracking everything from model releases to industry shifts.

Notes:
- Daily curated digest of the most important AI news — not just links, but editorial
  context and commentary from swyx
- Covers model releases, benchmark results, open-source developments, industry moves,
  funding, and community drama
- Published via Buttondown newsletter; also shared in the Latent Space Discord
- Titles follow the pattern "[AINews] Topic" — e.g., "[AINews] Claude Sonnet 4.6"
- First edition in graph: Jan 7, 2025 ("[AINews] PRIME: Process Reinforcement through
  Implicit Rewards")
- 136 editions currently in the knowledge graph
- Part of the Latent Space ecosystem but distinct from the main Substack newsletter
```

---

### Phase 2: Merge Duplicate & Clean Up

Before creating edges, clean up the graph:

1. **Merge node 2334 into 2074:** Redirect 2334's 1 edge (edge 3812, from node 371) to point to 2074 instead. Delete node 2334.
2. **Delete empty dimensions:** `Builders Club` (0 nodes), `AI News` (0 nodes) — these were created but never used; the actual content uses `meetup` and `ainews`.
3. **Consolidate podcast dimensions:** Consider merging `LS Pod` (35) and `podcast` (36) into `latent-space-podcast` (182) — but this is optional and can be deferred to a separate dimension cleanup pass.

---

### Phase 3: Create Hub Edges

Connect each hub node to ALL content nodes in its category. Use the `node_type` field to identify targets — this is the canonical grouping.

#### Edge format

All edges should read as: **hub node → [explanation] → content node**

The hub node is the `from_node_id` (source). The explanation should be a natural sentence fragment.

| Hub Node | Target `node_type` | Target Count | Edge Explanation Pattern |
|---|---|---|---|
| Latent Space Podcast | `podcast` | 247 | `"is the parent series of"` |
| Latent Space (Newsletter & Blog) | `article` | 71 | `"published this article"` |
| Latent Space Builders Club | `builders-club` | 24 | `"hosted this meetup session"` |
| Latent Space Writers Club | (node 363 only) | 1 | `"hosted this meetup session"` |
| AI News (by swyx) | `ainews` | 136 | `"is the parent series of"` |

**Total new edges: ~479** (247 + 71 + 24 + 1 + 136)

#### Execution method

Use `ls_sqlite_query` to get all node IDs per type, then `ls_create_edge` for each. Run in batches via parallel Claude Code subagents (10 edges per call, 5 subagents).

```sql
-- Get all podcast node IDs
SELECT id FROM nodes WHERE node_type = 'podcast' ORDER BY event_date ASC;

-- Get all article node IDs
SELECT id FROM nodes WHERE node_type = 'article' ORDER BY event_date ASC;

-- Get all builders-club node IDs
SELECT id FROM nodes WHERE node_type = 'builders-club' ORDER BY event_date ASC;

-- Get all ainews node IDs
SELECT id FROM nodes WHERE node_type = 'ainews' ORDER BY event_date ASC;
```

#### Writers Club special case

The Writers Club hub node only connects to node 363 ("Why I Write: Drew Breunig"). It should ALSO get an edge to the Builders Club hub node:

```
Writers Club → "is a sub-program of" → Builders Club
```

#### Cross-hub edges

After content edges, create edges between the hub nodes themselves to represent the Latent Space ecosystem:

```
Latent Space Podcast → "is part of the same ecosystem as" → Latent Space (Newsletter & Blog)
Latent Space Podcast → "is part of the same ecosystem as" → Latent Space Builders Club
Latent Space (Newsletter & Blog) → "is part of the same ecosystem as" → AI News (by swyx)
Latent Space Builders Club → "is part of the same ecosystem as" → Latent Space Writers Club
```

---

### Phase 4: Verify

1. **Edge counts:** Query each hub node's edge count — should match target counts
2. **No orphans:** Verify every `podcast`, `article`, `builders-club`, and `ainews` node has an edge to its hub
3. **No duplicates:** Verify node 2334 is deleted, no duplicate edges exist
4. **Graph stats:** Run `ls_get_context` — total edges should increase by ~483 (479 content + 4 cross-hub)
5. **Most connected:** Hub nodes should appear in the top-15 most-connected nodes

Expected post-execution rankings:
| Node | Edge Count (approx) |
|---|---|
| Latent Space Podcast | ~247 |
| OpenAI (existing) | 205 |
| AI News (by swyx) | ~138 |
| Anthropic (existing) | 89 |
| Latent Space (Newsletter & Blog) | ~90 (71 new + 18 existing + 1 cross-hub) |
| Google (existing) | 64 |
| Latent Space Builders Club | ~28 |

---

### Phase 5: Storyline Carryover (from PRD-08)

Absorb the useful storyline scope directly into hub-node execution so narrative arcs are not a separate backlog track.

1. Add narrative timeline notes to each hub node (`metadata.timeline_summary`, `metadata.last_narrative_update`).
2. Add edge-level temporal context for major arc links where dates are known (`valid_from`, optional `valid_until` in edge metadata payload).
3. Create a small set of seeded cross-content narrative edges tied to hub clusters:
   - `podcast/article/ainews node -> "advances the arc of" -> relevant hub`
   - Use this only for high-signal arcs (scaling, open-vs-closed, coding agents, MCP adoption).
4. Keep `node_type='storyline'` deferred. Narrative value ships through hub-linked edges first.

This keeps execution grounded and avoids launching a separate storyline schema/UI project before the core hub layer is done.

---

## Done =

- [ ] 5 hub nodes exist with rich descriptions, notes, links, and dimensions
- [ ] Node 2334 (duplicate "Latent Space") merged into 2074 and deleted
- [ ] 247 edges: Latent Space Podcast → all podcast nodes
- [ ] 71 edges: Latent Space (Newsletter & Blog) → all article nodes
- [ ] 24 edges: Latent Space Builders Club → all builders-club nodes
- [ ] 1 edge: Latent Space Writers Club → node 363
- [ ] 136 edges: AI News (by swyx) → all ainews nodes
- [ ] 4 cross-hub edges connecting the ecosystem
- [ ] 1 edge: Writers Club → "is a sub-program of" → Builders Club
- [ ] Empty dimensions (`Builders Club`, `AI News`) deleted
- [ ] Hub metadata includes timeline summary fields for narrative carryover
- [ ] Seeded narrative edges added for high-signal arcs on hub-linked content
- [ ] Verification: all hub nodes appear in top-20 most-connected nodes
- [ ] Verification: zero content nodes in target types lack a hub edge
