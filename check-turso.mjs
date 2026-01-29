import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL || 'libsql://latentspace-bradwmorris.aws-us-east-2.turso.io';
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!authToken) {
  console.error('TURSO_AUTH_TOKEN not set. Please export it first.');
  console.error('Run: export TURSO_AUTH_TOKEN="your-token-here"');
  process.exit(1);
}

const client = createClient({ url, authToken });

async function checkDb() {
  try {
    // List all tables
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('Tables found:', tables.rows.length);
    console.log('---');
    for (const row of tables.rows) {
      console.log(' -', row.name);
    }
    
    // Check node count if nodes table exists
    if (tables.rows.some(r => r.name === 'nodes')) {
      const nodeCount = await client.execute('SELECT COUNT(*) as count FROM nodes');
      console.log('\nNodes count:', nodeCount.rows[0].count);
    }
    
    // Check dimensions
    if (tables.rows.some(r => r.name === 'dimensions')) {
      const dimCount = await client.execute('SELECT COUNT(*) as count FROM dimensions');
      console.log('Dimensions count:', dimCount.rows[0].count);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkDb();
