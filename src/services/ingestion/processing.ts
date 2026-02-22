import Anthropic from '@anthropic-ai/sdk';
import { edgeService, nodeService } from '@/services/database';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { embedNodeContent } from '@/services/embedding/ingestion';
import { extractWebsite } from '@/services/typescript/extractors/website';
import { extractYouTube } from '@/services/typescript/extractors/youtube';
import { NodeType } from '@/types/database';
import { DiscoveredItem, IngestionSourceKey, SOURCES, classifyLatentSpaceTV } from './sources';

interface ExtractedContent {
  title: string;
  chunk: string;
  publishedAt?: string;
  metadata: Record<string, unknown>;
}

export interface ProcessItemResult {
  source: IngestionSourceKey;
  itemId: string;
  title: string;
  status: 'ingested' | 'skipped' | 'failed' | 'dry_run';
  nodeId?: number;
  chunksCreated?: number;
  message?: string;
  nodeType?: NodeType;
  url: string;
  publishedAt?: string;
}

interface EntityExtractionResult {
  people: string[];
  organizations: string[];
  topics: string[];
}

const ENTITY_BLOCKLIST = new Set([
  'ai',
  'llm',
  'ml',
  'tech',
  'product',
  'today',
  'week',
]);

const HOST_ALIAS_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bswixs\b/gi, replacement: 'swyx' },
  { pattern: /\bswix\b/gi, replacement: 'swyx' },
  { pattern: /\bswitz\b/gi, replacement: 'swyx' },
  { pattern: /\balesio\b/gi, replacement: 'Alessio' },
  { pattern: /\ballesio\b/gi, replacement: 'Alessio' },
  { pattern: /\ballesop\b/gi, replacement: 'Alessio' },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await sleep(2 ** attempt * 1000);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Retry failed');
}

function cleanEntity(name: string): string {
  let value = name;
  for (const rule of HOST_ALIAS_REPLACEMENTS) {
    value = value.replace(rule.pattern, rule.replacement);
  }
  return value.replace(/\s+/g, ' ').trim();
}

function buildDescription(title: string, chunk: string): string {
  const preview = cleanEntity(chunk).replace(/\s+/g, ' ').trim().slice(0, 500);
  return `${title}${preview ? `\n\n${preview}` : ''}`;
}

function parseDate(input?: string): string | undefined {
  if (!input) return undefined;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

async function findExistingNodeByLink(link: string): Promise<number | null> {
  const sqlite = getSQLiteClient();
  const result = await sqlite.query<{ id: number }>('SELECT id FROM nodes WHERE link = ? LIMIT 1', [link]);
  return result.rows[0]?.id || null;
}

async function findExistingAinewsByTitle(title: string): Promise<number | null> {
  const sqlite = getSQLiteClient();
  const result = await sqlite.query<{ id: number }>(
    "SELECT id FROM nodes WHERE node_type = 'ainews' AND LOWER(title) = LOWER(?) LIMIT 1",
    [title]
  );
  return result.rows[0]?.id || null;
}

async function findOrCreateEntity(title: string, entityType: 'person' | 'organization' | 'topic'): Promise<number> {
  const normalized = cleanEntity(title);
  if (!normalized) {
    throw new Error('Entity title is empty');
  }

  const sqlite = getSQLiteClient();
  const existing = await sqlite.query<{ id: number }>(
    "SELECT id FROM nodes WHERE LOWER(title) = LOWER(?) AND node_type = 'entity' LIMIT 1",
    [normalized]
  );
  if (existing.rows.length > 0) {
    return Number(existing.rows[0].id);
  }

  const node = await nodeService.createNode({
    title: normalized,
    node_type: 'entity',
    dimensions: ['entity'],
    description: `${entityType} extracted from auto-ingestion`,
    metadata: {
      entity_type: entityType,
      extraction_method: 'auto-ingestion-v1',
    },
  });

  return node.id;
}

async function ensureEdge(fromNodeId: number, toNodeId: number, explanation: string): Promise<void> {
  const exists = await edgeService.edgeExists(fromNodeId, toNodeId);
  if (exists) return;
  await edgeService.createEdge({
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    explanation,
    created_via: 'workflow',
    source: 'ai_similarity',
  });
}

async function extractEntitiesWithClaude(title: string, description: string, chunk: string): Promise<EntityExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { people: [], organizations: [], topics: [] };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const normalizedTitle = cleanEntity(title);
  const normalizedDescription = cleanEntity(description);
  const normalizedChunk = cleanEntity(chunk);

  const prompt = [
    'Extract prominent entities from this content. Return strict JSON only.',
    'Schema: {"people": string[], "organizations": string[], "topics": string[]}',
    'Rules:',
    '- Only include entities that are clearly central, not incidental mentions.',
    '- Keep names in normal capitalization.',
    '- Keep topics short (1-4 words).',
    '- Canonicalize host aliases to: swyx, Alessio.',
    '',
    `Title: ${normalizedTitle}`,
    `Description: ${normalizedDescription}`,
    `Content sample: ${normalizedChunk.slice(0, 2500)}`,
  ].join('\n');

  const response = await withRetry(async () => {
    return client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });
  });

  const textContent = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim();

  const jsonText = textContent.match(/\{[\s\S]*\}/)?.[0] || '{}';
  const parsed = JSON.parse(jsonText) as Partial<EntityExtractionResult>;

  const dedupe = (arr: string[] | undefined): string[] => {
    if (!arr) return [];
    return [...new Set(arr.map(cleanEntity).filter(Boolean))].filter((value) => {
      return !ENTITY_BLOCKLIST.has(value.toLowerCase());
    });
  };

  return {
    people: dedupe(parsed.people),
    organizations: dedupe(parsed.organizations),
    topics: dedupe(parsed.topics),
  };
}

