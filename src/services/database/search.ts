import { Node } from '@/types/database';
import { nodeService } from './nodes';
import { chunkService } from './chunks';
import { EmbeddingService } from '@/services/embeddings';

export interface NodeSearchResult {
  id: number;
  title: string;
  description?: string;
  node_type?: string;
  event_date?: string;
  dimensions: string[];
  similarity: number;
  edge_count?: number;
}

export interface ChunkSearchResult {
  id: number;
  node_id: number;
  chunk_idx?: number;
  text: string;
  similarity: number;
  node_title?: string;
}

export interface TwoPhaseSearchResult {
  nodes: NodeSearchResult[];
  chunks: ChunkSearchResult[];
  search_method: 'two_phase' | 'nodes_only' | 'chunks_only' | 'fts' | 'text_fallback';
  phase2_ran: boolean;
  search_time_ms: number;
}

export interface TwoPhaseSearchOptions {
  query: string;
  nodeLimit?: number;
  chunkLimit?: number;
  similarityThreshold?: number;
  nodeType?: string;
  dimensions?: string[];
  includeChunks?: boolean;
  nodeIds?: number[];  // Skip phase 1, search chunks in these nodes directly
}

export class SearchService {
  /**
   * Phase 1: Find relevant nodes via vector search with text fallback.
   */
  async searchNodes(
    query: string,
    options: {
      limit?: number;
      similarityThreshold?: number;
      nodeType?: string;
      dimensions?: string[];
    } = {}
  ): Promise<NodeSearchResult[]> {
    const { limit = 10, similarityThreshold = 0.3, nodeType, dimensions } = options;

    // Try vector search first
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await EmbeddingService.generateQueryEmbedding(query);
      if (!EmbeddingService.validateEmbedding(queryEmbedding)) {
        queryEmbedding = null;
      }
    } catch {
      // Will fall back to text search
    }

    if (queryEmbedding) {
      const vectorResults = await nodeService.searchNodesByVector(
        queryEmbedding,
        similarityThreshold,
        limit,
        nodeType,
        dimensions
      );

      if (vectorResults.length > 0) {
        return vectorResults.map(n => ({
          id: n.id,
          title: n.title,
          description: n.description,
          node_type: n.node_type,
          event_date: n.event_date,
          dimensions: n.dimensions,
          similarity: n.similarity,
          edge_count: n.edge_count,
        }));
      }
    }

    // Fallback: text search on nodes
    const textResults = await nodeService.searchNodes(query, limit);
    return textResults.map((n, idx) => ({
      id: n.id,
      title: n.title,
      description: n.description,
      node_type: n.node_type,
      event_date: n.event_date,
      dimensions: n.dimensions,
      similarity: 1.0 - (idx * 0.05), // Synthetic decreasing score for text results
      edge_count: n.edge_count,
    }));
  }

  /**
   * Phase 2: Search chunks within specific nodes.
   */
  async searchChunksInNodes(
    query: string,
    nodeIds: number[],
    options: {
      limit?: number;
      similarityThreshold?: number;
    } = {}
  ): Promise<ChunkSearchResult[]> {
    const { limit = 5, similarityThreshold = 0.3 } = options;

    // Try embedding-based search
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await EmbeddingService.generateQueryEmbedding(query);
      if (!EmbeddingService.validateEmbedding(queryEmbedding)) {
        queryEmbedding = null;
      }
    } catch {
      // Will fall back
    }

    if (queryEmbedding) {
      const results = await chunkService.hybridSearch(
        queryEmbedding,
        query,
        limit,
        similarityThreshold,
        nodeIds
      );

      if (results.length > 0) {
        return results.map(c => ({
          id: c.id,
          node_id: c.node_id,
          chunk_idx: c.chunk_idx,
          text: c.text,
          similarity: c.similarity,
        }));
      }
    }

    // Fallback: FTS then text
    const ftsResults = await chunkService.ftsSearch(query, limit, nodeIds);
    if (ftsResults.length > 0) {
      return ftsResults.map(c => ({
        id: c.id,
        node_id: c.node_id,
        chunk_idx: c.chunk_idx,
        text: c.text,
        similarity: c.similarity,
      }));
    }

    const textResults = await chunkService.textSearchFallback(query, limit, nodeIds);
    return textResults.map(c => ({
      id: c.id,
      node_id: c.node_id,
      chunk_idx: c.chunk_idx,
      text: c.text,
      similarity: c.similarity,
    }));
  }

  /**
   * Combined two-phase search: find nodes first, then drill into chunks.
   */
  async twoPhaseSearch(options: TwoPhaseSearchOptions): Promise<TwoPhaseSearchResult> {
    const startTime = Date.now();
    const {
      query,
      nodeLimit = 10,
      chunkLimit = 5,
      similarityThreshold = 0.3,
      nodeType,
      dimensions,
      includeChunks = true,
      nodeIds,
    } = options;

    // If nodeIds provided, skip phase 1 and go straight to chunk search
    if (nodeIds && nodeIds.length > 0) {
      const chunks = await this.searchChunksInNodes(query, nodeIds, {
        limit: chunkLimit,
        similarityThreshold,
      });

      return {
        nodes: [],
        chunks,
        search_method: 'chunks_only',
        phase2_ran: true,
        search_time_ms: Date.now() - startTime,
      };
    }

    // Phase 1: Find relevant nodes
    const nodes = await this.searchNodes(query, {
      limit: nodeLimit,
      similarityThreshold,
      nodeType,
      dimensions,
    });

    let chunks: ChunkSearchResult[] = [];
    let phase2_ran = false;
    let method: TwoPhaseSearchResult['search_method'] = nodes.length > 0 ? 'two_phase' : 'text_fallback';

    // Phase 2: Search chunks within matched nodes
    if (includeChunks && nodes.length > 0) {
      const matchedNodeIds = nodes.map(n => n.id);
      chunks = await this.searchChunksInNodes(query, matchedNodeIds, {
        limit: chunkLimit,
        similarityThreshold,
      });
      phase2_ran = true;
    }

    // If no nodes found via vector, try chunk-only search as fallback
    if (nodes.length === 0 && includeChunks) {
      chunks = await this.searchChunksInNodes(query, [], {
        limit: chunkLimit,
        similarityThreshold,
      });
      phase2_ran = true;
      if (chunks.length > 0) {
        method = 'chunks_only';
      }
    }

    return {
      nodes,
      chunks,
      search_method: method,
      phase2_ran,
      search_time_ms: Date.now() - startTime,
    };
  }
}

export const searchService = new SearchService();
