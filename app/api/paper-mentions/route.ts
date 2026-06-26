import { NextRequest, NextResponse } from 'next/server';
import { paperMentionService } from '@/services/database/paperMentions';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : 100;
    const data = await paperMentionService.list(Number.isFinite(limit) ? limit : 100);

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    console.error('Error fetching paper mentions:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch paper mentions',
    }, { status: 500 });
  }
}
