import { edgeService, nodeService } from '@/services/database';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { embedNodeContent } from '@/services/embedding/ingestion';
import {
  cleanEntity,
  ensureEdge,
  extractEntitiesForNode,
  generateContentDescription,
  withRetry,
} from '@/services/extraction/entityExtractor';
import { extractWebsite } from '@/services/typescript/extractors/website';
import { extractYouTube } from '@/services/typescript/extractors/youtube';
import { NodeType } from '@/types/database';
import { discoverSource } from './discovery';
import { clearFailure, hasRecentFailure, recordFailure } from './log';
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
  hasCompanion?: boolean;
  entityExtractionStatus?: 'success' | 'failed' | 'skipped';
  entityExtractionError?: string;
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

function stripTitlePrefixes(title: string): string {
  return title
    .replace(/^(ep\.?\s*\d+[:\s]*|episode\s*\d+[:\s]*)/i, '')
    .replace(/\s*[—–-]\s*with\s+.*$/i, '')
    .trim();
}

function titleWords(title: string): Set<string> {
  return new Set(
    stripTitlePrefixes(title)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function titleOverlapScore(a: string, b: string): number {
  const wordsA = titleWords(a);
  const wordsB = titleWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.min(wordsA.size, wordsB.size);
}

async function findCompanionNode(params: {
  nodeType: 'podcast' | 'article';
  title: string;
}): Promise<number | null> {
  const { nodeType, title } = params;
  const companionType = nodeType === 'article' ? 'podcast' : 'article';

  const sqlite = getSQLiteClient();
  const result = await sqlite.query<{ id: number; title: string }>(
    'SELECT id, title FROM nodes WHERE node_type = ? ORDER BY created_at DESC LIMIT 50',
    [companionType]
  );

  for (const row of result.rows) {
    const score = titleOverlapScore(title, row.title);
    if (score >= 0.5) {
      return Number(row.id);
    }
  }

  return null;
}

/**
 * When a Paper Club or Builders Club recording is ingested, find a matching
 * scheduled event node (within 3 days of the recording date) and link them.
 */
async function linkRecordingToEvent(recordingNodeId: number, nodeType: string, recordingDate?: string): Promise<boolean> {
  if (!recordingDate) return false;

  const sqlite = getSQLiteClient();
  const result = await sqlite.query<{ id: number; metadata: string }>(
    `SELECT id, metadata FROM nodes
     WHERE node_type = 'event'
       AND json_extract(metadata, '$.event_type') = ?
       AND json_extract(metadata, '$.event_status') = 'scheduled'
       AND event_date BETWEEN date(?, '-3 days') AND date(?, '+3 days')
     ORDER BY ABS(julianday(event_date) - julianday(?))
     LIMIT 1`,
    [nodeType, recordingDate, recordingDate, recordingDate]
  );

  if (result.rows.length === 0) return false;

  const eventRow = result.rows[0];
  const eventId = Number(eventRow.id);
  const label = nodeType === 'paper-club' ? 'Paper Club' : 'Builders Club';

  await ensureEdge(recordingNodeId, eventId, `recording of scheduled ${label} session`);

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(eventRow.metadata);
  } catch { /* use empty */ }
  metadata.event_status = 'completed';
  metadata.recording_node_id = recordingNodeId;

  await sqlite.query(
    'UPDATE nodes SET metadata = ?, updated_at = datetime() WHERE id = ?',
    [JSON.stringify(metadata), eventId]
  );

  console.log(`[ingestion] Linked ${label} recording node ${recordingNodeId} -> event node ${eventId}`);
  return true;
}

/**
 * Create a completed event node for a recording that had no prior scheduled event.
 */
async function createEventNodeForRecording(
  recordingNodeId: number,
  recordingNodeType: string,
  recordingTitle: string,
  recordingDate?: string,
): Promise<void> {
  const label = recordingNodeType === 'paper-club' ? 'Paper Club' : 'Builders Club';

  const eventNode = await nodeService.createNode({
    title: recordingTitle,
    node_type: 'event',
    description: `${label} session`,
    event_date: recordingDate,
    dimensions: ['event', recordingNodeType],
    metadata: {
      event_status: 'completed',
      event_type: recordingNodeType,
      recording_node_id: recordingNodeId,
    },
  });

  await ensureEdge(recordingNodeId, eventNode.id, `recording of ${label} session`);
  console.log(`[ingestion] Created event node ${eventNode.id} for ${label} recording ${recordingNodeId}`);
}

/**
 * Extract guest/topic portion from a podcast title.
 */
function extractGuestTokens(title: string): string[] {
  const afterDash = title.split(/\s[—–-]\s/).slice(1).join(' ');
  const text = (afterDash || title).toLowerCase();
  return text
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/**
 * Find a matching Substack article for a podcast episode.
 */
async function findMatchingSubstackArticle(podcastTitle: string): Promise<string | null> {
  try {
    const articles = await discoverSource('articles');
    const podcastTokens = extractGuestTokens(podcastTitle);
    if (podcastTokens.length === 0) return null;

    let bestMatch: { url: string; score: number } | null = null;

    for (const article of articles) {
      const articleTokens = extractGuestTokens(article.title);
      const overlap = podcastTokens.filter((t) => articleTokens.includes(t)).length;
      const score = overlap / Math.max(podcastTokens.length, 1);
      if (score > 0.5 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { url: article.url, score };
      }
    }

    return bestMatch?.url ?? null;
  } catch {
    return null;
  }
}

async function extractForSource(source: IngestionSourceKey, item: DiscoveredItem): Promise<ExtractedContent> {
  if (source === 'podcasts' || source === 'latentspacetv') {
    const extracted = await withRetry(async () => extractYouTube(item.url));
    if (extracted.success) {
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

    console.warn(`[ingestion] YouTube extraction failed for "${item.title}", trying Substack article fallback`);
    const articleUrl = await findMatchingSubstackArticle(item.title);
    if (articleUrl) {
      const articleExtracted = await withRetry(async () => extractWebsite(articleUrl));
      if (articleExtracted.chunk && articleExtracted.chunk.trim().length >= 100) {
        let videoMetadata: Record<string, unknown> = {};
        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(item.url)}&format=json`;
          const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
          if (oembedRes.ok) {
            const oembedData = await oembedRes.json();
            videoMetadata = {
              channel_name: oembedData.author_name,
              channel_url: oembedData.author_url,
            };
          }
        } catch { /* non-fatal */ }

        console.log(`[ingestion] Substack fallback succeeded for "${item.title}" from ${articleUrl}`);
        return {
          title: item.title,
          chunk: articleExtracted.chunk,
          publishedAt: parseDate(item.publishedAt),
          metadata: {
            ...SOURCES[source].metadata,
            ...videoMetadata,
            video_id: item.id,
            substack_url: articleUrl,
            extraction_method: 'auto-ingestion-substack-fallback',
          },
        };
      }
    }

    throw new Error(extracted.error || 'YouTube extraction failed and no matching Substack article found');
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

  // Skip URLs that recently failed extraction (exponential cooldown)
  const failure = await hasRecentFailure(item.url);
  if (failure.coolingDown) {
    return {
      source,
      itemId: item.id,
      title: item.title,
      status: 'skipped',
      message: `Cooling down after ${failure.failureCount} failure(s): ${failure.lastError || 'unknown error'}`,
      url: item.url,
      publishedAt: item.publishedAt,
    };
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

    // Generate a proper one-sentence description instead of title + preview
    const description = await generateContentDescription(extracted.title, nodeType, extracted.chunk);

    const eventStatusExtra: Record<string, unknown> =
      (nodeType === 'paper-club' || nodeType === 'builders-club')
        ? { event_status: 'recording' }
        : {};

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
        ...eventStatusExtra,
      },
    });

    // Clear any previous failure record — extraction succeeded
    await clearFailure(item.url);

    const embeddingResult = await embedNodeContent(node.id);
    const chunksCreated = embeddingResult.chunk_embeddings.chunks_created || 0;

    // Event linking: connect recordings to scheduled event nodes, or create event node
    if (nodeType === 'paper-club' || nodeType === 'builders-club') {
      try {
        const linked = await linkRecordingToEvent(node.id, nodeType, node.event_date || extracted.publishedAt);
        if (!linked) {
          await createEventNodeForRecording(node.id, nodeType, node.title, node.event_date || extracted.publishedAt);
        }
      } catch (error) {
        console.warn(`[ingestion] ${nodeType} event linking failed; continuing`, error);
      }
    }

    // Companion detection for podcast/article pairs
    let hasCompanion = false;
    if (nodeType === 'podcast' || nodeType === 'article') {
      try {
        const companionId = await findCompanionNode({ nodeType, title: node.title });
        if (companionId) {
          hasCompanion = true;
          const fromId = nodeType === 'article' ? node.id : companionId;
          const toId = nodeType === 'article' ? companionId : node.id;
          await ensureEdge(fromId, toId, 'companion article for podcast episode');
          console.log(`[ingestion] Linked companion: node ${node.id} (${nodeType}) ↔ node ${companionId}`);
        }
      } catch (error) {
        console.warn('[ingestion] Companion detection failed; continuing', error);
      }
    }

    // Entity extraction — should not fail entire ingestion
    let entityExtractionStatus: 'success' | 'failed' | 'skipped' = 'skipped';
    let entityExtractionError: string | undefined;
    try {
      await extractEntitiesForNode({
        nodeId: node.id,
        nodeType,
        title: node.title,
        chunk: extracted.chunk,
        metadata: (node.metadata || {}) as Record<string, unknown>,
      });
      entityExtractionStatus = 'success';
    } catch (error) {
      entityExtractionStatus = 'failed';
      entityExtractionError = error instanceof Error ? error.message : 'Unknown entity extraction error';
      console.error('[ingestion] Entity extraction FAILED for node', node.id, ':', entityExtractionError, error);

      // Write failed audit trail
      try {
        const sqlite = getSQLiteClient();
        const meta = (node.metadata || {}) as Record<string, unknown>;
        meta.entity_extraction = {
          status: 'failed',
          extracted_at: new Date().toISOString(),
          error: entityExtractionError,
        };
        await sqlite.query(
          'UPDATE nodes SET metadata = ?, updated_at = datetime() WHERE id = ?',
          [JSON.stringify(meta), node.id]
        );
      } catch { /* non-fatal */ }
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
      hasCompanion,
      entityExtractionStatus,
      entityExtractionError,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown ingestion failure';

    // Record failure so this URL is skipped on the next few cron runs
    await recordFailure(item.url, source, item.title, errorMessage);

    return {
      source,
      itemId: item.id,
      title: item.title,
      status: 'failed',
      message: errorMessage,
      url: item.url,
      publishedAt: item.publishedAt,
    };
  }
}
