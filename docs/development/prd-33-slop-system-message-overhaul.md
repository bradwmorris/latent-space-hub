# PRD 33: Slop System Message & Interaction Overhaul

**Status:** Ready | **Created:** 2026-03-08

## 1. Background

The Slop bot's system message is ~8,050 chars assembled from a bloated soul file, redundant hardcoded lines, and bolted-on context. It works but is inefficient — the same instructions are stated 2-3 times in different places, tool documentation is duplicated from the OpenAI function definitions, and personality framing consumes ~6,500 chars when a fraction would suffice.

This PRD kills the soul file, replaces the entire system message with a minimal programmatic builder, and adds per-member interaction preferences so Slop adapts its style to each person over time.

### Repos involved

| Repo | What changes |
|------|-------------|
| `latent-space-bots` | All code changes — system prompt builder, member metadata, skill cleanup |
| `latent-space-hub` | PRD only (this file). No code changes needed — member metadata is JSON in the existing `nodes` table, no schema migration required. |

### What exists today

**System message assembly** (`src/index.ts:653`):
```
${profile.systemPrompt}        <- personas/slop.soul.md (~6,500 chars)
\n\n
${groundingLine}               <- hardcoded string (~220 chars)
\n
${profileStyleLine}            <- hardcoded string (~300 chars)
\n\n
${additionalSystemContext}     <- skills index (~727 chars) + member context (~300 chars)
```
Total: ~8,050 chars.

**Problems:**
1. Soul file is 6,500 chars of personality prose — most of which the model doesn't need to stay in character
2. Tool documentation in the soul file (~800 chars) duplicates the OpenAI function definitions
3. Grounding/citation rules stated 3 times: soul file `Grounding Rules`, hardcoded `groundingLine`, hardcoded `profileStyleLine`
4. Style/voice guidance in 3 places: soul file `Voice` + `Format`, hardcoded `profileStyleLine`
5. Member awareness in the soul file duplicates the `member-profiles` skill
6. No per-member personality adaptation — everyone gets the same Slop
7. Two response paths (`generateResponse` + `generateAgenticResponse`) each assemble the system message slightly differently with duplicated logic

### Key files (latent-space-bots)

| File | What it is |
|------|-----------|
| `personas/slop.soul.md` | 6,500-char persona file — TO BE DELETED |
| `src/index.ts:637-655` | `generateAgenticResponse` — system message assembly |
| `src/index.ts:565-595` | `generateResponse` — non-agentic system message assembly |
| `src/index.ts:260-282` | `formatMemberContext()` — builds `[MEMBER CONTEXT]` block |
| `src/index.ts:348-360` | `parseProfileBlock()` — extracts `<profile>` updates from responses |
| `src/index.ts:362-410` | `updateMemberAfterInteraction()` — persists member changes |
| `src/index.ts:466-525` | Skill loading (`loadSkillIndex`, `readLocalSkill`, `loadSkillsContext`) |
| `skills/*.md` | 3 skill files (event-scheduling, graph-search, member-profiles) |
| `guides/member-profiles.md` | DEAD CODE — old version, nothing reads it |

## 2. Design

### 2.1 Kill the soul file, build system prompt in code

Replace the 6,500-char `personas/slop.soul.md` with a `buildSystemPrompt()` function in code. The base persona should be **~400-600 chars** — minimal, direct, no prose. The model is smart enough to adopt a persona from a tight description.

**Target system message structure:**

```
[IDENTITY]
<~400-600 chars: who Slop is, how to behave, format rules>

[RULES]
<~200 chars: grounding, citations, no fabrication>

[SKILLS]
<skill index from frontmatter — ~700 chars>

[MEMBER CONTEXT]         (only if member exists)
<member profile + interaction preference — ~400 chars>

[MEMBER STATUS]          (only if NO member)
<one line: mention /join>
```

**Target total: ~2,000 chars** (down from 8,050). That's a 75% reduction.

The identity section replaces the soul file, the grounding line, AND the style line — all in one place, no duplication.

### 2.2 Per-member interaction preference

Add an `interaction_preference` field to the member metadata JSON. This is a free-text string that describes how Slop should interact with this specific member.

