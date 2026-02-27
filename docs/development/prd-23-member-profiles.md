# PRD-23: Member Profiles — Avatars + profile display in the hub

**Status:** ready
**Type:** feature
**Priority:** high
**Repos:** `latent-space-hub` + `latent-space-bots`

---

## Goal

When you open a member node in the hub, you should see their face, their role, their interests — not a generic notes view. And avatars should pull automatically from Discord, zero friction.

---

## Current State

### What's stored (metadata JSON on member nodes)

```json
{
  "discord_id": "483934839448535063",
  "discord_handle": "beeradley",
  "joined_at": "2026-02-27T01:41:46.361Z",
  "last_active": "2026-02-27T07:06:31Z",
  "interaction_count": 23,
  "role": null,
  "company": null,
  "location": null,
  "interests": ["details"]
}
```

### What's displayed

Nothing member-specific. FocusPanel renders the same generic view (title, description, notes, edges) for every node type. The metadata blob exists but is invisible.

### What's missing

1. **No avatar** — Discord profile pictures are available via `user.avatarURL()` but never captured
2. **No profile card** — metadata fields (role, company, location, interests, stats) aren't rendered
3. **No avatar_url in metadata** — the field doesn't exist yet

---

## Part 1: Capture Discord avatar URL (latent-space-bots)

### How Discord avatars work

Discord.js exposes `user.avatarURL({ size: 256, extension: 'png' })` which returns a CDN URL:
```
https://cdn.discordapp.com/avatars/{user_id}/{hash}.png?size=256
```

- **Free hosting** — Discord CDN, no storage costs
- **Always up to date** — URL includes a hash that changes when avatar changes
- **Fallback** — `user.displayAvatarURL()` returns the default Discord avatar if none is set

### Changes

**1. `src/index.ts` — `createMemberNodeFromUser()`**

Add `avatar_url` to the metadata payload on `/join`:

```typescript
metadata: {
  discord_id: user.id,
  discord_handle: user.username,
  avatar_url: user.displayAvatarURL({ size: 256, extension: 'png' }),
  joined_at: new Date().toISOString(),
  interaction_count: 0,
  interests: []
}
```

**2. `src/index.ts` — `updateMemberAfterInteraction()`**

Refresh the avatar URL on every interaction (catches avatar changes):

```typescript
// In the metadata update, add:
avatar_url: message.author.displayAvatarURL({ size: 256, extension: 'png' })
```

This is already in the non-blocking post-response flow, so no latency impact.

**3. `src/mcpGraphClient.ts`**

No changes needed — `updateMemberNode()` already accepts arbitrary metadata fields.

### Backfill existing members

One-time: query all member nodes, look up their Discord avatar URLs, update metadata. Can be a simple script or manual MCP call per member.

---

## Part 2: Member profile card in FocusPanel (latent-space-hub)

### What to show

When `node_type === 'member'` and metadata exists, render a profile card above the notes/desc/source tabs:

```
┌─────────────────────────────────────────┐
│  [Avatar]  brad w morris                │
│            @beeradley                   │
│            ML Engineer at Anthropic     │
│            Sydney, AU                   │
│                                         │
│  Interests: rag · agents · local-first  │
│                                         │
│  ── Stats ──────────────────────────── │
│  Joined: Feb 27, 2026                  │
│  Last active: 2 hours ago              │
│  Interactions: 23                       │
└─────────────────────────────────────────┘
```

### File: `src/components/focus/FocusPanel.tsx`

Add a `MemberProfileCard` section that renders conditionally:

```typescript
// After the title/badge header, before the content tabs:
{currentNode?.node_type === 'member' && currentNode.metadata && (
  <MemberProfileCard metadata={currentNode.metadata} />
)}
```

**MemberProfileCard renders:**

1. **Avatar** — `<img>` with `metadata.avatar_url`, circular crop, fallback to a generic user icon
2. **Discord handle** — `@{metadata.discord_handle}` in muted text
3. **Role + Company** — `{role} at {company}` (skip if null)
4. **Location** — below role line (skip if null)
5. **Interests** — render as small chips/tags (like dimension tags)
6. **Stats row** — joined date (formatted), last active (relative time), interaction count

Style: dark card matching existing hub aesthetic. Compact — shouldn't take more than ~120px height.

### Graceful handling of empty fields

Most member profiles will start with nulls for role/company/location (these fill in over time as Sonnet extracts them from conversation). The card should:
- Only show fields that have values
- When everything is null except discord_handle + joined_at, show a minimal card
- Never show "null" or empty labels

---

## Part 3: MemberMetadata type update (latent-space-hub)

### File: `src/types/database.ts`

Add `avatar_url` to MemberMetadata:

```typescript
export interface MemberMetadata {
  discord_id: string;
  discord_handle: string;
  avatar_url?: string;          // Discord CDN URL
  joined_at: string;
  last_active?: string;
  interaction_count?: number;
  interests?: string[];
  role?: string;
  company?: string;
  location?: string;
}
```

---

## Implementation order

| Step | Repo | What | Effort |
|------|------|------|--------|
| 1 | latent-space-bots | Add `avatar_url` capture to `/join` + post-interaction update | 15 min |
| 2 | latent-space-hub | Add `avatar_url` to MemberMetadata type | 5 min |
| 3 | latent-space-hub | Build MemberProfileCard component in FocusPanel | 45 min |
| 4 | latent-space-bots | Backfill avatar URLs for existing member nodes | 15 min |
| 5 | both | Test end-to-end: /join → see avatar + profile in hub | 15 min |

---

## Why NOT custom image uploads

Considered and rejected for now:

| Option | Complexity | Verdict |
|--------|-----------|---------|
| Discord avatar URL (this PRD) | Near-zero — CDN URL in metadata | **Do this** |
| Upload via Discord message attachment | Medium — download, store in R2/S3, manage lifecycle | Overkill |
| Upload via hub web UI | High — file upload API, blob storage, auth | Overkill |
| Base64 in DB | Bad — bloats SQLite, slow queries | No |

Discord avatars are free, always current, and require zero infrastructure. If members want custom images later, that's a separate PRD.

---

## Verification

1. New `/join` creates member node with `avatar_url` in metadata
2. Existing members get avatar_url on next interaction (refresh)
3. Opening a member node in the hub shows the profile card with avatar
4. Profile card handles null fields gracefully (no "null" text)
5. Interests render as chips
6. Stats show joined date, last active (relative), interaction count
7. Avatar falls back to generic icon when URL is missing/broken

---

## Future (out of scope)

- Custom image upload (Discord attachment or web UI)
- `/profile` slash command to view/edit your profile
- Community members page on the web app
- Member search/filter by interests
- Editable profile fields from the hub UI
