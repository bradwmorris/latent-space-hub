/**
 * Backfill event_status: 'recording' for existing paper-club and builders-club nodes.
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

  // Find all paper-club and builders-club nodes that don't have event_status set
  const result = await db.execute({
    sql: `SELECT id, node_type, title, metadata FROM nodes
          WHERE node_type IN ('paper-club', 'builders-club')
          AND (json_extract(metadata, '$.event_status') IS NULL)`,
    args: [],
  });

  console.log(`Found ${result.rows.length} nodes to backfill`);

  if (dryRun) {
    for (const row of result.rows) {
      console.log(`  [dry-run] Would update node ${row.id}: ${row.title}`);
    }
    return;
  }

  let updated = 0;
  for (const row of result.rows) {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(row.metadata as string);
    } catch {
      // no existing metadata
    }
    metadata.event_status = 'recording';

    await db.execute({
      sql: 'UPDATE nodes SET metadata = ?, updated_at = datetime() WHERE id = ?',
      args: [JSON.stringify(metadata), row.id as number],
    });
    updated++;
    console.log(`  Updated node ${row.id}: ${row.title}`);
  }

  console.log(`Done. Updated ${updated} nodes.`);
}

main().catch(console.error);
