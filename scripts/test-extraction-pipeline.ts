/**
 * Dry-run test of the entity extraction pipeline.
 * Pulls real nodes from the DB, runs extraction, shows what WOULD happen.
 * Does NOT write anything to the database.
 *
 * Usage: npx tsx scripts/test-extraction-pipeline.ts [--limit N]
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

// ── Re-implement core functions inline (no Next.js deps) ──────────────────

const ENTITY_BLOCKLIST = new Set([
  'ai', 'llm', 'ml', 'tech', 'product', 'today', 'week',
  'artificial intelligence', 'machine learning', 'deep learning',
  'scaling', 'data', 'software', 'hardware',
]);

const HOST_ALIAS_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bswixs\b/gi, replacement: 'swyx' },
  { pattern: /\bswix\b/gi, replacement: 'swyx' },
  { pattern: /\bswitz\b/gi, replacement: 'swyx' },
  { pattern: /\balesio\b/gi, replacement: 'Alessio' },
  { pattern: /\ballesio\b/gi, replacement: 'Alessio' },
  { pattern: /\ballesop\b/gi, replacement: 'Alessio' },
];

function cleanEntity(name: string): string {
  let value = name;
  for (const rule of HOST_ALIAS_REPLACEMENTS) {
    value = value.replace(rule.pattern, rule.replacement);
  }
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function isFuzzyMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return false;
  const distance = levenshtein(na, nb);
  const threshold = Math.max(1, Math.floor(maxLen / 5));
  return distance <= threshold;
}

function dedupe(arr: string[] | undefined): string[] {
  if (!arr) return [];
  return [...new Set(arr.map(cleanEntity).filter(Boolean))].filter(
    (value) => !ENTITY_BLOCKLIST.has(value.toLowerCase())
  );
}

// ── LLM calls ─────────────────────────────────────────────────────────────

async function extractEntities(title: string, chunk: string) {
  const prompt = [
    'Extract entities and themes from this content. Return strict JSON only.',
    'Schema: {"organizations": string[], "themes": string[]}',
    'Rules:',
    '- organizations: Only major companies, labs, or institutions (e.g. "OpenAI", "DeepMind", "Stanford"). Not products, not projects.',
    '- themes: Key research areas or topics discussed (e.g. "reinforcement learning", "mechanistic interpretability", "constitutional AI"). Not generic terms like "AI" or "scaling". Use lowercase.',
    '- Keep organization names in standard capitalization.',
    '- Max 5 organizations, max 5 themes.',
    '- If unsure, leave it out.',
    '',
    `Title: ${cleanEntity(title)}`,
    `Content: ${cleanEntity(chunk).slice(0, 2500)}`,
  ].join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0,
    max_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);
  return {
    organizations: dedupe(parsed.organizations),
    themes: dedupe(parsed.themes),
  };
}

async function generateContentDescription(title: string, nodeType: string, chunk: string) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0,
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Write a one-sentence description for this ${nodeType}.

Title: "${title}"
Content: ${chunk.slice(0, 2000)}

Rules:
- Start with what it IS: "A Latent Space podcast episode featuring X, discussing Y."
- Include who's involved and what they talk about.
- One sentence, max 50 words.
- No fluff, no opinions. Just facts.`,
    }],
  });
  return response.choices[0]?.message?.content?.trim() || title;
}

async function generateEntityDescription(entityName: string, sourceTitle: string, sourceChunk: string) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0,
    max_tokens: 300,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `Generate a description and notes for this organization based on the source content.

Entity: "${entityName}"
Source: "${sourceTitle}"
Content: ${sourceChunk.slice(0, 1500)}

Return JSON:
{
  "description": "One sentence. What this organization IS — what they do and why they matter in AI/ML. Be specific, not generic.",
  "notes": "2-3 sentences of additional context from the source content."
}`,
    }],
  });
  const content = response.choices[0]?.message?.content || '{}';
  return JSON.parse(content);
}

// ── Dedup check against existing entities ─────────────────────────────────

async function checkDedup(orgName: string): Promise<string> {
  const normalized = cleanEntity(orgName);

  // Exact match
  const exact = await db.execute({
    sql: "SELECT id, title FROM nodes WHERE LOWER(title) = LOWER(?) AND node_type = 'entity' LIMIT 1",
    args: [normalized],
  });
  if (exact.rows.length > 0) {
    return `EXACT MATCH → node ${exact.rows[0].id} "${exact.rows[0].title}"`;
  }

  // Fuzzy match
  const words = normalized.split(' ').filter(w => w.length > 2);
  if (words.length > 0) {
    const placeholders = words.map(() => 'LOWER(title) LIKE ?').join(' OR ');
    const fuzzy = await db.execute({
      sql: `SELECT id, title FROM nodes WHERE node_type = 'entity' AND (${placeholders}) LIMIT 10`,
      args: words.map(w => `%${w.toLowerCase()}%`),
    });
    for (const row of fuzzy.rows) {
      if (isFuzzyMatch(normalized, String(row.title))) {
        return `FUZZY MATCH → node ${row.id} "${row.title}"`;
      }
    }
  }

  return 'NEW — would create entity node';
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : 3;

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  EXTRACTION PIPELINE DRY RUN');
  console.log('  Testing against real nodes — NO writes to DB');
  console.log('═══════════════════════════════════════════════════\n');

  // ── Test 1: Fuzzy matching ──────────────────────────────────────────────

  console.log('── Test 1: Fuzzy Matching ──\n');
  const fuzzyTests = [
    ['Boris Cherny', 'Boris Cherney'],
    ['OpenAI', 'OpenAI Inc'],
    ['DeepMind', 'Google DeepMind'],
    ['Anthropic', 'Antropic'],
    ['Meta', 'Meta AI'],
    ['swyx', 'Swyx'],
    ['completely different', 'nothing alike'],
  ];
  for (const [a, b] of fuzzyTests) {
    const match = isFuzzyMatch(a, b);
    console.log(`  ${match ? '✓ MATCH' : '✗ NO MATCH'}  "${a}" vs "${b}"`);
  }

  // ── Test 2: Pull real content nodes ─────────────────────────────────────

  console.log('\n── Test 2: Entity Extraction on Real Nodes ──\n');

  const nodes = await db.execute({
    sql: `SELECT id, title, SUBSTR(chunk, 1, 3000) as chunk, node_type, metadata
          FROM nodes
          WHERE node_type IN ('podcast', 'article', 'ainews')
            AND chunk IS NOT NULL
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [limit],
  });

  console.log(`  Found ${nodes.rows.length} content nodes to test\n`);

  for (const node of nodes.rows) {
    const title = String(node.title);
    const chunk = String(node.chunk || '');
    const nodeType = String(node.node_type);

    console.log(`  ┌─────────────────────────────────────────────`);
    console.log(`  │ Node ${node.id}: ${title.slice(0, 70)}`);
    console.log(`  │ Type: ${nodeType}`);
    console.log(`  │`);

    // Content description
    try {
      const desc = await generateContentDescription(title, nodeType, chunk);
      console.log(`  │ 📝 Description: ${desc}`);
    } catch (e: any) {
      console.log(`  │ ❌ Description failed: ${e.message}`);
    }

    // Entity extraction
    try {
      const entities = await extractEntities(title, chunk);
      console.log(`  │`);
      console.log(`  │ 🏢 Organizations (${entities.organizations.length}):`);
      for (const org of entities.organizations) {
        const dedupResult = await checkDedup(org);
        console.log(`  │   • ${org} → ${dedupResult}`);

        // If it's a new entity, show what description would be generated
        if (dedupResult.startsWith('NEW')) {
          try {
            const entDesc = await generateEntityDescription(org, title, chunk);
            console.log(`  │     Description: ${entDesc.description}`);
            console.log(`  │     Notes: ${(entDesc.notes || '').slice(0, 120)}...`);
          } catch (e: any) {
            console.log(`  │     ❌ Description generation failed: ${e.message}`);
          }
        }
      }

      console.log(`  │`);
      console.log(`  │ 🏷️  Themes → dimensions (${entities.themes.length}):`);
      for (const theme of entities.themes) {
        const dimName = theme.toLowerCase().replace(/\s+/g, '-');
        console.log(`  │   • "${theme}" → dimension: "${dimName}"`);
      }
    } catch (e: any) {
      console.log(`  │ ❌ Extraction failed: ${e.message}`);
    }

    console.log(`  └─────────────────────────────────────────────\n`);
  }

  // ── Test 3: Check catch-up cron query ───────────────────────────────────

  console.log('── Test 3: Catch-up Cron Query ──\n');

  const pending = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM nodes
          WHERE node_type IN ('podcast', 'article', 'ainews', 'builders-club', 'paper-club', 'workshop')
            AND chunk IS NOT NULL
            AND (
              json_extract(metadata, '$.entity_extraction.status') IS NULL
              OR json_extract(metadata, '$.entity_extraction.status') = 'failed'
            )`,
    args: [],
  });
  console.log(`  Nodes needing extraction: ${pending.rows[0].cnt}`);

  const alreadyDone = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM nodes
          WHERE json_extract(metadata, '$.entity_extraction.status') = 'success'`,
    args: [],
  });
  console.log(`  Nodes already extracted: ${alreadyDone.rows[0].cnt}`);

  // ── Test 4: Existing entity audit ───────────────────────────────────────

  console.log('\n── Test 4: Current Entity State ──\n');

  const entityStats = await db.execute({
    sql: `SELECT
            json_extract(metadata, '$.entity_type') as entity_type,
            COUNT(*) as cnt
          FROM nodes
          WHERE node_type = 'entity'
          GROUP BY entity_type
          ORDER BY cnt DESC`,
    args: [],
  });
  console.log('  Entity nodes by type:');
  for (const row of entityStats.rows) {
    console.log(`    ${row.entity_type || '(no type)'}: ${row.cnt}`);
  }

  const garbageDescs = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM nodes
          WHERE node_type = 'entity'
            AND (description LIKE '%extracted from auto-ingestion%' OR description IS NULL)`,
    args: [],
  });
  console.log(`\n  Entities with garbage descriptions: ${garbageDescs.rows[0].cnt}`);

  const goodDescs = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM nodes
          WHERE node_type = 'entity'
            AND description NOT LIKE '%extracted from auto-ingestion%'
            AND description IS NOT NULL`,
    args: [],
  });
  console.log(`  Entities with real descriptions: ${goodDescs.rows[0].cnt}`);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  DRY RUN COMPLETE — no data was written');
  console.log('═══════════════════════════════════════════════════\n');
}

main().then(() => process.exit(0)).catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
