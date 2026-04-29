# PRD-48: Backlog Ops Dashboard — Next.js UI, GitHub Issue Sync, and Slop Discord Intake

**Status:** Draft | **Created:** 2026-04-10

## 1. Background

Latent Space Hub already has the raw planning artifacts for an operating backlog:

- `docs/development/backlog/backlog.json` holds the active queue and completed items
- `docs/development/prd-*.md` holds the actual product requirement documents
- `docs/development/backlog/ui/` contains a legacy local-only backlog UI modeled after RA-H

That is enough for local repo workflow, but not enough for the product shape we want now.

We want the hub itself to expose a real backlog dashboard, with the same general operating feel as the RA-H board/calendar flow, but implemented natively inside the existing Vercel-hosted Next.js app and aligned with the current Hub UI. We also want every backlog item / PRD to have a corresponding GitHub issue, and we want Slop to be able to create new backlog items from Discord without manually editing JSON and Markdown files.

This is not a straight UI port. The RA-H backlog UI is a local HTML/CSS/Python tool. Latent Space Hub is a deployed Next.js app on Vercel, and Vercel runtime writes to the repo filesystem are not persistent. That changes the architecture: production writes must go through GitHub, not local file edits.

## 2. Due-Diligence Findings

### Current state in this repo

1. Backlog source files already exist:
   - `docs/development/backlog/backlog.json`
   - `docs/development/prd-*.md`
   - `docs/development/backlog/prd-template.md`
2. The hub already supports separate app routes such as `/evals`; there is no backlog route yet.
3. The main app shell is custom UI, not a generic admin panel. Any backlog surface should match the existing app tokens and patterns, not embed the old RA-H static UI.
4. `apps/bots/slop/` is already in this repo and has a clean slash-command dispatch path:
   - command registration in `apps/bots/slop/src/commands/register.ts`
   - command dispatch in `apps/bots/slop/src/core/runtime/dispatch.ts`
5. Slop currently has database access patterns and Discord interaction plumbing, but there is no GitHub integration and no repo-write service yet.

### Constraints that materially affect the design

1. **Vercel runtime is not a durable write target.**
   - Reading committed files is fine.
   - Mutating `docs/development/*` at runtime is not a real production persistence strategy.
2. **The backlog schema is not yet rich enough for the desired UI.**
   - There is no `due_date`, so there is nothing real to place on a calendar.
   - There is no GitHub issue metadata, so issue sync cannot be shown or reconciled.
3. **GitHub issue creation introduces a second system of record.**
   - We need to define which system is authoritative for planning state.
   - This PRD sets the repo files as the planning source of truth and treats GitHub issues as linked execution handles.
4. **Discord-driven repo writes are sensitive.**
   - Slop should not blindly create repo artifacts from any casual mention.
   - There needs to be an explicit confirmation and permission boundary.

## 3. Product Decisions

### Decision 1: Add a dedicated `/backlog` route, not a bolt-on inside the existing dashboard tab set

This should be a first-class route such as `/backlog`, similar to `/evals`, because:

- it is an operational surface, not general browse/search UI
- it needs more room than a small panel or feed tab
- it reduces risk to the current home experience

We can still add a navigation entry from the main app shell, but the backlog dashboard itself should be its own page.

### Decision 2: Keep repo files as the canonical planning artifacts

Canonical source of truth remains:

- `docs/development/backlog/backlog.json`
- `docs/development/prd-*.md`

GitHub issues are required mirrors, not replacements. The backlog JSON + PRD files continue to define:

- queue order
- PRD numbering
- structured tasks
- internal notes
- completion movement into the completed archive

### Decision 3: All production writes go through a GitHub-backed service

The deployed app and Slop both use the same server-side GitHub write service to:

- create or update the corresponding GitHub issue
- create or update the PRD file in the repo
- update `backlog.json`

Local file writes remain acceptable for local development utilities only.

### Decision 4: Discord writes must be explicit and gated

Slop should support backlog creation from Discord, but not as an unguarded free-write capability.

Required safety model:

- only approved users / roles can execute repo-backed backlog creation
- Slop drafts the artifact and shows a confirmation summary before writing
- idempotency markers prevent duplicate issues / duplicate backlog items on retries

## 4. Target Outcome

After this PRD ships:

1. Latent Space Hub has a deployed `/backlog` dashboard built in Next.js.
2. The dashboard supports at least:
   - board / kanban view by backlog status
   - calendar view for items with `due_date`
   - PRD detail view for the linked markdown doc
   - visible GitHub issue linkage on every active card
3. New backlog entries created from the web UI or from Slop create:
   - a backlog project entry in `backlog.json`
   - a PRD markdown file
   - a corresponding GitHub issue
4. Existing active backlog items are backfilled so they each have a linked GitHub issue.
5. The old local-only Python backlog UI becomes legacy and is no longer the primary workflow.

## 5. Plan

