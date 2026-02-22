/**
 * One-time script to link podcast/article companion pairs.
 * Finds articles from latent.space/p/ and matches them to podcast episodes by title similarity.
 *
 * Usage: npx tsx scripts/link-companion-nodes.ts [--dry-run]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const dryRun = process.argv.includes('--dry-run');

function stripTitlePrefixes(title: string): string {
  return title
    .replace(/^(ep\.?\s*\d+[:\s]*|episode\s*\d+[:\s]*)/i, '')
    .replace(/\s*[—–-]\s*with\s+.*$/i, '')
    .trim();
}

function titleWords(title: string): Set<string> {
  return new Set(
    stripTitlePrefixes(title)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function titleOverlapScore(a: string, b: string): number {
  const wordsA = titleWords(a);
  const wordsB = titleWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.min(wordsA.size, wordsB.size);
}

async function edgeExists(fromId: number, toId: number): Promise<boolean> {
  const r = await db.execute({
    sql: 'SELECT 1 FROM edges WHERE from_node_id = ? AND to_node_id = ? LIMIT 1',
    args: [fromId, toId],
  });
  return r.rows.length > 0;
}

async function main() {
  console.log(`\n== Link Companion Nodes ==${dryRun ? ' (DRY RUN)' : ''}\n`);

  const articles = await db.execute({
    sql: `SELECT id, title, link FROM nodes WHERE node_type = 'article' ORDER BY id ASC`,
    args: [],
  });

  const podcasts = await db.execute({
    sql: `SELECT id, title FROM nodes WHERE node_type = 'podcast' ORDER BY id ASC`,
    args: [],
  });

  console.log(`Articles: ${articles.rows.length}, Podcasts: ${podcasts.rows.length}\n`);

  let linked = 0;
  let skipped = 0;

  for (const article of articles.rows) {
    const articleTitle = String(article.title);
    let bestMatch: { id: number; title: string; score: number } | null = null;

    for (const podcast of podcasts.rows) {
      const score = titleOverlapScore(articleTitle, String(podcast.title));
      if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: Number(podcast.id), title: String(podcast.title), score };
      }
    }

    if (bestMatch) {
      const articleId = Number(article.id);
      const podcastId = bestMatch.id;

      if (await edgeExists(articleId, podcastId)) {
        skipped++;
        continue;
      }

      console.log(`MATCH (${bestMatch.score.toFixed(2)}):`);
      console.log(`  Article ${articleId}: ${articleTitle}`);
      console.log(`  Podcast ${podcastId}: ${bestMatch.title}`);

      if (!dryRun) {
        const now = new Date().toISOString();
        const context = JSON.stringify({
          type: 'related_to',
          confidence: bestMatch.score,
          inferred_at: now,
          explanation: 'companion article for podcast episode',
          created_via: 'workflow',
        });
        await db.execute({
          sql: 'INSERT INTO edges (from_node_id, to_node_id, context, source, created_at) VALUES (?, ?, ?, ?, ?)',
          args: [articleId, podcastId, context, 'ai_similarity', now],
        });
        console.log(`  -> Edge created\n`);
      } else {
        console.log(`  -> Would create edge\n`);
      }
      linked++;
    }
  }

  console.log(`\n== Results ==`);
  console.log(`  Linked: ${linked}`);
  console.log(`  Already linked: ${skipped}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
