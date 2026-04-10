import { NextRequest, NextResponse } from 'next/server';
import { getBacklogProjectDetail } from '@/services/backlog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await getBacklogProjectDetail(id);
    if (!data) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load backlog project',
      },
      { status: 500 }
    );
  }
}
