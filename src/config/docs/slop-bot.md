---
title: Slop Bot
description: "How Slop works: the Discord bot that searches the Latent Space wiki-base, remembers members, and schedules community events."
---

# Slop Bot

Slop is Latent Space's Discord bot. It searches the wiki-base, answers questions with source links, remembers who you are, and schedules community events.

| | |
|---|---|
| **Repo** | `latent-space-bots` (separate from latent-space-hub) |
| **Hosted on** | Railway (always-on process) |
| **LLM** | Claude Sonnet 4.6 via OpenRouter |
| **Database** | Same Turso instance as the hub |

---

# How It Works

## The simple version

1. You send a message mentioning @Slop (or use a slash command)
2. Slop builds a system prompt with its personality, your member profile, and a list of skills
3. The LLM gets 9 internal tools it can call to search the wiki-base
4. The LLM decides what to search, calls tools, reads results, and may search again (up to 5 rounds)
5. The LLM generates a response with source links
6. Slop posts the response in a Discord thread
7. Behind the scenes, the code updates your member profile and logs the interaction

## Architecture

Slop connects **directly to Turso**: it does not use the MCP server. All tools and skills are internal to the `latent-space-bots` repo.

```
User @mentions Slop in a channel
    |
    v
Discord sends message to bot (via WebSocket gateway)
    |
    v
Bot checks: allowed channel? rate limit? already processed?
    |
    v
Bot looks up member profile from DB (by Discord ID)
    |
    v
Bot builds system prompt:
  [IDENTITY]  ~400 chars: who Slop is, how to behave
  [RULES]     ~500 chars: search tool routing, citations, no fabrication
  [SKILLS]    ~700 chars: skill index (event scheduling, search patterns, member profiles)
  [MEMBER]    ~400 chars: your profile, interests, interaction preference
    |
    v
Bot sends to OpenRouter (Claude Sonnet 4.6) with:
  - System prompt
  - User message
  - 9 internal tool definitions
    |
    v
LLM decides what to do:
  - Call slop_semantic_search for meaning-based queries?
  - Call slop_search_nodes for known names/terms?
  - Call slop_sqlite_query for date filters or events?
  - Call slop_read_skill for detailed instructions?
  - Or just respond directly (for greetings)?
    |
    v
Bot executes tool calls directly against Turso
Tool results fed back to LLM
(repeats up to 5 rounds)
    |
    v
LLM generates final response with source links
    |
    v
Bot strips any hidden <profile> update block
Bot posts response to Discord thread
Bot logs trace to DB (non-blocking)
Bot updates member profile (non-blocking)
```

---

# Slash Commands

Three commands registered with Discord. These are typed directly in the message input.

## /join

**Usage:** `/join`

Creates your member profile in the wiki-base. After joining:
- Slop remembers your role, company, interests across conversations
- Your interactions create edges to content you discuss
- Slop personalizes responses based on your profile

If you've already joined, it refreshes your profile metadata.

## /paper-club

**Usage:** `/paper-club`

Schedule a Paper Club session (every Wednesday, 12-1pm PT).

1. Slop shows the next 4 available Wednesdays (skips dates already booked)
2. You reply with a number and your paper title (optionally with a URL)
3. Slop creates an event node in the wiki-base and confirms

## /builders-club

**Usage:** `/builders-club`

Same as `/paper-club` but for Builders Club sessions (every Saturday 8am Sydney / Friday afternoon PT). You provide a topic instead of a paper.

---

# @Mentions and Threads

Mention @Slop in any allowed channel to start a conversation. Slop creates a thread named `Slop: [first 40 chars of your message]` and responds there.

**In a Slop-owned thread**, you don't need to keep mentioning @Slop. All messages in the thread are treated as directed to Slop. Rate limits are relaxed for natural back-and-forth.

**You can also reply to any Slop message** to continue a conversation without creating a new thread.

---

# Tools

Slop has 9 internal tools that query Turso directly. These are defined in the `latent-space-bots` repo, not via MCP.

**Search tools** (each uses a different index type):

| Tool | How it searches | Best for |
|------|----------------|----------|
| `slop_semantic_search` | Vector embeddings (meaning) | Natural language questions, conceptual queries |
| `slop_search_nodes` | SQL LIKE (substring match) | Known names, exact terms, node_type filtering |
| `slop_search_content` | FTS5 (keyword index) | Exact words/phrases in transcripts and articles |

