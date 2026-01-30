import { NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';

export const runtime = 'nodejs';

export async function GET() {
  const sqlite = getSQLiteClient();
  const debug: Record<string, any> = {};

  try {
    // Test 1: Check if edges table exists
    const tables = await sqlite.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='edges'"
    );
    debug.edgesTableExists = tables.rows.length > 0;

    // Test 2: Get edges table schema
    if (debug.edgesTableExists) {
      const schema = await sqlite.query<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='edges'"
      );
      debug.edgesSchema = schema.rows[0]?.sql;
    }

    // Test 3: Try a simple INSERT and check lastInsertRowid
    const testInsert = await sqlite.query(`
      INSERT INTO edges (from_node_id, to_node_id, context, source, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [2, 12, JSON.stringify({ test: true }), 'user', new Date().toISOString()]);

    debug.insertResult = {
      changes: testInsert.changes,
      lastInsertRowid: testInsert.lastInsertRowid,
      lastInsertRowidType: typeof testInsert.lastInsertRowid
    };

    // Test 4: Try to retrieve the edge
    if (testInsert.lastInsertRowid) {
      const retrieved = await sqlite.query<any>(
        'SELECT * FROM edges WHERE id = ?',
        [testInsert.lastInsertRowid]
      );
      debug.retrievedEdge = retrieved.rows[0] || 'NOT FOUND';
    }

    // Test 5: Fallback query
    const fallback = await sqlite.query<{ id: number }>(
      'SELECT id FROM edges WHERE from_node_id = ? AND to_node_id = ? ORDER BY id DESC LIMIT 1',
      [2, 12]
    );
    debug.fallbackQuery = fallback.rows[0] || 'NOT FOUND';

    // Test 6: Count all edges
    const count = await sqlite.query<{ count: number }>('SELECT COUNT(*) as count FROM edges');
    debug.totalEdges = count.rows[0]?.count;

    return NextResponse.json({ success: true, debug });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      debug
    }, { status: 500 });
  }
}