async function extractForSource(source: IngestionSourceKey, item: DiscoveredItem): Promise<ExtractedContent> {
  if (source === 'podcasts' || source === 'latentspacetv') {
    const extracted = await withRetry(async () => extractYouTube(item.url));
    if (!extracted.success) {
      throw new Error(extracted.error || 'YouTube extraction failed');
    }

    return {
      title: extracted.metadata.video_title || item.title,
      chunk: extracted.chunk,
      publishedAt: parseDate(item.publishedAt),
      metadata: {
        ...SOURCES[source].metadata,
        video_id: extracted.metadata.video_id,
        channel_name: extracted.metadata.channel_name,
        channel_url: extracted.metadata.channel_url,
        extraction_method: 'auto-ingestion-v1',
      },
    };
  }

  if (source === 'articles') {
    const extracted = await withRetry(async () => extractWebsite(item.url));
    if (!extracted.chunk || extracted.chunk.trim().length < 100) {
      throw new Error('Article body too short (possible paywall)');
    }

    return {
      title: extracted.metadata.title || item.title,
      chunk: extracted.chunk,
      publishedAt: parseDate(item.publishedAt || extracted.metadata.date),
      metadata: {
        ...SOURCES[source].metadata,
        author: extracted.metadata.author,
        extraction_method: 'auto-ingestion-v1',
      },
    };
  }

  if (source === 'ainews') {
    const extracted = await withRetry(async () => extractWebsite(item.url));
    if (!extracted.chunk || extracted.chunk.trim().length < 100) {
      throw new Error('AINews body too short (possible parse failure)');
    }

    return {
      title: extracted.metadata.title || item.title,
      chunk: extracted.chunk,
      publishedAt: parseDate(item.publishedAt || extracted.metadata.date),
      metadata: {
        ...SOURCES[source].metadata,
        author: extracted.metadata.author,
        extraction_method: 'auto-ingestion-v1',
      },
    };
  }

  throw new Error(`Unsupported source: ${source}`);
}

