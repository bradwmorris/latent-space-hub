# PRD: Paper Club Re-Engagement Loop

**Status:** Draft | **Created:** 2026-04-23

## 1. Background

Build the lowest-friction Paper Club loop that is useful enough for members to preread papers, discuss them before the session, and volunteer to present. This should help organizers see where there is real community interest and keep the presenter pipeline healthy without adding administrative overhead.

Current state:

- Slop can let users schedule themselves for Paper Club and add a paper.
- Slop sends basic reminders when a session has a presenter.
- Almost nobody is using this flow.
- This flow was inspired by another active Latent Space Discord flow: the AI in Action Builders Club channel/bot, where people can schedule Builders Club talks and the pattern is actively used.
- The direct scheduling pattern appears to work for Builders Club but has not transferred to Paper Club yet.
- There is little or no pre-session discussion.
- Organizers still need to manually encourage people to volunteer each week.

The task is not to build a full Paper Club management system. The task is to think deeply about the simplest Hub + Slop update that creates visible momentum around papers and makes volunteering feel easier, safer, and more rewarding.

## 2. Problem

Paper Club has two related gaps:

1. **Attendee gap:** Members need a reason to engage before the meeting. They need to know what is coming up, why it matters, and where to leave a lightweight signal of interest.
2. **Organizer gap:** Swyx/Vibhu need enough signal to recruit presenters and nudge quality upward without hand-managing every session.
3. **Pattern-transfer gap:** A scheduling-first bot pattern is working elsewhere in the community for Builders Club, but Paper Club likely has different activation energy. A Builders Club talk often starts from "I built something and want to show it"; a Paper Club session starts from "this paper is worth reading, discussing, and presenting well." That may require interest-building and prep support before scheduling.

The core question:

> What is the smallest product loop that turns "someone mentioned an interesting paper" into "people preread it, someone volunteers, and organizers know what to nudge next"?

## 3. High-Level Direction

### A. Make Paper Interest Visible

Capture or surface papers that people already care about, without forcing a heavy submission workflow. The value is not the database entry by itself; the value is making latent interest visible enough that others can pile on.

Possible directions:

- a "papers people are talking about" queue,
- a "needs presenter" list,
- a "next few papers worth prereading" list,
- a lightweight signal that says "I would attend / preread / maybe present this."

### B. Lower The Bar To Presenting Well

The problem is not just getting volunteers; organizers want people to be good. The product should make a first-time presenter feel like they have a path to a decent session.

Possible directions:

- Slop helps turn a paper into a simple presentation outline,
- Slop suggests discussion questions before the session,
- the Hub shows previous related Paper Club sessions or Latent Space content,
- volunteers can see "what a good Paper Club prep looks like" without needing a long guide.

### C. Create Pre-Session Discussion

Paper Club should not start cold. A tiny amount of pre-session discussion can make attendance better and make presenter recruitment easier.

Possible directions:

- Slop posts one short pre-read prompt when a paper is proposed or scheduled,
- members can reply with what they want explained,
- organizers can see which papers have actual interest,
- the eventual presenter can use those questions to prep.

### D. Give Organizers A Simple Signal Board

Swyx/Vibhu likely do not need more tooling; they need a clean answer to "what should we do next?" A simple organizer-facing view or digest could be more valuable than a complex member-facing feature.

Possible signals:

- papers with interest but no presenter,
- volunteers who expressed willingness,
- sessions scheduled without enough preread activity,
- recurring topics that keep coming up,
- papers that connect strongly to recent Latent Space episodes/articles.

### E. Learn From The Builders Club Bot Without Copying It Blindly

The AI in Action Builders Club bot is an existence proof that Discord-native scheduling can work in this community. But Paper Club may need a different front door.

Possible lessons:

- Builders Club scheduling works because the presenter often already has a concrete artifact or demo.
- Paper Club may need a shared "why this paper?" moment before someone volunteers.
- The successful part to reuse may be the Discord-native scheduling mechanics, not the product loop.
- The missing Paper Club layer may be pre-scheduling: paper discovery, interest, questions, and confidence-building.

