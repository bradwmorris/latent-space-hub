/**
 * Standalone entity extraction script — no Next.js deps.
 * Creates person/org/topic nodes from content and links them with edges.
 *
 * Usage: npx tsx scripts/extract-entities.ts [--limit N]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const OPENAI_KEY = process.env.OPENAI_API_KEY!;
if (!OPENAI_KEY) { console.error('OPENAI_API_KEY required'); process.exit(1); }

// Load blocklist
const blocklistPath = path.join(__dirname, 'data', 'blocklist-nontopics.json');
const blocklist: Set<string> = fs.existsSync(blocklistPath)
  ? new Set(JSON.parse(fs.readFileSync(blocklistPath, 'utf-8')))
  : new Set();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── DB helpers ───────────────────────────────────────────────────────────────

async function findOrCreateEntity(title: string, nodeType: string, meta: Record<string, any> = {}): Promise<number> {
  const r = await db.execute({
    sql: 'SELECT id FROM nodes WHERE LOWER(title) = LOWER(?) AND node_type = ? LIMIT 1',
    args: [title, nodeType],
  });
  if (r.rows.length > 0) return Number(r.rows[0].id);

  const now = new Date().toISOString();
  const insert = await db.execute({
    sql: `INSERT INTO nodes (title, node_type, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    args: [title, nodeType, JSON.stringify(meta), now, now],
  });
  return Number(insert.lastInsertRowid);
}

async function edgeExists(fromId: number, toId: number): Promise<boolean> {
  const r = await db.execute({
    sql: 'SELECT 1 FROM edges WHERE from_node_id = ? AND to_node_id = ? LIMIT 1',
    args: [fromId, toId],
  });
  return r.rows.length > 0;
}

async function createEdge(fromId: number, toId: number, explanation: string, edgeType: string) {
  if (await edgeExists(fromId, toId)) return;
  const now = new Date().toISOString();
  const context = JSON.stringify({ type: edgeType, confidence: 0.9, inferred_at: now, explanation, created_via: 'workflow' });
  await db.execute({
    sql: 'INSERT INTO edges (from_node_id, to_node_id, context, source, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [fromId, toId, context, 'ai_similarity', now],
  });
}

async function nodeHasEdges(nodeId: number): Promise<boolean> {
  const r = await db.execute({
    sql: 'SELECT 1 FROM edges WHERE from_node_id = ? OR to_node_id = ? LIMIT 1',
    args: [nodeId, nodeId],
  });
  return r.rows.length > 0;
}

// ── Frontmatter extraction (AINews) ──────────────────────────────────────────

async function extractFromFrontmatter(): Promise<{ entities: number; edges: number }> {
  let entities = 0, edges = 0;

  const ainewsNodes = await db.execute({
    sql: `SELECT id, title, metadata FROM nodes WHERE node_type = 'source' AND metadata LIKE '%frontmatter_entities%'`,
    args: [],
  });
  console.log(`  AI News nodes with frontmatter entities: ${ainewsNodes.rows.length}`);

  let nodeIdx = 0;
  for (const node of ainewsNodes.rows) {
    const nodeId = Number(node.id);
    nodeIdx++;
    if (await nodeHasEdges(nodeId)) { continue; }

    const meta = typeof node.metadata === 'string' ? JSON.parse(node.metadata as string) : node.metadata;
    const ents = meta?.frontmatter_entities;
    if (!ents) continue;

    let nodeEnts = 0;
    for (const c of (ents.companies || [])) {
      const n = c.toLowerCase().replace(/\s+/g, '-');
      if (blocklist.has(n) || n.length < 2) continue;
      const eid = await findOrCreateEntity(
        c.replace(/-/g, ' ').replace(/\b\w/g, (x: string) => x.toUpperCase()),
        'organization', { org_type: 'startup' }
      );
      await createEdge(nodeId, eid, `covers ${c}`, 'covers_topic');
      edges++; entities++; nodeEnts++;
    }

    for (const p of (ents.people || [])) {
      const n = p.toLowerCase().replace(/\s+/g, '-');
      if (blocklist.has(n) || n.length < 2) continue;
      const eid = await findOrCreateEntity(
        p.replace(/-/g, ' ').replace(/\b\w/g, (x: string) => x.toUpperCase()),
        'person', { role: 'mentioned' }
      );
      await createEdge(eid, nodeId, `mentioned in ${node.title}`, 'appeared_on');
      edges++; entities++; nodeEnts++;
    }

    for (const t of [...(ents.topics || []), ...(ents.models || [])]) {
      const n = t.toLowerCase().replace(/\s+/g, '-');
      if (blocklist.has(n) || n.length < 2) continue;
      const eid = await findOrCreateEntity(
        t.replace(/-/g, ' ').replace(/\b\w/g, (x: string) => x.toUpperCase()),
        'topic', {}
      );
      await createEdge(nodeId, eid, `covers ${t}`, 'covers_topic');
      edges++; entities++; nodeEnts++;
    }

    console.log(`  [${nodeIdx}/${ainewsNodes.rows.length}] node ${nodeId}: ${nodeEnts} entities  ${String(node.title).slice(0, 50)}`);
  }

  return { entities, edges };
}

// ── LLM extraction (podcasts, articles, TV) ──────────────────────────────────

async function extractWithLLM(limit: number): Promise<{ entities: number; edges: number }> {
  let entities = 0, edges = 0;

  const contentNodes = await db.execute({
    sql: `SELECT n.id, n.title, n.description, SUBSTR(n.chunk, 1, 3000) as chunk_preview, n.node_type
          FROM nodes n
          WHERE n.node_type IN ('episode', 'source')
            AND n.chunk IS NOT NULL
            AND n.metadata NOT LIKE '%frontmatter_entities%'
            AND NOT EXISTS (SELECT 1 FROM edges WHERE from_node_id = n.id OR to_node_id = n.id)
          ORDER BY n.id ASC
          LIMIT ?`,
    args: [limit],
  });
  console.log(`  Content nodes for LLM extraction: ${contentNodes.rows.length}`);

  let processed = 0;
  for (const node of contentNodes.rows) {
    const nodeId = Number(node.id);
    const title = String(node.title);

    try {
      const prompt = `Extract entities from this content. Return JSON only.
Title: ${title}
Description: ${node.description || ''}
Content: ${String(node.chunk_preview || '').slice(0, 2000)}
Return: {"guests":[{"name":"Full Name","company":"Company Name"}],"companies":["Company Name"],"topics":["topic-name"]}
Only include clearly prominent entities. Use lowercase-hyphenated for topics. Use proper capitalization for names and companies.`;

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        }),
      });

      if (!r.ok) {
        if (r.status === 429) {
          console.log('    Rate limited, waiting 10s...');
          await sleep(10000);
          continue; // Retry on next iteration (it won't have edges yet)
        }
        throw new Error(`OpenAI ${r.status}`);
      }

      const data = await r.json();
      const extracted = JSON.parse(data.choices?.[0]?.message?.content || '{}');

      let nodeEntities = 0;
      for (const g of (extracted.guests || [])) {
        if (!g.name || g.name.length < 2) continue;
        const pid = await findOrCreateEntity(g.name, 'person', {
          role: 'guest',
          affiliations: g.company ? [g.company] : [],
        });
        await createEdge(pid, nodeId, `appeared on ${title}`, 'appeared_on');
        edges++; entities++; nodeEntities++;

        if (g.company) {
          const oid = await findOrCreateEntity(g.company, 'organization', { org_type: 'startup' });
          await createEdge(pid, oid, `affiliated with ${g.company}`, 'affiliated_with');
          edges++; entities++;
        }
      }

      for (const c of (extracted.companies || [])) {
        if (!c || c.length < 2) continue;
        const oid = await findOrCreateEntity(c, 'organization', { org_type: 'startup' });
        await createEdge(nodeId, oid, `discusses ${c}`, 'covers_topic');
        edges++; entities++;
      }

      for (const t of (extracted.topics || [])) {
        const n = t.toLowerCase().replace(/\s+/g, '-');
        if (blocklist.has(n) || n.length < 2) continue;
        const tid = await findOrCreateEntity(
          t.replace(/-/g, ' ').replace(/\b\w/g, (x: string) => x.toUpperCase()),
          'topic', {}
        );
        await createEdge(nodeId, tid, `covers ${t}`, 'covers_topic');
        edges++; entities++;
      }

      processed++;
      if (processed % 10 === 0) console.log(`  ... ${processed}/${contentNodes.rows.length} processed`);
      console.log(`  ✓ ${nodeId}: ${(extracted.guests||[]).length}p ${(extracted.companies||[]).length}c ${(extracted.topics||[]).length}t  ${title.slice(0, 50)}`);
      await sleep(200);
    } catch (err: any) {
      console.error(`  ✗ ${nodeId}: ${err.message}`);
    }
  }

  return { entities, edges };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : 500;

  console.log('\n══ Entity Extraction ══\n');

  // Phase A: Frontmatter entities (AINews — fast, no LLM calls)
  console.log('── Phase A: AINews frontmatter entities ──');
  const fmResult = await extractFromFrontmatter();
  console.log(`  Frontmatter: ${fmResult.entities} entity refs, ${fmResult.edges} edges\n`);

  // Phase B: LLM extraction (podcasts, articles, TV)
  console.log('── Phase B: LLM entity extraction ──');
  const llmResult = await extractWithLLM(limit);
  console.log(`  LLM: ${llmResult.entities} entity refs, ${llmResult.edges} edges\n`);

  // Summary
  const totalNodes = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM nodes', args: [] });
  const totalEdges = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM edges', args: [] });
  const persons = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM nodes WHERE node_type = 'person'", args: [] });
  const orgs = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM nodes WHERE node_type = 'organization'", args: [] });
  const topics = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM nodes WHERE node_type = 'topic'", args: [] });

  console.log('══ Final State ══');
  console.log(`  Total nodes: ${totalNodes.rows[0].cnt}`);
  console.log(`  People: ${persons.rows[0].cnt}`);
  console.log(`  Organizations: ${orgs.rows[0].cnt}`);
  console.log(`  Topics: ${topics.rows[0].cnt}`);
  console.log(`  Edges: ${totalEdges.rows[0].cnt}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
