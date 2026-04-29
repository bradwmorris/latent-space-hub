#!/usr/bin/env node

import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local', quiet: true });

const apply = process.argv.includes('--apply');

const sessions = [
  {
    existingId: 4304,
    date: '2025-12-24',
    title: 'Paper Club: Does Reinforcement Learning Really Incentivize Reasoning Capacity in LLMs Beyond the Base Model?',
    paperTitle: 'Does Reinforcement Learning Really Incentivize Reasoning Capacity in LLMs Beyond the Base Model?',
    presenter: 'Frankie Liu',
    paperUrls: ['https://openreview.net/forum?id=4OsgYD7em5'],
    lumaUrl: 'https://luma.com/xqmx4hu1',
    lumaEventApiId: 'evt-H4LmAlfrIJ6hPm0',
    evidence: 'Luma description and YouTube description say Frankie Liu will present.',
    status: 'completed',
  },
  {
    existingId: 4302,
    date: '2025-12-31',
    title: 'Paper Club: Show-o2: Improved Native Unified Multimodal Models',
    paperTitle: 'Show-o2: Improved Native Unified Multimodal Models',
    presenter: 'Hexie Li',
    paperUrls: ['https://arxiv.org/abs/2506.15564'],
    lumaUrl: 'https://luma.com/xi94v1mt',
    lumaEventApiId: 'evt-TcBDAxDGgAmLAOZ',
    evidence: 'Luma description says Hexie Li is closing out 2025 with this paper.',
    status: 'completed',
  },
  {
    existingId: 4301,
    date: '2026-01-07',
    title: 'Paper Club: Can LLMs Predict Their Own Failures? Self-Awareness via Internal Circuits',
    paperTitle: 'Can LLMs Predict Their Own Failures? Self-Awareness via Internal Circuits',
    presenter: 'Vibhu Sapra',
    paperUrls: ['https://huggingface.co/papers/2512.20578'],
    lumaUrl: 'https://luma.com/uipiztbk',
    lumaEventApiId: 'evt-GJhBYA2LdqllXHg',
    evidence: 'Luma description says Vibhu will cover.',
    status: 'completed',
  },
  {
    date: '2026-01-14',
    title: 'Paper Club: LTX-2: Efficient Joint Audio-Visual Foundation Model',
    paperTitle: 'LTX-2: Efficient Joint Audio-Visual Foundation Model',
    presenter: 'Vibhu Sapra',
    paperUrls: ['https://arxiv.org/abs/2601.03233'],
    lumaUrl: 'https://luma.com/ocj5smv5',
    lumaEventApiId: 'evt-DjnVKa9NLT5Rarz',
    evidence: 'Luma description says Vibhu will take us through it.',
    status: 'completed',
  },
  {
    existingId: 4294,
    date: '2026-01-21',
    title: "Paper Club: Anthropic's Assistant Axis",
    paperTitle: "Anthropic's Assistant Axis: situating and stabilizing the character of large language models",
    presenter: 'Vibhu Sapra',
    paperUrls: ['https://www.anthropic.com/research/assistant-axis'],
    lumaUrl: 'https://luma.com/ukihj47q',
    lumaEventApiId: 'evt-gVKqiuJ655aucpl',
    evidence: 'Luma description says Vibhu will cover.',
    status: 'completed',
    recordingNodeId: 343,
  },
  {
    existingId: 4295,
    date: '2026-01-28',
    title: 'Paper Club: Recursive Language Models; Meta Confucius Code Agent',
    paperTitle: 'Recursive Language Models; Meta Confucius Code Agent',
    presenter: 'Raphael Kalandadze',
    paperUrls: ['https://arxiv.org/pdf/2512.10398'],
    lumaUrl: 'https://luma.com/n20lzrxt',
    lumaEventApiId: 'evt-zh8eleioyhnD9be',
    evidence: 'Luma description says Raphael Kalandadze will go over these papers.',
    status: 'completed',
    recordingNodeId: 352,
  },
  {
    existingId: 4298,
    date: '2026-02-04',
    title: 'Paper Club: Kimi K2.5 Tech Report + Alec Radford on Data Filtering',
    paperTitle: 'Kimi K2.5 Tech Report + Alec Radford on Data Filtering',
    presenter: null,
    paperUrls: [
      'https://github.com/MoonshotAI/Kimi-K2.5/blob/master/tech_report.pdf',
      'https://arxiv.org/abs/2601.21571',
    ],
    lumaUrl: 'https://luma.com/1glg2z19',
    lumaEventApiId: 'evt-fa8ySnGJKLTzzpB',
    evidence: 'Luma says this was the weekly session but still asks for volunteers; presenter not captured.',
    status: 'completed',
  },
  {
    existingId: 4296,
    date: '2026-02-11',
    title: 'Paper Club: LLaDA 2.1 + RL via Self-Distillation + Generative Meta-Model',
    paperTitle: 'LLaDA 2.1 + RL via Self-Distillation + Generative Meta-Model',
    presenter: 'Ted Kyi; Vibhu Sapra',
    paperUrls: [
      'https://huggingface.co/papers/2602.08676',
      'https://arxiv.org/pdf/2601.20802',
      'https://arxiv.org/abs/2602.06964',
    ],
    lumaUrl: 'https://luma.com/hgw60drj',
    lumaEventApiId: 'evt-1ZmPrLnUNaShfMx',
    evidence: 'Luma says Ted covers LLaDA/RL Self-Distillation and Vibhu covers Generative Meta-Model; YouTube says Ted Kyi presents SDPO.',
    status: 'completed',
    recordingNodeId: 355,
  },
  {
    date: '2026-02-18',
    title: 'Paper Club: Rubric Based RL survey + Alec Radford Generative Meta-Model',
    paperTitle: 'Rubric Based RL survey + Alec Radford Generative Meta-Model',
    presenter: 'swyx; Vibhu Sapra',
    paperUrls: ['https://cameronrwolfe.substack.com/p/rubric-rl', 'https://generative-latent-prior.github.io/'],
    lumaUrl: 'https://luma.com/ezca5csv',
    lumaEventApiId: 'evt-iTqRbocPpNfPo5H',
    evidence: 'Luma names swyx for Rubric RL and Vibhu for the generative meta-model.',
    status: 'completed',
  },
  {
    date: '2026-02-25',
    title: 'Paper Club: Midtraining Bridges Pretraining and Posttraining Distributions',
    paperTitle: 'Midtraining Bridges Pretraining and Posttraining Distributions',
    presenter: 'Vibhu Sapra',
    paperUrls: ['https://arxiv.org/abs/2510.14865'],
    lumaUrl: 'https://luma.com/8qkhhbam',
    lumaEventApiId: 'evt-43qtji47KefmbEA',
    evidence: 'Luma and YouTube descriptions say Vibhu covered/presented.',
    status: 'completed',
    recordingNodeId: 4487,
  },
  {
    date: '2026-03-04',
    title: 'Paper Club: Discovering Multiagent Learning Algorithms with Large Language Models',
    paperTitle: 'Discovering Multiagent Learning Algorithms with Large Language Models',
    presenter: 'ankitmaloo',
    paperUrls: ['https://arxiv.org/abs/2602.16928'],
    lumaUrl: 'https://luma.com/mbamhb61',
    lumaEventApiId: 'evt-uH5jMfJV1vKKmDP',
    evidence: 'Luma says @ankitmaloo will cover; YouTube says ankit presents.',
    status: 'completed',
    recordingNodeId: 4489,
  },
  {
    existingId: 4357,
    date: '2026-03-11',
    title: 'Paper Club: Moltbook analysis + Persona Selection',
    paperTitle: 'Moltbook analysis + Persona Selection',
    presenter: 'yikesawjeez',
    paperUrls: ['https://arxiv.org/abs/2602.13284', 'https://www.anthropic.com/research/persona-selection-model'],
    lumaUrl: 'https://luma.com/l932tn90',
    lumaEventApiId: 'evt-FFRRdbVPbYRKB2d',
    evidence: 'Luma says Yikes will cover; DB has yikesawjeez.',
    status: 'completed',
  },
  {
    existingId: 4480,
    date: '2026-03-18',
    title: 'Paper Club: Karpathy Autoresearch, ShinkaEvolve, TextToLORA',
    paperTitle: 'Karpathy Autoresearch, ShinkaEvolve, TextToLORA',
    presenter: 'Vibhu Sapra; Brad Morris',
    paperUrls: ['https://x.com/karpathy/status/2030371219518931079', 'https://arxiv.org/pdf/2509.19349'],
    lumaUrl: 'https://luma.com/bjew9bmb',
    lumaEventApiId: 'evt-aYiCGUWvB3DZKfF',
    evidence: 'Luma says Vibhu covers autoresearch and Brad covers ShinkaEvolve/TextToLORA.',
    status: 'completed',
  },
  {
    date: '2026-03-25',
    title: 'Paper Club: Moonshot Attention Residuals + Cursor Composer 2',
    paperTitle: 'Moonshot Attention Residuals + Cursor Composer 2',
    presenter: 'Ted Kyi',
    paperUrls: ['https://arxiv.org/abs/2603.15031'],
    lumaUrl: 'https://luma.com/9i2i32nv',
    lumaEventApiId: 'evt-G7wzhUki6mESjh9',
    evidence: 'Luma says Ted will cover Attention Residuals; Composer 2 if time allowed.',
    status: 'completed',
  },
  {
    date: '2026-04-01',
    title: 'Paper Club: Composer 2 + Claude Code Leaks',
    paperTitle: 'Composer 2 + Claude Code Leaks',
    presenter: 'Vibhu Sapra',
    paperUrls: ['https://www.latent.space/p/ainews-the-claude-code-source-leak'],
    lumaUrl: 'https://luma.com/zq5q8lrz',
    lumaEventApiId: 'evt-pseYHmzO9A6SidM',
    evidence: 'Discord observation says Vibhu announced they would cover Cursor Composer 2; Luma does not name a presenter.',
    status: 'completed',
    confidence: 'medium',
  },
  {
    date: '2026-04-08',
    title: 'Paper Club: MSA: Memory Sparse Attention for Efficient End-to-End Memory Model Scaling to 100M Tokens',
    paperTitle: 'MSA: Memory Sparse Attention for Efficient End-to-End Memory Model Scaling to 100M Tokens',
    presenter: 'Keith; Dio',
    paperUrls: ['https://huggingface.co/papers/2603.23516'],
    lumaUrl: 'https://luma.com/azbqwtsk',
    lumaEventApiId: 'evt-dkxQunCts5flxFt',
    evidence: 'Luma description says Keith and Dio covering.',
    status: 'completed',
  },
  {
    existingId: 4522,
    date: '2026-04-15',
    title: 'Paper Club: Agents of Chaos',
    paperTitle: 'Agents of Chaos',
    presenter: 'Sparsh',
    paperUrls: ['https://arxiv.org/abs/2602.20021'],
    lumaUrl: 'https://luma.com/u5fvjas6',
    lumaEventApiId: 'evt-7JZBUfqvA1ywtrz',
    evidence: 'Luma says Sparsh is covering. Existing DB row was a stale scheduled event.',
    status: 'completed',
  },
  {
    date: '2026-04-22',
    title: 'Paper Club: Self-Distilled RLVR paper',
    paperTitle: 'Self-Distilled RLVR paper',
    presenter: 'Vibhu Sapra',
    paperUrls: ['https://arxiv.org/abs/2604.03128'],
    lumaUrl: 'https://luma.com/smhmwdku',
    lumaEventApiId: 'evt-znRfNcOzV6Tf2kb',
    evidence: 'Luma says Vibhu will present.',
    status: 'completed',
  },
  {
    date: '2026-04-29',
    title: 'Paper Club: DeepSeek V4 Pro/Flash',
    paperTitle: 'DeepSeek V4 Pro/Flash',
    presenter: 'Eugene Cheah / picocreator',
    paperUrls: ['https://api-docs.deepseek.com/news/news260424'],
    lumaUrl: 'https://luma.com/dd32jzvx?tk=pmLiAb',
    lumaEventApiId: 'evt-Hpc0G1jet36StK5',
    evidence: 'Discord Apr 28 announcement says picocreator/Eugene is covering DeepSeek this week; Luma title confirms topic.',
    status: 'scheduled',
  },
];

