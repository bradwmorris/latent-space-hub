import { tool } from 'ai';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// Get database path (same logic as sqlite-client.ts)
function getDatabasePath(): string {
  return process.env.SQLITE_DB_PATH || path.join(
    process.env.HOME || '~',
    'Library/Application Support/LatentSpaceHub/db/ls-hub.sqlite'
  );
}

// Security: Only allow SELECT statements
function isReadOnlyQuery(sql: string): boolean {
  const normalized = sql.trim().toLowerCase();

  // Must start with SELECT, WITH (for CTEs), or PRAGMA (for schema inspection)
  const allowedPrefixes = ['select', 'with', 'pragma'];
  const startsWithAllowed = allowedPrefixes.some(prefix =>
    normalized.startsWith(prefix)
  );

  if (!startsWithAllowed) return false;

  // Block dangerous patterns even in subqueries
  const dangerousPatterns = [
    /\binsert\b/i,
    /\bupdate\b/i,
    /\bdelete\b/i,
    /\bdrop\b/i,
    /\bcreate\b/i,
    /\balter\b/i,
    /\battach\b/i,
    /\bdetach\b/i,
    /\breindex\b/i,
    /\bvacuum\b/i,
    /\banalyze\b/i,
  ];

  return !dangerousPatterns.some(pattern => pattern.test(sql));
}

export const sqliteQueryTool = tool({
  description: 'Execute read-only SQL queries (SELECT/WITH/PRAGMA). Tables: nodes, edges, dimensions, chunks. Use PRAGMA table_info(tablename) for schema.',

  inputSchema: z.object({
    sql: z.string().describe('The SQL query to execute. Must be a SELECT, WITH, or PRAGMA statement.'),
    format: z.enum(['table', 'json', 'csv']).default('table').describe('Output format: table (default), json, or csv'),
  }),

  execute: async ({ sql, format = 'table' }) => {
    console.log('🔍 SQLite Query tool called:', sql.substring(0, 100));

    // Security check
    if (!isReadOnlyQuery(sql)) {
      return {
        success: false,
        error: 'Only SELECT, WITH, and PRAGMA statements are allowed. Write operations must use dedicated tools (createNode, updateNode, etc.).',
        data: null,
      };
    }

    const dbPath = getDatabasePath();

    // Build sqlite3 command with appropriate output mode
    let modeFlag = '';
    switch (format) {
      case 'json':
        modeFlag = '-json';
        break;
      case 'csv':
        modeFlag = '-csv -header';
        break;
      case 'table':
      default:
        modeFlag = '-header -column';
        break;
    }

    // Escape the SQL for shell (replace single quotes)
    const escapedSql = sql.replace(/'/g, "'\"'\"'");
    const command = `sqlite3 ${modeFlag} "${dbPath}" '${escapedSql}'`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 5000, // 5 second timeout
        maxBuffer: 1024 * 1024, // 1MB max output
      });

      if (stderr && !stdout) {
        return {
          success: false,
          error: stderr,
          data: null,
        };
      }

      // Parse JSON output if requested
      let data: any = stdout.trim();
      if (format === 'json' && data) {
        try {
          data = JSON.parse(data);
        } catch {
          // Keep as string if parse fails
        }
      }

      // Count rows for message
      let rowCount = 0;
      if (format === 'json' && Array.isArray(data)) {
        rowCount = data.length;
      } else if (typeof data === 'string') {
        // Count non-empty lines minus header
        const lines = data.split('\n').filter(line => line.trim());
        rowCount = Math.max(0, lines.length - 1); // Subtract header row
      }

      return {
        success: true,
        data,
        message: `Query returned ${rowCount} row${rowCount !== 1 ? 's' : ''}.`,
      };

    } catch (error: any) {
      // Handle timeout
      if (error.killed) {
        return {
          success: false,
          error: 'Query timed out after 5 seconds. Try a simpler query or add LIMIT.',
          data: null,
        };
      }

      return {
        success: false,
        error: error.message || 'Query execution failed',
        data: null,
      };
    }
  },
});
