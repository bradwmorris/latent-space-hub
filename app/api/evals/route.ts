import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';

export const dynamic = 'force-dynamic';

type TraceRow = {
  id: number;
  chat_type: string;
  user_message: string | null;
  assistant_message: string | null;
  thread_id: string | null;
  helper_name: string | null;
  agent_type: string | null;
  metadata: string | null;
  created_at: string | null;
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page') || 1));
  const limit = Math.min(100, Math.max(1, Number(params.get('limit') || 25)));
  const offset = (page - 1) * limit;
  const filter = params.get('filter') || 'all';
  const search = params.get('search')?.trim() || '';

  const db = getSQLiteClient();

  const conditions: string[] = ["chat_type = 'discord'"];
  const queryParams: (string | number)[] = [];

  if (filter === 'slash') {
    conditions.push("json_extract(metadata, '$.is_slash_command') = 1");
  } else if (filter === 'kickoff') {
    conditions.push("json_extract(metadata, '$.is_kickoff') = 1");
  } else if (filter === 'tools') {
    conditions.push("json_extract(metadata, '$.tool_calls') IS NOT NULL AND json_extract(metadata, '$.tool_calls') != '[]'");
  }

  if (search) {
    conditions.push("(user_message LIKE ? OR assistant_message LIKE ?)");
    queryParams.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.join(' AND ');

  try {
    const countResult = await db.query<{ total: number }>(
      `SELECT COUNT(*) as total FROM chats WHERE ${where}`,
      queryParams
    );
    const total = countResult.rows[0]?.total || 0;

    const tracesResult = await db.query<TraceRow>(
      `SELECT id, chat_type, user_message, assistant_message, thread_id, helper_name, agent_type, metadata, created_at FROM chats WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const traces = tracesResult.rows.map((row) => {
      let parsedMetadata = null;
      if (row.metadata) {
        try {
          parsedMetadata = JSON.parse(row.metadata);
        } catch {
          parsedMetadata = null;
        }
      }
      return {
        id: row.id,
        user_message: row.user_message,
        assistant_message: row.assistant_message,
        thread_id: row.thread_id,
        helper_name: row.helper_name,
        agent_type: row.agent_type,
        metadata: parsedMetadata,
        created_at: row.created_at,
      };
    });

    return NextResponse.json({
      traces,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
