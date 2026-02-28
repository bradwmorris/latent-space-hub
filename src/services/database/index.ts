// Service instances
export { nodeService, NodeService } from './nodes';
export { chunkService, ChunkService } from './chunks';
export { edgeService, EdgeService } from './edges';
export { dimensionService, DimensionService } from './dimensionService';
export { searchService, SearchService } from './search';
// export { HelperService } from './helpers'; // Removed - migrated to JSON-based service

// Types
export * from '@/types/database';

// Health check utility
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  vectorExtension: boolean;
  tablesExist: boolean;
  error?: string;
}> {
  try {
    return checkSQLiteDatabaseHealth();
  } catch (error) {
    return {
      connected: false,
      vectorExtension: false,
      tablesExist: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function checkSQLiteDatabaseHealth(): Promise<{
  connected: boolean;
  vectorExtension: boolean;
  tablesExist: boolean;
  error?: string;
  debugUrl?: string;
}> {
  try {
    const { getSQLiteClient } = await import('./sqlite-client');

    // Debug: log before getting client
    console.log('Getting SQLite client...');
    console.log('TURSO_DATABASE_URL:', process.env.TURSO_DATABASE_URL);

    const sqlite = getSQLiteClient();
    console.log('Got SQLite client, testing connection...');

    const connected = await sqlite.testConnection();
    console.log('Connection result:', connected);

    if (!connected) {
      return {
        connected: false,
        vectorExtension: false,
        tablesExist: false,
        error: 'SQLite connection failed',
        debugUrl: process.env.TURSO_DATABASE_URL?.substring(0, 50)
      };
    }

    const vectorExtension = await sqlite.checkVectorExtension();

    // Check if main tables exist
    const tables = await sqlite.checkTables();
    const requiredTables = ['nodes', 'chunks', 'edges'];
    const tablesExist = requiredTables.every(table => tables.includes(table));

    return {
      connected,
      vectorExtension,
      tablesExist
    };
  } catch (error) {
    console.error('Health check error:', error);
    return {
      connected: false,
      vectorExtension: false,
      tablesExist: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error',
      debugUrl: process.env.TURSO_DATABASE_URL?.substring(0, 50)
    };
  }
}
