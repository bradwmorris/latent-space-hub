# PRD 17: Setup & Handover

**Status:** completed
**Completed:** 2026-02-27

## Background

Everything is built and deployed. This is the handover checklist for getting the bot and webhooks live in the Latent Space Discord server.

---

## What the server owner needs to do

If you're comfortable making me a temporary admin with limited permissions, do this. Otherwise (5-10 mins):

### 1. Invite the bot to the LS server

- Click the OAuth2 invite link (provided separately)
- Select the Latent Space server
- Authorize

Bot needs these permissions:
- Send Messages
- Create Public Threads
- Send Messages in Threads
- Embed Links
- Read Message History

### 2. Create two webhooks

Webhooks let the hub post messages as "Latent Space Hub" in specific channels. The owner picks which channels.

**Webhook 1 — Announcements channel**

1. Right-click the target channel → Edit Channel
2. Go to Integrations → Webhooks → New Webhook
3. Name it "Latent Space Hub"
4. Click Copy Webhook URL
5. Send the URL to me

**Webhook 2 — Discussion/yap channel**

1. Same steps in the discussion channel
2. Copy and send the second URL

### 3. Create a temporary test channel

1. Create a private channel called `#slop-testing`
2. Add Brad to the channel
3. Create a webhook in this channel too (same steps as above), send the URL

This channel is used to verify everything works before going live. Then delete.

---

## What happens after (Brad handles)

No further owner action needed.

### Step 1: Test in `#slop-testing`

- Send a test webhook message to confirm it posts correctly
- Mention @Slop in the channel to confirm the bot responds
- Trigger a test ingestion to verify the full pipeline

### Step 2: Switch to live channels

- Update the webhook URLs to point at the real announcement and discussion channels
- Redeploy the hub (Vercel) and the bot service (Railway)

### Step 3: Cleanup

- Delete the `#slop-testing` channel
- No permissions to revoke — the owner never granted any

---

## Done =

- [ ] Bot invited to server
- [ ] Announcement webhook created and URL received
- [ ] Yap webhook created and URL received
- [ ] Test channel created with webhook
- [ ] Test webhook post works
- [ ] @Slop responds in test channel
- [ ] `/join` works in test channel and creates a member node
- [ ] Member follow-up interactions update notes/interests/edges
- [ ] Full ingestion pipeline posts announcement + yap
- [ ] Webhook URLs swapped to live channels
- [ ] Vercel + Railway redeployed with live env vars
- [ ] Test channel deleted
- [ ] First real content ingestion posts correctly

---

## Completion Notes (2026-02-27)

- Slop is MCP-first for graph operations.
- Member nodes are live (`node_type = 'member'`, dimension `member`).
- `/join` is live.
- Post-response member memory updates are live (notes + metadata + member→content edges).
