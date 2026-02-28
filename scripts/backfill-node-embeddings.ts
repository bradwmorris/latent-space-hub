/**
 * Backfill node embeddings into the embedding_vec (F32_BLOB) column.
 *
 * The original nodes.embedding column is BLOB-typed and cannot be vector-indexed.
 * nodes.embedding_vec is F32_BLOB(1536) with a vector index (nodes_embedding_idx).
 *
 * This script:
 * 1. Re-embeds nodes that have no embedding_vec (even if they have embedding)
 * 2. Writes via vector() to ensure correct F32_BLOB format
 * 3. Also updates the old embedding column for backwards compatibility
 *
 * Usage: npx tsx scripts/backfill-node-embeddings.ts [--limit N] [--batch N]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const OPENAI_KEY = process.env.OPENAI_API_KEY!;
if (!OPENAI_KEY) { console.error('OPENAI_API_KEY required'); process.exit(1); }

async function batchEmbed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  });
  if (!r.ok) {
    const body = await r.text();
    if (r.status === 429) {
      console.log('  Rate limited, waiting 10s...');
      await new Promise(res => setTimeout(res, 10000));
      return batchEmbed(texts);
    }
    throw new Error(`OpenAI ${r.status}: ${body}`);
  }
  const d = await r.json();
  return d.data.sort((a: any, b: any) => a.index - b.index).map((i: any) => i.embedding);
}

function vecJson(v: number[]): string { return '[' + v.join(',') + ']'; }

async function main() {
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : 10000;
  const batchIdx = process.argv.indexOf('--batch');
  const batchSize = batchIdx >= 0 ? parseInt(process.argv[batchIdx + 1], 10) : 50;

  // Count total work
  const totalResult = await db.execute('SELECT COUNT(*) as c FROM nodes WHERE embedding_vec IS NULL');
  const totalPending = Number(totalResult.rows[0].c);
  console.log(`\n== Backfill Node Embeddings ==`);
  console.log(`Nodes missing embedding_vec: ${totalPending}`);
  console.log(`Batch size: ${batchSize}, Limit: ${limit}\n`);

  let processed = 0, failed = 0;
  const startTime = Date.now();

  while (processed + failed < limit) {
    const result = await db.execute({
      sql: `SELECT id, title, description FROM nodes
            WHERE embedding_vec IS NULL
            ORDER BY id ASC LIMIT ?`,
      args: [Math.min(batchSize, limit - processed - failed)],
    });

    if (result.rows.length === 0) break;

    // Build texts for batch embedding
    const nodes = result.rows.map(row => ({
      id: Number(row.id),
      title: String(row.title || ''),
      description: String(row.description || ''),
    }));

    const texts = nodes.map(n => `${n.title}\n${n.description}`.trim().slice(0, 2000));

    try {
      const embeddings = await batchEmbed(texts);

      for (let i = 0; i < nodes.length; i++) {
        const vj = vecJson(embeddings[i]);
        const embText = texts[i].slice(0, 2000);

        await db.execute({
          sql: `UPDATE nodes SET
                  embedding_vec = vector(?),
                  embedding = vector(?),
                  embedding_text = ?,
                  embedding_updated_at = datetime()
                WHERE id = ?`,
          args: [vj, vj, embText, nodes[i].id],
        });
        processed++;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const remaining = totalPending - processed - failed;
      console.log(`  [${processed}/${totalPending}] batch done — ${elapsed}s elapsed, ~${remaining} remaining`);

    } catch (err: any) {
      console.error(`  Batch failed: ${err.message}`);
      // Fall back to one-by-one for this batch
      for (let i = 0; i < nodes.length; i++) {
        try {
          const [emb] = await batchEmbed([texts[i]]);
          const vj = vecJson(emb);
          await db.execute({
            sql: `UPDATE nodes SET
                    embedding_vec = vector(?),
                    embedding = vector(?),
                    embedding_text = ?,
                    embedding_updated_at = datetime()
                  WHERE id = ?`,
            args: [vj, vj, texts[i].slice(0, 2000), nodes[i].id],
          });
          processed++;
        } catch (e: any) {
          failed++;
          console.error(`  x node ${nodes[i].id}: ${e.message}`);
        }
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n== Done: ${processed} embedded, ${failed} failed — ${elapsed}s ==`);

  // Final coverage check
  const coverage = await db.execute(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN embedding_vec IS NOT NULL THEN 1 ELSE 0 END) as with_vec,
      SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as with_emb
    FROM nodes
  `);
  const row = coverage.rows[0];
  console.log(`\nCoverage: ${row.with_vec}/${row.total} nodes have embedding_vec (${row.with_emb} have old embedding)`);
}

main().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
