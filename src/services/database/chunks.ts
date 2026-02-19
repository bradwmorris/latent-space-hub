import { getSQLiteClient } from './sqlite-client';
import { Chunk, ChunkData } from '@/types/database';

/**
 * Chunk service for the Latent Space Hub.
 *
 * Turso supports native vector search via F32_BLOB + vector_top_k().
 * Currently using text fallback — vector_top_k() to be wired up in PRD-04.
 */
export class ChunkService {
  async getChunksByNodeId(nodeId: number): Promise<Chunk[]> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<Chunk>('SELECT * FROM chunks WHERE node_id = ? ORDER BY chunk_idx ASC', [nodeId]);
    return result.rows;
  }

  async getChunkById(id: number): Promise<Chunk | null> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<Chunk>('SELECT * FROM chunks WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  async createChunk(chunkData: ChunkData): Promise<Chunk> {
    const now = new Date().toISOString();
    const sqlite = getSQLiteClient();

    const result = await sqlite.query(`
      INSERT INTO chunks (node_id, chunk_idx, text, embedding, embedding_type, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      chunkData.node_id,
      chunkData.chunk_idx || null,
      chunkData.text,
      chunkData.embedding || null,
      chunkData.embedding_type,
      chunkData.metadata ? JSON.stringify(chunkData.metadata) : null,
      now
    ]);

    const chunkId = result.lastInsertRowid!;
    const createdChunk = await this.getChunkById(chunkId);

    if (!createdChunk) {
      throw new Error('Failed to create chunk');
    }

    return createdChunk;
  }

  async createChunks(chunksData: ChunkData[]): Promise<Chunk[]> {
    if (chunksData.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    const sqlite = getSQLiteClient();
    const createdChunks: Chunk[] = [];

    // Insert chunks one by one (Turso doesn't have transaction API like better-sqlite3)
    for (const chunk of chunksData) {
      await sqlite.query(`
        INSERT INTO chunks (node_id, chunk_idx, text, embedding, embedding_type, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        chunk.node_id,
        chunk.chunk_idx || null,
        chunk.text,
        chunk.embedding || null,
        chunk.embedding_type,
        chunk.metadata ? JSON.stringify(chunk.metadata) : null,
        now
      ]);
    }

    // Get all created chunks by node_id (since we know they were just created)
    const nodeIds = [...new Set(chunksData.map(c => c.node_id))];
    for (const nodeId of nodeIds) {
      const chunks = await this.getChunksByNodeId(nodeId);
      createdChunks.push(...chunks.filter(c => c.created_at === now));
    }

    return createdChunks;
  }

  async updateChunk(id: number, updates: Partial<Chunk>): Promise<Chunk> {
    const sqlite = getSQLiteClient();
    const updateFields: string[] = [];
    const params: any[] = [];

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && value !== undefined) {
        updateFields.push(`${key} = ?`);
        if (key === 'metadata') {
          params.push(typeof value === 'object' ? JSON.stringify(value) : value);
        } else {
          params.push(value);
        }
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(id); // Add ID for WHERE clause

    const query = `UPDATE chunks SET ${updateFields.join(', ')} WHERE id = ?`;
    const result = await sqlite.query(query, params);

    if (result.changes === 0) {
      throw new Error(`Chunk with ID ${id} not found`);
    }

    const updatedChunk = await this.getChunkById(id);
    if (!updatedChunk) {
      throw new Error(`Failed to retrieve updated chunk with ID ${id}`);
    }

    return updatedChunk;
  }

  async deleteChunk(id: number): Promise<void> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query('DELETE FROM chunks WHERE id = ?', [id]);
    if ((result.changes || 0) === 0) {
      throw new Error(`Chunk with ID ${id} not found`);
    }
  }

  async deleteChunksByNodeId(nodeId: number): Promise<void> {
    const sqlite = getSQLiteClient();
    await sqlite.query('DELETE FROM chunks WHERE node_id = ?', [nodeId]);
  }

  /**
   * Search chunks by embedding similarity.
   * TODO (PRD-04): Wire up Turso native vector_top_k() for real vector search.
   * Currently falls back to text search.
   */
  async searchChunks(
    queryEmbedding: number[],
    similarityThreshold = 0.5,
    matchCount = 5,
    nodeIds?: number[],
    fallbackQuery?: string
  ): Promise<Array<Chunk & { similarity: number }>> {
    // TODO: Replace with vector_top_k() once PRD-04 is implemented
    if (fallbackQuery) {
      return await this.textSearchFallback(fallbackQuery, matchCount, nodeIds);
    }
    console.warn('Vector search not yet wired up. Use textSearchFallback or provide fallbackQuery.');
    return [];
  }

  async textSearchFallback(
    query: string,
    matchCount = 5,
    nodeIds?: number[]
  ): Promise<Array<Chunk & { similarity: number }>> {
    const sqlite = getSQLiteClient();

    // Clean query for LIKE search
    const cleanQuery = query.trim().toLowerCase();
    const searchTerms = cleanQuery.split(/\s+/).filter(term => term.length > 2);

    if (searchTerms.length === 0) {
      return [];
    }

    // Build LIKE conditions for each term
    const likeConditions = searchTerms.map(() => 'LOWER(text) LIKE ?').join(' AND ');
    const likeParams: any[] = searchTerms.map(term => `%${term}%`);

    let textQuery = `
      SELECT *, 0.8 as similarity
      FROM chunks
      WHERE ${likeConditions}
    `;

    // Add node filter if provided
    if (nodeIds && nodeIds.length > 0) {
      textQuery += ` AND node_id IN (${nodeIds.map(() => '?').join(',')})`;
      likeParams.push(...nodeIds);
    }

    textQuery += ` ORDER BY LENGTH(text) ASC LIMIT ?`;
    likeParams.push(matchCount);

    const result = await sqlite.query<Chunk & { similarity: number }>(textQuery, likeParams);

    console.log(`Text fallback: ${result.rows.length} chunks found`);

    return result.rows;
  }

  async getChunkCount(): Promise<number> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<{ count: number }>('SELECT COUNT(*) as count FROM chunks');
    return Number(result.rows[0].count);
  }

  async getChunkCountByNodeId(nodeId: number): Promise<number> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<{ count: number }>('SELECT COUNT(*) as count FROM chunks WHERE node_id = ?', [nodeId]);
    return Number(result.rows[0].count);
  }

  async getNodesWithChunks(): Promise<Array<{ node_id: number; chunk_count: number }>> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query(`
      SELECT node_id, COUNT(*) as chunk_count
      FROM chunks
      GROUP BY node_id
      ORDER BY chunk_count DESC
    `);
    return result.rows.map((row: any) => ({
      node_id: Number(row.node_id),
      chunk_count: Number(row.chunk_count)
    }));
  }

  async getChunksWithoutEmbeddings(): Promise<Chunk[]> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<Chunk>(
      'SELECT * FROM chunks WHERE embedding IS NULL'
    );
    return result.rows;
  }
}

// Export singleton instance
export const chunkService = new ChunkService();
