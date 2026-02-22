#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createClient } = require('@libsql/client');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const APP_DIR = path.join(os.homedir(), '.latent-space-hub');
const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const DEFAULT_GUIDES_DIR = path.join(APP_DIR, 'guides');
const SYSTEM_GUIDES_DIR = path.join(__dirname, 'guides', 'system');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadConfig() {
  const fileConfig = readJsonFile(CONFIG_PATH) || {};
  const tursoUrl = process.env.TURSO_DATABASE_URL || fileConfig.tursoUrl || fileConfig.turso_url;
  const tursoToken = process.env.TURSO_AUTH_TOKEN || fileConfig.tursoToken || fileConfig.turso_token;
  const guidesDir = process.env.LSH_GUIDES_DIR || fileConfig.guidesDir || DEFAULT_GUIDES_DIR;
  return { tursoUrl, tursoToken, guidesDir };
}

function failConfig(message) {
  console.error(`[latent-space-hub-mcp] ${message}`);
  console.error('[latent-space-hub-mcp] Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, or create ~/.latent-space-hub/config.json');
  process.exit(1);
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) {
    return { frontmatter: {}, body: markdown };
  }

  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: {}, body: markdown };
  }

  const fm = markdown.slice(4, end).split('\n');
  const body = markdown.slice(end + 5);
  const frontmatter = {};

  for (const line of fm) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    frontmatter[key] = value.replace(/^"|"$/g, '');
  }

  return { frontmatter, body };
}

function slugifyGuideName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
}

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => path.join(dirPath, entry));
}

function readGuideFile(filePath, immutable) {
  const markdown = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown);
  const fallbackName = path.basename(filePath, '.md');
  const name = slugifyGuideName(frontmatter.name || fallbackName);
  return {
    name,
    title: frontmatter.name || fallbackName,
    description: frontmatter.description || '',
    immutable,
    content: markdown,
    body
  };
}

function listGuides(guidesDir) {
  ensureDir(guidesDir);

  const system = listMarkdownFiles(SYSTEM_GUIDES_DIR).map((f) => readGuideFile(f, true));
  const custom = listMarkdownFiles(guidesDir)
    .map((f) => readGuideFile(f, false))
    .filter((guide) => !system.some((sys) => sys.name === guide.name));

  return [...system, ...custom];
}

