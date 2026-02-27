import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side readonly enforcement.
 * Blocks all mutation requests (POST/PUT/DELETE/PATCH) to API routes
 * when NEXT_PUBLIC_READONLY_MODE=true.
 *
 * Whitelisted routes that bypass the block:
 * - /api/cron/*       — Vercel cron jobs (already auth-protected by CRON_SECRET)
 * - /api/mcp, /api/sse — MCP transport (has its own MCP_ALLOW_WRITES control)
 * - /api/health/*     — Health checks (read-only)
 * - /api/backend/*    — Subscription proxy (disabled separately)
 */

const READONLY = process.env.NEXT_PUBLIC_READONLY_MODE === 'true';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

const WHITELISTED_PREFIXES = [
  '/api/cron/',
  '/api/health/',
  '/api/backend/',
];

const WHITELISTED_EXACT = [
  '/api/mcp',
  '/api/sse',
];

function isWhitelisted(pathname: string): boolean {
  if (WHITELISTED_EXACT.includes(pathname)) return true;
  return WHITELISTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  if (!READONLY) return NextResponse.next();
  if (!MUTATION_METHODS.has(request.method)) return NextResponse.next();

  const pathname = request.nextUrl.pathname;

  // Only guard /api/* routes
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  if (isWhitelisted(pathname)) return NextResponse.next();

  return NextResponse.json(
    { success: false, error: 'This instance is read-only.' },
    { status: 403 }
  );
}

export const config = {
  matcher: '/api/:path*',
};
