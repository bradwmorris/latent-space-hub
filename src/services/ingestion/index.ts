import { discoverSource } from './discovery';
import { completeIngestionRun, hasActiveRun, IngestionRunDetails, startIngestionRun } from './log';
import { notifyYap } from './notify';
import { ProcessItemResult, processDiscoveredItem } from './processing';
import { IngestionSourceKey, SOURCE_KEYS } from './sources';

export interface CheckAndIngestOptions {
  source?: IngestionSourceKey;
  dryRun?: boolean;
  maxDurationMs?: number;
  maxItemsPerSource?: number;
}

export interface CheckAndIngestSummary {
  runId: number;
  source: IngestionSourceKey | 'all';
  status: 'completed' | 'failed' | 'skipped';
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  itemsFailed: number;
  durationMs: number;
  details: IngestionRunDetails[];
  reason?: string;
}

function toRunDetail(item: ProcessItemResult): IngestionRunDetails {
  return {
    source: item.source,
    itemId: item.itemId,
    title: item.title,
    status: item.status,
    nodeId: item.nodeId,
    message: item.message,
    chunksCreated: item.chunksCreated,
  };
}

export async function checkAndIngest(options: CheckAndIngestOptions = {}): Promise<CheckAndIngestSummary> {
  const source = options.source || 'all';
  const dryRun = options.dryRun || false;
  const maxDurationMs = options.maxDurationMs || 55_000;
  const maxItemsPerSource = options.maxItemsPerSource || 10;

  if (await hasActiveRun(30)) {
    return {
      runId: 0,
      source,
      status: 'skipped',
      itemsFound: 0,
      itemsIngested: 0,
      itemsSkipped: 0,
      itemsFailed: 0,
      durationMs: 0,
      details: [],
      reason: 'Skipped because another ingestion run is still marked running',
    };
  }

  const runId = await startIngestionRun(source);
  const startedAt = Date.now();
  const details: IngestionRunDetails[] = [];

  let itemsFound = 0;
  let itemsIngested = 0;
  let itemsSkipped = 0;
  let itemsFailed = 0;

  try {
    const sourceKeys: IngestionSourceKey[] = options.source ? [options.source] : SOURCE_KEYS;

    for (const sourceKey of sourceKeys) {
      const discoveredItems = await discoverSource(sourceKey);
      const candidates = discoveredItems.slice(0, maxItemsPerSource);
      itemsFound += candidates.length;

      for (const item of candidates) {
        if (Date.now() - startedAt > maxDurationMs) {
          details.push({
            source: sourceKey,
            itemId: item.id,
            title: item.title,
            status: 'skipped',
            message: 'Skipped due to cron runtime budget limit',
          });
          itemsSkipped += 1;
          continue;
        }

        const result = await processDiscoveredItem({ source: sourceKey, item, dryRun });
        details.push(toRunDetail(result));

        if (result.status === 'ingested') {
          itemsIngested += 1;
          if (!dryRun && result.nodeType) {
            try {
              await notifyYap({
                title: result.title,
                nodeType: result.nodeType,
                chunksCreated: result.chunksCreated,
                publishedAt: result.publishedAt,
                url: result.url,
              });
            } catch (error) {
              console.warn('[ingestion] Failed to send Discord webhook', error);
            }
          }
        } else if (result.status === 'failed') {
          itemsFailed += 1;
        } else {
          itemsSkipped += 1;
        }
      }
    }

    await completeIngestionRun({
      runId,
      status: 'completed',
      itemsFound,
      itemsIngested,
      itemsSkipped,
      itemsFailed,
      details,
    });

    return {
      runId,
      source,
      status: 'completed',
      itemsFound,
      itemsIngested,
      itemsSkipped,
      itemsFailed,
      durationMs: Date.now() - startedAt,
      details,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingestion error';

    await completeIngestionRun({
      runId,
      status: 'failed',
      itemsFound,
      itemsIngested,
      itemsSkipped,
      itemsFailed: itemsFailed + 1,
      details,
      error: message,
    });

    return {
      runId,
      source,
      status: 'failed',
      itemsFound,
      itemsIngested,
      itemsSkipped,
      itemsFailed: itemsFailed + 1,
      durationMs: Date.now() - startedAt,
      details,
      reason: message,
    };
  }
}
