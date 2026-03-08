# PRD 28: Builders Club Presentation Prep

**Status:** Draft | **Created:** 2026-03-07

## 1. Background

Brad is presenting at a Latent Space Builders Club session. The presentation has two halves: (1) Brad shares two key ideas he's been developing, then (2) the room goes interactive — everyone gets hands-on with the bot and the hub. By presentation time, Brad should have already published a "There Is Only the Context Window" article.

**Pre-requisite:** Publish the article before the session. (Check personal_content backlog for the draft task — may need to create one if it doesn't exist yet.)

## 2. Presentation Structure

### Part 1: Brad Talks (~10 min)

#### 1a. The DB vs Markdown Debate (~5 min)

**Context:** Brad published a YouTube video arguing SQLite > Markdown for agent-era knowledge management. Got roasted on Reddit. Also sparked a real debate in the Builders Club Discord — someone presented a Beads-like workflow (Steve Yegge's system) where everything was stored in Markdown, and a SQLite vs Markdown chat debate kicked off.

**Talking points:**

- "I made a video saying Obsidian and Markdown won't survive the agent era. Reddit had opinions."
- The actual argument: Markdown is a pile of papers. SQLite is a filing cabinet with labelled tabs. LLMs speak fluent SQL — it's everywhere in their training data.
- What the Reddit crowd got wrong: they heard "your notes app is bad" when the point was "if agents are your primary interface now, build for agents"
- What the Reddit crowd got right: portability matters, plain files are universal, not everyone needs agent-traversable structure
- The real spectrum: Markdown --> SQLite --> Graph DB (Neo4j). SQLite is the pragmatic middle ground. Even Steve Yegge's Beads started with 605 markdown plan files, called it a "colossal design mistake", and moved to JSONL + SQLite cache.
- Where Brad landed: local SQLite with explicit edges. Not as complex as Neo4j, more structured than vanilla markdown. RA-H is the implementation of that thesis.
- Tie it to what this room already knows — the Builders Club debate was essentially the same question

#### 1b. There Is Only the Context Window (~5 min)

**Context:** Brad's article (should be published by now). Core thesis: everything that matters in AI interaction comes down to what's in the context window. Not the model. Not the prompt template. The context.

**Talking points:**

- The article's core claim: all the magic (and all the failure) happens in context engineering — what you put in the window
- Context engineering > prompt engineering. Prompts are static. Context is dynamic, structured, curated.
- This is what RA-H does: it's a context layer. It doesn't replace the model — it feeds the model the right information at the right time.
- This is what the Latent Space Hub does: 3,900+ nodes of structured content that any agent can traverse via MCP. The bot doesn't hallucinate about episodes because the context window contains the actual content.
- The shift: from "how do I write a better prompt" to "how do I build a system that assembles the right context"
- Direct connection to swyx's context engineering framing — "the delicate art and science of filling the context window with just the right information for the next step"

### Part 2: Interactive (~15-20 min)

The whole point is to get the room doing things, not watching. Brad facilitates, Slop performs.

#### 2a. Talk to the Bot

**Pre-req:** Slop bot is live in the LS Discord server (setup-handover task must be complete).

- "Everyone open Discord. Find Slop. Ask it something about Latent Space."
- Let people explore naturally — ask about episodes, guests, topics
- Brad can seed a few prompts if the room is quiet:
  - "Ask Slop what swyx thinks about context engineering"
  - "Ask it to summarize the most recent podcast"
  - "Ask it something obscure — see if it finds it or admits it doesn't know"
- Show that the bot cites sources, links back to the graph, doesn't hallucinate

#### 2b. Add Yourself to the Graph

**Pre-req:** `/join` slash command works, member nodes are functional (member-nodes task).

- "Type `/join` in Discord. You're now a node in the wiki-base."
- Walk through what happens: Slop creates a member node, captures your Discord identity, starts learning about you
- "Now tell Slop what you're working on. What you're interested in. What you've contributed to Latent Space."
- The bot updates your member node — interests, role, notes from the conversation
- "Next time you talk to Slop, it already knows who you are. It remembers."

#### 2c. See Yourself in the Hub

**Pre-req:** Hub is live at production URL, member nodes display in the UI.

- "Now open the hub" — share the URL
- "Find yourself. You're in the graph now."
- Show: your member node, the edges connecting you to topics/episodes you mentioned, the interaction history
- If member-profiles (PRD 23) is done: show the profile card with Discord avatar
- Let people browse — explore the graph, see how their interests connect to content, find other members
- "This is what a wiki-base looks like when it's alive — it grows with every interaction"

## 3. Pre-Presentation Checklist

**Must be done before presenting:**

- [ ] "There Is Only the Context Window" article published on bradwmorris.com
- [ ] Slop bot live in LS Discord (setup-handover complete)
- [ ] `/join` command works (member-nodes complete)
- [ ] `/tldr` command works
- [ ] Hub loads at production URL
- [ ] Member nodes display correctly in hub UI
- [ ] Brad has tested the full interactive flow himself: /join, chat, see node in hub
- [ ] Dark mode looks good (likely demo mode)

**Nice to have:**

- [ ] Member profile cards with avatars (PRD 23)
- [ ] `/style` command works (PRD 30)
- [ ] Eval dashboard showing live interaction traces
- [ ] Source reader opens for a podcast episode demo

## 4. Fallback Plan

If the bot isn't in the LS server yet:
- Brad's test Discord server is still live (https://discord.gg/Da4bpjuwFM)
- Invite the room to join the test server for the interactive portion
- Less ideal but still works

If the hub is down:
- Screenshots of the dashboard, graph view, member nodes
- Architecture diagram exists: `public/latent-space-hub-architecture.tldr`

If nobody engages:
- Brad demos the flow himself — /join, chat, show the node appearing in real-time
- Have 2-3 pre-prepared questions that show off the bot's best capabilities

## 5. Numbers to Know

- ~3,900 nodes, ~7,500 edges, ~35,800 embedded chunks
- Coverage: June 2023 to present, hourly updates
- 8 content categories: Podcast, Guest, Article, Entity, Builders Club, Paper Club, Workshop, AI News
- 18 MCP tools available via standard protocol
- Bot uses Claude Sonnet 4.6 with 5-round tool-calling loop
- Architecture: Turso (cloud SQLite) + Vercel + Railway + MCP

## 6. Key Files

| File | Action |
|------|--------|
| This PRD | Reference during prep |
| `docs/presentation/` | Create if needed for slides/assets |
| Personal content backlog | Check for "context window" article task |

## 7. Dependencies

| What | Status | Blocks |
|------|--------|--------|
| Article: "There Is Only the Context Window" | Not yet written | Part 1b of presentation |
| setup-handover (PRD 17) | Ready | Interactive portion (bot in LS server) |
| member-nodes (PRD 19) | Ready | /join flow |
| member-profiles (PRD 23) | Ready | Nice-to-have for profile cards |

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
