/**
 * Generate content manifests for all 4 Latent Space sources.
 * Outputs JSON files to scripts/data/ for use by ingest.ts.
 *
 * Usage: npx tsx scripts/generate-manifests.ts
 *
 * Requirements:
 *   - yt-dlp installed (brew install yt-dlp)
 *   - Internet access for YouTube/Substack/GitHub
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function parseYamlArray(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  // Inline format: [a, b, c]
  if (trimmed.startsWith('[')) {
    return trimmed.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  // Multi-line YAML format:
  // - item1
  // - item2
  return trimmed.split('\n').map(l => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

// ── YouTube channel manifest via yt-dlp ──────────────────────────────────────

function generateYouTubeManifest(channelUrl: string, outputFile: string) {
  console.log(`Enumerating ${channelUrl}...`);
  const raw = execSync(
    `yt-dlp --print "%(id)s|||%(title)s|||%(upload_date)s|||%(duration)s|||%(description).200s" "${channelUrl}"`,
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, timeout: 900000 }
  );

  const entries = raw.trim().split('\n').filter(Boolean).map(line => {
    const [id, title, date, duration, desc] = line.split('|||');
    const isoDate = date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : '';
    let series = 'meetup';
    const tl = (title || '').toLowerCase();
    if (tl.includes('builders club') || tl.includes('buildersclub')) series = 'builders-club';
    else if (tl.includes('paper club') || tl.includes('paperclub')) series = 'paper-club';

    return {
      id: `yt-${id}`,
      video_id: id,
      title: title || '',
      date: isoDate,
      url: `https://www.youtube.com/watch?v=${id}`,
      duration: duration || '',
      description: (desc || '').trim(),
      series,
      source_type: 'youtube',
      available: 'public',
    };
  });

  fs.writeFileSync(path.join(DATA_DIR, outputFile), JSON.stringify(entries, null, 2));
  console.log(`  ${entries.length} entries -> ${outputFile}`);
  return entries;
}

// ── Substack articles from sitemap ───────────────────────────────────────────

async function generateArticlesManifest() {
  console.log('Fetching latent.space sitemap...');
  const resp = await fetch('https://www.latent.space/sitemap.xml');
  const xml = await resp.text();

  const urlPattern = /<loc>(https:\/\/www\.latent\.space\/p\/[^<]+)<\/loc>/g;
  const entries: any[] = [];
  let match;

  while ((match = urlPattern.exec(xml)) !== null) {
    const url = match[1];
    const slug = url.split('/p/')[1]?.split('?')[0] || '';
    if (!slug) continue;

    entries.push({
      id: `article-${slug}`,
      slug,
      title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      date: '',
      url,
      source_type: 'substack',
      available: 'public',
    });
  }

  fs.writeFileSync(path.join(DATA_DIR, 'manifest-articles.json'), JSON.stringify(entries, null, 2));
  console.log(`  ${entries.length} entries -> manifest-articles.json`);
}

// ── AI News from git repo ────────────────────────────────────────────────────

function generateAINewsManifest() {
  const tmpDir = '/tmp/ainews-manifest';
  execSync(`rm -rf ${tmpDir}`, { stdio: 'pipe' });
  console.log('Cloning ainews repo...');
  execSync(`git clone --depth 1 https://github.com/smol-ai/ainews-web-2025 ${tmpDir}`, { stdio: 'pipe', timeout: 60000 });

  const issuesDir = `${tmpDir}/src/content/issues`;
  const files = fs.readdirSync(issuesDir).filter(f => f.endsWith('.md'));
  const entries: any[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(`${issuesDir}/${file}`, 'utf-8');
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;

    const fm = fmMatch[1];
    const getField = (name: string): string => {
      const m = fm.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'));
      return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
    };
    const getArrayField = (name: string): string[] => {
      const m = fm.match(new RegExp(`^${name}:\\s*\\n([\\s\\S]*?)(?=^\\w|$(?!\\n))`, 'm'));
      if (m) return parseYamlArray(m[1]);
      const inline = fm.match(new RegExp(`^${name}:\\s*\\[([^\\]]+)\\]`, 'm'));
      if (inline) return parseYamlArray(`[${inline[1]}]`);
      return [];
    };

    const title = getField('headline') || getField('title') || file.replace('.md', '');
    const date = getField('date') || getField('pubDatetime') || '';
    const slug = file.replace('.md', '');

    entries.push({
      id: `ainews-${slug}`,
      slug,
      title: title.startsWith('[AINews]') ? title : `[AINews] ${title}`,
      date: date.split('T')[0],
      url: `https://buttondown.com/ainews/archive/${slug}`,
      source_type: 'ainews',
      available: 'public',
      frontmatter_entities: {
        companies: getArrayField('featureCompanies'),
        models: getArrayField('featureModels'),
        topics: getArrayField('featureTopics'),
        people: getArrayField('featurePeople'),
      },
    });
  }

  // Seed dimensions from preferredTags
  const tagsFile = `${tmpDir}/oneoffs/preferredTags.ts`;
  const seedDims: string[] = [];
  const blocklistTerms: string[] = [];

  if (fs.existsSync(tagsFile)) {
    const tagsContent = fs.readFileSync(tagsFile, 'utf-8');

    const extractArray = (varName: string): string[] => {
      const match = tagsContent.match(new RegExp(`${varName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
      if (!match) return [];
      return match[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
    };

    const companies = extractArray('prefCompanies');
    const models = extractArray('prefModels');
    const topics = extractArray('prefTopics');
    const people = extractArray('prefPeople');
    const nonTopics = extractArray('nonTopics');

    seedDims.push(...companies, ...models, ...topics, ...people);
    blocklistTerms.push(...nonTopics);
  }

  // Deduplicate
  const uniqueDims = [...new Set(seedDims.map(d => d.toLowerCase().replace(/\s+/g, '-')))].sort();
  const uniqueBlocklist = [...new Set(blocklistTerms.map(d => d.toLowerCase().replace(/\s+/g, '-')))].sort();

  fs.writeFileSync(path.join(DATA_DIR, 'manifest-ainews.json'), JSON.stringify(entries, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'seed-dimensions.json'), JSON.stringify(uniqueDims, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'blocklist-nontopics.json'), JSON.stringify(uniqueBlocklist, null, 2));

  console.log(`  ${entries.length} entries -> manifest-ainews.json`);
  console.log(`  ${uniqueDims.length} seed dimensions -> seed-dimensions.json`);
  console.log(`  ${uniqueBlocklist.length} blocklist terms -> blocklist-nontopics.json`);

  execSync(`rm -rf ${tmpDir}`, { stdio: 'pipe' });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n== Generate Manifests ==\n');

  // Podcasts
  generateYouTubeManifest('https://www.youtube.com/@LatentSpacePod', 'manifest-podcasts.json');

  // LatentSpaceTV
  generateYouTubeManifest('https://www.youtube.com/@LatentSpaceTV', 'manifest-latentspacetv.json');

  // Articles
  await generateArticlesManifest();

  // AI News + seed dimensions
  generateAINewsManifest();

  console.log('\nDone. Manifests in scripts/data/');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
