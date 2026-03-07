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
const DEFAULT_SKILLS_DIR = path.join(APP_DIR, 'skills');
const SYSTEM_SKILLS_DIR = path.join(__dirname, 'skills');

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
  const skillsDir = process.env.LSH_SKILLS_DIR || fileConfig.skillsDir || DEFAULT_SKILLS_DIR;
  const openAiApiKey = process.env.OPENAI_API_KEY || fileConfig.openAiApiKey || fileConfig.openai_api_key || null;
  return { tursoUrl, tursoToken, skillsDir, openAiApiKey };
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

function slugifyName(name) {
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

function readSkillFile(filePath, immutable) {
  const markdown = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown);
  const fallbackName = path.basename(filePath, '.md');
  const name = slugifyName(frontmatter.name || fallbackName);
  return {
    name,
    title: frontmatter.name || fallbackName,
    description: frontmatter.description || '',
    immutable,
    content: markdown,
    body
  };
}

function listSkills(skillsDir) {
  ensureDir(skillsDir);

  const system = listMarkdownFiles(SYSTEM_SKILLS_DIR).map((f) => readSkillFile(f, true));
  const custom = listMarkdownFiles(skillsDir)
    .map((f) => readSkillFile(f, false))
    .filter((skill) => !system.some((sys) => sys.name === skill.name));

  return [...system, ...custom];
}

