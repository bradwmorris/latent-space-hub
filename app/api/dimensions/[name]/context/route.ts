import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';

export interface DimensionContext {
  name: string;
  description: string | null;
  isPriority: boolean;
  nodeCount: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);

    const db = getSQLiteClient();

    // Get dimension metadata
    const dimensionResult = await db.query<{
      name: string;
      description: string | null;
      is_priority: number;
    }>(
      'SELECT name, description, is_priority FROM dimensions WHERE name = ?',
      [decodedName]
    );

    const dimension = dimensionResult.rows[0];

    if (!dimension) {
      return NextResponse.json(
        { success: false, error: 'Dimension not found' },
        { status: 404 }
      );
    }

    // Count nodes in this dimension (via node_dimensions join table)
    const countResult = await db.query<{ count: number }>(
      `SELECT COUNT(DISTINCT node_id) as count FROM node_dimensions WHERE dimension = ?`,
      [decodedName]
    );

    const context: DimensionContext = {
      name: dimension.name,
      description: dimension.description,
      isPriority: dimension.is_priority === 1,
      nodeCount: countResult.rows[0]?.count || 0,
    };

    return NextResponse.json({
      success: true,
      data: context,
    });
  } catch (error) {
    console.error('Error fetching dimension context:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dimension context' },
      { status: 500 }
    );
  }
}
