# PRD-47: Bot Repo Consolidation — migrate `latent-space-bots` into `latent-space-hub`

**Status:** Draft | **Created:** 2026-04-10

## 1. Background

`latent-space-hub` and `latent-space-bots` were originally split for valid runtime reasons:

- `latent-space-hub` is the Next.js app, docs surface, MCP surface, and Vercel cron-driven ingestion pipeline
- `latent-space-bots` is an always-on Discord gateway process running on Railway

That deployment split should remain.

The **repo** split now creates more cost than value:

- the hub directly reads bot files across repo boundaries in `src/services/docs/docsService.ts`
- hub docs and handover docs disagree about whether Slop still uses MCP
- both repos share one Turso schema and are already operationally coupled
- there are stale bot artifacts from older architecture phases (`McpGraphClient`, vendored MCP package, Sig wording)

Originally there were multiple bots (`Sig` + `Slop`). Today the only active production bot is **Slop**. The consolidated repo should make that explicit while preserving a durable `bots/` namespace so future bots can be added without another repo split.

## 2. Due-Diligence Findings

### Current production/runtime facts

1. **Bot hosting:** Slop runs on Railway, not Vercel.
2. **Vercel cron:** Vercel only runs the hub ingestion/extraction cron endpoints:
   - `/api/cron/ingest`
   - `/api/cron/extract-entities`
3. **Reminder scheduler:** reminders are **not** Vercel cron jobs. They run inside the bot process via `node-cron`.
4. **Kickoff API:** the bot exposes its own HTTP kickoff server from the Railway process.
5. **Bot runtime boundary:** Slop currently uses direct Turso access and local `slop_*` tools. It does not depend on MCP at runtime.

### Files proving the current state

- Railway deploy config: `latent-space-bots/railway.json`
- Bot startup: `latent-space-bots/src/index.ts`
- Reminder scheduler: `latent-space-bots/src/reminders/index.ts`
- Reminders are started from the Discord bot runtime: `latent-space-bots/src/discord/bot.ts`
- Vercel cron config: `latent-space-hub/vercel.json`
- Current sibling-repo dependency: `latent-space-hub/src/services/docs/docsService.ts`

### Operational implication

This migration does **not** require:

- removing the bot from Discord
- rotating bot tokens
- recreating slash-command app credentials

It **does** require:

- a Railway service reconfiguration and redeploy
- at least one Vercel redeploy because the repo contents change
- a controlled cutover so only one Slop runtime is connected at a time

### Specific risks discovered

1. **Docs path dependency**
   - The hub currently reads `../latent-space-bots/src/index.ts` and `../latent-space-bots/skills/*.md`.
   - This must be updated immediately after import.

2. **Reminder-window risk**
   - Reminder scheduling is in-process on Railway.
   - Do not cut over near the 11:00 PT or 12:00 PT reminder windows.
   - Keep `scripts/fire-reminder.ts` available as a manual fallback.

3. **Stale multi-bot wording**
   - Bot README still says "Sig optional".
   - Hub docs still refer to Sig & Slop in some places.
   - We must preserve the platform-level `bots/` namespace while clearly documenting that only Slop is active today.

4. **Stale MCP/dead-code artifacts**
   - `scripts/backfill-member-avatars.ts` still imports deleted `McpGraphClient`
   - bot `.env.example` still contains `LS_HUB_MCP_SERVER_PATH`
   - vendored `vendor/latent-space-hub-mcp/` remains in the bot repo

## 3. Target Outcome

After this PRD:

- there is **one** canonical repo: `latent-space-hub`
- the hub stays deployed from repo root on Vercel
- Slop lives at `apps/bots/slop/` and is deployed from that path on Railway
- docs, code paths, and backlog references no longer depend on a sibling repo
- documentation says:
  - originally there were multiple bots
  - currently only Slop is active
  - `apps/bots/` remains the place for future bots

## 4. Plan

1. Lock the target monorepo structure
2. Prepare the hub repo for import and path migration
3. Import `latent-space-bots` with history under `apps/bots/slop`
4. Rewrite path assumptions and stale bot references
5. Reconfigure Railway to deploy Slop from the new path
6. Validate locally and in production
7. Cut over with a rollback-ready deployment sequence
8. Archive or freeze the standalone bots repo after successful verification

## 5. Implementation Details

### Step 1: Lock the target structure

Keep the current hub repo root as the Vercel project root.

Do **not** move the Next.js app into `apps/hub/` in this PRD. That would create avoidable Vercel risk.

Target layout:

```text
latent-space-hub/
├── app/
├── apps/
│   ├── mcp-server/
│   ├── mcp-server-standalone/
│   └── bots/
│       ├── README.md
│       └── slop/
│           ├── package.json
│           ├── railway.json
│           ├── src/
│           ├── skills/
│           ├── personas/
│           ├── scripts/
│           └── ...
├── docs/
├── package.json
└── vercel.json
```

