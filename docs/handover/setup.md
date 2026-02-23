# Latent Space Hub — Handover Guide

How the knowledge hub works and how to get it running in the live Discord server.

---

## What is the Latent Space Hub?

A knowledge graph for everything Latent Space has ever published — every podcast episode, article, AI News digest, guest, company, and topic, all structured and connected.

**Live version:** https://latent-space-hub.vercel.app/

### The short version

Every time a new podcast or article comes out, the system automatically:

1. **Pulls the content** — grabs the transcript or article text
2. **Breaks it into chunks** — splits it into searchable pieces
3. **Extracts entities** — identifies people, companies, and topics mentioned
4. **Connects everything** — links this content to related episodes, guests, and concepts already in the graph
5. **Makes it searchable** — full-text search and AI-powered semantic search across everything

The result is a structured, searchable knowledge base of ~4,000 nodes and ~7,300 connections, covering every piece of Latent Space content from Jan 2025 onward.

### What's in the graph

| Category | What it contains | Examples |
|----------|-----------------|----------|
| **Podcast** | Every episode with full transcript | "Scaling Laws with Dario Amodei" |
| **Article** | Substack posts, full text | "What We Learned from DeepSeek" |
| **AI News** | Daily AINews digests | "AINews — Feb 23, 2026" |
| **Guest** | People who appeared on the podcast | Andrej Karpathy, Harrison Chase |
| **Entity** | Companies, orgs, topics extracted from content | OpenAI, RAG, Transformers |
| **Builders Club** | Builders Club sessions | Community project showcases |
| **Paper Club** | Paper Club discussions | "Attention Is All You Need" deep-dive |
| **Workshop** | LatentSpaceTV videos | Conference talks, tutorials |

### How it's hosted — the three pieces

Everything runs in the cloud. There are three separate services that work together:

#### 1. Vercel — the web app + ingestion engine

Vercel hosts two things in one deployment:

**The web app** — the dashboard you see at https://latent-space-hub.vercel.app/. This is where you browse the graph, search content, view nodes and connections. It's a Next.js app deployed on Vercel, read-only for the public.

**The ingestion pipeline** — this is the automated backend that keeps the graph up to date. It runs as a scheduled cron job (more on that below). Same Vercel deployment, just a background process.

When new content is ingested, the Vercel app is also what sends the webhook messages to Discord (the announcements and kickoff posts). It's the hub that coordinates everything.

#### 2. Railway — the Discord bot (Slop)

Railway cloud hosting, runs the Slop bot as an always-on service.

