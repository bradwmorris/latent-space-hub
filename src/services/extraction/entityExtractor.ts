import OpenAI from 'openai';
import { edgeService, nodeService } from '@/services/database';
import { generateDescription } from '@/services/database/descriptionService';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { NodeType } from '@/types/database';

// --- Types ---

export interface EntityExtractionResult {
  organizations: string[];
  themes: string[];
}

interface ExtractionAuditTrail {
  status: 'success' | 'failed';
  extracted_at: string;
  method: 'gpt-4.1-mini' | 'frontmatter';
  entities_found: { organizations: string[] };
  themes_assigned: string[];
  edges_created: number;
}

// --- Constants ---

export const ENTITY_BLOCKLIST = new Set([
  'ai', 'llm', 'ml', 'tech', 'product', 'today', 'week',
  'artificial intelligence', 'machine learning', 'deep learning',
  'scaling', 'data', 'software', 'hardware',
]);

export const HOST_ALIAS_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bswixs\b/gi, replacement: 'swyx' },
  { pattern: /\bswix\b/gi, replacement: 'swyx' },
  { pattern: /\bswitz\b/gi, replacement: 'swyx' },
  { pattern: /\balesio\b/gi, replacement: 'Alessio' },
  { pattern: /\ballesio\b/gi, replacement: 'Alessio' },
  { pattern: /\ballesop\b/gi, replacement: 'Alessio' },
];

// --- Helpers ---

export function cleanEntity(name: string): string {
  let value = name;
  for (const rule of HOST_ALIAS_REPLACEMENTS) {
    value = value.replace(rule.pattern, rule.replacement);
  }
  return value.replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
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

function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// --- Fuzzy matching ---

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Check if two entity names are fuzzy matches.
 * Handles typos like "Cherney" vs "Cherny", abbreviations, etc.
 */
export function isFuzzyMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);

  // Exact match after normalization
  if (na === nb) return true;

  // One is a substring of the other (handles "OpenAI" vs "OpenAI Inc")
  if (na.includes(nb) || nb.includes(na)) return true;

  // Levenshtein-based: for short strings, allow edit distance proportional to length
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return false;

  const distance = levenshtein(na, nb);
  // Allow 1 edit per 5 chars, minimum 1
  const threshold = Math.max(1, Math.floor(maxLen / 5));
  return distance <= threshold;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// --- LLM calls ---

/**
 * Extract entities (organizations + research fields) from content using gpt-5-mini.
 */
export async function extractEntities(
  title: string,
  chunk: string
): Promise<EntityExtractionResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { organizations: [], themes: [] };
  }

  const openai = getOpenAIClient();
  const normalizedTitle = cleanEntity(title);
  const normalizedChunk = cleanEntity(chunk);

  const prompt = [
    'Extract entities and themes from this content. Return strict JSON only.',
    'Schema: {"organizations": string[], "themes": string[]}',
    'Rules:',
    '- organizations: Only major companies, labs, or institutions (e.g. "OpenAI", "DeepMind", "Stanford"). Not products, not projects.',
    '- themes: Key research areas or topics discussed (e.g. "reinforcement learning", "mechanistic interpretability", "constitutional AI"). Not generic terms like "AI" or "scaling". Use lowercase.',
    '- Keep organization names in standard capitalization.',
    '- Max 5 organizations, max 5 themes.',
    '- If unsure, leave it out.',
    '',
    `Title: ${normalizedTitle}`,
    `Content: ${normalizedChunk.slice(0, 2500)}`,
  ].join('\n');

  const response = await withRetry(async () => {
    return openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content) as Partial<EntityExtractionResult>;

  const dedupe = (arr: string[] | undefined): string[] => {
    if (!arr) return [];
    return [...new Set(arr.map(cleanEntity).filter(Boolean))].filter(
      (value) => !ENTITY_BLOCKLIST.has(value.toLowerCase())
    );
  };

  return {
    organizations: dedupe(parsed.organizations),
    themes: dedupe(parsed.themes),
  };
}

/**
 * Generate a proper description + notes for a new entity node.
 */
