---
description: Load Project Context
---

Read the following files in order to understand the current state of the project:

1. First, read `CLAUDE.md` for project identity, tech stack, and conventions
2. Then read `docs/development/backlog.json` for the prioritized roadmap
3. Then read `docs/development/process/handoff.md` for current status and recent sessions
4. Then read `docs/development/process/workflow.md` for the dev loop and slash commands
5. Finally, run `git status --porcelain` to check workspace state

After reading all files, respond with:

> "I've reviewed the context. Current branch is [X], latest work was [Y], next up is [Z]. Ready for instructions."

If there are uncommitted changes, ask whether to commit, stash, or discard before proceeding.
