#!/usr/bin/env bash
set -euo pipefail

DB_PATH=${1:-rah_trial.db}

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database file not found: $DB_PATH" >&2
  exit 1
fi

if command -v brew >/dev/null 2>&1; then
  SQLITE_BIN="$(brew --prefix sqlite 2>/dev/null)/bin/sqlite3"
  [ -x "$SQLITE_BIN" ] || SQLITE_BIN="sqlite3"
else
  SQLITE_BIN="sqlite3"
fi

echo "Using sqlite: $($SQLITE_BIN --version)"

has_col() {
  local table=$1 col=$2
  "$SQLITE_BIN" "$DB_PATH" -json \
    "PRAGMA table_info($table);" | \
    grep -q "\"name\":\s*\"$col\""
}

has_table() {
  local table=$1
  "$SQLITE_BIN" "$DB_PATH" -json \
    "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" | \
    grep -q "$table"
}

has_view() {
  local view=$1
  "$SQLITE_BIN" "$DB_PATH" -json \
    "SELECT name FROM sqlite_master WHERE type='view' AND name='$view';" | \
    grep -q "$view"
}

has_trigger() {
  local trg=$1
  "$SQLITE_BIN" "$DB_PATH" -json \
    "SELECT name FROM sqlite_master WHERE type='trigger' AND name='$trg';" | \
    grep -q "$trg"
}

echo "Ensuring agents table exists and orchestrator is seeded..."

# Rename legacy helpers table if present
if has_table helpers && ! has_table agents; then
  "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE helpers RENAME TO agents;"
fi

if ! has_table agents; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'executor',
  system_prompt TEXT NOT NULL,
  available_tools TEXT NOT NULL,
  model TEXT NOT NULL,
  description TEXT,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  memory TEXT,
  prompts TEXT
);
SQL
fi

if has_table agents && ! has_col agents role; then
  "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE agents ADD COLUMN role TEXT NOT NULL DEFAULT 'executor';"
fi

if has_table agents && ! has_col agents prompts; then
  "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE agents ADD COLUMN prompts TEXT DEFAULT '[]';"
fi

if has_table agents && ! has_col agents memory; then
  "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE agents ADD COLUMN memory TEXT;"
fi

COUNT_AGENTS=$("$SQLITE_BIN" -readonly "$DB_PATH" "SELECT COUNT(*) FROM agents;" 2>/dev/null || echo 0)
if [ "${COUNT_AGENTS:-0}" = "0" ]; then
  echo "  Seeding default orchestrator agent (ra-h)..."
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  TOOLS_JSON='["queryNodes","createNode","updateNode","createEdge","queryEdge","updateEdge","searchContentEmbeddings","webSearch","think","delegateToMiniRAH"]'
  PROMPTS_JSON='[{"id":"p_seed_0","name":"Summary of Focus","content":"Summarize the primary focused node clearly. Include 3–5 key points and cite [NODE:id:\"title\"]."},{"id":"p_seed_1","name":"Next Steps","content":"Propose 3 concrete next actions based on the focused nodes with references to [NODE:id:\"title\"]."}]'
  SYSTEM_PROMPT="You are ra-h, the main orchestrator for RA-H. Coordinate work, delegate to mini ra-hs when tasks can be isolated, and keep the conversation focused on the user's goals."
  ESCAPED_SYSTEM_PROMPT=${SYSTEM_PROMPT//\'/''}
  "$SQLITE_BIN" "$DB_PATH" <<SQL
INSERT INTO agents(key, display_name, role, system_prompt, available_tools, model, description, enabled, created_at, updated_at, prompts)
VALUES (
  'ra-h',
  'ra-h',
  'orchestrator',
  '$ESCAPED_SYSTEM_PROMPT',
  '$TOOLS_JSON',
  'anthropic/claude-sonnet-4.5',
  'Opinionated orchestrator agent',
  1,
  '$NOW',
  '$NOW',
  '$PROMPTS_JSON'
);
SQL
fi

echo "Ensuring core tables exist (nodes, chunks, edges, chats, node_dimensions)..."

if ! has_table nodes; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY,
  title TEXT,
  description TEXT,
  content TEXT,
  link TEXT,
  type TEXT,
  created_at TEXT,
  updated_at TEXT,
  metadata TEXT,
  chunk TEXT,
  embedding BLOB,
  embedding_updated_at TEXT,
  embedding_text TEXT,
  chunk_status TEXT DEFAULT 'not_chunked'
);
SQL
fi

