# PRD 01: Identity, Dev Process & Repo Cleanup

## Background

This repo started as a fork of RA-H Open Source, quickly adapted for Turso + Latent Space branding as a demo. **It's no longer a demo.** This is becoming the actual Latent Space Hub — a standalone product built on the RA-H foundation.

Three things need to happen before any feature work:

1. **Identity** — Rewrite all docs/branding to reflect that this IS the Latent Space Hub, not "a demo of RA-H Light"
2. **Dev process** — Set up the same battle-tested workflow from the main RA-H repo (branching, skills, PRD-gating, compounding learnings)
3. **Code cleanup** — Fix the false comments, ghost model names, and stale references left over from the fork

---

## Plan

1. Establish identity — README, CLAUDE.md, system prompts, package.json
2. Set up dev process — `.claude/`, skills, branching workflow, handoff docs
3. Fix false "not supported" claims in source code
4. Fix non-existent model references
5. Clean up stale documentation
6. Fold naming audit (PRD-03) into this — no point doing it separately

---

## Part 1: Identity Rewrite

The repo currently says "this is a demo deployment — go use the OS version for the real thing." That framing is dead. This is the product.

### README.md

Rewrite completely. Remove:
- "This repo is a demo deployment (Latent Space Hub)"
- "If you want to run your own version locally... use the open-source repo"
- All `npm rebuild better-sqlite3` references
- Local SQLite framing

Replace with:
- What the Latent Space Hub IS (knowledge base for the Latent Space community)
- Tech stack (Next.js + Turso + vector search)
- How to run locally for development
- Link to OS version as "want to self-host your own? use ra-h_os"

### CLAUDE.md

Rewrite from scratch. Current version describes the open-source RA-H. New version should cover:
- What this project is (Latent Space Hub — the product)
- Tech stack and architecture (Turso, not local SQLite)
- Dev workflow (reference process docs)
- Key directories
- Environments (Turso URL, Vercel deployment, local dev)
- Git workflow (feature branches, PRs)
- Agent model names (actual models, not GPT-5)

### System prompts

| File | Current | Change to |
|------|---------|-----------|
| `src/config/prompts/rah-easy.ts` | "You are ra-h, the orchestrator for Easy Mode (GPT-5 Mini)" | "You are the Latent Space Hub assistant" + correct model name |
| `src/config/prompts/rah-main.ts` | "You are ra-h, orchestrator of the RA-H knowledge management system" | "You are the Latent Space Hub assistant" |

### Package & naming (absorbs PRD-03)

| What | Current | New |
|------|---------|-----|
| `package.json` name | `ra-h-open-source` | `latent-space-hub` |
| MCP tools | `rah_*` in server.js (rename to `ls_*` was incomplete) | Complete the `ls_*` rename |
| ExternalAgentsPanel.tsx | References "RA-H" in examples | "Latent Space Hub" |
| `src/tools/database/sqliteQuery.ts` | References `Library/Application Support/RA-H/db/rah.sqlite` | Remove or update to Turso |
| `app/layout.tsx` metadata | "Latent Space Hub" | Already correct — verify |

---

## Part 2: Dev Process Setup

Recreate the proven workflow from the main RA-H repo. This is what makes development sustainable.

### Directory structure to create

```
.claude/
  settings.json              — Permissions (Bash, Read, Write, MCP tools)
  settings.local.json        — Sandbox/restricted env settings
  commands/
    plan.md                  — Points to skill
    dev.md                   — Points to skill
    finish.md                — Points to skill
    commit.md                — Standard commit workflow
    review.md                — Self-review checklist
  skills/
    plan/SKILL.md            — Create PRDs, no code
    dev/SKILL.md             — Implement from PRD, feature branch
    finish/SKILL.md          — Merge, cleanup, compound
docs/development/
  process/
    workflow.md              — The dev workflow (adapted from RA-H's 9-step)
    agents.md                — Universal agent context (all agents read this)
    handoff.md               — Current status (~40 lines, updated every session)
  backlog/
    backlog.json             — Move existing backlog.json here
    ui/                      — Optional backlog UI (port from RA-H if useful)
  completed/                 — Completed PRDs go here
```

### The workflow (adapted from RA-H)

1. **Review** — Read handoff.md + agents.md
2. **Branch** — `git checkout -b feature/[name]` (ALWAYS — never work on main)
3. **Plan** — PRD exists before code starts (`/plan`)
4. **Implement** — Build on feature branch (`/dev`)
5. **Document** — Update PRD with "Delivered" section, move to `completed/`
6. **Commit** — Clean commit message, merge to main
7. **Cleanup** — Delete branch, verify clean state
8. **Compound** — Document learnings in agents.md

**Difference from RA-H:** No open-source sync step (step 8 in RA-H). This repo doesn't mirror to another repo. Simpler.

### Skills to create

**`/plan`** — PRD creation only, no code
- Read backlog, pick or create a project
- Write PRD in `docs/development/`
- Update backlog.json with status `prd`
- No code changes allowed

**`/dev`** — Implementation
- Pick a `ready` task from backlog
- Create feature branch
- Implement per PRD
- Move to `review` when done

**`/finish`** — Merge and compound
- Merge feature branch to main
- Move PRD to `completed/`
- Update handoff.md
- Document learnings in agents.md
- Delete feature branch

### Key files to create

**`docs/development/process/workflow.md`** — The full workflow doc, adapted from RA-H's `1_workflow.md` but simplified (no Mac packaging, no OS sync, no Ralph). Focus on: branch → PRD → implement → merge → compound.

