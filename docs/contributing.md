# Contributing

## Setup

```bash
git clone https://github.com/bradwmorris/latent-space-hub.git
cd latent-space-hub
cp .env.example .env.local
npm install
npm run dev            # localhost:3000
npm run type-check     # Must pass before committing
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TURSO_DATABASE_URL` | Yes | Turso database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Yes | Turso auth token |
| `OPENAI_API_KEY` | For embeddings | OpenAI API key (embedding generation) |
| `ANTHROPIC_API_KEY` | For agents | Anthropic API key (entity extraction, descriptions) |
| `NEXT_PUBLIC_READONLY_MODE` | No | Set `true` to disable writes (public deployment) |
| `CRON_SECRET` | For auto-ingestion | Auth secret for cron endpoints |
| `DISCORD_ANNOUNCEMENTS_WEBHOOK_URL` | For notifications | Discord webhook for #announcements |
| `DISCORD_YAP_WEBHOOK_URL` | For notifications | Discord webhook for #yap feed |
| `DISCORD_SLOP_USER_ID` | For notifications | Slop's Discord user ID for @mentions |

See `.env.example` for the full list including optional bot kickoff and channel configuration.

## Git Workflow

**Always work on feature branches. Never commit directly to main.**

```bash
git checkout main && git pull origin main
git checkout -b feature/[name]
# ... do work ...
npm run type-check     # Must pass
git add .
git commit -m "feat: description"
# merge after review
```

## How Work Gets Done

1. **Pick from backlog** — `docs/development/backlog.json` has the priority queue
2. **Read the PRD** — Each project has a PRD in `docs/development/` that serves as the spec
3. **Do the work** — Branch, implement, test
4. **Update backlog** — Mark tasks done, update status
5. **Commit and merge**

### Backlog

**File:** `docs/development/backlog.json`

```json
{
  "queue": ["project-id-1", "project-id-2"],
  "projects": { ... },
  "completed": [ ... ]
}
```

**Status values:** `ready` → `in_progress` → `review` → `completed`

Work the queue top to bottom. Dependencies are noted in project notes.

### PRDs

PRDs live in `docs/development/prd-XX-[name].md`. They define:
- What to build and why
- Exact files to change
- Acceptance criteria

Completed PRDs are moved to `docs/development/completed-prds/`.

## Key Constraints

- **Database is Turso** (cloud SQLite via `@libsql/client`) — not local SQLite, not better-sqlite3
- **Type-check must pass** before committing: `npm run type-check`
- **No RA-H references** in user-facing code — this is a standalone product
- **Service layer pattern** — all DB access goes through `src/services/database/`, never direct SQL from components

## Useful Commands

```bash
npm run dev            # Start dev server
npm run type-check     # TypeScript validation
npm run build          # Production build
```

## Project Docs

| Doc | What it covers |
|-----|---------------|
| [Overview](./overview.md) | What LS Hub is, how it works |
| [Architecture](./architecture.md) | Codebase map, key files, patterns |
| [Schema](./schema.md) | Database tables and relationships |
| [Categories](./categories.md) | The 8 content categories |
