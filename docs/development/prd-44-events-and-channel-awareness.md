# PRD 44: Events Polish + Bot Channel Awareness

**Status:** Draft | **Created:** 2026-03-10

## 1. Background

**Paper Club events (Step 1):** The Paper Club category view doesn't show upcoming events even though the Events calendar does. The sort+limit logic excludes future-dated nodes when there are many past ones. The upcoming events section also needs a visual polish pass — make it look clean and inviting so users actually want to click into upcoming events.

**Bot channel awareness (Steps 2–3):** Slop has strong per-member awareness (profile, interests, interaction preferences) but zero awareness of *where* it's talking. It doesn't know whether it's in `#paper-club`, `#general`, or a DM — every conversation gets the same context. Channel awareness lets Slop naturally adapt its tone, scope, and assumptions based on the channel it's responding in.

**Bot event linking + member tagging (Steps 4–5):** When Slop mentions an upcoming event in Discord, it should link back to the hub so users can see the event details. Slop should also be able to @-tag members in Discord when contextually appropriate (e.g., "this paper might interest @alice") — but only when it has the member's Discord handle.

### What exists today (bot context)

**Member awareness (working):**
- `[MEMBER CONTEXT]` block injected into system prompt per interaction
- Includes name, role, company, location, interests, interaction preference
- Updated after each interaction via `<profile>` block parsing

**Channel awareness (missing):**
- `ALLOWED_CHANNEL_IDS` env var gates which channels Slop responds in — but the bot doesn't know the *names* or *purposes* of those channels
- `discord_channel_id` is logged in the `chats` table metadata — but not used at runtime
- No channel name, topic, or category information reaches the system prompt

### Key insight

discord.js caches channel metadata automatically via gateway events. Reading `channel.name`, `channel.topic`, and `channel.parent?.name` is free — no API call, no rate limit. This is a low-cost, high-value addition to the system prompt.

### Repos involved

| Repo | What changes |
|------|-------------|
| `latent-space-hub` | Step 1: event sort fix, upcoming events UI polish |
| `latent-space-bots` | Steps 2–5: channel context, metadata logging, event deep links, member tagging |

## 2. Plan

1. Fix Paper Club not showing upcoming events — resolve sort+limit exclusion, polish upcoming-events UI, ensure actual upcoming events are manually updated/added for review
2. Build `formatChannelContext()` and inject `[CHANNEL CONTEXT]` into Slop's system prompt (`latent-space-bots`)
3. Log channel name/category in chat metadata (`latent-space-bots`)
4. Add hub deep links for events — when Slop references an upcoming event, include a clickable link to the hub's event view (`latent-space-bots`)
5. Add member tagging — Slop can @-mention members in Discord when contextually appropriate, using `discord_handle` from member metadata (`latent-space-bots`)

## 3. Implementation Details

### Step 1: Fix Paper Club Upcoming Events

**Problem:** Clicking "Paper Club" in the sidebar shows only past paper clubs. The "Events" calendar view shows upcoming paper clubs at the top. Users expect to see upcoming paper clubs in the Paper Club category view.

**Root cause:** The `TypeNodeList` component (inline in ThreePanelLayout.tsx) fetches:
```
/api/nodes?type=paper-club&limit=100&sortBy=event_date
```

The API sorts `event_date DESC NULLS LAST`. With limit=100, if there are many past paper clubs, the 100-item window may not include future-dated ones. The client-side upcoming/past split then has no upcoming nodes to display.

Meanwhile, `EventsCalendarPane` fetches with `limit=200` and does its own client-side date filtering, so it catches upcoming events.

**Fix — two changes:**

1. **API-level:** In `src/services/database/nodes.ts`, when `sortBy=event_date`, use a smarter sort that puts upcoming events first:
   ```sql
   ORDER BY
     CASE WHEN n.event_date >= date('now') THEN 0 ELSE 1 END,
     CASE WHEN n.event_date >= date('now') THEN n.event_date END ASC,
     CASE WHEN n.event_date < date('now') THEN n.event_date END DESC
   ```
   This puts upcoming events first (sorted ASC by date), then past events (sorted DESC by date). With limit=100, upcoming events are guaranteed to appear.

2. **Client-level:** In the `TypeNodeList` component (ThreePanelLayout.tsx lines 114-139), verify the upcoming/past split logic works for `paper-club` type:
   - Currently checks `(n.event_date || '') >= today` for upcoming
   - This should work correctly once the API returns upcoming events in the result set
   - Confirm `hasEventSections` is true for `paper-club` type (it should be — line 110 checks `['event', 'paper-club', 'builders-club']`)

