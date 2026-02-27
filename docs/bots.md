# Discord Bot — Slop

Slop is the Latent Space Discord bot backed by the full knowledge graph. It is opinionated, source-grounded, and now member-aware.

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
| `/join` | Create your member profile node so Slop remembers your interests over time |

## Member Memory

When a user runs `/join`, Slop creates a `member` node in the graph with Discord metadata.

On later interactions:

1. Slop looks up the member profile and injects member context into prompt construction.
2. After responding, Slop appends a one-line interaction summary to member notes.
3. Slop updates metadata (`last_active`, `interaction_count`, `interests`).
4. Slop creates member → content edges for retrieved items from that interaction.

All of this is non-blocking after response delivery.

## Source Linking

Slop always provides direct links to source material. Every response that references an episode, article, or AINews issue includes a clickable link to the original content. The system prompt enforces this: context is assembled with markdown links, and Slop is instructed to pass them through.

## Architecture

```
Discord Gateway
    └── Slop bot user
         │
    Single discord.js process
         │
    MCP stdio client
         │
    latent-space-hub-mcp
         │
       Turso KB
         │
    OpenRouter → Claude Sonnet 4.6
```

- **Repo:** `latent-space-bots` (separate from this repo)
- **Runtime:** Single Discord.js process, single bot user
- **KB access:** MCP tools (`latent-space-hub-mcp`) from bot runtime
- **Search:** MCP `ls_search_content` + `ls_get_nodes` + latest-node SQL path
- **LLM:** Claude Sonnet 4.6 via OpenRouter (model swappable via `SLOP_MODEL` env var)
- **Persona:** Defined in `personas/slop.soul.md`
- **Pattern:** Thread-per-conversation — each user question creates a thread

## How Slop Connects to the KB

1. User asks a question via slash command or @mention
2. Bot queries graph context through MCP tools
3. Bot optionally loads guide context (`ls_read_guide`) and member context
4. Retrieved graph context + persona + member context + user question → LLM call via OpenRouter
5. Response posted to Discord thread with source links and model badge

## Hosting

| Component | Where |
|-----------|-------|
| Slop bot | Railway (always-on process) |
| Knowledge base | Turso (shared with web app) |
| LLM calls | OpenRouter → Claude Sonnet 4.6 |
