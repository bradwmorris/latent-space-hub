# Agent Context — Latent Space Hub

Universal context for any AI agent working on this repo.

## What This Is

Knowledge base for the Latent Space community (podcasts, articles, AI news, conference talks, papers). Built on the RA-H foundation, deployed as its own product on Vercel.

## Architecture

- **Framework:** Next.js 15 App Router + TypeScript + Tailwind CSS
- **Database:** Turso (cloud SQLite via `@libsql/client`)
- **Vector search:** Turso native F32_BLOB + vector_top_k (being wired up)
- **AI models:** Anthropic (Claude) + OpenAI (GPT) via Vercel AI SDK
- **MCP server:** `apps/mcp-server/` — tools prefixed `ls_*`
- **Deployment:** Vercel (readonly mode for public access)

## Database

Turso cloud SQLite. NOT a local file. NOT better-sqlite3.

- URL: `latentspace-bradwmorris.aws-us-east-2.turso.io`
- Client: `@libsql/client`
- Core tables: `nodes`, `edges`, `chunks`, `dimensions`, `node_dimensions`

## Key Patterns

- **Service layer:** All DB operations go through `src/services/database/`
- **API routes:** Next.js App Router in `app/api/`
- **Tools:** MCP tools in `src/tools/`, registered in MCP server
- **Prompts:** Agent system prompts in `src/config/prompts/`
- **Guides:** Built-in guides in `src/config/guides/`

## Testing

```bash
npm run type-check    # TypeScript validation (must pass)
npm run build         # Full build check
npm run dev           # Local dev server
```

## Learnings

- Turso supports native vector search — don't add false "not supported" comments
- Model names must be real (gpt-4o-mini, not gpt-5-mini)
- Always work on feature branches, never main
- PRDs are the spec — follow them precisely
