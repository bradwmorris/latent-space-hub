---
name: plan
description: Create a PRD for a new project. Research, scope, write — no code.
---

# Plan Mode

## What This Does

Creates a PRD (Product Requirements Document) for a project. PRDs go in `docs/development/`. No code changes allowed in plan mode.

## Before Starting

Read these files:
1. `CLAUDE.md` — project context
2. `docs/development/backlog/backlog.json` — existing queue
3. `docs/development/process.md` — workflow

## The Process

### 1. Understand the Goal

Ask clarifying questions if needed. Understand:
- What problem does this solve?
- What's the scope? (Be ruthless about cutting)
- What are the dependencies?

### 2. Research

Read relevant source files to understand:
- Current architecture
- What exists vs. what needs to be built
- Where changes need to happen (file by file)

### 3. Write the PRD

Create `docs/development/prd-XX-[name].md`:

```markdown
# PRD XX: [Title]

## Background
[Why this matters, what's broken/missing]

## Plan
[Numbered steps]

## Part N: [Section]
### File: path/to/file
[Exact changes — what to add/remove/modify]

## Done =
- [ ] [Acceptance criteria]
```

### 4. Update Backlog

Add the project to `docs/development/backlog/backlog.json`:
- Add to `queue` array (position based on priority)
- Add project entry with `status: "ready"`
- Set `prd` path

## Rules

- **No code changes** — PRDs only
- **Be specific** — list exact files, exact changes
- **Be honest about scope** — if it's big, say so
- **Dependencies matter** — note what must be done first
