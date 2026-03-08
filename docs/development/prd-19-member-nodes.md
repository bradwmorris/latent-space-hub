# PRD-19: Member Nodes — Community members in the wiki-base

**Status:** completed
**Type:** feature
**Priority:** high
**Repos:** `latent-space-hub` + `latent-space-bots`
**Completed:** 2026-02-27

---

## Goal

Add community members as first-class nodes in the wiki-base. When someone interacts with Slop in Discord, the bot recognizes them, remembers their interests, and connects them to relevant content — compounding knowledge about each member over time.

---

## What this enables

- **Personalized responses** — Slop knows what you care about and references past conversations
- **Member ↔ content edges** — "Alice is interested in RAG" becomes a graph relationship, not ephemeral chat
- **Community intelligence** — "What does the LS community care about?" becomes a graph query
- **Future: matchmaking, alerts, event networking** — all built on member nodes + edges

---

## Architecture (As Implemented)

### MCP-first graph interface

| Operation | Method | Why |
|-----------|--------|-----|
| **Member lookup** | MCP `ls_sqlite_query` | Single interface for bot graph access |
| **Member create** | MCP `ls_add_node` | Consistent with MCP write path |
| **Member update** | MCP `ls_update_node` | Notes append + metadata update in one call |
| **Edge create** | MCP `ls_create_edge` | Idempotency + consistent relation creation path |
| **Content retrieval** | MCP `ls_search_content` + `ls_get_nodes` + `ls_sqlite_query` | Shared retrieval surface used by bot runtime |

### Bot runtime env for MCP server process

```
LS_HUB_MCP_SERVER_PATH=/absolute/path/to/apps/mcp-server-standalone/index.js  # optional override
```

By default, the bot resolves `latent-space-hub-mcp/index.js` from npm and spawns it as a stdio MCP server process.

---

## Part 1: Add `member` node type to the hub

### Files to change (latent-space-hub)

**1. `src/types/database.ts`**

Add `'member'` to the NodeType union:
```typescript
export type NodeType =
  | 'podcast'
  | 'guest'
  | 'article'
  | 'entity'
  | 'builders-club'
  | 'paper-club'
  | 'workshop'
  | 'ainews'
  | 'hub'
  | 'member';       // Community member
```

Add MemberMetadata interface:
```typescript
export interface MemberMetadata {
  discord_id: string;
  discord_handle: string;
  joined_at: string;          // ISO timestamp — when they /join'd
  last_active?: string;       // ISO timestamp — last interaction
  interaction_count?: number;  // Total bot interactions
  interests?: string[];       // Extracted topic keywords
  role?: string;              // Self-described (e.g. "ML engineer")
  company?: string;
  location?: string;
}
```

Add to NodeMetadataMap:
```typescript
export type NodeMetadataMap = {
  // ... existing entries ...
  member: MemberMetadata;
};
```

**2. `src/config/categories.ts`**

Add import for `UserCircle` from lucide-react. Add category entry:
```typescript
{ key: 'member', label: 'Member', icon: UserCircle, sortMode: 'connected', order: 8 },
```

**3. No changes needed for:**
- `app/api/dashboard/route.ts` — members aren't "content", don't add to content count
- `app/api/cron/extract-entities/route.ts` — don't extract entities from member nodes
- `src/services/ingestion/sources.ts` — members aren't ingested from RSS
- Database schema — `node_type` is TEXT, no migration needed

### Example member node

```json
{
  "title": "Alice Chen",
  "node_type": "member",
  "description": "ML engineer interested in agents, RAG, and local-first AI. Active in Latent Space Discord since Feb 2026.",
  "notes": "[2026-02-27] Discussed RAG pipeline optimization — referenced ep. 147\n[2026-02-28] Asked about local-first AI tooling and MCP patterns",
  "metadata": {
    "discord_id": "123456789",
    "discord_handle": "alice_chen",
    "joined_at": "2026-02-27T10:00:00Z",
    "last_active": "2026-02-28T15:30:00Z",
    "interaction_count": 5,
    "interests": ["rag", "agents", "local-first", "mcp"]
  },
  "dimensions": ["member"]
}
```

### Example edges

```
Alice (member) → "interested in" → RAG (entity)
Alice (member) → "asked about"   → Ep. 147: Tool Use Deep Dive (podcast)
Alice (member) → "attended"      → Builders Club Feb 2026 (builders-club)
```

Note: `interested_in` EdgeContextType already exists in database.ts line 135.

---

## Part 2: `/join` slash command (latent-space-bots)

### Register the command

In `registerSlashCommands()`, add:
```typescript
new SlashCommandBuilder()
  .setName("join")
  .setDescription("Add yourself to the Latent Space wiki-base")
```

### Handler flow

1. User types `/join`
2. Bot defers reply
3. Check if member node already exists (`ls_sqlite_query` with `json_extract(metadata, '$.discord_id') = '<id>'`)
4. If exists: reply "You're already in the graph! I've been tracking your interests since {joined_at}."
5. If not: `ls_add_node`:
   ```json
   {
     "title": "<discord displayName>",
     "node_type": "member",
     "dimensions": ["member"],
     "metadata": {
       "discord_id": "<user.id>",
       "discord_handle": "<user.username>",
       "joined_at": "<now ISO>",
       "interaction_count": 0,
       "interests": []
     }
   }
   ```