1. Create a backlog domain layer and extend the backlog schema for due dates and GitHub issue metadata
2. Build read APIs and a dedicated `/backlog` page in the Next.js app
3. Implement GitHub-backed mutation flows for create/update/reorder/reschedule
4. Backfill GitHub issues for existing active backlog items and add drift reconciliation
5. Add Discord-native backlog creation through Slop with permissions and confirmation
6. Document the new workflow and deprecate the legacy local-only backlog UI

## 6. Implementation Details

### Step 1: Backlog domain model and schema upgrade

Create a dedicated backlog service layer instead of scattering JSON parsing across routes.

**New files:**

- `src/services/backlog/schema.ts`
- `src/services/backlog/storage.ts`
- `src/services/backlog/github.ts`
- `src/services/backlog/prd.ts`
- `src/services/backlog/types.ts`

**Backlog schema additions:**

```json
{
  "id": "backlog-dashboard-github-sync",
  "title": "Backlog Ops Dashboard — Next.js UI, GitHub issue sync, and Slop Discord intake",
  "status": "prd",
  "type": "feature",
  "priority": "medium",
  "prd": "docs/development/prd-48-backlog-dashboard-github-sync.md",
  "notes": "Build a deployed backlog dashboard inside the Hub, sync every active project to GitHub issues, and let Slop create new backlog items from Discord via a safe repo-write path.",
  "due_date": "2026-04-30",
  "github": {
    "issue_number": 123,
    "issue_url": "https://github.com/OWNER/REPO/issues/123",
    "issue_state": "open",
    "synced_at": "2026-04-10T12:34:56Z"
  },
  "source": {
    "surface": "web",
    "actor": "brad",
    "conversation_id": null
  },
  "tasks": [
    { "text": "Step 1: ...", "done": false }
  ]
}
```

**Rules:**

- `due_date` is optional but required for calendar placement
- `github` is required for active items after backfill
- `source.surface` is one of `manual`, `web`, `discord`
- completed archive entries do not need full live GitHub metadata unless we choose to backfill them later

**Storage design:**

- In local development, reads can come from the local repo files
- In deployed environments, reads should prefer GitHub fetch so the UI reflects the latest committed state without requiring a rebuild
- All writes use GitHub, even in production web flows

### Step 2: Backlog read APIs

Add dedicated read routes:

- `app/api/backlog/route.ts`
- `app/api/backlog/[id]/route.ts`

**`GET /api/backlog` response should include:**

- ordered queue items
- grouped counts by status
- lightweight completed summary
- calendar-ready items (`due_date`)
- GitHub issue metadata summary

**`GET /api/backlog/[id]` should include:**

- full project metadata
- resolved PRD markdown content
- GitHub issue metadata
- derived progress fields (`doneCount`, `taskCount`)

This route should parse the PRD file from the repo and return it as content for a detail panel / page.

### Step 3: Next.js backlog dashboard UI

Create a dedicated route:

- `app/backlog/page.tsx`
- `app/backlog/BacklogClient.tsx`

Suggested component split:

- `src/components/backlog/BacklogBoard.tsx`
- `src/components/backlog/BacklogCalendar.tsx`
- `src/components/backlog/BacklogCard.tsx`
- `src/components/backlog/BacklogDetailPanel.tsx`
- `src/components/backlog/BacklogToolbar.tsx`

**UI requirements:**

1. **Board view**
   - Columns by current status: `prd`, `ready`, `in_progress`, `review`, `blocked`
   - Cards show title, type, priority, progress, due date, and GitHub issue badge
   - Clicking a card opens PRD detail
2. **Calendar view**
   - Month grid is enough for v1
   - Only items with `due_date` render on calendar
   - Cards can be dragged or edited to move due date if the mutation API is ready
3. **PRD detail**
   - Render markdown from the linked PRD
   - Show buttons / links for:
     - open PRD file in GitHub
     - open corresponding GitHub issue
4. **Visual design**
   - Use existing app theme tokens and typography
   - Do not port the RA-H static CSS verbatim
   - Keep the board visually related to the existing Hub app, not like an unrelated embedded tool

**Navigation:**

- add a dedicated entry point from the app shell
- simplest approach: a left-rail link near `Evals` / `Docs`

### Step 4: GitHub-backed mutation service

Add write endpoints behind server-only secrets:

- `app/api/backlog/projects/route.ts` for create
- `app/api/backlog/projects/[id]/route.ts` for update
- `app/api/backlog/reorder/route.ts` for queue movement
- `app/api/backlog/schedule/route.ts` for due-date updates

These routes should call a shared GitHub mutation layer, not hand-roll `fetch` logic inline.

**Required env vars:**

