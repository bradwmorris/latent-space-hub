/**
 * PRD-05 Pipeline Smoke Test
 *
 * Tests all 4 content type pipelines end-to-end:
 *   1. YouTube podcast transcript extraction (@LatentSpacePod)
 *   2. Substack article extraction (latent.space)
 *   3. AI News markdown parsing (smol-ai/ainews-web-2025)
 *   4. LatentSpaceTV transcript extraction (@LatentSpaceTV)
 *   5. OpenAI embedding generation
 *   6. Turso vector storage (chunk insert + vector search)
 *   7. yt-dlp channel enumeration
 *
 * Usage: npx tsx scripts/test-ingestion-pipeline.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { extractYouTube } from '@/src/services/typescript/extractors/youtube';
import { extractWebsite } from '@/src/services/typescript/extractors/website';
import { getSQLiteClient } from '@/src/services/database/sqlite-client';
import { vectorToJsonString } from '@/src/services/typescript/sqlite-vec';
import { execSync } from 'child_process';

// ── Test config ────────────────────────────────────────────────────────────

const TEST_SAMPLES = {
  // Recent LatentSpacePod episode (confirmed transcript available)
  podcast: {
    url: 'https://www.youtube.com/watch?v=p1k7TiAFqdE',
    label: 'LatentSpacePod episode',
  },
  // Known latent.space article
  article: {
    url: 'https://www.latent.space/p/2025-papers',
    label: 'Substack article',
  },
  // LatentSpaceTV Paper Club (confirmed transcript available)
  latentspacetv: {
    url: 'https://www.youtube.com/watch?v=zqr3bj8WzGU',
    label: 'LatentSpaceTV Paper Club',
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const SKIP = '\x1b[33m⊘\x1b[0m';

interface TestResult {
  name: string;
  passed: boolean;
  skipped?: boolean;
  duration: number;
  detail: string;
  data?: any;
}

async function runTest(
  name: string,
  fn: () => Promise<{ detail: string; data?: any }>
): Promise<TestResult> {
  const start = Date.now();
  try {
    const { detail, data } = await fn();
    return { name, passed: true, duration: Date.now() - start, detail, data };
  } catch (err: any) {
    return {
      name,
      passed: false,
      duration: Date.now() - start,
      detail: err.message || String(err),
    };
  }
}

function printResult(r: TestResult) {
  const icon = r.skipped ? SKIP : r.passed ? PASS : FAIL;
  const ms = `${r.duration}ms`;
  console.log(`  ${icon} ${r.name} (${ms})`);
  console.log(`    ${r.detail}`);
  if (!r.passed && !r.skipped) {
    console.log('');
  }
}

// ── Individual tests ────────────────────────────────────────────────────────

async function testYouTubeExtraction(
  url: string,
  label: string
): Promise<{ detail: string; data?: any }> {
  const result = await extractYouTube(url);
  if (!result.success) {
    throw new Error(`Extraction failed: ${result.error}`);
  }
  const words = result.chunk.split(/\s+/).length;
  return {
    detail: `${label}: "${result.metadata.video_title}" — ${words.toLocaleString()} words, ${result.metadata.total_segments} segments`,
    data: {
      title: result.metadata.video_title,
      channel: result.metadata.channel_name,
      words,
      segments: result.metadata.total_segments,
      chunkPreview: result.chunk.slice(0, 200),
    },
  };
}

async function testSubstackExtraction(): Promise<{
  detail: string;
  data?: any;
}> {
  const result = await extractWebsite(TEST_SAMPLES.article.url);
  const words = result.chunk.split(/\s+/).length;
  if (words < 50) {
    throw new Error(`Content too short: ${words} words`);
  }
  return {
    detail: `Article: "${result.metadata.title}" — ${words.toLocaleString()} words`,
    data: {
      title: result.metadata.title,
      author: result.metadata.author,
      date: result.metadata.date,
      words,
      chunkPreview: result.chunk.slice(0, 200),
    },
  };
}

async function testAINewsMarkdownParsing(): Promise<{
  detail: string;
  data?: any;
}> {
  // Clone repo (shallow) to a temp dir, parse one issue
  const tmpDir = '/tmp/ainews-test';
  execSync(`rm -rf ${tmpDir}`);
  execSync(
    `git clone --depth 1 https://github.com/smol-ai/ainews-web-2025 ${tmpDir}`,
    { stdio: 'pipe', timeout: 30000 }
  );

  // Find a recent issue with entity tags (skip "not much" titles)
  const issueDir = `${tmpDir}/src/content/issues`;
  const files = execSync(`ls -t ${issueDir} | head -10`, { encoding: 'utf-8' })
    .trim()
    .split('\n');

  if (files.length === 0) {
    throw new Error('No issue files found in ainews repo');
  }

  // Read and parse a file with entities (not "not-much" issues)
  const fs = await import('fs');
  let sampleFile = '';
  let raw = '';
  for (const f of files) {
    if (!f.includes('not-much')) {
      sampleFile = `${issueDir}/${f}`;
      raw = fs.readFileSync(sampleFile, 'utf-8');
      break;
    }
  }
  if (!raw) {
    sampleFile = `${issueDir}/${files[0]}`;
    raw = fs.readFileSync(sampleFile, 'utf-8');
  }
  const chosenFile = sampleFile.split('/').pop()!;

  // Parse YAML frontmatter
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('No frontmatter found');
  }

  const frontmatter = frontmatterMatch[1];
  const body = raw.slice(frontmatterMatch[0].length).trim();
  const words = body.split(/\s+/).length;

  // Extract key frontmatter fields
  const titleMatch = frontmatter.match(/title:\s*["']?(.*?)["']?\s*$/m);
  const dateMatch = frontmatter.match(/date:\s*["']?(.*?)["']?\s*$/m);

  // Parse YAML arrays — handles both inline [a, b] and multi-line - item formats
  const parseYamlArray = (key: string): string[] => {
    // Try inline format: key: [a, b, c]
    const inlineMatch = frontmatter.match(new RegExp(`${key}:\\s*\\[([^\\]]*?)\\]`));
    if (inlineMatch && inlineMatch[1].trim()) {
      return inlineMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/['"]/g, ''))
        .filter(Boolean);
    }
    // Try multi-line format: key:\n  - a\n  - b
    const blockMatch = frontmatter.match(new RegExp(`${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`));
    if (blockMatch) {
      return blockMatch[1]
        .split('\n')
        .map((line) => line.replace(/^\s*-\s*/, '').trim().replace(/['"]/g, ''))
        .filter(Boolean);
    }
    return [];
  };

  const companies = parseYamlArray('companies');
  const topics = parseYamlArray('topics');
  const people = parseYamlArray('people');
  const models = parseYamlArray('models');

  // Clean up
  execSync(`rm -rf ${tmpDir}`);

  return {
    detail: `AINews: "${titleMatch?.[1] || chosenFile}" — ${words.toLocaleString()} words, ${companies.length} companies, ${models.length} models, ${topics.length} topics, ${people.length} people`,
    data: {
      file: chosenFile,
      title: titleMatch?.[1],
      date: dateMatch?.[1],
      words,
      companies: companies.slice(0, 5),
      models: models.slice(0, 5),
      topics: topics.slice(0, 5),
      people: people.slice(0, 5),
      bodyPreview: body.slice(0, 200),
    },
  };
}

