#!/usr/bin/env node
/**
 * Bulk ingest papers (Paper Club readings, tech reports, etc.)
 *
 * Usage:
 *   node scripts/bulk-ingest-papers.js              # Run all
 *   node scripts/bulk-ingest-papers.js --dry-run    # Preview without inserting
 */

import { createClient } from '@libsql/client';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Config
const DELAY_MS = 500;

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const PAPERS_FILE = path.join(DATA_DIR, 'papers-backfill.json');

// Clients
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Generate enriched description with GPT-4o-mini
async function generateDescription(paper) {
  if (paper.description && paper.description.length > 50) {
    return paper.description;
  }

  const prompt = `Write a brief description (2-3 sentences) for this paper/tech report for a knowledge hub.

Title: ${paper.title}
Authors: ${paper.authors?.join(', ') || 'Unknown'}
Date: ${paper.date}
Context: ${paper.description || 'Paper Club discussion'}

Write a clear, informative description:`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error(`  Description generation failed: ${error.message}`);
    return paper.description || `${paper.title} - discussed at Paper Club.`;
  }
}

// Insert paper node
async function insertPaper(paper, description) {
  const now = new Date().toISOString();

  const metadata = JSON.stringify({
    source: 'paper',
    authors: paper.authors || [],
    paper_url: paper.paper_url || null,
    event: paper.event || null,
    event_date: paper.event_date || null,
    themes: paper.themes || [],
    publish_date: paper.date,
    extraction_method: 'bulk_ingest_papers',
    refined_at: now,
  });

  const formattedDescription = `By ${paper.authors?.join(', ') || 'Unknown'} — ${description}`;

  try {
    // Insert node
    const result = await turso.execute({
      sql: `INSERT INTO nodes (title, description, content, link, type, created_at, updated_at, metadata, chunk, chunk_status)
            VALUES (?, ?, ?, ?, 'paper', ?, ?, ?, ?, 'complete')`,
      args: [
        paper.title,
        formattedDescription,
        description,
        paper.url || paper.paper_url || '',
        now,
        now,
        metadata,
        description,
      ],
    });

    const nodeId = Number(result.lastInsertRowid);

    // Ensure dimensions exist
    const dimensions = ['paper', ...(paper.themes || [])];
    if (paper.event) {
      dimensions.push(paper.event);
    }

    for (const dim of dimensions) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO dimensions (name, is_priority, updated_at) VALUES (?, 0, ?)`,
        args: [dim, now],
      });

      await turso.execute({
        sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)`,
        args: [nodeId, dim],
      });
    }

    return nodeId;
  } catch (error) {
    console.error(`  DB insert failed: ${error.message}`);
    throw error;
  }
}

// Check if already ingested
async function isAlreadyIngested(title) {
  try {
    const result = await turso.execute({
      sql: `SELECT id FROM nodes WHERE title = ? OR title LIKE ?`,
      args: [title, `%${title}%`],
    });
    return result.rows.length > 0;
  } catch (error) {
    return false;
  }
}

// Main ingestion function
async function ingestPaper(paper, dryRun = false) {
  console.log(`\n[Paper] Processing: ${paper.title}`);
  console.log(`   Authors: ${paper.authors?.join(', ') || 'Unknown'}`);
  console.log(`   Date: ${paper.date}`);
  console.log(`   Themes: ${paper.themes?.join(', ') || 'none'}`);

  // Check if already in DB
  if (await isAlreadyIngested(paper.title)) {
    console.log('   Skipped (already ingested)');
    return { status: 'skipped', reason: 'already_ingested' };
  }

  // Generate description
  console.log('   Generating description...');
  const description = await generateDescription(paper);
  console.log(`   Description: "${description.slice(0, 100)}..."`);

  if (dryRun) {
    console.log('   DRY RUN - would insert node');
    return { status: 'dry_run', description, paper };
  }

  // Insert to DB
  console.log('   Inserting to Turso...');
  const nodeId = await insertPaper(paper, description);
  console.log(`   Created node #${nodeId}`);

  return { status: 'success', nodeId, description };
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
  };
}

async function main() {
  const options = parseArgs();

  console.log('Latent Space Papers Bulk Ingestion');
  console.log('='.repeat(50));

  // Load papers
  const papers = JSON.parse(fs.readFileSync(PAPERS_FILE, 'utf-8'));
  console.log(`Loaded ${papers.length} papers from manifest`);

  if (options.dryRun) {
    console.log('\nDRY RUN MODE - no changes will be made\n');
  }

  // Process papers
  const results = { success: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    console.log(`\n[${i + 1}/${papers.length}]`);

    try {
      const result = await ingestPaper(paper, options.dryRun);
      if (result.status === 'success' || result.status === 'dry_run') {
        results.success++;
      } else if (result.status === 'skipped') {
        results.skipped++;
      }
    } catch (error) {
      console.error(`   FAILED: ${error.message}`);
      results.failed++;
    }

    if (i < papers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log(`   Success: ${results.success}`);
  console.log(`   Skipped: ${results.skipped}`);
  console.log(`   Failed: ${results.failed}`);

  if (options.dryRun) {
    console.log('\nThis was a DRY RUN - run without --dry-run to actually ingest');
  }
}

main().catch(console.error);
