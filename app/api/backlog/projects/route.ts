import { NextRequest, NextResponse } from 'next/server';
import { createBacklogProject } from '@/services/backlog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.BACKLOG_ADMIN_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const headerSecret = request.headers.get('x-backlog-admin-secret')
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || '';
  return headerSecret === secret;
}

function parseLabels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((label) => typeof label === 'string' ? label.trim() : '')
    .filter(Boolean)
    .slice(0, 10);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body?.title || !body?.notes) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: title and notes are required' },
        { status: 400 }
      );
    }

    const result = await createBacklogProject({
      title: body.title,
      notes: body.notes,
      labels: parseLabels(body.labels),
      type: body.type,
      priority: body.priority,
      status: body.status,
      dueDate: body.dueDate,
      tasks: body.tasks,
      owner: body.owner,
      sourceSurface: body.sourceSurface,
      sourceActor: body.sourceActor,
      sourceConversationId: body.sourceConversationId,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create backlog project',
      },
      { status: 500 }
    );
  }
}
