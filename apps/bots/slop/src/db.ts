/**
 * Direct Turso database layer for Slop.
 *
 * Replaces McpGraphClient — all graph operations now go through
 * parameterized SQL queries against the shared Turso database.
 */
import type { Client as LibsqlClient } from "@libsql/client";

// ── Types ──────────────────────────────────────────────────────

export type NodeRow = {
  id: number;
  title: string;
  notes?: string | null;
  description?: string | null;
  link?: string | null;
  node_type?: string | null;
  event_date?: string | null;
  metadata?: unknown;
};

export type EventReminderRow = {
  id: number;
  title: string;
  event_date: string;
  notes: string | null;
  metadata: unknown;
};

export type ScheduledEventRow = {
  id: number;
  title: string;
  event_date: string;
  metadata: unknown;
};

export type PaperCandidateRow = {
  id: number;
  title: string;
  link: string | null;
  metadata: Record<string, unknown>;
};

export type RecentPaperCandidateRow = {
  id: number;
  title: string;
  link: string | null;
  created_at: string | null;
  updated_at: string | null;
  event_status: string | null;
  presenter_status: string | null;
  source_url: string | null;
  discord_channel_id: string | null;
  discord_message_id: string | null;
  discord_thread_id: string | null;
  scheduled_event_node_id: number | null;
};

export type PaperMentionRow = {
  id: number;
  title: string;
  paper_url: string;
  summary: string;
  thumbnail_url: string | null;
  source_url: string | null;
  discord_channel_id: string | null;
  discord_message_id: string | null;
  discord_thread_id: string | null;
  suggested_by_discord_id: string | null;
  suggested_by_handle: string | null;
  status: string;
  scheduled_event_node_id: number | null;
  confirmed_by_discord_id: string | null;
  confirmed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type UpcomingEventRow = {
  id: number;
  title: string;
  event_date: string;
  event_type: "paper-club" | "builders-club";
  presenter_name: string;
};

export type RecordingTargetEventRow = {
  id: number;
  title: string;
  event_date: string;
  link: string | null;
  event_type: "paper-club" | "builders-club";
  event_status: string;
  presenter_name: string | null;
  paper_title: string | null;
  topic: string | null;
  metadata: Record<string, unknown>;
};

type EdgeContext = {
  type: string;
  confidence: number;
  inferred_at: string;
  explanation: string;
  created_via: string;
};

// ── Member operations ──────────────────────────────────────────

export async function lookupMemberByDiscordId(
  db: LibsqlClient,
  discordId: string
): Promise<NodeRow | null> {
  const result = await db.execute({
    sql: `SELECT id, title, notes, metadata, node_type, event_date, updated_at
          FROM nodes
          WHERE node_type = 'member'
            AND json_extract(metadata, '$.discord_id') = ?
          ORDER BY updated_at DESC
          LIMIT 1`,
    args: [discordId],
  });
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    title: String(row.title || ""),
    notes: row.notes == null ? null : String(row.notes),
    node_type: row.node_type == null ? null : String(row.node_type),
    event_date: row.event_date == null ? null : String(row.event_date),
    metadata: parseMetadata(row.metadata),
  };
}

export async function createMemberNode(
  db: LibsqlClient,
  payload: { title: string; description?: string; metadata: Record<string, unknown> }
): Promise<{ id: number }> {
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `INSERT INTO nodes (title, description, node_type, metadata, created_at, updated_at)
          VALUES (?, ?, 'member', ?, ?, ?)`,
    args: [payload.title, payload.description ?? null, JSON.stringify(payload.metadata), now, now],
  });

  const nodeId = Number(result.lastInsertRowid);
  if (!Number.isFinite(nodeId) || nodeId <= 0) {
    throw new Error("INSERT did not return a valid node ID.");
  }

  // Assign 'member' dimension
  await db.execute({
    sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, 'member')`,
    args: [nodeId],
  });

  return { id: nodeId };
}

export async function updateMemberNode(
  db: LibsqlClient,
  nodeId: number,
  updates: { content?: string; metadata: Record<string, unknown> }
): Promise<number> {
  const now = new Date().toISOString();
  let result;
  if (updates.content) {
    result = await db.execute({
      sql: `UPDATE nodes SET notes = COALESCE(notes || char(10), '') || ?, metadata = ?, updated_at = ? WHERE id = ?`,
      args: [updates.content, JSON.stringify(updates.metadata), now, nodeId],
    });
  } else {
    result = await db.execute({
      sql: `UPDATE nodes SET metadata = ?, updated_at = ? WHERE id = ?`,
      args: [JSON.stringify(updates.metadata), now, nodeId],
    });
  }

  return Number(result.rowsAffected || 0);
}

export async function getNodeById(db: LibsqlClient, nodeId: number): Promise<NodeRow | null> {
  const result = await db.execute({
    sql: `SELECT id, title, notes, description, link, node_type, event_date, metadata
          FROM nodes
          WHERE id = ?
          LIMIT 1`,
    args: [nodeId],
  });
  return result.rows.length ? rowToNode(result.rows[0] as Record<string, unknown>) : null;
}

// ── Event operations ───────────────────────────────────────────

export async function createEventNode(
  db: LibsqlClient,
  payload: {
    title: string;
    description?: string;
    event_date: string;
    event_type: "paper-club" | "builders-club";
    presenter_name: string;
    presenter_discord_id?: string;
    presenter_node_id?: number;
    paper_url?: string;
    paper_title?: string;
    topic?: string;
    paper_candidate_node_id?: number;
    source_discord_thread_id?: string;
    source_discord_message_id?: string;
  }
): Promise<{ id: number }> {
  const now = new Date().toISOString();
  const metadata = {
    event_status: "scheduled",
    event_type: payload.event_type,
    presenter_name: payload.presenter_name,
    presenter_discord_id: payload.presenter_discord_id,
    presenter_node_id: payload.presenter_node_id,
    paper_url: payload.paper_url,
    paper_title: payload.paper_title,
    topic: payload.topic,
    paper_candidate_node_id: payload.paper_candidate_node_id,
    source_discord_thread_id: payload.source_discord_thread_id,
    source_discord_message_id: payload.source_discord_message_id,
    scheduled_at: now,
  };

  const result = await db.execute({
    sql: `INSERT INTO nodes (title, description, node_type, event_date, metadata, created_at, updated_at)
          VALUES (?, ?, 'event', ?, ?, ?, ?)`,
    args: [payload.title, payload.description ?? null, payload.event_date, JSON.stringify(metadata), now, now],
  });

  const nodeId = Number(result.lastInsertRowid);
  if (!Number.isFinite(nodeId) || nodeId <= 0) {
    throw new Error("INSERT did not return a valid event node ID.");
  }

  // Assign dimensions: 'event' + event_type
  await db.execute({
    sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, 'event')`,
    args: [nodeId],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)`,
    args: [nodeId, payload.event_type],
  });

  return { id: nodeId };
}

export async function createEventNodeAtomic(
  db: LibsqlClient,
  payload: {
    title: string;
    description?: string;
    event_date: string;
    event_type: "paper-club" | "builders-club";
    presenter_name: string;
    presenter_discord_id?: string;
    presenter_node_id?: number;
    paper_url?: string;
    paper_title?: string;
    topic?: string;
    paper_candidate_node_id?: number;
    source_discord_thread_id?: string;
    source_discord_message_id?: string;
  }
): Promise<{ nodeId: number; alreadyBooked: boolean }> {
  try {
    const inserted = await createEventNode(db, payload);
    return { nodeId: inserted.id, alreadyBooked: false };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { nodeId: 0, alreadyBooked: true };
    }
    throw error;
  }
}

// ── Paper mention operations ───────────────────────────────────

export async function ensurePaperMentionsTable(db: LibsqlClient): Promise<void> {
  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS paper_mentions (
              id INTEGER PRIMARY KEY,
              title TEXT NOT NULL,
              paper_url TEXT NOT NULL,
              summary TEXT NOT NULL,
              thumbnail_url TEXT,
              source_url TEXT,
              discord_channel_id TEXT,
              discord_message_id TEXT UNIQUE,
              discord_thread_id TEXT,
              suggested_by_discord_id TEXT,
              suggested_by_handle TEXT,
              status TEXT NOT NULL DEFAULT 'mentioned',
              scheduled_event_node_id INTEGER,
              confirmed_by_discord_id TEXT,
              confirmed_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )`,
      args: [],
    },
    { sql: `CREATE INDEX IF NOT EXISTS idx_paper_mentions_created_at ON paper_mentions(created_at)`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_paper_mentions_paper_url ON paper_mentions(paper_url)`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_paper_mentions_status ON paper_mentions(status)`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_paper_mentions_suggested_by ON paper_mentions(suggested_by_discord_id)`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_paper_mentions_thread ON paper_mentions(discord_thread_id)`, args: [] },
  ]);
  await db.execute({ sql: `ALTER TABLE paper_mentions ADD COLUMN thumbnail_url TEXT`, args: [] }).catch(() => undefined);
}

