---
Title: Transport And Business Logic Refactor Plan
Ticket: ADD_CONSOLE_REPL
Status: active
Topics: []
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: src/commands/edit-event.ts
      Note: Current edit-event flow that mixes transport and business logic
    - Path: src/commands/join.ts
      Note: Current slash-command implementation to extract into a transport-neutral service
    - Path: src/commands/schedule.ts
      Note: Current scheduling flow that mixes transport and business logic
    - Path: src/discord/bot.ts
      Note: Primary Discord adapter entrypoint to slim down during the refactor
    - Path: src/discord/routing.ts
      Note: Routing behavior to preserve while moving logic behind a runtime seam
    - Path: src/discord/threads.ts
      Note: Discord-specific thread behavior that should move to an adapter helper
ExternalSources: []
Summary: Phased refactor plan to separate Discord transport concerns from business logic so latent-space-bots can support a local console REPL and other transports with less duplication.
LastUpdated: 2026-04-03T13:31:17.596869-07:00
WhatFor: Use this plan to drive the refactor needed before implementing a console REPL that reuses the production conversation logic.
WhenToUse: Read before changing src/discord/bot.ts, command handlers, or introducing any transport-neutral conversation core.
---


# Transport And Business Logic Refactor Plan

## Executive Summary

The current `latent-space-bots` implementation mixes Discord transport details, conversation/session orchestration, and product logic in the same modules. That coupling is what makes a console REPL expensive to add: the behavior we want to reuse is entangled with raw `discord.js` `Message` and `Interaction` objects.

The plan is to introduce a small transport-neutral conversation runtime and migrate the existing Discord bot onto it incrementally. The refactor should proceed flow-by-flow rather than file-by-file:

1. extract pure or mostly-pure services
2. define normalized inbound events and outbound effects
3. migrate the Discord adapter to that interface
4. build a console adapter on the same runtime

This keeps the current bot working while creating the seam the REPL needs.

## Problem Statement

The current entrypoints do too much directly:

