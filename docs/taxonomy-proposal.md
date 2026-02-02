# Latent Space Hub: Taxonomy Proposal

**Date:** February 2, 2026
**Status:** Draft for Review

---

## Current State

The database currently has **8 dimensions** with 253 nodes:

| Dimension | Nodes | Issue |
|-----------|-------|-------|
| AIE Videos | 58 | Mixes content type with source |
| LS Guest | 35 | Entity type, not content category |
| LS Pod | 35 | Content type |
| AI News | 31 | Content type |
| AIE Code Summit 2025 | 29 | Event, not category |
| insight | 29 | Derived content type |
| AIE World's Fair 2025 | 26 | Event, not category |
| LS Articles | 10 | Content type |

**Problems:**
1. Conflates content FORMAT (podcast, article, video) with EVENT (Code Summit, World's Fair)
2. No thematic/topic organization (agents, benchmarks, models)
3. Guests are dimensions rather than node entities with edges
4. No temporal organization beyond created_at

---

## Proposed Taxonomy: Three-Axis System

### Axis 1: Source/Format (What is it?)

These describe the **content type** — what format the content takes:

| Dimension | Description |
|-----------|-------------|
| `podcast` | LS Pod audio episodes with guests |
| `article` | Written essays, deep dives on Substack |
| `video` | Conference talks, workshops, presentations |
| `news` | AI News daily briefings (smol.ai) |
| `paper` | Academic papers, tech reports, research |
| `insight` | Extracted key ideas from other content |

### Axis 2: Event/Series (Where/When?)

These describe the **production context** — where content originated:

| Dimension | Description |
|-----------|-------------|
| `AIE World's Fair 2025` | January 2025 conference talks |
| `AIE Code Summit 2025` | November 2025 summit talks |
| `AIE Summit NYC 2025` | February 2025 NYC event |
| `Paper Club` | Weekly paper discussions |
| `Builders Club` | Builder community sessions |
| `Meetup` | SF and other local meetups |

### Axis 3: Theme/Topic (What's it about?)

Based on the [2025 AI Engineering Reading List](https://www.latent.space/p/2025-papers) categories:

| Dimension | Description |
|-----------|-------------|
| `frontier-models` | GPT, Claude, Gemini, Llama, DeepSeek releases |
| `benchmarks` | MMLU, GPQA, SWE-Bench, evals methodology |
| `prompting` | CoT, DSPy, prompt engineering |
| `rag` | Retrieval, embeddings, vector search |
| `agents` | Autonomy, tool use, MCP, orchestration |
| `codegen` | Code models, SWE agents, dev tools |
| `vision` | CLIP, SAM, multimodal |
| `voice` | Speech, TTS, realtime audio |
| `diffusion` | Image/video generation, Flux, Sora |
| `finetuning` | LoRA, RLHF, DPO, training |
| `infrastructure` | Compute, inference, serving |
| `business` | Startups, funding, strategy |

---

## Entity Types (Node Types, not Dimensions)

These should be `node.type` values, not dimensions:

| Type | Description |
|------|-------------|
| `person` | Guests, speakers, researchers |
| `company` | Organizations, labs, startups |
| `paper` | Academic papers, tech reports |
| `episode` | Podcast episodes |
| `talk` | Conference presentations |
| `article` | Written content |
| `news` | News briefings |
| `insight` | Extracted ideas |

**Relationships via edges:**
- Episode → `features` → Person
- Talk → `created_by` → Person
- Person → `works_at` → Company
- Insight → `source_of` → Episode

---

## Migration Strategy

### Phase 1: Normalize Existing Dimensions

```
Current → New Mapping
─────────────────────
AIE Videos → video + (event dimension)
LS Pod → podcast
LS Articles → article
AI News → news
AIE Code Summit 2025 → video + AIE Code Summit 2025
AIE World's Fair 2025 → video + AIE World's Fair 2025
LS Guest → Convert to node.type = 'person'
insight → insight (keep)
```

### Phase 2: Add Theme Dimensions

For each content node, add 1-3 theme dimensions:
- MCP talks → `agents`, `infrastructure`
- Kimi K2.5 news → `frontier-models`, `benchmarks`
- DSPy workshop → `prompting`, `agents`

### Phase 3: Create Entity Nodes

Convert guest references to proper nodes:
1. Create `person` nodes for each guest
2. Create `company` nodes for affiliations
3. Create edges: `episode → features → person`
4. Create edges: `person → works_at → company`

---

## Example: Fully Tagged Node

**Node:** "MCP: Origins and Requests For Startups — Theodora Chu"

| Field | Value |
|-------|-------|
| `type` | `talk` |
| **Dimensions:** | |
| Format | `video` |
| Event | `AIE World's Fair 2025` |
| Themes | `agents`, `infrastructure` |
| **Edges:** | |
| `features` → | Theodora Chu (person) |
| `features` → | Anthropic (company) |

---

## Paper Club: This Week

**February 4, 2026 — 12:00 PM PT**

Papers to discuss:
1. **Kimi K2.5 Tech Report** — Moonshot's latest model beating Sonnet 4.5
2. **Alec Radford on Data Filtering** — Data quality for pretraining

**Action:** Add these papers to the database with:
- `type: paper`
- Dimensions: `paper`, `Paper Club`, `frontier-models`

---

## Recommended Dimension Structure

### Priority Dimensions (locked, always apply)

```
Format: podcast | article | video | news | paper | insight
```

### Event Dimensions (apply when relevant)

```
AIE World's Fair 2025
AIE Code Summit 2025
AIE Summit NYC 2025
Paper Club
```

### Theme Dimensions (1-3 per node)

```
frontier-models    benchmarks      prompting
rag               agents          codegen
vision            voice           diffusion
finetuning        infrastructure  business
```

---

## Open Questions

1. **Granularity of events:** Should we have one `AIE` dimension or separate per-event?
2. **News handling:** AI News items are very short — worth indexing individually or batch by week?
3. **Paper Club papers:** Create paper nodes or just reference in episode content?
4. **Insight ownership:** Should insights link to source via edge or just dimension?

---

## Next Steps

1. [ ] Review and approve taxonomy structure
2. [ ] Write migration script for dimension normalization
3. [ ] Add theme classification to ingestion pipeline
4. [ ] Create person/company nodes for existing guests
5. [ ] Add Feb 4 paper club papers to database
