# Deployment

## Environments

| Service | What | Where |
|---------|------|-------|
| Web App | Next.js frontend + API | Vercel (readonly mode) |
| Database | Turso cloud SQLite | `latentspace-bradwmorris.aws-us-east-2.turso.io` |
| Discord Bot | Slop | Railway |
| MCP Server | NPX package | npm registry (`latent-space-hub-mcp`) |

## Vercel Deployment

The web app deploys to Vercel from the `main` branch.

**Readonly mode:** Production runs with `NEXT_PUBLIC_READONLY_MODE=true`. This disables:
- Node creation/editing
- Skill writes
- Dimension changes
- Any write operations from the UI

Read-only mode is for public access. Writes happen via:
- The ingestion pipeline (admin, uses Turso credentials directly)
- MCP tools (with appropriate auth)
- Discord bot member-memory flow (via MCP tool calls from bot runtime)

## Vercel Cron Jobs

Two cron endpoints handle automated ingestion:

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/ingest` | Hourly | Discover and ingest new content from RSS/GitHub |
| `/api/cron/extract-entities` | Hourly (offset) | Extract entities from nodes with chunks but no edges |

Cron schedule is defined in `vercel.json`. Both endpoints require `Authorization: Bearer $CRON_SECRET`.

The `/api/cron/ingest/trigger` endpoint allows manual triggering with source filters and dry-run mode.

## Environment Variables (Vercel)

| Variable | Value |
|----------|-------|
| `TURSO_DATABASE_URL` | `libsql://latentspace-bradwmorris.aws-us-east-2.turso.io` |
| `TURSO_AUTH_TOKEN` | Turso auth JWT |
| `NEXT_PUBLIC_READONLY_MODE` | `true` |
| `NEXT_PUBLIC_BASE_URL` | Production URL |
| `CRON_SECRET` | Auth secret for cron endpoints |
| `OPENAI_API_KEY` | Embedding generation |
| `ANTHROPIC_API_KEY` | Entity extraction |
| `DISCORD_ANNOUNCEMENTS_WEBHOOK_URL` | Webhook for #announcements channel |
| `DISCORD_YAP_WEBHOOK_URL` | Webhook for #yap channel |
| `DISCORD_SLOP_USER_ID` | Slop user ID for @mentions in yap kickoff |
| `DISCORD_BOT_KICKOFF_URL` | (Optional) Deterministic bot kickoff endpoint |
| `DISCORD_BOT_KICKOFF_SECRET` | (Optional) Shared secret for kickoff auth |

## Local Development

```bash
cp .env.example .env.local   # Add your credentials
npm install
npm run dev                   # localhost:3000
```

Local dev has full write access — no readonly restriction.

## Discord Bots (Railway)

The bot runs on Railway as an always-on process from the `latent-space-bots` repo. It connects to Discord via the gateway WebSocket and stays logged in 24/7.

Railway is separate from Vercel because Discord bots need persistent connections. Vercel handles short-lived request/response — Railway handles always-on.

The bot uses **OpenRouter** for LLM calls — a single API that routes to many models (Claude, GPT, Gemini, etc.). The model can be swapped via environment variable without code changes.

### Environment variables (Railway)

| Variable | Purpose |
|----------|---------|
| `BOT_TOKEN_SLOP` | Discord bot token for Slop |
| `BOT_APP_ID_SLOP` | Discord application ID for slash command registration |
| `DISCORD_TEST_GUILD_ID` | Optional guild ID for test-only slash command registration |
| `TURSO_DATABASE_URL` | Turso database URL |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `OPENROUTER_API_KEY` | LLM API access (model-agnostic) |
| `ALLOWED_CHANNEL_IDS` | Comma-separated Discord channel IDs where the bot can respond |
| `SLOP_MODEL` | OpenRouter model name for Slop |
| `LS_HUB_MCP_SERVER_PATH` | Optional local override path for MCP server script |

### Webhook vs bot

Two different things post in Discord — they are different:

| Component | Type | How it works |
|-----------|------|-------------|
| **Latent Space Hub** | Webhook (not a bot) | Posts content announcements. Just a name + avatar on webhook messages. Sent by Vercel via webhook URL. No invite needed. |
| **Slop** | Real Discord bot | Responds to @mentions, creates threads, discusses content from the wiki-base. Needs a bot invite with appropriate permissions. |

## MCP Server (NPM)

The standalone MCP server is published to npm as `latent-space-hub-mcp`.

```bash
npx latent-space-hub-mcp
```

Users provide their own Turso credentials to connect. See [MCP Server docs](./mcp-server.md).