3. **UI-level (upcoming events polish):**
   - Make upcoming events visually prominent and inviting — they should look like something you want to click
   - Give upcoming event cards more presence than past events: slightly larger, clearer date/time display, maybe a subtle accent border or background tint using the LS purple
   - Show event date formatted cleanly (e.g., "Tue Mar 18 · 2:00 PM ET") — not raw ISO strings
   - Add a clear countdown or relative time hint (e.g., "in 3 days") for events within the next 2 weeks
   - Keep past events visually quieter — muted styling, collapsed or secondary section
   - Empty-state for upcoming: friendly message like "No upcoming events scheduled" rather than just blank
   - Don't overhaul the layout — this is a polish pass on the existing card/list components, not a redesign

4. **Data-level (actual upcoming events):**
   - Manually review Paper Club event nodes and correct inaccurate/missing future `event_date`, title, and URL metadata
   - Manually add any known upcoming Paper Club events that are missing so the list is immediately useful
   - Verify the upcoming section reflects real scheduled events and is ready for review/use

**Files:**
- `src/services/database/nodes.ts` — Fix `event_date` sort order
- `src/components/layout/ThreePanelLayout.tsx` (or `AppLayout.tsx` after PRD-36) — Verify client-side upcoming/past split includes `paper-club`
- Database content via tools/admin workflow — update/add real upcoming Paper Club event nodes

### Step 2: Bot Channel Awareness (`latent-space-bots`)

**Build `formatChannelContext()`**

**File:** `latent-space-bots/src/context/channel.ts` (new file, or inline in existing system prompt module)

Read from the discord.js channel object (already available on every `message` event):

```typescript
interface ChannelContext {
  channelName: string;        // channel.name (e.g. "paper-club")
  channelTopic: string | null; // channel.topic (admin-set description)
  categoryName: string | null;  // channel.parent?.name (e.g. "Community")
  isDM: boolean;               // channel.isDMBased()
  isThread: boolean;           // channel.isThread()
  parentChannelName?: string;  // for threads: the parent channel name
}

function formatChannelContext(channel: TextChannel | DMChannel | ThreadChannel): string {
  if (channel.isDMBased()) {
    return "[CHANNEL CONTEXT]\nThis is a direct message. Conversation is private.";
  }

  const lines = ["[CHANNEL CONTEXT]"];
  lines.push(`Channel: #${channel.name}`);

  if (channel.parent?.name) {
    lines.push(`Category: ${channel.parent.name}`);
  }

  if (channel.isThread() && channel.parent) {
    lines.push(`Thread in: #${channel.parent.name}`);
  }

  // Prefer static override, fall back to Discord topic
  const purpose = CHANNEL_PURPOSES[channel.id] ?? channel.topic;
  if (purpose) {
    lines.push(`Purpose: ${purpose}`);
  }

  return lines.join("\n");
}
```

**Cost:** ~100-200 chars added to system prompt. Negligible token impact.

**All data comes from the discord.js cache** — no API calls, no rate limits, always fresh via gateway events.

**Optional static channel-purpose map:**

```typescript
// Static overrides for channels where Discord topic is empty or insufficient.
const CHANNEL_PURPOSES: Record<string, string> = {
  // Only add entries for channels that need richer context than their Discord topic provides.
};
```

**Inject into `buildSystemPrompt()`:**

Add `channelContext` as a new parameter. Channel context goes *before* skills and member context — gives the model a "where am I?" frame before "what can I do?" and "who am I talking to?"

```
[IDENTITY]         ~400-600 chars
[RULES]            ~200 chars
[CHANNEL CONTEXT]  ~100-200 chars  ← NEW
[SKILLS]           ~700 chars
[MEMBER CONTEXT]   ~400 chars
```

**Pass channel to response functions:**

```typescript
const channelContext = formatChannelContext(message.channel);
const systemPrompt = buildSystemPrompt({ skillsContext, memberContext, channelContext });
```

### Step 3: Log Channel Info in Chat Metadata (`latent-space-bots`)

Update chat logging to include channel name and category alongside the existing `discord_channel_id`:

```typescript
metadata: {
  ...existingMetadata,
  channel_name: message.channel.name ?? "DM",
  channel_category: message.channel.parent?.name ?? null,
}
```

Makes the evals dashboard more useful — filter/group interactions by channel.

### Step 4: Hub Deep Links for Events (`latent-space-bots`)

When Slop references an upcoming event in a Discord response, it should include a clickable link back to the hub so the user can see event details, the paper, linked recordings, etc.

**Link format:** `{NEXT_PUBLIC_APP_URL}/?type=paper-club` (or the specific event type) — this opens the hub directly to the Paper Club category view where upcoming events are displayed at the top (after Step 1 fix).

**Implementation:**
- Add `HUB_URL` env var to the bots repo (the deployed hub URL, e.g. `https://latentspacehub.vercel.app`)
- When Slop's response mentions a specific upcoming event, append the hub link — e.g., "The next Paper Club is **Tuesday Mar 18** — [view on the hub]({HUB_URL}/?type=paper-club)"
- This can be done via a system prompt instruction in the `[RULES]` or `[CHANNEL CONTEXT]` block: tell the model to include the hub link when referencing upcoming events
- No need for per-node deep links yet — linking to the category view is sufficient since upcoming events will be at the top