const recordingFixes = [
  { id: 383, date: '2025-12-24', presenter: 'Frankie Liu', lumaUrl: 'https://luma.com/xqmx4hu1' },
  { id: 375, date: '2025-12-31', presenter: 'Hexie Li', lumaUrl: 'https://luma.com/xi94v1mt' },
  { id: 367, date: '2026-01-07', presenter: 'Vibhu Sapra', lumaUrl: 'https://luma.com/uipiztbk' },
  { id: 343, date: '2026-01-21', presenter: 'Vibhu Sapra', lumaUrl: 'https://luma.com/ukihj47q' },
  { id: 352, date: '2026-01-28', presenter: 'Raphael Kalandadze', lumaUrl: 'https://luma.com/n20lzrxt' },
  { id: 204, date: '2026-02-04', presenter: null, lumaUrl: 'https://luma.com/1glg2z19' },
  { id: 205, date: '2026-02-04', presenter: null, lumaUrl: 'https://luma.com/1glg2z19' },
  { id: 355, date: '2026-02-11', presenter: 'Ted Kyi', lumaUrl: 'https://luma.com/hgw60drj' },
  { id: 4487, date: '2026-02-25', presenter: 'Vibhu Sapra', lumaUrl: 'https://luma.com/8qkhhbam' },
  { id: 4489, date: '2026-03-04', presenter: 'ankitmaloo', lumaUrl: 'https://luma.com/mbamhb61' },
];

