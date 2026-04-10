# latent-space-bots

Discord bots for Latent Space. Launches with Slop; Sig is optional.

## Status
Gateway runtime implemented for:
- Slop primary client (Sig optional — omit `BOT_TOKEN_SIG` to run Slop-only)
- Mention/reply handling with thread-first replies
- Single-owner thread routing: if a user tags one bot, that bot owns the thread follow-up conversation
- Slash commands: `/join`, `/paper-club`, `/builders-club`
- Slash command: `/edit-event` for updating/canceling your scheduled sessions
- Direct Turso graph access via parameterized SQL
- Channel allowlist + basic rate limiting
- Optional chat logging to Turso (`ENABLE_CHAT_LOG_WRITE=true`)
- Kickoff API (`POST /internal/kickoff`) for announcement → Slop response without mention-trigger dependence
- Daily Paper Club reminders (24h-before at 12:00pm PT and optional 1h-before at 11:00am PT; DB-backed idempotency)
- Local console REPL for Slop using the same runtime as the Discord adapter

## Slash commands

| Command | Params | Description |
|---------|--------|-------------|
| `/join` | none | Add yourself as a member node in the Latent Space graph |
| `/paper-club` | none | Schedule a Paper Club session — pick a date and paper |
| `/builders-club` | none | Schedule a Builders Club session — pick a date and topic |
| `/edit-event` | none | Edit title, paper URL, date, or cancel your scheduled event |

## Member Memory

After a user runs `/join`:

- Slop looks up member context before responding.
- Responses are personalized using interests and recent interaction notes.
- After each response, the bot appends a one-line interaction note, updates metadata (`last_active`, `interaction_count`, `interests`), and creates member → content edges for retrieved items.
- Post-response graph writes are non-blocking (Slop still replies even if writes fail).

## Local Console REPL

The repo includes a Slop-only local console REPL backed by the same transport-neutral runtime used by the Discord bot. It is useful for testing routing, thread creation, and command/session flows without connecting to Discord.

Before using a brand-new local SQLite file, bootstrap the schema once:

```bash
npm run db:init:local -- .local/latent-space-bots.db
```

That creates the hub-compatible core tables this repo expects (`nodes`, `edges`, `node_dimensions`, `chunks`, `dimensions`, `chats`, `logs`) plus the member/event indexes used by the bot. It is a local dev schema, not a production data clone.

Start it in either of these ways:

```bash
npm run repl
```

or, if you already built the repo:

```bash
./bin/ls-chat
```

Supported local commands:

- `/help`
- `/as @username`
- `/users`
- `/threads`
- `/switch <thread-id|thread-name>`
- `/join`
- `/paper-club`
- `/builders-club`
- `/edit-event`
- `/quit`

Usage notes:

- Mention Slop with `@slop` to trigger mention-driven chat.
- The REPL auto-creates and auto-switches into owned threads when the runtime opens one.
- Literal slash commands are handled locally and routed through the same core command services as Discord.
- If you use `./bin/ls-chat`, it prefers the compiled `dist/` entrypoint and falls back to the TypeScript source via `tsx`.

Example local REPL startup:

```bash
TURSO_DATABASE_URL='/absolute/path/to/.local/latent-space-bots.db' \
OPENROUTER_API_KEY='your-openrouter-key' \
npm run repl
```

`BOT_TOKEN_SLOP` is not required for the console REPL. It is still required for the actual Discord bot process. `TURSO_AUTH_TOKEN` is optional for local SQLite values, whether you pass `TURSO_DATABASE_URL` as a bare filesystem path or a `file:` URL.

## Graph runtime

Bots use direct Turso access (`@libsql/client`) for graph reads/writes.

## Persona (`SOUL`) files

Bots now load persona instructions from:
- `personas/sig.soul.md` — **Sig** ("signal"): Precise, skeptical analyst. Structures arguments, cites sources, flags uncertainty. The person in the room who says "show me the benchmark."
- `personas/slop.soul.md` — **Slop** (ironic): First-principles provocateur. Takes strong stances, deconstructs consensus, ends with a challenge. Named after the enemy, fighting from the inside.

Both personas share strict anti-hallucination rules (no fabrication, source-grounded claims, flagged speculation) and are tuned to the Latent Space community's builder-first, anti-slop values.

Startup fails if a required bot's soul file is missing or empty, so persona behavior cannot silently drift.

## Kickoff API

Enable with:

```bash
DEBATE_KICKOFF_SECRET=your-shared-secret
BOT_TALK_CHANNEL_ID=123456789012345678
```

Optional network settings:

```bash
DEBATE_KICKOFF_PORT=8787
DEBATE_KICKOFF_HOST=0.0.0.0
```

Endpoint:

- `POST /internal/kickoff`
- Header: `Authorization: Bearer <DEBATE_KICKOFF_SECRET>`
- Body (JSON, all fields optional except channel resolution):

```json
{
  "channelId": "123456789012345678",
  "title": "Episode title",
  "url": "https://...",
  "contentType": "podcast",
  "eventDate": "2026-02-22",
  "summary": "optional ingestion summary",
  "prompt": "optional explicit seed prompt"
}
```

Behavior:
- Bot posts a seed message in the target channel.
- It creates a thread when possible (named `Slop: [title]`).
- Slop generates a grounded take on the new content and posts it to the thread.

## Event reminder config

Paper Club reminders:
- **24h reminder:** daily at 12:00pm Pacific for next-day events
- **1h reminder:** daily at 11:00am Pacific for same-day events (for 12pm PT sessions)

Required/optional env vars:

- `REMINDERS_ENABLED` (default `true`)
- `REMINDERS_ONE_HOUR_ENABLED` (default `true`)
- `PAPER_CLUB_CHANNEL_ID` (required if reminders enabled)
- `REMINDERS_TIMEZONE` (default `America/Los_Angeles`)
- `BOT_INSTANCE_ID` (optional; defaults to host/pid)
