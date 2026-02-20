/**
 * Universal chunking and embedding service for Latent Space Hub.
 * Splits node chunk text into pieces, embeds via OpenAI, stores in chunks table.
 *
 * For batch operations, prefer scripts/embed-all.ts (uses @libsql/client directly).
 * This service is used by the embedNodeContent pipeline in the Next.js app.
 */
import { getSQLiteClient } from '@/src/services/database/sqlite-client';

interface EmbedUniversalOptions {
  nodeId: number;
  verbose?: boolean;
}

export class UniversalEmbedder {
  private apiKey: string;
  private readonly CHUNK_SIZE = 2000;
  private readonly CHUNK_OVERLAP = 400;
  private readonly BATCH_SIZE = 20;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is required for UniversalEmbedder');
  }

  private chunkText(text: string): string[] {
    if (!text || text.trim().length === 0) return [];
    const chunks: string[] = [];
    let pos = 0;
    while (pos < text.length) {
      let end = Math.min(pos + this.CHUNK_SIZE, text.length);
      if (end < text.length) {
        const pb = text.lastIndexOf('\n\n', end);
        if (pb > pos + this.CHUNK_SIZE * 0.5) end = pb;
        else {
          const sb = text.lastIndexOf('. ', end);
          if (sb > pos + this.CHUNK_SIZE * 0.5) end = sb + 1;
        }
      }
      const ct = text.slice(pos, end).trim();
      if (ct.length > 0) chunks.push(ct);
      const newPos = end - this.CHUNK_OVERLAP;
      pos = newPos <= pos ? end : newPos;
    }
    return chunks;
  }

  private async batchEmbed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
    });
    if (!response.ok) throw new Error(`OpenAI embedding error ${response.status}`);
    const data = await response.json();
    return data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);
  }

  async processNode(options: EmbedUniversalOptions): Promise<{ chunks: number }> {
    const sqlite = getSQLiteClient();
    const nodeResult = await sqlite.query<{ chunk: string | null }>(
      'SELECT chunk FROM nodes WHERE id = ?',
      [options.nodeId]
    );

    if (nodeResult.rows.length === 0) throw new Error(`Node ${options.nodeId} not found`);
    const chunkText = nodeResult.rows[0].chunk;
    if (!chunkText || chunkText.trim().length === 0) {
      await sqlite.query("UPDATE nodes SET chunk_status = 'chunked' WHERE id = ?", [options.nodeId]);
      return { chunks: 0 };
    }

    // Delete existing chunks
    await sqlite.query('DELETE FROM chunks WHERE node_id = ?', [options.nodeId]);
    await sqlite.query("UPDATE nodes SET chunk_status = 'chunking' WHERE id = ?", [options.nodeId]);

    const pieces = this.chunkText(chunkText);
    let inserted = 0;

    for (let i = 0; i < pieces.length; i += this.BATCH_SIZE) {
      const batch = pieces.slice(i, i + this.BATCH_SIZE);
      const embeddings = await this.batchEmbed(batch);

      for (let j = 0; j < batch.length; j++) {
        const vecJson = '[' + embeddings[j].join(',') + ']';
        await sqlite.query(
          `INSERT INTO chunks (node_id, chunk_idx, text, embedding, embedding_type, created_at)
           VALUES (?, ?, ?, vector(?), ?, datetime())`,
          [options.nodeId, i + j, batch[j], vecJson, 'text-embedding-3-small']
        );
        inserted++;
      }
    }

    await sqlite.query("UPDATE nodes SET chunk_status = 'chunked' WHERE id = ?", [options.nodeId]);

    if (options.verbose) {
      console.log(`  Node ${options.nodeId}: ${inserted} chunks created`);
    }

    return { chunks: inserted };
  }

  getStats(): { totalChunks: number; totalNodes: number; avgChunksPerNode: number } {
    return { totalChunks: 0, totalNodes: 0, avgChunksPerNode: 0 };
  }

  close(): void {
    // No-op
  }
}

export async function runCLI(args: string[]): Promise<void> {
  const nodeId = parseInt(args[0], 10);
  if (!nodeId) {
    console.error('Usage: embed-universal <nodeId>');
    process.exit(1);
  }
  const embedder = new UniversalEmbedder();
  const result = await embedder.processNode({ nodeId, verbose: true });
  console.log(`Done: ${result.chunks} chunks created`);
}

if (require.main === module) {
  runCLI(process.argv.slice(2)).catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