function rowToPaperMention(row: Record<string, unknown>): PaperMentionRow {
  const scheduledEventNodeId =
    row.scheduled_event_node_id == null ? null : Number(row.scheduled_event_node_id);
  return {
    id: Number(row.id),
    title: String(row.title || ""),
    paper_url: String(row.paper_url || ""),
    summary: String(row.summary || ""),
    thumbnail_url: row.thumbnail_url == null ? null : String(row.thumbnail_url),
    source_url: row.source_url == null ? null : String(row.source_url),
    discord_channel_id: row.discord_channel_id == null ? null : String(row.discord_channel_id),
    discord_message_id: row.discord_message_id == null ? null : String(row.discord_message_id),
    discord_thread_id: row.discord_thread_id == null ? null : String(row.discord_thread_id),
    suggested_by_discord_id:
      row.suggested_by_discord_id == null ? null : String(row.suggested_by_discord_id),
    suggested_by_handle: row.suggested_by_handle == null ? null : String(row.suggested_by_handle),
    status: String(row.status || "mentioned"),
    scheduled_event_node_id:
      scheduledEventNodeId != null && Number.isFinite(scheduledEventNodeId) && scheduledEventNodeId > 0
        ? scheduledEventNodeId
        : null,
    confirmed_by_discord_id:
      row.confirmed_by_discord_id == null ? null : String(row.confirmed_by_discord_id),
    confirmed_at: row.confirmed_at == null ? null : String(row.confirmed_at),
    created_at: row.created_at == null ? null : String(row.created_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
  };
}

export async function getPaperMentionByDiscordMessageId(
  db: LibsqlClient,
  discordMessageId: string
): Promise<PaperMentionRow | null> {
  const result = await db.execute({
    sql: `SELECT * FROM paper_mentions WHERE discord_message_id = ? LIMIT 1`,
    args: [discordMessageId],
  });
  return result.rows.length ? rowToPaperMention(result.rows[0] as Record<string, unknown>) : null;
}

export async function getPaperMentionByDiscordThreadId(
  db: LibsqlClient,
  discordThreadId: string
): Promise<PaperMentionRow | null> {
  const result = await db.execute({
    sql: `SELECT * FROM paper_mentions
          WHERE discord_thread_id = ?
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT 1`,
    args: [discordThreadId],
  });
  return result.rows.length ? rowToPaperMention(result.rows[0] as Record<string, unknown>) : null;
}

export async function getPaperMentionById(
  db: LibsqlClient,
  paperMentionId: number
): Promise<PaperMentionRow | null> {
  const result = await db.execute({
    sql: `SELECT * FROM paper_mentions WHERE id = ? LIMIT 1`,
    args: [paperMentionId],
  });
  return result.rows.length ? rowToPaperMention(result.rows[0] as Record<string, unknown>) : null;
}

export async function getRecentPaperMentions(
  db: LibsqlClient,
  options: { limit: number } = { limit: 10 }
): Promise<PaperMentionRow[]> {
  await ensurePaperMentionsTable(db);
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 50);
  const result = await db.execute({
    sql: `SELECT * FROM paper_mentions
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => rowToPaperMention(row as Record<string, unknown>));
}

export async function upsertPaperMention(
  db: LibsqlClient,
  payload: {
    title: string;
    paperUrl: string;
    summary: string;
    sourceUrl?: string;
    thumbnailUrl?: string;
    discordChannelId: string;
    discordMessageId: string;
    discordThreadId: string;
    suggestedByDiscordId: string;
    suggestedByHandle: string;
  }
): Promise<{ id: number; alreadyExists: boolean }> {
  const now = new Date().toISOString();
  const existing = await getPaperMentionByDiscordMessageId(db, payload.discordMessageId);
  if (existing) {
    await db.execute({
      sql: `UPDATE paper_mentions
            SET title = ?, paper_url = ?, summary = ?, thumbnail_url = ?, source_url = ?,
                discord_channel_id = ?, discord_thread_id = ?,
                suggested_by_discord_id = ?, suggested_by_handle = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        payload.title,
        payload.paperUrl,
        payload.summary,
        payload.thumbnailUrl ?? null,
        payload.sourceUrl ?? null,
        payload.discordChannelId,
        payload.discordThreadId,
        payload.suggestedByDiscordId,
        payload.suggestedByHandle,
        now,
        existing.id,
      ],
    });
    return { id: existing.id, alreadyExists: true };
  }

  const result = await db.execute({
    sql: `INSERT INTO paper_mentions (
            title, paper_url, summary, thumbnail_url, source_url,
            discord_channel_id, discord_message_id, discord_thread_id,
            suggested_by_discord_id, suggested_by_handle,
            status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mentioned', ?, ?)`,
    args: [
      payload.title,
      payload.paperUrl,
      payload.summary,
      payload.thumbnailUrl ?? null,
      payload.sourceUrl ?? null,
      payload.discordChannelId,
      payload.discordMessageId,
      payload.discordThreadId,
      payload.suggestedByDiscordId,
      payload.suggestedByHandle,
      now,
      now,
    ],
  });
  return { id: Number(result.lastInsertRowid), alreadyExists: false };
}

