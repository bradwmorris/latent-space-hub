# PRD: LS Wiki-Base Rebrand

**Status:** In Progress | **Created:** 2026-03-08 | **Updated:** 2026-03-09

## 1. Background

Rebrand from "knowledge graph" / "context graph" to **LS Wiki-Base** — a combination of `.md` documentation and SQLite database that forms a living, breathing reference system. The documentation should not be a separate artifact from the product — it should be deeply integrated with the code and the database, always current, and incredibly legible.

## 2. Plan

1. **Terminology sweep (bounded)** — Replace product-language references to "knowledge graph" / "context graph" with "wiki-base" or "LS Wiki-Base" in explicitly in-scope files only
2. **Documentation unification** — Keep `src/config/docs/` as source of truth and align dev docs (`docs/development/`) to it
3. **Documentation overhaul** — Rewrite docs for clarity, accuracy, and legibility; remove stale/duplicate content
4. **Legibility pass** — Apply consistent formatting, hierarchy, links, and freshness markers

### Out of Scope for PRD-35 (defer)

- Code annotation conventions (for example `@docs` tags in source)
- New scripts, CI checks, or pre-commit hooks for docs enforcement
- Schema auto-generation tooling

## 3. Implementation Details

### Step 1: Terminology Sweep

**Goal:** Zero legacy product-language references in in-scope files.

**In scope (this PRD):**
- `src/config/docs/*.md` — all 6 user-facing docs (source of truth)
- `docs/README.md` — documentation index
- `CLAUDE.md` — project instructions
- `README.md` (root)
- `apps/mcp-server-standalone/README.md` and package metadata
- `src/config/prompts/` — agent system prompts
- `src/config/skills/` — skill definitions
- Active PRDs in `docs/development/` (exclude `docs/development/completed-prds/`)
- `package.json` description fields when user-facing

**Out of scope (leave unchanged):**
- `docs/archive/` and other historical/archive content
- `docs/development/completed-prds/` historical records
- Database schema/table/column names
- Vendor/third-party code and lockfiles

**Replacement rules:**
| Old term | New term | Context |
|----------|----------|---------|
| knowledge graph | wiki-base | General references |
| Knowledge Graph | Wiki-Base | Title case |
| the graph | the wiki-base | When referring to the system as a whole |
| LS knowledge base | LS Wiki-Base | Branded references |
| context graph | wiki-base | If found anywhere |

**Style guide (final):**
- Branded name: `LS Wiki-Base`
- Generic running text: `wiki-base`
- Do not use `Wiki-base` or `wiki base`

**Keep as-is:**
- "graph" when referring to the technical graph structure (nodes + edges) — that's still accurate
- Database table/column names — no schema migration needed
- Edge/node terminology — those are correct graph terms

### Step 2: Documentation Consolidation ✅ COMPLETED

**Goal:** Single source of truth for all documentation. No duplicate content across locations.

**Problem discovered:** Three overlapping documentation locations existed:
1. `docs/` — 13 markdown files in the repo root (zero programmatic consumers)
2. `src/config/docs/` — 6 markdown files (the actual source of truth, read by `docsService.ts` and rendered at `/docs` in the web app)
3. `app/docs/` — 6 Next.js page files (plumbing that connects docsService to URLs, not content)

Six files were duplicated between `docs/` and `src/config/docs/` (overview, database, ingestion, interfaces, slop-bot, evals). The config versions were consistently better — they had frontmatter, images, and cleaner formatting.

**What was done:**

1. **Made `src/config/docs/` the single source of truth.** These 6 files are what `docsService.ts` reads and renders at `/docs` in the web app:
   ```
   src/config/docs/
     overview.md      ← system overview, indexing pipeline, architecture, tech stack
     ingestion.md     ← content sources, cron, pipeline, search indexing, extractors
     database.md      ← schema, categories, edge context model, metadata examples, queries
     interfaces.md    ← web app, MCP server (18 tools), Discord bot, webhook
     slop-bot.md      ← bot internals, slash commands, member system, skills, traces
     evals.md         ← trace logging, dashboard, metadata JSON, SQL queries
   ```

2. **Migrated important content from `docs/` into config docs before deletion:**
   - `overview.md` ← added indexing pipeline summary (steps 1-7)
   - `database.md` ← added EdgeContext TypeScript interface, metadata JSON examples by category, 4 example SQL queries
   - `ingestion.md` ← added extractors technology table, expanded search indexing with RRF formula/fallback chain/chunking details (from `search.md`)
   - `interfaces.md` ← added HTTP transport MCP setup option
   - `evals.md` ← added full metadata JSON example, 3 SQL query examples for trace debugging

3. **Moved developer-only docs to `docs/development/`:**
   - `deployment.md` → `docs/development/deployment.md`
   - `TROUBLESHOOTING.md` → `docs/development/TROUBLESHOOTING.md`

