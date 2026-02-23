---
name: Meet Slop
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
| `/tldr <query>` | Get a concise TLDR on any topic from the knowledge graph |
| `/wassup` | See what's new and interesting in Latent Space |

### Automated Feed

When new content is ingested, a kickoff message drops in #yap tagging Slop.
Slop digs into the graph, surfaces the most interesting connections and insights,
and links back to the original sources. Community jumps in from there.

## How It Works

1. Your question is used to search the graph (vector + full-text hybrid search)
2. Relevant content (transcripts, articles, notes) is retrieved with source links
3. Slop generates a response grounded in that content
4. Response includes direct links to every source referenced

## Source Linking

Every response that references an episode, article, or AINews issue includes a clickable link to the original content. Slop never references content without linking to it.

## Model

Claude Sonnet 4.6 via OpenRouter. Swappable via `SLOP_MODEL` environment variable.