const supersededEvents = [
  {
    id: 4297,
    supersededBy: 4298,
    reason: 'The 2026-02-04 weekly Paper Club combined Kimi K2.5 and Alec Radford Data Filtering in one Luma event.',
  },
];

const claimedExistingIds = new Set(sessions.map((session) => session.existingId).filter(Boolean));

function eventDescription(session) {
  const presenter = session.presenter || 'presenter not captured';
  return [
    `Latent Space Paper Club session: ${session.paperTitle}.`,
    `Presenter(s): ${presenter}.`,
    `Evidence: ${session.evidence}`,
  ].join(' ');
}

function eventMetadata(existing, session) {
  return {
    ...existing,
    event_status: session.status,
    event_type: 'paper-club',
    presenter_name: session.presenter || undefined,
    presenter_status: session.presenter ? 'known' : 'unknown',
    paper_title: session.paperTitle,
    paper_url: session.paperUrls[0],
    paper_urls: session.paperUrls,
    luma_url: session.lumaUrl,
    luma_event_api_id: session.lumaEventApiId,
    evidence_note: session.evidence,
    confidence: session.confidence || (session.presenter ? 'high' : 'gap'),
    recording_node_id: session.recordingNodeId || existing.recording_node_id,
    repaired_at: new Date().toISOString(),
    repaired_by: 'scripts/data/repair-paper-club-events-2026.mjs',
  };
}

