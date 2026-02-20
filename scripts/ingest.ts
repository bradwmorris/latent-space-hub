/**
 * PRD-05 Unified Ingestion Script
 *
 * Uses @libsql/client directly — does NOT import Next.js services that pull
 * in Vercel AI SDK (which hangs outside Next.js runtime).
 *
 * Usage:
 *   npx tsx scripts/ingest.ts --source podcasts
 *   npx tsx scripts/ingest.ts --source articles --dry-run
 *   npx tsx scripts/ingest.ts --source ainews --since 2025-06-01 --limit 10
 *   npx tsx scripts/ingest.ts --source latentspacetv --embed-now
 *   npx tsx scripts/ingest.ts --embed-only
 *   npx tsx scripts/ingest.ts --seed-dimensions
 *   npx tsx scripts/ingest.ts --extract-entities
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { createClient, type Client } from '@libsql/client';
import { extractYouTube } from '@/src/services/typescript/extractors/youtube';
import { extractWebsite } from '@/src/services/typescript/extractors/website';

// ── Direct Turso client (no Next.js deps) ───────────────────────────────────

let _client: Client | null = null;
function db(): Client {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

async function query(sql: string, params: any[] = []) {
  const result = await db().execute({ sql, args: params });
  const rows = result.rows.map(row => {
    const obj: Record<string, any> = {};
    for (let i = 0; i < result.columns.length; i++) {
      obj[result.columns[i]] = row[i];
    }
    return obj;
  });
  return { rows, changes: result.rowsAffected, lastId: result.lastInsertRowid ? Number(result.lastInsertRowid) : 0 };
}

// ── Types ───────────────────────────────────────────────────────────────────

interface ManifestEntry {
  id: string;
  title: string;
  date: string;
  url: string;
  source_type: string;
  available: string;
  video_id?: string;
  duration?: string;
  description?: string;
  series?: string;
  slug?: string;
  frontmatter_entities?: {
    companies: string[];
    models: string[];
    topics: string[];
    people: string[];
  };
}

interface IngestResult {
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// ── Args ────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : args.find(a => a.startsWith(`${flag}=`))?.split('=')[1];
  };
  return {
    source: get('--source'),
    dryRun: args.includes('--dry-run'),
    embedNow: args.includes('--embed-now'),
    embedOnly: args.includes('--embed-only'),
    seedDimensions: args.includes('--seed-dimensions'),
    extractEntities: args.includes('--extract-entities'),
    since: get('--since') || '2025-01-01',
    until: get('--until') || '2099-12-31',
    limit: get('--limit') ? parseInt(get('--limit')!, 10) : Infinity,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, 'data');

function loadManifest(filename: string): ManifestEntry[] {
  const fp = path.join(DATA_DIR, filename);
  if (!fs.existsSync(fp)) throw new Error(`Manifest not found: ${fp}. Run generate-manifests.ts first.`);
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

function loadBlocklist(): Set<string> {
  const fp = path.join(DATA_DIR, 'blocklist-nontopics.json');
  if (!fs.existsSync(fp)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(fp, 'utf-8')));
}

function filterByDate(entries: ManifestEntry[], since: string, until: string): ManifestEntry[] {
  const s = new Date(since).getTime(), u = new Date(until).getTime();
  return entries.filter(e => { if (!e.date) return true; const t = new Date(e.date).getTime(); return t >= s && t <= u; });
}

async function linkExists(link: string): Promise<boolean> {
  const r = await query('SELECT 1 FROM nodes WHERE link = ? LIMIT 1', [link]);
  return r.rows.length > 0;
}

async function titleExists(title: string): Promise<boolean> {
  const r = await query('SELECT 1 FROM nodes WHERE title = ? LIMIT 1', [title]);
  return r.rows.length > 0;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function ensureDim(name: string) {
  await query('INSERT OR IGNORE INTO dimensions (name, description, is_priority, updated_at) VALUES (?, NULL, 0, datetime())', [name]);
}

async function createNode(data: {
  title: string; node_type: string; link?: string; chunk?: string;
  chunk_status?: string; event_date?: string; dimensions: string[];
  metadata: Record<string, any>; description?: string;
}): Promise<number> {
  const now = new Date().toISOString();
  const r = await query(
    `INSERT INTO nodes (title, description, node_type, link, chunk, chunk_status, event_date, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.title, data.description || null, data.node_type, data.link || null,
     data.chunk || null, data.chunk_status || null, data.event_date || null,
     JSON.stringify(data.metadata), now, now]
  );
  const nodeId = r.lastId;
  for (const dim of data.dimensions) {
    await ensureDim(dim);
    await query('INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)', [nodeId, dim]);
  }
  return nodeId;
}

// ── Embedding (direct OpenAI + Turso) ───────────────────────────────────────

async function getEmbedding(text: string): Promise<number[]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.data[0].embedding;
}

async function batchEmbed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
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
      else { const sb = text.lastIndexOf('. ', end); if (sb > pos + CHUNK * 0.5) end = sb + 1; }
    }
    const ct = text.slice(pos, end).trim();
    if (ct.length > 0) chunks.push(ct);
    const newPos = end - OVERLAP;
    pos = newPos <= pos ? end : newPos;
  }
  return chunks;
}

async function embedNode(nodeId: number): Promise<{ chunks: number }> {
  // Node-level embedding
  const nr = await query('SELECT title, description, chunk FROM nodes WHERE id = ?', [nodeId]);
  if (nr.rows.length === 0) throw new Error(`Node ${nodeId} not found`);
  const node = nr.rows[0] as any;

  const embText = `${node.title}\n${node.description || ''}`.slice(0, 2000);
  const emb = await getEmbedding(embText);
  await query('UPDATE nodes SET embedding = vector(?), embedding_text = ?, embedding_updated_at = datetime() WHERE id = ?',
    [vecJson(emb), embText.slice(0, 2000), nodeId]);

  // Chunk-level embedding
  if (!node.chunk || node.chunk.trim().length === 0) {
    await query("UPDATE nodes SET chunk_status = 'chunked' WHERE id = ?", [nodeId]);
    return { chunks: 0 };
  }

  await query('DELETE FROM chunks WHERE node_id = ?', [nodeId]);
  await query("UPDATE nodes SET chunk_status = 'chunking' WHERE id = ?", [nodeId]);

  const pieces = chunkText(node.chunk);
  let inserted = 0;

  for (let i = 0; i < pieces.length; i += 20) {
    const batch = pieces.slice(i, i + 20);
    const embeddings = await batchEmbed(batch);
    for (let j = 0; j < batch.length; j++) {
      await query(
        `INSERT INTO chunks (node_id, chunk_idx, text, embedding, embedding_type, created_at) VALUES (?, ?, ?, vector(?), ?, datetime())`,
        [nodeId, i + j, batch[j], vecJson(embeddings[j]), 'text-embedding-3-small']
      );
      inserted++;
    }
  }

  await query("UPDATE nodes SET chunk_status = 'chunked' WHERE id = ?", [nodeId]);
  return { chunks: inserted };
}

// ── Source Ingestion ────────────────────────────────────────────────────────

async function ingestYouTube(entries: ManifestEntry[], dryRun: boolean, seriesType: string, dimName: string): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, skipped: 0, failed: 0, errors: [] };
  for (const entry of entries) {
    try {
      if (await linkExists(entry.url)) { result.skipped++; continue; }
      if (dryRun) { console.log(`  [DRY] ${entry.title.slice(0, 70)}`); result.inserted++; continue; }
      console.log(`  Extracting: ${entry.title.slice(0, 70)}...`);
      const ext = await extractYouTube(entry.url);
      if (!ext.success) { result.failed++; result.errors.push(`${entry.video_id}: ${ext.error}`); continue; }
      const dim = entry.series || dimName;
      const nodeId = await createNode({
        title: entry.title, node_type: 'episode', link: entry.url,
        chunk: ext.chunk, chunk_status: 'not_chunked', event_date: entry.date,
        dimensions: [dim],
        metadata: { publish_date: entry.date, duration: entry.duration, series: entry.series || seriesType,
                    video_id: entry.video_id, channel_name: ext.metadata.channel_name,
                    channel_url: ext.metadata.channel_url, extraction_method: 'ingestion-pipeline-v2' },
      });
      console.log(`  ✓ node ${nodeId}: ${entry.title.slice(0, 50)} (${ext.chunk.split(/\s+/).length} words)`);
      result.inserted++;
      await sleep(700);
    } catch (err: any) { result.failed++; result.errors.push(`${entry.video_id}: ${err.message}`); }
  }
  return result;
}

async function ingestArticles(entries: ManifestEntry[], dryRun: boolean): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, skipped: 0, failed: 0, errors: [] };
  for (const entry of entries) {
    try {
      if (await linkExists(entry.url)) { result.skipped++; continue; }
      if (dryRun) { console.log(`  [DRY] ${entry.title.slice(0, 70)}`); result.inserted++; continue; }
      console.log(`  Extracting: ${entry.title.slice(0, 70)}...`);
      const ext = await extractWebsite(entry.url);
      if (ext.chunk.length < 100) { result.failed++; result.errors.push(`${entry.slug}: too short (paywalled?)`); continue; }
      const nodeId = await createNode({
        title: ext.metadata.title || entry.title, node_type: 'source', link: entry.url,
        chunk: ext.chunk, chunk_status: 'not_chunked', event_date: entry.date || ext.metadata.date,
        dimensions: ['article'],
        metadata: { source_type: 'blog', authors: ext.metadata.author ? [ext.metadata.author] : undefined,
                    publish_date: entry.date || ext.metadata.date, slug: entry.slug,
                    extraction_method: 'ingestion-pipeline-v2' },
      });
      console.log(`  ✓ node ${nodeId}: ${(ext.metadata.title || entry.title).slice(0, 50)}`);
      result.inserted++;
      await sleep(300);
    } catch (err: any) { result.failed++; result.errors.push(`${entry.slug}: ${err.message}`); }
  }
  return result;
}

async function ingestAINews(entries: ManifestEntry[], dryRun: boolean): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, skipped: 0, failed: 0, errors: [] };
  const blocklist = loadBlocklist();
  const tmpDir = '/tmp/ainews-ingest';
  if (!dryRun) {
    execSync(`rm -rf ${tmpDir}`, { stdio: 'pipe' });
    console.log('  Cloning ainews repo...');
    execSync(`git clone --depth 1 https://github.com/smol-ai/ainews-web-2025 ${tmpDir}`, { stdio: 'pipe', timeout: 60000 });
  }
  for (const entry of entries) {
    try {
      if (await linkExists(entry.url)) { result.skipped++; continue; }
      if (await titleExists(entry.title)) { result.skipped++; continue; }
      if (dryRun) { console.log(`  [DRY] ${entry.title.slice(0, 70)}`); result.inserted++; continue; }
      const slug = entry.slug || entry.id.replace('ainews-', '');
      const fp = `${tmpDir}/src/content/issues/${slug}.md`;
      if (!fs.existsSync(fp)) { result.failed++; result.errors.push(`${slug}: file not found`); continue; }
      const raw = fs.readFileSync(fp, 'utf-8');
      const fmMatch = raw.match(/^---\n[\s\S]*?\n---/);
      const body = fmMatch ? raw.slice(fmMatch[0].length).trim() : raw;
      if (body.length < 50) { result.failed++; result.errors.push(`${slug}: too short`); continue; }
      const dims: string[] = ['ainews'];
      if (entry.frontmatter_entities) {
        for (const tag of [...entry.frontmatter_entities.companies, ...entry.frontmatter_entities.models,
                           ...entry.frontmatter_entities.topics, ...entry.frontmatter_entities.people]) {
          const n = tag.toLowerCase().replace(/\s+/g, '-');
          if (!blocklist.has(n) && n.length > 1) dims.push(n);
        }
      }
      const nodeId = await createNode({
        title: entry.title, node_type: 'source', link: entry.url,
        chunk: body, chunk_status: 'not_chunked', event_date: entry.date,
        dimensions: dims,
        metadata: { source_type: 'newsletter', publish_date: entry.date, slug,
                    frontmatter_entities: entry.frontmatter_entities || {},
                    extraction_method: 'ingestion-pipeline-v2' },
      });
      console.log(`  ✓ node ${nodeId}: ${entry.title.slice(0, 50)} (${dims.length} dims)`);
      result.inserted++;
    } catch (err: any) { result.failed++; result.errors.push(`${entry.slug}: ${err.message}`); }
  }
  if (!dryRun) execSync(`rm -rf ${tmpDir}`, { stdio: 'pipe' });
  return result;
}

// ── Entity Extraction (Phase 3) ─────────────────────────────────────────────

async function findOrCreateEntity(title: string, nodeType: string, meta: Record<string, any> = {}): Promise<number> {
  const r = await query('SELECT id FROM nodes WHERE LOWER(title) = LOWER(?) AND node_type = ? LIMIT 1', [title, nodeType]);
  if (r.rows.length > 0) return (r.rows[0] as any).id;
  return await createNode({ title, node_type: nodeType, dimensions: [], metadata: meta });
}

async function edgeExists(fromId: number, toId: number): Promise<boolean> {
  const r = await query('SELECT 1 FROM edges WHERE from_node_id = ? AND to_node_id = ? LIMIT 1', [fromId, toId]);
  return r.rows.length > 0;
}

async function createEdgeSimple(fromId: number, toId: number, explanation: string, edgeType: string) {
  if (await edgeExists(fromId, toId)) return;
  const now = new Date().toISOString();
  const context = JSON.stringify({ type: edgeType, confidence: 0.9, inferred_at: now, explanation, created_via: 'workflow' });
  await query('INSERT INTO edges (from_node_id, to_node_id, context, source, created_at) VALUES (?, ?, ?, ?, ?)',
    [fromId, toId, context, 'ai_similarity', now]);
}

async function extractEntities(): Promise<void> {
  const blocklist = loadBlocklist();
  let entityCount = 0, edgeCount = 0;

  // AINews entities from frontmatter
  const ainewsNodes = await query(
    `SELECT id, title, metadata FROM nodes WHERE node_type = 'source' AND metadata LIKE '%frontmatter_entities%'`
  );
  console.log(`  AI News nodes with entities: ${ainewsNodes.rows.length}`);

  for (const node of ainewsNodes.rows as any[]) {
    const meta = typeof node.metadata === 'string' ? JSON.parse(node.metadata) : node.metadata;
    const ents = meta?.frontmatter_entities;
    if (!ents) continue;
    // Check if already has edges
    const hasEdges = await query('SELECT 1 FROM edges WHERE from_node_id = ? OR to_node_id = ? LIMIT 1', [node.id, node.id]);
    if (hasEdges.rows.length > 0) continue;

    for (const c of (ents.companies || [])) {
      const n = c.toLowerCase().replace(/\s+/g, '-');
      if (blocklist.has(n) || n.length < 2) continue;
      const eid = await findOrCreateEntity(c.replace(/-/g, ' ').replace(/\b\w/g, (x: string) => x.toUpperCase()), 'organization', { org_type: 'startup' });
      await createEdgeSimple(node.id, eid, `covers ${c}`, 'covers_topic'); edgeCount++; entityCount++;
    }
    for (const p of (ents.people || [])) {
      const n = p.toLowerCase().replace(/\s+/g, '-');
      if (blocklist.has(n) || n.length < 2) continue;
      const eid = await findOrCreateEntity(p.replace(/-/g, ' ').replace(/\b\w/g, (x: string) => x.toUpperCase()), 'person', { role: 'mentioned' });
      await createEdgeSimple(eid, node.id, `mentioned in ${node.title}`, 'appeared_on'); edgeCount++; entityCount++;
    }
    for (const t of [...(ents.topics || []), ...(ents.models || [])]) {
      const n = t.toLowerCase().replace(/\s+/g, '-');
      if (blocklist.has(n) || n.length < 2) continue;
      const eid = await findOrCreateEntity(t.replace(/-/g, ' ').replace(/\b\w/g, (x: string) => x.toUpperCase()), 'topic', {});
      await createEdgeSimple(node.id, eid, `covers ${t}`, 'covers_topic'); edgeCount++; entityCount++;
    }
  }

  // LLM extraction for episodes/sources without edges
  const contentNodes = await query(
    `SELECT n.id, n.title, n.description, SUBSTR(n.chunk, 1, 3000) as chunk, n.node_type
     FROM nodes n WHERE n.node_type IN ('episode', 'source') AND n.chunk IS NOT NULL
     AND n.metadata NOT LIKE '%frontmatter_entities%'
     AND NOT EXISTS (SELECT 1 FROM edges WHERE from_node_id = n.id OR to_node_id = n.id)
     ORDER BY n.id ASC LIMIT 500`
  );
  console.log(`  Content nodes for LLM extraction: ${contentNodes.rows.length}`);

  for (const node of contentNodes.rows as any[]) {
    try {
      const prompt = `Extract entities from this content. Return JSON only.
Title: ${node.title}
Description: ${node.description || ''}
Content: ${(node.chunk || '').slice(0, 2000)}
Return: {"guests":[{"name":"Name","company":"Company"}],"companies":["Name"],"topics":["topic-name"]}
Only include clearly prominent entities. Use lowercase-hyphenated for topics.`;

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }],
          temperature: 0.1, max_tokens: 500, response_format: { type: 'json_object' } }),
      });
      const data = await r.json();
      const extracted = JSON.parse(data.choices?.[0]?.message?.content || '{}');

      for (const g of (extracted.guests || [])) {
        if (!g.name || g.name.length < 2) continue;
        const pid = await findOrCreateEntity(g.name, 'person', { role: 'guest', affiliations: g.company ? [g.company] : [] });
        await createEdgeSimple(pid, node.id, `appeared on ${node.title}`, 'appeared_on'); edgeCount++; entityCount++;
        if (g.company) {
          const oid = await findOrCreateEntity(g.company, 'organization', { org_type: 'startup' });
          await createEdgeSimple(pid, oid, `affiliated with ${g.company}`, 'affiliated_with'); edgeCount++; entityCount++;
        }
      }
      for (const c of (extracted.companies || [])) {
        if (!c || c.length < 2) continue;
        const oid = await findOrCreateEntity(c, 'organization', { org_type: 'startup' });
        await createEdgeSimple(node.id, oid, `discusses ${c}`, 'covers_topic'); edgeCount++; entityCount++;
      }
      for (const t of (extracted.topics || [])) {
        const n = t.toLowerCase().replace(/\s+/g, '-');
        if (blocklist.has(n) || n.length < 2) continue;
        const tid = await findOrCreateEntity(t.replace(/-/g, ' ').replace(/\b\w/g, (x: string) => x.toUpperCase()), 'topic', {});
        await createEdgeSimple(node.id, tid, `covers ${t}`, 'covers_topic'); edgeCount++; entityCount++;
      }
      console.log(`  ✓ ${node.id}: ${(extracted.guests||[]).length}p ${(extracted.companies||[]).length}c ${(extracted.topics||[]).length}t`);
      await sleep(200);
    } catch (err: any) { console.error(`  ✗ ${node.id}: ${err.message}`); }
  }

  console.log(`\n  Total: ${entityCount} entity refs, ${edgeCount} edges`);
}

// ── Embed All Pending ───────────────────────────────────────────────────────

async function embedAllPending(limit: number) {
  const r = await query(
    `SELECT id, title FROM nodes WHERE chunk IS NOT NULL AND chunk != '' AND chunk_status = 'not_chunked' ORDER BY id ASC LIMIT ?`,
    [limit === Infinity ? 10000 : limit]
  );
  console.log(`  ${r.rows.length} nodes to embed.`);
  let processed = 0, failed = 0, totalChunks = 0;
  for (const node of r.rows as any[]) {
    try {
      const res = await embedNode(node.id);
      processed++; totalChunks += res.chunks;
      if (processed % 10 === 0) console.log(`  ... ${processed}/${r.rows.length} embedded (${totalChunks} chunks)`);
    } catch (err: any) { failed++; console.error(`  ✗ ${node.id}: ${err.message}`); }
  }
  console.log(`  Done: ${processed} embedded, ${failed} failed, ${totalChunks} chunks total`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  console.log('\n══ PRD-05 Content Ingestion ══\n');

  if (args.seedDimensions) {
    const dims: string[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'seed-dimensions.json'), 'utf-8'));
    let c = 0;
    for (const d of dims) { const r = await query('INSERT OR IGNORE INTO dimensions (name, is_priority, updated_at) VALUES (?, 0, datetime())', [d]); if (r.changes) c++; }
    const total = await query('SELECT COUNT(*) as c FROM dimensions');
    console.log(`Seed dims: ${c} created, ${(total.rows[0] as any).c} total`);
    return;
  }

  if (args.extractEntities) {
    console.log('── Phase 3: Entity Extraction ──');
    await extractEntities();
    return;
  }

  if (args.embedOnly) {
    console.log('── Phase 2: Embedding ──');
    await embedAllPending(args.limit);
    return;
  }

  if (!args.source) {
    console.error('Usage: npx tsx scripts/ingest.ts --source <podcasts|articles|ainews|latentspacetv>');
    process.exit(1);
  }

  console.log(`Source: ${args.source} | ${args.since} → ${args.until} | ${args.dryRun ? 'DRY RUN' : 'LIVE'}${args.embedNow ? ' + EMBED' : ''}`);

  const mf: Record<string, string> = { podcasts: 'manifest-podcasts.json', articles: 'manifest-articles.json', ainews: 'manifest-ainews.json', latentspacetv: 'manifest-latentspacetv.json' };
  if (!mf[args.source]) throw new Error(`Unknown source: ${args.source}`);

  let entries = filterByDate(loadManifest(mf[args.source]), args.since, args.until);
  if (args.limit < entries.length) entries = entries.slice(0, args.limit);
  console.log(`Manifest: ${entries.length} entries\n`);

  let result: IngestResult;
  switch (args.source) {
    case 'podcasts': result = await ingestYouTube(entries, args.dryRun, 'latent-space-podcast', 'podcast'); break;
    case 'latentspacetv': result = await ingestYouTube(entries, args.dryRun, 'meetup', 'meetup'); break;
    case 'articles': result = await ingestArticles(entries, args.dryRun); break;
    case 'ainews': result = await ingestAINews(entries, args.dryRun); break;
    default: throw new Error(`Unknown: ${args.source}`);
  }

  console.log(`\n✓ ${result.inserted} inserted, ${result.skipped} skipped, ${result.failed} failed`);
  if (result.errors.length > 0) { console.log('Errors:'); result.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`)); }

  if (args.embedNow && !args.dryRun) {
    console.log('\n── Embedding ──');
    await embedAllPending(args.limit);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
