---
name: dev
description: Execute a PRD end-to-end. Branch, implement everything in the PRD, commit. Autonomous — the PRD is the spec.
---

# Development Mode

## Context

**Latent Space Hub:** A Next.js 15 knowledge base for the Latent Space community. Turso (cloud SQLite) backend, deployed on Vercel. NOT a demo — this is the product.

## Before Starting

Read these files in order:
1. `CLAUDE.md` — project overview, architecture, key constraints
2. `docs/development/backlog.json` — the work queue
3. The PRD for the task you're executing

Then confirm:
> "Loaded context. Working on: [PRD title]. Creating branch: feature/[name]."

## The Process

### 1. Branch

**ALWAYS create a feature branch. Never work on main.**

```bash
git status --porcelain
git checkout main && git pull origin main
git checkout -b feature/[project-id]
```

### 2. Read the PRD

The PRD IS the spec. It tells you exactly what to change, file by file. Read it completely before writing any code.

### 3. Execute

Work through the PRD systematically. The PRD has been scoped — don't ask for confirmation on each step. Just do the work.

**Rules:**
- Follow the PRD's implementation details precisely
- If the PRD says to change a file, change it
- If something is ambiguous, use your judgment and note what you decided
- Run `npm run type-check` after changes to catch type errors
- If type-check fails, fix it before moving on

### 4. Verify

After all changes:
```bash
npm run type-check        # Must pass
npm run build 2>&1 | head -50  # Check for build errors
```

If the app has UI changes, note them for manual testing but don't block on it.

### 5. Commit and Report

Update the PRD — add completion section:
```markdown
---
## COMPLETED
**Date:** [Today's date]
**What was delivered:** [Brief summary of all changes]
```

Update `docs/development/backlog.json` — mark tasks as done, update project status.

Commit everything:
```bash
git add .
git commit -m "feat: [concise description]

- [Key change 1]
- [Key change 2]
- [Key change 3]

Generated with Claude Code"
```

Then report:
> "Done. Branch: feature/[name].
> Changes: [summary]
> Type-check: [pass/fail]
> Ready for review and merge."

## Key Rules

- **Never work on main** — feature branch first
- **PRD is the spec** — execute it, don't question each step
- **Fix what you break** — type-check must pass
- **One commit** — all changes in a single clean commit on the feature branch
- **Don't merge** — leave on the feature branch for review