export async function markPaperMentionScheduled(
  db: LibsqlClient,
  params: {
    paperMentionId: number;
    scheduledEventNodeId: number;
    confirmedByDiscordId: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE paper_mentions
          SET status = 'scheduled',
              scheduled_event_node_id = ?,
              confirmed_by_discord_id = ?,
              confirmed_at = ?,
              updated_at = ?
          WHERE id = ?`,
    args: [
      params.scheduledEventNodeId,
      params.confirmedByDiscordId,
      now,
      now,
      params.paperMentionId,
    ],
  });
}

// ── Paper candidate operations ─────────────────────────────────

export async function ensurePaperCandidateIndex(db: LibsqlClient): Promise<void> {
  await db.execute({
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_paper_candidate_discord_message_unique
          ON nodes(json_extract(metadata, '$.discord_message_id'))
          WHERE node_type = 'event'
            AND json_extract(metadata, '$.event_type') = 'paper-club'
            AND json_extract(metadata, '$.event_status') = 'candidate'
            AND json_extract(metadata, '$.discord_message_id') IS NOT NULL`,
    args: [],
  });
}

export async function getPaperCandidateByDiscordMessageId(
  db: LibsqlClient,
  discordMessageId: string
): Promise<PaperCandidateRow | null> {
  const result = await db.execute({
    sql: `SELECT id, title, link, metadata
          FROM nodes
          WHERE node_type = 'event'
            AND json_extract(metadata, '$.event_type') = 'paper-club'
            AND json_extract(metadata, '$.event_status') = 'candidate'
            AND json_extract(metadata, '$.discord_message_id') = ?
          LIMIT 1`,
    args: [discordMessageId],
  });
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    title: String(row.title || ""),
    link: row.link == null ? null : String(row.link),
    metadata: parseMetadata(row.metadata) as Record<string, unknown>,
  };
}

export async function getPaperCandidateById(
  db: LibsqlClient,
  candidateNodeId: number
): Promise<PaperCandidateRow | null> {
  const result = await db.execute({
    sql: `SELECT id, title, link, metadata
          FROM nodes
          WHERE id = ?
            AND node_type = 'event'
            AND json_extract(metadata, '$.event_type') = 'paper-club'
            AND json_extract(metadata, '$.event_status') = 'candidate'
          LIMIT 1`,
    args: [candidateNodeId],
  });
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    title: String(row.title || ""),
    link: row.link == null ? null : String(row.link),
    metadata: parseMetadata(row.metadata) as Record<string, unknown>,
  };
}

export async function createPaperCandidateNode(
  db: LibsqlClient,
  payload: {
    title: string;
    paperUrl: string;
    sourceUrl: string;
    description?: string;
    tldr: string[];
    tldrSources: string[];
    discordChannelId: string;
    discordMessageId: string;
    discordThreadId: string;
    slopMessageId?: string;
  }
): Promise<{ id: number; alreadyExists: boolean }> {
  const now = new Date().toISOString();
  const metadata = {
    event_status: "candidate",
    event_type: "paper-club",
    paper_url: payload.paperUrl,
    paper_title: payload.title,
    source_url: payload.sourceUrl,
    tldr: payload.tldr,
    tldr_sources: payload.tldrSources,
    discord_channel_id: payload.discordChannelId,
    discord_message_id: payload.discordMessageId,
    discord_thread_id: payload.discordThreadId,
    slop_message_id: payload.slopMessageId,
    presenter_status: "none",
    created_via: "slop-paper-candidate",
  };

  try {
    const result = await db.execute({
      sql: `INSERT INTO nodes (title, description, link, node_type, metadata, created_at, updated_at)
            VALUES (?, ?, ?, 'event', ?, ?, ?)`,
      args: [
        payload.title,
        payload.description ?? null,
        payload.paperUrl,
        JSON.stringify(metadata),
        now,
        now,
      ],
    });

    const nodeId = Number(result.lastInsertRowid);
    if (!Number.isFinite(nodeId) || nodeId <= 0) {
      throw new Error("INSERT did not return a valid paper candidate node ID.");
    }

    await db.execute({
      sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, 'event')`,
      args: [nodeId],
    });
    await db.execute({
      sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, 'paper-club')`,
      args: [nodeId],
    });

    return { id: nodeId, alreadyExists: false };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await getPaperCandidateByDiscordMessageId(db, payload.discordMessageId);
    if (!existing) throw error;
    return { id: existing.id, alreadyExists: true };
  }
}

export async function updatePaperCandidateSlopMessage(
  db: LibsqlClient,
  candidateNodeId: number,
  slopMessageId: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE nodes
          SET metadata = json_set(coalesce(metadata, '{}'), '$.slop_message_id', ?),
              updated_at = ?
          WHERE id = ?
            AND node_type = 'event'
            AND json_extract(metadata, '$.event_status') = 'candidate'`,
    args: [slopMessageId, now, candidateNodeId],
  });
}

export async function getRecentPaperCandidates(
  db: LibsqlClient,
  options: {
    limit: number;
    status?: "all" | "open" | "scheduled";
  }
): Promise<RecentPaperCandidateRow[]> {
  const status = options.status || "all";
  const conditions = [
    "node_type = 'event'",
    "json_extract(metadata, '$.event_type') = 'paper-club'",
    "json_extract(metadata, '$.created_via') = 'slop-paper-candidate'",
  ];
  const args: (string | number)[] = [];

  if (status === "open") {
    conditions.push("json_extract(metadata, '$.event_status') = 'candidate'");
  } else if (status === "scheduled") {
    conditions.push("json_extract(metadata, '$.event_status') = 'scheduled'");
  }

  args.push(options.limit);
  const result = await db.execute({
    sql: `SELECT id, title, link, created_at, updated_at,
                 json_extract(metadata, '$.event_status') AS event_status,
                 json_extract(metadata, '$.presenter_status') AS presenter_status,
                 json_extract(metadata, '$.source_url') AS source_url,
                 json_extract(metadata, '$.discord_channel_id') AS discord_channel_id,
                 json_extract(metadata, '$.discord_message_id') AS discord_message_id,
                 json_extract(metadata, '$.discord_thread_id') AS discord_thread_id,
                 json_extract(metadata, '$.scheduled_event_node_id') AS scheduled_event_node_id
          FROM nodes
          WHERE ${conditions.join("\n            AND ")}
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT ?`,
    args,
  });

  return result.rows.map((row) => {
    const scheduledEventNodeId =
      row.scheduled_event_node_id == null ? null : Number(row.scheduled_event_node_id);
    return {
      id: Number(row.id),
      title: String(row.title || ""),
      link: row.link == null ? null : String(row.link),
      created_at: row.created_at == null ? null : String(row.created_at),
      updated_at: row.updated_at == null ? null : String(row.updated_at),
      event_status: row.event_status == null ? null : String(row.event_status),
      presenter_status: row.presenter_status == null ? null : String(row.presenter_status),
      source_url: row.source_url == null ? null : String(row.source_url),
      discord_channel_id: row.discord_channel_id == null ? null : String(row.discord_channel_id),
      discord_message_id: row.discord_message_id == null ? null : String(row.discord_message_id),
      discord_thread_id: row.discord_thread_id == null ? null : String(row.discord_thread_id),
      scheduled_event_node_id:
        scheduledEventNodeId != null && Number.isFinite(scheduledEventNodeId) && scheduledEventNodeId > 0
          ? scheduledEventNodeId
          : null,
    };
  });
}

export async function markPaperCandidateScheduled(
  db: LibsqlClient,
  params: {
    candidateNodeId: number;
    scheduledEventNodeId: number;
    presenterDiscordId: string;
    presenterName: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE nodes
          SET metadata = json_set(
                coalesce(metadata, '{}'),
                '$.presenter_status', 'known',
                '$.presenter_discord_id', ?,
                '$.presenter_name', ?,
                '$.scheduled_event_node_id', ?,
                '$.event_status', 'scheduled'
              ),
              updated_at = ?
          WHERE id = ?
            AND node_type = 'event'
            AND json_extract(metadata, '$.event_type') = 'paper-club'
            AND json_extract(metadata, '$.event_status') = 'candidate'`,
    args: [
      params.presenterDiscordId,
      params.presenterName,
      params.scheduledEventNodeId,
      now,
      params.candidateNodeId,
    ],
  });
}