## 4. Web Research: Discord Bot Patterns Worth Stealing

Research pass date: 2026-04-29.

The strongest pattern across mature Discord implementations is: keep the user's action inside Discord, make the action extremely small, and use the bot/backend for memory, summarization, and follow-up. The Hub should not ask Paper Club members to leave Discord before they have shown intent.

### A. Native Interactions Beat Chat Commands For Lightweight Signals

Discord's interaction model supports slash commands, buttons, select menus, and modals as first-class app interactions. Buttons and select menus attached to a bot message generate structured events just like slash commands; modals can collect freeform input after a button or command interaction. Sources: [Discord Interactions & Commands](https://docs.discord.com/developers/platform/interactions), [Discord Components & Modals](https://docs.discord.com/developers/platform/components).

Implication for Paper Club:

- Prefer buttons like "I'd read this", "I'd attend", "Maybe I can present", and "Ask a question" over asking users to remember a command.
- Use a modal only when the user has already shown intent, e.g. after clicking "Suggest paper" or "I can present".
- Treat `/paper-club` as an organizer/presenter power tool, not the primary engagement mechanism for attendees.
- Compare this directly against the AI in Action Builders Club bot: if that bot is active, identify which parts are command mechanics versus social motivation.

### B. Event Bots Optimize RSVP, Reminder, Calendar, And Admin Loops

