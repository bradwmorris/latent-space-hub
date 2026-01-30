import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/services/database';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const status = await checkDatabaseHealth();
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    return NextResponse.json({
      success: false,
      connected: false,
      vectorExtension: false,
      tablesExist: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

