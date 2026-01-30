#!/usr/bin/env node
/**
 * Migrate prospect database to Turso
 *
 * This script:
 * 1. Clears existing test data from Turso
 * 2. Migrates all nodes from prospect SQLite
 * 3. Migrates all edges
 * 4. Migrates dimensions and node_dimensions
 *
 * Usage: node scripts/migrate-prospect-db.js
 */

import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env vars
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const PROSPECT_DB_PATH = '/Users/bradleymorris/Desktop/dev/prospects/swyx/rah.sqlite';

// Turso client
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Prospect SQLite (local)
const prospectDb = new Database(PROSPECT_DB_PATH, { readonly: true });

async function clearTurso() {
  console.log('🗑️  Clearing existing Turso data...');

  // Delete in order to respect foreign keys
  await turso.execute('DELETE FROM node_dimensions');
  await turso.execute('DELETE FROM edges');
  await turso.execute('DELETE FROM nodes');
  await turso.execute('DELETE FROM dimensions');

  // Reset auto-increment
  await turso.execute("DELETE FROM sqlite_sequence WHERE name IN ('nodes', 'edges')");

  console.log('✅ Turso cleared');
}

async function migrateNodes() {
  console.log('📦 Migrating nodes...');

  const nodes = prospectDb.prepare(`
    SELECT id, title, description, content, link, type, created_at, updated_at, metadata, chunk, chunk_status, is_pinned
    FROM nodes
    ORDER BY id
  `).all();

  console.log(`   Found ${nodes.length} nodes to migrate`);

  let migrated = 0;
  for (const node of nodes) {
    try {
      await turso.execute({
        sql: `INSERT INTO nodes (id, title, description, content, link, type, created_at, updated_at, metadata, chunk, chunk_status, is_pinned)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          node.id,
          node.title,
          node.description,
          node.content,
          node.link,
          node.type,
          node.created_at || new Date().toISOString(),
          node.updated_at || new Date().toISOString(),
          node.metadata,
          node.chunk,
          node.chunk_status || 'not_chunked',
          node.is_pinned || 0
        ]
      });
      migrated++;

      if (migrated % 20 === 0) {
        console.log(`   Migrated ${migrated}/${nodes.length} nodes...`);
      }
    } catch (error) {
      console.error(`   ❌ Error migrating node ${node.id} (${node.title}):`, error.message);
    }
  }

  console.log(`✅ Migrated ${migrated} nodes`);
  return migrated;
}

async function migrateEdges() {
  console.log('🔗 Migrating edges...');

  const edges = prospectDb.prepare(`
    SELECT id, from_node_id, to_node_id, source, created_at, context
    FROM edges
    ORDER BY id
  `).all();

  console.log(`   Found ${edges.length} edges to migrate`);

  let migrated = 0;
  for (const edge of edges) {
    try {
      await turso.execute({
        sql: `INSERT INTO edges (id, from_node_id, to_node_id, source, created_at, context)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          edge.id,
          edge.from_node_id,
          edge.to_node_id,
          edge.source || 'user',
          edge.created_at || new Date().toISOString(),
          edge.context
        ]
      });
      migrated++;
    } catch (error) {
      console.error(`   ❌ Error migrating edge ${edge.id}:`, error.message);
    }
  }

  console.log(`✅ Migrated ${migrated} edges`);
  return migrated;
}

async function migrateDimensions() {
  console.log('📁 Migrating dimensions...');

  const dimensions = prospectDb.prepare(`
    SELECT name, description, is_priority, updated_at
    FROM dimensions
    ORDER BY name
  `).all();

  console.log(`   Found ${dimensions.length} dimensions to migrate`);

  let migrated = 0;
  for (const dim of dimensions) {
    try {
      await turso.execute({
        sql: `INSERT INTO dimensions (name, description, is_priority, updated_at)
              VALUES (?, ?, ?, ?)`,
        args: [
          dim.name,
          dim.description,
          dim.is_priority || 0,
          dim.updated_at || new Date().toISOString()
        ]
      });
      migrated++;
    } catch (error) {
      console.error(`   ❌ Error migrating dimension ${dim.name}:`, error.message);
    }
  }

  console.log(`✅ Migrated ${migrated} dimensions`);
  return migrated;
}

