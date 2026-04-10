const { createClient } = require("@libsql/client");
const fs = require("node:fs");
const path = require("node:path");

const seedDimensions = [
  {
    name: "member",
    description: "Community member profiles created by the bots",
    isPriority: 1,
  },
  {
    name: "event",
    description: "Scheduled community events",
    isPriority: 1,
  },
  {
    name: "paper-club",
    description: "Paper Club sessions",
    isPriority: 1,
  },
  {
    name: "builders-club",
    description: "Builders Club sessions",
    isPriority: 1,
  },
];

const coreSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT,
    description TEXT,
    link TEXT,
    node_type TEXT,
    event_date TEXT,
    chunk TEXT,
    chunk_status TEXT,
    embedding BLOB,
    embedding_text TEXT,
    embedding_updated_at TEXT,
    embedding_vec F32_BLOB(1536),
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS dimensions (
    name TEXT PRIMARY KEY,
    description TEXT,
    icon TEXT,
    is_priority INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS node_dimensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    dimension TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, dimension)
  )`,
  `CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_node_id INTEGER NOT NULL,
    to_node_id INTEGER NOT NULL,
    context TEXT,
    source TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    chunk_idx INTEGER,
    text TEXT NOT NULL,
    embedding F32_BLOB(1536),
    embedding_type TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_type TEXT,
    user_message TEXT,
    assistant_message TEXT,
    thread_id TEXT,
    focused_node_id INTEGER,
    helper_name TEXT,
    agent_type TEXT,
    delegation_id INTEGER,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT DEFAULT CURRENT_TIMESTAMP,
    table_name TEXT,
    action TEXT,
    row_id INTEGER,
    summary TEXT,
    snapshot_json TEXT,
    enriched_summary TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_nodes_node_type ON nodes(node_type)`,
  `CREATE INDEX IF NOT EXISTS idx_node_dimensions_node ON node_dimensions(node_id)`,
  `CREATE INDEX IF NOT EXISTS idx_node_dimensions_dim ON node_dimensions(dimension)`,
  `CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_node_id)`,
  `CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_node_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_node ON chunks(node_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chats_thread ON chats(thread_id)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_table ON logs(table_name)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_member_discord_id_unique
    ON nodes(json_extract(metadata, '$.discord_id'))
    WHERE node_type = 'member'
      AND json_extract(metadata, '$.discord_id') IS NOT NULL
      AND json_extract(metadata, '$.discord_id') != ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_scheduled_event_slot_unique
    ON nodes(event_date, json_extract(metadata, '$.event_type'))
    WHERE node_type = 'event'
      AND json_extract(metadata, '$.event_status') = 'scheduled'
      AND event_date IS NOT NULL`,
];

const optionalSchemaStatements = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, content='chunks', content_rowid='id')`,
  `CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
  END`,
  `CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
  END`,
  `CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
    INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
  END`,
  `INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')`,
];

function resolveTarget(arg) {
  const raw = (arg || ".local/latent-space-bots.db").trim();
  if (raw.startsWith("file:")) {
    const filePath = raw.slice("file:".length);
    return { filePath, url: raw };
  }

  const filePath = path.resolve(raw);
  return {
    filePath,
    url: `file:${filePath}`,
  };
}

async function main() {
  const { filePath, url } = resolveTarget(process.argv[2]);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const client = createClient({ url });
  console.log(`Initializing local DB at ${filePath}`);

  for (const statement of coreSchemaStatements) {
    await client.execute(statement);
  }

  for (const dimension of seedDimensions) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO dimensions(name, description, is_priority, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      args: [dimension.name, dimension.description, dimension.isPriority],
    });
  }

  for (const statement of optionalSchemaStatements) {
    try {
      await client.execute(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Skipping optional schema step: ${message}`);
    }
  }

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name"
  );
  const dimensions = await client.execute("SELECT COUNT(*) AS count FROM dimensions");

  console.log(`Ready. ${tables.rows.length} tables/views present.`);
  console.log(`Seeded dimensions: ${dimensions.rows[0]?.count ?? 0}`);
  console.log(`Use TURSO_DATABASE_URL='${url}' when starting the bot or REPL.`);
}

main().catch((error) => {
  console.error("Failed to initialize local DB:", error);
  process.exit(1);
});
