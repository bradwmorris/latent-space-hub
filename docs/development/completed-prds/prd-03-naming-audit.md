# PRD 03: Naming Audit

## Background

The project has gone through multiple identity changes (RA-H → RA-H Open Source → Latent Space Hub). Naming is inconsistent across Turso instance, codebase, docs, and deployment.

## Plan

1. Audit all naming across the project
2. Make decisions on each
3. Apply changes

## Items to Decide

| What | Current | Decision needed |
|------|---------|----------------|
| Turso DB | `latentspace-bradwmorris.aws-us-east-2.turso.io` | Keep for now. Revisit only when moving to org-owned Turso infra. |
| GitHub repo | `bradwmorris/latent-space-hub` | Confirmed canonical repo for now. |
| package.json name | `latent-space-hub` | Already correct. |
| package-lock name | `ra-h-open-source` | Rename to `latent-space-hub`. |
| MCP tools | `ls_*` namespace | Confirmed final namespace in both MCP servers. |
| UI branding | "Latent Space Hub" + purple | Confirmed. |
| Deployment URL defaults | `ra-h.app` defaults in production script | Replace with `https://latent-space-hub.vercel.app` defaults. |
| CLAUDE.md title | `Latent Space Hub` | Already correct. |
| Internal references | Mixed `rah_*`, `ra-h`, `RA-H` strings | Rename user-facing docs/surfaces; keep protocol/history/internal IDs where intentional. |

## Done =

- All naming decisions documented
- package.json, CLAUDE.md, docs updated
- No confusing RA-H references remain in user-facing surfaces
- Turso instance naming decided

## Decisions

1. Keep existing Turso hostname (`latentspace-bradwmorris...`) for now to avoid migration risk during active development.
2. Treat `bradwmorris/latent-space-hub` as canonical GitHub remote until an org transfer happens.
3. Lock MCP external tool names to `ls_*`.
4. Define naming boundary:
   - User-facing docs and UI copy should use "Latent Space Hub".
   - Legacy internal/protocol identifiers (`application/x-rah-*`, historical migration assets, archived notes) are allowed when not user-facing.

## Audit + Changes Applied

- Updated `package-lock.json` package name to `latent-space-hub` (root + workspace metadata).
- Updated production build defaults in `scripts/build-production.sh` from `ra-h.app`/`api.ra-h.app` to `https://latent-space-hub.vercel.app`.
- Updated user-facing docs to remove stale "RA-H Light" naming and old `rah_*` MCP tool names:
  - `docs/4_tools-and-workflows.md`
  - `docs/5_logging-and-evals.md`
  - `docs/6_ui.md`
- Updated `SECURITY.md` to remove stale RA-H contact/storage references and align with Turso-backed deployment.
- Confirmed current state already correct for:
  - `package.json` name
  - `CLAUDE.md` title
  - MCP `ls_*` namespace in `apps/mcp-server/server.js` and `apps/mcp-server/stdio-server.js`

---
## COMPLETED
**Date:** 2026-02-19
**What was delivered:** Naming decisions documented, stale package/deployment defaults fixed, and user-facing docs aligned to Latent Space Hub naming with `ls_*` MCP tooling.
