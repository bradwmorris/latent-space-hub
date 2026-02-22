/**
 * Fix common host name typos across nodes/chunks text fields.
 *
 * Usage:
 *   npx tsx scripts/output/fix-host-name-typos.ts --dry-run
 *   npx tsx scripts/output/fix-host-name-typos.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient, type Client, type InStatement } from '@libsql/client';

type Row = Record<string, unknown>;

const RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bswixs\b/gi, replacement: 'swyx' },
  { pattern: /\bswix\b/gi, replacement: 'swyx' },
  { pattern: /\bswitz\b/gi, replacement: 'swyx' },
  { pattern: /\balesio\b/gi, replacement: 'Alessio' },
  { pattern: /\ballesio\b/gi, replacement: 'Alessio' },
  { pattern: /\ballesop\b/gi, replacement: 'Alessio' },
];

const LIKE_FILTER = `
  lower(%s) LIKE '%swix%' OR
  lower(%s) LIKE '%switz%' OR
  lower(%s) LIKE '%alesio%' OR
  lower(%s) LIKE '%allesio%' OR
  lower(%s) LIKE '%allesop%'
`;

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

async function query(sql: string, args: unknown[] = []) {
  const result = await db().execute({ sql, args });
  const rows = result.rows.map((r) => {
    const obj: Row = {};
    for (let i = 0; i < result.columns.length; i += 1) obj[result.columns[i]] = r[i];
    return obj;
  });
  return { rows, columns: result.columns, rowsAffected: result.rowsAffected ?? 0 };
}

function applyRules(input: string): string {
  let out = input;
  for (const { pattern, replacement } of RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

async function updateTableField(
  table: 'nodes' | 'chunks',
  idField: 'id',
  textField: string,
  dryRun: boolean
): Promise<{ scanned: number; changed: number }> {
  const filter = LIKE_FILTER.replaceAll('%s', textField);
  const { rows } = await query(
    `SELECT ${idField} as id, ${textField} as text_value
     FROM ${table}
     WHERE ${textField} IS NOT NULL AND (${filter})`
  );

  let changed = 0;
  const statements: InStatement[] = [];

  for (const row of rows) {
    const id = Number(row.id);
    const text = String(row.text_value ?? '');
    const cleaned = applyRules(text);
    if (cleaned !== text) {
      changed += 1;
      if (!dryRun) {
        statements.push({
          sql: `UPDATE ${table} SET ${textField} = ? WHERE ${idField} = ?`,
          args: [cleaned, id],
        });
      }
    }
  }

  if (!dryRun && statements.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      await db().batch(batch, 'write');
    }
  }

  return { scanned: rows.length, changed };
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  const { rows } = await query(`PRAGMA table_info(${table})`);
  return rows.some((r) => String(r.name) === column);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('\n== Fix Host Name Typos ==\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'WRITE'}`);

  const nodeFields = ['title', 'description', 'notes', 'chunk'];
  const chunkFields = ['text'];

  const nodeResults: Array<{ field: string; scanned: number; changed: number }> = [];
  for (const field of nodeFields) {
    if (!(await hasColumn('nodes', field))) continue;
    const result = await updateTableField('nodes', 'id', field, dryRun);
    nodeResults.push({ field, ...result });
  }

  const chunkResults: Array<{ field: string; scanned: number; changed: number }> = [];
  for (const field of chunkFields) {
    if (!(await hasColumn('chunks', field))) continue;
    const result = await updateTableField('chunks', 'id', field, dryRun);
    chunkResults.push({ field, ...result });
  }

  console.log('\nNodes:');
  for (const r of nodeResults) {
    console.log(`  ${r.field}: scanned=${r.scanned}, changed=${r.changed}`);
  }

  console.log('\nChunks:');
  for (const r of chunkResults) {
    console.log(`  ${r.field}: scanned=${r.scanned}, changed=${r.changed}`);
  }

  const totalChanges = [...nodeResults, ...chunkResults].reduce((sum, r) => sum + r.changed, 0);
  console.log(`\nTotal changed rows: ${totalChanges}`);
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(() => {
    if (_client) _client.close();
  });

