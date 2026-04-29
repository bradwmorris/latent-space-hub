# Paper Club Data Audit — 2026-04-29

Status: working audit for repairing Paper Club session data in the LS Wiki-Base.

## Why This Exists

Paper Club happens every week. The current database does not reflect that reliably: some rows use YouTube upload or ingestion dates instead of session dates, several weekly sessions are missing, and presenter metadata is often empty or stale.

Primary evidence used in this pass:

- Luma calendar feed for Latent.Space weekly event dates and titles.
- Luma event pages/descriptions for presenters and paper links.
- YouTube recording metadata for uploaded recordings and presenter descriptions.
- Discord `#llm-paper-club` visible channel evidence for the 2026-04-29 DeepSeek session and earlier Apr 1/Apr 2 Composer 2 context.
- Existing backlog notes in `docs/development/prd-32-paper-club-scheduling.md` and `docs/development/prd-49-paper-club-paper-queue.md`.

## Recent Weekly Mapping

| Date | Topic / paper | Presenter(s) | Evidence | Confidence |
|---|---|---|---|---|
| 2025-12-24 | Does Reinforcement Learning Really Incentivize Reasoning Capacity in LLMs Beyond the Base Model? | Frankie Liu | Luma description says Frankie Liu will present; YouTube description repeats that. Luma: https://luma.com/xqmx4hu1. Source: https://openreview.net/forum?id=4OsgYD7em5. | High |
| 2025-12-31 | Show-o2: Improved Native Unified Multimodal Models | Hexie Li | Luma description says Hexie Li is closing out 2025 with this paper. Luma: https://luma.com/xi94v1mt. Source: https://arxiv.org/abs/2506.15564. | High |
| 2026-01-07 | Can LLMs Predict Their Own Failures? Self-Awareness via Internal Circuits | Vibhu Sapra | Luma description says Vibhu will cover. Luma: https://luma.com/uipiztbk. Source: https://huggingface.co/papers/2512.20578. | High |
| 2026-01-14 | LTX-2: Efficient Joint Audio-Visual Foundation Model | Vibhu Sapra | Luma description says Vibhu will take us through it. Luma: https://luma.com/ocj5smv5. Source: https://arxiv.org/abs/2601.03233. | High |
| 2026-01-21 | Anthropic's Assistant Axis | Vibhu Sapra | Luma description says Vibhu will cover. Luma: https://luma.com/ukihj47q. Source: https://www.anthropic.com/research/assistant-axis. | High |
| 2026-01-28 | Recursive Language Models; Meta Confucius Code Agent | Raphael Kalandadze | Luma description says Raphael Kalandadze will go over these papers. Luma: https://luma.com/n20lzrxt. Source: https://arxiv.org/pdf/2512.10398. | High |
| 2026-02-04 | Kimi K2.5 Tech Report + Alec Radford on Data Filtering | Unknown / volunteer not captured | Luma still says volunteers needed; DB has separate Kimi/Data rows, but no presenter. Luma: https://luma.com/1glg2z19. Sources: https://github.com/MoonshotAI/Kimi-K2.5/blob/master/tech_report.pdf and https://arxiv.org/abs/2601.21571. | Gap |
| 2026-02-11 | LLaDA 2.1 + RL via Self-Distillation + Generative Meta-Model | Ted Kyi; Vibhu Sapra | Luma says Ted covers LLaDA/RL Self-Distillation and Vibhu covers Generative Meta-Model; YouTube says Ted Kyi presents SDPO. Luma: https://luma.com/hgw60drj. Sources: https://huggingface.co/papers/2602.08676, https://arxiv.org/pdf/2601.20802, and https://arxiv.org/abs/2602.06964. | High |
| 2026-02-18 | Rubric Based RL survey + Alec Radford Generative Meta-Model | swyx; Vibhu Sapra | Luma names swyx for Rubric RL and Vibhu for the generative meta-model. Luma: https://luma.com/ezca5csv. Sources: https://cameronrwolfe.substack.com/p/rubric-rl and https://generative-latent-prior.github.io/. | High |
| 2026-02-25 | Midtraining Bridges Pretraining and Posttraining Distributions | Vibhu Sapra | Luma and YouTube descriptions say Vibhu covered/presented. Luma: https://luma.com/8qkhhbam. Source: https://arxiv.org/abs/2510.14865. | High |
| 2026-03-04 | Discovering Multiagent Learning Algorithms with Large Language Models / AlphaEvolve | ankitmaloo | Luma says `@ankitmaloo` will cover; YouTube says ankit presents. Luma: https://luma.com/mbamhb61. Source: https://arxiv.org/abs/2602.16928. | High |
| 2026-03-11 | Moltbook analysis + Persona Selection | Yikes / yikesawjeez | Luma says Yikes will cover; DB has yikesawjeez. Luma: https://luma.com/l932tn90. Sources: https://arxiv.org/abs/2602.13284 and https://www.anthropic.com/research/persona-selection-model. | High |
| 2026-03-18 | Karpathy Autoresearch, ShinkaEvolve, TextToLORA | Vibhu Sapra; Brad Morris | Luma says Vibhu covers autoresearch and Brad covers ShinkaEvolve/TextToLORA. Luma: https://luma.com/bjew9bmb. Sources: https://x.com/karpathy/status/2030371219518931079 and https://arxiv.org/pdf/2509.19349. | High |
| 2026-03-25 | Moonshot Attention Residuals + Cursor Composer 2 | Ted Kyi | Luma says Ted will cover Attention Residuals; Composer 2 if time allowed. Luma: https://luma.com/9i2i32nv. Source: https://arxiv.org/abs/2603.15031. | High |
| 2026-04-01 | Composer 2 + Claude Code Leaks | Vibhu Sapra (likely) | Discord observation from Apr 2: Vibhu said "today we're gonna cover the cursor composer 2 technical report"; Luma does not name a presenter. Luma: https://luma.com/zq5q8lrz. Source: https://www.latent.space/p/ainews-the-claude-code-source-leak. | Medium |
| 2026-04-08 | MSA: Memory Sparse Attention for Efficient End-to-End Memory Model Scaling to 100M Tokens | Keith; Dio | Luma description says Keith and Dio covering. Luma: https://luma.com/azbqwtsk. Source: https://huggingface.co/papers/2603.23516. | High |
| 2026-04-15 | Agents of Chaos | Sparsh | Luma says Sparsh is covering. DB has an old scheduled row with a Discord username; likely needs normalization. Luma: https://luma.com/u5fvjas6. Source: https://arxiv.org/abs/2602.20021. | High |
| 2026-04-22 | Self-Distilled RLVR paper | Vibhu Sapra | Luma says Vibhu will present. Luma: https://luma.com/smhmwdku. Source: https://arxiv.org/abs/2604.03128. | High |
| 2026-04-29 | DeepSeek V4 Pro/Flash | Eugene Cheah / picocreator | Discord Apr 28 announcement says picocreator/Eugene is covering DeepSeek this week; Luma title confirms topic. Luma: https://luma.com/dd32jzvx?tk=pmLiAb. Source: https://api-docs.deepseek.com/news/news260424. | High |

