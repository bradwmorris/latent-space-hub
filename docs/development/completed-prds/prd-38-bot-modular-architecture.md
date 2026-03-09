# PRD: Bot Modular Architecture

**Status:** Completed (Implementation) | **Created:** 2026-03-09 | **Completed:** 2026-03-09

## 1. Background

`latent-space-bots/src/index.ts` is 1,705 lines containing the entire bot runtime — Discord event handling, agentic LLM loop, member management, event scheduling, skills loading, an HTTP kickoff server, rate limiting, and all type definitions. The discord.js official guide prescribes a modular handler pattern (one file per command, one file per event, services for business logic). `db.ts`, `tools.ts`, and `lsHubServicesFallback.ts` are already split out. This PRD completes the modularization.

**Target repo:** `latent-space-bots` (not this repo — PRD lives here because the backlog lives here).

## 2. Plan

1. Extract type definitions into `src/types.ts`
2. Extract config and env into `src/config.ts`
3. Extract Discord utilities and routing into `src/discord/`
4. Extract LLM calling (simple + agentic loop) into `src/llm/`
5. Extract member logic into `src/members/`
6. Extract commands into `src/commands/`
7. Extract skills loading into `src/skills/`
8. Extract kickoff HTTP server into `src/kickoff/`
9. Slim `src/index.ts` down to wiring only (~60-80 lines)
10. Verify build + manual test

## 3. Implementation Details

### Step 1: Extract types — `src/types.ts`

Move all type definitions out of index.ts:

- `ToolTrace`, `BotProfile`, `DestinationChannel`, `KickoffPayload`
- `SchedulingSession`, `MemberMetadata`, `MemberNode`
- `LlmTrace`, `AgenticResult`, `TraceOptions`
- `OpenRouterToolCall`, `OpenRouterMessage`, `OpenRouterChatResponse`
- `SkillMeta`

All other modules import from `./types`.

### Step 2: Extract config — `src/config.ts`

- `requiredEnv()`
- All env var reads (`TURSO_DATABASE_URL`, `ALLOWED_CHANNEL_IDS`, `SLOP_MODEL`, etc.)
- `profiles` array
- Turso `db` client initialization
- `getProfileByName()`, `getReadyClient()`, `clientsByProfile`

### Step 3: Discord utilities — `src/discord/`

**`src/discord/bot.ts`** — Client setup + top-level dispatchers:
- `startBot()` — creates Client, wires event handlers
- `handleMessage()` — top-level message dispatcher
- `handleInteraction()` — top-level interaction dispatcher
- `processedMessageIds` Set, `activeDebates` Set

**`src/discord/routing.ts`** — message routing:
- `cleanUserPrompt()`, `getThreadOwnerBotName()`, `shouldRespondToMessage()`
- `isAllowedChannel()`, `isGreetingOrSmalltalk()`

**`src/discord/rate-limit.ts`**:
- `withinRateLimit()`, rate limit maps

**`src/discord/format.ts`** — Discord output formatting:
- `splitForDiscord()`, `modelBadge()`, `shortModelName()`, `agenticToolsFooter()`

**`src/discord/threads.ts`**:
- `ensureDestinationChannel()`

### Step 4: LLM calling — `src/llm/`

**`src/llm/generate.ts`**:
- `generateResponse()` — single-turn LLM call
- `generateAgenticResponse()` — multi-round tool-use loop
- `extractEstimatedCostUsd()`
- Constants: `OPENROUTER_URL`, `MAX_AGENTIC_ROUNDS`, `MAX_TOOL_RESULT_CHARS`

**`src/llm/prompts.ts`**:
- `buildSystemPrompt()`, `parseProfileBlock()`

**`src/llm/tracing.ts`**:
- `toolTraces`, `clearTraces()`, `recordTrace()`
- `logTrace()`, `inferInteractionKind()`, `summarizeUserMessage()`

### Step 5: Member logic — `src/members/index.ts`