- `GITHUB_BACKLOG_TOKEN`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_DEFAULT_BRANCH`
- `BACKLOG_ADMIN_SECRET` or equivalent admin gate

**Create flow (authoritative path):**

1. Build deterministic backlog id from title
2. Search GitHub for an existing issue containing hidden marker `<!-- backlog-id: ... -->`
3. If no matching issue exists, create the issue first
4. Fetch latest `backlog.json` from GitHub
5. Allocate `nextPrdNumber`
6. Create PRD markdown file content from template + request payload
7. Update `backlog.json` with new project, queue insertion, issue metadata, and incremented `nextPrdNumber`
8. Commit file changes to the repo via GitHub contents/git API

**Failure handling:**

- If issue creation succeeds but repo commit fails, label the issue `backlog-sync-failed`
- Retries must reuse the same hidden `backlog-id` marker instead of creating a second issue
- All write responses should return enough metadata for the caller to display partial-failure state clearly

**Authority rules:**

- Backlog status and queue order are authoritative in repo files
- GitHub issue state is mirrored for visibility
- Closing an issue directly in GitHub should not silently rewrite `backlog.json`; instead show drift until reconciled

### Step 5: Existing backlog issue backfill and reconciliation

We need a one-time backfill for active projects already in `backlog.json`.

**Create:**

- `scripts/backlog/backfill-github-issues.ts`

**Behavior:**

1. Scan active projects in `projects`
2. Skip any with `status = completed`
3. For any item missing `github.issue_number`, create or find the matching issue
4. Update `backlog.json` with issue metadata

**Reconciliation mode:**

Add a second script or admin action that checks for:

- issue missing
- issue closed while backlog item still active
- title mismatch
- PRD link missing from issue body

This does not auto-resolve every mismatch in v1, but it should make drift visible.

### Step 6: Slop Discord intake

Original plan was `/backlog-create`, which created a backlog item, PRD, and GitHub issue through the Hub API. The command surface is now simplified to `/issue`, and the active write path only creates a GitHub issue from Slop. Backlog/PRD promotion should happen as a separate triage step.

**Files to add / modify:**

- `apps/bots/slop/src/commands/register.ts`
- `apps/bots/slop/src/core/runtime/types.ts`
- `apps/bots/slop/src/core/runtime/dispatch.ts`
- `apps/bots/slop/src/core/commands/issue-service.ts`
- `apps/bots/slop/src/config.ts`

**Command surface:**

Use an explicit slash-command path, not fully implicit casual chat writes.

Command:

- `/issue`

Arguments:

- `title`
- `body`
- optional `labels`

**Interaction flow:**

1. User invokes `/issue`
2. Slop validates permission / role
3. Slop creates the GitHub issue
4. Slop replies with the issue link

This command does not write PRDs or modify `backlog.json`.

**Natural-language support:**

After the slash-command flow is stable, Slop can route messages like "create a backlog PRD for X" into the exact same confirmation flow. The write path should remain the same; only the intake surface changes.

### Step 7: Documentation and legacy UI deprecation

Update:

- `docs/development/backlog/README.md`
- `docs/contributing.md`
- any handover docs that still reference the local Python backlog UI as primary

Document:

- how backlog reads work in local vs deployed mode
- which token powers GitHub writes
- how issue backfill is run
- how Slop backlog creation is permissioned

The old `docs/development/backlog/ui/` folder can remain temporarily as a local reference, but it should be explicitly marked as legacy once `/backlog` ships.

## 7. Key Files

| File | Action |
|------|--------|
| `app/backlog/page.tsx` | Create |
| `app/backlog/BacklogClient.tsx` | Create |
| `app/api/backlog/route.ts` | Create |
| `app/api/backlog/[id]/route.ts` | Create |
| `app/api/backlog/projects/route.ts` | Create |
| `app/api/backlog/projects/[id]/route.ts` | Create |
| `app/api/backlog/reorder/route.ts` | Create |
| `app/api/backlog/schedule/route.ts` | Create |
| `src/components/backlog/*` | Create |
| `src/services/backlog/*` | Create |
| `docs/development/backlog/backlog.json` | Modify |
| `docs/development/backlog/README.md` | Modify |
| `apps/bots/slop/src/commands/register.ts` | Modify |
| `apps/bots/slop/src/core/runtime/types.ts` | Modify |
| `apps/bots/slop/src/core/runtime/dispatch.ts` | Modify |
| `apps/bots/slop/src/core/commands/issue-service.ts` | Create |
| `scripts/backlog/backfill-github-issues.ts` | Create |

## 8. Constraints

- **No production filesystem writes on Vercel.** GitHub is the write path.
- **No straight RA-H UI transplant.** Rebuild for the current Next.js app and design system.
- **No unauthenticated public mutations.** Read-only public access is optional; write access is gated.
- **No duplicate issue creation on retries.** Hidden idempotency markers are required.
- **No silent two-way authority confusion.** Repo backlog stays canonical for planning state.

## 9. Open Questions / Notes

- Should `/backlog` be public read-only, or internal-only from day one? This PRD is compatible with either, but write controls must stay private.
- Should completed historical items also be backfilled to GitHub issues? Recommended answer: no for v1; only active items need guaranteed issue parity.
- If branch protections later block direct commits to `main`, the mutation layer should be the seam where we switch to branch + PR creation without rewriting the UI or bot flows.
- The public roadmap PRD (`docs/development/prd-39-public-roadmap-and-contributing.md`) can later consume the same read API surface, but this PRD should not block on that page shipping first.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