export async function ensureScheduledEventSlotIndex(db: LibsqlClient): Promise<void> {
  await db.execute({
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_scheduled_event_slot_unique
          ON nodes(event_date, json_extract(metadata, '$.event_type'))
          WHERE node_type = 'event'
            AND json_extract(metadata, '$.event_status') = 'scheduled'
            AND event_date IS NOT NULL`,
    args: [],
  });
}

export async function getScheduledEventsByPresenter(
  db: LibsqlClient,
  params: {
    presenterDiscordId: string;
    presenterNodeId?: number;
    presenterName?: string;
  }
): Promise<ScheduledEventRow[]> {
  const where: string[] = ["json_extract(metadata, '$.presenter_discord_id') = ?"];
  const args: Array<string | number> = [params.presenterDiscordId];
  if (params.presenterNodeId && Number.isFinite(params.presenterNodeId) && params.presenterNodeId > 0) {
    where.push("json_extract(metadata, '$.presenter_node_id') = ?");
    args.push(params.presenterNodeId);
  }
  if (params.presenterName && params.presenterName.trim()) {
    where.push("LOWER(json_extract(metadata, '$.presenter_name')) = LOWER(?)");
    args.push(params.presenterName.trim());
  }

  const result = await db.execute({
    sql: `SELECT id, title, event_date, metadata
          FROM nodes
          WHERE node_type = 'event'
            AND json_extract(metadata, '$.event_status') = 'scheduled'
            AND (${where.join(" OR ")})
          ORDER BY event_date ASC`,
    args,
  });

  return result.rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title || ""),
    event_date: String(row.event_date || ""),
    metadata: parseMetadata(row.metadata),
  }));
}

export async function updateEventNode(
  db: LibsqlClient,
  params: {
    nodeId: number;
    presenterDiscordId: string;
    presenterNodeId?: number;
    presenterName?: string;
    title?: string;
    description?: string;
    eventDate?: string;
    notes?: string | null;
    metadataUpdates?: Record<string, unknown>;
    cancel?: boolean;
  }
): Promise<{ ok: boolean; reason?: "not_found_or_not_owner" | "already_booked" }> {
  const ownerChecks: string[] = ["json_extract(metadata, '$.presenter_discord_id') = ?"];
  const ownerArgs: Array<string | number> = [params.presenterDiscordId];
  if (params.presenterNodeId && Number.isFinite(params.presenterNodeId) && params.presenterNodeId > 0) {
    ownerChecks.push("json_extract(metadata, '$.presenter_node_id') = ?");
    ownerArgs.push(params.presenterNodeId);
  }
  if (params.presenterName && params.presenterName.trim()) {
    ownerChecks.push("LOWER(json_extract(metadata, '$.presenter_name')) = LOWER(?)");
    ownerArgs.push(params.presenterName.trim());
  }

  const existing = await db.execute({
    sql: `SELECT id, metadata
          FROM nodes
          WHERE id = ?
            AND node_type = 'event'
            AND (${ownerChecks.join(" OR ")})
            AND json_extract(metadata, '$.event_status') = 'scheduled'
          LIMIT 1`,
    args: [params.nodeId, ...ownerArgs],
  });

  if (!existing.rows.length) {
    return { ok: false, reason: "not_found_or_not_owner" };
  }

  const row = existing.rows[0];
  const currentMetadata = parseMetadata(row.metadata) as Record<string, unknown>;
  const mergedMetadata: Record<string, unknown> = {
    ...currentMetadata,
    ...(params.metadataUpdates || {}),
  };

  if (params.cancel) {
    mergedMetadata.event_status = "cancelled";
  }

  const now = new Date().toISOString();
  const setClauses: string[] = [];
  const args: Array<string | number | null> = [];

  if (params.title !== undefined) {
    setClauses.push("title = ?");
    args.push(params.title);
  }
  if (params.description !== undefined) {
    setClauses.push("description = ?");
    args.push(params.description);
  }
  if (params.notes !== undefined) {
    setClauses.push("notes = ?");
    args.push(params.notes);
  }
  if (params.eventDate !== undefined) {
    setClauses.push("event_date = ?");
    args.push(params.eventDate);
  }
  setClauses.push("metadata = ?", "updated_at = ?");
  args.push(JSON.stringify(mergedMetadata), now, params.nodeId);

  try {
    const result = await db.execute({
      sql: `UPDATE nodes SET ${setClauses.join(", ")} WHERE id = ?`,
      args,
    });
    if (Number(result.rowsAffected || 0) === 0) {
      return { ok: false, reason: "not_found_or_not_owner" };
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, reason: "already_booked" };
    }
    throw error;
  }

  return { ok: true };
}

export async function findRecordingNodeByYouTubeVideoId(
  db: LibsqlClient,
  params: { videoId: string; canonicalUrl: string }
): Promise<NodeRow | null> {
  const shortUrl = `https://youtu.be/${params.videoId}`;
  const result = await db.execute({
    sql: `SELECT id, title, description, notes, link, node_type, event_date, metadata
          FROM nodes
          WHERE link IN (?, ?)
             OR json_extract(metadata, '$.video_id') = ?
             OR json_extract(metadata, '$.youtube_video_id') = ?
          ORDER BY updated_at DESC
          LIMIT 1`,
    args: [params.canonicalUrl, shortUrl, params.videoId, params.videoId],
  });
  if (!result.rows.length) return null;
  return rowToNode(result.rows[0]);
}

export async function getRecentRecordingTargetEvents(
  db: LibsqlClient,
  params: { eventType?: "paper-club" | "builders-club"; limit?: number } = {}
): Promise<RecordingTargetEventRow[]> {
  const where = [
    "node_type = 'event'",
    "json_extract(metadata, '$.event_type') IN ('paper-club', 'builders-club')",
    "COALESCE(json_extract(metadata, '$.event_status'), '') NOT IN ('cancelled', 'superseded')",
  ];
  const args: Array<string | number> = [];
  if (params.eventType) {
    where.push("json_extract(metadata, '$.event_type') = ?");
    args.push(params.eventType);
  }
  args.push(Math.min(Math.max(Number(params.limit) || 40, 1), 100));

  const result = await db.execute({
    sql: `SELECT id, title, event_date, link, metadata,
                 json_extract(metadata, '$.event_type') AS event_type,
                 json_extract(metadata, '$.event_status') AS event_status,
                 json_extract(metadata, '$.presenter_name') AS presenter_name,
                 json_extract(metadata, '$.paper_title') AS paper_title,
                 json_extract(metadata, '$.topic') AS topic
          FROM nodes
          WHERE ${where.join(" AND ")}
          ORDER BY event_date DESC
          LIMIT ?`,
    args,
  });

  return result.rows
    .map((row) => ({
      id: Number(row.id),
      title: String(row.title || ""),
      event_date: String(row.event_date || ""),
      link: row.link == null ? null : String(row.link),
      event_type: String(row.event_type || "") as "paper-club" | "builders-club",
      event_status: String(row.event_status || ""),
      presenter_name: row.presenter_name == null ? null : String(row.presenter_name),
      paper_title: row.paper_title == null ? null : String(row.paper_title),
      topic: row.topic == null ? null : String(row.topic),
      metadata: parseMetadata(row.metadata) as Record<string, unknown>,
    }))
    .filter((row) => row.event_type === "paper-club" || row.event_type === "builders-club");
}

export async function createRecordingNodeForEvent(
  db: LibsqlClient,
  params: {
    targetEvent: RecordingTargetEventRow;
    title: string;
    canonicalUrl: string;
    videoId: string;
    channelName?: string;
    channelUrl?: string;
    thumbnailUrl?: string;
    transcript?: string;
    transcriptMetadata?: Record<string, unknown>;
    addedByDiscordId: string;
    addedByUsername: string;
    discordChannelId: string;
    discordMessageId: string;
  }
): Promise<{ id: number }> {
  const now = new Date().toISOString();
  const eventType = params.targetEvent.event_type;
  const description = `Recording for ${params.targetEvent.title}.`;
  const metadata = {
    event_status: "recording",
    event_type: eventType,
    recording_for_event_node_id: params.targetEvent.id,
    video_id: params.videoId,
    youtube_url: params.canonicalUrl,
    channel_name: params.channelName,
    channel_url: params.channelUrl,
    thumbnail_url: params.thumbnailUrl,
    source_type: "youtube_recording",
    provider: "YouTube",
    ingestion_status: params.transcript ? "transcript_chunked" : "metadata_only",
    ...(params.transcriptMetadata || {}),
    added_via: "slop-recording-intake",
    added_by_discord_id: params.addedByDiscordId,
    added_by_username: params.addedByUsername,
    source_discord_channel_id: params.discordChannelId,
    source_discord_message_id: params.discordMessageId,
    added_at: now,
  };

  const result = await db.execute({
    sql: `INSERT INTO nodes (title, description, link, node_type, event_date, metadata, chunk, chunk_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      params.title,
      description,
      params.canonicalUrl,
      eventType,
      params.targetEvent.event_date || null,
      JSON.stringify(metadata),
      params.transcript || null,
      params.transcript ? "chunked" : "not_chunked",
      now,
      now,
    ],
  });

  const nodeId = Number(result.lastInsertRowid);
  if (!Number.isFinite(nodeId) || nodeId <= 0) {
    throw new Error("INSERT did not return a valid recording node ID.");
  }

  await db.execute({
    sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)`,
    args: [nodeId, eventType],
  });

  if (params.transcript) {
    const chunks = chunkTextForStorage(params.transcript);
    for (let idx = 0; idx < chunks.length; idx++) {
      await db.execute({
        sql: `INSERT INTO chunks (node_id, chunk_idx, text, embedding_type, metadata, created_at)
              VALUES (?, ?, ?, 'text-embedding-3-small', ?, ?)`,
        args: [
          nodeId,
          idx,
          chunks[idx],
          JSON.stringify({ created_via: "slop-recording-intake" }),
          now,
        ],
      });
    }
  }

  return { id: nodeId };
}

export async function attachRecordingToEvent(
  db: LibsqlClient,
  params: {
    recordingNodeId: number;
    targetEvent: RecordingTargetEventRow;
    recordingUrl: string;
    addedByDiscordId: string;
    addedByUsername: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const eventMetadata = {
    ...params.targetEvent.metadata,
    event_status: "completed",
    recording_node_id: params.recordingNodeId,
    recording_url: params.recordingUrl,
    recording_attached_at: now,
    recording_attached_by_discord_id: params.addedByDiscordId,
    recording_attached_by_username: params.addedByUsername,
  };

  await db.execute({
    sql: `UPDATE nodes SET metadata = ?, updated_at = ? WHERE id = ? AND node_type = 'event'`,
    args: [JSON.stringify(eventMetadata), now, params.targetEvent.id],
  });

  const existingEdge = await db.execute({
    sql: `SELECT 1 FROM edges WHERE from_node_id = ? AND to_node_id = ? LIMIT 1`,
    args: [params.recordingNodeId, params.targetEvent.id],
  });
  if (existingEdge.rows.length) return;

  const label = params.targetEvent.event_type === "paper-club" ? "Paper Club" : "Builders Club";
  const context: EdgeContext = {
    type: "recording_of",
    confidence: 1,
    inferred_at: now,
    explanation: `recording of ${label} session`,
    created_via: "slop-recording-intake",
  };
  await db.execute({
    sql: `INSERT INTO edges (from_node_id, to_node_id, context, source, created_at)
          VALUES (?, ?, ?, 'discord-bot', ?)`,
    args: [params.recordingNodeId, params.targetEvent.id, JSON.stringify(context), now],
  });
}

export async function getBookedDates(
  db: LibsqlClient,
  eventType: string,
  dates: string[]
): Promise<Map<string, string>> {
  if (!dates.length) return new Map();
  const placeholders = dates.map(() => "?").join(", ");
  const result = await db.execute({
    sql: `SELECT event_date, json_extract(metadata, '$.presenter_name') AS presenter
          FROM nodes
          WHERE node_type = 'event'
            AND json_extract(metadata, '$.event_type') = ?
            AND json_extract(metadata, '$.event_status') = 'scheduled'
            AND event_date IN (${placeholders})`,
    args: [eventType, ...dates],
  });
  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(String(row.event_date), String(row.presenter || "someone"));
  }
  return map;
}

export async function getUpcomingScheduledEvents(
  db: LibsqlClient,
  opts: { eventType?: "paper-club" | "builders-club"; limit?: number } = {}
): Promise<UpcomingEventRow[]> {
  const where: string[] = [
    "node_type = 'event'",
    "json_extract(metadata, '$.event_status') = 'scheduled'",
    "event_date IS NOT NULL",
    "event_date >= date('now')",
  ];
  const args: Array<string | number> = [];
  if (opts.eventType) {
    where.push("json_extract(metadata, '$.event_type') = ?");
    args.push(opts.eventType);
  }

  const limit = Math.min(Math.max(Number(opts.limit) || 10, 1), 50);
  args.push(limit);

  const result = await db.execute({
    sql: `SELECT id, title, event_date,
                 json_extract(metadata, '$.event_type') AS event_type,
                 json_extract(metadata, '$.presenter_name') AS presenter_name
          FROM nodes
          WHERE ${where.join(" AND ")}
          ORDER BY event_date ASC
          LIMIT ?`,
    args,
  });

  return result.rows
    .map((row) => ({
      id: Number(row.id),
      title: String(row.title || ""),
      event_date: String(row.event_date || ""),
      event_type: String(row.event_type || "") as "paper-club" | "builders-club",
      presenter_name: String(row.presenter_name || "unknown"),
    }))
    .filter((row) => row.event_type === "paper-club" || row.event_type === "builders-club");
}

export async function checkEventSlot(
  db: LibsqlClient,
  eventType: string,
  date: string
): Promise<{ id: number; title: string; presenter: string } | null> {
  const result = await db.execute({
    sql: `SELECT id, title, json_extract(metadata, '$.presenter_name') AS presenter
          FROM nodes
          WHERE node_type = 'event'
            AND json_extract(metadata, '$.event_type') = ?
            AND json_extract(metadata, '$.event_status') = 'scheduled'
            AND event_date = ?
          LIMIT 1`,
    args: [eventType, date],
  });
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    title: String(row.title || ""),
    presenter: String(row.presenter || "unknown"),
  };
}

export async function getPaperClubEventsForDate(
  db: LibsqlClient,
  targetDate: string
): Promise<EventReminderRow[]> {
  return getPaperClubEventsForDateAndWindow(db, targetDate, "24h");
}

export async function getPaperClubEventsForDateOneHour(
  db: LibsqlClient,
  targetDate: string
): Promise<EventReminderRow[]> {
  return getPaperClubEventsForDateAndWindow(db, targetDate, "1h");
}

async function getPaperClubEventsForDateAndWindow(
  db: LibsqlClient,
  targetDate: string,
  window: "24h" | "1h"
): Promise<EventReminderRow[]> {
  const remindedAtField = window === "24h" ? "$.reminded_24h_at" : "$.reminded_1h_at";
  const claimedAtField = window === "24h" ? "$.reminded_24h_claimed_at" : "$.reminded_1h_claimed_at";
  const result = await db.execute({
    sql: `SELECT id, title, event_date, notes, metadata
          FROM nodes
          WHERE node_type = 'event'
            AND json_extract(metadata, '$.event_status') = 'scheduled'
            AND json_extract(metadata, '$.event_type') = 'paper-club'
            AND event_date = ?
            AND json_extract(metadata, '${remindedAtField}') IS NULL
            AND (
              json_extract(metadata, '${claimedAtField}') IS NULL
              OR datetime(json_extract(metadata, '${claimedAtField}')) <= datetime('now', '-3 hours')
            )
          ORDER BY event_date ASC`,
    args: [targetDate],
  });

  return result.rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title || ""),
    event_date: String(row.event_date || ""),
    notes: row.notes == null ? null : String(row.notes),
    metadata: parseMetadata(row.metadata),
  }));
}

