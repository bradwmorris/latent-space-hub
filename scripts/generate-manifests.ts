/**
 * PRD-05 Phase 0: Generate content manifests for all 4 sources.
 *
 * Usage:
 *   npx tsx scripts/generate-manifests.ts                    # all sources
 *   npx tsx scripts/generate-manifests.ts --source podcasts  # single source
 *   npx tsx scripts/generate-manifests.ts --seed-dimensions  # import seed dims from ainews
 *
 * Outputs:
 *   scripts/data/manifest-podcasts.json
 *   scripts/data/manifest-articles.json
 *   scripts/data/manifest-ainews.json
 *   scripts/data/manifest-latentspacetv.json
 *   scripts/data/seed-dimensions.json
 *   scripts/data/blocklist-nontopics.json
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, 'data');
const SINCE = '2025-01-01';
const AINEWS_REPO = 'https://github.com/smol-ai/ainews-web-2025';
const AINEWS_TMP = '/tmp/ainews-manifest';

// ── Shared types ────────────────────────────────────────────────────────────

interface ManifestEntry {
  id: string;
  title: string;
  date: string;
  url: string;
  source_type: string;
  available: 'yes' | 'paywalled' | 'unknown';
  // Source-specific
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

// ── YouTube helpers ─────────────────────────────────────────────────────────

function enumerateYouTubeChannel(
  channelUrl: string,
  sinceDate: string
): ManifestEntry[] {
  console.log(`  Fetching metadata from ${channelUrl} (this may take a few minutes)...`);

  // Use yt-dlp with full metadata extraction to get upload dates
  const cmd = `yt-dlp --flat-playlist --print "%(id)s\t%(title)s\t%(upload_date)s\t%(duration_string)s\t%(description).200s" "${channelUrl}/videos" 2>/dev/null`;

  let output: string;
  try {
    output = execSync(cmd, { encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
  } catch (err: any) {
    // yt-dlp --flat-playlist doesn't always return dates; fall back to slower method
    console.log('  Flat playlist lacks dates, falling back to full metadata...');
    const fallbackCmd = `yt-dlp --no-download --print "%(id)s\t%(title)s\t%(upload_date)s\t%(duration_string)s\t%(description).200s" "${channelUrl}/videos" 2>/dev/null`;
    output = execSync(fallbackCmd, {
      encoding: 'utf-8',
      timeout: 900000, // 15 min
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  const sinceTs = new Date(sinceDate).getTime();
  const entries: ManifestEntry[] = [];

  for (const line of output.trim().split('\n')) {
    if (!line.trim()) continue;
    const [id, title, uploadDate, duration, description] = line.split('\t');

    // Parse date: yt-dlp returns YYYYMMDD format
    let isoDate = '';
    if (uploadDate && uploadDate !== 'NA') {
      isoDate = `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}`;
    }

    // Filter by date
    if (isoDate && new Date(isoDate).getTime() < sinceTs) continue;

    entries.push({
      id: `yt-${id}`,
      title: title || '',
      date: isoDate,
      url: `https://www.youtube.com/watch?v=${id}`,
      source_type: 'youtube',
      available: 'yes',
      video_id: id,
      duration: duration || undefined,
      description: description || undefined,
    });
  }

  return entries;
}

function classifyLatentSpaceTVSeries(
  title: string
): 'builders-club' | 'paper-club' | 'meetup' {
  const lower = title.toLowerCase();
  if (lower.includes('paper club') || lower.includes('paperclub')) return 'paper-club';
  if (lower.includes('builders club') || lower.includes('buildersclub')) return 'builders-club';
  return 'meetup';
}

// ── Podcasts (@LatentSpacePod) ──────────────────────────────────────────────

function generatePodcastManifest(): ManifestEntry[] {
  console.log('\n📻 Generating podcast manifest (@LatentSpacePod)...');
  const entries = enumerateYouTubeChannel(
    'https://www.youtube.com/@LatentSpacePod',
    SINCE
  );
  // Tag as podcast
  for (const e of entries) {
    e.source_type = 'podcast';
    e.series = 'latent-space-podcast';
  }
  console.log(`  Found ${entries.length} episodes since ${SINCE}`);
  return entries;
}

// ── LatentSpaceTV ───────────────────────────────────────────────────────────

function generateLatentSpaceTVManifest(): ManifestEntry[] {
  console.log('\n📺 Generating LatentSpaceTV manifest (@LatentSpaceTV)...');
  const entries = enumerateYouTubeChannel(
    'https://www.youtube.com/@LatentSpaceTV',
    SINCE
  );
  // Classify by series
  for (const e of entries) {
    e.series = classifyLatentSpaceTVSeries(e.title);
    e.source_type = `latentspacetv-${e.series}`;
  }
  const seriesCounts = entries.reduce(
    (acc, e) => {
      acc[e.series!] = (acc[e.series!] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  console.log(`  Found ${entries.length} videos since ${SINCE}:`, seriesCounts);
  return entries;
}

// ── Substack Articles ───────────────────────────────────────────────────────

async function generateArticleManifest(): Promise<ManifestEntry[]> {
  console.log('\n📝 Generating article manifest (latent.space Substack)...');

  // Fetch sitemap
  const response = await fetch('https://www.latent.space/sitemap.xml');
  if (!response.ok) throw new Error(`Sitemap fetch failed: ${response.status}`);
  const xml = await response.text();

  // Parse URLs and dates from sitemap
  const urlPattern = /<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?/g;
  const entries: ManifestEntry[] = [];
  const sinceTs = new Date(SINCE).getTime();

  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(xml)) !== null) {
    const url = match[1];
    const lastmod = match[2] || '';

    // Only include /p/ URLs (actual posts)
    if (!url.includes('/p/')) continue;

    // Extract slug from URL
    const slug = url.split('/p/')[1]?.replace(/\/$/, '') || '';
    if (!slug) continue;

    // Filter by date if available
    if (lastmod) {
      const modDate = new Date(lastmod);
      if (modDate.getTime() < sinceTs) continue;
    }

    entries.push({
      id: `article-${slug}`,
      title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      date: lastmod ? lastmod.split('T')[0] : '',
      url,
      source_type: 'article',
      slug,
      available: 'unknown', // Can't tell paywalled from sitemap alone
    });
  }

  console.log(`  Found ${entries.length} articles since ${SINCE}`);
  return entries;
}

// ── AI News ─────────────────────────────────────────────────────────────────

function parseYamlArray(frontmatter: string, key: string): string[] {
  // Try inline format: key: [a, b, c]
  const inlineMatch = frontmatter.match(new RegExp(`${key}:\\s*\\[([^\\]]*?)\\]`));
  if (inlineMatch && inlineMatch[1].trim()) {
    return inlineMatch[1]
      .split(',')
      .map(s => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);
  }
  // Try multi-line format: key:\n  - a\n  - b
  const blockMatch = frontmatter.match(
    new RegExp(`${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`)
  );
  if (blockMatch) {
    return blockMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim().replace(/['"]/g, ''))
      .filter(Boolean);
  }
  return [];
}

function generateAINewsManifest(): ManifestEntry[] {
  console.log('\n📰 Generating AI News manifest (smol-ai/ainews-web-2025)...');

  // Clone repo
  execSync(`rm -rf ${AINEWS_TMP}`, { stdio: 'pipe' });
  console.log('  Cloning ainews repo...');
  execSync(`git clone --depth 1 ${AINEWS_REPO} ${AINEWS_TMP}`, {
    stdio: 'pipe',
    timeout: 60000,
  });

  const issueDir = `${AINEWS_TMP}/src/content/issues`;
  const files = fs.readdirSync(issueDir).filter(f => f.endsWith('.md'));
  const sinceTs = new Date(SINCE).getTime();
  const entries: ManifestEntry[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(issueDir, file), 'utf-8');
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;

    const fm = fmMatch[1];
    const titleMatch = fm.match(/title:\s*["']?(.*?)["']?\s*$/m);
    const dateMatch = fm.match(/date:\s*["']?(.*?)["']?\s*$/m);

    const title = titleMatch?.[1] || file.replace('.md', '');
    const rawDate = dateMatch?.[1] || '';
    const isoDate = rawDate ? rawDate.split('T')[0] : '';

    // Filter by date
    if (isoDate && new Date(isoDate).getTime() < sinceTs) continue;

    const slug = file.replace('.md', '');
    const companies = parseYamlArray(fm, 'companies');
    const models = parseYamlArray(fm, 'models');
    const topics = parseYamlArray(fm, 'topics');
    const people = parseYamlArray(fm, 'people');

    entries.push({
      id: `ainews-${slug}`,
      title: `[AINews] ${title}`,
      date: isoDate,
      url: `https://news.smol.ai/issues/${slug}`,
      source_type: 'newsletter',
      slug,
      available: 'yes',
      frontmatter_entities: { companies, models, topics, people },
    });
  }

  // Sort by date descending
  entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  console.log(`  Found ${entries.length} issues since ${SINCE}`);

  // Don't clean up yet — seed dimensions will read from same clone
  return entries;
}

// ── Seed Dimensions from ainews ─────────────────────────────────────────────

function extractSeedDimensions(): {
  dimensions: string[];
  blocklist: string[];
} {
  console.log('\n🏷️  Extracting seed dimensions from ainews preferredTags...');

  const tagsPath = `${AINEWS_TMP}/oneoffs/preferredTags.ts`;
  if (!fs.existsSync(tagsPath)) {
    console.log('  ⚠ preferredTags.ts not found, searching...');
    const found = execSync(`find ${AINEWS_TMP} -name "preferredTags*" 2>/dev/null`, {
      encoding: 'utf-8',
    }).trim();
    console.log('  Found at:', found || 'NOT FOUND');
    if (!found) return { dimensions: [], blocklist: [] };
  }

  const content = fs.readFileSync(tagsPath, 'utf-8');

  // Parse exported arrays from TypeScript
  const parseExportedArray = (varName: string): string[] => {
    const pattern = new RegExp(
      `(?:export\\s+)?(?:const|let|var)\\s+${varName}\\s*(?::\\s*string\\[\\])?\\s*=\\s*\\[([\\s\\S]*?)\\]`,
      'm'
    );
    const match = content.match(pattern);
    if (!match) return [];
    return match[1]
      .split(',')
      .map(s => s.trim().replace(/['"]/g, '').trim())
      .filter(s => s.length > 0 && !s.startsWith('//'));
  };

  const companies = parseExportedArray('prefCompanies');
  const models = parseExportedArray('prefModels');
  const topics = parseExportedArray('prefTopics');
  const people = parseExportedArray('prefPeople');
  const nonTopics = parseExportedArray('nonTopics');

  console.log(`  Companies: ${companies.length}, Models: ${models.length}, Topics: ${topics.length}, People: ${people.length}`);
  console.log(`  NonTopics blocklist: ${nonTopics.length}`);

  // Combine all into flat dimension list
  const allTags = [...companies, ...models, ...topics, ...people];

  // Normalize: lowercase-hyphenated, deduplicate
  const normalizeTag = (tag: string): string =>
    tag.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Known dedup mappings
  const dedup: Record<string, string> = {
    'hugging-face': 'huggingface',
    'google-deepmind': 'deepmind',
    'mistral-ai': 'mistral',
    'perplexity-ai': 'perplexity',
  };

  const normalized = new Set<string>();
  const blocklistSet = new Set(nonTopics.map(normalizeTag));

  for (const tag of allTags) {
    let norm = normalizeTag(tag);
    if (dedup[norm]) norm = dedup[norm];
    if (norm && !blocklistSet.has(norm)) {
      normalized.add(norm);
    }
  }

  const dimensions = [...normalized].sort();
  const blocklist = [...blocklistSet].sort();

  console.log(`  After dedup + blocklist: ${dimensions.length} dimensions`);

  return { dimensions, blocklist };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1]
    || (args.includes('--source') ? args[args.indexOf('--source') + 1] : null);
  const seedOnly = args.includes('--seed-dimensions');

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  PRD-05 Phase 0: Generate Content Manifests      ║');
  console.log('╚══════════════════════════════════════════════════╝');

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const sources = sourceArg ? [sourceArg] : ['podcasts', 'articles', 'ainews', 'latentspacetv'];

  // AI News needs to be done first (or alongside) for seed dimensions
  if (sources.includes('ainews') || seedOnly) {
    const ainewsEntries = generateAINewsManifest();
    if (sources.includes('ainews')) {
      fs.writeFileSync(
        path.join(DATA_DIR, 'manifest-ainews.json'),
        JSON.stringify(ainewsEntries, null, 2)
      );
      console.log(`  → Wrote manifest-ainews.json (${ainewsEntries.length} entries)`);
    }

    // Always extract seed dimensions when processing ainews
    const { dimensions, blocklist } = extractSeedDimensions();
    fs.writeFileSync(
      path.join(DATA_DIR, 'seed-dimensions.json'),
      JSON.stringify(dimensions, null, 2)
    );
    fs.writeFileSync(
      path.join(DATA_DIR, 'blocklist-nontopics.json'),
      JSON.stringify(blocklist, null, 2)
    );
    console.log(`  → Wrote seed-dimensions.json (${dimensions.length} dimensions)`);
    console.log(`  → Wrote blocklist-nontopics.json (${blocklist.length} terms)`);

    // Clean up ainews clone
    execSync(`rm -rf ${AINEWS_TMP}`, { stdio: 'pipe' });
  }

  if (sources.includes('podcasts') && !seedOnly) {
    const podcastEntries = generatePodcastManifest();
    fs.writeFileSync(
      path.join(DATA_DIR, 'manifest-podcasts.json'),
      JSON.stringify(podcastEntries, null, 2)
    );
    console.log(`  → Wrote manifest-podcasts.json (${podcastEntries.length} entries)`);
  }

  if (sources.includes('latentspacetv') && !seedOnly) {
    const tvEntries = generateLatentSpaceTVManifest();
    fs.writeFileSync(
      path.join(DATA_DIR, 'manifest-latentspacetv.json'),
      JSON.stringify(tvEntries, null, 2)
    );
    console.log(`  → Wrote manifest-latentspacetv.json (${tvEntries.length} entries)`);
  }

  if (sources.includes('articles') && !seedOnly) {
    const articleEntries = await generateArticleManifest();
    fs.writeFileSync(
      path.join(DATA_DIR, 'manifest-articles.json'),
      JSON.stringify(articleEntries, null, 2)
    );
    console.log(`  → Wrote manifest-articles.json (${articleEntries.length} entries)`);
  }

  console.log('\n✓ Manifest generation complete.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
