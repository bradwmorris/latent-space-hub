import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { eventBroadcaster } from '@/services/events';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const sqlite = getSQLiteClient();

    // Get all dimensions with their counts
    const result = await sqlite.query(`
      WITH dimension_counts AS (
        SELECT nd.dimension, COUNT(*) AS count
        FROM node_dimensions nd
        GROUP BY nd.dimension
      )
      SELECT
        d.name AS dimension,
        d.description,
        d.is_priority AS isPriority,
        COALESCE(dc.count, 0) AS count
      FROM dimensions d
      LEFT JOIN dimension_counts dc ON dc.dimension = d.name
      ORDER BY d.is_priority DESC, d.name ASC
    `);

    return NextResponse.json({
      success: true,
      data: result.rows.map((row: any) => ({
        dimension: row.dimension,
        description: row.description,
        isPriority: Boolean(row.isPriority),
        count: Number(row.count)
      }))
    });
  } catch (error) {
    console.error('Error fetching dimensions:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dimensions'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : null;
    const isPriority = typeof body?.isPriority === 'boolean' ? body.isPriority : false;

    if (!rawName) {
      return NextResponse.json({
        success: false,
        error: 'Dimension name is required'
      }, { status: 400 });
    }

    if (description && description.length > 500) {
      return NextResponse.json({
        success: false,
        error: 'Description must be 500 characters or less'
      }, { status: 400 });
    }

    const sqlite = getSQLiteClient();
    const result = await sqlite.query(`
      INSERT INTO dimensions(name, description, is_priority, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        description = COALESCE(?, description),
        is_priority = COALESCE(?, is_priority),
        updated_at = CURRENT_TIMESTAMP
      RETURNING name, description, is_priority
    `, [rawName, description, isPriority ? 1 : 0, description, isPriority ? 1 : 0]);

    if (result.rows.length === 0) {
      throw new Error('Failed to create dimension');
    }

    const row = result.rows[0];
    const dimension = row.name as string;
    const isPriorityValue = Boolean(row.is_priority);
    const descriptionValue = row.description as string | null;

    eventBroadcaster.broadcast({
      type: 'DIMENSION_UPDATED',
      data: { dimension, isPriority: isPriorityValue, description: descriptionValue, count: 0 }
    });

    return NextResponse.json({
      success: true,
      data: {
        dimension,
        description: descriptionValue,
        isPriority: isPriorityValue
      }
    });
  } catch (error) {
    console.error('Error creating dimension:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create dimension'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const currentName = typeof body?.currentName === 'string' ? body.currentName.trim() : '';
    const newName = typeof body?.newName === 'string' ? body.newName.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const isPriority = typeof body?.isPriority === 'boolean' ? body.isPriority : undefined;

    const sqlite = getSQLiteClient();

    // Handle isPriority update (lock/unlock) - simple case
    if (isPriority !== undefined && name && !currentName && !newName) {
      const updateResult = await sqlite.query(`
        UPDATE dimensions
        SET is_priority = ?, updated_at = CURRENT_TIMESTAMP
        WHERE name = ?
      `, [isPriority ? 1 : 0, name]);

      if (updateResult.changes === 0) {
        return NextResponse.json({
          success: false,
          error: 'Dimension not found'
        }, { status: 404 });
      }

      eventBroadcaster.broadcast({
        type: 'DIMENSION_UPDATED',
        data: { dimension: name, isPriority }
      });

      return NextResponse.json({
        success: true,
        data: { dimension: name, isPriority }
      });
    }

    // Handle dimension name change
    if (currentName && newName && currentName !== newName) {
      if (!newName) {
        return NextResponse.json({
          success: false,
          error: 'New dimension name is required'
        }, { status: 400 });
      }

      // Check if new name already exists
      const existingCheck = await sqlite.query(`
        SELECT name FROM dimensions WHERE name = ?
      `, [newName]);

      if (existingCheck.rows.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'A dimension with this name already exists'
        }, { status: 400 });
      }

      // Build update query with optional fields
      const updates: string[] = ['name = ?', 'updated_at = CURRENT_TIMESTAMP'];
      const values: any[] = [newName];

      if (description !== '') {
        updates.push('description = ?');
        values.push(description || null);
      }

      if (isPriority !== undefined) {
        updates.push('is_priority = ?');
        values.push(isPriority ? 1 : 0);
      }

      values.push(currentName);

      const dimUpdate = await sqlite.query(`
        UPDATE dimensions
        SET ${updates.join(', ')}
        WHERE name = ?
      `, values);

      if (dimUpdate.changes === 0) {
        return NextResponse.json({
          success: false,
          error: 'Dimension not found'
        }, { status: 404 });
      }

      // Update node_dimensions table
      const nodeDimUpdate = await sqlite.query(`
        UPDATE node_dimensions
        SET dimension = ?
        WHERE dimension = ?
      `, [newName, currentName]);

      eventBroadcaster.broadcast({
        type: 'DIMENSION_UPDATED',
        data: {
          dimension: newName,
          previousName: currentName,
          description: description || undefined,
          isPriority: isPriority !== undefined ? isPriority : undefined,
          renamed: true
        }
      });

      return NextResponse.json({
        success: true,
        data: {
          dimension: newName,
          previousName: currentName,
          description: description || undefined,
          isPriority: isPriority !== undefined ? isPriority : undefined,
          nodeLinksUpdated: nodeDimUpdate.changes || 0
        }
      });
    }

    // Handle description and/or isPriority update (existing functionality)
    const targetName = name || currentName;
    if (!targetName) {
      return NextResponse.json({
        success: false,
        error: 'Dimension name is required'
      }, { status: 400 });
    }

    if (description && description.length > 500) {
      return NextResponse.json({
        success: false,
        error: 'Description must be 500 characters or less'
      }, { status: 400 });
    }

    // Build update query
    if (description !== '' || isPriority !== undefined) {
      const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const values: any[] = [];

      if (description !== '') {
        updates.push('description = ?');
        values.push(description || null);
      }

      if (isPriority !== undefined) {
        updates.push('is_priority = ?');
        values.push(isPriority ? 1 : 0);
      }

      values.push(targetName);

      const updateResult = await sqlite.query(`
        UPDATE dimensions
        SET ${updates.join(', ')}
        WHERE name = ?
      `, values);

      if (updateResult.changes === 0) {
        return NextResponse.json({
          success: false,
          error: 'Dimension not found'
        }, { status: 404 });
      }
    } else {
      // No updates provided
      return NextResponse.json({
        success: false,
        error: 'At least one update field (description or isPriority) must be provided'
      }, { status: 400 });
    }

    eventBroadcaster.broadcast({
      type: 'DIMENSION_UPDATED',
      data: {
        dimension: targetName,
        description: description !== '' ? description : undefined,
        isPriority: isPriority !== undefined ? isPriority : undefined
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        dimension: targetName,
        description: description !== '' ? description : undefined,
        isPriority: isPriority !== undefined ? isPriority : undefined
      }
    });
  } catch (error) {
    console.error('Error updating dimension:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update dimension'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const dimension = (request.nextUrl.searchParams.get('name') || '').trim();
    if (!dimension) {
      return NextResponse.json({
        success: false,
        error: 'Dimension name is required'
      }, { status: 400 });
    }

    const sqlite = getSQLiteClient();

    // Delete node_dimensions first
    const nodeDimResult = await sqlite.query('DELETE FROM node_dimensions WHERE dimension = ?', [dimension]);
    const removedLinks = nodeDimResult.changes || 0;

    // Delete dimension
    const dimResult = await sqlite.query('DELETE FROM dimensions WHERE name = ?', [dimension]);
    const removedRow = dimResult.changes || 0;

    if (!removedLinks && !removedRow) {
      return NextResponse.json({
        success: false,
        error: 'Dimension not found'
      }, { status: 404 });
    }

    eventBroadcaster.broadcast({
      type: 'DIMENSION_UPDATED',
      data: { dimension, deleted: true }
    });

    return NextResponse.json({
      success: true,
      data: {
        dimension,
        deleted: true
      }
    });
  } catch (error) {
    console.error('Error deleting dimension:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete dimension'
    }, { status: 500 });
  }
}
