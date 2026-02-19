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
| Turso DB | `latentspace-bradwmorris.aws-us-east-2.turso.io` | Keep or rename? "bradwmorris" in the URL — fine for now or create dedicated? |
| GitHub repo | `latent-space-hub` (local) | Is this on GitHub yet? What org/name? |
| package.json name | `ra-h-open-source` | Should be `latent-space-hub` |
| MCP tools | `ls_*` namespace | Already renamed. Confirm this is final. |
| UI branding | "Latent Space Hub" + purple | Confirm. |
| Deployment URL | Vercel (unknown URL) | What's the public URL? |
| CLAUDE.md title | "RA-H Open Source" | Should be "Latent Space Hub" |
| Internal references | Various `rah_*`, `ra-h` strings | Audit and rename where appropriate |

## Done =

- All naming decisions documented
- package.json, CLAUDE.md, docs updated
- No confusing RA-H references remain in user-facing surfaces
- Turso instance naming decided
