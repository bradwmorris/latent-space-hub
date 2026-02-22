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

Slop is an AI bot in the Latent Space Discord with full access to the knowledge graph.

### What Slop Does

- Answers questions about anything covered in Latent Space content
- Searches the full graph — transcripts, articles, AINews — not just titles
- Gives opinionated, provocative takes grounded in the actual content
- Cites specific episodes, articles, and dates
- Connects dots across the graph — "this contradicts what X said in episode Y three months ago"

### Commands

| Command | What it does |
|---------|-------------|
| `/ask` | Ask a question. Slop searches the graph and responds. |
| `/search` | Search the knowledge base directly. |
| `/episode` | Find specific episodes by topic or guest. |
| `/debate` | Get Slop to argue both sides of a topic. |

Or just **@ mention Slop** in any channel.

### The #yap Feed

When new content drops — a new podcast episode, article, or AINews digest — Slop automatically kicks off a discussion in **#yap**. It digs into the graph, surfaces the most interesting connections and insights, and links back to the source. Community jumps in from there.

### Slop's Personality

Slop is not a polite assistant. It's opinionated, provocative, and occasionally unhinged — but always grounded in the knowledge base. It exists to spark discussion, not to give safe answers.

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
