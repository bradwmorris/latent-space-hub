# PRD 33: Slop System Message & Skills Overhaul

**Status:** Ready | **Created:** 2026-03-08

## 1. Background

The Slop bot's system message and skill loading were built up incrementally during PRD-32 (event scheduling). The result works but is messy — the system message is bloated at ~8,000 chars, skills were bolted on without design, the soul file duplicates tool descriptions that are already in the OpenAI function definitions, and there's no clear contract between what goes in the system prompt vs what the agent reads on demand. This needs a proper audit and overhaul.

### What exists today

**Repo:** `latent-space-bots` (all changes in this PRD are in the bots repo)

**System message assembly** (`src/index.ts:653`):
```
${profile.systemPrompt}        ← personas/slop.soul.md (~6,500 chars)
\n\n
${groundingLine}               ← hardcoded string (~220 chars)
\n
${profileStyleLine}            ← hardcoded string (~300 chars)
\n\n
${additionalSystemContext}     ← skills index + member context (~1,000 chars)
```
Total: ~8,050 chars. Verified via `scripts/debug-system-message.ts`.

**Full verified output:** `docs/slop-system-message-output.txt`
**Reference doc:** `docs/slop-system-message.md`

### What's wrong

1. **Soul file is too long and duplicates tool info.** The `Knowledge Base & Tools` section (~800 chars) lists all 9 tools with descriptions. But these same tools are ALSO passed as OpenAI function definitions with their own descriptions. The LLM sees tool info twice. The soul file should focus on persona/voice/approach — not tool documentation.

2. **Hardcoded grounding + style lines are redundant.** The soul file already has a `Grounding Rules` section and a `Voice` + `Format` section. Then two more hardcoded strings repeat similar instructions at `src/index.ts:645-648`. Three places saying "cite your sources" and "don't fabricate."

3. **Skills are a good pattern but poorly integrated.** Skills live in `skills/` with frontmatter. The system prompt shows the index (frontmatter only, 727 chars). The agent reads full bodies via `ls_read_skill`. But:
   - The `ls_read_skill` intercept was hacked into the agentic loop as a special case (lines 726-733)
   - There's still a stale `guides/member-profiles.md` file that nothing reads anymore
   - The skill names must match between the `skills/` dir filenames and what the agent passes to `ls_read_skill` — no validation
   - The `graph-search` skill body duplicates info from the soul file's tool section

4. **No clear contract.** There's no documented rule for what belongs in:
   - The soul file (persona, voice, behavioral rules)
   - Hardcoded lines (should these exist at all?)
   - Skill frontmatter (what the agent always sees)
   - Skill body (what the agent reads on demand)
   - OpenAI tool definitions (what the API provides)

5. **Member skill is duplicated.** `skills/member-profiles.md` and `guides/member-profiles.md` both exist. The old `guides/` one is dead code but still in the repo.

6. **No testing.** The debug script (`scripts/debug-system-message.ts`) prints the system message but there's no actual test that validates skills load correctly, that the agent can read them, or that the message stays under a size budget.

### Key files

| File | What it is |
|------|-----------|
| `personas/slop.soul.md` | Base persona — identity, voice, approach, grounding rules, tool list, member awareness |
| `src/index.ts:637-655` | `generateAgenticResponse` — assembles the system message |
| `src/index.ts:468-507` | Skill types, `loadSkillIndex()`, `readLocalSkill()`, `loadSkillsContext()` |
| `src/index.ts:726-733` | `ls_read_skill` intercept in agentic tool loop |
| `src/index.ts:260-282` | `formatMemberContext()` — builds `[MEMBER CONTEXT]` block |
| `src/index.ts:543-595` | `generateResponse()` — non-agentic path (smalltalk, /wassup) |
| `skills/event-scheduling.md` | Event scheduling skill (frontmatter + body) |
| `skills/graph-search.md` | Graph search skill (frontmatter + body) |
| `skills/member-profiles.md` | Member profiles skill (frontmatter + body) |
| `guides/member-profiles.md` | DEAD CODE — old version, nothing reads it |
| `scripts/debug-system-message.ts` | Debug script to print exact system message |
| `docs/slop-system-message.md` | Reference doc for system message structure |
| `docs/slop-system-message-output.txt` | Verified output from debug script |

### How Slop works (for context)

Slop is a Discord bot. It uses OpenRouter to call Claude Sonnet 4.6. It has two response paths:

1. **Agentic path** (most interactions): `generateAgenticResponse()`. System message + user message. LLM gets 9 read-only tools as OpenAI function definitions. Up to 5 tool-call rounds. The LLM decides what to search and when.

2. **Non-agentic path** (smalltalk, /wassup): `generateResponse()`. System message + user message + pre-fetched context string. No tool calling.

Both paths use the same system message structure. The `additionalSystemContext` (skills + member) is passed into both.

The agentic tool loop at `src/index.ts:712-735` executes tool calls from the LLM. `ls_read_skill` is intercepted to serve local `skills/` files first, falling back to MCP.

## 2. Plan