Sesh, one of the mature Discord event bots, centers on simple event creation, RSVP, reminders, timezone handling, calendar links, polls, attendee limits, waitlists, role grants, and optional web management. Its manual also shows a useful split: anyone with channel access can RSVP in Discord, while creators/admins get edit/delete controls and an optional web interface. Sources: [sesh.fyi](https://sesh.fyi/), [sesh manual](https://sesh.fyi/manual/).

Implication for Paper Club:

- Do not rebuild a full event bot.
- Borrow the useful pieces: RSVP-like interest, optional reminders for people who opted in, and organizer controls.
- Presenter recruitment is probably not solved by more scheduling. It is more likely solved by visible interest plus low-friction "maybe I can present" signals.
- The Builders Club comparison suggests the current Paper Club issue is probably not "the command is missing"; the command exists. The missing piece is demand generation and presenter confidence.

### C. Threads And Forum Channels Are The Right Unit For Paper-Level Discussion

Discord's thread documentation frames threads as sub-conversations for organizing busy channels. Forum channels are thread-only channels where each post behaves like a thread, supports tags, and can be pinned. Sources: [Discord Threads](https://docs.discord.com/developers/topics/threads), [Discord Forum Channels FAQ](https://support.discord.com/hc/en-us/articles/6208479917079-Forum-Channels-FAQ).

Implication for Paper Club:

- A paper proposal should probably become a thread or forum post, not just a row in the Hub.
- The durable object can be "one paper, one discussion thread, one Hub record".
- Thread/forum tags can represent status at a glance: `suggested`, `needs-presenter`, `scheduled`, `presented`, `high-interest`.
- Slop's role is to seed and summarize discussion, not dominate it.

### D. Native Scheduled Events Can Provide Attendance Signal

Discord scheduled events expose user-facing RSVP/interest behavior and event links; the Gateway also emits scheduled-event create/update/delete and user add/remove events. Sources: [Discord Scheduled Events](https://support.discord.com/hc/en-us/articles/4409494125719-Scheduled-Events), [Discord Gateway Events](https://docs.discord.com/developers/events/gateway-events).

Implication for Paper Club:

- If Paper Club already uses Discord scheduled events, Slop can potentially listen to interest events instead of inventing attendance tracking.
- If Paper Club does not use native scheduled events, do not make this the first dependency; it may add admin friction.
- Native event interest is useful signal, but it does not answer "who might present?" by itself.

### E. Polls Are Good For Quick Choice, But Not Durable Workflow

Discord has native polls for lightweight voting with up to 10 answers and configurable durations, but Discord's own FAQ says polls are created through the client UI rather than slash commands. Poll-focused bots such as EasyPoll extend this with timed polls, scheduled polls, anonymous voting, role restrictions, dashboards, and close/results flows. Sources: [Discord Polls FAQ](https://support.discord.com/hc/en-us/articles/22163184112407-Polls-FAQ), [EasyPoll](https://easypoll.bot/).

Implication for Paper Club:

- Polls are useful for "which paper next?" but weak as the core system of record.
- Buttons or bot-managed reactions are better if Slop needs reliable per-user signals.
- Polls can be a weekly organizer tool, not the foundation of the whole loop.

### F. Onboarding Teaches The Same Lesson: Let People Self-Select

Discord's Community Onboarding lets members answer simple questions to get relevant roles and channels. The guidance emphasizes reducing confusion and prioritizing healthy, valuable channels for new members. Source: [Discord Community Onboarding FAQ](https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ).

Implication for Paper Club:

- A "Paper Club interested" or "maybe presenter" role may be more useful than a custom workflow if the server already uses roles well.
- The bot should not spray all members with prompts. It should engage the self-selected group.
- A role/channel opt-in can give organizers a cleaner audience for recruitment.

### G. Research On Academic/Discussion Bots Favors Facilitation Over Automation

The 2025 "Stay Ahead" paper describes a community-centered bot for academic paper recommendations; the key lesson is not the model, but that the community prioritized relevant paper recommendations after iterative feedback and polling. The 2020 CHI "Bot in the Bunch" study found facilitator bots can help group chats by managing time, encouraging more even participation, and organizing opinions. Sources: [Stay Ahead: Designing a Community-Driven, AI-Powered Bot](https://ci.acm.org/2025/wp-content/uploads/99-Nourriz.pdf), [Bot in the Bunch](https://yonsei.elsevierpure.com/en/publications/bot-in-the-bunch-facilitating-group-chat-discussion-by-improving-/).

Implication for Paper Club:

- Slop should behave less like a scheduler and more like a lightweight facilitator.
- The useful AI move is probably: recommend why a paper is worth discussing, ask one good question, summarize community questions, and help a volunteer prep.
- Recommendations should be grounded in LS Wiki-Base context and community interest, not generic "hot paper" ranking.
- For Paper Club, facilitation may need to happen before scheduling; for Builders Club, scheduling may be enough because the speaker already knows what they want to present.

## 5. Discord Channel Read: `#llm-paper-club`

Observation pass date: 2026-04-29.

Channel inspected: `https://discord.com/channels/822583790773862470/1107320650961518663`

The channel already contains much of the behavior this project wants to create. The problem is not that nobody shares papers. The problem is that paper interest, presenter confidence, Luma state, Discord threads, and organizer nudges are not tied together into one durable loop.

### A. The Channel Already Has The Right Social Objects

Members regularly post paper-adjacent links: arXiv papers, technical reports, X/Bluesky threads, GitHub projects, lab posts, and personal notes. Recent observed examples included DeepSeek V4 notes, "Learning Mechanics", "Loss of Plasticity in Neural Networks", Sakana AI's TRINITY coordinator work, Meta-Harness, and OpenAI/math-problem discussion.

Several of these posts already become Discord threads, including examples like `DeepSeek v4 Paper Highlights`, `Introduction to Meta-Harness for LLM Optimization`, `AI Solves Erdős Problems`, and `Modeling Loss of Plasticity in Neural Networks`. This validates the earlier "paper thread as the social object" idea. Slop probably does not need to invent a new discussion home. It needs to recognize, attach to, and summarize the discussion homes that already appear naturally.

Product implication:

- Treat a Discord paper post/thread as the front door for the Paper Club loop.
- Avoid making `/paper-club` the attendee-facing starting point.
- Persist links between Hub paper/session records and Discord thread IDs.
- Let the Hub become the durable archive and organizer view, while Discord remains the live conversation surface.

### B. Recruiting Is Currently Manual, Direct, And High-Context

Observed organizer behavior is very human and direct. Vibhu nudges specific people after they share or react to a paper, asks whether someone can cover a paper on Wednesday, follows up on friend-of-friend presenter leads, and clarifies that no polished slide deck is required.

This is effective because it is high-context. It is also fragile because it depends on organizers noticing the right person at the right moment.

Product implication:

- Slop should not replace the organizer ask.
- Slop should help identify who is worth nudging: the person who posted the paper, replied with insight, wrote notes, reacted strongly, or asked a useful question.
- A weekly organizer digest may be higher leverage than a member-facing scheduler because it turns scattered Discord behavior into a short list of good human nudges.

### C. There Is A Presenter Confidence Gap, Not Just A Scheduling Gap

One observed exchange is especially important: a newer member engaged with a paper, got invited to cover it, then declined softly because they wanted to attend one session first before volunteering. Vibhu reassured them that it did not require special slides, just a paper walkthrough.

That is probably the core Paper Club activation problem. People may be interested and capable, but "present this week" feels like a social and quality bar. The current command flow only helps once someone already feels ready to schedule themselves.

Product implication:

- Add a positive "maybe later / after I attend once" state instead of treating non-volunteering as a dead end.
- Make first-time presenting feel scaffolded: outline, key claims, figures/results, discussion questions, and examples of good enough prep.
- Public prompts should normalize lightweight walkthroughs without lowering quality expectations.
- Slop can support a private or semi-private ramp: "I could maybe present with help" is a useful signal even if the person is not ready to publicly claim the slot.

### D. The Strongest Local Pattern Is Named Presenter + Paper + Notes + Role Ping

The strongest observed announcement pattern was the DeepSeek V4 session. It combined:

- a named presenter,
- a concrete paper/topic,
- a Luma link,
- a request to pre-skim,
- a pointer to notes/thread context,
- an `@paper-club` ping,
- visible reaction engagement.

That post received substantially more reaction energy than ordinary paper links. This suggests members do respond when the ask is concrete and the session has a clear center of gravity.

Product implication:

- The best v1 loop may be "turn an interesting paper thread into a structured announcement" rather than "make scheduling easier."
- Slop should help assemble the announcement ingredients: paper link, presenter, why it matters, notes/pre-read link, questions, session date, and role ping.
- Reaction/interest data on that structured post can become organizer signal.

### E. The `@paper-club` Role Already Looks Like A Real Audience

The channel uses `@paper-club` pings for session-specific announcements. This matters because it means the community already has a narrower Paper Club audience than the whole server.

Product implication:

- Slop should respect and build around this audience instead of blasting broader channels.
- Buttons, reminders, and interest asks should target people who are in the Paper Club audience or have interacted with a paper thread.
- If the role membership is accessible, it may be a better opt-in primitive than inventing another subscription system.

### F. Luma/Event State Is Currently Ambiguous

The DeepSeek Luma preview had a concrete session title and presenter context, while the preview copy still contained generic volunteer boilerplate. This creates a mixed state: the event is scheduled and has a paper, but the visible copy still says "please volunteer hot paper of the week."

Product implication:

- Slop/Hub should make event state explicit: `candidate`, `needs presenter`, `presenter interested`, `scheduled`, `notes ready`, `presented`.
- The product should avoid stale generic event text when a specific paper has already been selected.
- A simple status model may help organizers and members more than another reminder.

### G. Pre-Discussion Exists, But It Is Not Harvested

The channel has real pre-discussion signals: replies, reactions, threads, notes, jokes, skepticism, "this reminds me of..." comments, and "I saw this mentioned..." comments. These are valuable because they reveal what the audience wants explained. Today they are ephemeral unless an organizer manually reads the channel and synthesizes them.

Product implication:

- Slop should summarize thread questions and objections for the presenter.
- A good Paper Club prep artifact can be built from existing Discord replies before asking anyone to fill out a form.
- The Hub can show "community questions" and "why people care" alongside the scheduled paper.

### H. What We Might Be Missing

- The biggest missing lever may be social proof, not tooling. People may volunteer when they see others asking questions, prereading, and reacting.
- The most useful user might be the organizer, not the attendee. If Slop helps Vibhu/swyx make better nudges, the whole system may improve without asking members to adopt a new workflow.
- The Builders Club bot may work because Builders Club speakers already have a demo or project identity. Paper Club presenters need confidence and context first.
- The paper post/thread may matter more than the calendar event. Calendar state tells people when to show up; the thread tells them why to care.
- The "attend first, present later" path may be essential for growing new presenters.
- The role/channel culture already exists. The product should amplify this culture rather than create a parallel process.

### I. Channel-Informed Product Direction

The simplest maximally effective update is likely a Discord-native paper thread loop, scoped only to `#llm-paper-club`.

1. Someone shares a paper-ish link in `#llm-paper-club`.
2. Slop detects whether it is likely a paper, technical report, lab post, OpenReview/arXiv page, PDF, or social post about a paper.
3. If Discord already created a thread for the message, Slop uses that thread. If not, Slop creates a thread on the message.
4. Slop does a basic web/source lookup and posts a concise, accurate TLDR in the thread.
5. Slop posts one simple Discord UI button: `Present this at Paper Club`.
6. If someone clicks the button, Slop routes them into the same scheduling process as `/paper-club`, prefilled with the detected paper/title/link where possible.
7. Slop tracks whether a presenter is known, including presenter nominations that happen outside Slop.
8. The Hub stores the durable paper/session record, Discord original message link, Discord thread link, TLDR sources, presenter status, scheduled event link, and eventual recording.

This keeps the flow focused on the actual conversion: a paper gets shared, the thread gets useful context, and anyone willing to present can immediately schedule through the existing Paper Club path.

## 6. Agreed V1 Process

This is the current preferred implementation direction.

### A. Detect Paper-Ish Shares In Paper Club Only

Slop should passively watch `#llm-paper-club` only. It should not scan general channels.

A candidate can come from:

- arXiv links,
- OpenReview links,
- PDF links,
- lab blog posts,
- technical report pages,
- X/Twitter posts about papers,
- Bluesky posts about papers,
- GitHub repos that clearly point at a paper or technical report.

Do not treat every website URL as a candidate. The first filter should be conservative: "is this plausibly a paper or paper discussion?"

### B. Reuse Existing Threads Before Creating New Ones

Discord already appears to create threads for some social posts, especially tweets. Slop should not duplicate those threads.

Thread behavior:

1. If the original message already has a thread, post into that thread.
2. If it does not have a thread, create one on the original message.
3. Store both the original message ID and thread ID.
4. Never create a second Slop thread for the same message.

### C. Post One Simple Button Message

In Discord, a "button" means an actual clickable bot UI component under Slop's message, similar to a cleaner reaction. When clicked, Discord sends Slop an interaction with the user ID and button ID.

The v1 Slop message should be close to:

```text
Paper Club candidate: [title or link]

TLDR:
- [one short accurate sentence]
- [one short accurate sentence]
- Sources: [paper/source links]

Want to present this at Paper Club?

[Present this at Paper Club]
```

Button meaning:

- `Present this at Paper Club`: "I want to schedule myself to present this paper." Clicking starts the same scheduling process as `/paper-club`, using this candidate paper as context.

Avoid extra buttons in v1. Do not add `Want this covered`, `I'd read this`, `I have a question`, `Show context`, or `Maybe I can present` yet. Members can ask questions by replying in the thread.

### D. Add A Short Accurate Web TLDR

Before asking anyone to present, Slop should give the thread a tiny amount of context.

The TLDR must be simple and source-grounded:

- 2-3 bullets max,
- no speculative claims,
- cite the paper/source URLs used,
- prefer metadata/abstract from the original source over generic web summaries,
- if Slop cannot verify enough, say that instead of inventing a summary.

For arXiv/OpenReview/PDF/lab pages, the source itself may be enough. For X/Twitter or Bluesky posts, Slop should follow the linked paper/source if present; if the post does not expose a verifiable paper/source, Slop should keep the TLDR cautious.

### E. Route Presenter Intent Into `/paper-club`

Clicking `Present this at Paper Club` should not create a separate presenter flow.

It should start the existing `/paper-club` scheduling process with the paper candidate already attached:

- paper URL prefilled,
- paper title prefilled when known,
- source Discord thread stored,
- member identity reused from the clicker,
- date selection and final scheduling handled by the current `/paper-club` flow.

This keeps one scheduling system instead of creating a second path.

### F. Track Presenter State Even When It Happens Outside Slop

People already nominate presenters manually in Discord and Luma, often without using Slop. Slop must not assume "no Slop click" means "no presenter".

V1 should support at least one simple way to mark a presenter after the fact:

- a command such as `/paper-presenter @user`, or
- a natural-language mention such as `Slop, @user is presenting this`, if reliable enough.

Future inference can watch for organizer messages like "X is covering this" or Luma titles/descriptions, but manual marking is the safer first step.

Candidate state should stay simple:

- `candidate`
- `needs presenter`
- `presenter known`
- `scheduled`
- `presented`

### G. Ask For A Presenter Only When One Is Missing

If a candidate has no known presenter after a reasonable delay, Slop can ask in the thread:

```text
Still needs someone to walk this through at Paper Club.

No polished slides needed.

[Present this at Paper Club]
```

This should happen in the thread, not as a broad channel blast. It should not repeat aggressively.

## 7. Research-Informed Design Principles

- **Discord first, Hub second:** collect intent in Discord; use the Hub for persistence, browsing, and organizer review.
- **One-tap before form-fill:** ask for a click/reaction before asking for paper details or presenter prep.
- **Paper thread as the social object:** every serious paper candidate should have one discussion home.
- **Visible interest beats private scheduling:** organizers need to see momentum, not just calendar slots.
- **Facilitate, don't spam:** Slop should ask short prompts, summarize responses, and invite next actions.
- **Opt-in audience:** Paper Club nudges should target people who opted in or interacted with a paper.
- **One scheduling path:** presenter intent should route into the existing `/paper-club` scheduling flow, not a parallel workflow.
- **Accurate before clever:** the first TLDR should be source-grounded, short, and cautious.
- **Do not assume Builders Club mechanics imply Paper Club motivation:** reuse proven Discord patterns, but solve the Paper Club-specific activation problem.
- **Recruiting support over recruiting replacement:** Slop should surface good human nudges rather than pretending presenter recruitment can be fully automated.
- **Reuse existing Discord threads:** if Discord already created the thread, Slop should attach to it instead of creating another one.

## 8. Initial Product Bets

These are intentionally high-level. Pick one later.

### Bet 1: The Paper Queue

A shared queue of suggested papers with lightweight interest signals and presenter status. This helps members see what is alive and helps organizers recruit.

### Bet 2: The Pre-Read Prompt

When a paper is scheduled or proposed, Slop starts a short Discord prompt that asks members what they want explained. This creates discussion without asking anyone to learn a new workflow.

### Bet 3: The Presenter Assist

When someone volunteers, Slop routes them into `/paper-club` with the paper already attached. Deeper prep scaffolding is not v1.

### Bet 4: The Organizer Digest

Slop periodically gives organizers a compact digest: papers with interest, missing presenters, likely good volunteers, and suggested nudges. This may be the highest leverage if member participation is initially low.

### Bet 5: The Paper Club Home

The Hub gets a simple Paper Club view that shows upcoming sessions, candidate papers, presenter status, and recent discussion links. This makes the system feel real and persistent.

### Bet 6: The One-Message Paper Prompt

Slop posts a single structured message for a candidate paper with a short source-grounded TLDR and one Discord button: `Present this at Paper Club`. This is the smallest Discord-native loop that can turn paper interest into scheduling.

### Bet 7: The Builders Club Pattern Audit

Before implementation, inspect the AI in Action Builders Club bot/channel flow and identify why people actually use it. Separate reusable mechanics from community-specific motivation. Use that comparison to avoid building a Paper Club feature that only copies the surface behavior of a working Builders Club flow.

### Bet 8: The Organizer Nudge Digest

Slop summarizes recent paper-channel activity into a short organizer note: papers with visible interest, people who might be worth nudging, open questions from the thread, stale scheduled events, and the next concrete action. This is not v1 if it risks annoying organizers, but remains a likely follow-up once the paper-thread loop is proven.

### Bet 9: Prefilled Paper Club Scheduling

Members can move from a candidate thread directly into scheduling without re-entering paper details. In v1 this is the `Present this at Paper Club` button feeding the existing `/paper-club` flow.

### Bet 10: Passive Presenter State Detection

Slop watches for presenter nominations that happen outside Slop, such as organizer messages, Luma updates, or direct thread replies. The safe first implementation should include manual presenter marking; automatic inference can follow once the patterns are clear.

## 9. Open Questions / Notes

- Data repair note, 2026-04-29: the existing wiki-base Paper Club event data is not reliable enough for automation. Paper Club runs weekly, but the DB has missing weekly rows, stale scheduled rows, wrong dates from YouTube upload/ingestion timestamps, and missing presenter metadata. See `docs/development/paper-club-data-audit-2026-04-29.md` for the current date-to-paper-to-presenter mapping and repair plan.
- Is the highest leverage target attendees, organizers, or presenters?
- Should this live primarily in Discord, the Hub, or both?
- What exact URLs count as paper-ish in v1?
- Should Slop detect X/Twitter and Bluesky links only when the text clearly mentions a paper, arXiv, OpenReview, PDF, or technical report?
- What is the exact copy for the Slop candidate message?
- What web/source lookup is reliable enough for the first TLDR?
- What should Slop do when it cannot verify a paper summary from authoritative sources?
- How should the `Present this at Paper Club` button hand off into the existing `/paper-club` flow: create an internal scheduling session directly, or invoke a shared scheduling service with prefilled candidate context?
- What is the safest manual command for marking a presenter who was nominated outside Slop?
- Should Slop ask for a presenter after a time delay, after interest exists, or only when a scheduled Paper Club has no presenter?
- Should Slop infer paper interest from normal conversation, or should members explicitly submit/signal it?
- What kind of organizer signal would Swyx/Vibhu actually use each week?
- What specifically makes the AI in Action Builders Club bot work: channel culture, presenter motivation, command UX, reminders, organizer nudges, or the nature of demo-based talks?
- Which parts of that Builders Club flow should Paper Club reuse, and which parts are misleading because papers require prereading/prep?
- What makes a volunteer more likely to present: public encouragement, private nudge, prep help, social proof, or an obvious paper queue?
- What would make the session better: more prereading, better presenter prep, better questions, or better matching between paper/topic and presenter?
- What is the smallest success case: one proposed paper gets visible interest, one person volunteers, and the organizer has less manual follow-up.
- What can Slop safely infer from normal paper-channel activity, and what should require an explicit button/click?
- Should "maybe presenter" signals be public social proof or private organizer signal?
- How should stale/mixed Luma state be corrected when a paper and presenter are already known?
- Can Slop identify the canonical discussion thread for a paper without creating duplicates?

## 10. Non-Goals For Now

- Full event-management replacement for Luma/Discord.
- Complex voting, reputation, or gamification.
- A complete paper database independent of Paper Club usage.
- Automated presenter assignment.
- Building multiple surfaces before one simple loop proves useful.
- Scanning all Discord channels for papers.
- Treating every shared URL as a Paper Club candidate.
- Sending organizer digests in v1.
- DMing presenters in v1.
- Building a second presenter scheduling process outside `/paper-club`.

---

**When complete:** Add `## COMPLETED` header with date and summary, then move to `docs/development/completed-prds/`.
