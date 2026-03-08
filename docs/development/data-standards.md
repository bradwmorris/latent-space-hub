# Data Standards — Latent Space Hub

> The definitive guide for how data should look in every column, for every node type.
> Primary consumer: Discord bot + AI agents serving the LS community.

---

## Design Principles

1. **AI-first** — Every field is written so an LLM can read it and immediately understand what this node IS and why it matters.
2. **LS-centric** — Node types map to Latent Space offerings. This is the LS Wiki-Base, not a general AI wiki.
3. **Dense, not verbose** — Descriptions are 1-2 sentences. Notes are bullet points. No filler ("This is a video discussing...").
4. **Opinionated** — Notes capture the actual takes and insights, not neutral summaries.

---

## Node Types (8)

| node_type | What it represents | Example |
|-----------|-------------------|---------|
| `podcast` | Latent Space podcast episode | "Captaining IMO Gold... — Yi Tay 2" |
| `ainews` | AI News digest edition | "[AINews] ChatGPT Codex, OpenAI's first cloud SWE agent" |
| `article` | Written content on latent.space | "Agent Engineering" |
| `builders-club` | Builders Club session | "Builders Club #12: MCP Deep Dive" |
| `paper-club` | Paper Club session | "Paper Club: Attention Is All You Need revisited" |
| `workshop` | Hands-on workshop session | "Workshop: Building with Claude Code" |
| `guest` | Person who appeared on LS content | "Yi Tay" |
| `entity` | Org, topic, tool, concept, or mentioned person | "Anthropic", "reinforcement learning", "LangChain" |

---

## Column Standards — All Types