async function testOpenAIEmbedding(): Promise<{
  detail: string;
  data?: any;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const text =
    'Latent Space podcast discussing AI agents, reasoning models, and the future of software engineering';

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const embedding = data.data[0].embedding;
  const dims = embedding.length;
  const usage = data.usage;

  return {
    detail: `text-embedding-3-small: ${dims}d vector, ${usage.total_tokens} tokens`,
    data: { dims, tokens: usage.total_tokens, first5: embedding.slice(0, 5) },
  };
}

async function testTursoConnection(): Promise<{
  detail: string;
  data?: any;
}> {
  const sqlite = getSQLiteClient();
  const connected = await sqlite.testConnection();
  if (!connected) {
    throw new Error('Turso connection failed');
  }

  const tables = await sqlite.checkTables();
  const nodeCount = await sqlite.query<{ count: number }>(
    'SELECT COUNT(*) as count FROM nodes'
  );
  const chunkCount = await sqlite.query<{ count: number }>(
    'SELECT COUNT(*) as count FROM chunks'
  );
  const dimCount = await sqlite.query<{ count: number }>(
    'SELECT COUNT(*) as count FROM dimensions'
  );

  return {
    detail: `Connected: ${tables.length} tables, ${nodeCount.rows[0].count} nodes, ${chunkCount.rows[0].count} chunks, ${dimCount.rows[0].count} dimensions`,
    data: {
      tables,
      nodes: nodeCount.rows[0].count,
      chunks: chunkCount.rows[0].count,
      dimensions: dimCount.rows[0].count,
    },
  };
}

async function testTursoVectorRoundtrip(): Promise<{
  detail: string;
  data?: any;
}> {
  const sqlite = getSQLiteClient();

  // Generate a test embedding
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const text = 'Test chunk for vector round-trip validation';

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  const embData = await response.json();
  const embedding: number[] = embData.data[0].embedding;

  // Insert a test chunk with vector into a temp node
  // First, create a temp node
  const nodeResult = await sqlite.query(
    `INSERT INTO nodes (title, description, node_type, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime(), datetime())`,
    [
      '__test_pipeline_node__',
      'Temporary node for pipeline testing',
      'topic',
      '{}',
    ]
  );
  const testNodeId = nodeResult.lastInsertRowid!;

  // Insert chunk with vector
  const vecJson = vectorToJsonString(embedding);
  await sqlite.query(
    `INSERT INTO chunks (node_id, chunk_idx, text, embedding, embedding_type, created_at)
     VALUES (?, ?, ?, vector(?), ?, datetime())`,
    [testNodeId, 0, text, vecJson, 'text-embedding-3-small']
  );

  // Search for it using vector_top_k
  const searchResult = await sqlite.query(
    `SELECT c.id, c.text, (1.0 - vector_distance_cos(c.embedding, vector(?))) as similarity
     FROM vector_top_k('chunks_embedding_idx', vector(?), 5) AS vt
     JOIN chunks c ON c.rowid = vt.id
     ORDER BY similarity DESC`,
    [vecJson, vecJson]
  );

  const found =
    searchResult.rows.length > 0 &&
    searchResult.rows.some((r: any) => r.text === text);
  const similarity = searchResult.rows[0]?.similarity;

  // Clean up: delete test chunk and node
  await sqlite.query('DELETE FROM chunks WHERE node_id = ?', [testNodeId]);
  await sqlite.query('DELETE FROM nodes WHERE id = ?', [testNodeId]);

  if (!found) {
    throw new Error('Vector round-trip failed: inserted chunk not found via vector_top_k');
  }

  return {
    detail: `Vector round-trip OK: insert → vector_top_k → found (similarity: ${Number(similarity).toFixed(4)})`,
    data: { similarity, resultsCount: searchResult.rows.length },
  };
}