- `lookupMember()`, `createMemberNodeFromUser()`, `updateMemberAfterInteraction()`
- `parseMetadata()`, `formatMemberContext()`
- `isUniqueConstraintError()`, `ensureMemberDiscordIndex()`

### Step 6: Commands — `src/commands/`

One file per command, following discord.js guide conventions.

**`src/commands/join.ts`** — `/join` handler
**`src/commands/schedule.ts`** — `/paper-club` + `/builders-club` + scheduling flow state machine
**`src/commands/register.ts`** — `registerSlashCommands()`

### Step 7: Skills — `src/skills/index.ts`

- `normalizeSkillName()`, `loadSkillIndexFromLocal()`, `loadSkillsContextFromLocalStrict()`
- `readLocalSkillStrict()`, `validateRequiredSlopSkills()`, `getSkillsContextOrThrow()`
- `cachedSkillsContext`, `REQUIRED_SLOP_SKILLS`

### Step 8: Kickoff server — `src/kickoff/`

**`src/kickoff/server.ts`** — `startKickoffServer()`, `writeJson()`, `readJsonBody()`
**`src/kickoff/handler.ts`** — `runDeterministicKickoff()`, `resolveKickoffDestination()`, `buildKickoffQuery()`

### Step 9: Slim index.ts

After extraction, `src/index.ts` should be ~60-80 lines:

```typescript
import "dotenv/config";
import { db, profiles } from "./config";
import { startBot } from "./discord/bot";
import { startKickoffServer } from "./kickoff/server";
import { loadSkillsContextFromLocalStrict } from "./skills";
import { ensureMemberDiscordIndex } from "./members";
import { TOOL_DEFINITIONS } from "./tools";

async function main() {
  console.log("Starting Latent Space bots...");
  // validate profiles
  // log allowed channels
  // ensure DB indexes
  // load + validate skills
  // start bot(s)
  // start kickoff server
}

main().catch((error) => {
  console.error("Fatal bot startup error:", error);
  process.exit(1);
});
```

### Step 10: Verify

- `npm run build` must pass with zero errors
- `npm run dev` must start the bot successfully
- Manual test: bot responds to mentions, `/join` works, scheduling works
- No behavior changes — pure refactor

## 4. Target Structure

```
latent-space-bots/src/
├── index.ts              ← ~60-80 lines, wiring only
├── config.ts             ← env vars, profiles, DB client
├── types.ts              ← all shared type definitions
├── db.ts                 ← (exists, unchanged)
├── tools.ts              ← (exists, unchanged)
├── lsHubServicesFallback.ts ← (exists, unchanged)
├── commands/
│   ├── join.ts
│   ├── schedule.ts
│   └── register.ts
├── discord/
│   ├── bot.ts
│   ├── routing.ts
│   ├── rate-limit.ts
│   ├── format.ts
│   └── threads.ts
├── llm/
│   ├── generate.ts
│   ├── prompts.ts
│   └── tracing.ts
├── members/
│   └── index.ts
├── skills/
│   └── index.ts
└── kickoff/
    ├── server.ts
    └── handler.ts
```

## 5. Constraints

- **Zero behavior changes.** Pure structural refactor.
- **No new dependencies.** Just moving code between files.
- **Existing `db.ts`, `tools.ts`, `lsHubServicesFallback.ts` stay unchanged.**
- **`npm run build` must pass before and after.**

## 6. Architecture Guardrails (Recommended)

To ensure this refactor improves structure (not just file count), enforce these rules:

### 6.1 Dependency Direction

- `index.ts` is composition root only.
- `discord/*` depends on `commands/*`, `members/*`, `llm/*`, `config.ts`, `types.ts`.
- `commands/*` may depend on `members/*`, `llm/*`, `skills/*`, `config.ts`, `types.ts`.
- `llm/*`, `members/*`, `skills/*` must not import from `discord/*`.
- `types.ts` contains shared contracts only (no runtime logic, no side effects).
- Avoid cross-feature imports where possible (prefer narrow interfaces passed in).

