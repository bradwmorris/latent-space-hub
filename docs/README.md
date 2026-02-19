# Latent Space Hub — Documentation

## Quick Links

| Doc | Description |
|-----|-------------|
| [Overview](./0_overview.md) | What is Latent Space Hub, design philosophy |
| [Schema](./2_schema.md) | Database schema, node/edge structure |
| [Tools & Workflows](./4_tools-and-workflows.md) | MCP tools, workflow system |
| [Logging & Evals](./5_logging-and-evals.md) | Debugging, evaluation framework |
| [UI](./6_ui.md) | 2-panel layout, components, views |
| [MCP](./8_mcp.md) | Connect Claude Code and external agents |
| [About](./9_open-source.md) | Origin, contributing |
| [Troubleshooting](./TROUBLESHOOTING.md) | Common issues and fixes |

## Getting Started

```bash
git clone https://github.com/bradwmorris/latent-space-hub.git
cd latent-space-hub
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

## MCP Integration

Add to your Claude Code config:

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

See [MCP docs](./8_mcp.md) for full setup.

## Questions?

Open an issue on [GitHub](https://github.com/bradwmorris/latent-space-hub).
