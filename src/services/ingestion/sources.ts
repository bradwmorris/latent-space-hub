export type IngestionSourceKey = 'podcasts' | 'latentspacetv' | 'articles' | 'ainews';

type SourceType = 'youtube_rss' | 'substack_rss' | 'github_rss' | 'github_api';

export interface IngestionSourceConfig {
  key: IngestionSourceKey;
  name: string;
  type: SourceType;
  feedUrl?: string;
  apiUrl?: string;
  nodeType: 'podcast' | 'article' | 'ainews' | 'workshop';
  dimensions: string[];
  metadata: Record<string, unknown>;
  seriesDetection?: boolean;
}

export interface DiscoveredItem {
  source: IngestionSourceKey;
  id: string;
  title: string;
  url: string;
  publishedAt?: string;
  excerpt?: string;
  slug?: string;
}

const LATENT_SPACE_PODCAST_CHANNEL_ID =
  process.env.LATENTSPACE_PODCAST_CHANNEL_ID || 'UCQMbwBMmIRCCRDB2AlrO6bA';
const LATENT_SPACE_TV_CHANNEL_ID =
  process.env.LATENTSPACETV_CHANNEL_ID || process.env.LATENT_SPACE_TV_CHANNEL_ID || '';

export const SOURCES: Record<IngestionSourceKey, IngestionSourceConfig> = {
  podcasts: {
    key: 'podcasts',
    name: 'Latent Space Podcast',
    type: 'youtube_rss',
    feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${LATENT_SPACE_PODCAST_CHANNEL_ID}`,
    nodeType: 'podcast',
    dimensions: ['podcast'],
    metadata: { series: 'latent-space-podcast' },
  },
  latentspacetv: {
    key: 'latentspacetv',
    name: 'LatentSpaceTV',
    type: 'youtube_rss',
    feedUrl: LATENT_SPACE_TV_CHANNEL_ID
      ? `https://www.youtube.com/feeds/videos.xml?channel_id=${LATENT_SPACE_TV_CHANNEL_ID}`
      : undefined,
    nodeType: 'workshop',
    dimensions: ['workshop'],
    metadata: {},
    seriesDetection: true,
  },
  articles: {
    key: 'articles',
    name: 'Latent Space Blog',
    type: 'substack_rss',
    feedUrl: 'https://www.latent.space/feed',
    nodeType: 'article',
    dimensions: ['article'],
    metadata: { source_type: 'blog' },
  },
  ainews: {
    key: 'ainews',
    name: 'AI News',
    type: 'github_api',
    feedUrl: 'https://github.com/smol-ai/ainews-web-2025/commits/main.atom',
    apiUrl: 'https://api.github.com/repos/smol-ai/ainews-web-2025/contents/src/content/issues',
    nodeType: 'ainews',
    dimensions: ['ainews'],
    metadata: { source_type: 'newsletter' },
  },
};

export const SOURCE_KEYS: IngestionSourceKey[] = ['podcasts', 'latentspacetv', 'articles', 'ainews'];

export function classifyLatentSpaceTV(title: string): {
  nodeType: 'builders-club' | 'paper-club' | 'workshop';
  dimensions: string[];
  series?: string;
} {
  const normalized = title.toLowerCase();
  if (normalized.includes('builders club') || normalized.includes('builders-club')) {
    return { nodeType: 'builders-club', dimensions: ['builders-club'], series: 'builders-club' };
  }
  if (normalized.includes('paper club') || normalized.includes('paper-club')) {
    return { nodeType: 'paper-club', dimensions: ['paper-club'], series: 'paper-club' };
  }
  if (normalized.includes('meetup')) {
    return { nodeType: 'workshop', dimensions: ['workshop', 'meetup'], series: 'meetup' };
  }
  return { nodeType: 'workshop', dimensions: ['workshop'], series: 'latentspacetv' };
}
