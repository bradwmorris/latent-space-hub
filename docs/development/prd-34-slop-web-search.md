# PRD 34: Slop Web Search Capabilities

**Status:** Draft | **Created:** 2026-03-08

## 1. Background

Give Slop the ability to search the web when the wiki-base doesn't have the answer. When a user asks about something not in the graph — or when grounding/recency matters — Slop should autonomously decide to search the web, synthesize results, and respond with citations. The hub already has a Tavily-based `webSearch` tool; the main work is exposing it to Slop and teaching it when to use it.

## 2. Options Analysis

### Option A: Expose existing Tavily `webSearch` via MCP (Recommended)

**What:** Add the existing `webSearch` tool (`src/tools/other/webSearch.ts`) as a 10th MCP tool available to Slop (`ls_web_search`).

**Pros:**
- Tool already exists and works — minimal new code
- Slop controls when to search (agentic decision via tool calling)
- Consistent with existing MCP tool pattern
- Works regardless of LLM provider (OpenRouter, direct Anthropic, etc.)
- Tavily is purpose-built for LLM consumption — returns clean, structured results with answer synthesis
- Already has `TAVILY_API_KEY` in the environment

**Cons:**
- Tavily costs (~$0.005/search on basic, ~$0.01 on advanced)
- Extra latency per search (~1-2s)
- Tavily was acquired by Nebius (Feb 2026) — monitor for API changes

**Pricing:** Tavily free tier = 1,000 searches/month. Paid plans start ~$50/month for 5,000 searches. More than enough for a Discord bot.

### Option B: OpenRouter Native Web Search Plugin

