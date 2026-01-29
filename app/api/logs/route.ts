import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { LogEntry, LogsResponse } from '@/types/logs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10), 1), 500);
    const threadId = searchParams.get('threadId')?.trim() || null;
    const traceId = searchParams.get('traceId')?.trim() || null;
    const tableFilter = searchParams.get('table')?.trim() || null;

    const db = getSQLiteClient();

    let result;
    if (threadId) {
      result = await db.query<LogEntry>(
        `SELECT id, ts, table_name, action, row_id, summary, snapshot_json, enriched_summary
         FROM logs
         WHERE table_name = 'chats' AND json_extract(snapshot_json, '$.thread') = ?
         ORDER BY id ASC`,
        [threadId]
      );
    } else if (traceId) {
      result = await db.query<LogEntry>(
        `SELECT id, ts, table_name, action, row_id, summary, snapshot_json, enriched_summary
         FROM logs
         WHERE json_extract(snapshot_json, '$.trace_id') = ?
         ORDER BY id ASC`,
        [traceId]
      );
    } else {
      const offset = (page - 1) * limit;
      const params: Array<string | number> = [limit, offset];
      const tableClause = tableFilter ? `WHERE table_name = ?` : '';
      if (tableFilter) {
        params.unshift(tableFilter);
      }

      result = await db.query<LogEntry>(
        `SELECT id, ts, table_name, action, row_id, summary, snapshot_json, enriched_summary
         FROM logs
         ${tableClause}
         ORDER BY id DESC
         LIMIT ? OFFSET ?`,
        params
      );
    }
    
    const response: LogsResponse = {
      logs: result.rows,
      page,
      limit,
      threadId: threadId || undefined,
      traceId: traceId || undefined,
      table: tableFilter || undefined
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}
