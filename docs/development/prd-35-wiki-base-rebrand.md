# PRD: LS Wiki-Base Rebrand

**Status:** Draft | **Created:** 2026-03-08

## 1. Background

Rebrand from "knowledge graph" / "context graph" to **LS Wiki-Base** — a combination of `.md` documentation and SQLite database that forms a living, breathing reference system. The documentation should not be a separate artifact from the product — it should be deeply integrated with the code and the database, always current, and incredibly legible.

## 2. Plan

1. **Terminology sweep** — Find and replace every "knowledge graph" / "context graph" reference across the entire codebase with "wiki-base" or "LS Wiki-Base"
2. **Documentation unification** — Merge dev docs (`docs/development/`) and user-facing docs (`docs/`) into a single coherent structure with clear navigation
3. **Documentation overhaul** — Rewrite all docs for clarity, accuracy, and legibility; remove stale/duplicate content
4. **Code ↔ docs integration** — Add inline references between code and docs (doc comments pointing to docs, docs pointing to source files with line references)
5. **Database ↔ docs integration** — Auto-generate schema docs from the live database; ensure docs/database.md is always derivable from the actual schema
6. **Living docs system** — Add pre-commit hooks and/or CI checks that flag when code changes aren't reflected in docs
7. **Legibility pass** — Consistent formatting, clear hierarchy, table of contents, reading-order guidance across all docs

## 3. Implementation Details

### Step 1: Terminology Sweep

**Goal:** Zero references to "knowledge graph" or "context graph" anywhere in the repo.

**Files to audit (48+ files reference "knowledge graph"):**
- `docs/overview.md` — "Two repos, one knowledge graph" → "Two repos, one wiki-base"
- `docs/README.md`, `docs/database.md`, `docs/interfaces.md`, `docs/ingestion.md`, `docs/architecture.md`
- `CLAUDE.md` — project instructions
- `README.md` (root)
- `apps/mcp-server-standalone/README.md` and package metadata
- `src/config/prompts/` — agent system prompts
- `src/config/skills/` — skill definitions
- All PRD files in `docs/development/` (update completed ones too for consistency)
- Component files, service files — grep for "knowledge graph", "knowledge base", "context graph"
- `package.json` description fields

**Replacement rules:**
| Old term | New term | Context |
|----------|----------|---------|
| knowledge graph | wiki-base | General references |
| Knowledge Graph | Wiki-Base | Title case |
| the graph | the wiki-base | When referring to the system as a whole |
| LS knowledge base | LS Wiki-Base | Branded references |
| context graph | wiki-base | If found anywhere |

**Keep as-is:**
- "graph" when referring to the technical graph structure (nodes + edges) — that's still accurate
- Database table/column names — no schema migration needed
- Edge/node terminology — those are correct graph terms

### Step 2: Documentation Unification

**Goal:** One documentation tree, no separation between "dev docs" and "user docs."

**Current state:**
```
docs/
  README.md              ← user-facing index
  overview.md            ← system overview
  database.md            ← schema reference
  interfaces.md          ← surfaces (web, MCP, bot)
  ingestion.md           ← pipeline docs
  architecture.md        ← architecture
  search.md              ← search system
  contributing.md        ← contributor guide
  deployment.md          ← deploy guide
  evals.md               ← eval system
  TROUBLESHOOTING.md     ← troubleshooting
  slop-bot.md            ← bot docs
  development/           ← PRDs, backlog, process
    backlog/             ← backlog system
    completed-prds/      ← finished PRDs
  archive/               ← stale RA-H docs
```

**Target state:**
```
docs/
  README.md              ← Master index / table of contents (the "front page" of the wiki-base)

  # Core reference (what the system IS)
  overview.md            ← System overview — what LS Wiki-Base is
  database.md            ← Schema reference (auto-verified against live DB)
  architecture.md        ← Architecture diagram + module map

  # How things work (operational docs)
  ingestion.md           ← Content pipeline
  search.md              ← Search system (vector + FTS + hybrid)
  interfaces.md          ← All surfaces (web, MCP, bot, Discord)
  slop-bot.md            ← Bot-specific docs

  # Contributing & running
  contributing.md        ← How to contribute
  deployment.md          ← Deploy guide
  TROUBLESHOOTING.md     ← Common issues

  # Development
  development/
    README.md            ← Dev workflow, conventions, how PRDs work
    backlog/             ← Backlog system (unchanged)
    completed-prds/      ← Finished PRDs (unchanged)
    [active PRDs]        ← In-progress PRDs (unchanged)

  # DELETED
  archive/               ← Remove entirely (stale RA-H docs, never referenced)
```

**Key changes:**
- Delete `docs/archive/` — stale, never referenced, causes confusion
- `docs/README.md` becomes the master index with reading order, last-updated dates, and links to every doc
- Every doc gets a consistent header: title, one-line description, last-updated date
- Every doc gets a "Source files" section linking to the relevant code

### Step 3: Documentation Overhaul

