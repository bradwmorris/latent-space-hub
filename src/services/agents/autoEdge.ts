/**
 * Auto-Edge Creation Service
 *
 * After Quick Capture creates a node, this service:
 * 1. Extracts candidate entity strings from the node's description
 * 2. Looks up existing entity nodes by exact title match
 * 3. Creates edges with explanations for matches
 *
 * This is a "fast path" for obvious connections only - conservative by design.
 */

import { nodeService, edgeService } from '@/services/database';
import { Node } from '@/types/database';
import { autoEmbedQueue } from '@/services/embedding/autoEmbedQueue';

// Entity-like dimensions where we expect to find referenceable entities
const ENTITY_DIMENSIONS = ['people', 'companies', 'organizations', 'books', 'papers', 'articles', 'podcasts', 'creators'];

/**
 * Clean up a candidate entity string by removing common prefixes/suffixes.
 */
function cleanEntityCandidate(candidate: string): string {
  let cleaned = candidate.trim();

  // Remove common author/attribution prefixes
  const prefixPatterns = [
    /^by\s+/i,
    /^author:\s*/i,
    /^written by\s+/i,
    /^from\s+/i,
    /^via\s+/i,
    /^featuring\s+/i,
    /^with\s+/i,
    /^hosted by\s+/i,
  ];

  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/**
 * Extract candidate entity strings from text using conservative heuristics.
 * Returns proper names, quoted titles, and recognized patterns.
 */
function extractCandidateEntities(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  const candidates: Set<string> = new Set();

  // Pattern 1: "By [Name]" pattern - common in article descriptions
  // Matches: "By Simon Willison", "by Sam Altman"
  const byPattern = /\b[Bb]y\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  let match;
  while ((match = byPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length >= 4 && !isGenericPhrase(name)) {
      candidates.add(name);
    }
  }

  // Pattern 2: Proper name sequences (2-4 capitalized words)
  // Matches: "Sam Altman", "Dario Amodei", "Peter Thiel"
  const properNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
  while ((match = properNamePattern.exec(text)) !== null) {
    const name = match[1].trim();
    // Clean the candidate (remove "By ", etc.)
    const cleaned = cleanEntityCandidate(name);
    if (cleaned.length >= 4 && !isGenericPhrase(cleaned)) {
      candidates.add(cleaned);
    }
  }

  // Pattern 3: Quoted titles (single or double quotes)
  // Matches: "Zero to One", 'The Lean Startup'
  const quotedPattern = /["']([^"']{3,60})["']/g;
  while ((match = quotedPattern.exec(text)) !== null) {
    const title = match[1].trim();
    if (title.length >= 3 && !isGenericPhrase(title)) {
      candidates.add(title);
    }
  }

  // Pattern 4: Known organization patterns
  // Matches: OpenAI, DeepMind, Y Combinator, Fly.io
  const orgPattern = /\b(OpenAI|DeepMind|Anthropic|Google|Microsoft|Meta|Apple|Amazon|Y Combinator|YC|Stripe|Coinbase|Fly\.io|Vercel|Cloudflare)\b/gi;
  while ((match = orgPattern.exec(text)) !== null) {
    candidates.add(match[1]);
  }

  return Array.from(candidates);
}

/**
 * Check if a phrase is too generic to be a useful entity reference.
 */
function isGenericPhrase(phrase: string): boolean {
  const normalized = phrase.toLowerCase();

  // Common stopwords and generic terms
  const genericTerms = [
    'the author', 'the article', 'the book', 'the podcast',
    'this article', 'this book', 'this podcast', 'this paper',
    'new research', 'recent study', 'key points', 'main ideas',
    'artificial intelligence', 'machine learning', 'deep learning',
    'first section', 'last section', 'next chapter',
    'united states', 'new york', 'san francisco', 'silicon valley'
  ];

  return genericTerms.some(term => normalized === term || normalized.startsWith(term + ' '));
}

/**
 * Look up existing nodes that match candidate entity strings.
 * Uses exact title matching (case-insensitive) with optional dimension filtering.
 */
async function findMatchingEntityNodes(candidates: string[]): Promise<Map<string, Node>> {
  const matches = new Map<string, Node>();

  if (candidates.length === 0) return matches;

  // Get all nodes (we'll filter in memory for exact title matches)
  // In a larger system, we'd use a more efficient query
  const allNodes = await nodeService.getNodes({ limit: 10000 });

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase().trim();

    // Find exact title match (case-insensitive)
    const matchingNode = allNodes.find(node => {
      const normalizedTitle = (node.title || '').toLowerCase().trim();
      if (normalizedTitle !== normalizedCandidate) return false;

      // Optionally filter to entity-like dimensions for higher confidence
      // But don't require it - some entities might not have dimensions yet
      const nodeDimensions = node.dimensions || [];
      const hasEntityDimension = nodeDimensions.some(dim =>
        ENTITY_DIMENSIONS.includes(dim.toLowerCase())
      );

      // Accept if it has an entity dimension OR if it's a short title (likely a named entity)
      return hasEntityDimension || node.title.length < 50;
    });

    if (matchingNode) {
      matches.set(candidate, matchingNode);
    }
  }

  return matches;
}