async function generateEntityDescription(
  entityName: string,
  sourceContent: { title: string; chunk: string }
): Promise<{ description: string; notes: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      description: `Organization: ${entityName}`,
      notes: '',
    };
  }

  const openai = getOpenAIClient();

  const response = await withRetry(async () => {
    return openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Generate a description and notes for this organization based on the source content.

Entity: "${entityName}"
Source: "${sourceContent.title}"
Content: ${sourceContent.chunk.slice(0, 1500)}

Return JSON:
{
  "description": "One sentence. What this organization IS — what they do and why they matter in AI/ML. Be specific, not generic.",
  "notes": "2-3 sentences of additional context from the source content. What was said about this entity? Why is it relevant to the Latent Space community?"
}

Examples of GOOD descriptions:
- "Anthropic is an AI safety company that builds Claude, focused on constitutional AI and interpretability research."
- "Nvidia is the dominant GPU manufacturer powering AI training and inference infrastructure worldwide."

Examples of BAD descriptions:
- "organization extracted from auto-ingestion"
- "A company in the AI space"`,
      }],
    });
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content) as { description?: string; notes?: string };

  return {
    description: parsed.description || `Organization: ${entityName}`,
    notes: parsed.notes || '',
  };
}

/**
 * Generate a one-sentence description for a content node (podcast, article, etc.).
 */
export async function generateContentDescription(
  title: string,
  nodeType: string,
  chunk: string
): Promise<string> {
  return generateDescription({
    title,
    node_type: nodeType,
    content: chunk,
    notes: chunk,
  });
}

// --- Entity dedup + creation ---

/**
 * Find or create an entity node with proper dedup (exact + fuzzy match)
 * and meaningful descriptions.
 */
export async function findOrCreateEntity(
  name: string,
  sourceContext: { contentTitle: string; chunk: string }
): Promise<number> {
  const normalized = cleanEntity(name);
  if (!normalized) {
    throw new Error('Entity title is empty');
  }

  const sqlite = getSQLiteClient();

  // Step 1: Exact match (fast)
  const exact = await sqlite.query<{ id: number }>(
    "SELECT id FROM nodes WHERE LOWER(title) = LOWER(?) AND node_type = 'entity' LIMIT 1",
    [normalized]
  );
  if (exact.rows.length > 0) return Number(exact.rows[0].id);

  // Step 2: Fuzzy match — search for similar titles
  const words = normalized.split(' ').filter(w => w.length > 2);
  if (words.length > 0) {
    const fuzzy = await sqlite.query<{ id: number; title: string }>(
      `SELECT id, title FROM nodes
       WHERE node_type = 'entity'
         AND (${words.map(() => 'LOWER(title) LIKE ?').join(' OR ')})
       LIMIT 10`,
      words.map(w => `%${w.toLowerCase()}%`)
    );

    for (const row of fuzzy.rows) {
      if (isFuzzyMatch(normalized, row.title)) {
        return Number(row.id);
      }
    }
  }

  // Step 3: No match — create new entity with proper description
  const { description, notes } = await generateEntityDescription(
    normalized,
    { title: sourceContext.contentTitle, chunk: sourceContext.chunk }
  );

  const node = await nodeService.createNode({
    title: normalized,
    node_type: 'entity',
    description,
    notes,
    chunk: notes,
    dimensions: ['entity'],
    metadata: {
      entity_type: 'organization',
      extraction_method: 'gpt-4.1-mini',
      first_seen_in: sourceContext.contentTitle,
    },
  });

  return node.id;
}

// --- Edge creation (bidirectional check) ---

export async function ensureEdge(fromNodeId: number, toNodeId: number, explanation: string): Promise<void> {
  // Check both directions
  const existsForward = await edgeService.edgeExists(fromNodeId, toNodeId);
  if (existsForward) return;
  const existsReverse = await edgeService.edgeExists(toNodeId, fromNodeId);
  if (existsReverse) return;

  await edgeService.createEdge({
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    explanation,
    created_via: 'workflow',
    source: 'entity_extraction',
  });
}

// --- Main orchestrator ---

/**
 * Extract entities for a node and create entity nodes + edges.
 * Writes extraction audit trail to node metadata.
 */
export async function extractEntitiesForNode(params: {
  nodeId: number;
  nodeType: NodeType;
  title: string;
  chunk: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { nodeId, nodeType, title, chunk, metadata } = params;

  let entities: EntityExtractionResult = { organizations: [], themes: [] };
  let method: 'gpt-4.1-mini' | 'frontmatter' = 'gpt-4.1-mini';

  // AINews: try frontmatter entities first
  if (nodeType === 'ainews') {
    const frontmatter = metadata.frontmatter_entities as
      | { companies?: string[]; topics?: string[] }
      | undefined;
    const hasFrontmatter =
      Boolean(frontmatter?.companies?.length);
    if (hasFrontmatter) {
      entities = {
        organizations: (frontmatter?.companies || []).map(cleanEntity),
        themes: [], // frontmatter topics are too generic
      };
      method = 'frontmatter';
    } else {
      entities = await extractEntities(title, chunk);
    }
  } else {
    entities = await extractEntities(title, chunk);
  }

  const uniqueOrgs = [...new Set(entities.organizations)].filter(Boolean);
  const uniqueThemes = [...new Set(entities.themes)].filter(Boolean);

  let edgesCreated = 0;
  const sourceContext = { contentTitle: title, chunk };

  // Organizations → entity nodes + edges
  for (const org of uniqueOrgs) {
    const orgId = await findOrCreateEntity(org, sourceContext);
    await ensureEdge(nodeId, orgId, `covers ${org}`);
    edgesCreated++;
  }

  // Themes → dimensions on the content node (not entity nodes)
  const sqlite = getSQLiteClient();
  for (const theme of uniqueThemes) {
    const dimName = theme.toLowerCase().replace(/\s+/g, '-');
    await sqlite.query(
      'INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)',
      [nodeId, dimName]
    );
  }

  // Write extraction audit trail to node metadata
  const auditTrail: ExtractionAuditTrail = {
    status: 'success',
    extracted_at: new Date().toISOString(),
    method,
    entities_found: { organizations: uniqueOrgs },
    themes_assigned: uniqueThemes,
    edges_created: edgesCreated,
  };

  const updatedMetadata = { ...metadata, entity_extraction: auditTrail };
  await sqlite.query(
    'UPDATE nodes SET metadata = ?, updated_at = datetime() WHERE id = ?',
    [JSON.stringify(updatedMetadata), nodeId]
  );
}
