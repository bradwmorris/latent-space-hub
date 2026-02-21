# RA-H Open Source Porting Notes (2025-12-09)

---

## Pre-Public Release Audit & Recommendations (2025-12-15)

This section documents the security audit findings and open-source best practice recommendations compiled before making the repository public.

### Audit Summary

| Category | Status |
|----------|--------|
| Credentials/API Keys | ✅ Clean - none found |
| Private repo references | ⚠️ 1 issue to fix |
| Supabase remnants | ✅ Clean - properly removed |
| Sensitive business data | ✅ Clean |
| Documentation completeness | ⚠️ Gaps to address |

---

### 🚨 BLOCKING ISSUES (Must Fix Before Public)

#### 1. Stale Reference in `docs/9_open-source.md`
**Line 9** references a non-existent internal doc:
```
Track progress in `docs/development/prd-private-repo-reset.md`.
```
**Fix:** Remove this line or replace with a public tracking mechanism (GitHub Issues).

#### 2. Stale Version in `docs/0_overview.md`
**Line 26** states: `**Version:** Beta (private distribution)`
**Fix:** Update to `**Version:** 0.1.0 (Open Source)`

#### 3. Outdated Key Reference in `docs/6_ui.md`
**Line 79** mentions: `beta ships with embedded keys`
**Fix:** Clarify this refers to the original private beta, not the BYO-key open source version.

---

### 📋 MISSING FILES (Industry Standard for Open Source)

