# Discord Bot — Slop

Slop is an AI bot in the Latent Space Discord, backed by the full knowledge graph. Opinionated, provocative, always grounded in the actual content.

## What Slop Does

- Makes bold claims and hot takes grounded in the knowledge base
- References specific content with direct links to sources
- Connects dots across the graph — "this contradicts what Karpathy said in episode 47..."
- Sparks discussion, not safe answers

## Three Interaction Points

### 1. Automated Kickoff

When new content is ingested (podcast, article, AINews), the pipeline:
1. Posts a clean announcement to **#announcements** (title, date, source link)
2. Posts a kickoff message to **#yap** tagging Slop with a graph-insight prompt

Slop responds by searching the graph, surfacing interesting connections, and sparking discussion. Community jumps in from there.

**Companion-aware:** If a new item has a companion (e.g., a podcast with a matching article), only the first item triggers the yap kickoff. The companion gets announced but skips the yap to avoid duplicate discussions.

**Deterministic kickoff (preferred):** If `DISCORD_BOT_KICKOFF_URL` is configured, the pipeline calls the bot service's internal API instead of posting a yap webhook. This starts a Slop thread in the bot-talk channel with more control over the conversation flow.

### 2. @Slop Mentions

Mention @Slop anywhere in allowed channels. Slop creates a thread (`Slop: [topic]`) and responds with graph-backed context. Follow-up messages in the thread continue the conversation — Slop owns the thread and responds to all messages.

### 3. Slash Commands

| Command | What it does |
|---------|-------------|
| `/tldr <query>` | Get a concise TLDR on any topic from the knowledge graph |
| `/wassup` | See what's new and interesting in Latent Space |

## Source Linking

Slop always provides direct links to source material. Every response that references an episode, article, or AINews issue includes a clickable link to the original content. The system prompt enforces this: context is assembled with markdown links, and Slop is instructed to pass them through.

## Architecture

```
Discord Gateway
    └── Slop bot user
         │
    Single discord.js process
         │
    ┌────┴─────┐
    │  Turso   │  (read-only connection)
    │  KB      │  Hybrid search (vector + FTS)
    └──────────┘
         │
    OpenRouter → Claude Sonnet 4.6
```

- **Repo:** `latent-space-bots` (separate from this repo)
- **Runtime:** Single Discord.js process, single bot user
- **KB access:** Read-only Turso connection (same database as the web app)
- **Search:** Hybrid vector + FTS for content retrieval
- **LLM:** Claude Sonnet 4.6 via OpenRouter (model swappable via `SLOP_MODEL` env var)
- **Persona:** Defined in `personas/slop.soul.md`
- **Pattern:** Thread-per-conversation — each user question creates a thread

## How Slop Connects to the KB

1. User asks a question via slash command or @mention
2. Bot extracts the query and runs hybrid search (vector + FTS) against chunks
3. Top results assembled into context with markdown source links
4. Context + persona prompt + user question → LLM call via OpenRouter
5. Response posted to Discord thread with source links and model badge

The bot does **not** use the MCP server — it connects directly to Turso via the shared service layer for lower latency.

## Hosting

| Component | Where |
|-----------|-------|
| Slop bot | Railway (always-on process) |
| Knowledge base | Turso (shared with web app) |
| LLM calls | OpenRouter → Claude Sonnet 4.6 |