function writeGuide(guidesDir, name, content) {
  ensureDir(guidesDir);
  const slug = slugifyGuideName(name);
  if (!slug) {
    throw new Error('Guide name must contain letters or numbers.');
  }

  const systemNames = listMarkdownFiles(SYSTEM_GUIDES_DIR).map((f) => slugifyGuideName(path.basename(f, '.md')));
  if (systemNames.includes(slug)) {
    throw new Error('System guide names are immutable. Choose a different guide name.');
  }

  const existingCustom = listMarkdownFiles(guidesDir);
  if (!existingCustom.some((f) => path.basename(f, '.md') === slug) && existingCustom.length >= 10) {
    throw new Error('Maximum of 10 custom guides reached. Delete one before adding another.');
  }

  const filePath = path.join(guidesDir, `${slug}.md`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function deleteGuide(guidesDir, name) {
  ensureDir(guidesDir);
  const slug = slugifyGuideName(name);
  const filePath = path.join(guidesDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Custom guide '${slug}' does not exist.`);
  }
  fs.unlinkSync(filePath);
}

function createDbClient(tursoUrl, tursoToken) {
  return createClient({
    url: tursoUrl,
    authToken: tursoToken
  });
}

async function runQuery(db, sql, args = []) {
  return db.execute({ sql, args });
}

async function fetchDimensionsByNodeIds(db, nodeIds) {
  if (!nodeIds.length) return new Map();

  const placeholders = nodeIds.map(() => '?').join(',');
  const result = await runQuery(
    db,
    `SELECT node_id, dimension FROM node_dimensions WHERE node_id IN (${placeholders}) ORDER BY dimension ASC`,
    nodeIds
  );

  const map = new Map();
  for (const row of result.rows || []) {
    const nodeId = Number(row.node_id);
    if (!map.has(nodeId)) {
      map.set(nodeId, []);
    }
    map.get(nodeId).push(String(row.dimension));
  }

  return map;
}

function jsonFromContext(value) {
  if (!value) return {};
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return {};
  }
}

const addNodeInputSchema = {
  title: z.string().min(1).max(160),
  content: z.string().max(20000).optional(),
  link: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  dimensions: z.array(z.string()).min(1).max(5),
  metadata: z.record(z.any()).optional(),
  chunk: z.string().max(50000).optional(),
  node_type: z.string().optional(),
  event_date: z.string().optional()
};

const updateNodeInputSchema = {
  id: z.number().int().positive(),
  updates: z.object({
    title: z.string().max(160).optional(),
    content: z.string().max(20000).optional(),
    link: z.string().url().optional(),
    description: z.string().max(2000).optional(),
    dimensions: z.array(z.string()).min(1).max(5).optional(),
    metadata: z.record(z.any()).optional(),
    node_type: z.string().optional(),
    event_date: z.string().optional()
  })
};

async function main() {
  const { tursoUrl, tursoToken, guidesDir } = loadConfig();
  if (!tursoUrl) {
    failConfig('Missing Turso URL.');
  }

  const db = createDbClient(tursoUrl, tursoToken);
  ensureDir(guidesDir);

  const server = new McpServer(
    { name: 'latent-space-hub-mcp', version: '0.1.0' },
    {
      instructions:
        'Latent Space Hub MCP server. Search nodes before creating new ones. Create explicit edges with explanations.'
    }
  );

  server.registerTool(
    'ls_get_context',
    {
      title: 'Get context',
      description: 'Get knowledge base stats, top nodes, dimensions, and available guides.',
      inputSchema: {},
      outputSchema: {
        stats: z.record(z.number()),
        hubNodes: z.array(z.object({ id: z.number(), title: z.string(), degree: z.number() })),
        dimensions: z.array(z.object({ name: z.string(), count: z.number() })),
        guides: z.array(z.object({ name: z.string(), description: z.string(), immutable: z.boolean() }))
      }
    },
    async () => {
      const [nodesRes, edgesRes, dimsRes, chunksRes, hubRes, dimCountRes] = await Promise.all([
        runQuery(db, 'SELECT COUNT(*) AS c FROM nodes'),
        runQuery(db, 'SELECT COUNT(*) AS c FROM edges'),
        runQuery(db, 'SELECT COUNT(*) AS c FROM dimensions'),
        runQuery(db, 'SELECT COUNT(*) AS c FROM chunks'),
        runQuery(
          db,
          `SELECT n.id, n.title,
                  COALESCE((SELECT COUNT(*) FROM edges e WHERE e.from_node_id = n.id OR e.to_node_id = n.id), 0) AS degree
             FROM nodes n
            ORDER BY degree DESC, n.updated_at DESC
            LIMIT 10`
        ),
        runQuery(
          db,
          `SELECT d.name, COUNT(nd.id) AS count
             FROM dimensions d
             LEFT JOIN node_dimensions nd ON nd.dimension = d.name
            GROUP BY d.name
            ORDER BY count DESC, d.name ASC
            LIMIT 25`
        )
      ]);

      const guides = listGuides(guidesDir).map((g) => ({ name: g.name, description: g.description, immutable: g.immutable }));
      const stats = {
        nodes: Number(nodesRes.rows?.[0]?.c || 0),
        edges: Number(edgesRes.rows?.[0]?.c || 0),
        dimensions: Number(dimsRes.rows?.[0]?.c || 0),
        chunks: Number(chunksRes.rows?.[0]?.c || 0)
      };

      const hubNodes = (hubRes.rows || []).map((row) => ({
        id: Number(row.id),
        title: String(row.title || ''),
        degree: Number(row.degree || 0)
      }));

      const dimensions = (dimCountRes.rows || []).map((row) => ({
        name: String(row.name),
        count: Number(row.count || 0)
      }));

      return {
        content: [{ type: 'text', text: `Loaded context for LS Hub (${stats.nodes} nodes, ${stats.edges} edges).` }],
        structuredContent: { stats, hubNodes, dimensions, guides }
      };
    }
  );

  server.registerTool(
    'ls_search_nodes',
    {
      title: 'Search nodes',
      description: 'Keyword search across titles, descriptions, and notes.',
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().min(1).max(25).optional(),
        dimensions: z.array(z.string()).max(5).optional(),
        node_type: z.string().optional(),
        event_after: z.string().optional(),
        event_before: z.string().optional(),
        sortBy: z.enum(['updated', 'event_date']).optional()
      }
    },
    async ({ query, limit = 10, dimensions = [], node_type, event_after, event_before, sortBy = 'updated' }) => {
      const safeLimit = Math.min(Math.max(limit, 1), 25);
      const like = `%${query.trim()}%`;
      const normalizedNodeType = typeof node_type === 'string' && node_type.trim() ? node_type.trim() : null;
      const normalizedEventAfter =
        typeof event_after === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event_after.trim())
          ? event_after.trim()
          : null;
      const normalizedEventBefore =
        typeof event_before === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event_before.trim())
          ? event_before.trim()
          : null;

      const args = [like, like, like];
      let where = '(n.title LIKE ? OR n.description LIKE ? OR n.notes LIKE ?)';

      if (dimensions.length > 0) {
        const placeholders = dimensions.map(() => '?').join(',');
        where += ` AND EXISTS (SELECT 1 FROM node_dimensions nd WHERE nd.node_id = n.id AND nd.dimension IN (${placeholders}))`;
        args.push(...dimensions);
      }

      if (normalizedNodeType) {
        where += ' AND n.node_type = ?';
        args.push(normalizedNodeType);
      }

      if (normalizedEventAfter) {
        where += ' AND n.event_date IS NOT NULL AND n.event_date >= ?';
        args.push(normalizedEventAfter);
      }

      if (normalizedEventBefore) {
        where += ' AND n.event_date IS NOT NULL AND n.event_date <= ?';
        args.push(normalizedEventBefore);
      }

      const orderBy =
        sortBy === 'event_date' || normalizedEventAfter || normalizedEventBefore
          ? 'n.event_date DESC NULLS LAST, n.updated_at DESC'
          : 'n.updated_at DESC';

      args.push(safeLimit);

      const result = await runQuery(
        db,
        `SELECT n.id, n.title, n.notes, n.description, n.link, n.node_type, n.event_date, n.updated_at
           FROM nodes n
          WHERE ${where}
          ORDER BY ${orderBy}
          LIMIT ?`,
        args
      );

      const nodes = result.rows || [];
      const nodeIds = nodes.map((r) => Number(r.id));
      const dimMap = await fetchDimensionsByNodeIds(db, nodeIds);

      const formatted = nodes.map((row) => ({
        id: Number(row.id),
        title: String(row.title || ''),
        notes: row.notes == null ? null : String(row.notes),
        description: row.description == null ? null : String(row.description),
        link: row.link == null ? null : String(row.link),
        node_type: row.node_type == null ? null : String(row.node_type),
        event_date: row.event_date == null ? null : String(row.event_date),
        dimensions: dimMap.get(Number(row.id)) || [],
        updated_at: String(row.updated_at || '')
      }));

      return {
        content: [{ type: 'text', text: `Found ${formatted.length} matching node(s).` }],
        structuredContent: { count: formatted.length, nodes: formatted }
      };
    }
  );

  server.registerTool(
    'ls_get_nodes',
    {
      title: 'Get nodes by ID',
      description: 'Load full node records by their IDs.',
      inputSchema: {
        nodeIds: z.array(z.number().int().positive()).min(1).max(10)
      }
    },
    async ({ nodeIds }) => {
      const placeholders = nodeIds.map(() => '?').join(',');
      const result = await runQuery(
        db,
        `SELECT id, title, notes, description, link, node_type, event_date, chunk, metadata, created_at, updated_at
           FROM nodes
          WHERE id IN (${placeholders})
          ORDER BY updated_at DESC`,
        nodeIds
      );

      const rows = result.rows || [];
      const dimMap = await fetchDimensionsByNodeIds(db, rows.map((r) => Number(r.id)));
      const nodes = rows.map((row) => ({
        id: Number(row.id),
        title: String(row.title || ''),
        notes: row.notes == null ? null : String(row.notes),
        description: row.description == null ? null : String(row.description),
        link: row.link == null ? null : String(row.link),
        node_type: row.node_type == null ? null : String(row.node_type),
        event_date: row.event_date == null ? null : String(row.event_date),
        chunk: row.chunk == null ? null : String(row.chunk),
        metadata: row.metadata == null ? null : jsonFromContext(row.metadata),
        dimensions: dimMap.get(Number(row.id)) || [],
        created_at: String(row.created_at || ''),
        updated_at: String(row.updated_at || '')
      }));

      return {
        content: [{ type: 'text', text: `Loaded ${nodes.length} node(s).` }],
        structuredContent: { count: nodes.length, nodes }
      };
    }
  );

  server.registerTool(
    'ls_add_node',
    {
      title: 'Add node',
      description: 'Create a new node in Latent Space Hub.',
      inputSchema: addNodeInputSchema
    },
    async ({ title, content, link, description, dimensions, metadata, chunk, node_type, event_date }) => {
      const uniqueDimensions = Array.from(new Set((dimensions || []).map((d) => String(d).trim()).filter(Boolean))).slice(0, 5);
      if (uniqueDimensions.length === 0) {
        throw new Error('At least one dimension is required.');
      }

      const nodeInsert = await runQuery(
        db,
        `INSERT INTO nodes (title, notes, link, description, node_type, event_date, metadata, chunk)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id, title`,
        [
          title.trim(),
          content ? content.trim() : null,
          link ? link.trim() : null,
          description ? description.trim() : null,
          node_type ? String(node_type).trim() : null,
          event_date ? String(event_date).trim() : null,
          metadata ? JSON.stringify(metadata) : null,
          chunk ? chunk.trim() : null
        ]
      );

      const node = nodeInsert.rows?.[0];
      if (!node) {
        throw new Error('Failed to create node.');
      }

      for (const dimension of uniqueDimensions) {
        await runQuery(
          db,
          'INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)',
          [Number(node.id), dimension]
        );
      }

      return {
        content: [{ type: 'text', text: `Created node #${node.id}: ${node.title}` }],
        structuredContent: {
          nodeId: Number(node.id),
          title: String(node.title),
          dimensions: uniqueDimensions
        }
      };
    }
  );

  server.registerTool(
    'ls_update_node',
    {
      title: 'Update node',
      description: 'Update node fields. Content is appended to notes when provided.',
      inputSchema: updateNodeInputSchema
    },
    async ({ id, updates }) => {
      const setClauses = [];
      const args = [];

      if (updates.title != null) {
        setClauses.push('title = ?');
        args.push(updates.title.trim());
      }
      if (updates.link != null) {
        setClauses.push('link = ?');
        args.push(updates.link.trim());
      }
      if (updates.description != null) {
        setClauses.push('description = ?');
        args.push(updates.description.trim());
      }
      if (updates.node_type != null) {
        setClauses.push('node_type = ?');
        args.push(String(updates.node_type).trim());
      }
      if (updates.event_date != null) {
        setClauses.push('event_date = ?');
        args.push(String(updates.event_date).trim());
      }
      if (updates.metadata != null) {
        setClauses.push('metadata = ?');
        args.push(JSON.stringify(updates.metadata));
      }
      if (updates.content != null) {
        setClauses.push("notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || '\n\n' || ? END");
        args.push(updates.content.trim(), updates.content.trim());
      }

      if (setClauses.length > 0) {
        args.push(id);
        await runQuery(db, `UPDATE nodes SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, args);
      }

      if (Array.isArray(updates.dimensions) && updates.dimensions.length > 0) {
        const uniqueDimensions = Array.from(new Set(updates.dimensions.map((d) => String(d).trim()).filter(Boolean))).slice(0, 5);
        await runQuery(db, 'DELETE FROM node_dimensions WHERE node_id = ?', [id]);
        for (const dimension of uniqueDimensions) {
          await runQuery(db, 'INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)', [id, dimension]);
        }
      }

      return {
        content: [{ type: 'text', text: `Updated node #${id}.` }],
        structuredContent: { success: true, nodeId: id }
      };
    }
  );

  server.registerTool(
    'ls_query_edges',
    {
      title: 'Query edges',
      description: 'Find connections between nodes.',
      inputSchema: {
        nodeId: z.number().int().positive().optional(),
        limit: z.number().min(1).max(50).optional()
      }
    },
    async ({ nodeId, limit = 25 }) => {
      const safeLimit = Math.min(Math.max(limit, 1), 50);
      const args = [];
      let where = '';
      if (nodeId) {
        where = 'WHERE from_node_id = ? OR to_node_id = ?';
        args.push(nodeId, nodeId);
      }
      args.push(safeLimit);

      const res = await runQuery(
        db,
        `SELECT id, from_node_id, to_node_id, context, source, created_at, updated_at
           FROM edges
           ${where}
          ORDER BY updated_at DESC
          LIMIT ?`,
        args
      );

      const edges = (res.rows || []).map((row) => {
        const context = jsonFromContext(row.context);
        return {
          id: Number(row.id),
          from_node_id: Number(row.from_node_id),
          to_node_id: Number(row.to_node_id),
          explanation: context.explanation || '',
          type: context.type || null,
          source: row.source == null ? null : String(row.source)
        };
      });

      return {
        content: [{ type: 'text', text: `Found ${edges.length} edge(s).` }],
        structuredContent: { count: edges.length, edges }
      };
    }
  );

  server.registerTool(
    'ls_create_edge',
    {
      title: 'Create edge',
      description: 'Connect two nodes with a directional relationship.',
      inputSchema: {
        sourceId: z.number().int().positive(),
        targetId: z.number().int().positive(),
        explanation: z.string().min(1)
      }
    },
    async ({ sourceId, targetId, explanation }) => {
      const context = JSON.stringify({ explanation: explanation.trim(), type: 'related_to' });
      const res = await runQuery(
        db,
        `INSERT INTO edges (from_node_id, to_node_id, context, source)
         VALUES (?, ?, ?, ?)
         RETURNING id`,
        [sourceId, targetId, context, 'user']
      );
      const edgeId = Number(res.rows?.[0]?.id);

      return {
        content: [{ type: 'text', text: `Created edge #${edgeId}: ${sourceId} -> ${targetId}` }],
        structuredContent: { success: true, edgeId }
      };
    }
  );

  server.registerTool(
    'ls_update_edge',
    {
      title: 'Update edge',
      description: 'Update edge explanation in context JSON.',
      inputSchema: {
        id: z.number().int().positive(),
        explanation: z.string().min(1)
      }
    },
    async ({ id, explanation }) => {
      const current = await runQuery(db, 'SELECT context FROM edges WHERE id = ?', [id]);
      if (!current.rows?.[0]) {
        throw new Error(`Edge ${id} not found.`);
      }

      const context = jsonFromContext(current.rows[0].context);
      context.explanation = explanation.trim();
      if (!context.type) {
        context.type = 'related_to';
      }

      await runQuery(db, 'UPDATE edges SET context = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(context), id]);

      return {
        content: [{ type: 'text', text: `Updated edge #${id}.` }],
        structuredContent: { success: true, edgeId: id }
      };
    }
  );

  server.registerTool(
    'ls_list_dimensions',
    {
      title: 'List dimensions',
      description: 'List all dimensions and node counts.',
      inputSchema: {}
    },
    async () => {
      const res = await runQuery(
        db,
        `SELECT d.name, d.description, d.icon, d.is_priority, COUNT(nd.id) AS count
         FROM dimensions d
         LEFT JOIN node_dimensions nd ON nd.dimension = d.name
         GROUP BY d.name, d.description, d.icon, d.is_priority
         ORDER BY count DESC, d.name ASC`
      );

      const dimensions = (res.rows || []).map((row) => ({
        name: String(row.name),
        description: row.description == null ? null : String(row.description),
        icon: row.icon == null ? null : String(row.icon),
        isPriority: Boolean(Number(row.is_priority || 0)),
        count: Number(row.count || 0)
      }));

      return {
        content: [{ type: 'text', text: `Loaded ${dimensions.length} dimension(s).` }],
        structuredContent: { count: dimensions.length, dimensions }
      };
    }
  );

  server.registerTool(
    'ls_create_dimension',
    {
      title: 'Create dimension',
      description: 'Create a new dimension/tag.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        isPriority: z.boolean().optional()
      }
    },
    async ({ name, description, isPriority = false }) => {
      await runQuery(
        db,
        `INSERT INTO dimensions (name, description, is_priority)
         VALUES (?, ?, ?)` ,
        [name.trim().toLowerCase(), description ? description.trim() : null, isPriority ? 1 : 0]
      );

      return {
        content: [{ type: 'text', text: `Created dimension '${name}'.` }],
        structuredContent: { success: true, dimension: name.trim().toLowerCase() }
      };
    }
  );

  server.registerTool(
    'ls_update_dimension',
    {
      title: 'Update dimension',
      description: 'Rename or update dimension metadata.',
      inputSchema: {
        name: z.string().min(1),
        newName: z.string().optional(),
        description: z.string().optional(),
        isPriority: z.boolean().optional()
      }
    },
    async ({ name, newName, description, isPriority }) => {
      const updates = [];
      const args = [];

      if (newName != null) {
        updates.push('name = ?');
        args.push(newName.trim().toLowerCase());
      }
      if (description != null) {
        updates.push('description = ?');
        args.push(description.trim());
      }
      if (isPriority != null) {
        updates.push('is_priority = ?');
        args.push(isPriority ? 1 : 0);
      }

      if (updates.length === 0) {
        throw new Error('No updates provided.');
      }

      args.push(name.trim().toLowerCase());
      await runQuery(db, `UPDATE dimensions SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE name = ?`, args);

      return {
        content: [{ type: 'text', text: `Updated dimension '${name}'.` }],
        structuredContent: { success: true }
      };
    }
  );

  server.registerTool(
    'ls_delete_dimension',
    {
      title: 'Delete dimension',
      description: 'Delete dimension and its node links.',
      inputSchema: {
        name: z.string().min(1)
      }
    },
    async ({ name }) => {
      const dim = name.trim().toLowerCase();
      await runQuery(db, 'DELETE FROM node_dimensions WHERE dimension = ?', [dim]);
      await runQuery(db, 'DELETE FROM dimensions WHERE name = ?', [dim]);
      return {
        content: [{ type: 'text', text: `Deleted dimension '${dim}'.` }],
        structuredContent: { success: true }
      };
    }
  );

  server.registerTool(
    'ls_search_content',
    {
      title: 'Search content',
      description: 'Search chunk text (FTS preferred, LIKE fallback).',
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().min(1).max(20).optional(),
        node_id: z.number().int().positive().optional()
      }
    },
    async ({ query, limit = 5, node_id }) => {
      const safeLimit = Math.min(Math.max(limit, 1), 20);
      let rows = [];

      try {
        const ftsArgs = [query.trim()];
        let nodeFilter = '';
        if (node_id) {
          nodeFilter = 'AND c.node_id = ?';
          ftsArgs.push(node_id);
        }
        ftsArgs.push(safeLimit);

        const res = await runQuery(
          db,
          `SELECT c.node_id, n.title, c.id AS chunk_id, c.text, bm25(chunks_fts) AS score
             FROM chunks_fts
             JOIN chunks c ON c.id = chunks_fts.rowid
             JOIN nodes n ON n.id = c.node_id
            WHERE chunks_fts MATCH ? ${nodeFilter}
            ORDER BY score
            LIMIT ?`,
          ftsArgs
        );

        rows = res.rows || [];
      } catch {
        const like = `%${query.trim()}%`;
        const likeArgs = [like];
        let where = 'WHERE c.text LIKE ?';
        if (node_id) {
          where += ' AND c.node_id = ?';
          likeArgs.push(node_id);
        }
        likeArgs.push(safeLimit);

        const res = await runQuery(
          db,
          `SELECT c.node_id, n.title, c.id AS chunk_id, c.text
             FROM chunks c
             JOIN nodes n ON n.id = c.node_id
             ${where}
            ORDER BY c.id DESC
            LIMIT ?`,
          likeArgs
        );

        rows = res.rows || [];
      }

      const results = rows.map((row) => ({
        node_id: Number(row.node_id),
        chunk_id: Number(row.chunk_id),
        title: String(row.title || ''),
        text: String(row.text || '').slice(0, 800),
        score: row.score == null ? null : Number(row.score)
      }));

      return {
        content: [{ type: 'text', text: `Found ${results.length} matching chunk(s).` }],
        structuredContent: { count: results.length, results }
      };
    }
  );

  server.registerTool(
    'ls_sqlite_query',
    {
      title: 'Read-only SQL query',
      description: 'Execute read-only SQL (SELECT/WITH/PRAGMA only).',
      inputSchema: {
        sql: z.string().min(1)
      }
    },
    async ({ sql }) => {
      const normalized = sql.trim().toUpperCase();
      if (!(normalized.startsWith('SELECT') || normalized.startsWith('WITH') || normalized.startsWith('PRAGMA'))) {
        throw new Error('Only read-only SQL is allowed (SELECT/WITH/PRAGMA).');
      }

      const res = await runQuery(db, sql, []);
      return {
        content: [{ type: 'text', text: `Query returned ${(res.rows || []).length} row(s).` }],
        structuredContent: {
          columns: res.columns || [],
          rows: res.rows || []
        }
      };
    }
  );

  server.registerTool(
    'ls_list_guides',
    {
      title: 'List guides',
      description: 'List system and custom guides.',
      inputSchema: {}
    },
    async () => {
      const guides = listGuides(guidesDir).map((g) => ({
        name: g.name,
        description: g.description,
        immutable: g.immutable
      }));

      return {
        content: [{ type: 'text', text: `Loaded ${guides.length} guide(s).` }],
        structuredContent: { count: guides.length, guides }
      };
    }
  );

  server.registerTool(
    'ls_read_guide',
    {
      title: 'Read guide',
      description: 'Read a guide by name.',
      inputSchema: {
        name: z.string().min(1)
      }
    },
    async ({ name }) => {
      const slug = slugifyGuideName(name);
      const guides = listGuides(guidesDir);
      const guide = guides.find((g) => g.name === slug);
      if (!guide) {
        throw new Error(`Guide '${slug}' not found.`);
      }

      return {
        content: [{ type: 'text', text: guide.content }],
        structuredContent: {
          name: guide.name,
          description: guide.description,
          immutable: guide.immutable,
          content: guide.content
        }
      };
    }
  );

  server.registerTool(
    'ls_write_guide',
    {
      title: 'Write guide',
      description: 'Create or overwrite a custom guide.',
      inputSchema: {
        name: z.string().min(1),
        content: z.string().min(1)
      }
    },
    async ({ name, content }) => {
      const filePath = writeGuide(guidesDir, name, content);
      return {
        content: [{ type: 'text', text: `Wrote guide '${slugifyGuideName(name)}'.` }],
        structuredContent: { success: true, filePath }
      };
    }
  );

  server.registerTool(
    'ls_delete_guide',
    {
      title: 'Delete guide',
      description: 'Delete a custom guide.',
      inputSchema: {
        name: z.string().min(1)
      }
    },
    async ({ name }) => {
      deleteGuide(guidesDir, name);
      return {
        content: [{ type: 'text', text: `Deleted custom guide '${slugifyGuideName(name)}'.` }],
        structuredContent: { success: true }
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[latent-space-hub-mcp] Fatal error:', error?.message || error);
  process.exit(1);
});
