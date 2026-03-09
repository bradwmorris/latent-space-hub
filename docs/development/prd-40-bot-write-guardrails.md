# PRD: Bot Write Guardrails & Safe Execution

**Status:** Draft | **Created:** 2026-03-09

## 1. Background

`latent-space-bots` currently performs database writes directly in command handlers (`/join`, `/paper-club`, `/builders-club`) and related helper paths. The current model is functional but trust-based: safety depends on code path correctness and Discord permissions, not an explicit write policy layer.

This PRD introduces a formal write-guardrail architecture so write operations are explicitly authorized, validated, idempotent where needed, and auditable.

**Target repo:** `latent-space-bots`.

## 2. Goals

1. Add a single write-execution gate for all bot DB writes.
2. Enforce explicit policy checks per action before SQL executes.
3. Add idempotency and duplicate-protection for retry-prone paths.
4. Add write audit logs with actor, action, target, payload hash, and result.
5. Preserve current user-facing behavior while tightening safety.

## 3. Non-Goals

- No change to bot personality/prompt behavior.
- No new end-user slash commands.
- No large schema redesign of core nodes/edges model.

## 4. Proposed Architecture

### 4.1 Write Gate

Create `src/writes/guardrails.ts` as the only entrypoint for mutating operations.

- `executeWrite(action, ctx, input, fn)`
- Validates policy before execution.
- Wraps execution in structured audit logging.
- Normalizes error responses.

All existing mutating calls in commands/member update paths route through this gate.

### 4.2 Write Policy

Create `src/writes/policy.ts`:

- `canExecute(action, ctx, input): { allow: boolean; reason?: string }`
- Action allowlist, for example:
  - `member.join.create`
  - `member.profile.update`
  - `event.schedule.create`
  - `edge.member_interest.create`
- Checks include:
  - guild context required
  - actor identity present
  - channel allowlist compliance where relevant
  - payload shape/domain rules (date, title length, event type)

### 4.3 Idempotency + Conflict Controls

- `/join` remains race-safe and adds explicit idempotency keying on `discord_id`.
- event scheduling adds a deterministic key `(event_type, event_date)` check before create.
- edge creation uses duplicate-safe semantics where possible (`INSERT OR IGNORE` or pre-check).

### 4.4 Audit Trail

Add write-audit table (or reuse `chats.metadata` temporarily if migration deferred), with fields:

- `occurred_at`
- `action`
- `actor_discord_id`
- `guild_id`
- `channel_id`
- `target_node_id` (nullable)
- `status` (`allowed` / `blocked` / `succeeded` / `failed`)
- `reason`
- `payload_hash`
- `error`

This enables post-incident review and guardrail tuning.

## 5. Implementation Plan

1. Define action enums + write context types.
2. Implement `writes/policy.ts`.
3. Implement `writes/guardrails.ts` wrapper.
4. Refactor mutating paths to call wrapper:
   - `commands/join.ts`
   - `commands/schedule.ts`
   - `members/index.ts` (profile/interest updates)
5. Add audit logging sink (table + write function).
6. Add tests for policy allow/block and idempotency.
7. Verify no user-facing behavior regressions.

## 6. Verification

- `npm run build` passes.
- Unit tests for policy decisions and idempotency pass.
- Manual Discord checks:
  - `/join` creates once; repeated calls do not duplicate.
  - `/paper-club` and `/builders-club` prevent double booking.
  - blocked contexts produce safe error messages.
- Audit entries are created for allowed/blocked writes.

## 7. Risks & Mitigations

- Risk: Over-blocking valid writes.
  - Mitigation: start in monitor mode for selected actions, then enforce.
- Risk: Added complexity in command handlers.
  - Mitigation: keep handlers thin; move checks to policy module.
- Risk: Partial rollout inconsistencies.
  - Mitigation: migrate all write paths in one PR or behind a single feature flag.

## 8. Rollout

- Phase 1: Implement gate + audit in monitor mode (log but do not block selected checks).
- Phase 2: Enable blocking for high-confidence checks.
- Phase 3: Document operational playbook for investigating blocked writes.

---

**When complete:** Add `## COMPLETED` with date/summary and move to `docs/development/completed-prds/`.
