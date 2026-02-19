# Handoff — Current Status

**Last updated:** 2026-02-19

## What Was Just Done

- **PRD-01: Identity, Dev Process & Repo Cleanup** — completed and merged
- **PRD-02: Schema Cleanup + Typed Entity Model** — completed and merged
  - Migrated schema to `notes`, `node_type`, `event_date`, `dimensions.icon`
  - Dropped dead fields/tables (`nodes.type`, `nodes.is_pinned`, `edges.user_feedback`, `chat_memory_state`)
  - Extended edge relationship types and typed metadata model
  - Preserved API/MCP backward compatibility (`content` mapped to `notes`)
- Added local dev compatibility guard to auto-bridge legacy DB schema where needed
- Rewrote schema docs in `docs/2_schema.md` to match current Turso schema
- Added process rule to move completed PRDs into `docs/development/completed-prds/`

## What's Next

1. **PRD-04: Vector Search** — replace LIKE fallback with `vector_top_k()`, add FTS + hybrid RRF
2. **PRD-05: Content Ingestion** — backfill podcasts, blogs, ainews with chunk + embedding pipeline
3. **PRD-07: MCP server and skills** — package + publish standalone MCP interface

## Blockers

None currently.

## Notes

- Completed PRDs now live under `docs/development/completed-prds/`
- Always update backlog + handoff docs as part of finish flow
