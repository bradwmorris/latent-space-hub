# PRD 08: Storylines / Narrative Arcs

## Background

The BBC's knowledge graph architecture separates three layers: **content** (what you publish), **domain entities** (people, orgs, topics), and **storylines** (temporal narrative arcs that evolve over time). The storyline layer is what makes their system powerful for editorial workflows — it connects content to real-world developments and enables questions like "what have we covered about X over time?"

This is distinct from topics. A topic is static ("AI agents"). A storyline is temporal and evolving ("the rise of AI agents from AutoGPT to Claude Code — how the narrative shifted from hype to production tooling over 18 months").

### Reference architecture

**BBC Storyline Ontology:** Storylines have slots/components that are temporally ordered. Each slot connects to creative works (episodes), domain entities (people, orgs), and events. Storylines can contain sub-storylines.

**Graphiti/Zep temporal model:** Dual timestamps on edges — event time (when a fact actually occurred) vs. ingestion time (when recorded). Enables "what did we know as of date X?" queries.

**Sources:**
- [BBC Storyline Ontology](https://iptc.org/thirdparty/bbc-ontologies/storyline.html)
- [Storylines as Data in BBC News](https://medium.com/@jeremytarling/storylines-as-data-in-bbc-news-bd92c25cba6b)
- [Graphiti temporal KG paper](https://arxiv.org/html/2501.13956v1)

## Concept

A storyline is a `node_type = 'storyline'` entity that tracks a narrative arc across multiple episodes, guests, claims, and events over time.

### Example storylines for Latent Space

- "The scaling laws debate" — connects episodes with Ilya, Sholto, Noam Shazeer, etc.
- "Open vs closed source AI" — Llama releases, Mistral, DeepSeek, each episode adds a chapter
- "The rise of AI coding agents" — Cursor, Copilot, Claude Code, Devin, each appearance advances the arc
- "MCP and the tool-use standard" — from announcement through adoption, guest perspectives

### What a storyline enables

- **Editorial planning:** "We last covered the scaling debate 3 months ago — what's changed? Who should we invite?"
- **Bot answers:** "Trace the arc of open-source AI across our episodes" → returns a temporal narrative
- **Content assembly:** Auto-generate "everything we've said about X" pages from the graph

## Sketch (not final — revisit when implementing)

**Storyline metadata:**
```json
{
  "node_type": "storyline",
  "metadata": {
    "status": "active",           // active | dormant | concluded
    "started": "2024-03-15",      // when the arc began
    "last_updated": "2025-11-20", // last episode/event that advanced it
    "summary": "...",             // current state of the narrative
    "chapters": [                 // ordered temporal slots
      { "date": "2024-03-15", "node_id": 142, "description": "First coverage..." },
      { "date": "2024-07-22", "node_id": 287, "description": "Major shift when..." }
    ]
  }
}
```

**Edge types for storylines:**
- `Episode → advances → Storyline` — this episode moves the narrative forward
- `Person → central_to → Storyline` — key figure in this arc
- `Claim → part_of → Storyline` — specific assertion within the narrative
- `Storyline → subsumes → Storyline` — narrative contains sub-narratives

**Temporal edge metadata (Graphiti pattern):**
- `valid_from` / `valid_until` on edges — when a relationship holds
- Enables: "Who was affiliated with OpenAI during the board crisis?" (time-scoped query)

## Depends on

- PRD-02 (typed entity model with `node_type`)
- PRD-05 (content ingestion — need episodes and entities populated first)
- PRD-07 (MCP server — storyline tools need to be exposed)

## Status

**Future** — not needed for v1. Revisit after the core graph is populated and the bot is live. The `node_type` model from PRD-02 means storylines can be added without schema changes — just a new type value and new edge conventions.

## Done =

- Storyline node_type defined with metadata schema
- Edge types for storyline relationships added
- Temporal edge metadata (valid_from/valid_until) on edges
- Bot can answer "trace the arc of X across our episodes"
- Editorial team can see storyline timelines in UI
- Auto-detection of emerging storylines from new content
