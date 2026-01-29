import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
  process.exit(1);
}

const client = createClient({ url, authToken });

const schema = `
-- Nodes table (core knowledge items)
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  description TEXT,
  link TEXT,
  type TEXT,
  chunk TEXT,
  chunk_status TEXT,
  is_pinned INTEGER DEFAULT 0,
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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Chunks table (for text chunking/search)
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL,
  chunk_idx INTEGER,
  text TEXT NOT NULL,
  embedding BLOB,
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
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_node_dimensions_node ON node_dimensions(node_id);
CREATE INDEX IF NOT EXISTS idx_node_dimensions_dim ON node_dimensions(dimension);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_chunks_node ON chunks(node_id);
CREATE INDEX IF NOT EXISTS idx_chats_thread ON chats(thread_id);
CREATE INDEX IF NOT EXISTS idx_logs_table ON logs(table_name);
`;

async function setup() {
  console.log('Setting up Turso schema...\n');
  
  // Split and execute each statement
  const statements = schema.split(';').filter(s => s.trim());
  
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    
    try {
      await client.execute(trimmed);
      // Extract table/index name for logging
      const match = trimmed.match(/(?:CREATE TABLE|CREATE INDEX).*?(?:IF NOT EXISTS\s+)?(\w+)/i);
      if (match) {
        console.log('✓', match[1]);
      }
    } catch (error) {
      console.error('✗ Error:', error.message);
      console.error('  Statement:', trimmed.substring(0, 60) + '...');
    }
  }
  
  // Verify
  console.log('\n--- Verification ---');
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log('Tables created:', tables.rows.length);
  for (const row of tables.rows) {
    console.log(' -', row.name);
  }
}

setup().catch(console.error);
