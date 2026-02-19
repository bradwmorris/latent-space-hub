# Database Schema (Current)

## Overview

Latent Space Hub uses **Turso (libSQL/SQLite)** via `@libsql/client`.

Primary schema source of truth:
- `/Users/bradleymorris/Desktop/dev/latent-space-hub/setup-schema.mjs`
- `/Users/bradleymorris/Desktop/dev/latent-space-hub/src/types/database.ts`

This document reflects the **current post-PRD-02 schema**.

## Core Tables

### `nodes`
Typed entity records.

Columns:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `title` TEXT NOT NULL
- `notes` TEXT
- `description` TEXT
- `link` TEXT
- `node_type` TEXT
- `event_date` TEXT
- `chunk` TEXT
- `chunk_status` TEXT
- `embedding` BLOB
- `embedding_text` TEXT
- `embedding_updated_at` TEXT
- `metadata` TEXT (JSON)
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP
- `updated_at` TEXT DEFAULT CURRENT_TIMESTAMP

Notes:
- `notes` is the canonical replacement for legacy `content`.
- `node_type` values used by the app:
  - `episode`, `person`, `organization`, `topic`, `source`, `event`, `concept`, `subscriber`

### `dimensions`
Dimension/tag definitions.

Columns:
- `name` TEXT PRIMARY KEY
- `description` TEXT
- `icon` TEXT
- `is_priority` INTEGER DEFAULT 0
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP
- `updated_at` TEXT DEFAULT CURRENT_TIMESTAMP

### `node_dimensions`
Many-to-many join between nodes and dimensions.

Columns:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `node_id` INTEGER NOT NULL REFERENCES `nodes(id)` ON DELETE CASCADE
- `dimension` TEXT NOT NULL
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP

Constraints:
- `UNIQUE(node_id, dimension)`

### `edges`
Directed relationships between nodes.

Columns:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `from_node_id` INTEGER NOT NULL REFERENCES `nodes(id)` ON DELETE CASCADE
- `to_node_id` INTEGER NOT NULL REFERENCES `nodes(id)` ON DELETE CASCADE
- `context` TEXT (JSON)
- `source` TEXT
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP
- `updated_at` TEXT DEFAULT CURRENT_TIMESTAMP

Notes:
- Canonical relationship semantics are stored in `context` JSON.
- `source` values used by app types: `user`, `ai_similarity`, `helper_name`.

### `chunks`
Chunked text for retrieval/search.

Columns:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `node_id` INTEGER NOT NULL REFERENCES `nodes(id)` ON DELETE CASCADE
- `chunk_idx` INTEGER
- `text` TEXT NOT NULL
- `embedding` BLOB
- `embedding_type` TEXT
- `metadata` TEXT (JSON)
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP

### `chats`
Conversation logs.

Columns:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `chat_type` TEXT
- `user_message` TEXT
- `assistant_message` TEXT
- `thread_id` TEXT
- `focused_node_id` INTEGER
- `helper_name` TEXT
- `agent_type` TEXT
- `delegation_id` INTEGER
- `metadata` TEXT
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP

### `logs`
Audit/activity logs.

Columns:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `ts` TEXT DEFAULT CURRENT_TIMESTAMP
- `table_name` TEXT
- `action` TEXT
- `row_id` INTEGER
- `summary` TEXT
- `snapshot_json` TEXT
- `enriched_summary` TEXT

## Indexes

Configured in `setup-schema.mjs`:
- `idx_nodes_updated` on `nodes(updated_at)`
- `idx_nodes_node_type` on `nodes(node_type)`
- `idx_node_dimensions_node` on `node_dimensions(node_id)`
- `idx_node_dimensions_dim` on `node_dimensions(dimension)`
- `idx_edges_from` on `edges(from_node_id)`
- `idx_edges_to` on `edges(to_node_id)`
- `idx_chunks_node` on `chunks(node_id)`
- `idx_chats_thread` on `chats(thread_id)`
- `idx_logs_table` on `logs(table_name)`

Search indexes:
- Vector index on `chunks.embedding` using `libsql_vector_idx`
- FTS5 table: `chunks_fts` over `chunks.text`

## Edge Context Model

`edges.context` stores JSON with inferred and user-provided relationship data.

Current app-level `type` values:
- `created_by`
- `part_of`
- `source_of`
- `related_to`
- `appeared_on`
- `covers_topic`
- `affiliated_with`
- `interested_in`
- `cites`
- `expert_in`
- `features`
- `extends`
- `supports`
- `contradicts`

## Node Metadata by `node_type`

Stored in `nodes.metadata` and validated at the app layer.

- `episode`: `publish_date`, `series`, optional `duration`, `audio_url`, `video_url`, `episode_number`, `season`
- `person`: `role`, optional `affiliations`, `expertise`, `twitter`, `website`, `contact`
- `organization`: `org_type`, optional `website`, `founded`, `hq`
- `topic`: optional `parent_topic`, `aliases`
- `source`: `source_type`, optional `authors`, `publish_date`, `doi`
- `event`: `event_date`, `event_type`, optional `location`, `url`
- `concept`: optional `definition`, `related_terms`
- `subscriber`: `platform`, `platform_id`, optional `display_name`, `joined_date`, `tier`

## Migration and Compatibility

PRD-02 migration updates include:
- Rename `nodes.content` -> `nodes.notes`
- Add `nodes.node_type`, `nodes.event_date`
- Add `dimensions.icon`
- Add `edges.source` (if missing)
- Drop `nodes.type`
- Drop `nodes.is_pinned`
- Drop `edges.user_feedback`
- Drop table `chat_memory_state`

Backfill behavior:
- Existing nodes with null `node_type` are backfilled from dimensions in `setup-schema.mjs`.

Runtime compatibility safeguard:
- `sqlite-client.ts` includes a legacy schema compatibility check for environments that have not yet run the full migration.

## Legacy Fields Removed

Do not rely on these fields/tables in new code:
- `nodes.content`
- `nodes.type`
- `nodes.is_pinned`
- `edges.user_feedback`
- `chat_memory_state`
