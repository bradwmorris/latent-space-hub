# Development Workflow

## The Loop

1. **Review** — Read `handoff.md` + `CLAUDE.md` for context
2. **Pick** — Take the next `ready` item from `backlog.json`
3. **Branch** — `git checkout -b feature/[name]` (never work on main)
4. **Plan** — PRD exists before code starts (`/plan`)
5. **Implement** — Build on feature branch (`/dev`)
6. **Verify** — `npm run type-check` + `npm run build`
7. **Commit** — Clean commit, mark tasks done in backlog
8. **Merge** — After review, merge to main (`/finish`)
9. **Closeout** — Move completed PRD to `docs/development/completed-prds/`, update `backlog.json`
10. **Handover** — Update `process/handoff.md` and `process/agents.md`

## Slash Commands

| Command | Mode | What it does |
|---------|------|-------------|
| `/plan` | Plan | Create a PRD — research, scope, no code |
| `/dev` | Dev | Implement a PRD — branch, code, commit |
| `/finish` | Finish | Merge, clean up, update docs |

## Branching

```
main ─────────────────────────────────────
  \                              /
   feature/dev-setup-cleanup ───
```

- Feature branches for all work
- One branch per PRD
- Merge to main after review
- Delete feature branch after merge

## Backlog

**File:** `docs/development/backlog.json`

```
queue: [project IDs in priority order]
projects: { id → project details }
completed: [finished project IDs]
```

**Status flow:** `ready` → `in_progress` → `review` → `completed`

## PRDs

- Active PRDs live in `docs/development/`
- Completed PRDs move to `docs/development/completed-prds/`
- Named `prd-XX-[slug].md`
- Are the spec — implementation follows the PRD exactly
- Get a "COMPLETED" section appended when done