Design rules:

- `apps/bots/` remains plural
- `apps/bots/slop/` is the only active bot runtime now
- future bots would sit beside Slop, not trigger another repo split

### Step 2: Prepare the hub repo before import

Create a dedicated branch in `latent-space-hub`:

```bash
git checkout -b codex/prd-47-bot-repo-consolidation
```

Preflight checks in the hub repo:

```bash
npm install
npm run type-check
npm test
```

Preflight checks in the bot repo:

```bash
npm install
npm run build
npm test
```

Capture current deployment/runtime references before changing anything:

- export current Railway env vars and service settings
- note current Railway start/build behavior
- confirm Vercel root remains repo root
- note any docs pages rendering live Slop bot data from sibling paths

Create an explicit migration inventory from current references:

- code references to `../latent-space-bots`
- docs references to `latent-space-bots`
- docs references to MCP-based bot behavior
- docs references to Sig as active
- stale env vars and vendored packages inside the bot repo

### Step 3: Import `latent-space-bots` with history

Use a history-preserving import, not copy-paste.

Recommended approach:

```bash
cd /Users/bradleymorris/Desktop/dev/latent-space-hub
git remote add latent-space-bots /Users/bradleymorris/Desktop/dev/latent-space-bots
git fetch latent-space-bots
git subtree add --prefix=apps/bots/slop latent-space-bots main
```

Why `git subtree` here:

- preserves bot history
- keeps the migration simple and auditable
- avoids an extra history rewrite step

After import:

```bash
cd apps/bots/slop
npm install
npm run build
npm test
```

This first pass should keep the bot as a self-contained nested package. Do **not** adopt npm workspaces in the same migration unless we hit a concrete blocker.

### Step 4: Rewrite all cross-repo path assumptions

Immediately after import, change hub code that assumes a sibling checkout.

Primary required code change:

- `src/services/docs/docsService.ts`

Change:

- `../latent-space-bots/src/index.ts`
- `../latent-space-bots/skills/*.md`

To:

- `apps/bots/slop/src/index.ts`
- `apps/bots/slop/skills/*.md`

Also update the rendered doc text so it no longer claims the Slop section is "live from `latent-space-bots`" as an external sibling repo.

Secondary doc/content sweep:

- `src/config/docs/slop-bot.md`
- `src/config/docs/tools.md`
- `src/config/docs/skills.md`
- `src/config/docs/getting-started-understand-app-and-bot.md`
- `src/config/docs/getting-started-contribute-with-slash-commands.md`
- `docs/development/deployment.md`
- `docs/handover/setup.md`
- `CLAUDE.md`

Update wording from:

- "separate repo"
- "latent-space-bots"
- "Sig & Slop" where it implies multiple active bots
- "bot uses MCP" where stale

To:

- "bot platform lives in `apps/bots/`"
- "current active bot is Slop"
- "Slop connects directly to Turso"

### Step 5: Clean stale bot artifacts during the move

Do this inside `apps/bots/slop/`.

Required cleanup:

1. Fix `scripts/backfill-member-avatars.ts`
   - replace deleted `McpGraphClient` usage with direct DB operations or remove the script if no longer needed

2. Remove stale env/config references
   - delete `LS_HUB_MCP_SERVER_PATH` from `.env.example` if unused

3. Audit vendored MCP package
   - `vendor/latent-space-hub-mcp/`
   - remove if no runtime or dev script actually needs it

4. Clarify Slop-only runtime docs
   - update README lines that still say "Sig optional"
   - keep `personas/sig.soul.md` only if explicitly archived for future reuse
   - do not describe Sig as an active production bot

5. Preserve future-bot namespace
   - add `apps/bots/README.md`
   - explain:
     - bot platform = `apps/bots/`
     - active bot today = Slop
     - future bots can be added later

### Step 6: Railway deployment migration

#### 6.1 Current desired steady state

Railway should deploy from:

- repo: `latent-space-hub`
- root path: `apps/bots/slop`

The bot should continue using:

- same Discord token
- same app ID
- same Turso credentials
- same reminder settings
- same kickoff secret/port settings

#### 6.2 Migration strategy

Use **existing Railway service re-pointing**, not a long-lived parallel duplicate bot service.

Reason:

- duplicate Slop instances with the same token create unnecessary risk
- reminder scheduler is in-process
- there should be one active gateway consumer and one reminder scheduler

#### 6.3 Railway settings to update

Update the service to use the new repo/path.

If Railway root-directory support is used:

- set service root to `apps/bots/slop`
- ensure build command remains `npm run build`
- ensure start command remains `npm run start`

If Railway config file path is required explicitly:

- point it at `apps/bots/slop/railway.json`

Post-change expectation:

- Railway builds the nested package, not the hub root package
- Railway deploy logs still show:
  - TypeScript build
  - `node dist/index.js`
  - bot login
  - reminder scheduler startup
  - kickoff API startup