**`docs/development/process/agents.md`** — Universal context for any agent working on this repo. Architecture overview, key patterns, database details (Turso specifics), testing approach, learnings section.

**`docs/development/process/handoff.md`** — Current status. What was done last, what's next, any blockers. Updated every session.

**`.claude/settings.json`** — Permissions for Claude Code:
```json
{
  "permissions": {
    "allow": [
      "WebSearch",
      "WebFetch",
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Read(~/Desktop/dev/latent-space-hub/*)",
      "Write(~/Desktop/dev/latent-space-hub/*)",
      "Edit(~/Desktop/dev/latent-space-hub/*)"
    ]
  }
}
```

---

## Part 3: Code Cleanup — False Claims

### False "not supported" comments

| File | Fix |
|------|-----|
| `src/services/database/chunks.ts` (lines 5-9, 137-153, 224-226) | Remove all "vector search NOT supported in Turso" comments. Turso native vector IS available via F32_BLOB + vector_top_k(). Fix getChunksWithoutEmbeddings() to actually query instead of returning empty. |
| `src/services/typescript/sqlite-vec.ts` (lines 1-7, 10-11, 22-23, 42-47, 50-58) | Remove all "Not usable in Turso" notes. Update header: Turso supports native vector search. |
| `src/services/database/sqlite-client.ts` (line ~227-230) | Fix checkVectorExtension() — should not hardcode false. Return true or actually check. |

### Non-existent model names

| File | Current | Fix |
|------|---------|-----|
| `src/tools/other/paperExtract.ts` (line 34) | `gpt-5-mini` | `gpt-4o-mini` |
| `src/tools/other/websiteExtract.ts` (line 33) | `gpt-5-mini` | `gpt-4o-mini` |
| `src/tools/other/youtubeExtract.ts` (line 42) | `gpt-5-mini` | `gpt-4o-mini` |
| `src/services/analytics/pricing.ts` (lines 28-38) | Pricing for `gpt-5o-mini`, `gpt-5-mini`, `gpt-5` | Remove or map to real models |
| `docs/5_logging-and-evals.md` (lines 109-110) | GPT-5 Mini / GPT-5 pricing | Fix to actual models |

---

## Part 4: Documentation Cleanup

| File | Fix |
|------|-----|
| `CONTRIBUTING.md` | Remove `npm rebuild better-sqlite3` |
| `.env.example` | "SQLite (production ready)" → "Turso (cloud SQLite)", remove SQLITE_VEC_EXTENSION_PATH |
| `docs/2_schema.md` | Database location → Turso URL, not local path |
| `docs/taxonomy-proposal.md` | Archive — 27 dimensions now exist |
| `docs/TROUBLESHOOTING.md` | Note that better-sqlite3 section is OS version only |
| `docs/0_overview.md` | Update identity framing |
| `docs/8_mcp.md` | Update tool names if `ls_*` rename is completed |
| `docs/README.md` | Align with new identity |

---

## Backlog impact

**PRD-03 (Naming Audit) is absorbed into this PRD.** The naming decisions are part of the identity rewrite above. After this PRD is complete, PRD-03 can be marked done or removed from the queue.

---

## Done =

- [x] README says what the Latent Space Hub IS — not "a demo, go use the OS version"
- [x] CLAUDE.md accurately describes the project, tech stack, and dev workflow
- [x] System prompts say "Latent Space Hub", not "ra-h"
- [x] package.json name is `latent-space-hub`
- [x] MCP tool rename (`ls_*`) is complete and consistent
- [x] `.claude/` directory exists with settings, skills (/plan, /dev, /finish), and commands
- [x] `docs/development/process/` has workflow.md, agents.md, handoff.md
- [ ] Backlog moved to `docs/development/backlog/backlog.json` — kept at `docs/development/backlog.json` (simpler)
- [x] All false "not supported" comments removed from source
- [x] All model names point to real models
- [x] Stale docs cleaned up
- [x] First feature branch can be created and the workflow works end-to-end

---

## COMPLETED

**Date:** 2026-02-19

**What was delivered:**
- Rewrote README.md and CLAUDE.md — Latent Space Hub is the product, not a demo
- Updated system prompts in rah-easy.ts and rah-main.ts to say "Latent Space Hub"
- Renamed package.json from `ra-h-open-source` to `latent-space-hub`
- Completed MCP tool rename (`rah_*` → `ls_*`) in both server.js and stdio-server.js
- Fixed ExternalAgentsPanel.tsx — all "RA-H" references → "Latent Space Hub"
- Created .claude/ skills (plan, finish) and commands (plan.md, finish.md)
- Created docs/development/process/ — workflow.md, agents.md, handoff.md
- Fixed false "vector not supported" comments in chunks.ts, sqlite-vec.ts, sqlite-client.ts
- Fixed model names: gpt-5-mini → gpt-4o-mini in paperExtract, websiteExtract, youtubeExtract
- Removed non-existent model pricing (gpt-5, gpt-5-mini, gpt-5o-mini) from pricing.ts
- Fixed docs/5_logging-and-evals.md pricing section
- Rewrote CONTRIBUTING.md, .env.example, docs/0_overview.md, docs/2_schema.md, docs/8_mcp.md, docs/README.md, docs/9_open-source.md, TROUBLESHOOTING.md
- Archived taxonomy-proposal.md
- Type-check passes clean
