import { getSQLiteClient } from './sqlite-client';
import { Node, NodeFilters } from '@/types/database';
import { eventBroadcaster } from '../events';

export class NodeService {
  async getNodes(filters: NodeFilters = {}): Promise<Node[]> {
    const { dimensions, search, limit = 100, offset = 0, sortBy } = filters;
    const sqlite = getSQLiteClient();

    // Use nodes_v view for array-like dimensions behavior (exclude embedding BLOB for performance)
    let query = `
      SELECT n.id, n.title, n.description, n.content, n.link, n.type, n.metadata, n.chunk,
             n.chunk_status, n.embedding_updated_at, n.embedding_text,
             n.created_at, n.updated_at,
             COALESCE((SELECT JSON_GROUP_ARRAY(d.dimension)
                       FROM node_dimensions d WHERE d.node_id = n.id), '[]') as dimensions_json,
             (SELECT COUNT(*) FROM edges WHERE from_node_id = n.id OR to_node_id = n.id) as edge_count
      FROM nodes n
      WHERE 1=1
    `;
    const params: any[] = [];

    // Filter by dimensions (SQLite JOIN with node_dimensions)
    if (dimensions && dimensions.length > 0) {
      query += ` AND EXISTS (
        SELECT 1 FROM node_dimensions nd
        WHERE nd.node_id = n.id
        AND nd.dimension IN (${dimensions.map(() => '?').join(',')})
      )`;
      params.push(...dimensions);
    }

    // Text search in title, description, and content (SQLite LIKE with COLLATE NOCASE)
    if (search) {
      query += ` AND (n.title LIKE ? COLLATE NOCASE OR n.description LIKE ? COLLATE NOCASE OR n.content LIKE ? COLLATE NOCASE)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Sorting logic
    if (search) {
      // For search queries, prioritize by relevance: exact title → starts with → contains in title → description → content
      query += ` ORDER BY
        CASE WHEN LOWER(n.title) = LOWER(?) THEN 1 ELSE 6 END,
        CASE WHEN LOWER(n.title) LIKE LOWER(?) THEN 2 ELSE 6 END,
        CASE WHEN n.title LIKE ? COLLATE NOCASE THEN 3 ELSE 6 END,
        CASE WHEN n.description LIKE ? COLLATE NOCASE THEN 4 ELSE 6 END,
        CASE WHEN n.content LIKE ? COLLATE NOCASE THEN 5 ELSE 6 END,
        n.updated_at DESC`;
      params.push(
        search,           // Exact match (case-insensitive)
        `${search}%`,     // Starts with search term
        `%${search}%`,    // Contains in title
        `%${search}%`,    // Contains in description
        `%${search}%`     // Contains in content
      );
    } else if (sortBy === 'edges') {
      // Sort by edge count (most connected first)
      query += ' ORDER BY edge_count DESC, n.updated_at DESC';
    } else {
      query += ' ORDER BY n.updated_at DESC';
    }

    if (limit) {
      query += ` LIMIT ?`;
      params.push(limit);
    }

    if (offset > 0) {
      query += ` OFFSET ?`;
      params.push(offset);
    }

    const result = await sqlite.query<Node & { dimensions_json: string }>(query, params);

    // Parse dimensions_json and metadata back for compatibility
    return result.rows.map(row => ({
      ...row,
      dimensions: JSON.parse(row.dimensions_json || '[]'),
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    }));
  }

  async getNodeById(id: number): Promise<Node | null> {
    const sqlite = getSQLiteClient();
    const query = `
      SELECT n.id, n.title, n.description, n.content, n.link, n.type, n.metadata, n.chunk,
             n.chunk_status, n.embedding_updated_at, n.embedding_text,
             n.created_at, n.updated_at,
             COALESCE((SELECT JSON_GROUP_ARRAY(d.dimension)
                       FROM node_dimensions d WHERE d.node_id = n.id), '[]') as dimensions_json
      FROM nodes n
      WHERE n.id = ?
    `;
    const result = await sqlite.query<Node & { dimensions_json: string }>(query, [id]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...row,
      dimensions: JSON.parse(row.dimensions_json || '[]'),
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    };
  }

  async createNode(nodeData: Partial<Node>): Promise<Node> {
    const {
      title,
      description,
      content,
      link,
      type,
      dimensions = [],
      chunk,
      chunk_status,
      metadata = {}
    } = nodeData;
    const now = new Date().toISOString();
    const sqlite = getSQLiteClient();

    // Insert node
    const nodeResult = await sqlite.query(`
      INSERT INTO nodes (title, description, content, link, type, metadata, chunk, chunk_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      title,
      description ?? null,
      content ?? null,
      link ?? null,
      type ?? null,
      JSON.stringify(metadata),
      chunk ?? null,
      chunk_status ?? null,
      now,
      now
    ]);

    const nodeId = nodeResult.lastInsertRowid!;

    // Insert dimensions
    if (dimensions.length > 0) {
      for (const dimension of dimensions) {
        await sqlite.query(
          "INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)",
          [nodeId, dimension]
        );
      }
    }

    // Get the created node with dimensions
    const createdNode = await this.getNodeById(nodeId);
    if (!createdNode) {
      throw new Error('Failed to create node');
    }

    // Broadcast node creation event
    console.log('Broadcasting NODE_CREATED event for:', createdNode.title);
    eventBroadcaster.broadcast({
      type: 'NODE_CREATED',
      data: { node: createdNode }
    });

    return createdNode;
  }