Based on [GitHub's Open Source Guides](https://opensource.guide/starting-a-project/) and [10up Best Practices](https://10up.github.io/Open-Source-Best-Practices/community/), these files are expected:

| File | Purpose | Priority |
|------|---------|----------|
| `CONTRIBUTING.md` | How to contribute, PR process, code style | **High** |
| `CODE_OF_CONDUCT.md` | Community behavior standards ([Contributor Covenant](https://www.contributor-covenant.org/)) | **High** |
| `SECURITY.md` | How to report vulnerabilities privately | **High** |
| `.github/ISSUE_TEMPLATE/` | Bug report & feature request templates | Medium |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist and format | Medium |
| `CHANGELOG.md` | Version history and changes | Medium |
| `docs/TROUBLESHOOTING.md` | Common issues and solutions | Low |

---

### 🔐 SECURITY CHECKLIST

Per [binbash pre-launch checklist](https://medium.com/binbash-inc/open-source-github-repository-pre-launch-checklist-4a52dbbe4af1) and [OpenSSF guidelines](https://github.com/ossf/wg-best-practices-os-developers):

- [ ] **Run secret scanner** - Use [Gitleaks](https://github.com/gitleaks/gitleaks), [TruffleHog](https://github.com/trufflesecurity/trufflehog), or GitHub's built-in secret scanning
- [ ] **Check git history** - Ensure no credentials in commit history (fresh repo helps)
- [ ] **Enable branch protection** - Require PR reviews for `main` branch
- [ ] **Add SECURITY.md** - Define vulnerability reporting process (e.g., security@yourdomain.com or GitHub Security Advisories)
- [ ] **Review dependencies** - Run `npm audit` and document known vulnerabilities
- [ ] **Add .gitignore review** - Ensure `.env*`, credentials, and local configs are excluded

---

### 📚 DOCUMENTATION GAPS

Current docs are technically solid but missing contributor-facing content:

| Gap | Recommendation |
|-----|----------------|
| No contribution guide | Create `CONTRIBUTING.md` with: setup instructions, code style, PR process, testing requirements |
| No API reference | Consider auto-generating from code or adding `docs/api.md` |
| No troubleshooting | Add common issues (SQLite rebuild, key validation errors) |
| No architecture decision records | Optional but helpful for major decisions |
| Numbered doc files unclear | Add `docs/README.md` explaining what each numbered file covers |

---

### 🏗️ RECOMMENDED FILE STRUCTURE

```
ra-h_os/
├── README.md              ✅ exists
├── LICENSE                ✅ exists (MIT)
├── CONTRIBUTING.md        ❌ create
├── CODE_OF_CONDUCT.md     ❌ create
├── SECURITY.md            ❌ create
├── CHANGELOG.md           ❌ create
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
│   ├── README.md          ❌ create (index of docs)
│   └── ...existing docs...
└── ...
```

---

### 🔄 PRIVATE-TO-PUBLIC SYNC BEST PRACTICES

Based on [Microsoft ISE's approach](https://devblogs.microsoft.com/ise/synchronizing-multiple-remote-git-repositories/) and [GitLab mirroring docs](https://docs.gitlab.com/user/project/repository/mirror/):

**Current approach (manual sync) is correct for security.** Recommendations:

1. **Document the sync process publicly** - The current reference to private repo workflow docs won't help public contributors understand when features land
2. **Consider a ROADMAP.md** - Let the community know what's coming from the private repo
3. **Tag releases** - Use semantic versioning (v0.1.0, v0.2.0) so users know when syncs happen
4. **Divergence handling** - Document what happens if someone contributes to OS version (does it get merged upstream? Is OS version append-only from private?)

---

### 👥 GOVERNANCE MODEL

For a project of this size with a private upstream, a **BDFL (Benevolent Dictator for Life)** model is appropriate per [Red Hat's governance guide](https://www.redhat.com/en/blog/understanding-open-source-governance-models):

- You maintain final decision authority
- Contributions are welcome but reviewed against private repo direction
- Clear in CONTRIBUTING.md that this is a mirror, not a community-driven fork

---

### 🎯 PRIORITY ACTION ITEMS

**Before going public (blocking):**
1. Fix the 3 stale references listed above
2. Run a secret scanner on the repo
3. Create `SECURITY.md` with vulnerability reporting instructions
4. Create basic `CONTRIBUTING.md`
5. Add `CODE_OF_CONDUCT.md` (use Contributor Covenant template)

**First week after public:**
6. Enable GitHub branch protection on `main`
7. Add issue templates
8. Create `CHANGELOG.md` starting from v0.1.0
9. Add `docs/README.md` explaining the docs structure

**Ongoing:**
10. Document sync cadence with private repo
11. Consider adding CI (linting, type-check) via GitHub Actions
12. Monitor for community contributions and establish response SLA

---

### 📖 REFERENCE SOURCES

- [Starting an Open Source Project - GitHub Guides](https://opensource.guide/starting-a-project/)
- [Open Source Pre-Launch Checklist - binbash](https://medium.com/binbash-inc/open-source-github-repository-pre-launch-checklist-4a52dbbe4af1)
- [README Best Practices - jehna](https://github.com/jehna/readme-best-practices)
- [Building Welcoming Communities - GitHub Guides](https://opensource.guide/building-community/)
- [Leadership and Governance - GitHub Guides](https://opensource.guide/leadership-and-governance/)
- [Understanding Open Source Governance - Red Hat](https://www.redhat.com/en/blog/understanding-open-source-governance-models)
- [Synchronizing Multiple Git Repositories - Microsoft ISE](https://devblogs.microsoft.com/ise/synchronizing-multiple-remote-git-repositories/)
- [OSS Security Checklist - Onboardbase](https://onboardbase.com/blog/oss-security/)
- [CFPB Open Source Template](https://github.com/cfpb/open-source-project-template)

---

## Agent Handover

**What is this repo?** This is `ra-h_os`, the open source mirror of the private `ra-h` application. It's a BYO-key (bring your own API keys) version without Mac packaging, Supabase auth, or subscription features.

**Quick context:**
- Read `CLAUDE.md` for system overview
- Read `README.md` for setup instructions
- Read `docs/9_open-source.md` for sync process with private repo

**Current status:** Initial commit complete (2025-12-15). Repo is currently private on GitHub. Before making public, we need a more thorough audit to ensure no sensitive data, credentials, or private references remain. Review all docs, scripts, and code comments for anything that shouldn't be public.

**Sync process:** Features are built in the private `ra-h` repo first, then synced here via Step 8 of the workflow (see private repo's `docs/development/process/1_workflow.md`).

---

This document captures every change required to bring the private RA-H repo into a runnable, local-only open-source build.

## 1. Repo Copy & Cleanup
- `rsync` with an allowlist copied only source/docs/scripts into `~/Desktop/dev/ra-h_os`, excluding `.git`, `node_modules`, builds, backups, pgdata, logs, Mac artifacts, and tooling metadata (`.claude`, `.mcp.json`).
- Removed leftover build outputs and workflows: `.next/`, `.env*`, `.github/workflows/*`, `.claude/`, `.mcp.json`.
- Regenerated dependencies locally (`npm install --legacy-peer-deps`) and rebuilt native modules (`npm rebuild better-sqlite3`).

## 2. Rebrand & Licensing
- `package.json` renamed to `ra-h-open-source`, version reset to `0.1.0`, `private: false`, scripts force local mode, and Supabase/mac scripts removed.
- LICENSE switched from PolyForm to MIT; README rewritten for BYO-key locals; `.env.example` now defaults to `NEXT_PUBLIC_DEPLOYMENT_MODE=local` and drops Supabase fields.

## 3. UI & Runtime Simplification
- Deleted Supabase auth (`AuthProvider`, `AuthGate`, Supabase client/storage), Subscription/Usage components, auto-update wiring, and Tauri-specific helper files.
- `app/layout.tsx` renders a plain layout; `app/page.tsx` wraps the 3-panel UI in `LocalKeyGate` so first-run users see the API-key prompt.
- `ThreePanelLayout` now listens for `settings:open` to honor the LocalKeyGate button; `SettingsModal` shows only local tabs plus a "Local Mode" explainer.

## 4. Local-Only Key Flow
- `apiKeyService` still stores keys in `localStorage` but now broadcasts `api-keys:updated`. Added `/api/local/test-anthropic` so key validation occurs server-side (avoids browser CORS on `api.anthropic.com`).
- `ApiKeysViewer` uses that route to verify Anthropic keys; OpenAI testing already worked.
- Added `LocalKeyGate` overlay to block the workspace until at least one key is entered.

## 5. Backend Removal & BYO Keys End-to-End
- Removed Supabase token registry, backend fetch helpers, and all Supabase-facing scripts/docs.
- `RequestContext` now tracks `apiKeys` (OpenAI/Anthropic) for the current request.
- `useSSEChat` sends those keys with each `/api/rah/chat` call; the API route threads them into `resolveModel`, WiseRAH, and MiniRAH executors so delegations inherit the same BYO credentials.
- Chat logging/backend usage metadata dropped the Supabase proxies; everything runs directly against user-supplied keys.

## 6. Testing
- `npm run type-check` passes.
- Local dev requires: `npm rebuild better-sqlite3` once per machine, `scripts/dev/bootstrap-local.sh`, `npm run dev`.
- Manual smoke: open Settings → API Keys, add OpenAI + Anthropic keys (Anthropic test now succeeds), refresh; nodes/ui/chat all function.

## 7. Documentation Cleanup (2025-12-15)
- Removed `docs/development/completed/` (150+ internal PRDs)
- Removed `docs/development/process/` (internal workflow docs)
- Simplified `CLAUDE.md` for open source users
- Kept core architecture docs (`docs/0_overview.md` through `docs/6_ui.md`)

Keep this doc updated as future open-source specific changes land.
