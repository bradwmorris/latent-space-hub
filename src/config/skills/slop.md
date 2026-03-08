---
name: Slop
description: Slop — the AI bot powering discussions in the Latent Space Discord.
---

# Meet Slop

Slop is a Discord bot backed by the Latent Space Hub knowledge graph. Opinionated, provocative, always grounded in the actual content.

## What Slop Does

- Makes bold claims and hot takes grounded in the knowledge base
- References specific content with direct links to sources
- Connects dots across the graph — "this contradicts what Karpathy said in episode 47..."
- Sparks discussion, not safe answers

## How to Interact

### @ Mention

Mention @Slop in any channel. A thread is created and Slop responds with graph-backed context. Follow-up in the thread to continue the conversation.

### Slash Commands

| Command | What it does |
|---------|-------------|
| `/join` | Add yourself as a member node so Slop remembers your interests over time |
| `/paper-club` | Schedule a Paper Club session (date, title, optional paper URL) |
| `/builders-club` | Schedule a Builders Club session (date, topic) |

### Automated Feed

When new content is ingested, a kickoff message drops in #yap tagging Slop.
Slop digs into the graph, surfaces the most interesting connections and insights,
and links back to the original sources. Community jumps in from there.

## How It Works

1. Your question is routed through MCP graph tools (`ls_search_content`, `ls_get_nodes`, `ls_sqlite_query`)
2. Relevant content (transcripts, articles, notes) is retrieved with source links
3. Slop generates a response grounded in that content
4. If you joined, member context is used to personalize responses
5. After response, member notes/metadata/edges are updated in the graph (non-blocking)

## Source Linking

Every response that references an episode, article, or AINews issue includes a clickable link to the original content. Slop never references content without linking to it.

## Model

Claude Sonnet 4.6 via OpenRouter. Swappable via `SLOP_MODEL` environment variable.