**How it develops:**
- Slop observes interactions and builds/refines the preference automatically
- Members can also tell Slop explicitly (e.g. "be more technical with me", "I like short answers")
- The preference is injected into the `[MEMBER CONTEXT]` block so Slop sees it every interaction
- Slop is instructed to respect and update this preference continuously

**Example member context with preference:**
```
[MEMBER CONTEXT]
Name: brad w morris
Role: founder and systems eng
Location: Byron Bay / SF
Interests: local-first architecture, knowledge graphs, RAG
Interaction preference: Direct and technical. Skip pleasantries. Challenge assumptions. Prefers short, dense responses with links to sources.
Use this to personalize your response. Update interaction_preference in <profile> when you learn more about how they like to interact.
```

**How it persists:**
- The existing `<profile>` block mechanism (parsed from Slop's response, stripped before sending to user) already supports `role`, `company`, `location`, `interests`
- Add `interaction_preference` as a new field in the `<profile>` block
- `updateMemberAfterInteraction()` already merges profile updates into metadata — extend it to handle `interaction_preference`

### 2.3 Unified system prompt assembly

Currently there are two functions that build system messages differently:
- `generateAgenticResponse()` — agentic path with tools
- `generateResponse()` — non-agentic path (smalltalk, /wassup)

Create a single `buildSystemPrompt()` function used by both paths. The only difference between paths should be whether tools are passed — the system message itself should be identical.

### 2.4 Skill cleanup

- Delete `guides/member-profiles.md` (dead code)
- Update `member-profiles` skill to include `interaction_preference` guidance
- Keep the skill system as-is (it's already a good progressive-disclosure pattern)
- Remove tool documentation from `graph-search` skill body (it duplicates function definitions)

## 3. Implementation

### Step 1: Create `buildSystemPrompt()` function

**File:** `src/index.ts` (or extract to `src/systemPrompt.ts`)

```typescript
function buildSystemPrompt(options: {
  skillsContext: string;
  memberContext: string;
}): string {
  const identity = [
    "[IDENTITY]",
    "You are Slop — Latent Space community's AI. Opinionated, sharp, concise.",
    "Lead with your take. Challenge lazy thinking. Cite sources from the knowledge base.",
    "Keep responses short and punchy — this is Discord, not an essay.",
    "Bold your strongest claims. End with a question or challenge when debating.",
    "Never agree just to be agreeable. Never hedge. Never use filler.",
    "If you don't know something, say so. Never fabricate names, dates, episodes, quotes, or links.",
  ].join("\n");

  const rules = [
    "[RULES]",
    "Search the knowledge base before answering factual questions.",
    "Always link to sources: [Title](url). Never reference content without a link.",
    "Mark speculation: 'No hard data, but...' or 'Extrapolating here...'",
  ].join("\n");

  return [identity, rules, options.skillsContext, options.memberContext]
    .filter(Boolean)
    .join("\n\n");
}
```

This is ~600 chars for identity + rules. The exact wording should be iterated during implementation, but the principle is: **minimal, direct, no prose**.

### Step 2: Add `interaction_preference` to member flow

**2a. Update `formatMemberContext()`**

Add the `interaction_preference` field to the output:

```typescript
function formatMemberContext(member: MemberNode): string {
  // ... existing fields ...
  if (member.metadata.interaction_preference) {
    profileLines.push(`Interaction preference: ${member.metadata.interaction_preference}`);
  }
  return (
    `[MEMBER CONTEXT]\n` +
    profileLines.join("\n") + "\n" +
    `Use this to personalize your response. Update interaction_preference in <profile> when you learn how they like to interact.`
  );
}
```

**2b. Update `MemberMetadata` type**

Add `interaction_preference?: string` to the type.

**2c. Update `parseMetadata()`**

Parse `interaction_preference` from the raw metadata JSON.

**2d. Update `parseProfileBlock()`**

The return type already supports arbitrary fields — just update the type annotation to include `interaction_preference?: string`.

**2e. Update `updateMemberAfterInteraction()`**

```typescript
if (profileUpdate) {
  // ... existing role/company/location/interests merging ...
  if (profileUpdate.interaction_preference) {
    metadata.interaction_preference = profileUpdate.interaction_preference;
  }
}
```

### Step 3: Unify system prompt assembly

Replace the duplicated system message construction in both `generateAgenticResponse()` and `generateResponse()` with a single call to `buildSystemPrompt()`.

**In `generateAgenticResponse()`:**
- Remove `groundingLine` and `profileStyleLine` variables
- Replace system message content with `buildSystemPrompt({ skillsContext, memberContext })`

**In `generateResponse()`:**
- Remove `groundingLine` and `profileStyleLine` variables
- Replace system message content with `buildSystemPrompt({ skillsContext, memberContext })`

### Step 4: Delete soul file and dead code

- Delete `personas/slop.soul.md`
- Delete `guides/member-profiles.md`
- Remove `readSoulDocument()` function
- Remove `BotProfileSeed.soulFile` field
- Update `buildProfiles()` — no longer needs to read soul file
- Simplify `BotProfile` — `systemPrompt` field is no longer populated from a file

### Step 5: Update skills

**`skills/member-profiles.md`** — Add `interaction_preference` to the `<profile>` block documentation:

```markdown
Available fields: `role`, `company`, `location`, `interests` (string array), `interaction_preference` (string).

The `interaction_preference` field captures how this member prefers to interact:
- Observe their communication style (technical depth, brevity, humor)
- Note explicit preferences ("be more concise", "challenge me more")
- Update this field as you learn more about them
```

**`skills/graph-search.md`** — Remove the tool descriptions table from the body. Keep only:
- Content types table (node_type reference)
- Search strategy (which tool to use when)
- Citation rules

**`skills/event-scheduling.md`** — Keep as-is (already concise and actionable).

### Step 6: Update docs

- Update `docs/slop-system-message.md` to reflect the new structure
- Delete `docs/slop-system-message-output.txt` (will be stale)

## 4. Verification

After implementation, verify with these scenarios:

| Scenario | Expected |
|----------|----------|
| Factual question from non-member | Searches KB, cites sources, mentions `/join` once |
| Factual question from member with preference | Searches KB, adapts style to preference |
| Member says "be more technical with me" | Updates `interaction_preference` via `<profile>` block |
| Greeting from member | Short, in-character response, no tool calls |
| "show me upcoming paper clubs" | Reads event-scheduling skill, queries events |
| `/paper-club` slash command | Scheduling flow works unchanged |
| Member shares personal info | Updates profile fields via `<profile>` block |

## 5. Size Budget

| Section | Target chars |
|---------|-------------|
| Identity | ~400 |
| Rules | ~200 |
| Skills index | ~700 |
| Member context | ~400 |
| **Total** | **~1,700** |

Down from 8,050. The exact identity/rules text will be iterated during implementation.

## 6. Non-goals

- Changing the agentic loop mechanics (tool calling, max rounds, etc.)
- Changing the model (stays on Claude Sonnet 4.6 via OpenRouter)
- Modifying the MCP server or hub codebase
- Adding new tools or skills beyond updating existing ones
- Changing the scheduling flow (slash commands, thread management)

---

---

## COMPLETED

**Date:** 2026-03-08

**What was delivered:**

All changes in `latent-space-bots` repo, branch `feature/prd-33-slop-overhaul`:

- Deleted `personas/slop.soul.md` — replaced with `buildSystemPrompt()` function (~600 chars identity + rules)
- Removed hardcoded `groundingLine` and `profileStyleLine` — folded into `buildSystemPrompt()`
- Added `interaction_preference` field to `MemberMetadata` type
- Updated `formatMemberContext()` to inject interaction preference into `[MEMBER CONTEXT]`
- Updated `parseMetadata()` to parse `interaction_preference` from database
- Updated `parseProfileBlock()` to support `interaction_preference` extraction from responses
- Updated `updateMemberAfterInteraction()` to persist `interaction_preference` changes
- Unified system prompt assembly — one `buildSystemPrompt()` used by both `generateResponse()` and `generateAgenticResponse()`
- Updated `skills/member-profiles.md` with `interaction_preference` documentation
- Trimmed `skills/graph-search.md` — removed tool list that duplicated OpenAI function definitions
- Deleted dead code: `guides/member-profiles.md`, `docs/slop-system-message-output.txt`
- Updated `docs/slop-system-message.md` to reflect new structure
- System message reduced from ~8,050 to ~1,700 chars (75% reduction)
- Build passes cleanly (`npm run build`)