async function extractEntitiesForNode(params: {
  nodeId: number;
  nodeType: NodeType;
  title: string;
  description: string;
  chunk: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { nodeId, nodeType, title, description, chunk, metadata } = params;

  let entities: EntityExtractionResult = { people: [], organizations: [], topics: [] };

  if (nodeType === 'ainews') {
    const frontmatter = metadata.frontmatter_entities as
      | { companies?: string[]; models?: string[]; topics?: string[]; people?: string[] }
      | undefined;
    const hasFrontmatter =
      Boolean(frontmatter?.people?.length) ||
      Boolean(frontmatter?.companies?.length) ||
      Boolean(frontmatter?.topics?.length) ||
      Boolean(frontmatter?.models?.length);
    if (hasFrontmatter) {
      entities = {
        people: (frontmatter?.people || []).map(cleanEntity),
        organizations: (frontmatter?.companies || []).map(cleanEntity),
        topics: [...(frontmatter?.topics || []), ...(frontmatter?.models || [])].map(cleanEntity),
      };
    } else {
      entities = await extractEntitiesWithClaude(title, description, chunk);
    }
  } else {
    entities = await extractEntitiesWithClaude(title, description, chunk);
  }

  const uniquePeople = [...new Set(entities.people)].filter(Boolean);
  const uniqueOrganizations = [...new Set(entities.organizations)].filter(Boolean);
  const uniqueTopics = [...new Set(entities.topics)].filter(Boolean);

  for (const person of uniquePeople) {
    const personId = await findOrCreateEntity(person, 'person');
    if (nodeType === 'podcast' || nodeType === 'builders-club' || nodeType === 'paper-club' || nodeType === 'workshop') {
      await ensureEdge(personId, nodeId, `appeared on ${title}`);
    } else {
      await ensureEdge(nodeId, personId, `covers ${person}`);
    }
  }

  for (const org of uniqueOrganizations) {
    const orgId = await findOrCreateEntity(org, 'organization');
    await ensureEdge(nodeId, orgId, `covers ${org}`);
  }

  for (const topic of uniqueTopics) {
    const topicId = await findOrCreateEntity(topic, 'topic');
    await ensureEdge(nodeId, topicId, `covers ${topic}`);
  }
}

function targetNodeTypeAndDimensions(source: IngestionSourceKey, title: string): {
  nodeType: NodeType;
  dimensions: string[];
  metadataExtra: Record<string, unknown>;
} {
  if (source === 'latentspacetv') {
    const classified = classifyLatentSpaceTV(title);
    return {
      nodeType: classified.nodeType,
      dimensions: classified.dimensions,
      metadataExtra: classified.series ? { series: classified.series } : {},
    };
  }

  const sourceConfig = SOURCES[source];
  return {
    nodeType: sourceConfig.nodeType,
    dimensions: sourceConfig.dimensions,
    metadataExtra: {},
  };
}

export async function processDiscoveredItem(params: {
  source: IngestionSourceKey;
  item: DiscoveredItem;
  dryRun?: boolean;
}): Promise<ProcessItemResult> {
  const { source, item, dryRun = false } = params;

  const existingByLink = await findExistingNodeByLink(item.url);
  if (existingByLink) {
    return {
      source,
      itemId: item.id,
      title: item.title,
      status: 'skipped',
      message: `Already exists (node ${existingByLink})`,
      url: item.url,
      publishedAt: item.publishedAt,
    };
  }

  if (source === 'ainews') {
    const existingByTitle = await findExistingAinewsByTitle(item.title);
    if (existingByTitle) {
      return {
        source,
        itemId: item.id,
        title: item.title,
        status: 'skipped',
        message: `Already exists by title (node ${existingByTitle})`,
        url: item.url,
        publishedAt: item.publishedAt,
      };
    }
  }

  if (dryRun) {
    return {
      source,
      itemId: item.id,
      title: item.title,
      status: 'dry_run',
      message: 'Discovered new item (dry run)',
      url: item.url,
      publishedAt: item.publishedAt,
    };
  }

  try {
    const extracted = await extractForSource(source, item);
    const { nodeType, dimensions, metadataExtra } = targetNodeTypeAndDimensions(source, extracted.title);
    const description = buildDescription(extracted.title, extracted.chunk);

    const node = await nodeService.createNode({
      title: extracted.title,
      node_type: nodeType,
      description,
      link: item.url,
      chunk: extracted.chunk,
      chunk_status: 'not_chunked',
      event_date: extracted.publishedAt || parseDate(item.publishedAt),
      dimensions,
      metadata: {
        ...extracted.metadata,
        ...metadataExtra,
      },
    });

    const embeddingResult = await embedNodeContent(node.id);
    const chunksCreated = embeddingResult.chunk_embeddings.chunks_created || 0;

    // Entity extraction should not fail the entire ingestion run.
    try {
      await extractEntitiesForNode({
        nodeId: node.id,
        nodeType,
        title: node.title,
        description,
        chunk: extracted.chunk,
        metadata: (node.metadata || {}) as Record<string, unknown>,
      });
    } catch (error) {
      console.warn('[ingestion] Entity extraction failed; continuing without entities', error);
    }

    return {
      source,
      itemId: item.id,
      title: node.title,
      status: 'ingested',
      nodeId: node.id,
      chunksCreated,
      nodeType,
      url: item.url,
      publishedAt: extracted.publishedAt,
    };
  } catch (error) {
    return {
      source,
      itemId: item.id,
      title: item.title,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Unknown ingestion failure',
      url: item.url,
      publishedAt: item.publishedAt,
    };
  }
}
