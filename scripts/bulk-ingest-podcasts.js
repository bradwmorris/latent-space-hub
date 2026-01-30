#!/usr/bin/env node
/**
 * Bulk ingest Latent Space podcasts with AI-generated summaries
 *
 * Usage:
 *   node scripts/bulk-ingest-podcasts.js              # Run all
 *   node scripts/bulk-ingest-podcasts.js --dry-run    # Preview without inserting
 */

import { createClient } from '@libsql/client';
import OpenAI from 'openai';
import { YoutubeTranscript } from 'youtube-transcript';
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
const PODCASTS_FILE = path.join(DATA_DIR, 'ls-podcasts-backfill.json');

// Clients
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Fetch YouTube transcript
async function fetchTranscript(videoId) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    if (!transcript || transcript.length === 0) {
      return null;
    }
    const text = transcript.map(seg => seg.text).join(' ');
    return text.slice(0, 4000);
  } catch (error) {
    console.warn(`  ⚠️ Transcript unavailable: ${error.message}`);
    return null;
  }
}

// Generate summary with GPT-4o-mini
async function generateSummary(podcast, transcript) {
  const prompt = transcript
    ? `Summarize this Latent Space podcast episode in 2-3 concise sentences for a knowledge hub. Focus on the key takeaways and what makes this episode valuable.

Title: ${podcast.title}
Guest: ${podcast.guest}${podcast.company ? ` (${podcast.company})` : ''}

Transcript excerpt:
${transcript}

Write a clear, informative summary (2-3 sentences, ~50-80 words):`
    : `Write a brief description for this Latent Space podcast episode based on its title and guest. Focus on what the episode likely covers.

Title: ${podcast.title}
Guest: ${podcast.guest}${podcast.company ? ` (${podcast.company})` : ''}

Write a clear, informative description (2-3 sentences, ~50-80 words):`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error(`  ❌ Summary generation failed: ${error.message}`);
    return `${podcast.guest}${podcast.company ? ` from ${podcast.company}` : ''} joins the Latent Space podcast to discuss "${podcast.title}".`;
  }
}

// Insert node into Turso
async function insertNode(podcast, summary) {
  const now = new Date().toISOString();

  // Format title with guest
  const formattedTitle = podcast.guest
    ? `${podcast.title} — ${podcast.guest}`
    : podcast.title;

  // Format description with "By Latent Space —" prefix
  const formattedDescription = `By Latent Space — ${summary}`;

  // Rich metadata
  const metadata = JSON.stringify({
    source: 'youtube',
    video_id: podcast.id,
    channel_name: 'Latent Space',
    channel_url: 'https://www.youtube.com/@LatentSpacePod',
    thumbnail_url: `https://i.ytimg.com/vi/${podcast.id}/hqdefault.jpg`,
    guest: podcast.guest,
    company: podcast.company || null,
    month: podcast.month,
    extraction_method: 'bulk_ingest_gpt4omini',
    summary_origin: 'title_based',
    refined_at: now,
  });

  try {
    // Insert node
    const result = await turso.execute({
      sql: `INSERT INTO nodes (title, description, content, link, type, created_at, updated_at, metadata, chunk, chunk_status)
            VALUES (?, ?, ?, ?, 'LS Podcast', ?, ?, ?, ?, 'complete')`,
      args: [
        formattedTitle,
        formattedDescription,
        summary,
        `https://www.youtube.com/watch?v=${podcast.id}`,
        now,
        now,
        metadata,
        summary,
      ],
    });

    const nodeId = Number(result.lastInsertRowid);

    // Add to LS Pod dimension
    await turso.execute({
      sql: `INSERT OR IGNORE INTO dimensions (name, is_priority, updated_at) VALUES (?, 0, ?)`,
      args: ['LS Pod', now],
    });

    await turso.execute({
      sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)`,
      args: [nodeId, 'LS Pod'],
    });

    return nodeId;
  } catch (error) {
    console.error(`  ❌ DB insert failed: ${error.message}`);
    throw error;
  }
}

// Check if already ingested
async function isAlreadyIngested(videoId) {
  try {
    const result = await turso.execute({
      sql: `SELECT id FROM nodes WHERE link = ?`,
      args: [`https://www.youtube.com/watch?v=${videoId}`],
    });
    return result.rows.length > 0;
  } catch (error) {
    return false;
  }
}

// Main ingestion function
async function ingestPodcast(podcast, dryRun = false) {
  console.log(`\n🎙️ Processing: ${podcast.title}`);
  console.log(`   Guest: ${podcast.guest}${podcast.company ? ` (${podcast.company})` : ''}`);

  // Check if already in DB
  if (await isAlreadyIngested(podcast.id)) {
    console.log('   ⏭️ Already ingested, skipping');
    return { status: 'skipped', reason: 'already_ingested' };
  }

  // Fetch transcript
  console.log('   📝 Fetching transcript...');
  const transcript = await fetchTranscript(podcast.id);

  if (transcript) {
    console.log(`   ✅ Got transcript (${transcript.length} chars)`);
  } else {
    console.log('   ⚠️ No transcript, will generate from title');
  }

  // Generate summary
  console.log('   🤖 Generating summary...');
  const summary = await generateSummary(podcast, transcript);
  console.log(`   ✅ Summary: "${summary.slice(0, 100)}..."`);

  if (dryRun) {
    console.log('   🔍 DRY RUN - would insert node');
    return { status: 'dry_run', summary, podcast };
  }

  // Insert to DB
  console.log('   💾 Inserting to Turso...');
  const nodeId = await insertNode(podcast, summary);
  console.log(`   ✅ Created node #${nodeId}`);

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

  console.log('🚀 Latent Space Podcast Bulk Ingestion');
  console.log('━'.repeat(50));

  // Load podcasts
  const podcasts = JSON.parse(fs.readFileSync(PODCASTS_FILE, 'utf-8'));
  console.log(`📦 Loaded ${podcasts.length} podcasts from manifest`);

  if (options.dryRun) {
    console.log('\n⚠️ DRY RUN MODE - no changes will be made\n');
  }

  // Process podcasts
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
  };

  for (let i = 0; i < podcasts.length; i++) {
    const podcast = podcasts[i];
    console.log(`\n[${i + 1}/${podcasts.length}]`);

    try {
      const result = await ingestPodcast(podcast, options.dryRun);

      if (result.status === 'success' || result.status === 'dry_run') {
        results.success++;
      } else if (result.status === 'skipped') {
        results.skipped++;
      }
    } catch (error) {
      console.error(`   ❌ FAILED: ${error.message}`);
      results.failed++;
    }

    // Rate limit
    if (i < podcasts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  // Summary
  console.log('\n' + '━'.repeat(50));
  console.log('📊 SUMMARY');
  console.log(`   ✅ Success: ${results.success}`);
  console.log(`   ⏭️ Skipped: ${results.skipped}`);
  console.log(`   ❌ Failed: ${results.failed}`);

  if (options.dryRun) {
    console.log('\n⚠️ This was a DRY RUN - run without --dry-run to actually ingest');
  }
}

main().catch(console.error);
