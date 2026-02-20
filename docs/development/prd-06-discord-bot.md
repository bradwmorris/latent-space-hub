# PRD 06: Discord Bots — Sig & Slop

## Background

Two bots for the Latent Space Discord, backed by the knowledge base. Both from day one — not one now and one later. Separate repo. Connects to Turso read-only.

**Sig** — the straight one. Precise, factual, cites sources. The engineer who reads the docs.
**Slop** — the unhinged one. Hot takes, connects dots nobody asked for, argues. The engineer who ships at 2am.

Same knowledge base, different system prompts. They debate new material, engage with community members, and pull people into threads.

## Plan

1. Create new repo
2. Discord.js gateway with thread-per-conversation pattern (OpenClaw-style)
3. Two bot applications registered with Discord (Sig + Slop)
4. Both connect to Turso knowledge base
5. Deploy to Brad's test Discord server
6. Demo to swyx
7. Add to LS Discord

## Implementation Details

### Architecture

- **Separate repo** (Brad's GitHub)
- **Discord.js** gateway — single Node.js process routing messages to both bots
- **Thread-per-conversation** — when someone engages a bot, it creates/continues a thread (OpenClaw's Discord gateway pattern). Keeps conversations contained, browsable, and persistent.
- **Turso client** for read-only queries against the knowledge base
- **LLM layer** — each bot gets its own system prompt + personality but shares the same KB query pipeline
- **No complex MD workspace system** — unlike OpenClaw's SOUL.md/AGENTS.md/etc, Sig and Slop don't need persistent memory files. Their context comes from the LS knowledge base. System prompt + KB search results = their entire world.

### The two bots

**Sig** (Signal)
- Personality: Precise, measured, cites everything. "According to episode 47 with Andrej Karpathy..."
- Style: Factual, structured, helpful. Links to sources.
- Role: The reliable answer bot. You ask, Sig finds it.

**Slop** (Entropy)
- Personality: Opinionated, provocative, connects unexpected dots. "Hot take: this is just attention with extra steps and here's why nobody wants to admit it"
- Style: Casual, confrontational, funny. Still grounded in real KB content but takes liberties with interpretation.
- Role: The debate starter. Slop reacts to new content, picks fights with Sig, draws community members into discussions.

### Thread model (OpenClaw-style)

- Bot mentioned or replied to → creates a thread (or continues existing one)
- Each thread = isolated conversation context
- Thread title auto-generated from topic
- Both bots can be in the same thread (debating each other)
- Community members jump in and engage with either
- No cross-thread context bleed

### Knowledge base integration

Every bot response follows the same pipeline:
1. Parse user message / new content
2. Hybrid search the KB (vector + FTS5) for relevant context
3. Retrieve full chunks + source metadata (episode title, guest, date, URL)
4. Feed context + user message + personality prompt to LLM
5. Generate response grounded in KB content
6. Post with source links

The bots never hallucinate from thin air — they always pull from the knowledge base first. The personality layer is in how they frame and interpret what the KB returns.

### Proactive behavior

When new content is ingested (new podcast, new ainews):
- Sig posts a summary thread: "New episode dropped: [title]. Key topics: [x, y, z]. Here's what stood out..."
- Slop replies with a hot take: "Oh great, another agents episode. Here's what they got wrong..."
- Community members pile in

### Core capabilities (v1)

1. **Search** — "what has LS covered about RLHF?" → hybrid search, return passages with sources
2. **Episode lookup** — "have they done a podcast with Karpathy?" → query guest nodes + edges
3. **Quote retrieval** — "what did swyx say about agents?" → search chunks filtered by guest
4. **Context** — "what were the last few podcasts about?" → recent episode nodes
5. **Debate** — Sig and Slop react to the same content with different takes, engage each other

### Future capabilities

- User/subscriber tracking (nodes in the graph, bot updates user records)
- Proactive posting on new content ingest
- Reaction-based engagement (bot reacts to messages, offers to expand)
- Weekly digest threads

### Depends on

- PRD 02 (clean schema)
- PRD 04 (vector search working)
- PRD 05 (content in the database)

## Done =

- Repo exists with Discord.js gateway
- Sig and Slop both registered as Discord applications
- Thread-per-conversation working
- Both bots query Turso KB and return grounded responses
- Both running in Brad's test Discord server
- Demo'd to swyx
- Invited to LS Discord

---

## Status Update (2026-02-20)

### Completed so far

- Separate bot repo exists and is active: `latent-space-bots`
- Railway deployment is working from latest `main` (`1c38c44`)
- Runtime implemented as one process with two Discord clients (Sig + Slop)
- Mention/reply handling implemented
- Thread-first response behavior implemented
- Slash commands implemented: `/ask`, `/search`, `/episode`, `/debate`
- Turso-backed retrieval implemented with hybrid attempt (vector + FTS) and fallback search
- Basic debate loop implemented with capped exchanges
- Basic rate limiting implemented (user + channel)
- Bot SOUL persona docs implemented and loaded from repo files (`personas/sig.soul.md`, `personas/slop.soul.md`)
- Shared retrieval layer integration path implemented (prefers `latent-space-hub-mcp/services`, with local fallback)

### Verified in live test

- Bot receives Discord messages and sends replies in test server
- Turso connectivity path is live and validated from Railway runtime (`nodes=4024`, `edges=7293`, `chunks=36443`)
- LLM call path is live (OpenRouter errors are surfaced in-channel when credits are insufficient)
- Live env config issue fixed: placeholder Turso hostname replaced with real host and service redeployed

### Current blockers / gaps

- OpenRouter account must have sufficient credits for stable runtime
- Final channel allowlist and permission hardening still needs confirmation
- Proactive posting on new ingest events is not implemented yet
- Demo to swyx and LS Discord rollout still pending