### `title`
- **Max length:** ~120 chars
- **No prefixes** like "By Latent Space —"
- **People:** Real full name, not Twitter handles. "Omar Santos" not "Omarsar0"
- **Podcasts:** Keep the original episode title as-is (they're already good)
- **AI News:** Keep the `[AINews]` prefix — it's the brand

### `description`
- **1-2 sentences. Factual. Information-dense.**
- Answers: "What is this and why does it matter?"
- **CRITICAL: Must explicitly state what the thing IS.** The description is often read without the node_type field. An LLM must be able to identify the content type from the description alone.
  - Podcast → "Latent Space podcast episode featuring..."
  - Article → "Latent Space article exploring..."
  - AI News → "AI News edition covering..."
  - Paper Club → "LS Paper Club session discussing..."
  - Builders Club → "LS Builders Club session on..."
  - Workshop → "LS workshop on..."
  - Guest → "AI researcher at..." / "Co-founder of..."
  - Entity → "AI safety lab that..." / "ML technique for..."
- **Never start with** "This is a video..." / "This article discusses..." / "By Latent Space —"
- Written as if you're telling a colleague what this is in 10 seconds

### `notes`
- **Bullet points. Key takeaways. Opinionated.**
- For content (podcast/article/ainews): the actual insights, arguments, and conclusions
- For guests: career context, what they're known for, their key positions
- For entities: what it is, why it matters to AI engineers, key facts
- **Never a wall of text** — always structured bullets

### `event_date`
- **ISO 8601 format:** `YYYY-MM-DD`
- Required for: podcast, ainews, article, builders-club, paper-club, workshop
- Source: metadata.publish_date, YouTube upload date, or article date
- Optional for: guest, entity

### `link`
- Primary URL (YouTube link, article URL, etc.)
- Required for: podcast, ainews, article
- Optional for: everything else

### `metadata` (JSON)
- Varies by type — see type-specific sections below
- Must be valid JSON
- No dumping entire article text into metadata

### `node_type`
- One of the 8 values above. **Never NULL.**

---

## Type-Specific Standards

### `podcast`

The flagship LS content. Each episode gets full treatment.

**description** — Must explicitly say "Latent Space podcast episode" + what it covers + who's on it.
```
GOOD: "Latent Space podcast episode featuring Yi Tay on his move to DeepMind Singapore,
       why on-policy RL is the key to reasoning breakthroughs like Gemini Deep Think's
       IMO gold, and career advice for AI researchers."

BAD:  "Yi Tay returns to discuss his move to DeepMind Singapore..."
       ↑ Doesn't say what this IS. An LLM has no idea it's a podcast.

BAD:  "By Latent Space — This is a video featuring Yi Tay discussing his work at
       DeepMind, focusing on AGI, reinforcement learning, and career advice in AI research."
       ↑ Generic filler. "This is a video" adds nothing.
```

**notes** — Bullet-point takeaways. What did the guest actually say? What's the signal?
```
GOOD:
- On-policy RL (learning from own exploration) beats imitation learning for reasoning
- Gemini Deep Think won IMO gold by shifting from off-policy to on-policy RL
- DeepMind Singapore team is focused specifically on AGI research
- Career advice: produce quality independent work to get noticed in competitive AI field
- Health and sustainability matter for long-term research productivity

BAD:
"In the recording titled 'Captaining IMO Gold...', Yi Tay discusses his return to
Google's DeepMind (GDM) and the establishment of a team focused on AGI in Singapore.
He highlights the shift toward reinforcement learning (RL) as a primary modeling tool..."
```

**metadata:**
```json
{
  "source": "youtube",
  "video_id": "unUeI7e-iVs",
  "channel_name": "Latent Space",
  "publish_date": "2025-06-15",
  "duration_seconds": 5400,
  "guests": ["Yi Tay"],
  "series": "main"
}
```

**event_date:** Episode publish date (from metadata or YouTube)

---

### `ainews`

Daily/weekly AI news digests.

**description** — Must say "AI News edition" + headline story + scope.
```
GOOD: "AI News edition covering OpenAI's launch of Codex as its first cloud-based SWE agent.
       Also: Claude 4 benchmarks, Llama 4 Scout/Maverick release, Google I/O announcements."

BAD:  "OpenAI launches Codex as its first cloud-based SWE agent."
       ↑ Doesn't say what this IS. Could be an article, a tweet, anything.

BAD:  "This is an AI News article discussing various developments in the AI field."
```

**notes** — Key stories as bullets, each with the core takeaway.
```
GOOD:
- OpenAI Codex: cloud SWE agent, runs in sandboxed environments, targets enterprise devs
- Claude 4 hits 72.5% on SWE-bench verified, up from 49% on 3.5 Sonnet
- Llama 4 Scout (17B active, 109B total) uses mixture-of-experts for cost efficiency
- Google announces Gemini 2.5 Pro with native tool use at I/O
```

**metadata:**
```json
{
  "source": "ainews",
  "publish_date": "2025-05-20",
  "story_count": 12
}
```

**event_date:** Publish date

---

### `article`

Written pieces published on latent.space.

**description** — Must say "Latent Space article" + the thesis in 1-2 sentences.
```
GOOD: "Latent Space article defining the six elements of Agent Engineering (IMPACT framework)
       and tracing the agent hype cycle from 2023's AutoGPT through 2025's enterprise
       adoption. Based on swyx's AIE Summit 2025 keynote."

BAD:  "Defines the six elements of Agent Engineering..."
       ↑ Doesn't say what this IS. Could be a podcast, a paper, anything.

BAD:  "By Latent.Space — This article defines agents and discusses their significance
       in AI engineering, summarizing key insights from a related conference keynote."
```

**notes** — Key arguments and frameworks from the article.
```
GOOD:
- Six elements of agents (IMPACT): Intent, Models, Planning, Authority, Context, Tools
- Agent Labs vs Model Labs: Cursor, Perplexity, Cognition sell agents, not models
- Agent reliability doubles every 3-7 months per METR benchmarks
- Three slow-burn catalysts: business model shifts, 1000x Moore's law, RL finetuning
- "Stutter-step agents" that ask permission for everything lose user trust
```

**notes should NOT contain** the full article text. That goes in `chunks`.

**metadata:**
```json
{
  "source": "website",
  "hostname": "www.latent.space",
  "author": "swyx",
  "publish_date": "2025-03-25"
}
```

**event_date:** Article publish date

---

### `builders-club`

Builders Club community sessions.

**description** — Must say "LS Builders Club session" + what was covered/built.
```
GOOD: "LS Builders Club session on MCP integrations — live demos of building MCP servers
       for Postgres and Stripe, Q&A on auth patterns and deployment."
```

**notes** — What happened, what was built, key discussion points.
```
GOOD:
- Live demo: building an MCP server for Postgres with read-only query tools
- Auth pattern: OAuth2 proxy in front of MCP server for multi-tenant access
- Discussion: MCP vs function calling — when to use which
- Community project showcase: 3 members showed their MCP integrations
```

**metadata:**
```json
{
  "source": "builders-club",
  "session_number": 12,
  "date": "2025-06-20",
  "format": "virtual"
}
```

**event_date:** Session date

---

### `paper-club`

Paper Club reading/discussion sessions.

**description** — Must say "LS Paper Club session" + which paper + the key finding.
```
GOOD: "LS Paper Club session discussing 'Scaling Monosemanticity' (Anthropic, May 2024) —
       extracting interpretable features from Claude 3 Sonnet using sparse autoencoders."
```

**notes** — Key findings, group discussion highlights, practical implications.

**metadata:**
```json
{
  "source": "paper-club",
  "paper_title": "Scaling Monosemanticity",
  "paper_authors": ["Adly Templeton", "Tom Conerly", "..."],
  "paper_url": "https://transformer-circuits.pub/...",
  "session_date": "2025-07-10"
}
```

**event_date:** Session date

---

### `workshop`

Hands-on workshop sessions.

**description** — Must say "LS workshop" + what was taught/built.
```
GOOD: "LS workshop on building production RAG pipelines with LlamaIndex —
       chunking strategies, hybrid search, and evaluation with RAGAS."
```

**notes** — What was covered, tools used, key techniques.

**metadata:**
```json
{
  "source": "workshop",
  "topic": "RAG pipelines",
  "tools": ["LlamaIndex", "RAGAS"],
  "date": "2025-08-15"
}
```

**event_date:** Workshop date

---

### `guest`

People who appeared on LS content. **Only actual guests/speakers — not every mentioned person.**

**description** — Who they are and why they matter. Role + affiliation + claim to fame.
```
GOOD: "DeepMind research scientist, leads the AGI team in Singapore. Known for T5,
       PaLM, and UL2 work. Returning LS guest."

BAD:  null
```

**notes** — Career highlights, key positions, notable work.
```
GOOD:
- Research scientist at Google DeepMind, based in Singapore
- Led AGI-focused team; previously at Google Brain
- Key papers: T5, PaLM, UL2, Flan series
- Advocate for on-policy RL as path to reasoning
- LS appearances: ep. on scaling laws (2024), ep. on IMO gold (2025)
```

**metadata:**
```json
{
  "role": "guest",
  "affiliations": ["Google DeepMind"],
  "expertise": ["reinforcement learning", "language models", "scaling"],
  "twitter": "yikiyt",
  "appearances": 2
}
```

**event_date:** Not required

---

### `entity`

Everything else: organizations, topics, tools, concepts, mentioned-but-not-appeared people.

**description** — What it is and why it matters to AI engineers. One sentence.
```
GOOD (org):    "AI safety company, creator of Claude model family. Key competitor to
                OpenAI. Pioneer of RLHF and constitutional AI."
GOOD (topic):  "Training paradigm where models learn from rewards based on their own
                generated outputs. Key driver behind reasoning breakthroughs in 2024-25."
GOOD (tool):   "Open-source LLM framework for building RAG and agent applications.
                Most popular Python library for LLM app development."

BAD:           null
```

**notes** — Key facts, context, why LS community cares.
```
GOOD (org — Anthropic):
- Founded by Dario and Daniela Amodei (ex-OpenAI) in 2021
- Claude model family: Haiku, Sonnet, Opus
- Pioneered RLHF, constitutional AI, and interpretability research
- MCP (Model Context Protocol) creator — open standard for tool use
- Major LS topic: multiple episodes, frequent ainews coverage

GOOD (topic — reinforcement learning):
- Training paradigm: models learn from reward signals, not just examples
- On-policy RL (PPO, GRPO) vs off-policy (DPO) is a key debate in 2024-25
- Drives reasoning capabilities: o1, o3, Gemini Deep Think
- RLHF specifically used for aligning LLMs with human preferences
- Frequently discussed on LS: Yi Tay, Josh McGrath episodes
```

**metadata:**
```json
// organization
{
  "entity_type": "organization",
  "org_type": "ai-lab",
  "website": "https://anthropic.com",
  "founded": "2021"
}

// topic
{
  "entity_type": "topic",
  "aliases": ["RL", "RLHF"],
  "parent_topic": "machine learning"
}

// tool
{
  "entity_type": "tool",
  "website": "https://llamaindex.ai",
  "github": "run-llama/llama_index",
  "language": "python"
}

// mentioned person (not a guest)
{
  "entity_type": "person",
  "role": "mentioned",
  "affiliations": ["OpenAI"],
  "reason": "Frequently referenced in LS discussions about AI scaling"
}
```

**event_date:** Not required (unless it's a dated event)

---

## Edge Standards

### Source Types (the `source` field)

| source | Meaning | Direction |
|--------|---------|-----------|
| `appeared_on` | Guest appeared on content | guest → podcast/builders-club/workshop |
| `covers_topic` | Content covers this entity | podcast/article/ainews → entity |
| `works_at` | Guest works at organization | guest → entity (org) |
| `mentioned_in` | Entity mentioned in content | entity → podcast/article/ainews |
| `related_to` | General relationship | any → any |
| `builds_on` | Content extends/references other content | article → article |
| `contributed_insight` | *(deprecated — being removed)* | — |
| `extracted_insight` | *(deprecated — being removed)* | — |

### Context Field

**Plain text, human-readable.** Not JSON. A sentence that explains the relationship.

```
GOOD: "Yi Tay appeared as guest discussing on-policy RL and Gemini Deep Think's IMO gold medal"
GOOD: "Covers reinforcement learning — specifically the shift from off-policy to on-policy methods"
GOOD: "Research scientist at Google DeepMind, leads Singapore AGI team"

BAD:  {"type":"appeared_on","confidence":0.9,"explanation":"appeared on Captaining IMO Gold..."}
BAD:  null
```

---

## Dimension Standards

### Philosophy
- **~50 curated dimensions**, mixed format + topic
- Every node gets **1 format dimension** (what kind of content) + **1-3 topic dimensions** (what it's about)
- Lowercase, singular, hyphenated: `reinforcement-learning` not `Reinforcement Learning`

### Format Dimensions
| Dimension | Applies to |
|-----------|-----------|
| `ls-podcast` | podcast episodes |
| `ainews` | AI News editions |
| `ls-article` | latent.space articles |
| `builders-club` | Builders Club sessions |
| `paper-club` | Paper Club sessions |
| `workshop` | Workshop sessions |

### Topic Dimensions (target ~40)
Categories (examples, not exhaustive):
- **Training:** `reinforcement-learning`, `fine-tuning`, `pre-training`, `post-training`, `rlhf`
- **Inference:** `inference`, `quantization`, `speculative-decoding`, `distillation`
- **Architecture:** `reasoning`, `multimodal`, `mixture-of-experts`, `transformers`
- **Applications:** `agents`, `rag`, `code-generation`, `search`, `embeddings`
- **Tooling:** `mcp`, `evals`, `benchmarking`, `observability`
- **Industry:** `open-source`, `safety`, `scaling`, `startup`, `enterprise`
- **Ecosystem:** `openai`, `anthropic`, `google`, `meta`, `deepseek`, `mistral`

### Rules
- **No duplicates:** "podcast" / "latent-space-podcast" / "LS Pod" → just `ls-podcast`
- **No one-off dimensions** with 1-2 nodes — merge into a broader category
- **Nodes without dimensions is not acceptable** — every node gets at least 1

---

## What Gets Deleted

- [ ] 61 insight nodes (NULL type, NULL metadata) + their edges
- [ ] ~96 AI Engineer conference talk nodes + their edges + chunks
- [ ] Duplicate nodes (e.g., Node 1 and Node 30 are both "No More Slop – swyx")
- [ ] `extracted_insight` and `contributed_insight` edge types
- [ ] Orphaned dimensions (0 nodes)