function recordingMetadata(existing, fix) {
  return {
    ...existing,
    presenter_name: fix.presenter || existing.presenter_name,
    luma_url: fix.lumaUrl,
    date_repaired_at: new Date().toISOString(),
    repaired_by: 'scripts/data/repair-paper-club-events-2026.mjs',
  };
}

async function main() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env.local');
  }

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const now = new Date().toISOString();
  let inserts = 0;
  let updates = 0;

  for (const session of sessions) {
    const existing = session.existingId
      ? await db.execute({ sql: 'SELECT id, metadata FROM nodes WHERE id = ?', args: [session.existingId] })
      : await db.execute({
          sql: `SELECT id, metadata FROM nodes
                WHERE node_type = 'event'
                  AND event_date = ?
                  AND json_extract(metadata, '$.event_type') = 'paper-club'
                  AND COALESCE(json_extract(metadata, '$.event_status'), '') != 'superseded'
                LIMIT 1`,
          args: [session.date],
        });

    let row = existing.rows[0];
    if (!session.existingId && row && claimedExistingIds.has(Number(row.id))) {
      row = null;
    }
    const metadata = eventMetadata(row ? JSON.parse(row.metadata || '{}') : {}, session);

    if (row) {
      console.log(`UPDATE event #${row.id}: ${session.date} ${session.title}`);
      if (apply) {
        await db.execute({
          sql: `UPDATE nodes
                SET title = ?, description = ?, link = ?, event_date = ?, metadata = ?, updated_at = ?
                WHERE id = ?`,
          args: [
            session.title,
            eventDescription(session),
            session.lumaUrl,
            session.date,
            JSON.stringify(metadata),
            now,
            row.id,
          ],
        });
      }
      updates += 1;
    } else {
      console.log(`INSERT event: ${session.date} ${session.title}`);
      if (apply) {
        const result = await db.execute({
          sql: `INSERT INTO nodes (title, description, link, node_type, event_date, metadata, created_at, updated_at)
                VALUES (?, ?, ?, 'event', ?, ?, ?, ?)`,
          args: [
            session.title,
            eventDescription(session),
            session.lumaUrl,
            session.date,
            JSON.stringify(metadata),
            now,
            now,
          ],
        });
        const nodeId = Number(result.lastInsertRowid);
        await db.execute({ sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, 'event')`, args: [nodeId] });
        await db.execute({ sql: `INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, 'paper-club')`, args: [nodeId] });
      }
      inserts += 1;
    }
  }

  for (const fix of recordingFixes) {
    const result = await db.execute({ sql: 'SELECT id, metadata FROM nodes WHERE id = ?', args: [fix.id] });
    const row = result.rows[0];
    if (!row) {
      console.log(`SKIP missing recording #${fix.id}`);
      continue;
    }
    const metadata = recordingMetadata(JSON.parse(row.metadata || '{}'), fix);
    console.log(`UPDATE recording #${fix.id}: event_date=${fix.date}`);
    if (apply) {
      await db.execute({
        sql: `UPDATE nodes SET event_date = ?, metadata = ?, updated_at = ? WHERE id = ?`,
        args: [fix.date, JSON.stringify(metadata), now, fix.id],
      });
    }
    updates += 1;
  }

  for (const duplicate of supersededEvents) {
    const result = await db.execute({ sql: 'SELECT id, title, metadata FROM nodes WHERE id = ?', args: [duplicate.id] });
    const row = result.rows[0];
    if (!row) {
      console.log(`SKIP missing superseded event #${duplicate.id}`);
      continue;
    }
    const metadata = {
      ...JSON.parse(row.metadata || '{}'),
      event_status: 'superseded',
      event_type: 'paper-club-superseded',
      superseded_by_event_node_id: duplicate.supersededBy,
      superseded_reason: duplicate.reason,
      repaired_at: now,
      repaired_by: 'scripts/data/repair-paper-club-events-2026.mjs',
    };
    console.log(`SUPERSEDE event #${duplicate.id}: ${row.title}`);
    if (apply) {
      await db.execute({
        sql: 'UPDATE nodes SET metadata = ?, updated_at = ? WHERE id = ?',
        args: [JSON.stringify(metadata), now, duplicate.id],
      });
    }
    updates += 1;
  }

  console.log(`\n${apply ? 'Applied' : 'Dry run'}: ${updates} updates, ${inserts} inserts.`);
  if (!apply) {
    console.log('Run with --apply to write changes.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
