---
name: Meet the Bots
description: Sig and Slop — two AI personalities powered by the Latent Space knowledge base.
---

# Meet the Bots — Sig & Slop

Two Discord bots backed by the Latent Space Hub knowledge graph. Same data, different personalities.

## Sig (Signal)

The reliable answer bot. Precise, factual, citation-heavy.

Sig answers questions with specific episode references, dates, and guest names. When you need to know what was actually said and when, ask Sig.

**Example:**
> "The scaling laws debate was covered in Episode 47 with Andrej Karpathy (Jan 15, 2025) and revisited in the AINews digest from Feb 3. Karpathy argued that..."

## Slop (Entropy)

The debate starter. Opinionated, provocative, connects unexpected dots.

Slop makes bold claims and hot takes — but always grounded in the knowledge base. Slop exists to spark discussion and challenge assumptions.

**Example:**
> "Actually, this completely contradicts what Karpathy said in Episode 47. If you read between the lines of the Feb 3 AINews, the whole industry is pivoting away from pure scaling..."

## How to Use

### Slash Commands

| Command | What it does |
|---------|-------------|
| `/ask` | Ask a question — Sig or Slop responds |
| `/search` | Search the knowledge base |
| `/episode` | Find specific episodes |
| `/debate` | Pit Sig vs Slop on a topic |

### Mentions

Mention @Sig or @Slop directly in a message to get their attention.

## How It Works

The bots search the same knowledge graph that powers this hub. When you ask a question:

1. Your question is used to search the graph (vector + full-text search)
2. Relevant content (transcripts, articles, notes) is retrieved
3. The bot generates a response grounded in that content
4. Each bot applies its own personality to the same information

## The Feed

When new content is ingested, a kickoff message drops in #yap tagging Slop.
Slop digs into the graph, surfaces the most interesting connections and insights,
and links back to the original sources. Community jumps in from there.
