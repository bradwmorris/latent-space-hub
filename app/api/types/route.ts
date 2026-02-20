import { NextResponse } from 'next/server';
import { nodeService } from '@/services/database';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const typeCounts = await nodeService.getTypeCounts();

    return NextResponse.json({
      success: true,
      data: typeCounts,
    });
  } catch (error) {
    console.error('Error fetching type counts:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch type counts',
    }, { status: 500 });
  }
}
