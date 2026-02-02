#!/usr/bin/env node
/**
 * Migrate to new taxonomy structure
 *
 * Creates new dimensions for the three-axis taxonomy:
 * - Format: podcast, article, video, news, paper, insight
 * - Events: Paper Club, etc.
 * - Themes: frontier-models, benchmarks, agents, etc.
 *
 * Usage:
 *   node scripts/migrate-taxonomy.js              # Run migration
 *   node scripts/migrate-taxonomy.js --dry-run    # Preview only
 */

import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// New taxonomy dimensions
const FORMAT_DIMENSIONS = [
  { name: 'podcast', description: 'Audio podcast episode with guests', isPriority: true },
  { name: 'article', description: 'Written essay, blog post, or newsletter', isPriority: true },
  { name: 'video', description: 'Conference talk, workshop, or presentation', isPriority: true },
  { name: 'news', description: 'AI News daily briefing', isPriority: true },
  { name: 'paper', description: 'Academic paper, tech report, or research', isPriority: true },
  { name: 'insight', description: 'Extracted key idea from other content', isPriority: true },
];

const EVENT_DIMENSIONS = [
  { name: 'Paper Club', description: 'Latent Space weekly paper discussion', isPriority: false },
  { name: 'Builders Club', description: 'Builder community sessions', isPriority: false },
];

const THEME_DIMENSIONS = [
  { name: 'frontier-models', description: 'GPT, Claude, Gemini, Llama, DeepSeek model releases', isPriority: false },
  { name: 'benchmarks', description: 'MMLU, GPQA, SWE-Bench, evaluation methodology', isPriority: false },
  { name: 'prompting', description: 'Chain of thought, DSPy, prompt engineering', isPriority: false },
  { name: 'rag', description: 'Retrieval augmented generation, embeddings, vector search', isPriority: false },
  { name: 'agents', description: 'Autonomy, tool use, MCP, orchestration', isPriority: false },
  { name: 'codegen', description: 'Code models, SWE agents, developer tools', isPriority: false },
  { name: 'vision', description: 'CLIP, SAM, multimodal models', isPriority: false },
  { name: 'voice', description: 'Speech recognition, TTS, realtime audio', isPriority: false },
  { name: 'diffusion', description: 'Image and video generation, Flux, Sora', isPriority: false },
  { name: 'finetuning', description: 'LoRA, RLHF, DPO, training techniques', isPriority: false },
  { name: 'infrastructure', description: 'Compute, inference, serving, scaling', isPriority: false },
  { name: 'business', description: 'Startups, funding, strategy, go-to-market', isPriority: false },
];

// Mapping from old dimensions to new format dimensions
const DIMENSION_MIGRATIONS = [
  { old: 'LS Pod', newFormat: 'podcast' },
  { old: 'LS Articles', newFormat: 'article' },
  { old: 'AIE Videos', newFormat: 'video' },
  { old: 'AI News', newFormat: 'news' },
];

async function createDimension(dim, dryRun = false) {
  const now = new Date().toISOString();

  if (dryRun) {
    console.log(`  Would create: ${dim.name} (${dim.description})`);
    return;
  }

  try {
    await turso.execute({
      sql: `INSERT OR IGNORE INTO dimensions (name, description, is_priority, updated_at)
            VALUES (?, ?, ?, ?)`,
      args: [dim.name, dim.description, dim.isPriority ? 1 : 0, now],
    });
    console.log(`  Created: ${dim.name}`);
  } catch (error) {
    console.error(`  Failed to create ${dim.name}: ${error.message}`);
  }
}

async function migrateNodeDimensions(migration, dryRun = false) {
  const { old, newFormat } = migration;

  // Get all nodes with the old dimension
  const result = await turso.execute({
    sql: `SELECT node_id FROM node_dimensions WHERE dimension = ?`,
    args: [old],
  });

  const nodeIds = result.rows.map(r => r.node_id);
  console.log(`  Found ${nodeIds.length} nodes with dimension '${old}'`);

  if (dryRun) {
    console.log(`  Would add '${newFormat}' to ${nodeIds.length} nodes`);
    return nodeIds.length;
  }

  // Add new format dimension to each node
  let added = 0;
  for (const nodeId of nodeIds) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)`,
        args: [nodeId, newFormat],
      });
      added++;
    } catch (error) {
      console.error(`  Failed to add ${newFormat} to node ${nodeId}: ${error.message}`);
    }
  }

  console.log(`  Added '${newFormat}' to ${added} nodes`);
  return added;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
  };
}

async function main() {
  const options = parseArgs();

  console.log('Latent Space Hub - Taxonomy Migration');
  console.log('='.repeat(50));

  if (options.dryRun) {
    console.log('\nDRY RUN MODE - no changes will be made\n');
  }

  // Step 1: Create format dimensions
  console.log('\n1. Creating FORMAT dimensions...');
  for (const dim of FORMAT_DIMENSIONS) {
    await createDimension(dim, options.dryRun);
  }

  // Step 2: Create event dimensions
  console.log('\n2. Creating EVENT dimensions...');
  for (const dim of EVENT_DIMENSIONS) {
    await createDimension(dim, options.dryRun);
  }

  // Step 3: Create theme dimensions
  console.log('\n3. Creating THEME dimensions...');
  for (const dim of THEME_DIMENSIONS) {
    await createDimension(dim, options.dryRun);
  }

  // Step 4: Migrate existing nodes
  console.log('\n4. Migrating existing nodes to new format dimensions...');
  for (const migration of DIMENSION_MIGRATIONS) {
    console.log(`\n  Migrating ${migration.old} → ${migration.newFormat}...`);
    await migrateNodeDimensions(migration, options.dryRun);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Migration complete!');

  if (options.dryRun) {
    console.log('\nThis was a DRY RUN - run without --dry-run to apply changes');
  }
}

main().catch(console.error);
