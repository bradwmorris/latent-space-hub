/**
 * Backfill: Create event nodes for existing paper-club and builders-club recordings.
 *
 * For each existing paper-club or builders-club node:
 * 1. Tag the recording node metadata with event_status: 'recording'
 * 2. Create a new 'event' node with event_type and event_status: 'completed'
 * 3. Add dimensions to node_dimensions table
 * 4. Link the recording node to the event node via edges
 *
 * Run: npx tsx scripts/backfill-event-status.ts [--dry-run]
 */

import { createClient } from '@libsql/client';

const TURSO_URL = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || '';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

if (!TURSO_URL) {
  console.error('Missing TURSO_DATABASE_URL');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  // Find all paper-club and builders-club recording nodes
  const result = await db.execute({
    sql: `SELECT id, node_type, title, event_date, metadata FROM nodes
          WHERE node_type IN ('paper-club', 'builders-club')
          ORDER BY event_date DESC`,
    args: [],
  });

  console.log(`Found ${result.rows.length} recording nodes to process`);

  if (dryRun) {
    for (const row of result.rows) {
      console.log(`  [dry-run] ${row.node_type} #${row.id}: ${row.title}`);
    }
    console.log(`\nDry run complete. Would create ${result.rows.length} event nodes.`);
    return;
  }

  let created = 0;
  for (const row of result.rows) {
    const recordingId = row.id as number;
    const nodeType = row.node_type as string;
    const title = row.title as string;
    const eventDate = row.event_date as string | null;
    const label = nodeType === 'paper-club' ? 'Paper Club' : 'Builders Club';

    // 1. Tag the recording node with event_status: 'recording'
    let recordingMeta: Record<string, unknown> = {};
    try {
      recordingMeta = JSON.parse(row.metadata as string);
    } catch { /* empty */ }
    recordingMeta.event_status = 'recording';

    await db.execute({
      sql: 'UPDATE nodes SET metadata = ?, updated_at = datetime() WHERE id = ?',
      args: [JSON.stringify(recordingMeta), recordingId],
    });

    // 2. Create the event node
    const eventMeta = JSON.stringify({
      event_status: 'completed',
      event_type: nodeType,
      recording_node_id: recordingId,
    });

    const insertResult = await db.execute({
      sql: `INSERT INTO nodes (title, node_type, description, event_date, metadata, created_at, updated_at)
            VALUES (?, 'event', ?, ?, ?, datetime(), datetime())`,
      args: [title, `${label} session`, eventDate, eventMeta],
    });

    const eventNodeId = Number(insertResult.lastInsertRowid);

    // 3. Add dimensions via node_dimensions table
    for (const dim of ['event', nodeType]) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)`,
        args: [eventNodeId, dim],
      });
    }

    // Also ensure the dimension exists in the dimensions table
    await db.execute({
      sql: `INSERT OR IGNORE INTO dimensions (name, description, is_priority, updated_at)
            VALUES ('event', 'Community events (Paper Club, Builders Club)', 0, datetime())`,
      args: [],
    });

    // 4. Create edge: recording -> event
    const edgeContext = JSON.stringify({
      type: 'source_of',
      confidence: 1,
      inferred_at: new Date().toISOString(),
      explanation: `recording of ${label} session`,
      created_via: 'workflow',
    });

    await db.execute({
      sql: `INSERT INTO edges (from_node_id, to_node_id, context, source, created_at)
            VALUES (?, ?, ?, 'ai_similarity', datetime())`,
      args: [recordingId, eventNodeId, edgeContext],
    });

    created++;
    console.log(`  Created event #${eventNodeId} for ${nodeType} recording #${recordingId}: ${title}`);
  }

  console.log(`\nDone. Created ${created} event nodes and edges.`);
}

main().catch(console.error);
