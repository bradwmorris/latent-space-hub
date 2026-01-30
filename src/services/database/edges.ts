import { getSQLiteClient } from './sqlite-client';
import { Edge, EdgeContext, EdgeData, EdgeCreatedVia, NodeConnection, Node } from '@/types/database';
import { eventBroadcaster } from '../events';
import { nodeService } from './nodes';
import { apiKeyService } from '../storage/apiKeys';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

const inferredEdgeContextSchema = z.object({
  type: z.enum(['created_by', 'part_of', 'source_of', 'related_to']),
  confidence: z.number().min(0).max(1),
  swap_direction: z.boolean(),
});

async function inferEdgeContext(params: {
  explanation: string;
  fromNode: Node;
  toNode: Node;
}): Promise<{ type: EdgeContext['type']; confidence: number; swap_direction: boolean }> {
  const { explanation, fromNode, toNode } = params;

  // Heuristic fast-paths for common patterns.
  const norm = explanation.trim().toLowerCase();
  const startsWithAny = (prefixes: string[]) => prefixes.some((p) => norm.startsWith(p));

  // "Created by X" → FROM was created by TO (no swap needed)
  if (startsWithAny(['created by', 'made by', 'authored by', 'written by', 'founded by'])) {
    return { type: 'created_by', confidence: 1.0, swap_direction: false };
  }
  // "Author of X" → FROM is the author, so we need TO→FROM for created_by (swap needed)
  if (startsWithAny(['author of', 'creator of', 'wrote', 'made', 'founded', 'created'])) {
    return { type: 'created_by', confidence: 1.0, swap_direction: true };
  }
  if (startsWithAny(['part of', 'episode of', 'belongs to', 'in the series', 'in this series'])) {
    return { type: 'part_of', confidence: 1.0, swap_direction: false };
  }
  if (startsWithAny(['contains', 'includes', 'features', 'mentions', 'hosted by', 'guest:', 'host:'])) {
    return { type: 'part_of', confidence: 0.95, swap_direction: true };
  }
  if (startsWithAny(['came from', 'inspired by', 'derived from', 'based on', 'from', 'ideas from', 'insights from', 'ideas or insights from'])) {
    return { type: 'source_of', confidence: 0.9, swap_direction: false };
  }
  if (startsWithAny(['inspired', 'source for', 'source of', 'led to'])) {
    return { type: 'source_of', confidence: 0.9, swap_direction: true };
  }
  if (startsWithAny(['related to', 'related'])) {
    return { type: 'related_to', confidence: 0.8, swap_direction: false };
  }

  // If no API key is configured, degrade gracefully.
  const apiKey = apiKeyService.getOpenAiKey();
  if (!apiKey) {
    return { type: 'related_to', confidence: 0.0, swap_direction: false };
  }

  const provider = createOpenAI({ apiKey });
  const prompt = [
    `Given two nodes and an explanation, determine the relationship type and direction.`,
    ``,
    `FROM: "${fromNode.title}" — ${fromNode.description || 'No description'}`,
    `TO: "${toNode.title}" — ${toNode.description || 'No description'}`,
    `Explanation: "${explanation}"`,
    ``,
    `Edge types (the arrow shows required direction):`,
    `- created_by: Content → Creator (e.g., "Book" → "Author", "Article" → "Writer")`,
    `- part_of: Part → Whole (e.g., "Episode" → "Podcast", "Chapter" → "Book")`,
    `- source_of: Derivative → Source (e.g., "Insight" → "Article it came from")`,
    `- related_to: General relationship (bidirectional, no swap needed)`,
    ``,
    `IMPORTANT: Check if FROM and TO match the required direction for the type.`,
    `- If FROM is a Person/Creator and TO is Content, and type is created_by → swap_direction: true`,
    `- If FROM is a Whole and TO is a Part, and type is part_of → swap_direction: true`,
    `- If FROM is a Source and TO is Derivative, and type is source_of → swap_direction: true`,
    ``,
    `Return JSON: {"type": "...", "swap_direction": bool, "confidence": 0.X}`
  ].join('\n');

  try {
    const { text } = await generateText({
      model: provider('gpt-4o-mini'),
      prompt,
      temperature: 0.0,
      maxOutputTokens: 120,
    });

    const parsedJson = (() => {
      try {
        return JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('AI did not return valid JSON');
      }
    })();

    const parsed = inferredEdgeContextSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return { type: 'related_to', confidence: 0.2, swap_direction: false };
    }

    return parsed.data;
  } catch (error) {
    console.warn('[edges] inferEdgeContext failed; falling back to related_to', error);
    return { type: 'related_to', confidence: 0.2, swap_direction: false };
  }
}