- [`src/discord/bot.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/discord/bot.ts#L36) handles routing, dedupe, thread ownership checks, LLM orchestration, typing indicators, message sending, trace logging, and slash-command dispatch
- [`src/commands/schedule.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/commands/schedule.ts#L63) mixes Discord thread creation with scheduling rules and session state
- [`src/commands/edit-event.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/commands/edit-event.ts#L83) mixes Discord thread/channel concerns with event-editing logic
- [`src/commands/join.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/commands/join.ts#L33) still depends directly on `ChatInputCommandInteraction`

The concrete problems are:

- local chat testing requires real Discord-shaped objects
- message and slash-command logic are hard to reuse outside Discord
- session state is keyed to Discord channel IDs and sometimes stores Discord client references
- thread creation and reply behavior are embedded in command handlers instead of being modeled as transport capabilities

If we skip this refactor and just fake `discord.js`, we preserve the current coupling and make the REPL a long-term maintenance burden.

## Proposed Solution

Introduce a transport-neutral conversation layer with three parts.

### 1. Transport adapters

Adapters translate external events into internal request objects and apply internal effects back to the transport.

Examples:

- Discord adapter using `discord.js`
- Console adapter using readline plus an in-memory channel/thread model

### 2. Conversation runtime

A small runtime owns:

- inbound event normalization
- routing to the correct flow
- session lookup/update
- effect production

This runtime should not import `discord.js`.

### 3. Application services

These are business operations already spread across the current bot:

- member lookup/create/update
- prompt construction and LLM execution
- scheduling and event-editing state machines
- trace recording
- destination-thread naming rules

These services should accept plain inputs and return plain results.

### Target internal interface

At minimum, the runtime should operate on internal types like:

- `ConversationEvent`
  - `kind: "message" | "command"`
  - actor identity
  - conversation identity
  - normalized content
  - transport metadata
- `ConversationEffect`
  - `send_text`
  - `send_typing`
  - `open_thread`
  - `close_session`
  - `record_trace`

The interface should model intent, not Discord method names.

## Design Decisions

### Decision 1: Avoid a broad “chat platform abstraction”

We do not need a framework-sized abstraction. We only need a narrow interface that covers the current Discord behavior and the planned console REPL.

Rationale:

- lower migration risk
- less abstraction overhead
- faster path to useful local testing

### Decision 2: Separate effect generation from effect application

Core flows should return effects like “send this text” or “open a thread named X”, and adapters should execute those effects.

Rationale:

- makes the core testable without Discord
- lets Discord and console transports share the same behavior
- keeps thread behavior consistent across adapters

### Decision 3: Move session state behind transport-neutral stores

Today `SchedulingSession` leaks Discord concerns directly into state:

- [`src/types.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/types.ts#L34)

That should become a session store keyed by a transport-neutral conversation ID, with adapter-specific mapping handled outside the business state.

Rationale:

- removes Discord client objects from business logic
- makes console and Discord conversations look the same to the runtime

### Decision 4: Refactor by flow, not by file

The safest migration unit is one flow at a time:

- mention-driven chat
- `/join`
- scheduling
- edit-event

Rationale:

- preserves working behavior during migration
- keeps code review scope manageable
- allows tests to move with each flow

### Decision 5: Keep Discord-specific conveniences in the adapter

Operations like `sendTyping()`, direct use of `displayAvatarURL()`, or Discord-specific reply/defer semantics should stay at the adapter edge.

Rationale:

- prevents the core from inheriting transport quirks
- keeps the internal API smaller
- simplifies the console implementation

## Alternatives Considered

### Alternative 1: Build a large fake `discord.js` layer first

Rejected because it preserves the current coupling and requires too much simulated surface area.

### Alternative 2: Add ad hoc debug scripts around the current bot

Rejected because it does not give us a reusable local conversation runtime and still leaves thread/session testing awkward.

### Alternative 3: Full rewrite into a new architecture

Rejected because it adds unnecessary scope and regression risk. The current code can be migrated incrementally.

## Implementation Plan

### Phase 0: Freeze behavior with tests

Before moving code, add focused tests around behavior we cannot regress.

Target coverage:

- mention routing and thread ownership checks in [`src/discord/routing.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/discord/routing.ts#L24)
- destination-thread creation rules in [`src/discord/threads.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/discord/threads.ts#L4)
- scheduling reply parsing and session progression
- edit-event menu transitions

Definition of done:

- flow behavior is covered well enough to extract logic safely

### Phase 1: Extract application services from Discord entrypoints

Goal:

- move pure or mostly-pure logic out of `discord.js`-dependent handlers

Work:

- extract prompt-building and response-generation orchestration from `handleMessage()`
- extract scheduling flow state transitions from `src/commands/schedule.ts`
- extract edit-event flow transitions from `src/commands/edit-event.ts`
- extract join membership logic from `src/commands/join.ts` into a plain service

Likely new modules:

- `src/core/chat/respond.ts`
- `src/core/commands/join-service.ts`
- `src/core/commands/schedule-service.ts`
- `src/core/commands/edit-event-service.ts`

Definition of done:

- extracted services no longer import `discord.js`
- Discord modules become wrappers that adapt inputs and apply outputs

### Phase 2: Introduce transport-neutral request/effect types

Goal:

- make the core flows consume normalized request objects and emit effects

Work:

- define internal event types for message and command inputs
- define effect types for send, typing, open thread, and trace
- add a runtime dispatcher that routes inbound events to the correct service
- centralize dedupe and rate-limit decisions at the runtime boundary where practical

Definition of done:

- one runtime API can handle both normalized message events and normalized command events

### Phase 3: Migrate the Discord adapter onto the runtime

Goal:

- keep the bot running on Discord, but with most logic behind the new seam

Work:

- slim down [`src/discord/bot.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/discord/bot.ts#L36) so it mostly:
  - translates Discord events into runtime requests
  - invokes the runtime
  - applies produced effects back through Discord
- move thread opening and destination selection into Discord adapter helpers
- move avatar extraction, reply/defer handling, and trace-source shaping into adapter utilities

Definition of done:

- `src/discord/bot.ts` is mostly adapter code, not business logic

### Phase 4: Implement the console adapter and REPL

Goal:

- add a local console transport that exercises the same runtime

Work:

- create an in-memory conversation model for channels, threads, users, and messages
- add a readline entrypoint similar in spirit to `ai-in-action-bot`’s `bin/aiia-chat`
- support operator commands:
  - `/as`
  - `/users`
  - `/threads`
  - `/switch`
  - `/quit`
- support literal local commands like `/join`, `/paper-club`, and `/edit-event` rather than hiding commands behind a separate console-specific envelope

Definition of done:

- mention-driven chat works locally
- at least one command-driven flow works locally
- the REPL does not require real Discord

### Recommended migration order by flow

The safest sequence is:

1. extract mention-driven message response flow
2. extract `/join`
3. extract scheduling flow
4. extract edit-event flow
5. build the console adapter

Why this order:

- mention-driven chat is the narrowest core path
- `/join` is a simpler command-path pilot than scheduling
- scheduling and edit-event are more stateful and thread-heavy, so they should move after the runtime shape is proven

### Concrete file plan

Files likely to shrink:

- [`src/discord/bot.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/discord/bot.ts)
- [`src/commands/join.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/commands/join.ts)
- [`src/commands/schedule.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/commands/schedule.ts)
- [`src/commands/edit-event.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/commands/edit-event.ts)

Files likely to gain adapter responsibilities:

- [`src/discord/routing.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/discord/routing.ts)
- [`src/discord/threads.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/discord/threads.ts)

Files likely to be introduced:

- `src/core/runtime/types.ts`
- `src/core/runtime/dispatch.ts`
- `src/core/chat/respond.ts`
- `src/core/commands/join-service.ts`
- `src/core/commands/schedule-service.ts`
- `src/core/commands/edit-event-service.ts`
- `src/core/sessions/scheduling-store.ts`
- `src/core/sessions/edit-event-store.ts`
- `src/adapters/discord/*`
- `src/adapters/console/*`
- `bin/ls-chat` or similar console entrypoint

## Open Questions

Resolved decisions:

- The first REPL should support only `Slop`.
- Slash-command simulation should use literal local commands like `/join`, `/paper-club`, and `/edit-event`.
- Scheduling timeout warnings can remain transport-specific behavior.

Remaining decision:

- Dedupe should stay transport-specific at the adapter boundary.

Recommendation and rationale:

- Keep Discord dedupe in the Discord adapter because it exists to defend against Discord delivery behavior, not because the business logic needs it.
- The shared runtime should assume it is receiving a single normalized event to process.
- The console adapter can skip dedupe entirely at first, since local readline input is already serialized and developer-driven.
- If another transport later needs dedupe, add it in that adapter rather than forcing a global dedupe model into the runtime.

What this means concretely:

- `src/adapters/discord/*` should own message-ID based duplicate suppression.
- `src/core/runtime/*` should not require transport message IDs to function.
- The console REPL should not block on inventing a synthetic dedupe system unless a real bug appears.

## References

- [AI in Action Bot Console REPL Analysis](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/ttmp/2026/04/03/ADD_CONSOLE_REPL--add-console-repl-for-latent-space-bots/analysis/01-ai-in-action-bot-console-repl-analysis.md)
- [`src/discord/bot.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/discord/bot.ts)
- [`src/commands/join.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/commands/join.ts)
- [`src/commands/schedule.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/commands/schedule.ts)
- [`src/commands/edit-event.ts`](/Users/kball/workspaces/2026-04-03/console-chat/latent-space-bots/src/commands/edit-event.ts)
