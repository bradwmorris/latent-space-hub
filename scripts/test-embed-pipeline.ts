/**
 * Quick test of the fixed embedding pipeline.
 * Creates a temp node, runs embedNodeContent, verifies chunks + vector search, cleans up.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { nodeService } from '@/src/services/database/nodes';
import { chunkService } from '@/src/services/database/chunks';
import { embedNodeContent } from '@/src/services/embedding/ingestion';
import { getSQLiteClient } from '@/src/services/database/sqlite-client';

async function main() {
  console.log('Testing embedNodeContent pipeline...\n');

  // Create a test node with chunk content
  const testNode = await nodeService.createNode({
    title: '__test_embed_pipeline__',
    description: 'Test node for embedding pipeline validation',
    node_type: 'topic',
    chunk: `Artificial intelligence has transformed software engineering in remarkable ways.
Large language models like GPT-4 and Claude can now write, review, and debug code with
increasing sophistication. The field of AI engineering has emerged as a distinct discipline,
combining traditional software engineering with prompt engineering, retrieval-augmented generation,
and agent-based architectures.

The Latent Space podcast has been at the forefront of documenting this revolution, featuring
interviews with researchers and practitioners from OpenAI, Anthropic, Google DeepMind, and
other leading AI labs. Topics range from scaling laws and training techniques to deployment
strategies and safety considerations.

One of the most significant trends in 2025-2026 has been the rise of AI agents — autonomous
systems that can plan, execute, and iterate on complex tasks. These agents leverage tool use,
chain-of-thought reasoning, and multi-step planning to accomplish goals that previously required
human intervention at every step.`,
    chunk_status: 'not_chunked',
    metadata: {},
  });

  console.log(`Created test node: id=${testNode.id}`);

  // Run the full embedding pipeline
  const result = await embedNodeContent(testNode.id);
  console.log('\nPipeline result:');
  console.log(`  Node embedding: ${result.node_embedding.status} — ${result.node_embedding.message}`);
  console.log(`  Chunk embeddings: ${result.chunk_embeddings.status} — ${result.chunk_embeddings.message}`);
  console.log(`  Overall: ${result.overall_status}`);

  // Verify chunks were created
  const chunks = await chunkService.getChunksByNodeId(testNode.id);
  console.log(`\nChunks created: ${chunks.length}`);
  for (const c of chunks) {
    console.log(`  Chunk ${c.chunk_idx}: ${c.text.length} chars`);
  }

  // Verify node-level embedding exists
  const sqlite = getSQLiteClient();
  const embCheck = await sqlite.query<{ has_emb: number }>(
    'SELECT CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END as has_emb FROM nodes WHERE id = ?',
    [testNode.id]
  );
  console.log(`\nNode embedding stored: ${embCheck.rows[0].has_emb === 1 ? 'YES' : 'NO'}`);

  // Test vector search against chunks
  if (chunks.length > 0) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: 'AI agents and autonomous systems',
      }),
    });
    const embData = await response.json();
    const searchEmb = embData.data[0].embedding;

    const searchResults = await chunkService.searchChunks(searchEmb, 0.3, 3);
    console.log(`\nVector search for "AI agents": ${searchResults.length} results`);
    for (const r of searchResults) {
      console.log(`  Chunk ${r.chunk_idx}: similarity=${Number(r.similarity).toFixed(4)}, preview="${r.text.slice(0, 80)}..."`);
    }
  }

  // Clean up
  await chunkService.deleteChunksByNodeId(testNode.id);
  await nodeService.deleteNode(testNode.id);
  console.log('\nCleaned up test node and chunks.');

  console.log(result.overall_status === 'fully_embedded' ? '\n✓ Pipeline test PASSED' : '\n✗ Pipeline test FAILED');
  process.exit(result.overall_status === 'fully_embedded' ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
