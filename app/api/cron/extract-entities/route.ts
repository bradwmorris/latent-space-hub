import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { edgeService, nodeService } from '@/services/database';
import { NodeType } from '@/types/database';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ENTITY_BLOCKLIST = new Set([
  'ai', 'llm', 'ml', 'tech', 'product', 'today', 'week',
]);

const HOST_ALIAS_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bswixs\b/gi, replacement: 'swyx' },
  { pattern: /\bswix\b/gi, replacement: 'swyx' },
  { pattern: /\bswitz\b/gi, replacement: 'swyx' },
  { pattern: /\balesio\b/gi, replacement: 'Alessio' },
  { pattern: /\ballesio\b/gi, replacement: 'Alessio' },
  { pattern: /\ballesop\b/gi, replacement: 'Alessio' },
];

function cleanEntity(name: string): string {
  let value = name;
  for (const rule of HOST_ALIAS_REPLACEMENTS) {
    value = value.replace(rule.pattern, rule.replacement);
  }
  return value.replace(/\s+/g, ' ').trim();
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

interface EntityExtractionResult {
  people: string[];
  organizations: string[];
  topics: string[];
}

async function extractEntitiesWithClaude(title: string, description: string, chunk: string): Promise<EntityExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = [
    'Extract prominent entities from this content. Return strict JSON only.',
    'Schema: {"people": string[], "organizations": string[], "topics": string[]}',
    'Rules:',
    '- Only include entities that are clearly central, not incidental mentions.',
    '- Keep names in normal capitalization.',
    '- Keep topics short (1-4 words).',
    '- Canonicalize host aliases to: swyx, Alessio.',
    '',
    `Title: ${cleanEntity(title)}`,
    `Description: ${cleanEntity(description).slice(0, 500)}`,
    `Content sample: ${cleanEntity(chunk).slice(0, 2500)}`,
  ].join('\n');

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim();

  const jsonText = textContent.match(/\{[\s\S]*\}/)?.[0] || '{}';
  const parsed = JSON.parse(jsonText) as Partial<EntityExtractionResult>;

  const dedupe = (arr: string[] | undefined): string[] => {
    if (!arr) return [];
    return [...new Set(arr.map(cleanEntity).filter(Boolean))].filter(
      (value) => !ENTITY_BLOCKLIST.has(value.toLowerCase())
    );
  };

  return {
    people: dedupe(parsed.people),
    organizations: dedupe(parsed.organizations),
    topics: dedupe(parsed.topics),
  };
}

async function findOrCreateEntity(title: string, entityType: 'person' | 'organization' | 'topic'): Promise<number> {
  const normalized = cleanEntity(title);
  if (!normalized) throw new Error('Entity title is empty');

  const sqlite = getSQLiteClient();
  const existing = await sqlite.query<{ id: number }>(
    "SELECT id FROM nodes WHERE LOWER(title) = LOWER(?) AND node_type = 'entity' LIMIT 1",
    [normalized]
  );
  if (existing.rows.length > 0) return Number(existing.rows[0].id);

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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const maxItems = Number(request.nextUrl.searchParams.get('limit') || '5');
  const sqlite = getSQLiteClient();

  // Find nodes with 0 edges, created in last 7 days, content types only
  const candidates = await sqlite.query<{
    id: number;
    title: string;
    description: string | null;
    chunk: string | null;
    node_type: string;
    metadata: string | null;
  }>(
    `SELECT n.id, n.title, n.description, SUBSTR(n.chunk, 1, 3000) as chunk, n.node_type, n.metadata
     FROM nodes n
     WHERE n.node_type IN ('podcast', 'article', 'ainews', 'builders-club', 'paper-club', 'workshop')
       AND n.chunk IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM edges WHERE from_node_id = n.id OR to_node_id = n.id
       )
       AND datetime(n.created_at) > datetime('now', '-7 days')
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [maxItems]
  );

  if (candidates.rows.length === 0) {
    return NextResponse.json({
      success: true,
      data: { message: 'No nodes need entity extraction', processed: 0 },
    });
  }

  const results: Array<{ nodeId: number; title: string; status: string; entities?: number; error?: string }> = [];

  for (const node of candidates.rows) {
    const nodeId = Number(node.id);
    const nodeType = node.node_type as NodeType;
    const title = node.title;
    const description = node.description || '';
    const chunk = node.chunk || '';

    try {
      let entities: EntityExtractionResult;

      // Check for AINews frontmatter entities
      if (nodeType === 'ainews' && node.metadata) {
        const meta = typeof node.metadata === 'string' ? JSON.parse(node.metadata) : node.metadata;
        const fm = meta?.frontmatter_entities as { companies?: string[]; models?: string[]; topics?: string[]; people?: string[] } | undefined;
        if (fm?.people?.length || fm?.companies?.length || fm?.topics?.length || fm?.models?.length) {
          entities = {
            people: (fm?.people || []).map(cleanEntity),
            organizations: (fm?.companies || []).map(cleanEntity),
            topics: [...(fm?.topics || []), ...(fm?.models || [])].map(cleanEntity),
          };
        } else {
          entities = await extractEntitiesWithClaude(title, description, chunk);
        }
      } else {
        entities = await extractEntitiesWithClaude(title, description, chunk);
      }

      let edgeCount = 0;

      for (const person of [...new Set(entities.people)].filter(Boolean)) {
        const personId = await findOrCreateEntity(person, 'person');
        if (['podcast', 'builders-club', 'paper-club', 'workshop'].includes(nodeType)) {
          await ensureEdge(personId, nodeId, `appeared on ${title}`);
        } else {
          await ensureEdge(nodeId, personId, `covers ${person}`);
        }
        edgeCount++;
      }

      for (const org of [...new Set(entities.organizations)].filter(Boolean)) {
        const orgId = await findOrCreateEntity(org, 'organization');
        await ensureEdge(nodeId, orgId, `covers ${org}`);
        edgeCount++;
      }

      for (const topic of [...new Set(entities.topics)].filter(Boolean)) {
        const topicId = await findOrCreateEntity(topic, 'topic');
        await ensureEdge(nodeId, topicId, `covers ${topic}`);
        edgeCount++;
      }

      results.push({ nodeId, title, status: 'success', entities: edgeCount });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[extract-entities] Failed for node ${nodeId}:`, msg);
      results.push({ nodeId, title, status: 'failed', error: msg });
    }
  }

  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return NextResponse.json({
    success: true,
    data: {
      processed: results.length,
      succeeded,
      failed,
      results,
    },
  });
}
