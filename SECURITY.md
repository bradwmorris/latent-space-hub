# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately:

1. **Do NOT open a public issue**
2. Use GitHub Security Advisories on this repository (private report)
3. Include: description, steps to reproduce, potential impact

We will respond within 48 hours and work with you on a fix.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Security Considerations

### API Keys
- API keys are stored locally in your browser's localStorage
- Keys are never sent to any server except the respective AI provider (OpenAI, Anthropic)
- Clear your browser data to remove stored keys

### Database
- Data is stored in your configured Turso database (`TURSO_DATABASE_URL`)
- No data is sent to external servers except configured providers (Turso + AI APIs)
- Back up/export your Turso database regularly

### MCP Server
- The MCP server binds only to `127.0.0.1` (localhost)
- Do not expose it to external networks
- Only connect trusted AI assistants