1. Audit and slim down the soul file — remove tool documentation (already in function defs), remove redundancy with hardcoded lines
2. Eliminate the hardcoded grounding/style lines — fold essential bits into the soul file, delete the rest
3. Define a clear contract for what goes where (soul vs skills vs tool defs)
4. Clean up the skill system — remove dead code, improve the intercept, validate loading
5. Review and improve each skill's frontmatter and body
6. Add a size budget test
7. Test end-to-end: trigger Slop with key scenarios, verify it reads skills and uses tools correctly

## 3. Implementation Details

### Step 1: Audit the soul file

**File:** `personas/slop.soul.md`

The soul file should contain ONLY:
- Identity and personality
- Voice and tone rules
- Approach and behavioral patterns
- Anti-patterns
- Format rules
- Latent Space DNA (community context)

It should NOT contain:
- Tool descriptions (these come from OpenAI function definitions)
- Grounding rules that duplicate the skill system ("cite your sources" etc — this should be in a skill or a compact directive)
- Member awareness boilerplate (this is covered by the member-profiles skill)

**Action:** Rewrite the soul file. Cut the `Knowledge Base & Tools` section and `Member Awareness` section. Add a brief pointer: "You have skills and tools available. Check your [SKILLS] index for operational guidance." Target: ~3,500 chars (down from 6,500).

### Step 2: Eliminate hardcoded lines

**File:** `src/index.ts` (lines 645-648 in `generateAgenticResponse`, lines 551-555 in `generateResponse`)

The `groundingLine` and `profileStyleLine` are hardcoded strings that repeat what the soul file and skills already say. Remove them entirely. If any essential instruction isn't covered by the soul file or skills, add it to the right place.

**Action:** Remove `groundingLine` and `profileStyleLine` variables. The system message becomes simply:
```
${profile.systemPrompt}\n\n${additionalSystemContext}
```

### Step 3: Define the contract

Create `docs/system-message-contract.md` documenting:

| Layer | What goes here | Size budget | Example |
|-------|---------------|-------------|---------|
| Soul file | Persona, voice, behavior, format | ~3,500 chars | "You are Slop..." |
| Skill frontmatter | Index of operational skills | ~100 chars/skill | "[SKILLS] Event Scheduling: ..." |
| Skill body | Detailed instructions read on demand | No limit | SQL queries, validation rules |
| Tool definitions | API-provided tool schemas | Automatic | OpenAI function calling format |
| Member context | Per-user personalization | ~300 chars | "[MEMBER CONTEXT] Name: ..." |

Total system message budget: **~5,000 chars** (down from 8,050).

### Step 4: Clean up the skill system

**Files:** `src/index.ts`, `skills/`, `guides/`

- Delete `guides/member-profiles.md` (dead code)
- Move the `ls_read_skill` intercept into `McpGraphClient` instead of inline in the agentic loop
- Add a `listLocalSkills()` method to `McpGraphClient` so `ls_list_skills` also returns local skills
- Validate that skill filenames match what the agent would pass to `ls_read_skill` (slugified)

### Step 5: Review each skill

**Files:** `skills/*.md`

For each skill, review:
- Is the frontmatter (`name`, `description`, `when_to_use`) clear and accurate?
- Does `when_to_use` actually trigger when it should?
- Is the body concise and actionable?
- Does it duplicate anything from the soul file?

Specific issues:
- `graph-search.md` body duplicates the soul file's tool section — should focus on search strategy and citation rules only, not tool descriptions
- `event-scheduling.md` is solid but could be more concise
- `member-profiles.md` has `<profile>` block instructions that are critical — make sure these aren't lost

### Step 6: Add size budget test

**File:** `scripts/debug-system-message.ts` or new test file

Add assertions:
- Total system message < 5,500 chars
- Soul file < 4,000 chars
- Skills index < 1,000 chars
- No skill appears in both `skills/` and `guides/`
- All skill files have valid frontmatter (name, description, when_to_use)

### Step 7: End-to-end test scenarios

After all changes, test these scenarios in Discord (or via the debug script + manual verification):

| Scenario | Expected behavior |
|----------|------------------|
| "show me upcoming paper clubs" | Reads event-scheduling skill → queries `node_type='event'` with `event_status='scheduled'` → returns 2 upcoming events |
| "what was the latest podcast about?" | Uses `ls_sqlite_query` or `ls_search_nodes` → returns latest podcast with link |
| "I'm an ML engineer at Google" | Reads member-profiles skill → responds naturally → appends `<profile>` block |
| `/paper-club` | Shows next 4 available Wednesdays, starts scheduling thread |
| "how do I schedule a talk?" | Reads event-scheduling skill → directs to `/paper-club` or `/builders-club` |
| Generic greeting "hey" | Responds in character, no tool calls, mentions `/join` if not a member |

## 4. Open Questions

- Should the soul file reference skills at all, or should the `[SKILLS]` block be self-sufficient?
- Should we add a `slop-persona` skill that the agent can re-read if it's drifting out of character? (Separates persona from system prompt)
- The non-agentic path (`generateResponse`) uses the same system message but doesn't have tool access — should skills even be injected there?
- Should there be a `max_tokens` increase now that the system prompt will be shorter? Currently 1200 for agentic, 700 for non-agentic.

---

**When complete:** Add `## COMPLETED` header with date and summary.