if ! has_table chunks; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  node_id INTEGER NOT NULL,
  chunk_idx INTEGER,
  text TEXT,
  created_at TEXT,
  embedding_type TEXT DEFAULT 'text-embedding-3-small',
  metadata TEXT,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
CREATE INDEX idx_chunks_by_node ON chunks(node_id);
CREATE INDEX idx_chunks_by_node_idx ON chunks(node_id, chunk_idx);
SQL
fi

if ! has_table edges; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE TABLE edges (
  id INTEGER PRIMARY KEY,
  from_node_id INTEGER NOT NULL,
  to_node_id INTEGER NOT NULL,
  source TEXT,
  created_at TEXT,
  context TEXT,
  user_feedback INTEGER,
  FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
CREATE INDEX idx_edges_from ON edges(from_node_id);
CREATE INDEX idx_edges_to ON edges(to_node_id);
SQL
fi

echo "Dropping legacy episodic/semantic memory tables if they exist..."

if has_table chats; then
  if "$SQLITE_BIN" "$DB_PATH" -json "PRAGMA table_info(chats);" | grep -q 'focused_memory_id'; then
    echo "  Removing legacy chats.focused_memory_id column"
    "$SQLITE_BIN" "$DB_PATH" <<'SQL'
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
ALTER TABLE chats RENAME TO chats_legacy_cleanup;
CREATE TABLE chats (
  id INTEGER PRIMARY KEY,
  chat_type TEXT,
  helper_name TEXT,
  agent_type TEXT DEFAULT 'orchestrator',
  delegation_id INTEGER,
  user_message TEXT,
  assistant_message TEXT,
  thread_id TEXT,
  focused_node_id INTEGER,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  metadata TEXT,
  FOREIGN KEY (focused_node_id) REFERENCES nodes(id) ON DELETE SET NULL
);
INSERT INTO chats (
  id, chat_type, helper_name, agent_type, delegation_id,
  user_message, assistant_message, thread_id, focused_node_id,
  created_at, metadata
)
SELECT id, chat_type, helper_name, agent_type, delegation_id,
       user_message, assistant_message, thread_id, focused_node_id,
       created_at, metadata
  FROM chats_legacy_cleanup;
DROP TABLE chats_legacy_cleanup;
CREATE INDEX IF NOT EXISTS idx_chats_thread ON chats(thread_id);
COMMIT;
PRAGMA foreign_keys=ON;
SQL
  fi
fi

"$SQLITE_BIN" "$DB_PATH" <<'SQL'
DROP TRIGGER IF EXISTS trg_episodic_prune;
DROP TABLE IF EXISTS episodic_memory;
DROP TABLE IF EXISTS episodic_pipeline_state;
DROP TABLE IF EXISTS semantic_memory;
DROP TABLE IF EXISTS semantic_pipeline_state;
DROP TABLE IF EXISTS memory_pipeline_state;
DROP TABLE IF EXISTS memory;
SQL

echo "Removing deprecated context_versions table (if present)..."
"$SQLITE_BIN" "$DB_PATH" <<'SQL'
DROP TABLE IF EXISTS context_versions;
DROP INDEX IF EXISTS idx_context_created;
SQL

if ! has_table chats; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE TABLE chats (
  id INTEGER PRIMARY KEY,
  chat_type TEXT,
  helper_name TEXT,
  agent_type TEXT DEFAULT 'orchestrator',
  delegation_id INTEGER,
  user_message TEXT,
  assistant_message TEXT,
  thread_id TEXT,
  focused_node_id INTEGER,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  metadata TEXT,
  FOREIGN KEY (focused_node_id) REFERENCES nodes(id) ON DELETE SET NULL
);
CREATE INDEX idx_chats_thread ON chats(thread_id);
SQL
fi

if has_table chats && ! has_col chats agent_type; then
  "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE chats ADD COLUMN agent_type TEXT DEFAULT 'orchestrator';"
fi

if has_table chats && ! has_col chats delegation_id; then
  "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE chats ADD COLUMN delegation_id INTEGER;"
fi

if ! has_table chat_memory_state; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE TABLE chat_memory_state (
  thread_id TEXT PRIMARY KEY,
  helper_name TEXT,
  last_processed_chat_id INTEGER DEFAULT 0,
  last_processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_memory_thread ON chat_memory_state(thread_id);
SQL
fi

echo "Dropping legacy agent_delegations table if present..."
"$SQLITE_BIN" "$DB_PATH" "DROP TABLE IF EXISTS agent_delegations;"

if ! has_table node_dimensions; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE TABLE node_dimensions (
  node_id INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  PRIMARY KEY (node_id, dimension),
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE INDEX idx_dim_by_dimension ON node_dimensions(dimension, node_id);
CREATE INDEX idx_dim_by_node ON node_dimensions(node_id, dimension);
SQL
fi

echo "Checking/adding missing columns..."

if has_table nodes; then
  if ! has_col nodes type; then
    echo "Adding nodes.type"
    "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE nodes ADD COLUMN type TEXT;"
  fi
  if ! has_col nodes description; then
    echo "Adding nodes.description"
    "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE nodes ADD COLUMN description TEXT;"
  fi
  if ! has_col nodes metadata; then
    echo "Adding nodes.metadata"
    "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE nodes ADD COLUMN metadata TEXT;"
  fi
  if ! has_col nodes chunk; then
    echo "Adding nodes.chunk"
    "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE nodes ADD COLUMN chunk TEXT;"
  fi
  if ! has_col nodes is_pinned; then
    echo "Adding nodes.is_pinned"
    "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE nodes ADD COLUMN is_pinned INTEGER DEFAULT 0;"
  fi
fi

if has_table chunks; then
  if ! has_col chunks embedding_type; then
    echo "Adding chunks.embedding_type"
    "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE chunks ADD COLUMN embedding_type TEXT DEFAULT 'text-embedding-3-small';"
  fi
  if ! has_col chunks metadata; then
    echo "Adding chunks.metadata"
    "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE chunks ADD COLUMN metadata TEXT;"
  fi
fi

echo "Ensuring dimensions table exists..."
if ! has_table dimensions; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE TABLE dimensions (
  name TEXT PRIMARY KEY,
  is_priority INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
SQL
fi

if has_table dimensions; then
  echo "Seeding default locked dimensions..."
  for dimension in research ideas projects memory preferences; do
    "$SQLITE_BIN" "$DB_PATH" <<SQL
INSERT INTO dimensions (name, is_priority, updated_at)
VALUES ('$dimension', 1, datetime('now'))
ON CONFLICT(name) DO UPDATE SET is_priority = 1, updated_at = datetime('now');
SQL
  done
fi

echo "Refreshing helper view nodes_v..."
"$SQLITE_BIN" "$DB_PATH" "DROP VIEW IF EXISTS nodes_v;"
"$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE VIEW nodes_v AS
SELECT n.id,
       n.title,
       n.description,
       n.content,
       n.link,
       n.type,
       n.metadata,
       n.created_at,
       n.updated_at,
       COALESCE((SELECT JSON_GROUP_ARRAY(d.dimension)
                 FROM node_dimensions d
                 WHERE d.node_id = n.id), '[]') AS dimensions_json
FROM nodes n;
SQL

echo "Ensuring logs table and triggers exist (migrating from memory if needed)..."

# migrate memory -> logs if needed
if ! has_table logs && has_table memory; then
  echo "Dropping view memory_v (if exists) to unlock table rename..."
  "$SQLITE_BIN" "$DB_PATH" "DROP VIEW IF EXISTS memory_v;"
  echo "Renaming memory -> logs..."
  "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE memory RENAME TO logs;"
fi

# logs table
if ! has_table logs; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE TABLE logs (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  table_name TEXT NOT NULL,
  action TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  summary TEXT,
  enriched_summary TEXT,
  snapshot_json TEXT
);
SQL
fi

# Add enriched_summary column if missing
if has_table logs && ! has_col logs enriched_summary; then
  "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE logs ADD COLUMN enriched_summary TEXT;"
fi

# indexes on logs (cleanup legacy names first)
"$SQLITE_BIN" "$DB_PATH" <<'SQL'
DROP INDEX IF EXISTS idx_memory_ts;
DROP INDEX IF EXISTS idx_memory_table_ts;
DROP INDEX IF EXISTS idx_memory_table_row;
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
CREATE INDEX IF NOT EXISTS idx_logs_table_ts ON logs(table_name, ts);
CREATE INDEX IF NOT EXISTS idx_logs_table_row ON logs(table_name, row_id);
SQL

# triggers for nodes (drop/recreate to ensure enriched payloads)
if has_table nodes; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
DROP TRIGGER IF EXISTS trg_nodes_ai;
DROP TRIGGER IF EXISTS trg_nodes_au;
CREATE TRIGGER trg_nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO logs(table_name, action, row_id, summary, snapshot_json)
  VALUES('nodes', 'insert', NEW.id,
         printf('node created: %s', COALESCE(NEW.title,'')),
         json_object(
           'id', NEW.id,
           'title', NEW.title,
           'link', NEW.link
         )
  );
END;
CREATE TRIGGER trg_nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO logs(table_name, action, row_id, summary, snapshot_json)
  VALUES('nodes', 'update', NEW.id,
         printf('node updated: %s', COALESCE(NEW.title,'')),
         json_object(
           'id', NEW.id,
           'title', NEW.title,
           'link', NEW.link
         )
  );
END;
SQL
fi

# triggers for edges (enriched with node titles, truncated)
if has_table edges; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
DROP TRIGGER IF EXISTS trg_edges_ai;
DROP TRIGGER IF EXISTS trg_edges_au;
CREATE TRIGGER trg_edges_ai AFTER INSERT ON edges BEGIN
  INSERT INTO logs(table_name, action, row_id, summary, snapshot_json)
  VALUES('edges', 'insert', NEW.id,
         printf('edge %d→%d (%s)', NEW.from_node_id, NEW.to_node_id, COALESCE(NEW.source,'')),
         json_object(
           'id', NEW.id,
           'from', NEW.from_node_id,
           'to', NEW.to_node_id,
           'source', NEW.source,
           'from_title', substr((SELECT title FROM nodes WHERE id = NEW.from_node_id), 1, 120),
           'to_title', substr((SELECT title FROM nodes WHERE id = NEW.to_node_id), 1, 120)
         )
  );
END;
CREATE TRIGGER trg_edges_au AFTER UPDATE ON edges BEGIN
  INSERT INTO logs(table_name, action, row_id, summary, snapshot_json)
  VALUES('edges', 'update', NEW.id,
         printf('edge updated %d→%d', NEW.from_node_id, NEW.to_node_id),
         json_object(
           'id', NEW.id,
           'from', NEW.from_node_id,
           'to', NEW.to_node_id,
           'source', NEW.source,
           'from_title', substr((SELECT title FROM nodes WHERE id = NEW.from_node_id), 1, 120),
           'to_title', substr((SELECT title FROM nodes WHERE id = NEW.to_node_id), 1, 120)
         )
  );
END;

-- Add trigger to auto-update node updated_at timestamps when edges are created
DROP TRIGGER IF EXISTS trg_edges_update_nodes_on_insert;
CREATE TRIGGER trg_edges_update_nodes_on_insert
AFTER INSERT ON edges
BEGIN
  UPDATE nodes SET updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z' WHERE id = NEW.from_node_id;
  UPDATE nodes SET updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z' WHERE id = NEW.to_node_id;
END;
SQL
fi

# trigger for chats (enriched with content previews, truncated)
if has_table chats; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
DROP TRIGGER IF EXISTS trg_chats_ai;
CREATE TRIGGER trg_chats_ai AFTER INSERT ON chats BEGIN
  INSERT INTO logs(table_name, action, row_id, summary, snapshot_json)
  VALUES('chats', 'insert', NEW.id,
         printf('chat: %s (%s)', COALESCE(NEW.helper_name,''), COALESCE(NEW.thread_id,'')),
         json_object(
           'id', NEW.id,
           'helper', NEW.helper_name,
           'thread', NEW.thread_id,
           'user_preview', substr(NEW.user_message, 1, 120),
           'assistant_preview', substr(NEW.assistant_message, 1, 120)
         )
  );
END;
SQL
fi

# Add trigger to auto-prune logs to keep only most recent 10k entries
if has_table logs; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
DROP TRIGGER IF EXISTS trg_logs_prune;
CREATE TRIGGER trg_logs_prune AFTER INSERT ON logs BEGIN
  DELETE FROM logs WHERE id < NEW.id - 10000;
END;
SQL
fi

echo "Ensuring logs_v view exists (removing legacy memory_v)..."
"$SQLITE_BIN" "$DB_PATH" <<'SQL'
DROP VIEW IF EXISTS logs_v;
DROP VIEW IF EXISTS memory_v;
CREATE VIEW logs_v AS
SELECT 
  m.id,
  m.ts,
  m.table_name,
  m.action,
  m.row_id,
  m.summary,
  m.enriched_summary,
  m.snapshot_json,
  CASE WHEN m.table_name='nodes' THEN n.title END AS node_title,
  CASE WHEN m.table_name='edges' THEN nf.title END AS edge_from_title,
  CASE WHEN m.table_name='edges' THEN nt.title END AS edge_to_title,
  CASE WHEN m.table_name='chats' THEN c.helper_name END AS chat_helper,
  CASE WHEN m.table_name='chats' THEN substr(c.user_message,1,120) END AS chat_user_preview,
  CASE WHEN m.table_name='chats' THEN substr(c.assistant_message,1,120) END AS chat_assistant_preview,
  CASE WHEN m.table_name='chats' THEN c.user_message END AS chat_user_full,
  CASE WHEN m.table_name='chats' THEN c.assistant_message END AS chat_assistant_full
FROM logs m
LEFT JOIN nodes n ON (m.table_name='nodes' AND m.row_id = n.id)
LEFT JOIN edges e ON (m.table_name='edges' AND m.row_id = e.id)
LEFT JOIN nodes nf ON e.from_node_id = nf.id
LEFT JOIN nodes nt ON e.to_node_id = nt.id
LEFT JOIN chats c ON (m.table_name='chats' AND m.row_id = c.id);
SQL

echo "Ensuring helpers.memory exists and is populated from fluid_context (if present)..."
if has_table helpers; then
  if ! has_col helpers memory; then
    "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE helpers ADD COLUMN memory TEXT;"
    if has_col helpers fluid_context; then
      "$SQLITE_BIN" "$DB_PATH" "UPDATE helpers SET memory = fluid_context WHERE fluid_context IS NOT NULL;"
    fi
  fi
else
  echo "  helpers table not present; skipping helpers.memory migration"
fi

echo "Updating helper available_tools to use updateHelperMemory (renaming from updateHelperFluidContext)..."
if has_table helpers; then
  "$SQLITE_BIN" "$DB_PATH" <<'SQL'
UPDATE helpers
   SET available_tools = REPLACE(available_tools, 'updateHelperFluidContext', 'updateHelperMemory')
 WHERE available_tools LIKE '%updateHelperFluidContext%';
SQL
else
  echo "  helpers table not present; skipping available_tools rename"
fi

echo "Dropping helpers.fluid_context column if present (post-migration cleanup)..."
if has_table helpers && has_col helpers fluid_context; then
  "$SQLITE_BIN" "$DB_PATH" "ALTER TABLE helpers DROP COLUMN fluid_context;" || true
fi

echo "Ensuring performance indexes exist..."
"$SQLITE_BIN" "$DB_PATH" <<'SQL'
CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_member_discord_id_unique
  ON nodes(json_extract(metadata, '$.discord_id'))
  WHERE type = 'member'
    AND json_extract(metadata, '$.discord_id') IS NOT NULL
    AND json_extract(metadata, '$.discord_id') != '';
SQL

echo "Running VACUUM and ANALYZE..."
"$SQLITE_BIN" "$DB_PATH" "VACUUM; ANALYZE;"

echo "Done. Schema is compatible."