**What:** OpenRouter has a built-in [web search plugin](https://openrouter.ai/docs/guides/features/plugins/web-search) that uses Anthropic's native web search for Claude models. Enable it in the API request.

**Pros:**
- Zero new tools — just a flag in the API call
- Uses Anthropic's native search engine (high quality)
- No separate API key needed

**Cons:**
- Less control — search happens at the provider level, not as an agentic tool call
- Slop can't decide *when* to search; it either always searches or never does (per-request toggle)
- Harder to show "which tools were used" in the response footer
- Ties search capability to OpenRouter specifically
- Additional per-request cost from OpenRouter

### Option C: Anthropic Native Web Search (Direct API)

**What:** Use Anthropic's server-side `web_search_20260209` tool directly via the Messages API.

**Pros:**
- Native integration, highest quality results
- Server-side execution (Anthropic handles the search loop)
- Supports dynamic filtering with Claude 4.6 models

**Cons:**
- Requires direct Anthropic API access (Slop currently uses OpenRouter)
- Would need to bypass OpenRouter or run a hybrid setup
- Server-side tool pattern is different from existing MCP client-side tools
- More complex integration

### Option D: Alternative Search Providers

Other providers worth noting for future consideration:
- **Exa.ai** — Semantic search, scores 81% vs Tavily's 71% on complex retrieval. Better for nuanced queries. ~$0.003/search.
- **Brave Search API** — Privacy-first, independent index (not Bing-dependent). Free tier available.
- **Perplexity Sonar API** — Returns synthesized answers with citations. $5/1,000 requests.

### Recommendation

**Option A (Tavily MCP tool)** is the clear winner:
1. The tool already exists — this is primarily a wiring task
2. Agentic control means Slop decides when to search (wiki-base first, web fallback)
3. Provider-agnostic — works if we switch from OpenRouter to direct Anthropic later
4. Consistent with the existing 9-tool MCP pattern

If Tavily quality or pricing becomes an issue, swapping to Exa or Brave is a one-file change (`webSearch.ts`).

## 3. Plan

1. Expose `webSearch` as MCP tool (`ls_web_search`)
2. Add `TAVILY_API_KEY` to bot environment
3. Update Slop's system message to include web search in tool index + usage guidance
4. Add a `web-search` skill with detailed search behavior rules
5. Test end-to-end in Discord

## 4. Implementation Details

### Step 1: Add `ls_web_search` to MCP server

**Files to change:**
- `apps/mcp-server/server.js` — Add `ls_web_search` tool definition
- `apps/mcp-server-standalone/src/server.js` — Same for standalone

**Tool definition:**
```javascript
{
  name: 'ls_web_search',
  description: 'Search the web for current information. Use when the wiki-base lacks the answer or when recency matters.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results (1-10, default 5)', minimum: 1, maximum: 10 }
    },
    required: ['query']
  }
}
```

**Handler:** Call the existing `/api/tools/web-search` endpoint (or replicate the Tavily fetch directly — it's 20 lines).

### Step 2: Add Tavily key to bot environment

**In `latent-space-bots` repo:**
- Add `TAVILY_API_KEY` to `.env` / deployment config
- The MCP server needs access to this key — either pass it through or ensure the hub's API route handles it

**Decision point:** Does the bot call the MCP server (which calls the hub API), or does the MCP server call Tavily directly?
- **Recommended:** MCP server calls Tavily directly (same as `webSearch.ts` pattern). Avoids an extra hop. The key lives in the hub's environment where the MCP server runs.

### Step 3: Update Slop system message

**File:** `latent-space-bots` repo — wherever the system message is constructed (references `slop-bot.md` config)

Add to the `[SKILLS]` index in the system prompt:
```
- web-search: When to search the web vs use the wiki-base
```

Add `ls_web_search` to the tool list (currently 9 tools → becomes 10):
```
10. `ls_web_search` — search the web for current information
```

### Step 4: Create `web-search` skill

**File:** `src/config/skills/web-search.md`

```markdown
---
name: Web Search
description: When and how to use web search vs wiki-base
when_to_use: When deciding whether to search the web or use the wiki-base
---

# Web Search

## When to search the web

Use `ls_web_search` when:
- The wiki-base search returns no relevant results
- The user asks about something recent (news, releases, events)
- The user explicitly asks you to "look up" or "search for" something
- You need to verify or ground a claim with a current source
- The topic is outside the Latent Space community's typical coverage

Do NOT search the web when:
- The wiki-base has a clear answer
- The question is about Latent Space community content (episodes, papers, members)
- The user is asking about internal community operations

## Search behavior

1. **Knowledge graph first** — always try `ls_search_nodes` or `ls_search_content` before web search
2. **Targeted queries** — write specific search queries, not vague ones
3. **Cite sources** — always include URLs from search results in your response
4. **Synthesize** — don't dump raw results; summarize and connect to the user's question
5. **Recency signal** — if results have `published_date`, mention how recent they are

## Citation format

When citing web results:
> According to [Source Title](url), ...

Or inline: "... this was announced in March 2026 ([source](url))."
```

### Step 5: Test in Discord

Test cases:
1. **Knowledge graph hit** — "What did Swyx say about agents?" → should use graph, not web
2. **Knowledge graph miss** — "What's the latest PyTorch release?" → should fall back to web search
3. **Explicit search request** — "Search the web for MCP specification updates" → should use web search
4. **Ambiguous** — "What is Flash Attention 3?" → should try graph first, then web if no results
5. **Rate limiting** — Verify Tavily free tier limits aren't hit in normal usage

## 5. Open Questions / Notes

- **Tavily tier:** Free tier (1,000/month) may be sufficient for Discord bot usage. Monitor and upgrade if needed.
- **Search depth:** Start with `basic` (faster, cheaper). Consider `advanced` for `/tldr` deep-dive queries.
- **Caching:** Should we cache web search results to avoid duplicate searches? Probably not worth it initially — queries are rarely identical.
- **Tavily acquisition:** Nebius acquired Tavily in Feb 2026. Watch for API changes, pricing shifts, or deprecation signals. Exa is the best fallback.
- **Bot repo changes:** The bot lives in `latent-space-bots` (separate repo). Steps 2-3 require changes there. Steps 1, 4 are in this repo.
- **OpenRouter web search:** Keep Option B in back pocket. If OpenRouter improves their plugin control (per-message toggle, tool-call visibility), it could replace Tavily with zero maintenance.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
