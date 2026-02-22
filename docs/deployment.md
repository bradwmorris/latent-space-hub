# Deployment

## Environments

| Service | What | Where |
|---------|------|-------|
| Web App | Next.js frontend + API | Vercel (readonly mode) |
| Database | Turso cloud SQLite | `latentspace-bradwmorris.aws-us-east-2.turso.io` |
| Discord Bots | Sig & Slop | Railway |
| MCP Server | NPX package | npm registry (`latent-space-hub-mcp`) |

## Vercel Deployment

The web app deploys to Vercel from the `main` branch.

**Readonly mode:** Production runs with `NEXT_PUBLIC_READONLY_MODE=true`. This disables:
- Node creation/editing
- Guide writes
- Dimension changes
- Any write operations from the UI

Read-only mode is for public access. Writes happen via:
- The ingestion pipeline (admin, uses Turso credentials directly)
- MCP tools (with appropriate auth)
- Discord bots (read-only — they don't write to the KB)

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

The bots run on Railway as a single process from the `latent-space-bots` repo.

Environment variables for Railway:
- `DISCORD_TOKEN` — Discord bot token
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` — read-only Turso access
- `OPENROUTER_API_KEY` — LLM API access

## MCP Server (NPM)

The standalone MCP server is published to npm as `latent-space-hub-mcp`.

```bash
npx latent-space-hub-mcp
```

Users provide their own Turso credentials to connect. See [MCP Server docs](./mcp-server.md).