// Auto-generate explanation and infer type when user doesn't provide an explanation
async function autoInferEdge(params: {
  fromNode: Node;
  toNode: Node;
}): Promise<{ explanation: string; type: EdgeContext['type']; confidence: number; swap_direction: boolean }> {
  const { fromNode, toNode } = params;

  const apiKey = apiKeyService.getOpenAiKey();
  if (!apiKey) {
    return {
      explanation: `Related to ${toNode.title}`,
      type: 'related_to',
      confidence: 0.0,
      swap_direction: false,
    };
  }

  const provider = createOpenAI({ apiKey });
  const prompt = [
    `Given two knowledge base nodes, determine how they are related.`,
    ``,
    `FROM: "${fromNode.title}"`,
    `Description: ${fromNode.description || 'No description'}`,
    ``,
    `TO: "${toNode.title}"`,
    `Description: ${toNode.description || 'No description'}`,
    ``,
    `Edge types (Content→Creator means the arrow goes FROM content TO creator):`,
    `- created_by: Content → Person/Creator. The content node points to its creator.`,
    `- part_of: Part → Whole (episode→podcast, chapter→book)`,
    `- source_of: Derivative → Source (summary→original, insight→article)`,
    `- related_to: DEFAULT. Similar topics, related concepts, or when unsure.`,
    ``,
    `CRITICAL RULES:`,
    `1. If BOTH are documents/articles/content → use "related_to" or "source_of", NEVER "created_by"`,
    `2. If FROM is a Person and TO is Content they created → use "created_by" with swap_direction: TRUE`,
    `3. If FROM is Content and TO is the Person who created it → use "created_by" with swap_direction: FALSE`,
    `4. When unsure → use "related_to"`,
    ``,
    `Return JSON: {"explanation": "...", "type": "...", "swap_direction": bool, "confidence": 0.X}`,
  ].join('\n');

  try {
    const { text } = await generateText({
      model: provider('gpt-4o-mini'),
      prompt,
      temperature: 0.0,
      maxOutputTokens: 150,
    });

    const parsedJson = (() => {
      try {
        return JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('AI did not return valid JSON');
      }
    })();

    const schema = z.object({
      explanation: z.string(),
      type: z.enum(['created_by', 'part_of', 'source_of', 'related_to']),
      confidence: z.number().min(0).max(1),
      swap_direction: z.boolean(),
    });

    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) {
      return {
        explanation: `Related to ${toNode.title}`,
        type: 'related_to',
        confidence: 0.2,
        swap_direction: false,
      };
    }

    return parsed.data;
  } catch (error) {
    console.warn('[edges] autoInferEdge failed; falling back', error);
    return {
      explanation: `Related to ${toNode.title}`,
      type: 'related_to',
      confidence: 0.2,
      swap_direction: false,
    };
  }
}

