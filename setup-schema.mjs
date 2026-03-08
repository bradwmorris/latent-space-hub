import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
  process.exit(1);
}

const client = createClient({ url, authToken });

// ─── Core Schema (idempotent CREATE IF NOT EXISTS) ────────────────────────────

const coreSchema = `
-- Nodes table (core knowledge entities)
CREATE TABLE IF NOT EXISTS nodes (
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
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Dimensions table (categories/tags metadata)
CREATE TABLE IF NOT EXISTS dimensions (
  name TEXT PRIMARY KEY,
  description TEXT,
  icon TEXT,
  is_priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Node-Dimension join table
CREATE TABLE IF NOT EXISTS node_dimensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE(node_id, dimension)
);

-- Edges table (connections between nodes)
CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_node_id INTEGER NOT NULL,
  to_node_id INTEGER NOT NULL,
  context TEXT,
  source TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Chunks table (for text chunking/embedding search)
-- embedding uses F32_BLOB(1536) for Turso native vector indexing
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL,
  chunk_idx INTEGER,
  text TEXT NOT NULL,
  embedding F32_BLOB(1536),
  embedding_type TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Chats table (conversation logs)
CREATE TABLE IF NOT EXISTS chats (
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
);

-- Logs table (activity/audit logs)
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT CURRENT_TIMESTAMP,
  table_name TEXT,
  action TEXT,
  row_id INTEGER,
  summary TEXT,
  snapshot_json TEXT,
  enriched_summary TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_nodes_node_type ON nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_node_dimensions_node ON node_dimensions(node_id);
CREATE INDEX IF NOT EXISTS idx_node_dimensions_dim ON node_dimensions(dimension);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_chunks_node ON chunks(node_id);
CREATE INDEX IF NOT EXISTS idx_chats_thread ON chats(thread_id);
CREATE INDEX IF NOT EXISTS idx_logs_table ON logs(table_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_member_discord_id_unique
  ON nodes(json_extract(metadata, '$.discord_id'))
  WHERE node_type = 'member'
    AND json_extract(metadata, '$.discord_id') IS NOT NULL
    AND json_extract(metadata, '$.discord_id') != '';
`;

// ─── Migration Steps (idempotent — safe to re-run) ───────────────────────────

async function migrate() {
  console.log('\n--- Running Migrations ---\n');

  // 1. Rename content → notes (if content column still exists)
  await safeAlter(
    `ALTER TABLE nodes RENAME COLUMN content TO notes`,
    'Renamed nodes.content → nodes.notes'
  );

  // 2. Add node_type column
  await safeAlter(
    `ALTER TABLE nodes ADD COLUMN node_type TEXT`,
    'Added nodes.node_type'
  );

  // 3. Add event_date column
  await safeAlter(
    `ALTER TABLE nodes ADD COLUMN event_date TEXT`,
    'Added nodes.event_date'
  );

  // 4. Add dimensions.icon column
  await safeAlter(
    `ALTER TABLE dimensions ADD COLUMN icon TEXT`,
    'Added dimensions.icon'
  );

  // 5. Add source column to edges (if missing)
  await safeAlter(
    `ALTER TABLE edges ADD COLUMN source TEXT`,
    'Added edges.source'
  );

  // 6. Drop dead columns (SQLite doesn't support DROP COLUMN before 3.35.0,
  //    Turso uses a recent libSQL so this should work)
  await safeAlter(
    `ALTER TABLE nodes DROP COLUMN type`,
    'Dropped nodes.type (legacy)'
  );
  await safeAlter(
    `ALTER TABLE nodes DROP COLUMN is_pinned`,
    'Dropped nodes.is_pinned (unused)'
  );
  await safeAlter(
    `ALTER TABLE edges DROP COLUMN user_feedback`,
    'Dropped edges.user_feedback (unused)'
  );

  // 7. Drop chat_memory_state table
  await safeExec(
    `DROP TABLE IF EXISTS chat_memory_state`,
    'Dropped chat_memory_state table (orphaned)'
  );

  // 8. Create node_type index
  await safeExec(
    `CREATE INDEX IF NOT EXISTS idx_nodes_node_type ON nodes(node_type)`,
    'Created index on nodes.node_type'
  );

  // 9. Drop old type index if it exists
  await safeExec(
    `DROP INDEX IF EXISTS idx_nodes_type`,
    'Dropped old idx_nodes_type index'
  );

  // 10. Migrate chunks.embedding from BLOB to F32_BLOB(1536) if needed
  // Turso's vector index requires F32_BLOB, not plain BLOB
  try {
    const colInfo = await client.execute("PRAGMA table_info('chunks')");
    const embCol = colInfo.rows.find(r => r.name === 'embedding');
    if (embCol && String(embCol.type).toUpperCase() === 'BLOB') {
      const chunkCount = await client.execute('SELECT COUNT(*) as count FROM chunks');
      const count = Number(chunkCount.rows[0].count);
      if (count === 0) {
        // Safe to recreate — no data to lose
        console.log('⚠ chunks.embedding is BLOB, migrating to F32_BLOB(1536)...');
        await client.execute('DROP TABLE IF EXISTS chunks');
        await client.execute(`CREATE TABLE chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          node_id INTEGER NOT NULL,
          chunk_idx INTEGER,
          text TEXT NOT NULL,
          embedding F32_BLOB(1536),
          embedding_type TEXT,
          metadata TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
        )`);
        await client.execute('CREATE INDEX IF NOT EXISTS idx_chunks_node ON chunks(node_id)');
        console.log('✓ Recreated chunks table with F32_BLOB(1536)');
      } else {
        console.log(`⚠ chunks.embedding is BLOB but table has ${count} rows — manual migration needed`);
      }
    }
  } catch (error) {
    console.error('✗ Column type migration check failed:', error.message);
  }

  // 11. Vector index on chunks.embedding (Turso native)
  await safeExec(
    `CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks (libsql_vector_idx(embedding, 'metric=cosine', 'compress_neighbors=float8', 'max_neighbors=20'))`,
    'Created vector index on chunks.embedding'
  );

  // 12. FTS5 virtual table on chunks.text
  await safeExec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, content='chunks', content_rowid='id')`,
    'Created FTS5 virtual table on chunks'
  );

  // 13. FTS5 sync triggers — keep chunks_fts in sync with chunks table
  await safeExec(
    `CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
    END`,
    'Created FTS5 insert trigger'
  );

  await safeExec(
    `CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
    END`,
    'Created FTS5 delete trigger'
  );

  await safeExec(
    `CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
      INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
    END`,
    'Created FTS5 update trigger'
  );

  // 14. Rebuild FTS5 index from existing chunks data
  await safeExec(
    `INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')`,
    'Rebuilt FTS5 index from existing chunks'
  );

  // 15. Add F32_BLOB(1536) column for node vector search
  // nodes.embedding is typed as BLOB which Turso cannot index with libsql_vector_idx.
  // We add a properly-typed column and will backfill via vector() function.
  await safeAlter(
    `ALTER TABLE nodes ADD COLUMN embedding_vec F32_BLOB(1536)`,
    'Added nodes.embedding_vec (F32_BLOB for vector indexing)'
  );

  // 16. Vector index on nodes.embedding_vec (Turso native)
  await safeExec(
    `CREATE INDEX IF NOT EXISTS nodes_embedding_idx ON nodes (libsql_vector_idx(embedding_vec, 'metric=cosine', 'compress_neighbors=float8', 'max_neighbors=20'))`,
    'Created vector index on nodes.embedding_vec'
  );
}

