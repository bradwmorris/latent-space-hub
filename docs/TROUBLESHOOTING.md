# Troubleshooting

## Installation Issues

### `npm install` fails

**Symptom:** Error during module installation

**Fix:** Ensure Node.js 18+ is installed:
```bash
node --version   # Should be 18+
```

## Runtime Issues

### App won't start

**Symptom:** Error on `npm run dev`

**Fixes:**
1. Check `.env.local` exists (copy from `.env.example` if missing)
2. Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set
3. Verify API keys are present (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)

### Vector search returns no results

**Symptom:** Semantic search doesn't find matches

**Fixes:**
1. Ensure embeddings have been generated for chunks
2. Check that `OPENAI_API_KEY` is set (used for embedding generation)
3. Vector search via Turso native `vector_top_k()` requires chunks to have embeddings stored

### API key validation fails

**Symptom:** "Invalid key" error in Settings

**Fixes:**
1. Verify key format:
   - OpenAI: starts with `sk-`
   - Anthropic: starts with `sk-ant-`
2. Check key has correct permissions/credits
3. Try regenerating the key in provider dashboard

### Chat returns errors

**Symptom:** Error messages when chatting

**Fixes:**
1. Check API keys are valid (Settings)
2. Verify internet connection
3. Check browser console for specific error messages

## Database Issues

### Connection fails

**Symptom:** "Failed to initialize Turso client" errors

**Fix:** Verify your Turso credentials:
```bash
# Check env vars are set
echo $TURSO_DATABASE_URL
echo $TURSO_AUTH_TOKEN
```

### Missing tables

**Symptom:** "no such table" errors

**Fix:** Run the schema setup script against your Turso database.

## Self-Hosting (RA-H Open Source)

For issues specific to the local SQLite version (better-sqlite3, sqlite-vec):
- See [RA-H Open Source](https://github.com/bradwmorris/ra-h_os) for platform-specific setup
