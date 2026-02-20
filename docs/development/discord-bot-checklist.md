# Discord Bot Launch Checklist (Sig + Slop)

Use this to track setup and launch readiness.

## Infra Setup

- [x] GitHub repo exists: `latent-space-bots`
- [x] Railway project linked to GitHub repo
- [x] Railway service deploys successfully (runtime service)
- [ ] Railway has all required env values filled in
- [x] Railway deploy uses latest commit on `main`

## Discord App Setup

- [x] `LS_Sig` application created
- [x] `LS_Slop` application created
- [x] Both bot users created
- [x] Both bots invited to Brad's test server
- [ ] `MESSAGE CONTENT INTENT` confirmed ON for both apps
- [ ] Bot profile avatars finalized for both bots
- [ ] Bot descriptions/tags finalized for both bots

## Server Permissions

- [ ] `#ls-bot-playground` channel exists
- [ ] `#ls-bot-debates` channel exists
- [ ] Bot send/thread permissions enabled only in test channels
- [ ] Bot posting denied in non-test channels

## Product Dependencies

- [ ] PRD 05 ingestion complete (content is in DB + embedded)
- [ ] PRD 07 MCP/service layer ready for import

## Implementation Readiness

- [x] Discord gateway scaffolding complete (two clients, one process)
- [x] KB search + LLM response path wired
- [x] Slash commands wired: `/ask`, `/search`, `/episode`, `/debate`
- [x] Debate state machine implemented with exchange caps
- [ ] Chats logged to Turso `chats` table
- [x] Rate limiting implemented (user/channel/debate)

## Go/No-Go

- [ ] Test server validation passed
- [ ] Demo to swyx completed
- [ ] Approved to invite bots to LS Discord
