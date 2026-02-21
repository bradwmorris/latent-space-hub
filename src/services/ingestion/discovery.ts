import { DiscoveredItem, IngestionSourceConfig, IngestionSourceKey, SOURCE_KEYS, SOURCES } from './sources';

function stripCdata(input: string): string {
  return input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function decodeXml(input: string): string {
  return stripCdata(input)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readTag(block: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  if (!match?.[1]) return undefined;
  return decodeXml(match[1]);
}

function readAttr(block: string, tag: string, attr: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"[^>]*>`, 'i');
  const match = block.match(regex);
  return match?.[1];
}

function parseIsoDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/xml,text/xml,text/plain,application/json',
      'User-Agent': 'latent-space-hub-ingestion/1.0',
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }
  return response.text();
}

async function discoverYouTube(source: IngestionSourceConfig): Promise<DiscoveredItem[]> {
  if (!source.feedUrl) return [];
  const xml = await fetchText(source.feedUrl);
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi));
  const items: DiscoveredItem[] = [];

  for (const entry of entries) {
    const block = entry[1];
    const videoId = readTag(block, 'yt:videoId');
    const title = readTag(block, 'title');
    const published = readTag(block, 'published');
    const href = readAttr(block, 'link', 'href');
    const url = href || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
    if (!videoId || !title || !url) continue;

    items.push({
      source: source.key,
      id: videoId,
      title,
      url,
      publishedAt: parseIsoDate(published),
    });
  }

  return items;
}

async function discoverRss(source: IngestionSourceConfig): Promise<DiscoveredItem[]> {
  if (!source.feedUrl) return [];
  const xml = await fetchText(source.feedUrl);
  const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi));
  const results: DiscoveredItem[] = [];

  for (const item of items) {
    const block = item[1];
    const title = readTag(block, 'title');
    const link = readTag(block, 'link');
    const pubDate = readTag(block, 'pubDate');
    const description = readTag(block, 'description');
    if (!title || !link) continue;

    results.push({
      source: source.key,
      id: link,
      title,
      url: link,
      publishedAt: parseIsoDate(pubDate),
      excerpt: description,
    });
  }

  return results;
}

interface GitHubContentFile {
  name: string;
  path: string;
  download_url?: string;
  html_url?: string;
  type: string;
}

async function discoverGitHub(source: IngestionSourceConfig): Promise<DiscoveredItem[]> {
  if (!source.apiUrl) return discoverGitHubAtomFallback(source);

  try {
    const response = await fetch(source.apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'latent-space-hub-ingestion/1.0',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      throw new Error(`GitHub API failed (${response.status})`);
    }

    const files = (await response.json()) as GitHubContentFile[];
    return files
      .filter((file) => file.type === 'file' && file.name.endsWith('.md'))
      .sort((a, b) => b.name.localeCompare(a.name))
      .map((file) => {
        const slug = file.name.replace(/\.md$/, '');
        return {
          source: source.key,
          id: slug,
          slug,
          title: slug,
          url: file.html_url || `https://github.com/smol-ai/ainews-web-2025/blob/main/${file.path}`,
          publishedAt: parseIsoDate(slug.slice(0, 10)),
        } satisfies DiscoveredItem;
      });
  } catch (error) {
    console.warn('[ingestion] GitHub contents API failed, falling back to atom feed', error);
    return discoverGitHubAtomFallback(source);
  }
}

async function discoverGitHubAtomFallback(source: IngestionSourceConfig): Promise<DiscoveredItem[]> {
  if (!source.feedUrl) return [];
  const xml = await fetchText(source.feedUrl);
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi));
  const results: DiscoveredItem[] = [];

  for (const entry of entries) {
    const block = entry[1];
    const id = readTag(block, 'id');
    const title = readTag(block, 'title');
    const published = readTag(block, 'updated') || readTag(block, 'published');
    const href = readAttr(block, 'link', 'href');
    if (!id || !title || !href) continue;

    results.push({
      source: source.key,
      id,
      title,
      url: href,
      publishedAt: parseIsoDate(published),
    });
  }

  return results;
}

export async function discoverSource(key: IngestionSourceKey): Promise<DiscoveredItem[]> {
  const source = SOURCES[key];
  if (!source) return [];

  switch (source.type) {
    case 'youtube_rss':
      return discoverYouTube(source);
    case 'substack_rss':
      return discoverRss(source);
    case 'github_api':
      return discoverGitHub(source);
    case 'github_rss':
      return discoverGitHubAtomFallback(source);
    default:
      return [];
  }
}

export async function discoverAll(): Promise<Record<IngestionSourceKey, DiscoveredItem[]>> {
  const result = {} as Record<IngestionSourceKey, DiscoveredItem[]>;
  for (const key of SOURCE_KEYS) {
    result[key] = await discoverSource(key);
  }
  return result;
}
