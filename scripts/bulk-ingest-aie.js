#!/usr/bin/env node
/**
 * Bulk ingest AIE YouTube videos with AI-generated summaries
 *
 * Usage:
 *   node scripts/bulk-ingest-aie.js              # Run all
 *   node scripts/bulk-ingest-aie.js --batch 1    # Run batch 1 (first 10)
 *   node scripts/bulk-ingest-aie.js --limit 50   # Run first 50
 *   node scripts/bulk-ingest-aie.js --dry-run    # Preview without inserting
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
const BATCH_SIZE = 10;
const DELAY_MS = 500; // 0.5 second between videos

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const VIDEOS_FILE = path.join(DATA_DIR, 'aie-videos.json');
const INGESTED_FILE = path.join(DATA_DIR, 'ingested.json');
const FAILED_FILE = path.join(DATA_DIR, 'failed.json');

// Clients
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load/save progress
function loadProgress() {
  try {
    if (fs.existsSync(INGESTED_FILE)) {
      return JSON.parse(fs.readFileSync(INGESTED_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not load progress file, starting fresh');
  }
  return { ingested: [], lastRun: null };
}

function saveProgress(progress) {
  progress.lastRun = new Date().toISOString();
  fs.writeFileSync(INGESTED_FILE, JSON.stringify(progress, null, 2));
}

function loadFailed() {
  try {
    if (fs.existsSync(FAILED_FILE)) {
      return JSON.parse(fs.readFileSync(FAILED_FILE, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

function saveFailed(failed) {
  fs.writeFileSync(FAILED_FILE, JSON.stringify(failed, null, 2));
}

// Fetch YouTube transcript
async function fetchTranscript(videoId) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    if (!transcript || transcript.length === 0) {
      return null;
    }
    // Combine all segments into one text
    const text = transcript.map(seg => seg.text).join(' ');
    // Limit to first ~4000 chars (enough for summary)
    return text.slice(0, 4000);
  } catch (error) {
    console.warn(`  ⚠️ Transcript unavailable: ${error.message}`);
    return null;
  }
}

// Generate summary with GPT-4o-mini
async function generateSummary(video, transcript) {
  const prompt = transcript
    ? `Summarize this AI engineering conference talk in 2-3 concise sentences for a knowledge hub. Focus on the key takeaways and what makes this talk valuable.

Title: ${video.title}
Speaker: ${video.speaker}${video.company ? ` (${video.company})` : ''}
Event: ${video.event}

Transcript excerpt:
${transcript}

Write a clear, informative summary (2-3 sentences, ~50-80 words):`
    : `Write a brief description for this AI engineering conference talk based on its title and speaker. Focus on what the talk likely covers.

Title: ${video.title}
Speaker: ${video.speaker}${video.company ? ` (${video.company})` : ''}
Event: ${video.event}

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
    // Fallback to basic description
    return `${video.speaker}${video.company ? ` from ${video.company}` : ''} presents "${video.title}" at ${video.event}.`;
  }
}

// Insert node into Turso
async function insertNode(video, summary) {
  const now = new Date().toISOString();

  // Format title with speaker (matching existing format)
  const formattedTitle = video.speaker
    ? `${video.title} — ${video.speaker}`
    : video.title;

  // Format description with "By AI Engineer —" prefix (matching existing format)
  const formattedDescription = `By AI Engineer — ${summary}`;

  // Rich metadata matching existing nodes
  const metadata = JSON.stringify({
    source: 'youtube',
    video_id: video.id,
    channel_name: 'AI Engineer',
    channel_url: 'https://www.youtube.com/@aiDotEngineer',
    thumbnail_url: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
    speaker: video.speaker,
    company: video.company || null,
    event: video.event,
    extraction_method: 'bulk_ingest_gpt4omini',
    summary_origin: 'title_based',
    refined_at: now,
  });

  try {
    // Insert node
    const result = await turso.execute({
      sql: `INSERT INTO nodes (title, description, content, link, type, created_at, updated_at, metadata, chunk, chunk_status)
            VALUES (?, ?, ?, ?, 'AIE Video', ?, ?, ?, ?, 'complete')`,
      args: [
        formattedTitle,
        formattedDescription,
        summary, // content = full summary
        `https://www.youtube.com/watch?v=${video.id}`,
        now,
        now,
        metadata,
        summary, // chunk = summary for FTS
      ],
    });

    // Get the inserted node ID
    const nodeId = Number(result.lastInsertRowid);

    // Add to AIE Videos dimension
    await turso.execute({
      sql: `INSERT OR IGNORE INTO dimensions (name, is_priority, updated_at) VALUES (?, 0, ?)`,
      args: ['AIE Videos', now],
    });

    await turso.execute({
      sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)`,
      args: [nodeId, 'AIE Videos'],
    });

    // Add to event-specific dimension (e.g., "AIE World's Fair 2025", "AIE Code Summit 2025")
    if (video.event) {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO dimensions (name, is_priority, updated_at) VALUES (?, 0, ?)`,
        args: [video.event, now],
      });

      await turso.execute({
        sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)`,
        args: [nodeId, video.event],
      });
    }

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
async function ingestVideo(video, dryRun = false) {
  console.log(`\n📹 Processing: ${video.title}`);
  console.log(`   Speaker: ${video.speaker}${video.company ? ` (${video.company})` : ''}`);

  // Check if already in DB
  if (await isAlreadyIngested(video.id)) {
    console.log('   ⏭️ Already ingested, skipping');
    return { status: 'skipped', reason: 'already_ingested' };
  }

  // Fetch transcript
  console.log('   📝 Fetching transcript...');
  const transcript = await fetchTranscript(video.id);

  if (transcript) {
    console.log(`   ✅ Got transcript (${transcript.length} chars)`);
  } else {
    console.log('   ⚠️ No transcript, will generate from title');
  }

  // Generate summary
  console.log('   🤖 Generating summary...');
  const summary = await generateSummary(video, transcript);
  console.log(`   ✅ Summary: "${summary.slice(0, 100)}..."`);

  if (dryRun) {
    console.log('   🔍 DRY RUN - would insert node');
    return { status: 'dry_run', summary, video };
  }

  // Insert to DB
  console.log('   💾 Inserting to Turso...');
  const nodeId = await insertNode(video, summary);
  console.log(`   ✅ Created node #${nodeId}`);

  return { status: 'success', nodeId, summary };
}

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    batch: null,
    limit: null,
    dryRun: false,
    retryFailed: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--batch':
        options.batch = parseInt(args[++i], 10);
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--retry-failed':
        options.retryFailed = true;
        break;
    }
  }

  return options;
}

// Main
async function main() {
  const options = parseArgs();

  console.log('🚀 AIE Video Bulk Ingestion');
  console.log('━'.repeat(50));

  // Load videos
  const allVideos = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf-8'));
  console.log(`📦 Loaded ${allVideos.length} videos from manifest`);

  // Load progress
  const progress = loadProgress();
  const failed = loadFailed();

  console.log(`✅ Previously ingested: ${progress.ingested.length}`);
  console.log(`❌ Previously failed: ${failed.length}`);

  // Determine which videos to process
  let videos = allVideos;

  if (options.retryFailed) {
    videos = allVideos.filter(v => failed.some(f => f.id === v.id));
    console.log(`🔄 Retrying ${videos.length} failed videos`);
  } else if (options.batch) {
    const start = (options.batch - 1) * BATCH_SIZE;
    const end = start + BATCH_SIZE;
    videos = allVideos.slice(start, end);
    console.log(`📦 Batch ${options.batch}: videos ${start + 1}-${end}`);
  } else if (options.limit) {
    videos = allVideos.slice(0, options.limit);
    console.log(`📦 Limited to first ${options.limit} videos`);
  }

  // Filter out already ingested
  const toProcess = videos.filter(v => !progress.ingested.includes(v.id));
  console.log(`📝 To process: ${toProcess.length} videos`);

  if (options.dryRun) {
    console.log('\n⚠️ DRY RUN MODE - no changes will be made\n');
  }

  // Process videos
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
  };

  const newFailed = [];
  const dryRunResults = [];

  for (let i = 0; i < toProcess.length; i++) {
    const video = toProcess[i];
    console.log(`\n[${i + 1}/${toProcess.length}]`);

    try {
      const result = await ingestVideo(video, options.dryRun);

      if (result.status === 'success' || result.status === 'dry_run') {
        results.success++;
        if (options.dryRun) {
          dryRunResults.push({
            id: video.id,
            title: video.title,
            speaker: video.speaker,
            company: video.company,
            event: video.event,
            summary: result.summary,
          });
        } else {
          progress.ingested.push(video.id);
          saveProgress(progress);
        }
      } else if (result.status === 'skipped') {
        results.skipped++;
      }
    } catch (error) {
      console.error(`   ❌ FAILED: ${error.message}`);
      results.failed++;
      newFailed.push({ id: video.id, title: video.title, error: error.message });
    }

    // Rate limit
    if (i < toProcess.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  // Save dry run results for review
  if (options.dryRun && dryRunResults.length > 0) {
    const reviewFile = path.join(DATA_DIR, 'review-batch.json');
    fs.writeFileSync(reviewFile, JSON.stringify(dryRunResults, null, 2));
    console.log(`\n📄 Review file saved: ${reviewFile}`);
  }

  // Save failed
  if (newFailed.length > 0) {
    saveFailed([...failed.filter(f => !newFailed.some(n => n.id === f.id)), ...newFailed]);
  }

  // Summary
  console.log('\n' + '━'.repeat(50));
  console.log('📊 SUMMARY');
  console.log(`   ✅ Success: ${results.success}`);
  console.log(`   ⏭️ Skipped: ${results.skipped}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   📦 Total ingested: ${progress.ingested.length}`);

  if (options.dryRun) {
    console.log('\n⚠️ This was a DRY RUN - run without --dry-run to actually ingest');
  }
}

main().catch(console.error);