## Database Problems Found

- 2026 Paper Club event coverage is incomplete. There should be one weekly event row per Wednesday Paper Club.
- Several event rows use upload or ingestion dates instead of the actual Paper Club session date. Examples: Assistant Axis, Recursive Language Models, and RL via Self-Distillation are all dated 2026-02-13 in the DB but Luma places them on 2026-01-21, 2026-01-28, and 2026-02-11.
- The March 2026 recording rows imported on 2026-03-18 have event_date values that look like ingestion timestamps, not session dates.
- 2026-03-18 has a wrong/compressed event row: the DB says Brad covered Sakana and links `recording_node_id=4488`, but Luma says the session was Vibhu on Karpathy Autoresearch plus Brad on ShinkaEvolve/TextToLORA.
- 2026-02-04 is represented as split Kimi/Data Filtering rows, but Luma says the weekly session was one Paper Club: Kimi K2.5 Tech Report + Alec Radford on Data Filtering. Presenter still needs Discord confirmation.
- 2026-04-15 has a scheduled Agents of Chaos row in the DB, but Luma says the presenter is Sparsh and the event is now past/completed.
- 2026-04-29 DeepSeek V4 Pro/Flash is present in Luma and Discord but not represented as a scheduled Paper Club event in the DB, except for the unrelated Slop candidate test node for TRINITY.

## Repair Approach

Conservative repair target:

1. Treat Luma as the canonical weekly calendar source for session dates and topic titles.
2. Treat Luma descriptions and YouTube descriptions as presenter evidence when they explicitly say "X will cover/present".
3. Treat Discord as the strongest source for current ad-hoc presenter announcements, especially when Luma text is generic.
4. Repair event nodes first, because those drive scheduling, reminders, and upcoming/past Paper Club views.
5. Do not delete duplicate or bad rows without an explicit cleanup step; mark or supersede them only after mapping is stable.
6. Keep recording-node repairs separate where YouTube metadata conflicts with Luma calendar state.

## Open Gaps

- 2026-02-04 presenter is still not captured in Luma; Discord history likely has the answer.
- 2026-04-01 presenter is likely Vibhu based on Discord context, but Luma does not name a presenter.
- Agents of Chaos has conflicting signals between Luma Apr 15/Sparsh and an uploaded YouTube recording titled Mar 12/Jake Cosme. Do not link that recording to Apr 15 without further evidence.
- Several older 2025 rows are also date-shifted and should be repaired in a second pass using the same Luma feed.
