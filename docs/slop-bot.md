# Slop Bot — Developer Reference

Slop is the Latent Space Discord bot. Lives in a separate repo (`latent-space-bots`), connects to the same Turso database as the hub.

## Architecture

```
Discord (WebSocket gateway)
    |
    v
latent-space-bots (Railway, always-on)
    |
    +-- src/index.ts          -- All bot logic (1600 lines, single file)
    +-- src/mcpGraphClient.ts  -- MCP client wrapper
    +-- skills/*.md            -- Skill files (event-scheduling, graph-search, member-profiles)
    |
    +-- MCP subprocess (stdio) --> latent-space-hub-mcp --> Turso
    +-- Direct DB connection   --> Turso (for member writes, event creation, trace logging)
    +-- OpenRouter API         --> Claude Sonnet 4.6
```

## System Prompt

Built by `buildSystemPrompt()` in `src/index.ts`. ~1,700 chars total.

| Section | Size | Content |
|---------|------|---------|
| `[IDENTITY]` | ~400 chars | Who Slop is, behavioral rules |
| `[RULES]` | ~200 chars | Cite sources, no fabrication, link everything |
| `[SKILLS]` | ~700 chars | Skill index from frontmatter (loaded at startup) |
| `[MEMBER CONTEXT]` | ~400 chars | Member profile + interaction preference (per user) |

No external persona file. No hardcoded grounding/style lines. One function, one place.

## Two Response Paths

| Path | Function | When | Tools? |
|------|----------|------|--------|
| Agentic | `generateAgenticResponse()` | Most interactions | Yes — 9 read-only MCP tools, up to 5 rounds |
| Non-agentic | `generateResponse()` | Greetings | No — pre-fetched context passed in user message |

Both use the same system prompt from `buildSystemPrompt()`.

## Slash Commands

All defined and handled in `src/index.ts`.

| Command | Handler | Write path |
|---------|---------|-----------|
| `/join` | `createMemberNodeFromUser()` | Creates member node via MCP |
| `/paper-club` | `handleSchedulingReply()` → `createScheduledEvent()` | Creates event node + member edge via MCP |
| `/builders-club` | Same as above | Same |

## Member System

| Operation | How | Where |
|-----------|-----|-------|
| Lookup | `lookupMember()` → `mcpGraph.lookupMemberByDiscordId()` | Before every response |
| Profile update | LLM appends `<profile>{...}</profile>` → `parseProfileBlock()` strips it → `updateMemberAfterInteraction()` | After response sent (non-blocking) |
| Interaction log | Appends summary line to member notes | After response sent |
| Content edges | Creates member → node edges for discussed content | After response sent |

### Member Metadata Fields

```typescript
{
  discord_id, discord_handle, avatar_url,
  joined_at, last_active, interaction_count,
  role?, company?, location?,
  interests?: string[],
  interaction_preference?: string  // how this member likes to interact
}
```

## Skills

Three skill files in `skills/`:

| File | Loaded into prompt | Body served on demand |
|------|-------------------|---------------------|
| `event-scheduling.md` | Frontmatter in `[SKILLS]` index | SQL patterns for event queries, scheduling instructions |
| `graph-search.md` | Frontmatter in `[SKILLS]` index | Content types table, search strategy, citation rules |
| `member-profiles.md` | Frontmatter in `[SKILLS]` index | `<profile>` block format, interaction preference guidance |

The LLM calls `ls_read_skill(name)` to load a skill body. The call is intercepted — local files served first, MCP fallback.

## Event Scheduling Flow

Entirely deterministic code — the LLM is not involved.

1. `/paper-club` or `/builders-club` → validate member exists
2. Calculate next 6 target weekdays → query DB for booked dates → show up to 4 available
3. Create scheduling session in memory (keyed by thread ID, expires after 10 min)
4. User replies with number + title → `createScheduledEvent()`:
   - Creates event node via `mcpGraph.createEventNode()`
   - Creates member → event edge
   - Confirms in thread

## Trace Logging

Every interaction → `INSERT INTO chats` with metadata:
- Discord context (user, channel, message ID)
- Full tool call traces (tool, args, result summary, duration)
- Retrieval method, member ID, model, latency

## Key Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `BOT_TOKEN_SLOP` | Yes | Discord bot token |
| `TURSO_DATABASE_URL` | Yes | Turso connection |
| `TURSO_AUTH_TOKEN` | Yes | Turso auth |
| `OPENROUTER_API_KEY` | Yes | LLM access |
| `BOT_APP_ID_SLOP` | No | For slash command registration |
| `ALLOWED_CHANNEL_IDS` | No | Comma-separated; empty = all channels |
| `SLOP_MODEL` | No | Default: `anthropic/claude-sonnet-4-6` |
| `DEBATE_KICKOFF_SECRET` | No | Enables kickoff API |
| `BOT_TALK_CHANNEL_ID` | No | Default channel for kickoffs |