export async function claimPaperClub24hReminder(
  db: LibsqlClient,
  eventId: number,
  instanceId: string
): Promise<boolean> {
  return claimPaperClubReminder(db, eventId, instanceId, "24h");
}

export async function claimPaperClub1hReminder(
  db: LibsqlClient,
  eventId: number,
  instanceId: string
): Promise<boolean> {
  return claimPaperClubReminder(db, eventId, instanceId, "1h");
}

async function claimPaperClubReminder(
  db: LibsqlClient,
  eventId: number,
  instanceId: string,
  window: "24h" | "1h"
): Promise<boolean> {
  const now = new Date().toISOString();
  const claimedAtField = window === "24h" ? "$.reminded_24h_claimed_at" : "$.reminded_1h_claimed_at";
  const claimedByField = window === "24h" ? "$.reminded_24h_claimed_by" : "$.reminded_1h_claimed_by";
  const remindedAtField = window === "24h" ? "$.reminded_24h_at" : "$.reminded_1h_at";
  const result = await db.execute({
    sql: `UPDATE nodes
          SET metadata = json_set(
                coalesce(metadata, '{}'),
                '${claimedAtField}', ?,
                '${claimedByField}', ?
              ),
              updated_at = ?
          WHERE id = ?
            AND node_type = 'event'
            AND json_extract(metadata, '$.event_status') = 'scheduled'
            AND json_extract(metadata, '$.event_type') = 'paper-club'
            AND json_extract(metadata, '${remindedAtField}') IS NULL
            AND (
              json_extract(metadata, '${claimedAtField}') IS NULL
              OR datetime(json_extract(metadata, '${claimedAtField}')) <= datetime('now', '-3 hours')
            )`,
    args: [now, instanceId, now, eventId],
  });
  return Number(result.rowsAffected || 0) > 0;
}