**Goal:** Every doc is accurate, complete, and legible.

**Per-document audit checklist:**
- [ ] Content matches current codebase (no stale references)
- [ ] Consistent formatting (headers, code blocks, tables)
- [ ] Has a clear one-line description at the top
- [ ] Has "Related docs" links at the bottom
- [ ] Has "Source files" section pointing to relevant code paths
- [ ] No duplicate information across docs (single source of truth per topic)
- [ ] Readable in 5 minutes or less per doc

**Specific rewrites needed:**
- `overview.md` — Update to wiki-base framing, refresh numbers, add module map
- `database.md` — Verify all tables/columns match actual schema, add examples
- `ingestion.md` — Update entity extraction details (now gpt-4.1-mini, orgs+research_fields only per PRD-27)
- `interfaces.md` — Update MCP tool count, add skill list
- `architecture.md` — Add dependency diagram, update file tree
- `contributing.md` — Add "how docs work" section
- `evals.md` — Align with PRD-21 status

### Step 4: Code → Docs Integration

**Goal:** Code files reference their docs, docs reference their source files.

**Implementation:**
1. Add a `@docs` JSDoc tag convention to key modules:
   ```typescript
   /**
    * Node CRUD operations for the wiki-base.
    * @docs docs/database.md#nodes
    */
   ```
2. Key files to annotate:
   - `src/services/database/*.ts` → `docs/database.md`
   - `src/services/agents/*.ts` → `docs/ingestion.md`
   - `src/services/embedding/*.ts` → `docs/search.md`
   - `src/tools/*.ts` → `docs/interfaces.md`
   - `apps/mcp-server*/` → `docs/interfaces.md`

3. Each doc gets a "Source files" section at the bottom:
   ```markdown
   ## Source Files
   - `src/services/database/nodeService.ts` — Node CRUD
   - `src/services/database/edgeService.ts` — Edge CRUD
   - `src/services/database/client.ts` — Turso connection
   ```

### Step 5: Database → Docs Integration

**Goal:** Schema docs are always in sync with the actual database.

**Implementation:**
1. Create `scripts/generate-schema-docs.ts`:
   - Connects to Turso
   - Runs `SELECT sql FROM sqlite_master WHERE type='table'`
   - Generates a markdown table for each table (columns, types, constraints)
   - Outputs to `docs/database.md` (or a section within it)
   - Compares against existing `docs/database.md` and warns on drift

2. Add to `package.json`:
   ```json
   "scripts": {
     "docs:schema": "tsx scripts/generate-schema-docs.ts",
     "docs:check": "tsx scripts/generate-schema-docs.ts --check"
   }
   ```

3. The `--check` flag exits non-zero if schema docs are out of date (usable in CI/pre-commit).

### Step 6: Living Docs System

**Goal:** Documentation is always updated when code changes.

**Implementation:**
1. Add a `docs:check` script that:
   - Verifies schema docs match live DB (`scripts/generate-schema-docs.ts --check`)
   - Checks that key docs exist and have been updated recently
   - Validates all internal doc links (no broken `docs/*.md` references)

2. Add to `CLAUDE.md` under Development section:
   ```markdown
   ### Documentation
   - When changing database schema, run `npm run docs:schema` to update docs/database.md
   - When adding new services or tools, add @docs JSDoc tags and update relevant docs
   - Every PR that changes code should update corresponding docs
   ```

3. Add a lightweight pre-commit reminder (not blocking, just informational):
   - If `.ts` files changed but no `.md` files changed, print: "Reminder: check if docs need updating"

### Step 7: Legibility Pass

**Goal:** Every doc is scannable, consistent, and pleasant to read.

**Standards to apply:**
- **Headers:** `# Title` → `## Section` → `### Subsection` (max 3 levels)
- **Opening:** Every doc starts with a one-line description in italics
- **Tables:** Use tables for structured data (not bullet lists)
- **Code blocks:** Always specify language (`typescript`, `sql`, `bash`)
- **Links:** Use relative links between docs (`[Schema](database.md)`)
- **Length:** No doc exceeds ~500 lines. Split if needed.
- **Updated date:** Every doc has `*Last updated: YYYY-MM-DD*` under the title

## 4. Open Questions / Notes

- **"Wiki-Base" capitalization:** Settling on "Wiki-Base" (hyphenated, capital W and B) for the branded term, lowercase "wiki-base" in running text. Open to adjustment.
- **MCP server name:** The NPM package is `latent-space-hub-mcp`. Does it need renaming? Probably not — "hub" is still accurate, the wiki-base is what lives inside the hub.
- **Completed PRDs:** Should we update terminology in completed PRDs? Leaning yes for consistency, but these are historical records. Decision: update them — they're reference docs, not museum pieces.
- **Bot prompts:** Slop's system prompt in `latent-space-bots` repo also references "knowledge graph." That's a separate repo — note it here, fix it separately.
- **Scope guard:** This PRD is about terminology + documentation. No schema migrations, no new features, no UI changes beyond text labels.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
