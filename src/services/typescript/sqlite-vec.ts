/**
 * Vector utilities for Latent Space Hub (Turso)
 *
 * Turso supports native vector search via F32_BLOB + vector_top_k().
 * These utilities handle embedding serialization and helper functions.
 */

/**
 * Serialize a float array to binary format for F32_BLOB storage
 */
export function serializeFloat32Vector(vector: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buffer.writeFloatLE(vector[i], i * 4);
  }
  return buffer;
}

/**
 * Convert a float array to a JSON string for Turso's vector() SQL function.
 * Used when passing embeddings to vector_top_k() queries.
 */
export function vectorToJsonString(vector: number[]): string {
  return '[' + vector.join(',') + ']';
}

/**
 * Deserialize an F32_BLOB back to float array
 */
export function deserializeFloat32Vector(blob: Buffer): number[] {
  const vector: number[] = [];
  for (let i = 0; i < blob.length; i += 4) {
    vector.push(blob.readFloatLE(i));
  }
  return vector;
}

/**
 * Get database URL from environment
 */
export function getDatabasePath(): string {
  return process.env.TURSO_DATABASE_URL || '';
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