**Graph traversal and utility tools:**

| Tool | Purpose |
|------|---------|
| `slop_get_nodes` | Load full node records by ID |
| `slop_query_edges` | Find connections from a node |
| `slop_list_dimensions` | List all categories with counts |
| `slop_get_context` | Wiki-base stats (nodes, edges, chunks) |
| `slop_sqlite_query` | Read-only SQL for date filters, aggregations, event queries |
| `slop_read_skill` | Read full skill instructions (from local bot files) |

The system prompt tells the LLM which search tool to use based on the query type. Temporal queries ("latest", "upcoming") route to `sqlite_query`. Event queries explicitly use `node_type='event'` with metadata filters to avoid confusing scheduled sessions with past recordings.

The LLM can call multiple tools across up to 5 rounds before generating its response.

**All tools are read-only.** The LLM cannot write to the database. All writes (member updates, event creation, edge creation) happen in the bot's own code, outside the LLM loop.

---

# Skills

Skills are instruction sets that Slop loads on demand. The system prompt includes a brief index of available skills. When the LLM needs detailed instructions (e.g. how to query events), it calls `slop_read_skill` to load the full skill body.

## Available Skills

| Skill | What it covers | When Slop reads it |
|-------|---------------|-------------------|
| **Start Here** | Slop runtime orientation and routing to specialist skills | First reference for most Slop interactions |
| **DB Operations** | Schema, search patterns, citation format | When Slop needs operational DB guardrails |
| **Member Profiles** | How to build profiles over time, the `<profile>` block format, interaction preferences | When users share personal info or ask about their profile |
| **Event Scheduling** | How events work, SQL queries for upcoming/past events, directing users to slash commands | Questions about Paper Club or Builders Club |

Skills live in the `skills/` directory of the bots repo as markdown files with YAML frontmatter. The frontmatter (name, description, when to use) appears in the system prompt. The body is fetched on demand from local files: this keeps the system prompt small.

---

# Member System

## Joining

Use `/join` to create your member node. This stores:
- Discord ID, username, avatar
- Join date and last active timestamp

## Profile Building

As you chat with Slop, it builds your profile over time:
- **Role, company, location**: captured when you mention them
- **Interests**: accumulated from conversations (up to 25 topics)
- **Interaction preference**: how you like to communicate (observed or explicitly stated)
- **Interaction history**: last 3 conversation summaries

Slop extracts profile updates by appending a hidden `<profile>` block to its responses. The block is stripped before the message reaches Discord: you never see it.

## Interaction Preference

Slop adapts its style to each member. If you prefer short technical answers, say so. If you like being challenged, Slop will remember. The preference develops two ways:

1. **Explicitly**: Tell Slop: "keep it short", "be more technical", "challenge my assumptions"
2. **Implicitly**: Slop observes your communication patterns and updates over time

The preference is stored in your member metadata and injected into the system prompt every interaction.

## Member Edges

After each interaction, Slop creates edges linking your member node to any content nodes discussed. Over time this builds a map of what you've engaged with.

---

# Automated Kickoffs

When the hub ingests new content (via hourly cron), it can trigger Slop to discuss it automatically.

The hub sends a POST to Slop's internal API (`/internal/kickoff`) with:
- Content title, type, date, URL
- Optional summary or custom prompt

Slop then:
1. Creates a thread in the configured channel
2. Searches the wiki-base for context on the new content
3. Generates an opening take with the full agentic tool loop
4. Posts it for the community to discuss

This is authenticated via a shared secret (`DEBATE_KICKOFF_SECRET`).

---

# Response Format

Every Slop response includes:

- **Model badge**: Shows which model generated the response (e.g. `claude-sonnet-4-6`)
- **Response body**: The actual response, split into chunks if over 1800 chars (Discord's limit)
- **Tools footer**: Shows which tools were called (e.g. `search_nodes(x2) | get_nodes`)

---

# Trace Logging

Every interaction is logged to the `chats` table in Turso:

| Field | What's stored |
|-------|--------------|
| User message | The original prompt |
| Assistant response | Slop's response (first 8000 chars) |
| Tool calls | Full trace: tool name, arguments, result summary, duration per call |
| Metadata | Discord user ID, channel, model, latency, retrieval method, member ID |

View traces at `/evals` on the web app.

<!-- AUTO:SLOP_SYSTEM_PROMPT_START -->
<!-- AUTO:SLOP_SYSTEM_PROMPT_END -->