4. **Updated `CLAUDE.md`** — replaced slim directory listing with full project structure tree + key patterns section (from `architecture.md`)

5. **Deleted 9 files from `docs/`:** overview, database, evals, ingestion, interfaces, slop-bot, architecture, search, WALKTHROUGH

6. **Updated `docs/README.md`** — now points to new file locations, references `src/config/docs/` as source of truth

**Current state:**
```
docs/
  README.md              ← Documentation index (updated)
  contributing.md        ← Contribution guidelines (kept)
  development/           ← PRDs, backlog, deployment, troubleshooting
  archive/               ← Stale RA-H docs (still to be deleted)
  handover/              ← Setup guide (still to be reviewed)

src/config/docs/         ← SOURCE OF TRUTH (6 files, rendered at /docs in web app)
  overview.md
  ingestion.md
  database.md
  interfaces.md
  slop-bot.md
  evals.md
```

**Still TODO:**
- Review `docs/handover/` (contains `setup.md`, may be redundant with deployment docs)
- Decide whether `docs/archive/` should be removed in a separate cleanup PRD

### Step 3: Documentation Overhaul (Partially Complete)

**Goal:** Every doc is accurate, complete, and legible.

**Per-document audit checklist:**
- [ ] Content matches current codebase (no stale references)
- [ ] Consistent formatting (headers, code blocks, tables)
- [x] Has a clear one-line description at the top (all 6 config docs have frontmatter with title + description)
- [ ] Has "Related docs" links at the bottom
- [ ] Has "Source files" section pointing to relevant code paths
- [x] No duplicate information across docs (consolidation eliminated duplicates)
- [ ] Doc length stays under ~500 lines and each section stays concise

**Remaining rewrites needed:**
- All 6 docs in `src/config/docs/` — Update "knowledge graph" terminology to "wiki-base"
- `src/config/docs/overview.md` — Refresh graph counts, update to wiki-base framing
- `src/config/docs/ingestion.md` — Update entity extraction details (now gpt-4.1-mini, orgs+research_fields only per PRD-27)
- `docs/contributing.md` — Add "how docs work" section explaining `src/config/docs/` as source of truth
- `CLAUDE.md` — Update "knowledge graph" references to wiki-base
- Root `AGENTS.md` — Keep as the stable start-here map for agents (progressive disclosure + links to task-specific skills)
- Skill trigger tightening — Refine `description`/`when_to_use` in `start-here` and `slop` to reduce undertriggering/overtriggering

### Step 4: Code → Docs Integration

**Status:** Deferred to follow-up PRD (out of scope for PRD-35).

**Reason:** This introduces new code conventions and touches many source files; PRD-35 is limited to terminology + documentation updates.

### Step 5: Database → Docs Integration

**Status:** Deferred to follow-up PRD (out of scope for PRD-35).

**Constraint for follow-up:** Do not require live Turso access in CI or pre-commit.

**Preferred design for follow-up:**
1. Generate schema docs from a deterministic local source (checked-in schema SQL or migration files), not from production/live DB.
2. Optional local verification can run against a local SQLite DB artifact.
3. `--check` should be deterministic and network-independent.

### Step 6: Living Docs System

**Status:** Deferred to follow-up PRD (out of scope for PRD-35).

**Note for follow-up:** Use objective checks only (existence, link validity, required sections), not subjective checks like "updated recently".

### Step 4 (from current plan): Legibility Pass

**Goal:** Every doc is scannable, consistent, and pleasant to read.

**Standards to apply:**
- **Headers:** `# Title` → `## Section` → `### Subsection` (max 3 levels)
- **Opening:** Every doc starts with a one-line description in italics
- **Tables:** Use tables for structured data (not bullet lists)
- **Code blocks:** Always specify language (`typescript`, `sql`, `bash`)
- **Links:** Use relative links between docs (`[Schema](database.md)`)
- **Length:** No doc exceeds ~500 lines. Split if needed.
- **Updated date:** Every doc has `*Last updated: YYYY-MM-DD*` under the title

## 4. Notes

- **Terminology decision (locked):** Use `LS Wiki-Base` for branded references and `wiki-base` in running text.
- **Agent entrypoint decision (locked):** Use root `AGENTS.md` (exact filename) as the canonical start-here map; keep deeper operational notes in `docs/development/process/agents.md`.
- **MCP server name:** The NPM package is `latent-space-hub-mcp`. Does it need renaming? Probably not — "hub" is still accurate, the wiki-base is what lives inside the hub.
- **Completed PRDs:** Keep unchanged as historical records (out of scope for this PRD).
- **Bot prompts:** Slop's system prompt in `latent-space-bots` repo also references "knowledge graph." That's a separate repo — note it here, fix it separately.
- **Scope guard:** This PRD is terminology + documentation only. No schema migrations, no new scripts/hooks/CI jobs, and no feature work.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
