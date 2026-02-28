'use strict';

const { createClient } = require('@libsql/client');

function vectorToJsonString(vector) {
  return `[${vector.join(',')}]`;
}

function normalizeLimit(limit, min, max, fallback) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeIsoDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeNodeType(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSortBy(value) {
  return value === 'event_date' || value === 'updated' ? value : null;
}

async function maybeGetQueryEmbedding(query, openAiApiKey, model = 'text-embedding-3-small') {
  if (!openAiApiKey) return null;

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: query
      })
    });

    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    const embedding = json?.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding : null;
  } catch {
    return null;
  }
}

function createLsHubServices(options = {}) {
  const db = options.db || createClient({ url: options.tursoUrl, authToken: options.tursoToken });

  async function execute(sql, args = []) {
    return db.execute({ sql, args });
  }

  async function fetchDimensionsByNodeIds(nodeIds) {
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
      return new Map();
    }

    const placeholders = nodeIds.map(() => '?').join(',');
    const result = await execute(
      `SELECT node_id, dimension
         FROM node_dimensions
        WHERE node_id IN (${placeholders})
        ORDER BY dimension ASC`,
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

  async function searchNodes(query, options = {}) {
    const safeLimit = normalizeLimit(options.limit, 1, 25, 10);
    const dimensions = Array.isArray(options.dimensions)
      ? options.dimensions.map((d) => String(d).trim()).filter(Boolean).slice(0, 5)
      : [];
    const nodeType = normalizeNodeType(options.node_type);
    const eventAfter = normalizeIsoDate(options.event_after);
    const eventBefore = normalizeIsoDate(options.event_before);
    const sortBy = normalizeSortBy(options.sortBy);

    const like = `%${String(query).trim()}%`;
    const args = [like, like, like];
    let where = '(n.title LIKE ? OR n.description LIKE ? OR n.notes LIKE ?)';

    if (dimensions.length > 0) {
      const placeholders = dimensions.map(() => '?').join(',');
      where += ` AND EXISTS (SELECT 1 FROM node_dimensions nd WHERE nd.node_id = n.id AND nd.dimension IN (${placeholders}))`;
      args.push(...dimensions);
    }

    if (nodeType) {
      where += ' AND n.node_type = ?';
      args.push(nodeType);
    }

    if (eventAfter) {
      where += ' AND n.event_date IS NOT NULL AND n.event_date >= ?';
      args.push(eventAfter);
    }

    if (eventBefore) {
      where += ' AND n.event_date IS NOT NULL AND n.event_date <= ?';
      args.push(eventBefore);
    }

    const orderBy =
      sortBy === 'event_date' || eventAfter || eventBefore
        ? 'n.event_date DESC NULLS LAST, n.updated_at DESC'
        : 'n.updated_at DESC';

    args.push(safeLimit);

    const result = await execute(
      `SELECT n.id, n.title, n.notes, n.description, n.link, n.node_type, n.event_date, n.updated_at
         FROM nodes n
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ?`,
      args
    );

    const rows = result.rows || [];
    const dimMap = await fetchDimensionsByNodeIds(rows.map((r) => Number(r.id)));

    const nodes = rows.map((row) => ({
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

    return { count: nodes.length, nodes };
  }

  async function searchContent(query, options = {}) {
    const safeLimit = normalizeLimit(options.limit, 1, 20, 5);
    const nodeId = options.node_id != null ? Number(options.node_id) : null;
    const rows = [];

    try {
      const ftsArgs = [String(query).trim()];
      let nodeFilter = '';
      if (nodeId) {
        nodeFilter = 'AND c.node_id = ?';
        ftsArgs.push(nodeId);
      }
      ftsArgs.push(safeLimit);

      const res = await execute(
        `SELECT c.node_id, n.title, c.id AS chunk_id, c.text, bm25(chunks_fts) AS score
           FROM chunks_fts
           JOIN chunks c ON c.id = chunks_fts.rowid
           JOIN nodes n ON n.id = c.node_id
          WHERE chunks_fts MATCH ? ${nodeFilter}
          ORDER BY score
          LIMIT ?`,
        ftsArgs
      );

      rows.push(...(res.rows || []));
    } catch {
      const like = `%${String(query).trim()}%`;
      const likeArgs = [like];
      let where = 'WHERE c.text LIKE ?';

      if (nodeId) {
        where += ' AND c.node_id = ?';
        likeArgs.push(nodeId);
      }
      likeArgs.push(safeLimit);

      const res = await execute(
        `SELECT c.node_id, n.title, c.id AS chunk_id, c.text
           FROM chunks c
           JOIN nodes n ON n.id = c.node_id
           ${where}
          ORDER BY c.id DESC
          LIMIT ?`,
        likeArgs
      );

      rows.push(...(res.rows || []));
    }

    const results = rows.map((row) => ({
      node_id: Number(row.node_id),
      chunk_id: Number(row.chunk_id),
      title: String(row.title || ''),
      text: String(row.text || '').slice(0, 800),
      score: row.score == null ? null : Number(row.score)
    }));

    return { count: results.length, results };
  }

  async function vectorSearch(queryEmbedding, limit) {
    const vecJson = vectorToJsonString(queryEmbedding);
    const result = await execute(
      "SELECT n.id AS node_id, n.title, coalesce(n.description, '') AS description, " +
        "substr(c.text, 1, 700) AS excerpt, coalesce(n.link, '') AS link, coalesce(n.event_date, '') AS event_date, coalesce(n.node_type, '') AS node_type, " +
        "(1.0 - vector_distance_cos(c.embedding, vector(?))) AS score " +
        "FROM vector_top_k('chunks_embedding_idx', vector(?), ?) AS vt " +
        "JOIN chunks c ON c.rowid = vt.id " +
        "JOIN nodes n ON n.id = c.node_id " +
        'ORDER BY score DESC',
      [vecJson, vecJson, limit]
    );

    return (result.rows || []).map((row) => ({
      source: 'vector',
      score: Number(row.score || 0),
      nodeId: Number(row.node_id),
      title: String(row.title || 'Untitled'),
      description: String(row.description || ''),
      excerpt: String(row.excerpt || ''),
      link: String(row.link || ''),
      eventDate: String(row.event_date || ''),
      nodeType: String(row.node_type || '')
    }));
  }

  async function ftsSearch(query, limit) {
    const terms = String(query)
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .map((t) => `"${t.replace(/"/g, '')}"`)
      .join(' ');

    if (!terms) return [];

    const result = await execute(
      "SELECT n.id AS node_id, n.title, coalesce(n.description, '') AS description, " +
        "substr(c.text, 1, 700) AS excerpt, coalesce(n.link, '') AS link, coalesce(n.event_date, '') AS event_date, coalesce(n.node_type, '') AS node_type, " +
        'bm25(chunks_fts) AS rank_score ' +
        'FROM chunks_fts ' +
        'JOIN chunks c ON c.rowid = chunks_fts.rowid ' +
        'JOIN nodes n ON n.id = c.node_id ' +
        'WHERE chunks_fts MATCH ? ' +
        'ORDER BY rank_score ASC ' +
        'LIMIT ?',
      [terms, limit]
    );

    const rows = (result.rows || []).map((row) => Number(row.rank_score ?? 0));
    const maxAbs = Math.max(...rows.map((v) => Math.abs(v)), 1);

    return (result.rows || []).map((row) => ({
      source: 'fts',
      score: Math.abs(Number(row.rank_score || 0)) / maxAbs,
      nodeId: Number(row.node_id),
      title: String(row.title || 'Untitled'),
      description: String(row.description || ''),
      excerpt: String(row.excerpt || ''),
      link: String(row.link || ''),
      eventDate: String(row.event_date || ''),
      nodeType: String(row.node_type || '')
    }));
  }

  async function nodeVectorSearch(queryEmbedding, limit) {
    const vecJson = vectorToJsonString(queryEmbedding);
    const result = await execute(
      "SELECT n.id AS node_id, n.title, coalesce(n.description, '') AS description, " +
        "coalesce(n.notes, '') AS notes, coalesce(n.link, '') AS link, coalesce(n.event_date, '') AS event_date, coalesce(n.node_type, '') AS node_type, " +
        "(1.0 - vector_distance_cos(n.embedding_vec, vector(?))) AS score " +
        "FROM vector_top_k('nodes_embedding_idx', vector(?), ?) AS vt " +
        "JOIN nodes n ON n.rowid = vt.id " +
        'ORDER BY score DESC',
      [vecJson, vecJson, limit]
    );

    return (result.rows || []).map((row) => ({
      source: 'node_vector',
      score: Number(row.score || 0),
      nodeId: Number(row.node_id),
      title: String(row.title || 'Untitled'),
      description: String(row.description || ''),
      excerpt: String(row.notes || '').slice(0, 700),
      link: String(row.link || ''),
      eventDate: String(row.event_date || ''),
      nodeType: String(row.node_type || '')
    }));
  }

  async function nodeTextFallback(query, limit) {
    const like = `%${String(query).toLowerCase()}%`;
    const result = await execute(
      "SELECT id AS node_id, title, coalesce(description, '') AS description, " +
        "substr(coalesce(notes, ''), 1, 700) AS excerpt, coalesce(link, '') AS link, coalesce(event_date, '') AS event_date, coalesce(node_type, '') AS node_type " +
        'FROM nodes ' +
        "WHERE lower(title) LIKE ? OR lower(coalesce(description, '')) LIKE ? " +
        "OR lower(coalesce(notes, '')) LIKE ? OR lower(coalesce(chunk, '')) LIKE ? " +
        'ORDER BY event_date DESC NULLS LAST, updated_at DESC ' +
        'LIMIT ?',
      [like, like, like, like, limit]
    );

    return (result.rows || []).map((row) => ({
      source: 'nodes',
      score: 0.4,
      nodeId: Number(row.node_id),
      title: String(row.title || 'Untitled'),
      description: String(row.description || ''),
      excerpt: String(row.excerpt || ''),
      link: String(row.link || ''),
      eventDate: String(row.event_date || ''),
      nodeType: String(row.node_type || '')
    }));
  }

  function fuseHybrid(vectorHits, ftsHits, maxResults) {
    const k = 60;
    const map = new Map();

    vectorHits.forEach((hit, idx) => {
      map.set(hit.nodeId, { score: 1 / (k + idx + 1), hit });
    });

    ftsHits.forEach((hit, idx) => {
      const rrf = 1 / (k + idx + 1);
      const existing = map.get(hit.nodeId);
      if (existing) {
        existing.score += rrf;
        if ((existing.hit.excerpt || '').length < (hit.excerpt || '').length) {
          existing.hit = hit;
        }
      } else {
        map.set(hit.nodeId, { score: rrf, hit });
      }
    });

    return [...map.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((entry) => ({ ...entry.hit, score: entry.score }));
  }

  async function queryKnowledgeContext(query, options = {}) {
    const limit = normalizeLimit(options.limit, 1, 25, 6);
    const nodeType = normalizeNodeType(options.node_type);
    const eventAfter = normalizeIsoDate(options.event_after);
    const eventBefore = normalizeIsoDate(options.event_before);
    const sortBy = normalizeSortBy(options.sortBy);
    const embedding = await maybeGetQueryEmbedding(query, options.openAiApiKey, options.embeddingModel);

    // Phase 1: Search chunks (vector + FTS)
    const vectorHits = embedding ? await vectorSearch(embedding, limit * 2).catch(() => []) : [];
    const ftsHits = await ftsSearch(query, limit * 2).catch(() => []);

    // Phase 1b: Search nodes by vector (if embedding available)
    const nodeVectorHits = embedding ? await nodeVectorSearch(embedding, limit).catch(() => []) : [];

    // Fuse all three result sets
    let hits = fuseHybrid([...vectorHits, ...nodeVectorHits], ftsHits, limit);
    let method = embedding ? 'hybrid' : 'fts';

    if (!hits.length) {
      hits = await nodeTextFallback(query, limit).catch(() => []);
      method = 'nodes_fallback';
    }

    if (nodeType) {
      hits = hits.filter((hit) => hit.nodeType === nodeType);
    }

    if (eventAfter) {
      hits = hits.filter((hit) => hit.eventDate && hit.eventDate >= eventAfter);
    }

    if (eventBefore) {
      hits = hits.filter((hit) => hit.eventDate && hit.eventDate <= eventBefore);
    }

    if (sortBy === 'event_date') {
      hits = hits.sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));
    }

    hits = hits.slice(0, limit);

    if (!hits.length) {
      return {
        method,
        hits: [],
        text: 'No matching rows found in nodes/chunks tables.'
      };
    }

    const lines = hits.map((hit, idx) => {
      return (
        `${idx + 1}. [${hit.eventDate || 'unknown-date'}] ${hit.title}\n` +
        `Desc: ${hit.description}\n` +
        `Excerpt: ${hit.excerpt}\n` +
        `Link: ${hit.link}`
      );
    });

    return {
      method,
      hits,
      text: `Search method: ${method}\n\n${lines.join('\n\n')}`
    };
  }

  return {
    db,
    execute,
    searchNodes,
    searchContent,
    queryKnowledgeContext,
    nodeVectorSearch,
    vectorSearch,
    ftsSearch,
    nodeTextFallback,
    fuseHybrid
  };
}

module.exports = {
  createLsHubServices
};
