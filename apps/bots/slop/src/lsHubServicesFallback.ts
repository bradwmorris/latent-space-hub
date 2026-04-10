import type { Client as LibsqlClient } from "@libsql/client";

type KnowledgeHit = {
  source: "vector" | "fts" | "nodes";
  score: number;
  nodeId: number;
  title: string;
  description: string;
  excerpt: string;
  link: string;
  eventDate: string;
};

function vectorToJsonString(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

async function maybeGetQueryEmbedding(
  query: string,
  openAiApiKey?: string,
  model = "text-embedding-3-small"
): Promise<number[] | null> {
  if (!openAiApiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, input: query })
    });

    if (!response.ok) return null;
    const json = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = json.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding : null;
  } catch {
    return null;
  }
}

async function vectorSearch(db: LibsqlClient, queryEmbedding: number[], limit: number): Promise<KnowledgeHit[]> {
  const vecJson = vectorToJsonString(queryEmbedding);
  const result = await db.execute({
    sql:
      "SELECT n.id AS node_id, n.title, coalesce(n.description, '') AS description, " +
      "substr(c.text, 1, 700) AS excerpt, coalesce(n.link, '') AS link, coalesce(n.event_date, '') AS event_date, " +
      "(1.0 - vector_distance_cos(c.embedding, vector(?))) AS score " +
      "FROM vector_top_k('chunks_embedding_idx', vector(?), ?) AS vt " +
      "JOIN chunks c ON c.rowid = vt.id " +
      "JOIN nodes n ON n.id = c.node_id " +
      "ORDER BY score DESC",
    args: [vecJson, vecJson, limit]
  });

  return result.rows.map((row) => ({
    source: "vector",
    score: Number(row.score || 0),
    nodeId: Number(row.node_id),
    title: String(row.title || "Untitled"),
    description: String(row.description || ""),
    excerpt: String(row.excerpt || ""),
    link: String(row.link || ""),
    eventDate: String(row.event_date || "")
  }));
}

async function ftsSearch(db: LibsqlClient, query: string, limit: number): Promise<KnowledgeHit[]> {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .map((t) => `"${t.replace(/"/g, "")}"`)
    .join(" ");

  if (!terms) return [];

  const result = await db.execute({
    sql:
      "SELECT n.id AS node_id, n.title, coalesce(n.description, '') AS description, " +
      "substr(c.text, 1, 700) AS excerpt, coalesce(n.link, '') AS link, coalesce(n.event_date, '') AS event_date, " +
      "bm25(chunks_fts) AS rank_score " +
      "FROM chunks_fts " +
      "JOIN chunks c ON c.rowid = chunks_fts.rowid " +
      "JOIN nodes n ON n.id = c.node_id " +
      "WHERE chunks_fts MATCH ? " +
      "ORDER BY rank_score ASC " +
      "LIMIT ?",
    args: [terms, limit]
  });

  const rows = result.rows.map((row) => Number(row.rank_score ?? 0));
  const maxAbs = Math.max(...rows.map((v) => Math.abs(v)), 1);

  return result.rows.map((row) => ({
    source: "fts",
    score: Math.abs(Number(row.rank_score || 0)) / maxAbs,
    nodeId: Number(row.node_id),
    title: String(row.title || "Untitled"),
    description: String(row.description || ""),
    excerpt: String(row.excerpt || ""),
    link: String(row.link || ""),
    eventDate: String(row.event_date || "")
  }));
}

async function nodeTextFallback(db: LibsqlClient, query: string, limit: number): Promise<KnowledgeHit[]> {
  const like = `%${query.toLowerCase()}%`;
  const result = await db.execute({
    sql:
      "SELECT id AS node_id, title, coalesce(description, '') AS description, " +
      "substr(coalesce(notes, ''), 1, 700) AS excerpt, coalesce(link, '') AS link, coalesce(event_date, '') AS event_date " +
      "FROM nodes " +
      "WHERE lower(title) LIKE ? OR lower(coalesce(description, '')) LIKE ? " +
      "OR lower(coalesce(notes, '')) LIKE ? OR lower(coalesce(chunk, '')) LIKE ? " +
      "ORDER BY event_date DESC NULLS LAST, updated_at DESC " +
      "LIMIT ?",
    args: [like, like, like, like, limit]
  });

  return result.rows.map((row) => ({
    source: "nodes",
    score: 0.4,
    nodeId: Number(row.node_id),
    title: String(row.title || "Untitled"),
    description: String(row.description || ""),
    excerpt: String(row.excerpt || ""),
    link: String(row.link || ""),
    eventDate: String(row.event_date || "")
  }));
}

function fuseHybrid(vectorHits: KnowledgeHit[], ftsHits: KnowledgeHit[], maxResults: number): KnowledgeHit[] {
  const k = 60;
  const map = new Map<number, { score: number; hit: KnowledgeHit }>();

  vectorHits.forEach((hit, idx) => {
    map.set(hit.nodeId, { score: 1 / (k + idx + 1), hit });
  });

  ftsHits.forEach((hit, idx) => {
    const rrf = 1 / (k + idx + 1);
    const existing = map.get(hit.nodeId);
    if (existing) {
      existing.score += rrf;
      if (existing.hit.excerpt.length < hit.excerpt.length) {
        existing.hit = hit;
      }
    } else {
      map.set(hit.nodeId, { score: rrf, hit });
    }
  });

  return [...map.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((entry) => ({
      ...entry.hit,
      score: entry.score
    }));
}

export function createLsHubServices(options: { db: LibsqlClient }) {
  return {
    async queryKnowledgeContext(
      query: string,
      params?: { limit?: number; openAiApiKey?: string }
    ): Promise<{ method: string; text: string }> {
      const limit = Math.min(Math.max(Math.floor(params?.limit ?? 6), 1), 25);
      const embedding = await maybeGetQueryEmbedding(query, params?.openAiApiKey);
      const vectorHits = embedding ? await vectorSearch(options.db, embedding, limit * 2).catch(() => []) : [];
      const ftsHits = await ftsSearch(options.db, query, limit * 2).catch(() => []);

      let hits = fuseHybrid(vectorHits, ftsHits, limit);
      let method = embedding ? "hybrid" : "fts";

      if (!hits.length) {
        hits = await nodeTextFallback(options.db, query, limit).catch(() => []);
        method = "nodes_fallback";
      }

      if (!hits.length) {
        return { method, text: "No matching rows found in nodes/chunks tables." };
      }

      const lines = hits.map((hit, idx) => {
        const titleLine = hit.link ? `[${hit.title}](${hit.link})` : hit.title;
        return (
          `${idx + 1}. [${hit.eventDate || "unknown-date"}] ${titleLine}\n` +
          `Desc: ${hit.description}\n` +
          `Excerpt: ${hit.excerpt}\n` +
          `Link: ${hit.link}`
        );
      });

      return {
        method,
        text: `Search method: ${method}\n\n${lines.join("\n\n")}`
      };
    }
  };
}