export async function finalizePaperClub24hReminder(
  db: LibsqlClient,
  eventId: number,
  messageId: string
): Promise<void> {
  return finalizePaperClubReminder(db, eventId, messageId, "24h");
}

export async function finalizePaperClub1hReminder(
  db: LibsqlClient,
  eventId: number,
  messageId: string
): Promise<void> {
  return finalizePaperClubReminder(db, eventId, messageId, "1h");
}

async function finalizePaperClubReminder(
  db: LibsqlClient,
  eventId: number,
  messageId: string,
  window: "24h" | "1h"
): Promise<void> {
  const now = new Date().toISOString();
  const claimedAtField = window === "24h" ? "$.reminded_24h_claimed_at" : "$.reminded_1h_claimed_at";
  const claimedByField = window === "24h" ? "$.reminded_24h_claimed_by" : "$.reminded_1h_claimed_by";
  const remindedAtField = window === "24h" ? "$.reminded_24h_at" : "$.reminded_1h_at";
  const messageIdField = window === "24h" ? "$.reminded_24h_message_id" : "$.reminded_1h_message_id";
  await db.execute({
    sql: `UPDATE nodes
          SET metadata = json_set(
                json_remove(
                  coalesce(metadata, '{}'),
                  '${claimedAtField}',
                  '${claimedByField}'
                ),
                '${remindedAtField}', ?,
                '${messageIdField}', ?
              ),
              updated_at = ?
          WHERE id = ?`,
    args: [now, messageId, now, eventId],
  });
}

export async function releasePaperClub24hReminderClaim(
  db: LibsqlClient,
  eventId: number,
  instanceId: string
): Promise<void> {
  return releasePaperClubReminderClaim(db, eventId, instanceId, "24h");
}

export async function releasePaperClub1hReminderClaim(
  db: LibsqlClient,
  eventId: number,
  instanceId: string
): Promise<void> {
  return releasePaperClubReminderClaim(db, eventId, instanceId, "1h");
}

async function releasePaperClubReminderClaim(
  db: LibsqlClient,
  eventId: number,
  instanceId: string,
  window: "24h" | "1h"
): Promise<void> {
  const now = new Date().toISOString();
  const claimedAtField = window === "24h" ? "$.reminded_24h_claimed_at" : "$.reminded_1h_claimed_at";
  const claimedByField = window === "24h" ? "$.reminded_24h_claimed_by" : "$.reminded_1h_claimed_by";
  const remindedAtField = window === "24h" ? "$.reminded_24h_at" : "$.reminded_1h_at";
  await db.execute({
    sql: `UPDATE nodes
          SET metadata = json_remove(
                coalesce(metadata, '{}'),
                '${claimedAtField}',
                '${claimedByField}'
              ),
              updated_at = ?
          WHERE id = ?
            AND json_extract(metadata, '${claimedByField}') = ?
            AND json_extract(metadata, '${remindedAtField}') IS NULL`,
    args: [now, eventId, instanceId],
  });
}