async function testYtDlpEnumeration(): Promise<{
  detail: string;
  data?: any;
}> {
  // Test yt-dlp with a small sample from @LatentSpacePod
  const cmd = `yt-dlp --flat-playlist --print "%(id)s|%(title)s" "https://www.youtube.com/@LatentSpacePod/videos" 2>/dev/null | head -5`;
  const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
  const lines = output.split('\n').filter(Boolean);

  if (lines.length === 0) {
    throw new Error('yt-dlp returned no results');
  }

  const videos = lines.map((line) => {
    const [id, ...titleParts] = line.split('|');
    return { id, title: titleParts.join('|') };
  });

  // Also test LatentSpaceTV
  const cmd2 = `yt-dlp --flat-playlist --print "%(id)s|%(title)s" "https://www.youtube.com/@LatentSpaceTV/videos" 2>/dev/null | head -3`;
  const output2 = execSync(cmd2, { encoding: 'utf-8', timeout: 30000 }).trim();
  const tvCount = output2.split('\n').filter(Boolean).length;

  return {
    detail: `yt-dlp: @LatentSpacePod sample=${videos.length} videos, @LatentSpaceTV sample=${tvCount} videos`,
    data: {
      podcastSample: videos,
      tvSampleCount: tvCount,
    },
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  PRD-05 Content Ingestion Pipeline — Smoke Test  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const results: TestResult[] = [];

  // 1. Turso connection
  console.log('── Database ──');
  results.push(await runTest('Turso connection + schema', testTursoConnection));
  printResult(results[results.length - 1]);

  // 2. YouTube extraction (podcast)
  console.log('\n── Content Extraction ──');
  results.push(
    await runTest('YouTube transcript (podcast)', () =>
      testYouTubeExtraction(
        TEST_SAMPLES.podcast.url,
        TEST_SAMPLES.podcast.label
      )
    )
  );
  printResult(results[results.length - 1]);

  // 3. YouTube extraction (LatentSpaceTV)
  results.push(
    await runTest('YouTube transcript (LatentSpaceTV)', () =>
      testYouTubeExtraction(
        TEST_SAMPLES.latentspacetv.url,
        TEST_SAMPLES.latentspacetv.label
      )
    )
  );
  printResult(results[results.length - 1]);

  // 4. Substack article extraction
  results.push(
    await runTest('Substack article extraction', testSubstackExtraction)
  );
  printResult(results[results.length - 1]);

  // 5. AI News markdown parsing
  results.push(
    await runTest('AI News markdown + frontmatter', testAINewsMarkdownParsing)
  );
  printResult(results[results.length - 1]);

  // 6. OpenAI embeddings
  console.log('\n── Embedding ──');
  results.push(await runTest('OpenAI text-embedding-3-small', testOpenAIEmbedding));
  printResult(results[results.length - 1]);

  // 7. Turso vector round-trip
  results.push(
    await runTest('Turso vector round-trip (insert → search)', testTursoVectorRoundtrip)
  );
  printResult(results[results.length - 1]);

  // 8. yt-dlp enumeration
  console.log('\n── Enumeration ──');
  results.push(await runTest('yt-dlp channel enumeration', testYtDlpEnumeration));
  printResult(results[results.length - 1]);

  // Summary
  const passed = results.filter((r) => r.passed && !r.skipped).length;
  const failed = results.filter((r) => !r.passed && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const total = results.length;

  console.log('\n══════════════════════════════════════════════════');
  console.log(
    `  Results: ${passed}/${total} passed${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''}`
  );
  console.log('══════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Failed tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  ${FAIL} ${r.name}: ${r.detail}`));
    console.log('');
  }

  // Print detailed data for passed tests
  console.log('── Detailed Results ──\n');
  for (const r of results) {
    if (r.data) {
      console.log(`${r.name}:`);
      console.log(JSON.stringify(r.data, null, 2).split('\n').map(l => `  ${l}`).join('\n'));
      console.log('');
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