**System prompt addition:**
```
When you reference an upcoming event, include a link to the hub: [view on the hub](${HUB_URL}/?type=paper-club)
```

### Step 5: Member Tagging in Discord (`latent-space-bots`)

Slop should be able to @-mention members in Discord when it's contextually appropriate — e.g., "this paper might interest @alice" or "hey @bob, you asked about this topic last week."

**How Discord mentions work:**
- Discord mentions use the format `<@USER_ID>` (not `@username`)
- The bot needs the member's Discord user ID, which is already stored in member metadata as `discord_id` (via `MemberMetadata.discord_id` in the hub schema)

**Implementation:**
- In the `[MEMBER CONTEXT]` block (already injected per interaction), add a line: `Discord mention: <@{discord_id}>` so the model can use it in responses
- Add a system prompt rule: "You can @-mention members using their Discord mention format when it's natural and helpful — e.g., recommending content to someone, referencing a previous conversation, or inviting someone to an event. Don't over-tag. Never tag people in DMs."
- The model already has member profiles from the members table — this just makes the mention syntax available
- For tagging *other* members (not the current speaker), Slop would need to query members by interest/topic. This is already possible via the existing tools — no new tool needed, just a prompt instruction that it can look up members and tag them

**Guard rails:**
- Only tag members whose `discord_id` is known (skip if null/missing)
- Don't tag in DMs (redundant — you're already talking to them)
- Don't mass-tag — limit to 1-2 mentions per response max
- Let the model decide when tagging is appropriate — no forced tagging

### Behavioral expectations (channel awareness)

| Channel type | Expected Slop behavior |
|-------------|----------------------|
| `#paper-club` | Technical, references papers, uses academic framing |
| `#general` / `#yap` | Lighter tone, casual, shorter responses |
| `#slop-testing` | Meta-aware it's being tested, can be more experimental |
| DM | Private, more personal, can reference member's full history |
| Thread | Aware of parent channel context, stays on-topic |
| Unknown channel (no topic, no static map) | Falls back to default behavior — no channel block injected |

## 4. Open Questions / Notes

- **Events sort change:** The new sort order affects ALL types that use `sortBy=event_date`, not just paper-club. Verify this doesn't break anything for other event-like types (builders-club, event). It shouldn't — showing upcoming first is the right default for all event types.
- **Limit:** Consider bumping the TypeNodeList fetch limit from 100 to 200 for event-like types as a safety net.
- **Thread depth:** Should Slop be aware of thread title in addition to parent channel? (Probably yes — `channel.name` for threads is the thread title.)
- **Channel list awareness:** Should Slop know about *other* channels it has access to? (e.g., "You might want to ask this in #paper-club.") Follow-up feature, not in scope here.
- **Prompt injection via channel topics:** Channel topics are admin-authored, so low risk in a private server. If Slop moves to public servers, sanitize topic content before injection.

## 5. Non-goals

- Changing how `ALLOWED_CHANNEL_IDS` works (gating stays the same)
- Adding channel nodes to the wiki-base graph (separate feature)
- Cross-channel awareness ("what's happening in #general right now")
- Role-based context (member's Discord roles/permissions)
- Server-wide stats or presence awareness

---

## Step 1 COMPLETED

**Date:** 2026-03-10

**What was delivered (hub-side, Step 1 only):**

- **Event sort fix:** Changed `sortBy=event_date` SQL to put upcoming events first (ASC), then past events (DESC). Upcoming events are now guaranteed to appear within the fetch limit.
- **Fetch limit bump:** Event-like types (event, paper-club, builders-club, podcast) now fetch 200 nodes instead of 100.
- **Upcoming events UI polish:**
  - Purple accent styling (LS purple `#8b5cf6`) replacing green for upcoming events — border-left, section header dot, badge, date, presenter text
  - Clean date formatting for upcoming events: "Tue, Mar 18" instead of "Mar 18, 2026"
  - Countdown hints: "today", "tomorrow", "in 3 days" badges for events within 2 weeks
  - "No upcoming events scheduled" empty state when no future events exist
  - Upcoming section always renders (not hidden when empty)

**Steps 2–5 remain:** Bot channel awareness, metadata logging, event deep links, member tagging — all in `latent-space-bots` repo.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
