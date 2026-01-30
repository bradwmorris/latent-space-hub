import { NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';

export const runtime = 'nodejs';

export async function POST() {
  const sqlite = getSQLiteClient();
  const results: string[] = [];

  try {
    // Add source column to edges table if it doesn't exist
    try {
      await sqlite.query(`ALTER TABLE edges ADD COLUMN source TEXT DEFAULT 'user'`);
      results.push('Added source column to edges table');
    } catch (e: any) {
      if (e.message?.includes('duplicate column')) {
        results.push('source column already exists');
      } else {
        results.push(`source column error: ${e.message}`);
      }
    }

    // Verify the schema
    const schema = await sqlite.query<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='edges'"
    );

    return NextResponse.json({
      success: true,
      results,
      currentSchema: schema.rows[0]?.sql
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results
    }, { status: 500 });
  }
}