function writeSkill(skillsDir, name, content) {
  ensureDir(skillsDir);
  const slug = slugifyName(name);
  if (!slug) {
    throw new Error('Skill name must contain letters or numbers.');
  }

  const systemNames = listMarkdownFiles(SYSTEM_SKILLS_DIR).map((f) => slugifyName(path.basename(f, '.md')));
  if (systemNames.includes(slug)) {
    throw new Error('System skill names cannot be overwritten. Choose a different name.');
  }

  const existingCustom = listMarkdownFiles(skillsDir);
  if (!existingCustom.some((f) => path.basename(f, '.md') === slug) && existingCustom.length >= 10) {
    throw new Error('Maximum of 10 custom skills reached. Delete one before adding another.');
  }

  const filePath = path.join(skillsDir, `${slug}.md`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function deleteSkill(skillsDir, name) {
  ensureDir(skillsDir);
  const slug = slugifyName(name);
  const filePath = path.join(skillsDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Custom skill '${slug}' does not exist.`);
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
  const { tursoUrl, tursoToken, skillsDir, openAiApiKey } = loadConfig();
  if (!tursoUrl) {
    failConfig('Missing Turso URL.');
  }

  const db = createDbClient(tursoUrl, tursoToken);
  ensureDir(skillsDir);

  // Initialize services layer for hybrid search (vector + FTS + fallback)
  const { createLsHubServices } = require('./services/index.js');
  const services = createLsHubServices({ db, tursoUrl, tursoToken });

  const server = new McpServer(
    { name: 'latent-space-hub-mcp', version: '0.1.0' },
    {
      instructions:
        'Latent Space Hub MCP server. Call ls_read_skill("start-here") first for orientation. Search nodes before creating new ones. Create explicit edges with explanations.'
    }
  );

  server.registerTool(
    'ls_get_context',
    {
      title: 'Get context',
      description: 'Get knowledge base stats, top nodes, dimensions, and available skills. For operational guidance, read the "start-here" skill.',
      inputSchema: {},
      outputSchema: {
        stats: z.record(z.number()),
        hubNodes: z.array(z.object({ id: z.number(), title: z.string(), degree: z.number() })),
        dimensions: z.array(z.object({ name: z.string(), count: z.number() })),
        skills: z.array(z.object({ name: z.string(), description: z.string(), immutable: z.boolean() }))
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

      const skills = listSkills(skillsDir).map((g) => ({ name: g.name, description: g.description, immutable: g.immutable }));
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
        structuredContent: { stats, hubNodes, dimensions, skills }
      };
    }
  );

  server.registerTool(
    'ls_search_nodes',
    {
      title: 'Search nodes',
      description: 'Hybrid search across nodes — uses vector similarity (when OpenAI key available) combined with keyword matching. Finds entities, guests, topics, and content nodes by meaning.',
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
      // Use services layer for keyword search (it handles all filtering)
      const keywordResult = await services.searchNodes(query, {
        limit,
        dimensions,
        node_type,
        event_after,
        event_before,
        sortBy
      });

      // If OpenAI key available, also run node vector search and merge
      let method = 'keyword';
      let formatted = keywordResult.nodes;

      if (openAiApiKey) {
        try {
          const embedding = await services.nodeVectorSearch
            ? null // will use queryKnowledgeContext pattern
            : null;

          // Use the maybeGetQueryEmbedding pattern from services
          const { createLsHubServices: _ } = require('./services/index.js');
          const fetch = globalThis.fetch;
          let queryEmbedding = null;
          try {
            const r = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: { Authorization: `Bearer ${openAiApiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: 'text-embedding-3-small', input: query.trim() })
            });
            if (r.ok) {
              const json = await r.json();
              queryEmbedding = json?.data?.[0]?.embedding || null;
            }
          } catch {}

          if (queryEmbedding) {
            const vectorHits = await services.nodeVectorSearch(queryEmbedding, limit * 2).catch(() => []);

            if (vectorHits.length > 0) {
              // Merge vector results with keyword results using RRF
              const keywordHits = formatted.map((n) => ({
                source: 'keyword',
                score: 0.5,
                nodeId: n.id,
                title: n.title,
                description: n.description || '',
                excerpt: (n.notes || '').slice(0, 700),
                link: n.link || '',
                eventDate: n.event_date || '',
                nodeType: n.node_type || ''
              }));

              const merged = services.fuseHybrid(vectorHits, keywordHits, limit);
              method = 'hybrid';

              // Fetch dimensions for merged results
              const mergedNodeIds = merged.map((h) => h.nodeId);
              const dimMap = await fetchDimensionsByNodeIds(db, mergedNodeIds);

              formatted = merged.map((hit) => ({
                id: hit.nodeId,
                title: hit.title,
                notes: null,
                description: hit.description || null,
                link: hit.link || null,
                node_type: hit.nodeType || null,
                event_date: hit.eventDate || null,
                dimensions: dimMap.get(hit.nodeId) || [],
                updated_at: ''
              }));
            }
          }
        } catch {
          // Vector search failed, keyword results stand
        }
      }

      return {
        content: [{ type: 'text', text: `Found ${formatted.length} matching node(s) (${method}).` }],
        structuredContent: { count: formatted.length, method, nodes: formatted }
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
      description: 'Hybrid search over chunk text and nodes — uses vector similarity + FTS5 + keyword fallback with Reciprocal Rank Fusion. Finds relevant transcript passages, articles, and node content by meaning.',
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().min(1).max(20).optional(),
        node_id: z.number().int().positive().optional()
      }
    },
    async ({ query, limit = 5, node_id }) => {
      // If scoped to a specific node, use direct FTS/LIKE (no vector needed)
      if (node_id) {
        const scoped = await services.searchContent(query, { limit, node_id });
        return {
          content: [{ type: 'text', text: `Found ${scoped.count} matching chunk(s) in node ${node_id}.` }],
          structuredContent: { count: scoped.count, method: 'scoped_fts', results: scoped.results }
        };
      }

      // Use the full hybrid search pipeline (vector + FTS + node fallback + RRF)
      const result = await services.queryKnowledgeContext(query, {
        limit,
        openAiApiKey: openAiApiKey || undefined
      });

      const results = result.hits.map((hit) => ({
        node_id: hit.nodeId,
        title: hit.title,
        description: hit.description || '',
        text: hit.excerpt || '',
        link: hit.link || '',
        event_date: hit.eventDate || '',
        node_type: hit.nodeType || '',
        score: hit.score || 0
      }));

      return {
        content: [{ type: 'text', text: `Found ${results.length} result(s) (${result.method}).` }],
        structuredContent: { count: results.length, method: result.method, results }
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

  // Skill tools (new names)
  const listSkillsHandler = async () => {
    const skills = listSkills(skillsDir).map((g) => ({
      name: g.name,
      description: g.description,
      immutable: g.immutable
    }));

    return {
      content: [{ type: 'text', text: `Loaded ${skills.length} skill(s).` }],
      structuredContent: { count: skills.length, skills }
    };
  };

  const readSkillHandler = async ({ name }) => {
    const slug = slugifyName(name);
    const skills = listSkills(skillsDir);
    const skill = skills.find((g) => g.name === slug);
    if (!skill) {
      throw new Error(`Skill '${slug}' not found.`);
    }

    return {
      content: [{ type: 'text', text: skill.content }],
      structuredContent: {
        name: skill.name,
        description: skill.description,
        immutable: skill.immutable,
        content: skill.content
      }
    };
  };

  const writeSkillHandler = async ({ name, content }) => {
    const filePath = writeSkill(skillsDir, name, content);
    return {
      content: [{ type: 'text', text: `Wrote skill '${slugifyName(name)}'.` }],
      structuredContent: { success: true, filePath }
    };
  };

  const deleteSkillHandler = async ({ name }) => {
    deleteSkill(skillsDir, name);
    return {
      content: [{ type: 'text', text: `Deleted custom skill '${slugifyName(name)}'.` }],
      structuredContent: { success: true }
    };
  };

  // Register skill tools
  server.registerTool(
    'ls_list_skills',
    { title: 'List skills', description: 'List system and custom skills.', inputSchema: {} },
    listSkillsHandler
  );

  server.registerTool(
    'ls_read_skill',
    { title: 'Read skill', description: 'Read a skill by name.', inputSchema: { name: z.string().min(1) } },
    readSkillHandler
  );

  server.registerTool(
    'ls_write_skill',
    { title: 'Write skill', description: 'Create or overwrite a custom skill.', inputSchema: { name: z.string().min(1), content: z.string().min(1) } },
    writeSkillHandler
  );

  server.registerTool(
    'ls_delete_skill',
    { title: 'Delete skill', description: 'Delete a custom skill.', inputSchema: { name: z.string().min(1) } },
    deleteSkillHandler
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[latent-space-hub-mcp] Fatal error:', error?.message || error);
  process.exit(1);
});
