import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient, type Client, type InValue } from '@libsql/client';

type Row = Record<string, unknown>;

interface HubNodeSpec {
  key: 'podcast' | 'newsletter' | 'builders' | 'writers' | 'ainews';
  title: string;
  nodeType: 'entity';
  link?: string;
  dimensions: string[];
  description: string;
  notes: string;
  timelineSummary: string;
  updateExistingId?: number;
}

const TODAY = new Date().toISOString().slice(0, 10);
let _client: Client | null = null;

function db(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) throw new Error('TURSO_DATABASE_URL not set (.env.local)');
    _client = createClient({ url, authToken });
  }
  return _client;
}

async function query(sql: string, args: InValue[] = []) {
  const result = await db().execute({ sql, args });
  const rows = result.rows.map((r) => {
    const obj: Row = {};
    for (let i = 0; i < result.columns.length; i += 1) obj[result.columns[i]] = r[i];
    return obj;
  });
  return { rows, rowsAffected: result.rowsAffected ?? 0 };
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'string') return {};
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function ensureDimension(name: string, description: string): Promise<void> {
  const existing = await query('SELECT name FROM dimensions WHERE name = ? LIMIT 1', [name]);
  if (existing.rows.length > 0) return;
  await query(
    'INSERT INTO dimensions (name, description, icon, is_priority, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
    [name, description, 'tag', nowIso(), nowIso()]
  );
  console.log(`Created dimension: ${name}`);
}

async function ensureNodeDimension(nodeId: number, dimension: string): Promise<void> {
  const existing = await query(
    'SELECT 1 FROM node_dimensions WHERE node_id = ? AND dimension = ? LIMIT 1',
    [nodeId, dimension]
  );
  if (existing.rows.length > 0) return;
  await query(
    'INSERT INTO node_dimensions (node_id, dimension, created_at) VALUES (?, ?, ?)',
    [nodeId, dimension, nowIso()]
  );
}