The bot connects to Discord via the Discord gateway (a persistent WebSocket connection — it's "logged in" 24/7). When someone @mentions Slop, the bot:
- Receives the message from Discord
- Queries the Turso database for relevant content
- Sends context to an LLM to generate a response
- Posts the reply back to Discord in a thread

The bot is **read-only** on the database. It can search and read but never modifies the knowledge graph.

Railway is separate from Vercel because Discord bots need to stay connected permanently. Vercel is designed for short-lived request/response — great for web apps, not for a bot that needs to be online 24/7.

#### OpenRouter — the LLM layer

Slop doesn't use one fixed AI model. It uses **OpenRouter**, which is a single API that gives access to many different models (Claude, GPT, Gemini, Llama, etc.).

Why this matters: we can swap which model Slop uses at any time — just change one environment variable. If a new model comes out that's better or cheaper, we switch to it without changing any code. If one provider has an outage, we can point to a different model in minutes.

Right now Slop uses Claude via OpenRouter, but this is a config choice, not a hard dependency.

#### 3. Turso — the database

Turso is cloud-hosted SQLite. Think of it as a regular SQLite database, but instead of living as a file on someone's laptop, it lives in the cloud and multiple services can connect to it.

Both Vercel (the web app + ingestion) and Railway (Slop) connect to the **same Turso database**. This is how Slop can answer questions about content that was just ingested — they share one source of truth.

The database stores:
- **Nodes** — every episode, article, person, company, topic (~4,000)
- **Edges** — connections between nodes ("appeared on", "mentioned in", "related to") (~7,300)
- **Chunks** — the actual text content, broken into searchable pieces (~36,000)
- **Embeddings** — vector representations of each chunk for AI-powered similarity search

### How the cron job works

A cron job is just a scheduled task — code that runs automatically on a timer.

The ingestion cron runs **every hour, on the hour**. Here's what happens each time:

```
:00  Vercel triggers /api/cron/ingest
      │
      ├─ Check YouTube for new Latent Space podcast episodes
      ├─ Check Substack for new articles
      ├─ Check GitHub for new AINews digests
      └─ Check LatentSpaceTV for new videos
      │
      ▼
 For each new item found:
      │
      ├─ Download the transcript or article text
      ├─ Split into chunks
      ├─ Create a node in the database
      ├─ Generate embeddings for search
      │
      ▼
 Send Discord notifications:
      │
      ├─ Post announcement to #announcements webhook
      └─ Post kickoff to #yap webhook (with @Slop mention)
      │
      ▼
:30  Vercel triggers /api/cron/extract-entities
      │
      ├─ Find recently ingested nodes that haven't been entity-extracted yet
      ├─ Use Claude to identify people, companies, and topics mentioned
      └─ Create entity nodes and edges connecting them to the content
```

If there's no new content, the cron runs, finds nothing new, and does nothing. No spam. It only posts to Discord when there's actually something new.

The cron is managed by Vercel — it's configured in the project settings and runs automatically. No server to maintain, no process to keep alive.

### How it all fits together

```
              ┌──────────────┐       ┌──────────────┐
              │    Turso     │       │  OpenRouter   │
              │  (database)  │       │  (LLM API)   │
              └──────┬───────┘       └──────┬───────┘
                     │                      │
        reads & writes │ reads only          │ Slop sends
                  ┌────┴──────┐             │ queries
                  │           │             │
           ┌──────┴──────┐   ┌──────┴───────┴──┐
           │   Vercel    │   │     Railway      │
           │             │   │                  │
           │ • Web app   │   │ • Slop bot       │
           │ • Cron jobs │   │ • Always on      │
           │ • Webhooks  │   │ • Model-agnostic │
           └──────┬──────┘   └─────────────────┘
                  │
         webhook posts
                  │
           ┌──────┴──────┐
           │   Discord   │
           │             │
           │ • Announces │
           │ • Kickoffs  │
           │ • Slop yaps │
           └─────────────┘
```

### How Slop uses the knowledge graph

When someone @mentions Slop or new content triggers a discussion:

1. Slop receives the message from Discord
2. Searches the knowledge graph (vector similarity + full-text search)
3. Finds relevant episodes, articles, guests, and connections
4. Sends the results + Slop's personality prompt to a model via OpenRouter
5. Posts a response grounded in actual Latent Space content — with specific references

Slop isn't making things up. Every answer is backed by real content from the graph. The model can be swapped anytime (Claude, GPT, etc.) — the knowledge base stays the same.

---

## What gets added to the Discord server

Two things will post in the server. They are different:

| Thing | What it is | How it works |
|-------|-----------|--------------|
| **Latent Space Hub** | A webhook identity (NOT a bot) | Posts content announcements. Just a name + avatar on webhook messages. No invite needed. |
| **Slop** | A real Discord bot | Responds to @mentions, creates threads, discusses content from the knowledge base. Needs a bot invite. |

---

## What the server owner needs to do

Three tasks. Takes about 5 minutes.

### Task 1: Invite Slop (the bot)

- Click the OAuth2 invite link (provided separately)
- Select the Latent Space server
- Authorize

Slop needs these permissions:
- Send Messages
- Create Public Threads
- Send Messages in Threads
- Embed Links
- Read Message History

These are pre-selected in the invite link.

### Task 2: Create two webhooks

Webhooks let the hub post messages as "Latent Space Hub" in specific channels. The owner picks which channels.

**Webhook 1 — Announcements channel**

1. Right-click the target channel → Edit Channel
2. Go to Integrations → Webhooks → New Webhook
3. Name it "Latent Space Hub"
4. Click Copy Webhook URL
5. Send the URL to Brad

**Webhook 2 — Discussion/yap channel**

1. Same steps in the discussion channel
2. Copy and send the second URL

### Task 3: Create a temporary test channel (recommended)

1. Create a private channel called `#bot-testing`
2. Add Brad to the channel
3. Create a webhook in this channel too (same steps as above), send the URL

This channel is used to verify everything works before going live. Delete it after.

---

## What happens after the owner completes the above

Brad handles everything from here. No further owner action needed.

### Step 1: Test in `#bot-testing`

- Send a test webhook message to confirm it posts correctly
- Mention @Slop in the channel to confirm the bot responds
- Trigger a test ingestion to verify the full pipeline

### Step 2: Switch to live channels

- Update the webhook URLs to point at the real announcement and discussion channels
- Redeploy the hub (Vercel) and the bot service (Railway)

### Step 3: Cleanup

- Delete the `#bot-testing` channel
- No permissions to revoke — the owner never granted any

---

## What the integration does once live

### Announcements (automatic, hourly)

When new content is ingested (podcasts, articles, AI news, videos), a message posts to the announcements channel:

```
🎙️ New Podcast Episode

**The Future of AI Agents — with Harrison Chase**
Published: 2026-02-23 | 15 chunks indexed
https://youtu.be/...
```

### Discussion kickoff (automatic)

A companion message posts to the discussion channel, tagging Slop:

```
🧠 Discussion Kickoff

**The Future of AI Agents — with Harrison Chase**
Published: 2026-02-23 | 15 chunks indexed
https://youtu.be/...

@Slop what are the most interesting insights from this?
find and reference the most interesting connections from the graph. keep it short.
```

Slop then responds in a thread with takes from the knowledge base.

### User interaction (anytime)

Anyone in the server can @Slop in any channel where it has permissions. Slop will respond in a thread with knowledge-base-grounded answers.

---

## Environment variables (reference for Brad)

These are updated in Vercel and Railway after receiving the webhook URLs and bot IDs.

### Vercel (latent-space-hub)

| Variable | Value |
|----------|-------|
| `DISCORD_ANNOUNCEMENTS_WEBHOOK_URL` | Webhook URL from announcements channel |
| `DISCORD_YAP_WEBHOOK_URL` | Webhook URL from discussion channel |
| `DISCORD_SLOP_USER_ID` | Slop's user ID (right-click → Copy User ID) |
| `DISCORD_WEBHOOK_USERNAME` | `Latent Space Hub` |
| `DISCORD_WEBHOOK_AVATAR_URL` | Avatar image URL |

### Railway (latent-space-bots)

| Variable | Value |
|----------|-------|
| `ALLOWED_CHANNEL_IDS` | Channel IDs from the live server (comma-separated) |

The bot token (`DISCORD_TOKEN`) stays the same — it's tied to the bot application, not the server.

---

## Verification checklist

- [ ] Slop appears in server member list
- [ ] Test webhook posts to `#bot-testing`
- [ ] @Slop mention in `#bot-testing` gets a threaded response
- [ ] Full ingestion pipeline triggers announcement + yap messages
- [ ] Webhook URLs swapped to live channels
- [ ] Vercel redeployed with live env vars
- [ ] Railway redeployed with live channel IDs
- [ ] `#bot-testing` channel deleted
- [ ] First real content ingestion posts correctly
