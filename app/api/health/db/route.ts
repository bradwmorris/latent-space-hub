import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/services/database';

export const runtime = 'nodejs';

export async function GET() {
  // Debug: check env vars
  const debug = {
    hasUrl: !!process.env.TURSO_DATABASE_URL,
    urlPrefix: process.env.TURSO_DATABASE_URL?.substring(0, 20) || 'not set',
    hasToken: !!process.env.TURSO_AUTH_TOKEN,
  };

  try {
    const status = await checkDatabaseHealth();
    return NextResponse.json({ success: true, ...status, debug, fullUrl: process.env.TURSO_DATABASE_URL });
  } catch (error) {
    return NextResponse.json({
      success: false,
      connected: false,
      vectorExtension: false,
      tablesExist: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      debug,
      fullUrl: process.env.TURSO_DATABASE_URL
    }, { status: 500 });
  }
}

