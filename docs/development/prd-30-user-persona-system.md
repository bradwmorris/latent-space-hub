# PRD 30: User-Specific Persona System — Bot Learns Per-User Interaction Style

**Status:** Draft | **Created:** 2026-03-07

## 1. Background

Slop already knows WHO users are (member nodes with interests, role, company) and WHAT they've asked about (member notes, content edges). But it doesn't know HOW each user wants to be interacted with. We want the bot to learn and adapt its interaction style per user — some people want deep technical detail, others want casual banter, some prefer bullet points, others want narrative.

**Foundation that exists:**
- Member nodes with extensible metadata (`src/types/database.ts`)
- Pre-response member lookup on every interaction (`latent-space-bots/src/index.ts`)
- System prompt injection of member context
- Post-interaction metadata updates via `updateMemberAfterInteraction()`
- Profile block parsing (`<profile>...</profile>`) for structured data extraction

## 2. Plan

1. Extend MemberMetadata with interaction style fields
2. Add style observation to post-interaction updates
3. Inject learned style into system prompt
4. Add explicit `/style` command for users to set preferences
5. Create a "persona skill" that instructs the bot on style adaptation

## 3. Implementation Details

### Step 1: Extend MemberMetadata

**Modify:** `src/types/database.ts` (latent-space-hub)

Add to `MemberMetadata`:
```typescript
export interface MemberMetadata {
  // ... existing fields ...

  // Interaction style (learned + explicit)
  interaction_style?: {
    tone?: 'casual' | 'professional' | 'technical' | 'playful';
    verbosity?: 'concise' | 'moderate' | 'detailed';
    format_preference?: 'prose' | 'bullets' | 'mixed';
    expertise_level?: 'beginner' | 'intermediate' | 'expert';
    debate_preference?: 'challenge-me' | 'neutral' | 'supportive';
    notes?: string;              // Free-form style observations
    source?: 'observed' | 'explicit' | 'both';
    last_updated?: string;
  };
}
```

### Step 2: Style Observation (Post-Interaction Learning)

**Modify:** `latent-space-bots/src/index.ts` — `updateMemberAfterInteraction()`

After each interaction, instruct the model to observe style preferences:

**Extend the profile block extraction.** Currently parses `<profile>` for role/company/location. Add `<style>` block:

```typescript
// In the bot's system prompt (slop.soul.md), add instruction:
// "If you notice the user has a distinct communication style preference,
//  append a <style> block: <style>{"tone":"casual","verbosity":"concise"}</style>"

function parseStyleBlock(response: string): Partial<InteractionStyle> | null {
  const match = response.match(/<style>([\s\S]*?)<\/style>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
```

**Merge logic:** Observed style doesn't overwrite explicit preferences. Use `source` field:
- If user set via `/style` → `source: 'explicit'`, only explicit commands can change it
- If observed → `source: 'observed'`, new observations can update
- If both → `source: 'both'`, explicit takes priority

### Step 3: System Prompt Style Injection

**Modify:** `latent-space-bots/src/index.ts` — `formatMemberContext()`

Currently injects:
```
[MEMBER CONTEXT]
Name: Alice
Role: ML Engineer
Interests: RAG, agents...
```

Add style section:
```
[INTERACTION STYLE]
Tone: casual
Detail level: concise
Format: bullets preferred
Expertise: expert — skip basics
Debate style: challenge-me — push back on their ideas
Notes: "Prefers direct, no fluff. Likes when you cite specific episodes."
```

**If no style learned yet:** Omit the section entirely (don't inject defaults).

### Step 4: `/style` Slash Command

**Modify:** `latent-space-bots/src/index.ts`

**New command:** `/style`

```
/style tone:casual verbosity:concise format:bullets
```

**Options:**
| Option | Values | Default |
|--------|--------|---------|
| `tone` | casual, professional, technical, playful | (none — adapt) |
| `verbosity` | concise, moderate, detailed | (none — adapt) |
| `format` | prose, bullets, mixed | (none — adapt) |
| `expertise` | beginner, intermediate, expert | (none — adapt) |
| `debate` | challenge-me, neutral, supportive | (none — adapt) |

**Implementation:**
1. Register slash command with Discord (add to command registration block)
2. Parse options from interaction
3. Update member node metadata via MCP `ls_update_node`
4. Respond: "Got it — I'll keep it {tone} and {verbosity}. You can change this anytime with `/style`."
5. Set `source: 'explicit'`

### Step 5: Persona Skill (Bot Instruction Document)

**New file:** `latent-space-bots/guides/user-personas.md` (or skills/ if migrated)

```markdown
---
name: User Personas
description: How to adapt interaction style per user
immutable: true
---

## Style Adaptation Rules

1. **Check member context first.** If [INTERACTION STYLE] is present, follow it.
2. **Explicit > Observed.** If the user set style via /style, respect it absolutely.
3. **Observe naturally.** If a user consistently asks for bullet points, writes short messages, or requests less detail — note the pattern.
4. **Don't announce adaptation.** Just do it. Don't say "I notice you prefer..."
5. **Style applies to HOW, not WHAT.** The knowledge and accuracy stay the same. Only presentation changes.
6. **When in doubt, match energy.** Short question → short answer. Long thoughtful question → detailed response.

## Style Block Format

When you observe a strong style preference, append to your response:
<style>{"tone":"casual","verbosity":"concise"}</style>

Only include fields you're confident about. Don't guess.

## Examples

- User writes "yo what's the tldr on the latest ep" → tone: casual, verbosity: concise
- User writes "Can you provide a detailed analysis of the architectural decisions discussed in episode 47?" → tone: professional, verbosity: detailed, expertise: expert
- User sends bullet-point questions → format: bullets
```

### Step 6: Style Reset

Users should be able to reset their style preferences:

```
/style reset
```

This clears `interaction_style` from their member metadata and lets the bot start fresh.

## 4. Key Files

| File | Repo | Action |
|------|------|--------|
| `src/types/database.ts` | latent-space-hub | Modify (extend MemberMetadata) |
| `src/index.ts` | latent-space-bots | Modify (style parsing, prompt injection, /style command) |
| `personas/slop.soul.md` | latent-space-bots | Modify (add style adaptation instructions) |
| `guides/user-personas.md` | latent-space-bots | Create |
| `guides/member-profiles.md` | latent-space-bots | Modify (add style block to extraction instructions) |

## 5. Flags

- **Cross-repo:** Changes span both `latent-space-hub` (types) and `latent-space-bots` (bot logic). Need to coordinate deployment.
- **Privacy:** Style preferences are stored in the knowledge graph. Users should know this — the `/style` response should mention that preferences are stored. The `/join` flow already implies this.
- **Cold start:** New users have no style data. The bot should behave naturally (match energy) until enough signal accumulates. Don't default to any style — absence of style = adapt per message.
- **Style block in responses:** The `<style>` block will be visible in Discord messages. Need to strip it before sending to Discord (same pattern as `<profile>` block stripping).
- **Depends on:** Member nodes (PRD 19 — completed). Does NOT depend on guides→skills migration (PRD 29), but the persona skill file location may change if that lands first.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
