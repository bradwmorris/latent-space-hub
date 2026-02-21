# Troubleshooting

## Installation

### `npm install` fails

Ensure Node.js 18+ is installed:
```bash
node --version   # Should be 18+
```

### TypeScript errors after install

```bash
npm run type-check
```

If this fails on a clean checkout, check that you're on the correct branch and have pulled latest.

## Runtime

### App won't start (`npm run dev`)

1. Check `.env.local` exists — copy from `.env.example` if missing
2. Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set
3. Check the Turso URL format: `libsql://latentspace-bradwmorris.aws-us-east-2.turso.io`

### Vector search returns no results

1. Ensure chunks have embeddings — not all nodes may be embedded yet
2. Verify `OPENAI_API_KEY` is set (used for embedding generation)
3. Check vector index exists: the `chunks` table needs `libsql_vector_idx` on the `embedding` column

### API key validation fails

Key format:
- OpenAI: starts with `sk-`
- Anthropic: starts with `sk-ant-`

Verify the key has correct permissions and credits in the provider dashboard.

## Database (Turso)

### "Failed to initialize Turso client"

```bash
# Verify env vars are set
echo $TURSO_DATABASE_URL
echo $TURSO_AUTH_TOKEN
```

Common causes:
- Missing or malformed `TURSO_DATABASE_URL` — must start with `libsql://`
- Expired auth token — regenerate in the Turso dashboard
- Network issue — Turso is cloud-hosted, requires internet

### "no such table" errors

Run the schema setup script against your Turso database. Tables are defined in `setup-schema.mjs`.

### Auth token expired

Turso tokens expire. Generate a new one:
```bash
turso db tokens create latentspace
```

Update `TURSO_AUTH_TOKEN` in `.env.local` and any deployed environments.

## MCP Server

### "Connection refused" (stdio)

1. Make sure the hub is running: `npm run dev`
2. Verify the path in your MCP config points to the correct `stdio-server.js`
3. Test directly: `node apps/mcp-server/stdio-server.js`

### "Connection refused" (HTTP)

1. Check port 44145 isn't blocked: `lsof -i :44145`
2. Start the server: `node apps/mcp-server/server.js`

### "Connection refused" (NPX standalone)

1. Verify env vars: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
2. Test: `npx latent-space-hub-mcp` — should start without errors
3. Check `~/.latent-space-hub/config.json` if using config file

### Tools not showing in assistant

1. Restart your AI assistant after configuring MCP
2. Verify the config format matches your assistant's requirements
3. Check for error output in the terminal where the MCP server runs

### Write tools not available

Write tools are disabled by default. Set `MCP_ALLOW_WRITES=true` in your environment.

## Embedding / Ingestion

### Embeddings not generating

1. Verify `OPENAI_API_KEY` is set and valid
2. Check the auto-embed queue isn't stuck — look for errors in the server console
3. Nodes need content (chunk text or notes) to generate embeddings

### Entity extraction failing

1. Verify `ANTHROPIC_API_KEY` is set and valid
2. Check the server console for specific error messages
3. Entity extraction uses Claude — ensure the key has sufficient credits

### Ingestion script fails

```bash
# Check environment
echo $TURSO_DATABASE_URL
echo $TURSO_AUTH_TOKEN
echo $OPENAI_API_KEY

# Run with dry-run first
npx tsx scripts/ingest.ts --dry-run
```

## Discord Bots

### Bots not responding

1. Check bot process is running on Railway
2. Verify `DISCORD_TOKEN` is valid
3. Check Turso connection — bots need `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
4. Check `OPENROUTER_API_KEY` for LLM access

### Bots responding with errors

1. Check Railway logs for specific error messages
2. Verify Turso is accessible from Railway's network
3. Check OpenRouter API status and credits

## Build

### `npm run type-check` fails

This must pass before committing. Common fixes:
1. Check for missing imports
2. Verify interface changes are reflected in all consumers
3. Run `npm run build` for more detailed error output

### `npm run build` fails

1. Type errors — fix with `npm run type-check` first
2. Missing environment variables — some are needed at build time
3. Import errors — check for circular dependencies
