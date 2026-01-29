/**
 * SQLite vec0 utilities for Latent Space Hub (Turso fork)
 *
 * Note: Vector search (sqlite-vec) is NOT supported in Turso.
 * These utilities are kept for API compatibility but vector operations
 * will not work. Use full-text search (FTS) instead.
 */

/**
 * Serialize a float array to binary format for vec0 storage
 * Note: Not usable in Turso - included for API compatibility
 */
export function serializeFloat32Vector(vector: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buffer.writeFloatLE(vector[i], i * 4);
  }
  return buffer;
}

/**
 * Deserialize a vec0 BLOB back to float array
 * Note: Not usable in Turso - included for API compatibility
 */
export function deserializeFloat32Vector(blob: Buffer): number[] {
  const vector: number[] = [];
  for (let i = 0; i < blob.length; i += 4) {
    vector.push(blob.readFloatLE(i));
  }
  return vector;
}

/**
 * Get SQLite database path - NOT USED in Turso fork
 * Turso uses TURSO_DATABASE_URL environment variable instead
 */
export function getDatabasePath(): string {
  // In Turso, we use TURSO_DATABASE_URL instead of file path
  return process.env.TURSO_DATABASE_URL || '';
}

/**
 * Get vec extension path - NOT SUPPORTED in Turso
 */
export function getVecExtensionPath(): string {
  console.warn('[SQLITE-VEC] Vector extension not supported in Turso');
  return '';
}

/**
 * Create database connection - NOT SUPPORTED in Turso fork
 * Use getSQLiteClient() from sqlite-client.ts instead
 */
export function createDatabaseConnection(): never {
  throw new Error(
    'createDatabaseConnection() is not supported in Turso fork. ' +
    'Use getSQLiteClient() from @/services/database/sqlite-client instead.'
  );
}

/**
 * Format embedding text for node metadata
 */
export function formatEmbeddingText(
  title: string,
  content: string,
  dimensions: string[],
  description?: string | null
): string {
  const descriptionText = description && description.trim() ? description.trim() : 'none';
  const dimensionsText = dimensions.length > 0 ? dimensions.join(', ') : 'none';
  return `Title: ${title}\n\nDescription: ${descriptionText}\n\nContent: ${content}\n\nDimensions: ${dimensionsText}`;
}

/**
 * Batch process items with progress logging
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10,
  onProgress?: (processed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, items.length));
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    if (onProgress) {
      onProgress(Math.min(i + batchSize, items.length), items.length);
    }
  }

  return results;
}