// ─── Backfill node_type from dimensions ──────────────────────────────────────

async function backfillNodeType() {
  console.log('\n--- Backfilling node_type ---\n');

  // Map dimensions to node_types
  const dimensionToNodeType = {
    'person': 'person',
    'people': 'person',
    'organization': 'organization',
    'company': 'organization',
    'topic': 'topic',
    'concept': 'concept',
    'event': 'event',
    'source': 'source',
    'paper': 'source',
    'article': 'source',
    'blog': 'source',
    'episode': 'episode',
    'podcast': 'episode',
  };

  // Only backfill nodes that don't already have a node_type
  const nodesWithoutType = await client.execute(
    `SELECT n.id, GROUP_CONCAT(nd.dimension) as dims
     FROM nodes n
     LEFT JOIN node_dimensions nd ON nd.node_id = n.id
     WHERE n.node_type IS NULL
     GROUP BY n.id`
  );

  let updated = 0;
  for (const row of nodesWithoutType.rows) {
    const dims = (row.dims || '').toString().toLowerCase().split(',');
    let nodeType = null;

    for (const dim of dims) {
      const trimmed = dim.trim();
      if (dimensionToNodeType[trimmed]) {
        nodeType = dimensionToNodeType[trimmed];
        break;
      }
    }

    if (nodeType) {
      await client.execute({
        sql: `UPDATE nodes SET node_type = ? WHERE id = ?`,
        args: [nodeType, row.id],
      });
      updated++;
    }
  }

  console.log(`Backfilled node_type for ${updated} of ${nodesWithoutType.rows.length} nodes`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function safeAlter(sql, successMsg) {
  try {
    await client.execute(sql);
    console.log('✓', successMsg);
  } catch (error) {
    if (
      error.message?.includes('duplicate column') ||
      error.message?.includes('already exists') ||
      error.message?.includes('no such column') ||
      error.message?.includes('Cannot drop column')
    ) {
      console.log('⊘', successMsg, '(already done)');
    } else {
      console.error('✗', successMsg, '—', error.message);
    }
  }
}

async function safeExec(sql, successMsg) {
  try {
    await client.execute(sql);
    console.log('✓', successMsg);
  } catch (error) {
    if (
      error.message?.includes('already exists') ||
      error.message?.includes('no such table')
    ) {
      console.log('⊘', successMsg, '(already done)');
    } else {
      console.error('✗', successMsg, '—', error.message);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function setup() {
  console.log('Setting up Turso schema...\n');

  // 1. Run core CREATE TABLE/INDEX statements
  const statements = coreSchema.split(';').filter(s => s.trim());

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;

    try {
      await client.execute(trimmed);
      const match = trimmed.match(/(?:CREATE TABLE|CREATE INDEX|CREATE VIRTUAL TABLE).*?(?:IF NOT EXISTS\s+)?(\w+)/i);
      if (match) {
        console.log('✓', match[1]);
      }
    } catch (error) {
      // Tables/indexes that already exist are fine
      if (!error.message?.includes('already exists')) {
        console.error('✗ Error:', error.message);
        console.error('  Statement:', trimmed.substring(0, 80) + '...');
      }
    }
  }

  // 2. Run migrations (idempotent ALTER TABLE etc.)
  await migrate();

  // 3. Backfill node_type from dimensions
  await backfillNodeType();

  // 4. Verify
  console.log('\n--- Verification ---');
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log('Tables:', tables.rows.length);
  for (const row of tables.rows) {
    console.log(' -', row.name);
  }

  const nodeCount = await client.execute('SELECT COUNT(*) as count FROM nodes');
  console.log('Nodes:', nodeCount.rows[0].count);

  const typedCount = await client.execute('SELECT COUNT(*) as count FROM nodes WHERE node_type IS NOT NULL');
  console.log('Nodes with node_type:', typedCount.rows[0].count);
}

setup().catch(console.error);
