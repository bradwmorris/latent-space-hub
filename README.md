# Latent Space Hub

LS Wiki-Base for the [Latent Space](https://www.latent.space/) community. Podcasts, articles, AI news, conference talks, papers — searchable via semantic vector search and connected in a wiki-base.

Built on the [RA-H](https://github.com/bradwmorris/ra-h_os) foundation, deployed as its own product.

## Tech Stack

- **Framework:** Next.js 15 + TypeScript + Tailwind CSS
- **Database:** [Turso](https://turso.tech/) (cloud SQLite via `@libsql/client`)
- **Search:** Turso native vector search (F32_BLOB + vector_top_k) + FTS5
- **AI:** Anthropic (Claude) + OpenAI (GPT) models via Vercel AI SDK — BYO keys
- **MCP:** Model Context Protocol server for AI agent access
- **Deployment:** Vercel (readonly mode for public)

## Local Development

```bash
git clone https://github.com/bradwmorris/latent-space-hub.git
cd latent-space-hub
cp .env.example .env.local    # Add your Turso + API keys
npm install
npm run dev                    # localhost:3000
```

### Required Environment Variables

```
TURSO_DATABASE_URL=            # Your Turso database URL
TURSO_AUTH_TOKEN=              # Turso auth token
ANTHROPIC_API_KEY=             # For Claude models
OPENAI_API_KEY=                # For GPT models + embeddings
```

## Project Layout

```
app/                    Next.js App Router (pages + API routes)
src/
  components/           UI components (2-panel layout)
  services/
    database/           Turso client, node/edge/chunk services
    agents/             Agent logic
    embedding/          Embedding generation
    extractors/         YouTube, website, PDF extraction
  tools/                MCP tools + database CRUD tools
  config/
    prompts/            Agent system prompts
    guides/             Built-in markdown guides
apps/
  mcp-server/           MCP server (HTTP + stdio)
docs/                   System documentation
docs/development/       Dev workflow, backlog, PRDs
```

## Agent Entrypoint

For agent context and ordered skill loading, start at [AGENTS.md](./AGENTS.md).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server at localhost:3000 |
| `npm run build` | Production build |
| `npm run type-check` | TypeScript validation |

## MCP Integration

Connect Claude Code or any MCP-compatible assistant:

```json
{
  "mcpServers": {
    "latent-space": {
      "command": "node",
      "args": ["/path/to/latent-space-hub/apps/mcp-server/stdio-server.js"]
    }
  }
}
```

## Want to Self-Host Your Own?

This repo is the Latent Space community wiki-base. If you want to run your own local-first wiki-base with a private SQLite database, use the open-source version: [RA-H Open Source](https://github.com/bradwmorris/ra-h_os).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs welcome.

## License

[MIT](LICENSE)
