/**
 * One-time backfill: classify entity nodes + regenerate garbage descriptions.
 *
 * Phase 1: Classify entity_type on nodes missing it (batch LLM — 20 at a time)
 * Phase 2: Regenerate descriptions for entities with garbage text
 *
 * Usage:
 *   npx tsx scripts/backfill-entities.ts              # dry-run (default)
 *   npx tsx scripts/backfill-entities.ts --write       # apply changes
 *   npx tsx scripts/backfill-entities.ts --write --limit 50
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@libsql/client';
import OpenAI from 'openai';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const WRITE = process.argv.includes('--write');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : 9999;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Phase 1: Classify entity_type ─────────────────────────────────────────

async function classifyBatch(entities: Array<{ id: number; title: string }>): Promise<Map<number, string>> {
  const titles = entities.map((e, i) => `${i + 1}. ${e.title}`).join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `Classify each entity into exactly one type. Return JSON: {"results": [{"index": 1, "type": "organization|person|concept"}]}

Types:
- "organization": Companies, labs, institutions, products/platforms (e.g. OpenAI, Stanford, Cursor, Hugging Face)
- "person": Individual people (e.g. Ilya Sutskever, swyx, Andrej Karpathy)
- "concept": Research fields, methods, topics, abstract ideas (e.g. reinforcement learning, RAG, scaling laws)

Entities:
${titles}`,
    }],
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content) as { results: Array<{ index: number; type: string }> };

  const map = new Map<number, string>();
  for (const r of (parsed.results || [])) {
    const idx = r.index - 1;
    if (idx >= 0 && idx < entities.length && ['organization', 'person', 'concept'].includes(r.type)) {
      map.set(entities[idx].id, r.type);
    }
  }
  return map;
}

async function phase1Classify() {
  const rows = await db.execute({
    sql: `SELECT id, title, metadata FROM nodes
          WHERE node_type = 'entity'
            AND (
              json_extract(metadata, '$.entity_type') IS NULL
              OR json_extract(metadata, '$.entity_type') = ''
            )
          ORDER BY id ASC
          LIMIT ?`,
    args: [LIMIT],
  });

  console.log(`  Found ${rows.rows.length} entities without entity_type\n`);
  if (rows.rows.length === 0) return;

  const entities = rows.rows.map(r => ({
    id: Number(r.id),
    title: String(r.title),
    metadata: r.metadata ? JSON.parse(String(r.metadata)) : {},
  }));

  // Process in batches of 20
  const BATCH = 20;
  const counts = { organization: 0, person: 0, concept: 0, skipped: 0 };

  for (let i = 0; i < entities.length; i += BATCH) {
    const batch = entities.slice(i, i + BATCH);
    const classifications = await classifyBatch(batch);

    for (const entity of batch) {
      const type = classifications.get(entity.id);
      if (!type) {
        counts.skipped++;
        continue;
      }

      counts[type as keyof typeof counts]++;

      if (WRITE) {
        const meta = { ...entity.metadata, entity_type: type };
        await db.execute({
          sql: 'UPDATE nodes SET metadata = ?, updated_at = datetime() WHERE id = ?',
          args: [JSON.stringify(meta), entity.id],
        });
      }

      const prefix = WRITE ? '  ✓' : '  →';
      console.log(`${prefix} [${entity.id}] "${entity.title}" → ${type}`);
    }

    if (i + BATCH < entities.length) {
      process.stdout.write(`  ... ${Math.min(i + BATCH, entities.length)}/${entities.length} done\n`);
      await sleep(200);
    }
  }

  console.log(`\n  Summary: ${counts.organization} org, ${counts.person} person, ${counts.concept} concept, ${counts.skipped} skipped`);
}

// ── Phase 2: Regenerate garbage descriptions ──────────────────────────────

async function generateDescription(
  entityName: string,
  entityType: string,
): Promise<{ description: string; notes: string }> {
  // Find a content node linked to this entity for context
  const linked = await db.execute({
    sql: `SELECT n.title, SUBSTR(n.chunk, 1, 1500) as chunk
          FROM nodes n
          JOIN edges e ON (e.from_node_id = n.id OR e.to_node_id = n.id)
          WHERE (e.from_node_id = (SELECT id FROM nodes WHERE title = ? AND node_type = 'entity' LIMIT 1)
              OR e.to_node_id = (SELECT id FROM nodes WHERE title = ? AND node_type = 'entity' LIMIT 1))
            AND n.node_type != 'entity'
            AND n.chunk IS NOT NULL
          LIMIT 1`,
    args: [entityName, entityName],
  });

  const sourceTitle = linked.rows[0] ? String(linked.rows[0].title) : '';
  const sourceChunk = linked.rows[0] ? String(linked.rows[0].chunk) : '';

  const typeLabel = entityType === 'person' ? 'person in AI/ML'
    : entityType === 'organization' ? 'organization'
    : 'concept or research area';

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0,
    max_tokens: 300,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `Generate a description and notes for this ${typeLabel}.

Entity: "${entityName}"
${sourceTitle ? `Source: "${sourceTitle}"` : ''}
${sourceChunk ? `Content: ${sourceChunk.slice(0, 1200)}` : ''}

Return JSON:
{
  "description": "One sentence. What this entity IS. Be specific, not generic.",
  "notes": "2-3 sentences of context. What is this entity known for? Why relevant to the AI/ML community?"
}

If you have no source content, use your general knowledge.
Do NOT say "extracted from auto-ingestion" or "mentioned in content".`,
    }],
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content) as { description?: string; notes?: string };
  return {
    description: parsed.description || entityName,
    notes: parsed.notes || '',
  };
}

async function phase2Descriptions() {
  const rows = await db.execute({
    sql: `SELECT id, title, metadata FROM nodes
          WHERE node_type = 'entity'
            AND (
              description LIKE '%extracted from auto-ingestion%'
              OR description IS NULL
              OR description = ''
            )
          ORDER BY id ASC
          LIMIT ?`,
    args: [LIMIT],
  });

  console.log(`  Found ${rows.rows.length} entities with garbage descriptions\n`);
  if (rows.rows.length === 0) return;

  let updated = 0;
  let failed = 0;

  for (const row of rows.rows) {
    const id = Number(row.id);
    const title = String(row.title);
    const metadata = row.metadata ? JSON.parse(String(row.metadata)) : {};
    const entityType = metadata.entity_type || 'concept';

    try {
      const { description, notes } = await generateDescription(title, entityType);

      if (WRITE) {
        await db.execute({
          sql: 'UPDATE nodes SET description = ?, notes = ?, chunk = ?, updated_at = datetime() WHERE id = ?',
          args: [description, notes, notes, id],
        });
        console.log(`  ✓ [${id}] "${title}"`);
      } else {
        console.log(`  → [${id}] "${title}"`);
      }
      console.log(`    desc: ${description}`);
      console.log(`    notes: ${(notes || '').slice(0, 100)}...`);

      updated++;
      if (updated % 10 === 0) {
        console.log(`  ... ${updated}/${rows.rows.length} done`);
      }
      await sleep(200);
    } catch (e: any) {
      console.log(`  ✗ [${id}] "${title}" — ${e.message}`);
      failed++;
    }
  }

  console.log(`\n  Summary: ${updated} updated, ${failed} failed`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  ENTITY BACKFILL ${WRITE ? '— WRITING TO DB' : '— DRY RUN (use --write to apply)'}`);
  console.log('═══════════════════════════════════════════════════\n');

  console.log('── Phase 1: Classify entity_type ──\n');
  await phase1Classify();

  console.log('\n── Phase 2: Regenerate garbage descriptions ──\n');
  await phase2Descriptions();

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  BACKFILL COMPLETE ${WRITE ? '— changes written' : '— dry run, no changes'}`);
  console.log('═══════════════════════════════════════════════════\n');
}

main().then(() => process.exit(0)).catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