6. Reply: "You're in the graph. As we chat, I'll learn what you're into and connect you to relevant content."

---

## Part 3: Member-aware interactions (latent-space-bots)

### On every message/interaction

**Before generating a response:**

1. Call `lookupMember(discordUserId)` via MCP (`ls_sqlite_query`)
2. If member NOT found:
   - Add to system prompt: `"[MEMBER STATUS] This user is not in the wiki-base. Mention that they can use /join to be remembered across conversations."`
   - Slop naturally weaves this in (not every time — use judgment)
3. If member found:
   - Add to system prompt: `"[MEMBER CONTEXT] Name: {title}. Interests: {metadata.interests}. Last active: {metadata.last_active}. Recent interactions: {last 3 lines of notes}. Use this to personalize your response — reference their interests, connect new content to what they've asked about before."`

**After sending the response (fire-and-forget, non-blocking):**

Only runs if member exists. Three operations (fire-and-forget, non-blocking):

1. **Append to notes:**
   ```
   [2026-02-27] <brief topic summary from user's message, 1 line>
   ```

2. **Update metadata:**
   - Bump `interaction_count`
   - Set `last_active` to now
   - Extract topic keywords from user message, add new ones to `interests` array (deduplicate)

3. **Create edges to retrieved content:**
   - Parse retrieval results for node IDs (from MCP content retrieval results)
   - For each content node the user interacted with: create `member → content` edge with explanation "showed interest in this content during a Discord conversation"
   - Duplicate edges are safely ignored by MCP/hub service path

All three operations go through MCP tools. Errors are caught and logged but never block the Discord response.

### Key functions to add to `src/index.ts`

```
lookupMember(discordId: string): Promise<MemberNode | null>
  → MCP ls_sqlite_query (node_type='member' + metadata.discord_id match)

createMemberNode(user: Discord.User): Promise<{ id: number }>
  → MCP ls_add_node (node_type='member', dimensions=['member'])

updateMemberAfterInteraction(member, userMessage, retrievalResult): Promise<void>
  → MCP ls_update_node (append notes + update metadata)
  → MCP ls_create_edge (for each content node)
```

---

## Part 4: Persona update (latent-space-bots)

Add to `personas/slop.soul.md`:

```markdown
## Member Awareness

You have access to member profiles from the wiki-base. When a member's context is provided:
- Reference their known interests naturally ("You've been digging into RAG — this episode is right up your alley")
- Connect new content to their past questions
- Don't recite their profile back — use it to be relevant

When a user is NOT in the graph:
- Mention /join casually if it fits the conversation (not every time)
- Don't make it a hard sell — just "btw, /join if you want me to remember what you're into"
```

---

## Implementation order

| Step | Repo | What | Effort |
|------|------|------|--------|
| 1 | latent-space-hub | Add `member` to NodeType, MemberMetadata, categories.ts | 15 min |
| 2 | latent-space-bots | Add `lookupMember()` + `createMemberNode()` functions | 30 min |
| 3 | latent-space-bots | Add `/join` slash command + handler | 30 min |
| 4 | latent-space-bots | Modify `handleMessage` — member lookup + system prompt injection | 30 min |
| 5 | latent-space-bots | Add `updateMemberAfterInteraction()` + wire into post-response flow | 45 min |
| 6 | latent-space-bots | Update slop.soul.md with member awareness section | 15 min |
| 7 | both | Test end-to-end: /join → chat → verify node + edges in graph | 30 min |

---

## Verification

1. `/join` creates a member node visible at `latent-space-hub.vercel.app` under the Member category
2. Subsequent Slop interactions include member context in responses (check for personalization)
3. Member node's `notes` field accumulates interaction summaries
4. Member node's `metadata.interests` grows over time
5. Edges appear between member and content nodes they asked about
6. Non-members see a casual `/join` mention (not every interaction)
7. All write failures are non-blocking — Slop always responds even if graph update fails

## Delivery Summary

Delivered in code:

- `member` node type + `MemberMetadata` in hub type system
- Member category in hub UI
- Bot `/join` command and handler
- Member-aware prompt injection on message + slash command flows
- Post-response member memory updates (notes + metadata)
- Post-response member→content edge creation
- MCP-first bot graph access (runtime calls MCP tools)
- Hub HTTP MCP tool parity additions for member/retrieval flows
- Persona update (`Member Awareness`)

---

## Future (out of scope for this PRD)

- Subscriber email ↔ discord handle linking (needs GDPR compliance)
- `/profile` command to view/edit your graph node
- Community page on the web app (browse members, interests, connections)
- Matchmaking: "You and @bob are both into local-first AI"
- Personalized content alerts: "New episode on RAG — you've been asking about this"
- AI Engineer event networking (who's attending + their interests)
- Community analytics dashboard (what topics trend, who's most active)
