---
title: Skills
description: Markdown instruction sets that tell agents how to operate — two separate skill systems for two separate agents.
---

# Skills

Skills are markdown files with YAML frontmatter that give agents operational instructions. There are two independent skill systems.

## Two Skill Systems

| | Slop Skills | Agent Skills |
|---|------------|--------------|
| **Used by** | Discord bot (Slop) | MCP clients (Claude Code, Cursor, etc.) |
| **Location** | `latent-space-bots/skills/` | `latent-space-hub/src/config/skills/agents/` |
| **Count** | 4 | 2 |
| **Loaded** | At bot startup, cached in memory | On demand via `ls_read_skill` tool |
| **Read tool** | `slop_read_skill(name)` | `ls_read_skill(name)` |

---

## Slop Skills

Four required skills loaded at startup. Slop's system prompt includes a one-liner for each; the full content is available via `slop_read_skill(name)`.

See [Start Here](/docs/skills/start-here) for the entry-point skill.

### Skill List

| Skill | File | Purpose |
|-------|------|---------|
| **Start Here** | `start-here.md` | Runtime orientation — node types, search strategy, answer patterns |
| **DB Operations** | `db-operations.md` | Schema reference, search patterns, citation rules, response framing |
| **Member Profiles** | `member-profiles.md` | How Slop builds Discord member profiles, `<profile>` block format |
| **Event Scheduling** | `event-scheduling.md` | Paper Club / Builders Club schedule, event queries |

### How They Load

Skills are validated and cached at startup in `latent-space-bots/src/skills/index.ts`:

```typescript
const REQUIRED_SLOP_SKILL_ORDER = ['Start Here', 'DB Operations', 'Member Profiles', 'Event Scheduling'];

// Loaded once, cached globally
function loadSkillsContextFromLocalStrict(): string {
  // Reads each .md file from skills/ directory
  // Validates all 4 required skills exist
  // Returns formatted string: "- **SkillName**: description" per skill
}
```

The cached context is injected into every system prompt under the `[SKILLS]` section. At runtime, the LLM can call `slop_read_skill(name)` to load the full markdown content of any skill.

### Skill Frontmatter Format

```yaml
---
name: Start Here
skill_group: slop
description: Slop Discord runtime orientation. Start here for every thread.
when_to_use: First skill for every Slop thread/mention.
when_not_to_use: Not for agent or MCP workflows.
success_criteria: Slop retrieves before claiming, cites sources, stays concise.
---
```

---

## Agent Skills

Two skills for external agents connecting via MCP.

See [Agent](/docs/skills/agent) for the main operating policy.

### Skill List

| Skill | File | Purpose |
|-------|------|---------|
| **Agent** | `agent.md` | Operating policy — behavioral contract, retrieval pattern, citation rules |
| **MCP Quickstart** | `mcp-quickstart.md` | Setup guide — config JSON, example queries, available tools |

### How They Load

Agent skills live in `src/config/skills/agents/` and are served by the skill service:

```typescript
// src/services/skills/skillService.ts
const BUNDLED_AGENT_SKILLS_DIR = path.join(process.cwd(), 'src/config/skills/agents');
const AGENT_SKILL_ORDER = ['agent.md', 'mcp-quickstart.md'];

// Read via API or MCP tool
export function readSkill(name: string): Skill | null {
  // Searches agent skills, then slop skills, then user skills
  // Returns { name, description, skillGroup, content, fileName }
}
```

MCP clients call `ls_read_skill("agent")` to load the operating policy, then `ls_read_skill("mcp-quickstart")` for setup details.

---

## Skill Service

The hub's skill service (`src/services/skills/skillService.ts`) manages three sources:

```typescript
const BUNDLED_AGENT_SKILLS_DIR = 'src/config/skills/agents';      // 2 agent skills
const BUNDLED_SLOP_SKILLS_DIR  = '../latent-space-bots/skills';    // 4 slop skills
const USER_SKILLS_DIR          = '~/.latent-space-hub/skills';     // up to 10 user skills
```

**API endpoints:**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/skills` | List all skills (agent + slop + user) |
| GET | `/api/skills/[name]` | Read single skill content |
| PUT | `/api/skills/[name]` | Create/update user skill |
| DELETE | `/api/skills/[name]` | Delete user skill |

All skills appear in the docs sidebar under their respective sections (Slop Skills / Agent Skills).
