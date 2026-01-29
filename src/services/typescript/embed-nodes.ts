/**
 * Node embedding service for Latent Space Hub (Turso fork)
 *
 * ⚠️ DISABLED: This service requires local SQLite with sqlite-vec extension.
 * Turso does not support the sqlite-vec vector extension.
 *
 * For vector search in Turso deployments, use:
 * - Full-text search (FTS) built into SQLite
 * - External vector database (Pinecone, Weaviate, etc.)
 * - Turso's upcoming native vector support (when available)
 */

interface EmbedNodeOptions {
  nodeId?: number;
  forceReEmbed?: boolean;
  verbose?: boolean;
}

export class NodeEmbedder {
  constructor() {
    throw new Error(
      'NodeEmbedder is not supported in Turso fork. ' +
      'Vector embeddings require sqlite-vec which is not available in Turso. ' +
      'Use full-text search (FTS) instead.'
    );
  }

  async embedNodes(_options: EmbedNodeOptions): Promise<{ processed: number; failed: number }> {
    throw new Error('NodeEmbedder is not supported in Turso fork');
  }

  close(): void {
    // No-op
  }
}

export async function runCLI(_args: string[]): Promise<void> {
  console.error('ERROR: embed-nodes CLI is not supported in Turso fork.');
  console.error('Vector embeddings require sqlite-vec which is not available in Turso.');
  console.error('Use full-text search (FTS) instead.');
  process.exit(1);
}

if (require.main === module) {
  runCLI(process.argv.slice(2)).catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
