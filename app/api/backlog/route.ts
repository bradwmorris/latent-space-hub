import { NextResponse } from 'next/server';
import { getBacklogOverview } from '@/services/backlog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getBacklogOverview();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load backlog',
      },
      { status: 500 }
    );
  }
}
