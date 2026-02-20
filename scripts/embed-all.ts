/**
 * Standalone embedding script — no Next.js deps, no extractor imports.
 * Processes all nodes with chunk_status='not_chunked' that have chunk text.
 *
 * Usage: npx tsx scripts/embed-all.ts [--limit N]
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

// ── Embedding helpers ────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  if (!r.ok) {
    const body = await r.text();
    if (r.status === 429) {
      console.log('    Rate limited, waiting 10s...');
      await new Promise(res => setTimeout(res, 10000));
      return getEmbedding(text);
    }
    throw new Error(`OpenAI ${r.status}: ${body}`);
  }
  const d = await r.json();
  return d.data[0].embedding;
}

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
      console.log('    Rate limited, waiting 10s...');
      await new Promise(res => setTimeout(res, 10000));
      return batchEmbed(texts);
    }
    throw new Error(`OpenAI ${r.status}: ${body}`);
  }
  const d = await r.json();
  return d.data.sort((a: any, b: any) => a.index - b.index).map((i: any) => i.embedding);
}

function vecJson(v: number[]): string { return '[' + v.join(',') + ']'; }

function chunkText(text: string): string[] {
  const CHUNK = 2000, OVERLAP = 400;
  if (!text || text.trim().length === 0) return [];
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + CHUNK, text.length);
    if (end < text.length) {
      const pb = text.lastIndexOf('\n\n', end);
      if (pb > pos + CHUNK * 0.5) end = pb;
      else {
        const sb = text.lastIndexOf('. ', end);
        if (sb > pos + CHUNK * 0.5) end = sb + 1;
      }
    }
    const ct = text.slice(pos, end).trim();
    if (ct.length > 0) chunks.push(ct);
    const newPos = end - OVERLAP;
    pos = newPos <= pos ? end : newPos;
  }
  return chunks;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : 10000;

  const result = await db.execute({
    sql: `SELECT id, title, LENGTH(chunk) as clen FROM nodes
          WHERE chunk IS NOT NULL AND chunk != '' AND chunk_status = 'not_chunked'
          ORDER BY id ASC LIMIT ?`,
    args: [limit],
  });

  const total = result.rows.length;
  console.log(`\n== Embed All — ${total} nodes pending ==\n`);

  let processed = 0, failed = 0, totalChunks = 0;
  const startTime = Date.now();

  for (const row of result.rows) {
    const nodeId = Number(row.id);
    const title = String(row.title);
    const clen = Number(row.clen);

    try {
      const nodeData = await db.execute({
        sql: 'SELECT title, description, chunk FROM nodes WHERE id = ?',
        args: [nodeId],
      });
      if (nodeData.rows.length === 0) { failed++; continue; }
      const node = nodeData.rows[0];

      const embText = `${node.title}\n${node.description || ''}`.slice(0, 2000);
      const emb = await getEmbedding(embText);
      await db.execute({
        sql: 'UPDATE nodes SET embedding = vector(?), embedding_text = ?, embedding_updated_at = datetime() WHERE id = ?',
        args: [vecJson(emb), embText.slice(0, 2000), nodeId],
      });

      const chunkContent = String(node.chunk || '');
      if (chunkContent.trim().length === 0) {
        await db.execute({ sql: "UPDATE nodes SET chunk_status = 'chunked' WHERE id = ?", args: [nodeId] });
        processed++;
        continue;
      }

      await db.execute({ sql: 'DELETE FROM chunks WHERE node_id = ?', args: [nodeId] });
      await db.execute({ sql: "UPDATE nodes SET chunk_status = 'chunking' WHERE id = ?", args: [nodeId] });

      const pieces = chunkText(chunkContent);
      let nodeChunks = 0;

      const EMBED_BATCH = 50;
      const allEmbeddings: number[][] = [];
      for (let i = 0; i < pieces.length; i += EMBED_BATCH) {
        const batch = pieces.slice(i, i + EMBED_BATCH);
        const embeddings = await batchEmbed(batch);
        allEmbeddings.push(...embeddings);
      }

      const insertStmts = pieces.map((text, idx) => ({
        sql: `INSERT INTO chunks (node_id, chunk_idx, text, embedding, embedding_type, created_at)
              VALUES (?, ?, ?, vector(?), ?, datetime())`,
        args: [nodeId, idx, text, vecJson(allEmbeddings[idx]), 'text-embedding-3-small'] as any[],
      }));

      for (let i = 0; i < insertStmts.length; i += 80) {
        await db.batch(insertStmts.slice(i, i + 80), 'write');
        nodeChunks += Math.min(80, insertStmts.length - i);
      }

      await db.execute({ sql: "UPDATE nodes SET chunk_status = 'chunked' WHERE id = ?", args: [nodeId] });
      processed++;
      totalChunks += nodeChunks;

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (processed / (parseFloat(elapsed) || 1)).toFixed(1);
      console.log(`  [${processed}/${total}] node ${nodeId}: ${nodeChunks} chunks (${clen} chars) — ${elapsed}s elapsed, ${rate}/s  ${title.slice(0, 50)}`);

    } catch (err: any) {
      failed++;
      console.error(`  x node ${nodeId}: ${err.message}`);
      await db.execute({ sql: "UPDATE nodes SET chunk_status = 'not_chunked' WHERE id = ?", args: [nodeId] }).catch(() => {});
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n== Done: ${processed} embedded, ${failed} failed, ${totalChunks} chunks — ${elapsed}s ==`);
}

main().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
