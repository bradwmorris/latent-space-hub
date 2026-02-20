# PRD 11: Discord Bot Refinement — Contextual Grounding, Content Awareness & Channel Architecture

## Background

Sig and Slop (PRD-06) are live and functional — they connect to Turso, retrieve KB content, respond in threads, and support slash commands. But interacting with them in Discord reveals clear gaps:

1. **No identity grounding.** The bots don't know what Latent Space IS. They can't explain the podcast, the newsletter, the community, the AI Engineer conferences, or the people behind it (swyx, Alessio). They retrieve content but lack the contextual frame to present it meaningfully.

2. **No content-type awareness.** The KB has distinct content types — podcasts, articles, newsletters (AINews), meetups, paper-club episodes — but the bots treat everything as generic "nodes." They can't say "this was covered in a podcast with [guest]" vs "this was in last week's AINews."

3. **No temporal intelligence.** The bots can't answer "what's been discussed recently?" or "trace how the scaling debate evolved over the last 6 months." Everything is flat — no sense of when things happened or how topics develop over time.

4. **Channel architecture is wrong.** Currently bots respond wherever they're mentioned. What we actually want:
   - A **dedicated bot-talk channel** where Sig and Slop engage each other on new material automatically
   - A **thread-per-question model** where user questions spawn threads for ongoing conversation

## What Latent Space Is

*(This context must be baked into the bots' understanding)*

**Latent Space** is the AI Engineer newsletter and the top technical AI podcast, founded by **swyx** (Shawn Wang). It covers how leading labs build **Agents, Models, Infra, and AI for Science**.

- **Podcast** (`@LatentSpacePod`): Long-form interviews (1-2 hours) with prominent AI researchers and builders. Guests include Greg Brockman, Fei-Fei Li, Mark Zuckerberg, Chris Lattner, Noam Brown. ~1.5M all-time unique listeners.
- **AINews** (`smol-ai/ainews`): Daily AI news roundups — curated, not AI-slop. The signal in the noise.
- **Articles** (`latent.space` Substack): In-depth technical essays and analysis. 170K+ free subscribers.
- **LatentSpaceTV** (`@LatentSpaceTV`): Video content including Builders Club sessions, Paper Club deep-dives, and meetup recordings.
- **AI Engineer Conference** (AIE): Started as one annual event, expanded to 7 global conferences in 2026.
- **Community**: Discord server, meetups, a reader base of builders and researchers who care about serious, grounded AI discussion.

Editorial philosophy: "curating very well" and "saying no a lot." Quality over volume. Authenticity over metrics. The opposite of slop.

## Plan

### 1. Rewrite system guides for bot grounding

The MCP server's guide system (`ls_read_guide`) is the bot's knowledge foundation. The current guides are generic. They need to be rewritten with deep LS context.

**`start-here` guide — complete rewrite:**
- What Latent Space is (mission, people, philosophy)
- What content types exist and what they represent
- How the knowledge base is structured (nodes, edges, chunks, dimensions)
- How to navigate content by type and time
- Who the key people are (swyx, Alessio, frequent guests)
- What the community cares about (agents, models, infra, AI for science)
- How to cite sources properly (episode title, guest, date, URL)

**`content-types` guide — new or major rewrite:**
- `podcast`: Latent Space Pod episodes. Long-form interviews. Key fields: guest(s), topic, date, transcript.
- `article`: Substack essays. Technical deep-dives. Key fields: author, topic, date, full text.
- `newsletter`: AINews daily digests. Curated news roundups. Key fields: date, topics covered, companies/models mentioned.
- `meetup`: Builders Club and LatentSpaceTV recordings. Community events. Key fields: topic, speakers, date.
- `paper-club`: Paper Club episodes. Academic paper deep-dives. Key fields: paper title, presenters, date.
- `person`: People in the LS universe. Key fields: role, affiliations, appearances.
- `organization`: Companies, labs, institutions. Key fields: what they do, key people, mentions.
- `topic`: Concepts, technologies, subject areas. Key fields: related content, timeline of coverage.

Each type section should include example queries the bot can answer about that type.

**`search` guide — update:**
- Add temporal query patterns: "recent," "last month," "since January," "timeline of X"
- Add type-filtered search patterns: "podcasts about X," "what AINews said about Y"
- Add entity-aware patterns: "episodes with [person]," "what [org] has been doing"

### 2. Temporal awareness

Bots must understand and use dates in their responses.

**What this means:**
- When retrieving content, always surface the `event_date` and present it naturally
- Support temporal queries: "what's new this week," "recent episodes about agents," "how has the scaling debate evolved"
- Sort and prioritize recent content when the query implies recency
- When citing sources, always include the date: "In the January 2025 episode with George Hotz..."

**Implementation:**
- Update retrieval pipeline to support date-range filtering
- Update system prompts to instruct bots to always include temporal context in responses
- Add date-aware search to slash commands (e.g., `/search --since 2025-06 agents`)

### 3. Persona refinement

**Sig** — needs deeper grounding:
- Knows the LS content landscape cold. Can say "we covered this in 3 episodes and 2 AINews issues"
- Cites with full context: type + title + guest + date + URL
- Understands content types and uses them naturally: "The podcast episode with..." vs "In last Tuesday's AINews..."
- Has temporal awareness: "This has been a recurring theme — first discussed in [date], revisited in [date]"

**Slop** — needs grounded provocation:
- Hot takes should reference SPECIFIC content, not vague AI discourse
- "Oh great, another agents episode — but at least this one with [guest] actually addressed [specific point] unlike the [date] episode where..."
- Connects dots across content types: "AINews keeps hyping [X] but the podcast guests keep saying the opposite"
- Time-aware snark: "We've been hearing about [X] since January and it still hasn't shipped"

### 4. Channel architecture

**A) Bot-talk channel (`#bot-talk` or `#sig-vs-slop`):**
- Dedicated channel where Sig and Slop post and engage each other
- Triggered by: new content ingested (new podcast, new AINews, new article)
- Flow: Sig posts a factual summary of the new content → Slop responds with a hot take → they go back and forth (2-3 exchanges, capped)
- Community members can jump into these threads
- This is the "always-on" content engagement layer