// ── Edge operations ────────────────────────────────────────────

export async function createEdge(
  db: LibsqlClient,
  sourceId: number,
  targetId: number,
  explanation: string
): Promise<void> {
  const now = new Date().toISOString();
  const context: EdgeContext = {
    type: "related",
    confidence: 0.8,
    inferred_at: now,
    explanation,
    created_via: "discord-bot",
  };
  await db.execute({
    sql: `INSERT INTO edges (from_node_id, to_node_id, context, source, created_at)
          VALUES (?, ?, ?, 'discord-bot', ?)`,
    args: [sourceId, targetId, JSON.stringify(context), now],
  });
}

// ── Search operations (LLM tool handlers) ──────────────────────

export async function searchNodes(
  db: LibsqlClient,
  query: string,
  limit: number,
  nodeType?: string
): Promise<NodeRow[]> {
  const searchTerm = `%${query}%`;
  let sql = `
    SELECT n.id, n.title, n.description, n.notes, n.link, n.node_type, n.event_date, n.metadata,
           COALESCE((SELECT JSON_GROUP_ARRAY(d.dimension)
                     FROM node_dimensions d WHERE d.node_id = n.id), '[]') as dimensions_json,
           (SELECT COUNT(*) FROM edges WHERE from_node_id = n.id OR to_node_id = n.id) as edge_count
    FROM nodes n
    WHERE (n.title LIKE ? COLLATE NOCASE OR n.description LIKE ? COLLATE NOCASE OR n.notes LIKE ? COLLATE NOCASE)
  `;
  const args: (string | number)[] = [searchTerm, searchTerm, searchTerm];

  if (nodeType) {
    sql += ` AND n.node_type = ?`;
    args.push(nodeType);
  }

  sql += `
    ORDER BY
      CASE WHEN LOWER(n.title) = LOWER(?) THEN 1 ELSE 6 END,
      CASE WHEN LOWER(n.title) LIKE LOWER(?) THEN 2 ELSE 6 END,
      CASE WHEN n.title LIKE ? COLLATE NOCASE THEN 3 ELSE 6 END,
      CASE WHEN n.description LIKE ? COLLATE NOCASE THEN 4 ELSE 6 END,
      CASE WHEN n.notes LIKE ? COLLATE NOCASE THEN 5 ELSE 6 END,
      n.updated_at DESC
    LIMIT ?
  `;
  args.push(query, `${query}%`, searchTerm, searchTerm, searchTerm, limit);

  const result = await db.execute({ sql, args });
  return result.rows.map(rowToNode);
}

export async function searchContent(
  db: LibsqlClient,
  query: string,
  limit: number
): Promise<Array<{ node_id: number; title: string; text: string }>> {
  // FTS5 search on chunks
  const ftsQuery = query
    .replace(/['"]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"`)
    .join(" ");

  try {
    const result = await db.execute({
      sql: `SELECT c.node_id, n.title, c.text, bm25(chunks_fts) as rank_score
            FROM chunks_fts fts
            JOIN chunks c ON c.rowid = fts.rowid
            JOIN nodes n ON n.id = c.node_id
            WHERE chunks_fts MATCH ?
            ORDER BY rank_score ASC
            LIMIT ?`,
      args: [ftsQuery, limit],
    });
    return result.rows.map((row) => ({
      node_id: Number(row.node_id),
      title: String(row.title || ""),
      text: String(row.text || ""),
    }));
  } catch {
    // FTS5 fallback: LIKE search
    const result = await db.execute({
      sql: `SELECT c.node_id, n.title, c.text
            FROM chunks c
            JOIN nodes n ON n.id = c.node_id
            WHERE LOWER(c.text) LIKE ?
            ORDER BY LENGTH(c.text) ASC
            LIMIT ?`,
      args: [`%${query.toLowerCase()}%`, limit],
    });
    return result.rows.map((row) => ({
      node_id: Number(row.node_id),
      title: String(row.title || ""),
      text: String(row.text || ""),
    }));
  }
}

export async function getNodesById(
  db: LibsqlClient,
  nodeIds: number[]
): Promise<NodeRow[]> {
  const unique = Array.from(new Set(nodeIds.filter((id) => Number.isFinite(id) && id > 0))).slice(0, 10);
  if (!unique.length) return [];
  const placeholders = unique.map(() => "?").join(", ");
  const result = await db.execute({
    sql: `SELECT n.id, n.title, n.description, n.notes, n.link, n.node_type, n.event_date, n.metadata,
                 COALESCE((SELECT JSON_GROUP_ARRAY(d.dimension)
                           FROM node_dimensions d WHERE d.node_id = n.id), '[]') as dimensions_json
          FROM nodes n
          WHERE n.id IN (${placeholders})`,
    args: unique,
  });
  return result.rows.map(rowToNode);
}

export async function queryEdges(
  db: LibsqlClient,
  nodeId: number,
  limit: number = 25
): Promise<Array<Record<string, unknown>>> {
  const result = await db.execute({
    sql: `SELECT
            e.id, e.from_node_id, e.to_node_id, e.context, e.created_at,
            CASE WHEN e.from_node_id = ? THEN n_to.id ELSE n_from.id END as connected_node_id,
            CASE WHEN e.from_node_id = ? THEN n_to.title ELSE n_from.title END as connected_node_title,
            CASE WHEN e.from_node_id = ? THEN n_to.node_type ELSE n_from.node_type END as connected_node_type,
            CASE WHEN e.from_node_id = ? THEN n_to.description ELSE n_from.description END as connected_description,
            CASE WHEN e.from_node_id = ? THEN n_to.link ELSE n_from.link END as connected_link,
            CASE WHEN e.from_node_id = ? THEN 'outgoing' ELSE 'incoming' END as direction
          FROM edges e
          LEFT JOIN nodes n_from ON e.from_node_id = n_from.id
          LEFT JOIN nodes n_to ON e.to_node_id = n_to.id
          WHERE e.from_node_id = ? OR e.to_node_id = ?
          ORDER BY e.created_at DESC
          LIMIT ?`,
    args: [nodeId, nodeId, nodeId, nodeId, nodeId, nodeId, nodeId, nodeId, limit],
  });
  return result.rows as unknown as Array<Record<string, unknown>>;
}

export async function listDimensions(
  db: LibsqlClient
): Promise<Array<{ name: string; description: string; count: number }>> {
  const result = await db.execute({
    sql: `WITH dimension_counts AS (
            SELECT nd.dimension, COUNT(*) AS count
            FROM node_dimensions nd
            GROUP BY nd.dimension
          )
          SELECT
            d.name,
            d.description,
            COALESCE(dc.count, 0) AS count
          FROM dimensions d
          LEFT JOIN dimension_counts dc ON dc.dimension = d.name
          WHERE d.is_priority = 1
          ORDER BY d.name ASC`,
    args: [],
  });
  return result.rows.map((row) => ({
    name: String(row.name),
    description: String(row.description || ""),
    count: Number(row.count),
  }));
}

export async function getContext(
  db: LibsqlClient
): Promise<Record<string, unknown>> {
  const [nodesResult, edgesResult, chunksResult] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) as cnt FROM nodes", args: [] }),
    db.execute({ sql: "SELECT COUNT(*) as cnt FROM edges", args: [] }),
    db.execute({ sql: "SELECT COUNT(*) as cnt FROM chunks", args: [] }),
  ]);

  return {
    stats: {
      nodes: Number(nodesResult.rows[0]?.cnt ?? 0),
      edges: Number(edgesResult.rows[0]?.cnt ?? 0),
      chunks: Number(chunksResult.rows[0]?.cnt ?? 0),
    },
  };
}

