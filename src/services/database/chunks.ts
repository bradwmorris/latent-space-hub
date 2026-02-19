import { getSQLiteClient } from './sqlite-client';
import { Chunk, ChunkData } from '@/types/database';
import { vectorToJsonString } from '@/services/typescript/sqlite-vec';

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
   * Search chunks by embedding similarity using Turso native vector_top_k().
   */
  async searchChunks(
    queryEmbedding: number[],
    similarityThreshold = 0.5,
    matchCount = 5,
    nodeIds?: number[],
    fallbackQuery?: string
  ): Promise<Array<Chunk & { similarity: number }>> {
    const sqlite = getSQLiteClient();

    try {
      const vecJson = vectorToJsonString(queryEmbedding);

      // Fetch more than needed so we can filter by threshold and nodeIds after
      const fetchCount = nodeIds ? matchCount * 4 : matchCount * 2;

      let sql: string;
      let params: any[];

      if (nodeIds && nodeIds.length > 0) {
        const placeholders = nodeIds.map(() => '?').join(',');
        sql = `
          SELECT c.*, (1.0 - vt.distance) as similarity
          FROM vector_top_k('chunks_embedding_idx', vector(?), ?) AS vt
          JOIN chunks c ON c.rowid = vt.id
          WHERE c.node_id IN (${placeholders})
          ORDER BY vt.distance ASC
        `;
        params = [vecJson, fetchCount, ...nodeIds];
      } else {
        sql = `
          SELECT c.*, (1.0 - vt.distance) as similarity
          FROM vector_top_k('chunks_embedding_idx', vector(?), ?) AS vt
          JOIN chunks c ON c.rowid = vt.id
          ORDER BY vt.distance ASC
        `;
        params = [vecJson, fetchCount];
      }

      const result = await sqlite.query<Chunk & { similarity: number }>(sql, params);

      const filtered = result.rows
        .filter(row => row.similarity >= similarityThreshold)
        .slice(0, matchCount);

      console.log(`Vector search: ${filtered.length} chunks (threshold ${similarityThreshold})`);
      return filtered;
    } catch (error) {
      console.warn('Vector search failed, falling back to text search:', error);
      if (fallbackQuery) {
        return await this.textSearchFallback(fallbackQuery, matchCount, nodeIds);
      }
      return [];
    }
  }

  /**
   * Full-text search on chunks using FTS5.
   */
  async ftsSearch(
    query: string,
    matchCount = 5,
    nodeIds?: number[]
  ): Promise<Array<Chunk & { similarity: number }>> {
    const sqlite = getSQLiteClient();

    // Clean query for FTS5 — wrap each word in quotes to avoid syntax issues
    const terms = query.trim().split(/\s+/).filter(t => t.length > 1);
    if (terms.length === 0) return [];
    const ftsQuery = terms.map(t => `"${t.replace(/"/g, '')}"`).join(' ');

    try {
      let sql: string;
      let params: any[];

      if (nodeIds && nodeIds.length > 0) {
        const placeholders = nodeIds.map(() => '?').join(',');
        sql = `
          SELECT c.*, bm25(chunks_fts) as rank_score
          FROM chunks_fts fts
          JOIN chunks c ON c.rowid = fts.rowid
          WHERE chunks_fts MATCH ?
            AND c.node_id IN (${placeholders})
          ORDER BY rank_score ASC
          LIMIT ?
        `;
        params = [ftsQuery, ...nodeIds, matchCount];
      } else {
        sql = `
          SELECT c.*, bm25(chunks_fts) as rank_score
          FROM chunks_fts fts
          JOIN chunks c ON c.rowid = fts.rowid
          WHERE chunks_fts MATCH ?
          ORDER BY rank_score ASC
          LIMIT ?
        `;
        params = [ftsQuery, matchCount];
      }

      const result = await sqlite.query<Chunk & { similarity: number; rank_score: number }>(sql, params);

      // Normalize BM25 scores to 0-1 range (BM25 returns negative scores, lower = better)
      const rows = result.rows;
      if (rows.length === 0) return [];

      const scores = rows.map(r => Math.abs(r.rank_score));
      const maxScore = Math.max(...scores, 1);

      return rows.map(row => ({
        ...row,
        similarity: Math.abs(row.rank_score) / maxScore,
      }));
    } catch (error) {
      console.warn('FTS search failed:', error);
      return [];
    }
  }

  /**
   * Hybrid search combining vector + FTS5 via Reciprocal Rank Fusion (RRF).
   * Runs both searches in parallel, merges with RRF formula: score = sum(1/(k + rank)).
   */
  async hybridSearch(
    queryEmbedding: number[],
    queryText: string,
    matchCount = 5,
    similarityThreshold = 0.3,
    nodeIds?: number[]
  ): Promise<Array<Chunk & { similarity: number }>> {
    const k = 60; // RRF constant

    // Run both searches in parallel
    const [vecResults, ftsResults] = await Promise.all([
      this.searchChunks(queryEmbedding, similarityThreshold, matchCount * 2, nodeIds).catch(() => []),
      this.ftsSearch(queryText, matchCount * 2, nodeIds).catch(() => []),
    ]);

    // Build RRF score map keyed by chunk id
    const scoreMap = new Map<number, { score: number; chunk: Chunk & { similarity: number } }>();

    vecResults.forEach((chunk, idx) => {
      const rrfScore = 1.0 / (k + idx + 1);
      scoreMap.set(chunk.id, { score: rrfScore, chunk });
    });

    ftsResults.forEach((chunk, idx) => {
      const rrfScore = 1.0 / (k + idx + 1);
      const existing = scoreMap.get(chunk.id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scoreMap.set(chunk.id, { score: rrfScore, chunk });
      }
    });

    // Sort by combined RRF score descending, normalize to 0-1
    const merged = [...scoreMap.values()].sort((a, b) => b.score - a.score);
    const maxScore = merged[0]?.score || 1;

    return merged.slice(0, matchCount).map(entry => ({
      ...entry.chunk,
      similarity: entry.score / maxScore,
    }));
  }

  /**
   * Text fallback search using LIKE queries. Used when embedding generation fails.
   */
  async textSearchFallback(
    query: string,
    matchCount = 5,
    nodeIds?: number[]
  ): Promise<Array<Chunk & { similarity: number }>> {
    const sqlite = getSQLiteClient();

    const cleanQuery = query.trim().toLowerCase();
    const searchTerms = cleanQuery.split(/\s+/).filter(term => term.length > 2);

    if (searchTerms.length === 0) return [];

    const likeConditions = searchTerms.map(() => 'LOWER(text) LIKE ?').join(' AND ');
    const likeParams: any[] = searchTerms.map(term => `%${term}%`);

    let textQuery = `
      SELECT *, 0.5 as similarity
      FROM chunks
      WHERE ${likeConditions}
    `;

    if (nodeIds && nodeIds.length > 0) {
      textQuery += ` AND node_id IN (${nodeIds.map(() => '?').join(',')})`;
      likeParams.push(...nodeIds);
    }

    textQuery += ` ORDER BY LENGTH(text) ASC LIMIT ?`;
    likeParams.push(matchCount);

    const result = await sqlite.query<Chunk & { similarity: number }>(textQuery, likeParams);
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
