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
- [x] Content matches current codebase (no stale references) for core docs and skill paths touched in this PRD
- [ ] Consistent formatting (headers, code blocks, tables)
- [x] Has a clear one-line description at the top (all 6 config docs have frontmatter with title + description)
- [ ] Has "Related docs" links at the bottom
- [ ] Has "Source files" section pointing to relevant code paths
- [x] No duplicate information across docs (consolidation eliminated duplicates)
- [ ] Doc length stays under ~500 lines and each section stays concise

**Remaining rewrites needed:**
- `src/config/docs/overview.md` — refresh graph counts over time
- `src/config/docs/ingestion.md` — keep extraction details synced with latest pipeline
- `docs/contributing.md` — add explicit "how docs work" section for `src/config/docs/`
- skill metadata tuning (`description` / `when_to_use`) as usage patterns evolve

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

## 5. Implemented In This Workstream (2026-03-09)

This section captures the concrete implementation completed while executing PRD-35 plus tightly-coupled skills/docs cleanup required to make the wiki-base docs accurate.

### 5.1 Skills Architecture and Hierarchy

**Decision implemented:**
- Split Hub bundled skills into two explicit folders:
  - `src/config/skills/slop/`
  - `src/config/skills/agents/`

**What changed:**
- Moved/created skills so the read hierarchy is explicit and ordered.
- Updated `src/services/skills/skillService.ts` to load from both directories, preserve ordering, and keep legacy slug redirects.
- Updated docs navigation grouping to keep `Slop Skills` and `Agent Skills` sections.

**Result:**
- Skills are now structurally separated by audience (Slop vs general agents), with deterministic ordering in UI/docs and MCP skill listing.

### 5.2 Slop Canonical Skill Set (Locked)

Locked Slop skill set and ordering:
1. Start Here
2. Graph Search
3. Member Profiles
4. DB Operations
5. Curation
6. Event Scheduling

Implemented as concrete files in:
- `latent-space-bots/skills/`
- mirrored docs copy in `latent-space-hub/src/config/skills/slop/`

### 5.3 Canonical Runtime Source for Slop Skills

**Final runtime model implemented (after iteration):**
- Slop runtime reads skills from its own repo only:
  - `latent-space-bots/skills/*.md`
- No runtime fallback to Hub for skills.
- Bot startup validates exact required 6-skill set; missing/extra fails fast.

**Code path:**
- `latent-space-bots/src/index.ts`

### 5.4 Hub as Documentation Mirror for Slop Skills

**Implemented:**
- Hub `slop/` skill docs are mirrored from `latent-space-bots/skills`.
- Verified file parity for all 6 Slop skills during implementation.

**Intent:**
- Bot runtime source stays local to bots repo.
- Hub displays/documentation stays consistent with bot skills.

### 5.5 Slop Bot Documentation Accuracy Updates

Updated `src/config/docs/slop-bot.md` to reflect the current architecture:
- Expanded skill table to all 6 Slop skills.
- Corrected `ls_read_skill` behavior to local bot files only.
- Removed stale wording implying local+MCP fallback for skill bodies.

### 5.6 Live System Message Section in Docs

Implemented dynamic system message section injection for `/docs/slop-bot` in:
- `src/services/docs/docsService.ts`

Behavior:
1. Prefer live extraction from sibling repo:
   - `../latent-space-bots/src/index.ts`
   - `../latent-space-bots/skills/*.md`
2. If sibling bots repo is not mounted, gracefully fall back to Hub mirrored Slop skill docs (`src/config/skills/slop/*.md`) and default identity/rules template.

This prevents docs breakage across environments while keeping local-dev docs aligned to bot source when available.

### 5.7 Legacy/Path Cleanup

Updated stale skill-path references to the new split layout in:
- `AGENTS.md`
- `docs/README.md`
- `docs/development/process/agents.md`
- `docs/development/prd-32-paper-club-scheduling.md`

### 5.8 Related Reliability Fixes Completed During This Workstream

While validating Slop behavior, the following bot correctness fixes were implemented and retained:
- `/join` concurrency hardening (join in-flight guard + race-safe behavior).
- member uniqueness/index handling improvements.
- event scheduling guardrails clarified and synchronized to skill docs.

### 5.9 Verification Performed

- `latent-space-bots`: `npm run build` passed after runtime skill-source refactor.
- `latent-space-hub`: `npm run type-check` and `npm run build` passed after docs/services changes.
- Skills/doc navigation paths for `/docs/skills/[slug]` validated with generated static routes.

### 5.10 Git / Remote State

Changes were committed and pushed to `main` in both repos:
- `latent-space-bots`: commit `575e11b`
- `latent-space-hub`: commit `535d7ee`

Both repos were verified synchronized with `origin/main` after push.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
