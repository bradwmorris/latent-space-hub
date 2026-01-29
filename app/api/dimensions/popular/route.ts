import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { eventBroadcaster } from '@/services/events';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const sqlite = getSQLiteClient();

    const result = await sqlite.query(`
      WITH dimension_counts AS (
        SELECT nd.dimension, COUNT(*) AS count
        FROM node_dimensions nd
        GROUP BY nd.dimension
      ),
      all_dimensions AS (
        SELECT DISTINCT dimension AS name FROM node_dimensions
        UNION
        SELECT name FROM dimensions
      )
      SELECT ad.name AS dimension,
             COALESCE(dc.count, 0) AS count,
             COALESCE(dim.is_priority, 0) AS is_priority,
             dim.description
      FROM all_dimensions ad
      LEFT JOIN dimension_counts dc ON dc.dimension = ad.name
      LEFT JOIN dimensions dim ON dim.name = ad.name
      WHERE ad.name IS NOT NULL
      ORDER BY is_priority DESC, LOWER(ad.name) ASC
    `);

    return NextResponse.json({
      success: true,
      data: result.rows.map((row: any) => ({
        dimension: row.dimension,
        count: Number(row.count),
        isPriority: Boolean(row.is_priority),
        description: row.description || null
      }))
    });
  } catch (error) {
    console.error('Error fetching popular dimensions:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch popular dimensions'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { dimension } = await request.json();

    if (!dimension || typeof dimension !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'Dimension name is required'
      }, { status: 400 });
    }

    const sqlite = getSQLiteClient();

    const result = await sqlite.query(`
      INSERT INTO dimensions(name, is_priority, updated_at)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        is_priority = CASE WHEN is_priority=1 THEN 0 ELSE 1 END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING is_priority
    `, [dimension]);

    const isPriority = Boolean(result.rows[0].is_priority);

    // Broadcast dimension update event
    eventBroadcaster.broadcast({
      type: 'DIMENSION_UPDATED',
      data: { dimension, isPriority }
    });

    return NextResponse.json({
      success: true,
      data: {
        dimension,
        is_priority: isPriority
      }
    });
  } catch (error) {
    console.error('Error toggling dimension priority:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