### 6.2 Config vs Runtime Bootstrapping

- Keep `config.ts` pure: env parsing/validation + immutable config objects.
- Move runtime singletons/stateful initialization to explicit modules:
  - `infra/db.ts` (or existing `db.ts`) for DB client creation.
  - `discord/clients.ts` for Discord client lifecycle (`clientsByProfile`, readiness).
- Do not initialize network clients at import time unless required for current behavior.

### 6.3 State Ownership

- `processedMessageIds` + `activeDebates`: owned by `discord/bot.ts`.
- `schedulingSessions` (10-minute TTL): owned by `commands/schedule.ts`.
- Document cleanup semantics per state store (TTL, pruning cadence, max size).
- Ensure every stateful module has a clear initialization path and reset point for tests.

### 6.4 Anti-Goal

- The goal is not “small files”; the goal is cohesive modules with explicit boundaries.
- `index.ts` size target (`~60-80`) is guidance, not a hard constraint.

## 7. Verification Plan (Recommended Additions)

In addition to build + manual checks:

- Add focused regression tests for behavior-critical seams:
  - message routing (`shouldRespondToMessage`, thread ownership, allowed channels)
  - rate limiting (`withinRateLimit`)
  - scheduling session TTL behavior
  - agentic loop round limits / tool trace capture
- Add a “no side-effect import” startup check (import modules in isolation where feasible).
- Validate startup ordering explicitly (config -> DB/indexes -> skills -> bot -> kickoff).

## 8. Open Questions / Notes

- `processedMessageIds` and `activeDebates` are module-level state — move to `discord/bot.ts`.
- `clientsByProfile` Map moves to `config.ts` or `discord/bot.ts`.
- `lsHubServicesFallback.ts` stays top-level — already working, no reason to move.
- The scheduling flow uses in-memory `schedulingSessions` Map with a 10-minute TTL. This stays in `commands/schedule.ts`.

## COMPLETED (2026-03-09)

### Branch + Repo

- Work executed in `latent-space-bots` on branch:
  - `codex/prd-38-bot-modular-architecture`

### Implemented Refactor

- Created `src/types.ts` and moved shared type definitions.
- Created `src/config.ts` and moved env/config/profile/client/db setup helpers.
- Created Discord modules:
  - `src/discord/bot.ts`
  - `src/discord/routing.ts`
  - `src/discord/rate-limit.ts`
  - `src/discord/format.ts`
  - `src/discord/threads.ts`
- Created LLM modules:
  - `src/llm/generate.ts`
  - `src/llm/prompts.ts`
  - `src/llm/tracing.ts`
- Created member module:
  - `src/members/index.ts`
- Created commands modules:
  - `src/commands/join.ts`
  - `src/commands/schedule.ts`
  - `src/commands/register.ts`
- Created skills module:
  - `src/skills/index.ts`
- Created kickoff modules:
  - `src/kickoff/server.ts`
  - `src/kickoff/handler.ts`
- Slimmed `src/index.ts` to startup wiring only (now 38 lines).

### Verification Performed

- `npm run build` passes with zero TypeScript errors.

### Verification Not Yet Performed

- `npm run dev` runtime validation against live Discord/API env.
- Manual flow checks:
  - mentions/replies in allowed channels
  - `/join`
  - `/paper-club` and `/builders-club`
  - deterministic kickoff endpoint

### Notes on Behavior-Parity Risk

- Refactor was done as move/split-first with minimal logic changes.
- High confidence on compile-time parity; medium confidence on runtime parity until manual Discord/kickoff checks are run.
- One ownership difference from earlier recommendation: kickoff concurrency state (`activeDebates`) currently lives in `src/kickoff/handler.ts` (not `src/discord/bot.ts`) to keep kickoff concerns local.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