export class EdgeService {
  async getEdges(): Promise<Edge[]> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<Edge>('SELECT * FROM edges ORDER BY created_at DESC');
    return result.rows;
  }

  async getEdgeById(id: number): Promise<Edge | null> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<Edge>('SELECT * FROM edges WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  async createEdge(edgeData: EdgeData): Promise<Edge> {
    const now = new Date().toISOString();
    const sqlite = getSQLiteClient();

    const createdVia: EdgeCreatedVia = edgeData.created_via;

    // Fetch nodes for inference context
    const [fromNode, toNode] = await Promise.all([
      nodeService.getNodeById(edgeData.from_node_id),
      nodeService.getNodeById(edgeData.to_node_id),
    ]);

    if (!fromNode) throw new Error(`Source node ${edgeData.from_node_id} not found`);
    if (!toNode) throw new Error(`Target node ${edgeData.to_node_id} not found`);

    let explanation = (edgeData.explanation || '').trim();
    let inferred: { type: EdgeContext['type']; confidence: number; swap_direction: boolean };

    if (!explanation && !edgeData.skip_inference) {
      // Auto-generate explanation and infer type
      const autoResult = await autoInferEdge({ fromNode, toNode });
      explanation = autoResult.explanation;
      inferred = {
        type: autoResult.type,
        confidence: autoResult.confidence,
        swap_direction: autoResult.swap_direction,
      };
    } else if (edgeData.skip_inference) {
      inferred = { type: 'related_to' as const, confidence: 0.0, swap_direction: false };
      if (!explanation) explanation = `Related to ${toNode.title}`;
    } else {
      inferred = await inferEdgeContext({ explanation, fromNode, toNode });
    }

    // Apply swap_direction: flip from/to if inference determined direction should be reversed
    const finalFromId = inferred.swap_direction ? edgeData.to_node_id : edgeData.from_node_id;
    const finalToId = inferred.swap_direction ? edgeData.from_node_id : edgeData.to_node_id;

    const context: EdgeContext = {
      type: inferred.type,
      confidence: inferred.confidence,
      inferred_at: now,
      explanation,
      created_via: createdVia,
    };

    const result = await sqlite.query(`
      INSERT INTO edges (from_node_id, to_node_id, context, source, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [
      finalFromId,
      finalToId,
      JSON.stringify(context),
      edgeData.source,
      now
    ]);

    console.log('[Edge DEBUG] INSERT result:', JSON.stringify(result));

    const edgeId = result.lastInsertRowid;
    console.log('[Edge DEBUG] edgeId:', edgeId, 'type:', typeof edgeId);

    if (!edgeId) {
      // Fallback: query for the edge we just inserted
      const fallbackResult = await sqlite.query<{ id: number }>(
        `SELECT id FROM edges WHERE from_node_id = ? AND to_node_id = ? ORDER BY id DESC LIMIT 1`,
        [finalFromId, finalToId]
      );
      console.log('[Edge DEBUG] fallback result:', JSON.stringify(fallbackResult));
      if (fallbackResult.rows.length === 0) {
        throw new Error('Failed to create edge - INSERT did not return ID and fallback query found nothing');
      }
      const newEdge = await this.getEdgeById(fallbackResult.rows[0].id);
      if (!newEdge) {
        throw new Error('Failed to create edge - could not retrieve after fallback');
      }
      return newEdge;
    }

    const newEdge = await this.getEdgeById(edgeId);
    console.log('[Edge DEBUG] getEdgeById result:', newEdge ? 'found' : 'null');

    if (!newEdge) {
      throw new Error('Failed to create edge');
    }

    // Broadcast edge creation event
    eventBroadcaster.broadcast({
      type: 'EDGE_CREATED',
      data: {
        fromNodeId: finalFromId,
        toNodeId: finalToId,
        edge: newEdge
      }
    });

    return newEdge;
  }

  async updateEdge(id: number, updates: Partial<Edge>): Promise<Edge> {
    const sqlite = getSQLiteClient();
    const updateFields: string[] = [];
    const params: any[] = [];

    // If explanation changes, re-infer classification and write full EdgeContext
    if (Object.prototype.hasOwnProperty.call(updates, 'context') && updates.context && typeof updates.context === 'object') {
      const incomingContext = updates.context as Partial<EdgeContext> & { explanation?: unknown };
      if (typeof incomingContext.explanation === 'string') {
        const explanation = incomingContext.explanation.trim();
        if (!explanation) {
          throw new Error('Edge explanation is required');
        }

        const existingEdge = await this.getEdgeById(id);
        if (!existingEdge) {
          throw new Error(`Edge with ID ${id} not found`);
        }

        const [fromNode, toNode] = await Promise.all([
          nodeService.getNodeById(existingEdge.from_node_id),
          nodeService.getNodeById(existingEdge.to_node_id),
        ]);

        if (!fromNode) throw new Error(`Source node ${existingEdge.from_node_id} not found`);
        if (!toNode) throw new Error(`Target node ${existingEdge.to_node_id} not found`);

        const inferred = await inferEdgeContext({ explanation, fromNode, toNode });
        const now = new Date().toISOString();

        const existingContext = (existingEdge.context && typeof existingEdge.context === 'object')
          ? (existingEdge.context as Partial<EdgeContext>)
          : undefined;

        const created_via: EdgeCreatedVia =
          (incomingContext.created_via as EdgeCreatedVia) ||
          (existingContext?.created_via as EdgeCreatedVia) ||
          'ui';

        updates.context = {
          ...existingContext,
          ...incomingContext,
          type: inferred.type,
          confidence: inferred.confidence,
          inferred_at: now,
          explanation,
          created_via,
        } satisfies EdgeContext;
      }
    }

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && value !== undefined) {
        updateFields.push(`${key} = ?`);
        if (key === 'context') {
          params.push(typeof value === 'object' ? JSON.stringify(value) : value);
        } else {
          params.push(value);
        }
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(id); // Add ID for WHERE clause

    const query = `UPDATE edges SET ${updateFields.join(', ')} WHERE id = ?`;
    const result = await sqlite.query(query, params);

    if (result.changes === 0) {
      throw new Error(`Edge with ID ${id} not found`);
    }

    const updatedEdge = await this.getEdgeById(id);
    if (!updatedEdge) {
      throw new Error(`Failed to retrieve updated edge with ID ${id}`);
    }

    return updatedEdge;
  }

  async deleteEdge(id: number): Promise<void> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query('DELETE FROM edges WHERE id = ?', [id]);
    if ((result.changes || 0) === 0) {
      throw new Error(`Edge with ID ${id} not found`);
    }
    // Broadcast edge deletion event
    eventBroadcaster.broadcast({
      type: 'EDGE_DELETED',
      data: { edgeId: id }
    });
  }

  async deleteEdgesByNodeId(nodeId: number): Promise<void> {
    const sqlite = getSQLiteClient();
    await sqlite.query(
      'DELETE FROM edges WHERE from_node_id = ? OR to_node_id = ?',
      [nodeId, nodeId]
    );
  }

  async getNodeConnections(nodeId: number): Promise<NodeConnection[]> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query(`
      SELECT
        e.*,
        CASE
          WHEN e.from_node_id = ? THEN n_to.id
          ELSE n_from.id
        END as connected_node_id,
        CASE
          WHEN e.from_node_id = ? THEN n_to.title
          ELSE n_from.title
        END as connected_node_title,
        CASE
          WHEN e.from_node_id = ? THEN n_to.content
          ELSE n_from.content
        END as connected_node_content,
        CASE
          WHEN e.from_node_id = ? THEN n_to.link
          ELSE n_from.link
        END as connected_node_link,
        CASE
          WHEN e.from_node_id = ? THEN n_to.chunk
          ELSE n_from.chunk
        END as connected_node_chunk,
        CASE
          WHEN e.from_node_id = ? THEN n_to.metadata
          ELSE n_from.metadata
        END as connected_node_metadata,
        CASE
          WHEN e.from_node_id = ? THEN n_to.created_at
          ELSE n_from.created_at
        END as connected_node_created_at,
        CASE
          WHEN e.from_node_id = ? THEN n_to.updated_at
          ELSE n_from.updated_at
        END as connected_node_updated_at,
        CASE
          WHEN e.from_node_id = ? THEN (
            SELECT JSON_GROUP_ARRAY(d.dimension)
            FROM node_dimensions d WHERE d.node_id = n_to.id
          )
          ELSE (
            SELECT JSON_GROUP_ARRAY(d.dimension)
            FROM node_dimensions d WHERE d.node_id = n_from.id
          )
        END as connected_node_dimensions_json
      FROM edges e
      LEFT JOIN nodes n_from ON e.from_node_id = n_from.id
      LEFT JOIN nodes n_to ON e.to_node_id = n_to.id
      WHERE e.from_node_id = ? OR e.to_node_id = ?
      ORDER BY e.created_at DESC
    `, [
      nodeId, nodeId, nodeId, nodeId, nodeId,
      nodeId, nodeId, nodeId, nodeId, nodeId, nodeId
    ]);

    return this.mapNodeConnectionsSQLite(result.rows);
  }

  private mapNodeConnectionsSQLite(rows: any[]): NodeConnection[] {
    return rows.map(row => {
      let context: any = row.context;
      if (typeof row.context === 'string') {
        const trimmed = row.context.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            context = JSON.parse(trimmed);
          } catch (error) {
            console.warn('[edges] Failed to parse JSON context for edge', row.id, error);
            context = row.context;
          }
        }
      }

      const edge: Edge = {
        id: row.id,
        from_node_id: row.from_node_id,
        to_node_id: row.to_node_id,
        context,
        source: row.source,
        created_at: row.created_at
      };

      const connected_node: Node = {
        id: row.connected_node_id,
        title: row.connected_node_title,
        content: row.connected_node_content,
        link: row.connected_node_link,
        dimensions: JSON.parse(row.connected_node_dimensions_json || '[]'),
        embedding: undefined,
        chunk: row.connected_node_chunk,
        metadata: typeof row.connected_node_metadata === 'string' ? JSON.parse(row.connected_node_metadata) : row.connected_node_metadata,
        created_at: row.connected_node_created_at,
        updated_at: row.connected_node_updated_at
      };

      return {
        id: edge.id,
        connected_node,
        edge
      };
    });
  }

  async edgeExists(fromId: number, toId: number): Promise<boolean> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query('SELECT 1 FROM edges WHERE from_node_id = ? AND to_node_id = ?', [fromId, toId]);
    return result.rows.length > 0;
  }

  async getEdgeCount(): Promise<number> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<{ count: number }>('SELECT COUNT(*) as count FROM edges');
    return Number(result.rows[0].count);
  }

  async getMostConnectedNodes(limit = 10): Promise<Array<{ node_id: number; connection_count: number }>> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query(`
      SELECT
        node_id,
        COUNT(*) as connection_count
      FROM (
        SELECT from_node_id as node_id FROM edges
        UNION ALL
        SELECT to_node_id as node_id FROM edges
      ) combined
      GROUP BY node_id
      ORDER BY connection_count DESC
      LIMIT ?
    `, [limit]);

    return result.rows.map((row: any) => ({
      node_id: Number(row.node_id),
      connection_count: Number(row.connection_count)
    }));
  }

  async createBidirectionalEdge(fromId: number, toId: number, options?: {
    explanation?: string;
    created_via?: EdgeCreatedVia;
    source?: 'user' | 'ai_similarity' | 'helper_name';
    skip_inference?: boolean;
  }): Promise<Edge[]> {
    const edges: Edge[] = [];
    const explanation = (options?.explanation || 'Similarity-based connection').trim();
    const created_via: EdgeCreatedVia = options?.created_via || 'workflow';

    // Create edge from A to B
    const forwardEdge = await this.createEdge({
      from_node_id: fromId,
      to_node_id: toId,
      explanation,
      created_via,
      source: options?.source || 'ai_similarity',
      skip_inference: options?.skip_inference,
    });
    edges.push(forwardEdge);

    // Create edge from B to A
    const backwardEdge = await this.createEdge({
      from_node_id: toId,
      to_node_id: fromId,
      explanation,
      created_via,
      source: options?.source || 'ai_similarity',
      skip_inference: options?.skip_inference,
    });
    edges.push(backwardEdge);

    return edges;
  }
}

// Export singleton instance
export const edgeService = new EdgeService();