async function getNodeById(id: number): Promise<Row | null> {
  const { rows } = await query('SELECT * FROM nodes WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function getNodeByTitle(title: string): Promise<Row | null> {
  const { rows } = await query('SELECT * FROM nodes WHERE LOWER(title) = LOWER(?) LIMIT 1', [title]);
  return rows[0] || null;
}

async function createNode(spec: HubNodeSpec): Promise<number> {
  const metadata = {
    timeline_summary: spec.timelineSummary,
    last_narrative_update: TODAY,
    source: 'prd-15-hub-nodes',
  };

  const result = await query(
    `INSERT INTO nodes
      (title, notes, description, link, node_type, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      spec.title,
      spec.notes,
      spec.description,
      spec.link || null,
      spec.nodeType,
      JSON.stringify(metadata),
      nowIso(),
      nowIso(),
    ]
  );

  const idRows = await query('SELECT id FROM nodes WHERE LOWER(title) = LOWER(?) ORDER BY id DESC LIMIT 1', [spec.title]);
  const id = Number(idRows.rows[0]?.id);
  if (!id || Number.isNaN(id)) {
    throw new Error(`Failed to resolve created node id for ${spec.title} (rowsAffected=${result.rowsAffected})`);
  }

  for (const dim of spec.dimensions) {
    await ensureNodeDimension(id, dim);
  }

  console.log(`Created node ${id}: ${spec.title}`);
  return id;
}

async function updateNode(id: number, spec: HubNodeSpec): Promise<void> {
  const current = await getNodeById(id);
  if (!current) throw new Error(`Node ${id} not found for update (${spec.title})`);

  const metadata = parseMetadata(current.metadata);
  metadata.timeline_summary = spec.timelineSummary;
  metadata.last_narrative_update = TODAY;
  metadata.source = 'prd-15-hub-nodes';

  await query(
    `UPDATE nodes
     SET title = ?, notes = ?, description = ?, link = ?, node_type = ?, metadata = ?, updated_at = ?
     WHERE id = ?`,
    [
      spec.title,
      spec.notes,
      spec.description,
      spec.link || null,
      spec.nodeType,
      JSON.stringify(metadata),
      nowIso(),
      id,
    ]
  );

  for (const dim of spec.dimensions) {
    await ensureNodeDimension(id, dim);
  }

  console.log(`Updated node ${id}: ${spec.title}`);
}

async function ensureEdge(
  fromNodeId: number,
  toNodeId: number,
  explanation: string,
  opts?: { validFrom?: string; relationshipType?: string }
): Promise<boolean> {
  const existing = await query(
    'SELECT id FROM edges WHERE from_node_id = ? AND to_node_id = ? LIMIT 1',
    [fromNodeId, toNodeId]
  );
  if (existing.rows.length > 0) return false;

  const context = {
    type: opts?.relationshipType || 'related_to',
    confidence: 1,
    explanation,
    created_via: 'workflow',
    ...(opts?.validFrom ? { valid_from: opts.validFrom } : {}),
  };

  await query(
    'INSERT INTO edges (from_node_id, to_node_id, context, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [fromNodeId, toNodeId, JSON.stringify(context), 'workflow_hub_nodes', nowIso(), nowIso()]
  );
  return true;
}

async function merge2334Into2074(): Promise<void> {
  const dupe = await getNodeById(2334);
  const keeper = await getNodeById(2074);
  if (!keeper) throw new Error('Expected node 2074 to exist');
  if (!dupe) {
    console.log('Node 2334 already absent; merge step skipped.');
    return;
  }

  await query('UPDATE edges SET from_node_id = ? WHERE from_node_id = ? AND to_node_id != ?', [2074, 2334, 2074]);
  await query('UPDATE edges SET to_node_id = ? WHERE to_node_id = ? AND from_node_id != ?', [2074, 2334, 2074]);
  await query('DELETE FROM edges WHERE from_node_id = ? AND to_node_id = ?', [2074, 2074]);

  const edgeR = await query('DELETE FROM edges WHERE from_node_id = ? OR to_node_id = ?', [2334, 2334]);
  const chunkR = await query('DELETE FROM chunks WHERE node_id = ?', [2334]);
  await query('DELETE FROM node_dimensions WHERE node_id = ?', [2334]);
  await query('DELETE FROM nodes WHERE id = ?', [2334]);

  console.log(
    `Merged node 2334 into 2074. Removed leftovers: edges=${edgeR.rowsAffected}, chunks=${chunkR.rowsAffected}`
  );
}

async function deleteEmptyDimension(name: string): Promise<void> {
  const usage = await query('SELECT COUNT(*) AS c FROM node_dimensions WHERE dimension = ?', [name]);
  const count = Number(usage.rows[0]?.c || 0);
  if (count > 0) {
    console.log(`Dimension ${name} still in use (${count}); not deleted.`);
    return;
  }
  const del = await query('DELETE FROM dimensions WHERE name = ?', [name]);
  if (del.rowsAffected > 0) console.log(`Deleted empty dimension: ${name}`);
}

async function findOrCreateHub(spec: HubNodeSpec): Promise<number> {
  if (spec.updateExistingId) {
    await updateNode(spec.updateExistingId, spec);
    return spec.updateExistingId;
  }

  const existing = await getNodeByTitle(spec.title);
  if (existing) {
    const id = Number(existing.id);
    await updateNode(id, spec);
    return id;
  }

  return createNode(spec);
}

async function idsByType(nodeType: string): Promise<number[]> {
  const { rows } = await query('SELECT id FROM nodes WHERE node_type = ? ORDER BY event_date ASC, id ASC', [nodeType]);
  return rows.map((r) => Number(r.id)).filter((id) => !Number.isNaN(id));
}

async function addHubContentEdges(hubId: number, nodeType: string, explanation: string): Promise<{ added: number; existing: number }> {
  const ids = await idsByType(nodeType);
  let added = 0;
  let existing = 0;
  for (const id of ids) {
    const created = await ensureEdge(hubId, id, explanation);
    if (created) added += 1;
    else existing += 1;
  }
  return { added, existing };
}

async function addNarrativeSeedEdge(
  lookupSql: string,
  lookupArgs: InValue[],
  toHubId: number,
  arcName: string
): Promise<boolean> {
  const { rows } = await query(lookupSql, lookupArgs);
  const row = rows[0];
  if (!row) return false;
  const fromId = Number(row.id);
  const validFrom = typeof row.event_date === 'string' ? row.event_date.slice(0, 10) : undefined;
  return ensureEdge(fromId, toHubId, `advances the arc of ${arcName}`, {
    relationshipType: 'extends',
    validFrom,
  });
}

async function verify(hubIds: Record<string, number>) {
  const pairs: Array<[string, string, number]> = [
    ['podcast', 'podcast', hubIds.podcast],
    ['article', 'article', hubIds.newsletter],
    ['builders-club', 'builders-club', hubIds.builders],
    ['ainews', 'ainews', hubIds.ainews],
  ];

  console.log('\nVerification:');
  for (const [label, type, hubId] of pairs) {
    const countR = await query('SELECT COUNT(*) AS c FROM edges WHERE from_node_id = ?', [hubId]);
    const outCount = Number(countR.rows[0]?.c || 0);

    const orphanR = await query(
      `SELECT COUNT(*) AS c
       FROM nodes n
       WHERE n.node_type = ?
         AND NOT EXISTS (
           SELECT 1 FROM edges e WHERE e.from_node_id = ? AND e.to_node_id = n.id
         )`,
      [type, hubId]
    );
    const orphanCount = Number(orphanR.rows[0]?.c || 0);
    console.log(`- ${label}: outgoing_edges=${outCount}, orphans=${orphanCount}`);
  }

  const dupeR = await query('SELECT COUNT(*) AS c FROM nodes WHERE id = 2334');
  console.log(`- duplicate node 2334 remaining: ${Number(dupeR.rows[0]?.c || 0)}`);

  const totals = await query('SELECT (SELECT COUNT(*) FROM nodes) AS nodes, (SELECT COUNT(*) FROM edges) AS edges');
  console.log(`- totals: nodes=${Number(totals.rows[0]?.nodes || 0)}, edges=${Number(totals.rows[0]?.edges || 0)}`);

  const top = await query(
    `SELECT n.id, n.title, COUNT(e.id) AS edge_count
     FROM nodes n
     LEFT JOIN edges e ON e.from_node_id = n.id OR e.to_node_id = n.id
     GROUP BY n.id
     ORDER BY edge_count DESC, n.id ASC
     LIMIT 20`
  );
  console.log('- top connected (top 20):');
  for (const r of top.rows) {
    console.log(`  ${r.id}: ${r.title} (${r.edge_count})`);
  }
}

async function main() {
  console.log('== PRD-15 Hub Nodes Execution ==');

  await ensureDimension('latent-space-podcast', 'Latent Space podcast ecosystem');
  await ensureDimension('article', 'Latent Space newsletter and blog content');
  await ensureDimension('meetup', 'Community meetup sessions');
  await ensureDimension('ainews', 'AI News daily digest');

  await merge2334Into2074();

  const specs: HubNodeSpec[] = [
    {
      key: 'podcast',
      title: 'Latent Space Podcast',
      nodeType: 'entity',
      link: 'https://www.latent.space/podcast',
      dimensions: ['latent-space-podcast'],
      description:
        'Top-10 US technology podcast hosted by swyx (Shawn Wang) and Alessio Rinaldi, covering AI engineering for software engineers building with LLMs. Running since June 2023, with 247+ episodes featuring guests from major AI labs and startups.',
      notes:
        '- Hosted by swyx and Alessio Rinaldi; technical but targeted at AI engineers building real systems.\n- Format is long-form interviews focused on implementation details, infrastructure, and scaling tradeoffs.\n- First episode in this run started in June 2023.\n- Published as audio and YouTube video with production editing.\n- Part of the larger Latent Space ecosystem with newsletter, Discord, Builders Club, Paper Club, and events.\n- Guest brief emphasizes specific examples, numbers, predictions, and concrete lessons.\n- Guests span major AI labs and startup operators.',
      timelineSummary:
        '2023 launch to present: long-form interviews tracking practical AI engineering from prototype workflows to production-scale agent infrastructure.',
    },
    {
      key: 'newsletter',
      title: 'Latent Space (Newsletter & Blog)',
      nodeType: 'entity',
      link: 'https://www.latent.space',
      dimensions: ['article'],
      description:
        'Latent Space Substack newsletter and blog by swyx and Alessio Rinaldi, publishing long-form technical articles, essay series, and event recaps for AI engineers since 2023.',
      notes:
        '- Published on Substack at latent.space with AI engineering deep dives.\n- Includes essays, conference recaps, reading lists, and companion pieces tied to episodes.\n- Complements the podcast, Discord community, Builders Club, and AI Engineer conference.\n- Notable themes include AI engineer role formation, agent workflows, and production lessons.\n- 71+ articles currently represented in the graph.',
      timelineSummary:
        '2023 onward: written narrative layer for Latent Space, from early AI engineer framing through agent-era implementation patterns.',
      updateExistingId: 2074,
    },
    {
      key: 'builders',
      title: 'Latent Space Builders Club',
      nodeType: 'entity',
      link: 'https://www.latent.space/p/builders-club',
      dimensions: ['meetup'],
      description:
        'Latent Space community meetup program where AI engineers demo projects, share workflows, and present live builds. Includes AI in Action and related meetup formats since April 2024.',
      notes:
        '- Recurring community meetups coordinated through the Latent Space ecosystem.\n- AI in Action is the primary demo format for real projects and operator workflows.\n- Includes specialized sessions like Dev Writers Meetup and occasional in-person events.\n- Sessions are recorded and represented in the knowledge graph.\n- Distinct from Paper Club, which focuses on research paper discussion.',
      timelineSummary:
        '2024 onward: community demos evolved from ad hoc showcases into repeatable operator knowledge-sharing sessions.',
    },
    {
      key: 'writers',
      title: 'Latent Space Writers Club',
      nodeType: 'entity',
      dimensions: ['meetup'],
      description:
        'Latent Space community program for technical writers in AI engineering, a Builders Club sub-program focused on writing craft, workshops, and practice-oriented discussion.',
      notes:
        '- Sub-program inside Builders Club focused on technical writing in AI engineering.\n- Also referred to as Dev Writers Meetup in session naming.\n- Includes sessions such as Why I Write (Drew Breunig, January 2026).\n- Smaller and newer than Builders Club, but aligned to the same community ecosystem.',
      timelineSummary:
        '2026 onward: focused writing-craft track within the broader builders community program.',
    },
    {
      key: 'ainews',
      title: 'AI News (by swyx)',
      nodeType: 'entity',
      link: 'https://buttondown.com/ainews',
      dimensions: ['ainews'],
      description:
        'Daily AI news digest curated by swyx, covering major AI developments with editorial context. Published since January 2025 with 136+ editions in the graph.',
      notes:
        '- Daily curation with commentary, not only link aggregation.\n- Tracks model launches, benchmark shifts, open-source progress, company moves, and ecosystem dynamics.\n- Distributed via Buttondown and frequently referenced in Latent Space channels.\n- Uses [AINews] title pattern and forms a distinct stream from the main Substack newsletter.',
      timelineSummary:
        '2025 onward: daily timeline of market-moving releases and ecosystem transitions with operator-facing interpretation.',
      updateExistingId: 2218,
    },
  ];

  const hubIds: Record<string, number> = {};
  for (const spec of specs) {
    const id = await findOrCreateHub(spec);
    hubIds[spec.key] = id;
  }

  await deleteEmptyDimension('Builders Club');
  await deleteEmptyDimension('AI News');

  const podcastEdges = await addHubContentEdges(hubIds.podcast, 'podcast', 'is the parent series of');
  const articleEdges = await addHubContentEdges(hubIds.newsletter, 'article', 'published this article');
  const buildersEdges = await addHubContentEdges(hubIds.builders, 'builders-club', 'hosted this meetup session');
  const aiNewsEdges = await addHubContentEdges(hubIds.ainews, 'ainews', 'is the parent series of');

  const writerToSession = await ensureEdge(hubIds.writers, 363, 'hosted this meetup session');
  const writerToBuilders = await ensureEdge(hubIds.writers, hubIds.builders, 'is a sub-program of');

  const crossSpecs: Array<[number, number, string]> = [
    [hubIds.podcast, hubIds.newsletter, 'is part of the same ecosystem as'],
    [hubIds.podcast, hubIds.builders, 'is part of the same ecosystem as'],
    [hubIds.newsletter, hubIds.ainews, 'is part of the same ecosystem as'],
    [hubIds.builders, hubIds.writers, 'is part of the same ecosystem as'],
  ];

  let crossAdded = 0;
  for (const [from, to, explanation] of crossSpecs) {
    if (await ensureEdge(from, to, explanation)) crossAdded += 1;
  }

  let narrativeAdded = 0;
  if (
    await addNarrativeSeedEdge(
      "SELECT id, event_date FROM nodes WHERE node_type = 'podcast' AND lower(title) LIKE '%agent%' ORDER BY event_date ASC, id ASC LIMIT 1",
      [],
      hubIds.podcast,
      'coding agents'
    )
  ) {
    narrativeAdded += 1;
  }
  if (
    await addNarrativeSeedEdge(
      "SELECT id, event_date FROM nodes WHERE node_type = 'article' AND lower(title) LIKE '%open%' ORDER BY event_date ASC, id ASC LIMIT 1",
      [],
      hubIds.newsletter,
      'open vs closed model strategies'
    )
  ) {
    narrativeAdded += 1;
  }
  if (
    await addNarrativeSeedEdge(
      "SELECT id, event_date FROM nodes WHERE node_type = 'ainews' AND (lower(title) LIKE '%mcp%' OR lower(title) LIKE '%model context protocol%') ORDER BY event_date ASC, id ASC LIMIT 1",
      [],
      hubIds.ainews,
      'mcp adoption'
    )
  ) {
    narrativeAdded += 1;
  }
  if (
    await addNarrativeSeedEdge(
      "SELECT id, event_date FROM nodes WHERE node_type = 'podcast' AND lower(title) LIKE '%scale%' ORDER BY event_date ASC, id ASC LIMIT 1",
      [],
      hubIds.podcast,
      'scaling AI systems'
    )
  ) {
    narrativeAdded += 1;
  }

  console.log('\nEdge creation summary:');
  console.log(`- podcast hub edges: added=${podcastEdges.added}, existing=${podcastEdges.existing}`);
  console.log(`- newsletter hub edges: added=${articleEdges.added}, existing=${articleEdges.existing}`);
  console.log(`- builders hub edges: added=${buildersEdges.added}, existing=${buildersEdges.existing}`);
  console.log(`- ainews hub edges: added=${aiNewsEdges.added}, existing=${aiNewsEdges.existing}`);
  console.log(`- writers special edges: session=${writerToSession ? 'added' : 'existing'}, sub-program=${writerToBuilders ? 'added' : 'existing'}`);
  console.log(`- cross-hub edges added=${crossAdded}`);
  console.log(`- narrative seeded edges added=${narrativeAdded}`);

  await verify(hubIds);
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(() => {
    if (_client) _client.close();
  });
