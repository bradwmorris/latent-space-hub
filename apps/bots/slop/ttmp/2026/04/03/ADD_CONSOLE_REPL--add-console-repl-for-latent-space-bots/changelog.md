# Changelog

## 2026-04-03

- Initial workspace created


## 2026-04-03

Created ticket and added analysis of ai-in-action-bot's console REPL architecture, reuse points, and latent-space-bots integration constraints.


## 2026-04-03

Added phased refactor plan for separating Discord transport from business logic, including target modules, migration order, and risks.


## 2026-04-03

Resolved plan questions: first REPL targets Slop only, uses literal local commands, keeps timeout warnings transport-specific, and keeps dedupe at the transport adapter boundary.


## 2026-04-03

Expanded the REPL refactor ticket into phase-based implementation tasks covering tests, service extraction, runtime types, Discord adapter migration, and console REPL work.


## 2026-04-03

Step 1: added characterization tests for routing, thread creation, scheduling replies, and edit-event replies (commit 95440a9b241ed92f46dd12336e7f2f2015061580).

### Related Files

- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/__tests__/routing.test.ts — Locked down routing behavior before the runtime refactor
- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/__tests__/threads.test.ts — Locked down thread creation behavior before the runtime refactor


## 2026-04-03

Step 3: live-tested the REPL in tmux, fixed missing skills bootstrap, and prevented runtime DB errors from crashing the session.

### Related Files

- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/adapters/console/repl.ts — Loaded skills context at REPL startup and wrapped dispatch paths in top-level error handling


## 2026-04-03

Step 4: add local SQLite bootstrap path for the REPL and validate /join against a fresh file DB (commit d351004d54886d9ef02a8dadabb2b107aa67248e)

### Related Files

- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/README.md — Local DB workflow docs
- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/scripts/init-local-db.cjs — Local SQLite schema bootstrap
- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/config.ts — Local file DB auth handling


## 2026-04-03

Step 5: remove the Discord token requirement from console REPL startup and validate the launcher with `BOT_TOKEN_SLOP` unset (commit 30391fea050c12d6cc5bf64c095f3768673b9340)

### Related Files

- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/README.md — Clarified that the REPL does not require BOT_TOKEN_SLOP but the Discord bot still does
- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/adapters/console/repl.ts — Uses a runtime-only local profile for the console adapter
- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/config.ts — Profile config no longer throws at import time when BOT_TOKEN_SLOP is absent
- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/discord/bot.ts — Preserves the real token requirement at Discord login time
- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/index.ts — Filters tokenless profiles out of bot startup


## 2026-04-03

Step 6: accept bare local SQLite paths in `TURSO_DATABASE_URL` and validate the exact `/tmp/...` launcher form (commit df55a2ccedfcf00d38f6dabffe1aa486f0b910a6)

### Related Files

- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/README.md — Documents that local DB startup accepts both bare paths and `file:` URLs
- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/config.ts — Normalizes plain filesystem paths into `file:` URLs and keeps auth optional for local DBs


## 2026-04-03

Step 7: ran a full REPL validation pass across local transport/session flows and OpenRouter-backed chat using the local DB

### Related Files

- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/adapters/console/repl.ts — End-to-end REPL path validated against local command flows and mention-driven chat
- /Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/config.ts — Validated bare-path local DB startup with BOT_TOKEN_SLOP unset