async function migrateNodeDimensions() {
  console.log('🏷️  Migrating node_dimensions...');

  const nodeDims = prospectDb.prepare(`
    SELECT node_id, dimension
    FROM node_dimensions
    ORDER BY node_id, dimension
  `).all();

  console.log(`   Found ${nodeDims.length} node_dimension associations to migrate`);

  let migrated = 0;
  for (const nd of nodeDims) {
    try {
      // Ensure dimension exists first
      await turso.execute({
        sql: `INSERT OR IGNORE INTO dimensions (name, is_priority, updated_at)
              VALUES (?, 0, ?)`,
        args: [nd.dimension, new Date().toISOString()]
      });

      await turso.execute({
        sql: `INSERT INTO node_dimensions (node_id, dimension)
              VALUES (?, ?)`,
        args: [nd.node_id, nd.dimension]
      });
      migrated++;
    } catch (error) {
      console.error(`   ❌ Error migrating node_dimension ${nd.node_id} -> ${nd.dimension}:`, error.message);
    }
  }

  console.log(`✅ Migrated ${migrated} node_dimension associations`);
  return migrated;
}

async function rebuildFTS() {
  console.log('🔍 Rebuilding FTS index...');

  try {
    // Check if FTS table exists
    const ftsCheck = await turso.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes_fts'");

    if (ftsCheck.rows.length > 0) {
      // Rebuild FTS content from nodes table
      await turso.execute("INSERT INTO nodes_fts(nodes_fts) VALUES('rebuild')");
      console.log('✅ FTS index rebuilt');
    } else {
      console.log('⚠️  FTS table not found - skipping rebuild');
    }
  } catch (error) {
    console.error('⚠️  FTS rebuild error (may be expected):', error.message);
  }
}

async function verifyMigration() {
  console.log('\n📊 Verifying migration...\n');

  const nodeCount = await turso.execute('SELECT COUNT(*) as count FROM nodes');
  const edgeCount = await turso.execute('SELECT COUNT(*) as count FROM edges');
  const dimCount = await turso.execute('SELECT COUNT(*) as count FROM dimensions');
  const nodeDimCount = await turso.execute('SELECT COUNT(*) as count FROM node_dimensions');

  console.log('Turso counts:');
  console.log(`  Nodes: ${nodeCount.rows[0].count}`);
  console.log(`  Edges: ${edgeCount.rows[0].count}`);
  console.log(`  Dimensions: ${dimCount.rows[0].count}`);
  console.log(`  Node_dimensions: ${nodeDimCount.rows[0].count}`);

  // Sample some nodes
  const sampleNodes = await turso.execute('SELECT id, title, substr(description, 1, 50) as desc_preview FROM nodes LIMIT 5');
  console.log('\nSample nodes:');
  for (const row of sampleNodes.rows) {
    console.log(`  ${row.id}: ${row.title}`);
  }

  // Test FTS search
  try {
    const searchTest = await turso.execute({
      sql: "SELECT id, title FROM nodes WHERE title LIKE ? LIMIT 3",
      args: ['%swyx%']
    });
    console.log(`\nSearch test for "swyx": ${searchTest.rows.length} results`);
  } catch (error) {
    console.log('\nSearch test skipped');
  }
}

async function main() {
  console.log('🚀 Starting prospect DB migration to Turso\n');
  console.log(`   Source: ${PROSPECT_DB_PATH}`);
  console.log(`   Target: ${process.env.TURSO_DATABASE_URL}\n`);

  try {
    await clearTurso();
    await migrateNodes();
    await migrateEdges();
    await migrateDimensions();
    await migrateNodeDimensions();
    await rebuildFTS();
    await verifyMigration();

    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    prospectDb.close();
  }
}

main();
