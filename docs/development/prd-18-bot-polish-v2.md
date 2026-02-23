# PRD 18: Bot Polish v2 — Slop-only, model upgrade, source linking

## Status: Complete

## Background

The bot system currently runs two personas (Sig and Slop) via a single Discord.js process. Sig is vestigial — it's not part of the automated feed, and having two bots creates confusion. Time to simplify: Slop only, better model, always link sources.

**Repos affected:**
- `latent-space-bots` — bot code (primary)
- `latent-space-hub` — documentation + hub-side config

---

## Current State

### Three Interaction Points

1. **Automated kickoff** — After ingestion posts to `#announcements`, a yap message tags Slop to discuss. Slop searches the graph, surfaces connections, sparks discussion.
2. **@Slop mentions** — Users can @mention Slop anywhere in allowed channels. A thread is created (`slop: [topic]`), and follow-up messages in the thread continue the conversation.
3. **Slash commands** — `/tldr <query>` and `/wassup` are registered for both bots. Should be Slop-only.

### Current Model Config

```env
SIG_MODEL=anthropic/claude-sonnet-4
SLOP_MODEL=moonshotai/kimi-k2
```

### Problems

- Sig still responds to @mentions and slash commands — confusing when only Slop is the product
- Slop runs on Kimi K-2 — should be Claude Sonnet 4.6 (`anthropic/claude-sonnet-4-6`)
- Slop doesn't consistently provide direct links to source content (episodes, articles, AINews)
- Documentation (bots.md, user-facing /docs, guides) still references dual-bot setup

---

## Changes

### Part 0: Remove Sig (latent-space-bots)

**Goal:** Slop is the only bot. No Sig responses, no Sig slash commands.

#### `src/index.ts`

1. **Remove Sig bot login.** Remove the Sig Discord client instantiation and login. The process should only create and log in one bot (Slop).

2. **Remove Sig slash command registration.** Slash commands (`/tldr`, `/wassup`) should only register under Slop's app ID. Remove any registration under Sig's app ID.

3. **Remove Sig message handling.** Remove `shouldRespondToMessage` checks for Sig. Remove thread ownership routing for `sig:*` threads. Only Slop responds.

4. **Remove Sig kickoff handling.** The `/internal/kickoff` endpoint should only trigger Slop (it likely already does, but verify and clean up any Sig references).

5. **Clean up Sig environment variables.** Remove from `.env.example`:
   - `BOT_TOKEN_SIG`
   - `BOT_APP_ID_SIG`
   - `SIG_MODEL`

6. **Keep `personas/sig.soul.md`** — archive, don't delete. May return later.

#### Result: Single bot process, single Discord client, single set of slash commands.

### Part 1: Model Upgrade (latent-space-bots)

**Goal:** Slop uses Claude Sonnet 4.6 via OpenRouter.

#### `.env.example`

```env
SLOP_MODEL=anthropic/claude-sonnet-4-6
```

#### `src/index.ts`

Update the default model fallback (if hardcoded anywhere) from `moonshotai/kimi-k2` to `anthropic/claude-sonnet-4-6`.

#### Railway environment

After code changes, update the `SLOP_MODEL` env var on Railway to `anthropic/claude-sonnet-4-6`.

### Part 2: Source Linking (latent-space-bots)

**Goal:** Slop always provides direct links to source material when citing content.

#### Current behavior

The response generation assembles context from chunk search results. Each chunk has a parent node, and each node has a `link` field (YouTube URL, Substack URL, etc.). The sources footer shows node titles but may not consistently include clickable links.

#### Changes to `src/index.ts`

1. **Include source links in context assembly.** When building the context string from search results, include the node's `link` field alongside title and text:
   ```
   [Episode Title](https://youtube.com/watch?v=...)
   > chunk text here...
   ```

2. **Update system prompt instructions.** Add to the style instructions injected with the SOUL prompt:
   ```
   IMPORTANT: When referencing specific content (episodes, articles, AINews), always include the direct link.
   Format: [Title](url). Never reference content without linking to it.
   ```

3. **Sources footer.** The existing sources footer should show clickable markdown links, not just titles. Verify and fix if needed.

#### Result: Every Slop response that references an episode, article, or AINews issue includes a clickable link to the source.

### Part 3: Documentation Updates (latent-space-hub)

**Goal:** All documentation reflects Slop-only, updated model, source linking.

#### `docs/bots.md`

1. Rename from "Discord Bots — Sig & Slop" to "Discord Bot — Slop"
2. Remove Sig section entirely
3. Update architecture diagram — single bot user, not two
4. Update slash commands table — Slop-only, `/tldr` and `/wassup`
5. Remove `/ask`, `/search`, `/episode`, `/debate` (these were from v1, replaced by `/tldr` + `/wassup`)
6. Note model: Claude Sonnet 4.6 via OpenRouter
7. Add source linking behavior to "How Bots Connect to the KB" section

#### `src/config/docs/index.md` (user-facing /docs)

1. Update "Talk to Slop in Discord" section:
   - Commands table: `/tldr` and `/wassup` only
   - Remove any Sig references
   - Note that Slop always links to source material

#### `src/config/guides/bots.md` (MCP guide)

1. Update to reflect Slop-only
2. Update commands
3. Remove Sig references

#### `.env.example` (latent-space-hub)

1. Remove `DISCORD_SIG_USER_ID` if present

---

## Verification

After all changes:

1. **Slash commands** — `/tldr` and `/wassup` respond as Slop only. No Sig commands visible.
2. **@Slop mention** — Creates thread, responds with graph context + source links.
3. **Automated kickoff** — New content triggers announcement + yap with Slop discussion including source links.
4. **@Sig mention** — No response (bot not logged in).
5. **Source links** — Every response referencing content includes clickable link to source.
6. **Model** — Responses come from Claude Sonnet 4.6 (check model badge in footer if present).

---

## Files Changed

### latent-space-bots (separate repo)

| File | Change |
|------|--------|
| `src/index.ts` | Remove Sig client, Sig message handling, Sig slash command registration. Update default model. Add source links to context + system prompt. |
| `.env.example` | Remove Sig vars, update SLOP_MODEL to claude-sonnet-4-6 |
| `personas/sig.soul.md` | Keep as archive (no changes) |

### latent-space-hub (this repo)

| File | Change |
|------|--------|
| `docs/bots.md` | Rewrite for Slop-only: remove Sig, update commands, architecture, model |
| `src/config/docs/index.md` | Update Discord section: Slop-only commands, source linking |
| `src/config/guides/bots.md` | Update for Slop-only |
| `.env.example` | Remove DISCORD_SIG_USER_ID |

---

## COMPLETED
**Date:** 2026-02-23
**What was delivered:**
- Removed Sig entirely from latent-space-bots (client, thread routing, profile seeds, env vars)
- Updated Slop default model from `moonshotai/kimi-k2` to `anthropic/claude-sonnet-4-6`
- Added source link instructions to system prompt and grounding line
- Formatted context assembly with markdown links so Slop passes them through in responses
- Rewrote `docs/bots.md` for Slop-only with updated architecture, commands, and source linking docs
- Updated user-facing `/docs` with correct slash commands (`/tldr`, `/wassup`) and interaction methods
- Updated MCP guide (`src/config/guides/bots.md`) for Slop-only
- Removed `DISCORD_SIG_USER_ID` from `.env.example`
- Bot repo committed and pushed to `latent-space-bots/main`