  async updateNode(id: number, updates: Partial<Node>): Promise<Node> {
    const { title, description, content, link, type, dimensions, chunk, metadata } = updates;
    const now = new Date().toISOString();
    const sqlite = getSQLiteClient();

    const existingResult = await sqlite.query<{ id: number }>('SELECT id FROM nodes WHERE id = ?', [id]);

    if (existingResult.rows.length === 0) {
      throw new Error(`Node with ID ${id} not found`);
    }

    // Update node columns (only update provided fields)
    const setFields: string[] = [];
    const params: any[] = [];

    if (title !== undefined) { setFields.push('title = ?'); params.push(title); }
    if (description !== undefined) { setFields.push('description = ?'); params.push(description); }
    if (content !== undefined) { setFields.push('content = ?'); params.push(content); }
    if (link !== undefined) { setFields.push('link = ?'); params.push(link); }
    if (type !== undefined) { setFields.push('type = ?'); params.push(type); }
    if (chunk !== undefined) { setFields.push('chunk = ?'); params.push(chunk); }
    if (Object.prototype.hasOwnProperty.call(updates, 'chunk_status')) {
      setFields.push('chunk_status = ?');
      params.push(updates.chunk_status ?? null);
    }
    if (metadata !== undefined) {
      setFields.push('metadata = ?');
      params.push(JSON.stringify(metadata));
    }

    // Always update timestamp
    setFields.push('updated_at = ?');
    params.push(now);
    params.push(id); // id for WHERE clause

    if (setFields.length > 1) { // More than just updated_at
      await sqlite.query(`UPDATE nodes SET ${setFields.join(', ')} WHERE id = ?`, params);
    }

    // Handle dimensions separately
    if (Array.isArray(dimensions)) {
      await sqlite.query('DELETE FROM node_dimensions WHERE node_id = ?', [id]);
      for (const dim of dimensions) {
        await sqlite.query('INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)', [id, dim]);
      }
    }

    // Get updated node
    const updatedNode = await this.getNodeById(id);
    if (!updatedNode) {
      throw new Error(`Node with ID ${id} not found`);
    }

    // Broadcast node update event
    eventBroadcaster.broadcast({
      type: 'NODE_UPDATED',
      data: { nodeId: id, node: updatedNode }
    });

    return updatedNode;
  }

  async deleteNode(id: number): Promise<void> {
    const sqlite = getSQLiteClient();

    const result = await sqlite.query('DELETE FROM nodes WHERE id = ?', [id]);

    if (result.changes === 0) {
      throw new Error(`Node with ID ${id} not found`);
    }

    // Broadcast node deletion event
    eventBroadcaster.broadcast({
      type: 'NODE_DELETED',
      data: { nodeId: id }
    });
  }

  // Dimension-based filtering methods
  async getNodesByDimension(dimension: string): Promise<Node[]> {
    return this.getNodes({ dimensions: [dimension] });
  }

  async searchNodes(searchTerm: string, limit = 50): Promise<Node[]> {
    return this.getNodes({ search: searchTerm, limit });
  }

  async getNodeCount(): Promise<number> {
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<{ count: number }>('SELECT COUNT(*) as count FROM nodes');
    return Number(result.rows[0].count);
  }

  async bulkUpdateNodes(ids: number[], updates: Partial<Node>): Promise<Node[]> {
    if (ids.length === 0) {
      return [];
    }

    // Update one by one
    const updatedNodes: Node[] = [];
    for (const id of ids) {
      const updated = await this.updateNode(id, updates);
      updatedNodes.push(updated);
    }
    return updatedNodes;
  }

  // Get all unique dimensions for UI filtering
  async getAllDimensions(): Promise<string[]> {
    const sqlite = getSQLiteClient();
    const query = `
      SELECT DISTINCT dimension
      FROM node_dimensions
      ORDER BY dimension
    `;
    const result = await sqlite.query<{dimension: string}>(query);
    return result.rows.map(row => row.dimension);
  }

  // Get dimension usage statistics
  async getDimensionStats(): Promise<{dimension: string, count: number}[]> {
    const sqlite = getSQLiteClient();
    const query = `
      SELECT dimension, COUNT(*) as count
      FROM node_dimensions
      GROUP BY dimension
      ORDER BY count DESC
    `;
    const result = await sqlite.query<{dimension: string, count: number}>(query);
    return result.rows;
  }

}

// Export singleton instance
export const nodeService = new NodeService();

// Legacy export for backwards compatibility during migration
export const itemService = nodeService;
export const ItemService = NodeService;