**B) User question → thread model:**
- When a user asks a question (mentions bot or uses slash command) in any allowed channel
- Bot creates a thread titled with a summary of the question
- All follow-up conversation happens in that thread
- Both bots can participate if the conversation warrants it (e.g., user asks for different perspectives)
- Thread keeps the main channel clean and makes conversations browsable/searchable

**Implementation:**
- Add channel type config: `bot-talk-channel-id`, `allowed-channels` list
- Bot-talk channel: webhook/event listener for new content ingest → trigger Sig summary → trigger Slop response
- User threads: on user message in allowed channel → create thread → respond in thread → subsequent bot messages go to thread
- Rate limiting per channel type (bot-talk can be more frequent, user threads respect cooldowns)

## Depends on

- **PRD-10 (Data Refinement)** — bots are only as good as the data. Fix NULL descriptions, wrong types, and junk edges FIRST. Then the bots' retrieval quality improves automatically.
- **PRD-06 (Discord Bot v1)** — DONE. Foundation exists.
- **PRD-07 (MCP Server)** — DONE. Guide system exists, needs content.

### 5. Daily audio recap — "Sig vs Slop"

A daily automated audio podcast where Sig and Slop recap and debate the day's activity across the Latent Space ecosystem. Published to YouTube as an audio podcast.

**Concept:**
- End of each day (or on a schedule), a pipeline runs that collates everything that happened in LS that day — new podcast episodes, new AINews issues, new articles, notable Discord discussions, trending topics.
- Sig and Slop "record" an episode: Sig presents the factual recap, Slop interjects with hot takes, they debate the most interesting items, and close with what to watch for.
- The script is generated from KB content, then converted to audio via TTS, then published to YouTube.

