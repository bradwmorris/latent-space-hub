import { NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { chunkService } from '@/services/database/chunks';

/**
 * Vector health check endpoint for Latent Space Hub (Turso fork).
 *
 * Note: Turso doesn't support sqlite-vec extension.
 * Vector search is disabled in this fork - use FTS instead.
 */
export async function GET() {
  try {
    const sqlite = getSQLiteClient();

    // Test basic database connection
    const connectionTest = await sqlite.testConnection();
    if (!connectionTest) {
      return NextResponse.json({
        status: 'error',
        message: 'Database connection failed',
        details: null
      });
    }

    let chunkStats = null;

    try {
      // Get chunk counts
      const totalChunks = await chunkService.getChunkCount();

      chunkStats = {
        total_chunks: totalChunks,
        vectorized_chunks: 0,
        missing_embeddings: totalChunks,
        coverage_percentage: 0
      };

    } catch (error: any) {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to collect chunk statistics',
        details: error.message
      });
    }

    return NextResponse.json({
      status: 'success',
      data: {
        database_connected: connectionTest,
        vector_extension_loaded: false,
        vector_health: 'disabled',
        chunk_stats: chunkStats,
        vector_stats: null,
        recommendations: [
          'Vector search is disabled in Turso fork (no sqlite-vec support)',
          'Use full-text search (FTS) for text-based search instead'
        ]
      }
    });

  } catch (error: any) {
    console.error('Vector health check failed:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Health check failed',
      details: error.message
    });
  }
}
