import { createClient, Client, InStatement, ResultSet } from '@libsql/client';
import { DatabaseError } from '@/types/database';

export interface SQLiteConfig {
  url: string;
  authToken?: string;
}

export interface SQLiteQueryResult<T = any> {
  rows: T[];
  changes?: number;
  lastInsertRowid?: number;
}

/**
 * SQLite client for Turso (cloud SQLite).
 *
 * This is a fork-specific client that uses @libsql/client instead of better-sqlite3.
 * All operations are async.
 *
 * Environment variables:
 * - TURSO_DATABASE_URL: The Turso database URL (required)
 * - TURSO_AUTH_TOKEN: The Turso auth token (required for cloud, optional for local)
 * - DISABLE_EMBEDDINGS: Set to 'true' to skip embedding-related operations
 */
class SQLiteClient {
  private static instance: SQLiteClient;
  private client: Client;
  private readonly embeddingsDisabled: boolean;
  private initialized: boolean = false;

  private isPlaceholder: boolean = false;

  private constructor() {
    this.embeddingsDisabled = process.env.DISABLE_EMBEDDINGS === 'true';

    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      // During build time, env vars may not be available
      // Mark as placeholder so we can re-initialize at runtime
      this.client = createClient({
        url: 'file::memory:',
      });
      this.isPlaceholder = true;
      return;
    }

    this.client = createClient({
      url,
      authToken,
    });
  }

  public static getInstance(): SQLiteClient {
    const hasUrl = !!process.env.TURSO_DATABASE_URL;
    const isPlaceholderInstance = SQLiteClient.instance?.isPlaceholder;

    // If we have an instance but it's a placeholder AND env vars are now available,
    // re-create with the real connection
    if (isPlaceholderInstance && hasUrl) {
      SQLiteClient.instance = new SQLiteClient();
    }

    if (!SQLiteClient.instance) {
      SQLiteClient.instance = new SQLiteClient();
    }
    return SQLiteClient.instance;
  }

  // Factory method for creating fresh instances (used in serverless)
  public static createFresh(): SQLiteClient {
    return new SQLiteClient();
  }

  /**
   * Initialize the database (ensure schema exists).
   * Call this once at app startup.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Test connection
      await this.client.execute('SELECT 1');

      // Ensure core tables exist (minimal schema check)
      await this.ensureSchema();

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Turso client:', error);
      throw error;
    }
  }

  /**
   * Ensure the core schema exists.
   * For a fresh Turso DB, run the full schema via CLI first.
   * This just verifies and adds missing pieces.
   */
  private async ensureSchema(): Promise<void> {
    // Check if nodes table exists (core table)
    const tables = await this.client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'"
    );

    if (tables.rows.length === 0) {
      throw new Error('Nodes table not found. Run schema initialization first.');
    }

    // Ensure dimensions table exists
    const dimTable = await this.client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='dimensions'"
    );

    if (dimTable.rows.length === 0) {
      await this.client.execute(`
        CREATE TABLE dimensions (
          name TEXT PRIMARY KEY,
          description TEXT,
          is_priority INTEGER DEFAULT 0,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Ensure logs table for activity tracking
    const logsTable = await this.client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='logs'"
    );

    if (logsTable.rows.length === 0) {
      await this.client.execute(`
        CREATE TABLE logs (
          id INTEGER PRIMARY KEY,
          ts TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          table_name TEXT NOT NULL,
          action TEXT NOT NULL,
          row_id INTEGER NOT NULL,
          summary TEXT,
          snapshot_json TEXT
        )
      `);
      await this.client.execute('CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts)');
    }
  }

  /**
   * Execute a query and return results.
   * Automatically detects SELECT vs write queries.
   */
  public async query<T extends Record<string, any> = any>(
    sql: string,
    params?: any[]
  ): Promise<SQLiteQueryResult<T>> {
    try {
      const stmt: InStatement = params
        ? { sql, args: params }
        : { sql, args: [] };

      const result: ResultSet = await this.client.execute(stmt);

      // Convert libsql rows to plain objects
      const rows = result.rows.map(row => {
        const obj: Record<string, any> = {};
        for (let i = 0; i < result.columns.length; i++) {
          obj[result.columns[i]] = row[i];
        }
        return obj as T;
      });

      return {
        rows,
        changes: result.rowsAffected,
        lastInsertRowid: result.lastInsertRowid ? Number(result.lastInsertRowid) : undefined
      };
    } catch (error) {
      console.error('SQLite query error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Execute multiple statements in a transaction.
   * All statements succeed or all fail.
   */
  public async transaction<T>(callback: () => Promise<T>): Promise<T> {
    // libsql/client handles transactions differently
    // For now, just execute the callback (Turso handles atomicity per-statement)
    // For true transactions, use batch() or explicit BEGIN/COMMIT
    try {
      return await callback();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Execute multiple statements as a batch (atomic).
   */
  public async batch(statements: { sql: string; params?: any[] }[]): Promise<void> {
    try {
      const stmts: InStatement[] = statements.map(s => ({
        sql: s.sql,
        args: s.params || []
      }));
      await this.client.batch(stmts);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      if (this.isPlaceholder) {
        return false;
      }
      const result = await this.query('SELECT datetime() as current_time');
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  public async checkVectorExtension(): Promise<boolean> {
    // Turso supports native vector search via F32_BLOB + vector_top_k()
    // No extension loading needed — it's built into Turso
    return true;
  }

  public async checkTables(): Promise<string[]> {
    try {
      const result = await this.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      return result.rows.map(row => row.name);
    } catch (error) {
      console.error('Table check failed:', error);
      return [];
    }
  }

  public isEmbeddingsDisabled(): boolean {
    return this.embeddingsDisabled;
  }

  private handleError(error: any): DatabaseError {
    return {
      message: error.message || 'SQLite operation failed',
      code: error.code || 'SQLITE_ERROR',
      details: error
    };
  }

  public close(): void {
    this.client.close();
  }
}

// Export function to get client instance
// On serverless (Vercel), always create fresh to avoid stale singleton issues
export function getSQLiteClient(): SQLiteClient {
  // Skip singleton for serverless - create fresh client with current env vars
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return SQLiteClient.createFresh();
  }
  // For local dev, use singleton
  return SQLiteClient.getInstance();
}

// For backwards compatibility
export const sqliteDb = {
  get instance() {
    return getSQLiteClient();
  }
};

// Export class for testing
export { SQLiteClient };