**Why this is worth doing:**
- Entertaining daily content with zero human production effort
- Drives engagement — listeners come back daily to hear Sig and Slop argue
- Boosts visibility for the broader LS ecosystem (podcast episodes, articles, etc.)
- Novel format — AI-generated debate podcast grounded in real curated content
- YouTube presence creates a new distribution channel

**Pipeline (high-level):**

```
1. Collate    — Query KB for today's new/updated content (new nodes, new edges, trending topics)
2. Script     — LLM generates a Sig/Slop dialogue script from the collated content
                - Sig: factual recap, key highlights, source citations
                - Slop: hot takes, contrarian angles, entertaining tangents
                - Structure: intro → topic 1 → debate → topic 2 → debate → wrap-up
                - Target length: 5-15 minutes of audio
3. Voice      — TTS synthesis with distinct voices for Sig and Slop
                - Options to explore: ElevenLabs, OpenAI TTS, Play.ht, Cartesia
                - Sig: measured, clear, authoritative voice
                - Slop: energetic, slightly irreverent, faster pace
4. Mix        — Combine voice tracks, add intro/outro jingle, normalize audio
5. Publish    — Upload to YouTube (via YouTube Data API)
                - Auto-generated thumbnail with episode title + date
                - Description with links to all sources discussed
                - Tags for discoverability
6. Announce   — Post in the bot-talk Discord channel: "New daily recap is up: [link]"
```

**Open questions to explore:**
- What's the right cadence? Daily, weekday-only, or triggered by content volume?
- How long should episodes be? 5 min recap vs 15 min deep debate?
- Should there be a separate YouTube channel for this, or publish under LatentSpaceTV?
- What TTS service gives the best quality for conversational AI voices at reasonable cost?
- Can we make the voices distinctive enough that listeners can tell Sig from Slop instantly?
- Should we use a podcast RSS feed in addition to YouTube? (Spotify, Apple Podcasts, etc.)
- Legal/disclosure: do we need to label this as AI-generated content? (YouTube policies, platform rules)
- Music/jingle: license a short intro clip or generate one?
- Should community members be able to suggest topics for tomorrow's episode?

**Technical considerations:**
- TTS costs per episode (estimate based on word count and provider pricing)
- YouTube API quota limits for daily uploads
- Audio quality requirements for YouTube (bitrate, format, loudness normalization)
- Script quality control — need a review step or confidence threshold before publishing?
- Error handling — what happens if content collation returns nothing interesting?

**This is a stretch goal.** Ship the core bot refinements (guides, temporal awareness, channel architecture) first. The audio pipeline builds on top of everything else being solid.

---

## Implementation Order

1. PRD-10 ships first (data quality)
2. Rewrite guides (start-here, content-types, search)
3. Update Sig and Slop persona docs
4. Add temporal awareness to retrieval pipeline
5. Implement bot-talk channel
6. Implement user thread model
7. Test end-to-end in test Discord
8. Demo to swyx
9. Add to LS Discord
10. *(stretch)* Build daily audio recap pipeline
11. *(stretch)* Publish first episode to YouTube

## Done =

- [ ] `start-here` guide rewritten with full LS identity and content landscape
- [ ] `content-types` guide written with all types, fields, and example queries
- [ ] `search` guide updated with temporal and type-filtered patterns
- [ ] Sig persona updated with content-type awareness and temporal framing
- [ ] Slop persona updated with grounded hot takes referencing specific content
- [ ] Temporal queries work: "recent episodes," "since January," "timeline of X"
- [ ] Bot-talk channel implemented: new content triggers Sig summary → Slop response
- [ ] User thread model implemented: questions create threads, conversation continues there
- [ ] Tested end-to-end in test Discord server
- [ ] Demo'd to swyx
- [ ] Live in LS Discord
- [ ] *(stretch)* Daily audio recap pipeline working end-to-end
- [ ] *(stretch)* First episode published to YouTube
