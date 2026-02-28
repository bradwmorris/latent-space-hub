/**
 * Node embedding service for Latent Space Hub.
 * Uses OpenAI text-embedding-3-small + Turso native vector (F32_BLOB).
 *
 * For batch operations, prefer scripts/embed-all.ts (uses @libsql/client directly).
 * This service is used by the embedNodeContent pipeline in the Next.js app.
 */
import { getSQLiteClient } from '@/src/services/database/sqlite-client';

interface EmbedNodeOptions {
  nodeId?: number;
  forceReEmbed?: boolean;
  verbose?: boolean;
}

export class NodeEmbedder {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is required for NodeEmbedder');
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });
    if (!response.ok) throw new Error(`OpenAI embedding error ${response.status}`);
    const data = await response.json();
    return data.data[0].embedding;
  }

  async embedNodes(options: EmbedNodeOptions): Promise<{ processed: number; failed: number }> {
    const sqlite = getSQLiteClient();
    let processed = 0, failed = 0;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (options.nodeId) {
      whereClause += ' AND id = ?';
      params.push(options.nodeId);
    } else if (!options.forceReEmbed) {
      whereClause += ' AND embedding IS NULL';
    }

    const nodes = await sqlite.query<{ id: number; title: string; description: string | null }>(
      `SELECT id, title, description FROM nodes ${whereClause} ORDER BY id ASC LIMIT 1000`,
      params
    );

    for (const node of nodes.rows) {
      try {
        const text = `${node.title}\n${node.description || ''}`.trim();
        const embedding = await this.getEmbedding(text);
        const vecJson = '[' + embedding.join(',') + ']';

        await sqlite.query(
          'UPDATE nodes SET embedding = vector(?), embedding_vec = vector(?), embedding_text = ?, embedding_updated_at = datetime() WHERE id = ?',
          [vecJson, vecJson, text.slice(0, 2000), node.id]
        );

        processed++;
        if (options.verbose) console.log(`  Embedded node ${node.id}: ${node.title.slice(0, 50)}`);
      } catch (err: any) {
        failed++;
        if (options.verbose) console.error(`  Failed node ${node.id}: ${err.message}`);
      }
    }

    return { processed, failed };
  }

  close(): void {
    // No-op — connection managed by getSQLiteClient
  }
}

export async function runCLI(args: string[]): Promise<void> {
  const embedder = new NodeEmbedder();
  const nodeId = args[0] ? parseInt(args[0], 10) : undefined;
  const result = await embedder.embedNodes({ nodeId, verbose: true });
  console.log(`Done: ${result.processed} embedded, ${result.failed} failed`);
}

if (require.main === module) {
  runCLI(process.argv.slice(2)).catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
