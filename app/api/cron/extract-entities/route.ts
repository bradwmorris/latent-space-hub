import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { extractEntitiesForNode } from '@/services/extraction/entityExtractor';
import { NodeType } from '@/types/database';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const maxItems = Number(request.nextUrl.searchParams.get('limit') || '15');
  const sqlite = getSQLiteClient();

  // Find content nodes that haven't had entity extraction run yet (or where it failed).
  // Uses metadata audit trail instead of edge count (which was broken by companion linking).
  const candidates = await sqlite.query<{
    id: number;
    title: string;
    chunk: string | null;
    node_type: string;
    metadata: string | null;
  }>(
    `SELECT n.id, n.title, SUBSTR(n.chunk, 1, 3000) as chunk, n.node_type, n.metadata
     FROM nodes n
     WHERE n.node_type IN ('podcast', 'article', 'ainews', 'builders-club', 'paper-club', 'workshop')
       AND n.chunk IS NOT NULL
       AND (
         json_extract(n.metadata, '$.entity_extraction.status') IS NULL
         OR json_extract(n.metadata, '$.entity_extraction.status') = 'failed'
       )
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [maxItems]
  );

  if (candidates.rows.length === 0) {
    return NextResponse.json({
      success: true,
      data: { message: 'No nodes need entity extraction', processed: 0 },
    });
  }

  const results: Array<{ nodeId: number; title: string; status: string; entities?: number; error?: string }> = [];

  for (const node of candidates.rows) {
    const nodeId = Number(node.id);
    const nodeType = node.node_type as NodeType;
    const title = node.title;
    const chunk = node.chunk || '';

    let metadata: Record<string, unknown> = {};
    try {
      metadata = node.metadata ? JSON.parse(node.metadata) : {};
    } catch { /* use empty */ }

    try {
      await extractEntitiesForNode({
        nodeId,
        nodeType,
        title,
        chunk,
        metadata,
      });

      // Read back the updated metadata to get edge count
      const updated = await sqlite.query<{ metadata: string }>(
        'SELECT metadata FROM nodes WHERE id = ?',
        [nodeId]
      );
      let edgesCreated = 0;
      try {
        const updatedMeta = JSON.parse(updated.rows[0]?.metadata || '{}');
        edgesCreated = updatedMeta.entity_extraction?.edges_created || 0;
      } catch { /* ignore */ }

      results.push({ nodeId, title, status: 'success', entities: edgesCreated });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[extract-entities] Failed for node ${nodeId}:`, msg);
      results.push({ nodeId, title, status: 'failed', error: msg });

      // Write failed audit trail
      try {
        metadata.entity_extraction = {
          status: 'failed',
          extracted_at: new Date().toISOString(),
          error: msg,
        };
        await sqlite.query(
          'UPDATE nodes SET metadata = ?, updated_at = datetime() WHERE id = ?',
          [JSON.stringify(metadata), nodeId]
        );
      } catch { /* non-fatal */ }
    }
  }

  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return NextResponse.json({
    success: true,
    data: {
      processed: results.length,
      succeeded,
      failed,
      results,
    },
  });
}
