# Discord Bots — Sig & Slop

Two AI personalities backed by the Latent Space Hub knowledge base. Same graph, different lenses.

## The Bots

### Sig (Signal)

The reliable answer bot. Precise, factual, citation-heavy.

- Answers questions with specific episode references, dates, and guest names
- Cites sources: "This was covered in Episode 47 with Andrej Karpathy (Jan 2025)"
- Knows content types and can say "covered in 3 episodes and 2 AINews issues"
- The bot you trust for accurate information

### Slop (Entropy)

The debate starter. Opinionated, provocative, connects unexpected dots.

- Makes bold claims and hot takes grounded in the knowledge base
- References specific content but draws surprising conclusions
- "Actually, this contradicts what Karpathy said in episode 47..."
- The bot that sparks discussion

## Architecture

```
Discord Gateway
    ├── Sig bot user
    └── Slop bot user
         │
    Single discord.js process
         │
    ┌────┴─────┐
    │  Turso   │  (read-only connection)
    │  KB      │  Hybrid search (vector + FTS)
    └──────────┘
         │
    OpenRouter → LLM (Claude/GPT)
```

- **Repo:** `latent-space-bots` (separate from this repo)
- **Runtime:** Single Discord.js process running both bots as separate bot users
- **KB access:** Read-only Turso connection (same database as the web app)
- **Search:** Hybrid vector + FTS for content retrieval
- **LLM:** OpenRouter for model-agnostic LLM access — the model (Claude, GPT, Gemini, etc.) can be swapped via environment variable without code changes
- **Personas:** Defined in `personas/sig.soul.md` and `personas/slop.soul.md`
- **Pattern:** Thread-per-conversation — each user question creates a thread

## Slash Commands

| Command | What it does |
|---------|-------------|
| `/ask` | Ask a question — Sig or Slop responds based on which bot is mentioned |
| `/search` | Search the knowledge base directly |
| `/episode` | Find specific episodes by topic or guest |
| `/debate` | Pit Sig vs Slop against each other on a topic |

## The Feed — #yap Channel

When new content is ingested, the auto-ingestion pipeline (`src/services/ingestion/notify.ts`) sends two Discord messages:

1. **#announcements** — Clean announcement with title, published date, chunk count, and source link
2. **#yap** — Kickoff message mentioning Slop with a graph-insight prompt

Slop responds to the yap kickoff by searching the graph, surfacing interesting connections, and sparking discussion. Community jumps in from there.

**Companion-aware:** If a new item has a companion (e.g., a podcast with a matching article), only the first item triggers the yap kickoff. The companion gets announced but skips the yap to avoid duplicate discussions. Companion detection uses `hasCompanion` in `src/services/ingestion/processing.ts`.

**Deterministic kickoff (preferred):** If `DISCORD_BOT_KICKOFF_URL` is configured, the pipeline calls the bot service's internal API instead of posting a yap webhook. This starts a multi-exchange Slop thread in the bot-talk channel with more control over the conversation flow.

Slop-only automated kickoff — Sig stays available for slash commands but is not part of the automated feed.

## How Bots Connect to the KB

The bots query the same Turso database as the web app:

1. User asks a question via slash command or mention
2. Bot extracts the query and runs hybrid search (vector + FTS) against chunks
3. Top results are assembled into context
4. Context + persona prompt + user question → LLM call
5. Response posted to Discord thread

The bots do **not** use the MCP server — they connect directly to Turso via the shared service layer for lower latency.

## Hosting

| Component | Where |
|-----------|-------|
| Discord bots | Railway |
| Knowledge base | Turso (shared with web app) |
| LLM calls | OpenRouter |

## Future: Daily Audio Recap

Stretch goal: a daily Sig vs Slop debate podcast published to YouTube.

1. Collate the day's new content (episodes, articles, AINews, Discord activity)
2. Generate a Sig/Slop dialogue script grounded in the KB
3. TTS synthesis with distinct voices
4. Mix and publish to YouTube