#### 6.4 Reminder-window guardrail

Do **not** perform Railway cutover:

- near `11:00` Pacific
- near `12:00` Pacific

Those are the 1h and 24h reminder windows.

If cutover overlaps a reminder window or a reminder is missed:

- use `apps/bots/slop/scripts/fire-reminder.ts` as the fallback/manual send path

### Step 7: Vercel implications

Keep Vercel simple:

- repo stays `latent-space-hub`
- root stays repo root
- `vercel.json` stays repo root
- cron routes remain unchanged

Required validation after merge:

- `vercel.json` still defines only the ingestion/extraction cron routes
- app build is unaffected by the presence of `apps/bots/slop`
- no hub runtime code assumes sibling checkout paths anymore

Important note:

If the repo does **not** adopt workspaces in this migration, Vercel monorepo optimizations for skipping unaffected projects may not apply. That is acceptable for this PRD. Optimization can be a follow-up task.

### Step 8: Local development shape after migration

Hub remains:

```bash
cd latent-space-hub
npm install
npm run dev
```

Bot becomes:

```bash
cd latent-space-hub/apps/bots/slop
npm install
npm run build
npm run dev
```

Do not attempt to unify installs, lockfiles, or scripts in the same migration unless necessary.

Follow-up workspaces PRD is acceptable later if the repo ergonomics become painful.

### Step 9: Validation checklist before cutover

#### 9.1 Local validation

Hub:

```bash
cd /Users/bradleymorris/Desktop/dev/latent-space-hub
npm install
npm run type-check
npm test
```

Bot:

```bash
cd /Users/bradleymorris/Desktop/dev/latent-space-hub/apps/bots/slop
npm install
npm run build
npm test
```

Docs path validation:

- load the docs page that renders Slop system prompt content
- confirm it resolves files from `apps/bots/slop`
- confirm no fallback copy is being used accidentally

#### 9.2 Production validation after Railway/Vercel deploy

Must verify all of:

1. Slop logs in successfully
2. slash commands still register/respond
3. mention/reply flow works
4. kickoff endpoint works
5. reminder scheduler starts
6. at least one upcoming-events query works
7. at least one scheduling/edit-event flow works
8. hub deploy still serves docs and cron endpoints

### Step 10: Cutover sequence

Execute in this order:

1. Merge/import bot code into hub branch
2. Fix path assumptions and stale references
3. Validate hub locally
4. Validate bot locally from `apps/bots/slop`
5. Push branch and open review
6. Merge to `main`
7. Redeploy Vercel from updated `main`
8. Repoint existing Railway service to the new repo/path and deploy
9. Verify:
   - bot login
   - reminder scheduler startup
   - kickoff API startup
   - live message/slash-command behavior
10. Once confirmed stable, freeze/archive the standalone `latent-space-bots` repo

### Step 11: Rollback plan

If Railway deploy fails:

1. revert Railway service source/path to the standalone `latent-space-bots` repo
2. redeploy previous known-good bot commit
3. leave Vercel on new hub deploy if hub itself is healthy
4. keep standalone bot repo unarchived until the new path is proven stable

If hub docs/path changes fail:

1. revert the hub merge commit or hotfix the path references
2. keep Railway on the standalone bot repo until docs/code are corrected

No rollback step should involve:

- deleting the Discord bot
- rotating tokens
- removing slash commands from Discord

## 6. Concrete File Inventory

### Must change in `latent-space-hub`

- `src/services/docs/docsService.ts`
- `docs/development/deployment.md`
- `docs/handover/setup.md`
- `src/config/docs/slop-bot.md`
- `src/config/docs/tools.md`
- `src/config/docs/skills.md`
- `src/config/docs/getting-started-understand-app-and-bot.md`
- `src/config/docs/getting-started-contribute-with-slash-commands.md`
- `CLAUDE.md`

### Must change in imported bot (`apps/bots/slop`)

- `README.md`
- `.env.example`
- `scripts/backfill-member-avatars.ts`
- optionally `vendor/latent-space-hub-mcp/`
- add `apps/bots/README.md` at platform level

### Likely follow-up sweep

- backlog/PRD docs that historically reference `latent-space-bots`
- archived docs that still describe MCP bot runtime or dual-bot production behavior

## 7. Non-Goals

This PRD does **not** do the following:

- move the hub app into `apps/hub`
- unify the hub and bot into one deploy target
- reintroduce MCP as the bot runtime interface
- extract shared packages/libs across hub and bot
- adopt npm workspaces unless absolutely needed
- redesign Slop behavior, commands, or persona

## 8. Open Questions / Notes

- Should `personas/sig.soul.md` remain in `apps/bots/slop` as an archived artifact, or move to a docs/archive location?
- Should we clean historical backlog/PRD wording in this PRD, or leave historical docs historically accurate and update only current-facing docs?
- Do we want a follow-up PRD for shared internal packages after this consolidation is stable?

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