/**
 * Create edges from a new node to matched entity nodes.
 * Each edge includes an explanation for auditability.
 */
async function createAutoEdges(
  newNodeId: number,
  matches: Map<string, Node>
): Promise<number> {
  let edgesCreated = 0;

  for (const [candidateText, entityNode] of matches) {
    // Skip self-references
    if (entityNode.id === newNodeId) continue;

    // Check if edge already exists
    const exists = await edgeService.edgeExists(newNodeId, entityNode.id);
    if (exists) continue;

    try {
      await edgeService.createEdge({
        from_node_id: newNodeId,
        to_node_id: entityNode.id,
        explanation: `Explicitly mentioned in description: "${candidateText}"`,
        created_via: 'quick_capture_auto',
        source: 'ai_similarity',
        skip_inference: false, // Let Idea Genealogy classify the relationship
      });
      edgesCreated++;
      console.log(`[autoEdge] Created edge: ${newNodeId} → ${entityNode.id} (${entityNode.title})`);
    } catch (error) {
      console.warn(`[autoEdge] Failed to create edge to ${entityNode.id}:`, error);
    }
  }

  return edgesCreated;
}

/**
 * Main entry point: Run auto-edge creation for a newly created node.
 * This is designed to be called fire-and-forget (non-blocking).
 */
export async function runAutoEdgeCreation(nodeId: number): Promise<void> {
  try {
    // Fetch the newly created node
    const node = await nodeService.getNodeById(nodeId);
    if (!node) {
      console.warn(`[autoEdge] Node ${nodeId} not found, skipping auto-edge creation`);
      return;
    }

    // Use description as the source of truth for entity extraction
    const description = node.description || '';
    if (!description || description.length < 10) {
      console.log(`[autoEdge] Node ${nodeId} has no/short description, skipping`);
      return;
    }

    // Extract candidate entities from description
    const candidates = extractCandidateEntities(description);
    if (candidates.length === 0) {
      console.log(`[autoEdge] No entity candidates found in node ${nodeId} description`);
      return;
    }

    console.log(`[autoEdge] Found ${candidates.length} candidates for node ${nodeId}:`, candidates);

    // Find matching existing nodes
    const matches = await findMatchingEntityNodes(candidates);
    if (matches.size === 0) {
      console.log(`[autoEdge] No matching entity nodes found for node ${nodeId}`);
      return;
    }

    // Create edges
    const edgesCreated = await createAutoEdges(nodeId, matches);
    console.log(`[autoEdge] Created ${edgesCreated} auto-edges for node ${nodeId}`);

    // Enqueue matched entity nodes for embedding if they lack one
    for (const [, entityNode] of matches) {
      if (!entityNode.embedding_updated_at) {
        autoEmbedQueue.enqueue(entityNode.id, { reason: 'auto_edge_entity' });
        console.log(`[autoEdge] Enqueued entity node ${entityNode.id} (${entityNode.title}) for embedding`);
      }
    }
  } catch (error) {
    console.error(`[autoEdge] Error in auto-edge creation for node ${nodeId}:`, error);
  }
}

/**
 * Schedule auto-edge creation to run asynchronously (fire-and-forget).
 * Use this from the nodes API to avoid blocking the response.
 */
export function scheduleAutoEdgeCreation(nodeId: number): void {
  setImmediate(() => {
    runAutoEdgeCreation(nodeId).catch(error => {
      console.error(`[autoEdge] Scheduled auto-edge creation failed for node ${nodeId}:`, error);
    });
  });
}
