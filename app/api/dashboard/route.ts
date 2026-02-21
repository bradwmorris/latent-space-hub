import { NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { CATEGORIES } from '@/config/categories';

export const runtime = 'nodejs';

interface PreviewItem {
  id: number;
  title: string;
  date?: string;
  edge_count?: number;
}

interface CategoryData {
  key: string;
  label: string;
  count: number;
  preview: PreviewItem[];
}

export async function GET() {
  try {
    const sqlite = getSQLiteClient();

    // Aggregate stats
    const [nodesResult, edgesResult, chunksResult, contentResult] = await Promise.all([
      sqlite.query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM nodes"),
      sqlite.query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM edges"),
      sqlite.query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM chunks"),
      sqlite.query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM nodes WHERE node_type IN ('podcast', 'builders-club', 'paper-club', 'workshop', 'ainews', 'article')"
      ),
    ]);

    const stats = {
      total_nodes: Number(nodesResult.rows[0]?.cnt ?? 0),
      total_edges: Number(edgesResult.rows[0]?.cnt ?? 0),
      total_chunks: Number(chunksResult.rows[0]?.cnt ?? 0),
      total_content: Number(contentResult.rows[0]?.cnt ?? 0),
    };

    // Category data — one query per category for count + preview
    const categories: CategoryData[] = await Promise.all(
      CATEGORIES.map(async (cat) => {
        // Count
        const countResult = await sqlite.query<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM nodes WHERE node_type = ?",
          [cat.key]
        );
        const count = Number(countResult.rows[0]?.cnt ?? 0);

        // Preview — 3 items
        let preview: PreviewItem[] = [];

        if (cat.sortMode === 'recent') {
          const previewResult = await sqlite.query<{
            id: number;
            title: string;
            event_date: string | null;
            updated_at: string;
          }>(
            `SELECT id, title, event_date, updated_at
             FROM nodes
             WHERE node_type = ?
             ORDER BY event_date DESC NULLS LAST, updated_at DESC
             LIMIT 3`,
            [cat.key]
          );
          preview = previewResult.rows.map(r => ({
            id: Number(r.id),
            title: r.title,
            date: r.event_date || r.updated_at?.split('T')[0],
          }));
        } else {
          // connected — order by edge count
          const previewResult = await sqlite.query<{
            id: number;
            title: string;
            edge_count: number;
          }>(
            `SELECT n.id, n.title,
                    (SELECT COUNT(*) FROM edges WHERE from_node_id = n.id OR to_node_id = n.id) as edge_count
             FROM nodes n
             WHERE n.node_type = ?
             ORDER BY edge_count DESC
             LIMIT 3`,
            [cat.key]
          );
          preview = previewResult.rows.map(r => ({
            id: Number(r.id),
            title: r.title,
            edge_count: Number(r.edge_count),
          }));
        }

        return {
          key: cat.key,
          label: cat.label,
          count,
          preview,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: { stats, categories },
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dashboard data',
    }, { status: 500 });
  }
}
