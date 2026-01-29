/**
 * Evals Runner for Latent Space Hub (Turso fork)
 *
 * ⚠️ DISABLED: This test runner requires local SQLite with better-sqlite3.
 * Turso uses @libsql/client which has a different API.
 *
 * For running evals in Turso deployments:
 * - Use API-based testing instead of local database inspection
 * - Consider external test frameworks (Jest, Playwright)
 * - Use Turso-compatible test setup
 */

console.error('ERROR: Evals runner is not supported in Turso fork.');
console.error('This test runner requires local SQLite with better-sqlite3.');
console.error('Turso uses @libsql/client which has a different API.');
console.error('');
console.error('For testing in Turso deployments:');
console.error('  - Use API-based integration tests');
console.error('  - Consider Jest/Playwright for end-to-end testing');
console.error('  - Set up a Turso-compatible test database');

process.exit(1);
