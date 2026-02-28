import { tool } from 'ai';
import { z } from 'zod';
import { searchService } from '@/services/database/search';

export const searchContentEmbeddingsTool = tool({
  description: 'Two-phase semantic search: first finds relevant nodes by meaning, then drills into their chunks for detail. Uses vector similarity with FTS5 and keyword fallbacks.',
  inputSchema: z.object({
    query: z.string().describe('The search query to find semantically similar content'),
    limit: z.number().min(1).max(20).default(5).describe('Maximum number of chunk results to return (default: 5)'),
    node_id: z.number().optional().describe('Optional: search within a specific node only (skips Phase 1 node search)'),
    node_limit: z.number().min(1).max(20).default(10).describe('Maximum number of node results in Phase 1 (default: 10)'),
    similarity_threshold: z.number().min(0.1).max(1.0).default(0.3).describe('Minimum similarity score (0.1-1.0, default: 0.3)'),
    nodes_only: z.boolean().default(false).describe('If true, only search nodes (skip chunk drill-down)'),
  }),
  execute: async ({ query, limit = 5, node_id, node_limit = 10, similarity_threshold = 0.3, nodes_only = false }) => {
    const startTime = Date.now();

    try {
      const result = await searchService.twoPhaseSearch({
        query,
        nodeLimit: node_limit,
        chunkLimit: limit,
        similarityThreshold: similarity_threshold,
        includeChunks: !nodes_only,
        nodeIds: node_id ? [node_id] : undefined,
      });

      let suggestions: string[] = [];
      if (result.nodes.length === 0 && result.chunks.length === 0 && similarity_threshold > 0.3) {
        suggestions.push(`No results at threshold ${similarity_threshold}. Try lowering to 0.3.`);
      }
      if (result.chunks.length === 0 && node_id) {
        suggestions.push('No chunks in specified node. Try searching across all nodes.');
      }

      return {
        success: true,
        data: {
          nodes: result.nodes.map(node => ({
            id: node.id,
            title: node.title,
            description: node.description,
            node_type: node.node_type,
            event_date: node.event_date,
            dimensions: node.dimensions,
            similarity: node.similarity,
          })),
          chunks: result.chunks.map(chunk => ({
            id: chunk.id,
            node_id: chunk.node_id,
            chunk_idx: chunk.chunk_idx,
            preview: chunk.text?.length ? `${chunk.text.slice(0, 180)}${chunk.text.length > 180 ? '…' : ''}` : '',
            text: chunk.text ?? '',
            similarity: chunk.similarity,
          })),
          query,
          searched_nodes: node_id ? [node_id] : 'all',
          node_count: result.nodes.length,
          chunk_count: result.chunks.length,
          similarity_threshold,
          search_method: result.search_method,
          phase2_ran: result.phase2_ran,
          search_time_ms: result.search_time_ms,
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
