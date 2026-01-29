import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';

    if (!query.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Search query is required'
      }, { status: 400 });
    }

    const sqlite = getSQLiteClient();

    const result = await sqlite.query(`
      SELECT nd.dimension, COUNT(*) AS count
      FROM node_dimensions nd
      WHERE LOWER(nd.dimension) LIKE LOWER(?)
      GROUP BY nd.dimension
      ORDER BY count DESC, nd.dimension ASC
      LIMIT 20
    `, [`%${query}%`]);

    return NextResponse.json({
      success: true,
      data: result.rows.map((row: any) => ({
        dimension: row.dimension,
        count: Number(row.count)
      }))
    });
  } catch (error) {
    console.error('Error searching dimensions:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search dimensions'
    }, { status: 500 });
  }
}
