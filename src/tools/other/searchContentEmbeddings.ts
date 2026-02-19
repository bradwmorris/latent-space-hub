import { tool } from 'ai';
import { z } from 'zod';
import { chunkService } from '@/services/database/chunks';
import { EmbeddingService } from '@/services/embeddings';

export const searchContentEmbeddingsTool = tool({
  description: 'Hybrid semantic + keyword search over node chunks. Uses vector similarity (vector_top_k) combined with FTS5 via Reciprocal Rank Fusion for best results.',
  inputSchema: z.object({
    query: z.string().describe('The search query to find semantically similar content'),
    limit: z.number().min(1).max(20).default(5).describe('Maximum number of results to return (default: 5)'),
    node_id: z.number().optional().describe('Optional: search within a specific node only'),
    similarity_threshold: z.number().min(0.1).max(1.0).default(0.3).describe('Minimum similarity score (0.1-1.0, default: 0.3)')
  }),
  execute: async ({ query, limit = 5, node_id, similarity_threshold = 0.3 }) => {
    const startTime = Date.now();

    try {
      const searchNodeIds = node_id ? [node_id] : undefined;

      // Try to generate embedding for hybrid search
      let queryEmbedding: number[] | null = null;
      let searchMethod = 'text_fallback';

      try {
        queryEmbedding = await EmbeddingService.generateQueryEmbedding(query);
        if (!EmbeddingService.validateEmbedding(queryEmbedding)) {
          queryEmbedding = null;
        }
      } catch {
        // Embedding failed — will fall back gracefully below
      }

      let chunks: Array<{ id: number; node_id: number; chunk_idx?: number; text: string; similarity: number }>;

      if (queryEmbedding) {
        // Hybrid search (vector + FTS5 via RRF)
        chunks = await chunkService.hybridSearch(
          queryEmbedding,
          query,
          limit,
          similarity_threshold,
          searchNodeIds
        );
        searchMethod = chunks.length > 0 ? 'hybrid' : 'hybrid_empty';

        // If hybrid returned nothing, try vector-only
        if (chunks.length === 0) {
          chunks = await chunkService.searchChunks(
            queryEmbedding,
            similarity_threshold,
            limit,
            searchNodeIds,
            query
          );
          if (chunks.length > 0) searchMethod = 'vector';
        }
      } else {
        // No embedding available — FTS only, then LIKE fallback
        chunks = await chunkService.ftsSearch(query, limit, searchNodeIds);
        searchMethod = chunks.length > 0 ? 'fts' : 'text_fallback';

        if (chunks.length === 0) {
          chunks = await chunkService.textSearchFallback(query, limit, searchNodeIds);
          if (chunks.length > 0) searchMethod = 'text_fallback';
        }
      }

      const searchTime = Date.now() - startTime;

      let suggestions: string[] = [];
      if (chunks.length === 0 && similarity_threshold > 0.3) {
        suggestions.push(`No results at threshold ${similarity_threshold}. Try lowering to 0.3.`);
      }
      if (chunks.length === 0 && searchNodeIds) {
        suggestions.push('No results in specified node. Try searching across all nodes.');
      }

      return {
        success: true,
        data: {
          chunks: chunks.map(chunk => ({
            id: chunk.id,
            node_id: chunk.node_id,
            chunk_idx: chunk.chunk_idx,
            preview: chunk.text?.length ? `${chunk.text.slice(0, 180)}${chunk.text.length > 180 ? '…' : ''}` : '',
            text: chunk.text ?? '',
            similarity: chunk.similarity,
          })),
          query,
          searched_nodes: searchNodeIds || 'all',
          count: chunks.length,
          similarity_threshold,
          search_method: searchMethod,
          search_time_ms: searchTime,
          suggestions: suggestions.length > 0 ? suggestions : undefined
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search content embeddings',
        data: null,
        search_time_ms: Date.now() - startTime
      };
    }
  }
});
