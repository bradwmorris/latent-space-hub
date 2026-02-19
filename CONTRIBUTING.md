# Contributing

Latent Space Hub is a community knowledge base built on the RA-H foundation.

## What We Accept

- **Bug fixes** — especially ones you've encountered
- **Doc improvements** — typos, clarifications, examples
- **Small enhancements** — that don't require architectural changes

For larger features, open an issue first.

## Setup

```bash
git clone https://github.com/bradwmorris/latent-space-hub.git
cd latent-space-hub
cp .env.example .env.local    # Add Turso + API keys
npm install
npm run dev
```

## Before Submitting a PR

```bash
npm run build
npm run type-check
npm run lint
```

All three must pass.

## Code Style

- TypeScript with strict types (avoid `any`)
- Functional React components
- Tailwind CSS for styling
- Database operations through service layer (`/src/services/database/`)

## License

By contributing, you agree your work is licensed under [MIT](LICENSE).
