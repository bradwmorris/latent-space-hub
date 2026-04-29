# Development Backlog

This folder contains the prioritized backlog of development tasks for Latent Space Hub.

## Files

- **`backlog.json`** - Master list of all pending tasks, ordered by priority
- **`prd-template.md`** - Template for creating PRDs from backlog items

## Primary UI

- Deployed app route: `/backlog`
- Data source: `docs/development/backlog/backlog.json` + linked `docs/development/prd-*.md`
- Mutations: GitHub-backed when `GITHUB_BACKLOG_TOKEN` + repo env vars are configured
- Discord intake: Slop `/issue` creates a GitHub issue only. Triage can promote issues into backlog/PRD work later.

## Required Env Vars For Mutations

- `GITHUB_BACKLOG_TOKEN`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_DEFAULT_BRANCH`
- `BACKLOG_ADMIN_SECRET`

For Discord-driven issue creation, the bot needs `GITHUB_ISSUE_TOKEN` with Issues read/write access and repo owner/name.

To backfill GitHub issues for existing active backlog items, call `POST /api/backlog/github/backfill` with `x-backlog-admin-secret`.

## Legacy Local UI

```bash
cd docs/development/backlog/ui
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py
# Open http://localhost:5561
```

The Python UI is now a legacy local reference surface. The Next.js `/backlog` route is the primary operating dashboard.

## How This Works

### For Humans

1. Add new ideas to `backlog.json` or via the UI at localhost:5561
2. Update task status as work progresses
3. When ready to execute a task, create a PRD using the template
4. Follow the standard workflow in `docs/development/process/workflow.md`

### For Agents

When asked to create a PRD from a backlog item:

1. Read `backlog.json` to find the task
2. Read `prd-template.md` for the required format
3. Create `docs/development/prd-[number]-[task-name].md`
4. Update the backlog entry status to `in_progress`
5. Wait for human approval before implementing

When asked to add a new task:

1. Read `backlog.json` to understand the format
2. Add the new project with status `prd` or `ready`
3. Add the project id to the end of `queue`

## Task Structure

Each project in `backlog.json`:

```json
{
  "id": "project-slug",
  "title": "Project Title",
  "status": "ready",
  "type": "feature",
  "priority": "high",
  "prd": "docs/development/prd-XX-name.md",
  "notes": "Context",
  "due_date": "2026-04-30",
  "github": {
    "issue_number": 123,
    "issue_url": "https://github.com/OWNER/REPO/issues/123"
  },
  "tasks": [
    { "text": "Task description", "done": false }
  ]
}
```

## Status Definitions

| Status | Meaning |
|--------|---------|
| `prd` | PRD created, not yet approved for work |
| `ready` | Approved, ready to pick up |
| `in_progress` | Actively being worked on |
| `review` | Code complete, needs review/manual follow-up |
| `blocked` | Waiting on external dependency |
| `completed` | Done (moves to completed array) |

## Priority

Tasks are ordered by position in the `queue` array (first = highest priority).

## Graduating to Completed

When a project is done:

1. Mark all tasks as done
2. Change status to `completed` (UI handles moving to completed array)
3. Move PRD to `docs/development/completed-prds/`
4. Update `docs/development/process/handoff.md`
