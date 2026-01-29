import { getSQLiteClient } from '@/services/database/sqlite-client';
import { getAutoContextSettings } from '@/services/settings/autoContextSettings';

interface AutoContextRow {
  id: number;
  title: string | null;
  updated_at: string;
  edge_count: number | null;
}

export interface AutoContextSummary {
  id: number;
  title: string;
  edgeCount: number;
  updatedAt: string;
}

async function fetchAutoContextRows(limit: number): Promise<AutoContextSummary[]> {
  const db = getSQLiteClient();
  const result = await db.query<AutoContextRow>(
    `
      SELECT n.id,
             n.title,
             n.updated_at,
             COUNT(DISTINCT e.id) AS edge_count
        FROM nodes n
        LEFT JOIN edges e
          ON (e.from_node_id = n.id OR e.to_node_id = n.id)
       WHERE n.type IS NULL OR n.type != 'memory'
       GROUP BY n.id
       ORDER BY edge_count DESC, n.updated_at DESC
       LIMIT ?
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title || 'Untitled node',
    updatedAt: row.updated_at,
    edgeCount: Number(row.edge_count ?? 0),
  }));
}

export async function getAutoContextSummaries(limit = 10): Promise<AutoContextSummary[]> {
  const settings = await getAutoContextSettings();
  if (!settings.autoContextEnabled) {
    return [];
  }
  return fetchAutoContextRows(limit);
}

export async function buildAutoContextBlock(limit = 10): Promise<string | null> {
  const summaries = await getAutoContextSummaries(limit);
  if (summaries.length === 0) {
    return null;
  }

  const lines: string[] = [
    '=== BACKGROUND CONTEXT ===',
    'Top 10 most-connected nodes (important knowledge hubs). Use queryNodes/getNodesById if relevant.',
    '',
  ];

  for (const summary of summaries) {
    lines.push(`[NODE:${summary.id}:"${summary.title}"] (edges: ${summary.edgeCount})`);
  }

  return lines.join('\n');
}