export async function sqliteQuery(
  db: LibsqlClient,
  sql: string
): Promise<Array<Record<string, unknown>>> {
  // Read-only enforcement
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH") && !normalized.startsWith("PRAGMA")) {
    throw new Error("Only SELECT, WITH, and PRAGMA queries are allowed.");
  }
  const result = await db.execute({ sql, args: [] });
  return result.rows as unknown as Array<Record<string, unknown>>;
}

// ── Semantic search (vector) ──────────────────────────────────

type SemanticHit = {
  node_id: number;
  title: string;
  description: string;
  text: string;
  link: string;
  event_date: string;
  score: number;
  source: "node_vector" | "chunk_vector" | "fts" | "fused";
};

function vectorToJsonString(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

async function embedQuery(
  query: string,
  apiKey: string,
  model = "text-embedding-3-small"
): Promise<number[] | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: query }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

async function vectorSearchNodes(
  db: LibsqlClient,
  embedding: number[],
  limit: number
): Promise<SemanticHit[]> {
  const vecJson = vectorToJsonString(embedding);
  const result = await db.execute({
    sql: `SELECT n.id AS node_id, n.title,
                 coalesce(n.description, '') AS description,
                 substr(coalesce(n.notes, ''), 1, 500) AS text,
                 coalesce(n.link, '') AS link,
                 coalesce(n.event_date, '') AS event_date,
                 (1.0 - vector_distance_cos(n.embedding_vec, vector(?))) AS score
          FROM vector_top_k('nodes_embedding_idx', vector(?), ?) AS vt
          JOIN nodes n ON n.rowid = vt.id
          ORDER BY score DESC`,
    args: [vecJson, vecJson, limit],
  });
  return result.rows.map((row) => ({
    node_id: Number(row.node_id),
    title: String(row.title || ""),
    description: String(row.description || ""),
    text: String(row.text || ""),
    link: String(row.link || ""),
    event_date: String(row.event_date || ""),
    score: Number(row.score || 0),
    source: "node_vector" as const,
  }));
}

async function vectorSearchChunks(
  db: LibsqlClient,
  embedding: number[],
  limit: number
): Promise<SemanticHit[]> {
  const vecJson = vectorToJsonString(embedding);
  const result = await db.execute({
    sql: `SELECT n.id AS node_id, n.title,
                 coalesce(n.description, '') AS description,
                 substr(c.text, 1, 500) AS text,
                 coalesce(n.link, '') AS link,
                 coalesce(n.event_date, '') AS event_date,
                 (1.0 - vector_distance_cos(c.embedding, vector(?))) AS score
          FROM vector_top_k('chunks_embedding_idx', vector(?), ?) AS vt
          JOIN chunks c ON c.rowid = vt.id
          JOIN nodes n ON n.id = c.node_id
          ORDER BY score DESC`,
    args: [vecJson, vecJson, limit],
  });
  return result.rows.map((row) => ({
    node_id: Number(row.node_id),
    title: String(row.title || ""),
    description: String(row.description || ""),
    text: String(row.text || ""),
    link: String(row.link || ""),
    event_date: String(row.event_date || ""),
    score: Number(row.score || 0),
    source: "chunk_vector" as const,
  }));
}

function fuseResults(
  nodeHits: SemanticHit[],
  chunkHits: SemanticHit[],
  maxResults: number
): SemanticHit[] {
  const k = 60;
  const map = new Map<string, { score: number; hit: SemanticHit }>();

  // Key by node_id + text snippet to preserve distinct passages
  nodeHits.forEach((hit, idx) => {
    const key = `n:${hit.node_id}`;
    map.set(key, { score: 1 / (k + idx + 1), hit });
  });

  chunkHits.forEach((hit, idx) => {
    const key = `c:${hit.node_id}:${hit.text.slice(0, 50)}`;
    const rrf = 1 / (k + idx + 1);
    // Boost if same node appeared in node-level results
    const nodeKey = `n:${hit.node_id}`;
    const existing = map.get(nodeKey);
    if (existing) {
      existing.score += rrf;
      // Keep chunk text (more specific) if it's longer
      if (hit.text.length > existing.hit.text.length) {
        existing.hit = { ...hit, source: "fused" };
      }
    } else {
      map.set(key, { score: rrf, hit });
    }
  });

  return [...map.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((e) => ({ ...e.hit, score: e.score }));
}

export async function semanticSearch(
  db: LibsqlClient,
  query: string,
  openAiApiKey: string,
  limit: number
): Promise<{ method: string; results: SemanticHit[] }> {
  if (!openAiApiKey) {
    return { method: "unavailable", results: [] };
  }

  const embedding = await embedQuery(query, openAiApiKey);
  if (!embedding) {
    return { method: "embedding_failed", results: [] };
  }

  const fetchCount = limit * 2;
  const [nodeHits, chunkHits] = await Promise.all([
    vectorSearchNodes(db, embedding, fetchCount).catch(() => []),
    vectorSearchChunks(db, embedding, fetchCount).catch(() => []),
  ]);

  const fused = fuseResults(nodeHits, chunkHits, limit);
  return { method: "semantic", results: fused };
}

// ── Helpers ────────────────────────────────────────────────────

function parseMetadata(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function chunkTextForStorage(text: string): string[] {
  const chunkSize = 2000;
  const overlap = 400;
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + chunkSize, text.length);
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      const sentenceBreak = text.lastIndexOf(". ", end);
      if (paragraphBreak > pos + chunkSize * 0.5) {
        end = paragraphBreak;
      } else if (sentenceBreak > pos + chunkSize * 0.5) {
        end = sentenceBreak + 1;
      }
    }
    const chunk = text.slice(pos, end).trim();
    if (chunk) chunks.push(chunk);
    const next = end - overlap;
    pos = next <= pos ? end : next;
  }
  return chunks;
}

function isUniqueConstraintError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /unique|constraint|already exists/i.test(msg);
}

function rowToNode(row: Record<string, unknown>): NodeRow {
  return {
    id: Number(row.id),
    title: String(row.title || ""),
    notes: row.notes == null ? null : String(row.notes),
    description: row.description == null ? null : String(row.description),
    link: row.link == null ? null : String(row.link),
    node_type: row.node_type == null ? null : String(row.node_type),
    event_date: row.event_date == null ? null : String(row.event_date),
    metadata: parseMetadata(row.metadata),
  };
}
