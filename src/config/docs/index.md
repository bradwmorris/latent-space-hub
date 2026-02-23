---
title: Latent Space Hub
description: A knowledge graph of the entire Latent Space universe — every podcast, article, and AI News digest, structured, connected, and searchable.
---

# What Is the Latent Space Hub?

The Latent Space Hub is a knowledge graph of the entire Latent Space universe — every podcast episode, article, AI News digest, conference talk, paper club session, and builders club meetup — structured, connected, and searchable.

It's not a static archive. It's a living graph where content is connected by who appeared, what topics were covered, and which ideas build on or contradict each other. New content is ingested automatically within an hour of publication.

Full transcripts, not just titles. You can search for what was actually *said*.

### By the Numbers

- **3,800+ nodes** across 8 content categories
- **7,500+ edges** connecting them
- **35,000+ chunks** of searchable full-text content
- **Covering June 2023 to present**, continuously updated

---

# Browse the Web App

**[latent-space-hub.vercel.app](https://latent-space-hub.vercel.app/)**

### Dashboard

The landing page. Eight category cards with preview items showing the latest content. Click any category to browse.

### Categories

| Category | What's in it |
|----------|-------------|
| **Podcast** | Latent Space podcast episodes with full transcripts |
| **Article** | Blog posts from the latent.space Substack |
| **AI News** | Daily AINews digests from smol.ai |
| **Builders Club** | Community meetup recordings |
| **Paper Club** | Deep-dive paper discussions |
| **Workshop** | Conference talks and tutorials (AI Engineer events) |
| **Guest** | People who appear on or create LS content |
| **Entity** | Organizations (OpenAI, Anthropic) and technical topics (RAG, agents, MCP) |

Content categories sort by most recent. Guest and Entity sort by most connected.

### Search

`Cmd+K` to search across everything. Finds episodes, guests, topics, and articles by name.

### Map

Visual graph view. See how everything connects. Larger nodes have more connections.

### Focus Panel

Click any node to see its full details: description, notes, connections, source links, and dimensions.

---

# Talk to Slop in Discord

![Slop](/images/docs/slop-avatar.png)

Slop is an AI bot in the Latent Space Discord with full access to the knowledge graph.

### What Slop Does

- Answers questions about anything covered in Latent Space content
- Searches the full graph — transcripts, articles, AINews — not just titles
- Gives opinionated, provocative takes grounded in the actual content
- Cites specific episodes, articles, and dates
- Connects dots across the graph — "this contradicts what X said in episode Y three months ago"

### How to Talk to Slop

| Method | What it does |
|--------|-------------|
| **@ mention Slop** | Mention @Slop in any channel. A thread is created and Slop responds with graph-backed context. Follow-up in the thread to continue the conversation. |
| `/tldr <query>` | Get a concise TLDR on any topic from the knowledge graph. |
| `/wassup` | See what's new and interesting in Latent Space. |

Slop always links to sources — every response referencing an episode, article, or AINews issue includes a direct link to the original content.

### The #yap Feed

When new content drops — a new podcast episode, article, or AINews digest — the hub posts an announcement and Slop automatically kicks off a discussion in **#yap**. It digs into the graph, surfaces the most interesting connections and insights, and links back to the source. Community jumps in from there.

![Announcement and discussion kickoff in Discord](/images/docs/discord-kickoff.jpg)

### Slop's Personality

Slop is not a polite assistant. It's opinionated, provocative, and occasionally unhinged — but always grounded in the knowledge base. It exists to spark discussion, not to give safe answers.

![Slop responding to a discussion kickoff](/images/docs/slop-response.jpg)

---

# Connect Your AI Agent (MCP)

Plug your AI agent directly into the knowledge graph via Model Context Protocol.

**Works with:** Claude Code, Cursor, Windsurf, or any MCP-compatible agent.

### Setup (2 minutes)

Add to your MCP config:

```json
{
  "mcpServers": {
    "latent-space-hub": {
      "command": "npx",
      "args": ["-y", "latent-space-hub-mcp"],
      "env": {
        "TURSO_DATABASE_URL": "libsql://latentspace-bradwmorris.aws-us-east-2.turso.io",
        "TURSO_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

Restart your agent. The `ls_*` tools are now available.

### What Your Agent Can Do

- Search across all Latent Space content — episodes, articles, transcripts, AINews
- Find connections between guests, topics, and episodes
- Run custom queries against the graph
- Read full source material (transcripts, articles)
- Explore dimensions and learning paths

### Example Prompts

- "Search Latent Space for everything about AI agents"
- "What has Andrej Karpathy talked about on the podcast?"
- "Find episodes that discuss RAG vs fine-tuning"
- "What were the key themes in AINews this month?"
- "Trace the connections between LangChain and the agents discussion"

### Available Tools

| Tool | What it does |
|------|-------------|
| `ls_search_nodes` | Search by title, description, topic |
| `ls_search_content` | Deep search through full transcripts and articles |
| `ls_get_context` | Get a graph overview (stats, top nodes, dimensions) |
| `ls_get_nodes` | Load full node details by ID |
| `ls_query_edges` | Find connections between nodes |
| `ls_sqlite_query` | Custom SQL for advanced queries |
| `ls_read_guide` | Read built-in navigation guides |

---

# How It Works

The hub is open source. Here's what's under the hood.

### The Pipeline

Every hour, the system checks for new content from four sources: the Latent Space podcast (YouTube), the latent.space Substack, AINews digests (GitHub), and LatentSpaceTV. When something new is found:

1. **Pull the content** — grab the transcript or article text
2. **Break it into chunks** — split into searchable pieces (~2,000 characters each)
3. **Generate embeddings** — create vector representations for semantic search
4. **Extract entities** — use Claude to identify people, companies, and topics mentioned
5. **Connect everything** — link the new content to related episodes, guests, and concepts already in the graph
6. **Announce it** — post to Discord so the community knows

If there's no new content, nothing happens. No spam.

### The Architecture

Four cloud services, no self-hosted infrastructure:

| Service | What it does |
|---------|-------------|
| **Vercel** | Hosts the web app and runs the hourly ingestion cron jobs. Also sends Discord webhook messages when new content is ingested. |
| **Turso** | Cloud-hosted SQLite database. Stores all nodes, edges, chunks, and embeddings. Single shared database — the web app, the bot, and MCP all read from the same source of truth. |
| **Railway** | Runs the Slop bot as an always-on process. Connected to Discord 24/7 via WebSocket. Read-only access to the database. |
| **OpenRouter** | LLM routing for Slop. Model-agnostic — the underlying model (Claude, GPT, etc.) can be swapped via config without code changes. |

### The Database

Everything lives in a single Turso (cloud SQLite) database:

- **Nodes** — every episode, article, person, company, topic (~3,800)
- **Edges** — connections between nodes ("appeared on", "mentioned in", "related to") (~7,500)
- **Chunks** — the actual text content, broken into searchable pieces (~35,000)
- **Embeddings** — 1536-dimensional vectors for AI-powered semantic search

### Search & Indexing

Three layers of indexing make content searchable the moment it's ingested:

1. **Full-text search (FTS5)** — keyword search with BM25 relevance ranking. A virtual table mirrors every chunk and stays in sync automatically via database triggers. When you search for "scaling laws", this finds every chunk containing those exact words.

2. **Vector embeddings** — semantic search that finds content by meaning, not just keywords. Every chunk is embedded into a 1536-dimension vector using OpenAI's `text-embedding-3-small`. Searching for "how to make models smaller" finds content about distillation, quantization, and pruning — even if those exact words aren't in the query.

3. **B-tree indexes** — standard database indexes on dates, types, dimensions, and edge connections for fast filtering.

The default search mode is **hybrid** — it runs vector and full-text search in parallel and merges results using Reciprocal Rank Fusion (RRF). Content that scores well on both keyword match and semantic similarity rises to the top. If any layer fails, the system degrades gracefully: hybrid, then vector-only, then FTS-only, then basic text matching.

### Open Source

The web app, ingestion pipeline, and MCP server are all in the [latent-space-hub](https://github.com/bradwmorris/latent-space-hub) repo. The Discord bots live in a separate [latent-space-bots](https://github.com/bradwmorris/latent-space-bots) repo.

Built with Next.js 15, TypeScript, Turso, and the Vercel AI SDK. Forked from [RA-H](https://github.com/bradwmorris/ra-h_os), a local-first personal knowledge graph.
