# PRD 14 (V2): Documentation Overhaul V2

## Status: Ready

## Background

Documentation Overhaul V1 has shipped and replaced the inherited RA-H documentation set. After finishing the current data and bot refinement work, docs need a second pass so they match final production behavior and naming.

This V2 pass is intentionally scoped to drift cleanup, not a full rewrite.

## Why V2 Is Needed

1. Data model and graph quality details are still moving during PRD-10 and PRD-15.
2. Discord bot runtime behavior and channel contracts are still moving during PRD-11.
3. Auto-ingestion has shipped and should now be documented as completed behavior.

## Scope

### In scope

- Update core docs to match final post-refinement schema and category usage.
- Update bot docs with deterministic announcement -> yap kickoff flow and channel architecture.
- Update ingestion docs to reflect shipped cron + manual trigger + Discord fanout behavior.
- Refresh public-facing guides for consistency with latest UI and workflows.
- Run consistency pass across `docs/README.md`, onboarding docs, and troubleshooting.

### Out of scope

- New documentation platform or tooling migration.
- Large structural reorganization of `docs/`.

## Depends On

- PRD-10 data-refinement
- PRD-11 discord-bot-v2
- PRD-15 hub-nodes

## Done =

- [ ] Architecture and schema docs match production graph behavior.
- [ ] Bots docs match real runtime and trigger behavior.
- [ ] Ingestion docs are aligned with shipped cron/webhook implementation.
- [ ] Public guides reflect current UX and naming.
- [ ] README/index links and troubleshooting entries are accurate.
