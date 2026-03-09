# PRD: Public Roadmap & Contributing Guide

**Status:** Draft | **Created:** 2026-03-09

## 1. Background

The development process (backlog, PRDs, contribution workflow) currently lives in `docs/development/` — only visible to people who clone the repo and read JSON/Markdown files. Community members who want to contribute have no way to see what's planned, what's in progress, or where help is needed — and the existing `docs/contributing.md` is developer-focused (git clone, env vars, TypeScript).

This PRD adds a public-facing `/docs/roadmap` page and a `/docs/contributing` page to the web app so that **anyone** — including non-technical community members — can see what's being built, suggest ideas, and find ways to contribute that don't require writing code.

## 2. Plan

1. Create a `/docs/roadmap` page that renders the backlog as a human-readable roadmap
2. Create a `/docs/contributing` page aimed at non-technical contributors
3. Add both pages to the docs navigation
4. Add an API route that reads `backlog.json` and returns a public-safe summary

## 3. Implementation Details

### Step 1: Roadmap API route — `app/api/roadmap/route.ts`

Read `docs/development/backlog/backlog.json` and return a sanitized public view:

```typescript
// For each project in queue, return:
{
  title: string;         // from project.title
  status: string;        // ready | in_progress | review
  type: string;          // feature | refactor | fix | ops
  description: string;   // from project.notes (first sentence only)
  tasks: {
    total: number;
    done: number;
  };
}
// Recently completed (last 5 from completed array)
```

**Strip:** file paths, owner field, full notes, PRD paths. Only expose what a community member needs to see.

### Step 2: Roadmap doc content — `src/config/docs/roadmap.md`

```markdown
---
title: Roadmap
description: What's being built, what's next, and what just shipped.
---

# Roadmap

What's being built in Latent Space Hub — updated live from the development backlog.

## How the process works

Every feature starts as a **PRD** (Product Requirements Document) — a short spec that defines what to build and why. PRDs live in the repo and get executed in priority order.

**Status flow:** `ready` → `in_progress` → `review` → `completed`

## Current queue

<!-- Rendered dynamically by the roadmap component -->

## Recently shipped

<!-- Rendered dynamically from completed array -->

## Suggest an idea

Have an idea for the hub? Ways to contribute:

1. **Discord** — Drop your idea in the community channel or tell Slop about it
2. **GitHub Issue** — Open an issue on [latent-space-hub](https://github.com/bradwmorris/latent-space-hub/issues) with a title and short description
3. **Paper Club / Builders Club** — Present your idea at a community session

You don't need to write code or a PRD. Just describe the problem or opportunity — we'll take it from there.
```

**Note:** The dynamic sections (current queue, recently shipped) will be rendered by a custom component embedded in the docs page, not by the markdown itself. The markdown provides the static framing.

### Step 3: Roadmap component — `src/components/docs/RoadmapView.tsx`

A React component that fetches `/api/roadmap` and renders:

**Current queue** — cards showing:
- Title
- Status badge (color-coded: grey=ready, blue=in_progress, yellow=review)
- Type badge (feature/refactor/fix/ops)
- Progress bar (tasks done / total)
- One-line description

**Recently shipped** — simpler list:
- Title
- Completed date

Keep it clean and simple. No interactivity beyond reading.

### Step 4: Contributing doc content — `src/config/docs/contributing.md`

A non-technical contributing guide. Distinct from `docs/contributing.md` (which is the developer guide).

```markdown
---
title: Contributing
description: How to contribute to Latent Space Hub — no coding required.
---

# Contributing

You don't need to be a developer to contribute to Latent Space Hub. Here's how community members help build and improve the wiki-base.

## Non-technical contributions

### Suggest content to index
See a great Latent Space podcast episode, article, or talk that's missing? Tell Slop about it in Discord or open a GitHub issue. The ingestion pipeline handles the rest.

### Report issues
Something wrong in the wiki-base? A bad description, wrong date, missing link? Flag it in Discord or open a GitHub issue. Every correction improves the graph.

### Propose features
Have an idea for the hub? Check the [Roadmap](/docs/roadmap) to see what's planned, then suggest yours:
- Drop it in Discord
- Open a GitHub issue
- Mention it to Slop — it gets logged

### Present at community events
Use `/paper-club` or `/builders-club` in Discord to schedule a session. Share what you're working on or a paper you've read.

### Curate the graph
As a community member, your interactions with Slop help train the knowledge graph. Ask questions, challenge answers, and explore topics — this directly improves search quality and content connections.

## Technical contributions

If you want to write code, see the [developer contributing guide](https://github.com/bradwmorris/latent-space-hub/blob/main/docs/contributing.md) for setup instructions, git workflow, and architecture.

## How decisions get made

Features are planned as PRDs (Product Requirements Documents) and tracked in a [public backlog](/docs/roadmap). The queue is worked top-to-bottom by priority. Community suggestions get evaluated and added to the backlog when they fit the project's direction.
```

### Step 5: Add to docs navigation

Update `docsService.ts`:

Add `'roadmap'` and `'contributing'` to `DOC_ORDER` array. Place them at the end:

```typescript
const DOC_ORDER = [
  'overview',
  'database',
  'ingestion',
  'index-search',
  'mcp-server',
  'slop-bot',
  'evals',
  'roadmap',
  'contributing',
];
```

### Step 6: Wire roadmap component into docs page

The `/docs/roadmap` page needs to render the `RoadmapView` component after the markdown content. Modify the docs `[slug]/page.tsx` to detect the `roadmap` slug and append the component below the markdown.

## 4. Constraints

- **No new dependencies.** Uses existing docs infrastructure.
- **Read-only.** This is a display surface, not an admin panel. No editing backlog from the UI.
- **Safe data only.** The API strips file paths, owner info, and internal notes. Only titles, statuses, types, and progress are public.
- **Works in readonly mode.** This is a docs page — it works on the public Vercel deployment.

## 5. Open Questions / Notes

- The roadmap data could be statically rendered at build time instead of fetched client-side. Start with client-side fetch for simplicity; optimize later if needed.
- Consider whether completed PRDs should link to their GitHub commits/PRs for transparency. Not in v1 — keep it simple.
- The contributing page deliberately doesn't mention env vars, TypeScript, or git commands. That's what `docs/contributing.md` (the developer guide) is for.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
