#!/usr/bin/env node
/**
 * Bulk ingest AINews articles with AI-generated summaries
 *
 * Usage:
 *   node scripts/bulk-ingest-ainews.js              # Run all
 *   node scripts/bulk-ingest-ainews.js --dry-run    # Preview without inserting
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
const AINEWS_FILE = path.join(DATA_DIR, 'ls-ainews-backfill.json');

// Clients
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Fetch article content from news.smol.ai
async function fetchArticleContent(slug) {
  try {
    const url = `https://news.smol.ai/issues/${slug}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`  Failed to fetch article: ${response.status}`);
      return null;
    }
    const html = await response.text();

    // Extract main content - look for article body
    // The site uses Astro/markdown, content is in <article> or main content area
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      // Strip HTML tags for text content
      let text = articleMatch[1]
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.slice(0, 4000);
    }

    // Fallback: try to get main content
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      let text = mainMatch[1]
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.slice(0, 4000);
    }

    return null;
  } catch (error) {
    console.warn(`  Error fetching article: ${error.message}`);
    return null;
  }
}

// Generate summary with GPT-4o-mini
async function generateSummary(article, content) {
  const prompt = content
    ? `Summarize this AI News article in 2-3 concise sentences for a knowledge hub. Focus on the key announcements and what makes this news significant.

Title: ${article.title}
Date: ${article.date}

Content excerpt:
${content}

Write a clear, informative summary (2-3 sentences, ~50-80 words):`
    : `Write a brief description for this AI News article based on its title and date. Focus on what the news likely covers.

Title: ${article.title}
Date: ${article.date}

Write a clear, informative description (2-3 sentences, ~50-80 words):`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error(`  Summary generation failed: ${error.message}`);
    return `AI News coverage of "${article.title}" from ${article.date}.`;
  }
}

// Insert node into Turso
async function insertNode(article, summary) {
  const now = new Date().toISOString();

  // Format title with [AINews] prefix
  const formattedTitle = `[AINews] ${article.title}`;

  // Format description with "By Latent Space —" prefix
  const formattedDescription = `By Latent Space — ${summary}`;

  // Use Substack URL if available, otherwise news.smol.ai
  const articleUrl = article.substack_url || `https://news.smol.ai/issues/${article.slug}`;

  // Rich metadata
  const metadata = JSON.stringify({
    source: 'newsletter',
    slug: article.slug,
    channel_name: 'Latent Space',
    channel_url: 'https://www.latent.space/',
    news_smol_url: `https://news.smol.ai/issues/${article.slug}`,
    substack_url: article.substack_url || null,
    publish_date: article.date,
    extraction_method: 'bulk_ingest_gpt4omini',
    summary_origin: 'content_based',
    refined_at: now,
  });

  try {
    // Insert node
    const result = await turso.execute({
      sql: `INSERT INTO nodes (title, description, content, link, type, created_at, updated_at, metadata, chunk, chunk_status)
            VALUES (?, ?, ?, ?, 'AI News', ?, ?, ?, ?, 'complete')`,
      args: [
        formattedTitle,
        formattedDescription,
        summary,
        articleUrl,
        now,
        now,
        metadata,
        summary,
      ],
    });

    const nodeId = Number(result.lastInsertRowid);

    // Add to AI News dimension
    await turso.execute({
      sql: `INSERT OR IGNORE INTO dimensions (name, is_priority, updated_at) VALUES (?, 0, ?)`,
      args: ['AI News', now],
    });

    await turso.execute({
      sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)`,
      args: [nodeId, 'AI News'],
    });

    return nodeId;
  } catch (error) {
    console.error(`  DB insert failed: ${error.message}`);
    throw error;
  }
}

// Check if already ingested
async function isAlreadyIngested(slug) {
  try {
    const result = await turso.execute({
      sql: `SELECT id FROM nodes WHERE link LIKE ? OR link LIKE ?`,
      args: [`%${slug}%`, `%${slug}%`],
    });
    return result.rows.length > 0;
  } catch (error) {
    return false;
  }
}

// Main ingestion function
async function ingestArticle(article, dryRun = false) {
  console.log(`\n[AINews] Processing: ${article.title}`);
  console.log(`   Date: ${article.date}`);

  // Check if already in DB
  if (await isAlreadyIngested(article.slug)) {
    console.log('   Skipped (already ingested)');
    return { status: 'skipped', reason: 'already_ingested' };
  }

  // Fetch content
  console.log('   Fetching content...');
  const content = await fetchArticleContent(article.slug);

  if (content) {
    console.log(`   Got content (${content.length} chars)`);
  } else {
    console.log('   No content, will generate from title');
  }

  // Generate summary
  console.log('   Generating summary...');
  const summary = await generateSummary(article, content);
  console.log(`   Summary: "${summary.slice(0, 100)}..."`);

  if (dryRun) {
    console.log('   DRY RUN - would insert node');
    return { status: 'dry_run', summary, article };
  }

  // Insert to DB
  console.log('   Inserting to Turso...');
  const nodeId = await insertNode(article, summary);
  console.log(`   Created node #${nodeId}`);

  return { status: 'success', nodeId, summary };
}

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
  };
}

// Main
async function main() {
  const options = parseArgs();

  console.log('Latent Space AINews Bulk Ingestion');
  console.log('='.repeat(50));

  // Load articles
  const articles = JSON.parse(fs.readFileSync(AINEWS_FILE, 'utf-8'));
  console.log(`Loaded ${articles.length} articles from manifest`);

  if (options.dryRun) {
    console.log('\nDRY RUN MODE - no changes will be made\n');
  }

  // Process articles
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
  };

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`\n[${i + 1}/${articles.length}]`);

    try {
      const result = await ingestArticle(article, options.dryRun);

      if (result.status === 'success' || result.status === 'dry_run') {
        results.success++;
      } else if (result.status === 'skipped') {
        results.skipped++;
      }
    } catch (error) {
      console.error(`   FAILED: ${error.message}`);
      results.failed++;
    }

    // Rate limit
    if (i < articles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  // Summary
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
