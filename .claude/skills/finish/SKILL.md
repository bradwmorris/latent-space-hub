---
name: finish
description: Merge feature branch, update docs, clean up. Run after /dev completes.
---

# Finish Mode

## What This Does

Merges a completed feature branch to main, updates documentation, and cleans up.

## The Process

### 1. Verify

```bash
git status
npm run type-check
```

Ensure:
- On a feature branch (not main)
- All changes committed
- Type-check passes

### 2. Merge

```bash
git checkout main
git pull origin main
git merge feature/[name]
git push origin main
```

### 3. Clean Up

```bash
git branch -d feature/[name]
```

### 4. Update Handoff

Update `docs/development/process/handoff.md`:
- What was just completed
- What's next in the backlog
- Any blockers or notes

### 5. Report

> "Merged feature/[name] to main.
> Completed: [summary]
> Next up: [next backlog item]"

## Rules

- **Verify first** — never merge broken code
- **Update handoff** — next session needs context
- **Delete feature branch** — keep repo clean
