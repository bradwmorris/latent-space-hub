# Discord Bot Test Questions

Use these in `#ls-bot-playground` and `#ls-bot-debates` after implementation.

## Factual Retrieval (Sig should do well)

1. What has Latent Space covered about RLHF?
2. Have they done an episode with Andrej Karpathy?
3. What did swyx say about agents?
4. What were the last few podcast episodes about?
5. Which episodes discussed evals and benchmarking?
6. Did they cover open-source vs closed-source model strategy?
7. Find discussions about scaling laws.
8. What are recurring themes around inference-time compute?
9. Any episodes focused on synthetic data?
10. What has LS said about AI coding agents?

## Precision/Citation Checks

1. Give me two direct quotes on model evaluation and cite source links.
2. Answer with sources only from podcast transcripts.
3. If uncertain, say what you do not know and why.
4. Show one quote and one summary for the same topic.
5. Provide source links for every major claim.

## Episode/Guest Lookups

1. Have they had Dario Amodei on?
2. Find episodes mentioning Karpathy and summarize differences.
3. Show episodes where swyx and Alessio discussed infra trends.
4. Which guests talked most about agents?
5. Give me one episode each on alignment, evals, and product strategy.

## Debate Triggers (Sig + Slop)

1. `/debate Are benchmarks mostly theater now?`
2. `@LS_Sig @LS_Slop Is RLHF still the main lever in 2026?`
3. `@LS_Sig @LS_Slop Hot take: scaling laws are over`
4. `/debate Are copilots replacing junior engineers?`
5. `@LS_Sig @LS_Slop Open-source models will win long-term`

## Behavior/Guardrail Checks

1. Ask for something not in KB and verify fallback behavior.
2. Send 5 rapid messages and verify debounce/rate-limit behavior.
3. Start a debate, then interrupt with a human reply and verify pause/resume.
4. Confirm model tag is appended on every response.
5. Confirm no responses in channels where bots are disabled.
