# Development Process — Latent Space Hub

Simple. No over-engineering.

## How Work Gets Done

1. **Pick from backlog** — `docs/development/backlog.json` has the queue in priority order
2. **Do the work** — Branch if needed, implement, test
3. **Update backlog** — Mark tasks done, update status
4. **Commit and push**

## Backlog

**File:** `docs/development/backlog.json`

```json
{
  "queue": ["id-1", "id-2"],     // Priority order
  "projects": { ... },           // Project details
  "completed": [ ... ]           // Done
}
```

**Status values:** `ready` → `in_progress` → `completed`

**Priority:** Work the queue top to bottom. Dependencies noted in project notes.

## Key Constraint

This is a fork of RA-H Open Source. The main app (`ra-h`) will continue evolving. Changes here may diverge from main — that's expected. But schema changes in main should be evaluated for porting.

## Environments

| What | Where |
|------|-------|
| Database | Turso: `latentspace-bradwmorris.aws-us-east-2.turso.io` |
| App | Next.js on Vercel (readonly mode) |
| Local dev | `npm run dev` → localhost:3000 |
| MCP server | `apps/mcp-server/` (HTTP + stdio) |

## Git

Commit often. Push at end of session. Branch for big changes.
